use proptest::prelude::*;
use std::{fs, path::Path};
use zari_core::scalars::*;
use zari_core::*;

fn fixture_paths() -> Vec<std::path::PathBuf> {
    let mut paths: Vec<_> =
        fs::read_dir(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/bootstrap"))
            .unwrap()
            .map(|p| p.unwrap().path())
            .collect();
    paths.sort();
    paths
}
fn probe() -> BootstrapProbeDto {
    serde_json::from_str::<BootstrapFixture>(include_str!(
        "../../../fixtures/bootstrap/width-590-pass.json"
    ))
    .unwrap()
    .input
}
fn known<T>(v: &Fact<T>) -> Option<&T> {
    v.value()
}
#[test]
fn shared_fixture_oracles_are_independent_and_complete() {
    let paths = fixture_paths();
    assert!(paths.len() >= 25);
    for path in paths {
        let f: BootstrapFixture = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        let r = evaluate_probe(&f.input);
        let expected = f.expected;
        assert_eq!(r.width_check.status, expected.width_status, "{}", f.case_id);
        assert_eq!(
            known(&r.required_width_mm).map(|v| v.get().to_string()),
            expected.required_width_mm,
            "{}",
            f.case_id
        );
        assert_eq!(
            known(&r.row_objects).map(|rows| rows
                .iter()
                .map(|r| r.x_mm.get().to_string())
                .collect::<Vec<_>>()),
            expected.x_positions_mm,
            "{}",
            f.case_id
        );
        assert_eq!(
            known(&r.order.packs_to_order).map(|v| v.get()),
            expected.packs_to_order,
            "{}",
            f.case_id
        );
        assert_eq!(
            known(&r.order.supplied_units).map(|v| v.get()),
            expected.supplied_units,
            "{}",
            f.case_id
        );
        assert_eq!(
            known(&r.order.surplus_units).map(|v| v.get()),
            expected.surplus_units,
            "{}",
            f.case_id
        );
        assert_eq!(
            r.diagnostics
                .iter()
                .map(|d| d.field_path.clone())
                .collect::<Vec<_>>(),
            expected.diagnostic_fields,
            "{}",
            f.case_id
        );
        let encoded = serde_json::to_string(&r).unwrap();
        assert_eq!(
            serde_json::from_str::<BootstrapProbeResult>(&encoded).unwrap(),
            r
        );
    }
}
#[test]
fn input_units_do_not_change_authoritative_output() {
    let mm = probe();
    let mut cm = mm.clone();
    cm.compartment_width.text = "60.000".into();
    cm.compartment_width.unit = Unit::Cm;
    assert_eq!(evaluate_probe(&mm), evaluate_probe(&cm));
}
#[test]
fn unknown_uncertainty_is_not_zero_or_confirmation() {
    let r = evaluate_probe(&probe());
    let Fact::Known { value, provenance } = r.normalized_compartment_width else {
        panic!("measurement should be known")
    };
    assert_eq!(value.uncertainty, Uncertainty::Unknown {});
    assert_eq!(provenance.verification, VerificationStatus::Unverified);
    assert_eq!(provenance.observed_at, None);
}
#[test]
fn invalid_uncertainty_cannot_be_accepted() {
    let mut p = probe();
    p.compartment_width.uncertainty = RawUncertaintyDto::Bounded {
        minus_text: "600".into(),
        plus_text: "0".into(),
        unit: Unit::Mm,
    };
    let r = evaluate_probe(&p);
    assert_eq!(r.width_check.status, CheckStatus::Unknown);
    assert_eq!(r.diagnostics[0].code, "uncertainty_out_of_range");
}
#[test]
fn overflow_is_structured_not_wrapped() {
    assert_eq!(
        checked_row_width(u64::MAX, 2, 0, 0, 0),
        Err("arithmetic_overflow")
    );
    assert_eq!(
        checked_row_width(1, u64::MAX, 1, 0, 0),
        Err("arithmetic_overflow")
    );
    assert_eq!(checked_packages(u64::MAX, 2), Err("arithmetic_overflow"));
    assert_eq!(checked_packages(5, 0), Err("pack_quantity_zero"));
    assert_eq!(checked_packages(u64::MAX, 1), Ok((u64::MAX, u64::MAX, 0)));
}
#[test]
fn invalid_scalar_deserialization_is_rejected() {
    let mut value = serde_json::to_value(probe()).unwrap();
    value["leftGapMm"]["value"] = serde_json::json!(10001);
    assert!(serde_json::from_value::<BootstrapProbeDto>(value).is_err());
}
#[test]
fn unknown_count_and_not_applicable_gap_never_pass() {
    let mut p = probe();
    p.unit_count.text = "".into();
    let r = evaluate_probe(&p);
    assert_eq!(r.width_check.status, CheckStatus::Unknown);
    assert!(r.row_objects.value().is_none());
    p.unit_count.text = "3".into();
    p.left_gap_mm = Fact::NotApplicable {
        reason_code: "none".into(),
    };
    let r = evaluate_probe(&p);
    assert_eq!(r.width_check.status, CheckStatus::Unknown);
    assert_eq!(r.diagnostics[0].field_path, "leftGapMm");
}
proptest! {
    #[test]
    fn packages_conserve_quantity_and_are_minimal(needed in 0u64..=10_000, pack in 1u64..=10_000){
        let (packs,supplied,surplus)=checked_packages(needed,pack).unwrap();
        prop_assert_eq!(supplied,packs*pack);prop_assert_eq!(supplied,needed+surplus);prop_assert!(surplus<pack);prop_assert!(supplied>=needed);if packs>0{prop_assert!((packs-1)*pack<needed);}
    }
    #[test]
    fn rows_preserve_count_and_order(n in 1u32..=20,width in 1u32..=10_000, gap in 0u32..=10_000){
        let mut p=probe();p.unit_count.text=n.to_string();p.unit_width.text=width.to_string();let Fact::Known{value,..}=&mut p.between_gap_mm else{unreachable!()};*value=ClearanceMm::new(gap).unwrap();let r=evaluate_probe(&p);let rows=r.row_objects.value().unwrap();
        prop_assert_eq!(rows.len(),n as usize);let mut previous_end=0;for object in rows{prop_assert!(object.x_mm.get()>=previous_end);previous_end=object.x_mm.get()+u64::from(object.width_mm.get());}prop_assert_eq!(previous_end+5,r.required_width_mm.value().unwrap().get());
        prop_assert_eq!(r,evaluate_probe(&p));
    }
}
