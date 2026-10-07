//! SP-010 completion-query properties. Row shape, check ids, needs, order,
//! freshness, and the limit code are the oracle. Digests inside a fixture
//! are canonical pins, not a second arithmetic oracle.

use serde_json::{Value, json};
use std::time::Instant;
use std::{fs, path::Path};
use zari_core::scalars::*;
use zari_core::*;

const NOTE_TOKEN: &str = "NOTE_TOKEN_91mm conflicting_sources";

fn domain_path(case: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/domain")
        .join(format!("{case}.json"))
}

fn load_domain(case: &str) -> DomainFixture {
    serde_json::from_str(&fs::read_to_string(domain_path(case)).unwrap()).unwrap()
}

fn verified_input() -> ProjectInput {
    let fixture = load_domain("record-input-verified");
    let VerifiableRecordDto::Input { input, .. } = serde_json::from_value(fixture.input).unwrap()
    else {
        panic!("record-input-verified");
    };
    input
}

fn verified_snapshot() -> PlanSnapshot {
    let fixture = load_domain("record-snapshot-verified");
    let VerifiableRecordDto::Snapshot { snapshot } = serde_json::from_value(fixture.input).unwrap()
    else {
        panic!("record-snapshot-verified");
    };
    snapshot
}

fn ask(
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
) -> Result<NextFactsReply, NextFactsError> {
    query_next_facts(input, &canonical::input_digest(input), snapshot)
}

fn bind(snapshot: &mut PlanSnapshot, input: &ProjectInput) {
    let digest = canonical::input_digest(input);
    snapshot.content.input_facts = input.clone();
    snapshot.content.versions.input_digest = digest;
    snapshot.content.versions.catalog_digest = input.catalog_pin.catalog_digest.clone();
    snapshot.content.versions.catalog_version = input.catalog_pin.catalog_version.clone();
    snapshot.content.versions.rule_version = canonical::RULE_VERSION.into();
    snapshot.content.versions.canonical_version = canonical::CANONICAL_VERSION;
}

fn provenance(ids: &[&str]) -> Provenance {
    Provenance {
        origin: MeasurementOrigin::UserMeasured,
        verification: VerificationStatus::Unverified,
        evidence_ids: ids.iter().map(|id| Id::new(id).unwrap()).collect(),
        rule_ids: vec![],
        input_refs: vec![],
        observed_at: None,
    }
}

fn evidence(id: &str, note: &str) -> Evidence {
    Evidence {
        id: Id::new(id).unwrap(),
        source_kind: MeasurementOrigin::UserMeasured,
        locator: None,
        source_field: "space.interior.width".into(),
        note: note.into(),
        observed_at: None,
        confirmed_by: None,
    }
}

fn known_bounded(ids: &[&str]) -> Measurement {
    Fact::Known {
        value: MeasuredLength {
            nominal: LengthMm::new(600).unwrap(),
            uncertainty: Uncertainty::Bounded {
                minus_mm: ClearanceMm::new(2).unwrap(),
                plus_mm: ClearanceMm::new(3).unwrap(),
            },
        },
        provenance: provenance(ids),
    }
}

fn na<T>() -> Fact<T> {
    Fact::NotApplicable {
        reason_code: "sealed".into(),
    }
}

fn seal_dims(dims: &mut Dimensions) {
    dims.width = na();
    dims.depth = na();
    dims.height = na();
}

fn seal_cuboid(cuboid: &mut MeasuredCuboid) {
    cuboid.min_x = na();
    cuboid.min_y = na();
    cuboid.min_z = na();
    seal_dims(&mut cuboid.extent);
}

/// Mark every supported project path not-applicable so the sweep adds no row.
/// `baseSupport` stays known, because a not-applicable parent would invent a
/// missing load-limit nominal.
fn seal(input: &mut ProjectInput) {
    input.evidence.push(evidence("ev-seal", ""));
    seal_dims(&mut input.space.interior);
    input.space.opening.left = na();
    input.space.opening.bottom = na();
    input.space.opening.width = na();
    input.space.opening.height = na();
    seal_cuboid(&mut input.space.staging.free_volume);
    input.space.staging.base_support = Fact::Known {
        value: StagingSupport { load_limit: na() },
        provenance: provenance(&["ev-seal"]),
    };
    input.space.support.footprint.x = na();
    input.space.support.footprint.y = na();
    input.space.support.footprint.width = na();
    input.space.support.footprint.depth = na();
    input.space.support.elevation = na();
    input.space.support.load_limit = na();
    input.space.clearances.left = na();
    input.space.clearances.right = na();
    input.space.clearances.front = na();
    input.space.clearances.back = na();
    input.space.clearances.top = na();
    input.space.clearances.between_units = na();
    for obstacle in &mut input.space.obstacles {
        seal_cuboid(&mut obstacle.bounds);
    }
    for item in &mut input.items {
        seal_dims(&mut item.dimensions.envelope);
        item.quantity = na();
        item.mass_each = na();
        item.requirement.handling.left = na();
        item.requirement.handling.right = na();
        item.requirement.handling.top = na();
        item.requirement.handling.pull_extra_depth = na();
        item.requirement.handling.lift_above_rim = na();
    }
    for owned in &mut input.owned_containers {
        owned.quantity_owned = na();
        owned.quantity_available = na();
        owned.physical.dimensions.outer.width = na();
        owned.physical.mass = na();
    }
}

fn check_on(
    id: &str,
    kind: CheckKind,
    status: CheckStatus,
    reason: &str,
    blocking: bool,
    entity: &str,
    path: &str,
) -> ConstraintCheck {
    ConstraintCheck {
        id: Id::new(id).unwrap(),
        kind,
        subject_ids: vec![Id::new(entity).unwrap()],
        status,
        reason_code: reason.into(),
        basis: CheckBasis::Nominal,
        evidence_refs: vec![FieldRef {
            entity_id: Id::new(entity).unwrap(),
            field_path: path.into(),
        }],
        measurements: vec![],
        blocking,
        remediation: vec![],
    }
}

fn text_check(id: &str) -> ConstraintCheck {
    ConstraintCheck {
        id: Id::new(id).unwrap(),
        kind: CheckKind::OuterGeometry,
        subject_ids: vec![],
        status: CheckStatus::Fail,
        reason_code: "obstacle_collision".into(),
        basis: CheckBasis::Nominal,
        evidence_refs: vec![],
        measurements: vec![],
        blocking: true,
        remediation: vec![],
    }
}

fn row<'a>(reply: &'a NextFactsReply, path: &str) -> &'a NextFactRow {
    reply
        .rows
        .iter()
        .find(|row| {
            row.field_refs.iter().any(|field| field.field_path == path)
                || row.fact_key.ends_with(&format!(":{path}"))
        })
        .unwrap_or_else(|| panic!("missing row {path}; keys={:?}", keys(reply)))
}

fn keys(reply: &NextFactsReply) -> Vec<&str> {
    reply.rows.iter().map(|row| row.fact_key.as_str()).collect()
}

fn assert_sorted(reply: &NextFactsReply) {
    assert!(
        reply.rows.windows(2).all(|pair| {
            pair[0].priority_class < pair[1].priority_class
                || (pair[0].priority_class == pair[1].priority_class
                    && pair[0].related_check_count > pair[1].related_check_count)
                || (pair[0].priority_class == pair[1].priority_class
                    && pair[0].related_check_count == pair[1].related_check_count
                    && pair[0].fact_key <= pair[1].fact_key)
        }),
        "order {:?}",
        keys(reply)
    );
    let mut seen = std::collections::BTreeSet::new();
    assert!(
        reply
            .rows
            .iter()
            .all(|row| seen.insert(row.fact_key.clone()))
    );
    assert!(
        reply
            .rows
            .iter()
            .all(|row| row.target_refs == row.field_refs)
    );
}

fn assert_no_plan_pass(reply: &NextFactsReply) {
    let value = serde_json::to_value(reply).unwrap();
    assert!(value.get("physicalAssurance").is_none());
    assert!(value.get("planPassed").is_none());
    let text = value.to_string();
    assert!(!text.contains("\"status\":\"pass\""));
    assert!(!text.contains("Confirmed"));
    assert!(!text.contains(NOTE_TOKEN));
}

fn index_of(reply: &NextFactsReply, path: &str) -> usize {
    reply
        .rows
        .iter()
        .position(|row| row.field_refs.iter().any(|field| field.field_path == path))
        .unwrap_or_else(|| panic!("missing {path}"))
}

#[test]
fn shared_fact_keeps_every_check_and_ignores_notes() {
    let mut input = verified_input();
    input.evidence.push(evidence("ev-note", NOTE_TOKEN));
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![
        check_on(
            "chk-width-a",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "space-1",
            "space.interior.width",
        ),
        check_on(
            "chk-width-b",
            CheckKind::InnerCapacity,
            CheckStatus::Unknown,
            "source_missing",
            true,
            "space-1",
            "space.interior.width",
        ),
    ];
    bind(&mut snapshot, &input);
    let reply = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(reply.freshness, NextFactsFreshness::Current);
    assert_sorted(&reply);
    assert_no_plan_pass(&reply);
    let width = row(&reply, "space.interior.width");
    assert_eq!(width.fact_key, "space-1:space.interior.width");
    assert_eq!(
        width.check_ids,
        vec![
            Id::new("chk-width-a").unwrap(),
            Id::new("chk-width-b").unwrap()
        ]
    );
    assert_eq!(width.related_check_count, 2);
    assert_eq!(
        width.reason_codes,
        vec!["fact_unknown".to_owned(), "source_missing".to_owned()]
    );
    assert_eq!(width.need_kind, CompletionNeed::MissingBound);
    assert_eq!(
        width.priority_class,
        CompletionPriority::RequiredPhysicalUnknown
    );
    assert_eq!(
        width.resolution_actions,
        vec![ResolutionAction::EditSupportedField]
    );
    assert!(
        reply
            .rows
            .iter()
            .all(|row| row.fact_key == width.fact_key || row.check_ids.is_empty())
    );
    assert_eq!(reply.resolution_actions, Vec::<ResolutionAction>::new());
}

#[test]
fn shuffled_checks_keep_priority_then_count_then_key() {
    let mut input = verified_input();
    input.items[0].quantity = Fact::Unknown {
        reason: UnknownReason::NotMeasured,
    };
    let paths = [
        (
            "chk-depth",
            CheckKind::OuterGeometry,
            CheckStatus::Fail,
            "obstacle_collision",
            true,
            "space-1",
            "space.interior.depth",
        ),
        (
            "chk-w1",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "space-1",
            "space.interior.width",
        ),
        (
            "chk-w2",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "space-1",
            "space.interior.width",
        ),
        (
            "chk-w3",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "source_missing",
            true,
            "space-1",
            "space.interior.width",
        ),
        (
            "chk-h1",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "space-1",
            "space.interior.height",
        ),
        (
            "chk-qty",
            CheckKind::QuantityConservation,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "item-a",
            "items.item-a.quantity",
        ),
    ];
    let mut checks: Vec<ConstraintCheck> = paths
        .into_iter()
        .map(|(id, kind, status, reason, blocking, entity, path)| {
            check_on(id, kind, status, reason, blocking, entity, path)
        })
        .collect();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = checks.clone();
    bind(&mut snapshot, &input);
    let forward = ask(&input, Some(&snapshot)).unwrap();
    checks.reverse();
    snapshot.content.validation.checks = checks;
    bind(&mut snapshot, &input);
    let backward = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(forward.rows, backward.rows);
    assert_sorted(&forward);
    let depth = index_of(&forward, "space.interior.depth");
    let width = index_of(&forward, "space.interior.width");
    let height = index_of(&forward, "space.interior.height");
    let quantity = index_of(&forward, "items.item-a.quantity");
    assert!(depth < width && width < height && height < quantity);
    assert_eq!(
        row(&forward, "space.interior.depth").priority_class,
        CompletionPriority::RepairKnownFailure
    );
    assert_eq!(
        row(&forward, "space.interior.depth").need_kind,
        CompletionNeed::RepairKnownFailure
    );
    assert_eq!(row(&forward, "space.interior.width").related_check_count, 3);
    assert_eq!(
        row(&forward, "items.item-a.quantity").priority_class,
        CompletionPriority::QuantityCompleteness
    );
    assert_eq!(row(&forward, "items.item-a.quantity").check_ids.len(), 1);
}

#[test]
fn evidence_removal_does_not_invent_a_pass_or_drop_a_failure() {
    let mut input = verified_input();
    input.evidence.push(evidence("ev-width", NOTE_TOKEN));
    input.space.interior.width = known_bounded(&["ev-width"]);
    let complete = ask(&input, None).unwrap();
    assert!(
        complete
            .rows
            .iter()
            .all(|row| !row.fact_key.ends_with(":space.interior.width"))
    );
    input.space.interior.width = known_bounded(&[]);
    let missing = ask(&input, None).unwrap();
    let width = row(&missing, "space.interior.width");
    assert_eq!(width.need_kind, CompletionNeed::MissingEvidence);
    assert_eq!(width.check_ids, Vec::<Id>::new());
    assert_no_plan_pass(&missing);

    input.space.interior.width = known_bounded(&["ev-width"]);
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![check_on(
        "chk-fail",
        CheckKind::OuterGeometry,
        CheckStatus::Fail,
        "obstacle_collision",
        true,
        "space-1",
        "space.interior.width",
    )];
    bind(&mut snapshot, &input);
    let failed = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(
        row(&failed, "space.interior.width").need_kind,
        CompletionNeed::RepairKnownFailure
    );
    input.space.interior.width = known_bounded(&[]);
    bind(&mut snapshot, &input);
    let still = ask(&input, Some(&snapshot)).unwrap();
    let width = row(&still, "space.interior.width");
    assert_eq!(width.need_kind, CompletionNeed::RepairKnownFailure);
    assert_eq!(width.check_ids, vec![Id::new("chk-fail").unwrap()]);
    assert_eq!(width.resolution_actions, vec![ResolutionAction::Remeasure]);
    assert_no_plan_pass(&still);
}

#[test]
fn notes_do_not_create_conflict_or_numbers_and_classes_stay_distinct() {
    let mut input = verified_input();
    input.evidence.push(evidence("ev-note", NOTE_TOKEN));
    input.space.interior.width = Fact::Unknown {
        reason: UnknownReason::NotMeasured,
    };
    input.space.interior.depth = Fact::Unknown {
        reason: UnknownReason::ConflictingSources,
    };
    input.space.interior.height = known_bounded(&["ev-note"]);
    input.space.clearances.left = na();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![
        check_on(
            "chk-pass",
            CheckKind::OuterGeometry,
            CheckStatus::Pass,
            "within_bounds",
            true,
            "space-1",
            "space.interior.height",
        ),
        check_on(
            "chk-na",
            CheckKind::OuterGeometry,
            CheckStatus::NotApplicable,
            "not_applicable",
            false,
            "space-1",
            "space.clearances.left",
        ),
        check_on(
            "chk-soft",
            CheckKind::Orientation,
            CheckStatus::Fail,
            "preference_soft",
            false,
            "space-1",
            "space.opening.width",
        ),
        check_on(
            "chk-vert",
            CheckKind::InstallationPath,
            CheckStatus::Fail,
            "unsupported_vertical_motion",
            false,
            "space-1",
            "space.opening.height",
        ),
        check_on(
            "chk-price",
            CheckKind::Price,
            CheckStatus::Unknown,
            "source_missing",
            false,
            "offer-1",
            "offers.offer-1.packPrice",
        ),
        check_on(
            "chk-budget",
            CheckKind::Budget,
            CheckStatus::Fail,
            "over_budget",
            true,
            "space-1",
            "constraints.hardBudget",
        ),
    ];
    // Opening width/height are sealed to known so the soft and unsupported
    // checks are not reclassified as missing measurements.
    input.evidence.push(evidence("ev-open", ""));
    input.space.opening.width = known_bounded(&["ev-open"]);
    input.space.opening.height = known_bounded(&["ev-open"]);
    input.constraints.purchase_allowed = false;
    bind(&mut snapshot, &input);
    let before = input.clone();
    let reply = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(input, before);
    assert_no_plan_pass(&reply);
    assert_eq!(
        row(&reply, "space.interior.width").need_kind,
        CompletionNeed::MissingNominal
    );
    assert!(
        !row(&reply, "space.interior.width")
            .reason_codes
            .iter()
            .any(|code| code.contains("conflicting"))
    );
    let conflict = row(&reply, "space.interior.depth");
    assert_eq!(conflict.need_kind, CompletionNeed::ConflictingEvidence);
    assert_eq!(
        conflict.priority_class,
        CompletionPriority::RepairKnownFailure
    );
    assert!(
        reply
            .rows
            .iter()
            .all(|row| row.fact_key != "space-1:space.interior.height")
    );
    assert!(
        reply
            .rows
            .iter()
            .all(|row| !row.check_ids.iter().any(|id| id.as_str() == "chk-pass"))
    );
    assert!(reply.rows.iter().all(|row| {
        row.field_refs
            .iter()
            .all(|field| field.field_path != "space.clearances.left")
    }));
    let soft = row(&reply, "space.opening.width");
    assert_eq!(soft.priority_class, CompletionPriority::SoftOrUnsupported);
    assert_eq!(soft.need_kind, CompletionNeed::RepairKnownFailure);
    assert_eq!(
        soft.resolution_actions,
        vec![ResolutionAction::RequestSupportedScope]
    );
    let unsupported = row(&reply, "space.opening.height");
    assert_eq!(unsupported.need_kind, CompletionNeed::UnsupportedInput);
    assert_eq!(
        unsupported.priority_class,
        CompletionPriority::SoftOrUnsupported
    );
    assert_eq!(
        unsupported.resolution_actions,
        vec![ResolutionAction::RequestSupportedScope]
    );
    let price = row(&reply, "offers.offer-1.packPrice");
    assert_eq!(price.priority_class, CompletionPriority::ProcurementUnknown);
    assert_eq!(
        price.resolution_actions,
        vec![ResolutionAction::InspectCatalogSource]
    );
    assert!(
        !serde_json::to_value(price)
            .unwrap()
            .to_string()
            .contains("\"nominal\"")
    );
    let budget = reply
        .rows
        .iter()
        .find(|row| row.check_ids.iter().any(|id| id.as_str() == "chk-budget"))
        .unwrap();
    assert_eq!(
        budget.priority_class,
        CompletionPriority::RepairKnownFailure
    );
    assert_eq!(budget.need_kind, CompletionNeed::RepairKnownFailure);
    assert!(
        budget
            .field_refs
            .iter()
            .any(|field| field.field_path == "constraints.hardBudget")
    );
    assert_eq!(
        budget.resolution_actions,
        vec![ResolutionAction::RequestSupportedScope]
    );
}

#[test]
fn catalog_and_arbitrary_ids_are_read_only() {
    let mut input = verified_input();
    let mut extra = input.items[0].clone();
    extra.id = Id::new("crate-77").unwrap();
    extra.dimensions.envelope.width = Fact::Unknown {
        reason: UnknownReason::NotProvided,
    };
    input.items.push(extra);
    input.constraints.purchase_allowed = false;
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![check_on(
        "chk-sku",
        CheckKind::OuterGeometry,
        CheckStatus::Unknown,
        "fact_unknown",
        true,
        "sku-zz",
        "variants.sku-zz.dimensions.outer.width",
    )];
    let variants_before = snapshot.content.referenced_catalog.variants.len();
    bind(&mut snapshot, &input);
    let before = input.clone();
    let reply = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(input, before);
    assert_eq!(
        snapshot.content.referenced_catalog.variants.len(),
        variants_before
    );
    assert!(input.items.iter().all(|item| item.id.as_str() != "sku-zz"));
    let item = row(&reply, "items.crate-77.dimensions.envelope.width");
    assert_eq!(
        item.fact_key,
        "crate-77:items.crate-77.dimensions.envelope.width"
    );
    assert_eq!(item.need_kind, CompletionNeed::MissingNominal);
    assert_eq!(
        item.resolution_actions,
        vec![ResolutionAction::EditSupportedField]
    );
    let sku = row(&reply, "variants.sku-zz.dimensions.outer.width");
    assert_eq!(
        sku.fact_key,
        "sku-zz:variants.sku-zz.dimensions.outer.width"
    );
    assert_eq!(sku.need_kind, CompletionNeed::MissingNominal);
    assert_eq!(
        sku.resolution_actions,
        vec![ResolutionAction::InspectCatalogSource]
    );
    assert_eq!(
        sku.priority_class,
        CompletionPriority::RequiredPhysicalUnknown
    );
    assert!(!serde_json::to_string(sku).unwrap().contains("\"value\""));
}

#[test]
fn missing_snapshot_lists_input_only_and_stale_borrows_nothing() {
    let input = verified_input();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![check_on(
        "chk-stale-1",
        CheckKind::OuterGeometry,
        CheckStatus::Fail,
        "obstacle_collision",
        true,
        "space-1",
        "space.interior.width",
    )];
    let input_only = ask(&input, None).unwrap();
    assert_eq!(input_only.freshness, NextFactsFreshness::InputOnly);
    assert!(input_only.source_stamp.plan_snapshot_id.is_none());
    assert!(input_only.rows.iter().all(|row| row.check_ids.is_empty()));
    assert!(
        input_only
            .rows
            .iter()
            .any(|row| row.fact_key.ends_with(":space.interior.width"))
    );
    assert!(
        !serde_json::to_string(&input_only)
            .unwrap()
            .contains("chk-stale-1")
    );
    assert_eq!(
        input_only.resolution_actions,
        Vec::<ResolutionAction>::new()
    );

    let stale = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(stale.freshness, NextFactsFreshness::Stale);
    assert!(stale.rows.is_empty());
    assert_eq!(
        stale.resolution_actions,
        vec![ResolutionAction::Recalculate]
    );
    assert!(
        !serde_json::to_string(&stale)
            .unwrap()
            .contains("chk-stale-1")
    );
    assert!(stale.source_stamp.plan_snapshot_id.is_some());

    bind(&mut snapshot, &input);
    let current = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(current.freshness, NextFactsFreshness::Current);
    assert!(
        row(&current, "space.interior.width")
            .check_ids
            .iter()
            .any(|id| id.as_str() == "chk-stale-1")
    );

    let mut moved = input.clone();
    moved.constraints.purchase_allowed = false;
    let historical = ask(&moved, Some(&snapshot)).unwrap();
    assert_eq!(historical.freshness, NextFactsFreshness::Stale);
    assert!(historical.rows.is_empty());
    assert!(
        !serde_json::to_string(&historical)
            .unwrap()
            .contains("chk-stale-1")
    );
}

#[test]
fn claimed_digest_mismatch_is_not_a_stale_list() {
    let input = verified_input();
    let mut other = input.clone();
    other.constraints.purchase_allowed = false;
    let wrong = canonical::input_digest(&other);
    assert_eq!(
        query_next_facts(&input, &wrong, None),
        Err(NextFactsError::DigestMismatch)
    );
}

#[test]
fn limits_fail_the_whole_query_without_a_short_list() {
    let mut input = verified_input();
    seal(&mut input);
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = (1..=512)
        .map(|index| text_check(&format!("txt-{index:04}")))
        .collect();
    bind(&mut snapshot, &input);
    let full = ask(&input, Some(&snapshot)).unwrap();
    assert_eq!(full.rows.len(), 512);
    assert!(full.rows.iter().all(|row| row.field_refs.is_empty()));
    snapshot
        .content
        .validation
        .checks
        .push(text_check("txt-0513"));
    bind(&mut snapshot, &input);
    assert_eq!(
        ask(&input, Some(&snapshot)),
        Err(NextFactsError::LimitExceeded)
    );

    let crowded = verified_input();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = (1..=513)
        .map(|index| text_check(&format!("raw-{index:04}")))
        .collect();
    bind(&mut snapshot, &crowded);
    assert_eq!(
        ask(&crowded, Some(&snapshot)),
        Err(NextFactsError::LimitExceeded)
    );

    snapshot.content.validation.checks = (1..=2048)
        .map(|index| {
            check_on(
                &format!("ref-{index:04}"),
                CheckKind::OuterGeometry,
                CheckStatus::Unknown,
                "fact_unknown",
                true,
                "space-1",
                "space.interior.width",
            )
        })
        .collect();
    bind(&mut snapshot, &crowded);
    let bounded = ask(&crowded, Some(&snapshot)).unwrap();
    assert_eq!(
        row(&bounded, "space.interior.width").related_check_count,
        2048
    );
    snapshot.content.validation.checks.push(check_on(
        "ref-2049",
        CheckKind::OuterGeometry,
        CheckStatus::Unknown,
        "fact_unknown",
        true,
        "space-1",
        "space.interior.width",
    ));
    bind(&mut snapshot, &crowded);
    assert_eq!(
        ask(&crowded, Some(&snapshot)),
        Err(NextFactsError::LimitExceeded)
    );

    snapshot.content.validation.checks = vec![ConstraintCheck {
        id: Id::new("chk-bytes").unwrap(),
        kind: CheckKind::OuterGeometry,
        subject_ids: vec![],
        status: CheckStatus::Fail,
        reason_code: "x".repeat(COMPLETION_MAX_BYTES),
        basis: CheckBasis::Nominal,
        evidence_refs: vec![],
        measurements: vec![],
        blocking: true,
        remediation: vec![],
    }];
    bind(&mut snapshot, &crowded);
    assert_eq!(
        ask(&crowded, Some(&snapshot)),
        Err(NextFactsError::LimitExceeded)
    );
}

#[test]
fn one_completed_fact_does_not_clear_the_other_rows() {
    let mut input = verified_input();
    input.evidence.push(evidence("ev-width", ""));
    input.space.interior.width = known_bounded(&["ev-width"]);
    let reply = ask(&input, None).unwrap();
    assert!(
        reply
            .rows
            .iter()
            .all(|row| !row.fact_key.ends_with(":space.interior.width"))
    );
    assert!(reply.rows.len() > 1);
    assert_no_plan_pass(&reply);
}

#[test]
fn warm_query_p95_stays_within_the_rust_target() {
    let input = verified_input();
    let digest = canonical::input_digest(&input);
    for _ in 0..8 {
        query_next_facts(&input, &digest, None).unwrap();
    }
    let mut samples = Vec::with_capacity(40);
    for _ in 0..40 {
        let started = Instant::now();
        query_next_facts(&input, &digest, None).unwrap();
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|left, right| left.total_cmp(right));
    let p95 = samples[38];
    eprintln!("SP010_QUERY_P95_MS={p95:.3}");
    assert!(
        p95 <= 20.0,
        "warm Rust query p95 {p95:.3} ms exceeds the 20 ms target"
    );
}

fn meta(id: &str, system: bool, context: Option<&str>) -> Value {
    json!({
        "protocolVersion": 1,
        "schemaVersion": 1,
        "workerSessionId": "session-a",
        "projectActivationId": if system { "system" } else { "activation-a" },
        "requestId": id,
        "projectId": if system { "system" } else { "project-a" },
        "editorEpoch": "0",
        "inputRevision": "0",
        "contextId": context
    })
}

fn send(runtime: &mut Runtime, meta: Value, command: Value) -> Value {
    serde_json::from_str(
        &runtime.handle_json(&json!({"meta": meta, "command": command}).to_string()),
    )
    .unwrap()
}

#[test]
fn query_does_not_bump_the_search_counter_or_accept_a_bad_digest() {
    let input = verified_input();
    let digest = canonical::input_digest(&input);
    let mut runtime = Runtime::new();
    let ready = send(
        &mut runtime,
        meta("init", true, None),
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    assert_eq!(ready["event"]["kind"], "ready");
    assert_eq!(ready["event"]["buildId"], BUILD_ID);
    let mismatch = send(
        &mut runtime,
        meta("bad-digest", true, None),
        json!({
            "kind": "queryNextFacts",
            "input": input,
            "inputDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "snapshot": null
        }),
    );
    assert_eq!(mismatch["event"]["code"], "digest_mismatch");
    let listed = send(
        &mut runtime,
        meta("list", true, None),
        json!({
            "kind": "queryNextFacts",
            "input": input,
            "inputDigest": digest,
            "snapshot": null
        }),
    );
    assert_eq!(listed["event"]["kind"], "nextFactsQueried");
    assert_eq!(listed["event"]["reply"]["freshness"], "inputOnly");

    let fixture = load_domain("strategies-proposed");
    let project = fixture.input["input"].clone();
    let catalog = fixture.input["catalog"].clone();
    let parsed_input: ProjectInput = serde_json::from_value(project.clone()).unwrap();
    let parsed_catalog: CatalogSnapshot = serde_json::from_value(catalog.clone()).unwrap();
    let context = canonical::context_id(&parsed_input, &CatalogContent::from(&parsed_catalog));
    let mut runtime = Runtime::new();
    runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
    assert_eq!(
        send(
            &mut runtime,
            meta("init-search", true, None),
            json!({
                "kind": "initialize",
                "buildId": BUILD_ID,
                "expectedProtocolVersion": 1,
                "expectedSchemaVersion": 1
            }),
        )["event"]["kind"],
        "ready"
    );
    let activated = send(
        &mut runtime,
        meta("activate", false, None),
        json!({
            "kind": "activateProject",
            "context": { "kind": "project", "input": project, "catalog": catalog }
        }),
    );
    assert_eq!(activated["event"]["kind"], "projectActivated");
    assert_eq!(activated["event"]["contextId"], context.as_str());
    let project_digest = canonical::input_digest(&parsed_input);
    for name in ["q1", "q2", "q3"] {
        let queried = send(
            &mut runtime,
            meta(name, false, Some(context.as_str())),
            json!({
                "kind": "queryNextFacts",
                "input": parsed_input,
                "inputDigest": project_digest,
                "snapshot": null
            }),
        );
        assert_eq!(queried["event"]["kind"], "nextFactsQueried", "{queried}");
    }
    let started = send(
        &mut runtime,
        meta("search", false, Some(context.as_str())),
        json!({"kind": "startSearch", "mode": "continuous"}),
    );
    assert_eq!(started["event"]["kind"], "searchStarted", "{started}");
    assert_eq!(started["event"]["searchId"], "search-1");
}

fn query_fixture(
    case_id: &str,
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    expected: DomainFixtureExpected,
) -> DomainFixture {
    let digest = canonical::input_digest(input);
    let payload = json!({
        "input": input,
        "inputDigest": digest,
        "snapshot": snapshot
    });
    DomainFixture {
        fixture_schema_version: 1,
        case_id: case_id.into(),
        operation: DomainOperation::QueryNextFacts,
        schema_version: 1,
        input: payload,
        engine_context: EngineContext {
            build_id: BUILD_ID.into(),
        },
        expected,
        group_format_requests: vec![],
    }
}

fn write_fixture(fixture: &DomainFixture) {
    let path = domain_path(&fixture.case_id);
    let text = serde_json::to_string_pretty(fixture).unwrap();
    fs::write(&path, format!("{text}\n")).unwrap();
}

#[test]
#[ignore = "writes fixtures/domain/mc-*.json; run once when the oracle changes"]
fn emit_mc_fixtures() {
    let mut input = verified_input();
    input.evidence.push(evidence("ev-note", NOTE_TOKEN));
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![
        check_on(
            "chk-width-a",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "space-1",
            "space.interior.width",
        ),
        check_on(
            "chk-width-b",
            CheckKind::InnerCapacity,
            CheckStatus::Unknown,
            "source_missing",
            true,
            "space-1",
            "space.interior.width",
        ),
    ];
    bind(&mut snapshot, &input);
    let reply = ask(&input, Some(&snapshot)).unwrap();
    write_fixture(&query_fixture(
        "mc-07-shared-fact",
        &input,
        Some(&snapshot),
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: None,
            reply: Some(reply),
        },
    ));

    let mut input = verified_input();
    let mut extra = input.items[0].clone();
    extra.id = Id::new("crate-77").unwrap();
    extra.dimensions.envelope.width = Fact::Unknown {
        reason: UnknownReason::NotProvided,
    };
    input.items.push(extra);
    input.constraints.purchase_allowed = false;
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![
        check_on(
            "chk-sku",
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
            "sku-zz",
            "variants.sku-zz.dimensions.outer.width",
        ),
        check_on(
            "chk-price",
            CheckKind::Price,
            CheckStatus::Unknown,
            "source_missing",
            false,
            "offer-1",
            "offers.offer-1.packPrice",
        ),
    ];
    bind(&mut snapshot, &input);
    let reply = ask(&input, Some(&snapshot)).unwrap();
    write_fixture(&query_fixture(
        "mc-09-catalog-source",
        &input,
        Some(&snapshot),
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: None,
            reply: Some(reply),
        },
    ));

    let input = verified_input();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![check_on(
        "chk-stale-1",
        CheckKind::OuterGeometry,
        CheckStatus::Fail,
        "obstacle_collision",
        true,
        "space-1",
        "space.interior.width",
    )];
    let reply = ask(&input, Some(&snapshot)).unwrap();
    write_fixture(&query_fixture(
        "mc-10-stale-binding",
        &input,
        Some(&snapshot),
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: None,
            reply: Some(reply),
        },
    ));

    let input = verified_input();
    let reply = ask(&input, None).unwrap();
    write_fixture(&query_fixture(
        "mc-12-input-only",
        &input,
        None,
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: None,
            reply: Some(reply),
        },
    ));

    let input = verified_input();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![check_on(
        "chk-hist-1",
        CheckKind::OuterGeometry,
        CheckStatus::Fail,
        "obstacle_collision",
        true,
        "space-1",
        "space.interior.width",
    )];
    bind(&mut snapshot, &input);
    let mut moved = input.clone();
    moved.constraints.purchase_allowed = false;
    let reply = ask(&moved, Some(&snapshot)).unwrap();
    write_fixture(&query_fixture(
        "mc-12-historical",
        &moved,
        Some(&snapshot),
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: None,
            reply: Some(reply),
        },
    ));

    let input = verified_input();
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = (1..=513)
        .map(|index| text_check(&format!("raw-{index:04}")))
        .collect();
    bind(&mut snapshot, &input);
    write_fixture(&query_fixture(
        "mc-12-limit",
        &input,
        Some(&snapshot),
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: Some(COMPLETION_LIMIT_CODE.into()),
            reply: None,
        },
    ));

    let mut input = verified_input();
    input.constraints.purchase_allowed = false;
    let mut snapshot = verified_snapshot();
    snapshot.content.validation.checks = vec![check_on(
        "chk-price",
        CheckKind::Price,
        CheckStatus::Unknown,
        "source_missing",
        false,
        "offer-1",
        "offers.offer-1.packPrice",
    )];
    bind(&mut snapshot, &input);
    let reply = ask(&input, Some(&snapshot)).unwrap();
    write_fixture(&query_fixture(
        "mc-12-purchase-not-pass",
        &input,
        Some(&snapshot),
        DomainFixtureExpected::QueryNextFacts {
            decode_error: false,
            failure_code: None,
            reply: Some(reply),
        },
    ));
}

fn decoded_input(fixture: &DomainFixture) -> (ProjectInput, Option<PlanSnapshot>) {
    let input = serde_json::from_value(fixture.input["input"].clone()).unwrap();
    let snapshot = serde_json::from_value(fixture.input["snapshot"].clone()).unwrap();
    (input, snapshot)
}

#[test]
fn pinned_mc_fixtures_match_the_native_oracle() {
    let shared = load_domain("mc-07-shared-fact");
    let (input, snapshot) = decoded_input(&shared);
    let reply = ask(&input, snapshot.as_ref()).unwrap();
    assert_eq!(row(&reply, "space.interior.width").related_check_count, 2);
    assert_eq!(row(&reply, "space.interior.width").check_ids.len(), 2);
    assert_no_plan_pass(&reply);
    execute_domain_fixture(&shared).unwrap();

    let catalog = load_domain("mc-09-catalog-source");
    let (input, snapshot) = decoded_input(&catalog);
    let before = input.clone();
    let reply = ask(&input, snapshot.as_ref()).unwrap();
    assert_eq!(input, before);
    assert_eq!(
        row(&reply, "items.crate-77.dimensions.envelope.width").fact_key,
        "crate-77:items.crate-77.dimensions.envelope.width"
    );
    assert_eq!(
        row(&reply, "variants.sku-zz.dimensions.outer.width").resolution_actions,
        vec![ResolutionAction::InspectCatalogSource]
    );
    assert!(!input.constraints.purchase_allowed);
    assert!(
        reply
            .rows
            .iter()
            .any(|row| row.fact_key.ends_with(":offers.offer-1.packPrice"))
    );
    execute_domain_fixture(&catalog).unwrap();

    let stale = load_domain("mc-10-stale-binding");
    let (input, snapshot) = decoded_input(&stale);
    let reply = ask(&input, snapshot.as_ref()).unwrap();
    assert_eq!(reply.freshness, NextFactsFreshness::Stale);
    assert!(reply.rows.is_empty());
    assert!(
        !serde_json::to_string(&reply)
            .unwrap()
            .contains("chk-stale-1")
    );
    execute_domain_fixture(&stale).unwrap();

    let input_only = load_domain("mc-12-input-only");
    let (input, snapshot) = decoded_input(&input_only);
    assert!(snapshot.is_none());
    let reply = ask(&input, None).unwrap();
    assert_eq!(reply.freshness, NextFactsFreshness::InputOnly);
    assert!(reply.rows.iter().all(|row| row.check_ids.is_empty()));
    execute_domain_fixture(&input_only).unwrap();

    let historical = load_domain("mc-12-historical");
    let (input, snapshot) = decoded_input(&historical);
    let reply = ask(&input, snapshot.as_ref()).unwrap();
    assert_eq!(reply.freshness, NextFactsFreshness::Stale);
    assert!(reply.rows.is_empty());
    assert!(
        !serde_json::to_string(&reply)
            .unwrap()
            .contains("chk-hist-1")
    );
    execute_domain_fixture(&historical).unwrap();

    let limit = load_domain("mc-12-limit");
    let (input, snapshot) = decoded_input(&limit);
    assert_eq!(
        ask(&input, snapshot.as_ref()),
        Err(NextFactsError::LimitExceeded)
    );
    let event = execute_domain_fixture(&limit).unwrap();
    assert_eq!(event["code"], COMPLETION_LIMIT_CODE);

    let purchase = load_domain("mc-12-purchase-not-pass");
    let (input, snapshot) = decoded_input(&purchase);
    assert!(!input.constraints.purchase_allowed);
    let reply = ask(&input, snapshot.as_ref()).unwrap();
    let price = row(&reply, "offers.offer-1.packPrice");
    assert_eq!(price.priority_class, CompletionPriority::ProcurementUnknown);
    assert_no_plan_pass(&reply);
    assert!(reply.rows.len() > 1);
    execute_domain_fixture(&purchase).unwrap();
}
