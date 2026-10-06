# ZARI-SPATIAL-006 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots were not stored. Playwright failure images under `test-results/` are local debug output, not an approved baseline. The supervisor commits this tree; the final full HEAD SHA is that commit.

- Task: GitHub issue #53, node 006, “다섯 기능의 통합 품질·오프라인·성능 측정”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-006`.
- Observed base SHA: `2865869f33a05f7c19256547eabcf1e1642617b8` (origin/main at branch creation; plan commit is an ancestor).
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2, §3, §9 SP-006, §11; `docs/SPATIAL_VERIFICATION.md`; `docs/TEST_STRATEGY.md`; `docs/PERFORMANCE_SECURITY_FAILURES.md`; `docs/INV01_MESSAGING_RESIDUAL.md`; `docs/evidence/ZARI-SPATIAL-001.md` through `005.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/ARCHITECTURE.md`. Candidate / NON_EXECUTABLE program drafts were not used as extra scope.

## What changed

Rust, fixtures, generated contracts, `Cargo.lock`, and `.github/workflows` are unchanged. Existing fixture expected JSON is unchanged. No new runtime dependency. No new color token. Instrumentation is `data-*` attributes.

- Projection replies are accepted only when the plan stamp and the input stamp match the source that was requested. A mismatch publishes `projection_source_mismatch` and is not cached. Test-mode hooks (`__zariCorruptProjection`, `__zariProjectionGate`) exist only when `import.meta.env.MODE === 'test'`. The production build check rejects those identifiers in `apps/web/dist`.
- The plan page shows the existing worker-failed / retry panel when the worker is `failed`. The drawing and the project revision stay. Retry uses the same `workerController.recover()` path as the project page.
- `accountElements` classifies every projected element (mesh, boundary, measurement frame, unavailable, unclassified) without changing what `planScene` draws. The 2D text list appends roles that are not drawn as SVG rectangles. Drawn `WORLD_ROLES` and cuboid roles are unchanged.
- The bench contract is `zari-bench-3`. Every `zari-bench-2` stage and threshold stays. New rows split Rust `projectSpatialView` into source (`workerComputeMs`), encode, decode, and transport (`workerMs - workerComputeMs`). `initialize` stays out of the residual and projection-transport rows. Pointer preview is `updateMove` plus one animation frame and does not call the worker. 3D rows are scene build, first ready, changed frame, one 5 s idle window, and 20 dispose cycles. A p95 over a timing target is recorded as `exceeded` and does not fail the bench. Idle draws other than 0, dispose cycles other than 20, a live context after dispose, an unclassified element, a placement id missing from the projection, or a worker/direct projection mismatch does fail the bench.
- Reference geometry is `fixtures/spatial/spatial-yaw-offset.json` (8 elements). `bench-search-reference` exhausts its budget with zero alternatives, so the stress snapshot is the first live alternative of `bench-search-small` (24 elements). Fifty `projectSpatialView` calls reuse that snapshot. Worker JSON and in-page `handle_json` JSON are compared. No new fixture file was added.
- `scripts/check-release-manifest.mjs` checks the production `apps/web/dist` after `npm run build`: every file except `zari-build.json` is listed, paths are relative, exactly one `assets/SpatialView-*.js` exists and `index.html` does not reference it, and the test-only hooks are absent. It is not a package.json script. `npm run test:browser` rebuilds `dist` in test mode afterwards, so the production check has to run before that.

## Acceptance mapping

| Acceptance | Test |
|---|---|
| Same fixtures, native and browser, at this tree | `cargo test` 83; fixture_runner bootstrap 28 and full 107; `contracts:check` 107; `npm run test:parity` 107 shared fixtures, 2 passed |
| Chromium / Firefox / WebKit separately | Full non-bench suite below. Bench 12 passed on each engine |
| Cold 20 / warm 50, reference and stress, p95 labeled | `npm run bench:browser` per engine. Artifact `test-results/bench/bench-<engine>.json` (gitignored). Numbers below |
| Source, encode, decode, transport separate | Bench rows `projectionSource`, `projectionEncode`, `projectionDecode`, `projectionTransport`. Encode/decode targets use the yaw fixture only |
| Idle draws 0 | Bench `idle3d` p95 0 on all three engines. UI bench and `spatial3d.spec.ts` also hold the render count for 5 s |
| No silently omitted objects | Stress placement ids missing from the projection: `[]`. Unclassified: 0. Drawn reference 3, stress 17 |
| No hidden external data requests | UI bench records an empty external-host list. Production spatial chunk is not in `index.html` |
| Controls not overridden by the failure injections | Quality browser: mismatched stamp, late reply, worker crash, and progress save/read failure leave the revision unchanged and keep the diagram or the retry control |
| Malicious imported strings, no HTML path | Quality browser: RLO plus `<img>` / `<script>` stays text. An HTML upload is rejected as JSON. Unit scan: no `dangerouslySetInnerHTML`, `innerHTML` assignment, `eval(`, or `new Function(` under `apps/web/src` |
| Keyboard, responsive, 200%, reduce, forced-colors | `quality.spec.ts` plus the existing `responsive.spec.ts` and `a11y.spec.ts` |
| Offline initial 3D from the local release cache | Chromium and Firefox: offline click reaches `ready`. WebKit: cache hit only (below) |
| Phone or discrete GPU, or the hardware gate stays open | No phone and no discrete GPU on this host. Recorded `UNVERIFIED`. Optional 3D still falls back when WebGL is missing (`spatial3d.spec.ts`) |
| Existing browser timeout investigated, not papered over | `project.spec.ts` and `portable.spec.ts` repeated. No `worker-state` timeout. Timeouts were not raised. PR #38 was not modified |

## Commands (final tree)

Shell prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH`, `CARGO_BUILD_JOBS=4`. Node v24.19.0. Rust via `rust-toolchain.toml`. wasm-bindgen 0.2.128.

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
| `npm test` | vitest 13 files, 108 tests, exit 0 |
| `npm run build` | exit 0. Pre-existing chunk-size warning |
| `node scripts/check-release-manifest.mjs` | exit 0. `buildId` `316427bb1c205c86`, 11 assets, `errors: []` |
| `node scripts/check-design-tokens.mjs --self-test` | 10 checker self-tests; 72 tokens; 39/39 contrast cases. No new pair |
| `npm run test:browser -- --project=chromium` | First 4-worker run: 57 passed, 2 failed (1.0m). Both stayed on the project list after create-project (`worker-state` absent). Immediate re-run: 59 passed (49.3s) |
| Firefox `npx playwright test --grep-invert "@parity\|@capture\|@bench" --project=firefox` | 59 passed (1.0m), 0 failed |
| WebKit `npx playwright test --grep-invert "@parity\|@capture\|@bench" --project=webkit` | 59 passed (1.2m), 0 failed |
| `drag.spec.ts` Chromium / Firefox / WebKit | 3 passed each (10.8s / 13.1s / 14.8s) |
| `npm run bench:browser -- --project=chromium` | 12 passed (4.3m) after the lazy-chunk size fix. Earlier three-engine benches (12/12/12) used the wrapper-only size |
| `npm run bench:browser -- --project=firefox` | 12 passed (8.1m), before the size-row fix |
| `npm run bench:browser -- --project=webkit` | 12 passed (4.5m), before the size-row fix |
| `npm run test:parity` | exit 0. 2 passed (19.2s). Native and Chromium Worker/WASM agree on 107 shared fixtures |

`Cargo.lock`, generated `apps/web/src/contracts/`, fixtures, and `.github/workflows` have no diff.

## Measurements

Host recorded by the bench: Intel Xeon, 8 logical cores, 16,791,158,784 bytes RAM, headless, loopback Vite preview, no throttle, power unmeasured. Cold 20, warm 50. Browser versions: Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6. Artifacts written 2026-10-06: Chromium `11:34:39Z`, Firefox `11:39:06Z`, WebKit `11:47:20Z`.

p95 at or under the target is `met`. Over the target is `exceeded` and the bench still passed, except the rows that are assertions (idle 0, dispose 20, oracle, omitted ids). Phone column is `unmeasured` on every row. GPU timestamp queries were not taken. `frame3d` is CPU time inside `renderer.render`.

| Stage | Target | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| wasmTransferCompile | 1000 ms | 225.60 met | 156.00 met | 259.00 met |
| normalization | 20 ms | 13.20 met (`bench-normalize-reference` / `normalizeInput`) | 20.00 met | 36.00 exceeded (same command) |
| searchStep | 8 ms | 0.60 met | 1.00 met | 1.00 met |
| messagingResidual | 10 ms | 27.10 exceeded (`bench-search-reference` / `activateProject`) | 2.00 met | 2.00 met |
| serialization | 20 ms | 6.70 met | 39.00 exceeded (`bench-search-reference` / `activateProject`) | 4.00 met |
| cancelAck | 100 ms | 0.40 met | 1.00 met | 1.00 met |
| draftTransaction | 50 ms | 4.70 met | 9.00 met | 8.00 met |
| snapshotSaveReload | 200 ms | 36.40 met | 36.00 met | 41.00 met |
| projectionSource | 20 ms | 3.80 met | 5.00 met | 4.00 met |
| projectionEncode | 10 ms | 0.30 met | 1.00 met | 1.00 met |
| projectionDecode | 10 ms | 0.20 met | 1.00 met | 1.00 met |
| projectionTransport | 10 ms | 0.80 met | 1.00 met | 2.00 met |
| render2d | 16 ms | 1.70 met | 4.00 met | 3.00 met |
| pointerPreviewJs | 8 ms | 0.10 met | 1.00 met | 0.00 met |
| pointerPreviewPaint | 32 ms | 16.80 met | 18.00 met | 17.00 met |
| first3dReady | 1000 ms | 457 met | 421 met | 352 met |
| frame3d | 16 ms | 0.50 met | 2.00 met | 1.00 met |
| scene3d | 20 ms | 0.20 met | 1.00 met | 1.00 met |
| idle3d | 0 draws | 0 met | 0 met | 0 met |
| spatialGzipKiB | 250 KiB | 140.80 met | same files | same files |

The Chromium column is the bench re-run after the size-row fix (12 passed, 4.3m). Firefox and WebKit timing columns are the earlier cold-20/warm-50 runs. `spatialGzipKiB` is not a per-engine timer. It is the summed gzip of the test build’s lazy 3D JS set, measured in that Chromium run.

`first3dReady` is the max of harness `data-ready-ms` and the UI click-to-ready time. The click includes React and Playwright. On the Chromium re-run the row is 457 ms. The earlier three-engine clicks were 463 / 421 / 352. The click is not claimed as the 16 ms frame budget.

`scene3d` reuses the 20 ms projection target for `planScene`. It is not the Rust projection row.

Yaw reference payload, all three engines: request 33,593 bytes, response 30,658 bytes. Stress snapshot: request 143,886 bytes, response 223,856 bytes. Worker and direct projection JSON matched. Omitted placement ids: none. Unclassified: 0. Dispose cycles: 20. `geometryStable` true: a second selection did not allocate another geometry after the shared `EdgesGeometry` uploaded (renderer geometry count 2 at first ready, 3 after the first outline, then stable).

`spatialGzipKiB` is the sum of gzip level 9 over every JS chunk that the initial `index.html` static graph does not already load and that the `SpatialView` entry does load. On the test build that set is `SpatialView-L8DuDDF5.js` plus `scene-TKedKJ_Z.js` (three.js). Raw 577,830 bytes. Gzip sum 140.80 KiB. Brotli sum 115.93 KiB. `spatialInIndex` false. Target 250 KiB: met. The earlier 2.35 KiB row was only the wrapper and is not the measurement.

Production `npm run build`, then `node scripts/check-release-manifest.mjs` (same lazy-set rule, gzip level 9, Brotli quality 11). Production keeps three.js inside the one lazy chunk:

| Quantity | Measured | Target | Result |
|---|---|---|---|
| Lazy set | `assets/SpatialView-BI-biihS.js` only | — | three.js is inside this chunk |
| Raw | 576,505 bytes | — | recorded |
| gzip level 9 | 143,561 bytes (140.20 KiB) | ≤ 250 KiB | met |
| Brotli quality 11 | 118,033 bytes (115.27 KiB) | ≤ 250 KiB | met |
| Referenced by `index.html` | no | lazy | met |
| `buildId` | `316427bb1c205c86` | — | `errors: []` |
| Vite’s own gzip line for that file | 144.98 kB | — | recorded, different compressor |
| WASM raw | 5,379.68 kB (Vite) / 5,379,689 bytes (bench) | — | recorded |
| WASM gzip | Vite line 821.30 kB; bench level-9 on the test-build file 792.2 KiB | ≤ 2 MiB compressed | met |
| Production index JS gzip (Vite) | 248.96 kB | initial JS+CSS ≤ 500 KiB | met together with CSS |
| Production CSS gzip (Vite) | 5.93 kB | same | met |
| Test-build index JS+CSS gzip level 9 | 245.37 KiB | same historical ceiling | met; this is the bench `initialJsCssGzipKiB` |

Phone targets (changed frame ≤ 33 ms, preview input→paint ≤ 50 ms, cached first 3D ≤ 1500 ms) are `unmeasured`.

## Browser

- Route for the quality and UI flows: `#/project/<id>/plan` after create, sample fill, commit, compute, and a plan card. Real IndexedDB and WASM. The harness bench uses `/tests/harness.html` and does not render the app shell.
- Chromium, Firefox, and WebKit each finished a full 59-test suite with 0 failures (Chromium on the re-run below). `drag.spec.ts` is 3 passed on each engine. Plane drags use `page.mouse` move/down/up, with `steps` on the moves that need intermediate `pointermove` events. Escape, a second pointer, leaving the diagram, resize, the halfway sample, the final release, and the front-view drag are unchanged: one move command on pointerup, none during pointermove. Playwright’s touchscreen API can only tap, so the compact 390px drag is the same pointer gesture. The touch-action and explicit-mode checks stay. CI remains Chromium-only. Workflows were not edited.
- Quality flows, Chromium, Firefox, and WebKit: mismatched stamp fails closed (`projection_source_mismatch`) and a fresh search recovers; a held reply does not replace the visible plan snapshot; worker crash on the plan page keeps the text list and retry restores the diagram; progress put/read failures show `action-error` / `progress-unavailable` and do not check a box or bump the revision; imported markup stays text and an HTML file is rejected; keyboard Enter on front/top/next/입체, viewports 320/390/768/1440, CSS zoom 200% (layout width is `body`, document scroll may be body×zoom), `prefers-reduced-motion: reduce` (`--zari-duration-fast` 0), and `forced-colors: active`. Those quality tests assert an empty console error list.
- `spatial3d` console after the synthetic context-loss event: `none` on all three engines. Chromium offline click: `ready from cache`. Firefox: `ready from cache`. WebKit: `webkit cache verified; offline reload is not used`.
- Viewport 1440×1000 is the Playwright default. 320/390/768 are emulation, not a phone. 390×844 checks the 입체 control height in `quality.spec.ts`.
- No draft screenshot was stored under `docs/evidence/`.

## Timeout investigation

The known intermittent failure is `project.spec` / `portable.spec` waiting on `worker-state` after create-project. This tree did not raise timeouts, add retries, or edit PR #38.

Runs of those files with no `worker-state` timeout, before this fix pass: Chromium full suite plus 2 dedicated repeats; Firefox and WebKit full suite plus 1 dedicated repeat each.

On this pass, one Chromium 4-worker suite reproduced it: `progress.spec.ts` “accepted steps…” and `quality.spec.ts` “late projection reply” stayed on the empty project list for 30s after `create-project`. `worker-state` was absent. The immediate re-run of the same 59 tests passed (49.3s), including those two. Firefox and WebKit full suites on this pass passed 59/59 with no miss. Cause of the missed navigation is still unknown. Timeouts were not raised. Retries were not added. PR #38 was not touched.

## Limits

- No physical phone. No discrete GPU. Hardware gate stays open. Optional 3D still shows the 2D fallback when WebGL is missing. Playwright device emulation is not a phone result. Headless WebGL on this host is not a discrete-GPU sample, and GPU frame time is unmeasured.
- WebKit offline reload is a tooling limit (WPE crashes on `setOffline` plus reload). Chromium and Firefox execute the offline 3D click. WebKit checks that the spatial chunk is in the staged cache.
- One WebGL context stays allocated while a plan workspace that has opened 3D is mounted, including on the 2D tabs. That is the 005 behavior. Dispose of that engine still runs on failure and on workspace unmount. The bench’s 20 create/ready/dispose cycles each call `loseContext` on their own canvas.
- The sample plan still has no multi-placement BOM line (`spatial3d` log: focused labels 1).
- `drag.spec.ts` no longer calls `browserContext.newCDPSession`. The compact drag does not send a `pointerType: touch` move, because Playwright’s cross-engine touchscreen can only tap. The product still commits from `pointerup`.
- Playwright Firefox click does not deliver the pointer events React Aria uses for `onPress`. The probe “예제 값으로 되돌리기” step uses focus and Enter. Chromium and WebKit pass that step with Enter as well.
- The UI mouse-gesture preview attributes are best-effort. The pointer-preview target rows are the harness `timePreview` samples, not that gesture. `Number(null)` is 0, so a missing UI attribute is stored as 0 in `report.ui`.
- `bench-search-reference` is still the warm search fixture. It is not the stress projection source, because its expected `alternativeDigests` length is 0.

## Contract advisory

No schema, fixture expected output, snapshot digest, or generated DTO change. No dependency change. The bench artifact name moved from `zari-bench-2` to `zari-bench-3` by adding rows. Old thresholds were not edited.

## Out of scope

Node 007 captures and approved baselines, a GPU server, render-data simplification, threshold changes, CI edits, and an automatic beta release were not done.
