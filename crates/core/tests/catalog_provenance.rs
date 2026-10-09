//! z-catalog-provenance. Review stays off the stored catalog until every row is ready.

use serde_json::{Value, json};
use zari_core::catalog_provenance::{
    CatalogReviewAction, SampleBundleKind, review_catalog_import, sample_batch,
};
use zari_core::{BUILD_ID, Runtime};

fn review(action: &CatalogReviewAction) -> Value {
    serde_json::to_value(review_catalog_import(action).expect("review")).expect("json")
}

fn sample(kind: SampleBundleKind) -> Value {
    review(&CatalogReviewAction::Sample { bundle: kind })
}

fn row(product_id: &str, option_id: &str, option_label: &str, outer: &str, inner: &str) -> Value {
    json!({
        "productId": product_id,
        "model": "같은 상자",
        "brand": "브랜드",
        "category": "box",
        "optionId": option_id,
        "optionLabel": option_label,
        "sellerId": "",
        "primitive": "openBin",
        "outerWidthMm": outer,
        "outerDepthMm": "200",
        "outerHeightMm": "150",
        "innerWidthMm": inner,
        "innerDepthMm": "",
        "innerHeightMm": "",
        "protrusionMm": "",
        "loadGrams": "",
        "sources": []
    })
}

fn batch(rows: Vec<Value>, existing: Option<&str>) -> CatalogReviewAction {
    serde_json::from_value(json!({
        "kind": "review",
        "batch": {
            "catalogVersion": "catalog-review",
            "ingestionVersion": "provenance-1",
            "rows": rows,
            "existingDigest": existing
        }
    }))
    .expect("batch")
}

fn send(runtime: &mut Runtime, id: &str, command: Value) -> Value {
    let raw = json!({
        "meta": {
            "protocolVersion": 1,
            "schemaVersion": 1,
            "workerSessionId": "session-a",
            "projectActivationId": "system",
            "requestId": id,
            "projectId": "system",
            "editorEpoch": "0",
            "inputRevision": "0",
            "contextId": null
        },
        "command": command
    })
    .to_string();
    serde_json::from_str(&runtime.handle_json(&raw)).unwrap()
}

fn nominal(fact: &Value) -> Option<u64> {
    fact["value"]["nominal"].as_u64()
}

#[test]
fn different_size_options_of_one_product_stay_separate() {
    let reply = sample(SampleBundleKind::Synthetic);
    assert_eq!(reply["quarantined"], false);
    assert_eq!(reply["existingUntouched"], true);
    let snapshot = &reply["snapshot"];
    assert_eq!(snapshot["sourceKind"], "synthetic");
    assert_eq!(snapshot["products"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["products"][0]["id"], "syn:box");
    let variants = snapshot["variants"].as_array().unwrap();
    assert_eq!(variants.len(), 2);
    assert_eq!(variants[0]["id"], "syn:box-m");
    assert_eq!(
        nominal(&variants[0]["dimensions"]["outer"]["width"]),
        Some(400)
    );
    assert_eq!(variants[1]["id"], "syn:box-s");
    assert_eq!(
        nominal(&variants[1]["dimensions"]["outer"]["width"]),
        Some(200)
    );
    for variant in variants {
        assert_eq!(variant["dimensions"]["inner"]["width"]["state"], "unknown");
        assert!(
            variant["dimensions"]["inner"]["width"]
                .get("value")
                .is_none()
        );
    }
    assert!(snapshot["offers"].as_array().unwrap().is_empty());
    assert!(
        snapshot["evidence"]
            .as_array()
            .unwrap()
            .iter()
            .all(|entry| entry["locator"].is_null())
    );
}

#[test]
fn the_same_option_id_with_two_sizes_is_not_merged() {
    let reply = review(&batch(
        vec![
            row("prod-1", "var-1", "소형", "200", ""),
            row("prod-1", "var-1", "중형", "400", ""),
        ],
        None,
    ));
    assert_eq!(reply["snapshot"], Value::Null);
    assert_eq!(reply["quarantined"], true);
    assert!(reply["diagnoses"].as_array().unwrap().iter().all(|row| {
        row["codes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|code| code == "option_not_merged")
    }));
}

#[test]
fn a_missing_inner_is_not_filled_from_the_outer() {
    let reply = sample(SampleBundleKind::Unverified);
    assert_eq!(reply["quarantined"], false);
    let variant = &reply["snapshot"]["variants"][0];
    let outer = &variant["dimensions"]["outer"]["width"];
    let inner = &variant["dimensions"]["inner"]["width"];
    assert_eq!(nominal(outer), Some(300));
    assert_eq!(inner["state"], "unknown");
    assert!(inner.get("value").is_none());
    assert_ne!(inner, outer);
    assert!(
        reply["diagnoses"][0]["codes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|code| code == "inner_left_unknown")
    );
    assert!(
        reply["diagnoses"][0]["unknownScopes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|scope| scope == "inner")
    );
}

#[test]
fn an_incomplete_batch_does_not_publish_the_ready_rows() {
    let verified = sample(SampleBundleKind::Verified);
    let digest = verified["snapshot"]["catalogDigest"].as_str().unwrap();
    let stored = verified["snapshot"].clone();
    let reply = review(&batch(
        vec![
            row("prod-new", "var-new", "추가", "250", "200"),
            row("prod-new", "var-bad", "깨짐", "nope", ""),
        ],
        Some(digest),
    ));
    assert_eq!(reply["snapshot"], Value::Null);
    assert_eq!(reply["quarantined"], true);
    assert_eq!(reply["existingUntouched"], true);
    assert_eq!(reply["diagnoses"][0]["disposition"], "ready");
    assert_eq!(reply["diagnoses"][1]["disposition"], "quarantine");
    assert_eq!(sample(SampleBundleKind::Verified)["snapshot"], stored);
}

#[test]
fn verified_scope_stays_unverified_and_sources_stay_split() {
    let reply = sample(SampleBundleKind::Verified);
    assert_eq!(reply["quarantined"], false);
    assert_eq!(reply["bundle"], "verified");
    let snapshot = &reply["snapshot"];
    assert_eq!(snapshot["sourceKind"], "imported");
    let text = serde_json::to_string(snapshot).unwrap();
    assert!(!text.contains("\"verification\":\"confirmed\""));
    assert!(text.contains("\"verification\":\"unverified\""));
    let variant = &snapshot["variants"][0];
    assert_eq!(nominal(&variant["dimensions"]["inner"]["width"]), Some(360));
    assert_eq!(nominal(&variant["dimensions"]["outer"]["width"]), Some(400));
    assert_eq!(variant["dimensions"]["handles"]["state"], "unknown");
    let brand_ids = &snapshot["products"][0]["brand"]["provenance"]["evidenceIds"];
    let outer_ids = &variant["dimensions"]["outer"]["width"]["provenance"]["evidenceIds"];
    let inner_ids = &variant["dimensions"]["inner"]["width"]["provenance"]["evidenceIds"];
    let model_ids = &snapshot["products"][0]["provenance"]["evidenceIds"];
    assert_ne!(brand_ids, outer_ids);
    assert_ne!(inner_ids, outer_ids);
    assert_ne!(model_ids, outer_ids);
    let evidence = snapshot["evidence"].as_array().unwrap();
    let field = |id: &Value| {
        evidence.iter().find(|entry| &entry["id"] == id).unwrap()["sourceField"]
            .as_str()
            .unwrap()
    };
    assert_eq!(field(&brand_ids[0]), "brand");
    assert_eq!(field(&outer_ids[0]), "outer");
    assert_eq!(field(&inner_ids[0]), "inner");
    assert!(evidence.iter().any(|entry| {
        entry["note"]
            .as_str()
            .unwrap()
            .contains("photo=drawer-front.jpg")
    }));
    assert!(
        evidence
            .iter()
            .any(|entry| entry["observedAt"] == "2026-01-15T00:00:00Z")
    );
    assert!(
        reply["diagnoses"][0]["codes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|code| code == "verification_not_promoted")
    );
}

#[test]
fn photo_bytes_are_quarantined() {
    let mut action = batch(vec![row("prod-1", "var-1", "기본", "300", "")], None);
    if let CatalogReviewAction::Review { batch } = &mut action {
        batch.rows[0]
            .sources
            .push(zari_core::catalog_provenance::FieldSource {
                scope: zari_core::catalog_provenance::SourceScope::Outer,
                url: None,
                confirmed_at: None,
                photo_ref: Some("data:image/png;base64,aaaa".into()),
                verification_scope: zari_core::catalog_provenance::VerificationScope::Unverified,
                note: String::new(),
            });
    }
    let reply = review(&action);
    assert_eq!(reply["snapshot"], Value::Null);
    assert!(
        reply["diagnoses"][0]["codes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|code| code == "photo_bytes_refused")
    );
}

#[test]
fn the_review_command_is_stateless_and_a_bare_payload_is_invalid() {
    let mut runtime = Runtime::new();
    let ready = send(
        &mut runtime,
        "init",
        json!({
            "kind": "initialize",
            "buildId": BUILD_ID,
            "expectedProtocolVersion": 1,
            "expectedSchemaVersion": 1
        }),
    );
    let names: Vec<_> = ready["event"]["capabilities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|name| name.as_str().unwrap())
        .collect();
    let dispose = names
        .iter()
        .position(|name| *name == "disposeProject")
        .unwrap();
    assert_eq!(names[dispose - 4], "reviewCatalogImport");
    assert_eq!(names[dispose - 3], "quoteOfferBundle");
    assert_eq!(names[dispose - 1], "inspectPortableBundle");
    let bare = send(&mut runtime, "bare", json!({"kind": "reviewCatalogImport"}));
    assert_eq!(bare["event"]["code"], "invalid_input");
    let opened = send(
        &mut runtime,
        "sample",
        json!({"kind": "reviewCatalogImport", "action": {"kind": "sample", "bundle": "synthetic"}}),
    );
    assert_eq!(opened["event"]["kind"], "catalogImportReviewed");
    assert_eq!(
        opened["event"]["reply"]["snapshot"]["products"][0]["id"],
        "syn:box"
    );
    let too_many = sample_batch(SampleBundleKind::Synthetic);
    assert_eq!(too_many.rows.len(), 2);
}
