//! Resumable inner packing: assigns a group's pack units into the chosen
//! option's subject sequence one bounded quantum at a time.
//!
//! Semantics per SOLVER.md §3:
//! - existing open targets are tried before opening new subjects;
//! - subjects are scanned in option order (owned units before new variants);
//! - a `New` subject may open repeated units (bounded by the container cap);
//! - a target is only opened when a unit actually commits into it (no empty
//!   containers);
//! - items whose envelope or the cavity facts are unknown attach
//!   provisionally instead of being silently dropped;
//! - `must_stay_together` items and `mandatory_compatibility` clusters pack
//!   atomically into a single target.

use std::collections::BTreeSet;

use zari_core::geometry::*;
use zari_core::scalars::*;
use zari_core::*;

use crate::model::{GroupOption, MAX_CONTAINERS, PackUnit, Prepared, Subject};

/// A geometrically placed contained child, in cavity-local coordinates.
#[derive(Clone, Debug)]
pub(crate) struct Child {
    pub(crate) item: usize,
    pub(crate) ordinal: u32,
    pub(crate) pos: [i64; 3],
    pub(crate) extent: [i64; 3],
    pub(crate) orientation: Orientation,
}

/// A provisional association: the item claims the container but no interior
/// placement was computed (unknown envelope or cavity facts).
#[derive(Clone, Debug)]
pub(crate) struct Prov {
    pub(crate) item: usize,
    pub(crate) ordinal: u32,
    pub(crate) reason: &'static str,
}

/// One opened container target inside a pack.
#[derive(Clone, Debug)]
pub(crate) struct Target {
    pub(crate) subject: Subject,
    /// Open sequence inside this group (placement-id component).
    pub(crate) seq: usize,
    pub(crate) children: Vec<Child>,
    pub(crate) provisional: Vec<Prov>,
}

/// A placement candidate produced by a pack: an opened container or a
/// direct-standing item instance.
#[derive(Clone, Debug)]
pub(crate) enum Obj {
    Container(Target),
    Direct {
        item: usize,
        ordinal: u32,
        seq: usize,
    },
}

impl Obj {
    /// Item ordinals that become unassigned if this object is dropped.
    pub(crate) fn members(&self) -> Vec<(usize, u32)> {
        match self {
            Obj::Container(target) => target
                .children
                .iter()
                .map(|c| (c.item, c.ordinal))
                .chain(target.provisional.iter().map(|p| (p.item, p.ordinal)))
                .collect(),
            Obj::Direct { item, ordinal, .. } => vec![(*item, *ordinal)],
        }
    }
}

/// The next bounded pack operation; `plan` computes it without mutating.
pub(crate) enum PackOp {
    /// Direct option: expand all units into direct objects.
    ExpandDirect,
    /// Evaluate the current unit's scan candidate.
    Try,
    /// The unit's scan exhausted: provisional attach or unassign.
    Fallback,
    /// Packing finished: pop the frame and emit the object stream.
    Finish,
}

/// One emitted object reference: a target index (live — children may still
/// grow) or a fully-formed direct object.
#[derive(Clone, Copy, Debug)]
pub(crate) enum Emitted {
    Container(usize),
    Direct {
        item: usize,
        ordinal: u32,
        seq: usize,
    },
}

/// Incremental pack state for one committed group option.
pub(crate) struct Pack {
    pub(crate) group: usize,
    pub(crate) option: usize,
    /// Current pack unit index.
    pub(crate) unit: usize,
    /// Virtual candidate cursor: `0..targets` are open targets, then subjects.
    pub(crate) scan: usize,
    /// Targets opened so far within this option.
    pub(crate) targets: Vec<Target>,
    /// Emission order of objects (containers as live target indices — their
    /// children are resolved only when the pack finishes).
    pub(crate) emitted: Vec<Emitted>,
    /// (item, ordinal, reason) units that could not be packed.
    pub(crate) unassigned: Vec<(usize, u32, &'static str)>,
    /// Open sequence counter feeding placement ids.
    pub(crate) seq: usize,
    pub(crate) done: bool,
}

impl Pack {
    /// Materialize the object stream in emission order.
    pub(crate) fn objects(&self) -> Vec<Obj> {
        self.emitted
            .iter()
            .map(|e| match *e {
                Emitted::Container(t) => Obj::Container(self.targets[t].clone()),
                Emitted::Direct { item, ordinal, seq } => Obj::Direct { item, ordinal, seq },
            })
            .collect()
    }
}

/// Whether the item may be container-packed at all under its declared
/// retrieval modes.
fn pull_permitted(item: &Item) -> bool {
    item.requirement
        .allowed_retrieval_modes
        .contains(&RetrievalMode::PullContainerThenRetrieve)
}

/// Item envelope extent in a local orientation; `None` when unknown.
fn item_extent(item: &Item, orientation: Orientation) -> Option<[i64; 3]> {
    oriented_nominal_extent(&item.dimensions.envelope, orientation)
}

/// Local orientations the solver may try for a child: the item's declared
/// set in enum order (`Upright0` then `Upright90`), defaulting to `Upright0`
/// when unknown.
fn item_orientations(item: &Item) -> Vec<Orientation> {
    let mut orientations = item
        .requirement
        .allowed_orientations
        .value()
        .cloned()
        .unwrap_or_else(|| vec![Orientation::Upright0]);
    orientations.sort_unstable();
    orientations
}

/// Cavity-local anchor candidates for an extent `(w, d)`, sorted by (y, x).
/// Unknown clearances are treated as 0 for candidate generation only — the
/// independent validator re-checks with honest unknown semantics.
fn cavity_anchors(
    cavity: [i64; 3],
    clearances: [i64; 6],
    extent: [i64; 3],
    children: &[Child],
) -> Vec<(i64, i64)> {
    let [cl, cr, cf, cb, _ct, between] = clearances;
    let (w, d) = (extent[0], extent[1]);
    let mut xs = vec![cl, cavity[0] - cr - w];
    let mut ys = vec![cf, cavity[1] - cb - d];
    for child in children {
        xs.push(child.pos[0] - w - between);
        xs.push(child.pos[0] + child.extent[0] + between);
        ys.push(child.pos[1] - d - between);
        ys.push(child.pos[1] + child.extent[1] + between);
    }
    xs.retain(|&x| x >= cl && x + w <= cavity[0] - cr);
    ys.retain(|&y| y >= cf && y + d <= cavity[1] - cb);
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

/// Nominal cavity facts needed for geometric child placement.
struct Cavity {
    extent: [i64; 3],
    clearances: [i64; 6],
    floor_z: i64,
    floor: Option<(AxisInterval, AxisInterval)>,
}

/// The subject's cavity model, or `None` when geometric placement is
/// impossible (unknown inner dims, offset or floor elevation — children then
/// only attach provisionally).
fn cavity(input: &ProjectInput, catalog: &CatalogContent, subject: &Subject) -> Option<Cavity> {
    let facts = subject.facts(input, catalog);
    let dims = facts.dimensions;
    let extent = oriented_nominal_extent(&dims.inner, Orientation::Upright0)?;
    let floor = dims.inner_support.value()?;
    let floor_z = floor.elevation.value()?.nominal.get() as i64;
    let c = &dims.cavity_clearances;
    let get = |f: &Fact<ClearanceMm>| clearance(f).unwrap_or(0);
    Some(Cavity {
        extent,
        clearances: [
            get(&c.left),
            get(&c.right),
            get(&c.front),
            get(&c.back),
            get(&c.top),
            get(&c.between_items),
        ],
        floor_z,
        floor: nominal_footprint(&floor.footprint),
    })
}

/// Try to place one item instance inside `children` (a target's child list);
/// returns the child on success.
fn fit_child(
    cavity: &Cavity,
    children: &[Child],
    item: &Item,
    item_index: usize,
    ordinal: u32,
) -> Option<Child> {
    let between = cavity.clearances[5];
    for orientation in item_orientations(item) {
        let extent = item_extent(item, orientation)?;
        if cavity.floor_z + extent[2] > cavity.extent[2] - cavity.clearances[4] {
            continue;
        }
        for (x, y) in cavity_anchors(cavity.extent, cavity.clearances, extent, children) {
            let object = Box3::from_min_extent([x, y, cavity.floor_z], extent);
            if let Some((fx, fy)) = cavity.floor
                && !(fx.contains(object.axis(0)) && fy.contains(object.axis(1)))
            {
                continue;
            }
            let separated = children.iter().all(|child| {
                let other = Box3::from_min_extent(child.pos, child.extent);
                !object.intersects(&other) && object.separation(&other) >= between
            });
            if separated {
                return Some(Child {
                    item: item_index,
                    ordinal,
                    pos: [x, y, cavity.floor_z],
                    extent,
                    orientation,
                });
            }
        }
    }
    None
}

/// Cost bound for one geometric try into a target with `n` children.
fn try_cost(children: usize) -> u64 {
    // anchors ≤ (2n+2)², eval O(n) each, ≤ 2 orientations.
    let n = children as u64 + 2;
    8 + 8 * n * n * n
}

impl Pack {
    pub(crate) fn new(group: usize, option: usize) -> Self {
        Self {
            group,
            option,
            unit: 0,
            scan: 0,
            targets: vec![],
            emitted: vec![],
            unassigned: vec![],
            seq: 0,
            done: false,
        }
    }

    fn ctx<'a>(&self, prepared: &'a Prepared) -> &'a crate::model::GroupCtx {
        &prepared.groups[self.group]
    }

    fn option<'a>(&self, prepared: &'a Prepared) -> &'a GroupOption {
        &self.ctx(prepared).options[self.option]
    }

    /// The next bounded operation and its cost, or `None` when finished.
    pub(crate) fn plan(&self, prepared: &Prepared) -> Option<(u64, PackOp)> {
        if self.done {
            return None;
        }
        let option = self.option(prepared);
        if option.subjects.is_empty() {
            return Some((
                2 + self.ctx(prepared).units.len() as u64,
                PackOp::ExpandDirect,
            ));
        }
        let units = &self.ctx(prepared).units;
        if self.unit >= units.len() {
            return Some((2 + self.targets.len() as u64, PackOp::Finish));
        }
        let unit = &units[self.unit];
        let scan_len = self.targets.len() + option.subjects.len();
        if self.scan < scan_len {
            let children = if self.scan < self.targets.len() {
                self.targets[self.scan].children.len()
            } else {
                0
            };
            return Some((
                try_cost(children) * unit.members.len().max(1) as u64,
                PackOp::Try,
            ));
        }
        Some((1, PackOp::Fallback))
    }

    /// Whether `subject` may still open a unit: owned ordinals are consumed
    /// globally (`used_owned`) and within this pack; new variants repeat
    /// freely within the container cap.
    fn subject_available(&self, subject: &Subject, used_owned: &BTreeSet<(usize, u32)>) -> bool {
        match *subject {
            Subject::Owned { owned, ordinal } => {
                !used_owned.contains(&(owned, ordinal))
                    && !self.targets.iter().any(|t| {
                        matches!(t.subject, Subject::Owned { owned: o, ordinal: od }
                            if o == owned && od == ordinal)
                    })
            }
            Subject::New { .. } => true,
        }
    }

    /// Room for another opened target under both the option and global caps.
    fn target_room(&self, prepared: &Prepared, containers_open: usize) -> bool {
        self.targets.len() < self.option(prepared).max_targets
            && containers_open + self.targets.len() < MAX_CONTAINERS
    }

    /// Execute the planned operation.
    pub(crate) fn apply(
        &mut self,
        op: PackOp,
        prepared: &Prepared,
        input: &ProjectInput,
        catalog: &CatalogContent,
        used_owned: &BTreeSet<(usize, u32)>,
        containers_open: usize,
    ) {
        let ctx = self.ctx(prepared);
        match op {
            PackOp::ExpandDirect => {
                for unit in &ctx.units {
                    for &(item, ordinal) in &unit.members {
                        if input.items[item]
                            .requirement
                            .allowed_retrieval_modes
                            .contains(&RetrievalMode::DirectFrontExtraction)
                        {
                            self.emitted.push(Emitted::Direct {
                                item,
                                ordinal,
                                seq: self.seq,
                            });
                            self.seq += 1;
                        } else {
                            self.unassigned
                                .push((item, ordinal, "retrieval_mode_not_permitted"));
                        }
                    }
                }
                self.done = true;
            }
            PackOp::Finish => {
                self.done = true;
            }
            PackOp::Try => {
                let option = self.option(prepared).clone();
                let unit = ctx.units[self.unit].clone();
                // A member that may not be container-retrieved can never pack;
                // skip the scan so fallback records the honest reason.
                if unit
                    .members
                    .iter()
                    .any(|&(i, _)| !pull_permitted(&input.items[i]))
                {
                    self.scan = usize::MAX;
                    return;
                }
                if self.scan < self.targets.len() {
                    // Existing target first.
                    let target_index = self.scan;
                    let target = &mut self.targets[target_index];
                    let subject = target.subject.clone();
                    if let Some(cavity) = cavity(input, catalog, &subject) {
                        if unit.atomic {
                            if let Some(children) =
                                fit_atomic(&cavity, &target.children, &unit, input)
                            {
                                target.children.extend(children);
                                self.advance();
                            } else {
                                self.scan += 1;
                            }
                        } else {
                            let (item, ordinal) = unit.members[0];
                            if let Some(child) = fit_child(
                                &cavity,
                                &target.children,
                                &input.items[item],
                                item,
                                ordinal,
                            ) {
                                target.children.push(child);
                                self.advance();
                            } else {
                                self.scan += 1;
                            }
                        }
                    } else {
                        self.scan += 1;
                    }
                } else {
                    // Open the next subject and fit atomically.
                    let subject_index = self.scan - self.targets.len();
                    let subject = option.subjects[subject_index].clone();
                    let openable = self.subject_available(&subject, used_owned)
                        && self.target_room(prepared, containers_open);
                    if !openable {
                        self.scan += 1;
                        return;
                    }
                    if let Some(cavity) = cavity(input, catalog, &subject) {
                        let fitted = if unit.atomic {
                            fit_atomic(&cavity, &[], &unit, input)
                        } else {
                            let (item, ordinal) = unit.members[0];
                            fit_child(&cavity, &[], &input.items[item], item, ordinal)
                                .map(|c| vec![c])
                        };
                        if let Some(children) = fitted {
                            let target = Target {
                                subject: subject.clone(),
                                seq: self.seq,
                                children,
                                provisional: vec![],
                            };
                            self.seq += 1;
                            self.emitted.push(Emitted::Container(self.targets.len()));
                            self.targets.push(target);
                            self.advance();
                            return;
                        }
                    }
                    self.scan += 1;
                }
            }
            PackOp::Fallback => {
                let option = self.option(prepared).clone();
                let unit = ctx.units[self.unit].clone();
                // Units that can never be containerized are unassigned; units
                // whose geometry is unknown attach provisionally.
                let any_unknown = unit
                    .members
                    .iter()
                    .any(|&(i, _)| item_extent(&input.items[i], Orientation::Upright0).is_none());
                let any_blocked = unit
                    .members
                    .iter()
                    .any(|&(i, _)| !pull_permitted(&input.items[i]));
                if any_blocked {
                    for (item, ordinal) in unit.members {
                        self.unassigned
                            .push((item, ordinal, "retrieval_mode_not_permitted"));
                    }
                } else if any_unknown {
                    // Provisional attach: prefer the newest open target, else
                    // open the next available subject.
                    if let Some(target) = self.targets.last_mut() {
                        for (item, ordinal) in unit.members {
                            target.provisional.push(Prov {
                                item,
                                ordinal,
                                reason: "measurement_missing",
                            });
                        }
                    } else {
                        let opened = option.subjects.iter().find(|s| {
                            self.subject_available(s, used_owned)
                                && self.target_room(prepared, containers_open)
                        });
                        match opened {
                            Some(subject) => {
                                let mut target = Target {
                                    subject: subject.clone(),
                                    seq: self.seq,
                                    children: vec![],
                                    provisional: vec![],
                                };
                                for (item, ordinal) in unit.members {
                                    target.provisional.push(Prov {
                                        item,
                                        ordinal,
                                        reason: "measurement_missing",
                                    });
                                }
                                self.seq += 1;
                                self.emitted.push(Emitted::Container(self.targets.len()));
                                self.targets.push(target);
                            }
                            None => {
                                for (item, ordinal) in unit.members {
                                    self.unassigned
                                        .push((item, ordinal, "no_compatible_target"));
                                }
                            }
                        }
                    }
                } else {
                    for (item, ordinal) in unit.members {
                        self.unassigned
                            .push((item, ordinal, "no_compatible_target"));
                    }
                }
                self.advance();
            }
        }
    }

    fn advance(&mut self) {
        self.unit += 1;
        self.scan = 0;
    }
}

/// Try to fit all of an atomic unit's members into one target's child list;
/// returns the full tentative child additions on success.
fn fit_atomic(
    cavity: &Cavity,
    existing: &[Child],
    unit: &PackUnit,
    input: &ProjectInput,
) -> Option<Vec<Child>> {
    let mut working = existing.to_vec();
    let mut added = vec![];
    for &(item_index, ordinal) in &unit.members {
        let child = fit_child(
            cavity,
            &working,
            &input.items[item_index],
            item_index,
            ordinal,
        )?;
        working.push(child.clone());
        added.push(child);
    }
    Some(added)
}
