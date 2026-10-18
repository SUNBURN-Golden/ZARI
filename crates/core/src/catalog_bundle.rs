//! Dimension-only catalog bundle (SP-z-catalog-crawler).
//!
//! A bundle is the storage contract between the collection bot and the
//! read-only app. Rust is the only authority: it canonicalizes the bytes,
//! checks the checksum, refuses images, converts units, and turns the items
//! into rows for the existing provenance review so duplicate/option handling,
//! quarantine and the "no partial overwrite" rule stay in one place.
//! Every collected item is `unconfirmed`; nothing here promotes a fact.

use crate::catalog::CatalogSnapshot;
use crate::catalog_provenance::{
    CatalogProvenanceBatch, FieldSource, ProvenanceRow, RowDisposition, SourceScope,
    VerificationScope, review_rows_with_limit,
};
use crate::facts::{MAX_LABEL_CHARS, valid_locator, valid_text, valid_utc_timestamp};
use crate::scalars::{Id, Unit, parse_length};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const BUNDLE_SCHEMA_VERSION: u32 = 1;
pub const MAX_BUNDLE_ITEMS: usize = 5_000;
pub const MAX_BUNDLE_BYTES: usize = 10 * 1024 * 1024;
/// The existing validate/activate protocol messages are capped at 5 MiB, so a
/// snapshot larger than this could be stored but never planned with.
const MAX_SNAPSHOT_BYTES: usize = 4 * 1024 * 1024;
const MAX_ID_CHARS: usize = 80;
const MAX_RAW_TEXT_CHARS: usize = 1024;
const MAX_PRICE_TEXT_CHARS: usize = 64;
const GENERATOR_NAME_MAX: usize = 64;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
pub enum CrawlSite {
    #[serde(rename = "ohou")]
    Ohou,
    #[serde(rename = "29cm")]
    Cm29,
    #[serde(rename = "ikea")]
    Ikea,
}

impl CrawlSite {
    pub fn key(self) -> &'static str {
        match self {
            Self::Ohou => "ohou",
            Self::Cm29 => "29cm",
            Self::Ikea => "ikea",
        }
    }
    pub fn primary_host(self) -> &'static str {
        match self {
            Self::Ohou => "ohou.se",
            Self::Cm29 => "www.29cm.co.kr",
            Self::Ikea => "www.ikea.com",
        }
    }
    fn host_allowed(self, host: &str, path: &str) -> bool {
        match self {
            Self::Ohou => host == "ohou.se" || host == "store.ohou.se",
            Self::Cm29 => host == "www.29cm.co.kr",
            Self::Ikea => host == "www.ikea.com" && (path == "/kr" || path.starts_with("/kr/")),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CrawlSourceKind {
    Crawled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CrawlItemStatus {
    Unconfirmed,
}

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum CategoryHint {
    Shelf,
    Cabinet,
    Bin,
    Table,
    Chair,
    Sofa,
    Bed,
    Other,
    Unknown,
}

impl CategoryHint {
    fn name(self) -> &'static str {
        match self {
            Self::Shelf => "shelf",
            Self::Cabinet => "cabinet",
            Self::Bin => "bin",
            Self::Table => "table",
            Self::Chair => "chair",
            Self::Sofa => "sofa",
            Self::Bed => "bed",
            Self::Other => "other",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum LengthUnit {
    Mm,
    Cm,
    M,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum DimensionConfidence {
    High,
    Medium,
    Low,
    Unparsed,
}

/// Values stay in the page's own unit as decimal text. Conversion to mm is
/// done here, never by the collector.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleDimensions {
    pub raw_text: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub width: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub depth: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub height: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<LengthUnit>")]
    pub unit: Option<LengthUnit>,
    pub confidence: DimensionConfidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CrawledItem {
    pub id: String,
    pub source_kind: CrawlSourceKind,
    pub status: CrawlItemStatus,
    pub name: String,
    pub brand: String,
    pub category: String,
    pub category_hint: CategoryHint,
    pub product_url: String,
    pub source: CrawlSite,
    pub fetched_at: String,
    pub dimensions: BundleDimensions,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price_text: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleGenerator {
    pub name: String,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleSource {
    pub site: CrawlSite,
    pub host: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleManifest {
    pub schema_version: u32,
    pub bundle_id: String,
    pub created_at: String,
    pub generator: BundleGenerator,
    pub sources: Vec<BundleSource>,
    pub item_count: u32,
    pub bytes: u64,
    pub sha256: String,
    pub no_images: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogBundle {
    pub manifest: BundleManifest,
    pub items: Vec<CrawledItem>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleItemDiagnosis {
    pub index: u32,
    pub id: String,
    pub codes: Vec<String>,
}

/// Result of reading a bundle. `snapshot: null` publishes nothing and leaves
/// every stored catalog untouched.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogBundleReview {
    pub bundle_id: Option<String>,
    pub item_count: u32,
    pub codes: Vec<String>,
    pub items: Vec<BundleItemDiagnosis>,
    pub quarantined: bool,
    pub existing_untouched: bool,
    /// Items whose dimensions are not usable for placement (low/unparsed).
    pub unconfirmed_dimension_ids: Vec<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<CatalogSnapshot>")]
    pub snapshot: Option<CatalogSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildRejection {
    pub id: String,
    pub codes: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogBundleBuild {
    pub codes: Vec<String>,
    pub accepted: u32,
    pub rejected: Vec<BuildRejection>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub bundle_text: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub manifest_text: Option<String>,
}

// ---- canonical bytes -------------------------------------------------------

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let sorted: BTreeMap<&String, &Value> = map.iter().collect();
            out.push('{');
            for (index, (key, item)) in sorted.into_iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).expect("string encodes"));
                out.push(':');
                write_canonical(item, out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&serde_json::to_string(other).expect("scalar encodes")),
    }
}

pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn items_canonical(items: &[CrawledItem]) -> String {
    canonical_json(&serde_json::to_value(items).expect("items encode"))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn derived_bundle_id(sha: &str) -> String {
    format!("b-{}", &sha[..16])
}

// ---- image refusal ---------------------------------------------------------

const IMAGE_KEYS: [&str; 12] = [
    "image",
    "images",
    "img",
    "photo",
    "photos",
    "picture",
    "thumbnail",
    "thumb",
    "thumbnails",
    "imageurl",
    "photourl",
    "thumbnailurl",
];
const IMAGE_EXTENSIONS: [&str; 10] = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".heic", ".ico",
];

fn image_like_string(text: &str) -> bool {
    let lower = text.trim().to_ascii_lowercase();
    if lower.starts_with("data:image") {
        return true;
    }
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("//")) {
        return false;
    }
    let path = lower.split(['?', '#']).next().unwrap_or("");
    IMAGE_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

fn contains_image(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, item)| {
            let lowered = key.to_ascii_lowercase();
            IMAGE_KEYS.contains(&lowered.as_str()) || contains_image(item)
        }),
        Value::Array(items) => items.iter().any(contains_image),
        Value::String(text) => image_like_string(text),
        _ => false,
    }
}

// ---- item checks -----------------------------------------------------------

fn id_parts(id: &str) -> Option<(CrawlSite, &str, Option<&str>)> {
    let mut parts = id.split(':');
    if parts.next()? != "crawl" {
        return None;
    }
    let site = match parts.next()? {
        "ohou" => CrawlSite::Ohou,
        "29cm" => CrawlSite::Cm29,
        "ikea" => CrawlSite::Ikea,
        _ => return None,
    };
    let product = parts.next()?;
    let option = parts.next();
    if parts.next().is_some() {
        return None;
    }
    let token = |text: &str| {
        !text.is_empty()
            && text
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    };
    if !token(product) || option.is_some_and(|o| !token(o)) {
        return None;
    }
    Some((site, product, option))
}

fn url_parts(url: &str) -> Option<(&str, &str)> {
    let rest = url.strip_prefix("https://")?;
    let (authority, tail) = match rest.find(['/', '?', '#']) {
        Some(at) => (&rest[..at], &rest[at..]),
        None => (rest, "/"),
    };
    if authority.is_empty() || authority.contains(['@', ':', ' ']) {
        return None;
    }
    let path = tail.split(['?', '#']).next().unwrap_or("/");
    let path = if path.is_empty() { "/" } else { path };
    Some((authority, path))
}

/// Decimal text in the page's unit → whole millimetres as text.
fn to_mm_text(text: &str, unit: LengthUnit) -> Result<String, String> {
    let (whole, fraction) = match text.split_once('.') {
        Some((whole, fraction)) => (whole, fraction),
        None => (text, ""),
    };
    let ok = |part: &str| part.bytes().all(|b| b.is_ascii_digit());
    if whole.is_empty()
        || whole.len() > 7
        || fraction.len() > 3
        || !ok(whole)
        || !ok(fraction)
        || (text.contains('.') && fraction.is_empty())
    {
        return Err("invalid_number".into());
    }
    let scale_digits = match unit {
        LengthUnit::Mm => 0,
        LengthUnit::Cm => 1,
        LengthUnit::M => 3,
    };
    if fraction.len() > scale_digits && fraction[scale_digits..].bytes().any(|b| b != b'0') {
        return Err("submillimeter_precision".into());
    }
    let mut padded = fraction.chars().take(scale_digits).collect::<String>();
    while padded.len() < scale_digits {
        padded.push('0');
    }
    let digits = format!("{whole}{padded}");
    let trimmed = digits.trim_start_matches('0');
    Ok(if trimmed.is_empty() {
        "0".into()
    } else {
        trimmed.into()
    })
}

fn axis_mm(
    value: &Option<String>,
    unit: Option<LengthUnit>,
    codes: &mut BTreeSet<String>,
) -> String {
    let Some(text) = value else {
        return String::new();
    };
    let Some(unit) = unit else {
        codes.insert("unit_missing".into());
        return String::new();
    };
    match to_mm_text(text, unit) {
        Ok(mm) => match parse_length(&mm, Unit::Mm) {
            Ok(Some(_)) => mm,
            Ok(None) => String::new(),
            Err(code) => {
                codes.insert(code);
                String::new()
            }
        },
        Err(code) => {
            codes.insert(code);
            String::new()
        }
    }
}

struct ItemRow {
    row: ProvenanceRow,
    dimensions_usable: bool,
}

fn check_item(item: &CrawledItem, codes: &mut BTreeSet<String>) -> Option<ItemRow> {
    let parts = id_parts(&item.id);
    match parts {
        None => {
            codes.insert("invalid_id".into());
        }
        Some((site, _, _)) => {
            if site != item.source {
                codes.insert("source_id_mismatch".into());
            }
        }
    }
    if item.id.chars().count() > MAX_ID_CHARS || Id::new(&item.id).is_err() {
        codes.insert("invalid_id".into());
    }
    if !valid_text(item.name.trim(), MAX_LABEL_CHARS) {
        codes.insert("required_text_missing".into());
    }
    if item.brand.chars().count() > MAX_LABEL_CHARS
        || item.category.chars().count() > MAX_LABEL_CHARS
    {
        codes.insert("text_too_long".into());
    }
    let url_ok = valid_locator(&item.product_url)
        && url_parts(&item.product_url)
            .is_some_and(|(host, path)| item.source.host_allowed(host, path));
    if !url_ok {
        codes.insert("product_url_not_allowed".into());
    }
    if !valid_utc_timestamp(&item.fetched_at) {
        codes.insert("invalid_timestamp".into());
    }
    if item
        .price_text
        .as_ref()
        .is_some_and(|p| p.chars().count() > MAX_PRICE_TEXT_CHARS)
    {
        codes.insert("text_too_long".into());
    }
    let dims = &item.dimensions;
    if dims.raw_text.chars().count() > MAX_RAW_TEXT_CHARS {
        codes.insert("text_too_long".into());
    }
    let present = [&dims.width, &dims.depth, &dims.height]
        .iter()
        .filter(|v| v.is_some())
        .count();
    let consistent = match dims.confidence {
        DimensionConfidence::High => present == 3 && dims.unit.is_some(),
        DimensionConfidence::Medium => present >= 2 && dims.unit.is_some(),
        DimensionConfidence::Low => true,
        DimensionConfidence::Unparsed => present == 0 && dims.unit.is_none(),
    };
    if !consistent {
        codes.insert("confidence_inconsistent".into());
    }
    if present > 0 && dims.unit.is_none() {
        codes.insert("unit_missing".into());
    }
    let usable = matches!(
        dims.confidence,
        DimensionConfidence::High | DimensionConfidence::Medium
    );
    // Low/unparsed values are kept in the bundle for display only; the
    // snapshot gets unknown axes so a guess can never become a fit.
    let (w, d, h) = if usable {
        (
            axis_mm(&dims.width, dims.unit, codes),
            axis_mm(&dims.depth, dims.unit, codes),
            axis_mm(&dims.height, dims.unit, codes),
        )
    } else {
        // Still reject malformed numbers so a bad value cannot hide as low.
        for value in [&dims.width, &dims.depth, &dims.height] {
            let _ = axis_mm(value, dims.unit, codes);
        }
        (String::new(), String::new(), String::new())
    };
    let (_, _, option) = parts?;
    let site = item.source.key();
    let source_note = format!(
        "crawled; site={site}; confidence={:?}; unit={:?}; category={}; raw={}",
        dims.confidence,
        dims.unit,
        clip(&item.category, 120),
        clip(&dims.raw_text, 200)
    );
    let row = ProvenanceRow {
        // Each item is its own product: options are never merged under one
        // product, so two options can differ in name and size without conflict.
        product_id: format!("p-{}", item.id),
        model: item.name.trim().to_owned(),
        brand: item.brand.trim().to_owned(),
        category: item.category_hint.name().to_owned(),
        option_id: item.id.clone(),
        option_label: option.unwrap_or("기본").to_owned(),
        seller_id: format!("seller-{site}"),
        primitive: if item.category_hint == CategoryHint::Bin {
            "openBin".into()
        } else {
            "directPlacement".into()
        },
        outer_width_mm: w,
        outer_depth_mm: d,
        outer_height_mm: h,
        inner_width_mm: String::new(),
        inner_depth_mm: String::new(),
        inner_height_mm: String::new(),
        protrusion_mm: String::new(),
        load_grams: String::new(),
        sources: vec![
            FieldSource {
                scope: SourceScope::Outer,
                url: Some(item.product_url.clone()),
                confirmed_at: Some(item.fetched_at.clone()),
                photo_ref: None,
                verification_scope: VerificationScope::Unverified,
                note: source_note,
            },
            FieldSource {
                scope: SourceScope::Seller,
                url: Some(item.product_url.clone()),
                confirmed_at: Some(item.fetched_at.clone()),
                photo_ref: None,
                verification_scope: VerificationScope::Unverified,
                note: "crawled product link; price not collected as a fact".into(),
            },
        ],
    };
    Some(ItemRow {
        row,
        dimensions_usable: usable,
    })
}

fn clip(text: &str, max: usize) -> String {
    text.chars()
        .filter(|c| !c.is_control() && *c != ';')
        .take(max)
        .collect()
}

// ---- review ----------------------------------------------------------------

fn empty_review(codes: &[&str]) -> CatalogBundleReview {
    CatalogBundleReview {
        bundle_id: None,
        item_count: 0,
        codes: codes.iter().map(|c| (*c).to_owned()).collect(),
        items: vec![],
        quarantined: true,
        existing_untouched: true,
        unconfirmed_dimension_ids: vec![],
        snapshot: None,
    }
}

/// Read a bundle from untrusted text. Never panics; a refused bundle returns
/// `snapshot: null` and `existingUntouched: true`.
pub fn review_bundle_text(text: &str) -> CatalogBundleReview {
    if text.len() > MAX_BUNDLE_BYTES {
        return empty_review(&["bundle_too_large"]);
    }
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return empty_review(&["invalid_json"]);
    };
    if contains_image(&value) {
        return empty_review(&["image_refused"]);
    }
    let Some(object) = value.as_object() else {
        return empty_review(&["bundle_schema_invalid"]);
    };
    let version = object
        .get("manifest")
        .and_then(|m| m.get("schemaVersion"))
        .and_then(Value::as_u64);
    if version.is_some_and(|v| v != u64::from(BUNDLE_SCHEMA_VERSION)) {
        return empty_review(&["schema_version_mismatch"]);
    }
    let Ok(bundle) = serde_json::from_value::<CatalogBundle>(value) else {
        return empty_review(&["bundle_schema_invalid"]);
    };
    review_bundle(&bundle)
}

pub fn review_bundle(bundle: &CatalogBundle) -> CatalogBundleReview {
    let manifest = &bundle.manifest;
    let mut codes: BTreeSet<String> = BTreeSet::new();
    if manifest.schema_version != BUNDLE_SCHEMA_VERSION {
        codes.insert("schema_version_mismatch".into());
    }
    if !manifest.no_images {
        codes.insert("images_not_declared_absent".into());
    }
    if bundle.items.len() > MAX_BUNDLE_ITEMS {
        let mut review = empty_review(&["item_limit_exceeded"]);
        review.item_count = bundle.items.len().min(u32::MAX as usize) as u32;
        return review;
    }
    if manifest.item_count as usize != bundle.items.len() {
        codes.insert("item_count_mismatch".into());
    }
    let canonical = items_canonical(&bundle.items);
    if manifest.bytes != canonical.len() as u64 {
        codes.insert("bytes_mismatch".into());
    }
    let sha = sha256_hex(canonical.as_bytes());
    if manifest.sha256 != sha {
        codes.insert("checksum_mismatch".into());
    }
    if manifest.bundle_id != derived_bundle_id(&sha) {
        codes.insert("bundle_id_mismatch".into());
    }
    if !valid_utc_timestamp(&manifest.created_at) {
        codes.insert("invalid_timestamp".into());
    }
    if !valid_text(&manifest.generator.name, GENERATOR_NAME_MAX)
        || !valid_text(&manifest.generator.version, GENERATOR_NAME_MAX)
    {
        codes.insert("required_text_missing".into());
    }
    if manifest.sources != sources_of(&bundle.items) {
        codes.insert("sources_mismatch".into());
    }
    if bundle.items.windows(2).any(|pair| pair[0].id >= pair[1].id) {
        codes.insert("items_not_sorted".into());
    }

    let mut diagnoses: Vec<BTreeSet<String>> = vec![BTreeSet::new(); bundle.items.len()];
    let mut rows = Vec::with_capacity(bundle.items.len());
    let mut unconfirmed_dimension_ids = Vec::new();
    for (index, item) in bundle.items.iter().enumerate() {
        match check_item(item, &mut diagnoses[index]) {
            Some(item_row) => {
                if !item_row.dimensions_usable {
                    unconfirmed_dimension_ids.push(item.id.clone());
                }
                rows.push(item_row.row);
            }
            None => rows.push(ProvenanceRow {
                product_id: String::new(),
                model: String::new(),
                brand: String::new(),
                category: String::new(),
                option_id: String::new(),
                option_label: String::new(),
                seller_id: String::new(),
                primitive: String::new(),
                outer_width_mm: String::new(),
                outer_depth_mm: String::new(),
                outer_height_mm: String::new(),
                inner_width_mm: String::new(),
                inner_depth_mm: String::new(),
                inner_height_mm: String::new(),
                protrusion_mm: String::new(),
                load_grams: String::new(),
                sources: vec![],
            }),
        }
    }
    let item_blocked = diagnoses.iter().any(|set| !set.is_empty());
    let mut snapshot = None;
    if !item_blocked && codes.is_empty() {
        let batch = CatalogProvenanceBatch {
            catalog_version: manifest.bundle_id.clone(),
            ingestion_version: "crawl-1".into(),
            rows,
            existing_digest: None,
        };
        match review_rows_with_limit(&batch, MAX_BUNDLE_ITEMS) {
            Ok(reply) => {
                for diagnosis in &reply.diagnoses {
                    if diagnosis.disposition == RowDisposition::Quarantine {
                        diagnoses[diagnosis.row_index as usize]
                            .extend(diagnosis.codes.iter().cloned());
                    }
                }
                codes.extend(reply.batch_codes.iter().cloned());
                if !reply.quarantined {
                    snapshot = reply.snapshot;
                }
            }
            Err(error) => {
                codes.insert(error.code.to_owned());
            }
        }
        if let Some(found) = &snapshot {
            let size = serde_json::to_vec(found)
                .map(|v| v.len())
                .unwrap_or(usize::MAX);
            if size > MAX_SNAPSHOT_BYTES {
                codes.insert("snapshot_too_large".into());
                snapshot = None;
            }
        }
    }
    let item_blocked = diagnoses.iter().any(|set| !set.is_empty());
    let quarantined = item_blocked || !codes.is_empty() || snapshot.is_none();
    CatalogBundleReview {
        bundle_id: Some(manifest.bundle_id.clone()),
        item_count: bundle.items.len() as u32,
        codes: codes.into_iter().collect(),
        items: diagnoses
            .into_iter()
            .enumerate()
            .filter(|(_, set)| !set.is_empty())
            .map(|(index, set)| BundleItemDiagnosis {
                index: index as u32,
                id: bundle.items[index].id.clone(),
                codes: set.into_iter().collect(),
            })
            .collect(),
        quarantined,
        existing_untouched: true,
        unconfirmed_dimension_ids,
        snapshot: if quarantined { None } else { snapshot },
    }
}

fn sources_of(items: &[CrawledItem]) -> Vec<BundleSource> {
    items
        .iter()
        .map(|item| item.source)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(|site| BundleSource {
            site,
            host: site.primary_host().to_owned(),
        })
        .collect()
}

// ---- build -----------------------------------------------------------------

/// Build the canonical bundle bytes from collected items. Items that fail
/// validation are dropped one by one and reported; the bundle is only emitted
/// when what remains passes the same review the app runs. The same input and
/// arguments always produce the same bytes.
pub fn build_bundle(
    items: Vec<CrawledItem>,
    created_at: &str,
    generator: BundleGenerator,
) -> CatalogBundleBuild {
    let mut rejected: Vec<BuildRejection> = Vec::new();
    let mut codes: BTreeSet<String> = BTreeSet::new();
    if !valid_utc_timestamp(created_at) {
        codes.insert("invalid_timestamp".into());
    }
    let mut by_id: BTreeMap<String, Vec<CrawledItem>> = BTreeMap::new();
    for item in items {
        by_id.entry(item.id.clone()).or_default().push(item);
    }
    let mut kept: Vec<CrawledItem> = Vec::new();
    for (id, group) in by_id {
        if group.windows(2).all(|pair| pair[0] == pair[1]) {
            kept.push(group.into_iter().next().expect("nonempty group"));
        } else {
            rejected.push(BuildRejection {
                id,
                codes: vec!["duplicate_id_conflict".into()],
            });
        }
    }
    if kept.len() > MAX_BUNDLE_ITEMS {
        codes.insert("item_limit_exceeded".into());
        kept.clear();
    }
    if !codes.is_empty() {
        return CatalogBundleBuild {
            codes: codes.into_iter().collect(),
            accepted: 0,
            rejected,
            bundle_text: None,
            manifest_text: None,
        };
    }
    for _pass in 0..8 {
        if kept.is_empty() {
            codes.insert("empty_bundle".into());
            break;
        }
        let bundle = assemble(&kept, created_at, &generator);
        let review = review_bundle(&bundle);
        if !review.quarantined {
            let manifest_value = serde_json::to_value(&bundle.manifest).expect("manifest encodes");
            let bundle_value = serde_json::to_value(&bundle).expect("bundle encodes");
            return CatalogBundleBuild {
                codes: vec![],
                accepted: kept.len() as u32,
                rejected,
                bundle_text: Some(canonical_json(&bundle_value)),
                manifest_text: Some(canonical_json(&manifest_value)),
            };
        }
        if review.items.is_empty() {
            codes.extend(review.codes);
            break;
        }
        let bad: BTreeMap<String, Vec<String>> = review
            .items
            .into_iter()
            .map(|diagnosis| (diagnosis.id, diagnosis.codes))
            .collect();
        kept.retain(|item| match bad.get(&item.id) {
            Some(item_codes) => {
                rejected.push(BuildRejection {
                    id: item.id.clone(),
                    codes: item_codes.clone(),
                });
                false
            }
            None => true,
        });
    }
    if codes.is_empty() {
        codes.insert("build_failed".into());
    }
    CatalogBundleBuild {
        codes: codes.into_iter().collect(),
        accepted: 0,
        rejected,
        bundle_text: None,
        manifest_text: None,
    }
}

/// Entry point for the bot: each element is parsed on its own, so one
/// malformed or image-bearing element is rejected by itself instead of failing
/// the whole collection.
pub fn build_bundle_from_json(
    text: &str,
    created_at: &str,
    generator: BundleGenerator,
) -> CatalogBundleBuild {
    let failed = |code: &str| CatalogBundleBuild {
        codes: vec![code.to_owned()],
        accepted: 0,
        rejected: vec![],
        bundle_text: None,
        manifest_text: None,
    };
    if text.len() > MAX_BUNDLE_BYTES {
        return failed("input_too_large");
    }
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(text) else {
        return failed("items_schema_invalid");
    };
    let mut parsed = Vec::new();
    let mut early: Vec<BuildRejection> = Vec::new();
    for value in values {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .chars()
            .take(96)
            .collect::<String>();
        if contains_image(&value) {
            early.push(BuildRejection {
                id,
                codes: vec!["image_refused".into()],
            });
        } else {
            match serde_json::from_value::<CrawledItem>(value) {
                Ok(item) => parsed.push(item),
                Err(_) => early.push(BuildRejection {
                    id,
                    codes: vec!["item_schema_invalid".into()],
                }),
            }
        }
    }
    let mut build = build_bundle(parsed, created_at, generator);
    early.append(&mut build.rejected);
    build.rejected = early;
    build
}

fn assemble(items: &[CrawledItem], created_at: &str, generator: &BundleGenerator) -> CatalogBundle {
    let mut sorted: Vec<CrawledItem> = items.to_vec();
    sorted.sort_by(|a, b| a.id.cmp(&b.id));
    let canonical = items_canonical(&sorted);
    let sha = sha256_hex(canonical.as_bytes());
    CatalogBundle {
        manifest: BundleManifest {
            schema_version: BUNDLE_SCHEMA_VERSION,
            bundle_id: derived_bundle_id(&sha),
            created_at: created_at.to_owned(),
            generator: generator.clone(),
            sources: sources_of(&sorted),
            item_count: sorted.len() as u32,
            bytes: canonical.len() as u64,
            sha256: sha,
            no_images: true,
        },
        items: sorted,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, source: CrawlSite, url: &str, dims: BundleDimensions) -> CrawledItem {
        CrawledItem {
            id: id.into(),
            source_kind: CrawlSourceKind::Crawled,
            status: CrawlItemStatus::Unconfirmed,
            name: "테스트 선반".into(),
            brand: "브랜드".into(),
            category: "수납 > 선반".into(),
            category_hint: CategoryHint::Shelf,
            product_url: url.into(),
            source,
            fetched_at: "2026-10-15T00:00:00Z".into(),
            dimensions: dims,
            price_text: Some("19,900원".into()),
        }
    }

    fn high() -> BundleDimensions {
        BundleDimensions {
            raw_text: "가로 80cm 세로 30cm 높이 120cm".into(),
            width: Some("80".into()),
            depth: Some("30".into()),
            height: Some("120".into()),
            unit: Some(LengthUnit::Cm),
            confidence: DimensionConfidence::High,
        }
    }

    fn unparsed() -> BundleDimensions {
        BundleDimensions {
            raw_text: "80 x 30 x 120".into(),
            width: None,
            depth: None,
            height: None,
            unit: None,
            confidence: DimensionConfidence::Unparsed,
        }
    }

    fn generator() -> BundleGenerator {
        BundleGenerator {
            name: "zari-catalog-crawler-bot".into(),
            version: "1".into(),
        }
    }

    fn sample() -> Vec<CrawledItem> {
        vec![
            item(
                "crawl:ikea:12345678",
                CrawlSite::Ikea,
                "https://www.ikea.com/kr/ko/p/kallax-12345678/",
                high(),
            ),
            item(
                "crawl:ohou:777",
                CrawlSite::Ohou,
                "https://ohou.se/productions/777/selling",
                unparsed(),
            ),
        ]
    }

    fn built() -> (String, CatalogBundle) {
        let build = build_bundle(sample(), "2026-10-15T01:00:00Z", generator());
        assert_eq!(build.codes, Vec::<String>::new());
        let text = build.bundle_text.expect("bundle built");
        let bundle = serde_json::from_str(&text).expect("bundle parses");
        (text, bundle)
    }

    #[test]
    fn builds_identical_bytes_for_identical_input_in_any_order() {
        let first = build_bundle(sample(), "2026-10-15T01:00:00Z", generator());
        let mut reversed = sample();
        reversed.reverse();
        let second = build_bundle(reversed, "2026-10-15T01:00:00Z", generator());
        assert_eq!(first.bundle_text, second.bundle_text);
        assert_eq!(first.manifest_text, second.manifest_text);
    }

    #[test]
    fn review_accepts_built_bundle_and_never_confirms() {
        let (text, _) = built();
        let review = review_bundle_text(&text);
        assert!(!review.quarantined, "{:?}", review);
        let snapshot = review.snapshot.expect("snapshot");
        assert_eq!(snapshot.variants.len(), 2);
        assert_eq!(review.unconfirmed_dimension_ids, vec!["crawl:ohou:777"]);
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(!json.contains("\"verification\":\"confirmed\""));
        let ikea = snapshot
            .variants
            .iter()
            .find(|v| v.id.as_str() == "crawl:ikea:12345678")
            .unwrap();
        // Inner stays unknown; the outer value is never copied into it.
        let inner = serde_json::to_value(&ikea.dimensions.inner).unwrap();
        assert!(inner.to_string().contains("unknown"));
        assert!(!inner.to_string().contains("\"known\""));
        // Low/unparsed dimensions become unknown axes, not zero.
        let ohou = snapshot
            .variants
            .iter()
            .find(|v| v.id.as_str() == "crawl:ohou:777")
            .unwrap();
        assert!(
            !serde_json::to_string(&ohou.dimensions.outer)
                .unwrap()
                .contains("\"known\"")
        );
    }

    #[test]
    fn converts_units_without_guessing() {
        assert_eq!(to_mm_text("80", LengthUnit::Cm).unwrap(), "800");
        assert_eq!(to_mm_text("80.5", LengthUnit::Cm).unwrap(), "805");
        assert_eq!(to_mm_text("1.205", LengthUnit::M).unwrap(), "1205");
        assert_eq!(to_mm_text("80.0", LengthUnit::Mm).unwrap(), "80");
        assert_eq!(
            to_mm_text("80.55", LengthUnit::Cm).unwrap_err(),
            "submillimeter_precision"
        );
        assert_eq!(
            to_mm_text("80.5", LengthUnit::Mm).unwrap_err(),
            "submillimeter_precision"
        );
        assert_eq!(
            to_mm_text("-1", LengthUnit::Cm).unwrap_err(),
            "invalid_number"
        );
        assert_eq!(
            to_mm_text("1e3", LengthUnit::Cm).unwrap_err(),
            "invalid_number"
        );
    }

    #[test]
    fn refuses_image_keys_and_urls_for_the_whole_bundle() {
        let (text, _) = built();
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["items"][0]["image"] = Value::String("x".into());
        assert_eq!(
            review_bundle_text(&value.to_string()).codes,
            vec!["image_refused"]
        );
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["items"][0]["dimensions"]["rawText"] =
            Value::String("https://cdn.example/a.JPG?x=1".into());
        assert_eq!(
            review_bundle_text(&value.to_string()).codes,
            vec!["image_refused"]
        );
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["items"][1]["name"] = Value::String("data:image/png;base64,AAAA".into());
        assert_eq!(
            review_bundle_text(&value.to_string()).codes,
            vec!["image_refused"]
        );
    }

    #[test]
    fn rejects_checksum_unknown_fields_version_and_limits() {
        let (text, _) = built();
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["items"][0]["name"] = Value::String("변조".into());
        let tampered = review_bundle_text(&value.to_string());
        assert!(tampered.codes.contains(&"checksum_mismatch".to_owned()));
        assert!(tampered.snapshot.is_none() && tampered.existing_untouched);
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["items"][0]["extra"] = Value::Bool(true);
        assert_eq!(
            review_bundle_text(&value.to_string()).codes,
            vec!["bundle_schema_invalid"]
        );
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["manifest"]["schemaVersion"] = Value::from(2);
        assert_eq!(
            review_bundle_text(&value.to_string()).codes,
            vec!["schema_version_mismatch"]
        );
        assert_eq!(review_bundle_text("{").codes, vec!["invalid_json"]);
        let big = " ".repeat(MAX_BUNDLE_BYTES + 1);
        assert_eq!(review_bundle_text(&big).codes, vec!["bundle_too_large"]);
        let mut value: Value = serde_json::from_str(&text).unwrap();
        value["manifest"]["noImages"] = Value::Bool(false);
        assert!(review_bundle_text(&value.to_string()).quarantined);
    }

    #[test]
    fn one_bad_element_does_not_fail_the_collection() {
        let good = serde_json::to_value(sample()).unwrap();
        let mut values = good.as_array().unwrap().clone();
        values.push(serde_json::json!({"id":"crawl:ikea:9","image":"x"}));
        values.push(serde_json::json!({"id":"crawl:ikea:10","nope":1}));
        let build = build_bundle_from_json(
            &Value::Array(values).to_string(),
            "2026-10-15T01:00:00Z",
            generator(),
        );
        assert_eq!(build.accepted, 2);
        let codes: Vec<_> = build.rejected.iter().map(|r| r.codes[0].as_str()).collect();
        assert_eq!(codes, vec!["image_refused", "item_schema_invalid"]);
    }

    #[test]
    fn item_limit_is_enforced() {
        let mut items = Vec::new();
        for n in 0..=MAX_BUNDLE_ITEMS {
            items.push(item(
                &format!("crawl:ikea:{n:08}"),
                CrawlSite::Ikea,
                "https://www.ikea.com/kr/ko/p/x/",
                unparsed(),
            ));
        }
        let build = build_bundle(items, "2026-10-15T01:00:00Z", generator());
        assert_eq!(build.codes, vec!["item_limit_exceeded"]);
        assert!(build.bundle_text.is_none());
    }

    #[test]
    fn product_url_must_be_https_and_on_the_matching_site_host() {
        for url in [
            "http://www.ikea.com/kr/ko/p/x/",
            "https://evil.example/kr/ko/p/x/",
            "https://www.ikea.com/us/en/p/x/",
            "https://user:pw@www.ikea.com/kr/ko/p/x/",
            "https://www.ikea.com.evil.example/kr/ko/p/x/",
            "https://www.29cm.co.kr/products/1",
        ] {
            let build = build_bundle(
                vec![item("crawl:ikea:1", CrawlSite::Ikea, url, high())],
                "2026-10-15T01:00:00Z",
                generator(),
            );
            assert!(build.bundle_text.is_none(), "{url}");
            assert_eq!(
                build.rejected[0].codes,
                vec!["product_url_not_allowed"],
                "{url}"
            );
        }
    }

    #[test]
    fn options_stay_separate_and_conflicting_options_are_not_merged() {
        let mut a = item(
            "crawl:ohou:5:small",
            CrawlSite::Ohou,
            "https://ohou.se/productions/5/selling",
            high(),
        );
        let mut b = a.clone();
        b.id = "crawl:ohou:5:large".into();
        b.dimensions.width = Some("120".into());
        a.dimensions.width = Some("60".into());
        let build = build_bundle(vec![a, b], "2026-10-15T01:00:00Z", generator());
        assert_eq!(build.accepted, 2);
        let review = review_bundle_text(&build.bundle_text.unwrap());
        assert_eq!(review.snapshot.unwrap().variants.len(), 2);
        // Same id, different content: both are dropped, never merged.
        let one = item(
            "crawl:ohou:5",
            CrawlSite::Ohou,
            "https://ohou.se/productions/5/selling",
            high(),
        );
        let mut two = one.clone();
        two.dimensions.height = Some("200".into());
        let build = build_bundle(vec![one, two], "2026-10-15T01:00:00Z", generator());
        assert!(build.bundle_text.is_none());
        assert_eq!(build.rejected[0].codes, vec!["duplicate_id_conflict"]);
    }

    #[test]
    fn confidence_must_match_the_values() {
        let mut dims = high();
        dims.unit = None;
        let build = build_bundle(
            vec![item(
                "crawl:ikea:1",
                CrawlSite::Ikea,
                "https://www.ikea.com/kr/ko/p/x/",
                dims,
            )],
            "2026-10-15T01:00:00Z",
            generator(),
        );
        assert!(
            build.rejected[0]
                .codes
                .contains(&"confidence_inconsistent".to_owned())
        );
        let mut dims = unparsed();
        dims.width = Some("10".into());
        dims.unit = Some(LengthUnit::Cm);
        let build = build_bundle(
            vec![item(
                "crawl:ikea:1",
                CrawlSite::Ikea,
                "https://www.ikea.com/kr/ko/p/x/",
                dims,
            )],
            "2026-10-15T01:00:00Z",
            generator(),
        );
        assert!(
            build.rejected[0]
                .codes
                .contains(&"confidence_inconsistent".to_owned())
        );
        // A low item may carry a partial reading but never reaches the snapshot.
        let mut low = high();
        low.confidence = DimensionConfidence::Low;
        low.depth = None;
        let build = build_bundle(
            vec![item(
                "crawl:ikea:1",
                CrawlSite::Ikea,
                "https://www.ikea.com/kr/ko/p/x/",
                low,
            )],
            "2026-10-15T01:00:00Z",
            generator(),
        );
        let review = review_bundle_text(&build.bundle_text.unwrap());
        assert_eq!(review.unconfirmed_dimension_ids, vec!["crawl:ikea:1"]);
    }
}
