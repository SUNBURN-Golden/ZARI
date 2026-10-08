# ZARI-z-pareto-comparison evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots taken while a browser assertion was still failing were local Playwright attachments and were not kept as a baseline. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #88, node z-pareto-comparison, “비용·재사용·접근·불확실성 대안 비교”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-pareto-comparison`.
- Observed base SHA: `094367b3d18b799c0a5c7a01a5f3e9f34a0bd907` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/SOLVER.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/WORKSPACE_BLUEPRINT.md`; previous node evidence and `docs/adr/SP-z-strategy-library.md`, `docs/adr/SP-z-offer-bundles.md`, `docs/adr/SP-z-product-contract.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-pareto-comparison and `docs/adr/SP-z-pareto-comparison.md`. This delivery is z-pareto-comparison only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt incremental replan, checkout, cloud, photo consent, capture acceptance, or release.

## What changed

Alternative comparison is a Rust value beside `PlanSnapshot`. Read-model version `zari-pareto-1`. The same input digest, budget, seed, and saved strategy are one comparison. A mismatch leaves the front empty and sets `recalculationRequired`. `globalOptimum` is always false. `budgetExhausted` is labeled `budgetLimited`.

A physical rejection or a blocking fail is excluded as `hard_constraint` before dominance. A lower purchase cost does not put it back. Unknown purchase, unknown preceding moves, and unknown quantities do not compare as zero and do not dominate. No-purchase compares as zero and is displayed as 구매 없음, distinct from a known zero and from 미확인. Ties stay. Display order is unassigned, unknown-quantity items, unknown checks, known preceding moves, known purchase, higher reuse, then snapshot id. Unknown moves sort after known moves. A stored blocker count on an unknown access check is not used. Reuse is the sum of BOM `reused`, or the owned-container placement count when the BOM is empty.

`decision.rs` and `rank_key` are unchanged. The reply is not part of a PlanSnapshot hash and does not publish a snapshot.

The command is `comparePareto`. It is a search capability, immediately after `cancelSearch`. `evaluateStrategyLibrary` stays immediately after `proposeStrategies` and immediately before `startSearch`. Bootstrap activation is `invalid_state`. No search engine is `operation_not_supported`. A bare payload is `invalid_input`. The reply is `paretoCompared`.

Generated DTO, schema, and validators were regenerated from Rust. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live in `crates/core/tests/pareto.rs`, which `fixture_runner` does not scan.

There is no new Dexie store and no dbVersion change. The page uses the existing project Worker. One saved input, goal, termination, and snapshot list sends the command once. A failed read is dropped and is not sent again until the person asks. A draft strategy radio does not send it. `이 목표로 다시 계산` commits a different goal through the existing input commit and then starts the existing search. An ordinary commit does not start a search.

`docs/product-expansion/contract.json` `searchCapabilities` includes the new name so the engine lock matches the running search list. `baseCapabilities` stays unchanged. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, and `contractChange` stays `NO`. Those fields are the previous node's lock. Live `DB_VERSION` stays 3.

The plan screen shows the comparison after the alternative cards. Difference cells say 다름 on the existing `primary-on-subtle` pair. Exclusions use the existing `warning-on-soft` pair. The table scrolls inside the page.

## Changed paths

- Adoption: `docs/adr/SP-z-pareto-comparison.md`, `design/DECISIONS.md` (Dz-pareto-comparison), a short z-pareto-comparison note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/pareto.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`.
- Tests: `crates/core/tests/pareto.rs`, `crates/core/tests/protocol.rs`, `apps/web/tests/unit/pareto.test.ts`, `apps/web/tests/browser/pareto-comparison.spec.ts`.
- UI and worker: `apps/web/src/features/pareto/controller.ts`, `phrases.ts`, `ParetoPanel.tsx`, `apps/web/src/features/project/session.ts`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`searchCapabilities` only).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/DOMAIN_MODEL.md`, `docs/SOLVER.md`, `docs/PERSISTENCE.md`, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`, `docs/ARCHITECTURE.md`, `design/SCREENS.md`, `design/WORKSPACE_BLUEPRINT.md`, `README.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case. Colors reuse `primary-on-subtle` and `warning-on-soft`.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| A cheaper plan that breaks a hard constraint is excluded | `cheaper_hard_constraint_is_excluded_and_unknown_cost_is_not_zero`. The cost-100 hard failure is `hard_constraint` and is not on the front. Unknown cost stays `unknown` |
| Identical seed and budget keep one native and WASM order | The same test's front is hex 2, 5, 3, 6. `command_matches_the_function_and_does_not_publish` matches that order on the native runtime. `pareto.test.ts` activates the same fixture through the WASM runtime and expects the same ids. `same_seed_and_budget_keep_one_order_and_exhausted_budget_is_not_optimal` repeats the order for another seed |
| An exhausted search budget is not a global optimum | The same test: `global_optimum` is false and optimality is `budgetLimited`, including an empty alternative list. Unit phrases refuse `전역 최적해입니다`. Browser: `data-global-optimum` is `false` and the sentence is not `전역 최적해입니다` |
| Purchase, reuse, preceding moves, unassigned, and unknown are the real values | Rust axes in `pareto.rs`. Unknown moves are not a stored blocker count (`unknown_moves_are_not_zero_and_a_missing_count_sorts_after_known`). No-purchase is not unknown (`reuse_comes_from_bom_or_owned_placements_and_no_purchase_is_not_unknown`). Browser cells expose `data-money` and `data-moves`. Unknown money text is 미확인 and does not contain ₩ |
| A supported goal change is connected to recalculation | `goal_change_asks_for_recalculation_and_duplicate_ids_fail` returns an empty front and `recalculation_required`. Browser: a draft radio does not add a `comparePareto` call. `이 목표로 다시 계산` commits `oneActionAccess` and the search status becomes `running`. The comparison call stays 1 while that search is running |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. The worker-state timeout was not raised. The Pareto spec uses `test.setTimeout(90_000)`, the same allowance other search specs already use, because the flow includes a real search.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 172 passed, 1 ignored. core lib 37, bootstrap 9, catalog provenance 7, completion query 12 passed and 1 ignored, domain 11, edit 6, guide oracle 7, inventory lifecycle 7, offer bundles 8, pareto 6, product completion contract 7, product expansion contract 4, protocol 17, strategy library 6, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 25 files, 171 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `fdf567c7113bb8e8`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium` | First run exit 1: 24 failed, 69 passed. The Pareto spec waited for a second search inside the 30s default and the preview then refused connections (`net::ERR_CONNECTION_REFUSED` at `127.0.0.1:4176`). After the spec stopped waiting for that second search, the rerun exit 0: 93 passed, 4 workers (Playwright 3.9m). 4173 and 4174 were already listening. No `worker-state` flake on the passing run. `spatial3d` reported `context-lost-console: none` |
| `npx playwright test apps/web/tests/browser/pareto-comparison.spec.ts --project=firefox` and `--project=webkit` | exit 0. Firefox 1 passed (18.2s), WebKit 1 passed (16.1s), on the `vite build --mode test` output from the Chromium run |
| `npm run test:parity` | exit 0. 2 passed. “124 shared fixtures.” |

## Browser

Route: the existing plan screen after creating a project, filling the sample, and committing it. Chromium, Firefox, and WebKit. Success viewport 1440×1000, then 390×844, then `forcedColors: active`, then back to 1440 for the goal control. Enter on the first condition button opens and closes the detail row. Collected `pageerror` and console `error` lists were empty on the passing run. At 390px, `documentElement.scrollWidth` stayed within the viewport.

Success: after `계산 시작`, the panel reaches `ready` with `data-global-optimum` `false`. The optimality sentence is the scope or budget sentence and is not `전역 최적해입니다`. Purchase, reuse, and preceding-move cells are visible. Selecting the first front row marks that row selected and does not send another command. Unknown money cells, when present, read 미확인 and do not contain ₩. One `comparePareto` postMessage is sent for that search.

Failure covered in the same flow: choosing 한 동작 접근 shows the held notice, keeps `data-global-optimum` `false`, and does not send another comparison. `이 목표로 다시 계산` moves the strategy-library pin to `oneActionAccess` and sets `data-search` to `running`. The comparison count stays 1 while that search is running. The sample budget is `maxWorkUnits` `200000`. A one-action search was still running at 11,178 work units when an earlier assertion waited for it inside the 30s default, so the passing browser assertion does not wait for that second search to finish.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new Pareto cases are outside that manifest. No existing fixture expected bytes changed. The WASM unit test and the native command test agree on the painted front order hex 2, 5, 3, 6.

## Contract advisory

`contract_change` for this node is a new search command and capability. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live search capability list gained `comparePareto` after `cancelSearch`. The base capability list did not.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- The comparison is a search capability, not a base capability. A base-only runtime still ends at `disposeProject`.
- Search ranking is unchanged. Pareto is a read model over snapshots the search already published. Hard failures that search never publishes are still excluded when a caller passes them to `comparePareto`.
- The browser does not wait for the second sample search to finish. That search uses the sample budget of 200,000 work units. The button's connection is the commit plus `startSearch`. The comparison is requested when that search completes.
- `docs/WASM_PROTOCOL.md` keeps the z-product-contract sentence that search capabilities were four names, and the strategy-library sentence that `evaluateStrategyLibrary` sits immediately before `startSearch`. Section 11 records `comparePareto` after `cancelSearch`.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2. Live `DB_VERSION` stays 3. `implementsNow` stays false. `contractChange` stays `NO`. `baseCapabilities` stays unchanged. `searchCapabilities` gained the new name.
- The Pareto reply is not in exportVersion 1. A portable bundle remains `z-portable-project`.
- The disk on this machine was full before the first compile. Stale `target/` directories under sibling review worktrees were removed so this tree could compile. Those directories are build caches outside this repository. Source trees were not edited.

## Limits

- Later z-nodes, incremental replan, checkout, live seller stock, cloud, accounts, photo consent, capture acceptance, and release are not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.
- The create-project `worker-state` flake did not occur on the passing Chromium run. The first Chromium run failed for the reason in the command table, not for that flake.

## Out of scope

z-incremental-replan and every later z-node. Governance files, source prompts, `SOURCE_MANIFEST.json`, CI workflows, and approved baselines.
