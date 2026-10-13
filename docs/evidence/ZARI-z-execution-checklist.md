# ZARI-z-execution-checklist evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #100, node z-execution-checklist, “실행 체크리스트·막힘·되돌리기”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-execution-checklist`.
- Observed base SHA: `2bf7d4d427a0eb4c62c2ac2ee912756d89e27b0a` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md` (S03, S06); `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `design/WORKSPACE_BLUEPRINT.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`; `docs/MASTER_PROMPT_KO.md`; `docs/RUST_ADDENDUM_KO.md`; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Previous node evidence and ADRs were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**`, `docs/aiops/**`, and `.github/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-execution-checklist and `docs/adr/SP-z-execution-checklist.md`. This delivery is z-execution-checklist only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, payment, cloud, photo consent, or release.

## What changed

The accepted plan's guide already carries the Rust action DAG, per-step eligibility (`queryActionEligibility`), and persisted progress bound to `(inputRevision, planSnapshotId)`. This node connects that existing machinery to a per-step execution card and adds rollback navigation back to the draft controls. No Rust source, protocol, or schema changed; the only Rust addition is a test file.

- `GuideEligibility` rows now carry Rust's `instanceRefs`, mapped in `session.ts` on both the normal and rejected eligibility paths. The execution card lists them as preparation items with their labels; an unlabeled subject id keeps its action-step label and no quantity is guessed.
- `features/execution` renders the focused step: title, kind, preparation list (`instanceRefs`), condition rows resolved from `reasonIds` against `content.validation.checks` (`pass`/`fail`/`unknown` rendered as text, never re-computed), prerequisite state from `prerequisiteStepIds`, required confirmations, and the progress record. Completion writes go only through the existing `toggleActionStep` → `setActionStep` CAS path; a completion record never mutates `validation.checks`. A step Rust marks not executable is rendered disabled with its reason text and `aria-describedby`.
- Rollback: `requestDraftFocus`/`takeDraftFocus` is a volatile field on `ProjectSession` — never written to storage. Three buttons navigate back to the draft page and focus the matching control: discovered item → item dimensions, missing part → catalog/owned containers, measurement differs → space dimensions. `ProjectScreen` resolves the target by id/`data-testid`, finds a focusable descendant if needed, scrolls it into view, and focuses it.
- `PlanScreen` mounts the card inside the accepted-guide section below the step list; it follows the existing workspace step focus and accepted binding. The card does not recompute the action graph or suitability. On a working/non-accepted surface, stale input, a conflict, or unreadable progress, `stepAccess` already returns read-only and the card hides its controls.
- `crates/core/tests/execution_checklist.rs` is the required fixture: six tests cover suspend/resume (a reloaded session restores only recorded progress), a risky step staying blocked until its `reasonIds` checks clear, completion not clearing an `unknown` check, a plan change invalidating the old progress binding (re-querying against the new snapshot shows no inherited progress), a historical v1 plan staying read-only, and unreadable progress not rendering as an all-todo list.

`BUILD_ID` stays `zari-domain-7`. `protocolVersion`, persisted `schemaVersion`, `ruleVersion`, canonical version, exportVersion 1, document `dbVersion` 2, and live `DB_VERSION` 4 stay. The 124 fixture expected bytes, `fixtures/`, `Cargo.lock`, and the contract generated files are unchanged. No new color token or contrast case; the card reuses existing surface, text, border, control, danger/warning-soft, and touch tokens.

## Changed paths

- Adoption: `docs/adr/SP-z-execution-checklist.md`, `design/DECISIONS.md` (Dz-execution-checklist), a z-execution-checklist-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, a scoped implementation note in `design/SPATIAL_WORKSPACE.md` §8.
- Rust tests only: `crates/core/tests/execution_checklist.rs`. No `crates/core/src/**` change.
- Host: `apps/web/src/features/execution/model.ts`, `phrases.ts`, `ExecutionChecklist.tsx`; `apps/web/src/features/workspace/stepFocus.ts` (`instanceRefs` on the eligibility row); `apps/web/src/features/project/session.ts` (`instanceRefs` mapping, `requestDraftFocus`/`takeDraftFocus`); `apps/web/src/app/PlanScreen.tsx` (card mount); `apps/web/src/app/ProjectScreen.tsx` (pending draft focus); `apps/web/src/styles/project.css` (`.execution-card`).
- Tests: `apps/web/tests/unit/executionChecklist.test.ts`, `apps/web/tests/browser/execution-checklist.spec.ts`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, generated contract files, and `.github/workflows` were not touched. The two `docs/evidence/ZARI-SPATIAL-001-*.png` files a capture run rewrote were restored with `git checkout`. No new dependency.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| A completion check never turns an `unknown` condition into `pass` | Rust `completed_steps_do_not_clear_unknown_conditions` marks a step done, re-queries eligibility, and asserts the check row is still `unknown`. Web: `toggleActionStep` only writes the progress map and project revision and never touches `content.validation.checks`; the unit test asserts the card renders the check status text unchanged |
| A risky step is never completable while prerequisite blockers remain | Rust `risky_step_stays_blocked_until_conditions_clear` asserts `executable` stays false while condition checks are `unknown`/`fail` and clears only when they pass. `toggleActionStep` requires Rust `executable` before writing; the browser spec finds a disabled action input with a `step-condition-*` element and asserts it stays disabled with the condition text visible |
| Old-plan progress never carries to a new snapshot | Rust `plan_change_invalidates_progress_binding` re-issues the eligibility query against a new `plan_snapshot_id` and asserts no recorded progress is inherited. `stepAccess` refuses writes on a non-accepted or stale binding; the browser spec edits the input, recomputes, accepts the new plan, and asserts the card's checkbox for the same action id is unchecked and the old binding is refused |

Required outputs map to: step-by-step UI + persisted progress → `ExecutionChecklist.tsx` + the existing repository `setActionStep` CAS path (verified by reload persistence in the browser spec); interruption/resume + plan-change invalidation fixture → `crates/core/tests/execution_checklist.rs`.

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node` v24.19.0, `npm` 11.x, `rustc` 1.98.1 via `rust-toolchain.toml`, wasm-bindgen 0.2.128. Playwright timeouts were not raised.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | First run failed on the unformatted new test file; `cargo fmt --all` then exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0, all test binaries green. New `execution_checklist.rs`: 6 passed |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git status fixtures/` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. No new dependency |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No regeneration needed — no Rust source changed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 30 files, 193 tests |
| `npm run build` | exit 0. The pre-existing chunk-size warning is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `faea890c53e5221c`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. 16 ids unchanged, chain one snapshot, 124 fixtures unchanged, runtime hits 0 |
| `npm run test:browser -- --project=chromium` | exit 0. Full suite on the final tree: 106 passed, 0 failed (4.6 m). `spatial3d` reported `context-lost-console: none` |
| `npx playwright test apps/web/tests/browser/execution-checklist.spec.ts --project=chromium` | First run: 4 passed, 1 failed — `.check()` did not flip the controlled React checkbox; switched to `.click()` + `toBeChecked()`. Rerun 5 passed |
| `npx playwright test apps/web/tests/browser/execution-checklist.spec.ts --project=firefox` | exit 0. 5 passed (1.5 m) |
| `npx playwright test apps/web/tests/browser/execution-checklist.spec.ts --project=webkit` | exit 0. 5 passed (1.5 m) |
| `npm run test:parity` | exit 0. 2 passed (28.7 s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

Development-time failures already folded into the table above: the Rust `plan_change_invalidates_progress_binding` fixture first failed `validate_snapshot` because dropping `act:verify:item-b` also removed an unassigned row needed for quantity coverage; the fix keeps the row and changes only the action graph.

## Browser

Route: project screen → sample input → compute plan → plan detail → accept a candidate → guide step list → execution card on the focused step. Chromium full suite plus the new spec on all three engines. Viewports 1440×1000 and 390×844; `forcedColors: active` run included.

Success: the card follows the focused step, lists preparation items from `instanceRefs` and conditions from `reasonIds`, the completion checkbox persists after a real reload, and blocking conditions render as text with the checkbox disabled. The three rollback buttons land on the matching draft control (`item-*-dims`, catalog/owned containers, space dims) with real focus and no progress write. After an input edit the card controls close (`stepAccess` read-only), and a recomputed/accepted plan shows the same action ids unchecked.

Failure: a disabled condition-blocked step cannot be checked; stale/eligibility-mismatch writes are refused by `toggleActionStep` before reaching the repository. Console `error` and `pageerror` lists were empty.

Keyboard: the checkbox is a real input, Space toggles it, and rollback buttons are native buttons. All engine runs are desktop emulation; phone and discrete GPU were not available and are UNVERIFIED.

## Contract-change advisory

No contract change. No new command, DTO field, capability, or schema. `instanceRefs` already existed in the generated `ActionEligibilityRow` DTO (`contracts/generated/dto.ts` line ~3060); this node only maps it through the web session. `contract.json` `contractChange` stays NO, `implementsNow` false, document `dbVersion` 2; live `DB_VERSION` 4 unchanged.

## Known limits

- The card shows the focused step only; the full step list beside it is the existing `StepFocus` UI. Step ordering, eligibility, and prerequisites remain Rust's; nothing in the browser recomputes them.
- Rollback navigates and focuses; it does not edit the draft for the user or clear progress.
- A step whose eligibility row is absent (e.g. a read-only surface) lists subjects only, without instance labels.
- All viewport/forced-colors/keyboard runs are desktop browser emulation. Phone and a discrete GPU are UNVERIFIED.
- The known create-project worker-state flake was not observed in these runs; reported as observed, no retries raised.

## Out of scope

The next z-node, external purchasing/payment, cloud sync, progress migration to a new snapshot, a global auto-resume queue, real-device capture, and `BUILD_ID`/schema/version changes.
