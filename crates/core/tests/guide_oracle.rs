//! SP-013 guide compared with the hand-written PC-01–04 oracles.
//! The expected graphs are the oracle files. This test does not write them.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use zari_core::scalars::*;
use zari_core::*;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn oracle(name: &str) -> Value {
    serde_json::from_str(
        &fs::read_to_string(root().join("docs/oracles/product-completion").join(name)).unwrap(),
    )
    .unwrap()
}

fn id(raw: &str) -> Id {
    Id::new(raw).unwrap()
}

fn placement(pid: &str, subject: PlacementSubject) -> Placement {
    Placement {
        id: id(pid),
        subject,
        parent: ParentRef::Space {
            space_id: id("space-1"),
        },
        position: Vec3Mm {
            x: PositionMm::new(0).unwrap(),
            y: PositionMm::new(0).unwrap(),
            z: PositionMm::new(0).unwrap(),
        },
        orientation: Orientation::Upright0,
        support_id: id("floor-1"),
    }
}

fn contained(item: &str, ordinal: u32, container: &str) -> ItemAssignment {
    ItemAssignment {
        item_id: id(item),
        unit_ordinal: ordinal,
        location: ItemLocation::Contained {
            container_placement_id: id(container),
            local_placement: ItemPlacement {
                position: Vec3Mm {
                    x: PositionMm::new(0).unwrap(),
                    y: PositionMm::new(0).unwrap(),
                    z: PositionMm::new(0).unwrap(),
                },
                orientation: Orientation::Upright0,
                support_id: id("floor-1"),
            },
        },
    }
}

fn check(raw: &str, kind: CheckKind, reason: &str, subjects: &[&str]) -> ConstraintCheck {
    ConstraintCheck {
        id: id(raw),
        kind,
        subject_ids: subjects.iter().copied().map(id).collect(),
        status: CheckStatus::Unknown,
        reason_code: reason.into(),
        basis: CheckBasis::Conservative,
        evidence_refs: vec![],
        measurements: vec![],
        blocking: true,
        remediation: vec![],
    }
}

fn validation(
    checks: Vec<ConstraintCheck>,
    order: &[&str],
    preds: &[(&str, &[&str])],
) -> CandidateValidation {
    let mut predecessors = BTreeMap::new();
    for (placement, before) in preds {
        predecessors.insert(
            (*placement).to_owned(),
            before.iter().copied().map(str::to_owned).collect(),
        );
    }
    CandidateValidation {
        report: ValidationReport {
            checks,
            physical_assurance: PhysicalAssurance::Conditional,
            assignment_completeness: AssignmentCompleteness {
                assigned_instances: UnitCount::new(0).unwrap(),
                provisional_instances: UnitCount::new(0).unwrap(),
                unassigned_instances: UnitCount::new(0).unwrap(),
                unknown_quantity_items: UnitCount::new(0).unwrap(),
            },
            commerce_readiness: CommerceReadiness::NotApplicable,
        },
        install_order: order.iter().copied().map(id).collect(),
        predecessors,
    }
}

fn edges(actions: &[ActionStep]) -> BTreeMap<String, Vec<String>> {
    actions
        .iter()
        .map(|action| {
            (
                action.id.as_str().to_owned(),
                action
                    .prerequisite_step_ids
                    .iter()
                    .map(|item| item.as_str().to_owned())
                    .collect(),
            )
        })
        .collect()
}

fn oracle_edges(value: &Value) -> BTreeMap<String, Vec<String>> {
    value["actions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|step| {
            (
                step["id"].as_str().unwrap().to_owned(),
                step["prerequisiteStepIds"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|item| item.as_str().unwrap().to_owned())
                    .collect(),
            )
        })
        .collect()
}

fn oracle_order(value: &Value) -> Vec<String> {
    value["displayOrder"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item.as_str().unwrap().to_owned())
        .collect()
}

fn produced_order(actions: &[ActionStep]) -> Vec<String> {
    actions
        .iter()
        .map(|action| action.id.as_str().to_owned())
        .collect()
}

#[test]
fn pc01_direct_guide_matches_the_hand_oracle() {
    let case = oracle("pc-01.json");
    let layout = CandidateLayout {
        placements: vec![placement(
            "place-direct",
            PlacementSubject::DirectItem {
                item_id: id("box"),
                unit_ordinal: 0,
            },
        )],
        assignments: vec![],
        unassigned: vec![Unassigned {
            item_id: id("spare"),
            instances: UnassignedInstances::Known {
                ranges: vec![OrdinalRange {
                    start: 0,
                    end_exclusive: 1,
                }],
            },
            reason_code: "no-space".into(),
        }],
        purchase_selections: vec![],
    };
    let actions = assemble_action_guide(
        &layout,
        &validation(
            vec![
                check(
                    "chk:ip:place-direct:n",
                    CheckKind::InstallationPath,
                    "staging_unknown",
                    &["place-direct"],
                ),
                check(
                    "chk:ip:place-direct:c",
                    CheckKind::InstallationPath,
                    "staging_unknown",
                    &["place-direct"],
                ),
            ],
            &["place-direct"],
            &[],
        ),
    );
    assert_eq!(edges(&actions), oracle_edges(&case));
    assert_eq!(produced_order(&actions), oracle_order(&case));
    assert!(actions.iter().all(|step| {
        !matches!(
            step.kind,
            ActionKind::Acquire | ActionKind::ConfirmArrival | ActionKind::TransferContents
        )
    }));
    let install = actions
        .iter()
        .find(|step| step.id.as_str() == "act:install:place-direct")
        .unwrap();
    assert_eq!(
        install
            .reason_ids
            .iter()
            .map(|item| item.as_str())
            .collect::<Vec<_>>(),
        vec!["chk:ip:place-direct:c", "chk:ip:place-direct:n"]
    );
    assert!(install.required_confirmations.is_empty());
}

#[test]
fn pc02_acquire_is_only_the_new_variant() {
    let case = oracle("pc-02.json");
    let layout = CandidateLayout {
        placements: vec![
            placement(
                "place-o0",
                PlacementSubject::OwnedContainer {
                    owned_id: id("owned-bin"),
                    unit_ordinal: 0,
                },
            ),
            placement(
                "place-o1",
                PlacementSubject::OwnedContainer {
                    owned_id: id("owned-bin"),
                    unit_ordinal: 1,
                },
            ),
            placement(
                "place-n0",
                PlacementSubject::NewContainer {
                    variant_id: id("variant-new"),
                    unit_ordinal: 0,
                },
            ),
        ],
        assignments: vec![],
        unassigned: vec![],
        purchase_selections: vec![PurchaseSelection {
            placement_id: id("place-n0"),
            offer: OfferSelection::Selected {
                offer_id: id("offer-new"),
            },
        }],
    };
    let actions = assemble_action_guide(
        &layout,
        &validation(
            vec![
                check(
                    "chk:pr:variant-new",
                    CheckKind::Price,
                    "price_unknown",
                    &["variant-new"],
                ),
                check(
                    "chk:sh:variant-new",
                    CheckKind::Shipping,
                    "shipping_unknown",
                    &["variant-new"],
                ),
            ],
            &["place-n0", "place-o0", "place-o1"],
            &[],
        ),
    );
    assert_eq!(edges(&actions), oracle_edges(&case));
    assert_eq!(produced_order(&actions), oracle_order(&case));
    assert!(
        actions
            .iter()
            .all(|step| step.kind != ActionKind::TransferContents)
    );
    let acquire = actions
        .iter()
        .find(|step| step.kind == ActionKind::Acquire)
        .unwrap();
    assert_eq!(
        acquire
            .reason_ids
            .iter()
            .map(|item| item.as_str())
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(["chk:pr:variant-new", "chk:sh:variant-new"])
    );
    for owned in ["act:install:place-o0", "act:install:place-o1"] {
        let step = actions
            .iter()
            .find(|step| step.id.as_str() == owned)
            .unwrap();
        assert!(step.reason_ids.is_empty());
        assert!(
            !step
                .prerequisite_step_ids
                .iter()
                .any(|item| item.as_str().contains("acquire"))
        );
    }
}

#[test]
fn pc03_load_before_rear_first_install_matches_the_hand_oracle() {
    let case = oracle("pc-03.json");
    let layout = CandidateLayout {
        placements: vec![
            placement(
                "bin-front",
                PlacementSubject::OwnedContainer {
                    owned_id: id("owned-front"),
                    unit_ordinal: 0,
                },
            ),
            placement(
                "bin-rear",
                PlacementSubject::OwnedContainer {
                    owned_id: id("owned-rear"),
                    unit_ordinal: 0,
                },
            ),
        ],
        assignments: vec![
            contained("book", 0, "bin-front"),
            contained("cup", 0, "bin-rear"),
            contained("plate", 0, "bin-rear"),
        ],
        unassigned: vec![Unassigned {
            item_id: id("spare"),
            instances: UnassignedInstances::Known {
                ranges: vec![OrdinalRange {
                    start: 0,
                    end_exclusive: 1,
                }],
            },
            reason_code: "no-space".into(),
        }],
        purchase_selections: vec![],
    };
    let actions = assemble_action_guide(
        &layout,
        &validation(
            vec![],
            &["bin-rear", "bin-front"],
            &[("bin-front", &["bin-rear"])],
        ),
    );
    assert_eq!(edges(&actions), oracle_edges(&case));
    assert_eq!(produced_order(&actions), oracle_order(&case));
    for step in actions
        .iter()
        .filter(|step| step.kind == ActionKind::TransferContents)
    {
        assert!(
            step.prerequisite_step_ids
                .iter()
                .all(|item| !item.as_str().starts_with("act:install:"))
        );
    }
}

#[test]
fn pc04_unknown_checks_block_only_the_related_actions() {
    let layout = CandidateLayout {
        placements: vec![
            placement(
                "bin-a",
                PlacementSubject::OwnedContainer {
                    owned_id: id("owned-a"),
                    unit_ordinal: 0,
                },
            ),
            placement(
                "bin-b",
                PlacementSubject::OwnedContainer {
                    owned_id: id("owned-b"),
                    unit_ordinal: 0,
                },
            ),
            placement(
                "place-tray",
                PlacementSubject::DirectItem {
                    item_id: id("tray"),
                    unit_ordinal: 0,
                },
            ),
        ],
        assignments: vec![contained("cup", 0, "bin-a")],
        unassigned: vec![],
        purchase_selections: vec![],
    };
    let actions = assemble_action_guide(
        &layout,
        &validation(
            vec![
                check(
                    "chk:sg:bin-a:c",
                    CheckKind::SupportGeometry,
                    "fact_unknown",
                    &["bin-a"],
                ),
                check(
                    "chk:ld:staging:bin-a",
                    CheckKind::SupportLoad,
                    "staging_support_unknown",
                    &["bin-a"],
                ),
                check(
                    "chk:oac:bin-b:x",
                    CheckKind::OperationalAccess,
                    "temporary_parking_unsupported",
                    &["bin-b"],
                ),
                check(
                    "chk:ip:place-tray:c",
                    CheckKind::InstallationPath,
                    "fact_unknown",
                    &["place-tray"],
                ),
                check(
                    "chk:pr:variant-new",
                    CheckKind::Price,
                    "price_unknown",
                    &["variant-new"],
                ),
                check(
                    "chk:sh:variant-new",
                    CheckKind::Shipping,
                    "shipping_unknown",
                    &["variant-new"],
                ),
                ConstraintCheck {
                    id: id("chk:bg:soft"),
                    kind: CheckKind::Budget,
                    subject_ids: vec![],
                    status: CheckStatus::Fail,
                    reason_code: "soft_budget".into(),
                    basis: CheckBasis::NonGeometric,
                    evidence_refs: vec![],
                    measurements: vec![],
                    blocking: false,
                    remediation: vec![],
                },
            ],
            &["bin-a", "bin-b", "place-tray"],
            &[],
        ),
    );
    let reasons = |step_id: &str| -> BTreeSet<String> {
        actions
            .iter()
            .find(|step| step.id.as_str() == step_id)
            .unwrap()
            .reason_ids
            .iter()
            .map(|item| item.as_str().to_owned())
            .collect()
    };
    assert_eq!(
        reasons("act:transfer:cup:0"),
        BTreeSet::from([
            "chk:sg:bin-a:c".to_owned(),
            "chk:ld:staging:bin-a".to_owned()
        ])
    );
    assert_eq!(
        reasons("act:install:bin-a"),
        BTreeSet::from([
            "chk:sg:bin-a:c".to_owned(),
            "chk:ld:staging:bin-a".to_owned()
        ])
    );
    assert_eq!(
        reasons("act:install:bin-b"),
        BTreeSet::from(["chk:oac:bin-b:x".to_owned()])
    );
    assert_eq!(
        reasons("act:install:place-tray"),
        BTreeSet::from(["chk:ip:place-tray:c".to_owned()])
    );
    assert!(!reasons("act:install:place-tray").contains("chk:pr:variant-new"));
    assert!(!reasons("act:install:place-tray").contains("chk:bg:soft"));
}

#[test]
fn hostile_action_refs_are_rejected_without_rewriting_history() {
    let record =
        fs::read_to_string(root().join("fixtures/domain/record-snapshot-verified.json")).unwrap();
    let value: Value = serde_json::from_str(&record).unwrap();
    let snapshot: PlanSnapshot =
        serde_json::from_value(value["input"]["snapshot"].clone()).expect("historical snapshot");
    assert_eq!(snapshot.content.versions.rule_version, "zari-domain-v1");
    assert_eq!(
        canonical::snapshot_digest(&snapshot.content),
        snapshot.plan_snapshot_id
    );
    assert!(validate::validate_snapshot(&snapshot).is_empty());

    let mut cyclic = snapshot.clone();
    let mut second = cyclic.content.actions[0].clone();
    second.id = Id::new("act-2").unwrap();
    cyclic.content.actions.push(second);
    cyclic.content.actions[0].prerequisite_step_ids = vec![Id::new("act-2").unwrap()];
    cyclic.content.actions[1].prerequisite_step_ids = vec![Id::new("act-1").unwrap()];
    cyclic.plan_snapshot_id = canonical::snapshot_digest(&cyclic.content);
    let cyclic_codes: BTreeSet<_> = validate::validate_snapshot(&cyclic)
        .into_iter()
        .map(|item| item.code)
        .collect();
    assert!(cyclic_codes.contains("cyclic_action_dependencies"));

    let mut duplicate = snapshot.clone();
    duplicate
        .content
        .actions
        .push(duplicate.content.actions[0].clone());
    duplicate.plan_snapshot_id = canonical::snapshot_digest(&duplicate.content);
    let duplicate_codes: BTreeSet<_> = validate::validate_snapshot(&duplicate)
        .into_iter()
        .map(|item| item.code)
        .collect();
    assert!(duplicate_codes.contains("duplicate_id"));

    let mut dangling = snapshot.clone();
    dangling.content.actions[0]
        .prerequisite_step_ids
        .push(Id::new("act:install:missing").unwrap());
    dangling.plan_snapshot_id = canonical::snapshot_digest(&dangling.content);
    let dangling_codes: BTreeSet<_> = validate::validate_snapshot(&dangling)
        .into_iter()
        .map(|item| item.code)
        .collect();
    assert!(dangling_codes.contains("dangling_action_ref"));

    let mut wrong = snapshot.clone();
    wrong.content.actions[0]
        .reason_ids
        .push(Id::new("chk:missing").unwrap());
    wrong.plan_snapshot_id = canonical::snapshot_digest(&wrong.content);
    let wrong_codes: BTreeSet<_> = validate::validate_snapshot(&wrong)
        .into_iter()
        .map(|item| item.code)
        .collect();
    assert!(wrong_codes.contains("dangling_check_ref"));
}

fn stamp_for(snapshot: &PlanSnapshot, identity: &str, dirty: bool) -> ActionEligibilityStamp {
    let versions = &snapshot.content.versions;
    ActionEligibilityStamp {
        project_id: Id::new("project-1").unwrap(),
        input_digest: versions.input_digest.clone(),
        plan_snapshot_id: snapshot.plan_snapshot_id.clone(),
        catalog_digest: versions.catalog_digest.clone(),
        catalog_version: versions.catalog_version.clone(),
        rule_version: versions.rule_version.clone(),
        solver_version: versions.solver_version.clone(),
        schema_version: versions.schema_version,
        canonical_version: versions.canonical_version,
        build_id: BUILD_ID.to_owned(),
        search_profile_id: versions.search_profile.id.clone(),
        search_profile_version: versions.search_profile.version,
        accepted_input_revision: Revision::new(1).unwrap(),
        project_revision: Revision::new(2).unwrap(),
        editor_epoch: Revision::new(3).unwrap(),
        progress_identity: identity.into(),
        source_dirty: dirty,
    }
}

fn historical_snapshot() -> PlanSnapshot {
    let record =
        fs::read_to_string(root().join("fixtures/domain/record-snapshot-verified.json")).unwrap();
    let value: Value = serde_json::from_str(&record).unwrap();
    serde_json::from_value(value["input"]["snapshot"].clone()).unwrap()
}

#[test]
fn eligibility_refuses_stale_dirty_null_and_old_rules() {
    let historical = historical_snapshot();
    let identity = progress_identity(&[]);
    let reply = query_action_eligibility(
        &historical,
        Some(&[]),
        &stamp_for(&historical, &identity, false),
    )
    .unwrap();
    assert!(!reply.eligible);
    assert_eq!(reply.stale_reason.as_deref(), Some("historical_rule"));
    assert!(reply.rows.iter().all(|row| !row.executable));
    assert_eq!(
        canonical::snapshot_digest(&historical.content),
        historical.plan_snapshot_id
    );

    let mut current = historical.clone();
    current.content.versions.rule_version = RULE_VERSION.to_owned();
    current.plan_snapshot_id = canonical::snapshot_digest(&current.content);
    let before = current.content.validation.checks.clone();
    let null_progress =
        query_action_eligibility(&current, None, &stamp_for(&current, "", false)).unwrap();
    assert!(!null_progress.eligible);
    assert_eq!(null_progress.stale_reason.as_deref(), Some("null_progress"));

    let dirty =
        query_action_eligibility(&current, Some(&[]), &stamp_for(&current, &identity, true))
            .unwrap();
    assert!(!dirty.eligible);
    assert_eq!(dirty.stale_reason.as_deref(), Some("dirty_source"));

    let mut mismatched = stamp_for(&current, &identity, false);
    mismatched.input_digest = historical.content.versions.input_digest.clone();
    if mismatched.input_digest == current.content.versions.input_digest {
        mismatched.catalog_version = "other".into();
    }
    let stale = query_action_eligibility(&current, Some(&[]), &mismatched).unwrap();
    assert!(!stale.eligible);
    assert_eq!(stale.stale_reason.as_deref(), Some("stamp_mismatch"));
    assert_eq!(current.content.validation.checks, before);

    let open =
        query_action_eligibility(&current, Some(&[]), &stamp_for(&current, &identity, false))
            .unwrap();
    assert!(open.eligible);
    assert!(
        open.rows
            .iter()
            .any(|row| row.user_assertion && row.executable)
    );
}

#[test]
fn resolve_done_does_not_clear_an_unknown_blocker() {
    let mut snapshot = historical_snapshot();
    snapshot.content.versions.rule_version = RULE_VERSION.to_owned();
    snapshot.content.validation.checks.push(ConstraintCheck {
        id: Id::new("chk:ip:place-1:c").unwrap(),
        kind: CheckKind::InstallationPath,
        subject_ids: vec![Id::new("place-1").unwrap()],
        status: CheckStatus::Unknown,
        reason_code: "staging_unknown".into(),
        basis: CheckBasis::Conservative,
        evidence_refs: vec![],
        measurements: vec![],
        blocking: true,
        remediation: vec![],
    });
    snapshot.content.actions[0].reason_ids = vec![Id::new("chk:ip:place-1:c").unwrap()];
    let resolve = ActionStep {
        id: Id::new("act:resolve:tray:0").unwrap(),
        kind: ActionKind::ResolveCondition,
        subject_ids: vec![Id::new("place-1").unwrap()],
        prerequisite_step_ids: vec![],
        required_confirmations: vec![],
        reason_ids: vec![Id::new("chk:ip:place-1:c").unwrap()],
    };
    snapshot.content.actions.push(resolve);
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    let checks_before = snapshot.content.validation.checks.clone();
    let progress = vec![ActionProgressInput {
        step_id: Id::new("act:resolve:tray:0").unwrap(),
        status: ProgressMark::Done,
    }];
    let identity = progress_identity(&progress);
    let reply = query_action_eligibility(
        &snapshot,
        Some(&progress),
        &stamp_for(&snapshot, &identity, false),
    )
    .unwrap();
    assert!(reply.eligible);
    let install = reply
        .rows
        .iter()
        .find(|row| row.action_id.as_str() == "act-1")
        .unwrap();
    assert!(!install.executable);
    assert_eq!(install.blocker_check_ids[0].as_str(), "chk:ip:place-1:c");
    let resolved = reply
        .rows
        .iter()
        .find(|row| row.action_id.as_str() == "act:resolve:tray:0")
        .unwrap();
    assert!(resolved.executable);
    assert!(resolved.blocker_check_ids.is_empty());
    assert_eq!(snapshot.content.validation.checks, checks_before);
    assert_eq!(
        snapshot.content.validation.checks.last().unwrap().status,
        CheckStatus::Unknown
    );
}
