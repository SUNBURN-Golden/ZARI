import type {
  CatalogPin,
  CatalogSnapshot,
  Diagnostic,
  LayoutEditCommand,
  PlanSnapshot,
  ProjectInput,
  SpatialProjection,
  SpatialViewSource,
  MeasurementOrigin,
  RawOwnedContainerDto,
  RawProjectInputDto,
  RawUncertaintyDto,
  RejectedCandidate,
  SearchCounters,
  SearchScope,
  SearchTermination,
  SearchDiagnosticReply,
  IncrementalPins,
  IncrementalReply,
  ParetoReply,
  Strategy,
  StrategyDecision,
  StrategyLibraryReply,
  Unit,
  ValidationReport,
  VerifiableRecordDto,
} from '../../contracts/generated/dto';
import { exportProject, type ProjectExport } from '../../persistence/export';
import type { EditChain, EditTransition } from '../../persistence/db';
import {
  StoreError,
  progressIdentity,
  type ActionProgressStamp,
  type ActionStepResult,
  type CommitResult,
  type CorruptRecord,
  type ProjectBundle,
  type ProjectRepository,
} from '../../persistence/repository';
import { StaleRequest, WORKER_BUILD_ID, WORKER_RULE_VERSION, type ProbeClient } from '../../worker/client';
import {
  evaluateLibraryOnce,
  forgetLibraryEvaluation,
  libraryKey,
} from '../strategy/controller';
import {
  compareParetoOnce,
  forgetParetoComparison,
  paretoKey,
} from '../pareto/controller';
import {
  forgetReplan,
  replanAdoptAllowed,
  replanKey,
  replanOnce,
  replanReplyApplies,
  type IncrementalPanelState,
} from '../incremental/controller';
import {
  diagnoseOnce,
  diagnosisReplyApplies,
  diagnosticKey,
  forgetDiagnosis,
  type DiagnosticPanelState,
} from '../diagnostics/controller';
import {
  SearchPump,
  WorkerController,
  type WorkerLifecycle,
} from '../../worker/controller';
import {
  applyGroupFormatResult,
  canRequestGroupUnit,
  currentLengthUnit,
  writeBaseSupport,
  writeEvidence,
  writeNominal,
  writeOrigin,
  writeUncertainty,
  type EvidenceDraft,
} from './detailFacts';
import type { MeasurementField } from './draft';
import {
  ProjectionCache,
  inputSourceKey,
  planSourceKey,
  projectionAccepts,
  projectionLeaseMatches,
  type ProjectionEntry,
  type ProjectionLease,
} from '../plan/projection';
import { leasesEqual, type WorkspaceLease } from '../workspace/lease';
import { holdProgressReply } from './progressGate';
import { holdProjectionReply, maybeCorruptProjection } from './projectionGate';
import {
  EMPTY_NEXT_FACTS,
  nextFactsLeaseMatches,
  nextFactsReplyMatches,
  nextFactsSourceKey,
  type NextFactsLease,
  type NextFactsView,
} from './nextFacts';
import {
  holdNextFactsReply,
  maybeForeignNextFacts,
  takeNextFactsInjection,
} from './nextFactsGate';
import type { NextFactsReply } from '../../contracts/generated/dto';
import { shouldApplyProgressReply, type GuideEligibility } from '../workspace/stepFocus';

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
  | 'interrupted'
  | 'failed';
export type AcceptState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Layout editing surface (ZARI-007). `pending` is the only provisional value:
 * it carries the command bytes awaiting Rust evaluation and is never mistaken
 * for a verified plan. `rejection` explains the last refused command through
 * Rust diagnostics and — when the layout reached the validator — the failing
 * report checks. `undo`/`redo` hold committed transitions only.
 */
export type EditPersist = { kind: 'saving' } | { kind: 'unsaved' } | { kind: 'conflict' };

export interface EditState {
  selectedPlacementId: string | null;
  pending: { command: LayoutEditCommand; baseSnapshotId: string; lease: WorkspaceLease } | null;
  /**
   * Rust accepted the working head, but the device write did not.
   * Distinct from a rejected command and from the accepted-plan badge.
   */
  persist: EditPersist | null;
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
  /** Rust recipe comparison for the saved input. Not a snapshot field. */
  strategyLibrary: StrategyLibraryReply | null;
  strategyLibraryError: string | null;
  strategyLibraryState: 'idle' | 'pending' | 'ready' | 'empty' | 'error';
  /** Rust Pareto reply for the last completed search. Not a snapshot field. */
  pareto: ParetoReply | null;
  paretoError: string | null;
  paretoState: 'idle' | 'pending' | 'ready' | 'empty' | 'error';
  /** Rust pin-preserving replan. Not a snapshot field and not an adoption. */
  incremental: IncrementalReply | null;
  incrementalError: string | null;
  incrementalState: IncrementalPanelState;
  /** Late replies noticed after cancel. They do not change `selectedId`. */
  incrementalIgnored: number;
  /** Rust separation of no product, geometry, unknown, and budget. Not a snapshot field. */
  diagnostic: SearchDiagnosticReply | null;
  diagnosticError: string | null;
  diagnosticState: DiagnosticPanelState;
  /** Late diagnosis replies noticed after cancel. They do not change `selectedId`. */
  diagnosticIgnored: number;
  /** Scope from the search that just finished. Absent for cancel and interrupt. */
  searchScope: SearchScope | null;
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
  /** `error` is a failed read. `loading` is not a failed read and is not all-todo. */
  progressLoad: 'idle' | 'loading' | 'ready' | 'error';
  actionError: string | null;
  /** Last progress write that threw. Blocked reasons are not retries. */
  actionRetry: { stepId: string; done: boolean } | null;
  /**
   * Ephemeral Rust eligibility for the accepted snapshot. Not stored.
   * `null` is not a pass.
   */
  actionEligibility: GuideEligibility | null;
  edit: EditState;
  /**
   * Ephemeral spatial projections keyed by `plan:<planSnapshotId>`.
   * Not written to IndexedDB, export, or the snapshot hash.
   */
  projections: Record<string, ProjectionEntry>;
  /** Ephemeral completion list. Not written to IndexedDB, export, or a snapshot. */
  nextFacts: NextFactsView;
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
  /** Bumped when the worker activation or committed input identity changes. */
  workspaceGeneration: string;
  worker: WorkerLifecycle;
  workerError: string | null;
  /** Integrity results from `verifyRecord` on open; `null` = not run. */
  integrity: { record: string; verified: boolean; diagnostics: Diagnostic[] }[] | null;
  closeBlocked: string | null;
  /** Set when a group unit change is refused. Not persisted. */
  unitHold: { fieldPath: string; code: string } | null;
  /** Worker normalize calls from this session, including group formatting. */
  normalizeRequests: number;
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
  /** Search counters update this set without redrawing the rest of the plan. */
  private searchStatusListeners = new Set<() => void>();
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
  /**
   * Search steps stay on the worker. Painting every counter into the plan
   * screen blocks the next step on a full render, and the status live region
   * would announce each one. Counters flush on this interval instead.
   */
  private searchProgressTimer: ReturnType<typeof setTimeout> | null = null;
  private searchProgressPending: SearchCounters | null = null;
  /**
   * Set only by a successful activate on the current worker. A trap, hard
   * cancel, or crash clears it. The next search waits for a new activation.
   */
  private searchLease: { activationId: string; workerSessionId: string } | null = null;
  /** Every verified snapshot this session has seen, keyed by immutable id. */
  private snapshotIndex = new Map<string, PlanSnapshot>();
  /** Monotonic edit token: a late reply older than the newest request dies. */
  private editSeq = 0;
  /** Latest undo/redo shortcut pressed while a command is pending or its save is in flight. */
  private historyIntent: 'undo' | 'redo' | null = null;
  /** Drops a projection reply after close or a replaced session mount. */
  private projectionMounted = 0;
  private projectionCache = new ProjectionCache();
  private projectionFlight = new Set<string>();
  /** Worker `projectSpatialView` sends. Cache hits and focus changes do not increment. */
  private spatialRequestsSent = 0;
  /** Worker `queryNextFacts` sends. Focus, keystrokes, and cache hits do not increment. */
  private nextFactsRequestsSent = 0;
  private nextFactsMounted = 0;
  private nextFactsFlight: string | null = null;
  private nextFactsCache = new Map<string, NextFactsReply>();
  private nextFactsPrimed = false;
  private nextFactsAwaitingRecovery = false;
  /** Drops a Pareto reply that belongs to an older search or input revision. */
  private paretoEpoch = 0;
  /** Drops a replan reply after cancel, a new ask, an input commit, or a search. */
  private incrementalEpoch = 0;
  /** Epoch of the reply currently held. Adopt requires this to match. */
  private incrementalReplyEpoch = 0;
  private incrementalKey: string | null = null;
  /** Drops a diagnosis reply after cancel, a new search, or an input commit. */
  private diagnosticEpoch = 0;
  private diagnosticKey: string | null = null;
  /**
   * Set only by the explicit goal recalculation. Consumed by the next
   * non-autosave reconcile. A search starts only after that commit installs.
   */
  private paretoFollowCommit = false;
  /**
   * Bumped when the accepted binding is replaced or the session reloads.
   * An in-flight progress reply captured against an older epoch is dropped.
   */
  private progressEpoch = 0;
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
      workspaceGeneration: '0',
      worker: 'uninitialized',
      workerError: null,
      integrity: null,
      closeBlocked: null,
      unitHold: null,
      normalizeRequests: 0,
      plan: {
        strategies: null,
        strategiesError: null,
        strategyLibrary: null,
        strategyLibraryError: null,
        strategyLibraryState: 'idle',
        pareto: null,
        paretoError: null,
        paretoState: 'idle',
        incremental: null,
        incrementalError: null,
        incrementalState: 'idle',
        incrementalIgnored: 0,
        diagnostic: null,
        diagnosticError: null,
        diagnosticState: 'idle',
        diagnosticIgnored: 0,
        searchScope: null,
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
        progressLoad: 'idle',
        actionError: null,
        actionRetry: null,
        actionEligibility: null,
        edit: {
          selectedPlacementId: null,
          pending: null,
          persist: null,
          rejection: null,
          chainBaseId: null,
          head: null,
          undo: [],
          redo: [],
        },
        projections: {},
        nextFacts: EMPTY_NEXT_FACTS,
      },
    };
    controller.onLifecycle((worker, error) => {
      this.patch({ worker, workerError: error?.message ?? null });
      // A crash takes the activated context with it; do not keep advertising
      // 'installed' from the dead Worker session. The first open skips this —
      // status is still 'loading' while open() runs its own installContext.
      if (worker === 'failed' && !this.closed && this.state.status === 'ready') {
        this.searchLease = null;
        this.patch({ context: 'none' });
      }
      if (worker === 'failed' && !this.closed) this.dropNextFactsForWorker();
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
  /**
   * The search status line. Counter-only updates stay here so a solver step
   * does not wait for the plan screen to render.
   */
  subscribeSearchStatus(listener: () => void): () => void {
    this.searchStatusListeners.add(listener);
    return () => this.searchStatusListeners.delete(listener);
  }
  private patch(part: Partial<SessionSnapshot>): void {
    this.state = { ...this.state, ...part };
    for (const listener of this.listeners) listener(this.state);
  }
  private patchPlan(part: Partial<PlanState>): void {
    const counterOnly =
      Object.keys(part).length === 1 && Object.prototype.hasOwnProperty.call(part, 'progress');
    this.state = { ...this.state, plan: { ...this.state.plan, ...part } };
    if (!counterOnly) {
      for (const listener of this.listeners) listener(this.state);
    }
    for (const listener of this.searchStatusListeners) listener();
  }
  get snapshot(): SessionSnapshot {
    return this.state;
  }
  get isClosed(): boolean {
    return this.closed;
  }
  /** How many spatial projections were actually requested from the Worker. */
  get spatialRequestCount(): number {
    return this.spatialRequestsSent;
  }
  private bump(): { generation: string; epoch: string; form: RawProjectInputDto } {
    this.generation += 1;
    this.epoch += 1;
    this.controller.current?.setEpoch(String(this.epoch));
    this.invalidateNextFactsForDraft();
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
    try {
      await this.activateContext(client, input, catalog);
    } finally {
      // activate() rejects in-flight system requests. Ask again after it
      // settles so a projection started during commit is not left failed.
      if (!this.closed) this.refreshInputProjection();
      if (!this.closed && this.nextFactsAwaitingRecovery) {
        this.nextFactsAwaitingRecovery = false;
        this.nextFactsCache.clear();
        if (!this.state.staleInput) this.ensureNextFacts();
      } else if (
        !this.closed &&
        this.nextFactsPrimed &&
        !this.state.staleInput &&
        this.state.plan.nextFacts.status === 'loading'
      ) {
        // activate() rejects an in-flight system query. Ask again for the
        // same source; a request that is still in flight is coalesced.
        this.ensureNextFacts();
      }
    }
  }
  private async activateContext(
    client: ProbeClient,
    input: ProjectInput | null,
    catalog: ProjectBundle['catalog'],
  ): Promise<void> {
    this.bumpWorkspaceGeneration();
    this.patch({ context: 'installing' });
    if (input && catalog) {
      try {
        await client.activate(this.projectId, String(this.epoch), this.state.inputRevision, {
          kind: 'project',
          input,
          catalog: catalog.catalog,
        });
        this.captureSearchLease(client);
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
          this.searchLease = null;
          this.patch({ context: 'degraded', degradedReason: reason });
          return;
        } catch (inner) {
          this.searchLease = null;
          this.patch({ context: 'none', degradedReason: String(inner) });
          return;
        }
      }
    }
    try {
      await client.activate(this.projectId, String(this.epoch), this.state.inputRevision, {
        kind: 'bootstrap',
      });
      if (input) this.searchLease = null;
      else this.captureSearchLease(client);
      this.patch({
        context: input ? 'degraded' : 'installed',
        degradedReason: input && !catalog ? 'catalog_unavailable' : null,
      });
    } catch (error) {
      this.searchLease = null;
      this.patch({ context: 'none', degradedReason: String(error) });
    }
  }
  private captureSearchLease(client: ProbeClient): void {
    const transport = client.transportIdentity;
    this.searchLease = {
      activationId: transport.projectActivationId,
      workerSessionId: transport.workerSessionId,
    };
  }
  private searchLeaseHolds(
    captured: { activationId: string; workerSessionId: string },
    client: ProbeClient,
  ): boolean {
    const transport = client.transportIdentity;
    return (
      this.controller.current === client &&
      this.searchLease !== null &&
      this.searchLease.activationId === captured.activationId &&
      this.searchLease.workerSessionId === captured.workerSessionId &&
      transport.projectActivationId === captured.activationId &&
      transport.workerSessionId === captured.workerSessionId
    );
  }
  /** Drop the search lease. A later calculation needs a new activation. */
  private retireSearch(reason: string): void {
    this.searchLease = null;
    this.pump?.dispose();
    this.patch({ context: 'none' });
    this.patchPlan({
      search: 'interrupted',
      termination: 'interrupted',
      searchError: reason,
    });
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
    this.editNominal(field, text);
  }
  /** Raw nominal text. Does not parse or fill a missing bound with zero. */
  editNominal(path: string, text: string, origin: MeasurementOrigin = 'userDeclared'): void {
    if (!this.form || this.state.status !== 'ready') return;
    const next = writeNominal(this.form, path, text, origin);
    if (!next) return;
    this.writeForm(next);
  }
  editUncertainty(path: string, uncertainty: RawUncertaintyDto): void {
    if (!this.form || this.state.status !== 'ready') return;
    const next = writeUncertainty(this.form, path, uncertainty);
    if (!next) return;
    this.writeForm(next);
  }
  editOrigin(path: string, origin: MeasurementOrigin): void {
    if (!this.form || this.state.status !== 'ready') return;
    const next = writeOrigin(this.form, path, origin);
    if (!next) return;
    this.writeForm(next);
  }
  editEvidence(path: string, draft: EvidenceDraft | null): void {
    if (!this.form || this.state.status !== 'ready') return;
    const next = writeEvidence(this.form, path, draft);
    if (!next) return;
    this.writeForm(next);
  }
  editBaseSupport(known: boolean): void {
    if (!this.form || this.state.status !== 'ready') return;
    this.writeForm(writeBaseSupport(this.form, known));
  }
  /**
   * Unit change for one nominal and its active bounds. Rust converts the
   * group or refuses it. An invalid or partial group keeps its original
   * strings and unit. A blank nominal with unknown bounds has no number to
   * convert, so only a length field's unit label changes.
   */
  setUnit(field: MeasurementField, unit: Unit): void {
    this.setGroupUnit(field, unit);
  }
  setGroupUnit(path: string, unit: Unit): void {
    if (!this.form || this.state.status !== 'ready') return;
    if (currentLengthUnit(this.form, path) === unit) return;
    if (!canRequestGroupUnit(path, unit)) return;
    const epoch = String(this.epoch);
    const generation = String(this.generation);
    const form = structuredClone(this.form);
    void this.formatGroup(path, unit, epoch, generation, form);
  }
  private async formatGroup(
    path: string,
    unit: Unit,
    epoch: string,
    generation: string,
    form: RawProjectInputDto,
  ): Promise<void> {
    const client = this.controller.current;
    if (!client) return;
    this.patch({ normalizeRequests: this.state.normalizeRequests + 1 });
    try {
      const reply = await client.request({
        kind: 'normalizeInput',
        input: { kind: 'project', project: form },
        priorInputDigest: this.state.inputDigest,
        formatRequests: [],
        groupFormatRequests: [{ fieldPath: path, unit }],
      });
      if (
        this.closed ||
        String(this.epoch) !== epoch ||
        String(this.generation) !== generation ||
        reply.kind !== 'normalized'
      )
        return;
      const applied = applyGroupFormatResult(
        form,
        path,
        unit,
        reply.formattedGroups.find((group) => group.fieldPath === path),
      );
      if ('hold' in applied) {
        this.patch({ unitHold: { fieldPath: path, code: applied.hold } });
        return;
      }
      this.form = applied.form;
      this.bump();
      this.patch({
        form: this.form,
        staleInput: true,
        unitHold: null,
        saveState: this.state.conflict ? 'conflict' : 'dirty',
      });
      this.scheduleAutosave();
    } catch (error) {
      if (!(error instanceof StaleRequest)) {
        this.patch({ unitHold: { fieldPath: path, code: 'not_converted' } });
      }
    }
  }
  private writeForm(next: RawProjectInputDto): void {
    this.form = next;
    this.bump();
    this.patch({
      form: this.form,
      staleInput: true,
      unitHold: null,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
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
      unitHold: null,
      saveState: this.state.conflict ? 'conflict' : 'dirty',
    });
    this.scheduleAutosave();
  }
  private enqueueReconcile(opts: { skipWriteIfSame: boolean }): void {
    this.reconcileQueue = this.reconcileQueue.then(() => this.reconcile(opts));
  }
  private async reconcile(opts: { skipWriteIfSame: boolean }): Promise<void> {
    const followPareto = opts.skipWriteIfSame ? false : this.paretoFollowCommit;
    if (!opts.skipWriteIfSame) this.paretoFollowCommit = false;
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
    this.patch({ normalizeRequests: this.state.normalizeRequests + 1 });
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
    const previousDigest = this.state.inputDigest;
    const keepNormalized = diagnostics.length > 0;
    this.patch({
      diagnostics,
      normalizedInput: keepNormalized
        ? this.state.normalizedInput
        : (normalized ?? this.state.normalizedInput),
    });
    // Skip the write when nothing semantic changed and the stored draft
    // already carries the same validation state (e.g. a plain reload). The
    // normalize round-trip still ran, so the restored draft is confirmed —
    // clear staleInput rather than leaving the project dirty forever.
    if (diagnostics.length > 0) {
      normalized = null;
      inputDigest = null;
    }
    if (opts.skipWriteIfSame && generation === String(this.lastCommittedGeneration)) {
      this.patch({
        staleInput: diagnostics.length > 0,
        inputDigest: inputDigest ?? this.state.inputDigest,
      });
      this.settleNextFacts(previousDigest);
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
      staleInput:
        diagnostics.length > 0 || this.generation > this.lastCommittedGeneration,
      inputDigest: inputDigest ?? this.state.inputDigest,
    });
    this.settleNextFacts(previousDigest);
    if (revisionChanged && normalized) {
      // The committed input moved: any in-flight search belongs to the old
      // context — `activateProject` drops it engine-side, so retire the pump
      // rather than let its steps fail against a stale search id.
      if (
        this.pump?.isRunning ||
        this.state.plan.search === 'running' ||
        this.state.plan.search === 'cancelling'
      ) {
        this.pump?.dispose();
        this.patchPlan({
          search: 'interrupted',
          termination: 'interrupted',
          searchError: 'source_changed',
        });
      }
      // A committed input change ends the layout-edit chain too — the chain
      // is bound to the old input digest and can never ride across.
      this.clearEditChain();
      this.paretoEpoch += 1;
      this.incrementalEpoch += 1;
      this.incrementalKey = null;
      this.diagnosticEpoch += 1;
      this.diagnosticKey = null;
      this.patchPlan({
        pareto: null,
        paretoError: null,
        paretoState: 'idle',
        incremental: null,
        incrementalError: null,
        incrementalState: 'idle',
        incrementalIgnored: 0,
        diagnostic: null,
        diagnosticError: null,
        diagnosticState: 'idle',
        diagnosticIgnored: 0,
        searchScope: null,
      });
      const catalog = await this.repo.getCatalog(normalized.catalogPin.catalogDigest).catch(() => null);
      await this.installContext(client, normalized, catalog);
    }
    if (
      followPareto &&
      diagnostics.length === 0 &&
      this.state.context === 'installed' &&
      !this.closed
    ) {
      this.startSearch();
    }
  }

  // ---------- plan / search / accept ----------

  /** Rust strategy proposals for the activated input; display only. */
  private async refreshStrategies(client: ProbeClient): Promise<void> {
    const digest = this.state.inputDigest;
    const strategy = this.state.normalizedInput?.strategyChoice ?? null;
    try {
      const reply = await client.request({ kind: 'proposeStrategies' });
      if (this.closed || reply.kind !== 'strategiesProposed') return;
      this.patchPlan({ strategies: reply.decisions, strategiesError: null });
    } catch (error) {
      if (this.closed || error instanceof StaleRequest) return;
      this.patchPlan({
        strategies: null,
        strategiesError: error instanceof Error ? error.message : String(error),
        strategyLibrary: null,
        strategyLibraryError: error instanceof Error ? error.message : String(error),
        strategyLibraryState: 'error',
      });
      return;
    }
    if (!digest || !strategy) {
      this.patchPlan({
        strategyLibrary: null,
        strategyLibraryError: null,
        strategyLibraryState: 'empty',
      });
      return;
    }
    const key = libraryKey(digest, strategy);
    this.patchPlan({ strategyLibraryState: 'pending', strategyLibraryError: null });
    try {
      const library = await evaluateLibraryOnce(key, async () => {
        const event = await client.request({ kind: 'evaluateStrategyLibrary' });
        if (event.kind !== 'strategyLibraryEvaluated') throw new Error('unexpected_worker_event');
        return event.reply;
      });
      if (this.closed) return;
      if (this.state.inputDigest !== digest || this.state.normalizedInput?.strategyChoice !== strategy) {
        return;
      }
      this.patchPlan({
        strategyLibrary: library,
        strategyLibraryError: null,
        strategyLibraryState: library.recipes.length === 0 ? 'empty' : 'ready',
      });
    } catch (error) {
      if (this.closed || error instanceof StaleRequest) return;
      if (this.state.inputDigest !== digest || this.state.normalizedInput?.strategyChoice !== strategy) {
        return;
      }
      this.patchPlan({
        strategyLibrary: null,
        strategyLibraryError: error instanceof Error ? error.message : String(error),
        strategyLibraryState: 'error',
      });
    }
  }
  /** One new comparison after a person asks. Does not retry by itself. */
  retryStrategyLibrary(): void {
    const digest = this.state.inputDigest;
    const strategy = this.state.normalizedInput?.strategyChoice;
    const client = this.controller.current;
    if (!digest || !strategy || !client || this.closed) return;
    forgetLibraryEvaluation(libraryKey(digest, strategy));
    this.patchPlan({ strategyLibraryState: 'pending', strategyLibraryError: null });
    void this.refreshStrategies(client);
  }
  private paretoCacheKey(): string | null {
    const digest = this.state.plan.resultInputDigest;
    const strategy = this.state.normalizedInput?.strategyChoice ?? null;
    const termination = this.state.plan.termination;
    if (!digest || !strategy || !termination) return null;
    return paretoKey(
      digest,
      strategy,
      termination,
      this.state.plan.alternatives.map((snapshot) => snapshot.planSnapshotId),
    );
  }
  /** One Pareto read for the search that just finished. Does not publish a snapshot. */
  private async refreshPareto(client: ProbeClient): Promise<void> {
    const digest = this.state.plan.resultInputDigest;
    const strategy = this.state.normalizedInput?.strategyChoice ?? null;
    const termination = this.state.plan.termination;
    const alternatives = this.state.plan.alternatives;
    const epoch = this.paretoEpoch;
    if (!digest || !strategy || !termination || this.state.plan.search !== 'done') {
      return;
    }
    const key = paretoKey(
      digest,
      strategy,
      termination,
      alternatives.map((snapshot) => snapshot.planSnapshotId),
    );
    this.patchPlan({ paretoState: 'pending', paretoError: null });
    try {
      const reply = await compareParetoOnce(key, async () => {
        const event = await client.request({
          kind: 'comparePareto',
          termination,
          alternatives,
        });
        if (event.kind !== 'paretoCompared') throw new Error('unexpected_worker_event');
        return event.reply;
      });
      if (this.closed || epoch !== this.paretoEpoch) return;
      if (this.state.plan.search !== 'done' || this.state.plan.resultInputDigest !== digest) return;
      if (this.state.plan.termination !== termination) return;
      this.patchPlan({ pareto: reply, paretoError: null, paretoState: 'ready' });
    } catch (error) {
      if (this.closed || error instanceof StaleRequest || epoch !== this.paretoEpoch) return;
      if (this.state.plan.search !== 'done' || this.state.plan.resultInputDigest !== digest) return;
      this.patchPlan({
        pareto: null,
        paretoError: error instanceof Error ? error.message : String(error),
        paretoState: 'error',
      });
    }
  }
  /**
   * One pin-preserving replan of `base` against the activated input.
   * Does not select, accept, or move a pinned placement.
   */
  replanIncremental(base: PlanSnapshot, pins: IncrementalPins): void {
    const client = this.controller.current;
    const digest = this.state.inputDigest;
    if (
      !client ||
      !digest ||
      this.closed ||
      this.state.status !== 'ready' ||
      this.state.context !== 'installed'
    ) {
      this.patchPlan({
        incremental: null,
        incrementalError:
          this.state.context !== 'installed' ? 'context_not_installed' : 'no_committed_input',
        incrementalState: 'error',
      });
      return;
    }
    this.incrementalEpoch += 1;
    const epoch = this.incrementalEpoch;
    const key = replanKey(digest, base.planSnapshotId, pins);
    this.incrementalKey = key;
    this.patchPlan({
      incremental: null,
      incrementalError: null,
      incrementalState: 'pending',
      incrementalIgnored: 0,
    });
    void this.finishReplan(client, base, pins, key, epoch);
  }
  private async finishReplan(
    client: ProbeClient,
    base: PlanSnapshot,
    pins: IncrementalPins,
    key: string,
    epoch: number,
  ): Promise<void> {
    try {
      const reply = await replanOnce(key, async () => {
        const event = await client.request({
          kind: 'replanIncremental',
          baseSnapshot: base,
          pins,
        });
        if (event.kind !== 'incrementalReplanned') throw new Error('unexpected_worker_event');
        return event.reply;
      });
      if (this.closed || !replanReplyApplies(epoch, this.incrementalEpoch)) {
        this.noteIgnoredReplan(epoch);
        return;
      }
      this.incrementalReplyEpoch = epoch;
      this.patchPlan({
        incremental: reply,
        incrementalError: null,
        incrementalState: reply.outcome.kind === 'blocked' ? 'blocked' : 'ready',
      });
    } catch (error) {
      if (this.closed || error instanceof StaleRequest || !replanReplyApplies(epoch, this.incrementalEpoch)) {
        this.noteIgnoredReplan(epoch);
        return;
      }
      forgetReplan(key);
      this.patchPlan({
        incremental: null,
        incrementalError: error instanceof Error ? error.message : String(error),
        incrementalState: 'error',
      });
    }
  }
  private noteIgnoredReplan(epoch: number): void {
    if (this.closed || replanReplyApplies(epoch, this.incrementalEpoch)) return;
    if (this.state.plan.incrementalState !== 'cancelled') return;
    this.patchPlan({ incrementalIgnored: this.state.plan.incrementalIgnored + 1 });
  }
  /** Drops the in-flight reply. Does not change the selected or accepted plan. */
  cancelReplan(): void {
    if (this.state.plan.incrementalState !== 'pending') return;
    this.incrementalEpoch += 1;
    if (this.incrementalKey) forgetReplan(this.incrementalKey);
    this.incrementalKey = null;
    this.patchPlan({
      incremental: null,
      incrementalError: null,
      incrementalState: 'cancelled',
    });
  }
  /** Explicit switch to the published snapshot. A stale epoch does nothing. */
  adoptReplan(): void {
    const reply = this.state.plan.incremental;
    const outcome = reply?.outcome.kind ?? null;
    if (!replanAdoptAllowed(this.incrementalReplyEpoch, this.incrementalEpoch, outcome)) return;
    if (!reply || reply.outcome.kind !== 'published') return;
    const snapshot = reply.outcome.snapshot;
    const alternatives = this.state.plan.alternatives.some(
      (item) => item.planSnapshotId === snapshot.planSnapshotId,
    )
      ? this.state.plan.alternatives
      : [...this.state.plan.alternatives, snapshot];
    this.snapshotIndex.set(snapshot.planSnapshotId, snapshot);
    this.patchPlan({ alternatives, selectedId: snapshot.planSnapshotId });
  }
  private async refreshDiagnostics(client: ProbeClient): Promise<void> {
    const input = this.state.normalizedInput;
    const digest = this.state.inputDigest;
    const termination = this.state.plan.termination;
    const search = this.state.plan.search;
    if (
      !input ||
      !digest ||
      !termination ||
      this.state.context !== 'installed' ||
      (search !== 'done' && search !== 'cancelled' && search !== 'interrupted')
    ) {
      return;
    }
    const scope = this.state.plan.searchScope ?? {
      profile: input.search.profile,
      budget: input.search.budget,
      groupIds: input.groups.map((group) => group.id),
      restrictions: [],
    };
    const useResult = search === 'done';
    const alternatives = useResult ? this.state.plan.alternatives : [];
    const candidates = useResult ? this.state.plan.diagnostics : [];
    const consumed = this.state.plan.progress ?? {
      workUnits: '0',
      nodes: 0,
      validatedCandidates: 0,
    };
    const key = diagnosticKey({
      inputDigest: digest,
      catalogDigest: input.catalogPin.catalogDigest,
      termination,
      workUnits: consumed.workUnits,
      nodes: consumed.nodes,
      reasons: candidates.map((row) => row.reasonCode),
      snapshotIds: alternatives.map((snapshot) => snapshot.planSnapshotId),
      restrictions: scope.restrictions.map(
        (row) => `${row.code}:${[...row.subjectIds].sort().join('+')}`,
      ),
    });
    const epoch = this.diagnosticEpoch;
    this.diagnosticKey = key;
    this.patchPlan({ diagnosticState: 'pending', diagnosticError: null });
    try {
      const reply = await diagnoseOnce(key, async () => {
        const event = await client.request({
          kind: 'diagnoseSearch',
          termination,
          scope,
          consumed,
          alternatives,
          diagnosticCandidates: candidates,
        });
        if (event.kind !== 'searchDiagnosed') throw new Error('unexpected_worker_event');
        return event.reply;
      });
      if (this.closed || !diagnosisReplyApplies(epoch, this.diagnosticEpoch)) {
        this.noteIgnoredDiagnosis(epoch);
        return;
      }
      if (this.state.inputDigest !== digest || this.state.plan.termination !== termination) return;
      this.patchPlan({ diagnostic: reply, diagnosticError: null, diagnosticState: 'ready' });
    } catch (error) {
      if (
        this.closed ||
        error instanceof StaleRequest ||
        !diagnosisReplyApplies(epoch, this.diagnosticEpoch)
      ) {
        this.noteIgnoredDiagnosis(epoch);
        return;
      }
      if (this.state.inputDigest !== digest) return;
      forgetDiagnosis(key);
      this.patchPlan({
        diagnostic: null,
        diagnosticError: error instanceof Error ? error.message : String(error),
        diagnosticState: 'error',
      });
    }
  }
  private noteIgnoredDiagnosis(epoch: number): void {
    if (this.closed || diagnosisReplyApplies(epoch, this.diagnosticEpoch)) return;
    if (this.state.plan.diagnosticState !== 'cancelled') return;
    this.patchPlan({ diagnosticIgnored: this.state.plan.diagnosticIgnored + 1 });
  }
  /** Drops the in-flight diagnosis. Does not change the selected plan. */
  cancelDiagnosis(): void {
    if (this.state.plan.diagnosticState !== 'pending') return;
    this.diagnosticEpoch += 1;
    if (this.diagnosticKey) forgetDiagnosis(this.diagnosticKey);
    this.diagnosticKey = null;
    this.patchPlan({
      diagnostic: null,
      diagnosticError: null,
      diagnosticState: 'cancelled',
    });
  }
  /** One new diagnosis of the search already on screen. Does not retry by itself. */
  retryDiagnosis(): void {
    const client = this.controller.current;
    if (!client || this.closed || this.state.context !== 'installed') return;
    if (this.diagnosticKey) forgetDiagnosis(this.diagnosticKey);
    this.diagnosticEpoch += 1;
    this.patchPlan({ diagnosticIgnored: 0 });
    void this.refreshDiagnostics(client);
  }
  /** One new comparison after a person asks. Does not retry by itself. */
  retryPareto(): void {
    const client = this.controller.current;
    const key = this.paretoCacheKey();
    if (!client || !key || this.closed || this.state.plan.search !== 'done') return;
    forgetParetoComparison(key);
    this.patchPlan({ paretoState: 'pending', paretoError: null });
    void this.refreshPareto(client);
  }
  /**
   * Recompute for a supported goal. A draft that is not the saved strategy
   * is committed first. An ordinary commit does not start a search.
   */
  recalculatePareto(): void {
    if (this.editLocked() || this.state.status !== 'ready' || this.closed) return;
    const saved = this.state.normalizedInput?.strategyChoice ?? null;
    const draft = this.form?.strategyChoice ?? null;
    if (draft !== null && saved !== null && draft !== saved) {
      this.paretoFollowCommit = true;
      this.commit();
      return;
    }
    this.startSearch();
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
    const epoch = this.progressEpoch;
    const accepted = this.state.plan.accepted;
    if (!accepted) {
      if (this.progressEpoch !== epoch) return;
      this.patchPlan({
        actionProgress: {},
        actionError: null,
        progressLoad: 'ready',
        actionRetry: null,
        actionEligibility: null,
      });
      return;
    }
    const binding = {
      inputRevision: accepted.inputRevision,
      planSnapshotId: accepted.planSnapshotId,
    };
    this.patchPlan({ progressLoad: 'loading' });
    const rows = await this.repo
      .actionProgressFor(this.projectId, binding.inputRevision, binding.planSnapshotId)
      .catch(() => null);
    if (this.progressEpoch !== epoch) return;
    const now = this.state.plan.accepted;
    if (
      !now ||
      now.inputRevision !== binding.inputRevision ||
      now.planSnapshotId !== binding.planSnapshotId
    ) {
      return;
    }
    if (rows === null) {
      this.patchPlan({
        actionProgress: null,
        actionError: 'progress_unavailable',
        progressLoad: 'error',
        actionEligibility: null,
      });
      return;
    }
    this.patchPlan({
      actionProgress: Object.fromEntries(rows.map((r) => [r.stepId, r.status])),
      actionError: null,
      progressLoad: 'ready',
      actionEligibility: null,
    });
    void this.refreshActionEligibility();
  }
  private eligibilityStamp(
    snapshot: PlanSnapshot,
    identity: string,
    editorEpoch: string,
  ): ActionProgressStamp & {
    projectId: string;
    inputDigest: string;
    planSnapshotId: string;
    acceptedInputRevision: string;
    sourceDirty: boolean;
  } {
    const versions = snapshot.content.versions;
    const accepted = this.state.plan.accepted;
    return {
      projectId: this.projectId,
      inputDigest: versions.inputDigest,
      planSnapshotId: snapshot.planSnapshotId,
      catalogDigest: versions.catalogDigest,
      catalogVersion: versions.catalogVersion,
      ruleVersion: versions.ruleVersion,
      solverVersion: versions.solverVersion,
      schemaVersion: versions.schemaVersion,
      canonicalVersion: versions.canonicalVersion,
      buildId: WORKER_BUILD_ID,
      searchProfileId: versions.searchProfile.id,
      searchProfileVersion: versions.searchProfile.version,
      acceptedInputRevision: accepted?.inputRevision ?? this.state.inputRevision,
      projectRevision: this.state.projectRevision,
      editorEpoch,
      progressIdentity: identity,
      sourceDirty: this.state.staleInput || this.generation > this.lastCommittedGeneration,
    };
  }
  private progressRows(): { stepId: string; status: 'done' | 'todo' }[] {
    const progress = this.state.plan.actionProgress;
    if (!progress) return [];
    return Object.entries(progress).map(([stepId, status]) => ({ stepId, status }));
  }
  private progressLeaseHolds(captured: {
    client: ProbeClient;
    editorEpoch: string;
    generation: string;
    inputRevision: string;
    planSnapshotId: string;
    epoch: number;
    progressIdentity: string;
  }): boolean {
    const progress = this.state.plan.actionProgress;
    return (
      !this.closed &&
      this.controller.current === captured.client &&
      String(this.epoch) === captured.editorEpoch &&
      String(this.generation) === captured.generation &&
      this.progressEpoch === captured.epoch &&
      !this.state.staleInput &&
      this.generation <= this.lastCommittedGeneration &&
      this.state.plan.accepted?.inputRevision === captured.inputRevision &&
      this.state.plan.accepted?.planSnapshotId === captured.planSnapshotId &&
      progress !== null &&
      progressIdentity(Object.entries(progress).map(([stepId, status]) => [stepId, status] as const)) ===
        captured.progressIdentity &&
      this.state.conflict === null
    );
  }
  /** Read-only eligibility. A failed or stale read leaves the previous rows unset. */
  private async refreshActionEligibility(): Promise<void> {
    const client = this.controller.current;
    const snapshot = this.state.plan.acceptedSnapshot;
    const accepted = this.state.plan.accepted;
    if (
      !client ||
      !snapshot ||
      !accepted ||
      snapshot.planSnapshotId !== accepted.planSnapshotId ||
      this.state.plan.actionProgress === null ||
      this.state.plan.progressLoad !== 'ready'
    ) {
      return;
    }
    const rows = this.progressRows();
    const identity = progressIdentity(rows.map((row) => [row.stepId, row.status] as const));
    const captured = {
      client,
      editorEpoch: String(this.epoch),
      generation: String(this.generation),
      inputRevision: accepted.inputRevision,
      planSnapshotId: accepted.planSnapshotId,
      epoch: this.progressEpoch,
      progressIdentity: identity,
    };
    const stamp = this.eligibilityStamp(snapshot, identity, captured.editorEpoch);
    const event = await client
      .systemRequest({
        kind: 'queryActionEligibility',
        snapshot,
        progress: rows,
        stamp,
      })
      .catch(() => null);
    if (!this.progressLeaseHolds(captured)) return;
    if (!event || event.kind !== 'actionEligibilityQueried') {
      this.patchPlan({ actionEligibility: null });
      return;
    }
    const reply = event.reply;
    this.patchPlan({
      actionEligibility: {
        planSnapshotId: snapshot.planSnapshotId,
        progressIdentity: identity,
        eligible: reply.eligible,
        staleReason: reply.staleReason,
        rows: reply.rows.map((row) => ({
          actionId: row.actionId,
          executable: row.executable,
          blockerCheckIds: row.blockerCheckIds,
          userAssertion: row.userAssertion,
        })),
      },
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
      this.patchPlan({ actionError: 'not_accepted', actionRetry: null });
      return;
    }
    if (this.state.conflict) {
      this.patchPlan({ actionError: 'conflict', actionRetry: null });
      return;
    }
    if (this.state.staleInput || accepted.inputRevision !== this.state.inputRevision) {
      this.patchPlan({ actionError: 'stale_input', actionRetry: null });
      return;
    }
    if (this.state.plan.progressLoad !== 'ready' || this.state.plan.actionProgress === null) {
      this.patchPlan({ actionError: 'progress_unavailable', actionRetry: null });
      return;
    }
    const snapshot = this.state.plan.acceptedSnapshot;
    const step = snapshot?.content.actions.find((item) => item.id === stepId);
    if (!snapshot || snapshot.planSnapshotId !== accepted.planSnapshotId) {
      this.patchPlan({ actionError: 'not_accepted', actionRetry: null });
      return;
    }
    if (snapshot.content.versions.ruleVersion !== WORKER_RULE_VERSION) {
      this.patchPlan({ actionError: 'historical_rule', actionRetry: null });
      return;
    }
    if (done && step && step.requiredConfirmations.length > 0) {
      this.patchPlan({ actionError: 'confirmation_required', actionRetry: null });
      return;
    }
    const client = this.controller.current;
    if (!client) {
      this.patchPlan({ actionError: 'progress_unavailable', actionRetry: null });
      return;
    }
    const rows = this.progressRows();
    const identity = progressIdentity(rows.map((row) => [row.stepId, row.status] as const));
    const captured = {
      inputRevision: accepted.inputRevision,
      planSnapshotId: accepted.planSnapshotId,
      epoch: this.progressEpoch,
      client,
      editorEpoch: String(this.epoch),
      generation: String(this.generation),
      progressIdentity: identity,
    };
    const stamp = this.eligibilityStamp(snapshot, identity, captured.editorEpoch);
    const event = await client
      .systemRequest({
        kind: 'queryActionEligibility',
        snapshot,
        progress: rows,
        stamp,
      })
      .catch((error: unknown) => error as Error);
    if (!this.progressLeaseHolds(captured)) return;
    if (event instanceof Error) {
      this.patchPlan({ actionError: event.message, actionRetry: { stepId, done } });
      return;
    }
    if (event.kind !== 'actionEligibilityQueried') {
      this.patchPlan({ actionError: 'progress_unavailable', actionRetry: null });
      return;
    }
    const reply = event.reply;
    if (
      reply.stamp.planSnapshotId !== snapshot.planSnapshotId ||
      reply.stamp.progressIdentity !== identity ||
      reply.stamp.buildId !== WORKER_BUILD_ID
    ) {
      this.patchPlan({ actionError: 'stamp_mismatch', actionRetry: null });
      return;
    }
    if (!reply.eligible) {
      this.patchPlan({
        actionError: reply.staleReason ?? 'stamp_mismatch',
        actionRetry: null,
        actionEligibility: {
          planSnapshotId: snapshot.planSnapshotId,
          progressIdentity: identity,
          eligible: false,
          staleReason: reply.staleReason,
          rows: reply.rows.map((row) => ({
            actionId: row.actionId,
            executable: row.executable,
            blockerCheckIds: row.blockerCheckIds,
            userAssertion: row.userAssertion,
          })),
        },
      });
      return;
    }
    const verdict = reply.rows.find((row) => row.actionId === stepId);
    if (done && (!verdict || !verdict.executable)) {
      this.patchPlan({ actionError: 'blocked_condition', actionRetry: null });
      return;
    }
    if (
      this.state.projectRevision !== stamp.projectRevision ||
      progressIdentity(this.progressRows().map((row) => [row.stepId, row.status] as const)) !== identity
    ) {
      this.patchPlan({ actionError: 'stamp_mismatch', actionRetry: null });
      return;
    }
    const draftGeneration = captured.generation;
    const result: ActionStepResult | Error = await this.repo
      .setActionStep({
        projectId: this.projectId,
        inputRevision: captured.inputRevision,
        planSnapshotId: captured.planSnapshotId,
        stepId,
        done,
        stamp,
        draftGeneration,
        holds: () =>
          this.progressLeaseHolds(captured) && String(this.generation) === draftGeneration,
      })
      .catch((error: unknown) => error as Error);
    // Vite replaces MODE, so the production bundle drops this call and progressGate.ts.
    if (import.meta.env.MODE === 'test') await holdProgressReply();
    const apply = shouldApplyProgressReply({
      capturedEpoch: captured.epoch,
      epoch: this.progressEpoch,
      captured,
      accepted: this.state.plan.accepted,
      progress: this.state.plan.actionProgress,
    });
    if (!apply) return;
    if (result instanceof Error) {
      this.patchPlan({ actionError: result.message, actionRetry: { stepId, done } });
      return;
    }
    if (result.status === 'saved') {
      this.broadcast(result.projectRevision);
      this.patch({ projectRevision: result.projectRevision });
      const progress = { ...this.state.plan.actionProgress! };
      progress[stepId] = done ? 'done' : 'todo';
      this.patchPlan({
        actionProgress: progress,
        actionError: null,
        actionRetry: null,
        progressLoad: 'ready',
      });
      void this.refreshActionEligibility();
      return;
    }
    if (result.status === 'conflict') {
      this.patch({ conflict: { remoteRevision: 'unknown' }, saveState: 'conflict' });
    }
    this.patchPlan({ actionError: result.status, actionRetry: null });
  }
  private clearSearchProgressPaint(): void {
    if (this.searchProgressTimer !== null) {
      clearTimeout(this.searchProgressTimer);
      this.searchProgressTimer = null;
    }
    this.searchProgressPending = null;
  }

  /** Coalesce solver counters so a step is not stuck behind a plan-screen render. */
  private noteSearchProgress(consumed: SearchCounters): void {
    this.searchProgressPending = consumed;
    if (this.searchProgressTimer !== null) return;
    this.searchProgressTimer = setTimeout(() => {
      this.searchProgressTimer = null;
      const pending = this.searchProgressPending;
      this.searchProgressPending = null;
      if (!pending || this.closed) return;
      const search = this.state.plan.search;
      if (search !== 'running' && search !== 'cancelling') return;
      this.patchPlan({ progress: pending });
    }, 250);
  }

  /**
   * One continuous search on the activated context. Steps are bounded WASM
   * calls on macrotasks so a cancel request is always serviced between them.
   * Starting a new search disposes the old one (Rust does the same).
   */
  startSearch(options?: {
    stepAllowance?: number;
    cancelTimeoutMs?: number;
    schedule?: (fn: () => void) => unknown;
    unschedule?: (token: unknown) => void;
  }): void {
    if (this.editLocked()) return;
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
    const leaseNow = this.searchLease;
    const transport = client.transportIdentity;
    if (
      leaseNow === null ||
      leaseNow.activationId !== transport.projectActivationId ||
      leaseNow.workerSessionId !== transport.workerSessionId
    ) {
      this.patchPlan({
        search: 'interrupted',
        termination: 'interrupted',
        searchError: 'activation_required',
      });
      return;
    }
    const capturedLease = { ...leaseNow };
    this.pump?.dispose();
    this.clearSearchProgressPaint();
    const pump = new SearchPump(client, {
      stepAllowance: options?.stepAllowance,
      cancelTimeoutMs: options?.cancelTimeoutMs,
      schedule: options?.schedule,
      unschedule: options?.unschedule,
    });
    this.pump = pump;
    const resultInputDigest = this.state.inputDigest;
    const resultCatalogDigest =
      this.state.normalizedInput?.catalogPin.catalogDigest ?? '';
    const sourceMoved = () =>
      this.state.inputDigest !== resultInputDigest ||
      (this.state.normalizedInput?.catalogPin.catalogDigest ?? '') !==
        resultCatalogDigest;
    this.paretoEpoch += 1;
    this.incrementalEpoch += 1;
    this.incrementalKey = null;
    this.diagnosticEpoch += 1;
    this.diagnosticKey = null;
    this.patchPlan({
      search: 'running',
      progress: null,
      searchError: null,
      termination: null,
      diagnostics: [],
      pareto: null,
      paretoError: null,
      paretoState: 'idle',
      incremental: null,
      incrementalError: null,
      incrementalState: 'idle',
      incrementalIgnored: 0,
      diagnostic: null,
      diagnosticError: null,
      diagnosticState: 'idle',
      diagnosticIgnored: 0,
      searchScope: null,
    });
    const interrupt = (reason: string) => {
      this.pump?.dispose();
      this.clearSearchProgressPaint();
      this.patchPlan({
        search: 'interrupted',
        termination: 'interrupted',
        searchError: reason,
        searchScope: null,
      });
      void this.refreshDiagnostics(client);
    };
    void pump
      .start('continuous', {
        onProgress: (event) => {
          if (!this.searchLeaseHolds(capturedLease, client)) return;
          if (sourceMoved()) {
            interrupt('source_changed');
            return;
          }
          this.noteSearchProgress(event.consumed);
        },
        onCompleted: (event) => {
          if (!this.searchLeaseHolds(capturedLease, client)) return;
          if (sourceMoved()) {
            interrupt('source_changed');
            return;
          }
          this.clearSearchProgressPaint();
          const alternatives = event.result.alternatives;
          for (const alt of alternatives)
            this.snapshotIndex.set(alt.planSnapshotId, alt);
          this.patchPlan({
            search: 'done',
            progress: event.result.consumed,
            alternatives,
            termination: event.result.termination,
            diagnostics: event.result.diagnosticCandidates,
            searchScope: event.result.scope,
            selectedId: alternatives[0]?.planSnapshotId ?? null,
            resultInputDigest,
          });
          void this.refreshPareto(client);
          void this.refreshDiagnostics(client);
        },
        onCancelled: (event) => {
          if (!this.searchLeaseHolds(capturedLease, client)) return;
          this.clearSearchProgressPaint();
          this.patchPlan({
            search: 'cancelled',
            progress: event.consumed,
            termination: 'cancelled',
            searchScope: null,
          });
          void this.refreshDiagnostics(client);
        },
        onFailed: (error) => {
          this.pump?.dispose();
          this.clearSearchProgressPaint();
          if (this.controller.state === 'failed') this.searchLease = null;
          this.patchPlan({
            search: 'interrupted',
            termination: 'interrupted',
            searchError: error.message,
            searchScope: null,
          });
          void this.refreshDiagnostics(client);
        },
        onCancelTimeout: () => {
          this.retireSearch('cancel_timeout');
          void this.controller.recover();
        },
        onStalled: () => {
          this.retireSearch('search_stalled');
          void this.controller.recover();
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
    if (this.editLocked()) return;
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
    if (this.editLocked() || this.state.conflict) return;
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
        this.progressEpoch += 1;
        this.patch({ projectRevision: result.projectRevision });
        this.patchPlan({
          accepted: {
            inputRevision: this.state.inputRevision,
            planSnapshotId,
          },
          acceptedSnapshot: snapshot,
          acceptState: 'saved',
          actionProgress: null,
          actionError: null,
          actionRetry: null,
          actionEligibility: null,
          progressLoad: 'loading',
        });
        this.holdNextFactsForRecompile();
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
  /**
   * Immutable edit fence. `null` when the worker identity does not match the
   * session epoch, so a gesture cannot start against a retired transport.
   */
  readWorkspaceLease(displayedPlanSnapshotId: string): WorkspaceLease | null {
    const client = this.controller.current;
    if (!client || this.state.status !== 'ready' || !this.state.inputDigest) return null;
    const transport = client.transportIdentity;
    if (
      transport.editorEpoch !== String(this.epoch) ||
      transport.inputRevision !== this.state.inputRevision ||
      transport.projectId !== this.projectId
    ) {
      return null;
    }
    return {
      projectId: this.projectId,
      displayedPlanSnapshotId,
      editorEpoch: String(this.epoch),
      inputRevision: this.state.inputRevision,
      inputDigest: this.state.inputDigest,
      catalogDigest: this.state.normalizedInput?.catalogPin.catalogDigest ?? '',
      projectRevision: this.state.projectRevision,
      projectActivationId: transport.projectActivationId,
      workerSessionId: transport.workerSessionId,
      workspaceGeneration: this.state.workspaceGeneration,
    };
  }
  private editLocked(): boolean {
    const edit = this.state.plan.edit;
    return edit.pending !== null || edit.persist?.kind === 'saving';
  }
  private editLeaseHolds(lease: WorkspaceLease): boolean {
    if (this.state.conflict) return false;
    return leasesEqual(lease, this.readWorkspaceLease(lease.displayedPlanSnapshotId));
  }
  private markEditPersist(persist: EditPersist | null): void {
    const edit = this.state.plan.edit;
    if (edit.persist?.kind === persist?.kind) return;
    this.patchPlan({ edit: { ...edit, persist } });
    this.flushHistoryIntent();
  }
  /**
   * Keyboard undo/redo arrives while the toolbar buttons are still disabled.
   * Keep the latest shortcut and run it once the edit is neither pending nor saving.
   */
  private flushHistoryIntent(): void {
    const intent = this.historyIntent;
    if (!intent || this.editLocked()) return;
    this.historyIntent = null;
    if (intent === 'undo') this.undoEdit();
    else this.redoEdit();
  }
  private bumpWorkspaceGeneration(): void {
    this.patch({
      workspaceGeneration: String(BigInt(this.state.workspaceGeneration) + 1n),
    });
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
   * Send one layout edit command to Rust. A command stays provisional until
   * its reply still matches this request, the captured lease, and the active
   * context. A second command while one is pending or saving is ignored, so
   * a later gesture cannot replace the in-flight one.
   */
  requestLayoutEdit(command: LayoutEditCommand, baseSnapshotId: string): void {
    const editNow = this.state.plan.edit;
    if (editNow.pending || editNow.persist?.kind === 'saving' || this.state.conflict) return;
    if (this.state.plan.search === 'running' || this.state.plan.search === 'cancelling') return;
    const client = this.controller.current;
    const base = this.snapshotIndex.get(baseSnapshotId) ?? null;
    const refuse = (diagnostics: Diagnostic[]) => {
      const edit = this.state.plan.edit;
      if (edit.pending) return;
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
    const lease = this.readWorkspaceLease(baseSnapshotId);
    if (!lease) {
      refuse([
        {
          fieldPath: 'context',
          code: 'context_not_installed',
          reasonCode: 'context_not_installed',
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
        pending: { command, baseSnapshotId, lease },
        rejection: null,
      },
    });
    void this.evaluateEdit(client, seq, base, command, source, 'push', null, lease);
  }
  /**
   * Undo the newest committed edit by asking Rust to revalidate the prior
   * layout (`restoreLayout` to the transition's base). Undo is a fresh
   * request with a fresh request id — an old request token is never revived.
   */
  undoEdit(): void {
    if (this.editLocked()) {
      this.historyIntent = 'undo';
      return;
    }
    this.historyIntent = null;
    const edit = this.state.plan.edit;
    const transition = edit.undo.at(-1);
    if (
      !transition ||
      !edit.head ||
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
    const lease = this.readWorkspaceLease(edit.head.planSnapshotId);
    if (!lease || this.state.conflict) return;
    const seq = ++this.editSeq;
    this.patchPlan({
      edit: {
        ...edit,
        pending: { command, baseSnapshotId: edit.head.planSnapshotId, lease },
        rejection: null,
      },
    });
    void this.evaluateEdit(client, seq, edit.head, command, source, 'undo', transition, lease);
  }
  /** Redo replays the undone command against the current head. */
  redoEdit(): void {
    if (this.editLocked()) {
      this.historyIntent = 'redo';
      return;
    }
    this.historyIntent = null;
    const edit = this.state.plan.edit;
    const transition = edit.redo.at(-1);
    if (
      !transition ||
      !edit.head ||
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
    const lease = this.readWorkspaceLease(edit.head.planSnapshotId);
    if (!lease || this.state.conflict) return;
    const seq = ++this.editSeq;
    this.patchPlan({
      edit: {
        ...edit,
        pending: { command, baseSnapshotId: edit.head.planSnapshotId, lease },
        rejection: null,
      },
    });
    void this.evaluateEdit(client, seq, edit.head, command, source, 'redo', transition, lease);
  }
  private async evaluateEdit(
    client: ProbeClient,
    seq: number,
    base: PlanSnapshot,
    command: LayoutEditCommand,
    source: PlanSnapshot | null,
    mode: 'push' | 'undo' | 'redo',
    carried: EditTransition | null,
    lease: WorkspaceLease,
  ): Promise<void> {
    try {
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
    if (!this.editLeaseHolds(lease)) {
      const edit = this.state.plan.edit;
      if (edit.pending) this.patchPlan({ edit: { ...edit, pending: null } });
      return;
    }
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
    // Publish the projection entry in the same turn as the new head so the
    // new BOM is never drawn beside the previous snapshot's diagram.
    this.ensurePlanProjection(next);
    this.patchPlan({
      edit: {
        ...edit,
        pending: null,
        rejection: null,
        persist: { kind: 'saving' },
        chainBaseId,
        head: next,
        undo,
        redo,
      },
    });
    if (seq !== this.editSeq) return;
    await this.persistEditHead(next, base, seq);
    } finally {
      if (!this.closed) this.flushHistoryIntent();
    }
  }
  /** Write the verified head. A failed write keeps the head and does not reject it. */
  private async persistEditHead(next: PlanSnapshot, base: PlanSnapshot, seq: number): Promise<void> {
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
    if (this.closed || seq !== this.editSeq) return;
    if (this.state.plan.edit.head?.planSnapshotId !== next.planSnapshotId) return;
    if (result instanceof Error) {
      this.applyStoreError(result);
      this.markEditPersist({ kind: 'unsaved' });
      return;
    }
    if (result.status === 'committed') {
      this.broadcast(result.projectRevision);
      this.patch({ projectRevision: result.projectRevision });
      this.markEditPersist(null);
      return;
    }
    if (result.status === 'conflict') {
      this.patch({ conflict: { remoteRevision: 'unknown' }, saveState: 'conflict' });
      this.markEditPersist({ kind: 'conflict' });
      return;
    }
    if (this.state.inputDigest !== next.content.versions.inputDigest) {
      this.clearEditChain();
      return;
    }
    this.markEditPersist({ kind: 'unsaved' });
  }
  /** Retry the device write for a verified head that did not persist. */
  retryEditPersist(): void {
    const edit = this.state.plan.edit;
    if (!edit.head || edit.persist?.kind === 'saving' || edit.pending) return;
    if (edit.persist?.kind !== 'unsaved') return;
    const baseId = edit.undo.at(-1)?.baseSnapshotId ?? edit.chainBaseId;
    const base = baseId ? this.snapshotIndex.get(baseId) : undefined;
    if (!base) return;
    const seq = this.editSeq;
    this.markEditPersist({ kind: 'saving' });
    void this.persistEditHead(edit.head, base, seq);
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
        pending: null,
        persist: null,
        rejection: null,
        chainBaseId: chain.baseSnapshotId,
        head,
        undo: chain.undo,
        redo: chain.redo,
      },
    });
  }
  /** Drop the working chain; called when the committed input moves. */
  private clearEditChain(): void {
    this.historyIntent = null;
    const edit = this.state.plan.edit;
    if (!edit.chainBaseId && !edit.head && !edit.pending && !edit.rejection && !edit.persist) return;
    this.editSeq += 1;
    this.bumpWorkspaceGeneration();
    this.patchPlan({
      edit: {
        selectedPlacementId: null,
        pending: null,
        persist: null,
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
    this.historyIntent = null;
    this.editSeq += 1;
    this.progressEpoch += 1;
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
    if (this.nextFactsPrimed) {
      this.holdNextFactsForRecompile();
      this.ensureNextFacts();
    }
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

  // ---------- completion query ----------

  /** Ask again for the committed source. A dirty draft does not send. */
  recompileNextFacts(): void {
    if (this.state.staleInput) {
      this.invalidateNextFactsForDraft();
      return;
    }
    this.ensureNextFacts();
  }
  private settleNextFacts(previousDigest: string | null): void {
    if (!this.nextFactsPrimed) {
      this.primeNextFacts();
      return;
    }
    if (previousDigest !== this.state.inputDigest) this.holdNextFactsForRecompile();
  }
  private primeNextFacts(): void {
    if (this.nextFactsPrimed || this.closed || this.state.staleInput) return;
    if (!this.state.normalizedInput || !this.state.inputDigest || !this.controller.current) return;
    this.nextFactsPrimed = true;
    this.ensureNextFacts();
  }
  private ensureNextFacts(): void {
    if (this.closed || this.state.staleInput) return;
    const input = this.state.normalizedInput;
    const inputDigest = this.state.inputDigest;
    const client = this.controller.current;
    if (!input || !inputDigest || !client) return;
    const snapshot = this.state.plan.acceptedSnapshot;
    const lease: NextFactsLease = {
      projectId: this.projectId,
      inputDigest,
      snapshotId: snapshot?.planSnapshotId ?? null,
      catalogDigest: input.catalogPin.catalogDigest,
      rawGeneration: this.epoch,
      worker: client,
      mount: this.nextFactsMounted,
    };
    const sourceKey = nextFactsSourceKey(lease);
    const cached = this.nextFactsCache.get(sourceKey);
    if (cached) {
      this.publishNextFactsReply(sourceKey, cached, null);
      return;
    }
    if (this.nextFactsFlight === sourceKey) return;
    this.nextFactsFlight = sourceKey;
    this.nextFactsRequestsSent += 1;
    this.publishNextFacts({
      status: 'loading',
      reason: null,
      freshness: null,
      rows: [],
      actions: [],
      failureCode: null,
      sourceKey,
      roundTripMs: null,
    });
    const started = performance.now();
    void client
      .systemRequest({ kind: 'queryNextFacts', input, inputDigest, snapshot })
      .then(async (event) => {
        let received = event;
        if (import.meta.env.MODE === 'test') {
          await holdNextFactsReply();
          received = maybeForeignNextFacts(received);
          if (takeNextFactsInjection() === 'limit') {
            if (!this.nextFactsLeaseHolds(lease)) return;
            this.publishNextFacts({
              status: 'limited',
              reason: null,
              freshness: null,
              rows: [],
              actions: [],
              failureCode: 'completion_limit_exceeded',
              sourceKey,
              roundTripMs: performance.now() - started,
            });
            return;
          }
        }
        if (!this.nextFactsLeaseHolds(lease)) return;
        if (received.kind !== 'nextFactsQueried') return;
        if (!nextFactsReplyMatches(lease, received.reply)) return;
        this.nextFactsCache.set(sourceKey, received.reply);
        this.publishNextFactsReply(sourceKey, received.reply, performance.now() - started);
      })
      .catch((error: unknown) => {
        if (!this.nextFactsLeaseHolds(lease)) return;
        if (error instanceof StaleRequest) return;
        const code = error instanceof Error ? error.message : 'next_facts_failed';
        this.publishNextFacts({
          status: code === 'completion_limit_exceeded' ? 'limited' : 'failed',
          reason: null,
          freshness: null,
          rows: [],
          actions: [],
          failureCode: code,
          sourceKey,
          roundTripMs: performance.now() - started,
        });
      })
      .finally(() => {
        if (this.nextFactsFlight === sourceKey) this.nextFactsFlight = null;
      });
  }
  private nextFactsLeaseHolds(lease: NextFactsLease): boolean {
    const client = this.controller.current;
    if (!client || !this.state.inputDigest || !this.state.normalizedInput) return false;
    return nextFactsLeaseMatches(lease, {
      projectId: this.projectId,
      inputDigest: this.state.inputDigest,
      snapshotId: this.state.plan.acceptedSnapshot?.planSnapshotId ?? null,
      catalogDigest: this.state.normalizedInput.catalogPin.catalogDigest,
      rawGeneration: this.epoch,
      worker: client,
      mount: this.nextFactsMounted,
    });
  }
  private publishNextFactsReply(sourceKey: string, reply: NextFactsReply, roundTripMs: number | null): void {
    this.publishNextFacts({
      status: 'ready',
      reason: null,
      freshness: reply.freshness,
      rows: reply.rows,
      actions: reply.resolutionActions,
      failureCode: null,
      sourceKey,
      ...(roundTripMs === null ? {} : { roundTripMs }),
    });
  }
  private publishNextFacts(part: Partial<NextFactsView>): void {
    const current = this.state.plan.nextFacts;
    const next: NextFactsView = { ...current, ...part, requests: this.nextFactsRequestsSent };
    if (
      current.status === next.status &&
      current.reason === next.reason &&
      current.freshness === next.freshness &&
      current.rows === next.rows &&
      current.failureCode === next.failureCode &&
      current.requests === next.requests &&
      current.roundTripMs === next.roundTripMs &&
      current.sourceKey === next.sourceKey
    ) {
      return;
    }
    this.patchPlan({ nextFacts: next });
  }
  private invalidateNextFactsForDraft(): void {
    if (this.state.plan.nextFacts.status === 'idle') return;
    this.publishNextFacts({
      status: 'stale',
      reason: 'draft',
      freshness: null,
      rows: [],
      actions: [],
      failureCode: null,
    });
  }
  private holdNextFactsForRecompile(): void {
    if (!this.nextFactsPrimed) return;
    this.publishNextFacts({
      status: 'stale',
      reason: 'committed',
      freshness: null,
      rows: [],
      actions: [],
      failureCode: null,
    });
  }
  private dropNextFactsForWorker(): void {
    this.nextFactsMounted += 1;
    this.nextFactsFlight = null;
    this.nextFactsCache.clear();
    this.nextFactsAwaitingRecovery = this.nextFactsPrimed;
    if (!this.nextFactsPrimed) return;
    this.publishNextFacts({
      status: 'stale',
      reason: 'worker',
      freshness: null,
      rows: [],
      actions: [],
      failureCode: null,
    });
  }

  // ---------- spatial projection ----------

  /**
   * Ask Rust for the drawable read model of one immutable snapshot.
   * Identical sources share one in-flight request. A late reply is applied
   * only when its lease still matches this mount and worker.
   */
  ensurePlanProjection(snapshot: PlanSnapshot): void {
    const sourceKey = planSourceKey(snapshot.planSnapshotId);
    this.requestProjection(sourceKey, { kind: 'plan', snapshot });
  }
  /**
   * Drawable read model of one normalized input. Same lease and cache as plans.
   * A second call for the same digest does not send another Worker request.
   */
  ensureInputProjection(input: ProjectInput, inputDigest: string): void {
    const sourceKey = inputSourceKey(inputDigest);
    this.requestProjection(sourceKey, { kind: 'normalizedInput', input, inputDigest });
  }
  private requestProjection(sourceKey: string, source: SpatialViewSource): void {
    if (this.closed) return;
    const cached = this.projectionCache.get(sourceKey);
    if (cached) {
      this.publishProjection(sourceKey, 'ready', cached, null);
      return;
    }
    if (this.projectionFlight.has(sourceKey)) return;
    const client = this.controller.current;
    if (!client) return;
    const lease: ProjectionLease = {
      projectId: this.projectId,
      sourceKey,
      worker: client,
      mountedGeneration: this.projectionMounted,
    };
    this.projectionFlight.add(sourceKey);
    this.spatialRequestsSent += 1;
    this.publishProjection(sourceKey, 'loading', null, null);
    void client
      .systemRequest({ kind: 'projectSpatialView', source })
      .then(async (event) => {
        if (import.meta.env.MODE === 'test') {
          await holdProjectionReply();
          event = maybeCorruptProjection(event);
        }
        const current = this.currentLease(sourceKey);
        if (!current || !projectionLeaseMatches(lease, current)) return;
        if (event.kind !== 'spatialViewProjected') return;
        if (!projectionAccepts(source, event.projection)) {
          this.publishProjection(sourceKey, 'failed', null, 'projection_source_mismatch');
          return;
        }
        this.projectionCache.set(sourceKey, event.projection);
        this.publishProjection(sourceKey, 'ready', event.projection, null);
      })
      .catch((error: unknown) => {
        const current = this.currentLease(sourceKey);
        if (!current || !projectionLeaseMatches(lease, current)) return;
        if (error instanceof StaleRequest) return;
        const code = error instanceof Error ? error.message : 'projection_failed';
        this.publishProjection(sourceKey, 'failed', null, code);
      })
      .finally(() => {
        this.projectionFlight.delete(sourceKey);
      });
  }
  /** Drawable read model for the committed input, after activation has settled. */
  private refreshInputProjection(): void {
    const input = this.state.normalizedInput;
    const digest = this.state.inputDigest;
    if (!input || !digest) return;
    this.ensureInputProjection(input, digest);
  }
  private currentLease(sourceKey: string): ProjectionLease | null {
    const client = this.controller.current;
    if (this.closed || !client) return null;
    return {
      projectId: this.projectId,
      sourceKey,
      worker: client,
      mountedGeneration: this.projectionMounted,
    };
  }
  private publishProjection(
    sourceKey: string,
    status: ProjectionEntry['status'],
    projection: SpatialProjection | null,
    failureCode: string | null,
  ): void {
    const current = this.state.plan.projections[sourceKey];
    if (
      current &&
      current.status === status &&
      current.projection === projection &&
      current.failureCode === failureCode
    ) {
      return;
    }
    this.patchPlan({
      projections: {
        ...this.state.plan.projections,
        [sourceKey]: { status, projection, failureCode },
      },
    });
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
    this.clearSearchProgressPaint();
    this.projectionMounted += 1;
    this.nextFactsMounted += 1;
    this.nextFactsFlight = null;
    this.nextFactsCache.clear();
    this.projectionFlight.clear();
    this.projectionCache.clear();
    this.pump?.dispose();
    this.channel?.close();
    const client = this.controller.current;
    if (client) {
      await client.request({ kind: 'disposeProject' }).catch(() => undefined);
    }
    return true;
  }
}
