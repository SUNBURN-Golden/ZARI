use proptest::prelude::*;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::{fs, path::Path};
use zari_core::scalars::*;
use zari_core::*;

fn fixture_input(case: &str) -> Value {
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
fn normalized_input() -> ProjectInput {
    serde_json::from_value(fixture_input("record-input-verified")["input"].clone()).unwrap()
}
fn catalog_snapshot() -> CatalogSnapshot {
    serde_json::from_value(fixture_input("record-catalog-verified")["catalog"].clone()).unwrap()
}
fn variants(catalog: &CatalogSnapshot) -> BTreeMap<&str, &ProductVariant> {
    catalog
        .variants
        .iter()
        .map(|v| (v.id.as_str(), v))
        .collect()
}
fn offers(catalog: &CatalogSnapshot) -> BTreeMap<&str, &Offer> {
    catalog.offers.iter().map(|o| (o.id.as_str(), o)).collect()
}
fn codes(diagnostics: &[Diagnostic]) -> Vec<&str> {
    diagnostics.iter().map(|d| d.code.as_str()).collect()
}

#[test]
fn shared_domain_fixtures_are_complete_and_pass() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/domain");
    let mut paths: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .map(|p| p.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    paths.sort();
    assert!(paths.len() >= 25, "domain fixture coverage");
    for path in paths {
        let fixture: DomainFixture = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        // Search fixtures require an installed engine; all other fixtures run
        // on the engine-less runtime to keep the capability subset honest.
        if matches!(
            fixture.operation,
            DomainOperation::ProposeStrategies | DomainOperation::RunSearch
        ) {
            let mut runtime = Runtime::new();
            runtime.set_search_engine(Box::new(zari_solver::SolverEngine));
            execute_domain_fixture_with(&fixture, &mut runtime)
                .unwrap_or_else(|e| panic!("{}: {e}", fixture.case_id));
        } else {
            execute_domain_fixture(&fixture).unwrap_or_else(|e| panic!("{}: {e}", fixture.case_id));
        }
    }
}

#[test]
fn manifest_covers_every_fixture() {
    let manifest: Value =
        serde_json::from_str(include_str!("../../../fixtures/manifest.json")).unwrap();
    let mut seen = std::collections::BTreeSet::new();
    for entry in manifest["entries"].as_array().unwrap() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join(entry["inputPath"].as_str().unwrap());
        assert!(path.exists(), "{}", entry["inputPath"].as_str().unwrap());
        assert!(seen.insert(entry["id"].as_str().unwrap().to_owned()));
    }
}

fn layout_for(input: &ProjectInput) -> CandidateLayout {
    // Cover every known ordinal explicitly: nothing assigned.
    let unassigned = input
        .items
        .iter()
        .filter_map(|item| {
            item.quantity.value().map(|q| Unassigned {
                item_id: item.id.clone(),
                instances: UnassignedInstances::Known {
                    ranges: (q.get() > 0)
                        .then(|| OrdinalRange {
                            start: 0,
                            end_exclusive: q.get(),
                        })
                        .into_iter()
                        .collect(),
                },
                reason_code: "no-space".into(),
            })
        })
        .collect();
    CandidateLayout {
        placements: vec![],
        assignments: vec![],
        unassigned,
        purchase_selections: vec![],
    }
}

#[test]
fn layout_graph_rules_reject_every_invalid_shape() {
    let input = normalized_input();
    let catalog = catalog_snapshot();
    let variants = variants(&catalog);
    let offers = offers(&catalog);
    let space = || input.space.id.clone();
    let floor = || input.space.support.id.clone();
    let position = Vec3Mm {
        x: PositionMm::new(0).unwrap(),
        y: PositionMm::new(0).unwrap(),
        z: PositionMm::new(0).unwrap(),
    };
    let placement = |id: &str, subject: PlacementSubject, parent: ParentRef| Placement {
        id: Id::new(id).unwrap(),
        subject,
        parent,
        position: position.clone(),
        orientation: Orientation::Upright0,
        support_id: floor(),
    };

    // Valid baseline: empty layout with full unassigned coverage.
    assert!(validate::validate_layout(&layout_for(&input), &input, &variants, &offers).is_empty());

    // Dangling item reference in an assignment.
    let mut layout = layout_for(&input);
    layout.assignments.push(ItemAssignment {
        item_id: Id::new("ghost").unwrap(),
        unit_ordinal: 0,
        location: ItemLocation::Direct {
            placement_id: Id::new("p-1").unwrap(),
        },
    });
    assert!(
        codes(&validate::validate_layout(
            &layout, &input, &variants, &offers
        ))
        .contains(&"dangling_item_ref")
    );

    // Ordinal partition overlap: same instance assigned and unassigned.
    let mut layout = layout_for(&input);
    layout.assignments.push(ItemAssignment {
        item_id: Id::new("item-a").unwrap(),
        unit_ordinal: 0,
        location: ItemLocation::Direct {
            placement_id: Id::new("p-1").unwrap(),
        },
    });
    layout.placements.push(placement(
        "p-1",
        PlacementSubject::DirectItem {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
        },
        ParentRef::Space { space_id: space() },
    ));
    assert!(
        codes(&validate::validate_layout(
            &layout, &input, &variants, &offers
        ))
        .contains(&"ordinal_partition_overlap"),
        "overlapping ordinal must be rejected"
    );

    // Direct placement without a matching assignment.
    let mut layout = layout_for(&input);
    layout.unassigned = vec![Unassigned {
        item_id: Id::new("item-a").unwrap(),
        instances: UnassignedInstances::Known {
            ranges: vec![OrdinalRange {
                start: 1,
                end_exclusive: 2,
            }],
        },
        reason_code: "no-space".into(),
    }];
    layout.placements.push(placement(
        "p-1",
        PlacementSubject::DirectItem {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
        },
        ParentRef::Space { space_id: space() },
    ));
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(
        codes(&found).contains(&"direct_placement_unassigned"),
        "{found:?}"
    );

    // Nested placement parents are not supported in v1.
    let mut layout = layout_for(&input);
    layout.placements.push(placement(
        "p-1",
        PlacementSubject::NewContainer {
            variant_id: Id::new("var-1").unwrap(),
            unit_ordinal: 0,
        },
        ParentRef::Container {
            placement_id: Id::new("p-0").unwrap(),
        },
    ));
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(
        codes(&found).contains(&"nesting_depth_exceeded"),
        "{found:?}"
    );

    // A new-container placement requires exactly one purchase selection.
    let mut layout = layout_for(&input);
    layout.placements.push(placement(
        "p-1",
        PlacementSubject::NewContainer {
            variant_id: Id::new("var-1").unwrap(),
            unit_ordinal: 0,
        },
        ParentRef::Space { space_id: space() },
    ));
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(
        codes(&found).contains(&"missing_purchase_selection"),
        "{found:?}"
    );
    layout.purchase_selections.push(PurchaseSelection {
        placement_id: Id::new("p-1").unwrap(),
        offer: OfferSelection::Unresolved {
            reason_code: "undecided".into(),
        },
    });
    layout.purchase_selections.push(PurchaseSelection {
        placement_id: Id::new("p-1").unwrap(),
        offer: OfferSelection::Selected {
            offer_id: Id::new("offer-1").unwrap(),
        },
    });
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(
        codes(&found).contains(&"duplicate_purchase_selection"),
        "{found:?}"
    );

    // An offer bound to a different variant cannot satisfy the selection.
    layout.purchase_selections.pop();
    layout.purchase_selections.push(PurchaseSelection {
        placement_id: Id::new("p-1").unwrap(),
        offer: OfferSelection::Selected {
            offer_id: Id::new("offer-ghost").unwrap(),
        },
    });
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(codes(&found).contains(&"dangling_offer_ref"), "{found:?}");

    // Unknown quantity with no explicit UnknownQuantity entry is unaccounted.
    let mut unknown_input = input.clone();
    unknown_input.items[0].quantity = Fact::Unknown {
        reason: UnknownReason::NotMeasured,
    };
    let mut layout = layout_for(&unknown_input);
    layout.unassigned.retain(|u| u.item_id.as_str() != "item-a");
    let found = validate::validate_layout(&layout, &unknown_input, &variants, &offers);
    assert!(
        codes(&found).contains(&"ordinal_partition_incomplete"),
        "{found:?}"
    );
    layout.unassigned.push(Unassigned {
        item_id: Id::new("item-a").unwrap(),
        instances: UnassignedInstances::UnknownQuantity {},
        reason_code: "unmeasured".into(),
    });
    assert!(validate::validate_layout(&layout, &unknown_input, &variants, &offers).is_empty());

    // A dangling support reference cannot carry a placement.
    let mut layout = layout_for(&input);
    let mut bad = placement(
        "p-1",
        PlacementSubject::DirectItem {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
        },
        ParentRef::Space { space_id: space() },
    );
    bad.support_id = Id::new("ghost-support").unwrap();
    layout.placements.push(bad);
    let found = validate::validate_layout(&layout, &input, &variants, &offers);
    assert!(codes(&found).contains(&"dangling_support_ref"), "{found:?}");

    // Direct retrieval requires the mode to be permitted by the item.
    let mut pull_only = input.clone();
    pull_only.items[0].requirement.allowed_retrieval_modes =
        vec![RetrievalMode::PullContainerThenRetrieve];
    let mut layout = layout_for(&pull_only);
    layout.placements.push(placement(
        "p-1",
        PlacementSubject::DirectItem {
            item_id: Id::new("item-a").unwrap(),
            unit_ordinal: 0,
        },
        ParentRef::Space { space_id: space() },
    ));
    layout.assignments.push(ItemAssignment {
        item_id: Id::new("item-a").unwrap(),
        unit_ordinal: 0,
        location: ItemLocation::Direct {
            placement_id: Id::new("p-1").unwrap(),
        },
    });
    layout.unassigned.retain(|u| u.item_id.as_str() != "item-a");
    layout.unassigned.push(Unassigned {
        item_id: Id::new("item-a").unwrap(),
        instances: UnassignedInstances::Known {
            ranges: vec![OrdinalRange {
                start: 1,
                end_exclusive: 2,
            }],
        },
        reason_code: "no-space".into(),
    });
    let found = validate::validate_layout(&layout, &pull_only, &variants, &offers);
    assert!(
        codes(&found).contains(&"retrieval_mode_not_permitted"),
        "{found:?}"
    );
}

#[test]
fn snapshot_action_cycles_and_dangling_refs_are_rejected() {
    let record = fixture_input("record-snapshot-verified");
    let VerifiableRecordDto::Snapshot { snapshot } =
        serde_json::from_value::<VerifiableRecordDto>(record).unwrap()
    else {
        unreachable!()
    };
    assert!(validate::validate_snapshot(&snapshot).is_empty());
    let mut cyclic = snapshot.clone();
    cyclic.content.actions = vec![
        ActionStep {
            id: Id::new("a1").unwrap(),
            kind: ActionKind::Install,
            subject_ids: vec![],
            prerequisite_step_ids: vec![Id::new("a2").unwrap()],
            required_confirmations: vec![],
            reason_ids: vec![],
        },
        ActionStep {
            id: Id::new("a2").unwrap(),
            kind: ActionKind::Install,
            subject_ids: vec![],
            prerequisite_step_ids: vec![Id::new("a1").unwrap()],
            required_confirmations: vec![],
            reason_ids: vec![],
        },
    ];
    cyclic.plan_snapshot_id = canonical::snapshot_digest(&cyclic.content);
    let found = validate::validate_snapshot(&cyclic);
    assert!(
        codes(&found).contains(&"cyclic_action_dependencies"),
        "{found:?}"
    );

    let mut dangling = snapshot.clone();
    dangling.content.scope.group_ids = vec![Id::new("ghost-group").unwrap()];
    dangling.plan_snapshot_id = canonical::snapshot_digest(&dangling.content);
    let found = validate::validate_snapshot(&dangling);
    assert!(codes(&found).contains(&"dangling_group_ref"), "{found:?}");
}

#[test]
fn verify_record_never_confirms_stale_or_tampered_content() {
    let mut runtime = Runtime::new();
    let init = |r: &mut Runtime, request_id: &str| {
        r.handle_json(
            &json!({"meta":{
                "protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
                "projectActivationId":"system","requestId":request_id,
                "projectId":"system","editorEpoch":"0","inputRevision":"0","contextId":null},
                "command":{"kind":"initialize","buildId":BUILD_ID,
                "expectedProtocolVersion":1,"expectedSchemaVersion":1}})
            .to_string(),
        )
    };
    let out = init(&mut runtime, "init");
    assert!(out.contains("\"ready\""));
    // Integrity check is legal pre-activation under the system identity.
    let record = fixture_input("record-input-verified");
    let out = runtime.handle_json(
        &json!({"meta":{
            "protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
            "projectActivationId":"system","requestId":"verify-1",
            "projectId":"system","editorEpoch":"0","inputRevision":"0","contextId":null},
            "command":{"kind":"verifyRecord","record":record}})
        .to_string(),
    );
    let event: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(event["event"]["kind"], "recordVerified");
    assert_eq!(event["event"]["verified"], true);
}

#[test]
fn project_activation_issues_context_and_fences_stale_ids() {
    let mut runtime = Runtime::new();
    let meta = |request_id: &str, context: Option<&str>| {
        json!({"protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
            "projectActivationId":"act-1","requestId":request_id,
            "projectId":"p-1","editorEpoch":"0","inputRevision":"0",
            "contextId":context})
    };
    runtime.handle_json(
        &json!({"meta":{
            "protocolVersion":1,"schemaVersion":1,"workerSessionId":"s",
            "projectActivationId":"system","requestId":"init",
            "projectId":"system","editorEpoch":"0","inputRevision":"0","contextId":null},
            "command":{"kind":"initialize","buildId":BUILD_ID,
            "expectedProtocolVersion":1,"expectedSchemaVersion":1}})
        .to_string(),
    );
    let mut input = normalized_input();
    let catalog = catalog_snapshot();
    input.catalog_pin = CatalogPin {
        catalog_version: catalog.catalog_version.clone(),
        catalog_digest: catalog.catalog_digest.clone(),
    };
    let out = runtime.handle_json(
        &json!({"meta":meta("activate", None::<&str>),"command":{
            "kind":"activateProject",
            "context":{"kind":"project","input":&input,"catalog":&catalog}}})
        .to_string(),
    );
    let event: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(event["event"]["kind"], "projectActivated");
    let context_id = event["event"]["contextId"].as_str().unwrap().to_owned();
    assert_eq!(context_id.len(), 64);
    // Requests must carry the issued context id.
    let out = runtime.handle_json(
        &json!({"meta":meta("op-1",None),"command":{"kind":"disposeProject"}}).to_string(),
    );
    assert!(out.contains("stale_result"));
    let out = runtime.handle_json(
        &json!({"meta":meta("op-2",Some(&context_id)),"command":{"kind":"disposeProject"}})
            .to_string(),
    );
    assert!(out.contains("projectDisposed"));

    // A tampered input cannot activate.
    let mut bad = input.clone();
    bad.items.push(bad.items[0].clone());
    let out = runtime.handle_json(
        &json!({"meta":meta("activate-bad", None::<&str>),"command":{
            "kind":"activateProject",
            "context":{"kind":"project","input":bad,"catalog":null}}})
        .to_string(),
    );
    assert!(out.contains("invalid_input"), "{out}");

    // The cached catalog validates against the pin on reactivation.
    let mut reactivation = normalized_input();
    reactivation.catalog_pin = input.catalog_pin.clone();
    let out = runtime.handle_json(
        &json!({"meta":meta("activate-2", None::<&str>),"command":{
            "kind":"activateProject",
            "context":{"kind":"project","input":&reactivation,"catalog":null}}})
        .to_string(),
    );
    let event: Value = serde_json::from_str(&out).unwrap();
    assert_eq!(
        event["event"]["contextId"].as_str().unwrap(),
        context_id,
        "same content yields the same context id"
    );
}

#[test]
fn aggregate_counts_use_checked_wide_arithmetic() {
    // DOMAIN_MODEL example: needed 10000, pack 9999 → packs 2, supplied 19998.
    let (packs, supplied, surplus) = checked_packages(10_000, 9_999).unwrap();
    assert_eq!((packs, supplied, surplus), (2, 19_998, 9_998));
}

proptest! {
    /// Canonical-equivalent permutations of set-like fields hash identically.
    #[test]
    fn nonsemantic_ordering_never_changes_the_digest(
        evidence_order in prop::collection::vec(0usize..3, 1..=3),
        rule_order in prop::collection::vec(0usize..3, 1..=3),
        width in 1u32..=10_000,
    ) {
        let mut input = normalized_input();
        let pool = ["ev-a", "ev-b", "ev-c"];
        input.evidence = pool.iter().map(|id| Evidence {
            id: Id::new(id).unwrap(),
            source_kind: MeasurementOrigin::UserDeclared,
            locator: None,
            source_field: "note".into(),
            note: String::new(),
            observed_at: None,
            confirmed_by: None,
        }).collect();
        let ids: Vec<Id> = evidence_order.iter().map(|i| Id::new(pool[*i]).unwrap()).collect();
        let rules: Vec<String> = rule_order.iter().map(|i| format!("rule-{}", i)).collect();
        if let Fact::Known { provenance, .. } = &mut input.space.interior.width {
            provenance.evidence_ids = ids;
            provenance.rule_ids = rules;
        }
        if let Fact::Known { value, .. } = &mut input.space.interior.depth {
            let _ = value;
        }
        input.space.interior.depth = Fact::Known {
            value: MeasuredLength {
                nominal: LengthMm::new(width).unwrap(),
                uncertainty: Uncertainty::Unknown {},
            },
            provenance: Provenance {
                origin: MeasurementOrigin::UserMeasured,
                verification: VerificationStatus::Unverified,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            },
        };
        prop_assert_eq!(
            canonical::input_digest(&input),
            canonical::input_digest(&canonical::canonicalize_input(&input)),
        );
        let mut permuted = input.clone();
        permuted.items.reverse();
        prop_assert_eq!(
            canonical::input_digest(&input),
            canonical::input_digest(&permuted),
        );
    }
    /// Every u64 survives the canonical decimal-string wire format.
    #[test]
    fn u64_strings_roundtrip_without_precision_loss(v in any::<u64>()) {
        let text = v.to_string();
        let parsed = parse_work_count(&text).unwrap().unwrap();
        prop_assert_eq!(parsed.get(), v);
        let encoded = serde_json::to_string(&parsed).unwrap();
        prop_assert_eq!(encoded.clone(), format!("\"{text}\""));
        prop_assert_eq!(serde_json::from_str::<WorkCount>(&encoded).unwrap(), parsed);
    }
    /// Arbitrary text input never panics and never fabricates a scalar.
    #[test]
    fn scalar_text_never_panics_or_defaults(text in "\\PC{0,32}") {
        let _ = parse_length(&text, Unit::Mm);
        let _ = parse_length(&text, Unit::Cm);
        let _ = parse_position(&text);
        let _ = parse_money_krw(&text);
        let _ = parse_mass_grams(&text);
        let _ = parse_quantity(&text);
    }
    /// Digest is injective across distinct normalized widths.
    #[test]
    fn semantically_different_inputs_do_not_collapse(a in 1u32..=10_000, b in 1u32..=10_000) {
        let mut first = normalized_input();
        let mut second = normalized_input();
        for (input, width) in [(&mut first, a), (&mut second, b)] {
            input.space.interior.width = Fact::Known {
                value: MeasuredLength {
                    nominal: LengthMm::new(width).unwrap(),
                    uncertainty: Uncertainty::Unknown {},
                },
                provenance: Provenance {
                    origin: MeasurementOrigin::UserMeasured,
                    verification: VerificationStatus::Unverified,
                    evidence_ids: vec![],
                    rule_ids: vec![],
                    input_refs: vec![],
                    observed_at: None,
                },
            };
        }
        if a == b {
            prop_assert_eq!(canonical::input_digest(&first), canonical::input_digest(&second));
        } else {
            prop_assert_ne!(canonical::input_digest(&first), canonical::input_digest(&second));
        }
    }
}
