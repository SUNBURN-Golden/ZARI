import init, { evaluateEasyFit } from '../../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';

// One immutable input per worker. The caller terminates it on navigation/edit.
self.onmessage = (event: MessageEvent<string>) => {
  void (async () => {
    try {
      await init({ module_or_path: wasmUrl });
      self.postMessage({ ok: true, json: evaluateEasyFit(event.data) });
    } catch {
      self.postMessage({ ok: false });
    }
  })();
};
