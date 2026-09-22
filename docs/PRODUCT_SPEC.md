# ZARI Product Specification v1

Status: proposed implementation contract; application absent at the audited base. Adoption is recorded through the architecture PR and User decision; this file does not itself authorize merge or external services. Source intent remains in the two preserved prompts.

## Contents

1. Product thesis and success criteria
2. Supported scope and truthfulness
3. User journey and plan states
4. First vertical slice
5. Release and consequential decisions

## 1. What ZARI produces

ZARI compiles a physical organization problem into an inspectable plan: space + objects + owned storage + habits + constraints + preferences → normalized facts → organization strategy → zones/groups → primitive recipes ↔ actual variants/layout search → independent validation → immutable PlanSnapshot → scaled diagram, BOM, purchase list and execution steps.

Organization decisions precede product resolution. No-purchase direct placement and reusing owned containers are normal outcomes. Commercial benefit, affiliate revenue and visual occupancy cannot improve a physically invalid candidate's rank. No account or external AI is needed.

Success means the user can identify every input object as assigned or explicitly unassigned, understand why it is placed there, distinguish facts from unknowns, acquire exactly the stated packs if needed, and follow steps bound to that plan. Three decorative alternatives, an AI chat transcript, and a visually attractive room image are not success metrics.

## 2. Supported v1 and deliberate limitations

One existing axis-aligned rectangular compartment, front opening, rectangular fixed obstacles, floor support, upright yaw0/yaw90 where authorized; directPlacement, openBin, tray, verticalFile. Contents use rigid conservative rectangular envelopes. One level of nesting: compartment → container → items. No nested containers, stacked items/containers, soft-body compression or inferred load ratings. A primitive's name never enables an unimplemented path or load rule.

v1 strategy families: minimum purchase, frequency separation, activity grouping, active/reserve separation and one-action access; visual uniformity is a preference after physical constraints. The first full slice enables only minimum purchase plus an explicit group selection and upright direct/open-bin recipes. Other families activate in the solver task only with tested rules and explanatory evidence.

Contents retrieval uses a measured external staging volume and support, not merely front depth. v1 can confirm zero-blocker straight extraction and subsequent upright contents lifting in that staging volume. It can report blockers, but off-path parking/replacement is not modeled: removable blockers leave operational access conditional unless a hard one-action restriction makes it fail. User acknowledgement cannot convert unsupported motion into a physical proof. Detailed screen behavior is in [WORKSPACE_BLUEPRINT.md](../design/WORKSPACE_BLUEPRINT.md); the full numerical reference is [COMPILER_WALKTHROUGH.md](COMPILER_WALKTHROUGH.md).

Supported first, with precise scope: numeric measurements, explicit unknowns, synthetic demo catalog, owned storage, conservative axis-aligned placement, top/front SVG, local save/reload. Before v1 beta: real manually verified catalog/import, simple seller links, execution progress, project duplication/export/import, keyboard/mobile workflows, optional locally stored photos without measurement inference, local recovery and offline revisit after initial load.

Out of v1: rooms, wall mounting, assembly requiring internal rearrangement/rotation, drawers/lids, new shelves, structural engineering, child-safety certification, multi-compartment solving, account/cloud sync, remote AI, scraper, automatic cart/checkout, GPU and 3D editor. Future requests receive unsupported_geometry/unsupported_primitive with a supported alternative, never simulated support.

## 3. Facts and check presentation

Each plan retains independent outer_geometry, inner_capacity, installation_path, operational_access, support_load, orientation, inventory, price and shipping checks; additional support_geometry, quantity_conservation, compatibility and budget checks are explicit. UI group headings may group rows but cannot collapse their values.

Unknown is neither zero, pass, free nor available. Estimated and verified describe evidence quality, not whether a value exists. Not-applicable needs a rule/reason. Nominal fit with unknown tolerance is conditional. A missing outer extent prevents drawing a physical placement; a missing interior may permit an exterior-only conditional plan, with contents still unverified and all quantities visible.

A PlanSnapshot is evaluated by the validator and immutable. It may have unresolved conditions. `physicallyConfirmed` requires all applicable physical checks pass with bounded uncertainties; this is confirmation within the documented model, not a universal physical guarantee. `accepted` means the user chose/pinned a plan, not that missing data became known. Purchase readiness remains separate. Known hard failure never becomes a recommended snapshot; diagnostic candidates are visibly rejected.

## 4. Journey and outcomes

| Stage | User action | Required result |
|---|---|---|
| Start | New space or marked demo | No login gate; demo has no fabricated brands/links |
| Measure | Internal W/D/H, later aperture/clearances/error | Raw edits preserved; focus highlights corresponding dimension; unknown stays visible |
| Objects/owned | Category, quantity, storage-state dimensions, frequency, groups | Unknown quantity and unassigned objects remain represented |
| Strategy | Select actual organization objective | Explain applicable facts, tradeoffs, groups/zones and rule IDs before products |
| Preferences | Open access, budget type, color/material | Hard constraints separated from soft preferences; no silent strategy switch |
| Calculate | Compile with a documented finite scope | Real alternatives only; progress/cancel; provisional vs accepted plan |
| Inspect/edit | Select, numeric move, permitted rotation, replacement | Evidence and contents linked; ghost until Rust revalidation; no SKU resizing |
| Execute | Reuse/purchase/confirmation list and steps | Exact option, packs, surplus, unknown totals, linked steps, arrival prerequisites |
| Resume | Save, reload, export/import | Preserve versions/evidence; conflict and save failure actionable |

If raw input changes, the displayed snapshot becomes stale immediately, even before a parseable normalized value exists. Undo is another edit: it advances the editor epoch and durable project revision; inputRevision advances only if normalized source input changes. Layout-only undo creates an evaluated snapshot under the same input revision. It never resurrects old request validity. Alternatives use the same physical scale.

## 5. First full vertical slice acceptance

Task 001 is an architecture proof, not this slice. Task 006 completes the first useful compiler loop on dependencies 002–005.

Include: one compartment with required measured fields; one or two rigid item groups; quantity 0/known/unknown states; minimum-purchase strategy; direct placement, one owned open bin and synthetic purchasable open-bin variants; deterministic bounded placement; separate Rust validator; physical quantities and 2-pack arithmetic; Rust-created snapshot with checks/BOM/steps; top/front SVG and linked evidence; draft save and accepted snapshot save; browser reload with same snapshot ID/content and explicit stale detection after edit.

Synthetic fixture: internal 600×400×300 mm, explicit fixture tolerance 0, wall/gap policy 5 mm (test configuration, never a universal recommendation), known front opening, external staging depth, known support/load and 3×190 mm candidate arrangement. A 3×195 mm row fails its 605 mm width requirement. Items with 240 mm upright height fail a 230 mm interior even if the 250 mm outer box fits. Another fixture requires 5 new units in packs of 2: 3 packs, 6 supplied, 1 surplus. Include reuse-only and purchase-free results. Every other axis and path condition must be separately supplied; width math is not complete validation.

Exclude from the first slice: real commerce claims, photo analysis, arbitrary drag, full visual style controls, multiple spaces, general stacking, cloud/AI, polished onboarding and automatic baseline approval. Missing future controls are not fake disabled promotional buttons. The initial demo clearly states its restricted strategy/primitives.

## 6. Release and authority

Architecture gate precedes implementation dispatch. The beta gate requires at least one real catalog case with field-level evidence, small-space scope tests, browser accessibility/responsive checks, measured performance, local data recovery and no unresolved hard correctness failures. A demo may be delivered earlier with synthetic labeling.

Architect may choose reversible module organization, DTO tooling and tested local algorithms inside these contracts. User decides any approved technology replacement, hosted backend, AI provider/data transmission, paid resources, changed privacy/model/scope/identity or commercial dependency. No such infrastructure is proposed as a prerequisite. Outstanding consequential action for this proposal is adoption of the architecture and designation of a non-author auditor; source contracts remain protected pending that decision.
