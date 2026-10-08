# ZARI-z-strategy-library evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots taken while a browser assertion was still failing were local Playwright attachments and were not kept as a baseline. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #86, node z-strategy-library, “생활습관 기반 전략과 Recipe 라이브러리”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-strategy-library`.
- Observed base SHA: `de8e4f6f89282f62ad7202d3d72dae8e73771023` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/SOLVER.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/WORKSPACE_BLUEPRINT.md`; previous node evidence and `docs/adr/SP-z-offer-bundles.md`, `docs/adr/SP-z-product-contract.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-strategy-library and `docs/adr/SP-z-strategy-library.md`. This delivery is z-strategy-library only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt Pareto scoring, checkout, cloud, photo consent, capture acceptance, or release.

## What changed

Recipe comparison is a Rust value beside `PlanSnapshot`. Catalogue version `zari-strategy-library-1` and recipe version 1 name five built-in rows. Rule ids and fact refs are copied from the existing `propose` decisions. `decision.rs` and search ranking are unchanged.

The five recipes differ on primitives, retrieval, and access. Minimum purchase uses direct placement, open bin, tray, and vertical file, both retrievals, and `reuse_owned_before_new`. Frequency separation drops the vertical file and uses `frequency_zone_soft`. Activity grouping keeps the minimum-purchase primitives and uses `declared_activity_partition`. Active/reserve uses open bin and tray, pull-then-retrieve only, and `active_front_reserve_rear`. One-action access uses direct placement and front extraction only, and `zero_other_container_moves`.

The outcome signature is access code, primitives, retrievals, groups, and priorities. Message keys are not part of it. The minimum-purchase wording alias `reason.min_purchase.wording_only` is created and then dropped (`droppedWordingDuplicates` 1 on the sample). A different access code stays. The same signature keeps the pinned non-alias row.

`pinned_strategy` is a copy of `strategy_choice`. `strategy_changed` is always false. The function does not write the input. Hard constraints and visual preferences are separate lists. A color or material change does not change unassigned quantities. Safety restrictions stay unmodeled and are not a pass. Unknown quantity has no count and is not 0.

An item is a candidate or unassigned, not both. Ungrouped, no resolvable zone, unknown quantity, not-applicable quantity, a retrieval the recipe does not support, and an unproved hard one-action rule are unassigned with that item's own quantity. Candidates are not placements.

The command is `evaluateStrategyLibrary`. It is a search capability, immediately after `proposeStrategies` and immediately before `startSearch`, because it needs the solver decisions. Bootstrap activation is `invalid_state`. No search engine is `operation_not_supported`. A bare payload is `invalid_input`. The reply is `strategyLibraryEvaluated`. It is not part of a PlanSnapshot hash and does not publish a snapshot.

Generated DTO, schema, and validators were regenerated from Rust. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live in `crates/core/tests/strategy_library.rs`, which `fixture_runner` does not scan.

There is no new Dexie store and no dbVersion change. The catalogue is built-in data. The page uses the existing project Worker. One saved input digest and strategy sends the command once. A failed read is dropped and is not sent again until the person asks.

`docs/product-expansion/contract.json` `searchCapabilities` includes the new name so the engine lock matches the running search list. `baseCapabilities` stays unchanged. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, and `contractChange` stays `NO`. Those fields are the previous node's lock. Live `DB_VERSION` stays 3.

The plan screen shows the comparison under the existing strategy radios. A radio change is a draft. The pin stays on the activated input until `이 선택 저장` runs the existing commit. Unknown quantity is the word 미확인.

## Changed paths

- Adoption: `docs/adr/SP-z-strategy-library.md`, `design/DECISIONS.md` (Dz-strategy-library), a short z-strategy-library note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/strategy_library.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`, `crates/solver/src/lib.rs` (the engine method only).
- Tests: `crates/core/tests/strategy_library.rs`, `crates/core/tests/protocol.rs`, `apps/web/tests/unit/strategyLibrary.test.ts`, `apps/web/tests/browser/strategy-library.spec.ts`.
- UI and worker: `apps/web/src/features/strategy/controller.ts`, `phrases.ts`, `StrategyLibraryPanel.tsx`, `apps/web/src/features/project/session.ts`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`searchCapabilities` only).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/DOMAIN_MODEL.md`, `docs/SOLVER.md`, `docs/PERSISTENCE.md`, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`, `docs/ARCHITECTURE.md`, `design/SCREENS.md`, `design/WORKSPACE_BLUEPRINT.md`, `README.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.
- Browser preview: `playwright.config.ts` binds the first free port at or above 4173 and keeps that port for the worker processes. `reuseExistingServer` stays false.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case. Colors reuse `primary-on-panel`, `secondary-on-panel`, and `warning-on-soft`.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| A wording-only alternative of the same result is removed | `wording_only_alternative_is_removed`. The alias shares the minimum-purchase signature and is dropped. Activity grouping keeps a different access code. Browser: the pin line says 문구만 같은 결과 1개 |
| A pinned user strategy is not rewritten | `pinned_strategy_is_not_rewritten`: the input clone is unchanged, `strategy_changed` is false, and an activity pin stays activity. Browser: after choosing 한 동작 접근, `data-pinned` stays `minimumPurchase`, `data-changed` is false, and the held notice is visible, until `이 선택 저장`. The library call count stays 1 across that draft and across Enter on the recipe rules |
| Unplaceable items remain unassigned with their quantities | `unplaceable_items_keep_their_quantities` keeps counts 2 and 3 apart. `unknown_quantity_is_not_zero_and_pull_only_stays_unassigned` has no count on unknown and keeps the known pull-only counts. Browser: after the explicit save to one-action access, `unassigned-count-item-b` is `1`, not 미확인 and not 0, and item-a is not in the unassigned table |
| Hard constraints stay apart from visual preferences | `hard_constraints_stay_separate_from_visual_preferences`. Browser: the hard list does not contain 색 취향, and the visual list contains 저장된 전략을 바꾸지 않습니다 and does not contain 구매가 금지 |
| Each recipe names primitives, groups, and an access assumption | The five templates in `strategy_library.rs`. Browser: the open minimum-purchase rules contain `min-purchase/reuse-first` |
| One command per saved input and strategy, no automatic retry | Unit `evaluateLibraryOnce` records one call, then a second only after `forgetLibraryEvaluation`. Browser: one `evaluateStrategyLibrary` postMessage before the explicit save, and two after it. The status observer records `pending` then `ready` on that save |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. Timeouts were not raised. The app commands below were run after the comparison panel and tests were in the tree. `npm run typecheck`, `npm run lint`, `npm run build`, the token check, the release manifest, and the product-contract check were run again after the README sentence, which does not enter the app bundle.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 166 passed, 1 ignored. core lib 37, bootstrap 9, catalog provenance 7, completion query 12 passed and 1 ignored, domain 11, edit 6, guide oracle 7, inventory lifecycle 7, offer bundles 8, product completion contract 7, product expansion contract 4, protocol 17, strategy library 6, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 24 files, 167 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `f47e581374fdae0e`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium` | exit 0. 92 passed, 4 workers (Playwright 3.7m). Preview bound `127.0.0.1:4175` because 4173 and 4174 were already listening. No `worker-state` flake. `spatial3d` reported `context-lost-console: none` |
| `npx playwright test apps/web/tests/browser/strategy-library.spec.ts --project=firefox` and `--project=webkit` | exit 0. Firefox 1 passed (2.8s), WebKit 1 passed (2.3s), on the `vite build --mode test` output |
| `npm run test:parity` | exit 0. 2 passed (26.2s). “124 shared fixtures.” |

## Browser

Route: the existing plan screen after creating a project, filling the sample, and committing it. Chromium, Firefox, and WebKit. Success viewport 1440×1000, then 390×844, then `forcedColors: active`. Enter on the minimum-purchase recipe button collapses and reopens `min-purchase/reuse-first`. Collected `pageerror` and console `error` lists were empty. At 390px, `documentElement.scrollWidth` stayed within the viewport.

Success: the panel reaches `ready` with pin `minimumPurchase`, `data-changed` false, library `zari-strategy-library-1`, and one dropped wording duplicate. The hard list does not mention color. The visual list says the saved strategy is not changed. The unassigned list is empty. Choosing 한 동작 접근 shows the held notice and the stale-input notice while the pin stays `minimumPurchase` and the call count stays 1. `이 선택 저장` moves the pin to `oneActionAccess`, records `pending` then `ready`, and leaves item-b unassigned with count 1. Item-a is not unassigned. The call count is 2. Forced colors keeps that count and that pin.

Failure covered in the same flow: a draft radio is not treated as the saved strategy. The pull-only item is not given count 0 or 미확인. The library is not asked again for the same saved input.

Call count: the unit test records one read, then a second only after forget. The browser counts `evaluateStrategyLibrary` postMessage: 1 before the explicit save, 2 after it.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new library cases are outside that manifest. No existing fixture expected bytes changed.

## Contract advisory

`contract_change` for this node is a new search command and capability. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live search capability list gained `evaluateStrategyLibrary`. The base capability list did not.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- The library is a search capability, not a base capability. A base-only runtime still ends at `disposeProject`.
- Draft autosave stores the raw form and does not activate it. The comparison pin moves when the existing commit runs. The plan screen button `이 선택 저장` calls that commit. A radio change alone does not.
- `docs/WASM_PROTOCOL.md` keeps the z-product-contract sentence that search capabilities were four names. Section 10 records the live five-name search list.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2. Live `DB_VERSION` stays 3. `implementsNow` stays false. `contractChange` stays `NO`. `baseCapabilities` stays unchanged. `searchCapabilities` gained the new name.
- The library reply is not in exportVersion 1. A portable bundle remains `z-portable-project`.
- Playwright no longer assumes preview port 4173 is free. Another process on this machine was already serving a different app there, and reusing that server would test the wrong app. The config keeps `reuseExistingServer: false`, binds the first free port from 4173 upward, and writes that origin so the worker processes use the same port as the server. On this run the free port was 4175. CI still gets 4173 when it is free.

## Limits

- Later z-nodes, Pareto scoring, checkout, live seller stock, cloud, accounts, photo consent, capture acceptance, and release are not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.
- The create-project `worker-state` flake did not occur. Timeouts were not raised and the suite was not retried.

## Out of scope

Pareto comparison, search ranking changes, a second Worker, fixture expected bytes, `BUILD_ID`, payment, and the next z-node.
