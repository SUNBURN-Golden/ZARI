//! One action step, then one prerequisite edge. The finished sequence matches
//! `build_actions` / Kahn display order.

use super::{
    bounded_id, commerce_reasons, display_order, install_reasons, related_unknowns,
    resolve_step_id, sorted_ids, space_id_of, step, transfer_reasons, transfer_step_id,
};
use crate::plan::*;
use crate::scalars::Id;
use crate::validator::CandidateValidation;
use std::collections::BTreeMap;

#[derive(Clone)]
struct VariantRow {
    variant_id: String,
    placement_ids: Vec<Id>,
    offer_id: Option<Id>,
}

#[derive(Clone)]
pub(crate) struct ActionDrive {
    stage: u8,
    index: usize,
    sub: u8,
    filling: bool,
    edge_i: usize,
    pending: Vec<Id>,
    actions: Vec<ActionStep>,
    clear_of: BTreeMap<String, Id>,
    spaces: Vec<String>,
    spaces_ready: bool,
    offer_gate: BTreeMap<String, Id>,
    variants: Vec<VariantRow>,
    variants_ready: bool,
    acquire_id: Option<Id>,
    transfers_of: BTreeMap<String, Vec<Id>>,
    order: Vec<String>,
    order_ready: bool,
    ordered: bool,
}

impl ActionDrive {
    pub(crate) fn new() -> Self {
        Self {
            stage: 0,
            index: 0,
            sub: 0,
            filling: false,
            edge_i: 0,
            pending: vec![],
            actions: vec![],
            clear_of: BTreeMap::new(),
            spaces: vec![],
            spaces_ready: false,
            offer_gate: BTreeMap::new(),
            variants: vec![],
            variants_ready: false,
            acquire_id: None,
            transfers_of: BTreeMap::new(),
            order: vec![],
            order_ready: false,
            ordered: false,
        }
    }

    pub(crate) fn step(
        &mut self,
        layout: &CandidateLayout,
        validation: &CandidateValidation,
    ) -> bool {
        if self.ordered {
            return false;
        }
        let emitted = self.step_inner(layout, validation);
        if !emitted {
            return false;
        }
        if !self.filling && !self.ordered {
            let mut probe = self.clone();
            if !probe.step_inner(layout, validation) {
                self.order();
            }
        }
        true
    }

    pub(crate) fn into_actions(mut self) -> Vec<ActionStep> {
        if !self.ordered {
            self.order();
        }
        self.actions
    }

    fn order(&mut self) {
        if !self.ordered {
            self.actions = display_order(std::mem::take(&mut self.actions));
            self.ordered = true;
        }
    }

    fn step_inner(&mut self, layout: &CandidateLayout, validation: &CandidateValidation) -> bool {
        if self.ordered {
            return false;
        }
        if self.filling {
            let id = self.pending[self.edge_i].clone();
            self.actions
                .last_mut()
                .expect("open step")
                .prerequisite_step_ids
                .push(id);
            self.edge_i += 1;
            if self.edge_i >= self.pending.len() {
                let sorted = sorted_ids(std::mem::take(
                    &mut self
                        .actions
                        .last_mut()
                        .expect("open step")
                        .prerequisite_step_ids,
                ));
                self.actions
                    .last_mut()
                    .expect("open step")
                    .prerequisite_step_ids = sorted;
                self.filling = false;
                self.pending.clear();
                self.edge_i = 0;
                self.index += 1;
                self.sub = 0;
            }
            return true;
        }
        loop {
            let emitted = match self.stage {
                0 => self.emit_clear(layout),
                1 => self.emit_provisional(layout, validation),
                2 => self.emit_variant(layout, validation),
                3 => self.emit_transfer(layout, validation),
                4 => self.emit_install(layout, validation),
                5 => self.emit_unassigned(layout),
                _ => false,
            };
            if emitted || self.stage > 5 {
                return emitted;
            }
        }
    }

    fn begin_edges(&mut self, prereqs: Vec<Id>) {
        if prereqs.is_empty() {
            self.index += 1;
            self.sub = 0;
            return;
        }
        self.pending = prereqs;
        self.filling = true;
        self.edge_i = 0;
    }

    fn emit_clear(&mut self, layout: &CandidateLayout) -> bool {
        if !self.spaces_ready {
            let mut spaces: Vec<String> = layout
                .placements
                .iter()
                .filter_map(space_id_of)
                .map(str::to_owned)
                .collect();
            spaces.sort();
            spaces.dedup();
            self.spaces = spaces;
            self.spaces_ready = true;
        }
        let Some(space) = self.spaces.get(self.index).cloned() else {
            self.stage = 1;
            self.index = 0;
            return false;
        };
        let id = bounded_id(&format!("act:clear:{space}"));
        self.clear_of.insert(space.clone(), id.clone());
        self.actions.push(step(
            id,
            ActionKind::ClearSpace,
            vec![Id::new(&space).expect("space id")],
            vec![],
            vec![],
        ));
        self.index += 1;
        true
    }

    fn emit_provisional(
        &mut self,
        layout: &CandidateLayout,
        validation: &CandidateValidation,
    ) -> bool {
        loop {
            let Some(assignment) = layout.assignments.get(self.index) else {
                self.stage = 2;
                self.index = 0;
                return false;
            };
            self.index += 1;
            let ItemLocation::ProvisionalContainer {
                container_placement_id,
                ..
            } = &assignment.location
            else {
                continue;
            };
            let subjects = vec![assignment.item_id.clone(), container_placement_id.clone()];
            self.actions.push(step(
                resolve_step_id(&assignment.item_id, assignment.unit_ordinal),
                ActionKind::ResolveCondition,
                subjects.clone(),
                vec![],
                related_unknowns(&validation.report.checks, &subjects),
            ));
            return true;
        }
    }

    fn ensure_variants(&mut self, layout: &CandidateLayout) {
        if self.variants_ready {
            return;
        }
        let mut grouped: BTreeMap<&str, Vec<&Placement>> = BTreeMap::new();
        for placement in &layout.placements {
            if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
                grouped
                    .entry(variant_id.as_str())
                    .or_default()
                    .push(placement);
            }
        }
        self.variants = grouped
            .into_iter()
            .map(|(variant_id, placements)| {
                let placement_ids: Vec<Id> = placements.iter().map(|p| p.id.clone()).collect();
                let selection = layout.purchase_selections.iter().find(|selection| {
                    placements
                        .iter()
                        .any(|placement| placement.id == selection.placement_id)
                });
                let offer_id = match selection.map(|selection| &selection.offer) {
                    Some(OfferSelection::Selected { offer_id }) => Some(offer_id.clone()),
                    _ => None,
                };
                VariantRow {
                    variant_id: variant_id.to_owned(),
                    placement_ids,
                    offer_id,
                }
            })
            .collect();
        self.variants_ready = true;
    }

    fn emit_variant(&mut self, layout: &CandidateLayout, validation: &CandidateValidation) -> bool {
        self.ensure_variants(layout);
        let Some(row) = self.variants.get(self.index).cloned() else {
            self.stage = 3;
            self.index = 0;
            self.sub = 0;
            return false;
        };
        let checks = &validation.report.checks;
        if let Some(offer_id) = &row.offer_id {
            if self.sub == 0 {
                let mut subjects = row.placement_ids.clone();
                subjects.push(offer_id.clone());
                let acquire_id = bounded_id(&format!("act:acquire:{}", row.variant_id));
                self.acquire_id = Some(acquire_id.clone());
                self.actions.push(step(
                    acquire_id,
                    ActionKind::Acquire,
                    subjects,
                    vec![],
                    commerce_reasons(checks, &row.variant_id),
                ));
                self.sub = 1;
                return true;
            }
            let arrive_id = bounded_id(&format!("act:arrive:{}", row.variant_id));
            let mut subjects = row.placement_ids.clone();
            subjects.push(offer_id.clone());
            let acquire = self.acquire_id.clone().expect("acquire precedes arrival");
            self.actions.push(step(
                arrive_id.clone(),
                ActionKind::ConfirmArrival,
                subjects,
                vec![],
                vec![],
            ));
            self.offer_gate.insert(row.variant_id.clone(), arrive_id);
            self.begin_edges(vec![acquire]);
            return true;
        }
        let resolve_id = bounded_id(&format!("act:resolve-offer:{}", row.variant_id));
        let mut reasons = commerce_reasons(checks, &row.variant_id);
        reasons.extend(related_unknowns(checks, &row.placement_ids));
        self.actions.push(step(
            resolve_id.clone(),
            ActionKind::ResolveCondition,
            row.placement_ids,
            vec![],
            reasons,
        ));
        self.offer_gate.insert(row.variant_id, resolve_id);
        self.index += 1;
        true
    }

    fn emit_transfer(
        &mut self,
        layout: &CandidateLayout,
        validation: &CandidateValidation,
    ) -> bool {
        loop {
            let Some(assignment) = layout.assignments.get(self.index) else {
                self.stage = 4;
                self.index = 0;
                return false;
            };
            let ItemLocation::Contained {
                container_placement_id,
                ..
            } = &assignment.location
            else {
                self.index += 1;
                continue;
            };
            let container = layout
                .placements
                .iter()
                .find(|placement| &placement.id == container_placement_id);
            let mut prerequisites = Vec::new();
            if let Some(space) = container.and_then(space_id_of)
                && let Some(clear) = self.clear_of.get(space)
            {
                prerequisites.push(clear.clone());
            }
            if let Some(PlacementSubject::NewContainer { variant_id, .. }) =
                container.map(|placement| &placement.subject)
                && let Some(gate) = self.offer_gate.get(variant_id.as_str())
            {
                prerequisites.push(gate.clone());
            }
            let id = transfer_step_id(&assignment.item_id, assignment.unit_ordinal);
            self.transfers_of
                .entry(container_placement_id.as_str().to_owned())
                .or_default()
                .push(id.clone());
            self.actions.push(step(
                id,
                ActionKind::TransferContents,
                vec![assignment.item_id.clone(), container_placement_id.clone()],
                vec![],
                transfer_reasons(&validation.report.checks, container_placement_id.as_str()),
            ));
            self.begin_edges(prerequisites);
            return true;
        }
    }

    fn ensure_order(&mut self, layout: &CandidateLayout, validation: &CandidateValidation) {
        if self.order_ready {
            return;
        }
        self.order = if validation.install_order.is_empty() {
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
        self.order_ready = true;
    }

    fn emit_install(&mut self, layout: &CandidateLayout, validation: &CandidateValidation) -> bool {
        self.ensure_order(layout, validation);
        let Some(pid) = self.order.get(self.index).cloned() else {
            self.stage = 5;
            self.index = 0;
            return false;
        };
        let placement = layout
            .placements
            .iter()
            .find(|placement| placement.id.as_str() == pid)
            .expect("order ids come from placements");
        let install_id = |id: &str| bounded_id(&format!("act:install:{id}"));
        let mut prerequisites: Vec<Id> = validation
            .predecessors
            .get(pid.as_str())
            .into_iter()
            .flatten()
            .map(|predecessor| install_id(predecessor))
            .collect();
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject
            && let Some(gate) = self.offer_gate.get(variant_id.as_str())
        {
            prerequisites.push(gate.clone());
        }
        if let Some(transfers) = self.transfers_of.get(pid.as_str()) {
            prerequisites.extend(transfers.iter().cloned());
        }
        if let Some(space) = space_id_of(placement)
            && let Some(clear) = self.clear_of.get(space)
        {
            prerequisites.push(clear.clone());
        }
        self.actions.push(step(
            install_id(&pid),
            ActionKind::Install,
            vec![placement.id.clone()],
            vec![],
            install_reasons(&validation.report.checks, &pid, space_id_of(placement)),
        ));
        self.begin_edges(prerequisites);
        true
    }

    fn emit_unassigned(&mut self, layout: &CandidateLayout) -> bool {
        let Some(entry) = layout.unassigned.get(self.index) else {
            self.stage = 6;
            self.index = 0;
            return false;
        };
        self.actions.push(step(
            bounded_id(&format!("act:verify:{}", entry.item_id.as_str())),
            ActionKind::VerifyUnassigned,
            vec![entry.item_id.clone()],
            vec![],
            vec![],
        ));
        self.index += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::super::build_actions_reference;
    use super::ActionDrive;
    use crate::validator::validate_candidate;

    fn load(
        name: &str,
    ) -> Option<(
        crate::input::ProjectInput,
        crate::canonical::CatalogContent,
        crate::plan::CandidateLayout,
    )> {
        let path = format!(
            "{}/../../fixtures/domain/{name}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let text = std::fs::read_to_string(path).ok()?;
        let value: serde_json::Value = serde_json::from_str(&text).ok()?;
        let input = serde_json::from_value(value["input"]["input"].clone()).ok()?;
        let snapshot: crate::catalog::CatalogSnapshot =
            serde_json::from_value(value["input"]["catalog"].clone()).ok()?;
        let proposal: crate::plan::CandidateProposal =
            serde_json::from_value(value["input"]["proposal"].clone()).ok()?;
        Some((
            input,
            crate::canonical::CatalogContent::from(&snapshot),
            proposal.layout,
        ))
    }

    #[test]
    fn action_quanta_match_the_batch_guide() {
        for name in [
            "candidate-bounded-confirmed",
            "candidate-soft-budget",
            "candidate-unresolved-offer",
            "candidate-provisional",
            "candidate-contained-conditional",
            "candidate-purchase-disallowed",
            "candidate-one-action-blocked",
        ] {
            let (input, catalog, layout) = load(name).unwrap_or_else(|| panic!("load {name}"));
            let validation = validate_candidate(&input, &catalog, &layout);
            let legacy = build_actions_reference(&layout, &validation);
            let mut drive = ActionDrive::new();
            while drive.step(&layout, &validation) {}
            assert_eq!(drive.into_actions(), legacy, "{name}");
        }
    }
}
