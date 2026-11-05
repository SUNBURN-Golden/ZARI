import init, { SpaceFitSearch } from '../../../../crates/wasm/pkg/zari_wasm.js';
import wasmUrl from '../../../../crates/wasm/pkg/zari_wasm_bg.wasm?url';
let search: SpaceFitSearch | null = null;
let pending = Promise.resolve();
self.onmessage = (event: MessageEvent<{ type: 'start' | 'next'; json?: string; budget?: number }>) => {
  pending = pending.then(async () => {
    try {
      if (event.data.type === 'start') {
        search?.free(); search = null;
        await init({ module_or_path: wasmUrl });
        search = new SpaceFitSearch(event.data.json!);
      }
      if (!search) throw new Error('space_search_missing');
      // One bounded Rust step per message; return to the task queue afterwards.
      self.postMessage({ ok: true, json: search.step(event.data.budget ?? 1000) });
    } catch (error) {
      search?.free(); search = null;
      const message = error instanceof Error ? error.message : '';
      self.postMessage({ ok: false, code: /^space_axis_[012]$/.test(message) ? message : 'space_search_failed' });
    }
  });
};
