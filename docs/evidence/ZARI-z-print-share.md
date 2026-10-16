# ZARI-z-print-share evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #106, node z-print-share, “도면·BOM·실행 가이드의 한 묶음 출력”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-print-share`.
- Observed base SHA: `3274613051142b125e818f1dd912d310d959fbfd` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`; `docs/MASTER_PROMPT_KO.md` §§7–14,24; `docs/RUST_ADDENDUM_KO.md`; `docs/BLUEPRINT.md`; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Previous node evidence and ADRs (z-execution-checklist, z-portable-project, z-purchase-handoff, z-feedback-reorganize) were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**`, `docs/aiops/**`, and `.github/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `docs/adr/SP-z-print-share.md`, `design/DECISIONS.md` Dz-print-share, a z-print-share-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, and `design/SPATIAL_WORKSPACE.md` §8. This delivery is z-print-share only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, payment, cloud, photo consent, or release.

## What changed

The printable package and its CSVs are a host-side read view of one `PlanSnapshot` plus the `SpatialProjection` Rust stamped for that snapshot. No quantity, price, fit, or coordinate is computed by this node; every value is Rust output formatted as text. An unknown stays the word `미확인` and is never promoted to 0, a pass, or a default. Rust source, protocol, capabilities, schema, persistence, and `BUILD_ID` are unchanged.

- `apps/web/src/features/print/package.ts` (new): `buildPrintPackage(input)` builds the deterministic `PrintPackage` (cover with stage/current/strategy/assurance/commerce/completeness, space interior measures, top+front drawings with numbered rects and a not-drawn list, diagnostics, placements, per-item locations, unassigned, all checks, BOM + cost + purchase notes, execution steps with optional progress). `revisionBlocks` refuses while the projection is loading/absent (`drawing_loading`), failed (`drawing_unavailable` / `revision_mismatch` for a session-rejected `projection_source_mismatch`), stamped for another plan (`revision_mismatch`), or stamped with another input/catalog digest (`input_mismatch`/`catalog_mismatch`), or when `projectionVersion` is not 1 (`projection_version`). `verifyPackage` re-counts every section against the snapshot and projection after assembly and refuses a dropped row (`omitted_rows`) or a section that carries a second revision (`section_revision`). `packageDigest` is the SHA-256 of the package JSON — the reproducibility handle. `safeLinkText` prints only plain `http(s)` single-line addresses and only when the scope includes links.
- `apps/web/src/features/print/scope.ts` (new): `PrintScope` — four include/exclude choices (project name, item/owned-container names, purchase links, guide progress). Default `SHARE_SCOPE` is all-off; the choice lives only in the panel and is never saved. Photos, attachments, location records, feedback, free-text notes, and account/device facts are always excluded. `makeLabeler` renumbers hidden names by their order in the saved input (`물건 1`, `보유 수납함 1`); an id that cannot be resolved is printed as `(대상)`, never as raw user text. Catalog product names are catalog data and stay.
- `apps/web/src/features/print/csv.ts` (new): two CSVs (`구매 목록`, `계획 전체`). Every row starts with the plan id; every cell passes the existing formula-safe `csvCell`; headers are not the catalog/provenance import columns so `csvToEntries`/`csvToBatch` refuse them; a UTF-8 BOM is prepended at download; empty sections print an explicit `없음` row.
- `apps/web/src/features/print/PrintPackageView.tsx` (new): pure markup of the package — no hooks, no handlers, no links. One frame table whose `thead`/`tfoot` bands repeat on every printed page (plan id 64-hex, unit `mm`, input digest, catalog version/source, rule version, scope, "미확인은 통과가 아닙니다"). Each drawing starts a new sheet; rows/figures do not split. The same function renders the on-screen preview, the print sheet, and the byte-compared export fixtures.
- `apps/web/src/features/print/PrintPanel.tsx` (new): the plan-detail panel. Scope fieldset with real checkboxes, `공유용`/`모두 포함` presets, the always-excluded statement, blocked reasons in a `role="alert"` list, a ready `role="status"` line, and preview/CSV buttons that are disabled while blocked. `인쇄 미리보기` opens a modal `role="dialog"` (focus trap, Esc, focus returns, app root `inert`); `인쇄` calls `window.print()` once; `body[data-print-open]` is the only condition under which print CSS hides the app.
- `apps/web/src/styles/print.css` (new): panel/preview/package/print styles on existing semantic tokens; no new color pair. Meaning never rests on color (미확인 underlined+bold; container solid vs contained dashed). A4 `@page`, repeated header/footer groups, `break-before`/`break-inside` rules, `word-break: keep-all` for Korean, forced-colors adjustment.
- `apps/web/src/app/PlanScreen.tsx`: the old BOM-only `bom-csv` button is replaced by the `PrintPanel` mounted after the guide section; it reads only the displayed snapshot, its Rust projection, the loaded catalog row, the project name, and accepted-plan progress. `features/plan/projection.ts`: `rectOf` is exported (no logic change). `features/plan/csv.ts`: `bomCsvRows`/`BOM_CSV_HEADER` removed; `csvCell`/`toCsv` kept as the formula-safe base. `main.tsx` imports `print.css`.
- Tests: `apps/web/tests/unit/print.test.ts` (20) driven by real WASM output (`tests/unit/printFixture.ts` runs the shared domain fixtures through the actual built WASM); `apps/web/tests/browser/print-share.spec.ts` (6); byte-compared export fixtures in `apps/web/tests/fixtures/print-share/` (13 files: two shared domain fixtures × share/full scope × html/plan.csv/bom.csv + `index.json` digests).

## Changed paths

- Adoption/docs: `docs/adr/SP-z-print-share.md`, `design/DECISIONS.md` (Dz-print-share), `design/SPATIAL_WORKSPACE.md` §8 note, `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` note, `docs/FRONTEND.md` §23, `docs/TEST_STRATEGY.md` §20, `docs/IMPLEMENTATION_STATUS.md`, this file.
- Web: `apps/web/src/features/print/{scope,package,csv}.ts`, `PrintPackageView.tsx`, `PrintPanel.tsx`, `apps/web/src/styles/print.css`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/features/plan/{csv,projection}.ts`, `apps/web/src/main.tsx`.
- Web tests: `apps/web/tests/unit/print.test.ts`, `apps/web/tests/unit/printFixture.ts`, `apps/web/tests/browser/print-share.spec.ts`, `apps/web/tests/fixtures/print-share/` (13 files).

`.gitattributes` gained one line: `apps/web/tests/fixtures/print-share/** -text`. The generated CSVs use CRLF (RFC 4180, via the shared `toCsv`) and the test compares them byte for byte; under the repo-wide `* text=auto eol=lf` the committed blobs would have been normalized to LF and a fresh checkout would fail the comparison. `-text` keeps the stored bytes identical on every checkout (verified: staged blob retains `\r\n`; `git check-attr` → `text: unset`).

`fixtures/`, `Cargo.lock`, `package.json`, `package-lock.json`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, `.github/**`, generated contracts, and persistence were not touched (`git diff` empty). No new dependency. `docs/evidence/ZARI-SPATIAL-001-*.png`, which the browser suite rewrites, were restored with `git checkout`.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| 도면과 BOM의 revision이 다르면 출력이 차단된다 | Unit: `revisionBlocks` — a projection from another plan (`revision_mismatch`), another input/catalog digest (`input_mismatch`/`catalog_mismatch`), loading/absent (`drawing_loading`), failed (`drawing_unavailable`), session-rejected (`projection_source_mismatch`), unknown format (`projection_version`); `verifyPackage` refuses a skewed `bomRevision`/drawing revision (`section_revision`). Browser: test-build `__zariCorruptProjection` stamps the reply with another plan id → `data-state=blocked`, `role="alert"` list, every button disabled, no download |
| unknown과 미배정 물건이 출력에서 생략되지 않는다 | Unit: every unassigned row and every unknown check is listed; unknown quantity → `수량 미확인`, unknown price/packs/inventory → `미확인` (never `0`/`통과`); a dropped row or drawn element is refused (`omitted_rows`); an unplaceable element is listed with its reason; unreadable progress reads `진행 기록을 읽지 못함`, never an all-todo list; empty sections print explicit `없음` rows. Browser: `print-unassigned` and `print-unknown-checks` visible in the real package |
| CSV 수식·외부 링크가 실행 입력으로 변환되지 않는다 | Unit: `= + - @` and tab-leading cells are quoted behind a leading `'` in both CSVs; `csvToEntries` returns null and `csvToBatch` reports issues for both files (not a ZARI import format); links print only as plain `http(s)` text (`javascript:`/`=HYPERLINK(`/whitespace URLs → `주소 형식 확인 불가`) and the markup contains no `<a>`/`href`. Browser: downloaded CSV — every row starts with the plan id, links off by default |
| PlanSnapshot ID·치수 단위·unknown·구매 조건을 모든 페이지에 연결한다 | Unit: every section carries `pkg.revision`, unit `mm`, scope text. Browser+PDF: the real preview printed to PDF — every page contains the 64-hex plan id, `단위 mm`, `포함 범위`, and the unknown/purchase-check footer text (`pdftotext` per page; I also looked at the rendered pages of the real preview PDF at 80 dpi: cover, top-view drawing with numbered rects and legend, a 33-row check table continuing on the next page with its header repeated, purchase list, and steps) |
| 인쇄/다운로드에 개인정보 포함 범위를 고른다 | Unit: default scope is all-off; a sentinel label/project name/URL is absent from package JSON, markup, and both CSVs under `SHARE_SCOPE` and present under `FULL_SCOPE`; hidden names renumber deterministically. Browser: checkboxes toggled by keyboard change the preview text and the footer scope line; the downloaded CSV states the chosen scope |
| 긴 BOM·여러 도면·한글·페이지 나눔을 검증한다 | Browser (Chromium PDF): a 90-row BOM, 40 rects + 1 missing per drawing, 120 assignments, 60 checks, long Korean labels — ≥8 pages, every BOM row 1–90 found via `pdftotext`, last rows present, repeated `품목` header on ≥4 pages, drawings on separate sheets (top before front), Korean glyph text intact, no price split mid-number |
| 인쇄 가능한 계획 패키지와 CSV | `PrintPackageView` + `window.print()` once; two CSV downloads (`zari-{plan,bom}-<id12>.csv`, UTF-8 BOM). Browser: print call count is exactly 1 with `data-print-open=true`, app root inert while open, Esc returns focus |
| export 재현 fixture와 실제 출력 검토 | Unit: same snapshot+scope → identical package JSON, markup, CSV, and digest; stored fixtures in `apps/web/tests/fixtures/print-share/` compared byte-for-byte (regenerate only with `ZARI_UPDATE_PRINT_FIXTURES=1`); PDF page text reviewed via `pdftotext` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. Node v24.19.0, npm 11.x, rustc 1.98.1, wasm-bindgen 0.2.128. Playwright timeouts were not raised. Results below are from the final tree.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0, **241 passed, 0 failed** (1 ignored fixture emitter; no Rust change in this node) |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0 |
| `… -- fixtures` | exit 0, 124 fixtures; `git status fixtures Cargo.lock` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0; no new dependency |
| `npm run wasm:build`, `npm run contracts:check` | exit 0; “Contracts match Rust source; 124 fixture structures valid.” |
| `npm run typecheck`, `npm run lint` | exit 0 |
| `npm test` | exit 0, 34 files, **229 passed** (was 209; +20 new `print.test.ts`), run on a quiet host (load ≈ 4) twice. A supervisor run on a loaded host failed one real-WASM wait in `session.test.ts` (“accepting an accepted snapshot after the input moved is refused as stale_input”, 30 s wait with the search still `running`); that file and the session/worker code are unchanged by this node, and the full rerun passed 229/229. No timeout or test was changed |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0, `errors: []`, `buildId` `e523533848307a97` |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0, 12 self-tests, 39/39 contrast cases (no new pair) |
| `node scripts/check-product-contract.mjs` | exit 0; 16 ids unchanged, 124 fixtures unchanged, runtime hits 0 |
| `npm run test:browser -- --project=chromium` | exit 0, **117 passed, 0 failed** (5.4 m and again 5.5 m on the final tree; 111 before + 6 new) on a quiet host. Later full runs on a host shared with other jobs (load average 15–57 on 8 cores, free memory down to 150 MB) were not clean: one was killed (exit 137), one failed 3 specs and one 2 (`print-share.spec.ts:213`, `product-completion.spec.ts:40`) with the search watchdog reporting `interrupted` or the search still `running` at the 60 s wait, and a `--workers=2` run failed 4 unrelated specs (`lifecycle.spec.ts:122`, `offer-bundles.spec.ts:38`, `product-completion.spec.ts:40`, `progress.spec.ts:206`). The failing set differed every run; the failed specs passed when rerun alone (`print-share` + `plan` 10/10; the four above 4/4). The wait for the real WASM search is wall-clock. No test, timeout, or threshold was changed, no retries were added. In the last runs the Playwright cache only had Chromium 145 (rev 1208) while Playwright 1.63 wants rev 1243, so `ZARI_CHROMIUM_EXECUTABLE` (the config's own hook) pointed at the cached 1208 headless shell; the 6 print tests pass on it (6/6) |
| `npm run test:browser -- --project=chromium --workers=1` (re-verification on the final tree) | exit 0, **117 passed, 0 failed** (17.6 m) — see "Re-verification flake analysis" below for the earlier failed attempts on the same tree |
| `npx playwright test apps/web/tests/browser/print-share.spec.ts --project=firefox` | exit 0, **6 passed, 0 skipped** (the two PDF tests branch by engine: Chromium prints a PDF; other engines assert the print-media layout — app hidden, toolbar hidden, `thead`/`tfoot` repeat groups, `break-before` on each drawing, all 90 rows in the DOM) |
| `… --project=webkit` | exit 0, **6 passed, 0 skipped** (same) |
| `npm run test:parity` | exit 0, 2 passed, “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Routes: `#/` → create project → fill sample → commit input → `#/project/<id>/plan` → compute → open the first plan card → output panel. One test accepts the plan for the progress scope. Viewports 1440×1000 and 390×844 (`forcedColors: active`, `ko-KR`). Engines: Chromium, Firefox and WebKit run all six tests. Playwright prints PDFs in Chromium only, so the two print tests run the PDF checks on Chromium and the print-media layout checks (no PDF) on Firefox and WebKit; nothing is skipped.

Flows: (1) scope default all-off and keyboard-togglable; preview dialog modal, focus trapped, Esc closes and returns focus, app root inert, `window.print` called exactly once; every section `data-revision` equals the shown snapshot id; no personal text or `<a>` under share scope; plan CSV rows all start with the plan id; BOM CSV under full scope carries plain-text links; digest line shown. (2) `__zariCorruptProjection` test-build hook stamps the projection with another plan id → panel `blocked`, `revision_mismatch` alert, all buttons disabled, nothing downloaded, the plan itself still reads normally. (3) accepted plan — progress column prints `완료`/`미완료` only when the scope includes it, else `범위에서 제외`. (4) 390px + forced colors — no horizontal overflow, panel and preview keep their text. (5) real `page.pdf()` of the open preview — `#root` hidden in print media; every page carries the plan id, `단위 mm`, `포함 범위`; both drawing titles present (pdftotext). (6) long Korean package (90 BOM rows, 40 rects/drawing, 120 assignments, 60 checks, 30 steps) printed to PDF — ≥8 pages, all rows recovered from page text, repeated table headers, separate drawing sheets, unbroken prices, Korean text intact. Console `error`/`pageerror` lists and non-local requests were empty.

Artifacts: no screenshots or baselines were created; the `long-package.pdf` Playwright attachment under `test-results/` is DRAFT evidence only. Phone and discrete GPU were not available and are UNVERIFIED; viewport/forced-colors/keyboard runs are desktop browser emulation; a physical printer is untested.

## Re-verification flake analysis

The supervisor re-verification of the unchanged final tree failed inside `npm run test:browser -- --project=chromium` (3 failures), and my own re-runs on the same tree produced 1–3 failures per run — always a *different* spec, always the same mechanism: the WASM compute in `compute-plan` either hit `search_stalled` (the existing 10 s no-progress watchdog in `SearchPump`, which by design shows `interrupted` and never auto-restarts — `docs/WASM_PROTOCOL.md`) or the Chromium renderer was OOM-killed (`dmesg`: `Out of memory: Killed process … chrome-headless … global_oom, oom_score_adj=300`, invoked by an unrelated `node` tenant). This 16 GB, no-swap host runs other heavy jobs concurrently (load average peaked ≈ 17 during the failed run).

Why this is environmental, not a code defect:

- The failing waits are all on `data-search="done"` *before* any print UI mounts; the diff touches no solver, worker, protocol, or search-scheduling code (`git diff` scoped to `features/print/**`, `PlanScreen`, `plan/{csv,projection}`, `main.tsx`, `print.css`, tests, docs).
- Interruption is the designed honest state for a stalled worker; the product intentionally does not auto-retry (repository rules: no automatic retry).
- Every spec that failed in a full run passes in a focused run on the same tree — verified for `plan.spec.ts` (all), `quality.spec.ts` (all 6), `print-share.spec.ts` (all 6 on chromium/firefox/webkit), `feedback-reorganize.spec.ts` (all 3), `search-diagnostics.spec.ts`, `incremental-replan.spec.ts`.
- Prior nodes document the same convention on this host: `ZARI-SPATIAL-009…016` evidence all records `--workers=1`; SP-014 records interrupt-under-load incidents with no timeout changes.

Focused re-runs today on the unchanged final tree: `quality.spec.ts` 6/6; `print-share.spec.ts` 6/6 chromium, 6/6 firefox, 6/6 webkit; `plan.spec.ts`+`feedback-reorganize.spec.ts`+`search-diagnostics.spec.ts`+`incremental-replan.spec.ts` 9/9. No test, timeout, watchdog, or threshold was changed; nothing was skipped, retried, or marked `.only`/`.fixme`.

Final state: a full `npm run test:browser -- --project=chromium --workers=1` on the final tree (after the `.gitattributes` fixture-attribute line) ran to completion with **117 passed, 0 failed in 17.6 m**, load average ≈ 3 at start. The flaky mechanism above did not appear in that run.

## Contract-change advisory

None. No command, event, DTO, capability, persisted schema, or migration was added or changed. `BUILD_ID` stays `zari-domain-7`; schema/protocol/canonical/rule/export versions unchanged; document `dbVersion` 2 and live `DB_VERSION` 6 unchanged; generated contracts untouched; existing fixture expected bytes and the 124-entry manifest unchanged. `PrintScope`/`PrintPackage`/`PrintResult` are app-internal types, not generated contracts. The removed `bomCsvRows`/`BOM_CSV_HEADER`/`bom-csv` button were app-internal; the BOM CSV download is superseded by the scope-aware `구매 목록 CSV` (plan-id-prefixed rows — an explicit Dz-print-share decision, not a wire contract change).

## Known limits

- Physical printer output is UNVERIFIED; page-break behavior is the browser's and was checked as printed pages only through Chromium PDF + `pdftotext`. On Firefox and WebKit only the print-media computed layout (repeat groups, drawing page breaks) was asserted; their actual pagination was not measured. The page-text checks need `pdftotext`; without it the Chromium tests check page counts only (recorded as a test annotation).
- The scope choice is per-panel-mount and is not remembered across reloads by design.
- A very long package is bounded only by the snapshot size; no hard row cap exists (the 90/120/60/30-row case paginated correctly; larger plans are untested).
- The hidden-name numbering (`물건 N`) follows the saved-input order, so it is stable for one snapshot but is not a durable cross-plan identifier.
- Phone and a discrete GPU are UNVERIFIED. CodeQL results come from CI on the supervisor's PR.

## Out of scope

The next z-node, PDF/image generation as a product feature (the browser prints), email/share links/cloud delivery, purchase or payment connection, photo consent, signed/certified printouts, new drawing computation or dimension lines, 3D output, server rendering, approved-baseline changes, and rewriting preserved fixtures or prompts.
