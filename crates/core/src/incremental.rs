//! Pinned incremental replan.
//!
//! A person names the placements, items, and strategy that must stay. The
//! new plan is a fresh `evaluate_candidate` over that constraint. Pinned
//! coordinates are copied. Historical check status is never copied. When the
//! pins cannot be kept, the reply explains the conflict and which pins would
//! release it. The reply does not replace an adopted plan.

use std::collections::{BTreeMap, BTreeSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::canonical::{self, CatalogContent};
use crate::catalog::{Offer, ProductVariant};
use crate::finalize::evaluate_candidate;
use crate::input::ProjectInput;
use crate::plan::{
    CandidateLayout, CandidateProposal, CheckStatus, ConstraintCheck, ItemAssignment, ItemLocation,
    OrdinalRange, Placement, PlacementSubject, PlanCreation, PlanSnapshot, SearchScope, Unassigned,
    UnassignedInstances,
};
use crate::scalars::{Digest, Id};
use crate::strategy::StrategyDecision;
use crate::validate;
use crate::validator::{self, has_blocking_failure};

pub const READ_MODEL_VERSION: &str = "zari-incremental-1";
const MAX_PINS: usize = 64;
const MAX_RELEASE_PINS: usize = 8;
const MAX_FRESH_CHECKS: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct IncrementalError {
    pub code: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncrementalPins {
    pub placement_ids: Vec<Id>,
    pub item_ids: Vec<Id>,
    pub strategy: bool,
}

#[derive(Clone, Debug)]
pub struct ReplanAction<'a> {
    pub base: &'a PlanSnapshot,
    pub input: &'a ProjectInput,
    pub catalog: &'a CatalogContent,
    pub pins: &'a IncrementalPins,
    pub strategy: &'a StrategyDecision,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PinKind {
    Placement,
    Item,
    Strategy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PinSource {
    Explicit,
    ItemPin,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PinConstraint {
    pub kind: PinKind,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub id: Option<Id>,
    pub source: PinSource,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangeImpact {
    pub added_item_ids: Vec<Id>,
    pub removed_item_ids: Vec<Id>,
    pub dimension_changed_item_ids: Vec<Id>,
    pub quantity_changed_item_ids: Vec<Id>,
    pub space_changed: bool,
    pub strategy_changed: bool,
    pub catalog_changed: bool,
    pub owned_changed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerificationSubject {
    pub subject_id: Id,
    pub reason_code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KeptPlacement {
    pub id: Id,
    pub x: i64,
    pub y: i64,
    pub z: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemovedPlacement {
    pub id: Id,
    pub x: i64,
    pub y: i64,
    pub z: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanDiff {
    pub kept: Vec<KeptPlacement>,
    pub removed: Vec<RemovedPlacement>,
    pub added_placement_ids: Vec<Id>,
    pub moved_placement_ids: Vec<Id>,
    pub unassigned_item_ids: Vec<Id>,
    pub strategy_changed: bool,
    pub previous_snapshot_id: Digest,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub next_snapshot_id: Option<Digest>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncrementalConflict {
    pub code: String,
    pub subject_ids: Vec<Id>,
    pub check_ids: Vec<Id>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReleasablePin {
    pub kind: PinKind,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub id: Option<Id>,
    pub sufficient_alone: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum IncrementalOutcome {
    Published { snapshot: Box<PlanSnapshot> },
    Blocked {},
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncrementalReply {
    pub read_model_version: String,
    pub previous_snapshot_id: Digest,
    pub previous_input_digest: Digest,
    pub next_input_digest: Digest,
    /// Always false. A historical pass is not copied onto the new plan.
    pub reused_pass: bool,
    pub outcome: IncrementalOutcome,
    pub pins: Vec<PinConstraint>,
    pub impact: ChangeImpact,
    pub verification_scope: Vec<VerificationSubject>,
    pub diff: PlanDiff,
    pub conflicts: Vec<IncrementalConflict>,
    pub releasable: Vec<ReleasablePin>,
    pub fresh_checks: Vec<ConstraintCheck>,
}

struct Attempt {
    layout: CandidateLayout,
    diagnostics: Vec<crate::facts::Diagnostic>,
    report: Option<crate::plan::ValidationReport>,
    honored: bool,
    conflicts: Vec<IncrementalConflict>,
}

pub fn replan(action: &ReplanAction<'_>) -> Result<IncrementalReply, IncrementalError> {
    if canonical::snapshot_digest(&action.base.content) != action.base.plan_snapshot_id {
        return Err(IncrementalError {
            code: "integrity_failed",
        });
    }
    check_pins(action)?;
    let expected = if action.pins.strategy {
        &action.base.content.strategy.strategy
    } else {
        &action.input.strategy_choice
    };
    if &action.strategy.strategy != expected {
        return Err(IncrementalError {
            code: "strategy_mismatch",
        });
    }
    let impact = impact_of(action);
    let scope = verification_scope(action, &impact);
    let main = attempt(action, action.pins);
    let strategy_blocked = action.pins.strategy && impact.strategy_changed;
    let mut conflicts = main.conflicts.clone();
    if strategy_blocked {
        conflicts.push(IncrementalConflict {
            code: "strategy_pinned".into(),
            subject_ids: vec![],
            check_ids: vec![],
        });
    }
    let layout_ok = main.honored
        && main.diagnostics.is_empty()
        && main
            .report
            .as_ref()
            .is_some_and(|report| !has_blocking_failure(report));
    let mut outcome = IncrementalOutcome::Blocked {};
    let mut next_id = None;
    if layout_ok && !strategy_blocked {
        let snapshot = publish(action, &main.layout);
        match snapshot {
            Some(snapshot) => {
                next_id = Some(snapshot.plan_snapshot_id.clone());
                outcome = IncrementalOutcome::Published {
                    snapshot: Box::new(snapshot),
                };
            }
            None => {
                conflicts.push(IncrementalConflict {
                    code: "layout_rejected".into(),
                    subject_ids: vec![],
                    check_ids: vec![],
                });
            }
        }
    } else if !main.diagnostics.is_empty() {
        for diagnostic in &main.diagnostics {
            conflicts.push(IncrementalConflict {
                code: diagnostic.code.clone(),
                subject_ids: vec![],
                check_ids: vec![],
            });
        }
    } else if let Some(report) = &main.report {
        let blocking = blocking_checks(report);
        if !blocking.is_empty() {
            conflicts.push(IncrementalConflict {
                code: "pin_blocks".into(),
                subject_ids: blocking
                    .iter()
                    .flat_map(|check| check.subject_ids.clone())
                    .collect(),
                check_ids: blocking.into_iter().map(|check| check.id.clone()).collect(),
            });
        }
    }
    if !matches!(outcome, IncrementalOutcome::Published { .. }) && conflicts.is_empty() {
        conflicts.push(IncrementalConflict {
            code: "unpinned_blocked".into(),
            subject_ids: vec![],
            check_ids: vec![],
        });
    }
    let published = matches!(outcome, IncrementalOutcome::Published { .. });
    let releasable = if published {
        Vec::new()
    } else {
        releasable_pins(action, strategy_blocked, layout_ok)
    };
    let any_pin = action.pins.strategy
        || !action.pins.placement_ids.is_empty()
        || !action.pins.item_ids.is_empty();
    if !published && releasable.is_empty() && any_pin && !layout_ok {
        conflicts.push(IncrementalConflict {
            code: "release_insufficient".into(),
            subject_ids: vec![],
            check_ids: vec![],
        });
    }
    dedup_conflicts(&mut conflicts);
    let diff = diff_of(action, &main.layout, &impact, next_id.clone());
    if !diff.moved_placement_ids.is_empty() {
        return Err(IncrementalError {
            code: "placement_moved",
        });
    }
    let checks = fresh_checks(&main, &scope);
    Ok(IncrementalReply {
        read_model_version: READ_MODEL_VERSION.into(),
        previous_snapshot_id: action.base.plan_snapshot_id.clone(),
        previous_input_digest: action.base.content.versions.input_digest.clone(),
        next_input_digest: canonical::input_digest(action.input),
        reused_pass: false,
        outcome,
        pins: pin_constraints(action),
        impact,
        verification_scope: scope,
        diff,
        conflicts,
        releasable,
        fresh_checks: checks,
    })
}

fn check_pins(action: &ReplanAction<'_>) -> Result<(), IncrementalError> {
    let count = action.pins.placement_ids.len() + action.pins.item_ids.len();
    if count > MAX_PINS {
        return Err(IncrementalError {
            code: "input_limit_exceeded",
        });
    }
    let mut seen = BTreeSet::new();
    for id in action
        .pins
        .placement_ids
        .iter()
        .chain(action.pins.item_ids.iter())
    {
        if !seen.insert(id.as_str()) {
            return Err(IncrementalError {
                code: "duplicate_pin",
            });
        }
    }
    for id in &action.pins.placement_ids {
        if !action
            .base
            .content
            .placements
            .iter()
            .any(|placement| &placement.id == id)
        {
            return Err(IncrementalError {
                code: "unknown_pin",
            });
        }
    }
    for id in &action.pins.item_ids {
        if !action
            .base
            .content
            .input_facts
            .items
            .iter()
            .any(|item| &item.id == id)
        {
            return Err(IncrementalError {
                code: "unknown_pin",
            });
        }
    }
    Ok(())
}

fn impact_of(action: &ReplanAction<'_>) -> ChangeImpact {
    let old = &action.base.content.input_facts;
    let new = action.input;
    let old_items: BTreeMap<&str, _> = old
        .items
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect();
    let new_items: BTreeMap<&str, _> = new
        .items
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect();
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut dimensions = Vec::new();
    let mut quantities = Vec::new();
    for (id, item) in &new_items {
        match old_items.get(id) {
            None => added.push(item.id.clone()),
            Some(previous) => {
                if previous.dimensions != item.dimensions {
                    dimensions.push(item.id.clone());
                }
                if previous.quantity != item.quantity {
                    quantities.push(item.id.clone());
                }
            }
        }
    }
    for (id, item) in &old_items {
        if !new_items.contains_key(id) {
            removed.push(item.id.clone());
        }
    }
    sort_ids(&mut added);
    sort_ids(&mut removed);
    sort_ids(&mut dimensions);
    sort_ids(&mut quantities);
    let old_owned: BTreeMap<&str, _> = old
        .owned_containers
        .iter()
        .map(|owned| (owned.id.as_str(), owned))
        .collect();
    let owned_changed = new.owned_containers.len() != old.owned_containers.len()
        || new.owned_containers.iter().any(|owned| {
            old_owned
                .get(owned.id.as_str())
                .is_none_or(|previous| previous.physical != owned.physical)
        });
    ChangeImpact {
        added_item_ids: added,
        removed_item_ids: removed,
        dimension_changed_item_ids: dimensions,
        quantity_changed_item_ids: quantities,
        space_changed: old.space != new.space,
        strategy_changed: old.strategy_choice != new.strategy_choice,
        catalog_changed: action.base.content.versions.catalog_digest
            != canonical::catalog_digest(action.catalog),
        owned_changed,
    }
}

fn verification_scope(
    action: &ReplanAction<'_>,
    impact: &ChangeImpact,
) -> Vec<VerificationSubject> {
    let mut rows = Vec::new();
    let mut push = |id: &Id, reason: &str| {
        rows.push(VerificationSubject {
            subject_id: id.clone(),
            reason_code: reason.into(),
        });
    };
    for id in &impact.added_item_ids {
        push(id, "item_added");
    }
    for id in &impact.removed_item_ids {
        push(id, "item_removed");
    }
    for id in &impact.dimension_changed_item_ids {
        push(id, "dimension_changed");
    }
    for id in &impact.quantity_changed_item_ids {
        push(id, "quantity_changed");
    }
    let watched: BTreeSet<&Id> = impact
        .added_item_ids
        .iter()
        .chain(impact.removed_item_ids.iter())
        .chain(impact.dimension_changed_item_ids.iter())
        .chain(impact.quantity_changed_item_ids.iter())
        .collect();
    for placement in &action.base.content.placements {
        if placement_items(placement)
            .iter()
            .any(|id| watched.contains(id))
        {
            push(&placement.id, "placement_affected");
        }
    }
    if impact.space_changed {
        push(&action.input.space.id, "space_changed");
    }
    if impact.owned_changed {
        for owned in &action.input.owned_containers {
            push(&owned.id, "owned_changed");
        }
    }
    rows.sort_by(|left, right| {
        left.subject_id
            .as_str()
            .cmp(right.subject_id.as_str())
            .then(left.reason_code.cmp(&right.reason_code))
    });
    rows.dedup();
    rows
}

fn attempt(action: &ReplanAction<'_>, pins: &IncrementalPins) -> Attempt {
    let pinned = pinned_placement_ids(action.base, pins);
    let mut keep = BTreeSet::new();
    let mut conflicts = Vec::new();
    for placement in &action.base.content.placements {
        let pinned_here = pinned.contains(&placement.id);
        match structural_problem(action.input, placement) {
            Some(code) if pinned_here => {
                conflicts.push(IncrementalConflict {
                    code: code.into(),
                    subject_ids: vec![placement.id.clone()],
                    check_ids: vec![],
                });
            }
            Some(_) => {}
            None => {
                keep.insert(placement.id.clone());
            }
        }
    }
    let mut layout = assemble(action, &keep);
    let variants = variant_map(action.catalog);
    let offers = offer_map(action.catalog);
    let mut diagnostics = validate::validate_layout(&layout, action.input, &variants, &offers);
    let mut report = None;
    if diagnostics.is_empty() {
        let mut guard = 0;
        loop {
            guard += 1;
            let validation = validator::validate_candidate(action.input, action.catalog, &layout);
            if !has_blocking_failure(&validation.report)
                || guard > action.base.content.placements.len() + 1
            {
                report = Some(validation.report);
                break;
            }
            let drop_ids = droppable(&layout, &pinned, &validation.report);
            if drop_ids.is_empty() {
                report = Some(validation.report);
                break;
            }
            for id in drop_ids {
                keep.remove(&id);
            }
            layout = assemble(action, &keep);
            diagnostics = validate::validate_layout(&layout, action.input, &variants, &offers);
            if !diagnostics.is_empty() {
                report = None;
                break;
            }
        }
    }
    let honored = pins_honored(action, pins, &layout, &conflicts);
    Attempt {
        layout,
        diagnostics,
        report,
        honored,
        conflicts,
    }
}

fn structural_problem(input: &ProjectInput, placement: &Placement) -> Option<&'static str> {
    match &placement.subject {
        PlacementSubject::DirectItem {
            item_id,
            unit_ordinal,
        } => item_ordinal(input, item_id, *unit_ordinal),
        PlacementSubject::OwnedContainer {
            owned_id,
            unit_ordinal,
        } => {
            let Some(owned) = input
                .owned_containers
                .iter()
                .find(|owned| &owned.id == owned_id)
            else {
                return Some("pinned_subject_missing");
            };
            match owned.quantity_owned.value() {
                Some(quantity) if *unit_ordinal < quantity.get() => None,
                Some(_) => Some("pinned_ordinal"),
                None => Some("unknown_quantity_ordinals"),
            }
        }
        PlacementSubject::NewContainer { .. } => None,
    }
}

fn item_ordinal(input: &ProjectInput, item_id: &Id, ordinal: u32) -> Option<&'static str> {
    let Some(item) = input.items.iter().find(|item| &item.id == item_id) else {
        return Some("pinned_subject_missing");
    };
    match item.quantity.value() {
        Some(quantity) if ordinal < quantity.get() => None,
        Some(_) => Some("pinned_ordinal"),
        None => Some("unknown_quantity_ordinals"),
    }
}

fn pinned_placement_ids(base: &PlanSnapshot, pins: &IncrementalPins) -> BTreeSet<Id> {
    let mut ids: BTreeSet<Id> = pins.placement_ids.iter().cloned().collect();
    for item_id in &pins.item_ids {
        for assignment in &base.content.assignments {
            if &assignment.item_id == item_id {
                ids.insert(referenced_placement(&assignment.location).clone());
            }
        }
    }
    ids
}

fn referenced_placement(location: &ItemLocation) -> &Id {
    match location {
        ItemLocation::Direct { placement_id }
        | ItemLocation::Contained {
            container_placement_id: placement_id,
            ..
        }
        | ItemLocation::ProvisionalContainer {
            container_placement_id: placement_id,
            ..
        } => placement_id,
    }
}

fn assemble(action: &ReplanAction<'_>, keep: &BTreeSet<Id>) -> CandidateLayout {
    let placements: Vec<Placement> = action
        .base
        .content
        .placements
        .iter()
        .filter(|placement| keep.contains(&placement.id))
        .cloned()
        .collect();
    let kept: BTreeSet<&str> = placements
        .iter()
        .map(|placement| placement.id.as_str())
        .collect();
    let assignments: Vec<ItemAssignment> = action
        .base
        .content
        .assignments
        .iter()
        .filter(|assignment| {
            kept.contains(referenced_placement(&assignment.location).as_str())
                && item_ordinal(action.input, &assignment.item_id, assignment.unit_ordinal)
                    .is_none()
        })
        .cloned()
        .collect();
    let mut assigned: BTreeMap<&str, BTreeSet<u32>> = BTreeMap::new();
    for assignment in &assignments {
        assigned
            .entry(assignment.item_id.as_str())
            .or_default()
            .insert(assignment.unit_ordinal);
    }
    let old_unassigned: BTreeMap<&str, &Unassigned> = action
        .base
        .content
        .unassigned
        .iter()
        .map(|row| (row.item_id.as_str(), row))
        .collect();
    let mut unassigned = Vec::new();
    for item in &action.input.items {
        match item.quantity.value() {
            Some(quantity) => {
                let ordinals = assigned.get(item.id.as_str());
                let ranges = missing_ranges(quantity.get(), ordinals);
                if ranges.is_empty() {
                    continue;
                }
                let reason = old_unassigned
                    .get(item.id.as_str())
                    .and_then(|row| match &row.instances {
                        UnassignedInstances::Known { ranges: previous } if previous == &ranges => {
                            Some(row.reason_code.clone())
                        }
                        _ => None,
                    })
                    .unwrap_or_else(|| "incremental_unplaced".into());
                unassigned.push(Unassigned {
                    item_id: item.id.clone(),
                    instances: UnassignedInstances::Known { ranges },
                    reason_code: reason,
                });
            }
            None => {
                if assigned.contains_key(item.id.as_str()) {
                    continue;
                }
                let reason = old_unassigned
                    .get(item.id.as_str())
                    .map(|row| row.reason_code.clone())
                    .unwrap_or_else(|| "incremental_unplaced".into());
                unassigned.push(Unassigned {
                    item_id: item.id.clone(),
                    instances: UnassignedInstances::UnknownQuantity {},
                    reason_code: reason,
                });
            }
        }
    }
    unassigned.sort_by(|left, right| left.item_id.as_str().cmp(right.item_id.as_str()));
    let purchase_selections = action
        .base
        .content
        .purchase_selections
        .iter()
        .filter(|selection| kept.contains(selection.placement_id.as_str()))
        .cloned()
        .collect();
    CandidateLayout {
        placements,
        assignments,
        unassigned,
        purchase_selections,
    }
}

fn missing_ranges(quantity: u32, assigned: Option<&BTreeSet<u32>>) -> Vec<OrdinalRange> {
    let mut ranges = Vec::new();
    let mut start = None;
    for ordinal in 0..quantity {
        let taken = assigned.is_some_and(|set| set.contains(&ordinal));
        if !taken && start.is_none() {
            start = Some(ordinal);
        }
        if taken && let Some(from) = start.take() {
            ranges.push(OrdinalRange {
                start: from,
                end_exclusive: ordinal,
            });
        }
    }
    if let Some(from) = start {
        ranges.push(OrdinalRange {
            start: from,
            end_exclusive: quantity,
        });
    }
    ranges
}

fn droppable(
    layout: &CandidateLayout,
    pinned: &BTreeSet<Id>,
    report: &crate::plan::ValidationReport,
) -> Vec<Id> {
    let mut ids = Vec::new();
    for placement in &layout.placements {
        if pinned.contains(&placement.id) {
            continue;
        }
        let hit = report.checks.iter().any(|check| {
            check.blocking
                && check.status == CheckStatus::Fail
                && check
                    .subject_ids
                    .iter()
                    .any(|id| id == &placement.id || placement_items(placement).contains(&id))
        });
        if hit {
            ids.push(placement.id.clone());
        }
    }
    ids
}

fn pins_honored(
    action: &ReplanAction<'_>,
    pins: &IncrementalPins,
    layout: &CandidateLayout,
    conflicts: &[IncrementalConflict],
) -> bool {
    if !conflicts.is_empty() {
        return false;
    }
    for id in &pins.placement_ids {
        let Some(current) = layout
            .placements
            .iter()
            .find(|placement| &placement.id == id)
        else {
            return false;
        };
        let Some(previous) = action
            .base
            .content
            .placements
            .iter()
            .find(|placement| &placement.id == id)
        else {
            return false;
        };
        if current != previous {
            return false;
        }
    }
    for item_id in &pins.item_ids {
        for assignment in &action.base.content.assignments {
            if &assignment.item_id != item_id {
                continue;
            }
            if item_ordinal(action.input, item_id, assignment.unit_ordinal).is_some() {
                return false;
            }
            let kept = layout.assignments.iter().any(|current| {
                current.item_id == assignment.item_id
                    && current.unit_ordinal == assignment.unit_ordinal
                    && current.location == assignment.location
            });
            if !kept {
                return false;
            }
        }
    }
    true
}

fn placement_items(placement: &Placement) -> Vec<&Id> {
    match &placement.subject {
        PlacementSubject::DirectItem { item_id, .. } => vec![item_id],
        _ => vec![],
    }
}

fn blocking_checks(report: &crate::plan::ValidationReport) -> Vec<&ConstraintCheck> {
    report
        .checks
        .iter()
        .filter(|check| check.blocking && check.status == CheckStatus::Fail)
        .collect()
}

fn publish(action: &ReplanAction<'_>, layout: &CandidateLayout) -> Option<PlanSnapshot> {
    let versions = crate::plan::CompileVersions {
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        input_digest: canonical::input_digest(action.input),
        catalog_version: action.catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(action.catalog),
        rule_version: canonical::RULE_VERSION.into(),
        solver_version: canonical::solver_version_for(&action.input.search.profile).into(),
        search_profile: action.input.search.profile.clone(),
        search_budget: action.input.search.budget.clone(),
        seed: action.input.search.seed.clone(),
    };
    let scope = SearchScope {
        profile: action.input.search.profile.clone(),
        budget: action.input.search.budget.clone(),
        group_ids: action
            .input
            .groups
            .iter()
            .map(|group| group.id.clone())
            .collect(),
        restrictions: vec![],
    };
    let proposal = CandidateProposal {
        layout: layout.clone(),
        strategy: action.strategy.clone(),
        creation: PlanCreation::ManualEdit,
    };
    evaluate_candidate(action.input, action.catalog, &proposal, versions, scope).snapshot
}

fn would_publish(
    action: &ReplanAction<'_>,
    pins: &IncrementalPins,
    strategy_blocked: bool,
) -> bool {
    if strategy_blocked && pins.strategy {
        return false;
    }
    let tried = attempt(action, pins);
    tried.honored
        && tried.diagnostics.is_empty()
        && tried
            .report
            .as_ref()
            .is_some_and(|report| !has_blocking_failure(report))
}

fn releasable_pins(
    action: &ReplanAction<'_>,
    strategy_blocked: bool,
    layout_ok: bool,
) -> Vec<ReleasablePin> {
    let mut rows = Vec::new();
    if strategy_blocked && layout_ok {
        rows.push(ReleasablePin {
            kind: PinKind::Strategy,
            id: None,
            sufficient_alone: true,
        });
    }
    let explicit = explicit_pins(action.pins);
    if explicit.len() <= MAX_RELEASE_PINS {
        for (kind, id) in &explicit {
            let pins = without_pin(action.pins, *kind, id.as_ref());
            let strategy_still = strategy_blocked && pins.strategy;
            if would_publish(action, &pins, strategy_still) {
                rows.push(ReleasablePin {
                    kind: *kind,
                    id: id.clone(),
                    sufficient_alone: true,
                });
            }
        }
    }
    if rows.iter().any(|row| row.sufficient_alone) {
        return sort_releasable(rows);
    }
    let cleared = IncrementalPins {
        placement_ids: vec![],
        item_ids: vec![],
        strategy: false,
    };
    if !explicit.is_empty() && would_publish(action, &cleared, false) {
        for (kind, id) in explicit {
            rows.push(ReleasablePin {
                kind,
                id,
                sufficient_alone: false,
            });
        }
        if strategy_blocked {
            rows.push(ReleasablePin {
                kind: PinKind::Strategy,
                id: None,
                sufficient_alone: false,
            });
        }
    }
    sort_releasable(rows)
}

fn explicit_pins(pins: &IncrementalPins) -> Vec<(PinKind, Option<Id>)> {
    let mut rows = Vec::new();
    for id in &pins.placement_ids {
        rows.push((PinKind::Placement, Some(id.clone())));
    }
    for id in &pins.item_ids {
        rows.push((PinKind::Item, Some(id.clone())));
    }
    rows
}

fn without_pin(pins: &IncrementalPins, kind: PinKind, id: Option<&Id>) -> IncrementalPins {
    let mut next = pins.clone();
    match kind {
        PinKind::Placement => next.placement_ids.retain(|pin| Some(pin) != id),
        PinKind::Item => next.item_ids.retain(|pin| Some(pin) != id),
        PinKind::Strategy => next.strategy = false,
    }
    next
}

fn sort_releasable(mut rows: Vec<ReleasablePin>) -> Vec<ReleasablePin> {
    rows.sort_by(|left, right| {
        pin_order(left.kind).cmp(&pin_order(right.kind)).then(
            left.id
                .as_ref()
                .map(Id::as_str)
                .cmp(&right.id.as_ref().map(Id::as_str)),
        )
    });
    rows.dedup_by(|left, right| left.kind == right.kind && left.id == right.id);
    rows
}

fn pin_order(kind: PinKind) -> u8 {
    match kind {
        PinKind::Strategy => 0,
        PinKind::Item => 1,
        PinKind::Placement => 2,
    }
}

fn pin_constraints(action: &ReplanAction<'_>) -> Vec<PinConstraint> {
    let mut rows = Vec::new();
    if action.pins.strategy {
        rows.push(PinConstraint {
            kind: PinKind::Strategy,
            id: None,
            source: PinSource::Explicit,
        });
    }
    for id in &action.pins.item_ids {
        rows.push(PinConstraint {
            kind: PinKind::Item,
            id: Some(id.clone()),
            source: PinSource::Explicit,
        });
    }
    let implied = pinned_placement_ids(action.base, action.pins);
    let explicit: BTreeSet<&Id> = action.pins.placement_ids.iter().collect();
    for id in &action.pins.placement_ids {
        rows.push(PinConstraint {
            kind: PinKind::Placement,
            id: Some(id.clone()),
            source: PinSource::Explicit,
        });
    }
    for id in implied {
        if explicit.contains(&id) {
            continue;
        }
        rows.push(PinConstraint {
            kind: PinKind::Placement,
            id: Some(id),
            source: PinSource::ItemPin,
        });
    }
    rows.sort_by(|left, right| {
        pin_order(left.kind)
            .cmp(&pin_order(right.kind))
            .then(
                left.id
                    .as_ref()
                    .map(Id::as_str)
                    .cmp(&right.id.as_ref().map(Id::as_str)),
            )
            .then(source_order(left.source).cmp(&source_order(right.source)))
    });
    rows
}

fn source_order(source: PinSource) -> u8 {
    match source {
        PinSource::Explicit => 0,
        PinSource::ItemPin => 1,
    }
}

fn diff_of(
    action: &ReplanAction<'_>,
    layout: &CandidateLayout,
    impact: &ChangeImpact,
    next_id: Option<Digest>,
) -> PlanDiff {
    let current: BTreeMap<&str, &Placement> = layout
        .placements
        .iter()
        .map(|placement| (placement.id.as_str(), placement))
        .collect();
    let mut kept = Vec::new();
    let mut removed = Vec::new();
    let mut moved = Vec::new();
    for placement in &action.base.content.placements {
        let x = i64::from(placement.position.x.get());
        let y = i64::from(placement.position.y.get());
        let z = i64::from(placement.position.z.get());
        match current.get(placement.id.as_str()) {
            Some(next) => {
                if *next != placement {
                    moved.push(placement.id.clone());
                }
                kept.push(KeptPlacement {
                    id: placement.id.clone(),
                    x,
                    y,
                    z,
                });
            }
            None => removed.push(RemovedPlacement {
                id: placement.id.clone(),
                x,
                y,
                z,
            }),
        }
    }
    let previous: BTreeSet<&str> = action
        .base
        .content
        .placements
        .iter()
        .map(|placement| placement.id.as_str())
        .collect();
    let added = layout
        .placements
        .iter()
        .filter(|placement| !previous.contains(placement.id.as_str()))
        .map(|placement| placement.id.clone())
        .collect();
    let unassigned = layout
        .unassigned
        .iter()
        .map(|row| row.item_id.clone())
        .collect();
    PlanDiff {
        kept,
        removed,
        added_placement_ids: added,
        moved_placement_ids: moved,
        unassigned_item_ids: unassigned,
        strategy_changed: impact.strategy_changed,
        previous_snapshot_id: action.base.plan_snapshot_id.clone(),
        next_snapshot_id: next_id,
    }
}

fn fresh_checks(attempt: &Attempt, scope: &[VerificationSubject]) -> Vec<ConstraintCheck> {
    let Some(report) = &attempt.report else {
        return Vec::new();
    };
    let watched: BTreeSet<&str> = scope.iter().map(|row| row.subject_id.as_str()).collect();
    let mut checks: Vec<ConstraintCheck> = report
        .checks
        .iter()
        .filter(|check| {
            (check.blocking && check.status == CheckStatus::Fail)
                || check
                    .subject_ids
                    .iter()
                    .any(|id| watched.contains(id.as_str()))
        })
        .cloned()
        .collect();
    checks.sort_by(|left, right| left.id.as_str().cmp(right.id.as_str()));
    checks.truncate(MAX_FRESH_CHECKS);
    checks
}

fn dedup_conflicts(conflicts: &mut Vec<IncrementalConflict>) {
    conflicts.sort_by(|left, right| {
        left.code.cmp(&right.code).then(
            left.subject_ids
                .iter()
                .map(Id::as_str)
                .cmp(right.subject_ids.iter().map(Id::as_str)),
        )
    });
    conflicts
        .dedup_by(|left, right| left.code == right.code && left.subject_ids == right.subject_ids);
}

fn sort_ids(ids: &mut [Id]) {
    ids.sort_by(|left, right| left.as_str().cmp(right.as_str()));
}

fn variant_map(catalog: &CatalogContent) -> BTreeMap<&str, &ProductVariant> {
    catalog
        .variants
        .iter()
        .map(|variant| (variant.id.as_str(), variant))
        .collect()
}

fn offer_map(catalog: &CatalogContent) -> BTreeMap<&str, &Offer> {
    catalog
        .offers
        .iter()
        .map(|offer| (offer.id.as_str(), offer))
        .collect()
}
