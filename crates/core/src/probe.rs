use crate::facts::*;
use crate::plan::{
    CheckBasis, CheckKind, CheckMeasurement, CheckStatus, ConstraintCheck, Remediation,
};
use crate::scalars::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BootstrapProbeDto {
    pub compartment_width: RawMeasurementDto,
    pub unit_width: RawMeasurementDto,
    pub unit_count: RawCountDto,
    pub left_gap_mm: Fact<ClearanceMm>,
    pub right_gap_mm: Fact<ClearanceMm>,
    pub between_gap_mm: Fact<ClearanceMm>,
    pub needed_new_units: RawCountDto,
    pub pack_quantity: RawCountDto,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NormalizedBootstrapInput {
    pub compartment_width: Measurement,
    pub unit_width: Measurement,
    pub unit_count: Fact<Quantity>,
    pub left_gap_mm: Fact<ClearanceMm>,
    pub right_gap_mm: Fact<ClearanceMm>,
    pub between_gap_mm: Fact<ClearanceMm>,
    pub needed_new_units: Fact<Quantity>,
    pub pack_quantity: Fact<PackQuantity>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RowObject {
    pub ordinal: u32,
    pub x_mm: Revision,
    pub width_mm: LengthMm,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrderResult {
    pub packs_to_order: Fact<Quantity>,
    pub supplied_units: Fact<UnitCount>,
    pub surplus_units: Fact<UnitCount>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BootstrapProbeResult {
    pub normalized_compartment_width: Measurement,
    pub normalized_unit_width: Measurement,
    pub required_width_mm: Fact<Revision>,
    pub row_objects: Fact<Vec<RowObject>>,
    pub width_check: ConstraintCheck,
    pub order: OrderResult,
    pub diagnostics: Vec<Diagnostic>,
}

fn bootstrap_id() -> Id {
    Id::new("bootstrap").expect("valid static id")
}
fn refs(fields: &[&str]) -> Vec<FieldRef> {
    fields
        .iter()
        .map(|s| FieldRef {
            entity_id: bootstrap_id(),
            field_path: (*s).into(),
        })
        .collect()
}
fn derived<T>(value: T, rule: &str, fields: &[&str]) -> Fact<T> {
    Fact::Known {
        value,
        provenance: Provenance {
            origin: MeasurementOrigin::Derived,
            verification: VerificationStatus::Unverified,
            evidence_ids: vec![],
            rule_ids: vec![rule.into()],
            input_refs: refs(fields),
            observed_at: None,
        },
    }
}
fn raw_known<T>(value: T, origin: MeasurementOrigin, evidence_ids: Vec<Id>) -> Fact<T> {
    Fact::Known {
        value,
        provenance: Provenance {
            origin,
            verification: VerificationStatus::Unverified,
            evidence_ids,
            rule_ids: vec![],
            input_refs: vec![],
            observed_at: None,
        },
    }
}
fn measure(raw: &RawMeasurementDto, path: &str, diagnostics: &mut Vec<Diagnostic>) -> Measurement {
    let ids_valid = raw.evidence_ids.len() <= 100;
    let mut ids = raw.evidence_ids.clone();
    ids.sort();
    ids.dedup();
    if !ids_valid || ids.len() != raw.evidence_ids.len() {
        error(diagnostics, path, "invalid_evidence_ids");
        return Fact::unknown();
    }
    let nominal = match parse_length(&raw.text, raw.unit) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return Fact::Unknown {
                reason: UnknownReason::NotMeasured,
            };
        }
        Err(e) => {
            error(diagnostics, path, e);
            return Fact::unknown();
        }
    };
    let uncertainty = match &raw.uncertainty {
        RawUncertaintyDto::Unknown {} => Uncertainty::Unknown {},
        RawUncertaintyDto::Bounded {
            minus_text,
            plus_text,
            unit,
        } => {
            let bounds = (
                parse_clearance(minus_text, *unit),
                parse_clearance(plus_text, *unit),
            );
            match bounds {
                (Ok(Some(minus_mm)), Ok(Some(plus_mm)))
                    if nominal
                        .get()
                        .checked_sub(minus_mm.get())
                        .is_some_and(|v| v >= 1)
                        && nominal
                            .get()
                            .checked_add(plus_mm.get())
                            .is_some_and(|v| v <= 10_000) =>
                {
                    Uncertainty::Bounded { minus_mm, plus_mm }
                }
                (Err(e), _) | (_, Err(e)) => {
                    error(diagnostics, path, e);
                    return Fact::unknown();
                }
                (Ok(None), _) | (_, Ok(None)) => {
                    error(diagnostics, path, "uncertainty_missing");
                    return Fact::unknown();
                }
                _ => {
                    error(diagnostics, path, "uncertainty_out_of_range");
                    return Fact::unknown();
                }
            }
        }
    };
    raw_known(
        MeasuredLength {
            nominal,
            uncertainty,
        },
        raw.origin.clone(),
        ids,
    )
}
fn count<T>(
    value: Result<Option<T>, String>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<T> {
    match value {
        Ok(Some(v)) => raw_known(v, MeasurementOrigin::UserDeclared, vec![]),
        Ok(None) => Fact::unknown(),
        Err(e) => {
            error(diagnostics, path, e);
            Fact::unknown()
        }
    }
}
fn normalize_gap(
    fact: &Fact<ClearanceMm>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<ClearanceMm> {
    let Fact::Known { value, provenance } = fact else {
        if matches!(fact, Fact::NotApplicable { .. }) {
            error(diagnostics, path, "not_applicable_not_allowed");
            return Fact::unknown();
        }
        return fact.clone();
    };
    let valid_text = |text: &str| !text.is_empty() && text.chars().count() <= 256;
    if provenance.evidence_ids.len() > 100
        || provenance.rule_ids.len() > 100
        || provenance.rule_ids.iter().any(|v| !valid_text(v))
        || provenance.input_refs.len() > 100
        || provenance
            .input_refs
            .iter()
            .any(|r| !valid_text(&r.field_path))
        || provenance
            .observed_at
            .as_ref()
            .is_some_and(|v| !valid_utc_timestamp(v))
    {
        error(diagnostics, path, "invalid_provenance");
        return Fact::unknown();
    }
    let mut normalized = provenance.clone();
    normalized.evidence_ids.sort();
    normalized.rule_ids = provenance
        .rule_ids
        .iter()
        .map(|s| s.nfc().collect())
        .collect();
    normalized.rule_ids.sort();
    normalized.input_refs = provenance
        .input_refs
        .iter()
        .map(|r| FieldRef {
            entity_id: r.entity_id.clone(),
            field_path: r.field_path.nfc().collect(),
        })
        .collect();
    normalized
        .input_refs
        .sort_by(|a, b| (&a.entity_id, &a.field_path).cmp(&(&b.entity_id, &b.field_path)));
    if normalized
        .evidence_ids
        .windows(2)
        .any(|pair| pair[0] == pair[1])
        || normalized
            .rule_ids
            .windows(2)
            .any(|pair| pair[0] == pair[1])
        || normalized
            .input_refs
            .windows(2)
            .any(|pair| pair[0] == pair[1])
    {
        error(diagnostics, path, "duplicate_provenance_reference");
        return Fact::unknown();
    }
    Fact::Known {
        value: *value,
        provenance: normalized,
    }
}
pub fn normalize_probe(input: &BootstrapProbeDto) -> (NormalizedBootstrapInput, Vec<Diagnostic>) {
    let mut diagnostics = vec![];
    let compartment_width = measure(
        &input.compartment_width,
        "compartmentWidth",
        &mut diagnostics,
    );
    let unit_width = measure(&input.unit_width, "unitWidth", &mut diagnostics);
    let mut unit_count = count(
        parse_quantity(&input.unit_count.text),
        "unitCount",
        &mut diagnostics,
    );
    if unit_count.value().is_some_and(|n| n.get() > 20) {
        error(&mut diagnostics, "unitCount", "input_limit_exceeded");
        unit_count = Fact::unknown();
    }
    let needed_new_units = count(
        parse_quantity(&input.needed_new_units.text),
        "neededNewUnits",
        &mut diagnostics,
    );
    let pack_quantity = count(
        parse_pack_quantity(&input.pack_quantity.text),
        "packQuantity",
        &mut diagnostics,
    );
    let left_gap_mm = normalize_gap(&input.left_gap_mm, "leftGapMm", &mut diagnostics);
    let right_gap_mm = normalize_gap(&input.right_gap_mm, "rightGapMm", &mut diagnostics);
    let between_gap_mm = normalize_gap(&input.between_gap_mm, "betweenGapMm", &mut diagnostics);
    (
        NormalizedBootstrapInput {
            compartment_width,
            unit_width,
            unit_count,
            left_gap_mm,
            right_gap_mm,
            between_gap_mm,
            needed_new_units,
            pack_quantity,
        },
        diagnostics,
    )
}
pub fn checked_row_width(
    n: u64,
    width: u64,
    left: u64,
    right: u64,
    between: u64,
) -> Result<u64, &'static str> {
    if n == 0 {
        return Ok(0);
    }
    width
        .checked_mul(n)
        .and_then(|v| v.checked_add(left))
        .and_then(|v| v.checked_add(right))
        .and_then(|v| between.checked_mul(n - 1).and_then(|g| v.checked_add(g)))
        .ok_or("arithmetic_overflow")
}
pub fn checked_packages(needed: u64, pack: u64) -> Result<(u64, u64, u64), &'static str> {
    if pack == 0 {
        return Err("pack_quantity_zero");
    }
    let packs = (needed / pack)
        .checked_add(u64::from(!needed.is_multiple_of(pack)))
        .ok_or("arithmetic_overflow")?;
    let supplied = packs.checked_mul(pack).ok_or("arithmetic_overflow")?;
    Ok((
        packs,
        supplied,
        supplied.checked_sub(needed).ok_or("arithmetic_overflow")?,
    ))
}
pub fn evaluate_probe(input: &BootstrapProbeDto) -> BootstrapProbeResult {
    let (n, mut diagnostics) = normalize_probe(input);
    let row_fields = [
        "unitCount",
        "unitWidth",
        "leftGapMm",
        "rightGapMm",
        "betweenGapMm",
    ];
    let mut required = Fact::unknown();
    let mut rows = Fact::unknown();
    if n.unit_count.value().is_some_and(|v| v.get() == 0) {
        required = derived(
            Revision::new(0).expect("zero revision"),
            "bootstrap.empty-row.v1",
            &["unitCount"],
        );
        rows = derived(vec![], "bootstrap.empty-row.v1", &["unitCount"]);
    } else if let (Some(count), Some(width), Some(left), Some(right), Some(gap)) = (
        n.unit_count.value(),
        n.unit_width.value(),
        n.left_gap_mm.value(),
        n.right_gap_mm.value(),
        n.between_gap_mm.value(),
    ) {
        match checked_row_width(
            u64::from(count.get()),
            u64::from(width.nominal.get()),
            u64::from(left.get()),
            u64::from(right.get()),
            u64::from(gap.get()),
        ) {
            Ok(value) => {
                required = derived(
                    Revision::new(value).expect("validated u64"),
                    "bootstrap.row-width.v1",
                    &row_fields,
                );
                let objects = (0..count.get())
                    .map(|ordinal| RowObject {
                        ordinal,
                        x_mm: Revision::new(
                            u64::from(left.get())
                                + u64::from(ordinal)
                                    * (u64::from(width.nominal.get()) + u64::from(gap.get())),
                        )
                        .expect("bounded row coordinate"),
                        width_mm: width.nominal,
                    })
                    .collect();
                rows = derived(objects, "bootstrap.row-positions.v1", &row_fields);
            }
            Err(e) => error(&mut diagnostics, "unitCount", e),
        }
    }
    let (status, reason_code) = match (n.compartment_width.value(), required.value()) {
        (Some(space), Some(width)) if width.get() <= u64::from(space.nominal.get()) => {
            (CheckStatus::Pass, "width_within_nominal_bounds")
        }
        (Some(_), Some(_)) => (CheckStatus::Fail, "width_exceeds_nominal_bounds"),
        _ => (CheckStatus::Unknown, "measurement_missing"),
    };
    let mut order = OrderResult {
        packs_to_order: Fact::unknown(),
        supplied_units: Fact::unknown(),
        surplus_units: Fact::unknown(),
    };
    let order_values = if n.needed_new_units.value().is_some_and(|v| v.get() == 0) {
        Some(Ok((0, 0, 0)))
    } else {
        n.needed_new_units
            .value()
            .zip(n.pack_quantity.value())
            .map(|(d, p)| checked_packages(u64::from(d.get()), u64::from(p.get())))
    };
    if let Some(values) = order_values {
        match values {
            Ok((packs, supplied, surplus)) => {
                let converted = u32::try_from(packs)
                    .ok()
                    .and_then(|v| Quantity::new(v).ok())
                    .zip(
                        u32::try_from(supplied)
                            .ok()
                            .and_then(|v| UnitCount::new(v).ok()),
                    )
                    .zip(
                        u32::try_from(surplus)
                            .ok()
                            .and_then(|v| UnitCount::new(v).ok()),
                    );
                if let Some(((packs, supplied), surplus)) = converted {
                    let fields = if n.needed_new_units.value().is_some_and(|v| v.get() == 0) {
                        vec!["neededNewUnits"]
                    } else {
                        vec!["neededNewUnits", "packQuantity"]
                    };
                    order = OrderResult {
                        packs_to_order: derived(packs, "bootstrap.package-count.v1", &fields),
                        supplied_units: derived(supplied, "bootstrap.supplied-units.v1", &fields),
                        surplus_units: derived(surplus, "bootstrap.surplus-units.v1", &fields),
                    };
                } else {
                    error(&mut diagnostics, "neededNewUnits", "arithmetic_overflow");
                }
            }
            Err(e) => error(&mut diagnostics, "neededNewUnits", e),
        }
    }
    let available = n
        .compartment_width
        .value()
        .map(|m| {
            derived(
                Revision::new(u64::from(m.nominal.get())).expect("length fits"),
                "bootstrap.available-width.v1",
                &["compartmentWidth"],
            )
        })
        .unwrap_or_else(Fact::unknown);
    let blocking = status != CheckStatus::Pass;
    BootstrapProbeResult {
        normalized_compartment_width: n.compartment_width,
        normalized_unit_width: n.unit_width,
        required_width_mm: required.clone(),
        row_objects: rows,
        width_check: ConstraintCheck {
            id: Id::new("bootstrap:width").expect("valid static id"),
            kind: CheckKind::OuterGeometry,
            subject_ids: vec![bootstrap_id()],
            status,
            reason_code: reason_code.into(),
            basis: CheckBasis::Nominal,
            evidence_refs: refs(&[
                "compartmentWidth",
                "unitWidth",
                "unitCount",
                "leftGapMm",
                "rightGapMm",
                "betweenGapMm",
            ]),
            measurements: vec![
                CheckMeasurement {
                    field_path: "compartmentWidth".into(),
                    value_mm: available,
                },
                CheckMeasurement {
                    field_path: "requiredWidthMm".into(),
                    value_mm: required,
                },
            ],
            blocking,
            remediation: if blocking {
                vec![Remediation {
                    code: "review_width_measurements".into(),
                    field_paths: vec!["compartmentWidth".into(), "unitWidth".into()],
                }]
            } else {
                vec![]
            },
        },
        order,
        diagnostics,
    }
}
