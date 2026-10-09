//! Portable project bundle. Rust checks the zip before any store write.
//! Photo bytes stay out. Location and personal keys in attachment metadata
//! are refused. A rejection returns no member bodies.

use schemars::JsonSchema;
use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::fmt;

pub const PORTABLE_BUNDLE_VERSION: u32 = 1;
/// Raw zip ceiling. Base64 of this size stays inside the protocol message cap.
pub const MAX_BUNDLE_BYTES: usize = 1_572_864;
pub const MAX_MEMBER_BYTES: usize = 1_048_576;
pub const MAX_ENTRIES: usize = 8;
const MAX_ENTRY_COUNT_BEFORE_BOMB: u64 = 64;
const MAX_UNCOMPRESSED_TOTAL: u64 = 8 * 1024 * 1024;
const MAX_RATIO: u64 = 64;
const MAX_JSON_DEPTH: usize = 32;
const MAX_ROWS_INPUTS: usize = 256;
const MAX_ROWS_SNAPSHOTS: usize = 256;
const MAX_ROWS_PROGRESS: usize = 4096;
const MAX_ROWS_CATALOGS: usize = 64;
const MAX_ROWS_ATTACHMENTS: usize = 64;

const NAME_MANIFEST: &str = "manifest.json";
const NAME_PROJECT: &str = "project.json";
const NAME_OBSERVATIONS: &str = "observations.json";
const NAME_CATALOG: &str = "catalog.json";
const NAME_SNAPSHOTS: &str = "snapshots.json";
const NAME_ATTACHMENTS: &str = "attachments.json";

const LOCAL_SIG: u32 = 0x0403_4b50;
const CENTRAL_SIG: u32 = 0x0201_4b50;
const EOCD_SIG: u32 = 0x0605_4b50;
const FLAG_UTF8: u16 = 1 << 11;
const FLAG_REJECT: u16 = 1 | (1 << 3) | (1 << 6);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableIssue {
    pub field_path: String,
    pub code: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableInclusion {
    pub project: bool,
    pub observations: bool,
    pub catalog: bool,
    pub snapshot_attachments: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortablePolicy {
    pub photo_bytes: String,
    pub location: String,
    pub personal_data: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableBuildRequest {
    pub exported_at: String,
    pub inclusion: PortableInclusion,
    pub project_json: String,
    pub observations_json: String,
    pub catalog_json: String,
    pub snapshots_json: String,
    pub attachments_json: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableBuildReply {
    pub accepted: bool,
    pub issues: Vec<PortableIssue>,
    pub zip_base64: String,
    pub member_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableInspectReply {
    pub accepted: bool,
    pub issues: Vec<PortableIssue>,
    pub exported_at: String,
    pub inclusion: PortableInclusion,
    pub policy: PortablePolicy,
    pub project_json: String,
    pub observations_json: String,
    pub catalog_json: String,
    pub snapshots_json: String,
    pub attachments_json: String,
    pub canonical_snapshot_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestFile {
    portable_bundle_version: u32,
    kind: String,
    producer: ManifestProducer,
    exported_at: String,
    inclusion: PortableInclusion,
    policy: PortablePolicy,
    members: Vec<ManifestMember>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestProducer {
    app: String,
    schema_version: u32,
    build_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestMember {
    path: String,
    sha256: String,
    bytes: u64,
}

struct ZipEntry {
    name: String,
    compressed: Vec<u8>,
}

fn issue(path: &str, code: &str) -> PortableIssue {
    PortableIssue {
        field_path: path.to_owned(),
        code: code.to_owned(),
    }
}

pub fn fixed_policy() -> PortablePolicy {
    PortablePolicy {
        photo_bytes: "excluded".to_owned(),
        location: "stripped".to_owned(),
        personal_data: "omitted".to_owned(),
    }
}

fn empty_inclusion() -> PortableInclusion {
    PortableInclusion {
        project: false,
        observations: false,
        catalog: false,
        snapshot_attachments: false,
    }
}

fn rejected_inspect(issues: Vec<PortableIssue>) -> PortableInspectReply {
    PortableInspectReply {
        accepted: false,
        issues,
        exported_at: String::new(),
        inclusion: empty_inclusion(),
        policy: fixed_policy(),
        project_json: String::new(),
        observations_json: String::new(),
        catalog_json: String::new(),
        snapshots_json: String::new(),
        attachments_json: String::new(),
        canonical_snapshot_id: String::new(),
    }
}

fn rejected_build(issues: Vec<PortableIssue>) -> PortableBuildReply {
    PortableBuildReply {
        accepted: false,
        issues,
        zip_base64: String::new(),
        member_count: 0,
    }
}

pub fn build_portable_bundle(request: &PortableBuildRequest) -> PortableBuildReply {
    if let Err(found) = check_exported_at(&request.exported_at) {
        return rejected_build(vec![found]);
    }
    let pairs = [
        (
            NAME_PROJECT,
            request.inclusion.project,
            request.project_json.as_str(),
        ),
        (
            NAME_OBSERVATIONS,
            request.inclusion.observations,
            request.observations_json.as_str(),
        ),
        (
            NAME_CATALOG,
            request.inclusion.catalog,
            request.catalog_json.as_str(),
        ),
        (
            NAME_SNAPSHOTS,
            request.inclusion.snapshot_attachments,
            request.snapshots_json.as_str(),
        ),
        (
            NAME_ATTACHMENTS,
            request.inclusion.snapshot_attachments,
            request.attachments_json.as_str(),
        ),
    ];
    let mut stored: Vec<(&str, &[u8])> = Vec::new();
    let mut total = 0usize;
    for (name, included, text) in pairs {
        if included == text.is_empty() {
            return rejected_build(vec![issue(name, "invalid_envelope")]);
        }
        if text.is_empty() {
            continue;
        }
        if text.len() > MAX_MEMBER_BYTES {
            return rejected_build(vec![issue(name, "import_too_large")]);
        }
        total = total.saturating_add(text.len());
        if let Err(found) = inspect_member(name, text) {
            return rejected_build(vec![found]);
        }
        stored.push((name, text.as_bytes()));
    }
    if total > MAX_BUNDLE_BYTES {
        return rejected_build(vec![issue("file", "import_too_large")]);
    }
    let manifest = match manifest_json(&request.exported_at, &request.inclusion, &stored) {
        Ok(text) => text,
        Err(found) => return rejected_build(vec![found]),
    };
    let mut files: Vec<(&str, &[u8])> = vec![(NAME_MANIFEST, manifest.as_bytes())];
    files.extend(stored);
    let zip = match write_stored_zip(&files) {
        Ok(bytes) => bytes,
        Err(found) => return rejected_build(vec![found]),
    };
    if zip.len() > MAX_BUNDLE_BYTES {
        return rejected_build(vec![issue("file", "import_too_large")]);
    }
    PortableBuildReply {
        accepted: true,
        issues: vec![],
        zip_base64: b64_encode(&zip),
        member_count: files.len() as u32,
    }
}

pub fn inspect_portable_bundle(zip_base64: &str) -> PortableInspectReply {
    let bytes = match b64_decode(zip_base64) {
        Ok(bytes) => bytes,
        Err(()) => return rejected_inspect(vec![issue("file", "bundle_corrupt")]),
    };
    if bytes.len() > MAX_BUNDLE_BYTES {
        return rejected_inspect(vec![issue("file", "import_too_large")]);
    }
    let entries = match read_zip(&bytes) {
        Ok(entries) => entries,
        Err(found) => return rejected_inspect(vec![found]),
    };
    decode_entries(entries)
}

fn check_exported_at(value: &str) -> Result<(), PortableIssue> {
    if (20..=40).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'T' | b'Z' | b':' | b'-' | b'+' | b'.'))
    {
        Ok(())
    } else {
        Err(issue("exportedAt", "invalid_envelope"))
    }
}

fn manifest_json(
    exported_at: &str,
    inclusion: &PortableInclusion,
    stored: &[(&str, &[u8])],
) -> Result<String, PortableIssue> {
    let members: Vec<Value> = stored
        .iter()
        .map(|(path, bytes)| {
            serde_json::json!({
                "path": path,
                "sha256": sha256_hex(bytes),
                "bytes": bytes.len(),
            })
        })
        .collect();
    let body = serde_json::json!({
        "portableBundleVersion": PORTABLE_BUNDLE_VERSION,
        "kind": "zari-portable",
        "producer": {
            "app": "zari-web",
            "schemaVersion": 1,
            "buildId": crate::protocol::BUILD_ID,
        },
        "exportedAt": exported_at,
        "inclusion": inclusion,
        "policy": fixed_policy(),
        "members": members,
    });
    serde_json::to_string(&body).map_err(|_| issue(NAME_MANIFEST, "bundle_corrupt"))
}

fn decode_entries(entries: Vec<ZipEntry>) -> PortableInspectReply {
    if entries.len() > MAX_ENTRIES {
        return rejected_inspect(vec![issue("file", "import_too_large")]);
    }
    let mut names = Vec::new();
    for entry in &entries {
        if names.iter().any(|name| name == &entry.name) {
            return rejected_inspect(vec![issue(&entry.name, "duplicate_id")]);
        }
        names.push(entry.name.clone());
    }
    let Some(manifest_entry) = entries.iter().find(|entry| entry.name == NAME_MANIFEST) else {
        return rejected_inspect(vec![issue(NAME_MANIFEST, "missing_member")]);
    };
    let manifest_text = match std::str::from_utf8(&manifest_entry.compressed) {
        Ok(text) => text,
        Err(_) => return rejected_inspect(vec![issue(NAME_MANIFEST, "bundle_corrupt")]),
    };
    let manifest_value = match parse_strict_json(manifest_text) {
        Ok(value) => value,
        Err(code) => return rejected_inspect(vec![issue(NAME_MANIFEST, code)]),
    };
    let manifest: ManifestFile = match serde_json::from_value(manifest_value) {
        Ok(value) => value,
        Err(_) => return rejected_inspect(vec![issue(NAME_MANIFEST, "invalid_envelope")]),
    };
    if manifest.portable_bundle_version != PORTABLE_BUNDLE_VERSION
        || manifest.producer.schema_version != 1
    {
        return rejected_inspect(vec![issue("portableBundleVersion", "unsupported_version")]);
    }
    if manifest.kind != "zari-portable"
        || manifest.producer.app != "zari-web"
        || manifest.producer.build_id.is_empty()
        || manifest.producer.build_id.len() > 64
        || check_exported_at(&manifest.exported_at).is_err()
    {
        return rejected_inspect(vec![issue(NAME_MANIFEST, "invalid_envelope")]);
    }
    if manifest.policy != fixed_policy() {
        return rejected_inspect(vec![issue("policy", "policy_rejected")]);
    }
    let mut bodies: Vec<(String, String)> = Vec::new();
    for member in &manifest.members {
        if member.path == NAME_MANIFEST || !allowed_member(&member.path) {
            return rejected_inspect(vec![issue(&member.path, "unexpected_member")]);
        }
        if !hex64(&member.sha256) {
            return rejected_inspect(vec![issue(&member.path, "digest_mismatch")]);
        }
        let Some(entry) = entries.iter().find(|entry| entry.name == member.path) else {
            return rejected_inspect(vec![issue(&member.path, "missing_member")]);
        };
        if member.bytes != entry.compressed.len() as u64
            || sha256_hex(&entry.compressed) != member.sha256
        {
            return rejected_inspect(vec![issue(&member.path, "digest_mismatch")]);
        }
        let text = match std::str::from_utf8(&entry.compressed) {
            Ok(text) => text.to_owned(),
            Err(_) => return rejected_inspect(vec![issue(&member.path, "bundle_corrupt")]),
        };
        if let Err(found) = inspect_member(&member.path, &text) {
            return rejected_inspect(vec![found]);
        }
        bodies.push((member.path.clone(), text));
    }
    for entry in &entries {
        if entry.name == NAME_MANIFEST {
            continue;
        }
        if !manifest
            .members
            .iter()
            .any(|member| member.path == entry.name)
        {
            return rejected_inspect(vec![issue(&entry.name, "unexpected_member")]);
        }
    }
    let inclusion_ok = flag_matches(&bodies, NAME_PROJECT, manifest.inclusion.project)
        && flag_matches(&bodies, NAME_OBSERVATIONS, manifest.inclusion.observations)
        && flag_matches(&bodies, NAME_CATALOG, manifest.inclusion.catalog)
        && flag_matches(
            &bodies,
            NAME_SNAPSHOTS,
            manifest.inclusion.snapshot_attachments,
        )
        && flag_matches(
            &bodies,
            NAME_ATTACHMENTS,
            manifest.inclusion.snapshot_attachments,
        );
    if !inclusion_ok {
        return rejected_inspect(vec![issue("inclusion", "invalid_envelope")]);
    }
    let canonical = match canonical_snapshot_id(body_of(&bodies, NAME_SNAPSHOTS)) {
        Ok(id) => id,
        Err(found) => return rejected_inspect(vec![found]),
    };
    PortableInspectReply {
        accepted: true,
        issues: vec![],
        exported_at: manifest.exported_at,
        inclusion: manifest.inclusion,
        policy: manifest.policy,
        project_json: body_of(&bodies, NAME_PROJECT).unwrap_or("").to_owned(),
        observations_json: body_of(&bodies, NAME_OBSERVATIONS).unwrap_or("").to_owned(),
        catalog_json: body_of(&bodies, NAME_CATALOG).unwrap_or("").to_owned(),
        snapshots_json: body_of(&bodies, NAME_SNAPSHOTS).unwrap_or("").to_owned(),
        attachments_json: body_of(&bodies, NAME_ATTACHMENTS).unwrap_or("").to_owned(),
        canonical_snapshot_id: canonical,
    }
}

fn flag_matches(bodies: &[(String, String)], name: &str, included: bool) -> bool {
    bodies.iter().any(|(path, _)| path == name) == included
}

fn body_of<'a>(bodies: &'a [(String, String)], name: &str) -> Option<&'a str> {
    bodies
        .iter()
        .find(|(path, _)| path == name)
        .map(|(_, text)| text.as_str())
}

fn allowed_member(name: &str) -> bool {
    matches!(
        name,
        NAME_PROJECT | NAME_OBSERVATIONS | NAME_CATALOG | NAME_SNAPSHOTS | NAME_ATTACHMENTS
    )
}

fn inspect_member(name: &str, text: &str) -> Result<(), PortableIssue> {
    let value = parse_strict_json(text).map_err(|code| issue(name, code))?;
    match name {
        NAME_PROJECT => check_project(&value),
        NAME_OBSERVATIONS => check_observations(&value),
        NAME_CATALOG => check_catalog(&value),
        NAME_SNAPSHOTS => check_snapshots(&value),
        NAME_ATTACHMENTS => check_attachments(&value),
        _ => Err(issue(name, "unexpected_member")),
    }
}

fn check_project(value: &Value) -> Result<(), PortableIssue> {
    let obj = object_keys(value, NAME_PROJECT, &["project", "draft", "actionProgress"])?;
    if !obj.get("project").is_some_and(Value::is_object) {
        return Err(issue("project", "invalid_envelope"));
    }
    let draft = obj.get("draft").unwrap();
    if !(draft.is_null() || draft.is_object()) {
        return Err(issue("draft", "invalid_envelope"));
    }
    let rows = array_of(obj, "actionProgress", MAX_ROWS_PROGRESS)?;
    unique_progress(rows)
}

fn check_observations(value: &Value) -> Result<(), PortableIssue> {
    let obj = object_keys(value, NAME_OBSERVATIONS, &["inputs", "ledger"])?;
    let rows = array_of(obj, "inputs", MAX_ROWS_INPUTS)?;
    unique_string_field(rows, "inputRevision", "inputs")?;
    match obj.get("ledger") {
        Some(Value::Null) => Ok(()),
        Some(Value::Object(_)) => Ok(()),
        _ => Err(issue("ledger", "invalid_envelope")),
    }
}

fn check_catalog(value: &Value) -> Result<(), PortableIssue> {
    let obj = object_keys(value, NAME_CATALOG, &["catalogs"])?;
    let rows = array_of(obj, "catalogs", MAX_ROWS_CATALOGS)?;
    unique_string_field(rows, "catalogDigest", "catalogs")
}

fn check_snapshots(value: &Value) -> Result<(), PortableIssue> {
    let obj = object_keys(value, NAME_SNAPSHOTS, &["snapshots"])?;
    let rows = array_of(obj, "snapshots", MAX_ROWS_SNAPSHOTS)?;
    let mut seen = Vec::new();
    for row in rows {
        let Some(revision) = row.get("inputRevision").and_then(Value::as_str) else {
            return Err(issue("snapshots", "invalid_envelope"));
        };
        let Some(id) = row.get("planSnapshotId").and_then(Value::as_str) else {
            return Err(issue("snapshots", "invalid_envelope"));
        };
        if !hex64(id) {
            return Err(issue("snapshots", "invalid_envelope"));
        }
        let key = format!("{revision}+{id}");
        if seen.iter().any(|prior| prior == &key) {
            return Err(issue("snapshots", "duplicate_id"));
        }
        seen.push(key);
        if let Some(inner) = row
            .get("snapshot")
            .and_then(|item| item.get("planSnapshotId"))
            && inner.as_str() != Some(id)
        {
            return Err(issue("snapshots", "digest_mismatch"));
        }
    }
    Ok(())
}

fn check_attachments(value: &Value) -> Result<(), PortableIssue> {
    let obj = object_keys(value, NAME_ATTACHMENTS, &["attachments"])?;
    let rows = array_of(obj, "attachments", MAX_ROWS_ATTACHMENTS)?;
    for row in rows {
        if has_key(row, "bytes") {
            return Err(issue("attachments", "photo_bytes_forbidden"));
        }
        if has_any_key(
            row,
            &[
                "latitude",
                "longitude",
                "gpsLatitude",
                "gpsLongitude",
                "gps",
                "exif",
            ],
        ) {
            return Err(issue("attachments", "location_present"));
        }
        if has_any_key(
            row,
            &[
                "email",
                "phone",
                "phoneNumber",
                "password",
                "secret",
                "accessToken",
                "authorization",
            ],
        ) {
            return Err(issue("attachments", "personal_data_present"));
        }
    }
    unique_string_field(rows, "attachmentId", "attachments")
}

fn canonical_snapshot_id(text: Option<&str>) -> Result<String, PortableIssue> {
    let Some(text) = text else {
        return Ok(String::new());
    };
    let value = parse_strict_json(text).map_err(|code| issue(NAME_SNAPSHOTS, code))?;
    let rows = value
        .get("snapshots")
        .and_then(Value::as_array)
        .ok_or_else(|| issue(NAME_SNAPSHOTS, "invalid_envelope"))?;
    let Some(first) = rows.first() else {
        return Ok(String::new());
    };
    first
        .get("planSnapshotId")
        .and_then(Value::as_str)
        .filter(|id| hex64(id))
        .map(str::to_owned)
        .ok_or_else(|| issue(NAME_SNAPSHOTS, "invalid_envelope"))
}

fn object_keys<'a>(
    value: &'a Value,
    path: &str,
    keys: &[&str],
) -> Result<&'a Map<String, Value>, PortableIssue> {
    let Some(obj) = value.as_object() else {
        return Err(issue(path, "invalid_envelope"));
    };
    if obj.len() != keys.len() || keys.iter().any(|key| !obj.contains_key(*key)) {
        return Err(issue(path, "invalid_envelope"));
    }
    Ok(obj)
}

fn array_of<'a>(
    obj: &'a Map<String, Value>,
    key: &str,
    max: usize,
) -> Result<&'a Vec<Value>, PortableIssue> {
    let Some(rows) = obj.get(key).and_then(Value::as_array) else {
        return Err(issue(key, "invalid_envelope"));
    };
    if rows.len() > max {
        return Err(issue(key, "import_too_large"));
    }
    Ok(rows)
}

fn unique_string_field(rows: &[Value], field: &str, path: &str) -> Result<(), PortableIssue> {
    let mut seen = Vec::new();
    for row in rows {
        let Some(id) = row.get(field).and_then(Value::as_str) else {
            return Err(issue(path, "invalid_envelope"));
        };
        if id.is_empty() || id.len() > 128 {
            return Err(issue(path, "invalid_envelope"));
        }
        if seen.iter().any(|prior| prior == id) {
            return Err(issue(path, "duplicate_id"));
        }
        seen.push(id.to_owned());
    }
    Ok(())
}

fn unique_progress(rows: &[Value]) -> Result<(), PortableIssue> {
    let mut seen = Vec::new();
    for row in rows {
        let revision = row
            .get("inputRevision")
            .and_then(Value::as_str)
            .ok_or_else(|| issue("actionProgress", "invalid_envelope"))?;
        let snapshot = row
            .get("planSnapshotId")
            .and_then(Value::as_str)
            .ok_or_else(|| issue("actionProgress", "invalid_envelope"))?;
        let step = row
            .get("stepId")
            .and_then(Value::as_str)
            .ok_or_else(|| issue("actionProgress", "invalid_envelope"))?;
        let key = format!("{revision}+{snapshot}+{step}");
        if seen.iter().any(|prior| prior == &key) {
            return Err(issue("actionProgress", "duplicate_id"));
        }
        seen.push(key);
    }
    Ok(())
}

fn has_key(value: &Value, key: &str) -> bool {
    match value {
        Value::Object(map) => {
            map.contains_key(key) || map.values().any(|child| has_key(child, key))
        }
        Value::Array(items) => items.iter().any(|child| has_key(child, key)),
        _ => false,
    }
}

fn has_any_key(value: &Value, keys: &[&str]) -> bool {
    keys.iter().any(|key| has_key(value, key))
}

fn hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn sha256_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

struct StrictValue(Value);

impl<'de> Deserialize<'de> for StrictValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct StrictVisitor;
        impl<'de> Visitor<'de> for StrictVisitor {
            type Value = StrictValue;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("strict JSON")
            }
            fn visit_bool<E: de::Error>(self, value: bool) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Bool(value)))
            }
            fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::from(value)))
            }
            fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::from(value)))
            }
            fn visit_f64<E: de::Error>(self, _value: f64) -> Result<Self::Value, E> {
                Err(E::custom("float"))
            }
            fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::from(value)))
            }
            fn visit_string<E: de::Error>(self, value: String) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::from(value)))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Null))
            }
            fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Null))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut values = Vec::new();
                while let Some(item) = seq.next_element::<StrictValue>()? {
                    values.push(item.0);
                }
                Ok(StrictValue(Value::Array(values)))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut values = Map::new();
                while let Some((key, item)) = map.next_entry::<String, StrictValue>()? {
                    if values.insert(key, item.0).is_some() {
                        return Err(de::Error::custom("duplicate"));
                    }
                }
                Ok(StrictValue(Value::Object(values)))
            }
        }
        deserializer.deserialize_any(StrictVisitor)
    }
}

fn parse_strict_json(text: &str) -> Result<Value, &'static str> {
    if text.len() > MAX_MEMBER_BYTES || json_too_deep(text) {
        return Err(if text.len() > MAX_MEMBER_BYTES {
            "import_too_large"
        } else {
            "too_deep"
        });
    }
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let parsed = StrictValue::deserialize(&mut deserializer).map_err(|_| "invalid_json")?;
    deserializer.end().map_err(|_| "invalid_json")?;
    Ok(parsed.0)
}

fn json_too_deep(text: &str) -> bool {
    let bytes = text.as_bytes();
    let mut index = 0usize;
    let mut depth = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => match skip_json_string(bytes, index) {
                Some(next) => index = next,
                None => return false,
            },
            b'{' | b'[' => {
                depth += 1;
                if depth > MAX_JSON_DEPTH {
                    return true;
                }
                index += 1;
            }
            b'}' | b']' => {
                depth = depth.saturating_sub(1);
                index += 1;
            }
            _ => index += 1,
        }
    }
    false
}

fn skip_json_string(bytes: &[u8], start: usize) -> Option<usize> {
    let mut index = start + 1;
    while index < bytes.len() {
        match bytes[index] {
            b'\\' => {
                if index + 1 >= bytes.len() {
                    return None;
                }
                index += 2;
            }
            b'"' => return Some(index + 1),
            _ => index += 1,
        }
    }
    None
}

fn write_stored_zip(files: &[(&str, &[u8])]) -> Result<Vec<u8>, PortableIssue> {
    if files.len() > MAX_ENTRIES {
        return Err(issue("file", "import_too_large"));
    }
    let mut locals = Vec::new();
    let mut central = Vec::new();
    let mut offset = 0u32;
    for (name, data) in files {
        if !safe_zip_name(name) {
            return Err(issue(name, "path_escape"));
        }
        if data.len() > MAX_MEMBER_BYTES {
            return Err(issue(name, "import_too_large"));
        }
        let crc = crc32(data);
        let name_bytes = name.as_bytes();
        let local_start = offset;
        let mut local = Vec::new();
        push_u32(&mut local, LOCAL_SIG);
        push_u16(&mut local, 20);
        push_u16(&mut local, FLAG_UTF8);
        push_u16(&mut local, 0);
        push_u16(&mut local, 0);
        push_u16(&mut local, 0);
        push_u32(&mut local, crc);
        push_u32(&mut local, data.len() as u32);
        push_u32(&mut local, data.len() as u32);
        push_u16(&mut local, name_bytes.len() as u16);
        push_u16(&mut local, 0);
        local.extend_from_slice(name_bytes);
        local.extend_from_slice(data);
        offset = offset.saturating_add(local.len() as u32);
        locals.extend(local);
        push_u32(&mut central, CENTRAL_SIG);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, FLAG_UTF8);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, crc);
        push_u32(&mut central, data.len() as u32);
        push_u32(&mut central, data.len() as u32);
        push_u16(&mut central, name_bytes.len() as u16);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, local_start);
        central.extend_from_slice(name_bytes);
    }
    let central_start = locals.len() as u32;
    let mut out = locals;
    let central_len = central.len() as u32;
    out.extend(central);
    push_u32(&mut out, EOCD_SIG);
    push_u16(&mut out, 0);
    push_u16(&mut out, 0);
    push_u16(&mut out, files.len() as u16);
    push_u16(&mut out, files.len() as u16);
    push_u32(&mut out, central_len);
    push_u32(&mut out, central_start);
    push_u16(&mut out, 0);
    if out.len() > MAX_BUNDLE_BYTES {
        return Err(issue("file", "import_too_large"));
    }
    Ok(out)
}

fn safe_zip_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && !name
            .as_bytes()
            .iter()
            .any(|byte| *byte < 0x20 || matches!(byte, b'\\' | b'/' | b':' | 0))
        && !name.split('.').any(|part| part == "..")
        && name != ".."
}

fn read_zip(data: &[u8]) -> Result<Vec<ZipEntry>, PortableIssue> {
    let eocd = find_eocd(data).ok_or_else(|| issue("file", "bundle_corrupt"))?;
    let disk_entries = u16::from_le_bytes([data[eocd + 8], data[eocd + 9]]) as u64;
    let total_entries = u16::from_le_bytes([data[eocd + 10], data[eocd + 11]]) as u64;
    let central_len = u32::from_le_bytes(data[eocd + 12..eocd + 16].try_into().unwrap()) as usize;
    let central_off = u32::from_le_bytes(data[eocd + 16..eocd + 20].try_into().unwrap()) as usize;
    if data[eocd + 4] != 0 || data[eocd + 5] != 0 || data[eocd + 6] != 0 || data[eocd + 7] != 0 {
        return Err(issue("file", "unsupported_version"));
    }
    if disk_entries != total_entries {
        return Err(issue("file", "bundle_corrupt"));
    }
    if total_entries > MAX_ENTRY_COUNT_BEFORE_BOMB {
        return Err(issue("file", "compression_bomb"));
    }
    if total_entries > MAX_ENTRIES as u64 {
        return Err(issue("file", "import_too_large"));
    }
    if central_off.saturating_add(central_len) > data.len()
        || central_off.saturating_add(central_len) > eocd
    {
        return Err(issue("file", "bundle_corrupt"));
    }
    let mut cursor = central_off;
    let central_end = central_off + central_len;
    let mut entries = Vec::new();
    let mut claimed = 0u64;
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    while entries.len() < total_entries as usize {
        if cursor + 46 > central_end {
            return Err(issue("file", "bundle_corrupt"));
        }
        if u32::from_le_bytes(data[cursor..cursor + 4].try_into().unwrap()) != CENTRAL_SIG {
            return Err(issue("file", "bundle_corrupt"));
        }
        let flags = u16::from_le_bytes([data[cursor + 8], data[cursor + 9]]);
        let method = u16::from_le_bytes([data[cursor + 10], data[cursor + 11]]);
        let crc = u32::from_le_bytes(data[cursor + 16..cursor + 20].try_into().unwrap());
        let compressed_size =
            u32::from_le_bytes(data[cursor + 20..cursor + 24].try_into().unwrap()) as u64;
        let uncompressed_size =
            u32::from_le_bytes(data[cursor + 24..cursor + 28].try_into().unwrap()) as u64;
        let name_len = u16::from_le_bytes([data[cursor + 28], data[cursor + 29]]) as usize;
        let extra_len = u16::from_le_bytes([data[cursor + 30], data[cursor + 31]]) as usize;
        let comment_len = u16::from_le_bytes([data[cursor + 32], data[cursor + 33]]) as usize;
        let local_off =
            u32::from_le_bytes(data[cursor + 42..cursor + 46].try_into().unwrap()) as usize;
        let name_at = cursor + 46;
        let next = name_at
            .saturating_add(name_len)
            .saturating_add(extra_len)
            .saturating_add(comment_len);
        if next > central_end {
            return Err(issue("file", "bundle_corrupt"));
        }
        let name_bytes = &data[name_at..name_at + name_len];
        let name = std::str::from_utf8(name_bytes).map_err(|_| issue("file", "path_escape"))?;
        if !safe_zip_name(name) || name_bytes.contains(&0) {
            return Err(issue(name, "path_escape"));
        }
        if flags & FLAG_REJECT != 0 || extra_len != 0 || comment_len != 0 {
            return Err(issue(name, "bundle_corrupt"));
        }
        if bomb_size(compressed_size, uncompressed_size) {
            return Err(issue(name, "compression_bomb"));
        }
        claimed = claimed.saturating_add(uncompressed_size);
        if claimed > MAX_UNCOMPRESSED_TOTAL {
            return Err(issue(name, "compression_bomb"));
        }
        if method != 0 {
            return Err(issue(name, "unsupported_compression"));
        }
        if compressed_size != uncompressed_size {
            return Err(issue(name, "bundle_corrupt"));
        }
        let payload = read_stored_payload(data, local_off, name, compressed_size, crc, name_bytes)?;
        let end = local_off
            .saturating_add(30)
            .saturating_add(name_len)
            .saturating_add(payload.len());
        if ranges
            .iter()
            .any(|(start, stop)| local_off < *stop && *start < end)
        {
            return Err(issue(name, "compression_bomb"));
        }
        ranges.push((local_off, end));
        entries.push(ZipEntry {
            name: name.to_owned(),
            compressed: payload,
        });
        cursor = next;
    }
    if cursor != central_end {
        return Err(issue("file", "bundle_corrupt"));
    }
    Ok(entries)
}

fn bomb_size(compressed: u64, uncompressed: u64) -> bool {
    if uncompressed > MAX_UNCOMPRESSED_TOTAL || compressed > MAX_BUNDLE_BYTES as u64 {
        return true;
    }
    if compressed == 0 {
        return uncompressed > 0;
    }
    uncompressed / compressed > MAX_RATIO
}

fn read_stored_payload(
    data: &[u8],
    local_off: usize,
    name: &str,
    size: u64,
    crc: u32,
    name_bytes: &[u8],
) -> Result<Vec<u8>, PortableIssue> {
    if local_off.saturating_add(30) > data.len() {
        return Err(issue(name, "bundle_corrupt"));
    }
    if u32::from_le_bytes(data[local_off..local_off + 4].try_into().unwrap()) != LOCAL_SIG {
        return Err(issue(name, "bundle_corrupt"));
    }
    let local_method = u16::from_le_bytes([data[local_off + 8], data[local_off + 9]]);
    let local_crc = u32::from_le_bytes(data[local_off + 14..local_off + 18].try_into().unwrap());
    let local_comp =
        u32::from_le_bytes(data[local_off + 18..local_off + 22].try_into().unwrap()) as u64;
    let local_uncomp =
        u32::from_le_bytes(data[local_off + 22..local_off + 26].try_into().unwrap()) as u64;
    let local_name = u16::from_le_bytes([data[local_off + 26], data[local_off + 27]]) as usize;
    let local_extra = u16::from_le_bytes([data[local_off + 28], data[local_off + 29]]) as usize;
    let name_at = local_off.saturating_add(30);
    let name_end = name_at.saturating_add(local_name);
    if name_end > data.len() || data.get(name_at..name_end) != Some(name_bytes) {
        return Err(issue(name, "bundle_corrupt"));
    }
    if local_method != 0
        || local_extra != 0
        || local_crc != crc
        || local_comp != size
        || local_uncomp != size
    {
        return Err(issue(name, "bundle_corrupt"));
    }
    if bomb_size(local_comp, local_uncomp) {
        return Err(issue(name, "compression_bomb"));
    }
    let start = name_end;
    let end = start.saturating_add(size as usize);
    if end > data.len() || size > MAX_MEMBER_BYTES as u64 {
        return Err(issue(name, "bundle_corrupt"));
    }
    let payload = data[start..end].to_vec();
    if crc32(&payload) != crc {
        return Err(issue(name, "bundle_corrupt"));
    }
    Ok(payload)
}

fn find_eocd(data: &[u8]) -> Option<usize> {
    if data.len() < 22 {
        return None;
    }
    let start = data.len().saturating_sub(22 + 65_535);
    let mut index = data.len() - 22;
    loop {
        if data[index..index + 4] == EOCD_SIG.to_le_bytes() {
            let comment = u16::from_le_bytes([data[index + 20], data[index + 21]]) as usize;
            if index + 22 + comment == data.len() && comment == 0 {
                return Some(index);
            }
        }
        if index == start {
            break;
        }
        index -= 1;
    }
    None
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn b64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut index = 0;
    while index + 3 <= data.len() {
        let n = (u32::from(data[index]) << 16)
            | (u32::from(data[index + 1]) << 8)
            | u32::from(data[index + 2]);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push(TABLE[(n & 63) as usize] as char);
        index += 3;
    }
    let rest = data.len() - index;
    if rest == 1 {
        let n = u32::from(data[index]) << 16;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rest == 2 {
        let n = (u32::from(data[index]) << 16) | (u32::from(data[index + 1]) << 8);
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push('=');
    }
    out
}

fn b64_decode(text: &str) -> Result<Vec<u8>, ()> {
    if !text.len().is_multiple_of(4) || text.len() > MAX_BUNDLE_BYTES.saturating_mul(2) {
        return Err(());
    }
    fn val(byte: u8) -> Result<u8, ()> {
        match byte {
            b'A'..=b'Z' => Ok(byte - b'A'),
            b'a'..=b'z' => Ok(byte - b'a' + 26),
            b'0'..=b'9' => Ok(byte - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(()),
        }
    }
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        let chunk = &bytes[index..index + 4];
        let pad = chunk.iter().rev().take_while(|byte| **byte == b'=').count();
        if pad > 2 || (pad > 0 && index + 4 != bytes.len()) {
            return Err(());
        }
        let a = val(chunk[0])?;
        let b = val(chunk[1])?;
        let c = if pad == 2 { 0 } else { val(chunk[2])? };
        let d = if pad >= 1 { 0 } else { val(chunk[3])? };
        let n = (u32::from(a) << 18) | (u32::from(b) << 12) | (u32::from(c) << 6) | u32::from(d);
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
        index += 4;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WHEN: &str = "2026-10-09T00:00:00.000Z";
    const SNAP: &str = "297d1d8671646e55c9f27dc3d047879a975884d688ce9d8d09308d051ab60608";

    fn project() -> String {
        r#"{"project":{"projectId":"p"},"draft":null,"actionProgress":[]}"#.to_owned()
    }

    fn snapshots() -> String {
        format!(
            r#"{{"snapshots":[{{"inputRevision":"1","planSnapshotId":"{SNAP}","snapshot":{{"planSnapshotId":"{SNAP}"}}}}]}}"#
        )
    }

    fn request(inclusion: PortableInclusion, snapshots_json: &str) -> PortableBuildRequest {
        PortableBuildRequest {
            exported_at: WHEN.to_owned(),
            inclusion: inclusion.clone(),
            project_json: project(),
            observations_json: String::new(),
            catalog_json: String::new(),
            snapshots_json: snapshots_json.to_owned(),
            attachments_json: if inclusion.snapshot_attachments && !snapshots_json.is_empty() {
                r#"{"attachments":[]}"#.to_owned()
            } else {
                String::new()
            },
        }
    }

    #[test]
    fn wide_json_is_not_too_deep_and_a_deep_nest_is() {
        let wide = format!(
            "{{{}}}",
            (0..40)
                .map(|index| format!("\"k{index}\":{index}"))
                .collect::<Vec<_>>()
                .join(",")
        );
        assert!(parse_strict_json(&wide).is_ok());
        let mut deep = String::new();
        for _ in 0..33 {
            deep.push_str("{\"a\":");
        }
        deep.push('1');
        for _ in 0..33 {
            deep.push('}');
        }
        assert_eq!(parse_strict_json(&deep).unwrap_err(), "too_deep");
    }

    #[test]
    fn round_trip_keeps_the_snapshot_id_and_bytes() {
        let inclusion = PortableInclusion {
            project: true,
            observations: false,
            catalog: false,
            snapshot_attachments: true,
        };
        let body = snapshots();
        let built = build_portable_bundle(&request(inclusion, &body));
        assert!(built.accepted, "{:?}", built.issues);
        let inspected = inspect_portable_bundle(&built.zip_base64);
        assert!(inspected.accepted, "{:?}", inspected.issues);
        assert_eq!(inspected.canonical_snapshot_id, SNAP);
        assert_eq!(inspected.snapshots_json, body);
        assert_eq!(inspected.policy, fixed_policy());
        assert!(inspected.project_json.contains("projectId"));
    }

    #[test]
    fn path_escape_zip_bomb_old_version_and_oversize_are_refused() {
        let escape = write_stored_zip(&[("../secret.json", b"{}")]);
        assert_eq!(escape.unwrap_err().code, "path_escape");
        let slipped = craft_named("../secret.json", b"{}");
        let inspected = inspect_portable_bundle(&b64_encode(&slipped));
        assert_eq!(inspected.issues[0].code, "path_escape");
        assert!(inspected.project_json.is_empty());
        let bomb = craft_bomb();
        let inspected = inspect_portable_bundle(&b64_encode(&bomb));
        assert_eq!(inspected.issues[0].code, "compression_bomb");
        assert!(inspected.project_json.is_empty());
        let old = old_version_zip();
        let inspected = inspect_portable_bundle(&b64_encode(&old));
        assert_eq!(inspected.issues[0].code, "unsupported_version");
        let huge = vec![0u8; MAX_BUNDLE_BYTES + 1];
        let inspected = inspect_portable_bundle(&b64_encode(&huge));
        assert_eq!(inspected.issues[0].code, "import_too_large");
        let broken = b64_encode(b"PK\x03\x04truncated");
        let inspected = inspect_portable_bundle(&broken);
        assert_eq!(inspected.issues[0].code, "bundle_corrupt");
    }

    #[test]
    fn duplicate_id_photo_bytes_and_hash_mismatch_do_not_return_members() {
        let dup = PortableBuildRequest {
            exported_at: WHEN.to_owned(),
            inclusion: PortableInclusion {
                project: true,
                observations: true,
                catalog: false,
                snapshot_attachments: false,
            },
            project_json: project(),
            observations_json:
                r#"{"inputs":[{"inputRevision":"1"},{"inputRevision":"1"}],"ledger":null}"#
                    .to_owned(),
            catalog_json: String::new(),
            snapshots_json: String::new(),
            attachments_json: String::new(),
        };
        let built = build_portable_bundle(&dup);
        assert_eq!(built.issues[0].code, "duplicate_id");
        assert!(built.zip_base64.is_empty());
        let photos = PortableBuildRequest {
            exported_at: WHEN.to_owned(),
            inclusion: PortableInclusion {
                project: true,
                observations: false,
                catalog: false,
                snapshot_attachments: true,
            },
            project_json: project(),
            observations_json: String::new(),
            catalog_json: String::new(),
            snapshots_json: snapshots(),
            attachments_json: r#"{"attachments":[{"attachmentId":"a","bytes":"aaaa"}]}"#.to_owned(),
        };
        assert_eq!(
            build_portable_bundle(&photos).issues[0].code,
            "photo_bytes_forbidden"
        );
        let inspected = inspect_portable_bundle(&b64_encode(&hash_mismatch_zip()));
        assert_eq!(inspected.issues[0].code, "digest_mismatch");
        assert!(inspected.project_json.is_empty());
        assert!(inspected.canonical_snapshot_id.is_empty());
    }

    fn hash_mismatch_zip() -> Vec<u8> {
        let body = project().into_bytes();
        let manifest = format!(
            r#"{{"portableBundleVersion":1,"kind":"zari-portable","producer":{{"app":"zari-web","schemaVersion":1,"buildId":"zari-domain-7"}},"exportedAt":"{WHEN}","inclusion":{{"project":true,"observations":false,"catalog":false,"snapshotAttachments":false}},"policy":{{"photoBytes":"excluded","location":"stripped","personalData":"omitted"}},"members":[{{"path":"project.json","sha256":"{}","bytes":{}}}]}}"#,
            "0".repeat(64),
            body.len()
        );
        write_stored_zip(&[(NAME_MANIFEST, manifest.as_bytes()), (NAME_PROJECT, &body)]).unwrap()
    }

    fn craft_bomb() -> Vec<u8> {
        let name = b"manifest.json";
        let data = b"xxxx";
        let mut local = Vec::new();
        push_u32(&mut local, LOCAL_SIG);
        push_u16(&mut local, 20);
        push_u16(&mut local, 0);
        push_u16(&mut local, 8);
        push_u16(&mut local, 0);
        push_u16(&mut local, 0);
        push_u32(&mut local, 0);
        push_u32(&mut local, data.len() as u32);
        push_u32(&mut local, 50_000_000);
        push_u16(&mut local, name.len() as u16);
        push_u16(&mut local, 0);
        local.extend_from_slice(name);
        local.extend_from_slice(data);
        let mut central = Vec::new();
        push_u32(&mut central, CENTRAL_SIG);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, 0);
        push_u16(&mut central, 8);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, data.len() as u32);
        push_u32(&mut central, 50_000_000);
        push_u16(&mut central, name.len() as u16);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, 0);
        central.extend_from_slice(name);
        let central_off = local.len() as u32;
        let central_len = central.len() as u32;
        let mut out = local;
        out.extend(central);
        push_u32(&mut out, EOCD_SIG);
        push_u16(&mut out, 0);
        push_u16(&mut out, 0);
        push_u16(&mut out, 1);
        push_u16(&mut out, 1);
        push_u32(&mut out, central_len);
        push_u32(&mut out, central_off);
        push_u16(&mut out, 0);
        out
    }

    fn old_version_zip() -> Vec<u8> {
        let manifest = br#"{"portableBundleVersion":0,"kind":"zari-portable","producer":{"app":"zari-web","schemaVersion":1,"buildId":"zari-domain-7"},"exportedAt":"2026-10-09T00:00:00.000Z","inclusion":{"project":false,"observations":false,"catalog":false,"snapshotAttachments":false},"policy":{"photoBytes":"excluded","location":"stripped","personalData":"omitted"},"members":[]}"#;
        write_stored_zip(&[(NAME_MANIFEST, manifest)]).unwrap()
    }

    fn craft_named(name: &str, data: &[u8]) -> Vec<u8> {
        let name_bytes = name.as_bytes();
        let crc = crc32(data);
        let mut local = Vec::new();
        push_u32(&mut local, LOCAL_SIG);
        push_u16(&mut local, 20);
        push_u16(&mut local, FLAG_UTF8);
        push_u16(&mut local, 0);
        push_u16(&mut local, 0);
        push_u16(&mut local, 0);
        push_u32(&mut local, crc);
        push_u32(&mut local, data.len() as u32);
        push_u32(&mut local, data.len() as u32);
        push_u16(&mut local, name_bytes.len() as u16);
        push_u16(&mut local, 0);
        local.extend_from_slice(name_bytes);
        local.extend_from_slice(data);
        let mut central = Vec::new();
        push_u32(&mut central, CENTRAL_SIG);
        push_u16(&mut central, 20);
        push_u16(&mut central, 20);
        push_u16(&mut central, FLAG_UTF8);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, crc);
        push_u32(&mut central, data.len() as u32);
        push_u32(&mut central, data.len() as u32);
        push_u16(&mut central, name_bytes.len() as u16);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u16(&mut central, 0);
        push_u32(&mut central, 0);
        push_u32(&mut central, 0);
        central.extend_from_slice(name_bytes);
        let central_off = local.len() as u32;
        let central_len = central.len() as u32;
        let mut out = local;
        out.extend(central);
        push_u32(&mut out, EOCD_SIG);
        push_u16(&mut out, 0);
        push_u16(&mut out, 0);
        push_u16(&mut out, 1);
        push_u16(&mut out, 1);
        push_u32(&mut out, central_len);
        push_u32(&mut out, central_off);
        push_u16(&mut out, 0);
        out
    }
}
