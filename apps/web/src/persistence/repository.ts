import Dexie from 'dexie';
import type {
  OwnedContainer,
  PlanSnapshot,
  ProjectInput,
  RawProjectInputDto,
} from '../contracts/generated/dto';
import {
  ATTACHMENT_MAX_COUNT,
  SCHEMA_VERSION,
  ZariDb,
  nextRevision,
  readActionProgressRow,
  readAttachmentRow,
  readCatalogRow,
  readDraftRow,
  readInputRow,
  readOwnedContainerRow,
  readProjectRow,
  readSnapshotRow,
  type ActionProgressRow,
  type AttachmentRow,
  type CatalogRow,
  type DraftRow,
  type EditChain,
  type InputRow,
  type OwnedContainerRow,
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
export type ActionStepResult =
  | { status: 'saved'; projectRevision: string }
  | { status: 'conflict' }
  /** Progress only attaches to the project's current accepted binding. */
  | { status: 'not_accepted' }
  /** The step id does not exist in the bound snapshot's action list. */
  | { status: 'unknown_step' }
  /** Done requires every prerequisite step to be done first. */
  | { status: 'blocked_prerequisites'; missing: string[] }
  /** Clearing a step is refused while dependent steps are still done. */
  | { status: 'blocked_dependents'; dependents: string[] };
export type OwnedSaveResult =
  | { status: 'saved'; revision: string }
  | { status: 'conflict'; revision: string };
export type AcceptResult =
  | { status: 'committed'; projectRevision: string }
  | { status: 'conflict' }
  /** The committed input moved since the snapshot was evaluated. */
  | { status: 'stale_input' }
  /** The snapshot claims a binding the durable rows do not have. */
  | { status: 'binding_mismatch' };

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
      await this.recordMigration();
    } catch (error) {
      throw storeError(error);
    }
  }
  /**
   * PERSISTENCE §6: record the opened schema version in `metadata`. The
   * migration journal itself is written inside the Dexie upgrade transaction
   * (see `db.ts`), so it exists iff an upgrade really applied; this marker
   * just lets a later open see which schema generation it is on.
   */
  private async recordMigration(): Promise<void> {
    const verno = this.db.verno;
    const prior = await this.db.metadata.get('db:verno');
    if (
      typeof (prior?.payload as { version?: unknown } | undefined)?.version ===
      'number' &&
      (prior!.payload as { version: number }).version === verno
    )
      return;
    await this.db.metadata.put({
      schemaVersion: SCHEMA_VERSION,
      key: 'db:verno',
      payload: { version: verno },
    });
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
  /**
   * §3.3: persist an evaluated plan snapshot and bind it as the project's
   * accepted plan in one transaction. The snapshot is immutable content — an
   * existing row under the same key must be byte-identical. The input binding
   * must still be the project's current one; a stale evaluation is refused
   * rather than silently accepted under newer input.
   */
  acceptSnapshot(args: {
    projectId: string;
    snapshot: PlanSnapshot;
    engineBuildId: string;
  }): Promise<AcceptResult> {
    return this.enqueue(async () => {
      const expected = await this.expectedRevision(args.projectId);
      try {
        return await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.inputs,
          this.db.snapshots,
          this.db.catalogs,
          async (): Promise<AcceptResult> => {
            const project = readProjectRow(await this.db.projects.get(args.projectId));
            if (project.projectRevision !== expected) return { status: 'conflict' };
            const content = args.snapshot.content;
            if (
              project.currentInputDigest === null ||
              content.versions.inputDigest !== project.currentInputDigest ||
              content.versions.catalogDigest !==
                (await this.db.inputs.get([args.projectId, project.currentInputRevision]))
                  ?.input.catalogPin.catalogDigest
            ) {
              return { status: 'stale_input' };
            }
            const catalog = await this.db.catalogs.get(content.versions.catalogDigest);
            if (catalog === undefined) return { status: 'binding_mismatch' };
            const key = [
              args.projectId,
              project.currentInputRevision,
              args.snapshot.planSnapshotId,
            ] as [string, string, string];
            const existing = await this.db.snapshots.get(key);
            if (existing !== undefined) {
              const row = readSnapshotRow(existing);
              if (
                JSON.stringify(row.snapshot) !== JSON.stringify(args.snapshot)
              ) {
                throw new StoreError('record_corrupt', 'snapshot_content_mismatch');
              }
            } else {
              await this.db.snapshots.add({
                schemaVersion: SCHEMA_VERSION,
                projectId: args.projectId,
                inputRevision: project.currentInputRevision,
                planSnapshotId: args.snapshot.planSnapshotId,
                snapshot: args.snapshot,
                acceptedAt: this.now(),
                engineBuildId: args.engineBuildId,
              });
            }
            const next = nextRevision(project.projectRevision);
            await this.db.projects.update(args.projectId, {
              projectRevision: next,
              accepted: {
                inputRevision: project.currentInputRevision,
                planSnapshotId: args.snapshot.planSnapshotId,
              },
              updatedAt: this.now(),
            });
            this.known.set(args.projectId, next);
            return { status: 'committed', projectRevision: next };
          },
        );
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  /**
   * §007 layout edit commit: persist the verified edit result snapshot and the
   * updated draft edit chain in one transaction. Same fences as
   * `acceptSnapshot` — the snapshot's stamped input must still be the
   * committed one, and an existing row under the same key must be
   * byte-identical. `accepted` is untouched: an edited working plan is a
   * proposal until the user accepts it.
   */
  commitEditSnapshot(args: {
    projectId: string;
    snapshot: PlanSnapshot;
    /**
     * The snapshot the edit was applied to; persisted alongside the result so
     * undo can resolve its bytes after a reload (the base may be a search
     * alternative that was never accepted).
     */
    base: PlanSnapshot;
    /** Replacement edit chain for the draft row (`null` clears it). */
    edit: EditChain | null;
    engineBuildId: string;
  }): Promise<CommitResult | { status: 'stale_input' }> {
    return this.enqueue(async () => {
      const expected = await this.expectedRevision(args.projectId);
      try {
        return await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.inputs,
          this.db.snapshots,
          this.db.drafts,
          async (): Promise<CommitResult | { status: 'stale_input' }> => {
            const project = readProjectRow(await this.db.projects.get(args.projectId));
            if (project.projectRevision !== expected) return { status: 'conflict' };
            const content = args.snapshot.content;
            if (
              project.currentInputDigest === null ||
              content.versions.inputDigest !== project.currentInputDigest ||
              args.base.content.versions.inputDigest !== project.currentInputDigest
            ) {
              return { status: 'stale_input' };
            }
            for (const snap of [args.base, args.snapshot]) {
              const key = [
                args.projectId,
                project.currentInputRevision,
                snap.planSnapshotId,
              ] as [string, string, string];
              const existing = await this.db.snapshots.get(key);
              if (existing !== undefined) {
                const row = readSnapshotRow(existing);
                if (JSON.stringify(row.snapshot) !== JSON.stringify(snap)) {
                  throw new StoreError('record_corrupt', 'snapshot_content_mismatch');
                }
              } else {
                await this.db.snapshots.add({
                  schemaVersion: SCHEMA_VERSION,
                  projectId: args.projectId,
                  inputRevision: project.currentInputRevision,
                  planSnapshotId: snap.planSnapshotId,
                  snapshot: snap,
                  acceptedAt: this.now(),
                  engineBuildId: args.engineBuildId,
                });
              }
            }
            const rawDraft = await this.db.drafts.get(args.projectId);
            if (rawDraft === undefined) return { status: 'conflict' };
            const draft = readDraftRow(rawDraft);
            const next = nextRevision(project.projectRevision);
            await this.db.drafts.put({ ...draft, edit: args.edit, updatedAt: this.now() });
            await this.db.projects.update(args.projectId, {
              projectRevision: next,
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
   * Every readable catalog row — synthetic bundled data and staged imports
   * alike. Rows that fail the envelope guard are skipped here; the session's
   * verifyRecord pass is what flags them as corrupt.
   */
  async listCatalogs(): Promise<CatalogRow[]> {
    try {
      const rows = await this.db.catalogs.toArray();
      const readable: CatalogRow[] = [];
      for (const row of rows) {
        try {
          readable.push(readCatalogRow(row));
        } catch {
          // Unreadable rows are surfaced by the integrity pass, not hidden
          // here — a list screen must never crash on quarantined bytes.
        }
      }
      return readable;
    } catch (error) {
      throw storeError(error);
    }
  }
  /** The global owned-container library (normalized records only). */
  async listOwnedContainers(): Promise<OwnedContainerRow[]> {
    try {
      const rows = await this.db.ownedContainers.toArray();
      const readable: OwnedContainerRow[] = [];
      for (const row of rows) {
        try {
          readable.push(readOwnedContainerRow(row));
        } catch {
          /* see listCatalogs */
        }
      }
      return readable;
    } catch (error) {
      throw storeError(error);
    }
  }
  /**
   * CAS write to the owned-container library. `expectedRevision` is the
   * library row revision the caller saw (`'0'` for a new entry); a mismatch
   * means another write landed first and this one is refused, never merged.
   */
  saveOwnedContainer(
    container: OwnedContainer,
    expectedRevision: string,
  ): Promise<OwnedSaveResult> {
    return this.enqueue(async () => {
      try {
        return await this.db.transaction(
          'rw',
          this.db.ownedContainers,
          async (): Promise<OwnedSaveResult> => {
            const raw = await this.db.ownedContainers.get(container.id);
            const current =
              raw === undefined ? '0' : readOwnedContainerRow(raw).revision;
            if (current !== expectedRevision)
              return { status: 'conflict', revision: current };
            const revision = current === '0' ? '1' : nextRevision(current);
            await this.db.ownedContainers.put({
              schemaVersion: SCHEMA_VERSION,
              ownedContainerId: container.id,
              revision,
              container,
              updatedAt: this.now(),
            });
            return { status: 'saved', revision };
          },
        );
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  async deleteOwnedContainer(
    ownedContainerId: string,
    expectedRevision: string,
  ): Promise<OwnedSaveResult> {
    return this.enqueue(async () => {
      try {
        return await this.db.transaction(
          'rw',
          this.db.ownedContainers,
          async (): Promise<OwnedSaveResult> => {
            const raw = await this.db.ownedContainers.get(ownedContainerId);
            const current =
              raw === undefined ? '0' : readOwnedContainerRow(raw).revision;
            if (current === '0' || current !== expectedRevision)
              return { status: 'conflict', revision: current };
            await this.db.ownedContainers.delete(ownedContainerId);
            return { status: 'saved', revision: '0' };
          },
        );
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  /**
   * One action-step toggle bound to the project's accepted immutable
   * snapshot. Completion requires every declared prerequisite step to be
   * done; clearing is refused while dependents stay done. CAS on
   * `projectRevision` like every other project write.
   */
  setActionStep(args: {
    projectId: string;
    inputRevision: string;
    planSnapshotId: string;
    stepId: string;
    done: boolean;
  }): Promise<ActionStepResult> {
    return this.enqueue(async () => {
      const expected = await this.expectedRevision(args.projectId);
      try {
        return await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.snapshots,
          this.db.actionProgress,
          async (): Promise<ActionStepResult> => {
            const project = readProjectRow(await this.db.projects.get(args.projectId));
            if (project.projectRevision !== expected) return { status: 'conflict' };
            if (
              project.accepted === null ||
              project.accepted.inputRevision !== args.inputRevision ||
              project.accepted.planSnapshotId !== args.planSnapshotId
            ) {
              return { status: 'not_accepted' };
            }
            const rawSnapshot = await this.db.snapshots.get([
              args.projectId,
              args.inputRevision,
              args.planSnapshotId,
            ]);
            if (rawSnapshot === undefined) return { status: 'not_accepted' };
            const snapshot = readSnapshotRow(rawSnapshot).snapshot;
            const actions = snapshot.content.actions;
            const step = actions.find((a) => a.id === args.stepId);
            if (step === undefined) return { status: 'unknown_step' };
            const progress = new Map(
              (
                await this.db.actionProgress
                  .where('projectId')
                  .equals(args.projectId)
                  .toArray()
              )
                .map(readActionProgressRow)
                .filter(
                  (row) =>
                    row.inputRevision === args.inputRevision &&
                    row.planSnapshotId === args.planSnapshotId,
                )
                .map((row) => [row.stepId, row.status]),
            );
            if (args.done) {
              const missing = step.prerequisiteStepIds.filter(
                (id) => progress.get(id) !== 'done',
              );
              if (missing.length > 0)
                return { status: 'blocked_prerequisites', missing };
            } else {
              const dependents = actions
                .filter(
                  (a) =>
                    a.prerequisiteStepIds.includes(args.stepId) &&
                    progress.get(a.id) === 'done',
                )
                .map((a) => a.id);
              if (dependents.length > 0)
                return { status: 'blocked_dependents', dependents };
            }
            await this.db.actionProgress.put({
              schemaVersion: SCHEMA_VERSION,
              projectId: args.projectId,
              inputRevision: args.inputRevision,
              planSnapshotId: args.planSnapshotId,
              stepId: args.stepId,
              status: args.done ? 'done' : 'todo',
              updatedAt: this.now(),
            });
            const next = nextRevision(project.projectRevision);
            await this.db.projects.update(args.projectId, {
              projectRevision: next,
              updatedAt: this.now(),
            });
            this.known.set(args.projectId, next);
            return { status: 'saved', projectRevision: next };
          },
        );
      } catch (error) {
        throw storeError(error);
      }
    });
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
          [
            this.db.projects,
            this.db.drafts,
            this.db.inputs,
            this.db.snapshots,
            this.db.actionProgress,
            this.db.attachments,
          ],
          async () => {
            await this.db.projects.delete(projectId);
            await this.db.drafts.delete(projectId);
            await this.db.inputs.where('projectId').equals(projectId).delete();
            await this.db.snapshots.where('projectId').equals(projectId).delete();
            await this.db.actionProgress.where('projectId').equals(projectId).delete();
            // Attachment rows hold their own bytes — deleting the project's
            // rows removes the orphan bytes with them.
            await this.db.attachments.where('projectId').equals(projectId).delete();
          },
        );
      } catch (error) {
        throw storeError(error);
      }
      this.known.delete(projectId);
    });
  }
  /**
   * Local photo attachments (Ticket 009). Rows store derivative bytes inline,
   * so listing validates each envelope and removing a row removes its bytes —
   * no orphan cleanup pass is needed.
   */
  async listAttachments(projectId: string): Promise<AttachmentRow[]> {
    try {
      const rows = await this.db.attachments.where('projectId').equals(projectId).toArray();
      const readable: AttachmentRow[] = [];
      for (const row of rows) {
        try {
          readable.push(readAttachmentRow(row));
        } catch {
          /* see listCatalogs */
        }
      }
      return readable;
    } catch (error) {
      throw storeError(error);
    }
  }
  /**
   * Insert one validated attachment under the per-project cap. The count
   * check lives inside the same transaction so two tabs cannot both slip
   * past the bound.
   */
  addAttachment(row: AttachmentRow): Promise<{ status: 'saved' | 'full' }> {
    return this.enqueue(async () => {
      try {
        return await this.db.transaction('rw', this.db.attachments, async () => {
          const count = await this.db.attachments
            .where('projectId')
            .equals(row.projectId)
            .count();
          if (count >= ATTACHMENT_MAX_COUNT) return { status: 'full' as const };
          readAttachmentRow(row);
          await this.db.attachments.add(row);
          return { status: 'saved' as const };
        });
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  /** Remove one attachment; its bytes leave storage with the row. */
  async deleteAttachment(attachmentId: string): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.db.attachments.delete(attachmentId);
      } catch (error) {
        throw storeError(error);
      }
    });
  }
  /**
   * PERSISTENCE §7 duplication: fresh project id with `projectRevision` '1',
   * the current normalized input and draft copied, and the accepted snapshot
   * re-bound only when its bytes still resolve under the current input
   * revision. Action progress starts empty — done states never transfer.
   */
  async duplicateProject(
    sourceId: string,
    name?: string,
  ): Promise<ProjectRow> {
    return this.enqueue(async () => {
      const newId = crypto.randomUUID();
      const at = this.now();
      try {
        await this.db.transaction(
          'rw',
          this.db.projects,
          this.db.drafts,
          this.db.inputs,
          this.db.snapshots,
          async () => {
            const project = readProjectRow(await this.db.projects.get(sourceId));
            const rawDraft = await this.db.drafts.get(sourceId);
            const draft = rawDraft === undefined ? null : readDraftRow(rawDraft);
            let input: InputRow | null = null;
            if (project.currentInputDigest !== null) {
              const raw = await this.db.inputs.get([
                sourceId,
                project.currentInputRevision,
              ]);
              if (raw === undefined)
                throw new StoreError('record_corrupt', 'input_missing');
              input = readInputRow(raw);
            }
            // Re-bind only a snapshot that still matches the current input
            // revision and resolves as a durable row.
            let accepted = project.accepted;
            let snapshot: SnapshotRow | null = null;
            if (
              accepted !== null &&
              accepted.inputRevision === project.currentInputRevision
            ) {
              const raw = await this.db.snapshots.get([
                sourceId,
                accepted.inputRevision,
                accepted.planSnapshotId,
              ]);
              if (raw !== undefined) snapshot = readSnapshotRow(raw);
            }
            if (snapshot === null) accepted = null;
            await this.db.projects.add({
              schemaVersion: SCHEMA_VERSION,
              projectId: newId,
              name: name ?? `${project.name} (사본)`,
              status: 'active',
              projectRevision: '1',
              currentInputRevision: project.currentInputRevision,
              currentInputDigest: project.currentInputDigest,
              accepted,
              lastStep: project.lastStep,
              createdAt: at,
              updatedAt: at,
              recovery: null,
            });
            if (draft !== null) {
              await this.db.drafts.add({
                schemaVersion: SCHEMA_VERSION,
                projectId: newId,
                generation: '0',
                editorSessionId: crypto.randomUUID(),
                baseInputRevision: project.currentInputRevision,
                form: draft.form,
                validation: draft.validation,
                edit: null,
                updatedAt: at,
              });
            }
            if (input !== null) {
              await this.db.inputs.add({
                schemaVersion: SCHEMA_VERSION,
                projectId: newId,
                inputRevision: input.inputRevision,
                inputDigest: input.inputDigest,
                input: input.input,
                engineBuildId: input.engineBuildId,
                createdAt: at,
              });
            }
            if (snapshot !== null) {
              await this.db.snapshots.add({
                schemaVersion: SCHEMA_VERSION,
                projectId: newId,
                inputRevision: snapshot.inputRevision,
                planSnapshotId: snapshot.planSnapshotId,
                snapshot: snapshot.snapshot,
                acceptedAt: at,
                engineBuildId: snapshot.engineBuildId,
              });
            }
          },
        );
      } catch (error) {
        throw storeError(error);
      }
      this.known.set(newId, '1');
      const row = await this.db.projects.get(newId);
      return row!;
    });
  }
  /**
   * PERSISTENCE §7 import commit: one transaction inserts the whole staged
   * project under a fresh id plus its required catalogs (insert-if-absent —
   * a catalog digest is a content key, so an existing identical row is
   * correct). Owned-container library and quarantine are never touched, and
   * a failure inserts no half-project.
   */
  commitImport(args: {
    projectId: string;
    name: string;
    importedFrom: { sourceProjectId: string; exportedAt: string };
    /** `null` when the source project had no readable draft row. */
    draft: DraftRow | null;
    project: Pick<
      ProjectRow,
      'currentInputRevision' | 'currentInputDigest' | 'accepted' | 'lastStep'
    >;
    inputs: InputRow[];
    snapshots: SnapshotRow[];
    actionProgress: ActionProgressRow[];
    catalogs: CatalogRow[];
  }): Promise<ProjectRow> {
    return this.enqueue(async () => {
      const at = this.now();
      const projectId = args.projectId;
      try {
        await this.db.transaction(
          'rw',
          [
            this.db.projects,
            this.db.drafts,
            this.db.inputs,
            this.db.snapshots,
            this.db.catalogs,
            this.db.actionProgress,
          ],
          async () => {
            await this.db.projects.add({
              schemaVersion: SCHEMA_VERSION,
              projectId,
              name: args.name,
              status: 'active',
              projectRevision: '1',
              currentInputRevision: args.project.currentInputRevision,
              currentInputDigest: args.project.currentInputDigest,
              accepted: args.project.accepted,
              lastStep: args.project.lastStep,
              createdAt: at,
              updatedAt: at,
              recovery: null,
              importedFrom: args.importedFrom,
            } as ProjectRow);
            if (args.draft !== null)
              await this.db.drafts.add({ ...args.draft, projectId });
            for (const row of args.inputs)
              await this.db.inputs.add({ ...row, projectId });
            for (const row of args.snapshots)
              await this.db.snapshots.add({ ...row, projectId });
            for (const row of args.actionProgress)
              await this.db.actionProgress.add({ ...row, projectId });
            for (const row of args.catalogs) {
              const existing = await this.db.catalogs.get(row.catalogDigest);
              if (existing === undefined) await this.db.catalogs.add(row);
            }
          },
        );
      } catch (error) {
        throw storeError(error);
      }
      this.known.set(projectId, '1');
      const row = await this.db.projects.get(projectId);
      return row!;
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
