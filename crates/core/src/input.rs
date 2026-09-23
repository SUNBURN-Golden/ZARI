//! Validated project input and physical-world entities (DOMAIN_MODEL §3).

use crate::catalog::OwnedContainer;
use crate::facts::*;
use crate::scalars::*;
use crate::strategy::Strategy;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogPin {
    pub catalog_version: String,
    pub catalog_digest: Digest,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchProfile {
    pub id: String,
    pub version: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchBudget {
    pub max_work_units: WorkCount,
    pub max_nodes: u32,
    pub max_candidates_per_group: u16,
    pub max_alternatives: u8,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchSelection {
    pub profile: SearchProfile,
    pub budget: SearchBudget,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub seed: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SpaceKind {
    RectangularCompartment,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum OpeningPlane {
    FrontYZero,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ObstacleRole {
    PhysicalSolid,
    AccessExclusion,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SupportKind {
    EstablishedFloor,
    ContainerCavityFloor,
}
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum Orientation {
    Upright0,
    Upright90,
}
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum RetrievalMode {
    DirectFrontExtraction,
    PullContainerThenRetrieve,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Rare,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum StockRole {
    Active,
    Reserve,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum GroupSplitPolicy {
    OneTarget,
    AllowMultipleTargets,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpaceOpening {
    pub plane: OpeningPlane,
    pub left: Fact<MeasuredOffset>,
    pub bottom: Fact<MeasuredOffset>,
    pub width: Measurement,
    pub height: Measurement,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Obstacle {
    pub id: Id,
    pub bounds: MeasuredCuboid,
    pub role: ObstacleRole,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupportSurface {
    pub id: Id,
    pub kind: SupportKind,
    pub footprint: MeasuredRectangle,
    pub elevation: Fact<MeasuredOffset>,
    pub load_limit: Fact<MassGrams>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StagingSupport {
    pub load_limit: Fact<MassGrams>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StagingEnvelope {
    pub free_volume: MeasuredCuboid,
    pub base_support: Fact<StagingSupport>,
}
/// Static wall and between-unit clearances, each independently sourced.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClearancePolicy {
    pub left: Fact<ClearanceMm>,
    pub right: Fact<ClearanceMm>,
    pub front: Fact<ClearanceMm>,
    pub back: Fact<ClearanceMm>,
    pub top: Fact<ClearanceMm>,
    pub between_units: Fact<ClearanceMm>,
    pub rule_ids: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CavityClearancePolicy {
    pub left: Fact<ClearanceMm>,
    pub right: Fact<ClearanceMm>,
    pub front: Fact<ClearanceMm>,
    pub back: Fact<ClearanceMm>,
    pub top: Fact<ClearanceMm>,
    pub between_items: Fact<ClearanceMm>,
}
/// Motion margins for the supported extraction model.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandlingClearance {
    pub left: Fact<ClearanceMm>,
    pub right: Fact<ClearanceMm>,
    pub top: Fact<ClearanceMm>,
    pub pull_extra_depth: Fact<ClearanceMm>,
    pub lift_above_rim: Fact<ClearanceMm>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Space {
    pub id: Id,
    pub kind: SpaceKind,
    pub interior: Dimensions,
    pub opening: SpaceOpening,
    pub staging: StagingEnvelope,
    pub support: SupportSurface,
    pub obstacles: Vec<Obstacle>,
    pub clearances: ClearancePolicy,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemDimensions {
    pub storage_state: String,
    pub envelope: Dimensions,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageRequirement {
    pub allowed_orientations: Fact<Vec<Orientation>>,
    pub allowed_retrieval_modes: Vec<RetrievalMode>,
    pub handling: HandlingClearance,
    pub must_stay_together: bool,
    pub mandatory_compatibility: Vec<Id>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Item {
    pub id: Id,
    pub label: String,
    pub category: String,
    pub quantity: Fact<Quantity>,
    pub dimensions: ItemDimensions,
    pub mass_each: Fact<MassGrams>,
    pub requirement: StorageRequirement,
    pub frequency: Fact<Frequency>,
    pub activity_ids: Vec<Id>,
    pub stock_role: Fact<StockRole>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemGroup {
    pub id: Id,
    pub label: String,
    pub item_ids: Vec<Id>,
    pub split_policy: GroupSplitPolicy,
}

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum SafetyRestriction {
    HazardousMaterials,
    HighLoad,
    ChildSafety,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ZoneKind {
    SoftPreference,
    HardLocked,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Zone {
    pub id: Id,
    pub label: String,
    pub kind: ZoneKind,
    pub bounds: Cuboid,
}
/// A user-locked assignment of one group to one explicit zone.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LockedGroupZone {
    pub group_id: Id,
    pub zone: Zone,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserConstraints {
    pub hard_budget: Fact<MoneyKrw>,
    pub soft_budget: Fact<MoneyKrw>,
    pub purchase_allowed: bool,
    pub hard_one_action_access: bool,
    pub safety_restrictions: Vec<SafetyRestriction>,
    pub locked_zones: Vec<LockedGroupZone>,
}
/// Ranked objective first; material/color/visual preferences never change
/// physical facts and never carry a synthetic safety score.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub objective_ranking: Vec<Strategy>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub material: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub color: Option<String>,
    pub visual_notes: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectInput {
    pub catalog_pin: CatalogPin,
    pub search: SearchSelection,
    pub space: Space,
    pub items: Vec<Item>,
    pub groups: Vec<ItemGroup>,
    pub owned_containers: Vec<OwnedContainer>,
    pub strategy_choice: Strategy,
    pub constraints: UserConstraints,
    pub preferences: Preferences,
    pub evidence: Vec<Evidence>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: Id,
    pub name: String,
    pub project_revision: Revision,
    pub input_revision: Revision,
    pub input: ProjectInput,
}
