import { afterEach, expect, it, vi } from 'vitest';
import type {
  ProtocolRequest,
  ProtocolResponse,
  SearchCounters,
} from '../../src/contracts/generated/dto';
import { ProbeClient, type WorkerPort } from '../../src/worker/client';
import { SearchPump } from '../../src/worker/controller';

/**
 * HARNESS-ONLY tests (protocol fixtures). These drive `SearchPump` against a
 * controllable fake WorkerPort that answers protocol messages synchronously —
 * they exercise host-side scheduling, cancellation fencing and crash
 * handling. They are NOT evidence of real solver cancellation.
 *
 * Real-solver evidence lives elsewhere and must not be claimed from this file:
 * - `session.test.ts` "REAL solver" — SearchPump drives actual WASM steps and
 *   a real `cancelSearch` acknowledgement through the Runtime;
 * - `fixtures/domain/search-cancelled.json` via the @parity browser suite —
 *   real Chromium Worker/WASM cancel compared against the native engine.
 */

class Port implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: ProtocolRequest[] = [];
  /** When set, the port auto-replies to stepSearch with this event producer. */
  stepReply: ((n: number) => ProtocolResponse['event']) | null = null;
  terminate = vi.fn();
  postMessage(text: string) {
    const request = JSON.parse(text) as ProtocolRequest;
    this.sent.push(request);
    if (request.command.kind === 'stepSearch' && this.stepReply) {
      const event = this.stepReply(this.sent.filter((s) => s.command.kind === 'stepSearch').length);
      queueMicrotask(() => this.respond(event, request));
    }
  }
  respond(
    event: ProtocolResponse['event'],
    request = this.sent.at(-1)!,
    changes: Partial<ProtocolResponse['meta']> = {},
  ) {
    this.onmessage?.({
      data: JSON.stringify({ meta: { ...request.meta, ...changes }, sequence: 0, event }),
    } as MessageEvent);
  }
}
const clients: ProbeClient[] = [];
const counters: SearchCounters = { nodes: 1, validatedCandidates: 0, workUnits: '1' };
const readyEvent = {
  kind: 'ready',
  buildId: 'zari-domain-3',
  protocolVersion: 1,
  schemaVersion: 1,
  canonicalVersion: 1,
  ruleVersion: 'zari-domain-v1',
  solverVersion: 'zari-solver-v1',
  capabilities: [
    'initialize',
    'activateProject',
    'normalizeInput(bootstrap)',
    'normalizeInput(project)',
    'evaluateProbe',
    'verifyRecord',
    'normalizeCatalogFields',
    'validateCandidate',
    'evaluateLayoutEdit',
    'disposeProject',
    'proposeStrategies',
    'startSearch',
    'stepSearch',
    'cancelSearch',
  ],
} as const;
afterEach(() => clients.splice(0).forEach((c) => c.dispose()));

async function setup() {
  const ports: Port[] = [];
  const client = new ProbeClient(() => {
    const p = new Port();
    ports.push(p);
    return p;
  });
  clients.push(client);
  const start = client.start();
  ports[0]!.respond({ ...readyEvent, capabilities: [...readyEvent.capabilities] });
  await start;
  const active = client.activate('proj', '0', '0', { kind: 'bootstrap' });
  ports[0]!.respond({ kind: 'projectActivated', contextId: null });
  await active;
  return { client, port: ports[0]! };
}
/** Manual scheduler: queued step callbacks we can run one macrotask at a time. */
function manualSchedule() {
  const queue: (() => void)[] = [];
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    queue,
    schedule: (fn: () => void) => {
      queue.push(fn);
      return fn;
    },
    unschedule: (token: unknown) => {
      const i = queue.indexOf(token as () => void);
      if (i >= 0) queue.splice(i, 1);
    },
    runAll: async () => {
      while (queue.length) {
        queue.shift()!();
        await flush();
      }
      // Reply continuations resolve on queued microtasks; give them a few
      // macrotask turns to settle before asserting.
      await flush();
      await flush();
    },
  };
}

it('pump schedules bounded steps on a macrotask and reports completion', async () => {
  const { client, port } = await setup();
  const sched = manualSchedule();
  let steps = 0;
  port.stepReply = () => {
    steps += 1;
    return steps < 3
      ? { kind: 'searchProgress', searchId: 's1', consumed: counters }
      : {
          kind: 'searchCompleted',
          searchId: 's1',
          result: {
            alternatives: [],
            consumed: counters,
            diagnosticCandidates: [],
            scope: {
              budget: {
                maxAlternatives: 1,
                maxCandidatesPerGroup: 1,
                maxNodes: 10,
                maxWorkUnits: '100',
              },
              groupIds: [],
              profile: { id: 'default', version: 1 },
              restrictions: [],
            },
            termination: 'scopeComplete',
          },
        };
  };
  const pump = new SearchPump(client, { ...sched, stepAllowance: 8 });
  const completed = vi.fn();
  const progressed = vi.fn();
  const start = pump.start('continuous', { onCompleted: completed, onProgress: progressed });
  port.respond({ kind: 'searchStarted', searchId: 's1', mode: 'continuous' });
  await start;
  await sched.runAll();
  await Promise.resolve();
  expect(steps).toBe(3);
  expect(progressed).toHaveBeenCalledTimes(2);
  expect(completed).toHaveBeenCalledOnce();
  // Every step carried the bounded allowance, not an unbounded drive.
  for (const req of port.sent.filter((s) => s.command.kind === 'stepSearch')) {
    expect((req.command as { allowance: number }).allowance).toBe(8);
  }
});

it('cancel sends cancelSearch and marks the request superseded immediately', async () => {
  const { client, port } = await setup();
  const sched = manualSchedule();
  port.stepReply = () => ({ kind: 'searchProgress', searchId: 's1', consumed: counters });
  const pump = new SearchPump(client, { ...sched, cancelTimeoutMs: 10_000 });
  const cancelled = vi.fn();
  const start = pump.start('continuous', { onCancelled: cancelled });
  port.respond({ kind: 'searchStarted', searchId: 's1', mode: 'continuous' });
  await start;
  pump.cancel();
  // Superseded at once: no more steps are scheduled.
  await sched.runAll();
  const cancelReq = port.sent.find((s) => s.command.kind === 'cancelSearch');
  expect(cancelReq).toBeTruthy();
  port.respond({ kind: 'searchCancelled', searchId: 's1', consumed: counters }, cancelReq);
  await Promise.resolve();
  expect(cancelled).toHaveBeenCalledOnce();
  expect(port.sent.filter((s) => s.command.kind === 'stepSearch')).toHaveLength(0);
});

it('a wedged cancel reports a hard-timeout instead of hanging forever', async () => {
  vi.useFakeTimers();
  try {
    const { client, port } = await setup();
    const sched = manualSchedule();
    port.stepReply = () => ({ kind: 'searchProgress', searchId: 's1', consumed: counters });
    const pump = new SearchPump(client, { ...sched, cancelTimeoutMs: 250 });
    const timedOut = vi.fn();
    const start = pump.start('continuous', { onCancelTimeout: timedOut });
    port.respond({ kind: 'searchStarted', searchId: 's1', mode: 'continuous' });
    await start;
    pump.cancel();
    // Worker never answers the cancel → hard timeout fires for termination.
    await vi.advanceTimersByTimeAsync(300);
    expect(timedOut).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('a Worker crash during a search fails the pump without claiming success', async () => {
  const { client, port } = await setup();
  const sched = manualSchedule();
  const pump = new SearchPump(client, { ...sched });
  const failed = vi.fn();
  const start = pump.start('continuous', { onFailed: failed });
  port.respond({ kind: 'searchStarted', searchId: 's1', mode: 'continuous' });
  await start;
  port.onerror?.({} as ErrorEvent);
  await sched.runAll();
  await Promise.resolve();
  expect(failed).toHaveBeenCalledOnce();
  expect(String(failed.mock.calls[0]![0].message)).toContain('worker_crashed');
});

it('stale step replies after a restart are ignored', async () => {
  const { client, port } = await setup();
  const sched = manualSchedule();
  const pump = new SearchPump(client, { ...sched });
  const progressed = vi.fn();
  const start = pump.start('continuous', { onProgress: progressed });
  port.respond({ kind: 'searchStarted', searchId: 's1', mode: 'continuous' });
  await start;
  // Epoch bump fences in-flight steps; a late reply must be dropped.
  client.setEpoch('1');
  port.respond({ kind: 'searchProgress', searchId: 's1', consumed: counters });
  await sched.runAll();
  await Promise.resolve();
  expect(progressed).not.toHaveBeenCalled();
});
