//! Raw project input → validated `ProjectInput` normalization. Every field
//! conversion produces either a domain fact or an explicit unknown plus a
//! diagnostic; nothing malformed becomes a passing default.

use crate::canonical::canonicalize_input;
use crate::catalog::*;
use crate::facts::*;
use crate::input::*;
use crate::raw::*;
use crate::scalars::*;
use crate::validate;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

fn bounded_text(text: &str, max: usize, path: &str, diagnostics: &mut Vec<Diagnostic>) -> String {
    let normalized: String = text.trim().nfc().collect();
    if normalized.chars().count() > max {
        error(diagnostics, path, "text_too_long");
    }
    normalized
}
fn required_text(text: &str, max: usize, path: &str, diagnostics: &mut Vec<Diagnostic>) -> String {
    let normalized = bounded_text(text, max, path, diagnostics);
    if normalized.is_empty() {
        error(diagnostics, path, "required_text_missing");
    }
    normalized
}
fn parse_bounded_text(text: &str) -> Result<Option<String>, String> {
    let normalized: String = text.trim().nfc().collect();
    if normalized.is_empty() {
        return Ok(None);
    }
    if normalized.chars().count() > MAX_LABEL_CHARS {
        return Err("text_too_long".into());
    }
    Ok(Some(normalized))
}

fn nfc_fact_strings(fact: &Fact<String>) -> Fact<String> {
    match fact {
        Fact::Known { value, provenance } => Fact::Known {
            value: value.nfc().collect(),
            provenance: provenance.clone(),
        },
        other => other.clone(),
    }
}

fn normalize_quantity_fact(
    raw: &RawQuantityFact,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<Quantity> {
    normalize_text_fact(
        raw,
        UnknownReason::NotProvided,
        parse_quantity,
        path,
        diagnostics,
    )
}
fn normalize_mass_fact(
    raw: &RawMassFact,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<MassGrams> {
    normalize_text_fact(
        raw,
        UnknownReason::NotProvided,
        parse_mass_grams,
        path,
        diagnostics,
    )
}
fn normalize_money_fact(
    raw: &RawMoneyFact,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<MoneyKrw> {
    normalize_text_fact(
        raw,
        UnknownReason::NotProvided,
        parse_money_krw,
        path,
        diagnostics,
    )
}
fn normalize_clearance_fact(
    raw: &RawClearanceFact,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<ClearanceMm> {
    // Clearance facts are nonnegative whole millimetres.
    normalize_text_fact(
        raw,
        UnknownReason::NotProvided,
        |text| parse_clearance(text, crate::scalars::Unit::Mm),
        path,
        diagnostics,
    )
}

fn normalize_dimensions(
    raw: &RawDimensionsDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Dimensions {
    Dimensions {
        width: normalize_measurement(&raw.width, &format!("{path}.width"), diagnostics),
        depth: normalize_measurement(&raw.depth, &format!("{path}.depth"), diagnostics),
        height: normalize_measurement(&raw.height, &format!("{path}.height"), diagnostics),
    }
}
fn normalize_cuboid(
    raw: &RawMeasuredCuboidDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> MeasuredCuboid {
    MeasuredCuboid {
        min_x: normalize_offset(&raw.min_x, &format!("{path}.minX"), diagnostics),
        min_y: normalize_offset(&raw.min_y, &format!("{path}.minY"), diagnostics),
        min_z: normalize_offset(&raw.min_z, &format!("{path}.minZ"), diagnostics),
        extent: normalize_dimensions(&raw.extent, &format!("{path}.extent"), diagnostics),
    }
}
fn normalize_rectangle(
    raw: &RawMeasuredRectangleDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> MeasuredRectangle {
    MeasuredRectangle {
        x: normalize_offset(&raw.x, &format!("{path}.x"), diagnostics),
        y: normalize_offset(&raw.y, &format!("{path}.y"), diagnostics),
        width: normalize_measurement(&raw.width, &format!("{path}.width"), diagnostics),
        depth: normalize_measurement(&raw.depth, &format!("{path}.depth"), diagnostics),
    }
}
fn normalize_support(
    raw: &RawSupportSurfaceDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> SupportSurface {
    SupportSurface {
        id: raw.id.clone(),
        kind: raw.kind.clone(),
        footprint: normalize_rectangle(&raw.footprint, &format!("{path}.footprint"), diagnostics),
        elevation: normalize_offset(&raw.elevation, &format!("{path}.elevation"), diagnostics),
        load_limit: normalize_mass_fact(&raw.load_limit, &format!("{path}.loadLimit"), diagnostics),
    }
}
fn normalize_clearance_policy(
    raw: &RawClearancePolicyDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> ClearancePolicy {
    let mut rule_ids: Vec<String> = raw
        .rule_ids
        .iter()
        .map(|rule| {
            bounded_text(
                rule,
                MAX_LABEL_CHARS,
                &format!("{path}.ruleIds"),
                diagnostics,
            )
        })
        .collect();
    rule_ids.retain(|rule| !rule.is_empty());
    rule_ids.sort();
    rule_ids.dedup();
    ClearancePolicy {
        left: normalize_clearance_fact(&raw.left, &format!("{path}.left"), diagnostics),
        right: normalize_clearance_fact(&raw.right, &format!("{path}.right"), diagnostics),
        front: normalize_clearance_fact(&raw.front, &format!("{path}.front"), diagnostics),
        back: normalize_clearance_fact(&raw.back, &format!("{path}.back"), diagnostics),
        top: normalize_clearance_fact(&raw.top, &format!("{path}.top"), diagnostics),
        between_units: normalize_clearance_fact(
            &raw.between_units,
            &format!("{path}.betweenUnits"),
            diagnostics,
        ),
        rule_ids,
    }
}
fn normalize_cavity_clearances(
    raw: &RawCavityClearancePolicyDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> CavityClearancePolicy {
    CavityClearancePolicy {
        left: normalize_clearance_fact(&raw.left, &format!("{path}.left"), diagnostics),
        right: normalize_clearance_fact(&raw.right, &format!("{path}.right"), diagnostics),
        front: normalize_clearance_fact(&raw.front, &format!("{path}.front"), diagnostics),
        back: normalize_clearance_fact(&raw.back, &format!("{path}.back"), diagnostics),
        top: normalize_clearance_fact(&raw.top, &format!("{path}.top"), diagnostics),
        between_items: normalize_clearance_fact(
            &raw.between_items,
            &format!("{path}.betweenItems"),
            diagnostics,
        ),
    }
}
fn normalize_handling(
    raw: &RawHandlingClearanceDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> HandlingClearance {
    HandlingClearance {
        left: normalize_clearance_fact(&raw.left, &format!("{path}.left"), diagnostics),
        right: normalize_clearance_fact(&raw.right, &format!("{path}.right"), diagnostics),
        top: normalize_clearance_fact(&raw.top, &format!("{path}.top"), diagnostics),
        pull_extra_depth: normalize_clearance_fact(
            &raw.pull_extra_depth,
            &format!("{path}.pullExtraDepth"),
            diagnostics,
        ),
        lift_above_rim: normalize_clearance_fact(
            &raw.lift_above_rim,
            &format!("{path}.liftAboveRim"),
            diagnostics,
        ),
    }
}
/// `Extent3Mm` has no per-axis uncertainty: a bounded raw extent rejects.
fn normalize_extent(
    raw: &RawExtent3Dto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Extent3Mm> {
    let mut axis = |raw: &RawMeasurementDto, axis: &str| -> Option<LengthMm> {
        let path = format!("{path}.{axis}");
        match normalize_measurement(raw, &path, diagnostics) {
            Fact::Known { value, .. } if matches!(value.uncertainty, Uncertainty::Unknown {}) => {
                Some(value.nominal)
            }
            Fact::Known { .. } => {
                error(diagnostics, &path, "uncertainty_not_supported");
                None
            }
            _ => None,
        }
    };
    Some(Extent3Mm {
        width: axis(&raw.width, "width")?,
        depth: axis(&raw.depth, "depth")?,
        height: axis(&raw.height, "height")?,
    })
}
fn normalize_handle_envelope(
    raw: &RawHandleEnvelopeDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<HandleEnvelope> {
    match raw {
        RawHandleEnvelopeDto::IncludedInOuter {} => Some(HandleEnvelope::IncludedInOuter {}),
        RawHandleEnvelopeDto::ExtraExtent { extent } => {
            normalize_extent(extent, &format!("{path}.extent"), diagnostics)
                .map(|extent| HandleEnvelope::ExtraExtent { extent })
        }
    }
}
fn normalize_variant_dimensions(
    raw: &RawVariantDimensionsDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> VariantDimensions {
    VariantDimensions {
        outer: normalize_dimensions(&raw.outer, &format!("{path}.outer"), diagnostics),
        inner: normalize_dimensions(&raw.inner, &format!("{path}.inner"), diagnostics),
        inner_offset: normalize_nested_fact(
            &raw.inner_offset,
            &format!("{path}.innerOffset"),
            diagnostics,
            |offset, path, diagnostics| {
                Some(InnerOffset {
                    x: normalize_offset(&offset.x, &format!("{path}.x"), diagnostics),
                    y: normalize_offset(&offset.y, &format!("{path}.y"), diagnostics),
                    z: normalize_offset(&offset.z, &format!("{path}.z"), diagnostics),
                })
            },
        ),
        inner_support: normalize_nested_fact(
            &raw.inner_support,
            &format!("{path}.innerSupport"),
            diagnostics,
            |support, path, diagnostics| Some(normalize_support(support, path, diagnostics)),
        ),
        handles: normalize_nested_fact(
            &raw.handles,
            &format!("{path}.handles"),
            diagnostics,
            normalize_handle_envelope,
        ),
        lid_state: normalize_raw_fact(&raw.lid_state, &format!("{path}.lidState"), diagnostics),
        cavity_model: normalize_raw_fact(
            &raw.cavity_model,
            &format!("{path}.cavityModel"),
            diagnostics,
        ),
        cavity_clearances: normalize_cavity_clearances(
            &raw.cavity_clearances,
            &format!("{path}.cavityClearances"),
            diagnostics,
        ),
    }
}
fn normalize_physical(
    raw: &RawPhysicalContainerModelDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> PhysicalContainerModel {
    PhysicalContainerModel {
        dimensions: normalize_variant_dimensions(
            &raw.dimensions,
            &format!("{path}.dimensions"),
            diagnostics,
        ),
        primitive: raw.primitive.clone(),
        allowed_orientations: normalize_orientations(
            &raw.allowed_orientations,
            &format!("{path}.allowedOrientations"),
            diagnostics,
        ),
        mass: normalize_mass_fact(&raw.mass, &format!("{path}.mass"), diagnostics),
        handling: normalize_handling(&raw.handling, &format!("{path}.handling"), diagnostics),
    }
}
/// Orientation lists are a set: canonical order, duplicates rejected.
fn normalize_orientations(
    raw: &RawFactDto<Vec<Orientation>>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<Vec<Orientation>> {
    match normalize_raw_fact(raw, path, diagnostics) {
        Fact::Known { value, provenance } => {
            let mut sorted = value;
            sorted.sort();
            if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
                error(diagnostics, path, "duplicate_orientation");
                return Fact::unknown();
            }
            Fact::Known {
                value: sorted,
                provenance,
            }
        }
        other => other,
    }
}
fn normalize_retrieval_modes(
    modes: &[RetrievalMode],
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Vec<RetrievalMode> {
    let mut sorted = modes.to_vec();
    sorted.sort();
    if sorted.is_empty() {
        error(diagnostics, path, "empty_retrieval_modes");
    } else if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
        error(diagnostics, path, "duplicate_retrieval_mode");
    }
    sorted.dedup();
    sorted
}
fn normalize_id_list(ids: &[Id], path: &str, diagnostics: &mut Vec<Diagnostic>) -> Vec<Id> {
    match normalize_id_set(ids, path, diagnostics) {
        Some(ids) => ids,
        None => {
            let mut sorted = ids.to_vec();
            sorted.sort();
            sorted.dedup();
            sorted
        }
    }
}
fn normalize_owned(
    raw: &RawOwnedContainerDto,
    diagnostics: &mut Vec<Diagnostic>,
) -> OwnedContainer {
    let path = format!("ownedContainers.{}", raw.id.as_str());
    OwnedContainer {
        id: raw.id.clone(),
        variant_ref: raw.variant_ref.as_ref().map(|r| VariantRef {
            variant_id: r.variant_id.clone(),
            catalog_digest: r.catalog_digest.clone(),
        }),
        physical: normalize_physical(&raw.physical, &format!("{path}.physical"), diagnostics),
        quantity_owned: normalize_quantity_fact(
            &raw.quantity_owned,
            &format!("{path}.quantityOwned"),
            diagnostics,
        ),
        quantity_available: normalize_quantity_fact(
            &raw.quantity_available,
            &format!("{path}.quantityAvailable"),
            diagnostics,
        ),
        condition: nfc_fact_strings(&normalize_text_fact(
            &raw.condition,
            UnknownReason::NotProvided,
            parse_bounded_text,
            &format!("{path}.condition"),
            diagnostics,
        )),
        allowed_use: nfc_fact_strings(&normalize_text_fact(
            &raw.allowed_use,
            UnknownReason::NotProvided,
            parse_bounded_text,
            &format!("{path}.allowedUse"),
            diagnostics,
        )),
        provenance: normalize_provenance(
            &raw.provenance,
            &format!("{path}.provenance"),
            diagnostics,
        )
        .unwrap_or_else(|| Provenance {
            origin: MeasurementOrigin::UserDeclared,
            verification: VerificationStatus::Unverified,
            evidence_ids: vec![],
            rule_ids: vec![],
            input_refs: vec![],
            observed_at: None,
        }),
    }
}
fn normalize_item(raw: &RawItemDto, diagnostics: &mut Vec<Diagnostic>) -> Item {
    let path = format!("items.{}", raw.id.as_str());
    Item {
        id: raw.id.clone(),
        label: required_text(
            &raw.label,
            MAX_LABEL_CHARS,
            &format!("{path}.label"),
            diagnostics,
        ),
        category: bounded_text(
            &raw.category,
            MAX_LABEL_CHARS,
            &format!("{path}.category"),
            diagnostics,
        ),
        quantity: normalize_quantity_fact(&raw.quantity, &format!("{path}.quantity"), diagnostics),
        dimensions: ItemDimensions {
            storage_state: bounded_text(
                &raw.dimensions.storage_state,
                MAX_LABEL_CHARS,
                &format!("{path}.dimensions.storageState"),
                diagnostics,
            ),
            envelope: normalize_dimensions(
                &raw.dimensions.envelope,
                &format!("{path}.dimensions.envelope"),
                diagnostics,
            ),
        },
        mass_each: normalize_mass_fact(&raw.mass_each, &format!("{path}.massEach"), diagnostics),
        requirement: StorageRequirement {
            allowed_orientations: normalize_orientations(
                &raw.requirement.allowed_orientations,
                &format!("{path}.requirement.allowedOrientations"),
                diagnostics,
            ),
            allowed_retrieval_modes: normalize_retrieval_modes(
                &raw.requirement.allowed_retrieval_modes,
                &format!("{path}.requirement.allowedRetrievalModes"),
                diagnostics,
            ),
            handling: normalize_handling(
                &raw.requirement.handling,
                &format!("{path}.requirement.handling"),
                diagnostics,
            ),
            must_stay_together: raw.requirement.must_stay_together,
            mandatory_compatibility: normalize_id_list(
                &raw.requirement.mandatory_compatibility,
                &format!("{path}.requirement.mandatoryCompatibility"),
                diagnostics,
            ),
        },
        frequency: normalize_raw_fact(&raw.frequency, &format!("{path}.frequency"), diagnostics),
        activity_ids: normalize_id_list(
            &raw.activity_ids,
            &format!("{path}.activityIds"),
            diagnostics,
        ),
        stock_role: normalize_raw_fact(&raw.stock_role, &format!("{path}.stockRole"), diagnostics),
    }
}
fn normalize_group(raw: &RawItemGroupDto, diagnostics: &mut Vec<Diagnostic>) -> ItemGroup {
    let path = format!("groups.{}", raw.id.as_str());
    ItemGroup {
        id: raw.id.clone(),
        label: required_text(
            &raw.label,
            MAX_LABEL_CHARS,
            &format!("{path}.label"),
            diagnostics,
        ),
        item_ids: normalize_id_list(&raw.item_ids, &format!("{path}.itemIds"), diagnostics),
        split_policy: raw.split_policy.clone(),
    }
}
fn normalize_preferences(raw: &Preferences, diagnostics: &mut Vec<Diagnostic>) -> Preferences {
    Preferences {
        objective_ranking: raw.objective_ranking.clone(),
        material: raw
            .material
            .as_ref()
            .map(|m| bounded_text(m, MAX_LABEL_CHARS, "preferences.material", diagnostics)),
        color: raw
            .color
            .as_ref()
            .map(|c| bounded_text(c, MAX_LABEL_CHARS, "preferences.color", diagnostics)),
        visual_notes: raw
            .visual_notes
            .iter()
            .map(|n| bounded_text(n, MAX_NOTE_CHARS, "preferences.visualNotes", diagnostics))
            .collect(),
    }
}
fn normalize_evidence_list(raw: &[Evidence], diagnostics: &mut Vec<Diagnostic>) -> Vec<Evidence> {
    raw.iter()
        .map(|e| {
            let path = format!("evidence.{}", e.id.as_str());
            if let Some(locator) = &e.locator
                && !valid_locator(locator)
            {
                error(diagnostics, &format!("{path}.locator"), "invalid_locator");
            }
            if let Some(observed) = &e.observed_at
                && !valid_utc_timestamp(observed)
            {
                error(
                    diagnostics,
                    &format!("{path}.observedAt"),
                    "invalid_timestamp",
                );
            }
            Evidence {
                id: e.id.clone(),
                source_kind: e.source_kind.clone(),
                locator: e.locator.clone(),
                source_field: bounded_text(
                    &e.source_field,
                    MAX_LABEL_CHARS,
                    &format!("{path}.sourceField"),
                    diagnostics,
                ),
                note: bounded_text(
                    &e.note,
                    MAX_NOTE_CHARS,
                    &format!("{path}.note"),
                    diagnostics,
                ),
                observed_at: e.observed_at.clone(),
                confirmed_by: e.confirmed_by.as_ref().map(|c| {
                    bounded_text(
                        c,
                        MAX_LABEL_CHARS,
                        &format!("{path}.confirmedBy"),
                        diagnostics,
                    )
                }),
            }
        })
        .collect()
}
/// Normalize raw project input into domain form plus diagnostics. On
/// diagnostics the returned input is still complete (facts are explicit
/// unknowns) but callers must not treat it as accepted.
pub fn normalize_project_input(raw: &RawProjectInputDto) -> (ProjectInput, Vec<Diagnostic>) {
    let mut diagnostics = vec![];
    if !valid_text(&raw.catalog_pin.catalog_version, MAX_LABEL_CHARS) {
        error(
            &mut diagnostics,
            "catalogPin.catalogVersion",
            "invalid_version",
        );
    }
    if !valid_text(&raw.search.profile.id, MAX_LABEL_CHARS) {
        error(&mut diagnostics, "search.profile.id", "invalid_profile");
    }
    let space_path = format!("space.{}", raw.space.id.as_str());
    let input = ProjectInput {
        catalog_pin: raw.catalog_pin.clone(),
        search: raw.search.clone(),
        space: Space {
            id: raw.space.id.clone(),
            kind: raw.space.kind.clone(),
            interior: normalize_dimensions(
                &raw.space.interior,
                &format!("{space_path}.interior"),
                &mut diagnostics,
            ),
            opening: SpaceOpening {
                plane: raw.space.opening.plane.clone(),
                left: normalize_offset(
                    &raw.space.opening.left,
                    &format!("{space_path}.opening.left"),
                    &mut diagnostics,
                ),
                bottom: normalize_offset(
                    &raw.space.opening.bottom,
                    &format!("{space_path}.opening.bottom"),
                    &mut diagnostics,
                ),
                width: normalize_measurement(
                    &raw.space.opening.width,
                    &format!("{space_path}.opening.width"),
                    &mut diagnostics,
                ),
                height: normalize_measurement(
                    &raw.space.opening.height,
                    &format!("{space_path}.opening.height"),
                    &mut diagnostics,
                ),
            },
            staging: StagingEnvelope {
                free_volume: normalize_cuboid(
                    &raw.space.staging.free_volume,
                    &format!("{space_path}.staging.freeVolume"),
                    &mut diagnostics,
                ),
                base_support: normalize_nested_fact(
                    &raw.space.staging.base_support,
                    &format!("{space_path}.staging.baseSupport"),
                    &mut diagnostics,
                    |support, path, diagnostics| {
                        Some(StagingSupport {
                            load_limit: normalize_mass_fact(
                                &support.load_limit,
                                &format!("{path}.loadLimit"),
                                diagnostics,
                            ),
                        })
                    },
                ),
            },
            support: normalize_support(
                &raw.space.support,
                &format!("{space_path}.support"),
                &mut diagnostics,
            ),
            obstacles: raw
                .space
                .obstacles
                .iter()
                .map(|obstacle| Obstacle {
                    id: obstacle.id.clone(),
                    bounds: normalize_cuboid(
                        &obstacle.bounds,
                        &format!("{space_path}.obstacles.{}.bounds", obstacle.id.as_str()),
                        &mut diagnostics,
                    ),
                    role: obstacle.role.clone(),
                })
                .collect(),
            clearances: normalize_clearance_policy(
                &raw.space.clearances,
                &format!("{space_path}.clearances"),
                &mut diagnostics,
            ),
        },
        items: raw
            .items
            .iter()
            .map(|i| normalize_item(i, &mut diagnostics))
            .collect(),
        groups: raw
            .groups
            .iter()
            .map(|g| normalize_group(g, &mut diagnostics))
            .collect(),
        owned_containers: raw
            .owned_containers
            .iter()
            .map(|o| normalize_owned(o, &mut diagnostics))
            .collect(),
        strategy_choice: raw.strategy_choice.clone(),
        constraints: UserConstraints {
            hard_budget: normalize_money_fact(
                &raw.constraints.hard_budget,
                "constraints.hardBudget",
                &mut diagnostics,
            ),
            soft_budget: normalize_money_fact(
                &raw.constraints.soft_budget,
                "constraints.softBudget",
                &mut diagnostics,
            ),
            purchase_allowed: raw.constraints.purchase_allowed,
            hard_one_action_access: raw.constraints.hard_one_action_access,
            safety_restrictions: raw.constraints.safety_restrictions.clone(),
            locked_zones: raw.constraints.locked_zones.clone(),
        },
        preferences: normalize_preferences(&raw.preferences, &mut diagnostics),
        evidence: normalize_evidence_list(&raw.evidence, &mut diagnostics),
    };
    let input = canonicalize_input(&input);
    diagnostics.extend(validate::validate_project_input(&input));
    // Normalization and structural validation can flag the same field;
    // identical (field, code) pairs carry no extra information.
    let mut seen = std::collections::BTreeSet::new();
    diagnostics.retain(|d| seen.insert((d.field_path.clone(), d.code.clone())));
    (input, diagnostics)
}

/// The declared scalar kind of a catalog field path, or `None` when the path
/// is not a generated catalog numeric path. `{id}` segments are entity ids.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CatalogFieldKind {
    Measurement,
    Quantity,
    PackQuantity,
    MoneyKrw,
    MassGrams,
    ClearanceMm,
    PositionMm,
}
pub fn catalog_field_kind(field_path: &str) -> Option<CatalogFieldKind> {
    let segments: Vec<&str> = field_path.split('.').collect();
    let (entity, id, rest) = match segments.as_slice() {
        [entity, id, rest @ ..] if !rest.is_empty() => (*entity, *id, rest),
        _ => return None,
    };
    if Id::new(id).is_err() {
        return None;
    }
    let variant_path = |rest: &[&str]| -> Option<CatalogFieldKind> {
        let measurement = || Some(CatalogFieldKind::Measurement);
        let clearance = || Some(CatalogFieldKind::ClearanceMm);
        let position = || Some(CatalogFieldKind::PositionMm);
        match rest {
            [
                "dimensions",
                "outer" | "inner",
                "width" | "depth" | "height",
            ] => measurement(),
            ["dimensions", "innerOffset", "x" | "y" | "z"] => position(),
            ["dimensions", "innerSupport", "footprint", "x" | "y"] => position(),
            ["dimensions", "innerSupport", "footprint", "width" | "depth"] => measurement(),
            ["dimensions", "innerSupport", "elevation"] => position(),
            ["dimensions", "innerSupport", "loadLimit"] => Some(CatalogFieldKind::MassGrams),
            [
                "dimensions",
                "cavityClearances",
                "left" | "right" | "front" | "back" | "top" | "betweenItems",
            ] => clearance(),
            [
                "dimensions",
                "handles",
                "extraExtent",
                "width" | "depth" | "height",
            ] => measurement(),
            [
                "handling",
                "left" | "right" | "top" | "pullExtraDepth" | "liftAboveRim",
            ] => clearance(),
            ["mass"] => Some(CatalogFieldKind::MassGrams),
            _ => None,
        }
    };
    match entity {
        "variants" => variant_path(rest),
        "offers" => match rest {
            ["packQuantity"] => Some(CatalogFieldKind::PackQuantity),
            ["packPrice"] | ["shipping", "fee"] => Some(CatalogFieldKind::MoneyKrw),
            _ => None,
        },
        _ => None,
    }
}
fn catalog_field_kind_of(value: &RawCatalogFieldValueDto) -> CatalogFieldKind {
    match value {
        RawCatalogFieldValueDto::Measurement { .. } => CatalogFieldKind::Measurement,
        RawCatalogFieldValueDto::Quantity { .. } => CatalogFieldKind::Quantity,
        RawCatalogFieldValueDto::PackQuantity { .. } => CatalogFieldKind::PackQuantity,
        RawCatalogFieldValueDto::MoneyKrw { .. } => CatalogFieldKind::MoneyKrw,
        RawCatalogFieldValueDto::MassGrams { .. } => CatalogFieldKind::MassGrams,
        RawCatalogFieldValueDto::ClearanceMm { .. } => CatalogFieldKind::ClearanceMm,
        RawCatalogFieldValueDto::PositionMm { .. } => CatalogFieldKind::PositionMm,
    }
}
/// The typed result of one converted catalog field.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CatalogFieldValue {
    Measurement { value: Measurement },
    Quantity { value: Fact<Quantity> },
    PackQuantity { value: Fact<PackQuantity> },
    MoneyKrw { value: Fact<MoneyKrw> },
    MassGrams { value: Fact<MassGrams> },
    ClearanceMm { value: Fact<ClearanceMm> },
    PositionMm { value: Fact<MeasuredOffset> },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NormalizedCatalogField {
    pub field_path: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<CatalogFieldValue>")]
    pub value: Option<CatalogFieldValue>,
    pub diagnostics: Vec<Diagnostic>,
}
fn scalar_field<T>(
    parse: impl FnOnce(&str) -> Result<Option<T>, String>,
    text: &str,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
    wrap: impl FnOnce(Fact<T>) -> CatalogFieldValue,
) -> Option<CatalogFieldValue> {
    match parse(text) {
        Ok(Some(value)) => Some(wrap(Fact::Known {
            value,
            provenance: Provenance {
                origin: MeasurementOrigin::UserDeclared,
                verification: VerificationStatus::Unverified,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            },
        })),
        Ok(None) => Some(wrap(Fact::Unknown {
            reason: UnknownReason::NotProvided,
        })),
        Err(e) => {
            error(diagnostics, path, e);
            None
        }
    }
}
/// Stateless catalog scalar conversion: per-path typed values or diagnostics.
/// Conversion never upgrades provenance and never writes into an object.
pub fn normalize_catalog_fields(fields: &[RawCatalogFieldDto]) -> Vec<NormalizedCatalogField> {
    fields
        .iter()
        .map(|field| {
            let path = field.field_path.clone();
            let mut diagnostics = vec![];
            let declared = catalog_field_kind_of(&field.value);
            let value = match catalog_field_kind(&path) {
                None => {
                    error(&mut diagnostics, &path, "unsupported_field_path");
                    None
                }
                Some(expected) if expected != declared => {
                    error(&mut diagnostics, &path, "field_kind_mismatch");
                    None
                }
                Some(_) => match &field.value {
                    RawCatalogFieldValueDto::Measurement { raw } => {
                        let mut inner = vec![];
                        let value = normalize_measurement(raw, &path, &mut inner);
                        diagnostics.extend(inner);
                        // Invalid text yields diagnostics and no typed value.
                        diagnostics
                            .is_empty()
                            .then_some(CatalogFieldValue::Measurement { value })
                    }
                    RawCatalogFieldValueDto::Quantity { text } => {
                        scalar_field(parse_quantity, text, &path, &mut diagnostics, |value| {
                            CatalogFieldValue::Quantity { value }
                        })
                    }
                    RawCatalogFieldValueDto::PackQuantity { text } => scalar_field(
                        parse_pack_quantity,
                        text,
                        &path,
                        &mut diagnostics,
                        |value| CatalogFieldValue::PackQuantity { value },
                    ),
                    RawCatalogFieldValueDto::MoneyKrw { text } => {
                        scalar_field(parse_money_krw, text, &path, &mut diagnostics, |value| {
                            CatalogFieldValue::MoneyKrw { value }
                        })
                    }
                    RawCatalogFieldValueDto::MassGrams { text } => {
                        scalar_field(parse_mass_grams, text, &path, &mut diagnostics, |value| {
                            CatalogFieldValue::MassGrams { value }
                        })
                    }
                    RawCatalogFieldValueDto::ClearanceMm { text } => scalar_field(
                        |text| parse_clearance(text, crate::scalars::Unit::Mm),
                        text,
                        &path,
                        &mut diagnostics,
                        |value| CatalogFieldValue::ClearanceMm { value },
                    ),
                    RawCatalogFieldValueDto::PositionMm { text } => {
                        let mut inner = vec![];
                        let fact = normalize_offset(
                            &RawOffsetDto {
                                text: text.clone(),
                                uncertainty: RawUncertaintyDto::Unknown {},
                                origin: MeasurementOrigin::UserDeclared,
                                evidence_ids: vec![],
                            },
                            &path,
                            &mut inner,
                        );
                        diagnostics.extend(inner);
                        diagnostics
                            .is_empty()
                            .then_some(CatalogFieldValue::PositionMm { value: fact })
                    }
                },
            };
            NormalizedCatalogField {
                field_path: path,
                value,
                diagnostics,
            }
        })
        .collect()
}

/// Resolve a known project measurement path to its normalized fact for
/// Rust-owned unit formatting.
pub fn project_measurement<'a>(
    input: &'a ProjectInput,
    field_path: &str,
) -> Option<&'a Measurement> {
    let segments: Vec<&str> = field_path.split('.').collect();
    let axis = |dimensions: &'a Dimensions, axis: &str| match axis {
        "width" => Some(&dimensions.width),
        "depth" => Some(&dimensions.depth),
        "height" => Some(&dimensions.height),
        _ => None,
    };
    match segments.as_slice() {
        ["space", "interior", axis_name] => axis(&input.space.interior, axis_name),
        ["space", "opening", axis_name @ ("width" | "height")] => {
            if *axis_name == "width" {
                Some(&input.space.opening.width)
            } else {
                Some(&input.space.opening.height)
            }
        }
        ["space", "staging", "freeVolume", "extent", axis_name] => {
            axis(&input.space.staging.free_volume.extent, axis_name)
        }
        ["space", "obstacles", id, "bounds", "extent", axis_name] => input
            .space
            .obstacles
            .iter()
            .find(|o| o.id.as_str() == *id)
            .and_then(|o| axis(&o.bounds.extent, axis_name)),
        ["items", id, "dimensions", "envelope", axis_name] => input
            .items
            .iter()
            .find(|i| i.id.as_str() == *id)
            .and_then(|i| axis(&i.dimensions.envelope, axis_name)),
        _ => None,
    }
}
