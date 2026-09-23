//! Strategy, recipe and inspectable intermediate representation
//! (DOMAIN_MODEL §5). Data structures only; no search is implemented here.

use crate::facts::*;
use crate::input::{HandlingClearance, RetrievalMode, Zone};
use crate::scalars::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Strategy {
    MinimumPurchase,
    FrequencySeparation,
    ActivityGrouping,
    ActiveReserveSeparation,
    OneActionAccess,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum StoragePrimitive {
    DirectPlacement,
    OpenBin,
    Tray,
    VerticalFile,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedGroup {
    pub group_id: Id,
    pub zone_id: Id,
    pub item_ids: Vec<Id>,
}
/// Ordered group ranking; list position is semantic and never re-sorted.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupPriority {
    pub group_id: Id,
    pub ordinal: u32,
}
/// A reason the UI can translate: rule id, field references and message
/// parameters; never a free-text claim.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reason {
    pub id: Id,
    pub rule_id: String,
    pub fact_refs: Vec<FieldRef>,
    pub message_key: String,
    pub parameters: MessageParams,
}
/// An unresolved assumption or scope restriction attached to a decision.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Condition {
    pub id: Id,
    pub code: String,
    pub fact_refs: Vec<FieldRef>,
    pub message_key: String,
    pub parameters: MessageParams,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyDecision {
    pub strategy: Strategy,
    pub rule_ids: Vec<String>,
    pub fact_refs: Vec<FieldRef>,
    pub groups: Vec<ResolvedGroup>,
    pub zones: Vec<Zone>,
    pub priorities: Vec<GroupPriority>,
    pub reasons: Vec<Reason>,
    pub assumptions: Vec<Condition>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ConstraintOperator {
    Eq,
    Lte,
    Gte,
    In,
}
/// A typed catalog predicate on a named field; not an evaluation string.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogConstraint {
    pub id: Id,
    pub field_path: String,
    pub operator: ConstraintOperator,
    pub value: String,
}
/// A placement-side rule binding produced by a recipe.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlacementConstraint {
    pub id: Id,
    pub code: String,
    pub parameters: MessageParams,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Recipe {
    pub id: Id,
    pub strategy: Strategy,
    pub group_id: Id,
    pub zone_id: Id,
    pub primitive: StoragePrimitive,
    pub catalog_constraints: Vec<CatalogConstraint>,
    pub placement_constraints: Vec<PlacementConstraint>,
    pub retrieval: RetrievalMode,
    pub handling: HandlingClearance,
    pub reason_ids: Vec<Id>,
}
