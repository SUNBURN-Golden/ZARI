//! Frozen measurement-completion read model for SP-010.
//!
//! These types and the priority table are the SP-008 ADR contract. They are
//! not a `DomainOperation`, not a capability, and not part of the generated
//! runtime schema. SP-010 is the first node that may export and handle
//! `queryNextFacts`.

use crate::plan::{CheckKind, CheckStatus};

/// Wire name reserved for the future completion query. Not registered.
pub const COMPLETION_QUERY_OPERATION: &str = "queryNextFacts";
/// Capability name reserved for that operation. Not advertised.
pub const COMPLETION_QUERY_CAPABILITY: &str = "queryNextFacts";
/// Whole-result failure when the query would exceed its caps. Not emitted yet.
pub const COMPLETION_LIMIT_CODE: &str = "completion_limit_exceeded";
pub const COMPLETION_MAX_FACT_ROWS: usize = 512;
pub const COMPLETION_MAX_CHECK_REFS: usize = 2048;
pub const COMPLETION_MAX_BYTES: usize = 5 * 1024 * 1024;

/// Stable sort rank. Lower is earlier. Not a fitness score.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum CompletionPriority {
    RepairKnownFailure = 0,
    RequiredPhysicalUnknown = 1,
    QuantityCompleteness = 2,
    ProcurementUnknown = 3,
    SoftOrUnsupported = 4,
}

/// Fact-shaped need. Nominal versus bound versus evidence is filled by the
/// SP-010 fact inspection. This node only emits the two needs that are
/// already decided by a structured check, and leaves the rest unset.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompletionNeed {
    MissingNominal,
    MissingBound,
    MissingEvidence,
    ConflictingEvidence,
    UnsupportedInput,
    RepairKnownFailure,
}

/// Identity of a future completion reply. SP-010 compares it to the caller's
/// lease. A mismatch discards the reply.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompletionSourceStamp {
    pub input_digest: String,
    pub plan_snapshot_id: Option<String>,
    pub catalog_digest: Option<String>,
    pub rule_version: String,
    pub canonical_version: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CheckCompletionClass {
    pub priority: CompletionPriority,
    pub need: Option<CompletionNeed>,
}

/// Physical for the completion priority map. Quantity and commercial kinds
/// have their own ranks, so they are excluded here. This is not
/// `validator::physical_kind`.
fn physical_kind(kind: &CheckKind) -> bool {
    !matches!(
        kind,
        CheckKind::Inventory
            | CheckKind::Price
            | CheckKind::Shipping
            | CheckKind::Budget
            | CheckKind::QuantityConservation
            | CheckKind::Compatibility
    )
}

fn quantity_kind(kind: &CheckKind) -> bool {
    matches!(
        kind,
        CheckKind::QuantityConservation | CheckKind::Compatibility
    )
}

fn commercial_kind(kind: &CheckKind) -> bool {
    matches!(
        kind,
        CheckKind::Inventory | CheckKind::Price | CheckKind::Shipping
    )
}

/// Classify one current check. `reason_code` is compared exactly.
/// `conflicting_sources` is the only conflict signal. Note text is not an input.
/// `None` means the check does not create a next-fact row.
pub fn classify_check(
    kind: CheckKind,
    status: CheckStatus,
    reason_code: &str,
    blocking: bool,
) -> Option<CheckCompletionClass> {
    if matches!(status, CheckStatus::Pass | CheckStatus::NotApplicable) {
        return None;
    }
    if reason_code == "conflicting_sources" {
        return Some(CheckCompletionClass {
            priority: CompletionPriority::RepairKnownFailure,
            need: Some(CompletionNeed::ConflictingEvidence),
        });
    }
    let hard_fail = status == CheckStatus::Fail
        && blocking
        && (physical_kind(&kind) || quantity_kind(&kind) || kind == CheckKind::Budget);
    let priority = if hard_fail {
        CompletionPriority::RepairKnownFailure
    } else if status == CheckStatus::Fail && !blocking {
        CompletionPriority::SoftOrUnsupported
    } else if status == CheckStatus::Unknown && physical_kind(&kind) {
        CompletionPriority::RequiredPhysicalUnknown
    } else if status == CheckStatus::Unknown && quantity_kind(&kind) {
        CompletionPriority::QuantityCompleteness
    } else if commercial_kind(&kind)
        || (kind == CheckKind::Budget && status == CheckStatus::Unknown)
    {
        CompletionPriority::ProcurementUnknown
    } else {
        CompletionPriority::SoftOrUnsupported
    };
    let need = match priority {
        CompletionPriority::RepairKnownFailure => Some(CompletionNeed::RepairKnownFailure),
        CompletionPriority::SoftOrUnsupported if reason_code.starts_with("unsupported_") => {
            Some(CompletionNeed::UnsupportedInput)
        }
        _ => None,
    };
    Some(CheckCompletionClass { priority, need })
}

/// Canonical fact key. The field path must already be a routed measurement
/// path. The key is bounded text, not an `Id` (those stop at 96 bytes).
pub fn completion_fact_key(entity_id: &str, field_path: &str) -> Result<String, &'static str> {
    if entity_id.is_empty()
        || field_path.is_empty()
        || entity_id.len() > 96
        || field_path.len() > 256
        || entity_id.len() + 1 + field_path.len() > 320
    {
        return Err("input_limit_exceeded");
    }
    if field_path.split('.').any(|segment| segment.is_empty()) {
        return Err("invalid_field_path");
    }
    Ok(format!("{entity_id}:{field_path}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_order_is_repair_then_physical_then_quantity_then_procurement() {
        let ranks = [
            classify_check(
                CheckKind::OuterGeometry,
                CheckStatus::Fail,
                "obstacle_collision",
                true,
            ),
            classify_check(
                CheckKind::InnerCapacity,
                CheckStatus::Unknown,
                "fact_unknown",
                true,
            ),
            classify_check(
                CheckKind::QuantityConservation,
                CheckStatus::Unknown,
                "fact_unknown",
                true,
            ),
            classify_check(
                CheckKind::Price,
                CheckStatus::Unknown,
                "fact_unknown",
                false,
            ),
            classify_check(CheckKind::Budget, CheckStatus::Fail, "over_soft", false),
        ];
        let priorities: Vec<_> = ranks.iter().map(|item| item.unwrap().priority).collect();
        assert_eq!(
            priorities,
            vec![
                CompletionPriority::RepairKnownFailure,
                CompletionPriority::RequiredPhysicalUnknown,
                CompletionPriority::QuantityCompleteness,
                CompletionPriority::ProcurementUnknown,
                CompletionPriority::SoftOrUnsupported,
            ]
        );
        assert!(priorities.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn conflict_comes_only_from_the_structured_reason() {
        let conflict = classify_check(
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "conflicting_sources",
            true,
        )
        .unwrap();
        assert_eq!(conflict.need, Some(CompletionNeed::ConflictingEvidence));
        assert_eq!(conflict.priority, CompletionPriority::RepairKnownFailure);
        let noted = classify_check(
            CheckKind::OuterGeometry,
            CheckStatus::Unknown,
            "note says conflicting_sources and 5 mm",
            true,
        )
        .unwrap();
        assert_eq!(noted.need, None);
        assert_eq!(noted.priority, CompletionPriority::RequiredPhysicalUnknown);
    }

    #[test]
    fn unknown_physical_checks_do_not_invent_a_nominal_or_bound_need() {
        let class = classify_check(
            CheckKind::SupportGeometry,
            CheckStatus::Unknown,
            "fact_unknown",
            true,
        )
        .unwrap();
        assert_eq!(class.need, None);
        assert_eq!(
            classify_check(CheckKind::OuterGeometry, CheckStatus::Pass, "ok", true),
            None
        );
    }

    #[test]
    fn hard_budget_fail_is_repair_and_soft_budget_fail_is_not() {
        assert_eq!(
            classify_check(CheckKind::Budget, CheckStatus::Fail, "over_hard", true)
                .unwrap()
                .priority,
            CompletionPriority::RepairKnownFailure
        );
        assert_eq!(
            classify_check(CheckKind::Budget, CheckStatus::Fail, "over_soft", false)
                .unwrap()
                .priority,
            CompletionPriority::SoftOrUnsupported
        );
        assert_eq!(
            classify_check(
                CheckKind::InstallationPath,
                CheckStatus::Fail,
                "unsupported_vertical_motion",
                false
            )
            .unwrap()
            .need,
            Some(CompletionNeed::UnsupportedInput)
        );
    }

    #[test]
    fn fact_key_is_bounded_and_does_not_parse_a_note() {
        assert_eq!(
            completion_fact_key("space-1", "space.opening.left").unwrap(),
            "space-1:space.opening.left"
        );
        assert!(completion_fact_key("", "space.opening.left").is_err());
        assert!(completion_fact_key("space-1", &"a".repeat(257)).is_err());
    }
}
