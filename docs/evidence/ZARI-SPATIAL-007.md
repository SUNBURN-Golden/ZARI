# ZARI-SPATIAL-007 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. The images under `design/baselines/draft/zari007/` are draft captures. They are not an approved baseline and they are not physical validation. The supervisor commits this tree; the final full HEAD SHA is that commit.

- Task: GitHub issue #55, node 007, “실제 화면 draft evidence와 승인 인계”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-007`.
- Observed base SHA: `29370e23a082c49aa4d8d7943b0e6e71c7884b4c` (origin/main at branch creation; plan commit is an ancestor).
- Capture `sourceCommit` on every `zari007-*` entry: that same base SHA.
- Product tree: `git diff HEAD -- apps/web/src` was empty at capture time and is still empty. `sourceDirty` is true because the capture scenario, checker, manifest, and this evidence are in the working tree. The capture source is the base product tree plus this PR’s test and documentation diff, not a product-code diff.
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2 and §10 SP-007; `docs/SPATIAL_VERIFICATION.md` G6; `design/SPATIAL_WORKSPACE.md` §9; `design/baselines/README.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/REVIEW_CHECKLIST.md`; `docs/evidence/ZARI-SPATIAL-001.md` through `006.md`. Candidate / NON_EXECUTABLE program drafts were not used as extra scope.

## What changed

`apps/web/src`, Rust, fixtures, generated contracts, `Cargo.lock`, tokens, and `.github/workflows` are unchanged. Existing `design/baselines/draft/zari001/` PNG bytes and the five `zari001-*` manifest hashes are unchanged. Approved count stays 0. No new dependency.

- `apps/web/tests/browser/capture-spatial.ts` drives the real app in Chromium: sample project, Worker search, pointer drag, numeric rejection, IndexedDB fault, second tab, stale input, WebGL-null context, and an aborted spatial chunk. It does not mock a Rust pass.
- `apps/web/tests/browser/capture.spec.ts` runs that driver after the existing probe capture. The probe loop now loads `about:blank` before each `#/probe` visit, because a hash-only `goto` of the current route does not remount the probe. Those probe PNGs were written only into the fresh `ZARI_CAPTURE_DIR` and were not copied over `zari001`.
- `package.json` `capture:baselines` adds `--project=chromium` so Firefox and WebKit do not write the same paths.
- `scripts/check-baseline-manifest.mjs` checks files, sha256, required fields, the frozen `zari001` hashes, approved count 0, and `spatialDraft007`. `apps/web/tests/unit/baseline-manifest.test.ts` runs that script.
- 47 viewport PNGs and `a11y-snapshot.json` are under `design/baselines/draft/zari007/`. `design/baselines/manifest.json` appends draft entries and `spatialDraft007`. `design/baselines/README.md` records the new count. Approved remains 0.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Draft images resolve on disk | 47 PNGs under `design/baselines/draft/zari007/`. `node scripts/check-baseline-manifest.mjs` and vitest `baseline-manifest.test.ts` |
| Index names source HEAD, scenario hashes, image hashes, viewport, browser, fonts, theme, motion, GPU | `design/baselines/manifest.json` `zari007-*` entries and `spatialDraft007` |
| Approved count unchanged | Checker: `approved 0`. No `approvedBy` |
| Proposed set and limits named | `spatialDraft007.proposedApprovalSet` is the 47 ids. `missingOrUnverified` names phone, discrete GPU, WebKit offline, no multi-placement BOM row, no cavity pane |
| No blank 0-app claim | The shots below are the running sample workspace |
| A green screenshot is not physical validation | `notPhysicalValidation: true`. GPU note says software GL, not a discrete GPU, not a phone |

## Screenshot index

Every file below was opened and viewed. Viewport captures, `fullPage: false`, `deviceScaleFactor` 1. Chromium 153.0.8010.12, headless, `ko-KR`, light, `prefers-reduced-motion: reduce` (`--zari-duration-fast` `0s`). Korean UI font stack is `system-ui` with `WenQuanYi Zen Hei` as the host `fc-match :lang=ko` fallback. GPU: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Route is `#/project/:id` for the measurement shots and `#/project/:id/plan` after that. Fixture `sample-project-form`, catalog digest `249cfb4185353ecb69c140ba6e7830b8670dd07708efa1d8cf0d5cee6e96be81`. No private data.

47 PNGs, 2,688,448 bytes. Plus `draft/zari007/a11y-snapshot.json`.

| File | What is on screen |
|---|---|
| `measurement-known-1440.png` | Focused 공간 안쪽 폭 `600` mm. Diagram is a scaled rectangle, caption `600 mm · 측정 오차 미확인`. |
| `measurement-known-390.png` | Same known diagram scrolled to the top of the 390 viewport. Caption `600 mm` and 측정값 확인·저장 are visible. The focused field sits above the viewport. |
| `unknown-1440.png` | 개구부 높이 reads `미측정` and is focused. Diagram says `축척 없음`. |
| `unknown-390.png` | Compact diagram `축척 없음` with `값 없음 · 미측정`. |
| `historical-1440.png` | 공간 안쪽 폭 is the non-numeric text `abc`. Diagram `축척 없음`. Notice `입력 변경 · 이전 측정`. |
| `historical-390.png` | Compact `축척 없음` and the same historical notice. |
| `success-1440.png` | Computed sample plan. Front and top diagrams show Wide bin, Winter coats, Winter coats #2, Documents. 검사 39건 · 미확인 13. Projection was `ready`. |
| `success-390.png` | Same plan in the compact toolbar. Both diagrams are on screen. |
| `checks-unknown-1440.png` | Check rows. Several say `미확인` and show raw codes `fact_unknown`, `elevation_unknown`, `cavity_unknown` next to 확인됨 rows. |
| `checks-unknown-390.png` | Same list, wrapping. Open finding below: the codes are the product’s own text. |
| `selection-dimensions-1440.png` | Selected Wide bin. 외경 520×255×220 mm and 내경 510×245×210 mm, each `측정 오차 미확인`. The list also shows raw names `compartmentBoundary` and `itemEnvelope`. |
| `selection-dimensions-390.png` | Compact inspector sheet. Same 외경/내경 numbers for Wide bin, Documents, Winter coats, Winter coats #2. |
| `drag-preview-1440.png` | Pointer is down. Banner `검사 전`. Wide bin is selected. A dotted preview mark is on the front diagram. Rust has not been asked to evaluate yet. |
| `drag-preview-390.png` | Same `검사 전` banner in the compact move toolbar (취소 / 좌표 입력 are in the bar). |
| `drag-committed-1440.png` | `검증된 작업 계획`, `되돌리기 (1)`, `1건의 편집이 기록되어 있습니다`. Save-failed notice is absent. The drag was −15 mm in depth. |
| `drag-committed-390.png` | Same verified-plan heading and undo (1), with the front diagram at the bottom of the 390 viewport. |
| `drag-save-failed-1440.png` | Notice `이 기기에 저장하지 못함`. 다시 저장 and 내보내기. The verified plan stays. Undo still shows (1) from the earlier saved drag. |
| `drag-save-failed-390.png` | Same notice stacked above the compact toolbar. |
| `drag-rejected-1440.png` | `위치 이동이(가) 거부되었습니다 — 기존 계획은 바뀌지 않았습니다.` Reasons: 공간 밖으로 나갑니다, 지지면에서 벗어납니다, 문 입구로 들어갈 수 없습니다, 작업 공간이 부족합니다. This rejection is the numeric move `19999`, the same move command as a drag, not a second pointer gesture. |
| `drag-rejected-390.png` | Same rejection banner above the compact diagrams. |
| `spatial-ready-1440.png` | 3D status ready. Oblique grey shell, front and top boundaries shown. Screen labels collide: `Winter coats #2` is drawn over the Wide bin size, so only `0×255×220` remains readable beside `#2`. `Winter coats` sits above that stack and `Documents` below. The 2D diagrams under the canvas keep those names in separate boxes. Captions still say the opening and the support face are not solid extrusions. |
| `spatial-ready-390.png` | Same solid grey shell, larger in the narrow viewport. The same 3D label stack: `Winter coats #2` covers the Wide bin size down to `0×255×220`. 2D diagrams below stay separated. |
| `spatial-cutaway-1440.png` | Front and top boundaries hidden. Blue interior inside the grey shell. The same 3D label collision: `Winter coats #2` over the Wide bin size, leaving `0×255×220`. |
| `spatial-cutaway-390.png` | The blue cutaway is obvious against the grey shell. The same overlapping 3D labels, with `0×255×220` the only readable part of the bin size. |
| `spatial-child-1440.png` | Interior view. Inspector selection is Winter coats, parent `Wide bin`. The driver picked `instance:item-a:0` inside `placement:p:c:0:0`. The canvas repeats the same collision: `Winter coats #2` over the Wide bin size, leaving `0×255×220`. `다시 실행 (1)` is the redo left by the saved-then-undone drag after reload. |
| `guide-focus-1440.png` | Accepted guide. Current step `구매합니다`, dotted step outline. Later rows say `선행 단계 필요`. The purchase target says some of it is not on the drawing. |
| `guide-focus-390.png` | Same step list in one column, including the dotted current step and prerequisite lines. |
| `guide-diagram-1440.png` | Diagrams plus `목록 강조` for the current step target. The list still contains `compartmentBoundary`. |
| `guide-diagram-390.png` | Both diagrams stacked, then the list starting at 입구 and Wide bin, ending on `compartmentBoundary`. |
| `a11y-focus-1440.png` | Keyboard Tab landed on `정면` (`view-front`). The button has a visible focus ring. Winter coats is the selected row. |
| `a11y-forced-colors-1440.png` | Forced colors: black strokes, white page, `평면에서 이동` drawn with a red pressed border. |
| `a11y-forced-colors-390.png` | Same forced-colors toolbar wrapped, diagrams in black and white, Winter coats outlined. |
| `a11y-zoom-200-1440.png` | Document `zoom: 200%` inside the 1440×1000 viewport. `검증된 작업 계획` and the toolbar fill the frame. |
| `progress-unavailable-1440.png` | `진행 기록을 읽지 못함`. `진행을 알 수 없어 다음 단계를 정할 수 없습니다.` `현재 단계: 없음`. Rows say `알 수 없음`. Completion was not invented. |
| `progress-unavailable-390.png` | Same pink notice and unknown rows in one column. |
| `conflict-1440.png` | Second tab. `다른 탭에서 먼저 저장되었습니다. 이 편집은 그 기록을 덮어쓰지 않습니다.` Below the banner the page still shows the plan-setup block (`계산 시작`, `아직 계산하지 않았습니다`) because that block stays above the workspace. `검증된 작업 계획` begins at the bottom edge. |
| `conflict-390.png` | Same banner and the plan-setup radios, then the start of `검증된 작업 계획`. |
| `conflict-progress-1440.png` | Guide notice `다른 탭의 저장 때문에 완료를 기록하지 않습니다.` The guide’s own current-step line reads `현재 단계: 없음` while that notice is up. |
| `conflict-progress-390.png` | Same notice and step list in one column. |
| `stale-1440.png` | After the interior width was committed as 610 mm and the plan was not recomputed. Banner `입력이 바뀐 뒤의 기록입니다`. The workspace has a dashed historical frame and the label `이전 계획 · 입력 변경`. Diagrams remain. |
| `stale-390.png` | Same two notices, dashed frame, and the compact front diagram. |
| `stale-progress-1440.png` | `입력이 바뀐 기록입니다. 완료를 바꾸지 않습니다.` `현재 단계: 없음`. |
| `stale-progress-390.png` | Same stale-progress notice and the step list. |
| `fallback-webgl-1440.png` | `이 브라우저에서는 WebGL을 쓸 수 없어 입체 보기를 열지 못했습니다.` 평면으로 보기 / 입체 보기 다시 시도. Both 2D diagrams stay. |
| `fallback-webgl-390.png` | Same fallback copy above the stacked diagrams. |
| `fallback-chunk-1440.png` | `입체 보기 파일을 불러오지 못했습니다.` 2D diagrams stay. Console recorded the aborted chunk (below). |
| `fallback-chunk-390.png` | Same missing-chunk notice and the stacked diagrams. |

Accessibility snapshot at the success moment: axe violations 0, passes 32, incomplete 1. The snapshot stores the counts, not the incomplete rule id. `ariaSnapshot` of `plan-workspace` is in `draft/zari007/a11y-snapshot.json`.

## Commands (final tree)

Shell prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH`, `CARGO_BUILD_JOBS=4`. Node from that prefix. Rust via `rust-toolchain.toml`. wasm-bindgen 0.2.128.

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
| `npm run lint` | exit 0 |
| `npm test` | vitest 14 files, 109 tests, exit 0 |
| `npm run build` | exit 0. Pre-existing chunk-size warning. Production `SpatialView-BI-biihS.js` |
| `node scripts/check-release-manifest.mjs` | exit 0, immediately after that production build. `buildId` `316427bb1c205c86`, 11 assets, `errors: []`, spatial chunk not in `index.html` |
| `node scripts/check-design-tokens.mjs --self-test` | 10 checker self-tests; 72 tokens; 39/39 contrast cases. No new pair |
| `ZARI_CAPTURE_DIR=/tmp/zari-spatial-007-cap5 npm run capture:baselines` | exit 0. 2 passed (25.9s). Probe capture 3.6s, spatial capture 21.1s. Directory did not exist beforehand |
| `node scripts/check-baseline-manifest.mjs` | exit 0. `approved 0; drafts 52; zari007 47; bytes 3496267; required 40` |
| `npm run test:browser -- --project=chromium` | First run: 58 passed, 1 failed (55.0s). `progress.spec.ts` create-project never showed `worker-state`. Immediate re-run: 59 passed (51.6s) |
| Firefox `npx playwright test --grep-invert "@parity\|@capture\|@bench" --project=firefox` | First run: 58 passed, 1 failed (1.3m). `responsive.spec.ts` 768px, same missing `worker-state`. Immediate re-run: 59 passed (1.0m) |
| WebKit `npx playwright test --grep-invert "@parity\|@capture\|@bench" --project=webkit` | First run: 58 passed, 1 failed (1.2m). `portable.spec.ts` deletion, same missing `worker-state`. Immediate re-run: 59 passed (1.3m). WebKit offline reload was not used; the existing cache-only note printed |
| `npm run test:parity` | exit 0. 2 passed (19.1s). Native and Chromium Worker/WASM agree on 107 shared fixtures |
| After the 3D label-overlap note: `node scripts/check-baseline-manifest.mjs`, `npm test`, `npm run lint` | exit 0. Checker still `approved 0; drafts 52; zari007 47`. Vitest 14 files, 109 tests. Lint clean. PNGs unchanged |

`Cargo.lock`, generated contracts, fixtures, and `.github/workflows` have no diff. `docs/evidence/ZARI-SPATIAL-001-yaw-offset.png` and `docs/evidence/ZARI-SPATIAL-001-unknown-offset.png` were rewritten by `spatial-view.spec.ts` and restored with `git checkout` of those two paths.

Scenario file sha256 recorded on the manifest: `capture-spatial.ts` `79fd22ae32b70d2d3084310b7186e43558014219078fb43a6984382ad0d55eb2`, `capture.spec.ts` `1845181617a91a8395000319b25a94d224a1da23a3f56172785dcfe394805c5f`.

## Browser flow

One sample project on the main page, then two more contexts for the fallbacks. Worker search timeout stayed 60s. `worker-state` timeout stayed 30s. The successful capture did not hit the create-project flake.

Console: required shots recorded no page errors. `fallback-chunk` recorded `Failed to load resource: net::ERR_FAILED` and `TypeError: Failed to fetch dynamically imported module` for `SpatialView-L8DuDDF5.js`. Those two lines are the aborted chunk. Save-failed and progress-unavailable allow console noise; neither shot recorded any.

## Parity

Unchanged contract. `npm run test:parity` exit 0, 107 shared fixtures, 2 passed.

## Known limits and open findings

- Physical phone: UNVERIFIED. 390×844 is Playwright viewport emulation.
- Discrete GPU: UNVERIFIED. Headless WebGL is SwiftShader. GPU timestamps were not taken. Hardware gate stays open.
- WebKit offline was not captured. Node 006 recorded that WPE crashes on `setOffline` plus reload.
- Sample plan has no `배치 N곳` BOM row. Same limit as 006. Not faked.
- The selected placement did not open `cavity-local`. Not faked.
- Open finding, not fixed here: the check list and the drawing list show raw identifiers `fact_unknown`, `elevation_unknown`, `cavity_unknown`, `compartmentBoundary`, and `itemEnvelope`. That text is the current product. Relabeling it is outside this capture task.
- Open finding, not fixed here: on `spatial-ready-1440`, `spatial-ready-390`, `spatial-cutaway-1440`, `spatial-cutaway-390`, and `spatial-child-1440`, the 3D label `Winter coats #2` is drawn over the Wide bin size label, so only `0×255×220` is readable. This is node 005 product behavior. Label collision avoidance is outside this capture task. The PNGs were not regenerated. The 2D diagrams in those same frames keep the names in separate boxes.
- The purchase step says some of its target is not on the drawing. The guide and the diagram were both captured as they are.
- Conflict and stale progress rows show `현재 단계: 없음` while their notices are visible. That is the guide’s own text in those states.
- Drag rejection evidence is the numeric move `19999`, not a pointer drag. Preview and the committed move are pointer gestures.
- Compact drag is a mouse pointer gesture. This host has no touch screen. Playwright touchscreen can only tap.
- `spatial-view.spec.ts` still rewrites the two tracked 001 evidence PNGs during the browser suite. They were restored.

## Contract advisory

No schema, fixture, digest, dependency, token, or workflow change.

## Deviations

- New files are `design/baselines/draft/`, which is the continuation clarification. The earlier spec spelling `drafts/` was not used.
- The existing probe capture resets through `about:blank` and allows 120s for five full loads. `zari001` images were not replaced.
- The save-failure hook fails IndexedDB `snapshots` add/put and `drafts` put. A second −15 mm drag reuses the snapshot row already stored by the first saved drag, so `snapshots.add` alone does not run.
- One capture attempt hung on a list-row click under the 3D view and was killed (exit 143). The child shot uses the canvas label instead. The published capture is the later fresh directory `/tmp/zari-spatial-007-cap5`.
- Create-project flake: one disclosed immediate re-run per engine, listed above. Timeouts were not raised. No retry helper was added. PR #38 was not modified.

## Out of scope

No screen was approved. No pixel-threshold update. No deploy. No feature redesign. No phone, discrete GPU, or WebKit draft capture.
