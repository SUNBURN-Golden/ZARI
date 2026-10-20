# ZARI-z-local-delivery evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, a device qualification, or a release.

- Task: GitHub issue #118, node z-local-delivery, "설치·업데이트·사용 안내와 로컬 제품 인계".
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`. Branch `astra/zari-z-local-delivery`.
- Observed base SHA: `3e76e96512a50cd13167587d7539d38454501813` (origin/main at branch creation).
- Adoption: JunTae Park (준태), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `docs/adr/SP-z-local-delivery.md`, `design/DECISIONS.md` Dz-local-delivery, and z-local-delivery-only notes in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` and `design/SPATIAL_WORKSPACE.md`. Fable NONE / A2 replaced by two independent reviews; merge delegated to the supervisor. `.aiops/**`, `docs/aiops/**`, `.github/workflows`, `SOURCE_MANIFEST.json`, `fixtures/` untouched.
- `contract_change=NO`. No Rust, protocol, capability, schema, `DB_VERSION`, `SCHEMA_VERSION`, `exportVersion`, `BUILD_ID`, fixture, or generated-contract change. Two host-side UI changes: the `versionchange` reload prompt is wired (`repository.onVersionChange` existed unwired), and the projects screen's store error reads through `describeStoreFailure`.

## What changed

`docs/delivery/LOCAL_DELIVERY.md` organizes the supported browsers/devices, build, app-shell update (SW staged→promoted at navigation, previous build kept, `builtAt` downgrade guard), IndexedDB migration path (v1→v6 journals), failure table, the existing-data upgrade result, inspection commands, and the real scope vs long-term unimplemented split. `docs/delivery/release-candidate/` is the release-candidate bundle: `manifest.json` (pins, storage versions, supported targets, required gaps, observed dist digests; `releaseState NOT_AUTHORIZED`, `sourceCommit` left null for the delivery PR) plus `index.md`. `scripts/check-release-candidate.mjs` verifies the manifest against repo pins and, with `--dist`, against a fresh build. The z denominator keeps all 21 nodes tracked: z-product-qualification is MERGED (PR 117), z-local-delivery is IN_PROGRESS, review BLOCKED.

## Changed paths

- App: `apps/web/src/app/App.tsx`, `apps/web/src/app/ProjectsScreen.tsx`.
- Tests: `apps/web/tests/browser/local-delivery.spec.ts`, `apps/web/tests/unit/localDelivery.test.ts`, `apps/web/tests/unit/zQualification.test.ts` (ledger state update).
- Delivery: `docs/delivery/LOCAL_DELIVERY.md`, `docs/delivery/release-candidate/manifest.json`, `docs/delivery/release-candidate/index.md`, `scripts/check-release-candidate.mjs`.
- Ledger: `docs/qualification/z-denominator.json`, `scripts/check-z-denominator.mjs`.
- Records: `docs/adr/SP-z-local-delivery.md`, `design/DECISIONS.md`, `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, `design/SPATIAL_WORKSPACE.md`, `docs/PERSISTENCE.md` §22, `docs/FRONTEND.md` §24, `docs/IMPLEMENTATION_STATUS.md`, this file.

## Acceptance mapping

| Spec item | Where |
|---|---|
| 지원 브라우저/기기·빌드·업데이트·저장 migration 경로 정리 | `LOCAL_DELIVERY.md` §§1–4; migration §3.2 + failure table §4 |
| 처음 설치와 기존 데이터 업데이트 확인 | `local-delivery.spec.ts` tests 1–2 (real browser) + `localDelivery.test.ts` (fresh DB, versionchange) + reuse of `repository.test.ts`/`transfer.test.ts` v1/v2 migration cases |
| 장기 미구현과 실제 출시 범위 구분 | `LOCAL_DELIVERY.md` §7, `manifest.json` supportedTargets/requiredGaps, `z-denominator.json` |
| 로컬 설치/검수 안내와 release candidate 묶음 | `docs/delivery/` + `check-release-candidate.mjs` |
| 기존 데이터 업그레이드 결과 | `LOCAL_DELIVERY.md` §5 + spec tests 2–4 |
| 업데이트 실패로 데이터가 지워지지 않는다 | spec tests 3 (newer DB refused, rows intact) + 4 (blocked upgrade applies nothing) |
| 16단계 기준+확장 범위 추적 | `denominator.json` 16 + `z-denominator.json` 21, `check-z-denominator.mjs` |
| 공개 배포·화면 채택·release 별도 근거 표시 | manifest/ledger `NOT_AUTHORIZED`·`PENDING`·`UNQUALIFIED`; `sourceCommit` null |
| versionchange reload prompt (PERSISTENCE §6) | `App.tsx` wiring + spec tests 2–4 asserting `db-version-notice` |

## Commands (PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH, CARGO_BUILD_JOBS=4)

| Command | Result |
|---|---|
| `npm run wasm:build` | exit 0 (wasm-bindgen 0.2.128) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 51 files / 413 tests (409 + 4 new `localDelivery.test.ts`) |
| `npm run build` (run twice) | exit 0 both; identical digests, `buildId b2040d4a0970b60c` — byte-deterministic on this host |
| `node scripts/check-release-manifest.mjs` | exit 0, `errors: []`, 13 assets |
| `node scripts/check-release-candidate.mjs --write` | exit 0, recorded 13 dist digests |
| `node scripts/check-release-candidate.mjs` | exit 0 |
| `node scripts/check-release-candidate.mjs --dist` | exit 0, 13 files + buildId match (after both builds) |
| `node scripts/check-z-denominator.mjs` | exit 0 (merged 20, in-progress 1, not-started 0) |
| `node scripts/check-qualification.mjs` | exit 0 (denominator 16 unchanged) |
| `node scripts/check-review-package.mjs` | exit 0, 3 files verified |
| `node scripts/check-product-contract.mjs` | exit 0 |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0, 72 base tokens, 41/41 contrast cases |
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0, 241 passed / 0 failed |
| `fixture_runner -- fixtures/bootstrap` / `-- fixtures` | exit 0; 28 / 124 cases; `git status fixtures Cargo.lock` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0 |
| `npm run contracts:check` | exit 0; contracts match Rust source, 124 fixture structures valid |
| `npx playwright test local-delivery.spec.ts --project=chromium --workers=1` | exit 0, 4 passed (15.5s) |
| `npx playwright test local-delivery.spec.ts --project=firefox --workers=1` | exit 0, 4 passed (20.5s) |
| `npx playwright test local-delivery.spec.ts --project=webkit --workers=1` | **UNVERIFIED** — `browserType.launch: Host system is missing dependencies` (libgtk-4, libsoup-3, …) |
| `npm run test:browser -- --project=chromium` (full suite, final tree) | exit 0, **143 passed** / 0 failed (3.5m, 4 workers), incl. 4 new local-delivery tests |
| `npm run test:parity` | exit 0, 2 passed; 124 fixtures native vs browser WASM agree |

## Browser evidence detail

`local-delivery.spec.ts`, real Chromium + real IndexedDB + real WASM Worker, preview build at `http://127.0.0.1:4173`:

- Test 1 (fresh install): create → fill sample → commit saved → reload restores the committed width; `#/data` compat report `ok`, journal `없음` (a fresh DB is created at v6 and runs no upgrades); no `db-version-notice`; console errors `[]`.
- Test 2 (existing-data upgrade): a real project (draft, normalized input, catalog, accepted PlanSnapshot) is captured, the DB is deleted and recreated at IDB version 10 (a Dexie-declared v1 database; Dexie stores declared n at n×10) with every row replayed, then the app upgrades it in place: compat journal `1→2, 2→3, 3→4, 4→5, 5→6`, all v6 stores exist, the project lists, the same accepted snapshot id renders. `deleteDatabase` also exercised the versionchange→close→prompt path (`db-version-notice`).
- Test 3 (update failure): a version-70 database (newer than declared 6) is refused — `repository.open()` throws `migration_blocked` on the backend version, `projects-error` shows the reload wording, `#/data` reports `newer_database`, and a raw IDB read proves every row (and the `zariFuture` marker store) is untouched. Found while testing: Dexie 4 opens stored-newer databases without error, so `open()`/`enqueue` now fence on `backendDB().version` and a `movedToNewer` flag — without it a stale tab could write into the newer schema.
- Test 4 (blocked upgrade): a held raw connection blocks the version-70 open (`blocked` event, nothing applied, rows intact); the app's connection releases and shows the prompt; closing the held connection lets the upgrade proceed.

## Known limits

Phone, discrete GPU, real product sites, app catalog URL read: UNQUALIFIED. WebKit on this host: UNVERIFIED (missing browser dependencies). The dist digest comparison is a same-source/same-toolchain reproducibility check, not a cross-machine byte guarantee.

## Out of scope

Release, deploy, approved baselines, real checkout, cloud, accounts, real-device qualification, the (empty) remaining program nodes.
