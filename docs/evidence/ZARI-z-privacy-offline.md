# ZARI-z-privacy-offline evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #110, node z-privacy-offline, “오프라인 수명과 사용자 데이터 통제”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-privacy-offline`.
- Observed base SHA: `d533b408a7da44a6a4d84a94609935d16098c2c3` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PERSISTENCE.md` §§6–7; `docs/MASTER_PROMPT_KO.md`, `docs/RUST_ADDENDUM_KO.md` (targeted); `DESIGN.md`; `design/DECISIONS.md`; `design/SPATIAL_WORKSPACE.md`; previous node evidence and ADRs (z-portable-project, z-location-search, z-performance-budget). `docs/aiops/**` candidates were not used as extra scope; `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `docs/adr/SP-z-privacy-offline.md`, `design/DECISIONS.md` Dz-privacy-offline, and a z-privacy-offline-only note in `design/SPATIAL_WORKSPACE.md` and `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Fable NONE / A2 is replaced by two independent reviews; merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, or release.

## What changed

Host-only (TypeScript). No Rust, protocol, schema, `DB_VERSION` (stays 6), `BUILD_ID` (`zari-domain-7`), or fixture change; no generated contract change; no new dependency; no new color token.

- New route `#/data` “내 데이터” (`DataScreen.tsx`), linked from the projects header. Per project: 프로젝트 (JSON export, delete), 사진 (count/size, per-photo download of the display derivative, delete all photos), 검색 = location log (observation count, JSON export, delete). A delete confirms inline, then is reported done only after the rows are read back as gone; on failure it says nothing was removed and the rows stay. Unreadable rows show as unreadable, not zero.
- Storage panel: `navigator.storage.estimate()` and `persisted()`; unknown is shown as “알 수 없음”, never 0; warning at ≥ 80%.
- Compatibility panel (read only): stored DB version, migration journals, rows with a newer `schemaVersion`, shell cache active/previous/staged build. Dexie 4 opens a database stored at a newer version instead of refusing it, so the stored backend version is read and `newer_database` is reported.
- Connection split (`features/privacy/connections.ts`): four fully local entries, same-origin app-file update, user-opened purchase link; external AI, analytics, and sync are stated absent.
- Store failures (including `persistence_failed:quota`) are worded “저장되지 않았습니다” in the photo and location panels and the data screen.
- Repository: `deleteProjectPhotos`, `deleteLocationLog`, `dataScope`, `listPhotoMeta`, `getAttachment`, `compatibility`.

## Changed paths

- Adoption/docs: `docs/adr/SP-z-privacy-offline.md`, `design/DECISIONS.md`, `design/SPATIAL_WORKSPACE.md`, `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, `docs/PERSISTENCE.md` §21, `docs/IMPLEMENTATION_STATUS.md`, this file.
- Host: `apps/web/src/app/DataScreen.tsx`, `App.tsx`, `ProjectsScreen.tsx`, `ProjectScreen.tsx`, `sessionRegistry.ts` (export `ENGINE_BUILD_ID`; no Worker warm-up on `#/data`), `apps/web/src/features/privacy/{connections,device,exports}.ts`, `features/location/LocationPanel.tsx`, `persistence/repository.ts`, `styles/project.css`.
- Tests: `apps/web/tests/unit/privacyOffline.test.ts` (18), `apps/web/tests/browser/privacy-offline.spec.ts` (5).

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` are unchanged (the PNGs were rewritten by the browser run and restored with `git checkout`).

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Adopted snapshot survives an offline visit and a forced close | Browser `an offline visit and a force-closed tab…`: adopt a plan online, wait for the staged shell build, reload, go offline, open the project in a new tab served by the service worker, type into the draft (a real IndexedDB write), `page.close({runBeforeUnload:false})`, reopen offline. The `accepted` pointer and the JSON of all snapshot rows are equal before and after; the guide renders; the data screen shows compat `ok` and the shell cache. Chromium only. |
| Full storage is never shown as saved | Unit: Dexie `QuotaExceededError` on attachment add and on location save leaves rows unchanged and maps to `persistence_failed:quota`; text never says saved. Browser: injected `QuotaExceededError` on `add` → photo error “저장되지 않았습니다”, no thumbnail, zero rows; on `delete` → data-screen error “지워진 것은 없습니다”, rows kept. Existing project-input and action-step quota tests still pass |
| No silent transmission to external AI/analytics | Unit static guard: the only network API in shipped sources is `public/sw.js`; it handles same-origin GET and its own manifest only; no analytics/AI dependency; no third-party URL in src/html/css; external anchors are `noopener noreferrer` + `_blank`. Browser: every request in the data-screen and offline flows is same-origin, GET, with no body |
| Old cache / schema migration compatibility | Unit: a v1 database upgrades 1→2…5→6 with every journal and the snapshot row byte-equal; newer-schema rows are reported and not rewritten; a database stored at a newer version is reported `newer_database` and untouched |
| Scoped delete/export of photos, search, project | Unit: each scope removes only its rows; project delete leaves no photo or location row; unreadable row reported as null/corrupt and still deletable. Browser: exports (project JSON without photo bytes, location JSON, one photo with PNG magic), declined delete changes nothing, photos-only / location-only / whole-project deletes checked by reading IndexedDB |
| Local vs external split | `connection-list` rendered with four `local` entries, update, purchase link, and the absent-features line; unit test fixes the classification |

## Commands

Prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`. node v24.19.0, npm 11.17.0, rustc 1.98.1, wasm-bindgen 0.2.128. Playwright timeouts were not raised and nothing was retried.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 246 passed, 0 failed, 1 ignored (the pre-existing completion-query ignore) |
| `fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `fixture_runner -- fixtures` | exit 0, 124 fixtures. `git status fixtures Cargo.lock` clean |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: serde_json, wasm-bindgen, zari-core, zari-solver |
| `npm run wasm:build` | exit 0 |
| `npm run contracts:check` | “Contracts match Rust source; 124 fixture structures valid.” |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. 35 files, 251 tests |
| `npm run build` | exit 0 (existing chunk-size warning only) |
| `node scripts/check-release-manifest.mjs` | `errors: []`, buildId `803dc188afd8c6f8`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 72 base tokens; 39/39 contrast cases. No new token or case |
| `npm run test:browser -- --project=chromium` | exit 0. 124 passed (3.2m), including the 5 new tests. No worker-state flake observed |
| `npx playwright test …/privacy-offline.spec.ts --project=firefox` | exit 1, 5 failed: the Firefox executable is not installed on this host (`browserType.launch: Executable doesn't exist`). UNVERIFIED |
| `npx playwright test …/privacy-offline.spec.ts --project=webkit` | exit 1, 5 failed: the WebKit executable is not installed. UNVERIFIED. On WebKit the offline test uses a cache-completeness check instead of an offline reload; no test is skipped |
| `npm run test:parity` | exit 0. 2 passed. “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Routes `#/projects` → `#/data`, project page photo attach, plan page offline. Chromium 1440×1000 desktop emulation, then 390×844 with `forcedColors: active` (no horizontal overflow, controls focusable). Keyboard: nav link, delete and confirm buttons pressed with Enter. Collected `pageerror` and console `error` lists were empty (injected quota errors excluded by name in the two failure tests). Empty, normal, error, and in-progress (`role=status`) states are covered. Screenshots are not committed. Phone and GPU were not available and are UNVERIFIED.

## Contract-change advisory

None. No command, capability, DTO, schema, protocol, `DB_VERSION`, `BUILD_ID`, exportVersion, or fixture byte changed.

## Known limits

- Firefox and WebKit were not run (browsers not installed here). The offline/force-close flow was exercised on Chromium only; WebKit uses the Cache Storage completeness check instead (WPE crashes on offline reload).
- “Force close” is `page.close` without beforeunload, not an OS kill or power loss. Whether the in-flight draft write finished is not asserted; only that adopted rows are unchanged.
- The compatibility check reads a newer stored version but a build older than the data may still be served by a cached old shell; Dexie may add tables it declares that a newer DB lacks (not exercised against a real older build).
- Quota is injected, not a real full disk. `estimate()` values depend on the browser.
- Deletion does not reach exported files or browser/OS backups; this is stated in the UI.

## Deviations

None from the node scope. Items the spec did not ask for and were left out are listed below.

## Out of scope

Whole-device reset, `navigator.storage.persist()`, photo bytes in the portable bundle, location JSON import, separate scopes for purchase/feedback/inventory logs, CSP, the next z-node.
