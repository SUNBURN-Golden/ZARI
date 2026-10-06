//! Typed measurement-field routing and nominal+bounds group formatting.
//!
//! React learns the field kind from this grammar. It does not invent one
//! from a sample id, and it does not convert a group with `parseFloat`.

use crate::facts::*;
use crate::input::*;
use crate::normalize::catalog_field_kind;
use crate::scalars::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Finite measurement kinds. Catalogue and owned-container physical facts
/// use the same kinds but are not project-mutable.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum MeasurementFieldKind {
    PositiveLength,
    SignedOffset,
    Clearance,
    Quantity,
    MassGrams,
    MoneyKrw,
    PackQuantity,
}

/// Which record the path addresses. Space has no id in the path; the caller
/// binds `ProjectInput.space.id`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RoutedEntity {
    Space {},
    Obstacle { id: Id },
    Item { id: Id },
    OwnedContainer { id: Id },
    CatalogVariant { id: Id },
    CatalogOffer { id: Id },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FieldRoute {
    pub field_path: String,
    pub entity: RoutedEntity,
    pub kind: MeasurementFieldKind,
    pub mutable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasurementGroupFormatRequest {
    pub field_path: String,
    pub unit: Unit,
}

/// Uncertainty texts after a successful group conversion.
/// `notConverted` means the caller keeps its original strings.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum FormattedUncertainty {
    Unknown {},
    Bounded {
        minus_text: String,
        plus_text: String,
    },
    NotConverted {
        code: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormattedMeasurementGroup {
    pub field_path: String,
    pub entity: RoutedEntity,
    pub kind: MeasurementFieldKind,
    pub mutable: bool,
    pub converted: bool,
    pub unit: Unit,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub nominal_text: Option<String>,
    pub uncertainty: FormattedUncertainty,
}

const MAX_GROUP_FORMATS: usize = 16;

fn id_at(segment: &str) -> Option<Id> {
    Id::new(segment).ok()
}

fn length_kind() -> MeasurementFieldKind {
    MeasurementFieldKind::PositiveLength
}
fn offset_kind() -> MeasurementFieldKind {
    MeasurementFieldKind::SignedOffset
}
fn clearance_kind() -> MeasurementFieldKind {
    MeasurementFieldKind::Clearance
}

fn from_catalog_kind(kind: crate::normalize::CatalogFieldKind) -> MeasurementFieldKind {
    use crate::normalize::CatalogFieldKind::*;
    match kind {
        Measurement => MeasurementFieldKind::PositiveLength,
        PositionMm => MeasurementFieldKind::SignedOffset,
        ClearanceMm => MeasurementFieldKind::Clearance,
        Quantity => MeasurementFieldKind::Quantity,
        MassGrams => MeasurementFieldKind::MassGrams,
        MoneyKrw => MeasurementFieldKind::MoneyKrw,
        PackQuantity => MeasurementFieldKind::PackQuantity,
    }
}

fn route(
    field_path: &str,
    entity: RoutedEntity,
    kind: MeasurementFieldKind,
    mutable: bool,
) -> FieldRoute {
    FieldRoute {
        field_path: field_path.to_owned(),
        entity,
        kind,
        mutable,
    }
}

/// Route one canonical field path. Arbitrary valid item ids use the same
/// grammar as `item-a`. An invalid id or an unknown suffix is not a route.
pub fn route_measurement_field(field_path: &str) -> Option<FieldRoute> {
    let segments: Vec<&str> = field_path.split('.').collect();
    if segments.iter().any(|segment| segment.is_empty()) {
        return None;
    }
    match segments.as_slice() {
        ["space", "interior", "width" | "depth" | "height"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            length_kind(),
            true,
        )),
        ["space", "opening", "width" | "height"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            length_kind(),
            true,
        )),
        ["space", "opening", "left" | "bottom"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            offset_kind(),
            true,
        )),
        ["space", "staging", "freeVolume", "minX" | "minY" | "minZ"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            offset_kind(),
            true,
        )),
        [
            "space",
            "staging",
            "freeVolume",
            "extent",
            "width" | "depth" | "height",
        ] => Some(route(
            field_path,
            RoutedEntity::Space {},
            length_kind(),
            true,
        )),
        ["space", "staging", "baseSupport", "loadLimit"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            MeasurementFieldKind::MassGrams,
            true,
        )),
        ["space", "support", "footprint", "x" | "y"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            offset_kind(),
            true,
        )),
        ["space", "support", "footprint", "width" | "depth"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            length_kind(),
            true,
        )),
        ["space", "support", "elevation"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            offset_kind(),
            true,
        )),
        ["space", "support", "loadLimit"] => Some(route(
            field_path,
            RoutedEntity::Space {},
            MeasurementFieldKind::MassGrams,
            true,
        )),
        [
            "space",
            "clearances",
            "left" | "right" | "front" | "back" | "top" | "betweenUnits",
        ] => Some(route(
            field_path,
            RoutedEntity::Space {},
            clearance_kind(),
            true,
        )),
        ["space", "obstacles", id, "bounds", "minX" | "minY" | "minZ"] => Some(route(
            field_path,
            RoutedEntity::Obstacle { id: id_at(id)? },
            offset_kind(),
            true,
        )),
        [
            "space",
            "obstacles",
            id,
            "bounds",
            "extent",
            "width" | "depth" | "height",
        ] => Some(route(
            field_path,
            RoutedEntity::Obstacle { id: id_at(id)? },
            length_kind(),
            true,
        )),
        [
            "items",
            id,
            "dimensions",
            "envelope",
            "width" | "depth" | "height",
        ] => Some(route(
            field_path,
            RoutedEntity::Item { id: id_at(id)? },
            length_kind(),
            true,
        )),
        ["items", id, "quantity"] => Some(route(
            field_path,
            RoutedEntity::Item { id: id_at(id)? },
            MeasurementFieldKind::Quantity,
            true,
        )),
        ["items", id, "massEach"] => Some(route(
            field_path,
            RoutedEntity::Item { id: id_at(id)? },
            MeasurementFieldKind::MassGrams,
            true,
        )),
        [
            "items",
            id,
            "requirement",
            "handling",
            "left" | "right" | "top" | "pullExtraDepth" | "liftAboveRim",
        ] => Some(route(
            field_path,
            RoutedEntity::Item { id: id_at(id)? },
            clearance_kind(),
            true,
        )),
        ["ownedContainers", id, "quantityOwned" | "quantityAvailable"] => Some(route(
            field_path,
            RoutedEntity::OwnedContainer { id: id_at(id)? },
            MeasurementFieldKind::Quantity,
            true,
        )),
        ["ownedContainers", id, "physical", rest @ ..] if !rest.is_empty() => {
            let id = id_at(id)?;
            let catalog_path = format!("variants.{}.{}", id.as_str(), rest.join("."));
            let kind = from_catalog_kind(catalog_field_kind(&catalog_path)?);
            Some(route(
                field_path,
                RoutedEntity::OwnedContainer { id },
                kind,
                false,
            ))
        }
        ["variants", id, ..] => {
            let kind = from_catalog_kind(catalog_field_kind(field_path)?);
            Some(route(
                field_path,
                RoutedEntity::CatalogVariant { id: id_at(id)? },
                kind,
                false,
            ))
        }
        ["offers", id, ..] => {
            let kind = from_catalog_kind(catalog_field_kind(field_path)?);
            Some(route(
                field_path,
                RoutedEntity::CatalogOffer { id: id_at(id)? },
                kind,
                false,
            ))
        }
        _ => None,
    }
}

enum GroupScalar {
    Length(Measurement),
    Offset(Fact<MeasuredOffset>),
    Clearance(Fact<ClearanceMm>),
    Quantity(Fact<Quantity>),
    Mass(Fact<MassGrams>),
    Unavailable(&'static str),
}

fn axis_length(dimensions: &Dimensions, axis: &str) -> Measurement {
    match axis {
        "depth" => dimensions.depth.clone(),
        "height" => dimensions.height.clone(),
        _ => dimensions.width.clone(),
    }
}

fn clearance_named(policy: &ClearancePolicy, name: &str) -> Fact<ClearanceMm> {
    match name {
        "right" => policy.right.clone(),
        "front" => policy.front.clone(),
        "back" => policy.back.clone(),
        "top" => policy.top.clone(),
        "betweenUnits" => policy.between_units.clone(),
        _ => policy.left.clone(),
    }
}

fn handling_named(handling: &HandlingClearance, name: &str) -> Fact<ClearanceMm> {
    match name {
        "right" => handling.right.clone(),
        "top" => handling.top.clone(),
        "pullExtraDepth" => handling.pull_extra_depth.clone(),
        "liftAboveRim" => handling.lift_above_rim.clone(),
        _ => handling.left.clone(),
    }
}

fn nested_mass(fact: &Fact<StagingSupport>) -> GroupScalar {
    match fact {
        Fact::Known { value, .. } => GroupScalar::Mass(value.load_limit.clone()),
        _ => GroupScalar::Unavailable("fact_unknown"),
    }
}

fn load_space(input: &ProjectInput, segments: &[&str]) -> Result<GroupScalar, &'static str> {
    let space = &input.space;
    Ok(match segments {
        ["space", "interior", axis] => GroupScalar::Length(axis_length(&space.interior, axis)),
        ["space", "opening", "width"] => GroupScalar::Length(space.opening.width.clone()),
        ["space", "opening", "height"] => GroupScalar::Length(space.opening.height.clone()),
        ["space", "opening", "left"] => GroupScalar::Offset(space.opening.left.clone()),
        ["space", "opening", "bottom"] => GroupScalar::Offset(space.opening.bottom.clone()),
        ["space", "staging", "freeVolume", "minX"] => {
            GroupScalar::Offset(space.staging.free_volume.min_x.clone())
        }
        ["space", "staging", "freeVolume", "minY"] => {
            GroupScalar::Offset(space.staging.free_volume.min_y.clone())
        }
        ["space", "staging", "freeVolume", "minZ"] => {
            GroupScalar::Offset(space.staging.free_volume.min_z.clone())
        }
        ["space", "staging", "freeVolume", "extent", axis] => {
            GroupScalar::Length(axis_length(&space.staging.free_volume.extent, axis))
        }
        ["space", "staging", "baseSupport", "loadLimit"] => {
            nested_mass(&space.staging.base_support)
        }
        ["space", "support", "footprint", "x"] => {
            GroupScalar::Offset(space.support.footprint.x.clone())
        }
        ["space", "support", "footprint", "y"] => {
            GroupScalar::Offset(space.support.footprint.y.clone())
        }
        ["space", "support", "footprint", "width"] => {
            GroupScalar::Length(space.support.footprint.width.clone())
        }
        ["space", "support", "footprint", "depth"] => {
            GroupScalar::Length(space.support.footprint.depth.clone())
        }
        ["space", "support", "elevation"] => GroupScalar::Offset(space.support.elevation.clone()),
        ["space", "support", "loadLimit"] => GroupScalar::Mass(space.support.load_limit.clone()),
        ["space", "clearances", name] => {
            GroupScalar::Clearance(clearance_named(&space.clearances, name))
        }
        _ => return Err("invalid_format_field"),
    })
}

fn load_group(input: &ProjectInput, route: &FieldRoute) -> Result<GroupScalar, &'static str> {
    let segments: Vec<&str> = route.field_path.split('.').collect();
    match &route.entity {
        RoutedEntity::Space {} => load_space(input, &segments),
        RoutedEntity::Item { id } => {
            let item = input
                .items
                .iter()
                .find(|item| &item.id == id)
                .ok_or("invalid_format_field")?;
            Ok(match segments.as_slice() {
                ["items", _, "dimensions", "envelope", axis] => {
                    GroupScalar::Length(axis_length(&item.dimensions.envelope, axis))
                }
                ["items", _, "quantity"] => GroupScalar::Quantity(item.quantity.clone()),
                ["items", _, "massEach"] => GroupScalar::Mass(item.mass_each.clone()),
                ["items", _, "requirement", "handling", name] => {
                    GroupScalar::Clearance(handling_named(&item.requirement.handling, name))
                }
                _ => return Err("invalid_format_field"),
            })
        }
        RoutedEntity::Obstacle { id } => {
            let obstacle = input
                .space
                .obstacles
                .iter()
                .find(|obstacle| &obstacle.id == id)
                .ok_or("invalid_format_field")?;
            Ok(match segments.as_slice() {
                ["space", "obstacles", _, "bounds", "minX"] => {
                    GroupScalar::Offset(obstacle.bounds.min_x.clone())
                }
                ["space", "obstacles", _, "bounds", "minY"] => {
                    GroupScalar::Offset(obstacle.bounds.min_y.clone())
                }
                ["space", "obstacles", _, "bounds", "minZ"] => {
                    GroupScalar::Offset(obstacle.bounds.min_z.clone())
                }
                ["space", "obstacles", _, "bounds", "extent", axis] => {
                    GroupScalar::Length(axis_length(&obstacle.bounds.extent, axis))
                }
                _ => return Err("invalid_format_field"),
            })
        }
        RoutedEntity::OwnedContainer { id } => {
            let owned = input
                .owned_containers
                .iter()
                .find(|owned| &owned.id == id)
                .ok_or("invalid_format_field")?;
            Ok(match segments.as_slice() {
                ["ownedContainers", _, "quantityOwned"] => {
                    GroupScalar::Quantity(owned.quantity_owned.clone())
                }
                ["ownedContainers", _, "quantityAvailable"] => {
                    GroupScalar::Quantity(owned.quantity_available.clone())
                }
                _ => return Err("catalog_field_read_only"),
            })
        }
        RoutedEntity::CatalogVariant { .. } | RoutedEntity::CatalogOffer { .. } => {
            Err("catalog_field_read_only")
        }
    }
}

fn not_converted(route: &FieldRoute, unit: Unit, code: &str) -> FormattedMeasurementGroup {
    FormattedMeasurementGroup {
        field_path: route.field_path.clone(),
        entity: route.entity.clone(),
        kind: route.kind,
        mutable: route.mutable,
        converted: false,
        unit,
        nominal_text: None,
        uncertainty: FormattedUncertainty::NotConverted {
            code: code.to_owned(),
        },
    }
}

fn converted(
    route: &FieldRoute,
    unit: Unit,
    nominal_text: String,
    uncertainty: FormattedUncertainty,
) -> FormattedMeasurementGroup {
    FormattedMeasurementGroup {
        field_path: route.field_path.clone(),
        entity: route.entity.clone(),
        kind: route.kind,
        mutable: route.mutable,
        converted: true,
        unit,
        nominal_text: Some(nominal_text),
        uncertainty,
    }
}

fn format_bounds(uncertainty: &Uncertainty, unit: Unit) -> FormattedUncertainty {
    match uncertainty {
        Uncertainty::Unknown {} => FormattedUncertainty::Unknown {},
        Uncertainty::Bounded { minus_mm, plus_mm } => FormattedUncertainty::Bounded {
            minus_text: format_clearance(*minus_mm, unit),
            plus_text: format_clearance(*plus_mm, unit),
        },
    }
}

fn render_length(route: &FieldRoute, unit: Unit, fact: Measurement) -> FormattedMeasurementGroup {
    match fact {
        Fact::Known { value, .. } => converted(
            route,
            unit,
            format_length(value.nominal, unit),
            format_bounds(&value.uncertainty, unit),
        ),
        Fact::Unknown { .. } => not_converted(route, unit, "not_measured"),
        Fact::NotApplicable { .. } => not_converted(route, unit, "not_applicable"),
    }
}

fn render_offset(
    route: &FieldRoute,
    unit: Unit,
    fact: Fact<MeasuredOffset>,
) -> FormattedMeasurementGroup {
    if unit != Unit::Mm {
        return not_converted(route, unit, "unit_not_supported");
    }
    match fact {
        Fact::Known { value, .. } => converted(
            route,
            unit,
            value.nominal.get().to_string(),
            format_bounds(&value.uncertainty, Unit::Mm),
        ),
        Fact::Unknown { .. } => not_converted(route, unit, "not_measured"),
        Fact::NotApplicable { .. } => not_converted(route, unit, "not_applicable"),
    }
}

fn render_clearance(
    route: &FieldRoute,
    unit: Unit,
    fact: Fact<ClearanceMm>,
) -> FormattedMeasurementGroup {
    match fact {
        Fact::Known { value, .. } => converted(
            route,
            unit,
            format_clearance(value, unit),
            FormattedUncertainty::Unknown {},
        ),
        Fact::Unknown { .. } => not_converted(route, unit, "not_measured"),
        Fact::NotApplicable { .. } => not_converted(route, unit, "not_applicable"),
    }
}

fn render_unitless(route: &FieldRoute, unit: Unit, known: bool) -> FormattedMeasurementGroup {
    if !known {
        not_converted(route, unit, "not_measured")
    } else {
        not_converted(route, unit, "unit_not_supported")
    }
}

fn render_scalar(route: &FieldRoute, unit: Unit, scalar: GroupScalar) -> FormattedMeasurementGroup {
    match scalar {
        GroupScalar::Unavailable(code) => not_converted(route, unit, code),
        GroupScalar::Length(fact) => render_length(route, unit, fact),
        GroupScalar::Offset(fact) => render_offset(route, unit, fact),
        GroupScalar::Clearance(fact) => render_clearance(route, unit, fact),
        GroupScalar::Quantity(fact) => match fact {
            Fact::NotApplicable { .. } => not_converted(route, unit, "not_applicable"),
            other => render_unitless(route, unit, other.value().is_some()),
        },
        GroupScalar::Mass(fact) => match fact {
            Fact::NotApplicable { .. } => not_converted(route, unit, "not_applicable"),
            other => render_unitless(route, unit, other.value().is_some()),
        },
    }
}

/// Normalize stamps `space.{spaceId}.…` while the route grammar omits the
/// space id. Both spellings name the same field.
fn diagnostic_code<'a>(
    diagnostics: &'a [Diagnostic],
    route: &FieldRoute,
    space_id: &str,
) -> Option<&'a str> {
    let space_stamped = route
        .field_path
        .strip_prefix("space.")
        .map(|rest| format!("space.{space_id}.{rest}"));
    diagnostics
        .iter()
        .find(|diagnostic| {
            diagnostic.field_path == route.field_path
                || space_stamped.as_deref() == Some(diagnostic.field_path.as_str())
        })
        .map(|diagnostic| diagnostic.code.as_str())
}

fn format_one(
    input: &ProjectInput,
    request: &MeasurementGroupFormatRequest,
    diagnostics: &[Diagnostic],
) -> Result<FormattedMeasurementGroup, &'static str> {
    let route = route_measurement_field(&request.field_path).ok_or("invalid_format_field")?;
    if !route.mutable {
        return Err("catalog_field_read_only");
    }
    if let Some(code) = diagnostic_code(diagnostics, &route, input.space.id.as_str()) {
        return Ok(not_converted(&route, request.unit, code));
    }
    let scalar = load_group(input, &route)?;
    Ok(render_scalar(&route, request.unit, scalar))
}

/// Format each requested group, or fail the command when a path is unknown,
/// read-only, or over the cap. A field that is incomplete stays unconverted
/// and does not emit a partial nominal.
pub fn format_measurement_groups(
    input: &ProjectInput,
    requests: &[MeasurementGroupFormatRequest],
    diagnostics: &[Diagnostic],
) -> Result<Vec<FormattedMeasurementGroup>, &'static str> {
    if requests.len() > MAX_GROUP_FORMATS {
        return Err("invalid_input");
    }
    requests
        .iter()
        .map(|request| format_one(input, request, diagnostics))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offset(text: &str, minus: &str, plus: &str) -> RawOffsetDto {
        RawOffsetDto {
            text: text.into(),
            uncertainty: RawUncertaintyDto::Bounded {
                minus_text: minus.into(),
                plus_text: plus.into(),
                unit: Unit::Mm,
            },
            origin: MeasurementOrigin::UserMeasured,
            evidence_ids: vec![],
        }
    }

    fn known_offset(text: &str, minus: &str, plus: &str) -> (i32, u32, u32) {
        let mut diagnostics = vec![];
        let fact = normalize_offset(
            &offset(text, minus, plus),
            "space.opening.left",
            &mut diagnostics,
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        match fact {
            Fact::Known { value, provenance } => {
                assert_eq!(provenance.verification, VerificationStatus::Unverified);
                assert_eq!(provenance.origin, MeasurementOrigin::UserMeasured);
                assert!(provenance.observed_at.is_none());
                let Uncertainty::Bounded { minus_mm, plus_mm } = value.uncertainty else {
                    panic!("bounds missing");
                };
                (value.nominal.get(), minus_mm.get(), plus_mm.get())
            }
            other => panic!("expected known offset, got {other:?}"),
        }
    }

    #[test]
    fn hand_checked_signed_offset_intervals() {
        assert_eq!(signed_offset_interval(0, 0, 0), Ok((0, 0)));
        assert_eq!(signed_offset_interval(0, 2, 3), Ok((-2, 3)));
        assert_eq!(signed_offset_interval(-2, 3, 4), Ok((-5, 2)));
        assert_eq!(signed_offset_interval(20_000, 0, 0), Ok((20_000, 20_000)));
        assert_eq!(
            signed_offset_interval(-20_000, 0, 0),
            Ok((-20_000, -20_000))
        );
        assert_eq!(signed_offset_interval(19_999, 0, 1), Ok((19_999, 20_000)));
        assert_eq!(
            signed_offset_interval(-19_997, 3, 0),
            Ok((-20_000, -19_997))
        );
        assert_eq!(known_offset("0", "0", "0"), (0, 0, 0));
        assert_eq!(known_offset("-0", "0", "0"), (0, 0, 0));
        assert_eq!(known_offset("0", "2", "3"), (0, 2, 3));
        assert_eq!(known_offset("-2", "3", "4"), (-2, 3, 4));
        assert_eq!(known_offset("20000", "0", "0"), (20_000, 0, 0));
        assert_eq!(known_offset("-20000", "0", "0"), (-20_000, 0, 0));
    }

    #[test]
    fn zero_crossing_is_not_a_positive_length_and_zero_is_not_unknown() {
        assert_eq!(known_offset("1", "1", "0"), (1, 1, 0));
        let mut diagnostics = vec![];
        let empty = normalize_offset(
            &RawOffsetDto {
                text: "  ".into(),
                uncertainty: RawUncertaintyDto::Unknown {},
                origin: MeasurementOrigin::UserDeclared,
                evidence_ids: vec![],
            },
            "space.opening.left",
            &mut diagnostics,
        );
        assert!(diagnostics.is_empty());
        assert!(matches!(
            empty,
            Fact::Unknown {
                reason: UnknownReason::NotMeasured
            }
        ));
        let mut length_diagnostics = vec![];
        let length = normalize_measurement(
            &RawMeasurementDto {
                text: "1".into(),
                unit: Unit::Mm,
                uncertainty: RawUncertaintyDto::Bounded {
                    minus_text: "1".into(),
                    plus_text: "0".into(),
                    unit: Unit::Mm,
                },
                origin: MeasurementOrigin::UserDeclared,
                evidence_ids: vec![],
            },
            "space.interior.width",
            &mut length_diagnostics,
        );
        assert!(matches!(length, Fact::Unknown { .. }));
        assert_eq!(length_diagnostics[0].code, "uncertainty_out_of_range");
    }

    #[test]
    fn endpoints_out_of_range_and_i64_overflow_fail_closed() {
        assert_eq!(
            signed_offset_interval(20_000, 0, 1),
            Err("uncertainty_out_of_range")
        );
        assert_eq!(
            signed_offset_interval(-20_000, 1, 0),
            Err("uncertainty_out_of_range")
        );
        assert_eq!(
            checked_i64_interval(i64::MIN, 1, 0),
            Err("numeric_overflow")
        );
        assert_eq!(
            checked_i64_interval(i64::MAX, 0, 1),
            Err("numeric_overflow")
        );
        for (text, minus, plus, code) in [
            ("20000", "0", "1", "uncertainty_out_of_range"),
            ("-20000", "1", "0", "uncertainty_out_of_range"),
            ("20001", "0", "0", "scalar_out_of_range"),
            ("9223372036854775808", "0", "0", "numeric_overflow"),
            ("-9223372036854775809", "0", "0", "numeric_overflow"),
            ("18446744073709551616", "0", "0", "numeric_overflow"),
            ("-9223372036854775808", "0", "0", "scalar_out_of_range"),
        ] {
            let mut diagnostics = vec![];
            let fact = normalize_offset(&offset(text, minus, plus), "offset", &mut diagnostics);
            assert!(matches!(fact, Fact::Unknown { .. }), "{text}");
            assert_eq!(diagnostics[0].code, code, "{text}");
        }
        let mut diagnostics = vec![];
        let missing = normalize_offset(
            &RawOffsetDto {
                text: "0".into(),
                uncertainty: RawUncertaintyDto::Bounded {
                    minus_text: "0".into(),
                    plus_text: "".into(),
                    unit: Unit::Mm,
                },
                origin: MeasurementOrigin::UserDeclared,
                evidence_ids: vec![],
            },
            "offset",
            &mut diagnostics,
        );
        assert!(matches!(missing, Fact::Unknown { .. }));
        assert_eq!(diagnostics[0].code, "uncertainty_missing");
    }

    #[test]
    fn routing_accepts_arbitrary_item_ids_and_keeps_catalogue_read_only() {
        let custom = route_measurement_field("items.shelf-9.dimensions.envelope.depth").unwrap();
        let sample = route_measurement_field("items.item-a.dimensions.envelope.depth").unwrap();
        assert_eq!(custom.kind, sample.kind);
        assert_eq!(custom.kind, MeasurementFieldKind::PositiveLength);
        assert!(custom.mutable && sample.mutable);
        assert!(matches!(custom.entity, RoutedEntity::Item { ref id } if id.as_str() == "shelf-9"));
        assert!(route_measurement_field("items.not an id.dimensions.envelope.width").is_none());
        assert!(route_measurement_field("space.opening.depth").is_none());
        let catalog = route_measurement_field("variants.syn-1.dimensions.innerOffset.x").unwrap();
        assert_eq!(catalog.kind, MeasurementFieldKind::SignedOffset);
        assert!(!catalog.mutable);
        let owned =
            route_measurement_field("ownedContainers.box-1.physical.dimensions.outer.width")
                .unwrap();
        assert!(!owned.mutable);
        assert_eq!(owned.kind, MeasurementFieldKind::PositiveLength);
        let quantity = route_measurement_field("ownedContainers.box-1.quantityOwned").unwrap();
        assert!(quantity.mutable);
        assert_eq!(quantity.kind, MeasurementFieldKind::Quantity);
    }

    #[test]
    fn typed_offset_round_trip_rejects_unknown_fields() {
        let fact = Fact::Known {
            value: MeasuredOffset {
                nominal: PositionMm::new(0).unwrap(),
                uncertainty: Uncertainty::Bounded {
                    minus_mm: ClearanceMm::new(0).unwrap(),
                    plus_mm: ClearanceMm::new(0).unwrap(),
                },
            },
            provenance: Provenance {
                origin: MeasurementOrigin::UserMeasured,
                verification: VerificationStatus::Unverified,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            },
        };
        let json = serde_json::to_string(&fact).unwrap();
        assert_eq!(
            serde_json::from_str::<Fact<MeasuredOffset>>(&json).unwrap(),
            fact
        );
        assert!(offset_interval_diagnostic(&fact).is_none());
        assert!(serde_json::from_str::<RawOffsetDto>(
            r#"{"text":"0","uncertainty":{"state":"unknown"},"origin":"userDeclared","evidenceIds":[],"extra":true}"#
        )
        .is_err());
    }
}
