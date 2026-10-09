//! z-pareto-comparison. The front is a read model beside the snapshot.

use serde_json::{Value, json};
use zari_core::facts::{Fact, MeasurementOrigin, Provenance, VerificationStatus};
use zari_core::pareto::{
    ParetoCompareAction, ParetoCount, ParetoMoney, READ_MODEL_VERSION, compare,
};
use zari_core::plan::{
    AssignmentCompleteness, BOMLine, CheckBasis, CheckKind, CheckMeasurement, CheckStatus,
    ConstraintCheck, PhysicalAssurance, SearchTermination, Unassigned, UnassignedInstances,
};
use zari_core::scalars::*;
use zari_core::strategy::Strategy;
use zari_core::*;
use zari_solver::SolverEngine;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../fixtures/domain/candidate-bounded-confirmed.json"
    ))
    .unwrap()
}

fn shell() -> PlanSnapshot {
    let raw: Value = serde_json::from_str(include_str!(
        "../../../fixtures/domain/record-snapshot-verified.json"
    ))
    .unwrap();
    serde_json::from_value(raw["input"]["snapshot"].clone()).unwrap()
}

fn project() -> ProjectInput {
    serde_json::from_value(fixture()["input"]["input"].clone()).unwrap()
}

fn provenance() -> Provenance {
    Provenance {
        origin: MeasurementOrigin::Synthetic,
        verification: VerificationStatus::Unverified,
        evidence_ids: vec![],
        rule_ids: vec![],
        input_refs: vec![],
        observed_at: None,
    }
}

fn known_money(amount: u64) -> Fact<MoneyKrw> {
    Fact::Known {
        value: MoneyKrw::new(amount).unwrap(),
        provenance: provenance(),
    }
}

fn known_rev(amount: u64) -> Fact<Revision> {
    Fact::Known {
        value: Revision::new(amount).unwrap(),
        provenance: provenance(),
    }
}

fn bom_line(id: &str, reused: u32) -> BOMLine {
    BOMLine {
        id: Id::new(id).unwrap(),
        variant_id: None,
        owned_id: Some(Id::new("owned-1").unwrap()),
        placement_ids: vec![],
        offer_id: None,
        physical_needed: Quantity::new(1).unwrap(),
        reused: Quantity::new(reused).unwrap(),
        new_units_needed: Quantity::new(0).unwrap(),
        pack_quantity: Fact::NotApplicable {
            reason_code: "owned".into(),
        },
        packs_to_order: Fact::NotApplicable {
            reason_code: "owned".into(),
        },
        supplied: Fact::NotApplicable {
            reason_code: "owned".into(),
        },
        surplus: Fact::NotApplicable {
            reason_code: "owned".into(),
        },
        product_subtotal: Fact::NotApplicable {
            reason_code: "owned".into(),
        },
        evidence_refs: vec![],
    }
}

fn measurement(blockers: u64) -> CheckMeasurement {
    CheckMeasurement {
        field_path: "blockerCount".into(),
        value_mm: known_rev(blockers),
    }
}

fn check(
    id: &str,
    kind: CheckKind,
    status: CheckStatus,
    blocking: bool,
    reason: &str,
    measurements: Vec<CheckMeasurement>,
) -> ConstraintCheck {
    ConstraintCheck {
        id: Id::new(id).unwrap(),
        kind,
        subject_ids: vec![],
        status,
        reason_code: reason.into(),
        basis: CheckBasis::NonGeometric,
        evidence_refs: vec![],
        measurements,
        blocking,
        remediation: vec![],
    }
}

#[derive(Clone, Copy)]
enum CostPaint {
    Known(u64),
    Unknown,
    NoPurchase,
}

#[derive(Clone, Copy)]
enum MovePaint {
    Known(u64),
    /// Status unknown. A stored blocker count must not become the axis.
    Unknown {
        stored: u64,
    },
    /// Pass with no blocker measurement. That is not zero moves.
    Missing,
}

struct Paint {
    n: u128,
    cost: CostPaint,
    reuse: u32,
    moves: MovePaint,
    unassigned: u32,
    unknown_qty: u32,
    hard: bool,
    extra_unknown: bool,
}

fn paint(spec: Paint) -> PlanSnapshot {
    let input = project();
    let mut snap = shell();
    snap.plan_snapshot_id = Digest::new(&format!("{:064x}", spec.n)).unwrap();
    snap.content.versions.input_digest = canonical::input_digest(&input);
    snap.content.versions.search_budget = input.search.budget.clone();
    snap.content.versions.seed = input.search.seed.clone();
    snap.content.strategy.strategy = input.strategy_choice.clone();
    snap.content.cost_summary.grand_total = match spec.cost {
        CostPaint::Known(amount) => known_money(amount),
        CostPaint::Unknown => Fact::unknown(),
        CostPaint::NoPurchase => Fact::NotApplicable {
            reason_code: "no_purchase".into(),
        },
    };
    snap.content.validation.assignment_completeness = AssignmentCompleteness {
        assigned_instances: UnitCount::new(0).unwrap(),
        provisional_instances: UnitCount::new(0).unwrap(),
        unassigned_instances: UnitCount::new(spec.unassigned).unwrap(),
        unknown_quantity_items: UnitCount::new(spec.unknown_qty).unwrap(),
    };
    snap.content.validation.physical_assurance = if spec.hard {
        PhysicalAssurance::Rejected
    } else {
        PhysicalAssurance::Conditional
    };
    let mut checks = vec![match spec.moves {
        MovePaint::Known(blockers) => check(
            "check-access",
            CheckKind::OperationalAccess,
            CheckStatus::Pass,
            false,
            "ok",
            vec![measurement(blockers)],
        ),
        MovePaint::Unknown { stored } => check(
            "check-access",
            CheckKind::OperationalAccess,
            CheckStatus::Unknown,
            false,
            "temporary_parking_unsupported",
            vec![measurement(stored)],
        ),
        MovePaint::Missing => check(
            "check-access",
            CheckKind::OperationalAccess,
            CheckStatus::Pass,
            false,
            "ok",
            vec![],
        ),
    }];
    if spec.extra_unknown {
        checks.push(check(
            "check-price",
            CheckKind::Price,
            CheckStatus::Unknown,
            false,
            "price_unknown",
            vec![],
        ));
    }
    if spec.hard {
        checks.push(check(
            "check-budget",
            CheckKind::Budget,
            CheckStatus::Fail,
            true,
            "hard_budget_exceeded",
            vec![],
        ));
    }
    snap.content.validation.checks = checks;
    snap.content.bom = vec![bom_line("bom-1", spec.reuse)];
    snap.content.unassigned = vec![];
    if spec.unassigned > 0 {
        snap.content.unassigned.push(Unassigned {
            item_id: Id::new("item-k").unwrap(),
            instances: UnassignedInstances::Known {
                ranges: vec![OrdinalRange {
                    start: 0,
                    end_exclusive: spec.unassigned,
                }],
            },
            reason_code: "no_fit".into(),
        });
    }
    if spec.unknown_qty > 0 {
        snap.content.unassigned.push(Unassigned {
            item_id: Id::new("item-u").unwrap(),
            instances: UnassignedInstances::UnknownQuantity {},
            reason_code: "unknown_quantity".into(),
        });
    }
    snap
}

fn sample(n: u128, cost: CostPaint, reuse: u32, moves: MovePaint) -> PlanSnapshot {
    paint(Paint {
        n,
        cost,
        reuse,
        moves,
        unassigned: 0,
        unknown_qty: 0,
        hard: false,
        extra_unknown: false,
    })
}

fn bundle() -> Vec<PlanSnapshot> {
    vec![
        sample(3, CostPaint::Known(500), 2, MovePaint::Known(1)),
        paint(Paint {
            n: 1,
            cost: CostPaint::Known(100),
            reuse: 9,
            moves: MovePaint::Known(0),
            unassigned: 0,
            unknown_qty: 0,
            hard: true,
            extra_unknown: false,
        }),
        paint(Paint {
            n: 8,
            cost: CostPaint::Known(800),
            reuse: 5,
            moves: MovePaint::Known(0),
            unassigned: 0,
            unknown_qty: 1,
            hard: false,
            extra_unknown: false,
        }),
        sample(
            6,
            CostPaint::Known(800),
            5,
            MovePaint::Unknown { stored: 4 },
        ),
        paint(Paint {
            n: 4,
            cost: CostPaint::Known(900),
            reuse: 1,
            moves: MovePaint::Known(3),
            unassigned: 1,
            unknown_qty: 0,
            hard: false,
            extra_unknown: false,
        }),
        sample(5, CostPaint::Unknown, 5, MovePaint::Known(0)),
        sample(2, CostPaint::Known(800), 5, MovePaint::Known(0)),
    ]
}

fn action(termination: SearchTermination, alternatives: Vec<PlanSnapshot>) -> ParetoCompareAction {
    let input = project();
    ParetoCompareAction {
        termination,
        goal: input.strategy_choice.clone(),
        input_digest: canonical::input_digest(&input),
        budget: input.search.budget,
        seed: input.search.seed,
        alternatives,
    }
}

fn ids(reply: &zari_core::pareto::ParetoReply) -> Vec<String> {
    reply
        .front
        .iter()
        .map(|row| row.candidate_id.as_str().to_owned())
        .collect()
}

fn hex(n: u128) -> String {
    format!("{n:064x}")
}

#[test]
fn cheaper_hard_constraint_is_excluded_and_unknown_cost_is_not_zero() {
    let before = bundle();
    let reply = compare(&action(SearchTermination::ScopeComplete, bundle())).unwrap();
    assert_eq!(before, bundle());
    assert_eq!(reply.read_model_version, READ_MODEL_VERSION);
    assert!(!reply.global_optimum);
    assert!(!reply.recalculation_required);
    assert_eq!(ids(&reply), vec![hex(2), hex(5), hex(3), hex(6)]);
    assert!(ids(&reply).iter().all(|id| id != &hex(1)));
    let excluded = reply
        .excluded
        .iter()
        .find(|row| row.candidate_id.as_str() == hex(1))
        .unwrap();
    assert_eq!(excluded.reason_code, "hard_constraint");
    assert_eq!(
        excluded.purchase,
        ParetoMoney::Known {
            amount: MoneyKrw::new(100).unwrap()
        }
    );
    let unknown = reply
        .front
        .iter()
        .find(|row| row.candidate_id.as_str() == hex(5))
        .unwrap();
    assert_eq!(unknown.purchase, ParetoMoney::Unknown {});
    let value = serde_json::to_value(unknown).unwrap();
    assert!(value.get("score").is_none());
    assert_eq!(value["purchase"]["state"], "unknown");
    assert!(value["purchase"].get("amount").is_none());
    let dominated = reply
        .dominated
        .iter()
        .find(|row| row.candidate_id.as_str() == hex(8))
        .unwrap();
    assert_eq!(dominated.unassigned_instances, 0);
    assert_eq!(dominated.unknown_quantity_items, 1);
    let item = dominated
        .items
        .iter()
        .find(|item| item.item_id.as_str() == "item-u")
        .unwrap();
    let item_json = serde_json::to_value(item).unwrap();
    assert_eq!(item_json["quantity"]["kind"], "unknownQuantity");
    assert!(item_json["quantity"].get("count").is_none());
    let leader = &reply.front[0];
    assert!(!leader.difference.purchase);
    assert!(unknown.difference.purchase);
    assert!(!unknown.difference.reuse);
}

#[test]
fn same_seed_and_budget_keep_one_order_and_exhausted_budget_is_not_optimal() {
    let forward = compare(&action(SearchTermination::ScopeComplete, bundle())).unwrap();
    let mut reversed = bundle();
    reversed.reverse();
    let backward = compare(&action(SearchTermination::ScopeComplete, reversed)).unwrap();
    assert_eq!(ids(&forward), ids(&backward));
    let mut seeded = action(SearchTermination::ScopeComplete, bundle());
    seeded.seed = Some("7".into());
    for snapshot in &mut seeded.alternatives {
        snapshot.content.versions.seed = Some("7".into());
    }
    let again = compare(&seeded).unwrap();
    assert_eq!(ids(&again), ids(&forward));
    assert_eq!(again.seed.as_deref(), Some("7"));
    seeded.alternatives[0].content.versions.seed = Some("9".into());
    let mismatched = compare(&seeded).unwrap();
    assert!(mismatched.recalculation_required);
    assert!(!mismatched.context_match);
    assert!(mismatched.front.is_empty());
    assert!(!mismatched.global_optimum);
    let mut budget = action(SearchTermination::ScopeComplete, bundle());
    budget.alternatives[0]
        .content
        .versions
        .search_budget
        .max_nodes = 1;
    let other_budget = compare(&budget).unwrap();
    assert!(other_budget.recalculation_required);
    assert!(other_budget.front.is_empty());
    let exhausted = compare(&action(SearchTermination::BudgetExhausted, bundle())).unwrap();
    assert_eq!(
        exhausted.optimality,
        zari_core::pareto::ParetoOptimality::BudgetLimited
    );
    assert!(!exhausted.global_optimum);
    assert_eq!(ids(&exhausted), ids(&forward));
    let json = serde_json::to_value(&exhausted).unwrap();
    assert_eq!(json["globalOptimum"], false);
    assert_eq!(json["optimality"], "budgetLimited");
    assert!(json.get("score").is_none());
    let empty = compare(&action(SearchTermination::BudgetExhausted, vec![])).unwrap();
    assert!(empty.front.is_empty());
    assert!(!empty.global_optimum);
    assert!(!empty.recalculation_required);
}

#[test]
fn unknown_moves_are_not_zero_and_a_missing_count_sorts_after_known() {
    let known = paint(Paint {
        n: 9,
        cost: CostPaint::Known(800),
        reuse: 5,
        moves: MovePaint::Known(0),
        unassigned: 0,
        unknown_qty: 0,
        hard: false,
        extra_unknown: true,
    });
    let unknown = sample(
        6,
        CostPaint::Known(800),
        5,
        MovePaint::Unknown { stored: 4 },
    );
    let reply = compare(&action(
        SearchTermination::ScopeComplete,
        vec![unknown, known],
    ))
    .unwrap();
    assert_eq!(ids(&reply), vec![hex(9), hex(6)]);
    assert_eq!(reply.front[1].preceding_moves, ParetoCount::Unknown {});
    assert_eq!(
        reply.front[0].preceding_moves,
        ParetoCount::Known { value: 0 }
    );
    let missing = sample(1, CostPaint::Known(800), 5, MovePaint::Missing);
    let zero = sample(2, CostPaint::Known(800), 5, MovePaint::Known(0));
    let ordered = compare(&action(
        SearchTermination::ScopeComplete,
        vec![missing, zero],
    ))
    .unwrap();
    assert_eq!(ids(&ordered), vec![hex(2), hex(1)]);
    assert_eq!(ordered.front[1].preceding_moves, ParetoCount::Unknown {});
}

#[test]
fn reuse_comes_from_bom_or_owned_placements_and_no_purchase_is_not_unknown() {
    let input = project();
    let mut owned = shell();
    owned.plan_snapshot_id = Digest::new(&hex(1)).unwrap();
    owned.content.versions.input_digest = canonical::input_digest(&input);
    owned.content.versions.search_budget = input.search.budget.clone();
    owned.content.versions.seed = input.search.seed.clone();
    owned.content.strategy.strategy = input.strategy_choice.clone();
    owned.content.bom.clear();
    owned.content.placements[0].subject = PlacementSubject::OwnedContainer {
        owned_id: Id::new("owned-1").unwrap(),
        unit_ordinal: 0,
    };
    owned.content.validation.checks = vec![check(
        "check-access",
        CheckKind::OperationalAccess,
        CheckStatus::Pass,
        false,
        "ok",
        vec![measurement(0)],
    )];
    let reply = compare(&action(SearchTermination::ScopeComplete, vec![owned])).unwrap();
    assert_eq!(reply.front[0].reuse, ParetoCount::Known { value: 1 });
    let summed = sample(2, CostPaint::Known(800), 0, MovePaint::Known(0));
    let mut lines = summed;
    lines.content.bom = vec![bom_line("bom-a", 2), bom_line("bom-b", 3)];
    let summed_reply = compare(&action(SearchTermination::ScopeComplete, vec![lines])).unwrap();
    assert_eq!(summed_reply.front[0].reuse, ParetoCount::Known { value: 5 });
    let free = sample(3, CostPaint::NoPurchase, 5, MovePaint::Known(0));
    let priced = sample(4, CostPaint::Known(100), 5, MovePaint::Known(0));
    let cost_reply = compare(&action(
        SearchTermination::ScopeComplete,
        vec![priced, free],
    ))
    .unwrap();
    assert_eq!(ids(&cost_reply), vec![hex(3)]);
    assert_eq!(cost_reply.front[0].purchase, ParetoMoney::NoPurchase {});
    assert!(
        cost_reply
            .dominated
            .iter()
            .any(|row| row.candidate_id.as_str() == hex(4))
    );
}

#[test]
fn goal_change_asks_for_recalculation_and_duplicate_ids_fail() {
    let mut changed = action(SearchTermination::ScopeComplete, bundle());
    changed.goal = Strategy::OneActionAccess;
    let reply = compare(&changed).unwrap();
    assert!(reply.recalculation_required);
    assert!(reply.front.is_empty());
    assert!(!reply.global_optimum);
    assert_eq!(reply.goal, Strategy::OneActionAccess);
    let mut duplicated = bundle();
    duplicated.push(duplicated[0].clone());
    assert_eq!(
        compare(&action(SearchTermination::ScopeComplete, duplicated))
            .unwrap_err()
            .code,
        "duplicate_candidate"
    );
    let too_many = vec![sample(1, CostPaint::Known(1), 0, MovePaint::Known(0)); 33];
    assert_eq!(
        compare(&action(SearchTermination::ScopeComplete, too_many))
            .unwrap_err()
            .code,
        "input_limit_exceeded"
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
fn command_matches_the_function_and_does_not_publish() {
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
        send(&mut bare, "pareto", None, json!({"kind": "comparePareto"}))["event"]["code"],
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
    assert_eq!(
        names.last().map(Value::as_str).unwrap(),
        Some("diagnoseSearch")
    );
    assert_eq!(names[names.len() - 2].as_str(), Some("replanIncremental"));
    assert_eq!(
        send(
            &mut runtime,
            "extra",
            None,
            json!({"kind": "comparePareto", "termination": "scopeComplete", "alternatives": [], "extra": true})
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
            "bootstrap-pareto",
            None,
            json!({"kind": "comparePareto", "termination": "scopeComplete", "alternatives": []})
        )["event"]["code"],
        "invalid_state"
    );

    let raw = fixture();
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
                "input": raw["input"]["input"].clone(),
                "catalog": raw["input"]["catalog"].clone()
            }
        }),
    );
    assert_eq!(project_event["event"]["kind"], "projectActivated");
    let context = project_event["event"]["contextId"]
        .as_str()
        .unwrap()
        .to_owned();
    let alternatives = bundle();
    let native = compare(&action(
        SearchTermination::ScopeComplete,
        alternatives.clone(),
    ))
    .unwrap();
    let reply = send(
        &mut runtime,
        "pareto-project",
        Some(&context),
        json!({
            "kind": "comparePareto",
            "termination": "scopeComplete",
            "alternatives": alternatives
        }),
    );
    assert_eq!(reply["event"]["kind"], "paretoCompared");
    assert!(reply["event"].get("snapshot").is_none());
    assert_eq!(reply["event"]["reply"]["globalOptimum"], false);
    let wire: Vec<String> = reply["event"]["reply"]["front"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["candidateId"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(wire, ids(&native));
}
