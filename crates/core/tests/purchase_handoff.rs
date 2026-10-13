//! z-purchase-handoff. Links, freshness, substitutes, and later events stay
//! off the stored snapshot. A link is not a payment.

use serde_json::{Value, json};
use std::{fs, path::Path};
use zari_core::plan::CheckStatus;
use zari_core::purchase_handoff::{
    ObservationFreshness, PurchaseHandoffAction, PurchaseLedger, classify_observation,
    prepare_purchase_handoff,
};
use zari_core::scalars::*;
use zari_core::*;

fn fixture_json(case: &str) -> Value {
    serde_json::from_str::<DomainFixture>(
        &fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../fixtures/domain")
                .join(format!("{case}.json")),
        )
        .unwrap(),
    )
    .unwrap()
    .input
}

fn project_input(catalog: &CatalogContent) -> ProjectInput {
    let mut input: ProjectInput =
        serde_json::from_value(fixture_json("record-input-verified")["input"].clone()).unwrap();
    input.catalog_pin = CatalogPin {
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(catalog),
    };
    let item_a = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == "item-a")
        .unwrap();
    item_a
        .requirement
        .allowed_retrieval_modes
        .push(RetrievalMode::PullContainerThenRetrieve);
    let item_b = input
        .items
        .iter_mut()
        .find(|item| item.id.as_str() == "item-b")
        .unwrap();
    item_b.requirement.must_stay_together = false;
    item_b.requirement.mandatory_compatibility = vec![];
    input.groups[0].split_policy = GroupSplitPolicy::AllowMultipleTargets;
    input.space.staging.free_volume.min_y = Fact::Known {
        value: MeasuredOffset {
            nominal: PositionMm::new(-400).unwrap(),
            uncertainty: Uncertainty::Unknown {},
        },
        provenance: Provenance {
            origin: MeasurementOrigin::UserDeclared,
            verification: VerificationStatus::Unverified,
            evidence_ids: vec![],
            rule_ids: vec![],
            input_refs: vec![],
            observed_at: None,
        },
    };
    input
}

fn base_catalog() -> CatalogContent {
    let snapshot: CatalogSnapshot =
        serde_json::from_value(fixture_json("record-catalog-verified")["catalog"].clone()).unwrap();
    CatalogContent::from(&snapshot)
}

fn pos(x: i32, y: i32, z: i32) -> Vec3Mm {
    Vec3Mm {
        x: PositionMm::new(x).unwrap(),
        y: PositionMm::new(y).unwrap(),
        z: PositionMm::new(z).unwrap(),
    }
}

fn publish(catalog: &CatalogContent, input: &ProjectInput) -> PlanSnapshot {
    let layout = CandidateLayout {
        placements: vec![Placement {
            id: Id::new("p-c1").unwrap(),
            subject: PlacementSubject::NewContainer {
                variant_id: Id::new("var-1").unwrap(),
                unit_ordinal: 0,
            },
            parent: ParentRef::Space {
                space_id: Id::new("space-1").unwrap(),
            },
            position: pos(5, 0, 0),
            orientation: Orientation::Upright0,
            support_id: Id::new("floor-1").unwrap(),
        }],
        assignments: vec![ItemAssignment {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
            location: ItemLocation::Contained {
                container_placement_id: Id::new("p-c1").unwrap(),
                local_placement: ItemPlacement {
                    position: pos(5, 5, 10),
                    orientation: Orientation::Upright0,
                    support_id: Id::new("cavity-floor-1").unwrap(),
                },
            },
        }],
        unassigned: vec![
            Unassigned {
                item_id: Id::new("item-a").unwrap(),
                instances: UnassignedInstances::Known {
                    ranges: vec![OrdinalRange {
                        start: 1,
                        end_exclusive: 2,
                    }],
                },
                reason_code: "no-space".into(),
            },
            Unassigned {
                item_id: Id::new("item-b").unwrap(),
                instances: UnassignedInstances::Known {
                    ranges: vec![OrdinalRange {
                        start: 0,
                        end_exclusive: 1,
                    }],
                },
                reason_code: "no-space".into(),
            },
        ],
        purchase_selections: vec![PurchaseSelection {
            placement_id: Id::new("p-c1").unwrap(),
            offer: OfferSelection::Selected {
                offer_id: Id::new("offer-1").unwrap(),
            },
        }],
    };
    let proposal = CandidateProposal {
        layout,
        strategy: StrategyDecision {
            strategy: Strategy::MinimumPurchase,
            rule_ids: vec![],
            fact_refs: vec![],
            groups: vec![],
            zones: vec![],
            priorities: vec![],
            reasons: vec![],
            assumptions: vec![],
        },
        creation: PlanCreation::ReferenceSearch,
    };
    let versions = CompileVersions {
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        input_digest: canonical::input_digest(input),
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(catalog),
        rule_version: canonical::RULE_VERSION.into(),
        solver_version: canonical::SOLVER_VERSION.into(),
        search_profile: input.search.profile.clone(),
        search_budget: input.search.budget.clone(),
        seed: input.search.seed.clone(),
    };
    let scope = SearchScope {
        profile: input.search.profile.clone(),
        budget: input.search.budget.clone(),
        group_ids: input.groups.iter().map(|group| group.id.clone()).collect(),
        restrictions: vec![],
    };
    evaluate_candidate(input, catalog, &proposal, versions, scope)
        .snapshot
        .expect("snapshot")
}

fn handoff(action: PurchaseHandoffAction) -> Value {
    serde_json::to_value(prepare_purchase_handoff(&action).expect("handoff")).expect("json")
}

fn event(id: &str, kind: &str, width: Option<u32>) -> Value {
    json!({
        "id": id,
        "offerId": "offer-1",
        "kind": kind,
        "note": "",
        "measuredWidthMm": width
    })
}

#[test]
fn observation_age_is_not_current_when_stale_or_missing() {
    assert_eq!(
        classify_observation(Some("2026-10-09T00:00:00Z"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Current
    );
    assert_eq!(
        classify_observation(Some("2026-10-03T00:00:00Z"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Current
    );
    assert_eq!(
        classify_observation(Some("2026-10-02T00:00:00Z"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Stale
    );
    assert_eq!(
        classify_observation(Some("2020-01-01T00:00:00Z"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Stale
    );
    assert_eq!(
        classify_observation(None, "2026-10-10T00:00:00Z"),
        ObservationFreshness::Unconfirmed
    );
    assert_eq!(
        classify_observation(Some("2026-10-11T00:00:00Z"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Unconfirmed
    );
    assert_eq!(
        classify_observation(Some("2023-02-29T00:00:00Z"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Unconfirmed
    );
    assert_eq!(
        classify_observation(Some("2024-02-29T00:00:00Z"), "2024-03-01T00:00:00Z"),
        ObservationFreshness::Current
    );
    assert_eq!(
        classify_observation(Some("not-a-time"), "2026-10-10T00:00:00Z"),
        ObservationFreshness::Unconfirmed
    );
}

#[test]
fn stale_stock_is_not_current_and_a_link_is_not_payment() {
    let mut catalog = base_catalog();
    let offer = catalog
        .offers
        .iter_mut()
        .find(|offer| offer.id.as_str() == "offer-1")
        .unwrap();
    let provenance = match &offer.pack_price {
        Fact::Known { provenance, .. } => provenance.clone(),
        _ => panic!("pack price"),
    };
    offer.observed_at = Some("2020-01-01T00:00:00Z".into());
    offer.url = Fact::Known {
        value: "https://seller.example/bin".into(),
        provenance,
    };
    let input = project_input(&catalog);
    let snapshot = publish(&catalog, &input);
    let reply = handoff(PurchaseHandoffAction::Prepare {
        snapshot: snapshot.clone(),
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
    });
    assert_eq!(reply["kind"], "prepared");
    assert_eq!(reply["prepared"]["recordsPayment"], false);
    assert_eq!(reply["prepared"]["affiliateChangesSuitability"], false);
    assert_eq!(reply["prepared"]["changed"], false);
    assert_eq!(
        reply["prepared"]["boundRevision"],
        snapshot.plan_snapshot_id.as_str()
    );
    let line = &reply["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["freshness"], "stale");
    assert_ne!(line["freshness"], "current");
    assert_eq!(line["paid"], false);
    assert_eq!(line["link"]["kind"], "http");
    assert_eq!(line["link"]["url"], "https://seller.example/bin");
    assert!(
        line["unconfirmed"]
            .as_array()
            .unwrap()
            .iter()
            .any(|code| code == "tax_unknown")
    );
    let text = reply.to_string();
    assert!(!text.contains("\"paid\":true"));
    assert!(!text.contains("최신"));
}

#[test]
fn missing_observation_and_rejected_url_stay_unconfirmed() {
    let catalog = base_catalog();
    let mut snapshot = publish(&catalog, &project_input(&catalog));
    let offer = snapshot
        .content
        .referenced_catalog
        .offers
        .iter_mut()
        .find(|offer| offer.id.as_str() == "offer-1")
        .unwrap();
    let provenance = match &offer.pack_price {
        Fact::Known { provenance, .. } => provenance.clone(),
        _ => panic!("pack price"),
    };
    offer.observed_at = None;
    offer.url = Fact::Known {
        value: "javascript:alert(1)".into(),
        provenance,
    };
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    let reply = handoff(PurchaseHandoffAction::Prepare {
        snapshot,
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
    });
    let line = &reply["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["freshness"], "unconfirmed");
    assert_eq!(line["link"]["kind"], "rejected");
    assert!(line["link"].get("url").is_none());
}

#[test]
fn affiliate_mark_does_not_change_suitability() {
    let catalog = base_catalog();
    let snapshot = publish(&catalog, &project_input(&catalog));
    let plain = handoff(PurchaseHandoffAction::Prepare {
        snapshot: snapshot.clone(),
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
    });
    let marked = handoff(PurchaseHandoffAction::Prepare {
        snapshot,
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![Id::new("offer-1").unwrap()],
        ledger: PurchaseLedger::empty(),
    });
    let left = &plain["prepared"]["sellers"][0]["lines"][0];
    let right = &marked["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(left["affiliate"], false);
    assert_eq!(right["affiliate"], true);
    assert_eq!(left["suitability"], right["suitability"]);
    assert_eq!(left["freshness"], right["freshness"]);
    assert_eq!(left["packPrice"], right["packPrice"]);
    assert_eq!(plain["prepared"]["affiliateChangesSuitability"], false);
}

#[test]
fn purchase_receipt_measure_and_return_stay_separate_events() {
    let catalog = base_catalog();
    let snapshot = publish(&catalog, &project_input(&catalog));
    let as_of = "2026-10-10T00:00:00Z".to_owned();
    let confirmed = handoff(PurchaseHandoffAction::Record {
        snapshot: snapshot.clone(),
        as_of: as_of.clone(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
        event: serde_json::from_value(event("evt-buy", "confirmedPurchase", None)).unwrap(),
    });
    let line = &confirmed["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["confirmedPurchase"], true);
    assert_eq!(line["received"], false);
    assert_eq!(line["measured"], false);
    assert_eq!(line["returned"], false);
    assert_eq!(line["paid"], false);
    assert_eq!(line["impact"], "none");
    assert_eq!(confirmed["prepared"]["recordsPayment"], false);
    assert_eq!(confirmed["prepared"]["changed"], true);
    let before = line["suitability"].clone();

    let received = handoff(PurchaseHandoffAction::Record {
        snapshot: snapshot.clone(),
        as_of: as_of.clone(),
        affiliate_offer_ids: vec![],
        ledger: serde_json::from_value(confirmed["prepared"]["ledger"].clone()).unwrap(),
        event: serde_json::from_value(event("evt-recv", "received", None)).unwrap(),
    });
    let line = &received["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["confirmedPurchase"], true);
    assert_eq!(line["received"], true);
    assert_eq!(line["returned"], false);
    assert_eq!(line["paid"], false);

    let measured = handoff(PurchaseHandoffAction::Record {
        snapshot: snapshot.clone(),
        as_of: as_of.clone(),
        affiliate_offer_ids: vec![],
        ledger: serde_json::from_value(received["prepared"]["ledger"].clone()).unwrap(),
        event: serde_json::from_value(event("evt-measure", "measured", None)).unwrap(),
    });
    let line = &measured["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["measured"], true);
    assert_eq!(line["impact"], "measurementUnknown");
    assert_eq!(line["historicalPassReused"], false);
    assert_eq!(line["measurementPromotesPass"], false);
    assert_eq!(line["suitability"], before);
    assert_eq!(
        measured["prepared"]["boundRevision"],
        snapshot.plan_snapshot_id.as_str()
    );

    let returned = handoff(PurchaseHandoffAction::Record {
        snapshot,
        as_of,
        affiliate_offer_ids: vec![],
        ledger: serde_json::from_value(measured["prepared"]["ledger"].clone()).unwrap(),
        event: serde_json::from_value(event("evt-return", "returned", None)).unwrap(),
    });
    let line = &returned["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["confirmedPurchase"], true);
    assert_eq!(line["received"], true);
    assert_eq!(line["measured"], true);
    assert_eq!(line["returned"], true);
    assert_eq!(
        returned["prepared"]["ledger"]["events"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
}

#[test]
fn a_different_width_is_not_the_same_pass() {
    let catalog = base_catalog();
    let snapshot = publish(&catalog, &project_input(&catalog));
    let differed = handoff(PurchaseHandoffAction::Record {
        snapshot,
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
        event: serde_json::from_value(event("evt-width", "measured", Some(9000))).unwrap(),
    });
    let line = &differed["prepared"]["sellers"][0]["lines"][0];
    assert_eq!(line["impact"], "dimensionsDiffer");
    assert_eq!(line["historicalPassReused"], false);
    assert_eq!(line["measurementPromotesPass"], false);
    assert_eq!(line["paid"], false);
}

#[test]
fn substitute_recheck_does_not_assume_identity_or_reuse_pass() {
    let catalog = base_catalog();
    let mut snapshot = publish(&catalog, &project_input(&catalog));
    for check in &mut snapshot.content.validation.checks {
        check.status = CheckStatus::Pass;
    }
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    let product = snapshot
        .content
        .referenced_catalog
        .products
        .iter()
        .find(|product| {
            snapshot
                .content
                .referenced_catalog
                .variants
                .iter()
                .any(|variant| variant.id.as_str() == "var-1" && variant.product_id == product.id)
        })
        .unwrap()
        .clone();
    let mut variant = snapshot
        .content
        .referenced_catalog
        .variants
        .iter()
        .find(|variant| variant.id.as_str() == "var-1")
        .unwrap()
        .clone();
    let mut offer = snapshot
        .content
        .referenced_catalog
        .offers
        .iter()
        .find(|offer| offer.id.as_str() == "offer-1")
        .unwrap()
        .clone();
    variant.id = Id::new("sub-var-1").unwrap();
    variant.dimensions.outer.width = Fact::Unknown {
        reason: UnknownReason::NotProvided,
    };
    offer.id = Id::new("sub-offer-1").unwrap();
    offer.variant_id = variant.id.clone();
    let unknown = handoff(PurchaseHandoffAction::ReviewSubstitute {
        snapshot: snapshot.clone(),
        placement_id: Id::new("p-c1").unwrap(),
        product: product.clone(),
        variant: variant.clone(),
        offer: offer.clone(),
        affiliate_offer_ids: vec![offer.id.clone()],
    });
    assert_eq!(unknown["kind"], "reviewed");
    assert_eq!(unknown["review"]["identityAssumed"], false);
    assert_eq!(unknown["review"]["reusedPass"], false);
    assert_eq!(unknown["review"]["adopted"], false);
    assert_eq!(unknown["review"]["recordsPayment"], false);
    assert_eq!(unknown["review"]["affiliateChangesSuitability"], false);
    assert_eq!(unknown["review"]["sameVariantId"], false);
    assert_eq!(unknown["review"]["substituteVariantId"], "sub-var-1");
    assert_ne!(unknown["review"]["suitability"], "pass");
    assert_eq!(unknown["review"]["suitability"], "unknown");
    assert_eq!(
        unknown["review"]["boundRevision"],
        snapshot.plan_snapshot_id.as_str()
    );

    let marked = handoff(PurchaseHandoffAction::ReviewSubstitute {
        snapshot: snapshot.clone(),
        placement_id: Id::new("p-c1").unwrap(),
        product: product.clone(),
        variant: variant.clone(),
        offer: offer.clone(),
        affiliate_offer_ids: vec![],
    });
    assert_eq!(
        marked["review"]["suitability"],
        unknown["review"]["suitability"]
    );

    if let Fact::Known { value, .. } = &mut variant.dimensions.outer.width {
        value.nominal = LengthMm::new(9000).unwrap();
    } else {
        variant.dimensions.outer.width = Fact::Known {
            value: MeasuredLength {
                nominal: LengthMm::new(9000).unwrap(),
                uncertainty: Uncertainty::Unknown {},
            },
            provenance: Provenance {
                origin: MeasurementOrigin::UserDeclared,
                verification: VerificationStatus::Unverified,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            },
        };
    }
    let wide = handoff(PurchaseHandoffAction::ReviewSubstitute {
        snapshot,
        placement_id: Id::new("p-c1").unwrap(),
        product,
        variant,
        offer,
        affiliate_offer_ids: vec![],
    });
    assert_ne!(wide["review"]["suitability"], "pass");
    assert_eq!(wide["review"]["reusedPass"], false);
    assert_eq!(wide["review"]["identityAssumed"], false);
}

#[test]
fn an_empty_purchase_list_is_not_a_zero_total() {
    let catalog = base_catalog();
    let mut snapshot = publish(&catalog, &project_input(&catalog));
    snapshot.content.bom.clear();
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    let reply = handoff(PurchaseHandoffAction::Prepare {
        snapshot: snapshot.clone(),
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
    });
    assert!(reply["prepared"]["sellers"].as_array().unwrap().is_empty());
    assert_eq!(reply["prepared"]["recordsPayment"], false);
    assert!(!reply.to_string().contains("\"amount\":\"0\""));
}

#[test]
fn a_tampered_snapshot_is_not_prepared_as_a_pass() {
    let catalog = base_catalog();
    let mut snapshot = publish(&catalog, &project_input(&catalog));
    snapshot.plan_snapshot_id = Digest::new(&"ab".repeat(32)).unwrap();
    let err = prepare_purchase_handoff(&PurchaseHandoffAction::Prepare {
        snapshot,
        as_of: "2026-10-10T00:00:00Z".into(),
        affiliate_offer_ids: vec![],
        ledger: PurchaseLedger::empty(),
    })
    .unwrap_err();
    assert_eq!(err.code, "digest_mismatch");
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

#[test]
fn handoff_command_rejects_a_bare_payload_and_a_payment_kind() {
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
    assert_eq!(names[dispose - 1], "preparePurchaseHandoff");
    assert_eq!(names[dispose - 2], "inspectPortableBundle");
    assert_eq!(
        send(
            &mut runtime,
            "bare",
            json!({"kind": "preparePurchaseHandoff"})
        )["event"]["code"],
        "invalid_input"
    );
    let paid = send(
        &mut runtime,
        "paid",
        json!({
            "kind": "preparePurchaseHandoff",
            "action": {
                "kind": "record",
                "snapshot": {},
                "asOf": "2026-10-10T00:00:00Z",
                "ledger": {"events": []},
                "event": {
                    "id": "evt-pay",
                    "offerId": "offer-1",
                    "kind": "paid",
                    "note": "",
                    "measuredWidthMm": null
                }
            }
        }),
    );
    assert_eq!(paid["event"]["code"], "invalid_input");
    let click = send(
        &mut runtime,
        "click",
        json!({
            "kind": "preparePurchaseHandoff",
            "action": {
                "kind": "record",
                "event": { "kind": "linkClicked" }
            }
        }),
    );
    assert_eq!(click["event"]["code"], "invalid_input");
    let freshness = send(
        &mut runtime,
        "fresh",
        json!({
            "kind": "preparePurchaseHandoff",
            "action": {
                "kind": "classifyFreshness",
                "observedAt": "2020-01-01T00:00:00Z",
                "asOf": "2026-10-10T00:00:00Z"
            }
        }),
    );
    assert_eq!(freshness["event"]["kind"], "purchaseHandoffPrepared");
    assert_eq!(freshness["event"]["reply"]["kind"], "freshness");
    assert_eq!(
        freshness["event"]["reply"]["freshness"]["freshness"],
        "stale"
    );
    assert_eq!(
        freshness["event"]["reply"]["freshness"]["recordsPayment"],
        false
    );
}
