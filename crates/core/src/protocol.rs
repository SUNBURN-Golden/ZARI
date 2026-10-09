use crate::{
    canonical::{self, CatalogContent},
    catalog::*,
    completion::COMPLETION_LIMIT_CODE,
    eligibility::{
        self, ActionEligibilityReply, ActionEligibilityStamp, ActionProgressInput, EligibilityError,
    },
    facts::*,
    finalize,
    input::*,
    measurement::*,
    next_facts::{self, NextFactsError, NextFactsReply},
    normalize::*,
    plan::*,
    probe::*,
    raw::*,
    scalars::*,
    spatial_view::*,
    strategy::*,
    validate,
};
use schemars::JsonSchema;
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, MapAccess, SeqAccess, Visitor},
};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, VecDeque},
    fmt,
};

pub const BUILD_ID: &str = "zari-domain-7";
const CAPABILITIES: [&str; 17] = [
    "initialize",
    "activateProject",
    "normalizeInput(bootstrap)",
    "normalizeInput(project)",
    "evaluateProbe",
    "verifyRecord",
    "normalizeCatalogFields",
    "validateCatalog",
    "validateCandidate",
    "evaluateLayoutEdit",
    "projectSpatialView",
    "queryNextFacts",
    "queryActionEligibility",
    "applyInventoryLedger",
    "reviewCatalogImport",
    "quoteOfferBundle",
    "disposeProject",
];
/// Extra capabilities advertised only when a search engine is installed.
const SEARCH_CAPABILITIES: [&str; 7] = [
    "proposeStrategies",
    "evaluateStrategyLibrary",
    "startSearch",
    "stepSearch",
    "cancelSearch",
    "comparePareto",
    "replanIncremental",
];
const COMMAND_KINDS: [&str; 23] = [
    "initialize",
    "activateProject",
    "normalizeInput",
    "evaluateProbe",
    "verifyRecord",
    "normalizeCatalogFields",
    "validateCatalog",
    "validateCandidate",
    "evaluateLayoutEdit",
    "projectSpatialView",
    "queryNextFacts",
    "queryActionEligibility",
    "applyInventoryLedger",
    "reviewCatalogImport",
    "quoteOfferBundle",
    "disposeProject",
    "proposeStrategies",
    "evaluateStrategyLibrary",
    "startSearch",
    "stepSearch",
    "cancelSearch",
    "comparePareto",
    "replanIncremental",
];
const MAX_MESSAGE_BYTES: usize = 5 * 1024 * 1024;
/// Per-step work-unit ceiling from WASM_PROTOCOL §3 (default 256, max 1024).
const MAX_STEP_ALLOWANCE: u32 = 1024;
/// Fixture-expanded step requests are bounded like every other collection.
const MAX_FIXTURE_SEARCH_STEPS: usize = 4096;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestMeta {
    pub protocol_version: u32,
    pub schema_version: u32,
    pub worker_session_id: String,
    pub project_activation_id: String,
    pub request_id: String,
    pub project_id: String,
    pub editor_epoch: Revision,
    pub input_revision: Revision,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub context_id: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldFormatRequest {
    pub field_path: String,
    pub unit: Unit,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormattedField {
    pub field_path: String,
    pub unit: Unit,
    pub text: String,
}
/// Activation payload: the bootstrap probe context or a normalized project
/// plus the catalog bytes matching its pin (or a cached digest).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum ActivationContext {
    Bootstrap {},
    Project {
        input: ProjectInput,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<CatalogSnapshot>")]
        catalog: Option<CatalogSnapshot>,
    },
}
/// The normalized result of `normalizeInput`, tagged by input kind.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum NormalizedInput {
    Bootstrap { input: NormalizedBootstrapInput },
    Project { input: ProjectInput },
}
/// Search drive mode recorded at `startSearch`. The single-threaded runtime
/// only ever advances on explicit `stepSearch` requests, so `continuous` is a
/// scheduling hint for the host — never an autonomous loop inside WASM.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SearchMode {
    Continuous,
    Manual,
}
/// Outcome of one bounded search step. `Completed` carries the full result
/// only after every emitted alternative crossed the independent validator.
pub enum SearchStep {
    Progress { consumed: SearchCounters },
    Completed { result: Box<SearchResult> },
    Cancelled { consumed: SearchCounters },
}
/// One resumable bounded search over the activated immutable context. The
/// host drives it through explicit steps; every unit of work is a
/// deterministic quantum defined by SOLVER.md §3, so results are invariant
/// under step partitioning.
pub trait SearchSession {
    /// Consume at most `allowance` work units and report the step outcome.
    fn step(&mut self, allowance: u32) -> SearchStep;
    /// Cooperative cancellation: the next step reports `Cancelled` and the
    /// session never publishes another result. Returns the counters at the
    /// point of cancellation.
    fn cancel(&mut self) -> SearchCounters;
}
/// The search implementation a host installs on the runtime. Core drives it
/// through this boundary and never asserts candidate validity itself; every
/// candidate published inside `SearchResult` was independently revalidated.
pub trait SearchEngine {
    /// Deterministic strategy catalogue: one decision per supported strategy.
    fn propose_strategies(&self, input: &ProjectInput) -> Vec<StrategyDecision>;
    /// Versioned recipe catalogue over the same decisions. Does not search
    /// and does not rewrite `strategy_choice`.
    fn evaluate_strategy_library(
        &self,
        input: &ProjectInput,
    ) -> crate::strategy_library::StrategyLibraryReply;
    /// Allocate a fresh resumable search over the immutable context.
    fn start(&self, input: &ProjectInput, catalog: &CatalogContent) -> Box<dyn SearchSession>;
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::large_enum_variant)]
pub enum NormalizeInputDto {
    Bootstrap { probe: BootstrapProbeDto },
    Project { project: RawProjectInputDto },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum Command {
    Initialize {
        build_id: String,
        expected_protocol_version: u32,
        expected_schema_version: u32,
    },
    ActivateProject {
        context: ActivationContext,
    },
    NormalizeInput {
        input: NormalizeInputDto,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        prior_input_digest: Option<String>,
        format_requests: Vec<FieldFormatRequest>,
        /// Nominal and active bounds, converted together. Omitted requests
        /// are an empty group. A read-only or unknown path fails the command.
        #[serde(default)]
        group_format_requests: Vec<MeasurementGroupFormatRequest>,
    },
    EvaluateProbe {
        probe: BootstrapProbeDto,
    },
    /// Integrity boundary for durable records: structural checks plus the
    /// claimed content digest. Never executes a search or mutates state.
    VerifyRecord {
        record: VerifiableRecordDto,
    },
    /// Stateless catalog scalar conversion (WASM_PROTOCOL §2).
    NormalizeCatalogFields {
        fields: Vec<RawCatalogFieldDto>,
    },
    /// Complete-catalog import validation (Ticket 008): checks the whole
    /// bounded catalog body and answers with an immutable snapshot whose
    /// digest Rust computes. Stateless — it never persists, pins, activates
    /// or mutates any context, and it never fabricates a project.
    ValidateCatalog {
        catalog: CatalogImportDto,
    },
    /// Independent validation and finalization boundary (Ticket 003). The
    /// proposal is rechecked from the activated context; a caller can never
    /// assert solver pass state because none exists on the wire.
    ValidateCandidate {
        proposal: CandidateProposal,
    },
    /// Trustworthy editing (Ticket 007): apply one domain edit command to an
    /// immutable base snapshot and revalidate the whole layout through the
    /// same boundary as `validateCandidate`. `sourceSnapshot` resolves
    /// `restoreLayout` targets; it is ignored by other commands.
    EvaluateLayoutEdit {
        base_snapshot: PlanSnapshot,
        command: LayoutEditCommand,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<PlanSnapshot>")]
        source_snapshot: Option<PlanSnapshot>,
    },
    /// One authoritative spatial projection over an integrity-validated
    /// source (SPATIAL_VIEW_CONTRACT §6). Stateless like `verifyRecord`: it
    /// never mutates the active context, search, budget or any source bytes.
    ProjectSpatialView {
        source: SpatialViewSource,
    },
    /// Static completion read. The supplied input and optional snapshot are
    /// not activated, and the command does not touch search or counters.
    QueryNextFacts {
        input: ProjectInput,
        input_digest: Digest,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<PlanSnapshot>")]
        snapshot: Option<PlanSnapshot>,
    },
    /// Ephemeral guide eligibility. Does not search, store, or change facts.
    /// `progress: null` is not eligible. More than 4096 rows fails the read.
    QueryActionEligibility {
        snapshot: PlanSnapshot,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Vec<ActionProgressInput>>")]
        progress: Option<Vec<ActionProgressInput>>,
        stamp: ActionEligibilityStamp,
    },
    /// Stateless life-ledger step. Does not read or write a PlanSnapshot.
    /// `openHistorical` returns the same ledger.
    ApplyInventoryLedger {
        ledger: crate::inventory::InventoryLedger,
        action: crate::inventory::InventoryAction,
    },
    /// Stateless catalog import review. Does not read or write a stored
    /// catalog. `snapshot` is present only when every row is ready.
    ReviewCatalogImport {
        action: crate::catalog_provenance::CatalogReviewAction,
    },
    /// Stateless seller quote. Does not write a PlanSnapshot. Unknown
    /// shipping stays unknown and is not a free total.
    QuoteOfferBundle {
        action: crate::offer_bundles::OfferQuoteAction,
    },
    /// Evaluate every supported strategy's decision IR for the activated
    /// project context without starting a search (SOLVER.md §4).
    ProposeStrategies {},
    /// Versioned strategy and recipe comparison for the activated project.
    /// Does not start a search and does not publish a snapshot.
    EvaluateStrategyLibrary {},
    /// Pareto read model over snapshots from the same input, budget, and seed.
    /// Does not search, rank, or publish a PlanSnapshot.
    ComparePareto {
        termination: SearchTermination,
        alternatives: Vec<PlanSnapshot>,
    },
    /// Pinned incremental replan. The activated project is the new input.
    /// Pins are explicit constraints. A historical pass is not copied. The
    /// command does not replace an adopted plan.
    ReplanIncremental {
        base_snapshot: PlanSnapshot,
        pins: crate::incremental::IncrementalPins,
    },
    /// Start one resumable bounded search over the activated immutable
    /// context. Any existing search handle is disposed first; the returned id
    /// is `search-1`, `search-2`, … monotonically per runtime.
    StartSearch {
        mode: SearchMode,
    },
    /// Advance the live search by at most `allowance` deterministic work
    /// units (1..=1024). `searchId` must match the issued handle exactly.
    StepSearch {
        search_id: String,
        allowance: u32,
    },
    /// Idempotent cooperative cancellation of exactly that search handle.
    CancelSearch {
        search_id: String,
    },
    DisposeProject {},
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtocolRequest {
    pub meta: RequestMeta,
    pub command: Command,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum Event {
    Ready {
        build_id: String,
        protocol_version: u32,
        schema_version: u32,
        canonical_version: u32,
        rule_version: String,
        solver_version: String,
        capabilities: Vec<String>,
    },
    ProjectActivated {
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        context_id: Option<String>,
    },
    Normalized {
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<NormalizedInput>")]
        normalized_input: Option<NormalizedInput>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        input_digest: Option<String>,
        equivalent_to_prior: bool,
        formatted_fields: Vec<FormattedField>,
        formatted_groups: Vec<FormattedMeasurementGroup>,
        diagnostics: Vec<Diagnostic>,
    },
    ProbeEvaluated {
        result: BootstrapProbeResult,
    },
    /// Result of `verifyRecord`: record kind, the digest Rust computed over
    /// canonical content, whether the claim matches valid structure, and
    /// field diagnostics. `verified` is a consistency proof, not a currentness
    /// or physical-validity claim.
    RecordVerified {
        record_kind: String,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        computed_digest: Option<Digest>,
        verified: bool,
        diagnostics: Vec<Diagnostic>,
    },
    CatalogFieldsNormalized {
        fields: Vec<NormalizedCatalogField>,
    },
    /// Result of `validateCatalog`: the validated immutable snapshot — with
    /// the Rust-computed digest — or `null` plus the field diagnostics that
    /// blocked publication. The event upgrades no trust and touches no state.
    CatalogValidated {
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<CatalogSnapshot>")]
        snapshot: Option<CatalogSnapshot>,
        diagnostics: Vec<Diagnostic>,
    },
    /// Result of `validateCandidate`: the independently computed report, the
    /// finalized snapshot only when no blocking failure exists, and the
    /// structural diagnostics for proposals that are not valid candidates.
    CandidateValidated {
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<ValidationReport>")]
        report: Option<ValidationReport>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<PlanSnapshot>")]
        snapshot: Option<PlanSnapshot>,
        diagnostics: Vec<Diagnostic>,
    },
    /// Result of `evaluateLayoutEdit`: the same triple as
    /// `candidateValidated`. `snapshot` is present only when the edited layout
    /// survived independent validation; `diagnostics` carries command-level
    /// rejection codes (unknown placement, out-of-scope base, unsupported
    /// transform) plus structural failures.
    EditEvaluated {
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<ValidationReport>")]
        report: Option<ValidationReport>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<PlanSnapshot>")]
        snapshot: Option<PlanSnapshot>,
        diagnostics: Vec<Diagnostic>,
    },
    /// Result of `proposeStrategies`: the deterministic decision IR for every
    /// supported strategy, in supported-strategy order.
    StrategiesProposed {
        decisions: Vec<StrategyDecision>,
    },
    /// Result of `evaluateStrategyLibrary`. Not part of a PlanSnapshot hash.
    /// `strategyChanged` is false: the pinned strategy is the input's choice.
    StrategyLibraryEvaluated {
        reply: crate::strategy_library::StrategyLibraryReply,
    },
    /// Result of `comparePareto`. Not part of a PlanSnapshot hash.
    /// `globalOptimum` is false, including when the budget is exhausted.
    ParetoCompared {
        reply: crate::pareto::ParetoReply,
    },
    /// Result of `replanIncremental`. The published snapshot, when present,
    /// is a new plan. The command does not adopt it.
    IncrementalReplanned {
        reply: crate::incremental::IncrementalReply,
    },
    /// Result of `projectSpatialView`: the additive ephemeral read model over
    /// the validated source. ProjectionVersion=1 versions this DTO
    /// independently of the persisted schema/canonical versions.
    SpatialViewProjected {
        projection: SpatialProjection,
    },
    /// Result of `queryNextFacts`. Rows are empty when the snapshot binding
    /// is stale. A limit failure is `operationFailed`, not a short list.
    NextFactsQueried {
        reply: NextFactsReply,
    },
    /// Result of `queryActionEligibility`. `eligible: false` is not a pass.
    ActionEligibilityQueried {
        reply: ActionEligibilityReply,
    },
    /// Result of `applyInventoryLedger`. `changed: false` is a read.
    InventoryLedgerApplied {
        reply: crate::inventory::InventoryReply,
    },
    /// Result of `reviewCatalogImport`. `snapshot: null` publishes nothing.
    CatalogImportReviewed {
        reply: crate::catalog_provenance::CatalogProvenanceReply,
    },
    /// Result of `quoteOfferBundle`. `boundRevision` is the snapshot id, or
    /// null for a preview that does not change drawing, BOM, or the guide.
    OfferBundleQuoted {
        reply: crate::offer_bundles::OfferQuoteReply,
    },
    /// `startSearch` acknowledged; the handle must be echoed verbatim by
    /// `stepSearch`/`cancelSearch`.
    SearchStarted {
        search_id: String,
        mode: SearchMode,
    },
    /// One bounded step completed without reaching a terminal event.
    SearchProgress {
        search_id: String,
        consumed: SearchCounters,
    },
    /// The search terminated; `result` carries ranked alternatives whose
    /// snapshots were all produced by the independent validator/finalizer.
    SearchCompleted {
        search_id: String,
        result: Box<SearchResult>,
    },
    /// Acknowledgement of `cancelSearch` (idempotent within the activation).
    SearchCancelled {
        search_id: String,
        consumed: SearchCounters,
    },
    ProjectDisposed,
    OperationFailed {
        code: String,
        affected_fields: Vec<String>,
        affected_ids: Vec<String>,
        retryable: bool,
        reason_parameters: BTreeMap<String, String>,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtocolResponse {
    pub meta: RequestMeta,
    pub sequence: u32,
    pub event: Event,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineContext {
    pub build_id: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixtureExpected {
    pub width_status: CheckStatus,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub required_width_mm: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Vec<String>>")]
    pub x_positions_mm: Option<Vec<String>>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub packs_to_order: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub supplied_units: Option<u32>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<u32>")]
    pub surplus_units: Option<u32>,
    pub diagnostic_fields: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BootstrapFixture {
    pub fixture_schema_version: u32,
    pub case_id: String,
    pub operation: String,
    pub schema_version: u32,
    pub input: BootstrapProbeDto,
    pub engine_context: EngineContext,
    pub expected: FixtureExpected,
}
/// The domain interchange operation a shared fixture exercises. The fixture's
/// `expected.kind` must carry the same name.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum DomainOperation {
    NormalizeProjectInput,
    VerifyRecord,
    NormalizeCatalogFields,
    /// Whole-catalog import under system identity (no project activation).
    ValidateCatalog,
    ValidateCandidate,
    /// One layout edit command against an embedded base snapshot.
    EvaluateLayoutEdit,
    /// Strategy catalogue over the fixture's activated project context.
    ProposeStrategies,
    /// Resumable bounded search driven by explicit fixture-declared steps.
    RunSearch,
    /// One spatial projection over an embedded integrity-validated source.
    ProjectSpatialView,
    /// One completion query over a normalized input and optional snapshot.
    QueryNextFacts,
    QueryActionEligibility,
}
/// Step recipe for a `runSearch` fixture: `count` requests of `allowance`
/// work units each. Declared steps are expanded in order; `cancelAfterSteps`
/// appends a `cancelSearch` after that many step requests.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixtureSearchStep {
    pub allowance: u32,
    pub count: u32,
}
/// `runSearch` fixture input payload: `{"input": <ProjectInput>,
/// "catalog": <CatalogSnapshot>, "mode"?, "steps"?, "cancelAfterSteps"?}`.
/// `input`/`catalog` stay untyped so malformed payloads still decode into
/// the fixture envelope and reach the activation boundary unchanged.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunSearchSpec {
    pub input: Value,
    pub catalog: Value,
    #[serde(default)]
    pub mode: Option<SearchMode>,
    #[serde(default)]
    pub steps: Vec<FixtureSearchStep>,
    #[serde(default)]
    pub cancel_after_steps: Option<u32>,
}
/// One expected diagnostic, compared as an unordered `(fieldPath, code)` set.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedDiagnostic {
    pub field_path: String,
    pub code: String,
}
/// The expected result of one catalog field conversion: either the exact
/// typed fact JSON or the diagnostic codes the field must carry.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedCatalogField {
    pub field_path: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Value>")]
    pub value: Option<Value>,
    pub diagnostic_codes: Vec<String>,
}
/// One expected check assertion on a `candidateValidated` report: the check
/// id must exist with this status (and reason when declared).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedCheck {
    pub id: String,
    pub status: CheckStatus,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub reason_code: Option<String>,
}
/// Expected box geometry of one element/overlay: an exact hand-checked box
/// with its basis, or the explicit reason it must not be drawable.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ExpectedBoxGeometry {
    Available {
        min: [i64; 3],
        max: [i64; 3],
        basis: CheckBasis,
    },
    Unavailable {
        reason_code: String,
    },
    NotApplicable {
        reason_code: String,
    },
}
/// Expected rectangle geometry of one element.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ExpectedRectGeometry {
    Available { min: [i64; 2], max: [i64; 2] },
    Unavailable { reason_code: String },
    NotApplicable { reason_code: String },
}
/// Expected segment geometry of one dimension guide.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ExpectedSegmentGeometry {
    Available { from: [i64; 3], to: [i64; 3] },
    Unavailable { reason_code: String },
}
/// One hand-checked element assertion, compared in emitted order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedSpatialElement {
    pub target: SpatialTarget,
    pub role: SpatialRole,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<Id>")]
    pub parent_placement_id: Option<Id>,
    pub world: ExpectedBoxGeometry,
    pub top: ExpectedRectGeometry,
    pub front: ExpectedRectGeometry,
    pub cavity_local: ExpectedBoxGeometry,
    pub measurement: ExpectedBoxGeometry,
}
/// One hand-checked overlay assertion, compared in emitted order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedSpatialOverlay {
    pub target: SpatialTarget,
    pub role: SpatialOverlayRole,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<SpatialMotionPhase>")]
    pub motion_phase: Option<SpatialMotionPhase>,
    pub geometry: ExpectedBoxGeometry,
}
/// One hand-checked link assertion, compared in emitted order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedSpatialLink {
    pub source: SpatialLinkSource,
    pub targets: Vec<SpatialTarget>,
    pub resolution: LinkResolution,
    pub unresolved_subject_ids: Vec<Id>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub reason_code: Option<String>,
}
/// One hand-checked dimension-guide assertion, compared in emitted order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedDimensionGuide {
    pub guide_id: Id,
    pub field_path: String,
    pub preferred_view: DimensionView,
    pub segment: ExpectedSegmentGeometry,
}
/// Per-operation oracle. `decodeError` asserts that the payload cannot even
/// decode into the operation's input type — the worker answers
/// `operationFailed/invalid_input`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[allow(clippy::large_enum_variant)]
pub enum DomainFixtureExpected {
    NormalizeProjectInput {
        decode_error: bool,
        diagnostics: Vec<ExpectedDiagnostic>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        input_digest: Option<Digest>,
        /// Hand-checked signed-offset intervals. Empty for older fixtures.
        #[serde(default)]
        offset_intervals: Vec<ExpectedOffsetInterval>,
        /// Group format results. Empty when the fixture requests none.
        #[serde(default)]
        formatted_groups: Vec<FormattedMeasurementGroup>,
    },
    VerifyRecord {
        decode_error: bool,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<bool>")]
        verified: Option<bool>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        computed_digest: Option<Digest>,
        diagnostics: Vec<ExpectedDiagnostic>,
    },
    NormalizeCatalogFields {
        decode_error: bool,
        fields: Vec<ExpectedCatalogField>,
    },
    /// `snapshotDigest` doubles as the snapshot-presence assertion: `null`
    /// requires the event to carry no snapshot (rejected imports), a value
    /// pins the exact immutable catalog identity Rust produced.
    ValidateCatalog {
        decode_error: bool,
        diagnostics: Vec<ExpectedDiagnostic>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        snapshot_digest: Option<Digest>,
    },
    /// `snapshotDigest` doubles as the snapshot-presence assertion: `null`
    /// requires the event to carry no snapshot (rejected candidates), a value
    /// pins the exact immutable identity.
    ValidateCandidate {
        decode_error: bool,
        diagnostics: Vec<ExpectedDiagnostic>,
        checks: Vec<ExpectedCheck>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<PhysicalAssurance>")]
        physical_assurance: Option<PhysicalAssurance>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<CommerceReadiness>")]
        commerce_readiness: Option<CommerceReadiness>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        snapshot_digest: Option<Digest>,
    },
    /// Same oracle shape as `validateCandidate` over the `editEvaluated`
    /// event; `snapshotDigest: null` asserts a rejected edit published no
    /// snapshot.
    EvaluateLayoutEdit {
        decode_error: bool,
        diagnostics: Vec<ExpectedDiagnostic>,
        checks: Vec<ExpectedCheck>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<PhysicalAssurance>")]
        physical_assurance: Option<PhysicalAssurance>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<CommerceReadiness>")]
        commerce_readiness: Option<CommerceReadiness>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        snapshot_digest: Option<Digest>,
    },
    ProposeStrategies {
        decode_error: bool,
        /// Ordered strategies the event must return.
        strategies: Vec<Strategy>,
        /// Sorted union of assumption codes across all decisions.
        condition_codes: Vec<String>,
    },
    /// `projectSpatialView` oracle: hand-checked element/overlay/link/guide
    /// assertions compared in emitted order, plus the canonical digest over
    /// the whole projection as the cross-runtime regression pin.
    /// `failureCode` expects a specific structured rejection (other than
    /// `invalid_input`, which `decodeError` covers).
    ProjectSpatialView {
        decode_error: bool,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        failure_code: Option<String>,
        elements: Vec<ExpectedSpatialElement>,
        overlays: Vec<ExpectedSpatialOverlay>,
        links: Vec<ExpectedSpatialLink>,
        dimensions: Vec<ExpectedDimensionGuide>,
        projection_digest: Digest,
    },
    /// `queryNextFacts` oracle. `reply` is null when `failureCode` names the
    /// structured rejection. Row order, check ids, and needs are exact.
    QueryNextFacts {
        decode_error: bool,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        failure_code: Option<String>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<NextFactsReply>")]
        reply: Option<NextFactsReply>,
    },
    /// `queryActionEligibility` oracle. `reply` is null when `failureCode` is set.
    QueryActionEligibility {
        decode_error: bool,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<String>")]
        failure_code: Option<String>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<ActionEligibilityReply>")]
        reply: Option<ActionEligibilityReply>,
    },
    RunSearch {
        decode_error: bool,
        /// Required terminal reason; `null` asserts the run never terminated
        /// within the declared steps (last event is `searchProgress`).
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<SearchTermination>")]
        termination: Option<SearchTermination>,
        /// Ordered snapshot digests of the emitted ranked alternatives.
        alternative_digests: Vec<Digest>,
        /// Sorted diagnostic-candidate reason codes.
        diagnostic_reasons: Vec<String>,
        /// Sorted scope-restriction codes.
        restriction_codes: Vec<String>,
        /// Exact consumed counters at termination; `null` for a cancelled or
        /// non-terminated run (asserted against the event either way).
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<SearchCounters>")]
        consumed: Option<SearchCounters>,
    },
}
/// Hand-checked signed-offset interval on one normalized field.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedOffsetInterval {
    pub field_path: String,
    pub nominal: i64,
    pub minus_mm: u64,
    pub plus_mm: u64,
    pub low: i64,
    pub high: i64,
}
/// One shared domain interchange case, executed through the identical
/// `Runtime::handle_json` path natively and inside the real browser
/// Worker/WASM. `input` stays untyped so malformed payloads reach the Rust
/// decoder unchanged.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DomainFixture {
    pub fixture_schema_version: u32,
    pub case_id: String,
    pub operation: DomainOperation,
    pub schema_version: u32,
    pub input: Value,
    pub engine_context: EngineContext,
    pub expected: DomainFixtureExpected,
    /// Optional group unit conversions exercised with this normalize call.
    #[serde(default)]
    pub group_format_requests: Vec<MeasurementGroupFormatRequest>,
}
/// The JSON requests a domain fixture drives through `Runtime::handle_json`,
/// in order. Both the native fixture runner and the browser harness send
/// these exact payloads, so parity covers the whole protocol path.
pub fn domain_fixture_requests(fixture: &DomainFixture) -> Vec<Value> {
    let meta = |request_id: &str, system: bool, context_id: Option<&str>| {
        json!({
            "protocolVersion": 1,
            "schemaVersion": 1,
            "workerSessionId": "fixture-session",
            "projectActivationId": (if system { "system" } else { "fixture-activation" }),
            "requestId": request_id,
            "projectId": (if system { "system" } else { "fixture-project" }),
            "editorEpoch": "0",
            "inputRevision": "0",
            "contextId": context_id
        })
    };
    let request = |meta: Value, command: Value| json!({ "meta": meta, "command": command });
    let initialize = request(
        meta("fixture-initialize", true, None),
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    match fixture.operation {
        DomainOperation::NormalizeProjectInput => vec![
            initialize,
            request(
                meta("fixture-activate", false, None),
                json!({ "kind": "activateProject", "context": { "kind": "bootstrap" } }),
            ),
            request(
                meta("fixture-operation", false, None),
                json!({
                    "kind": "normalizeInput",
                    "input": { "kind": "project", "project": fixture.input.clone() },
                    "priorInputDigest": null,
                    "formatRequests": [],
                    "groupFormatRequests": fixture.group_format_requests
                }),
            ),
        ],
        DomainOperation::VerifyRecord => vec![
            initialize,
            request(
                meta("fixture-operation", true, None),
                json!({ "kind": "verifyRecord", "record": fixture.input.clone() }),
            ),
        ],
        DomainOperation::NormalizeCatalogFields => vec![
            initialize,
            request(
                meta("fixture-operation", true, None),
                json!({ "kind": "normalizeCatalogFields", "fields": fixture.input.clone() }),
            ),
        ],
        DomainOperation::ValidateCatalog => vec![
            // First-open import: validation runs under the initialized system
            // identity — no project is fabricated to reach the operation.
            initialize,
            request(
                meta("fixture-operation", true, None),
                json!({ "kind": "validateCatalog", "catalog": fixture.input.clone() }),
            ),
        ],
        DomainOperation::ValidateCandidate => {
            // input: {"input": <ProjectInput>, "catalog": <CatalogSnapshot>,
            //         "proposal": <CandidateProposal>}. The operation request
            // is fenced by the activation context id Rust derives here, so
            // the same deterministic identity drives native and browser runs.
            let input: Option<ProjectInput> =
                serde_json::from_value(fixture.input["input"].clone()).ok();
            let catalog: Option<CatalogSnapshot> =
                serde_json::from_value(fixture.input["catalog"].clone()).ok();
            let context_id = input
                .as_ref()
                .zip(catalog.as_ref())
                .map(|(input, catalog)| {
                    canonical::context_id(input, &CatalogContent::from(catalog))
                        .as_str()
                        .to_owned()
                });
            vec![
                initialize,
                request(
                    meta("fixture-activate", false, None),
                    json!({
                        "kind": "activateProject",
                        "context": {
                            "kind": "project",
                            "input": fixture.input["input"].clone(),
                            "catalog": fixture.input["catalog"].clone()
                        }
                    }),
                ),
                request(
                    meta("fixture-operation", false, context_id.as_deref()),
                    json!({
                        "kind": "validateCandidate",
                        "proposal": fixture.input["proposal"].clone()
                    }),
                ),
            ]
        }
        DomainOperation::EvaluateLayoutEdit => {
            // input: {"input": <ProjectInput>, "catalog": <CatalogSnapshot>,
            //         "base": <PlanSnapshot>, "command": <LayoutEditCommand>,
            //         "source"?: <PlanSnapshot>}. The operation request is
            // fenced by the activation context id like validateCandidate.
            let input: Option<ProjectInput> =
                serde_json::from_value(fixture.input["input"].clone()).ok();
            let catalog: Option<CatalogSnapshot> =
                serde_json::from_value(fixture.input["catalog"].clone()).ok();
            let context_id = input
                .as_ref()
                .zip(catalog.as_ref())
                .map(|(input, catalog)| {
                    canonical::context_id(input, &CatalogContent::from(catalog))
                        .as_str()
                        .to_owned()
                });
            vec![
                initialize,
                request(
                    meta("fixture-activate", false, None),
                    json!({
                        "kind": "activateProject",
                        "context": {
                            "kind": "project",
                            "input": fixture.input["input"].clone(),
                            "catalog": fixture.input["catalog"].clone()
                        }
                    }),
                ),
                request(
                    meta("fixture-operation", false, context_id.as_deref()),
                    json!({
                        "kind": "evaluateLayoutEdit",
                        "baseSnapshot": fixture.input["base"].clone(),
                        "command": fixture.input["command"].clone(),
                        "sourceSnapshot": fixture
                            .input
                            .get("source")
                            .cloned()
                            .unwrap_or(Value::Null)
                    }),
                ),
            ]
        }
        DomainOperation::ProposeStrategies => {
            // input: {"input": <ProjectInput>, "catalog": <CatalogSnapshot>}
            let (input, catalog) = (
                fixture.input["input"].clone(),
                fixture.input["catalog"].clone(),
            );
            let context_id = project_context_id(&input, &catalog);
            vec![
                initialize,
                request(
                    meta("fixture-activate", false, None),
                    json!({
                        "kind": "activateProject",
                        "context": { "kind": "project", "input": input, "catalog": catalog }
                    }),
                ),
                request(
                    meta("fixture-operation", false, context_id.as_deref()),
                    json!({ "kind": "proposeStrategies" }),
                ),
            ]
        }
        DomainOperation::QueryNextFacts => vec![
            initialize,
            request(
                meta("fixture-operation", true, None),
                json!({
                    "kind": "queryNextFacts",
                    "input": fixture.input["input"].clone(),
                    "inputDigest": fixture.input["inputDigest"].clone(),
                    "snapshot": fixture.input["snapshot"].clone()
                }),
            ),
        ],
        DomainOperation::QueryActionEligibility => vec![
            initialize,
            request(
                meta("fixture-operation", true, None),
                json!({
                    "kind": "queryActionEligibility",
                    "snapshot": fixture.input["snapshot"].clone(),
                    "progress": fixture.input["progress"].clone(),
                    "stamp": fixture.input["stamp"].clone()
                }),
            ),
        ],
        DomainOperation::ProjectSpatialView => vec![
            // A projection over an embedded validated source runs under the
            // initialized system identity — no project is fabricated.
            initialize,
            request(
                meta("fixture-operation", true, None),
                json!({ "kind": "projectSpatialView", "source": fixture.input.clone() }),
            ),
        ],
        DomainOperation::RunSearch => {
            // input: {"input": <ProjectInput>, "catalog": <CatalogSnapshot>,
            //         "mode"?, "steps"?, "cancelAfterSteps"?}. Step requests
            // are expanded here so the exact wire sequence is identical for
            // the native runner and the browser harness.
            let spec: RunSearchSpec =
                serde_json::from_value(fixture.input.clone()).unwrap_or_else(|_| RunSearchSpec {
                    input: fixture.input["input"].clone(),
                    catalog: fixture.input["catalog"].clone(),
                    mode: None,
                    steps: vec![],
                    cancel_after_steps: None,
                });
            let context_id = project_context_id(&spec.input, &spec.catalog);
            let mode = spec
                .mode
                .map(|m| serde_json::to_value(m).unwrap_or(Value::Null))
                .unwrap_or_else(|| json!("manual"));
            let mut requests = vec![
                initialize,
                request(
                    meta("fixture-activate", false, None),
                    json!({
                        "kind": "activateProject",
                        "context": {
                            "kind": "project",
                            "input": spec.input,
                            "catalog": spec.catalog
                        }
                    }),
                ),
                request(
                    meta("fixture-operation", false, context_id.as_deref()),
                    json!({ "kind": "startSearch", "mode": mode }),
                ),
            ];
            let mut emitted_steps: u32 = 0;
            'steps: for step in &spec.steps {
                for _ in 0..step.count {
                    if requests.len() - 3 >= MAX_FIXTURE_SEARCH_STEPS {
                        break 'steps;
                    }
                    emitted_steps += 1;
                    requests.push(request(
                        meta(
                            &format!("fixture-step-{emitted_steps}"),
                            false,
                            context_id.as_deref(),
                        ),
                        json!({
                            "kind": "stepSearch",
                            "searchId": "search-1",
                            "allowance": step.allowance
                        }),
                    ));
                    if spec.cancel_after_steps == Some(emitted_steps) {
                        requests.push(request(
                            meta("fixture-cancel", false, context_id.as_deref()),
                            json!({ "kind": "cancelSearch", "searchId": "search-1" }),
                        ));
                        break 'steps;
                    }
                }
            }
            if spec.steps.is_empty() && spec.cancel_after_steps == Some(0) {
                requests.push(request(
                    meta("fixture-cancel", false, context_id.as_deref()),
                    json!({ "kind": "cancelSearch", "searchId": "search-1" }),
                ));
            }
            requests
        }
    }
}
/// Derive the activation `contextId` the runtime will issue for a project
/// context, mirroring `Runtime::handle_command`. `None` when the payload
/// cannot decode — activation will fail before the operation request matters.
fn project_context_id(input: &Value, catalog: &Value) -> Option<String> {
    let input: ProjectInput = serde_json::from_value(input.clone()).ok()?;
    let catalog: CatalogSnapshot = serde_json::from_value(catalog.clone()).ok()?;
    Some(
        canonical::context_id(&input, &CatalogContent::from(&catalog))
            .as_str()
            .to_owned(),
    )
}
fn check_offset_intervals(
    fixture: &DomainFixture,
    event: &Value,
    expected: &[ExpectedOffsetInterval],
) -> Result<(), String> {
    if expected.is_empty() {
        return Ok(());
    }
    let input = event
        .get("normalizedInput")
        .and_then(|value| value.get("input"))
        .ok_or_else(|| {
            format!(
                "{}: offset interval without normalized input",
                fixture.case_id
            )
        })?;
    for interval in expected {
        let (Ok(minus), Ok(plus)) = (
            i64::try_from(interval.minus_mm),
            i64::try_from(interval.plus_mm),
        ) else {
            return Err(format!("{}: offset bounds do not fit i64", fixture.case_id));
        };
        let (Some(low), Some(high)) = (
            interval.nominal.checked_sub(minus),
            interval.nominal.checked_add(plus),
        ) else {
            return Err(format!(
                "{}: hand-checked interval overflow",
                fixture.case_id
            ));
        };
        if interval.low != low || interval.high != high {
            return Err(format!(
                "{}: hand-checked interval arithmetic does not match {} nominal/bounds",
                fixture.case_id, interval.field_path
            ));
        }
        let mut cursor = input;
        for segment in interval.field_path.split('.') {
            cursor = cursor.get(segment).ok_or_else(|| {
                format!(
                    "{}: missing normalized field {}",
                    fixture.case_id, interval.field_path
                )
            })?;
        }
        let nominal = cursor["value"]["nominal"].as_i64();
        let minus = cursor["value"]["uncertainty"]["minusMm"].as_u64();
        let plus = cursor["value"]["uncertainty"]["plusMm"].as_u64();
        let state = cursor["value"]["uncertainty"]["state"].as_str();
        if cursor["state"] != "known"
            || state != Some("bounded")
            || nominal != Some(interval.nominal)
            || minus != Some(interval.minus_mm)
            || plus != Some(interval.plus_mm)
            || cursor["provenance"]["verification"] != "unverified"
        {
            return Err(format!(
                "{}: offset {} is not the hand-checked interval: {cursor}",
                fixture.case_id, interval.field_path
            ));
        }
    }
    Ok(())
}
fn sorted_diagnostics(event: &Value) -> Vec<ExpectedDiagnostic> {
    let mut diagnostics: Vec<ExpectedDiagnostic> = event
        .get("diagnostics")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|d| ExpectedDiagnostic {
                    field_path: d["fieldPath"].as_str().unwrap_or_default().to_owned(),
                    code: d["code"].as_str().unwrap_or_default().to_owned(),
                })
                .collect()
        })
        .unwrap_or_default();
    diagnostics.sort();
    diagnostics
}
/// Execute one shared domain fixture through a fresh engine-less
/// `Runtime::handle_json` and check the oracle.
pub fn execute_domain_fixture(fixture: &DomainFixture) -> Result<Value, String> {
    let mut runtime = Runtime::new();
    execute_domain_fixture_with(fixture, &mut runtime)
}
/// Execute one shared domain fixture through `Runtime::handle_json` on the
/// supplied runtime (hosts install a `SearchEngine` for search fixtures) and
/// check the oracle. Returns the operation event JSON; the same event is
/// produced by the browser Worker path for byte-level parity.
pub fn execute_domain_fixture_with(
    fixture: &DomainFixture,
    runtime: &mut Runtime,
) -> Result<Value, String> {
    if fixture.fixture_schema_version != 1
        || fixture.schema_version != 1
        || fixture.engine_context.build_id != BUILD_ID
    {
        return Err(format!("{}: unsupported fixture contract", fixture.case_id));
    }
    let expected_kind = serde_json::to_value(fixture.operation)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default();
    let actual_kind = serde_json::to_value(&fixture.expected)
        .ok()
        .and_then(|v| v.get("kind").and_then(Value::as_str).map(str::to_owned))
        .unwrap_or_default();
    if expected_kind != actual_kind {
        return Err(format!(
            "{}: expected kind must match operation",
            fixture.case_id
        ));
    }
    let requests = domain_fixture_requests(fixture);
    let mut event = Value::Null;
    for request in &requests {
        let response: Value = serde_json::from_str(&runtime.handle_json(&request.to_string()))
            .map_err(|e| format!("{}: response not JSON: {e}", fixture.case_id))?;
        event = response.get("event").cloned().unwrap_or(Value::Null);
        // For search fixtures the oracle asserts on the terminal event; the
        // first completed/cancelled/failed event wins and later noise from
        // redundant declared steps is ignored. The browser harness captures
        // the identical event.
        if fixture.operation == DomainOperation::RunSearch
            && matches!(
                event["kind"].as_str(),
                Some("searchCompleted") | Some("searchCancelled") | Some("operationFailed")
            )
        {
            break;
        }
    }
    let decode_error = event["kind"] == "operationFailed" && event["code"] == "invalid_input";
    let expected = &fixture.expected;
    let declared_decode = match expected {
        DomainFixtureExpected::NormalizeProjectInput { decode_error, .. }
        | DomainFixtureExpected::VerifyRecord { decode_error, .. }
        | DomainFixtureExpected::NormalizeCatalogFields { decode_error, .. }
        | DomainFixtureExpected::ValidateCatalog { decode_error, .. }
        | DomainFixtureExpected::ValidateCandidate { decode_error, .. }
        | DomainFixtureExpected::EvaluateLayoutEdit { decode_error, .. }
        | DomainFixtureExpected::ProposeStrategies { decode_error, .. }
        | DomainFixtureExpected::RunSearch { decode_error, .. }
        | DomainFixtureExpected::ProjectSpatialView { decode_error, .. }
        | DomainFixtureExpected::QueryNextFacts { decode_error, .. }
        | DomainFixtureExpected::QueryActionEligibility { decode_error, .. } => *decode_error,
    };
    if declared_decode != decode_error {
        return Err(format!(
            "{}: decode expectation mismatch (expected decodeError={declared_decode}, got {event})",
            fixture.case_id
        ));
    }
    if decode_error {
        return Ok(event);
    }
    // A structured projection rejection (integrity/limit/range) is asserted
    // by its exact failure code; geometry assertions do not apply then.
    if let Some(code) = match expected {
        DomainFixtureExpected::ProjectSpatialView { failure_code, .. }
        | DomainFixtureExpected::QueryNextFacts { failure_code, .. }
        | DomainFixtureExpected::QueryActionEligibility { failure_code, .. } => {
            failure_code.as_ref()
        }
        _ => None,
    } {
        if event["kind"] != "operationFailed" || event["code"].as_str() != Some(code.as_str()) {
            return Err(format!(
                "{}: expected operationFailed/{code}, got {event}",
                fixture.case_id
            ));
        }
        return Ok(event);
    }
    match expected {
        DomainFixtureExpected::NormalizeProjectInput {
            diagnostics,
            input_digest,
            offset_intervals,
            formatted_groups,
            ..
        } => {
            if event["kind"] != "normalized" {
                return Err(format!(
                    "{}: expected normalized event, got {event}",
                    fixture.case_id
                ));
            }
            let mut expected_sorted = diagnostics.clone();
            expected_sorted.sort();
            if sorted_diagnostics(&event) != expected_sorted {
                return Err(format!(
                    "{}: diagnostics mismatch: {event}",
                    fixture.case_id
                ));
            }
            let actual_digest = event["inputDigest"].as_str().map(str::to_owned);
            if actual_digest != input_digest.as_ref().map(|d| d.as_str().to_owned()) {
                return Err(format!(
                    "{}: inputDigest mismatch: {event}",
                    fixture.case_id
                ));
            }
            if event["normalizedInput"].is_null() != input_digest.is_none() {
                return Err(format!(
                    "{}: normalizedInput presence must match inputDigest: {event}",
                    fixture.case_id
                ));
            }
            let actual_groups: Vec<FormattedMeasurementGroup> =
                serde_json::from_value(event["formattedGroups"].clone()).map_err(|error| {
                    format!("{}: formattedGroups decode: {error}", fixture.case_id)
                })?;
            if &actual_groups != formatted_groups {
                return Err(format!(
                    "{}: formattedGroups mismatch: {actual_groups:?}",
                    fixture.case_id
                ));
            }
            check_offset_intervals(fixture, &event, offset_intervals)?;
        }
        DomainFixtureExpected::VerifyRecord {
            verified,
            computed_digest,
            diagnostics,
            ..
        } => {
            if event["kind"] != "recordVerified" {
                return Err(format!(
                    "{}: expected recordVerified event, got {event}",
                    fixture.case_id
                ));
            }
            if Some(event["verified"].as_bool().unwrap_or(false)) != *verified {
                return Err(format!("{}: verified mismatch: {event}", fixture.case_id));
            }
            let actual_digest = event["computedDigest"].as_str().map(str::to_owned);
            if actual_digest != computed_digest.as_ref().map(|d| d.as_str().to_owned()) {
                return Err(format!(
                    "{}: computedDigest mismatch: {event}",
                    fixture.case_id
                ));
            }
            let mut expected_sorted = diagnostics.clone();
            expected_sorted.sort();
            if sorted_diagnostics(&event) != expected_sorted {
                return Err(format!(
                    "{}: diagnostics mismatch: {event}",
                    fixture.case_id
                ));
            }
        }
        DomainFixtureExpected::ValidateCatalog {
            diagnostics,
            snapshot_digest,
            ..
        } => {
            if event["kind"] != "catalogValidated" {
                return Err(format!(
                    "{}: expected catalogValidated event, got {event}",
                    fixture.case_id
                ));
            }
            let mut expected_sorted = diagnostics.clone();
            expected_sorted.sort();
            if sorted_diagnostics(&event) != expected_sorted {
                return Err(format!(
                    "{}: diagnostics mismatch: {event}",
                    fixture.case_id
                ));
            }
            let actual_digest = event["snapshot"]["catalogDigest"]
                .as_str()
                .map(str::to_owned);
            if actual_digest != snapshot_digest.as_ref().map(|d| d.as_str().to_owned()) {
                return Err(format!(
                    "{}: snapshot digest mismatch: {event}",
                    fixture.case_id
                ));
            }
            if event["snapshot"].is_null() != snapshot_digest.is_none() {
                return Err(format!(
                    "{}: snapshot presence must match snapshotDigest: {event}",
                    fixture.case_id
                ));
            }
        }
        DomainFixtureExpected::NormalizeCatalogFields { fields, .. } => {
            if event["kind"] != "catalogFieldsNormalized" {
                return Err(format!(
                    "{}: expected catalogFieldsNormalized event, got {event}",
                    fixture.case_id
                ));
            }
            let actual = event["fields"].as_array().cloned().unwrap_or_default();
            if actual.len() != fields.len() {
                return Err(format!(
                    "{}: field count mismatch: {event}",
                    fixture.case_id
                ));
            }
            for (expected_field, actual_field) in fields.iter().zip(actual.iter()) {
                if actual_field["fieldPath"] != expected_field.field_path {
                    return Err(format!("{}: fieldPath mismatch: {event}", fixture.case_id));
                }
                if actual_field["value"] != json!(expected_field.value) {
                    return Err(format!(
                        "{}: field value mismatch for {}: {event}",
                        fixture.case_id, expected_field.field_path
                    ));
                }
                let codes: Vec<&str> = actual_field["diagnostics"]
                    .as_array()
                    .map(|ds| ds.iter().filter_map(|d| d["code"].as_str()).collect())
                    .unwrap_or_default();
                if codes
                    != expected_field
                        .diagnostic_codes
                        .iter()
                        .map(String::as_str)
                        .collect::<Vec<_>>()
                {
                    return Err(format!(
                        "{}: field diagnostics mismatch for {}: {event}",
                        fixture.case_id, expected_field.field_path
                    ));
                }
            }
        }
        DomainFixtureExpected::ValidateCandidate {
            diagnostics,
            checks,
            physical_assurance,
            commerce_readiness,
            snapshot_digest,
            ..
        }
        | DomainFixtureExpected::EvaluateLayoutEdit {
            diagnostics,
            checks,
            physical_assurance,
            commerce_readiness,
            snapshot_digest,
            ..
        } => {
            let expected_event = if matches!(fixture.operation, DomainOperation::EvaluateLayoutEdit)
            {
                "editEvaluated"
            } else {
                "candidateValidated"
            };
            if event["kind"] != expected_event {
                return Err(format!(
                    "{}: expected {expected_event} event, got {event}",
                    fixture.case_id
                ));
            }
            let mut expected_sorted = diagnostics.clone();
            expected_sorted.sort();
            if sorted_diagnostics(&event) != expected_sorted {
                return Err(format!(
                    "{}: diagnostics mismatch: {event}",
                    fixture.case_id
                ));
            }
            let report = &event["report"];
            let actual_checks = report["checks"].as_array().cloned().unwrap_or_default();
            for expected_check in checks {
                let Some(actual) = actual_checks
                    .iter()
                    .find(|c| c["id"].as_str() == Some(expected_check.id.as_str()))
                else {
                    return Err(format!(
                        "{}: missing check {}: {event}",
                        fixture.case_id, expected_check.id
                    ));
                };
                let actual_status = actual["status"].as_str().unwrap_or_default();
                let expected_status = serde_json::to_value(&expected_check.status)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_owned))
                    .unwrap_or_default();
                if actual_status != expected_status {
                    return Err(format!(
                        "{}: check {} status {actual_status}, expected {expected_status}: {event}",
                        fixture.case_id, expected_check.id
                    ));
                }
                if let Some(reason) = &expected_check.reason_code
                    && actual["reasonCode"].as_str() != Some(reason.as_str())
                {
                    return Err(format!(
                        "{}: check {} reason mismatch: {event}",
                        fixture.case_id, expected_check.id
                    ));
                }
            }
            let compare_enum = |field: &str, expected: &Option<Value>| -> Result<(), String> {
                if let Some(expected) = expected
                    && report[field].as_str() != expected.as_str()
                {
                    return Err(format!("{}: {field} mismatch: {event}", fixture.case_id));
                }
                Ok(())
            };
            compare_enum(
                "physicalAssurance",
                &physical_assurance
                    .as_ref()
                    .and_then(|v| serde_json::to_value(v).ok()),
            )?;
            compare_enum(
                "commerceReadiness",
                &commerce_readiness
                    .as_ref()
                    .and_then(|v| serde_json::to_value(v).ok()),
            )?;
            match snapshot_digest {
                Some(digest) => {
                    if event["snapshot"]["planSnapshotId"].as_str() != Some(digest.as_str()) {
                        return Err(format!(
                            "{}: snapshot digest mismatch: {event}",
                            fixture.case_id
                        ));
                    }
                }
                None if !event["snapshot"].is_null() => {
                    return Err(format!(
                        "{}: rejected candidate must not publish a snapshot: {event}",
                        fixture.case_id
                    ));
                }
                None => {}
            }
        }
        DomainFixtureExpected::ProposeStrategies {
            strategies,
            condition_codes,
            ..
        } => {
            if event["kind"] != "strategiesProposed" {
                return Err(format!(
                    "{}: expected strategiesProposed event, got {event}",
                    fixture.case_id
                ));
            }
            let decisions = event["decisions"].as_array().cloned().unwrap_or_default();
            let actual_strategies: Vec<String> = decisions
                .iter()
                .filter_map(|d| d["strategy"].as_str().map(str::to_owned))
                .collect();
            let expected_strategies: Vec<String> = strategies
                .iter()
                .filter_map(|s| {
                    serde_json::to_value(s)
                        .ok()
                        .and_then(|v| v.as_str().map(str::to_owned))
                })
                .collect();
            if actual_strategies != expected_strategies {
                return Err(format!(
                    "{}: strategy order mismatch: {event}",
                    fixture.case_id
                ));
            }
            let mut actual_codes: Vec<String> = decisions
                .iter()
                .flat_map(|d| {
                    d["assumptions"]
                        .as_array()
                        .cloned()
                        .unwrap_or_default()
                        .iter()
                        .filter_map(|a| a["code"].as_str().map(str::to_owned))
                        .collect::<Vec<_>>()
                })
                .collect();
            actual_codes.sort();
            actual_codes.dedup();
            let mut expected_codes = condition_codes.clone();
            expected_codes.sort();
            expected_codes.dedup();
            if actual_codes != expected_codes {
                return Err(format!(
                    "{}: condition codes mismatch: {event}",
                    fixture.case_id
                ));
            }
        }
        DomainFixtureExpected::QueryNextFacts { reply, .. } => {
            if event["kind"] != "nextFactsQueried" {
                return Err(format!(
                    "{}: expected nextFactsQueried event, got {event}",
                    fixture.case_id
                ));
            }
            let actual: NextFactsReply =
                serde_json::from_value(event["reply"].clone()).map_err(|error| {
                    format!("{}: next facts reply decode: {error}", fixture.case_id)
                })?;
            if Some(&actual) != reply.as_ref() {
                return Err(format!(
                    "{}: next facts reply mismatch: {event}",
                    fixture.case_id
                ));
            }
        }
        DomainFixtureExpected::QueryActionEligibility { reply, .. } => {
            if event["kind"] != "actionEligibilityQueried" {
                return Err(format!(
                    "{}: expected actionEligibilityQueried event, got {event}",
                    fixture.case_id
                ));
            }
            let actual: ActionEligibilityReply = serde_json::from_value(event["reply"].clone())
                .map_err(|error| {
                    format!(
                        "{}: action eligibility reply decode: {error}",
                        fixture.case_id
                    )
                })?;
            if Some(&actual) != reply.as_ref() {
                return Err(format!(
                    "{}: action eligibility reply mismatch: {event}",
                    fixture.case_id
                ));
            }
        }
        DomainFixtureExpected::RunSearch {
            termination,
            alternative_digests,
            diagnostic_reasons,
            restriction_codes,
            consumed,
            ..
        } => {
            let kind = event["kind"].as_str().unwrap_or_default();
            let (result, counters) = match kind {
                "searchCompleted" => (event["result"].clone(), event["result"]["consumed"].clone()),
                "searchCancelled" => (Value::Null, event["consumed"].clone()),
                "searchProgress" | "searchStarted" => (Value::Null, Value::Null),
                _ => {
                    return Err(format!(
                        "{}: unexpected terminal event kind {kind}: {event}",
                        fixture.case_id
                    ));
                }
            };
            let actual_termination = result["termination"].clone();
            let expected_termination = termination
                .as_ref()
                .map(|t| serde_json::to_value(t).unwrap_or(Value::Null));
            if kind == "searchCancelled" {
                if expected_termination != Some(json!("cancelled")) {
                    return Err(format!(
                        "{}: cancelled run must expect termination cancelled: {event}",
                        fixture.case_id
                    ));
                }
            } else if actual_termination != json!(expected_termination) {
                return Err(format!(
                    "{}: termination mismatch: {event}",
                    fixture.case_id
                ));
            }
            let expected_digests: Vec<String> = alternative_digests
                .iter()
                .map(|d| d.as_str().to_owned())
                .collect();
            let actual_digests: Vec<String> = result["alternatives"]
                .as_array()
                .map(|alts| {
                    alts.iter()
                        .filter_map(|a| a["planSnapshotId"].as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            if actual_digests != expected_digests {
                return Err(format!(
                    "{}: alternative digest order mismatch: {event}",
                    fixture.case_id
                ));
            }
            let mut actual_reasons: Vec<String> = result["diagnosticCandidates"]
                .as_array()
                .map(|ds| {
                    ds.iter()
                        .filter_map(|d| d["reasonCode"].as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            actual_reasons.sort();
            actual_reasons.dedup();
            let mut expected_reasons = diagnostic_reasons.clone();
            expected_reasons.sort();
            expected_reasons.dedup();
            if actual_reasons != expected_reasons {
                return Err(format!(
                    "{}: diagnostic reasons mismatch: {event}",
                    fixture.case_id
                ));
            }
            let mut actual_restrictions: Vec<String> = result["scope"]["restrictions"]
                .as_array()
                .map(|rs| {
                    rs.iter()
                        .filter_map(|r| r["code"].as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            actual_restrictions.sort();
            actual_restrictions.dedup();
            let mut expected_restrictions = restriction_codes.clone();
            expected_restrictions.sort();
            expected_restrictions.dedup();
            if actual_restrictions != expected_restrictions {
                return Err(format!(
                    "{}: scope restrictions mismatch: {event}",
                    fixture.case_id
                ));
            }
            if (consumed.is_some() || kind == "searchCompleted") && json!(consumed) != counters {
                return Err(format!(
                    "{}: consumed counters mismatch: {event}",
                    fixture.case_id
                ));
            }
        }
        DomainFixtureExpected::ProjectSpatialView {
            elements,
            overlays,
            links,
            dimensions,
            projection_digest,
            ..
        } => {
            if event["kind"] != "spatialViewProjected" {
                return Err(format!(
                    "{}: expected spatialViewProjected event, got {event}",
                    fixture.case_id
                ));
            }
            let projection = &event["projection"];
            if projection["projectionVersion"].as_u64() != Some(1) {
                return Err(format!(
                    "{}: projectionVersion must be 1: {event}",
                    fixture.case_id
                ));
            }
            let compare_elements = |expected: &[ExpectedSpatialElement]| -> Result<(), String> {
                let actual = projection["elements"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                if actual.len() != expected.len() {
                    return Err(format!(
                        "{}: element count {} != {}: {event}",
                        fixture.case_id,
                        actual.len(),
                        expected.len()
                    ));
                }
                for (expected, actual) in expected.iter().zip(actual.iter()) {
                    if actual["target"] != json!(expected.target)
                        || actual["role"] != json!(expected.role)
                        || actual["parentPlacementId"] != json!(expected.parent_placement_id)
                    {
                        return Err(format!(
                            "{}: element identity mismatch: {event}",
                            fixture.case_id
                        ));
                    }
                    if box_geometry(&actual["worldBox"])? != expected.world
                        || rect_geometry(&actual["topRect"])? != expected.top
                        || rect_geometry(&actual["frontRect"])? != expected.front
                        || box_geometry(&actual["cavityLocalBox"])? != expected.cavity_local
                        || box_geometry(&actual["measurementBox"])? != expected.measurement
                    {
                        return Err(format!(
                            "{}: element geometry mismatch: {event}",
                            fixture.case_id
                        ));
                    }
                }
                Ok(())
            };
            compare_elements(elements)?;
            let actual_overlays = projection["overlays"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            if actual_overlays.len() != overlays.len() {
                return Err(format!(
                    "{}: overlay count {} != {}: {event}",
                    fixture.case_id,
                    actual_overlays.len(),
                    overlays.len()
                ));
            }
            for (expected, actual) in overlays.iter().zip(actual_overlays.iter()) {
                if actual["target"] != json!(expected.target)
                    || actual["role"] != json!(expected.role)
                    || actual["motionPhase"] != json!(expected.motion_phase)
                {
                    return Err(format!(
                        "{}: overlay identity mismatch: {event}",
                        fixture.case_id
                    ));
                }
                if box_geometry(&actual["geometry"])? != expected.geometry {
                    return Err(format!(
                        "{}: overlay geometry mismatch: {event}",
                        fixture.case_id
                    ));
                }
            }
            let actual_links = projection["links"].as_array().cloned().unwrap_or_default();
            if actual_links.len() != links.len() {
                return Err(format!(
                    "{}: link count {} != {}: {event}",
                    fixture.case_id,
                    actual_links.len(),
                    links.len()
                ));
            }
            for (expected, actual) in links.iter().zip(actual_links.iter()) {
                if actual["source"] != json!(expected.source)
                    || actual["targets"] != json!(expected.targets)
                    || actual["resolution"] != json!(expected.resolution)
                    || actual["unresolvedSubjectIds"] != json!(expected.unresolved_subject_ids)
                    || actual["reasonCode"] != json!(expected.reason_code)
                {
                    return Err(format!("{}: link mismatch: {event}", fixture.case_id));
                }
            }
            let actual_guides = projection["dimensions"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            if actual_guides.len() != dimensions.len() {
                return Err(format!(
                    "{}: dimension guide count {} != {}: {event}",
                    fixture.case_id,
                    actual_guides.len(),
                    dimensions.len()
                ));
            }
            for (expected, actual) in dimensions.iter().zip(actual_guides.iter()) {
                if actual["guideId"] != json!(expected.guide_id)
                    || actual["fieldPath"] != json!(expected.field_path)
                    || actual["preferredView"] != json!(expected.preferred_view)
                {
                    return Err(format!(
                        "{}: dimension guide mismatch: {event}",
                        fixture.case_id
                    ));
                }
                match &expected.segment {
                    ExpectedSegmentGeometry::Available { from, to } => {
                        if actual["segment"]["kind"] != json!("available")
                            || actual["segment"]["value"]["from"] != json!(from)
                            || actual["segment"]["value"]["to"] != json!(to)
                        {
                            return Err(format!(
                                "{}: dimension segment mismatch: {event}",
                                fixture.case_id
                            ));
                        }
                    }
                    ExpectedSegmentGeometry::Unavailable { reason_code } => {
                        if actual["segment"]["kind"] != json!("unavailable")
                            || actual["segment"]["reasonCode"] != json!(reason_code)
                        {
                            return Err(format!(
                                "{}: dimension segment mismatch: {event}",
                                fixture.case_id
                            ));
                        }
                    }
                }
            }
            let typed: SpatialProjection = serde_json::from_value(projection.clone())
                .map_err(|e| format!("{}: projection decode: {e}", fixture.case_id))?;
            if canonical::content_digest(&typed) != *projection_digest {
                return Err(format!(
                    "{}: projection digest mismatch: {event}",
                    fixture.case_id
                ));
            }
        }
    }
    Ok(event)
}

/// Convert one emitted box geometry into its comparable expected form.
fn box_geometry(value: &Value) -> Result<ExpectedBoxGeometry, String> {
    let axis3 = |v: &Value| -> Result<[i64; 3], String> {
        let array = v.as_array().cloned().unwrap_or_default();
        if array.len() != 3 {
            return Err("box axis must have three entries".into());
        }
        Ok([
            array[0].as_i64().unwrap_or_default(),
            array[1].as_i64().unwrap_or_default(),
            array[2].as_i64().unwrap_or_default(),
        ])
    };
    match value["kind"].as_str().unwrap_or_default() {
        "available" => Ok(ExpectedBoxGeometry::Available {
            min: axis3(&value["value"]["min"])?,
            max: axis3(&value["value"]["max"])?,
            basis: serde_json::from_value(value["basis"].clone())
                .map_err(|e| format!("basis decode: {e}"))?,
        }),
        "unavailable" => Ok(ExpectedBoxGeometry::Unavailable {
            reason_code: value["reasonCode"].as_str().unwrap_or_default().to_owned(),
        }),
        "notApplicable" => Ok(ExpectedBoxGeometry::NotApplicable {
            reason_code: value["reasonCode"].as_str().unwrap_or_default().to_owned(),
        }),
        other => Err(format!("unknown box geometry kind: {other}")),
    }
}

/// Convert one emitted rectangle geometry into its comparable expected form.
fn rect_geometry(value: &Value) -> Result<ExpectedRectGeometry, String> {
    let axis2 = |v: &Value| -> Result<[i64; 2], String> {
        let array = v.as_array().cloned().unwrap_or_default();
        if array.len() != 2 {
            return Err("rect axis must have two entries".into());
        }
        Ok([
            array[0].as_i64().unwrap_or_default(),
            array[1].as_i64().unwrap_or_default(),
        ])
    };
    match value["kind"].as_str().unwrap_or_default() {
        "available" => Ok(ExpectedRectGeometry::Available {
            min: axis2(&value["value"]["min"])?,
            max: axis2(&value["value"]["max"])?,
        }),
        "unavailable" => Ok(ExpectedRectGeometry::Unavailable {
            reason_code: value["reasonCode"].as_str().unwrap_or_default().to_owned(),
        }),
        "notApplicable" => Ok(ExpectedRectGeometry::NotApplicable {
            reason_code: value["reasonCode"].as_str().unwrap_or_default().to_owned(),
        }),
        other => Err(format!("unknown rect geometry kind: {other}")),
    }
}

/// One live resumable search owned by the runtime; the engine owns the
/// cursor, core owns the handle lifecycle.
struct ActiveSearch {
    id: String,
    session: Box<dyn SearchSession>,
}
#[derive(Default)]
pub struct Runtime {
    session: Option<String>,
    active: Option<RequestMeta>,
    /// The contextId issued for the active project context; bootstrap
    /// contexts keep `None` and reject requests that carry one.
    active_context: Option<String>,
    /// The immutable activated project facts the validator evaluates against.
    active_input: Option<ProjectInput>,
    /// The validated catalog bound to the active context's pin.
    active_catalog: Option<CatalogContent>,
    /// Validated immutable catalog cache (bounded at two entries).
    catalogs: VecDeque<(Digest, CatalogContent)>,
    last_disposed: Option<RequestMeta>,
    recent: VecDeque<(String, String, String)>,
    /// Installed search engine; absent on hosts that do not ship a solver.
    engine: Option<Box<dyn SearchEngine>>,
    /// The one live search handle; disposed on activation, replacement,
    /// completion, cancellation or dispose.
    search: Option<ActiveSearch>,
    /// Monotone per-runtime handle counter producing `search-1`, `search-2`, …
    search_counter: u32,
    /// The last search id that reached a terminal event plus its final
    /// counters, so idempotent cancels acknowledge without reviving a handle.
    last_terminal_search: Option<(String, SearchCounters)>,
}
fn failure(code: &str) -> Event {
    Event::OperationFailed {
        code: code.into(),
        affected_fields: vec![],
        affected_ids: vec![],
        retryable: false,
        reason_parameters: BTreeMap::new(),
    }
}
fn fatal(code: &str) -> String {
    serde_json::json!({"kind":"fatalProtocolError","code":code}).to_string()
}
fn digest_valid(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn depth_ok(value: &Value, depth: u32) -> bool {
    depth <= 32
        && match value {
            Value::Object(m) => m.values().all(|v| depth_ok(v, depth + 1)),
            Value::Array(a) => a.iter().all(|v| depth_ok(v, depth + 1)),
            _ => true,
        }
}
fn bootstrap_input_digest(input: &NormalizedBootstrapInput) -> String {
    canonical::content_digest(input).as_str().to_owned()
}
impl Runtime {
    pub fn new() -> Self {
        Self::default()
    }
    /// Install the search engine before initialization. Hosts that do not
    /// ship a solver leave it absent; search commands then answer
    /// `operation_not_supported` and the ready event omits search
    /// capabilities.
    pub fn set_search_engine(&mut self, engine: Box<dyn SearchEngine>) {
        self.engine = Some(engine);
    }
    pub fn handle_json(&mut self, input: &str) -> String {
        if input.len() > MAX_MESSAGE_BYTES {
            return fatal("message_too_large");
        }
        let value: Value = match serde_json::from_str::<UniqueValue>(input) {
            Ok(v) => v.0,
            Err(_) => return fatal("invalid_json"),
        };
        if !depth_ok(&value, 0) {
            return fatal("json_depth_exceeded");
        }
        let meta: RequestMeta = match value
            .get("meta")
            .cloned()
            .and_then(|v| serde_json::from_value(v).ok())
        {
            Some(v) => v,
            None => return fatal("invalid_identity"),
        };
        if [
            &meta.worker_session_id,
            &meta.project_activation_id,
            &meta.request_id,
            &meta.project_id,
        ]
        .iter()
        .any(|id| !valid_id(id))
            || meta.context_id.as_ref().is_some_and(|id| !digest_valid(id))
        {
            return fatal("invalid_identity");
        }
        let canonical_request = value.to_string();
        let response = |event| {
            serde_json::to_string(&ProtocolResponse {
                meta: meta.clone(),
                sequence: 0,
                event,
            })
            .expect("typed response serializes")
        };
        if let Some((_, prior, cached)) =
            self.recent.iter().find(|(id, _, _)| id == &meta.request_id)
        {
            return if prior == &canonical_request {
                cached.clone()
            } else {
                response(failure("request_id_reused"))
            };
        }
        if meta.protocol_version != 1 || meta.schema_version != 1 {
            return response(failure("version_mismatch"));
        }
        let kind = value
            .get("command")
            .and_then(|v| v.get("kind"))
            .and_then(Value::as_str);
        if kind.is_some_and(|k| {
            !COMMAND_KINDS.contains(&k)
                || (self.engine.is_none() && SEARCH_CAPABILITIES.contains(&k))
        }) {
            return response(failure("operation_not_supported"));
        }
        let request: ProtocolRequest = match serde_json::from_value(value) {
            Ok(v) => v,
            Err(_) => return response(failure("invalid_input")),
        };
        let event = self.execute(&request);
        let output = response(event);
        self.recent
            .push_back((meta.request_id, canonical_request, output.clone()));
        if self.recent.len() > 32 {
            self.recent.pop_front();
        }
        output
    }
    fn execute(&mut self, request: &ProtocolRequest) -> Event {
        let meta = &request.meta;
        if let Command::Initialize {
            build_id,
            expected_protocol_version,
            expected_schema_version,
        } = &request.command
        {
            if self.session.is_some() {
                return failure("already_initialized");
            }
            if meta.project_id != "system"
                || meta.project_activation_id != "system"
                || meta.editor_epoch.get() != 0
                || meta.input_revision.get() != 0
                || meta.context_id.is_some()
            {
                return failure("invalid_initialization_identity");
            }
            if build_id != BUILD_ID
                || *expected_protocol_version != 1
                || *expected_schema_version != 1
            {
                return failure("version_mismatch");
            }
            self.session = Some(meta.worker_session_id.clone());
            let mut capabilities: Vec<String> = CAPABILITIES.iter().map(|s| (*s).into()).collect();
            if self.engine.is_some() {
                capabilities.extend(SEARCH_CAPABILITIES.iter().map(|s| (*s).into()));
            }
            return Event::Ready {
                build_id: BUILD_ID.into(),
                protocol_version: 1,
                schema_version: 1,
                canonical_version: canonical::CANONICAL_VERSION,
                rule_version: canonical::RULE_VERSION.into(),
                solver_version: canonical::SOLVER_VERSION_V2.into(),
                capabilities,
            };
        }
        if self.session.as_ref() != Some(&meta.worker_session_id) {
            return failure("worker_session_mismatch");
        }
        // Stateless verification/import operations are also legal under the
        // initialized system identity before any project activation.
        let system_identity = meta.project_id == "system"
            && meta.project_activation_id == "system"
            && meta.editor_epoch.get() == 0
            && meta.input_revision.get() == 0
            && meta.context_id.is_none();
        if system_identity
            && matches!(
                request.command,
                Command::VerifyRecord { .. }
                    | Command::NormalizeCatalogFields { .. }
                    | Command::ValidateCatalog { .. }
                    | Command::ProjectSpatialView { .. }
                    | Command::QueryNextFacts { .. }
                    | Command::QueryActionEligibility { .. }
                    | Command::ApplyInventoryLedger { .. }
                    | Command::ReviewCatalogImport { .. }
                    | Command::QuoteOfferBundle { .. }
            )
        {
            return self.execute_stateless(&request.command);
        }
        if let Command::ActivateProject { context } = &request.command {
            if meta.project_id == "system"
                || meta.project_activation_id == "system"
                || meta.context_id.is_some()
                || self
                    .active
                    .as_ref()
                    .is_some_and(|old| old.project_activation_id == meta.project_activation_id)
            {
                return failure("invalid_project_activation");
            }
            let mut activated: Option<(ProjectInput, CatalogContent)> = None;
            let context_id = match context {
                ActivationContext::Bootstrap {} => None,
                ActivationContext::Project { input, catalog } => {
                    match self.validate_project_context(input, catalog.as_ref()) {
                        Ok((id, content)) => {
                            activated = Some((input.clone(), content));
                            Some(id)
                        }
                        Err(event) => return event,
                    }
                }
            };
            self.active = Some(meta.clone());
            self.active_context = context_id.clone();
            match activated {
                Some((input, catalog)) => {
                    self.active_input = Some(input);
                    self.active_catalog = Some(catalog);
                }
                None => {
                    self.active_input = None;
                    self.active_catalog = None;
                }
            }
            self.last_disposed = None;
            self.search = None;
            self.last_terminal_search = None;
            self.recent.clear();
            return Event::ProjectActivated { context_id };
        }
        let Some(active) = &self.active else {
            if matches!(request.command, Command::DisposeProject { .. })
                && self.last_disposed.as_ref().is_some_and(|old| {
                    old.project_id == meta.project_id
                        && old.project_activation_id == meta.project_activation_id
                        && old.input_revision == meta.input_revision
                        && meta.context_id.is_none()
                })
            {
                return Event::ProjectDisposed;
            }
            return failure("project_not_active");
        };
        if active.project_id != meta.project_id
            || active.project_activation_id != meta.project_activation_id
            || active.input_revision != meta.input_revision
            || meta.context_id.as_deref() != self.active_context.as_deref()
        {
            return failure("stale_result");
        }
        match &request.command {
            Command::NormalizeInput {
                input,
                prior_input_digest,
                format_requests,
                group_format_requests,
            } => {
                if prior_input_digest
                    .as_ref()
                    .is_some_and(|v| !digest_valid(v))
                {
                    return failure("invalid_input");
                }
                match input {
                    NormalizeInputDto::Bootstrap { probe } => {
                        if !group_format_requests.is_empty()
                            || format_requests.len() > 2
                            || format_requests.iter().any(|f| {
                                !matches!(f.field_path.as_str(), "compartmentWidth" | "unitWidth")
                            })
                        {
                            return failure("invalid_format_field");
                        }
                        let (normalized, diagnostics) = normalize_probe(probe);
                        let mut formatted_fields = vec![];
                        for format in format_requests {
                            if diagnostics
                                .iter()
                                .any(|d| d.field_path == format.field_path)
                            {
                                continue;
                            }
                            let fact = if format.field_path == "compartmentWidth" {
                                &normalized.compartment_width
                            } else {
                                &normalized.unit_width
                            };
                            let text = fact
                                .value()
                                .map(|v| format_length(v.nominal, format.unit))
                                .unwrap_or_default();
                            formatted_fields.push(FormattedField {
                                field_path: format.field_path.clone(),
                                unit: format.unit,
                                text,
                            });
                        }
                        let digest = diagnostics
                            .is_empty()
                            .then(|| bootstrap_input_digest(&normalized));
                        Event::Normalized {
                            equivalent_to_prior: digest.is_some() && &digest == prior_input_digest,
                            input_digest: digest,
                            normalized_input: diagnostics
                                .is_empty()
                                .then_some(NormalizedInput::Bootstrap { input: normalized }),
                            formatted_fields,
                            formatted_groups: vec![],
                            diagnostics,
                        }
                    }
                    NormalizeInputDto::Project { project } => {
                        if format_requests.len() > 16 {
                            return failure("invalid_input");
                        }
                        let (input, diagnostics) = normalize_project_input(project);
                        let formatted_groups = match format_measurement_groups(
                            &input,
                            group_format_requests,
                            &diagnostics,
                        ) {
                            Ok(groups) => groups,
                            Err(code) => return failure(code),
                        };
                        let mut formatted_fields = vec![];
                        for format in format_requests {
                            let Some(fact) = project_measurement(&input, &format.field_path) else {
                                return failure("invalid_format_field");
                            };
                            if diagnostics
                                .iter()
                                .any(|d| d.field_path == format.field_path)
                            {
                                continue;
                            }
                            formatted_fields.push(FormattedField {
                                field_path: format.field_path.clone(),
                                unit: format.unit,
                                text: fact
                                    .value()
                                    .map(|v| format_length(v.nominal, format.unit))
                                    .unwrap_or_default(),
                            });
                        }
                        let digest = diagnostics
                            .is_empty()
                            .then(|| canonical::input_digest(&input));
                        Event::Normalized {
                            equivalent_to_prior: digest.is_some()
                                && prior_input_digest.as_deref()
                                    == digest.as_ref().map(Digest::as_str),
                            input_digest: digest.map(|d| d.as_str().to_owned()),
                            normalized_input: diagnostics
                                .is_empty()
                                .then_some(NormalizedInput::Project { input }),
                            formatted_fields,
                            formatted_groups,
                            diagnostics,
                        }
                    }
                }
            }
            Command::EvaluateProbe { probe } => Event::ProbeEvaluated {
                result: evaluate_probe(probe),
            },
            Command::VerifyRecord { .. }
            | Command::NormalizeCatalogFields { .. }
            | Command::ValidateCatalog { .. }
            | Command::ProjectSpatialView { .. }
            | Command::QueryNextFacts { .. }
            | Command::QueryActionEligibility { .. }
            | Command::ApplyInventoryLedger { .. }
            | Command::ReviewCatalogImport { .. }
            | Command::QuoteOfferBundle { .. } => self.execute_stateless(&request.command),
            Command::ValidateCandidate { proposal } => {
                let (Some(input), Some(catalog)) = (&self.active_input, &self.active_catalog)
                else {
                    // Candidate validation requires an activated project
                    // context; bootstrap contexts cannot host a proposal.
                    return failure("invalid_state");
                };
                let versions = CompileVersions {
                    schema_version: canonical::SCHEMA_VERSION,
                    canonical_version: canonical::CANONICAL_VERSION,
                    input_digest: canonical::input_digest(input),
                    catalog_version: catalog.catalog_version.clone(),
                    catalog_digest: canonical::catalog_digest(catalog),
                    rule_version: canonical::RULE_VERSION.into(),
                    solver_version: canonical::solver_version_for(&input.search.profile).into(),
                    search_profile: input.search.profile.clone(),
                    search_budget: input.search.budget.clone(),
                    seed: input.search.seed.clone(),
                };
                let scope = SearchScope {
                    profile: input.search.profile.clone(),
                    budget: input.search.budget.clone(),
                    group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
                    restrictions: vec![],
                };
                let evaluation =
                    finalize::evaluate_candidate(input, catalog, proposal, versions, scope);
                Event::CandidateValidated {
                    report: evaluation.report,
                    snapshot: evaluation.snapshot,
                    diagnostics: evaluation.diagnostics,
                }
            }
            Command::EvaluateLayoutEdit {
                base_snapshot,
                command,
                source_snapshot,
            } => {
                let (Some(input), Some(catalog)) = (&self.active_input, &self.active_catalog)
                else {
                    return failure("invalid_state");
                };
                let versions = CompileVersions {
                    schema_version: canonical::SCHEMA_VERSION,
                    canonical_version: canonical::CANONICAL_VERSION,
                    input_digest: canonical::input_digest(input),
                    catalog_version: catalog.catalog_version.clone(),
                    catalog_digest: canonical::catalog_digest(catalog),
                    rule_version: canonical::RULE_VERSION.into(),
                    solver_version: canonical::solver_version_for(&input.search.profile).into(),
                    search_profile: input.search.profile.clone(),
                    search_budget: input.search.budget.clone(),
                    seed: input.search.seed.clone(),
                };
                let scope = SearchScope {
                    profile: input.search.profile.clone(),
                    budget: input.search.budget.clone(),
                    group_ids: input.groups.iter().map(|g| g.id.clone()).collect(),
                    restrictions: vec![],
                };
                let evaluation = crate::edit::evaluate_layout_edit(
                    input,
                    catalog,
                    base_snapshot,
                    command,
                    source_snapshot.as_ref(),
                    versions,
                    scope,
                );
                Event::EditEvaluated {
                    report: evaluation.report,
                    snapshot: evaluation.snapshot,
                    diagnostics: evaluation.diagnostics,
                }
            }
            Command::ProposeStrategies { .. } => {
                let (Some(input), Some(_)) = (&self.active_input, &self.active_catalog) else {
                    // Strategy proposals need the activated project context.
                    return failure("invalid_state");
                };
                let Some(engine) = &self.engine else {
                    return failure("operation_not_supported");
                };
                Event::StrategiesProposed {
                    decisions: engine.propose_strategies(input),
                }
            }
            Command::EvaluateStrategyLibrary { .. } => {
                let (Some(input), Some(_)) = (&self.active_input, &self.active_catalog) else {
                    return failure("invalid_state");
                };
                let Some(engine) = &self.engine else {
                    return failure("operation_not_supported");
                };
                Event::StrategyLibraryEvaluated {
                    reply: engine.evaluate_strategy_library(input),
                }
            }
            Command::ComparePareto {
                termination,
                alternatives,
            } => {
                let (Some(input), Some(_)) = (&self.active_input, &self.active_catalog) else {
                    return failure("invalid_state");
                };
                if self.engine.is_none() {
                    return failure("operation_not_supported");
                }
                let action = crate::pareto::ParetoCompareAction {
                    termination: termination.clone(),
                    goal: input.strategy_choice.clone(),
                    input_digest: canonical::input_digest(input),
                    budget: input.search.budget.clone(),
                    seed: input.search.seed.clone(),
                    alternatives: alternatives.clone(),
                };
                match crate::pareto::compare(&action) {
                    Ok(reply) => Event::ParetoCompared { reply },
                    Err(error) => failure(error.code),
                }
            }
            Command::ReplanIncremental {
                base_snapshot,
                pins,
            } => {
                let (Some(input), Some(catalog)) = (&self.active_input, &self.active_catalog)
                else {
                    return failure("invalid_state");
                };
                let Some(engine) = &self.engine else {
                    return failure("operation_not_supported");
                };
                let wanted = if pins.strategy {
                    base_snapshot.content.strategy.strategy.clone()
                } else {
                    input.strategy_choice.clone()
                };
                let Some(strategy) = engine
                    .propose_strategies(input)
                    .into_iter()
                    .find(|decision| decision.strategy == wanted)
                else {
                    return failure("strategy_unavailable");
                };
                match crate::incremental::replan(&crate::incremental::ReplanAction {
                    base: base_snapshot,
                    input,
                    catalog,
                    pins,
                    strategy: &strategy,
                }) {
                    Ok(reply) => Event::IncrementalReplanned { reply },
                    Err(error) => failure(error.code),
                }
            }
            Command::StartSearch { mode } => {
                let (Some(input), Some(catalog)) = (&self.active_input, &self.active_catalog)
                else {
                    return failure("invalid_state");
                };
                let Some(engine) = &self.engine else {
                    return failure("operation_not_supported");
                };
                // Any prior handle is dropped before the new one is issued;
                // handle ids are monotone per runtime so stale ids are fenced.
                self.search = None;
                self.search_counter += 1;
                let search_id = format!("search-{}", self.search_counter);
                self.search = Some(ActiveSearch {
                    id: search_id.clone(),
                    session: engine.start(input, catalog),
                });
                Event::SearchStarted {
                    search_id,
                    mode: *mode,
                }
            }
            Command::StepSearch {
                search_id,
                allowance,
            } => {
                let Some(search) = self.search.as_mut() else {
                    return failure("invalid_state");
                };
                if search.id != *search_id {
                    return failure("stale_search_id");
                }
                if *allowance == 0 || *allowance > MAX_STEP_ALLOWANCE {
                    return failure("invalid_allowance");
                }
                let id = search.id.clone();
                match search.session.step(*allowance) {
                    SearchStep::Progress { consumed } => Event::SearchProgress {
                        search_id: id,
                        consumed,
                    },
                    SearchStep::Completed { result } => {
                        self.last_terminal_search = Some((id.clone(), result.consumed.clone()));
                        self.search = None;
                        Event::SearchCompleted {
                            search_id: id,
                            result,
                        }
                    }
                    SearchStep::Cancelled { consumed } => {
                        self.last_terminal_search = Some((id.clone(), consumed.clone()));
                        self.search = None;
                        Event::SearchCancelled {
                            search_id: id,
                            consumed,
                        }
                    }
                }
            }
            Command::CancelSearch { search_id } => match self.search.take() {
                Some(mut search) if search.id == *search_id => {
                    let consumed = search.session.cancel();
                    self.last_terminal_search = Some((search_id.clone(), consumed.clone()));
                    Event::SearchCancelled {
                        search_id: search_id.clone(),
                        consumed,
                    }
                }
                Some(search) => {
                    self.search = Some(search);
                    failure("stale_search_id")
                }
                // Idempotent within the activation: a handle that already
                // terminated still acknowledges, a never-issued id fails.
                None => match self.last_terminal_search.as_ref() {
                    Some((id, consumed)) if id == search_id => Event::SearchCancelled {
                        search_id: search_id.clone(),
                        consumed: consumed.clone(),
                    },
                    _ => failure("invalid_state"),
                },
            },
            Command::DisposeProject { .. } => {
                self.last_disposed = self.active.take();
                self.active_context = None;
                self.active_input = None;
                self.active_catalog = None;
                self.search = None;
                self.last_terminal_search = None;
                self.recent.clear();
                Event::ProjectDisposed
            }
            Command::Initialize { .. } | Command::ActivateProject { .. } => {
                failure("invalid_state")
            }
        }
    }
    /// Validate an activation's project context and return its context id
    /// plus the validated catalog content the validator will evaluate
    /// against.
    #[allow(clippy::result_large_err)]
    fn validate_project_context(
        &mut self,
        input: &ProjectInput,
        catalog: Option<&CatalogSnapshot>,
    ) -> Result<(String, CatalogContent), Event> {
        let diagnostics = validate::validate_project_input(input);
        if !diagnostics.is_empty() {
            return Err(Event::OperationFailed {
                code: "invalid_input".into(),
                affected_fields: diagnostics.iter().map(|d| d.field_path.clone()).collect(),
                affected_ids: vec![],
                retryable: false,
                reason_parameters: BTreeMap::new(),
            });
        }
        let content = match catalog {
            Some(snapshot) => {
                let content = CatalogContent::from(snapshot);
                let mut diagnostics = validate::validate_catalog_content(&content);
                if canonical::catalog_digest(&content) != snapshot.catalog_digest {
                    diagnostics.push(Diagnostic {
                        field_path: "catalogDigest".into(),
                        code: "digest_mismatch".into(),
                        reason_code: "digest_mismatch".into(),
                    });
                }
                if !diagnostics.is_empty() {
                    return Err(Event::OperationFailed {
                        code: "invalid_catalog".into(),
                        affected_fields: diagnostics.iter().map(|d| d.field_path.clone()).collect(),
                        affected_ids: vec![],
                        retryable: false,
                        reason_parameters: BTreeMap::new(),
                    });
                }
                if input.catalog_pin.catalog_digest != snapshot.catalog_digest
                    || input.catalog_pin.catalog_version != snapshot.catalog_version
                {
                    return Err(failure("catalog_pin_mismatch"));
                }
                if self.catalogs.len() >= 2 {
                    self.catalogs.pop_front();
                }
                self.catalogs
                    .push_back((snapshot.catalog_digest.clone(), content.clone()));
                content
            }
            None => match self
                .catalogs
                .iter()
                .find(|(digest, _)| digest == &input.catalog_pin.catalog_digest)
            {
                Some((_, content)) => content.clone(),
                None => return Err(failure("catalog_unavailable")),
            },
        };
        Ok((
            canonical::context_id(input, &content).as_str().to_owned(),
            content,
        ))
    }
    /// Stateless operations legal under system identity or an active project.
    fn execute_stateless(&mut self, command: &Command) -> Event {
        match command {
            Command::VerifyRecord { record } => verify_record(record),
            Command::NormalizeCatalogFields { fields } => {
                if fields.len() > 1024 {
                    return failure("input_limit_exceeded");
                }
                Event::CatalogFieldsNormalized {
                    fields: normalize_catalog_fields(fields),
                }
            }
            Command::QueryNextFacts {
                input,
                input_digest,
                snapshot,
            } => match next_facts::query_next_facts(input, input_digest, snapshot.as_ref()) {
                Ok(reply) => Event::NextFactsQueried { reply },
                Err(NextFactsError::DigestMismatch) => failure("digest_mismatch"),
                Err(NextFactsError::LimitExceeded) => failure(COMPLETION_LIMIT_CODE),
            },
            Command::QueryActionEligibility {
                snapshot,
                progress,
                stamp,
            } => {
                match eligibility::query_action_eligibility(snapshot, progress.as_deref(), stamp) {
                    Ok(reply) => Event::ActionEligibilityQueried { reply },
                    Err(EligibilityError::ProgressLimit) => failure("action_progress_limit"),
                    Err(EligibilityError::InvalidProgress) => failure("invalid_input"),
                }
            }
            Command::ApplyInventoryLedger { ledger, action } => {
                match crate::inventory::apply_inventory(ledger, action) {
                    Ok(reply) => Event::InventoryLedgerApplied { reply },
                    Err(error) => failure(error.code),
                }
            }
            Command::ReviewCatalogImport { action } => {
                match crate::catalog_provenance::review_catalog_import(action) {
                    Ok(reply) => Event::CatalogImportReviewed { reply },
                    Err(error) => failure(error.code),
                }
            }
            Command::QuoteOfferBundle { action } => {
                match crate::offer_bundles::quote_offer_bundle(action) {
                    Ok(reply) => Event::OfferBundleQuoted { reply },
                    Err(error) => failure(error.code),
                }
            }
            Command::ProjectSpatialView { source } => {
                match crate::spatial_view::project_spatial_view(source) {
                    Ok(projection) => Event::SpatialViewProjected { projection },
                    Err(failure) => Event::OperationFailed {
                        code: failure.code.into(),
                        affected_fields: failure.affected_fields,
                        affected_ids: vec![],
                        retryable: false,
                        reason_parameters: BTreeMap::new(),
                    },
                }
            }
            Command::ValidateCatalog { catalog } => {
                let content = CatalogContent::from(catalog);
                let diagnostics = validate::validate_catalog_content(&content);
                // A snapshot is emitted only when the whole catalog passed:
                // partial validation never fabricates a publishable record.
                Event::CatalogValidated {
                    snapshot: diagnostics.is_empty().then(|| CatalogSnapshot {
                        schema_version: content.schema_version,
                        catalog_version: content.catalog_version.clone(),
                        catalog_digest: canonical::catalog_digest(&content),
                        source_kind: content.source_kind.clone(),
                        products: content.products.clone(),
                        variants: content.variants.clone(),
                        offers: content.offers.clone(),
                        evidence: content.evidence.clone(),
                        ingestion_version: content.ingestion_version.clone(),
                        source_observations: content.source_observations.clone(),
                    }),
                    diagnostics,
                }
            }
            _ => failure("invalid_state"),
        }
    }
}
/// Structural validation plus claimed-digest verification for one record.
/// A matching digest proves byte consistency only, never currency or physical
/// validity.
fn verify_record(record: &VerifiableRecordDto) -> Event {
    let (record_kind, computed, claimed, mut diagnostics) = match record {
        VerifiableRecordDto::Input {
            input,
            input_digest,
        } => (
            "input",
            canonical::input_digest(input),
            Some(input_digest.clone()),
            validate::validate_project_input(input),
        ),
        VerifiableRecordDto::Catalog { catalog } => {
            let content = CatalogContent::from(catalog);
            (
                "catalog",
                canonical::catalog_digest(&content),
                Some(catalog.catalog_digest.clone()),
                validate::validate_catalog_content(&content),
            )
        }
        VerifiableRecordDto::Snapshot { snapshot } => {
            let mut diagnostics = validate::validate_snapshot(snapshot);
            let computed = canonical::snapshot_digest(&snapshot.content);
            if canonical::input_digest(&snapshot.content.input_facts)
                != snapshot.content.versions.input_digest
            {
                diagnostics.push(Diagnostic {
                    field_path: "content.versions.inputDigest".into(),
                    code: "context_input_mismatch".into(),
                    reason_code: "context_input_mismatch".into(),
                });
            }
            (
                "snapshot",
                computed,
                Some(snapshot.plan_snapshot_id.clone()),
                diagnostics,
            )
        }
    };
    let digest_match = claimed.as_ref() == Some(&computed);
    if !digest_match {
        diagnostics.push(Diagnostic {
            field_path: "digest".into(),
            code: "digest_mismatch".into(),
            reason_code: "digest_mismatch".into(),
        });
    }
    Event::RecordVerified {
        record_kind: record_kind.into(),
        computed_digest: Some(computed),
        verified: diagnostics.is_empty() && digest_match,
        diagnostics,
    }
}

// Preserve duplicate-key rejection before DTO decoding, at every nested object.
struct UniqueValue(Value);
impl<'de> Deserialize<'de> for UniqueValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct UniqueVisitor;
        impl<'de> Visitor<'de> for UniqueVisitor {
            type Value = UniqueValue;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("JSON without duplicate object keys")
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
                Ok(UniqueValue(Value::Bool(v)))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(UniqueValue(v.into()))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(UniqueValue(v.into()))
            }
            fn visit_f64<E: de::Error>(self, _v: f64) -> Result<Self::Value, E> {
                Err(E::custom("floating point not supported"))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(UniqueValue(v.into()))
            }
            fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
                Ok(UniqueValue(v.into()))
            }
            fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueValue(Value::Null))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueValue(Value::Null))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut values = vec![];
                while let Some(v) = seq.next_element::<UniqueValue>()? {
                    values.push(v.0);
                }
                Ok(UniqueValue(Value::Array(values)))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut values = serde_json::Map::new();
                while let Some((key, v)) = map.next_entry::<String, UniqueValue>()? {
                    if values.insert(key, v.0).is_some() {
                        return Err(de::Error::custom("duplicate JSON key"));
                    }
                }
                Ok(UniqueValue(Value::Object(values)))
            }
        }
        deserializer.deserialize_any(UniqueVisitor)
    }
}
