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

/// The exact request JSON sequence a domain fixture drives through
/// `handle_json`, so native and browser runs share one Rust-owned definition.
#[wasm_bindgen(js_name = domainFixtureRequests)]
pub fn domain_fixture_requests(fixture_json: &str) -> Result<String, JsError> {
    let fixture: zari_core::DomainFixture =
        serde_json::from_str(fixture_json).map_err(|e| JsError::new(&e.to_string()))?;
    serde_json::to_string(&zari_core::domain_fixture_requests(&fixture))
        .map_err(|e| JsError::new(&e.to_string()))
}
