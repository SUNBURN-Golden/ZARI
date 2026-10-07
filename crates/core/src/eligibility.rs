//! Ephemeral action-eligibility read (SP-013). It does not search, store,
//! promote facts, or change the snapshot. A checkbox result is not an input.

use crate::canonical::{self, RULE_VERSION};
use crate::finalize::{resolve_step_id, transfer_step_id};
use crate::plan::*;
use crate::protocol::BUILD_ID;
use crate::scalars::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const PROGRESS_ROW_CAP: usize = 4096;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ProgressMark {
    Done,
    Todo,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionProgressInput {
    pub step_id: Id,
    pub status: ProgressMark,
}

/// Caller-observed stamp. Rust echoes the snapshot's own versions and the
/// progress identity it computed. A mismatch is not eligible.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionEligibilityStamp {
    pub project_id: Id,
    pub input_digest: Digest,
    pub plan_snapshot_id: Digest,
    pub catalog_digest: Digest,
    pub catalog_version: String,
    pub rule_version: String,
    pub solver_version: String,
    pub schema_version: u32,
    pub canonical_version: u32,
    pub build_id: String,
    pub search_profile_id: String,
    pub search_profile_version: u32,
    pub accepted_input_revision: Revision,
    pub project_revision: Revision,
    pub editor_epoch: Revision,
    pub progress_identity: String,
    pub source_dirty: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum InstanceRef {
    DirectItem {
        item_id: Id,
        unit_ordinal: u32,
        placement_id: Id,
    },
    ContainedItem {
        item_id: Id,
        unit_ordinal: u32,
        container_placement_id: Id,
    },
    OwnedContainer {
        owned_id: Id,
        unit_ordinal: u32,
        placement_id: Id,
    },
    NewContainer {
        variant_id: Id,
        unit_ordinal: u32,
        placement_id: Id,
    },
    Unassigned {
        item_id: Id,
        instances: UnassignedInstances,
    },
    Space {
        space_id: Id,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionEligibilityRow {
    pub action_id: Id,
    pub instance_refs: Vec<InstanceRef>,
    pub blocker_check_ids: Vec<Id>,
    /// True when the step records a user assertion. It does not confirm a fact.
    pub user_assertion: bool,
    pub executable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionEligibilityReply {
    pub eligible: bool,
    #[serde(deserialize_with = "crate::required_option")]
    #[schemars(with = "crate::RequiredNullable<String>")]
    pub stale_reason: Option<String>,
    pub stamp: ActionEligibilityStamp,
    pub rows: Vec<ActionEligibilityRow>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EligibilityError {
    ProgressLimit,
    InvalidProgress,
}

/// Identity of the supplied rows. Order does not matter. Null progress has
/// no identity and is not eligible.
pub fn progress_identity(rows: &[ActionProgressInput]) -> String {
    let mut lines: Vec<String> = rows
        .iter()
        .map(|row| {
            let status = match row.status {
                ProgressMark::Done => "done",
                ProgressMark::Todo => "todo",
            };
            format!("{}={status}", row.step_id.as_str())
        })
        .collect();
    lines.sort();
    lines.join("\n")
}

fn observed_stamp(
    snapshot: &PlanSnapshot,
    claimed: &ActionEligibilityStamp,
    identity: &str,
) -> ActionEligibilityStamp {
    let versions = &snapshot.content.versions;
    ActionEligibilityStamp {
        project_id: claimed.project_id.clone(),
        input_digest: versions.input_digest.clone(),
        plan_snapshot_id: snapshot.plan_snapshot_id.clone(),
        catalog_digest: versions.catalog_digest.clone(),
        catalog_version: versions.catalog_version.clone(),
        rule_version: versions.rule_version.clone(),
        solver_version: versions.solver_version.clone(),
        schema_version: versions.schema_version,
        canonical_version: versions.canonical_version,
        build_id: BUILD_ID.to_owned(),
        search_profile_id: versions.search_profile.id.clone(),
        search_profile_version: versions.search_profile.version,
        accepted_input_revision: claimed.accepted_input_revision,
        project_revision: claimed.project_revision,
        editor_epoch: claimed.editor_epoch,
        progress_identity: identity.to_owned(),
        source_dirty: claimed.source_dirty,
    }
}

fn stamp_matches(
    snapshot: &PlanSnapshot,
    claimed: &ActionEligibilityStamp,
    identity: &str,
) -> bool {
    let versions = &snapshot.content.versions;
    claimed.input_digest == versions.input_digest
        && claimed.plan_snapshot_id == snapshot.plan_snapshot_id
        && claimed.catalog_digest == versions.catalog_digest
        && claimed.catalog_version == versions.catalog_version
        && claimed.rule_version == versions.rule_version
        && claimed.solver_version == versions.solver_version
        && claimed.schema_version == versions.schema_version
        && claimed.canonical_version == versions.canonical_version
        && claimed.build_id == BUILD_ID
        && claimed.search_profile_id == versions.search_profile.id
        && claimed.search_profile_version == versions.search_profile.version
        && claimed.progress_identity == identity
        && canonical::snapshot_digest(&snapshot.content) == snapshot.plan_snapshot_id
}

fn user_assertion(kind: &ActionKind) -> bool {
    matches!(
        kind,
        ActionKind::ClearSpace
            | ActionKind::Acquire
            | ActionKind::ConfirmArrival
            | ActionKind::TransferContents
            | ActionKind::Install
            | ActionKind::VerifyUnassigned
            | ActionKind::ResolveCondition
            | ActionKind::SortContents
            | ActionKind::Label
    )
}

/// Unknown checks block acquire, loading, and install. Clear, arrival,
/// resolve, and unassigned review stay user assertions: marking them does
/// not clear the check.
fn reasons_block(kind: &ActionKind) -> bool {
    matches!(
        kind,
        ActionKind::Acquire | ActionKind::TransferContents | ActionKind::Install
    )
}

fn placement_ref(placement: &Placement) -> InstanceRef {
    match &placement.subject {
        PlacementSubject::DirectItem {
            item_id,
            unit_ordinal,
        } => InstanceRef::DirectItem {
            item_id: item_id.clone(),
            unit_ordinal: *unit_ordinal,
            placement_id: placement.id.clone(),
        },
        PlacementSubject::OwnedContainer {
            owned_id,
            unit_ordinal,
        } => InstanceRef::OwnedContainer {
            owned_id: owned_id.clone(),
            unit_ordinal: *unit_ordinal,
            placement_id: placement.id.clone(),
        },
        PlacementSubject::NewContainer {
            variant_id,
            unit_ordinal,
        } => InstanceRef::NewContainer {
            variant_id: variant_id.clone(),
            unit_ordinal: *unit_ordinal,
            placement_id: placement.id.clone(),
        },
    }
}

fn instance_refs(content: &SnapshotContent, action: &ActionStep) -> Vec<InstanceRef> {
    let placements: BTreeMap<&str, &Placement> = content
        .placements
        .iter()
        .map(|placement| (placement.id.as_str(), placement))
        .collect();
    match action.kind {
        ActionKind::ClearSpace => action
            .subject_ids
            .iter()
            .map(|space_id| InstanceRef::Space {
                space_id: space_id.clone(),
            })
            .collect(),
        ActionKind::Install => action
            .subject_ids
            .iter()
            .filter_map(|id| {
                placements
                    .get(id.as_str())
                    .map(|placement| placement_ref(placement))
            })
            .collect(),
        ActionKind::TransferContents => content
            .assignments
            .iter()
            .find(|assignment| {
                transfer_step_id(&assignment.item_id, assignment.unit_ordinal) == action.id
                    && matches!(assignment.location, ItemLocation::Contained { .. })
            })
            .and_then(|assignment| {
                let ItemLocation::Contained {
                    container_placement_id,
                    ..
                } = &assignment.location
                else {
                    return None;
                };
                if !action.subject_ids.contains(&assignment.item_id)
                    || !action.subject_ids.contains(container_placement_id)
                {
                    return None;
                }
                Some(vec![InstanceRef::ContainedItem {
                    item_id: assignment.item_id.clone(),
                    unit_ordinal: assignment.unit_ordinal,
                    container_placement_id: container_placement_id.clone(),
                }])
            })
            .unwrap_or_default(),
        ActionKind::ResolveCondition => {
            if let Some(assignment) = content.assignments.iter().find(|assignment| {
                resolve_step_id(&assignment.item_id, assignment.unit_ordinal) == action.id
            }) && let ItemLocation::ProvisionalContainer {
                container_placement_id,
                ..
            } = &assignment.location
                && action.subject_ids.contains(&assignment.item_id)
                && action.subject_ids.contains(container_placement_id)
            {
                vec![InstanceRef::ContainedItem {
                    item_id: assignment.item_id.clone(),
                    unit_ordinal: assignment.unit_ordinal,
                    container_placement_id: container_placement_id.clone(),
                }]
            } else {
                action
                    .subject_ids
                    .iter()
                    .filter_map(|id| placements.get(id.as_str()).copied())
                    .map(placement_ref)
                    .collect()
            }
        }
        ActionKind::Acquire | ActionKind::ConfirmArrival => action
            .subject_ids
            .iter()
            .filter_map(|id| placements.get(id.as_str()).copied())
            .filter(|placement| matches!(placement.subject, PlacementSubject::NewContainer { .. }))
            .map(placement_ref)
            .collect(),
        ActionKind::VerifyUnassigned => content
            .unassigned
            .iter()
            .filter(|entry| action.subject_ids.contains(&entry.item_id))
            .map(|entry| InstanceRef::Unassigned {
                item_id: entry.item_id.clone(),
                instances: entry.instances.clone(),
            })
            .collect(),
        ActionKind::SortContents | ActionKind::Label => vec![],
    }
}

pub fn query_action_eligibility(
    snapshot: &PlanSnapshot,
    progress: Option<&[ActionProgressInput]>,
    claimed: &ActionEligibilityStamp,
) -> Result<ActionEligibilityReply, EligibilityError> {
    let Some(progress) = progress else {
        let stamp = observed_stamp(snapshot, claimed, "");
        return Ok(refused(snapshot, stamp, "null_progress"));
    };
    if progress.len() > PROGRESS_ROW_CAP {
        return Err(EligibilityError::ProgressLimit);
    }
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for row in progress {
        if !seen.insert(row.step_id.as_str()) {
            return Err(EligibilityError::InvalidProgress);
        }
    }
    let identity = progress_identity(progress);
    let stamp = observed_stamp(snapshot, claimed, &identity);
    let historical = snapshot.content.versions.rule_version != RULE_VERSION;
    let dirty = claimed.source_dirty;
    let matched = stamp_matches(snapshot, claimed, &identity);
    let (eligible, reason) = if historical {
        (false, Some("historical_rule".to_owned()))
    } else if dirty {
        (false, Some("dirty_source".to_owned()))
    } else if !matched {
        (false, Some("stamp_mismatch".to_owned()))
    } else {
        (true, None)
    };
    let done: BTreeSet<&str> = progress
        .iter()
        .filter(|row| row.status == ProgressMark::Done)
        .map(|row| row.step_id.as_str())
        .collect();
    let checks: BTreeMap<&str, &ConstraintCheck> = snapshot
        .content
        .validation
        .checks
        .iter()
        .map(|check| (check.id.as_str(), check))
        .collect();
    let rows = snapshot
        .content
        .actions
        .iter()
        .map(|action| {
            let blockers: Vec<Id> = if reasons_block(&action.kind) {
                action
                    .reason_ids
                    .iter()
                    .filter(|id| {
                        checks.get(id.as_str()).is_some_and(|check| {
                            check.status == CheckStatus::Unknown
                                || (check.status == CheckStatus::Fail && check.blocking)
                                || check.reason_code.contains("unsupported")
                        })
                    })
                    .cloned()
                    .collect()
            } else {
                vec![]
            };
            let prerequisites_done = action
                .prerequisite_step_ids
                .iter()
                .all(|id| done.contains(id.as_str()));
            let refs = instance_refs(&snapshot.content, action);
            let executable = eligible
                && prerequisites_done
                && blockers.is_empty()
                && !refs.is_empty()
                && action.required_confirmations.is_empty();
            ActionEligibilityRow {
                action_id: action.id.clone(),
                instance_refs: refs,
                blocker_check_ids: blockers,
                user_assertion: user_assertion(&action.kind),
                executable,
            }
        })
        .collect();
    Ok(ActionEligibilityReply {
        eligible,
        stale_reason: reason,
        stamp,
        rows,
    })
}

fn refused(
    snapshot: &PlanSnapshot,
    stamp: ActionEligibilityStamp,
    reason: &str,
) -> ActionEligibilityReply {
    let rows = snapshot
        .content
        .actions
        .iter()
        .map(|action| ActionEligibilityRow {
            action_id: action.id.clone(),
            instance_refs: instance_refs(&snapshot.content, action),
            blocker_check_ids: vec![],
            user_assertion: user_assertion(&action.kind),
            executable: false,
        })
        .collect();
    ActionEligibilityReply {
        eligible: false,
        stale_reason: Some(reason.to_owned()),
        stamp,
        rows,
    }
}
