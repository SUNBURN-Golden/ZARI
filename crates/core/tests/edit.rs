//! ZARI-007 edit-path tests: provisional edits re-enter the trust boundary;
//! only independently validated results produce a snapshot.
use serde_json::Value;
use std::path::Path;
use zari_core::canonical::CatalogContent;
use zari_core::scalars::*;
use zari_core::*;

fn fixture(case: &str) -> Value {
    serde_json::from_str::<DomainFixture>(
        &std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../fixtures/domain")
                .join(format!("{case}.json")),
        )
        .unwrap(),
    )
    .unwrap()
    .input
}

fn setup() -> (ProjectInput, CatalogContent, PlanSnapshot) {
    let fixture = fixture("candidate-bounded-confirmed");
    let input: ProjectInput = serde_json::from_value(fixture["input"].clone()).unwrap();
    let catalog: CatalogSnapshot = serde_json::from_value(fixture["catalog"].clone()).unwrap();
    let proposal: CandidateProposal = serde_json::from_value(fixture["proposal"].clone()).unwrap();
    let catalog = CatalogContent::from(&catalog);
    let evaluation = evaluate_candidate(
        &input,
        &catalog,
        &proposal,
        versions(&input, &catalog),
        scope(&input),
    );
    let base = evaluation.snapshot.expect("base candidate finalizes");
    (input, catalog, base)
}

fn versions(input: &ProjectInput, catalog: &CatalogContent) -> CompileVersions {
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
    }
}

fn scope(input: &ProjectInput) -> SearchScope {
    SearchScope {
        profile: input.search.profile.clone(),
        budget: input.search.budget.clone(),
        group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
        restrictions: vec![],
    }
}

fn edit(
    input: &ProjectInput,
    catalog: &CatalogContent,
    base: &PlanSnapshot,
    command: LayoutEditCommand,
    source: Option<&PlanSnapshot>,
) -> CandidateEvaluation {
    evaluate_layout_edit(
        input,
        catalog,
        base,
        &command,
        source,
        versions(input, catalog),
        scope(input),
    )
}

fn position(x: i32, y: i32, z: i32) -> Vec3Mm {
    Vec3Mm {
        x: PositionMm::new(x).unwrap(),
        y: PositionMm::new(y).unwrap(),
        z: PositionMm::new(z).unwrap(),
    }
}

fn codes(diagnostics: &[Diagnostic]) -> Vec<&str> {
    diagnostics.iter().map(|d| d.code.as_str()).collect()
}

#[test]
fn permitted_move_finalizes_a_new_snapshot_with_unchanged_quantity() {
    let (input, catalog, base) = setup();
    let command = LayoutEditCommand::MovePlacement {
        placement_id: Id::new("p-b0").unwrap(),
        position: position(8, 150, 0),
    };
    let evaluation = edit(&input, &catalog, &base, command.clone(), None);
    let next = evaluation.snapshot.expect("permitted move finalizes");
    assert_ne!(next.plan_snapshot_id, base.plan_snapshot_id);
    assert_eq!(next.content.creation, PlanCreation::ManualEdit);
    assert_eq!(
        next.content.versions.input_digest,
        base.content.versions.input_digest
    );
    // Quantity evidence is conserved: assignments, unassigned and BOM carry
    // the same physical truth; only the placement position changed.
    assert_eq!(next.content.assignments, base.content.assignments);
    assert_eq!(next.content.unassigned, base.content.unassigned);
    assert_eq!(next.content.bom, base.content.bom);
    let moved = next
        .content
        .placements
        .iter()
        .find(|p| p.id.as_str() == "p-b0")
        .unwrap();
    assert_eq!(moved.position.x.get(), 8);
    assert_eq!(moved.position.y.get(), 150);
}

#[test]
fn out_of_bounds_move_is_rejected_with_an_explained_check() {
    let (input, catalog, base) = setup();
    let evaluation = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::MovePlacement {
            placement_id: Id::new("p-b0").unwrap(),
            position: position(500, 0, 0),
        },
        None,
    );
    // A blocking known failure keeps the provisional result unverified: no
    // snapshot is published and the report explains the rejection.
    assert!(evaluation.snapshot.is_none());
    let report = evaluation
        .report
        .expect("rejected edits still carry checks");
    assert!(validator::has_blocking_failure(&report));
    assert!(
        report.checks.iter().any(|c| c.status == CheckStatus::Fail),
        "{report:?}"
    );
}

#[test]
fn forbidden_rotation_is_rejected_and_permitted_rotation_commits() {
    let (input, catalog, base) = setup();
    // item-a allows only upright0.
    let rejected = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::RotatePlacement {
            placement_id: Id::new("p-a0").unwrap(),
            orientation: Orientation::Upright90,
        },
        None,
    );
    assert!(rejected.snapshot.is_none());
    let report = rejected.report.unwrap();
    assert!(validator::has_blocking_failure(&report));
    // item-b allows upright90; the rotation revalidates and finalizes.
    let committed = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::RotatePlacement {
            placement_id: Id::new("p-b0").unwrap(),
            orientation: Orientation::Upright90,
        },
        None,
    );
    let snapshot = committed.snapshot.expect("permitted rotation finalizes");
    assert_eq!(
        snapshot
            .content
            .placements
            .iter()
            .find(|p| p.id.as_str() == "p-b0")
            .unwrap()
            .orientation,
        Orientation::Upright90
    );
}

#[test]
fn restore_layout_revalidates_the_source_and_rebinds_identity() {
    let (input, catalog, base) = setup();
    let moved = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::MovePlacement {
            placement_id: Id::new("p-b0").unwrap(),
            position: position(8, 150, 0),
        },
        None,
    )
    .snapshot
    .unwrap();
    // Undo restores the prior layout as a *new* snapshot — the old identity is
    // never revived.
    let restored = edit(
        &input,
        &catalog,
        &moved,
        LayoutEditCommand::RestoreLayout {
            source_snapshot_id: base.plan_snapshot_id.clone(),
        },
        Some(&base),
    );
    let snapshot = restored.snapshot.expect("restore finalizes");
    assert_ne!(snapshot.plan_snapshot_id, base.plan_snapshot_id);
    assert_ne!(snapshot.plan_snapshot_id, moved.plan_snapshot_id);
    assert_eq!(snapshot.content.placements, base.content.placements);
    assert_eq!(snapshot.content.assignments, base.content.assignments);
}

#[test]
fn tampered_or_out_of_scope_bases_are_refused() {
    let (input, catalog, base) = setup();
    let command = LayoutEditCommand::MovePlacement {
        placement_id: Id::new("p-b0").unwrap(),
        position: position(8, 0, 0),
    };
    // Claimed id does not match content.
    let mut tampered = base.clone();
    tampered.plan_snapshot_id =
        Digest::new("0000000000000000000000000000000000000000000000000000000000000000").unwrap();
    let evaluation = edit(&input, &catalog, &tampered, command.clone(), None);
    assert!(evaluation.snapshot.is_none());
    assert!(codes(&evaluation.diagnostics).contains(&"digest_mismatch"));

    // A snapshot stamped under different input cannot be an edit base.
    let mut stale = base.clone();
    stale.content.versions.input_digest =
        Digest::new("1111111111111111111111111111111111111111111111111111111111111111").unwrap();
    stale.plan_snapshot_id = canonical::snapshot_digest(&stale.content);
    let evaluation = edit(&input, &catalog, &stale, command, None);
    assert!(evaluation.snapshot.is_none());
    assert!(
        codes(&evaluation.diagnostics).contains(&"edit_base_not_in_scope"),
        "{:?}",
        evaluation.diagnostics
    );
}

#[test]
fn command_level_rejections_carry_codes() {
    let (input, catalog, base) = setup();
    let evaluation = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::MovePlacement {
            placement_id: Id::new("ghost").unwrap(),
            position: position(0, 0, 0),
        },
        None,
    );
    assert!(evaluation.snapshot.is_none());
    assert!(codes(&evaluation.diagnostics).contains(&"unknown_placement"));

    // ReplaceVariant on a direct-item placement is not applicable.
    let evaluation = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::ReplaceVariant {
            placement_id: Id::new("p-a0").unwrap(),
            variant_id: Id::new("var-1").unwrap(),
            offer_id: None,
        },
        None,
    );
    assert!(evaluation.snapshot.is_none());
    assert!(
        codes(&evaluation.diagnostics).contains(&"edit_command_not_applicable"),
        "{:?}",
        evaluation.diagnostics
    );

    // Restore without the referenced source bytes cannot resolve.
    let evaluation = edit(
        &input,
        &catalog,
        &base,
        LayoutEditCommand::RestoreLayout {
            source_snapshot_id: base.plan_snapshot_id.clone(),
        },
        None,
    );
    assert!(evaluation.snapshot.is_none());
    assert!(codes(&evaluation.diagnostics).contains(&"edit_source_required"));
}
