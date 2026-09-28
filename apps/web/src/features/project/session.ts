import type {
  CatalogPin,
  CatalogSnapshot,
  Diagnostic,
  LayoutEditCommand,
  PlanSnapshot,
  ProjectInput,
  RawOwnedContainerDto,
  RawProjectInputDto,
  RejectedCandidate,
  SearchCounters,
  SearchTermination,
  Strategy,
  StrategyDecision,
  Unit,
  ValidationReport,
  VerifiableRecordDto,
} from '../../contracts/generated/dto';
import { exportProject, type ProjectExport } from '../../persistence/export';
import type { EditChain, EditTransition } from '../../persistence/db';
import {
  StoreError,
  type CommitResult,
  type CorruptRecord,
  type ProjectBundle,
  type ProjectRepository,
} from '../../persistence/repository';
import type { ProbeClient } from '../../worker/client';
import { StaleRequest } from '../../worker/client';
import {
  SearchPump,
  WorkerController,
  type WorkerLifecycle,
} from '../../worker/controller';
import {
  getMeasurement,
  setMeasurementText,
  setMeasurementUnit,
  type MeasurementField,
} from './draft';

export type SaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict'
  | 'unsupported';
export type SessionStatus = 'loading' | 'ready' | 'not-found' | 'unsupported' | 'unavailable';
export type ContextState = 'none' | 'installing' | 'installed' | 'degraded';
export type SearchState =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'done'
  | 'cancelled'
  | 'failed';
export type AcceptState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Layout editing surface (ZARI-007). `pending` is the only provisional value:
 * it carries the command bytes awaiting Rust evaluation and is never mistaken
 * for a verified plan. `rejection` explains the last refused command through
 * Rust diagnostics and — when the layout reached the validator — the failing
 * report checks. `undo`/`redo` hold committed transitions only.
 */
export interface EditState {
  selectedPlacementId: string | null;
  pending: { command: LayoutEditCommand; baseSnapshotId: string } | null;
  rejection: {
    command: LayoutEditCommand;
    baseSnapshotId: string;
    diagnostics: Diagnostic[];
    report: ValidationReport | null;
  } | null;
  /** Snapshot the current chain was rooted at; `null` before any edit. */
  chainBaseId: string | null;
  /** Verified working-plan snapshot; `null` until an edit commits. */
  head: PlanSnapshot | null;
  undo: EditTransition[];
  redo: EditTransition[];
}

/** Plan/search side of the session: Worker output and durable bindings only. */
export interface PlanState {
  strategies: StrategyDecision[] | null;
  strategiesError: string | null;
  search: SearchState;
  progress: SearchCounters | null;
  searchError: string | null;
  /** Evaluated alternatives from the last completed search, ranked by Rust. */
  alternatives: PlanSnapshot[];
  termination: SearchTermination | null;
  diagnostics: RejectedCandidate[];
  selectedId: string | null;
  /** Input digest the alternatives were evaluated against. */
  resultInputDigest: string | null;
  /** Durable acceptance binding on the project row. */
  accepted: { inputRevision: string; planSnapshotId: string } | null;
  acceptedSnapshot: PlanSnapshot | null;
  acceptState: AcceptState;
  acceptError: string | null;
  /** Activated catalog body — inspector offers/variants come from here. */
  catalog: CatalogSnapshot | null;
  /**
   * Step completion for the accepted binding only (`inputRevision` +
   * `planSnapshotId`). `null` means progress could not be read — never
   * treated as "all todo". Progress from any older binding is absent by
   * construction.
   */
  actionProgress: Record<string, 'done' | 'todo'> | null;
  actionError: string | null;
  edit: EditState;
}

export interface SessionSnapshot {
  status: SessionStatus;
  projectId: string;
  name: string;
  form: RawProjectInputDto | null;
  diagnostics: Diagnostic[];
  normalizedInput: ProjectInput | null;
  inputDigest: string | null;
  inputRevision: string;
  projectRevision: string;
  saveState: SaveState;
  saveError: string | null;
  /** Draft edits not yet confirmed by a committed normalize round-trip. */
  staleInput: boolean;
  context: ContextState;
  degradedReason: string | null;
  corrupt: CorruptRecord[];
  conflict: { remoteRevision: string } | null;
  worker: WorkerLifecycle;
  workerError: string | null;
  /** Integrity results from `verifyRecord` on open; `null` = not run. */
  integrity: { record: string; verified: boolean; diagnostics: Diagnostic[] }[] | null;
  closeBlocked: string | null;
  plan: PlanState;
}

const AUTOSAVE_MS = 400;
const TAB_CHANNEL = 'zari-tab-sync-v1';

type TabMessage = { kind: 'projectWritten'; projectId: string; projectRevision: string };

/**
 * One open project's editing session. Owns the raw draft, editor epoch,
 * Rust normalize round-trips, CAS commits, activation/context fencing and
 * conflict/broadcast handling. Holds no domain judgment: every semantic
 * result comes from the Worker or a committed durable row.
 */
export class ProjectSession {
  private listeners = new Set<(state: SessionSnapshot) => void>();
  private state: SessionSnapshot;
  private form: RawProjectInputDto | null = null;
  private generation = 0;
  private epoch = 0;
  private lastCommittedGeneration = -1;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;
  private closed = false;
  private reconcileQueue: Promise<unknown> = Promise.resolve();
  private pump: SearchPump | null = null;
  /** Every verified snapshot this session has seen, keyed by immutable id. */
  private snapshotIndex = new Map<string, PlanSnapshot>();
  /** Monotonic edit token: a late reply older than the newest request dies. */
  private editSeq = 0;
  constructor(
    private readonly repo: ProjectRepository,
    private readonly controller: WorkerController,
    private readonly projectId: string,
    private readonly engineBuildId: string,
  ) {
    this.state = {
      status: 'loading',
      projectId,
      name: '',
      form: null,
      diagnostics: [],
      normalizedInput: null,
      inputDigest: null,
      inputRevision: '0',
      projectRevision: '0',
      saveState: 'idle',
      saveError: null,
      staleInput: false,
      context: 'none',
      degradedReason: null,
      corrupt: [],
      conflict: null,
      worker: 'uninitialized',
      workerError: null,
      integrity: null,
      closeBlocked: null,
      plan: {
        strategies: null,
        strategiesError: null,
        search: 'idle',
        progress: null,
        searchError: null,
        alternatives: [],
        termination: null,
        diagnostics: [],
        selectedId: null,
        resultInputDigest: null,
        accepted: null,
        acceptedSnapshot: null,
        acceptState: 'idle',
        acceptError: null,
        catalog: null,
        actionProgress: null,
        actionError: null,
        edit: {
          selectedPlacementId: null,
          pending: null,
          rejection: null,
          chainBaseId: null,
          head: null,
          undo: [],
          redo: [],
        },
      },
    };
    controller.onLifecycle((worker, error) => {
      this.patch({ worker, workerError: error?.message ?? null });
      // A crash takes the activated context with it; do not keep advertising
      // 'installed' from the dead Worker session. The first open skips this —
      // status is still 'loading' while open() runs its own installContext.
      if (worker === 'failed' && !this.closed && this.state.status === 'ready')
        this.patch({ context: 'none' });
      if (worker === 'ready' && !this.closed && this.state.status === 'ready')
        this.patch({ context: 'installing' });
      if (worker === 'ready' && !this.closed) void this.recoverContext();
    });
    try {
      this.channel = new BroadcastChannel(TAB_CHANNEL);
      this.channel.onmessage = (event: MessageEvent<TabMessage>) => {
        const msg = event.data;
        if (
          msg?.kind === 'projectWritten' &&
          msg.projectId === this.projectId &&
          !this.closed &&
          this.state.status === 'ready' &&
          msg.projectRevision !== this.state.projectRevision
        ) {
          this.patch({
            conflict: { remoteRevision: msg.projectRevision },
            saveState: 'conflict',
          });
        }
      };
    } catch {
      this.channel = null;
    }
  }
  subscribe(listener: (state: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  private patch(part: Partial<SessionSnapshot>): void {
    this.state = { ...this.state, ...part };
    for (const listener of this.listeners) listener(this.state);
  }
  private patchPlan(part: Partial<PlanState>): void {
    this.patch({ plan: { ...this.state.plan, ...part } });
  }
  get snapshot(): SessionSnapshot {
    return this.state;
  }
  get isClosed(): boolean {
    return this.closed;
  }
  private bump(): { generation: string; epoch: string; form: RawProjectInputDto } {
    this.generation += 1;
    this.epoch += 1;
    this.controller.current?.setEpoch(String(this.epoch));
    return {
      generation: String(this.generation),
      epoch: String(this.epoch),
      form: structuredClone(this.form!),
    };
  }
  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.saveDraftNow(), AUTOSAVE_MS);
  }
  private broadcast(revision: string): void {
    try {
      this.channel?.postMessage({
        kind: 'projectWritten',
        projectId: this.projectId,
        projectRevision: revision,
      } satisfies TabMessage);
    } catch {
      /* broadcast is a hint, not a correctness mechanism */
    }
  }

  // ---------- open / verify / activate ----------

  async open(): Promise<void> {
    // Lifecycle events only fire on transitions; reflect the current state so
    // a session opened against an already-ready Worker is not stuck showing
    // 'uninitialized'.
    this.patch({ worker: this.controller.state });
    try {
      await this.repo.open();
    } catch (error) {
      this.patch({ status: 'unavailable', saveError: String(error) });
      return;
    }
    let bundle: ProjectBundle;
    try {
      bundle = await this.repo.loadBundle(this.projectId);
    } catch (error) {
      if (error instanceof StoreError && error.code === 'project_not_found') {
        this.patch({ status: 'not-found' });
      } else {
        this.patch({ status: 'unavailable', saveError: String(error) });
      }
      return;
    }
    if (bundle.unsupported && bundle.corrupt.some((c) => c.store === 'projects')) {
      this.patch({ status: 'unsupported', corrupt: bundle.corrupt });
      return;
    }
    this.form = bundle.draft?.form ?? null;
    this.generation = Number(bundle.draft?.generation ?? 0);
    this.lastCommittedGeneration = this.generation;
    const accepted = bundle.project.accepted;
    const acceptedSnapshot = accepted
      ? (bundle.snapshots.find((s) => s.planSnapshotId === accepted.planSnapshotId)
          ?.snapshot ?? null)
      : null;
    this.patch({
      name: bundle.project.name,
      form: this.form,
      inputRevision: bundle.project.currentInputRevision,
      projectRevision: bundle.project.projectRevision,
      normalizedInput: bundle.input?.input ?? null,
      inputDigest: bundle.project.currentInputDigest,
      corrupt: bundle.corrupt,
      saveState: 'idle',
    });
    this.patchPlan({
      accepted,
      acceptedSnapshot,
      // An accepted binding without its snapshot row is a corrupt bundle:
      // surface it as a corrupt record rather than hiding the acceptance.
      acceptState: accepted && !acceptedSnapshot ? 'error' : 'idle',
      acceptError:
        accepted && !acceptedSnapshot ? 'accepted_snapshot_missing' : null,
    });
    // Every persisted snapshot is addressable by id — undo/restore resolve
    // their source bytes from here and never re-trust a caller claim.
    this.snapshotIndex = new Map(
      bundle.snapshots.map((s) => [s.planSnapshotId, s.snapshot]),
    );
    this.patchPlan({ catalog: bundle.catalog?.catalog ?? null });
    await this.loadActionProgress();
    this.restoreEditChain(bundle.draft?.edit ?? null, bundle.project.currentInputDigest);
    // Quarantine envelope-invalid rows; bytes are preserved for export.
    for (const entry of bundle.corrupt) {
      const raw = await this.rawRow(entry.store, entry.key);
      if (raw !== null) {
        const bytes = btoa(JSON.stringify(raw));
        await this.repo.quarantine({
          projectId: this.projectId,
          store: entry.store,
          storeKey: entry.key,
          reason: entry.reason,
          bytes,
        }).catch(() => undefined);
      }
    }
    // Integrity: Rust verifies hashes; a failed verify quarantines the record
    // but never repairs it.
    const integrity: NonNullable<SessionSnapshot['integrity']> = [];
    const client = await this.controller.ensure().catch(() => null);
    if (client && bundle.input) {
      integrity.push(await this.verify(client, {
        kind: 'input',
        input: bundle.input.input,
        inputDigest: bundle.input.inputDigest,
      }, `inputs:${this.projectId}+${bundle.input.inputRevision}`));
    }
    if (client && bundle.catalog) {
      integrity.push(await this.verify(client, {
        kind: 'catalog',
        catalog: bundle.catalog.catalog,
      }, `catalogs:${bundle.catalog.catalogDigest}`));
    }
    for (const snap of bundle.snapshots) {
      if (client)
        integrity.push(await this.verify(client, {
          kind: 'snapshot',
          snapshot: snap.snapshot,
        }, `snapshots:${snap.planSnapshotId}`));
    }
    this.patch({ integrity });
    if (integrity.some((i) => !i.verified)) {
      this.patch({ corrupt: [...this.state.corrupt, { store: 'verify', key: this.projectId, reason: 'record_corrupt' }] });
    }
    // Context: project activation needs normalized input + catalog.
    await this.installContext(client, bundle.input?.input ?? null, bundle.catalog);
    if (this.form) {
      this.patch({ status: 'ready', staleInput: true });
      // Reconcile the restored draft with Rust before trusting it.
      this.enqueueReconcile({ skipWriteIfSame: true });
    } else {
      this.patch({ status: 'ready' });
    }
  }
  private async rawRow(store: string, key: string): Promise<unknown> {
    try {
      const table = (this.repo.db as unknown as Record<string, { get(k: unknown): Promise<unknown> }>)[store];
      if (!table) return null;
      if (store === 'inputs' || store === 'snapshots' || store === 'actionProgress')
        return await table.get(key.split('+'));
      return await table.get(key);
    } catch {
      return null;
    }
  }
  private async verify(
    client: ProbeClient,
    record: VerifiableRecordDto,
    label: string,
  ): Promise<{ record: string; verified: boolean; diagnostics: Diagnostic[] }> {
    try {
      const reply = await client.systemRequest({ kind: 'verifyRecord', record });
      if (reply.kind !== 'recordVerified') return { record: label, verified: false, diagnostics: [] };
      return { record: label, verified: reply.verified, diagnostics: [] };
    } catch {
      return { record: label, verified: false, diagnostics: [] };
    }
  }
  /** Activate a project context, falling back to bootstrap on catalog loss. */
  private async installContext(
    client: ProbeClient | null,
    input: ProjectInput | null,
    catalog: ProjectBundle['catalog'],
  ): Promise<void> {
    // The plan view reads options and catalog origin from the same pinned
    // catalog the context activates with — also after an input commit, not
    // only on open.
    this.patchPlan({ catalog: catalog?.catalog ?? null });
    if (!client) {
      this.patch({ context: 'none' });
      return;
    }
    this.patch({ context: 'installing' });
    if (input && catalog) {
      try {
        await client.activate(this.projectId, String(this.epoch), this.state.inputRevision, {
          kind: 'project',
          input,
          catalog: catalog.catalog,
        });
        this.patch({ context: 'installed', degradedReason: null });
        await this.refreshStrategies(client);
        return;
      } catch (error) {
        // Catalog pin mismatch/unavailable → degraded, not silent substitution.
        const reason = error instanceof Error ? error.message : String(error);
        try {
          await client.activate(this.projectId, String(this.epoch), this.state.inputRevision, {
            kind: 'bootstrap',
          });
          this.patch({ context: 'degraded', degradedReason: reason });
          return;
        } catch (inner) {
          this.patch({ context: 'none', degradedReason: String(inner) });
          return;
        }
      }
    }
    try {
      await client.activate(this.projectId, String(this.epoch), this.state.inputRevision, {
        kind: 'bootstrap',
      });
      this.patch({
        context: input ? 'degraded' : 'installed',
        degradedReason: input && !catalog ? 'catalog_unavailable' : null,
      });
    } catch (error) {
      this.patch({ context: 'none', degradedReason: String(error) });
    }
  }
  /** After a Worker restart: fresh session → re-activate → re-fence epoch. */
  private async recoverContext(): Promise<void> {
    const client = this.controller.current;
    if (!client || this.closed || this.state.status !== 'ready') return;
    client.setEpoch(String(this.epoch));
    const input = this.state.normalizedInput;
    const catalog = await this.repo.getCatalog(
      input?.catalogPin.catalogDigest ?? '',
    ).catch(() => null);
    await this.installContext(client, input, catalog);
    if (this.form && this.state.staleInput) this.enqueueReconcile({ skipWriteIfSame: true });
  }

  // ---------- editing ----------

  edit(field: MeasurementField, text: string): void {
    if (!this.form || this.state.status !== 'ready') return;
    this.form = setMeasurementText(this.form, field, text);
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  /**
   * Display-unit change: the unit switch commits only with the matching Rust
   * `formattedFields` result, applied atomically with the rewritten text.
   * Until then the draft keeps the old unit — a raw text that Rust read in
   * the new unit would silently change the stored value.
   */
  setUnit(field: MeasurementField, unit: Unit): void {
    if (!this.form || this.state.status !== 'ready') return;
    if (getMeasurement(this.form, field).unit === unit) return;
    const epoch = String(this.epoch);
    const generation = String(this.generation);
    const form = structuredClone(this.form);
    void this.formatField(field, unit, epoch, generation, form);
  }
  private async formatField(
    field: MeasurementField,
    unit: Unit,
    epoch: string,
    generation: string,
    form: RawProjectInputDto,
  ): Promise<void> {
    const client = this.controller.current;
    if (!client) return;
    try {
      const reply = await client.request({
        kind: 'normalizeInput',
        input: { kind: 'project', project: form },
        priorInputDigest: this.state.inputDigest,
        formatRequests: [{ fieldPath: field, unit }],
      });
      if (
        this.closed ||
        String(this.epoch) !== epoch ||
        String(this.generation) !== generation ||
        reply.kind !== 'normalized'
      )
        return;
      const formatted = reply.formattedFields.find((f) => f.fieldPath === field);
      if (!formatted) return;
      let next = setMeasurementUnit(form, field, unit);
      // An empty formatted text means the raw entry is blank/invalid; keep the
      // user's text verbatim and commit only the unit choice.
      if (formatted.text !== '') next = setMeasurementText(next, field, formatted.text);
      this.form = next;
      this.bump();
      this.patch({
        form: this.form,
        staleInput: true,
        saveState: this.state.conflict ? 'conflict' : 'dirty',
      });
      this.scheduleAutosave();
    } catch (error) {
      if (!(error instanceof StaleRequest)) {
        // Unit conversion failed; the raw text stays and the next normalize
        // will surface diagnostics — never silently reformat locally.
      }
    }
  }
  private async saveDraftNow(): Promise<void> {
    if (!this.form || this.closed) return;
    const { generation, form } = { generation: String(this.generation), form: this.form };
    this.patch({ saveState: this.state.conflict ? 'conflict' : 'saving' });
    try {
      const result = await this.repo.saveDraft({
        projectId: this.projectId,
        generation,
        editorSessionId: this.editorSessionId(),
        form,
        validation: this.validationFor(),
      });
      this.applyCommit(result, generation);
    } catch (error) {
      this.applyStoreError(error);
    }
  }
  private editorSessionIdMemo: string | null = null;
  private editorSessionId(): string {
    this.editorSessionIdMemo ??= crypto.randomUUID();
    return this.editorSessionIdMemo;
  }
  private validationFor(): { status: 'unchecked' | 'valid' | 'invalid'; diagnostics: Diagnostic[] } {
    return {
      status: this.state.diagnostics.length === 0 ? 'unchecked' : 'invalid',
      diagnostics: this.state.diagnostics,
    };
  }
  private applyCommit(result: CommitResult, generation: string): void {
    if (result.status === 'committed') {
      this.lastCommittedGeneration = Math.max(
        this.lastCommittedGeneration,
        Number(generation),
      );
      const projectRevision = result.projectRevision;
      this.broadcast(projectRevision);
      this.patch({
        projectRevision,
        inputRevision: result.inputRevision,
        conflict: null,
        saveState: this.generation > this.lastCommittedGeneration ? 'dirty' : 'saved',
        saveError: null,
      });
    } else if (result.status === 'conflict') {
      this.patch({
        conflict: { remoteRevision: 'unknown' },
        saveState: 'conflict',
      });
    }
    // 'stale_draft' → a newer draft supersedes this write; its own commit applies.
  }
  private applyStoreError(error: unknown): void {
    if (error instanceof StoreError) {
      if (error.code === 'unsupported_schema') {
        this.patch({ saveState: 'unsupported', saveError: error.message });
        return;
      }
      if (error.code === 'record_corrupt') {
        this.patch({ saveState: 'error', saveError: error.message });
        return;
      }
      this.patch({ saveState: 'error', saveError: error.code });
      return;
    }
    this.patch({ saveState: 'error', saveError: String(error) });
  }

  // ---------- normalize + commit ----------

  /** Flush pending autosave then run a Rust normalize round-trip + commit. */
  commit(): void {
    this.enqueueReconcile({ skipWriteIfSame: false });
  }
  /** Retry a failed draft save without discarding local state. */
  retrySave(): void {
    void this.saveDraftNow();
  }
  /** Replace the whole raw draft (e.g. sample fill) as one epoch bump. */
  replaceForm(form: RawProjectInputDto): void {
    if (this.state.status !== 'ready') return;
    this.form = structuredClone(form);
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  private enqueueReconcile(opts: { skipWriteIfSame: boolean }): void {
    this.reconcileQueue = this.reconcileQueue.then(() => this.reconcile(opts));
  }
  private async reconcile(opts: { skipWriteIfSame: boolean }): Promise<void> {
    if (!this.form || this.closed || this.state.status !== 'ready') return;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    const generation = String(this.generation);
    const epoch = String(this.epoch);
    const form = structuredClone(this.form);
    const client = await this.controller.ensure().catch(() => null);
    if (!client || this.closed || String(this.epoch) !== epoch) return;
    client.setEpoch(epoch);
    let normalized: ProjectInput | null = null;
    let inputDigest: string | null;
    let diagnostics: Diagnostic[];
    try {
      const reply = await client.request({
        kind: 'normalizeInput',
        input: { kind: 'project', project: form },
        priorInputDigest: this.state.inputDigest,
        formatRequests: [],
      });
      if (reply.kind !== 'normalized') throw new Error('unexpected_worker_event');
      if (this.closed || String(this.epoch) !== epoch || String(this.generation) !== generation)
        return;
      diagnostics = reply.diagnostics;
      if (reply.normalizedInput?.kind === 'project') normalized = reply.normalizedInput.input;
      inputDigest = reply.inputDigest;
    } catch (error) {
      if (error instanceof StaleRequest) return;
      if (this.closed || String(this.epoch) !== epoch) return;
      this.patch({
        saveState: 'error',
        saveError: `normalize_failed:${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    this.patch({ diagnostics, normalizedInput: normalized ?? this.state.normalizedInput });
    // Skip the write when nothing semantic changed and the stored draft
    // already carries the same validation state (e.g. a plain reload). The
    // normalize round-trip still ran, so the restored draft is confirmed —
    // clear staleInput rather than leaving the project dirty forever.
    if (opts.skipWriteIfSame && generation === String(this.lastCommittedGeneration)) {
      this.patch({
        staleInput: false,
        inputDigest: inputDigest ?? this.state.inputDigest,
      });
      return;
    }
    const result = await this.repo
      .commitNormalizedInput({
        projectId: this.projectId,
        generation,
        editorSessionId: this.editorSessionId(),
        form,
        validation: {
          status: diagnostics.length === 0 ? 'valid' : 'invalid',
          diagnostics,
        },
        normalized,
        inputDigest,
        engineBuildId: this.engineBuildId,
      })
      .catch((error: unknown): CommitResult | Error =>
        error instanceof Error ? error : new Error(String(error)));
    if (result instanceof Error) {
      this.applyStoreError(result);
      return;
    }
    const revisionChanged =
      result.status === 'committed' && result.inputRevision !== this.state.inputRevision;
    this.applyCommit(result, generation);
    if (this.closed) return;
    this.patch({
      staleInput: this.generation > this.lastCommittedGeneration,
      inputDigest: inputDigest ?? this.state.inputDigest,
    });
    if (revisionChanged && normalized) {
      // The committed input moved: any in-flight search belongs to the old
      // context — `activateProject` drops it engine-side, so retire the pump
      // rather than let its steps fail against a stale search id.
      if (this.pump?.isRunning || this.state.plan.search === 'running' || this.state.plan.search === 'cancelling') {
        this.pump?.dispose();
        this.patchPlan({ search: 'idle', progress: null, searchError: null });
      }
      // A committed input change ends the layout-edit chain too — the chain
      // is bound to the old input digest and can never ride across.
      this.clearEditChain();
      const catalog = await this.repo.getCatalog(normalized.catalogPin.catalogDigest).catch(() => null);
      await this.installContext(client, normalized, catalog);
    }
  }

  // ---------- plan / search / accept ----------

  /** Rust strategy proposals for the activated input; display only. */
  private async refreshStrategies(client: ProbeClient): Promise<void> {
    try {
      const reply = await client.request({ kind: 'proposeStrategies' });
      if (this.closed || reply.kind !== 'strategiesProposed') return;
      this.patchPlan({ strategies: reply.decisions, strategiesError: null });
    } catch (error) {
      if (this.closed || error instanceof StaleRequest) return;
      this.patchPlan({
        strategies: null,
        strategiesError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  /** Change the strategy on the raw draft; the input commit re-evaluates. */
  setStrategy(strategy: Strategy): void {
    if (!this.form || this.state.status !== 'ready') return;
    if (this.form.strategyChoice === strategy) return;
    this.form = { ...this.form, strategyChoice: strategy };
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  /**
   * Explicit catalog pin change (Ticket 008). The digest the user picked is
   * what the next input commit binds — activation uses exactly that catalog
   * row and degrades rather than substituting a different one.
   */
  setCatalogPin(pin: CatalogPin): void {
    if (!this.form || this.state.status !== 'ready') return;
    if (
      this.form.catalogPin.catalogDigest === pin.catalogDigest &&
      this.form.catalogPin.catalogVersion === pin.catalogVersion
    )
      return;
    this.form = { ...this.form, catalogPin: { ...pin } };
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  /**
   * Embed a library container in the draft (Ticket 008). `raw` is the exact
   * by-value re-serialization of the normalized record — Rust re-normalizes
   * it on commit, so stored physical facts never move under a catalog change.
   */
  upsertOwnedContainer(raw: RawOwnedContainerDto): void {
    if (!this.form || this.state.status !== 'ready') return;
    const owned = this.form.ownedContainers.filter((o) => o.id !== raw.id);
    owned.push(raw);
    this.form = { ...this.form, ownedContainers: owned };
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  removeOwnedContainer(ownedId: string): void {
    if (!this.form || this.state.status !== 'ready') return;
    if (!this.form.ownedContainers.some((o) => o.id === ownedId)) return;
    this.form = {
      ...this.form,
      ownedContainers: this.form.ownedContainers.filter((o) => o.id !== ownedId),
    };
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  /**
   * Progress rows for the current accepted binding only. An unreadable or
   * absent binding yields `null`/`{}` — never a fabricated all-todo state
   * carried across snapshots.
   */
  private async loadActionProgress(): Promise<void> {
    const accepted = this.state.plan.accepted;
    if (!accepted) {
      this.patchPlan({ actionProgress: {}, actionError: null });
      return;
    }
    const rows = await this.repo
      .actionProgressFor(this.projectId, accepted.inputRevision, accepted.planSnapshotId)
      .catch(() => null);
    if (rows === null) {
      this.patchPlan({ actionProgress: null, actionError: 'progress_unavailable' });
      return;
    }
    this.patchPlan({
      actionProgress: Object.fromEntries(rows.map((r) => [r.stepId, r.status])),
      actionError: null,
    });
  }
  /**
   * One accepted-plan step toggle. The repository enforces the exact
   * snapshot/input binding plus prerequisite/dependent ordering; this session
   * only surfaces the result — progress never migrates to a newer snapshot.
   */
  async toggleActionStep(stepId: string, done: boolean): Promise<void> {
    const accepted = this.state.plan.accepted;
    if (!accepted) {
      this.patchPlan({ actionError: 'not_accepted' });
      return;
    }
    const result = await this.repo
      .setActionStep({
        projectId: this.projectId,
        inputRevision: accepted.inputRevision,
        planSnapshotId: accepted.planSnapshotId,
        stepId,
        done,
      })
      .catch((error: unknown) => error as Error);
    if (result instanceof Error) {
      this.patchPlan({ actionError: result.message });
      return;
    }
    if (result.status === 'saved') {
      this.broadcast(result.projectRevision);
      this.patch({ projectRevision: result.projectRevision });
      const progress = { ...(this.state.plan.actionProgress ?? {}) };
      progress[stepId] = done ? 'done' : 'todo';
      this.patchPlan({ actionProgress: progress, actionError: null });
      return;
    }
    this.patchPlan({ actionError: result.status });
  }
  /**
   * One continuous search on the activated context. Steps are bounded WASM
   * calls on macrotasks so a cancel request is always serviced between them.
   * Starting a new search disposes the old one (Rust does the same).
   */
  startSearch(options?: { stepAllowance?: number }): void {
    const client = this.controller.current;
    if (
      !client ||
      this.state.status !== 'ready' ||
      this.state.context !== 'installed' ||
      this.state.inputDigest === null
    ) {
      this.patchPlan({
        searchError:
          this.state.context !== 'installed'
            ? 'context_not_installed'
            : 'no_committed_input',
      });
      return;
    }
    this.pump?.dispose();
    const pump = new SearchPump(client, {
      stepAllowance: options?.stepAllowance,
    });
    this.pump = pump;
    const resultInputDigest = this.state.inputDigest;
    this.patchPlan({
      search: 'running',
      progress: null,
      searchError: null,
      alternatives: [],
      termination: null,
      diagnostics: [],
      selectedId: null,
      resultInputDigest: null,
    });
    void pump
      .start('continuous', {
        onProgress: (event) => {
          this.patchPlan({ progress: event.consumed });
        },
        onCompleted: (event) => {
          const alternatives = event.result.alternatives;
          for (const alt of alternatives)
            this.snapshotIndex.set(alt.planSnapshotId, alt);
          this.patchPlan({
            search: 'done',
            progress: event.result.consumed,
            alternatives,
            termination: event.result.termination,
            diagnostics: event.result.diagnosticCandidates,
            selectedId: alternatives[0]?.planSnapshotId ?? null,
            resultInputDigest,
          });
        },
        onCancelled: (event) => {
          this.patchPlan({ search: 'cancelled', progress: event.consumed });
        },
        onFailed: (error) => {
          this.patchPlan({ search: 'failed', searchError: error.message });
        },
        onCancelTimeout: () => {
          this.patchPlan({ searchError: 'cancel_timeout' });
        },
        onStalled: () => {
          this.patchPlan({ searchError: 'search_stalled' });
        },
      })
      .catch((error: unknown) => {
        if (error instanceof StaleRequest) return;
        this.patchPlan({
          search: 'failed',
          searchError: error instanceof Error ? error.message : String(error),
        });
      });
  }
  /** Cooperative cancel; the pump settles it into 'cancelled' or 'failed'. */
  cancelSearch(): void {
    if (!this.pump?.isRunning) return;
    this.patchPlan({ search: 'cancelling' });
    this.pump.cancel();
  }
  selectAlternative(planSnapshotId: string): void {
    if (
      this.state.plan.alternatives.some(
        (a) => a.planSnapshotId === planSnapshotId,
      )
    ) {
      this.patchPlan({ selectedId: planSnapshotId });
    }
  }
  /**
   * §3.3 accept: Rust re-verifies the snapshot bytes, then the repository
   * binds it to the still-current input in one CAS transaction. A stale
   * evaluation is refused, never silently re-pinned.
   */
  async acceptPlan(planSnapshotId: string): Promise<void> {
    const snapshot =
      this.state.plan.alternatives.find(
        (a) => a.planSnapshotId === planSnapshotId,
      ) ??
      (this.state.plan.edit.head?.planSnapshotId === planSnapshotId
        ? this.state.plan.edit.head
        : this.state.plan.acceptedSnapshot?.planSnapshotId === planSnapshotId
          ? this.state.plan.acceptedSnapshot
          : null);
    if (!snapshot || this.state.plan.acceptState === 'saving') return;
    this.patchPlan({ acceptState: 'saving', acceptError: null });
    const client = this.controller.current;
    if (client) {
      const reply = await client
        .request({ kind: 'verifyRecord', record: { kind: 'snapshot', snapshot } })
        .catch((error: unknown) => error as Error);
      if (reply instanceof Error) {
        this.patchPlan({ acceptState: 'error', acceptError: reply.message });
        return;
      }
      if (reply.kind !== 'recordVerified' || !reply.verified) {
        this.patchPlan({ acceptState: 'error', acceptError: 'integrity_failed' });
        return;
      }
    }
    try {
      const result = await this.repo.acceptSnapshot({
        projectId: this.projectId,
        snapshot,
        engineBuildId: this.engineBuildId,
      });
      if (result.status === 'committed') {
        this.broadcast(result.projectRevision);
        this.patch({ projectRevision: result.projectRevision });
        this.patchPlan({
          accepted: {
            inputRevision: this.state.inputRevision,
            planSnapshotId,
          },
          acceptedSnapshot: snapshot,
          acceptState: 'saved',
        });
        // A new binding starts with its own rows — reload rather than carry.
        void this.loadActionProgress();
      } else if (result.status === 'conflict') {
        this.patch({ conflict: { remoteRevision: 'unknown' }, saveState: 'conflict' });
        this.patchPlan({ acceptState: 'error', acceptError: 'conflict' });
      } else {
        this.patchPlan({ acceptState: 'error', acceptError: result.status });
      }
    } catch (error) {
      this.patchPlan({
        acceptState: 'error',
        acceptError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  /** Whether a snapshot was evaluated against the currently committed input. */
  isCurrentSnapshot(snapshot: PlanSnapshot): boolean {
    return (
      !this.state.staleInput &&
      this.state.inputDigest !== null &&
      snapshot.content.versions.inputDigest === this.state.inputDigest &&
      snapshot.content.versions.catalogDigest ===
        this.state.normalizedInput?.catalogPin.catalogDigest
    );
  }

  // ---------- layout editing (ZARI-007) ----------

  /** Placement selection for the inspector; harmless at any time. */
  selectPlacement(placementId: string | null): void {
    const edit = this.state.plan.edit;
    if (edit.selectedPlacementId !== placementId)
      this.patchPlan({ edit: { ...edit, selectedPlacementId: placementId } });
  }
  /**
   * Send one layout edit command to Rust. The command stays provisional —
   * only a reply that (a) is the newest edit request, (b) arrives under the
   * still-active context and (c) carries a verified snapshot can commit. Any
   * newer request supersedes the reply, so a late answer can never overwrite
   * a newer command.
   */
  requestLayoutEdit(command: LayoutEditCommand, baseSnapshotId: string): void {
    const client = this.controller.current;
    const base = this.snapshotIndex.get(baseSnapshotId) ?? null;
    const refuse = (diagnostics: Diagnostic[]) => {
      const edit = this.state.plan.edit;
      this.patchPlan({
        edit: {
          ...edit,
          rejection: { command, baseSnapshotId, diagnostics, report: null },
        },
      });
    };
    if (
      !client ||
      this.state.status !== 'ready' ||
      this.state.context !== 'installed'
    ) {
      refuse([
        {
          fieldPath: 'context',
          code: 'context_not_installed',
          reasonCode: 'context_not_installed',
        },
      ]);
      return;
    }
    if (!base || !this.isCurrentSnapshot(base)) {
      refuse([
        {
          fieldPath: 'base',
          code: 'edit_base_not_in_scope',
          reasonCode: 'edit_base_not_in_scope',
        },
      ]);
      return;
    }
    const seq = ++this.editSeq;
    const source =
      command.kind === 'restoreLayout'
        ? (this.snapshotIndex.get(command.sourceSnapshotId) ?? null)
        : null;
    const edit = this.state.plan.edit;
    this.patchPlan({
      edit: {
        ...edit,
        pending: { command, baseSnapshotId },
        rejection: null,
      },
    });
    void this.evaluateEdit(client, seq, base, command, source, 'push', null);
  }
  /**
   * Undo the newest committed edit by asking Rust to revalidate the prior
   * layout (`restoreLayout` to the transition's base). Undo is a fresh
   * request with a fresh request id — an old request token is never revived.
   */
  undoEdit(): void {
    const edit = this.state.plan.edit;
    const transition = edit.undo.at(-1);
    if (
      !transition ||
      !edit.head ||
      edit.pending ||
      this.state.status !== 'ready' ||
      this.state.context !== 'installed'
    )
      return;
    const client = this.controller.current;
    const source = this.snapshotIndex.get(transition.baseSnapshotId) ?? null;
    if (!client || !source) return;
    const command: LayoutEditCommand = {
      kind: 'restoreLayout',
      sourceSnapshotId: transition.baseSnapshotId,
    };
    const seq = ++this.editSeq;
    this.patchPlan({
      edit: {
        ...edit,
        pending: { command, baseSnapshotId: edit.head.planSnapshotId },
        rejection: null,
      },
    });
    void this.evaluateEdit(client, seq, edit.head, command, source, 'undo', transition);
  }
  /** Redo replays the undone command against the current head. */
  redoEdit(): void {
    const edit = this.state.plan.edit;
    const transition = edit.redo.at(-1);
    if (
      !transition ||
      !edit.head ||
      edit.pending ||
      this.state.status !== 'ready' ||
      this.state.context !== 'installed'
    )
      return;
    const client = this.controller.current;
    if (!client) return;
    const command = transition.command;
    const source =
      command.kind === 'restoreLayout'
        ? (this.snapshotIndex.get(command.sourceSnapshotId) ?? null)
        : null;
    const seq = ++this.editSeq;
    this.patchPlan({
      edit: {
        ...edit,
        pending: { command, baseSnapshotId: edit.head.planSnapshotId },
        rejection: null,
      },
    });
    void this.evaluateEdit(client, seq, edit.head, command, source, 'redo', transition);
  }
  private async evaluateEdit(
    client: ProbeClient,
    seq: number,
    base: PlanSnapshot,
    command: LayoutEditCommand,
    source: PlanSnapshot | null,
    mode: 'push' | 'undo' | 'redo',
    carried: EditTransition | null,
  ): Promise<void> {
    const reply = await client
      .request({
        kind: 'evaluateLayoutEdit',
        baseSnapshot: base,
        command,
        sourceSnapshot: source,
      })
      .catch((error: unknown) => error as Error);
    // Superseded or session closed: drop the reply without touching state.
    if (this.closed || seq !== this.editSeq) return;
    if (reply instanceof Error) {
      const edit = this.state.plan.edit;
      if (reply instanceof StaleRequest) {
        // Transport-level staleness (epoch/activation moved): the pending
        // ghost is dead; the committed chain survives a same-input reload.
        this.patchPlan({ edit: { ...edit, pending: null } });
        return;
      }
      this.patchPlan({
        edit: {
          ...edit,
          pending: null,
          rejection: {
            command,
            baseSnapshotId: base.planSnapshotId,
            diagnostics: [
              {
                fieldPath: 'worker',
                code: reply.message,
                reasonCode: reply.message,
              },
            ],
            report: null,
          },
        },
      });
      return;
    }
    if (reply.kind !== 'editEvaluated') return;
    const edit = this.state.plan.edit;
    if (!reply.snapshot) {
      // Rejected edit: explain from Rust diagnostics and the check report —
      // provisional geometry never becomes a plan.
      this.patchPlan({
        edit: {
          ...edit,
          pending: null,
          rejection: {
            command,
            baseSnapshotId: base.planSnapshotId,
            diagnostics: reply.diagnostics,
            report: reply.report,
          },
        },
      });
      return;
    }
    const next = reply.snapshot;
    this.snapshotIndex.set(next.planSnapshotId, next);
    let undo = edit.undo;
    let redo = edit.redo;
    let chainBaseId = edit.chainBaseId;
    if (mode === 'undo') {
      undo = undo.slice(0, -1);
      if (carried) redo = [...redo, carried];
    } else {
      const transition: EditTransition = {
        baseSnapshotId: base.planSnapshotId,
        command,
        resultSnapshotId: next.planSnapshotId,
      };
      if (mode === 'redo') {
        redo = redo.slice(0, -1);
        undo = [...undo, transition];
      } else {
        redo = [];
        if (chainBaseId && edit.head?.planSnapshotId === base.planSnapshotId) {
          undo = [...undo, transition];
        } else {
          // An edit on a different base starts a fresh chain.
          chainBaseId = base.planSnapshotId;
          undo = [transition];
        }
      }
    }
    this.patchPlan({
      edit: {
        ...edit,
        pending: null,
        rejection: null,
        chainBaseId,
        head: next,
        undo,
        redo,
      },
    });
    // Persist result + base + bounded chain in one CAS transaction.
    const chain = this.serializeEditChain();
    const result = await this.repo
      .commitEditSnapshot({
        projectId: this.projectId,
        snapshot: next,
        base,
        edit: chain,
        engineBuildId: this.engineBuildId,
      })
      .catch((error: unknown): CommitResult | { status: 'stale_input' } | Error =>
        error instanceof Error ? error : new Error(String(error)));
    if (result instanceof Error) {
      this.applyStoreError(result);
      return;
    }
    if (result.status === 'committed') {
      this.broadcast(result.projectRevision);
      this.patch({ projectRevision: result.projectRevision });
    } else if (result.status === 'conflict') {
      this.patch({ conflict: { remoteRevision: 'unknown' }, saveState: 'conflict' });
    } else {
      const editNow = this.state.plan.edit;
      this.patchPlan({
        edit: {
          ...editNow,
          rejection: {
            command,
            baseSnapshotId: base.planSnapshotId,
            diagnostics: [
              { fieldPath: 'edit', code: result.status, reasonCode: result.status },
            ],
            report: null,
          },
        },
      });
    }
  }
  /** Persisted chain bounded to 100 transitions and 1 MiB of serialized history. */
  private serializeEditChain(): EditChain | null {
    const edit = this.state.plan.edit;
    if (!edit.chainBaseId || !edit.head || !this.state.inputDigest) return null;
    let undo = edit.undo.slice(-100);
    const redo = edit.redo.slice(-100);
    const fits = (u: EditTransition[], r: EditTransition[]): boolean =>
      new TextEncoder().encode(
        JSON.stringify({ undo: u, redo: r }),
      ).length <= 1024 * 1024;
    while (undo.length > 0 && !fits(undo, redo)) undo = undo.slice(1);
    if (!fits(undo, redo)) return null;
    return {
      inputDigest: this.state.inputDigest,
      baseSnapshotId: edit.chainBaseId,
      headSnapshotId: edit.head.planSnapshotId,
      undo,
      redo,
    };
  }
  /**
   * Restore a persisted chain on open: only when it is bound to the still
   * current input digest and every referenced snapshot row resolves. A stale
   * or partially missing chain is dropped, never partially trusted.
   */
  private restoreEditChain(chain: EditChain | null, inputDigest: string | null): void {
    if (!chain || !inputDigest || chain.inputDigest !== inputDigest) return;
    const resolve = (id: string) => this.snapshotIndex.get(id);
    const known = (t: EditTransition) =>
      resolve(t.baseSnapshotId) !== undefined &&
      resolve(t.resultSnapshotId) !== undefined;
    const head = resolve(chain.headSnapshotId);
    if (
      !head ||
      resolve(chain.baseSnapshotId) === undefined ||
      ![...chain.undo, ...chain.redo].every(known)
    )
      return;
    const edit = this.state.plan.edit;
    this.patchPlan({
      edit: {
        ...edit,
        chainBaseId: chain.baseSnapshotId,
        head,
        undo: chain.undo,
        redo: chain.redo,
      },
    });
  }
  /** Drop the working chain; called when the committed input moves. */
  private clearEditChain(): void {
    const edit = this.state.plan.edit;
    if (!edit.chainBaseId && !edit.head && !edit.pending && !edit.rejection) return;
    this.editSeq += 1;
    this.patchPlan({
      edit: {
        selectedPlacementId: null,
        pending: null,
        rejection: null,
        chainBaseId: null,
        head: null,
        undo: [],
        redo: [],
      },
    });
  }

  // ---------- conflict recovery / export ----------

  /** Discard local dirty state and reload the committed bundle. */
  async reloadLatest(): Promise<void> {
    this.repo.refreshRevision(this.projectId);
    const bundle = await this.repo.loadBundle(this.projectId).catch(() => null);
    if (!bundle) return;
    this.form = bundle.draft?.form ?? this.form;
    if (bundle.draft) {
      this.generation = Number(bundle.draft.generation);
      this.lastCommittedGeneration = this.generation;
    }
    const accepted = bundle.project.accepted;
    this.snapshotIndex = new Map(
      bundle.snapshots.map((s) => [s.planSnapshotId, s.snapshot]),
    );
    this.patch({
      form: this.form,
      normalizedInput: bundle.input?.input ?? this.state.normalizedInput,
      inputDigest: bundle.project.currentInputDigest,
      inputRevision: bundle.project.currentInputRevision,
      projectRevision: bundle.project.projectRevision,
      conflict: null,
      saveState: 'saved',
      saveError: null,
      staleInput: false,
      corrupt: bundle.corrupt,
    });
    this.restoreEditChain(bundle.draft?.edit ?? null, bundle.project.currentInputDigest);
    this.patchPlan({
      accepted,
      acceptedSnapshot: accepted
        ? (bundle.snapshots.find((s) => s.planSnapshotId === accepted.planSnapshotId)
            ?.snapshot ?? null)
        : null,
    });
    void this.loadActionProgress();
  }
  /** Conflict path: copy the dirty draft into a fresh project. */
  async saveAsCopy(name?: string): Promise<string | null> {
    if (!this.form) return null;
    const row = await this.repo
      .saveAsNewProject(name ?? `${this.state.name} (copy)`, this.form, this.validationFor())
      .catch(() => null);
    return row?.projectId ?? null;
  }
  async exportJson(kind: 'standard' | 'recovery' = 'standard'): Promise<ProjectExport | null> {
    try {
      const bundle = await this.repo.loadBundle(this.projectId);
      return await exportProject(this.repo, bundle, this.engineBuildId, kind);
    } catch {
      return null;
    }
  }

  // ---------- close ----------

  /**
   * Flush pending work then release the project context. Returns false when
   * a save could not commit — the caller must offer retry/export/discard
   * rather than navigating away silently.
   */
  async close(discard = false): Promise<boolean> {
    if (this.closed) return true;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      if (!discard && this.generation > this.lastCommittedGeneration && this.form)
        await this.saveDraftNow();
    }
    if (!discard && this.state.saveState === 'conflict') {
      this.patch({ closeBlocked: 'conflict' });
      return false;
    }
    if (!discard && this.state.saveState === 'error') {
      this.patch({ closeBlocked: this.state.saveError ?? 'persistence_failed' });
      return false;
    }
    this.closed = true;
    this.pump?.dispose();
    this.channel?.close();
    const client = this.controller.current;
    if (client) {
      await client.request({ kind: 'disposeProject' }).catch(() => undefined);
    }
    return true;
  }
}
