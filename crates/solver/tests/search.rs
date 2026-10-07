//! ZARI-004 solver integration tests: the reference engine driving the real
//! shared fixture through the resumable machine. Every accepted alternative
//! must carry a finalized snapshot that re-validates under the independent
//! boundary — the solver's own nominal checks are never evidence.

use serde_json::Value;
use zari_core::scalars::*;
use zari_core::*;
use zari_solver::SolverEngine;

/// The shared candidate fixture's project input and catalog. `wide` raises the
/// declared budgets so the full search scope completes; `false` keeps the
/// fixture's own small budget (which legitimately terminates BudgetExhausted).
fn fixture(wide: bool) -> (ProjectInput, CatalogContent) {
    let raw: Value = serde_json::from_str(include_str!(
        "../../../fixtures/domain/candidate-bounded-confirmed.json"
    ))
    .unwrap();
    let mut input: ProjectInput = serde_json::from_value(raw["input"]["input"].clone()).unwrap();
    if wide {
        input.search.budget.max_work_units = WorkCount::new(1_000_000).unwrap();
        input.search.budget.max_nodes = 16_384;
        input.search.budget.max_alternatives = 10;
    }
    let snapshot: CatalogSnapshot =
        serde_json::from_value(raw["input"]["catalog"].clone()).unwrap();
    (input, CatalogContent::from(&snapshot))
}

/// Step until a terminal event; stalls (allowance below the next op's cost)
/// surface as an assertion failure rather than a hang.
fn run(session: &mut dyn SearchSession, allowance: u32) -> SearchResult {
    let mut last: Option<SearchCounters> = None;
    loop {
        match session.step(allowance) {
            SearchStep::Completed { result } => return *result,
            SearchStep::Cancelled { .. } => panic!("unexpected cancellation"),
            SearchStep::Progress { consumed } => {
                if last.as_ref().is_some_and(|l| {
                    l.work_units == consumed.work_units && l.nodes == consumed.nodes
                }) {
                    panic!("stalled: allowance {allowance} below next op cost");
                }
                last = Some(consumed);
            }
        }
    }
}

/// Every published alternative must re-validate structurally and carry no
/// blocking validator failure — acceptance is the independent boundary's
/// decision, not the solver's.
fn assert_snapshots_valid(catalog: &CatalogContent, result: &SearchResult) {
    for snapshot in &result.alternatives {
        let diagnostics = validate::validate_snapshot(snapshot);
        assert!(
            diagnostics.is_empty(),
            "snapshot failed structural re-validation: {diagnostics:?}"
        );
        assert!(
            !validator::has_blocking_failure(&snapshot.content.validation),
            "published snapshot has a blocking failure"
        );
        let layout = CandidateLayout {
            placements: snapshot.content.placements.clone(),
            assignments: snapshot.content.assignments.clone(),
            unassigned: snapshot.content.unassigned.clone(),
            purchase_selections: snapshot.content.purchase_selections.clone(),
        };
        let structural = validate::validate_layout(
            &layout,
            &snapshot.content.input_facts,
            &catalog
                .variants
                .iter()
                .map(|v| (v.id.as_str(), v))
                .collect(),
            &catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect(),
        );
        assert!(
            structural.is_empty(),
            "snapshot layout failed structural re-validation: {structural:?}"
        );
    }
}

#[test]
fn search_completes_with_independently_valid_alternatives() {
    let (input, catalog) = fixture(true);
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), 1024);
    assert_eq!(result.termination, SearchTermination::ScopeComplete);
    assert!(
        !result.alternatives.is_empty(),
        "fixture should yield accepted alternatives; diagnostics: {:?}",
        result.diagnostic_candidates
    );
    assert!(
        result.alternatives.len() <= usize::from(input.search.budget.max_alternatives),
        "alternatives exceed the profile cap"
    );
    assert!(result.consumed.validated_candidates > 0);
    assert_snapshots_valid(&catalog, &result);
}

#[test]
fn step_partitioning_is_invariant() {
    let (input, catalog) = fixture(true);
    let engine = SolverEngine;
    let reference = {
        let mut session = engine.start(&input, &catalog);
        serde_json::to_value(run(session.as_mut(), u32::MAX)).unwrap()
    };
    // Allowances below the protocol floor (256) are legal but can starve
    // under a heavier quantum; partition invariance is asserted across the
    // operational range.
    for allowance in [1024u32, 4096, u32::MAX] {
        let mut session = engine.start(&input, &catalog);
        let result = run(session.as_mut(), allowance);
        assert_eq!(
            serde_json::to_value(&result).unwrap(),
            reference,
            "allowance {allowance} diverged"
        );
    }
}

#[test]
fn small_budget_still_reports_partial_progress_deterministically() {
    // The fixture's own budget (1000 work units) cannot cover the scope; the
    // machine must still be deterministic and honest about the exhaustion.
    let (input, catalog) = fixture(false);
    let engine = SolverEngine;
    let a = {
        let mut session = engine.start(&input, &catalog);
        serde_json::to_value(run(session.as_mut(), u32::MAX)).unwrap()
    };
    assert_eq!(a["termination"], "budgetExhausted");
    for allowance in [1024u32, u32::MAX] {
        let mut session = engine.start(&input, &catalog);
        let result = run(session.as_mut(), allowance);
        assert_eq!(serde_json::to_value(&result).unwrap(), a);
    }
}

#[test]
fn repeated_runs_are_deterministic() {
    let (input, catalog) = fixture(true);
    let engine = SolverEngine;
    let a = {
        let mut session = engine.start(&input, &catalog);
        serde_json::to_value(run(session.as_mut(), 1024)).unwrap()
    };
    let b = {
        let mut session = engine.start(&input, &catalog);
        serde_json::to_value(run(session.as_mut(), 1024)).unwrap()
    };
    assert_eq!(a, b);
}

#[test]
fn node_budget_exhaustion_is_explicit() {
    let (mut input, catalog) = fixture(true);
    input.search.budget.max_nodes = 0;
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), 1024);
    assert_eq!(result.termination, SearchTermination::BudgetExhausted);
}

#[test]
fn work_unit_budget_exhaustion_is_explicit() {
    let (mut input, catalog) = fixture(true);
    input.search.budget.max_work_units = WorkCount::new(1).unwrap();
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), 1024);
    assert_eq!(result.termination, SearchTermination::BudgetExhausted);
}

#[test]
fn cancellation_is_explicit() {
    let (input, catalog) = fixture(true);
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    session.step(8);
    session.cancel();
    match session.step(1024) {
        SearchStep::Cancelled { .. } => {}
        _ => panic!("expected Cancelled"),
    }
}

#[test]
fn alternatives_are_ranked_and_unique() {
    let (input, catalog) = fixture(true);
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), 1024);
    let ids: Vec<&str> = result
        .alternatives
        .iter()
        .map(|s| s.plan_snapshot_id.as_str())
        .collect();
    let unique: std::collections::BTreeSet<&&str> = ids.iter().collect();
    assert_eq!(ids.len(), unique.len(), "duplicate snapshot ids");
}

#[test]
fn propose_strategies_is_deterministic_and_complete() {
    let (input, _catalog) = fixture(false);
    let engine = SolverEngine;
    let a = engine.propose_strategies(&input);
    let b = engine.propose_strategies(&input);
    assert_eq!(
        serde_json::to_value(&a).unwrap(),
        serde_json::to_value(&b).unwrap()
    );
    assert_eq!(a.len(), 5);
    let strategies: Vec<Strategy> = a.iter().map(|d| d.strategy.clone()).collect();
    assert!(strategies.contains(&Strategy::MinimumPurchase));
    assert!(strategies.contains(&Strategy::OneActionAccess));
    for decision in &a {
        assert!(
            validate::validate_strategy(decision, &input).is_empty(),
            "strategy decision failed structural validation"
        );
    }
}

#[test]
fn purchase_disallowed_still_produces_direct_alternatives() {
    let (mut input, catalog) = fixture(true);
    input.constraints.purchase_allowed = false;
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), 1024);
    assert_eq!(result.termination, SearchTermination::ScopeComplete);
    assert!(
        !result.alternatives.is_empty(),
        "direct placement should still publish alternatives"
    );
    for snapshot in &result.alternatives {
        assert!(
            snapshot
                .content
                .placements
                .iter()
                .all(|p| !matches!(p.subject, PlacementSubject::NewContainer { .. })),
            "new-container placement despite purchase_disallowed"
        );
    }
    assert_snapshots_valid(&catalog, &result);
}

#[test]
fn container_option_packs_pullable_items_and_leaves_the_rest_honest() {
    let (input, catalog) = fixture(true);
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), u32::MAX);
    // item-a forbids PullContainerThenRetrieve; in the var-1 container option
    // it must surface as an explicit unassigned reason, never silently packed.
    let container_published = result.alternatives.iter().any(|s| {
        s.content
            .placements
            .iter()
            .any(|p| matches!(p.subject, PlacementSubject::NewContainer { .. }))
    });
    if container_published {
        for snapshot in &result.alternatives {
            let has_container = snapshot
                .content
                .placements
                .iter()
                .any(|p| matches!(p.subject, PlacementSubject::NewContainer { .. }));
            if !has_container {
                continue;
            }
            let item_a_unassigned = snapshot
                .content
                .unassigned
                .iter()
                .find(|u| u.item_id.as_str() == "item-a")
                .expect("item-a must be unassigned in a container plan");
            assert_eq!(
                item_a_unassigned.reason_code,
                "retrieval_mode_not_permitted"
            );
            // item-b permits pull retrieval: it must be contained, not direct.
            assert!(snapshot.content.assignments.iter().any(|a| {
                a.item_id.as_str() == "item-b"
                    && matches!(a.location, ItemLocation::Contained { .. })
            }));
        }
    }
    assert_snapshots_valid(&catalog, &result);
}

#[test]
fn empty_option_unassigned_entries_do_not_leak_into_sibling_options() {
    // Regression: an option that produces zero placeable objects routes its
    // `unassigned` emission through a bare `Advance` frame. If that frame's
    // subtree marks are not carried into the continuation, the entries outlive
    // the option and poison every later sibling option: an ordinal then appears
    // as both assigned and unassigned (`ordinal_partition_overlap`), so every
    // containerized candidate is silently rejected.
    let (mut input, catalog) = fixture(true);
    for item in &mut input.items {
        item.requirement.allowed_retrieval_modes = vec![RetrievalMode::PullContainerThenRetrieve];
    }
    // Break the fixture's atomic cluster: the two items must pack as
    // independent units so item-a can open a container alone.
    input.items[1].requirement.must_stay_together = false;
    input.items[1].requirement.mandatory_compatibility = vec![];
    // One unit of item-a: two 190×100 units could not share the 290×190
    // cavity of var-1 and the leftover would be honestly unassigned, which is
    // not what this regression isolates.
    let Fact::Known { provenance, .. } = input.items[0].quantity.clone() else {
        unreachable!("fixture quantities are known")
    };
    input.items[0].quantity = Fact::Known {
        value: Quantity::new(1).unwrap(),
        provenance,
    };
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), u32::MAX);
    assert_eq!(result.termination, SearchTermination::ScopeComplete);
    // The direct option yields zero objects (nothing permits front
    // extraction); the var-1 container option must still publish a plan that
    // packs item-a — item-b is honestly too large for the cavity.
    let containerized = result.alternatives.iter().find(|s| {
        s.content
            .placements
            .iter()
            .any(|p| matches!(p.subject, PlacementSubject::NewContainer { .. }))
    });
    let snapshot = containerized.expect(
        "a container alternative must publish; stale unassigned entries would \
         reject it via ordinal_partition_overlap",
    );
    assert!(snapshot.content.assignments.iter().any(|a| {
        a.item_id.as_str() == "item-a" && matches!(a.location, ItemLocation::Contained { .. })
    }));
    assert!(
        snapshot
            .content
            .unassigned
            .iter()
            .all(|u| u.item_id.as_str() != "item-a")
    );
    assert!(
        snapshot
            .content
            .unassigned
            .iter()
            .any(|u| u.item_id.as_str() == "item-b")
    );
    assert_snapshots_valid(&catalog, &result);
}

/// Regression: `RunEval` is priced `64 + p² + 4a` — above the 256 protocol
/// floor once ~14 items are placed. Before the fix, `step(256)` returned
/// `Progress` forever once such an op was next, stalling the host pump with
/// non-advancing progress replies. One indivisible op must always run, so a
/// sub-cost allowance still terminates.
#[test]
fn step_allowance_below_indivisible_op_cost_still_terminates() {
    let raw_form: Value = serde_json::from_str(include_str!(
        "../../../apps/web/src/features/project/default-form.json"
    ))
    .unwrap();
    let mut form: RawProjectInputDto = serde_json::from_value(raw_form).unwrap();
    let catalog_snapshot: CatalogSnapshot = serde_json::from_str(include_str!(
        "../../../apps/web/src/features/project/synthetic-catalog.json"
    ))
    .unwrap();
    form.catalog_pin = zari_core::input::CatalogPin {
        catalog_version: catalog_snapshot.catalog_version.clone(),
        catalog_digest: catalog_snapshot.catalog_digest.clone(),
    };
    let (input, diagnostics) = normalize::normalize_project_input(&form);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let catalog = CatalogContent::from(&catalog_snapshot);
    let engine = SolverEngine;
    let reference = {
        let mut session = engine.start(&input, &catalog);
        serde_json::to_value(run(session.as_mut(), u32::MAX)).unwrap()
    };
    for allowance in [256u32, 1] {
        let mut session = engine.start(&input, &catalog);
        let result = run(session.as_mut(), allowance);
        assert_eq!(
            serde_json::to_value(&result).unwrap(),
            reference,
            "allowance {allowance} diverged or stalled"
        );
    }
}

/// The bundled web demo (default form + synthetic catalog) must exercise the
/// whole slice: a purchase alternative with a real BOM, a no-purchase
/// alternative with an honestly unassigned item, and scope-complete
/// termination. `var-1`'s empty option precedes `var-2`, so this also covers
/// the sibling-option rollback path.
#[test]
fn bundled_demo_produces_container_and_no_purchase_alternatives() {
    let raw_form: Value = serde_json::from_str(include_str!(
        "../../../apps/web/src/features/project/default-form.json"
    ))
    .unwrap();
    let mut form: RawProjectInputDto = serde_json::from_value(raw_form).unwrap();
    let catalog_snapshot: CatalogSnapshot = serde_json::from_str(include_str!(
        "../../../apps/web/src/features/project/synthetic-catalog.json"
    ))
    .unwrap();
    form.catalog_pin = zari_core::input::CatalogPin {
        catalog_version: catalog_snapshot.catalog_version.clone(),
        catalog_digest: catalog_snapshot.catalog_digest.clone(),
    };
    let (input, diagnostics) = normalize::normalize_project_input(&form);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let catalog = CatalogContent::from(&catalog_snapshot);
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    let result = run(session.as_mut(), u32::MAX);
    assert_eq!(result.termination, SearchTermination::ScopeComplete);
    let purchase = result.alternatives.iter().find(|s| {
        s.content
            .placements
            .iter()
            .any(|p| matches!(p.subject, PlacementSubject::NewContainer { .. }))
    });
    let purchase = purchase.expect("the demo must surface a containerized plan");
    assert!(!purchase.content.bom.is_empty());
    assert!(purchase.content.unassigned.is_empty());
    // The no-purchase outcome is a normal alternative, not an error.
    let no_purchase = result
        .alternatives
        .iter()
        .find(|s| s.content.bom.is_empty())
        .expect("the demo must surface a no-purchase plan");
    assert!(
        no_purchase
            .content
            .unassigned
            .iter()
            .any(|u| u.item_id.as_str() == "item-b")
    );
    assert_snapshots_valid(&catalog, &result);
}

fn split_profile() -> (ProjectInput, CatalogContent) {
    let (mut input, catalog) = fixture(true);
    input.search.profile.version = 2;
    input.search.budget.max_nodes = 24;
    input.search.budget.max_work_units = WorkCount::new(200_000).unwrap();
    (input, catalog)
}

#[test]
fn split_profile_allowances_and_offer_order_match() {
    let (input, catalog) = split_profile();
    let engine = SolverEngine;
    let reference = {
        let mut session = engine.start(&input, &catalog);
        serde_json::to_value(run(session.as_mut(), 1024)).unwrap()
    };
    assert_eq!(reference["scope"]["profile"]["version"], 2);
    assert!(
        !reference["alternatives"].as_array().unwrap().is_empty(),
        "split profile published nothing"
    );
    assert_eq!(
        reference["alternatives"][0]["content"]["versions"]["solverVersion"],
        "zari-solver-v2"
    );
    for allowance in [1u32, 7, 128, 256, 1024] {
        let mut session = engine.start(&input, &catalog);
        let result = run(session.as_mut(), allowance);
        assert_eq!(
            serde_json::to_value(&result).unwrap(),
            reference,
            "allowance {allowance}"
        );
        assert_snapshots_valid(&catalog, &result);
    }
    let mut reversed = catalog.clone();
    reversed.offers.reverse();
    assert_eq!(
        catalog_digest(&catalog),
        catalog_digest(&reversed),
        "offer order is canonical"
    );
    let mut session = engine.start(&input, &reversed);
    let result = run(session.as_mut(), 7);
    assert_eq!(serde_json::to_value(&result).unwrap(), reference);
}

#[test]
fn split_profile_stops_before_the_work_budget_and_publishes_only_finished_snapshots() {
    let (mut input, catalog) = split_profile();
    // Above preparation, below the wide profile's scope, so the machine stops
    // on the work budget during evaluation. The budget is part of the snapshot
    // stamp, so this result is compared only with itself.
    input.search.budget.max_work_units = WorkCount::new(8_000).unwrap();
    let engine = SolverEngine;
    let stopped = {
        let mut session = engine.start(&input, &catalog);
        run(session.as_mut(), 1)
    };
    assert_eq!(stopped.termination, SearchTermination::BudgetExhausted);
    assert!(stopped.consumed.work_units.get() <= 8_000);
    assert_ne!(stopped.termination, SearchTermination::ScopeComplete);
    assert_ne!(stopped.termination, SearchTermination::Cancelled);
    assert_snapshots_valid(&catalog, &stopped);
    let again = {
        let mut session = engine.start(&input, &catalog);
        run(session.as_mut(), 7)
    };
    assert_eq!(
        serde_json::to_value(&again).unwrap(),
        serde_json::to_value(&stopped).unwrap()
    );
}

#[test]
fn split_profile_cancel_is_not_scope_or_budget() {
    let (input, catalog) = split_profile();
    let engine = SolverEngine;
    let mut session = engine.start(&input, &catalog);
    for _ in 0..3 {
        match session.step(1) {
            SearchStep::Progress { .. } => {}
            SearchStep::Completed { .. } | SearchStep::Cancelled { .. } => {
                panic!("expected progress before cancel")
            }
        }
    }
    session.cancel();
    match session.step(1024) {
        SearchStep::Cancelled { consumed } => {
            assert!(consumed.work_units.get() > 0);
        }
        SearchStep::Progress { .. } | SearchStep::Completed { .. } => {
            panic!("expected Cancelled")
        }
    }
}
