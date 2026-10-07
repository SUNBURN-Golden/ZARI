//! Indexed independent checks and quantity audit. One quantum is one basis
//! or one pair comparison (cost 1). Quantity follows the commercial checks
//! so the phase order matches the SP-012 table. Canonical check order is
//! sorted later, so this emission order does not change a snapshot digest.

use super::Verdict::{Fail, NotApplicable, Pass, Unknown as VUnknown};
use super::{
    Checks, Contained, CostAccumulator, Resolved, SubjectFacts, Verdict, child_support_verdict,
    containment_verdict, measurement, physical_kind, position, separation_verdict, support_verdict,
};
use crate::canonical::CatalogContent;
use crate::catalog::*;
use crate::facts::*;
use crate::geometry::*;
use crate::input::*;
use crate::plan::*;
use crate::scalars::*;
use std::collections::{BTreeMap, BTreeSet};

const QTY_ASSIGN: u8 = 28;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DriveQuantum {
    Independent,
    Quantity,
}

#[derive(Clone, Debug)]
pub(crate) struct CheckDrive {
    checks: Checks,
    section: u8,
    i: usize,
    j: usize,
    k: usize,
    basis: u8,
    done: bool,
    sweep_ready: bool,
    sweep: Option<Box3>,
    saved_preds: BTreeMap<String, BTreeSet<String>>,
    kahn_preds: BTreeMap<String, BTreeSet<String>>,
    kahn_remaining: BTreeSet<String>,
    kahn_started: bool,
    insertion_unknown: bool,
    cyclic: bool,
    blocked: bool,
    pub install_order: Vec<Id>,
    pub predecessors: BTreeMap<String, BTreeSet<String>>,
    replay_i: usize,
    replay_installed: Vec<Box3>,
    nominal_blockers: BTreeMap<String, BTreeSet<String>>,
    blockers: BTreeMap<String, BTreeSet<String>>,
    block_sweep_ready: bool,
    block_sweep: Option<Box3>,
    cyclic_blockers: bool,
    assigned_count: u32,
    provisional_count: u32,
    unassigned_count: u32,
    unknown_quantity_items: u32,
    cost: CostAccumulator,
    variant_ids: Vec<String>,
    variants_ready: bool,
}

impl CheckDrive {
    pub(crate) fn new() -> Self {
        Self {
            checks: Checks(vec![]),
            section: 0,
            i: 0,
            j: 0,
            k: 0,
            basis: 0,
            done: false,
            sweep_ready: false,
            sweep: None,
            saved_preds: BTreeMap::new(),
            kahn_preds: BTreeMap::new(),
            kahn_remaining: BTreeSet::new(),
            kahn_started: false,
            insertion_unknown: false,
            cyclic: false,
            blocked: false,
            install_order: vec![],
            predecessors: BTreeMap::new(),
            replay_i: 0,
            replay_installed: vec![],
            nominal_blockers: BTreeMap::new(),
            blockers: BTreeMap::new(),
            block_sweep_ready: false,
            block_sweep: None,
            cyclic_blockers: false,
            assigned_count: 0,
            provisional_count: 0,
            unassigned_count: 0,
            unknown_quantity_items: 0,
            cost: CostAccumulator::default(),
            variant_ids: vec![],
            variants_ready: false,
        }
    }

    pub(crate) fn quantum_class(&self) -> DriveQuantum {
        if self.section >= QTY_ASSIGN {
            DriveQuantum::Quantity
        } else {
            DriveQuantum::Independent
        }
    }

    pub(crate) fn step(
        &mut self,
        input: &ProjectInput,
        catalog: &CatalogContent,
        layout: &CandidateLayout,
    ) -> Option<DriveQuantum> {
        let scratch = Scratch::build(input, catalog, layout);
        loop {
            if self.section > 31 {
                self.done = true;
                return None;
            }
            let class = if self.section >= QTY_ASSIGN {
                DriveQuantum::Quantity
            } else {
                DriveQuantum::Independent
            };
            if self.dispatch(&scratch) {
                return Some(class);
            }
        }
    }

    pub(crate) fn finish(
        self,
        input: &ProjectInput,
        _catalog: &CatalogContent,
        layout: &CandidateLayout,
    ) -> super::CandidateValidation {
        let purchases = layout
            .placements
            .iter()
            .any(|p| matches!(p.subject, PlacementSubject::NewContainer { .. }));
        let mut physical_fail = false;
        let mut physical_unknown = false;
        let mut commerce_all_pass = true;
        for check in &self.checks.0 {
            if physical_kind(&check.kind) {
                match check.status {
                    CheckStatus::Fail => physical_fail = true,
                    CheckStatus::Unknown => physical_unknown = true,
                    _ => {}
                }
            } else if !matches!(check.status, CheckStatus::Pass | CheckStatus::NotApplicable) {
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
        let commerce_readiness = if !purchases {
            CommerceReadiness::NotApplicable
        } else if commerce_all_pass {
            CommerceReadiness::Ready
        } else {
            CommerceReadiness::Conditional
        };
        let _ = input;
        super::CandidateValidation {
            report: ValidationReport {
                checks: self.checks.0,
                physical_assurance,
                assignment_completeness: AssignmentCompleteness {
                    assigned_instances: UnitCount::new(self.assigned_count).expect("bounded"),
                    provisional_instances: UnitCount::new(self.provisional_count).expect("bounded"),
                    unassigned_instances: UnitCount::new(self.unassigned_count).expect("bounded"),
                    unknown_quantity_items: UnitCount::new(self.unknown_quantity_items)
                        .expect("bounded"),
                },
                commerce_readiness,
            },
            install_order: self.install_order,
            predecessors: self.predecessors,
        }
    }

    fn advance(&mut self) {
        self.section += 1;
        self.i = 0;
        self.j = 0;
        self.k = 0;
        self.basis = 0;
    }

    fn dispatch(&mut self, s: &Scratch<'_>) -> bool {
        match self.section {
            0 => self.unresolvable(s),
            1 => self.orientation(s),
            2 => self.outer(s),
            3 => self.sibling(s),
            4 => self.obstacle(s),
            5 => self.support(s),
            6 => self.cavity(s),
            7 => self.load_floor(s),
            8 => self.load_cavity(s),
            9 => self.load_staging(s),
            10 => self.insert_geom(s),
            11 => self.insert_pairs(s),
            12 => self.kahn(s),
            13 => self.replay(s),
            14 => self.order_emit(s),
            15 => self.block_pairs(s, false),
            16 => self.block_pairs(s, true),
            17 => self.block_cycle(s),
            18 => self.access(s),
            19 => self.retrieval(s),
            20 => self.compat_group(s),
            21 => self.compat_item(s),
            22 => self.compat_mand(s),
            23 => self.compat_zone(s),
            24 => self.compat_model(s),
            25 => self.commercial(s),
            26 => self.budget_hard(s),
            27 => self.budget_soft(s),
            28 => self.qty_assign(s),
            29 => self.qty_unassigned(s),
            30 => self.qty_partition(s),
            31 => self.qty_owned(s),
            _ => {
                self.done = true;
                false
            }
        }
    }

    fn emit_basis(
        &mut self,
        base: &str,
        kind: CheckKind,
        subjects: Vec<Id>,
        nominal: Verdict,
        conservative: Verdict,
        measurements: Vec<CheckMeasurement>,
    ) -> bool {
        let (basis, verdict, suffix) = if self.basis == 0 {
            (CheckBasis::Nominal, nominal, "n")
        } else {
            (CheckBasis::Conservative, conservative, "c")
        };
        self.checks.emit(
            format!("{base}:{suffix}"),
            kind,
            verdict,
            subjects,
            basis,
            measurements,
        );
        if self.basis == 0 {
            self.basis = 1;
        } else {
            self.basis = 0;
            return false;
        }
        true
    }

    fn unresolvable(&mut self, s: &Scratch<'_>) -> bool {
        let Some(placement) = s.unresolvable.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        self.checks.emit(
            format!("subj:{}", placement.id.as_str()),
            CheckKind::Compatibility,
            VUnknown("subject_unresolvable"),
            vec![placement.id.clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
        true
    }

    fn orientation(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        let verdict = match r.orientations().value() {
            Some(allowed) if allowed.contains(&r.placement.orientation) => Pass,
            Some(_) => Fail("orientation_forbidden"),
            None => VUnknown("orientations_unknown"),
        };
        self.checks.emit(
            format!("or:{}", r.id().as_str()),
            CheckKind::Orientation,
            verdict,
            vec![r.id().clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
        true
    }

    fn outer(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        let pos = position(&r.placement.position);
        let wall = &s.wall;
        let nominal = match (r.nominal_extent(), (wall.l, wall.r, wall.f, wall.b, wall.t)) {
            (Some(extent), (Some(l), Some(rt), Some(f), Some(b), Some(t))) => {
                match s.nominal_interior {
                    [Some(w), Some(d), Some(h)] => {
                        containment_verdict(pos, extent, [w, d, h], [l, rt, f, b, t])
                    }
                    _ => VUnknown("interior_unknown"),
                }
            }
            _ => VUnknown("fact_unknown"),
        };
        let conservative = match (
            r.occupied_extent(),
            s.interior_conservative,
            (wall.l, wall.r, wall.f, wall.b, wall.t),
        ) {
            (Some(extent), Some(interior), (Some(l), Some(rt), Some(f), Some(b), Some(t))) => {
                containment_verdict(pos, extent, interior, [l, rt, f, b, t])
            }
            _ => VUnknown("fact_unknown"),
        };
        let more = self.emit_basis(
            &format!("og:{}", r.id().as_str()),
            CheckKind::OuterGeometry,
            vec![r.id().clone()],
            nominal,
            conservative,
            vec![],
        );
        if !more {
            self.i += 1;
        }
        true
    }

    fn sibling(&mut self, s: &Scratch<'_>) -> bool {
        let n = s.resolved.len();
        if self.i >= n {
            self.advance();
            return false;
        }
        if self.j <= self.i {
            self.j = self.i + 1;
        }
        if self.j >= n {
            self.i += 1;
            self.j = 0;
            self.basis = 0;
            return false;
        }
        let a = &s.resolved[self.i];
        let b = &s.resolved[self.j];
        let nominal = match (a.nominal_box(), b.nominal_box(), s.wall.between) {
            (Some(a), Some(b), gap) => separation_verdict(&a, &b, gap),
            _ => VUnknown("fact_unknown"),
        };
        let conservative = match (a.occupied_box(), b.occupied_box(), s.wall.between) {
            (Some(a), Some(b), gap) => separation_verdict(&a, &b, gap),
            _ => VUnknown("fact_unknown"),
        };
        let more = self.emit_basis(
            &format!("ogp:{}:{}", a.id().as_str(), b.id().as_str()),
            CheckKind::OuterGeometry,
            vec![a.id().clone(), b.id().clone()],
            nominal,
            conservative,
            vec![],
        );
        if !more {
            self.j += 1;
        }
        true
    }

    fn obstacle(&mut self, s: &Scratch<'_>) -> bool {
        let obstacles = s.physical_obstacles();
        if self.i >= s.resolved.len() {
            self.advance();
            return false;
        }
        if self.j >= obstacles.len() {
            self.i += 1;
            self.j = 0;
            self.basis = 0;
            return false;
        }
        let r = &s.resolved[self.i];
        let obstacle = obstacles[self.j];
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
        let more = self.emit_basis(
            &format!("ogo:{}:{}", r.id().as_str(), obstacle.id.as_str()),
            CheckKind::OuterGeometry,
            vec![r.id().clone(), obstacle.id.clone()],
            nominal,
            conservative,
            vec![],
        );
        if !more {
            self.j += 1;
        }
        true
    }

    fn support(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        let more = self.emit_basis(
            &format!("sg:{}", r.id().as_str()),
            CheckKind::SupportGeometry,
            vec![r.id().clone()],
            support_verdict(r, &s.input.space.support, false),
            support_verdict(r, &s.input.space.support, true),
            vec![],
        );
        if !more {
            self.i += 1;
        }
        true
    }

    fn cavity(&mut self, s: &Scratch<'_>) -> bool {
        loop {
            let Some(r) = s.resolved.get(self.i) else {
                self.advance();
                return false;
            };
            let Some(dims) = r.container_dims() else {
                self.i += 1;
                self.sub_reset();
                continue;
            };
            let children = s.children(r.id().as_str());
            let has_provisional = s
                .provisional
                .get(r.id().as_str())
                .is_some_and(|v| !v.is_empty());
            if self.k == 0 {
                if children.is_empty() && !has_provisional {
                    match (
                        cavity_consistency(dims, false),
                        cavity_consistency(dims, true),
                    ) {
                        (Fail(reason), _) | (_, Fail(reason)) => {
                            let more = self.emit_basis(
                                &format!("ic:{}", r.id().as_str()),
                                CheckKind::InnerCapacity,
                                vec![r.id().clone()],
                                Fail(reason),
                                Fail(reason),
                                vec![],
                            );
                            if !more {
                                self.i += 1;
                                self.sub_reset();
                            }
                            return true;
                        }
                        _ => {
                            self.checks.emit(
                                format!("ic:{}:x", r.id().as_str()),
                                CheckKind::InnerCapacity,
                                NotApplicable("empty_cavity"),
                                vec![r.id().clone()],
                                CheckBasis::NonGeometric,
                                vec![],
                            );
                            self.i += 1;
                            self.sub_reset();
                            return true;
                        }
                    }
                }
                let nominal = cavity_capacity(dims, &children, false);
                let mut conservative = cavity_capacity(dims, &children, true);
                if has_provisional && !matches!(conservative, Fail(_)) {
                    conservative = VUnknown("provisional_contents");
                }
                let more = self.emit_basis(
                    &format!("ic:{}", r.id().as_str()),
                    CheckKind::InnerCapacity,
                    vec![r.id().clone()],
                    nominal,
                    conservative,
                    vec![],
                );
                if !more {
                    self.k = 1;
                    self.j = 0;
                    self.basis = 0;
                }
                return true;
            }
            if self.k == 1 {
                if self.j >= children.len() {
                    self.k = 2;
                    self.j = 0;
                    self.basis = 0;
                    continue;
                }
                let count = children.len();
                let linear = self.j;
                let mut a_i = 0usize;
                let mut b_i = 1usize;
                let mut seen = 0usize;
                while a_i < count {
                    if b_i >= count {
                        a_i += 1;
                        b_i = a_i + 1;
                        continue;
                    }
                    if seen == linear {
                        break;
                    }
                    seen += 1;
                    b_i += 1;
                }
                if a_i >= count {
                    self.k = 2;
                    self.j = 0;
                    self.basis = 0;
                    continue;
                }
                let a = &children[a_i];
                let b = &children[b_i];
                let between = clearance(&dims.cavity_clearances.between_items);
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
                let more = self.emit_basis(
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
                if !more {
                    self.j += 1;
                }
                return true;
            }
            // child support and orientation
            match &dims.inner_support {
                Fact::Known { value: floor, .. } => {
                    if self.j >= children.len() {
                        self.i += 1;
                        self.sub_reset();
                        continue;
                    }
                    let child = &children[self.j];
                    if self.basis < 2 {
                        let correct_ref = child.local.support_id == floor.id;
                        let (nominal, conservative) = if !correct_ref {
                            (Fail("unsupported_support"), Fail("unsupported_support"))
                        } else {
                            (
                                child_support_verdict(child, floor, false),
                                child_support_verdict(child, floor, true),
                            )
                        };
                        let basis_now = self.basis;
                        let more = self.emit_basis(
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
                        if !more {
                            self.basis = 2;
                        } else if basis_now == 0 {
                            // emit_basis already set basis to 1
                        }
                        return true;
                    }
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
                    self.checks.emit(
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
                    self.j += 1;
                    self.basis = 0;
                    return true;
                }
                _ if !children.is_empty() => {
                    self.checks.emit_raw(
                        format!("sgc:{}:x", r.id().as_str()),
                        CheckKind::SupportGeometry,
                        CheckStatus::Unknown,
                        vec![r.id().clone()],
                        CheckBasis::NonGeometric,
                        "cavity_floor_unknown",
                        vec![],
                    );
                    self.i += 1;
                    self.sub_reset();
                    return true;
                }
                _ => {
                    self.i += 1;
                    self.sub_reset();
                    continue;
                }
            }
        }
    }

    fn sub_reset(&mut self) {
        self.j = 0;
        self.k = 0;
        self.basis = 0;
    }

    fn load_check(
        &mut self,
        id: String,
        subjects: Vec<Id>,
        total: Option<u64>,
        limit: Option<u64>,
        unknown_reason: &'static str,
    ) {
        let verdict = match (total, limit) {
            (Some(t), Some(l)) if t <= l => Pass,
            (Some(_), Some(_)) => Fail("load_exceeded"),
            (Some(_), None) => VUnknown(unknown_reason),
            (None, _) => VUnknown("mass_unknown"),
        };
        self.checks.emit(
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
    }

    fn load_floor(&mut self, s: &Scratch<'_>) -> bool {
        let mut total = Some(0u64);
        for r in &s.resolved {
            total = total.and_then(|t| s.unit_mass(r).and_then(|m| t.checked_add(m)));
        }
        self.load_check(
            format!("ld:floor:{}", s.input.space.id.as_str()),
            vec![s.input.space.id.clone()],
            total,
            s.input
                .space
                .support
                .load_limit
                .value()
                .map(|m| m.get() as u64),
            "load_limit_unknown",
        );
        self.advance();
        true
    }

    fn load_cavity(&mut self, s: &Scratch<'_>) -> bool {
        loop {
            let Some(r) = s.resolved.get(self.i) else {
                self.advance();
                return false;
            };
            self.i += 1;
            let Some(dims) = r.container_dims() else {
                continue;
            };
            if !s.contained.contains_key(r.id().as_str())
                && !s.provisional.contains_key(r.id().as_str())
            {
                continue;
            }
            self.load_check(
                format!("ld:cavity:{}", r.id().as_str()),
                vec![r.id().clone()],
                s.contents_mass(r.id().as_str()),
                dims.inner_support
                    .value()
                    .and_then(|sup| sup.load_limit.value())
                    .map(|m| m.get() as u64),
                "load_limit_unknown",
            );
            return true;
        }
    }

    fn load_staging(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        self.load_check(
            format!("ld:staging:{}", r.id().as_str()),
            vec![r.id().clone()],
            s.unit_mass(r),
            s.input
                .space
                .staging
                .base_support
                .value()
                .and_then(|sup| sup.load_limit.value())
                .map(|m| m.get() as u64),
            "staging_support_unknown",
        );
        true
    }

    fn insert_geom(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        let measurements = vec![
            measurement(
                "pullDepthRequiredMm",
                r.occupied_extent()
                    .and_then(|e| r.margins().pull.map(|p| e[1] + p)),
            ),
            measurement(
                "stagingDepthAvailableMm",
                s.staging_guaranteed.map(|g| -g.min[1]),
            ),
        ];
        let more = self.emit_basis(
            &format!("ip:{}", r.id().as_str()),
            CheckKind::InstallationPath,
            vec![r.id().clone()],
            s.insertion_verdict(r, false),
            s.insertion_verdict(r, true),
            measurements,
        );
        if !more {
            self.i += 1;
        }
        true
    }

    fn insert_pairs(&mut self, s: &Scratch<'_>) -> bool {
        let n = s.resolved.len();
        loop {
            if self.i >= n {
                self.advance();
                return false;
            }
            if !self.sweep_ready {
                match s.insertion_sweep(&s.resolved[self.i], true) {
                    None => {
                        self.insertion_unknown = true;
                        self.i += 1;
                        self.j = 0;
                        return true;
                    }
                    Some((_, sweep)) => {
                        self.sweep = Some(sweep);
                        self.sweep_ready = true;
                        self.j = 0;
                    }
                }
            }
            if self.j == self.i {
                self.j += 1;
            }
            if self.j >= n {
                self.i += 1;
                self.j = 0;
                self.sweep_ready = false;
                self.sweep = None;
                continue;
            }
            let b = &s.resolved[self.i];
            let a = &s.resolved[self.j];
            let Some(volume) = a.occupied_box() else {
                self.insertion_unknown = true;
                self.j += 1;
                return true;
            };
            if self.sweep.is_some_and(|sweep| sweep.intersects(&volume)) {
                self.saved_preds
                    .entry(a.id().as_str().to_owned())
                    .or_default()
                    .insert(b.id().as_str().to_owned());
            }
            self.j += 1;
            return true;
        }
    }

    fn kahn(&mut self, s: &Scratch<'_>) -> bool {
        if !self.kahn_started {
            self.kahn_remaining = s
                .resolved
                .iter()
                .map(|r| r.id().as_str().to_owned())
                .collect();
            self.kahn_preds = self.saved_preds.clone();
            self.kahn_started = true;
        }
        if self.kahn_remaining.is_empty() || self.cyclic {
            self.advance();
            return false;
        }
        let Some(next) = self
            .kahn_remaining
            .iter()
            .find(|id| self.kahn_preds.get(*id).is_none_or(|deps| deps.is_empty()))
            .cloned()
        else {
            self.cyclic = true;
            self.advance();
            return true;
        };
        self.kahn_remaining.remove(&next);
        for deps in self.kahn_preds.values_mut() {
            deps.remove(&next);
        }
        self.install_order
            .push(Id::new(&next).expect("placement id"));
        true
    }

    fn replay(&mut self, s: &Scratch<'_>) -> bool {
        if self.cyclic || self.insertion_unknown {
            self.advance();
            return false;
        }
        if self.replay_i >= self.install_order.len() {
            self.advance();
            return false;
        }
        let id = &self.install_order[self.replay_i];
        let r = s
            .resolved
            .iter()
            .find(|r| r.id().as_str() == id.as_str())
            .expect("order id");
        match (s.insertion_sweep(r, true), r.occupied_box()) {
            (Some((_, sweep)), Some(volume)) => {
                if self.replay_installed.iter().any(|v| sweep.intersects(v)) {
                    self.blocked = true;
                }
                self.replay_installed.push(volume);
            }
            _ => self.insertion_unknown = true,
        }
        self.replay_i += 1;
        true
    }

    fn order_emit(&mut self, s: &Scratch<'_>) -> bool {
        let verdict = if self.cyclic {
            Fail("insertion_cycle")
        } else if self.blocked {
            Fail("insertion_order_unsupported")
        } else if self.insertion_unknown {
            VUnknown("order_unverifiable")
        } else {
            Pass
        };
        self.checks.emit(
            "io:order".into(),
            CheckKind::InstallationPath,
            verdict,
            s.resolved.iter().map(|r| r.id().clone()).collect(),
            CheckBasis::Conservative,
            vec![],
        );
        if matches!(verdict, Pass) {
            self.predecessors = self.saved_preds.clone();
        } else {
            self.install_order.clear();
            self.predecessors.clear();
        }
        self.advance();
        true
    }

    fn block_pairs(&mut self, s: &Scratch<'_>, conservative: bool) -> bool {
        let n = s.resolved.len();
        let map = if conservative {
            &mut self.blockers
        } else {
            &mut self.nominal_blockers
        };
        loop {
            if self.i >= n {
                self.block_sweep_ready = false;
                self.block_sweep = None;
                self.advance();
                return false;
            }
            if !self.block_sweep_ready {
                match s.insertion_sweep(&s.resolved[self.i], conservative) {
                    None => {
                        self.i += 1;
                        self.j = 0;
                        return true;
                    }
                    Some((_, sweep)) => {
                        self.block_sweep = Some(sweep);
                        self.block_sweep_ready = true;
                        self.j = 0;
                    }
                }
            }
            if self.j == self.i {
                self.j += 1;
            }
            if self.j >= n {
                self.i += 1;
                self.j = 0;
                self.block_sweep_ready = false;
                self.block_sweep = None;
                continue;
            }
            let other = &s.resolved[self.j];
            let volume = if conservative {
                other.occupied_box()
            } else {
                other.nominal_box()
            };
            if let Some(volume) = volume
                && self
                    .block_sweep
                    .is_some_and(|sweep| sweep.intersects(&volume))
            {
                map.entry(s.resolved[self.i].id().as_str().to_owned())
                    .or_default()
                    .insert(other.id().as_str().to_owned());
            }
            self.j += 1;
            return true;
        }
    }

    fn block_cycle(&mut self, s: &Scratch<'_>) -> bool {
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
        for key in self.blockers.keys() {
            if visit(key, &self.blockers, &mut color) {
                self.cyclic_blockers = true;
            }
        }
        let _ = s;
        self.advance();
        true
    }

    fn access(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        let verdict = |conservative: bool| -> Verdict {
            let Some((_, sweep)) = s.insertion_sweep(r, conservative) else {
                return VUnknown("fact_unknown");
            };
            for obstacle in &s.input.space.obstacles {
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
            match s.staging_verdict(&sweep, conservative) {
                Pass => {}
                other => return other,
            }
            let blocked_by = if conservative {
                self.blockers
                    .get(r.id().as_str())
                    .cloned()
                    .unwrap_or_default()
            } else {
                self.nominal_blockers
                    .get(r.id().as_str())
                    .cloned()
                    .unwrap_or_default()
            };
            if !blocked_by.is_empty() {
                if s.input.constraints.hard_one_action_access {
                    return Fail("one_action_blocked");
                }
                if self.cyclic_blockers {
                    return Fail("cyclic_blockers");
                }
                return VUnknown("temporary_parking_unsupported");
            }
            Pass
        };
        let measurements = vec![measurement(
            "blockerCount",
            self.blockers.get(r.id().as_str()).map(|b| b.len() as i64),
        )];
        let more = self.emit_basis(
            &format!("oa:{}", r.id().as_str()),
            CheckKind::OperationalAccess,
            vec![r.id().clone()],
            verdict(false),
            verdict(true),
            measurements,
        );
        if !more {
            self.i += 1;
        }
        true
    }

    fn retrieval(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        let base_id = format!("oac:{}:x", r.id().as_str());
        if !r.is_container() {
            self.checks.emit_raw(
                base_id,
                CheckKind::OperationalAccess,
                CheckStatus::NotApplicable,
                vec![r.id().clone()],
                CheckBasis::NonGeometric,
                "direct_extraction_no_rim_lift",
                vec![],
            );
            return true;
        }
        let dims = r.container_dims().expect("container");
        let children = s.children(r.id().as_str());
        let has_provisional = s
            .provisional
            .get(r.id().as_str())
            .is_some_and(|v| !v.is_empty());
        if children.is_empty() && !has_provisional {
            self.checks.emit_raw(
                base_id,
                CheckKind::OperationalAccess,
                CheckStatus::NotApplicable,
                vec![r.id().clone()],
                CheckBasis::NonGeometric,
                "empty_cavity",
                vec![],
            );
            return true;
        }
        if has_provisional {
            self.checks.emit_raw(
                base_id,
                CheckKind::OperationalAccess,
                CheckStatus::Unknown,
                vec![r.id().clone()],
                CheckBasis::NonGeometric,
                "provisional_contents",
                vec![],
            );
            return true;
        }
        let container_margins = r.margins();
        let mut verdict = Pass;
        for child in &children {
            let margins = super::EffectiveMargins::merged(
                super::EffectiveMargins::of(&child.item.requirement.handling),
                container_margins,
            );
            let current = retrieval_child(s, r, dims, child, margins);
            match (verdict, current) {
                (Fail(_), _) => {}
                (_, Fail(reason)) => verdict = Fail(reason),
                (VUnknown(_), _) => {}
                (_, v @ VUnknown(_)) => verdict = v,
                _ => {}
            }
        }
        self.checks.emit_raw(
            base_id,
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
        true
    }

    fn compat_group(&mut self, s: &Scratch<'_>) -> bool {
        loop {
            let Some(group) = s.input.groups.get(self.i) else {
                self.advance();
                return false;
            };
            self.i += 1;
            if !matches!(group.split_policy, GroupSplitPolicy::OneTarget) {
                continue;
            }
            let (targets, unknown) = s.targets_for(|id| group.item_ids.contains(id));
            self.checks.emit(
                format!("cp:group:{}", group.id.as_str()),
                CheckKind::Compatibility,
                target_verdict(&targets, unknown, "one_target_violation"),
                vec![group.id.clone()],
                CheckBasis::NonGeometric,
                vec![],
            );
            return true;
        }
    }

    fn compat_item(&mut self, s: &Scratch<'_>) -> bool {
        loop {
            let Some(item) = s.input.items.get(self.i) else {
                self.advance();
                return false;
            };
            self.i += 1;
            if !item.requirement.must_stay_together {
                continue;
            }
            let (targets, unknown) = s.targets_for(|id| id == &item.id);
            self.checks.emit(
                format!("cp:item:{}", item.id.as_str()),
                CheckKind::Compatibility,
                target_verdict(&targets, unknown, "must_stay_together_violation"),
                vec![item.id.clone()],
                CheckBasis::NonGeometric,
                vec![],
            );
            return true;
        }
    }

    fn compat_mand(&mut self, s: &Scratch<'_>) -> bool {
        loop {
            let Some(item) = s.input.items.get(self.i) else {
                self.advance();
                return false;
            };
            if self.j >= item.requirement.mandatory_compatibility.len() {
                self.i += 1;
                self.j = 0;
                continue;
            }
            let other = &item.requirement.mandatory_compatibility[self.j];
            self.j += 1;
            let (targets, unknown) = s.targets_for(|id| id == &item.id || id == other);
            self.checks.emit(
                format!("cp:compat:{}:{}", item.id.as_str(), other.as_str()),
                CheckKind::Compatibility,
                target_verdict(&targets, unknown, "compatibility_split"),
                vec![item.id.clone(), other.clone()],
                CheckBasis::NonGeometric,
                vec![],
            );
            return true;
        }
    }

    fn compat_zone(&mut self, s: &Scratch<'_>) -> bool {
        loop {
            let Some(locked) = s.input.constraints.locked_zones.get(self.i) else {
                self.advance();
                return false;
            };
            self.i += 1;
            if !matches!(locked.zone.kind, ZoneKind::HardLocked) {
                continue;
            }
            let Some(group) = s.input.groups.iter().find(|g| g.id == locked.group_id) else {
                continue;
            };
            let bounds = zone_bounds(&locked.zone);
            let mut subjects: Vec<Id> = vec![];
            let mut verdict = Pass;
            for assignment in &s.layout.assignments {
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
                let Some(r) = s
                    .resolved
                    .iter()
                    .find(|r| r.id().as_str() == placement_id.as_str())
                else {
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
            self.checks.emit(
                format!("cp:zone:{}", locked.group_id.as_str()),
                CheckKind::Compatibility,
                verdict,
                subjects,
                CheckBasis::NonGeometric,
                vec![],
            );
            return true;
        }
    }

    fn compat_model(&mut self, s: &Scratch<'_>) -> bool {
        let Some(r) = s.resolved.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
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
        self.checks.emit(
            format!("cp:model:{}", r.id().as_str()),
            CheckKind::Compatibility,
            verdict,
            vec![r.id().clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
        true
    }

    fn ensure_variants(&mut self, s: &Scratch<'_>) {
        if self.variants_ready {
            return;
        }
        self.variant_ids = s.by_variant.keys().map(|k| (*k).to_owned()).collect();
        self.variants_ready = true;
    }

    fn commercial(&mut self, s: &Scratch<'_>) -> bool {
        self.ensure_variants(s);
        let Some(variant_id) = self.variant_ids.get(self.i) else {
            self.advance();
            return false;
        };
        let placements = &s.by_variant[variant_id.as_str()];
        let selection = s
            .layout
            .purchase_selections
            .iter()
            .find(|sel| sel.placement_id.as_str() == placements[0].id.as_str());
        let offer = selection.and_then(|sel| match &sel.offer {
            OfferSelection::Selected { offer_id } => s.offers.get(offer_id.as_str()).copied(),
            OfferSelection::Unresolved { .. } => None,
        });
        if self.basis == 0 {
            self.cost.add_line(offer, placements.len() as u64);
        }
        let subjects = vec![Id::new(variant_id).expect("variant id")];
        let unresolved = !matches!(
            selection.map(|sel| &sel.offer),
            Some(OfferSelection::Selected { .. })
        );
        let bundle = offer.is_some_and(|o| !o.bundle_components.is_empty());
        let (id, kind, verdict) = match self.basis {
            0 => {
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
                (format!("inv:{variant_id}"), CheckKind::Inventory, inventory)
            }
            1 => {
                let price = if unresolved {
                    VUnknown("offer_unresolved")
                } else if bundle {
                    Fail("bundle_unsupported")
                } else if offer.is_some_and(|o| {
                    o.pack_price.value().is_some() && o.pack_quantity.value().is_some()
                }) {
                    Pass
                } else {
                    VUnknown("price_unknown")
                };
                (format!("pr:{variant_id}"), CheckKind::Price, price)
            }
            _ => {
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
                (format!("sh:{variant_id}"), CheckKind::Shipping, shipping)
            }
        };
        self.checks.emit(
            id,
            kind,
            verdict,
            subjects,
            CheckBasis::NonGeometric,
            vec![],
        );
        if self.basis < 2 {
            self.basis += 1;
        } else {
            self.basis = 0;
            self.i += 1;
        }
        true
    }

    fn budget_hard(&mut self, s: &Scratch<'_>) -> bool {
        let purchases = !s.by_variant.is_empty();
        if purchases && !s.input.constraints.purchase_allowed {
            self.checks.emit(
                "bg:hard".into(),
                CheckKind::Budget,
                Fail("purchase_disallowed"),
                vec![],
                CheckBasis::NonGeometric,
                vec![],
            );
        } else {
            let verdict = match (
                self.cost.grand_total(),
                s.input.constraints.hard_budget.value(),
            ) {
                _ if !purchases => NotApplicable("no_purchases"),
                (Some(total), Some(limit)) if total <= limit.get() => Pass,
                (Some(_), Some(_)) => Fail("hard_budget_exceeded"),
                (None, _) => VUnknown("total_unknown"),
                (Some(_), None) => VUnknown("budget_unknown"),
            };
            self.checks.emit(
                "bg:hard".into(),
                CheckKind::Budget,
                verdict,
                vec![],
                CheckBasis::NonGeometric,
                vec![],
            );
        }
        self.advance();
        true
    }

    fn budget_soft(&mut self, s: &Scratch<'_>) -> bool {
        if s.by_variant.is_empty() {
            self.advance();
            return false;
        }
        let verdict = match (
            self.cost.grand_total(),
            s.input.constraints.soft_budget.value(),
        ) {
            (Some(total), Some(limit)) if total <= limit.get() => Pass,
            (Some(_), Some(_)) => Fail("soft_budget_exceeded"),
            _ => VUnknown("fact_unknown"),
        };
        self.checks.emit(
            "bg:soft".into(),
            CheckKind::Budget,
            verdict,
            vec![],
            CheckBasis::NonGeometric,
            vec![],
        );
        self.advance();
        true
    }

    fn qty_assign(&mut self, s: &Scratch<'_>) -> bool {
        let Some(assignment) = s.layout.assignments.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        match &assignment.location {
            ItemLocation::ProvisionalContainer { .. } => self.provisional_count += 1,
            _ => self.assigned_count += 1,
        }
        true
    }

    fn qty_unassigned(&mut self, s: &Scratch<'_>) -> bool {
        let Some(entry) = s.layout.unassigned.get(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        match &entry.instances {
            UnassignedInstances::Known { ranges } => {
                for range in ranges {
                    self.unassigned_count += range.end_exclusive - range.start;
                }
            }
            UnassignedInstances::UnknownQuantity {} => self.unknown_quantity_items += 1,
        }
        true
    }

    fn qty_partition(&mut self, _s: &Scratch<'_>) -> bool {
        self.checks.emit(
            "qc:partition".into(),
            CheckKind::QuantityConservation,
            Pass,
            vec![],
            CheckBasis::NonGeometric,
            vec![
                measurement("assignedInstances", Some(self.assigned_count as i64)),
                measurement("provisionalInstances", Some(self.provisional_count as i64)),
                measurement("unassignedInstances", Some(self.unassigned_count as i64)),
            ],
        );
        self.advance();
        true
    }

    fn qty_owned(&mut self, s: &Scratch<'_>) -> bool {
        let Some((owned_id, container)) = s.owned.iter().nth(self.i) else {
            self.advance();
            return false;
        };
        self.i += 1;
        let used: Vec<u32> = s
            .layout
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
            return true;
        }
        let verdict = match container.quantity_available.value() {
            Some(available) if used.iter().all(|o| *o < available.get()) => Pass,
            Some(_) => Fail("owned_overuse"),
            None => VUnknown("owned_availability_unknown"),
        };
        self.checks.emit(
            format!("qc:owned:{owned_id}"),
            CheckKind::QuantityConservation,
            verdict,
            vec![container.id.clone()],
            CheckBasis::NonGeometric,
            vec![],
        );
        true
    }
}

fn target_verdict(targets: &BTreeSet<String>, unknown: bool, reason: &'static str) -> Verdict {
    if unknown {
        VUnknown("fact_unknown")
    } else if targets.len() > 1 {
        Fail(reason)
    } else {
        Pass
    }
}

fn zone_bounds(zone: &Zone) -> Box3 {
    Box3::from_min_extent(
        position(&zone.bounds.min),
        [
            zone.bounds.extent.width.get() as i64,
            zone.bounds.extent.depth.get() as i64,
            zone.bounds.extent.height.get() as i64,
        ],
    )
}

fn cavity_consistency(dims: &VariantDimensions, conservative: bool) -> Verdict {
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
}

fn cavity_capacity(
    dims: &VariantDimensions,
    children: &[Contained<'_>],
    conservative: bool,
) -> Verdict {
    if let Fail(reason) = cavity_consistency(dims, conservative) {
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
    for child in children {
        let extent = if conservative {
            oriented_occupied_extent(&child.item.dimensions.envelope, child.local.orientation)
        } else {
            oriented_nominal_extent(&child.item.dimensions.envelope, child.local.orientation)
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
}

fn retrieval_child(
    s: &Scratch<'_>,
    r: &Resolved<'_>,
    dims: &VariantDimensions,
    child: &Contained<'_>,
    margins: super::EffectiveMargins,
) -> Verdict {
    let Some(outer_h) = occupied_length(&dims.outer.height) else {
        return VUnknown("fact_unknown");
    };
    let Some(item_extent) =
        oriented_occupied_extent(&child.item.dimensions.envelope, child.local.orientation)
    else {
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
    let Some(staging) = s.staging_guaranteed else {
        return VUnknown("staging_unknown");
    };
    let required = outer_h + item_extent[2] + lift + top;
    if staging.max[2] < required {
        return Fail("staging_height_insufficient");
    }
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
}

struct Wall {
    l: Option<i64>,
    r: Option<i64>,
    f: Option<i64>,
    b: Option<i64>,
    t: Option<i64>,
    between: Option<i64>,
}

struct Scratch<'a> {
    input: &'a ProjectInput,
    layout: &'a CandidateLayout,
    resolved: Vec<Resolved<'a>>,
    unresolvable: Vec<&'a Placement>,
    contained: BTreeMap<&'a str, Vec<Contained<'a>>>,
    provisional: BTreeMap<&'a str, Vec<&'a ItemAssignment>>,
    items: BTreeMap<&'a str, &'a Item>,
    owned: BTreeMap<&'a str, &'a OwnedContainer>,
    offers: BTreeMap<&'a str, &'a Offer>,
    by_variant: BTreeMap<&'a str, Vec<&'a Placement>>,
    wall: Wall,
    nominal_interior: [Option<i64>; 3],
    interior_conservative: Option<[i64; 3]>,
    staging_nominal: Option<Box3>,
    staging_guaranteed: Option<Box3>,
}

impl<'a> Scratch<'a> {
    fn build(
        input: &'a ProjectInput,
        catalog: &'a CatalogContent,
        layout: &'a CandidateLayout,
    ) -> Self {
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
        let resolved_ids: BTreeSet<&str> = resolved.iter().map(|r| r.id().as_str()).collect();
        let unresolvable = layout
            .placements
            .iter()
            .filter(|p| !resolved_ids.contains(p.id.as_str()))
            .collect();
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
        let mut by_variant: BTreeMap<&str, Vec<&Placement>> = BTreeMap::new();
        for placement in &layout.placements {
            if let PlacementSubject::NewContainer { variant_id, .. } = &placement.subject {
                by_variant
                    .entry(variant_id.as_str())
                    .or_default()
                    .push(placement);
            }
        }
        let space = &input.space;
        Self {
            input,
            layout,
            resolved,
            unresolvable,
            contained,
            provisional,
            items,
            owned,
            offers,
            by_variant,
            wall: Wall {
                l: clearance(&space.clearances.left),
                r: clearance(&space.clearances.right),
                f: clearance(&space.clearances.front),
                b: clearance(&space.clearances.back),
                t: clearance(&space.clearances.top),
                between: clearance(&space.clearances.between_units),
            },
            nominal_interior: [
                nominal_length(&space.interior.width),
                nominal_length(&space.interior.depth),
                nominal_length(&space.interior.height),
            ],
            interior_conservative: available_interior(&space.interior),
            staging_nominal: nominal_cuboid(&space.staging.free_volume),
            staging_guaranteed: guaranteed_cuboid(&space.staging.free_volume),
        }
    }

    fn children(&self, id: &str) -> Vec<Contained<'a>> {
        self.contained.get(id).cloned().unwrap_or_default()
    }

    fn physical_obstacles(&self) -> Vec<&'a Obstacle> {
        self.input
            .space
            .obstacles
            .iter()
            .filter(|o| matches!(o.role, ObstacleRole::PhysicalSolid))
            .collect()
    }

    fn item_mass(&self, item: &Item) -> Option<u64> {
        item.mass_each.value().map(|m| m.get() as u64)
    }

    fn contents_mass(&self, pid: &str) -> Option<u64> {
        let mut total = 0u64;
        for child in self.contained.get(pid).into_iter().flatten() {
            total = total.checked_add(self.item_mass(child.item)?)?;
        }
        for assignment in self.provisional.get(pid).into_iter().flatten() {
            let item = self.items.get(assignment.item_id.as_str())?;
            total = total.checked_add(self.item_mass(item)?)?;
        }
        Some(total)
    }

    fn unit_mass(&self, r: &Resolved<'_>) -> Option<u64> {
        let own = r.mass().value().map(|m| m.get() as u64)?;
        if r.is_container() {
            own.checked_add(self.contents_mass(r.id().as_str())?)
        } else {
            Some(own)
        }
    }

    fn insertion_sweep(&self, r: &Resolved<'_>, conservative: bool) -> Option<(Box3, Box3)> {
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
    }

    fn staging_verdict(&self, sweep: &Box3, conservative: bool) -> Verdict {
        let staging = if conservative {
            match self.staging_guaranteed {
                Some(v) => v,
                None => return VUnknown("staging_unknown"),
            }
        } else {
            match self.staging_nominal {
                Some(v) => v,
                None => return VUnknown("staging_unknown"),
            }
        };
        let base = nominal_region(
            &self.input.space.staging.free_volume.min_z,
            &self.input.space.staging.free_volume.extent.height,
        );
        match base {
            Some(base) if base.lo != 0 => return Fail("unsupported_vertical_motion"),
            None => return VUnknown("staging_unknown"),
            _ => {}
        }
        if conservative && staging.min[2] > 0 {
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
    }

    fn insertion_verdict(&self, r: &Resolved<'_>, conservative: bool) -> Verdict {
        let Some((at_final, sweep)) = self.insertion_sweep(r, conservative) else {
            return VUnknown("fact_unknown");
        };
        let opening = &self.input.space.opening;
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
        match self.staging_verdict(&sweep, conservative) {
            Pass => {}
            other => return other,
        }
        for obstacle in &self.input.space.obstacles {
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
    }

    fn targets_for(&self, mut keep: impl FnMut(&Id) -> bool) -> (BTreeSet<String>, bool) {
        let mut targets = BTreeSet::new();
        let mut unknown = false;
        for assignment in &self.layout.assignments {
            if keep(&assignment.item_id) {
                match self.target_of(assignment) {
                    Some(target) => {
                        targets.insert(target);
                    }
                    None => unknown = true,
                }
            }
        }
        (targets, unknown)
    }

    fn target_of(&self, assignment: &ItemAssignment) -> Option<String> {
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
                let placement = self
                    .layout
                    .placements
                    .iter()
                    .find(|p| p.id.as_str() == placement_id.as_str())?;
                let r = self
                    .resolved
                    .iter()
                    .find(|r| r.id().as_str() == placement_id.as_str())?;
                let zone = self.input.constraints.locked_zones.iter().find(|locked| {
                    let bounds = zone_bounds(&locked.zone);
                    r.nominal_box().is_some_and(|b| bounds.contains(&b))
                });
                let space_id = match &placement.parent {
                    ParentRef::Space { space_id } => space_id.as_str(),
                    ParentRef::Container { placement_id } => placement_id.as_str(),
                };
                Some(format!(
                    "direct:{}",
                    zone.map(|z| z.zone.id.as_str()).unwrap_or(space_id)
                ))
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn run_checks(
    input: &ProjectInput,
    catalog: &CatalogContent,
    layout: &CandidateLayout,
) -> super::CandidateValidation {
    let mut drive = CheckDrive::new();
    while drive.step(input, catalog, layout).is_some() {}
    drive.finish(input, catalog, layout)
}

#[cfg(test)]
mod tests {
    use super::super::validate_candidate;
    use super::run_checks;

    fn load(
        name: &str,
    ) -> Option<(
        crate::input::ProjectInput,
        crate::canonical::CatalogContent,
        crate::plan::CandidateLayout,
    )> {
        let path = format!(
            "{}/../../fixtures/domain/{name}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
        let value: serde_json::Value = serde_json::from_str(&text).expect("json");
        let input = serde_json::from_value(value["input"]["input"].clone())
            .unwrap_or_else(|e| panic!("{name} input: {e}"));
        let snapshot: crate::catalog::CatalogSnapshot =
            serde_json::from_value(value["input"]["catalog"].clone())
                .unwrap_or_else(|e| panic!("{name} catalog: {e}"));
        let catalog = crate::canonical::CatalogContent::from(&snapshot);
        let proposal: crate::plan::CandidateProposal =
            serde_json::from_value(value["input"]["proposal"].clone())
                .unwrap_or_else(|e| panic!("{name} proposal: {e}"));
        Some((input, catalog, proposal.layout))
    }

    fn sorted(v: &super::super::CandidateValidation) -> Vec<crate::plan::ConstraintCheck> {
        let mut checks = v.report.checks.clone();
        checks.sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
        checks
    }

    #[test]
    fn check_drive_matches_batch_on_domain_candidates() {
        let mut seen = 0u32;
        for name in [
            "candidate-bounded-confirmed",
            "candidate-sibling-overlap",
            "candidate-load-exceeded",
            "candidate-one-action-blocked",
            "candidate-soft-budget",
            "candidate-owned-overuse",
            "candidate-unresolved-offer",
            "candidate-provisional",
            "candidate-contained-conditional",
            "candidate-direct-conditional",
            "candidate-orientation-forbidden",
            "candidate-outside-space",
            "candidate-floating-support",
            "candidate-hard-budget",
            "candidate-purchase-disallowed",
            "candidate-staging-blocked",
        ] {
            let Some((input, catalog, layout)) = load(name) else {
                continue;
            };
            seen += 1;
            let batch = validate_candidate(&input, &catalog, &layout);
            let driven = run_checks(&input, &catalog, &layout);
            assert_eq!(batch.install_order, driven.install_order, "{name} order");
            assert_eq!(batch.predecessors, driven.predecessors, "{name} preds");
            assert_eq!(
                batch.report.physical_assurance, driven.report.physical_assurance,
                "{name} assurance"
            );
            assert_eq!(
                batch.report.commerce_readiness, driven.report.commerce_readiness,
                "{name} commerce"
            );
            assert_eq!(
                batch.report.assignment_completeness, driven.report.assignment_completeness,
                "{name} quantity"
            );
            let left = sorted(&batch);
            let right = sorted(&driven);
            if left != right {
                let lb: Vec<_> = left.iter().map(|c| c.id.as_str()).collect();
                let rb: Vec<_> = right.iter().map(|c| c.id.as_str()).collect();
                assert_eq!(lb, rb, "{name} check ids");
                for (a, b) in left.iter().zip(right.iter()) {
                    assert_eq!(a, b, "{name} check {}", a.id.as_str());
                }
                panic!("{name} length {} vs {}", left.len(), right.len());
            }
        }
        assert!(seen >= 8, "expected candidate fixtures to load, saw {seen}");
    }
}
