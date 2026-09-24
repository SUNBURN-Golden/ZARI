import type {
  Diagnostic,
  ProjectInput,
  RawProjectInputDto,
  Unit,
  VerifiableRecordDto,
} from '../../contracts/generated/dto';
import { exportProject, type ProjectExport } from '../../persistence/export';
import {
  StoreError,
  type CommitResult,
  type CorruptRecord,
  type ProjectBundle,
  type ProjectRepository,
} from '../../persistence/repository';
import type { ProbeClient } from '../../worker/client';
import { StaleRequest } from '../../worker/client';
import { WorkerController, type WorkerLifecycle } from '../../worker/controller';
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
    };
    controller.onLifecycle((worker, error) => {
      this.patch({ worker, workerError: error?.message ?? null });
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
    // already carries the same validation state (e.g. a plain reload).
    if (opts.skipWriteIfSame && generation === String(this.lastCommittedGeneration)) return;
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
      const catalog = await this.repo.getCatalog(normalized.catalogPin.catalogDigest).catch(() => null);
      await this.installContext(client, normalized, catalog);
    }
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
    this.channel?.close();
    const client = this.controller.current;
    if (client) {
      await client.request({ kind: 'disposeProject' }).catch(() => undefined);
    }
    return true;
  }
}
