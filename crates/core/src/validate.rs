//! Structural validation for normalized domain records: identity, reference,
//! duplicate, cycle, cap, ordinal-partition and purchase-binding checks. These
//! run on normalized types after scalar-level serde validation, and are shared
//! by normalization, record verification and activation.

use crate::canonical::CatalogContent;
use crate::catalog::*;
use crate::facts::*;
use crate::input::*;
use crate::plan::*;
use crate::scalars::*;
use crate::strategy::StrategyDecision;

use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_OBSTACLES: usize = 20;
pub const MAX_GROUPS: usize = 50;
pub const MAX_PLACED_CONTAINERS: usize = 20;
pub const MAX_EXPANDED_INSTANCES: u64 = 200;
pub const MAX_CATALOG_VARIANTS: usize = 1000;
pub const MAX_CATALOG_OFFERS: usize = 4000;
/// Transport bound for collections without an explicit domain cap.
pub const MAX_COLLECTION: usize = 1024;

fn err(diagnostics: &mut Vec<Diagnostic>, path: impl Into<String>, code: &str) {
    diagnostics.push(Diagnostic {
        field_path: path.into(),
        code: code.into(),
        reason_code: code.into(),
    });
}
fn duplicate_ids<'a>(
    diagnostics: &mut Vec<Diagnostic>,
    path: &str,
    ids: impl Iterator<Item = &'a Id>,
) {
    let mut seen = BTreeSet::new();
    for id in ids {
        if !seen.insert(id.as_str()) {
            err(
                diagnostics,
                format!("{path}.{}", id.as_str()),
                "duplicate_id",
            );
        }
    }
}
fn text_bounds(
    diagnostics: &mut Vec<Diagnostic>,
    path: impl Into<String>,
    value: &str,
    max: usize,
    required: bool,
) {
    let path = path.into();
    if required && value.trim().is_empty() {
        err(diagnostics, path, "required_text_missing");
    } else if value.chars().count() > max {
        err(diagnostics, path, "text_too_long");
    }
}
/// Flag every `{"state":"notApplicable"}` fact under the serialized value,
/// skipping allowed prefix paths (offer-level facts may be not-applicable).
fn reject_not_applicable(
    diagnostics: &mut Vec<Diagnostic>,
    value: &Value,
    path: &str,
    allowed_prefixes: &[&str],
) {
    if allowed_prefixes.iter().any(|p| path.starts_with(p)) {
        return;
    }
    match value {
        Value::Object(map) => {
            if map.get("state").and_then(Value::as_str) == Some("notApplicable") {
                err(diagnostics, path.to_owned(), "not_applicable_not_allowed");
                return;
            }
            for (key, child) in map {
                reject_not_applicable(
                    diagnostics,
                    child,
                    &format!("{path}.{key}"),
                    allowed_prefixes,
                );
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                reject_not_applicable(
                    diagnostics,
                    child,
                    &format!("{path}.{index}"),
                    allowed_prefixes,
                );
            }
        }
        _ => {}
    }
}
/// Collect every provenance evidence id under the serialized value.
fn collect_evidence_refs(value: &Value, path: &str, out: &mut Vec<(String, String)>) {
    if let Value::Object(map) = value {
        if let Some(Value::Array(ids)) = map.get("evidenceIds") {
            for id in ids {
                if let Some(id) = id.as_str() {
                    out.push((path.to_owned(), id.to_owned()));
                }
            }
        }
        for (key, child) in map {
            collect_evidence_refs(child, &format!("{path}.{key}"), out);
        }
    } else if let Value::Array(items) = value {
        for (index, child) in items.iter().enumerate() {
            collect_evidence_refs(child, &format!("{path}.{index}"), out);
        }
    }
}
fn check_evidence_refs<T: Serialize>(
    diagnostics: &mut Vec<Diagnostic>,
    path: &str,
    value: &T,
    evidence: &[Evidence],
) {
    let known: BTreeSet<&str> = evidence.iter().map(|e| e.id.as_str()).collect();
    let mut refs = vec![];
    collect_evidence_refs(
        &serde_json::to_value(value).expect("typed DTO serializes"),
        path,
        &mut refs,
    );
    for (at, id) in refs {
        if !known.contains(id.as_str()) {
            err(diagnostics, at, "dangling_evidence_ref");
        }
    }
}
fn check_provenance_wellformed<T: Serialize>(
    diagnostics: &mut Vec<Diagnostic>,
    path: &str,
    value: &T,
) {
    let value = serde_json::to_value(value).expect("typed DTO serializes");
    fn walk(diagnostics: &mut Vec<Diagnostic>, value: &Value, path: &str) {
        if let Value::Object(map) = value {
            if map.get("state").and_then(Value::as_str) == Some("known")
                && let Some(provenance) = map.get("provenance")
            {
                if let Some(observed) = provenance.get("observedAt")
                    && observed.as_str().is_some_and(|v| !valid_utc_timestamp(v))
                {
                    err(
                        diagnostics,
                        format!("{path}.provenance.observedAt"),
                        "invalid_timestamp",
                    );
                }
                for key in ["ruleIds", "evidenceIds", "inputRefs"] {
                    if let Some(Value::Array(items)) = provenance.get(key)
                        && items.len() > MAX_ID_REFERENCES
                    {
                        err(
                            diagnostics,
                            format!("{path}.provenance.{key}"),
                            "input_limit_exceeded",
                        );
                    }
                }
            }
            for (key, child) in map {
                walk(diagnostics, child, &format!("{path}.{key}"));
            }
        } else if let Value::Array(items) = value {
            for (index, child) in items.iter().enumerate() {
                walk(diagnostics, child, &format!("{path}.{index}"));
            }
        }
    }
    walk(diagnostics, &value, path);
}

fn check_evidence_entries(diagnostics: &mut Vec<Diagnostic>, path: &str, evidence: &[Evidence]) {
    if evidence.len() > MAX_COLLECTION {
        err(diagnostics, path.to_owned(), "input_limit_exceeded");
    }
    duplicate_ids(diagnostics, path, evidence.iter().map(|e| &e.id));
    for entry in evidence {
        let path = format!("{path}.{}", entry.id.as_str());
        text_bounds(
            diagnostics,
            format!("{path}.sourceField"),
            &entry.source_field,
            MAX_LABEL_CHARS,
            false,
        );
        text_bounds(
            diagnostics,
            format!("{path}.note"),
            &entry.note,
            MAX_NOTE_CHARS,
            false,
        );
        if let Some(locator) = &entry.locator
            && !valid_locator(locator)
        {
            err(diagnostics, format!("{path}.locator"), "invalid_locator");
        }
        if let Some(observed) = &entry.observed_at
            && !valid_utc_timestamp(observed)
        {
            err(
                diagnostics,
                format!("{path}.observedAt"),
                "invalid_timestamp",
            );
        }
        if let Some(confirmed_by) = &entry.confirmed_by {
            text_bounds(
                diagnostics,
                format!("{path}.confirmedBy"),
                confirmed_by,
                MAX_LABEL_CHARS,
                false,
            );
        }
    }
}

/// Structural validation of a normalized `ProjectInput`. Scalars are already
/// validated by their types; this checks identity, references, ordering
/// semantics, caps and not-applicable placement.
pub fn validate_project_input(input: &ProjectInput) -> Vec<Diagnostic> {
    let mut diagnostics = vec![];
    text_bounds(
        &mut diagnostics,
        "catalogPin.catalogVersion",
        &input.catalog_pin.catalog_version,
        MAX_LABEL_CHARS,
        true,
    );
    text_bounds(
        &mut diagnostics,
        "search.profile.id",
        &input.search.profile.id,
        MAX_LABEL_CHARS,
        true,
    );
    if input.space.obstacles.len() > MAX_OBSTACLES {
        err(&mut diagnostics, "space.obstacles", "input_limit_exceeded");
    }
    duplicate_ids(
        &mut diagnostics,
        "space.obstacles",
        input.space.obstacles.iter().map(|o| &o.id),
    );
    if input.items.len() > MAX_COLLECTION {
        err(&mut diagnostics, "items", "input_limit_exceeded");
    }
    duplicate_ids(&mut diagnostics, "items", input.items.iter().map(|i| &i.id));
    if input.groups.len() > MAX_GROUPS {
        err(&mut diagnostics, "groups", "input_limit_exceeded");
    }
    duplicate_ids(
        &mut diagnostics,
        "groups",
        input.groups.iter().map(|g| &g.id),
    );
    if input.owned_containers.len() > MAX_PLACED_CONTAINERS {
        err(&mut diagnostics, "ownedContainers", "input_limit_exceeded");
    }
    duplicate_ids(
        &mut diagnostics,
        "ownedContainers",
        input.owned_containers.iter().map(|o| &o.id),
    );
    let item_ids: BTreeSet<&str> = input.items.iter().map(|i| i.id.as_str()).collect();
    let group_ids: BTreeSet<&str> = input.groups.iter().map(|g| g.id.as_str()).collect();
    for group in &input.groups {
        let path = format!("groups.{}", group.id.as_str());
        text_bounds(
            &mut diagnostics,
            format!("{path}.label"),
            &group.label,
            MAX_LABEL_CHARS,
            true,
        );
        for item_id in &group.item_ids {
            if !item_ids.contains(item_id.as_str()) {
                err(
                    &mut diagnostics,
                    format!("{path}.itemIds"),
                    "dangling_item_ref",
                );
            }
        }
        let mut seen = BTreeSet::new();
        for item_id in &group.item_ids {
            if !seen.insert(item_id.as_str()) {
                err(
                    &mut diagnostics,
                    format!("{path}.itemIds"),
                    "duplicate_id_reference",
                );
            }
        }
    }
    // Group membership must be unique for the selected grouping.
    let mut membership: BTreeMap<&str, &Id> = BTreeMap::new();
    for group in &input.groups {
        for item_id in &group.item_ids {
            if let Some(other) = membership.insert(item_id.as_str(), &group.id)
                && other != &group.id
            {
                err(
                    &mut diagnostics,
                    format!("groups.{}.itemIds", group.id.as_str()),
                    "item_in_multiple_groups",
                );
            }
        }
    }
    for locked in &input.constraints.locked_zones {
        if !group_ids.contains(locked.group_id.as_str()) {
            err(
                &mut diagnostics,
                format!("constraints.lockedZones.{}", locked.group_id.as_str()),
                "dangling_group_ref",
            );
        }
    }
    duplicate_ids(
        &mut diagnostics,
        "constraints.lockedZones",
        input.constraints.locked_zones.iter().map(|l| &l.group_id),
    );
    let mut restrictions = input.constraints.safety_restrictions.clone();
    restrictions.sort();
    if restrictions.windows(2).any(|pair| pair[0] == pair[1]) {
        err(
            &mut diagnostics,
            "constraints.safetyRestrictions",
            "duplicate_safety_restriction",
        );
    }
    for item in &input.items {
        let path = format!("items.{}", item.id.as_str());
        text_bounds(
            &mut diagnostics,
            format!("{path}.label"),
            &item.label,
            MAX_LABEL_CHARS,
            true,
        );
        text_bounds(
            &mut diagnostics,
            format!("{path}.category"),
            &item.category,
            MAX_LABEL_CHARS,
            false,
        );
        if item.requirement.allowed_retrieval_modes.is_empty() {
            err(
                &mut diagnostics,
                format!("{path}.requirement.allowedRetrievalModes"),
                "empty_retrieval_modes",
            );
        }
        let mut modes = item.requirement.allowed_retrieval_modes.clone();
        modes.sort();
        if modes.windows(2).any(|pair| pair[0] == pair[1]) {
            err(
                &mut diagnostics,
                format!("{path}.requirement.allowedRetrievalModes"),
                "duplicate_retrieval_mode",
            );
        }
        if let Fact::Known { value, .. } = &item.requirement.allowed_orientations {
            if value.is_empty() {
                err(
                    &mut diagnostics,
                    format!("{path}.requirement.allowedOrientations"),
                    "empty_orientations",
                );
            }
            let mut sorted = value.clone();
            sorted.sort();
            if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
                err(
                    &mut diagnostics,
                    format!("{path}.requirement.allowedOrientations"),
                    "duplicate_orientation",
                );
            }
        }
        for compat in &item.requirement.mandatory_compatibility {
            if compat == &item.id {
                err(
                    &mut diagnostics,
                    format!("{path}.requirement.mandatoryCompatibility"),
                    "self_reference",
                );
            } else if !item_ids.contains(compat.as_str()) {
                err(
                    &mut diagnostics,
                    format!("{path}.requirement.mandatoryCompatibility"),
                    "dangling_item_ref",
                );
            }
        }
    }
    for owned in &input.owned_containers {
        let path = format!("ownedContainers.{}", owned.id.as_str());
        if let (Some(owned_qty), Some(available_qty)) = (
            owned.quantity_owned.value(),
            owned.quantity_available.value(),
        ) && available_qty.get() > owned_qty.get()
        {
            err(
                &mut diagnostics,
                format!("{path}.quantityAvailable"),
                "available_exceeds_owned",
            );
        }
        if let Fact::Known { value, .. } = &owned.physical.dimensions.inner_support
            && !matches!(value.kind, SupportKind::ContainerCavityFloor)
        {
            err(
                &mut diagnostics,
                format!("{path}.physical.dimensions.innerSupport"),
                "invalid_support_kind",
            );
        }
    }
    check_evidence_entries(&mut diagnostics, "evidence", &input.evidence);
    check_evidence_refs(&mut diagnostics, "input", input, &input.evidence);
    check_provenance_wellformed(&mut diagnostics, "input", input);
    let serialized = serde_json::to_value(input).expect("typed DTO serializes");
    reject_not_applicable(&mut diagnostics, &serialized, "input", &[]);
    diagnostics
}

fn check_catalog_body(
    diagnostics: &mut Vec<Diagnostic>,
    products: &[Product],
    variants: &[ProductVariant],
    offers: &[Offer],
    evidence: &[Evidence],
) {
    if products.len() > MAX_COLLECTION {
        err(diagnostics, "products", "input_limit_exceeded");
    }
    if variants.len() > MAX_CATALOG_VARIANTS {
        err(diagnostics, "variants", "input_limit_exceeded");
    }
    if offers.len() > MAX_CATALOG_OFFERS {
        err(diagnostics, "offers", "input_limit_exceeded");
    }
    duplicate_ids(diagnostics, "products", products.iter().map(|p| &p.id));
    duplicate_ids(diagnostics, "variants", variants.iter().map(|v| &v.id));
    duplicate_ids(diagnostics, "offers", offers.iter().map(|o| &o.id));
    check_evidence_entries(diagnostics, "evidence", evidence);
    let product_ids: BTreeSet<&str> = products.iter().map(|p| p.id.as_str()).collect();
    let variant_ids: BTreeSet<&str> = variants.iter().map(|v| v.id.as_str()).collect();
    for product in products {
        let path = format!("products.{}", product.id.as_str());
        text_bounds(
            diagnostics,
            format!("{path}.name"),
            &product.name,
            MAX_LABEL_CHARS,
            true,
        );
        text_bounds(
            diagnostics,
            format!("{path}.category"),
            &product.category,
            MAX_LABEL_CHARS,
            true,
        );
    }
    for variant in variants {
        let path = format!("variants.{}", variant.id.as_str());
        if !product_ids.contains(variant.product_id.as_str()) {
            err(
                diagnostics,
                format!("{path}.productId"),
                "dangling_product_ref",
            );
        }
        text_bounds(
            diagnostics,
            format!("{path}.optionLabel"),
            &variant.option_label,
            MAX_LABEL_CHARS,
            true,
        );
        if let Fact::Known { value, .. } = &variant.dimensions.inner_support
            && !matches!(value.kind, SupportKind::ContainerCavityFloor)
        {
            err(
                diagnostics,
                format!("{path}.dimensions.innerSupport"),
                "invalid_support_kind",
            );
        }
        if let Fact::Known { value, .. } = &variant.compatibility {
            for id in value {
                if !variant_ids.contains(id.as_str()) {
                    err(
                        diagnostics,
                        format!("{path}.compatibility"),
                        "dangling_variant_ref",
                    );
                }
            }
            let mut sorted = value.clone();
            sorted.sort();
            if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
                err(
                    diagnostics,
                    format!("{path}.compatibility"),
                    "duplicate_id_reference",
                );
            }
        }
        if let Fact::Known { value, .. } = &variant.allowed_orientations {
            if value.is_empty() {
                err(
                    diagnostics,
                    format!("{path}.allowedOrientations"),
                    "empty_orientations",
                );
            }
            let mut sorted = value.clone();
            sorted.sort();
            if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
                err(
                    diagnostics,
                    format!("{path}.allowedOrientations"),
                    "duplicate_orientation",
                );
            }
        }
        if let Fact::Known { value, .. } = &variant.stackability
            && let Stackability::Stackable { max_units } = value
            && *max_units == 0
        {
            err(
                diagnostics,
                format!("{path}.stackability"),
                "invalid_stackability",
            );
        }
    }
    for offer in offers {
        let path = format!("offers.{}", offer.id.as_str());
        if !variant_ids.contains(offer.variant_id.as_str()) {
            err(
                diagnostics,
                format!("{path}.variantId"),
                "dangling_variant_ref",
            );
        }
        if let Some(observed) = &offer.observed_at
            && !valid_utc_timestamp(observed)
        {
            err(
                diagnostics,
                format!("{path}.observedAt"),
                "invalid_timestamp",
            );
        }
        if let Fact::Known { value, .. } = &offer.url
            && !valid_locator(value)
        {
            err(diagnostics, format!("{path}.url"), "invalid_locator");
        }
        let mut seen = BTreeSet::new();
        for component in &offer.bundle_components {
            if !variant_ids.contains(component.variant_id.as_str()) {
                err(
                    diagnostics,
                    format!("{path}.bundleComponents"),
                    "dangling_variant_ref",
                );
            }
            if !seen.insert(component.variant_id.as_str()) {
                err(
                    diagnostics,
                    format!("{path}.bundleComponents"),
                    "duplicate_id_reference",
                );
            }
        }
    }
}
/// Structural validation of catalog content (shared by `CatalogImportDto`
/// validation, snapshot verification and activation).
pub fn validate_catalog_content(content: &CatalogContent) -> Vec<Diagnostic> {
    let mut diagnostics = vec![];
    if content.schema_version != crate::canonical::SCHEMA_VERSION {
        err(
            &mut diagnostics,
            "schemaVersion",
            "unsupported_schema_version",
        );
    }
    text_bounds(
        &mut diagnostics,
        "catalogVersion",
        &content.catalog_version,
        MAX_LABEL_CHARS,
        true,
    );
    text_bounds(
        &mut diagnostics,
        "ingestionVersion",
        &content.ingestion_version,
        MAX_LABEL_CHARS,
        true,
    );
    check_catalog_body(
        &mut diagnostics,
        &content.products,
        &content.variants,
        &content.offers,
        &content.evidence,
    );
    duplicate_ids(
        &mut diagnostics,
        "sourceObservations",
        content.source_observations.iter().map(|s| &s.id),
    );
    for observation in &content.source_observations {
        let path = format!("sourceObservations.{}", observation.id.as_str());
        text_bounds(
            &mut diagnostics,
            format!("{path}.note"),
            &observation.note,
            MAX_NOTE_CHARS,
            false,
        );
        if let Some(observed) = &observation.observed_at
            && !valid_utc_timestamp(observed)
        {
            err(
                &mut diagnostics,
                format!("{path}.observedAt"),
                "invalid_timestamp",
            );
        }
    }
    check_evidence_refs(&mut diagnostics, "catalog", content, &content.evidence);
    check_provenance_wellformed(&mut diagnostics, "catalog", content);
    let serialized = serde_json::to_value(content).expect("typed DTO serializes");
    // Offer-level facts may be not-applicable (e.g. a purchase-free offer).
    reject_not_applicable(
        &mut diagnostics,
        &serialized,
        "catalog",
        &["catalog.offers"],
    );
    diagnostics
}

/// A resolved container placement's inner support ids for support checks.
fn container_support_ids(
    placement: &Placement,
    input: &ProjectInput,
    variants: &BTreeMap<&str, &ProductVariant>,
) -> Vec<Id> {
    match &placement.subject {
        PlacementSubject::OwnedContainer { owned_id, .. } => input
            .owned_containers
            .iter()
            .find(|o| &o.id == owned_id)
            .and_then(|o| {
                if let Fact::Known { value, .. } = &o.physical.dimensions.inner_support {
                    Some(vec![value.id.clone()])
                } else {
                    None
                }
            })
            .unwrap_or_default(),
        PlacementSubject::NewContainer { variant_id, .. } => variants
            .get(variant_id.as_str())
            .and_then(|v| {
                if let Fact::Known { value, .. } = &v.dimensions.inner_support {
                    Some(vec![value.id.clone()])
                } else {
                    None
                }
            })
            .unwrap_or_default(),
        PlacementSubject::DirectItem { .. } => vec![],
    }
}
/// Structural validation of a candidate layout against its input and catalog
/// variants. Checks references, cycles, ordinal partitions, caps and purchase
/// bindings; no geometric predicates.
pub fn validate_layout(
    layout: &CandidateLayout,
    input: &ProjectInput,
    variants: &BTreeMap<&str, &ProductVariant>,
    offers: &BTreeMap<&str, &Offer>,
) -> Vec<Diagnostic> {
    let mut diagnostics = vec![];
    duplicate_ids(
        &mut diagnostics,
        "placements",
        layout.placements.iter().map(|p| &p.id),
    );
    let placements: BTreeMap<&str, &Placement> = layout
        .placements
        .iter()
        .map(|p| (p.id.as_str(), p))
        .collect();
    let item_ids: BTreeMap<&str, &Item> = input.items.iter().map(|i| (i.id.as_str(), i)).collect();
    let owned_ids: BTreeMap<&str, &OwnedContainer> = input
        .owned_containers
        .iter()
        .map(|o| (o.id.as_str(), o))
        .collect();
    let mut container_count = 0usize;
    let mut support_ids: BTreeSet<String> =
        BTreeSet::from([input.space.support.id.as_str().to_owned()]);
    let mut subjects = BTreeSet::new();
    for placement in &layout.placements {
        let path = format!("placements.{}", placement.id.as_str());
        match &placement.parent {
            ParentRef::Space { space_id } => {
                if space_id != &input.space.id {
                    err(
                        &mut diagnostics,
                        format!("{path}.parent"),
                        "dangling_space_ref",
                    );
                }
            }
            ParentRef::Container { .. } => {
                // v1 nesting is space→container→item; items nest via
                // ItemLocation, so no placement may have a container parent.
                err(
                    &mut diagnostics,
                    format!("{path}.parent"),
                    "nesting_depth_exceeded",
                );
            }
        }
        let (subject_key, container) = match &placement.subject {
            PlacementSubject::OwnedContainer {
                owned_id,
                unit_ordinal,
            } => {
                container_count += 1;
                let key = format!("owned:{}:{}", owned_id.as_str(), unit_ordinal);
                match owned_ids.get(owned_id.as_str()) {
                    None => err(
                        &mut diagnostics,
                        format!("{path}.subject"),
                        "dangling_owned_ref",
                    ),
                    Some(owned) => {
                        if let Some(qty) = owned.quantity_owned.value() {
                            if *unit_ordinal >= qty.get() {
                                err(
                                    &mut diagnostics,
                                    format!("{path}.subject"),
                                    "ordinal_out_of_range",
                                );
                            }
                        } else {
                            err(
                                &mut diagnostics,
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
                container_count += 1;
                let key = format!("new:{}:{}", variant_id.as_str(), unit_ordinal);
                if !variants.contains_key(variant_id.as_str()) {
                    err(
                        &mut diagnostics,
                        format!("{path}.subject"),
                        "dangling_variant_ref",
                    );
                }
                if *unit_ordinal >= MAX_EXPANDED_INSTANCES as u32 {
                    err(
                        &mut diagnostics,
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
                        &mut diagnostics,
                        format!("{path}.subject"),
                        "dangling_item_ref",
                    ),
                    Some(item) => {
                        if let Some(qty) = item.quantity.value() {
                            if *unit_ordinal >= qty.get() {
                                err(
                                    &mut diagnostics,
                                    format!("{path}.subject"),
                                    "ordinal_out_of_range",
                                );
                            }
                        } else {
                            err(
                                &mut diagnostics,
                                format!("{path}.subject"),
                                "unknown_quantity_ordinals",
                            );
                        }
                    }
                }
                (key, false)
            }
        };
        if !subjects.insert(subject_key) {
            err(
                &mut diagnostics,
                format!("{path}.subject"),
                "duplicate_subject",
            );
        }
        if container {
            for id in container_support_ids(placement, input, variants) {
                support_ids.insert(id.as_str().to_owned());
            }
        }
    }
    if container_count > MAX_PLACED_CONTAINERS {
        err(&mut diagnostics, "placements", "input_limit_exceeded");
    }
    // Support references must name the compartment floor or a placed
    // container's cavity floor.
    for placement in &layout.placements {
        if !support_ids.contains(placement.support_id.as_str()) {
            err(
                &mut diagnostics,
                format!("placements.{}.supportId", placement.id.as_str()),
                "dangling_support_ref",
            );
        }
    }
    // Assignments: unique instance identity, existing item, matching location.
    let mut assigned: BTreeMap<&str, BTreeSet<u32>> = BTreeMap::new();
    let mut expanded: u64 = 0;
    for assignment in &layout.assignments {
        let path = format!(
            "assignments.{}:{}",
            assignment.item_id.as_str(),
            assignment.unit_ordinal
        );
        expanded += 1;
        let Some(item) = item_ids.get(assignment.item_id.as_str()) else {
            err(&mut diagnostics, path.clone(), "dangling_item_ref");
            continue;
        };
        if let Some(qty) = item.quantity.value() {
            if assignment.unit_ordinal >= qty.get() {
                err(&mut diagnostics, path.clone(), "ordinal_out_of_range");
            }
        } else {
            err(&mut diagnostics, path.clone(), "unknown_quantity_ordinals");
        }
        if !assigned
            .entry(assignment.item_id.as_str())
            .or_default()
            .insert(assignment.unit_ordinal)
        {
            err(&mut diagnostics, path.clone(), "duplicate_assignment");
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
                        &mut diagnostics,
                        path.clone(),
                        "assignment_placement_mismatch",
                    ),
                    None => err(&mut diagnostics, path.clone(), "dangling_placement_ref"),
                }
                if !item
                    .requirement
                    .allowed_retrieval_modes
                    .contains(&RetrievalMode::DirectFrontExtraction)
                {
                    err(
                        &mut diagnostics,
                        path.clone(),
                        "retrieval_mode_not_permitted",
                    );
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
                        if !support_ids.contains(local_placement.support_id.as_str()) {
                            err(&mut diagnostics, path.clone(), "dangling_support_ref");
                        }
                    }
                    Some(_) => err(&mut diagnostics, path.clone(), "invalid_container_ref"),
                    None => err(&mut diagnostics, path.clone(), "dangling_placement_ref"),
                }
                if !item
                    .requirement
                    .allowed_retrieval_modes
                    .contains(&RetrievalMode::PullContainerThenRetrieve)
                {
                    err(
                        &mut diagnostics,
                        path.clone(),
                        "retrieval_mode_not_permitted",
                    );
                }
            }
            ItemLocation::ProvisionalContainer {
                container_placement_id,
                reason_code,
            } => {
                match placements.get(container_placement_id.as_str()) {
                    Some(placement)
                        if !matches!(placement.subject, PlacementSubject::DirectItem { .. }) => {}
                    Some(_) => err(&mut diagnostics, path.clone(), "invalid_container_ref"),
                    None => err(&mut diagnostics, path.clone(), "dangling_placement_ref"),
                }
                if reason_code.trim().is_empty() || reason_code.chars().count() > MAX_LABEL_CHARS {
                    err(&mut diagnostics, path.clone(), "invalid_reason_code");
                }
                if !item
                    .requirement
                    .allowed_retrieval_modes
                    .contains(&RetrievalMode::PullContainerThenRetrieve)
                {
                    err(
                        &mut diagnostics,
                        path.clone(),
                        "retrieval_mode_not_permitted",
                    );
                }
            }
        }
    }
    // Per-item ordinal partition: known-quantity instances are covered exactly
    // once across assignments plus unassigned ranges.
    let mut unassigned_by_item: BTreeMap<&str, &Unassigned> = BTreeMap::new();
    for entry in &layout.unassigned {
        let path = format!("unassigned.{}", entry.item_id.as_str());
        let Some(item) = item_ids.get(entry.item_id.as_str()) else {
            err(&mut diagnostics, path.clone(), "dangling_item_ref");
            continue;
        };
        if unassigned_by_item
            .insert(entry.item_id.as_str(), entry)
            .is_some()
        {
            err(&mut diagnostics, path.clone(), "duplicate_unassigned");
        }
        if entry.reason_code.trim().is_empty()
            || entry.reason_code.chars().count() > MAX_LABEL_CHARS
        {
            err(
                &mut diagnostics,
                format!("{path}.reasonCode"),
                "invalid_reason_code",
            );
        }
        match (&entry.instances, item.quantity.value()) {
            (UnassignedInstances::UnknownQuantity {}, Some(_)) => {
                err(
                    &mut diagnostics,
                    format!("{path}.instances"),
                    "unknown_quantity_mismatch",
                );
            }
            (UnassignedInstances::Known { .. }, None) => {
                err(
                    &mut diagnostics,
                    format!("{path}.instances"),
                    "unknown_quantity_mismatch",
                );
            }
            (UnassignedInstances::Known { ranges }, Some(quantity)) => {
                let mut covered = vec![false; quantity.get() as usize];
                for ordinal in assigned
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
                    expanded += u64::from(range.end_exclusive - range.start);
                    if range.start >= range.end_exclusive
                        || range.end_exclusive > quantity.get()
                        || range.start < last_end
                    {
                        err(
                            &mut diagnostics,
                            format!("{path}.instances"),
                            "invalid_ordinal_range",
                        );
                    }
                    last_end = range.end_exclusive;
                    for ordinal in range.start..range.end_exclusive.min(quantity.get()) {
                        if let Some(slot) = covered.get_mut(ordinal as usize) {
                            if *slot {
                                err(
                                    &mut diagnostics,
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
                        &mut diagnostics,
                        format!("{path}.instances"),
                        "ordinal_partition_incomplete",
                    );
                }
            }
            (UnassignedInstances::UnknownQuantity {}, None) => {
                if assigned.contains_key(item.id.as_str()) {
                    err(
                        &mut diagnostics,
                        format!("{path}.instances"),
                        "unknown_quantity_mismatch",
                    );
                }
            }
        }
    }
    // An unknown-quantity item with no assignments is unaccounted inventory
    // unless an explicit UnknownQuantity unassigned entry exists.
    for item in &input.items {
        if item.quantity.value().is_none()
            && !assigned.contains_key(item.id.as_str())
            && !unassigned_by_item.contains_key(item.id.as_str())
        {
            err(
                &mut diagnostics,
                format!("unassigned.{}", item.id.as_str()),
                "ordinal_partition_incomplete",
            );
        }
    }
    for (item_id, ordinals) in &assigned {
        if let Some(item) = item_ids.get(item_id)
            && item.quantity.value().is_some()
            && !unassigned_by_item.contains_key(item_id)
            && ordinals.len() as u64
                != u64::from(item.quantity.value().map(|q| q.get()).unwrap_or(0))
        {
            // No unassigned entry: every known ordinal must be assigned.
            err(
                &mut diagnostics,
                format!("unassigned.{item_id}"),
                "ordinal_partition_incomplete",
            );
        }
    }
    // A known-quantity item absent from both assignments and unassigned
    // ranges has silently lost inventory.
    for item in &input.items {
        if item.quantity.value().is_some_and(|q| q.get() > 0)
            && !assigned.contains_key(item.id.as_str())
            && !unassigned_by_item.contains_key(item.id.as_str())
        {
            err(
                &mut diagnostics,
                format!("unassigned.{}", item.id.as_str()),
                "ordinal_partition_incomplete",
            );
        }
    }
    // Every DirectItem placement has exactly one matching Direct assignment.
    for placement in &layout.placements {
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
                    &mut diagnostics,
                    format!("placements.{}", placement.id.as_str()),
                    "direct_placement_unassigned",
                );
            }
        }
    }
    if expanded > MAX_EXPANDED_INSTANCES {
        err(&mut diagnostics, "assignments", "input_limit_exceeded");
    }
    // Purchase bindings: exactly one selection per new-container placement,
    // one homogeneous selected offer per variant.
    let new_placements: BTreeMap<&str, &Id> = layout
        .placements
        .iter()
        .filter_map(|p| match &p.subject {
            PlacementSubject::NewContainer { variant_id, .. } => Some((p.id.as_str(), variant_id)),
            _ => None,
        })
        .collect();
    let mut selected: BTreeSet<&str> = BTreeSet::new();
    let mut variant_offers: BTreeMap<&str, &Id> = BTreeMap::new();
    for selection in &layout.purchase_selections {
        let path = format!("purchaseSelections.{}", selection.placement_id.as_str());
        let Some(variant_id) = new_placements.get(selection.placement_id.as_str()) else {
            err(&mut diagnostics, path.clone(), "invalid_purchase_subject");
            continue;
        };
        if !selected.insert(selection.placement_id.as_str()) {
            err(
                &mut diagnostics,
                path.clone(),
                "duplicate_purchase_selection",
            );
        }
        match &selection.offer {
            OfferSelection::Selected { offer_id } => match offers.get(offer_id.as_str()) {
                Some(offer) if offer.variant_id == **variant_id => {
                    if let Some(other) = variant_offers.insert(variant_id.as_str(), offer_id)
                        && other != offer_id
                    {
                        err(
                            &mut diagnostics,
                            path.clone(),
                            "inconsistent_offer_selection",
                        );
                    }
                }
                Some(_) => err(&mut diagnostics, path.clone(), "offer_variant_mismatch"),
                None => err(&mut diagnostics, path.clone(), "dangling_offer_ref"),
            },
            OfferSelection::Unresolved { reason_code } => {
                if reason_code.trim().is_empty() || reason_code.chars().count() > MAX_LABEL_CHARS {
                    err(
                        &mut diagnostics,
                        format!("{path}.offer"),
                        "invalid_reason_code",
                    );
                }
            }
        }
    }
    for placement_id in new_placements.keys() {
        if !selected.contains(placement_id) {
            err(
                &mut diagnostics,
                format!("purchaseSelections.{placement_id}"),
                "missing_purchase_selection",
            );
        }
    }
    diagnostics
}

/// Structural validation of the strategy trace a proposal declares: resolved
/// groups must name real input groups and zone/item members, zone references
/// resolve against strategy or locked zones, and collections stay bounded.
pub fn validate_strategy(strategy: &StrategyDecision, input: &ProjectInput) -> Vec<Diagnostic> {
    let mut diagnostics = vec![];
    if strategy.groups.len() > MAX_COLLECTION
        || strategy.zones.len() > MAX_COLLECTION
        || strategy.reasons.len() > MAX_COLLECTION
        || strategy.assumptions.len() > MAX_COLLECTION
    {
        err(&mut diagnostics, "strategy", "input_limit_exceeded");
    }
    duplicate_ids(
        &mut diagnostics,
        "strategy.zones",
        strategy.zones.iter().map(|z| &z.id),
    );
    duplicate_ids(
        &mut diagnostics,
        "strategy.reasons",
        strategy.reasons.iter().map(|r| &r.id),
    );
    duplicate_ids(
        &mut diagnostics,
        "strategy.assumptions",
        strategy.assumptions.iter().map(|c| &c.id),
    );
    duplicate_ids(
        &mut diagnostics,
        "strategy.groups",
        strategy.groups.iter().map(|g| &g.group_id),
    );
    let zone_ids: BTreeSet<&str> = strategy
        .zones
        .iter()
        .map(|z| z.id.as_str())
        .chain(
            input
                .constraints
                .locked_zones
                .iter()
                .map(|l| l.zone.id.as_str()),
        )
        .collect();
    for resolved in &strategy.groups {
        let path = format!("strategy.groups.{}", resolved.group_id.as_str());
        let Some(group) = input.groups.iter().find(|g| g.id == resolved.group_id) else {
            err(&mut diagnostics, path, "dangling_group_ref");
            continue;
        };
        if !zone_ids.contains(resolved.zone_id.as_str()) {
            err(
                &mut diagnostics,
                format!("{path}.zoneId"),
                "dangling_zone_ref",
            );
        }
        let members: BTreeSet<&str> = group.item_ids.iter().map(|i| i.as_str()).collect();
        if resolved.item_ids.is_empty() {
            err(
                &mut diagnostics,
                format!("{path}.itemIds"),
                "empty_group_items",
            );
        }
        for item_id in &resolved.item_ids {
            if !members.contains(item_id.as_str()) {
                err(
                    &mut diagnostics,
                    format!("{path}.itemIds"),
                    "dangling_item_ref",
                );
            }
        }
    }
    let resolved_ids: BTreeSet<&str> = strategy
        .groups
        .iter()
        .map(|g| g.group_id.as_str())
        .collect();
    for priority in &strategy.priorities {
        if !resolved_ids.contains(priority.group_id.as_str()) {
            err(
                &mut diagnostics,
                format!("strategy.priorities.{}", priority.group_id.as_str()),
                "dangling_group_ref",
            );
        }
    }
    diagnostics
}

/// Structural validation of a full snapshot record: content references plus
/// layout rules against the embedded input facts and referenced catalog.
pub fn validate_snapshot(snapshot: &PlanSnapshot) -> Vec<Diagnostic> {
    let mut diagnostics = vec![];
    let content = &snapshot.content;
    if content.versions.schema_version != crate::canonical::SCHEMA_VERSION
        || content.versions.canonical_version != crate::canonical::CANONICAL_VERSION
    {
        err(
            &mut diagnostics,
            "content.versions",
            "unsupported_schema_version",
        );
    }
    diagnostics.extend(validate_project_input(&content.input_facts));
    let subset = &content.referenced_catalog;
    check_catalog_body(
        &mut diagnostics,
        &subset.products,
        &subset.variants,
        &subset.offers,
        &subset.evidence,
    );
    let variants: BTreeMap<&str, &ProductVariant> =
        subset.variants.iter().map(|v| (v.id.as_str(), v)).collect();
    let offers: BTreeMap<&str, &Offer> = subset.offers.iter().map(|o| (o.id.as_str(), o)).collect();
    diagnostics.extend(validate_layout(
        &CandidateLayout {
            placements: content.placements.clone(),
            assignments: content.assignments.clone(),
            unassigned: content.unassigned.clone(),
            purchase_selections: content.purchase_selections.clone(),
        },
        &content.input_facts,
        &variants,
        &offers,
    ));
    duplicate_ids(
        &mut diagnostics,
        "content.validation.checks",
        content.validation.checks.iter().map(|c| &c.id),
    );
    duplicate_ids(
        &mut diagnostics,
        "content.bom",
        content.bom.iter().map(|l| &l.id),
    );
    duplicate_ids(
        &mut diagnostics,
        "content.actions",
        content.actions.iter().map(|a| &a.id),
    );
    let action_ids: BTreeSet<&str> = content.actions.iter().map(|a| a.id.as_str()).collect();
    // Prerequisite references must exist and form an acyclic order.
    let mut edges: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for action in &content.actions {
        let path = format!("content.actions.{}", action.id.as_str());
        for dependency in action
            .prerequisite_step_ids
            .iter()
            .chain(action.required_confirmations.iter())
        {
            if !action_ids.contains(dependency.as_str()) {
                err(
                    &mut diagnostics,
                    format!("{path}.prerequisiteStepIds"),
                    "dangling_action_ref",
                );
            } else {
                edges
                    .entry(action.id.as_str())
                    .or_default()
                    .push(dependency.as_str());
            }
        }
    }
    // Kahn's algorithm over prerequisite edges; leftover nodes are a cycle.
    let mut indegree: BTreeMap<&str, usize> = BTreeMap::new();
    let mut dependents: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (action, dependencies) in &edges {
        indegree.entry(*action).or_insert(0);
        for dependency in dependencies {
            *indegree.entry(*action).or_insert(0) += 1;
            dependents.entry(*dependency).or_default().push(*action);
            indegree.entry(*dependency).or_insert(0);
        }
    }
    let mut queue: Vec<&str> = indegree
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(id, _)| *id)
        .collect();
    let mut visited = 0usize;
    while let Some(id) = queue.pop() {
        visited += 1;
        for dependent in dependents.get(id).into_iter().flatten() {
            let degree = indegree.get_mut(dependent).expect("edge target tracked");
            *degree -= 1;
            if *degree == 0 {
                queue.push(*dependent);
            }
        }
    }
    if visited < indegree.len() {
        err(
            &mut diagnostics,
            "content.actions",
            "cyclic_action_dependencies",
        );
    }
    let group_ids: BTreeSet<&str> = content
        .input_facts
        .groups
        .iter()
        .map(|g| g.id.as_str())
        .collect();
    for group_id in &content.scope.group_ids {
        if !group_ids.contains(group_id.as_str()) {
            err(
                &mut diagnostics,
                "content.scope.groupIds",
                "dangling_group_ref",
            );
        }
    }
    for group in &content.strategy.groups {
        if !group_ids.contains(group.group_id.as_str()) {
            err(
                &mut diagnostics,
                "content.strategy.groups",
                "dangling_group_ref",
            );
        }
    }
    for line in &content.bom {
        let path = format!("content.bom.{}", line.id.as_str());
        for placement_id in &line.placement_ids {
            if !content.placements.iter().any(|p| &p.id == placement_id) {
                err(
                    &mut diagnostics,
                    format!("{path}.placementIds"),
                    "dangling_placement_ref",
                );
            }
        }
        if let Some(offer_id) = &line.offer_id
            && !offers.contains_key(offer_id.as_str())
        {
            err(
                &mut diagnostics,
                format!("{path}.offerId"),
                "dangling_offer_ref",
            );
        }
    }
    let serialized = serde_json::to_value(content).expect("typed DTO serializes");
    reject_not_applicable(
        &mut diagnostics,
        &serialized,
        "content",
        &[
            "content.referencedCatalog.offers",
            "content.bom",
            "content.costSummary",
        ],
    );
    diagnostics
}
