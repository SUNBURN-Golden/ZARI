# ZARI-z-feedback-reorganize evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #104, node z-feedback-reorganize, “사용 피드백에서 다음 정리로 이어지는 루프”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-feedback-reorganize`.
- Observed base SHA: `dca8fc401bea33966682b2fb98fe1a53c043c7e9` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`; `docs/MASTER_PROMPT_KO.md` §§7–14,24; `docs/RUST_ADDENDUM_KO.md`; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Previous node evidence and ADRs (z-location-search, z-search-diagnostics, z-incremental-replan, z-inventory-lifecycle) were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**`, `docs/aiops/**`, and `.github/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `docs/adr/SP-z-feedback-reorganize.md`, `design/DECISIONS.md` Dz-feedback-reorganize, a z-feedback-reorganize-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, and `design/SPATIAL_WORKSPACE.md` §8. This delivery is z-feedback-reorganize only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, payment, cloud, photo consent, or release.

## What changed

Feedback is a record, not a decision. Rust is the single authority for what an entry means, for the rules, and for the draft; the browser persists, shows, and sends.

- `crates/core/src/feedback_reorganize.rs` (new): `FeedbackLog` (append-only `FeedbackEntry` list of `accessDifficulty`, `frequencyChange`, `maintenanceDifficulty`, plus a separate `withdrawnIds` list), `apply_feedback_log` (record/withdraw; Rust stamps the adopted `planSnapshotId`, NFC-bounds the note, refuses `needs_plan`, `item_unplaced`, `subject_missing`, `duplicate_feedback`, `frequency_required`/`forbidden`/`unchanged`, `invalid_label`, `already_withdrawn`, 128-entry cap), and `propose`. The proposal tries a bounded set of position exchanges between top-level placements that share a parent, support, and height (`DepthSwap`, `SlotSwap`). Three rules (`feedback:access:v1`, `feedback:frequency:v1`, `feedback:maintenance:v1`) accept a candidate only when their integer measure strictly drops and the other rule's measure does not rise. Every candidate crosses `evaluate_candidate`; one with a blocking failure, a weaker check against the adopted plan's fresh evaluation, or a weaker physical assurance is refused. Unknown frequency is never compared or moved. Only the latest live frequency entry per item acts. The reply carries one cause per entry (rule, outcome, reason, input vs effective frequency, measures, partner, blockers, unknown siblings, the user's latest location claim as context), `moves`, `checkChanges`, a Rust-compared `preserved` block, constant-false `autoDiscard`/`autoPurchase`/`reusedPass`, and a `reproduction` record with `requestDigest`.
- `crates/core/src/protocol.rs`, `lib.rs`: commands `applyFeedbackLog` (stateless, system identity) and `proposeFeedbackReorganize` (active project, no search engine needed); events `feedbackLogApplied`, `feedbackReorganizeProposed`. Capabilities: `proposeFeedbackReorganize` after `evaluateLayoutEdit`, `applyFeedbackLog` after `applyLocationLog` (base list 24, 32 with the engine). `BUILD_ID` stays `zari-domain-7`; schema/protocol/canonical/rule/export versions unchanged.
- `apps/web/src/persistence/db.ts`, `repository.ts`: live `DB_VERSION` 5 → 6, additive `feedbackLogs` store, `readFeedbackLogRow` (malformed row is corruption), `migration:5->6` journal, CAS `saveFeedbackLog`/`getFeedbackLog`, `deleteProject` deletes the row in the same transaction. `apps/web/src/worker/client.ts`: expected-event map and `WORKER_CAPABILITIES` match Rust.
- `apps/web/src/features/feedback/{controller.ts,phrases.ts,FeedbackPanel.tsx}`: record/withdraw through the system Worker with CAS save only for a changed log; one-command-per-key helpers; panel with record form, entries, budget select, run/cancel/retry, cause list, current-vs-proposed moves, check changes, preserved block, reproduction details, open/accept/close. `session.ts`: `proposeFeedback`, `cancelFeedback`, `discardFeedback`, `openFeedbackDraft` with an epoch bumped by cancel, a record change, an input commit, a new search, and an accept. `PlanScreen.tsx` mounts the panel after the partial replan panel. `project.css` reuses existing tokens; no new color pair or contrast case.
- Fixtures: 17 case files under `crates/core/tests/fixtures/feedback_reorganize/` (scenarios, `record-rejections.json`, `wasm-parity.json` with native-oracle digests). Domain-test fixtures, not the top-level manifest: `fixtures/` bytes and the 124 count are unchanged.
- `scripts/check-product-contract.mjs`: `DB_VERSION` pin 5 → 6. `docs/product-expansion/contract.json`: `baseCapabilities` +2 names only.

## Changed paths

- Adoption/docs: `docs/adr/SP-z-feedback-reorganize.md`, `design/DECISIONS.md`, `design/SPATIAL_WORKSPACE.md`, `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, `docs/WASM_PROTOCOL.md` (rows, ordered list, §17), `docs/PERSISTENCE.md` (`DB_VERSION` 6, store row, deletion, §20), `docs/FRONTEND.md` (§22), `docs/IMPLEMENTATION_STATUS.md`, this file.
- Rust: `crates/core/src/feedback_reorganize.rs`, `lib.rs`, `protocol.rs`; tests `crates/core/tests/feedback_reorganize.rs`, fixtures above, ordering assertions in `protocol.rs`, `product_completion_contract.rs`, `inventory_lifecycle.rs`.
- Generated: `apps/web/src/contracts/generated/{dto.ts,schema.json,validators.mjs}` via `npm run contracts:generate` (never hand-edited); `docs/product-expansion/contract.json`.
- Web: `persistence/{db,repository}.ts`, `worker/client.ts`, `features/feedback/*`, `features/project/session.ts`, `app/PlanScreen.tsx`, `styles/project.css`.
- Web tests: `tests/unit/feedback.test.ts` (6), `tests/unit/feedbackWasm.test.ts` (1, browser WASM vs native oracle), `repository.test.ts` and `transfer.test.ts` (v6 journal, `db:verno` 6, feedback CAS/delete), `tests/browser/feedback-reorganize.spec.ts` (3).
- Checker: `scripts/check-product-contract.mjs`.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, `.github/**` were not touched (`git diff` empty). No new dependency. `docs/evidence/ZARI-SPATIAL-001-*.png`, which the browser suite rewrites, were restored with `git checkout`.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| 피드백만으로 물건 폐기·구매를 자동 확정하지 않는다 | Rust: `feedback_alone_never_discards_or_buys` (`autoDiscard`/`autoPurchase` false, assignments, unassigned, purchase selections, BOM, cost, input facts equal the adopted plan), kinds are only the three records (unknown kind is a wire error). Browser: panel `data-auto-discard/purchase="false"`, every `feedback-preserved` row `data-kept=true`, `feedback-no-decision` text; the log write sends no proposal and leaves the accepted binding unchanged |
| 취소 시 현재 계획과 실제 위치가 보존된다 | Browser: held proposal → cancel → `data-state=cancelled`, accepted snapshot id and `locationLogs` row unchanged (byte-identical JSON), late reply only raises `data-ignored`, no draft offered, call count stays. Unit: `proposalOpenAllowed` refuses a late/foreign reply. Rust: `the_proposal_never_changes_what_it_read`. Adoption is explicit: after it the earlier location confirmation reads `staleConfirmation` and the log row is still identical |
| 새 입력·규칙·예산으로 재현 가능한 제안이다 | Rust: same input/rules/feedback/budget → identical reply bytes, also from a rebuilt world; budget, feedback, location log, and input each move `requestDigest`; draft id equals an independent `evaluate_candidate` of the exchanged layout; `budget-exhausted` vs `budget-enough` cases. Browser: same request sends one command, a new budget sends another with the same draft id and a different request digest. WASM: `feedbackWasm.test.ts` reproduces the native oracle's base id, draft id, feedback digest, and request digest |
| 관측과 추천 규칙의 인과를 설명한다 | Rust causes per entry for every outcome (`applied`, `noBetterSlot`, `blocked`, `notApplicable` incl. `frequency_unknown`/`no_group_mates`/`superseded`, `withdrawn`, `stale`, `budgetExhausted`); location claims shown as context only. Browser asserts rule id, outcome, reason, measure text, input→recorded frequency |
| 현재 계획을 보존한 대안 draft와 기존/제안 비교·채택 | Browser: moves table current→proposed mm, draft opens as an alternative, `이 초안을 채택` is the ordinary accept; entries made for the earlier plan then read `다른 계획에 기록됨 · 적용 안 함` |
| unknown은 pass/기본값이 되지 않는다 | Rust: unknown frequency is `frequency_unknown`, an unknown sibling is counted and never moved; `weakened` unit test (a pass that becomes unknown is refused) |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. Node v24.19.0, npm 11.x, rustc 1.98.1, wasm-bindgen 0.2.128. Playwright timeouts were not raised. Results below are from the final tree.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked --no-fail-fast` | exit 0, **241 passed, 0 failed** (new: `feedback_reorganize.rs` 25, inline unit test 1). A first run of the plain command failed one test, `completion_query::warm_query_p95_stays_within_the_rust_target` (a 20 ms wall-clock p95 gate) while the host load average was 6–7; it passed alone (12/12) and in the full rerun. Not related to this change; threshold untouched |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0 |
| `… -- fixtures` | exit 0, 124 fixtures; `git status fixtures Cargo.lock` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0; no new dependency |
| `npm run wasm:build`, `npm run contracts:check` | exit 0; “Contracts match Rust source; 124 fixture structures valid.” |
| `npm run typecheck`, `npm run lint` | exit 0 |
| `npm test` | exit 0 on the final-tree rerun: 33 files, **209 passed**. Two earlier runs on the same code each failed one real-WASM `session.test.ts` test with a 30 s wait (“strategies and a real WASM search…”, then “a cancel that never returns…”) while the host load was 5–7 and the wall clock jumped (e.g. 14:52→15:05 against 14:52→14:56 of uptime); `session.test.ts` alone passed 35/35 and the full rerun passed 209/209. No timeout or test was changed |
| `npm run build` | exit 0 |
| `node scripts/check-release-manifest.mjs` | exit 0, `errors: []`, `buildId` `0d1b6e839127364a` |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0, 12 self-tests, 39/39 contrast cases (no new pair) |
| `node scripts/check-product-contract.mjs` | exit 0; 16 ids unchanged, 124 fixtures unchanged, runtime hits 0 |
| `npm run test:browser -- --project=chromium` | exit 0, **111 passed, 0 failed** (5.3 m; 108 before + 3 new). A first full run before the last small edits also passed 111/111 (5.6 m) |
| `apps/web/tests/browser/feedback-reorganize.spec.ts` on Firefox / WebKit | Firefox 3/3 (twice). WebKit 3/3 on three runs; one WebKit run during host load ≈ 11 failed 1 of 3 with a `toHaveAttribute` timeout and passed on both reruns |
| `npm run test:parity` | exit 0, 2 passed, “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Routes: `#/` → create project → fill sample → draft edit in IndexedDB (documents may stand loose and are narrowed so a plan holds two different items directly; the search budget is reduced so it finishes) → commit → plan → compute → accept the first no-purchase card whose documents sit behind a coat → feedback panel. Second test also uses `#/project/{id}` for the location panel. Viewports 1440×1000 (all engines) and 390×844, `forcedColors: active`.

Flows (test 1): empty/idle panel with run disabled and a stated reason; record “Documents → 매일” (one `applyFeedbackLog`, no proposal, Rust-stamped plan id in the stored row, accepted binding and location row unchanged); run → published draft with cause `feedback:frequency:v1 / swapped_depth`, two moves, preserved all kept, no-decision text, reproduction details; same request → still one command; new budget → second command, same draft id, different request digest; held proposal + cancel → `cancelled`, late reply ignored (`data-ignored=1`), plan and locations unchanged; cached answer returns without a command; open draft (not adopted); adopt; the entry reads as recorded for another plan; reload keeps the record. Test 2: a confirmed location stays byte-identical through cancel and a real proposal (cause cites the claim as context), then reads `staleConfirmation` only after the draft is adopted. Test 3: no-plan `empty` state and no form; Rust refusals `frequency_unchanged` and `duplicate_feedback` store nothing; `noChange` with `noBetterSlot / already_ordered`; withdraw turns the run off; keyboard-only item select, note typing, Enter on record and run (maintenance rule cause); reload keeps two entries; a changed input shows the stale notice and disables run; 390px has no horizontal overflow; forced colors keep the panel; deleting the project removes the `feedbackLogs` row. Console `error`/`pageerror` lists and non-local requests were empty in all three tests.

Artifacts: no screenshots or baselines were created. Phone and discrete GPU were not available and are UNVERIFIED; viewport/forced-colors/keyboard runs are desktop browser emulation.

## Contract-change advisory

New commands `applyFeedbackLog`/`proposeFeedbackReorganize`, events `feedbackLogApplied`/`feedbackReorganizeProposed`, DTOs (`FeedbackLog`, `FeedbackEntry`, `FeedbackAction`, `FeedbackKind`, `FeedbackLogReply`, `ProposalBudget`, `ProposalReply`, `ProposalOutcome`, `FeedbackCause`, `CauseOutcome`, `SwapKind`, `ObservedClaim`, `ProposedMove`, `CheckChange`, `Preserved`, `Reproduction`), and two base-capability names. `BUILD_ID` stays `zari-domain-7`; schema/protocol/canonical/rule/export versions unchanged; document `dbVersion` stays 2; live `DB_VERSION` is 6 (additive store + `migration:5->6`, no existing bytes read or rewritten). Existing fixture expected bytes and the 124-entry manifest are unchanged.

## Known limits

- The draft is a finite neighbourhood of position exchanges, not a re-search. Discomfort that exchanges cannot fix ends as `noBetterSlot` or `blocked` with the reason; it never looks solved. Sample plans from the stock search rarely hold a frequency inversion, so the browser flow uses a draft-edited sample and a frequency feedback.
- Depth is the distance from the opening plane; the access rule weighs only that and frequency. Lateral reach, weight, and the one-action rule are not weighed.
- Feedback never edits an input fact; a changed real frequency still needs the person to edit the input.
- Candidate evaluation cost grows with the layout size; the budget (1–128, default 16) bounds it. A 64-placement, 80-entry run finished in about 3 s in a debug build.
- Timing flakes under host load were observed in pre-existing tests (one Rust p95 gate, two real-WASM `session.test.ts` waits, one WebKit run); each passed on rerun with no change to a test or a threshold. Reported as observed, no retries added.
- Phone and a discrete GPU are UNVERIFIED. CodeQL results come from CI on the supervisor's PR.

## Out of scope

The next z-node, full re-search, shape or container replacement, automatic discard/purchase recommendations, automatic input updates, cloud sync, photos, deriving feedback from location observations, `BUILD_ID`/schema/version bumps, approved-baseline changes, and rewriting preserved fixtures or prompts.
