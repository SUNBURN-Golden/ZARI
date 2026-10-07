import { afterEach, expect, it, vi } from 'vitest';
import {
  ProbeClient,
  StaleRequest,
  WORKER_BUILD_ID,
  WORKER_CAPABILITIES,
  type WorkerPort,
} from '../../src/worker/client';
import type { ProtocolRequest, ProtocolResponse } from '../../src/contracts/generated/dto';
class Port implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: ProtocolRequest[] = [];
  terminate = vi.fn();
  postMessage(text: string) {
    this.sent.push(JSON.parse(text) as ProtocolRequest);
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
const readyEvent = {
  kind: 'ready',
  buildId: WORKER_BUILD_ID,
  protocolVersion: 1,
  schemaVersion: 1,
  canonicalVersion: 1,
  ruleVersion: 'zari-domain-v1',
  solverVersion: 'zari-solver-v1',
  capabilities: WORKER_CAPABILITIES,
} as const;
afterEach(() => clients.splice(0).forEach((client) => client.dispose()));
async function setup() {
  const ports: Port[] = [];
  const failure = vi.fn();
  const client = new ProbeClient(() => {
    const port = new Port();
    ports.push(port);
    return port;
  }, failure);
  clients.push(client);
  const start = client.start();
  const port = ports[0]!;
  port.respond({ ...readyEvent, capabilities: [...readyEvent.capabilities] });
  await start;
  const active = client.activate('A', '0', '0');
  port.respond({ kind: 'projectActivated', contextId: null });
  await active;
  return { client, port, ports, failure };
}
it('rejects a delayed reply immediately when raw input changes', async () => {
  const { client, port } = await setup();
  const pending = client.request({ kind: 'disposeProject' });
  const rejected = expect(pending).rejects.toBeInstanceOf(StaleRequest);
  client.setEpoch('1');
  port.respond({ kind: 'projectDisposed' });
  await rejected;
});
it('rejects rewritten metadata but accepts the original captured identity', async () => {
  const { client, port } = await setup();
  const resolve = vi.fn();
  const pending = client.request({ kind: 'disposeProject' }).then(resolve);
  port.respond({ kind: 'projectDisposed' }, undefined, { inputRevision: '7' });
  await Promise.resolve();
  expect(resolve).not.toHaveBeenCalled();
  port.respond({ kind: 'projectDisposed' });
  await pending;
  expect(resolve).toHaveBeenCalledOnce();
});
it('fences A to B to A navigation with fresh activations', async () => {
  const { client, port } = await setup();
  const old = port.sent.at(-1)!;
  for (const name of ['B', 'A']) {
    const p = client.activate(name, '0', '0');
    port.respond({ kind: 'projectActivated', contextId: null }, old);
    port.respond({ kind: 'projectActivated', contextId: null });
    await p;
  }
  expect(port.sent.at(-1)!.meta.projectActivationId).not.toBe(old.meta.projectActivationId);
});
it('preserves separate request identity for out-of-order replies', async () => {
  const { client, port } = await setup();
  const first = client.request({ kind: 'disposeProject' });
  const old = port.sent.at(-1)!;
  const second = client.request({ kind: 'disposeProject' });
  port.respond({ kind: 'projectDisposed' });
  await expect(second).resolves.toEqual({ kind: 'projectDisposed' });
  port.respond({ kind: 'projectDisposed' }, old);
  await expect(first).resolves.toEqual({ kind: 'projectDisposed' });
});
it('crash/restart retires the old Worker and its late callback', async () => {
  const { client, port, ports, failure } = await setup();
  const pending = client.request({ kind: 'disposeProject' });
  const rejected = expect(pending).rejects.toThrow('worker_crashed');
  const listener = port.onmessage;
  port.onerror?.({} as ErrorEvent);
  await rejected;
  expect(port.terminate).toHaveBeenCalled();
  const restart = client.start();
  const fresh = ports[1]!;
  listener?.({ data: 'late malformed response' } as MessageEvent);
  fresh.respond({ ...readyEvent, capabilities: [...readyEvent.capabilities] });
  await restart;
  expect(failure).toHaveBeenCalledOnce();
  expect(fresh.sent[0]!.meta.workerSessionId).not.toBe(port.sent[0]!.meta.workerSessionId);
});
it('malformed and oversized response retires the Worker', async () => {
  const { port, failure } = await setup();
  port.onmessage?.({ data: 'x'.repeat(5 * 1024 * 1024 + 1) } as MessageEvent);
  expect(failure).toHaveBeenCalledOnce();
  expect(port.terminate).toHaveBeenCalled();
});

async function startWith(
  event: ProtocolResponse['event'],
): Promise<{ error: unknown }> {
  const ports: Port[] = [];
  const client = new ProbeClient(() => {
    const port = new Port();
    ports.push(port);
    return port;
  });
  clients.push(client);
  const start = client.start();
  ports[0]!.respond(event);
  return { error: await start.then(() => null, (error: unknown) => error) };
}

it('rejects an old build id and a capability list that is not an exact match', async () => {
  const oldBuild = await startWith({
    ...readyEvent,
    buildId: 'zari-domain-4',
    capabilities: [...readyEvent.capabilities],
  });
  expect(oldBuild.error).toEqual(new Error('protocol_version_mismatch'));
  const swapped = [...readyEvent.capabilities];
  [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
  const swappedReply = await startWith({ ...readyEvent, capabilities: swapped });
  expect(swappedReply.error).toEqual(new Error('protocol_version_mismatch'));
  const extra = await startWith({
    ...readyEvent,
    capabilities: [...readyEvent.capabilities, 'notARealOperation'],
  });
  expect(extra.error).toEqual(new Error('protocol_version_mismatch'));
  const missing = await startWith({
    ...readyEvent,
    capabilities: readyEvent.capabilities.slice(0, -1),
  });
  expect(missing.error).toEqual(new Error('protocol_version_mismatch'));
});
