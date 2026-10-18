// Dedicated worker for reading a catalog bundle. The review is Rust (WASM) and
// read-only: it never touches a project, a snapshot, or a stored catalog, and
// bundles may be larger than the protocol's message cap, so it is not a
// protocol command.
import init, { reviewCatalogBundle } from '../../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';

let ready: Promise<unknown> | null = null;
self.onmessage = (event: MessageEvent<unknown>) => {
  void (async () => {
    try {
      if (typeof event.data !== 'string') throw new Error('invalid_bundle_message');
      ready ??= init({ module_or_path: wasmUrl });
      await ready;
      self.postMessage({ ok: true, json: reviewCatalogBundle(event.data) });
    } catch (error) {
      self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'bundle_worker_failed' });
    }
  })();
};
