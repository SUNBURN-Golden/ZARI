# ZARI-z-catalog-crawler evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, a real-site observation, or a release.

- Task: GitHub issue #114, node z-catalog-crawler (owner-ordered amendment, not in the pinned `.aiops/program.json`).
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`. Branch `astra/zari-z-catalog-crawler`.
- Observed base SHA: `1cb98f2ae498264750cd2300dcf419b291cc89ca` (origin/main at branch creation).
- Adoption: JunTae Park (준태), 2026-10-15 KST, verbatim: "크롤링해야지. 이것도 일종의 디지털트윈으로 해서 직접 적용할수있게 해주는건데." Recorded in `docs/adr/SP-z-catalog-crawler.md`, `design/DECISIONS.md` Dz-catalog-crawler, and a z-catalog-crawler-only note in `design/SPATIAL_WORKSPACE.md`. Fable gate replaced by two independent reviews; merge delegated to the supervisor. `.aiops/**`, `docs/aiops/**`, `.github/workflows`, `SOURCE_MANIFEST.json` untouched.
- Nothing was crawled to build this: no site was fetched by the builder, fixtures are hand-written synthetic HTML, no live network and no Chrome launch in any test.

## Changed paths

- Rust: `crates/core/src/catalog_bundle.rs` (new), `crates/core/examples/catalog_bundle_tool.rs` (new), `crates/core/tests/catalog_bundle.rs` (new), `crates/core/src/lib.rs`, `crates/core/examples/export_contracts.rs`, `crates/core/src/catalog_provenance.rs` (row ceiling made a parameter; the existing path keeps 100), `crates/wasm/src/lib.rs` (`reviewCatalogBundle`).
- Generated (by `npm run contracts:generate`, `scripts/contracts.mjs` roots list extended): `apps/web/src/contracts/generated/*`.
- Extension: `tools/catalog-extension/` (`manifest.json`, `background.js`, `popup.*`, `lib/{sites,dimensions,collector,blocked,extract,runner}.js`+`.d.ts`, `parsers/{ohou,cm29,ikea,index}.js`, `tests/`).
- Bot: `tools/catalog-crawler-bot/` (`cli, scheduler, state, channel, robots, config, paths, fsx, chrome, native-host, install-native-host, rust, bundle, publish-r2`, `tests/`).
- App: `apps/web/src/features/catalog/{bundle.ts,BundlePanel.tsx,ItemShapeView.tsx}`, `apps/web/src/worker/bundleWorker.ts`, `apps/web/src/app/{CatalogScreen,ProjectScreen}.tsx`, `apps/web/src/features/owned/{model,manager}.ts`, `apps/web/src/styles/project.css`.
- Tests/fixtures: `apps/web/tests/unit/catalogBundle.test.ts`, `apps/web/tests/unit/catalogCrawlerPlacement.test.ts`, `apps/web/tests/browser/catalog-crawler.spec.ts`, `tests/fixtures/catalog-collection/**`, `vitest.config.ts` (include adds `tools/**/tests/**`), `tsconfig.json` (include adds the bot).
- Docs: `docs/adr/SP-z-catalog-crawler.md`, `docs/CATALOG_COLLECTION.md`, `design/DECISIONS.md`, `design/SPATIAL_WORKSPACE.md`, `docs/PERFORMANCE_SECURITY_FAILURES.md` (scraper row revised), `docs/PRODUCT_SPEC.md`, `docs/TEST_STRATEGY.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

No new dependency (root and `apps/web` package.json unchanged; asserted by test). `Cargo.lock`, `fixtures/**`, protocol, `BUILD_ID` (`zari-domain-7`), capability lists, DB version unchanged (`git status` clean for `fixtures Cargo.lock`; 124 fixture cases still run).

## Design in one paragraph

Extension (MV3, plain JS, permissions exactly `scripting`, `nativeMessaging`, `activeTab` + four host patterns) executes only bot jobs (`robots`, `listing`, `product`) inside the allowlist and reports `blocked` on login/CAPTCHA/403/429/denied pages without extracting. The bot runs a persisted queue with per-host pacing/Crawl-delay, run and daily caps, robots.txt read by the extension (unreadable → host closed), block cooldown (≥6 h, doubling, disabled after 2 consecutive until `resume-host`), STOP file, lock, and talks to Chrome's native host over a 0600 Unix socket with a per-run token. Rust (`catalog_bundle.rs`) is the only validator: canonical JSON + SHA-256, image refusal for the whole bundle, unit conversion, confidence/value consistency, then the existing provenance review (each item its own product, so options are never merged; any quarantined row → no snapshot, `existingUntouched`). The app reads a bundle file (WASM in a dedicated worker), shows per-item diagnoses, saves only on user confirmation, and draws items from W/D/H + `categoryHint` as SVG plan/front/box shapes; unknown-size items say "치수 미확인". R2 publishing is env-gated PutObject-only SigV4.

## Acceptance → test mapping

| Spec item | Where |
|---|---|
| 1 no live network / Chrome in tests | static test (bot imports only `node:`; no http/tls/inspector; `fetch(` only in publish-r2); all site data is `tests/fixtures/catalog-collection`; Chrome launch guarded by `refuseInCi`, tests only check args |
| 2 manifest + source scan, scope refusal, `blocked` | `tools/catalog-extension/tests/extension-static.test.mjs`, `runner.test.mjs` (out-of-scope hosts/paths/kinds, redirect out of scope, captcha/429/403/401/login wall, normal page mentioning login is not a block) |
| 2a discovery, robots, fail-closed, pacing, caps, blocks, resume, STOP, lock, socket, CI | `scheduler.test.ts` (23), `robots.test.ts`, `channel.test.ts` (socket 0600/dir 0700/token/no TCP/second client/timeouts/frames/Chrome args/CI refusal/native host manifest), `bundle-flow.test.ts` (seed/stop/resume-host/run end-to-end over the real socket in attach mode) |
| 3 dimension rules | `dimensions.test.mjs`, `extract.test.mjs`, Rust `inner` handling in `catalog_bundle` tests and `catalogBundle.test.ts` (inner stays unknown) |
| 4 bundle contract | Rust unit (10) + `crates/core/tests/catalog_bundle.rs` (4, byte-for-byte golden) + `catalogBundle.test.ts` (image field/url, unknown field, checksum, version, bad host, non-JSON) |
| 5 quarantine / unconfirmed | `catalogBundle.test.ts` (stored catalogs identical after a bad bundle; conflict quarantine; no `confirmed`), browser spec test 4 |
| 6 file → cache → offline → pin → owned copy → placement; mock repository; no crawl code | browser spec tests 3, 5 and 6 (save, reload, offline reopen via service worker, project pin, measured variant → owned container registers through the real UI), `catalogCrawlerPlacement.test.ts` (all 9 golden variants register, real diagnostics surface, embed → plan conditional with every `ic` check unknown, re-serialization clean), `catalogBundle.test.ts` repository tests (GET, `credentials: 'omit'`, `redirect: 'error'`, https, userinfo/query refusal, size/timeout, pointer mismatch) and static scan of `apps/web/src` |
| 6 network assertions | browser spec test 3: 0 image/media requests, 0 third-party, 0 non-GET |
| 7 publisher | `publish.test.ts` (15): disabled cases, mock S3 verifies SigV4, PUT-only ordering with `latest.json` last, secret masking, no request without `--yes`/env; `bundle-flow.test.ts` auto-publish with R2 on and off |
| 8 no secrets / deps | `static.test.ts` (account host, AKIA, private key, assigned secret, bearer; dependency lists) |
| 7 (render) shapes from W/D/H only | browser spec 3 (plan rect ratio 80:30, shelf/cabinet hint lines, unmeasured items draw nothing), 7 (390px forced colors, no overflow, axe clean on the panel) |

## Commands (all with `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`)

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 (one `manual_clear` finding fixed) |
| `cargo test --workspace --locked` | exit 0, 260 passed, 0 failed, 1 ignored (pre-existing) |
| `fixture_runner -- fixtures/bootstrap` / `-- fixtures` | exit 0; 28 / 124 cases |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0 |
| `npm run wasm:build`, `npm run contracts:check` | ok; "Contracts match Rust source; 124 fixture structures valid." |
| `npm run typecheck`, `npm run lint` | exit 0, exit 0 |
| `npm test` | exit 0, 49 files, 407 tests (includes 132 under `tools/**`, 11 in `catalogBundle.test.ts`, 4 in `catalogCrawlerPlacement.test.ts`) |
| `npm run build`, `node scripts/check-release-manifest.mjs` | ok, `errors: []` |
| `node scripts/check-design-tokens.mjs --self-test` | 72 base tokens; 41/41 contrast cases (no new case needed) |
| `npm run test:browser -- --project=chromium` (full, final tree, re-run after fix round 1; last full run at `--workers=2`) | exit 0, 136 passed |
| `npm run test:parity` | exit 0, 124 shared fixtures match native vs browser Worker/WASM |
| `npx playwright test catalog-crawler.spec.ts --project=firefox` / `webkit` | not run: browsers not installed on this host (`Executable doesn't exist`). **UNVERIFIED** |

Flakiness, reported truthfully: an earlier full-suite run (taken while a first draft was still being verified) failed `product-completion.spec.ts` (`search-status` stuck on `interrupted`) and `edit.spec.ts`; a second run failed `print-share.spec.ts:334` and `product-completion.spec.ts`. Each of those specs passed when rerun alone, and the final full run on the unchanged tree passed 135/135; the post-fix-round full run on this tree passed 136/136. In the verification round after the WIP savepoint, a full-suite run at the default 4 workers on a loaded host timed out in six specs (`probe.spec.ts:82`, `project.spec.ts:126`, `purchase-handoff.spec.ts:38`, `quality.spec.ts:306`, `spatial3d.spec.ts:273`, `workspace.spec.ts:323` — all waits on search/worker progress, none touching the catalog screen); all six passed on a targeted re-run, and the final full run on the same tree at `--workers=2` passed 136/136. No timeout or retry setting was changed and no existing test edited. The cause (host load vs. my change) was not isolated; none of those specs touch the catalog screen.

Browser evidence: Chromium 1440×1000 and 390×844 forced-colors; routes `#/catalog`, `#/` → project; flows: collector on real DOM (fixture HTML via `setContent`, no request), import → review → keyboard save (Enter) → reload → offline reopen, tampered/image/non-JSON refusal, project pin, owned-copy variant pick → register → listed with its `variantRef` basis, narrow/forced-colors/axe. Console and page errors asserted empty. No screenshots kept; none is a baseline.

## Known limits / unverified

- **Real sites are unverified.** Parsers, URL patterns, and the assumption that pages expose JSON-LD / spec rows / body text were never checked against ohou.se, 29cm, or IKEA KR. Only the supervisor's three robots.txt observations are used.
- Real Chrome, `--load-extension` (Chrome ≥137 may ignore it for branded builds), native messaging end to end, the MV3 service worker, and real R2 were not exercised. The extension's Chrome glue (`background.js`, `popup.js`) is untested beyond static scans.
- **App URL reading is off in this build** (deviation, as the spec instructs): the z-privacy-offline guard forbids `fetch` outside the service worker. The read rules are implemented and tested as a transport-injected core; enabling needs an owner decision listed in the ADR. There is no "카탈로그 새로고침" button.
- Contained (support-bound) item assignments cannot resolve on a crawled container — it declares no inner support. `provisionalContainer` assignment is the honest "inside, pending measurement" path.
- The "3D box" is an SVG isometric box in the catalog panel, not the WebGL viewer; the placed-plan viewer is unchanged.
- Snapshots over 4 MiB are refused (`snapshot_too_large`), so a 5,000-item bundle may be rejected by size.
- Option labels are hashed into the id for non-ASCII labels; the bundle has no option-label field (name carries it).
- Phone hardware and GPU not exercised. Legal/ToS: owner-accepted risk, not legal advice.

## Incidental fix

`CatalogScreen` split the owned-copy variant pick at every `:`; variant ids containing `:` (`crawl:<site>:<id>`) were not found. It now splits at the first `:` (digests never contain one).

## Fix round 1 (review finding: copied variant could not be placed)

The owned-copy prefill carried each fact's catalog-scoped `evidenceIds` into a project-scoped input, so every measured imported variant was rejected `dangling_evidence_ref` and the UI showed only the generic message. `rawPhysicalFromVariant` now drops the ids on the by-value copy — origins stay as declared (never upgraded), `verification` stays `unverified`, and `variantRef` keeps the digest-pinned link to the snapshot that holds the evidence records. `OwnedManager.register` also filters diagnostics by both reported path shapes (`ownedContainers.<id>` and `input.ownedContainers.<index>`), and `CatalogScreen` maps the newly surfaced codes to text. Coverage: `catalogCrawlerPlacement.test.ts` (4 tests: all 9 golden variants register with no catalog evidence ids and `unverified` provenance; rejections return the real `dangling_evidence_ref`/`available_exceeds_owned` codes; a crawled container embeds and reaches a `validateCandidate` plan as `conditional` with every `chk:ic` check `unknown`; `ownedToRaw` re-serializes clean) and browser spec test 6 (the full copy flow through the real UI registers `own-samla`).

Also fixed in this round (review note N3): robots jobs pinned `url.hostname` to a single per-site `robotsHost`, so `store.ohou.se` — an allowlisted host the fixtures justify — always failed closed on `robots_unreadable` and could never be collected. robots.txt is per host (RFC 9309); a robots job is now accepted on any allowlisted host, the dead `robotsHost` field is gone, and `runner.test.mjs` gained a case reading `https://store.ohou.se/robots.txt`. Each host is still paced and blocked independently.

## Contract-change advisory

New generated roots `CatalogBundle`, `CatalogBundleReview`, `CatalogBundleBuild` (additive; existing definitions unchanged). No protocol, capability, `BUILD_ID`, schemaVersion, DB version or fixture-expectation change. A WASM free function `reviewCatalogBundle` was added beside `domainFixtureRequests`.

## Deviations

1. App URL repository reading not wired (spec's own conflict clause). 2. Extension tests are `.mjs`/bot tests `.ts` under `tools/**/tests`; vitest include extended, no gate weakened. 3. Item id for each option is its own Product in the snapshot (instead of one product with variants) so options are never merged.

## Out of scope / not done

Real R2 account/bucket/keys, Chrome Web Store, scheduler installation, images, login/anti-bot handling, any other node.
