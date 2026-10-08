//! Life ledger for owned items and containers.
//!
//! The ledger is not part of `ProjectInput` or `PlanSnapshot`. A historical
//! plan id is a read reference: applying `OpenHistorical` returns the same
//! ledger and does not read snapshot bytes. Unknown quantity and known zero
//! stay different facts.

use crate::facts::{Fact, MAX_LABEL_CHARS, Provenance, UnknownReason};
use crate::plan::CheckStatus;
use crate::scalars::{Digest, Id, Quantity, parse_quantity};
use crate::{MeasurementOrigin, VerificationStatus};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use unicode_normalization::UnicodeNormalization;

const MAX_SUBJECTS: usize = 64;
const MAX_EVENTS: usize = 256;
const MAX_CLAIMS: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OwnedUse {
    Skip,
    Pass,
    Fail(&'static str),
    Unknown(&'static str),
}

/// Ordinal consumption of one owned container. Duplicate ordinals fail even
/// when availability is unknown. An empty ordinal list emits no check.
pub fn owned_use(available: Option<u32>, ordinals: &[u32]) -> OwnedUse {
    if ordinals.is_empty() {
        return OwnedUse::Skip;
    }
    let mut seen = BTreeSet::new();
    if ordinals.iter().any(|ordinal| !seen.insert(*ordinal)) {
        return OwnedUse::Fail("owned_double_consume");
    }
    match available {
        Some(limit) if ordinals.iter().all(|ordinal| *ordinal < limit) => OwnedUse::Pass,
        Some(_) => OwnedUse::Fail("owned_overuse"),
        None => OwnedUse::Unknown("owned_availability_unknown"),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SubjectKind {
    Item,
    Container,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum HoldingKind {
    Individual,
    Bundle,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ContainerUse {
    Empty,
    InUse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum EventKind {
    Purchase,
    Return,
    Move,
    QuantityEdit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum QuantityLabelCode {
    Unknown,
    Zero,
    Count,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LedgerItem {
    pub id: Id,
    pub label: String,
    pub holding: HoldingKind,
    pub quantity: Fact<Quantity>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub location: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LedgerContainer {
    pub id: Id,
    pub label: String,
    pub usage: ContainerUse,
    pub quantity_owned: Fact<Quantity>,
    pub quantity_available: Fact<Quantity>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub location: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryEvent {
    pub id: Id,
    pub subject_kind: SubjectKind,
    pub subject_id: Id,
    pub kind: EventKind,
    pub quantity_text: String,
    pub label: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub location: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<HoldingKind>")]
    pub holding: Option<HoldingKind>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<ContainerUse>")]
    pub usage: Option<ContainerUse>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryLedger {
    pub items: Vec<LedgerItem>,
    pub containers: Vec<LedgerContainer>,
    pub events: Vec<InventoryEvent>,
}

impl InventoryLedger {
    pub fn empty() -> Self {
        Self {
            items: vec![],
            containers: vec![],
            events: vec![],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnedClaim {
    pub container_id: Id,
    pub unit_ordinal: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum InventoryAction {
    Record { event: InventoryEvent },
    Conserve { claims: Vec<OwnedClaim> },
    OpenHistorical { plan_snapshot_id: Digest },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuantityLabel {
    pub subject_id: Id,
    pub role: SubjectKind,
    pub code: QuantityLabelCode,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub count: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConservationVerdict {
    pub status: CheckStatus,
    pub reason_code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InventoryReply {
    pub ledger: InventoryLedger,
    pub changed: bool,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub historical_plan_id: Option<Digest>,
    pub labels: Vec<QuantityLabel>,
    pub conservation: ConservationVerdict,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InventoryFailure {
    pub code: &'static str,
}

pub fn apply_inventory(
    ledger: &InventoryLedger,
    action: &InventoryAction,
) -> Result<InventoryReply, InventoryFailure> {
    check_ledger(ledger)?;
    match action {
        InventoryAction::Record { event } => record(ledger, event),
        InventoryAction::Conserve { claims } => Ok(reply(
            ledger.clone(),
            false,
            None,
            conserve(ledger, claims)?,
        )),
        InventoryAction::OpenHistorical { plan_snapshot_id } => Ok(reply(
            ledger.clone(),
            false,
            Some(plan_snapshot_id.clone()),
            pass_verdict(),
        )),
    }
}

fn fail(code: &'static str) -> InventoryFailure {
    InventoryFailure { code }
}

fn declared_provenance() -> Provenance {
    Provenance {
        origin: MeasurementOrigin::UserDeclared,
        verification: VerificationStatus::Unverified,
        evidence_ids: vec![],
        rule_ids: vec![],
        input_refs: vec![],
        observed_at: None,
    }
}

fn known_qty(value: Quantity) -> Fact<Quantity> {
    Fact::Known {
        value,
        provenance: declared_provenance(),
    }
}

fn unknown_qty() -> Fact<Quantity> {
    Fact::Unknown {
        reason: UnknownReason::NotProvided,
    }
}

fn parse_qty(text: &str) -> Result<Fact<Quantity>, InventoryFailure> {
    match parse_quantity(text) {
        Ok(None) => Ok(unknown_qty()),
        Ok(Some(value)) => Ok(known_qty(value)),
        Err(_) => Err(fail("quantity_invalid")),
    }
}

fn fact_count(fact: &Fact<Quantity>) -> Result<Option<u32>, InventoryFailure> {
    match fact {
        Fact::Known { value, .. } => Ok(Some(value.get())),
        Fact::Unknown { .. } => Ok(None),
        Fact::NotApplicable { .. } => Err(fail("quantity_not_applicable")),
    }
}

fn individual_ok(fact: &Fact<Quantity>) -> Result<(), InventoryFailure> {
    if fact_count(fact)?.is_some_and(|count| count > 1) {
        return Err(fail("individual_quantity"));
    }
    Ok(())
}

fn nfc_bounded(text: &str, empty_ok: bool) -> Result<String, InventoryFailure> {
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

fn check_fact(fact: &Fact<Quantity>) -> Result<(), InventoryFailure> {
    fact_count(fact).map(|_| ())
}

fn check_location(location: &Option<String>) -> Result<(), InventoryFailure> {
    if let Some(place) = location {
        let normalized = nfc_bounded(place, false)?;
        if &normalized != place {
            return Err(fail("invalid_label"));
        }
    }
    Ok(())
}

fn check_ledger(ledger: &InventoryLedger) -> Result<(), InventoryFailure> {
    if ledger.items.len() > MAX_SUBJECTS
        || ledger.containers.len() > MAX_SUBJECTS
        || ledger.events.len() > MAX_EVENTS
    {
        return Err(fail("input_limit_exceeded"));
    }
    let mut items = BTreeSet::new();
    for item in &ledger.items {
        if !items.insert(item.id.as_str()) {
            return Err(fail("duplicate_subject"));
        }
        check_fact(&item.quantity)?;
        check_location(&item.location)?;
        if item.holding == HoldingKind::Individual {
            individual_ok(&item.quantity)?;
        }
        let _ = nfc_bounded(&item.label, false)?;
    }
    let mut containers = BTreeSet::new();
    for container in &ledger.containers {
        if !containers.insert(container.id.as_str()) {
            return Err(fail("duplicate_subject"));
        }
        check_fact(&container.quantity_owned)?;
        check_fact(&container.quantity_available)?;
        check_location(&container.location)?;
        match (
            fact_count(&container.quantity_owned)?,
            fact_count(&container.quantity_available)?,
        ) {
            (Some(owned), Some(available)) if available > owned => {
                return Err(fail("available_exceeds_owned"));
            }
            _ => {}
        }
        let _ = nfc_bounded(&container.label, false)?;
    }
    let mut events = BTreeSet::new();
    for event in &ledger.events {
        if !events.insert(event.id.as_str()) {
            return Err(fail("duplicate_event"));
        }
    }
    Ok(())
}

fn pass_verdict() -> ConservationVerdict {
    ConservationVerdict {
        status: CheckStatus::Pass,
        reason_code: "ok".into(),
    }
}

fn labels_of(ledger: &InventoryLedger) -> Vec<QuantityLabel> {
    let mut labels = Vec::new();
    for item in &ledger.items {
        labels.push(label_for(
            item.id.clone(),
            SubjectKind::Item,
            &item.quantity,
        ));
    }
    for container in &ledger.containers {
        labels.push(label_for(
            container.id.clone(),
            SubjectKind::Container,
            &container.quantity_owned,
        ));
    }
    labels
}

fn label_for(subject_id: Id, role: SubjectKind, fact: &Fact<Quantity>) -> QuantityLabel {
    match fact_count(fact) {
        Ok(None) => QuantityLabel {
            subject_id,
            role,
            code: QuantityLabelCode::Unknown,
            count: None,
        },
        Ok(Some(0)) => QuantityLabel {
            subject_id,
            role,
            code: QuantityLabelCode::Zero,
            count: Some(0),
        },
        Ok(Some(count)) => QuantityLabel {
            subject_id,
            role,
            code: QuantityLabelCode::Count,
            count: Some(count),
        },
        Err(_) => QuantityLabel {
            subject_id,
            role,
            code: QuantityLabelCode::Unknown,
            count: None,
        },
    }
}

fn reply(
    mut ledger: InventoryLedger,
    changed: bool,
    historical_plan_id: Option<Digest>,
    conservation: ConservationVerdict,
) -> InventoryReply {
    ledger.items.sort_by(|a, b| a.id.cmp(&b.id));
    ledger.containers.sort_by(|a, b| a.id.cmp(&b.id));
    let labels = labels_of(&ledger);
    InventoryReply {
        ledger,
        changed,
        historical_plan_id,
        labels,
        conservation,
    }
}

fn add_count(current: u32, delta: u32) -> Result<u32, InventoryFailure> {
    current.checked_add(delta).ok_or(fail("quantity_overflow"))
}

fn record(
    ledger: &InventoryLedger,
    event: &InventoryEvent,
) -> Result<InventoryReply, InventoryFailure> {
    if ledger.events.len() >= MAX_EVENTS {
        return Err(fail("input_limit_exceeded"));
    }
    if ledger.events.iter().any(|existing| existing.id == event.id) {
        return Err(fail("duplicate_event"));
    }
    let label = nfc_bounded(&event.label, false)?;
    let location = match &event.location {
        Some(place) => Some(nfc_bounded(place, false)?),
        None => None,
    };
    let mut next = ledger.clone();
    let stored = InventoryEvent {
        label: label.clone(),
        location: location.clone(),
        ..event.clone()
    };
    match event.subject_kind {
        SubjectKind::Item => record_item(&mut next, &stored, &label, location)?,
        SubjectKind::Container => record_container(&mut next, &stored, &label, location)?,
    }
    next.events.push(stored);
    Ok(reply(next, true, None, pass_verdict()))
}

fn record_item(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    location: Option<String>,
) -> Result<(), InventoryFailure> {
    if event.usage.is_some() {
        return Err(fail("usage_conflict"));
    }
    let index = ledger
        .items
        .iter()
        .position(|item| item.id == event.subject_id);
    match event.kind {
        EventKind::Purchase => purchase_item(ledger, event, label, index)?,
        EventKind::Return => return_item(ledger, event, label, index)?,
        EventKind::Move => move_item(ledger, event, label, location, index)?,
        EventKind::QuantityEdit => edit_item(ledger, event, label, index)?,
    }
    Ok(())
}

fn purchase_item(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    if event.location.is_some() {
        return Err(fail("purchase_has_location"));
    }
    let quantity = parse_qty(&event.quantity_text)?;
    let Some(count) = fact_count(&quantity)? else {
        return create_or_reject_unknown_purchase(ledger, event, label, index, quantity);
    };
    if count == 0 {
        return Err(fail("purchase_empty"));
    }
    match index {
        None => {
            if ledger.items.len() >= MAX_SUBJECTS {
                return Err(fail("input_limit_exceeded"));
            }
            let holding = event.holding.ok_or(fail("holding_required"))?;
            if holding == HoldingKind::Individual {
                individual_ok(&quantity)?;
            }
            ledger.items.push(LedgerItem {
                id: event.subject_id.clone(),
                label: label.to_owned(),
                holding,
                quantity,
                location: None,
            });
        }
        Some(index) => {
            let item = &mut ledger.items[index];
            if item.label != label {
                return Err(fail("label_conflict"));
            }
            if event.holding.is_some_and(|holding| holding != item.holding) {
                return Err(fail("holding_conflict"));
            }
            let current = fact_count(&item.quantity)?.ok_or(fail("quantity_unknown"))?;
            let sum = add_count(current, count)?;
            let next = known_qty(Quantity::new(sum).map_err(|_| fail("quantity_overflow"))?);
            if item.holding == HoldingKind::Individual {
                individual_ok(&next)?;
            }
            item.quantity = next;
        }
    }
    Ok(())
}

fn create_or_reject_unknown_purchase(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
    quantity: Fact<Quantity>,
) -> Result<(), InventoryFailure> {
    if index.is_some() {
        return Err(fail("quantity_unknown"));
    }
    if ledger.items.len() >= MAX_SUBJECTS {
        return Err(fail("input_limit_exceeded"));
    }
    let holding = event.holding.ok_or(fail("holding_required"))?;
    ledger.items.push(LedgerItem {
        id: event.subject_id.clone(),
        label: label.to_owned(),
        holding,
        quantity,
        location: None,
    });
    Ok(())
}

fn return_item(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    let index = index.ok_or(fail("subject_missing"))?;
    let item = &mut ledger.items[index];
    if item.label != label {
        return Err(fail("label_conflict"));
    }
    let delta = known_delta(&event.quantity_text)?;
    let current = fact_count(&item.quantity)?.ok_or(fail("quantity_unknown"))?;
    let left = current.checked_sub(delta).ok_or(fail("quantity_short"))?;
    item.quantity = known_qty(Quantity::new(left).map_err(|_| fail("quantity_short"))?);
    if left == 0 {
        item.location = None;
    }
    Ok(())
}

fn move_item(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    location: Option<String>,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    if !event.quantity_text.trim().is_empty() {
        return Err(fail("move_has_quantity"));
    }
    let location = location.ok_or(fail("move_needs_location"))?;
    let index = index.ok_or(fail("subject_missing"))?;
    let item = &mut ledger.items[index];
    if item.label != label {
        return Err(fail("label_conflict"));
    }
    item.location = Some(location);
    Ok(())
}

fn edit_item(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    let index = index.ok_or(fail("subject_missing"))?;
    let quantity = parse_qty(&event.quantity_text)?;
    let item = &mut ledger.items[index];
    if item.label != label {
        return Err(fail("label_conflict"));
    }
    if item.holding == HoldingKind::Individual {
        individual_ok(&quantity)?;
    }
    if fact_count(&quantity)? == Some(0) {
        item.location = None;
    }
    item.quantity = quantity;
    Ok(())
}

fn record_container(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    location: Option<String>,
) -> Result<(), InventoryFailure> {
    if event.holding.is_some() {
        return Err(fail("holding_conflict"));
    }
    let index = ledger
        .containers
        .iter()
        .position(|container| container.id == event.subject_id);
    match event.kind {
        EventKind::Purchase => purchase_container(ledger, event, label, index)?,
        EventKind::Return => return_container(ledger, event, label, index)?,
        EventKind::Move => move_container(ledger, event, label, location, index)?,
        EventKind::QuantityEdit => edit_container(ledger, event, label, index)?,
    }
    Ok(())
}

fn purchase_container(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    if event.location.is_some() {
        return Err(fail("purchase_has_location"));
    }
    let quantity = parse_qty(&event.quantity_text)?;
    let Some(count) = fact_count(&quantity)? else {
        if index.is_some() {
            return Err(fail("quantity_unknown"));
        }
        return push_container(ledger, event, label, quantity);
    };
    if count == 0 {
        return Err(fail("purchase_empty"));
    }
    match index {
        None => push_container(ledger, event, label, quantity)?,
        Some(index) => {
            let container = &mut ledger.containers[index];
            if container.label != label {
                return Err(fail("label_conflict"));
            }
            if event.usage.is_some_and(|usage| usage != container.usage) {
                return Err(fail("usage_conflict"));
            }
            let owned = fact_count(&container.quantity_owned)?.ok_or(fail("quantity_unknown"))?;
            let available =
                fact_count(&container.quantity_available)?.ok_or(fail("quantity_unknown"))?;
            let next_owned = add_count(owned, count)?;
            let next_available = add_count(available, count)?;
            container.quantity_owned =
                known_qty(Quantity::new(next_owned).map_err(|_| fail("quantity_overflow"))?);
            container.quantity_available =
                known_qty(Quantity::new(next_available).map_err(|_| fail("quantity_overflow"))?);
        }
    }
    Ok(())
}

fn push_container(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    quantity: Fact<Quantity>,
) -> Result<(), InventoryFailure> {
    if ledger.containers.len() >= MAX_SUBJECTS {
        return Err(fail("input_limit_exceeded"));
    }
    let usage = event.usage.ok_or(fail("usage_required"))?;
    if fact_count(&quantity)? == Some(0) {
        return Err(fail("purchase_empty"));
    }
    ledger.containers.push(LedgerContainer {
        id: event.subject_id.clone(),
        label: label.to_owned(),
        usage,
        quantity_owned: quantity.clone(),
        quantity_available: quantity,
        location: None,
    });
    Ok(())
}

fn return_container(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    let index = index.ok_or(fail("subject_missing"))?;
    let delta = known_delta(&event.quantity_text)?;
    let container = &mut ledger.containers[index];
    if container.label != label {
        return Err(fail("label_conflict"));
    }
    let owned = fact_count(&container.quantity_owned)?.ok_or(fail("quantity_unknown"))?;
    let available = fact_count(&container.quantity_available)?.ok_or(fail("quantity_unknown"))?;
    if delta > owned || delta > available {
        return Err(fail("quantity_short"));
    }
    container.quantity_owned =
        known_qty(Quantity::new(owned - delta).map_err(|_| fail("quantity_short"))?);
    container.quantity_available =
        known_qty(Quantity::new(available - delta).map_err(|_| fail("quantity_short"))?);
    if owned - delta == 0 {
        container.usage = ContainerUse::Empty;
        container.location = None;
    }
    Ok(())
}

fn move_container(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    location: Option<String>,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    if !event.quantity_text.trim().is_empty() {
        return Err(fail("move_has_quantity"));
    }
    let location = location.ok_or(fail("move_needs_location"))?;
    let index = index.ok_or(fail("subject_missing"))?;
    let container = &mut ledger.containers[index];
    if container.label != label {
        return Err(fail("label_conflict"));
    }
    if fact_count(&container.quantity_owned)? == Some(0) {
        return Err(fail("empty_quantity_move"));
    }
    container.location = Some(location);
    container.usage = ContainerUse::InUse;
    Ok(())
}

fn edit_container(
    ledger: &mut InventoryLedger,
    event: &InventoryEvent,
    label: &str,
    index: Option<usize>,
) -> Result<(), InventoryFailure> {
    let index = index.ok_or(fail("subject_missing"))?;
    let quantity = parse_qty(&event.quantity_text)?;
    let container = &mut ledger.containers[index];
    if container.label != label {
        return Err(fail("label_conflict"));
    }
    let count = fact_count(&quantity)?;
    if count == Some(0) {
        container.usage = ContainerUse::Empty;
        container.location = None;
    } else if let Some(usage) = event.usage {
        container.usage = usage;
    }
    container.quantity_owned = quantity.clone();
    container.quantity_available = quantity;
    Ok(())
}

fn known_delta(text: &str) -> Result<u32, InventoryFailure> {
    match fact_count(&parse_qty(text)?)? {
        Some(count) if count >= 1 => Ok(count),
        Some(_) => Err(fail("quantity_delta")),
        None => Err(fail("quantity_unknown")),
    }
}

fn conserve(
    ledger: &InventoryLedger,
    claims: &[OwnedClaim],
) -> Result<ConservationVerdict, InventoryFailure> {
    if claims.len() > MAX_CLAIMS {
        return Err(fail("input_limit_exceeded"));
    }
    let mut grouped: BTreeMap<&str, Vec<u32>> = BTreeMap::new();
    for claim in claims {
        grouped
            .entry(claim.container_id.as_str())
            .or_default()
            .push(claim.unit_ordinal);
    }
    let mut best: Option<(u8, CheckStatus, &'static str)> = None;
    let consider = |best: &mut Option<(u8, CheckStatus, &'static str)>,
                    rank: u8,
                    status: CheckStatus,
                    reason: &'static str| {
        if best.as_ref().is_none_or(|current| rank > current.0) {
            *best = Some((rank, status, reason));
        }
    };
    for (id, ordinals) in grouped {
        let mut seen = BTreeSet::new();
        if ordinals.iter().any(|ordinal| !seen.insert(*ordinal)) {
            consider(&mut best, 5, CheckStatus::Fail, "owned_double_consume");
        }
        let Some(container) = ledger
            .containers
            .iter()
            .find(|container| container.id.as_str() == id)
        else {
            consider(
                &mut best,
                2,
                CheckStatus::Unknown,
                "container_not_in_ledger",
            );
            continue;
        };
        if container.usage == ContainerUse::Empty {
            consider(&mut best, 4, CheckStatus::Fail, "empty_container_consumed");
        }
        match fact_count(&container.quantity_available)? {
            Some(limit) if ordinals.iter().all(|ordinal| *ordinal < limit) => {}
            Some(_) => consider(&mut best, 3, CheckStatus::Fail, "owned_overuse"),
            None => consider(
                &mut best,
                1,
                CheckStatus::Unknown,
                "owned_availability_unknown",
            ),
        }
    }
    Ok(match best {
        None => pass_verdict(),
        Some((_, status, reason)) => ConservationVerdict {
            status,
            reason_code: reason.into(),
        },
    })
}
