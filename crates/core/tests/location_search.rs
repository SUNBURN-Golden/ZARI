//! z-location-search. A planned location is not an actual location.
//!
//! Fixture cases under tests/fixtures/location_search rebuild a plan from
//! the preserved verified input/snapshot/catalog records, apply the case
//! observations, and assert the search rows. Snapshot/planned versus
//! actual-observation mismatches are the fixture oracle, not a re-derived
//! plan.

use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use zari_core::inventory::QuantityLabelCode;
use zari_core::location_search::{
    LocationAction, LocationLog, LocationObservation, LocationStatus, ObservationKind,
    apply_location_log, search_locations,
};
use zari_core::plan::{ItemAssignment, ItemLocation, ItemPlacement, Placement, PlacementSubject};
use zari_core::scalars::*;
use zari_core::*;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture(name: &str) -> Value {
    let path = format!(
        "{}/tests/fixtures/location_search/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(
        &fs::read_to_string(&path).unwrap_or_else(|error| panic!("{path}: {error}")),
    )
    .unwrap()
}

fn load_domain(case: &str) -> DomainFixture {
    let path = root().join(format!("fixtures/domain/{case}.json"));
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn verified_input() -> ProjectInput {
    let fixture = load_domain("record-input-verified");
    let VerifiableRecordDto::Input { input, .. } = serde_json::from_value(fixture.input).unwrap()
    else {
        panic!("record-input-verified");
    };
    input
}

fn verified_snapshot() -> PlanSnapshot {
    let fixture = load_domain("record-snapshot-verified");
    let VerifiableRecordDto::Snapshot { snapshot } = serde_json::from_value(fixture.input).unwrap()
    else {
        panic!("record-snapshot-verified");
    };
    snapshot
}

fn verified_catalog() -> catalog::CatalogSnapshot {
    let fixture = load_domain("record-catalog-verified");
    serde_json::from_value(fixture.input["catalog"].clone()).unwrap()
}

fn id(raw: &str) -> Id {
    Id::new(raw).unwrap()
}

fn digest(raw: char) -> Digest {
    Digest::new(&raw.to_string().repeat(64)).unwrap()
}

fn pos(x: i32, y: i32, z: i32) -> Vec3Mm {
    Vec3Mm {
        x: PositionMm::new(x).unwrap(),
        y: PositionMm::new(y).unwrap(),
        z: PositionMm::new(z).unwrap(),
    }
}

fn container_placement(raw: &str, variant: &str) -> Placement {
    Placement {
        id: id(raw),
        subject: PlacementSubject::NewContainer {
            variant_id: id(variant),
            unit_ordinal: 0,
        },
        parent: plan::ParentRef::Space {
            space_id: id("space-1"),
        },
        position: pos(5, 0, 0),
        orientation: Orientation::Upright0,
        support_id: id("floor-1"),
    }
}

fn contained_place() -> ItemPlacement {
    ItemPlacement {
        position: pos(5, 5, 0),
        orientation: Orientation::Upright0,
        support_id: id("cavity-floor-1"),
    }
}

/// Case-driven rebuild: fixture items inherit every field of the verified
/// template item except id/label/category/quantity; assignments and
/// container placements come from the case, and the referenced catalog
/// subset is the preserved verified catalog.
fn build_case(case: &Value) -> (ProjectInput, PlanSnapshot) {
    let mut input = verified_input();
    let template = input.items[0].clone();
    let provenance = match &template.quantity {
        Fact::Known { provenance, .. } => provenance.clone(),
        _ => unreachable!("verified input item"),
    };
    if let Some(items) = case["items"].as_array() {
        input.items = items
            .iter()
            .map(|item| {
                let mut built = template.clone();
                built.id = id(item["id"].as_str().unwrap());
                built.label = item["label"].as_str().unwrap().into();
                built.category = item["category"].as_str().unwrap().into();
                built.quantity = match &item["quantity"] {
                    Value::Null => Fact::unknown(),
                    value => Fact::Known {
                        value: Quantity::new(value.as_u64().unwrap() as u32).unwrap(),
                        provenance: provenance.clone(),
                    },
                };
                built
            })
            .collect();
    }

    let mut snapshot = verified_snapshot();
    snapshot.content.referenced_catalog.products = verified_catalog().products;
    snapshot.content.referenced_catalog.variants = verified_catalog().variants;
    if let Some(containers) = case["containers"].as_array() {
        for container in containers {
            snapshot.content.placements.push(container_placement(
                container["placementId"].as_str().unwrap(),
                container["variantId"].as_str().unwrap(),
            ));
        }
    }
    if let Some(assignments) = case["assignments"].as_array() {
        snapshot.content.assignments = assignments
            .iter()
            .map(|assignment| {
                let kind = assignment["kind"].as_str().unwrap();
                let location = match kind {
                    "direct" => ItemLocation::Direct {
                        placement_id: id(assignment["placementId"].as_str().unwrap()),
                    },
                    "contained" => ItemLocation::Contained {
                        container_placement_id: id(assignment["containerPlacementId"]
                            .as_str()
                            .unwrap()),
                        local_placement: contained_place(),
                    },
                    "provisional" => ItemLocation::ProvisionalContainer {
                        container_placement_id: id(assignment["containerPlacementId"]
                            .as_str()
                            .unwrap()),
                        reason_code: assignment["reasonCode"].as_str().unwrap().into(),
                    },
                    other => panic!("assignment kind {other}"),
                };
                ItemAssignment {
                    item_id: id(assignment["itemId"].as_str().unwrap()),
                    unit_ordinal: assignment["unitOrdinal"].as_u64().unwrap() as u32,
                    location,
                }
            })
            .collect();
    }
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    (input, snapshot)
}

/// Seed a log from fixture JSON, resolving `$snapshot`/`$other` digest
/// placeholders against the case snapshot.
fn seed_log(case: &Value, bound: &PlanSnapshot) -> LocationLog {
    let mut raw = case["log"].clone();
    if raw.is_null() {
        raw = json!([]);
    }
    for observation in raw.as_array_mut().unwrap() {
        if let Some(pin) = observation["planSnapshotId"].as_str() {
            observation["planSnapshotId"] = match pin {
                "$snapshot" => json!(bound.plan_snapshot_id.as_str()),
                "$other" => json!(digest('e').as_str()),
                other => json!(other),
            };
        }
    }
    let observations: Vec<LocationObservation> = serde_json::from_value(raw).unwrap();
    LocationLog { observations }
}

fn run_records(
    case: &Value,
    log: &LocationLog,
    input: &ProjectInput,
    snapshot: &PlanSnapshot,
) -> LocationLog {
    let mut log = log.clone();
    let records: &[Value] = case["records"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    for (index, record) in records.iter().enumerate() {
        let observation: LocationObservation =
            serde_json::from_value(record["observation"].clone()).unwrap();
        let action = LocationAction::Record { observation };
        match apply_location_log(&log, input, Some(snapshot), &action) {
            Ok(reply) => {
                assert!(
                    record["expectCode"].is_null(),
                    "record {index} unexpectedly changed the log"
                );
                assert!(reply.changed);
                log = reply.log;
            }
            Err(error) => {
                assert_eq!(
                    error.code,
                    record["expectCode"].as_str().unwrap_or_else(|| {
                        panic!("record {index} failed without an expected code")
                    })
                );
            }
        }
    }
    log
}

fn search_snapshot(case: &Value, bound: &PlanSnapshot) -> Option<PlanSnapshot> {
    match case["searchSnapshot"].as_str().unwrap_or("bound") {
        "bound" => Some(bound.clone()),
        "other" => {
            let mut other = bound.clone();
            other.plan_snapshot_id = digest('e');
            Some(other)
        }
        "none" => None,
        other => panic!("searchSnapshot {other}"),
    }
}

fn row_field<'a>(row: &'a Value, key: &str) -> &'a Value {
    row.get(key).unwrap_or(&Value::Null)
}

fn check_rows(case: &Value, reply: &Value) {
    let expected = case["expectRows"].as_array().unwrap();
    let rows = reply["rows"].as_array().unwrap();
    assert_eq!(
        rows.len(),
        expected.len(),
        "row count: {}",
        serde_json::to_string_pretty(&reply["rows"]).unwrap()
    );
    for (expect, actual) in expected.iter().zip(rows.iter()) {
        assert_eq!(expect["itemId"], actual["itemId"], "itemId");
        assert_eq!(
            expect["unitOrdinals"], actual["unitOrdinals"],
            "unitOrdinals"
        );
        assert_eq!(expect["status"], actual["status"], "status");
        if let Some(kind) = expect["plannedKind"].as_str() {
            assert_eq!(row_field(&actual["planned"], "kind"), &json!(kind));
        }
        if expect.get("plannedLabel").is_some() {
            assert_eq!(
                row_field(&actual["planned"], "label"),
                &expect["plannedLabel"]
            );
        }
        if let Some(kind) = expect["observedKind"].as_str() {
            assert_eq!(row_field(&actual["observed"], "kind"), &json!(kind));
        }
        if expect.get("observedLocation").is_some() {
            assert_eq!(
                row_field(&actual["observed"], "location"),
                &expect["observedLocation"]
            );
        }
        if expect.get("matchedAlias").is_some() {
            assert_eq!(actual["matchedAlias"], expect["matchedAlias"]);
        }
        if let Some(code) = expect["quantityCode"].as_str() {
            assert_eq!(actual["quantityCode"], json!(code));
        }
        if expect.get("quantityCount").is_some() {
            assert_eq!(actual["quantityCount"], expect["quantityCount"]);
        }
    }
}

fn run_case(name: &str) {
    let case = fixture(name);
    let (input, bound) = build_case(&case);
    let seeded = seed_log(&case, &bound);
    let log = run_records(&case, &seeded, &input, &bound);
    let snapshot = search_snapshot(&case, &bound);
    let query = case["query"].as_str().unwrap_or("");
    match search_locations(&input, snapshot.as_ref(), &log, query) {
        Ok(reply) => {
            assert!(case["expectCode"].is_null(), "search unexpectedly passed");
            assert_eq!(
                reply.truncated,
                case["expectTruncated"].as_bool().unwrap_or(false)
            );
            check_rows(&case, &serde_json::to_value(&reply).unwrap());
        }
        Err(error) => {
            assert_eq!(error.code, case["expectCode"].as_str().unwrap());
        }
    }
}

#[test]
fn fixture_cases() {
    for entry in fs::read_dir(format!(
        "{}/tests/fixtures/location_search",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
    {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "json") {
            run_case(path.file_stem().unwrap().to_str().unwrap());
        }
    }
}

fn small_input() -> ProjectInput {
    let mut input = verified_input();
    let template = input.items[0].clone();
    let provenance = match &template.quantity {
        Fact::Known { provenance, .. } => provenance.clone(),
        _ => unreachable!(),
    };
    let coat = Item {
        quantity: Fact::Known {
            value: Quantity::new(2).unwrap(),
            provenance: provenance.clone(),
        },
        ..template.clone()
    };
    let mut third = Item {
        id: id("item-c"),
        quantity: Fact::Known {
            value: Quantity::new(2).unwrap(),
            provenance,
        },
        ..coat.clone()
    };
    third.label = "Winter hats".into();
    input.items = vec![
        coat.clone(),
        Item {
            id: id("item-b"),
            label: "Documents".into(),
            ..coat.clone()
        },
        third,
    ];
    input
}

fn observation(raw: &str, item: &str, kind: ObservationKind) -> LocationObservation {
    LocationObservation {
        id: id(raw),
        item_id: id(item),
        kind,
        label: "Winter coats".into(),
        location: None,
        unit_ordinals: vec![],
        plan_snapshot_id: None,
    }
}

fn record_ok(
    log: &LocationLog,
    input: &ProjectInput,
    snapshot: Option<&PlanSnapshot>,
    observation: LocationObservation,
) -> LocationLog {
    let reply = apply_location_log(
        log,
        input,
        snapshot,
        &LocationAction::Record { observation },
    )
    .unwrap_or_else(|error| panic!("{}", error.code));
    assert!(reply.changed);
    reply.log
}

#[test]
fn confirm_without_a_plan_is_rejected_and_never_turned_actual() {
    let input = small_input();
    let snapshot = verified_snapshot();
    // item-a units 0,1: the preserved plan assigns only unit 0.
    let log = LocationLog::empty();
    let err = apply_location_log(
        &log,
        &input,
        None,
        &LocationAction::Record {
            observation: observation("obs-1", "item-a", ObservationKind::Confirm),
        },
    )
    .unwrap_err();
    assert_eq!(err.code, "confirm_needs_plan");

    // An all-unit confirm needs every unit planned; unit 1 is unassigned.
    let err = apply_location_log(
        &log,
        &input,
        Some(&snapshot),
        &LocationAction::Record {
            observation: observation("obs-1", "item-a", ObservationKind::Confirm),
        },
    )
    .unwrap_err();
    assert_eq!(err.code, "confirm_needs_plan");

    // An explicit ordinal against an unplanned unit fails the same way.
    let mut partial = observation("obs-1", "item-a", ObservationKind::Confirm);
    partial.unit_ordinals = vec![1];
    let err = apply_location_log(
        &log,
        &input,
        Some(&snapshot),
        &LocationAction::Record {
            observation: partial,
        },
    )
    .unwrap_err();
    assert_eq!(err.code, "no_planned_location");

    // Confirming only the planned unit binds the observation to the plan.
    let mut unit0 = observation("obs-1", "item-a", ObservationKind::Confirm);
    unit0.unit_ordinals = vec![0];
    let log = record_ok(&log, &input, Some(&snapshot), unit0);
    assert_eq!(
        log.observations[0].plan_snapshot_id.as_ref(),
        Some(&snapshot.plan_snapshot_id)
    );
    let reply = search_locations(&input, Some(&snapshot), &log, "").unwrap();
    let confirmed = reply
        .rows
        .iter()
        .find(|row| row.item_id.as_str() == "item-a" && row.unit_ordinals == vec![0])
        .unwrap();
    assert_eq!(confirmed.status, LocationStatus::Confirmed);
    // Unit 1 has no assignment in the preserved plan: unlocated, and the
    // unit-0 confirm never leaks onto it.
    let unplanned = reply
        .rows
        .iter()
        .find(|row| row.item_id.as_str() == "item-a" && row.unit_ordinals == vec![1])
        .unwrap();
    assert_eq!(unplanned.status, LocationStatus::Unlocated);
    assert!(unplanned.observed.is_none());

    // Another plan keeps the confirmation visibly stale, not current.
    let mut other = snapshot.clone();
    other.plan_snapshot_id = digest('e');
    let reply = search_locations(&input, Some(&other), &log, "").unwrap();
    let stale = reply
        .rows
        .iter()
        .find(|row| row.item_id.as_str() == "item-a" && row.unit_ordinals == vec![0])
        .unwrap();
    assert_eq!(stale.status, LocationStatus::StaleConfirmation);
}

#[test]
fn same_name_items_and_partial_quantities_stay_separate() {
    let mut input = small_input();
    input.items[0].label = "수건".into();
    input.items[2].label = "수건".into();
    let reply = search_locations(&input, None, &LocationLog::empty(), "수건").unwrap();
    assert_eq!(reply.rows.len(), 2);
    assert_ne!(reply.rows[0].item_id, reply.rows[1].item_id);

    // Moving one unit of a three-pack splits the row; it never merges.
    let mut triple = input.items[2].clone();
    triple.id = id("item-d");
    triple.quantity = Fact::Known {
        value: Quantity::new(3).unwrap(),
        provenance: match &triple.quantity {
            Fact::Known { provenance, .. } => provenance.clone(),
            _ => unreachable!(),
        },
    };
    input.items.push(triple);
    let mut moved = observation("obs-m", "item-d", ObservationKind::Relocate);
    moved.label = "수건".into();
    moved.unit_ordinals = vec![1];
    moved.location = Some("책상 위".into());
    let log = record_ok(&LocationLog::empty(), &input, None, moved);
    let reply = search_locations(&input, None, &log, "수건").unwrap();
    let split: Vec<_> = reply
        .rows
        .iter()
        .filter(|row| row.item_id.as_str() == "item-d")
        .collect();
    assert_eq!(split.len(), 3);
    assert_eq!(split[1].unit_ordinals, vec![1]);
    assert_eq!(split[1].status, LocationStatus::Observed);
    assert_eq!(split[0].status, LocationStatus::Unlocated);
    assert_eq!(split[2].status, LocationStatus::Unlocated);
}

#[test]
fn unknown_quantity_cannot_gain_ordinals_or_become_zero() {
    let mut input = small_input();
    input.items[0].quantity = Fact::unknown();
    let mut partial = observation("obs-u", "item-a", ObservationKind::Relocate);
    partial.unit_ordinals = vec![0];
    partial.location = Some("서랍".into());
    let err = apply_location_log(
        &LocationLog::empty(),
        &input,
        None,
        &LocationAction::Record {
            observation: partial,
        },
    )
    .unwrap_err();
    assert_eq!(err.code, "quantity_unknown");

    // A whole-item observation is still allowed; the row stays item-level.
    let mut lost = observation("obs-l", "item-a", ObservationKind::Lost);
    lost.label = input.items[0].label.clone();
    let log = record_ok(&LocationLog::empty(), &input, None, lost);
    let reply = search_locations(&input, None, &log, "").unwrap();
    let row = reply
        .rows
        .iter()
        .find(|row| row.item_id.as_str() == "item-a")
        .unwrap();
    assert_eq!(row.status, LocationStatus::Lost);
    assert!(row.unit_ordinals.is_empty());
    assert_eq!(row.quantity_code, QuantityLabelCode::Unknown);
    assert!(row.quantity_count.is_none());
}

#[test]
fn aliases_index_search_without_renaming_the_item() {
    let input = small_input();
    let mut alias = observation("obs-a", "item-a", ObservationKind::Alias);
    alias.label = "패딩".into();
    let log = record_ok(&LocationLog::empty(), &input, None, alias);
    let reply = search_locations(&input, None, &log, "패딩").unwrap();
    assert_eq!(reply.rows.len(), 1);
    assert_eq!(reply.rows[0].matched_alias.as_deref(), Some("패딩"));
    assert_eq!(reply.rows[0].label, "Winter coats");

    let duplicate = LocationObservation {
        label: "패딩".into(),
        ..observation("obs-b", "item-a", ObservationKind::Alias)
    };
    let err = apply_location_log(
        &log,
        &input,
        None,
        &LocationAction::Record {
            observation: duplicate,
        },
    )
    .unwrap_err();
    assert_eq!(err.code, "duplicate_alias");
}

#[test]
fn invalid_logs_and_inputs_fail_closed() {
    let input = small_input();
    let bad = LocationObservation {
        id: id("obs-1"),
        item_id: id("item-a"),
        kind: ObservationKind::Relocate,
        label: "Winter coats".into(),
        location: Some("  ".into()),
        unit_ordinals: vec![],
        plan_snapshot_id: None,
    };
    let err = search_locations(
        &input,
        None,
        &LocationLog {
            observations: vec![bad],
        },
        "",
    )
    .unwrap_err();
    assert_eq!(err.code, "invalid_label");

    let mut dup = observation("obs-1", "item-a", ObservationKind::Lost);
    dup.label = input.items[0].label.clone();
    let two = LocationLog {
        observations: vec![dup.clone(), dup],
    };
    let err = search_locations(&input, None, &two, "").unwrap_err();
    assert_eq!(err.code, "duplicate_observation");

    let err = apply_location_log(
        &LocationLog::empty(),
        &input,
        None,
        &LocationAction::Record {
            observation: observation("obs-x", "ghost", ObservationKind::Lost),
        },
    )
    .unwrap_err();
    assert_eq!(err.code, "subject_missing");
}

#[test]
fn row_cap_truncates_instead_of_merging() {
    let mut input = small_input();
    let template = input.items[0].clone();
    for index in 0..60 {
        let mut item = template.clone();
        item.id = id(&format!("bulk-{index}"));
        item.quantity = Fact::Known {
            value: Quantity::new(3).unwrap(),
            provenance: match &template.quantity {
                Fact::Known { provenance, .. } => provenance.clone(),
                _ => unreachable!(),
            },
        };
        input.items.push(item);
    }
    // Alternating relocated units split every item into three rows.
    let mut log = LocationLog::empty();
    for index in 0..60 {
        let mut moved = observation(
            &format!("obs-b{index}"),
            &format!("bulk-{index}"),
            ObservationKind::Relocate,
        );
        moved.label = "Winter coats".into();
        moved.location = Some("임시".into());
        moved.unit_ordinals = vec![1];
        log = record_ok(&log, &input, None, moved);
    }
    let reply = search_locations(&input, None, &log, "").unwrap();
    assert!(reply.truncated);
    assert_eq!(reply.rows.len(), 128);
}

#[test]
fn the_commands_are_stateless_and_bound_to_the_case_log() {
    use zari_core::{BUILD_ID, Runtime};
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
    assert_eq!(ready["event"]["kind"], "ready");

    let input = serde_json::to_value(small_input()).unwrap();
    let bare = send(
        &mut runtime,
        "bare",
        json!({
            "kind": "queryLocationSearch",
            "input": input,
            "snapshot": null,
            "log": {"observations": []},
            "query": ""
        }),
    );
    assert_eq!(bare["event"]["kind"], "locationSearchQueried");
    assert_eq!(bare["event"]["reply"]["rows"].as_array().unwrap().len(), 3);
    assert_eq!(bare["event"]["reply"]["truncated"], false);

    let recorded = send(
        &mut runtime,
        "record",
        json!({
            "kind": "applyLocationLog",
            "log": {"observations": []},
            "input": input,
            "snapshot": null,
            "action": {
                "kind": "record",
                "observation": {
                    "id": "obs-1",
                    "itemId": "item-a",
                    "kind": "relocate",
                    "label": "Winter coats",
                    "location": "베란다",
                    "unitOrdinals": [],
                    "planSnapshotId": null
                }
            }
        }),
    );
    assert_eq!(recorded["event"]["kind"], "locationLogApplied");
    assert_eq!(recorded["event"]["reply"]["changed"], true);

    // A bad observation is an operationFailed, not a partial write.
    let rejected = send(
        &mut runtime,
        "reject",
        json!({
            "kind": "applyLocationLog",
            "log": {"observations": []},
            "input": input,
            "snapshot": null,
            "action": {
                "kind": "record",
                "observation": {
                    "id": "obs-2",
                    "itemId": "item-a",
                    "kind": "confirm",
                    "label": "Winter coats",
                    "location": null,
                    "unitOrdinals": [],
                    "planSnapshotId": null
                }
            }
        }),
    );
    assert_eq!(rejected["event"]["kind"], "operationFailed");
    assert_eq!(rejected["event"]["code"], "confirm_needs_plan");
}

fn send(runtime: &mut zari_core::Runtime, id: &str, command: Value) -> Value {
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
