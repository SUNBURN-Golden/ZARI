# ZARI-SPATIAL-016 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. The new screenshots are draft captures. Nothing here is an approved baseline, a physical measurement, a device qualification, or a release.

- Task: GitHub issue #73, node 016, “전체 16단계 제품 qualification·새 화면·완료 인계”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-016`.
- Observed base SHA: `37d2831bbcf696e01d72fb66398b68a4bad14c46` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs read at the plan commit and at this HEAD: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` §§7–9; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/ARCHITECTURE.md`. Previous SP-001–015 evidence and ADRs were read on this HEAD. Candidate and NON_EXECUTABLE drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` D016 and `docs/adr/SP-016-qualification.md`. This delivery is SP-016 only. Fable MILESTONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor.

## What changed

The 16-node denominator is a handoff document, not a runtime API. `docs/qualification/denominator.json` lists 001–016 with the immutable plan commit and the delivery, review, audit, and merge pointers that exist. 001–015 are `MERGED` on `37d2831bbcf696e01d72fb66398b68a4bad14c46`. None is `DONE`. 016 is `IN_PROGRESS` until the supervisor commits. Every node is `qualification_state` `PARTIAL`, `acceptance_state` `PENDING`, and `release_state` `NOT_AUTHORIZED`. Review and audit pointers are null. A merged development node does not certify physical facts, a phone, a discrete GPU, current commercial readiness, user acceptance, or release.

The fresh path is a real Worker and IndexedDB journey. It commits the sample with no owned bin and reads a no-purchase plan that places Winter coats directly. It then commits the wide-bin copy `reuse-bin` and reads a reuse plan. It then commits the 20L copy `shelf-bin` in a wider compartment, with the saved group set to `allowMultipleTargets`, and reads a mixed plan that places the owned bin and a purchased bin. After that it edits, refuses a stale accept, searches again, accepts, records one guide step, reloads, refuses a quota write without clearing the step, and interrupts a search without replacing the snapshot. Unknown checks stay unknown when a step is marked done.

New Chromium drafts under `design/baselines/draft/zari016/` cover no-purchase, reuse, mixed purchase, a blocked unknown guide, keyboard, IME, 200% zoom, forced colors, a historical rule, a save CAS conflict, a stale guide, and an interrupted search, at 1440 and 390 where the set requires both. Approved capture count stays 0. These drafts do not inherit SP-007 or SP-011 acceptance. `node scripts/check-baseline-manifest.mjs` reported `approved 0; drafts 99; zari007 47; zari011 26; zari016 21`.

`BUILD_ID` stays `zari-domain-7`. `ruleVersion` stays `zari-domain-v2`. Schema version 1, canonical version 1, DB version 2, commands, and capabilities stay. There is no migration, no new route, and no qualification API in `apps/web/src` or `crates`.

`contract_change=NO`. Generated DTO, schema, and validators were not regenerated. `npm run contracts:check` matched Rust. Executable fixture bytes were not edited.

## Changed paths

- Adoption: `docs/adr/SP-016-qualification.md`, `design/DECISIONS.md` (D016), a short SP-016 note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Handoff projection: `docs/qualification/denominator.json`, `docs/qualification/SP-016-HANDOFF.md`, `scripts/check-qualification.mjs`, `apps/web/tests/unit/qualification.test.ts`.
- Fresh path and capture: `apps/web/tests/browser/product-setup.ts`, `product-completion.spec.ts`, `capture-product.ts`, `product-capture.spec.ts`.
- Draft registration: `design/baselines/draft/zari016/` (21 PNG files and `a11y-snapshot.json`), `design/baselines/manifest.json`, `design/baselines/README.md`, `scripts/check-baseline-manifest.mjs`, `apps/web/tests/unit/baseline-manifest.test.ts`.
- Contract text: `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`, `docs/SPATIAL_VERIFICATION.md`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

No new dependency. `Cargo.lock` was not edited. No Rust source change. No `apps/web/src` change. No new color token. `fixtures/` has no diff. `docs/evidence/ZARI-SPATIAL-001-*.png` did not change. Checkout was not required.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Denominator 16 = 7 + 4 + 5, plan commit on every node, no predecessor omitted or called DONE | `scripts/check-qualification.mjs` and `qualification.test.ts`. 001–015 `MERGED`, 016 `IN_PROGRESS`, review and audit pointers null |
| `node_state`, `qualification_state`, `acceptance_state`, and `release_state` stay separate and are not a runtime API | The checker walks `apps/web/src` and `crates` for `qualification_state` and `docs/qualification/denominator` and reports runtime hits 0 |
| A merged node does not certify facts, device, acceptance, or release | Ledger values stay `PARTIAL` / `PENDING` / `NOT_AUTHORIZED`. Required gaps name phone, discrete GPU, new-capture acceptance, release, and the two reviews |
| Fresh path: facts, strategy, direct / owned / new, edit, blocked accept, save, reload, recover | `product-completion.spec.ts` on Chromium, Firefox, and WebKit. Full Chromium suite includes the existing PC, MC, portable, edit, progress, and parity specs |
| Unknown is not turned into pass by marking a step done | The journey counts unknown checks before and after Space on the first enabled checkbox |
| Quota failure keeps the done row and offers export | The journey injects `QuotaExceededError` and expects `persistence_failed` plus `action-export` |
| Interrupted search keeps the accepted snapshot | The journey and the capture busy-loop the worker and expect `data-search="interrupted"` |
| New guide, condition, conflict, stale, and recovery screens do not inherit SP-007/011 | `spatialDraft016.doesNotInheritAcceptance` is `zari007,zari011`. Approved count stays 0. Capture status stays `PENDING` |
| Same HEAD runs Rust, generated contracts, web, build, three-browser parity, and benches | Commands below. Firefox and WebKit ran the new journey. Capture stays Chromium-only, as SP-011 did |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. Host: Linux 6.12.94+, 8 CPUs, 15 GiB RAM. Browser commands used `--workers=1`.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0. Dev compile finished in 24.77s. No warning output |
| `cargo test --workspace --locked` | exit 0. 134 passed, 1 ignored. core lib 37, bootstrap 9, completion query 12 passed and 1 ignored, domain 11, edit 6, guide oracle 7, product completion contract 7, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0. 28 JSON results |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0. 124 JSON results. `fixtures/manifest.json` is not a runner case. `git diff --stat -- fixtures` was empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128. Release compile 0.03s (already built) |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generate step |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 19 files, 145 tests |
| `npm run build` | exit 0. Vite production. wasm gzip 940.81 kB. The pre-existing chunk-size warning is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `4f78ff9f83b36d6b`, 11 assets, spatial raw 576505 bytes, spatial gzip 143560 bytes |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 72 base tokens; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-baseline-manifest.mjs` | exit 0. `approved 0; drafts 99; zari007 47; zari011 26; zari016 21` |
| `node scripts/check-qualification.mjs` | exit 0. `denominator 16=7+4+5; merged 15; in-progress 1; capture PENDING; release NOT_AUTHORIZED; runtime hits 0` |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 84 passed (11.1m). No `worker-state` flake. Timeouts were not raised |
| `npm run test:parity` | exit 0. 2 passed (22.8s). “124 shared fixtures.” |
| Firefox, `product-completion.spec.ts` | 1 passed (1.6m) |
| WebKit, `product-completion.spec.ts` | 1 passed (1.5m) |
| `npm run bench:browser -- --project=chromium --workers=1` | exit 0. 15 passed (5.9m). Cold sample count 20 and warm count 50 were the script defaults. Thresholds were not edited |

Bench log on this host, desktop profile, phone unmeasured: wasmTransferCompile p95 272.50ms (target 1000), normalization 13.20ms (20), searchStep 0.60ms (8), messagingResidual 33.40ms (10, logged exceeded at `bench-search-cancel/activateProject`), serialization 7.10ms (20), cancelAck 0.50ms (100), draftTransaction 4.30ms (50), snapshotSaveReload 29.90ms (200), projectionSource 4.10ms (20), first3dReady 464.00ms (1000), spatialGzip 140.80 KiB (250). The stage test records those rows and asserts the browser name. It does not fail the process on the residual row.

## Browser

Routes: project list, catalog `#/catalog`, project editor, plan, and the accepted guide. The full Chromium suite also covers the existing probe, portable, progress, plan, measurement, and spatial flows. The new journey sets 1440×1000 and 390×844, checks no horizontal overflow at 390, forced colors, and 200% zoom. Console errors other than worker timeout, worker crash, worker unavailable, search stalled, and the injected quota error fail the journey. Requests off localhost fail it.

Capture command actually run, after `npm run test:build` had produced the test bundle: `ZARI_CAPTURE_DIR=/tmp/zari016-capture npx playwright test apps/web/tests/browser/product-capture.spec.ts --project=chromium --workers=1`. Exit 0. The older zari001, zari007, and zari011 specs were not re-run. Their registered hashes still match. `product-capture.spec.ts` refuses a non-Chromium project, matching SP-011.

Each of the 21 PNGs was inspected. They show, in order: no-purchase copy “구매 없이 정리됩니다” with Winter coats; `reuse-bin #1`; a BOM with a priced 20L line and an owned line marked 해당 없음; an accepted guide whose unknown checks say completion does not change the check; keyboard focus on the guide; width text `901ㄱ`; the guide at 200% zoom; forced-colors outlines at 1440 and 390; “이전 규칙의 계획은 완료를 기록하지 않습니다.”; the second-tab conflict notice; “입력이 바뀐 기록입니다.”; and “중단되었습니다. 이전 계획과 입력은 그대로입니다.” Source commit on every entry is `37d2831bbcf696e01d72fb66398b68a4bad14c46`. `sourceDirty` is true because the test and document tree was dirty. GPU renderer is SwiftShader. The note says “Not a discrete GPU”. Locale `ko-KR`, theme light, reduced motion, `durationFast` `0s`, `deviceScaleFactor` 1, `fullPage` false.

The capture observation `worker-failed during interrupt` was false. The interrupted shots show the search-status sentence. The journey still clicks `worker-retry` when that panel is visible.

## Parity

`npm run test:parity`: native fixture runner and the Chromium Worker agreed on 124 shared fixtures. Exit 0.

## Known limits

- Physical phone: UNVERIFIED. 390×844 is Playwright viewport emulation.
- Discrete GPU: UNVERIFIED. Headless WebGL is SwiftShader. GPU timestamps were not taken.
- New `zari016` capture acceptance: PENDING until a durable exact-set user decision. Release: NOT_AUTHORIZED.
- 016 review and audit pointers are null. This file does not claim those reviews.
- The sample group is `oneTarget`, and the sample compartment cannot hold the wide bin and the 20L bin together. The fresh path therefore uses three committed searches. The mixed commit widens the saved draft (split policy, candidate cap, interior, floor, and opening) because the product has no split-policy control. Rust still chooses the alternatives.
- On the large accepted snapshot the eligibility read can stay pending inside the worker timeout. The historical capture then enables the step checkbox in the page and clicks it. The repository returns `historical_rule`. The sentence on the screenshot is that refusal.
- `messagingResidual` p95 was above its logged 10ms target on this host. The bench suite still exited 0. Thresholds were not changed.
- The known create-project `worker-state` flake did not appear in these runs.

## Contract-change advisory

`contract_change=NO`. No schema, command, capability, migration, or generated-contract change.

## Out of scope

The next program node. Runtime dispatch, host activation, fact confirmation, safety certification, accounts, providers, payment, upload, and release. Editing preserved prompts, `SOURCE_MANIFEST.json`, `.aiops/**`, or `docs/aiops/**`.
