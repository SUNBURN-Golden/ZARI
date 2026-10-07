//! Candidate finalization (DOMAIN_MODEL §6–7): after independent validation
//! runs, this module derives the BOM, cost summary, ordered action DAG and
//! the immutable `PlanSnapshot` whose identity is the canonical content
//! digest. Engine-owned compile versions are stamped by the caller from the
//! activated context; caller-supplied pass flags or identities do not exist.
//!
//! A candidate with a blocking known failure yields a report but no snapshot:
//! the trust boundary does not publish a plan that provably violates a known
//! fact. Conditional plans do finalize — their report carries every unknown
//! check that gates confirmation.

use crate::canonical::{self, CatalogContent};
use crate::catalog::*;
use crate::facts::*;
use crate::input::*;
use crate::plan::*;
use crate::scalars::*;
use crate::validate;
use crate::validator::{self, CostAccumulator};

use std::collections::{BTreeMap, BTreeSet};

/// The outcome of evaluating one proposal through the trust boundary.
pub struct CandidateEvaluation {
    /// Present only for structurally valid proposals.
    pub report: Option<ValidationReport>,
    /// The finalized snapshot; absent when the proposal is structurally
    /// invalid or carries a blocking known failure.
    pub snapshot: Option<PlanSnapshot>,
    /// Structural diagnostics from layout/strategy/snapshot validation.
    pub diagnostics: Vec<Diagnostic>,
}

fn bounded_id(raw: &str) -> Id {
    bounded_step_id(raw)
}

/// Bounded deterministic id for one derived step string. Shared by the
/// action producer and the spatial projector so both derive byte-identical
/// opaque ids from the same inputs (SPATIAL_VIEW_CONTRACT §5); the projector
/// never parses a produced id back into parts.
pub fn bounded_step_id(raw: &str) -> Id {
    if raw.len() <= 96 {
        return Id::new(raw).expect("bounded id");
    }
    // Deterministic truncation with a content hash tail keeps ids unique.
    let digest = canonical::content_digest(&raw);
    Id::new(&format!("{}:{}", &raw[..79], &digest.as_str()[..16])).expect("bounded id")
}

/// The producer's exact transfer-step id for one contained assignment.
pub fn transfer_step_id(item_id: &Id, unit_ordinal: u32) -> Id {
    bounded_step_id(&format!(
        "act:transfer:{}:{}",
        item_id.as_str(),
        unit_ordinal
    ))
}

/// The producer's exact resolve-step id for one provisional assignment.
pub fn resolve_step_id(item_id: &Id, unit_ordinal: u32) -> Id {
    bounded_step_id(&format!(
        "act:resolve:{}:{}",
        item_id.as_str(),
        unit_ordinal
    ))
}

fn derived_fact<T>(rule: &str, value: T) -> Fact<T> {
    Fact::Known {
        value,
        provenance: Provenance {
            origin: MeasurementOrigin::Derived,
            verification: VerificationStatus::Confirmed,
            evidence_ids: vec![],
            rule_ids: vec![rule.to_owned()],
            input_refs: vec![],
            observed_at: None,
        },
    }
}
fn unknown_fact<T>() -> Fact<T> {
    Fact::Unknown {
        reason: UnknownReason::NotProvided,
    }
}
fn not_applicable_fact<T>(reason_code: &str) -> Fact<T> {
    Fact::NotApplicable {
        reason_code: reason_code.into(),
    }
}
fn fact_or_unknown<T>(rule: &str, value: Option<T>) -> Fact<T> {
    value.map_or_else(unknown_fact, |v| derived_fact(rule, v))
}

/// Collect every `evidenceIds` entry reachable inside a serialized value.
fn collect_evidence_ids(value: &serde_json::Value, out: &mut std::collections::BTreeSet<Id>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::Array(ids)) = map.get("evidenceIds") {
                for id in ids.iter().filter_map(|i| i.as_str()) {
                    if let Ok(id) = Id::new(id) {
                        out.insert(id);
                    }
                }
            }
            for child in map.values() {
                collect_evidence_ids(child, out);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                collect_evidence_ids(child, out);
            }
        }
        _ => {}
    }
}

/// The catalog rows a snapshot must retain: used variants, selected offers,
/// their products and evidence, closed over compatibility and bundle
/// references so the retained subset stays self-consistent.
fn referenced_subset(
    catalog: &CatalogContent,
    input: &ProjectInput,
    layout: &CandidateLayout,
    offers: &BTreeMap<&str, &Offer>,
) -> CatalogEvidenceSubset {
    let variants: BTreeMap<&str, &ProductVariant> = catalog
        .variants
        .iter()
        .map(|v| (v.id.as_str(), v))
        .collect();
    let mut used: std::collections::BTreeSet<&str> = std::collections::BTreeSet::new();
    for placement in &layout.placements {
        match &placement.subject {
            PlacementSubject::NewContainer { variant_id, .. } => {
                used.insert(variant_id.as_str());
            }
            PlacementSubject::OwnedContainer { owned_id, .. } => {
                if let Some(reference) = input
                    .owned_containers
                    .iter()
                    .find(|o| &o.id == owned_id)
                    .and_then(|o| o.variant_ref.as_ref())
                {
                    used.insert(reference.variant_id.as_str());
                }
            }
            PlacementSubject::DirectItem { .. } => {}
        }
    }
    // Close over compatibility lists and bundle components.
    loop {
        let before = used.len();
        let mut additions = vec![];
        for id in &used {
            if let Some(variant) = variants.get(id)
                && let Some(compat) = variant.compatibility.value()
            {
                additions.extend(compat.iter().map(|i| i.as_str()));
            }
        }
        for offer in catalog.offers.iter() {
            if used.contains(offer.variant_id.as_str()) {
                additions.extend(
                    offer
                        .bundle_components
                        .iter()
                        .map(|c| c.variant_id.as_str()),
                );
            }
        }
        for id in additions {
            if variants.contains_key(id) {
                used.insert(id);
            }
        }
        if used.len() == before {
            break;
        }
    }
    let selected_offers: std::collections::BTreeSet<&str> = layout
        .purchase_selections
        .iter()
        .filter_map(|s| match &s.offer {
            OfferSelection::Selected { offer_id } => Some(offer_id.as_str()),
            OfferSelection::Unresolved { .. } => None,
        })
        .collect();
    let products: Vec<&Product> = catalog
        .products
        .iter()
        .filter(|p| {
            used.iter().any(|v| {
                variants
                    .get(v)
                    .is_some_and(|variant| variant.product_id == p.id)
            })
        })
        .collect();
    let variants_out: Vec<ProductVariant> = used
        .iter()
        .filter_map(|id| variants.get(id).copied())
        .cloned()
        .collect();
    let offers_out: Vec<Offer> = selected_offers
        .iter()
        .filter_map(|id| offers.get(id).copied())
        .cloned()
        .collect();
    let mut evidence_ids = std::collections::BTreeSet::new();
    collect_evidence_ids(
        &serde_json::to_value((&products, &variants_out, &offers_out)).expect("serializes"),
        &mut evidence_ids,
    );
    CatalogEvidenceSubset {
        products: products.into_iter().cloned().collect(),
        variants: variants_out,
        offers: offers_out,
        evidence: catalog
            .evidence
            .iter()
            .filter(|e| evidence_ids.contains(&e.id))
            .cloned()
            .collect(),
    }
}

/// Evaluate a proposal end to end: structural validation, independent
/// physical/commercial validation, then deterministic finalization.
pub fn evaluate_candidate(
    input: &ProjectInput,
    catalog: &CatalogContent,
    proposal: &CandidateProposal,
    versions: CompileVersions,
    scope: SearchScope,
) -> CandidateEvaluation {
    let variants: BTreeMap<&str, &ProductVariant> = catalog
        .variants
        .iter()
        .map(|v| (v.id.as_str(), v))
        .collect();
    let offers: BTreeMap<&str, &Offer> =
        catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect();
    let mut diagnostics = validate::validate_layout(&proposal.layout, input, &variants, &offers);
    diagnostics.extend(validate::validate_strategy(&proposal.strategy, input));
    if !diagnostics.is_empty() {
        return CandidateEvaluation {
            report: None,
            snapshot: None,
            diagnostics,
        };
    }
    let validation = validator::validate_candidate(input, catalog, &proposal.layout);
    if validator::has_blocking_failure(&validation.report) {
        return CandidateEvaluation {
            report: Some(validation.report),
            snapshot: None,
            diagnostics,
        };
    }
    let layout = &proposal.layout;
    let bom = build_bom(layout, input, &variants, &offers);
    let cost_summary = cost_summary(layout, &offers);
    let actions = build_actions(layout, &validation);
    let referenced_catalog = referenced_subset(catalog, input, layout, &offers);
    let content = SnapshotContent {
        creation: proposal.creation.clone(),
        versions,
        input_facts: input.clone(),
        referenced_catalog,
        strategy: proposal.strategy.clone(),
        placements: layout.placements.clone(),
        assignments: layout.assignments.clone(),
        unassigned: layout.unassigned.clone(),
        purchase_selections: layout.purchase_selections.clone(),
        validation: validation.report,
        bom,
        cost_summary,
        actions,
        scope,
    };
    let snapshot = PlanSnapshot {
        plan_snapshot_id: canonical::snapshot_digest(&content),
        content,
    };
    // Defensive re-validation of the constructed record: an engine bug must
    // surface as diagnostics instead of a malformed immutable snapshot.
    let snapshot_diagnostics = validate::validate_snapshot(&snapshot);
    if !snapshot_diagnostics.is_empty() {
        diagnostics.extend(snapshot_diagnostics);
        return CandidateEvaluation {
            report: Some(snapshot.content.validation),
            snapshot: None,
            diagnostics,
        };
    }
    CandidateEvaluation {
        report: Some(snapshot.content.validation.clone()),
        snapshot: Some(snapshot),
        diagnostics,
    }
}

/// Deterministic BOM: one line per owned container id and per purchased
/// variant, in id order. Pack surplus is exact integer arithmetic over the
/// selected offer's pack quantity.
fn build_bom(
    layout: &CandidateLayout,
    input: &ProjectInput,
    _variants: &BTreeMap<&str, &ProductVariant>,
    offers: &BTreeMap<&str, &Offer>,
) -> Vec<BOMLine> {
    let mut lines = vec![];
    // Owned reuse lines, grouped by owned container id.
    let mut owned_placements: BTreeMap<&str, Vec<Id>> = BTreeMap::new();
    for placement in &layout.placements {
        if let PlacementSubject::OwnedContainer { owned_id, .. } = &placement.subject {
            owned_placements
                .entry(owned_id.as_str())
                .or_default()
                .push(placement.id.clone());
        }
    }
    for (owned_id, placements) in owned_placements {
        let used = placements.len() as u32;
        lines.push(BOMLine {
            id: bounded_id(&format!("bom:owned:{owned_id}")),
            variant_id: input
                .owned_containers
                .iter()
                .find(|o| o.id.as_str() == owned_id)
                .and_then(|o| o.variant_ref.as_ref())
                .map(|r| r.variant_id.clone()),
            owned_id: Some(Id::new(owned_id).expect("validated id")),
            placement_ids: placements,
            offer_id: None,
            physical_needed: Quantity::new(used).expect("bounded"),
            reused: Quantity::new(used).expect("bounded"),
            new_units_needed: Quantity::new(0).expect("bounded"),
            pack_quantity: not_applicable_fact("owned_reuse"),
            packs_to_order: not_applicable_fact("owned_reuse"),
            supplied: derived_fact("validator:bom", UnitCount::new(used).expect("bounded")),
            surplus: derived_fact("validator:bom", UnitCount::new(0).expect("bounded")),
            product_subtotal: not_applicable_fact("owned_reuse"),
            evidence_refs: vec![],
        });
    }
    // New purchase lines, grouped by variant id.
    let mut variant_placements: BTreeMap<&str, Vec<Id>> = BTreeMap::new();
    for placement in &layout.placements {
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
            variant_placements
                .entry(variant_id.as_str())
                .or_default()
                .push(placement.id.clone());
        }
    }
    for (variant_id, placements) in variant_placements {
        let needed = placements.len() as u32;
        let representative = &placements[0];
        let selection = layout
            .purchase_selections
            .iter()
            .find(|s| &s.placement_id == representative);
        let offer = selection.and_then(|s| match &s.offer {
            OfferSelection::Selected { offer_id } => offers.get(offer_id.as_str()).copied(),
            OfferSelection::Unresolved { .. } => None,
        });
        let usable = offer.filter(|o| o.bundle_components.is_empty());
        let pack_quantity = usable
            .map(|o| o.pack_quantity.clone())
            .unwrap_or_else(unknown_fact);
        let packs = usable.and_then(|o| o.pack_quantity.value().map(|p| needed.div_ceil(p.get())));
        let supplied =
            usable.and_then(|o| packs.and_then(|p| p.checked_mul(o.pack_quantity.value()?.get())));
        let surplus = supplied.map(|s| s - needed);
        let subtotal = usable
            .and_then(|o| packs.and_then(|p| (p as u64).checked_mul(o.pack_price.value()?.get())));
        lines.push(BOMLine {
            id: bounded_id(&format!("bom:new:{variant_id}")),
            variant_id: Some(Id::new(variant_id).expect("validated id")),
            owned_id: None,
            placement_ids: placements,
            offer_id: offer.map(|o| o.id.clone()),
            physical_needed: Quantity::new(needed).expect("bounded"),
            reused: Quantity::new(0).expect("bounded"),
            new_units_needed: Quantity::new(needed).expect("bounded"),
            pack_quantity,
            packs_to_order: fact_or_unknown(
                "validator:bom",
                packs.and_then(|p| Quantity::new(p).ok()),
            ),
            supplied: fact_or_unknown(
                "validator:bom",
                supplied.and_then(|s| UnitCount::new(s).ok()),
            ),
            surplus: fact_or_unknown(
                "validator:bom",
                surplus.and_then(|s| UnitCount::new(s).ok()),
            ),
            product_subtotal: fact_or_unknown(
                "validator:bom",
                subtotal.and_then(|s| MoneyKrw::new(s).ok()),
            ),
            evidence_refs: vec![],
        });
    }
    lines.sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
    lines
}

/// Cost summary over the same `CostAccumulator` arithmetic the validator's
/// budget checks use, so the two projections never disagree.
fn cost_summary(layout: &CandidateLayout, offers: &BTreeMap<&str, &Offer>) -> CostSummary {
    let mut by_variant: BTreeMap<&str, Vec<&Placement>> = BTreeMap::new();
    for placement in &layout.placements {
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
            by_variant
                .entry(variant_id.as_str())
                .or_default()
                .push(placement);
        }
    }
    if by_variant.is_empty() {
        return CostSummary {
            product_subtotal: not_applicable_fact("no_purchases"),
            shipping_total: not_applicable_fact("no_purchases"),
            grand_total: not_applicable_fact("no_purchases"),
        };
    }
    let mut cost = CostAccumulator::default();
    for placements in by_variant.values() {
        let selection = layout
            .purchase_selections
            .iter()
            .find(|s| s.placement_id == placements[0].id);
        let offer = selection.and_then(|s| match &s.offer {
            OfferSelection::Selected { offer_id } => offers.get(offer_id.as_str()).copied(),
            OfferSelection::Unresolved { .. } => None,
        });
        cost.add_line(offer, placements.len() as u64);
    }
    CostSummary {
        product_subtotal: fact_or_unknown(
            "validator:cost",
            cost.product_subtotal().and_then(|v| MoneyKrw::new(v).ok()),
        ),
        shipping_total: fact_or_unknown(
            "validator:cost",
            cost.shipping_total().and_then(|v| MoneyKrw::new(v).ok()),
        ),
        grand_total: fact_or_unknown(
            "validator:cost",
            cost.grand_total().and_then(|v| MoneyKrw::new(v).ok()),
        ),
    }
}

/// SP-013 guide. Display order is Kahn, picking the byte-smallest ready step
/// id. Prerequisite lists are byte-sorted. `required_confirmations` stay
/// empty: user assertions are their own steps, not a second fact-confirmation
/// edge. `reason_ids` name structured checks and are never action ids.
pub fn assemble_action_guide(
    layout: &CandidateLayout,
    validation: &validator::CandidateValidation,
) -> Vec<ActionStep> {
    build_actions(layout, validation)
}

fn sorted_ids(mut ids: Vec<Id>) -> Vec<Id> {
    ids.sort_by(|a, b| a.as_str().cmp(b.as_str()));
    ids.dedup();
    ids
}

fn execution_unknown(check: &ConstraintCheck) -> bool {
    if check.id.as_str() == "chk:bg:soft" {
        return false;
    }
    match check.status {
        CheckStatus::Unknown => true,
        CheckStatus::Fail if check.blocking => true,
        _ => false,
    }
}

fn hits(check: &ConstraintCheck, id: &str) -> bool {
    check
        .subject_ids
        .iter()
        .any(|subject| subject.as_str() == id)
}

fn matching_reasons(
    checks: &[ConstraintCheck],
    mut keep: impl FnMut(&ConstraintCheck) -> bool,
) -> Vec<Id> {
    let ids: Vec<Id> = checks
        .iter()
        .filter(|check| execution_unknown(check) && keep(check))
        .map(|check| check.id.clone())
        .collect();
    sorted_ids(ids)
}

fn space_id_of(placement: &Placement) -> Option<&str> {
    match &placement.parent {
        ParentRef::Space { space_id } => Some(space_id.as_str()),
        ParentRef::Container { .. } => None,
    }
}

fn install_reasons(
    checks: &[ConstraintCheck],
    placement_id: &str,
    space_id: Option<&str>,
) -> Vec<Id> {
    matching_reasons(checks, |check| {
        let physical = matches!(
            check.kind,
            CheckKind::OuterGeometry
                | CheckKind::InstallationPath
                | CheckKind::SupportGeometry
                | CheckKind::Orientation
                | CheckKind::OperationalAccess
        ) && hits(check, placement_id);
        let staging_load = check.kind == CheckKind::SupportLoad && hits(check, placement_id);
        let floor_load = check.kind == CheckKind::SupportLoad
            && space_id.is_some_and(|space| hits(check, space));
        physical || staging_load || floor_load
    })
}

fn transfer_reasons(checks: &[ConstraintCheck], container_id: &str) -> Vec<Id> {
    matching_reasons(checks, |check| {
        hits(check, container_id)
            && matches!(
                check.kind,
                CheckKind::InnerCapacity | CheckKind::SupportLoad | CheckKind::SupportGeometry
            )
    })
}

fn commerce_reasons(checks: &[ConstraintCheck], variant_id: &str) -> Vec<Id> {
    matching_reasons(checks, |check| {
        hits(check, variant_id)
            && matches!(
                check.kind,
                CheckKind::Inventory | CheckKind::Price | CheckKind::Shipping
            )
    })
}

fn related_unknowns(checks: &[ConstraintCheck], subjects: &[Id]) -> Vec<Id> {
    matching_reasons(checks, |check| {
        check
            .subject_ids
            .iter()
            .any(|id| subjects.iter().any(|subject| subject == id))
    })
}

fn step(
    id: Id,
    kind: ActionKind,
    subjects: Vec<Id>,
    prerequisites: Vec<Id>,
    reasons: Vec<Id>,
) -> ActionStep {
    ActionStep {
        id,
        kind,
        subject_ids: sorted_ids(subjects),
        prerequisite_step_ids: sorted_ids(prerequisites),
        required_confirmations: vec![],
        reason_ids: sorted_ids(reasons),
    }
}

/// Kahn display order. A cycle leaves the remaining steps in id order so
/// structural validation can reject the graph instead of dropping them.
fn display_order(actions: Vec<ActionStep>) -> Vec<ActionStep> {
    let mut by_id: BTreeMap<String, ActionStep> = BTreeMap::new();
    for action in actions {
        by_id.insert(action.id.as_str().to_owned(), action);
    }
    let mut indegree: BTreeMap<String, usize> = by_id.keys().map(|id| (id.clone(), 0)).collect();
    let mut dependents: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for action in by_id.values() {
        for pre in &action.prerequisite_step_ids {
            *indegree.entry(action.id.as_str().to_owned()).or_insert(0) += 1;
            dependents
                .entry(pre.as_str().to_owned())
                .or_default()
                .push(action.id.as_str().to_owned());
        }
    }
    let mut ready: BTreeSet<String> = indegree
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(id, _)| id.clone())
        .collect();
    let mut ordered = Vec::new();
    while let Some(id) = ready.iter().next().cloned() {
        ready.remove(&id);
        let Some(action) = by_id.remove(&id) else {
            continue;
        };
        if let Some(next) = dependents.get(&id) {
            for dependent in next {
                if let Some(degree) = indegree.get_mut(dependent) {
                    *degree = degree.saturating_sub(1);
                    if *degree == 0 {
                        ready.insert(dependent.clone());
                    }
                }
            }
        }
        ordered.push(action);
    }
    if !by_id.is_empty() {
        let mut rest: Vec<ActionStep> = by_id.into_values().collect();
        rest.sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
        ordered.extend(rest);
    }
    ordered
}

/// Load outside, then install the loaded container. Direct placements have
/// no transfer, acquire, or arrival. Owned ordinals are not purchase steps.
fn build_actions(
    layout: &CandidateLayout,
    validation: &validator::CandidateValidation,
) -> Vec<ActionStep> {
    let checks = &validation.report.checks;
    let mut actions = Vec::new();
    let mut clear_of: BTreeMap<String, Id> = BTreeMap::new();
    let mut spaces: Vec<String> = layout
        .placements
        .iter()
        .filter_map(space_id_of)
        .map(str::to_owned)
        .collect();
    spaces.sort();
    spaces.dedup();
    for space in &spaces {
        let id = bounded_id(&format!("act:clear:{space}"));
        clear_of.insert(space.clone(), id.clone());
        actions.push(step(
            id,
            ActionKind::ClearSpace,
            vec![Id::new(space).expect("space id")],
            vec![],
            vec![],
        ));
    }

    for assignment in &layout.assignments {
        if let ItemLocation::ProvisionalContainer {
            container_placement_id,
            ..
        } = &assignment.location
        {
            let subjects = vec![assignment.item_id.clone(), container_placement_id.clone()];
            actions.push(step(
                resolve_step_id(&assignment.item_id, assignment.unit_ordinal),
                ActionKind::ResolveCondition,
                subjects.clone(),
                vec![],
                related_unknowns(checks, &subjects),
            ));
        }
    }

    let mut offer_gate: BTreeMap<String, Id> = BTreeMap::new();
    let mut variant_placements: BTreeMap<&str, Vec<&Placement>> = BTreeMap::new();
    for placement in &layout.placements {
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
            variant_placements
                .entry(variant_id.as_str())
                .or_default()
                .push(placement);
        }
    }
    for (variant_id, placements) in &variant_placements {
        let selection = layout.purchase_selections.iter().find(|selection| {
            placements
                .iter()
                .any(|placement| placement.id == selection.placement_id)
        });
        let subjects: Vec<Id> = placements
            .iter()
            .map(|placement| placement.id.clone())
            .collect();
        match selection.map(|selection| &selection.offer) {
            Some(OfferSelection::Selected { offer_id }) => {
                let mut with_offer = subjects.clone();
                with_offer.push(offer_id.clone());
                let acquire_id = bounded_id(&format!("act:acquire:{variant_id}"));
                let arrive_id = bounded_id(&format!("act:arrive:{variant_id}"));
                actions.push(step(
                    acquire_id.clone(),
                    ActionKind::Acquire,
                    with_offer.clone(),
                    vec![],
                    commerce_reasons(checks, variant_id),
                ));
                actions.push(step(
                    arrive_id.clone(),
                    ActionKind::ConfirmArrival,
                    with_offer,
                    vec![acquire_id],
                    vec![],
                ));
                offer_gate.insert((*variant_id).to_owned(), arrive_id);
            }
            _ => {
                let resolve_id = bounded_id(&format!("act:resolve-offer:{variant_id}"));
                let mut reasons = commerce_reasons(checks, variant_id);
                reasons.extend(related_unknowns(checks, &subjects));
                actions.push(step(
                    resolve_id.clone(),
                    ActionKind::ResolveCondition,
                    subjects,
                    vec![],
                    reasons,
                ));
                offer_gate.insert((*variant_id).to_owned(), resolve_id);
            }
        }
    }

    let install_id = |pid: &str| bounded_id(&format!("act:install:{pid}"));
    let mut transfers_of: BTreeMap<String, Vec<Id>> = BTreeMap::new();
    for assignment in &layout.assignments {
        let ItemLocation::Contained {
            container_placement_id,
            ..
        } = &assignment.location
        else {
            continue;
        };
        let container = layout
            .placements
            .iter()
            .find(|placement| &placement.id == container_placement_id);
        let mut prerequisites = Vec::new();
        if let Some(space) = container.and_then(space_id_of)
            && let Some(clear) = clear_of.get(space)
        {
            prerequisites.push(clear.clone());
        }
        if let Some(PlacementSubject::NewContainer { variant_id, .. }) =
            container.map(|placement| &placement.subject)
            && let Some(gate) = offer_gate.get(variant_id.as_str())
        {
            prerequisites.push(gate.clone());
        }
        let id = transfer_step_id(&assignment.item_id, assignment.unit_ordinal);
        transfers_of
            .entry(container_placement_id.as_str().to_owned())
            .or_default()
            .push(id.clone());
        actions.push(step(
            id,
            ActionKind::TransferContents,
            vec![assignment.item_id.clone(), container_placement_id.clone()],
            prerequisites,
            transfer_reasons(checks, container_placement_id.as_str()),
        ));
    }

    let order: Vec<String> = if validation.install_order.is_empty() {
        let mut ids: Vec<String> = layout
            .placements
            .iter()
            .map(|placement| placement.id.as_str().to_owned())
            .collect();
        ids.sort();
        ids
    } else {
        validation
            .install_order
            .iter()
            .map(|id| id.as_str().to_owned())
            .collect()
    };
    for pid in &order {
        let placement = layout
            .placements
            .iter()
            .find(|placement| placement.id.as_str() == pid)
            .expect("order ids come from placements");
        let mut prerequisites: Vec<Id> = validation
            .predecessors
            .get(pid.as_str())
            .into_iter()
            .flatten()
            .map(|predecessor| install_id(predecessor))
            .collect();
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject
            && let Some(gate) = offer_gate.get(variant_id.as_str())
        {
            prerequisites.push(gate.clone());
        }
        if let Some(transfers) = transfers_of.get(pid.as_str()) {
            prerequisites.extend(transfers.iter().cloned());
        }
        if let Some(space) = space_id_of(placement)
            && let Some(clear) = clear_of.get(space)
        {
            prerequisites.push(clear.clone());
        }
        actions.push(step(
            install_id(pid),
            ActionKind::Install,
            vec![placement.id.clone()],
            prerequisites,
            install_reasons(checks, pid, space_id_of(placement)),
        ));
    }

    for entry in &layout.unassigned {
        actions.push(step(
            bounded_id(&format!("act:verify:{}", entry.item_id.as_str())),
            ActionKind::VerifyUnassigned,
            vec![entry.item_id.clone()],
            vec![],
            vec![],
        ));
    }
    display_order(actions)
}
