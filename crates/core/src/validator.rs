//! Independent candidate validator (SOLVER.md §4–5, DOMAIN_MODEL §6).
//!
//! This module receives the normalized immutable input, the activated
//! catalog content and a `CandidateLayout`, then recomputes every physical
//! and commercial obligation itself. A `CandidateLayout` carries no pass
//! flags, so nothing here trusts a solver assertion: coordinates,
//! assignments, ordinals and offer bindings are rechecked by the structural
//! validator first, then every geometric/evidence check is evaluated from
//! the declared facts only.
//!
//! Status semantics: `Pass` only on known-satisfying evidence, `Fail` on a
//! known violation, `Unknown` whenever a required fact or uncertainty bound
//! is unknown, `NotApplicable` for checks that genuinely do not apply (with
//! a rule reason). Nominal and conservative evidence are emitted as separate
//! checks so a nominal pass never erases a conservative failure.

use crate::canonical::CatalogContent;
use crate::catalog::*;
use crate::facts::*;
use crate::geometry::*;
use crate::input::*;
use crate::plan::*;
use crate::scalars::*;

use std::collections::{BTreeMap, BTreeSet};

/// The kinds whose `Fail` status rejects publication of a candidate. A known
/// violation of physical fit, conservation, orientation or a hard budget is
/// never a publishable plan; commercial unknowns stay conditional instead.
fn blocking_kind(kind: &CheckKind) -> bool {
    !matches!(
        kind,
        CheckKind::Inventory | CheckKind::Price | CheckKind::Shipping
    )
}
/// Whether a `Fail` on this specific check rejects PlanSnapshot publication.
/// `bg:soft` is the one non-blocking budget check: the soft budget is a
/// declared preference (SOLVER.md § commercial defines hard-budget rejects
/// only), so its `Fail` stays visible in the report without vetoing the
/// snapshot. `bg:hard` — cap exceeded or purchase disallowed — still blocks.
fn blocking_check(id: &str, kind: &CheckKind) -> bool {
    blocking_kind(kind) && id != "bg:soft"
}
/// The kinds that determine `physical_assurance`; commercial outcomes are
/// tracked separately by `commerce_readiness`.
fn physical_kind(kind: &CheckKind) -> bool {
    !matches!(
        kind,
        CheckKind::Inventory | CheckKind::Price | CheckKind::Shipping | CheckKind::Budget
    )
}

/// Check verdict: pass, known violation, unverifiable fact, or a check that
/// genuinely does not apply (with a rule reason).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Verdict {
    Pass,
    Fail(&'static str),
    Unknown(&'static str),
    NotApplicable(&'static str),
}
use Verdict::{Fail, NotApplicable, Pass, Unknown as VUnknown};

/// Result of independent validation: the report plus the deterministically
/// derived insertion order used by the finalizer's action sequence.
pub struct CandidateValidation {
    pub report: ValidationReport,
    /// Top-level placement ids in validated insertion order; empty when no
    /// supported acyclic order could be proved.
    pub install_order: Vec<Id>,
    /// For each placement, the placements that must install before it
    /// (their final volumes obstruct its sweep). Empty when unverifiable.
    pub predecessors: BTreeMap<String, BTreeSet<String>>,
}

fn derived_provenance(rule: &str) -> Provenance {
    Provenance {
        origin: MeasurementOrigin::Derived,
        verification: VerificationStatus::Confirmed,
        evidence_ids: vec![],
        rule_ids: vec![rule.to_owned()],
        input_refs: vec![],
        observed_at: None,
    }
}
fn measurement(field_path: &str, value: Option<i64>) -> CheckMeasurement {
    CheckMeasurement {
        field_path: field_path.into(),
        value_mm: match value.and_then(|v| Revision::new(v.max(0) as u64).ok()) {
            Some(value) => Fact::Known {
                value,
                provenance: derived_provenance("validator:measure"),
            },
            None => Fact::Unknown {
                reason: UnknownReason::NotProvided,
            },
        },
    }
}

struct Checks(Vec<ConstraintCheck>);
impl Checks {
    fn emit(
        &mut self,
        id: String,
        kind: CheckKind,
        verdict: Verdict,
        subject_ids: Vec<Id>,
        basis: CheckBasis,
        measurements: Vec<CheckMeasurement>,
    ) {
        let (status, reason_code) = match verdict {
            Pass => (CheckStatus::Pass, "ok".to_owned()),
            Fail(reason) => (CheckStatus::Fail, reason.to_owned()),
            VUnknown(reason) => (CheckStatus::Unknown, reason.to_owned()),
            NotApplicable(reason) => (CheckStatus::NotApplicable, reason.to_owned()),
        };
        self.emit_raw(
            id,
            kind,
            status,
            subject_ids,
            basis,
            &reason_code,
            measurements,
        );
    }
    #[allow(clippy::too_many_arguments)]
    fn emit_raw(
        &mut self,
        id: String,
        kind: CheckKind,
        status: CheckStatus,
        subject_ids: Vec<Id>,
        basis: CheckBasis,
        reason_code: &str,
        measurements: Vec<CheckMeasurement>,
    ) {
        let blocking = blocking_check(&id, &kind);
        let id = Id::new(&format!("chk:{id}")).expect("check id bounded");
        self.0.push(ConstraintCheck {
            id,
            kind,
            subject_ids,
            status,
            reason_code: reason_code.into(),
            basis,
            evidence_refs: vec![],
            measurements,
            blocking,
            remediation: vec![],
        });
    }
    /// Emit one check per geometric basis. `VUnknown` means the required
    /// evidence was unknown, never substituted.
    fn emit_geometry(
        &mut self,
        base: &str,
        kind: CheckKind,
        subjects: Vec<Id>,
        nominal: Verdict,
        conservative: Verdict,
        measurements: Vec<CheckMeasurement>,
    ) {
        for (basis, verdict) in [
            (CheckBasis::Nominal, nominal),
            (CheckBasis::Conservative, conservative),
        ] {
            let suffix = match basis {
                CheckBasis::Nominal => "n",
                _ => "c",
            };
            self.emit(
                format!("{base}:{suffix}"),
                kind.clone(),
                verdict,
                subjects.clone(),
                basis,
                measurements.clone(),
            );
        }
    }
}

/// Facts resolved once per top-level placement subject.
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
    fn orientations(&self) -> &'a Fact<Vec<Orientation>> {
        match self.subject {
            SubjectFacts::Item(item) => &item.requirement.allowed_orientations,
            SubjectFacts::Owned(owned) => &owned.physical.allowed_orientations,
            SubjectFacts::New(variant) => &variant.allowed_orientations,
        }
    }
    fn mass(&self) -> &'a Fact<MassGrams> {
        match self.subject {
            SubjectFacts::Item(item) => &item.mass_each,
            SubjectFacts::Owned(owned) => &owned.physical.mass,
            SubjectFacts::New(variant) => &variant.mass,
        }
    }
    fn handling(&self) -> &'a HandlingClearance {
        match self.subject {
            SubjectFacts::Item(item) => &item.requirement.handling,
            SubjectFacts::Owned(owned) => &owned.physical.handling,
            SubjectFacts::New(variant) => &variant.handling,
        }
    }
    /// Container cavity/physical data; `None` for direct items.
    fn container_dims(&self) -> Option<&'a VariantDimensions> {
        match self.subject {
            SubjectFacts::Owned(owned) => Some(&owned.physical.dimensions),
            SubjectFacts::New(variant) => Some(&variant.dimensions),
            SubjectFacts::Item(_) => None,
        }
    }
    /// Extra envelope extents for declared handles; `None` when the fact is
    /// unknown (unknown effective envelope, never assumed absent).
    fn extra_extent(&self) -> Option<[i64; 3]> {
        match self.subject {
            SubjectFacts::Item(_) => Some([0, 0, 0]),
            SubjectFacts::Owned(owned) => handle_extra(&owned.physical.dimensions.handles),
            SubjectFacts::New(variant) => handle_extra(&variant.dimensions.handles),
        }
    }
    fn nominal_extent(&self) -> Option<[i64; 3]> {
        let mut extent = oriented_nominal_extent(self.dims(), self.placement.orientation)?;
        let extra = self.extra_extent()?;
        for axis in 0..3 {
            extent[axis] += extra[axis];
        }
        Some(extent)
    }
    fn occupied_extent(&self) -> Option<[i64; 3]> {
        let mut extent = oriented_occupied_extent(self.dims(), self.placement.orientation)?;
        let extra = self.extra_extent()?;
        for axis in 0..3 {
            extent[axis] += extra[axis];
        }
        Some(extent)
    }
    fn nominal_box(&self) -> Option<Box3> {
        Some(occupied_box(
            &self.placement.position,
            self.nominal_extent()?,
        ))
    }
    fn occupied_box(&self) -> Option<Box3> {
        Some(occupied_box(
            &self.placement.position,
            self.occupied_extent()?,
        ))
    }
    /// Effective pull/lift margins declared on this subject.
    fn margins(&self) -> EffectiveMargins {
        EffectiveMargins::of(self.handling())
    }
    fn is_container(&self) -> bool {
        self.container_dims().is_some()
    }
    fn id(&self) -> &'a Id {
        &self.placement.id
    }
}

/// Per-field effective margins; `None` when an applicable requirement is
/// unknown.
#[derive(Clone, Copy)]
struct EffectiveMargins {
    left: Option<i64>,
    right: Option<i64>,
    top: Option<i64>,
    pull: Option<i64>,
    lift: Option<i64>,
}
impl EffectiveMargins {
    fn of(handling: &HandlingClearance) -> Self {
        Self {
            left: clearance(&handling.left),
            right: clearance(&handling.right),
            top: clearance(&handling.top),
            pull: clearance(&handling.pull_extra_depth),
            lift: clearance(&handling.lift_above_rim),
        }
    }
    /// Conservative maximum across the applicable item and container models.
    fn merged(a: Self, b: Self) -> Self {
        let max = |a: Option<i64>, b: Option<i64>| a.and_then(|a| b.map(|b| a.max(b)));
        Self {
            left: max(a.left, b.left),
            right: max(a.right, b.right),
            top: max(a.top, b.top),
            pull: max(a.pull, b.pull),
            lift: max(a.lift, b.lift),
        }
    }
    fn known(&self) -> Option<(i64, i64, i64, i64)> {
        Some((self.left?, self.right?, self.top?, self.pull?))
    }
}

/// A contained child resolved against its parent container placement.
#[derive(Clone, Copy)]
struct Contained<'a> {
    assignment: &'a ItemAssignment,
    item: &'a Item,
    local: &'a ItemPlacement,
}

fn position(p: &Vec3Mm) -> [i64; 3] {
    [p.x.get() as i64, p.y.get() as i64, p.z.get() as i64]
}

/// Evaluate a candidate layout against the immutable context. Structural
/// validity is a precondition enforced by the caller (`validate_layout`);
/// lookups still fail closed instead of panicking.
pub fn validate_candidate(
    input: &ProjectInput,
    catalog: &CatalogContent,
    layout: &CandidateLayout,
) -> CandidateValidation {
    let items: BTreeMap<&str, &Item> = input.items.iter().map(|i| (i.id.as_str(), i)).collect();
    let owned: BTreeMap<&str, &OwnedContainer> = input
        .owned_containers
        .iter()
        .map(|o| (o.id.as_str(), o))
        .collect();
    let variants: BTreeMap<&str, &ProductVariant> = catalog
        .variants
        .iter()
        .map(|v| (v.id.as_str(), v))
        .collect();
    let offers: BTreeMap<&str, &Offer> =
        catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect();
    let placements: BTreeMap<&str, &Placement> = layout
        .placements
        .iter()
        .map(|p| (p.id.as_str(), p))
        .collect();

    let resolved: Vec<Resolved> = layout
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

    // A placement whose subject cannot be resolved must not silently drop out
    // of the evidence set (structural validation is the caller's job, but the
    // check itself stays unknown rather than absent).
    let unresolvable: Vec<&Placement> = layout
        .placements
        .iter()
        .filter(|p| !resolved_by_id.contains_key(p.id.as_str()))
        .collect();

    // Contained and provisional children grouped by container placement.
    let mut contained: BTreeMap<&str, Vec<Contained>> = BTreeMap::new();
    let mut provisional: BTreeMap<&str, Vec<&ItemAssignment>> = BTreeMap::new();
    for assignment in &layout.assignments {
        match &assignment.location {
            ItemLocation::Contained {
                container_placement_id,
                local_placement,
            } => {
                if let Some(item) = items.get(assignment.item_id.as_str()) {
                    contained
                        .entry(container_placement_id.as_str())
                        .or_default()
                        .push(Contained {
                            assignment,
                            item,
                            local: local_placement,
                        });
                }
            }
            ItemLocation::ProvisionalContainer {
                container_placement_id,
                ..
            } => {
                provisional
                    .entry(container_placement_id.as_str())
                    .or_default()
                    .push(assignment);
            }
            ItemLocation::Direct { .. } => {}
        }
    }

    let mut checks = Checks(vec![]);
    for placement in &unresolvable {
        checks.emit(
            format!("subj:{}", placement.id.as_str()),
            CheckKind::Compatibility,
            VUnknown("subject_unresolvable"),
            vec![placement.id.clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
    }
    let space = &input.space;
    let nominal_interior = [
        nominal_length(&space.interior.width),
        nominal_length(&space.interior.depth),
        nominal_length(&space.interior.height),
    ];
    let interior_conservative = available_interior(&space.interior);
    let wall = (
        clearance(&space.clearances.left),
        clearance(&space.clearances.right),
        clearance(&space.clearances.front),
        clearance(&space.clearances.back),
        clearance(&space.clearances.top),
        clearance(&space.clearances.between_units),
    );

    // ---- orientation -------------------------------------------------------
    for r in &resolved {
        let verdict = match r.orientations().value() {
            Some(allowed) if allowed.contains(&r.placement.orientation) => Pass,
            Some(_) => Fail("orientation_forbidden"),
            None => VUnknown("orientations_unknown"),
        };
        checks.emit(
            format!("or:{}", r.id().as_str()),
            CheckKind::Orientation,
            verdict,
            vec![r.id().clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
    }

    // ---- outer containment + wall clearances -------------------------------
    for r in &resolved {
        let pos = position(&r.placement.position);
        let nominal = match (r.nominal_extent(), wall) {
            (Some(extent), (Some(l), Some(rt), Some(f), Some(b), Some(t), _)) => {
                match nominal_interior {
                    [Some(w), Some(d), Some(h)] => {
                        containment_verdict(pos, extent, [w, d, h], [l, rt, f, b, t])
                    }
                    _ => VUnknown("interior_unknown"),
                }
            }
            _ => VUnknown("fact_unknown"),
        };
        let conservative = match (r.occupied_extent(), interior_conservative, wall) {
            (Some(extent), Some(interior), (Some(l), Some(rt), Some(f), Some(b), Some(t), _)) => {
                containment_verdict(pos, extent, interior, [l, rt, f, b, t])
            }
            _ => VUnknown("fact_unknown"),
        };
        checks.emit_geometry(
            &format!("og:{}", r.id().as_str()),
            CheckKind::OuterGeometry,
            vec![r.id().clone()],
            nominal,
            conservative,
            vec![],
        );
    }

    // ---- sibling separation --------------------------------------------------
    for (index, a) in resolved.iter().enumerate() {
        for b in &resolved[index + 1..] {
            let subjects = vec![a.id().clone(), b.id().clone()];
            let nominal = match (a.nominal_box(), b.nominal_box(), wall.5) {
                (Some(a), Some(b), gap) => separation_verdict(&a, &b, gap),
                _ => VUnknown("fact_unknown"),
            };
            let conservative = match (a.occupied_box(), b.occupied_box(), wall.5) {
                (Some(a), Some(b), gap) => separation_verdict(&a, &b, gap),
                _ => VUnknown("fact_unknown"),
            };
            checks.emit_geometry(
                &format!("ogp:{}:{}", a.id().as_str(), b.id().as_str()),
                CheckKind::OuterGeometry,
                subjects,
                nominal,
                conservative,
                vec![],
            );
        }
    }

    // ---- fixed-obstacle collisions --------------------------------------------
    for r in &resolved {
        for obstacle in space
            .obstacles
            .iter()
            .filter(|o| matches!(o.role, ObstacleRole::PhysicalSolid))
        {
            let nominal = match (r.nominal_box(), nominal_cuboid(&obstacle.bounds)) {
                (Some(a), Some(b)) if a.intersects(&b) => Fail("obstacle_collision"),
                (Some(_), Some(_)) => Pass,
                _ => VUnknown("fact_unknown"),
            };
            let conservative = match (r.occupied_box(), occupied_cuboid(&obstacle.bounds)) {
                (Some(a), Some(b)) if a.intersects(&b) => Fail("obstacle_collision"),
                (Some(_), Some(_)) => Pass,
                _ => VUnknown("fact_unknown"),
            };
            checks.emit_geometry(
                &format!("ogo:{}:{}", r.id().as_str(), obstacle.id.as_str()),
                CheckKind::OuterGeometry,
                vec![r.id().clone(), obstacle.id.clone()],
                nominal,
                conservative,
                vec![],
            );
        }
    }

    // ---- top-level support geometry --------------------------------------------
    for r in &resolved {
        checks.emit_geometry(
            &format!("sg:{}", r.id().as_str()),
            CheckKind::SupportGeometry,
            vec![r.id().clone()],
            support_verdict(r, &space.support, false),
            support_verdict(r, &space.support, true),
            vec![],
        );
    }

    // ---- cavity capacity, child support and child orientation -------------------
    for r in &resolved {
        let Some(dims) = r.container_dims() else {
            continue;
        };
        let children = contained.get(r.id().as_str()).cloned().unwrap_or_default();
        let has_provisional = provisional
            .get(r.id().as_str())
            .is_some_and(|v| !v.is_empty());

        // Cavity-inside-outer consistency (evidenced inner offset only).
        let consistency = |conservative: bool| -> Verdict {
            let Some(offset) = dims.inner_offset.value() else {
                return VUnknown("offset_unknown");
            };
            let inner = if conservative {
                match oriented_occupied_extent(&dims.inner, Orientation::Upright0) {
                    Some(v) => v,
                    None => return VUnknown("cavity_unknown"),
                }
            } else {
                match oriented_nominal_extent(&dims.inner, Orientation::Upright0) {
                    Some(v) => v,
                    None => return VUnknown("cavity_unknown"),
                }
            };
            let outer = if conservative {
                match available_interior(&dims.outer) {
                    Some(v) => v,
                    None => return VUnknown("fact_unknown"),
                }
            } else {
                match oriented_nominal_extent(&dims.outer, Orientation::Upright0) {
                    Some(v) => v,
                    None => return VUnknown("fact_unknown"),
                }
            };
            let hi = |f: &Fact<MeasuredOffset>, conservative: bool| -> Option<i64> {
                let m = f.value()?;
                if conservative {
                    match &m.uncertainty {
                        Uncertainty::Bounded { plus_mm, .. } => {
                            Some(m.nominal.get() as i64 + plus_mm.get() as i64)
                        }
                        Uncertainty::Unknown {} => None,
                    }
                } else {
                    Some(m.nominal.get() as i64)
                }
            };
            let (Some(ox), Some(oy), Some(oz)) = (
                hi(&offset.x, conservative),
                hi(&offset.y, conservative),
                hi(&offset.z, conservative),
            ) else {
                return VUnknown("offset_unknown");
            };
            if [ox + inner[0], oy + inner[1], oz + inner[2]]
                .iter()
                .enumerate()
                .all(|(axis, end)| *end <= outer[axis])
            {
                Pass
            } else {
                Fail("cavity_outside_outer")
            }
        };

        if children.is_empty() && !has_provisional {
            // No contents: inner capacity does not apply, but a provably
            // inconsistent cavity model is still a known fail.
            match (consistency(false), consistency(true)) {
                (Fail(reason), _) | (_, Fail(reason)) => {
                    checks.emit_geometry(
                        &format!("ic:{}", r.id().as_str()),
                        CheckKind::InnerCapacity,
                        vec![r.id().clone()],
                        Fail(reason),
                        Fail(reason),
                        vec![],
                    );
                }
                _ => {
                    checks.emit(
                        format!("ic:{}:x", r.id().as_str()),
                        CheckKind::InnerCapacity,
                        NotApplicable("empty_cavity"),
                        vec![r.id().clone()],
                        CheckBasis::NonGeometric,
                        vec![],
                    );
                }
            }
            continue;
        }

        // Containment of every geometrically placed child inside the cavity.
        let cavity_verdict = |conservative: bool| -> Verdict {
            if let Fail(reason) = consistency(conservative) {
                return Fail(reason);
            }
            let cavity = if conservative {
                match available_interior(&dims.inner) {
                    Some(v) => v,
                    None => return VUnknown("cavity_unknown"),
                }
            } else {
                match oriented_nominal_extent(&dims.inner, Orientation::Upright0) {
                    Some(v) => v,
                    None => return VUnknown("cavity_unknown"),
                }
            };
            let clearances = &dims.cavity_clearances;
            let (Some(cl), Some(cr), Some(cf), Some(cb), Some(ct)) = (
                clearance(&clearances.left),
                clearance(&clearances.right),
                clearance(&clearances.front),
                clearance(&clearances.back),
                clearance(&clearances.top),
            ) else {
                return VUnknown("fact_unknown");
            };
            for child in &children {
                let extent = if conservative {
                    oriented_occupied_extent(
                        &child.item.dimensions.envelope,
                        child.local.orientation,
                    )
                } else {
                    oriented_nominal_extent(
                        &child.item.dimensions.envelope,
                        child.local.orientation,
                    )
                };
                let Some(extent) = extent else {
                    return VUnknown("fact_unknown");
                };
                if let Fail(reason) = containment_verdict(
                    position(&child.local.position),
                    extent,
                    cavity,
                    [cl, cr, cf, cb, ct],
                ) {
                    return Fail(if reason == "outside_compartment" {
                        "child_outside_cavity"
                    } else {
                        "cavity_clearance_violated"
                    });
                }
            }
            Pass
        };
        let nominal = cavity_verdict(false);
        let mut conservative = cavity_verdict(true);
        if has_provisional && !matches!(conservative, Fail(_)) {
            // Provisional association claims contents without confirmed
            // interior placement; capacity cannot be confirmed.
            conservative = VUnknown("provisional_contents");
        }
        checks.emit_geometry(
            &format!("ic:{}", r.id().as_str()),
            CheckKind::InnerCapacity,
            vec![r.id().clone()],
            nominal,
            conservative,
            vec![],
        );

        // Child pair separation inside the cavity.
        let between = clearance(&dims.cavity_clearances.between_items);
        for (index, a) in children.iter().enumerate() {
            for b in &children[index + 1..] {
                let box_of = |c: &Contained, conservative: bool| -> Option<Box3> {
                    let extent = if conservative {
                        oriented_occupied_extent(&c.item.dimensions.envelope, c.local.orientation)?
                    } else {
                        oriented_nominal_extent(&c.item.dimensions.envelope, c.local.orientation)?
                    };
                    Some(Box3::from_min_extent(position(&c.local.position), extent))
                };
                let nominal = match (box_of(a, false), box_of(b, false)) {
                    (Some(a), Some(b)) => separation_verdict(&a, &b, between),
                    _ => VUnknown("fact_unknown"),
                };
                let conservative = match (box_of(a, true), box_of(b, true)) {
                    (Some(a), Some(b)) => separation_verdict(&a, &b, between),
                    _ => VUnknown("fact_unknown"),
                };
                checks.emit_geometry(
                    &format!(
                        "icp:{}:{}:{}-{}",
                        r.id().as_str(),
                        a.assignment.item_id.as_str(),
                        a.assignment.unit_ordinal,
                        b.assignment.unit_ordinal
                    ),
                    CheckKind::InnerCapacity,
                    vec![r.id().clone(), a.assignment.item_id.clone()],
                    nominal,
                    conservative,
                    vec![],
                );
            }
        }

        // Child support and orientation.
        match &dims.inner_support {
            Fact::Known { value: floor, .. } => {
                for child in &children {
                    let correct_ref = child.local.support_id == floor.id;
                    let (nominal, conservative) = if !correct_ref {
                        (Fail("unsupported_support"), Fail("unsupported_support"))
                    } else {
                        (
                            child_support_verdict(child, floor, false),
                            child_support_verdict(child, floor, true),
                        )
                    };
                    checks.emit_geometry(
                        &format!(
                            "sgc:{}:{}:{}",
                            r.id().as_str(),
                            child.assignment.item_id.as_str(),
                            child.assignment.unit_ordinal
                        ),
                        CheckKind::SupportGeometry,
                        vec![r.id().clone(), child.assignment.item_id.clone()],
                        nominal,
                        conservative,
                        vec![],
                    );

                    // Child orientation composes the parent yaw; a 180°
                    // composition cannot satisfy an upright-only allowance.
                    let composed = match (r.placement.orientation, child.local.orientation) {
                        (Orientation::Upright0, o) => Some(o),
                        (Orientation::Upright90, Orientation::Upright0) => {
                            Some(Orientation::Upright90)
                        }
                        (Orientation::Upright90, Orientation::Upright90) => None,
                    };
                    let verdict = match (
                        child.item.requirement.allowed_orientations.value(),
                        composed,
                    ) {
                        (Some(allowed), Some(o)) if allowed.contains(&o) => Pass,
                        (Some(_), _) => Fail("orientation_forbidden"),
                        (None, _) => VUnknown("orientations_unknown"),
                    };
                    checks.emit(
                        format!(
                            "orc:{}:{}:{}",
                            r.id().as_str(),
                            child.assignment.item_id.as_str(),
                            child.assignment.unit_ordinal
                        ),
                        CheckKind::Orientation,
                        verdict,
                        vec![r.id().clone(), child.assignment.item_id.clone()],
                        CheckBasis::NonGeometric,
                        vec![],
                    );
                }
            }
            _ if !children.is_empty() => {
                checks.emit_raw(
                    format!("sgc:{}:x", r.id().as_str()),
                    CheckKind::SupportGeometry,
                    CheckStatus::Unknown,
                    vec![r.id().clone()],
                    CheckBasis::NonGeometric,
                    "cavity_floor_unknown",
                    vec![],
                );
            }
            _ => {}
        }
    }

    // ---- load aggregation ------------------------------------------------------
    let item_mass = |item: &Item| item.mass_each.value().map(|m| m.get() as u64);
    let contents_mass = |pid: &str| -> Option<u64> {
        let mut total = 0u64;
        for child in contained.get(pid).into_iter().flatten() {
            total = total.checked_add(item_mass(child.item)?)?;
        }
        for assignment in provisional.get(pid).into_iter().flatten() {
            let item = items.get(assignment.item_id.as_str())?;
            total = total.checked_add(item_mass(item)?)?;
        }
        Some(total)
    };
    let unit_mass = |r: &Resolved| -> Option<u64> {
        let own = r.mass().value().map(|m| m.get() as u64)?;
        if r.is_container() {
            own.checked_add(contents_mass(r.id().as_str())?)
        } else {
            Some(own)
        }
    };
    let load_check = |checks: &mut Checks,
                      id: String,
                      subjects: Vec<Id>,
                      total: Option<u64>,
                      limit: Option<u64>,
                      unknown_reason: &'static str| {
        let verdict = match (total, limit) {
            (Some(t), Some(l)) if t <= l => Pass,
            (Some(_), Some(_)) => Fail("load_exceeded"),
            (Some(_), None) => VUnknown(unknown_reason),
            (None, _) => VUnknown("mass_unknown"),
        };
        checks.emit(
            id,
            CheckKind::SupportLoad,
            verdict,
            subjects,
            CheckBasis::NonGeometric,
            vec![
                measurement("totalMassGrams", total.map(|t| t as i64)),
                measurement("limitGrams", limit.map(|l| l as i64)),
            ],
        );
    };
    {
        let mut total = Some(0u64);
        for r in &resolved {
            total = total.and_then(|t| unit_mass(r).and_then(|m| t.checked_add(m)));
        }
        load_check(
            &mut checks,
            format!("ld:floor:{}", space.id.as_str()),
            vec![space.id.clone()],
            total,
            space.support.load_limit.value().map(|m| m.get() as u64),
            "load_limit_unknown",
        );
    }
    for r in &resolved {
        let Some(dims) = r.container_dims() else {
            continue;
        };
        if !contained.contains_key(r.id().as_str()) && !provisional.contains_key(r.id().as_str()) {
            continue;
        }
        load_check(
            &mut checks,
            format!("ld:cavity:{}", r.id().as_str()),
            vec![r.id().clone()],
            contents_mass(r.id().as_str()),
            dims.inner_support
                .value()
                .and_then(|s| s.load_limit.value())
                .map(|m| m.get() as u64),
            "load_limit_unknown",
        );
    }
    for r in &resolved {
        load_check(
            &mut checks,
            format!("ld:staging:{}", r.id().as_str()),
            vec![r.id().clone()],
            unit_mass(r),
            space
                .staging
                .base_support
                .value()
                .and_then(|s| s.load_limit.value())
                .map(|m| m.get() as u64),
            "staging_support_unknown",
        );
    }

    // ---- insertion path ---------------------------------------------------------
    let staging_nominal = nominal_cuboid(&space.staging.free_volume);
    let staging_guaranteed = guaranteed_cuboid(&space.staging.free_volume);
    let insertion_sweep = |r: &Resolved, conservative: bool| -> Option<(Box3, Box3)> {
        let extent = if conservative {
            r.occupied_extent()?
        } else {
            r.nominal_extent()?
        };
        let (left, right, top, pull) = r.margins().known()?;
        let pos = position(&r.placement.position);
        let at_final = Box3 {
            min: [pos[0] - left, pos[1], pos[2]],
            max: [
                pos[0] + extent[0] + right,
                pos[1] + extent[1],
                pos[2] + extent[2] + top,
            ],
        };
        let sweep = moving_envelope(pos, extent, (left, right, top, pull));
        Some((at_final, sweep))
    };
    // Staging must hold the fully extracted envelope, level with the floor.
    let staging_verdict = |sweep: &Box3, conservative: bool| -> Verdict {
        let staging = if conservative {
            match staging_guaranteed {
                Some(v) => v,
                None => return VUnknown("staging_unknown"),
            }
        } else {
            match staging_nominal {
                Some(v) => v,
                None => return VUnknown("staging_unknown"),
            }
        };
        let base = nominal_region(
            &space.staging.free_volume.min_z,
            &space.staging.free_volume.extent.height,
        );
        match base {
            Some(base) if base.lo != 0 => return Fail("unsupported_vertical_motion"),
            None => return VUnknown("staging_unknown"),
            _ => {}
        }
        if conservative && staging.min[2] > 0 {
            // The base might sit above the floor; cannot prove level.
            return VUnknown("staging_level_unknown");
        }
        let parked = Box3 {
            min: [sweep.min[0], sweep.min[1], sweep.min[2]],
            max: [sweep.max[0], 0, sweep.max[2]],
        };
        if staging.contains(&parked) {
            Pass
        } else if parked.min[1] < staging.min[1] {
            Fail("staging_depth_insufficient")
        } else if parked.max[2] > staging.max[2] {
            Fail("staging_height_insufficient")
        } else {
            Fail("staging_width_insufficient")
        }
    };
    let insertion_verdict = |r: &Resolved, conservative: bool| -> Verdict {
        let Some((at_final, sweep)) = insertion_sweep(r, conservative) else {
            return VUnknown("fact_unknown");
        };
        let opening = &space.opening;
        let (ox, oz) = if conservative {
            match (
                guaranteed_region(&opening.left, &opening.width),
                guaranteed_region(&opening.bottom, &opening.height),
            ) {
                (Some(x), Some(z)) => (x, z),
                _ => return VUnknown("opening_unknown"),
            }
        } else {
            match (
                nominal_region(&opening.left, &opening.width),
                nominal_region(&opening.bottom, &opening.height),
            ) {
                (Some(x), Some(z)) => (x, z),
                _ => return VUnknown("opening_unknown"),
            }
        };
        if !ox.contains(at_final.axis(0)) {
            return Fail("opening_too_narrow");
        }
        if !oz.contains(at_final.axis(2)) {
            return Fail(if at_final.min[2] < oz.lo {
                "opening_sill_blocked"
            } else {
                "opening_too_short"
            });
        }
        match staging_verdict(&sweep, conservative) {
            Pass => {}
            other => return other,
        }
        // The swept envelope must avoid fixed obstacles and access zones.
        for obstacle in &space.obstacles {
            let bounds = if conservative {
                occupied_cuboid(&obstacle.bounds)
            } else {
                nominal_cuboid(&obstacle.bounds)
            };
            let Some(bounds) = bounds else {
                return VUnknown("fact_unknown");
            };
            if sweep.intersects(&bounds) {
                return Fail("blocked_by_fixed_obstacle");
            }
        }
        Pass
    };
    for r in &resolved {
        checks.emit_geometry(
            &format!("ip:{}", r.id().as_str()),
            CheckKind::InstallationPath,
            vec![r.id().clone()],
            insertion_verdict(r, false),
            insertion_verdict(r, true),
            vec![
                measurement(
                    "pullDepthRequiredMm",
                    r.occupied_extent()
                        .and_then(|e| r.margins().pull.map(|p| e[1] + p)),
                ),
                measurement(
                    "stagingDepthAvailableMm",
                    staging_guaranteed.map(|s| -s.min[1]),
                ),
            ],
        );
    }

    // Insertion order: B must precede A when B's sweep envelope crosses A's
    // final volume — A would obstruct B's transit, so A depends on B.
    // `preds[a]` holds the placements that must be installed before A.
    let mut install_order: Vec<Id> = vec![];
    let mut predecessors: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    {
        let mut preds: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut unknown = false;
        for b in &resolved {
            let Some((_, sweep)) = insertion_sweep(b, true) else {
                unknown = true;
                continue;
            };
            for a in &resolved {
                if a.id() == b.id() {
                    continue;
                }
                let Some(volume) = a.occupied_box() else {
                    unknown = true;
                    continue;
                };
                if sweep.intersects(&volume) {
                    preds
                        .entry(a.id().as_str().to_owned())
                        .or_default()
                        .insert(b.id().as_str().to_owned());
                }
            }
        }
        // Kahn topological sort with placement-id tie-break.
        let mut remaining: BTreeSet<String> = resolved
            .iter()
            .map(|r| r.id().as_str().to_owned())
            .collect();
        let mut cyclic = false;
        while !remaining.is_empty() {
            let Some(next) = remaining
                .iter()
                .find(|id| preds.get(*id).is_none_or(|deps| deps.is_empty()))
                .cloned()
            else {
                cyclic = true;
                break;
            };
            remaining.remove(&next);
            for deps in preds.values_mut() {
                deps.remove(&next);
            }
            install_order.push(Id::new(&next).expect("placement id"));
        }
        // Independently replay the derived order: each swept envelope must
        // avoid the already installed volumes.
        let mut blocked = false;
        if !cyclic && !unknown {
            let mut installed: Vec<Box3> = vec![];
            for id in &install_order {
                let r = resolved_by_id[id.as_str()];
                match (insertion_sweep(r, true), r.occupied_box()) {
                    (Some((_, sweep)), Some(volume)) => {
                        if installed.iter().any(|v| sweep.intersects(v)) {
                            blocked = true;
                        }
                        installed.push(volume);
                    }
                    _ => unknown = true,
                }
            }
        }
        let verdict = if cyclic {
            Fail("insertion_cycle")
        } else if blocked {
            Fail("insertion_order_unsupported")
        } else if unknown {
            VUnknown("order_unverifiable")
        } else {
            Pass
        };
        checks.emit(
            "io:order".into(),
            CheckKind::InstallationPath,
            verdict,
            resolved.iter().map(|r| r.id().clone()).collect(),
            CheckBasis::Conservative,
            vec![],
        );
        if matches!(verdict, Pass) {
            // Only a proved order may drive the action DAG.
            predecessors = {
                // Recompute the unmutated predecessor sets for the DAG:
                // A's prerequisites are every B whose sweep crosses A.
                let mut result: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
                for b in &resolved {
                    if let Some((_, sweep)) = insertion_sweep(b, true) {
                        for a in &resolved {
                            if a.id() != b.id()
                                && let Some(volume) = a.occupied_box()
                                && sweep.intersects(&volume)
                            {
                                result
                                    .entry(a.id().as_str().to_owned())
                                    .or_default()
                                    .insert(b.id().as_str().to_owned());
                            }
                        }
                    }
                }
                result
            };
        } else {
            install_order = vec![];
        }
    }

    // ---- operational access ------------------------------------------------------
    // Blocker graph over the complete installed plan, per basis.
    let blockers_for = |conservative: bool| -> BTreeMap<String, BTreeSet<String>> {
        let mut blockers: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        for r in &resolved {
            let Some((_, sweep)) = insertion_sweep(r, conservative) else {
                continue;
            };
            for other in &resolved {
                if other.id() == r.id() {
                    continue;
                }
                let volume = if conservative {
                    other.occupied_box()
                } else {
                    other.nominal_box()
                };
                if let Some(volume) = volume
                    && sweep.intersects(&volume)
                {
                    blockers
                        .entry(r.id().as_str().to_owned())
                        .or_default()
                        .insert(other.id().as_str().to_owned());
                }
            }
        }
        blockers
    };
    let nominal_blockers = blockers_for(false);
    let blockers = blockers_for(true);
    let cyclic_blockers = {
        fn visit(
            node: &str,
            edges: &BTreeMap<String, BTreeSet<String>>,
            color: &mut BTreeMap<String, u8>,
        ) -> bool {
            match color.get(node) {
                Some(1) => return true,
                Some(2) => return false,
                _ => {}
            }
            color.insert(node.to_owned(), 1);
            let deps: Vec<String> = edges.get(node).into_iter().flatten().cloned().collect();
            for dep in deps {
                if visit(&dep, edges, color) {
                    return true;
                }
            }
            color.insert(node.to_owned(), 2);
            false
        }
        let mut color = BTreeMap::new();
        let mut cyclic = false;
        for key in blockers.keys() {
            if visit(key, &blockers, &mut color) {
                cyclic = true;
            }
        }
        cyclic
    };
    for r in &resolved {
        let verdict = |conservative: bool| -> Verdict {
            let Some((_, sweep)) = insertion_sweep(r, conservative) else {
                return VUnknown("fact_unknown");
            };
            for obstacle in &space.obstacles {
                let bounds = if conservative {
                    occupied_cuboid(&obstacle.bounds)
                } else {
                    nominal_cuboid(&obstacle.bounds)
                };
                let Some(bounds) = bounds else {
                    return VUnknown("fact_unknown");
                };
                if sweep.intersects(&bounds) {
                    return Fail("blocked_by_fixed_obstacle");
                }
            }
            match staging_verdict(&sweep, conservative) {
                Pass => {}
                other => return other,
            }
            let blocked_by = if conservative {
                blockers.get(r.id().as_str()).cloned().unwrap_or_default()
            } else {
                nominal_blockers
                    .get(r.id().as_str())
                    .cloned()
                    .unwrap_or_default()
            };
            if !blocked_by.is_empty() {
                if input.constraints.hard_one_action_access {
                    return Fail("one_action_blocked");
                }
                if cyclic_blockers {
                    return Fail("cyclic_blockers");
                }
                // Nonzero removable blockers stay conditional: temporary
                // parking is outside v1 and cannot be promoted by an acyclic
                // graph or user acknowledgement.
                return VUnknown("temporary_parking_unsupported");
            }
            Pass
        };
        checks.emit_geometry(
            &format!("oa:{}", r.id().as_str()),
            CheckKind::OperationalAccess,
            vec![r.id().clone()],
            verdict(false),
            verdict(true),
            vec![measurement(
                "blockerCount",
                blockers.get(r.id().as_str()).map(|b| b.len() as i64),
            )],
        );
    }

    // Contents retrieval after full pull-out (containers only).
    for r in &resolved {
        let base_id = format!("oac:{}:x", r.id().as_str());
        if !r.is_container() {
            checks.emit_raw(
                base_id,
                CheckKind::OperationalAccess,
                CheckStatus::NotApplicable,
                vec![r.id().clone()],
                CheckBasis::NonGeometric,
                "direct_extraction_no_rim_lift",
                vec![],
            );
            continue;
        }
        let dims = r.container_dims().expect("container");
        let children = contained.get(r.id().as_str()).cloned().unwrap_or_default();
        let has_provisional = provisional
            .get(r.id().as_str())
            .is_some_and(|v| !v.is_empty());
        if children.is_empty() && !has_provisional {
            checks.emit_raw(
                base_id,
                CheckKind::OperationalAccess,
                CheckStatus::NotApplicable,
                vec![r.id().clone()],
                CheckBasis::NonGeometric,
                "empty_cavity",
                vec![],
            );
            continue;
        }
        if has_provisional {
            checks.emit_raw(
                base_id,
                CheckKind::OperationalAccess,
                CheckStatus::Unknown,
                vec![r.id().clone()],
                CheckBasis::NonGeometric,
                "provisional_contents",
                vec![],
            );
            continue;
        }
        // Each child lifts vertically: outer height + item height +
        // lift-above-rim + effective top handling, each applied once.
        let container_margins = r.margins();
        let mut verdict = Pass;
        for child in &children {
            let margins = EffectiveMargins::merged(
                EffectiveMargins::of(&child.item.requirement.handling),
                container_margins,
            );
            let current = (|| -> Verdict {
                let Some(outer_h) = occupied_length(&dims.outer.height) else {
                    return VUnknown("fact_unknown");
                };
                let Some(item_extent) = oriented_occupied_extent(
                    &child.item.dimensions.envelope,
                    child.local.orientation,
                ) else {
                    return VUnknown("fact_unknown");
                };
                let (Some(lift), Some(top), Some(left), Some(right), Some(pull)) = (
                    margins.lift,
                    margins.top,
                    margins.left,
                    margins.right,
                    margins.pull,
                ) else {
                    return VUnknown("handling_unknown");
                };
                let Some(staging) = staging_guaranteed else {
                    return VUnknown("staging_unknown");
                };
                let required = outer_h + item_extent[2] + lift + top;
                if staging.max[2] < required {
                    return Fail("staging_height_insufficient");
                }
                // The lifted item stays inside the cavity x/y sweep and the
                // free staging footprint with its declared side margins.
                let (Some(cavity_w), Some(cavity_d)) = (
                    available_length(&dims.inner.width),
                    available_length(&dims.inner.depth),
                ) else {
                    return VUnknown("cavity_unknown");
                };
                let local = position(&child.local.position);
                let sweep_x = AxisInterval {
                    lo: local[0] - left,
                    hi: local[0] + item_extent[0] + right,
                };
                let sweep_y = AxisInterval {
                    lo: local[1],
                    hi: local[1] + item_extent[1],
                };
                if !(AxisInterval {
                    lo: 0,
                    hi: cavity_w,
                }
                .contains(sweep_x)
                    && AxisInterval {
                        lo: 0,
                        hi: cavity_d,
                    }
                    .contains(sweep_y))
                {
                    return Fail("cavity_sweep_blocked");
                }
                // Global position at the pulled-out staging pose.
                let Some(outer_d) = occupied_length(&dims.outer.depth) else {
                    return VUnknown("fact_unknown");
                };
                let Ok(pulled_y) = PositionMm::new(-(outer_d + pull) as i32) else {
                    return VUnknown("fact_unknown");
                };
                let pulled = Vec3Mm {
                    x: r.placement.position.x,
                    y: pulled_y,
                    z: r.placement.position.z,
                };
                let Some(offset) = dims.inner_offset.value() else {
                    return VUnknown("offset_unknown");
                };
                let Some(global) = child_global_box(
                    &pulled,
                    r.placement.orientation,
                    outer_d,
                    offset,
                    local,
                    item_extent,
                ) else {
                    return VUnknown("offset_unknown");
                };
                let footprint = Box3 {
                    min: [global.min[0] - left, global.min[1], 0],
                    max: [global.max[0] + right, global.max[1], required],
                };
                if !staging.contains(&footprint) {
                    return Fail("staging_footprint_insufficient");
                }
                Pass
            })();
            match (verdict, current) {
                (Fail(_), _) => {}
                (_, Fail(reason)) => verdict = Fail(reason),
                (VUnknown(_), _) => {}
                (_, v @ VUnknown(_)) => verdict = v,
                _ => {}
            }
        }
        checks.emit_raw(
            base_id.clone(),
            CheckKind::OperationalAccess,
            match verdict {
                Pass => CheckStatus::Pass,
                NotApplicable(_) => CheckStatus::NotApplicable,
                Fail(_) => CheckStatus::Fail,
                VUnknown(_) => CheckStatus::Unknown,
            },
            vec![r.id().clone()],
            CheckBasis::Conservative,
            match verdict {
                Pass => "ok",
                NotApplicable(reason) | Fail(reason) | VUnknown(reason) => reason,
            },
            vec![],
        );
    }

    // ---- quantity conservation ---------------------------------------------------
    let mut assigned_count = 0u32;
    let mut provisional_count = 0u32;
    for assignment in &layout.assignments {
        match &assignment.location {
            ItemLocation::ProvisionalContainer { .. } => provisional_count += 1,
            _ => assigned_count += 1,
        }
    }
    let mut unassigned_count = 0u32;
    let mut unknown_quantity_items = 0u32;
    for entry in &layout.unassigned {
        match &entry.instances {
            UnassignedInstances::Known { ranges } => {
                for range in ranges {
                    unassigned_count += range.end_exclusive - range.start;
                }
            }
            UnassignedInstances::UnknownQuantity {} => unknown_quantity_items += 1,
        }
    }
    checks.emit(
        "qc:partition".into(),
        CheckKind::QuantityConservation,
        Pass,
        vec![],
        CheckBasis::NonGeometric,
        vec![
            measurement("assignedInstances", Some(assigned_count as i64)),
            measurement("provisionalInstances", Some(provisional_count as i64)),
            measurement("unassignedInstances", Some(unassigned_count as i64)),
        ],
    );
    for (owned_id, container) in &owned {
        let used: Vec<u32> = layout
            .placements
            .iter()
            .filter_map(|p| match &p.subject {
                PlacementSubject::OwnedContainer {
                    owned_id: id,
                    unit_ordinal,
                } if id.as_str() == *owned_id => Some(*unit_ordinal),
                _ => None,
            })
            .collect();
        if used.is_empty() {
            continue;
        }
        let verdict = match container.quantity_available.value() {
            Some(available) if used.iter().all(|o| *o < available.get()) => Pass,
            Some(_) => Fail("owned_overuse"),
            None => VUnknown("owned_availability_unknown"),
        };
        checks.emit(
            format!("qc:owned:{owned_id}"),
            CheckKind::QuantityConservation,
            verdict,
            vec![container.id.clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
    }

    // ---- compatibility ------------------------------------------------------------
    // Grouping policy and hard together rules over resolved targets.
    let zone_bounds = |zone: &Zone| -> Box3 {
        Box3::from_min_extent(
            position(&zone.bounds.min),
            [
                zone.bounds.extent.width.get() as i64,
                zone.bounds.extent.depth.get() as i64,
                zone.bounds.extent.height.get() as i64,
            ],
        )
    };
    let locked_zones: Vec<&Zone> = input
        .constraints
        .locked_zones
        .iter()
        .map(|l| &l.zone)
        .collect();
    let target_of = |assignment: &ItemAssignment| -> Option<String> {
        match &assignment.location {
            ItemLocation::Contained {
                container_placement_id,
                ..
            }
            | ItemLocation::ProvisionalContainer {
                container_placement_id,
                ..
            } => Some(format!("container:{}", container_placement_id.as_str())),
            ItemLocation::Direct { placement_id } => {
                let placement = placements.get(placement_id.as_str())?;
                let r = resolved_by_id.get(placement_id.as_str())?;
                let zone = locked_zones.iter().find(|zone| {
                    let bounds = zone_bounds(zone);
                    r.nominal_box().is_some_and(|b| bounds.contains(&b))
                });
                let space_id = match &placement.parent {
                    ParentRef::Space { space_id } => space_id.as_str(),
                    ParentRef::Container { placement_id } => placement_id.as_str(),
                };
                Some(format!(
                    "direct:{}",
                    zone.map(|z| z.id.as_str()).unwrap_or(space_id)
                ))
            }
        }
    };
    let target_verdict = |targets: &BTreeSet<String>, unknown: bool, reason: &'static str| {
        if unknown {
            VUnknown("fact_unknown")
        } else if targets.len() > 1 {
            Fail(reason)
        } else {
            Pass
        }
    };
    for group in &input.groups {
        if !matches!(group.split_policy, GroupSplitPolicy::OneTarget) {
            continue;
        }
        let mut targets = BTreeSet::new();
        let mut unknown = false;
        for assignment in &layout.assignments {
            if group.item_ids.contains(&assignment.item_id) {
                match target_of(assignment) {
                    Some(target) => {
                        targets.insert(target);
                    }
                    None => unknown = true,
                }
            }
        }
        checks.emit(
            format!("cp:group:{}", group.id.as_str()),
            CheckKind::Compatibility,
            target_verdict(&targets, unknown, "one_target_violation"),
            vec![group.id.clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
    }
    for item in &input.items {
        if !item.requirement.must_stay_together {
            continue;
        }
        let mut targets = BTreeSet::new();
        let mut unknown = false;
        for assignment in &layout.assignments {
            if assignment.item_id == item.id {
                match target_of(assignment) {
                    Some(target) => {
                        targets.insert(target);
                    }
                    None => unknown = true,
                }
            }
        }
        checks.emit(
            format!("cp:item:{}", item.id.as_str()),
            CheckKind::Compatibility,
            target_verdict(&targets, unknown, "must_stay_together_violation"),
            vec![item.id.clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
    }
    for item in &input.items {
        for other in &item.requirement.mandatory_compatibility {
            let mut targets = BTreeSet::new();
            let mut unknown = false;
            for assignment in &layout.assignments {
                if assignment.item_id == item.id || &assignment.item_id == other {
                    match target_of(assignment) {
                        Some(target) => {
                            targets.insert(target);
                        }
                        None => unknown = true,
                    }
                }
            }
            checks.emit(
                format!("cp:compat:{}:{}", item.id.as_str(), other.as_str()),
                CheckKind::Compatibility,
                target_verdict(&targets, unknown, "compatibility_split"),
                vec![item.id.clone(), other.clone()],
                CheckBasis::NonGeometric,
                vec![],
            );
        }
    }
    // Locked hard zones bound every assigned placement of the group.
    for locked in &input.constraints.locked_zones {
        if !matches!(locked.zone.kind, ZoneKind::HardLocked) {
            continue;
        }
        let Some(group) = input.groups.iter().find(|g| g.id == locked.group_id) else {
            continue;
        };
        let bounds = zone_bounds(&locked.zone);
        let mut subjects: Vec<Id> = vec![];
        let mut verdict = Pass;
        for assignment in &layout.assignments {
            if !group.item_ids.contains(&assignment.item_id) {
                continue;
            }
            let placement_id = match &assignment.location {
                ItemLocation::Direct { placement_id }
                | ItemLocation::Contained {
                    container_placement_id: placement_id,
                    ..
                }
                | ItemLocation::ProvisionalContainer {
                    container_placement_id: placement_id,
                    ..
                } => placement_id,
            };
            let Some(r) = resolved_by_id.get(placement_id.as_str()) else {
                verdict = VUnknown("fact_unknown");
                continue;
            };
            subjects.push(r.id().clone());
            match r.nominal_box() {
                Some(b) if bounds.contains(&b) => {}
                Some(_) => verdict = Fail("outside_locked_zone"),
                None => verdict = VUnknown("fact_unknown"),
            }
        }
        checks.emit(
            format!("cp:zone:{}", locked.group_id.as_str()),
            CheckKind::Compatibility,
            verdict,
            subjects,
            CheckBasis::NonGeometric,
            vec![],
        );
    }
    // Physical model restrictions: unmodeled mounting/lid/cavity claims.
    for r in &resolved {
        let mut verdict = Pass;
        if let SubjectFacts::New(variant) = r.subject {
            match variant.mounting.value() {
                Some(MountingRequirement::Required) => {
                    verdict = Fail("mounting_required_unsupported")
                }
                None => verdict = VUnknown("mounting_unknown"),
                _ => {}
            }
        }
        if let Some(dims) = r.container_dims() {
            match dims.lid_state.value() {
                Some(LidState::Present) => verdict = Fail("lid_unsupported"),
                None if verdict == Pass => verdict = VUnknown("lid_unknown"),
                _ => {}
            }
            if dims.cavity_model.value().is_none() && verdict == Pass {
                verdict = VUnknown("cavity_model_unknown");
            }
        }
        checks.emit(
            format!("cp:model:{}", r.id().as_str()),
            CheckKind::Compatibility,
            verdict,
            vec![r.id().clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
    }

    // ---- commercial checks ---------------------------------------------------------
    // New-container placements grouped by variant; one offer per variant.
    let mut by_variant: BTreeMap<&str, Vec<&Placement>> = BTreeMap::new();
    for placement in &layout.placements {
        if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
            by_variant
                .entry(variant_id.as_str())
                .or_default()
                .push(placement);
        }
    }
    let mut cost = CostAccumulator::default();
    for (variant_id, placements) in &by_variant {
        let selection = layout
            .purchase_selections
            .iter()
            .find(|s| s.placement_id.as_str() == placements[0].id.as_str());
        let offer = selection.and_then(|s| match &s.offer {
            OfferSelection::Selected { offer_id } => offers.get(offer_id.as_str()).copied(),
            OfferSelection::Unresolved { .. } => None,
        });
        let needed = placements.len() as u64;
        cost.add_line(offer, needed);
        let subjects = vec![Id::new(variant_id).expect("variant id")];
        let unresolved = !matches!(
            selection.map(|s| &s.offer),
            Some(OfferSelection::Selected { .. })
        );
        let bundle = offer.is_some_and(|o| !o.bundle_components.is_empty());
        let inventory = if unresolved {
            VUnknown("offer_unresolved")
        } else if bundle {
            Fail("bundle_unsupported")
        } else {
            match offer.and_then(|o| o.inventory.value()) {
                Some(InventoryState::InStock) => Pass,
                Some(InventoryState::OutOfStock) => Fail("out_of_stock"),
                None => VUnknown("inventory_unknown"),
            }
        };
        checks.emit(
            format!("inv:{variant_id}"),
            CheckKind::Inventory,
            inventory,
            subjects.clone(),
            CheckBasis::NonGeometric,
            vec![],
        );
        let price = if unresolved {
            VUnknown("offer_unresolved")
        } else if bundle {
            Fail("bundle_unsupported")
        } else if offer
            .is_some_and(|o| o.pack_price.value().is_some() && o.pack_quantity.value().is_some())
        {
            Pass
        } else {
            VUnknown("price_unknown")
        };
        checks.emit(
            format!("pr:{variant_id}"),
            CheckKind::Price,
            price,
            subjects.clone(),
            CheckBasis::NonGeometric,
            vec![],
        );
        let shipping = if unresolved {
            VUnknown("offer_unresolved")
        } else if bundle {
            Fail("bundle_unsupported")
        } else {
            match offer.and_then(|o| o.shipping.value()) {
                Some(ShippingRule::Free {}) => Pass,
                Some(ShippingRule::FixedPerSeller { fee }) if fee.value().is_some() => Pass,
                Some(ShippingRule::FixedPerSeller { .. }) => VUnknown("shipping_unknown"),
                Some(ShippingRule::Complex {}) => VUnknown("shipping_complex"),
                None => VUnknown("shipping_unknown"),
            }
        };
        checks.emit(
            format!("sh:{variant_id}"),
            CheckKind::Shipping,
            shipping,
            subjects,
            CheckBasis::NonGeometric,
            vec![],
        );
    }
    // Budget checks over the derived totals.
    let purchases = !by_variant.is_empty();
    if purchases && !input.constraints.purchase_allowed {
        checks.emit(
            "bg:hard".into(),
            CheckKind::Budget,
            Fail("purchase_disallowed"),
            vec![],
            CheckBasis::NonGeometric,
            vec![],
        );
    } else {
        let verdict = match (cost.grand_total(), input.constraints.hard_budget.value()) {
            _ if !purchases => NotApplicable("no_purchases"),
            (Some(total), Some(limit)) if total <= limit.get() => Pass,
            (Some(_), Some(_)) => Fail("hard_budget_exceeded"),
            (None, _) => VUnknown("total_unknown"),
            (Some(_), None) => VUnknown("budget_unknown"),
        };
        checks.emit(
            "bg:hard".into(),
            CheckKind::Budget,
            verdict,
            vec![],
            CheckBasis::NonGeometric,
            vec![],
        );
    }
    if purchases {
        // Advisory only: exceeding the soft budget is a preference violation,
        // reported as Fail but never blocking publication (`blocking_check`).
        let verdict = match (cost.grand_total(), input.constraints.soft_budget.value()) {
            (Some(total), Some(limit)) if total <= limit.get() => Pass,
            (Some(_), Some(_)) => Fail("soft_budget_exceeded"),
            _ => VUnknown("fact_unknown"),
        };
        checks.emit(
            "bg:soft".into(),
            CheckKind::Budget,
            verdict,
            vec![],
            CheckBasis::NonGeometric,
            vec![],
        );
    }

    // ---- aggregate --------------------------------------------------------------------
    let mut physical_fail = false;
    let mut physical_unknown = false;
    let mut commerce_all_pass = true;
    for check in &checks.0 {
        if physical_kind(&check.kind) {
            match check.status {
                CheckStatus::Fail => physical_fail = true,
                CheckStatus::Unknown => physical_unknown = true,
                _ => {}
            }
        } else if !matches!(check.status, CheckStatus::Pass | CheckStatus::NotApplicable) {
            // Inventory/price/shipping/budget: a fail or an unresolved
            // unknown keeps commerce conditional — never silently ready.
            commerce_all_pass = false;
        }
    }
    let physical_assurance = if physical_fail {
        PhysicalAssurance::Rejected
    } else if physical_unknown {
        PhysicalAssurance::Conditional
    } else {
        PhysicalAssurance::ConfirmedWithinScope
    };
    let commerce_readiness = if by_variant.is_empty() {
        CommerceReadiness::NotApplicable
    } else if commerce_all_pass {
        CommerceReadiness::Ready
    } else {
        CommerceReadiness::Conditional
    };
    CandidateValidation {
        report: ValidationReport {
            checks: checks.0,
            physical_assurance,
            assignment_completeness: AssignmentCompleteness {
                assigned_instances: UnitCount::new(assigned_count).expect("bounded"),
                provisional_instances: UnitCount::new(provisional_count).expect("bounded"),
                unassigned_instances: UnitCount::new(unassigned_count).expect("bounded"),
                unknown_quantity_items: UnitCount::new(unknown_quantity_items).expect("bounded"),
            },
            commerce_readiness,
        },
        install_order,
        predecessors,
    }
}

/// Whether the report contains a blocking known failure — the candidate must
/// not be finalized into a published snapshot.
pub fn has_blocking_failure(report: &ValidationReport) -> bool {
    report
        .checks
        .iter()
        .any(|c| c.blocking && c.status == CheckStatus::Fail)
}

/// Shared cost arithmetic for the budget checks; the same computation feeds
/// the finalizer's BOM and cost summary so both views agree.
#[derive(Default)]
pub struct CostAccumulator {
    product_subtotal: Option<u64>,
    shipping_total: Option<u64>,
    shipping_applicable: bool,
    unresolved: bool,
}
impl CostAccumulator {
    /// Known product subtotal across resolved lines; `None` when any line's
    /// price or pack arithmetic is unresolved.
    pub fn product_subtotal(&self) -> Option<u64> {
        (!self.unresolved).then_some(self.product_subtotal.unwrap_or(0))
    }
    /// Known shipping total; `None` when any line's shipping is unresolved.
    /// `Some(0)` covers free shipping and the no-applicable-fee case.
    pub fn shipping_total(&self) -> Option<u64> {
        if self.unresolved {
            None
        } else if self.shipping_applicable {
            Some(self.shipping_total.unwrap_or(0))
        } else {
            Some(0)
        }
    }
    pub fn add_line(&mut self, offer: Option<&Offer>, needed: u64) {
        let Some(offer) = offer else {
            self.unresolved = true;
            return;
        };
        if !offer.bundle_components.is_empty() {
            self.unresolved = true;
            return;
        }
        match (offer.pack_quantity.value(), offer.pack_price.value()) {
            (Some(pack), Some(price)) => {
                let packs = needed.div_ceil(pack.get() as u64);
                if let Some(subtotal) = packs.checked_mul(price.get()) {
                    self.product_subtotal = Some(self.product_subtotal.unwrap_or(0) + subtotal);
                } else {
                    self.unresolved = true;
                }
            }
            _ => self.unresolved = true,
        }
        match offer.shipping.value() {
            Some(ShippingRule::Free {}) => {
                self.shipping_applicable = true;
                self.shipping_total = Some(self.shipping_total.unwrap_or(0));
            }
            Some(ShippingRule::FixedPerSeller { fee }) => match fee.value() {
                Some(fee) => {
                    self.shipping_applicable = true;
                    self.shipping_total = Some(self.shipping_total.unwrap_or(0) + fee.get());
                }
                None => self.unresolved = true,
            },
            _ => self.unresolved = true,
        }
    }
    pub fn grand_total(&self) -> Option<u64> {
        if self.unresolved {
            return None;
        }
        let product = self.product_subtotal.unwrap_or(0);
        if self.shipping_applicable {
            Some(product + self.shipping_total?)
        } else {
            Some(product)
        }
    }
}

/// Containment plus wall clearance verdict for a placed envelope.
fn containment_verdict(
    pos: [i64; 3],
    extent: [i64; 3],
    interior: [i64; 3],
    clearances: [i64; 5],
) -> Verdict {
    let [left, right, front, back, top] = clearances;
    if pos[0] < 0 || pos[1] < 0 || pos[2] < 0 {
        return Fail("outside_compartment");
    }
    if pos[0] + extent[0] > interior[0]
        || pos[1] + extent[1] > interior[1]
        || pos[2] + extent[2] > interior[2]
    {
        return Fail("outside_compartment");
    }
    if pos[0] < left
        || interior[0] - (pos[0] + extent[0]) < right
        || pos[1] < front
        || interior[1] - (pos[1] + extent[1]) < back
        || interior[2] - (pos[2] + extent[2]) < top
    {
        return Fail("clearance_violated");
    }
    Pass
}

/// Sibling collision plus required separation verdict.
fn separation_verdict(a: &Box3, b: &Box3, required_gap: Option<i64>) -> Verdict {
    if a.intersects(b) {
        return Fail("sibling_overlap");
    }
    match required_gap {
        Some(gap) if a.separation(b) < gap => Fail("clearance_violated"),
        None => VUnknown("clearance_unknown"),
        _ => Pass,
    }
}

/// Top-level support: the declared compartment floor at its measured
/// elevation with the full footprint supported.
fn support_verdict(r: &Resolved, floor: &SupportSurface, conservative: bool) -> Verdict {
    if r.placement.support_id != floor.id || !matches!(floor.kind, SupportKind::EstablishedFloor) {
        return Fail("unsupported_support");
    }
    let Some(elevation) = floor.elevation.value() else {
        return VUnknown("fact_unknown");
    };
    let z = r.placement.position.z.get() as i64;
    if z != elevation.nominal.get() as i64 {
        return Fail("floating_support");
    }
    if conservative
        && !matches!(
            elevation.uncertainty,
            Uncertainty::Bounded {
                minus_mm,
                plus_mm
            } if minus_mm.get() == 0 && plus_mm.get() == 0
        )
    {
        return VUnknown("elevation_unknown");
    }
    let Some(object) = (if conservative {
        r.occupied_box()
    } else {
        r.nominal_box()
    }) else {
        return VUnknown("fact_unknown");
    };
    let footprint = if conservative {
        guaranteed_footprint(&floor.footprint)
    } else {
        nominal_footprint(&floor.footprint)
    };
    let Some((x, y)) = footprint else {
        return VUnknown("fact_unknown");
    };
    if !(x.contains(object.axis(0)) && y.contains(object.axis(1))) {
        return Fail("unsupported_footprint");
    }
    Pass
}

/// Contained-child support on the cavity floor: local z at the declared
/// elevation and footprint inside the cavity floor rectangle.
fn child_support_verdict(child: &Contained, floor: &SupportSurface, conservative: bool) -> Verdict {
    let Some(elevation) = floor.elevation.value() else {
        return VUnknown("fact_unknown");
    };
    let z = child.local.position.z.get() as i64;
    if z != elevation.nominal.get() as i64 {
        return Fail("floating_support");
    }
    if conservative
        && !matches!(
            elevation.uncertainty,
            Uncertainty::Bounded {
                minus_mm,
                plus_mm
            } if minus_mm.get() == 0 && plus_mm.get() == 0
        )
    {
        return VUnknown("elevation_unknown");
    }
    let extent = if conservative {
        oriented_occupied_extent(&child.item.dimensions.envelope, child.local.orientation)
    } else {
        oriented_nominal_extent(&child.item.dimensions.envelope, child.local.orientation)
    };
    let Some(extent) = extent else {
        return VUnknown("fact_unknown");
    };
    let object = Box3::from_min_extent(position(&child.local.position), extent);
    let footprint = if conservative {
        guaranteed_footprint(&floor.footprint)
    } else {
        nominal_footprint(&floor.footprint)
    };
    let Some((x, y)) = footprint else {
        return VUnknown("fact_unknown");
    };
    if !(x.contains(object.axis(0)) && y.contains(object.axis(1))) {
        return Fail("unsupported_footprint");
    }
    Pass
}
