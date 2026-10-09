# ZARI-z-incremental-replan evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #90, node z-incremental-replan, “고정 배치를 지키는 부분 재정리”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-incremental-replan`.
- Observed base SHA: `b718a4813bc0dddfdbde3d51e0ae89fb4a056611` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/WORKSPACE_BLUEPRINT.md`; `design/SPATIAL_WORKSPACE.md` was not given a new rule; previous node evidence and `docs/adr/SP-z-pareto-comparison.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-incremental-replan and `docs/adr/SP-z-incremental-replan.md`. This delivery is z-incremental-replan only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt the feedback loop, checkout, cloud, photo consent, capture acceptance, or release.

## What changed

Partial replan is a Rust value beside `PlanSnapshot`. Read-model version `zari-incremental-1`. The activated project input is the new input. `baseSnapshot` is the previous plan. Pins are explicit: placement ids, item ids, and whether the previous strategy stays. A pinned placement is copied with its coordinates. A different coordinate for a surviving id is `placement_moved` and publishes nothing. Unpinned placements that no longer fit are dropped, not moved. A new item stays unassigned. The command does not search and does not invent a placement.

A snapshot is published only when the pin-preserving layout has no diagnostics and no blocking failure. Publication is `evaluate_candidate` with the existing `PlanCreation::ManualEdit`. `reusedPass` is always false. Fresh checks come from that validation, not from the previous snapshot's report. A strategy pin with a different input strategy does not switch the strategy; the reply is blocked with `strategy_pinned`. A blocked reply names conflicts and releasable pins. Trying one explicit pin at a time, up to 8, sets `sufficientAlone`. The full set is reported when no single pin is enough.

The command is `replanIncremental`. It is a search capability, immediately after `comparePareto`. `comparePareto` stays immediately after `cancelSearch`. Bootstrap activation is `invalid_state`. No search engine is `operation_not_supported`. A bare payload or an extra field is `invalid_input`. The reply is `incrementalReplanned`. The command does not select or accept a plan.

Generated DTO, schema, and validators were regenerated from Rust. `validators.d.mts` did not change. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live in `crates/core/tests/incremental.rs`, which `fixture_runner` does not scan.

There is no new Dexie store and no dbVersion change. The page uses the existing project Worker. One saved input digest, previous snapshot, and pin set sends the command once. Cancel forgets that key. A draft checkbox does not send it. `부분 재정리` sends it. `취소` bumps the epoch and leaves the selected id. A late reply increments an ignored count and does not select or accept. `이 계획으로 바꾸기` appends a published snapshot and selects it. A release button clears that pin in the form and does not send a command. An input commit and `startSearch` also bump the epoch and do not clear the selected id.

`docs/product-expansion/contract.json` `searchCapabilities` includes the new name so the engine lock matches the running search list. `baseCapabilities` stays unchanged. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, and `contractChange` stays `NO`. Those fields are the previous node's lock. Live `DB_VERSION` stays 3.

The plan screen shows the panel after the Pareto comparison. The base is the selected alternative, otherwise the verified edit head, otherwise the accepted snapshot. Kept rows use the existing `primary-on-subtle` pair (`pareto-diff`). Conflicts use the existing `warning-on-soft` pair (`pareto-held`). No new contrast case.

## Changed paths

- Adoption: `docs/adr/SP-z-incremental-replan.md`, `design/DECISIONS.md` (Dz-incremental-replan), a short z-incremental-replan note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/incremental.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`.
- Tests: `crates/core/tests/incremental.rs`, `crates/core/tests/protocol.rs`, `crates/core/tests/pareto.rs`, `apps/web/tests/unit/incremental.test.ts`, `apps/web/tests/unit/pareto.test.ts`, `apps/web/tests/browser/incremental-replan.spec.ts`.
- UI and worker: `apps/web/src/features/incremental/controller.ts`, `phrases.ts`, `IncrementalPanel.tsx`, `apps/web/src/features/project/session.ts`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`searchCapabilities` only).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/DOMAIN_MODEL.md`, `docs/FRONTEND.md`, `design/SCREENS.md`, `design/WORKSPACE_BLUEPRINT.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| A pinned placement is not moved in secret | `pinned_placement_keeps_its_coordinates` keeps the pinned coordinates and publishes. `command_keeps_the_pin_and_does_not_adopt` expects `movedPlacementIds` empty. A coordinate change would be `placement_moved` and would not publish. Browser: after pinning Winter coats, `data-moved` is `0`, the text is 옮긴 배치 없음, and `data-selected-id` stays until `이 계획으로 바꾸기` |
| A past pass invalidated by a new dimension is not reused | `a_new_dimension_does_not_reuse_the_old_pass` widens item-a to 9000 mm, blocks, and the fresh outer-geometry check is not the old pass. `reusedPass` is false. `an_unknown_dimension_does_not_stay_pass` keeps unknown off pass. Browser: 물건 A 폭 9000 mm, pin, `data-outcome` `blocked`, `data-reused-pass` `false`, and a fresh check is `fail` or `unknown`. The sentence is 이전 통과를 다시 쓰지 않습니다 |
| Cancel and a late reply do not change the adopted plan | `replanReplyApplies` and `replanAdoptAllowed` refuse a newer epoch and a blocked outcome. The session bumps the epoch on cancel, input commit, and search start, and `adoptReplan` is the only path that sets `selectedId`. Browser: the held `replanIncremental` is released after 취소; `data-state` stays `cancelled`, `data-ignored` becomes `1`, and `data-selected-id` is unchanged. One command per key is `replanOnce` |

Also checked, outside those three lines: a pinned strategy is not switched (`a_pinned_strategy_is_not_changed_quietly`); a new item stays unassigned while the pin stays; unknown and duplicate pins fail; the capability order ends `comparePareto`, `replanIncremental`; a bare payload and an extra field are `invalid_input`; no engine is `operation_not_supported`.

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1 via `rust-toolchain.toml`. wasm-bindgen was 0.2.128. The worker-state timeout was not raised. The new spec uses `test.setTimeout(180_000)` because the flow includes one real search, a held reply, and a dimension commit. The Playwright config timeout stays 30s. One assertion waits up to 60s for the search to leave the panel `idle`.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 179 passed, 1 ignored. The new `incremental` suite is 7 passed. The ignored test is the pre-existing completion-query ignore. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 26 files, 175 tests |
| `npm run build` | exit 0. Vite also printed the existing chunk-size warning. It is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `c31d92de4a925b0e`, 11 assets. Engine `BUILD_ID` stays `zari-domain-7` |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium --workers=2` | exit 0. 94 passed (Playwright 7.3m). Preview `http://127.0.0.1:4175`. The incremental spec passed (18.9s). No `worker-state` flake. `spatial3d` reported `context-lost-console: none`. `--workers=2` is the local RAM limit used by the previous node; the workflow command does not set a worker count. The config timeout was not raised |
| `npx playwright test apps/web/tests/browser/incremental-replan.spec.ts --project=firefox --workers=1` | exit 0. 1 passed (20.0s) on the `vite build --mode test` output from `npm run test:parity` |
| `npx playwright test apps/web/tests/browser/incremental-replan.spec.ts --project=webkit --workers=1` | exit 0. 1 passed (18.8s) on that same test-mode build |
| `npm run test:parity` | exit 0. 2 passed (27.6s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Route: the existing plan screen. Create a project, fill the sample, commit, open the plan. Chromium, Firefox, and WebKit. Success viewport 1440×1000, then 390×844, then `forcedColors: active`. Space toggles 전략 고정. Enter on the first release button clears that pin. Collected `pageerror` and console `error` lists were empty on the passing runs. At 390px, `documentElement.scrollWidth` stayed within the viewport.

Empty: before 계산 시작 the panel is `empty` and says a plan is needed. `replanIncremental` calls are 0.

Success: a Winter coats placement is pinned. The panel reaches `ready` with read model `zari-incremental-1`, `data-moved` `0`, and `data-reused-pass` `false`. The selected id is unchanged. One `replanIncremental` postMessage is sent. `이 계획으로 바꾸기` selects `data-next-snapshot` and does not send another command.

Cancel and late reply: the next postMessage is held. The panel is `pending`. 취소 leaves `cancelled` and the same selected id. Releasing the held message sets `data-ignored` to `1` and the text 늦은 응답은 채택한 계획을 바꾸지 않았습니다. The state stays `cancelled`. The call count stays 2.

Failure: the plan is accepted, 물건 A 폭 is set to 9000 mm and committed, and the plan screen is opened again after the context is `installed` on the new digest. The Winter coats item pin, and the Winter coats placement pin when that checkbox is present, are set. The panel is `blocked`, `data-moved` is `0`, `data-reused-pass` is `false`, the selected id is unchanged, and a fresh check is `fail` or `unknown`. The call count is 3. Enter on the release button unchecks that pin and does not send a fourth command.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new incremental cases are outside that manifest. No existing fixture expected bytes changed. The native command test and the capability list agree that `replanIncremental` follows `comparePareto`.

## Contract advisory

`contract_change` for this node is a new search command and capability. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live search capability list gained `replanIncremental` after `comparePareto`. The base capability list did not. The `reorganize` gap sentence still says there is no pinned incremental replan. That sentence was left in place. The feedback loop remains `z-feedback-reorganize`. This node does not set `implementsNow` true.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- The replan is a search capability, not a base capability. A base-only runtime still ends at `disposeProject`.
- Search ranking is unchanged. The command does not start a search. A new item is left unassigned instead of being placed into free space. Filling that gap remains the existing 계산 시작 after the pin is released.
- The release button clears the checkbox. It does not send `replanIncremental`. The next 부분 재정리 is the command without that pin. The Rust test records that the 9000 mm placement pin is `sufficientAlone`. The browser does not click 부분 재정리 after Enter.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2. Live `DB_VERSION` stays 3. `implementsNow` stays false. `contractChange` stays `NO`. `baseCapabilities` stays unchanged. `searchCapabilities` gained the new name. The `reorganize` gap sentence was not rewritten.
- The reply is not in exportVersion 1. A portable bundle remains `z-portable-project`.
- The full Chromium suite used `--workers=2` because this machine is memory constrained. That is the same worker count the previous node recorded. It is not a skipped test and not a timeout change.
- This session did not push. GitHub Actions has not executed this tree.

## Limits

- The feedback loop that keeps the current plan while drafting the next one is `z-feedback-reorganize` and is not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.
- The create-project `worker-state` flake did not occur on the passing 2-worker Chromium run.
- GitHub Actions has not run this working tree. The recorded green suite is the local 2-worker run above.

## Out of scope

z-feedback-reorganize and every later z-node. Governance files, source prompts, `SOURCE_MANIFEST.json`, CI workflows, and approved baselines.
