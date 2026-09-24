//! The resumable bounded search machine (SOLVER.md §3).
//!
//! An explicit continuation stack drives deterministic DFS over:
//! group option → incremental pack → per-object anchor/orientation →
//! offer tuple → independent `evaluate_candidate`. Every quantum carries a
//! precomputed work-unit bound checked before execution, so `step(allowance)`
//! never exceeds its budget and results are invariant under step
//! partitioning. Only `evaluate_candidate` decides whether a candidate is
//! publishable; the solver's nominal checks are generation-side pruning.

use std::collections::{BTreeMap, BTreeSet};
use std::rc::Rc;

use zari_core::geometry::*;
use zari_core::scalars::*;
use zari_core::*;

use crate::model::{OfferOption, Prepared, Subject};
use crate::pack::{Obj, Pack};
use crate::place::{self, SpaceCtx};

/// Rollback point: committed placements and the shared unassigned log.
#[derive(Clone, Copy)]
struct Marks {
    placed: usize,
    log: usize,
}

/// One object committed to a top-level position.
struct Placed {
    id: Id,
    subject: PlacementSubject,
    /// Variant index for new containers (offer enumeration).
    variant: Option<usize>,
    /// (owned index, ordinal) for owned containers (used-once tracking).
    owned: Option<(usize, u32)>,
    pos: [i64; 3],
    orient: Orientation,
    /// Nominal box and sweep for sibling/blocker pre-checks.
    volume: Box3,
    sweep: Box3,
    obj: Rc<Obj>,
}

/// The per-object enumeration frame for one committed option's objects.
struct PlaceFrame {
    /// The group context this object's option belongs to.
    group: usize,
    objects: Rc<Vec<Obj>>,
    index: usize,
    /// Whether admissible (orientation, extent) pairs were resolved.
    resolved: bool,
    /// (orientation, nominal extent) pairs admissible for this object.
    orient_extents: Vec<(Orientation, [i64; 3])>,
    oe_i: usize,
    anchors: Option<Rc<Vec<(i64, i64)>>>,
    anchor_i: usize,
    /// The object's commit lives in the child subtree: it must be undone
    /// before the next anchor candidate is evaluated.
    committed: bool,
    drop_tried: bool,
    /// Reason recorded when the object is dropped unassigned.
    drop_reason: &'static str,
}

fn place_frame(group: usize, objects: Rc<Vec<Obj>>, index: usize) -> Frame {
    Frame::Place(PlaceFrame {
        group,
        objects,
        index,
        resolved: false,
        orient_extents: vec![],
        oe_i: 0,
        anchors: None,
        anchor_i: 0,
        committed: false,
        drop_tried: false,
        drop_reason: "no_feasible_anchor",
    })
}

enum Frame {
    /// Option cursor for one group.
    Group { group: usize, next: usize },
    /// Incremental pack of the committed option.
    Pack(Pack),
    /// Place one object; the frame stays live while the deeper subtree
    /// explores, then resumes the next anchor choice on unwind.
    Place(PlaceFrame),
    /// Hand control to the next group or the leaf offer enumeration.
    Advance { next_group: usize },
    /// Odometer over per-variant offer selections at a leaf.
    Offers {
        /// Distinct variant indices used by the committed placements.
        slots: Vec<usize>,
        /// Per-slot cursor; `None` until the first tuple is emitted.
        cursor: Option<Vec<usize>>,
    },
    /// Evaluate one assembled layout through the independent boundary.
    Validate {
        layout: CandidateLayout,
        physical_key: Digest,
    },
}

struct StackFrame {
    marks: Marks,
    frame: Frame,
}

/// A self-describing next operation with its precomputed cost.
enum Op {
    /// Group frame: commit `options[next]` and push its pack.
    ChooseOption,
    /// Pack frame: run one bounded pack quantum.
    PackStep,
    /// Pack done: pop, emit its unassigned into the log, push the first
    /// `Place` frame (or `Advance` when the option produced no objects).
    FinishPack,
    /// Place frame: generate the anchor list for the current orientation.
    GenAnchors,
    /// Place frame: undo the object's commit before trying the next anchor.
    Uncommit,
    /// Place frame: evaluate the current anchor candidate.
    EvalAnchor,
    /// Place frame: record the object as dropped and push the continuation.
    DropObject,
    /// Advance frame: pop self, push the next group or the leaf offers.
    Advance,
    /// Offers frame: emit the next offer tuple (assembles the layout and
    /// pushes `Validate`).
    EmitTuple,
    /// Validate frame: run the independent evaluation and collect.
    RunEval,
    /// Pop the top frame and restore its marks.
    Pop,
}

/// Cost bound for anchor evaluation: orientation list + anchors + placed
/// comparisons + obstacle comparisons.
fn eval_cost(placed: usize, obstacles: usize) -> u64 {
    8 + 4 * placed as u64 + 2 * obstacles as u64
}

/// The machine's deterministic state. Nothing here is shared with validator
/// results; caching only ever covers solver-internal candidate geometry.
pub(crate) struct Machine {
    input: ProjectInput,
    catalog: CatalogContent,
    prepared: Prepared,
    space: SpaceCtx,
    versions: CompileVersions,
    scope: SearchScope,
    stack: Vec<StackFrame>,
    placed: Vec<Placed>,
    used_owned: BTreeSet<(usize, u32)>,
    /// Running per-variant unit count for `unit_ordinal` stamping.
    new_counts: Vec<u32>,
    /// (group ctx, item, ordinal, reason) — group-unassigned event log.
    log: Vec<(usize, usize, u32, &'static str)>,
    counters: SearchCounters,
    max_work: u64,
    max_nodes: u64,
    max_alternatives: usize,
    /// Best-ranked snapshots keyed by physical-layout digest.
    accepted: Vec<(RankKey, PlanSnapshot)>,
    seen: BTreeMap<String, usize>,
    diagnostics: Vec<RejectedCandidate>,
    cancelled: bool,
    terminated: Option<SearchTermination>,
}

/// Rank tuple: lower is better; the final field is the physical digest for a
/// total deterministic order.
#[derive(PartialEq, Eq, PartialOrd, Ord)]
struct RankKey(u64, u64, u64, u64, u64, u64, u64, u64, u64, String);

impl Machine {
    pub(crate) fn new(input: ProjectInput, catalog: CatalogContent, prepared: Prepared) -> Self {
        let space = place::space_ctx(&input);
        let versions = CompileVersions {
            schema_version: SCHEMA_VERSION,
            canonical_version: CANONICAL_VERSION,
            input_digest: input_digest(&input),
            catalog_version: catalog.catalog_version.clone(),
            catalog_digest: catalog_digest(&catalog),
            rule_version: RULE_VERSION.to_owned(),
            solver_version: SOLVER_VERSION.to_owned(),
            search_profile: input.search.profile.clone(),
            search_budget: input.search.budget.clone(),
            seed: input.search.seed.clone(),
        };
        let scope = SearchScope {
            profile: input.search.profile.clone(),
            budget: input.search.budget.clone(),
            group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
            restrictions: prepared.restrictions.clone(),
        };
        let max_work = input.search.budget.max_work_units.get();
        let max_nodes = u64::from(input.search.budget.max_nodes);
        let max_alternatives = usize::from(input.search.budget.max_alternatives).max(1);
        let groups = prepared.groups.len();
        let mut stack = vec![];
        if groups > 0 {
            stack.push(StackFrame {
                marks: Marks { placed: 0, log: 0 },
                frame: Frame::Group { group: 0, next: 0 },
            });
        } else {
            stack.push(StackFrame {
                marks: Marks { placed: 0, log: 0 },
                frame: Frame::Offers {
                    slots: vec![],
                    cursor: None,
                },
            });
        }
        // Bounded preparation is charged once so counters reflect real work.
        let variant_count = catalog.variants.len();
        let prep_cost = (input.items.len()
            + input.groups.len()
            + variant_count
            + input.owned_containers.len()
            + prepared
                .groups
                .iter()
                .map(|g| g.options.len() + g.units.len())
                .sum::<usize>()) as u64;
        let mut counters = SearchCounters {
            work_units: WorkCount::new(0).expect("zero"),
            nodes: 0,
            validated_candidates: 0,
        };
        counters.work_units = WorkCount::new(prep_cost).expect("prep bounded");
        // When the expanded instance total exceeds the structural cap, every
        // layout fails `input_limit_exceeded`; short-circuit honestly rather
        // than burning the budget on guaranteed rejections.
        let expanded_total: u64 = input
            .items
            .iter()
            .filter_map(|i| i.quantity.value().map(|q| q.get() as u64))
            .sum();
        let mut terminated = None;
        let mut diagnostics = vec![];
        if expanded_total > crate::model::MAX_EXPANDED {
            diagnostics.push(RejectedCandidate {
                reason_code: "input_limit_exceeded".into(),
                subject_ids: vec![],
            });
            terminated = Some(SearchTermination::ScopeComplete);
        }
        Self {
            input,
            catalog,
            prepared,
            space,
            versions,
            scope,
            stack,
            placed: vec![],
            used_owned: BTreeSet::new(),
            new_counts: vec![0; variant_count],
            log: vec![],
            counters,
            max_work,
            max_nodes,
            max_alternatives,
            accepted: vec![],
            seen: BTreeMap::new(),
            diagnostics,
            cancelled: false,
            terminated,
        }
    }

    fn marks(&self) -> Marks {
        Marks {
            placed: self.placed.len(),
            log: self.log.len(),
        }
    }

    /// Restore committed state to a frame's marks: truncate placements and
    /// the unassigned log, then rebuild used-owned/new-counts.
    fn restore(&mut self, marks: Marks) {
        let mut removed_variants = BTreeSet::new();
        for p in self.placed.drain(marks.placed..) {
            if let Some(owned) = p.owned {
                self.used_owned.remove(&owned);
            }
            if let Some(variant) = p.variant {
                removed_variants.insert(variant);
            }
        }
        // Recompute per-variant next ordinals from remaining placements.
        for variant in removed_variants {
            self.new_counts[variant] = self
                .placed
                .iter()
                .filter(|p| p.variant == Some(variant))
                .map(|p| match &p.subject {
                    PlacementSubject::NewContainer { unit_ordinal, .. } => unit_ordinal + 1,
                    _ => 0,
                })
                .max()
                .unwrap_or(0);
        }
        self.log.truncate(marks.log);
    }

    /// The next quantum for the top frame: `(cost, op)`; `None` pops.
    fn plan(&self) -> Option<(u64, Op)> {
        let top = self.stack.last()?;
        Some(match &top.frame {
            Frame::Group { group, next } => {
                if *next < self.prepared.groups[*group].options.len() {
                    (1, Op::ChooseOption)
                } else {
                    (1, Op::Pop)
                }
            }
            Frame::Pack(pack) => match pack.plan(&self.prepared) {
                Some((cost, _)) => (cost, Op::PackStep),
                None => (2 + pack.emitted.len() as u64, Op::FinishPack),
            },
            Frame::Place(place) => {
                if place.committed {
                    // A commit belongs to its child subtree: unwind it before
                    // resuming this object's own anchor enumeration.
                    (2, Op::Uncommit)
                } else if place.drop_tried {
                    (1, Op::Pop)
                } else if !place.resolved || place.anchors.is_none() {
                    (2 + 2 * self.placed.len() as u64, Op::GenAnchors)
                } else if place.oe_i >= place.orient_extents.len() {
                    (
                        1 + place.objects[place.index].members().len() as u64,
                        Op::DropObject,
                    )
                } else {
                    (
                        eval_cost(self.placed.len(), self.space.obstacles.len()),
                        Op::EvalAnchor,
                    )
                }
            }
            Frame::Advance { .. } => (1, Op::Advance),
            Frame::Offers { .. } => (
                4 + 2 * self.placed.len() as u64 + self.log.len() as u64,
                Op::EmitTuple,
            ),
            Frame::Validate { layout, .. } => {
                let p = layout.placements.len() as u64;
                let a = layout.assignments.len() as u64;
                (64 + p * p + 4 * a, Op::RunEval)
            }
        })
    }

    /// Push a continuation frame; its rollback marks capture the committed
    /// state at push time, so popping it undoes exactly the work it and its
    /// children performed.
    fn push(&mut self, frame: Frame) {
        let marks = self.marks();
        self.stack.push(StackFrame { marks, frame });
    }

    /// Execute one quantum for the top frame. Every arm first extracts the
    /// needed data in a scoped borrow, drops it, then mutates — keeping the
    /// continuation stack borrow discipline explicit.
    fn exec(&mut self, op: Op) {
        match op {
            Op::ChooseOption => {
                let (group, option) = match self.stack.last_mut() {
                    Some(StackFrame {
                        frame: Frame::Group { group, next },
                        ..
                    }) => {
                        let option = *next;
                        *next += 1;
                        (*group, option)
                    }
                    _ => return,
                };
                self.counters.nodes = self.counters.nodes.saturating_add(1);
                self.push(Frame::Pack(Pack::new(group, option)));
            }
            Op::PackStep => {
                let containers_open = self
                    .placed
                    .iter()
                    .filter(|p| matches!(p.obj.as_ref(), Obj::Container(_)))
                    .count();
                let Some(StackFrame {
                    frame: Frame::Pack(pack),
                    ..
                }) = self.stack.last_mut()
                else {
                    return;
                };
                let Some((_, op)) = pack.plan(&self.prepared) else {
                    return;
                };
                pack.apply(
                    op,
                    &self.prepared,
                    &self.input,
                    &self.catalog,
                    &self.used_owned,
                    containers_open,
                );
            }
            Op::FinishPack => {
                let Some(StackFrame {
                    frame: Frame::Pack(pack),
                    ..
                }) = self.stack.pop()
                else {
                    return;
                };
                // The unassigned emission belongs to the option subtree:
                // the child frame's rollback marks must predate it so an
                // option unwind restores the log boundary exactly.
                let marks = self.marks();
                for &(item, ordinal, reason) in &pack.unassigned {
                    self.log.push((pack.group, item, ordinal, reason));
                }
                let objects = Rc::new(pack.objects());
                let frame = if objects.is_empty() {
                    Frame::Advance {
                        next_group: pack.group + 1,
                    }
                } else {
                    place_frame(pack.group, objects, 0)
                };
                self.stack.push(StackFrame { marks, frame });
            }
            Op::GenAnchors => {
                // Phase A: resolve admissible (orientation, extent) pairs once,
                // then read the current extent.
                let extent = {
                    let Some(StackFrame {
                        frame: Frame::Place(place),
                        ..
                    }) = self.stack.last_mut()
                    else {
                        return;
                    };
                    if !place.resolved {
                        place.resolved = true;
                        place.orient_extents = place::object_orientations(
                            &self.input,
                            &self.catalog,
                            &place.objects[place.index],
                        )
                        .into_iter()
                        .filter_map(|o| {
                            place::object_extent(
                                &self.input,
                                &self.catalog,
                                &place.objects[place.index],
                                o,
                            )
                            .map(|e| (o, e))
                        })
                        .collect();
                        if place.orient_extents.is_empty() {
                            place.oe_i = usize::MAX;
                            place.drop_reason = "geometry_unknown";
                            place.anchors = Some(Rc::new(vec![]));
                            return;
                        }
                    }
                    if place.oe_i >= place.orient_extents.len() {
                        place.anchors = Some(Rc::new(vec![]));
                        return;
                    }
                    place.orient_extents[place.oe_i].1
                };
                let placed_boxes: Vec<Box3> = self.placed.iter().map(|p| p.volume).collect();
                let anchors = place::anchors(&self.space, &placed_boxes, extent);
                if let Some(StackFrame {
                    frame: Frame::Place(place),
                    ..
                }) = self.stack.last_mut()
                {
                    place.anchors = Some(Rc::new(anchors));
                    place.anchor_i = 0;
                }
            }
            Op::EvalAnchor => {
                // Phase A: read + advance the cursor, extract the candidate.
                let extracted = {
                    let Some(StackFrame {
                        frame: Frame::Place(place),
                        ..
                    }) = self.stack.last_mut()
                    else {
                        return;
                    };
                    let Some(anchors) = place.anchors.clone() else {
                        return;
                    };
                    if place.anchor_i >= anchors.len() {
                        place.anchors = None;
                        place.anchor_i = 0;
                        place.oe_i += 1;
                        return;
                    }
                    let (x, y) = anchors[place.anchor_i];
                    place.anchor_i += 1;
                    let (orient, extent) = place.orient_extents[place.oe_i];
                    (
                        x,
                        y,
                        orient,
                        extent,
                        place.objects[place.index].clone(),
                        place.objects.clone(),
                        place.index,
                        place.group,
                    )
                };
                let (x, y, orient, extent, obj, objects, index, group) = extracted;
                // Every anchor evaluation is a search node, committed or not.
                self.counters.nodes = self.counters.nodes.saturating_add(1);
                // Unknown floor elevation places nominally at z=0; the
                // validator reports the honest unknown rather than failing.
                let floor_z = self.space.floor_z.unwrap_or(0);
                let pos = [x, y, floor_z];
                let obj_margins = place::object_margins(&self.input, &self.catalog, &obj);
                let ctx = &self.prepared.groups[group];
                // Soft zones are ranking preferences only; hard-locked zones
                // prune guaranteed rejections.
                let zone = if ctx.zone_hard { ctx.zone } else { None };
                let placed_pairs: Vec<(Box3, Box3)> =
                    self.placed.iter().map(|p| (p.volume, p.sweep)).collect();
                if let Some(sweep) = place::eval_anchor(
                    &self.space,
                    zone.as_ref(),
                    &placed_pairs,
                    obj_margins,
                    pos,
                    extent,
                ) {
                    self.commit_object(group, obj, pos, orient, extent, sweep);
                    if let Some(StackFrame {
                        frame: Frame::Place(place),
                        ..
                    }) = self.stack.last_mut()
                    {
                        place.committed = true;
                    }
                    let child = if index + 1 < objects.len() {
                        place_frame(group, objects, index + 1)
                    } else {
                        Frame::Advance {
                            next_group: group + 1,
                        }
                    };
                    self.push(child);
                }
            }
            Op::Uncommit => {
                self.restore(Marks {
                    placed: self.placed.len().saturating_sub(1),
                    log: self.log.len(),
                });
                if let Some(StackFrame {
                    frame: Frame::Place(place),
                    ..
                }) = self.stack.last_mut()
                {
                    place.committed = false;
                }
            }
            Op::DropObject => {
                let (obj, objects, index, group, reason) = {
                    let Some(StackFrame {
                        frame: Frame::Place(place),
                        ..
                    }) = self.stack.last_mut()
                    else {
                        return;
                    };
                    place.drop_tried = true;
                    (
                        place.objects[place.index].clone(),
                        place.objects.clone(),
                        place.index,
                        place.group,
                        place.drop_reason,
                    )
                };
                for (item, ordinal) in obj.members() {
                    self.log.push((group, item, ordinal, reason));
                }
                let child = if index + 1 < objects.len() {
                    place_frame(group, objects, index + 1)
                } else {
                    Frame::Advance {
                        next_group: group + 1,
                    }
                };
                self.push(child);
            }
            Op::Advance => {
                let Some(StackFrame {
                    frame: Frame::Advance { next_group },
                    ..
                }) = self.stack.pop()
                else {
                    return;
                };
                if next_group < self.prepared.groups.len() {
                    self.push(Frame::Group {
                        group: next_group,
                        next: 0,
                    });
                } else {
                    // One slot per used variant, in variant-id order. The
                    // validator binds offers per variant and requires every
                    // placement of a variant to select the same offer
                    // (`inconsistent_offer_selection`).
                    let mut slots: Vec<usize> =
                        self.placed.iter().filter_map(|p| p.variant).collect();
                    slots.sort_unstable();
                    slots.dedup();
                    slots.sort_by(|&a, &b| {
                        self.catalog.variants[a]
                            .id
                            .cmp(&self.catalog.variants[b].id)
                    });
                    self.push(Frame::Offers {
                        slots,
                        cursor: None,
                    });
                }
            }
            Op::EmitTuple => {
                let (tuple, slots) = {
                    let Some(StackFrame {
                        frame: Frame::Offers { slots, cursor },
                        ..
                    }) = self.stack.last_mut()
                    else {
                        return;
                    };
                    let next = match cursor {
                        None => Some(vec![0; slots.len()]),
                        Some(current) => {
                            let mut next = current.clone();
                            let mut i = next.len();
                            loop {
                                if i == 0 {
                                    break None;
                                }
                                i -= 1;
                                next[i] += 1;
                                if next[i] < self.prepared.offer_options[slots[i]].len() {
                                    break Some(next);
                                }
                                next[i] = 0;
                            }
                        }
                    };
                    match next {
                        None => (None, slots.clone()),
                        Some(tuple) => {
                            *cursor = Some(tuple.clone());
                            (Some(tuple), slots.clone())
                        }
                    }
                };
                match tuple {
                    None => {
                        if let Some(frame) = self.stack.pop() {
                            self.restore(frame.marks);
                        }
                    }
                    Some(tuple) => {
                        // A tuple whose fully-known delivered cost provably
                        // exceeds the hard budget is a guaranteed rejection;
                        // pruning it spends no validator budget.
                        if !self.tuple_over_budget(&slots, &tuple) {
                            let layout = self.assemble(&slots, &tuple);
                            let physical_key = Self::physical_key(&layout);
                            self.push(Frame::Validate {
                                layout,
                                physical_key,
                            });
                        }
                    }
                }
            }
            Op::RunEval => {
                let Some(StackFrame {
                    frame:
                        Frame::Validate {
                            layout,
                            physical_key,
                        },
                    ..
                }) = self.stack.pop()
                else {
                    return;
                };
                self.counters.validated_candidates += 1;
                let proposal = CandidateProposal {
                    layout,
                    strategy: self.prepared.decision.clone(),
                    creation: PlanCreation::ReferenceSearch,
                };
                let evaluation = evaluate_candidate(
                    &self.input,
                    &self.catalog,
                    &proposal,
                    self.versions.clone(),
                    self.scope.clone(),
                );
                if let Some(snapshot) = evaluation.snapshot {
                    self.accept(physical_key, snapshot);
                } else {
                    self.reject(&evaluation, &proposal.layout);
                }
            }
            Op::Pop => {
                if let Some(frame) = self.stack.pop() {
                    self.restore(frame.marks);
                }
            }
        }
    }

    /// Commit one object into `placed` (ordinal stamping + used tracking).
    fn commit_object(
        &mut self,
        group: usize,
        obj: Obj,
        pos: [i64; 3],
        orient: Orientation,
        extent: [i64; 3],
        sweep: Box3,
    ) {
        let (subject, variant, owned, seq) = match &obj {
            Obj::Container(target) => {
                let (subject, variant, owned) = match &target.subject {
                    Subject::Owned { owned, ordinal } => (
                        PlacementSubject::OwnedContainer {
                            owned_id: self.input.owned_containers[*owned].id.clone(),
                            unit_ordinal: *ordinal,
                        },
                        None,
                        Some((*owned, *ordinal)),
                    ),
                    Subject::New { variant } => {
                        let unit_ordinal = self.new_counts[*variant];
                        (
                            PlacementSubject::NewContainer {
                                variant_id: self.catalog.variants[*variant].id.clone(),
                                unit_ordinal,
                            },
                            Some(*variant),
                            None,
                        )
                    }
                };
                (subject, variant, owned, target.seq)
            }
            Obj::Direct { item, ordinal, seq } => (
                PlacementSubject::DirectItem {
                    item_id: self.input.items[*item].id.clone(),
                    unit_ordinal: *ordinal,
                },
                None,
                None,
                *seq,
            ),
        };
        if let Some(o) = owned {
            self.used_owned.insert(o);
        }
        if let Some(v) = variant {
            self.new_counts[v] += 1;
        }
        let kind = if matches!(obj, Obj::Container(_)) {
            "c"
        } else {
            "d"
        };
        self.placed.push(Placed {
            id: Id::new(&format!("p:{kind}:{group}:{seq}")).expect("bounded"),
            subject,
            variant,
            owned,
            pos,
            orient,
            volume: Box3::from_min_extent(pos, extent),
            sweep,
            obj: Rc::new(obj),
        });
    }

    /// Whether the tuple's delivered cost is fully known and exceeds the
    /// known hard budget — a guaranteed `hard_budget_exceeded` rejection.
    /// Mirrors `validator::CostAccumulator` arithmetic exactly.
    fn tuple_over_budget(&self, slots: &[usize], tuple: &[usize]) -> bool {
        let Some(limit) = self.input.constraints.hard_budget.value().map(|m| m.get()) else {
            return false;
        };
        let mut cost = validator::CostAccumulator::default();
        for (slot, &variant) in slots.iter().enumerate() {
            let needed = self
                .placed
                .iter()
                .filter(|p| p.variant == Some(variant))
                .count() as u64;
            let offer = match self.prepared.offer_options[variant][tuple[slot]] {
                OfferOption::Offer(index) => Some(&self.catalog.offers[index]),
                OfferOption::Unresolved => None,
            };
            cost.add_line(offer, needed);
        }
        cost.grand_total().is_some_and(|total| total > limit)
    }

    /// Assemble a `CandidateLayout` for one offer tuple.
    fn assemble(&self, slots: &[usize], tuple: &[usize]) -> CandidateLayout {
        let space_id = self.input.space.id.clone();
        let floor_id = self.input.space.support.id.clone();
        let placements: Vec<Placement> = self
            .placed
            .iter()
            .map(|p| Placement {
                id: p.id.clone(),
                subject: p.subject.clone(),
                parent: ParentRef::Space {
                    space_id: space_id.clone(),
                },
                position: Vec3Mm {
                    x: PositionMm::new(pos_i32(p.pos[0])).expect("bounded"),
                    y: PositionMm::new(pos_i32(p.pos[1])).expect("bounded"),
                    z: PositionMm::new(pos_i32(p.pos[2])).expect("bounded"),
                },
                orientation: p.orient,
                support_id: floor_id.clone(),
            })
            .collect();
        let mut assignments = vec![];
        for p in &self.placed {
            match p.obj.as_ref() {
                Obj::Container(target) => {
                    let inner_floor = target
                        .subject
                        .facts(&self.input, &self.catalog)
                        .dimensions
                        .inner_support
                        .value()
                        .map(|f| f.id.clone());
                    for child in &target.children {
                        assignments.push(ItemAssignment {
                            item_id: self.input.items[child.item].id.clone(),
                            unit_ordinal: child.ordinal,
                            location: ItemLocation::Contained {
                                container_placement_id: p.id.clone(),
                                local_placement: ItemPlacement {
                                    position: Vec3Mm {
                                        x: PositionMm::new(pos_i32(child.pos[0])).expect("bounded"),
                                        y: PositionMm::new(pos_i32(child.pos[1])).expect("bounded"),
                                        z: PositionMm::new(pos_i32(child.pos[2])).expect("bounded"),
                                    },
                                    orientation: child.orientation,
                                    support_id: inner_floor
                                        .clone()
                                        .unwrap_or_else(|| floor_id.clone()),
                                },
                            },
                        });
                    }
                    for prov in &target.provisional {
                        assignments.push(ItemAssignment {
                            item_id: self.input.items[prov.item].id.clone(),
                            unit_ordinal: prov.ordinal,
                            location: ItemLocation::ProvisionalContainer {
                                container_placement_id: p.id.clone(),
                                reason_code: prov.reason.to_owned(),
                            },
                        });
                    }
                }
                Obj::Direct { item, ordinal, .. } => {
                    assignments.push(ItemAssignment {
                        item_id: self.input.items[*item].id.clone(),
                        unit_ordinal: *ordinal,
                        location: ItemLocation::Direct {
                            placement_id: p.id.clone(),
                        },
                    });
                }
            }
        }
        // Unassigned: one entry per item (the structural validator rejects
        // duplicates) — the shared log, items blocked by cross-group
        // compatibility, and unknown-quantity items. The first deterministic
        // reason wins the merged entry.
        let mut by_item: BTreeMap<usize, (&'static str, BTreeSet<u32>)> = BTreeMap::new();
        for &(_, item, ordinal, reason) in &self.log {
            by_item
                .entry(item)
                .or_insert((reason, BTreeSet::new()))
                .1
                .insert(ordinal);
        }
        for ctx in &self.prepared.groups {
            for &item in &ctx.blocked_items {
                if let Some(quantity) = self.input.items[item].quantity.value() {
                    let entry = by_item
                        .entry(item)
                        .or_insert(("compatibility_crosses_groups", BTreeSet::new()));
                    for ordinal in 0..quantity.get() {
                        entry.1.insert(ordinal);
                    }
                }
            }
        }
        let mut unassigned = vec![];
        for (item, (reason, ordinals)) in &by_item {
            unassigned.push(Unassigned {
                item_id: self.input.items[*item].id.clone(),
                instances: UnassignedInstances::Known {
                    ranges: ranges(ordinals),
                },
                reason_code: (*reason).to_owned(),
            });
        }
        for ctx in &self.prepared.groups {
            for &item in &ctx.unknown_items {
                unassigned.push(Unassigned {
                    item_id: self.input.items[item].id.clone(),
                    instances: UnassignedInstances::UnknownQuantity {},
                    reason_code: "quantity_unknown".into(),
                });
            }
        }
        unassigned.sort_by(|a, b| a.item_id.cmp(&b.item_id));
        // Purchase selections: one per new-container placement, uniform per
        // variant per the tuple.
        let mut purchase_selections = vec![];
        for p in &self.placed {
            let Some(variant) = p.variant else {
                continue;
            };
            let Some(slot) = slots.iter().position(|&v| v == variant) else {
                continue;
            };
            let offer = match self.prepared.offer_options[variant][tuple[slot]] {
                OfferOption::Offer(offer) => OfferSelection::Selected {
                    offer_id: self.catalog.offers[offer].id.clone(),
                },
                OfferOption::Unresolved => OfferSelection::Unresolved {
                    reason_code: "offer_deferred".into(),
                },
            };
            purchase_selections.push(PurchaseSelection {
                placement_id: p.id.clone(),
                offer,
            });
        }
        CandidateLayout {
            placements,
            assignments,
            unassigned,
            purchase_selections,
        }
    }

    /// Dedup key: digest of the canonicalized physical layout only — offer
    /// selections deliberately excluded so purchase variants of one physical
    /// layout compete for a single slot.
    fn physical_key(layout: &CandidateLayout) -> Digest {
        let mut placements = layout.placements.clone();
        placements.sort_by(|a, b| a.id.cmp(&b.id));
        let mut assignments = layout.assignments.clone();
        assignments.sort_by(|a, b| {
            (a.item_id.as_str(), a.unit_ordinal).cmp(&(b.item_id.as_str(), b.unit_ordinal))
        });
        let mut unassigned = layout.unassigned.clone();
        unassigned.sort_by(|a, b| a.item_id.cmp(&b.item_id));
        content_digest(&(placements, assignments, unassigned))
    }

    /// The same physical key recomputed from a stored snapshot.
    fn physical_key_of(content: &SnapshotContent) -> Digest {
        let mut placements = content.placements.clone();
        placements.sort_by(|a, b| a.id.cmp(&b.id));
        let mut assignments = content.assignments.clone();
        assignments.sort_by(|a, b| {
            (a.item_id.as_str(), a.unit_ordinal).cmp(&(b.item_id.as_str(), b.unit_ordinal))
        });
        let mut unassigned = content.unassigned.clone();
        unassigned.sort_by(|a, b| a.item_id.cmp(&b.item_id));
        content_digest(&(placements, assignments, unassigned))
    }

    fn accept(&mut self, physical_key: Digest, snapshot: PlanSnapshot) {
        let key = rank_key(&snapshot, &self.prepared, &self.input, &self.catalog);
        let hex = physical_key.as_str().to_owned();
        if let Some(&index) = self.seen.get(&hex) {
            // Same physical layout: retain the better purchase selection.
            if key < self.accepted[index].0 {
                self.accepted[index] = (key, snapshot);
            }
            return;
        }
        self.accepted.push((key, snapshot));
        self.seen.insert(hex, self.accepted.len() - 1);
        // Bound retained snapshots: evict the worst-ranked entry and rebuild
        // the dedup index. The cap is generous relative to max_alternatives
        // so ranking quality is preserved under truncation.
        let cap = self.max_alternatives.saturating_mul(4).max(64);
        if self.accepted.len() > cap
            && let Some(worst) = self
                .accepted
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.0.cmp(&b.1.0))
                .map(|(i, _)| i)
        {
            self.accepted.remove(worst);
            self.seen.clear();
            for (i, (_, snapshot)) in self.accepted.iter().enumerate() {
                let key = Self::physical_key_of(&snapshot.content);
                self.seen.insert(key.as_str().to_owned(), i);
            }
        }
    }

    fn reject(&mut self, evaluation: &CandidateEvaluation, layout: &CandidateLayout) {
        if self.diagnostics.len() >= 128 {
            return;
        }
        let reason = if let Some(d) = evaluation.diagnostics.first() {
            d.code.clone()
        } else if let Some(report) = &evaluation.report {
            report
                .checks
                .iter()
                .find(|c| c.blocking && c.status == CheckStatus::Fail)
                .map(|c| c.reason_code.clone())
                .unwrap_or_else(|| "validation_failed".into())
        } else {
            "validation_failed".into()
        };
        self.diagnostics.push(RejectedCandidate {
            reason_code: reason,
            subject_ids: layout.placements.iter().map(|p| p.id.clone()).collect(),
        });
    }

    /// Cooperative cancellation: the next step reports `Cancelled`.
    pub(crate) fn cancel(&mut self) -> SearchCounters {
        self.cancelled = true;
        self.counters.clone()
    }

    /// One bounded step: consume at most `allowance` work units.
    pub(crate) fn step(&mut self, allowance: u32) -> SearchStep {
        let mut remaining = allowance as u64;
        loop {
            if self.cancelled {
                self.terminated = Some(SearchTermination::Cancelled);
                return SearchStep::Cancelled {
                    consumed: self.counters.clone(),
                };
            }
            if let Some(termination) = self.terminated.clone() {
                return SearchStep::Completed {
                    result: Box::new(self.result(termination)),
                };
            }
            let Some((cost, op)) = self.plan() else {
                self.terminated = Some(SearchTermination::ScopeComplete);
                continue;
            };
            // Stop before executing a unit that would exceed limits.
            if self.counters.work_units.get() + cost > self.max_work {
                self.terminated = Some(SearchTermination::BudgetExhausted);
                continue;
            }
            let adds_node = matches!(op, Op::ChooseOption | Op::EvalAnchor);
            if adds_node && u64::from(self.counters.nodes) >= self.max_nodes {
                self.terminated = Some(SearchTermination::BudgetExhausted);
                continue;
            }
            if cost > remaining {
                return SearchStep::Progress {
                    consumed: self.counters.clone(),
                };
            }
            self.counters.work_units =
                WorkCount::new(self.counters.work_units.get() + cost).expect("bounded");
            remaining -= cost;
            self.exec(op);
        }
    }

    /// Assemble the terminal `SearchResult`.
    fn result(&self, termination: SearchTermination) -> SearchResult {
        let mut accepted: Vec<&(RankKey, PlanSnapshot)> = self.accepted.iter().collect();
        accepted.sort_by(|a, b| a.0.cmp(&b.0));
        SearchResult {
            termination,
            scope: self.scope.clone(),
            consumed: self.counters.clone(),
            alternatives: accepted
                .into_iter()
                .take(self.max_alternatives)
                .map(|(_, s)| s.clone())
                .collect(),
            diagnostic_candidates: self.diagnostics.clone(),
        }
    }
}

fn pos_i32(v: i64) -> i32 {
    v.clamp(-20_000, 20_000) as i32
}

/// Coalesce a sorted ordinal set into ranges.
fn ranges(ordinals: &BTreeSet<u32>) -> Vec<OrdinalRange> {
    let mut out = vec![];
    let mut start: Option<u32> = None;
    let mut last = 0u32;
    for &o in ordinals {
        match start {
            None => {
                start = Some(o);
                last = o;
            }
            Some(_) if o == last + 1 => {
                last = o;
            }
            Some(s) => {
                out.push(OrdinalRange {
                    start: s,
                    end_exclusive: last + 1,
                });
                start = Some(o);
                last = o;
            }
        }
    }
    if let Some(s) = start {
        out.push(OrdinalRange {
            start: s,
            end_exclusive: last + 1,
        });
    }
    out
}

/// The deterministic rank key per SOLVER.md §77 ordering.
fn rank_key(
    snapshot: &PlanSnapshot,
    prepared: &Prepared,
    input: &ProjectInput,
    catalog: &CatalogContent,
) -> RankKey {
    let report = &snapshot.content.validation;
    let unassigned = report.assignment_completeness.unassigned_instances.get() as u64;
    let unknown_qty = report.assignment_completeness.unknown_quantity_items.get() as u64;
    let physical_unknowns = report
        .checks
        .iter()
        .filter(|c| {
            c.status == CheckStatus::Unknown
                && !matches!(
                    c.kind,
                    CheckKind::Inventory
                        | CheckKind::Price
                        | CheckKind::Shipping
                        | CheckKind::Budget
                )
        })
        .count() as u64;

    // Placement → group ctx for zone scoring and weighting.
    let group_of: BTreeMap<&str, usize> = prepared
        .groups
        .iter()
        .enumerate()
        .flat_map(|(g, ctx)| {
            ctx.items
                .iter()
                .map(move |&i| (input.items[i].id.as_str(), g))
        })
        .collect();
    let placement_group = |p: &Placement| -> Option<usize> {
        match &p.subject {
            PlacementSubject::DirectItem { item_id, .. } => group_of.get(item_id.as_str()).copied(),
            _ => None,
        }
    };
    // For container placements the group comes from the committed object —
    // recovered via the assignments referencing the placement.
    let container_group: BTreeMap<&str, usize> = {
        let mut map = BTreeMap::new();
        for a in &snapshot.content.assignments {
            if let ItemLocation::Contained {
                container_placement_id,
                ..
            }
            | ItemLocation::ProvisionalContainer {
                container_placement_id,
                ..
            } = &a.location
                && let Some(&g) = group_of.get(a.item_id.as_str())
            {
                map.entry(container_placement_id.as_str()).or_insert(g);
            }
        }
        map
    };
    let group_index = |p: &Placement| -> Option<usize> {
        placement_group(p).or_else(|| container_group.get(p.id.as_str()).copied())
    };

    // Strategy objective pair.
    let (primary, secondary) = match prepared.decision.strategy {
        Strategy::MinimumPurchase => {
            let new_units = snapshot
                .content
                .placements
                .iter()
                .filter(|p| matches!(p.subject, PlacementSubject::NewContainer { .. }))
                .count() as u64;
            let variants: BTreeSet<&str> = snapshot
                .content
                .placements
                .iter()
                .filter_map(|p| match &p.subject {
                    PlacementSubject::NewContainer { variant_id, .. } => Some(variant_id.as_str()),
                    _ => None,
                })
                .collect();
            (new_units, variants.len() as u64)
        }
        Strategy::FrequencySeparation | Strategy::OneActionAccess => {
            // Weighted blocker moves: conservative blockerCount per placement
            // times (total − rank) of its group; then soft-zone violations.
            let total = prepared.groups.len() as u64;
            let mut blockers = 0u64;
            for check in &report.checks {
                if check.kind != CheckKind::OperationalAccess {
                    continue;
                }
                let pid = check.subject_ids.first().map(|i| i.as_str()).unwrap_or("");
                let Some(g) = snapshot
                    .content
                    .placements
                    .iter()
                    .find(|p| p.id.as_str() == pid)
                    .and_then(group_index)
                else {
                    continue;
                };
                let count = check
                    .measurements
                    .iter()
                    .find(|m| m.field_path == "blockerCount")
                    .and_then(|m| m.value_mm.value().map(|v| v.get()))
                    .unwrap_or(0);
                let weight = total.saturating_sub(u64::from(prepared.groups[g].rank)) + 1;
                blockers += count * weight;
            }
            let mut zone_violations = 0u64;
            for p in &snapshot.content.placements {
                let Some(g) = group_index(p) else {
                    continue;
                };
                let Some(zone) = &prepared.groups[g].zone else {
                    continue;
                };
                if prepared.groups[g].zone_hard {
                    continue;
                }
                let extent = match &p.subject {
                    PlacementSubject::DirectItem { item_id, .. } => {
                        input.items.iter().find(|i| &i.id == item_id).and_then(|i| {
                            oriented_nominal_extent(&i.dimensions.envelope, p.orientation)
                        })
                    }
                    _ => None,
                };
                let Some(extent) = extent else {
                    continue;
                };
                let pos = [
                    p.position.x.get() as i64,
                    p.position.y.get() as i64,
                    p.position.z.get() as i64,
                ];
                let volume = Box3::from_min_extent(pos, extent);
                if !zone.contains(&volume) {
                    zone_violations += 1;
                }
            }
            (blockers, zone_violations)
        }
        Strategy::ActivityGrouping => {
            // Groups whose assigned members span more than one target.
            let mut split = 0u64;
            for (gi, ctx) in prepared.groups.iter().enumerate() {
                let member_ids: BTreeSet<&str> = ctx
                    .items
                    .iter()
                    .map(|&i| input.items[i].id.as_str())
                    .collect();
                let mut targets = BTreeSet::new();
                for a in &snapshot.content.assignments {
                    if !member_ids.contains(a.item_id.as_str()) {
                        continue;
                    }
                    let target = match &a.location {
                        ItemLocation::Contained {
                            container_placement_id,
                            ..
                        }
                        | ItemLocation::ProvisionalContainer {
                            container_placement_id,
                            ..
                        } => format!("c:{}", container_placement_id.as_str()),
                        ItemLocation::Direct { placement_id } => {
                            format!("d:{}", placement_id.as_str())
                        }
                    };
                    targets.insert(target);
                }
                if targets.len() > 1 {
                    split += 1;
                }
                let _ = gi;
            }
            (split, 0)
        }
        Strategy::ActiveReserveSeparation => {
            // Containers mixing known-active and known-reserve members.
            let mut mixed = 0u64;
            let mut container_roles: BTreeMap<&str, BTreeSet<u8>> = BTreeMap::new();
            for a in &snapshot.content.assignments {
                let pid = match &a.location {
                    ItemLocation::Contained {
                        container_placement_id,
                        ..
                    }
                    | ItemLocation::ProvisionalContainer {
                        container_placement_id,
                        ..
                    } => container_placement_id.as_str(),
                    ItemLocation::Direct { .. } => continue,
                };
                let Some(item) = input.items.iter().find(|i| i.id == a.item_id) else {
                    continue;
                };
                if let Some(role) = item.stock_role.value() {
                    container_roles.entry(pid).or_default().insert(match role {
                        StockRole::Active => 0,
                        StockRole::Reserve => 1,
                    });
                }
            }
            for roles in container_roles.values() {
                if roles.len() > 1 {
                    mixed += 1;
                }
            }
            (mixed, 0)
        }
    };

    // Cost completeness + grand total.
    let unresolved = snapshot
        .content
        .purchase_selections
        .iter()
        .filter(|s| matches!(s.offer, OfferSelection::Unresolved { .. }))
        .count() as u64;
    let grand = snapshot
        .content
        .cost_summary
        .grand_total
        .value()
        .map(|m| m.get())
        .unwrap_or(u64::MAX);

    // Visual preferences: material/color mismatches then unknowns.
    let variants: BTreeMap<&str, &ProductVariant> = catalog
        .variants
        .iter()
        .map(|v| (v.id.as_str(), v))
        .collect();
    let (mut mismatch, mut visual_unknown) = (0u64, 0u64);
    for p in &snapshot.content.placements {
        let PlacementSubject::NewContainer { variant_id, .. } = &p.subject else {
            continue;
        };
        let Some(variant) = variants.get(variant_id.as_str()) else {
            continue;
        };
        if let Some(pref) = &input.preferences.material {
            match variant.material.value() {
                Some(v) if v != pref => mismatch += 1,
                None => visual_unknown += 1,
                _ => {}
            }
        }
        if let Some(pref) = &input.preferences.color {
            match variant.color.value() {
                Some(v) if v != pref => mismatch += 1,
                None => visual_unknown += 1,
                _ => {}
            }
        }
    }

    RankKey(
        unassigned,
        unknown_qty,
        physical_unknowns,
        primary,
        secondary,
        unresolved,
        grand,
        mismatch,
        visual_unknown,
        snapshot.plan_snapshot_id.as_str().to_owned(),
    )
}
