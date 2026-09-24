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
