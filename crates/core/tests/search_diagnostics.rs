//! z-search-diagnostics. Unknown is not "no product". A larger budget is not a proof.

use serde_json::{Value, json};
use zari_core::canonical::CatalogContent;
use zari_core::facts::{Fact, UnknownReason};
use zari_core::plan::{SearchCounters, SearchScope, SearchTermination};
use zari_core::scalars::{LengthMm, WorkCount};
use zari_core::search_diagnostics::{
    DiagnosticClass, READ_MODEL_VERSION, SupportStatus, diagnose_case, diagnose_search,
};
use zari_core::*;
use zari_solver::SolverEngine;

fn raw() -> Value {
    serde_json::from_str(include_str!(
        "../../../fixtures/domain/candidate-bounded-confirmed.json"
    ))
    .unwrap()
}

fn world() -> (ProjectInput, CatalogContent) {
    let raw = raw();
    let body = &raw["input"];
    let input: ProjectInput = serde_json::from_value(body["input"].clone()).unwrap();
    let catalog: CatalogSnapshot = serde_json::from_value(body["catalog"].clone()).unwrap();
    (input, CatalogContent::from(&catalog))
}

fn align(input: &mut ProjectInput, catalog: &CatalogContent) {
    input.catalog_pin.catalog_digest = canonical::catalog_digest(catalog);
    input.catalog_pin.catalog_version = catalog.catalog_version.clone();
}

fn scope_for(input: &ProjectInput) -> SearchScope {
    SearchScope {
        profile: input.search.profile.clone(),
        budget: input.search.budget.clone(),
        group_ids: input.groups.iter().map(|group| group.id.clone()).collect(),
        restrictions: vec![],
    }
}

fn counters() -> SearchCounters {
    SearchCounters {
        work_units: WorkCount::new(0).unwrap(),
        nodes: 0,
        validated_candidates: 0,
    }
}

fn run(
    input: &ProjectInput,
    catalog: &CatalogContent,
    termination: SearchTermination,
) -> zari_core::search_diagnostics::SearchDiagnosticReply {
    let scope = scope_for(input);
    let consumed = counters();
    diagnose_search(&zari_core::search_diagnostics::DiagnoseAction {
        input,
        catalog,
        termination,
        scope: &scope,
        consumed: &consumed,
        alternatives: &[],
        diagnostic_candidates: &[],
    })
    .expect("diagnose")
}

fn present(
    reply: &zari_core::search_diagnostics::SearchDiagnosticReply,
    class: DiagnosticClass,
) -> bool {
    reply
        .classes
        .iter()
        .find(|row| row.class == class)
        .map(|row| row.present)
        .unwrap_or(false)
}

fn reasons(
    reply: &zari_core::search_diagnostics::SearchDiagnosticReply,
    class: DiagnosticClass,
) -> Vec<String> {
    reply
        .classes
        .iter()
        .find(|row| row.class == class)
        .map(|row| row.reason_codes.clone())
        .unwrap_or_default()
}

fn forbid_width(input: &mut ProjectInput) {
    let item = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == "item-a")
        .unwrap();
    item.dimensions.envelope.width = Fact::Unknown {
        reason: UnknownReason::NotMeasured,
    };
}

fn widen(input: &mut ProjectInput) {
    let item = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == "item-a")
        .unwrap();
    if let Fact::Known { value, .. } = &mut item.dimensions.envelope.width {
        value.nominal = LengthMm::new(9000).unwrap();
    } else {
        panic!("width is known");
    }
}

fn empty_catalog(input: &mut ProjectInput, catalog: &mut CatalogContent) {
    catalog.products.clear();
    catalog.variants.clear();
    catalog.offers.clear();
    input.owned_containers.clear();
    align(input, catalog);
}

fn keys(value: &Value, found: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                found.push(key.clone());
                keys(child, found);
            }
        }
        Value::Array(items) => {
            for child in items {
                keys(child, found);
            }
        }
        _ => {}
    }
}

#[test]
fn unknown_measurement_is_not_no_product() {
    let (mut input, catalog) = world();
    forbid_width(&mut input);
    align(&mut input, &catalog);
    let reply = run(&input, &catalog, SearchTermination::ScopeComplete);
    assert!(!present(&reply, DiagnosticClass::NoProduct));
    assert!(present(&reply, DiagnosticClass::Undetermined));
    assert!(
        reasons(&reply, DiagnosticClass::Undetermined).contains(&"measurement_missing".to_owned())
    );
    assert!(!reasons(&reply, DiagnosticClass::NoProduct).contains(&"catalog_empty".to_owned()));
    assert!(reply.next_checks.iter().any(|link| {
        link.fact_keys
            .iter()
            .any(|key| key.contains("item-a") && key.contains("dimensions.envelope.width"))
    }));
    assert!(!reply.proves_impossible);
    assert!(!reply.budget_suggestion_is_proof);
}

#[test]
fn empty_known_catalog_is_no_product_only_when_the_search_finished() {
    let (mut input, mut catalog) = world();
    empty_catalog(&mut input, &mut catalog);
    let finished = run(&input, &catalog, SearchTermination::ScopeComplete);
    assert!(present(&finished, DiagnosticClass::NoProduct));
    assert_eq!(
        reasons(&finished, DiagnosticClass::NoProduct),
        vec!["catalog_empty".to_owned()]
    );
    assert!(!present(&finished, DiagnosticClass::Undetermined));
    assert!(!present(&finished, DiagnosticClass::BudgetExhausted));

    let (mut input, mut catalog) = world();
    empty_catalog(&mut input, &mut catalog);
    forbid_width(&mut input);
    let unknown = run(&input, &catalog, SearchTermination::ScopeComplete);
    assert!(!present(&unknown, DiagnosticClass::NoProduct));
    assert!(present(&unknown, DiagnosticClass::Undetermined));
}

#[test]
fn a_larger_budget_is_not_an_impossibility_proof() {
    let (input, catalog) = world();
    let reply = run(&input, &catalog, SearchTermination::BudgetExhausted);
    assert!(present(&reply, DiagnosticClass::BudgetExhausted));
    assert!(reply.larger_budget_suggested);
    assert!(!reply.budget_suggestion_is_proof);
    assert!(!reply.proves_impossible);
    assert!(!present(&reply, DiagnosticClass::NoProduct));
    assert!(!present(&reply, DiagnosticClass::SearchNotFinished));
    let joined = reasons(&reply, DiagnosticClass::BudgetExhausted).join(" ");
    assert!(!joined.contains("impossible"));
    assert_eq!(
        reply
            .support
            .iter()
            .find(|row| row.code == "search_budget")
            .map(|row| row.status),
        Some(SupportStatus::Exhausted)
    );
    assert_eq!(
        reply
            .support
            .iter()
            .find(|row| row.code == "rectangular_floor_anchor")
            .map(|row| row.status),
        Some(SupportStatus::FiniteNotComplete)
    );
    assert!(reply.budget_account.exhausted);
}

#[test]
fn known_oversize_is_geometry_and_not_a_proof() {
    let (mut input, catalog) = world();
    widen(&mut input);
    align(&mut input, &catalog);
    let reply = run(&input, &catalog, SearchTermination::ScopeComplete);
    assert!(present(&reply, DiagnosticClass::GeometryOutOfRange));
    assert!(
        reasons(&reply, DiagnosticClass::GeometryOutOfRange)
            .contains(&"envelope_exceeds_space".to_owned())
    );
    assert!(!present(&reply, DiagnosticClass::NoProduct));
    assert!(!reply.larger_budget_suggested);
    assert!(!reply.proves_impossible);
    assert!(!reply.budget_suggestion_is_proof);
}

#[test]
fn cancel_is_unfinished_search_not_budget_or_no_product() {
    let (mut input, mut catalog) = world();
    empty_catalog(&mut input, &mut catalog);
    let reply = run(&input, &catalog, SearchTermination::Cancelled);
    assert!(present(&reply, DiagnosticClass::SearchNotFinished));
    assert!(!present(&reply, DiagnosticClass::BudgetExhausted));
    assert!(!present(&reply, DiagnosticClass::NoProduct));
    assert!(!reply.larger_budget_suggested);
    assert!(!reply.proves_impossible);
}

#[test]
fn reproduction_replays_the_same_classes_without_logs_or_secrets() {
    let (mut input, catalog) = world();
    forbid_width(&mut input);
    align(&mut input, &catalog);
    let reply = run(&input, &catalog, SearchTermination::ScopeComplete);
    assert_eq!(reply.read_model_version, READ_MODEL_VERSION);
    assert_eq!(reply.reproduction.rule_version, canonical::RULE_VERSION);
    assert_eq!(reply.reproduction.budget, input.search.budget);
    assert_eq!(
        reply.reproduction.catalog_digest,
        canonical::catalog_digest(&catalog)
    );
    assert_eq!(
        reply.reproduction.input_digest,
        canonical::input_digest(&input)
    );
    let again = diagnose_case(&reply.reproduction).unwrap();
    let flags = |item: &zari_core::search_diagnostics::SearchDiagnosticReply| {
        item.classes
            .iter()
            .map(|row| (row.class, row.present))
            .collect::<Vec<_>>()
    };
    assert_eq!(flags(&reply), flags(&again));
    assert!(!again.proves_impossible);
    assert!(!again.budget_suggestion_is_proof);
    let encoded = serde_json::to_value(&reply.reproduction).unwrap();
    let mut found = vec![];
    keys(&encoded, &mut found);
    for banned in [
        "log",
        "logs",
        "secret",
        "secrets",
        "password",
        "token",
        "apiKey",
        "sessionId",
        "requestId",
        "stack",
        "stackTrace",
        "durationMs",
        "photo",
        "photos",
        "workerSessionId",
    ] {
        assert!(!found.iter().any(|key| key == banned), "{banned}");
    }
    let text = serde_json::to_string(&reply.reproduction).unwrap();
    assert!(text.contains("\"budget\""));
    assert!(text.contains("\"catalog\""));
    assert!(text.contains("\"input\""));
    assert!(text.contains("\"ruleVersion\""));
    assert!(!text.contains("\"log\""));
}

#[test]
fn command_rejects_a_bare_payload_and_a_missing_engine() {
    let mut bare = Runtime::new();
    send(
        &mut bare,
        "init",
        None,
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    assert_eq!(
        send(
            &mut bare,
            "diagnose",
            None,
            json!({"kind": "diagnoseSearch"})
        )["event"]["code"],
        "operation_not_supported"
    );

    let mut runtime = Runtime::new();
    runtime.set_search_engine(Box::new(SolverEngine));
    let ready = send(
        &mut runtime,
        "init-search",
        None,
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    let names = ready["event"]["capabilities"].as_array().unwrap();
    assert_eq!(names.last().and_then(Value::as_str), Some("diagnoseSearch"));
    assert_eq!(names[names.len() - 2].as_str(), Some("replanIncremental"));
    assert_eq!(
        send(
            &mut runtime,
            "extra",
            None,
            json!({
                "kind": "diagnoseSearch",
                "termination": "scopeComplete",
                "scope": {},
                "consumed": {},
                "alternatives": [],
                "diagnosticCandidates": [],
                "extra": true
            })
        )["event"]["code"],
        "invalid_input"
    );
    let activated = send(
        &mut runtime,
        "activate",
        None,
        json!({"kind": "activateProject", "context": {"kind": "bootstrap"}}),
    );
    assert_eq!(activated["event"]["kind"], "projectActivated");
    assert_eq!(
        send(
            &mut runtime,
            "bootstrap-diagnose",
            None,
            json!({
                "kind": "diagnoseSearch",
                "termination": "scopeComplete",
                "scope": {},
                "consumed": {},
                "alternatives": [],
                "diagnosticCandidates": []
            })
        )["event"]["code"],
        "invalid_input"
    );

    let (input, catalog) = world();
    let body = raw();
    let mut runtime = Runtime::new();
    runtime.set_search_engine(Box::new(SolverEngine));
    send(
        &mut runtime,
        "init-project",
        None,
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    let project_event = send(
        &mut runtime,
        "activate-project",
        None,
        json!({
            "kind": "activateProject",
            "context": {
                "kind": "project",
                "input": body["input"]["input"].clone(),
                "catalog": body["input"]["catalog"].clone()
            }
        }),
    );
    assert_eq!(project_event["event"]["kind"], "projectActivated");
    let context = project_event["event"]["contextId"]
        .as_str()
        .unwrap()
        .to_owned();
    let native = run(&input, &catalog, SearchTermination::BudgetExhausted);
    let reply = send(
        &mut runtime,
        "diagnose-project",
        Some(&context),
        json!({
            "kind": "diagnoseSearch",
            "termination": "budgetExhausted",
            "scope": native.reproduction.scope,
            "consumed": native.reproduction.consumed,
            "alternatives": [],
            "diagnosticCandidates": []
        }),
    );
    assert_eq!(reply["event"]["kind"], "searchDiagnosed");
    assert_eq!(reply["event"]["reply"]["provesImpossible"], false);
    assert_eq!(reply["event"]["reply"]["budgetSuggestionIsProof"], false);
    assert_eq!(reply["event"]["reply"]["largerBudgetSuggested"], true);
    assert_eq!(
        reply["event"]["reply"]["readModelVersion"],
        READ_MODEL_VERSION
    );
    assert!(reply["event"]["reply"]["reproduction"]["input"].is_object());
    assert!(reply["event"]["reply"]["reproduction"]["catalog"].is_object());
    assert!(reply["event"]["reply"]["reproduction"]["budget"].is_object());
    assert!(reply["event"]["reply"]["reproduction"].get("log").is_none());
}

fn send(runtime: &mut Runtime, request_id: &str, context: Option<&str>, command: Value) -> Value {
    let mut request_meta = json!({
        "protocolVersion": 1,
        "schemaVersion": 1,
        "workerSessionId": "worker-1",
        "projectActivationId": "activation-1",
        "requestId": request_id,
        "projectId": "project-1",
        "editorEpoch": "1",
        "inputRevision": "1",
        "contextId": context
    });
    if command["kind"] == "initialize" {
        request_meta["projectId"] = json!("system");
        request_meta["projectActivationId"] = json!("system");
        request_meta["editorEpoch"] = json!("0");
        request_meta["inputRevision"] = json!("0");
        request_meta["contextId"] = Value::Null;
    }
    serde_json::from_str(
        &runtime.handle_json(&json!({"meta": request_meta, "command": command}).to_string()),
    )
    .unwrap()
}
