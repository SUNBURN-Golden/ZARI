//! ZARI-003 independent-oracle tests for the candidate trust boundary.
//! Oracles here are small independent recomputations (naive interval
//! arithmetic, manual ordinal counting, digest recomputation), not calls to
//! the production predicates under test.
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::{fs, path::Path};
use zari_core::scalars::*;
use zari_core::*;

fn fixture_json(case: &str) -> Value {
    serde_json::from_str::<DomainFixture>(
        &fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../fixtures/domain")
                .join(format!("{case}.json")),
        )
        .unwrap(),
    )
    .unwrap()
    .input
}
fn input() -> ProjectInput {
    let mut input: ProjectInput =
        serde_json::from_value(fixture_json("record-input-verified")["input"].clone()).unwrap();
    let catalog = catalog();
    input.catalog_pin = CatalogPin {
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: catalog.catalog_digest.clone(),
    };
    // Staging covers the pull-out region in front of the opening plane.
    input.space.staging.free_volume.min_y = Fact::Known {
        value: MeasuredOffset {
            nominal: PositionMm::new(-400).unwrap(),
            uncertainty: Uncertainty::Unknown {},
        },
        provenance: provenance(),
    };
    input
}
fn catalog() -> CatalogSnapshot {
    serde_json::from_value(fixture_json("record-catalog-verified")["catalog"].clone()).unwrap()
}
fn catalog_content() -> CatalogContent {
    CatalogContent::from(&catalog())
}
fn provenance() -> Provenance {
    Provenance {
        origin: MeasurementOrigin::UserDeclared,
        verification: VerificationStatus::Unverified,
        evidence_ids: vec![],
        rule_ids: vec![],
        input_refs: vec![],
        observed_at: None,
    }
}
/// Flip every `{nominal, uncertainty: unknown}` measurement to ±0 bounded so
/// conservative evidence becomes computable in tests.
fn bound_all_uncertainty(value: &mut Value) {
    match value {
        Value::Object(map) => {
            if map.contains_key("nominal")
                && let Some(Value::Object(u)) = map.get_mut("uncertainty")
                && u.get("state").and_then(Value::as_str) == Some("unknown")
            {
                *u = json!({"state":"bounded","minusMm":0,"plusMm":0})
                    .as_object()
                    .unwrap()
                    .clone();
            }
            for v in map.values_mut() {
                bound_all_uncertainty(v);
            }
        }
        Value::Array(items) => {
            for v in items {
                bound_all_uncertainty(v);
            }
        }
        _ => {}
    }
}
fn bounded_input() -> ProjectInput {
    let mut raw = fixture_json("record-input-verified")["input"].clone();
    bound_all_uncertainty(&mut raw);
    let mut input: ProjectInput = serde_json::from_value(raw).unwrap();
    let catalog = catalog();
    input.catalog_pin = CatalogPin {
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: catalog.catalog_digest.clone(),
    };
    input.space.staging.free_volume.min_y = Fact::Known {
        value: MeasuredOffset {
            nominal: PositionMm::new(-400).unwrap(),
            uncertainty: Uncertainty::Bounded {
                minus_mm: ClearanceMm::new(0).unwrap(),
                plus_mm: ClearanceMm::new(0).unwrap(),
            },
        },
        provenance: provenance(),
    };
    input
}
fn strategy() -> StrategyDecision {
    StrategyDecision {
        strategy: Strategy::MinimumPurchase,
        rule_ids: vec![],
        fact_refs: vec![],
        groups: vec![],
        zones: vec![],
        priorities: vec![],
        reasons: vec![],
        assumptions: vec![],
    }
}
fn propose(layout: CandidateLayout) -> CandidateProposal {
    CandidateProposal {
        layout,
        strategy: strategy(),
        creation: PlanCreation::ReferenceSearch,
    }
}
fn pos(x: i32, y: i32, z: i32) -> Vec3Mm {
    Vec3Mm {
        x: PositionMm::new(x).unwrap(),
        y: PositionMm::new(y).unwrap(),
        z: PositionMm::new(z).unwrap(),
    }
}
fn direct(pid: &str, item: &str, ordinal: u32, x: i32, y: i32) -> Placement {
    Placement {
        id: Id::new(pid).unwrap(),
        subject: PlacementSubject::DirectItem {
            item_id: Id::new(item).unwrap(),
            unit_ordinal: ordinal,
        },
        parent: ParentRef::Space {
            space_id: Id::new("space-1").unwrap(),
        },
        position: pos(x, y, 0),
        orientation: Orientation::Upright0,
        support_id: Id::new("floor-1").unwrap(),
    }
}
fn assign_direct(item: &str, ordinal: u32, pid: &str) -> ItemAssignment {
    ItemAssignment {
        item_id: Id::new(item).unwrap(),
        unit_ordinal: ordinal,
        location: ItemLocation::Direct {
            placement_id: Id::new(pid).unwrap(),
        },
    }
}
fn unassigned(item: &str, ranges: &[(u32, u32)]) -> Unassigned {
    Unassigned {
        item_id: Id::new(item).unwrap(),
        instances: UnassignedInstances::Known {
            ranges: ranges
                .iter()
                .map(|(s, e)| OrdinalRange {
                    start: *s,
                    end_exclusive: *e,
                })
                .collect(),
        },
        reason_code: "no-space".into(),
    }
}
fn check<'a>(report: &'a ValidationReport, id: &str) -> &'a ConstraintCheck {
    report
        .checks
        .iter()
        .find(|c| c.id.as_str() == id)
        .unwrap_or_else(|| panic!("missing check {id}"))
}

/// Independent oracle: naive AABB fit against nominal facts only.
fn oracle_fits(x: i64, y: i64, w: i64, d: i64, h: i64, input: &ProjectInput) -> bool {
    let iw = input.space.interior.width.value().unwrap().nominal.get() as i64;
    let id = input.space.interior.depth.value().unwrap().nominal.get() as i64;
    let ih = input.space.interior.height.value().unwrap().nominal.get() as i64;
    let cl = input.space.clearances.left.value().unwrap().get() as i64;
    let cr = input.space.clearances.right.value().unwrap().get() as i64;
    let ct = input.space.clearances.top.value().unwrap().get() as i64;
    x >= cl && y >= 0 && x + w <= iw - cr && y + d <= id && h <= ih - ct
}

#[test]
fn nominal_containment_matches_independent_oracle() {
    let input = input();
    let catalog = catalog_content();
    // item-a envelope 190x100x80, handling margins do not enter containment.
    for x in [0, 1, 4, 5, 6, 100, 400, 405, 410] {
        let layout = CandidateLayout {
            placements: vec![direct("p-a0", "item-a", 0, x, 0)],
            assignments: vec![assign_direct("item-a", 0, "p-a0")],
            unassigned: vec![
                unassigned("item-a", &[(1, 2)]),
                unassigned("item-b", &[(0, 1)]),
            ],
            purchase_selections: vec![],
        };
        let report = validate_candidate(&input, &catalog, &layout).report;
        let expected = if oracle_fits(x as i64, 0, 190, 100, 80, &input) {
            CheckStatus::Pass
        } else {
            CheckStatus::Fail
        };
        assert_eq!(check(&report, "chk:og:p-a0:n").status, expected, "x={x}");
    }
}

#[test]
fn quantity_partition_matches_independent_count() {
    let input = input();
    let catalog = catalog_content();
    let layout = CandidateLayout {
        placements: vec![
            direct("p-b0", "item-b", 0, 5, 0),
            direct("p-a0", "item-a", 0, 310, 0),
        ],
        assignments: vec![
            assign_direct("item-b", 0, "p-b0"),
            assign_direct("item-a", 0, "p-a0"),
        ],
        unassigned: vec![unassigned("item-a", &[(1, 2)])],
        purchase_selections: vec![],
    };
    let report = validate_candidate(&input, &catalog, &layout).report;
    // Independent oracle: count ordinals per bucket by hand.
    let (mut assigned, mut unassigned_count) = (0u32, 0u32);
    for a in &layout.assignments {
        if !matches!(a.location, ItemLocation::ProvisionalContainer { .. }) {
            assigned += 1;
        }
    }
    for u in &layout.unassigned {
        if let UnassignedInstances::Known { ranges } = &u.instances {
            for r in ranges {
                unassigned_count += r.end_exclusive - r.start;
            }
        }
    }
    let c = &report.assignment_completeness;
    assert_eq!(c.assigned_instances.get(), assigned);
    assert_eq!(c.unassigned_instances.get(), unassigned_count);
    assert_eq!(c.provisional_instances.get(), 0);
    // Every item's ordinals are covered exactly once.
    for item in &input.items {
        let total = item.quantity.value().unwrap().get();
        let covered = layout
            .assignments
            .iter()
            .filter(|a| a.item_id == item.id)
            .count() as u32
            + layout
                .unassigned
                .iter()
                .filter(|u| u.item_id == item.id)
                .map(|u| match &u.instances {
                    UnassignedInstances::Known { ranges } => ranges
                        .iter()
                        .map(|r| r.end_exclusive - r.start)
                        .sum::<u32>(),
                    UnassignedInstances::UnknownQuantity {} => 0,
                })
                .sum::<u32>();
        assert_eq!(covered, total, "item {}", item.id.as_str());
    }
}

#[test]
fn install_order_is_derived_not_trusted() {
    // Bounded facts make the conservative sweep provable; p-deep's transit
    // envelope crosses p-front's final volume, so p-deep must be installed
    // while the front region is still empty — regardless of proposal order.
    let input = bounded_input();
    let catalog = catalog_content();
    // p-deep sits behind p-front; its insertion sweep crosses p-front's final
    // volume, so the only supported order installs p-deep first.
    let layout = CandidateLayout {
        placements: vec![
            direct("p-deep", "item-a", 0, 5, 105),
            direct("p-front", "item-a", 1, 5, 0),
        ],
        assignments: vec![
            assign_direct("item-a", 0, "p-deep"),
            assign_direct("item-a", 1, "p-front"),
        ],
        unassigned: vec![unassigned("item-b", &[(0, 1)])],
        purchase_selections: vec![],
    };
    let validation = validate_candidate(&input, &catalog, &layout);
    let order: Vec<&str> = validation
        .install_order
        .iter()
        .map(|i| i.as_str())
        .collect();
    assert_eq!(order, ["p-deep", "p-front"]);
    assert!(
        validation
            .predecessors
            .get("p-front")
            .is_some_and(|p| p.contains("p-deep"))
    );
}

#[test]
fn snapshot_identity_is_content_derived_and_verifies() {
    let input = input();
    let catalog = catalog_content();
    let layout = CandidateLayout {
        placements: vec![direct("p-a0", "item-a", 0, 5, 0)],
        assignments: vec![assign_direct("item-a", 0, "p-a0")],
        unassigned: vec![
            unassigned("item-a", &[(1, 2)]),
            unassigned("item-b", &[(0, 1)]),
        ],
        purchase_selections: vec![],
    };
    let versions = CompileVersions {
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        input_digest: canonical::input_digest(&input),
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(&catalog),
        rule_version: canonical::RULE_VERSION.into(),
        solver_version: canonical::SOLVER_VERSION.into(),
        search_profile: input.search.profile.clone(),
        search_budget: input.search.budget.clone(),
        seed: input.search.seed.clone(),
    };
    let scope = SearchScope {
        profile: input.search.profile.clone(),
        budget: input.search.budget.clone(),
        group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
        restrictions: vec![],
    };
    let eval = evaluate_candidate(
        &input,
        &catalog,
        &propose(layout.clone()),
        versions.clone(),
        scope.clone(),
    );
    let snapshot = eval.snapshot.expect("conditional candidate publishes");
    // Identity is derived from content, never supplied by the caller.
    assert_eq!(
        snapshot.plan_snapshot_id,
        canonical::snapshot_digest(&snapshot.content)
    );
    assert!(validate::validate_snapshot(&snapshot).is_empty());
    // The same content re-verifies through the durable-record boundary.
    let record = VerifiableRecordDto::Snapshot {
        snapshot: snapshot.clone(),
    };
    let json = serde_json::to_value(&record).unwrap();
    let decoded: VerifiableRecordDto = serde_json::from_value(json).unwrap();
    let VerifiableRecordDto::Snapshot { snapshot: again } = decoded else {
        unreachable!()
    };
    assert_eq!(again.plan_snapshot_id, snapshot.plan_snapshot_id);
    // A different proposal must not collide with this identity.
    let mut moved = layout;
    moved.placements[0].position = pos(6, 0, 0);
    let eval2 = evaluate_candidate(&input, &catalog, &propose(moved), versions, scope);
    assert_ne!(
        eval2.snapshot.unwrap().plan_snapshot_id,
        snapshot.plan_snapshot_id
    );
}

#[test]
fn unknown_uncertainty_stays_conditional_never_pass() {
    let input = input();
    let catalog = catalog_content();
    let layout = CandidateLayout {
        placements: vec![direct("p-a0", "item-a", 0, 5, 0)],
        assignments: vec![assign_direct("item-a", 0, "p-a0")],
        unassigned: vec![
            unassigned("item-a", &[(1, 2)]),
            unassigned("item-b", &[(0, 1)]),
        ],
        purchase_selections: vec![],
    };
    let report = validate_candidate(&input, &catalog, &layout).report;
    // Every geometric conservative check is unknown: unbounded measurement
    // uncertainty can never be promoted into a conservative pass.
    for c in &report.checks {
        if c.basis == CheckBasis::Conservative {
            assert_ne!(
                c.status,
                CheckStatus::Pass,
                "{} must not pass conservatively on unknown uncertainty",
                c.id.as_str()
            );
        }
    }
    assert_eq!(report.physical_assurance, PhysicalAssurance::Conditional);
    assert!(!has_blocking_failure(&report));
}

#[test]
fn forged_blocker_cycle_is_rejected_not_trusted() {
    // hardOneActionAccess with an unavoidable pull-out blocker must fail, not
    // degrade to a conditional pass on the caller's say-so.
    let mut input = input();
    input.constraints.hard_one_action_access = true;
    let catalog = catalog_content();
    let layout = CandidateLayout {
        placements: vec![
            direct("p-front", "item-a", 0, 5, 0),
            direct("p-deep", "item-a", 1, 5, 105),
        ],
        assignments: vec![
            assign_direct("item-a", 0, "p-front"),
            assign_direct("item-a", 1, "p-deep"),
        ],
        unassigned: vec![unassigned("item-b", &[(0, 1)])],
        purchase_selections: vec![],
    };
    let report = validate_candidate(&input, &catalog, &layout).report;
    assert_eq!(check(&report, "chk:oa:p-deep:n").status, CheckStatus::Fail);
    assert!(has_blocking_failure(&report));
}

#[test]
fn bom_pack_arithmetic_uses_checked_independent_math() {
    let input = contained_input();
    let catalog = catalog_content();
    let layout = CandidateLayout {
        placements: vec![Placement {
            id: Id::new("p-c1").unwrap(),
            subject: PlacementSubject::NewContainer {
                variant_id: Id::new("var-1").unwrap(),
                unit_ordinal: 0,
            },
            parent: ParentRef::Space {
                space_id: Id::new("space-1").unwrap(),
            },
            position: pos(5, 0, 0),
            orientation: Orientation::Upright0,
            support_id: Id::new("floor-1").unwrap(),
        }],
        assignments: vec![ItemAssignment {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
            location: ItemLocation::Contained {
                container_placement_id: Id::new("p-c1").unwrap(),
                local_placement: ItemPlacement {
                    position: pos(5, 5, 10),
                    orientation: Orientation::Upright0,
                    support_id: Id::new("cavity-floor-1").unwrap(),
                },
            },
        }],
        unassigned: vec![
            unassigned("item-a", &[(1, 2)]),
            unassigned("item-b", &[(0, 1)]),
        ],
        purchase_selections: vec![PurchaseSelection {
            placement_id: Id::new("p-c1").unwrap(),
            offer: OfferSelection::Selected {
                offer_id: Id::new("offer-1").unwrap(),
            },
        }],
    };
    let versions = CompileVersions {
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        input_digest: canonical::input_digest(&input),
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(&catalog),
        rule_version: canonical::RULE_VERSION.into(),
        solver_version: canonical::SOLVER_VERSION.into(),
        search_profile: input.search.profile.clone(),
        search_budget: input.search.budget.clone(),
        seed: input.search.seed.clone(),
    };
    let scope = SearchScope {
        profile: input.search.profile.clone(),
        budget: input.search.budget.clone(),
        group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
        restrictions: vec![],
    };
    let eval = evaluate_candidate(&input, &catalog, &propose(layout), versions, scope);
    let snapshot = eval.snapshot.expect("conditional publishes");
    let line = snapshot
        .content
        .bom
        .iter()
        .find(|l| l.id.as_str() == "bom:new:var-1")
        .unwrap();
    // Independent oracle: needed=1, pack=4 → 1 pack, 4 supplied, 3 surplus,
    // 12000 KRW with free shipping.
    assert_eq!(line.physical_needed.get(), 1);
    assert_eq!(line.packs_to_order.value().unwrap().get(), 1);
    assert_eq!(line.supplied.value().unwrap().get(), 4);
    assert_eq!(line.surplus.value().unwrap().get(), 3);
    assert_eq!(line.product_subtotal.value().unwrap().get(), 12_000);
    assert_eq!(
        snapshot
            .content
            .cost_summary
            .grand_total
            .value()
            .unwrap()
            .get(),
        12_000
    );
    // Loaded outside, then installed. The transfer does not wait on its install.
    let actions = &snapshot.content.actions;
    let install = actions
        .iter()
        .find(|a| a.id.as_str() == "act:install:p-c1")
        .unwrap();
    let transfer = actions
        .iter()
        .find(|a| a.id.as_str() == "act:transfer:item-a:0")
        .unwrap();
    assert!(install.prerequisite_step_ids.contains(&transfer.id));
    assert!(
        !transfer
            .prerequisite_step_ids
            .iter()
            .any(|id| id.as_str().starts_with("act:install:"))
    );
    let acquire = actions
        .iter()
        .find(|a| a.id.as_str() == "act:acquire:var-1")
        .unwrap();
    let arrive = actions
        .iter()
        .find(|a| a.id.as_str() == "act:arrive:var-1")
        .unwrap();
    assert!(arrive.prerequisite_step_ids.contains(&acquire.id));
    assert!(install.prerequisite_step_ids.contains(&arrive.id));
    // Acyclic: the independent Kahn check inside snapshot validation passes.
    assert!(validate::validate_snapshot(&snapshot).is_empty());
}

fn contained_input() -> ProjectInput {
    let mut input = input();
    let item_a = input
        .items
        .iter_mut()
        .find(|i| i.id.as_str() == "item-a")
        .unwrap();
    item_a
        .requirement
        .allowed_retrieval_modes
        .push(RetrievalMode::PullContainerThenRetrieve);
    let item_b = input
        .items
        .iter_mut()
        .find(|i| i.id.as_str() == "item-b")
        .unwrap();
    item_b.requirement.must_stay_together = false;
    item_b.requirement.mandatory_compatibility = vec![];
    input.groups[0].split_policy = GroupSplitPolicy::AllowMultipleTargets;
    input
}

#[test]
fn protocol_rejects_candidate_without_project_context() {
    let mut runtime = Runtime::new();
    let meta = |request_id: &str| {
        json!({"protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
            "projectActivationId":"system","requestId":request_id,
            "projectId":"system","editorEpoch":"0","inputRevision":"0","contextId":null})
    };
    runtime.handle_json(
        &json!({"meta":meta("init"),"command":{"kind":"initialize","buildId":BUILD_ID,
            "expectedProtocolVersion":1,"expectedSchemaVersion":1}})
        .to_string(),
    );
    // Bootstrap activation leaves no project input: validateCandidate must fail.
    runtime.handle_json(
        &json!({"meta":{
            "protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
            "projectActivationId":"act-1","requestId":"act",
            "projectId":"p-1","editorEpoch":"0","inputRevision":"0","contextId":null},
            "command":{"kind":"activateProject","context":{"kind":"bootstrap"}}})
        .to_string(),
    );
    let proposal = propose(CandidateLayout {
        placements: vec![],
        assignments: vec![],
        unassigned: vec![],
        purchase_selections: vec![],
    });
    let out = runtime.handle_json(
        &json!({"meta":{
            "protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
            "projectActivationId":"act-1","requestId":"op",
            "projectId":"p-1","editorEpoch":"0","inputRevision":"0","contextId":null},
            "command":{"kind":"validateCandidate","proposal":proposal}})
        .to_string(),
    );
    assert!(out.contains("invalid_state"), "{out}");
}

/// One new-container placement bound to offer-1: 1 pack × 12000 KRW, free
/// shipping — the same purchase shape as the BOM oracle test.
fn purchase_layout() -> CandidateLayout {
    CandidateLayout {
        placements: vec![Placement {
            id: Id::new("p-c1").unwrap(),
            subject: PlacementSubject::NewContainer {
                variant_id: Id::new("var-1").unwrap(),
                unit_ordinal: 0,
            },
            parent: ParentRef::Space {
                space_id: Id::new("space-1").unwrap(),
            },
            position: pos(5, 0, 0),
            orientation: Orientation::Upright0,
            support_id: Id::new("floor-1").unwrap(),
        }],
        assignments: vec![ItemAssignment {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
            location: ItemLocation::Contained {
                container_placement_id: Id::new("p-c1").unwrap(),
                local_placement: ItemPlacement {
                    position: pos(5, 5, 10),
                    orientation: Orientation::Upright0,
                    support_id: Id::new("cavity-floor-1").unwrap(),
                },
            },
        }],
        unassigned: vec![
            unassigned("item-a", &[(1, 2)]),
            unassigned("item-b", &[(0, 1)]),
        ],
        purchase_selections: vec![PurchaseSelection {
            placement_id: Id::new("p-c1").unwrap(),
            offer: OfferSelection::Selected {
                offer_id: Id::new("offer-1").unwrap(),
            },
        }],
    }
}
fn money(value: u64) -> Fact<MoneyKrw> {
    Fact::Known {
        value: MoneyKrw::new(value).unwrap(),
        provenance: provenance(),
    }
}
fn versions_scope(
    input: &ProjectInput,
    catalog: &CatalogContent,
) -> (CompileVersions, SearchScope) {
    (
        CompileVersions {
            schema_version: canonical::SCHEMA_VERSION,
            canonical_version: canonical::CANONICAL_VERSION,
            input_digest: canonical::input_digest(input),
            catalog_version: catalog.catalog_version.clone(),
            catalog_digest: canonical::catalog_digest(catalog),
            rule_version: canonical::RULE_VERSION.into(),
            solver_version: canonical::SOLVER_VERSION.into(),
            search_profile: input.search.profile.clone(),
            search_budget: input.search.budget.clone(),
            seed: input.search.seed.clone(),
        },
        SearchScope {
            profile: input.search.profile.clone(),
            budget: input.search.budget.clone(),
            group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
            restrictions: vec![],
        },
    )
}

#[test]
fn soft_budget_fail_is_advisory_and_still_publishes() {
    // ZARI-003 N1: SOLVER.md § commercial defines only the hard budget as a
    // reject; the soft budget is a declared preference, so its Fail is
    // reported but must never veto PlanSnapshot publication.
    let mut input = contained_input();
    input.constraints.hard_budget = money(100_000);
    input.constraints.soft_budget = money(5_000);
    let catalog = catalog_content();
    let layout = purchase_layout();
    let report = validate_candidate(&input, &catalog, &layout).report;
    let soft = check(&report, "chk:bg:soft");
    assert_eq!(soft.status, CheckStatus::Fail);
    assert_eq!(soft.reason_code, "soft_budget_exceeded");
    assert!(!soft.blocking, "soft budget fail is advisory");
    assert_eq!(check(&report, "chk:bg:hard").status, CheckStatus::Pass);
    assert!(!has_blocking_failure(&report));
    // A preference miss keeps commerce conditional; it is not promoted to
    // ready and not silently dropped from the report.
    assert_eq!(report.commerce_readiness, CommerceReadiness::Conditional);
    let (versions, scope) = versions_scope(&input, &catalog);
    let eval = evaluate_candidate(&input, &catalog, &propose(layout), versions, scope);
    assert!(eval.snapshot.is_some(), "{:?}", eval.diagnostics);
}

#[test]
fn hard_budget_fail_still_blocks_snapshot() {
    let mut input = contained_input();
    input.constraints.hard_budget = money(5_000);
    let catalog = catalog_content();
    let layout = purchase_layout();
    let report = validate_candidate(&input, &catalog, &layout).report;
    let hard = check(&report, "chk:bg:hard");
    assert_eq!(hard.status, CheckStatus::Fail);
    assert_eq!(hard.reason_code, "hard_budget_exceeded");
    assert!(hard.blocking);
    assert!(has_blocking_failure(&report));
    let (versions, scope) = versions_scope(&input, &catalog);
    let eval = evaluate_candidate(&input, &catalog, &propose(layout), versions, scope);
    assert!(eval.report.is_some());
    assert!(eval.snapshot.is_none());
}

#[test]
fn malicious_proposal_shapes_fail_closed() {
    // Proposals are rechecked from facts; nothing on the wire asserts pass.
    let input = input();
    let catalog = catalog_content();
    let variants: BTreeMap<&str, &ProductVariant> = catalog
        .variants
        .iter()
        .map(|v| (v.id.as_str(), v))
        .collect();
    let offers: BTreeMap<&str, &Offer> =
        catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect();
    // A placement beyond the scalar bounds cannot even decode.
    let bad = json!({"layout":{"placements":[{"id":"p","subject":{"kind":"directItem","itemId":"item-a","unitOrdinal":0},"parent":{"kind":"space","spaceId":"space-1"},"position":{"x":99999,"y":0,"z":0},"orientation":"upright0","supportId":"floor-1"}],"assignments":[],"unassigned":[],"purchaseSelections":[]},"strategy":{"strategy":"minimumPurchase","ruleIds":[],"factRefs":[],"groups":[],"zones":[],"priorities":[],"reasons":[],"assumptions":[]},"creation":"referenceSearch"});
    assert!(serde_json::from_value::<CandidateProposal>(bad).is_err());
    // A duplicate placement id is a structural diagnostic, never a candidate.
    let mut layout = CandidateLayout {
        placements: vec![
            direct("p-a0", "item-a", 0, 5, 0),
            direct("p-a0", "item-a", 1, 310, 0),
        ],
        assignments: vec![],
        unassigned: vec![
            unassigned("item-a", &[(0, 2)]),
            unassigned("item-b", &[(0, 1)]),
        ],
        purchase_selections: vec![],
    };
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(found.iter().any(|d| d.code == "duplicate_id"), "{found:?}");
    // A duplicate assignment identity likewise.
    layout.placements.pop();
    layout.assignments = vec![
        assign_direct("item-a", 0, "p-a0"),
        assign_direct("item-a", 0, "p-a0"),
    ];
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(
        found.iter().any(|d| d.code == "duplicate_assignment"),
        "{found:?}"
    );
}
