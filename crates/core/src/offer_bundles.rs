//! Seller quote for packs, required parts, and confirmed money.
//!
//! The quote is not a field of `PlanSnapshot`. Drawing, BOM, and the guide
//! stay on the snapshot a layout edit publishes. Unknown shipping is not
//! stored as a free total. A preview has no revision and does not publish.

use crate::catalog::{InventoryState, Offer, ShippingRule};
use crate::facts::Fact;
use crate::plan::{BOMLine, PlanSnapshot};
use crate::scalars::{Digest, Id, MoneyKrw, PackQuantity, Quantity};
use crate::validate;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const MAX_LINES: usize = 64;
const MAX_NOTES: usize = 32;
const MAX_ALTERNATES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OfferQuoteError {
    pub code: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum QuoteRole {
    Container,
    RequiredPart,
    OwnedReuse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum TaxStatus {
    Included,
    Excluded,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum StockStatus {
    InStock,
    OutOfStock,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ShippingStatus {
    Free,
    Fixed,
    Unknown,
    Complex,
    NotApplicable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum QuotedCount {
    Known { value: u32 },
    Unknown,
    NotApplicable { reason_code: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum QuotedMoney {
    Known { amount: MoneyKrw },
    Unknown,
    NotApplicable { reason_code: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PreviewShipping {
    Unknown,
    Free,
    Fixed { fee: MoneyKrw },
    Complex,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SellerTaxNote {
    pub seller_id: Id,
    pub tax: TaxStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfferPreviewLine {
    pub id: Id,
    pub role: QuoteRole,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub seller_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub variant_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub offer_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub physical_needed: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub reused: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub pack_quantity: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<MoneyKrw>")]
    pub pack_price: Option<MoneyKrw>,
    pub stock: StockStatus,
    pub shipping: PreviewShipping,
    pub included_in_parent: bool,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub minimum_packs: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub replacement_offer_id: Option<Id>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfferPreview {
    pub lines: Vec<OfferPreviewLine>,
    #[serde(default)]
    pub seller_notes: Vec<SellerTaxNote>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum OfferQuoteAction {
    Snapshot {
        snapshot: PlanSnapshot,
        #[serde(default)]
        alternates: Vec<Offer>,
        #[serde(default)]
        seller_notes: Vec<SellerTaxNote>,
    },
    Preview {
        preview: OfferPreview,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfferQuoteLine {
    pub id: Id,
    pub role: QuoteRole,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub seller_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub variant_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub offer_id: Option<Id>,
    pub physical_needed: QuotedCount,
    pub reused: QuotedCount,
    pub new_units: QuotedCount,
    pub pack_quantity: QuotedCount,
    pub packs_to_order: QuotedCount,
    pub supplied: QuotedCount,
    pub surplus: QuotedCount,
    pub minimum_units: QuotedCount,
    pub product_subtotal: QuotedMoney,
    pub included_in_parent: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SellerQuote {
    pub seller_id: Id,
    pub stock: StockStatus,
    pub shipping: QuotedMoney,
    pub shipping_status: ShippingStatus,
    pub tax: TaxStatus,
    pub offer_ids: Vec<Id>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnconfirmedAmount {
    pub code: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub seller_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub line_id: Option<Id>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoldOutReplacement {
    pub from_offer_id: Id,
    pub to_offer_id: Id,
    pub variant_id: Id,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub bound_revision: Option<Digest>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfferQuoteReply {
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub bound_revision: Option<Digest>,
    pub lines: Vec<OfferQuoteLine>,
    pub sellers: Vec<SellerQuote>,
    pub known_product: QuotedMoney,
    pub known_shipping: QuotedMoney,
    pub grand_total: QuotedMoney,
    pub unconfirmed: Vec<UnconfirmedAmount>,
    pub replacements: Vec<SoldOutReplacement>,
}

#[derive(Clone, Copy)]
enum ShipIn {
    Skip,
    Unknown,
    Free,
    Fixed(u64),
    Complex,
}

struct RawLine {
    id: Id,
    role: QuoteRole,
    seller_id: Option<Id>,
    variant_id: Option<Id>,
    offer_id: Option<Id>,
    physical_needed: Option<u32>,
    reused: Option<u32>,
    pack_quantity: Option<u32>,
    pack_price: Option<u64>,
    stock: Option<bool>,
    shipping: ShipIn,
    included_in_parent: bool,
    minimum_packs: Option<u32>,
    replacement_offer_id: Option<Id>,
    /// Pieces already multiplied by the parent pack count. Set only for an
    /// included required part.
    part_pieces: Option<u32>,
}

struct Purchase {
    new_units: QuotedCount,
    pack_quantity: QuotedCount,
    packs: QuotedCount,
    supplied: QuotedCount,
    surplus: QuotedCount,
    minimum_units: QuotedCount,
    subtotal: QuotedMoney,
}

struct Built {
    line: OfferQuoteLine,
    stock: Option<bool>,
    shipping: ShipIn,
    charges_shipping: bool,
}

fn fail(code: &'static str) -> OfferQuoteError {
    OfferQuoteError { code }
}

fn known_count(value: u32) -> QuotedCount {
    QuotedCount::Known { value }
}

fn na_count(reason: &str) -> QuotedCount {
    QuotedCount::NotApplicable {
        reason_code: reason.into(),
    }
}

fn na_money(reason: &str) -> QuotedMoney {
    QuotedMoney::NotApplicable {
        reason_code: reason.into(),
    }
}

fn money(amount: u64) -> Result<QuotedMoney, OfferQuoteError> {
    MoneyKrw::new(amount)
        .map(|amount| QuotedMoney::Known { amount })
        .map_err(|_| fail("arithmetic_overflow"))
}

fn bound_quantity(value: u32) -> Result<(), OfferQuoteError> {
    Quantity::new(value)
        .map(|_| ())
        .map_err(|_| fail("input_limit_exceeded"))
}

fn bound_pack(value: u32) -> Result<(), OfferQuoteError> {
    if value == 0 {
        return Err(fail("pack_quantity_zero"));
    }
    PackQuantity::new(value)
        .map(|_| ())
        .map_err(|_| fail("input_limit_exceeded"))
}

fn ship_of(offer: &Offer) -> ShipIn {
    match offer.shipping.value() {
        Some(ShippingRule::Free {}) => ShipIn::Free,
        Some(ShippingRule::FixedPerSeller { fee }) => match fee.value() {
            Some(fee) => ShipIn::Fixed(fee.get()),
            None => ShipIn::Unknown,
        },
        Some(ShippingRule::Complex {}) => ShipIn::Complex,
        None => ShipIn::Unknown,
    }
}

fn stock_of(offer: &Offer) -> Option<bool> {
    match offer.inventory.value() {
        Some(InventoryState::InStock) => Some(true),
        Some(InventoryState::OutOfStock) => Some(false),
        None => None,
    }
}

fn pack_of(fact: &Fact<PackQuantity>) -> Option<u32> {
    fact.value().map(|pack| pack.get())
}

fn known_u32(count: &QuotedCount) -> Option<u32> {
    match count {
        QuotedCount::Known { value } => Some(*value),
        _ => None,
    }
}

/// Need 3 with a pack of 2 orders 2 packs and leaves 1. Unknown stays unknown.
fn purchase_math(raw: &RawLine) -> Result<Purchase, OfferQuoteError> {
    let (Some(needed), Some(reused)) = (raw.physical_needed, raw.reused) else {
        return Ok(Purchase {
            new_units: QuotedCount::Unknown,
            pack_quantity: QuotedCount::Unknown,
            packs: QuotedCount::Unknown,
            supplied: QuotedCount::Unknown,
            surplus: QuotedCount::Unknown,
            minimum_units: QuotedCount::Unknown,
            subtotal: QuotedMoney::Unknown,
        });
    };
    bound_quantity(needed)?;
    bound_quantity(reused)?;
    if reused > needed {
        return Err(fail("reuse_exceeds_need"));
    }
    let new_units = needed - reused;
    if raw.included_in_parent {
        let pieces = raw.part_pieces.unwrap_or(new_units);
        bound_quantity(pieces)?;
        return Ok(Purchase {
            new_units: known_count(new_units),
            pack_quantity: na_count("included_in_parent"),
            packs: na_count("included_in_parent"),
            supplied: known_count(pieces),
            surplus: na_count("included_in_parent"),
            minimum_units: na_count("included_in_parent"),
            subtotal: na_money("included_in_parent"),
        });
    }
    if new_units == 0 {
        return Ok(Purchase {
            new_units: known_count(0),
            pack_quantity: na_count("no_new_units"),
            packs: known_count(0),
            supplied: known_count(0),
            surplus: known_count(0),
            minimum_units: na_count("no_new_units"),
            subtotal: na_money("no_new_units"),
        });
    }
    let Some(pack) = raw.pack_quantity else {
        return Ok(Purchase {
            new_units: known_count(new_units),
            pack_quantity: QuotedCount::Unknown,
            packs: QuotedCount::Unknown,
            supplied: QuotedCount::Unknown,
            surplus: QuotedCount::Unknown,
            minimum_units: QuotedCount::Unknown,
            subtotal: QuotedMoney::Unknown,
        });
    };
    bound_pack(pack)?;
    let minimum_packs = match raw.minimum_packs {
        Some(0) => return Err(fail("minimum_packs_zero")),
        Some(value) => {
            bound_quantity(value)?;
            value
        }
        None => 1,
    };
    let mut packs = new_units.div_ceil(pack);
    if packs < minimum_packs {
        packs = minimum_packs;
    }
    let supplied = packs
        .checked_mul(pack)
        .ok_or_else(|| fail("arithmetic_overflow"))?;
    let surplus = supplied
        .checked_sub(new_units)
        .ok_or_else(|| fail("arithmetic_overflow"))?;
    let minimum_units = minimum_packs
        .checked_mul(pack)
        .ok_or_else(|| fail("arithmetic_overflow"))?;
    bound_quantity(supplied)?;
    bound_quantity(surplus)?;
    bound_quantity(minimum_units)?;
    let subtotal = match raw.pack_price {
        Some(price) => {
            let amount = u64::from(packs)
                .checked_mul(price)
                .ok_or_else(|| fail("arithmetic_overflow"))?;
            money(amount)?
        }
        None => QuotedMoney::Unknown,
    };
    Ok(Purchase {
        new_units: known_count(new_units),
        pack_quantity: known_count(pack),
        packs: known_count(packs),
        supplied: known_count(supplied),
        surplus: known_count(surplus),
        minimum_units: known_count(minimum_units),
        subtotal,
    })
}

fn build_line(raw: &RawLine) -> Result<Built, OfferQuoteError> {
    let physical = match raw.physical_needed {
        Some(value) => {
            bound_quantity(value)?;
            known_count(value)
        }
        None => QuotedCount::Unknown,
    };
    let reused = match raw.reused {
        Some(value) => {
            bound_quantity(value)?;
            known_count(value)
        }
        None => QuotedCount::Unknown,
    };
    if raw.role == QuoteRole::OwnedReuse {
        return Ok(Built {
            line: OfferQuoteLine {
                id: raw.id.clone(),
                role: raw.role,
                seller_id: raw.seller_id.clone(),
                variant_id: raw.variant_id.clone(),
                offer_id: raw.offer_id.clone(),
                physical_needed: physical,
                reused,
                new_units: known_count(0),
                pack_quantity: na_count("owned_reuse"),
                packs_to_order: na_count("owned_reuse"),
                supplied: na_count("owned_reuse"),
                surplus: known_count(0),
                minimum_units: na_count("owned_reuse"),
                product_subtotal: na_money("owned_reuse"),
                included_in_parent: false,
            },
            stock: None,
            shipping: ShipIn::Skip,
            charges_shipping: false,
        });
    }
    let math = purchase_math(raw)?;
    let charges = !raw.included_in_parent && known_u32(&math.new_units) != Some(0);
    Ok(Built {
        line: OfferQuoteLine {
            id: raw.id.clone(),
            role: raw.role,
            seller_id: raw.seller_id.clone(),
            variant_id: raw.variant_id.clone(),
            offer_id: raw.offer_id.clone(),
            physical_needed: physical,
            reused,
            new_units: math.new_units,
            pack_quantity: math.pack_quantity,
            packs_to_order: math.packs,
            supplied: math.supplied,
            surplus: math.surplus,
            minimum_units: math.minimum_units,
            product_subtotal: math.subtotal,
            included_in_parent: raw.included_in_parent,
        },
        stock: raw.stock,
        shipping: if charges { raw.shipping } else { ShipIn::Skip },
        charges_shipping: charges && !matches!(raw.shipping, ShipIn::Skip),
    })
}

fn note_for(notes: &[SellerTaxNote], seller: &Id) -> TaxStatus {
    notes
        .iter()
        .find(|note| &note.seller_id == seller)
        .map(|note| note.tax)
        .unwrap_or(TaxStatus::Unknown)
}

fn stock_status(flags: &[Option<bool>]) -> StockStatus {
    if flags.contains(&Some(false)) {
        StockStatus::OutOfStock
    } else if flags.contains(&None) {
        StockStatus::Unknown
    } else {
        StockStatus::InStock
    }
}

#[derive(Default)]
struct SellerFold {
    stock: Vec<Option<bool>>,
    fees: Vec<ShipIn>,
    offers: BTreeSet<Id>,
}

fn seller_shipping(
    fees: &[ShipIn],
) -> Result<(QuotedMoney, ShippingStatus, Option<&'static str>), OfferQuoteError> {
    if fees.is_empty() {
        return Ok((
            na_money("no_purchases"),
            ShippingStatus::NotApplicable,
            None,
        ));
    }
    if fees.iter().any(|fee| matches!(fee, ShipIn::Complex)) {
        return Ok((
            QuotedMoney::Unknown,
            ShippingStatus::Complex,
            Some("shipping_complex"),
        ));
    }
    if fees
        .iter()
        .any(|fee| matches!(fee, ShipIn::Unknown | ShipIn::Skip))
    {
        return Ok((
            QuotedMoney::Unknown,
            ShippingStatus::Unknown,
            Some("shipping_unknown"),
        ));
    }
    let mut fixed: Option<u64> = None;
    let mut free = false;
    for fee in fees {
        match fee {
            ShipIn::Free => free = true,
            ShipIn::Fixed(amount) => match fixed {
                Some(prior) if prior != *amount => {
                    return Ok((
                        QuotedMoney::Unknown,
                        ShippingStatus::Unknown,
                        Some("shipping_conflict"),
                    ));
                }
                _ => fixed = Some(*amount),
            },
            ShipIn::Unknown | ShipIn::Complex | ShipIn::Skip => {}
        }
    }
    if free && fixed.is_some() {
        return Ok((
            QuotedMoney::Unknown,
            ShippingStatus::Unknown,
            Some("shipping_conflict"),
        ));
    }
    if let Some(amount) = fixed {
        return Ok((money(amount)?, ShippingStatus::Fixed, None));
    }
    Ok((money(0)?, ShippingStatus::Free, None))
}

fn unconfirmed(code: &str, seller_id: Option<Id>, line_id: Option<Id>) -> UnconfirmedAmount {
    UnconfirmedAmount {
        code: code.into(),
        seller_id,
        line_id,
    }
}

fn aggregate(
    built: &[Built],
    notes: &[SellerTaxNote],
    bound: Option<Digest>,
    alternates: &[Offer],
    raws: &[RawLine],
) -> Result<OfferQuoteReply, OfferQuoteError> {
    let mut lines = Vec::new();
    let mut product_sum: u64 = 0;
    let mut product_any = false;
    let mut product_incomplete = false;
    let mut unconfirmed_rows = Vec::new();
    let mut groups: BTreeMap<Id, SellerFold> = BTreeMap::new();
    let mut shipping_any = false;
    let mut shipping_incomplete = false;

    for built_line in built {
        match &built_line.line.product_subtotal {
            QuotedMoney::Known { amount } => {
                product_any = true;
                product_sum = product_sum
                    .checked_add(amount.get())
                    .ok_or_else(|| fail("arithmetic_overflow"))?;
            }
            QuotedMoney::Unknown => {
                product_any = true;
                product_incomplete = true;
                unconfirmed_rows.push(unconfirmed(
                    "price_unknown",
                    built_line.line.seller_id.clone(),
                    Some(built_line.line.id.clone()),
                ));
            }
            QuotedMoney::NotApplicable { .. } => {}
        }
        if built_line.charges_shipping {
            shipping_any = true;
            let Some(seller) = built_line.line.seller_id.clone() else {
                shipping_incomplete = true;
                unconfirmed_rows.push(unconfirmed(
                    "shipping_unknown",
                    None,
                    Some(built_line.line.id.clone()),
                ));
                lines.push(built_line.line.clone());
                continue;
            };
            let group = groups.entry(seller).or_default();
            group.stock.push(built_line.stock);
            group.fees.push(built_line.shipping);
            if let Some(offer_id) = &built_line.line.offer_id {
                group.offers.insert(offer_id.clone());
            }
        }
        lines.push(built_line.line.clone());
    }

    let mut sellers = Vec::new();
    let mut shipping_sum: u64 = 0;
    let mut tax_incomplete = false;
    for (seller_id, group) in groups {
        let (shipping, status, code) = seller_shipping(&group.fees)?;
        if let Some(code) = code {
            shipping_incomplete = true;
            unconfirmed_rows.push(unconfirmed(code, Some(seller_id.clone()), None));
        } else if let QuotedMoney::Known { amount } = &shipping {
            shipping_sum = shipping_sum
                .checked_add(amount.get())
                .ok_or_else(|| fail("arithmetic_overflow"))?;
        }
        let tax = note_for(notes, &seller_id);
        match tax {
            TaxStatus::Included => {}
            TaxStatus::Unknown => {
                tax_incomplete = true;
                unconfirmed_rows.push(unconfirmed("tax_unknown", Some(seller_id.clone()), None));
            }
            TaxStatus::Excluded => {
                tax_incomplete = true;
                unconfirmed_rows.push(unconfirmed("tax_unpriced", Some(seller_id.clone()), None));
            }
        }
        sellers.push(SellerQuote {
            seller_id,
            stock: stock_status(&group.stock),
            shipping,
            shipping_status: status,
            tax,
            offer_ids: group.offers.into_iter().collect(),
        });
    }

    let known_product = if !product_any {
        na_money("no_purchases")
    } else if product_incomplete {
        QuotedMoney::Unknown
    } else {
        money(product_sum)?
    };
    let known_shipping = if !shipping_any {
        na_money("no_purchases")
    } else if shipping_incomplete {
        QuotedMoney::Unknown
    } else {
        money(shipping_sum)?
    };
    let grand_total = if !product_any && !shipping_any {
        na_money("no_purchases")
    } else if product_incomplete || shipping_incomplete || tax_incomplete {
        QuotedMoney::Unknown
    } else {
        let product = match &known_product {
            QuotedMoney::Known { amount } => amount.get(),
            QuotedMoney::NotApplicable { .. } => 0,
            QuotedMoney::Unknown => 0,
        };
        let shipping = match &known_shipping {
            QuotedMoney::Known { amount } => amount.get(),
            QuotedMoney::NotApplicable { .. } => 0,
            QuotedMoney::Unknown => 0,
        };
        money(
            product
                .checked_add(shipping)
                .ok_or_else(|| fail("arithmetic_overflow"))?,
        )?
    };

    let mut replacements = Vec::new();
    let mut seen = BTreeSet::new();
    for raw in raws {
        if raw.role != QuoteRole::Container || raw.stock != Some(false) {
            continue;
        }
        let (Some(from), Some(variant)) = (raw.offer_id.clone(), raw.variant_id.clone()) else {
            continue;
        };
        if let Some(to) = &raw.replacement_offer_id {
            let key = (from.clone(), to.clone());
            if seen.insert(key) {
                replacements.push(SoldOutReplacement {
                    from_offer_id: from.clone(),
                    to_offer_id: to.clone(),
                    variant_id: variant.clone(),
                    bound_revision: bound.clone(),
                });
            }
        }
        for alternate in alternates {
            if alternate.variant_id != variant || alternate.id == from {
                continue;
            }
            if stock_of(alternate) == Some(false) {
                continue;
            }
            let key = (from.clone(), alternate.id.clone());
            if seen.insert(key) {
                replacements.push(SoldOutReplacement {
                    from_offer_id: from.clone(),
                    to_offer_id: alternate.id.clone(),
                    variant_id: variant.clone(),
                    bound_revision: bound.clone(),
                });
            }
        }
    }
    replacements.sort_by(|a, b| {
        (a.from_offer_id.as_str(), a.to_offer_id.as_str())
            .cmp(&(b.from_offer_id.as_str(), b.to_offer_id.as_str()))
    });
    unconfirmed_rows.sort_by(|a, b| {
        (
            a.code.as_str(),
            a.seller_id.as_ref().map(Id::as_str),
            a.line_id.as_ref().map(Id::as_str),
        )
            .cmp(&(
                b.code.as_str(),
                b.seller_id.as_ref().map(Id::as_str),
                b.line_id.as_ref().map(Id::as_str),
            ))
    });

    Ok(OfferQuoteReply {
        bound_revision: bound,
        lines,
        sellers,
        known_product,
        known_shipping,
        grand_total,
        unconfirmed: unconfirmed_rows,
        replacements,
    })
}

fn finish(
    raws: Vec<RawLine>,
    notes: &[SellerTaxNote],
    bound: Option<Digest>,
    alternates: &[Offer],
) -> Result<OfferQuoteReply, OfferQuoteError> {
    if raws.len() > MAX_LINES {
        return Err(fail("input_limit_exceeded"));
    }
    if notes.len() > MAX_NOTES || alternates.len() > MAX_ALTERNATES {
        return Err(fail("input_limit_exceeded"));
    }
    let built = raws.iter().map(build_line).collect::<Result<Vec<_>, _>>()?;
    aggregate(&built, notes, bound, alternates, &raws)
}

fn snapshot_lines(snapshot: &PlanSnapshot) -> Result<Vec<RawLine>, OfferQuoteError> {
    let offers = &snapshot.content.referenced_catalog.offers;
    let mut raws = Vec::new();
    for line in &snapshot.content.bom {
        raws.extend(bom_raws(line, offers)?);
    }
    Ok(raws)
}

fn bom_raws(line: &BOMLine, offers: &[Offer]) -> Result<Vec<RawLine>, OfferQuoteError> {
    if line.owned_id.is_some() {
        return Ok(vec![RawLine {
            id: line.id.clone(),
            role: QuoteRole::OwnedReuse,
            seller_id: None,
            variant_id: line.variant_id.clone(),
            offer_id: None,
            physical_needed: Some(line.physical_needed.get()),
            reused: Some(line.reused.get()),
            pack_quantity: None,
            pack_price: None,
            stock: None,
            shipping: ShipIn::Skip,
            included_in_parent: false,
            minimum_packs: None,
            replacement_offer_id: None,
            part_pieces: None,
        }]);
    }
    let offer = line
        .offer_id
        .as_ref()
        .and_then(|id| offers.iter().find(|offer| &offer.id == id));
    let pack = offer
        .map(|offer| pack_of(&offer.pack_quantity))
        .unwrap_or_else(|| pack_of(&line.pack_quantity));
    let price = offer.and_then(|offer| offer.pack_price.value().map(|price| price.get()));
    let parent = RawLine {
        id: line.id.clone(),
        role: QuoteRole::Container,
        seller_id: offer.map(|offer| offer.seller_id.clone()),
        variant_id: line.variant_id.clone(),
        offer_id: line.offer_id.clone(),
        physical_needed: Some(line.physical_needed.get()),
        reused: Some(line.reused.get()),
        pack_quantity: pack,
        pack_price: price,
        stock: offer.and_then(stock_of),
        shipping: offer.map(ship_of).unwrap_or(ShipIn::Unknown),
        included_in_parent: false,
        minimum_packs: None,
        replacement_offer_id: None,
        part_pieces: None,
    };
    let mut rows = vec![parent];
    let Some(offer) = offer else {
        return Ok(rows);
    };
    if offer.bundle_components.is_empty() {
        return Ok(rows);
    }
    let parent_packs = rows.first().and_then(|row| {
        purchase_math(row)
            .ok()
            .and_then(|math| known_u32(&math.packs))
    });
    for component in &offer.bundle_components {
        let pieces = parent_packs.and_then(|packs| component.quantity.get().checked_mul(packs));
        let id = Id::new(&format!(
            "part:{}:{}",
            line.id.as_str(),
            component.variant_id.as_str()
        ))
        .map_err(|_| fail("invalid_input"))?;
        rows.push(RawLine {
            id,
            role: QuoteRole::RequiredPart,
            seller_id: Some(offer.seller_id.clone()),
            variant_id: Some(component.variant_id.clone()),
            offer_id: Some(offer.id.clone()),
            physical_needed: pieces,
            reused: Some(0),
            pack_quantity: None,
            pack_price: None,
            stock: None,
            shipping: ShipIn::Skip,
            included_in_parent: true,
            minimum_packs: None,
            replacement_offer_id: None,
            part_pieces: pieces,
        });
    }
    Ok(rows)
}

fn preview_raw(line: &OfferPreviewLine) -> RawLine {
    let shipping = if line.role == QuoteRole::OwnedReuse || line.included_in_parent {
        ShipIn::Skip
    } else {
        match &line.shipping {
            PreviewShipping::Unknown => ShipIn::Unknown,
            PreviewShipping::Free => ShipIn::Free,
            PreviewShipping::Fixed { fee } => ShipIn::Fixed(fee.get()),
            PreviewShipping::Complex => ShipIn::Complex,
        }
    };
    RawLine {
        id: line.id.clone(),
        role: line.role,
        seller_id: line.seller_id.clone(),
        variant_id: line.variant_id.clone(),
        offer_id: line.offer_id.clone(),
        physical_needed: line.physical_needed,
        reused: line.reused,
        pack_quantity: line.pack_quantity,
        pack_price: line.pack_price.map(MoneyKrw::get),
        stock: if line.role == QuoteRole::OwnedReuse {
            None
        } else {
            match line.stock {
                StockStatus::InStock => Some(true),
                StockStatus::OutOfStock => Some(false),
                StockStatus::Unknown => None,
            }
        },
        shipping,
        included_in_parent: line.included_in_parent,
        minimum_packs: line.minimum_packs,
        replacement_offer_id: line.replacement_offer_id.clone(),
        part_pieces: None,
    }
}

fn snapshot_alternates(snapshot: &PlanSnapshot, extra: &[Offer]) -> Vec<Offer> {
    let mut offers = snapshot.content.referenced_catalog.offers.clone();
    for offer in extra {
        if offers.iter().all(|existing| existing.id != offer.id) {
            offers.push(offer.clone());
        }
    }
    offers
}

/// Read-only pack and seller quote. A snapshot quote keeps that revision.
/// A preview leaves `boundRevision` null.
pub fn quote_offer_bundle(action: &OfferQuoteAction) -> Result<OfferQuoteReply, OfferQuoteError> {
    match action {
        OfferQuoteAction::Preview { preview } => finish(
            preview.lines.iter().map(preview_raw).collect(),
            &preview.seller_notes,
            None,
            &[],
        ),
        OfferQuoteAction::Snapshot {
            snapshot,
            alternates,
            seller_notes,
        } => {
            if !validate::validate_snapshot(snapshot).is_empty() {
                return Err(fail("invalid_snapshot"));
            }
            let raws = snapshot_lines(snapshot)?;
            finish(
                raws,
                seller_notes,
                Some(snapshot.plan_snapshot_id.clone()),
                &snapshot_alternates(snapshot, alternates),
            )
        }
    }
}
