//! Golden bundle fixtures for the crawled-catalog contract. The bytes under
//! tests/fixtures/catalog-collection/golden are produced by the collection
//! tooling's parsers; here Rust must rebuild them byte for byte and accept them.
use std::fs;
use std::path::PathBuf;
use zari_core::catalog_bundle::*;

fn golden(name: &str) -> String {
    let path: PathBuf = [
        env!("CARGO_MANIFEST_DIR"),
        "..",
        "..",
        "tests",
        "fixtures",
        "catalog-collection",
        "golden",
        name,
    ]
    .iter()
    .collect();
    fs::read_to_string(path).expect("golden fixture reads")
}

fn generator() -> BundleGenerator {
    BundleGenerator {
        name: "zari-catalog-crawler-bot".into(),
        version: "1".into(),
    }
}

#[test]
fn rust_rebuilds_the_golden_bundle_and_manifest_byte_for_byte() {
    let collection: serde_json::Value = serde_json::from_str(&golden("collection.json")).unwrap();
    let items = collection["items"].to_string();
    let build = build_bundle_from_json(&items, "2026-10-15T01:00:00Z", generator());
    assert!(build.codes.is_empty() && build.rejected.is_empty());
    assert_eq!(build.accepted, 9);
    assert_eq!(
        build.bundle_text.as_deref(),
        Some(golden("bundle.json").as_str())
    );
    assert_eq!(
        build.manifest_text.as_deref(),
        Some(golden("manifest.json").as_str())
    );
}

#[test]
fn the_golden_bundle_is_accepted_and_nothing_in_it_is_confirmed() {
    let review = review_bundle_text(&golden("bundle.json"));
    assert!(!review.quarantined, "{review:?}");
    assert!(review.existing_untouched);
    let snapshot = review.snapshot.expect("snapshot");
    assert_eq!(snapshot.variants.len(), 9);
    let json = serde_json::to_string(&snapshot).unwrap();
    assert!(!json.contains("\"verification\":\"confirmed\""));
    assert!(json.contains("\"verification\":\"unverified\""));
    // No image field exists anywhere in the contract's output.
    assert!(!json.to_lowercase().contains("image"));
}

#[test]
fn a_quarantined_row_publishes_no_snapshot() {
    let mut value: serde_json::Value = serde_json::from_str(&golden("bundle.json")).unwrap();
    value["items"][0]["productUrl"] = "https://evil.example/x".into();
    let review = review_bundle_text(&value.to_string());
    assert!(review.quarantined && review.snapshot.is_none());
    assert!(review.existing_untouched);
}

#[test]
fn same_input_same_bytes() {
    let collection: serde_json::Value = serde_json::from_str(&golden("collection.json")).unwrap();
    let items = collection["items"].to_string();
    let a = build_bundle_from_json(&items, "2026-10-15T01:00:00Z", generator());
    let b = build_bundle_from_json(&items, "2026-10-15T01:00:00Z", generator());
    assert_eq!(a, b);
}
