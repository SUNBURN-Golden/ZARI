# ZARI-SPATIAL-002 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots are not an approved baseline; this node adds no picture to the evidence folder.

- Task: GitHub issue #45, node 002, “측정·선택·검사 작업대”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-002`.
- Observed base SHA: `52ffba6157cd583315fd38da400f045b31568f51` (origin/main at branch creation; plan commit is an ancestor). The supervisor commits this working tree and opens the ready PR.
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2, §3, §5, §11; `design/SPATIAL_WORKSPACE.md` §§1–3,5,8; `docs/SPATIAL_VIEW_CONTRACT.md` §§1–3,7; `design/WORKSPACE_BLUEPRINT.md`; `docs/SPATIAL_VERIFICATION.md`; `docs/evidence/ZARI-SPATIAL-001.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`. Candidate / NON_EXECUTABLE program drafts were not used as extra scope.

## Frozen WorkspaceState (G1b, before 003–005)

TypeScript view state only. It is not a domain DTO, not persisted, and not a generated contract. Defined in `apps/web/src/features/workspace/model.ts` and covered by `apps/web/tests/unit/workspace.test.ts`.

```ts
type DisplayBinding = {
  projectId: string;
  sourceKey: string;          // plan:<planSnapshotId> or input:<inputDigest>
  planSnapshotId: string | null;
  inputDigest: string;
};

type WorkspaceFocus =
  | { kind: 'none' }
  | { kind: 'measurement'; fieldPath: string }
  | { kind: 'check'; checkId: string }
  | { kind: 'bom'; bomLineId: string }
  | { kind: 'action'; stepId: string };

type WorkspaceView = 'top' | 'front' | 'spatial'; // spatial is reserved; no control is shown

type WorkspaceState = {
  binding: DisplayBinding;
  selection: SpatialTarget | null;
  hover: SpatialTarget | null;
  focus: WorkspaceFocus;
  view: WorkspaceView;
  layers: { dimensions: boolean; contents: boolean; checks: boolean }; // checks default off
  projectionState: 'loading' | 'ready' | 'failed';
};
```

Rules tested with the type:

- A new `sourceKey` clears selection, hover, and focus. The same project's measurement focus is kept when `planSnapshotId` stays null.
- View is kept across a source change. Layers do not clear selection.
- Hover does not change selection or focus.
- `selectedPlacementId` on the session is set only for `selection.kind === 'placement'`. An `itemInstance` does not arm move.
- Check, BOM, and action focus highlights `projection.links` for that source. `resolution: 'unavailable'` highlights nothing. A BOM link highlights every target, not one representative.
- Focus, view, selection, and layer changes do not call `session.edit` and do not bump `projectRevision`.

`spatial` remains in the type so 005 can add a control. This node does not render “공간 보기”.

## What changed

SP-001 `projectSpatialView`, plan cache/lease, and domain-plane rectangles are reused. Rust, fixtures, generated contracts, and `Cargo.lock` are unchanged.

- `features/workspace/model.ts`, `selection.ts`, `viewport.ts`, `projection.ts`: binding, selection adapter, fit/zoom CTM, measurement drawing, cavity pane, check overlays.
- `MeasurementDiagram.tsx`, `PlanDiagram.tsx`, `InspectorLayers.tsx`, `Workspace.tsx`: measurement schematic/scaled diagram, both plan views, text list, toolbar, compact inspector sheet.
- `ProjectScreen.tsx` reads the input projection and focuses the eleven editable fields. `DimensionField.tsx` keeps focus across the unit `<select>`.
- `PlanScreen.tsx` renders `PlanWorkspace` and keeps the edit inspector, BOM, checks, and guide on the same snapshot. The old local diagram functions were removed.
- `session.ts` adds `ensureInputProjection` (`input:<digest>`, same cache and lease as plans) and `spatialRequestCount`. After `activate()` drops in-flight system requests, the input projection is requested again. A `StaleRequest` is not stored as a failed drawing.
- Tokens `--zari-unknown`, `--zari-stale`, `--zari-preview` and six contrast cases. Diagram strokes in `project.css` use semantic tokens.

## Acceptance mapping

| Acceptance | Test |
|---|---|
| All 11 editable fields have a guide | `workspace.test.ts` captions; browser focuses each label and checks `measurement-caption` / `focus-context` |
| Unknown or invalid is never a fake scaled region | Unit: stale/invalid/single-axis stay schematic with no segment. Browser: empty opening height → `미측정` and `data-scale=none`; `abc` keeps `600 mm` on `data-historical` and drops the segment |
| Focus / view / selection / layer write no revision and no new `projectSpatialView` | `data-spatial-requests` and `data-project-revision` unchanged across those actions. Unit: one digest sends one `projectSpatialView`; the repeat is a cache hit |
| Current input vs historical plan | `workspace-scope` “현재 계획” vs “이전 계획 · 입력 변경”; `data-historical`; existing `stale-plan-notice` |
| Child vs parent | Contents button selects `itemInstance`, shows `inspector-child` and `move-disabled`, hides the move form; “부모 선택” restores the placement inspector |
| Dimensions, outer/inner, provenance | `inspector-dimensions`, `inspector-provenance`; commerce lines stay on the same snapshot (`inspector-commerce`, BOM money/qty text) |
| 320 / 390 / 768 / 1440 and 200% | Measurement page overflow check at those widths and `zoom: 200%`. Plan `data-band` compact / medium / wide. Existing responsive suite still passes |
| Keyboard and forced-colors | Tab from the width field to its unit select keeps one `data-focused` field. Plan `+` / `0` zoom the focused diagram. Text-list Enter selects. Forced-colors still shows 확인됨/실패/미확인/해당 없음 as text |
| CTM | Unit: zoom about the frame center leaves pan at 0 and matches the old fit viewBox (`top` pad 20, `front` pad 16). Browser: segment local `(x,y)` through the group CTM matches SVG user `(x,-y)` |
| Checks opt-in, BOM focus | Overlays absent before “검사”. Check and BOM buttons set focus. Multi-placement BOM uses the whole link target set in the unit test |

## Commands (final tree)

Shell prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH`, `CARGO_BUILD_JOBS=4`. Node v24.19.0.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 83 tests: core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14. Solver/wasm/doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 cases |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 107 cases |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. No DuckDB, Polars, Python, or CUDA |
| `npm run wasm:build && npm run contracts:check` | wasm-bindgen 0.2.128. Contracts match; 107 fixture structures valid |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | vitest 9 files, 76 tests, exit 0 |
| `npm run build` | exit 0 |
| `node scripts/check-design-tokens.mjs --self-test` | 10 checker self-tests; 72 tokens; 39/39 contrast cases |
| `npm run test:browser -- --project=chromium` | 43 passed (20.7s). Chromium, locale `ko-KR`, default viewport 1440×1000 |
| `npm run test:parity` | native and Chromium Worker/WASM agree on 107 fixtures; 2 `@parity` tests passed |

`Cargo.lock` and generated `apps/web/src/contracts/` are unchanged.

## Browser

- Route: project measurement (`#/project/<id>`), then plan (`#/project/<id>/plan`).
- Engine: Playwright Chromium. Real IndexedDB and WASM Worker. No mocked solver.
- Flow that passed: sample commit → scaled width diagram and CTM → every field caption → unknown opening height → invalid `abc` (schematic, historical 600 mm) → reload → unit mm→cm through Rust → reload → 320/390/768/1440 and 200% zoom without horizontal overflow. Plan: both diagrams, fit viewBox, zoom keys, layer toggles, placement vs contained item, check focus, BOM focus, historical plan after a new commit. Console `error` and `pageerror` lists in `workspace.spec.ts` were empty.
- Compact (`<48rem`): the inspector sheet opens when a placement is already selected, so the existing 390px edit test still sees `inspector` without an extra click.
- No draft screenshot was stored under `docs/evidence/`.

## Limits

- Rust emits `DimensionGuide` for the five space paths only. An item is a scaled silhouette only when `measurementBox` is available (all three envelope axes). One known item axis stays text plus “축척 없음”. Synthesizing a two-axis item rectangle in TypeScript would be a physical recomputation, and adding Rust guides would change spatial fixtures. Neither was done.
- An opening segment is drawn only when the projector emits one, which requires both opening axes.
- Arrow keys stay 10 mm, Shift 1 mm. Drag, pan mode, and 3D are not in this node.
- A zero-area SVG line can be `hidden` to Playwright’s layout box even when the stroke is painted. The segment is asserted by coordinates and CTM, not by `toBeVisible`.

## Contract advisory

No protocol, schema, validator, fixture expected output, snapshot digest, or id change. The new state is a web view model. `projectSpatialView` is now also called for `input:<inputDigest>` on the measurement screen. That command already existed; the cache key, lease, and version stay as in SP-001.

## Deviations

- `activate()` rejects in-flight system requests, including a projection started when the digest updates. The session requests the input projection again after activation settles, and a `StaleRequest` is not recorded as a failed drawing.
- Two plan details share one `selectedPlacementId`. Only the detail whose selection object changed writes it, so an empty sibling does not clear the placement being edited.
- Both top and front diagrams stay mounted. The toolbar marks the active zoom target and does not hide the other view.

## Out of scope

Nodes 003–007, drag, step focus, 3D, a new measurement suite, solver or catalog work, approved screenshots, source prompts, `SOURCE_MANIFEST.json`, governance, and CI.
