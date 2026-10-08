//! z-offer-bundles. Pack math and seller money stay off the stored snapshot.

use serde_json::{Value, json};
use std::{fs, path::Path};
use zari_core::offer_bundles::{OfferQuoteAction, quote_offer_bundle};
use zari_core::scalars::*;
use zari_core::spatial_view::{SpatialSourceStamp, SpatialViewSource, project_spatial_view};
use zari_core::*;

fn quote(action: Value) -> Value {
    let action: OfferQuoteAction = serde_json::from_value(action).expect("action");
    serde_json::to_value(quote_offer_bundle(&action).expect("quote")).expect("json")
}

fn container(
    id: &str,
    seller: &str,
    needed: u32,
    pack: u32,
    price: &str,
    shipping: Value,
    stock: &str,
) -> Value {
    json!({
        "id": id,
        "role": "container",
        "sellerId": seller,
        "variantId": "var-1",
        "offerId": id,
        "physicalNeeded": needed,
        "reused": 0,
        "packQuantity": pack,
        "packPrice": price,
        "stock": stock,
        "shipping": shipping,
        "includedInParent": false,
        "minimumPacks": null,
        "replacementOfferId": null
    })
}

fn preview(lines: Vec<Value>, notes: Vec<Value>) -> Value {
    quote(json!({
        "kind": "preview",
        "preview": { "lines": lines, "sellerNotes": notes }
    }))
}

#[test]
fn three_needed_with_a_pack_of_two_orders_two_and_leaves_one() {
    let reply = preview(
        vec![container(
            "line-1",
            "seller-1",
            3,
            2,
            "1000",
            json!({"kind": "free"}),
            "inStock",
        )],
        vec![json!({"sellerId": "seller-1", "tax": "included"})],
    );
    let line = &reply["lines"][0];
    assert_eq!(line["newUnits"]["value"], 3);
    assert_eq!(line["packQuantity"]["value"], 2);
    assert_eq!(line["packsToOrder"]["value"], 2);
    assert_eq!(line["supplied"]["value"], 4);
    assert_eq!(line["surplus"]["value"], 1);
    assert_eq!(line["minimumUnits"]["value"], 2);
    assert_eq!(line["productSubtotal"]["amount"], "2000");
    assert_eq!(reply["knownProduct"]["amount"], "2000");
    assert_eq!(reply["knownShipping"]["state"], "known");
    assert_eq!(reply["knownShipping"]["amount"], "0");
    assert_eq!(reply["sellers"][0]["shippingStatus"], "free");
    assert_eq!(reply["grandTotal"]["amount"], "2000");
    assert!(reply["boundRevision"].is_null());
}

#[test]
fn unknown_shipping_is_not_added_as_free() {
    let reply = preview(
        vec![container(
            "line-1",
            "seller-1",
            3,
            2,
            "1000",
            json!({"kind": "unknown"}),
            "inStock",
        )],
        vec![json!({"sellerId": "seller-1", "tax": "included"})],
    );
    assert_eq!(reply["lines"][0]["packsToOrder"]["value"], 2);
    assert_eq!(reply["lines"][0]["surplus"]["value"], 1);
    assert_eq!(reply["knownProduct"]["amount"], "2000");
    assert_eq!(reply["knownShipping"]["state"], "unknown");
    assert!(reply["knownShipping"].get("amount").is_none());
    assert_eq!(reply["sellers"][0]["shippingStatus"], "unknown");
    assert_ne!(reply["sellers"][0]["shippingStatus"], "free");
    assert_eq!(reply["grandTotal"]["state"], "unknown");
    assert!(reply["grandTotal"].get("amount").is_none());
    assert!(
        reply["unconfirmed"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["code"] == "shipping_unknown")
    );
}

#[test]
fn one_fixed_fee_per_seller_and_included_parts_are_not_charged_twice() {
    let reply = preview(
        vec![
            container(
                "box-a",
                "seller-1",
                1,
                1,
                "5000",
                json!({"kind": "fixed", "fee": "3000"}),
                "inStock",
            ),
            container(
                "box-b",
                "seller-1",
                1,
                1,
                "7000",
                json!({"kind": "fixed", "fee": "3000"}),
                "inStock",
            ),
            json!({
                "id": "lid",
                "role": "requiredPart",
                "sellerId": "seller-1",
                "variantId": "var-lid",
                "offerId": "box-a",
                "physicalNeeded": 1,
                "reused": 0,
                "packQuantity": 1,
                "packPrice": "999",
                "stock": "inStock",
                "shipping": {"kind": "free"},
                "includedInParent": true,
                "minimumPacks": null,
                "replacementOfferId": null
            }),
        ],
        vec![json!({"sellerId": "seller-1", "tax": "included"})],
    );
    assert_eq!(reply["knownProduct"]["amount"], "12000");
    assert_eq!(reply["knownShipping"]["amount"], "3000");
    assert_eq!(reply["sellers"].as_array().unwrap().len(), 1);
    assert_eq!(reply["grandTotal"]["amount"], "15000");
    assert_eq!(
        reply["lines"][2]["productSubtotal"]["state"],
        "notApplicable"
    );
    assert_eq!(
        reply["lines"][2]["productSubtotal"]["reasonCode"],
        "included_in_parent"
    );
}

#[test]
fn owned_reuse_and_purchase_minimum_stay_exact() {
    let reply = preview(
        vec![
            json!({
                "id": "owned-1",
                "role": "ownedReuse",
                "sellerId": null,
                "variantId": "var-1",
                "offerId": null,
                "physicalNeeded": 2,
                "reused": 2,
                "packQuantity": null,
                "packPrice": null,
                "stock": "unknown",
                "shipping": {"kind": "unknown"},
                "includedInParent": false,
                "minimumPacks": null,
                "replacementOfferId": null
            }),
            json!({
                "id": "buy-1",
                "role": "container",
                "sellerId": "seller-1",
                "variantId": "var-1",
                "offerId": "offer-1",
                "physicalNeeded": 3,
                "reused": 0,
                "packQuantity": 2,
                "packPrice": "1000",
                "stock": "outOfStock",
                "shipping": {"kind": "free"},
                "includedInParent": false,
                "minimumPacks": 3,
                "replacementOfferId": "offer-alt"
            }),
        ],
        vec![json!({"sellerId": "seller-1", "tax": "unknown"})],
    );
    assert_eq!(
        reply["lines"][0]["productSubtotal"]["state"],
        "notApplicable"
    );
    assert_eq!(reply["lines"][0]["surplus"]["value"], 0);
    assert_eq!(reply["lines"][1]["packsToOrder"]["value"], 3);
    assert_eq!(reply["lines"][1]["supplied"]["value"], 6);
    assert_eq!(reply["lines"][1]["surplus"]["value"], 3);
    assert_eq!(reply["lines"][1]["minimumUnits"]["value"], 6);
    assert_eq!(reply["grandTotal"]["state"], "unknown");
    assert_eq!(reply["replacements"][0]["toOfferId"], "offer-alt");
    assert!(reply["replacements"][0]["boundRevision"].is_null());
    assert!(
        reply["unconfirmed"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["code"] == "tax_unknown")
    );
}

#[test]
fn blank_needed_stays_unknown_and_a_zero_pack_is_rejected() {
    let blank = preview(
        vec![json!({
            "id": "line-1",
            "role": "container",
            "sellerId": "seller-1",
            "variantId": null,
            "offerId": null,
            "physicalNeeded": null,
            "reused": null,
            "packQuantity": null,
            "packPrice": null,
            "stock": "unknown",
            "shipping": {"kind": "unknown"},
            "includedInParent": false,
            "minimumPacks": null,
            "replacementOfferId": null
        })],
        vec![],
    );
    assert_eq!(blank["lines"][0]["packsToOrder"]["state"], "unknown");
    assert_eq!(blank["lines"][0]["surplus"]["state"], "unknown");
    assert_ne!(blank["knownShipping"]["state"], "known");
    let action: OfferQuoteAction = serde_json::from_value(json!({
        "kind": "preview",
        "preview": {
            "lines": [container("line-1", "seller-1", 3, 0, "1000", json!({"kind":"free"}), "inStock")],
            "sellerNotes": []
        }
    }))
    .unwrap();
    assert_eq!(
        quote_offer_bundle(&action).unwrap_err().code,
        "pack_quantity_zero"
    );
}

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
    let eval = evaluate_candidate(input, catalog, &proposal, versions, scope);
    eval.snapshot.expect("snapshot")
}

#[test]
fn unknown_shipping_on_a_published_plan_is_not_a_free_total() {
    let mut catalog = base_catalog();
    let offer = catalog
        .offers
        .iter_mut()
        .find(|offer| offer.id.as_str() == "offer-1")
        .unwrap();
    offer.shipping = Fact::Unknown {
        reason: UnknownReason::NotProvided,
    };
    let input = project_input(&catalog);
    let snapshot = publish(&catalog, &input);
    assert!(
        snapshot
            .content
            .cost_summary
            .shipping_total
            .value()
            .is_none()
    );
    assert!(snapshot.content.cost_summary.grand_total.value().is_none());
    let reply = quote(json!({
        "kind": "snapshot",
        "snapshot": snapshot,
        "alternates": [],
        "sellerNotes": [{"sellerId": "seller-1", "tax": "included"}]
    }));
    assert_eq!(reply["boundRevision"], snapshot.plan_snapshot_id.as_str());
    assert_eq!(reply["knownShipping"]["state"], "unknown");
    assert!(reply["knownShipping"].get("amount").is_none());
    assert_eq!(reply["grandTotal"]["state"], "unknown");
}

#[test]
fn sold_out_replacement_publishes_one_revision_for_drawing_bom_and_guide() {
    let mut catalog = base_catalog();
    let mut sold = catalog
        .offers
        .iter()
        .find(|offer| offer.id.as_str() == "offer-1")
        .unwrap()
        .clone();
    if let Fact::Known { value, .. } = &mut sold.inventory {
        *value = InventoryState::OutOfStock;
    }
    let mut alternate = sold.clone();
    alternate.id = Id::new("offer-alt").unwrap();
    if let Fact::Known { value, .. } = &mut alternate.inventory {
        *value = InventoryState::InStock;
    }
    catalog
        .offers
        .retain(|offer| offer.id.as_str() != "offer-1");
    catalog.offers.push(sold);
    catalog.offers.push(alternate.clone());
    let input = project_input(&catalog);
    let snapshot = publish(&catalog, &input);
    let before = quote(json!({
        "kind": "snapshot",
        "snapshot": snapshot,
        "alternates": [alternate],
        "sellerNotes": [{"sellerId": "seller-1", "tax": "included"}]
    }));
    assert_eq!(before["boundRevision"], snapshot.plan_snapshot_id.as_str());
    assert_eq!(before["replacements"][0]["fromOfferId"], "offer-1");
    assert_eq!(before["replacements"][0]["toOfferId"], "offer-alt");
    assert_eq!(
        before["replacements"][0]["boundRevision"],
        snapshot.plan_snapshot_id.as_str()
    );
    assert_eq!(before["sellers"][0]["stock"], "outOfStock");

    let versions = CompileVersions {
        schema_version: canonical::SCHEMA_VERSION,
        canonical_version: canonical::CANONICAL_VERSION,
        input_digest: canonical::input_digest(&input),
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: canonical::catalog_digest(&catalog),
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
    let edited = evaluate_layout_edit(
        &input,
        &catalog,
        &snapshot,
        &LayoutEditCommand::SelectOffer {
            variant_id: Id::new("var-1").unwrap(),
            offer_id: Id::new("offer-alt").unwrap(),
        },
        None,
        versions,
        scope,
    );
    let next = edited.snapshot.expect("replacement snapshot");
    assert_ne!(next.plan_snapshot_id, snapshot.plan_snapshot_id);
    let bom = next
        .content
        .bom
        .iter()
        .find(|line| line.offer_id.as_ref().map(Id::as_str) == Some("offer-alt"))
        .expect("bom offer");
    assert!(!next.content.actions.is_empty());
    let projection = match project_spatial_view(&SpatialViewSource::Plan {
        snapshot: next.clone(),
    }) {
        Ok(projection) => projection,
        Err(failure) => panic!("{}", failure.code),
    };
    match projection.source {
        SpatialSourceStamp::Plan {
            plan_snapshot_id, ..
        } => assert_eq!(plan_snapshot_id, next.plan_snapshot_id),
        other => panic!("drawing stamp {other:?}"),
    }
    let after = quote(json!({
        "kind": "snapshot",
        "snapshot": next,
        "alternates": [],
        "sellerNotes": [{"sellerId": "seller-1", "tax": "included"}]
    }));
    assert_eq!(after["boundRevision"], next.plan_snapshot_id.as_str());
    assert!(after["replacements"].as_array().unwrap().is_empty());
    assert_eq!(after["sellers"][0]["stock"], "inStock");
    assert_eq!(
        after["lines"]
            .as_array()
            .unwrap()
            .iter()
            .find(|line| line["offerId"] == "offer-alt")
            .unwrap()["packsToOrder"]["value"],
        bom.packs_to_order.value().unwrap().get()
    );
    let old = quote(json!({
        "kind": "snapshot",
        "snapshot": snapshot,
        "alternates": [],
        "sellerNotes": []
    }));
    assert_eq!(old["boundRevision"], snapshot.plan_snapshot_id.as_str());
    assert_ne!(old["boundRevision"], after["boundRevision"]);
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
fn quote_command_is_stateless_and_a_bare_payload_is_rejected() {
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
    assert_eq!(names[dispose - 1], "quoteOfferBundle");
    let bare = send(&mut runtime, "bare", json!({"kind": "quoteOfferBundle"}));
    assert_eq!(bare["event"]["code"], "invalid_input");
    let quoted = send(
        &mut runtime,
        "preview",
        json!({
            "kind": "quoteOfferBundle",
            "action": {
                "kind": "preview",
                "preview": {
                    "lines": [container("line-1", "seller-1", 3, 2, "1000", json!({"kind":"unknown"}), "inStock")],
                    "sellerNotes": []
                }
            }
        }),
    );
    assert_eq!(quoted["event"]["kind"], "offerBundleQuoted");
    assert_eq!(
        quoted["event"]["reply"]["lines"][0]["packsToOrder"]["value"],
        2
    );
    assert_eq!(quoted["event"]["reply"]["lines"][0]["surplus"]["value"], 1);
    assert_eq!(
        quoted["event"]["reply"]["knownShipping"]["state"],
        "unknown"
    );
    assert!(quoted["event"]["reply"]["boundRevision"].is_null());
}
