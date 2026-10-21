# ZARI-z-local-delivery evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, a device qualification, or a release.

- Task: GitHub issue #118, node z-local-delivery, "설치·업데이트·사용 안내와 로컬 제품 인계".
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`. Branch `astra/zari-z-local-delivery`.
- Pinned task document: `.aiops/program.json` node `z-local-delivery`; common contract `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2. Context at that pin: MASTER_PROMPT §§7–14/24, RUST_ADDENDUM, BLUEPRINT, MEASUREMENT_COMPLETION_DESIGN_KO, PRODUCT_COMPLETION_EVOLUTION_KO, SPATIAL_INTERACTION_PLAN, SPATIAL_VIEW_CONTRACT, SPATIAL_VERIFICATION, AIOPS_SPATIAL_HANDOFF, DOMAIN_MODEL, WASM_PROTOCOL, PERSISTENCE, ARCHITECTURE, TEST_STRATEGY, DESIGN, design/DECISIONS and design/SPATIAL_WORKSPACE. The named `docs/aiops/` delegation/registration/expansion/draft/pending documents remain reference-only; no candidate or runtime activation is inferred. Current implementation and prior-node evidence/ADRs, especially z-product-qualification, supply the already-delivered capabilities reused here.
- Observed base SHA: `3e76e96512a50cd13167587d7539d38454501813` (origin/main at branch creation).
- Adoption: JunTae Park (준태), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `docs/adr/SP-z-local-delivery.md`, `design/DECISIONS.md` Dz-local-delivery, and z-local-delivery-only notes in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` and `design/SPATIAL_WORKSPACE.md`. Fable NONE / A2 replaced by two independent reviews; merge delegated to the supervisor. `.aiops/**`, `docs/aiops/**`, `.github/workflows`, `SOURCE_MANIFEST.json`, `fixtures/` untouched.
- `contract_change=NO`. No Rust, protocol, capability, schema, `DB_VERSION`, `SCHEMA_VERSION`, `exportVersion`, `BUILD_ID`, fixture, or generated-contract change. Host-side changes: repository first-access reads and queued writes share a compatibility check; `ZariDb` bounds native opens before Dexie reconciliation, including concurrent peer upgrades; incompatible storage is latched closed and compatibility reports from the latch; App distinguishes peer-upgrade and stored-newer reload prompts; ProjectsScreen disables incompatible-storage mutations and reads failures through `describeStoreFailure`.

## What changed

`docs/delivery/LOCAL_DELIVERY.md` organizes the supported browsers/devices, build, app-shell update (SW staged→promoted at navigation, previous build kept, `builtAt` downgrade guard), IndexedDB migration path (v1→v6 journals), failure table, the existing-data upgrade result, inspection commands, and the real scope vs long-term unimplemented split. `docs/delivery/release-candidate/` is the release-candidate bundle: `manifest.json` (pins, storage versions, supported targets, required gaps, observed dist digests; `releaseState NOT_AUTHORIZED`, `sourceCommit` left null for the delivery PR) plus `index.md`. `scripts/check-release-candidate.mjs` verifies the manifest against repo pins and, with `--dist`, against a fresh build. The z denominator keeps all 21 nodes tracked: z-product-qualification is MERGED (PR 117), z-local-delivery is IN_PROGRESS, review BLOCKED.

## Changed paths

- App/storage: `apps/web/src/app/App.tsx`, `apps/web/src/app/ProjectsScreen.tsx`, `apps/web/src/persistence/repository.ts`, `apps/web/src/persistence/db.ts` (native-open boundary; version/store declarations unchanged).
- Tests: `apps/web/tests/browser/local-delivery.spec.ts`, `apps/web/tests/unit/localDelivery.test.ts`, `apps/web/tests/unit/zQualification.test.ts` (ledger state update).
- Delivery: `docs/delivery/LOCAL_DELIVERY.md`, `docs/delivery/release-candidate/manifest.json`, `docs/delivery/release-candidate/index.md`, `scripts/check-release-candidate.mjs`.
- Ledger: `docs/qualification/z-denominator.json`, `scripts/check-z-denominator.mjs`.
- Records: `docs/adr/SP-z-local-delivery.md`, `design/DECISIONS.md`, `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, `design/SPATIAL_WORKSPACE.md`, `docs/PERSISTENCE.md` §22, `docs/FRONTEND.md` §24, `docs/IMPLEMENTATION_STATUS.md`, this file.

## Acceptance mapping

| Spec item | Where |
|---|---|
| 지원 브라우저/기기·빌드·업데이트·저장 migration 경로 정리 | `LOCAL_DELIVERY.md` §§1–4; migration §3.2 + failure table §4 |
| 처음 설치와 기존 데이터 업데이트 확인 | `local-delivery.spec.ts` named fresh-install / existing-data-upgrade cases (real browser) + `localDelivery.test.ts` (fresh DB, versionchange) + reuse of `repository.test.ts`/`transfer.test.ts` v1/v2 migration cases |
| 장기 미구현과 실제 출시 범위 구분 | `LOCAL_DELIVERY.md` §7, `manifest.json` supportedTargets/requiredGaps, `z-denominator.json` |
| 로컬 설치/검수 안내와 release candidate 묶음 | `docs/delivery/` + `check-release-candidate.mjs` |
| 기존 데이터 업그레이드 결과 | `LOCAL_DELIVERY.md` §5 + named upgrade/refusal/blocked/race browser cases |
| 업데이트 실패로 데이터가 지워지지 않는다 | named newer-DB refusal / blocked-upgrade / direct-data-route / native-open race browser cases; unit read-first/write-first and four deterministic open-boundary interleavings |
| 16단계 기준+확장 범위 추적 | `denominator.json` 16 + `z-denominator.json` 21, `check-z-denominator.mjs` |
| 공개 배포·화면 채택·release 별도 근거 표시 | manifest/ledger `NOT_AUTHORIZED`·`PENDING`·`UNQUALIFIED`; `sourceCommit` null |
| versionchange reload prompt (PERSISTENCE §6) | `App.tsx` wiring + upgrade/refusal/race cases asserting `db-version-notice` |
| This app's upgrade blocked by an old tab (PERSISTENCE §6) | two requester-side real-IDB browser cases on `/` and `/#/data`: accessible recovery notice, disabled creation while waiting, v1 version/store/row preservation, and v1→v6 continuation after closing the peer |

## Fix round 3 — 2026-10-21 (Reviewer 1 B1: requester-side blocked upgrade)

Continued the partial round-3 work already present on supervisor delivery head `8b9458c31a17dc33ff7699b7c1961fe1f1099d38`. The observed task base remains `3e76e96512a50cd13167587d7539d38454501813` and the authoritative plan remains `0847d1b065627938acfad3a941de79e357570e43`. Pinned task contracts and the current prior-node evidence/ADRs were consulted before this scoped fix. Delivered via the PR opened by the supervisor; that PR records the final commit SHA. This is builder evidence, not an independent review PASS or GitHub CI result.

B1 was valid: the prior blocked-upgrade case exercised a peer's upgrade request while this app released its connection. It did not cover this app being the requester behind an old connection. Dexie's `blocked` event was not surfaced, so the user saw a pending load with no §6 recovery instruction. `ProjectRepository` now retains a temporary blocked state and publishes its changes. `App` reads the retained state when subscribing and shows `db-upgrade-blocked-notice`, a top-level `role="alert"` using the existing `notice notice-error` semantic styles. It says to close other ZARI tabs and explains that closing their connections lets this pending update continue. The open remains pending and the notice clears when it settles, on either success or failure. This introduces no retry, timeout, deletion, migration change, or change to the permanent newer-storage fence.

The two added browser cases hold a real v1 database open in a separate harness page and load the application on `/` and `/#/data`. They assert the accessible close-other-tabs notice, disabled project/example creation on the projects route, no newer-storage notice, and the exact native version 10, original store set and all captured rows while blocked. Closing the peer page resumes the same open without refresh or another application action. The notice disappears, native version becomes 60, all five migration journals appear, compatibility is `ok`, and captured rows are preserved. As in the existing contract, `open()` updates `db:verno` on the projects route; the read-only compatibility route keeps the seeded marker. Existing accepted-snapshot migration, refusal and race coverage is retained.

Changed in this round: `apps/web/src/app/App.tsx`; `apps/web/src/persistence/repository.ts`; `apps/web/tests/browser/local-delivery.spec.ts`; `design/DECISIONS.md` (Dz-local-delivery-only implementation note); `docs/FRONTEND.md`; `docs/PERSISTENCE.md`; `docs/delivery/LOCAL_DELIVERY.md`; `docs/delivery/release-candidate/manifest.json` (script-generated dist section); `docs/IMPLEMENTATION_STATUS.md`; this evidence file. Design: existing semantic notice colors and layout, no new token/contrast pair, no approved-baseline change. `contract_change=NO`: Rust, protocol, generated DTOs, versions, capability/lease/axis contracts, snapshots, fixtures, dependencies and CI remain frozen.

Development failure recorded: the initial `npm run typecheck && npm run lint && npx vite build --mode test && npx playwright test local-delivery.spec.ts --project=chromium --workers=1` passed typecheck/lint/build, then had **8 passed / 1 failed**. The direct-data-route regression incorrectly expected its read-only compatibility query to rewrite `db:verno` to 6. The assertion now explicitly checks the seeded marker on that route and the open marker on the projects route; all domain rows and migration journals remain fully compared. The corrected focused command `npx playwright test local-delivery.spec.ts --project=chromium --workers=1` passed **9/9**, exit 0. No test was deleted/skipped and no threshold, timeout or retry configuration changed.

### Commands and results — round 3

Every command inherited `export PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`. Tools observed: Node v24.19.0, npm 11.17.0 (within engines 11.x; packageManager pin is 11.9.0), Rust 1.98.1, wasm-bindgen 0.2.128. Dependencies were already installed as supplied; no lockfile or dependency change. This continuation reran the required checks and completed browser/parity verification in the foreground. Logs and machine-readable results are local ignored artifacts under `target/local-delivery-final/` (`NN.log`, `results.json`).

| Log | Exact command | Exit / result |
|---|---|---|
| 01 | `cargo fmt --all -- --check` | 0: pass |
| 02 | `cargo clippy --workspace --all-targets --locked -- -D warnings` | 0: pass |
| 03 | `cargo test --workspace --locked` | 0: 260 passed, 0 failed; 1 pre-existing ignored fixture emitter, unchanged |
| 04 | `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | 0: 28 bootstrap fixtures |
| 05 | `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | 0: 124 fixtures |
| 06 | `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | 0: pass |
| 07 | `npm run wasm:build` | 0: pass |
| 08 | `npm run contracts:check` | 0: Rust contracts match; 124 fixture structures valid |
| 09 | `npm run typecheck` | 0: pass |
| 10 | `npm run lint` | 0: pass |
| 11 | `npm test` | 0: 51 files / 421 passed, 0 failed |
| 12 | `npm run build` | 0: Production build; 13 assets; buildId 8f4710817afdc756 |
| 13 | `node scripts/check-release-manifest.mjs` | 0: 13 assets, errors: [] |
| 14 | `node scripts/check-release-candidate.mjs --write` | 0: Script recorded 13 digests, buildId 8f4710817afdc756 |
| 15 | `node scripts/check-release-candidate.mjs` | 0: Repository pins and required gaps match |
| 16 | `node scripts/check-release-candidate.mjs --dist` | 0: 13 digests + buildId match production dist |
| 17 | `node scripts/check-design-tokens.mjs --self-test` | 0: 12 self-tests; 41/41 contrast cases |
| 18 | `node scripts/check-z-denominator.mjs` | 0: 21 nodes retained (20 merged, 1 in progress) |
| 19 | `node scripts/check-qualification.mjs` | 0: 16 baseline stages retained |
| 20 | `node scripts/check-review-package.mjs` | 0: 3 package files verified |
| 21 | `node scripts/check-product-contract.mjs` | 0: 16 ids / 124 fixture expectations unchanged |
| 22 | `npx vite build --mode test` | 0: Test build before the pre-launch port failure |
| 23 | `npx playwright test local-delivery.spec.ts --project=firefox --workers=1` | 1: PRE-LAUNCH FAILURE: port 4173 occupied by earlier runner; no tests executed |
| 24 | `npx vite build --mode test` | 0: Fresh test bundle after stopping the earlier runner |
| 25 | `npx playwright test local-delivery.spec.ts --project=firefox --workers=1` | 0: 9 passed, 0 failed (25.4s) |
| 26 | `npx playwright test local-delivery.spec.ts --project=webkit --workers=1` | 1: 9 browser-launch failures: missing host libraries; application UNVERIFIED |
| 27 | `npm run test:browser -- --project=chromium` | 0: 148 passed, 0 failed (3.5m); includes all 9 delivery cases |
| 28 | `npm run test:parity` | 0: 2 passed; 124 native / actual Chromium Worker-WASM fixtures agree |
| 29 | `npm run build` | 0: Final production rebuild; same 13 digests and buildId |
| 30 | `node scripts/check-release-manifest.mjs` | 0: 13 assets, errors: [] |
| 31 | `node scripts/check-release-candidate.mjs --dist` | 0: Same 13 digests + buildId 8f4710817afdc756 match |
| 32 | `git diff --check` | 0: No whitespace errors |
| 33 | `git diff --exit-code -- docs/evidence/ZARI-SPATIAL-001-*.png` | 0: Prior SPATIAL-001 captures unchanged; no restore needed |

The first Firefox command did not execute tests: an earlier runner still had this worktree's Chromium suite and Vite preview on port 4173. Its process tree was identified (root 3412799, Playwright 3434507, preview 3434575) and stopped without touching another worktree or application. That interrupted earlier Chromium run is not counted as verification. The fresh test build, Firefox run and full Chromium run above replace it. No test retry configuration, skip, timeout, threshold or server-reuse setting changed; no blind or automatic retry was used. No create-project worker-state flake occurred in the completed full suite.

Browser evidence: preview origin `http://127.0.0.1:4173`, real IndexedDB and Worker/WASM. The nine delivery cases cover fresh install/save/reload, accepted-snapshot v1→v6 upgrade, stored-newer refusal, direct-data first access, both probe/open race routes, requester-side blocked upgrade on `/` and `/#/data`, and the original peer-side blocked request. New requester cases compare the native version, store set and every captured v1 row while held, then journals and rows after the peer closes. Both routes assert browser console/page errors `[]`. The notice remains visible without horizontal page overflow at 320/390/768/1280/1440 CSS px, forced colors and 200% zoom; Tab reaches navigation. Playwright uses reduced motion. These are desktop emulations; physical phone/GPU qualification is not inferred.

Both new DRAFT captures were visually inspected: the whole instruction and keyboard focus remain readable in forced colors at 200% zoom (last viewport 1440×1000 CSS px). They are retained locally, not registered as an approved capture set:

| Local ignored artifact | SHA-256 |
|---|---|
| `target/local-delivery-final/screenshots/local-delivery-app-upgrade-04727-closing-the-old-tab-on-data-chromium-DRAFT.png` | `eae3d00a8f73c21b2bdedf59cb3f823aea170192c6fe6a5bfd107c46eba2ba2b` |
| `target/local-delivery-final/screenshots/local-delivery-app-upgrade-3e4aa-ter-closing-the-old-tab-on--chromium-DRAFT.png` | `238fe06629f760641bbc8f4e10d9c99aed992cdfe77663723a86ed379393b6cb` |

Final scope checks also run after the documentation update (logs 34–37): `git diff --check`; `git diff --exit-code 3e76e96512a50cd13167587d7539d38454501813 -- AGENTS.md SOURCE_MANIFEST.json docs/MASTER_PROMPT_KO.md docs/RUST_ADDENDUM_KO.md docs/qualification/denominator.json crates fixtures apps/web/src/contracts .github .aiops docs/aiops package.json package-lock.json Cargo.lock design/baselines apps/web/src/styles playwright.config.ts`; `git diff --exit-code -- docs/evidence/ZARI-SPATIAL-001-*.png`; and `node scripts/check-release-candidate.mjs --dist`. Results: exit 0 each. Existing fixture expected outputs, snapshot digests/IDs, generated contracts, preserved prompts, governance/runtime/CI, dependencies, approved baselines and styles are unchanged. HEAD remains `8b9458c31a17dc33ff7699b7c1961fe1f1099d38`; the supervisor records the final deliverable commit in the PR. No application/test changes followed the full Chromium and parity runs.

Deviations and limits: WebKit cannot launch because this host lacks libgtk-4, libsoup-3 and other browser libraries (see log 26); no host provisioning or later retry was performed. npm minor 11.17.0 differs from the packageManager pin but satisfies engines. Phone, discrete GPU, real product sites and app catalog URL reading remain UNQUALIFIED; screen acceptance stays PENDING, release NOT_AUTHORIZED. Dist reproducibility is same-source/same-toolchain evidence, not a cross-machine byte guarantee. `contract_change=NO`, no architecture deviation. Next: supervisor commits the deliverable, opens the PR, obtains two independent read-only reviews on that exact final head and green GitHub `bridge`. This builder performed no commit, push, PR or GitHub write.

## Fix round 2 — 2026-10-21 (historical; requester guidance gap fixed in round 3)

Started from the clean delivery head `0be1865d3310e9ae5fa8033417f39f297bad306b`. The original task base and plan pin above are unchanged. Delivered via the PR opened by the supervisor; the supervisor records the final commit SHA. This builder does not claim an independent review or GitHub CI result.

R1: `assertCompatible()` previously checked only an initially false latch. It now awaits the shared first-open check, as does the serialized mutation queue. Every direct repository read awaits that check before Dexie can auto-open; `compatibility()` uses the same path without writing the open marker. Concurrent first accesses share the opening promise.

R2: a raw preflight alone cannot fence the actual open boundary. `ZariDb` supplies a bounded IndexedDB factory to Dexie: its declared native open at 60 is allowed, while an unversioned fallback or a request above 60 is refused before reconciliation. If a peer installs native 70 after the probe, the versioned native open fails without changing that database, Dexie's fallback is denied, and the repository latches closed. The diagnostic re-probe only reads the backend version; even if that diagnostic fails, the fence still latches. Missing IndexedDB retains Dexie's unavailable-API behavior. Native version comparisons no longer round 61 down to supported 60. No version/store/index/migration declaration changed.

Preservation evidence is scoped to the tested paths, not a blanket guarantee for every possible future schema or device. Seven added unit regressions cover read-first, write-first, four deterministic probe/open interleavings (explicit open, compatibility, read, write), and native version 61. The local-delivery unit file now has 12 cases. Three added browser cases cover direct `#/data` first access and a real IndexedDB peer-open at 70 queued immediately before the application's native open at 60 on `/` and `/#/data`. They compare the exact native version, store set, project rows and future-store rows. Both race cases retain version 70 and two stores; no version-71 schema reconciliation or accepted create occurs. The original four install/migration/refusal/blocked cases remain intact.

Changed in this round: `apps/web/src/persistence/{db,repository}.ts`; `apps/web/tests/unit/localDelivery.test.ts`; `apps/web/tests/browser/local-delivery.spec.ts`; `docs/PERSISTENCE.md`; `docs/delivery/LOCAL_DELIVERY.md`; `docs/delivery/release-candidate/manifest.json` (regenerated using its script); `docs/IMPLEMENTATION_STATUS.md`; this evidence file. No additional adoption was needed. No UI layout, copy, semantic tokens or contrast combinations changed; the existing alert and disabled mutation controls remain. No dependencies, thresholds, timeouts, CI or source prompts changed.

### Commands and results — round 2

Every command inherited `export PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`. Observed tools: Node v24.19.0, npm 11.17.0 (engines require 11.x), Rust 1.98.1, wasm-bindgen 0.2.128. Builds and suites ran sequentially in the foreground; no automatic retries. Logs for the complete verification are retained locally at `target/local-delivery-round2/01.log` through `29.log` (ignored artifacts).

| Command | Result |
|---|---|
| `npx vitest run apps/web/tests/unit/localDelivery.test.ts apps/web/tests/unit/repository.test.ts` | exit 0, 27 passed (initial and corrected helper runs) |
| `npm run typecheck` (initial regression helper) | exit 2: async spy returned native Promise rather than Dexie's PromiseExtended; fixed with Dexie.Promise, no type suppression |
| `npm run typecheck` / `npm run lint` (corrected helper and complete verification) | exit 0 each |
| `npx vite build --mode test && npx playwright test local-delivery.spec.ts --project=chromium --workers=1` | exit 0, 7 passed; preliminary focused run before the final missing-API/diagnostic fallback guard adjustment |
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0, **260 passed**, 0 failed; 1 pre-existing ignored fixture emitter (`emit_mc_fixtures`), unchanged |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 cases |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 cases |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0 |
| `npm run wasm:build` | exit 0 |
| `npm run contracts:check` | exit 0, contracts match Rust; 124 fixture structures valid |
| `npm test` | exit 0, **51 files / 421 passed**, 0 failed |
| `npm run build` | exit 0 twice; final post-browser production rebuild has the same 13 digests and buildId `d0b3763b11d9180c` |
| `node scripts/check-release-manifest.mjs` | exit 0, 13 assets, `errors: []` |
| `node scripts/check-release-candidate.mjs --write` | exit 0, 13 digests, buildId `d0b3763b11d9180c` |
| `node scripts/check-release-candidate.mjs` | exit 0 |
| `node scripts/check-release-candidate.mjs --dist` | exit 0 after both production builds; 13 digests and buildId match |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0, 12 self-tests, 41/41 contrast cases |
| `node scripts/check-z-denominator.mjs` | exit 0, 21 nodes retained |
| `node scripts/check-qualification.mjs` | exit 0, 16 baseline nodes retained |
| `node scripts/check-review-package.mjs` | exit 0, 3 files verified |
| `node scripts/check-product-contract.mjs` | exit 0, 16 ids / 124 fixtures unchanged |
| `npx vite build --mode test` | exit 0, final application/test source before cross-browser checks |
| `npx playwright test local-delivery.spec.ts --project=firefox --workers=1` | exit 0, **7 passed**, 0 failed (20.8s) |
| `npx playwright test local-delivery.spec.ts --project=webkit --workers=1` | exit 1, **7 browser-launch failures**, host libraries missing (libgtk-4, libsoup-3, etc.); application **UNVERIFIED**; no retry or host changes |
| `npm run test:browser -- --project=chromium` | exit 0, **146 passed**, 0 failed (3.5m, full final application/test tree); no create-project flake or retries |
| `npm run test:parity` | exit 0, **2 passed**; 124 native / actual Chromium Worker-WASM fixtures agree |

Final scope checks (exit 0 each): `git diff --check` and `git diff --exit-code 3e76e96512a50cd13167587d7539d38454501813 -- AGENTS.md SOURCE_MANIFEST.json docs/MASTER_PROMPT_KO.md docs/RUST_ADDENDUM_KO.md crates fixtures apps/web/src/contracts .github .aiops docs/aiops package.json package-lock.json Cargo.lock design/baselines apps/web/src/styles playwright.config.ts`. This proves existing fixture expectations, generated contracts, dependencies, preserved prompts, governance, CI, approved baselines and styles are unchanged. `git diff --exit-code -- docs/evidence/ZARI-SPATIAL-001-*.png` also exits 0; no prior capture was rewritten. `git rev-parse HEAD` remains `0be1865d3310e9ae5fa8033417f39f297bad306b`; final deliverable commit is assigned by the supervisor.

Browser evidence: real Chromium and Firefox, real IndexedDB and Worker/WASM, preview origin `http://127.0.0.1:4173` (also recorded in `test-results/preview-origin.txt`). The three added cases collect browser console/page errors and assert `[]`; both interleavings use real native request ordering with no sleep, fake DB, application hook or schema mock. The direct-data-route alert is visible at 320/390/768/1280/1440 CSS px without horizontal overflow; forced colors and 200% CSS zoom retain the alert; Tab reaches a navigation link. The original sample-install/accepted-snapshot migration path still verifies saved input, all captured v1 rows, migration journals and the same accepted snapshot. These are desktop emulations, not phone qualification. Screenshots, if produced by existing suites, remain DRAFT evidence.

Deviations/limits: the npm minor is 11.17.0 on this supplied toolchain (within required engines 11.x). WebKit cannot launch on this host; phone/GPU/real-product-site qualification stays open. The candidate digest comparison is same-source/same-toolchain evidence, not a cross-machine byte guarantee. The required independent reviews and GitHub `bridge` are the supervisor's next steps. No commit, push, PR or GitHub write by this builder.

## Fix round 1 — 2026-10-21 (historical; incomplete fence, superseded by round 2)

Continued the partial fix present at session start on `c79dbaa6488a0d6cccd0a9fa038d38cf7c2508fe`. The supervisor commits the final tree; no new HEAD SHA is claimed here. R1 was valid: rejecting initial `open()` alone left the connection and queue writable. The fix latches `movedToNewer`, closes the connection, guards direct reads as well as queued mutations, and retains a safe compatibility report from the latched version. A raw version probe protected explicit open and compatibility-first access. Reviewer 2 subsequently demonstrated that read-first/write-first access bypassed that probe and the post-open check ran too late to prevent Dexie schema reconciliation after a concurrent upgrade. The round-1 results below cover their listed paths only; they did not establish the broader preservation claim. Round 2 replaces those incomplete guards.

The unit regression now attempts creation, deletion, list/bundle reads, repeated open and compatibility after refusal, asserts `db.isOpen() === false`, and reads raw IDB to confirm the original version, store set and project row. A fifth unit case covers compatibility as the first access followed by attempted creation. The browser refusal case checks create/example/import are disabled, attempts native button activation and keyboard activation, visits compatibility, and compares all captured store rows after refusal. The migration case now compares every captured v1-store row (metadata excludes only the newly added migration journals). At 390px with forced colors the refusal banner remains visible without horizontal overflow. Existing semantic notice styles are reused; no new tokens, contrast pairs, dependencies or domain calculations.

Initial typecheck in this session failed on nullable indexed store arrays in the strengthened browser assertion (exit 2); corrected with explicit empty-array handling, then the complete typecheck/lint/unit chain passed. No failed test was skipped/deleted, no timeout or threshold was changed, and no flaky-suite retry was used. WebKit remains the already-declared host limitation; no external machine/configuration changes were attempted.

## Commands — rerun for fix round 1 (PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH, CARGO_BUILD_JOBS=4)

| Command | Result |
|---|---|
| `npm run wasm:build` | exit 0 (wasm-bindgen 0.2.128) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 51 files / 414 tests (5 `localDelivery.test.ts`) |
| `npm run build` (run twice) | exit 0 both; 13 identical digests, `buildId 16ba680e28d482d3` on this host |
| `node scripts/check-release-manifest.mjs` | exit 0, `errors: []`, 13 assets |
| `node scripts/check-release-candidate.mjs --write` | exit 0, recorded 13 dist digests |
| `node scripts/check-release-candidate.mjs` | exit 0 |
| `node scripts/check-release-candidate.mjs --dist` | exit 0, 13 files + buildId match (after both builds) |
| `node scripts/check-z-denominator.mjs` | exit 0 (merged 20, in-progress 1, not-started 0) |
| `node scripts/check-qualification.mjs` | exit 0 (denominator 16 unchanged) |
| `node scripts/check-review-package.mjs` | exit 0, 3 files verified |
| `node scripts/check-product-contract.mjs` | exit 0 |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0, 72 base tokens, 41/41 contrast cases |
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0, 241 passed / 0 failed |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0; 28 cases |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0; 124 cases |
| `git diff --exit-code 3e76e96512a50cd13167587d7539d38454501813 -- SOURCE_MANIFEST.json docs/MASTER_PROMPT_KO.md docs/RUST_ADDENDUM_KO.md crates fixtures apps/web/src/contracts .github .aiops docs/aiops package.json package-lock.json Cargo.lock` | exit 0; protected paths/fixture expectations unchanged |
| `git diff --check` | exit 0 |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0 |
| `npm run contracts:check` | exit 0; contracts match Rust source, 124 fixture structures valid |
| `npx vite build --mode test` | exit 0, before targeted cross-browser tests |
| `npx playwright test local-delivery.spec.ts --project=firefox --workers=1` | exit 0, 4 passed (17.1s) |
| `npx playwright test local-delivery.spec.ts --project=webkit --workers=1` | exit 1, 4 launch failures; **UNVERIFIED** — `browserType.launch: Host system is missing dependencies` (libgtk-4, libsoup-3, …); no application execution |
| `npm run test:browser -- --project=chromium` (full suite, final application/test tree) | exit 0, **143 passed** / 0 failed (3.9m, 4 workers), incl. all 4 local-delivery tests; no create-project flake observed |
| `npm run test:parity` | exit 0, 2 passed; 124 fixtures native vs browser WASM agree |

## Browser evidence detail — round 1 (historical paths only)

`local-delivery.spec.ts`, real Chromium + real IndexedDB + real WASM Worker, preview build at `http://127.0.0.1:4173`:

- Test 1 (fresh install): create → fill sample → commit saved → reload restores the committed width; `#/data` compat report `ok`, journal `없음` (a fresh DB is created at v6 and runs no upgrades); no `db-version-notice`; console errors `[]`.
- Test 2 (existing-data upgrade): a real project (draft, normalized input, catalog, accepted PlanSnapshot) is captured, the DB is deleted and recreated at IDB version 10 (a Dexie-declared v1 database; Dexie stores declared n at n×10) with every row replayed, then the app upgrades it in place: compat journal `1→2, 2→3, 3→4, 4→5, 5→6`, all v6 stores exist, the project lists, the same accepted snapshot id renders. `deleteDatabase` also exercised the versionchange→close→prompt path (`db-version-notice`).
- Test 3 (update failure): a version-70 database (newer than declared 6) is refused — the raw version probe latches `migration_blocked` before Dexie opens, `projects-error` shows the reload wording, create/example/import remain disabled after attempted activation, and `#/data` reports `newer_database` without reopening. Raw IDB comparisons establish equality of every captured row across all current stores and presence of the `zariFuture` marker store. The banner stays visible at 390px/forced colors; console errors remain empty after the existing resource-error filter. Unit tests separately attempt actual repository mutations after refusal and assert rejection plus unchanged raw stored contents.
- Test 4 (blocked upgrade): a held raw connection blocks the version-70 open (`blocked` event, nothing applied, rows intact); the app's connection releases and shows the prompt; closing the held connection lets the upgrade proceed.

## Known limits

Phone, discrete GPU, real product sites, app catalog URL read: UNQUALIFIED. WebKit on this host: UNVERIFIED (missing browser dependencies). The dist digest comparison is a same-source/same-toolchain reproducibility check, not a cross-machine byte guarantee.

## Out of scope

Release, deploy, approved baselines, real checkout, cloud, accounts, real-device qualification, the (empty) remaining program nodes.
