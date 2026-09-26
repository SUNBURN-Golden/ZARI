//! Fixture authoring aid: computes normalized payloads and canonical digests
//! so shared fixtures pin real Rust-computed values instead of guessed ones.
//! Usage:
//!   domain_tool normalize <raw-project-input.json>
//!   domain_tool catalog <catalog-import.json>
//!   domain_tool snapshot <snapshot-content.json>
//!   domain_tool report <fixtures-dir>
use serde_json::{Value, json};
use std::{env, fs, path::PathBuf};
use zari_core::*;
fn read(path: &str) -> Vec<u8> {
    fs::read(path).expect("input file reads")
}
fn main() {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("normalize") => {
            let raw: RawProjectInputDto =
                serde_json::from_slice(&read(&args[2])).expect("raw input decodes");
            let (input, diagnostics) = normalize_project_input(&raw);
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "input": input,
                    "diagnostics": diagnostics,
                    "inputDigest": canonical::input_digest(&input),
                }))
                .unwrap()
            );
        }
        Some("catalog") => {
            let import: CatalogImportDto =
                serde_json::from_slice(&read(&args[2])).expect("catalog import decodes");
            let content = canonical::canonicalize_catalog(&CatalogContent::from(&import));
            let diagnostics = validate::validate_catalog_content(&content);
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "snapshot": {
                        "schemaVersion": content.schema_version,
                        "catalogVersion": content.catalog_version,
                        "catalogDigest": canonical::catalog_digest(&content),
                        "sourceKind": content.source_kind,
                        "products": content.products,
                        "variants": content.variants,
                        "offers": content.offers,
                        "evidence": content.evidence,
                        "ingestionVersion": content.ingestion_version,
                        "sourceObservations": content.source_observations,
                    },
                    "diagnostics": diagnostics,
                }))
                .unwrap()
            );
        }
        Some("snapshot") => {
            let mut content: SnapshotContent =
                serde_json::from_slice(&read(&args[2])).expect("snapshot content decodes");
            content.versions.input_digest = canonical::input_digest(&content.input_facts);
            let snapshot = PlanSnapshot {
                plan_snapshot_id: canonical::snapshot_digest(&content),
                content,
            };
            let diagnostics = validate::validate_snapshot(&snapshot);
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "snapshot": snapshot,
                    "diagnostics": diagnostics,
                }))
                .unwrap()
            );
        }
        Some("digest") => {
            // Print the digest Rust computes for a typed record payload.
            let value: Value = serde_json::from_slice(&read(&args[2])).expect("JSON parses");
            let kind = value["kind"].as_str().unwrap_or_default().to_owned();
            let record: VerifiableRecordDto =
                serde_json::from_value(value).expect("record decodes");
            let digest = match &record {
                VerifiableRecordDto::Input { input, .. } => canonical::input_digest(input),
                VerifiableRecordDto::Catalog { catalog } => {
                    canonical::catalog_digest(&CatalogContent::from(catalog))
                }
                VerifiableRecordDto::Snapshot { snapshot } => {
                    canonical::snapshot_digest(&snapshot.content)
                }
            };
            println!("{kind} {digest}");
        }
        Some("oracle") => {
            // Compute the `expected` block a fixture would need to match the
            // real Runtime+SolverEngine output. Authoring aid only — the
            // resulting oracles are reviewed like any other fixture change.
            // Usage: domain_tool oracle <fixture.json>
            let bytes = read(&args[2]);
            let header: Value = serde_json::from_slice(&bytes).expect("fixture parses");
            let operation = header["operation"].as_str().unwrap_or_default().to_owned();
            let fixture: DomainFixture = serde_json::from_slice(&bytes).expect("fixture decodes");
            let mut runtime = Runtime::new();
            runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
            let mut event = Value::Null;
            for request in domain_fixture_requests(&fixture) {
                let response: Value =
                    serde_json::from_str(&runtime.handle_json(&request.to_string()))
                        .expect("response is JSON");
                event = response["event"].clone();
                if fixture.operation == DomainOperation::RunSearch
                    && matches!(
                        event["kind"].as_str(),
                        Some("searchCompleted") | Some("searchCancelled") | Some("operationFailed")
                    )
                {
                    break;
                }
            }
            let expected = match operation.as_str() {
                "runSearch" => {
                    let kind = event["kind"].as_str().unwrap_or_default();
                    let (result, counters) = match kind {
                        "searchCompleted" => {
                            (event["result"].clone(), event["result"]["consumed"].clone())
                        }
                        "searchCancelled" => (Value::Null, event["consumed"].clone()),
                        "operationFailed" => (Value::Null, Value::Null),
                        _ => (Value::Null, Value::Null),
                    };
                    let decode_error =
                        kind == "operationFailed" && event["code"] == "invalid_input";
                    let termination = if kind == "searchCancelled" {
                        json!("cancelled")
                    } else {
                        result["termination"].clone()
                    };
                    let digests: Vec<Value> = result["alternatives"]
                        .as_array()
                        .map(|alts| alts.iter().map(|a| a["planSnapshotId"].clone()).collect())
                        .unwrap_or_default();
                    let mut reasons: Vec<String> = result["diagnosticCandidates"]
                        .as_array()
                        .map(|ds| {
                            ds.iter()
                                .filter_map(|d| d["reasonCode"].as_str().map(str::to_owned))
                                .collect()
                        })
                        .unwrap_or_default();
                    reasons.sort();
                    reasons.dedup();
                    let mut restrictions: Vec<String> = result["scope"]["restrictions"]
                        .as_array()
                        .map(|rs| {
                            rs.iter()
                                .filter_map(|r| r["code"].as_str().map(str::to_owned))
                                .collect()
                        })
                        .unwrap_or_default();
                    restrictions.sort();
                    restrictions.dedup();
                    json!({
                        "kind": "runSearch",
                        "decodeError": decode_error,
                        "termination": termination,
                        "alternativeDigests": digests,
                        "diagnosticReasons": reasons,
                        "restrictionCodes": restrictions,
                        "consumed": counters,
                    })
                }
                "normalizeProjectInput" => {
                    let decode_error =
                        event["kind"] == "operationFailed" && event["code"] == "invalid_input";
                    let mut diagnostics: Vec<Value> = event["diagnostics"]
                        .as_array()
                        .map(|ds| {
                            ds.iter()
                                .map(|d| {
                                    json!({
                                        "fieldPath": d["fieldPath"],
                                        "code": d["code"],
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    diagnostics.sort_by(|a, b| {
                        (a["fieldPath"].as_str(), a["code"].as_str())
                            .cmp(&(b["fieldPath"].as_str(), b["code"].as_str()))
                    });
                    json!({
                        "kind": "normalizeProjectInput",
                        "decodeError": decode_error,
                        "diagnostics": diagnostics,
                        "inputDigest": event["inputDigest"].clone(),
                    })
                }
                other => panic!("oracle supports runSearch/normalizeProjectInput, got {other}"),
            };
            println!(
                "{}",
                serde_json::to_string_pretty(
                    &json!({"caseId": fixture.case_id, "event": event, "expected": expected})
                )
                .unwrap()
            );
        }
        Some("report") => {
            let mut paths = vec![];
            fn collect(dir: PathBuf, paths: &mut Vec<PathBuf>) {
                for entry in fs::read_dir(dir).unwrap() {
                    let path = entry.unwrap().path();
                    if path.is_dir() {
                        collect(path, paths);
                    } else if path.extension().is_some_and(|e| e == "json")
                        && path.file_name().is_some_and(|n| n != "manifest.json")
                    {
                        paths.push(path);
                    }
                }
            }
            collect(PathBuf::from(&args[2]), &mut paths);
            paths.sort();
            for path in paths {
                let bytes = fs::read(&path).unwrap();
                let header: Value = serde_json::from_slice(&bytes).unwrap();
                if header["operation"].as_str() == Some("evaluateProbe") {
                    continue;
                }
                let fixture: DomainFixture = serde_json::from_slice(&bytes).unwrap();
                let mut runtime = Runtime::new();
                let mut event = Value::Null;
                for request in domain_fixture_requests(&fixture) {
                    let response: Value =
                        serde_json::from_str(&runtime.handle_json(&request.to_string())).unwrap();
                    event = response["event"].clone();
                }
                println!(
                    "{}",
                    serde_json::to_string(&json!({"file": path, "event": event})).unwrap()
                );
            }
        }
        _ => eprintln!("usage: domain_tool normalize|catalog|snapshot|report <path>"),
    }
}
