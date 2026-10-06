# ZARI-SPATIAL-005 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots were not stored. Playwright failure images under `test-results/` are local debug output, not an approved baseline. The supervisor commits this tree; the final full HEAD SHA is that commit.

- Task: GitHub issue #51, node 005, “읽기 전용 구획 3D와 모든 뷰 선택 연동”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-005`.
- Observed base SHA: `dd726ef30e20f95f1d2f03c082462dc019a0b118` (origin/main at branch creation; plan commit is an ancestor).
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2, §3, §8 SP-005, §11; `design/SPATIAL_WORKSPACE.md` §§6, 8; `docs/SPATIAL_VIEW_CONTRACT.md`; `docs/SPATIAL_VERIFICATION.md` §§4, 6, 7; `docs/SPATIAL_INTERACTION_PLAN.md` §7; `design/DECISIONS.md` D007; `docs/ARCHITECTURE.md`; `docs/FRONTEND.md`; `docs/evidence/ZARI-SPATIAL-001.md` through `004.md`. Candidate / NON_EXECUTABLE program drafts were not used as extra scope.

## Qualified dependency

Registry check on 2026-10-06. `three@0.186.1` is published, MIT, integrity `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`. The package has no bundled types. `@types/three@0.186.1` is not published. The closest published types are `@types/three@0.186.0`, MIT, integrity `sha512-mxYSBpDC+D0pLfSP6sW4WZTcT+nrtmZcimMqnVmy36Hte3XpeYSrvgg4TRdaM1GemGog1AWzI5qL2VoIfMXbJQ==`. Both are exact pins in `apps/web/package.json` (`three` dependency, `@types/three` devDependency). `tsc --noEmit` accepts the API this node uses (WebGLRenderer, OrthographicCamera, InstancedMesh, OrbitControls, Raycaster, PlaneGeometry, BoxGeometry, EdgesGeometry). R3F, Drei, WebGPU, and remote assets were not added.

`npm audit` on this tree: 2 findings, neither on the `three` graph. `esbuild@0.28.0` low (Windows development server file read; already a direct devDependency). `source-map-js@1.2.1` high via `vite` → `postcss` (already present). This node does not upgrade those tools. `@types/three` installs type-package dependencies (`@dimforge/rapier3d-compat`, `@tweenjs/tween.js`, and others). The app does not import them. They are absent from `apps/web/dist/assets/*.js`.

## What changed

Rust, fixtures, generated contracts, and `Cargo.lock` are unchanged. The 3D view reads the existing projection. It does not edit, and it does not send a move.

- `features/spatial3d/`: domain millimetres map to Three metres as `(X, Y, Z) = (x, z, -y) / 1000`. A world box is already yaw-applied; meshes stay axis-aligned. Missing height, unknown offset, and zero-thickness faces stay out of the mesh and are listed. Compartment walls are boundary planes, not a measured thickness. Default cutaway hides the front and top boundary. “수납함 내부 보기” hides only the selected container’s outer surface and then allows content picking.
- One orthographic camera. Presets 비스듬히 / 위에서 / 앞에서 share the same fit height. Orbit stays on the compartment center, does not pan, does not damp, and does not go below the horizon. Demand rendering: one frame on source, selection, focus, camera, resize, or style change. No shadows, postprocessing, or `preserveDrawingBuffer`.
- `SpatialView.tsx` is the only React module that imports Three. The workspace loads it with `React.lazy` on the first “입체” click. Vite `modulePreload` drops that chunk. The production `index.html` does not reference it. `zari-build.json` lists it because the existing out-dir walk already includes lazy chunks.
- The engine stays mounted while the plan workspace toggles between 2D and 3D, so a view switch does not allocate another WebGL context. It disposes listeners, geometries, materials, controls, and the context when the view fails or the workspace unmounts. A lost context or a missing chunk shows the 2D diagrams again. Retry is an explicit button.
- Workspace selection, BOM focus, check focus, and the current step are the same `WorkspaceState` as 002–004. Camera, cutaway, and zoom do not change `data-spatial-requests` or `data-project-revision`.
- `docs/ARCHITECTURE.md`, `docs/FRONTEND.md`, and `design/DECISIONS.md` D007 record the pin and the retained SVG/2D fallback. No new color token. Labels use the existing primary-on-panel pair. Buttons use `--zari-control-min-height`.

## Acceptance mapping

| Acceptance | Test |
|---|---|
| Rotated asymmetric child matches 2D and the Rust fixture | `spatial3d.test.ts` reads `fixtures/spatial/spatial-yaw-offset.json`: world `[380,240,5]–[440,290,75]`, top and front rectangles, Three center `(0.410, 0.040, -0.265)` m, no second yaw. Browser: 4/4 live labels match top SVG rectangles |
| Missing height or offset stays unavailable | Unit: `offset_unknown` fixture and a missing-height boundary produce no cuboid and keep the reason. The sample aperture is not extruded |
| Camera and cutaway never edit the snapshot | Browser: preset, cutaway, and zoom leave `data-spatial-requests` and `data-project-revision` unchanged. Unit: `planScene` does not change the projection JSON |
| View changes keep focus and source | Browser: inspector text and revision survive opening 3D; BOM focus marks a 3D label |
| No 3D code or network before the button | Browser: no script contains `zari-spatial3d-module` before the click; the HTML does not either. After the click, one local chunk does |
| Browser selects a container and an instance; BOM multi-set | Chromium, Firefox, and WebKit: top-view canvas click selects `placement:…`, interior view then selects `instance:…`. The sample plan has no `배치 N곳` line. The single BOM focus marks 1 label. Unit: two placement targets on one BOM link |
| Context loss and disabled WebGL keep 2D | Browser: `webglcontextlost` shows `context_lost` and the top diagram still picks. `getContext` returning null shows `webgl_unavailable`; front view, zoom, and BOM remain. A blocked chunk shows `import` |
| 20 switches stay bounded | Browser: 20 toggles, geometry count stays 3, `spatialLive` stays 1 while the workspace is open and returns to 0 after context-loss dispose |
| Bundle and first frame are measured | See measurements. Targets are recorded only where a number was measured |

## Commands (final tree)

Shell prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH`, `CARGO_BUILD_JOBS=4`. Node v24.19.0, npm 11.17.0. Rust via `rust-toolchain.toml`. wasm-bindgen 0.2.128.

The full `fixtures` runner was executed twice. The first terminal capture truncated its JSON. The counted run redirected stdout and exited 0 with 107 cases. Bootstrap was counted from the first run (28, exit 0).

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
| `npm test` | vitest 12 files, 105 tests, exit 0 |
| `npm run build` | exit 0. Pre-existing chunk-size warning. Production `SpatialView-cpWzG7W7.js` is not referenced by `index.html` |
| `node scripts/check-design-tokens.mjs --self-test` | 10 checker self-tests; 72 tokens; 39/39 contrast cases. No new pair |
| `npm run test:browser -- --project=chromium` | 53 passed (37.7s). Includes `spatial3d.spec.ts` (4). No project-startup flake in this run |
| `npm run test:parity` | exit 0. 2 passed (14.8s). Native and Chromium Worker/WASM agree on every fixture |
| Firefox `spatial3d.spec.ts` | 4 passed (21.0s) |
| WebKit `spatial3d.spec.ts` | 4 passed (21.6s) |

`Cargo.lock` and generated `apps/web/src/contracts/` are unchanged. `package-lock.json` changes are the two new packages and the type package’s own dependencies.

## Measurements

Production build `npm run build`, file `apps/web/dist/assets/SpatialView-cpWzG7W7.js`:

| Quantity | Measured | Target | Result |
|---|---|---|---|
| Raw | 576,274 bytes | — | recorded |
| gzip level 9 | 143,511 bytes (140.15 KiB) | ≤ 250 KiB compressed incremental | met |
| Brotli quality 11 | 118,053 bytes (115.29 KiB) | ≤ 250 KiB | met |

Vite’s own gzip line for that file was 144.93 kB. The test-build chunk the browsers downloaded (`SpatialView-B9n9Q0OW.js`) was 576,306 bytes, Vite gzip 144.95 kB.

Headless Playwright, local preview, chunk already on that server. One run per engine. This is not a GPU lab sample. The context came up on all three engines (likely software: Chromium SwiftShader, Firefox llvmpipe, WebKit WPE). The disabled-WebGL test is the fallback path.

| Engine | Click to `data-status=ready` | In-module first frame (`data-ready-ms`) | `renderer.render` (`data-frame-ms`) | Click until `data-renders` changes after cutaway | Idle 5 s | 20 toggles |
|---|---|---|---|---|---|---|
| Chromium | 827 ms | 59 ms | 0.3 ms | 46 ms | render count stayed 7 | geometries stayed 3 |
| Firefox | 550 ms | 83 ms | 1 ms | 57 ms | render count stayed 6 | geometries stayed 3 |
| WebKit | 602 ms | 79 ms | 1 ms | 167 ms | render count stayed 6 | geometries stayed 3 |

First-ready target ≤ 1000 ms: met on these three clicks. Draw-call target ≤ 16 ms: met (`data-frame-ms` ≤ 1 ms). The coarser click-to-next-dataset time includes React and Playwright and was above 16 ms on every engine, 167 ms on WebKit. That coarser number is not claimed as the 16 ms frame budget.

## Browser

- Route: `#/project/<id>/plan` after create-project, fill-sample, commit, compute, and a purchase plan when one exists. Real IndexedDB and WASM. No mocked solver.
- Chromium success flow also ran inside the full 53-test suite. Firefox and WebKit ran `spatial3d.spec.ts` only. CI’s browser job remains Chromium.
- Before the button, no loaded script contains `zari-spatial3d-module`. After it, the local `SpatialView-*.js` chunk does. Canvas click selects a container, then an instance in interior view. Presets and cutaway do not bump the projection request or the project revision. Keyboard arrows on the canvas move the same selection as the text list.
- 1440×1000 for the main flow. 390×844 closes the compact inspector sheet (it opens on selection at that width), then checks the 입체 and preset buttons at ≥ 44 px, forced-colors note, and canvas keyboard.
- Context loss and a null WebGL context return to the top/front diagrams. Console `error` on the success path was empty, including after the synthetic context-loss event. The missing-chunk test allows the browser’s failed-request log.
- Offline: after the service worker promotes the build, the spatial chunk is in Cache Storage on Chromium, Firefox, and WebKit. Chromium and Firefox then go offline without a reload and the first 3D click reaches `ready`. WebKit does not combine `setOffline` with reload (WPE crashes; same limit as `portable.spec.ts`). Its check is the cache hit only.
- No draft screenshot was stored under `docs/evidence/`.

## Limits

- The sample search does not emit a BOM line with more than one placement. Multi-target focus is the unit test. The browser checks the one placement the sample BOM links.
- 390×844 is Playwright emulation, not a phone. No discrete-GPU timing was taken.
- WebKit’s first offline 3D click was not executed. The chunk is in the staged cache.
- One WebGL context stays allocated while a plan workspace that has opened 3D is still mounted, including on the 2D tabs. It is released when 3D fails or the workspace unmounts.
- Nodes 006 and 007, 3D editing, room walk, free meshes, photo textures, and remote assets are out of scope.

## Contract advisory

No schema, fixture expected output, snapshot digest, or generated DTO change. The new runtime dependency is local `three@0.186.1` only.
