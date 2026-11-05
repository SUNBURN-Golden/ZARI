use wasm_bindgen::prelude::*;

/// Read-only nominal size check, independent of project storage and protocol identity.
#[wasm_bindgen(js_name = evaluateEasyFit)]
pub fn evaluate_easy_fit(text: &str) -> Result<String, JsError> {
    if text.len() > 4096 {
        return Err(JsError::new("input_too_large"));
    }
    let input: zari_core::easy_fit::EasyFitInput =
        serde_json::from_str(text).map_err(|_| JsError::new("invalid_easy_input"))?;
    serde_json::to_string(&zari_core::easy_fit::evaluate_easy_fit(&input))
        .map_err(|_| JsError::new("easy_result_failed"))
}

#[wasm_bindgen]
pub struct Runtime(zari_core::Runtime);

#[wasm_bindgen]
impl Runtime {
    /// The browser Worker runtime ships the reference solver; search commands
    /// run through the same `handle_json` boundary as native fixtures.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut runtime = zari_core::Runtime::new();
        runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
        Self(runtime)
    }
    pub fn handle_json(&mut self, input: &str) -> String {
        self.0.handle_json(input)
    }
}

impl Default for Runtime {
    fn default() -> Self {
        Self::new()
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

/// Read-only review of a dimension-only catalog bundle. This is deliberately
/// outside the Worker protocol: bundles may exceed the 5 MiB message cap and
/// the review never touches a project, snapshot or stored catalog.
#[wasm_bindgen(js_name = reviewCatalogBundle)]
pub fn review_catalog_bundle(text: &str) -> Result<String, JsError> {
    serde_json::to_string(&zari_core::catalog_bundle::review_bundle_text(text))
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Each instance owns immutable catalog/input state; JS yields between steps.
#[wasm_bindgen]
pub struct SpaceFitSearch(zari_core::space_fit::SpaceFitSearch);
#[wasm_bindgen]
impl SpaceFitSearch {
    #[wasm_bindgen(constructor)]
    pub fn new(text: &str) -> Result<Self, JsError> {
        if text.len() > 4 * 1024 * 1024 {
            return Err(JsError::new("space_input_too_large"));
        }
        let input = serde_json::from_str(text).map_err(|_| JsError::new("space_input_invalid"))?;
        zari_core::space_fit::SpaceFitSearch::new(input)
            .map(Self)
            .map_err(|e| JsError::new(&e))
    }
    pub fn step(&mut self, budget: u32) -> Result<String, JsError> {
        serde_json::to_string(&self.0.step(budget)).map_err(|_| JsError::new("space_result_failed"))
    }
}
