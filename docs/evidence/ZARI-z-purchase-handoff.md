# ZARI-z-purchase-handoff evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #98, node z-purchase-handoff, “구매 링크·대체품 검토·구매 이후 연결”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-purchase-handoff`.
- Observed base SHA: `8857c4f4a2f0d70f15b8edafc73c324c243b80bf` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`; `docs/MASTER_PROMPT_KO.md`; `docs/RUST_ADDENDUM_KO.md`; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Previous node evidence and ADRs were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-purchase-handoff and `docs/adr/SP-z-purchase-handoff.md`. This delivery is z-purchase-handoff only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, payment, cloud, photo consent, or release.

## What changed

Purchase preparation is a stateless Rust command `preparePurchaseHandoff` beside the immutable plan. The reply is never hashed into the PlanSnapshot and does not publish or rewrite one. The host stores a per-project ledger only when a person records an event.

- Seller links are `http`/`https` anchors with no click-recording handler. Any other address becomes `rejected` and renders no `href`. There is no payment event and no link-clicked event kind. `paid` and `recordsPayment` are always `false` in every reply.
- The observation time is supplied by the caller; Rust reads no clock. An observation at or under seven days old is `current`, older is `stale`, and missing or unparseable is `unconfirmed`. The UI writes `지난 확인` and `확인 시각 없음` and never writes `최신`. Unknown pack price, shipping, stock, or subtotal is listed under unconfirmed codes; no amount is rendered as ₩0. Tax is always unconfirmed because offers carry no tax field.
- A substitute is never assumed identical to the planned variant. Rust clones the placements, swaps the variant and offer at one placement, runs `validate_layout` and `validate_candidate` against a review catalog, and returns suitability without adopting the snapshot. An unknown outer or inner axis keeps the result at `unknown` instead of `pass`. Affiliate ids are validated for length but never enter the check; `affiliateChangesSuitability` is always `false`.
- Confirmed purchase, receipt, measurement, and return are four separate ledger events. A return does not erase a purchase confirmation. A measurement sets an `impact` (`measurementUnknown`, `dimensionsDiffer`, `remeasured`) but `historicalPassReused` and `measurementPromotesPass` stay `false`.
- The plan detail shows a seller-grouped preparation list with freshness, prices, suitability, the four event flags, the impact line, and the link. Event recording, freshness classification, and the substitute recheck are forms submitted with Enter. `pending`, `ready`, `empty`, and `error` states are exposed on `data-state`.
- Live IndexedDB `DB_VERSION` is 4 with a new `purchaseHandoffs` store keyed by project id. The v3→v4 upgrade writes a `migration:3->4` journal and does not read or rewrite snapshot, input, owned-container, or life-ledger bytes. `deleteProject` removes the row in the project transaction. Export and import do not carry it. Opening a plan writes nothing until the person records an event. Saves use the same revision compare-and-swap as the life ledger; a conflict surfaces as `revision_conflict`.

`BUILD_ID` stays `zari-domain-7`. `protocolVersion`, persisted `schemaVersion`, `ruleVersion`, canonical version, and exportVersion 1 stay. No new color token and no new contrast case; the panel reuses the `offer-quote` surface, text, border, control, and touch tokens.

## Changed paths

- Adoption: `docs/adr/SP-z-purchase-handoff.md`, `design/DECISIONS.md` (Dz-purchase-handoff), a z-purchase-handoff-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/purchase_handoff.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`, `crates/core/tests/purchase_handoff.rs`, and capability-position assertions in `protocol.rs`, `product_completion_contract.rs`, `catalog_provenance.rs`, `inventory_lifecycle.rs`, `offer_bundles.rs`, `portable_bundle.rs`.
- Host: `apps/web/src/features/purchase/PurchaseHandoffPanel.tsx`, `controller.ts`, `phrases.ts`, `apps/web/src/app/PlanScreen.tsx`, `apps/web/src/persistence/db.ts`, `apps/web/src/persistence/repository.ts`, `apps/web/src/worker/client.ts`, `apps/web/src/styles/project.css`.
- Generated, by `npm run contracts:generate` / `contracts:check`, not by hand: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract list only: `docs/product-expansion/contract.json` `baseCapabilities` gained `preparePurchaseHandoff` before `disposeProject`.
- Living docs: `docs/PERSISTENCE.md` §18, `docs/WASM_PROTOCOL.md` §2 and §15, `docs/IMPLEMENTATION_STATUS.md`, this file.
- Checks: `scripts/check-product-contract.mjs` live DB version guard 3→4.
- Tests: `apps/web/tests/unit/purchaseHandoff.test.ts`, `apps/web/tests/browser/purchase-handoff.spec.ts`, `repository.test.ts` (v3→v4 journal plus purchase CAS/delete test), `transfer.test.ts` (v3→v4 journal and verno 4).

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten (the two PNGs touched by a capture run were restored with `git checkout`). No new dependency.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| A link click never records external payment | `PurchaseEventKind` has only `confirmedPurchase`, `received`, `measured`, `returned` — the schema enum is asserted in `purchaseHandoff.test.ts`; a `paid` or `linkClicked` kind fails `validateProtocolRequest` before any Worker message. The anchor has no click handler; the browser spec clicks it and the `preparePurchaseHandoff` call count does not move and `data-paid` stays `false`. Rust `stale_stock_is_not_current_and_a_link_is_not_payment` asserts `paid`/`recordsPayment` false |
| Stale stock never looks current | Rust `observation_age_is_not_current_when_stale_or_missing` and `missing_observation_and_rejected_url_stay_unconfirmed` cover the 7-day window, missing, unparseable, and future times. Phrases emit `지난 확인`/`확인 시각 없음` and the unit test asserts no `최신`. The browser spec asserts `data-freshness` `unconfirmed`/`stale`/`current` and `not.toContainText('최신')` |
| Affiliate marks never change suitability | `affiliate_offer_ids` are length-checked but not passed to `validate_layout`/`validate_candidate`; Rust `affiliate_mark_does_not_change_suitability` asserts identical results and `affiliateChangesSuitability: false`. The browser spec toggles the mark, `data-suitability` is unchanged, and no Worker call is sent |
| Seller-grouped preparation list | `prepare_list` groups BOM lines by seller; the panel renders `purchase-seller-*` sections. Browser spec reads the seller list and per-line freshness, price, suitability, unconfirmed codes |
| Separate purchase/receipt/measurement/return events with impact | Rust `purchase_receipt_measure_and_return_stay_separate_events` keeps all four flags independently. The browser spec records each kind with Enter/click and asserts each flag flips alone; a measured width of 9000 mm yields `data-impact="dimensionsDiffer"` with `historicalPassReused`/`measurementPromotesPass` `false` |
| Substitute recheck without identity assumption or pass reuse | Rust `substitute_recheck_does_not_assume_identity_or_reuse_pass` and `a_different_width_is_not_the_same_pass`. Browser spec: an unknown-width substitute yields `data-suitability="unknown"`, `identityAssumed`/`reusedPass`/`adopted` all `false`; a 9000 mm substitute is not `pass` |
| Empty purchase list is not a zero | Rust `an_empty_purchase_list_is_not_a_zero_total`. The `구매 없음` plan card renders `data-state="empty"` with `주문할 판매처가 없습니다.` and no `₩0` |
| Tampered snapshot is refused | `a_tampered_snapshot_is_not_prepared_as_a_pass` returns `digest_mismatch` |
| Bare payload / unknown kind stay honest | `handoff_command_rejects_a_bare_payload_and_a_payment_kind`: `invalid_input`, and an unknown event kind is `operation_not_supported` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node` v24.19.0, `npm` 11.x, `rustc` 1.98.1 via `rust-toolchain.toml`, wasm-bindgen 0.2.128. Playwright timeouts were not raised.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 201 passed, 0 failed, 1 ignored (the pre-existing completion-query ignore). New `purchase_handoff.rs`: 10 tests |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git status fixtures/` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. No new dependency; `unicode-normalization` was already in the tree |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were not hand-edited |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 29 files, 189 tests. First run failed `transfer.test.ts` (expected verno 3 before the 3→4 assertion was added) and a `session.test.ts` search-timing flake that passed standalone (15.6 s) and on the rerun |
| `npm run build` | exit 0. The pre-existing chunk-size warning is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `3de50ed3830f86c4`, 11 assets. The web bundle hash changed; engine `BUILD_ID` stays `zari-domain-7` |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. 16 ids unchanged, chain one snapshot, 124 fixtures unchanged |
| `npm run test:browser -- --project=chromium` | Four full-suite runs on the final tree. Run A: 100 passed, 1 failed — `edit.spec.ts` timed out while the real WASM search was still running (30 s test limit under machine load); passed standalone (2 tests, 22.0 s/14.8 s). Run B: 98 passed, 3 failed — `quality.spec.ts`, `responsive.spec.ts`, `spatial3d.spec.ts` search timeouts; all 20 tests passed standalone (1.5 m). Run C: 98 passed, 3 failed — `plan.spec.ts`, `product-completion.spec.ts`, `progress.spec.ts` search timeouts; all 8 tests passed standalone (1.6 m). Run D (re-verification pass, 2026-10-13): 101 passed, 0 failed (4.2 m) — fully green. The earlier failures were different search-duration timeouts while other jobs shared this 16 GB machine; none reproduced outside the contended runs |
| `npx playwright test apps/web/tests/browser/purchase-handoff.spec.ts --project=chromium` | exit 0. 1 passed (16.5 s); re-verification pass 16.2 s. Also green inside the run-D full suite |
| `npx playwright test apps/web/tests/browser/purchase-handoff.spec.ts --project=firefox` | exit 0. 1 passed (19.7 s); re-verification pass 18.5 s |
| `npx playwright test apps/web/tests/browser/purchase-handoff.spec.ts --project=webkit` | First pass 15.4 s. Re-verification run 1 timed out at 30 s on the record round-trip while the machine was loaded (panel stayed `ready`, locator resolved, flag update never arrived — a stall, not a validation failure); rerun exit 0, 1 passed (18.1 s) |
| `npm run test:parity` | exit 0. 2 passed (27.1 s; re-verification 33.5 s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Route: project screen → sample input → compute plan → plan detail (구매 포함 card), plus the 구매 없음 card for the empty state. Chromium full suite plus the new spec on all three engines. Viewport starts at 1440×1000, then 390×844 asserts no horizontal overflow, then `forcedColors: active`. A `MutationObserver` on `data-state` saw `pending` before `ready`.

Success: seller-grouped lines show `확인 시각 없음` for missing observation times, `purchase-unconfirmed` lists `세금 포함 여부 미확인`, and the seller link is an `http(s)` anchor. Clicking the link and toggling the affiliate checkbox each add zero `preparePurchaseHandoff` Worker calls. Recording confirmedPurchase/received/measured/returned by Enter and click flips each flag alone and adds four calls; the measured line reports `dimensionsDiffer` and `기존 통과를 재사용하지 않음`. Freshness classify returns `stale` for a 2020 observation and `current` inside the window, never `최신`. The substitute recheck reports `unknown`/`not pass` with all honesty flags `false`.

Failure: an event id of `!!` fails generated request validation before the Worker (call count unchanged) and shows `role="alert"`; the error text contains neither `결제 완료` nor `₩0`. Empty state shows `주문할 판매처가 없습니다.` Collected `pageerror` and console `error` lists were empty. `spatial3d` in the same suite reported `context-lost-console: none`.

Keyboard: the note field submits the record form with Enter; the freshness `asOf` field submits with Enter. All three engine runs are desktop emulation; phone and discrete GPU were not available and are UNVERIFIED.

## Contract-change advisory

`contract_change` for this node is one new stateless command and capability, `preparePurchaseHandoff`, placed after `inspectPortableBundle` and before `disposeProject`. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted `schemaVersion`, exportVersion 1, and the 124 fixture expected bytes stay. The product-contract document still says `contractChange` NO, document `dbVersion` 2, `implementsNow: false`; those locks were kept and only the live `baseCapabilities` list gained the command. Live `DB_VERSION` moved 3→4 for the `purchaseHandoffs` store; the checker's pinned guard was updated 3→4 and a `migration:3->4` journal is asserted. This node does not set `implementsNow` true.

## Known limits

- The 7-day freshness window is fixed in Rust (`FRESHNESS_WINDOW_SECONDS`); there is no seller API. Prices, stock, and observation times are whatever the offer snapshot recorded; `unconfirmed` is never upgraded.
- Seller links are display-only anchors. Nothing about a real checkout, account, or delivery was integrated; the person still buys on the seller site.
- The substitute recheck validates geometry and structure at one placement. It does not adopt the substitute into the plan — adoption remains an explicit edit.
- Three earlier full-suite Chromium runs each had different load-induced search timeouts that passed standalone; the 2026-10-13 re-verification run of the full suite was fully green (101 passed). One WebKit run of the new spec stalled at the record round-trip under load and passed on rerun. Reported truthfully, no timeouts raised.
- WebKit ran here (unlike the previous node's environment). Phone and a discrete GPU were still UNVERIFIED.

## Out of scope

The next z-node, external payment, affiliate revenue, live stock APIs, cloud, photo consent, deleting local originals, `BUILD_ID` bump, and rewriting exportVersion 1.
