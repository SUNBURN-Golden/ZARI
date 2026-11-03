//! Nominal, fixed-orientation size check for the beginner journey.
//! Reuses the bootstrap engine per axis; opening/access remain explicitly unknown.
use crate::{facts::*, probe::*, scalars::*};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EasyFitInput {
    pub item: [String; 3],
    pub space: [String; 3],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum EasyFitStatus {
    Fits,
    Tight,
    DoesNotFit,
    Unknown,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EasyFitAxis {
    pub label: String,
    pub item_mm: Option<u32>,
    pub space_mm: Option<u32>,
    pub difference_cm: Option<String>,
    pub message: String,
    pub needs_confirmation: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EasyFitResult {
    pub status: EasyFitStatus,
    pub axes: [EasyFitAxis; 3],
    pub opening_check: String,
    pub access_check: String,
}

pub fn evaluate_easy_fit(input: &EasyFitInput) -> EasyFitResult {
    let mut failed = false;
    let mut unknown = false;
    let mut tight = false;
    let axes = std::array::from_fn(|index| {
        let label = ["가로", "세로", "높이"][index];
        let raw = |text: &str| RawMeasurementDto {
            text: text.into(),
            unit: Unit::Cm,
            uncertainty: RawUncertaintyDto::Unknown {},
            origin: MeasurementOrigin::UserDeclared,
            evidence_ids: vec![],
        };
        let zero = Fact::Known {
            value: ClearanceMm::new(0).expect("zero clearance"),
            provenance: Provenance {
                origin: MeasurementOrigin::Synthetic,
                verification: VerificationStatus::Unverified,
                evidence_ids: vec![],
                rule_ids: vec![],
                input_refs: vec![],
                observed_at: None,
            },
        };
        let checked = evaluate_probe(&BootstrapProbeDto {
            compartment_width: raw(&input.space[index]),
            unit_width: raw(&input.item[index]),
            unit_count: RawCountDto { text: "1".into() },
            left_gap_mm: zero.clone(),
            right_gap_mm: zero.clone(),
            between_gap_mm: zero,
            needed_new_units: RawCountDto { text: "0".into() },
            pack_quantity: RawCountDto { text: "1".into() },
        });
        let item = checked
            .normalized_unit_width
            .value()
            .map(|m| m.nominal.get());
        let space = checked
            .normalized_compartment_width
            .value()
            .map(|m| m.nominal.get());
        let mut difference_cm = None;
        let message = if let (Some(item), Some(space)) = (item, space) {
            let delta = i64::from(space) - i64::from(item);
            failed |= checked.width_check.status == crate::plan::CheckStatus::Fail;
            tight |= (0..=20).contains(&delta);
            let absolute = delta.unsigned_abs();
            let cm = if absolute % 10 == 0 {
                (absolute / 10).to_string()
            } else {
                format!("{}.{}", absolute / 10, absolute % 10)
            };
            difference_cm = Some(cm.clone());
            if delta < 0 {
                format!("{label} {cm}cm 모자라요")
            } else {
                format!("{label}로 {cm}cm 남아요")
            }
        } else {
            unknown = true;
            format!("{label} 길이를 다시 적어 주세요.")
        };
        // A presentation hint only. Parsing and validity remain the engine's.
        let needs_confirmation = [&input.item[index], &input.space[index]]
            .iter()
            .any(|text| {
                text.trim()
                    .parse::<f64>()
                    .is_ok_and(|n| n > 0.0 && !(10.0..1000.0).contains(&n))
            });
        EasyFitAxis {
            label: label.into(),
            item_mm: item,
            space_mm: space,
            difference_cm,
            message,
            needs_confirmation,
        }
    });
    EasyFitResult {
        status: if unknown {
            EasyFitStatus::Unknown
        } else if failed {
            EasyFitStatus::DoesNotFit
        } else if tight {
            EasyFitStatus::Tight
        } else {
            EasyFitStatus::Fits
        },
        axes,
        opening_check: "unknown".into(),
        access_check: "unknown".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nominal_boundaries_and_unknown_are_preserved() {
        let mut input = EasyFitInput {
            item: ["30".into(), "20".into(), "40".into()],
            space: ["33".into(), "23".into(), "43".into()],
        };
        let result = evaluate_easy_fit(&input);
        assert_eq!(result.status, EasyFitStatus::Fits);
        assert_eq!(result.axes[0].message, "가로로 3cm 남아요");
        input.space[0] = "32".into();
        assert_eq!(evaluate_easy_fit(&input).status, EasyFitStatus::Tight);
        input.space[0] = "30".into();
        assert_eq!(evaluate_easy_fit(&input).status, EasyFitStatus::Tight);
        input.space[0] = "27".into();
        let result = evaluate_easy_fit(&input);
        assert_eq!(result.status, EasyFitStatus::DoesNotFit);
        assert_eq!(result.axes[0].message, "가로 3cm 모자라요");
        input.space[1] = "".into();
        let result = evaluate_easy_fit(&input);
        assert_eq!(result.status, EasyFitStatus::Unknown);
        assert_eq!(result.axes[1].message, "세로 길이를 다시 적어 주세요.");
        input.space[1] = "2000".into();
        let result = evaluate_easy_fit(&input);
        assert_eq!(result.status, EasyFitStatus::Unknown);
        assert!(result.axes[1].needs_confirmation);
        input.space[1] = "20.01".into();
        assert_eq!(evaluate_easy_fit(&input).status, EasyFitStatus::Unknown);
    }
}
