//! Facts, provenance, measurement and raw input building blocks.
//! Raw DTOs deserialize first; normalization produces validated domain facts.

use crate::scalars::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use unicode_normalization::UnicodeNormalization;

pub const MAX_ID_REFERENCES: usize = 100;
pub const MAX_LABEL_CHARS: usize = 256;
pub const MAX_NOTE_CHARS: usize = 4096;
pub const MAX_URL_CHARS: usize = 2048;

#[derive(
    Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FieldRef {
    pub entity_id: Id,
    pub field_path: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum MeasurementOrigin {
    Synthetic,
    Manufacturer,
    Retailer,
    UserMeasured,
    UserDeclared,
    AiEstimated,
    Derived,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum VerificationStatus {
    Unverified,
    Estimated,
    Confirmed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provenance {
    pub origin: MeasurementOrigin,
    pub verification: VerificationStatus,
    pub evidence_ids: Vec<Id>,
    pub rule_ids: Vec<String>,
    pub input_refs: Vec<FieldRef>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub observed_at: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum UnknownReason {
    NotMeasured,
    NotProvided,
    SourceMissing,
    ConflictingSources,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[schemars(rename = "FactFor_{T}")]
pub enum Fact<T> {
    Known { value: T, provenance: Provenance },
    Unknown { reason: UnknownReason },
    NotApplicable { reason_code: String },
}
impl<T> Fact<T> {
    pub fn value(&self) -> Option<&T> {
        match self {
            Self::Known { value, .. } => Some(value),
            _ => None,
        }
    }
    pub fn unknown() -> Self {
        Self::Unknown {
            reason: UnknownReason::NotProvided,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RawUncertaintyDto {
    Unknown {},
    Bounded {
        minus_text: String,
        plus_text: String,
        unit: Unit,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Uncertainty {
    Unknown {},
    Bounded {
        minus_mm: ClearanceMm,
        plus_mm: ClearanceMm,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawMeasurementDto {
    pub text: String,
    pub unit: Unit,
    pub uncertainty: RawUncertaintyDto,
    pub origin: MeasurementOrigin,
    pub evidence_ids: Vec<Id>,
}
/// Signed integer-millimetre position entry; the only signed raw grammar.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawOffsetDto {
    pub text: String,
    pub uncertainty: RawUncertaintyDto,
    pub origin: MeasurementOrigin,
    pub evidence_ids: Vec<Id>,
}
/// Plain unsigned text entry inside a `RawFactDto` value.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RawScalarTextDto {
    pub text: String,
}
/// Raw form of `Fact<T>`: a known value with declared origin/evidence, an
/// explicit unknown reason, or an explicit not-applicable reason.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[schemars(rename = "RawFactFor_{T}")]
pub enum RawFactDto<T> {
    Known {
        value: T,
        origin: MeasurementOrigin,
        evidence_ids: Vec<Id>,
    },
    Unknown {
        reason: UnknownReason,
    },
    NotApplicable {
        reason_code: String,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RawCountDto {
    pub text: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasuredLength {
    pub nominal: LengthMm,
    pub uncertainty: Uncertainty,
}
pub type Measurement = Fact<MeasuredLength>;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasuredOffset {
    pub nominal: PositionMm,
    pub uncertainty: Uncertainty,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Dimensions {
    pub width: Measurement,
    pub depth: Measurement,
    pub height: Measurement,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Vec3Mm {
    pub x: PositionMm,
    pub y: PositionMm,
    pub z: PositionMm,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Extent3Mm {
    pub width: LengthMm,
    pub depth: LengthMm,
    pub height: LengthMm,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cuboid {
    pub min: Vec3Mm,
    pub extent: Extent3Mm,
}
/// Three measured minimum axes plus a measured extent, in the parent frame.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasuredCuboid {
    pub min_x: Fact<MeasuredOffset>,
    pub min_y: Fact<MeasuredOffset>,
    pub min_z: Fact<MeasuredOffset>,
    pub extent: Dimensions,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasuredRectangle {
    pub x: Fact<MeasuredOffset>,
    pub y: Fact<MeasuredOffset>,
    pub width: Measurement,
    pub depth: Measurement,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evidence {
    pub id: Id,
    pub source_kind: MeasurementOrigin,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub locator: Option<String>,
    pub source_field: String,
    pub note: String,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub observed_at: Option<String>,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub confirmed_by: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Diagnostic {
    pub field_path: String,
    pub code: String,
    pub reason_code: String,
}

pub fn valid_id(id: &str) -> bool {
    Id::new(id).is_ok()
}
pub fn valid_text(text: &str, max_chars: usize) -> bool {
    !text.is_empty() && text.chars().count() <= max_chars && text.is_char_boundary(text.len())
}
/// Accept bounded RFC3339 timestamps whose offset is explicitly UTC. In RFC3339,
/// `-00:00` means the local offset is unknown, so it is not an explicit UTC fact.
pub fn valid_utc_timestamp(text: &str) -> bool {
    let bytes = text.as_bytes();
    if !(20..=64).contains(&bytes.len()) || !text.is_ascii() {
        return false;
    }
    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || !matches!(bytes[10], b'T' | b't')
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return false;
    }
    let number = |start: usize, end: usize| -> Option<u32> {
        bytes[start..end].iter().try_fold(0, |n, digit| {
            digit
                .is_ascii_digit()
                .then(|| n * 10 + u32::from(digit - b'0'))
        })
    };
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        number(0, 4),
        number(5, 7),
        number(8, 10),
        number(11, 13),
        number(14, 16),
        number(17, 19),
    ) else {
        return false;
    };
    let last_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100)) => {
            29
        }
        2 => 28,
        _ => return false,
    };
    if day == 0 || day > last_day || hour > 23 || minute > 59 || second > 60 {
        return false;
    }
    // RFC3339 permits leap-second spelling only at the end of a UTC month.
    // This validates the representation, not the truth of an observation.
    if second == 60 && !(hour == 23 && minute == 59 && day == last_day) {
        return false;
    }
    let suffix = &text[19..];
    let zone = if let Some(fraction) = suffix.strip_prefix('.') {
        let digits = fraction.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            return false;
        }
        &fraction[digits..]
    } else {
        suffix
    };
    matches!(zone, "Z" | "z" | "+00:00")
}
/// A locator is a safe reference URL or local reference, never auto fetched.
pub fn valid_locator(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    valid_text(text, MAX_URL_CHARS)
        && !lower.starts_with("javascript:")
        && !lower.starts_with("data:")
        && !lower.starts_with("file:")
        && !text.chars().any(|c| c.is_control())
}

pub fn error(diagnostics: &mut Vec<Diagnostic>, path: &str, code: impl Into<String>) {
    let code = code.into();
    diagnostics.push(Diagnostic {
        field_path: path.into(),
        reason_code: code.clone(),
        code,
    });
}

/// Validate and canonicalize an evidence-id list: bounded, sorted, unique.
pub fn normalize_id_set(
    ids: &[Id],
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Vec<Id>> {
    if ids.len() > MAX_ID_REFERENCES {
        error(diagnostics, path, "input_limit_exceeded");
        return None;
    }
    let mut sorted = ids.to_vec();
    sorted.sort();
    if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
        error(diagnostics, path, "duplicate_id_reference");
        return None;
    }
    Some(sorted)
}

/// Validate a supplied provenance block and return its canonical form:
/// NFC text, sorted unique evidence/rule/ref sets. Used for facts that arrive
/// already structured (normalized records, bootstrap gaps).
pub fn normalize_provenance(
    provenance: &Provenance,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Provenance> {
    if provenance.rule_ids.len() > MAX_ID_REFERENCES
        || provenance
            .rule_ids
            .iter()
            .any(|v| !valid_text(v, MAX_LABEL_CHARS))
        || provenance.input_refs.len() > MAX_ID_REFERENCES
        || provenance
            .input_refs
            .iter()
            .any(|r| !valid_text(&r.field_path, MAX_LABEL_CHARS))
        || provenance
            .observed_at
            .as_ref()
            .is_some_and(|v| !valid_utc_timestamp(v))
    {
        error(diagnostics, path, "invalid_provenance");
        return None;
    }
    let evidence_ids = normalize_id_set(&provenance.evidence_ids, path, diagnostics)?;
    let mut rule_ids: Vec<String> = provenance
        .rule_ids
        .iter()
        .map(|s| s.nfc().collect::<String>())
        .collect();
    rule_ids.sort();
    let mut input_refs: Vec<FieldRef> = provenance
        .input_refs
        .iter()
        .map(|r| FieldRef {
            entity_id: r.entity_id.clone(),
            field_path: r.field_path.nfc().collect(),
        })
        .collect();
    input_refs.sort();
    if rule_ids.windows(2).any(|pair| pair[0] == pair[1])
        || input_refs.windows(2).any(|pair| pair[0] == pair[1])
    {
        error(diagnostics, path, "duplicate_provenance_reference");
        return None;
    }
    Some(Provenance {
        origin: provenance.origin.clone(),
        verification: provenance.verification.clone(),
        evidence_ids,
        rule_ids,
        input_refs,
        observed_at: provenance.observed_at.clone(),
    })
}

/// Re-canonicalize a fact carried inside an input DTO (validated scalar or
/// enum payload). `check` may add field-level diagnostics for the value.
pub fn normalize_fact<T, F>(
    fact: &Fact<T>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
    check: F,
) -> Fact<T>
where
    T: Clone,
    F: FnOnce(&T, &str, &mut Vec<Diagnostic>),
{
    match fact {
        Fact::Known { value, provenance } => {
            check(value, path, diagnostics);
            match normalize_provenance(provenance, path, diagnostics) {
                Some(provenance) => Fact::Known {
                    value: value.clone(),
                    provenance,
                },
                None => Fact::unknown(),
            }
        }
        Fact::NotApplicable { reason_code } if !valid_text(reason_code, MAX_LABEL_CHARS) => {
            error(diagnostics, path, "invalid_reason_code");
            Fact::unknown()
        }
        _ => fact.clone(),
    }
}

/// Provenance for a raw user/import entry: declared origin and evidence, never
/// an invented observation time or confirmation.
pub fn raw_provenance(
    origin: MeasurementOrigin,
    evidence_ids: &[Id],
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Provenance> {
    let evidence_ids = normalize_id_set(evidence_ids, path, diagnostics)?;
    Some(Provenance {
        origin,
        verification: VerificationStatus::Unverified,
        evidence_ids,
        rule_ids: vec![],
        input_refs: vec![],
        observed_at: None,
    })
}

fn bounded_uncertainty(
    raw: &RawUncertaintyDto,
    nominal_mm: u64,
    max_mm: u64,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Uncertainty> {
    match raw {
        RawUncertaintyDto::Unknown {} => Some(Uncertainty::Unknown {}),
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
                    if nominal_mm
                        .checked_sub(minus_mm.get().into())
                        .is_some_and(|v| v >= 1)
                        && nominal_mm
                            .checked_add(plus_mm.get().into())
                            .is_some_and(|v| v <= max_mm) =>
                {
                    Some(Uncertainty::Bounded { minus_mm, plus_mm })
                }
                (Err(e), _) | (_, Err(e)) => {
                    error(diagnostics, path, e);
                    None
                }
                (Ok(None), _) | (_, Ok(None)) => {
                    error(diagnostics, path, "uncertainty_missing");
                    None
                }
                _ => {
                    error(diagnostics, path, "uncertainty_out_of_range");
                    None
                }
            }
        }
    }
}

/// Normalize a raw mm/cm measurement into `Fact<MeasuredLength>`.
pub fn normalize_measurement(
    raw: &RawMeasurementDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Measurement {
    let Some(provenance) = raw_provenance(raw.origin.clone(), &raw.evidence_ids, path, diagnostics)
    else {
        return Fact::unknown();
    };
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
    let Some(uncertainty) = bounded_uncertainty(
        &raw.uncertainty,
        u64::from(nominal.get()),
        10_000,
        path,
        diagnostics,
    ) else {
        return Fact::unknown();
    };
    Fact::Known {
        value: MeasuredLength {
            nominal,
            uncertainty,
        },
        provenance,
    }
}

/// Normalize a raw measurement into a plain `Fact<ClearanceMm>`; a bounded
/// uncertainty cannot be represented on a clearance fact and is rejected.
pub fn normalize_clearance(
    raw: &RawMeasurementDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<ClearanceMm> {
    let Some(provenance) = raw_provenance(raw.origin.clone(), &raw.evidence_ids, path, diagnostics)
    else {
        return Fact::unknown();
    };
    if !matches!(raw.uncertainty, RawUncertaintyDto::Unknown {}) {
        error(diagnostics, path, "uncertainty_not_supported");
        return Fact::unknown();
    }
    match parse_clearance(&raw.text, raw.unit) {
        Ok(Some(value)) => Fact::Known { value, provenance },
        Ok(None) => Fact::Unknown {
            reason: UnknownReason::NotMeasured,
        },
        Err(e) => {
            error(diagnostics, path, e);
            Fact::unknown()
        }
    }
}

/// Inclusive PositionMm domain used by signed-offset intervals.
pub const POSITION_MM_MIN: i64 = -20_000;
pub const POSITION_MM_MAX: i64 = 20_000;
/// Nonnegative bound domain. Same numeric range as `ClearanceMm`.
pub const OFFSET_BOUND_MAX: i64 = 10_000;

/// Checked i64 subtraction and addition, before domain limits.
/// `i64::MIN - 1` and `i64::MAX + 1` are `numeric_overflow`.
pub fn checked_i64_interval(
    nominal: i64,
    minus: i64,
    plus: i64,
) -> Result<(i64, i64), &'static str> {
    let low = nominal.checked_sub(minus).ok_or("numeric_overflow")?;
    let high = nominal.checked_add(plus).ok_or("numeric_overflow")?;
    Ok((low, high))
}

/// Signed-offset interval `[nominal − minus, nominal + plus]`.
/// Nominal and both endpoints must lie in `PositionMm` (−20000..=20000).
/// Bounds must lie in `ClearanceMm` (0..=10000). Zero and zero-crossing
/// intervals are legal. This does not apply the positive-length rule.
pub fn signed_offset_interval(
    nominal: i64,
    minus: i64,
    plus: i64,
) -> Result<(i64, i64), &'static str> {
    if !(POSITION_MM_MIN..=POSITION_MM_MAX).contains(&nominal) {
        return Err("scalar_out_of_range");
    }
    if !(0..=OFFSET_BOUND_MAX).contains(&minus) || !(0..=OFFSET_BOUND_MAX).contains(&plus) {
        return Err("scalar_out_of_range");
    }
    let (low, high) = checked_i64_interval(nominal, minus, plus)?;
    if !(POSITION_MM_MIN..=POSITION_MM_MAX).contains(&low)
        || !(POSITION_MM_MIN..=POSITION_MM_MAX).contains(&high)
    {
        return Err("uncertainty_out_of_range");
    }
    Ok((low, high))
}

fn bounded_offset_uncertainty(
    raw: &RawUncertaintyDto,
    nominal: i64,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<Uncertainty> {
    match raw {
        RawUncertaintyDto::Unknown {} => Some(Uncertainty::Unknown {}),
        RawUncertaintyDto::Bounded {
            minus_text,
            plus_text,
            unit,
        } => {
            let minus = parse_clearance(minus_text, *unit);
            let plus = parse_clearance(plus_text, *unit);
            match (minus, plus) {
                (Err(code), _) | (_, Err(code)) => {
                    error(diagnostics, path, code);
                    None
                }
                (Ok(None), _) | (_, Ok(None)) => {
                    error(diagnostics, path, "uncertainty_missing");
                    None
                }
                (Ok(Some(minus_mm)), Ok(Some(plus_mm))) => {
                    match signed_offset_interval(
                        nominal,
                        i64::from(minus_mm.get()),
                        i64::from(plus_mm.get()),
                    ) {
                        Ok(_) => Some(Uncertainty::Bounded { minus_mm, plus_mm }),
                        Err(code) => {
                            error(diagnostics, path, code);
                            None
                        }
                    }
                }
            }
        }
    }
}

/// Diagnostic when a typed offset's bounded interval leaves `PositionMm`.
/// Unknown uncertainty and non-offset facts are not rewritten.
pub fn offset_interval_diagnostic(fact: &Fact<MeasuredOffset>) -> Option<&'static str> {
    let Fact::Known { value, .. } = fact else {
        return None;
    };
    let Uncertainty::Bounded { minus_mm, plus_mm } = value.uncertainty else {
        return None;
    };
    signed_offset_interval(
        i64::from(value.nominal.get()),
        i64::from(minus_mm.get()),
        i64::from(plus_mm.get()),
    )
    .err()
}

/// Normalize a signed millimetre offset into `Fact<MeasuredOffset>`.
/// The interval is `[nominal − minus, nominal + plus]` in checked i64.
/// Positive-length validation is not applied to `abs(nominal)`.
pub fn normalize_offset(
    raw: &RawOffsetDto,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<MeasuredOffset> {
    let Some(provenance) = raw_provenance(raw.origin.clone(), &raw.evidence_ids, path, diagnostics)
    else {
        return Fact::unknown();
    };
    let nominal = match parse_position(&raw.text) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return Fact::Unknown {
                reason: UnknownReason::NotMeasured,
            };
        }
        Err(code) => {
            error(diagnostics, path, code);
            return Fact::unknown();
        }
    };
    let Some(uncertainty) = bounded_offset_uncertainty(
        &raw.uncertainty,
        i64::from(nominal.get()),
        path,
        diagnostics,
    ) else {
        return Fact::unknown();
    };
    Fact::Known {
        value: MeasuredOffset {
            nominal,
            uncertainty,
        },
        provenance,
    }
}

/// Normalize a `RawFactDto` whose value is already a validated domain type.
pub fn normalize_raw_fact<T: Clone>(
    raw: &RawFactDto<T>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<T> {
    match raw {
        RawFactDto::Known {
            value,
            origin,
            evidence_ids,
        } => match raw_provenance(origin.clone(), evidence_ids, path, diagnostics) {
            Some(provenance) => Fact::Known {
                value: value.clone(),
                provenance,
            },
            None => Fact::unknown(),
        },
        RawFactDto::Unknown { reason } => Fact::Unknown {
            reason: reason.clone(),
        },
        RawFactDto::NotApplicable { reason_code } => {
            if !valid_text(reason_code, MAX_LABEL_CHARS) {
                error(diagnostics, path, "invalid_reason_code");
                return Fact::unknown();
            }
            Fact::NotApplicable {
                reason_code: reason_code.clone(),
            }
        }
    }
}

fn fact_state<T>(reason: &UnknownReason) -> Fact<T> {
    Fact::Unknown {
        reason: reason.clone(),
    }
}
fn fact_not_applicable<T>(
    reason_code: &str,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<T> {
    if !valid_text(reason_code, MAX_LABEL_CHARS) {
        error(diagnostics, path, "invalid_reason_code");
        return Fact::unknown();
    }
    Fact::NotApplicable {
        reason_code: reason_code.to_owned(),
    }
}

/// Normalize a `RawFactDto<RawScalarTextDto>` through a scalar text parser.
/// Empty text yields `empty_reason`, never a zero default.
pub fn normalize_text_fact<T>(
    raw: &RawFactDto<RawScalarTextDto>,
    empty_reason: UnknownReason,
    parse: impl FnOnce(&str) -> Result<Option<T>, String>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Fact<T> {
    match raw {
        RawFactDto::Known {
            value,
            origin,
            evidence_ids,
        } => {
            let Some(provenance) = raw_provenance(origin.clone(), evidence_ids, path, diagnostics)
            else {
                return Fact::unknown();
            };
            match parse(&value.text) {
                Ok(Some(v)) => Fact::Known {
                    value: v,
                    provenance,
                },
                Ok(None) => Fact::Unknown {
                    reason: empty_reason,
                },
                Err(e) => {
                    error(diagnostics, path, e);
                    Fact::unknown()
                }
            }
        }
        RawFactDto::Unknown { reason } => fact_state(reason),
        RawFactDto::NotApplicable { reason_code } => {
            fact_not_applicable(reason_code, path, diagnostics)
        }
    }
}

/// Normalize a `RawFactDto` whose value itself is a raw composite DTO.
/// `convert` returning `None` means its own diagnostics already explain the
/// failure; the fact becomes unknown rather than a fabricated default.
pub fn normalize_nested_fact<T, R>(
    raw: &RawFactDto<R>,
    path: &str,
    diagnostics: &mut Vec<Diagnostic>,
    convert: impl FnOnce(&R, &str, &mut Vec<Diagnostic>) -> Option<T>,
) -> Fact<T> {
    match raw {
        RawFactDto::Known {
            value,
            origin,
            evidence_ids,
        } => {
            let Some(nested) = convert(value, path, diagnostics) else {
                return Fact::unknown();
            };
            match raw_provenance(origin.clone(), evidence_ids, path, diagnostics) {
                Some(provenance) => Fact::Known {
                    value: nested,
                    provenance,
                },
                None => Fact::unknown(),
            }
        }
        RawFactDto::Unknown { reason } => fact_state(reason),
        RawFactDto::NotApplicable { reason_code } => {
            fact_not_applicable(reason_code, path, diagnostics)
        }
    }
}

pub type MessageParams = BTreeMap<String, String>;
