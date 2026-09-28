// Test-build-only instrumented copy of src/worker/entry.ts for the ZARI-010
// benchmark. Message handling is the same; the only addition times
// runtime.handle_json inside the Worker and posts that duration as a second,
// small message after the unchanged string reply. The page can then subtract
// Rust compute from the same execution's round trip, so the messaging
// residual never mixes in compute-time variance from a separate run.
// Never bundled into the app build (only reachable from tests/harness.ts).
import init, { Runtime } from '../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';
let runtime: Runtime | null = null;
let fatal = false;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<unknown>) => {
  queue = queue
    .then(async () => {
      if (fatal) return;
      if (typeof event.data !== 'string') throw new Error('invalid_worker_message');
      if (!runtime) {
        await init({ module_or_path: wasmUrl });
        runtime = new Runtime();
      }
      const start = performance.now();
      const reply = runtime.handle_json(event.data);
      const computeMs = performance.now() - start;
      self.postMessage(reply);
      self.postMessage({ benchComputeMs: computeMs });
    })
    .catch(() => {
      fatal = true;
      self.postMessage(JSON.stringify({ fatalProtocolError: { code: 'worker_crashed' } }));
      self.postMessage({ benchComputeMs: null });
    });
};
