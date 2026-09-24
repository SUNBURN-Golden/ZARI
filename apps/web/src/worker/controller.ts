import type { ProtocolRequest } from '../contracts/generated/dto';
import { ProbeClient, StaleRequest, type WorkerPort } from './client';

type Command = ProtocolRequest['command'];
type Reply = Awaited<ReturnType<ProbeClient['request']>>;
type ExtractReply<K> = Extract<Reply, { kind: K }>;

export type WorkerLifecycle =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'failed'
  | 'recovering';

export interface PumpHooks {
  onStarted?: (searchId: string) => void;
  onProgress?: (event: ExtractReply<'searchProgress'>) => void;
  onCompleted?: (event: ExtractReply<'searchCompleted'>) => void;
  onCancelled?: (event: ExtractReply<'searchCancelled'>) => void;
  onFailed?: (error: Error) => void;
  /** Cooperative cancel exceeded `cancelTimeoutMs`; caller may terminate. */
  onCancelTimeout?: () => void;
  /** No searchProgress within `watchdogMs`; the search may be wedged. */
  onStalled?: () => void;
}
export interface PumpOptions extends PumpHooks {
  stepAllowance?: number;
  cancelTimeoutMs?: number;
  watchdogMs?: number;
  /** Host scheduling hook; defaults to a real macrotask (never a microtask loop). */
  schedule?: (fn: () => void) => unknown;
  unschedule?: (token: unknown) => void;
  stepTimeoutMs?: number;
}

/**
 * Host-side scheduler for one continuous search. One active search at a time;
 * every scheduled step is a macrotask so inbound cancel/crash messages can
 * interleave. Cancellation is cooperative between bounded WASM steps; a hard
 * `dispose()` is the fallback, never the primary mechanism.
 */
export class SearchPump {
  private searchId: string | null = null;
  private generation = 0;
  private scheduled: unknown = null;
  private cancelTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private cancelRequested = false;
  private terminal = false;
  constructor(
    private readonly client: ProbeClient,
    private options: PumpOptions = {},
  ) {}
  private schedule(fn: () => void): void {
    const schedule = this.options.schedule ?? ((f: () => void) => setTimeout(f, 0));
    this.scheduled = schedule(fn);
  }
  private clearScheduled(): void {
    if (this.scheduled === null) return;
    (this.options.unschedule ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)))(
      this.scheduled,
    );
    this.scheduled = null;
  }
  private armWatchdog(): void {
    const ms = this.options.watchdogMs ?? 10_000;
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (!this.terminal) this.options.onStalled?.();
    }, ms);
  }
  private clearTimers(): void {
    this.clearScheduled();
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.cancelTimer) clearTimeout(this.cancelTimer);
    this.watchdog = this.cancelTimer = null;
  }
  private finish(fn: () => void): void {
    if (this.terminal) return;
    this.terminal = true;
    this.clearTimers();
    fn();
  }
  /** Start a new search; the caller guarantees the previous one is cancelled. */
  async start(
    mode: Extract<Command, { kind: 'startSearch' }>['mode'],
    hooks: PumpHooks = {},
  ): Promise<string> {
    this.options = { ...this.options, ...hooks };
    this.terminal = false;
    this.cancelRequested = false;
    const reply = await this.client.request({ kind: 'startSearch', mode });
    if (reply.kind !== 'searchStarted') throw new Error('unexpected_worker_event');
    const started = reply as ExtractReply<'searchStarted'>;
    this.searchId = started.searchId;
    this.generation += 1;
    hooks.onStarted?.(started.searchId);
    if (started.mode === 'continuous') {
      this.armWatchdog();
      this.schedule(() => void this.step());
    }
    return started.searchId;
  }
  /** One bounded WASM step; scheduling lives here, not inside the Worker. */
  private async step(): Promise<void> {
    if (this.terminal || this.searchId === null) return;
    const id = this.searchId;
    const generation = this.generation;
    try {
      const reply = await this.client.request(
        {
          kind: 'stepSearch',
          searchId: id,
          allowance: this.options.stepAllowance ?? 256,
        },
        this.options.stepTimeoutMs ?? 10_000,
      );
      if (this.terminal || this.generation !== generation || this.searchId !== id) return;
      if (reply.kind === 'searchProgress') {
        this.options.onProgress?.(reply as ExtractReply<'searchProgress'>);
        this.armWatchdog();
        if (!this.cancelRequested) this.schedule(() => void this.step());
        return;
      }
      if (reply.kind === 'searchCompleted') {
        this.finish(() =>
          this.options.onCompleted?.(reply as ExtractReply<'searchCompleted'>),
        );
        return;
      }
      if (reply.kind === 'searchCancelled') {
        this.finish(() =>
          this.options.onCancelled?.(reply as ExtractReply<'searchCancelled'>),
        );
        return;
      }
      throw new Error('unexpected_worker_event');
    } catch (error) {
      if (this.terminal) return;
      if (error instanceof StaleRequest) return;
      // If the Worker itself died, report the crash reason, not the dispatch
      // failure of a step that was already scheduled.
      const cause = this.client.failure ?? error;
      this.finish(() =>
        this.options.onFailed?.(cause instanceof Error ? cause : new Error(String(cause))),
      );
    }
  }
  /**
   * Cooperative cancel: marks the UI superseded immediately, sends
   * `cancelSearch`, and arms a hard-timeout for a wedged search.
   */
  cancel(): void {
    if (this.terminal || this.searchId === null || this.cancelRequested) return;
    this.cancelRequested = true;
    this.clearScheduled();
    const timeoutMs = this.options.cancelTimeoutMs ?? 250;
    this.cancelTimer = setTimeout(() => {
      if (!this.terminal) this.options.onCancelTimeout?.();
    }, timeoutMs);
    const searchId = this.searchId;
    void this.client
      .request({ kind: 'cancelSearch', searchId }, timeoutMs + 500)
      .then((reply) => {
        if (reply.kind === 'searchCancelled') {
          this.finish(() =>
            this.options.onCancelled?.(reply as ExtractReply<'searchCancelled'>),
          );
        }
      })
      .catch(() => {});
  }
  get activeSearchId(): string | null {
    return this.terminal ? null : this.searchId;
  }
  get isRunning(): boolean {
    return !this.terminal && this.searchId !== null;
  }
  dispose(): void {
    this.terminal = true;
    this.clearTimers();
    this.searchId = null;
  }
}

/**
 * One guarded Worker lifecycle. `ensure()` creates a fresh client+Worker;
 * `recover()` retires the whole instance and starts a new session. Pending
 * promises always reject — a failed operation is never claimed complete and
 * never silently replayed.
 */
export class WorkerController {
  private client: ProbeClient | null = null;
  private lifecycle: WorkerLifecycle = 'uninitialized';
  private listeners = new Set<(state: WorkerLifecycle, error: Error | null) => void>();
  private starting: Promise<ProbeClient> | null = null;
  constructor(
    private readonly factory: () => WorkerPort,
    private readonly timeoutMs = 5000,
  ) {}
  onLifecycle(listener: (state: WorkerLifecycle, error: Error | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private setLifecycle(state: WorkerLifecycle, error: Error | null = null): void {
    this.lifecycle = state;
    for (const listener of this.listeners) listener(state, error);
  }
  get state(): WorkerLifecycle {
    return this.lifecycle;
  }
  get current(): ProbeClient | null {
    return this.lifecycle === 'ready' ? this.client : null;
  }
  /** Awaitable readiness; concurrent callers share one start. */
  ensure(): Promise<ProbeClient> {
    if (this.client && this.lifecycle === 'ready') return Promise.resolve(this.client);
    if (this.starting) return this.starting;
    this.setLifecycle('initializing');
    const client = new ProbeClient(this.factory, (error) => {
      if (this.client === client) {
        this.client = null;
        this.setLifecycle('failed', error);
      }
    }, this.timeoutMs);
    this.starting = client
      .start()
      .then(() => {
        this.client = client;
        this.setLifecycle('ready');
        return client;
      })
      .catch((error: unknown) => {
        if (this.client === null) this.setLifecycle('failed', error as Error);
        throw error;
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }
  /** Hard restart: retire the whole instance, then a fresh session. */
  async recover(): Promise<ProbeClient> {
    this.setLifecycle('recovering');
    this.client?.dispose();
    this.client = null;
    return this.ensure();
  }
  dispose(): void {
    this.client?.dispose();
    this.client = null;
    this.setLifecycle('uninitialized');
  }
}
