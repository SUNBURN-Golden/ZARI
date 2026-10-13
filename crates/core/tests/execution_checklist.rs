//! z-execution-checklist invalidation fixture (SP-013/SP-015).
//!
//! One executable checklist plan plus the progress states the session can
//! meet after interruption, resume, and plan change. Rust stays the
//! authority: a done mark is a user assertion and never becomes a passed
//! check, a step with remaining blockers is not executable, and progress
//! bound to an older snapshot does not become eligible on a new one.
//! Shared fixture files are untouched.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use zari_core::scalars::*;
use zari_core::*;

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn id(raw: &str) -> Id {
    Id::new(raw).unwrap()
}

fn stamp_for(snapshot: &PlanSnapshot, identity: &str, dirty: bool) -> ActionEligibilityStamp {
    let versions = &snapshot.content.versions;
    ActionEligibilityStamp {
        project_id: id("project-1"),
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
        accepted_input_revision: Revision::new(1).unwrap(),
        project_revision: Revision::new(2).unwrap(),
        editor_epoch: Revision::new(3).unwrap(),
        progress_identity: identity.into(),
        source_dirty: dirty,
    }
}

fn historical_snapshot() -> PlanSnapshot {
    let record =
        fs::read_to_string(root().join("fixtures/domain/record-snapshot-verified.json")).unwrap();
    let value: Value = serde_json::from_str(&record).unwrap();
    serde_json::from_value(value["input"]["snapshot"].clone()).unwrap()
}

fn step(
    raw: &str,
    kind: ActionKind,
    subjects: &[&str],
    prerequisites: &[&str],
    reasons: &[&str],
) -> ActionStep {
    ActionStep {
        id: id(raw),
        kind,
        subject_ids: subjects.iter().copied().map(id).collect(),
        prerequisite_step_ids: prerequisites.iter().copied().map(id).collect(),
        required_confirmations: vec![],
        reason_ids: reasons.iter().copied().map(id).collect(),
    }
}

fn unknown_blocking_check(raw: &str, subject: &str) -> ConstraintCheck {
    ConstraintCheck {
        id: id(raw),
        kind: CheckKind::InstallationPath,
        subject_ids: vec![id(subject)],
        status: CheckStatus::Unknown,
        reason_code: "staging_unknown".into(),
        basis: CheckBasis::Conservative,
        evidence_refs: vec![],
        measurements: vec![],
        blocking: true,
        remediation: vec![],
    }
}

/// The checklist plan this node's UI renders: a clear step, a risky install
/// gated by both a prerequisite and an unknown check, and two unassigned
/// reviews. Built on the preserved v1 record snapshot re-pinned to the
/// current rule; only actions/checks/ruleVersion change.
fn checklist_snapshot() -> PlanSnapshot {
    let mut snapshot = historical_snapshot();
    snapshot.content.versions.rule_version = RULE_VERSION.to_owned();
    snapshot
        .content
        .validation
        .checks
        .push(unknown_blocking_check("chk:ip:place-1:c", "place-1"));
    snapshot.content.actions = vec![
        step(
            "act:clear:space-1",
            ActionKind::ClearSpace,
            &["space-1"],
            &[],
            &[],
        ),
        step(
            "act:install:place-1",
            ActionKind::Install,
            &["place-1"],
            &["act:clear:space-1"],
            &["chk:ip:place-1:c"],
        ),
        step(
            "act:verify:item-a",
            ActionKind::VerifyUnassigned,
            &["item-a"],
            &[],
            &[],
        ),
        step(
            "act:verify:item-b",
            ActionKind::VerifyUnassigned,
            &["item-b"],
            &[],
            &[],
        ),
    ];
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    assert!(
        validate::validate_snapshot(&snapshot).is_empty(),
        "checklist fixture must stay structurally valid"
    );
    snapshot
}

fn row<'a>(reply: &'a ActionEligibilityReply, action_id: &str) -> &'a ActionEligibilityRow {
    reply
        .rows
        .iter()
        .find(|item| item.action_id.as_str() == action_id)
        .unwrap_or_else(|| panic!("missing eligibility row {action_id}"))
}

fn done(step_id: &str) -> ActionProgressInput {
    ActionProgressInput {
        step_id: id(step_id),
        status: ProgressMark::Done,
    }
}

fn todo(step_id: &str) -> ActionProgressInput {
    ActionProgressInput {
        step_id: id(step_id),
        status: ProgressMark::Todo,
    }
}

/// Resume after interruption: stored rows reload, the finished prerequisite
/// frees nothing extra, and the risky step stays blocked.
#[test]
fn resume_after_interruption_restores_only_recorded_progress() {
    let snapshot = checklist_snapshot();
    let progress = vec![
        done("act:clear:space-1"),
        todo("act:install:place-1"),
        todo("act:verify:item-a"),
        done("act:verify:item-b"),
    ];
    let identity = progress_identity(&progress);
    let reply = query_action_eligibility(
        &snapshot,
        Some(&progress),
        &stamp_for(&snapshot, &identity, false),
    )
    .unwrap();
    assert!(reply.eligible);
    let install = row(&reply, "act:install:place-1");
    assert!(!install.executable);
    assert_eq!(install.blocker_check_ids[0].as_str(), "chk:ip:place-1:c");
    // Preparations are still reported for a blocked step.
    assert!(matches!(
        install.instance_refs[0],
        InstanceRef::DirectItem { .. }
    ));
    assert!(row(&reply, "act:verify:item-a").executable);
    assert!(row(&reply, "act:verify:item-b").executable);
    assert!(matches!(
        row(&reply, "act:verify:item-a").instance_refs[0],
        InstanceRef::Unassigned { .. }
    ));
    assert!(matches!(
        row(&reply, "act:clear:space-1").instance_refs[0],
        InstanceRef::Space { .. }
    ));
}

/// Acceptance 1: a done mark is a user assertion. Completing steps does not
/// turn the unknown check into pass and does not free the risky step.
#[test]
fn completed_steps_do_not_clear_unknown_conditions() {
    let mut snapshot = checklist_snapshot();
    let checks_before = snapshot.content.validation.checks.clone();
    let progress = vec![
        done("act:clear:space-1"),
        done("act:verify:item-a"),
        done("act:verify:item-b"),
    ];
    let identity = progress_identity(&progress);
    let reply = query_action_eligibility(
        &snapshot,
        Some(&progress),
        &stamp_for(&snapshot, &identity, false),
    )
    .unwrap();
    assert!(reply.eligible);
    let install = row(&reply, "act:install:place-1");
    assert!(!install.executable);
    assert!(!install.blocker_check_ids.is_empty());
    let unknown = snapshot
        .content
        .validation
        .checks
        .iter()
        .find(|check| check.id.as_str() == "chk:ip:place-1:c")
        .unwrap();
    assert_eq!(unknown.status, CheckStatus::Unknown);
    assert_eq!(snapshot.content.validation.checks, checks_before);
    // Even marking the risky step done leaves the physical check unknown and
    // the snapshot untouched — progress is never an input.
    snapshot.content.actions[1].prerequisite_step_ids.clear();
    snapshot.plan_snapshot_id = canonical::snapshot_digest(&snapshot.content);
    let mut all_done = progress.clone();
    all_done.push(done("act:install:place-1"));
    let all_identity = progress_identity(&all_done);
    let finished = query_action_eligibility(
        &snapshot,
        Some(&all_done),
        &stamp_for(&snapshot, &all_identity, false),
    )
    .unwrap();
    assert_eq!(
        snapshot
            .content
            .validation
            .checks
            .iter()
            .find(|check| check.id.as_str() == "chk:ip:place-1:c")
            .unwrap()
            .status,
        CheckStatus::Unknown
    );
    assert!(!row(&finished, "act:install:place-1").executable);
    assert_eq!(snapshot.content.validation.checks, checks_before);
}

/// Acceptance 2: prerequisite done but a blocker remains — the risky step is
/// not executable in either the empty or the resumed progress state.
#[test]
fn risky_step_stays_blocked_until_conditions_clear() {
    let snapshot = checklist_snapshot();
    let empty: Vec<ActionProgressInput> = vec![];
    let identity = progress_identity(&empty);
    let fresh = query_action_eligibility(
        &snapshot,
        Some(&empty),
        &stamp_for(&snapshot, &identity, false),
    )
    .unwrap();
    assert!(fresh.eligible);
    assert!(!row(&fresh, "act:install:place-1").executable);
    // A user-assertion step with no blockers can run first.
    assert!(row(&fresh, "act:clear:space-1").executable);
    assert!(row(&fresh, "act:verify:item-a").executable);

    let progress = vec![done("act:clear:space-1")];
    let resumed_identity = progress_identity(&progress);
    let resumed = query_action_eligibility(
        &snapshot,
        Some(&progress),
        &stamp_for(&snapshot, &resumed_identity, false),
    )
    .unwrap();
    let install = row(&resumed, "act:install:place-1");
    assert!(!install.executable);
    assert_eq!(install.blocker_check_ids[0].as_str(), "chk:ip:place-1:c");
}

/// Interruption mid-flight: a missing progress read is not an all-todo map.
#[test]
fn unreadable_progress_is_not_a_todo_list() {
    let snapshot = checklist_snapshot();
    let reply =
        query_action_eligibility(&snapshot, None, &stamp_for(&snapshot, "", false)).unwrap();
    assert!(!reply.eligible);
    assert_eq!(reply.stale_reason.as_deref(), Some("null_progress"));
    assert!(reply.rows.iter().all(|row| !row.executable));
    // Unread progress still returns the rows' preparation data for display.
    assert!(reply.rows.iter().all(|row| !row.instance_refs.is_empty()));
}

/// Acceptance 3: a new snapshot cannot inherit the old plan's progress —
/// the caller's stamp names the old snapshot, or the input changed, or the
/// source is dirty; each is a separate refusal, never a silent carry.
#[test]
fn plan_change_invalidates_progress_binding() {
    let old = checklist_snapshot();
    let progress = vec![done("act:clear:space-1"), done("act:verify:item-a")];
    let identity = progress_identity(&progress);
    let old_reply =
        query_action_eligibility(&old, Some(&progress), &stamp_for(&old, &identity, false))
            .unwrap();
    assert!(old_reply.eligible);

    // New plan: the guide changed, so the digest differs.
    let mut new = old.clone();
    new.content
        .actions
        .retain(|action| action.id.as_str() != "act:verify:item-b");
    new.plan_snapshot_id = canonical::snapshot_digest(&new.content);
    assert_ne!(old.plan_snapshot_id, new.plan_snapshot_id);
    assert!(validate::validate_snapshot(&new).is_empty());

    // Replaying the old plan's rows while claiming the old binding: refused.
    let mut stale_stamp = stamp_for(&new, &identity, false);
    stale_stamp.plan_snapshot_id = old.plan_snapshot_id.clone();
    let stale = query_action_eligibility(&new, Some(&progress), &stale_stamp).unwrap();
    assert!(!stale.eligible);
    assert_eq!(stale.stale_reason.as_deref(), Some("stamp_mismatch"));
    assert!(stale.rows.iter().all(|row| !row.executable));

    // Same input revision but an edited draft behind the scenes: refused.
    let dirty =
        query_action_eligibility(&new, Some(&progress), &stamp_for(&new, &identity, true)).unwrap();
    assert!(!dirty.eligible);
    assert_eq!(dirty.stale_reason.as_deref(), Some("dirty_source"));

    // A progress identity that does not match the supplied rows: refused.
    let mut forged = stamp_for(&new, &identity, false);
    forged.progress_identity = "forged".to_owned();
    let mismatched = query_action_eligibility(&new, Some(&progress), &forged).unwrap();
    assert!(!mismatched.eligible);
    assert_eq!(mismatched.stale_reason.as_deref(), Some("stamp_mismatch"));

    // The new plan is eligible only under its own binding; the carried rows
    // still cannot free the risky step.
    let rebound =
        query_action_eligibility(&new, Some(&progress), &stamp_for(&new, &identity, false))
            .unwrap();
    assert!(rebound.eligible);
    assert!(!row(&rebound, "act:install:place-1").executable);
    assert!(
        !rebound
            .rows
            .iter()
            .any(|row| row.action_id.as_str() == "act:verify:item-b")
    );
}

/// The historical v1 plan stays read-only: progress never attaches to it.
#[test]
fn historical_plan_does_not_receive_progress() {
    let historical = historical_snapshot();
    let identity = progress_identity(&[]);
    let reply = query_action_eligibility(
        &historical,
        Some(&[]),
        &stamp_for(&historical, &identity, false),
    )
    .unwrap();
    assert!(!reply.eligible);
    assert_eq!(reply.stale_reason.as_deref(), Some("historical_rule"));
    assert!(reply.rows.iter().all(|row| !row.executable));
}
