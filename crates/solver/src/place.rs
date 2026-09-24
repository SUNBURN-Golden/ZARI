//! Nominal outer-placement generation and pre-checks (SOLVER.md §4).
//!
//! These are *candidate-generation* checks only: they mirror the independent
//! validator's nominal geometry so that generated candidates are plausible,
//! but they never assert validity. Unknown clearances/margins are treated as
//! zero here so a candidate can still be emitted; the validator then reports
//! the honest unknown verdict. The one exception is hard constraints whose
//! known-failure would be guaranteed rejection (`HardLocked` zones, fixed
//! solids, `hard_one_action_access` blockers).

use zari_core::geometry::*;
use zari_core::*;

use crate::pack::Obj;

/// Static space facts needed for outer placement, resolved once.
pub(crate) struct SpaceCtx {
    /// Nominal interior (w, d, h); `None` when unknown → nothing can anchor.
    pub(crate) interior: Option<[i64; 3]>,
    /// Wall clearances `[l, r, f, b, t]` and between-units gap (0 if unknown).
    pub(crate) wall: [i64; 6],
    pub(crate) floor_z: Option<i64>,
    pub(crate) floor_footprint: Option<(AxisInterval, AxisInterval)>,
    pub(crate) opening_x: Option<AxisInterval>,
    pub(crate) opening_z: Option<AxisInterval>,
    pub(crate) staging: Option<Box3>,
    /// Staging base's nominal minimum z; `Some(lo != 0)` is a known-fail for
    /// every insertion, `None` stays conditional.
    pub(crate) staging_base_lo: Option<i64>,
    /// Physical solids (placement collision) and all obstacles (sweep).
    pub(crate) solids: Vec<Box3>,
    pub(crate) obstacles: Vec<Box3>,
    pub(crate) hard_one_action: bool,
}

pub(crate) fn space_ctx(input: &ProjectInput) -> SpaceCtx {
    let space = &input.space;
    let wall = [
        clearance(&space.clearances.left).unwrap_or(0),
        clearance(&space.clearances.right).unwrap_or(0),
        clearance(&space.clearances.front).unwrap_or(0),
        clearance(&space.clearances.back).unwrap_or(0),
        clearance(&space.clearances.top).unwrap_or(0),
        clearance(&space.clearances.between_units).unwrap_or(0),
    ];
    let opening_x = nominal_region(&space.opening.left, &space.opening.width);
    let opening_z = nominal_region(&space.opening.bottom, &space.opening.height);
    let staging = nominal_cuboid(&space.staging.free_volume);
    let staging_base = nominal_region(
        &space.staging.free_volume.min_z,
        &space.staging.free_volume.extent.height,
    );
    let mut solids = vec![];
    let mut obstacles = vec![];
    for obstacle in &space.obstacles {
        if let Some(b) = nominal_cuboid(&obstacle.bounds) {
            obstacles.push(b);
            if matches!(obstacle.role, ObstacleRole::PhysicalSolid) {
                solids.push(b);
            }
        }
    }
    SpaceCtx {
        interior: Some([
            nominal_length(&space.interior.width).unwrap_or(-1),
            nominal_length(&space.interior.depth).unwrap_or(-1),
            nominal_length(&space.interior.height).unwrap_or(-1),
        ])
        .filter(|v| v.iter().all(|x| *x >= 0)),
        wall,
        floor_z: space
            .support
            .elevation
            .value()
            .map(|e| e.nominal.get() as i64),
        floor_footprint: nominal_footprint(&space.support.footprint),
        opening_x,
        opening_z,
        staging,
        staging_base_lo: staging_base.map(|b| b.lo),
        solids,
        obstacles,
        hard_one_action: input.constraints.hard_one_action_access,
    }
}

/// The nominal outer extent (envelope + handle extra) of an object in a given
/// orientation; `None` when any needed fact is unknown.
pub(crate) fn object_extent(
    input: &ProjectInput,
    catalog: &CatalogContent,
    obj: &Obj,
    orientation: Orientation,
) -> Option<[i64; 3]> {
    match obj {
        Obj::Direct { item, .. } => {
            oriented_nominal_extent(&input.items[*item].dimensions.envelope, orientation)
        }
        Obj::Container(target) => {
            let facts = target.subject.facts(input, catalog);
            let mut extent = oriented_nominal_extent(&facts.dimensions.outer, orientation)?;
            let extra = handle_extra(&facts.dimensions.handles)?;
            for axis in 0..3 {
                extent[axis] += extra[axis];
            }
            Some(extent)
        }
    }
}

/// Handling margins `(left, right, top, pull)`; unknown fields are 0 for
/// candidate generation (the validator reports the honest unknown).
fn margins(handling: &HandlingClearance) -> (i64, i64, i64, i64) {
    (
        clearance(&handling.left).unwrap_or(0),
        clearance(&handling.right).unwrap_or(0),
        clearance(&handling.top).unwrap_or(0),
        clearance(&handling.pull_extra_depth).unwrap_or(0),
    )
}

/// Orientations an object may take: subject/item declared set in enum order
/// (default `Upright0` when unknown), minus `Upright90` for containers whose
/// children forbid the yaw composition.
pub(crate) fn object_orientations(
    input: &ProjectInput,
    catalog: &CatalogContent,
    obj: &Obj,
) -> Vec<Orientation> {
    let allowed = match obj {
        Obj::Direct { item, .. } => input.items[*item]
            .requirement
            .allowed_orientations
            .value()
            .cloned(),
        Obj::Container(target) => target
            .subject
            .facts(input, catalog)
            .allowed_orientations
            .value()
            .cloned(),
    }
    .unwrap_or_else(|| vec![Orientation::Upright0]);
    // A parent Upright90 composes each child's local orientation; it is only
    // admissible when every geometric child stays local-upright and its item
    // allows the composed yaw.
    let allows_90 = match obj {
        Obj::Container(target) => target.children.iter().all(|child| {
            child.orientation == Orientation::Upright0
                && input.items[child.item]
                    .requirement
                    .allowed_orientations
                    .value()
                    .is_none_or(|a| a.contains(&Orientation::Upright90))
        }),
        Obj::Direct { .. } => true,
    };
    let mut allowed: Vec<Orientation> = allowed
        .into_iter()
        .filter(|o| allows_90 || *o == Orientation::Upright0)
        .collect();
    allowed.sort_unstable();
    allowed.dedup();
    allowed
}

/// Anchor candidates `(x, y)` for an extent `(w, d)` on the floor: clearance
/// edges plus the four contact/perimeter positions around each placed box.
/// Sorted by (y, x); the sort key encodes the front/left preference.
/// When the interior is unknown a single nominal clearance-corner anchor is
/// emitted so the candidate reaches the validator's conditional checks.
pub(crate) fn anchors(
    space: &SpaceCtx,
    placed_boxes: &[Box3],
    extent: [i64; 3],
) -> Vec<(i64, i64)> {
    let Some(interior) = space.interior else {
        return vec![(space.wall[0], space.wall[2])];
    };
    let [cl, cr, cf, cb, _ct, gap] = space.wall;
    let (w, d) = (extent[0], extent[1]);
    let mut xs = vec![cl, interior[0] - cr - w];
    let mut ys = vec![cf, interior[1] - cb - d];
    for p in placed_boxes {
        xs.push(p.min[0] - w - gap);
        xs.push(p.max[0] + gap);
        ys.push(p.min[1] - d - gap);
        ys.push(p.max[1] + gap);
    }
    xs.retain(|&x| x >= cl && x + w <= interior[0] - cr);
    ys.retain(|&y| y >= cf && y + d <= interior[1] - cb);
    xs.sort_unstable();
    xs.dedup();
    ys.sort_unstable();
    ys.dedup();
    let mut out = vec![];
    for y in ys {
        for x in &xs {
            out.push((*x, y));
        }
    }
    out
}

/// The nominal swept envelope for insertion (mirrors `moving_envelope`).
fn sweep_of(pos: [i64; 3], extent: [i64; 3], m: (i64, i64, i64, i64)) -> Box3 {
    let (left, right, top, pull) = m;
    Box3 {
        min: [pos[0] - left, -(extent[1] + pull), pos[2]],
        max: [
            pos[0] + extent[0] + right,
            pos[1] + extent[1],
            pos[2] + extent[2] + top,
        ],
    }
}

/// One nominal anchor evaluation. Returns the sweep box when feasible.
/// `placed` supplies (nominal box, sweep) of committed objects for sibling
/// and hard one-action checks.
pub(crate) fn eval_anchor(
    space: &SpaceCtx,
    zone: Option<&Box3>,
    placed: &[(Box3, Box3)],
    obj_margins: (i64, i64, i64, i64),
    pos: [i64; 3],
    extent: [i64; 3],
) -> Option<Box3> {
    let [cl, cr, cf, cb, ct, gap] = space.wall;
    // Containment + wall clearances (nominal); unknown interior stays
    // eligible — the validator reports the conditional honestly.
    if let Some(interior) = space.interior
        && (pos[0] < cl
            || pos[0] + extent[0] > interior[0] - cr
            || pos[1] < cf
            || pos[1] + extent[1] > interior[1] - cb
            || pos[2] + extent[2] > interior[2] - ct)
    {
        return None;
    }
    let object = Box3::from_min_extent(pos, extent);
    // Floor footprint + elevation; unknown facts stay for the validator.
    if let Some(floor_z) = space.floor_z
        && pos[2] != floor_z
    {
        return None;
    }
    if let Some((fx, fy)) = space.floor_footprint
        && !(fx.contains(object.axis(0)) && fy.contains(object.axis(1)))
    {
        return None;
    }
    // Hard-locked zone containment.
    if let Some(zone) = zone
        && !zone.contains(&object)
    {
        return None;
    }
    // Sibling non-overlap + separation gap.
    for (other, _) in placed {
        if object.intersects(other) || object.separation(other) < gap {
            return None;
        }
    }
    // Fixed solids must not intersect the final volume.
    if space.solids.iter().any(|o| object.intersects(o)) {
        return None;
    }
    // Insertion path: at-final envelope inside the opening x/z, swept parked
    // volume inside staging, sweep clears every obstacle.
    let sweep = sweep_of(pos, extent, obj_margins);
    let at_final = Box3 {
        min: [pos[0] - obj_margins.0, pos[1], pos[2]],
        max: [
            pos[0] + extent[0] + obj_margins.1,
            pos[1] + extent[1],
            pos[2] + extent[2] + obj_margins.2,
        ],
    };
    if let Some(ox) = space.opening_x
        && !ox.contains(at_final.axis(0))
    {
        return None;
    }
    if let Some(oz) = space.opening_z
        && !oz.contains(at_final.axis(2))
    {
        return None;
    }
    if space.staging_base_lo.is_some_and(|lo| lo != 0) {
        return None;
    }
    let parked = Box3 {
        min: sweep.min,
        max: [sweep.max[0], 0, sweep.max[2]],
    };
    if let Some(staging) = space.staging
        && !staging.contains(&parked)
    {
        return None;
    }
    if space.obstacles.iter().any(|o| sweep.intersects(o)) {
        return None;
    }
    // Hard one-action: no committed volume may intersect this sweep, and this
    // volume must not intersect any committed sweep.
    if space.hard_one_action {
        for (other, other_sweep) in placed {
            if sweep.intersects(other) || other_sweep.intersects(&object) {
                return None;
            }
        }
    }
    Some(sweep)
}

/// Handling margins of an object for sweep evaluation.
pub(crate) fn object_margins(
    input: &ProjectInput,
    catalog: &CatalogContent,
    obj: &Obj,
) -> (i64, i64, i64, i64) {
    match obj {
        Obj::Direct { item, .. } => margins(&input.items[*item].requirement.handling),
        Obj::Container(target) => margins(target.subject.facts(input, catalog).handling),
    }
}
