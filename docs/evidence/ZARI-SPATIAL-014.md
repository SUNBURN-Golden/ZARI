# ZARI-SPATIAL-014 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. No screenshot was kept as evidence. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #69, node 014, “취소 가능한 독립 평가·원자적 snapshot publication”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-014`.
- Observed base SHA: `c8f4c24914910afebf639e28dae896d3a2a19573` (origin/main at branch creation; the plan commit is an ancestor). The final HEAD is the supervisor's commit of this verified tree.
- Pinned docs read at the plan commit and at this HEAD: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md` §5; `docs/DOMAIN_MODEL.md`; `docs/SOLVER.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/FRONTEND.md`; `docs/TEST_STRATEGY.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `docs/ARCHITECTURE.md`; `docs/PERFORMANCE_SECURITY_FAILURES.md`. Previous SP-001–013 evidence and the SP-012 and SP-013 ADRs were read on this HEAD. Candidate and NON_EXECUTABLE drafts were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` D014 and `docs/adr/SP-014-evaluation-continuation.md`. This delivery is SP-014 only. Fable ARCHITECTURE and the non-author A3 are replaced by two independent read-only reviews. Merge is delegated to the supervisor.

## What changed

Profile `default` version 1 still prices `RunEval` as one `evaluate_candidate` lump (`64+p²+4a`) and stamps `zari-solver-v1`. Profile `default` version 2 is the only split profile. It stamps `zari-solver-v2` and counts the adopted quanta in order: one structural reference (1), one check basis or pair (1), one quantity assignment / unassigned bundle / owned id (1), one BOM line (4), one action step and one prerequisite edge (1 each), every 4096 canonical bytes with a minimum of one quantum (1), and one revalidation check id or action id (1). An allowance below one quantum still runs that quantum. The global work and node budget is applied before the quantum. A zero-cost quantum is not scheduled. Empty phases advance. The first canonical quantum serializes the canonical body and then hashes the first 4096 bytes. Later hash quanta are 4096-byte slices.

The continuation is private and bound to the input, catalog, proposal, and profile version. The solver does not prune on an in-progress verdict. A foreign catalog discards the handle and publishes nothing. A snapshot, BOM, action list, and hash become an alternative only after revalidation. A blocking or corrupt candidate can keep a report and does not publish a snapshot. `budgetExhausted`, `cancelled`, and `interrupted` stay distinct. None of them is `scopeComplete`. Cancel, budget stop, trap, and a source change drop the in-progress candidate and keep finished alternatives and the saved input. A late reply is not applied.

`BUILD_ID` stays `zari-domain-7`. `ruleVersion` stays `zari-domain-v2`. Schema version 1, canonical version 1, and `ActionStep` fields stay. There is no new command or capability and no database migration. New projects use profile `default` version 2. `maxWorkUnits` stays `200000`. Ready advertises `zari-solver-v2`. A version-1 snapshot still stamps `zari-solver-v1`.

`contract_change=YES`. This tree cannot auto-merge. Generated DTO, schema, and validators were not regenerated: the schema does not pin the solver version string, and `npm run contracts:check` matched Rust. Executable fixture bytes were not edited.

Hand oracles under `docs/oracles/product-completion/`, including PC-05–07 and `evaluation-accounting.json`, were not rewritten. `futureProfileRegistered: false` in that accounting file remains its historical sentence. Profile version 2 is registered by the ADR, not by editing that file.

## Changed paths

- Adoption: `docs/adr/SP-014-evaluation-continuation.md`, `design/DECISIONS.md` (D014), a short SP-014 note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/eval_continue.rs`, `layout_drive.rs`, `check_drive.rs`, `action_drive.rs` (new); `canonical.rs`, `finalize.rs`, `lib.rs`, `protocol.rs`, `validate.rs`, `validator.rs`; `crates/solver/src/search.rs`. Tests: `crates/solver/tests/search.rs`.
- Web: `apps/web/src/features/project/default-form.json` (profile version 2), `session.ts` (`interrupted`, source change, cancel timeout, crash), `apps/web/src/app/PlanScreen.tsx` (existing session note).
- Tests: `apps/web/tests/unit/session.test.ts`, `apps/web/tests/browser/eval-continuation.spec.ts` (new), `a11y.spec.ts`, `plan.spec.ts`.
- Contract text: `docs/DOMAIN_MODEL.md` §11, `docs/SOLVER.md` §7, `docs/WASM_PROTOCOL.md` §6, `docs/PERSISTENCE.md`, `docs/FRONTEND.md`, `docs/TEST_STRATEGY.md`.
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

No new dependency. `Cargo.lock` was not edited. No new color token. `fixtures/` has no diff. `docs/evidence/ZARI-SPATIAL-001-*.png` did not change. Checkout was not required.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| Same profile, budget, and allowances 1/7/128/256/1024; offer order does not change the terminal output | `search.rs` `split_profile_allowances_and_offer_order_match` (solver `zari-solver-v2`, alternatives nonempty) |
| Stop before the work budget; only finished snapshots; allowance 1 matches 7 on that budget | `split_profile_stops_before_the_work_budget_and_publishes_only_finished_snapshots` (`max_work` 8000, `BudgetExhausted`, consumed ≤ 8000, `validate_snapshot` empty) |
| Cancel is not scope complete or budget exhausted | `split_profile_cancel_is_not_scope_or_budget` |
| Continuation matches batch checks, quantity, BOM, actions, and digest | `eval_continue.rs` `split_continuation_matches_batch_evaluation`; `check_drive_matches_batch_on_domain_candidates`; `action_quanta_match_the_batch_guide`; `layout_drive_matches_structural_validation` |
| PC-05 corrupt / blocking candidates publish no snapshot | `blocking_and_corrupt_candidates_publish_no_snapshot` (sibling overlap, missing purchase). The PC-05 JSON file was not rewritten |
| PC-06 budget boundary | the budget test above. The PC-06 JSON still says profile version 1 and was not rewritten |
| PC-07 cancel in each phase, foreign source, no partial publication | `cancel_in_each_phase_publishes_nothing` (all seven phase names, discard publishes nothing); `foreign_catalog_discards_the_handle`. The PC-07 JSON was not rewritten |
| Source reorder that canonicalizes equally | `reversed_offers_keep_the_same_evaluation` |
| Trap, unanswered cancel, source switch: partial publication 0, late application 0, prior plan and input kept | vitest `session.test.ts`: crash mid-search, hang-cancel (`cancel_timeout`), source change during a held step (`source_changed`) |
| Native and browser Worker parity for the 124 fixtures, including checks, quantity, BOM, guide, and hash on version-1 bytes | `npm run test:parity` |
| Real Worker foreground cancel keeps the accepted snapshot; keyboard, forced colors, 390px, empty console | Chromium, Firefox, and WebKit `eval-continuation.spec.ts`. Hard terminate is the session unit test, not an injected browser crash |
| Hand geometry, pack, and action oracles survive | existing `product_completion_contract.rs` and `guide_oracle.rs` still pass; oracle files were not regenerated |
| Version-1 fixture counters and digests stay | `git diff -- fixtures` empty; fixture runner exit 0 |
| cold 20 / warm 50 p50/p95/max, met or unmeasured | `npm run bench:browser` below. Phone column stays unmeasured |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. Browser commands used `--workers=1`.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0, in the same chain as the fixture runners |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 (12.52s), after `cargo fmt --all` |
| `cargo test --workspace --locked -- --test-threads=8` | exit 0 (256.9s). 134 passed, 1 ignored. core lib 37, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, guide oracle 7, product completion contract 7, protocol 17, validator 11, search 17. Solver and wasm lib tests 0. Doc-tests 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0. `fixtures/bootstrap` has 28 JSON fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0 in that chain, and again inside `npm run test:parity` (124 results). `fixtures/manifest.json` is the extra JSON file and is not a runner case |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128. Release compile in the contracts chain was 1m 07s |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No generate step. No contract diff |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 on the final tree, after the a11y and plan expectation edits |
| `npm test` | exit 0. vitest 18 files, 140 tests (182.73s), after the source-change session fix. The later edits are Playwright specs, which vitest does not run |
| `npm run build` | exit 0. Vite production. wasm gzip 940.81 kB. The pre-existing chunk-size warning is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `fadcd8de430b6f1c`, 11 assets, spatial raw 576505 bytes, spatial gzip 143562 bytes |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 72 base tokens; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0 on the final tree. 79 passed (9.1m). No `worker-state` flake. Timeouts were not raised |
| `npm run test:parity` | exit 0. 2 passed (24.4s). “124 shared fixtures.” |
| Firefox, changed specs | `eval-continuation.spec.ts`, `a11y.spec.ts`, `plan.spec.ts`: 6 passed (1.8m) |
| WebKit, same specs | 6 passed (1.5m). The known create-project `worker-state` flake did not appear |
| `npm run bench:browser -- --project=chromium --workers=1` | exit 0. 15 passed (6.2m). Defaults cold 20, warm 50. Numbers below |

## Bench

Report written to `test-results/bench/bench-chromium.json` (gitignored tool output, not an approved baseline). `generatedAt` in that file is `2026-10-07T13:58:14.771Z`. Suite ended `2026-10-07T14:04:23.576Z`. Contract label `zari-bench-3`. Chromium `153.0.8010.12`. WASM bytes 6149047. Environment: Node v24.19.0, linux 6.12.94+, Intel Xeon, 8 logical cores, memory 16791158784 bytes, headless, loopback Vite preview, no throttle, power unmeasured. `phone` and `discreteGpu` are `UNVERIFIED`.

The bench fixtures were not edited. Their search profile is `default` version 1, so these step and cancel times are the lump `RunEval` path, not profile version 2. Source is the real Worker. Response bytes are the bench `bytes` stats.

| Fixture | Profile | maxWorkUnits | Termination | workUnits | stepSearch n / p50 / p95 / max (ms) | response bytes p50 / p95 / max |
|---|---|---|---|---|---|---|
| bench-search-small | default v1 | 200000 | budgetExhausted | 199953 | 9950 / 0.10 / 0.20 / 34.00 | 445 / 445 / 305666 |
| bench-search-reference | default v1 | 200000 | budgetExhausted | 199978 | 10050 / 0.10 / 0.20 / 4.00 | 445 / 445 / 1824 |
| bench-search-adversarial | default v1 | 60000 | budgetExhausted | 59978 | 3050 / 0.10 / 0.30 / 5.20 | 442 / 442 / 1820 |
| bench-search-cancel | default v1 | 200000 | cancelled | 4099 | 200 / 0.20 / 0.60 / 2.70 | 439 / 440 / 440 |

`cancelSearch` on bench-search-cancel: n=50, p50=0.20 ms, p95=0.30 ms, max=0.80 ms, response bytes 441.

Cold 20: page load p50/p95/max 334/382/382 ms; wasm fetch 28.1/34.8/34.8 ms; wasm compile 42.6/58.1/58.1 ms; worker init 147/171.2/171.2 ms. Combined wasm transfer+compile p95 264.10 ms, target 1000 ms, met.

Stage verdicts from the bench printer (p95 against the desktop target): searchStep 0.60 ms vs 8 ms, met (at bench-search-cancel). cancelAck 0.30 ms vs 100 ms, met. Other printed desktop rows (normalization, messaging residual, serialization, draft transaction, snapshot save+reload, projection, 2D, pointer, 3D, spatial gzip) were met. Measurement-query rows were met, including cold query source p95 19.9 ms vs 20 ms.

| Target | Desktop | Mobile | This run |
|---|---|---|---|
| Search step | 8 ms | 16 ms | desktop met (p95 0.60 ms). Mobile unmeasured. The small-fixture step max was 34 ms; the target is p95 |
| Foreground cancel acknowledgement | 100 ms | 200 ms | desktop met (p95 0.30 ms). Mobile unmeasured |
| Validation / BOM / finalization | 30 ms | 100 ms | unmeasured. The bench has no separate stage for that span |

## Browser

Routes exercised are the existing app: project list, project editor, plan, catalog, probe, and the accepted guide. Chromium viewport default is 1440×1000. `eval-continuation.spec.ts` also uses `forcedColors: active` and 390×844, checks no horizontal scroll, and asserts the collected `pageerror` and console `error` list is empty. That spec passed on Chromium (16.0s in the full suite), Firefox (17.5s), and WebKit (14.8s). `spatial3d.spec.ts` reported `context-lost-console: none` in the full Chromium suite.

Two earlier full Chromium runs on this tree were 78 passed and 1 failed. The first failure was the keyboard cancel landing on `interrupted` when a 256-allowance `stepSearch` outlasted the existing 250 ms cancel timeout. The second was a recompute clicked while `recover()` had not reinstalled the context, so the status stayed `interrupted`. The expectations now allow `cancelled|done|interrupted` and wait until `plan-context` is installed again. Timeouts were not raised. The final Chromium suite was 79 passed. Focused `plan.spec.ts` before that suite was 3 passed, including the cancel flow in 24.0s; the same test in the final suite was 15.4s.

No SP-014 screenshot was captured for evidence. Playwright attachments under `test-results/` are DRAFT tool output and are not an approved baseline.

`docs/evidence/ZARI-SPATIAL-001-*.png` did not change in the worktree.

Phone and discrete GPU were not available and are UNVERIFIED.

## Parity

Native fixture runner and actual Chromium Worker/WASM agreed on the same 124 fixtures. Those fixtures stay on profile version 1, so this parity does not by itself measure profile version 2. Version 2 is covered by the solver tests and by the real Worker searches in the browser specs, which use the sample form at profile version 2.

## Contract-change advisory

`contract_change=YES`. `ready.solverVersion` is `zari-solver-v2`. A snapshot stamps `solver_version_for` of its own profile, so profile `default` version 2 stamps `zari-solver-v2` and version 1 stays `zari-solver-v1`. `BUILD_ID` stays `zari-domain-7`. No new command or capability. Generated contracts were not rewritten and `contracts:check` matched. Executable fixture envelopes, digests, and consumed counters were not edited. This tree cannot auto-merge.

## Deviations

Profile version 1 keeps the lump expression in `search.rs`, which `product_completion_contract.rs` still requires. Replacing that lump would change version-1 work units and digests. Those fixture bytes were left in place.

`cargo test` added `--test-threads=8`. The full workspace still ran. Browser commands used `--workers=1` because this machine's RAM is shared. CI's script does not set a worker count.

Firefox and WebKit used the test-mode dist from the preceding full Chromium `npm run test:browser` (`vite build --mode test`). `test:parity` and `bench:browser` each ran `test:build` again.

A foreground cancel can be observed as `interrupted` when one host `stepSearch` (allowance 256) exceeds the existing 250 ms hard-cancel timeout. That path calls `recover()` and is not reported as `scopeComplete` or `budgetExhausted`. The tests accept it. The timeout was not raised.

## Known limits

The first canonical quantum serializes the whole canonical body before hashing 4096 bytes. Cancel is between quanta, not inside that serialization and not inside a host step that is already running.

Bench search and cancel numbers above are profile version 1. Profile version 2 was not added to the bench fixture set. Validation/BOM/finalization 30/100 ms has no bench row and is unmeasured. Mobile 16 ms and 200 ms are unmeasured. Phone qualification remains missing. Discrete GPU is UNVERIFIED.

`user_assertion` and the SP-013 guide graph are unchanged. A repository write still does not re-evaluate geometry by itself.

## Out of scope

SP-015 storage lifecycle, SP-016 capture, schema or database migration, a new optimizer, random objective, shape rule, parallel renderer, server, or GPU path, threshold changes, checkout or a provider, approved baselines, source prompts, `SOURCE_MANIFEST.json`, and edits under `.aiops/` or `docs/aiops/`.
