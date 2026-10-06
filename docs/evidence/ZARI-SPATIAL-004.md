# ZARI-SPATIAL-004 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots are not an approved baseline; this node adds no picture to the evidence folder. The supervisor commits this tree; the final full HEAD SHA is that commit.

- Task: GitHub issue #49, node 004, “실행 단계 focus와 accepted-progress 정합”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-004`.
- Observed base SHA: `58d1edb11fdb8902c47ca29ce25a7a13f25252ba` (origin/main at branch creation; plan commit is an ancestor).
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2, §3, §7 SP-004, §11; `design/SPATIAL_WORKSPACE.md` §7; `docs/SPATIAL_VIEW_CONTRACT.md` §§5,7; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/SPATIAL_VERIFICATION.md`; `docs/evidence/ZARI-SPATIAL-001.md`; `docs/evidence/ZARI-SPATIAL-002.md`; `docs/evidence/ZARI-SPATIAL-003.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`. Candidate / NON_EXECUTABLE program drafts were not used as extra scope.

## Frozen WorkspaceState and ActionProgress

`apps/web/src/features/workspace/model.ts` is unchanged. Focus already has `{ kind: 'action', stepId }`. Step highlight stays distinct from selection. `ActionProgress` schema, Dexie store, and export are unchanged. Repository guards are transaction checks only. There is no persisted schema migration.

## What changed

Rust, fixtures, generated contracts, and `Cargo.lock` are unchanged. Source actions are not regenerated or reordered. Completion is a user row outside `PlanSnapshot`, keyed by project, input revision, snapshot id, and step id.

- `features/workspace/stepFocus.ts`: step order, exact link targets, unassigned / no-geometry text, prerequisite and dependent text, confirmation text, next executable step, and the late-reply gate. A null progress map is unknown. An empty map after a successful read means no rows.
- `features/workspace/StepFocus.tsx`: current / previous / next, target list, and checkboxes. Checkboxes exist only on the accepted surface when the binding is writable and the mark is known. The working head and an unaccepted alternative are read-only and do not show the accepted done checks. Stale accepted plans show historical status without checkboxes. “채택된 계획에서 실행하기” scrolls to `#accepted-guide`.
- `PlanScreen.tsx`: selected, edit, and accepted details each get a surface. The edit pane stays `working` even after that head is later accepted. Only the accepted surface has `id="accepted-guide"`.
- `session.ts`: `progressLoad` and `actionRetry` live in memory. `loadActionProgress` drops a reply whose epoch or binding no longer matches. A failed read sets `actionProgress` null and `progressLoad` `error`. `toggleActionStep` captures the accepted binding and epoch, writes, then applies the reply only if that binding is still current. A successful accept or `reloadLatest` bumps the epoch and does not carry the previous map. A thrown disk error sets `actionRetry` and does not flip the checkbox.
- `repository.ts`: `setActionStep` still CAS-checks `projectRevision`. It also requires `currentInputRevision` and the snapshot `inputDigest` to match the current project input, and refuses `done` when `requiredConfirmations` is nonempty (`confirmation_required`). Those returns happen before any row write, so an existing done row stays.
- `Workspace.tsx` / `InspectorLayers.tsx` / `project.css`: legend “현재 단계 대상”. Step outline reuses the existing dashed `--zari-info` stroke. Selection stays the solid selection ring. No new color token. Buttons keep `.button` and `--zari-control-min-height` (2.75rem).

## Acceptance mapping

| Acceptance | Test |
|---|---|
| Same step id and targets on 2D and links | `progress.spec.ts` first flow: focused step `data-target-keys` contains every `data-focus` target on top, and on front when present. Spatial request count unchanged across prev/next |
| Repeated contained units stay separate | `stepFocus.test.ts`: `instance:cup:0` and `instance:cup:1` |
| Working head does not inherit accepted progress | Browser: after a −15 mm move, `edit-section` has zero checked boxes while the old guide stays checked. Session: a same-position edit head has no progress rows |
| Null, read error, and `requiredConfirmation` block completion | `stepFocus.test.ts` null vs `{}`. Session: `actionProgressFor` throw → `progressLoad` error, toggle returns `progress_unavailable`, no map created. Repository: nonempty `requiredConfirmations` returns `confirmation_required` and keeps the done row |
| Old completion ack after an accept switch is not merged | Session and browser: `__zariProgressGate` holds the reply until the new plan is accepted; the new guide has zero checked boxes; the old binding still has the first step done |
| Two-tab conflict and reload | Browser: tab B shows `edit-conflict` and `progress-conflict` with zero checkboxes; reload restores the checked step. Repository: second writer under a stale revision conflicts and leaves the done row. Browser reload after a check restores that check |
| Progress writes do not change PlanSnapshot, hash, BOM, or geometry | `catalogOwned.test.ts`: snapshot JSON and placements unchanged after a save |
| Selection is distinct from step highlight | Browser: legend contains both “선택됨” and “현재 단계 대상”; `.diagram-selection` and `.diagram-focus` can both be present |
| Stale accepted plan is read-only | Browser: width 610 then back to plan shows `progress-stale` and zero checkboxes. Session and repository: digest or revision mismatch returns `stale_input` and does not write |
| Current / previous / next, keyboard, 390 px, forced colors | Browser: Enter on `step-next`, then next/prev when enabled, zero extra spatial requests. At 390×844 `step-next` height ≥ 44. Forced colors still shows the legend and `current-step` |

## Commands (final tree)

Shell prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH`, `CARGO_BUILD_JOBS=4`. Node v24.19.0. Rust via `rust-toolchain.toml`. wasm-bindgen 0.2.128.

Rust sources did not change after the Rust commands. The last edit after the browser suite was an assertion inside `session.test.ts` (thrown `setActionStep`). `npm run lint` and `npm test` were re-run after that edit.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 83 tests: core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14. Solver/wasm/doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 cases |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 107 cases |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. `zari-wasm` v0.1.0. No DuckDB, Polars, Python, or CUDA |
| `npm run wasm:build && npm run contracts:check` | wasm-bindgen 0.2.128. Contracts match Rust source; 107 fixture structures valid |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (re-run after the final session assertion) |
| `npm test` | vitest 11 files, 95 tests, exit 0 (re-run after the final session assertion) |
| `npm run build` | exit 0. Pre-existing chunk-size warning only |
| `node scripts/check-design-tokens.mjs --self-test` | 10 checker self-tests; 72 tokens; 39/39 contrast cases. No new pair |
| `npm run test:browser -- --project=chromium` | 49 passed (30.6s). Chromium, locale `ko-KR`, default viewport 1440×1000. Includes `progress.spec.ts` (3) and the existing catalog progress reload. No project-startup flake in this run. One earlier focused re-run of the first progress spec, after skipping a disabled `step-prev`, passed (2.3s) |
| `npm run test:parity` | exit 0. Native and Chromium Worker/WASM agree on 107 fixtures; 2 `@parity` tests passed (15.8s) |

`Cargo.lock` and generated `apps/web/src/contracts/` are unchanged.

Follow-up on the same tree, after gating the progress hook to `import.meta.env.MODE === 'test'`: `npm run typecheck` exit 0, `npm run lint` exit 0, `npm test` 11 files / 95 tests exit 0, `npm run build` exit 0, `rg __zariProgressGate apps/web/dist` no match, `npm run test:browser -- --project=chromium` 49 passed (24.6s). The late-reply spec is in that run.

## Browser

- Route: `#/project/<id>/plan` after create-project, fill-sample, commit, compute, select the first plan, and accept. Real IndexedDB and WASM Worker. No mocked solver in the new specs.
- Engine: Playwright Chromium. Each `progress.spec.ts` flow records `pageerror` and console `error`; those lists were empty on both pages of the two-tab flow.
- Accepted steps, 1440×1000: keyboard next, optional next/prev, target keys match the diagram, selection ring stays separate from the step outline, a disabled checkbox (when the sample has one) shows “선행 단계”, one completion survives reload, 390×844 control height, forced-colors legend.
- Working / switch / late reply: check a step, move y by −15 mm, working guide has no checks, hold the in-flight reply, accept the edit head, release, new accepted guide has zero checks.
- Stale / two tabs: tab B sees conflict and no checkboxes, reload shows the saved check; tab A changes width to 610 and the old accepted guide becomes stale with no checkboxes.
- No draft screenshot was stored under `docs/evidence/`.

## Limits

- The sample producer emits empty `requiredConfirmations`, so the browser does not show a live confirmation step. The block is covered by the repository test and the session pre-check. This node does not add a physical confirmation workflow.
- A thrown disk write sets `actionRetry` and keeps the previous map. That path is the session unit test. The browser suite does not inject a failed IndexedDB write.
- 390×844 is Playwright emulation, not a physical phone.
- Null progress is unknown. The browser flows that complete a step do so after a successful read, so they are not an all-todo stand-in for a failed read.
- Nodes 005–007 are not started. No 3D view.

## Contract advisory

No protocol, schema, validator, fixture expected output, snapshot digest, or id change. `PlanSnapshot` bytes are not rewritten by a progress save. `stale_input` and `confirmation_required` are local `ActionStepResult` statuses. `progressLoad` and `actionRetry` are session fields, not stored rows.

## Deviations

- `globalThis.__zariProgressGate` is a test pause after the repository write and before the merge check. `session.ts` calls it only when `import.meta.env.MODE === 'test'` (`vite build --mode test` for the browser suite, Vitest for the unit test). The production `npm run build` bundle does not contain `__zariProgressGate`. When the hook is unset, the reply is applied immediately. It is not a delay inside IndexedDB.
- The edit pane stays surface `working` after its head is accepted, so accepted checkboxes stay on `#accepted-guide` only.
- `seedAccepted` in the catalog unit tests now sets `currentInputRevision` and `currentInputDigest` so the new digest check matches a real accepted project.

## Out of scope

Nodes 005–007. No action regeneration, arrival or install inference, checkbox-as-confirmation, progress cloud, or schema migration. No new dependency. No governance, workflow, source-prompt, or runtime-flag edit.
