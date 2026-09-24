//! ZARI-004 bounded search engine: rules → `StrategyDecision` → recipe-bound
//! options → resumable DFS over inner packing, outer anchors and offer
//! tuples, with every emitted candidate crossing the independent
//! validator/finalizer boundary (`evaluate_candidate`).
//!
//! The solver never asserts physical validity itself: nominal checks in
//! `place`/`pack` are generation-side pruning only. Determinism is total —
//! every cursor, ordering key and rank tuple is derived from the immutable
//! `(input, catalog, profile, budget)` context.

mod decision;
mod model;
mod pack;
mod place;
mod search;

use zari_core::*;

/// The reference engine a host installs on `Runtime::with_search_engine`.
pub struct SolverEngine;

impl SearchEngine for SolverEngine {
    fn propose_strategies(&self, input: &ProjectInput) -> Vec<StrategyDecision> {
        decision::propose(input)
    }

    fn start(&self, input: &ProjectInput, catalog: &CatalogContent) -> Box<dyn SearchSession> {
        Box::new(Session::new(input.clone(), catalog.clone()))
    }
}

/// One live resumable search; owns a cloned immutable context so the handle
/// is independent of caller borrows.
struct Session {
    machine: search::Machine,
}

impl Session {
    fn new(input: ProjectInput, catalog: CatalogContent) -> Self {
        let decision = decision::decide(&input, &input.strategy_choice);
        let prepared = model::prepare(&input, &catalog, decision);
        Self {
            machine: search::Machine::new(input, catalog, prepared),
        }
    }
}

impl SearchSession for Session {
    fn step(&mut self, allowance: u32) -> SearchStep {
        self.machine.step(allowance)
    }

    fn cancel(&mut self) -> SearchCounters {
        self.machine.cancel()
    }
}
