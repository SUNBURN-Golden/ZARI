//! Foundational rectangular geometry for the independent validator
//! (SOLVER.md §4, DOMAIN_MODEL coordinate contract). All values are integer
//! millimetres on i64 so checked arithmetic cannot wrap the scalar bounds.
//!
//! Two measurement roles are kept distinct throughout:
//! - *occupied* extents conservatively use nominal + plus uncertainty;
//! - *available* extents conservatively use nominal − minus uncertainty.
//!
//! An unknown fact or unknown uncertainty yields `None` for the conservative
//! query; callers turn that into `CheckStatus::Unknown`, never zero or pass.

use crate::catalog::*;
use crate::facts::*;
use crate::input::*;
use crate::scalars::*;

/// Half-open integer interval on one axis.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AxisInterval {
    pub lo: i64,
    pub hi: i64,
}
impl AxisInterval {
    pub fn contains(&self, inner: AxisInterval) -> bool {
        inner.lo >= self.lo && inner.hi <= self.hi
    }
    /// Positive-length overlap: touching faces do not intersect.
    pub fn intersects(&self, other: &AxisInterval) -> bool {
        self.lo < other.hi && other.lo < self.hi
    }
    /// Separation gap; 0 when the intervals touch or overlap.
    pub fn gap(&self, other: &AxisInterval) -> i64 {
        (other.lo - self.hi).max(self.lo - other.hi).max(0)
    }
}

/// Half-open axis-aligned box in the compartment frame.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Box3 {
    pub min: [i64; 3],
    pub max: [i64; 3],
}
impl Box3 {
    pub fn from_min_extent(min: [i64; 3], extent: [i64; 3]) -> Box3 {
        Box3 {
            min,
            max: [min[0] + extent[0], min[1] + extent[1], min[2] + extent[2]],
        }
    }
    pub fn axis(&self, axis: usize) -> AxisInterval {
        AxisInterval {
            lo: self.min[axis],
            hi: self.max[axis],
        }
    }
    /// Positive-volume collision on all three axes.
    pub fn intersects(&self, other: &Box3) -> bool {
        (0..3).all(|axis| self.axis(axis).intersects(&other.axis(axis)))
    }
    pub fn contains(&self, inner: &Box3) -> bool {
        (0..3).all(|axis| self.axis(axis).contains(inner.axis(axis)))
    }
    /// Largest separating-axis gap between the two boxes; 0 when they touch
    /// or overlap on every axis.
    pub fn separation(&self, other: &Box3) -> i64 {
        (0..3)
            .map(|axis| self.axis(axis).gap(&other.axis(axis)))
            .max()
            .unwrap_or(0)
    }
}

/// mm bounds of a bounded uncertainty fact; `None` when the fact or its
/// uncertainty is unknown.
fn bounds(uncertainty: &Uncertainty) -> Option<(i64, i64)> {
    match uncertainty {
        Uncertainty::Bounded { minus_mm, plus_mm } => {
            Some((minus_mm.get() as i64, plus_mm.get() as i64))
        }
        Uncertainty::Unknown {} => None,
    }
}
fn length_bounds(fact: &Measurement) -> Option<(i64, i64, i64)> {
    let measured = fact.value()?;
    let (minus, plus) = bounds(&measured.uncertainty)?;
    Some((measured.nominal.get() as i64, minus, plus))
}
fn offset_bounds(fact: &Fact<MeasuredOffset>) -> Option<(i64, i64, i64)> {
    let measured = fact.value()?;
    let (minus, plus) = bounds(&measured.uncertainty)?;
    Some((measured.nominal.get() as i64, minus, plus))
}

/// Nominal extent of a measured length, or `None` when unknown.
pub fn nominal_length(fact: &Measurement) -> Option<i64> {
    fact.value().map(|m| m.nominal.get() as i64)
}
/// Conservative *occupied* extent: nominal + plus uncertainty.
pub fn occupied_length(fact: &Measurement) -> Option<i64> {
    let (nominal, _, plus) = length_bounds(fact)?;
    Some(nominal + plus)
}
/// Conservative *available* extent: nominal − minus uncertainty.
pub fn available_length(fact: &Measurement) -> Option<i64> {
    let (nominal, minus, _) = length_bounds(fact)?;
    Some(nominal - minus)
}

/// Nominal region covered by a measured cuboid axis.
pub fn nominal_region(min: &Fact<MeasuredOffset>, extent: &Measurement) -> Option<AxisInterval> {
    let lo = min.value()?.nominal.get() as i64;
    let ext = nominal_length(extent)?;
    Some(AxisInterval { lo, hi: lo + ext })
}
/// Guaranteed-available region: the interval every possible true region
/// contains, `[min+plus, min−minus + extent−minus_extent]`. `None` when any
/// needed fact or uncertainty bound is unknown.
pub fn guaranteed_region(min: &Fact<MeasuredOffset>, extent: &Measurement) -> Option<AxisInterval> {
    let (min_nominal, min_minus, min_plus) = offset_bounds(min)?;
    let (ext_nominal, ext_minus, _) = length_bounds(extent)?;
    Some(AxisInterval {
        lo: min_nominal + min_plus,
        hi: min_nominal - min_minus + (ext_nominal - ext_minus),
    })
}
/// Worst-case occupied region of an uncertain solid: the union of all
/// possible positions, `[min−minus, min+plus + extent+plus_extent]`.
pub fn occupied_region(min: &Fact<MeasuredOffset>, extent: &Measurement) -> Option<AxisInterval> {
    let (min_nominal, min_minus, min_plus) = offset_bounds(min)?;
    let (ext_nominal, _, ext_plus) = length_bounds(extent)?;
    Some(AxisInterval {
        lo: min_nominal - min_minus,
        hi: min_nominal + min_plus + (ext_nominal + ext_plus),
    })
}

/// Nominal 3-axis extent for the declared orientation (x/y swap on yaw90).
pub fn oriented_nominal_extent(
    dimensions: &Dimensions,
    orientation: Orientation,
) -> Option<[i64; 3]> {
    let (w, d, h) = (
        nominal_length(&dimensions.width)?,
        nominal_length(&dimensions.depth)?,
        nominal_length(&dimensions.height)?,
    );
    Some(match orientation {
        Orientation::Upright0 => [w, d, h],
        Orientation::Upright90 => [d, w, h],
    })
}
/// Conservative occupied extent (nominal + plus per axis) in the declared
/// orientation. `None` when any extent or uncertainty is unknown.
pub fn oriented_occupied_extent(
    dimensions: &Dimensions,
    orientation: Orientation,
) -> Option<[i64; 3]> {
    let (w, d, h) = (
        occupied_length(&dimensions.width)?,
        occupied_length(&dimensions.depth)?,
        occupied_length(&dimensions.height)?,
    );
    Some(match orientation {
        Orientation::Upright0 => [w, d, h],
        Orientation::Upright90 => [d, w, h],
    })
}
/// Conservative available interior extent per axis (nominal − minus).
pub fn available_interior(dimensions: &Dimensions) -> Option<[i64; 3]> {
    Some([
        available_length(&dimensions.width)?,
        available_length(&dimensions.depth)?,
        available_length(&dimensions.height)?,
    ])
}

/// `Fact<ClearanceMm>` as an optional millimetre requirement.
pub fn clearance(fact: &Fact<ClearanceMm>) -> Option<i64> {
    fact.value().map(|c| c.get() as i64)
}

/// Nominal cuboid box.
pub fn nominal_cuboid(cuboid: &MeasuredCuboid) -> Option<Box3> {
    let x = nominal_region(&cuboid.min_x, &cuboid.extent.width)?;
    let y = nominal_region(&cuboid.min_y, &cuboid.extent.depth)?;
    let z = nominal_region(&cuboid.min_z, &cuboid.extent.height)?;
    Some(Box3 {
        min: [x.lo, y.lo, z.lo],
        max: [x.hi, y.hi, z.hi],
    })
}
/// Guaranteed-available cuboid region.
pub fn guaranteed_cuboid(cuboid: &MeasuredCuboid) -> Option<Box3> {
    let x = guaranteed_region(&cuboid.min_x, &cuboid.extent.width)?;
    let y = guaranteed_region(&cuboid.min_y, &cuboid.extent.depth)?;
    let z = guaranteed_region(&cuboid.min_z, &cuboid.extent.height)?;
    Some(Box3 {
        min: [x.lo, y.lo, z.lo],
        max: [x.hi, y.hi, z.hi],
    })
}
/// Worst-case occupied cuboid of an uncertain solid.
pub fn occupied_cuboid(cuboid: &MeasuredCuboid) -> Option<Box3> {
    let x = occupied_region(&cuboid.min_x, &cuboid.extent.width)?;
    let y = occupied_region(&cuboid.min_y, &cuboid.extent.depth)?;
    let z = occupied_region(&cuboid.min_z, &cuboid.extent.height)?;
    Some(Box3 {
        min: [x.lo, y.lo, z.lo],
        max: [x.hi, y.hi, z.hi],
    })
}
/// Guaranteed-available footprint rectangle (x/y axes only).
pub fn guaranteed_footprint(rectangle: &MeasuredRectangle) -> Option<(AxisInterval, AxisInterval)> {
    Some((
        guaranteed_region(&rectangle.x, &rectangle.width)?,
        guaranteed_region(&rectangle.y, &rectangle.depth)?,
    ))
}
/// Nominal footprint rectangle (x/y axes only).
pub fn nominal_footprint(rectangle: &MeasuredRectangle) -> Option<(AxisInterval, AxisInterval)> {
    Some((
        nominal_region(&rectangle.x, &rectangle.width)?,
        nominal_region(&rectangle.y, &rectangle.depth)?,
    ))
}

/// Occupied box for a placed subject: `position` is exact (a declared
/// candidate coordinate); the envelope expands by plus uncertainty.
pub fn occupied_box(position: &Vec3Mm, occupied_extent: [i64; 3]) -> Box3 {
    Box3::from_min_extent(
        [
            position.x.get() as i64,
            position.y.get() as i64,
            position.z.get() as i64,
        ],
        occupied_extent,
    )
}

/// Extra axis extents a declared handle envelope adds to the outer envelope;
/// `None` when the handles fact is unknown (unknown effective envelope).
pub fn handle_extra(handles: &Fact<HandleEnvelope>) -> Option<[i64; 3]> {
    match handles.value()? {
        HandleEnvelope::IncludedInOuter {} => Some([0, 0, 0]),
        HandleEnvelope::ExtraExtent { extent } => Some([
            extent.width.get() as i64,
            extent.depth.get() as i64,
            extent.height.get() as i64,
        ]),
    }
}

/// The parent yaw transform of a cavity-frame box whose inner offset is
/// already resolved to plain integers. `child_global_box` delegates here
/// after reading its offset facts; sharing this core keeps the projector and
/// the validator on the exact same math (DOMAIN_MODEL §3).
pub fn child_global_box_at(
    parent_position: &Vec3Mm,
    parent_orientation: Orientation,
    parent_outer_depth: i64,
    inner_offset: [i64; 3],
    local_min: [i64; 3],
    local_extent: [i64; 3],
) -> Box3 {
    let (u, v, w) = (
        inner_offset[0] + local_min[0],
        inner_offset[1] + local_min[1],
        inner_offset[2] + local_min[2],
    );
    let (a, b, c) = (local_extent[0], local_extent[1], local_extent[2]);
    let (px, py, pz) = (
        parent_position.x.get() as i64,
        parent_position.y.get() as i64,
        parent_position.z.get() as i64,
    );
    match parent_orientation {
        Orientation::Upright0 => Box3::from_min_extent([px + u, py + v, pz + w], [a, b, c]),
        Orientation::Upright90 => {
            Box3::from_min_extent([px + parent_outer_depth - v - b, py + u, pz + w], [b, a, c])
        }
    }
}

/// Global min/extent of a contained child under the parent's placement.
/// `local_min`/`local_extent` are in the cavity frame with the item's local
/// orientation already applied; the inner offset is added in the original
/// product frame before the parent yaw transform (DOMAIN_MODEL §3).
pub fn child_global_box(
    parent_position: &Vec3Mm,
    parent_orientation: Orientation,
    parent_outer_depth: i64,
    inner_offset: &InnerOffset,
    local_min: [i64; 3],
    local_extent: [i64; 3],
) -> Option<Box3> {
    let (ox, oy, oz) = (
        inner_offset.x.value()?.nominal.get() as i64,
        inner_offset.y.value()?.nominal.get() as i64,
        inner_offset.z.value()?.nominal.get() as i64,
    );
    Some(child_global_box_at(
        parent_position,
        parent_orientation,
        parent_outer_depth,
        [ox, oy, oz],
        local_min,
        local_extent,
    ))
}

/// The moving envelope swept from fully outside to the final position: final
/// x/z plus handling margins on the sides and top.
pub fn moving_envelope(pos: [i64; 3], extent: [i64; 3], margins: (i64, i64, i64, i64)) -> Box3 {
    let (left, right, top, pull) = margins;
    Box3 {
        min: [pos[0] - left, -(extent[1] + pull), pos[2]],
        max: [
            pos[0] + extent[0] + right,
            pos[1] + extent[1],
            pos[2] + extent[2] + top,
        ],
    }
}

/// Effective handling requirement: the conservative per-field maximum of the
/// applicable known declarations. `None` on a field means an applicable
/// requirement is unknown and must stay unknown.
pub fn effective_handling(apply: &[&Fact<ClearanceMm>]) -> Option<i64> {
    apply.iter().try_fold(0i64, |acc, fact| {
        fact.value().map(|c| acc.max(c.get() as i64))
    })
}
