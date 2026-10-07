# ZARI-SPATIAL-009 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. There is no new screenshot. Nothing here is an approved baseline or a physical measurement.

- Task: GitHub issue #59, node 009, “오차·근거·v1 상세 사실 입력과 저장 통합”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-009`.
- Observed base SHA: `29d4d7cd5e53a71948b5e9be7068134632a4a24b` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md` §§2–4, 6–7; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/WORKSPACE_BLUEPRINT.md`. SP-001 through SP-008 evidence was read as the current HEAD. Candidate and NON_EXECUTABLE program drafts were not used as extra scope.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 about 07:28 KST, verbatim: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라." Recorded in `design/DECISIONS.md` D009 and `docs/adr/SP-009-detail-facts.md`. This delivery implements SP-009 only. SP-010 and SP-011 are not implemented here.

## What changed

The UI consumes the SP-008 `normalizeInput` surface only. `BUILD_ID` stays `zari-domain-5`. Capability order, generated contracts, fixtures, and `Cargo.lock` are unchanged. `queryNextFacts` is not called or advertised.

A new ordinary project clears `space.staging.baseSupport` and each item's five handling facts to explicit unknown before normalization. Sample fill and stored projects are unchanged. There is no migration.

`상세 측정` stays collapsed until the user opens it. Nominal, bounds, unit, source, and evidence are edited as one group. A missing or invalid bound blocks the normalized commit and leaves the previous committed input in place. The raw draft still saves and reloads. Rust `groupFormatRequests` converts a complete length group or refuses it without a partial rewrite. `Evidence.note` is stored as human text. A note that claims a conflict does not create `conflicting_sources`, an interval, or `confirmed`.

## Changed paths

- Adoption: `docs/adr/SP-009-detail-facts.md`, `design/DECISIONS.md` (D009), a short SP-009 note in `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`.
- UI and session: `apps/web/src/features/project/detailFacts.ts`, `apps/web/src/features/project/DetailPanel.tsx`, `apps/web/src/features/project/draft.ts`, `apps/web/src/features/project/session.ts`, `apps/web/src/app/ProjectScreen.tsx`, `apps/web/src/styles/project.css`.
- Tests: `apps/web/tests/unit/detailFacts.test.ts`, `apps/web/tests/unit/session.test.ts`, `apps/web/tests/browser/detail.spec.ts`.
- Status: `docs/IMPLEMENTATION_STATUS.md`, this file.

No Rust, generated contract, fixture, lockfile, workflow, or `.aiops` path changed.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| MC-01 fresh project: baseSupport and all five handling facts unknown; sample 50000 g / 5 mm / 0 preserved; Worker normalize, save, reload | `session.test.ts` “normalizes a new project…” and “keeps the sample support…”; Chromium/Firefox/WebKit `detail.spec.ts` “a new project keeps support and handling unknown…” |
| MC-02 bounded 600 mm −2/+3 shown from Rust, unverified | `detail.spec.ts` “known bounds…”; display uses `nominal` / `minusMm` / `plusMm` from the normalized fact. Interval identity remains the SP-008 fixtures |
| MC-03 partial bound and invalid text do not commit a new digest; raw text reloads; group conversion of 600 mm −10/+20 is 60 cm −1/+2; IME text is not converted | `session.test.ts` group and partial-commit tests; `detail.spec.ts` “known bounds…” and “group unit conversion…” |
| MC-04 offset 0−0/+0, −2−3/+4, negative staging minY, unsupported hand-carry text | `session.test.ts` “treats an explicit zero…”; `detail.spec.ts` “offsets, staging…” |
| MC-05 footprint known while floor load stays unknown; staging load 0 is known, not missing | `detail.spec.ts` “offsets, staging…” |
| MC-06 handling unknown has no completion checkbox; lift 0 is an entered zero | `detail.spec.ts` “offsets, staging…”; fresh-project handling assertions |
| MC-08 note, locator, observedAt, userMeasured stay unverified through save, reload, export/import | `session.test.ts` “keeps a human conflict note…”; `detail.spec.ts` “a conflict note…” |
| MC-09 arbitrary id `shelf-9`; catalogue paths are not writable and link to `#/catalog` | `detailFacts.test.ts`; `session.test.ts` quantity 0 on `shelf-9`; `detail.spec.ts` “catalogue facts…” |
| MC-11 two tabs, quota, reload, export keep prior digest/rows; focus does not write | `detail.spec.ts` second-tab, quota, focus, and export tests. `progress.spec.ts` still passed in the Chromium suite |
| Original 11-field keyboard order | `detail.spec.ts` focus test; existing `a11y.spec.ts` keyboard test passed |
| Compact, 200% zoom, forced-colors | `detail.spec.ts` focus test at 390px, CSS zoom 200%, and `forcedColors: active` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0, `npm -v` 11.17.0. `npm ci` was run in this worktree because `node_modules` was absent. That did not change `package-lock.json`. esbuild's install script was run so the Vite binary existed.

Browser commands used `--workers=1` because other jobs were using the machine. That does not change timeouts or retry the worker-state check. The Chromium suite was one run.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 97 tests: core lib 29, bootstrap 9, domain 11, edit 6, protocol 17, validator 11, search 14. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 117 fixtures |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 117 fixture structures valid.” Generated contract files have no diff |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 16 files, 124 tests |
| `npm run build` | exit 0 |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `npx playwright test apps/web/tests/browser/detail.spec.ts --project=chromium --workers=1` | exit 0. 9 passed (20.5s) |
| `npx playwright test apps/web/tests/browser/detail.spec.ts --project=firefox --project=webkit --workers=1` | exit 0. 18 passed (54.5s): Firefox 9, WebKit 9 |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 68 passed (2.3m), first run. No `worker-state` flake |
| `npm run test:parity` | exit 0. 2 passed (23.2s). “117 shared fixtures.” |

## Browser

Route: `#/project/<id>` after create, then plan (`계획 검토`) and `#/catalog`. Desktop viewport 1440×1000. Compact check 390×844. Chromium, Firefox, and WebKit. Flows: fresh unknown support/handling, sample preserve, known bounds, partial bound hold, explicit zero, group unit conversion, IME hold, signed offsets, staging limitation text, support versus load, evidence note, export/import, second tab, quota, focus/tab, 200% zoom, forced-colors. Each new spec asserts `pageerror` and console `error` are empty. No new screenshot was kept.

`spatial-view.spec.ts` rewrote `docs/evidence/ZARI-SPATIAL-001-unknown-offset.png` and `docs/evidence/ZARI-SPATIAL-001-yaw-offset.png` during the Chromium suite. Those two paths were restored with `git checkout`. sha256 is again `49bce0b45c0904f6909da6b5ae71729ff40292c7f1951076da1af003010f8098` and `89c2d07ed9a4c3436db69c0b02904124e89b1c20fb2e4f44917adec6b6bfea28`.

## Parity

Native `fixture_runner` and the Chromium Worker agreed on 117 fixtures. The changed UI does not change the raw contract, so no new parity fixture was added.

## Contract advisory

No generated contract change. No `BUILD_ID` change. No capability change.

## Deviations

Clearance, mass, and quantity raw facts have no unit field. The panel shows mm, g, and 개 and does not write a converted string back, because that string would be parsed again as millimetres, grams, or a count. Signed offsets stay integer millimetres. Group conversion is requested for positive lengths.

Obstacle paths are in the SP-008 grammar and are not in the v1 input list for this node, so the panel does not add an obstacle editor.

`NotApplicable` is not offered for staging support. Choosing “지지면이 있다” stores known support with an unknown load, not 50000 g.

## Known limits

Phone hardware and a dedicated GPU were not available. They are UNVERIFIED. Browser viewports are not a substitute.

SP-010 query activation is not rendered. SP-007 3D label overlap is unchanged. There is no data migration. PR #38 was not edited. The local browser runs used one worker; timeouts were not raised and the suite was not retried.

## Out of scope

SP-010 and SP-011, inventory CRUD, catalogue ingestion, automatic Confirmed or confidence, LLM geometry, paid or external upload, and any change to snapshot, rule, hash, or BOM meaning.
