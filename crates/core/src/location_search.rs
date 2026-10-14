//! Local location index and item search.
//!
//! The log is not part of `ProjectInput` or `PlanSnapshot`. A planned
//! location is not an actual location until the user records an
//! observation. A `confirm` observation binds to the adopted snapshot id
//! at record time; searching against another snapshot reports it as a
//! stale confirmation, never as a current actual location. Completed
//! execution steps create no actual location by themselves.

use crate::facts::MAX_LABEL_CHARS;
use crate::input::{Item, ProjectInput};
use crate::inventory::QuantityLabelCode;
use crate::plan::{ItemLocation, PlacementSubject, PlanSnapshot};
use crate::scalars::{Digest, Id, Quantity, parse_quantity};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use unicode_normalization::UnicodeNormalization;

const MAX_OBSERVATIONS: usize = 256;
const MAX_ORDINALS: usize = 64;
const MAX_ITEMS: usize = 128;
const MAX_ROWS: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ObservationKind {
    /// The user states the unit is where the adopted plan put it.
    Confirm,
    /// The user moved the unit somewhere else.
    Relocate,
    /// The user re-tidied the unit into a new spot.
    Reorganize,
    /// The user reports the unit missing; no location is claimed.
    Lost,
    /// Another name the user calls the item.
    Alias,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationObservation {
    pub id: Id,
    pub item_id: Id,
    pub kind: ObservationKind,
    /// The item's label as the user recorded it. For `alias` this is the
    /// alternative name itself.
    pub label: String,
    /// Required for `relocate`/`reorganize`; forbidden otherwise.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub location: Option<String>,
    /// Empty applies to every unit. Non-empty lists exact unit ordinals.
    pub unit_ordinals: Vec<u32>,
    /// The adopted plan the observation was recorded against. Rust stamps
    /// it; the wire value is never trusted.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub plan_snapshot_id: Option<Digest>,
}

/// Append-only per-project location record. Not a PlanSnapshot.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationLog {
    pub observations: Vec<LocationObservation>,
}

impl LocationLog {
    pub fn empty() -> Self {
        Self {
            observations: vec![],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LocationAction {
    Record { observation: LocationObservation },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationLogReply {
    pub log: LocationLog,
    pub changed: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PlannedKind {
    Direct,
    Contained,
    Provisional,
}

/// Where the adopted plan says the unit goes. Never an actual location.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlannedRef {
    pub kind: PlannedKind,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub label: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub reason_code: Option<String>,
}

/// The latest user-recorded location claim covering the unit.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObservedRef {
    pub kind: ObservationKind,
    /// The user-stated place. `confirm` and `lost` carry no text; a
    /// `confirm` row's actual place is the bound planned location.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub location: Option<String>,
    /// The adopted plan id the observation was recorded against.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub plan_snapshot_id: Option<Digest>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum LocationStatus {
    /// No plan and no observation claim a location.
    Unlocated,
    /// The plan names a location but no observation covers the unit.
    PlannedOnly,
    /// User-confirmed at the bound plan's location.
    Confirmed,
    /// The user observed the unit elsewhere than the plan says.
    Mismatch,
    /// The user observed a location and no plan covers the unit.
    Observed,
    /// The user reported the unit missing.
    Lost,
    /// A `confirm` recorded against another plan. Not a current location.
    StaleConfirmation,
}

/// One location row: a maximal run of an item's units sharing the same
/// planned and observed state. Different items and split unit groups are
/// never merged into one row.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationRow {
    pub item_id: Id,
    pub label: String,
    pub category: String,
    /// The item's whole-quantity label. A row's covered units stay in
    /// `unit_ordinals`; they are not summed into another item's count.
    pub quantity_code: QuantityLabelCode,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub quantity_count: Option<u32>,
    /// Covered unit ordinals. Empty marks an item-level row whose quantity
    /// is unknown or known zero, not "all units".
    pub unit_ordinals: Vec<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub matched_alias: Option<String>,
    pub status: LocationStatus,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<PlannedRef>")]
    pub planned: Option<PlannedRef>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<ObservedRef>")]
    pub observed: Option<ObservedRef>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocationSearchReply {
    pub rows: Vec<LocationRow>,
    pub truncated: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocationFailure {
    pub code: &'static str,
}

fn fail(code: &'static str) -> LocationFailure {
    LocationFailure { code }
}

fn nfc_bounded(text: &str, empty_ok: bool) -> Result<String, LocationFailure> {
    let normalized: String = text.trim().nfc().collect();
    if normalized.is_empty() {
        return if empty_ok {
            Ok(normalized)
        } else {
            Err(fail("invalid_label"))
        };
    }
    if normalized.chars().count() > MAX_LABEL_CHARS {
        return Err(fail("invalid_label"));
    }
    Ok(normalized)
}

fn location_required(kind: ObservationKind) -> bool {
    matches!(
        kind,
        ObservationKind::Relocate | ObservationKind::Reorganize
    )
}

fn check_place(place: &Option<String>, required: bool) -> Result<(), LocationFailure> {
    match place {
        Some(text) => {
            if !required {
                return Err(fail("location_forbidden"));
            }
            if &nfc_bounded(text, false)? != text {
                return Err(fail("invalid_label"));
            }
            Ok(())
        }
        None => {
            if required {
                Err(fail("location_required"))
            } else {
                Ok(())
            }
        }
    }
}

/// Structural check for an already-stored observation: normalized label,
/// kind/location agreement, ordinal bounds, and the confirm binding a
/// well-formed log always carries.
fn check_observation(observation: &LocationObservation) -> Result<(), LocationFailure> {
    if nfc_bounded(&observation.label, false)? != observation.label {
        return Err(fail("invalid_label"));
    }
    check_place(&observation.location, location_required(observation.kind))?;
    if observation.unit_ordinals.len() > MAX_ORDINALS {
        return Err(fail("input_limit_exceeded"));
    }
    let mut seen = BTreeSet::new();
    if observation
        .unit_ordinals
        .iter()
        .any(|ordinal| !seen.insert(*ordinal))
    {
        return Err(fail("duplicate_ordinal"));
    }
    if observation.kind == ObservationKind::Alias && !observation.unit_ordinals.is_empty() {
        return Err(fail("ordinals_forbidden"));
    }
    if observation.kind == ObservationKind::Confirm && observation.plan_snapshot_id.is_none() {
        return Err(fail("confirm_needs_plan"));
    }
    Ok(())
}

fn check_log(log: &LocationLog) -> Result<(), LocationFailure> {
    if log.observations.len() > MAX_OBSERVATIONS {
        return Err(fail("input_limit_exceeded"));
    }
    let mut ids = BTreeSet::new();
    for observation in &log.observations {
        if !ids.insert(observation.id.as_str()) {
            return Err(fail("duplicate_observation"));
        }
        check_observation(observation)?;
    }
    Ok(())
}

fn check_input(input: &ProjectInput) -> Result<(), LocationFailure> {
    if input.items.len() > MAX_ITEMS {
        return Err(fail("input_limit_exceeded"));
    }
    let mut ids = BTreeSet::new();
    for item in &input.items {
        if !ids.insert(item.id.as_str()) {
            return Err(fail("invalid_input"));
        }
    }
    Ok(())
}

fn item_quantity(item: &Item) -> Option<u32> {
    item.quantity.value().copied().map(Quantity::get)
}

fn find_item<'a>(input: &'a ProjectInput, item_id: &Id) -> Option<&'a Item> {
    input.items.iter().find(|item| &item.id == item_id)
}

fn aliases_of(log: &LocationLog, item_id: &Id) -> Vec<String> {
    log.observations
        .iter()
        .filter(|observation| {
            observation.kind == ObservationKind::Alias && &observation.item_id == item_id
        })
        .map(|observation| observation.label.clone())
        .collect()
}

/// Resolve a container placement's subject into a readable name. Owned
/// containers carry no label of their own, so their pinned variant or id
/// names them; new containers use the referenced catalog subset.
fn container_label(input: &ProjectInput, snapshot: &PlanSnapshot, placement_id: &Id) -> String {
    let placement = snapshot
        .content
        .placements
        .iter()
        .find(|placement| &placement.id == placement_id);
    let Some(placement) = placement else {
        return placement_id.to_string();
    };
    let variant_label = |variant_id: &Id| -> String {
        let subset = &snapshot.content.referenced_catalog;
        let variant = subset
            .variants
            .iter()
            .find(|variant| &variant.id == variant_id);
        let Some(variant) = variant else {
            return variant_id.to_string();
        };
        let product = subset
            .products
            .iter()
            .find(|product| product.id == variant.product_id);
        match product {
            Some(product) => format!("{} {}", product.name, variant.option_label),
            None => variant.option_label.clone(),
        }
    };
    match &placement.subject {
        PlacementSubject::OwnedContainer { owned_id, .. } => {
            match input
                .owned_containers
                .iter()
                .find(|owned| &owned.id == owned_id)
                .and_then(|owned| owned.variant_ref.as_ref())
            {
                Some(reference) => variant_label(&reference.variant_id),
                None => owned_id.to_string(),
            }
        }
        PlacementSubject::NewContainer { variant_id, .. } => variant_label(variant_id),
        PlacementSubject::DirectItem { item_id, .. } => item_id.to_string(),
    }
}

fn planned_for(
    input: &ProjectInput,
    snapshot: &PlanSnapshot,
    item_id: &Id,
    ordinal: u32,
) -> Option<PlannedRef> {
    let assignment =
        snapshot.content.assignments.iter().find(|assignment| {
            &assignment.item_id == item_id && assignment.unit_ordinal == ordinal
        })?;
    let (kind, container_id, reason_code) = match &assignment.location {
        ItemLocation::Direct { .. } => (PlannedKind::Direct, None, None),
        ItemLocation::Contained {
            container_placement_id,
            ..
        } => (PlannedKind::Contained, Some(container_placement_id), None),
        ItemLocation::ProvisionalContainer {
            container_placement_id,
            reason_code,
        } => (
            PlannedKind::Provisional,
            Some(container_placement_id),
            Some(reason_code.clone()),
        ),
    };
    let label = container_id.map(|id| container_label(input, snapshot, id));
    Some(PlannedRef {
        kind,
        label,
        reason_code,
    })
}

/// Latest non-alias observation covering the unit. `None` ordinal marks
/// an item-level row where only whole-item observations apply.
fn observed_for(log: &LocationLog, item_id: &Id, ordinal: Option<u32>) -> Option<ObservedRef> {
    log.observations
        .iter()
        .rfind(|observation| {
            &observation.item_id == item_id
                && observation.kind != ObservationKind::Alias
                && match ordinal {
                    Some(ordinal) => {
                        observation.unit_ordinals.is_empty()
                            || observation.unit_ordinals.contains(&ordinal)
                    }
                    None => observation.unit_ordinals.is_empty(),
                }
        })
        .map(|observation| ObservedRef {
            kind: observation.kind,
            location: observation.location.clone(),
            plan_snapshot_id: observation.plan_snapshot_id.clone(),
        })
}

fn status_of(
    snapshot: Option<&PlanSnapshot>,
    planned: &Option<PlannedRef>,
    observed: &Option<ObservedRef>,
) -> LocationStatus {
    match observed {
        Some(observed) => match observed.kind {
            ObservationKind::Lost => LocationStatus::Lost,
            ObservationKind::Confirm => {
                if planned.is_some()
                    && snapshot.is_some_and(|snapshot| {
                        observed.plan_snapshot_id.as_ref() == Some(&snapshot.plan_snapshot_id)
                    })
                {
                    LocationStatus::Confirmed
                } else {
                    LocationStatus::StaleConfirmation
                }
            }
            ObservationKind::Relocate | ObservationKind::Reorganize => {
                if planned.is_some() {
                    LocationStatus::Mismatch
                } else {
                    LocationStatus::Observed
                }
            }
            ObservationKind::Alias => unreachable!("alias observations index no location"),
        },
        None => {
            if planned.is_some() {
                LocationStatus::PlannedOnly
            } else {
                LocationStatus::Unlocated
            }
        }
    }
}

#[derive(PartialEq, Eq)]
struct UnitState {
    planned: Option<PlannedRef>,
    observed: Option<ObservedRef>,
}

pub fn apply_location_log(
    log: &LocationLog,
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    action: &LocationAction,
) -> Result<LocationLogReply, LocationFailure> {
    check_log(log)?;
    check_input(input)?;
    match action {
        LocationAction::Record { observation } => record(log, input, snapshot, observation),
    }
}

fn record(
    log: &LocationLog,
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    observation: &LocationObservation,
) -> Result<LocationLogReply, LocationFailure> {
    if log.observations.len() >= MAX_OBSERVATIONS {
        return Err(fail("input_limit_exceeded"));
    }
    if log
        .observations
        .iter()
        .any(|existing| existing.id == observation.id)
    {
        return Err(fail("duplicate_observation"));
    }
    let item = find_item(input, &observation.item_id).ok_or(fail("subject_missing"))?;
    let mut stored = observation.clone();
    match observation.kind {
        ObservationKind::Alias => {
            if !observation.unit_ordinals.is_empty() {
                return Err(fail("ordinals_forbidden"));
            }
            check_place(&observation.location, false)?;
            stored.label = nfc_bounded(&observation.label, false)?;
            if stored.label == item.label
                || aliases_of(log, &item.id)
                    .iter()
                    .any(|alias| alias == &stored.label)
            {
                return Err(fail("duplicate_alias"));
            }
        }
        ObservationKind::Confirm | ObservationKind::Lost => {
            check_place(&observation.location, false)?;
            stored.label = nfc_bounded(&observation.label, false)?;
            if stored.label != item.label {
                return Err(fail("label_conflict"));
            }
            check_ordinals(item, &observation.unit_ordinals)?;
            if observation.kind == ObservationKind::Confirm {
                let snapshot = snapshot.ok_or(fail("confirm_needs_plan"))?;
                if observation.unit_ordinals.is_empty() {
                    // An all-unit confirm is only honest when every unit
                    // has a planned spot to confirm against.
                    let count = item_quantity(item).ok_or(fail("quantity_unknown"))?;
                    let all_planned = count > 0
                        && (0..count).all(|ordinal| {
                            planned_for(input, snapshot, &item.id, ordinal).is_some()
                        });
                    if !all_planned {
                        return Err(fail("confirm_needs_plan"));
                    }
                } else {
                    for ordinal in &observation.unit_ordinals {
                        if planned_for(input, snapshot, &item.id, *ordinal).is_none() {
                            return Err(fail("no_planned_location"));
                        }
                    }
                }
            }
        }
        ObservationKind::Relocate | ObservationKind::Reorganize => {
            check_place(&observation.location, true)?;
            stored.label = nfc_bounded(&observation.label, false)?;
            if stored.label != item.label {
                return Err(fail("label_conflict"));
            }
            stored.location = Some(nfc_bounded(
                observation.location.as_deref().unwrap_or_default(),
                false,
            )?);
            check_ordinals(item, &observation.unit_ordinals)?;
        }
    }
    stored.plan_snapshot_id = snapshot.map(|snapshot| snapshot.plan_snapshot_id.clone());
    let mut next = log.clone();
    next.observations.push(stored);
    Ok(LocationLogReply {
        log: next,
        changed: true,
    })
}

fn check_ordinals(item: &Item, ordinals: &[u32]) -> Result<(), LocationFailure> {
    if ordinals.is_empty() {
        return Ok(());
    }
    if ordinals.len() > MAX_ORDINALS {
        return Err(fail("input_limit_exceeded"));
    }
    let count = item_quantity(item).ok_or(fail("quantity_unknown"))?;
    let mut seen = BTreeSet::new();
    for ordinal in ordinals {
        if !seen.insert(*ordinal) {
            return Err(fail("duplicate_ordinal"));
        }
        if *ordinal >= count {
            return Err(fail("ordinal_out_of_range"));
        }
    }
    Ok(())
}

fn quantity_label(item: &Item) -> (QuantityLabelCode, Option<u32>) {
    match item_quantity(item) {
        None => (QuantityLabelCode::Unknown, None),
        Some(0) => (QuantityLabelCode::Zero, Some(0)),
        Some(count) => (QuantityLabelCode::Count, Some(count)),
    }
}

fn folded(text: &str) -> String {
    text.to_lowercase()
}

/// `Some(alias)` when the query matches the item through an alias,
/// `Some(None)` through id/label/category/quantity, `None` when it does
/// not match the item at all.
fn item_matches(item: &Item, aliases: &[String], folded_query: &str) -> Option<Option<String>> {
    if folded_query.is_empty() {
        return Some(None);
    }
    if folded(item.id.as_str()).contains(folded_query)
        || folded(&item.label).contains(folded_query)
        || folded(&item.category).contains(folded_query)
    {
        return Some(None);
    }
    if let Some(alias) = aliases
        .iter()
        .find(|alias| folded(alias.as_str()).contains(folded_query))
    {
        return Some(Some(alias.clone()));
    }
    if let Ok(Some(quantity)) = parse_quantity(folded_query)
        && item_quantity(item) == Some(quantity.get())
    {
        return Some(None);
    }
    None
}

fn planned_text_match(state: &UnitState, folded_query: &str) -> bool {
    state.planned.as_ref().is_some_and(|planned| {
        planned
            .label
            .as_ref()
            .is_some_and(|label| folded(label.as_str()).contains(folded_query))
            || planned
                .reason_code
                .as_ref()
                .is_some_and(|reason| folded(reason.as_str()).contains(folded_query))
    })
}

fn observed_text_match(state: &UnitState, folded_query: &str) -> bool {
    state
        .observed
        .as_ref()
        .and_then(|observed| observed.location.as_ref())
        .is_some_and(|place| folded(place.as_str()).contains(folded_query))
}

/// The local read model: every input item split into rows by the
/// (planned, observed) combination, never merged across items or across
/// partial unit groups.
pub fn search_locations(
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    log: &LocationLog,
    query: &str,
) -> Result<LocationSearchReply, LocationFailure> {
    check_log(log)?;
    check_input(input)?;
    let normalized = nfc_bounded(query, true)?;
    let folded_query = folded(&normalized);
    let mut rows: Vec<LocationRow> = Vec::new();
    let mut truncated = false;
    'items: for item in &input.items {
        let aliases = aliases_of(log, &item.id);
        let item_hit = item_matches(item, &aliases, &folded_query);
        let matched_alias = item_hit.clone().flatten();
        let (quantity_code, quantity_count) = quantity_label(item);
        let mut emit = |unit_ordinals: Vec<u32>, state: UnitState, matched: Option<String>| {
            if rows.len() >= MAX_ROWS {
                truncated = true;
                return;
            }
            rows.push(LocationRow {
                item_id: item.id.clone(),
                label: item.label.clone(),
                category: item.category.clone(),
                quantity_code,
                quantity_count,
                unit_ordinals,
                matched_alias: matched,
                status: status_of(snapshot, &state.planned, &state.observed),
                planned: state.planned,
                observed: state.observed,
            });
        };
        match item_quantity(item) {
            Some(count) if count > 0 => {
                // Group consecutive units sharing the same state so a
                // partially moved item stays visibly split.
                let mut group: Vec<u32> = Vec::new();
                let mut state: Option<UnitState> = None;
                for ordinal in 0..count {
                    let current = UnitState {
                        planned: snapshot
                            .and_then(|snap| planned_for(input, snap, &item.id, ordinal)),
                        observed: observed_for(log, &item.id, Some(ordinal)),
                    };
                    match state.take() {
                        Some(previous) if previous == current => {
                            group.push(ordinal);
                            state = Some(current);
                        }
                        previous_state => {
                            if let Some(previous) = previous_state {
                                let covered = std::mem::take(&mut group);
                                let hit = item_hit.is_some()
                                    || planned_text_match(&previous, &folded_query)
                                    || observed_text_match(&previous, &folded_query);
                                if hit {
                                    emit(covered, previous, matched_alias.clone());
                                }
                            }
                            group = vec![ordinal];
                            state = Some(current);
                        }
                    }
                }
                if let Some(last) = state {
                    let hit = item_hit.is_some()
                        || planned_text_match(&last, &folded_query)
                        || observed_text_match(&last, &folded_query);
                    if hit {
                        emit(group, last, matched_alias.clone());
                    }
                }
            }
            _ => {
                let state = UnitState {
                    planned: None,
                    observed: observed_for(log, &item.id, None),
                };
                let hit = item_hit.is_some() || observed_text_match(&state, &folded_query);
                if hit {
                    emit(Vec::new(), state, matched_alias);
                }
            }
        }
        if truncated {
            break 'items;
        }
    }
    Ok(LocationSearchReply { rows, truncated })
}
