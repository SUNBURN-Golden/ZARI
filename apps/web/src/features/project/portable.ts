import type { ProtocolRequest, ProtocolResponse } from '../../contracts/generated/dto';
import {
  SCHEMA_VERSION,
  readInventoryLedgerRow,
  type InventoryLedgerRow,
} from '../../persistence/db';
import { EXPORT_VERSION, exportProject, type ProjectExport } from '../../persistence/export';
import type { ProjectRepository } from '../../persistence/repository';
import type { ProbeClient } from '../../worker/client';
import { WORKER_BUILD_ID } from '../../worker/client';
import {
  commitProjectImport,
  stageProjectImport,
  type ImportSummary,
  type StageImportResult,
  type StagedImport,
  type TransferIssue,
} from './transfer';

/** Same ceiling as Rust `MAX_BUNDLE_BYTES`. Base64 of this stays under the worker message cap. */
export const PORTABLE_MAX_BUNDLE_BYTES = 1_572_864;

export interface PortableInclusion {
  project: boolean;
  observations: boolean;
  catalog: boolean;
  snapshotAttachments: boolean;
}

export const DEFAULT_PORTABLE_INCLUSION: PortableInclusion = {
  project: true,
  observations: true,
  catalog: true,
  snapshotAttachments: true,
};

const issue = (fieldPath: string, code: string): TransferIssue => ({ fieldPath, code });

type BuildCommand = Extract<ProtocolRequest['command'], { kind: 'buildPortableBundle' }>;
type InspectCommand = Extract<ProtocolRequest['command'], { kind: 'inspectPortableBundle' }>;
type BuiltEvent = Extract<ProtocolResponse['event'], { kind: 'portableBundleBuilt' }>;
type InspectEvent = Extract<ProtocolResponse['event'], { kind: 'portableBundleInspected' }>;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

export function isZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Member JSON for one inclusion choice. Photo bytes are never copied.
 * The shared owned library is not a member.
 */
export async function portableMemberJson(
  repo: ProjectRepository,
  projectId: string,
  buildId: string,
  inclusion: PortableInclusion,
): Promise<
  | { status: 'ready'; command: Omit<BuildCommand, 'kind'>; exportedAt: string }
  | { status: 'rejected'; issues: TransferIssue[] }
> {
  let bundle;
  try {
    bundle = await repo.loadBundle(projectId);
  } catch (error) {
    return {
      status: 'rejected',
      issues: [issue('project', error instanceof Error ? error.message : 'record_corrupt')],
    };
  }
  const doc = await exportProject(repo, bundle, buildId, 'standard');
  const ledger = inclusion.observations ? await repo.getInventoryLedger(projectId) : null;
  const command = {
    exportedAt: doc.exportedAt,
    inclusion,
    projectJson: inclusion.project
      ? JSON.stringify({
          project: doc.project,
          draft: doc.draft,
          actionProgress: doc.actionProgress,
        })
      : '',
    observationsJson: inclusion.observations
      ? JSON.stringify({ inputs: doc.inputs, ledger })
      : '',
    catalogJson: inclusion.catalog ? JSON.stringify({ catalogs: doc.catalogs }) : '',
    snapshotsJson: inclusion.snapshotAttachments
      ? JSON.stringify({ snapshots: doc.snapshots })
      : '',
    attachmentsJson: inclusion.snapshotAttachments
      ? JSON.stringify({ attachments: doc.attachments })
      : '',
  };
  return { status: 'ready', command, exportedAt: doc.exportedAt };
}

export async function buildPortableBundle(
  client: ProbeClient,
  command: Omit<BuildCommand, 'kind'>,
): Promise<
  | { status: 'ready'; zip: Uint8Array; memberCount: number }
  | { status: 'rejected'; issues: TransferIssue[] }
  | { status: 'unavailable'; error: string }
> {
  let event: ProtocolResponse['event'];
  try {
    event = await client.systemRequest({ kind: 'buildPortableBundle', ...command });
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === 'message_too_large') {
      return { status: 'rejected', issues: [issue('file', 'import_too_large')] };
    }
    return { status: 'unavailable', error: code };
  }
  if (event.kind !== 'portableBundleBuilt') {
    return { status: 'unavailable', error: 'unexpected_worker_event' };
  }
  return finishBuild(event);
}

function finishBuild(
  event: BuiltEvent,
):
  | { status: 'ready'; zip: Uint8Array; memberCount: number }
  | { status: 'rejected'; issues: TransferIssue[] } {
  if (!event.reply.accepted || event.reply.zipBase64.length === 0) {
    return {
      status: 'rejected',
      issues: event.reply.issues.map((item) => issue(item.fieldPath, item.code)),
    };
  }
  return {
    status: 'ready',
    zip: base64ToBytes(event.reply.zipBase64),
    memberCount: event.reply.memberCount,
  };
}

/**
 * Inspect a zip, then stage through the existing record verifier.
 * A rejected inspect does not call `stageProjectImport` and writes nothing.
 */
export async function stagePortableBundle(
  bytes: Uint8Array,
  repo: ProjectRepository,
  client: ProbeClient,
): Promise<StageImportResult> {
  if (bytes.length > PORTABLE_MAX_BUNDLE_BYTES) {
    return { status: 'rejected', issues: [issue('file', 'import_too_large')] };
  }
  let event: ProtocolResponse['event'];
  try {
    const command: InspectCommand = {
      kind: 'inspectPortableBundle',
      zipBase64: bytesToBase64(bytes),
    };
    event = await client.systemRequest(command);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === 'message_too_large') {
      return { status: 'rejected', issues: [issue('file', 'import_too_large')] };
    }
    return { status: 'unavailable', error: code };
  }
  if (event.kind !== 'portableBundleInspected') {
    return { status: 'unavailable', error: 'unexpected_worker_event' };
  }
  return stageInspected(event, repo, client);
}

async function stageInspected(
  event: InspectEvent,
  repo: ProjectRepository,
  client: ProbeClient,
): Promise<StageImportResult> {
  if (!event.reply.accepted) {
    return {
      status: 'rejected',
      issues: event.reply.issues.map((item) => issue(item.fieldPath, item.code)),
    };
  }
  if (!event.reply.inclusion.project || event.reply.projectJson.length === 0) {
    return { status: 'rejected', issues: [issue('project', 'project_required')] };
  }
  let projectPart: { project: unknown; draft: unknown; actionProgress: unknown[] };
  let observations: { inputs: unknown[]; ledger: unknown };
  let catalogs: { catalogs: unknown[] };
  let snapshots: { snapshots: unknown[] };
  let attachments: { attachments: unknown[] };
  try {
    projectPart = JSON.parse(event.reply.projectJson) as typeof projectPart;
    observations = event.reply.inclusion.observations
      ? (JSON.parse(event.reply.observationsJson) as typeof observations)
      : { inputs: [], ledger: null };
    catalogs = event.reply.inclusion.catalog
      ? (JSON.parse(event.reply.catalogJson) as typeof catalogs)
      : { catalogs: [] };
    snapshots = event.reply.inclusion.snapshotAttachments
      ? (JSON.parse(event.reply.snapshotsJson) as typeof snapshots)
      : { snapshots: [] };
    attachments = event.reply.inclusion.snapshotAttachments
      ? (JSON.parse(event.reply.attachmentsJson) as typeof attachments)
      : { attachments: [] };
  } catch {
    return { status: 'rejected', issues: [issue('file', 'invalid_json')] };
  }
  const envelope: ProjectExport = {
    exportVersion: EXPORT_VERSION,
    kind: 'standard',
    producer: { app: 'zari-web', schemaVersion: SCHEMA_VERSION, buildId: WORKER_BUILD_ID },
    exportedAt: event.reply.exportedAt,
    project: projectPart.project,
    draft: projectPart.draft,
    inputs: observations.inputs,
    snapshots: snapshots.snapshots,
    actionProgress: projectPart.actionProgress,
    catalogs: catalogs.catalogs,
    ownedContainers: [],
    attachments: attachments.attachments,
    quarantine: [],
    excluded: [
      'transient-logs',
      'photo-bytes',
      'location',
      'personal-data',
      'owned-library',
    ],
  };
  const staged = await stageProjectImport(JSON.stringify(envelope), repo, client);
  if (staged.status !== 'staged') return staged;
  const withLedger = attachLedger(staged.staged, observations.ledger);
  if (withLedger.status === 'rejected') return withLedger;
  const summary: ImportSummary = {
    ...staged.summary,
    portable: true,
    canonicalSnapshotId: event.reply.canonicalSnapshotId,
  };
  return { status: 'staged', staged: withLedger.staged, summary };
}

function attachLedger(
  staged: StagedImport,
  ledger: unknown,
):
  | { status: 'staged'; staged: StagedImport }
  | { status: 'rejected'; issues: TransferIssue[] } {
  if (ledger === null || ledger === undefined) {
    return { status: 'staged', staged: { ...staged, ledger: null } };
  }
  let row: InventoryLedgerRow;
  try {
    row = readInventoryLedgerRow(ledger);
  } catch {
    return { status: 'rejected', issues: [issue('ledger', 'record_corrupt')] };
  }
  return { status: 'staged', staged: { ...staged, ledger: row } };
}

export async function commitStagedImport(
  repo: ProjectRepository,
  staged: StagedImport,
) {
  return commitProjectImport(repo, staged);
}
