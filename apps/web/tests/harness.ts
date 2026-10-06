import { beginMove, updateMove, type Matrix2D } from '../src/features/workspace/drag';
import type { WorkspaceLease } from '../src/features/workspace/lease';
import { measureSpatial as runSpatialStages, type SpatialStageSample } from './spatial-measure';
import { ProbeClient } from '../src/worker/client';
import { ProjectRepository } from '../src/persistence/repository';
import type {
  BootstrapProbeDto,
  BootstrapProbeResult,
  DomainFixture,
  PlanSnapshot,
  ProjectInput,
  RawProjectInputDto,
} from '../src/contracts/generated/dto';
import init, {
  Runtime,
  domainFixtureRequests,
} from '../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';

export interface BenchRequestTiming {
  /** JSON.stringify of the wire request, in the page. */
  encodeMs: number;
  /** postMessage send -> response received (worker queue + Rust + reply). */
  workerMs: number;
  /** JSON.parse of the wire response, in the page. */
  decodeMs: number;
  /** In-page Runtime.handle_json on the same request (no Worker hop). */
  directMs: number;
  /**
   * Runtime.handle_json inside the Worker for this same round trip, reported
   * by the instrumented bench worker (`spawnTimedWorker`); null for the
   * production entry. `workerMs - workerComputeMs` is the messaging residual.
   */
  workerComputeMs: number | null;
  requestBytes: number;
  responseBytes: number;
}
export interface BenchStepResult {
  timing: BenchRequestTiming;
  event: unknown;
}
export interface BenchApi {
  /** Request wire strings the native fixture runner would send. */
  requestsFor(fixture: DomainFixture): string[];
  /** Fresh uninstrumented Worker. */
  spawnWorker(): Worker;
  /**
   * Fresh Worker running the test-only instrumented entry (tests/bench-entry.ts):
   * identical replies plus in-worker compute timing for each request.
   */
  spawnTimedWorker(): Worker;
  /**
   * Send one request through a real Worker, then replay the same request on an
   * in-page Runtime so worker-vs-direct residual is measured on identical
   * bytes. Both runtimes see the identical sequence when the caller drives
   * them in lockstep.
   */
  send(worker: Worker, direct: Runtime, requestJson: string): Promise<BenchStepResult>;
  /** Fresh in-page Runtime for the direct (no-Worker) lane. */
  directRuntime(): Runtime;
  /** Uncached download of the WASM module plus compile timing. */
  wasmTransfer(): Promise<{ bytes: number; fetchMs: number; compileMs: number }>;
  /** performance.memory snapshot where the engine exposes it. */
  memory(): { usedJSHeapSize: number; totalJSHeapSize: number } | null;
  /**
   * `updateMove` plus one animation frame that writes a rect. No Worker and
   * no Rust call. `jsMs` is the gesture function; `paintMs` includes that
   * frame.
   */
  timePreview(samples: number): Promise<{ jsMs: number[]; paintMs: number[] }>;
  /** Scene, frame, idle, and dispose timings for one already-projected source. */
  measureSpatial(
    projection: unknown,
    content: unknown,
    frameSamples: number,
  ): Promise<SpatialStageSample>;
  idb: {
    open(): Promise<number>;
    createProject(form: RawProjectInputDto): Promise<{ projectId: string; draft: { generation: string; editorSessionId: string }; ms: number }>;
    commitNormalized(
      projectId: string,
      form: RawProjectInputDto,
      normalized: ProjectInput,
      inputDigest: string,
    ): Promise<{ status: string; ms: number }>;
    putCatalog(catalog: unknown): Promise<number>;
    acceptSnapshot(projectId: string, snapshot: PlanSnapshot): Promise<{ status: string; ms: number }>;
    loadBundle(projectId: string): Promise<{ ms: number; snapshots: number; corrupt: number }>;
    close(): void;
  };
}
declare global {
  interface Window {
    runProbeFixture: (probe: BootstrapProbeDto) => Promise<BootstrapProbeResult>;
    runDomainFixture: (fixture: DomainFixture) => Promise<unknown>;
    runRawRequest: (request: string) => Promise<unknown>;
    bench: BenchApi;
  }
}
const wasmReady = init({ module_or_path: wasmUrl });
const client = new ProbeClient(
  () => new Worker(new URL('../src/worker/entry.ts', import.meta.url), { type: 'module' }),
);
const ready = client.start().then(() => client.activate('fixture-project', '0', '0'));
window.runProbeFixture = async (probe) => {
  await ready;
  const reply = await client.request({ kind: 'evaluateProbe', probe });
  if (reply.kind !== 'probeEvaluated') throw new Error('unexpected_fixture_event');
  return reply.result;
};
/** Run raw request JSON through a fresh real Worker/WASM Runtime. */
window.runRawRequest = async (request) => {
  const worker = new Worker(new URL('../src/worker/entry.ts', import.meta.url), {
    type: 'module',
  });
  try {
    const reply = await new Promise<unknown>((resolve, reject) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = (event) => reject(event);
      worker.postMessage(request);
    });
    return typeof reply === 'string' ? JSON.parse(reply) : reply;
  } finally {
    worker.terminate();
  }
};
/**
 * Drive one shared domain fixture through the identical request sequence the
 * native fixture runner uses: the request list is computed by the WASM build
 * itself, then each request goes through a real Worker `handle_json` call.
 */
window.runDomainFixture = async (fixture) => {
  await wasmReady;
  const requests = JSON.parse(
    domainFixtureRequests(JSON.stringify(fixture)),
  ) as unknown[];
  const worker = new Worker(new URL('../src/worker/entry.ts', import.meta.url), {
    type: 'module',
  });
  try {
    let event: unknown = null;
    for (const request of requests) {
      const reply = await new Promise<unknown>((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(e);
        worker.postMessage(JSON.stringify(request));
      });
      const response = typeof reply === 'string' ? JSON.parse(reply) : reply;
      event = response.event ?? null;
      // A fatal reply means the runtime is dead; further requests never answer.
      if (
        response.fatalProtocolError !== undefined ||
        response.kind === 'fatalProtocolError'
      )
        break;
      // For runSearch fixtures the oracle asserts on the terminal event — the
      // same rule the native `execute_domain_fixture_with` applies.
      if (
        fixture.operation === 'runSearch' &&
        ['searchCompleted', 'searchCancelled', 'operationFailed'].includes(
          (event as { kind?: string } | null)?.kind ?? '',
        )
      )
        break;
    }
    return event;
  } finally {
    worker.terminate();
  }
};

/**
 * ZARI-010 instrumented benchmark surface. Every measurement uses the same
 * wire requests the native fixture runner produces (domainFixtureRequests is
 * the WASM export), the same Worker entry point the app uses, and the real
 * ProjectRepository/IndexedDB stack. Timings are split so Worker transport,
 * Rust compute, JSON serialization, and IndexedDB commits stay separate.
 */
const encoder = new TextEncoder();
const now = () => performance.now();
let benchRepo: ProjectRepository | null = null;
const benchRepoInstance = async (): Promise<ProjectRepository> => {
  if (!benchRepo) {
    benchRepo = new ProjectRepository();
    await benchRepo.open();
  }
  return benchRepo;
};
const draftGenerations = new Map<string, number>();
const WORKER_ENTRY = () =>
  new Worker(new URL('../src/worker/entry.ts', import.meta.url), { type: 'module' });
const timedWorkers = new WeakSet<Worker>();
const TIMED_WORKER_ENTRY = () => {
  const worker = new Worker(new URL('./bench-entry.ts', import.meta.url), { type: 'module' });
  timedWorkers.add(worker);
  return worker;
};
window.bench = {
  requestsFor(fixture) {
    const requests = JSON.parse(
      domainFixtureRequests(JSON.stringify(fixture)),
    ) as unknown[];
    return requests.map((request) => JSON.stringify(request));
  },
  spawnWorker: () => WORKER_ENTRY(),
  spawnTimedWorker: () => TIMED_WORKER_ENTRY(),
  directRuntime: () => new Runtime(),
  async send(worker, direct, requestJson) {
    // Encode the parsed request exactly like ProbeClient.send does, then post
    // the freshly serialized bytes so encodeMs is a real measurement.
    const encodeStart = now();
    const wire = JSON.stringify(JSON.parse(requestJson));
    const encodeMs = now() - encodeStart;
    const timed = timedWorkers.has(worker);
    const start = now();
    let workerMs = 0;
    // The round trip ends at the reply itself; an instrumented worker then
    // posts its compute timing as a separate message outside that window.
    const { reply, workerComputeMs } = await new Promise<{
      reply: unknown;
      workerComputeMs: number | null;
    }>((resolve, reject) => {
      let first: { data: unknown } | null = null;
      worker.onmessage = (e) => {
        if (first === null) {
          workerMs = now() - start;
          first = { data: e.data };
          if (!timed) resolve({ reply: e.data, workerComputeMs: null });
          return;
        }
        const ms = (e.data as { benchComputeMs?: unknown } | null)?.benchComputeMs;
        resolve({ reply: first.data, workerComputeMs: typeof ms === 'number' ? ms : null });
      };
      worker.onerror = (e) => reject(new Error(`worker_error:${e.message ?? 'unknown'}`));
      worker.postMessage(wire);
    });
    const decodeStart = now();
    const response = typeof reply === 'string' ? JSON.parse(reply) : reply;
    const decodeMs = now() - decodeStart;
    const directStart = now();
    direct.handle_json(requestJson);
    const directMs = now() - directStart;
    return {
      timing: {
        encodeMs,
        workerMs,
        decodeMs,
        directMs,
        workerComputeMs,
        requestBytes: encoder.encode(wire).length,
        responseBytes: encoder.encode(typeof reply === 'string' ? reply : JSON.stringify(reply))
          .length,
      },
      event: (response as { event?: unknown }).event ?? null,
    };
  },
  async wasmTransfer() {
    const start = now();
    const buffer = await (await fetch(wasmUrl, { cache: 'no-store' })).arrayBuffer();
    const fetchMs = now() - start;
    const compileStart = now();
    await WebAssembly.compile(buffer);
    const compileMs = now() - compileStart;
    return { bytes: buffer.byteLength, fetchMs, compileMs };
  },
  async timePreview(samples) {
    const ctm: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const lease: WorkspaceLease = {
      projectId: 'bench',
      displayedPlanSnapshotId: 'bench-plan',
      editorEpoch: '0',
      inputRevision: '0',
      inputDigest: 'a'.repeat(64),
      catalogDigest: 'b'.repeat(64),
      projectRevision: '1',
      projectActivationId: 'bench-activation',
      workerSessionId: 'bench-worker',
      workspaceGeneration: '0',
    };
    const gesture = beginMove({
      pointerId: 1,
      startClient: { x: 0, y: 0 },
      origin: { x: 100, y: 80, z: 0 },
      placementId: 'bench-placement',
      ctm,
      lease,
    });
    if (!gesture) return { jsMs: [], paintMs: [] };
    const rect = document.createElement('div');
    rect.style.width = '10px';
    document.body.append(rect);
    const jsMs: number[] = [];
    const paintMs: number[] = [];
    try {
      for (let i = 0; i < samples; i += 1) {
        const started = performance.now();
        const jsStarted = performance.now();
        const updated = updateMove(gesture, { x: 40 + (i % 7), y: 18 }, ctm);
        jsMs.push(performance.now() - jsStarted);
        if (updated.kind === 'preview') rect.style.width = `${10 + (updated.gesture.position.x % 30)}px`;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            paintMs.push(performance.now() - started);
            resolve();
          });
        });
      }
    } finally {
      rect.remove();
    }
    return { jsMs, paintMs };
  },
  measureSpatial(projection, content, frameSamples) {
    return runSpatialStages(
      projection as Parameters<typeof runSpatialStages>[0],
      content as Parameters<typeof runSpatialStages>[1],
      frameSamples,
    );
  },
  memory() {
    const memory = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
      }
    ).memory;
    return memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize } : null;
  },
  idb: {
    async open() {
      const start = now();
      if (benchRepo) {
        benchRepo.db.close();
        benchRepo = null;
      }
      benchRepo = new ProjectRepository();
      await benchRepo.open();
      return now() - start;
    },
    async createProject(form) {
      const repo = await benchRepoInstance();
      const start = now();
      const row = await repo.createProject(`bench-${crypto.randomUUID()}`, form);
      const ms = now() - start;
      const bundle = await repo.loadBundle(row.projectId);
      const draft = bundle.draft;
      draftGenerations.set(row.projectId, 0);
      return {
        projectId: row.projectId,
        draft: {
          generation: draft?.generation ?? '0',
          editorSessionId: draft?.editorSessionId ?? '',
        },
        ms,
      };
    },
    async commitNormalized(projectId, form, normalized, inputDigest) {
      const repo = await benchRepoInstance();
      const generation = (draftGenerations.get(projectId) ?? 0) + 1;
      draftGenerations.set(projectId, generation);
      const start = now();
      const result = await repo.commitNormalizedInput({
        projectId,
        generation: String(generation),
        editorSessionId: `bench-${projectId}`,
        form,
        validation: { status: 'valid', diagnostics: [] },
        normalized,
        inputDigest,
        engineBuildId: 'zari-domain-3',
      });
      return { status: result.status, ms: now() - start };
    },
    async putCatalog(catalog) {
      const repo = await benchRepoInstance();
      const start = now();
      await repo.putCatalog(
        catalog as Parameters<ProjectRepository['putCatalog']>[0],
        'bench-fixture',
      );
      return now() - start;
    },
    async acceptSnapshot(projectId, snapshot) {
      const repo = await benchRepoInstance();
      const start = now();
      const result = await repo.acceptSnapshot({
        projectId,
        snapshot,
        engineBuildId: 'zari-domain-3',
      });
      return { status: result.status, ms: now() - start };
    },
    async loadBundle(projectId) {
      const repo = await benchRepoInstance();
      const start = now();
      const bundle = await repo.loadBundle(projectId);
      return {
        ms: now() - start,
        snapshots: bundle.snapshots.length,
        corrupt: bundle.corrupt.length,
      };
    },
    close() {
      benchRepo?.db.close();
      benchRepo = null;
      draftGenerations.clear();
    },
  },
};
