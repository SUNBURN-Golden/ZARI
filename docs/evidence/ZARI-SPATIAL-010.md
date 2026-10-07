# ZARI-SPATIAL-010 evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. There is no new screenshot. Nothing here is an approved baseline or a physical measurement.

- Task: GitHub issue #61, node 010, “Rust 다음 확인 사실 query와 입력 안내 연결”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-010`.
- Observed base SHA: `f1043bebb38f68e3e38f1df082aad4e99dd6990a` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs: `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md` §§2–7; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`. SP-008 and SP-009 evidence, ADRs, and D008/D009 were read as the current HEAD. Candidate and NON_EXECUTABLE program drafts were not used as extra scope.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 about 07:28 KST, verbatim: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라." Recorded in `design/DECISIONS.md` D010 and `docs/adr/SP-010-completion-query.md`. This delivery implements SP-010 only. SP-011 is not implemented here.

## What changed

`queryNextFacts` is a pure read. It dedupes one fact to one row, keeps every related current check, and orders by priority class, related current check count, then canonical fact key. Pass and NotApplicable are not rows. A missing snapshot lists input completeness only. A stale or historical binding returns `stale` and no rows. Conflict comes only from a structured current check or `UnknownReason::ConflictingSources`. `Evidence.note` stays a claim. The query does not search, reprice, re-finalize, or write activation, counters, or storage. Crossing 512 rows, 2048 check refs, or 5 MiB fails the whole reply with `completion_limit_exceeded`.

The handler, generated DTO, schema, TypeScript, Worker entry, and client ship together. `BUILD_ID` is `zari-domain-6`. `queryNextFacts` is the capability immediately before `disposeProject`. An unknown operation is still `operation_not_supported`.

The project page shows that list. One lease is the project, input digest, snapshot id, catalog digest, raw generation, Worker, and mount. Opening asks once. Focus and keystrokes do not ask again. A late or foreign reply does not paint. Explicit “다시 확인” asks for the committed source. A measurement row opens the SP-009 field. A catalog row goes to `#/catalog`. An unsupported or unrouted row does not invent an editor.

## Changed paths

- Adoption: `docs/adr/SP-010-completion-query.md`, `design/DECISIONS.md` (D010), a short SP-010 note in `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`.
- Rust: `crates/core/src/next_facts.rs`, `crates/core/src/completion.rs`, `crates/core/src/protocol.rs`, `crates/core/src/lib.rs`, `crates/core/src/measurement.rs`, `crates/core/tests/completion_query.rs`, `crates/core/tests/protocol.rs`.
- Generated, not hand-edited: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`. `npm run wasm:build` then `npm run contracts:generate`.
- Client: `apps/web/src/worker/client.ts`, `scripts/bench-fixtures.mjs`.
- UI: `apps/web/src/features/project/nextFacts.ts`, `nextFactsGate.ts`, `NextFactsList.tsx`, `session.ts`, `DetailPanel.tsx`, `apps/web/src/app/ProjectScreen.tsx`, `apps/web/src/styles/project.css`.
- Tests: `apps/web/tests/unit/nextFacts.test.ts`, `session.test.ts`, `capability.test.ts`, `client.test.ts`, `searchPump.test.ts`, `transfer.test.ts`, `apps/web/tests/browser/next-facts.spec.ts`.
- Fixtures: seven new `fixtures/domain/mc-*.json` files and their `fixtures/manifest.json` entries. The other 117 fixture JSON files change only `engineContext.buildId` from `zari-domain-5` to `zari-domain-6` (plus 117, minus 117, other lines 0).
- Living docs: `docs/WASM_PROTOCOL.md`, `docs/TEST_STRATEGY.md`, `docs/IMPLEMENTATION_STATUS.md`, this file.

`Cargo.lock` is unchanged. No new dependency. `.aiops/**` and `docs/aiops/**` were not edited. SP-008 and SP-009 evidence and ADRs were not rewritten.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| MC-07 one fact, every related check, notes are not numbers or conflicts | `completion_query.rs` `shared_fact_keeps_every_check_and_ignores_notes`; `fixtures/domain/mc-07-shared-fact.json`; native and Worker parity |
| MC-09 catalog ids are read, not written; price stays a procurement row when purchase is off | `catalog_and_arbitrary_ids_are_read_only`; `mc-09-catalog-source.json`; `mc-12-purchase-not-pass.json` |
| MC-10 stale binding returns no current checks | `missing_snapshot_lists_input_only_and_stale_borrows_nothing`; `mc-10-stale-binding.json` |
| MC-12 input-only, historical stale, and the whole-query limit | `mc-12-input-only.json`, `mc-12-historical.json`, `mc-12-limit.json`; `limits_fail_the_whole_query_without_a_short_list` |
| Shuffle-invariant order | `shuffled_checks_keep_priority_then_count_then_key` |
| Removing evidence does not invent a pass | `evidence_removal_does_not_invent_a_pass_or_drop_a_failure` |
| One completed fact does not clear the others | `one_completed_fact_does_not_clear_the_other_rows`; browser recompile leaves other rows and does not say 계획 통과 |
| Old reply never paints the current list | session hold/foreign tests; Chromium, Firefox, and WebKit hold test. Requests stay 1 across edits |
| Keyboard and touch keep the selected source and do not write | `next-facts.spec.ts` arrow, tap, and the edit-before-commit revision check in `session.test.ts` |
| No catalogue mutation or guessed geometry | destination unit test; unsupported and unrouted rows do not open a nominal field |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. Browser commands used `--workers=1` because other jobs were using the machine. That does not change timeouts. The final Chromium suite was one run. An earlier run on a previous tree failed four tests; those causes were fixed before this run and that run is not the result below.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 109 passed, 1 ignored. core lib 29, bootstrap 9, completion query 12 passed and 1 ignored emitter, domain 11, edit 6, protocol 17, validator 11, search 14. Doc-tests 0 |
| `cargo test -p zari-core --locked --offline --test completion_query warm_query_p95 -- --nocapture` | exit 0. `SP010_QUERY_P95_MS=4.469` (target ≤ 20) |
| `cargo run -p zari-core --locked --offline --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --offline --example fixture_runner -- fixtures` | exit 0, 124 fixtures, including the seven `mc-*` ids |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver` |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:generate` | exit 0. “Generated 4 Rust contract artifacts; 124 fixture structures valid.” |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 17 files, 130 tests |
| `npm run build` | exit 0. Production dist after the final UI tree |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, `buildId` `a76d35300980fba4`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 10 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium --workers=1` | exit 0. 73 passed (2.1m). No `worker-state` flake |
| `npx playwright test apps/web/tests/browser/next-facts.spec.ts --project=firefox --project=webkit --workers=1` | exit 0. 10 passed (16.5s): Firefox 5, WebKit 5 |
| `npm run test:parity` | exit 0. 2 passed (21.4s). “124 shared fixtures.” |

## Browser

Route: `#/project/<id>` after create. Desktop, then 390×844 and 1280×800 inside the new spec. Chromium full suite, plus Firefox and WebKit for `next-facts.spec.ts` only. Flows: browse the input-only list, keyboard and tap to `space.interior.width`, enter nominal, bounds, and a note that says `NOTE_TOKEN_91mm`, confirm the request count stays 1, CAS save, explicit recompile, the width row is gone, other rows remain, a second recompile does not ask again. Hold drops the late reply. Limit injection shows no rows. Worker crash and retry restores a real list. Each new spec asserts `pageerror` and console `error` are empty. No new screenshot was kept.

`data-next-facts-roundtrip-ms` on the final Chromium suite was 11. The same spec logged 7 on Firefox and 6 on WebKit. That number is the Worker round trip for `queryNextFacts` (transport and decode of the reply). It is not the Rust p95. The spec also logged click-to-edit wall times of 365 ms (Chromium), 596 ms (Firefox), and 652 ms (WebKit); those include filling the nominal, both bounds, and the note, so they are not a render stage. A separate list-paint timer was not added.

The final Chromium suite left `docs/evidence/ZARI-SPATIAL-001-unknown-offset.png` and `docs/evidence/ZARI-SPATIAL-001-yaw-offset.png` unchanged. sha256 remains `49bce0b45c0904f6909da6b5ae71729ff40292c7f1951076da1af003010f8098` and `89c2d07ed9a4c3436db69c0b02904124e89b1c20fb2e4f44917adec6b6bfea28`. No checkout was required.

## Parity

Native `fixture_runner` and the Chromium Worker agreed on 124 fixtures, including `queryNextFacts`.

## Timing

| Stage | Result |
|---|---|
| Warm Rust query p95 | 4.469 ms. Target ≤ 20 ms. 8 warmups, 40 samples |
| Worker round trip | 11 ms Chromium, 7 ms Firefox, 6 ms WebKit. Not the Rust p95 |
| List render | Not instrumented separately |

## Contract advisory

Generated contracts changed. `BUILD_ID` is `zari-domain-6`. The capability list gained `queryNextFacts` immediately before `disposeProject`. `protocolVersion` and persisted `schemaVersion` stay 1. Existing fixture expected sections changed only on the build-id line. An old page and a new Worker, or the reverse, fail the existing exact build-id and capability handshake. A missing operation is `operation_not_supported`.

## Deviations

A soft check on an already complete fact stays a row. Its need is the frozen `repairKnownFailure` value, its priority is soft, and its action is `requestSupportedScope`, so the panel does not offer measuring as the way to clear a preference. `classify_check` is unchanged. An unrouted structured path such as `constraints.hardBudget` keeps its field ref and uses `requestSupportedScope` instead of a text row.

## Known limits

Phone hardware and a dedicated GPU were not available. They are UNVERIFIED. Browser viewports are not a substitute.

SP-011 is not implemented. SP-007 3D label overlap is unchanged. There is no data migration. PR #38 was not edited. The local browser runs used one worker. Timeouts were not raised. The final suite was not retried.

## Out of scope

SP-011, inventory CRUD, catalogue ingestion, automatic Confirmed or confidence, LLM geometry, paid or external upload, and any change to snapshot, rule, hash, or BOM meaning.
