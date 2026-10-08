//! z-strategy-library. The catalogue is a read model beside the snapshot.

use serde_json::{Value, json};
use zari_core::facts::{Fact, UnknownReason};
use zari_core::input::RetrievalMode;
use zari_core::scalars::Quantity;
use zari_core::strategy_library::{LIBRARY_VERSION, LibraryQuantity};
use zari_core::*;
use zari_solver::SolverEngine;

fn fixture_value() -> Value {
    serde_json::from_str(include_str!(
        "../../../fixtures/domain/candidate-bounded-confirmed.json"
    ))
    .unwrap()
}

fn load() -> ProjectInput {
    serde_json::from_value(fixture_value()["input"]["input"].clone()).unwrap()
}

fn evaluate(input: &ProjectInput) -> Value {
    let reply = SolverEngine.evaluate_strategy_library(input);
    serde_json::to_value(reply).unwrap()
}

fn meta(id: &str, context: Option<&str>) -> Value {
    json!({
        "protocolVersion": 1,
        "schemaVersion": 1,
        "workerSessionId": "session-a",
        "projectActivationId": "activation-a",
        "requestId": id,
        "projectId": "project-a",
        "editorEpoch": "0",
        "inputRevision": "1",
        "contextId": context
    })
}

fn send(runtime: &mut Runtime, id: &str, context: Option<&str>, command: Value) -> Value {
    let mut request_meta = meta(id, context);
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

#[test]
fn wording_only_alternative_is_removed() {
    let input = load();
    let reply = evaluate(&input);
    assert_eq!(reply["libraryVersion"], LIBRARY_VERSION);
    assert_eq!(reply["droppedWordingDuplicates"], 1);
    let alternatives = reply["alternatives"].as_array().unwrap();
    assert_eq!(
        alternatives
            .iter()
            .filter(|row| row["strategy"] == "minimumPurchase")
            .count(),
        1
    );
    let minimum = alternatives
        .iter()
        .find(|row| row["strategy"] == "minimumPurchase")
        .unwrap();
    let keys = minimum["messageKeys"].as_array().unwrap();
    assert!(keys.iter().any(|key| key == "reason.min_purchase.group"));
    assert!(
        keys.iter()
            .all(|key| key != "reason.min_purchase.wording_only")
    );
    assert_eq!(reply["recipes"].as_array().unwrap().len(), 5);
    assert_eq!(
        reply["recipes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|recipe| recipe["selected"] == true)
            .count(),
        1
    );
}

#[test]
fn pinned_strategy_is_not_rewritten() {
    let mut input = load();
    input.strategy_choice = Strategy::ActivityGrouping;
    let before = input.clone();
    let reply = SolverEngine.evaluate_strategy_library(&input);
    assert_eq!(input, before);
    assert_eq!(reply.pinned_strategy, Strategy::ActivityGrouping);
    assert!(!reply.strategy_changed);
    assert_eq!(
        reply
            .recipes
            .iter()
            .find(|recipe| recipe.selected)
            .map(|recipe| recipe.strategy.clone()),
        Some(Strategy::ActivityGrouping)
    );
    assert!(
        reply
            .alternatives
            .iter()
            .any(|row| row.strategy == Strategy::ActivityGrouping)
    );
    assert_eq!(reply.library_version, LIBRARY_VERSION);
    for recipe in &reply.recipes {
        assert_eq!(recipe.version, 1);
        assert!(!recipe.primitives.is_empty());
        assert!(!recipe.access_code.is_empty());
        assert!(!recipe.retrievals.is_empty());
    }
    let one = reply
        .recipes
        .iter()
        .find(|recipe| recipe.strategy == Strategy::OneActionAccess)
        .unwrap();
    assert_eq!(one.primitives, vec![StoragePrimitive::DirectPlacement]);
    assert_eq!(one.retrievals, vec![RetrievalMode::DirectFrontExtraction]);
    assert_eq!(one.access_code, "zero_other_container_moves");
}

#[test]
fn unplaceable_items_keep_their_quantities() {
    let mut input = load();
    assert!(input.items.len() >= 2);
    let provenance = match &input.items[0].quantity {
        Fact::Known { provenance, .. } => provenance.clone(),
        _ => panic!("fixture quantity should be known"),
    };
    input.items[0].quantity = Fact::Known {
        value: Quantity::new(2).unwrap(),
        provenance: provenance.clone(),
    };
    input.items[1].quantity = Fact::Known {
        value: Quantity::new(3).unwrap(),
        provenance,
    };
    input.space.interior.width = Fact::unknown();
    input.space.interior.depth = Fact::unknown();
    input.space.interior.height = Fact::unknown();
    let before = input.clone();
    let reply = SolverEngine.evaluate_strategy_library(&input);
    assert_eq!(input, before);
    assert!(reply.candidate_item_ids.is_empty());
    assert_eq!(reply.unassigned.len(), input.items.len());
    let mut total = 0u32;
    for row in &reply.unassigned {
        assert_eq!(row.reason_code, "no_resolvable_zone");
        let item = input
            .items
            .iter()
            .find(|item| item.id == row.item_id)
            .unwrap();
        match (&item.quantity, &row.quantity) {
            (Fact::Known { value, .. }, LibraryQuantity::Known { count }) => {
                assert_eq!(value.get(), *count);
                assert_ne!(*count, 0);
                total += *count;
            }
            other => panic!("quantity changed: {other:?}"),
        }
    }
    assert_eq!(
        total,
        2 + 3
            + input
                .items
                .iter()
                .skip(2)
                .map(|item| { item.quantity.value().map(|value| value.get()).unwrap_or(0) })
                .sum::<u32>()
    );
    let counts: Vec<u32> = reply
        .unassigned
        .iter()
        .filter_map(|row| match row.quantity {
            LibraryQuantity::Known { count } => Some(count),
            _ => None,
        })
        .collect();
    assert!(counts.contains(&2));
    assert!(counts.contains(&3));
    assert!(!counts.contains(&(2 + 3)));
}

#[test]
fn unknown_quantity_is_not_zero_and_pull_only_stays_unassigned() {
    let mut input = load();
    input.strategy_choice = Strategy::OneActionAccess;
    input.items[0].quantity = Fact::Unknown {
        reason: UnknownReason::NotMeasured,
    };
    input.items[0].requirement.allowed_retrieval_modes = vec![RetrievalMode::DirectFrontExtraction];
    for item in input.items.iter_mut().skip(1) {
        item.requirement.allowed_retrieval_modes = vec![RetrievalMode::PullContainerThenRetrieve];
    }
    let reply = SolverEngine.evaluate_strategy_library(&input);
    let unknown = reply
        .unassigned
        .iter()
        .find(|row| row.item_id == input.items[0].id)
        .expect("unknown quantity stays listed");
    assert_eq!(unknown.reason_code, "quantity_unknown");
    match &unknown.quantity {
        LibraryQuantity::Unknown { reason } => assert_eq!(*reason, UnknownReason::NotMeasured),
        LibraryQuantity::Known { count } => panic!("unknown became {count}"),
        other => panic!("unexpected {other:?}"),
    }
    let json = serde_json::to_value(&unknown.quantity).unwrap();
    assert!(json.get("count").is_none());
    assert_ne!(json["state"], "known");
    for item in input.items.iter().skip(1) {
        let row = reply
            .unassigned
            .iter()
            .find(|row| row.item_id == item.id)
            .expect("pull-only item stays unassigned");
        assert_eq!(row.reason_code, "retrieval_unsupported");
        match (&item.quantity, &row.quantity) {
            (Fact::Known { value, .. }, LibraryQuantity::Known { count }) => {
                assert_eq!(value.get(), *count);
            }
            other => panic!("quantity dropped: {other:?}"),
        }
        assert!(!reply.candidate_item_ids.contains(&item.id));
    }
}

#[test]
fn hard_constraints_stay_separate_from_visual_preferences() {
    let mut input = load();
    input.constraints.purchase_allowed = false;
    input.preferences.color = Some("blue".into());
    input.preferences.material = Some("oak".into());
    input.preferences.visual_notes = vec!["warm".into()];
    let without_color = {
        let mut plain = input.clone();
        plain.preferences.color = None;
        plain.preferences.material = None;
        plain.preferences.visual_notes.clear();
        SolverEngine.evaluate_strategy_library(&plain)
    };
    let reply = SolverEngine.evaluate_strategy_library(&input);
    assert!(
        reply
            .hard_constraints
            .iter()
            .any(|row| row.code == "purchase_prohibited")
    );
    assert!(
        reply
            .visual_preferences
            .iter()
            .all(|row| row.code != "purchase_prohibited")
    );
    for code in ["color", "material", "visual_note"] {
        assert!(
            reply.visual_preferences.iter().any(|row| row.code == code),
            "{code}"
        );
        assert!(
            reply.hard_constraints.iter().all(|row| row.code != code),
            "{code}"
        );
    }
    assert_eq!(without_color.unassigned, reply.unassigned);
    assert_eq!(without_color.candidate_item_ids, reply.candidate_item_ids);
    assert!(
        reply
            .visual_preferences
            .iter()
            .any(|row| row.code == "objective_rank")
    );
    assert!(
        reply
            .hard_constraints
            .iter()
            .all(|row| row.code != "objective_rank" && row.code != "soft_budget_known")
    );
}

#[test]
fn command_sits_with_search_and_does_not_publish() {
    let mut bare = Runtime::new();
    assert_eq!(
        send(
            &mut bare,
            "init",
            None,
            json!({
                "kind": "initialize",
                "buildId": BUILD_ID,
                "expectedProtocolVersion": 1,
                "expectedSchemaVersion": 1
            })
        )["event"]["kind"],
        "ready"
    );
    assert_eq!(
        send(
            &mut bare,
            "library",
            None,
            json!({"kind": "evaluateStrategyLibrary"})
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
    let propose = names
        .iter()
        .position(|name| name == "proposeStrategies")
        .unwrap();
    assert_eq!(names[propose + 1], "evaluateStrategyLibrary");
    assert_eq!(
        send(
            &mut runtime,
            "extra",
            None,
            json!({"kind": "evaluateStrategyLibrary", "extra": true})
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
            "bootstrap-library",
            None,
            json!({"kind": "evaluateStrategyLibrary"})
        )["event"]["code"],
        "invalid_state"
    );

    let raw = fixture_value();
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
    let project = send(
        &mut runtime,
        "activate-project",
        None,
        json!({
            "kind": "activateProject",
            "context": {
                "kind": "project",
                "input": raw["input"]["input"].clone(),
                "catalog": raw["input"]["catalog"].clone()
            }
        }),
    );
    assert_eq!(project["event"]["kind"], "projectActivated");
    let context = project["event"]["contextId"].as_str().unwrap().to_owned();
    let reply = send(
        &mut runtime,
        "library-project",
        Some(&context),
        json!({"kind": "evaluateStrategyLibrary"}),
    );
    assert_eq!(reply["event"]["kind"], "strategyLibraryEvaluated");
    assert_eq!(reply["event"]["reply"]["strategyChanged"], false);
    assert_eq!(reply["event"]["reply"]["droppedWordingDuplicates"], 1);
    assert!(reply["event"].get("snapshot").is_none());
}
