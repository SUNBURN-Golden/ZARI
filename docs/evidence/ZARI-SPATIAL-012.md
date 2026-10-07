# ZARI-SPATIAL-012 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was taken. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #65, node 012, “제품 완성 ADR: 실제 행동·조건·버전·평가 계약”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-012`.
- Observed base SHA: `1ef692c618c88e5dc8f966f2afd7699ccf28593a` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs read at the plan commit and at this HEAD: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` §§1–5; `docs/DOMAIN_MODEL.md`; `docs/SOLVER.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/ARCHITECTURE.md`. Previous SP-008–011 ADRs and evidence were read on this HEAD. Candidate and NON_EXECUTABLE drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` D012 and `docs/adr/SP-012-action-evaluation.md`. This delivery is SP-012 only. Fable ARCHITECTURE and the non-author A3 are replaced by two independent read-only reviews. Merge is delegated to the supervisor.

## What changed

This node freezes the contract for the current source gaps. It does not change Rust producers, `BUILD_ID` (`zari-domain-6`), capabilities, generated contracts, persisted `schemaVersion` 1, or the 124 executable fixtures.

Current `build_actions` still emits `TransferContents` after `Install` with empty `required_confirmations` and `reason_ids`. `fixtures/spatial/spatial-yaw-offset.json` still has `act:transfer:item-a:0` depending on `act:install:p-c1`. `RunEval` is still one `evaluate_candidate` call priced `64+p²+4a`. The adopted order is load in external staging, then insert the loaded unit. SP-013 owns that producer change under a new rule version that SP-013 registers. This node does not name that version or the next `BUILD_ID`.

`queryActionEligibility` is specified and not implemented. A request is `operation_not_supported`. `done` is a user assertion. It does not resolve unknown or set Confirmed. Exact instances use structured `unitOrdinal` values. Step-id strings are not parsed. Old snapshot bytes and progress rows are not rewritten or carried.

Hand-checked oracles live in `docs/oracles/product-completion/`. They are not fixture-runner inputs. PC-02 derives owned ordinals 0 and 1 once, and new need 1 with pack 2 as packs 1, supplied 2, surplus 1, with price and shipping unknown kept apart. PC-03 places the front box at y 100 depth 200 and the rear box at y 400, so the rear insertion crosses the front, and each transfer is a prerequisite of that container's install. PC-04 keeps support, staging load, parking, and handling unknowns blocked after `done`.

## Changed paths

- Adoption: `docs/adr/SP-012-action-evaluation.md`, `design/DECISIONS.md` (D012), a short SP-012 note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Contract deltas: `docs/DOMAIN_MODEL.md` §9, `docs/SOLVER.md` §7, `docs/WASM_PROTOCOL.md` §6, `docs/PERSISTENCE.md` §9, `docs/FRONTEND.md` §12, `docs/TEST_STRATEGY.md` §13.
- Oracles: `docs/oracles/product-completion/` (`index.json`, `pc-01.json`–`pc-11.json`, `decoding-matrix.json`, `evaluation-accounting.json`).
- Tests: `crates/core/tests/product_completion_contract.rs`, `apps/web/tests/unit/productCompletionOracle.test.ts`, `apps/web/tests/unit/capability.test.ts`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

`crates/core/src`, `crates/solver/src`, `apps/web/src`, `fixtures/`, generated contracts, and `Cargo.lock` are unchanged. No new dependency. No screenshot.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Each current-source gap links to SP-013, SP-014, or SP-015 and a hand-checked oracle | `index.json` gaps; Rust `oracles_cover_every_acceptance_case`; vitest owner test |
| Unknown resolution cannot use done or Confirmed | PC-01 and PC-04; Rust `pc04_checkbox_does_not_promote_unknown`; every oracle sets both checkbox flags false |
| Exact instance references and source/progress freshness are representable | PC-03 `unitOrdinal` numbers; PC-08 `requiredStamp`; tests reject a non-number ordinal |
| Unsupported DTO, scope, and migration stay held | `index.json` `heldUntilSeparateAdoption`; decoding matrix `migrationAdopted: false` |
| Baseline physical, check, and BOM expectations stay, except named guide/rule/version deltas | Fixture runner still 124. Spatial yaw fixture still has the old transfer edge. PC-02 restates existing pack arithmetic. No fixture expected output was edited |
| New API handshake is specified without a nonexistent BUILD_ID | ADR and WASM_PROTOCOL §6. `buildId` on every oracle is null. Runtime test: `queryActionEligibility` is absent from capabilities and returns `operation_not_supported`. `BUILD_ID` remains `zari-domain-6` |
| Independent reviewer checks history, guide order, instance conservation, and budget/cancel | `index.json` `reviewChecks`. Author does not mark those checks passed |
| PC-02 / PC-03 / PC-04 are manually derived | Rust `pc02_pack_arithmetic_and_new_only_acquire`, `pc03_load_before_rear_first_install`, `pc04_checkbox_does_not_promote_unknown` |
| Plan DAG | Rust `plan_dag_links_012_through_016`: 013 depends on 012, 014 on 013, 015 on 014, 016 on 001–015 |
| Decoding matrix | `decoding-matrix.json`; progress `done` is not Confirmed; unknown command is `operation_not_supported` |
| Design verification is not app qualification | This evidence says so. The Chromium suite is the existing-app regression |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. Browser commands used `--workers=1`.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 116 passed, 1 ignored. core lib 29, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, product completion contract 7, protocol 17, validator 11, search 14. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generate step. No contract diff |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 18 files, 135 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `fd65aad9808ae654`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 78 passed (2.3m). No `worker-state` flake. Timeouts were not raised |
| `npm run test:parity` | exit 0. 2 passed (21.8s). “124 shared fixtures.” |

## Browser

No new route or screen. The Chromium suite is the regression of the existing app: create, edit, save failure, catalog, detail facts, drag, plan guide, progress, portable import, probe, spatial 2D/3D, workspace, keyboard, 320–1440, 200% zoom, reduced motion, and forced colors. `spatial3d.spec.ts` reported `context-lost-console: none`. The suite's own console assertions passed. No SP-012 screenshot was captured.

Firefox and WebKit were not run. There is no new or changed browser spec to target. Phone and discrete GPU were not available and are UNVERIFIED.

`docs/evidence/ZARI-SPATIAL-001-*.png` did not change in the worktree. Checkout was not required.

## Parity

Native fixture runner and actual Chromium Worker/WASM agreed on the same 124 fixtures. The new oracles are outside that set on purpose.

## Contract-change advisory

Executable wire, generated schema, capabilities, `BUILD_ID`, canonical version, and persisted schemaVersion are unchanged. The adopted document changes the future meaning of the guide and of evaluation accounting. SP-013 and SP-014 register the next `ruleVersion`, `solverVersion`, profile version, and `BUILD_ID` when they implement those meanings. That later wire change is `contract_change=YES` and is not this tree. This delivery does not authorize release, fact confirmation, or migration.

## Deviations

None. The Fable ARCHITECTURE gate is replaced only as the owner instructed on 2026-10-07. SP-001–011 specs and the program DAG were not edited.

## Known limits

The running producer still has the gap this contract assigns to SP-013. `queryActionEligibility` is not callable. Repository CAS does not yet compare catalog digest, rule version, editor epoch, or progress identity; PC-08 lists those stamps for SP-015. No phone, no discrete GPU, no Firefox, no WebKit on this delivery. Design checks are not qualification of the future guide.

## Out of scope

SP-013 guide generation, SP-014 resumable evaluation, SP-015 storage lifecycle, SP-016 capture, schema or database migration, new dependencies, approved baselines, and edits under `.aiops/` or `docs/aiops/`.
