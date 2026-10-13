//! Purchase handoff beside one immutable plan.
//!
//! Seller links, observation time, and unconfirmed money are a read model.
//! A substitute is rechecked with the validator. The previous pass is not
//! copied. Confirming a purchase, receiving the goods, measuring them, and
//! returning them are separate ledger events. Opening a seller link is not
//! an event and is not a payment. Affiliate marks do not enter the check.

use crate::canonical;
use crate::catalog::{
    CatalogSourceKind, InventoryState, Offer, Product, ProductVariant, ShippingRule,
};
use crate::facts::{Fact, MAX_URL_CHARS};
use crate::offer_bundles::{QuotedMoney, StockStatus};
use crate::plan::{
    CandidateLayout, CheckStatus, ConstraintCheck, OfferSelection, PlacementSubject, PlanSnapshot,
    PurchaseSelection,
};
use crate::scalars::{Id, MoneyKrw};
use crate::validate;
use crate::validator;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use unicode_normalization::UnicodeNormalization;

const MAX_EVENTS: usize = 256;
const MAX_AFFILIATE: usize = 32;
const MAX_NOTE_CHARS: usize = 256;
/// A price or stock reading older than this is stale. Seven days, not "now".
pub const FRESHNESS_WINDOW_SECONDS: i64 = 7 * 24 * 60 * 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PurchaseHandoffError {
    pub code: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PurchaseEventKind {
    ConfirmedPurchase,
    Received,
    Measured,
    Returned,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ObservationFreshness {
    Current,
    Stale,
    Unconfirmed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum HandoffSuitability {
    Pass,
    Fail,
    Unknown,
    NotApplicable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PurchaseImpact {
    None,
    MeasurementUnknown,
    DimensionsDiffer,
    Remeasured,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PurchaseLink {
    Http { url: String },
    Missing,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PurchaseEvent {
    pub id: Id,
    pub offer_id: Id,
    pub kind: PurchaseEventKind,
    pub note: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub measured_width_mm: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PurchaseLedger {
    pub events: Vec<PurchaseEvent>,
}

impl PurchaseLedger {
    pub fn empty() -> Self {
        Self { events: vec![] }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum PurchaseHandoffAction {
    Prepare {
        snapshot: PlanSnapshot,
        as_of: String,
        #[serde(default)]
        affiliate_offer_ids: Vec<Id>,
        ledger: PurchaseLedger,
    },
    Record {
        snapshot: PlanSnapshot,
        as_of: String,
        #[serde(default)]
        affiliate_offer_ids: Vec<Id>,
        ledger: PurchaseLedger,
        event: PurchaseEvent,
    },
    ReviewSubstitute {
        snapshot: PlanSnapshot,
        placement_id: Id,
        product: Product,
        variant: ProductVariant,
        offer: Offer,
        #[serde(default)]
        affiliate_offer_ids: Vec<Id>,
    },
    ClassifyFreshness {
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        observed_at: Option<String>,
        as_of: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepLine {
    pub line_id: Id,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub offer_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub variant_id: Option<Id>,
    pub seller_id: Id,
    pub link: PurchaseLink,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub observed_at: Option<String>,
    pub freshness: ObservationFreshness,
    pub stock: StockStatus,
    pub pack_price: QuotedMoney,
    pub subtotal: QuotedMoney,
    pub unconfirmed: Vec<String>,
    pub affiliate: bool,
    /// Always false. A seller link is not a payment.
    pub paid: bool,
    pub confirmed_purchase: bool,
    pub received: bool,
    pub measured: bool,
    pub returned: bool,
    pub impact: PurchaseImpact,
    /// Always false. A later measurement does not reuse the plan's pass.
    pub historical_pass_reused: bool,
    /// Always false. Measuring does not turn unknown into pass.
    pub measurement_promotes_pass: bool,
    pub suitability: HandoffSuitability,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SellerPrep {
    pub seller_id: Id,
    pub lines: Vec<PrepLine>,
    pub unconfirmed: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedHandoff {
    pub bound_revision: crate::scalars::Digest,
    pub sellers: Vec<SellerPrep>,
    pub records_payment: bool,
    pub affiliate_changes_suitability: bool,
    pub ledger: PurchaseLedger,
    pub changed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubstituteReview {
    pub bound_revision: crate::scalars::Digest,
    pub identity_assumed: bool,
    pub reused_pass: bool,
    pub adopted: bool,
    pub affiliate_changes_suitability: bool,
    pub records_payment: bool,
    pub suitability: HandoffSuitability,
    pub planned_variant_id: Id,
    pub substitute_variant_id: Id,
    pub same_variant_id: bool,
    pub reason_code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FreshnessClass {
    pub freshness: ObservationFreshness,
    pub records_payment: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PurchaseHandoffReply {
    Prepared { prepared: PreparedHandoff },
    Reviewed { review: SubstituteReview },
    Freshness { freshness: FreshnessClass },
}

pub fn prepare_purchase_handoff(
    action: &PurchaseHandoffAction,
) -> Result<PurchaseHandoffReply, PurchaseHandoffError> {
    match action {
        PurchaseHandoffAction::ClassifyFreshness { observed_at, as_of } => {
            Ok(PurchaseHandoffReply::Freshness {
                freshness: FreshnessClass {
                    freshness: classify_observation(observed_at.as_deref(), as_of),
                    records_payment: false,
                },
            })
        }
        PurchaseHandoffAction::Prepare {
            snapshot,
            as_of,
            affiliate_offer_ids,
            ledger,
        } => Ok(PurchaseHandoffReply::Prepared {
            prepared: prepare_list(snapshot, as_of, affiliate_offer_ids, ledger, false)?,
        }),
        PurchaseHandoffAction::Record {
            snapshot,
            as_of,
            affiliate_offer_ids,
            ledger,
            event,
        } => {
            let next = append_event(ledger, event)?;
            Ok(PurchaseHandoffReply::Prepared {
                prepared: prepare_list(snapshot, as_of, affiliate_offer_ids, &next, true)?,
            })
        }
        PurchaseHandoffAction::ReviewSubstitute {
            snapshot,
            placement_id,
            product,
            variant,
            offer,
            affiliate_offer_ids,
        } => {
            check_affiliate(affiliate_offer_ids)?;
            // Affiliate ids are not passed into the check.
            Ok(PurchaseHandoffReply::Reviewed {
                review: review_substitute(snapshot, placement_id, product, variant, offer)?,
            })
        }
    }
}

fn fail(code: &'static str) -> PurchaseHandoffError {
    PurchaseHandoffError { code }
}

fn check_affiliate(ids: &[Id]) -> Result<(), PurchaseHandoffError> {
    if ids.len() > MAX_AFFILIATE {
        Err(fail("affiliate_limit"))
    } else {
        Ok(())
    }
}

fn intact(snapshot: &PlanSnapshot) -> bool {
    canonical::snapshot_digest(&snapshot.content) == snapshot.plan_snapshot_id
}

fn append_event(
    ledger: &PurchaseLedger,
    event: &PurchaseEvent,
) -> Result<PurchaseLedger, PurchaseHandoffError> {
    if ledger.events.len() >= MAX_EVENTS {
        return Err(fail("event_limit"));
    }
    if ledger.events.iter().any(|prior| prior.id == event.id) {
        return Err(fail("duplicate_event"));
    }
    let note = event.note.nfc().collect::<String>();
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(fail("note_too_long"));
    }
    if event.kind == PurchaseEventKind::Measured
        && event
            .measured_width_mm
            .is_some_and(|width| !(1..=10_000).contains(&width))
    {
        return Err(fail("measured_width"));
    }
    let mut next = ledger.clone();
    let mut stored = event.clone();
    stored.note = note;
    if stored.kind != PurchaseEventKind::Measured {
        stored.measured_width_mm = None;
    }
    next.events.push(stored);
    Ok(next)
}

fn prepare_list(
    snapshot: &PlanSnapshot,
    as_of: &str,
    affiliate_offer_ids: &[Id],
    ledger: &PurchaseLedger,
    changed: bool,
) -> Result<PreparedHandoff, PurchaseHandoffError> {
    if !intact(snapshot) {
        return Err(fail("digest_mismatch"));
    }
    check_affiliate(affiliate_offer_ids)?;
    if ledger.events.len() > MAX_EVENTS {
        return Err(fail("event_limit"));
    }
    let offers = snapshot
        .content
        .referenced_catalog
        .offers
        .iter()
        .map(|offer| (offer.id.as_str(), offer))
        .collect::<BTreeMap<_, _>>();
    let mut grouped: BTreeMap<String, Vec<PrepLine>> = BTreeMap::new();
    for line in &snapshot.content.bom {
        if line.owned_id.is_some() {
            continue;
        }
        let offer = line
            .offer_id
            .as_ref()
            .and_then(|id| offers.get(id.as_str()).copied());
        let seller_id = offer
            .map(|offer| offer.seller_id.clone())
            .unwrap_or_else(|| Id::new("unlisted").expect("static id"));
        let (link, observed_at, freshness, stock, pack_price, mut unconfirmed) = match offer {
            Some(offer) => offer_facts(offer, as_of),
            None => (
                PurchaseLink::Missing,
                None,
                ObservationFreshness::Unconfirmed,
                StockStatus::Unknown,
                QuotedMoney::Unknown,
                vec!["price_unknown".into(), "stock_unknown".into()],
            ),
        };
        unconfirmed.push("tax_unknown".into());
        unconfirmed.sort();
        unconfirmed.dedup();
        let subtotal = money_of(&line.product_subtotal);
        if matches!(subtotal, QuotedMoney::Unknown)
            && !unconfirmed.iter().any(|code| code == "price_unknown")
        {
            unconfirmed.push("price_unknown".into());
            unconfirmed.sort();
        }
        let offer_id = line.offer_id.clone();
        let lifecycle = lifecycle_for(ledger, offer_id.as_ref());
        let impact = impact_for(snapshot, line.variant_id.as_ref(), &lifecycle);
        let prep = PrepLine {
            line_id: line.id.clone(),
            offer_id,
            variant_id: line.variant_id.clone(),
            seller_id: seller_id.clone(),
            link,
            observed_at,
            freshness,
            stock,
            pack_price,
            subtotal,
            unconfirmed,
            affiliate: line
                .offer_id
                .as_ref()
                .is_some_and(|id| affiliate_offer_ids.iter().any(|mark| mark == id)),
            paid: false,
            confirmed_purchase: lifecycle.confirmed,
            received: lifecycle.received,
            measured: lifecycle.measured,
            returned: lifecycle.returned,
            impact: impact.kind,
            historical_pass_reused: false,
            measurement_promotes_pass: false,
            suitability: line_suitability(snapshot, &line.placement_ids),
        };
        grouped
            .entry(seller_id.as_str().to_owned())
            .or_default()
            .push(prep);
    }
    let sellers = grouped
        .into_values()
        .map(|mut lines| {
            lines.sort_by(|left, right| left.line_id.cmp(&right.line_id));
            let seller_id = lines[0].seller_id.clone();
            let mut unconfirmed = lines
                .iter()
                .flat_map(|line| line.unconfirmed.iter().cloned())
                .collect::<Vec<_>>();
            unconfirmed.sort();
            unconfirmed.dedup();
            SellerPrep {
                seller_id,
                lines,
                unconfirmed,
            }
        })
        .collect();
    Ok(PreparedHandoff {
        bound_revision: snapshot.plan_snapshot_id.clone(),
        sellers,
        records_payment: false,
        affiliate_changes_suitability: false,
        ledger: ledger.clone(),
        changed,
    })
}

struct Lifecycle {
    confirmed: bool,
    received: bool,
    measured: bool,
    returned: bool,
    last_measured: Option<PurchaseEvent>,
}

fn lifecycle_for(ledger: &PurchaseLedger, offer_id: Option<&Id>) -> Lifecycle {
    let mut life = Lifecycle {
        confirmed: false,
        received: false,
        measured: false,
        returned: false,
        last_measured: None,
    };
    let Some(offer_id) = offer_id else {
        return life;
    };
    for event in &ledger.events {
        if &event.offer_id != offer_id {
            continue;
        }
        match event.kind {
            PurchaseEventKind::ConfirmedPurchase => life.confirmed = true,
            PurchaseEventKind::Received => life.received = true,
            PurchaseEventKind::Measured => {
                life.measured = true;
                life.last_measured = Some(event.clone());
            }
            PurchaseEventKind::Returned => life.returned = true,
        }
    }
    life
}

struct Impact {
    kind: PurchaseImpact,
}

fn impact_for(snapshot: &PlanSnapshot, variant_id: Option<&Id>, life: &Lifecycle) -> Impact {
    let Some(event) = &life.last_measured else {
        return Impact {
            kind: PurchaseImpact::None,
        };
    };
    let Some(width) = event.measured_width_mm else {
        return Impact {
            kind: PurchaseImpact::MeasurementUnknown,
        };
    };
    let planned = variant_id.and_then(|id| planned_width(snapshot, id));
    let Some(planned) = planned else {
        return Impact {
            kind: PurchaseImpact::MeasurementUnknown,
        };
    };
    Impact {
        kind: if planned == width {
            PurchaseImpact::Remeasured
        } else {
            PurchaseImpact::DimensionsDiffer
        },
    }
}

fn planned_width(snapshot: &PlanSnapshot, variant_id: &Id) -> Option<u32> {
    snapshot
        .content
        .referenced_catalog
        .variants
        .iter()
        .find(|variant| &variant.id == variant_id)
        .and_then(|variant| variant.dimensions.outer.width.value())
        .map(|measured| measured.nominal.get())
}

fn line_suitability(snapshot: &PlanSnapshot, placement_ids: &[Id]) -> HandoffSuitability {
    let checks = snapshot
        .content
        .validation
        .checks
        .iter()
        .filter(|check| {
            check
                .subject_ids
                .iter()
                .any(|id| placement_ids.iter().any(|placement| placement == id))
        })
        .collect::<Vec<_>>();
    suitability_of(&checks)
}

fn suitability_of(checks: &[&ConstraintCheck]) -> HandoffSuitability {
    if checks.is_empty() {
        return HandoffSuitability::NotApplicable;
    }
    if checks.iter().any(|check| check.status == CheckStatus::Fail) {
        return HandoffSuitability::Fail;
    }
    if checks
        .iter()
        .any(|check| check.status == CheckStatus::Unknown)
    {
        return HandoffSuitability::Unknown;
    }
    if checks.iter().any(|check| check.status == CheckStatus::Pass) {
        return HandoffSuitability::Pass;
    }
    HandoffSuitability::NotApplicable
}

fn offer_facts(
    offer: &Offer,
    as_of: &str,
) -> (
    PurchaseLink,
    Option<String>,
    ObservationFreshness,
    StockStatus,
    QuotedMoney,
    Vec<String>,
) {
    let mut unconfirmed = Vec::new();
    let pack_price = money_of(&offer.pack_price);
    if matches!(pack_price, QuotedMoney::Unknown) {
        unconfirmed.push("price_unknown".into());
    }
    match &offer.shipping {
        Fact::Unknown { .. } => unconfirmed.push("shipping_unknown".into()),
        Fact::Known { value, .. } => match value {
            ShippingRule::Complex {} => unconfirmed.push("shipping_complex".into()),
            ShippingRule::FixedPerSeller { fee } if fee.value().is_none() => {
                unconfirmed.push("shipping_unknown".into());
            }
            ShippingRule::Free {} | ShippingRule::FixedPerSeller { .. } => {}
        },
        Fact::NotApplicable { .. } => {}
    }
    let stock = match &offer.inventory {
        Fact::Known { value, .. } => match value {
            InventoryState::InStock => StockStatus::InStock,
            InventoryState::OutOfStock => StockStatus::OutOfStock,
        },
        Fact::Unknown { .. } | Fact::NotApplicable { .. } => {
            unconfirmed.push("stock_unknown".into());
            StockStatus::Unknown
        }
    };
    let observed_at = offer.observed_at.clone();
    let freshness = classify_observation(observed_at.as_deref(), as_of);
    (
        purchase_link(&offer.url),
        observed_at,
        freshness,
        stock,
        pack_price,
        unconfirmed,
    )
}

fn money_of(fact: &Fact<MoneyKrw>) -> QuotedMoney {
    match fact {
        Fact::Known { value, .. } => QuotedMoney::Known { amount: *value },
        Fact::Unknown { .. } => QuotedMoney::Unknown,
        Fact::NotApplicable { reason_code } => QuotedMoney::NotApplicable {
            reason_code: reason_code.clone(),
        },
    }
}

fn purchase_link(url: &Fact<String>) -> PurchaseLink {
    match url {
        Fact::Known { value, .. } => {
            let trimmed = value.trim();
            if trimmed.len() > MAX_URL_CHARS || trimmed.chars().any(char::is_whitespace) {
                return PurchaseLink::Rejected;
            }
            let lower = trimmed.to_ascii_lowercase();
            if lower.starts_with("https://") || lower.starts_with("http://") {
                PurchaseLink::Http {
                    url: trimmed.to_owned(),
                }
            } else {
                PurchaseLink::Rejected
            }
        }
        Fact::Unknown { .. } => PurchaseLink::Missing,
        Fact::NotApplicable { .. } => PurchaseLink::Missing,
    }
}

pub fn classify_observation(observed_at: Option<&str>, as_of: &str) -> ObservationFreshness {
    let Some(observed_at) = observed_at else {
        return ObservationFreshness::Unconfirmed;
    };
    let (Some(observed), Some(now)) = (unix_utc(observed_at), unix_utc(as_of)) else {
        return ObservationFreshness::Unconfirmed;
    };
    if observed > now {
        return ObservationFreshness::Unconfirmed;
    }
    if now - observed <= FRESHNESS_WINDOW_SECONDS {
        ObservationFreshness::Current
    } else {
        ObservationFreshness::Stale
    }
}

fn unix_utc(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() != 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
    {
        return None;
    }
    let year = parse_n(&bytes[0..4])?;
    let month = parse_n(&bytes[5..7])?;
    let day = parse_n(&bytes[8..10])?;
    let hour = parse_n(&bytes[11..13])?;
    let minute = parse_n(&bytes[14..16])?;
    let second = parse_n(&bytes[17..19])?;
    if !(1970..=2100).contains(&year) || !(1..=12).contains(&month) {
        return None;
    }
    let month = u32::try_from(month).ok()?;
    let day = u32::try_from(day).ok()?;
    let dim = days_in_month(year, month)?;
    if day < 1
        || day > dim
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&minute)
        || !(0..=59).contains(&second)
    {
        return None;
    }
    let days = days_from_civil(year, month, day)?;
    Some(days * 86_400 + i64::from(hour) * 3_600 + i64::from(minute) * 60 + i64::from(second))
}

fn parse_n(bytes: &[u8]) -> Option<i32> {
    if !bytes.iter().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let text = std::str::from_utf8(bytes).ok()?;
    text.parse().ok()
}

fn leap(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_in_month(year: i32, month: u32) -> Option<u32> {
    Some(match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap(year) => 29,
        2 => 28,
        _ => return None,
    })
}

/// Howard Hinnant's civil-from-days, days since 1970-01-01.
fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = u64::try_from(year - era * 400).ok()?;
    let month_prime = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * month_prime + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + u64::from(doy);
    Some(i64::from(era) * 146_097 + i64::try_from(doe).ok()? - 719_468)
}

fn review_substitute(
    snapshot: &PlanSnapshot,
    placement_id: &Id,
    product: &Product,
    variant: &ProductVariant,
    offer: &Offer,
) -> Result<SubstituteReview, PurchaseHandoffError> {
    if !intact(snapshot) {
        return Err(fail("digest_mismatch"));
    }
    if offer.variant_id != variant.id {
        return Err(fail("offer_not_for_variant"));
    }
    if variant.product_id != product.id {
        return Err(fail("product_mismatch"));
    }
    let mut layout = CandidateLayout {
        placements: snapshot.content.placements.clone(),
        assignments: snapshot.content.assignments.clone(),
        unassigned: snapshot.content.unassigned.clone(),
        purchase_selections: snapshot.content.purchase_selections.clone(),
    };
    let Some(placement) = layout
        .placements
        .iter_mut()
        .find(|placement| &placement.id == placement_id)
    else {
        return Err(fail("unknown_placement"));
    };
    let PlacementSubject::NewContainer { variant_id, .. } = &mut placement.subject else {
        return Ok(review_body(
            snapshot,
            Id::new("none").expect("static id"),
            variant.id.clone(),
            false,
            HandoffSuitability::NotApplicable,
            "not_purchased_placement",
        ));
    };
    let planned = variant_id.clone();
    let same = planned == variant.id;
    *variant_id = variant.id.clone();
    let offer_id = offer.id.clone();
    if let Some(selection) = layout
        .purchase_selections
        .iter_mut()
        .find(|selection| &selection.placement_id == placement_id)
    {
        selection.offer = OfferSelection::Selected { offer_id };
    } else {
        layout.purchase_selections.push(PurchaseSelection {
            placement_id: placement_id.clone(),
            offer: OfferSelection::Selected { offer_id },
        });
    }
    let catalog = review_catalog(snapshot, product, variant, offer);
    let input = &snapshot.content.input_facts;
    let variants = catalog
        .variants
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<BTreeMap<_, _>>();
    let offers = catalog
        .offers
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<BTreeMap<_, _>>();
    let diagnostics = validate::validate_layout(&layout, input, &variants, &offers);
    if !diagnostics.is_empty() {
        return Ok(review_body(
            snapshot,
            planned,
            variant.id.clone(),
            same,
            HandoffSuitability::Unknown,
            "structure_rejected",
        ));
    }
    let validation = validator::validate_candidate(input, &catalog, &layout);
    let checks = validation.report.checks.iter().collect::<Vec<_>>();
    let mut suitability = suitability_of(&checks);
    let mut reason = "rechecked";
    if geometry_unknown(variant) && suitability == HandoffSuitability::Pass {
        suitability = HandoffSuitability::Unknown;
        reason = "geometry_unknown";
    }
    Ok(review_body(
        snapshot,
        planned,
        variant.id.clone(),
        same,
        suitability,
        reason,
    ))
}

fn geometry_unknown(variant: &ProductVariant) -> bool {
    let outer = &variant.dimensions.outer;
    let inner = &variant.dimensions.inner;
    [
        &outer.width,
        &outer.depth,
        &outer.height,
        &inner.width,
        &inner.depth,
        &inner.height,
    ]
    .into_iter()
    .any(|axis| !matches!(axis, Fact::Known { .. }))
}

fn review_body(
    snapshot: &PlanSnapshot,
    planned: Id,
    substitute: Id,
    same: bool,
    suitability: HandoffSuitability,
    reason: &str,
) -> SubstituteReview {
    SubstituteReview {
        bound_revision: snapshot.plan_snapshot_id.clone(),
        identity_assumed: false,
        reused_pass: false,
        adopted: false,
        affiliate_changes_suitability: false,
        records_payment: false,
        suitability,
        planned_variant_id: planned,
        substitute_variant_id: substitute,
        same_variant_id: same,
        reason_code: reason.into(),
    }
}

fn review_catalog(
    snapshot: &PlanSnapshot,
    product: &Product,
    variant: &ProductVariant,
    offer: &Offer,
) -> canonical::CatalogContent {
    let referenced = &snapshot.content.referenced_catalog;
    let mut products = referenced.products.clone();
    let mut variants = referenced.variants.clone();
    let mut offers = referenced.offers.clone();
    upsert(&mut products, product.clone(), |item| &item.id);
    upsert(&mut variants, variant.clone(), |item| &item.id);
    upsert(&mut offers, offer.clone(), |item| &item.id);
    canonical::CatalogContent {
        schema_version: canonical::SCHEMA_VERSION,
        catalog_version: snapshot.content.versions.catalog_version.clone(),
        source_kind: CatalogSourceKind::Synthetic,
        products,
        variants,
        offers,
        evidence: referenced.evidence.clone(),
        ingestion_version: "purchase-handoff-review".into(),
        source_observations: vec![],
    }
}

fn upsert<T>(items: &mut Vec<T>, item: T, id: impl Fn(&T) -> &Id) {
    if let Some(slot) = items.iter_mut().find(|existing| id(existing) == id(&item)) {
        *slot = item;
    } else {
        items.push(item);
    }
}
