//! One authoritative spatial projection read model (SPATIAL_VIEW_CONTRACT).
//!
//! The projector turns a *source-integrity-validated* Rust-normalized input
//! or a complete immutable `PlanSnapshot` into drawable mm geometry with
//! typed links. It is a pure read model: it never runs the solver, never
//! recomputes a check verdict, never mutates a source, and never rewrites a
//! snapshot/BOM/guide. Physical shape construction is shared with the
//! validator through `geometry` (including the byte-for-byte
//! `moving_envelope` helper); validator validity flags are never read.
//!
//! Coordinates follow DOMAIN_MODEL §3: mm integers, x right, y towards the
//! rear, z up, front at y=0 with staging at y<0. `top_rect`/`front_rect`
//! carry **domain-plane** coordinates (`[x,y]` / `[x,z]`) without screen
//! inversion — the renderer inverts at display time only. Derived geometry
//! is computed on wide `i64` intermediates and narrowed to `i32` `ViewMm`
//! with an explicit ±100000 mm drawable bound; overflow is never wrapped or
//! clamped but fails the whole projection with `projection_range_exceeded`.
//!
//! Unknown fencing: an unknown inner offset keeps a cavity-local box but
//! leaves the world child box explicitly `Unavailable` (`offset_unknown`);
//! an unknown uncertainty bound makes conservative geometry `Unavailable`
//! even when nominal values are known. Known zero and unknown stay distinct;
//! an absent shape never becomes an empty box, a fake rectangle or a pass.

use crate::canonical;
use crate::catalog::*;
use crate::facts::*;
use crate::finalize;
use crate::geometry::*;
use crate::input::*;
use crate::plan::*;
use crate::scalars::*;
use crate::validate;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Versions the projection DTO independently of the persisted schema.
pub const SPATIAL_PROJECTION_VERSION: u32 = 1;
/// Projection array caps (SPATIAL_VIEW_CONTRACT §3). Exceeding a cap fails
/// with `projection_limit_exceeded`; nothing is silently truncated.
pub const MAX_PROJECTION_ELEMENTS: usize = 512;
pub const MAX_PROJECTION_OVERLAYS: usize = 2048;
pub const MAX_PROJECTION_DIMENSION_GUIDES: usize = 2048;
pub const MAX_PROJECTION_LINKS: usize = 8192;
/// Serialized projection response bound (mirrors the transport cap).
pub const MAX_PROJECTION_BYTES: usize = 5 * 1024 * 1024;
/// Drawable bound of every emitted `ViewMm` coordinate.
pub const VIEW_MM_LIMIT: i64 = 100_000;

/// Why a projection could not be produced. Runtime maps this to the existing
/// `operationFailed` event; it never falls back to partial geometry.
pub struct ProjectionFailure {
    pub code: &'static str,
    pub affected_fields: Vec<String>,
}

/// The two legal projection sources. Both cross the same boundary validation
/// as external JSON; label/size-only payloads are never trusted for drawing.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum SpatialViewSource {
    NormalizedInput {
        input: ProjectInput,
        input_digest: Digest,
    },
    Plan {
        snapshot: PlanSnapshot,
    },
}
/// Immutable identity of the projected source, stamped into the projection.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SpatialSourceStamp {
    Input {
        input_digest: Digest,
    },
    Plan {
        plan_snapshot_id: Digest,
        input_digest: Digest,
        catalog_digest: Digest,
    },
}
/// Typed selection target. Same raw id in different namespaces can never
/// collide; `unitOrdinal` is zero-based.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SpatialTarget {
    Space {
        space_id: Id,
    },
    Opening {
        space_id: Id,
    },
    Obstacle {
        obstacle_id: Id,
    },
    Support {
        support_id: Id,
    },
    Placement {
        placement_id: Id,
    },
    /// Input-side measuring envelope for an item type; never a physical
    /// instance and never a quantity claim.
    Item {
        item_id: Id,
    },
    ItemInstance {
        item_id: Id,
        unit_ordinal: u32,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ViewBoxMm {
    pub min: [i32; 3],
    pub max: [i32; 3],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ViewRectMm {
    pub min: [i32; 2],
    pub max: [i32; 2],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ViewSegmentMm {
    pub from: [i32; 3],
    pub to: [i32; 3],
}
/// One drawable geometric fact, or its explicit absence. `Available` never
/// implies physical validity; `basis` can only be nominal/conservative for
/// real geometry (no fake nonGeometric volume).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[schemars(rename = "ProjectionGeometryFor_{T}")]
pub enum ProjectionGeometry<T> {
    Available {
        value: T,
        basis: CheckBasis,
        field_refs: Vec<FieldRef>,
    },
    Unavailable {
        reason_code: String,
        field_refs: Vec<FieldRef>,
    },
    NotApplicable {
        reason_code: String,
    },
}
impl<T> ProjectionGeometry<T> {
    pub fn unavailable(reason_code: &str, field_refs: Vec<FieldRef>) -> Self {
        ProjectionGeometry::Unavailable {
            reason_code: reason_code.into(),
            field_refs,
        }
    }
    pub fn not_applicable(reason_code: &str) -> Self {
        ProjectionGeometry::NotApplicable {
            reason_code: reason_code.into(),
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SpatialRole {
    CompartmentBoundary,
    Aperture,
    PhysicalObstacle,
    AccessExclusion,
    SupportSurface,
    ItemEnvelope,
    DirectItem,
    OwnedContainer,
    NewContainer,
    ContainedItem,
    InnerCavity,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpatialElement {
    pub target: SpatialTarget,
    pub role: SpatialRole,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub parent_placement_id: Option<Id>,
    pub world_box: ProjectionGeometry<ViewBoxMm>,
    /// Domain-plane `[x,y]` rectangle (no screen inversion).
    pub top_rect: ProjectionGeometry<ViewRectMm>,
    /// Domain-plane `[x,z]` rectangle (no screen inversion).
    pub front_rect: ProjectionGeometry<ViewRectMm>,
    /// A container's explicitly separate unrotated cavity frame.
    pub cavity_local_box: ProjectionGeometry<ViewBoxMm>,
    /// An unplaced item type's own measuring frame.
    pub measurement_box: ProjectionGeometry<ViewBoxMm>,
    pub check_ids: Vec<Id>,
    pub field_refs: Vec<FieldRef>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SpatialOverlayRole {
    NominalOuter,
    ConservativeOuter,
    NominalInner,
    ConservativeInner,
    InstallationSweep,
    OperationalSweep,
    Staging,
    SupportFootprint,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SpatialMotionPhase {
    Insert,
    ExtractDirect,
    ExtractContainer,
    LiftContents,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpatialOverlay {
    pub overlay_id: Id,
    pub target: SpatialTarget,
    pub role: SpatialOverlayRole,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<SpatialMotionPhase>")]
    pub motion_phase: Option<SpatialMotionPhase>,
    pub geometry: ProjectionGeometry<ViewBoxMm>,
    pub check_ids: Vec<Id>,
    pub field_refs: Vec<FieldRef>,
}
/// One dimension line. The measurement keeps its original fact, uncertainty
/// and provenance verbatim — the projector never re-derives a value.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DimensionGuide {
    pub guide_id: Id,
    pub target: SpatialTarget,
    pub field_path: String,
    pub label_key: String,
    pub measurement: Measurement,
    pub segment: ProjectionGeometry<ViewSegmentMm>,
    pub frame: DimensionFrame,
    pub preferred_view: DimensionView,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum DimensionView {
    Top,
    Front,
    CavityLocal,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum DimensionFrame {
    World { space_id: Id },
    ItemMeasurement { item_id: Id },
    ContainerCavity { placement_id: Id },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SpatialLinkSource {
    Check { check_id: Id },
    Bom { bom_line_id: Id },
    Action { step_id: Id },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum LinkResolution {
    Resolved,
    Partial,
    Unavailable,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpatialLink {
    pub source: SpatialLinkSource,
    pub targets: Vec<SpatialTarget>,
    pub resolution: LinkResolution,
    pub unresolved_subject_ids: Vec<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub reason_code: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpatialProjection {
    /// Exactly `SPATIAL_PROJECTION_VERSION`.
    pub projection_version: u32,
    pub source: SpatialSourceStamp,
    pub interior: Dimensions,
    pub elements: Vec<SpatialElement>,
    pub overlays: Vec<SpatialOverlay>,
    pub dimensions: Vec<DimensionGuide>,
    pub links: Vec<SpatialLink>,
    pub diagnostics: Vec<Diagnostic>,
}

/// One interior/aperture dimension before it becomes a `DimensionGuide`.
type GuideSource<'a> = (
    &'a str,
    &'a SpatialTarget,
    &'a Measurement,
    DimensionView,
    Option<([i64; 3], [i64; 3])>,
    String,
);

// ---------- small internal helpers ----------

/// Nominal `[0, nominal]` interval of a measured length used as a frame
/// extent (interior, envelopes, cavities).
fn extent_axis(fact: &Measurement) -> Option<AxisInterval> {
    let nominal = fact.value()?.nominal.get() as i64;
    Some(AxisInterval { lo: 0, hi: nominal })
}
/// Position + measured extent on one axis; the position is a declared
/// candidate coordinate (exact), the extent measured.
fn placed_axis(position: i64, extent: Option<i64>) -> Option<AxisInterval> {
    Some(AxisInterval {
        lo: position,
        hi: position + extent?,
    })
}
/// A known point on one axis (a zero-thickness plane's position).
fn point_axis(fact: &Fact<MeasuredOffset>) -> Option<AxisInterval> {
    let at = fact.value()?.nominal.get() as i64;
    Some(AxisInterval { lo: at, hi: at })
}
fn position_axes(p: &Vec3Mm) -> [i64; 3] {
    [p.x.get() as i64, p.y.get() as i64, p.z.get() as i64]
}
/// Nominal extent of each axis after the subject's own yaw. An unknown axis
/// stays `None` so a known pair can still form a rectangle; the missing axis
/// is never filled with zero.
fn nominal_axis_extents(dimensions: &Dimensions, orientation: Orientation) -> [Option<i64>; 3] {
    let width = nominal_length(&dimensions.width);
    let depth = nominal_length(&dimensions.depth);
    let height = nominal_length(&dimensions.height);
    match orientation {
        Orientation::Upright0 => [width, depth, height],
        Orientation::Upright90 => [depth, width, height],
    }
}
fn axes_at(position: [i64; 3], extents: [Option<i64>; 3]) -> [Option<AxisInterval>; 3] {
    [
        placed_axis(position[0], extents[0]),
        placed_axis(position[1], extents[1]),
        placed_axis(position[2], extents[2]),
    ]
}
/// World axes of a cavity-frame box. Same parent-yaw formulas as
/// `child_global_box_at`; unknown extents omit only the axes that depend on
/// them, and an unknown offset omits the whole world box.
fn child_world_axes(
    parent_position: &Vec3Mm,
    parent_orientation: Orientation,
    parent_outer_depth: Option<i64>,
    inner_offset: &Fact<InnerOffset>,
    local_min: [i64; 3],
    local_extent: [Option<i64>; 3],
) -> [Option<AxisInterval>; 3] {
    let Some(inner_offset) = inner_offset.value() else {
        return [None, None, None];
    };
    let (Some(ox), Some(oy), Some(oz)) = (
        inner_offset.x.value().map(|m| m.nominal.get() as i64),
        inner_offset.y.value().map(|m| m.nominal.get() as i64),
        inner_offset.z.value().map(|m| m.nominal.get() as i64),
    ) else {
        return [None, None, None];
    };
    let (u, v, w) = (ox + local_min[0], oy + local_min[1], oz + local_min[2]);
    let (px, py, pz) = (
        parent_position.x.get() as i64,
        parent_position.y.get() as i64,
        parent_position.z.get() as i64,
    );
    let span = |lo: i64, extent: Option<i64>| extent.map(|ext| AxisInterval { lo, hi: lo + ext });
    match parent_orientation {
        Orientation::Upright0 => [
            span(px + u, local_extent[0]),
            span(py + v, local_extent[1]),
            span(pz + w, local_extent[2]),
        ],
        Orientation::Upright90 => [
            match (parent_outer_depth, local_extent[1]) {
                (Some(depth), Some(extent_y)) => Some(AxisInterval {
                    lo: px + depth - v - extent_y,
                    hi: px + depth - v,
                }),
                _ => None,
            },
            span(py + u, local_extent[0]),
            span(pz + w, local_extent[2]),
        ],
    }
}
fn offset_unknown(offset: &Fact<InnerOffset>) -> bool {
    offset.value().is_none_or(|value| {
        value.x.value().is_none() || value.y.value().is_none() || value.z.value().is_none()
    })
}
fn ref_of(entity: &Id, field: &str) -> FieldRef {
    FieldRef {
        entity_id: entity.clone(),
        field_path: field.into(),
    }
}
fn sorted_refs(mut refs: Vec<FieldRef>) -> Vec<FieldRef> {
    refs.sort();
    refs.dedup();
    refs
}
fn sorted_ids(mut ids: Vec<Id>) -> Vec<Id> {
    ids.sort();
    ids.dedup();
    ids
}
fn sorted_strings(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values.dedup();
    values
}
fn role_rank(role: &SpatialRole) -> u8 {
    match role {
        SpatialRole::CompartmentBoundary => 0,
        SpatialRole::Aperture => 1,
        SpatialRole::PhysicalObstacle => 2,
        SpatialRole::AccessExclusion => 3,
        SpatialRole::SupportSurface => 4,
        SpatialRole::ItemEnvelope => 5,
        SpatialRole::DirectItem => 6,
        SpatialRole::OwnedContainer => 7,
        SpatialRole::NewContainer => 8,
        SpatialRole::ContainedItem => 9,
        SpatialRole::InnerCavity => 10,
    }
}
fn target_key(target: &SpatialTarget) -> String {
    match target {
        SpatialTarget::Space { space_id } => format!("space:{}", space_id.as_str()),
        SpatialTarget::Opening { space_id } => format!("opening:{}", space_id.as_str()),
        SpatialTarget::Obstacle { obstacle_id } => format!("obstacle:{}", obstacle_id.as_str()),
        SpatialTarget::Support { support_id } => format!("support:{}", support_id.as_str()),
        SpatialTarget::Placement { placement_id } => format!("placement:{}", placement_id.as_str()),
        SpatialTarget::Item { item_id } => format!("item:{}", item_id.as_str()),
        SpatialTarget::ItemInstance {
            item_id,
            unit_ordinal,
        } => format!("instance:{}:{}", item_id.as_str(), unit_ordinal),
    }
}
fn link_source_key(source: &SpatialLinkSource) -> (u8, String) {
    match source {
        SpatialLinkSource::Action { step_id } => (0, step_id.as_str().to_owned()),
        SpatialLinkSource::Bom { bom_line_id } => (1, bom_line_id.as_str().to_owned()),
        SpatialLinkSource::Check { check_id } => (2, check_id.as_str().to_owned()),
    }
}
fn role_key(role: &SpatialOverlayRole) -> &'static str {
    match role {
        SpatialOverlayRole::NominalOuter => "nominal-outer",
        SpatialOverlayRole::ConservativeOuter => "conservative-outer",
        SpatialOverlayRole::NominalInner => "nominal-inner",
        SpatialOverlayRole::ConservativeInner => "conservative-inner",
        SpatialOverlayRole::InstallationSweep => "installation-sweep",
        SpatialOverlayRole::OperationalSweep => "operational-sweep",
        SpatialOverlayRole::Staging => "staging",
        SpatialOverlayRole::SupportFootprint => "support-footprint",
    }
}
fn phase_key(phase: &SpatialMotionPhase) -> &'static str {
    match phase {
        SpatialMotionPhase::Insert => "insert",
        SpatialMotionPhase::ExtractDirect => "extract-direct",
        SpatialMotionPhase::ExtractContainer => "extract-container",
        SpatialMotionPhase::LiftContents => "lift-contents",
    }
}
fn basis_key(basis: CheckBasis) -> &'static str {
    match basis {
        CheckBasis::Nominal => "nominal",
        CheckBasis::Conservative => "conservative",
        CheckBasis::NonGeometric => "non-geometric",
    }
}

/// Narrow one derived mm coordinate into the drawable `i32` bound. Any
/// derived overflow fails the whole projection — never wrapped or clamped.
fn view_mm(value: i64, overflow: &mut Vec<String>) -> i32 {
    if value.abs() > VIEW_MM_LIMIT {
        overflow.push(format!("viewMm:{value}"));
    }
    i32::try_from(value).unwrap_or(0)
}
fn geometry_box(
    axes: [Option<AxisInterval>; 3],
    basis: CheckBasis,
    field_refs: Vec<FieldRef>,
    overflow: &mut Vec<String>,
) -> ProjectionGeometry<ViewBoxMm> {
    if let [Some(x), Some(y), Some(z)] = axes
        && x.hi > x.lo
        && y.hi > y.lo
        && z.hi > z.lo
    {
        return ProjectionGeometry::Available {
            value: ViewBoxMm {
                min: [
                    view_mm(x.lo, overflow),
                    view_mm(y.lo, overflow),
                    view_mm(z.lo, overflow),
                ],
                max: [
                    view_mm(x.hi, overflow),
                    view_mm(y.hi, overflow),
                    view_mm(z.hi, overflow),
                ],
            },
            basis,
            field_refs,
        };
    }
    if let [Some(_), Some(_), Some(_)] = axes {
        // All three axes known but an extent is zero: not a drawable solid.
        return ProjectionGeometry::unavailable("empty_extent", field_refs);
    }
    ProjectionGeometry::unavailable("fact_unknown", field_refs)
}
/// Rectangles are plain domain-plane projections of world axes: top uses
/// `(x,y)`, front uses `(x,z)`. A rectangle requires both projected axes
/// known with positive extent. A known zero-extent axis (a conceptual plane
/// seen edge-on) is `NotApplicable` — an edge belongs to a dimension guide,
/// not a fake rectangle — while an unknown axis stays `Unavailable`.
fn geometry_rect(
    a: Option<AxisInterval>,
    b: Option<AxisInterval>,
    field_refs: Vec<FieldRef>,
    overflow: &mut Vec<String>,
) -> ProjectionGeometry<ViewRectMm> {
    if let (Some(a), Some(b)) = (a, b) {
        if a.hi <= a.lo || b.hi <= b.lo {
            return ProjectionGeometry::not_applicable("zero_extent_axis");
        }
        return ProjectionGeometry::Available {
            value: ViewRectMm {
                min: [view_mm(a.lo, overflow), view_mm(b.lo, overflow)],
                max: [view_mm(a.hi, overflow), view_mm(b.hi, overflow)],
            },
            basis: CheckBasis::Nominal,
            field_refs,
        };
    }
    ProjectionGeometry::unavailable("fact_unknown", field_refs)
}
fn segment_geometry(
    from: Option<[i64; 3]>,
    to: Option<[i64; 3]>,
    field_refs: Vec<FieldRef>,
    overflow: &mut Vec<String>,
) -> ProjectionGeometry<ViewSegmentMm> {
    if let (Some(from), Some(to)) = (from, to) {
        return ProjectionGeometry::Available {
            value: ViewSegmentMm {
                from: [
                    view_mm(from[0], overflow),
                    view_mm(from[1], overflow),
                    view_mm(from[2], overflow),
                ],
                to: [
                    view_mm(to[0], overflow),
                    view_mm(to[1], overflow),
                    view_mm(to[2], overflow),
                ],
            },
            basis: CheckBasis::Nominal,
            field_refs,
        };
    }
    ProjectionGeometry::unavailable("fact_unknown", field_refs)
}

/// Facts resolved for one placed subject, mirroring the validator's subject
/// resolution without reading any of its verdicts.
enum SubjectFacts<'a> {
    Item(&'a Item),
    Owned(&'a OwnedContainer),
    New(&'a ProductVariant),
}
struct Resolved<'a> {
    placement: &'a Placement,
    subject: SubjectFacts<'a>,
}
impl<'a> Resolved<'a> {
    fn dims(&self) -> &'a Dimensions {
        match self.subject {
            SubjectFacts::Item(item) => &item.dimensions.envelope,
            SubjectFacts::Owned(owned) => &owned.physical.dimensions.outer,
            SubjectFacts::New(variant) => &variant.dimensions.outer,
        }
    }
    fn entity_id(&self) -> Id {
        match self.subject {
            SubjectFacts::Item(item) => item.id.clone(),
            SubjectFacts::Owned(owned) => owned.id.clone(),
            SubjectFacts::New(variant) => variant.id.clone(),
        }
    }
    fn container_dims(&self) -> Option<&'a VariantDimensions> {
        match self.subject {
            SubjectFacts::Owned(owned) => Some(&owned.physical.dimensions),
            SubjectFacts::New(variant) => Some(&variant.dimensions),
            SubjectFacts::Item(_) => None,
        }
    }
    fn extra_extent(&self) -> Option<[i64; 3]> {
        match self.subject {
            SubjectFacts::Item(_) => Some([0, 0, 0]),
            SubjectFacts::Owned(owned) => handle_extra(&owned.physical.dimensions.handles),
            SubjectFacts::New(variant) => handle_extra(&variant.dimensions.handles),
        }
    }
    fn is_container(&self) -> bool {
        self.container_dims().is_some()
    }
    /// Per-axis nominal envelope. Unknown handles make the whole effective
    /// envelope unknown (they are not treated as absent). One unknown
    /// dimension leaves the other axes usable.
    fn nominal_axes(&self) -> [Option<i64>; 3] {
        let extents = nominal_axis_extents(self.dims(), self.placement.orientation);
        let Some(extra) = self.extra_extent() else {
            return [None, None, None];
        };
        [
            extents[0].map(|value| value + extra[0]),
            extents[1].map(|value| value + extra[1]),
            extents[2].map(|value| value + extra[2]),
        ]
    }
    fn nominal_extent(&self) -> Option<[i64; 3]> {
        let axes = self.nominal_axes();
        Some([axes[0]?, axes[1]?, axes[2]?])
    }
    fn dimension_refs(&self) -> Vec<FieldRef> {
        let prefix = match self.subject {
            SubjectFacts::Item(_) => "dimensions.envelope",
            SubjectFacts::Owned(_) | SubjectFacts::New(_) => "dimensions.outer",
        };
        let mut refs = vec![
            ref_of(&self.placement.id, "orientation"),
            ref_of(&self.entity_id(), &format!("{prefix}.width")),
            ref_of(&self.entity_id(), &format!("{prefix}.depth")),
            ref_of(&self.entity_id(), &format!("{prefix}.height")),
        ];
        if self.container_dims().is_some() {
            refs.push(ref_of(&self.entity_id(), "dimensions.handles"));
        }
        sorted_refs(refs)
    }
    fn occupied_extent(&self) -> Option<[i64; 3]> {
        let mut extent = oriented_occupied_extent(self.dims(), self.placement.orientation)?;
        let extra = self.extra_extent()?;
        for axis in 0..3 {
            extent[axis] += extra[axis];
        }
        Some(extent)
    }
    /// `(left, right, top, pull)` handling margins; `None` when any
    /// applicable margin fact is unknown.
    fn margins(&self) -> Option<(i64, i64, i64, i64)> {
        let handling = match self.subject {
            SubjectFacts::Item(item) => &item.requirement.handling,
            SubjectFacts::Owned(owned) => &owned.physical.handling,
            SubjectFacts::New(variant) => &variant.handling,
        };
        Some((
            clearance(&handling.left)?,
            clearance(&handling.right)?,
            clearance(&handling.top)?,
            clearance(&handling.pull_extra_depth)?,
        ))
    }
}

/// Project one validated source into the read model.
pub fn project_spatial_view(
    source: &SpatialViewSource,
) -> Result<SpatialProjection, ProjectionFailure> {
    let (input, stamp, plan_content): (
        &ProjectInput,
        SpatialSourceStamp,
        Option<&SnapshotContent>,
    ) = match source {
        SpatialViewSource::NormalizedInput {
            input,
            input_digest,
        } => {
            let mut diagnostics = validate::validate_project_input(input);
            if canonical::input_digest(input) != *input_digest {
                diagnostics.push(Diagnostic {
                    field_path: "inputDigest".into(),
                    code: "digest_mismatch".into(),
                    reason_code: "digest_mismatch".into(),
                });
            }
            if !diagnostics.is_empty() {
                return Err(ProjectionFailure {
                    code: "projection_integrity_failed",
                    affected_fields: diagnostics.iter().map(|d| d.field_path.clone()).collect(),
                });
            }
            (
                input,
                SpatialSourceStamp::Input {
                    input_digest: input_digest.clone(),
                },
                None,
            )
        }
        SpatialViewSource::Plan { snapshot } => {
            let mut diagnostics = validate::validate_snapshot(snapshot);
            if canonical::input_digest(&snapshot.content.input_facts)
                != snapshot.content.versions.input_digest
            {
                diagnostics.push(Diagnostic {
                    field_path: "content.versions.inputDigest".into(),
                    code: "context_input_mismatch".into(),
                    reason_code: "context_input_mismatch".into(),
                });
            }
            if canonical::snapshot_digest(&snapshot.content) != snapshot.plan_snapshot_id {
                diagnostics.push(Diagnostic {
                    field_path: "planSnapshotId".into(),
                    code: "digest_mismatch".into(),
                    reason_code: "digest_mismatch".into(),
                });
            }
            if !diagnostics.is_empty() {
                return Err(ProjectionFailure {
                    code: "projection_integrity_failed",
                    affected_fields: diagnostics.iter().map(|d| d.field_path.clone()).collect(),
                });
            }
            (
                &snapshot.content.input_facts,
                SpatialSourceStamp::Plan {
                    plan_snapshot_id: snapshot.plan_snapshot_id.clone(),
                    input_digest: snapshot.content.versions.input_digest.clone(),
                    catalog_digest: snapshot.content.versions.catalog_digest.clone(),
                },
                Some(&snapshot.content),
            )
        }
    };

    let space = &input.space;
    let items: BTreeMap<&str, &Item> = input.items.iter().map(|i| (i.id.as_str(), i)).collect();
    let owned: BTreeMap<&str, &OwnedContainer> = input
        .owned_containers
        .iter()
        .map(|o| (o.id.as_str(), o))
        .collect();
    // Catalog facts resolve from the snapshot's retained referenced subset
    // (plan source); an input source has no placements to resolve.
    let variants: BTreeMap<&str, &ProductVariant> = plan_content
        .map(|content| {
            content
                .referenced_catalog
                .variants
                .iter()
                .map(|v| (v.id.as_str(), v))
                .collect()
        })
        .unwrap_or_default();

    let mut overflow = vec![];
    let mut elements: BTreeMap<(u8, String), SpatialElement> = BTreeMap::new();
    let mut overlays: BTreeMap<String, SpatialOverlay> = BTreeMap::new();
    let mut guides: BTreeMap<String, DimensionGuide> = BTreeMap::new();
    let mut links: Vec<SpatialLink> = vec![];

    // ---- compartment boundary -------------------------------------------
    {
        let refs = sorted_refs(vec![
            ref_of(&space.id, "interior.width"),
            ref_of(&space.id, "interior.depth"),
            ref_of(&space.id, "interior.height"),
        ]);
        let axes = [
            extent_axis(&space.interior.width),
            extent_axis(&space.interior.depth),
            extent_axis(&space.interior.height),
        ];
        elements.insert(
            (
                role_rank(&SpatialRole::CompartmentBoundary),
                target_key(&SpatialTarget::Space {
                    space_id: space.id.clone(),
                }),
            ),
            SpatialElement {
                target: SpatialTarget::Space {
                    space_id: space.id.clone(),
                },
                role: SpatialRole::CompartmentBoundary,
                parent_placement_id: None,
                world_box: geometry_box(axes, CheckBasis::Nominal, refs.clone(), &mut overflow),
                top_rect: geometry_rect(axes[0], axes[1], refs.clone(), &mut overflow),
                front_rect: geometry_rect(axes[0], axes[2], refs.clone(), &mut overflow),
                cavity_local_box: ProjectionGeometry::not_applicable("not_container"),
                measurement_box: ProjectionGeometry::not_applicable("not_item_envelope"),
                check_ids: vec![],
                field_refs: refs,
            },
        );
    }

    // ---- front opening: a zero-thickness conceptual plane at y=0 --------
    // Never fabricated into a wall thickness: front rectangle only, world
    // box explicitly unavailable, top view is the y=0 edge (a line).
    {
        let refs = sorted_refs(vec![
            ref_of(&space.id, "opening.left"),
            ref_of(&space.id, "opening.bottom"),
            ref_of(&space.id, "opening.width"),
            ref_of(&space.id, "opening.height"),
        ]);
        let x = nominal_region(&space.opening.left, &space.opening.width);
        let z = nominal_region(&space.opening.bottom, &space.opening.height);
        elements.insert(
            (
                role_rank(&SpatialRole::Aperture),
                target_key(&SpatialTarget::Opening {
                    space_id: space.id.clone(),
                }),
            ),
            SpatialElement {
                target: SpatialTarget::Opening {
                    space_id: space.id.clone(),
                },
                role: SpatialRole::Aperture,
                parent_placement_id: None,
                world_box: ProjectionGeometry::unavailable("zero_thickness_plane", refs.clone()),
                top_rect: geometry_rect(
                    x,
                    Some(AxisInterval { lo: 0, hi: 0 }),
                    refs.clone(),
                    &mut overflow,
                ),
                front_rect: geometry_rect(x, z, refs.clone(), &mut overflow),
                cavity_local_box: ProjectionGeometry::not_applicable("not_container"),
                measurement_box: ProjectionGeometry::not_applicable("not_item_envelope"),
                check_ids: vec![],
                field_refs: refs,
            },
        );
    }

    // ---- established support surface (footprint at elevation) -----------
    {
        let refs = sorted_refs(vec![
            ref_of(&space.support.id, "footprint.x"),
            ref_of(&space.support.id, "footprint.y"),
            ref_of(&space.support.id, "footprint.width"),
            ref_of(&space.support.id, "footprint.depth"),
            ref_of(&space.support.id, "elevation"),
        ]);
        let (foot_x, foot_y) = nominal_footprint(&space.support.footprint)
            .map_or((None, None), |(x, y)| (Some(x), Some(y)));
        let elevation = point_axis(&space.support.elevation);
        elements.insert(
            (
                role_rank(&SpatialRole::SupportSurface),
                target_key(&SpatialTarget::Support {
                    support_id: space.support.id.clone(),
                }),
            ),
            SpatialElement {
                target: SpatialTarget::Support {
                    support_id: space.support.id.clone(),
                },
                role: SpatialRole::SupportSurface,
                parent_placement_id: None,
                world_box: ProjectionGeometry::unavailable("zero_thickness_plane", refs.clone()),
                top_rect: geometry_rect(foot_x, foot_y, refs.clone(), &mut overflow),
                front_rect: geometry_rect(foot_x, elevation, refs.clone(), &mut overflow),
                cavity_local_box: ProjectionGeometry::not_applicable("not_container"),
                measurement_box: ProjectionGeometry::not_applicable("not_item_envelope"),
                check_ids: vec![],
                field_refs: refs,
            },
        );
    }

    // ---- fixed obstacles -------------------------------------------------
    for obstacle in &space.obstacles {
        let role = match obstacle.role {
            ObstacleRole::PhysicalSolid => SpatialRole::PhysicalObstacle,
            ObstacleRole::AccessExclusion => SpatialRole::AccessExclusion,
        };
        let refs = sorted_refs(vec![
            ref_of(&obstacle.id, "bounds.minX"),
            ref_of(&obstacle.id, "bounds.minY"),
            ref_of(&obstacle.id, "bounds.minZ"),
            ref_of(&obstacle.id, "bounds.extent.width"),
            ref_of(&obstacle.id, "bounds.extent.depth"),
            ref_of(&obstacle.id, "bounds.extent.height"),
        ]);
        let axes = [
            nominal_region(&obstacle.bounds.min_x, &obstacle.bounds.extent.width),
            nominal_region(&obstacle.bounds.min_y, &obstacle.bounds.extent.depth),
            nominal_region(&obstacle.bounds.min_z, &obstacle.bounds.extent.height),
        ];
        elements.insert(
            (
                role_rank(&role),
                target_key(&SpatialTarget::Obstacle {
                    obstacle_id: obstacle.id.clone(),
                }),
            ),
            SpatialElement {
                target: SpatialTarget::Obstacle {
                    obstacle_id: obstacle.id.clone(),
                },
                role,
                parent_placement_id: None,
                world_box: geometry_box(axes, CheckBasis::Nominal, refs.clone(), &mut overflow),
                top_rect: geometry_rect(axes[0], axes[1], refs.clone(), &mut overflow),
                front_rect: geometry_rect(axes[0], axes[2], refs.clone(), &mut overflow),
                cavity_local_box: ProjectionGeometry::not_applicable("not_container"),
                measurement_box: ProjectionGeometry::not_applicable("not_item_envelope"),
                check_ids: vec![],
                field_refs: refs,
            },
        );
    }

    // ---- item measuring envelopes (input types, never instances) --------
    // The measurement frame is the item's own diagram origin and is never
    // placed at the compartment origin; the world frame stays explicitly
    // not-applicable until an actual placement represents the item.
    for item in &input.items {
        let refs = sorted_refs(vec![
            ref_of(&item.id, "dimensions.envelope.width"),
            ref_of(&item.id, "dimensions.envelope.depth"),
            ref_of(&item.id, "dimensions.envelope.height"),
        ]);
        let axes = [
            extent_axis(&item.dimensions.envelope.width),
            extent_axis(&item.dimensions.envelope.depth),
            extent_axis(&item.dimensions.envelope.height),
        ];
        elements.insert(
            (
                role_rank(&SpatialRole::ItemEnvelope),
                target_key(&SpatialTarget::Item {
                    item_id: item.id.clone(),
                }),
            ),
            SpatialElement {
                target: SpatialTarget::Item {
                    item_id: item.id.clone(),
                },
                role: SpatialRole::ItemEnvelope,
                parent_placement_id: None,
                world_box: ProjectionGeometry::not_applicable("item_envelope_unplaced"),
                top_rect: ProjectionGeometry::not_applicable("item_envelope_unplaced"),
                front_rect: ProjectionGeometry::not_applicable("item_envelope_unplaced"),
                cavity_local_box: ProjectionGeometry::not_applicable("not_container"),
                measurement_box: geometry_box(
                    axes,
                    CheckBasis::Nominal,
                    refs.clone(),
                    &mut overflow,
                ),
                check_ids: vec![],
                field_refs: refs,
            },
        );
    }

    // ---- placements and their derived scene (plan source only) ----------
    if let Some(content) = plan_content {
        let resolved: Vec<Resolved> = content
            .placements
            .iter()
            .filter_map(|placement| {
                let subject = match &placement.subject {
                    PlacementSubject::DirectItem { item_id, .. } => {
                        SubjectFacts::Item(items.get(item_id.as_str())?)
                    }
                    PlacementSubject::OwnedContainer { owned_id, .. } => {
                        SubjectFacts::Owned(owned.get(owned_id.as_str())?)
                    }
                    PlacementSubject::NewContainer { variant_id, .. } => {
                        SubjectFacts::New(variants.get(variant_id.as_str())?)
                    }
                };
                Some(Resolved { placement, subject })
            })
            .collect();
        let resolved_by_id: BTreeMap<&str, &Resolved> = resolved
            .iter()
            .map(|r| (r.placement.id.as_str(), r))
            .collect();

        for r in &resolved {
            let role = match &r.placement.subject {
                PlacementSubject::DirectItem { .. } => SpatialRole::DirectItem,
                PlacementSubject::OwnedContainer { .. } => SpatialRole::OwnedContainer,
                PlacementSubject::NewContainer { .. } => SpatialRole::NewContainer,
            };
            let refs = r.dimension_refs();
            let pos = position_axes(&r.placement.position);
            let axes = axes_at(pos, r.nominal_axes());
            let target = SpatialTarget::Placement {
                placement_id: r.placement.id.clone(),
            };
            let cavity_local = cavity_axes(r.container_dims(), refs.clone());
            elements.insert(
                (role_rank(&role), target_key(&target)),
                SpatialElement {
                    target: target.clone(),
                    role,
                    parent_placement_id: match &r.placement.parent {
                        ParentRef::Space { .. } => None,
                        ParentRef::Container { placement_id } => Some(placement_id.clone()),
                    },
                    world_box: geometry_box(axes, CheckBasis::Nominal, refs.clone(), &mut overflow),
                    top_rect: geometry_rect(axes[0], axes[1], refs.clone(), &mut overflow),
                    front_rect: geometry_rect(axes[0], axes[2], refs.clone(), &mut overflow),
                    cavity_local_box: cavity_local,
                    measurement_box: ProjectionGeometry::not_applicable("not_item_envelope"),
                    check_ids: vec![],
                    field_refs: refs,
                },
            );
        }

        // ---- contained children: authoritative parent/offset/yaw transform
        for assignment in &content.assignments {
            let ItemLocation::Contained {
                container_placement_id,
                local_placement,
            } = &assignment.location
            else {
                continue;
            };
            let Some(item) = items.get(assignment.item_id.as_str()) else {
                continue;
            };
            let Some(parent) = resolved_by_id.get(container_placement_id.as_str()) else {
                continue;
            };
            let refs = sorted_refs(vec![
                ref_of(&item.id, "dimensions.envelope.width"),
                ref_of(&item.id, "dimensions.envelope.depth"),
                ref_of(&item.id, "dimensions.envelope.height"),
                ref_of(&parent.placement.id, "orientation"),
                ref_of(&parent.entity_id(), "dimensions.innerOffset.x"),
                ref_of(&parent.entity_id(), "dimensions.innerOffset.y"),
                ref_of(&parent.entity_id(), "dimensions.innerOffset.z"),
            ]);
            let local_pos = position_axes(&local_placement.position);
            let local_extent =
                nominal_axis_extents(&item.dimensions.envelope, local_placement.orientation);
            // The world child box uses the same parent-yaw formulas as
            // `geometry::child_global_box`. An unknown inner offset leaves
            // the world box explicitly unavailable — never centered, never
            // zero, never parent+local. A missing axis stays missing.
            let world_axes: [Option<AxisInterval>; 3] = match parent.container_dims() {
                Some(dims) => child_world_axes(
                    &parent.placement.position,
                    parent.placement.orientation,
                    nominal_length(&parent.dims().depth),
                    &dims.inner_offset,
                    local_pos,
                    local_extent,
                ),
                None => [None, None, None],
            };
            let missing_offset = parent
                .container_dims()
                .is_some_and(|dims| offset_unknown(&dims.inner_offset));
            let world_reason = if missing_offset {
                "offset_unknown"
            } else {
                "fact_unknown"
            };
            let world_box = match world_axes[0] {
                Some(_) => {
                    geometry_box(world_axes, CheckBasis::Nominal, refs.clone(), &mut overflow)
                }
                None => ProjectionGeometry::unavailable(world_reason, refs.clone()),
            };
            let top_rect = match world_axes[0].zip(world_axes[1]) {
                Some(_) => geometry_rect(world_axes[0], world_axes[1], refs.clone(), &mut overflow),
                None => ProjectionGeometry::unavailable(world_reason, refs.clone()),
            };
            let front_rect = match world_axes[0].zip(world_axes[2]) {
                Some(_) => geometry_rect(world_axes[0], world_axes[2], refs.clone(), &mut overflow),
                None => ProjectionGeometry::unavailable(world_reason, refs.clone()),
            };
            // The cavity-local frame stays drawable in its own coordinates.
            let cavity_axes = axes_at(local_pos, local_extent);
            let cavity_refs = sorted_refs(vec![
                ref_of(&item.id, "dimensions.envelope.width"),
                ref_of(&item.id, "dimensions.envelope.depth"),
                ref_of(&item.id, "dimensions.envelope.height"),
            ]);
            elements.insert(
                (
                    role_rank(&SpatialRole::ContainedItem),
                    target_key(&SpatialTarget::ItemInstance {
                        item_id: assignment.item_id.clone(),
                        unit_ordinal: assignment.unit_ordinal,
                    }),
                ),
                SpatialElement {
                    target: SpatialTarget::ItemInstance {
                        item_id: assignment.item_id.clone(),
                        unit_ordinal: assignment.unit_ordinal,
                    },
                    role: SpatialRole::ContainedItem,
                    parent_placement_id: Some(container_placement_id.clone()),
                    world_box,
                    top_rect,
                    front_rect,
                    cavity_local_box: geometry_box(
                        cavity_axes,
                        CheckBasis::Nominal,
                        cavity_refs,
                        &mut overflow,
                    ),
                    measurement_box: ProjectionGeometry::not_applicable("placed_instance"),
                    check_ids: vec![],
                    field_refs: refs,
                },
            );
        }

        // ---- inner cavity elements (a container's separate cavity frame) --
        for r in &resolved {
            let Some(dims) = r.container_dims() else {
                continue;
            };
            let refs = sorted_refs(vec![
                ref_of(&r.entity_id(), "dimensions.inner.width"),
                ref_of(&r.entity_id(), "dimensions.inner.depth"),
                ref_of(&r.entity_id(), "dimensions.inner.height"),
                ref_of(&r.entity_id(), "dimensions.innerOffset.x"),
                ref_of(&r.entity_id(), "dimensions.innerOffset.y"),
                ref_of(&r.entity_id(), "dimensions.innerOffset.z"),
                ref_of(&r.placement.id, "orientation"),
            ]);
            let inner_extent = nominal_axis_extents(&dims.inner, Orientation::Upright0);
            let world_axes = child_world_axes(
                &r.placement.position,
                r.placement.orientation,
                nominal_length(&r.dims().depth),
                &dims.inner_offset,
                [0, 0, 0],
                inner_extent,
            );
            let world_reason = if offset_unknown(&dims.inner_offset) {
                "offset_unknown"
            } else {
                "fact_unknown"
            };
            let world_box = match world_axes[0] {
                Some(_) => {
                    geometry_box(world_axes, CheckBasis::Nominal, refs.clone(), &mut overflow)
                }
                None => ProjectionGeometry::unavailable(world_reason, refs.clone()),
            };
            let top_rect = match world_axes[0].zip(world_axes[1]) {
                Some(_) => geometry_rect(world_axes[0], world_axes[1], refs.clone(), &mut overflow),
                None => ProjectionGeometry::unavailable(world_reason, refs.clone()),
            };
            let front_rect = match world_axes[0].zip(world_axes[2]) {
                Some(_) => geometry_rect(world_axes[0], world_axes[2], refs.clone(), &mut overflow),
                None => ProjectionGeometry::unavailable(world_reason, refs.clone()),
            };
            let target = SpatialTarget::Placement {
                placement_id: r.placement.id.clone(),
            };
            let cavity_local = cavity_axes(r.container_dims(), refs.clone());
            elements.insert(
                (role_rank(&SpatialRole::InnerCavity), target_key(&target)),
                SpatialElement {
                    target,
                    role: SpatialRole::InnerCavity,
                    parent_placement_id: None,
                    world_box,
                    top_rect,
                    front_rect,
                    cavity_local_box: cavity_local,
                    measurement_box: ProjectionGeometry::not_applicable("not_item_envelope"),
                    check_ids: vec![],
                    field_refs: refs,
                },
            );
        }

        // ---- overlays ------------------------------------------------------
        for r in &resolved {
            let target = SpatialTarget::Placement {
                placement_id: r.placement.id.clone(),
            };
            let pos = position_axes(&r.placement.position);
            let base_refs = sorted_refs(vec![
                ref_of(&r.placement.id, "orientation"),
                ref_of(&r.entity_id(), "dimensions.outer.width"),
                ref_of(&r.entity_id(), "dimensions.outer.depth"),
                ref_of(&r.entity_id(), "dimensions.outer.height"),
            ]);
            // Nominal and conservative occupied envelopes at the declared
            // position — the same shape construction the validator uses.
            for (role, basis, extent) in [
                (
                    SpatialOverlayRole::NominalOuter,
                    CheckBasis::Nominal,
                    r.nominal_extent(),
                ),
                (
                    SpatialOverlayRole::ConservativeOuter,
                    CheckBasis::Conservative,
                    r.occupied_extent(),
                ),
            ] {
                let geometry = geometry_box(
                    [
                        placed_axis(pos[0], extent.map(|e| e[0])),
                        placed_axis(pos[1], extent.map(|e| e[1])),
                        placed_axis(pos[2], extent.map(|e| e[2])),
                    ],
                    basis,
                    base_refs.clone(),
                    &mut overflow,
                );
                let id = overlay_id(
                    role_key(&role),
                    &target_key(&target),
                    None,
                    basis_key(basis),
                );
                overlays.insert(
                    id.clone(),
                    SpatialOverlay {
                        overlay_id: finalize::bounded_step_id(&id),
                        target: target.clone(),
                        role,
                        motion_phase: None,
                        geometry,
                        check_ids: vec![],
                        field_refs: base_refs.clone(),
                    },
                );
            }
            // Cavity overlays: nominal cavity and conservative cavity
            // (available interior at the worst-case offset) under the same
            // parent yaw transform.
            if let Some(dims) = r.container_dims() {
                for (role, basis, conservative) in [
                    (SpatialOverlayRole::NominalInner, CheckBasis::Nominal, false),
                    (
                        SpatialOverlayRole::ConservativeInner,
                        CheckBasis::Conservative,
                        true,
                    ),
                ] {
                    let geometry = if conservative {
                        let missing_offset = offset_unknown(&dims.inner_offset);
                        match available_interior(&dims.inner) {
                            Some(extent) => match conservative_cavity_axes(
                                &r.placement.position,
                                r.placement.orientation,
                                occupied_length(&r.dims().depth),
                                &dims.inner_offset,
                                extent,
                            ) {
                                Some(axes) => {
                                    geometry_box(axes, basis, base_refs.clone(), &mut overflow)
                                }
                                None => ProjectionGeometry::unavailable(
                                    if missing_offset {
                                        "offset_unknown"
                                    } else {
                                        "uncertainty_unknown"
                                    },
                                    base_refs.clone(),
                                ),
                            },
                            // Unknown extent bounds never borrow the nominal cavity.
                            None => ProjectionGeometry::unavailable(
                                if missing_offset {
                                    "offset_unknown"
                                } else {
                                    "uncertainty_unknown"
                                },
                                base_refs.clone(),
                            ),
                        }
                    } else if offset_unknown(&dims.inner_offset) {
                        ProjectionGeometry::unavailable("offset_unknown", base_refs.clone())
                    } else {
                        geometry_box(
                            child_world_axes(
                                &r.placement.position,
                                r.placement.orientation,
                                nominal_length(&r.dims().depth),
                                &dims.inner_offset,
                                [0, 0, 0],
                                nominal_axis_extents(&dims.inner, Orientation::Upright0),
                            ),
                            basis,
                            base_refs.clone(),
                            &mut overflow,
                        )
                    };
                    let id = overlay_id(
                        role_key(&role),
                        &target_key(&target),
                        None,
                        basis_key(basis),
                    );
                    overlays.insert(
                        id.clone(),
                        SpatialOverlay {
                            overlay_id: finalize::bounded_step_id(&id),
                            target: target.clone(),
                            role,
                            motion_phase: None,
                            geometry,
                            check_ids: vec![],
                            field_refs: base_refs.clone(),
                        },
                    );
                }
            }
            // Motion overlays use the same shared `moving_envelope` helper
            // the validator uses; unknown margins keep them unavailable.
            let handling_refs = sorted_refs(vec![
                ref_of(&r.entity_id(), "handling.left"),
                ref_of(&r.entity_id(), "handling.right"),
                ref_of(&r.entity_id(), "handling.top"),
                ref_of(&r.entity_id(), "handling.pullExtraDepth"),
            ]);
            let margins = r.margins();
            for basis in [CheckBasis::Nominal, CheckBasis::Conservative] {
                let extent = if matches!(basis, CheckBasis::Nominal) {
                    r.nominal_extent()
                } else {
                    r.occupied_extent()
                };
                let geometry = match (extent, margins) {
                    (Some(extent), Some(margins)) => {
                        let sweep = moving_envelope(pos, extent, margins);
                        geometry_box(
                            [
                                Some(sweep.axis(0)),
                                Some(sweep.axis(1)),
                                Some(sweep.axis(2)),
                            ],
                            basis,
                            handling_refs.clone(),
                            &mut overflow,
                        )
                    }
                    _ => ProjectionGeometry::unavailable("handling_unknown", handling_refs.clone()),
                };
                let id = overlay_id(
                    role_key(&SpatialOverlayRole::InstallationSweep),
                    &target_key(&target),
                    Some(phase_key(&SpatialMotionPhase::Insert)),
                    basis_key(basis),
                );
                overlays.insert(
                    id.clone(),
                    SpatialOverlay {
                        overlay_id: finalize::bounded_step_id(&id),
                        target: target.clone(),
                        role: SpatialOverlayRole::InstallationSweep,
                        motion_phase: Some(SpatialMotionPhase::Insert),
                        geometry,
                        check_ids: vec![],
                        field_refs: handling_refs.clone(),
                    },
                );
            }
            // Operational access: straight front extraction for direct
            // items; the pulled-out container pose for containers (the same
            // parent frame the validator's retrieval check uses). Only the
            // implemented phases are emitted — no fabricated trajectory.
            let (phase, conservative_only) = if r.is_container() {
                (SpatialMotionPhase::ExtractContainer, true)
            } else {
                (SpatialMotionPhase::ExtractDirect, false)
            };
            let bases = if conservative_only {
                vec![CheckBasis::Conservative]
            } else {
                vec![CheckBasis::Nominal, CheckBasis::Conservative]
            };
            for basis in bases {
                let extent = if matches!(basis, CheckBasis::Nominal) {
                    r.nominal_extent()
                } else {
                    r.occupied_extent()
                };
                let product_depth = if matches!(basis, CheckBasis::Nominal) {
                    nominal_length(&r.dims().depth)
                } else {
                    occupied_length(&r.dims().depth)
                };
                let geometry = if r.is_container() {
                    // Pulled pose uses the product's original outer depth, the
                    // same anchor the validator's retrieval check uses.
                    match (extent, margins, product_depth) {
                        (Some(extent), Some((_, _, _, pull)), Some(depth)) => {
                            let pulled =
                                Box3::from_min_extent([pos[0], -(depth + pull), pos[2]], extent);
                            geometry_box(
                                [
                                    Some(pulled.axis(0)),
                                    Some(pulled.axis(1)),
                                    Some(pulled.axis(2)),
                                ],
                                basis,
                                handling_refs.clone(),
                                &mut overflow,
                            )
                        }
                        (Some(_), None, _) | (None, None, _) => ProjectionGeometry::unavailable(
                            "handling_unknown",
                            handling_refs.clone(),
                        ),
                        _ => ProjectionGeometry::unavailable("fact_unknown", handling_refs.clone()),
                    }
                } else {
                    match (extent, margins) {
                        (Some(extent), Some(margins)) => {
                            let sweep = moving_envelope(pos, extent, margins);
                            geometry_box(
                                [
                                    Some(sweep.axis(0)),
                                    Some(sweep.axis(1)),
                                    Some(sweep.axis(2)),
                                ],
                                basis,
                                handling_refs.clone(),
                                &mut overflow,
                            )
                        }
                        _ => ProjectionGeometry::unavailable(
                            "handling_unknown",
                            handling_refs.clone(),
                        ),
                    }
                };
                let id = overlay_id(
                    role_key(&SpatialOverlayRole::OperationalSweep),
                    &target_key(&target),
                    Some(phase_key(&phase)),
                    basis_key(basis),
                );
                overlays.insert(
                    id.clone(),
                    SpatialOverlay {
                        overlay_id: finalize::bounded_step_id(&id),
                        target: target.clone(),
                        role: SpatialOverlayRole::OperationalSweep,
                        motion_phase: Some(phase),
                        geometry,
                        check_ids: vec![],
                        field_refs: handling_refs.clone(),
                    },
                );
            }
        }
        // Staging free-volume overlays (signed y in front of the opening).
        {
            let target = SpatialTarget::Space {
                space_id: space.id.clone(),
            };
            let refs = sorted_refs(vec![
                ref_of(&space.id, "staging.freeVolume.minX"),
                ref_of(&space.id, "staging.freeVolume.minY"),
                ref_of(&space.id, "staging.freeVolume.minZ"),
                ref_of(&space.id, "staging.freeVolume.extent.width"),
                ref_of(&space.id, "staging.freeVolume.extent.depth"),
                ref_of(&space.id, "staging.freeVolume.extent.height"),
            ]);
            for (basis, cuboid) in [
                (
                    CheckBasis::Nominal,
                    nominal_cuboid(&space.staging.free_volume),
                ),
                (
                    CheckBasis::Conservative,
                    guaranteed_cuboid(&space.staging.free_volume),
                ),
            ] {
                let geometry = match cuboid {
                    Some(box3) => geometry_box(
                        [Some(box3.axis(0)), Some(box3.axis(1)), Some(box3.axis(2))],
                        basis,
                        refs.clone(),
                        &mut overflow,
                    ),
                    None => ProjectionGeometry::unavailable("staging_unknown", refs.clone()),
                };
                let id = overlay_id(
                    role_key(&SpatialOverlayRole::Staging),
                    &target_key(&target),
                    None,
                    basis_key(basis),
                );
                overlays.insert(
                    id.clone(),
                    SpatialOverlay {
                        overlay_id: finalize::bounded_step_id(&id),
                        target: target.clone(),
                        role: SpatialOverlayRole::Staging,
                        motion_phase: None,
                        geometry,
                        check_ids: vec![],
                        field_refs: refs.clone(),
                    },
                );
            }
        }
    }

    // ---- dimension guides --------------------------------------------------
    // Interior axes and aperture openings keep their original facts,
    // uncertainty and provenance verbatim.
    {
        let space_target = SpatialTarget::Space {
            space_id: space.id.clone(),
        };
        let opening_target = SpatialTarget::Opening {
            space_id: space.id.clone(),
        };
        let frame = DimensionFrame::World {
            space_id: space.id.clone(),
        };
        let width = nominal_length(&space.interior.width);
        let depth = nominal_length(&space.interior.depth);
        let height = nominal_length(&space.interior.height);
        let opening_x = nominal_region(&space.opening.left, &space.opening.width);
        let opening_z = nominal_region(&space.opening.bottom, &space.opening.height);
        let guides_source: Vec<GuideSource<'_>> = vec![
            (
                "width",
                &space_target,
                &space.interior.width,
                DimensionView::Front,
                width.map(|w| ([0, 0, 0], [w, 0, 0])),
                "space.interior.width".to_owned(),
            ),
            (
                "depth",
                &space_target,
                &space.interior.depth,
                DimensionView::Top,
                depth.map(|d| ([0, 0, 0], [0, d, 0])),
                "space.interior.depth".to_owned(),
            ),
            (
                "height",
                &space_target,
                &space.interior.height,
                DimensionView::Front,
                height.map(|h| ([0, 0, 0], [0, 0, h])),
                "space.interior.height".to_owned(),
            ),
            (
                "opening.width",
                &opening_target,
                &space.opening.width,
                DimensionView::Front,
                match (opening_x, opening_z) {
                    (Some(x), Some(z)) => Some(([x.lo, 0, z.lo], [x.hi, 0, z.lo])),
                    _ => None,
                },
                "space.opening.width".to_owned(),
            ),
            (
                "opening.height",
                &opening_target,
                &space.opening.height,
                DimensionView::Front,
                match (opening_x, opening_z) {
                    (Some(x), Some(z)) => Some(([x.lo, 0, z.lo], [x.lo, 0, z.hi])),
                    _ => None,
                },
                "space.opening.height".to_owned(),
            ),
        ];
        for (suffix, target, measurement, view, segment, field_path) in guides_source {
            let entity = match target {
                SpatialTarget::Opening { space_id } => space_id.clone(),
                _ => space.id.clone(),
            };
            let refs = sorted_refs(vec![ref_of(&entity, suffix)]);
            guides.insert(
                format!("dim:{field_path}"),
                DimensionGuide {
                    guide_id: finalize::bounded_step_id(&format!(
                        "dim:{}",
                        field_path.replace('.', ":")
                    )),
                    target: target.clone(),
                    field_path: field_path.clone(),
                    label_key: field_path,
                    measurement: measurement.clone(),
                    segment: {
                        let (from, to) = match segment {
                            Some((from, to)) => (Some(from), Some(to)),
                            None => (None, None),
                        };
                        segment_geometry(from, to, refs, &mut overflow)
                    },
                    frame: frame.clone(),
                    preferred_view: view,
                },
            );
        }
    }

    // ---- links (plan source only) ------------------------------------------
    if let Some(content) = plan_content {
        let placements: BTreeMap<&str, &Placement> = content
            .placements
            .iter()
            .map(|p| (p.id.as_str(), p))
            .collect();
        let subject_targets = |ids: &[Id]| -> (Vec<SpatialTarget>, Vec<Id>) {
            let mut targets: Vec<SpatialTarget> = vec![];
            let mut unresolved: Vec<Id> = vec![];
            for id in ids {
                if placements.contains_key(id.as_str()) {
                    targets.push(SpatialTarget::Placement {
                        placement_id: id.clone(),
                    });
                } else if items.contains_key(id.as_str()) {
                    targets.push(SpatialTarget::Item {
                        item_id: id.clone(),
                    });
                } else if id == &space.id {
                    targets.push(SpatialTarget::Space {
                        space_id: id.clone(),
                    });
                } else if space.obstacles.iter().any(|o| &o.id == id) {
                    targets.push(SpatialTarget::Obstacle {
                        obstacle_id: id.clone(),
                    });
                } else if id == &space.support.id {
                    targets.push(SpatialTarget::Support {
                        support_id: id.clone(),
                    });
                } else {
                    // An owned container id resolves to every placement of
                    // that owner (possibly several units).
                    let owned_placements: Vec<SpatialTarget> = content
                        .placements
                        .iter()
                        .filter(|p| {
                            matches!(
                                &p.subject,
                                PlacementSubject::OwnedContainer { owned_id, .. } if owned_id == id
                            )
                        })
                        .map(|p| SpatialTarget::Placement {
                            placement_id: p.id.clone(),
                        })
                        .collect();
                    if owned_placements.is_empty() {
                        // Variant/offer/group ids have no spatial target
                        // namespace; they stay explicitly unresolved.
                        unresolved.push(id.clone());
                    } else {
                        targets.extend(owned_placements);
                    }
                }
            }
            targets.sort_by_key(target_key);
            targets.dedup();
            unresolved.sort();
            (targets, unresolved)
        };

        for check in &content.validation.checks {
            let (targets, unresolved) = subject_targets(&check.subject_ids);
            let resolution = if targets.is_empty() {
                LinkResolution::Unavailable
            } else if unresolved.is_empty() {
                LinkResolution::Resolved
            } else {
                LinkResolution::Partial
            };
            let reason = (targets.is_empty()).then(|| "no_spatial_subject".to_owned());
            links.push(SpatialLink {
                source: SpatialLinkSource::Check {
                    check_id: check.id.clone(),
                },
                targets,
                resolution,
                unresolved_subject_ids: unresolved,
                reason_code: reason,
            });
        }
        for line in &content.bom {
            // BOM links use `placementIds` verbatim; a line with several
            // placements highlights the whole set, never a representative.
            let (targets, unresolved) = subject_targets(&line.placement_ids);
            let resolution = if targets.is_empty() {
                LinkResolution::Unavailable
            } else if unresolved.is_empty() {
                LinkResolution::Resolved
            } else {
                LinkResolution::Partial
            };
            let reason = (targets.is_empty()).then(|| "bom_no_placements".to_owned());
            links.push(SpatialLink {
                source: SpatialLinkSource::Bom {
                    bom_line_id: line.id.clone(),
                },
                targets,
                resolution,
                unresolved_subject_ids: unresolved,
                reason_code: reason,
            });
        }
        // Exact transfer/resolve instances derive through the shared opaque
        // id utility the action producer uses; the projector never parses a
        // step id and never highlights a guessed unit.
        let mut transfer_targets: BTreeMap<String, (Id, u32, Id)> = BTreeMap::new();
        let mut resolve_targets: BTreeMap<String, (Id, u32, Id)> = BTreeMap::new();
        for assignment in &content.assignments {
            match &assignment.location {
                ItemLocation::Contained {
                    container_placement_id,
                    ..
                } => {
                    let step_id =
                        finalize::transfer_step_id(&assignment.item_id, assignment.unit_ordinal);
                    transfer_targets.insert(
                        step_id.as_str().to_owned(),
                        (
                            assignment.item_id.clone(),
                            assignment.unit_ordinal,
                            container_placement_id.clone(),
                        ),
                    );
                }
                ItemLocation::ProvisionalContainer {
                    container_placement_id,
                    ..
                } => {
                    let step_id =
                        finalize::resolve_step_id(&assignment.item_id, assignment.unit_ordinal);
                    resolve_targets.insert(
                        step_id.as_str().to_owned(),
                        (
                            assignment.item_id.clone(),
                            assignment.unit_ordinal,
                            container_placement_id.clone(),
                        ),
                    );
                }
                ItemLocation::Direct { .. } => {}
            }
        }
        for action in &content.actions {
            let (targets, unresolved, reason) = match action.kind {
                ActionKind::TransferContents => {
                    match transfer_targets.get(action.id.as_str()) {
                        Some((item, ordinal, container))
                            if action.subject_ids.contains(item)
                                && action.subject_ids.contains(container) =>
                        {
                            (
                                vec![
                                    SpatialTarget::ItemInstance {
                                        item_id: item.clone(),
                                        unit_ordinal: *ordinal,
                                    },
                                    SpatialTarget::Placement {
                                        placement_id: container.clone(),
                                    },
                                ],
                                vec![],
                                None,
                            )
                        }
                        // Historical or unrecognized id scheme: keep the
                        // text/subjects, never highlight a guessed unit.
                        _ => {
                            let (targets, unresolved) = subject_targets(&action.subject_ids);
                            (
                                targets,
                                unresolved,
                                Some("action_target_unavailable".to_owned()),
                            )
                        }
                    }
                }
                ActionKind::ResolveCondition => match resolve_targets.get(action.id.as_str()) {
                    Some((item, ordinal, container))
                        if action.subject_ids.contains(item)
                            && action.subject_ids.contains(container) =>
                    {
                        (
                            vec![
                                SpatialTarget::ItemInstance {
                                    item_id: item.clone(),
                                    unit_ordinal: *ordinal,
                                },
                                SpatialTarget::Placement {
                                    placement_id: container.clone(),
                                },
                            ],
                            vec![],
                            None,
                        )
                    }
                    _ => {
                        let (targets, unresolved) = subject_targets(&action.subject_ids);
                        let reason =
                            (targets.is_empty()).then(|| "action_target_unavailable".to_owned());
                        (targets, unresolved, reason)
                    }
                },
                _ => {
                    let (targets, unresolved) = subject_targets(&action.subject_ids);
                    let reason =
                        (targets.is_empty()).then(|| "action_no_spatial_target".to_owned());
                    (targets, unresolved, reason)
                }
            };
            let resolution = if targets.is_empty() {
                LinkResolution::Unavailable
            } else if unresolved.is_empty() {
                LinkResolution::Resolved
            } else {
                LinkResolution::Partial
            };
            links.push(SpatialLink {
                source: SpatialLinkSource::Action {
                    step_id: action.id.clone(),
                },
                targets,
                resolution,
                unresolved_subject_ids: unresolved,
                reason_code: reason,
            });
        }

        // Index each check onto every element target its subjects resolve
        // to, so an element carries the checks that speak about it.
        let mut checks_by_target: BTreeMap<String, Vec<Id>> = BTreeMap::new();
        for link in &links {
            if let SpatialLinkSource::Check { check_id } = &link.source {
                for target in &link.targets {
                    checks_by_target
                        .entry(target_key(target))
                        .or_default()
                        .push(check_id.clone());
                }
            }
        }
        for element in elements.values_mut() {
            if let Some(checks) = checks_by_target.get(&target_key(&element.target)) {
                element.check_ids = sorted_ids(checks.clone());
            }
        }
    }

    // ---- caps, ordering, assembly -------------------------------------------
    if !overflow.is_empty() {
        return Err(ProjectionFailure {
            code: "projection_range_exceeded",
            affected_fields: sorted_strings(overflow),
        });
    }
    let mut elements: Vec<SpatialElement> = elements.into_values().collect();
    let overlays: Vec<SpatialOverlay> = overlays.into_values().collect();
    let dimensions: Vec<DimensionGuide> = guides.into_values().collect();
    links.sort_by_key(|l| link_source_key(&l.source));
    if elements.len() > MAX_PROJECTION_ELEMENTS
        || overlays.len() > MAX_PROJECTION_OVERLAYS
        || dimensions.len() > MAX_PROJECTION_DIMENSION_GUIDES
        || links.len() > MAX_PROJECTION_LINKS
    {
        return Err(ProjectionFailure {
            code: "projection_limit_exceeded",
            affected_fields: vec![],
        });
    }
    // Elements are a set keyed by (role, typed target): same source always
    // produces the same order, independent of input collection order.
    elements.sort_by_key(|e| (role_rank(&e.role), target_key(&e.target)));
    let projection = SpatialProjection {
        projection_version: SPATIAL_PROJECTION_VERSION,
        source: stamp,
        interior: input.space.interior.clone(),
        elements,
        overlays,
        dimensions,
        links,
        diagnostics: vec![],
    };
    if serde_json::to_vec(&projection).map_or(true, |bytes| bytes.len() > MAX_PROJECTION_BYTES) {
        return Err(ProjectionFailure {
            code: "projection_limit_exceeded",
            affected_fields: vec![],
        });
    }
    Ok(projection)
}

/// The map key of one overlay — identical to its serialized overlay id, so
/// ordering and uniqueness share one bounded deterministic definition.
fn overlay_id(role: &str, target: &str, phase: Option<&str>, basis: &str) -> String {
    match phase {
        Some(phase) => format!("ovl:{role}:{target}:{phase}:{basis}"),
        None => format!("ovl:{role}:{target}:{basis}"),
    }
}

/// Cavity-local axes of a container's inner cavity: `[0..extent]` per axis
/// in the cavity's own unrotated frame.
fn cavity_axes(
    dims: Option<&VariantDimensions>,
    refs: Vec<FieldRef>,
) -> ProjectionGeometry<ViewBoxMm> {
    let Some(dims) = dims else {
        return ProjectionGeometry::not_applicable("not_container");
    };
    let extent = oriented_nominal_extent(&dims.inner, Orientation::Upright0);
    let axes = [
        placed_axis(0, extent.map(|e| e[0])),
        placed_axis(0, extent.map(|e| e[1])),
        placed_axis(0, extent.map(|e| e[2])),
    ];
    if axes[0].is_none() {
        return ProjectionGeometry::unavailable("cavity_unknown", refs);
    }
    geometry_box(axes, CheckBasis::Nominal, refs, &mut vec![])
}

/// World axes of a conservative cavity: available interior extents placed at
/// the worst-case offset (nominal + plus) under the parent yaw transform.
/// `None` when any required bound is unknown — a conservative envelope is
/// never proved by reusing nominal offsets.
fn conservative_cavity_axes(
    parent_position: &Vec3Mm,
    parent_orientation: Orientation,
    parent_outer_depth: Option<i64>,
    inner_offset: &Fact<InnerOffset>,
    available_extent: [i64; 3],
) -> Option<[Option<AxisInterval>; 3]> {
    let offset = inner_offset.value()?;
    let mut worst = [0i64; 3];
    for (axis, fact) in [&offset.x, &offset.y, &offset.z].into_iter().enumerate() {
        let measured = fact.value()?;
        worst[axis] = match &measured.uncertainty {
            Uncertainty::Bounded { plus_mm, .. } => {
                measured.nominal.get() as i64 + plus_mm.get() as i64
            }
            // Unknown bound: no conservative cavity can be proved.
            Uncertainty::Unknown {} => return None,
        };
    }
    let depth = match parent_orientation {
        Orientation::Upright0 => parent_outer_depth.unwrap_or(0),
        Orientation::Upright90 => parent_outer_depth?,
    };
    let box3 = child_global_box_at(
        parent_position,
        parent_orientation,
        depth,
        worst,
        [0, 0, 0],
        available_extent,
    );
    Some([Some(box3.axis(0)), Some(box3.axis(1)), Some(box3.axis(2))])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provenance() -> Provenance {
        Provenance {
            origin: MeasurementOrigin::Synthetic,
            verification: VerificationStatus::Unverified,
            evidence_ids: vec![],
            rule_ids: vec![],
            input_refs: vec![],
            observed_at: None,
        }
    }
    fn known_length(mm: u32) -> Measurement {
        Fact::Known {
            value: MeasuredLength {
                nominal: LengthMm::new(mm).unwrap(),
                uncertainty: Uncertainty::Unknown {},
            },
            provenance: provenance(),
        }
    }
    fn bounded_length(mm: u32, minus: u32, plus: u32) -> Measurement {
        Fact::Known {
            value: MeasuredLength {
                nominal: LengthMm::new(mm).unwrap(),
                uncertainty: Uncertainty::Bounded {
                    minus_mm: ClearanceMm::new(minus).unwrap(),
                    plus_mm: ClearanceMm::new(plus).unwrap(),
                },
            },
            provenance: provenance(),
        }
    }
    fn known_offset(mm: i32) -> Fact<MeasuredOffset> {
        Fact::Known {
            value: MeasuredOffset {
                nominal: PositionMm::new(mm).unwrap(),
                uncertainty: Uncertainty::Unknown {},
            },
            provenance: provenance(),
        }
    }
    fn bounded_offset(mm: i32, minus: u32, plus: u32) -> Fact<MeasuredOffset> {
        Fact::Known {
            value: MeasuredOffset {
                nominal: PositionMm::new(mm).unwrap(),
                uncertainty: Uncertainty::Bounded {
                    minus_mm: ClearanceMm::new(minus).unwrap(),
                    plus_mm: ClearanceMm::new(plus).unwrap(),
                },
            },
            provenance: provenance(),
        }
    }
    fn offset(x: i32, y: i32, z: i32) -> InnerOffset {
        InnerOffset {
            x: known_offset(x),
            y: known_offset(y),
            z: known_offset(z),
        }
    }
    fn offset_fact(facts: InnerOffset) -> Fact<InnerOffset> {
        Fact::Known {
            value: facts,
            provenance: provenance(),
        }
    }
    fn vec3(x: i32, y: i32, z: i32) -> Vec3Mm {
        Vec3Mm {
            x: PositionMm::new(x).unwrap(),
            y: PositionMm::new(y).unwrap(),
            z: PositionMm::new(z).unwrap(),
        }
    }

    /// SPATIAL_INTERACTION_PLAN R1: parent (100,200,0), outer depth 400,
    /// inner offset (10,20,5), child local (30,40,0), extent (50,60,70) —
    /// yaw90 must give min (380,240,5), extent (60,50,70).
    #[test]
    fn r1_yaw90_child_global_box() {
        let box3 = child_global_box(
            &vec3(100, 200, 0),
            Orientation::Upright90,
            400,
            &offset(10, 20, 5),
            [30, 40, 0],
            [50, 60, 70],
        )
        .unwrap();
        assert_eq!(box3.min, [380, 240, 5]);
        assert_eq!(box3.max, [440, 290, 75]);
        // The naive parent+local sum the old SVG view used differs.
        assert_ne!(box3.min, [130, 240, 5]);
    }

    /// yaw0 keeps the plain product-frame sum; a second yaw90 application
    /// would double-rotate, which the shared helper never does.
    #[test]
    fn yaw0_child_global_box() {
        let box3 = child_global_box(
            &vec3(100, 200, 0),
            Orientation::Upright0,
            400,
            &offset(10, 10, 10),
            [30, 40, 0],
            [50, 60, 70],
        )
        .unwrap();
        assert_eq!(box3.min, [140, 250, 10]);
        assert_eq!(box3.max, [190, 310, 80]);
    }

    /// The child's own yaw90 swaps its local extents before the parent
    /// transform (R1 companion case).
    #[test]
    fn child_own_yaw90_swaps_local_extent() {
        let box3 = child_global_box(
            &vec3(100, 200, 0),
            Orientation::Upright90,
            400,
            &offset(10, 20, 5),
            [30, 40, 0],
            [60, 50, 70],
        )
        .unwrap();
        assert_eq!(box3.min, [390, 240, 5]);
        assert_eq!(box3.max, [440, 300, 75]);
    }

    /// Conservative cavity needs every offset bound; the worst-case offset
    /// (nominal + plus) replaces the nominal one.
    #[test]
    fn conservative_cavity_requires_bounded_offsets() {
        let bounded = InnerOffset {
            x: bounded_offset(5, 1, 3),
            y: bounded_offset(5, 1, 2),
            z: bounded_offset(10, 1, 4),
        };
        let axes = conservative_cavity_axes(
            &vec3(0, 0, 0),
            Orientation::Upright0,
            Some(200),
            &offset_fact(bounded),
            [280, 180, 130],
        )
        .unwrap();
        let mins = axes.map(|a| a.unwrap().lo);
        assert_eq!(mins, [8, 7, 14]);
        // Any unknown offset bound makes the conservative cavity unavailable.
        let unknown_bound = InnerOffset {
            x: known_offset(5),
            y: known_offset(5),
            z: known_offset(10),
        };
        assert!(
            conservative_cavity_axes(
                &vec3(0, 0, 0),
                Orientation::Upright0,
                Some(200),
                &offset_fact(unknown_bound),
                [280, 180, 130]
            )
            .is_none()
        );
        let unknown = Fact::<InnerOffset>::Unknown {
            reason: UnknownReason::NotProvided,
        };
        assert!(
            conservative_cavity_axes(
                &vec3(0, 0, 0),
                Orientation::Upright0,
                Some(200),
                &unknown,
                [280, 180, 130]
            )
            .is_none()
        );
    }

    /// Bounded uncertainty widens the occupied envelope but never the
    /// nominal one; unknown uncertainty makes the conservative extent None.
    #[test]
    fn nominal_and_occupied_extents_stay_distinct() {
        let fact = bounded_length(300, 10, 20);
        assert_eq!(nominal_length(&fact), Some(300));
        assert_eq!(occupied_length(&fact), Some(320));
        let unknown_bound = known_length(300);
        assert_eq!(nominal_length(&unknown_bound), Some(300));
        assert_eq!(occupied_length(&unknown_bound), None);
    }

    /// The shared moving-envelope helper keeps the validator's exact formula:
    /// sides expand by left/right, top by top, front by depth + pull.
    #[test]
    fn moving_envelope_formula() {
        let sweep = moving_envelope([100, 200, 10], [50, 60, 70], (5, 7, 9, 11));
        assert_eq!(sweep.min, [95, -(60 + 11), 10]);
        assert_eq!(sweep.max, [100 + 50 + 7, 200 + 60, 10 + 70 + 9]);
    }

    /// Partial axes use the same yaw formulas as the complete shared box.
    #[test]
    fn child_world_axes_match_shared_box_and_keep_known_axes() {
        let parent = vec3(100, 200, 0);
        let inner = offset(10, 20, 5);
        let local = [30, 40, 0];
        let extent = [50i64, 60, 70];
        let shared =
            child_global_box(&parent, Orientation::Upright90, 400, &inner, local, extent).unwrap();
        let axes = child_world_axes(
            &parent,
            Orientation::Upright90,
            Some(400),
            &offset_fact(inner.clone()),
            local,
            [Some(50), Some(60), Some(70)],
        );
        assert_eq!(
            axes.map(|axis| axis.unwrap().lo),
            [shared.min[0], shared.min[1], shared.min[2]]
        );
        assert_eq!(
            axes.map(|axis| axis.unwrap().hi),
            [shared.max[0], shared.max[1], shared.max[2]]
        );
        // Unknown height leaves x/y drawable and does not invent a z extent.
        let partial = child_world_axes(
            &parent,
            Orientation::Upright0,
            Some(400),
            &offset_fact(inner.clone()),
            local,
            [Some(50), Some(60), None],
        );
        assert!(partial[0].is_some() && partial[1].is_some() && partial[2].is_none());
        let mut top_overflow = vec![];
        assert!(matches!(
            geometry_rect(partial[0], partial[1], vec![], &mut top_overflow),
            ProjectionGeometry::Available { .. }
        ));
        assert!(matches!(
            geometry_box(partial, CheckBasis::Nominal, vec![], &mut top_overflow),
            ProjectionGeometry::Unavailable { .. }
        ));
        // Unknown offset clears every world axis.
        let mut cleared = inner.clone();
        cleared.y = Fact::Unknown {
            reason: UnknownReason::NotProvided,
        };
        let none = child_world_axes(
            &parent,
            Orientation::Upright90,
            Some(400),
            &offset_fact(cleared),
            local,
            [Some(50), Some(60), Some(70)],
        );
        assert!(none.iter().all(Option::is_none));
    }

    /// Nominal cavity geometry uses the known offset even when its
    /// uncertainty bound is unknown. Conservative geometry stays unavailable.
    #[test]
    fn nominal_cavity_does_not_reuse_bounds_it_does_not_have() {
        let inner = InnerOffset {
            x: known_offset(5),
            y: known_offset(5),
            z: known_offset(10),
        };
        let axes = child_world_axes(
            &vec3(0, 0, 0),
            Orientation::Upright0,
            Some(200),
            &offset_fact(inner.clone()),
            [0, 0, 0],
            [Some(280), Some(180), Some(130)],
        );
        assert_eq!(axes.map(|axis| axis.unwrap().lo), [5, 5, 10]);
        assert!(
            conservative_cavity_axes(
                &vec3(0, 0, 0),
                Orientation::Upright0,
                Some(200),
                &offset_fact(inner),
                [280, 180, 130],
            )
            .is_none()
        );
    }
}
