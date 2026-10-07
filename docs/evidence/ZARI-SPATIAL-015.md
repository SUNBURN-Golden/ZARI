# ZARI-SPATIAL-015 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was kept as evidence. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #71, node 015, “실측·offer·보유품·역사 계획·저장 복구 전체 lifecycle”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-015`.
- Observed base SHA: `d2de86d5c0ebf1df6e3db382049142c30df76a59` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs read at the plan commit and at this HEAD: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` §6; `docs/DOMAIN_MODEL.md`; `docs/SOLVER.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/ARCHITECTURE.md`. Previous SP-001–014 evidence and the SP-012, SP-013, and SP-014 ADRs were read on this HEAD. Candidate and NON_EXECUTABLE drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` D015 and `docs/adr/SP-015-lifecycle.md`. This delivery is SP-015 only. Fable MILESTONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor.

## What changed

Semantic fact and evidence edits leave the accepted plan stale. A normalize result with diagnostics stores the raw draft and does not replace the previous normalized input or its digest. Progress writes refuse a newer stored draft generation and a synchronous in-memory fence that is false. The worker call stays outside the transaction. The previous done row stays. A newly accepted binding starts with no carried progress.

Catalogue and offer changes do not rewrite an old snapshot. The offer list on a plan is that snapshot's `referencedCatalog`. The same catalog digest with a different body is refused. An empty catalogue is `sourceKind` `imported` with origin `empty-real`. It stores no products, variants, or offers. Owned-library edits do not rewrite a project copy until the explicit apply control. Unknown availability still allocates no confirmed units. A duplicate does not reserve owned stock and does not copy another project's reservation.

`duplicateVerifiedProject` calls `verifyRecord` for the input, the accepted snapshot, and the pinned catalog, then `commitDuplicate` inserts one new project. The insert does not call the worker, does not copy action progress, and does not copy photo bytes. The screen says how many photos were left behind. A tampered digest writes nothing.

Save quota keeps the previous done row and offers export. A stored `zari-domain-v1` rule stays readable, is not completable, and is not rewritten. A cancel timeout, a stall, or a failed worker drops the search activation. The next search waits for a fresh activation. A cooperative cancel keeps the lease.

`BUILD_ID` stays `zari-domain-7`. `ruleVersion` stays `zari-domain-v2`. Schema version 1, canonical version 1, DB version 2, commands, and capabilities stay. There is no migration and no new `CatalogSourceKind`.

`contract_change=NO`. Generated DTO, schema, and validators were not regenerated. `npm run contracts:check` matched Rust. Executable fixture bytes were not edited. Hand oracles under `docs/oracles/product-completion/` were not rewritten.

## Changed paths

- Adoption: `docs/adr/SP-015-lifecycle.md`, `design/DECISIONS.md` (D015), a short SP-015 note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Web: `apps/web/src/persistence/repository.ts` (draft fence, catalog body mismatch, duplicate stage and commit); `apps/web/src/features/project/transfer.ts` (`duplicateVerifiedProject`); `apps/web/src/features/project/session.ts` (invalid draft, progress fence, search lease); `apps/web/src/features/catalog/manager.ts` (`stageEmpty`); `apps/web/src/app/CatalogScreen.tsx`, `ProjectsScreen.tsx`, `ProjectScreen.tsx`, `PlanScreen.tsx`; `apps/web/src/features/workspace/StepFocus.tsx`.
- Tests: `apps/web/tests/unit/transfer.test.ts`, `catalogOwned.test.ts`, `repository.test.ts`; `apps/web/tests/browser/lifecycle.spec.ts` (new).
- Contract text: `docs/PERSISTENCE.md` §10, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

No new dependency. `Cargo.lock` was not edited. No Rust source change. No new color token. `fixtures/` has no diff. `docs/evidence/ZARI-SPATIAL-001-*.png` did not change. Checkout was not required.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| PC-08 dirty draft, accept switch, two-tab, stamp | Existing `progress.spec.ts` still passes in the full Chromium suite. New unit `a dirty fence and a newer draft refuse the progress write` refuses `holds: () => false` and a newer draft generation and leaves the saved done row |
| PC-09 evidence after partial progress; new binding carry 0; old quote not rewritten | Chromium, Firefox, and WebKit `lifecycle.spec.ts` evidence test: a width note shows `progress-stale`, the next accepted guide has zero checked boxes, and IndexedDB still has the old done row. Offer choices use `referencedCatalog`. `an empty catalogue keeps a Rust digest and no offers` refuses a different body under the same digest |
| PC-01 empty catalogue, direct / no purchase | `save-empty-catalog` shows “상품 없는 카탈로그” and the note that no seller was invented. The unit test expects zero products, variants, and offers and a 64-hex digest. Existing no-purchase solver and plan coverage still passes |
| PC-02 owned quantity and pack edges | Existing solver and catalog tests still pass. The project screen states that unknown availability is not used as confirmed units and that library edits apply only through the explicit button |
| PC-10 old rule readable and not completable; mixed page/worker/build fail closed | `lifecycle.spec.ts` writes `ruleVersion` `zari-domain-v1` into IndexedDB, reloads, blocks completion, and reads the same version back. Existing `portable.spec.ts` incomplete staged update still passes in the full suite |
| PC-11 quota, duplicate, import/export, no phantom save | Quota injection keeps the checked step and shows `action-export` with `persistence_failed`. Duplicate keyboard activation shows the photo and stock disclosure. Unit tests verify before insert, reject a tampered digest with no second project, and count zero worker messages inside `commitDuplicate`. Existing import coverage in `portable.spec.ts` still passes |
| Invalid raw draft does not replace a good digest | `a null digest commit keeps the previous normalized digest and stores the raw draft` |
| No worker wait inside the duplicate transaction | The transfer unit test records port messages around `commitDuplicate` and expects no new message |
| Existing portable, edit, progress, quantity, pack, and seller-shipping oracles | Full `cargo test`, fixture runner, and Chromium suite stayed green. Oracle JSON files were not edited |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. Browser commands used `--workers=1`.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0, first step of the Rust chain |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0. Dev compile in that chain finished in 26.63s. No warning output |
| `cargo test --workspace --locked -- --test-threads=8` | exit 0 inside the 323.6s chain. 134 passed, 1 ignored. core lib 37, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, product completion contract 7, protocol 17, validator 11, search 17 (194.39s). Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0. 28 JSON results, `boundary-contact` through `zero-row-unknown-unit` |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0 in that chain. The terminal log truncated the result JSON. `npm run test:parity` ran the same runner again and reported 124 shared fixtures. `fixtures/` contains 125 JSON files; `fixtures/manifest.json` is not a runner case. `git diff --stat -- fixtures` was empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0, rerun after the chain because the chain log truncated before this print. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128. Release compile in the web chain was 0.04s (already built) |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generate step. No contract diff |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 18 files, 144 tests (184.58s) |
| `npm run build` | exit 0. Vite production. wasm gzip 940.81 kB. The pre-existing chunk-size warning is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `4f78ff9f83b36d6b`, 11 assets, spatial raw 576505 bytes, spatial gzip 143560 bytes |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 72 base tokens; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0 on the final tree. 83 passed (10.4m). No `worker-state` flake. Timeouts were not raised |
| `npm run test:parity` | exit 0. 2 passed (25.5s). “124 shared fixtures.” |
| Firefox, `lifecycle.spec.ts` | 4 passed |
| WebKit, `lifecycle.spec.ts` | 4 passed. Combined Firefox and WebKit run was 8 passed (2.4m). The known create-project `worker-state` flake did not appear |

## Browser

Routes exercised: project list `#/projects`, project editor, plan, catalog `#/catalog`, and the accepted guide. The full Chromium suite also covers the existing probe, portable, progress, plan, and spatial flows. Default Chromium viewport is 1440×1000.

`lifecycle.spec.ts` on the final tree:

| Flow | Device / checks | Result in the full Chromium suite |
|---|---|---|
| Evidence note after a done step, recompute, accept | 1440×1000. Collected `pageerror` and console `error` empty. Requests whose host was not `127.0.0.1` or `localhost` empty | 30.4s passed |
| Quota on the second progress write | 390×844. Error text contains `persistence_failed`. Export control visible. The same checkbox stays checked | 15.9s passed |
| Duplicate | 390×844, `forcedColors: active`, button “복제” activated with Enter. Copy notice and owned-copy note visible. Console errors empty. No non-local request | 1.2s passed |
| Empty catalogue and historical rule | 1440×1000. Catalogue list shows “상품 없는 카탈로그”. After reload the stored `ruleVersion` is still `zari-domain-v1` and completion is blocked. Console errors empty. No non-local request | 19.1s passed |

An earlier Chromium run of this spec, before the locators were corrected, was 3 failed and 1 passed. The failures were the detail group not opened, the quota assertion matching `action-error` because its id starts with `action-`, and Enter sent through `page.keyboard` after a separate `focus()`. The app behavior in the quota snapshot already showed the checked box, `persistence_failed:quota`, and the export button. Timeouts were not raised. The corrected spec then passed 4 Chromium, 4 Firefox, and 4 WebKit before the full suite, and again inside the full Chromium suite.

No SP-015 screenshot was captured for evidence. Playwright attachments under `test-results/` are DRAFT tool output and are not an approved baseline.

`docs/evidence/ZARI-SPATIAL-001-*.png` did not change in the worktree.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native fixture runner and actual Chromium Worker/WASM agreed on the same 124 fixtures. Those fixtures were not edited.

## Contract-change advisory

`contract_change=NO`. `BUILD_ID` stays `zari-domain-7`. `ruleVersion` stays `zari-domain-v2`. No new command, capability, schema version, or database version. Generated contracts were not rewritten and `contracts:check` matched. Executable fixture envelopes, digests, and ids were not edited.

## Deviations

`cargo test` added `--test-threads=8`. The full workspace still ran. Browser commands used `--workers=1` because this machine's RAM is shared. CI's script does not set a worker count.

The Rust chain's terminal log truncated the full `fixtures` JSON line, so the 124 count is taken from the later `npm run test:parity` run of the same runner, which exited 0. `cargo tree` was printed by a separate exit-0 run after that truncation.

Firefox and WebKit used the test-mode dist from `vite build --mode test` that the first lifecycle Chromium run had already produced. The spec did not change after that Firefox/WebKit run. The full Chromium suite and `test:parity` each ran `test:build` again.

An empty catalogue uses the existing `imported` source kind plus origin `empty-real`. A new enum value would have been a contract change.

## Known limits

Repository unit tests use `fake-indexeddb`. They do not replace the Chromium IndexedDB flows above. Phone qualification remains missing. Discrete GPU is UNVERIFIED.

A cooperative cancel keeps the activation lease. Only a cancel timeout, a stall, or a failed worker requires a new activation. The existing plan and session tests still pass on that split.

The hand oracle `pc-10.json` still records the historical sentence `zari-domain-v1`. It was not rewritten. Production rule version remains `zari-domain-v2` from SP-013.

## Out of scope

SP-016 capture, schema or database migration, a new optimizer, checkout, a provider, a live catalogue fetch, a global stock reservation, approved baselines, source prompts, `SOURCE_MANIFEST.json`, and edits under `.aiops/` or `docs/aiops/`.
