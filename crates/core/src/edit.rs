//! ZARI-007 trustworthy editing: apply one domain edit command to an immutable
//! snapshot and revalidate the whole layout through the exact same
//! finalize/validate path used for solver candidates.
//!
//! Every edit produces a provisional evaluation; a verified `PlanSnapshot` is
//! emitted only when the edited layout passes the independent validator without
//! a blocking known failure. Provisional geometry is never presented as a
//! verified BOM or action guide.
use crate::canonical::{self, CatalogContent};
use crate::facts::Diagnostic;
use crate::finalize::CandidateEvaluation;
use crate::input::ProjectInput;
use crate::plan::*;
use crate::scalars::Digest;
use crate::{finalize, validate};

fn reject(path: impl Into<String>, code: &str) -> Diagnostic {
    Diagnostic {
        field_path: path.into(),
        code: code.into(),
        reason_code: code.into(),
    }
}

fn rejected(diagnostics: Vec<Diagnostic>) -> CandidateEvaluation {
    CandidateEvaluation {
        report: None,
        snapshot: None,
        diagnostics,
    }
}

/// The snapshot bytes must hash to their claimed id and validate structurally.
fn snapshot_integrity(snapshot: &PlanSnapshot, path: &str) -> Vec<Diagnostic> {
    let mut diagnostics = validate::validate_snapshot(snapshot);
    if canonical::snapshot_digest(&snapshot.content) != snapshot.plan_snapshot_id {
        diagnostics.push(reject("planSnapshotId", "digest_mismatch"));
    }
    diagnostics
        .iter_mut()
        .for_each(|d| d.field_path = format!("{path}.{}", d.field_path));
    diagnostics
}

/// The snapshot's stamped compile context must still match the activated
/// input/catalog — an edit is never evaluated against stale input.
fn in_scope(
    snapshot: &PlanSnapshot,
    input_digest: &Digest,
    catalog_digest: &Digest,
    path: &str,
) -> Vec<Diagnostic> {
    if &snapshot.content.versions.input_digest == input_digest
        && &snapshot.content.versions.catalog_digest == catalog_digest
    {
        vec![]
    } else {
        vec![reject(format!("{path}.versions"), "edit_base_not_in_scope")]
    }
}

fn base_layout(base: &PlanSnapshot) -> CandidateLayout {
    CandidateLayout {
        placements: base.content.placements.clone(),
        assignments: base.content.assignments.clone(),
        unassigned: base.content.unassigned.clone(),
        purchase_selections: base.content.purchase_selections.clone(),
    }
}

/// Evaluate `command` against `base` under the activated `input`/`catalog`.
///
/// Fencing: `base` must pass integrity and carry the active context digests;
/// `restoreLayout` additionally resolves `source` under the same checks. Every
/// other path derives a provisional `CandidateLayout` that is revalidated
/// end-to-end — provisional results never carry a snapshot or BOM.
pub fn evaluate_layout_edit(
    input: &ProjectInput,
    catalog: &CatalogContent,
    base: &PlanSnapshot,
    command: &LayoutEditCommand,
    source: Option<&PlanSnapshot>,
    versions: CompileVersions,
    scope: SearchScope,
) -> CandidateEvaluation {
    let input_digest = canonical::input_digest(input);
    let catalog_digest = canonical::catalog_digest(catalog);
    let mut diagnostics = snapshot_integrity(base, "base");
    diagnostics.extend(in_scope(base, &input_digest, &catalog_digest, "base"));
    if !diagnostics.is_empty() {
        return rejected(diagnostics);
    }
    let layout = match command {
        LayoutEditCommand::RestoreLayout { source_snapshot_id } => {
            let Some(source) = source else {
                return rejected(vec![reject(
                    "command.sourceSnapshotId",
                    "edit_source_required",
                )]);
            };
            if &source.plan_snapshot_id != source_snapshot_id {
                return rejected(vec![reject(
                    "command.sourceSnapshotId",
                    "edit_source_mismatch",
                )]);
            }
            let mut diagnostics = snapshot_integrity(source, "source");
            diagnostics.extend(in_scope(source, &input_digest, &catalog_digest, "source"));
            if !diagnostics.is_empty() {
                return rejected(diagnostics);
            }
            base_layout_source(source)
        }
        _ => match apply_layout_edit(command, &base_layout(base), catalog) {
            Ok(layout) => layout,
            Err(diagnostic) => return rejected(vec![diagnostic]),
        },
    };
    // The edited layout re-enters the trust boundary as an ordinary proposal:
    // same structural validation, same independent physical checks and the
    // same immutable-snapshot construction as a solver candidate.
    let proposal = CandidateProposal {
        layout,
        strategy: base.content.strategy.clone(),
        creation: PlanCreation::ManualEdit,
    };
    finalize::evaluate_candidate(input, catalog, &proposal, versions, scope)
}

fn base_layout_source(source: &PlanSnapshot) -> CandidateLayout {
    CandidateLayout {
        placements: source.content.placements.clone(),
        assignments: source.content.assignments.clone(),
        unassigned: source.content.unassigned.clone(),
        purchase_selections: source.content.purchase_selections.clone(),
    }
}

/// Apply one edit command to a base layout. The result is provisional: it has
/// not yet passed independent validation. Container moves carry their
/// `contained` assignments unchanged — child local transforms compose with the
/// parent position, so a parent move never rewrites quantity or child state.
fn apply_layout_edit(
    command: &LayoutEditCommand,
    layout: &CandidateLayout,
    catalog: &CatalogContent,
) -> Result<CandidateLayout, Diagnostic> {
    let mut next = layout.clone();
    match command {
        LayoutEditCommand::MovePlacement {
            placement_id,
            position,
        } => {
            let placement = next
                .placements
                .iter_mut()
                .find(|p| &p.id == placement_id)
                .ok_or_else(|| {
                    reject(
                        format!("command.placementId.{placement_id}"),
                        "unknown_placement",
                    )
                })?;
            placement.position = position.clone();
        }
        LayoutEditCommand::RotatePlacement {
            placement_id,
            orientation,
        } => {
            let placement = next
                .placements
                .iter_mut()
                .find(|p| &p.id == placement_id)
                .ok_or_else(|| {
                    reject(
                        format!("command.placementId.{placement_id}"),
                        "unknown_placement",
                    )
                })?;
            placement.orientation = *orientation;
        }
        LayoutEditCommand::ReplaceVariant {
            placement_id,
            variant_id,
            offer_id,
        } => {
            if !catalog.variants.iter().any(|v| &v.id == variant_id) {
                return Err(reject(
                    format!("command.variantId.{variant_id}"),
                    "dangling_variant_ref",
                ));
            }
            let placement = next
                .placements
                .iter_mut()
                .find(|p| &p.id == placement_id)
                .ok_or_else(|| {
                    reject(
                        format!("command.placementId.{placement_id}"),
                        "unknown_placement",
                    )
                })?;
            match &mut placement.subject {
                PlacementSubject::NewContainer {
                    variant_id: slot, ..
                } => *slot = variant_id.clone(),
                _ => {
                    return Err(reject(
                        format!("command.placementId.{placement_id}"),
                        "edit_command_not_applicable",
                    ));
                }
            }
            // The purchase binding belonged to the old variant; it is replaced
            // outright so a stale offer can never ride along.
            next.purchase_selections
                .retain(|s| &s.placement_id != placement_id);
            next.purchase_selections.push(PurchaseSelection {
                placement_id: placement_id.clone(),
                offer: match offer_id {
                    Some(offer_id) => OfferSelection::Selected {
                        offer_id: offer_id.clone(),
                    },
                    None => OfferSelection::Unresolved {
                        reason_code: "offer_deferred".into(),
                    },
                },
            });
        }
        LayoutEditCommand::SelectOffer {
            variant_id,
            offer_id,
        } => {
            let published = catalog
                .offers
                .iter()
                .any(|o| &o.id == offer_id && &o.variant_id == variant_id);
            if !published {
                return Err(reject(
                    format!("command.offerId.{offer_id}"),
                    "offer_not_for_variant",
                ));
            }
            let mut touched = false;
            for placement in &next.placements {
                let PlacementSubject::NewContainer {
                    variant_id: slot, ..
                } = &placement.subject
                else {
                    continue;
                };
                if slot != variant_id {
                    continue;
                }
                if let Some(selection) = next
                    .purchase_selections
                    .iter_mut()
                    .find(|s| s.placement_id == placement.id)
                {
                    selection.offer = OfferSelection::Selected {
                        offer_id: offer_id.clone(),
                    };
                    touched = true;
                }
            }
            if !touched {
                return Err(reject(
                    format!("command.variantId.{variant_id}"),
                    "edit_command_not_applicable",
                ));
            }
        }
        LayoutEditCommand::RestoreLayout { .. } => unreachable!("handled by caller"),
    }
    Ok(next)
}
