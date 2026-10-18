# ZARI-z-guided-onboarding evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #112, node z-guided-onboarding, “처음 사용해도 완성하는 예제와 빈 화면”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-guided-onboarding`.
- Observed base SHA: `48a2b0a47179046ad36cbec6602a87da6e8df179` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/MASTER_PROMPT_KO.md`, `docs/RUST_ADDENDUM_KO.md` (targeted); `DESIGN.md`; `design/DECISIONS.md`; `design/SPATIAL_WORKSPACE.md`; previous node evidence and ADRs (z-purchase-handoff, z-privacy-offline, z-accessibility-workspace). `docs/aiops/**` candidates were not used as extra scope; `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `docs/adr/SP-z-guided-onboarding.md`, `design/DECISIONS.md` Dz-guided-onboarding, and z-guided-onboarding-only notes in `design/SPATIAL_WORKSPACE.md` and `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Fable NONE / A2 is replaced by two independent reviews; merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, real products, or release.

## What changed

Host-only (TypeScript). No Rust, protocol, schema, `DB_VERSION`, `BUILD_ID`, or fixture change; no generated contract change; no new dependency; no new color token.

- Project list: “내 공간으로 시작” (existing empty draft, testid `create-project`) and “예제로 둘러보기” (new, testid `create-example`) are separate choices with a disclosure. The example is its own project filled with the bundled synthetic values and named `예제 · 합성 데이터 (실제 상품 아님)`; the list shows an “예제 · 합성” badge and the project screen a banner. The name prefix is the only marker (no row field added).
- Measurement screen: `OnboardingPanel` — steps (공간 안쪽 → 개구부 선택 → 물건 선택 → 확인·저장 → 계획 검토), per-field how-to and input example, correction text per Rust diagnostic code with a jump to the field, and the supported scope. “지금 필요한 값” is the first measurable row of the Rust next-facts list; before that list exists it is the first blank required (interior) field and says it is guide order. The panel reads the draft and the list and issues no worker request.
- Context help follows the focused field; every field button and “고칠 칸으로 이동” focuses the real input and sets the workspace focus without editing a value.
- Closing the guide keeps all input. The open/closed choice is tab-level `sessionStorage`, not stored project data; new empty projects and examples start open.
- Plan screen and purchase panel: any project pinned to the bundled synthetic catalog digest shows “합성 예제 자료… 구매할 수 없습니다”; the seller link text becomes “예제 링크 (실제 판매처 아님)”. Link behaviour and the purchase flow are unchanged.
- “샘플 값 채우기” relabelled “합성 샘플 값으로 바꾸기” (testid `fill-sample` kept) so replacing input is explicit.
- Contrast cases `primary-on-info-soft` and `secondary-on-info-soft` added (13.776:1 and 6.155:1).

## Changed paths

- Docs: `docs/adr/SP-z-guided-onboarding.md`, `design/DECISIONS.md`, `design/SPATIAL_WORKSPACE.md`, `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.
- Host: `apps/web/src/features/onboarding/{guide.ts,OnboardingPanel.tsx}` (new), `apps/web/src/app/{ProjectsScreen,ProjectScreen,PlanScreen}.tsx`, `apps/web/src/features/purchase/PurchaseHandoffPanel.tsx`, `apps/web/src/styles/project.css`, `design/token-contrast-cases.json`.
- Tests: `apps/web/tests/unit/onboarding.test.ts` (9), `apps/web/tests/browser/guided-onboarding.spec.ts` (5).

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, existing browser specs, and `docs/evidence/ZARI-SPATIAL-001-*.png` are unchanged.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Example is separate from a real start | Browser `empty list…`: two distinct buttons, disclosure text, keyboard Tab order; a real start has no banner, blank width, no badge. `example…`: example has banner, filled values, list badge, and a following real start is blank with two rows. Unit: `emptyProjectForm` has no measurement, `sampleProjectForm` has |
| Example product does not look purchasable | Browser `example…`: plan screen `synthetic-notice` “구매할 수 없습니다”; purchase panel `data-synthetic=true`, note “합성 예제”, link text “예제 링크 (실제 판매처 아님)”, no “판매처에서 보기”, `data-paid=false`. Unit: only the bundled digest is flagged synthetic. Existing `purchase-handoff.spec.ts` still passes unchanged |
| Closing the guide keeps input | Browser `first use…`: three typed (unsaved) values survive closing by keyboard (Enter on the toggle); after save and a real reload the closed state and values persist; reopening keeps them. The guide leaves the draft untouched (unit: `suggestedField` does not mutate) |
| No excessive measurement first; linked to the fact query | Browser: guide `data-source=rust`; goto-next focuses exactly the first `data-destination=field` row of the Rust list; only the three interior values are entered, the commit saves, and opening width stays blank / “미측정”. Request counters (`data-spatial-requests`, `data-normalize-requests`, `data-next-facts-requests`) are identical before and after goto/help/toggle. Unit: Rust order wins; catalog/unsupported/unknown rows are skipped; fallback never suggests an optional step |
| Measurement order, input example, error fix, supported scope | Unit: every field has label/how/example, steps cover each field once with optional opening/items, every Rust diagnostic code has a correction. Browser `error fix`: “육백” keeps its text, shows the correction, the fix button focuses the field, correcting it clears the entry |
| Help jumps to the real field | Browser: help field button focuses `공간 안쪽 높이` and updates `focus-context`; context help for a focused field shows its example (`450`) |
| Keyboard / responsive / forced colors | Keyboard in the browser tests above; 390×844 with `forcedColors: active` has no horizontal overflow and the toggle/next line are visible. Existing axe scan (`a11y.spec.ts`) covers the empty list, filled editor, and error editor with the guide open and passes |

## Commands

Prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`. Playwright timeouts were not raised and nothing was retried.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 246 passed, 0 failed, 1 ignored (pre-existing) |
| `fixture_runner -- fixtures/bootstrap` / `-- fixtures` | exit 0; 28 / 124 cases. `git status fixtures Cargo.lock` clean |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0 |
| `npm run wasm:build` / `contracts:check` | exit 0 / “Contracts match Rust source; 124 fixture structures valid.” |
| `npm run typecheck`, `npm run lint` | exit 0, exit 0 |
| `npm test` | exit 0. 36 files, 260 tests |
| `npm run build` | exit 0 (existing chunk-size warning only) |
| `node scripts/check-release-manifest.mjs` | `errors: []`, buildId `709da12faf6c84e8` |
| `node scripts/check-design-tokens.mjs --self-test` | 72 base tokens; 41/41 contrast cases |
| `npm run test:browser -- --project=chromium` (full tree) | exit 0. 129 passed, 0 failed, 0 flaky |
| `npm run test:parity` | exit 0. 124 shared fixtures match native vs browser Worker/WASM |
| `npx vite build --mode test` + `playwright test guided-onboarding.spec.ts --project=firefox` / `webkit` | exit 1: `browserType.launch: Executable doesn't exist` for both. **Not run — UNVERIFIED** |

An earlier full run during development (before the final edits) failed on existing specs because the first draft of the panel repeated Rust's diagnostic text and the staging-limit sentence, which made `getByText` strict-mode matches ambiguous in `a11y`, `detail`, `project`, `workspace`, and `accessibility-workspace`. The panel text was changed (the fix line no longer repeats the diagnostic; the scope line is a paraphrase); no existing test was edited. The final full run above is green. Bare `npx playwright test <name>` also ran `@capture` specs that need `ZARI_CAPTURE_DIR`; those are excluded by `npm run test:browser` and were not part of the final run.

## Browser evidence

Chromium 1440×1000 (default) and 390×844 forced-colors; real Worker/WASM and IndexedDB; routes `#/projects`, `#/project/<id>`, `#/project/<id>/plan`. Flows: empty list, real start, first measurement with guide (success), invalid value (failure), close/reload (state), example → plan → purchase panel. Console/page errors asserted empty in each flow. No screenshots were kept; none is a baseline.

## Known limits / unverified

- Firefox and WebKit not run (browsers not installed here). Phone hardware and GPU not exercised.
- The example marker is the project name prefix; a user cannot rename projects in this build, but an imported/duplicated example whose name keeps the prefix is also treated as an example.
- The “real start” still pins the bundled synthetic catalog (the only bundled catalog), so its plan and purchase screens show the synthetic notice too; real catalogs are a separate node.
- Guide text (how to measure, input examples) is host copy, not a domain verdict; wording was not user-tested with first-time users.
- The “안내 순서” fallback checks raw text emptiness only; it is a navigation hint and not a pass/unknown judgment.

## Contract-change advisory

None. No Rust, protocol, schema, generated contract, fixture, or `BUILD_ID` change.

## Deviations

- Existing button text “샘플 값 채우기” was relabelled (testid kept) and “새 프로젝트” became “내 공간으로 시작”; no test depended on either text.
- Purchase link text differs for synthetic catalogs; the existing test only used the testid and `href`.

## Out of scope

Real catalogs/products/photos/cloud/purchase connection, a full-screen wizard, persistent onboarding progress, project rename, translations, any other z-node.
