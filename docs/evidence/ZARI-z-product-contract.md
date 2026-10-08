# ZARI-z-product-contract evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was taken. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #75, node z-product-contract, “정리→구매→실행→재정리의 확장 계약”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-product-contract`.
- Observed base SHA: `1bd3fde5bd9a625d02735d4de8609e97736db49d` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs read at this HEAD: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`; `docs/DOMAIN_MODEL.md`; `docs/SOLVER.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/ARCHITECTURE.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md` and `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` as candidate references; previous SP-012–016 ADRs and `docs/evidence/ZARI-SPATIAL-*.md`. `.aiops/**` and `docs/aiops/**` were not edited. NON_EXECUTABLE drafts were not used as extra scope.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-product-contract and `docs/adr/SP-z-product-contract.md`. This delivery is z-product-contract only. Fable ARCHITECTURE and the non-author A3 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, capture acceptance, or release.

## What changed

This node freezes the expansion contract after the 16 spatial stages. It does not relabel those ids or their evidence files. It does not change Rust producers, `BUILD_ID` (`zari-domain-7`), capabilities, generated contracts, persisted `schemaVersion` 1, dbVersion 2, exportVersion 1, or the 124 executable fixtures.

Owned stock stays `OwnedContainer`. Real products stay `CatalogSnapshot` with `synthetic` and `imported`. Strategy comparison stays the five `Strategy` values plus ranked `PlanSnapshot` alternatives. Export stays exportVersion 1 JSON. Reorganization stays a new snapshot from `evaluate_candidate`. Event history, a verified source kind, a Pareto read model, a zip bundle, and pinned incremental replan stay with the later z-nodes named in the contract. `implementsNow` is false for all five gaps.

User decisions stay open: account, checkout, cloud, photo consent, capture acceptance, release, live stock, safety certification, phone, and discrete GPU. Adopted internal choices are the canonical reuse, the version freeze, and the gap owners. The two id sets do not overlap.

`fixtures/domain/search-scope-complete.json` is the live chain: three alternatives, each `planSnapshotId` equal to `snapshot_digest` of content that holds the input digest, BOM, and actions, with `project_spatial_view` stamping that same id. Unknown facts in that JSON carry no value. `project-unknown-quantity-pass` stays `unknown` / `notMeasured`. `unknown-pack` pack counts stay null. `spatial-yaw-offset` keeps the historical transfer edge. The product-completion oracle index stays at `currentBuildId` `zari-domain-6`.

## Changed paths

- Adoption: `docs/adr/SP-z-product-contract.md`, `design/DECISIONS.md` (Dz-product-contract), a short z-product-contract note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Ledger: `docs/product-expansion/contract.json`, `scripts/check-product-contract.mjs`.
- Contract deltas: `docs/DOMAIN_MODEL.md` §12, `docs/SOLVER.md` §8, `docs/WASM_PROTOCOL.md` (no new command), `docs/PERSISTENCE.md` §11, `docs/FRONTEND.md` §13, `docs/TEST_STRATEGY.md` §14, `docs/ARCHITECTURE.md` (one chain paragraph).
- Tests: `crates/core/tests/product_expansion_contract.rs`, `apps/web/tests/unit/productExpansionContract.test.ts`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

`crates/core/src`, `crates/solver/src`, `apps/web/src`, `fixtures/`, generated contracts, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, and `docs/qualification/denominator.json` are unchanged. No new dependency. No screenshot. `docs/evidence/ZARI-SPATIAL-001-*.png` was not rewritten.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Existing 16 ids and evidence are not relabeled | `contract.json` stages equal `denominator.json` id, title, group, and evidence path. Evidence headings stay `# ZARI-SPATIAL-NNN evidence`. Rust `ledger_matches_the_running_engine_and_does_not_relabel`. `scripts/check-product-contract.mjs` |
| Input → Rust → snapshot → BOM → guide is one chain | `search_scope_complete_publishes_one_snapshot_chain` runs the existing search fixture. Digest, BOM, actions, and the drawing stamp share one `PlanSnapshot`. `plan.spec.ts` in the Chromium suite still renders one snapshot as SVG, checks, BOM, and guide |
| New user decisions stay distinct from adopted internal choices | `userDecisions` status `open` and owner `user`. `internalChoices` status `adopted` and owner is not `user`. Id sets are disjoint. Vitest refuses a review-pass claim |
| Unknown is not pass or zero | Unknown quantity fixture, unknown-pack nulls, and unknown JSON objects without a value |
| Fixture impact list does not rewrite expectations | 11 case kinds sum to 124. Every row has `bytesChangedByThisNode: false`. Fixture runner 124. `git diff -- fixtures` empty |
| Versions stay | Engine constants match the contract. Ready capabilities match the recorded base list. No future `BUILD_ID` |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. Rust is the toolchain in `rust-toolchain.toml` (1.98.1). Browser commands used `--workers=1`. These commands were run on the final tree.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked -- --test-threads=8` | exit 0. 138 passed, 1 ignored. core lib 37, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, product completion contract 7, product expansion contract 4, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generate step. No contract diff |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 20 files, 147 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `4f78ff9f83b36d6b`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-qualification.mjs` | exit 0. denominator 16=7+4+5; merged 15; in-progress 1; runtime hits 0 |
| `node scripts/check-product-contract.mjs` | exit 0. 16 ids unchanged; chain one snapshot; user decisions open; internal choices adopted; fixture impact 124 unchanged; runtime hits 0 |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 84 passed (11.4m). No `worker-state` flake. Timeouts were not raised. `spatial3d` reported `context-lost-console: none` |
| `npm run test:parity` | exit 0. 2 passed (23.8s). “124 shared fixtures.” |

## Browser

No new route or screen. The Chromium suite is the regression of the existing app: create, edit, save failure, catalog, detail facts, drag, plan guide, progress, portable import, probe, spatial 2D/3D, workspace, keyboard, 320–1440, 200% zoom, reduced motion, and forced colors. The plan spec still shows one snapshot as SVG, checks, BOM, and guide. The suite's own console assertions passed.

Firefox and WebKit were not run. There is no new or changed browser spec to target. Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native and Chromium Worker/WASM agreed on 124 shared fixtures. This node did not change fixture bytes, so the comparison is the existing protocol. No new parity case was added.

## Limits

- Later z-nodes are not implemented. Their gaps are named and owned, not coded.
- No schema migration, no new command, no new DTO, no screen, no color token.
- Account, checkout, cloud, photo consent, capture acceptance, release, live stock, and safety certification stay open user decisions.
- Phone and discrete GPU are UNVERIFIED. A 390 CSS viewport is emulation.
- The author does not record an independent review result.

## Contract-change advisory

`contract_change=NO`. `BUILD_ID`, rule, solver, schema, canonical, protocol, db, and export versions are unchanged. Generated contracts were checked, not hand-edited. Fixture expected outputs were not edited.

## Deviations

None. The Cargo test command on the final tree added `--test-threads=8`. The browser command added `--workers=1`. Both ran the full suites. No threshold was lowered and no test was skipped.

## Out of scope

z-inventory-lifecycle, z-catalog-provenance, z-strategy-library, and every later z-node. Governance files, source prompts, `SOURCE_MANIFEST.json`, CI workflows, and approved baselines.
