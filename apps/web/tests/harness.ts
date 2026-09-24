import { ProbeClient } from '../src/worker/client';
import type {
  BootstrapProbeDto,
  BootstrapProbeResult,
  DomainFixture,
} from '../src/contracts/generated/dto';
import init, {
  domainFixtureRequests,
} from '../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';
declare global {
  interface Window {
    runProbeFixture: (probe: BootstrapProbeDto) => Promise<BootstrapProbeResult>;
    runDomainFixture: (fixture: DomainFixture) => Promise<unknown>;
    runRawRequest: (request: string) => Promise<unknown>;
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
