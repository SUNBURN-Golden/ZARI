//! Prepared per-session search context: ordered group contexts, recipe-bound
//! options, subject sequences and expanded pack units. Everything here is a
//! pure deterministic function of `(input, catalog, decision)` — the search
//! machine only consumes it.

use std::collections::{BTreeMap, BTreeSet};

use zari_core::geometry::*;
use zari_core::scalars::*;
use zari_core::*;

/// Hard structural cap mirrored from `validate::MAX_PLACED_CONTAINERS`: a
/// candidate with more container placements can never validate.
pub(crate) const MAX_CONTAINERS: usize = 20;
/// Structural cap on expanded instances mirrored from
/// `validate::MAX_EXPANDED_INSTANCES`.
pub(crate) const MAX_EXPANDED: u64 = 200;

/// One concrete container unit a group option may open.
#[derive(Clone, Debug)]
pub(crate) enum Subject {
    /// An owned-container unit (owned-container index, declared ordinal).
    Owned { owned: usize, ordinal: u32 },
    /// A new catalog variant; one entry may open several units, each stamping
    /// the next `unit_ordinal` for that variant within the candidate.
    New { variant: usize },
}

impl Subject {
    pub(crate) fn primitive(
        &self,
        input: &ProjectInput,
        catalog: &CatalogContent,
    ) -> StoragePrimitive {
        self.facts(input, catalog).primitive.clone()
    }
}

/// A uniform borrowed view over owned/new container physical facts.
pub(crate) struct SubjectPhysical<'a> {
    pub(crate) dimensions: &'a VariantDimensions,
    pub(crate) primitive: &'a StoragePrimitive,
    pub(crate) allowed_orientations: &'a Fact<Vec<Orientation>>,
    pub(crate) handling: &'a HandlingClearance,
}

impl Subject {
    pub(crate) fn facts<'a>(
        &self,
        input: &'a ProjectInput,
        catalog: &'a CatalogContent,
    ) -> SubjectPhysical<'a> {
        match *self {
            Subject::Owned { owned, .. } => {
                let physical = &input.owned_containers[owned].physical;
                SubjectPhysical {
                    dimensions: &physical.dimensions,
                    primitive: &physical.primitive,
                    allowed_orientations: &physical.allowed_orientations,
                    handling: &physical.handling,
                }
            }
            Subject::New { variant } => {
                let variant = &catalog.variants[variant];
                SubjectPhysical {
                    dimensions: &variant.dimensions,
                    primitive: &variant.primitive,
                    allowed_orientations: &variant.allowed_orientations,
                    handling: &variant.handling,
                }
            }
        }
    }
}

/// A resolvable offer choice for one variant: either a catalog offer or the
/// explicit unresolved marker (never a fake offer).
#[derive(Clone, Copy, Debug)]
pub(crate) enum OfferOption {
    Offer(usize),
    Unresolved,
}

/// One pack unit: item instances that must share one target (`atomic`), or a
/// single independent instance.
#[derive(Clone, Debug)]
pub(crate) struct PackUnit {
    /// (item index, unit ordinal) members in deterministic order.
    pub(crate) members: Vec<(usize, u32)>,
    pub(crate) atomic: bool,
}

/// One recipe-bound option for a group: an ordered subject sequence plus the
/// recipe trace. Empty `subjects` marks the direct-placement option.
#[derive(Clone)]
pub(crate) struct GroupOption {
    /// Inspectable recipe IR (SOLVER.md §2); consumed by tests/diagnostics,
    /// not stamped into snapshots.
    #[allow(dead_code)]
    pub(crate) recipe: Recipe,
    pub(crate) subjects: Vec<Subject>,
    /// Container units this option may open (1 under `OneTarget`).
    pub(crate) max_targets: usize,
}

/// One group's prepared context.
#[derive(Clone)]
pub(crate) struct GroupCtx {
    /// The id recipes bind to: the real group id or `implicit:{item}`.
    pub(crate) group_id: Id,
    /// Member item indices, id-sorted.
    pub(crate) items: Vec<usize>,
    /// Nominal zone bounds for scoring / hard-zone placement restrictions.
    pub(crate) zone: Option<Box3>,
    /// Resolved zone id stamped on recipes (`zone:none` when unresolved).
    pub(crate) zone_id: Id,
    /// Placement must nominally fit the zone (locked `HardLocked`).
    pub(crate) zone_hard: bool,
    pub(crate) split: GroupSplitPolicy,
    pub(crate) options: Vec<GroupOption>,
    pub(crate) units: Vec<PackUnit>,
    /// Items whose ordinals are always unassigned (cross-group compatibility
    /// or retrieval-mode restrictions handled upstream).
    pub(crate) blocked_items: BTreeSet<usize>,
    /// Items with unknown quantity (no expandable ordinals).
    pub(crate) unknown_items: Vec<usize>,
    /// Lower rank = higher strategy priority; used for one-action weighting.
    pub(crate) rank: u32,
}

/// The full prepared context the machine consumes.
pub(crate) struct Prepared {
    pub(crate) decision: StrategyDecision,
    pub(crate) groups: Vec<GroupCtx>,
    /// Per-variant offer choices (supported offers in id order + Unresolved).
    pub(crate) offer_options: Vec<Vec<OfferOption>>,
    /// Eligible new-variant subjects, in catalog order.
    pub(crate) new_subjects: Vec<usize>,
    /// Per owned-container: usable ordinals (known-owned ∩ available-if-known).
    pub(crate) owned_units: Vec<Vec<u32>>,
    pub(crate) restrictions: Vec<ScopeRestriction>,
}

fn measured_id(raw: &str) -> Id {
    Id::new(raw).expect("solver-generated id is bounded")
}

/// Nominal envelope area used for deterministic unit ordering; 0 when the
/// item envelope is unknown.
fn item_footprint(item: &Item) -> i64 {
    oriented_nominal_extent(&item.dimensions.envelope, Orientation::Upright0)
        .map(|e| e[0] * e[1])
        .unwrap_or(0)
}

/// Union-find over `mandatory_compatibility` edges restricted to a member set.
fn clusters(input: &ProjectInput, members: &[usize]) -> Vec<Vec<usize>> {
    let mut parent: Vec<usize> = (0..input.items.len()).collect();
    fn root(parent: &mut [usize], i: usize) -> usize {
        let mut r = i;
        while parent[r] != r {
            r = parent[r];
        }
        let mut c = i;
        while parent[c] != r {
            let n = parent[c];
            parent[c] = r;
            c = n;
        }
        r
    }
    let member_ids: BTreeSet<&str> = members
        .iter()
        .map(|&i| input.items[i].id.as_str())
        .collect();
    for &i in members {
        for other in &input.items[i].requirement.mandatory_compatibility {
            // Only intra-cluster edges union here; cross-group edges are a
            // scope restriction handled by the caller.
            if member_ids.contains(other.as_str())
                && let Some(&j) = members.iter().find(|&&k| input.items[k].id == *other)
            {
                let (a, b) = (root(&mut parent, i), root(&mut parent, j));
                if a != b {
                    parent[a] = b;
                }
            }
        }
    }
    let mut map: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for &i in members {
        map.entry(root(&mut parent, i)).or_default().push(i);
    }
    map.into_values().collect()
}

/// Whether any `mandatory_compatibility` edge leaves the group (or lands on
/// an ungrouped item): v1 cannot satisfy cross-group co-location.
fn cross_group_edges(input: &ProjectInput, members: &[usize]) -> Vec<usize> {
    let member_ids: BTreeSet<&str> = members
        .iter()
        .map(|&i| input.items[i].id.as_str())
        .collect();
    let mut blocked = vec![];
    for &i in members {
        if input.items[i]
            .requirement
            .mandatory_compatibility
            .iter()
            .any(|o| !member_ids.contains(o.as_str()))
        {
            blocked.push(i);
        }
    }
    blocked
}

/// Deterministic pack-unit expansion for one member set.
fn pack_units(input: &ProjectInput, ctx: &mut GroupCtx) {
    let mut units = vec![];
    for cluster in clusters(input, &ctx.items) {
        let atomic = cluster.len() > 1 || input.items[cluster[0]].requirement.must_stay_together;
        let mut members: Vec<(usize, u32)> = vec![];
        for &item_idx in &cluster {
            if ctx.blocked_items.contains(&item_idx) {
                continue;
            }
            if let Some(qty) = input.items[item_idx].quantity.value() {
                for ordinal in 0..qty.get() {
                    members.push((item_idx, ordinal));
                }
            }
        }
        if members.is_empty() {
            continue;
        }
        if atomic {
            units.push(PackUnit {
                members,
                atomic: true,
            });
        } else {
            for member in members {
                units.push(PackUnit {
                    members: vec![member],
                    atomic: false,
                });
            }
        }
    }
    units.sort_by(|a, b| {
        let key = |u: &PackUnit| {
            (
                std::cmp::Reverse(
                    u.members
                        .iter()
                        .map(|&(i, _)| item_footprint(&input.items[i]))
                        .sum::<i64>(),
                ),
                input.items[u.members[0].0].id.as_str().to_owned(),
                u.members[0].1,
            )
        };
        key(a).cmp(&key(b))
    });
    ctx.units = units;
}

/// The recipe IR bound to one option (internal trace — recipes never cross
/// the snapshot boundary; the strategy decision does). Ids are ordinal-based
/// so they stay within the 96-char bound regardless of input id lengths.
fn container_recipe(
    decision: &StrategyDecision,
    ctx_index: usize,
    option_ordinal: usize,
    ctx: &GroupCtx,
    primitive: &StoragePrimitive,
) -> Recipe {
    Recipe {
        id: measured_id(&format!("rec:{ctx_index}:{option_ordinal}")),
        strategy: decision.strategy.clone(),
        group_id: ctx.group_id.clone(),
        zone_id: ctx.zone_id.clone(),
        primitive: primitive.clone(),
        catalog_constraints: vec![],
        placement_constraints: vec![],
        retrieval: if matches!(primitive, StoragePrimitive::DirectPlacement) {
            RetrievalMode::DirectFrontExtraction
        } else {
            RetrievalMode::PullContainerThenRetrieve
        },
        handling: HandlingClearance {
            left: Fact::unknown(),
            right: Fact::unknown(),
            top: Fact::unknown(),
            pull_extra_depth: Fact::unknown(),
            lift_above_rim: Fact::unknown(),
        },
        reason_ids: decision
            .reasons
            .iter()
            .filter(|r| {
                r.parameters
                    .get("groupId")
                    .is_some_and(|g| g == ctx.group_id.as_str())
            })
            .map(|r| r.id.clone())
            .collect(),
    }
}

/// A new catalog variant is eligible as a subject only when every known-fail
/// fact is absent and the nominal outer envelope is computable. Unknown
/// mounting/lid/orientation facts stay eligible — they produce conditional
/// candidates rather than phantom failures.
fn variant_eligible(variant: &ProductVariant) -> bool {
    !matches!(variant.primitive, StoragePrimitive::DirectPlacement)
        && oriented_nominal_extent(&variant.dimensions.outer, Orientation::Upright0).is_some()
        && handle_extra(&variant.dimensions.handles).is_some()
        && !matches!(
            variant.mounting.value(),
            Some(MountingRequirement::Required)
        )
        && !matches!(
            variant.dimensions.lid_state.value(),
            Some(LidState::Present)
        )
}

/// Usable owned-unit ordinals: SOLVER.md §2 consumes owned units only from a
/// known available quantity, bounded by known `quantity_owned`; unknown
/// availability allocates nothing (the validator reports it conditionally).
fn owned_ordinals(owned: &OwnedContainer) -> Vec<u32> {
    let (Some(quantity), Some(available)) = (
        owned.quantity_owned.value().map(|q| q.get()),
        owned.quantity_available.value().map(|q| q.get()),
    ) else {
        return vec![];
    };
    let limit = quantity.min(available);
    let eligible = oriented_nominal_extent(&owned.physical.dimensions.outer, Orientation::Upright0)
        .is_some()
        && handle_extra(&owned.physical.dimensions.handles).is_some()
        && !matches!(
            owned.physical.dimensions.lid_state.value(),
            Some(LidState::Present)
        );
    if eligible {
        (0..limit).collect()
    } else {
        vec![]
    }
}

/// Supported offers for one variant in offer-id order plus the explicit
/// unresolved choice. Bundle offers are unsupported and never enumerated.
fn offer_options(catalog: &CatalogContent, variant: usize) -> Vec<OfferOption> {
    let mut matching: Vec<usize> = catalog
        .offers
        .iter()
        .enumerate()
        .filter(|(_, o)| {
            o.variant_id == catalog.variants[variant].id && o.bundle_components.is_empty()
        })
        .map(|(i, _)| i)
        .collect();
    matching.sort_by(|&a, &b| catalog.offers[a].id.cmp(&catalog.offers[b].id));
    let mut options: Vec<OfferOption> = matching.into_iter().map(OfferOption::Offer).collect();
    options.push(OfferOption::Unresolved);
    options
}

/// Options for one group in spec order: direct first, then owned-bearing
/// lists, then new-variant lists (SOLVER.md §3 container-multiplicity rules).
/// A member that cannot use an option's retrieval mode is simply unassigned
/// within it rather than forbidding the option.
fn build_options(
    input: &ProjectInput,
    catalog: &CatalogContent,
    prepared: &Prepared,
    decision: &StrategyDecision,
    ctx_index: usize,
    ctx: &mut GroupCtx,
) {
    let mut options = vec![];
    let mut push = |subjects: Vec<Subject>, primitive: StoragePrimitive, max_targets: usize| {
        let recipe = container_recipe(decision, ctx_index, options.len(), ctx, &primitive);
        options.push(GroupOption {
            recipe,
            subjects,
            max_targets,
        });
    };
    push(vec![], StoragePrimitive::DirectPlacement, 0);

    let max_new_per_option = usize::from(input.search.budget.max_candidates_per_group).min(100);
    let one_target = matches!(ctx.split, GroupSplitPolicy::OneTarget);

    let owned_subjects = |primitive: &StoragePrimitive| -> Vec<Subject> {
        let mut out = vec![];
        for (owned, container) in input.owned_containers.iter().enumerate() {
            if container.physical.primitive != *primitive {
                continue;
            }
            out.extend(
                prepared.owned_units[owned]
                    .iter()
                    .map(|&ordinal| Subject::Owned { owned, ordinal }),
            );
        }
        out
    };
    let new_subjects = |primitive: &StoragePrimitive| -> Vec<Subject> {
        prepared
            .new_subjects
            .iter()
            .take(max_new_per_option)
            .filter(|&&v| catalog.variants[v].primitive == *primitive)
            .map(|&v| Subject::New { variant: v })
            .collect()
    };

    if one_target {
        // OneTarget: one option per concrete subject so DFS enumerates the
        // actual target choice.
        for (owned, _) in input.owned_containers.iter().enumerate() {
            for &ordinal in &prepared.owned_units[owned] {
                let subject = Subject::Owned { owned, ordinal };
                let primitive = subject.primitive(input, catalog);
                push(vec![subject], primitive, 1);
            }
        }
        for &variant in prepared.new_subjects.iter().take(max_new_per_option) {
            let primitive = catalog.variants[variant].primitive.clone();
            push(vec![Subject::New { variant }], primitive, 1);
        }
    } else {
        // AllowMultiple: owned-only lists per primitive, each new variant
        // alone, owned+one-variant lists, and the combined lists.
        for primitive in [
            StoragePrimitive::OpenBin,
            StoragePrimitive::Tray,
            StoragePrimitive::VerticalFile,
        ] {
            let owned = owned_subjects(&primitive);
            let new = new_subjects(&primitive);
            if !owned.is_empty() {
                push(owned.clone(), primitive.clone(), MAX_CONTAINERS);
            }
            for subject in &new {
                push(vec![subject.clone()], primitive.clone(), MAX_CONTAINERS);
                if !owned.is_empty() {
                    let mut subjects = owned.clone();
                    subjects.push(subject.clone());
                    push(subjects, primitive.clone(), MAX_CONTAINERS);
                }
            }
            if new.len() > 1 {
                if owned.is_empty() {
                    push(new, primitive.clone(), MAX_CONTAINERS);
                } else {
                    let mut subjects = owned;
                    subjects.extend(new);
                    push(subjects, primitive.clone(), MAX_CONTAINERS);
                }
            }
        }
    }
    // The profile's per-group candidate cap truncates deterministically;
    // direct is always retained.
    let cap = usize::from(input.search.budget.max_candidates_per_group).max(1);
    options.truncate(cap);
    ctx.options = options;
}

/// Zone bounds for a resolved strategy zone or a locked zone.
fn zone_bounds(
    input: &ProjectInput,
    decision: &StrategyDecision,
    zone_id: &Id,
) -> (Option<Box3>, bool) {
    for locked in &input.constraints.locked_zones {
        if locked.zone.id == *zone_id {
            let min = &locked.zone.bounds.min;
            let extent = &locked.zone.bounds.extent;
            return (
                Some(Box3::from_min_extent(
                    [min.x.get() as i64, min.y.get() as i64, min.z.get() as i64],
                    [
                        extent.width.get() as i64,
                        extent.depth.get() as i64,
                        extent.height.get() as i64,
                    ],
                )),
                matches!(locked.zone.kind, ZoneKind::HardLocked),
            );
        }
    }
    for zone in &decision.zones {
        if zone.id == *zone_id {
            let min = &zone.bounds.min;
            let extent = &zone.bounds.extent;
            return (
                Some(Box3::from_min_extent(
                    [min.x.get() as i64, min.y.get() as i64, min.z.get() as i64],
                    [
                        extent.width.get() as i64,
                        extent.depth.get() as i64,
                        extent.height.get() as i64,
                    ],
                )),
                matches!(zone.kind, ZoneKind::HardLocked),
            );
        }
    }
    (None, false)
}

/// Build the fully prepared context. `decision` is the strategy chosen by
/// `input.strategy_choice` — the solver never rewrites the user's choice.
pub(crate) fn prepare(
    input: &ProjectInput,
    catalog: &CatalogContent,
    decision: StrategyDecision,
) -> Prepared {
    // Scope restrictions keep every excluded domain explicit: unknown outer
    // geometry on a variant, unallocatable owned units, disallowed purchases
    // and the 200-instance expansion cap all narrow the searched scope.
    let mut restrictions = vec![];
    let eligible_variants: Vec<usize> = (0..catalog.variants.len())
        .filter(|&v| variant_eligible(&catalog.variants[v]))
        .collect();
    let excluded_variants: Vec<Id> = catalog
        .variants
        .iter()
        .filter(|v| {
            !matches!(v.primitive, StoragePrimitive::DirectPlacement)
                && (oriented_nominal_extent(&v.dimensions.outer, Orientation::Upright0).is_none()
                    || handle_extra(&v.dimensions.handles).is_none())
        })
        .collect::<Vec<_>>()
        .iter()
        .map(|v| v.id.clone())
        .collect();
    if !excluded_variants.is_empty() {
        restrictions.push(ScopeRestriction {
            code: "catalog_data_unknown".into(),
            subject_ids: excluded_variants,
        });
    }
    if !input.constraints.purchase_allowed && !eligible_variants.is_empty() {
        restrictions.push(ScopeRestriction {
            code: "purchase_disallowed".into(),
            subject_ids: eligible_variants
                .iter()
                .map(|&v| catalog.variants[v].id.clone())
                .collect(),
        });
    }
    let owned_units: Vec<Vec<u32>> = input.owned_containers.iter().map(owned_ordinals).collect();
    let mut availability_unknown = vec![];
    let mut geometry_unknown = vec![];
    for (owned, container) in input.owned_containers.iter().enumerate() {
        if !owned_units[owned].is_empty() {
            continue;
        }
        let geometry_known =
            oriented_nominal_extent(&container.physical.dimensions.outer, Orientation::Upright0)
                .is_some()
                && handle_extra(&container.physical.dimensions.handles).is_some();
        if !geometry_known {
            geometry_unknown.push(container.id.clone());
        } else {
            availability_unknown.push(container.id.clone());
        }
    }
    if !geometry_unknown.is_empty() {
        restrictions.push(ScopeRestriction {
            code: "owned_geometry_unknown".into(),
            subject_ids: geometry_unknown,
        });
    }
    if !availability_unknown.is_empty() {
        restrictions.push(ScopeRestriction {
            code: "owned_availability_unknown".into(),
            subject_ids: availability_unknown,
        });
    }
    let expanded_total: u64 = input
        .items
        .iter()
        .filter_map(|i| i.quantity.value().map(|q| q.get() as u64))
        .sum();
    if expanded_total > MAX_EXPANDED {
        restrictions.push(ScopeRestriction {
            code: "expanded_instances_exceeded".into(),
            subject_ids: vec![],
        });
    }
    let mut prepared = Prepared {
        decision,
        groups: vec![],
        offer_options: (0..catalog.variants.len())
            .map(|v| offer_options(catalog, v))
            .collect(),
        new_subjects: if input.constraints.purchase_allowed {
            eligible_variants
        } else {
            vec![]
        },
        owned_units,
        restrictions,
    };
    // Variants beyond the per-group candidate cap are a declared scope
    // restriction, not a silent truncation (SOLVER.md §2 step 5).
    let variant_cap = usize::from(input.search.budget.max_candidates_per_group).min(100);
    if prepared.new_subjects.len() > variant_cap {
        let truncated: Vec<Id> = prepared
            .new_subjects
            .split_off(variant_cap)
            .iter()
            .map(|&v| catalog.variants[v].id.clone())
            .collect();
        prepared.restrictions.push(ScopeRestriction {
            code: "candidate_cap_applied".into(),
            subject_ids: truncated,
        });
    }

    let grouped: BTreeSet<&str> = input
        .groups
        .iter()
        .flat_map(|g| g.item_ids.iter().map(|i| i.as_str()))
        .collect();
    let zone_of: BTreeMap<&str, &Id> = prepared
        .decision
        .groups
        .iter()
        .map(|g| (g.group_id.as_str(), &g.zone_id))
        .collect();
    let rank_of: BTreeMap<&str, u32> = prepared
        .decision
        .priorities
        .iter()
        .map(|p| (p.group_id.as_str(), p.ordinal))
        .collect();
    let mut contexts = vec![];
    for (index, group) in input.groups.iter().enumerate() {
        let mut items_sorted: Vec<usize> = group
            .item_ids
            .iter()
            .filter_map(|id| input.items.iter().position(|i| &i.id == id))
            .collect();
        items_sorted.sort_by(|a, b| input.items[*a].id.cmp(&input.items[*b].id));
        let (zone_id, zone, zone_hard) = zone_of
            .get(group.id.as_str())
            .map(|zone_id| {
                let (bounds, hard) = zone_bounds(input, &prepared.decision, zone_id);
                ((*zone_id).clone(), bounds, hard)
            })
            .unwrap_or_else(|| (measured_id("zone:none"), None, false));
        let blocked = cross_group_edges(input, &items_sorted);
        if !blocked.is_empty() {
            prepared.restrictions.push(ScopeRestriction {
                code: "compatibility_crosses_groups".into(),
                subject_ids: blocked.iter().map(|&i| input.items[i].id.clone()).collect(),
            });
        }
        let unknown_items: Vec<usize> = items_sorted
            .iter()
            .copied()
            .filter(|&i| input.items[i].quantity.value().is_none())
            .collect();
        let mut ctx = GroupCtx {
            group_id: group.id.clone(),
            items: items_sorted,
            zone,
            zone_id,
            zone_hard,
            split: group.split_policy.clone(),
            options: vec![],
            units: vec![],
            blocked_items: blocked.into_iter().collect(),
            unknown_items,
            rank: rank_of
                .get(group.id.as_str())
                .copied()
                .unwrap_or(input.groups.len() as u32 + index as u32),
        };
        pack_units(input, &mut ctx);
        build_options(
            input,
            catalog,
            &prepared,
            &prepared.decision,
            contexts.len(),
            &mut ctx,
        );
        contexts.push(ctx);
    }
    // Implicit per-item groups for ungrouped items, id-sorted, after declared
    // groups.
    let mut ungrouped: Vec<usize> = input
        .items
        .iter()
        .enumerate()
        .filter(|(_, i)| !grouped.contains(i.id.as_str()))
        .map(|(i, _)| i)
        .collect();
    ungrouped.sort_by(|&a, &b| input.items[a].id.cmp(&input.items[b].id));
    for item in ungrouped {
        let blocked = if input.items[item]
            .requirement
            .mandatory_compatibility
            .is_empty()
        {
            vec![]
        } else {
            vec![item]
        };
        if !blocked.is_empty() {
            prepared.restrictions.push(ScopeRestriction {
                code: "compatibility_crosses_groups".into(),
                subject_ids: vec![input.items[item].id.clone()],
            });
        }
        let unknown_items = if input.items[item].quantity.value().is_none() {
            vec![item]
        } else {
            vec![]
        };
        let mut ctx = GroupCtx {
            group_id: measured_id(&format!("implicit:{item}")),
            items: vec![item],
            zone: None,
            zone_id: measured_id("zone:none"),
            zone_hard: false,
            split: GroupSplitPolicy::AllowMultipleTargets,
            options: vec![],
            units: vec![],
            blocked_items: blocked.into_iter().collect(),
            unknown_items,
            rank: u32::MAX - item as u32,
        };
        pack_units(input, &mut ctx);
        build_options(
            input,
            catalog,
            &prepared,
            &prepared.decision,
            contexts.len(),
            &mut ctx,
        );
        contexts.push(ctx);
    }
    prepared.groups = contexts;
    prepared
}
