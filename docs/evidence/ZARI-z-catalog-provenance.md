# ZARI-z-catalog-provenance evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was taken for this delivery. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #80, node z-catalog-provenance, “실상품 출처·옵션·치수 검증 작업대”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-catalog-provenance`.
- Observed base SHA: `8e065203a0c078451667d6f120b99ded4db61ea7` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css`; `design/DECISIONS.md`; previous node evidence and `docs/adr/SP-z-product-contract.md`, `docs/adr/SP-z-inventory-lifecycle.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-catalog-provenance and `docs/adr/SP-z-catalog-provenance.md`. This delivery is z-catalog-provenance only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, capture acceptance, or release.

## What changed

Catalog review is a Rust value beside `CatalogSnapshot`. `review_catalog_import` keeps brand, model, option, and seller sources on different evidence ids from outer, inner, protrusion, and load. Two option ids of one product stay two variants. The same option id with two sizes is quarantined on both rows and is not merged. A blank inner measurement stays `unknown` and is not copied from the outer. Any quarantined row or batch code omits `snapshot`, so ready rows in that batch are not published and an existing digest is not patched. `existingUntouched` is true. A `verified` verification scope is recorded and does not set `VerificationStatus::Confirmed`. Photo values that look like bytes (`data:`, `javascript:`, `file:`, `base64,`) are quarantined. A file-name locator can remain on the evidence note.

The command is `reviewCatalogImport`. The capability sits immediately after `applyInventoryLedger` and immediately before `disposeProject`. Generated DTO, schema, and validators were regenerated from Rust. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live in `crates/core/tests/catalog_provenance.rs`, which `fixture_runner` does not scan.

`CatalogSourceKind` stays `synthetic` or `imported`. Sample bundles `synthetic`, `verified`, and `unverified` are kinds on the review reply. The verified and unverified samples are stored as `imported`. The synthetic sample stays `sourceKind: synthetic` and has no seller URL. There is no new Dexie store and no dbVersion change. The page calls `putCatalog` only when Rust returns a snapshot. exportVersion 1 is unchanged.

`docs/product-expansion/contract.json` `baseCapabilities` includes the new name so the engine lock matches the running list. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, `contractChange` stays `NO`, and `catalogSourceKinds` stays `["synthetic","imported"]`. Those fields are the previous node's lock. Live `DB_VERSION` stays 3.

The catalog screen (`#/catalog`) shows one review panel on the library Worker already used by catalog import. Manual rows, CSV, and JSON are separate from the existing import form. Three sample buttons load the Rust bundles. A quarantine hides the save control.

## Changed paths

- Adoption: `docs/adr/SP-z-catalog-provenance.md`, `design/DECISIONS.md` (Dz-catalog-provenance), a short z-catalog-provenance note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/catalog_provenance.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`.
- Tests: `crates/core/tests/catalog_provenance.rs`, `crates/core/tests/protocol.rs`, `crates/core/tests/inventory_lifecycle.rs`, `crates/core/tests/product_completion_contract.rs`, `apps/web/tests/unit/catalogProvenance.test.ts`, `apps/web/tests/browser/catalog-provenance.spec.ts`.
- UI and worker: `apps/web/src/features/catalog/provenance.ts`, `apps/web/src/features/catalog/ProvenancePanel.tsx`, `apps/web/src/features/catalog/manager.ts`, `apps/web/src/app/CatalogScreen.tsx`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`baseCapabilities` only).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/DOMAIN_MODEL.md`, `docs/PERSISTENCE.md`, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Different size options of the same product are not merged | `different_size_options_of_one_product_stay_separate`. Unit CSV keeps `var-s` 200 and `var-m` 400. Browser: synthetic sample shows `syn:box-s` 200 mm and `syn:box-m` 400 mm |
| A product without an inner diameter is not filled from the outer | `a_missing_inner_is_not_filled_from_the_outer`. Unit: both synthetic inners are `unknown`; unverified inner is `unknown` while outer is `known`. Browser: `data-inner=unknown` and the text `내경 미확인` |
| An incomplete import does not partially overwrite a verified catalog | `an_incomplete_batch_does_not_publish_the_ready_rows`. Unit: quarantined review returns `snapshot: null`, `commitReviewed` is `blocked`, the earlier synthetic JSON is unchanged, and the verified row origin is `provenance-verified`. Browser: same option id with two sizes quarantines both rows, the commit control is absent, and the `sample-verified` list text is unchanged |
| Sources stay split and import does not confirm | `verified_scope_stays_unverified_and_sources_stay_split`. Unit JSON has no `"verification":"confirmed"` and keeps the photo file name and confirmation timestamp. Browser row text includes `사실 상태는 미확인`; the stored badge is `검증 범위 기록 · 사실은 미확인` |
| Photo bytes are not catalog facts | `photo_bytes_are_quarantined` |
| Manual, CSV, and JSON review, including a rejected whole file | Unit: a short CSV is `row_length_mismatch` and does not become a batch. Browser: a bad header shows `provenance-local-issue` and does not save |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. Browser commands used `--workers=1`. These commands were run on the final tree.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked -- --test-threads=8` | exit 0. 152 passed, 1 ignored. core lib 37, bootstrap 9, catalog provenance 7, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, inventory lifecycle 7, product completion contract 7, product expansion contract 4, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 22 files, 154 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `713eb834c1c369f9`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 88 passed (Playwright 12.3m). No `worker-state` flake. Timeouts were not raised. `spatial3d` reported `context-lost-console: none` |
| `npx playwright test apps/web/tests/browser/catalog-provenance.spec.ts --project=firefox --project=webkit --workers=1` | exit 0. Firefox 2 passed, WebKit 2 passed (11.7s). Used the test build from the Chromium suite's `vite build --mode test` |
| `npm run test:parity` | exit 0. 2 passed (26.1s). “124 shared fixtures.” |

## Browser

Route: `#/catalog`. Chromium, Firefox, and WebKit. Success viewport 1440×1000. The second test uses 390×844 and `forcedColors: active`. Enter activates the unverified sample, the CSV mode control, and the review submit button. Collected `pageerror` and console `error` lists were empty in both tests.

Success: synthetic sample shows two sizes with unknown inners and saves `sample-synthetic` while the bundled demo label remains; unverified sample shows outer 300 mm and unknown inner; verified sample shows inner 360 mm, outer 400 mm, the unverified-fact sentence, and the badge `검증 범위 기록 · 사실은 미확인`. Failure: the same option id with widths 200 and 400 quarantines both rows and does not show the save control; a bad CSV header shows the local issue and leaves the demo catalog. The mutation record for the main flow contains `pending`, `quarantine`, and `ready`.

Call count: `catalogProvenance.test.ts` records 4 `reviewCatalogImport` requests. `commitReviewed` does not send another command. The blocked commit does not change the stored synthetic JSON.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new review cases are outside that manifest. No existing fixture expected bytes changed.

## Contract advisory

`contract_change` for this node is a new stateless command and capability. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, `CatalogSourceKind`, persisted catalog schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live capability list gained `reviewCatalogImport`.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- A persisted `verified` source kind was not added. The product-contract lock keeps `catalogSourceKinds` at `synthetic` and `imported`, and the 124 fixture bytes stay. Verified and unverified are sample-bundle labels on the review reply. Stored facts stay `unverified`.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2. Live `DB_VERSION` stays 3. `implementsNow` stays false. `contractChange` stays `NO`.
- Protrusion millimetres are recorded on the protrusion evidence note. They are not turned into a three-axis handle envelope. Handles stay unknown.
- Photo bytes are refused. A file name or locator may remain. Photo consent, cloud storage, and purchase are not this node.
- The review reply is not in exportVersion 1. A portable bundle remains `z-portable-project`.

## Limits

- Later z-nodes, checkout, cloud, accounts, photo consent, capture acceptance, and release are not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.

## Out of scope

The next z-node was not started. Source prompts, `SOURCE_MANIFEST.json`, governance, runtime flags, CI workflows, and `.aiops/**` were not edited.
