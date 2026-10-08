//! Versioned strategy and recipe catalogue (`zari-strategy-library-1`).
//!
//! Rule ids, zones, and fact refs come from the solver `StrategyDecision`.
//! This read model does not place objects, publish a `PlanSnapshot`, or
//! change `strategy_choice`. A wording-only copy of the same outcome is
//! dropped. Unknown quantity stays unknown.

use crate::facts::{Fact, FieldRef, MessageParams, UnknownReason};
use crate::input::{
    Item, ProjectInput, RetrievalMode, SafetyRestriction, StorageRequirement, UserConstraints,
    ZoneKind,
};
use crate::scalars::{Id, Quantity};
use crate::strategy::{StoragePrimitive, Strategy, StrategyDecision};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Catalogue version stamped on every reply. It is not a snapshot field.
pub const LIBRARY_VERSION: &str = "zari-strategy-library-1";
const RECIPE_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LibraryQuantity {
    Known { count: u32 },
    Unknown { reason: UnknownReason },
    NotApplicable { reason_code: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryStatement {
    pub code: String,
    pub fact_refs: Vec<FieldRef>,
    pub parameters: MessageParams,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryRecipe {
    pub id: Id,
    pub version: u32,
    pub strategy: Strategy,
    pub primitives: Vec<StoragePrimitive>,
    pub retrievals: Vec<RetrievalMode>,
    pub group_ids: Vec<Id>,
    pub zone_ids: Vec<Id>,
    pub access_code: String,
    pub rule_ids: Vec<String>,
    pub fact_refs: Vec<FieldRef>,
    pub selected: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryAlternative {
    pub strategy: Strategy,
    pub rule_ids: Vec<String>,
    pub fact_refs: Vec<FieldRef>,
    pub message_keys: Vec<String>,
    pub access_code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryUnassigned {
    pub item_id: Id,
    pub quantity: LibraryQuantity,
    pub reason_code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyLibraryReply {
    pub library_version: String,
    pub pinned_strategy: Strategy,
    pub strategy_changed: bool,
    pub recipes: Vec<LibraryRecipe>,
    pub alternatives: Vec<LibraryAlternative>,
    pub dropped_wording_duplicates: u32,
    pub hard_constraints: Vec<LibraryStatement>,
    pub visual_preferences: Vec<LibraryStatement>,
    pub assumptions: Vec<crate::strategy::Condition>,
    pub candidate_item_ids: Vec<Id>,
    pub unassigned: Vec<LibraryUnassigned>,
}

struct Template {
    id: &'static str,
    strategy: Strategy,
    primitives: &'static [StoragePrimitive],
    retrievals: &'static [RetrievalMode],
    access_code: &'static str,
    /// Same outcome as the canonical row, different message key. Dropped.
    wording_alias: Option<&'static str>,
}

fn templates() -> &'static [Template] {
    use RetrievalMode::{DirectFrontExtraction, PullContainerThenRetrieve};
    use StoragePrimitive::{DirectPlacement, OpenBin, Tray, VerticalFile};
    use Strategy::{
        ActiveReserveSeparation, ActivityGrouping, FrequencySeparation, MinimumPurchase,
        OneActionAccess,
    };
    const MIN_P: &[StoragePrimitive] = &[DirectPlacement, OpenBin, Tray, VerticalFile];
    const FREQ_P: &[StoragePrimitive] = &[DirectPlacement, OpenBin, Tray];
    const RESERVE_P: &[StoragePrimitive] = &[OpenBin, Tray];
    const ONE_P: &[StoragePrimitive] = &[DirectPlacement];
    const BOTH: &[RetrievalMode] = &[DirectFrontExtraction, PullContainerThenRetrieve];
    const PULL: &[RetrievalMode] = &[PullContainerThenRetrieve];
    const DIRECT: &[RetrievalMode] = &[DirectFrontExtraction];
    &[
        Template {
            id: "recipe:min-purchase:v1",
            strategy: MinimumPurchase,
            primitives: MIN_P,
            retrievals: BOTH,
            access_code: "reuse_owned_before_new",
            wording_alias: Some("reason.min_purchase.wording_only"),
        },
        Template {
            id: "recipe:frequency:v1",
            strategy: FrequencySeparation,
            primitives: FREQ_P,
            retrievals: BOTH,
            access_code: "frequency_zone_soft",
            wording_alias: None,
        },
        Template {
            id: "recipe:activity:v1",
            strategy: ActivityGrouping,
            primitives: MIN_P,
            retrievals: BOTH,
            access_code: "declared_activity_partition",
            wording_alias: None,
        },
        Template {
            id: "recipe:active-reserve:v1",
            strategy: ActiveReserveSeparation,
            primitives: RESERVE_P,
            retrievals: PULL,
            access_code: "active_front_reserve_rear",
            wording_alias: None,
        },
        Template {
            id: "recipe:one-action:v1",
            strategy: OneActionAccess,
            primitives: ONE_P,
            retrievals: DIRECT,
            access_code: "zero_other_container_moves",
            wording_alias: None,
        },
    ]
}

struct Draft {
    strategy: Strategy,
    rule_ids: Vec<String>,
    fact_refs: Vec<FieldRef>,
    message_keys: Vec<String>,
    primitives: Vec<StoragePrimitive>,
    retrievals: Vec<RetrievalMode>,
    access_code: String,
    groups: Vec<(String, String, Vec<String>)>,
    priorities: Vec<(String, u32)>,
    alias: bool,
}

fn primitive_name(primitive: &StoragePrimitive) -> &'static str {
    match primitive {
        StoragePrimitive::DirectPlacement => "directPlacement",
        StoragePrimitive::OpenBin => "openBin",
        StoragePrimitive::Tray => "tray",
        StoragePrimitive::VerticalFile => "verticalFile",
    }
}

fn retrieval_name(mode: &RetrievalMode) -> &'static str {
    match mode {
        RetrievalMode::DirectFrontExtraction => "directFrontExtraction",
        RetrievalMode::PullContainerThenRetrieve => "pullContainerThenRetrieve",
    }
}

/// Outcome identity. Message keys and the alias flag are not part of it.
fn outcome_key(draft: &Draft) -> String {
    let mut out = String::new();
    out.push_str(&draft.access_code);
    out.push('|');
    for primitive in &draft.primitives {
        out.push_str(primitive_name(primitive));
        out.push(',');
    }
    out.push('|');
    for mode in &draft.retrievals {
        out.push_str(retrieval_name(mode));
        out.push(',');
    }
    out.push('|');
    for (group, zone, items) in &draft.groups {
        out.push_str(group);
        out.push('>');
        out.push_str(zone);
        out.push('>');
        for item in items {
            out.push_str(item);
            out.push(',');
        }
        out.push(';');
    }
    out.push('|');
    for (group, ordinal) in &draft.priorities {
        out.push_str(group);
        out.push('#');
        out.push_str(&ordinal.to_string());
        out.push(';');
    }
    out
}

fn decision_for<'a>(
    decisions: &'a [StrategyDecision],
    strategy: &Strategy,
) -> Option<&'a StrategyDecision> {
    decisions
        .iter()
        .find(|decision| &decision.strategy == strategy)
}

fn draft_from(template: &Template, decision: Option<&StrategyDecision>, alias: bool) -> Draft {
    let (rule_ids, fact_refs, message_keys, groups, priorities) = match decision {
        Some(decision) => (
            decision.rule_ids.clone(),
            decision.fact_refs.clone(),
            if alias {
                vec![template.wording_alias.unwrap_or("wording_only").to_owned()]
            } else {
                decision
                    .reasons
                    .iter()
                    .map(|reason| reason.message_key.clone())
                    .collect()
            },
            decision
                .groups
                .iter()
                .map(|group| {
                    (
                        group.group_id.as_str().to_owned(),
                        group.zone_id.as_str().to_owned(),
                        group
                            .item_ids
                            .iter()
                            .map(|id| id.as_str().to_owned())
                            .collect(),
                    )
                })
                .collect(),
            decision
                .priorities
                .iter()
                .map(|priority| (priority.group_id.as_str().to_owned(), priority.ordinal))
                .collect(),
        ),
        None => (vec![], vec![], vec![], vec![], vec![]),
    };
    Draft {
        strategy: template.strategy.clone(),
        rule_ids,
        fact_refs,
        message_keys,
        primitives: template.primitives.to_vec(),
        retrievals: template.retrievals.to_vec(),
        access_code: template.access_code.to_owned(),
        groups,
        priorities,
        alias,
    }
}

fn prefer(kept: &Draft, incoming: &Draft, pinned: &Strategy) -> bool {
    if kept.alias && !incoming.alias {
        return true;
    }
    if !kept.alias && incoming.alias {
        return false;
    }
    if &kept.strategy == pinned {
        return false;
    }
    &incoming.strategy == pinned
}

fn dedup(mut rows: Vec<Draft>, pinned: &Strategy) -> (Vec<Draft>, u32) {
    let mut kept: Vec<Draft> = vec![];
    let mut index: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    let mut dropped = 0u32;
    for row in rows.drain(..) {
        let key = outcome_key(&row);
        if let Some(&slot) = index.get(&key) {
            dropped = dropped.saturating_add(1);
            if prefer(&kept[slot], &row, pinned) {
                kept[slot] = row;
            }
            continue;
        }
        index.insert(key, kept.len());
        kept.push(row);
    }
    (kept, dropped)
}

fn recipe_id(raw: &str) -> Id {
    Id::new(raw).expect("recipe ids are bounded")
}

fn ref_of(entity: &Id, field_path: &str) -> FieldRef {
    FieldRef {
        entity_id: entity.clone(),
        field_path: field_path.to_owned(),
    }
}

fn statement(code: &str, refs: Vec<FieldRef>, parameters: MessageParams) -> LibraryStatement {
    LibraryStatement {
        code: code.to_owned(),
        fact_refs: refs,
        parameters,
    }
}

fn quantity_of(fact: &Fact<Quantity>) -> LibraryQuantity {
    match fact {
        Fact::Known { value, .. } => LibraryQuantity::Known { count: value.get() },
        Fact::Unknown { reason } => LibraryQuantity::Unknown {
            reason: reason.clone(),
        },
        Fact::NotApplicable { reason_code } => LibraryQuantity::NotApplicable {
            reason_code: reason_code.clone(),
        },
    }
}

fn retrieval_supported(requirement: &StorageRequirement, template: &Template) -> bool {
    requirement
        .allowed_retrieval_modes
        .iter()
        .any(|mode| template.retrievals.contains(mode))
}

fn one_action_proved(requirement: &StorageRequirement, template: &Template) -> bool {
    requirement.allowed_retrieval_modes.iter().any(|mode| {
        *mode == RetrievalMode::DirectFrontExtraction && template.retrievals.contains(mode)
    })
}

fn partition_items(
    input: &ProjectInput,
    decision: Option<&StrategyDecision>,
    template: Option<&Template>,
) -> (Vec<Id>, Vec<LibraryUnassigned>) {
    let Some(template) = template else {
        return (
            vec![],
            input
                .items
                .iter()
                .map(|item| LibraryUnassigned {
                    item_id: item.id.clone(),
                    quantity: quantity_of(&item.quantity),
                    reason_code: "strategy_unsupported".into(),
                })
                .collect(),
        );
    };
    let mut candidates = vec![];
    let mut unassigned = vec![];
    for item in &input.items {
        let reason = item_reason(input, item, decision, template);
        match reason {
            None => candidates.push(item.id.clone()),
            Some(reason_code) => unassigned.push(LibraryUnassigned {
                item_id: item.id.clone(),
                quantity: quantity_of(&item.quantity),
                reason_code,
            }),
        }
    }
    candidates.sort();
    unassigned.sort_by(|a, b| a.item_id.cmp(&b.item_id));
    (candidates, unassigned)
}

fn item_reason(
    input: &ProjectInput,
    item: &Item,
    decision: Option<&StrategyDecision>,
    template: &Template,
) -> Option<String> {
    let group = input
        .groups
        .iter()
        .find(|group| group.item_ids.iter().any(|id| id == &item.id));
    let Some(group) = group else {
        return Some("ungrouped".into());
    };
    let resolved = decision.is_some_and(|decision| {
        decision
            .groups
            .iter()
            .any(|resolved| resolved.group_id == group.id)
    });
    if !resolved {
        return Some("no_resolvable_zone".into());
    }
    match &item.quantity {
        Fact::Unknown { .. } => return Some("quantity_unknown".into()),
        Fact::NotApplicable { .. } => return Some("quantity_not_applicable".into()),
        Fact::Known { .. } => {}
    }
    if !retrieval_supported(&item.requirement, template) {
        return Some("retrieval_unsupported".into());
    }
    if input.constraints.hard_one_action_access && !one_action_proved(&item.requirement, template) {
        return Some("one_action_unproved".into());
    }
    None
}

fn budget_statement(
    code_known: &str,
    code_unknown: &str,
    code_na: &str,
    fact: &Fact<crate::scalars::MoneyKrw>,
    entity: &Id,
    path: &str,
) -> LibraryStatement {
    let refs = vec![ref_of(entity, path)];
    match fact {
        Fact::Known { value, .. } => statement(
            code_known,
            refs,
            MessageParams::from([("amount".into(), value.get().to_string())]),
        ),
        Fact::Unknown { reason } => statement(
            code_unknown,
            refs,
            MessageParams::from([(
                "reason".into(),
                serde_json::to_value(reason)
                    .ok()
                    .and_then(|value| value.as_str().map(str::to_owned))
                    .unwrap_or_else(|| "unknown".into()),
            )]),
        ),
        Fact::NotApplicable { reason_code } => statement(
            code_na,
            refs,
            MessageParams::from([("reasonCode".into(), reason_code.clone())]),
        ),
    }
}

fn hard_and_visual(
    input: &ProjectInput,
    decision: Option<&StrategyDecision>,
) -> (Vec<LibraryStatement>, Vec<LibraryStatement>) {
    let space = &input.space.id;
    let mut hard = vec![];
    let mut visual = vec![];
    let constraints: &UserConstraints = &input.constraints;
    if !constraints.purchase_allowed {
        hard.push(statement(
            "purchase_prohibited",
            vec![ref_of(space, "constraints.purchaseAllowed")],
            MessageParams::new(),
        ));
    }
    if constraints.hard_one_action_access {
        hard.push(statement(
            "hard_one_action",
            vec![ref_of(space, "constraints.hardOneActionAccess")],
            MessageParams::new(),
        ));
    }
    for locked in &constraints.locked_zones {
        let refs = vec![ref_of(&locked.zone.id, "zone.kind")];
        let parameters = MessageParams::from([
            ("groupId".into(), locked.group_id.as_str().into()),
            ("zoneId".into(), locked.zone.id.as_str().into()),
        ]);
        if matches!(locked.zone.kind, ZoneKind::HardLocked) {
            hard.push(statement("locked_zone", refs, parameters));
        } else {
            visual.push(statement("zone_soft_preference", refs, parameters));
        }
    }
    for restriction in &constraints.safety_restrictions {
        let name = match restriction {
            SafetyRestriction::HazardousMaterials => "hazardousMaterials",
            SafetyRestriction::HighLoad => "highLoad",
            SafetyRestriction::ChildSafety => "childSafety",
        };
        hard.push(statement(
            "safety_restriction_unmodeled",
            vec![ref_of(space, "constraints.safetyRestrictions")],
            MessageParams::from([("restriction".into(), name.into())]),
        ));
    }
    for item in &input.items {
        if item.requirement.must_stay_together {
            hard.push(statement(
                "must_stay_together",
                vec![ref_of(&item.id, "requirement.mustStayTogether")],
                MessageParams::from([("itemId".into(), item.id.as_str().into())]),
            ));
        }
    }
    hard.push(budget_statement(
        "hard_budget_known",
        "hard_budget_unknown",
        "hard_budget_not_applicable",
        &constraints.hard_budget,
        space,
        "constraints.hardBudget",
    ));
    visual.push(budget_statement(
        "soft_budget_known",
        "soft_budget_unknown",
        "soft_budget_not_applicable",
        &constraints.soft_budget,
        space,
        "constraints.softBudget",
    ));
    if let Some(material) = &input.preferences.material {
        visual.push(statement(
            "material",
            vec![ref_of(space, "preferences.material")],
            MessageParams::from([("material".into(), material.clone())]),
        ));
    }
    if let Some(color) = &input.preferences.color {
        visual.push(statement(
            "color",
            vec![ref_of(space, "preferences.color")],
            MessageParams::from([("color".into(), color.clone())]),
        ));
    }
    for (index, note) in input.preferences.visual_notes.iter().enumerate() {
        if note.is_empty() {
            continue;
        }
        visual.push(statement(
            "visual_note",
            vec![ref_of(space, "preferences.visualNotes")],
            MessageParams::from([
                ("index".into(), index.to_string()),
                ("note".into(), note.clone()),
            ]),
        ));
    }
    for (index, strategy) in input.preferences.objective_ranking.iter().enumerate() {
        let name = serde_json::to_value(strategy)
            .ok()
            .and_then(|value| value.as_str().map(str::to_owned))
            .unwrap_or_else(|| "unknown".into());
        visual.push(statement(
            "objective_rank",
            vec![ref_of(space, "preferences.objectiveRanking")],
            MessageParams::from([
                ("index".into(), index.to_string()),
                ("strategy".into(), name),
            ]),
        ));
    }
    if let Some(decision) = decision {
        for zone in &decision.zones {
            if matches!(zone.kind, ZoneKind::SoftPreference) {
                visual.push(statement(
                    "zone_soft_preference",
                    vec![ref_of(&zone.id, "zone.kind")],
                    MessageParams::from([("zoneId".into(), zone.id.as_str().into())]),
                ));
            }
        }
    }
    (hard, visual)
}

fn recipes_from(decisions: &[StrategyDecision], pinned: &Strategy) -> Vec<LibraryRecipe> {
    templates()
        .iter()
        .map(|template| {
            let decision = decision_for(decisions, &template.strategy);
            let (group_ids, zone_ids, rule_ids, fact_refs) = match decision {
                Some(decision) => {
                    let mut zone_ids = vec![];
                    for group in &decision.groups {
                        if !zone_ids.contains(&group.zone_id) {
                            zone_ids.push(group.zone_id.clone());
                        }
                    }
                    (
                        decision
                            .groups
                            .iter()
                            .map(|group| group.group_id.clone())
                            .collect(),
                        zone_ids,
                        decision.rule_ids.clone(),
                        decision.fact_refs.clone(),
                    )
                }
                None => (vec![], vec![], vec![], vec![]),
            };
            LibraryRecipe {
                id: recipe_id(template.id),
                version: RECIPE_VERSION,
                strategy: template.strategy.clone(),
                primitives: template.primitives.to_vec(),
                retrievals: template.retrievals.to_vec(),
                group_ids,
                zone_ids,
                access_code: template.access_code.to_owned(),
                rule_ids,
                fact_refs,
                selected: &template.strategy == pinned,
            }
        })
        .collect()
}

/// Evaluate the built-in catalogue against solver decisions.
///
/// `input.strategy_choice` is copied into the reply and is not replaced when
/// another row would rank higher. `strategy_changed` is always false.
pub fn evaluate(input: &ProjectInput, decisions: &[StrategyDecision]) -> StrategyLibraryReply {
    let pinned = input.strategy_choice.clone();
    let pinned_decision = decision_for(decisions, &pinned);
    let pinned_template = templates()
        .iter()
        .find(|template| template.strategy == pinned);
    let mut rows = vec![];
    for template in templates() {
        let decision = decision_for(decisions, &template.strategy);
        rows.push(draft_from(template, decision, false));
        if template.wording_alias.is_some() {
            rows.push(draft_from(template, decision, true));
        }
    }
    let (kept, dropped) = dedup(rows, &pinned);
    let alternatives = kept
        .into_iter()
        .filter(|row| !row.alias)
        .map(|row| LibraryAlternative {
            strategy: row.strategy,
            rule_ids: row.rule_ids,
            fact_refs: row.fact_refs,
            message_keys: row.message_keys,
            access_code: row.access_code,
        })
        .collect();
    let (candidate_item_ids, unassigned) = partition_items(input, pinned_decision, pinned_template);
    let (hard_constraints, visual_preferences) = hard_and_visual(input, pinned_decision);
    StrategyLibraryReply {
        library_version: LIBRARY_VERSION.to_owned(),
        pinned_strategy: pinned,
        strategy_changed: false,
        recipes: recipes_from(decisions, &input.strategy_choice),
        alternatives,
        dropped_wording_duplicates: dropped,
        hard_constraints,
        visual_preferences,
        assumptions: pinned_decision
            .map(|decision| decision.assumptions.clone())
            .unwrap_or_default(),
        candidate_item_ids,
        unassigned,
    }
}
