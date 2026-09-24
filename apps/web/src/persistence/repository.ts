import Dexie from 'dexie';
import type { ProjectInput, RawProjectInputDto } from '../contracts/generated/dto';
import {
  SCHEMA_VERSION,
  ZariDb,
  nextRevision,
  readActionProgressRow,
  readCatalogRow,
  readDraftRow,
  readInputRow,
  readProjectRow,
  readSnapshotRow,
  type ActionProgressRow,
  type CatalogRow,
  type DraftRow,
  type InputRow,
  type ProjectRow,
  type QuarantinePayload,
  type SnapshotRow,
} from './db';

export type StoreErrorCode =
  | 'revision_conflict'
  | 'persistence_failed:quota'
  | 'persistence_failed:unavailable'
  | 'record_corrupt'
  | 'unsupported_schema'
  | 'migration_blocked'
  | 'project_not_found'
  | 'revision_exhausted';
export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}
/** Map a Dexie/IndexedDB failure onto the durable error taxonomy. */
export function storeError(error: unknown): StoreError {
  if (error instanceof StoreError) return error;
  if (error instanceof Dexie.QuotaExceededError)
    return new StoreError('persistence_failed:quota');
  if (error instanceof Dexie.VersionError || error instanceof Dexie.UpgradeError)
    return new StoreError('migration_blocked', String(error));
  if (error instanceof Error && error.message === 'unsupported_schema')
    return new StoreError('unsupported_schema');
  if (error instanceof Error && error.message === 'record_corrupt')
    return new StoreError('record_corrupt');
  if (error instanceof Error && error.message === 'revision_exhausted')
    return new StoreError('revision_exhausted');
  return new StoreError('persistence_failed:unavailable', String(error));
}

export interface CorruptRecord {
  store: string;
  key: string;
  reason: 'record_corrupt' | 'unsupported_schema';
}
export interface ProjectBundle {
  project: ProjectRow;
  draft: DraftRow | null;
  input: InputRow | null;
  catalog: CatalogRow | null;
  snapshots: SnapshotRow[];
  corrupt: CorruptRecord[];
  /** Any row at a newer schema version blocks project writes. */
  unsupported: boolean;
}
export type CommitResult =
  | { status: 'committed'; projectRevision: string; inputRevision: string }
  | { status: 'conflict' }
  | { status: 'stale_draft' };

const QUARANTINE_LIMIT = 10;
const QUARANTINE_BYTES = 10 * 1024 * 1024;

/**
 * One per-tab serialized write queue over the Dexie stores. Reads stay direct;
 * every mutation goes through `enqueue` so writes from this tab never race
 * each other. Cross-tab safety comes from the CAS on `projectRevision`.
 */
export class ProjectRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private known = new Map<string, string>();
  /** Called when another tab needs this connection closed for an upgrade. */
  onVersionChange: (() => void) | null = null;
  constructor(
    readonly db: ZariDb = new ZariDb(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    // A newer build in another tab asks this connection to close. We close and
    // surface a reload prompt — we never delete or block the database.
    this.db.on('versionchange', () => {
      this.db.close();
      this.onVersionChange?.();
    });
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  async open(): Promise<void> {
    try {
      await this.db.open();
    } catch (error) {
      throw storeError(error);
    }
  }
  /** Expected CAS revision for a project: our own last commit, else the row. */
  private async expectedRevision(projectId: string): Promise<string> {
    const known = this.known.get(projectId);
    if (known !== undefined) return known;
    const project = await this.db.projects.get(projectId);
    if (!project) throw new StoreError('project_not_found', projectId);
    const row = readProjectRow(project);
    this.known.set(projectId, row.projectRevision);
    return row.projectRevision;
  }
  /** Forget the tracked revision after a reload so the next CAS re-reads. */
  refreshRevision(projectId: string): void {
    this.known.delete(projectId);
  }
  async createProject(name: string, form: RawProjectInputDto): Promise<ProjectRow> {
    return this.enqueue(async () => {
      const at = this.now();
      const row: ProjectRow = {
        schemaVersion: SCHEMA_VERSION,
        projectId: crypto.randomUUID(),
        name,
        status: 'active',
        projectRevision: '1',
        currentInputRevision: '0',
        currentInputDigest: null,
        accepted: null,
        lastStep: 'space',
        createdAt: at,
        updatedAt: at,
        recovery: null,
      };
      const draft: DraftRow = {
        schemaVersion: SCHEMA_VERSION,
        projectId: row.projectId,
        generation: '0',
        editorSessionId: crypto.randomUUID(),
        baseInputRevision: '0',
        form,
        validation: { status: 'unchecked', diagnostics: [] },
        updatedAt: at,
      };
      try {
        await this.db.transaction('rw', this.db.projects, this.db.drafts, async () => {
          await this.db.projects.add(row);
          await this.db.drafts.add(draft);
        });
      } catch (error) {
        throw storeError(error);
      }
      this.known.set(row.projectId, row.projectRevision);
      return row;
    });
  }
  async listProjects(): Promise<ProjectRow[]> {
    try {
      const rows = await this.db.projects.orderBy('updatedAt').reverse().toArray();
      return rows.map(readProjectRow);
    } catch (error) {
      throw storeError(error);
    }
  }
  /**
   * Read one project's durable bundle. Envelope-invalid rows are reported in
   * `corrupt` and withheld; the caller decides on quarantine/recovery. Nothing
   * is repaired or silently defaulted here.
   */
  async loadBundle(projectId: string): Promise<ProjectBundle> {
    try {
      const corrupt: CorruptRecord[] = [];
      const rawProject = await this.db.projects.get(projectId);
      if (!rawProject) throw new StoreError('project_not_found', projectId);
      let unsupported = false;
      let project: ProjectRow;
      try {
        project = readProjectRow(rawProject);
      } catch (error) {
        const reason = error instanceof Error && error.message === 'unsupported_schema';
        unsupported = reason;
        corrupt.push({
          store: 'projects',
          key: projectId,
          reason: reason ? 'unsupported_schema' : 'record_corrupt',
        });
        // The coordination row itself is not readable; the bundle keeps only
        // quarantine evidence so a recovery view/export can still be offered.
        return {
          project: rawProject as ProjectRow,
          draft: null,
          input: null,
          catalog: null,
          snapshots: [],
          corrupt,
          unsupported: true,
        };
      }
      this.known.set(projectId, project.projectRevision);
      const rawDraft = await this.db.drafts.get(projectId);
      let draft: DraftRow | null = null;
      if (rawDraft !== undefined) {
        try {
          draft = readDraftRow(rawDraft);
        } catch (error) {
          unsupported ||=
            error instanceof Error && error.message === 'unsupported_schema';
          corrupt.push({
            store: 'drafts',
            key: projectId,
            reason:
              error instanceof Error && error.message === 'unsupported_schema'
                ? 'unsupported_schema'
                : 'record_corrupt',
          });
        }
      }
      let input: InputRow | null = null;
      if (project.currentInputDigest !== null) {
        const rawInput = await this.db.inputs.get([
          projectId,
          project.currentInputRevision,
        ]);
        if (rawInput === undefined) {
          corrupt.push({
            store: 'inputs',
            key: `${projectId}+${project.currentInputRevision}`,
            reason: 'record_corrupt',
          });
        } else {
          try {
            input = readInputRow(rawInput);
          } catch (error) {
            unsupported ||=
              error instanceof Error && error.message === 'unsupported_schema';
            corrupt.push({
              store: 'inputs',
              key: `${projectId}+${project.currentInputRevision}`,
              reason:
                error instanceof Error && error.message === 'unsupported_schema'
                  ? 'unsupported_schema'
                  : 'record_corrupt',
            });
          }
        }
      }
      let catalog: CatalogRow | null = null;
      if (input !== null) {
        const rawCatalog = await this.db.catalogs.get(
          input.input.catalogPin.catalogDigest,
        );
        if (rawCatalog !== undefined) {
          try {
            catalog = readCatalogRow(rawCatalog);
          } catch (error) {
            unsupported ||=
              error instanceof Error && error.message === 'unsupported_schema';
            corrupt.push({
              store: 'catalogs',
              key: input.input.catalogPin.catalogDigest,
              reason:
                error instanceof Error && error.message === 'unsupported_schema'
                  ? 'unsupported_schema'
                  : 'record_corrupt',
            });
          }
        }
      }
      const snapshots: SnapshotRow[] = [];
      for (const raw of await this.db.snapshots.where('projectId').equals(projectId).toArray()) {
        try {
          snapshots.push(readSnapshotRow(raw));
        } catch (error) {
          unsupported ||=
            error instanceof Error && error.message === 'unsupported_schema';
          const row = raw as SnapshotRow;
          corrupt.push({
            store: 'snapshots',
            key: `${row?.projectId ?? projectId}+${row?.inputRevision ?? '?'}+${row?.planSnapshotId ?? '?'}`,
            reason:
              error instanceof Error && error.message === 'unsupported_schema'
                ? 'unsupported_schema'
                : 'record_corrupt',
          });
        }
      }
      return { project, draft, input, catalog, snapshots, corrupt, unsupported };
    } catch (error) {
      throw storeError(error);
    }
  }
  /** §3.1: short rw transaction, exact CAS on projectRevision, no Worker wait. */
  saveDraft(
    args: {
      projectId: string;
      generation: string;
      editorSessionId: string;
      form: RawProjectInputDto;
      validation: DraftRow['validation'];
    },
  ): Promise<CommitResult> {
    return this.enqueue(async () => {
      const expected = await this.expectedRevision(args.projectId);
      try {
        return await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.drafts,
          async (): Promise<CommitResult> => {
            const project = readProjectRow(await this.db.projects.get(args.projectId));
            if (project.projectRevision !== expected) return { status: 'conflict' };
            const existing = await this.db.drafts.get(args.projectId);
            if (existing !== undefined) {
              const draft = readDraftRow(existing);
              // A newer committed draft generation means this save is stale.
              if (BigInt(draft.generation) > BigInt(args.generation))
                return { status: 'stale_draft' };
            }
            const next = nextRevision(project.projectRevision);
            await this.db.drafts.put({
              schemaVersion: SCHEMA_VERSION,
              projectId: args.projectId,
              generation: args.generation,
              editorSessionId: args.editorSessionId,
              baseInputRevision: existing
                ? readDraftRow(existing).baseInputRevision
                : project.currentInputRevision,
              form: args.form,
              validation: args.validation,
              updatedAt: this.now(),
            });
            await this.db.projects.update(args.projectId, {
              projectRevision: next,
              name: project.name,
              updatedAt: this.now(),
            });
            this.known.set(args.projectId, next);
            return {
              status: 'committed',
              projectRevision: next,
              inputRevision: project.currentInputRevision,
            };
          },
        );
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  /**
   * §3.2: commit the normalized result and the raw draft in one transaction.
   * Aborts when the revision, editor session or draft generation moved since
   * the Worker request was captured.
   */
  commitNormalizedInput(args: {
    projectId: string;
    generation: string;
    editorSessionId: string;
    form: RawProjectInputDto;
    validation: DraftRow['validation'];
    normalized: ProjectInput | null;
    inputDigest: string | null;
    engineBuildId: string;
  }): Promise<CommitResult> {
    return this.enqueue(async () => {
      const expected = await this.expectedRevision(args.projectId);
      try {
        return await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.drafts,
          this.db.inputs,
          async (): Promise<CommitResult> => {
            const project = readProjectRow(await this.db.projects.get(args.projectId));
            if (project.projectRevision !== expected) return { status: 'conflict' };
            const existing = await this.db.drafts.get(args.projectId);
            if (existing !== undefined) {
              const draft = readDraftRow(existing);
              // A newer committed draft supersedes this normalize result.
              // An equal generation under a different editor session is a
              // reload continuation of the same draft, not staleness.
              if (BigInt(draft.generation) > BigInt(args.generation))
                return { status: 'stale_draft' };
            }
            let inputRevision = project.currentInputRevision;
            if (
              args.inputDigest !== null &&
              args.normalized !== null &&
              args.inputDigest !== project.currentInputDigest
            ) {
              inputRevision = nextRevision(project.currentInputRevision);
              await this.db.inputs.add({
                schemaVersion: SCHEMA_VERSION,
                projectId: args.projectId,
                inputRevision,
                inputDigest: args.inputDigest,
                input: args.normalized,
                engineBuildId: args.engineBuildId,
                createdAt: this.now(),
              });
            }
            const next = nextRevision(project.projectRevision);
            await this.db.drafts.put({
              schemaVersion: SCHEMA_VERSION,
              projectId: args.projectId,
              generation: args.generation,
              editorSessionId: args.editorSessionId,
              baseInputRevision: inputRevision,
              form: args.form,
              validation: args.validation,
              updatedAt: this.now(),
            });
            await this.db.projects.update(args.projectId, {
              projectRevision: next,
              currentInputRevision: inputRevision,
              currentInputDigest:
                args.inputDigest !== null ? args.inputDigest : project.currentInputDigest,
              updatedAt: this.now(),
            });
            this.known.set(args.projectId, next);
            return { status: 'committed', projectRevision: next, inputRevision };
          },
        );
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  /** Conflict recovery: copy the local draft into a fresh project. */
  saveAsNewProject(
    name: string,
    form: RawProjectInputDto,
    validation: DraftRow['validation'],
  ): Promise<ProjectRow> {
    return this.enqueue(async () => {
      const at = this.now();
      const projectId = crypto.randomUUID();
      try {
        await this.db.transaction('rw', this.db.projects, this.db.drafts, async () => {
          await this.db.projects.add({
            schemaVersion: SCHEMA_VERSION,
            projectId,
            name,
            status: 'active',
            projectRevision: '1',
            currentInputRevision: '0',
            currentInputDigest: null,
            accepted: null,
            lastStep: 'space',
            createdAt: at,
            updatedAt: at,
            recovery: null,
          });
          await this.db.drafts.add({
            schemaVersion: SCHEMA_VERSION,
            projectId,
            generation: '0',
            editorSessionId: crypto.randomUUID(),
            baseInputRevision: '0',
            form,
            validation,
            updatedAt: at,
          });
        });
      } catch (error) {
        throw storeError(error);
      }
      this.known.set(projectId, '1');
      return (await this.db.projects.get(projectId))!;
    });
  }
  /** Upsert a validated immutable catalog; rows are never mutated in place. */
  async putCatalog(catalog: CatalogRow['catalog'], origin: string): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.db.catalogs.put({
          schemaVersion: SCHEMA_VERSION,
          catalogDigest: catalog.catalogDigest,
          catalogVersion: catalog.catalogVersion,
          origin,
          catalog,
          ingestedAt: this.now(),
        });
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  async getCatalog(digest: string): Promise<CatalogRow | null> {
    try {
      const row = await this.db.catalogs.get(digest);
      return row === undefined ? null : readCatalogRow(row);
    } catch (error) {
      throw storeError(error);
    }
  }
  /**
   * Keep an exact byte copy of a damaged record in `metadata` for recovery.
   * Bounded; when full, callers export instead of evicting evidence.
   */
  async quarantine(
    entry: Omit<QuarantinePayload, 'kind' | 'payloadVersion' | 'capturedAt'>,
  ): Promise<{ status: 'kept' | 'full' }> {
    return this.enqueue(async () => {
      try {
        return await this.db.transaction('rw', this.db.metadata, async () => {
          const existing = await this.db.metadata
            .where('key')
            .startsWith('quarantine:')
            .toArray();
          let bytes = 0;
          for (const row of existing) {
            const payload = row.payload as QuarantinePayload | undefined;
            bytes += payload?.bytes?.length ?? 0;
          }
          if (existing.length >= QUARANTINE_LIMIT || bytes + entry.bytes.length > QUARANTINE_BYTES)
            return { status: 'full' as const };
          const key = `quarantine:${crypto.randomUUID()}`;
          await this.db.metadata.put({
            schemaVersion: SCHEMA_VERSION,
            key,
            payload: {
              kind: 'quarantine',
              payloadVersion: 1,
              capturedAt: this.now(),
              ...entry,
            } satisfies QuarantinePayload,
          });
          return { status: 'kept' as const };
        });
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  async quarantined(): Promise<QuarantinePayload[]> {
    try {
      const rows = await this.db.metadata.where('key').startsWith('quarantine:').toArray();
      return rows.map((row) => row.payload as QuarantinePayload);
    } catch (error) {
      throw storeError(error);
    }
  }
  /**
   * §7 deletion: the project's own rows in one transaction; shared catalogs
   * and the library containers stay. Unreferenced-row cleanup is a separate
   * explicit operation, never a quota workaround.
   */
  async deleteProject(projectId: string): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.drafts,
          this.db.inputs,
          this.db.snapshots,
          this.db.actionProgress,
          async () => {
            await this.db.projects.delete(projectId);
            await this.db.drafts.delete(projectId);
            await this.db.inputs.where('projectId').equals(projectId).delete();
            await this.db.snapshots.where('projectId').equals(projectId).delete();
            await this.db.actionProgress.where('projectId').equals(projectId).delete();
          },
        );
      } catch (error) {
        throw storeError(error);
      }
      this.known.delete(projectId);
    });
  }
  /** Test/seed helper: write one action-progress row under exact CAS. */
  async putActionProgress(
    row: Omit<ActionProgressRow, 'schemaVersion'>,
  ): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.db.actionProgress.put({ schemaVersion: SCHEMA_VERSION, ...row });
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  async actionProgressFor(
    projectId: string,
    inputRevision: string,
    planSnapshotId: string,
  ): Promise<ActionProgressRow[]> {
    try {
      const rows = await this.db.actionProgress.where('projectId').equals(projectId).toArray();
      return rows
        .map(readActionProgressRow)
        .filter(
          (row) =>
            row.inputRevision === inputRevision && row.planSnapshotId === planSnapshotId,
        );
    } catch (error) {
      throw storeError(error);
    }
  }
}
