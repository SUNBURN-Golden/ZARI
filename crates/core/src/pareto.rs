//! Pareto comparison beside a PlanSnapshot.
//!
//! One input, one budget, and one seed. Hard failures leave the front even
//! when they are cheaper. Unknown money, moves, and quantities stay unknown.
//! An exhausted budget is not a global optimum. There is no single score.

use crate::facts::Fact;
use crate::input::SearchBudget;
use crate::plan::{
    CheckKind, CheckStatus, PhysicalAssurance, PlacementSubject, PlanSnapshot, SearchTermination,
    UnassignedInstances,
};
use crate::scalars::{Digest, Id};
use crate::strategy::Strategy;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const READ_MODEL_VERSION: &str = "zari-pareto-1";
const MAX_ALTERNATIVES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ParetoError {
    pub code: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParetoCompareAction {
    pub termination: SearchTermination,
    pub goal: Strategy,
    pub input_digest: Digest,
    pub budget: SearchBudget,
    pub seed: Option<String>,
    pub alternatives: Vec<PlanSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ParetoOptimality {
    BudgetLimited,
    ScopeCompared,
    Cancelled,
    Interrupted,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "state", rename_all = "camelCase", deny_unknown_fields)]
pub enum ParetoCount {
    Known { value: u32 },
    Unknown {},
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "state", rename_all = "camelCase", deny_unknown_fields)]
pub enum ParetoMoney {
    Known { amount: crate::scalars::MoneyKrw },
    NoPurchase {},
    Unknown {},
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ParetoItemQuantity {
    Known { count: u32 },
    UnknownQuantity {},
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParetoItem {
    pub item_id: Id,
    pub quantity: ParetoItemQuantity,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParetoCondition {
    pub id: Id,
    pub kind: String,
    pub status: String,
    pub reason_code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParetoDifference {
    pub purchase: bool,
    pub reuse: bool,
    pub preceding_moves: bool,
    pub unassigned: bool,
    pub unknown_quantity: bool,
    pub unknown_conditions: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParetoRow {
    pub candidate_id: Digest,
    pub purchase: ParetoMoney,
    pub reuse: ParetoCount,
    pub preceding_moves: ParetoCount,
    pub unassigned_instances: u32,
    pub unknown_quantity_items: u32,
    pub unknown_conditions: u32,
    pub items: Vec<ParetoItem>,
    pub conditions: Vec<ParetoCondition>,
    pub difference: ParetoDifference,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParetoExclusion {
    pub candidate_id: Digest,
    pub reason_code: String,
    pub purchase: ParetoMoney,
    pub conditions: Vec<ParetoCondition>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParetoReply {
    pub read_model_version: String,
    pub goal: Strategy,
    pub input_digest: Digest,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub seed: Option<String>,
    pub budget: SearchBudget,
    pub termination: SearchTermination,
    pub optimality: ParetoOptimality,
    /// Always false. A finished budget is not a global optimum.
    pub global_optimum: bool,
    pub context_match: bool,
    pub recalculation_required: bool,
    pub front: Vec<ParetoRow>,
    pub dominated: Vec<ParetoRow>,
    pub excluded: Vec<ParetoExclusion>,
}

#[derive(Clone, Debug)]
struct Observed {
    id: Digest,
    hard: bool,
    purchase: ParetoMoney,
    reuse: ParetoCount,
    preceding: ParetoCount,
    unassigned: u32,
    unknown_quantity: u32,
    unknown_conditions: u32,
    items: Vec<ParetoItem>,
    conditions: Vec<ParetoCondition>,
    fail_conditions: Vec<ParetoCondition>,
}

pub fn compare(action: &ParetoCompareAction) -> Result<ParetoReply, ParetoError> {
    if action.alternatives.len() > MAX_ALTERNATIVES {
        return Err(ParetoError {
            code: "input_limit_exceeded",
        });
    }
    let mut ids: Vec<&str> = action
        .alternatives
        .iter()
        .map(|snapshot| snapshot.plan_snapshot_id.as_str())
        .collect();
    ids.sort_unstable();
    if ids.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(ParetoError {
            code: "duplicate_candidate",
        });
    }
    let optimality = optimality(action.termination.clone());
    if action
        .alternatives
        .iter()
        .any(|snapshot| !same_context(snapshot, action))
    {
        return Ok(empty_reply(action, optimality, false));
    }
    let mut observed: Vec<Observed> = action.alternatives.iter().map(observe).collect();
    observed.sort_by_key(tie_key);
    let eligible: Vec<Observed> = observed.iter().filter(|row| !row.hard).cloned().collect();
    let mut front = Vec::new();
    let mut dominated = Vec::new();
    for row in &eligible {
        let beaten = eligible
            .iter()
            .any(|other| other.id != row.id && dominates(other, row));
        if beaten {
            dominated.push(row.clone());
        } else {
            front.push(row.clone());
        }
    }
    let leader = front.first();
    let front_rows = front
        .iter()
        .map(|row| to_row(row, difference_from(leader, row)))
        .collect();
    let dominated_rows = dominated
        .iter()
        .map(|row| to_row(row, difference_from(leader, row)))
        .collect();
    let mut excluded: Vec<ParetoExclusion> = observed
        .iter()
        .filter(|row| row.hard)
        .map(|row| ParetoExclusion {
            candidate_id: row.id.clone(),
            reason_code: "hard_constraint".into(),
            purchase: row.purchase.clone(),
            conditions: row.fail_conditions.clone(),
        })
        .collect();
    excluded.sort_by(|left, right| left.candidate_id.cmp(&right.candidate_id));
    Ok(ParetoReply {
        read_model_version: READ_MODEL_VERSION.into(),
        goal: action.goal.clone(),
        input_digest: action.input_digest.clone(),
        seed: action.seed.clone(),
        budget: action.budget.clone(),
        termination: action.termination.clone(),
        optimality,
        global_optimum: false,
        context_match: true,
        recalculation_required: false,
        front: front_rows,
        dominated: dominated_rows,
        excluded,
    })
}

fn empty_reply(
    action: &ParetoCompareAction,
    optimality: ParetoOptimality,
    context_match: bool,
) -> ParetoReply {
    ParetoReply {
        read_model_version: READ_MODEL_VERSION.into(),
        goal: action.goal.clone(),
        input_digest: action.input_digest.clone(),
        seed: action.seed.clone(),
        budget: action.budget.clone(),
        termination: action.termination.clone(),
        optimality,
        global_optimum: false,
        context_match,
        recalculation_required: !context_match,
        front: vec![],
        dominated: vec![],
        excluded: vec![],
    }
}

fn optimality(termination: SearchTermination) -> ParetoOptimality {
    match termination {
        SearchTermination::BudgetExhausted => ParetoOptimality::BudgetLimited,
        SearchTermination::ScopeComplete => ParetoOptimality::ScopeCompared,
        SearchTermination::Cancelled => ParetoOptimality::Cancelled,
        SearchTermination::Interrupted => ParetoOptimality::Interrupted,
    }
}

fn same_context(snapshot: &PlanSnapshot, action: &ParetoCompareAction) -> bool {
    let versions = &snapshot.content.versions;
    versions.input_digest == action.input_digest
        && versions.search_budget == action.budget
        && versions.seed == action.seed
        && snapshot.content.strategy.strategy == action.goal
}

fn observe(snapshot: &PlanSnapshot) -> Observed {
    let report = &snapshot.content.validation;
    let hard = report.physical_assurance == PhysicalAssurance::Rejected
        || report
            .checks
            .iter()
            .any(|check| check.blocking && check.status == CheckStatus::Fail);
    let mut conditions = Vec::new();
    let mut fail_conditions = Vec::new();
    for check in &report.checks {
        if check.status == CheckStatus::Unknown {
            conditions.push(condition(check));
        }
        if check.status == CheckStatus::Fail && check.blocking {
            fail_conditions.push(condition(check));
        }
    }
    if hard && fail_conditions.is_empty() {
        fail_conditions.push(ParetoCondition {
            id: Id::new("physical-rejected").expect("id"),
            kind: "assurance".into(),
            status: "fail".into(),
            reason_code: "physical_rejected".into(),
        });
    }
    let completeness = &report.assignment_completeness;
    Observed {
        id: snapshot.plan_snapshot_id.clone(),
        hard,
        purchase: money(&snapshot.content.cost_summary.grand_total),
        reuse: reuse(snapshot),
        preceding: preceding(snapshot),
        unassigned: completeness.unassigned_instances.get(),
        unknown_quantity: completeness.unknown_quantity_items.get(),
        unknown_conditions: u32::try_from(conditions.len()).unwrap_or(u32::MAX),
        items: items(snapshot),
        conditions,
        fail_conditions,
    }
}

fn condition(check: &crate::plan::ConstraintCheck) -> ParetoCondition {
    ParetoCondition {
        id: check.id.clone(),
        kind: check_kind(&check.kind),
        status: check_status(&check.status),
        reason_code: check.reason_code.clone(),
    }
}

fn check_kind(kind: &CheckKind) -> String {
    match kind {
        CheckKind::OuterGeometry => "outer_geometry",
        CheckKind::InnerCapacity => "inner_capacity",
        CheckKind::InstallationPath => "installation_path",
        CheckKind::OperationalAccess => "operational_access",
        CheckKind::SupportGeometry => "support_geometry",
        CheckKind::SupportLoad => "support_load",
        CheckKind::Orientation => "orientation",
        CheckKind::QuantityConservation => "quantity_conservation",
        CheckKind::Compatibility => "compatibility",
        CheckKind::Inventory => "inventory",
        CheckKind::Price => "price",
        CheckKind::Shipping => "shipping",
        CheckKind::Budget => "budget",
    }
    .into()
}

fn check_status(status: &CheckStatus) -> String {
    match status {
        CheckStatus::Pass => "pass",
        CheckStatus::Fail => "fail",
        CheckStatus::Unknown => "unknown",
        CheckStatus::NotApplicable => "not_applicable",
    }
    .into()
}

fn money(fact: &Fact<crate::scalars::MoneyKrw>) -> ParetoMoney {
    match fact {
        Fact::Known { value, .. } => ParetoMoney::Known { amount: *value },
        Fact::NotApplicable { .. } => ParetoMoney::NoPurchase {},
        Fact::Unknown { .. } => ParetoMoney::Unknown {},
    }
}

fn reuse(snapshot: &PlanSnapshot) -> ParetoCount {
    if !snapshot.content.bom.is_empty() {
        let mut total = 0u32;
        for line in &snapshot.content.bom {
            total = total.saturating_add(line.reused.get());
        }
        return ParetoCount::Known { value: total };
    }
    let owned = snapshot
        .content
        .placements
        .iter()
        .filter(|placement| matches!(placement.subject, PlacementSubject::OwnedContainer { .. }))
        .count();
    ParetoCount::Known {
        value: u32::try_from(owned).unwrap_or(u32::MAX),
    }
}

fn preceding(snapshot: &PlanSnapshot) -> ParetoCount {
    let checks: Vec<_> = snapshot
        .content
        .validation
        .checks
        .iter()
        .filter(|check| check.kind == CheckKind::OperationalAccess)
        .collect();
    if checks.is_empty() {
        return ParetoCount::Unknown {};
    }
    let mut total = 0u32;
    for check in checks {
        if check.status == CheckStatus::Unknown || check.status == CheckStatus::Fail {
            return ParetoCount::Unknown {};
        }
        let measurement = check
            .measurements
            .iter()
            .find(|measurement| measurement.field_path == "blockerCount");
        let Some(measurement) = measurement else {
            if check.status == CheckStatus::NotApplicable {
                continue;
            }
            return ParetoCount::Unknown {};
        };
        match &measurement.value_mm {
            Fact::Known { value, .. } => {
                let count = u32::try_from(value.get()).unwrap_or(u32::MAX);
                total = total.saturating_add(count);
            }
            Fact::NotApplicable { .. } if check.status == CheckStatus::NotApplicable => {}
            Fact::NotApplicable { .. } | Fact::Unknown { .. } => return ParetoCount::Unknown {},
        }
    }
    ParetoCount::Known { value: total }
}

fn items(snapshot: &PlanSnapshot) -> Vec<ParetoItem> {
    let mut rows = Vec::new();
    for entry in &snapshot.content.unassigned {
        let quantity = match &entry.instances {
            UnassignedInstances::UnknownQuantity {} => ParetoItemQuantity::UnknownQuantity {},
            UnassignedInstances::Known { ranges } => match known_span(ranges) {
                Some(count) => ParetoItemQuantity::Known { count },
                None => ParetoItemQuantity::UnknownQuantity {},
            },
        };
        rows.push(ParetoItem {
            item_id: entry.item_id.clone(),
            quantity,
        });
    }
    rows.sort_by(|left, right| left.item_id.cmp(&right.item_id));
    rows
}

fn known_span(ranges: &[crate::plan::OrdinalRange]) -> Option<u32> {
    let mut total = 0u32;
    for range in ranges {
        let span = range.end_exclusive.checked_sub(range.start)?;
        total = total.checked_add(span)?;
    }
    Some(total)
}

fn money_value(money: &ParetoMoney) -> Option<u64> {
    match money {
        ParetoMoney::Known { amount } => Some(amount.get()),
        ParetoMoney::NoPurchase {} => Some(0),
        ParetoMoney::Unknown {} => None,
    }
}

fn count_value(count: &ParetoCount) -> Option<u32> {
    match count {
        ParetoCount::Known { value } => Some(*value),
        ParetoCount::Unknown {} => None,
    }
}

fn min_pair(left: Option<u64>, right: Option<u64>) -> Option<std::cmp::Ordering> {
    Some(left?.cmp(&right?))
}

fn dominates(left: &Observed, right: &Observed) -> bool {
    let pairs = [
        min_pair(
            Some(u64::from(left.unassigned)),
            Some(u64::from(right.unassigned)),
        ),
        min_pair(
            Some(u64::from(left.unknown_quantity)),
            Some(u64::from(right.unknown_quantity)),
        ),
        min_pair(
            Some(u64::from(left.unknown_conditions)),
            Some(u64::from(right.unknown_conditions)),
        ),
        min_pair(
            count_value(&left.preceding).map(u64::from),
            count_value(&right.preceding).map(u64::from),
        ),
        min_pair(money_value(&left.purchase), money_value(&right.purchase)),
        min_pair(
            count_value(&left.reuse).map(u64::from),
            count_value(&right.reuse).map(u64::from),
        )
        .map(std::cmp::Ordering::reverse),
    ];
    if pairs.iter().any(Option::is_none) {
        return false;
    }
    let orders: Vec<std::cmp::Ordering> = pairs
        .into_iter()
        .map(|order| order.expect("pair"))
        .collect();
    orders.iter().all(|order| !order.is_gt()) && orders.iter().any(|order| order.is_lt())
}

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct TieKey {
    unassigned: u32,
    unknown_quantity: u32,
    unknown_conditions: u32,
    preceding: (u8, u32),
    purchase: (u8, u64),
    reuse: (u8, u32),
    id: String,
}

fn tie_key(row: &Observed) -> TieKey {
    TieKey {
        unassigned: row.unassigned,
        unknown_quantity: row.unknown_quantity,
        unknown_conditions: row.unknown_conditions,
        preceding: count_sort_min(&row.preceding),
        purchase: money_sort(&row.purchase),
        reuse: count_sort_max(&row.reuse),
        id: row.id.as_str().to_owned(),
    }
}

fn count_sort_min(count: &ParetoCount) -> (u8, u32) {
    match count {
        ParetoCount::Known { value } => (0, *value),
        ParetoCount::Unknown {} => (1, 0),
    }
}

fn count_sort_max(count: &ParetoCount) -> (u8, u32) {
    match count {
        ParetoCount::Known { value } => (0, u32::MAX - *value),
        ParetoCount::Unknown {} => (1, 0),
    }
}

fn money_sort(money: &ParetoMoney) -> (u8, u64) {
    match money {
        ParetoMoney::Known { amount } => (0, amount.get()),
        ParetoMoney::NoPurchase {} => (0, 0),
        ParetoMoney::Unknown {} => (1, 0),
    }
}

fn difference_from(leader: Option<&Observed>, row: &Observed) -> ParetoDifference {
    let Some(leader) = leader else {
        return blank_difference();
    };
    if leader.id == row.id {
        return blank_difference();
    }
    ParetoDifference {
        purchase: leader.purchase != row.purchase,
        reuse: leader.reuse != row.reuse,
        preceding_moves: leader.preceding != row.preceding,
        unassigned: leader.unassigned != row.unassigned,
        unknown_quantity: leader.unknown_quantity != row.unknown_quantity,
        unknown_conditions: leader.unknown_conditions != row.unknown_conditions,
    }
}

fn blank_difference() -> ParetoDifference {
    ParetoDifference {
        purchase: false,
        reuse: false,
        preceding_moves: false,
        unassigned: false,
        unknown_quantity: false,
        unknown_conditions: false,
    }
}

fn to_row(row: &Observed, difference: ParetoDifference) -> ParetoRow {
    ParetoRow {
        candidate_id: row.id.clone(),
        purchase: row.purchase.clone(),
        reuse: row.reuse.clone(),
        preceding_moves: row.preceding.clone(),
        unassigned_instances: row.unassigned,
        unknown_quantity_items: row.unknown_quantity,
        unknown_conditions: row.unknown_conditions,
        items: row.items.clone(),
        conditions: row.conditions.clone(),
        difference,
    }
}
