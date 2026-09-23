use crate::{
    canonical::{self, CatalogContent},
    catalog::*,
    facts::*,
    input::*,
    normalize::*,
    plan::*,
    probe::*,
    raw::*,
    scalars::*,
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

pub const BUILD_ID: &str = "zari-domain-2";
const CAPABILITIES: [&str; 8] = [
    "initialize",
    "activateProject",
    "normalizeInput(bootstrap)",
    "normalizeInput(project)",
    "evaluateProbe",
    "verifyRecord",
    "normalizeCatalogFields",
    "disposeProject",
];
const COMMAND_KINDS: [&str; 7] = [
    "initialize",
    "activateProject",
    "normalizeInput",
    "evaluateProbe",
    "verifyRecord",
    "normalizeCatalogFields",
    "disposeProject",
];
const MAX_MESSAGE_BYTES: usize = 5 * 1024 * 1024;
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
pub enum DomainFixtureExpected {
    NormalizeProjectInput {
        decode_error: bool,
        diagnostics: Vec<ExpectedDiagnostic>,
        #[serde(deserialize_with = "crate::required_option")]
        #[schemars(with = "crate::RequiredNullable<Digest>")]
        input_digest: Option<Digest>,
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
}
/// The JSON requests a domain fixture drives through `Runtime::handle_json`,
/// in order. Both the native fixture runner and the browser harness send
/// these exact payloads, so parity covers the whole protocol path.
pub fn domain_fixture_requests(fixture: &DomainFixture) -> Vec<Value> {
    let meta = |request_id: &str, system: bool| {
        json!({
            "protocolVersion": 1,
            "schemaVersion": 1,
            "workerSessionId": "fixture-session",
            "projectActivationId": (if system { "system" } else { "fixture-activation" }),
            "requestId": request_id,
            "projectId": (if system { "system" } else { "fixture-project" }),
            "editorEpoch": "0",
            "inputRevision": "0",
            "contextId": null
        })
    };
    let request = |meta: Value, command: Value| json!({ "meta": meta, "command": command });
    let initialize = request(
        meta("fixture-initialize", true),
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
                meta("fixture-activate", false),
                json!({ "kind": "activateProject", "context": { "kind": "bootstrap" } }),
            ),
            request(
                meta("fixture-operation", false),
                json!({
                    "kind": "normalizeInput",
                    "input": { "kind": "project", "project": fixture.input.clone() },
                    "priorInputDigest": null,
                    "formatRequests": []
                }),
            ),
        ],
        DomainOperation::VerifyRecord => vec![
            initialize,
            request(
                meta("fixture-operation", true),
                json!({ "kind": "verifyRecord", "record": fixture.input.clone() }),
            ),
        ],
        DomainOperation::NormalizeCatalogFields => vec![
            initialize,
            request(
                meta("fixture-operation", true),
                json!({ "kind": "normalizeCatalogFields", "fields": fixture.input.clone() }),
            ),
        ],
    }
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
/// Execute one shared domain fixture through `Runtime::handle_json` and check
/// the oracle. Returns the operation event JSON; the same event is produced
/// by the browser Worker path for byte-level parity.
pub fn execute_domain_fixture(fixture: &DomainFixture) -> Result<Value, String> {
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
    let mut runtime = Runtime::new();
    let requests = domain_fixture_requests(fixture);
    let mut event = Value::Null;
    for request in &requests {
        let response: Value = serde_json::from_str(&runtime.handle_json(&request.to_string()))
            .map_err(|e| format!("{}: response not JSON: {e}", fixture.case_id))?;
        event = response.get("event").cloned().unwrap_or(Value::Null);
    }
    let decode_error = event["kind"] == "operationFailed" && event["code"] == "invalid_input";
    let expected = &fixture.expected;
    let declared_decode = match expected {
        DomainFixtureExpected::NormalizeProjectInput { decode_error, .. }
        | DomainFixtureExpected::VerifyRecord { decode_error, .. }
        | DomainFixtureExpected::NormalizeCatalogFields { decode_error, .. } => *decode_error,
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
    match expected {
        DomainFixtureExpected::NormalizeProjectInput {
            diagnostics,
            input_digest,
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
    }
    Ok(event)
}

#[derive(Default)]
pub struct Runtime {
    session: Option<String>,
    active: Option<RequestMeta>,
    /// The contextId issued for the active project context; bootstrap
    /// contexts keep `None` and reject requests that carry one.
    active_context: Option<String>,
    /// Validated immutable catalog cache (bounded at two entries).
    catalogs: VecDeque<(Digest, CatalogContent)>,
    last_disposed: Option<RequestMeta>,
    recent: VecDeque<(String, String, String)>,
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
        if kind.is_some_and(|k| !COMMAND_KINDS.contains(&k)) {
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
            return Event::Ready {
                build_id: BUILD_ID.into(),
                protocol_version: 1,
                schema_version: 1,
                canonical_version: canonical::CANONICAL_VERSION,
                rule_version: canonical::RULE_VERSION.into(),
                solver_version: "none".into(),
                capabilities: CAPABILITIES.iter().map(|s| (*s).into()).collect(),
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
                Command::VerifyRecord { .. } | Command::NormalizeCatalogFields { .. }
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
            let context_id = match context {
                ActivationContext::Bootstrap {} => None,
                ActivationContext::Project { input, catalog } => {
                    match self.validate_project_context(input, catalog.as_ref()) {
                        Ok(id) => Some(id),
                        Err(event) => return event,
                    }
                }
            };
            self.active = Some(meta.clone());
            self.active_context = context_id.clone();
            self.last_disposed = None;
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
            } => {
                if prior_input_digest
                    .as_ref()
                    .is_some_and(|v| !digest_valid(v))
                {
                    return failure("invalid_input");
                }
                match input {
                    NormalizeInputDto::Bootstrap { probe } => {
                        if format_requests.len() > 2
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
                            diagnostics,
                        }
                    }
                    NormalizeInputDto::Project { project } => {
                        if format_requests.len() > 16 {
                            return failure("invalid_input");
                        }
                        let (input, diagnostics) = normalize_project_input(project);
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
                            diagnostics,
                        }
                    }
                }
            }
            Command::EvaluateProbe { probe } => Event::ProbeEvaluated {
                result: evaluate_probe(probe),
            },
            Command::VerifyRecord { .. } | Command::NormalizeCatalogFields { .. } => {
                self.execute_stateless(&request.command)
            }
            Command::DisposeProject { .. } => {
                self.last_disposed = self.active.take();
                self.active_context = None;
                self.recent.clear();
                Event::ProjectDisposed
            }
            Command::Initialize { .. } | Command::ActivateProject { .. } => {
                failure("invalid_state")
            }
        }
    }
    /// Validate an activation's project context and return its context id.
    #[allow(clippy::result_large_err)]
    fn validate_project_context(
        &mut self,
        input: &ProjectInput,
        catalog: Option<&CatalogSnapshot>,
    ) -> Result<String, Event> {
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
        Ok(canonical::context_id(input, &content).as_str().to_owned())
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
