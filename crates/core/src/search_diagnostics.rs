//! Search outcome diagnostic.
//!
//! Separates an empty catalog, geometry outside the supported model, a fact
//! that cannot be settled, and a search that stopped because its budget ran
//! out. Unknown is not reported as "no product". A larger budget is not an
//! impossibility proof. The reproduction is the input, rules, catalog, and
//! budget that produced the classification. It carries no log and no secret.

use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::canonical::{self, CatalogContent, RULE_VERSION};
use crate::catalog::{OwnedContainer, ProductVariant};
use crate::completion::CompletionNeed;
use crate::facts::{Dimensions, Fact};
use crate::input::{ProjectInput, SearchBudget, SearchProfile};
use crate::next_facts::{self, NextFactsError};
use crate::plan::{
    CheckKind, CheckStatus, PlanSnapshot, RejectedCandidate, SearchCounters, SearchScope,
    SearchTermination, UnassignedInstances,
};
use crate::scalars::{Digest, Id};
use crate::strategy::StoragePrimitive;

pub const READ_MODEL_VERSION: &str = "zari-search-diagnostics-1";
const MAX_ALTERNATIVES: usize = 8;
const MAX_CANDIDATES: usize = 128;
const MAX_CHECKS: usize = 256;
const MAX_LINKS: usize = 64;

const UNKNOWN_REASONS: &[&str] = &[
    "catalog_data_unknown",
    "owned_geometry_unknown",
    "owned_availability_unknown",
    "geometry_unknown",
    "measurement_missing",
    "quantity_unknown",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DiagnosticError {
    pub code: &'static str,
}

#[derive(Clone, Debug)]
pub struct DiagnoseAction<'a> {
    pub input: &'a ProjectInput,
    pub catalog: &'a CatalogContent,
    pub termination: SearchTermination,
    pub scope: &'a SearchScope,
    pub consumed: &'a SearchCounters,
    pub alternatives: &'a [PlanSnapshot],
    pub diagnostic_candidates: &'a [RejectedCandidate],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticClass {
    NoProduct,
    GeometryOutOfRange,
    Undetermined,
    BudgetExhausted,
    SearchNotFinished,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SupportStatus {
    FiniteNotComplete,
    OutsideModel,
    InScope,
    NotClaimed,
    Exhausted,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClassFinding {
    pub class: DiagnosticClass,
    pub present: bool,
    pub reason_codes: Vec<String>,
    pub subject_ids: Vec<Id>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupportRangeRow {
    pub code: String,
    pub status: SupportStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BudgetAccount {
    pub max_work_units: crate::scalars::WorkCount,
    pub consumed_work_units: crate::scalars::WorkCount,
    pub max_nodes: u32,
    pub consumed_nodes: u32,
    /// True only when the search stopped for `budgetExhausted`.
    pub exhausted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NextCheckLink {
    pub class: DiagnosticClass,
    pub reason_code: String,
    pub subject_ids: Vec<Id>,
    pub fact_keys: Vec<String>,
    pub field_paths: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnassignedNote {
    pub item_id: Id,
    pub reason_code: String,
    pub unknown_quantity: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckNote {
    pub kind: CheckKind,
    pub status: CheckStatus,
    pub reason_code: String,
    pub blocking: bool,
    pub subject_ids: Vec<Id>,
    pub field_paths: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LayoutObservation {
    pub snapshot_id: Digest,
    pub unassigned: Vec<UnassignedNote>,
    pub checks: Vec<CheckNote>,
}

/// The bytes needed to classify the same case again.
/// Worker sessions, request ids, durations, photos, and logs are absent.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchReproduction {
    pub read_model_version: String,
    pub schema_version: u32,
    pub canonical_version: u32,
    pub rule_version: String,
    pub solver_version: String,
    pub input_digest: Digest,
    pub input: ProjectInput,
    pub catalog_digest: Digest,
    pub catalog: CatalogContent,
    pub budget: SearchBudget,
    pub profile: SearchProfile,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub seed: Option<String>,
    pub termination: SearchTermination,
    pub scope: SearchScope,
    pub consumed: SearchCounters,
    pub diagnostic_candidates: Vec<RejectedCandidate>,
    pub observations: Vec<LayoutObservation>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchDiagnosticReply {
    pub read_model_version: String,
    /// Always false. This read model does not prove that no arrangement exists.
    pub proves_impossible: bool,
    /// Always false. Suggesting a larger budget is not that proof.
    pub budget_suggestion_is_proof: bool,
    pub larger_budget_suggested: bool,
    pub classes: Vec<ClassFinding>,
    pub support: Vec<SupportRangeRow>,
    pub budget_account: BudgetAccount,
    pub next_checks: Vec<NextCheckLink>,
    pub next_checks_truncated: bool,
    pub reproduction: SearchReproduction,
}

pub fn diagnose_search(
    action: &DiagnoseAction<'_>,
) -> Result<SearchDiagnosticReply, DiagnosticError> {
    let reproduction = reproduction_from(action)?;
    diagnose_case(&reproduction)
}

pub fn diagnose_case(case: &SearchReproduction) -> Result<SearchDiagnosticReply, DiagnosticError> {
    validate_case(case)?;
    let findings = classify(case);
    let (next_checks, next_checks_truncated) = link_checks(case)?;
    let exhausted = case.termination == SearchTermination::BudgetExhausted;
    Ok(SearchDiagnosticReply {
        read_model_version: READ_MODEL_VERSION.to_owned(),
        proves_impossible: false,
        budget_suggestion_is_proof: false,
        larger_budget_suggested: exhausted && case.observations.is_empty(),
        classes: findings,
        support: support_rows(&case.termination),
        budget_account: BudgetAccount {
            max_work_units: case.budget.max_work_units,
            consumed_work_units: case.consumed.work_units,
            max_nodes: case.budget.max_nodes,
            consumed_nodes: case.consumed.nodes,
            exhausted,
        },
        next_checks,
        next_checks_truncated,
        reproduction: case.clone(),
    })
}

fn reproduction_from(action: &DiagnoseAction<'_>) -> Result<SearchReproduction, DiagnosticError> {
    if action.alternatives.len() > MAX_ALTERNATIVES
        || action.diagnostic_candidates.len() > MAX_CANDIDATES
    {
        return Err(DiagnosticError {
            code: "input_limit_exceeded",
        });
    }
    if action.scope.budget != action.input.search.budget
        || action.scope.profile != action.input.search.profile
    {
        return Err(DiagnosticError {
            code: "budget_mismatch",
        });
    }
    let input_digest = canonical::input_digest(action.input);
    let catalog_digest = canonical::catalog_digest(action.catalog);
    if action.input.catalog_pin.catalog_digest != catalog_digest
        || action.input.catalog_pin.catalog_version != action.catalog.catalog_version
    {
        return Err(DiagnosticError {
            code: "digest_mismatch",
        });
    }
    let mut observations = Vec::with_capacity(action.alternatives.len());
    for snapshot in action.alternatives {
        let versions = &snapshot.content.versions;
        if versions.input_digest != input_digest || versions.catalog_digest != catalog_digest {
            return Err(DiagnosticError {
                code: "stale_result",
            });
        }
        observations.push(observe(snapshot)?);
    }
    Ok(SearchReproduction {
        read_model_version: READ_MODEL_VERSION.to_owned(),
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        rule_version: RULE_VERSION.to_owned(),
        solver_version: canonical::solver_version_for(&action.input.search.profile).to_owned(),
        input_digest,
        input: action.input.clone(),
        catalog_digest,
        catalog: action.catalog.clone(),
        budget: action.input.search.budget.clone(),
        profile: action.input.search.profile.clone(),
        seed: action.input.search.seed.clone(),
        termination: action.termination.clone(),
        scope: action.scope.clone(),
        consumed: action.consumed.clone(),
        diagnostic_candidates: action.diagnostic_candidates.to_vec(),
        observations,
    })
}

fn validate_case(case: &SearchReproduction) -> Result<(), DiagnosticError> {
    if case.read_model_version != READ_MODEL_VERSION
        || case.schema_version != canonical::SCHEMA_VERSION
        || case.canonical_version != canonical::CANONICAL_VERSION
        || case.rule_version != RULE_VERSION
        || case.solver_version != canonical::solver_version_for(&case.profile)
    {
        return Err(DiagnosticError {
            code: "rule_mismatch",
        });
    }
    if case.observations.len() > MAX_ALTERNATIVES
        || case.diagnostic_candidates.len() > MAX_CANDIDATES
        || case
            .observations
            .iter()
            .any(|row| row.checks.len() > MAX_CHECKS)
    {
        return Err(DiagnosticError {
            code: "input_limit_exceeded",
        });
    }
    if canonical::input_digest(&case.input) != case.input_digest
        || canonical::catalog_digest(&case.catalog) != case.catalog_digest
        || case.input.catalog_pin.catalog_digest != case.catalog_digest
        || case.budget != case.input.search.budget
        || case.profile != case.input.search.profile
        || case.seed != case.input.search.seed
        || case.scope.budget != case.budget
        || case.scope.profile != case.profile
    {
        return Err(DiagnosticError {
            code: "digest_mismatch",
        });
    }
    Ok(())
}

fn observe(snapshot: &PlanSnapshot) -> Result<LayoutObservation, DiagnosticError> {
    if snapshot.content.validation.checks.len() > MAX_CHECKS {
        return Err(DiagnosticError {
            code: "input_limit_exceeded",
        });
    }
    let unassigned = snapshot
        .content
        .unassigned
        .iter()
        .map(|row| UnassignedNote {
            item_id: row.item_id.clone(),
            reason_code: row.reason_code.clone(),
            unknown_quantity: matches!(row.instances, UnassignedInstances::UnknownQuantity {}),
        })
        .collect();
    let checks = snapshot
        .content
        .validation
        .checks
        .iter()
        .map(|check| {
            let mut field_paths: Vec<String> = check
                .measurements
                .iter()
                .map(|measurement| measurement.field_path.clone())
                .chain(
                    check
                        .evidence_refs
                        .iter()
                        .map(|field| field.field_path.clone()),
                )
                .chain(
                    check
                        .remediation
                        .iter()
                        .flat_map(|item| item.field_paths.iter().cloned()),
                )
                .collect();
            field_paths.sort();
            field_paths.dedup();
            CheckNote {
                kind: check.kind.clone(),
                status: check.status.clone(),
                reason_code: check.reason_code.clone(),
                blocking: check.blocking,
                subject_ids: check.subject_ids.clone(),
                field_paths,
            }
        })
        .collect();
    Ok(LayoutObservation {
        snapshot_id: snapshot.plan_snapshot_id.clone(),
        unassigned,
        checks,
    })
}

struct Signals {
    undetermined: BTreeSet<String>,
    undetermined_subjects: BTreeSet<Id>,
    geometry: BTreeSet<String>,
    geometry_subjects: BTreeSet<Id>,
    product_unknown: bool,
}

fn classify(case: &SearchReproduction) -> Vec<ClassFinding> {
    let mut signals = Signals {
        undetermined: BTreeSet::new(),
        undetermined_subjects: BTreeSet::new(),
        geometry: BTreeSet::new(),
        geometry_subjects: BTreeSet::new(),
        product_unknown: false,
    };
    collect_input(&case.input, &mut signals);
    collect_catalog(&case.catalog, &case.input, &mut signals);
    collect_scope(case, &mut signals);
    collect_observations(case, &mut signals);
    let no_product = !signals.product_unknown
        && case.termination == SearchTermination::ScopeComplete
        && case.observations.is_empty()
        && !case.input.items.is_empty()
        && !known_container(&case.catalog, &case.input);
    let mut product_reasons = BTreeSet::new();
    if no_product {
        product_reasons.insert("catalog_empty".to_owned());
    }
    let budget = case.termination == SearchTermination::BudgetExhausted;
    let unfinished = matches!(
        case.termination,
        SearchTermination::Cancelled | SearchTermination::Interrupted
    );
    vec![
        finding(
            DiagnosticClass::NoProduct,
            no_product,
            product_reasons,
            BTreeSet::new(),
        ),
        finding(
            DiagnosticClass::GeometryOutOfRange,
            !signals.geometry.is_empty(),
            signals.geometry,
            signals.geometry_subjects,
        ),
        finding(
            DiagnosticClass::Undetermined,
            !signals.undetermined.is_empty(),
            signals.undetermined,
            signals.undetermined_subjects,
        ),
        finding(
            DiagnosticClass::BudgetExhausted,
            budget,
            if budget {
                BTreeSet::from(["budget_exhausted".to_owned()])
            } else {
                BTreeSet::new()
            },
            BTreeSet::new(),
        ),
        finding(
            DiagnosticClass::SearchNotFinished,
            unfinished,
            if unfinished {
                BTreeSet::from([termination_code(&case.termination).to_owned()])
            } else {
                BTreeSet::new()
            },
            BTreeSet::new(),
        ),
    ]
}

fn finding(
    class: DiagnosticClass,
    present: bool,
    reasons: BTreeSet<String>,
    subjects: BTreeSet<Id>,
) -> ClassFinding {
    ClassFinding {
        class,
        present,
        reason_codes: reasons.into_iter().collect(),
        subject_ids: subjects.into_iter().collect(),
    }
}

fn collect_input(input: &ProjectInput, signals: &mut Signals) {
    if !known_dims(&input.space.interior) {
        note_unknown(
            signals,
            "space_measurement_unknown",
            Some(input.space.id.clone()),
        );
    }
    for item in &input.items {
        if matches!(item.quantity, Fact::Unknown { .. }) {
            note_unknown(signals, "quantity_unknown", Some(item.id.clone()));
        }
        if !known_dims(&item.dimensions.envelope) {
            note_unknown(signals, "measurement_missing", Some(item.id.clone()));
        } else if known_dims(&input.space.interior) && !fits(item, input) {
            signals.geometry.insert("envelope_exceeds_space".to_owned());
            signals.geometry_subjects.insert(item.id.clone());
        }
    }
}

fn collect_catalog(catalog: &CatalogContent, input: &ProjectInput, signals: &mut Signals) {
    for variant in &catalog.variants {
        if unknown_variant(variant) {
            note_unknown(signals, "catalog_data_unknown", Some(variant.id.clone()));
        }
    }
    for owned in &input.owned_containers {
        if unknown_owned(owned) {
            note_unknown(signals, "owned_geometry_unknown", Some(owned.id.clone()));
        }
    }
}

fn collect_scope(case: &SearchReproduction, signals: &mut Signals) {
    for restriction in &case.scope.restrictions {
        if UNKNOWN_REASONS.contains(&restriction.code.as_str()) {
            note_unknown(
                signals,
                &restriction.code,
                restriction.subject_ids.first().cloned(),
            );
            for id in &restriction.subject_ids {
                signals.undetermined_subjects.insert(id.clone());
            }
        }
    }
    for candidate in &case.diagnostic_candidates {
        absorb_reason(
            signals,
            &candidate.reason_code,
            candidate.subject_ids.first().cloned(),
        );
    }
}

fn collect_observations(case: &SearchReproduction, signals: &mut Signals) {
    for observation in &case.observations {
        for row in &observation.unassigned {
            if row.unknown_quantity {
                note_unknown(signals, "quantity_unknown", Some(row.item_id.clone()));
            }
            absorb_reason(signals, &row.reason_code, Some(row.item_id.clone()));
        }
        for check in &observation.checks {
            if check.status == CheckStatus::Unknown && check.blocking {
                note_unknown(
                    signals,
                    "measurement_missing",
                    check.subject_ids.first().cloned(),
                );
            } else if check.status == CheckStatus::Fail && check.blocking && geometric(&check.kind)
            {
                signals.geometry.insert(check.reason_code.clone());
                if let Some(id) = check.subject_ids.first() {
                    signals.geometry_subjects.insert(id.clone());
                }
            }
        }
    }
}

fn absorb_reason(signals: &mut Signals, reason: &str, subject: Option<Id>) {
    if UNKNOWN_REASONS.contains(&reason) {
        note_unknown(signals, reason, subject);
        return;
    }
    if reason == "no_feasible_anchor" || reason == "unsupported_geometry" {
        signals.geometry.insert(reason.to_owned());
        if let Some(id) = subject {
            signals.geometry_subjects.insert(id);
        }
    }
}

fn note_unknown(signals: &mut Signals, reason: &str, subject: Option<Id>) {
    signals.product_unknown = true;
    signals.undetermined.insert(reason.to_owned());
    if let Some(id) = subject {
        signals.undetermined_subjects.insert(id);
    }
}

fn known_container(catalog: &CatalogContent, input: &ProjectInput) -> bool {
    catalog.variants.iter().any(known_variant) || input.owned_containers.iter().any(known_owned)
}

fn known_variant(variant: &ProductVariant) -> bool {
    container_variant(variant)
        && known_dims(&variant.dimensions.outer)
        && matches!(variant.dimensions.handles, Fact::Known { .. })
}

fn unknown_variant(variant: &ProductVariant) -> bool {
    container_variant(variant)
        && (!known_dims(&variant.dimensions.outer)
            || matches!(variant.dimensions.handles, Fact::Unknown { .. }))
}

fn container_variant(variant: &ProductVariant) -> bool {
    !matches!(variant.primitive, StoragePrimitive::DirectPlacement)
}

fn known_owned(owned: &OwnedContainer) -> bool {
    known_dims(&owned.physical.dimensions.outer)
        && matches!(owned.physical.dimensions.handles, Fact::Known { .. })
}

fn unknown_owned(owned: &OwnedContainer) -> bool {
    !known_dims(&owned.physical.dimensions.outer)
        || matches!(owned.physical.dimensions.handles, Fact::Unknown { .. })
}

fn known_dims(dimensions: &Dimensions) -> bool {
    dimensions.width.value().is_some()
        && dimensions.depth.value().is_some()
        && dimensions.height.value().is_some()
}

fn fits(item: &crate::input::Item, input: &ProjectInput) -> bool {
    let Some(item_w) = nominal(&item.dimensions.envelope.width) else {
        return true;
    };
    let Some(item_d) = nominal(&item.dimensions.envelope.depth) else {
        return true;
    };
    let Some(item_h) = nominal(&item.dimensions.envelope.height) else {
        return true;
    };
    let Some(space_w) = nominal(&input.space.interior.width) else {
        return true;
    };
    let Some(space_d) = nominal(&input.space.interior.depth) else {
        return true;
    };
    let Some(space_h) = nominal(&input.space.interior.height) else {
        return true;
    };
    let upright0 = item_w <= space_w && item_d <= space_d && item_h <= space_h;
    let upright90 = item_d <= space_w && item_w <= space_d && item_h <= space_h;
    upright0 || upright90
}

fn nominal(measurement: &crate::facts::Measurement) -> Option<u32> {
    measurement.value().map(|value| value.nominal.get())
}

fn geometric(kind: &CheckKind) -> bool {
    matches!(
        kind,
        CheckKind::OuterGeometry
            | CheckKind::InnerCapacity
            | CheckKind::InstallationPath
            | CheckKind::SupportGeometry
            | CheckKind::Orientation
    )
}

fn termination_code(termination: &SearchTermination) -> &'static str {
    match termination {
        SearchTermination::Cancelled => "cancelled",
        SearchTermination::Interrupted => "interrupted",
        SearchTermination::BudgetExhausted => "budget_exhausted",
        SearchTermination::ScopeComplete => "scope_complete",
    }
}

fn support_rows(termination: &SearchTermination) -> Vec<SupportRangeRow> {
    let budget_status = match termination {
        SearchTermination::BudgetExhausted => SupportStatus::Exhausted,
        SearchTermination::ScopeComplete => SupportStatus::InScope,
        SearchTermination::Cancelled | SearchTermination::Interrupted => SupportStatus::NotClaimed,
    };
    vec![
        SupportRangeRow {
            code: "rectangular_floor_anchor".to_owned(),
            status: SupportStatus::FiniteNotComplete,
        },
        SupportRangeRow {
            code: "stacking".to_owned(),
            status: SupportStatus::OutsideModel,
        },
        SupportRangeRow {
            code: "arbitrary_shape".to_owned(),
            status: SupportStatus::OutsideModel,
        },
        SupportRangeRow {
            code: "insertion_rotation".to_owned(),
            status: SupportStatus::OutsideModel,
        },
        SupportRangeRow {
            code: "search_budget".to_owned(),
            status: budget_status,
        },
    ]
}

fn link_checks(case: &SearchReproduction) -> Result<(Vec<NextCheckLink>, bool), DiagnosticError> {
    let digest = canonical::input_digest(&case.input);
    let facts = match next_facts::query_next_facts(&case.input, &digest, None) {
        Ok(reply) => reply,
        Err(NextFactsError::DigestMismatch) => {
            return Err(DiagnosticError {
                code: "digest_mismatch",
            });
        }
        Err(NextFactsError::LimitExceeded) => {
            return Err(DiagnosticError {
                code: "input_limit_exceeded",
            });
        }
    };
    let mut links = Vec::new();
    for row in facts.rows {
        let class = match row.need_kind {
            CompletionNeed::MissingNominal
            | CompletionNeed::MissingBound
            | CompletionNeed::ConflictingEvidence
            | CompletionNeed::UnsupportedInput => DiagnosticClass::Undetermined,
            CompletionNeed::RepairKnownFailure => DiagnosticClass::GeometryOutOfRange,
            CompletionNeed::MissingEvidence => continue,
        };
        let reason = row
            .reason_codes
            .first()
            .cloned()
            .unwrap_or_else(|| need_code(row.need_kind).to_owned());
        links.push(NextCheckLink {
            class,
            reason_code: reason,
            subject_ids: row
                .field_refs
                .iter()
                .map(|field| field.entity_id.clone())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
            fact_keys: vec![row.fact_key],
            field_paths: row
                .field_refs
                .iter()
                .map(|field| field.field_path.clone())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
        });
    }
    for observation in &case.observations {
        for check in &observation.checks {
            if check.status != CheckStatus::Fail || !check.blocking || !geometric(&check.kind) {
                continue;
            }
            let keys: Vec<String> = links
                .iter()
                .flat_map(|link| link.fact_keys.iter().cloned())
                .filter(|key| {
                    check
                        .field_paths
                        .iter()
                        .any(|path| key.ends_with(path) || key.contains(path))
                })
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect();
            links.push(NextCheckLink {
                class: DiagnosticClass::GeometryOutOfRange,
                reason_code: check.reason_code.clone(),
                subject_ids: check.subject_ids.clone(),
                fact_keys: keys,
                field_paths: check.field_paths.clone(),
            });
        }
    }
    links.sort_by(|left, right| {
        left.fact_keys
            .first()
            .cmp(&right.fact_keys.first())
            .then(left.reason_code.cmp(&right.reason_code))
            .then(left.field_paths.cmp(&right.field_paths))
    });
    let truncated = links.len() > MAX_LINKS;
    links.truncate(MAX_LINKS);
    Ok((links, truncated))
}

fn need_code(need: CompletionNeed) -> &'static str {
    match need {
        CompletionNeed::MissingNominal => "measurement_missing",
        CompletionNeed::MissingBound => "measurement_missing",
        CompletionNeed::MissingEvidence => "measurement_missing",
        CompletionNeed::ConflictingEvidence => "measurement_missing",
        CompletionNeed::UnsupportedInput => "unsupported_geometry",
        CompletionNeed::RepairKnownFailure => "geometry_out_of_range",
    }
}
