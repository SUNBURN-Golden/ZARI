//! z-performance-budget regressions: the speed-ups must not move any
//! canonical byte, and a deterministic work budget must stay distinct from
//! host pacing or a wall-clock stop.
use serde_json::{Value, json};
use std::{fs, path::PathBuf, thread, time::Duration};
use zari_core::{
    CatalogContent, CatalogSnapshot, DomainFixture, ProjectInput, Runtime, canonical,
    domain_fixture_requests,
};

fn fixture(name: &str) -> DomainFixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/bench")
        .join(format!("{name}.json"));
    serde_json::from_slice(&fs::read(path).expect("bench fixture")).expect("fixture parses")
}
fn runtime() -> Runtime {
    let mut runtime = Runtime::new();
    runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
    runtime
}
fn send(runtime: &mut Runtime, request: &Value) -> Value {
    serde_json::from_str(&runtime.handle_json(&request.to_string())).expect("reply is JSON")
}
fn event(reply: &Value) -> &Value {
    &reply["event"]
}
/// Terminal facts of a finished search: the parts that must be canonical.
fn terminal(reply: &Value) -> (String, Vec<String>, Value) {
    let result = &event(reply)["result"];
    (
        result["termination"]
            .as_str()
            .expect("termination")
            .to_owned(),
        result["alternatives"]
            .as_array()
            .expect("alternatives")
            .iter()
            .map(|a| a["planSnapshotId"].as_str().expect("id").to_owned())
            .collect(),
        result["consumed"].clone(),
    )
}
/// Initialize, activate and start the bench-search-small search, then step it
/// with `allowance` until it completes. `pause_every` inserts a real sleep
/// between steps to emulate a slow host; it must not change any result.
fn run_to_completion(allowance: u64, pause_every: u32) -> (String, Vec<String>, Value, u32) {
    let fixture = fixture("bench-search-small");
    let requests = domain_fixture_requests(&fixture);
    let mut runtime = runtime();
    let mut started = Value::Null;
    for request in &requests[..3] {
        started = send(&mut runtime, request);
    }
    let search_id = event(&started)["searchId"]
        .as_str()
        .expect("search id")
        .to_owned();
    let mut meta = requests[2]["meta"].clone();
    let mut steps = 0_u32;
    loop {
        steps += 1;
        meta["requestId"] = json!(format!("budget-step-{steps}"));
        let reply = send(
            &mut runtime,
            &json!({
                "meta": meta,
                "command": { "kind": "stepSearch", "searchId": search_id, "allowance": allowance }
            }),
        );
        match event(&reply)["kind"].as_str() {
            Some("searchProgress") => {
                if pause_every > 0 && steps.is_multiple_of(pause_every) {
                    thread::sleep(Duration::from_millis(2));
                }
            }
            Some("searchCompleted") => {
                let (termination, digests, consumed) = terminal(&reply);
                return (termination, digests, consumed, steps);
            }
            other => panic!("unexpected event {other:?}"),
        }
    }
}

#[test]
fn budget_termination_does_not_depend_on_step_size_or_host_pacing() {
    let expected = fixture("bench-search-small");
    let want = serde_json::to_value(&expected.expected).expect("expected serializes");
    let (termination, digests, consumed, small_steps) = run_to_completion(64, 0);
    assert_eq!(termination, "budgetExhausted");
    assert_eq!(json!(termination), want["termination"]);
    assert_eq!(json!(digests), want["alternativeDigests"]);
    assert_eq!(consumed, want["consumed"]);
    // A larger allowance and a deliberately slow host reach the same
    // deterministic stop with the same plans and the same consumed counters.
    let (t2, d2, c2, large_steps) = run_to_completion(1024, 0);
    let (t3, d3, c3, _) = run_to_completion(64, 25);
    assert!(large_steps < small_steps, "pacing must actually differ");
    assert_eq!((&t2, &d2, &c2), (&termination, &digests, &consumed));
    assert_eq!((&t3, &d3, &c3), (&termination, &digests, &consumed));
}
#[test]
fn a_cancel_is_not_reported_as_budget_exhaustion() {
    let fixture = fixture("bench-search-small");
    let requests = domain_fixture_requests(&fixture);
    let mut runtime = runtime();
    let mut started = Value::Null;
    for request in &requests[..3] {
        started = send(&mut runtime, request);
    }
    let search_id = event(&started)["searchId"]
        .as_str()
        .expect("search id")
        .to_owned();
    let mut meta = requests[2]["meta"].clone();
    meta["requestId"] = json!("budget-cancel");
    let reply = send(
        &mut runtime,
        &json!({ "meta": meta, "command": { "kind": "cancelSearch", "searchId": search_id } }),
    );
    assert_eq!(event(&reply)["kind"], "searchCancelled");
    assert!(event(&reply).get("result").is_none());
}
#[test]
fn context_id_for_a_known_digest_is_byte_identical() {
    let fixture = fixture("bench-search-small");
    let input: ProjectInput =
        serde_json::from_value(fixture.input["input"].clone()).expect("input");
    let snapshot: CatalogSnapshot =
        serde_json::from_value(fixture.input["catalog"].clone()).expect("catalog");
    let content = CatalogContent::from(&snapshot);
    let digest = canonical::catalog_digest(&content);
    assert_eq!(digest, snapshot.catalog_digest);
    assert_eq!(
        canonical::context_id(&input, &content),
        canonical::context_id_for_catalog_digest(&input, &digest)
    );
}
#[test]
fn nfc_fast_path_matches_full_normalization() {
    let decomposed = "e\u{0301}cole \u{1100}\u{1161}"; // NFD French and Hangul jamo
    let composed = "\u{e9}cole \u{ac00}";
    let a = json!({ decomposed: [decomposed, "plain ascii", 7, null, true] });
    let b = json!({ composed: [composed, "plain ascii", 7, null, true] });
    assert_eq!(
        canonical::canonical_bytes(&a),
        canonical::canonical_bytes(&b)
    );
    assert_eq!(canonical::content_digest(&a), canonical::content_digest(&b));
    let bytes = String::from_utf8(canonical::canonical_bytes(&a)).expect("utf8");
    assert!(bytes.contains(composed) && !bytes.contains(decomposed));
}
#[test]
fn reusing_a_cached_catalog_keeps_the_context_and_never_invents_one() {
    let fixture = fixture("bench-search-small");
    let requests = domain_fixture_requests(&fixture);
    let mut runtime = runtime();
    send(&mut runtime, &requests[0]);
    let full = send(&mut runtime, &requests[1]);
    assert_eq!(event(&full)["kind"], "projectActivated");
    let context_id = event(&full)["contextId"].clone();
    // Same input, catalog omitted: the engine reuses the content it verified.
    let mut again = requests[1].clone();
    again["meta"]["requestId"] = json!("budget-reactivate");
    again["meta"]["projectActivationId"] = json!("fixture-activation-2");
    again["command"]["context"]["catalog"] = Value::Null;
    let cached = send(&mut runtime, &again);
    assert_eq!(event(&cached)["kind"], "projectActivated");
    assert_eq!(event(&cached)["contextId"], context_id);
    // A digest the engine never verified is refused, not defaulted.
    let mut fresh = Runtime::new();
    send(&mut fresh, &requests[0]);
    let refused = send(&mut fresh, &again);
    assert_eq!(event(&refused)["kind"], "operationFailed");
    assert_eq!(event(&refused)["code"], "catalog_unavailable");
}
