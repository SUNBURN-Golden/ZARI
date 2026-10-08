# ZARI-z-offer-bundles evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Screenshots taken while a browser assertion was still failing were local Playwright attachments and were not kept as a baseline. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #84, node z-offer-bundles, “판매 묶음·필수 부품·배송비의 정직한 BOM”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-offer-bundles`.
- Observed base SHA: `53816da2a4aa3028a6c6c48131966d32ee018e2f` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css`; `design/DECISIONS.md`; `design/SCREENS.md`; previous node evidence and `docs/adr/SP-z-catalog-provenance.md`, `docs/adr/SP-z-inventory-lifecycle.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-offer-bundles and `docs/adr/SP-z-offer-bundles.md`. This delivery is z-offer-bundles only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, capture acceptance, or release.

## What changed

Pack counts and confirmed money are a Rust value beside `PlanSnapshot`. `quote_offer_bundle` distinguishes physical need from packs to order. Need 3 with a pack of 2 orders 2 packs, supplies 4, and leaves 1. A blank count stays unknown and is not stored as 0. A pack quantity of 0 is rejected. Included required parts are listed and are not added to the product subtotal again. Owned reuse has no purchase. A purchase minimum raises the order when it is above the ceil of the new units.

Seller shipping is charged once per seller. Confirmed free shipping is a known zero with status `free`. Unknown, complex, and conflicting shipping stay out of the total. Tax inclusion is a note on the quote request because `Offer` has no tax field. A missing note keeps the grand total unknown. Excluded tax with no amount is `tax_unpriced`, not a zero tax line.

A preview has `boundRevision: null` and publishes nothing. A snapshot quote returns that snapshot id and does not rewrite the snapshot. Sold-out alternates are bound to that id. Applying one is the existing `LayoutEditCommand::SelectOffer`. The drawing stamp, BOM, and guide then share the new snapshot. The quote of the previous snapshot stays on the previous id.

The command is `quoteOfferBundle`. The capability sits immediately after `reviewCatalogImport` and immediately before `disposeProject`. Generated DTO, schema, and validators were regenerated from Rust. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live in `crates/core/tests/offer_bundles.rs`, which `fixture_runner` does not scan.

There is no new Dexie store and no dbVersion change. The reply is not a row and not part of exportVersion 1. The page uses the existing project Worker. One snapshot id is quoted once. A failed quote is not sent again until the person asks.

`docs/product-expansion/contract.json` `baseCapabilities` includes the new name so the engine lock matches the running list. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, and `contractChange` stays `NO`. Those fields are the previous node's lock. Live `DB_VERSION` stays 3.

The plan screen shows the seller comparison on the existing plan route. Unknown money is the word 미확인. Confirmed free shipping is 무료. The preview form does not change the plan id.

## Changed paths

- Adoption: `docs/adr/SP-z-offer-bundles.md`, `design/DECISIONS.md` (Dz-offer-bundles), a short z-offer-bundles note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/offer_bundles.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`.
- Tests: `crates/core/tests/offer_bundles.rs`, `crates/core/tests/protocol.rs`, `crates/core/tests/inventory_lifecycle.rs`, `crates/core/tests/catalog_provenance.rs`, `crates/core/tests/product_completion_contract.rs`, `apps/web/tests/unit/offerBundles.test.ts`, `apps/web/tests/browser/offer-bundles.spec.ts`.
- UI and worker: `apps/web/src/features/offer/controller.ts`, `phrases.ts`, `OfferQuotePanel.tsx`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/features/workspace/Workspace.tsx`, `apps/web/src/features/workspace/StepFocus.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`baseCapabilities` only).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/DOMAIN_MODEL.md`, `docs/PERSISTENCE.md`, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`, `docs/ARCHITECTURE.md`, `design/SCREENS.md`, `README.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. No new design token or contrast case.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Need 3 / pack of 2 orders 2 packs and leaves 1 | `three_needed_with_a_pack_of_two_orders_two_and_leaves_one`. Unit preview: packs 2, supplied 4, surplus 1, one `quoteOfferBundle` call. Browser: Enter on the preview shows `주문 묶음 2` and `남는 개수 1`, and the plan snapshot id text is unchanged |
| Unknown shipping is not summed as free | `unknown_shipping_is_not_added_as_free` and `unknown_shipping_on_a_published_plan_is_not_a_free_total`. Unit: `knownShipping` is `{state:"unknown"}` with no amount. Browser: the preview shipping text is `배송 미확인` and does not contain `무료` or `₩`. A published plan whose offer shipping is unknown has no shipping value on the snapshot cost summary |
| After option replacement, drawing, BOM, and guide use the same new revision | `sold_out_replacement_publishes_one_revision_for_drawing_bom_and_guide`: `selectOffer` publishes one new id; the BOM contains the new offer; the plan spatial stamp equals that id; the guide actions are on that snapshot; the new quote binds the new id and the old quote stays on the old id. Browser: after a verified move, the edit section's drawings, BOM, guide, and quote share one new `data-revision`, and the selected plan keeps the previous id |
| Seller fee once, included parts not charged twice, purchase minimum, owned reuse | `one_fixed_fee_per_seller_and_included_parts_are_not_charged_twice`, `owned_reuse_and_purchase_minimum_stay_exact` |
| A zero pack is rejected and a blank need stays unknown | `blank_needed_stays_unknown_and_a_zero_pack_is_rejected`. Browser: pack `0` shows `pack_quantity_zero` and removes the previous preview total |
| One call per snapshot id, no automatic retry | Unit `quoteSnapshotOnce` sends one command until `forgetSnapshotQuote`. Browser: the plan quote count before the previews is 1 or 2, and the two previews add exactly two calls. The status observer records `pending` then `ready` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. These commands were run on the final tree. The Chromium suite used Playwright's default 4 workers. Timeouts were not raised.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 160 passed, 1 ignored. core lib 37, bootstrap 9, catalog provenance 7, completion query 12 passed and 1 ignored, domain 11, edit 6, guide oracle 7, inventory lifecycle 7, offer bundles 8, product completion contract 7, product expansion contract 4, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 23 files, 164 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `c860105624f2120f`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium` | exit 0. 91 passed, 4 workers (Playwright 4.2m). No `worker-state` flake. `spatial3d` reported `context-lost-console: none` |
| `npx vite build --mode test` then `npx playwright test apps/web/tests/browser/offer-bundles.spec.ts --project=firefox` and `--project=webkit` | exit 0. Firefox 1 passed (23.8s), WebKit 1 passed (19.5s) |
| `npm run test:parity` | exit 0. 2 passed (31.4s). “124 shared fixtures.” |

## Browser

Route: the existing plan screen after a real sample project and a real search. Chromium, Firefox, and WebKit. Success viewport 1440×1000, then 390×844, then `forcedColors: active`. Enter on the pack field submits the 3/2 preview. Collected `pageerror` and console `error` lists were empty.

Success: the purchase plan's quote, drawings, BOM, and guide share one `data-revision`. The grand total says 미확인 because tax inclusion was not confirmed, and the unconfirmed list says 세금 포함 여부 미확인. The 3/2 preview shows 2 packs, surplus 1, confirmed free shipping as 무료, and grand `₩2,000`, without changing the plan id. After a verified placement move, the edit section's four surfaces share a different revision. A no-purchase plan's quote grand total does not say ₩0 or 무료.

Failure: unknown preview shipping is `배송 미확인` and does not contain 무료 or ₩. Pack 0 shows `pack_quantity_zero` and does not keep the previous total. The status observer recorded `pending` before `ready`.

Call count: the unit test records one `quoteOfferBundle` for the 3/2 preview and one for unknown shipping. `quoteSnapshotOnce` sends one command for a snapshot id until that id is forgotten. The browser spec allows one or two snapshot quotes before the previews (the selected plan, and a second id only if the purchase card was not already selected) and then exactly two preview commands.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new quote cases are outside that manifest. No existing fixture expected bytes changed.

## Contract advisory

`contract_change` for this node is a new stateless command and capability. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live capability list gained `quoteOfferBundle`.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- Published `CostSummary` still adds a fixed per-seller fee on every variant line. The new quote adds that fee once per seller. Those two totals can differ when two purchased lines share a seller. The snapshot table was not rewritten.
- `Offer` has no tax field. Tax confirmation is a quote-only seller note. An empty note blocks the quote grand total even when the snapshot cost summary already has a number. The snapshot table still shows that cost summary.
- The bundled synthetic catalog still has one offer per variant, so the browser does not click a sold-out replacement. The replacement revision is the Rust `selectOffer` test. The browser shares a revision after a verified move, which is the same publication path.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2. Live `DB_VERSION` stays 3. `implementsNow` stays false. `contractChange` stays `NO`.
- The quote reply is not in exportVersion 1. A portable bundle remains `z-portable-project`.

## Limits

- Later z-nodes, checkout, live seller stock, cloud, accounts, photo consent, capture acceptance, and release are not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.

## Out of scope

Payment, cart, remote inventory, a second Worker, fixture expected bytes, `BUILD_ID`, and the next z-node.
