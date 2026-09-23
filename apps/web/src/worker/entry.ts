import init, { Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';
let runtime: Runtime | null = null;
let fatal = false;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<unknown>) => {
  queue = queue
    .then(async () => {
      if (fatal) return;
      if (
        typeof event.data !== 'string' ||
        new TextEncoder().encode(event.data).length > 5 * 1024 * 1024
      )
        throw new Error('invalid_worker_message');
      if (!runtime) {
        await init({ module_or_path: wasmUrl });
        runtime = new Runtime();
      }
      self.postMessage(runtime.handle_json(event.data));
    })
    .catch(() => {
      fatal = true;
      self.postMessage(JSON.stringify({ fatalProtocolError: { code: 'worker_crashed' } }));
    });
};
