//! z-product-contract. Locks the extension ledger and the existing snapshot chain.
//! It does not add a command, a migration, or a new domain type.

use serde_json::{Value, json};
use std::{fs, path::PathBuf};
use zari_core::{
    BUILD_ID, CANONICAL_VERSION, CatalogSourceKind, CheckStatus, DomainFixture, PlanSnapshot,
    RULE_VERSION, Runtime, SCHEMA_VERSION, SOLVER_VERSION, SOLVER_VERSION_V2, SpatialSourceStamp,
    SpatialViewSource, StoragePrimitive, Strategy, execute_domain_fixture_with, input_digest,
    project_spatial_view, snapshot_digest,
};
use zari_solver::SolverEngine;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(name: &str) -> Value {
    let path = root().join(name);
    serde_json::from_str(&fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn contract() -> Value {
    read_json("docs/product-expansion/contract.json")
}

fn meta(id: &str) -> Value {
    json!({
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
    let raw = json!({"meta": meta(id), "command": command}).to_string();
    serde_json::from_str(&runtime.handle_json(&raw)).expect("reply json")
}

fn assert_unknown_has_no_value(value: &Value) {
    match value {
        Value::Object(map) => {
            if map.get("state").and_then(Value::as_str) == Some("unknown") {
                assert!(map.get("value").is_none(), "unknown fact carries a value");
            }
            for child in map.values() {
                assert_unknown_has_no_value(child);
            }
        }
        Value::Array(items) => {
            for item in items {
                assert_unknown_has_no_value(item);
            }
        }
        _ => {}
    }
}

#[test]
fn ledger_matches_the_running_engine_and_does_not_relabel() {
    let contract = contract();
    assert_eq!(contract["contract"], "zari-z-product-contract-1");
    assert_eq!(contract["contractChange"], "NO");
    assert_eq!(contract["engineOutput"], false);
    assert_eq!(contract["relabelsExistingIds"], false);
    assert_eq!(contract["fixtureBytesChanged"], false);
    assert!(contract["assertedFutureBuildId"].is_null());
    assert_eq!(BUILD_ID, contract["versions"]["buildId"].as_str().unwrap());
    assert_eq!(
        RULE_VERSION,
        contract["versions"]["ruleVersion"].as_str().unwrap()
    );
    assert_eq!(
        SOLVER_VERSION,
        contract["versions"]["solverVersionProfile1"]
            .as_str()
            .unwrap()
    );
    assert_eq!(
        SOLVER_VERSION_V2,
        contract["versions"]["solverVersionProfile2"]
            .as_str()
            .unwrap()
    );
    assert_eq!(SCHEMA_VERSION, 1);
    assert_eq!(CANONICAL_VERSION, 1);
    assert_eq!(contract["versions"]["schemaVersion"], SCHEMA_VERSION);
    assert_eq!(contract["versions"]["canonicalVersion"], CANONICAL_VERSION);
    assert_eq!(contract["versions"]["dbVersion"], 2);
    assert_eq!(contract["versions"]["exportVersion"], 1);

    let stage_source = contract["stageSource"].as_str().unwrap();
    assert!(stage_source.ends_with("denominator.json"));
    let denominator = read_json(stage_source);
    let stages = contract["stages"].as_array().unwrap();
    let nodes = denominator["nodes"].as_array().unwrap();
    assert_eq!(stages.len(), 16);
    assert_eq!(nodes.len(), 16);
    assert_eq!(denominator["denominator"], 16);
    for (index, stage) in stages.iter().enumerate() {
        let id = format!("{:03}", index + 1);
        let node = &nodes[index];
        assert_eq!(stage["id"], id);
        assert_eq!(node["id"], id);
        assert_eq!(stage["title"], node["title"]);
        assert_eq!(stage["group"], node["group"]);
        assert_eq!(stage["evidence"], node["deliveryEvidence"]);
        assert_eq!(stage["expansionOwns"], false);
        let evidence = root().join(stage["evidence"].as_str().unwrap());
        let heading = fs::read_to_string(&evidence)
            .unwrap_or_else(|e| panic!("{evidence:?}: {e}"))
            .lines()
            .next()
            .unwrap()
            .to_owned();
        assert_eq!(heading, format!("# ZARI-SPATIAL-{id} evidence"));
    }

    let user: Vec<_> = contract["userDecisions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_str().unwrap().to_owned())
        .collect();
    let internal: Vec<_> = contract["internalChoices"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_str().unwrap().to_owned())
        .collect();
    for decision in contract["userDecisions"].as_array().unwrap() {
        assert_eq!(decision["status"], "open");
        assert_eq!(decision["owner"], "user");
    }
    for choice in contract["internalChoices"].as_array().unwrap() {
        assert_eq!(choice["status"], "adopted");
        assert_ne!(choice["owner"], "user");
    }
    for id in &user {
        assert!(
            !internal.contains(id),
            "{id} is both a user decision and an internal choice"
        );
    }
    for id in ["account", "checkout", "cloud", "release", "photo-consent"] {
        assert!(user.iter().any(|item| item == id), "{id}");
    }
    for id in [
        "keep-sixteen-ids",
        "same-snapshot-chain",
        "unknown-stays-unknown",
    ] {
        assert!(internal.iter().any(|item| item == id), "{id}");
    }

    let mut runtime = Runtime::new();
    let ready = send(
        &mut runtime,
        "init",
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    assert_eq!(ready["event"]["kind"], "ready");
    assert_eq!(ready["event"]["buildId"], BUILD_ID);
    assert_eq!(ready["event"]["ruleVersion"], RULE_VERSION);
    assert_eq!(ready["event"]["solverVersion"], SOLVER_VERSION_V2);
    assert_eq!(ready["event"]["capabilities"], contract["baseCapabilities"]);
}

#[test]
fn support_scope_enums_stay_closed() {
    match CatalogSourceKind::Synthetic {
        CatalogSourceKind::Synthetic | CatalogSourceKind::Imported => {}
    }
    match Strategy::MinimumPurchase {
        Strategy::MinimumPurchase
        | Strategy::FrequencySeparation
        | Strategy::ActivityGrouping
        | Strategy::ActiveReserveSeparation
        | Strategy::OneActionAccess => {}
    }
    match StoragePrimitive::OpenBin {
        StoragePrimitive::DirectPlacement
        | StoragePrimitive::OpenBin
        | StoragePrimitive::Tray
        | StoragePrimitive::VerticalFile => {}
    }
}

#[test]
fn sentinels_keep_unknown_and_historical_bytes() {
    let quantity = read_json("fixtures/domain/project-unknown-quantity-pass.json");
    let item = &quantity["input"]["items"][0]["quantity"];
    assert_eq!(item["state"], "unknown");
    assert_eq!(item["reason"], "notMeasured");
    assert!(item.get("value").is_none());

    let pack = read_json("fixtures/bootstrap/unknown-pack.json");
    assert!(pack["expected"]["packsToOrder"].is_null());
    assert!(pack["expected"]["suppliedUnits"].is_null());
    assert!(pack["expected"]["surplusUnits"].is_null());

    let yaw = read_json("fixtures/spatial/spatial-yaw-offset.json");
    let transfer = yaw["input"]["snapshot"]["content"]["actions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| step["id"] == "act:transfer:item-a:0")
        .unwrap();
    assert_eq!(transfer["prerequisiteStepIds"], json!(["act:install:p-c1"]));
    assert_eq!(transfer["requiredConfirmations"], json!([]));
    assert_eq!(transfer["reasonIds"], json!([]));

    let oracle = read_json("docs/oracles/product-completion/index.json");
    assert_eq!(oracle["currentBuildId"], "zari-domain-6");
    assert!(oracle["assertedFutureBuildId"].is_null());

    let manifest = read_json("fixtures/manifest.json");
    let entries = manifest["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 124);
    let impact = contract()["fixtureImpact"].as_array().unwrap().clone();
    let mut covered = 0;
    for row in &impact {
        let kind = row["caseKind"].as_str().unwrap();
        let count = entries
            .iter()
            .filter(|entry| entry["caseKind"] == kind)
            .count();
        assert_eq!(count as u64, row["count"].as_u64().unwrap(), "{kind}");
        assert_eq!(row["bytesChangedByThisNode"], false);
        covered += count;
    }
    assert_eq!(covered, 124);
}

#[test]
fn search_scope_complete_publishes_one_snapshot_chain() {
    let path = root().join("fixtures/domain/search-scope-complete.json");
    let fixture: DomainFixture = serde_json::from_str(
        &fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")),
    )
    .unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let mut runtime = Runtime::new();
    runtime.set_search_engine(Box::new(SolverEngine));
    let event = execute_domain_fixture_with(&fixture, &mut runtime).expect("search fixture");
    assert_eq!(event["kind"], "searchCompleted");
    let alternatives = event["result"]["alternatives"].as_array().unwrap();
    assert_eq!(alternatives.len(), 3);
    for alternative in alternatives {
        let snapshot: PlanSnapshot = serde_json::from_value(alternative.clone()).unwrap();
        assert_eq!(
            snapshot_digest(&snapshot.content),
            snapshot.plan_snapshot_id
        );
        assert_eq!(
            input_digest(&snapshot.content.input_facts),
            snapshot.content.versions.input_digest
        );
        assert_eq!(snapshot.content.versions.rule_version, RULE_VERSION);
        assert_eq!(snapshot.content.versions.schema_version, SCHEMA_VERSION);
        assert!(alternative["content"]["bom"].is_array());
        assert!(alternative["content"]["actions"].is_array());
        assert!(alternative["content"]["placements"].is_array());
        assert_eq!(
            alternative["planSnapshotId"],
            serde_json::to_value(&snapshot.plan_snapshot_id).unwrap()
        );
        assert_unknown_has_no_value(alternative);
        for check in &snapshot.content.validation.checks {
            if check.status == CheckStatus::Unknown {
                assert_eq!(
                    serde_json::to_value(&check.status).unwrap(),
                    json!("unknown")
                );
            }
        }
        let projection = match project_spatial_view(&SpatialViewSource::Plan {
            snapshot: snapshot.clone(),
        }) {
            Ok(projection) => projection,
            Err(failure) => panic!(
                "plan projection {}: {}",
                failure.code,
                failure.affected_fields.join(",")
            ),
        };
        match projection.source {
            SpatialSourceStamp::Plan {
                plan_snapshot_id,
                input_digest: stamped,
                ..
            } => {
                assert_eq!(plan_snapshot_id, snapshot.plan_snapshot_id);
                assert_eq!(stamped, snapshot.content.versions.input_digest);
            }
            SpatialSourceStamp::Input { .. } => panic!("drawing stamp is not the plan snapshot"),
        }
    }
}
