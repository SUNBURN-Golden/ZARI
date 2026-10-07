//! Private evaluation continuation (SP-014).
//!
//! The solver asks for the next quantum's cost and runs that quantum. It
//! cannot read a partial check, BOM, action list, or hash. A snapshot is
//! published only after structural revalidation accepts the record.

use crate::canonical::{self, CatalogContent};
use crate::catalog::Offer;
use crate::facts::Diagnostic;
use crate::finalize::{self, ActionDrive, BomCursor, CandidateEvaluation};
use crate::input::ProjectInput;
use crate::plan::*;
use crate::scalars::Digest;
use crate::validate::{self, LayoutDrive};
use crate::validator::{self, CheckDrive, DriveQuantum};
use sha2::{Digest as _, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const HASH_CHUNK: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Phase {
    Structural,
    Checks,
    Bom,
    Actions,
    Hash,
    Reval,
    Done,
}

/// Opaque handle bound to one input, catalog, and proposal.
pub struct EvaluationContinuation {
    phase: Phase,
    proposal: CandidateProposal,
    versions: CompileVersions,
    scope: SearchScope,
    input_facts: ProjectInput,
    input_digest: Digest,
    catalog_digest: Digest,
    proposal_digest: Digest,
    layout: LayoutDrive,
    checks: CheckDrive,
    validation: Option<validator::CandidateValidation>,
    bom: Option<BomCursor>,
    actions: Option<ActionDrive>,
    cost: Option<CostSummary>,
    built: Option<SnapshotContent>,
    hash: HashDrive,
    reval: RevalDrive,
    terminal: Option<CandidateEvaluation>,
    next: Option<u64>,
    discarded: bool,
}

impl EvaluationContinuation {
    pub fn start(
        input: &ProjectInput,
        catalog: &CatalogContent,
        proposal: &CandidateProposal,
        versions: CompileVersions,
        scope: SearchScope,
    ) -> Self {
        let layout = LayoutDrive::new(input);
        // An empty structural pass still starts the next phase. `next` is never
        // `Some(0)`, and it is `None` only after a terminal decision.
        let structural = layout_has_work(&layout, input, catalog, proposal);
        Self {
            phase: if structural {
                Phase::Structural
            } else {
                Phase::Checks
            },
            proposal: proposal.clone(),
            versions,
            scope,
            input_facts: input.clone(),
            input_digest: canonical::input_digest(input),
            catalog_digest: canonical::catalog_digest(catalog),
            proposal_digest: canonical::content_digest(proposal),
            layout,
            checks: CheckDrive::new(),
            validation: None,
            bom: None,
            actions: None,
            cost: None,
            built: None,
            hash: HashDrive::default(),
            reval: RevalDrive::default(),
            terminal: None,
            next: Some(1),
            discarded: false,
        }
    }

    pub fn matches(
        &self,
        input: &ProjectInput,
        catalog: &CatalogContent,
        proposal: &CandidateProposal,
    ) -> bool {
        self.input_digest == canonical::input_digest(input)
            && self.catalog_digest == canonical::catalog_digest(catalog)
            && self.proposal_digest == canonical::content_digest(proposal)
            && self.versions.search_profile == input.search.profile
    }

    pub fn next_cost(&self) -> Option<u64> {
        if self.discarded || self.terminal.is_some() {
            None
        } else {
            self.next
        }
    }

    /// Name of the quantum the next `run_quantum` will execute.
    pub fn phase(&self) -> &'static str {
        if self.discarded {
            return "discarded";
        }
        if self.terminal.is_some() {
            return if self.terminal.as_ref().is_some_and(|e| e.snapshot.is_some()) {
                "published"
            } else {
                "rejected"
            };
        }
        match self.phase {
            Phase::Structural => "structuralValidation",
            Phase::Checks => match self.checks.quantum_class() {
                DriveQuantum::Quantity => "quantityAudit",
                DriveQuantum::Independent => "independentChecks",
            },
            Phase::Bom => "bomAndCost",
            Phase::Actions => "actionDag",
            Phase::Hash => "canonicalHash",
            Phase::Reval => "structuralRevalidation",
            Phase::Done => "done",
        }
    }

    /// Execute one quantum bound to `input` and `catalog`. A digest mismatch
    /// discards the handle and publishes nothing.
    pub fn run_quantum(&mut self, input: &ProjectInput, catalog: &CatalogContent) -> bool {
        if self.terminal.is_some() || self.discarded || self.next.is_none() {
            return false;
        }
        if canonical::input_digest(input) != self.input_digest
            || canonical::catalog_digest(catalog) != self.catalog_digest
        {
            self.discard();
            return false;
        }
        match self.phase {
            Phase::Structural => self.step_structural(input, catalog),
            Phase::Checks => self.step_checks(input, catalog),
            Phase::Bom => self.step_bom(input, catalog),
            Phase::Actions => self.step_actions(input, catalog),
            Phase::Hash => self.step_hash(),
            Phase::Reval => self.step_reval(),
            Phase::Done => return false,
        }
        true
    }

    pub fn discard(&mut self) {
        self.discarded = true;
        self.next = None;
        self.built = None;
        self.hash.clear();
        self.terminal = Some(CandidateEvaluation {
            report: None,
            snapshot: None,
            diagnostics: vec![Diagnostic {
                field_path: "evaluation".into(),
                code: "continuation_discarded".into(),
                reason_code: "continuation_discarded".into(),
            }],
        });
    }

    pub fn take_result(&mut self) -> Option<CandidateEvaluation> {
        self.terminal.take()
    }

    fn step_structural(&mut self, input: &ProjectInput, catalog: &CatalogContent) {
        let (variants, offers) = maps(catalog);
        let did = self.layout.step(
            &self.proposal.layout,
            input,
            &variants,
            &offers,
            &self.proposal.strategy,
            true,
        );
        if !did {
            self.reject_structural();
            return;
        }
        if layout_has_work(&self.layout, input, catalog, &self.proposal) {
            self.next = Some(1);
        } else if self.layout.diagnostics.is_empty() {
            self.phase = Phase::Checks;
            self.next = Some(1);
        } else {
            self.reject_structural();
        }
    }

    fn reject_structural(&mut self) {
        self.terminal = Some(CandidateEvaluation {
            report: None,
            snapshot: None,
            diagnostics: std::mem::take(&mut self.layout.diagnostics),
        });
        self.phase = Phase::Done;
        self.next = None;
    }

    fn step_checks(&mut self, input: &ProjectInput, catalog: &CatalogContent) {
        if self
            .checks
            .step(input, catalog, &self.proposal.layout)
            .is_none()
        {
            self.finish_checks(input, catalog);
            return;
        }
        let mut probe = self.checks.clone();
        if probe.step(input, catalog, &self.proposal.layout).is_none() {
            self.finish_checks(input, catalog);
        } else {
            self.next = Some(1);
        }
    }

    fn finish_checks(&mut self, input: &ProjectInput, catalog: &CatalogContent) {
        let validation = std::mem::replace(&mut self.checks, CheckDrive::new()).finish(
            input,
            catalog,
            &self.proposal.layout,
        );
        if validator::has_blocking_failure(&validation.report) {
            self.terminal = Some(CandidateEvaluation {
                report: Some(validation.report),
                snapshot: None,
                diagnostics: vec![],
            });
            self.phase = Phase::Done;
            self.next = None;
            return;
        }
        self.validation = Some(validation);
        self.arm_bom(input, catalog);
    }

    /// The next quantum is one BOM line, or actions when there is no line.
    /// The probe cursor is dropped so the charged quantum does the line.
    fn arm_bom(&mut self, input: &ProjectInput, catalog: &CatalogContent) {
        let offers = offer_map(catalog);
        let mut probe = BomCursor::new(&self.proposal.layout);
        if probe.step(&self.proposal.layout, input, &offers).is_none() {
            self.bom = Some(probe);
            self.cost = Some(finalize::cost_summary(&self.proposal.layout, &offers));
            self.arm_actions(catalog);
        } else {
            self.bom = Some(BomCursor::new(&self.proposal.layout));
            self.phase = Phase::Bom;
            self.next = Some(4);
        }
    }

    fn step_bom(&mut self, input: &ProjectInput, catalog: &CatalogContent) {
        let offers = offer_map(catalog);
        let bom = self.bom.as_mut().expect("bom");
        if bom.step(&self.proposal.layout, input, &offers).is_none() {
            self.cost = Some(finalize::cost_summary(&self.proposal.layout, &offers));
            self.arm_actions(catalog);
            return;
        }
        let mut probe = self.bom.clone().expect("bom");
        if probe.step(&self.proposal.layout, input, &offers).is_none() {
            let _ = self
                .bom
                .as_mut()
                .expect("bom")
                .step(&self.proposal.layout, input, &offers);
            self.cost = Some(finalize::cost_summary(&self.proposal.layout, &offers));
            self.arm_actions(catalog);
        } else {
            self.next = Some(4);
        }
    }

    fn arm_actions(&mut self, catalog: &CatalogContent) {
        let validation = self.validation.clone().expect("validation");
        let mut probe = ActionDrive::new();
        if probe.step(&self.proposal.layout, &validation) {
            self.actions = Some(ActionDrive::new());
            self.phase = Phase::Actions;
            self.next = Some(1);
        } else {
            self.enter_hash(probe.into_actions(), catalog);
        }
    }

    fn step_actions(&mut self, _input: &ProjectInput, catalog: &CatalogContent) {
        let validation = self.validation.clone().expect("validation");
        let actions = self.actions.as_mut().expect("actions");
        if !actions.step(&self.proposal.layout, &validation) {
            let done = self.actions.take().expect("actions").into_actions();
            self.enter_hash(done, catalog);
            return;
        }
        let mut probe = self.actions.clone().expect("actions");
        if !probe.step(&self.proposal.layout, &validation) {
            let done = self.actions.take().expect("actions").into_actions();
            self.enter_hash(done, catalog);
        } else {
            self.next = Some(1);
        }
    }

    fn enter_hash(&mut self, actions: Vec<ActionStep>, catalog: &CatalogContent) {
        let validation = self.validation.clone().expect("validation");
        let offers = offer_map(catalog);
        let referenced =
            finalize::referenced_subset(catalog, &self.input_facts, &self.proposal.layout, &offers);
        let bom = self
            .bom
            .as_ref()
            .map(|cursor| cursor.lines().to_vec())
            .unwrap_or_default();
        self.built = Some(SnapshotContent {
            creation: self.proposal.creation.clone(),
            versions: self.versions.clone(),
            input_facts: self.input_facts.clone(),
            referenced_catalog: referenced,
            strategy: self.proposal.strategy.clone(),
            placements: self.proposal.layout.placements.clone(),
            assignments: self.proposal.layout.assignments.clone(),
            unassigned: self.proposal.layout.unassigned.clone(),
            purchase_selections: self.proposal.layout.purchase_selections.clone(),
            validation: validation.report,
            bom,
            cost_summary: self.cost.clone().expect("cost"),
            actions,
            scope: self.scope.clone(),
        });
        self.phase = Phase::Hash;
        self.next = Some(1);
    }

    fn step_hash(&mut self) {
        let content = self.built.as_ref().expect("content");
        if !self.hash.step(content) || self.hash.done() {
            self.enter_reval();
        } else {
            self.next = Some(1);
        }
    }

    fn enter_reval(&mut self) {
        let digest = self.hash.digest().expect("hash finished");
        let content = self.built.take().expect("content");
        self.reval.arm(PlanSnapshot {
            plan_snapshot_id: digest,
            content,
        });
        self.phase = Phase::Reval;
        self.next = Some(1);
    }

    fn step_reval(&mut self) {
        if !self.reval.step() || !self.reval.has_more() {
            self.finish_reval();
        } else {
            self.next = Some(1);
        }
    }

    fn finish_reval(&mut self) {
        let (snapshot, diagnostics) = std::mem::take(&mut self.reval).finish();
        if diagnostics.is_empty() {
            let report = snapshot.content.validation.clone();
            self.terminal = Some(CandidateEvaluation {
                report: Some(report),
                snapshot: Some(snapshot),
                diagnostics,
            });
        } else {
            self.terminal = Some(CandidateEvaluation {
                report: Some(snapshot.content.validation),
                snapshot: None,
                diagnostics,
            });
        }
        self.phase = Phase::Done;
        self.next = None;
    }
}

/// Run the split continuation to a terminal evaluation. Test oracle only.
#[cfg(test)]
pub fn evaluate_split(
    input: &ProjectInput,
    catalog: &CatalogContent,
    proposal: &CandidateProposal,
    versions: CompileVersions,
    scope: SearchScope,
) -> CandidateEvaluation {
    let mut continuation = EvaluationContinuation::start(input, catalog, proposal, versions, scope);
    let mut guard = 0u32;
    while continuation.next_cost().is_some() {
        assert!(
            continuation.run_quantum(input, catalog),
            "quantum did not run at {}",
            continuation.phase()
        );
        guard += 1;
        assert!(guard < 2_000_000, "continuation did not finish");
    }
    continuation.take_result().expect("terminal evaluation")
}

fn layout_has_work(
    layout: &LayoutDrive,
    input: &ProjectInput,
    catalog: &CatalogContent,
    proposal: &CandidateProposal,
) -> bool {
    let (variants, offers) = maps(catalog);
    let mut probe = layout.clone();
    probe.step(
        &proposal.layout,
        input,
        &variants,
        &offers,
        &proposal.strategy,
        true,
    )
}

fn maps(
    catalog: &CatalogContent,
) -> (
    BTreeMap<&str, &crate::catalog::ProductVariant>,
    BTreeMap<&str, &Offer>,
) {
    (
        catalog
            .variants
            .iter()
            .map(|v| (v.id.as_str(), v))
            .collect(),
        catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect(),
    )
}

fn offer_map(catalog: &CatalogContent) -> BTreeMap<&str, &Offer> {
    catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect()
}

#[derive(Default)]
struct HashDrive {
    bytes: Vec<u8>,
    offset: usize,
    hasher: Option<Sha256>,
    digest: Option<Digest>,
}

impl HashDrive {
    fn step(&mut self, content: &SnapshotContent) -> bool {
        if self.digest.is_some() {
            return false;
        }
        if self.hasher.is_none() {
            let canonical = canonical::canonicalize_snapshot_content(content);
            self.bytes = canonical::canonical_bytes(&canonical);
            self.hasher = Some(Sha256::new());
            self.offset = 0;
        }
        let hasher = self.hasher.as_mut().expect("hasher");
        if self.bytes.is_empty() {
            hasher.update([]);
            let finished = std::mem::replace(hasher, Sha256::new());
            self.digest = Some(Digest::from_sha256(finished.finalize().into()));
            self.bytes.clear();
            return true;
        }
        if self.offset >= self.bytes.len() {
            return false;
        }
        let end = (self.offset + HASH_CHUNK).min(self.bytes.len());
        hasher.update(&self.bytes[self.offset..end]);
        self.offset = end;
        if self.offset >= self.bytes.len() {
            let finished = std::mem::replace(hasher, Sha256::new());
            self.digest = Some(Digest::from_sha256(finished.finalize().into()));
            self.bytes.clear();
        }
        true
    }

    fn done(&self) -> bool {
        self.digest.is_some()
    }

    fn digest(&self) -> Option<Digest> {
        self.digest.clone()
    }

    fn clear(&mut self) {
        self.bytes.clear();
        self.hasher = None;
        self.digest = None;
    }
}

#[derive(Default)]
struct RevalDrive {
    snapshot: Option<PlanSnapshot>,
    section: u8,
    index: usize,
    diagnostics: Vec<Diagnostic>,
    layout: Option<LayoutDrive>,
    seen: BTreeSet<String>,
    edges: BTreeMap<String, Vec<String>>,
    indegree: BTreeMap<String, usize>,
    dependents: BTreeMap<String, Vec<String>>,
    queue: Vec<String>,
    visited: usize,
    kahn_ready: bool,
    more: bool,
}

impl RevalDrive {
    fn arm(&mut self, snapshot: PlanSnapshot) {
        self.snapshot = Some(snapshot);
        self.more = true;
        self.section = 0;
    }

    fn has_more(&self) -> bool {
        self.more
    }

    fn step(&mut self) -> bool {
        if self.snapshot.is_none() {
            self.more = false;
            return false;
        }
        loop {
            if self.section > 12 {
                self.more = false;
                return false;
            }
            if self.step_section() {
                self.more = true;
                return true;
            }
        }
    }

    fn step_section(&mut self) -> bool {
        let snapshot = self.snapshot.as_ref().expect("armed");
        let content = &snapshot.content;
        match self.section {
            0 => {
                if content.versions.schema_version != canonical::SCHEMA_VERSION
                    || content.versions.canonical_version != canonical::CANONICAL_VERSION
                {
                    validate::err(
                        &mut self.diagnostics,
                        "content.versions",
                        "unsupported_schema_version",
                    );
                }
                self.section = 1;
                true
            }
            1 => {
                self.diagnostics
                    .extend(validate::validate_project_input(&content.input_facts));
                self.section = 2;
                true
            }
            2 => {
                let subset = &content.referenced_catalog;
                self.diagnostics.extend(validate::catalog_body_diagnostics(
                    &subset.products,
                    &subset.variants,
                    &subset.offers,
                    &subset.evidence,
                ));
                self.layout = Some(LayoutDrive::new(&content.input_facts));
                self.section = 3;
                true
            }
            3 => self.layout_quantum(),
            4 => self.dup_quantum(
                content
                    .validation
                    .checks
                    .iter()
                    .map(|c| c.id.as_str().to_owned())
                    .collect(),
                "content.validation.checks",
            ),
            5 => self.dup_quantum(
                content
                    .bom
                    .iter()
                    .map(|l| l.id.as_str().to_owned())
                    .collect(),
                "content.bom",
            ),
            6 => self.dup_quantum(
                content
                    .actions
                    .iter()
                    .map(|a| a.id.as_str().to_owned())
                    .collect(),
                "content.actions",
            ),
            7 => self.action_quantum(),
            8 => self.kahn_quantum(),
            9 => self.scope_quantum(),
            10 => self.strategy_quantum(),
            11 => self.bom_quantum(),
            12 => {
                self.diagnostics
                    .extend(validate::snapshot_applicability(content));
                self.section = 13;
                true
            }
            _ => false,
        }
    }

    fn layout_quantum(&mut self) -> bool {
        let snapshot = self.snapshot.as_ref().expect("armed");
        let content = &snapshot.content;
        let layout = CandidateLayout {
            placements: content.placements.clone(),
            assignments: content.assignments.clone(),
            unassigned: content.unassigned.clone(),
            purchase_selections: content.purchase_selections.clone(),
        };
        let variants: BTreeMap<&str, &crate::catalog::ProductVariant> = content
            .referenced_catalog
            .variants
            .iter()
            .map(|v| (v.id.as_str(), v))
            .collect();
        let offers: BTreeMap<&str, &Offer> = content
            .referenced_catalog
            .offers
            .iter()
            .map(|o| (o.id.as_str(), o))
            .collect();
        let drive = self.layout.as_mut().expect("layout");
        let did = drive.step(
            &layout,
            &content.input_facts,
            &variants,
            &offers,
            &content.strategy,
            false,
        );
        if did {
            self.diagnostics
                .extend(std::mem::take(&mut drive.diagnostics));
            true
        } else {
            self.section = 4;
            self.index = 0;
            self.seen.clear();
            false
        }
    }

    fn dup_quantum(&mut self, ids: Vec<String>, path: &str) -> bool {
        let Some(id) = ids.get(self.index).cloned() else {
            self.section += 1;
            self.index = 0;
            self.seen.clear();
            return false;
        };
        self.index += 1;
        if !self.seen.insert(id.clone()) {
            validate::err(
                &mut self.diagnostics,
                format!("{path}.{id}"),
                "duplicate_id",
            );
        }
        true
    }

    fn action_quantum(&mut self) -> bool {
        let snapshot = self.snapshot.as_ref().expect("armed");
        let content = &snapshot.content;
        let Some(action) = content.actions.get(self.index) else {
            self.section = 8;
            self.index = 0;
            return false;
        };
        self.index += 1;
        let action_ids: BTreeSet<&str> = content.actions.iter().map(|a| a.id.as_str()).collect();
        let check_ids: BTreeSet<&str> = content
            .validation
            .checks
            .iter()
            .map(|check| check.id.as_str())
            .collect();
        let path = format!("content.actions.{}", action.id.as_str());
        let mut seen_edges: BTreeSet<&str> = BTreeSet::new();
        for dependency in action
            .prerequisite_step_ids
            .iter()
            .chain(action.required_confirmations.iter())
        {
            if !seen_edges.insert(dependency.as_str()) {
                validate::err(
                    &mut self.diagnostics,
                    format!("{path}.prerequisiteStepIds"),
                    "duplicate_action_ref",
                );
            }
            if !action_ids.contains(dependency.as_str()) {
                validate::err(
                    &mut self.diagnostics,
                    format!("{path}.prerequisiteStepIds"),
                    "dangling_action_ref",
                );
            } else {
                self.edges
                    .entry(action.id.as_str().to_owned())
                    .or_default()
                    .push(dependency.as_str().to_owned());
            }
        }
        let mut seen_reasons: BTreeSet<&str> = BTreeSet::new();
        for reason in &action.reason_ids {
            if !seen_reasons.insert(reason.as_str()) {
                validate::err(
                    &mut self.diagnostics,
                    format!("{path}.reasonIds"),
                    "duplicate_reason_ref",
                );
            }
            if !check_ids.contains(reason.as_str()) {
                validate::err(
                    &mut self.diagnostics,
                    format!("{path}.reasonIds"),
                    "dangling_check_ref",
                );
            }
        }
        true
    }

    fn kahn_quantum(&mut self) -> bool {
        if !self.kahn_ready {
            for (action, dependencies) in &self.edges {
                self.indegree.entry(action.clone()).or_insert(0);
                for dependency in dependencies {
                    *self.indegree.entry(action.clone()).or_insert(0) += 1;
                    self.dependents
                        .entry(dependency.clone())
                        .or_default()
                        .push(action.clone());
                    self.indegree.entry(dependency.clone()).or_insert(0);
                }
            }
            self.queue = self
                .indegree
                .iter()
                .filter(|(_, degree)| **degree == 0)
                .map(|(id, _)| id.clone())
                .collect();
            self.kahn_ready = true;
        }
        if let Some(id) = self.queue.pop() {
            self.visited += 1;
            if let Some(next) = self.dependents.get(&id).cloned() {
                for dependent in next {
                    let degree = self.indegree.get_mut(&dependent).expect("edge target");
                    *degree -= 1;
                    if *degree == 0 {
                        self.queue.push(dependent);
                    }
                }
            }
            return true;
        }
        if self.visited < self.indegree.len() {
            validate::err(
                &mut self.diagnostics,
                "content.actions",
                "cyclic_action_dependencies",
            );
        }
        self.section = 9;
        self.index = 0;
        true
    }

    fn scope_quantum(&mut self) -> bool {
        let snapshot = self.snapshot.as_ref().expect("armed");
        let content = &snapshot.content;
        let group_ids: BTreeSet<&str> = content
            .input_facts
            .groups
            .iter()
            .map(|g| g.id.as_str())
            .collect();
        let Some(group_id) = content.scope.group_ids.get(self.index) else {
            self.section = 10;
            self.index = 0;
            return false;
        };
        self.index += 1;
        if !group_ids.contains(group_id.as_str()) {
            validate::err(
                &mut self.diagnostics,
                "content.scope.groupIds",
                "dangling_group_ref",
            );
        }
        true
    }

    fn strategy_quantum(&mut self) -> bool {
        let snapshot = self.snapshot.as_ref().expect("armed");
        let content = &snapshot.content;
        let group_ids: BTreeSet<&str> = content
            .input_facts
            .groups
            .iter()
            .map(|g| g.id.as_str())
            .collect();
        let Some(group) = content.strategy.groups.get(self.index) else {
            self.section = 11;
            self.index = 0;
            return false;
        };
        self.index += 1;
        if !group_ids.contains(group.group_id.as_str()) {
            validate::err(
                &mut self.diagnostics,
                "content.strategy.groups",
                "dangling_group_ref",
            );
        }
        true
    }

    fn bom_quantum(&mut self) -> bool {
        let snapshot = self.snapshot.as_ref().expect("armed");
        let content = &snapshot.content;
        let Some(line) = content.bom.get(self.index) else {
            self.section = 12;
            self.index = 0;
            return false;
        };
        self.index += 1;
        let path = format!("content.bom.{}", line.id.as_str());
        let offers: BTreeSet<&str> = content
            .referenced_catalog
            .offers
            .iter()
            .map(|o| o.id.as_str())
            .collect();
        for placement_id in &line.placement_ids {
            if !content.placements.iter().any(|p| &p.id == placement_id) {
                validate::err(
                    &mut self.diagnostics,
                    format!("{path}.placementIds"),
                    "dangling_placement_ref",
                );
            }
        }
        if let Some(offer_id) = &line.offer_id
            && !offers.contains(offer_id.as_str())
        {
            validate::err(
                &mut self.diagnostics,
                format!("{path}.offerId"),
                "dangling_offer_ref",
            );
        }
        true
    }

    fn finish(self) -> (PlanSnapshot, Vec<Diagnostic>) {
        (self.snapshot.expect("snapshot"), self.diagnostics)
    }
}

#[cfg(test)]
mod tests {
    use super::evaluate_split;
    use crate::canonical::{CANONICAL_VERSION, SCHEMA_VERSION};
    use crate::finalize::evaluate_candidate;
    use crate::plan::*;

    fn load(
        name: &str,
    ) -> Option<(
        crate::input::ProjectInput,
        crate::canonical::CatalogContent,
        CandidateProposal,
    )> {
        let path = format!(
            "{}/../../fixtures/domain/{name}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let text = std::fs::read_to_string(path).ok()?;
        let value: serde_json::Value = serde_json::from_str(&text).ok()?;
        let input = serde_json::from_value(value["input"]["input"].clone()).ok()?;
        let snapshot: crate::catalog::CatalogSnapshot =
            serde_json::from_value(value["input"]["catalog"].clone()).ok()?;
        let proposal = serde_json::from_value(value["input"]["proposal"].clone()).ok()?;
        Some((
            input,
            crate::canonical::CatalogContent::from(&snapshot),
            proposal,
        ))
    }

    fn versions(
        input: &crate::input::ProjectInput,
        catalog: &crate::canonical::CatalogContent,
    ) -> CompileVersions {
        CompileVersions {
            schema_version: SCHEMA_VERSION,
            canonical_version: CANONICAL_VERSION,
            input_digest: crate::canonical::input_digest(input),
            catalog_version: catalog.catalog_version.clone(),
            catalog_digest: crate::canonical::catalog_digest(catalog),
            rule_version: crate::canonical::RULE_VERSION.into(),
            solver_version: crate::canonical::solver_version_for(&input.search.profile).into(),
            search_profile: input.search.profile.clone(),
            search_budget: input.search.budget.clone(),
            seed: input.search.seed.clone(),
        }
    }

    #[test]
    fn split_continuation_matches_batch_evaluation() {
        for name in [
            "candidate-bounded-confirmed",
            "candidate-soft-budget",
            "candidate-unresolved-offer",
            "candidate-provisional",
            "candidate-hard-budget",
            "candidate-purchase-disallowed",
            "candidate-missing-purchase",
            "candidate-sibling-overlap",
            "candidate-one-action-blocked",
        ] {
            let (input, catalog, proposal) = load(name).unwrap_or_else(|| panic!("load {name}"));
            let versions = versions(&input, &catalog);
            let scope = SearchScope {
                profile: input.search.profile.clone(),
                budget: input.search.budget.clone(),
                group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
                restrictions: vec![],
            };
            let batch =
                evaluate_candidate(&input, &catalog, &proposal, versions.clone(), scope.clone());
            let split = evaluate_split(&input, &catalog, &proposal, versions, scope);
            assert_eq!(batch.diagnostics, split.diagnostics, "{name} diagnostics");
            let sort_report = |report: &ValidationReport| {
                let mut checks = report.checks.clone();
                checks.sort_by(|a, b| a.id.as_str().cmp(b.id.as_str()));
                (
                    checks,
                    report.physical_assurance.clone(),
                    report.commerce_readiness.clone(),
                    report.assignment_completeness.clone(),
                )
            };
            assert_eq!(
                batch
                    .snapshot
                    .as_ref()
                    .map(|s| sort_report(&s.content.validation)),
                split
                    .snapshot
                    .as_ref()
                    .map(|s| sort_report(&s.content.validation)),
                "{name} report"
            );
            assert_eq!(
                batch.snapshot.as_ref().map(|s| &s.content.bom),
                split.snapshot.as_ref().map(|s| &s.content.bom),
                "{name} bom"
            );
            assert_eq!(
                batch.snapshot.as_ref().map(|s| &s.content.actions),
                split.snapshot.as_ref().map(|s| &s.content.actions),
                "{name} actions"
            );
            assert_eq!(
                batch.snapshot.as_ref().map(|s| s.plan_snapshot_id.clone()),
                split.snapshot.as_ref().map(|s| s.plan_snapshot_id.clone()),
                "{name} digest"
            );
            assert_eq!(
                batch.report.is_some(),
                split.report.is_some(),
                "{name} report presence"
            );
        }
    }

    fn continuation_for(
        name: &str,
    ) -> (
        crate::input::ProjectInput,
        crate::canonical::CatalogContent,
        super::EvaluationContinuation,
    ) {
        let (input, catalog, proposal) = load(name).unwrap();
        let versions = versions(&input, &catalog);
        let scope = SearchScope {
            profile: input.search.profile.clone(),
            budget: input.search.budget.clone(),
            group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
            restrictions: vec![],
        };
        let continuation =
            super::EvaluationContinuation::start(&input, &catalog, &proposal, versions, scope);
        (input, catalog, continuation)
    }

    #[test]
    fn cancel_in_each_phase_publishes_nothing() {
        let (input, catalog, mut probe) = continuation_for("candidate-soft-budget");
        let mut phases = std::collections::BTreeSet::new();
        while probe.next_cost().is_some() {
            phases.insert(probe.phase().to_owned());
            assert!(probe.run_quantum(&input, &catalog));
        }
        for phase in [
            "structuralValidation",
            "independentChecks",
            "quantityAudit",
            "bomAndCost",
            "actionDag",
            "canonicalHash",
            "structuralRevalidation",
        ] {
            assert!(phases.contains(phase), "missing {phase}");
        }
        assert_eq!(probe.phase(), "published");
        let published = probe.take_result().unwrap();
        assert!(published.snapshot.is_some());

        for phase in [
            "structuralValidation",
            "independentChecks",
            "quantityAudit",
            "bomAndCost",
            "actionDag",
            "canonicalHash",
            "structuralRevalidation",
        ] {
            let (input, catalog, mut continuation) = continuation_for("candidate-soft-budget");
            while continuation.phase() != phase {
                assert!(
                    continuation.next_cost().is_some(),
                    "left the continuation before {phase}"
                );
                assert!(continuation.run_quantum(&input, &catalog));
            }
            assert!(
                continuation.take_result().is_none(),
                "{phase} published early"
            );
            continuation.discard();
            let discarded = continuation.take_result().unwrap();
            assert!(discarded.snapshot.is_none(), "{phase} partial snapshot");
            assert!(discarded.report.is_none(), "{phase} partial report");
        }
    }

    #[test]
    fn foreign_catalog_discards_the_handle() {
        let (input, mut catalog, mut continuation) =
            continuation_for("candidate-bounded-confirmed");
        assert!(continuation.run_quantum(&input, &catalog));
        catalog.catalog_version.push_str("-other");
        let proposal = continuation.proposal.clone();
        assert!(!continuation.matches(&input, &catalog, &proposal));
        assert!(!continuation.run_quantum(&input, &catalog));
        assert_eq!(continuation.phase(), "discarded");
        let discarded = continuation.take_result().unwrap();
        assert!(discarded.snapshot.is_none());
    }

    #[test]
    fn reversed_offers_keep_the_same_evaluation() {
        let (input, catalog, proposal) = load("candidate-bounded-confirmed").unwrap();
        let versions = versions(&input, &catalog);
        let scope = SearchScope {
            profile: input.search.profile.clone(),
            budget: input.search.budget.clone(),
            group_ids: vec![],
            restrictions: vec![],
        };
        let original = evaluate_split(&input, &catalog, &proposal, versions.clone(), scope.clone());
        let mut reversed = catalog.clone();
        reversed.offers.reverse();
        assert_eq!(
            crate::canonical::catalog_digest(&catalog),
            crate::canonical::catalog_digest(&reversed)
        );
        let again = evaluate_split(&input, &reversed, &proposal, versions, scope);
        assert_eq!(
            original
                .snapshot
                .as_ref()
                .map(|s| s.plan_snapshot_id.clone()),
            again.snapshot.as_ref().map(|s| s.plan_snapshot_id.clone())
        );
        assert_eq!(
            original.snapshot.as_ref().map(|s| &s.content.bom),
            again.snapshot.as_ref().map(|s| &s.content.bom)
        );
        assert_eq!(
            original.snapshot.as_ref().map(|s| &s.content.actions),
            again.snapshot.as_ref().map(|s| &s.content.actions)
        );
    }

    #[test]
    fn blocking_and_corrupt_candidates_publish_no_snapshot() {
        for name in ["candidate-sibling-overlap", "candidate-missing-purchase"] {
            let (input, catalog, proposal) = load(name).unwrap();
            let versions = versions(&input, &catalog);
            let scope = SearchScope {
                profile: input.search.profile.clone(),
                budget: input.search.budget.clone(),
                group_ids: vec![],
                restrictions: vec![],
            };
            let evaluation = evaluate_split(&input, &catalog, &proposal, versions, scope);
            assert!(evaluation.snapshot.is_none(), "{name} published a snapshot");
            assert!(
                evaluation.report.is_some() || !evaluation.diagnostics.is_empty(),
                "{name} dropped the failure"
            );
        }
    }
}
