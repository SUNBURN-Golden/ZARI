//! Use feedback and the explainable next-arrangement draft.
//!
//! A person records, in an append-only log, that an item is hard to reach,
//! that its real use frequency changed, or that its place is hard to keep
//! tidy. The log is not part of `ProjectInput` or `PlanSnapshot`. The
//! proposal reads the adopted plan, the log, and the location log, tries a
//! bounded set of position exchanges between top-level placements, and
//! publishes a new snapshot only when the whole exchanged layout passes the
//! same independent validator as every other plan and is not weaker than
//! the adopted plan on any check. The command never adopts a plan, never
//! discards an item, and never buys anything. Feedback changes no input
//! fact. Every outcome is explained by the rule that produced it.

use std::collections::{BTreeMap, BTreeSet};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use crate::canonical::{self, CatalogContent};
use crate::facts::{MAX_LABEL_CHARS, Vec3Mm};
use crate::finalize::evaluate_candidate;
use crate::input::{Frequency, ProjectInput};
use crate::location_search::{LocationLog, ObservationKind};
use crate::plan::{
    CandidateLayout, CandidateProposal, CheckStatus, CompileVersions, ItemLocation, ParentRef,
    PhysicalAssurance, Placement, PlanCreation, PlanSnapshot, SearchScope, ValidationReport,
};
use crate::scalars::{Digest, Id, PositionMm};

pub const READ_MODEL_VERSION: &str = "zari-feedback-1";
pub const RULE_SET_VERSION: &str = "zari-feedback-rules-1";
pub const ACCESS_RULE_ID: &str = "feedback:access:v1";
pub const FREQUENCY_RULE_ID: &str = "feedback:frequency:v1";
pub const MAINTENANCE_RULE_ID: &str = "feedback:maintenance:v1";

const MAX_ENTRIES: usize = 128;
const MAX_LOCATION_OBSERVATIONS: usize = 256;
const MAX_ITEMS: usize = 128;
const MAX_FOCUS: usize = 8;
const MAX_BLOCKERS: usize = 4;
const MAX_CHECK_CHANGES: usize = 64;
const MAX_EVALUATIONS: u32 = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum FeedbackKind {
    /// The user says the item is hard to reach where the adopted plan put it.
    AccessDifficulty,
    /// The user says the item is used more or less often than recorded.
    FrequencyChange,
    /// The user says the place is hard to keep tidy.
    MaintenanceDifficulty,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeedbackEntry {
    pub id: Id,
    pub item_id: Id,
    pub kind: FeedbackKind,
    /// Required for `frequencyChange`; forbidden otherwise.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Frequency>")]
    pub frequency: Option<Frequency>,
    /// A short note in the user's words. It explains nothing to a rule.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub note: Option<String>,
    /// The adopted plan the entry was recorded against. Rust stamps it; the
    /// wire value is never trusted.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub plan_snapshot_id: Option<Digest>,
}

/// Append-only per-project feedback record. Not a PlanSnapshot. A
/// withdrawal is a separate id list; no entry is edited or removed.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeedbackLog {
    pub entries: Vec<FeedbackEntry>,
    pub withdrawn_ids: Vec<Id>,
}

impl FeedbackLog {
    pub fn empty() -> Self {
        Self {
            entries: vec![],
            withdrawn_ids: vec![],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum FeedbackAction {
    Record { entry: FeedbackEntry },
    Withdraw { feedback_id: Id },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeedbackLogReply {
    pub log: FeedbackLog,
    pub changed: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeedbackFailure {
    pub code: &'static str,
}

fn fail(code: &'static str) -> FeedbackFailure {
    FeedbackFailure { code }
}

fn nfc_note(text: &str) -> Result<String, FeedbackFailure> {
    let normalized: String = text.trim().nfc().collect();
    if normalized.is_empty() || normalized.chars().count() > MAX_LABEL_CHARS {
        return Err(fail("invalid_label"));
    }
    Ok(normalized)
}

fn check_entry(entry: &FeedbackEntry) -> Result<(), FeedbackFailure> {
    match (entry.kind, &entry.frequency) {
        (FeedbackKind::FrequencyChange, None) => return Err(fail("frequency_required")),
        (FeedbackKind::AccessDifficulty | FeedbackKind::MaintenanceDifficulty, Some(_)) => {
            return Err(fail("frequency_forbidden"));
        }
        _ => {}
    }
    if let Some(note) = &entry.note
        && &nfc_note(note)? != note
    {
        return Err(fail("invalid_label"));
    }
    if entry.plan_snapshot_id.is_none() {
        return Err(fail("needs_plan"));
    }
    Ok(())
}

fn check_log(log: &FeedbackLog) -> Result<(), FeedbackFailure> {
    if log.entries.len() > MAX_ENTRIES || log.withdrawn_ids.len() > MAX_ENTRIES {
        return Err(fail("input_limit_exceeded"));
    }
    let mut ids = BTreeSet::new();
    for entry in &log.entries {
        if !ids.insert(entry.id.as_str()) {
            return Err(fail("duplicate_feedback"));
        }
        check_entry(entry)?;
    }
    let mut withdrawn = BTreeSet::new();
    for id in &log.withdrawn_ids {
        if !ids.contains(id.as_str()) {
            return Err(fail("subject_missing"));
        }
        if !withdrawn.insert(id.as_str()) {
            return Err(fail("already_withdrawn"));
        }
    }
    Ok(())
}

fn check_input(input: &ProjectInput) -> Result<(), FeedbackFailure> {
    if input.items.len() > MAX_ITEMS {
        return Err(fail("input_limit_exceeded"));
    }
    let mut ids = BTreeSet::new();
    for item in &input.items {
        if !ids.insert(item.id.as_str()) {
            return Err(fail("invalid_input"));
        }
    }
    Ok(())
}

fn is_withdrawn(log: &FeedbackLog, id: &Id) -> bool {
    log.withdrawn_ids.iter().any(|withdrawn| withdrawn == id)
}

fn input_frequency(input: &ProjectInput, item_id: &Id) -> Option<Frequency> {
    input
        .items
        .iter()
        .find(|item| &item.id == item_id)
        .and_then(|item| item.frequency.value().cloned())
}

/// What the person says the item's frequency now is: the latest live
/// `frequencyChange`, else the input fact. `None` is unknown, never a
/// default.
pub fn effective_frequency(
    input: &ProjectInput,
    log: &FeedbackLog,
    item_id: &Id,
) -> Option<Frequency> {
    log.entries
        .iter()
        .rfind(|entry| {
            entry.kind == FeedbackKind::FrequencyChange
                && &entry.item_id == item_id
                && !is_withdrawn(log, &entry.id)
        })
        .and_then(|entry| entry.frequency.clone())
        .or_else(|| input_frequency(input, item_id))
}

fn referenced_placement(location: &ItemLocation) -> &Id {
    match location {
        ItemLocation::Direct { placement_id }
        | ItemLocation::Contained {
            container_placement_id: placement_id,
            ..
        }
        | ItemLocation::ProvisionalContainer {
            container_placement_id: placement_id,
            ..
        } => placement_id,
    }
}

pub fn apply_feedback_log(
    log: &FeedbackLog,
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    action: &FeedbackAction,
) -> Result<FeedbackLogReply, FeedbackFailure> {
    check_log(log)?;
    check_input(input)?;
    match action {
        FeedbackAction::Record { entry } => record(log, input, snapshot, entry),
        FeedbackAction::Withdraw { feedback_id } => withdraw(log, feedback_id),
    }
}

fn record(
    log: &FeedbackLog,
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    entry: &FeedbackEntry,
) -> Result<FeedbackLogReply, FeedbackFailure> {
    if log.entries.len() >= MAX_ENTRIES {
        return Err(fail("input_limit_exceeded"));
    }
    if log.entries.iter().any(|existing| existing.id == entry.id) {
        return Err(fail("duplicate_feedback"));
    }
    let snapshot = snapshot.ok_or(fail("needs_plan"))?;
    if canonical::snapshot_digest(&snapshot.content) != snapshot.plan_snapshot_id {
        return Err(fail("integrity_failed"));
    }
    if !input.items.iter().any(|item| item.id == entry.item_id) {
        return Err(fail("subject_missing"));
    }
    if !snapshot
        .content
        .assignments
        .iter()
        .any(|assignment| assignment.item_id == entry.item_id)
    {
        return Err(fail("item_unplaced"));
    }
    let mut stored = entry.clone();
    stored.plan_snapshot_id = Some(snapshot.plan_snapshot_id.clone());
    stored.note = match &entry.note {
        Some(text) => Some(nfc_note(text)?),
        None => None,
    };
    match entry.kind {
        FeedbackKind::FrequencyChange => {
            let wanted = entry.frequency.clone().ok_or(fail("frequency_required"))?;
            if effective_frequency(input, log, &entry.item_id).as_ref() == Some(&wanted) {
                return Err(fail("frequency_unchanged"));
            }
        }
        FeedbackKind::AccessDifficulty | FeedbackKind::MaintenanceDifficulty => {
            if entry.frequency.is_some() {
                return Err(fail("frequency_forbidden"));
            }
            let repeated = log.entries.iter().any(|existing| {
                existing.kind == entry.kind
                    && existing.item_id == entry.item_id
                    && existing.plan_snapshot_id.as_ref() == Some(&snapshot.plan_snapshot_id)
                    && !is_withdrawn(log, &existing.id)
            });
            if repeated {
                return Err(fail("duplicate_feedback"));
            }
        }
    }
    check_entry(&stored)?;
    let mut next = log.clone();
    next.entries.push(stored);
    Ok(FeedbackLogReply {
        log: next,
        changed: true,
    })
}

fn withdraw(log: &FeedbackLog, feedback_id: &Id) -> Result<FeedbackLogReply, FeedbackFailure> {
    if !log.entries.iter().any(|entry| &entry.id == feedback_id) {
        return Err(fail("subject_missing"));
    }
    if is_withdrawn(log, feedback_id) {
        return Err(fail("already_withdrawn"));
    }
    let mut next = log.clone();
    next.withdrawn_ids.push(feedback_id.clone());
    Ok(FeedbackLogReply {
        log: next,
        changed: true,
    })
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

/// How many candidate layouts one proposal may send through the validator.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposalBudget {
    pub max_evaluations: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SwapKind {
    /// Two placements trade only their distance from the opening.
    DepthSwap,
    /// Two placements trade their whole floor position.
    SlotSwap,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CauseOutcome {
    /// A validated exchange was applied for this entry.
    Applied,
    /// No exchange improves the entry's rule without hurting the other.
    NoBetterSlot,
    /// Exchanges existed but none passed the validator or kept every check.
    Blocked,
    /// The rule cannot weigh this entry; `reasonCode` says what is missing.
    NotApplicable,
    /// The user withdrew the entry.
    Withdrawn,
    /// The entry was recorded against another plan.
    Stale,
    /// The evaluation budget ran out before this entry was settled.
    BudgetExhausted,
}

/// The latest location claim the user recorded for the item. Context only.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObservedClaim {
    pub kind: ObservationKind,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub location: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeedbackCause {
    pub feedback_id: Id,
    pub kind: FeedbackKind,
    pub item_id: Id,
    pub rule_id: String,
    pub outcome: CauseOutcome,
    pub reason_code: String,
    /// The input fact. `null` is unknown.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Frequency>")]
    pub frequency_input: Option<Frequency>,
    /// What the rules used: the latest live frequency feedback, else the
    /// input fact. `null` is unknown.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Frequency>")]
    pub frequency_effective: Option<Frequency>,
    pub focus_placement_ids: Vec<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub partner_placement_id: Option<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<SwapKind>")]
    pub swap: Option<SwapKind>,
    /// The rule's measure for the focus placement's sibling set before and
    /// after the exchange. Both are `null` when the rule did not run.
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub measure_before: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub measure_after: Option<u32>,
    /// Sibling placements whose frequency is unknown. They were not compared.
    pub unknown_siblings: u32,
    pub blockers: Vec<String>,
    pub evaluations: u32,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<ObservedClaim>")]
    pub observed: Option<ObservedClaim>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposedMove {
    pub placement_id: Id,
    pub item_ids: Vec<Id>,
    pub from: Vec3Mm,
    pub to: Vec3Mm,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckChange {
    pub check_id: Id,
    pub before: CheckStatus,
    pub after: CheckStatus,
}

/// What the draft left exactly as the adopted plan had it. Rust compares
/// the two snapshots; none of these is a claim.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preserved {
    pub assignments: bool,
    pub unassigned: bool,
    pub purchase_selections: bool,
    pub bom: bool,
    pub cost_summary: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reproduction {
    pub read_model_version: String,
    pub rule_set_version: String,
    pub input_digest: Digest,
    pub catalog_digest: Digest,
    pub base_snapshot_id: Digest,
    pub feedback_digest: Digest,
    pub location_digest: Digest,
    pub budget: ProposalBudget,
    /// One digest over every field above. Equal digests mean the same
    /// request; the same request yields the same draft.
    pub request_digest: Digest,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub draft_snapshot_id: Option<Digest>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ProposalOutcome {
    Published { snapshot: Box<PlanSnapshot> },
    NoChange {},
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposalReply {
    pub read_model_version: String,
    pub rule_set_version: String,
    pub base_snapshot_id: Digest,
    pub outcome: ProposalOutcome,
    pub causes: Vec<FeedbackCause>,
    pub moves: Vec<ProposedMove>,
    pub check_changes: Vec<CheckChange>,
    pub preserved: Preserved,
    /// Always false. The draft's checks are a fresh Rust evaluation.
    pub reused_pass: bool,
    /// Always false. Feedback never decides that an item is discarded.
    pub auto_discard: bool,
    /// Always false. Feedback never decides that something is bought.
    pub auto_purchase: bool,
    pub evaluations_used: u32,
    pub budget_exhausted: bool,
    pub reproduction: Reproduction,
}

pub struct ProposeAction<'a> {
    pub input: &'a ProjectInput,
    pub catalog: &'a CatalogContent,
    pub base: &'a PlanSnapshot,
    pub log: &'a FeedbackLog,
    pub locations: &'a LocationLog,
    pub budget: &'a ProposalBudget,
}

type Pos = BTreeMap<Id, (i64, i64)>;

/// One set of placements that may trade positions. Everything but the
/// positions is fixed for the whole proposal, so a measure is a pure function
/// of a position slice.
struct Sibling {
    ids: Vec<Id>,
    /// Frequency rank per member; `None` is unknown and never compared.
    ranks: Vec<Option<u8>>,
    /// Member indexes of each input group that has two or more members here.
    groups: Vec<Vec<usize>>,
}

struct Ctx<'a> {
    action: &'a ProposeAction<'a>,
    versions: CompileVersions,
    scope: SearchScope,
    base_report: ValidationReport,
    tops_of_item: BTreeMap<Id, Vec<Id>>,
    items_of_top: BTreeMap<Id, Vec<Id>>,
    siblings: Vec<Sibling>,
    sibling_of: BTreeMap<Id, usize>,
    ranks: BTreeMap<Id, Option<u8>>,
    pos: Pos,
    last_snapshot: Option<PlanSnapshot>,
    evaluations_used: u32,
    budget_exhausted: bool,
}

fn frequency_rank(frequency: &Frequency) -> u8 {
    match frequency {
        Frequency::Daily => 0,
        Frequency::Weekly => 1,
        Frequency::Monthly => 2,
        Frequency::Rare => 3,
    }
}

fn rule_of(kind: FeedbackKind) -> &'static str {
    match kind {
        FeedbackKind::AccessDifficulty => ACCESS_RULE_ID,
        FeedbackKind::FrequencyChange => FREQUENCY_RULE_ID,
        FeedbackKind::MaintenanceDifficulty => MAINTENANCE_RULE_ID,
    }
}

fn status_rank(status: &CheckStatus) -> u8 {
    match status {
        CheckStatus::Pass | CheckStatus::NotApplicable => 0,
        CheckStatus::Unknown => 1,
        CheckStatus::Fail => 2,
    }
}

fn assurance_rank(assurance: &PhysicalAssurance) -> u8 {
    match assurance {
        PhysicalAssurance::ConfirmedWithinScope => 0,
        PhysicalAssurance::Conditional => 1,
        PhysicalAssurance::Rejected => 2,
    }
}

/// `None` when the candidate keeps every check at least as good as the
/// adopted plan's fresh evaluation; otherwise the reason it is weaker.
fn weakened(base: &ValidationReport, candidate: &ValidationReport) -> bool {
    if assurance_rank(&candidate.physical_assurance) > assurance_rank(&base.physical_assurance) {
        return true;
    }
    let before: BTreeMap<&str, u8> = base
        .checks
        .iter()
        .map(|check| (check.id.as_str(), status_rank(&check.status)))
        .collect();
    candidate.checks.iter().any(|check| {
        let now = status_rank(&check.status);
        match before.get(check.id.as_str()) {
            Some(was) => now > *was,
            None => now > 0,
        }
    })
}

fn top_level_of(placements: &BTreeMap<&Id, &Placement>, start: &Id) -> Option<Id> {
    let mut current = start;
    for _ in 0..=placements.len() {
        let placement = placements.get(current)?;
        match &placement.parent {
            ParentRef::Space { .. } => return Some(placement.id.clone()),
            ParentRef::Container { placement_id } => current = placement_id,
        }
    }
    None
}

fn coordinates(placement: &Placement) -> (i64, i64) {
    (
        i64::from(placement.position.x.get()),
        i64::from(placement.position.y.get()),
    )
}

fn check_budget(budget: &ProposalBudget) -> Result<(), FeedbackFailure> {
    if budget.max_evaluations == 0 || budget.max_evaluations > MAX_EVALUATIONS {
        return Err(fail("invalid_input"));
    }
    Ok(())
}

fn latest_claim(locations: &LocationLog, item_id: &Id) -> Option<ObservedClaim> {
    locations
        .observations
        .iter()
        .rfind(|observation| {
            &observation.item_id == item_id && observation.kind != ObservationKind::Alias
        })
        .map(|observation| ObservedClaim {
            kind: observation.kind,
            location: observation.location.clone(),
        })
}

pub fn propose(action: &ProposeAction<'_>) -> Result<ProposalReply, FeedbackFailure> {
    check_log(action.log)?;
    check_input(action.input)?;
    check_budget(action.budget)?;
    if action.locations.observations.len() > MAX_LOCATION_OBSERVATIONS {
        return Err(fail("input_limit_exceeded"));
    }
    let base = action.base;
    if canonical::snapshot_digest(&base.content) != base.plan_snapshot_id {
        return Err(fail("integrity_failed"));
    }
    let input_digest = canonical::input_digest(action.input);
    let catalog_digest = canonical::catalog_digest(action.catalog);
    if base.content.versions.input_digest != input_digest
        || base.content.versions.catalog_digest != catalog_digest
    {
        return Err(fail("base_not_in_scope"));
    }
    let mut ctx = Ctx::new(action, input_digest.clone(), catalog_digest.clone())?;
    let mut causes = Vec::with_capacity(action.log.entries.len());
    for entry in &action.log.entries {
        causes.push(ctx.settle(entry));
    }
    Ok(ctx.reply(causes, input_digest, catalog_digest))
}

impl<'a> Ctx<'a> {
    fn new(
        action: &'a ProposeAction<'a>,
        input_digest: Digest,
        catalog_digest: Digest,
    ) -> Result<Self, FeedbackFailure> {
        let base = action.base;
        let input = action.input;
        let versions = CompileVersions {
            schema_version: canonical::SCHEMA_VERSION,
            canonical_version: canonical::CANONICAL_VERSION,
            input_digest,
            catalog_version: action.catalog.catalog_version.clone(),
            catalog_digest,
            rule_version: canonical::RULE_VERSION.into(),
            solver_version: canonical::solver_version_for(&input.search.profile).into(),
            search_profile: input.search.profile.clone(),
            search_budget: input.search.budget.clone(),
            seed: input.search.seed.clone(),
        };
        let scope = SearchScope {
            profile: input.search.profile.clone(),
            budget: input.search.budget.clone(),
            group_ids: input.groups.iter().map(|group| group.id.clone()).collect(),
            restrictions: vec![],
        };
        let by_id: BTreeMap<&Id, &Placement> = base
            .content
            .placements
            .iter()
            .map(|placement| (&placement.id, placement))
            .collect();
        let mut tops_of_item: BTreeMap<Id, BTreeSet<Id>> = BTreeMap::new();
        let mut items_of_top: BTreeMap<Id, BTreeSet<Id>> = BTreeMap::new();
        for assignment in &base.content.assignments {
            let Some(top) = top_level_of(&by_id, referenced_placement(&assignment.location)) else {
                continue;
            };
            tops_of_item
                .entry(assignment.item_id.clone())
                .or_default()
                .insert(top.clone());
            items_of_top
                .entry(top)
                .or_default()
                .insert(assignment.item_id.clone());
        }
        let mut keyed: BTreeMap<(String, String, i32), Vec<Id>> = BTreeMap::new();
        for placement in &base.content.placements {
            if let ParentRef::Space { space_id } = &placement.parent {
                keyed
                    .entry((
                        space_id.as_str().to_owned(),
                        placement.support_id.as_str().to_owned(),
                        placement.position.z.get(),
                    ))
                    .or_default()
                    .push(placement.id.clone());
            }
        }
        let mut member_sets: Vec<Vec<Id>> = Vec::new();
        let mut sibling_of = BTreeMap::new();
        for (_, mut members) in keyed {
            members.sort_by(|left, right| left.as_str().cmp(right.as_str()));
            for member in &members {
                sibling_of.insert(member.clone(), member_sets.len());
            }
            member_sets.push(members);
        }
        let mut ranks: BTreeMap<Id, Option<u8>> = BTreeMap::new();
        for placement in &base.content.placements {
            if !matches!(placement.parent, ParentRef::Space { .. }) {
                continue;
            }
            let rank = items_of_top.get(&placement.id).and_then(|items| {
                let mut best: Option<u8> = None;
                for item_id in items {
                    let rank = effective_frequency(input, action.log, item_id)
                        .as_ref()
                        .map(frequency_rank)?;
                    best = Some(best.map_or(rank, |current| current.min(rank)));
                }
                best
            });
            ranks.insert(placement.id.clone(), rank);
        }
        let group_tops: Vec<BTreeSet<Id>> = input
            .groups
            .iter()
            .map(|group| {
                group
                    .item_ids
                    .iter()
                    .filter_map(|item_id| tops_of_item.get(item_id))
                    .flatten()
                    .cloned()
                    .collect::<BTreeSet<Id>>()
            })
            .collect();
        let siblings: Vec<Sibling> = member_sets
            .into_iter()
            .map(|ids| {
                let member_ranks = ids
                    .iter()
                    .map(|id| ranks.get(id).copied().flatten())
                    .collect();
                let groups = group_tops
                    .iter()
                    .map(|set| {
                        ids.iter()
                            .enumerate()
                            .filter(|(_, id)| set.contains(*id))
                            .map(|(index, _)| index)
                            .collect::<Vec<usize>>()
                    })
                    .filter(|members| members.len() > 1)
                    .collect();
                Sibling {
                    ids,
                    ranks: member_ranks,
                    groups,
                }
            })
            .collect();
        let pos = base
            .content
            .placements
            .iter()
            .map(|placement| (placement.id.clone(), coordinates(placement)))
            .collect();
        let baseline = evaluate_candidate(
            input,
            action.catalog,
            &CandidateProposal {
                layout: layout_of(base, None),
                strategy: base.content.strategy.clone(),
                creation: PlanCreation::ManualEdit,
            },
            versions.clone(),
            scope.clone(),
        );
        let base_report = match (&baseline.snapshot, baseline.report) {
            (Some(_), Some(report)) => report,
            _ => return Err(fail("base_invalid")),
        };
        Ok(Self {
            action,
            versions,
            scope,
            base_report,
            tops_of_item: tops_of_item
                .into_iter()
                .map(|(item, tops)| (item, tops.into_iter().collect()))
                .collect(),
            items_of_top: items_of_top
                .into_iter()
                .map(|(top, items)| (top, items.into_iter().collect()))
                .collect(),
            siblings,
            sibling_of,
            ranks,
            pos,
            last_snapshot: None,
            evaluations_used: 0,
            budget_exhausted: false,
        })
    }

    fn blank_cause(&self, entry: &FeedbackEntry) -> FeedbackCause {
        FeedbackCause {
            feedback_id: entry.id.clone(),
            kind: entry.kind,
            item_id: entry.item_id.clone(),
            rule_id: rule_of(entry.kind).into(),
            outcome: CauseOutcome::NotApplicable,
            reason_code: String::new(),
            frequency_input: input_frequency(self.action.input, &entry.item_id),
            frequency_effective: effective_frequency(
                self.action.input,
                self.action.log,
                &entry.item_id,
            ),
            focus_placement_ids: vec![],
            partner_placement_id: None,
            swap: None,
            measure_before: None,
            measure_after: None,
            unknown_siblings: 0,
            blockers: vec![],
            evaluations: 0,
            observed: latest_claim(self.action.locations, &entry.item_id),
        }
    }

    fn settle(&mut self, entry: &FeedbackEntry) -> FeedbackCause {
        let mut cause = self.blank_cause(entry);
        if is_withdrawn(self.action.log, &entry.id) {
            cause.outcome = CauseOutcome::Withdrawn;
            cause.reason_code = "withdrawn".into();
            return cause;
        }
        if entry.plan_snapshot_id.as_ref() != Some(&self.action.base.plan_snapshot_id) {
            cause.outcome = CauseOutcome::Stale;
            cause.reason_code = "other_plan".into();
            return cause;
        }
        if entry.kind == FeedbackKind::FrequencyChange
            && self
                .action
                .log
                .entries
                .iter()
                .rfind(|other| {
                    other.kind == FeedbackKind::FrequencyChange
                        && other.item_id == entry.item_id
                        && !is_withdrawn(self.action.log, &other.id)
                })
                .is_some_and(|latest| latest.id != entry.id)
        {
            cause.reason_code = "superseded".into();
            return cause;
        }
        let mut focus = self
            .tops_of_item
            .get(&entry.item_id)
            .cloned()
            .unwrap_or_default();
        focus.truncate(MAX_FOCUS);
        cause.focus_placement_ids = focus.clone();
        if focus.is_empty() {
            cause.reason_code = "item_unplaced".into();
            return cause;
        }
        // A rule only weighs placements whose frequency is known. An unknown
        // frequency is neither "rare" nor "daily", so it is never moved.
        let usable: Vec<Id> = focus
            .iter()
            .filter(|top| self.ranks.get(*top).copied().flatten().is_some())
            .cloned()
            .collect();
        if usable.is_empty() {
            cause.reason_code = "frequency_unknown".into();
            return cause;
        }
        cause.unknown_siblings = self.unknown_siblings(&usable);
        if entry.kind == FeedbackKind::MaintenanceDifficulty
            && !usable.iter().any(|top| self.has_group_mates(top))
        {
            cause.reason_code = "no_group_mates".into();
            return cause;
        }
        let mut candidates = self.candidates(entry.kind, &usable);
        if candidates.is_empty() {
            cause.outcome = CauseOutcome::NoBetterSlot;
            cause.reason_code = if usable.iter().all(|top| self.sibling_count(top) < 2) {
                "no_sibling".into()
            } else if entry.kind == FeedbackKind::MaintenanceDifficulty {
                "no_closer_slot".into()
            } else {
                "already_ordered".into()
            };
            let top = usable[0].clone();
            cause.measure_before = Some(self.measure_now(entry.kind, &top));
            cause.measure_after = cause.measure_before;
            return cause;
        }
        candidates.sort_by(|left, right| {
            left.after
                .cmp(&right.after)
                .then(left.focus.as_str().cmp(right.focus.as_str()))
                .then(left.partner.as_str().cmp(right.partner.as_str()))
                .then((left.swap as u8).cmp(&(right.swap as u8)))
        });
        cause.measure_before = Some(candidates[0].before);
        for candidate in candidates {
            if self.evaluations_used >= self.action.budget.max_evaluations {
                self.budget_exhausted = true;
                cause.outcome = CauseOutcome::BudgetExhausted;
                cause.reason_code = "budget_exhausted".into();
                return cause;
            }
            self.evaluations_used += 1;
            cause.evaluations += 1;
            match self.try_candidate(&candidate) {
                Ok(()) => {
                    cause.outcome = CauseOutcome::Applied;
                    cause.reason_code = match candidate.swap {
                        SwapKind::DepthSwap => "swapped_depth".into(),
                        SwapKind::SlotSwap => "swapped_slot".into(),
                    };
                    cause.focus_placement_ids = vec![candidate.focus.clone()];
                    cause.partner_placement_id = Some(candidate.partner.clone());
                    cause.swap = Some(candidate.swap);
                    cause.measure_before = Some(candidate.before);
                    cause.measure_after = Some(candidate.after);
                    return cause;
                }
                Err(reasons) => {
                    for reason in reasons {
                        if cause.blockers.len() < MAX_BLOCKERS && !cause.blockers.contains(&reason)
                        {
                            cause.blockers.push(reason);
                        }
                    }
                }
            }
        }
        cause.outcome = CauseOutcome::Blocked;
        cause.reason_code = "candidates_blocked".into();
        cause
    }

    fn sibling_of_top(&self, top: &Id) -> Option<(usize, &Sibling)> {
        let index = *self.sibling_of.get(top)?;
        Some((index, &self.siblings[index]))
    }

    fn sibling_count(&self, top: &Id) -> usize {
        self.sibling_of_top(top)
            .map_or(0, |(_, sibling)| sibling.ids.len())
    }

    fn unknown_siblings(&self, tops: &[Id]) -> u32 {
        let mut seen = BTreeSet::new();
        for top in tops {
            if let Some((_, sibling)) = self.sibling_of_top(top) {
                for (id, rank) in sibling.ids.iter().zip(&sibling.ranks) {
                    if id != top && rank.is_none() {
                        seen.insert(id.clone());
                    }
                }
            }
        }
        seen.len() as u32
    }

    fn has_group_mates(&self, top: &Id) -> bool {
        let Some((_, sibling)) = self.sibling_of_top(top) else {
            return false;
        };
        let Some(at) = sibling.ids.iter().position(|id| id == top) else {
            return false;
        };
        sibling.groups.iter().any(|members| members.contains(&at))
    }

    /// Current positions of one sibling set, in member order.
    fn positions_of(&self, sibling: &Sibling) -> Vec<(i64, i64)> {
        sibling.ids.iter().map(|id| self.pos[id]).collect()
    }

    /// The rule's measure for the sibling set that holds `top`, now.
    fn measure_now(&self, kind: FeedbackKind, top: &Id) -> u32 {
        self.sibling_of_top(top).map_or(0, |(_, sibling)| {
            measure(kind, sibling, &self.positions_of(sibling))
        })
    }

    fn candidates(&self, kind: FeedbackKind, focus: &[Id]) -> Vec<Candidate> {
        let mut found = Vec::new();
        for top in focus {
            let Some((_, sibling)) = self.sibling_of_top(top) else {
                continue;
            };
            let Some(at) = sibling.ids.iter().position(|id| id == top) else {
                continue;
            };
            let Some(top_rank) = sibling.ranks[at] else {
                continue;
            };
            let here = self.positions_of(sibling);
            let before = measure(kind, sibling, &here);
            let other_before = other_measure(kind, sibling, &here);
            let (tx, ty) = here[at];
            for (with, partner) in sibling.ids.iter().enumerate() {
                if with == at {
                    continue;
                }
                let Some(partner_rank) = sibling.ranks[with] else {
                    continue;
                };
                let (px, py) = here[with];
                if kind == FeedbackKind::AccessDifficulty && !(py < ty && partner_rank > top_rank) {
                    continue;
                }
                for swap in [SwapKind::DepthSwap, SwapKind::SlotSwap] {
                    let mut moved = here.clone();
                    match swap {
                        SwapKind::DepthSwap => {
                            if ty == py {
                                continue;
                            }
                            moved[at] = (tx, py);
                            moved[with] = (px, ty);
                        }
                        SwapKind::SlotSwap => {
                            if tx == px {
                                continue;
                            }
                            moved[at] = (px, py);
                            moved[with] = (tx, ty);
                        }
                    }
                    let after = measure(kind, sibling, &moved);
                    let other_after = other_measure(kind, sibling, &moved);
                    if after < before && other_after <= other_before {
                        found.push(Candidate {
                            focus: top.clone(),
                            partner: partner.clone(),
                            swap,
                            before,
                            after,
                        });
                    }
                }
            }
        }
        found
    }

    fn try_candidate(&mut self, candidate: &Candidate) -> Result<(), Vec<String>> {
        let mut moved = self.pos.clone();
        let (tx, ty) = self.pos[&candidate.focus];
        let (px, py) = self.pos[&candidate.partner];
        match candidate.swap {
            SwapKind::DepthSwap => {
                moved.insert(candidate.focus.clone(), (tx, py));
                moved.insert(candidate.partner.clone(), (px, ty));
            }
            SwapKind::SlotSwap => {
                moved.insert(candidate.focus.clone(), (px, py));
                moved.insert(candidate.partner.clone(), (tx, ty));
            }
        }
        let layout = layout_of(self.action.base, Some(&moved));
        let evaluation = evaluate_candidate(
            self.action.input,
            self.action.catalog,
            &CandidateProposal {
                layout,
                strategy: self.action.base.content.strategy.clone(),
                creation: PlanCreation::ManualEdit,
            },
            self.versions.clone(),
            self.scope.clone(),
        );
        let Some(snapshot) = evaluation.snapshot else {
            let mut reasons: Vec<String> = evaluation
                .diagnostics
                .iter()
                .map(|diagnostic| diagnostic.reason_code.clone())
                .collect();
            if let Some(report) = &evaluation.report {
                reasons.extend(
                    report
                        .checks
                        .iter()
                        .filter(|check| check.blocking && check.status == CheckStatus::Fail)
                        .map(|check| check.reason_code.clone()),
                );
            }
            reasons.sort();
            reasons.dedup();
            if reasons.is_empty() {
                reasons.push("layout_rejected".into());
            }
            return Err(reasons);
        };
        if weakened(&self.base_report, &snapshot.content.validation) {
            return Err(vec!["weakens_checks".into()]);
        }
        self.pos = moved;
        self.last_snapshot = Some(snapshot);
        Ok(())
    }

    fn reply(
        self,
        causes: Vec<FeedbackCause>,
        input_digest: Digest,
        catalog_digest: Digest,
    ) -> ProposalReply {
        let base = self.action.base;
        let (outcome, draft_id, final_snapshot) = match self.last_snapshot {
            Some(snapshot) => (
                ProposalOutcome::Published {
                    snapshot: Box::new(snapshot.clone()),
                },
                Some(snapshot.plan_snapshot_id.clone()),
                Some(snapshot),
            ),
            None => (ProposalOutcome::NoChange {}, None, None),
        };
        let content = final_snapshot.as_ref().map(|snapshot| &snapshot.content);
        let mut moves = Vec::new();
        let mut check_changes = Vec::new();
        if let Some(content) = content {
            let after_by_id: BTreeMap<&Id, &Placement> = content
                .placements
                .iter()
                .map(|placement| (&placement.id, placement))
                .collect();
            for before in &base.content.placements {
                let Some(after) = after_by_id.get(&before.id) else {
                    continue;
                };
                if before.position != after.position {
                    moves.push(ProposedMove {
                        placement_id: before.id.clone(),
                        item_ids: self
                            .items_of_top
                            .get(&before.id)
                            .cloned()
                            .unwrap_or_default(),
                        from: before.position.clone(),
                        to: after.position.clone(),
                    });
                }
            }
            let was: BTreeMap<&str, &CheckStatus> = self
                .base_report
                .checks
                .iter()
                .map(|check| (check.id.as_str(), &check.status))
                .collect();
            for check in &content.validation.checks {
                if let Some(before) = was.get(check.id.as_str())
                    && **before != check.status
                    && check_changes.len() < MAX_CHECK_CHANGES
                {
                    check_changes.push(CheckChange {
                        check_id: check.id.clone(),
                        before: (*before).clone(),
                        after: check.status.clone(),
                    });
                }
            }
        }
        let same = content.unwrap_or(&base.content);
        let preserved = Preserved {
            assignments: same.assignments == base.content.assignments,
            unassigned: same.unassigned == base.content.unassigned,
            purchase_selections: same.purchase_selections == base.content.purchase_selections,
            bom: same.bom == base.content.bom,
            cost_summary: same.cost_summary == base.content.cost_summary,
        };
        let feedback_digest = canonical::content_digest(self.action.log);
        let location_digest = canonical::content_digest(self.action.locations);
        let request_digest = canonical::content_digest(&(
            READ_MODEL_VERSION,
            RULE_SET_VERSION,
            &input_digest,
            &catalog_digest,
            &base.plan_snapshot_id,
            &feedback_digest,
            &location_digest,
            self.action.budget,
        ));
        ProposalReply {
            read_model_version: READ_MODEL_VERSION.into(),
            rule_set_version: RULE_SET_VERSION.into(),
            base_snapshot_id: base.plan_snapshot_id.clone(),
            outcome,
            causes,
            moves,
            check_changes,
            preserved,
            reused_pass: false,
            auto_discard: false,
            auto_purchase: false,
            evaluations_used: self.evaluations_used,
            budget_exhausted: self.budget_exhausted,
            reproduction: Reproduction {
                read_model_version: READ_MODEL_VERSION.into(),
                rule_set_version: RULE_SET_VERSION.into(),
                input_digest,
                catalog_digest,
                base_snapshot_id: base.plan_snapshot_id.clone(),
                feedback_digest,
                location_digest,
                budget: self.action.budget.clone(),
                request_digest,
                draft_snapshot_id: draft_id,
            },
        }
    }
}

/// Frequency-order inversions: pairs of known-frequency placements where the
/// more frequent one sits deeper. Equal frequencies and unknown ones never
/// count.
fn inversions(sibling: &Sibling, pos: &[(i64, i64)]) -> u32 {
    let mut count = 0;
    for (i, left) in sibling.ranks.iter().enumerate() {
        let Some(left) = left else { continue };
        for (offset, right) in sibling.ranks[i + 1..].iter().enumerate() {
            let Some(right) = right else { continue };
            if left == right {
                continue;
            }
            let j = i + 1 + offset;
            let (hot, cold) = if left < right { (i, j) } else { (j, i) };
            if pos[hot].1 > pos[cold].1 {
                count += 1;
            }
        }
    }
    count
}

/// Summed L1 distance between the placements of each group that has two or
/// more members in this set. Saturates into `u32` for the reply.
fn spread(sibling: &Sibling, pos: &[(i64, i64)]) -> u32 {
    let mut total: u64 = 0;
    for members in &sibling.groups {
        for (i, left) in members.iter().enumerate() {
            for right in &members[i + 1..] {
                let (lx, ly) = pos[*left];
                let (rx, ry) = pos[*right];
                total += (lx - rx).unsigned_abs() + (ly - ry).unsigned_abs();
            }
        }
    }
    u32::try_from(total).unwrap_or(u32::MAX)
}

fn measure(kind: FeedbackKind, sibling: &Sibling, pos: &[(i64, i64)]) -> u32 {
    match kind {
        FeedbackKind::MaintenanceDifficulty => spread(sibling, pos),
        _ => inversions(sibling, pos),
    }
}

/// The other rule's measure. An exchange may not make it worse.
fn other_measure(kind: FeedbackKind, sibling: &Sibling, pos: &[(i64, i64)]) -> u32 {
    match kind {
        FeedbackKind::MaintenanceDifficulty => inversions(sibling, pos),
        _ => spread(sibling, pos),
    }
}

struct Candidate {
    focus: Id,
    partner: Id,
    swap: SwapKind,
    before: u32,
    after: u32,
}

/// The adopted layout, optionally with floor positions replaced. Height,
/// support, orientation, assignments, and purchases are never touched.
fn layout_of(base: &PlanSnapshot, moved: Option<&Pos>) -> CandidateLayout {
    let mut placements = base.content.placements.clone();
    if let Some(moved) = moved {
        for placement in &mut placements {
            if let Some((x, y)) = moved.get(&placement.id)
                && let (Ok(x), Ok(y)) = (i32::try_from(*x), i32::try_from(*y))
                && let (Ok(x), Ok(y)) = (PositionMm::new(x), PositionMm::new(y))
            {
                placement.position.x = x;
                placement.position.y = y;
            }
        }
    }
    CandidateLayout {
        placements,
        assignments: base.content.assignments.clone(),
        unassigned: base.content.unassigned.clone(),
        purchase_selections: base.content.purchase_selections.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plan::{
        AssignmentCompleteness, CheckBasis, CheckKind, CommerceReadiness, ConstraintCheck,
    };
    use crate::scalars::UnitCount;

    fn check(name: &str, status: CheckStatus) -> ConstraintCheck {
        ConstraintCheck {
            id: Id::new(name).unwrap(),
            kind: CheckKind::OuterGeometry,
            subject_ids: vec![],
            status,
            reason_code: "test".into(),
            basis: CheckBasis::Nominal,
            evidence_refs: vec![],
            measurements: vec![],
            blocking: false,
            remediation: vec![],
        }
    }

    fn report(checks: Vec<ConstraintCheck>, assurance: PhysicalAssurance) -> ValidationReport {
        ValidationReport {
            checks,
            physical_assurance: assurance,
            assignment_completeness: AssignmentCompleteness {
                assigned_instances: UnitCount::new(0).unwrap(),
                provisional_instances: UnitCount::new(0).unwrap(),
                unassigned_instances: UnitCount::new(0).unwrap(),
                unknown_quantity_items: UnitCount::new(0).unwrap(),
            },
            commerce_readiness: CommerceReadiness::NotApplicable,
        }
    }

    #[test]
    fn a_candidate_may_not_be_weaker_than_the_adopted_plan() {
        let base = report(
            vec![
                check("c1", CheckStatus::Pass),
                check("c2", CheckStatus::Unknown),
            ],
            PhysicalAssurance::Conditional,
        );
        // Same statuses are fine.
        assert!(!weakened(&base, &base));
        // An unknown that becomes a pass is an improvement, not a weakening.
        let better = report(
            vec![
                check("c1", CheckStatus::Pass),
                check("c2", CheckStatus::Pass),
            ],
            PhysicalAssurance::ConfirmedWithinScope,
        );
        assert!(!weakened(&base, &better));
        // A pass that becomes unknown is weaker; unknown is not a pass.
        let worse = report(
            vec![
                check("c1", CheckStatus::Unknown),
                check("c2", CheckStatus::Unknown),
            ],
            PhysicalAssurance::Conditional,
        );
        assert!(weakened(&base, &worse));
        // An unknown that becomes a known failure is weaker too.
        let failed = report(
            vec![
                check("c1", CheckStatus::Pass),
                check("c2", CheckStatus::Fail),
            ],
            PhysicalAssurance::Conditional,
        );
        assert!(weakened(&base, &failed));
        // A check the adopted plan did not have must pass.
        let extra = report(
            vec![
                check("c1", CheckStatus::Pass),
                check("c2", CheckStatus::Unknown),
                check("c3", CheckStatus::Unknown),
            ],
            PhysicalAssurance::Conditional,
        );
        assert!(weakened(&base, &extra));
        let extra_pass = report(
            vec![
                check("c1", CheckStatus::Pass),
                check("c2", CheckStatus::Unknown),
                check("c3", CheckStatus::NotApplicable),
            ],
            PhysicalAssurance::Conditional,
        );
        assert!(!weakened(&base, &extra_pass));
        // A weaker overall assurance is refused even when every check matches.
        let rejected = report(base.checks.clone(), PhysicalAssurance::Rejected);
        assert!(weakened(&base, &rejected));
    }
}
