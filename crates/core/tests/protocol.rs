use serde_json::{Value, json};
use zari_core::*;
fn meta(id: &str) -> Value {
    json!({"protocolVersion":1,"schemaVersion":1,"workerSessionId":"session-a","projectActivationId":"activation-a","requestId":id,"projectId":"project-a","editorEpoch":"0","inputRevision":"9007199254740993","contextId":null})
}
fn send(r: &mut Runtime, mut m: Value, command: Value) -> Value {
    if command["kind"] == "initialize" {
        m["projectId"] = json!("system");
        m["projectActivationId"] = json!("system");
        m["editorEpoch"] = json!("0");
        m["inputRevision"] = json!("0");
    }
    serde_json::from_str(&r.handle_json(&json!({"meta":m,"command":command}).to_string())).unwrap()
}
fn initialized() -> Runtime {
    let mut r = Runtime::new();
    assert_eq!(
        send(
            &mut r,
            meta("init"),
            json!({"kind":"initialize","buildId":BUILD_ID,"expectedProtocolVersion":1,"expectedSchemaVersion":1})
        )["event"]["kind"],
        "ready"
    );
    r
}
fn active() -> Runtime {
    let mut r = initialized();
    assert_eq!(
        send(
            &mut r,
            meta("activate"),
            json!({"kind":"activateProject","context":{"kind":"bootstrap"}})
        )["event"]["kind"],
        "projectActivated"
    );
    r
}
fn probe() -> Value {
    serde_json::from_str::<Value>(include_str!(
        "../../../fixtures/bootstrap/width-590-pass.json"
    ))
    .unwrap()["input"]
        .clone()
}
#[test]
fn capability_subset_is_honest() {
    let mut r = Runtime::new();
    let ready = send(
        &mut r,
        meta("init"),
        json!({"kind":"initialize","buildId":BUILD_ID,"expectedProtocolVersion":1,"expectedSchemaVersion":1}),
    );
    assert_eq!(
        ready["event"]["capabilities"],
        json!([
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
            "disposeProject"
        ])
    );
    let out = send(&mut r, meta("search"), json!({"kind":"startSearch"}));
    assert_eq!(out["event"]["code"], "operation_not_supported");
}
#[test]
fn normalized_digest_equivalence_and_formatting_are_rust_owned() {
    let mut r = active();
    let command = json!({"kind":"normalizeInput","input":{"kind":"bootstrap","probe":probe()},"priorInputDigest":null,"formatRequests":[{"fieldPath":"compartmentWidth","unit":"cm"}]});
    let out = send(&mut r, meta("norm-1"), command.clone());
    assert_eq!(out["meta"]["inputRevision"], "9007199254740993");
    assert_eq!(out["event"]["formattedFields"][0]["text"], "60");
    let digest = out["event"]["inputDigest"].clone();
    assert_eq!(digest.as_str().unwrap().len(), 64);
    let mut changed = command;
    changed["input"]["probe"]["compartmentWidth"]["text"] = json!("60.000");
    changed["input"]["probe"]["compartmentWidth"]["unit"] = json!("cm");
    changed["priorInputDigest"] = digest.clone();
    let out2 = send(&mut r, meta("norm-2"), changed);
    assert_eq!(out2["event"]["equivalentToPrior"], true);
    assert_eq!(out2["event"]["inputDigest"], digest);
}
#[test]
fn invalid_fields_have_no_replacement_text_or_digest() {
    let mut r = active();
    let mut p = probe();
    p["compartmentWidth"]["text"] = json!("0");
    let out = send(
        &mut r,
        meta("norm-bad"),
        json!({"kind":"normalizeInput","input":{"kind":"bootstrap","probe":p},"priorInputDigest":null,"formatRequests":[{"fieldPath":"compartmentWidth","unit":"cm"}]}),
    );
    assert_eq!(out["event"]["inputDigest"], Value::Null);
    assert_eq!(out["event"]["normalizedInput"], Value::Null);
    assert_eq!(out["event"]["formattedFields"], json!([]));
}
#[test]
fn captured_identity_and_revision_are_exact() {
    let mut r = active();
    let mut m = meta("eval");
    m["editorEpoch"] = json!("18446744073709551615");
    let out = send(
        &mut r,
        m.clone(),
        json!({"kind":"evaluateProbe","probe":probe()}),
    );
    assert_eq!(out["meta"], m);
    assert_eq!(out["sequence"], 0);
    assert_eq!(out["event"]["kind"], "probeEvaluated");
    let mut wrong = meta("wrong-revision");
    wrong["inputRevision"] = json!("9007199254740992");
    let bad = send(
        &mut r,
        wrong,
        json!({"kind":"evaluateProbe","probe":probe()}),
    );
    assert_eq!(bad["event"]["code"], "stale_result");
}
#[test]
fn old_activation_session_and_disposed_requests_are_rejected() {
    let mut r = active();
    let mut m = meta("switch");
    m["projectActivationId"] = json!("activation-b");
    assert_eq!(
        send(
            &mut r,
            m.clone(),
            json!({"kind":"activateProject","context":{"kind":"bootstrap"}})
        )["event"]["kind"],
        "projectActivated"
    );
    assert_eq!(
        send(
            &mut r,
            meta("late"),
            json!({"kind":"evaluateProbe","probe":probe()})
        )["event"]["code"],
        "stale_result"
    );
    m["requestId"] = json!("dispose");
    let command = json!({"kind":"disposeProject"});
    let first = send(&mut r, m.clone(), command.clone());
    assert_eq!(first["event"]["kind"], "projectDisposed");
    assert_eq!(send(&mut r, m.clone(), command), first);
    m["requestId"] = json!("after-dispose");
    assert_eq!(
        send(&mut r, m, json!({"kind":"evaluateProbe","probe":probe()}))["event"]["code"],
        "project_not_active"
    );
    let mut other = meta("other");
    other["workerSessionId"] = json!("session-b");
    assert_eq!(
        send(
            &mut r,
            other,
            json!({"kind":"activateProject","context":{"kind":"bootstrap"}})
        )["event"]["code"],
        "worker_session_mismatch"
    );
}
#[test]
fn request_replay_is_bounded_and_payload_change_rejected() {
    let mut r = active();
    let command = json!({"kind":"evaluateProbe","probe":probe()});
    let first = send(&mut r, meta("same"), command.clone());
    assert_eq!(send(&mut r, meta("same"), command.clone()), first);
    let mut bad = command.clone();
    bad["probe"]["unitCount"]["text"] = json!("1");
    assert_eq!(
        send(&mut r, meta("same"), bad)["event"]["code"],
        "request_id_reused"
    );
    for i in 0..40 {
        assert_eq!(
            send(&mut r, meta(&format!("eval-{i}")), command.clone())["event"]["kind"],
            "probeEvaluated"
        );
    }
}
#[test]
fn duplicate_keys_unknown_fields_depth_and_size_fail_closed() {
    let mut r = active();
    let duplicated = "{\"meta\":{},\"meta\":{}}";
    assert_eq!(
        serde_json::from_str::<Value>(&r.handle_json(duplicated)).unwrap()["code"],
        "invalid_json"
    );
    let huge = " ".repeat(5 * 1024 * 1024 + 1);
    assert_eq!(
        serde_json::from_str::<Value>(&r.handle_json(&huge)).unwrap()["code"],
        "message_too_large"
    );
    let deep = format!("{}0{}", "[".repeat(33), "]".repeat(33));
    assert_eq!(
        serde_json::from_str::<Value>(&r.handle_json(&deep)).unwrap()["code"],
        "json_depth_exceeded"
    );
    let out = send(
        &mut r,
        meta("unknown-field"),
        json!({"kind":"disposeProject","extra":true}),
    );
    assert_eq!(out["event"]["code"], "invalid_input");
}
#[test]
fn protocol_schema_and_build_versions_are_checked() {
    let mut r = Runtime::new();
    assert_eq!(
        send(
            &mut r,
            meta("init-wrong"),
            json!({"kind":"initialize","buildId":"unknown","expectedProtocolVersion":1,"expectedSchemaVersion":1})
        )["event"]["code"],
        "version_mismatch"
    );
    let mut m = meta("schema");
    m["schemaVersion"] = json!(2);
    assert_eq!(
        send(&mut r, m, json!({"kind":"disposeProject"}))["event"]["code"],
        "version_mismatch"
    );
}

#[test]
fn required_nullable_fields_reject_absence_but_accept_null() {
    let mut r = active();
    let mut m = meta("missing-context");
    m.as_object_mut().unwrap().remove("contextId");
    let out = send(&mut r, m, json!({"kind":"disposeProject"}));
    assert_eq!(out["kind"], "fatalProtocolError");
    let out = send(
        &mut r,
        meta("missing-prior"),
        json!({"kind":"normalizeInput","input":{"kind":"bootstrap","probe":probe()},"formatRequests":[]}),
    );
    assert_eq!(out["event"]["code"], "invalid_input");
    let out = send(
        &mut r,
        meta("null-prior"),
        json!({"kind":"normalizeInput","input":{"kind":"bootstrap","probe":probe()},"priorInputDigest":null,"formatRequests":[]}),
    );
    assert_eq!(out["event"]["kind"], "normalized");
}
#[test]
fn fresh_dispose_request_is_idempotent_only_for_disposed_context() {
    let mut r = active();
    assert_eq!(
        send(&mut r, meta("dispose-1"), json!({"kind":"disposeProject"}))["event"]["kind"],
        "projectDisposed"
    );
    assert_eq!(
        send(&mut r, meta("dispose-2"), json!({"kind":"disposeProject"}))["event"]["kind"],
        "projectDisposed"
    );
    let mut wrong = meta("wrong-dispose");
    wrong["projectActivationId"] = json!("not-active");
    assert_eq!(
        send(&mut r, wrong, json!({"kind":"disposeProject"}))["event"]["code"],
        "project_not_active"
    );
}

fn normalize_for_provenance(probe: Value) -> Value {
    let mut runtime = active();
    send(
        &mut runtime,
        meta("provenance-normalization"),
        json!({
            "kind":"normalizeInput", "input":{"kind":"bootstrap","probe":probe},
            "priorInputDigest":null,"formatRequests":[]
        }),
    )["event"]
        .clone()
}

#[test]
fn gap_provenance_permutations_and_nfc_spellings_have_one_digest() {
    let mut first = probe();
    first["leftGapMm"]["provenance"]["evidenceIds"] = json!(["evidence:z", "evidence:a"]);
    first["leftGapMm"]["provenance"]["ruleIds"] = json!(["rule:é", "rule:a"]);
    first["leftGapMm"]["provenance"]["inputRefs"] = json!([
        {"entityId":"subject:z","fieldPath":"폭"},
        {"entityId":"subject:a","fieldPath":"compartmentWidth"}
    ]);
    first["leftGapMm"]["provenance"]["observedAt"] = json!("2024-02-29T23:59:59.125Z");
    let mut reordered = first.clone();
    reordered["leftGapMm"]["provenance"]["evidenceIds"] = json!(["evidence:a", "evidence:z"]);
    reordered["leftGapMm"]["provenance"]["ruleIds"] = json!(["rule:a", "rule:e\u{301}"]);
    reordered["leftGapMm"]["provenance"]["inputRefs"] = json!([
        {"entityId":"subject:a","fieldPath":"compartmentWidth"},
        {"entityId":"subject:z","fieldPath":"\u{1111}\u{1169}\u{11a8}"}
    ]);
    let first_result = normalize_for_provenance(first);
    let second_result = normalize_for_provenance(reordered);
    assert_eq!(first_result["diagnostics"], json!([]));
    assert!(first_result["inputDigest"].is_string());
    assert_eq!(first_result["inputDigest"], second_result["inputDigest"]);
    assert_eq!(
        first_result["normalizedInput"],
        second_result["normalizedInput"]
    );
    let provenance = &first_result["normalizedInput"]["input"]["leftGapMm"]["provenance"];
    assert_eq!(
        provenance["evidenceIds"],
        json!(["evidence:a", "evidence:z"])
    );
    assert_eq!(provenance["ruleIds"], json!(["rule:a", "rule:é"]));
    assert_eq!(provenance["inputRefs"][1]["fieldPath"], "폭");
}

#[test]
fn duplicate_provenance_sets_including_nfc_collisions_reject_digest() {
    for (field, values) in [
        ("evidenceIds", json!(["evidence:a", "evidence:a"])),
        ("ruleIds", json!(["rule:a", "rule:a"])),
        ("ruleIds", json!(["rule:é", "rule:e\u{301}"])),
        (
            "inputRefs",
            json!([
                {"entityId":"subject:a","fieldPath":"compartmentWidth"},
                {"entityId":"subject:a","fieldPath":"compartmentWidth"}
            ]),
        ),
        (
            "inputRefs",
            json!([
                {"entityId":"subject:a","fieldPath":"폭"},
                {"entityId":"subject:a","fieldPath":"\u{1111}\u{1169}\u{11a8}"}
            ]),
        ),
    ] {
        let mut p = probe();
        p["leftGapMm"]["provenance"][field] = values;
        let event = normalize_for_provenance(p);
        assert_eq!(event["inputDigest"], Value::Null, "{field}");
        assert_eq!(event["normalizedInput"], Value::Null, "{field}");
        assert_eq!(event["diagnostics"][0]["fieldPath"], "leftGapMm");
        assert_eq!(
            event["diagnostics"][0]["code"],
            "duplicate_provenance_reference"
        );
    }
}

#[test]
fn provenance_observation_requires_a_real_utc_rfc3339_timestamp() {
    for timestamp in [
        "not-a-date",
        "2023-02-29T12:00:00Z",
        "2024-04-31T12:00:00Z",
        "2024-00-01T12:00:00Z",
        "2024-01-00T12:00:00Z",
        "2024-01-01T24:00:00Z",
        "2024-01-01T12:60:00Z",
        "2024-01-01T12:00:61Z",
        "2024-01-01T12:00:60Z",
        "2024-01-01T12:00:00+09:00",
        "2024-01-01T12:00:00-00:00",
        "2024-01-01T12:00:00",
        "2024-01-01T12:00:00.Z",
        "2024-01-01T12:00:00Zjunk",
        "2024-01-01 12:00:00Z",
        "２０２４-01-01T12:00:00Z",
    ] {
        let mut p = probe();
        p["rightGapMm"]["provenance"]["observedAt"] = json!(timestamp);
        let event = normalize_for_provenance(p);
        assert_eq!(event["inputDigest"], Value::Null, "{timestamp}");
        assert_eq!(event["diagnostics"][0]["fieldPath"], "rightGapMm");
        assert_eq!(event["diagnostics"][0]["code"], "invalid_provenance");
    }
    for timestamp in [
        "2024-02-29T12:00:00Z",
        "2000-02-29T00:00:00+00:00",
        "2024-01-01t12:00:00z",
        "2024-01-01T12:00:00.123456789012345678Z",
        "2016-12-31T23:59:60Z",
    ] {
        let mut p = probe();
        p["rightGapMm"]["provenance"]["observedAt"] = json!(timestamp);
        let event = normalize_for_provenance(p);
        assert!(event["inputDigest"].is_string(), "{timestamp}: {event}");
        assert_eq!(
            event["normalizedInput"]["input"]["rightGapMm"]["provenance"]["observedAt"],
            timestamp
        );
    }
}

fn minimal_project() -> Value {
    serde_json::from_str::<Value>(include_str!(
        "../../../fixtures/domain/project-minimal-pass.json"
    ))
    .unwrap()["input"]
        .clone()
}

fn normalize_project(
    runtime: &mut Runtime,
    request_id: &str,
    project: Value,
    groups: Value,
) -> Value {
    send(
        runtime,
        meta(request_id),
        json!({
            "kind": "normalizeInput",
            "input": { "kind": "project", "project": project },
            "priorInputDigest": null,
            "formatRequests": [],
            "groupFormatRequests": groups
        }),
    )
}

#[test]
fn previous_build_id_and_unimplemented_query_do_not_handshake() {
    let mut runtime = Runtime::new();
    assert_eq!(
        send(
            &mut runtime,
            meta("old-build"),
            json!({"kind":"initialize","buildId":"zari-domain-4","expectedProtocolVersion":1,"expectedSchemaVersion":1})
        )["event"]["code"],
        "version_mismatch"
    );
    let mut runtime = Runtime::new();
    runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
    let ready = send(
        &mut runtime,
        meta("init-search"),
        json!({"kind":"initialize","buildId":BUILD_ID,"expectedProtocolVersion":1,"expectedSchemaVersion":1}),
    );
    assert_eq!(ready["event"]["buildId"], BUILD_ID);
    assert_eq!(
        ready["event"]["capabilities"],
        json!([
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
            "disposeProject",
            "proposeStrategies",
            "startSearch",
            "stepSearch",
            "cancelSearch"
        ])
    );
    assert!(
        ready["event"]["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|capability| capability == COMPLETION_QUERY_CAPABILITY)
    );
    assert_eq!(
        send(
            &mut runtime,
            meta("future-query"),
            json!({"kind":"queryNextFacts"})
        )["event"]["code"],
        "invalid_input"
    );
    assert_eq!(
        send(
            &mut runtime,
            meta("bare-eligibility"),
            json!({"kind":"queryActionEligibility"})
        )["event"]["code"],
        "invalid_input"
    );
    assert_eq!(
        send(
            &mut runtime,
            meta("unknown-op"),
            json!({"kind":"notARealOperation"})
        )["event"]["code"],
        "operation_not_supported"
    );
}

#[test]
fn group_format_rejects_unknown_readonly_and_over_cap_fields() {
    let mut runtime = active();
    let project = minimal_project();
    assert_eq!(
        normalize_project(
            &mut runtime,
            "unknown-path",
            project.clone(),
            json!([{"fieldPath":"space.opening.nope","unit":"mm"}])
        )["event"]["code"],
        "invalid_format_field"
    );
    assert_eq!(
        normalize_project(
            &mut runtime,
            "catalog-path",
            project.clone(),
            json!([{"fieldPath":"variants.box-1.dimensions.innerOffset.x","unit":"mm"}])
        )["event"]["code"],
        "catalog_field_read_only"
    );
    let groups = vec![json!({"fieldPath":"space.opening.left","unit":"mm"}); 17];
    assert_eq!(
        normalize_project(
            &mut runtime,
            "over-cap",
            project.clone(),
            Value::Array(groups)
        )["event"]["code"],
        "invalid_input"
    );
    let event = normalize_project(
        &mut runtime,
        "item-quantity",
        project,
        json!([{"fieldPath":"items.item-a.quantity","unit":"mm"}]),
    );
    assert_eq!(event["event"]["kind"], "normalized");
    assert_eq!(event["event"]["formattedGroups"][0]["converted"], false);
    assert_eq!(
        event["event"]["formattedGroups"][0]["uncertainty"]["code"],
        "unit_not_supported"
    );
    assert!(event["event"]["formattedGroups"][0]["nominalText"].is_null());
    let mut runtime = active();
    assert_eq!(
        send(
            &mut runtime,
            meta("bootstrap-group"),
            json!({
                "kind": "normalizeInput",
                "input": { "kind": "bootstrap", "probe": probe() },
                "priorInputDigest": null,
                "formatRequests": [],
                "groupFormatRequests": [{"fieldPath":"space.opening.left","unit":"mm"}]
            })
        )["event"]["code"],
        "invalid_format_field"
    );
}

#[test]
fn evidence_note_is_not_numeric_or_conflict_authority() {
    let mut project = minimal_project();
    project["space"]["opening"]["left"]["evidenceIds"] = json!(["ev-note"]);
    project["evidence"] = json!([{
        "id": "ev-note",
        "sourceKind": "userMeasured",
        "locator": null,
        "sourceField": "opening.left",
        "note": "confirmed 5mm conflict",
        "observedAt": "2024-01-01T00:00:00Z",
        "confirmedBy": null
    }]);
    let mut runtime = active();
    let event =
        normalize_project(&mut runtime, "evidence-note", project, json!([]))["event"].clone();
    assert!(event["inputDigest"].is_string(), "{event}");
    assert_eq!(
        event["normalizedInput"]["input"]["evidence"][0]["note"],
        "confirmed 5mm conflict"
    );
    assert_eq!(
        event["normalizedInput"]["input"]["space"]["opening"]["left"]["provenance"]["verification"],
        "unverified"
    );
    let codes: Vec<_> = event["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["code"].as_str().unwrap_or_default())
        .collect();
    assert!(
        !codes
            .iter()
            .any(|code| { *code == "conflicting_sources" || *code == "confirmed" })
    );
}

#[test]
fn typed_offset_records_keep_zero_and_reject_an_endpoint_past_the_domain() {
    let raw: RawProjectInputDto = serde_json::from_value(minimal_project()).unwrap();
    let (mut input, diagnostics) = normalize_project_input(&raw);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let Fact::Known { provenance, .. } = input.space.opening.left.clone() else {
        panic!("opening.left should normalize");
    };
    input.space.opening.left = Fact::Known {
        value: MeasuredOffset {
            nominal: scalars::PositionMm::new(20_000).unwrap(),
            uncertainty: Uncertainty::Bounded {
                minus_mm: scalars::ClearanceMm::new(0).unwrap(),
                plus_mm: scalars::ClearanceMm::new(1).unwrap(),
            },
        },
        provenance: provenance.clone(),
    };
    let rejected = validate::validate_project_input(&input);
    assert!(
        rejected
            .iter()
            .any(|item| item.field_path == "space.opening.left"
                && item.code == "uncertainty_out_of_range"),
        "{rejected:?}"
    );
    input.space.opening.left = Fact::Known {
        value: MeasuredOffset {
            nominal: scalars::PositionMm::new(0).unwrap(),
            uncertainty: Uncertainty::Bounded {
                minus_mm: scalars::ClearanceMm::new(0).unwrap(),
                plus_mm: scalars::ClearanceMm::new(0).unwrap(),
            },
        },
        provenance,
    };
    let accepted = validate::validate_project_input(&input);
    assert!(
        accepted
            .iter()
            .all(|item| item.field_path != "space.opening.left"),
        "{accepted:?}"
    );
}
