//! Checks, candidate layouts, BOM, guide actions, search output and the
//! immutable snapshot identity contract (DOMAIN_MODEL §6–7). Data structures
//! and structural validation only; no solver or physical validator lives here.

use crate::catalog::{CatalogEvidenceSubset, CatalogSnapshot};
use crate::facts::*;
use crate::input::*;
use crate::scalars::*;
use crate::strategy::StrategyDecision;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CheckStatus {
    Pass,
    Fail,
    Unknown,
    NotApplicable,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CheckKind {
    OuterGeometry,
    InnerCapacity,
    InstallationPath,
    OperationalAccess,
    SupportGeometry,
    SupportLoad,
    Orientation,
    QuantityConservation,
    Compatibility,
    Inventory,
    Price,
    Shipping,
    Budget,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CheckBasis {
    Nominal,
    Conservative,
    NonGeometric,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckMeasurement {
    pub field_path: String,
    pub value_mm: Fact<Revision>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Remediation {
    pub code: String,
    pub field_paths: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConstraintCheck {
    pub id: Id,
    pub kind: CheckKind,
    pub subject_ids: Vec<Id>,
    pub status: CheckStatus,
    pub reason_code: String,
    pub basis: CheckBasis,
    pub evidence_refs: Vec<FieldRef>,
    pub measurements: Vec<CheckMeasurement>,
    pub blocking: bool,
    pub remediation: Vec<Remediation>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PhysicalAssurance {
    ConfirmedWithinScope,
    Conditional,
    Rejected,
}
/// The exact known/unknown instance partition exposed by a report.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssignmentCompleteness {
    pub assigned_instances: UnitCount,
    pub provisional_instances: UnitCount,
    pub unassigned_instances: UnitCount,
    pub unknown_quantity_items: UnitCount,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CommerceReadiness {
    Ready,
    Conditional,
    NotApplicable,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidationReport {
    pub checks: Vec<ConstraintCheck>,
    pub physical_assurance: PhysicalAssurance,
    pub assignment_completeness: AssignmentCompleteness,
    pub commerce_readiness: CommerceReadiness,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ParentRef {
    Space { space_id: Id },
    Container { placement_id: Id },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PlacementSubject {
    OwnedContainer { owned_id: Id, unit_ordinal: u32 },
    NewContainer { variant_id: Id, unit_ordinal: u32 },
    DirectItem { item_id: Id, unit_ordinal: u32 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Placement {
    pub id: Id,
    pub subject: PlacementSubject,
    pub parent: ParentRef,
    pub position: Vec3Mm,
    pub orientation: Orientation,
    pub support_id: Id,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemPlacement {
    pub position: Vec3Mm,
    pub orientation: Orientation,
    pub support_id: Id,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ItemLocation {
    Direct {
        placement_id: Id,
    },
    Contained {
        container_placement_id: Id,
        local_placement: ItemPlacement,
    },
    ProvisionalContainer {
        container_placement_id: Id,
        reason_code: String,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemAssignment {
    pub item_id: Id,
    pub unit_ordinal: u32,
    pub location: ItemLocation,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrdinalRange {
    pub start: u32,
    pub end_exclusive: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum UnassignedInstances {
    Known { ranges: Vec<OrdinalRange> },
    UnknownQuantity {},
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Unassigned {
    pub item_id: Id,
    pub instances: UnassignedInstances,
    pub reason_code: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum OfferSelection {
    Selected { offer_id: Id },
    Unresolved { reason_code: String },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PurchaseSelection {
    pub placement_id: Id,
    pub offer: OfferSelection,
}
/// The complete proposal crossing the independent validator boundary; a
/// caller-supplied pass flag does not exist and cannot be trusted.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CandidateLayout {
    pub placements: Vec<Placement>,
    pub assignments: Vec<ItemAssignment>,
    pub unassigned: Vec<Unassigned>,
    pub purchase_selections: Vec<PurchaseSelection>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BOMLine {
    pub id: Id,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub variant_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub owned_id: Option<Id>,
    pub placement_ids: Vec<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub offer_id: Option<Id>,
    pub physical_needed: Quantity,
    pub reused: Quantity,
    pub new_units_needed: Quantity,
    pub pack_quantity: Fact<PackQuantity>,
    pub packs_to_order: Fact<Quantity>,
    pub supplied: Fact<UnitCount>,
    pub surplus: Fact<UnitCount>,
    pub product_subtotal: Fact<MoneyKrw>,
    pub evidence_refs: Vec<FieldRef>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ActionKind {
    ClearSpace,
    SortContents,
    Acquire,
    ConfirmArrival,
    Install,
    TransferContents,
    Label,
    VerifyUnassigned,
    ResolveCondition,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionStep {
    pub id: Id,
    pub kind: ActionKind,
    pub subject_ids: Vec<Id>,
    pub prerequisite_step_ids: Vec<Id>,
    pub required_confirmations: Vec<Id>,
    pub reason_ids: Vec<Id>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CostSummary {
    pub product_subtotal: Fact<MoneyKrw>,
    pub shipping_total: Fact<MoneyKrw>,
    pub grand_total: Fact<MoneyKrw>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SearchTermination {
    ScopeComplete,
    BudgetExhausted,
    Cancelled,
    Interrupted,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchCounters {
    pub work_units: WorkCount,
    pub nodes: u32,
    pub validated_candidates: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScopeRestriction {
    pub code: String,
    pub subject_ids: Vec<Id>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchScope {
    pub profile: SearchProfile,
    pub budget: SearchBudget,
    pub group_ids: Vec<Id>,
    pub restrictions: Vec<ScopeRestriction>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RejectedCandidate {
    pub reason_code: String,
    pub subject_ids: Vec<Id>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchResult {
    pub termination: SearchTermination,
    pub scope: SearchScope,
    pub consumed: SearchCounters,
    pub alternatives: Vec<PlanSnapshot>,
    pub diagnostic_candidates: Vec<RejectedCandidate>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Interruption {
    Cancelled,
    HardCancel,
    Watchdog,
    Crash,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionObservation {
    pub request_id: Id,
    pub duration_ms: u32,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Interruption>")]
    pub interrupted_by: Option<Interruption>,
    pub consumed: SearchCounters,
}
/// The immutable engine/input context stamped into every snapshot. Engine
/// versions are copied from the engine, never accepted as caller input.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompileVersions {
    pub schema_version: u32,
    pub canonical_version: u32,
    pub input_digest: Digest,
    pub catalog_version: String,
    pub catalog_digest: Digest,
    pub rule_version: String,
    pub solver_version: String,
    pub search_profile: SearchProfile,
    pub search_budget: SearchBudget,
    pub seed: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PlanCreation {
    ReferenceSearch,
    ManualEdit,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotContent {
    pub creation: PlanCreation,
    pub versions: CompileVersions,
    pub input_facts: ProjectInput,
    pub referenced_catalog: CatalogEvidenceSubset,
    pub strategy: StrategyDecision,
    pub placements: Vec<Placement>,
    pub assignments: Vec<ItemAssignment>,
    pub unassigned: Vec<Unassigned>,
    pub purchase_selections: Vec<PurchaseSelection>,
    pub validation: ValidationReport,
    pub bom: Vec<BOMLine>,
    pub cost_summary: CostSummary,
    pub actions: Vec<ActionStep>,
    pub scope: SearchScope,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanSnapshot {
    pub plan_snapshot_id: Digest,
    pub content: SnapshotContent,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotBinding {
    pub project_id: Id,
    pub input_revision: Revision,
    pub plan_snapshot_id: Digest,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LayoutEditCommand {
    MovePlacement {
        placement_id: Id,
        position: Vec3Mm,
    },
    RotatePlacement {
        placement_id: Id,
        orientation: Orientation,
    },
    ReplaceVariant {
        placement_id: Id,
        variant_id: Id,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Id>")]
        offer_id: Option<Id>,
    },
    SelectOffer {
        variant_id: Id,
        offer_id: Id,
    },
    RestoreLayout {
        source_snapshot_id: Digest,
    },
}
/// A durable record whose claimed content digest Rust can verify.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum VerifiableRecordDto {
    Input {
        input: ProjectInput,
        input_digest: Digest,
    },
    Catalog {
        catalog: CatalogSnapshot,
    },
    Snapshot {
        snapshot: PlanSnapshot,
    },
}
