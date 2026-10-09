# ZARI-z-accessibility-workspace evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #94, node z-accessibility-workspace, “측정부터 실행까지 키보드·모바일 접근성”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-accessibility-workspace`.
- Observed base SHA: `346558c1b04d846b122dd4581cb88898b416aedd` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`. Previous node evidence and ADRs were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-accessibility-workspace and `docs/adr/SP-z-accessibility-workspace.md`. This delivery is z-accessibility-workspace only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, capture acceptance, or release.

## What changed

No new Rust command. Coordinate entry, diagram arrows, and touch steppers send the same `movePlacement`. The host still refuses a blank coordinate instead of sending 0mm. A zero step is not a command. Keyboard activation of a placement button (click detail 0) moves focus to that detail's X field. A pointer click does not. On a compact width the selection sheet opens first. The default step stays 1mm. Shift shows 10mm and, on release, restores the touch-chosen step. Arrow keys still use `keyboardStepMm`.

Selection and list focus are in the visible legend and in polite live regions. Placement, diagram, content, check, BOM, and Pareto buttons expose `aria-pressed`. An uncertainty note is part of the dimension input's `aria-describedby`. Save state and the unknown-check summary are `role="status"`.

Save failure, conflict, worker failure, and accept error move focus to the recovery control and restore the previous focus when that control goes away. Field text is left in place. A commit that is still focused and has a measurement diagnostic moves focus to that field. Search cancel, interrupt, or failure returns focus to compute only when focus was lost or was on cancel. A later accepted snapshot moves focus to the first enabled control in `#accepted-guide`. Disabled guide buttons are skipped.

The Pareto table is before the alternative cards and the accept button. Below 47.999rem the project name and “이 기기에만 저장” wrap instead of being hidden. The comparison table uses `contain: inline-size`. Coarse pointers use the existing `--zari-touch-min-height` on the stepper buttons and inspector inputs. No new color token and no new contrast case.

Search counters do not redraw the plan screen. Each solver step used to `patchPlan` before the next step was scheduled, so the second search in `plan.spec.ts:112` was still `data-search=running` when CI's 30s test timeout fired (job `bridge` `113788333157` on `2ee8a5bba33dd21bfb083428ed959928ea05c4ee`, work 5,220 / nodes 36). The status line is a separate subscriber. Counter paints are coalesced to 250ms. `running` is still set immediately. Completion, cancel, interrupt, and failure clear the pending paint and write the terminal state immediately. Playwright timeouts were not raised. The `role="status"` line is no longer rewritten on every step.

## Changed paths

- Adoption: `docs/adr/SP-z-accessibility-workspace.md`, `design/DECISIONS.md` (Dz-accessibility-workspace), a z-accessibility-workspace-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` and `design/SPATIAL_WORKSPACE.md` §8.
- UI: `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/app/ProjectScreen.tsx`, `apps/web/src/ui/returnFocus.ts`, `apps/web/src/ui/DimensionField.tsx`, `apps/web/src/features/plan/view.ts`, `apps/web/src/features/project/session.ts`, `apps/web/src/features/workspace/Workspace.tsx`, `apps/web/src/features/workspace/selection.ts`, `apps/web/src/features/workspace/InspectorLayers.tsx`, `apps/web/src/features/pareto/ParetoPanel.tsx`, `apps/web/src/styles/app.css`, `apps/web/src/styles/project.css`.
- Tests: `apps/web/tests/unit/planView.test.ts`, `apps/web/tests/unit/workspace.test.ts`, `apps/web/tests/browser/accessibility-workspace.spec.ts`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, generated contracts, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Keyboard-only create, measure, compute, compare, adopt, and open the guide | `accessibility-workspace.spec.ts` first test. Tab and Enter through create, sample, width 610, commit, plan, compute, Pareto select, placement, 1mm/10mm stepper, `move-x-up`, then ArrowRight on the edit diagram. Two `movePlacement` messages; the second x is the first plus 1. Focus lands in `#accepted-guide`. Unknown checks still say 미확인. Chromium and Firefox |
| Essential information remains at 320px, zoom, forced colors, and reduced motion | Same test, after adopt. 320×700 keeps Pareto, the accepted badge, the guide, the project name, unknown checks, and the compact inspector button, with body scroll width inside the viewport. 200% CSS zoom uses the existing zoom-aware scroll check and keeps the guide and unknown text. `forcedColors: active` and `reducedMotion: reduce` keep the guide, Pareto, and 미확인. Focus outline is not `none`. `--zari-duration-fast` is `0ms` or `0s` |
| Desktop emulation is not reported as a device | This file. 320px, CSS zoom, forced colors, and reduced motion are Chromium and Firefox emulation. Phone and discrete GPU are UNVERIFIED |

Also checked: invalid text `abc` stays in the width field, is `aria-invalid`, and focus returns to that field. A quota failure focuses retry and keeps `600`. Retry returns focus to commit and saves. A worker crash focuses retry and keeps the text. Cancelling a held search returns focus to compute and the measurement is unchanged. Unit: `nudgeMovePosition` adds a whole millimetre, leaves a blank axis missing, and refuses a zero step. `selectionAnnouncement` / `focusAnnouncement` name the selection and do not call unknown a pass.

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1 via `rust-toolchain.toml`. wasm-bindgen was 0.2.128. Playwright timeouts were not raised. The new journey uses `test.setTimeout(240_000)` because it includes a real search. The Playwright config timeout stays 30s.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 186 passed, 1 ignored. The ignored test is the pre-existing completion-query ignore. This run used the default debug profile |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generated file was hand-edited |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 27 files, 182 tests |
| `npm run build` | exit 0. Vite printed the existing chunk-size warning. It is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `6262abd53c479288`, 11 assets. The hash changed because the web bundle changed. Engine `BUILD_ID` stays `zari-domain-7`. This check ran on the production build, before later test-mode rebuilds |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium --workers=2` | exit 0. 98 passed (7.1m). Preview `http://127.0.0.1:4173`. `plan.spec.ts:112` inside that run was 21.0s. Default trace mode. Timeouts were not raised |
| `npx playwright test apps/web/tests/browser/plan.spec.ts apps/web/tests/browser/accessibility-workspace.spec.ts --project=firefox --workers=1 --trace off` | exit 0. 7 passed (1.3m). The stale-accept test was 22.4s |
| `npx playwright test apps/web/tests/browser/plan.spec.ts apps/web/tests/browser/accessibility-workspace.spec.ts --project=webkit --workers=1 --trace off` | exit 1. WebKit did not launch. Missing host libraries include `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libGLESv2.so.2`. UNVERIFIED |
| `npm run test:parity` | exit 0. 2 passed (26.7s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Route: existing project and plan screens. Chromium and Firefox. The full Chromium preview in the first run was `http://127.0.0.1:4173`. Success viewport in the journey is 1440×1000, then 320×700, then 1280×800 at 200% CSS zoom, then forced colors and reduced motion. Collected `pageerror` and console `error` lists in the accessibility spec were empty after filtering the injected quota and worker-crash text, and the search-cancel text. `spatial3d` reported `context-lost-console: none` in the Chromium suites. No `worker-state` flake. Phone and discrete GPU were not available and are UNVERIFIED. These viewports are desktop emulation.

Keyboard success: create, fill sample, set 공간 안쪽 폭 to 610, commit, open the plan, compute, press the first Pareto row, press the first placement, land on `move-x`, toggle the step 10mm then 1mm, press X up, then ArrowRight on the edit diagram. The guide receives focus. Unknown checks remain 미확인.

Failure and recovery: width `abc` stays, is invalid, and is focused. Quota focuses `save-failed-retry` and keeps `600`. Retry saves and returns focus to commit. Worker crash focuses `worker-retry` and keeps `600`. Retry returns the worker to ready. Cancelling a running search, with `stepSearch` held until the first step, focuses `compute-plan` and keeps the measured width.

Earlier Chromium runs, before the search-counter fix, were 97 passed and 1 failed. Those failures were not the CI failure. They are kept here so the earlier record stays accurate. The arrow-wait edit to the accessibility spec is in runs 3 and 4. `--workers=1`.

| Run | Command extra | Result |
|---|---|---|
| 1 | default `retain-on-failure` traces | 97 passed, 1 failed (15.4m). `portable.spec.ts` “corrupted draft” failed in `browserContext.close` with `ENOSPC` while writing a trace. Not an assertion failure. Isolated rerun of that test passed (1.7s) |
| 2 | `--trace off` | 97 passed, 1 failed (14.9m). The accessibility journey's ArrowRight ran while the edit was still saving, so the second `movePlacement` was not sent. The spec now waits until `undo-edit` is enabled and focuses `plan-diagram-top`. Isolated rerun of the spec passed (13.0s Chromium, 16.8s Firefox) |
| 3 | `--trace off`, after that spec fix | 97 passed, 1 failed (15.2m). `measurement-regression.spec.ts` offline save left the digest unchanged. The same test passed in runs 1 and 2 (1.9s, 1.5s) and in an isolated rerun (1.6s) |
| 4 | `--trace off` | 97 passed, 1 failed (14.9m). `edit.spec.ts` saw zero plan thumbs. The same test passed in runs 1, 2, and 3 |

After the search-counter fix, one Chromium invocation with `--workers=2` (the CI worker count) was 98 passed (7.1m), including `plan.spec.ts:112` at 21.0s and the accessibility spec at 12.5s, 1.4s, and 1.4s. `spatial3d` reported `context-lost-console: none`. Timeouts were not raised.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. No existing fixture expected bytes changed. This node does not add a protocol command.

## Contract advisory

No contract change. `BUILD_ID` stays `zari-domain-7`. Protocol, schema, canonical version, export, and fixture expected bytes stay. Generated contracts were checked and matched Rust. They were not hand-edited.

## Deviations

- CI on `2ee8a5b` failed `plan.spec.ts:112` because every search step redrew the plan screen before the next step. The fix coalesces counter paints and keeps them off that screen. Timeouts were not raised. Tests were not skipped.
- This verification's `cargo test` used the default debug profile and passed. An earlier attempt on a fuller disk needed `CARGO_INCREMENTAL=0` and `CARGO_PROFILE_DEV_DEBUG=0`.
- WebKit could not start on this host.
- Keyboard list selection focuses the coordinate field. Pointer selection does not.
- The comparison table was moved before the alternative cards so the keyboard order is compute, diagnosis, compare, adopt, guide.

## Limits

- The next z-node was not started.
- No approved visual baseline. No phone. No discrete GPU. WebKit UNVERIFIED.
- 320px, 200% CSS zoom, forced colors, and reduced motion were desktop emulation.
- This session did not push. GitHub Actions failed the previous commit `2ee8a5b`. It has not executed the search-counter fix.

## Out of scope

Purchase, cloud, photos, accounts, release, `BUILD_ID` changes, fixture rewrites, governance files, and any node after z-accessibility-workspace.
