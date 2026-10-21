# ZARI-SPATIAL-audit-01-fix evidence

## 2026-10-21 — supplied-base revalidation for issue #82

All seven findings are **already fixed on the supplied base**. The prior delivery commit `2c214a25ea1e3467fe25664eed7e7049f4bf2b82` is an ancestor of this checkout. This session reuses that implementation and its regression tests; it introduces no production, design, protocol, fixture, dependency, or test change. The dated historical record below describes the earlier delivery, not this session's base or test counts.

Delivered via the PR opened by the supervisor. This evidence is not an independent review PASS, a GitHub CI result, screen approval, or a release.

### Task, authority, and source

- Task: `ZARI-SPATIAL-audit-01-fix`, GitHub issue #82, audit-fix pseudo-node; branch `astra/zari-spatial-audit-01-fix`.
- Observed base and tested source HEAD: `a785b63c5b5c7306fddb39be3a9c12d2cfc04618`. Initial working tree was clean. Both the original fix commit above and plan commit `0847d1b065627938acfad3a941de79e357570e43` were confirmed as ancestors with `git merge-base --is-ancestor` (exit 0).
- Authoritative task: the issue body supplied by the supervisor and `/workspace/zari-spatial/audit-01-fix/node.json`. There is no executable `audit-01-fix` program node. The explicit instruction to reuse already-fixed findings governs this delivery.
- Read contracts: AGENTS/README, targeted preserved MASTER_PROMPT and RUST_ADDENDUM, IMPLEMENTATION_STATUS; pinned execution plan §2 and §9 SP-006; DESIGN, SCREENS, COMPONENTS, DECISIONS, REVIEW_CHECKLIST; pinned spatial workspace/verification references and current affected source/tests; WASM_PROTOCOL, PERSISTENCE, DOMAIN_MODEL, qualification ledger, and SP-z-product-contract §8. Historical plan sections were read at the plan pin; later merged capabilities were checked on the actual base rather than reimplemented. Candidate/pending control-plane references authorize no additional work.
- Final delivery HEAD is assigned by the supervisor's commit. The builder performed no commit, push, PR creation, GitHub access/change, branch switch, or workflow edit.

### Finding re-check and acceptance mapping

| Finding | Evidence already present on `a785b63c...` | Verification in this session |
|---|---|---|
| F1 | `ProjectsScreen.tsx` batches the loaded rows with `listSettled`; create is disabled until that paint. The ancestor's investigation identifies a layout-shift/canceled React Aria press, before the project screen/Worker mounts, rather than slow Worker boot. | Full browser suite: 148/148 with four workers. Both original failures, `measurement-regression.spec.ts:48` and `workspace.spec.ts:191`, passed (2.2s and 8.5s). Keyboard creation also passed. No timeout/retry/worker-setting change. Historical CI traces were not fetched or independently rerun in this session. |
| F4 | Ledger 016 is MERGED, delivery `71ecffc1ba35e636c237ac94ce5bb265e41fe729`, PR 74, merge `1bd3fde5bd9a625d02735d4de8609e97736db49d`. Checker accepts null or PR-comment review URLs and forbids DONE. Status already contains post-merge #74/#76 lines. | Existing `qualification.test.ts` and `check-qualification.mjs` passed. No review receipt was invented; reviewPointer remains null. |
| F5 | README/DESIGN describe implemented drag, read-only 3D cutaway, next/detail facts, eligibility and recovery; SCREENS S04–S08 and the five component rows are draft entries; checklist describes the implemented app. | Read against the existing app and the original fix diff. No document or visual redesign needed for this finding. Approved baseline count remains 0. |
| F6 | `project.css` uses declared `--zari-*` tokens; session success/danger pairs already have contrast cases. Checker rejects undeclared component custom properties; decision D-audit-01 exists. | Checker self-tests 12/12 and contrast cases 41/41; no undefined legacy property reference remains. No new color/token/contrast pair. |
| F7 | `unassignedPlacement` returns `{known, unknownRows}`; unknown-only text is `미확인`, mixed text retains both counts. `isNoPurchase` reads Rust BOM and cost summary, without inspecting placement kinds. | Existing fixture-backed unknown-quantity, mixed-count and BOM/cost unit cases passed. Browser `plan.spec.ts:192` passed: unknown quantities never display `미배치 0`, with console/page errors asserted empty. |
| F9 | Protocol table already names `evaluateLayoutEdit`, `validateCandidate`, `candidateValidated`; PERSISTENCE §2 documents dbVersion 2 and later migrations (live version 6); DOMAIN_MODEL marks the old eligibility statement superseded by SP-013. | Targeted source/doc comparison and contracts check (124 fixture structures). No protocol, schema, migration, or generated contract edit. |
| F10 | StepFocus links waiting/blocked reasons via aria-describedby and renders read-only done text; next facts use ul/li; search note has role=status. | Existing `a11y.spec.ts:152` passed all six surfaces at 1440×900, 390×844, and forced-colors at 390px. Reason linkage, read-only `완료`, list semantics, status role, and empty console/page errors are asserted. Keyboard and responsive suites also passed. |

No new tests were added because the task explicitly says not to change already-fixed findings. Existing meaningful regression tests were run in the full suites, rather than duplicated.

### Changed paths and design

This session changes only `docs/evidence/ZARI-SPATIAL-audit-01-fix.md` and `docs/IMPLEMENTATION_STATUS.md`: a dated revalidation record, current source identity, exact results, and remaining handoff work. Historical delivery evidence is retained below with its original base and counts.

Design is unchanged. Existing semantic tokens and status text remain in use; no new combination, screen, or approved baseline is introduced. `contract_change=NO`. Rust remains the calculation authority and the snapshot/BOM/guide binding and unknown fencing are unchanged.

### Exact verification commands and results

Every shell command used `export PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`. Observed tools: Node v24.19.0, npm 11.17.0, Rust 1.98.1, wasm-bindgen 0.2.128. npm satisfies engines 11.x; its minor differs from packageManager 11.9.0. Existing locked dependencies and installed Chromium were reused. Heavy builds/suites ran sequentially in the foreground and were awaited to completion.

Elapsed times below include command setup/build time; Playwright's own test duration is stated separately. All 25 command invocations exited 0. The production build and manifest checks were repeated after parity because test builds replace dist; no failing test was retried.

| Exact command | Exit | Elapsed | Result |
|---|---|---|---|
| `cargo fmt --all -- --check` | 0 | 0.53s | Formatting clean. |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | 0 | 42.49s | No warnings. |
| `cargo test --workspace --locked` | 0 | 180.92s | 260 passed, 0 failed; 1 pre-existing ignored completion-query fixture emitter. No test was newly ignored. |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | 0 | 38.39s | 28 fixtures. |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | 0 | 6.87s | 124 fixtures. |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | 0 | 0.08s | Feature tree inspected; existing Rust/serde/wasm-bindgen path, no DuckDB/Polars/Python/CUDA requirement. |
| `npm run wasm:build` | 0 | 82.24s | Actual Rust WASM, wasm-bindgen 0.2.128. |
| `npm run contracts:check` | 0 | 5.27s | Contracts match Rust source; 124 fixture structures valid. |
| `npm run typecheck` | 0 | 11.66s | No TypeScript errors. |
| `npm run lint` | 0 | 9.06s | No ESLint errors. |
| `npm test` | 0 | 80.90s | 51 files, 421 tests passed. |
| `npm run build` | 0 | 3.67s | Production build; existing large-chunk advisory only; no threshold changed. |
| `node scripts/check-release-manifest.mjs` | 0 | 0.93s | 13 assets; buildId 8f4710817afdc756; errors: []; lazy SpatialView absent from initial index. |
| `node scripts/check-release-candidate.mjs` | 0 | 0.04s | Pins match; gaps retained; release NOT_AUTHORIZED. |
| `node scripts/check-release-candidate.mjs --dist` | 0 | 0.07s | 13 file digests match; buildId 8f4710817afdc756. |
| `node scripts/check-design-tokens.mjs --self-test` | 0 | 0.04s | 12 checker self-tests; 72 base tokens; 41/41 contrast cases. |
| `node scripts/check-qualification.mjs` | 0 | 0.06s | 16=7+4+5; merged 16; in-progress 0; capture PENDING; release NOT_AUTHORIZED; runtime hits 0. |
| `node scripts/check-product-contract.mjs` | 0 | 0.05s | 16 IDs unchanged; one snapshot chain; fixture impact 124 unchanged; runtime hits 0. |
| `node scripts/check-z-denominator.mjs` | 0 | 0.05s | 21=20 program+1 amendment; merged 20; in-progress 1; remaining gaps preserved; runtime hits 0. Read-only check, no other node work. |
| `node scripts/check-review-package.mjs` | 0 | 0.03s | 3 files verified; plan 1b018645bb5a; approved false. |
| `npm run test:browser -- --project=chromium` | 0 | 237.30s | 148 passed (Playwright 3.9m), 0 failed; 4 workers; one full invocation, no retries. |
| `npm run test:parity` | 0 | 55.40s | 2 passed (Playwright 40.8s); 124 native/actual browser Worker-WASM results equal, plus structural malformed-payload rejection. |
| `npm run build` | 0 | 4.17s | After parity, restore/check production dist. Production build; existing large-chunk advisory only; no threshold changed. |
| `node scripts/check-release-manifest.mjs` | 0 | 0.89s | After parity, restore/check production dist. 13 assets; buildId 8f4710817afdc756; errors: []; lazy SpatialView absent from initial index. |
| `node scripts/check-release-candidate.mjs --dist` | 0 | 0.06s | After parity, restore/check production dist. 13 file digests match; buildId 8f4710817afdc756. |

### Real browser flows, artifacts, and parity

- Origin `http://127.0.0.1:4173`; Chromium desktop project, ko-KR, light/reduced-motion defaults, normal four-worker suite. Routes: project list, `#/project/<id>`, its `/plan`, `#/catalog`; the existing full suite also exercises `#/data` and `#/probe`.
- Success: create → Worker ready → sample/edit → actual save → reload → plan/search → accept; unknown-quantity plan cards; next-facts navigation and detail editing; accepted progress/read-only done. The two historically failing create-project specs passed in the single full invocation.
- Important failures: invalid/unknown input, worker crash → recovery → user retry, persistence failure/conflict, stale accepted guide, interrupted search, and empty-real catalog. These are intentional failure injections inside passing tests, not failed test invocations. The later-surface axe test collected no page or console errors; its recovery retry is an explicit user action, not a test retry.
- Accessibility: six later surfaces × three modes = 18 axe scans of main; 1440×900, 390×844, forced-colors at 390px. Critical-screen scans and keyboard-only create/edit/save/plan/cancel also passed. Responsive checks cover 320/390/768/1280/1440, computed results at 390/1440, 200% CSS zoom, reduced motion and forced colors.
- Existing call-count assertions passed in workspace/drag tests: selection/layers do not create another projection or revision; pointer previews/cancels do not write or send edit requests; committing a drag sends one Rust edit. No new calculation or readiness instrumentation was added.
- Local logs and metadata: `test-results/audit-01-fix/{native,web,browser,final}*`; preserved HTML reports: `test-results/audit-01-fix/chromium-report/index.html` and `test-results/audit-01-fix/parity-report/index.html`. Report index SHA-256 values: Chromium `0382cb56c6e553ced7f5ea8af7fd8806ed6dbedd2cdb03f1f7ea8453828cf619`, parity `42c2b5796016cb5a4aec1099a372cff0a1750fbe976ede352de6dc02a1da49bb`. These ignored local artifacts are supplemental; this table records the deliverable results. Screenshots produced by existing tests are DRAFT only; none was promoted or copied into approved baselines.
- Native/browser parity: 124 shared fixtures agree in actual Worker/WASM; malformed payload rejection also passed (2/2). Source/fixture/generated-contract bytes were unchanged. Final production manifest matches 13 existing candidate file digests, buildId `8f4710817afdc756`, errors empty.

### Limits, deviations, and next steps

- All findings were already delivered by ancestor `2c214a25...`; this is evidence/status revalidation, not a second implementation. The original root-cause trace account below is historical evidence, not a claim that this session inspected remote traces.
- No create-project flake was observed. One passing parallel run does not guarantee that no future flake exists. Main-branch/exact-final-HEAD GitHub `bridge` is unverified here: GitHub operations belong to the supervisor. Local green does not waive that gate or the two independent reviews.
- The host reported `webgl_unavailable` and used the supported 2D/text fallback, including the offline 3D-click scenario. A successfully rendered GPU 3D scene, physical phone, and discrete GPU remain UNVERIFIED by this run. Firefox/WebKit, performance benchmarks and capture acceptance were not rerun or claimed.
- Existing Vite large-chunk and NO_COLOR/FORCE_COLOR advisories remain; no thresholds or environment behavior were changed. No new dependency, migration, protocol change, purchase, remote service, deployment, or approval claim.
- Out of scope: F2/F3/F8/F11/F12/F13, any program node, `.aiops/**`, `docs/aiops/**`, governance, workflows, runtime flags, source prompts/SOURCE_MANIFEST, generated artifact edits, fixture expectation/digest/ID changes, approved-baseline replacement. A protected-path diff check exited 0; original SPATIAL-001 PNGs were not rewritten, so no restore was needed.
- Next: supervisor reviews the two-document diff, creates the delivery commit, pushes/opens the PR, obtains two independent reviews and exact-HEAD CI bridge, and handles merge under the applicable governance. No user product decision was needed for this revalidation.

## Historical delivery record — 2026-10-08

The following record was already present at the supplied base, from delivery commit `2c214a25ea1e3467fe25664eed7e7049f4bf2b82`. Its observed base `2252e929...`, statements about findings before that change, database version, machine observations and test counts apply to that earlier delivery only. They are preserved for traceability and are not this session's results.

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was kept as evidence. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #82, `ZARI-SPATIAL-audit-01-fix`, “full-work audit 01 fixes (7 findings)”. This is an audit-fix pseudo-node. It is not a node of `.aiops/program.json`.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43` (ancestor of the observed base).
- Branch: `astra/zari-spatial-audit-01-fix`.
- Observed base SHA: `2252e929bd18677de2a93c11c350bf415ebb77db` (origin/main at branch creation). The final HEAD is the supervisor's commit of this verified tree.
- Audit source: `/workspace/zari-spatial/audits/audit-01-20261008.md`, audited main `c4dce99c2d61d0b5d33ded4ca61c1120ea7a89a3`. Each finding below was re-checked on the observed base before editing.
- Pinned docs used: `AGENTS.md`; `README.md`; `docs/MASTER_PROMPT_KO.md` and `docs/RUST_ADDENDUM_KO.md` (targeted); `docs/IMPLEMENTATION_STATUS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2 and §9 SP-006; `DESIGN.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/DECISIONS.md`; `design/REVIEW_CHECKLIST.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/DOMAIN_MODEL.md`; `docs/qualification/denominator.json`; `docs/adr/SP-z-product-contract.md` §8 as named by F7. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park ordered this build to proceed on this machine under full delegation. Merge, push, and the PR stay with the supervisor.

### Re-check on the observed base

All seven findings were still present. Later merges (z-inventory-lifecycle, z-catalog-provenance) had not closed them.

| Finding | Still present before this change |
|---|---|
| F1 | `create-project` was enabled before the empty-list row. CI run 37736827971 on `c4dce99` failed `measurement-regression.spec.ts` and `workspace.spec.ts` with `worker-state` absent. The same shape is named in earlier evidence. |
| F4 | Node 016 was `IN_PROGRESS` with null delivery, pull request, and merge. `check-qualification.mjs` rejected any other state and any non-null review pointer. |
| F5 | README, DESIGN, SCREENS, COMPONENTS, and REVIEW_CHECKLIST still described a pre-implementation app. |
| F6 | `project.css` referenced `--surface`, `--line`, `--muted`, `--accent`, `--wash`, and `--ink`, which are not declared, and used raw `#fdecec`/`#8a1f1f` and `#eef6ee`/`#1f5c28`. |
| F7 | `unassignedCount` summed known ranges only. `isNoPurchase` looked at `placement.subject.kind === 'newContainer'`. |
| F9 | `docs/WASM_PROTOCOL.md` still had a `validateEdit` row and omitted `candidateValidated`. `docs/PERSISTENCE.md` stopped at dbVersion 1. `docs/DOMAIN_MODEL.md` still said the eligibility reference was not a generated schema. |
| F10 | `a11y.spec.ts` scanned six states at 1440 only. The waiting checkbox had no text reason. Read-only done was only the title. Next-facts rows were a `div` of buttons. `search-status` had no `role="status"`. |

### F1 investigation

CI run 37736827971, job 113178160669, main `c4dce99c2d61d0b5d33ded4ca61c1120ea7a89a3`: 2 failed, 82 passed. Both failures are `expect(getByTestId('worker-state')).toHaveText('ready')` timing out at 30000ms with the element not found. The page snapshot is still the project list: “아직 프로젝트가 없습니다.”, buttons “새 프로젝트” and “파일에서 가져오기”, no alert.

The Playwright trace for `measurement-regression` shows one document load, then the service worker caching the build. `clients.claim()` did not navigate again. The click action resolved the button as visible, enabled, and stable, then finished in about 23ms with no hash change. The DOM before the click had no empty-list row. The DOM after the click had “아직 프로젝트가 없습니다.” The button moved during the press. React Aria cancels a press when pointerup is no longer over the target, so `create()` never ran and the project screen never mounted. The worker was not still booting. The 30s timeout was spent on a page that had already dropped the click.

`ProjectsScreen` now keeps `create-project` disabled until `listProjects()` settles, and it sets the rows and `listSettled` in the same turn. The empty row and the enabled button paint together. Playwright waits until the button is enabled and stable, so the click cannot start on the shifting row. A catalog error still enables the button and does not insert the empty row. No timeout was raised. No retry was added. `--workers=1` was not set.

On this machine `nproc` is 8, so Playwright's default was 4 workers. `measurement-regression.spec.ts` and `workspace.spec.ts` (the two CI failures) passed in the 89-pass run and again in the final 90-pass run. GitHub Actions itself was not started from this session.

### What changed

- The create control waits for the list paint described above.
- Node 016 in `docs/qualification/denominator.json` is `MERGED` with delivery `71ecffc1ba35e636c237ac94ce5bb265e41fe729`, pull request 74, and merge `1bd3fde5bd9a625d02735d4de8609e97736db49d`. `reviewPointer` stays null. The checker allows null or a `https://github.com/<owner>/<repo>/pull/<n>#issuecomment-<id>` URL and still rejects `DONE`, `QUALIFIED`, and a non-null `auditPointer`. The handoff matches that ledger.
- README, DESIGN, SCREENS (draft S04–S08), COMPONENTS (five draft rows), and REVIEW_CHECKLIST describe the app through SP-001–016, z-product-contract, z-inventory-lifecycle, and z-catalog-provenance. Approved baselines stay 0.
- `project.css` uses existing semantic tokens. Session error, conflict, and unsupported use `--zari-danger` on `--zari-danger-soft`. Saved uses `--zari-success` on `--zari-success-soft`. Those pairs were already `danger-on-soft` and `success-on-soft`. The off-palette hexes were not added. `check-design-tokens.mjs` fails when component CSS references a custom property that `tokens.css` does not declare. Decision `D-audit-01`.
- Plan cards use `unassignedPlacement`. Unknown-only rows render `미확인`. Mixed rows render `미배치 n · 수량 미확인 k`. Known-only rows stay `미배치 n`, including 0 when there is no unknown row. `isNoPurchase` is true only when every cost fact is `notApplicable` / `no_purchases` and no BOM line has `ownedId === null`. Placement kinds are not read.
- Protocol docs name `evaluateLayoutEdit` and add `validateCandidate` / `candidateValidated`. Persistence documents dbVersion 2 (attachments) and the current dbVersion 3 (`inventoryLedgers`). The domain-model eligibility sentence is marked superseded by SP-013.
- The waiting or condition-blocked checkbox has a visible reason and `aria-describedby`. A missing prerequisite span is included in that attribute. A read-only done step renders `완료`. Next-facts rows are `ul`/`li`. `search-status` is `role="status"`.

### Changed paths

- F1: `apps/web/src/app/ProjectsScreen.tsx`, `apps/web/tests/browser/a11y.spec.ts` (keyboard wait), `apps/web/tests/browser/responsive.spec.ts` (forced-colors focus wait).
- F4: `docs/qualification/denominator.json`, `docs/qualification/SP-016-HANDOFF.md`, `scripts/check-qualification.mjs`, `apps/web/tests/unit/qualification.test.ts`, post-merge lines in `docs/IMPLEMENTATION_STATUS.md`.
- F5: `README.md`, `DESIGN.md`, `design/SCREENS.md`, `design/COMPONENTS.md`, `design/REVIEW_CHECKLIST.md`.
- F6: `apps/web/src/styles/project.css`, `scripts/check-design-tokens.mjs`, `design/DECISIONS.md`.
- F7: `apps/web/src/features/plan/view.ts`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/tests/unit/planView.test.ts`, `apps/web/tests/browser/plan.spec.ts`.
- F9: `docs/WASM_PROTOCOL.md`, `docs/PERSISTENCE.md`, `docs/DOMAIN_MODEL.md`.
- F10: `apps/web/src/features/workspace/StepFocus.tsx`, `apps/web/src/features/project/NextFactsList.tsx`, `apps/web/src/styles/project.css` (list layout), `apps/web/src/app/PlanScreen.tsx` (`role="status"`), `apps/web/tests/browser/a11y.spec.ts`.
- Status: `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, generated contracts, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `.github/workflows/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case.

### Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Create stays disabled until the list paint, and the old flake specs pass without a longer timeout or `--workers=1` | `ProjectsScreen` `data-list-settled`. Final Chromium suite, 4 workers: `measurement-regression.spec.ts` and `workspace.spec.ts` passed. Keyboard and forced-colors tests wait for `data-list-settled="true"` |
| 016 is MERGED with the named SHAs and pull request 74; a comment URL is allowed; DONE stays forbidden | `qualification.test.ts` reads the ledger and calls `reviewPointerAllowed` / `assertNodeClaim`. `check-qualification.mjs` prints `merged 16; in-progress 0` |
| Current-scope docs, draft S04–S08, five draft components, checklist line | Doc diff only for F5. No token or behavior change belongs to that finding |
| Undefined custom properties fail the token checker; session colors use existing pairs | `check-design-tokens.mjs` self-test includes a `--surface` miss. Full run: 12 self-tests, 39/39 contrast cases |
| Unknown quantity is not `미배치 0`; no-purchase comes from Rust BOM and cost | `planView.test.ts` loads `fixtures/domain/project-unknown-quantity-pass.json` (`item-a` quantity `unknown`, no value) and expects `미확인`. Purchase-line and unknown-total cases expect `isNoPurchase` false. A new-container placement does not override `no_purchases`. Browser `plan.spec.ts` clears both sample quantities, searches, and expects `미확인` or `수량 미확인` and not `미배치 0` |
| Protocol, persistence, and domain sentences match the code | Doc diff. `contracts:check` still matches Rust. Fixture bytes unchanged |
| Axe on the six later surfaces at 1440, 390, and forced-colors; described reason; read-only `완료`; list markup; status role | `a11y.spec.ts` “detail, next facts, guide, recovery, interrupted search, empty catalog”. Collected page errors and console errors were empty |

### Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. These commands were run on the final tree, except the first browser suite noted below, which ran before the next-facts recompile click was added.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 152 passed, 1 ignored. core lib 37, bootstrap 9, catalog provenance 7, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, inventory lifecycle 7, product completion contract 7, product expansion contract 4, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were not edited |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 22 files, 160 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `f5945a3fb3dde536`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 72 base tokens; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-qualification.mjs` | exit 0. `denominator 16=7+4+5; merged 16; in-progress 0; capture PENDING; release NOT_AUTHORIZED; runtime hits 0` |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium` | Final exit 0. 90 passed (4.0m). Playwright default workers: 4 (`nproc` 8). No `--workers=1`. Timeouts were not raised. An earlier run on the pre-recompile tree was 89 passed and 1 failed (the new a11y test). `spatial3d` reported `context-lost-console: none` |
| `npm run test:parity` | exit 0. 2 passed (26.8s). “124 shared fixtures.” |

### Browser

Chromium only. Default locale and the Playwright desktop project. The new a11y test also sets 1440×900, 390×844, and `emulateMedia({ forcedColors: 'active' })`.

Success flows in the final suite:

- Create, edit, save, and reach `worker-state` `ready`, including the two specs that failed in CI run 37736827971.
- Clear `item-a` and `item-b` quantities, commit, search, and read `미확인` or `수량 미확인` on every card. `미배치 0` was absent. Console errors were empty.
- Open the detail panel and the recompiled next-facts list (`ul`). Crash the worker and see `worker-failed`, then retry. Accept a plan, check one enabled step, and see lock reasons on the disabled steps with `aria-describedby`. Change the width so the accepted guide is `data-write="stale"` and the done step reads `완료`. Interrupt a search and read `search-status` with `role="status"`. Save an `empty-real` catalog and see “상품 없는 카탈로그”. Axe `include('main')` reported no violations at 1440, 390, and forced-colors for those six surfaces. Page errors and console errors in that test were empty.

The important failure already covered by the suite remains: a worker error shows `worker-failed` and retry returns to `ready`. The new test uses that panel as the recovery scan.

Call counts were not added for create or search. The next-facts recompile in the a11y test is one extra `queryNextFacts` after commit, which is the existing recompile control. The unknown-quantity browser test performs one search.

No draft screenshot was copied into `docs/evidence`. The failed a11y attempt left a Playwright attachment under `test-results/`, which is not an approved baseline.

Phone hardware and a discrete GPU were not available and are UNVERIFIED. Firefox and WebKit were not re-run. GitHub Actions `bridge` was not started from this session.

### Parity

`npm run test:parity`: native fixture runner and Chromium Worker/WASM agreed on 124 shared fixtures. One structural-rejection test also passed. `contract_change=NO`. Rust sources, generated contracts, and fixture expected bytes were not changed.

### Deviations

- README's current-scope paragraph also names z-inventory-lifecycle and z-catalog-provenance. Those merges are on the observed base. Stopping the sentence at z-product-contract would describe an older tree.
- The persistence paragraph required for dbVersion 2 also states that the live `DB_VERSION` is 3. `apps/web/src/persistence/db.ts` is version 3.
- Node 016 `reviewPointer` stays null. The audit recorded empty GitHub review lists. The checker permits a pull-request comment URL and does not invent one.
- Playwright used its default of 4 workers because this machine has 8 CPUs. The command did not pass `--workers=1` and did not pass `--workers=2`.

### Out of scope

Findings F2, F3, F8, F11, F12, and F13. Any program node. `.aiops/**`, `docs/aiops/**`, workflow files, source prompts, and `SOURCE_MANIFEST.json`. No timeout increase, no retry, no skipped test, no weakened threshold.
