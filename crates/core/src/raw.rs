//! Raw input DTOs: the untrusted boundary that mirrors `ProjectInput` with
//! text-based numeric fields. Deserialization bounds the shape; normalization
//! converts to validated domain facts plus diagnostics.

use crate::catalog::*;
use crate::facts::*;
use crate::input::*;
use crate::scalars::*;
use crate::strategy::{StoragePrimitive, Strategy};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub type RawQuantityFact = RawFactDto<RawScalarTextDto>;
pub type RawMassFact = RawFactDto<RawScalarTextDto>;
pub type RawMoneyFact = RawFactDto<RawScalarTextDto>;
pub type RawClearanceFact = RawFactDto<RawScalarTextDto>;
pub type RawPackQuantityFact = RawFactDto<RawScalarTextDto>;
/// A bounded free-text value inside a known fact.
pub type RawTextFact = RawFactDto<RawScalarTextDto>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawDimensionsDto {
    pub width: RawMeasurementDto,
    pub depth: RawMeasurementDto,
    pub height: RawMeasurementDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawMeasuredCuboidDto {
    pub min_x: RawOffsetDto,
    pub min_y: RawOffsetDto,
    pub min_z: RawOffsetDto,
    pub extent: RawDimensionsDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawMeasuredRectangleDto {
    pub x: RawOffsetDto,
    pub y: RawOffsetDto,
    pub width: RawMeasurementDto,
    pub depth: RawMeasurementDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawSpaceOpeningDto {
    pub plane: OpeningPlane,
    pub left: RawOffsetDto,
    pub bottom: RawOffsetDto,
    pub width: RawMeasurementDto,
    pub height: RawMeasurementDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawSupportSurfaceDto {
    pub id: Id,
    pub kind: SupportKind,
    pub footprint: RawMeasuredRectangleDto,
    pub elevation: RawOffsetDto,
    pub load_limit: RawMassFact,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawObstacleDto {
    pub id: Id,
    pub bounds: RawMeasuredCuboidDto,
    pub role: ObstacleRole,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawStagingSupportDto {
    pub load_limit: RawMassFact,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawStagingEnvelopeDto {
    pub free_volume: RawMeasuredCuboidDto,
    pub base_support: RawFactDto<RawStagingSupportDto>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawClearancePolicyDto {
    pub left: RawClearanceFact,
    pub right: RawClearanceFact,
    pub front: RawClearanceFact,
    pub back: RawClearanceFact,
    pub top: RawClearanceFact,
    pub between_units: RawClearanceFact,
    pub rule_ids: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawCavityClearancePolicyDto {
    pub left: RawClearanceFact,
    pub right: RawClearanceFact,
    pub front: RawClearanceFact,
    pub back: RawClearanceFact,
    pub top: RawClearanceFact,
    pub between_items: RawClearanceFact,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawHandlingClearanceDto {
    pub left: RawClearanceFact,
    pub right: RawClearanceFact,
    pub top: RawClearanceFact,
    pub pull_extra_depth: RawClearanceFact,
    pub lift_above_rim: RawClearanceFact,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawSpaceDto {
    pub id: Id,
    pub kind: SpaceKind,
    pub interior: RawDimensionsDto,
    pub opening: RawSpaceOpeningDto,
    pub staging: RawStagingEnvelopeDto,
    pub support: RawSupportSurfaceDto,
    pub obstacles: Vec<RawObstacleDto>,
    pub clearances: RawClearancePolicyDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawItemDimensionsDto {
    pub storage_state: String,
    pub envelope: RawDimensionsDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawStorageRequirementDto {
    pub allowed_orientations: RawFactDto<Vec<Orientation>>,
    pub allowed_retrieval_modes: Vec<RetrievalMode>,
    pub handling: RawHandlingClearanceDto,
    pub must_stay_together: bool,
    pub mandatory_compatibility: Vec<Id>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawItemDto {
    pub id: Id,
    pub label: String,
    pub category: String,
    pub quantity: RawQuantityFact,
    pub dimensions: RawItemDimensionsDto,
    pub mass_each: RawMassFact,
    pub requirement: RawStorageRequirementDto,
    pub frequency: RawFactDto<Frequency>,
    pub activity_ids: Vec<Id>,
    pub stock_role: RawFactDto<StockRole>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawItemGroupDto {
    pub id: Id,
    pub label: String,
    pub item_ids: Vec<Id>,
    pub split_policy: GroupSplitPolicy,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawVariantRefDto {
    pub variant_id: Id,
    pub catalog_digest: Digest,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawInnerOffsetDto {
    pub x: RawOffsetDto,
    pub y: RawOffsetDto,
    pub z: RawOffsetDto,
}
/// A known-positive axis extent entered as measurement text; uncertainty is
/// not representable on `Extent3Mm` and is rejected during normalization.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawExtent3Dto {
    pub width: RawMeasurementDto,
    pub depth: RawMeasurementDto,
    pub height: RawMeasurementDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum RawHandleEnvelopeDto {
    IncludedInOuter {},
    ExtraExtent { extent: RawExtent3Dto },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawVariantDimensionsDto {
    pub outer: RawDimensionsDto,
    pub inner: RawDimensionsDto,
    pub inner_offset: RawFactDto<RawInnerOffsetDto>,
    pub inner_support: RawFactDto<RawSupportSurfaceDto>,
    pub handles: RawFactDto<RawHandleEnvelopeDto>,
    pub lid_state: RawFactDto<LidState>,
    pub cavity_model: RawFactDto<CavityModel>,
    pub cavity_clearances: RawCavityClearancePolicyDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawPhysicalContainerModelDto {
    pub dimensions: RawVariantDimensionsDto,
    pub primitive: StoragePrimitive,
    pub allowed_orientations: RawFactDto<Vec<Orientation>>,
    pub mass: RawMassFact,
    pub handling: RawHandlingClearanceDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawOwnedContainerDto {
    pub id: Id,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<RawVariantRefDto>")]
    pub variant_ref: Option<RawVariantRefDto>,
    pub physical: RawPhysicalContainerModelDto,
    pub quantity_owned: RawQuantityFact,
    pub quantity_available: RawQuantityFact,
    pub condition: RawTextFact,
    pub allowed_use: RawTextFact,
    pub provenance: Provenance,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawUserConstraintsDto {
    pub hard_budget: RawMoneyFact,
    pub soft_budget: RawMoneyFact,
    pub purchase_allowed: bool,
    pub hard_one_action_access: bool,
    pub safety_restrictions: Vec<SafetyRestriction>,
    pub locked_zones: Vec<LockedGroupZone>,
}
/// The project form of `NormalizeInputDto`: mirrors `ProjectInput` with raw
/// numeric fields. Rust normalization owns every conversion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawProjectInputDto {
    pub catalog_pin: CatalogPin,
    pub search: SearchSelection,
    pub space: RawSpaceDto,
    pub items: Vec<RawItemDto>,
    pub groups: Vec<RawItemGroupDto>,
    pub owned_containers: Vec<RawOwnedContainerDto>,
    pub strategy_choice: Strategy,
    pub constraints: RawUserConstraintsDto,
    pub preferences: Preferences,
    pub evidence: Vec<Evidence>,
}

/// One catalog field presented for stateless Rust scalar conversion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RawCatalogFieldValueDto {
    Measurement { raw: RawMeasurementDto },
    Quantity { text: String },
    PackQuantity { text: String },
    MoneyKrw { text: String },
    MassGrams { text: String },
    ClearanceMm { text: String },
    PositionMm { text: String },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawCatalogFieldDto {
    pub field_path: String,
    pub value: RawCatalogFieldValueDto,
}
