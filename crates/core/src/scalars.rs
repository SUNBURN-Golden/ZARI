//! Validated scalar boundaries. Raw decimal parsing never uses floating point.

use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::{borrow::Cow, fmt, str::FromStr};

macro_rules! bounded_scalar {
    ($name:ident, $repr:ty, $min:expr, $max:expr) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
        #[serde(transparent)]
        pub struct $name($repr);

        impl $name {
            pub fn new(value: $repr) -> Result<Self, String> {
                if !($min..=$max).contains(&value) {
                    return Err("scalar_out_of_range".into());
                }
                Ok(Self(value))
            }

            pub const fn get(self) -> $repr {
                self.0
            }
        }

        impl TryFrom<$repr> for $name {
            type Error = String;
            fn try_from(value: $repr) -> Result<Self, Self::Error> {
                Self::new(value)
            }
        }

        impl From<$name> for $repr {
            fn from(value: $name) -> Self {
                value.0
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let value = <$repr>::deserialize(deserializer)?;
                Self::new(value).map_err(serde::de::Error::custom)
            }
        }

        impl JsonSchema for $name {
            fn schema_name() -> Cow<'static, str> {
                stringify!($name).into()
            }

            fn schema_id() -> Cow<'static, str> {
                concat!(module_path!(), "::", stringify!($name)).into()
            }

            fn json_schema(_: &mut SchemaGenerator) -> Schema {
                json_schema!({"type": "integer", "minimum": $min, "maximum": $max})
            }
        }
    };
}

bounded_scalar!(LengthMm, u32, 1, 10_000);
bounded_scalar!(ClearanceMm, u32, 0, 10_000);
bounded_scalar!(PositionMm, i32, -20_000, 20_000);
bounded_scalar!(Quantity, u32, 0, 10_000);
bounded_scalar!(PackQuantity, u32, 1, 10_000);
bounded_scalar!(UnitCount, u32, 0, u32::MAX);
bounded_scalar!(MassGrams, u32, 0, 1_000_000);

fn schema_pattern(pattern: &str) -> Schema {
    // `$` alone may match just before a final newline in JSON Schema's ECMA
    // regex dialect. The final lookahead enforces the actual end of the string.
    json_schema!({"type": "string", "pattern": format!("{pattern}(?![\\s\\S])")})
}

macro_rules! string_scalar {
    ($name:ident, $pattern:expr, $error:expr, $check:expr) => {
        #[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: &str) -> Result<Self, String> {
                let check: fn(&[u8]) -> bool = $check;
                if check(value.as_bytes()) {
                    Ok(Self(value.to_owned()))
                } else {
                    Err($error.into())
                }
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl FromStr for $name {
            type Err = String;
            fn from_str(value: &str) -> Result<Self, Self::Err> {
                Self::new(value)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let value = String::deserialize(deserializer)?;
                Self::new(&value).map_err(serde::de::Error::custom)
            }
        }

        impl JsonSchema for $name {
            fn schema_name() -> Cow<'static, str> {
                stringify!($name).into()
            }

            fn schema_id() -> Cow<'static, str> {
                concat!(module_path!(), "::", stringify!($name)).into()
            }

            fn json_schema(_: &mut SchemaGenerator) -> Schema {
                schema_pattern($pattern)
            }
        }
    };
}

// JSON numbers cannot losslessly transport u64 through JavaScript. The pattern
// describes exactly the canonical decimal strings at or below u64::MAX, not
// merely arbitrary 20-digit strings. Serde enforces the same range.
fn canonical_u64_pattern() -> String {
    let upper = "18446744073709551615";
    let mut alternatives = vec!["0".to_owned(), "[1-9][0-9]{0,18}".to_owned()];
    for (index, digit) in upper.bytes().enumerate().skip(1) {
        if digit == b'0' {
            continue;
        }
        let max = char::from(digit - 1);
        let lower_digit = if max == '0' {
            "0".to_owned()
        } else {
            format!("[0-{max}]")
        };
        let suffix_length = upper.len() - index - 1;
        alternatives.push(format!(
            "{}{lower_digit}[0-9]{{{suffix_length}}}",
            &upper[..index]
        ));
    }
    alternatives.push(upper.to_owned());
    // `$` alone may match just before a final newline in JSON Schema's ECMA
    // regex dialect. The final lookahead enforces the actual end of the string.
    format!("^(?:{})(?![\\s\\S])", alternatives.join("|"))
}

fn parse_canonical_u64(text: &str) -> Result<u64, String> {
    if text.is_empty()
        || text.len() > 20
        || !text.bytes().all(|byte| byte.is_ascii_digit())
        || (text.len() > 1 && text.starts_with('0'))
    {
        return Err("invalid_canonical_decimal".into());
    }
    text.parse().map_err(|_| "numeric_overflow".into())
}

macro_rules! decimal_scalar {
    ($name:ident) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(u64);

        impl $name {
            pub fn new(value: u64) -> Result<Self, String> {
                Ok(Self(value))
            }

            pub const fn get(self) -> u64 {
                self.0
            }
        }

        impl FromStr for $name {
            type Err = String;
            fn from_str(value: &str) -> Result<Self, Self::Err> {
                parse_canonical_u64(value).map(Self)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }

        impl Serialize for $name {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.collect_str(self)
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let value = String::deserialize(deserializer)?;
                Self::from_str(&value).map_err(serde::de::Error::custom)
            }
        }

        impl JsonSchema for $name {
            fn schema_name() -> Cow<'static, str> {
                stringify!($name).into()
            }

            fn schema_id() -> Cow<'static, str> {
                concat!(module_path!(), "::", stringify!($name)).into()
            }

            fn json_schema(_: &mut SchemaGenerator) -> Schema {
                json_schema!({
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 20,
                    "pattern": canonical_u64_pattern()
                })
            }
        }
    };
}

decimal_scalar!(Revision);
decimal_scalar!(MoneyKrw);
decimal_scalar!(WorkCount);

string_scalar!(
    Id,
    "^[A-Za-z0-9_:-]{1,96}",
    "invalid_id",
    |bytes: &[u8]| {
        !bytes.is_empty()
            && bytes.len() <= 96
            && bytes
                .iter()
                .all(|b| b.is_ascii_alphanumeric() || b"_:-".contains(b))
    }
);
string_scalar!(
    Digest,
    "^[0-9a-f]{64}",
    "invalid_digest",
    |bytes: &[u8]| {
        bytes.len() == 64
            && bytes
                .iter()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
    }
);

impl Digest {
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        let mut text = String::with_capacity(64);
        for byte in bytes {
            text.push(char::from_digit((byte >> 4).into(), 16).expect("nibble"));
            text.push(char::from_digit((byte & 0x0f).into(), 16).expect("nibble"));
        }
        Self(text)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Unit {
    Mm,
    Cm,
}

fn raw_text(text: &str) -> Result<Option<&str>, String> {
    if text.len() > 64 {
        return Err("numeric_field_too_long".into());
    }
    let trimmed = text.trim();
    Ok((!trimmed.is_empty()).then_some(trimmed))
}

fn digits_to_u64(text: &str) -> Result<u64, String> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("invalid_number".into());
    }
    text.bytes().try_fold(0_u64, |value, byte| {
        value
            .checked_mul(10)
            .and_then(|value| value.checked_add(u64::from(byte - b'0')))
            .ok_or_else(|| "numeric_overflow".to_owned())
    })
}

fn parse_mm(text: &str, unit: Unit) -> Result<Option<u32>, String> {
    let Some(text) = raw_text(text)? else {
        return Ok(None);
    };
    let millimeters = match unit {
        Unit::Mm => digits_to_u64(text)?,
        Unit::Cm => {
            let (whole, fraction) = match text.split_once('.') {
                Some((whole, fraction)) => {
                    if fraction.is_empty()
                        || fraction.len() > 16
                        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
                    {
                        return Err("invalid_number".into());
                    }
                    (whole, Some(fraction))
                }
                None => (text, None),
            };
            let whole = digits_to_u64(whole)?;
            let fractional_mm = if let Some(fraction) = fraction {
                if !fraction.bytes().skip(1).all(|digit| digit == b'0') {
                    return Err("submillimeter_precision".into());
                }
                u64::from(fraction.as_bytes()[0] - b'0')
            } else {
                0
            };
            whole
                .checked_mul(10)
                .and_then(|value| value.checked_add(fractional_mm))
                .ok_or_else(|| "numeric_overflow".to_owned())?
        }
    };
    u32::try_from(millimeters)
        .map(Some)
        .map_err(|_| "scalar_out_of_range".into())
}

pub fn parse_length(text: &str, unit: Unit) -> Result<Option<LengthMm>, String> {
    parse_mm(text, unit)?.map(LengthMm::new).transpose()
}

pub fn parse_clearance(text: &str, unit: Unit) -> Result<Option<ClearanceMm>, String> {
    parse_mm(text, unit)?.map(ClearanceMm::new).transpose()
}

fn parse_count(text: &str) -> Result<Option<u32>, String> {
    let Some(text) = raw_text(text)? else {
        return Ok(None);
    };
    u32::try_from(digits_to_u64(text)?)
        .map(Some)
        .map_err(|_| "scalar_out_of_range".into())
}

pub fn parse_quantity(text: &str) -> Result<Option<Quantity>, String> {
    parse_count(text)?.map(Quantity::new).transpose()
}

pub fn parse_pack_quantity(text: &str) -> Result<Option<PackQuantity>, String> {
    parse_count(text)?.map(PackQuantity::new).transpose()
}

/// Signed integer millimetres before the `PositionMm` range check.
/// A magnitude that does not fit in `i64` is `numeric_overflow`, distinct
/// from a value that fits `i64` but not `PositionMm`.
pub fn parse_signed_i64(text: &str) -> Result<Option<i64>, String> {
    let Some(text) = raw_text(text)? else {
        return Ok(None);
    };
    let (negative, digits) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text),
    };
    let magnitude = digits_to_u64(digits)?;
    // `i64::MIN` is the one negative value whose magnitude does not fit in `i64`.
    if negative && magnitude == 1_u64 << 63 {
        return Ok(Some(i64::MIN));
    }
    let magnitude = i64::try_from(magnitude).map_err(|_| "numeric_overflow".to_owned())?;
    Ok(Some(if negative { -magnitude } else { magnitude }))
}

/// Signed integer millimetres: the explicit signed exception. `-0` is zero.
pub fn parse_position(text: &str) -> Result<Option<PositionMm>, String> {
    let Some(value) = parse_signed_i64(text)? else {
        return Ok(None);
    };
    let value = i32::try_from(value).map_err(|_| "scalar_out_of_range".to_owned())?;
    PositionMm::new(value).map(Some)
}

pub fn parse_mass_grams(text: &str) -> Result<Option<MassGrams>, String> {
    parse_count(text)?.map(MassGrams::new).transpose()
}

fn parse_u64_text(text: &str) -> Result<Option<u64>, String> {
    let Some(text) = raw_text(text)? else {
        return Ok(None);
    };
    digits_to_u64(text).map(Some)
}

pub fn parse_money_krw(text: &str) -> Result<Option<MoneyKrw>, String> {
    parse_u64_text(text)?.map(MoneyKrw::new).transpose()
}

pub fn parse_work_count(text: &str) -> Result<Option<WorkCount>, String> {
    parse_u64_text(text)?.map(WorkCount::new).transpose()
}

pub fn format_length(length: LengthMm, unit: Unit) -> String {
    format_nonnegative_mm(length.get(), unit)
}

/// Format a clearance, including a user-entered zero. Zero is not unknown.
pub fn format_clearance(value: ClearanceMm, unit: Unit) -> String {
    format_nonnegative_mm(value.get(), unit)
}

fn format_nonnegative_mm(value: u32, unit: Unit) -> String {
    match unit {
        Unit::Mm => value.to_string(),
        Unit::Cm if value.is_multiple_of(10) => (value / 10).to_string(),
        Unit::Cm => format!("{}.{}", value / 10, value % 10),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn exact_decimal_normalization_and_unknown_are_distinct() {
        for text in ["60.1", "60.10", "060.1000000000000000", " 60.1 "] {
            assert_eq!(parse_length(text, Unit::Cm), Ok(Some(LengthMm(601))));
        }
        assert_eq!(parse_length("60", Unit::Cm), Ok(Some(LengthMm(600))));
        assert_eq!(parse_length("  \t", Unit::Mm), Ok(None));
        assert_eq!(parse_quantity("0"), Ok(Some(Quantity(0))));
        assert_eq!(parse_clearance("0.0", Unit::Cm), Ok(Some(ClearanceMm(0))));
        assert!(parse_length("0", Unit::Mm).is_err());
        assert!(parse_pack_quantity("0").is_err());
        assert_eq!(parse_pack_quantity(""), Ok(None));
    }

    #[test]
    fn invalid_grammar_and_submillimeter_values_never_round() {
        for text in [
            ".1", "60.", "+60", "-60", "6e1", "1,000", "NaN", "Infinity", "１", "60 mm", "1.1.0",
        ] {
            assert!(parse_length(text, Unit::Cm).is_err(), "accepted {text}");
        }
        for text in ["60.01", "60.0000000000000001"] {
            assert_eq!(
                parse_length(text, Unit::Cm),
                Err("submillimeter_precision".into())
            );
        }
        assert!(parse_length("60.10000000000000000", Unit::Cm).is_err());
        assert!(parse_length("1.0", Unit::Mm).is_err());
        assert!(parse_quantity("1.0").is_err());
        assert!(parse_length(&"0".repeat(65), Unit::Mm).is_err());
    }

    #[test]
    fn constructors_and_serde_share_domain_bounds() {
        assert!(LengthMm::new(10_001).is_err());
        assert!(PositionMm::new(-20_001).is_err());
        assert!(PositionMm::new(20_001).is_err());
        assert!(PositionMm::new(-20_000).is_ok());
        assert!(serde_json::from_str::<LengthMm>("0").is_err());
        assert!(serde_json::from_str::<Quantity>("10001").is_err());
        assert!(serde_json::from_str::<PackQuantity>("0").is_err());
        assert!(serde_json::from_str::<LengthMm>("1.5").is_err());
        assert!(serde_json::from_str::<LengthMm>("\"1\"").is_err());
        assert_eq!(UnitCount::new(19_998).unwrap().get(), 19_998);
        assert_eq!(UnitCount::new(u32::MAX).unwrap().get(), u32::MAX);
    }

    #[test]
    fn integer_overflow_and_scalar_bounds_are_checked() {
        assert!(parse_length("18446744073709551616", Unit::Mm).is_err());
        assert!(parse_length("18446744073709551615", Unit::Cm).is_err());
        assert!(parse_quantity("4294967296").is_err());
        assert!(parse_quantity("10001").is_err());
        assert_eq!(parse_length("1000", Unit::Cm), Ok(Some(LengthMm(10_000))));
        assert!(parse_length("1000.1", Unit::Cm).is_err());
    }

    #[test]
    fn u64_wire_requires_canonical_lossless_strings() {
        let maximum = Revision::new(u64::MAX).unwrap();
        let json = serde_json::to_string(&maximum).unwrap();
        assert_eq!(json, "\"18446744073709551615\"");
        assert_eq!(serde_json::from_str::<Revision>(&json).unwrap(), maximum);
        for json in [
            "0",
            "\"00\"",
            "\"01\"",
            "\" 1\"",
            "\"+1\"",
            "\"1.0\"",
            "\"18446744073709551616\"",
        ] {
            assert!(
                serde_json::from_str::<Revision>(json).is_err(),
                "accepted {json}"
            );
        }
        assert_eq!(
            serde_json::to_string(&MoneyKrw::new(0).unwrap()).unwrap(),
            "\"0\""
        );
    }

    #[test]
    fn signed_position_is_the_only_negative_input() {
        assert_eq!(parse_position("-20000"), Ok(Some(PositionMm(-20_000))));
        assert_eq!(parse_position("-0"), Ok(Some(PositionMm(0))));
        assert_eq!(parse_position(" 42 "), Ok(Some(PositionMm(42))));
        for text in ["-20001", "20001", "+1", "- 1", "1.5", "--1", "-", ""] {
            if text.is_empty() {
                assert_eq!(parse_position(text), Ok(None));
            } else {
                assert!(parse_position(text).is_err(), "accepted {text}");
            }
        }
    }

    #[test]
    fn id_and_digest_are_validated_strings() {
        assert!(Id::new("syn:trace:bin").is_ok());
        for id in ["", &"a".repeat(97), "has space", "한글", "a/b", "a.b"] {
            assert!(Id::new(id).is_err(), "accepted {id}");
        }
        let hex = "a".repeat(64);
        assert!(Digest::new(&hex).is_ok());
        assert_eq!(Digest::from_sha256([0; 32]).as_str(), &"0".repeat(64));
        for bad in ["", "abcd", &"a".repeat(65), &"A".repeat(64)] {
            assert!(Digest::new(bad).is_err(), "accepted {bad}");
        }
        assert!(serde_json::from_str::<Id>("\"bad id\"").is_err());
        assert!(serde_json::from_str::<Digest>("\"zz\"").is_err());
    }

    #[test]
    fn money_mass_and_work_count_bounds() {
        assert_eq!(
            parse_money_krw("18446744073709551615"),
            Ok(Some(MoneyKrw::new(u64::MAX).unwrap()))
        );
        assert!(parse_money_krw("18446744073709551616").is_err());
        assert_eq!(parse_money_krw(""), Ok(None));
        assert_eq!(parse_mass_grams("0"), Ok(Some(MassGrams(0))));
        assert!(parse_mass_grams("1000001").is_err());
        assert_eq!(
            parse_work_count("250000"),
            Ok(Some(WorkCount::new(250_000).unwrap()))
        );
    }

    proptest! {
        #[test]
        fn millimeter_and_centimeter_format_roundtrip(value in 1_u32..=10_000) {
            let length = LengthMm::new(value).unwrap();
            for unit in [Unit::Mm, Unit::Cm] {
                prop_assert_eq!(parse_length(&format_length(length, unit), unit), Ok(Some(length)));
            }
        }

        #[test]
        fn revision_serialization_preserves_every_u64(value in any::<u64>()) {
            let revision = Revision::new(value).unwrap();
            let encoded = serde_json::to_string(&revision).unwrap();
            prop_assert_eq!(serde_json::from_str::<Revision>(&encoded).unwrap(), revision);
        }

        #[test]
        fn fractional_nonzero_hundredths_are_rejected(whole in 0_u32..=1000, tenth in 0_u32..=9, hundredth in 1_u32..=9) {
            let text = format!("{whole}.{tenth}{hundredth}");
            prop_assert!(parse_length(&text, Unit::Cm).is_err());
        }
    }
}
