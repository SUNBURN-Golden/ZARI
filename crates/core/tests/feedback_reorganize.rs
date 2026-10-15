//! z-feedback-reorganize. Feedback is a record, not a decision. A draft is a
//! validated exchange of positions, explained rule by rule, and reproducible
//! from its input digest, rule version, feedback, and budget.
//!
//! Scenario files under tests/fixtures/feedback_reorganize rebuild a small
//! plan from the preserved verified fixture, replay the case's actions
//! through the Rust log, run the proposal, and compare causes and moves.

use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use zari_core::canonical::CatalogContent;
use zari_core::facts::Fact;
use zari_core::feedback_reorganize::{
    ACCESS_RULE_ID, CauseOutcome, FREQUENCY_RULE_ID, FeedbackAction, FeedbackEntry, FeedbackKind,
    FeedbackLog, MAINTENANCE_RULE_ID, ProposalBudget, ProposalOutcome, ProposalReply,
    ProposeAction, READ_MODEL_VERSION, RULE_SET_VERSION, apply_feedback_log, propose,
};
use zari_core::location_search::{LocationLog, LocationObservation, ObservationKind};
use zari_core::plan::{
    CandidateLayout, CandidateProposal, ItemAssignment, ItemLocation, OrdinalRange, ParentRef,
    Placement, PlacementSubject, PlanCreation, Unassigned, UnassignedInstances,
};
use zari_core::scalars::{Id, LengthMm, MassGrams, PositionMm, Quantity};
use zari_core::*;
use zari_solver::SolverEngine;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn scenario(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/feedback_reorganize")
        .join(format!("{name}.json"));
    serde_json::from_str(&fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap()
}

fn verified() -> Value {
    serde_json::from_str(
        &fs::read_to_string(root().join("fixtures/domain/candidate-bounded-confirmed.json"))
            .unwrap(),
    )
    .unwrap()
}

fn id(raw: &str) -> Id {
    Id::new(raw).unwrap()
}

fn frequency(text: &str) -> Frequency {
    match text {
        "daily" => Frequency::Daily,
        "weekly" => Frequency::Weekly,
        "monthly" => Frequency::Monthly,
        "rare" => Frequency::Rare,
        other => panic!("frequency {other}"),
    }
}

fn set_length(fact: &mut Measurement, mm: u32) {
    if let Fact::Known { value, .. } = fact {
        value.nominal = LengthMm::new(mm).unwrap();
    } else {
        panic!("template length is known");
    }
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

struct World {
    input: ProjectInput,
    catalog: CatalogContent,
    base: PlanSnapshot,
    other: PlanSnapshot,
}

fn layout_for(
    input: &ProjectInput,
    placed: &serde_json::Map<String, Value>,
    unplaced: &[String],
) -> CandidateLayout {
    let mut placements = Vec::new();
    let mut assignments = Vec::new();
    for (item_id, at) in placed {
        let pid = id(&format!("p-{item_id}"));
        placements.push(Placement {
            id: pid.clone(),
            subject: PlacementSubject::DirectItem {
                item_id: id(item_id),
                unit_ordinal: 0,
            },
            parent: ParentRef::Space {
                space_id: input.space.id.clone(),
            },
            position: Vec3Mm {
                x: PositionMm::new(at[0].as_i64().unwrap() as i32).unwrap(),
                y: PositionMm::new(at[1].as_i64().unwrap() as i32).unwrap(),
                z: PositionMm::new(0).unwrap(),
            },
            orientation: Orientation::Upright0,
            support_id: input.space.support.id.clone(),
        });
        assignments.push(ItemAssignment {
            item_id: id(item_id),
            unit_ordinal: 0,
            location: ItemLocation::Direct { placement_id: pid },
        });
    }
    let unassigned = unplaced
        .iter()
        .map(|item_id| Unassigned {
            item_id: id(item_id),
            instances: UnassignedInstances::Known {
                ranges: vec![OrdinalRange {
                    start: 0,
                    end_exclusive: 1,
                }],
            },
            reason_code: "test_unplaced".into(),
        })
        .collect();
    CandidateLayout {
        placements,
        assignments,
        unassigned,
        purchase_selections: vec![],
    }
}

fn publish(
    input: &ProjectInput,
    catalog: &CatalogContent,
    layout: CandidateLayout,
) -> PlanSnapshot {
    let strategy = SolverEngine
        .propose_strategies(input)
        .into_iter()
        .find(|decision| decision.strategy == input.strategy_choice)
        .expect("strategy decision");
    let evaluation = evaluate_candidate(
        input,
        catalog,
        &CandidateProposal {
            layout,
            strategy,
            creation: PlanCreation::ManualEdit,
        },
        versions(input, catalog),
        scope(input),
    );
    let blocking: Vec<_> = evaluation
        .report
        .iter()
        .flat_map(|report| report.checks.iter())
        .filter(|check| check.blocking && check.status == CheckStatus::Fail)
        .map(|check| (check.id.as_str().to_owned(), check.reason_code.clone()))
        .collect();
    evaluation.snapshot.unwrap_or_else(|| {
        panic!(
            "scenario base finalizes: {:?} / {blocking:?}",
            evaluation.diagnostics
        )
    })
}

fn build_world(case: &Value) -> World {
    let raw = verified();
    let body = &raw["input"];
    let mut input: ProjectInput = serde_json::from_value(body["input"].clone()).unwrap();
    let catalog_snapshot: CatalogSnapshot =
        serde_json::from_value(body["catalog"].clone()).unwrap();
    let catalog = CatalogContent::from(&catalog_snapshot);
    let template = input.items[0].clone();
    let provenance = match &template.quantity {
        Fact::Known { provenance, .. } => provenance.clone(),
        _ => unreachable!("template quantity is known"),
    };
    input.items = case["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            let mut item = template.clone();
            item.id = id(row["id"].as_str().unwrap());
            item.label = row["label"].as_str().unwrap().into();
            item.quantity = Fact::Known {
                value: Quantity::new(1).unwrap(),
                provenance: provenance.clone(),
            };
            let size = row["size"].as_array().unwrap();
            set_length(
                &mut item.dimensions.envelope.width,
                size[0].as_u64().unwrap() as u32,
            );
            set_length(
                &mut item.dimensions.envelope.depth,
                size[1].as_u64().unwrap() as u32,
            );
            set_length(
                &mut item.dimensions.envelope.height,
                size[2].as_u64().unwrap() as u32,
            );
            if let Some(grams) = row["massGrams"].as_u64() {
                item.mass_each = Fact::Known {
                    value: MassGrams::new(grams as u32).unwrap(),
                    provenance: provenance.clone(),
                };
            }
            item.frequency = match row["frequency"].as_str() {
                Some(text) => Fact::Known {
                    value: frequency(text),
                    provenance: provenance.clone(),
                },
                None => Fact::unknown(),
            };
            item
        })
        .collect();
    let all: Vec<Value> = vec![Value::Array(
        input
            .items
            .iter()
            .map(|item| json!(item.id.as_str()))
            .collect(),
    )];
    let groups = case["groups"].as_array().unwrap_or(&all);
    input.groups = groups
        .iter()
        .enumerate()
        .map(|(index, members)| ItemGroup {
            id: id(&format!("group-{}", index + 1)),
            label: format!("Group {}", index + 1),
            item_ids: members
                .as_array()
                .unwrap()
                .iter()
                .map(|member| id(member.as_str().unwrap()))
                .collect(),
            split_policy: GroupSplitPolicy::OneTarget,
        })
        .collect();
    let unplaced: Vec<String> = case["unplaced"]
        .as_array()
        .map(|rows| {
            rows.iter()
                .map(|row| row.as_str().unwrap().to_owned())
                .collect()
        })
        .unwrap_or_default();
    let base = publish(
        &input,
        &catalog,
        layout_for(&input, case["placements"].as_object().unwrap(), &unplaced),
    );
    let other_layout = case["otherPlacements"]
        .as_object()
        .unwrap_or_else(|| case["placements"].as_object().unwrap());
    let mut other_input = input.clone();
    // The "other" plan is the same input with different positions; its id
    // differs from the base, which is all a stale entry needs.
    other_input.items = input.items.clone();
    let other = publish(
        &other_input,
        &catalog,
        layout_for(&input, other_layout, &unplaced),
    );
    World {
        input,
        catalog,
        base,
        other,
    }
}

fn entry_from(row: &Value) -> FeedbackEntry {
    FeedbackEntry {
        id: id(row["id"].as_str().unwrap()),
        item_id: id(row["itemId"].as_str().unwrap()),
        kind: match row["kind"].as_str().unwrap() {
            "accessDifficulty" => FeedbackKind::AccessDifficulty,
            "frequencyChange" => FeedbackKind::FrequencyChange,
            "maintenanceDifficulty" => FeedbackKind::MaintenanceDifficulty,
            other => panic!("kind {other}"),
        },
        frequency: row["frequency"].as_str().map(frequency),
        note: row["note"].as_str().map(str::to_owned),
        plan_snapshot_id: None,
    }
}

/// Replays the case actions. Returns the final log and every action result.
fn replay(world: &World, case: &Value) -> FeedbackLog {
    let mut log = FeedbackLog::empty();
    for row in case["actions"].as_array().unwrap() {
        let action = match row["op"].as_str().unwrap() {
            "record" => FeedbackAction::Record {
                entry: entry_from(row),
            },
            "withdraw" => FeedbackAction::Withdraw {
                feedback_id: id(row["id"].as_str().unwrap()),
            },
            other => panic!("op {other}"),
        };
        let snapshot = match row["snapshot"].as_str() {
            Some("other") => Some(&world.other),
            Some("none") => None,
            _ => Some(&world.base),
        };
        let result = apply_feedback_log(&log, &world.input, snapshot, &action);
        match row["expectCode"].as_str() {
            Some(code) => {
                assert_eq!(
                    result.expect_err("rejected").code,
                    code,
                    "{}: {row}",
                    case["caseId"]
                );
            }
            None => {
                let reply =
                    result.unwrap_or_else(|e| panic!("{}: {row}: {}", case["caseId"], e.code));
                assert!(reply.changed);
                log = reply.log;
            }
        }
    }
    log
}

fn locations_from(case: &Value) -> LocationLog {
    LocationLog {
        observations: case["locations"]
            .as_array()
            .map(|rows| {
                rows.iter()
                    .map(|row| LocationObservation {
                        id: id(row["id"].as_str().unwrap()),
                        item_id: id(row["itemId"].as_str().unwrap()),
                        kind: match row["kind"].as_str().unwrap() {
                            "relocate" => ObservationKind::Relocate,
                            "lost" => ObservationKind::Lost,
                            other => panic!("observation {other}"),
                        },
                        label: row["label"].as_str().unwrap().into(),
                        location: row["location"].as_str().map(str::to_owned),
                        unit_ordinals: vec![],
                        plan_snapshot_id: None,
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn run(world: &World, log: &FeedbackLog, locations: &LocationLog, budget: u32) -> ProposalReply {
    propose(&ProposeAction {
        input: &world.input,
        catalog: &world.catalog,
        base: &world.base,
        log,
        locations,
        budget: &ProposalBudget {
            max_evaluations: budget,
        },
    })
    .expect("proposal")
}

fn outcome_name(reply: &ProposalReply) -> &'static str {
    match reply.outcome {
        ProposalOutcome::Published { .. } => "published",
        ProposalOutcome::NoChange {} => "noChange",
    }
}

fn cause_name(outcome: CauseOutcome) -> &'static str {
    match outcome {
        CauseOutcome::Applied => "applied",
        CauseOutcome::NoBetterSlot => "noBetterSlot",
        CauseOutcome::Blocked => "blocked",
        CauseOutcome::NotApplicable => "notApplicable",
        CauseOutcome::Withdrawn => "withdrawn",
        CauseOutcome::Stale => "stale",
        CauseOutcome::BudgetExhausted => "budgetExhausted",
    }
}

fn freq_name(value: &Option<Frequency>) -> Value {
    match value {
        Some(Frequency::Daily) => json!("daily"),
        Some(Frequency::Weekly) => json!("weekly"),
        Some(Frequency::Monthly) => json!("monthly"),
        Some(Frequency::Rare) => json!("rare"),
        None => Value::Null,
    }
}

fn check_expectation(name: &str) -> (World, FeedbackLog, LocationLog, ProposalReply) {
    let case = scenario(name);
    let world = build_world(&case);
    let log = replay(&world, &case);
    let locations = locations_from(&case);
    let budget = case["budget"].as_u64().unwrap() as u32;
    let reply = run(&world, &log, &locations, budget);
    let expect = &case["expect"];
    assert_eq!(outcome_name(&reply), expect["outcome"], "{name} outcome");
    if let Some(used) = expect["evaluationsUsed"].as_u64() {
        assert_eq!(
            u64::from(reply.evaluations_used),
            used,
            "{name} evaluations"
        );
    }
    if let Some(exhausted) = expect["budgetExhausted"].as_bool() {
        assert_eq!(reply.budget_exhausted, exhausted, "{name} budget flag");
    }
    let moves = expect["moves"].as_array().unwrap();
    assert_eq!(
        reply.moves.len(),
        moves.len(),
        "{name} moves {:?}",
        reply.moves
    );
    for expected in moves {
        let found = reply
            .moves
            .iter()
            .find(|row| row.placement_id.as_str() == expected["placementId"])
            .unwrap_or_else(|| panic!("{name}: missing move {expected}"));
        assert_eq!(
            [i64::from(found.to.x.get()), i64::from(found.to.y.get())],
            [
                expected["to"][0].as_i64().unwrap(),
                expected["to"][1].as_i64().unwrap()
            ],
            "{name} target"
        );
        // A move never changes height.
        assert_eq!(found.to.z, found.from.z);
    }
    let causes = expect["causes"].as_array().unwrap();
    assert_eq!(reply.causes.len(), causes.len(), "{name} cause count");
    for (cause, expected) in reply.causes.iter().zip(causes) {
        assert_eq!(cause.feedback_id.as_str(), expected["feedbackId"], "{name}");
        assert_eq!(
            cause_name(cause.outcome),
            expected["outcome"],
            "{name} {expected}"
        );
        assert_eq!(
            cause.reason_code, expected["reasonCode"],
            "{name} {expected}"
        );
        if let Some(partner) = expected["partner"].as_str() {
            assert_eq!(
                cause.partner_placement_id.as_ref().map(Id::as_str),
                Some(partner)
            );
        }
        if let Some(swap) = expected["swap"].as_str() {
            assert_eq!(
                serde_json::to_value(cause.swap).unwrap(),
                json!(swap),
                "{name} swap"
            );
        }
        if let Some(value) = expected["measureBefore"].as_u64() {
            assert_eq!(cause.measure_before, Some(value as u32), "{name} before");
        }
        if let Some(value) = expected["measureAfter"].as_u64() {
            assert_eq!(cause.measure_after, Some(value as u32), "{name} after");
        }
        if let Some(value) = expected["unknownSiblings"].as_u64() {
            assert_eq!(
                cause.unknown_siblings, value as u32,
                "{name} unknown siblings"
            );
        }
        if let Some(value) = expected["evaluations"].as_u64() {
            assert_eq!(cause.evaluations, value as u32, "{name} cause evaluations");
        }
        if expected["blockersNonEmpty"] == json!(true) {
            assert!(!cause.blockers.is_empty(), "{name}: blockers are named");
        }
        if expected.get("frequencyInput").is_some() {
            assert_eq!(
                freq_name(&cause.frequency_input),
                expected["frequencyInput"]
            );
        }
        if expected.get("frequencyEffective").is_some() {
            assert_eq!(
                freq_name(&cause.frequency_effective),
                expected["frequencyEffective"]
            );
        }
        if let Some(kind) = expected["observedKind"].as_str() {
            let observed = cause.observed.as_ref().expect("observed claim");
            assert_eq!(serde_json::to_value(observed.kind).unwrap(), json!(kind));
            assert_eq!(
                observed.location.as_deref(),
                expected["observedLocation"].as_str()
            );
        }
    }
    (world, log, locations, reply)
}

#[test]
fn rules_carry_distinct_ids() {
    assert_ne!(ACCESS_RULE_ID, FREQUENCY_RULE_ID);
    assert_ne!(FREQUENCY_RULE_ID, MAINTENANCE_RULE_ID);
    assert_eq!(READ_MODEL_VERSION, "zari-feedback-1");
    assert_eq!(RULE_SET_VERSION, "zari-feedback-rules-1");
}

#[test]
fn access_difficulty_swaps_depth_with_a_rarer_item_in_front() {
    let (world, _, _, reply) = check_expectation("access-forward");
    let ProposalOutcome::Published { snapshot } = &reply.outcome else {
        panic!("published");
    };
    // The draft is an ordinary immutable snapshot; the adopted plan is
    // untouched and has a different id.
    assert_ne!(snapshot.plan_snapshot_id, world.base.plan_snapshot_id);
    assert_eq!(snapshot.content.creation, PlanCreation::ManualEdit);
    assert_eq!(reply.base_snapshot_id, world.base.plan_snapshot_id);
    assert!(!reply.reused_pass);
    // The draft is exactly what the ordinary evaluator makes of the exchanged
    // layout. Nothing in it is asserted by the proposal.
    let swapped = publish(
        &world.input,
        &world.catalog,
        layout_for(
            &world.input,
            json!({"item-a": [5, 0], "item-b": [310, 200]})
                .as_object()
                .unwrap(),
            &[],
        ),
    );
    assert_eq!(snapshot.plan_snapshot_id, swapped.plan_snapshot_id);
    assert_eq!(
        reply.reproduction.draft_snapshot_id.as_ref(),
        Some(&swapped.plan_snapshot_id)
    );
    assert!(!reply.moves.is_empty());
    assert_eq!(reply.moves[0].item_ids.len(), 1);
}

#[test]
fn frequency_feedback_moves_the_item_that_is_used_more_forward() {
    check_expectation("frequency-promote");
}

#[test]
fn only_the_latest_frequency_entry_for_an_item_acts() {
    let (_, log, _, reply) = check_expectation("frequency-superseded");
    // Both entries stay in the log; nothing is rewritten or removed.
    assert_eq!(log.entries.len(), 2);
    assert_eq!(reply.evaluations_used, 1);
}

#[test]
fn feedback_alone_never_discards_or_buys() {
    let (world, _, _, reply) = check_expectation("frequency-demote-no-discard");
    assert!(!reply.auto_discard);
    assert!(!reply.auto_purchase);
    let preserved = &reply.preserved;
    assert!(preserved.assignments && preserved.unassigned);
    assert!(preserved.purchase_selections && preserved.bom && preserved.cost_summary);
    let ProposalOutcome::Published { snapshot } = &reply.outcome else {
        panic!("published");
    };
    assert_eq!(
        snapshot.content.assignments.len(),
        world.base.content.assignments.len()
    );
    assert_eq!(snapshot.content.unassigned, world.base.content.unassigned);
    assert_eq!(
        snapshot.content.purchase_selections,
        world.base.content.purchase_selections
    );
    assert_eq!(snapshot.content.bom, world.base.content.bom);
    // The reply names no discard or purchase decision other than the two
    // fixed false flags.
    let wire = serde_json::to_value(&reply).unwrap();
    assert_eq!(wire["autoDiscard"], json!(false));
    assert_eq!(wire["autoPurchase"], json!(false));
    // The input fact is not rewritten.
    assert_eq!(
        snapshot.content.input_facts.items,
        world.base.content.input_facts.items
    );
}

#[test]
fn maintenance_difficulty_brings_a_group_closer() {
    let (_, _, _, reply) = check_expectation("maintenance-group");
    assert_eq!(reply.causes[0].rule_id, MAINTENANCE_RULE_ID);
}

#[test]
fn a_rule_with_nothing_to_weigh_says_so() {
    check_expectation("maintenance-no-mates");
    check_expectation("maintenance-no-closer-slot");
    check_expectation("already-ordered");
}

#[test]
fn unknown_frequency_is_never_promoted_to_a_value() {
    let (_, _, _, reply) = check_expectation("unknown-frequency");
    assert!(matches!(reply.outcome, ProposalOutcome::NoChange {}));
    let (_, _, _, reply) = check_expectation("unknown-sibling");
    let cause = &reply.causes[0];
    // B has an unknown frequency: it was counted, never compared, never moved.
    assert_eq!(cause.unknown_siblings, 1);
    assert!(
        reply
            .moves
            .iter()
            .all(|row| row.placement_id.as_str() != "p-item-b")
    );
}

#[test]
fn a_refused_exchange_is_explained_and_changes_nothing() {
    let (_, _, _, reply) = check_expectation("blocked-overflow");
    assert!(matches!(reply.outcome, ProposalOutcome::NoChange {}));
    assert!(reply.reproduction.draft_snapshot_id.is_none());
    assert!(reply.preserved.assignments);
}

#[test]
fn a_smaller_budget_stops_earlier_and_says_so() {
    let (_, _, _, short) = check_expectation("budget-exhausted");
    let (_, _, _, enough) = check_expectation("budget-enough");
    assert!(short.budget_exhausted);
    assert!(!enough.budget_exhausted);
    assert_ne!(
        short.reproduction.request_digest,
        enough.reproduction.request_digest
    );
    assert_eq!(short.reproduction.budget.max_evaluations, 2);
    assert_eq!(enough.reproduction.budget.max_evaluations, 8);
}

#[test]
fn stale_and_withdrawn_entries_explain_why_they_did_nothing() {
    check_expectation("stale-withdrawn-applied");
}

#[test]
fn observations_are_context_and_the_location_log_is_untouched() {
    let (_, _, locations, _) = check_expectation("observed-elsewhere");
    assert_eq!(locations.observations.len(), 1);
    assert_eq!(
        locations.observations[0].location.as_deref(),
        Some("현관 옷걸이")
    );
}

#[test]
fn record_rules_refuse_with_codes_and_never_append() {
    let case = scenario("record-rejections");
    let world = build_world(&case);
    let log = replay(&world, &case);
    let expect = &case["expect"];
    let ids: Vec<&str> = log.entries.iter().map(|entry| entry.id.as_str()).collect();
    let wanted: Vec<&str> = expect["entryIds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row.as_str().unwrap())
        .collect();
    assert_eq!(ids, wanted);
    let withdrawn: Vec<&str> = log.withdrawn_ids.iter().map(Id::as_str).collect();
    let wanted: Vec<&str> = expect["withdrawn"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row.as_str().unwrap())
        .collect();
    assert_eq!(withdrawn, wanted);
    // Rust stamps the adopted plan id; the wire value is never trusted.
    assert!(
        log.entries
            .iter()
            .all(|entry| entry.plan_snapshot_id.as_ref() == Some(&world.base.plan_snapshot_id))
    );
    // Rust also normalizes the note.
    let noted = log
        .entries
        .iter()
        .find(|entry| entry.id.as_str() == "fb-9")
        .unwrap();
    assert_eq!(noted.note.as_deref(), Some("매일 꺼낸다"));
}

#[test]
fn a_wire_plan_id_is_overwritten_and_a_tampered_log_is_refused() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let mut entry = entry_from(&case["actions"][0]);
    entry.plan_snapshot_id = Some(world.other.plan_snapshot_id.clone());
    let reply = apply_feedback_log(
        &FeedbackLog::empty(),
        &world.input,
        Some(&world.base),
        &FeedbackAction::Record { entry },
    )
    .unwrap();
    assert_eq!(
        reply.log.entries[0].plan_snapshot_id.as_ref(),
        Some(&world.base.plan_snapshot_id)
    );
    let mut forged = reply.log.clone();
    forged.entries[0].plan_snapshot_id = None;
    let again = entry_from(&json!({"id":"fb-2","itemId":"item-b","kind":"maintenanceDifficulty"}));
    assert_eq!(
        apply_feedback_log(
            &forged,
            &world.input,
            Some(&world.base),
            &FeedbackAction::Record {
                entry: again.clone()
            },
        )
        .unwrap_err()
        .code,
        "needs_plan"
    );
    let mut dangling = reply.log.clone();
    dangling.withdrawn_ids.push(id("fb-ghost"));
    assert_eq!(
        apply_feedback_log(
            &dangling,
            &world.input,
            Some(&world.base),
            &FeedbackAction::Record {
                entry: again.clone()
            },
        )
        .unwrap_err()
        .code,
        "subject_missing"
    );
    // Bytes that no longer hash to the claimed id are refused.
    let mut tampered = world.base.clone();
    tampered.content.placements[0].position.x = PositionMm::new(7).unwrap();
    assert_eq!(
        apply_feedback_log(
            &FeedbackLog::empty(),
            &world.input,
            Some(&tampered),
            &FeedbackAction::Record { entry: again },
        )
        .unwrap_err()
        .code,
        "integrity_failed"
    );
}

#[test]
fn the_log_has_a_size_limit() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let mut log = FeedbackLog::empty();
    for index in 0..128 {
        let mut entry = entry_from(&json!({
            "id": format!("fb-{index}"),
            "itemId": "item-a",
            "kind": "frequencyChange",
            "frequency": if index % 2 == 0 { "daily" } else { "monthly" },
        }));
        entry.plan_snapshot_id = Some(world.base.plan_snapshot_id.clone());
        log.entries.push(entry);
    }
    let next =
        entry_from(&json!({"id":"fb-last","itemId":"item-b","kind":"maintenanceDifficulty"}));
    assert_eq!(
        apply_feedback_log(
            &log,
            &world.input,
            Some(&world.base),
            &FeedbackAction::Record { entry: next },
        )
        .unwrap_err()
        .code,
        "input_limit_exceeded"
    );
    log.entries.push(log.entries[0].clone());
    assert_eq!(
        apply_feedback_log(
            &log,
            &world.input,
            Some(&world.base),
            &FeedbackAction::Withdraw {
                feedback_id: id("fb-0")
            },
        )
        .unwrap_err()
        .code,
        "input_limit_exceeded"
    );
}

#[test]
fn the_same_input_rules_feedback_and_budget_give_the_same_draft() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let log = replay(&world, &case);
    let none = LocationLog::empty();
    let first = run(&world, &log, &none, 16);
    let second = run(&world, &log, &none, 16);
    assert_eq!(first, second);
    assert_eq!(
        serde_json::to_string(&first).unwrap(),
        serde_json::to_string(&second).unwrap()
    );
    // A rebuilt world (new parse, new evaluation) reproduces the same bytes.
    let rebuilt = build_world(&case);
    let third = run(&rebuilt, &replay(&rebuilt, &case), &none, 16);
    assert_eq!(first, third);
    assert_eq!(
        first.reproduction.input_digest,
        canonical::input_digest(&world.input)
    );
    assert_eq!(
        first.reproduction.catalog_digest,
        canonical::catalog_digest(&world.catalog)
    );

    // Each ingredient of the request moves the request digest.
    let digest = |reply: &ProposalReply| reply.reproduction.request_digest.clone();
    let baseline = digest(&first);
    assert_ne!(baseline, digest(&run(&world, &log, &none, 8)), "budget");
    let mut more = log.clone();
    more.entries.push(entry_from(
        &json!({"id":"fb-x","itemId":"item-b","kind":"maintenanceDifficulty"}),
    ));
    more.entries[1].plan_snapshot_id = Some(world.base.plan_snapshot_id.clone());
    assert_ne!(baseline, digest(&run(&world, &more, &none, 16)), "feedback");
    let seen = LocationLog {
        observations: locations_from(&scenario("observed-elsewhere")).observations,
    };
    assert_ne!(baseline, digest(&run(&world, &log, &seen, 16)), "locations");
    // A new input is a new request, and its draft is computed from that input.
    let mut changed_case = case.clone();
    changed_case["items"][0]["size"][0] = json!(110);
    let changed = build_world(&changed_case);
    let moved = run(&changed, &replay(&changed, &changed_case), &none, 16);
    assert_ne!(
        moved.reproduction.input_digest, first.reproduction.input_digest,
        "input"
    );
    assert_ne!(baseline, digest(&moved), "input request");
    assert_ne!(
        moved.reproduction.base_snapshot_id,
        first.reproduction.base_snapshot_id
    );
    assert!(matches!(moved.outcome, ProposalOutcome::Published { .. }));
}

#[test]
fn a_changed_input_makes_the_old_plan_out_of_scope() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let log = replay(&world, &case);
    let mut changed = world.input.clone();
    if let Fact::Known { value, .. } = &mut changed.items[0].dimensions.envelope.width {
        value.nominal = LengthMm::new(110).unwrap();
    }
    let error = propose(&ProposeAction {
        input: &changed,
        catalog: &world.catalog,
        base: &world.base,
        log: &log,
        locations: &LocationLog::empty(),
        budget: &ProposalBudget { max_evaluations: 4 },
    })
    .unwrap_err();
    assert_eq!(error.code, "base_not_in_scope");

    let mut tampered = world.base.clone();
    tampered.content.placements[0].position.x = PositionMm::new(7).unwrap();
    let error = propose(&ProposeAction {
        input: &world.input,
        catalog: &world.catalog,
        base: &tampered,
        log: &log,
        locations: &LocationLog::empty(),
        budget: &ProposalBudget { max_evaluations: 4 },
    })
    .unwrap_err();
    assert_eq!(error.code, "integrity_failed");
}

#[test]
fn the_budget_is_bounded() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let log = replay(&world, &case);
    for bad in [0u32, 129] {
        let error = propose(&ProposeAction {
            input: &world.input,
            catalog: &world.catalog,
            base: &world.base,
            log: &log,
            locations: &LocationLog::empty(),
            budget: &ProposalBudget {
                max_evaluations: bad,
            },
        })
        .unwrap_err();
        assert_eq!(error.code, "invalid_input");
    }
}

#[test]
fn the_proposal_never_changes_what_it_read() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let log = replay(&world, &case);
    let before = (
        serde_json::to_string(&world.base).unwrap(),
        serde_json::to_string(&world.input).unwrap(),
        serde_json::to_string(&log).unwrap(),
    );
    let locations = locations_from(&scenario("observed-elsewhere"));
    let location_bytes = serde_json::to_string(&locations).unwrap();
    let _ = run(&world, &log, &locations, 16);
    assert_eq!(serde_json::to_string(&world.base).unwrap(), before.0);
    assert_eq!(serde_json::to_string(&world.input).unwrap(), before.1);
    assert_eq!(serde_json::to_string(&log).unwrap(), before.2);
    assert_eq!(serde_json::to_string(&locations).unwrap(), location_bytes);
}

fn meta(request_id: &str, context: Option<&str>) -> Value {
    json!({
        "protocolVersion": 1,
        "schemaVersion": 1,
        "workerSessionId": "session-a",
        "projectActivationId": "activation-a",
        "requestId": request_id,
        "projectId": "project-a",
        "editorEpoch": "0",
        "inputRevision": "1",
        "contextId": context
    })
}

fn system_meta(request_id: &str) -> Value {
    json!({
        "protocolVersion": 1,
        "schemaVersion": 1,
        "workerSessionId": "session-a",
        "projectActivationId": "system",
        "requestId": request_id,
        "projectId": "system",
        "editorEpoch": "0",
        "inputRevision": "0",
        "contextId": null
    })
}

fn send(runtime: &mut Runtime, request_meta: Value, command: Value) -> Value {
    serde_json::from_str(
        &runtime.handle_json(&json!({"meta": request_meta, "command": command}).to_string()),
    )
    .unwrap()
}

fn initialized(engine: bool) -> Runtime {
    let mut runtime = Runtime::new();
    if engine {
        runtime.set_search_engine(Box::new(SolverEngine));
    }
    let ready = send(
        &mut runtime,
        system_meta("init"),
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    assert_eq!(ready["event"]["kind"], "ready");
    runtime
}

#[test]
fn the_commands_are_listed_without_a_search_engine_and_match_native() {
    let mut bare = initialized(false);
    // The commands do not need a search engine.
    let probe = send(
        &mut bare,
        system_meta("bare-log"),
        json!({"kind": "applyFeedbackLog"}),
    );
    assert_eq!(probe["event"]["code"], "invalid_input");
    let probe = send(
        &mut bare,
        meta("bare-propose", None),
        json!({"kind": "proposeFeedbackReorganize"}),
    );
    assert_eq!(probe["event"]["code"], "invalid_input");
    // With a project missing, the real shape is refused for the state.
    let case = scenario("access-forward");
    let world = build_world(&case);
    let log = replay(&world, &case);
    let command = json!({
        "kind": "proposeFeedbackReorganize",
        "baseSnapshot": world.base,
        "log": log,
        "locations": {"observations": []},
        "budget": {"maxEvaluations": 16}
    });
    let early = send(&mut bare, meta("early", None), command.clone());
    assert_eq!(early["event"]["code"], "project_not_active");

    // Stateless record under the system identity.
    let recorded = send(
        &mut bare,
        system_meta("record"),
        json!({
            "kind": "applyFeedbackLog",
            "log": {"entries": [], "withdrawnIds": []},
            "input": world.input,
            "snapshot": world.base,
            "action": {"kind": "record", "entry": {
                "id": "fb-1", "itemId": "item-a", "kind": "accessDifficulty",
                "frequency": null, "note": null, "planSnapshotId": null
            }}
        }),
    );
    assert_eq!(recorded["event"]["kind"], "feedbackLogApplied");
    assert_eq!(recorded["event"]["reply"]["changed"], true);
    assert_eq!(
        recorded["event"]["reply"]["log"]["entries"][0]["planSnapshotId"],
        world.base.plan_snapshot_id.as_str()
    );
    let extra = send(
        &mut bare,
        system_meta("extra"),
        json!({
            "kind": "applyFeedbackLog",
            "log": {"entries": [], "withdrawnIds": []},
            "input": world.input,
            "snapshot": null,
            "action": {"kind": "withdraw", "feedbackId": "fb-1"},
            "unexpected": true
        }),
    );
    assert_eq!(extra["event"]["code"], "invalid_input");
    let refused = send(
        &mut bare,
        system_meta("withdraw-missing"),
        json!({
            "kind": "applyFeedbackLog",
            "log": {"entries": [], "withdrawnIds": []},
            "input": world.input,
            "snapshot": null,
            "action": {"kind": "withdraw", "feedbackId": "fb-1"}
        }),
    );
    assert_eq!(refused["event"]["code"], "subject_missing");

    // The active-context command matches the native function byte for byte.
    let body = verified();
    let mut runtime = initialized(true);
    let activated = send(
        &mut runtime,
        meta("activate", None),
        json!({
            "kind": "activateProject",
            "context": {
                "kind": "project",
                "input": serde_json::to_value(&world.input).unwrap(),
                "catalog": body["input"]["catalog"].clone()
            }
        }),
    );
    assert_eq!(
        activated["event"]["kind"], "projectActivated",
        "{activated}"
    );
    let context = activated["event"]["contextId"].as_str().unwrap().to_owned();
    let reply = send(&mut runtime, meta("propose", Some(&context)), command);
    assert_eq!(
        reply["event"]["kind"], "feedbackReorganizeProposed",
        "{reply}"
    );
    let native = run(&world, &log, &LocationLog::empty(), 16);
    assert_eq!(
        reply["event"]["reply"],
        serde_json::to_value(&native).unwrap()
    );
    assert_eq!(reply["event"]["reply"]["autoDiscard"], json!(false));
    assert_eq!(reply["event"]["reply"]["autoPurchase"], json!(false));

    // A plan for another input is out of scope, not silently re-pinned.
    let mut other_input = world.input.clone();
    if let Fact::Known { value, .. } = &mut other_input.items[1].dimensions.envelope.width {
        value.nominal = LengthMm::new(120).unwrap();
    }
    let stale = send(
        &mut runtime,
        meta("stale", Some(&context)),
        json!({
            "kind": "proposeFeedbackReorganize",
            "baseSnapshot": publish(
                &other_input,
                &world.catalog,
                layout_for(&other_input, case["placements"].as_object().unwrap(), &[])
            ),
            "log": log,
            "locations": {"observations": []},
            "budget": {"maxEvaluations": 16}
        }),
    );
    assert_eq!(stale["event"]["code"], "base_not_in_scope");
    let bad = send(
        &mut runtime,
        meta("bad-budget", Some(&context)),
        json!({
            "kind": "proposeFeedbackReorganize",
            "baseSnapshot": world.base,
            "log": log,
            "locations": {"observations": []},
            "budget": {"maxEvaluations": 0}
        }),
    );
    assert_eq!(bad["event"]["code"], "invalid_input");
}

#[test]
fn the_wire_names_are_the_ones_the_page_expects() {
    let case = scenario("access-forward");
    let world = build_world(&case);
    let log = replay(&world, &case);
    let reply = run(&world, &log, &LocationLog::empty(), 16);
    let wire = serde_json::to_value(&reply).unwrap();
    for key in [
        "readModelVersion",
        "ruleSetVersion",
        "baseSnapshotId",
        "outcome",
        "causes",
        "moves",
        "checkChanges",
        "preserved",
        "reusedPass",
        "autoDiscard",
        "autoPurchase",
        "evaluationsUsed",
        "budgetExhausted",
        "reproduction",
    ] {
        assert!(wire.get(key).is_some(), "{key}");
    }
    assert_eq!(wire["outcome"]["kind"], "published");
    assert_eq!(wire["causes"][0]["outcome"], "applied");
    assert_eq!(wire["causes"][0]["kind"], "accessDifficulty");
    assert_eq!(wire["causes"][0]["swap"], "depthSwap");
    assert_eq!(wire["reproduction"]["budget"]["maxEvaluations"], 16);
    assert_eq!(wire["preserved"]["purchaseSelections"], true);
}

#[test]
fn a_bounded_run_on_many_placements_stays_deterministic() {
    // Eight placements in a 2 x 4 grid, frequency reversed with depth.
    let mut items = Vec::new();
    let mut placed = serde_json::Map::new();
    let rows = ["daily", "weekly", "monthly", "rare"];
    for index in 0..8 {
        let item_id = format!("item-{index}");
        // Row 0 is the front. The rare items sit in front, the daily ones behind.
        let row = index / 2;
        let freq = rows[3 - row];
        items.push(json!({"id": item_id, "label": format!("물건 {index}"), "frequency": freq, "size": [100, 60, 50]}));
        placed.insert(item_id, json!([5 + (index % 2) * 150, row * 70]));
    }
    let case = json!({
        "caseId": "grid",
        "items": items,
        "placements": placed,
        "actions": [
            {"op": "record", "id": "fb-1", "itemId": "item-6", "kind": "accessDifficulty", "expectCode": null},
            {"op": "record", "id": "fb-2", "itemId": "item-7", "kind": "accessDifficulty", "expectCode": null}
        ]
    });
    let world = build_world(&case);
    let log = replay(&world, &case);
    let first = run(&world, &log, &LocationLog::empty(), 32);
    let second = run(&world, &log, &LocationLog::empty(), 32);
    assert_eq!(first, second);
    assert!(matches!(first.outcome, ProposalOutcome::Published { .. }));
    assert!(
        first
            .causes
            .iter()
            .all(|c| c.outcome == CauseOutcome::Applied)
    );
    // Both feedback items ended nearer the opening than they started.
    for moved in &first.moves {
        assert!(!moved.item_ids.is_empty());
    }
    let ProposalOutcome::Published { snapshot } = &first.outcome else {
        unreachable!()
    };
    let y_of = |snapshot: &PlanSnapshot, placement: &str| {
        snapshot
            .content
            .placements
            .iter()
            .find(|p| p.id.as_str() == placement)
            .unwrap()
            .position
            .y
            .get()
    };
    assert!(y_of(snapshot, "p-item-6") < y_of(&world.base, "p-item-6"));
    assert!(y_of(snapshot, "p-item-7") < y_of(&world.base, "p-item-7"));
}

#[test]
fn an_item_inside_a_container_moves_with_its_container() {
    let raw: Value = serde_json::from_str(
        &fs::read_to_string(root().join("fixtures/domain/candidate-contained-conditional.json"))
            .unwrap(),
    )
    .unwrap();
    let body = &raw["input"];
    let mut input: ProjectInput = serde_json::from_value(body["input"].clone()).unwrap();
    // The documents are narrowed so a container and they share the width.
    let documents = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == "item-b")
        .unwrap();
    set_length(&mut documents.dimensions.envelope.width, 250);
    let catalog = CatalogContent::from(
        &serde_json::from_value::<CatalogSnapshot>(body["catalog"].clone()).unwrap(),
    );
    let mut layout: CandidateLayout =
        serde_json::from_value(body["proposal"]["layout"].clone()).unwrap();
    // The container holds the weekly coat at the back. The rare documents
    // stand directly at the front.
    layout.placements[0].position.y = PositionMm::new(200).unwrap();
    layout.placements.push(Placement {
        id: id("p-b0"),
        subject: PlacementSubject::DirectItem {
            item_id: id("item-b"),
            unit_ordinal: 0,
        },
        parent: ParentRef::Space {
            space_id: input.space.id.clone(),
        },
        position: Vec3Mm {
            x: PositionMm::new(310).unwrap(),
            y: PositionMm::new(0).unwrap(),
            z: PositionMm::new(0).unwrap(),
        },
        orientation: Orientation::Upright0,
        support_id: input.space.support.id.clone(),
    });
    layout.assignments.push(ItemAssignment {
        item_id: id("item-b"),
        unit_ordinal: 0,
        location: ItemLocation::Direct {
            placement_id: id("p-b0"),
        },
    });
    layout
        .unassigned
        .retain(|row| row.item_id.as_str() != "item-b");
    let base = publish(&input, &catalog, layout);
    let world = World {
        input,
        catalog,
        other: base.clone(),
        base,
    };
    let mut log = FeedbackLog::empty();
    log = apply_feedback_log(
        &log,
        &world.input,
        Some(&world.base),
        &FeedbackAction::Record {
            entry: entry_from(
                &json!({"id": "fb-1", "itemId": "item-a", "kind": "accessDifficulty"}),
            ),
        },
    )
    .unwrap()
    .log;
    let reply = run(&world, &log, &LocationLog::empty(), 8);
    let cause = &reply.causes[0];
    assert_eq!(cause.outcome, CauseOutcome::Applied, "{cause:?}");
    // The focus is the container's placement, not a placement for the coat.
    assert_eq!(cause.focus_placement_ids, vec![id("p-c1")]);
    assert_eq!(cause.partner_placement_id, Some(id("p-b0")));
    let moved: Vec<(&str, i32)> = reply
        .moves
        .iter()
        .map(|row| (row.placement_id.as_str(), row.to.y.get()))
        .collect();
    assert!(
        moved.contains(&("p-c1", 0)) && moved.contains(&("p-b0", 200)),
        "{moved:?}"
    );
    let container_move = reply
        .moves
        .iter()
        .find(|row| row.placement_id.as_str() == "p-c1")
        .unwrap();
    assert_eq!(container_move.item_ids, vec![id("item-a")]);
    // The contained assignment, its local place, and the purchase survive.
    assert!(reply.preserved.assignments && reply.preserved.purchase_selections);
    let ProposalOutcome::Published { snapshot } = &reply.outcome else {
        panic!("published");
    };
    assert_eq!(snapshot.content.assignments, world.base.content.assignments);
    // A container with a known conditional check stays conditional, never
    // stronger and never weaker.
    assert_eq!(
        snapshot.content.validation.physical_assurance,
        world.base.content.validation.physical_assurance
    );
}

/// The same case the browser WASM unit test replays. Expectations in the file
/// are the native oracle; `tests/unit/feedbackWasm.test.ts` asserts the
/// browser runtime answers with the same bytes.
#[test]
fn native_oracle_for_the_wasm_parity_case() {
    let case = scenario("wasm-parity");
    let raw: Value = serde_json::from_str(
        &fs::read_to_string(root().join(case["fixture"].as_str().unwrap())).unwrap(),
    )
    .unwrap();
    let body = &raw["input"];
    let input: ProjectInput = serde_json::from_value(body["input"].clone()).unwrap();
    let catalog = CatalogContent::from(
        &serde_json::from_value::<CatalogSnapshot>(body["catalog"].clone()).unwrap(),
    );
    let mut proposal: CandidateProposal = serde_json::from_value(body["proposal"].clone()).unwrap();
    let behind = &case["coatBehind"];
    let coat = proposal
        .layout
        .placements
        .iter_mut()
        .find(|placement| placement.id.as_str() == behind["placementId"])
        .unwrap();
    coat.position.y = PositionMm::new(behind["y"].as_i64().unwrap() as i32).unwrap();
    let base = evaluate_candidate(
        &input,
        &catalog,
        &proposal,
        versions(&input, &catalog),
        scope(&input),
    )
    .snapshot
    .expect("parity base finalizes");
    let log = apply_feedback_log(
        &FeedbackLog::empty(),
        &input,
        Some(&base),
        &FeedbackAction::Record {
            entry: entry_from(&case["feedback"]),
        },
    )
    .unwrap()
    .log;
    let reply = propose(&ProposeAction {
        input: &input,
        catalog: &catalog,
        base: &base,
        log: &log,
        locations: &LocationLog::empty(),
        budget: &ProposalBudget {
            max_evaluations: case["budget"].as_u64().unwrap() as u32,
        },
    })
    .unwrap();
    let expect = &case["expect"];
    let actual = json!({
        "baseSnapshotId": base.plan_snapshot_id.as_str(),
        "draftSnapshotId": reply.reproduction.draft_snapshot_id.as_ref().map(|id| id.as_str()),
        "requestDigest": reply.reproduction.request_digest.as_str(),
        "feedbackDigest": reply.reproduction.feedback_digest.as_str(),
    });
    for key in [
        "baseSnapshotId",
        "draftSnapshotId",
        "requestDigest",
        "feedbackDigest",
    ] {
        assert_eq!(actual[key], expect[key], "{key}: actual {actual}");
    }
    assert_eq!(reply.moves.len(), 2);
    for row in expect["moves"].as_array().unwrap() {
        let found = reply
            .moves
            .iter()
            .find(|moved| moved.placement_id.as_str() == row["placementId"])
            .unwrap();
        assert_eq!(
            [i64::from(found.from.x.get()), i64::from(found.from.y.get())],
            [
                row["from"][0].as_i64().unwrap(),
                row["from"][1].as_i64().unwrap()
            ]
        );
        assert_eq!(
            [i64::from(found.to.x.get()), i64::from(found.to.y.get())],
            [
                row["to"][0].as_i64().unwrap(),
                row["to"][1].as_i64().unwrap()
            ]
        );
    }
    let cause = &reply.causes[0];
    assert_eq!(cause_name(cause.outcome), expect["cause"]["outcome"]);
    assert_eq!(cause.reason_code, expect["cause"]["reasonCode"]);
    assert_eq!(
        cause.partner_placement_id.as_ref().map(Id::as_str),
        expect["cause"]["partner"].as_str()
    );
}

#[test]
fn a_crowded_set_with_many_entries_stays_within_its_budget() {
    // 64 small boxes in an 8 x 8 grid, frequency reversed with depth. Each
    // item carries an access and a maintenance entry, so the proposal faces
    // far more candidates than its budget can send to the validator.
    let mut items = Vec::new();
    let mut placed = serde_json::Map::new();
    let mut actions = Vec::new();
    let ranks = ["daily", "weekly", "monthly", "rare"];
    for index in 0..64 {
        let item_id = format!("item-{index}");
        let row = index / 8;
        let column = index % 8;
        items.push(json!({
            "id": item_id,
            "label": format!("물건 {index}"),
            "frequency": ranks[3 - (row / 2).min(3)],
            "size": [40, 40, 20],
            "massGrams": 10
        }));
        placed.insert(item_id.clone(), json!([5 + column * 45, row * 45]));
        if index >= 16 {
            actions.push(json!({"op": "record", "id": format!("fa-{index}"), "itemId": item_id, "kind": "accessDifficulty", "expectCode": null}));
        }
        if index % 2 == 0 {
            actions.push(json!({"op": "record", "id": format!("fm-{index}"), "itemId": item_id, "kind": "maintenanceDifficulty", "expectCode": null}));
        }
    }
    actions.truncate(128);
    let case = json!({
        "caseId": "crowded",
        "items": items,
        "groups": [(0..64).map(|index| format!("item-{index}")).collect::<Vec<_>>()],
        "placements": placed,
        "actions": actions
    });
    let world = build_world(&case);
    // The log is built directly: recording re-hashes the plan once per entry,
    // which this test is not about.
    let mut log = FeedbackLog::empty();
    for row in case["actions"].as_array().unwrap() {
        let mut entry = entry_from(row);
        entry.plan_snapshot_id = Some(world.base.plan_snapshot_id.clone());
        log.entries.push(entry);
    }
    assert!(log.entries.len() > 64);
    let first = run(&world, &log, &LocationLog::empty(), 3);
    // The validator saw at most the budget, however many candidates existed,
    // and every entry still has a cause.
    assert!(first.evaluations_used <= 3);
    assert!(first.budget_exhausted || first.evaluations_used < 3);
    assert_eq!(first.causes.len(), log.entries.len());
    assert!(
        first
            .causes
            .iter()
            .any(|cause| cause.outcome == CauseOutcome::BudgetExhausted
                || cause.outcome == CauseOutcome::Applied)
    );
}
