# ZARI-SPATIAL-011 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. The new images are draft evidence. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #63, node 011, “후속 측정 통합 검증과 새 draft capture 인계”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-011`.
- Observed base SHA: `6f1c5c696d964487f8b52cdec428ae6cd0aba596` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md` §§7–10; `docs/SPATIAL_VERIFICATION.md`; `docs/TEST_STRATEGY.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SPATIAL_WORKSPACE.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`. SP-006 through SP-010 evidence and ADRs were read as the current HEAD. Candidate and NON_EXECUTABLE program drafts were not used as extra scope.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 about 07:28 KST, verbatim: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라." Recorded in `design/DECISIONS.md` D011 and `docs/adr/SP-011-integration-capture.md`. This delivery implements SP-011 only.

## What changed

This node re-runs the measurement-completion behavior from 009 and 010 and adds a new draft capture. It does not change Rust, `BUILD_ID` (`zari-domain-6`), capabilities, generated contracts, or existing fixture expected outputs.

A note that looks like conflicting numbers stays human text. Saving it changes the semantic input digest and the input revision. It does not create `conflictingEvidence`, a numeric interval, a pass, or Confirmed. A note longer than 4096 characters keeps the raw text, emits `text_too_long`, and leaves the previous digest in place. Structured conflict rows still come only from a current check whose reason is `conflicting_sources` or from `UnknownReason::ConflictingSources`. The product UI cannot create that reason. The classified case stays the existing Rust test `notes_do_not_create_conflict_or_numbers_and_classes_stay_distinct`, and the browser harness replays `mc-07-shared-fact` on the real Worker.

Future normalized axes, which are not the existing core enum, are recorded on `spatialDraft011`:

| Axis | Value | Why |
|---|---|---|
| `node_state` | `IN_PROGRESS` | `DONE` only after a protected host-pinned exact-head merge |
| `qualification_state` | `PARTIAL` | Desktop browsers ran. Phone and discrete GPU are unqualified |
| `acceptance_state` | `PENDING` | The new image set has no user approval |
| `release_state` | `NOT_AUTHORIZED` | This program does not authorize release |

Approved baseline count stays 0. SP-007 stays 47 drafts at source commit `29370e23a082c49aa4d8d7943b0e6e71c7884b4c`. This detail and list UI does not borrow that acceptance.

## Changed paths

- Adoption: `docs/adr/SP-011-integration-capture.md`, `design/DECISIONS.md` (D011), a short SP-011 note in `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`.
- Draft capture: `design/baselines/draft/zari011/` (26 PNG files and `a11y-snapshot.json`), `design/baselines/manifest.json` (`spatialDraft011` and 26 draft entries), `design/baselines/README.md`.
- Checker: `scripts/check-baseline-manifest.mjs`, `apps/web/tests/unit/baseline-manifest.test.ts`. zari001 and zari007 pins are unchanged. `sourceCommit` for zari011 is pinned to `6f1c5c696d964487f8b52cdec428ae6cd0aba596`.
- Tests: `apps/web/tests/browser/capture-measurement.ts`, `measurement-capture.spec.ts`, `measurement-regression.spec.ts`, `measurement-bench.spec.ts`, `apps/web/tests/unit/session.test.ts`.
- Script: `package.json` `capture:baselines` adds `--workers=1` so the existing exclusive output directory and the new capture cannot race.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

`apps/web/src`, `crates/`, `fixtures/`, generated contracts, and `Cargo.lock` are unchanged. No new dependency. `.aiops/**` and `docs/aiops/**` were not edited.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| MC-01..12 and prior spatial, portable, edit, progress, and parity regressions | Full Chromium suite 78 passed, including existing `detail.spec.ts`, `next-facts.spec.ts`, spatial, portable, and workspace specs. Native fixtures 124. Parity 124 |
| Conflicting-looking note changes the digest and never classifies | `session.test.ts`; Chromium, Firefox, and WebKit `measurement-regression.spec.ts`; capture shots `conflicting-evidence-*` |
| Hostile string and 4096-character cap | regression spec: script-looking note stays text; 4097 `가` holds the previous digest and survives reload |
| Offline save, then sample is a different digest | regression spec. WebKit does not reload while offline |
| Source switch while a query is held | regression spec. Late list is not painted. Sample handling left nominal stays 5 after an explicit recompile |
| Structured conflict stays distinct from the note | Rust `notes_do_not_create_conflict_or_numbers_and_classes_stay_distinct`; harness replay of `mc-07-shared-fact` has no `NOTE_TOKEN_91mm` and no `conflictingEvidence` |
| cold 20 / warm 50 source-staged timing | `measurement-bench.spec.ts`, contract `zari-bench-mc-1`. See timings below |
| Caps, collision text, CAS, late reply | hostile note; existing next-facts hold and limit tests still in the Chromium suite; conflict capture is a second-tab CAS rejection |
| Sample versus fresh | session unit test and the offline regression: sample load limit 50000 g, fresh project does not inherit it |
| Draft images at 1440 and 390, accessibility, real Worker | `design/baselines/draft/zari011/`. Capture console errors were empty. No fake Rust pass |
| Approved counts unchanged | `node scripts/check-baseline-manifest.mjs`: approved 0, zari007 47, zari011 26 |
| State axes and no release | `spatialDraft011` fields above. Checker rejects `nodeState` `DONE` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. Browser commands used `--workers=1`. The Chromium suite result is the run after the hold-gate fix.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 109 passed, 1 ignored. core lib 29, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, protocol 17, validator 11, search 14. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generate step. No contract diff |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 17 files, 132 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `fd65aad9808ae654`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-baseline-manifest.mjs` | exit 0. `approved 0; drafts 78; zari007 47; zari011 26; bytes 4891194; required 66` |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 78 passed (2.5m). No `worker-state` flake |
| `npx vite build --mode test` then `npx playwright test apps/web/tests/browser/measurement-regression.spec.ts --project=firefox --project=webkit --workers=1` | exit 0. 10 passed (22.7s): Firefox 5, WebKit 5 |
| `npm run bench:browser -- --project=chromium --workers=1` | exit 0. 15 passed (5.7m). Existing zari-bench-3 and the new measurement bench. Measurement query source, cold compute, and transport p95 exceeded their targets; see Timings |
| `npx playwright test apps/web/tests/browser/measurement-bench.spec.ts --project=firefox --project=webkit --workers=1` | exit 0. 6 passed (2.6m) |
| `npm run test:parity` | exit 0. 2 passed (22.8s). “124 shared fixtures.” |
| `ZARI_CAPTURE_DIR=/tmp/zari-spatial-011-cap5 npm run capture:baselines` | exit 0. 3 passed (32.4s). Output PNG bytes match the registered `draft/zari011` files |

An earlier Chromium suite, before the hold-gate fix, was 1 failed and 77 passed. The failed test left the second `queryNextFacts` on the test gate, so status stayed `loading`. The fix resolves later calls. The full suite was then run again. Timeouts were not raised.

An earlier `npm run capture:baselines`, after the staging sentence was scrolled into view, failed the existing spatial capture with `no uncovered point on placement:p:c:0:0`. The measurement capture in that same invocation passed. The final command above passed all three tests. Timeouts were not raised. `capture-spatial.ts` was not edited.

## Timings

Contract `zari-bench-mc-1`. Cold is 20 fresh browsers on `mc-12-input-only`. Warm is 50 iterations on seven MC fixtures. `querySource` is the worst warm `workerComputeMs` p95. `coldQuerySource` is the cold `workerComputeMs` p95. Targets are 20 ms for source and cold compute, and 10 ms for encode, decode, and transport. A p95 over the target is `exceeded` and does not fail the test. Phone and discrete GPU are `unmeasured`.

| Engine | Environment digest | querySource | cold compute | encode | decode | transport |
|---|---|---|---|---|---|---|
| Chromium 153.0.8010.12 | `73f8765620c8090fe246bb2ea5508e6f38e83b9cde563bb964263abda3136a39` | 40 ms exceeded | 52.9 ms exceeded | 0.8 ms met | 0.1 ms met | 31.3 ms exceeded |
| Firefox 155.0 | `8610d67ed2fec44a2b6aca2cf876afd015fa6ce4d1fa35ed2bb4287d2910fa08` | 12 ms met | 5 ms met | 2 ms met | 1 ms met | 2 ms met |
| WebKit 26.6 | `157bc74c0494f88e83cc410094aa74f2674d7f0ff519273acbf04697c79ad54e` | 28 ms exceeded | 12 ms met | 1 ms met | 1 ms met | 2 ms met |

Chromium query source p95 is the warm compute of `mc-07-shared-fact` (40 ms). Chromium cold compute p95 is 52.9 ms (worker p95 62 ms, n=20). Chromium transport p95 is 31.3 ms on warm `mc-12-limit`, whose compute p95 was 11.1 ms. WebKit query source p95 is the warm compute of `mc-12-limit` (28 ms). Host: Node v24.19.0, linux 6.12.94+, 16791158784 bytes reported memory. Reports are `test-results/bench/bench-mc-<engine>.json` and are not an approved baseline. The existing spatial bench was not re-run on Firefox or WebKit. Exceeded stages did not fail the bench tests and the targets were not lowered.

## Browser and capture

Route: `#/project/<id>` after creating a fresh ordinary project. Fixture id `fresh-ordinary-project`. Catalog digest on the page: `249cfb4185353ecb69c140ba6e7830b8670dd07708efa1d8cf0d5cee6e96be81`. Chromium 153.0.8010.12, linux 6.12.94+, locale `ko-KR`, theme light, `prefers-reduced-motion: reduce`, `--zari-duration-fast` `0s`, device scale 1, not full page. Font stack: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`. Korean fallback recorded as NanumGothic. GPU: Google Inc. (Google) / ANGLE SwiftShader (Vulkan 1.3.0, device 0x0000C0DE). Note: “Not a discrete GPU and not a phone.”

`sourceCommit` is `6f1c5c696d964487f8b52cdec428ae6cd0aba596`. `sourceDirty` is true because the capture ran before the supervisor commit. `productTree` is `apps/web/src matches sourceCommit`. Scenario files are `apps/web/tests/browser/capture-measurement.ts` (`09f7ce22dba360ac842797f95808575a6be04c9b58eafbbd9060a04351b79863`) and `measurement-capture.spec.ts` (`37b231d4d16284c0dc3e3ffad482f21503f7ef0a8e7753538da962d9e8040604`).

Capture console errors were empty on every shot. axe on `main` at the fresh project: 0 violations, 1 incomplete, 31 passes. The snapshot hash is `3bfeb1aca6e03deb7429085e999fedece1539d950c9154af67ac702a986641bb`.

Every listed image was opened and inspected. Visible content:

- next-fact: input-only rows such as “치수. 값을 입력” for interior, opening, clearances, and staging. No plan pass.
- fresh: interior width “미측정”, diagram “축척 없음” and “값 없음”. Detail starts collapsed.
- staging-support: the sentence “손으로 들어 옮기는 동작은 검사 범위에 포함되지 않습니다.” The unknown radio was asserted checked before the shot. The viewport centers the sentence, so the radio can sit below the fold.
- load-unknown: footprint width “500 mm, 확인되지 않음”. Floor load stays “미확인”.
- nominal-bounds: “600 mm, 오차 −2 / +3 mm, 확인되지 않음”.
- unknown: opening height “미확인”.
- missing-bound: plus is empty (“비어 있음”), minus stays 2, and the page says both bounds are required. The driver asserted `normalize-held` and an unchanged digest before the shot.
- conflicting-evidence: the memo shows “590 mm와 610 mm가 충돌한다. 평균 600. pass Confirmed”. The next-facts list is not in this viewport. The driver asserted `conflictingEvidence` count 0, the list does not contain the note, and the nominal stays 600 unverified.
- catalog-source: read-only catalogue notice and the link “카탈로그에서 수정”. No detail editor.
- stale: width text 601 is uncommitted, the banner says the input changed, and the previous 600 mm remains.
- conflict: “다른 탭에서 이 프로젝트가 먼저 저장되었습니다.” At 390 the typed width is 700 against the saved 601.
- a11y-focus: nominal field focused, value 601. Forced colors keep the field and the unverified text. Zoom 200% shows the stale next-fact banner and “축척 없음”.

| id | state | viewport | sha256 | bytes |
|---|---|---|---|---|
| `zari011-next-fact-1440` | next-fact | 1440×1000 | `55f211f386452e23e7059ae760e4f4c1d32f1cc65d84b113f2f257e6304c479b` | 107093 |
| `zari011-next-fact-390` | next-fact | 390×844 | `224582b3a833c27c7c30c1db80ed962d47701bdb795a4bde927d99502a96cd4f` | 63167 |
| `zari011-fresh-1440` | fresh | 1440×1000 | `c298ff19a55e11720b6ea1e89ca9020f5e69fd1862d7cd34eff054ec1fea9857` | 71283 |
| `zari011-fresh-390` | fresh | 390×844 | `e69dcb92aa4dd80536b9384807bcb16f033c8e3fec72cae0d8a8ae8c3865f409` | 39933 |
| `zari011-staging-support-1440` | staging-support | 1440×1000 | `0aeb11219f5f372a0d63333a9986f34b7af384982f07204660c587b1b89a6ab7` | 58682 |
| `zari011-staging-support-390` | staging-support | 390×844 | `2bdb781a2b900a5443f325efd19765bb01aa2d66e1855f065b50ad48c5c965ee` | 42762 |
| `zari011-load-unknown-1440` | load-unknown | 1440×1000 | `03db3354c1ff048f8547b7e03c4c0526adf354ea56742b90ffd8c0d947e5c6ed` | 55952 |
| `zari011-load-unknown-390` | load-unknown | 390×844 | `b5cf264a83d288e74365ea11e26e888ec0bb274cf4c2331dce6ee73669fdb130` | 32845 |
| `zari011-nominal-bounds-1440` | nominal-bounds | 1440×1000 | `7c1c3f50ad55a0db2aa2a77fce43d506f6418eb82de790ae0ad1e9634547e627` | 49521 |
| `zari011-nominal-bounds-390` | nominal-bounds | 390×844 | `2307995d27df75d5cb4fac3ce293e2039a048785ff4d19572867cbf343217372` | 34897 |
| `zari011-unknown-1440` | unknown | 1440×1000 | `5e932956626a60b781de569da4dde819e66a271eab3d092c5fa7113943e1a37d` | 47337 |
| `zari011-unknown-390` | unknown | 390×844 | `86935a265c8909b7a00e9755688703920bd08ca803f1d760a3eed5b9ca154199` | 36318 |
| `zari011-missing-bound-1440` | missing-bound | 1440×1000 | `95931d2f620f7762fccbc769d75b2966ba80da3af95bce401f85d6d1082d876a` | 53243 |
| `zari011-missing-bound-390` | missing-bound | 390×844 | `20a152d5d3be59f240fd7586d24c0649b42fa5806e722c548dd9c5e7e2268a81` | 35541 |
| `zari011-conflicting-evidence-1440` | conflicting-evidence | 1440×1000 | `1c036c8dbd85713db0e6e9dab57405ab867ea72393cfcc429892717e1c8ff6a1` | 56032 |
| `zari011-conflicting-evidence-390` | conflicting-evidence | 390×844 | `205c34af74b0a25c59dc84c412c5bd67de49df75ff92c182886a4ab2f2c09365` | 41819 |
| `zari011-catalog-source-1440` | catalog-source | 1440×1000 | `eddfa6a0a7226e4b6a2c7bec40e16cde1aa7fcc0c95f802006bce77956262432` | 70851 |
| `zari011-catalog-source-390` | catalog-source | 390×844 | `476e9331cec5ffa1203fe9ff22cb99aef7b066fd0bcf19ba0dfcdeb0da42cd84` | 42869 |
| `zari011-stale-1440` | stale | 1440×1000 | `f6ff7cb8e58f44046ec92205375fab6cb3961cd2c9b1ae9ecb9003d4479d9909` | 79462 |
| `zari011-stale-390` | stale | 390×844 | `787ff8991891e9a6da5a4738b142869d7d6a2e380f89df361a6c2c568312bf3f` | 37908 |
| `zari011-conflict-1440` | conflict | 1440×1000 | `5ab5ddabfa17ed3a06144c6bc0ccde054001cb80aa9bbede32c534039a9138e3` | 59884 |
| `zari011-conflict-390` | conflict | 390×844 | `7f35ee0c66b0380f879d469bd96a96b7e98732fb54ae618ca619decb2ed437f8` | 39526 |
| `zari011-a11y-focus-1440` | a11y-focus | 1440×1000 | `e9cbb3ff5f3736c728e108c84097e18b9fa69225e8b8a5d9b8bb71c383d540c9` | 60391 |
| `zari011-a11y-forced-colors-1440` | a11y-forced-colors | 1440×1000 | `d6f519cebbabcf75c160a20a49c8fd4d5c1d9e7ac7ca59375666522ef76dd1ea` | 55698 |
| `zari011-a11y-forced-colors-390` | a11y-forced-colors | 390×844 | `f0dc677baa2867fc71837a102d80b49ad3483b4f67ea910aa832fa3c544a8659` | 26919 |
| `zari011-a11y-zoom-200-1440` | a11y-zoom-200 | 1440×1000 | `fd92cdc3a1696409f066af8d90ce3159fdf3bc75b0906ca23749bbe1ee8df00b` | 94994 |

`docs/evidence/ZARI-SPATIAL-001-unknown-offset.png` sha256 `49bce0b45c0904f6909da6b5ae71729ff40292c7f1951076da1af003010f8098` and `ZARI-SPATIAL-001-yaw-offset.png` sha256 `89c2d07ed9a4c3436db69c0b02904124e89b1c20fb2e4f44917adec6b6bfea28` still match HEAD after the browser and capture runs. No checkout was required.

## Parity

`npm run test:parity` exit 0. Native fixture runner and the real Chromium Worker agreed on 124 shared fixtures. Malformed payloads are still rejected. No fixture expected output changed.

## Contract advisory

No Rust or protocol change. Generated contracts were not regenerated and were not hand-edited. `contracts:check` matched. `BUILD_ID` stays `zari-domain-6`. Persisted schemaVersion stays 1.

## Deviations

The product UI cannot set `UnknownReason::ConflictingSources`. This node did not add a control or a new domain fixture for that reason. Classified conflict rows remain the existing Rust test, and the UI evidence is the preserved note beside a list with zero `conflictingEvidence` rows.

`capture:baselines` now uses `--workers=1`. That is so the new measurement capture runs after the existing probe creates the output directory. It does not change capture timeouts or the zari007 scenario.

`measurement-capture.spec.ts` fails when `ZARI_CAPTURE_DIR` is unset and when the Playwright project is not Chromium. `capture:baselines` selects `--project=chromium`. The scenario-file hash is `37b231d4d16284c0dc3e3ffad482f21503f7ef0a8e7753538da962d9e8040604`. Image bytes did not change.

## Known limits

- Physical phone: UNVERIFIED. 390×844 is Playwright viewport emulation. Qualification for that scope stays unqualified.
- Discrete GPU: UNVERIFIED. Headless WebGL is SwiftShader. GPU timestamps were not taken.
- WebKit warm query source p95 is 28 ms, over the 20 ms desktop target. Chromium query source p95 is 40 ms, cold compute p95 is 52.9 ms, and transport p95 is 31.3 ms. All three are recorded as exceeded.
- WebKit offline reload is not performed. The regression test saves while offline, then reloads only after the network is back.
- The existing spatial bench was not re-run on Firefox or WebKit.
- SP-007 3D label overlap (Winter coats #2 over Wide bin) was not fixed and those images were not recaptured.
- Screen acceptance and release remain later user decisions. `node_state` is not `DONE`.

## Out of scope

The next node was not started. No purchase, remote service, secret, runtime flag, CI gate, governance file, source prompt, or `SOURCE_MANIFEST.json` change. No approved baseline was replaced. No history rewrite.
