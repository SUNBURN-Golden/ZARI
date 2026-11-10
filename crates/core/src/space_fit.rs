//! Nominal catalog search. Clearance is reserved once at the high end of each
//! axis (default 5 mm); inter-item gaps are zero, so stacks retain contact.
//! No opening, load, tolerance or contents guarantee is inferred from W/D/H.
use crate::{
    canonical::*,
    catalog::*,
    catalog_bundle::{CrawlSite, CrawledItem, DimensionConfidence},
    facts::*,
    geometry::Box3,
    input::Orientation,
    plan::CheckStatus,
    scalars::*,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::collections::{BTreeMap, BTreeSet};

/// The same 5,000-item ceiling the catalog snapshot uses.
const MAX_LISTINGS: usize = 5_000;
/// `unmeasured` is a stable preview; `missingDimensions` keeps the full count.
const MAX_UNMEASURED: usize = 200;

fn default_clearance() -> [u32; 3] {
    [5; 3]
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitInput {
    pub schema_version: u32,
    pub input_revision: String,
    pub space: [String; 3],
    pub catalog: CatalogSnapshot,
    #[serde(default = "default_clearance")]
    pub clearance_mm: [u32; 3],
    /// Reviewed bundle items. Rust re-validates them and may use their
    /// dimensions and price text as clearly-flagged reference values; they can
    /// never overwrite a Known snapshot fact. Empty keeps the old behaviour.
    #[serde(default)]
    pub listings: Vec<CrawledItem>,
}
/// Whether the evaluated dimensions come from a Confirmed snapshot fact or
/// from reference-grade evidence. Ordering is deliberate: Confirmed <
/// Reference, so a candidate's worst block is the maximum.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum DimensionProvenance {
    Confirmed,
    Reference,
}
/// Evidence quality behind a reference dimension. `Unspecified` means no
/// listing carried the values; `Unparsed` never appears on an evaluated item.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum DimensionBasis {
    High,
    Medium,
    Low,
    Unspecified,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitDimensions {
    pub provenance: DimensionProvenance,
    /// Listing confidence. An OCR/product-name origin field does not exist in
    /// the bundle schema yet; when ZARI's OCR catalog update adds one it can be
    /// mapped here without changing provenance semantics.
    pub basis: DimensionBasis,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SpaceFitPriceBasis {
    Confirmed,
    Reference,
}
/// A price fact, or an explicit unknown. Amounts are integer-won decimal text.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SpaceFitPrice {
    Known {
        pack_price_krw: String,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        pack_quantity: Option<String>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        unit_price_krw: Option<String>,
        basis: SpaceFitPriceBasis,
    },
    Unknown {},
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitCategory {
    /// Product category hint (e.g. `bin`).
    pub hint: String,
    /// Listing category label, trimmed; null when uncollected.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub label: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitBlock {
    pub variant_id: String,
    pub name: String,
    pub orientation: Orientation,
    pub unit_mm: [u32; 3],
    pub grid: [u32; 3],
    pub origin_mm: [u32; 3],
    pub quantity: String,
    pub urls: Vec<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<CrawlSite>")]
    pub source: Option<CrawlSite>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub seller_id: Option<String>,
    pub category: SpaceFitCategory,
    pub price: SpaceFitPrice,
    pub dimensions: SpaceFitDimensions,
}
/// A variant with no usable W/D/H at all. It is never evaluated; the block
/// shape stays the same for display without inventing dimensions or prices.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitUnmeasured {
    pub variant_id: String,
    pub name: String,
    pub urls: Vec<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<CrawlSite>")]
    pub source: Option<CrawlSite>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub seller_id: Option<String>,
    pub category: SpaceFitCategory,
    pub price: SpaceFitPrice,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitChecks {
    pub outer: CheckStatus,
    pub inner: CheckStatus,
    pub installation: CheckStatus,
    pub opening: CheckStatus,
    pub access: CheckStatus,
    pub support_load: CheckStatus,
    pub orientation: CheckStatus,
    pub quantity: CheckStatus,
    pub tolerance: CheckStatus,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitCandidate {
    pub id: String,
    pub blocks: Vec<SpaceFitBlock>,
    pub remaining_mm: [u32; 3],
    pub occupied_volume_mm3: String,
    pub unconfirmed: bool,
    /// Worst block provenance: one reference block makes the candidate reference.
    pub dimension_provenance: DimensionProvenance,
    pub checks: SpaceFitChecks,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceFitPage {
    pub schema_version: u32,
    pub input_revision: String,
    pub catalog_digest: String,
    pub solver_version: String,
    pub space_mm: [u32; 3],
    pub profile: String,
    pub singles: Vec<SpaceFitCandidate>,
    pub combinations: Vec<SpaceFitCandidate>,
    /// First 200 unmeasured variants in stable variant order, returned on the
    /// first page only. Later pages carry an empty list.
    pub unmeasured: Vec<SpaceFitUnmeasured>,
    pub inspected_variants: u32,
    /// Full count of variants with no usable dimensions.
    pub missing_dimensions: u32,
    pub unavailable_variants: u32,
    pub nodes: u32,
    pub singles_complete: bool,
    pub combinations_complete: bool,
}
#[derive(Clone)]
struct Item {
    variant_index: usize,
    block: SpaceFitBlock,
    max: [u32; 3],
    confirmed: bool,
    orientation_known: bool,
    envelope_known: bool,
}
/// One search owns one catalog/revision. A step does at most 1,000 nodes and
/// returns at most 100 combinations; state stays in the worker until disposed.
pub struct SpaceFitSearch {
    input: SpaceFitInput,
    space: [u32; 3],
    available: [u32; 3],
    items: Vec<Item>,
    singles: Vec<SpaceFitCandidate>,
    unmeasured: Vec<SpaceFitUnmeasured>,
    missing: u32,
    unavailable: u32,
    first_page: bool,
    stage: u8,
    a: usize,
    b: usize,
    pattern: u32,
    offset: u64,
}
fn confirmed<T>(fact: &Fact<T>) -> bool {
    matches!(fact, Fact::Known { provenance, .. } if provenance.verification == VerificationStatus::Confirmed)
}
/// Strict listing price grammar: grouped or plain integer, then 원 or KRW.
/// Anything ambiguous stays unknown; the search never guesses a price.
fn parse_price_text(text: &str) -> Option<u64> {
    let number = text
        .trim()
        .strip_suffix("KRW")
        .or_else(|| text.trim().strip_suffix('원'))?
        .trim();
    let digits = if let Some((head, tail)) = number.split_once(',') {
        if head.is_empty()
            || head.len() > 3
            || !head.bytes().all(|byte| byte.is_ascii_digit())
            || !tail
                .split(',')
                .all(|group| group.len() == 3 && group.bytes().all(|byte| byte.is_ascii_digit()))
        {
            return None;
        }
        format!("{head}{}", tail.replace(',', ""))
    } else {
        if number.is_empty() || !number.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        number.to_owned()
    };
    let value = digits.parse::<u64>().ok()?;
    (value > 0 && value <= 100_000_000).then_some(value)
}
fn listing_basis(listing: Option<&CrawledItem>) -> DimensionBasis {
    match listing.map(|item| item.dimensions.confidence) {
        Some(DimensionConfidence::High) => DimensionBasis::High,
        Some(DimensionConfidence::Medium) => DimensionBasis::Medium,
        Some(DimensionConfidence::Low) => DimensionBasis::Low,
        _ => DimensionBasis::Unspecified,
    }
}
fn stable_offer<'a>(offers: &[&'a Offer]) -> Option<&'a Offer> {
    offers
        .iter()
        .copied()
        .min_by(|a, b| a.id.as_str().cmp(b.id.as_str()))
}
fn block_seller(offers: &[&Offer], listing: Option<&CrawledItem>) -> Option<String> {
    stable_offer(offers)
        .map(|offer| offer.seller_id.to_string())
        .or_else(|| listing.map(|item| format!("seller-{}", item.source.key())))
}
fn block_category(product: &Product, listing: Option<&CrawledItem>) -> SpaceFitCategory {
    let label = listing
        .map(|item| item.category.trim())
        .filter(|label| !label.is_empty())
        .map(str::to_owned);
    SpaceFitCategory {
        hint: product.category.clone(),
        label,
    }
}
fn block_price(offers: &[&Offer], listing: Option<&CrawledItem>) -> SpaceFitPrice {
    let offer = stable_offer(offers);
    let pack_quantity = offer.and_then(|offer| match &offer.pack_quantity {
        Fact::Known { value, .. } => Some(value.get()),
        _ => None,
    });
    let (price, basis) = match offer.map(|offer| &offer.pack_price) {
        Some(Fact::Known { value, provenance }) => (
            value.get(),
            if provenance.verification == VerificationStatus::Confirmed {
                SpaceFitPriceBasis::Confirmed
            } else {
                SpaceFitPriceBasis::Reference
            },
        ),
        _ => match listing
            .and_then(|item| item.price_text.as_deref())
            .and_then(parse_price_text)
        {
            Some(price) => (price, SpaceFitPriceBasis::Reference),
            None => return SpaceFitPrice::Unknown {},
        },
    };
    let unit_price = pack_quantity
        .filter(|quantity| *quantity > 0)
        .and_then(|quantity| {
            let quantity = u64::from(quantity);
            (price % quantity == 0).then(|| (price / quantity).to_string())
        });
    SpaceFitPrice::Known {
        pack_price_krw: price.to_string(),
        pack_quantity: pack_quantity.map(|quantity| quantity.to_string()),
        unit_price_krw: unit_price,
        basis,
    }
}
impl SpaceFitSearch {
    pub fn new(input: SpaceFitInput) -> Result<Self, String> {
        if input.schema_version != 1
            || input.input_revision.len() > 80
            || input.catalog.variants.len() > 5000
            || input.clearance_mm.iter().any(|c| *c > 10000)
        {
            return Err("space_fit_input_invalid".into());
        }
        let content = CatalogContent::from(&input.catalog);
        if !crate::validate::validate_catalog_content(&content).is_empty()
            || catalog_digest(&content) != input.catalog.catalog_digest
        {
            return Err("space_fit_catalog_invalid".into());
        }
        let mut space = [0; 3];
        for (axis, raw) in input.space.iter().enumerate() {
            space[axis] = parse_length(raw, Unit::Cm)
                .map_err(|_| format!("space_axis_{axis}"))?
                .ok_or_else(|| format!("space_axis_{axis}"))?
                .get();
        }
        let available = std::array::from_fn(|i| space[i].saturating_sub(input.clearance_mm[i]));
        let names: BTreeMap<_, _> = input
            .catalog
            .products
            .iter()
            .map(|p| (&p.id, &p.name))
            .collect();
        let products: BTreeMap<_, _> = input.catalog.products.iter().map(|p| (&p.id, p)).collect();
        let product_ids: BTreeSet<&str> = input
            .catalog
            .products
            .iter()
            .map(|product| product.id.as_str())
            .collect();
        if input.listings.len() > MAX_LISTINGS {
            return Err("space_fit_listing_invalid".into());
        }
        let mut listings_by_product: BTreeMap<String, &CrawledItem> = BTreeMap::new();
        for listing in &input.listings {
            // The same rules that reviewed the bundle must hold here; a listing
            // is a side channel, not a weaker second parser.
            if !crate::catalog_bundle::validate_listing(listing) {
                return Err("space_fit_listing_invalid".into());
            }
            let product_id = format!("p-{}", listing.id);
            if !product_ids.contains(product_id.as_str())
                || listings_by_product.insert(product_id, listing).is_some()
            {
                return Err("space_fit_listing_invalid".into());
            }
        }
        let mut offers_by_variant: BTreeMap<_, Vec<_>> = BTreeMap::new();
        for offer in &input.catalog.offers {
            offers_by_variant
                .entry(&offer.variant_id)
                .or_default()
                .push(offer);
        }
        let mut items = vec![];
        let mut unmeasured = vec![];
        let mut missing = 0;
        let mut unavailable = 0;
        for (variant_index, v) in input.catalog.variants.iter().enumerate() {
            // This feature searches storage boxes only, not furniture.
            let Some(product) = products.get(&v.product_id).copied() else {
                continue;
            };
            if product.category != "bin" {
                continue;
            }
            let listing = listings_by_product.get(v.product_id.as_str()).copied();
            let offers = offers_by_variant.get(&v.id).cloned().unwrap_or_default();
            if !offers.is_empty()
                && offers
                    .iter()
                    .all(|o| o.inventory.value() == Some(&InventoryState::OutOfStock))
            {
                unavailable += 1;
                continue;
            }
            let urls: Vec<String> = offers
                .iter()
                .filter_map(|o| o.url.value())
                .filter(|u| crate::catalog_bundle::allowed_product_url(u))
                .cloned()
                .collect();
            let name = format!("{} {}", names[&v.product_id], v.option_label)
                .trim()
                .to_owned();
            let outer = [
                &v.dimensions.outer.width,
                &v.dimensions.outer.depth,
                &v.dimensions.outer.height,
            ];
            let snapshot = outer.map(|fact| fact.value().map(|m| m.nominal.get()));
            let snapshot_known = snapshot.iter().all(Option::is_some);
            let snapshot_confirmed = outer.iter().all(|fact| confirmed(*fact));
            let listing_mm = listing.and_then(crate::catalog_bundle::listing_outer_mm);
            let (mut base, provenance, basis) = if snapshot_known && snapshot_confirmed {
                (
                    snapshot.map(|axis| axis.expect("known axis")),
                    DimensionProvenance::Confirmed,
                    DimensionBasis::Unspecified,
                )
            } else if snapshot_known {
                (
                    snapshot.map(|axis| axis.expect("known axis")),
                    DimensionProvenance::Reference,
                    listing_basis(listing),
                )
            } else if let Some(axes) = listing_mm {
                (axes, DimensionProvenance::Reference, listing_basis(listing))
            } else {
                missing += 1;
                if unmeasured.len() < MAX_UNMEASURED {
                    unmeasured.push(SpaceFitUnmeasured {
                        variant_id: v.id.to_string(),
                        name,
                        urls,
                        source: listing.map(|item| item.source),
                        seller_id: block_seller(&offers, listing),
                        category: block_category(product, listing),
                        price: block_price(&offers, listing),
                    });
                }
                continue;
            };
            let extra = crate::geometry::handle_extra(&v.dimensions.handles);
            if let Some(extra) = extra {
                for i in 0..3 {
                    base[i] = base[i]
                        .checked_add(extra[i] as u32)
                        .ok_or("envelope_overflow")?;
                }
            }
            let source = listing.map(|item| item.source);
            let seller_id = block_seller(&offers, listing);
            let category = block_category(product, listing);
            let price = block_price(&offers, listing);
            // Unknown directions get an explicitly conditional upright0 only.
            let directions = v
                .allowed_orientations
                .value()
                .cloned()
                .unwrap_or_else(|| vec![Orientation::Upright0]);
            let mut seen = vec![];
            for direction in directions {
                let unit = if direction == Orientation::Upright90 {
                    [base[1], base[0], base[2]]
                } else {
                    [base[0], base[1], base[2]]
                };
                if seen.contains(&unit) {
                    continue;
                }
                seen.push(unit);
                if (0..3).any(|i| unit[i] > available[i]) {
                    continue;
                }
                let mut max = std::array::from_fn(|i| available[i] / unit[i]);
                // No tilting or speculative stacking. Only evidenced stackability
                // authorizes K>1; support/load remain separate unknown checks.
                max[2] = match v.stackability.value() {
                    Some(Stackability::Stackable { max_units }) if confirmed(&v.stackability) => {
                        max[2].min(*max_units)
                    }
                    _ => max[2].min(1),
                };
                if max.contains(&0) {
                    continue;
                }
                items.push(Item {
                    variant_index,
                    block: SpaceFitBlock {
                        variant_id: v.id.to_string(),
                        name: name.clone(),
                        orientation: direction,
                        unit_mm: unit,
                        grid: [1; 3],
                        origin_mm: [0; 3],
                        quantity: "1".into(),
                        urls: urls.clone(),
                        source,
                        seller_id: seller_id.clone(),
                        category: category.clone(),
                        price: price.clone(),
                        dimensions: SpaceFitDimensions { provenance, basis },
                    },
                    max,
                    confirmed: provenance == DimensionProvenance::Confirmed,
                    orientation_known: confirmed(&v.allowed_orientations),
                    envelope_known: extra.is_some(),
                });
            }
        }
        items.sort_by(|a, b| {
            (&a.block.variant_id, a.block.orientation)
                .cmp(&(&b.block.variant_id, b.block.orientation))
        });
        let mut search = Self {
            input,
            space,
            available,
            items,
            singles: vec![],
            unmeasured,
            missing,
            unavailable,
            first_page: true,
            stage: 0,
            a: 0,
            b: 1,
            pattern: 0,
            offset: 0,
        };
        for i in 0..search.items.len() {
            if let Some(c) = search.candidate(&[(i, [1; 3], [0; 3])]) {
                search.singles.push(c);
            }
        }
        rank_candidates(&mut search.singles);
        Ok(search)
    }
    fn candidate(&self, selections: &[(usize, [u32; 3], [u32; 3])]) -> Option<SpaceFitCandidate> {
        let mut blocks = vec![];
        let mut unconfirmed = false;
        let mut dimension_provenance = DimensionProvenance::Confirmed;
        let mut orientation_known = true;
        let mut envelope_known = true;
        for (index, grid, origin) in selections {
            let item = &self.items[*index];
            if (0..3).any(|i| grid[i] == 0 || grid[i] > item.max[i]) {
                return None;
            }
            let mut block = item.block.clone();
            block.grid = *grid;
            block.origin_mm = *origin;
            block.quantity = u64::from(grid[0])
                .checked_mul(u64::from(grid[1]))?
                .checked_mul(u64::from(grid[2]))?
                .to_string();
            blocks.push(block);
            unconfirmed |= !item.confirmed;
            dimension_provenance = dimension_provenance.max(item.block.dimensions.provenance);
            orientation_known &= item.orientation_known;
            envelope_known &= item.envelope_known;
        }
        let (end, volume) = validate_blocks(&blocks, self.available)?;
        for (block, (index, _, _)) in blocks.iter().zip(selections) {
            let variant = &self.input.catalog.variants[self.items[*index].variant_index];
            if variant.id.as_str() != block.variant_id {
                return None;
            }
            if let Some(allowed) = variant.allowed_orientations.value() {
                if !allowed.contains(&block.orientation) {
                    return None;
                }
            } else if block.orientation != Orientation::Upright0 {
                return None;
            }
            if block.grid[2] > 1
                && (!confirmed(&variant.stackability)
                    || !matches!(variant.stackability.value(), Some(Stackability::Stackable { max_units }) if block.grid[2] <= *max_units))
            {
                return None;
            }
        }
        let id = format!("sf-{:x}", Sha256::digest(serde_json::to_vec(&blocks).ok()?));
        Some(SpaceFitCandidate {
            id,
            blocks,
            remaining_mm: std::array::from_fn(|i| self.space[i] - end[i]),
            occupied_volume_mm3: volume.to_string(),
            unconfirmed,
            dimension_provenance,
            checks: SpaceFitChecks {
                outer: if envelope_known {
                    CheckStatus::Pass
                } else {
                    CheckStatus::Unknown
                },
                inner: CheckStatus::NotApplicable,
                installation: CheckStatus::Unknown,
                opening: CheckStatus::Unknown,
                access: CheckStatus::Unknown,
                support_load: CheckStatus::Unknown,
                orientation: if orientation_known {
                    CheckStatus::Pass
                } else {
                    CheckStatus::Unknown
                },
                quantity: CheckStatus::Pass,
                tolerance: CheckStatus::Unknown,
            },
        })
    }
    pub fn step(&mut self, budget: u32) -> SpaceFitPage {
        let mut combinations = vec![];
        let mut nodes = 0;
        while nodes < budget.clamp(1, 1000) && combinations.len() < 100 && self.stage < 2 {
            nodes += 1;
            if self.stage == 0 {
                if self.a >= self.items.len() {
                    self.stage = 1;
                    self.a = 0;
                    self.offset = 0;
                    continue;
                }
                let max = self.items[self.a].max;
                let total = u64::from(max[0]) * u64::from(max[1]) * u64::from(max[2]);
                if self.offset >= total {
                    self.a += 1;
                    self.offset = 0;
                    continue;
                }
                let n = self.offset;
                self.offset += 1;
                let grid = [
                    1 + (n % u64::from(max[0])) as u32,
                    1 + ((n / u64::from(max[0])) % u64::from(max[1])) as u32,
                    1 + (n / (u64::from(max[0]) * u64::from(max[1]))) as u32,
                ];
                if grid != [1; 3]
                    && let Some(c) = self.candidate(&[(self.a, grid, [0; 3])])
                {
                    combinations.push(c);
                }
            } else {
                if self.a >= self.items.len() {
                    self.stage = 2;
                    continue;
                }
                if self.b >= self.items.len() {
                    self.a += 1;
                    self.b = self.a + 1;
                    self.pattern = 0;
                    self.offset = 0;
                    continue;
                }
                if self.items[self.a].block.variant_id == self.items[self.b].block.variant_id {
                    self.b += 1;
                    continue;
                }
                // Four row patterns: W/D separation, A/B order. 1..63 units
                // per row, total <=64. Mixed stacking is deliberately excluded.
                if self.pattern >= 4 {
                    self.b += 1;
                    self.pattern = 0;
                    self.offset = 0;
                    continue;
                }
                let axis = (self.pattern % 2) as usize;
                let max_a = self.items[self.a].max[axis].min(63);
                let max_b = self.items[self.b].max[axis].min(63);
                if self.offset >= u64::from(max_a) * u64::from(max_b) {
                    self.pattern += 1;
                    self.offset = 0;
                    continue;
                }
                let na = 1 + (self.offset % u64::from(max_a)) as u32;
                let nb = 1 + (self.offset / u64::from(max_a)) as u32;
                self.offset += 1;
                if na + nb > 64 {
                    continue;
                }
                let axis = (self.pattern % 2) as usize;
                let mut ga = [1; 3];
                ga[axis] = na;
                let mut gb = [1; 3];
                gb[axis] = nb;
                let mut oa = [0; 3];
                let mut ob = [0; 3];
                if self.pattern < 2 {
                    ob[axis] = self.items[self.a].block.unit_mm[axis] * na;
                } else {
                    oa[axis] = self.items[self.b].block.unit_mm[axis] * nb;
                }
                if let Some(c) = self.candidate(&[(self.a, ga, oa), (self.b, gb, ob)]) {
                    combinations.push(c);
                }
            }
        }
        rank_candidates(&mut combinations);
        SpaceFitPage {
            schema_version: 1,
            input_revision: self.input.input_revision.clone(),
            catalog_digest: self.input.catalog.catalog_digest.to_string(),
            solver_version: "space-fit-2".into(),
            space_mm: self.space,
            profile: "grids-and-two-type-floor-rows-64".into(),
            singles: std::mem::take(&mut self.singles),
            combinations,
            unmeasured: if self.first_page {
                self.first_page = false;
                std::mem::take(&mut self.unmeasured)
            } else {
                vec![]
            },
            inspected_variants: self.input.catalog.variants.len() as u32,
            missing_dimensions: self.missing,
            unavailable_variants: self.unavailable,
            nodes,
            singles_complete: true,
            combinations_complete: self.stage == 2,
        }
    }
}
/// Independent compressed-grid validator: checked extents, bounded quantity,
/// floor support and positive-volume AABB collisions; no solver success flags.
fn validate_blocks(blocks: &[SpaceFitBlock], available: [u32; 3]) -> Option<([u32; 3], u64)> {
    if blocks.is_empty() || blocks.len() > 2 {
        return None;
    }
    let mut boxes = vec![];
    let mut end = [0; 3];
    let mut volume = 0u64;
    for block in blocks {
        if block.grid.contains(&0) || block.unit_mm.contains(&0) || block.origin_mm[2] != 0 {
            return None;
        }
        let mut extent = [0; 3];
        for i in 0..3 {
            extent[i] = block.unit_mm[i].checked_mul(block.grid[i])?;
            let hi = block.origin_mm[i].checked_add(extent[i])?;
            if hi > available[i] {
                return None;
            }
            end[i] = end[i].max(hi);
        }
        let quantity = u64::from(block.grid[0])
            .checked_mul(u64::from(block.grid[1]))?
            .checked_mul(u64::from(block.grid[2]))?;
        if block.quantity != quantity.to_string() {
            return None;
        }
        let region = Box3::from_min_extent(block.origin_mm.map(i64::from), extent.map(i64::from));
        if boxes.iter().any(|other| region.intersects(other)) {
            return None;
        }
        boxes.push(region);
        volume = volume.checked_add(
            u64::from(extent[0])
                .checked_mul(u64::from(extent[1]))?
                .checked_mul(u64::from(extent[2]))?,
        )?;
    }
    Some((end, volume))
}
pub fn rank_candidates(candidates: &mut [SpaceFitCandidate]) {
    candidates.sort_by(|a, b| {
        (a.unconfirmed, a.remaining_mm.iter().sum::<u32>(), &a.id).cmp(&(
            b.unconfirmed,
            b.remaining_mm.iter().sum::<u32>(),
            &b.id,
        ))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog_bundle::{BundleGenerator, build_bundle_from_json, review_bundle_text};
    use serde_json::json;
    fn input_with(
        items: serde_json::Value,
        space: [&str; 3],
        listings: Vec<CrawledItem>,
    ) -> SpaceFitInput {
        let built = build_bundle_from_json(
            &items.to_string(),
            "2026-11-05T00:00:00Z",
            BundleGenerator {
                name: "test".into(),
                version: "1".into(),
            },
        );
        let catalog = review_bundle_text(&built.bundle_text.unwrap())
            .snapshot
            .unwrap();
        SpaceFitInput {
            schema_version: 1,
            input_revision: "r1".into(),
            space: space.map(String::from),
            catalog,
            clearance_mm: [5; 3],
            listings,
        }
    }
    fn item_value(
        id: &str,
        confidence: &str,
        size: [Option<u32>; 3],
        price: Option<&str>,
    ) -> serde_json::Value {
        let mut value = json!({
            "id": id,
            "sourceKind": "crawled",
            "status": "unconfirmed",
            "name": "합성 수납함",
            "brand": "합성",
            "category": "수납함",
            "categoryHint": "bin",
            "productUrl": "https://mujikorea.co.kr/products/1",
            "source": "muji",
            "fetchedAt": "2026-11-05T00:00:00Z",
            "dimensions": {
                "rawText": "합성 치수",
                "width": size[0].map(|n| n.to_string()),
                "depth": size[1].map(|n| n.to_string()),
                "height": size[2].map(|n| n.to_string()),
                "unit": if confidence == "unparsed" { None } else { Some("mm") },
                "confidence": confidence,
            }
        });
        if let Some(price) = price {
            value["priceText"] = json!(price);
        }
        value
    }
    fn listing(value: &serde_json::Value) -> CrawledItem {
        serde_json::from_value(value.clone()).unwrap()
    }
    fn unverified() -> Provenance {
        Provenance {
            origin: MeasurementOrigin::Synthetic,
            verification: VerificationStatus::Unverified,
            evidence_ids: vec![],
            rule_ids: vec![],
            input_refs: vec![],
            observed_at: None,
        }
    }
    fn confirm_outer(input: &mut SpaceFitInput) {
        for variant in &mut input.catalog.variants {
            for fact in [
                &mut variant.dimensions.outer.width,
                &mut variant.dimensions.outer.depth,
                &mut variant.dimensions.outer.height,
            ] {
                if let Fact::Known { provenance, .. } = fact {
                    provenance.verification = VerificationStatus::Confirmed;
                }
            }
        }
        rehash(input);
    }
    fn set_offer_price(input: &mut SpaceFitInput, price: MoneyKrw, quantity: Option<PackQuantity>) {
        for offer in &mut input.catalog.offers {
            offer.pack_price = Fact::Known {
                value: price,
                provenance: unverified(),
            };
            offer.pack_quantity = match quantity {
                Some(value) => Fact::Known {
                    value,
                    provenance: unverified(),
                },
                None => Fact::unknown(),
            };
        }
        rehash(input);
    }
    fn input(sizes: &[[u32; 3]], space: [&str; 3]) -> SpaceFitInput {
        let items: Vec<_> = sizes.iter().enumerate().map(|(i,size)| json!({
            "id":format!("crawl:muji:{}",i+1), "sourceKind":"crawled", "status":"unconfirmed", "name":format!("합성 수납함 {i}"), "brand":"합성", "category":"수납함", "categoryHint":"bin", "productUrl":format!("https://mujikorea.co.kr/products/{}",i+1), "source":"muji", "fetchedAt":"2026-11-05T00:00:00Z",
            "dimensions":{"rawText":format!("외경 가로 {}mm 깊이 {}mm 높이 {}mm",size[0],size[1],size[2]),"width":size[0].to_string(),"depth":size[1].to_string(),"height":size[2].to_string(),"unit":"mm","confidence":"high"}
        })).collect();
        let built = build_bundle_from_json(
            &serde_json::to_string(&items).unwrap(),
            "2026-11-05T00:00:00Z",
            BundleGenerator {
                name: "test".into(),
                version: "1".into(),
            },
        );
        let catalog = review_bundle_text(&built.bundle_text.unwrap())
            .snapshot
            .unwrap();
        SpaceFitInput {
            schema_version: 1,
            input_revision: "r1".into(),
            space: space.map(String::from),
            catalog,
            clearance_mm: [5; 3],
            listings: vec![],
        }
    }
    fn rehash(input: &mut SpaceFitInput) {
        input.catalog.catalog_digest = catalog_digest(&CatalogContent::from(&input.catalog));
    }
    fn allow(input: &mut SpaceFitInput, rotate: bool, stack: Option<u32>) {
        for v in &mut input.catalog.variants {
            let p = Provenance {
                origin: MeasurementOrigin::Synthetic,
                verification: VerificationStatus::Confirmed,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            };
            v.allowed_orientations = Fact::Known {
                value: if rotate {
                    vec![Orientation::Upright0, Orientation::Upright90]
                } else {
                    vec![Orientation::Upright0]
                },
                provenance: p.clone(),
            };
            if let Some(max_units) = stack {
                v.stackability = Fact::Known {
                    value: Stackability::Stackable { max_units },
                    provenance: p,
                };
            }
        }
        rehash(input);
    }
    #[test]
    fn clearance_boundaries_rotation_and_unknown() {
        let mut i = input(&[[200, 300, 100]], ["30.5", "20.5", "10.5"]);
        assert!(
            SpaceFitSearch::new(i.clone())
                .unwrap()
                .step(1000)
                .singles
                .is_empty()
        );
        allow(&mut i, true, None);
        let p = SpaceFitSearch::new(i.clone()).unwrap().step(1000);
        assert_eq!(p.singles.len(), 1);
        assert_eq!(p.singles[0].blocks[0].orientation, Orientation::Upright90);
        assert_eq!(p.singles[0].remaining_mm, [5; 3]);
        assert!(p.singles[0].unconfirmed);
        assert_eq!(p.singles[0].checks.installation, CheckStatus::Unknown);
        assert_eq!(p.singles[0].checks.outer, CheckStatus::Unknown);
        i.space[0] = "30.4".into();
        assert!(
            SpaceFitSearch::new(i)
                .unwrap()
                .step(1000)
                .singles
                .is_empty()
        );
    }
    #[test]
    fn invalid_dimensions_and_digest_are_rejected() {
        for bad in [
            "",
            "0",
            "-1",
            "NaN",
            "Infinity",
            "20.01",
            "1000.1",
            "99999999999999999999999",
        ] {
            assert!(
                SpaceFitSearch::new(input(&[[100; 3]], [bad, "20", "20"])).is_err(),
                "{bad}"
            );
        }
        let mut i = input(&[[100; 3]], ["20"; 3]);
        i.catalog.catalog_version.push('x');
        assert!(SpaceFitSearch::new(i).is_err());
    }
    #[test]
    fn small_grids_match_independent_brute_force_without_duplicates() {
        for w in 1..=4 {
            for d in 1..=3 {
                for h in 1..=2 {
                    let mut i = input(&[[100; 3]], ["50"; 3]);
                    i.space = [
                        format!("{}.5", w * 10),
                        format!("{}.5", d * 10),
                        format!("{}.5", h * 10),
                    ];
                    allow(&mut i, false, Some(2));
                    let mut s = SpaceFitSearch::new(i).unwrap();
                    let mut actual = std::collections::BTreeSet::new();
                    loop {
                        let p = s.step(3);
                        for c in p.singles.into_iter().chain(p.combinations) {
                            assert!(actual.insert(c.blocks[0].grid));
                        }
                        if p.combinations_complete {
                            break;
                        }
                    }
                    let mut expected = std::collections::BTreeSet::new();
                    for n in 1..=4 {
                        for m in 1..=3 {
                            for k in 1..=2 {
                                if n * 100 <= w * 100 && m * 100 <= d * 100 && k * 100 <= h * 100 {
                                    expected.insert([n, m, k]);
                                }
                            }
                        }
                    }
                    assert_eq!(actual, expected);
                }
            }
        }
    }
    #[test]
    fn unknown_or_forbidden_stacking_never_adds_a_layer() {
        let i = input(&[[100; 3]], ["30.5"; 3]);
        let p = SpaceFitSearch::new(i).unwrap().step(1000);
        assert!(p.combinations.iter().all(|c| c.blocks[0].grid[2] == 1));
    }
    #[test]
    fn mixed_a_a_b_is_bounded_and_independently_disjoint() {
        let i = input(&[[100, 100, 100], [50, 100, 150]], ["25.5", "10.5", "15.5"]);
        let mut s = SpaceFitSearch::new(i).unwrap();
        let mut found = false;
        let mut ids = std::collections::BTreeSet::new();
        for _ in 0..1000 {
            let p = s.step(u32::MAX);
            assert!(p.nodes <= 1000);
            assert!(p.combinations.len() <= 100);
            for c in p.combinations {
                assert!(ids.insert(c.id));
                if c.blocks.len() == 2 {
                    assert!(c.blocks.iter().all(|b| b.grid[2] == 1));
                    assert!(validate_blocks(&c.blocks, [250, 100, 150]).is_some());
                    found |= c.blocks[0].quantity == "2" && c.blocks[1].quantity == "1";
                }
            }
            if p.combinations_complete {
                break;
            }
        }
        assert!(found);
    }
    #[test]
    fn compressed_large_grids_and_budget_are_deterministic() {
        let mut i = input(&[[1; 3]], ["1000"; 3]);
        allow(&mut i, false, Some(10000));
        let mut a = SpaceFitSearch::new(i.clone()).unwrap();
        let mut b = SpaceFitSearch::new(i).unwrap();
        for _ in 0..3 {
            assert_eq!(a.step(1000), b.step(1000));
        }
        assert!(!a.step(1).combinations_complete);
    }
    #[test]
    fn independent_validator_rejects_collision_overflow_floating_and_wrong_quantity() {
        let p = SpaceFitSearch::new(input(&[[100; 3]], ["30"; 3]))
            .unwrap()
            .step(1);
        let b = p.singles[0].blocks[0].clone();
        assert!(validate_blocks(&[b.clone(), b.clone()], [1000; 3]).is_none());
        let mut bad = b.clone();
        bad.origin_mm[2] = 1;
        assert!(validate_blocks(&[bad], [1000; 3]).is_none());
        let mut bad = b.clone();
        bad.grid = [u32::MAX; 3];
        assert!(validate_blocks(&[bad], [1000; 3]).is_none());
        let mut bad = b;
        bad.quantity = "2".into();
        assert!(validate_blocks(&[bad], [1000; 3]).is_none());
    }
    #[test]
    fn low_confidence_listing_is_evaluated_as_reference() {
        let value = item_value(
            "crawl:muji:1",
            "low",
            [Some(100), Some(100), Some(100)],
            Some("1000 KRW"),
        );
        let i = input_with(json!([value.clone()]), ["30.5"; 3], vec![listing(&value)]);
        let p = SpaceFitSearch::new(i).unwrap().step(1000);
        assert_eq!(p.missing_dimensions, 0);
        assert!(p.unmeasured.is_empty());
        assert_eq!(p.singles.len(), 1);
        assert_eq!(
            p.singles[0].dimension_provenance,
            DimensionProvenance::Reference
        );
        assert!(p.singles[0].unconfirmed);
        let block = &p.singles[0].blocks[0];
        assert_eq!(block.unit_mm, [100; 3]);
        assert_eq!(block.dimensions.provenance, DimensionProvenance::Reference);
        assert_eq!(block.dimensions.basis, DimensionBasis::Low);
        assert!(matches!(
            &block.price,
            SpaceFitPrice::Known {
                pack_price_krw,
                pack_quantity: None,
                unit_price_krw: None,
                basis: SpaceFitPriceBasis::Reference,
            } if pack_price_krw == "1000"
        ));
    }
    #[test]
    fn unparsed_or_partial_listing_stays_unmeasured() {
        for value in [
            item_value("crawl:muji:1", "unparsed", [None, None, None], None),
            item_value(
                "crawl:muji:1",
                "low",
                [Some(100), Some(100), None],
                Some("1000원"),
            ),
        ] {
            let i = input_with(json!([value.clone()]), ["50"; 3], vec![listing(&value)]);
            let mut search = SpaceFitSearch::new(i).unwrap();
            let page = search.step(1000);
            assert_eq!(page.missing_dimensions, 1);
            assert!(page.singles.is_empty());
            assert!(page.combinations.is_empty());
            assert_eq!(page.unmeasured.len(), 1);
            assert_eq!(page.unmeasured[0].variant_id, "crawl:muji:1");
            // The unmeasured preview is returned on the first page only.
            assert!(search.step(1000).unmeasured.is_empty());
        }
    }
    #[test]
    fn confirmed_snapshot_dimensions_win_over_a_listing() {
        let snapshot = item_value(
            "crawl:muji:1",
            "high",
            [Some(200), Some(200), Some(200)],
            None,
        );
        let changed = item_value(
            "crawl:muji:1",
            "low",
            [Some(999), Some(999), Some(999)],
            Some("19,900원"),
        );
        let mut i = input_with(json!([snapshot]), ["50"; 3], vec![listing(&changed)]);
        confirm_outer(&mut i);
        let p = SpaceFitSearch::new(i).unwrap().step(1000);
        let block = &p.singles[0].blocks[0];
        assert_eq!(block.unit_mm, [200; 3]);
        assert_eq!(block.dimensions.provenance, DimensionProvenance::Confirmed);
        assert_eq!(block.dimensions.basis, DimensionBasis::Unspecified);
        assert!(!p.singles[0].unconfirmed);
        assert_eq!(
            p.singles[0].dimension_provenance,
            DimensionProvenance::Confirmed
        );
    }
    #[test]
    fn listing_price_grammar_is_strict() {
        assert_eq!(parse_price_text("1000 KRW"), Some(1000));
        assert_eq!(parse_price_text("19,900원"), Some(19_900));
        assert_eq!(parse_price_text(" 1,234 원 "), Some(1_234));
        assert_eq!(parse_price_text("100000000원"), Some(100_000_000));
        for bad in [
            "1,00원",
            "약 1000원",
            "1000",
            "0원",
            "₩1000",
            "1000 krw",
            "10,00 KRW",
            "1,2345원",
            "100000001원",
            "-1000원",
            "1 000원",
        ] {
            assert_eq!(parse_price_text(bad), None, "{bad}");
        }
    }
    #[test]
    fn unit_price_needs_a_known_exact_pack_quantity() {
        let value = item_value(
            "crawl:muji:1",
            "high",
            [Some(100), Some(100), Some(100)],
            None,
        );
        let price = MoneyKrw::new(19_900).unwrap();
        let mut without_quantity = input_with(json!([value.clone()]), ["50"; 3], vec![]);
        set_offer_price(&mut without_quantity, price, None);
        let p = SpaceFitSearch::new(without_quantity).unwrap().step(1000);
        assert!(matches!(
            &p.singles[0].blocks[0].price,
            SpaceFitPrice::Known {
                pack_price_krw,
                pack_quantity: None,
                unit_price_krw: None,
                ..
            } if pack_price_krw == "19900"
        ));
        let mut inexact = input_with(json!([value.clone()]), ["50"; 3], vec![]);
        set_offer_price(&mut inexact, price, Some(PackQuantity::new(3).unwrap()));
        let p = SpaceFitSearch::new(inexact).unwrap().step(1000);
        assert!(matches!(
            &p.singles[0].blocks[0].price,
            SpaceFitPrice::Known {
                unit_price_krw: None,
                pack_quantity: Some(quantity),
                ..
            } if quantity == "3"
        ));
        let mut exact = input_with(json!([value]), ["50"; 3], vec![]);
        set_offer_price(&mut exact, price, Some(PackQuantity::new(2).unwrap()));
        let p = SpaceFitSearch::new(exact).unwrap().step(1000);
        assert!(matches!(
            &p.singles[0].blocks[0].price,
            SpaceFitPrice::Known {
                unit_price_krw: Some(unit_price),
                ..
            } if unit_price == "9950"
        ));
    }
    #[test]
    fn invalid_listings_are_refused() {
        let value = item_value(
            "crawl:muji:1",
            "high",
            [Some(100), Some(100), Some(100)],
            None,
        );
        let base = input_with(json!([value.clone()]), ["50"; 3], vec![]);
        let good = listing(&value);
        let mut missing_product = good.clone();
        missing_product.id = "crawl:muji:2".into();
        let mut bad_url = good.clone();
        bad_url.product_url = "https://evil.example/products/1".into();
        let mut bad_source = good.clone();
        bad_source.source = CrawlSite::Daiso;
        for listings in [
            vec![missing_product],
            vec![good.clone(), good.clone()],
            vec![bad_url],
            vec![bad_source],
        ] {
            let input = SpaceFitInput {
                listings,
                ..base.clone()
            };
            assert_eq!(
                SpaceFitSearch::new(input).err().unwrap(),
                "space_fit_listing_invalid"
            );
        }
    }
    #[test]
    fn no_listings_keeps_the_old_snapshot_only_behaviour() {
        let i = input(&[[200, 300, 100]], ["30.5"; 3]);
        let p = SpaceFitSearch::new(i).unwrap().step(1000);
        let block = &p.singles[0].blocks[0];
        assert_eq!(block.dimensions.provenance, DimensionProvenance::Reference);
        assert_eq!(block.dimensions.basis, DimensionBasis::Unspecified);
        assert_eq!(block.source, None);
        assert_eq!(block.seller_id.as_deref(), Some("seller-muji"));
        assert!(matches!(block.price, SpaceFitPrice::Unknown {}));
        assert!(p.unmeasured.is_empty());
    }
}
