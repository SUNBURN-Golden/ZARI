//! z-inventory-lifecycle. Quantity history stays off the PlanSnapshot.

use serde_json::{Value, json};
use std::fs;
use zari_core::inventory::{
    ContainerUse, EventKind, HoldingKind, InventoryAction, InventoryEvent, InventoryLedger,
    OwnedUse, QuantityLabelCode, SubjectKind, apply_inventory, owned_use,
};
use zari_core::plan::CheckStatus;
use zari_core::{Fact, UnknownReason};

fn fixture(name: &str) -> Value {
    let path = format!(
        "{}/tests/fixtures/inventory/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(
        &fs::read_to_string(&path).unwrap_or_else(|error| panic!("{path}: {error}")),
    )
    .unwrap()
}

fn run(value: &Value) -> zari_core::inventory::InventoryReply {
    let ledger: InventoryLedger = serde_json::from_value(value["ledger"].clone()).unwrap();
    let action: InventoryAction = serde_json::from_value(value["action"].clone()).unwrap();
    apply_inventory(&ledger, &action).unwrap_or_else(|error| panic!("{}", error.code))
}

#[test]
fn duplicate_placements_do_not_consume_one_owned_unit() {
    let value = fixture("double-consume");
    let before = value["ledger"].clone();
    let reply = run(&value);
    assert!(!reply.changed);
    assert_eq!(reply.conservation.status, CheckStatus::Fail);
    assert_eq!(reply.conservation.reason_code, "owned_double_consume");
    assert_eq!(serde_json::to_value(&reply.ledger).unwrap(), before);
    assert_eq!(
        owned_use(Some(2), &[0, 0]),
        OwnedUse::Fail("owned_double_consume")
    );
    assert_eq!(owned_use(Some(1), &[0]), OwnedUse::Pass);
    assert_eq!(
        owned_use(None, &[0]),
        OwnedUse::Unknown("owned_availability_unknown")
    );
}

#[test]
fn unknown_quantity_and_zero_are_different_facts() {
    let purchased = run(&fixture("unknown-purchase"));
    assert!(purchased.changed);
    let label = &purchased.labels[0];
    assert_eq!(label.code, QuantityLabelCode::Unknown);
    assert!(label.count.is_none());
    let unknown = &purchased.ledger.items[0].quantity;
    assert!(matches!(
        unknown,
        Fact::Unknown {
            reason: UnknownReason::NotProvided
        }
    ));
    assert!(
        serde_json::to_value(unknown)
            .unwrap()
            .get("value")
            .is_none()
    );

    let edit = InventoryAction::Record {
        event: InventoryEvent {
            id: "evt-zero".parse().unwrap(),
            subject_kind: SubjectKind::Item,
            subject_id: "towel".parse().unwrap(),
            kind: EventKind::QuantityEdit,
            quantity_text: "0".into(),
            label: "수건".into(),
            location: None,
            holding: None,
            usage: None,
        },
    };
    let zeroed = apply_inventory(&purchased.ledger, &edit).unwrap();
    let zero = &zeroed.ledger.items[0].quantity;
    assert_eq!(zero.value().map(|qty| qty.get()), Some(0));
    assert_eq!(zeroed.labels[0].code, QuantityLabelCode::Zero);
    assert_eq!(zeroed.labels[0].count, Some(0));
    assert_ne!(
        serde_json::to_value(unknown).unwrap(),
        serde_json::to_value(zero).unwrap()
    );
    assert_eq!(serde_json::to_value(zero).unwrap()["value"], json!(0));
    assert_eq!(zeroed.ledger.events.len(), 2);
    assert_eq!(zeroed.ledger.items[0].holding, HoldingKind::Individual);
}

#[test]
fn opening_a_historical_plan_does_not_change_the_ledger() {
    let value = fixture("open-historical");
    let before: InventoryLedger = serde_json::from_value(value["ledger"].clone()).unwrap();
    let reply = run(&value);
    assert!(!reply.changed);
    assert_eq!(reply.ledger, before);
    assert_eq!(reply.labels[0].code, QuantityLabelCode::Zero);
    assert_eq!(reply.labels[0].count, Some(0));
    assert!(reply.historical_plan_id.is_some());
    assert_eq!(reply.conservation.reason_code, "ok");
}

#[test]
fn empty_container_is_not_an_in_use_container() {
    let mut ledger = InventoryLedger::empty();
    let purchase = |usage, text: &str, id: &str| InventoryAction::Record {
        event: InventoryEvent {
            id: id.parse().unwrap(),
            subject_kind: SubjectKind::Container,
            subject_id: "bin-b".parse().unwrap(),
            kind: EventKind::Purchase,
            quantity_text: text.into(),
            label: "빈 상자".into(),
            location: None,
            holding: None,
            usage: Some(usage),
        },
    };
    ledger = apply_inventory(&ledger, &purchase(ContainerUse::Empty, "", "evt-box"))
        .unwrap()
        .ledger;
    assert_eq!(ledger.containers[0].usage, ContainerUse::Empty);
    assert!(ledger.containers[0].quantity_owned.value().is_none());
    let claim = InventoryAction::Conserve {
        claims: vec![zari_core::inventory::OwnedClaim {
            container_id: "bin-b".parse().unwrap(),
            unit_ordinal: 0,
        }],
    };
    let blocked = apply_inventory(&ledger, &claim).unwrap();
    assert!(!blocked.changed);
    assert_eq!(blocked.conservation.reason_code, "empty_container_consumed");
    assert_eq!(blocked.ledger, ledger);

    let edited = apply_inventory(
        &ledger,
        &InventoryAction::Record {
            event: InventoryEvent {
                id: "evt-count".parse().unwrap(),
                subject_kind: SubjectKind::Container,
                subject_id: "bin-b".parse().unwrap(),
                kind: EventKind::QuantityEdit,
                quantity_text: "1".into(),
                label: "빈 상자".into(),
                location: None,
                holding: None,
                usage: Some(ContainerUse::InUse),
            },
        },
    )
    .unwrap();
    assert_eq!(edited.ledger.containers[0].usage, ContainerUse::InUse);
    assert_eq!(
        edited.ledger.containers[0]
            .quantity_owned
            .value()
            .map(|qty| qty.get()),
        Some(1)
    );
    let once = apply_inventory(&edited.ledger, &claim).unwrap();
    assert_eq!(once.conservation.reason_code, "ok");
    let twice = apply_inventory(
        &edited.ledger,
        &InventoryAction::Conserve {
            claims: vec![
                zari_core::inventory::OwnedClaim {
                    container_id: "bin-b".parse().unwrap(),
                    unit_ordinal: 0,
                },
                zari_core::inventory::OwnedClaim {
                    container_id: "bin-b".parse().unwrap(),
                    unit_ordinal: 0,
                },
            ],
        },
    )
    .unwrap();
    assert_eq!(twice.conservation.reason_code, "owned_double_consume");
    assert_eq!(twice.ledger, edited.ledger);
}

#[test]
fn return_does_not_treat_unknown_as_zero() {
    let purchased = run(&fixture("unknown-purchase"));
    let returned = apply_inventory(
        &purchased.ledger,
        &InventoryAction::Record {
            event: InventoryEvent {
                id: "evt-return".parse().unwrap(),
                subject_kind: SubjectKind::Item,
                subject_id: "towel".parse().unwrap(),
                kind: EventKind::Return,
                quantity_text: "1".into(),
                label: "수건".into(),
                location: None,
                holding: None,
                usage: None,
            },
        },
    );
    assert_eq!(returned.unwrap_err().code, "quantity_unknown");
}

#[test]
fn purchase_return_move_and_quantity_edit_remain_distinct_events() {
    let step = |ledger: &InventoryLedger,
                id: &str,
                kind: EventKind,
                quantity: &str,
                location: Option<&str>| {
        apply_inventory(
            ledger,
            &InventoryAction::Record {
                event: InventoryEvent {
                    id: id.parse().unwrap(),
                    subject_kind: SubjectKind::Item,
                    subject_id: "soap".parse().unwrap(),
                    kind,
                    quantity_text: quantity.into(),
                    label: "비누".into(),
                    location: location.map(str::to_owned),
                    holding: Some(HoldingKind::Bundle),
                    usage: None,
                },
            },
        )
        .unwrap_or_else(|error| panic!("{}", error.code))
    };
    let purchased = step(
        &InventoryLedger::empty(),
        "evt-buy",
        EventKind::Purchase,
        "2",
        None,
    );
    let moved = step(
        &purchased.ledger,
        "evt-move",
        EventKind::Move,
        "",
        Some("선반"),
    );
    let returned = step(&moved.ledger, "evt-back", EventKind::Return, "1", None);
    let edited = step(
        &returned.ledger,
        "evt-edit",
        EventKind::QuantityEdit,
        "",
        None,
    );
    let kinds: Vec<_> = edited
        .ledger
        .events
        .iter()
        .map(|event| event.kind)
        .collect();
    assert_eq!(
        kinds,
        vec![
            EventKind::Purchase,
            EventKind::Move,
            EventKind::Return,
            EventKind::QuantityEdit
        ]
    );
    assert_eq!(edited.labels[0].code, QuantityLabelCode::Unknown);
    assert!(edited.labels[0].count.is_none());
    assert_eq!(returned.labels[0].code, QuantityLabelCode::Count);
    assert_eq!(returned.labels[0].count, Some(1));
    assert_eq!(edited.ledger.items[0].holding, HoldingKind::Bundle);
}

#[test]
fn the_ledger_command_is_stateless_and_a_bare_payload_is_invalid() {
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
    assert_eq!(names[dispose - 2], "applyInventoryLedger");
    assert_eq!(names[dispose - 1], "reviewCatalogImport");
    let bare = send(
        &mut runtime,
        "bare",
        json!({"kind": "applyInventoryLedger"}),
    );
    assert_eq!(bare["event"]["kind"], "operationFailed");
    assert_eq!(bare["event"]["code"], "invalid_input");
    let opened = send(
        &mut runtime,
        "open",
        json!({
            "kind": "applyInventoryLedger",
            "ledger": {"items": [], "containers": [], "events": []},
            "action": {
                "kind": "openHistorical",
                "planSnapshotId": "0000000000000000000000000000000000000000000000000000000000000000"
            }
        }),
    );
    assert_eq!(opened["event"]["kind"], "inventoryLedgerApplied");
    assert_eq!(opened["event"]["reply"]["changed"], false);
    assert_eq!(opened["event"]["reply"]["ledger"]["events"], json!([]));
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
