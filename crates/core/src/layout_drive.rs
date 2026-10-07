//! One structural reference per quantum. The finished diagnostic list matches
//! `validate_layout` followed by `validate_strategy`, in that order.

use super::{
    MAX_COLLECTION, MAX_EXPANDED_INSTANCES, MAX_PLACED_CONTAINERS, container_support_ids, err,
};
use crate::catalog::ProductVariant;
use crate::facts::Diagnostic;
use crate::input::*;
use crate::plan::*;
use crate::scalars::Id;
use crate::strategy::StrategyDecision;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug)]
pub(crate) struct LayoutDrive {
    pub diagnostics: Vec<Diagnostic>,
    section: u8,
    index: usize,
    subjects: BTreeSet<String>,
    support_ids: BTreeSet<String>,
    container_count: usize,
    seen_placement_ids: BTreeSet<String>,
    assigned: BTreeMap<String, BTreeSet<u32>>,
    expanded: u64,
    unassigned_seen: BTreeSet<String>,
    selected: BTreeSet<String>,
    variant_offers: BTreeMap<String, String>,
    new_ids: Vec<String>,
    new_ready: bool,
    strategy_zones: BTreeSet<String>,
    strategy_groups: BTreeSet<String>,
    strategy_ready: bool,
    pub done: bool,
}

impl LayoutDrive {
    pub(crate) fn new(input: &ProjectInput) -> Self {
        Self {
            diagnostics: vec![],
            section: 0,
            index: 0,
            subjects: BTreeSet::new(),
            support_ids: BTreeSet::from([input.space.support.id.as_str().to_owned()]),
            container_count: 0,
            seen_placement_ids: BTreeSet::new(),
            assigned: BTreeMap::new(),
            expanded: 0,
            unassigned_seen: BTreeSet::new(),
            selected: BTreeSet::new(),
            variant_offers: BTreeMap::new(),
            new_ids: vec![],
            new_ready: false,
            strategy_zones: BTreeSet::new(),
            strategy_groups: BTreeSet::new(),
            strategy_ready: false,
            done: false,
        }
    }

    /// Execute one reference. `false` means the structural phase is finished.
    pub(crate) fn step(
        &mut self,
        layout: &CandidateLayout,
        input: &ProjectInput,
        variants: &BTreeMap<&str, &ProductVariant>,
        offers: &BTreeMap<&str, &crate::catalog::Offer>,
        strategy: &StrategyDecision,
        through_strategy: bool,
    ) -> bool {
        if self.done {
            return false;
        }
        if !through_strategy && self.section >= 13 {
            self.done = true;
            return false;
        }
        loop {
            let did = match self.section {
                0 => self.dup_placement(layout),
                1 => self.one_placement(layout, input, variants),
                2 => self.container_cap(),
                3 => self.one_support(layout),
                4 => self.one_assignment(layout, input),
                5 => self.one_unassigned(layout, input),
                6 => self.one_unknown_item(input),
                7 => self.one_assigned_gap(input),
                8 => self.one_missing_known(input),
                9 => self.one_direct(layout),
                10 => self.expanded_cap(),
                11 => self.one_purchase(layout, input, variants, offers),
                12 => self.one_missing_purchase(layout),
                13 => self.strategy_cap(strategy),
                14 => self.dup_ids(
                    strategy.zones.iter().map(|z| z.id.as_str()).collect(),
                    "strategy.zones",
                ),
                15 => self.dup_ids(
                    strategy.reasons.iter().map(|r| r.id.as_str()).collect(),
                    "strategy.reasons",
                ),
                16 => self.dup_ids(
                    strategy.assumptions.iter().map(|c| c.id.as_str()).collect(),
                    "strategy.assumptions",
                ),
                17 => self.dup_ids(
                    strategy
                        .groups
                        .iter()
                        .map(|g| g.group_id.as_str())
                        .collect(),
                    "strategy.groups",
                ),
                18 => self.one_strategy_group(input, strategy),
                19 => self.one_priority(strategy),
                _ => {
                    self.done = true;
                    return false;
                }
            };
            if did {
                return true;
            }
        }
    }

    fn advance(&mut self) {
        self.section += 1;
        self.index = 0;
    }

    fn dup_placement(&mut self, layout: &CandidateLayout) -> bool {
        let Some(placement) = layout.placements.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if !self
            .seen_placement_ids
            .insert(placement.id.as_str().to_owned())
        {
            err(
                &mut self.diagnostics,
                format!("placements.{}", placement.id.as_str()),
                "duplicate_id",
            );
        }
        true
    }

    fn one_placement(
        &mut self,
        layout: &CandidateLayout,
        input: &ProjectInput,
        variants: &BTreeMap<&str, &ProductVariant>,
    ) -> bool {
        let Some(placement) = layout.placements.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        let path = format!("placements.{}", placement.id.as_str());
        match &placement.parent {
            ParentRef::Space { space_id } => {
                if space_id != &input.space.id {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.parent"),
                        "dangling_space_ref",
                    );
                }
            }
            ParentRef::Container { .. } => {
                err(
                    &mut self.diagnostics,
                    format!("{path}.parent"),
                    "nesting_depth_exceeded",
                );
            }
        }
        let item_ids: BTreeMap<&str, &Item> =
            input.items.iter().map(|i| (i.id.as_str(), i)).collect();
        let owned_ids: BTreeMap<&str, &crate::catalog::OwnedContainer> = input
            .owned_containers
            .iter()
            .map(|o| (o.id.as_str(), o))
            .collect();
        let (subject_key, container) = match &placement.subject {
            PlacementSubject::OwnedContainer {
                owned_id,
                unit_ordinal,
            } => {
                self.container_count += 1;
                let key = format!("owned:{}:{}", owned_id.as_str(), unit_ordinal);
                match owned_ids.get(owned_id.as_str()) {
                    None => err(
                        &mut self.diagnostics,
                        format!("{path}.subject"),
                        "dangling_owned_ref",
                    ),
                    Some(owned) => {
                        if let Some(qty) = owned.quantity_owned.value() {
                            if *unit_ordinal >= qty.get() {
                                err(
                                    &mut self.diagnostics,
                                    format!("{path}.subject"),
                                    "ordinal_out_of_range",
                                );
                            }
                        } else {
                            err(
                                &mut self.diagnostics,
                                format!("{path}.subject"),
                                "unknown_quantity_ordinals",
                            );
                        }
                    }
                }
                (key, true)
            }
            PlacementSubject::NewContainer {
                variant_id,
                unit_ordinal,
            } => {
                self.container_count += 1;
                let key = format!("new:{}:{}", variant_id.as_str(), unit_ordinal);
                if !variants.contains_key(variant_id.as_str()) {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.subject"),
                        "dangling_variant_ref",
                    );
                }
                if *unit_ordinal >= MAX_EXPANDED_INSTANCES as u32 {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.subject"),
                        "ordinal_out_of_range",
                    );
                }
                (key, true)
            }
            PlacementSubject::DirectItem {
                item_id,
                unit_ordinal,
            } => {
                let key = format!("item:{}:{}", item_id.as_str(), unit_ordinal);
                match item_ids.get(item_id.as_str()) {
                    None => err(
                        &mut self.diagnostics,
                        format!("{path}.subject"),
                        "dangling_item_ref",
                    ),
                    Some(item) => {
                        if let Some(qty) = item.quantity.value() {
                            if *unit_ordinal >= qty.get() {
                                err(
                                    &mut self.diagnostics,
                                    format!("{path}.subject"),
                                    "ordinal_out_of_range",
                                );
                            }
                        } else {
                            err(
                                &mut self.diagnostics,
                                format!("{path}.subject"),
                                "unknown_quantity_ordinals",
                            );
                        }
                    }
                }
                (key, false)
            }
        };
        if !self.subjects.insert(subject_key) {
            err(
                &mut self.diagnostics,
                format!("{path}.subject"),
                "duplicate_subject",
            );
        }
        if container {
            for id in container_support_ids(placement, input, variants) {
                self.support_ids.insert(id.as_str().to_owned());
            }
        }
        true
    }

    fn container_cap(&mut self) -> bool {
        if self.container_count > MAX_PLACED_CONTAINERS {
            err(&mut self.diagnostics, "placements", "input_limit_exceeded");
        }
        self.advance();
        true
    }

    fn one_support(&mut self, layout: &CandidateLayout) -> bool {
        let Some(placement) = layout.placements.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if !self.support_ids.contains(placement.support_id.as_str()) {
            err(
                &mut self.diagnostics,
                format!("placements.{}.supportId", placement.id.as_str()),
                "dangling_support_ref",
            );
        }
        true
    }

    fn one_assignment(&mut self, layout: &CandidateLayout, input: &ProjectInput) -> bool {
        let Some(assignment) = layout.assignments.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        let path = format!(
            "assignments.{}:{}",
            assignment.item_id.as_str(),
            assignment.unit_ordinal
        );
        self.expanded += 1;
        let item_ids: BTreeMap<&str, &Item> =
            input.items.iter().map(|i| (i.id.as_str(), i)).collect();
        let placements: BTreeMap<&str, &Placement> = layout
            .placements
            .iter()
            .map(|p| (p.id.as_str(), p))
            .collect();
        let Some(item) = item_ids.get(assignment.item_id.as_str()) else {
            err(&mut self.diagnostics, path, "dangling_item_ref");
            return true;
        };
        if let Some(qty) = item.quantity.value() {
            if assignment.unit_ordinal >= qty.get() {
                err(&mut self.diagnostics, path.clone(), "ordinal_out_of_range");
            }
        } else {
            err(
                &mut self.diagnostics,
                path.clone(),
                "unknown_quantity_ordinals",
            );
        }
        if !self
            .assigned
            .entry(assignment.item_id.as_str().to_owned())
            .or_default()
            .insert(assignment.unit_ordinal)
        {
            err(&mut self.diagnostics, path.clone(), "duplicate_assignment");
        }
        match &assignment.location {
            ItemLocation::Direct { placement_id } => {
                match placements.get(placement_id.as_str()) {
                    Some(placement)
                        if matches!(
                            &placement.subject,
                            PlacementSubject::DirectItem { item_id, unit_ordinal }
                                if item_id == &assignment.item_id
                                    && *unit_ordinal == assignment.unit_ordinal
                        ) => {}
                    Some(_) => err(
                        &mut self.diagnostics,
                        path.clone(),
                        "assignment_placement_mismatch",
                    ),
                    None => err(
                        &mut self.diagnostics,
                        path.clone(),
                        "dangling_placement_ref",
                    ),
                }
                if !item
                    .requirement
                    .allowed_retrieval_modes
                    .contains(&RetrievalMode::DirectFrontExtraction)
                {
                    err(&mut self.diagnostics, path, "retrieval_mode_not_permitted");
                }
            }
            ItemLocation::Contained {
                container_placement_id,
                local_placement,
            } => {
                match placements.get(container_placement_id.as_str()) {
                    Some(placement)
                        if !matches!(placement.subject, PlacementSubject::DirectItem { .. }) =>
                    {
                        if !self
                            .support_ids
                            .contains(local_placement.support_id.as_str())
                        {
                            err(&mut self.diagnostics, path.clone(), "dangling_support_ref");
                        }
                    }
                    Some(_) => err(&mut self.diagnostics, path.clone(), "invalid_container_ref"),
                    None => err(
                        &mut self.diagnostics,
                        path.clone(),
                        "dangling_placement_ref",
                    ),
                }
                if !item
                    .requirement
                    .allowed_retrieval_modes
                    .contains(&RetrievalMode::PullContainerThenRetrieve)
                {
                    err(&mut self.diagnostics, path, "retrieval_mode_not_permitted");
                }
            }
            ItemLocation::ProvisionalContainer {
                container_placement_id,
                reason_code,
            } => {
                match placements.get(container_placement_id.as_str()) {
                    Some(placement)
                        if !matches!(placement.subject, PlacementSubject::DirectItem { .. }) => {}
                    Some(_) => err(&mut self.diagnostics, path.clone(), "invalid_container_ref"),
                    None => err(
                        &mut self.diagnostics,
                        path.clone(),
                        "dangling_placement_ref",
                    ),
                }
                if reason_code.trim().is_empty()
                    || reason_code.chars().count() > crate::facts::MAX_LABEL_CHARS
                {
                    err(&mut self.diagnostics, path.clone(), "invalid_reason_code");
                }
                if !item
                    .requirement
                    .allowed_retrieval_modes
                    .contains(&RetrievalMode::PullContainerThenRetrieve)
                {
                    err(&mut self.diagnostics, path, "retrieval_mode_not_permitted");
                }
            }
        }
        true
    }

    fn one_unassigned(&mut self, layout: &CandidateLayout, input: &ProjectInput) -> bool {
        let Some(entry) = layout.unassigned.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        let path = format!("unassigned.{}", entry.item_id.as_str());
        let item_ids: BTreeMap<&str, &Item> =
            input.items.iter().map(|i| (i.id.as_str(), i)).collect();
        let Some(item) = item_ids.get(entry.item_id.as_str()) else {
            err(&mut self.diagnostics, path, "dangling_item_ref");
            return true;
        };
        if !self
            .unassigned_seen
            .insert(entry.item_id.as_str().to_owned())
        {
            err(&mut self.diagnostics, path.clone(), "duplicate_unassigned");
        }
        if entry.reason_code.trim().is_empty()
            || entry.reason_code.chars().count() > crate::facts::MAX_LABEL_CHARS
        {
            err(
                &mut self.diagnostics,
                format!("{path}.reasonCode"),
                "invalid_reason_code",
            );
        }
        match (&entry.instances, item.quantity.value()) {
            (UnassignedInstances::UnknownQuantity {}, Some(_)) => {
                err(
                    &mut self.diagnostics,
                    format!("{path}.instances"),
                    "unknown_quantity_mismatch",
                );
            }
            (UnassignedInstances::Known { .. }, None) => {
                err(
                    &mut self.diagnostics,
                    format!("{path}.instances"),
                    "unknown_quantity_mismatch",
                );
            }
            (UnassignedInstances::Known { ranges }, Some(quantity)) => {
                let mut covered = vec![false; quantity.get() as usize];
                for ordinal in self
                    .assigned
                    .get(item.id.as_str())
                    .into_iter()
                    .flatten()
                    .copied()
                {
                    if let Some(slot) = covered.get_mut(ordinal as usize) {
                        *slot = true;
                    }
                }
                let mut last_end = 0u32;
                for range in ranges {
                    self.expanded += u64::from(range.end_exclusive - range.start);
                    if range.start >= range.end_exclusive
                        || range.end_exclusive > quantity.get()
                        || range.start < last_end
                    {
                        err(
                            &mut self.diagnostics,
                            format!("{path}.instances"),
                            "invalid_ordinal_range",
                        );
                    }
                    last_end = range.end_exclusive;
                    for ordinal in range.start..range.end_exclusive.min(quantity.get()) {
                        if let Some(slot) = covered.get_mut(ordinal as usize) {
                            if *slot {
                                err(
                                    &mut self.diagnostics,
                                    format!("{path}.instances"),
                                    "ordinal_partition_overlap",
                                );
                            }
                            *slot = true;
                        }
                    }
                }
                if covered.iter().any(|covered| !covered) {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.instances"),
                        "ordinal_partition_incomplete",
                    );
                }
            }
            (UnassignedInstances::UnknownQuantity {}, None) => {
                if self.assigned.contains_key(item.id.as_str()) {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.instances"),
                        "unknown_quantity_mismatch",
                    );
                }
            }
        }
        true
    }

    fn one_unknown_item(&mut self, input: &ProjectInput) -> bool {
        let Some(item) = input.items.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if item.quantity.value().is_none()
            && !self.assigned.contains_key(item.id.as_str())
            && !self.unassigned_seen.contains(item.id.as_str())
        {
            err(
                &mut self.diagnostics,
                format!("unassigned.{}", item.id.as_str()),
                "ordinal_partition_incomplete",
            );
        }
        true
    }

    fn one_assigned_gap(&mut self, input: &ProjectInput) -> bool {
        let keys: Vec<String> = self.assigned.keys().cloned().collect();
        let Some(item_id) = keys.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        let item_ids: BTreeMap<&str, &Item> =
            input.items.iter().map(|i| (i.id.as_str(), i)).collect();
        if let Some(item) = item_ids.get(item_id.as_str())
            && item.quantity.value().is_some()
            && !self.unassigned_seen.contains(item_id.as_str())
            && self.assigned.get(item_id).map(|s| s.len()).unwrap_or(0) as u64
                != u64::from(item.quantity.value().map(|q| q.get()).unwrap_or(0))
        {
            err(
                &mut self.diagnostics,
                format!("unassigned.{item_id}"),
                "ordinal_partition_incomplete",
            );
        }
        true
    }

    fn one_missing_known(&mut self, input: &ProjectInput) -> bool {
        let Some(item) = input.items.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if item.quantity.value().is_some_and(|q| q.get() > 0)
            && !self.assigned.contains_key(item.id.as_str())
            && !self.unassigned_seen.contains(item.id.as_str())
        {
            err(
                &mut self.diagnostics,
                format!("unassigned.{}", item.id.as_str()),
                "ordinal_partition_incomplete",
            );
        }
        true
    }

    fn one_direct(&mut self, layout: &CandidateLayout) -> bool {
        let Some(placement) = layout.placements.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if let PlacementSubject::DirectItem {
            item_id,
            unit_ordinal,
        } = &placement.subject
        {
            let matched = layout.assignments.iter().any(|a| {
                &a.item_id == item_id
                    && a.unit_ordinal == *unit_ordinal
                    && matches!(
                        &a.location,
                        ItemLocation::Direct { placement_id } if placement_id == &placement.id
                    )
            });
            if !matched {
                err(
                    &mut self.diagnostics,
                    format!("placements.{}", placement.id.as_str()),
                    "direct_placement_unassigned",
                );
            }
        }
        true
    }

    fn expanded_cap(&mut self) -> bool {
        if self.expanded > MAX_EXPANDED_INSTANCES {
            err(&mut self.diagnostics, "assignments", "input_limit_exceeded");
        }
        self.advance();
        true
    }

    fn ensure_new(&mut self, layout: &CandidateLayout) {
        if self.new_ready {
            return;
        }
        self.new_ids = layout
            .placements
            .iter()
            .filter_map(|p| match &p.subject {
                PlacementSubject::NewContainer { .. } => Some(p.id.as_str().to_owned()),
                _ => None,
            })
            .collect();
        // `new_placements` is a BTreeMap, so missing-selection diagnostics
        // follow placement id order, not layout order.
        self.new_ids.sort();
        self.new_ready = true;
    }

    fn one_purchase(
        &mut self,
        layout: &CandidateLayout,
        _input: &ProjectInput,
        _variants: &BTreeMap<&str, &ProductVariant>,
        offers: &BTreeMap<&str, &crate::catalog::Offer>,
    ) -> bool {
        self.ensure_new(layout);
        let Some(selection) = layout.purchase_selections.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        let path = format!("purchaseSelections.{}", selection.placement_id.as_str());
        let new_placements: BTreeMap<&str, &Id> = layout
            .placements
            .iter()
            .filter_map(|p| match &p.subject {
                PlacementSubject::NewContainer { variant_id, .. } => {
                    Some((p.id.as_str(), variant_id))
                }
                _ => None,
            })
            .collect();
        let Some(variant_id) = new_placements.get(selection.placement_id.as_str()) else {
            err(&mut self.diagnostics, path, "invalid_purchase_subject");
            return true;
        };
        if !self
            .selected
            .insert(selection.placement_id.as_str().to_owned())
        {
            err(
                &mut self.diagnostics,
                path.clone(),
                "duplicate_purchase_selection",
            );
        }
        match &selection.offer {
            OfferSelection::Selected { offer_id } => match offers.get(offer_id.as_str()) {
                Some(offer) if offer.variant_id == **variant_id => {
                    if let Some(other) = self
                        .variant_offers
                        .insert(variant_id.as_str().to_owned(), offer_id.as_str().to_owned())
                        && other != offer_id.as_str()
                    {
                        err(&mut self.diagnostics, path, "inconsistent_offer_selection");
                    }
                }
                Some(_) => err(&mut self.diagnostics, path, "offer_variant_mismatch"),
                None => err(&mut self.diagnostics, path, "dangling_offer_ref"),
            },
            OfferSelection::Unresolved { reason_code } => {
                if reason_code.trim().is_empty()
                    || reason_code.chars().count() > crate::facts::MAX_LABEL_CHARS
                {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.offer"),
                        "invalid_reason_code",
                    );
                }
            }
        }
        true
    }

    fn one_missing_purchase(&mut self, layout: &CandidateLayout) -> bool {
        self.ensure_new(layout);
        let Some(placement_id) = self.new_ids.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if !self.selected.contains(placement_id) {
            err(
                &mut self.diagnostics,
                format!("purchaseSelections.{placement_id}"),
                "missing_purchase_selection",
            );
        }
        true
    }

    fn strategy_cap(&mut self, strategy: &StrategyDecision) -> bool {
        if strategy.groups.len() > MAX_COLLECTION
            || strategy.zones.len() > MAX_COLLECTION
            || strategy.reasons.len() > MAX_COLLECTION
            || strategy.assumptions.len() > MAX_COLLECTION
        {
            err(&mut self.diagnostics, "strategy", "input_limit_exceeded");
        }
        self.advance();
        true
    }

    fn dup_ids(&mut self, ids: Vec<&str>, path: &str) -> bool {
        let Some(id) = ids.get(self.index).copied() else {
            self.advance();
            return false;
        };
        self.index += 1;
        let seen = match self.section {
            14 => &mut self.strategy_zones,
            15 => {
                // Reuse subjects set only after layout sections finished.
                // Separate sets: store in strategy_groups for reasons? Need distinct sets.
                // Use diagnostics side channel via index-local sets stored in strategy_zones
                // only for zones. For the others, scan the prefix.
                let duplicate = ids[..self.index - 1].contains(&id);
                if duplicate {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.{id}"),
                        "duplicate_id",
                    );
                }
                return true;
            }
            _ => {
                let duplicate = ids[..self.index - 1].contains(&id);
                if duplicate {
                    err(
                        &mut self.diagnostics,
                        format!("{path}.{id}"),
                        "duplicate_id",
                    );
                }
                return true;
            }
        };
        if !seen.insert(id.to_owned()) {
            err(
                &mut self.diagnostics,
                format!("{path}.{id}"),
                "duplicate_id",
            );
        }
        true
    }

    fn ensure_strategy(&mut self, input: &ProjectInput, strategy: &StrategyDecision) {
        if self.strategy_ready {
            return;
        }
        self.strategy_zones = strategy
            .zones
            .iter()
            .map(|z| z.id.as_str().to_owned())
            .chain(
                input
                    .constraints
                    .locked_zones
                    .iter()
                    .map(|l| l.zone.id.as_str().to_owned()),
            )
            .collect();
        self.strategy_groups = strategy
            .groups
            .iter()
            .map(|g| g.group_id.as_str().to_owned())
            .collect();
        self.strategy_ready = true;
    }

    fn one_strategy_group(&mut self, input: &ProjectInput, strategy: &StrategyDecision) -> bool {
        self.ensure_strategy(input, strategy);
        let Some(resolved) = strategy.groups.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        let path = format!("strategy.groups.{}", resolved.group_id.as_str());
        let Some(group) = input.groups.iter().find(|g| g.id == resolved.group_id) else {
            err(&mut self.diagnostics, path, "dangling_group_ref");
            return true;
        };
        if !self.strategy_zones.contains(resolved.zone_id.as_str()) {
            err(
                &mut self.diagnostics,
                format!("{path}.zoneId"),
                "dangling_zone_ref",
            );
        }
        let members: BTreeSet<&str> = group.item_ids.iter().map(|i| i.as_str()).collect();
        if resolved.item_ids.is_empty() {
            err(
                &mut self.diagnostics,
                format!("{path}.itemIds"),
                "empty_group_items",
            );
        }
        for item_id in &resolved.item_ids {
            if !members.contains(item_id.as_str()) {
                err(
                    &mut self.diagnostics,
                    format!("{path}.itemIds"),
                    "dangling_item_ref",
                );
            }
        }
        true
    }

    fn one_priority(&mut self, strategy: &StrategyDecision) -> bool {
        let Some(priority) = strategy.priorities.get(self.index) else {
            self.advance();
            return false;
        };
        self.index += 1;
        if !self.strategy_groups.contains(priority.group_id.as_str()) {
            err(
                &mut self.diagnostics,
                format!("strategy.priorities.{}", priority.group_id.as_str()),
                "dangling_group_ref",
            );
        }
        true
    }
}

#[cfg(test)]
pub(crate) fn structural_diagnostics(
    layout: &CandidateLayout,
    input: &ProjectInput,
    variants: &BTreeMap<&str, &ProductVariant>,
    offers: &BTreeMap<&str, &crate::catalog::Offer>,
    strategy: &StrategyDecision,
) -> Vec<Diagnostic> {
    let mut drive = LayoutDrive::new(input);
    while drive.step(layout, input, variants, offers, strategy, true) {}
    drive.diagnostics
}

#[cfg(test)]
mod tests {
    use super::structural_diagnostics;
    use crate::validate::{validate_layout, validate_strategy};

    fn load(
        name: &str,
    ) -> Option<(
        crate::input::ProjectInput,
        crate::catalog::CatalogSnapshot,
        crate::plan::CandidateProposal,
    )> {
        let path = format!(
            "{}/../../fixtures/domain/{name}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let text = std::fs::read_to_string(path).ok()?;
        let value: serde_json::Value = serde_json::from_str(&text).ok()?;
        let input = serde_json::from_value(value["input"]["input"].clone()).ok()?;
        let catalog = serde_json::from_value(value["input"]["catalog"].clone()).ok()?;
        let proposal = serde_json::from_value(value["input"]["proposal"].clone()).ok()?;
        Some((input, catalog, proposal))
    }

    #[test]
    fn layout_drive_matches_structural_validation() {
        let mut seen = 0u32;
        for name in [
            "candidate-bounded-confirmed",
            "candidate-missing-purchase",
            "candidate-strategy-dangling",
            "candidate-wrong-variant-offer",
            "candidate-ordinal-overlap",
            "candidate-ghost-placement",
        ] {
            let Some((input, snapshot, proposal)) = load(name) else {
                panic!("missing {name}");
            };
            seen += 1;
            let catalog = crate::canonical::CatalogContent::from(&snapshot);
            let variants: std::collections::BTreeMap<&str, &crate::catalog::ProductVariant> =
                catalog
                    .variants
                    .iter()
                    .map(|v| (v.id.as_str(), v))
                    .collect();
            let offers: std::collections::BTreeMap<&str, &crate::catalog::Offer> =
                catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect();
            let mut expected = validate_layout(&proposal.layout, &input, &variants, &offers);
            expected.extend(validate_strategy(&proposal.strategy, &input));
            let actual = structural_diagnostics(
                &proposal.layout,
                &input,
                &variants,
                &offers,
                &proposal.strategy,
            );
            assert_eq!(actual, expected, "{name}");
        }
        assert!(seen >= 6);
    }
}
