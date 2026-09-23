use crate::{probe::*, scalars::*};
use schemars::JsonSchema;
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, MapAccess, SeqAccess, Visitor},
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, VecDeque},
    fmt,
};

pub const BUILD_ID: &str = "zari-bootstrap-1";
const CAPABILITIES: [&str; 5] = [
    "initialize",
    "activateProject",
    "normalizeInput(bootstrap)",
    "evaluateProbe",
    "disposeProject",
];
const COMMAND_KINDS: [&str; 5] = [
    "initialize",
    "activateProject",
    "normalizeInput",
    "evaluateProbe",
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum BootstrapContext {
    Bootstrap {},
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum NormalizeInputDto {
    Bootstrap { probe: BootstrapProbeDto },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Command {
    Initialize {
        build_id: String,
        expected_protocol_version: u32,
        expected_schema_version: u32,
    },
    ActivateProject {
        context: BootstrapContext,
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
        #[schemars(with = "crate::RequiredNullable<NormalizedBootstrapInput>")]
        normalized_input: Option<NormalizedBootstrapInput>,
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

#[derive(Default)]
pub struct Runtime {
    session: Option<String>,
    active: Option<RequestMeta>,
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
fn input_digest(input: &NormalizedBootstrapInput) -> String {
    // serde_json's map representation sorts keys; normalized types contain only integer scalars.
    let value = serde_json::to_value(input).expect("typed normalized DTO serializes");
    let bytes = serde_json::to_vec(&value).expect("JSON value serializes");
    format!("{:x}", Sha256::digest(bytes))
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
                canonical_version: 1,
                rule_version: "bootstrap-width-pack-v1".into(),
                solver_version: "none".into(),
                capabilities: CAPABILITIES.iter().map(|s| (*s).into()).collect(),
            };
        }
        if self.session.as_ref() != Some(&meta.worker_session_id) {
            return failure("worker_session_mismatch");
        }
        if let Command::ActivateProject { .. } = &request.command {
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
            self.active = Some(meta.clone());
            self.last_disposed = None;
            self.recent.clear();
            return Event::ProjectActivated { context_id: None };
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
            || meta.context_id.is_some()
        {
            return failure("stale_result");
        }
        match &request.command {
            Command::NormalizeInput {
                input: NormalizeInputDto::Bootstrap { probe },
                prior_input_digest,
                format_requests,
            } => {
                if prior_input_digest
                    .as_ref()
                    .is_some_and(|v| !digest_valid(v))
                    || format_requests.len() > 2
                {
                    return failure("invalid_input");
                }
                if format_requests
                    .iter()
                    .any(|f| !matches!(f.field_path.as_str(), "compartmentWidth" | "unitWidth"))
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
                let digest = diagnostics.is_empty().then(|| input_digest(&normalized));
                Event::Normalized {
                    equivalent_to_prior: digest.is_some() && &digest == prior_input_digest,
                    input_digest: digest,
                    normalized_input: diagnostics.is_empty().then_some(normalized),
                    formatted_fields,
                    diagnostics,
                }
            }
            Command::EvaluateProbe { probe } => Event::ProbeEvaluated {
                result: evaluate_probe(probe),
            },
            Command::DisposeProject { .. } => {
                self.last_disposed = self.active.take();
                self.recent.clear();
                Event::ProjectDisposed
            }
            Command::Initialize { .. } | Command::ActivateProject { .. } => {
                failure("invalid_state")
            }
        }
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
