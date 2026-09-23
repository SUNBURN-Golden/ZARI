use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Default)]
pub struct Runtime(zari_core::Runtime);

#[wasm_bindgen]
impl Runtime {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }
    pub fn handle_json(&mut self, input: &str) -> String {
        self.0.handle_json(input)
    }
}
