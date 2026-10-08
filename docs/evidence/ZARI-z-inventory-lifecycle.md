# ZARI-z-inventory-lifecycle evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was taken for this delivery. Nothing here is an approved baseline, a physical measurement, or a release. Playwright failure attachments from the intermediate Chromium run are DRAFT tool output under `test-results/` and are not an approved baseline.

- Task: GitHub issue #77, node z-inventory-lifecycle, “보유 물건·용기·수량의 생활 이력”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-inventory-lifecycle`.
- Observed base SHA: `c4dce99c2d61d0b5d33ded4ca61c1120ea7a89a3` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md` token rules via `apps/web/src/styles/tokens.css` and `design/token-contrast-cases.json`; `design/DECISIONS.md`; previous node evidence and `docs/adr/SP-z-product-contract.md`. Candidate files under `docs/aiops/**` and the product-completion drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-inventory-lifecycle and `docs/adr/SP-z-inventory-lifecycle.md`. This delivery is z-inventory-lifecycle only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, capture acceptance, or release.

## What changed

The life ledger is a Rust value beside `ProjectInput` and `PlanSnapshot`. `apply_inventory` distinguishes an individual item from a bundle, an unknown quantity from known zero, and an empty container from an in-use container. Purchase, return, move, and quantity edit append events. `conserve` fails with `owned_double_consume` when one container's unit ordinal is claimed twice, including when availability is unknown, and with `empty_container_consumed` when an empty container is claimed. `openHistorical` takes a digest only, returns the same ledger, and sets `changed` false. The page stores the ledger only when `changed` is true.

The command is `applyInventoryLedger`. The capability sits immediately before `disposeProject`. Generated DTO, schema, and validators were regenerated from Rust. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files were not rewritten. New cases live under `crates/core/tests/fixtures/inventory/`, which `fixture_runner` does not scan.

Live Dexie `DB_VERSION` is 3. The `inventoryLedgers` store is keyed by project id. The v2→v3 upgrade writes `migration:2->3` and does not read or rewrite snapshots. Row `schemaVersion` stays 1. exportVersion 1 does not include the ledger. `docs/product-expansion/contract.json` `baseCapabilities` includes the new name so the engine lock matches the running list. That file's `versions.dbVersion` stays 2, `implementsNow` stays false, and `contractChange` stays `NO`. Those fields are the previous node's lock. The live database version is 3.

The project screen shows one ledger panel. Quantity is a text field. Phrases come from Rust label codes (`unknown`, `zero`, `count`). The panel uses the project Worker's system identity and does not start a second Worker.

## Changed paths

- Adoption: `docs/adr/SP-z-inventory-lifecycle.md`, `design/DECISIONS.md` (Dz-inventory-lifecycle), a short z-inventory-lifecycle note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/inventory.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`, `crates/core/src/validator.rs`, `crates/core/src/check_drive.rs`.
- Tests: `crates/core/tests/inventory_lifecycle.rs`, `crates/core/tests/fixtures/inventory/`, `crates/core/tests/protocol.rs`, `crates/core/tests/product_completion_contract.rs`, `apps/web/tests/unit/inventory.test.ts`, `apps/web/tests/unit/repository.test.ts`, `apps/web/tests/unit/transfer.test.ts`, `apps/web/tests/browser/inventory.spec.ts`.
- Persistence and UI: `apps/web/src/persistence/db.ts`, `apps/web/src/persistence/repository.ts`, `apps/web/src/features/inventory/`, `apps/web/src/app/ProjectScreen.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`.
- Contract lock: `docs/product-expansion/contract.json` (`baseCapabilities` only), `scripts/check-product-contract.mjs` (live `DB_VERSION` string is 3).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/DOMAIN_MODEL.md`, `docs/PERSISTENCE.md`, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Several placements do not consume one owned container twice | `duplicate_placements_do_not_consume_one_owned_unit`; `owned_use` also used by `qc:owned`. Browser: two ordinal-0 claims on `bin-a` show `owned_double_consume` and the stored count stays `2개`. Empty container claim shows `empty_container_consumed` and does not save |
| Unknown quantity and 0 are stored and shown differently | `unknown_quantity_and_zero_are_different_facts`. Unknown JSON has no `value`. Known 0 has `value: 0`. `quantityPhrase('unknown', 0)` is `수량 미상`. Browser: `data-quantity-code` `unknown` then `zero`, reload still `0개` |
| Opening a past plan does not change current inventory | `opening_a_historical_plan_does_not_change_the_ledger`. Controller test: 3 worker calls, 1 save; historical and conserve do not save. Browser: digest open sets `data-changed=false`, hash route to the plan and back, reload still `0개` |
| Purchase, return, move, and quantity edit stay in the log | `purchase_return_move_and_quantity_edit_remain_distinct_events` |
| A v2 database upgrades without rewriting snapshot bytes | `opens a v2 database, journals 2 to 3, and leaves snapshot bytes`. v1 upgrade still writes `migration:1->2` and then `migration:2->3` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1. Browser commands used `--workers=1`. These commands were run on the final tree, except the intermediate Chromium suite named below.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked -- --test-threads=8` | exit 0. 145 passed, 1 ignored. core lib 37, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, inventory lifecycle 7, product completion contract 7, product expansion contract 4, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files were produced by `npm run contracts:generate`, not edited by hand |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 21 files, 151 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `f4b5a1930de4372d`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0 on the final tree. 86 passed (12.0m). No `worker-state` flake. Timeouts were not raised. `spatial3d` reported `context-lost-console: none` |
| `npx playwright test apps/web/tests/browser/inventory.spec.ts --project=firefox --project=webkit --workers=1` | exit 0. Firefox 2 passed, WebKit 2 passed (12.5s) |
| `npm run test:parity` | exit 0. 2 passed (25.7s). “124 shared fixtures.” |

## Browser

Route: project editor `#/project/<id>`, then a hash change to `#/project/<id>/plan` and back. Chromium default viewport 1440×1000. The inventory spec also uses 390×844 and 1280×800, `forcedColors: active`, Enter to submit the record form, and an empty collected `pageerror` / console `error` list. Success: unknown purchase, quantity edit to 0, reload, historical digest, plan route. Failure: empty-container claim, duplicate ordinal, invalid id `bad id` (not stored). Call count: the unit test records 3 `systemRequest` calls and 1 save.

The first full Chromium command, before the panel used the project Worker, was 83 passed and 3 failed (`project.spec.ts` worker crash, `quality.spec.ts` plan-page crash, `next-facts.spec.ts` recovery). Those tests dispatch an error on the last constructed Worker. A second Worker made that the library worker, so the project session never failed. The panel now uses the project Worker's system identity. Those three specs and the inventory spec were re-run (20 passed), then the full Chromium suite was re-run (86 passed). The failed run was not left as the result and timeouts were not raised.

Firefox and WebKit ran the new inventory spec only, on the test build from `vite build --mode test`. Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. The new ledger fixtures are outside that manifest. No existing fixture expected bytes changed.

## Contract advisory

`contract_change` for this node is a new stateless command and capability, plus Dexie dbVersion 3. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted row `schemaVersion` 1, exportVersion 1, and the 124 fixture expected bytes stay. The previous product-contract document still says `contractChange=NO`, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The live capability list and live `DB_VERSION` moved.

## Deviations

- The version table says a command and capability change is when `BUILD_ID` changes. This node does not bump `BUILD_ID`, so the 124 `engineContext.buildId` lines stay. The page and Worker still fail closed on capability order and length.
- `docs/product-expansion/contract.json` `versions.dbVersion` stays 2 while `apps/web/src/persistence/db.ts` is 3. The checker now requires the live constant `DB_VERSION = 3`.
- `capabilities[owned].implementsNow` stays false. That flag is the previous node's lock. This node is the implementation of the ledger.
- The ledger is not in exportVersion 1. A portable bundle remains `z-portable-project`.

## Limits

- Later z-nodes, checkout, cloud, accounts, photo consent, capture acceptance, and release are not implemented.
- No approved visual baseline. No phone. No discrete GPU.
- A stored ledger row is checked for the three arrays. The next Rust apply rejects a malformed fact. The upgrade does not rewrite old rows into a valid ledger.
- `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.
