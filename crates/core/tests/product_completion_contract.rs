//! SP-012 design contract. These checks do not implement the adopted guide.
//! They lock the current source gap and the hand-checked PC-01–11 oracles.

use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
use zari_core::*;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn oracle(name: &str) -> Value {
    read_json(&root().join("docs/oracles/product-completion").join(name))
}

fn meta(id: &str) -> Value {
    serde_json::json!({
        "protocolVersion": 1,
        "schemaVersion": 1,
        "workerSessionId": "session-a",
        "projectActivationId": "system",
        "requestId": id,
        "projectId": "system",
        "editorEpoch": "0",
        "inputRevision": "0",
        "contextId": null
    })
}

fn send(runtime: &mut Runtime, id: &str, command: Value) -> Value {
    let raw = serde_json::json!({"meta": meta(id), "command": command}).to_string();
    serde_json::from_str(&runtime.handle_json(&raw)).expect("reply json")
}

fn steps(value: &Value) -> &Vec<Value> {
    value["actions"].as_array().expect("actions")
}

fn id_of(step: &Value) -> &str {
    step["id"].as_str().expect("step id")
}

/// Kahn display order: the byte-smallest ready step id.
fn display_order(actions: &[Value]) -> Vec<String> {
    let mut preds: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for step in actions {
        let id = id_of(step).to_owned();
        assert!(!preds.contains_key(&id), "duplicate {id}");
        let listed: Vec<String> = step["prerequisiteStepIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item.as_str().unwrap().to_owned())
            .collect();
        let mut sorted = listed.clone();
        sorted.sort();
        assert_eq!(listed, sorted, "{id} prerequisites are not byte-sorted");
        preds.insert(id, listed);
    }
    for (id, pre) in &preds {
        for item in pre {
            assert!(preds.contains_key(item), "dangling {item} from {id}");
        }
    }
    let mut indegree: BTreeMap<String, usize> = preds.keys().map(|id| (id.clone(), 0)).collect();
    let mut dependents: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (id, pre) in &preds {
        for item in pre {
            *indegree.get_mut(id).unwrap() += 1;
            dependents
                .entry(item.clone())
                .or_default()
                .insert(id.clone());
        }
    }
    let mut ready: BTreeSet<String> = indegree
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(id, _)| id.clone())
        .collect();
    let mut order = Vec::new();
    while let Some(id) = ready.iter().next().cloned() {
        ready.remove(&id);
        order.push(id.clone());
        if let Some(next) = dependents.get(&id) {
            for dependent in next {
                let degree = indegree.get_mut(dependent).unwrap();
                *degree -= 1;
                if *degree == 0 {
                    ready.insert(dependent.clone());
                }
            }
        }
    }
    assert_eq!(order.len(), preds.len(), "cycle in action graph");
    order
}

fn listed_order(value: &Value) -> Vec<String> {
    value["displayOrder"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item.as_str().unwrap().to_owned())
        .collect()
}

fn assert_ordinals_are_numbers(value: &Value) {
    match value {
        Value::Object(map) => {
            if let Some(ordinal) = map.get("unitOrdinal") {
                assert!(ordinal.is_number(), "unitOrdinal must be a number");
            }
            for child in map.values() {
                assert_ordinals_are_numbers(child);
            }
        }
        Value::Array(items) => {
            for item in items {
                assert_ordinals_are_numbers(item);
            }
        }
        _ => {}
    }
}

#[test]
fn current_engine_identity_registers_the_sp013_rule() {
    assert_eq!(BUILD_ID, "zari-domain-7");
    assert_eq!(SCHEMA_VERSION, 1);
    assert_eq!(CANONICAL_VERSION, 1);
    assert_eq!(RULE_VERSION, "zari-domain-v2");
    assert_eq!(SOLVER_VERSION, "zari-solver-v1");

    let mut runtime = Runtime::new();
    let ready = send(
        &mut runtime,
        "init",
        serde_json::json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    assert_eq!(ready["event"]["kind"], "ready");
    assert_eq!(ready["event"]["buildId"], BUILD_ID);
    let capabilities = ready["event"]["capabilities"].as_array().unwrap();
    assert!(capabilities.iter().any(|item| item == "queryNextFacts"));
    let next = capabilities
        .iter()
        .position(|item| item == "queryNextFacts")
        .unwrap();
    assert_eq!(capabilities[next + 1], "queryActionEligibility");
    assert_eq!(capabilities[next + 2], "applyInventoryLedger");
    assert_eq!(capabilities[next + 3], "reviewCatalogImport");
    assert_eq!(capabilities[next + 4], "disposeProject");
    let denied = send(
        &mut runtime,
        "eligibility",
        serde_json::json!({"kind": "queryActionEligibility"}),
    );
    assert_eq!(denied["event"]["kind"], "operationFailed");
    assert_eq!(denied["event"]["code"], "invalid_input");
}

#[test]
fn historical_fixture_keeps_the_pre_sp013_guide_bytes() {
    let finalize = fs::read_to_string(root().join("crates/core/src/finalize.rs")).unwrap();
    assert!(finalize.contains("required_confirmations: vec![]"));
    assert!(
        !finalize
            .contains("prerequisite_step_ids: vec![install_id(container_placement_id.as_str())]")
    );
    let search = fs::read_to_string(root().join("crates/solver/src/search.rs")).unwrap();
    assert!(search.contains("(64 + p * p + 4 * a, Op::RunEval)"));
    assert!(search.contains("evaluate_candidate("));
    let repository =
        fs::read_to_string(root().join("apps/web/src/persistence/repository.ts")).unwrap();
    let session =
        fs::read_to_string(root().join("apps/web/src/features/project/session.ts")).unwrap();
    assert!(repository.contains("confirmation_required"));
    assert!(repository.contains("stale_input"));
    assert!(repository.contains("progressIdentity"));
    assert!(repository.contains("historical_rule"));
    assert!(session.contains("queryActionEligibility"));

    let fixture = read_json(&root().join("fixtures/spatial/spatial-yaw-offset.json"));
    let actions = fixture["input"]["snapshot"]["content"]["actions"]
        .as_array()
        .unwrap();
    let transfer = actions
        .iter()
        .find(|step| step["id"] == "act:transfer:item-a:0")
        .unwrap();
    assert_eq!(transfer["kind"], "transferContents");
    assert_eq!(
        transfer["prerequisiteStepIds"],
        serde_json::json!(["act:install:p-c1"])
    );
    assert_eq!(transfer["requiredConfirmations"], serde_json::json!([]));
    assert_eq!(transfer["reasonIds"], serde_json::json!([]));
    assert_eq!(
        transfer["subjectIds"],
        serde_json::json!(["item-a", "p-c1"])
    );
    assert!(transfer.get("unitOrdinal").is_none());
}

#[test]
fn plan_dag_links_012_through_016() {
    let program = read_json(&root().join(".aiops/program.json"));
    let nodes = program["nodes"].as_array().unwrap();
    let depends = |id: &str| -> Vec<String> {
        nodes
            .iter()
            .find(|node| node["id"] == id)
            .unwrap_or_else(|| panic!("missing node {id}"))["depends_on"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item.as_str().unwrap().to_owned())
            .collect()
    };
    assert_eq!(depends("012"), vec!["011".to_owned()]);
    assert_eq!(depends("013"), vec!["012".to_owned()]);
    assert_eq!(depends("014"), vec!["013".to_owned()]);
    assert_eq!(depends("015"), vec!["014".to_owned()]);
    assert_eq!(
        depends("016"),
        (1..=15).map(|n| format!("{n:03}")).collect::<Vec<_>>()
    );
    assert!(!root().join("fixtures/product-completion").exists());
}

#[test]
fn oracles_cover_every_acceptance_case() {
    let index = oracle("index.json");
    assert_eq!(index["currentBuildId"], "zari-domain-6");
    assert!(index["assertedFutureBuildId"].is_null());
    assert_eq!(index["ruleVersion"], "zari-domain-v1");
    assert_ne!(index["ruleVersion"], RULE_VERSION);
    assert_eq!(index["solverVersion"], SOLVER_VERSION);
    let review = index["reviewChecks"].as_array().unwrap();
    for name in [
        "historyCompatibility",
        "physicalGuideOrder",
        "instanceConservation",
        "budgetCancelSemantics",
    ] {
        assert!(review.iter().any(|item| item == name), "{name}");
    }
    let held = index["heldUntilSeparateAdoption"].as_array().unwrap();
    for name in [
        "schema migration",
        "queryActionEligibility command",
        "BUILD_ID bump",
        "fact confirmation",
    ] {
        assert!(held.iter().any(|item| item == name), "{name}");
    }

    let mut covered = BTreeSet::new();
    for gap in index["gaps"].as_array().unwrap() {
        let owner = gap["owner"].as_str().unwrap();
        assert!(["SP-013", "SP-014", "SP-015"].contains(&owner));
        for id in gap["oracles"].as_array().unwrap() {
            covered.insert(id.as_str().unwrap().to_owned());
        }
    }
    for n in 1..=11 {
        let id = format!("PC-{n:02}");
        assert!(covered.contains(&id), "{id} has no owner");
        let case = oracle(&format!("pc-{n:02}.json"));
        assert_eq!(case["oracleId"], id);
        assert_eq!(case["engineOutput"], false);
        assert!(case["buildId"].is_null());
        assert_eq!(case["checkboxResolvesUnknown"], false);
        assert_eq!(case["checkboxSetsConfirmed"], false);
        assert!(["SP-013", "SP-014", "SP-015"].contains(&case["owner"].as_str().unwrap()));
        let text = serde_json::to_string(&case).unwrap();
        assert!(!text.contains("zari-domain-7"));
        assert_ordinals_are_numbers(&case);
    }

    let matrix = oracle("decoding-matrix.json");
    assert!(matrix["buildId"].is_null());
    let joined = serde_json::to_string(&matrix).unwrap();
    assert!(joined.contains("operation_not_supported"));
    assert!(joined.contains("doneMeansConfirmed"));
    assert_eq!(
        matrix["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["record"] == "actionProgress")
            .unwrap()["doneMeansConfirmed"],
        false
    );

    let accounting = oracle("evaluation-accounting.json");
    assert_eq!(accounting["currentLump"], "64+p^2+4*a");
    assert_eq!(accounting["lumpIsFutureQuantum"], false);
    assert_eq!(accounting["futureProfileRegistered"], false);
    assert_eq!(accounting["publishBeforeRevalidation"], 0);
    assert_eq!(accounting["phases"], oracle("pc-07.json")["phases"]);
    assert_eq!(accounting["quanta"].as_array().unwrap().len(), 7);
}

#[test]
fn pc02_pack_arithmetic_and_new_only_acquire() {
    let case = oracle("pc-02.json");
    assert_eq!(case["handArithmetic"], true);
    let need = case["newUnit"]["physicalNeeded"].as_u64().unwrap();
    let pack = case["newUnit"]["packQuantity"].as_u64().unwrap();
    let packs = need.div_ceil(pack);
    let supplied = packs * pack;
    let surplus = supplied - need;
    assert_eq!(packs, 1);
    assert_eq!(supplied, 2);
    assert_eq!(surplus, 1);
    assert_eq!(case["newUnit"]["packsToOrder"].as_u64().unwrap(), packs);
    assert_eq!(case["newUnit"]["supplied"].as_u64().unwrap(), supplied);
    assert_eq!(case["newUnit"]["surplus"].as_u64().unwrap(), surplus);
    assert_eq!(case["newUnit"]["newUnitsNeeded"].as_u64().unwrap(), need);
    let ordinals: BTreeSet<u64> = case["owned"]["ordinals"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item.as_u64().unwrap())
        .collect();
    assert_eq!(ordinals, BTreeSet::from([0, 1]));
    assert_ne!(case["price"]["checkId"], case["shipping"]["checkId"]);
    assert_eq!(case["price"]["status"], "unknown");
    assert_eq!(case["shipping"]["status"], "unknown");
    assert_eq!(case["priceIsNotShipping"], true);
    let acquire: Vec<_> = steps(&case)
        .iter()
        .filter(|step| step["kind"] == "acquire")
        .collect();
    assert_eq!(acquire.len(), 1);
    assert!(
        steps(&case)
            .iter()
            .filter(|step| step["id"].as_str().unwrap().contains("place-o"))
            .all(|step| step["kind"] == "install"
                && !step["prerequisiteStepIds"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|item| item.as_str().unwrap().contains("acquire")))
    );
    assert_eq!(listed_order(&case), display_order(steps(&case)));
}

#[test]
fn pc03_load_before_rear_first_install() {
    let case = oracle("pc-03.json");
    assert_eq!(case["handArithmetic"], true);
    let front_y = case["geometry"]["front"]["y"].as_i64().unwrap();
    let front_depth = case["geometry"]["front"]["depth"].as_i64().unwrap();
    let rear_y = case["geometry"]["rear"]["y"].as_i64().unwrap();
    assert!(front_y >= 0);
    assert!(
        front_y + front_depth <= rear_y,
        "front must sit in front of rear"
    );
    let actions = steps(&case);
    let by_id = |id: &str| actions.iter().find(|step| id_of(step) == id).unwrap();
    let front = by_id("act:install:bin-front");
    let rear = by_id("act:install:bin-rear");
    assert!(
        front["prerequisiteStepIds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "act:install:bin-rear")
    );
    assert!(
        rear["prerequisiteStepIds"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item != "act:install:bin-front")
    );
    for step in actions
        .iter()
        .filter(|step| step["kind"] == "transferContents")
    {
        let container = step["instanceRefs"][0]["containerPlacementId"]
            .as_str()
            .unwrap();
        let install = by_id(&format!("act:install:{container}"));
        assert!(
            install["prerequisiteStepIds"]
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item == &step["id"])
        );
        assert!(
            step["prerequisiteStepIds"]
                .as_array()
                .unwrap()
                .iter()
                .all(|item| !item.as_str().unwrap().starts_with("act:install:"))
        );
        assert_eq!(step["instanceRefs"][0]["unitOrdinal"], 0);
    }
    assert!(
        actions
            .iter()
            .all(|step| step["kind"] != "acquire" && step["kind"] != "confirmArrival")
    );
    let conservation = &case["conservation"];
    assert_eq!(
        conservation["assigned"].as_u64().unwrap()
            + conservation["unassignedKnown"].as_u64().unwrap(),
        4
    );
    let rejected: BTreeSet<&str> = case["rejected"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["code"].as_str().unwrap())
        .collect();
    assert_eq!(
        rejected,
        BTreeSet::from([
            "cyclic_action_dependencies",
            "duplicate_id",
            "dangling_action_ref"
        ])
    );
    assert_eq!(listed_order(&case), display_order(actions));
}

#[test]
fn pc04_checkbox_does_not_promote_unknown() {
    let case = oracle("pc-04.json");
    assert_eq!(case["promotions"], 0);
    assert_eq!(case["resolveConditionDone"]["setsConfirmed"], false);
    assert_eq!(case["resolveConditionDone"]["changesCheckStatus"], false);
    for blocker in case["blockers"].as_array().unwrap() {
        assert_eq!(blocker["status"], "unknown");
        assert!(blocker["checkId"].as_str().unwrap().starts_with("chk:"));
        assert!(
            blocker["notClearedBy"]
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item == "done")
        );
    }
    let unrelated = case["unrelated"]["doesNotInclude"].as_array().unwrap();
    assert!(unrelated.iter().any(|item| item == "chk:pr:variant-new"));
    assert!(unrelated.iter().any(|item| item == "chk:sh:variant-new"));
}
