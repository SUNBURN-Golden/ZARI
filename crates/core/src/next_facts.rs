//! Pure completion query. Reads the supplied input and, when the snapshot
//! binding matches, that snapshot's current checks. It does not search,
//! reprice, re-finalize, or mutate activation, counters, or the input.

use crate::canonical::{self, CANONICAL_VERSION, RULE_VERSION};
use crate::catalog::ProductVariant;
use crate::completion::*;
use crate::facts::*;
use crate::input::ProjectInput;
use crate::measurement::{
    self, GroupScalar, MeasurementFieldKind, RoutedEntity, route_measurement_field,
};
use crate::plan::{ConstraintCheck, PlanSnapshot};
use crate::scalars::{Digest, Id};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NextFactsError {
    DigestMismatch,
    LimitExceeded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum NextFactsFreshness {
    Current,
    InputOnly,
    Stale,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionAction {
    EditSupportedField,
    InspectCatalogSource,
    Recalculate,
    RequestSupportedScope,
    Remeasure,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NextFactsSourceStamp {
    pub input_digest: Digest,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub plan_snapshot_id: Option<Digest>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Digest>")]
    pub catalog_digest: Option<Digest>,
    pub rule_version: String,
    pub canonical_version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NextFactRow {
    pub fact_key: String,
    pub field_refs: Vec<FieldRef>,
    pub target_refs: Vec<FieldRef>,
    pub need_kind: CompletionNeed,
    pub check_ids: Vec<Id>,
    pub reason_codes: Vec<String>,
    pub priority_class: CompletionPriority,
    pub related_check_count: u32,
    pub resolution_actions: Vec<ResolutionAction>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NextFactsReply {
    pub freshness: NextFactsFreshness,
    pub source_stamp: NextFactsSourceStamp,
    pub rows: Vec<NextFactRow>,
    pub resolution_actions: Vec<ResolutionAction>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FactGap {
    MissingNominal,
    MissingBound,
    MissingEvidence,
    Conflicting,
    Complete,
    NotApplicable,
    /// The path is real, but this query does not hold the catalogue body.
    Unreadable,
}

struct Observation {
    gap: FactGap,
    mutable: bool,
    priority: CompletionPriority,
    entity: Id,
}

struct CheckLink {
    id: Id,
    reason: String,
    class: CheckCompletionClass,
}

struct RowAcc {
    fields: BTreeSet<FieldRef>,
    checks: BTreeMap<String, CheckLink>,
    gap: Option<FactGap>,
    mutable: bool,
    routed: bool,
    hint: Option<CompletionPriority>,
}

struct Index {
    rows: BTreeMap<String, RowAcc>,
    check_refs: usize,
}

const SPACE_PATHS: &[&str] = &[
    "space.interior.width",
    "space.interior.depth",
    "space.interior.height",
    "space.opening.width",
    "space.opening.height",
    "space.opening.left",
    "space.opening.bottom",
    "space.staging.freeVolume.minX",
    "space.staging.freeVolume.minY",
    "space.staging.freeVolume.minZ",
    "space.staging.freeVolume.extent.width",
    "space.staging.freeVolume.extent.depth",
    "space.staging.freeVolume.extent.height",
    "space.staging.baseSupport",
    "space.staging.baseSupport.loadLimit",
    "space.support.footprint.x",
    "space.support.footprint.y",
    "space.support.footprint.width",
    "space.support.footprint.depth",
    "space.support.elevation",
    "space.support.loadLimit",
    "space.clearances.left",
    "space.clearances.right",
    "space.clearances.front",
    "space.clearances.back",
    "space.clearances.top",
    "space.clearances.betweenUnits",
];

pub fn query_next_facts(
    input: &ProjectInput,
    input_digest: &Digest,
    snapshot: Option<&PlanSnapshot>,
) -> Result<NextFactsReply, NextFactsError> {
    if &canonical::input_digest(input) != input_digest {
        return Err(NextFactsError::DigestMismatch);
    }
    let snapshot_id = snapshot.map(|item| item.plan_snapshot_id.clone());
    let stamp = source_stamp(input, input_digest, snapshot_id);
    let Some(snapshot) = snapshot else {
        let rows = assemble(input, None)?;
        return finish(NextFactsFreshness::InputOnly, stamp, rows, vec![]);
    };
    if !binding_matches(input, input_digest, snapshot) {
        return finish(
            NextFactsFreshness::Stale,
            stamp,
            vec![],
            vec![ResolutionAction::Recalculate],
        );
    }
    let rows = assemble(input, Some(snapshot))?;
    finish(NextFactsFreshness::Current, stamp, rows, vec![])
}

fn finish(
    freshness: NextFactsFreshness,
    source_stamp: NextFactsSourceStamp,
    mut rows: Vec<NextFactRow>,
    resolution_actions: Vec<ResolutionAction>,
) -> Result<NextFactsReply, NextFactsError> {
    rows.sort_by(|left, right| {
        left.priority_class
            .cmp(&right.priority_class)
            .then(right.related_check_count.cmp(&left.related_check_count))
            .then(left.fact_key.cmp(&right.fact_key))
    });
    let reply = NextFactsReply {
        freshness,
        source_stamp,
        rows,
        resolution_actions,
    };
    let bytes = serde_json::to_vec(&reply).map_err(|_| NextFactsError::LimitExceeded)?;
    if bytes.len() > COMPLETION_MAX_BYTES {
        return Err(NextFactsError::LimitExceeded);
    }
    Ok(reply)
}

fn source_stamp(
    input: &ProjectInput,
    input_digest: &Digest,
    plan_snapshot_id: Option<Digest>,
) -> NextFactsSourceStamp {
    NextFactsSourceStamp {
        input_digest: input_digest.clone(),
        plan_snapshot_id,
        catalog_digest: Some(input.catalog_pin.catalog_digest.clone()),
        rule_version: RULE_VERSION.to_owned(),
        canonical_version: CANONICAL_VERSION,
    }
}

fn binding_matches(input: &ProjectInput, digest: &Digest, snapshot: &PlanSnapshot) -> bool {
    let versions = &snapshot.content.versions;
    versions.input_digest == *digest
        && versions.catalog_digest == input.catalog_pin.catalog_digest
        && versions.catalog_version == input.catalog_pin.catalog_version
        && versions.rule_version == RULE_VERSION
        && versions.canonical_version == CANONICAL_VERSION
        && canonical::input_digest(&snapshot.content.input_facts) == versions.input_digest
}

fn assemble(
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
) -> Result<Vec<NextFactRow>, NextFactsError> {
    let evidence = evidence_index(input);
    let mut index = Index {
        rows: BTreeMap::new(),
        check_refs: 0,
    };
    let variants = snapshot.map(variant_index).unwrap_or_default();
    if let Some(snapshot) = snapshot {
        for check in &snapshot.content.validation.checks {
            attach_check(input, &variants, check, &evidence, &mut index)?;
        }
    }
    for path in supported_paths(input) {
        let Some(observed) = observe(input, &variants, &path, &evidence) else {
            continue;
        };
        if !matches!(
            observed.gap,
            FactGap::MissingNominal
                | FactGap::MissingBound
                | FactGap::MissingEvidence
                | FactGap::Conflicting
        ) {
            continue;
        }
        let field = field_ref(&observed.entity, &path);
        let Some(key) = fact_key(&field) else {
            continue;
        };
        index.touch(&key)?;
        let row = index.rows.get_mut(&key).expect("row inserted");
        row.fields.insert(field);
        row.gap = Some(prefer_gap(row.gap, observed.gap));
        row.hint = Some(match row.hint {
            Some(hint) if hint < observed.priority => hint,
            _ => observed.priority,
        });
        row.mutable = observed.mutable;
        row.routed = true;
    }
    Ok(index.into_rows())
}

fn variant_index(snapshot: &PlanSnapshot) -> BTreeMap<&str, &ProductVariant> {
    snapshot
        .content
        .referenced_catalog
        .variants
        .iter()
        .map(|variant| (variant.id.as_str(), variant))
        .collect()
}

fn attach_check(
    input: &ProjectInput,
    variants: &BTreeMap<&str, &ProductVariant>,
    check: &ConstraintCheck,
    evidence: &BTreeSet<&str>,
    index: &mut Index,
) -> Result<(), NextFactsError> {
    let Some(class) = classify_check(
        check.kind.clone(),
        check.status.clone(),
        &check.reason_code,
        check.blocking,
    ) else {
        return Ok(());
    };
    let refs = check_field_refs(check, &input.space.id);
    let mut attached = false;
    for field in refs {
        let observed = observe(input, variants, &field.field_path, evidence);
        let gap = observed.as_ref().map(|item| item.gap);
        let keep = match gap {
            // Unknown checks do not merge into a fact that is already complete.
            // A non-blocking failure, a hard repair, a conflict, or an
            // unsupported input still names that fact.
            Some(FactGap::Complete) | Some(FactGap::NotApplicable) => {
                class.priority == CompletionPriority::SoftOrUnsupported
                    || matches!(
                        class.need,
                        Some(
                            CompletionNeed::RepairKnownFailure
                                | CompletionNeed::ConflictingEvidence
                                | CompletionNeed::UnsupportedInput
                        )
                    )
            }
            _ => true,
        };
        if !keep {
            continue;
        }
        let Some(key) = fact_key(&field) else {
            continue;
        };
        index.touch(&key)?;
        index.add_check(&key, check, class)?;
        let row = index.rows.get_mut(&key).expect("row inserted");
        row.fields.insert(field);
        if let Some(gap) = gap {
            row.gap = Some(prefer_gap(row.gap, gap));
        }
        if let Some(observed) = observed {
            row.mutable = observed.mutable;
            row.routed = true;
            // A complete fact does not contribute a measurement priority. The
            // check class (soft, repair, unsupported) stays as attached.
            if matches!(
                observed.gap,
                FactGap::MissingNominal
                    | FactGap::MissingBound
                    | FactGap::MissingEvidence
                    | FactGap::Conflicting
                    | FactGap::Unreadable
            ) {
                row.hint = Some(match row.hint {
                    Some(hint) if hint < observed.priority => hint,
                    _ => observed.priority,
                });
            }
        }
        attached = true;
    }
    if attached {
        return Ok(());
    }
    let entity = check
        .subject_ids
        .first()
        .cloned()
        .unwrap_or_else(|| check.id.clone());
    let key = completion_fact_key(entity.as_str(), "unreferenced")
        .map_err(|_| NextFactsError::LimitExceeded)?;
    let text_key = format!("{key}:{}", check.id.as_str());
    if text_key.len() > 320 {
        return Err(NextFactsError::LimitExceeded);
    }
    index.touch(&text_key)?;
    index.add_check(&text_key, check, class)?;
    Ok(())
}

impl Index {
    fn touch(&mut self, key: &str) -> Result<(), NextFactsError> {
        if self.rows.contains_key(key) {
            return Ok(());
        }
        if self.rows.len() >= COMPLETION_MAX_FACT_ROWS {
            return Err(NextFactsError::LimitExceeded);
        }
        self.rows.insert(
            key.to_owned(),
            RowAcc {
                fields: BTreeSet::new(),
                checks: BTreeMap::new(),
                gap: None,
                mutable: false,
                routed: false,
                hint: None,
            },
        );
        Ok(())
    }

    fn add_check(
        &mut self,
        key: &str,
        check: &ConstraintCheck,
        class: CheckCompletionClass,
    ) -> Result<(), NextFactsError> {
        let row = self.rows.get_mut(key).expect("row inserted");
        let id = check.id.as_str();
        if row.checks.contains_key(id) {
            return Ok(());
        }
        if self.check_refs >= COMPLETION_MAX_CHECK_REFS {
            return Err(NextFactsError::LimitExceeded);
        }
        self.check_refs += 1;
        row.checks.insert(
            id.to_owned(),
            CheckLink {
                id: check.id.clone(),
                reason: check.reason_code.clone(),
                class,
            },
        );
        let hint = class.priority;
        row.hint = Some(match row.hint {
            Some(current) if current < hint => current,
            _ => hint,
        });
        Ok(())
    }

    fn into_rows(self) -> Vec<NextFactRow> {
        self.rows
            .into_iter()
            .map(|(fact_key, row)| {
                let need = resolve_need(&row);
                let priority = resolve_priority(&row);
                let has_field = !row.fields.is_empty();
                let field_refs: Vec<FieldRef> = row.fields.iter().cloned().collect();
                let mut check_ids: Vec<Id> =
                    row.checks.values().map(|link| link.id.clone()).collect();
                check_ids.sort();
                let reason_codes: Vec<String> = row
                    .checks
                    .values()
                    .map(|link| link.reason.clone())
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect();
                NextFactRow {
                    fact_key,
                    target_refs: field_refs.clone(),
                    field_refs,
                    need_kind: need,
                    related_check_count: u32::try_from(check_ids.len()).unwrap_or(u32::MAX),
                    check_ids,
                    reason_codes,
                    priority_class: priority,
                    resolution_actions: actions(need, priority, row.mutable, row.routed, has_field),
                }
            })
            .collect()
    }
}

fn resolve_priority(row: &RowAcc) -> CompletionPriority {
    if row.gap == Some(FactGap::Conflicting)
        || row
            .checks
            .values()
            .any(|link| link.class.need == Some(CompletionNeed::ConflictingEvidence))
        || row
            .checks
            .values()
            .any(|link| link.class.need == Some(CompletionNeed::RepairKnownFailure))
    {
        return CompletionPriority::RepairKnownFailure;
    }
    // An unsupported input stays in the soft class even when the same fact is
    // also missing a measurement. Measuring it is not the resolution.
    if row
        .checks
        .values()
        .any(|link| link.class.need == Some(CompletionNeed::UnsupportedInput))
    {
        return CompletionPriority::SoftOrUnsupported;
    }
    row.hint
        .unwrap_or(CompletionPriority::RequiredPhysicalUnknown)
}

fn resolve_need(row: &RowAcc) -> CompletionNeed {
    if row
        .checks
        .values()
        .any(|link| link.class.need == Some(CompletionNeed::ConflictingEvidence))
        || row.gap == Some(FactGap::Conflicting)
    {
        return CompletionNeed::ConflictingEvidence;
    }
    if row
        .checks
        .values()
        .any(|link| link.class.need == Some(CompletionNeed::RepairKnownFailure))
    {
        return CompletionNeed::RepairKnownFailure;
    }
    if row
        .checks
        .values()
        .any(|link| link.class.need == Some(CompletionNeed::UnsupportedInput))
    {
        return CompletionNeed::UnsupportedInput;
    }
    match row.gap {
        Some(FactGap::MissingBound) => CompletionNeed::MissingBound,
        Some(FactGap::MissingEvidence) => CompletionNeed::MissingEvidence,
        Some(FactGap::Conflicting) => CompletionNeed::ConflictingEvidence,
        Some(FactGap::MissingNominal) | Some(FactGap::Unreadable) | None => {
            CompletionNeed::MissingNominal
        }
        // The fact is already filled. A remaining non-blocking failure is a
        // known issue, not a request for a new nominal.
        Some(FactGap::Complete) | Some(FactGap::NotApplicable) => {
            if row.checks.values().any(|link| {
                link.class.priority == CompletionPriority::SoftOrUnsupported
                    && link.class.need != Some(CompletionNeed::UnsupportedInput)
            }) {
                CompletionNeed::RepairKnownFailure
            } else {
                CompletionNeed::MissingNominal
            }
        }
    }
}

fn actions(
    need: CompletionNeed,
    priority: CompletionPriority,
    mutable: bool,
    routed: bool,
    has_field: bool,
) -> Vec<ResolutionAction> {
    if !has_field {
        return match need {
            CompletionNeed::UnsupportedInput => vec![ResolutionAction::RequestSupportedScope],
            CompletionNeed::RepairKnownFailure | CompletionNeed::ConflictingEvidence => {
                vec![ResolutionAction::Remeasure]
            }
            _ => vec![],
        };
    }
    if !routed {
        return vec![ResolutionAction::RequestSupportedScope];
    }
    if !mutable {
        return vec![ResolutionAction::InspectCatalogSource];
    }
    // Soft and unsupported rows point at scope, not at a measurement that
    // would be presented as clearing the check.
    if need == CompletionNeed::UnsupportedInput || priority == CompletionPriority::SoftOrUnsupported
    {
        return vec![ResolutionAction::RequestSupportedScope];
    }
    match need {
        CompletionNeed::RepairKnownFailure | CompletionNeed::ConflictingEvidence => {
            vec![ResolutionAction::Remeasure]
        }
        _ => vec![ResolutionAction::EditSupportedField],
    }
}

fn prefer_gap(current: Option<FactGap>, next: FactGap) -> FactGap {
    match (current, next) {
        (_, FactGap::Conflicting) | (Some(FactGap::Conflicting), _) => FactGap::Conflicting,
        (_, FactGap::MissingNominal) | (Some(FactGap::MissingNominal), _) => {
            FactGap::MissingNominal
        }
        (_, FactGap::MissingBound) | (Some(FactGap::MissingBound), _) => FactGap::MissingBound,
        (_, FactGap::MissingEvidence) | (Some(FactGap::MissingEvidence), _) => {
            FactGap::MissingEvidence
        }
        (Some(current), _) => current,
        (None, next) => next,
    }
}

fn supported_paths(input: &ProjectInput) -> Vec<String> {
    let mut paths: Vec<String> = SPACE_PATHS.iter().map(|path| (*path).to_owned()).collect();
    for item in &input.items {
        let id = item.id.as_str();
        for suffix in [
            "dimensions.envelope.width",
            "dimensions.envelope.depth",
            "dimensions.envelope.height",
            "quantity",
            "massEach",
            "requirement.handling.left",
            "requirement.handling.right",
            "requirement.handling.top",
            "requirement.handling.pullExtraDepth",
            "requirement.handling.liftAboveRim",
        ] {
            paths.push(format!("items.{id}.{suffix}"));
        }
    }
    for obstacle in &input.space.obstacles {
        let id = obstacle.id.as_str();
        for suffix in [
            "bounds.minX",
            "bounds.minY",
            "bounds.minZ",
            "bounds.extent.width",
            "bounds.extent.depth",
            "bounds.extent.height",
        ] {
            paths.push(format!("space.obstacles.{id}.{suffix}"));
        }
    }
    for owned in &input.owned_containers {
        let id = owned.id.as_str();
        paths.push(format!("ownedContainers.{id}.quantityOwned"));
        paths.push(format!("ownedContainers.{id}.quantityAvailable"));
        paths.push(format!(
            "ownedContainers.{id}.physical.dimensions.outer.width"
        ));
        paths.push(format!("ownedContainers.{id}.physical.mass"));
    }
    paths
}

fn evidence_index(input: &ProjectInput) -> BTreeSet<&str> {
    input.evidence.iter().map(|item| item.id.as_str()).collect()
}

fn observe(
    input: &ProjectInput,
    variants: &BTreeMap<&str, &ProductVariant>,
    path: &str,
    evidence: &BTreeSet<&str>,
) -> Option<Observation> {
    if path == "space.staging.baseSupport" {
        return Some(Observation {
            gap: gap_fact(&input.space.staging.base_support, evidence),
            mutable: true,
            priority: CompletionPriority::RequiredPhysicalUnknown,
            entity: input.space.id.clone(),
        });
    }
    let route = route_measurement_field(path)?;
    let entity = entity_of(&route.entity, &input.space.id);
    if !route.mutable {
        if let RoutedEntity::OwnedContainer { id } = &route.entity {
            let owned = input.owned_containers.iter().find(|item| &item.id == id)?;
            return Some(Observation {
                gap: owned_gap(owned, path, evidence),
                mutable: false,
                priority: priority_for_kind(route.kind),
                entity,
            });
        }
        return Some(Observation {
            gap: variant_gap(variants, path, evidence),
            mutable: false,
            priority: priority_for_kind(route.kind),
            entity,
        });
    }
    let gap = match measurement::load_group(input, &route) {
        Ok(GroupScalar::Length(fact)) => gap_measurement(&fact, evidence),
        Ok(GroupScalar::Offset(fact)) => gap_offset(&fact, evidence),
        Ok(GroupScalar::Clearance(fact)) => gap_fact(&fact, evidence),
        Ok(GroupScalar::Quantity(fact)) => gap_fact(&fact, evidence),
        Ok(GroupScalar::Mass(fact)) => gap_fact(&fact, evidence),
        Ok(GroupScalar::Unavailable(_)) => FactGap::MissingNominal,
        Err(_) => return None,
    };
    Some(Observation {
        gap,
        mutable: true,
        priority: priority_for_kind(route.kind),
        entity,
    })
}

fn variant_gap(
    variants: &BTreeMap<&str, &ProductVariant>,
    path: &str,
    evidence: &BTreeSet<&str>,
) -> FactGap {
    let segments: Vec<&str> = path.split('.').collect();
    let ["variants", id, rest @ ..] = segments.as_slice() else {
        return FactGap::Unreadable;
    };
    let Some(variant) = variants.get(id).copied() else {
        return FactGap::Unreadable;
    };
    match rest {
        ["dimensions", "outer", axis] => {
            gap_measurement(&axis_length(&variant.dimensions.outer, axis), evidence)
        }
        ["dimensions", "inner", axis] => {
            gap_measurement(&axis_length(&variant.dimensions.inner, axis), evidence)
        }
        ["mass"] => gap_fact(&variant.mass, evidence),
        _ => FactGap::Unreadable,
    }
}

fn owned_gap(
    owned: &crate::catalog::OwnedContainer,
    path: &str,
    evidence: &BTreeSet<&str>,
) -> FactGap {
    let segments: Vec<&str> = path.split('.').collect();
    match segments.as_slice() {
        [_, _, "quantityOwned"] => gap_fact(&owned.quantity_owned, evidence),
        [_, _, "quantityAvailable"] => gap_fact(&owned.quantity_available, evidence),
        [_, _, "physical", "dimensions", "outer", axis] => gap_measurement(
            &axis_length(&owned.physical.dimensions.outer, axis),
            evidence,
        ),
        [_, _, "physical", "mass"] => gap_fact(&owned.physical.mass, evidence),
        _ => FactGap::Unreadable,
    }
}

fn entity_of(entity: &RoutedEntity, space_id: &Id) -> Id {
    match entity {
        RoutedEntity::Space {} => space_id.clone(),
        RoutedEntity::Item { id }
        | RoutedEntity::Obstacle { id }
        | RoutedEntity::OwnedContainer { id }
        | RoutedEntity::CatalogVariant { id }
        | RoutedEntity::CatalogOffer { id } => id.clone(),
    }
}

fn priority_for_kind(kind: MeasurementFieldKind) -> CompletionPriority {
    match kind {
        MeasurementFieldKind::Quantity => CompletionPriority::QuantityCompleteness,
        MeasurementFieldKind::MoneyKrw | MeasurementFieldKind::PackQuantity => {
            CompletionPriority::ProcurementUnknown
        }
        _ => CompletionPriority::RequiredPhysicalUnknown,
    }
}

fn axis_length(dimensions: &Dimensions, axis: &str) -> Measurement {
    match axis {
        "depth" => dimensions.depth.clone(),
        "height" => dimensions.height.clone(),
        _ => dimensions.width.clone(),
    }
}

fn evidence_present(provenance: &Provenance, evidence: &BTreeSet<&str>) -> bool {
    !provenance.evidence_ids.is_empty()
        && provenance
            .evidence_ids
            .iter()
            .all(|id| evidence.contains(id.as_str()))
}

fn gap_measurement(fact: &Measurement, evidence: &BTreeSet<&str>) -> FactGap {
    match fact {
        Fact::NotApplicable { .. } => FactGap::NotApplicable,
        Fact::Unknown {
            reason: UnknownReason::ConflictingSources,
        } => FactGap::Conflicting,
        Fact::Unknown { .. } => FactGap::MissingNominal,
        Fact::Known { value, provenance } => {
            if matches!(value.uncertainty, Uncertainty::Unknown {}) {
                FactGap::MissingBound
            } else if evidence_present(provenance, evidence) {
                FactGap::Complete
            } else {
                FactGap::MissingEvidence
            }
        }
    }
}

fn gap_offset(fact: &Fact<MeasuredOffset>, evidence: &BTreeSet<&str>) -> FactGap {
    match fact {
        Fact::NotApplicable { .. } => FactGap::NotApplicable,
        Fact::Unknown {
            reason: UnknownReason::ConflictingSources,
        } => FactGap::Conflicting,
        Fact::Unknown { .. } => FactGap::MissingNominal,
        Fact::Known { value, provenance } => {
            if matches!(value.uncertainty, Uncertainty::Unknown {}) {
                FactGap::MissingBound
            } else if evidence_present(provenance, evidence) {
                FactGap::Complete
            } else {
                FactGap::MissingEvidence
            }
        }
    }
}

fn gap_fact<T>(fact: &Fact<T>, evidence: &BTreeSet<&str>) -> FactGap {
    match fact {
        Fact::NotApplicable { .. } => FactGap::NotApplicable,
        Fact::Unknown {
            reason: UnknownReason::ConflictingSources,
        } => FactGap::Conflicting,
        Fact::Unknown { .. } => FactGap::MissingNominal,
        Fact::Known { provenance, .. } => {
            if evidence_present(provenance, evidence) {
                FactGap::Complete
            } else {
                FactGap::MissingEvidence
            }
        }
    }
}

fn field_ref(entity: &Id, path: &str) -> FieldRef {
    FieldRef {
        entity_id: entity.clone(),
        field_path: path.to_owned(),
    }
}

fn fact_key(field: &FieldRef) -> Option<String> {
    completion_fact_key(field.entity_id.as_str(), &field.field_path).ok()
}

fn check_field_refs(check: &ConstraintCheck, space_id: &Id) -> Vec<FieldRef> {
    let mut refs = Vec::new();
    for field in &check.evidence_refs {
        refs.push(field.clone());
    }
    for measurement in &check.measurements {
        if let Some(field) = bind_path(&measurement.field_path, space_id) {
            refs.push(field);
        }
    }
    for remediation in &check.remediation {
        for path in &remediation.field_paths {
            if let Some(field) = bind_path(path, space_id) {
                refs.push(field);
            }
        }
    }
    refs.sort();
    refs.dedup();
    refs
}

fn bind_path(path: &str, space_id: &Id) -> Option<FieldRef> {
    if path == "space.staging.baseSupport" {
        return Some(field_ref(space_id, path));
    }
    let route = route_measurement_field(path)?;
    Some(field_ref(&entity_of(&route.entity, space_id), path))
}
