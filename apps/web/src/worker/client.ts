import type { ProtocolRequest, ProtocolResponse } from '../contracts/generated/dto';
import {
  validateProtocolRequest,
  validateProtocolResponse,
} from '../contracts/generated/validators.mjs';
type Meta = ProtocolRequest['meta'];
type Command = ProtocolRequest['command'];
type Reply = ProtocolResponse['event'];
export interface WorkerPort {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}
export class StaleRequest extends Error {
  constructor() {
    super('stale_result');
  }
}
type Pending = {
  meta: Meta;
  expected: readonly string[];
  timer: ReturnType<typeof setTimeout>;
  resolve: (event: Reply) => void;
  reject: (error: Error) => void;
};
const MAX_BYTES = 5 * 1024 * 1024;
const expected = {
  initialize: 'ready',
  activateProject: 'projectActivated',
  normalizeInput: 'normalized',
  evaluateProbe: 'probeEvaluated',
  verifyRecord: 'recordVerified',
  normalizeCatalogFields: 'catalogFieldsNormalized',
  validateCatalog: 'catalogValidated',
  validateCandidate: 'candidateValidated',
  evaluateLayoutEdit: 'editEvaluated',
  projectSpatialView: 'spatialViewProjected',
  queryNextFacts: 'nextFactsQueried',
  queryActionEligibility: 'actionEligibilityQueried',
  applyInventoryLedger: 'inventoryLedgerApplied',
  reviewCatalogImport: 'catalogImportReviewed',
  quoteOfferBundle: 'offerBundleQuoted',
  proposeStrategies: 'strategiesProposed',
  evaluateStrategyLibrary: 'strategyLibraryEvaluated',
  comparePareto: 'paretoCompared',
  replanIncremental: 'incrementalReplanned',
  diagnoseSearch: 'searchDiagnosed',
  startSearch: 'searchStarted',
  disposeProject: 'projectDisposed',
} as const;
/** `stepSearch`/`cancelSearch` accept several terminal/progress events. */
const multiExpected: Partial<Record<Command['kind'], readonly string[]>> = {
  stepSearch: ['searchProgress', 'searchCompleted', 'searchCancelled'],
  cancelSearch: ['searchCancelled'],
};
const sameMeta = (a: Meta, b: Meta) =>
  Object.keys(a).every((key) => a[key as keyof Meta] === b[key as keyof Meta]);
export const WORKER_BUILD_ID = 'zari-domain-7';
/** Current guide rule. Older snapshots stay readable and are not completable. */
export const WORKER_RULE_VERSION = 'zari-domain-v2';
/** Exact ready-event order. A swap, extra, or omission is a version mismatch. */
export const WORKER_CAPABILITIES = [
  'initialize',
  'activateProject',
  'normalizeInput(bootstrap)',
  'normalizeInput(project)',
  'evaluateProbe',
  'verifyRecord',
  'normalizeCatalogFields',
  'validateCatalog',
  'validateCandidate',
  'evaluateLayoutEdit',
  'projectSpatialView',
  'queryNextFacts',
  'queryActionEligibility',
  'applyInventoryLedger',
  'reviewCatalogImport',
  'quoteOfferBundle',
  'disposeProject',
  'proposeStrategies',
  'evaluateStrategyLibrary',
  'startSearch',
  'stepSearch',
  'cancelSearch',
  'comparePareto',
  'replanIncremental',
  'diagnoseSearch',
] as const;
function capabilitiesMatch(actual: readonly string[]): boolean {
  return (
    actual.length === WORKER_CAPABILITIES.length &&
    WORKER_CAPABILITIES.every((capability, index) => actual[index] === capability)
  );
}
/**
 * Identity and transport only. Never interprets measurements or computes a plan.
 * One instance owns one Worker session; on crash/restart the whole instance is
 * retired and a fresh one is started by the caller.
 */
export class ProbeClient {
  private port: WorkerPort | null = null;
  private pending = new Map<string, Pending>();
  private session = '';
  private activation = 'system';
  private project = 'system';
  private epoch = '0';
  private revision = '0';
  private contextId: string | null = null;
  private disposed = false;
  private failureError: Error | null = null;
  /** The error that retired this Worker, if any. */
  get failure(): Error | null {
    return this.failureError;
  }
  /** Immutable transport identity. Callers must not persist these ids. */
  get transportIdentity(): {
    workerSessionId: string;
    projectActivationId: string;
    editorEpoch: string;
    inputRevision: string;
    projectId: string;
  } {
    return {
      workerSessionId: this.session,
      projectActivationId: this.activation,
      editorEpoch: this.epoch,
      inputRevision: this.revision,
      projectId: this.project,
    };
  }
  constructor(
    private readonly factory: () => WorkerPort,
    private readonly onFailure: (error: Error) => void = () => {},
    private readonly timeoutMs = 5000,
  ) {}
  async start(): Promise<void> {
    this.dispose();
    this.disposed = false;
    this.session = crypto.randomUUID();
    this.activation = this.project = 'system';
    this.epoch = this.revision = '0';
    this.contextId = null;
    const port = this.factory();
    this.port = port;
    const session = this.session;
    port.onmessage = (event) => {
      if (this.port === port && this.session === session) this.receive(event.data);
    };
    port.onerror = () => {
      if (this.port === port) this.fail(new Error('worker_crashed'));
    };
    port.onmessageerror = () => {
      if (this.port === port) this.fail(new Error('invalid_worker_message'));
    };
    const reply = await this.request({
      kind: 'initialize',
      buildId: WORKER_BUILD_ID,
      expectedProtocolVersion: 1,
      expectedSchemaVersion: 1,
    });
    if (
      reply.kind !== 'ready' ||
      reply.buildId !== WORKER_BUILD_ID ||
      reply.protocolVersion !== 1 ||
      reply.schemaVersion !== 1 ||
      !capabilitiesMatch(reply.capabilities)
    ) {
      const error = new Error('protocol_version_mismatch');
      this.fail(error);
      throw error;
    }
  }
  setEpoch(epoch: string): void {
    if (epoch !== this.epoch) {
      this.epoch = epoch;
      this.rejectPending(new StaleRequest(), true);
    }
  }
  async activate(
    project: string,
    epoch: string,
    revision: string,
    context: Extract<Command, { kind: 'activateProject' }>['context'] = { kind: 'bootstrap' },
  ): Promise<void> {
    this.rejectPending(new StaleRequest());
    this.project = project;
    this.activation = crypto.randomUUID();
    this.epoch = epoch;
    this.revision = revision;
    this.contextId = null;
    const reply = await this.request({ kind: 'activateProject', context });
    if (
      reply.kind !== 'projectActivated' ||
      (context.kind === 'bootstrap' && reply.contextId !== null) ||
      (context.kind === 'project' && typeof reply.contextId !== 'string')
    )
      throw new Error('invalid_activation');
    this.contextId = reply.contextId;
  }
  request(command: Command, timeoutMs = this.timeoutMs): Promise<Reply> {
    return this.send(command, command.kind === 'initialize', timeoutMs);
  }
  /**
   * A request under the system identity — `verifyRecord` for integrity checks
   * that must not be tied to a project activation or epoch. System requests
   * survive epoch bumps but are still fenced by the Worker session itself.
   */
  systemRequest(command: Command, timeoutMs = this.timeoutMs): Promise<Reply> {
    return this.send(command, true, timeoutMs);
  }
  private send(command: Command, system: boolean, timeoutMs: number): Promise<Reply> {
    if (!this.port || this.disposed) return Promise.reject(new Error('worker_unavailable'));
    const meta: Meta = {
      protocolVersion: 1,
      schemaVersion: 1,
      workerSessionId: this.session,
      projectActivationId: system ? 'system' : this.activation,
      projectId: system ? 'system' : this.project,
      requestId: crypto.randomUUID(),
      editorEpoch: system ? '0' : this.epoch,
      inputRevision: system ? '0' : this.revision,
      contextId: system ? null : this.contextId,
    };
    const request = { meta, command } satisfies ProtocolRequest;
    if (!validateProtocolRequest(request))
      return Promise.reject(new Error('invalid_request_shape'));
    const text = JSON.stringify(request);
    if (new TextEncoder().encode(text).length > MAX_BYTES)
      return Promise.reject(new Error('message_too_large'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('worker_timeout')), timeoutMs);
      this.pending.set(meta.requestId, {
        meta,
        expected: multiExpected[command.kind] ?? [expected[command.kind as keyof typeof expected]],
        timer,
        resolve,
        reject,
      });
      try {
        this.port?.postMessage(text);
      } catch {
        this.fail(new Error('worker_crashed'));
      }
    });
  }
  private receive(data: unknown): void {
    if (typeof data !== 'string' || new TextEncoder().encode(data).length > MAX_BYTES) {
      this.fail(new Error('invalid_worker_message'));
      return;
    }
    let response: unknown;
    try {
      response = JSON.parse(data);
    } catch {
      this.fail(new Error('invalid_worker_message'));
      return;
    }
    if (!validateProtocolResponse(response)) {
      this.fail(new Error('invalid_worker_message'));
      return;
    }
    const pending = this.pending.get(response.meta.requestId);
    if (!pending) return;
    if (!sameMeta(response.meta, pending.meta) || response.sequence !== 0) return;
    if (
      pending.meta.projectId !== 'system' &&
      (response.meta.projectId !== this.project ||
        response.meta.projectActivationId !== this.activation ||
        response.meta.editorEpoch !== this.epoch ||
        response.meta.inputRevision !== this.revision)
    )
      return;
    if (
      !pending.expected.includes(response.event.kind) &&
      response.event.kind !== 'operationFailed'
    ) {
      this.fail(new Error('unexpected_worker_event'));
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.meta.requestId);
    if (response.event.kind === 'operationFailed') pending.reject(new Error(response.event.code));
    else pending.resolve(response.event);
  }
  private rejectPending(error: Error, preserveInitialize = false): void {
    for (const [id, pending] of this.pending) {
      if (preserveInitialize && pending.meta.projectId === 'system') continue;
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
  private fail(error: Error): void {
    if (!this.disposed) {
      this.failureError = error;
      this.dispose(error);
      this.onFailure(error);
    }
  }
  dispose(error: Error = new StaleRequest()): void {
    this.disposed = true;
    this.port?.terminate();
    this.port = null;
    this.rejectPending(error);
  }
}
