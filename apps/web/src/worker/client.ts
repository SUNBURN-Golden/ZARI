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
  expected: Reply['kind'];
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
  disposeProject: 'projectDisposed',
} as const;
const sameMeta = (a: Meta, b: Meta) =>
  Object.keys(a).every((key) => a[key as keyof Meta] === b[key as keyof Meta]);
/** Identity and transport only. Never interprets measurements or computes a plan. */
export class ProbeClient {
  private port: WorkerPort | null = null;
  private pending = new Map<string, Pending>();
  private session = '';
  private activation = 'system';
  private project = 'system';
  private epoch = '0';
  private revision = '0';
  private disposed = false;
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
      buildId: 'zari-bootstrap-1',
      expectedProtocolVersion: 1,
      expectedSchemaVersion: 1,
    });
    const capabilities = [
      'initialize',
      'activateProject',
      'normalizeInput(bootstrap)',
      'evaluateProbe',
      'disposeProject',
    ];
    if (
      reply.kind !== 'ready' ||
      reply.buildId !== 'zari-bootstrap-1' ||
      reply.protocolVersion !== 1 ||
      reply.schemaVersion !== 1 ||
      capabilities.some((cap) => !reply.capabilities.includes(cap)) ||
      reply.capabilities.length !== capabilities.length
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
  async activate(project: string, epoch: string, revision: string): Promise<void> {
    this.rejectPending(new StaleRequest());
    this.project = project;
    this.activation = crypto.randomUUID();
    this.epoch = epoch;
    this.revision = revision;
    const reply = await this.request({ kind: 'activateProject', context: { kind: 'bootstrap' } });
    if (reply.kind !== 'projectActivated' || reply.contextId !== null)
      throw new Error('invalid_activation');
  }
  request(command: Command): Promise<Reply> {
    if (!this.port || this.disposed) return Promise.reject(new Error('worker_unavailable'));
    const system = command.kind === 'initialize';
    const meta: Meta = {
      protocolVersion: 1,
      schemaVersion: 1,
      workerSessionId: this.session,
      projectActivationId: system ? 'system' : this.activation,
      projectId: system ? 'system' : this.project,
      requestId: crypto.randomUUID(),
      editorEpoch: system ? '0' : this.epoch,
      inputRevision: system ? '0' : this.revision,
      contextId: null,
    };
    const request = { meta, command } satisfies ProtocolRequest;
    if (!validateProtocolRequest(request))
      return Promise.reject(new Error('invalid_request_shape'));
    const text = JSON.stringify(request);
    if (new TextEncoder().encode(text).length > MAX_BYTES)
      return Promise.reject(new Error('message_too_large'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('worker_timeout')), this.timeoutMs);
      this.pending.set(meta.requestId, {
        meta,
        expected: expected[command.kind],
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
    if (response.event.kind !== pending.expected && response.event.kind !== 'operationFailed') {
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
