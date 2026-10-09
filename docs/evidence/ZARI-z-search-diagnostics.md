# ZARI-z-search-diagnostics evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #92, node z-search-diagnostics, “해 없음·측정 부족·탐색 미완료의 구분”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-search-diagnostics`.
- Observed base SHA: `ccd05227d4f8f7f4d8f6cfbecbe0ac902a734df8` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `docs/SOLVER.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/WORKSPACE_BLUEPRINT.md`; previous node evidence and `docs/adr/SP-z-incremental-replan.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-search-diagnostics and `docs/adr/SP-z-search-diagnostics.md`. This delivery is z-search-diagnostics only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt the accessibility workspace, checkout, cloud, photo consent, capture acceptance, or release.

## What changed

Search diagnosis is a Rust value beside `PlanSnapshot`. Read-model version `zari-search-diagnostics-1`. The activated project input and catalog are the case. The command receives the termination, scope, counters, already published alternatives, and diagnostic candidates. It does not search, rank, or select a plan.

Five classes are always emitted in order: `noProduct`, `geometryOutOfRange`, `undetermined`, `budgetExhausted`, `searchNotFinished`. `noProduct` requires no product-unknown signal, `scopeComplete`, no observations, items present, and no known container. An unknown measurement suppresses `noProduct` even when the catalog is empty. Known oversize in both upright orientations, `no_feasible_anchor`, and `unsupported_geometry` are geometry and still leave `provesImpossible` false. `largerBudgetSuggested` is true only when the budget is exhausted and no alternative was observed. `budgetSuggestionIsProof` is false. Cancel and interrupt are unfinished search, not budget exhaustion and not no product.

Next checks come from `query_next_facts` on the input. `MissingEvidence` rows are omitted. A blocking geometry failure is linked to the fact keys that mention its field paths. The reproduction stores the current rule, schema, and solver versions, the input and its digest, the catalog and its digest, the budget, profile, seed, termination, scope, counters, diagnostic candidates, and compact observations. It does not store a log, session, request id, photo, or duration. `diagnose_case` checks those digests and replays the same class flags.

The command is `diagnoseSearch`. It is a search capability, immediately after `replanIncremental`. `replanIncremental` stays immediately after `comparePareto`. Bootstrap activation is `invalid_state`. No search engine is `operation_not_supported`. A bare payload or an extra field is `invalid_input`. The reply is `searchDiagnosed`.

Generated DTO, schema, and validators were regenerated from Rust. `validators.d.mts` did not change. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live in `crates/core/tests/search_diagnostics.rs`, which `fixture_runner` does not scan.

There is no new Dexie store and no dbVersion change. The page uses the existing project Worker. A finished, cancelled, or interrupted search sends the command once for that input, catalog, termination, counters, reasons, snapshots, and restrictions. `다시 구분` forgets the key and sends again. `진단 취소` bumps the epoch and leaves the selected id. A late reply increments an ignored count and does not select. Export downloads `reply.reproduction` and does not send a command. An input commit and `startSearch` also bump the epoch. Cancel and interrupt do not reuse a previous search scope; the page sends the saved input's profile and budget with empty restrictions.

`docs/product-expansion/contract.json` `searchCapabilities` includes the new name so the engine lock matches the running search list. `baseCapabilities` stays unchanged. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, and `contractChange` stays `NO`. Those fields are the previous node's lock. Live `DB_VERSION` stays 3.

The plan screen shows the panel after the search status and before the alternative cards. Present class rows and outside-model or exhausted support rows use the existing `warning-on-soft` pair (`pareto-held`). Other support rows use the existing `primary-on-subtle` pair (`pareto-diff`). No new contrast case.

## Changed paths

- Adoption: `docs/adr/SP-z-search-diagnostics.md`, `design/DECISIONS.md` (Dz-search-diagnostics), a short z-search-diagnostics note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/search_diagnostics.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`.
- Tests: `crates/core/tests/search_diagnostics.rs`, `crates/core/tests/protocol.rs`, `crates/core/tests/incremental.rs`, `crates/core/tests/pareto.rs`, `apps/web/tests/unit/diagnostics.test.ts`, `apps/web/tests/unit/pareto.test.ts`, `apps/web/tests/browser/search-diagnostics.spec.ts`.
- UI and worker: `apps/web/src/features/diagnostics/controller.ts`, `phrases.ts`, `SearchDiagnosticPanel.tsx`, `apps/web/src/features/project/session.ts`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`searchCapabilities` only).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/SOLVER.md`, `docs/DOMAIN_MODEL.md`, `docs/FRONTEND.md`, `design/SCREENS.md`, `design/WORKSPACE_BLUEPRINT.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Unknown is not asserted as no product | `unknown_measurement_is_not_no_product` clears item-a width, keeps `noProduct` false, sets `undetermined`, and links a fact key that contains `item-a` and `dimensions.envelope.width`. `empty_known_catalog_is_no_product_only_when_the_search_finished` sets `noProduct` only for a finished empty known catalog, and clears it again when that width is unknown. Browser: after clearing 물건 A 폭, `data-undetermined` is `true`, `data-no-product` is `false`, the sentence is 제품이 없다고 단정하지 않습니다, and a next-check fact contains `item-a` and `dimensions.envelope.width` |
| A larger budget is not shown as a proof of impossibility | `a_larger_budget_is_not_an_impossibility_proof` sets `largerBudgetSuggested` true, both proof flags false, and `search_budget` `exhausted`. `provesImpossible` and `budgetSuggestionIsProof` are assigned false in the reply. Phrase tests refuse the proof sentence. Browser success: `data-proves-impossible` and `data-budget-proof` are `false`, and the budget sentence does not say 불가능이 증명되었 or 불가능의 증명입니다 |
| The same case can be reproduced without logs or secrets | `reproduction_replays_the_same_classes_without_logs_or_secrets` replays the class flags through `diagnose_case` and walks JSON keys. Banned keys include `log`, `secret`, `token`, `sessionId`, `requestId`, `photo`, and `workerSessionId`. Browser: Enter on 재현 자료 내보내기 downloads `zari-search-reproduction.json` with `ruleVersion`, `budget`, `catalog`, and `input`, and none of those keys. The export does not send another `diagnoseSearch` |

Also checked, outside those three lines: known oversize is geometry and not a proof; cancel of an empty catalog is unfinished search, not budget and not no product; the capability order ends `replanIncremental`, `diagnoseSearch`; a bare payload and an extra field are `invalid_input`; no engine is `operation_not_supported`. One command per key is `diagnoseOnce`. A newer epoch does not apply. Browser: the held `diagnoseSearch` is released after 진단 취소; `data-state` stays `cancelled`, `data-ignored` becomes `1`, and `data-selected-id` is unchanged.

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1 via `rust-toolchain.toml`. wasm-bindgen was 0.2.128. The worker-state timeout was not raised. The new spec uses `test.setTimeout(180_000)` because the flow includes two real searches, a held reply, and a dimension commit. The Playwright config timeout stays 30s. The panel ready assertions wait up to 90s.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 186 passed, 1 ignored. The new `search_diagnostics` suite is 7 passed. The ignored test is the pre-existing completion-query ignore. Solver search tests 17 passed. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 27 files, 179 tests |
| `npm run build` | exit 0. Vite also printed the existing chunk-size warning. It is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `0ac5181e8dff1380`, 11 assets. Engine `BUILD_ID` stays `zari-domain-7` |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium --workers=2` | exit 1. 76 passed, 19 failed (Playwright 5.9m). After `[WebServer] Terminated`, the 19 failures were `page.goto` `net::ERR_CONNECTION_REFUSED` at `http://127.0.0.1:4175/` and `http://127.0.0.1:4173/`. They are not assertion failures. No `worker-state` flake |
| `npx playwright test apps/web/tests/browser/search-diagnostics.spec.ts --project=chromium --workers=1` | exit 0. 1 passed (23.1s) on the same tree, after the preview was gone |
| `npx playwright test` of `quality.spec.ts`, `responsive.spec.ts`, `spatial-view.spec.ts`, `spatial3d.spec.ts`, `strategy-library.spec.ts`, `workspace.spec.ts` `--project=chromium --workers=1` | exit 0. 25 passed (4.4m). This set contains the other 18 connection-refused tests. `spatial3d` reported `context-lost-console: none` |
| `npx playwright test apps/web/tests/browser/search-diagnostics.spec.ts --project=firefox --workers=1` | exit 0. 1 passed (24.0s) |
| `npx playwright test apps/web/tests/browser/search-diagnostics.spec.ts --project=webkit --workers=1` | exit 0. 1 passed (21.7s) |
| `npm run test:parity` | exit 0. 2 passed (28.5s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

The passing Chromium, Firefox, and WebKit diagnostic runs, and the 25-test remainder, used the preview Playwright started for that command. After those runs the stamp was `http://127.0.0.1:4173`. The config timeout was not raised. `--workers=1` on the remainder is the local RAM limit after the 2-worker preview was terminated. It is not a skipped test and not a timeout change.

## Browser

Route: the existing plan screen. Create a project, fill the sample, commit, open the plan. Chromium, Firefox, and WebKit. Success viewport 1440×1000, then 390×844, then `forcedColors: active`. Enter on 재현 자료 내보내기 downloads the reproduction. Collected `pageerror` and console `error` lists were empty on the passing diagnostic runs. At 390px, `documentElement.scrollWidth` stayed within the viewport.

Empty: before 계산 시작 the panel is `empty` and says the calculation has not started. `diagnoseSearch` calls are 0.

Success: the panel reaches `ready` with read model `zari-search-diagnostics-1`, `data-proves-impossible` `false`, `data-budget-proof` `false`, and `data-no-product` `false`. The support row `rectangular_floor_anchor` is `finiteNotComplete`. The selected id is set. One `diagnoseSearch` postMessage is sent. Export does not send another.

Cancel and late reply: the next postMessage is held. The panel is `pending`. 진단 취소 leaves `cancelled` and the same selected id. Releasing the held message sets `data-ignored` to `1`. The state stays `cancelled`. The call count stays 2.

Failure: 물건 A 폭 is cleared and committed, and the plan is calculated again after the context is `installed`. The panel is `ready`, `data-undetermined` is `true`, `data-no-product` is `false`, both proof flags are `false`, and a next-check fact contains `item-a` and `dimensions.envelope.width`. The call count is 3. The project form has no budget editor, so this browser path does not force `budgetExhausted`. That class is the Rust test above.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new diagnostic cases are outside that manifest. No existing fixture expected bytes changed. The native command test and the capability list agree that `diagnoseSearch` follows `replanIncremental`.

## Contract advisory

`contract_change` for this node is a new search command and capability. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live search capability list gained `diagnoseSearch` after `replanIncremental`. The base capability list did not. This node does not set `implementsNow` true.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- The diagnosis is a search capability, not a base capability. A base-only runtime still ends at `disposeProject`.
- Search ranking is unchanged. The command does not start a search.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2. Live `DB_VERSION` stays 3. `implementsNow` stays false. `contractChange` stays `NO`. `baseCapabilities` stays unchanged. `searchCapabilities` gained the new name.
- The reply is not in exportVersion 1. A portable bundle remains `z-portable-project`. The diagnostic export is a separate download of the reproduction JSON.
- The project form has no budget field. The browser does not drive `budgetExhausted`. The Rust test does.
- Cancel and interrupt have no scope on the wire. The page classifies them with the saved input's profile and budget and an empty restriction list.
- Observations are capped at 8 alternatives, 128 diagnostic candidates, and 256 checks. The sample budget's `maxAlternatives` is 6. Next checks keep 64 links.
- The full Chromium command used `--workers=2`. The preview process was then terminated and 19 navigations were refused. Those specs were run again with `--workers=1` and passed. That is not a timeout change and not a retry of a `worker-state` miss.
- This session did not push. GitHub Actions has not executed this tree.

## Limits

- The accessibility workspace is `z-accessibility-workspace` and is not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.
- The create-project `worker-state` flake did not occur on the passing diagnostic runs or on the 25-test remainder. The 19 refused navigations were a dead preview, not that flake.
- GitHub Actions has not run this working tree. The recorded green suite is the local runs above.

## Out of scope

z-accessibility-workspace and every later z-node. Governance files, source prompts, `SOURCE_MANIFEST.json`, CI workflows, and approved baselines.
