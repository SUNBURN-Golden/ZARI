# ZARI-SPATIAL-003 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots are not an approved baseline; this node adds no picture to the evidence folder.

- Task: GitHub issue #47, node 003, “평면 드래그와 동등한 숫자·키보드 편집”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-003`.
- Observed base SHA: `e6858355811ce1a9234fd86c280daf5c10ac3a68` (origin/main at branch creation; plan commit is an ancestor). The supervisor commits this working tree and opens the ready PR.
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2, §3, §6 SP-003, §11; `design/SPATIAL_WORKSPACE.md` §§4–5,8; `docs/SPATIAL_VIEW_CONTRACT.md` §7; `docs/FRONTEND.md` (editor, history, keyboard step); `docs/SPATIAL_VERIFICATION.md`; `docs/evidence/ZARI-SPATIAL-001.md`; `docs/evidence/ZARI-SPATIAL-002.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`. Candidate / NON_EXECUTABLE program drafts were not used as extra scope.

## Frozen WorkspaceState

`apps/web/src/features/workspace/model.ts` is unchanged. Drag phase, canvas mode, preview, and the keyboard nudge are component-local. They are not fields of `WorkspaceState`. See Deviations.

## What changed

Rust, fixtures, generated contracts, and `Cargo.lock` are unchanged. The move is the existing `movePlacement` command. A successful edit still asks for one `projectSpatialView` of the new snapshot before the head is patched, so the first paint is not the previous diagram beside the new BOM.

- `features/workspace/drag.ts`: gesture math. Threshold 4 CSS px. 1 mm quantization with ties away from zero (`sign * floor(abs + 0.5)`, `+0` not `-0`). z copied from the origin. Protocol window ±20000 mm is a UI precheck only. Keyboard step 1 mm, Shift 10 mm. Arrow axes stay ArrowLeft −x, ArrowRight +x, ArrowUp −y, ArrowDown +y.
- `features/workspace/lease.ts`: in-memory lease (project, snapshot, epoch, input revision/digest, catalog digest, project revision, activation, worker session, workspace generation). Compared again before commit.
- `features/workspace/useCanvasGesture.ts`: pointer capture, RAF preview, one command on pointerup. Window listeners cover moves that leave the canvas. Escape, blur, hidden document, resize, a real size change, a second pointer, and a CTM change cancel. `pointermove` does not call the worker. Touch `button === -1` can start a move.
- `session.ts`: a second `requestLayoutEdit`, alternative switch, or accept while pending or saving does not replace the in-flight command. `EditPersist` is `saving` | `unsaved` | `conflict` in memory. A disk error keeps the verified head and does not reject it. A CAS conflict sets the conflict state and does not overwrite. Epoch or input mismatch drops the reply. Undo/redo stay on `restoreLayout` and wait out a save.
- `worker/client.ts`: read-only `transportIdentity` for the lease. Not persisted.
- `PlanScreen.tsx`: step label “화살표: 1mm, Shift+화살표: 10mm”. Repeats coalesce into one command on keyup. Shift release resets the displayed step from a window `keyup`, including after focus leaves the detail. Save-failed copy “이 기기에 저장하지 못함” with retry/export. Conflict is explicit.
- `Workspace.tsx` / `PlanDiagram.tsx`: desktop selection-mode drag moves the selected placement. Compact or coarse pointer requires “평면에서 이동”. “화면 이동”, middle button, and Space+drag pan. The same move control is inside the compact inspector dialog so it can be reached while the dialog is open; entering move mode closes the dialog. Ghost caption “검사 전” (`drag-preview`, `data-valid=false`) versus pending “검증 중”. The preview notice keeps its layout slot so showing it does not shift the canvas. `touch-action: none` only on the canvas while move, pan, or Space pan is active.
- `project.css`: ghost, selection, focus, and overlay do not steal hits. Forced-colors container/item/contained shapes use `pointer-events: visible` so `fill: none` can still be pressed. No new color token. `notice-preview` reuses the existing `preview-on-info-soft` pair.

## Acceptance mapping

| Acceptance | Test |
|---|---|
| Valid drag is one evaluated snapshot, one undo step, and the same BOM | `drag.spec.ts` mouse: worker count +1, integer position, distinct snapshot id, undo then redo. Sample move is −15 mm in depth (the wide bin is flush at the back) |
| Invalid, no-op, and cancel leave the prior plan | Mouse: 2 px under the threshold, Escape, second pointer, viewport resize, front-view drag. Each sends 0 `evaluateLayoutEdit`. Unit: click, no-op, lease/CTM/finite cancel |
| Zero Worker/IndexedDB calls during `pointermove`; one command on pointerup | Browser counters around the move. Unit: `updateMove` returns no command |
| Outside canvas, cancel, multitouch, resize | Mouse test, including a release outside the svg |
| Numeric, keyboard, and drag cannot replace a pending edit | Keyboard test holds the first worker post and a second ArrowUp does not post. Unit: second `movePlacement` while pending is ignored; `selectAlternative` and `acceptPlan` do not start |
| Integer coordinates and the same `movePlacement` as numeric/keyboard | Unit: `nudgePosition` + `movePlacementCommand`. Browser: two ArrowUp keydowns coalesce to y−2; Shift+ArrowUp is y−10; drag y matches origin−15 within 2 mm. z unchanged |
| A move does not turn an unknown check into a pass | Mouse: unknown-row count unchanged; text stays `미확인` and does not contain `확인됨` |
| Reload restores the committed edit chain | Mouse reload after the valid drag |
| CAS conflict is explicit | Unit: mocked `commitEditSnapshot` conflict keeps the head, sets conflict, ignores a further edit, and `reloadLatest` restores the saved head |
| Rust success with a failed save keeps the working result | Unit: thrown disk error → head set, persist unsaved, rejection null, accepted null; retry then clears persist |
| Keyboard step is 1 mm, Shift is 10 mm, and the step is shown | `drag.test.ts`; `drag.spec.ts` `move-step` |
| 390 px touch uses an explicit mode and does not freeze page scroll | Compact test: `data-pointer=explicit`, drag before “평면에서 이동” sends 0, `touch-action: none` only on the top canvas, `body`/`html` are not `none`, viewport meta has no `user-scalable=no`. Pointer events from the touch are `pointerType` `touch` |
| Source/fence change cancels | Unit lease and CTM mismatch. Session epoch change drops an in-flight move |

## Commands (final tree)

Shell prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH`, `CARGO_BUILD_JOBS=4`. Node v24.19.0. Rust via `rust-toolchain.toml`. wasm-bindgen 0.2.128.

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
| `npm test` | vitest 10 files, 85 tests, exit 0 |
| `npm run build` | exit 0 |
| `node scripts/check-design-tokens.mjs --self-test` | 10 checker self-tests; 72 tokens; 39/39 contrast cases, including `preview-on-info-soft` |
| `npm run test:browser -- --project=chromium` | 46 passed (21.9s). Chromium, locale `ko-KR`, default viewport 1440×1000 |
| `npm run test:parity` | native and Chromium Worker/WASM agree on 107 fixtures; 2 `@parity` tests passed |

`Cargo.lock` and generated `apps/web/src/contracts/` are unchanged.

## Browser

- Route: plan (`#/project/<id>/plan`) after the existing fill-sample / 최소 구매 flow. Real IndexedDB and WASM Worker. No mocked solver in the browser specs.
- Engine: Playwright Chromium. The three `drag.spec.ts` flows record `pageerror` and console `error`; those lists were empty.
- Mouse, 1440×1000: no-op, Escape, second pointer, resize, release outside the canvas, one valid −15 mm drag, unknown checks unchanged, reload, undo/redo, front view sends nothing. Command counts stay flat during the move and increase by one on release.
- Keyboard: two ArrowUp repeats become one command (y−2); Shift+ArrowUp is 10 mm; the step label returns to 1 mm; Space inside the coordinate field does not pan; a second arrow while the worker reply is held does not post.
- Touch, 390×844, `hasTouch: true`: explicit “평면에서 이동”, page scroll not frozen, one touch drag of −15 mm, forced-colors ghost stroke is not transparent. The in-dialog move button closes the inspector sheet.
- No draft screenshot was stored under `docs/evidence/`.

## Limits

- Disk-failure and CAS conflict are covered by the session unit test with a mocked `commitEditSnapshot`. The browser suite does not inject a failed IndexedDB write.
- Playwright `page.mouse` did not deliver a usable gesture on this SVG. The mouse spec uses CDP `Input.dispatchMouseEvent`. The 390 spec enables touch (`hasTouch`) and uses CDP `Input.dispatchTouchEvent`. Chromium’s `touchEnd` carries no point, so that spec releases with a `pointerup` at the last touch position after `pointerdown` was observed as `pointerType` `touch`. This is an emulated viewport, not a physical phone.
- A layout shift larger than the CTM tolerance still cancels the gesture. The preview notice reserves its slot so the label itself does not move the diagram.
- Contained children are not dragged. A press on a child does not move the parent.
- Front view stays a selection surface. No snapping, resize, free yaw, z drag, or 3D editing.

## Contract advisory

No protocol, schema, validator, fixture expected output, snapshot digest, or id change. `movePlacement` and `PlanSnapshot` are unchanged. The lease and `EditPersist` exist only in the web session.

## Deviations

- Drag, pan, mode, preview, and nudge stay outside frozen `WorkspaceState`. `data-canvas-mode`, `data-move`, `data-gesture-phase`, and `data-last-finish` are DOM mirrors for the gesture, not view-model fields.
- The compact inspector is a modal `dialog`. A second “평면에서 이동” control inside the dialog is how move mode is entered while the sheet is open. Entering move mode closes the dialog.
- CTM cancel uses 0.001 on the linear components and 0.5 px on the translation. A smaller translation epsilon cancelled drags on subpixel noise.
- Keyboard axis directions are unchanged. Only the inverted 10 mm / 1 mm step was corrected.

## Out of scope

Nodes 004–007. No new dependency. No governance, workflow, source-prompt, or runtime-flag edit. No optimistic BOM or auto acceptance.
