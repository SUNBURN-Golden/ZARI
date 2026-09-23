import init, { Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';
let runtime: Runtime | null = null;
let fatal = false;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<unknown>) => {
  queue = queue
    .then(async () => {
      if (fatal) return;
      // The Rust Runtime owns the message-size/depth/identity boundaries so the
      // same guard codes apply on native and browser paths; only a non-string
      // host message is a local programming error.
      if (typeof event.data !== 'string') throw new Error('invalid_worker_message');
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
