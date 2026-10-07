import type { Diagnostic, VerifiableRecordDto } from '../../contracts/generated/dto';
import {
  SCHEMA_VERSION,
  readActionProgressRow,
  readCatalogRow,
  readDraftRow,
  readInputRow,
  readProjectRow,
  readSnapshotRow,
  type ActionProgressRow,
  type AttachmentRow,
  type CatalogRow,
  type DraftRow,
  type InputRow,
  type ProjectRow,
  type SnapshotRow,
} from '../../persistence/db';
import { EXPORT_VERSION } from '../../persistence/export';
import type { DuplicateStage, ProjectRepository } from '../../persistence/repository';
import type { ProbeClient } from '../../worker/client';

/**
 * PERSISTENCE §7 project import (Ticket 009). The file is untrusted input:
 * bounded parse → envelope shape → per-row envelope guards → cross-reference
 * checks → Rust `verifyRecord` (structural domain validation + claimed-digest
 * verification) → explicit user review → one atomic commit under a fresh
 * project id. Nothing here evaluates code, fetches a URL, overwrites an
 * existing project, or touches the global owned-container library/quarantine.
 */

export interface TransferIssue {
  fieldPath: string;
  code: string;
}

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_DEPTH = 32;
export const IMPORT_MAX_ROWS = {
  inputs: 256,
  snapshots: 256,
  actionProgress: 4096,
  catalogs: 64,
  attachments: 64,
} as const;

/** Validated rows ready for the single commit transaction. */
export interface StagedImport {
  projectId: string;
  name: string;
  sourceProjectId: string;
  exportedAt: string;
  project: Pick<
    ProjectRow,
    'currentInputRevision' | 'currentInputDigest' | 'accepted' | 'lastStep'
  >;
  draft: DraftRow | null;
  inputs: InputRow[];
  snapshots: SnapshotRow[];
  actionProgress: ActionProgressRow[];
  catalogs: CatalogRow[];
}

export interface ImportSummary {
  sourceProjectId: string;
  exportedAt: string;
  name: string;
  inputCount: number;
  snapshotCount: number;
  progressCount: number;
  catalogCount: number;
  syntheticCatalogCount: number;
  /** Attachment metadata rows listed in the file — bytes never import. */
  attachmentCount: number;
  acceptedBound: boolean;
  draftPresent: boolean;
}

export type StageImportResult =
  | { status: 'staged'; summary: ImportSummary; staged: StagedImport }
  | { status: 'rejected'; issues: TransferIssue[] }
  | { status: 'unavailable'; error: string };

const issue = (fieldPath: string, code: string): TransferIssue => ({
  fieldPath,
  code,
});

/** Iterative depth counter — bounded so a hostile file cannot overflow the stack. */
function jsonDepth(value: unknown): number {
  let max = 0;
  const stack: { v: unknown; d: number }[] = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (d > max) max = d;
    if (d > IMPORT_MAX_DEPTH) return max;
    if (Array.isArray(v)) for (const item of v) stack.push({ v: item, d: d + 1 });
    else if (typeof v === 'object' && v !== null)
      for (const item of Object.values(v)) stack.push({ v: item, d: d + 1 });
  }
  return max;
}

/** Minimal envelope shape before any row-level work. */
function envelopeShape(raw: unknown): {
  ok: boolean;
  issues: TransferIssue[];
  value?: {
    exportVersion: number;
    kind: string;
    producer: { schemaVersion?: unknown };
    project: unknown;
    draft: unknown;
    inputs: unknown[];
    snapshots: unknown[];
    actionProgress: unknown[];
    catalogs: unknown[];
    attachments: unknown[];
    exportedAt: string;
  };
} {
  const issues: TransferIssue[] = [];
  const doc = raw as Record<string, unknown> | null;
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc))
    return { ok: false, issues: [issue('file', 'invalid_envelope')] };
  const version = doc['exportVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    issues.push(issue('exportVersion', 'invalid_envelope'));
  else if (version > EXPORT_VERSION)
    issues.push(issue('exportVersion', 'unsupported_schema'));
  if (doc['kind'] !== 'standard') issues.push(issue('kind', 'recovery_not_importable'));
  const producer = doc['producer'] as { schemaVersion?: unknown } | undefined;
  if (
    typeof producer !== 'object' ||
    producer === null ||
    typeof producer.schemaVersion !== 'number'
  )
    issues.push(issue('producer', 'invalid_envelope'));
  else if (producer.schemaVersion > SCHEMA_VERSION)
    issues.push(issue('producer.schemaVersion', 'unsupported_schema'));
  if (typeof doc['exportedAt'] !== 'string')
    issues.push(issue('exportedAt', 'invalid_envelope'));
  for (const key of ['inputs', 'snapshots', 'actionProgress', 'catalogs'] as const) {
    if (!Array.isArray(doc[key])) issues.push(issue(key, 'invalid_envelope'));
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    issues: [],
    value: {
      exportVersion: version as number,
      kind: doc['kind'] as string,
      producer: producer as { schemaVersion?: unknown },
      project: doc['project'],
      draft: doc['draft'],
      inputs: doc['inputs'] as unknown[],
      snapshots: doc['snapshots'] as unknown[],
      actionProgress: doc['actionProgress'] as unknown[],
      catalogs: doc['catalogs'] as unknown[],
      attachments: Array.isArray(doc['attachments']) ? (doc['attachments'] as unknown[]) : [],
      exportedAt: doc['exportedAt'] as string,
    },
  };
}

/**
 * Stage an exported project document. Returns the fully validated row set or
 * a rejection explaining the first problems found — a rejected stage inserts
 * nothing, so an unsupported or malicious file cannot destroy old projects.
 */
export async function stageProjectImport(
  text: string,
  repo: ProjectRepository,
  client: ProbeClient,
): Promise<StageImportResult> {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES)
    return {
      status: 'rejected',
      issues: [issue('file', 'import_too_large')],
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'rejected', issues: [issue('file', 'invalid_json')] };
  }
  if (jsonDepth(parsed) > IMPORT_MAX_DEPTH)
    return { status: 'rejected', issues: [issue('file', 'too_deep')] };
  const env = envelopeShape(parsed);
  if (!env.ok || !env.value) return { status: 'rejected', issues: env.issues };
  const doc = env.value;
  const issues: TransferIssue[] = [];
  for (const [key, rows, max] of [
    ['inputs', doc.inputs, IMPORT_MAX_ROWS.inputs],
    ['snapshots', doc.snapshots, IMPORT_MAX_ROWS.snapshots],
    ['actionProgress', doc.actionProgress, IMPORT_MAX_ROWS.actionProgress],
    ['catalogs', doc.catalogs, IMPORT_MAX_ROWS.catalogs],
    ['attachments', doc.attachments, IMPORT_MAX_ROWS.attachments],
  ] as const) {
    if (rows.length > max) issues.push(issue(key, 'import_too_large'));
  }
  let project: ProjectRow | null = null;
  try {
    project = readProjectRow(doc.project);
  } catch {
    issues.push(issue('project', 'record_corrupt'));
  }
  let draft: DraftRow | null = null;
  if (doc.draft !== null && doc.draft !== undefined) {
    try {
      draft = readDraftRow(doc.draft);
    } catch {
      issues.push(issue('draft', 'record_corrupt'));
    }
  }
  const inputs: InputRow[] = [];
  const inputKeys = new Set<string>();
  for (const [i, raw] of doc.inputs.entries()) {
    try {
      const row = readInputRow(raw);
      const key = row.inputRevision;
      if (inputKeys.has(key)) {
        issues.push(issue(`inputs.${i}`, 'duplicate_id'));
        continue;
      }
      inputKeys.add(key);
      inputs.push(row);
    } catch {
      issues.push(issue(`inputs.${i}`, 'record_corrupt'));
    }
  }
  const snapshots: SnapshotRow[] = [];
  const snapshotKeys = new Set<string>();
  for (const [i, raw] of doc.snapshots.entries()) {
    try {
      const row = readSnapshotRow(raw);
      const key = `${row.inputRevision}+${row.planSnapshotId}`;
      if (snapshotKeys.has(key)) {
        issues.push(issue(`snapshots.${i}`, 'duplicate_id'));
        continue;
      }
      snapshotKeys.add(key);
      snapshots.push(row);
    } catch {
      issues.push(issue(`snapshots.${i}`, 'record_corrupt'));
    }
  }
  const progress: ActionProgressRow[] = [];
  const progressKeys = new Set<string>();
  for (const [i, raw] of doc.actionProgress.entries()) {
    try {
      const row = readActionProgressRow(raw);
      const key = `${row.inputRevision}+${row.planSnapshotId}+${row.stepId}`;
      if (progressKeys.has(key)) {
        issues.push(issue(`actionProgress.${i}`, 'duplicate_id'));
        continue;
      }
      progressKeys.add(key);
      progress.push(row);
    } catch {
      issues.push(issue(`actionProgress.${i}`, 'record_corrupt'));
    }
  }
  const catalogs: CatalogRow[] = [];
  const catalogKeys = new Set<string>();
  for (const [i, raw] of doc.catalogs.entries()) {
    try {
      const row = readCatalogRow(raw);
      if (catalogKeys.has(row.catalogDigest)) continue; // same digest = same content
      catalogKeys.add(row.catalogDigest);
      catalogs.push(row);
    } catch {
      issues.push(issue(`catalogs.${i}`, 'record_corrupt'));
    }
  }
  const attachmentMeta: AttachmentRow[] = [];
  for (const raw of doc.attachments) {
    // Metadata-only entries: tolerate shape drift but never invent bytes.
    if (typeof raw === 'object' && raw !== null) attachmentMeta.push(raw as AttachmentRow);
  }
  if (issues.length > 0) return { status: 'rejected', issues };
  if (project === null)
    return { status: 'rejected', issues: [issue('project', 'record_corrupt')] };

  // Cross-reference checks — dangling references reject the whole import.
  const byProject = (pid: string, path: string) =>
    pid === project!.projectId ? null : issue(path, 'dangling_reference');
  for (const row of inputs) {
    const bad = byProject(row.projectId, `inputs.${row.inputRevision}`);
    if (bad) issues.push(bad);
  }
  for (const row of snapshots) {
    const bad = byProject(row.projectId, `snapshots.${row.planSnapshotId.slice(0, 12)}`);
    if (bad) issues.push(bad);
    if (!inputs.some((i) => i.inputRevision === row.inputRevision))
      issues.push(issue(`snapshots.${row.planSnapshotId.slice(0, 12)}`, 'dangling_reference'));
    if (row.snapshot.planSnapshotId !== row.planSnapshotId)
      issues.push(issue(`snapshots.${row.planSnapshotId.slice(0, 12)}`, 'digest_mismatch'));
  }
  for (const row of progress) {
    const bad = byProject(row.projectId, `actionProgress.${row.stepId}`);
    if (bad) issues.push(bad);
    if (
      !snapshots.some(
        (s) =>
          s.inputRevision === row.inputRevision &&
          s.planSnapshotId === row.planSnapshotId,
      )
    )
      issues.push(issue(`actionProgress.${row.stepId}`, 'dangling_reference'));
  }
  if (draft !== null && draft.projectId !== project.projectId)
    issues.push(issue('draft', 'dangling_reference'));
  const currentInput = inputs.find(
    (i) => i.inputRevision === project!.currentInputRevision,
  );
  if (project.currentInputDigest !== null) {
    if (!currentInput || currentInput.inputDigest !== project.currentInputDigest)
      issues.push(issue('project.currentInputRevision', 'dangling_reference'));
  }
  if (project.accepted !== null) {
    const bound = snapshots.some(
      (s) =>
        s.inputRevision === project!.accepted!.inputRevision &&
        s.planSnapshotId === project!.accepted!.planSnapshotId,
    );
    if (!bound) issues.push(issue('project.accepted', 'dangling_reference'));
  }
  // Every pinned catalog must arrive with the file or already exist locally.
  for (const row of inputs) {
    const digest = row.input.catalogPin.catalogDigest;
    if (catalogKeys.has(digest)) continue;
    const local = await repo.db.catalogs.get(digest).catch(() => undefined);
    if (local === undefined)
      issues.push(issue(`catalogs.${digest.slice(0, 12)}`, 'dangling_reference'));
  }
  if (issues.length > 0) return { status: 'rejected', issues };

  // Rust boundary: structural domain validation + claimed-digest checks.
  const verify = async (record: VerifiableRecordDto) => {
    const reply = await client.systemRequest({ kind: 'verifyRecord', record });
    if (reply.kind !== 'recordVerified') throw new Error('unexpected_worker_event');
    return reply;
  };
  const diagnostics: Diagnostic[] = [];
  const FATAL = new Set([
    'unexpected_worker_event',
    'worker_crashed',
    'worker_timeout',
    'worker_unavailable',
    'invalid_worker_message',
    'invalid_request_shape',
    'message_too_large',
  ]);
  try {
    for (const row of inputs) {
      const reply = await verify({
        kind: 'input',
        input: row.input,
        inputDigest: row.inputDigest,
      });
      if (!reply.verified) diagnostics.push(...reply.diagnostics);
    }
    for (const row of snapshots) {
      const reply = await verify({ kind: 'snapshot', snapshot: row.snapshot });
      if (!reply.verified) diagnostics.push(...reply.diagnostics);
    }
    for (const row of catalogs) {
      const reply = await verify({ kind: 'catalog', catalog: row.catalog });
      if (!reply.verified) diagnostics.push(...reply.diagnostics);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (FATAL.has(code)) return { status: 'unavailable', error: code };
    // The engine refused the record itself — a rejected import, not an outage.
    return { status: 'rejected', issues: [issue('record', code)] };
  }
  if (diagnostics.length > 0)
    return {
      status: 'rejected',
      issues: diagnostics.map((d) => issue(d.fieldPath, d.code)),
    };

  const name = project.name.slice(0, 4000);
  const staged: StagedImport = {
    projectId: crypto.randomUUID(),
    name: `${name} (가져옴)`,
    sourceProjectId: project.projectId,
    exportedAt: doc.exportedAt,
    project: {
      currentInputRevision: project.currentInputRevision,
      currentInputDigest: project.currentInputDigest,
      accepted: project.accepted,
      lastStep: project.lastStep,
    },
    draft,
    inputs,
    snapshots,
    actionProgress: progress,
    catalogs,
  };
  return {
    status: 'staged',
    staged,
    summary: {
      sourceProjectId: project.projectId,
      exportedAt: doc.exportedAt,
      name: project.name,
      inputCount: inputs.length,
      snapshotCount: snapshots.length,
      progressCount: progress.length,
      catalogCount: catalogs.length,
      syntheticCatalogCount: catalogs.filter(
        (c) => c.catalog.sourceKind === 'synthetic',
      ).length,
      attachmentCount: attachmentMeta.length,
      acceptedBound: project.accepted !== null,
      draftPresent: draft !== null,
    },
  };
}

/** Commit a staged import atomically; a failure inserts no half-project. */
export async function commitProjectImport(
  repo: ProjectRepository,
  staged: StagedImport,
): Promise<ProjectRow> {
  const at = new Date().toISOString();
  return repo.commitImport({
    projectId: staged.projectId,
    name: staged.name,
    importedFrom: {
      sourceProjectId: staged.sourceProjectId,
      exportedAt: staged.exportedAt,
    },
    project: staged.project,
    draft:
      staged.draft === null
        ? null
        : {
            schemaVersion: SCHEMA_VERSION,
            projectId: staged.projectId,
            generation: staged.draft.generation,
            editorSessionId: crypto.randomUUID(),
            baseInputRevision: staged.draft.baseInputRevision,
            form: staged.draft.form,
            validation: staged.draft.validation,
            updatedAt: at,
          },
    inputs: staged.inputs,
    snapshots: staged.snapshots,
    actionProgress: staged.actionProgress,
    catalogs: staged.catalogs,
  });
}

export type DuplicateResult =
  | { status: 'copied'; project: ProjectRow; excludedAttachmentIds: string[] }
  | { status: 'rejected'; issues: TransferIssue[] }
  | { status: 'unavailable'; error: string };

/**
 * Rust-check the staged rows, then insert them in one transaction. The
 * worker call finishes before `commitDuplicate`. A rejected check writes
 * nothing. Progress rows are not copied. Photo ids are returned so the
 * screen can say those bytes stayed on the source.
 */
export async function duplicateVerifiedProject(
  repo: ProjectRepository,
  client: ProbeClient,
  sourceId: string,
  name?: string,
): Promise<DuplicateResult> {
  let stage: DuplicateStage;
  try {
    stage = await repo.readDuplicateStage(sourceId);
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const verify = async (record: VerifiableRecordDto) => {
    const reply = await client.systemRequest({ kind: 'verifyRecord', record });
    if (reply.kind !== 'recordVerified') throw new Error('unexpected_worker_event');
    return reply;
  };
  const issues: TransferIssue[] = [];
  try {
    if (stage.input !== null) {
      const reply = await verify({
        kind: 'input',
        input: stage.input.input,
        inputDigest: stage.input.inputDigest,
      });
      if (!reply.verified) issues.push(issue('input', 'digest_mismatch'));
    } else if (stage.currentInputDigest !== null) {
      issues.push(issue('input', 'record_corrupt'));
    }
    if (stage.snapshot !== null) {
      const reply = await verify({ kind: 'snapshot', snapshot: stage.snapshot.snapshot });
      if (!reply.verified) issues.push(issue('snapshot', 'digest_mismatch'));
    }
    if (stage.catalog !== null) {
      const reply = await verify({ kind: 'catalog', catalog: stage.catalog.catalog });
      if (!reply.verified) issues.push(issue('catalog', 'digest_mismatch'));
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return { status: 'unavailable', error: code };
  }
  if (issues.length > 0) return { status: 'rejected', issues };
  try {
    const project = await repo.commitDuplicate(stage, name);
    return { status: 'copied', project, excludedAttachmentIds: stage.excludedAttachmentIds };
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
