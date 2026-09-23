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

use std::collections::BTreeMap;

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
    if raw.len() <= 96 {
        return Id::new(raw).expect("bounded id");
    }
    // Deterministic truncation with a content hash tail keeps ids unique.
    let digest = canonical::content_digest(&raw);
    Id::new(&format!("{}:{}", &raw[..79], &digest.as_str()[..16])).expect("bounded id")
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

/// The deterministic action DAG: condition resolutions, purchases, the
/// validated install order, contents transfer, then unassigned review.
fn build_actions(
    layout: &CandidateLayout,
    validation: &validator::CandidateValidation,
) -> Vec<ActionStep> {
    let step =
        |id: String, kind: ActionKind, subjects: Vec<Id>, prerequisites: Vec<Id>| -> ActionStep {
            ActionStep {
                id: bounded_id(&id),
                kind,
                subject_ids: subjects,
                prerequisite_step_ids: prerequisites,
                required_confirmations: vec![],
                reason_ids: vec![],
            }
        };
    let mut actions = vec![];

    // Provisional contents and unresolved offers gate later steps.
    for assignment in &layout.assignments {
        if let ItemLocation::ProvisionalContainer {
            container_placement_id,
            ..
        } = &assignment.location
        {
            actions.push(step(
                format!(
                    "act:resolve:{}:{}",
                    assignment.item_id.as_str(),
                    assignment.unit_ordinal
                ),
                ActionKind::ResolveCondition,
                vec![assignment.item_id.clone(), container_placement_id.clone()],
                vec![],
            ));
        }
    }
    let mut offer_steps: BTreeMap<String, Id> = BTreeMap::new();
    let mut variant_placements: BTreeMap<&str, Vec<Id>> = BTreeMap::new();
    for placement in &layout.placements {
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
            variant_placements
                .entry(variant_id.as_str())
                .or_default()
                .push(placement.id.clone());
        }
    }
    for (variant_id, placements) in &variant_placements {
        let selection = layout
            .purchase_selections
            .iter()
            .find(|s| s.placement_id == placements[0]);
        match selection.map(|s| &s.offer) {
            Some(OfferSelection::Selected { offer_id }) => {
                let mut subjects = placements.clone();
                subjects.push(offer_id.clone());
                let acquire = step(
                    format!("act:acquire:{variant_id}"),
                    ActionKind::Acquire,
                    subjects.clone(),
                    vec![],
                );
                let arrive = step(
                    format!("act:arrive:{variant_id}"),
                    ActionKind::ConfirmArrival,
                    subjects,
                    vec![acquire.id.clone()],
                );
                offer_steps.insert(variant_id.to_string(), arrive.id.clone());
                actions.push(acquire);
                actions.push(arrive);
            }
            _ => {
                let resolve = step(
                    format!("act:resolve-offer:{variant_id}"),
                    ActionKind::ResolveCondition,
                    placements.clone(),
                    vec![],
                );
                offer_steps.insert(variant_id.to_string(), resolve.id.clone());
                actions.push(resolve);
            }
        }
    }

    // Installs in the independently derived order; each step links the
    // placements that must be installed before it plus its purchase gate.
    let install_id = |pid: &str| bounded_id(&format!("act:install:{pid}"));
    let order: Vec<String> = if validation.install_order.is_empty() {
        let mut ids: Vec<String> = layout
            .placements
            .iter()
            .map(|p| p.id.as_str().to_owned())
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
            .find(|p| p.id.as_str() == pid)
            .expect("order ids come from placements");
        let mut prerequisites: Vec<Id> = validation
            .predecessors
            .get(pid.as_str())
            .into_iter()
            .flatten()
            .map(|p| install_id(p))
            .collect();
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject
            && let Some(gate) = offer_steps.get(variant_id.as_str())
        {
            prerequisites.push(gate.clone());
        }
        prerequisites.sort();
        prerequisites.dedup();
        actions.push(step(
            format!("act:install:{pid}"),
            ActionKind::Install,
            vec![placement.id.clone()],
            prerequisites,
        ));
    }

    // Contents transfer: each confirmed contained item is placed into its
    // installed container.
    for assignment in &layout.assignments {
        if let ItemLocation::Contained {
            container_placement_id,
            ..
        } = &assignment.location
        {
            actions.push(step(
                format!(
                    "act:transfer:{}:{}",
                    assignment.item_id.as_str(),
                    assignment.unit_ordinal
                ),
                ActionKind::TransferContents,
                vec![assignment.item_id.clone(), container_placement_id.clone()],
                vec![install_id(container_placement_id.as_str())],
            ));
        }
    }

    // Explicit review step for every unassigned instance group.
    for entry in &layout.unassigned {
        actions.push(step(
            format!("act:verify:{}", entry.item_id.as_str()),
            ActionKind::VerifyUnassigned,
            vec![entry.item_id.clone()],
            vec![],
        ));
    }
    actions
}
