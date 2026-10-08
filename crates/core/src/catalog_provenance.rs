//! Import review for real-product provenance.
//!
//! Identity sources (brand, model, option, seller) stay separate from
//! dimension sources (outer, inner, protrusion, load). A quarantined row
//! blocks the whole batch: Rust does not publish a partial catalog and does
//! not rewrite an existing digest. Import never sets `Confirmed`.

use crate::canonical::{self, canonicalize_catalog, catalog_digest};
use crate::catalog::*;
use crate::facts::*;
use crate::input::{CavityClearancePolicy, HandlingClearance};
use crate::scalars::{Id, MassGrams, Unit, parse_length, parse_mass_grams};
use crate::strategy::StoragePrimitive;
use crate::validate;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use unicode_normalization::UnicodeNormalization;

const MAX_ROWS: usize = 100;
const MAX_SOURCES: usize = 8;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum SourceScope {
    Brand,
    Model,
    Option,
    Seller,
    Outer,
    Inner,
    Protrusion,
    Load,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum VerificationScope {
    Unknown,
    Unverified,
    Verified,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SampleBundleKind {
    Synthetic,
    Verified,
    Unverified,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum RowDisposition {
    Ready,
    Quarantine,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldSource {
    pub scope: SourceScope,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub url: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub confirmed_at: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub photo_ref: Option<String>,
    pub verification_scope: VerificationScope,
    pub note: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvenanceRow {
    pub product_id: String,
    pub model: String,
    pub brand: String,
    pub category: String,
    pub option_id: String,
    pub option_label: String,
    pub seller_id: String,
    pub primitive: String,
    pub outer_width_mm: String,
    pub outer_depth_mm: String,
    pub outer_height_mm: String,
    pub inner_width_mm: String,
    pub inner_depth_mm: String,
    pub inner_height_mm: String,
    pub protrusion_mm: String,
    pub load_grams: String,
    pub sources: Vec<FieldSource>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogProvenanceBatch {
    pub catalog_version: String,
    pub ingestion_version: String,
    pub rows: Vec<ProvenanceRow>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub existing_digest: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CatalogReviewAction {
    Review { batch: CatalogProvenanceBatch },
    Sample { bundle: SampleBundleKind },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RowDiagnosis {
    pub row_index: u32,
    pub disposition: RowDisposition,
    pub codes: Vec<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub duplicate_of: Option<u32>,
    pub unknown_scopes: Vec<SourceScope>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogProvenanceReply {
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<SampleBundleKind>")]
    pub bundle: Option<SampleBundleKind>,
    pub diagnoses: Vec<RowDiagnosis>,
    pub batch_codes: Vec<String>,
    pub quarantined: bool,
    pub existing_untouched: bool,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<CatalogSnapshot>")]
    pub snapshot: Option<CatalogSnapshot>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProvenanceError {
    pub code: &'static str,
}

struct RowMark {
    codes: BTreeSet<String>,
    duplicate_of: Option<u32>,
    unknown_scopes: BTreeSet<SourceScope>,
}

pub fn review_catalog_import(
    action: &CatalogReviewAction,
) -> Result<CatalogProvenanceReply, ProvenanceError> {
    match action {
        CatalogReviewAction::Sample { bundle } => assemble(&sample_batch(*bundle), Some(*bundle)),
        CatalogReviewAction::Review { batch } => assemble(batch, None),
    }
}

pub fn sample_batch(kind: SampleBundleKind) -> CatalogProvenanceBatch {
    let (version, rows) = match kind {
        SampleBundleKind::Synthetic => (
            "sample-synthetic",
            vec![
                sample_row(SampleSpec {
                    product_id: "syn:box",
                    model: "합성 데모 상자",
                    brand: "",
                    category: "box",
                    option_id: "syn:box-s",
                    option_label: "소형",
                    outer: ["200", "150", "100"],
                    inner: ["", "", ""],
                    protrusion: "",
                    load: "",
                    sources: vec![],
                }),
                sample_row(SampleSpec {
                    product_id: "syn:box",
                    model: "합성 데모 상자",
                    brand: "",
                    category: "box",
                    option_id: "syn:box-m",
                    option_label: "중형",
                    outer: ["400", "280", "180"],
                    inner: ["", "", ""],
                    protrusion: "",
                    load: "",
                    sources: vec![],
                }),
            ],
        ),
        SampleBundleKind::Verified => (
            "sample-verified",
            vec![sample_row(SampleSpec {
                product_id: "prod-verified",
                model: "검증 샘플 서랍",
                brand: "샘플브랜드",
                category: "drawer",
                option_id: "var-verified-40",
                option_label: "40cm",
                outer: ["400", "300", "180"],
                inner: ["360", "270", "150"],
                protrusion: "12",
                load: "800",
                sources: SourceScope::ALL.into_iter().map(filled_source).collect(),
            })],
        ),
        SampleBundleKind::Unverified => (
            "sample-unverified",
            vec![sample_row(SampleSpec {
                product_id: "prod-open",
                model: "미확인 샘플",
                brand: "",
                category: "box",
                option_id: "var-open",
                option_label: "기본",
                outer: ["300", "200", "150"],
                inner: ["", "", ""],
                protrusion: "",
                load: "",
                sources: vec![FieldSource {
                    scope: SourceScope::Outer,
                    url: None,
                    confirmed_at: None,
                    photo_ref: None,
                    verification_scope: VerificationScope::Unverified,
                    note: "포장 눈금".into(),
                }],
            })],
        ),
    };
    CatalogProvenanceBatch {
        catalog_version: version.into(),
        ingestion_version: "provenance-1".into(),
        rows,
        existing_digest: None,
    }
}

impl SourceScope {
    const ALL: [Self; 8] = [
        Self::Brand,
        Self::Model,
        Self::Option,
        Self::Seller,
        Self::Outer,
        Self::Inner,
        Self::Protrusion,
        Self::Load,
    ];

    fn name(self) -> &'static str {
        match self {
            Self::Brand => "brand",
            Self::Model => "model",
            Self::Option => "option",
            Self::Seller => "seller",
            Self::Outer => "outer",
            Self::Inner => "inner",
            Self::Protrusion => "protrusion",
            Self::Load => "load",
        }
    }
}

fn assemble(
    batch: &CatalogProvenanceBatch,
    bundle: Option<SampleBundleKind>,
) -> Result<CatalogProvenanceReply, ProvenanceError> {
    if batch.rows.len() > MAX_ROWS {
        return Err(ProvenanceError {
            code: "input_limit_exceeded",
        });
    }
    let mut marks: Vec<RowMark> = batch.rows.iter().map(mark_row).collect();
    mark_duplicates(&batch.rows, &mut marks);
    mark_product_identity(&batch.rows, &mut marks);
    let mut batch_codes = BTreeSet::new();
    if batch.rows.is_empty() {
        batch_codes.insert("empty_import".into());
    }
    if !valid_text(&nfc(&batch.catalog_version), MAX_LABEL_CHARS) {
        batch_codes.insert("required_text_missing".into());
    }
    if !valid_text(&nfc(&batch.ingestion_version), MAX_LABEL_CHARS) {
        batch_codes.insert("required_text_missing".into());
    }
    if batch
        .existing_digest
        .as_ref()
        .is_some_and(|digest| !digest_ok(digest))
    {
        batch_codes.insert("invalid_digest".into());
    }
    let row_blocked = marks.iter().any(quarantined);
    let blocked = row_blocked || !batch_codes.is_empty();
    let snapshot = if blocked {
        None
    } else {
        publish(batch, bundle, &mut batch_codes)
    };
    let quarantined = blocked || snapshot.is_none();
    Ok(CatalogProvenanceReply {
        bundle,
        diagnoses: marks
            .into_iter()
            .enumerate()
            .map(|(index, mark)| RowDiagnosis {
                row_index: index as u32,
                disposition: if quarantined_mark(&mark) {
                    RowDisposition::Quarantine
                } else {
                    RowDisposition::Ready
                },
                codes: mark.codes.into_iter().collect(),
                duplicate_of: mark.duplicate_of,
                unknown_scopes: mark.unknown_scopes.into_iter().collect(),
            })
            .collect(),
        batch_codes: batch_codes.into_iter().collect(),
        quarantined,
        existing_untouched: true,
        snapshot,
    })
}

fn quarantined_mark(mark: &RowMark) -> bool {
    mark.codes.iter().any(|code| !informational(code))
}

fn quarantined(mark: &RowMark) -> bool {
    quarantined_mark(mark)
}

fn informational(code: &str) -> bool {
    matches!(
        code,
        "inner_left_unknown" | "verification_not_promoted" | "protrusion_recorded"
    )
}

fn mark_row(row: &ProvenanceRow) -> RowMark {
    let mut mark = RowMark {
        codes: BTreeSet::new(),
        duplicate_of: None,
        unknown_scopes: BTreeSet::new(),
    };
    require_id(&row.product_id, &mut mark);
    require_id(&row.option_id, &mut mark);
    require_label(&row.model, &mut mark);
    require_label(&row.category, &mut mark);
    require_label(&row.option_label, &mut mark);
    if row.brand.chars().count() > MAX_LABEL_CHARS {
        mark.codes.insert("text_too_long".into());
    }
    if !row.seller_id.is_empty() && Id::new(row.seller_id.trim()).is_err() {
        mark.codes.insert("invalid_id".into());
    }
    if row.primitive.is_empty() {
        mark.codes.insert("primitive_missing".into());
    } else if parse_primitive(&row.primitive).is_none() {
        mark.codes.insert("unsupported_primitive".into());
    }
    check_length(&row.outer_width_mm, &mut mark);
    check_length(&row.outer_depth_mm, &mut mark);
    check_length(&row.outer_height_mm, &mut mark);
    check_length(&row.inner_width_mm, &mut mark);
    check_length(&row.inner_depth_mm, &mut mark);
    check_length(&row.inner_height_mm, &mut mark);
    check_length(&row.protrusion_mm, &mut mark);
    check_mass(&row.load_grams, &mut mark);
    if axis_blank(&row.inner_width_mm)
        && axis_blank(&row.inner_depth_mm)
        && axis_blank(&row.inner_height_mm)
    {
        mark.unknown_scopes.insert(SourceScope::Inner);
        if !axis_blank(&row.outer_width_mm)
            || !axis_blank(&row.outer_depth_mm)
            || !axis_blank(&row.outer_height_mm)
        {
            mark.codes.insert("inner_left_unknown".into());
        }
    }
    if axis_blank(&row.protrusion_mm) {
        mark.unknown_scopes.insert(SourceScope::Protrusion);
    }
    if axis_blank(&row.load_grams) {
        mark.unknown_scopes.insert(SourceScope::Load);
    }
    if row.brand.trim().is_empty() {
        mark.unknown_scopes.insert(SourceScope::Brand);
    }
    if row.sources.len() > MAX_SOURCES {
        mark.codes.insert("input_limit_exceeded".into());
    }
    let mut seen = BTreeSet::new();
    for source in &row.sources {
        if !seen.insert(source.scope) {
            mark.codes.insert("duplicate_source_scope".into());
        }
        check_source(row, source, &mut mark);
    }
    if !row.option_id.is_empty() && evidence_id(&row.option_id, SourceScope::Outer).is_err() {
        mark.codes.insert("evidence_id_too_long".into());
    }
    if !row.seller_id.is_empty() && offer_id(&row.option_id).is_err() {
        mark.codes.insert("offer_id_too_long".into());
    }
    mark
}

fn check_source(row: &ProvenanceRow, source: &FieldSource, mark: &mut RowMark) {
    if let Some(url) = &source.url
        && !valid_locator(url)
    {
        mark.codes.insert("invalid_locator".into());
    }
    if let Some(photo) = &source.photo_ref
        && (photo_bytes(photo) || !valid_locator(photo))
    {
        mark.codes.insert("photo_bytes_refused".into());
    }
    if let Some(confirmed) = &source.confirmed_at
        && !valid_utc_timestamp(confirmed)
    {
        mark.codes.insert("invalid_timestamp".into());
    }
    if source.note.chars().count() > MAX_NOTE_CHARS {
        mark.codes.insert("note_too_long".into());
    }
    if source.verification_scope == VerificationScope::Verified {
        mark.codes.insert("verification_not_promoted".into());
    }
    if source.scope == SourceScope::Protrusion && !axis_blank(&row.protrusion_mm) {
        mark.codes.insert("protrusion_recorded".into());
    }
}

fn mark_duplicates(rows: &[ProvenanceRow], marks: &mut [RowMark]) {
    let mut groups: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (index, row) in rows.iter().enumerate() {
        groups.entry(nfc(&row.option_id)).or_default().push(index);
    }
    for indexes in groups.values() {
        if indexes.len() < 2 {
            continue;
        }
        let first = indexes[0];
        let same = indexes
            .iter()
            .all(|index| option_signature(&rows[*index]) == option_signature(&rows[first]));
        if same {
            for index in indexes.iter().skip(1) {
                marks[*index].codes.insert("duplicate_row".into());
                marks[*index].duplicate_of = Some(first as u32);
            }
        } else {
            for index in indexes {
                marks[*index].codes.insert("option_not_merged".into());
                if *index != first {
                    marks[*index].duplicate_of = Some(first as u32);
                }
            }
        }
    }
}

fn mark_product_identity(rows: &[ProvenanceRow], marks: &mut [RowMark]) {
    let mut groups: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (index, row) in rows.iter().enumerate() {
        groups.entry(nfc(&row.product_id)).or_default().push(index);
    }
    for indexes in groups.values() {
        let first = indexes[0];
        let same = indexes
            .iter()
            .all(|index| product_signature(&rows[*index]) == product_signature(&rows[first]));
        if !same {
            for index in indexes {
                marks[*index]
                    .codes
                    .insert("product_identity_conflict".into());
            }
        }
    }
}

fn publish(
    batch: &CatalogProvenanceBatch,
    bundle: Option<SampleBundleKind>,
    batch_codes: &mut BTreeSet<String>,
) -> Option<CatalogSnapshot> {
    let origin = if bundle == Some(SampleBundleKind::Synthetic) {
        MeasurementOrigin::Synthetic
    } else {
        MeasurementOrigin::UserDeclared
    };
    let source_kind = if bundle == Some(SampleBundleKind::Synthetic) {
        CatalogSourceKind::Synthetic
    } else {
        CatalogSourceKind::Imported
    };
    let mut evidence = Vec::new();
    let mut evidence_ids: BTreeMap<(usize, SourceScope), Id> = BTreeMap::new();
    for (index, row) in batch.rows.iter().enumerate() {
        for source in &row.sources {
            if !source_worth_recording(row, source) {
                continue;
            }
            let Ok(id) = evidence_id(&row.option_id, source.scope) else {
                batch_codes.insert("catalog_rejected".into());
                return None;
            };
            evidence.push(Evidence {
                id: id.clone(),
                source_kind: origin.clone(),
                locator: source.url.clone().or_else(|| source.photo_ref.clone()),
                source_field: source.scope.name().into(),
                note: evidence_note(row, source),
                observed_at: source.confirmed_at.clone(),
                confirmed_by: None,
            });
            evidence_ids.insert((index, source.scope), id);
        }
    }
    let mut products = Vec::new();
    let mut variants = Vec::new();
    let mut offers = Vec::new();
    let mut seen_products = BTreeSet::new();
    for (index, row) in batch.rows.iter().enumerate() {
        let product_id = Id::new(row.product_id.trim()).ok()?;
        let option_id = Id::new(row.option_id.trim()).ok()?;
        if seen_products.insert(product_id.as_str().to_owned()) {
            let model_evidence = evidence_ids.get(&(index, SourceScope::Model));
            products.push(Product {
                id: product_id.clone(),
                brand: text_fact(
                    &nfc(&row.brand),
                    evidence_ids.get(&(index, SourceScope::Brand)),
                    origin.clone(),
                    observed(row, SourceScope::Brand),
                ),
                name: nfc(&row.model),
                category: nfc(&row.category),
                provenance: prov(
                    origin.clone(),
                    model_evidence,
                    observed(row, SourceScope::Model),
                ),
            });
        }
        let primitive = parse_primitive(&row.primitive)?;
        variants.push(ProductVariant {
            id: option_id.clone(),
            product_id: product_id.clone(),
            option_label: nfc(&row.option_label),
            dimensions: dimensions_for(row, index, &evidence_ids, origin.clone()),
            primitive,
            allowed_orientations: Fact::unknown(),
            mass: mass_fact(
                &row.load_grams,
                evidence_ids.get(&(index, SourceScope::Load)),
                origin.clone(),
                observed(row, SourceScope::Load),
            ),
            material: Fact::unknown(),
            color: Fact::unknown(),
            compatibility: Fact::unknown(),
            mounting: Fact::unknown(),
            stackability: Fact::unknown(),
            handling: clearances(),
        });
        if !row.seller_id.trim().is_empty() {
            let seller_evidence = evidence_ids.get(&(index, SourceScope::Seller));
            offers.push(Offer {
                id: offer_id(&row.option_id).ok()?,
                variant_id: option_id,
                seller_id: Id::new(row.seller_id.trim()).ok()?,
                url: url_fact(
                    row,
                    seller_evidence,
                    origin.clone(),
                    observed(row, SourceScope::Seller),
                ),
                pack_quantity: Fact::Unknown {
                    reason: UnknownReason::SourceMissing,
                },
                pack_price: Fact::Unknown {
                    reason: UnknownReason::SourceMissing,
                },
                inventory: Fact::Unknown {
                    reason: UnknownReason::SourceMissing,
                },
                shipping: Fact::Unknown {
                    reason: UnknownReason::SourceMissing,
                },
                observed_at: observed(row, SourceScope::Seller),
                bundle_components: vec![],
            });
        }
    }
    let import = CatalogImportDto {
        schema_version: canonical::SCHEMA_VERSION,
        catalog_version: nfc(&batch.catalog_version),
        source_kind,
        products,
        variants,
        offers,
        evidence,
        ingestion_version: nfc(&batch.ingestion_version),
        source_observations: vec![SourceObservation {
            id: Id::new("obs-review").expect("constant id"),
            note: observation_note(bundle).into(),
            observed_at: None,
        }],
    };
    let content = canonicalize_catalog(&canonical::CatalogContent::from(&import));
    let diagnostics = validate::validate_catalog_content(&content);
    if !diagnostics.is_empty() {
        batch_codes.insert("catalog_rejected".into());
        return None;
    }
    let digest = catalog_digest(&content);
    Some(CatalogSnapshot {
        schema_version: content.schema_version,
        catalog_version: content.catalog_version,
        catalog_digest: digest,
        source_kind: content.source_kind,
        products: content.products,
        variants: content.variants,
        offers: content.offers,
        evidence: content.evidence,
        ingestion_version: content.ingestion_version,
        source_observations: content.source_observations,
    })
}

fn dimensions_for(
    row: &ProvenanceRow,
    index: usize,
    evidence_ids: &BTreeMap<(usize, SourceScope), Id>,
    origin: MeasurementOrigin,
) -> VariantDimensions {
    let outer_id = evidence_ids.get(&(index, SourceScope::Outer));
    let inner_id = evidence_ids.get(&(index, SourceScope::Inner));
    VariantDimensions {
        outer: Dimensions {
            width: length_fact(&row.outer_width_mm, outer_id, origin.clone(), None),
            depth: length_fact(&row.outer_depth_mm, outer_id, origin.clone(), None),
            height: length_fact(&row.outer_height_mm, outer_id, origin.clone(), None),
        },
        inner: Dimensions {
            width: length_fact(&row.inner_width_mm, inner_id, origin.clone(), None),
            depth: length_fact(&row.inner_depth_mm, inner_id, origin.clone(), None),
            height: length_fact(&row.inner_height_mm, inner_id, origin, None),
        },
        inner_offset: Fact::unknown(),
        inner_support: Fact::unknown(),
        handles: Fact::unknown(),
        lid_state: Fact::unknown(),
        cavity_model: Fact::unknown(),
        cavity_clearances: CavityClearancePolicy {
            left: unknown_clearance(),
            right: unknown_clearance(),
            front: unknown_clearance(),
            back: unknown_clearance(),
            top: unknown_clearance(),
            between_items: unknown_clearance(),
        },
    }
}

fn length_fact(
    text: &str,
    evidence: Option<&Id>,
    origin: MeasurementOrigin,
    observed_at: Option<String>,
) -> Fact<MeasuredLength> {
    match parse_length(text, Unit::Mm) {
        Ok(Some(nominal)) => Fact::Known {
            value: MeasuredLength {
                nominal,
                uncertainty: Uncertainty::Unknown {},
            },
            provenance: prov(origin, evidence, observed_at),
        },
        _ => Fact::Unknown {
            reason: UnknownReason::NotProvided,
        },
    }
}

fn mass_fact(
    text: &str,
    evidence: Option<&Id>,
    origin: MeasurementOrigin,
    observed_at: Option<String>,
) -> Fact<MassGrams> {
    match parse_mass_grams(text) {
        Ok(Some(value)) => Fact::Known {
            value,
            provenance: prov(origin, evidence, observed_at),
        },
        _ => Fact::Unknown {
            reason: UnknownReason::NotProvided,
        },
    }
}

fn text_fact(
    text: &str,
    evidence: Option<&Id>,
    origin: MeasurementOrigin,
    observed_at: Option<String>,
) -> Fact<String> {
    if text.is_empty() {
        Fact::Unknown {
            reason: UnknownReason::NotProvided,
        }
    } else {
        Fact::Known {
            value: text.to_owned(),
            provenance: prov(origin, evidence, observed_at),
        }
    }
}

fn url_fact(
    row: &ProvenanceRow,
    evidence: Option<&Id>,
    origin: MeasurementOrigin,
    observed_at: Option<String>,
) -> Fact<String> {
    match source_of(row, SourceScope::Seller).and_then(|source| source.url.clone()) {
        Some(url) if !url.is_empty() => Fact::Known {
            value: url,
            provenance: prov(origin, evidence, observed_at),
        },
        _ => Fact::Unknown {
            reason: UnknownReason::SourceMissing,
        },
    }
}

fn prov(
    origin: MeasurementOrigin,
    evidence: Option<&Id>,
    observed_at: Option<String>,
) -> Provenance {
    Provenance {
        origin,
        verification: VerificationStatus::Unverified,
        evidence_ids: evidence.cloned().into_iter().collect(),
        rule_ids: vec![],
        input_refs: vec![],
        observed_at,
    }
}

fn observed(row: &ProvenanceRow, scope: SourceScope) -> Option<String> {
    source_of(row, scope).and_then(|source| source.confirmed_at.clone())
}

fn source_of(row: &ProvenanceRow, scope: SourceScope) -> Option<&FieldSource> {
    row.sources.iter().find(|source| source.scope == scope)
}

fn source_worth_recording(row: &ProvenanceRow, source: &FieldSource) -> bool {
    source.url.is_some()
        || source.confirmed_at.is_some()
        || source.photo_ref.is_some()
        || !source.note.is_empty()
        || source.verification_scope != VerificationScope::Unknown
        || (source.scope == SourceScope::Protrusion && !axis_blank(&row.protrusion_mm))
}

fn evidence_note(row: &ProvenanceRow, source: &FieldSource) -> String {
    let mut parts = vec![
        format!("scope={}", source.scope.name()),
        format!(
            "verificationScope={}",
            match source.verification_scope {
                VerificationScope::Unknown => "unknown",
                VerificationScope::Unverified => "unverified",
                VerificationScope::Verified => "verified",
            }
        ),
    ];
    if let Some(photo) = &source.photo_ref {
        parts.push(format!("photo={photo}"));
    }
    if source.scope == SourceScope::Protrusion && !axis_blank(&row.protrusion_mm) {
        parts.push(format!("protrusionMm={}", row.protrusion_mm.trim()));
    }
    if !source.note.is_empty() {
        parts.push(source.note.clone());
    }
    parts.join("; ")
}

fn observation_note(bundle: Option<SampleBundleKind>) -> &'static str {
    match bundle {
        Some(SampleBundleKind::Synthetic) => "합성 샘플. 실상품이 아니다.",
        Some(SampleBundleKind::Verified) => "검증 범위를 기록했다. 사실 상태는 미확인이다.",
        Some(SampleBundleKind::Unverified) => "미확인 샘플. 빈 내경은 외경으로 채우지 않는다.",
        None => "출처 검토 가져오기. 확인은 승격되지 않는다.",
    }
}

fn clearances() -> HandlingClearance {
    HandlingClearance {
        left: unknown_clearance(),
        right: unknown_clearance(),
        top: unknown_clearance(),
        pull_extra_depth: unknown_clearance(),
        lift_above_rim: unknown_clearance(),
    }
}

fn unknown_clearance() -> Fact<crate::scalars::ClearanceMm> {
    Fact::Unknown {
        reason: UnknownReason::NotProvided,
    }
}

fn check_length(text: &str, mark: &mut RowMark) {
    if let Err(code) = parse_length(text, Unit::Mm) {
        mark.codes.insert(code);
    }
}

fn check_mass(text: &str, mark: &mut RowMark) {
    if let Err(code) = parse_mass_grams(text) {
        mark.codes.insert(code);
    }
}

fn require_id(text: &str, mark: &mut RowMark) {
    if Id::new(text.trim()).is_err() {
        mark.codes.insert("invalid_id".into());
    }
}

fn require_label(text: &str, mark: &mut RowMark) {
    if !valid_text(&nfc(text), MAX_LABEL_CHARS) {
        mark.codes.insert("required_text_missing".into());
    }
}

fn parse_primitive(text: &str) -> Option<StoragePrimitive> {
    Some(match text.trim() {
        "directPlacement" => StoragePrimitive::DirectPlacement,
        "openBin" => StoragePrimitive::OpenBin,
        "tray" => StoragePrimitive::Tray,
        "verticalFile" => StoragePrimitive::VerticalFile,
        _ => return None,
    })
}

fn axis_blank(text: &str) -> bool {
    text.trim().is_empty()
}

fn photo_bytes(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.starts_with("data:")
        || lower.starts_with("javascript:")
        || lower.starts_with("file:")
        || lower.contains("base64,")
}

fn digest_ok(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn evidence_id(option_id: &str, scope: SourceScope) -> Result<Id, ()> {
    Id::new(&format!("ev-{}-{}", option_id.trim(), scope.name())).map_err(|_| ())
}

fn offer_id(option_id: &str) -> Result<Id, ()> {
    Id::new(&format!("of-{}", option_id.trim())).map_err(|_| ())
}

fn nfc(text: &str) -> String {
    text.trim().nfc().collect()
}

fn product_signature(row: &ProvenanceRow) -> (String, String, String) {
    (nfc(&row.model), nfc(&row.brand), nfc(&row.category))
}

fn option_signature(row: &ProvenanceRow) -> String {
    [
        nfc(&row.product_id),
        nfc(&row.model),
        nfc(&row.brand),
        nfc(&row.category),
        nfc(&row.option_id),
        nfc(&row.option_label),
        nfc(&row.seller_id),
        nfc(&row.primitive),
        nfc(&row.outer_width_mm),
        nfc(&row.outer_depth_mm),
        nfc(&row.outer_height_mm),
        nfc(&row.inner_width_mm),
        nfc(&row.inner_depth_mm),
        nfc(&row.inner_height_mm),
        nfc(&row.protrusion_mm),
        nfc(&row.load_grams),
    ]
    .join("\u{1f}")
}

fn filled_source(scope: SourceScope) -> FieldSource {
    FieldSource {
        scope,
        url: Some("https://example.invalid/drawer".into()),
        confirmed_at: Some("2026-01-15T00:00:00Z".into()),
        photo_ref: Some("drawer-front.jpg".into()),
        verification_scope: VerificationScope::Verified,
        note: String::new(),
    }
}

struct SampleSpec {
    product_id: &'static str,
    model: &'static str,
    brand: &'static str,
    category: &'static str,
    option_id: &'static str,
    option_label: &'static str,
    outer: [&'static str; 3],
    inner: [&'static str; 3],
    protrusion: &'static str,
    load: &'static str,
    sources: Vec<FieldSource>,
}

fn sample_row(spec: SampleSpec) -> ProvenanceRow {
    ProvenanceRow {
        product_id: spec.product_id.into(),
        model: spec.model.into(),
        brand: spec.brand.into(),
        category: spec.category.into(),
        option_id: spec.option_id.into(),
        option_label: spec.option_label.into(),
        seller_id: if spec
            .sources
            .iter()
            .any(|source| source.scope == SourceScope::Seller)
        {
            "seller-sample".into()
        } else {
            String::new()
        },
        primitive: "openBin".into(),
        outer_width_mm: spec.outer[0].into(),
        outer_depth_mm: spec.outer[1].into(),
        outer_height_mm: spec.outer[2].into(),
        inner_width_mm: spec.inner[0].into(),
        inner_depth_mm: spec.inner[1].into(),
        inner_height_mm: spec.inner[2].into(),
        protrusion_mm: spec.protrusion.into(),
        load_grams: spec.load.into(),
        sources: spec.sources,
    }
}
