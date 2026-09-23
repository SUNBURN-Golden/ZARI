//! Catalog identity and physical facts (DOMAIN_MODEL §4) plus the
//! user-owned container copies embedded in `ProjectInput`.

use crate::facts::*;
use crate::input::*;
use crate::scalars::*;
use crate::strategy::StoragePrimitive;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CatalogSourceKind {
    Synthetic,
    Imported,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Product {
    pub id: Id,
    pub brand: Fact<String>,
    pub name: String,
    pub category: String,
    pub provenance: Provenance,
}
/// Cavity floor origin in the original product frame.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InnerOffset {
    pub x: Fact<MeasuredOffset>,
    pub y: Fact<MeasuredOffset>,
    pub z: Fact<MeasuredOffset>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HandleEnvelope {
    IncludedInOuter {},
    ExtraExtent { extent: Extent3Mm },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum LidState {
    Absent,
    Present,
}
/// Only an evidenced conservative rectangular cavity is supported; a tapered
/// product uses an evidenced inscribed cuboid inside the outer envelope.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CavityModel {
    ConservativeCuboid,
    InscribedCuboid,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum MountingRequirement {
    None,
    Required,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Stackability {
    NotStackable {},
    Stackable { max_units: u32 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariantDimensions {
    pub outer: Dimensions,
    pub inner: Dimensions,
    pub inner_offset: Fact<InnerOffset>,
    pub inner_support: Fact<SupportSurface>,
    pub handles: Fact<HandleEnvelope>,
    pub lid_state: Fact<LidState>,
    pub cavity_model: Fact<CavityModel>,
    pub cavity_clearances: CavityClearancePolicy,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductVariant {
    pub id: Id,
    pub product_id: Id,
    pub option_label: String,
    pub dimensions: VariantDimensions,
    pub primitive: StoragePrimitive,
    pub allowed_orientations: Fact<Vec<Orientation>>,
    pub mass: Fact<MassGrams>,
    pub material: Fact<String>,
    pub color: Fact<String>,
    pub compatibility: Fact<Vec<Id>>,
    pub mounting: Fact<MountingRequirement>,
    pub stackability: Fact<Stackability>,
    pub handling: HandlingClearance,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum InventoryState {
    InStock,
    OutOfStock,
}
/// v1 supports a known fixed fee per seller order or free; anything else is an
/// explicit unknown/complex policy fact, never a zero-price default.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ShippingRule {
    Free {},
    FixedPerSeller { fee: Fact<MoneyKrw> },
    Complex {},
}
/// A declared component of a heterogeneous bundle. v1 plans only homogeneous
/// variant packs; a nonempty list marks the offer as an unsupported bundle.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleComponent {
    pub variant_id: Id,
    pub quantity: PackQuantity,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Offer {
    pub id: Id,
    pub variant_id: Id,
    pub seller_id: Id,
    pub url: Fact<String>,
    pub pack_quantity: Fact<PackQuantity>,
    pub pack_price: Fact<MoneyKrw>,
    pub inventory: Fact<InventoryState>,
    pub shipping: Fact<ShippingRule>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub observed_at: Option<String>,
    pub bundle_components: Vec<BundleComponent>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceObservation {
    pub id: Id,
    pub note: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub observed_at: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogSnapshot {
    pub schema_version: u32,
    pub catalog_version: String,
    pub catalog_digest: Digest,
    pub source_kind: CatalogSourceKind,
    pub products: Vec<Product>,
    pub variants: Vec<ProductVariant>,
    pub offers: Vec<Offer>,
    pub evidence: Vec<Evidence>,
    pub ingestion_version: String,
    pub source_observations: Vec<SourceObservation>,
}
/// Same versioned fields as `CatalogSnapshot` minus the digest that only Rust
/// produces; the catalog import boundary for Task008.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogImportDto {
    pub schema_version: u32,
    pub catalog_version: String,
    pub source_kind: CatalogSourceKind,
    pub products: Vec<Product>,
    pub variants: Vec<ProductVariant>,
    pub offers: Vec<Offer>,
    pub evidence: Vec<Evidence>,
    pub ingestion_version: String,
    pub source_observations: Vec<SourceObservation>,
}
/// The referenced subset retained inside a snapshot for historical display.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogEvidenceSubset {
    pub products: Vec<Product>,
    pub variants: Vec<ProductVariant>,
    pub offers: Vec<Offer>,
    pub evidence: Vec<Evidence>,
}

/// A stable reference to a catalog variant under a known catalog digest.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariantRef {
    pub variant_id: Id,
    pub catalog_digest: Digest,
}
/// The physical model copy embedded in a user-owned container; kept by value
/// so a later catalog change cannot rewrite owned facts.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhysicalContainerModel {
    pub dimensions: VariantDimensions,
    pub primitive: StoragePrimitive,
    pub allowed_orientations: Fact<Vec<Orientation>>,
    pub mass: Fact<MassGrams>,
    pub handling: HandlingClearance,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnedContainer {
    pub id: Id,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<VariantRef>")]
    pub variant_ref: Option<VariantRef>,
    pub physical: PhysicalContainerModel,
    pub quantity_owned: Fact<Quantity>,
    pub quantity_available: Fact<Quantity>,
    pub condition: Fact<String>,
    pub allowed_use: Fact<String>,
    pub provenance: Provenance,
}
