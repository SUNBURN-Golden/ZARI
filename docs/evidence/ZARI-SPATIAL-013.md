# ZARI-SPATIAL-013 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was kept as evidence. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #67, node 013, “Rust 실행 가이드 DAG와 unknown 조건·진행 guard”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-013`.
- Observed base SHA: `b18a61238dae2aa7563d3f47b43791b262250326` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs read at the plan commit and at this HEAD: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` §4; `docs/DOMAIN_MODEL.md`; `docs/SOLVER.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/ARCHITECTURE.md`. Previous SP-001–012 evidence and the SP-012 ADR were read on this HEAD. Candidate and NON_EXECUTABLE drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` D013 and `docs/adr/SP-013-execution-guide.md`. This delivery is SP-013 only. Fable ARCHITECTURE and the non-author A3 are replaced by two independent read-only reviews. Merge is delegated to the supervisor.

## What changed

`assemble_action_guide` now emits the adopted graph. Clear, acquire, arrival, resolve, and verify-unassigned are user assertions. Acquire and arrival exist only for a new variant. Transfers load exact contained units before that container's install and do not depend on the install. Install prerequisites come from the validator insertion order, the purchase gate, those transfers, and the space clear. `reasonIds` bind the structured checks that block that step. `chk:bg:soft`, pass, and not-applicable checks are omitted. `requiredConfirmations` stay empty. Display order is Kahn, picking the byte-smallest ready id. React does not reorder actions or invent physical meaning.

`queryActionEligibility` is a stateless read. `BUILD_ID` is `zari-domain-7`. `ruleVersion` is `zari-domain-v2`. Solver version, schema version, and canonical version stay 1 / `zari-solver-v1`. A null progress list is not eligible. A dirty, mismatched, or `zari-domain-v1` stamp is not eligible. Resolve completion does not change Fact, check status, or provenance. The repository rechecks catalog, rule, solver, schema, canonical, build, search profile, revision, and progress identity inside the CAS transaction, after the input binding checks and before prerequisites. The Worker call stays outside the transaction. Refusal does not write. Old done rows stay. There is no automatic progress migration.

`contract_change=YES`. This tree cannot auto-merge. There is no database migration and no new `ActionKind` or `CheckKind`.

Hand oracles `docs/oracles/product-completion/pc-01.json`–`pc-11.json` and `index.json` were not regenerated. `index.json` still records `currentBuildId` `zari-domain-6` and `ruleVersion` `zari-domain-v1`. Tests compare the producer to those files.

## Changed paths

- Adoption: `docs/adr/SP-013-execution-guide.md`, `design/DECISIONS.md` (D013), a short SP-013 note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/finalize.rs`, `eligibility.rs` (new), `canonical.rs`, `protocol.rs`, `validate.rs`, `lib.rs`. Tests: `guide_oracle.rs` (new), `product_completion_contract.rs`, `protocol.rs`, `validator.rs`.
- Generated contracts: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`. Regenerated, not hand-edited.
- Web: `apps/web/src/worker/client.ts`, `apps/web/src/persistence/repository.ts`, `apps/web/src/features/project/session.ts`, `apps/web/src/features/workspace/stepFocus.ts`, `StepFocus.tsx`, `apps/web/src/features/plan/view.ts`, `apps/web/src/app/PlanScreen.tsx`.
- Tests: `catalogOwned.test.ts`, `session.test.ts`, `capability.test.ts`, `searchPump.test.ts`, `stepFocus.test.ts`, `progress.spec.ts`, `drag.spec.ts`, `quality.spec.ts`.
- Contract text: `docs/DOMAIN_MODEL.md` §10, `docs/SOLVER.md` §7, `docs/WASM_PROTOCOL.md` §2 and §6, `docs/PERSISTENCE.md` §9, `docs/FRONTEND.md` §12, `docs/TEST_STRATEGY.md` §3 and §13.
- Fixtures: every executable fixture envelope `buildId` is `zari-domain-7`, including `scripts/bench-fixtures.mjs`. Further deltas are listed under Contract-change advisory. `fixtures/spatial/spatial-yaw-offset.json` changed only that envelope line. Its transfer still depends on `act:install:p-c1`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

No new dependency. `Cargo.lock` was not edited. No new color token.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| PC-01 direct graph and install path checks | `guide_oracle.rs` `pc01_direct_guide_matches_the_hand_oracle` |
| PC-02 acquire only for the new variant; owned installs have no acquire edge; pack arithmetic stays in the existing oracle test | `pc02_acquire_is_only_the_new_variant`; `product_completion_contract.rs` `pc02_pack_arithmetic_and_new_only_acquire` |
| PC-03 load before rear-first install; no install→transfer edge | `pc03_load_before_rear_first_install_matches_the_hand_oracle`; validator contained-order test |
| PC-04 related unknowns block only the related actions; resolve does not clear a check | `pc04_unknown_checks_block_only_the_related_actions`; `resolve_done_does_not_clear_an_unknown_blocker` |
| Cycles, duplicates, dangling action and check refs reject; historical bytes stay valid | `hostile_action_refs_are_rejected_without_rewriting_history`; `historical_fixture_keeps_the_pre_sp013_guide_bytes` |
| Stale, dirty, null, and old-rule eligibility refuse | `eligibility_refuses_stale_dirty_null_and_old_rules` |
| Checkbox cannot complete a blocked acquire/transfer/install; a clear assertion leaves checks unchanged | vitest `session.test.ts` blocked-step test |
| Historical rule and stamp mismatch write nothing and keep a done row | vitest `catalogOwned.test.ts` |
| Same snapshot for diagram, BOM, guide, and links | Chromium `plan.spec.ts` real WASM search; actions live on that snapshot |
| Old snapshots keep their hash; new ids are `zari-domain-7` / `zari-domain-v2` | spatial yaw fixture diff is buildId only; `current_engine_identity_registers_the_sp013_rule`; oracle files still say domain-6 / v1 |
| PC-08 dirty, two-tab, late reply, accept switch, save/reload on a real Worker and IndexedDB | `progress.spec.ts` three flows; `quality.spec.ts` save/read failure and late projection. Console error lists in those specs were empty on the passing runs |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. Browser commands used `--workers=1`.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 123 passed, 1 ignored. core lib 29, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, product completion contract 7, protocol 17, validator 11, search 14. Solver and wasm lib tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures, as the first step of `npm run test:parity` |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0, inside `npm run build` and `npm run test:build`. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 18 files, 138 tests |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `bcc4ea73bcb58e8f`, 11 assets, spatial raw 576505 bytes |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 72 base tokens; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0 on the final tree. 78 passed (2.4m). No `worker-state` flake. Timeouts were not raised |
| `npm run test:parity` | exit 0. 2 passed (24.2s). “124 shared fixtures.” |
| Firefox, changed specs | `drag.spec.ts`, `progress.spec.ts`, `quality.spec.ts`: 12 passed |
| WebKit, same specs | 11 passed, 1 failed. See Known limits |

## Browser

Routes exercised are the existing app: project list, project editor, plan, catalog, probe, and the accepted guide. Chromium viewport default is 1440×1000. The progress reload flow also uses 390×844 and `forcedColors: active`. The drag compact flow uses 390×844. `spatial3d.spec.ts` reported `context-lost-console: none`. Specs that collect `pageerror` and console `error` passed with empty lists on the final Chromium run, and on the Firefox and WebKit runs that completed.

The first Chromium suite on this tree was 73 passed and 5 failed (`drag.spec.ts` 3, `progress.spec.ts` working-head, `quality.spec.ts` late projection). The sample's top-ranked plan was the front-flush bin at `(75, 0, 0)`. A −15 mm depth move was rejected as outside the space and off the support. The back-flush bin at y 145 is still an alternative. Those specs now select the single-placement plan whose depth origin is at least 15 mm, then the full Chromium suite passed.

No SP-013 screenshot was captured for evidence. Playwright failure attachments from the first Chromium run and the WebKit flake are DRAFT tool output under `test-results/` and are not an approved baseline.

`docs/evidence/ZARI-SPATIAL-001-*.png` did not change in the worktree. Checkout was not required.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native fixture runner and actual Chromium Worker/WASM agreed on the same 124 fixtures. The hand oracles are outside that set on purpose.

## Contract-change advisory

`contract_change=YES`. `BUILD_ID` `zari-domain-6` → `zari-domain-7`. `RULE_VERSION` `zari-domain-v1` → `zari-domain-v2`. Capability `queryActionEligibility` is immediately before `disposeProject`. Generated DTO, schema, and validators were regenerated from Rust.

Executable fixture envelopes changed `buildId` only, except:

- Current MC snapshots `mc-07-shared-fact`, `mc-09-catalog-source`, `mc-12-limit`, `mc-12-purchase-not-pass`: snapshot `ruleVersion` and recomputed `planSnapshotId`. Stale fixtures `mc-10-stale-binding`, `mc-12-historical`, and `mc-12-input-only` keep v1 snapshot bytes. Their expected engine stamp `ruleVersion` is v2 because the engine stamps the current rule.
- Candidate and edit expectations whose snapshot digest includes the new actions and rule: `candidate-bounded-confirmed`, `candidate-contained-conditional`, `candidate-direct-conditional`, `candidate-provisional`, `candidate-soft-budget`, `candidate-unresolved-offer`, `edit-move-permitted`, `edit-restore`, `edit-rotate-permitted`. Digest lines only.
- Search alternative digest sets, not consumed counters: `search-scope-complete` (3), `search-budget-exhausted` (3), `bench-search-small` (2). The last rank key is `planSnapshotId`, so a new action graph changes which tied digest is kept. Counts of alternatives and work units were not edited and the runner accepted them.

Historical input snapshots, including `record-snapshot-verified` and `spatial-yaw-offset`, were not rewritten. Guide graphs were not regenerated from `build_actions` into the hand oracle files.

## Deviations

Browser tests that need a −15 mm depth move select the back-flush container instead of `plan-card-0`. Card 0 is now the front-flush tied alternative. The drag geometry assertion is unchanged: decreasing depth by 15 mm on that back-edge bin.

The full Chromium command used `--workers=1` because this machine's RAM is shared. CI's script does not set a worker count.

WebKit was not re-run after the one `worker-state` miss. Timeouts were not raised.

## Known limits

A repository `setActionStep` with a matching stamp does not re-evaluate geometry. The session asks `queryActionEligibility` and refuses a non-executable acquire, transfer, or install before the write. Clearing a step does not require `executable`.

`user_assertion` is true for every action kind. It means the checkbox is a progress mark, not a fact confirmation. The checkbox follows `executable`.

SP-014 still prices `RunEval` as one `evaluate_candidate` lump. SP-015's storage lifecycle beyond the PC-08 guards in this node is not implemented. No phone. No discrete GPU.

WebKit `quality.spec.ts` “progress save and read failures stay visible and do not invent completion” stayed on the empty project list for 30s after `create-project`. `worker-state` was absent. This is the known create-project worker-state flake. It was not retried. Firefox passed that spec. Chromium's full suite passed it.

## Out of scope

SP-014 resumable evaluation, SP-015 beyond the guards above, SP-016 capture, schema or database migration, new dependencies, checkout or a provider, approved baselines, source prompts, `SOURCE_MANIFEST.json`, and edits under `.aiops/` or `docs/aiops/`.
