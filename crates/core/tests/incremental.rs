//! z-incremental-replan. Pins stay put. An old pass is not copied.

use serde_json::{Value, json};
use zari_core::canonical::CatalogContent;
use zari_core::facts::Fact;
use zari_core::incremental::{
    IncrementalOutcome, IncrementalPins, PinKind, READ_MODEL_VERSION, ReplanAction, replan,
};
use zari_core::plan::{CheckKind, CheckStatus, PlanSnapshot};
use zari_core::scalars::{Id, LengthMm};
use zari_core::strategy::Strategy;
use zari_core::*;
use zari_solver::SolverEngine;

fn raw() -> Value {
    serde_json::from_str(include_str!(
        "../../../fixtures/domain/candidate-bounded-confirmed.json"
    ))
    .unwrap()
}

fn world() -> (ProjectInput, CatalogContent, PlanSnapshot) {
    let raw = raw();
    let body = &raw["input"];
    let input: ProjectInput = serde_json::from_value(body["input"].clone()).unwrap();
    let catalog: CatalogSnapshot = serde_json::from_value(body["catalog"].clone()).unwrap();
    let proposal: CandidateProposal = serde_json::from_value(body["proposal"].clone()).unwrap();
    let catalog = CatalogContent::from(&catalog);
    let snapshot = evaluate_candidate(
        &input,
        &catalog,
        &proposal,
        versions(&input, &catalog),
        scope(&input),
    )
    .snapshot
    .expect("base candidate finalizes");
    (input, catalog, snapshot)
}

fn versions(input: &ProjectInput, catalog: &CatalogContent) -> CompileVersions {
    CompileVersions {
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        input_digest: canonical::input_digest(input),
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(catalog),
        rule_version: canonical::RULE_VERSION.into(),
        solver_version: canonical::solver_version_for(&input.search.profile).into(),
        search_profile: input.search.profile.clone(),
        search_budget: input.search.budget.clone(),
        seed: input.search.seed.clone(),
    }
}

fn scope(input: &ProjectInput) -> SearchScope {
    SearchScope {
        profile: input.search.profile.clone(),
        budget: input.search.budget.clone(),
        group_ids: input.groups.iter().map(|group| group.id.clone()).collect(),
        restrictions: vec![],
    }
}

fn strategy_for(input: &ProjectInput, strategy: &Strategy) -> StrategyDecision {
    SolverEngine
        .propose_strategies(input)
        .into_iter()
        .find(|decision| &decision.strategy == strategy)
        .expect("strategy")
}

fn pins(placement: &str, strategy: bool) -> IncrementalPins {
    IncrementalPins {
        placement_ids: vec![Id::new(placement).unwrap()],
        item_ids: vec![],
        strategy,
    }
}

fn run(
    base: &PlanSnapshot,
    input: &ProjectInput,
    catalog: &CatalogContent,
    pins: &IncrementalPins,
) -> zari_core::incremental::IncrementalReply {
    let wanted = if pins.strategy {
        base.content.strategy.strategy.clone()
    } else {
        input.strategy_choice.clone()
    };
    let strategy = strategy_for(input, &wanted);
    replan(&ReplanAction {
        base,
        input,
        catalog,
        pins,
        strategy: &strategy,
    })
    .expect("replan")
}

fn widen(input: &mut ProjectInput, item_id: &str, nominal: u32) {
    let item = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == item_id)
        .unwrap();
    if let Fact::Known { value, .. } = &mut item.dimensions.envelope.width {
        value.nominal = LengthMm::new(nominal).unwrap();
    } else {
        panic!("width is known");
    }
}

fn placement<'a>(snapshot: &'a PlanSnapshot, id: &str) -> &'a Placement {
    snapshot
        .content
        .placements
        .iter()
        .find(|placement| placement.id.as_str() == id)
        .unwrap()
}

#[test]
fn pinned_placement_keeps_its_coordinates() {
    let (input, catalog, base) = world();
    let before = placement(&base, "p-a0").clone();
    let reply = run(&base, &input, &catalog, &pins("p-a0", false));
    assert_eq!(reply.read_model_version, READ_MODEL_VERSION);
    assert!(!reply.reused_pass);
    assert!(reply.diff.moved_placement_ids.is_empty());
    assert!(reply.diff.added_placement_ids.is_empty());
    let kept = reply
        .diff
        .kept
        .iter()
        .find(|row| row.id.as_str() == "p-a0")
        .unwrap();
    assert_eq!(kept.x, i64::from(before.position.x.get()));
    assert_eq!(kept.y, i64::from(before.position.y.get()));
    assert_eq!(kept.z, i64::from(before.position.z.get()));
    match reply.outcome {
        IncrementalOutcome::Published { snapshot } => {
            assert_eq!(placement(&snapshot, "p-a0"), &before);
            assert_ne!(snapshot.plan_snapshot_id, base.plan_snapshot_id);
        }
        IncrementalOutcome::Blocked {} => panic!("unchanged input should publish"),
    }
}

#[test]
fn a_new_dimension_does_not_reuse_the_old_pass() {
    let (mut input, catalog, base) = world();
    let old = base
        .content
        .validation
        .checks
        .iter()
        .find(|check| {
            check.kind == CheckKind::OuterGeometry
                && check.status == CheckStatus::Pass
                && check.subject_ids.iter().any(|id| id.as_str() == "p-a0")
        })
        .expect("old pass")
        .clone();
    widen(&mut input, "item-a", 9_000);
    let before = placement(&base, "p-a0").clone();
    let reply = run(&base, &input, &catalog, &pins("p-a0", true));
    assert!(
        reply
            .impact
            .dimension_changed_item_ids
            .iter()
            .any(|id| id.as_str() == "item-a")
    );
    assert!(
        reply.verification_scope.iter().any(
            |row| row.subject_id.as_str() == "item-a" && row.reason_code == "dimension_changed"
        )
    );
    assert!(!reply.reused_pass);
    assert!(reply.diff.moved_placement_ids.is_empty());
    let kept = reply
        .diff
        .kept
        .iter()
        .find(|row| row.id.as_str() == "p-a0")
        .unwrap();
    assert_eq!(kept.x, i64::from(before.position.x.get()));
    assert!(matches!(reply.outcome, IncrementalOutcome::Blocked {}));
    assert!(reply.diff.next_snapshot_id.is_none());
    let fresh = reply
        .fresh_checks
        .iter()
        .find(|check| check.id == old.id)
        .expect("fresh outer check");
    assert_ne!(fresh.status, CheckStatus::Pass);
    assert_ne!(fresh, &old);
    assert!(
        reply
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "pin_blocks")
    );
    assert!(reply.releasable.iter().any(|pin| {
        pin.kind == PinKind::Placement
            && pin.id.as_ref().is_some_and(|id| id.as_str() == "p-a0")
            && pin.sufficient_alone
    }));
}

#[test]
fn an_unknown_dimension_does_not_stay_pass() {
    let (mut input, catalog, base) = world();
    let item = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == "item-a")
        .unwrap();
    item.dimensions.envelope.width = Fact::unknown();
    let reply = run(&base, &input, &catalog, &pins("p-a0", false));
    assert!(!reply.reused_pass);
    assert!(reply.diff.moved_placement_ids.is_empty());
    let fresh = reply.fresh_checks.iter().find(|check| {
        check.kind == CheckKind::OuterGeometry
            && check.subject_ids.iter().any(|id| id.as_str() == "p-a0")
    });
    let fresh = fresh.expect("outer check");
    assert_ne!(fresh.status, CheckStatus::Pass);
}

#[test]
fn a_pinned_strategy_is_not_changed_quietly() {
    let (mut input, catalog, base) = world();
    input.strategy_choice = Strategy::OneActionAccess;
    let reply = run(&base, &input, &catalog, &pins("p-a0", true));
    assert!(reply.impact.strategy_changed);
    assert!(matches!(reply.outcome, IncrementalOutcome::Blocked {}));
    assert!(reply.diff.next_snapshot_id.is_none());
    assert!(
        reply
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "strategy_pinned")
    );
    assert!(
        reply
            .releasable
            .iter()
            .any(|pin| pin.kind == PinKind::Strategy && pin.sufficient_alone)
    );
    assert!(reply.diff.moved_placement_ids.is_empty());
}

#[test]
fn a_new_item_stays_unassigned_while_the_pin_stays() {
    let (mut input, catalog, base) = world();
    let mut added = input
        .items
        .iter()
        .find(|item| item.id.as_str() == "item-b")
        .unwrap()
        .clone();
    added.id = Id::new("item-c").unwrap();
    added.label = "Added".into();
    input.items.push(added);
    input
        .groups
        .iter_mut()
        .find(|group| group.id.as_str() == "group-1")
        .unwrap()
        .item_ids
        .push(Id::new("item-c").unwrap());
    let before = placement(&base, "p-b0").clone();
    let reply = run(&base, &input, &catalog, &pins("p-b0", false));
    assert!(
        reply
            .impact
            .added_item_ids
            .iter()
            .any(|id| id.as_str() == "item-c")
    );
    assert!(
        reply
            .diff
            .unassigned_item_ids
            .iter()
            .any(|id| id.as_str() == "item-c")
    );
    assert!(reply.diff.moved_placement_ids.is_empty());
    assert_eq!(
        reply
            .diff
            .kept
            .iter()
            .find(|row| row.id.as_str() == "p-b0")
            .unwrap()
            .x,
        i64::from(before.position.x.get())
    );
    if let IncrementalOutcome::Published { snapshot } = &reply.outcome {
        assert_eq!(placement(snapshot, "p-b0"), &before);
        assert!(
            snapshot
                .content
                .assignments
                .iter()
                .all(|row| row.item_id.as_str() != "item-c")
        );
    }
}

#[test]
fn unknown_and_duplicate_pins_fail() {
    let (input, catalog, base) = world();
    let strategy = strategy_for(&input, &input.strategy_choice);
    let unknown = IncrementalPins {
        placement_ids: vec![Id::new("missing").unwrap()],
        item_ids: vec![],
        strategy: false,
    };
    assert_eq!(
        replan(&ReplanAction {
            base: &base,
            input: &input,
            catalog: &catalog,
            pins: &unknown,
            strategy: &strategy,
        })
        .unwrap_err()
        .code,
        "unknown_pin"
    );
    let duplicate = IncrementalPins {
        placement_ids: vec![Id::new("p-a0").unwrap(), Id::new("p-a0").unwrap()],
        item_ids: vec![],
        strategy: false,
    };
    assert_eq!(
        replan(&ReplanAction {
            base: &base,
            input: &input,
            catalog: &catalog,
            pins: &duplicate,
            strategy: &strategy,
        })
        .unwrap_err()
        .code,
        "duplicate_pin"
    );
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
fn command_keeps_the_pin_and_does_not_adopt() {
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
            "replan",
            None,
            json!({"kind": "replanIncremental"})
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
    assert_eq!(names[names.len() - 3].as_str(), Some("comparePareto"));
    assert_eq!(
        send(
            &mut runtime,
            "extra",
            None,
            json!({"kind": "replanIncremental", "baseSnapshot": {}, "pins": {}, "extra": true})
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
            "bootstrap-replan",
            None,
            json!({
                "kind": "replanIncremental",
                "baseSnapshot": {},
                "pins": {"placementIds": [], "itemIds": [], "strategy": false}
            })
        )["event"]["code"],
        "invalid_input"
    );

    let (input, _catalog, base) = world();
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
    let native = run(
        &base,
        &input,
        &CatalogContent::from(
            &serde_json::from_value::<CatalogSnapshot>(body["input"]["catalog"].clone()).unwrap(),
        ),
        &pins("p-a0", false),
    );
    let reply = send(
        &mut runtime,
        "replan-project",
        Some(&context),
        json!({
            "kind": "replanIncremental",
            "baseSnapshot": base,
            "pins": {"placementIds": ["p-a0"], "itemIds": [], "strategy": false}
        }),
    );
    assert_eq!(reply["event"]["kind"], "incrementalReplanned");
    assert_eq!(reply["event"]["reply"]["reusedPass"], false);
    assert_eq!(
        reply["event"]["reply"]["diff"]["movedPlacementIds"],
        json!([])
    );
    assert_eq!(
        reply["event"]["reply"]["previousSnapshotId"],
        base.plan_snapshot_id.as_str()
    );
    assert_eq!(
        reply["event"]["reply"]["outcome"]["kind"],
        match native.outcome {
            IncrementalOutcome::Published { .. } => "published",
            IncrementalOutcome::Blocked {} => "blocked",
        }
    );
    if let IncrementalOutcome::Published { snapshot } = native.outcome {
        assert_eq!(
            reply["event"]["reply"]["outcome"]["snapshot"]["planSnapshotId"],
            snapshot.plan_snapshot_id.as_str()
        );
    }
}
