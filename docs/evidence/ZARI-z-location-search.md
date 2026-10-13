# ZARI-z-location-search evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #102, node z-location-search, “내 물건 찾기와 정리 후 위치 검색”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-location-search`.
- Observed base SHA: `2cb3ceccd8753f755a8ef34ff471eccae35e019d` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`; `docs/MASTER_PROMPT_KO.md` §§7–14,24; `docs/RUST_ADDENDUM_KO.md`; `docs/MEASUREMENT_COMPLETION_DESIGN_KO.md`; `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Previous node evidence and ADRs (z-inventory-lifecycle, z-execution-checklist, z-purchase-handoff) were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**`, `docs/aiops/**`, and `.github/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-location-search, `docs/adr/SP-z-location-search.md`, a scoped note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, and `design/SPATIAL_WORKSPACE.md` §8. This delivery is z-location-search only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, payment, cloud, photo consent, or release.

## What changed

The node adds a local, per-project location index. Rust is the single authority for what an observation means, for the planned-vs-actual split, and for row construction; the browser persists and renders, and never stores a planned location as an actual one.

- `crates/core/src/location_search.rs` (new): `LocationLog` (append-only `LocationObservation` list; kinds `confirm`, `relocate`, `reorganize`, `lost`, `alias`), `LocationAction::Record`, `LocationLogReply`, `LocationSearchReply`/`LocationRow`. Validation: NFC-folded bounded labels, observation-id reuse and duplicate rules, `location` required for `relocate`/`reorganize` and forbidden otherwise, unit ordinals bounded by the item's known quantity (an unknown or zero quantity cannot carry ordinals), `confirm` requires a planned location for every covered unit, `confirm` binds to the adopted `PlanSnapshot` id at record time — the wire `planSnapshotId` is never trusted, Rust stamps it. Search folds names, recorded aliases, categories, quantity, and planned/observed location text; rows are maximal unit runs sharing one `(planned, observed)` state — same-name items stay in separate rows, split unit groups stay in separate rows, and a 128-row cap truncates instead of merging. `confirm` observations replayed against a different snapshot id are `staleConfirmation`, not current. Execution completion writes no observation.
- `crates/core/src/protocol.rs`: commands `queryLocationSearch` and `applyLocationLog`, events `locationSearchQueried` and `locationLogApplied`, stateless under the system identity like the inventory and query commands. `CAPABILITIES`/`COMMAND_KINDS` keep their existing order with the two names inserted before `applyInventoryLedger`/`disposeProject` in the same positions the Command enum uses. `BUILD_ID` stays `zari-domain-7`; schema/protocol/canonical/rule versions stay 1 / `zari-domain-v2`. Existing tests `protocol.rs`, `product_completion_contract.rs`, `inventory_lifecycle.rs` were updated to the new ordering only.
- `apps/web/src/persistence/db.ts`: live `DB_VERSION` 4 → 5, additive `locationLogs` store (`logId, updatedAt`), `LocationLogRow`, `readLocationLogRow` (malformed rows are corruption, not silent data), and the `migration:4->5` journal. `apps/web/src/persistence/repository.ts`: `getLocationLog`, CAS `saveLocationLog`, and `deleteProject` deletes the `locationLogs` row in the same transaction as the other stores. Location logs are not `PlanSnapshot` bytes, not input rows, and not exportVersion-1 data.
- `apps/web/src/worker/client.ts`: expected reply map and `WORKER_CAPABILITIES` extended to match Rust.
- `apps/web/src/features/location/`: `controller.ts` (worker call + CAS save; only `changed: true` logs persist; `operationFailed` surfaces the code), `phrases.ts` (status/kind/planned/ordinal text — `plannedOnly` is “계획 위치 · 미확인”, never the confirmed wording), `LocationPanel.tsx` (search form, observation form, rows, `location-status` `data-state` pending/empty/read/saved/error, no-input, empty, and no-results states). `ProjectScreen.tsx` mounts it with `state.normalizedInput` and `state.plan.acceptedSnapshot`. `project.css` reuses existing tokens; no new color pair or contrast case.
- Fixtures: nine case files under `crates/core/tests/fixtures/location_search/` covering planned-only vs confirmed, no-plan observation, mismatch + relocate, stale confirmation, alias index, duplicate names, partial units, unknown quantity, and record rejections. They are domain-test fixtures, not the top-level `fixtures/` manifest set — `fixtures/` bytes and the 124-count manifest are unchanged.
- `scripts/check-product-contract.mjs`: the `DB_VERSION` pin 4 → 5, the same update the z-inventory-lifecycle and z-purchase-handoff bumps made.

## Changed paths

- Adoption: `docs/adr/SP-z-location-search.md`, `design/DECISIONS.md` (Dz-location-search), a z-location-search-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`, a scoped note in `design/SPATIAL_WORKSPACE.md` §8.
- Rust: `crates/core/src/location_search.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`.
- Rust tests/fixtures: `crates/core/tests/location_search.rs`, `crates/core/tests/fixtures/location_search/*.json` (9 files); ordering assertions in `crates/core/tests/protocol.rs`, `product_completion_contract.rs`, `inventory_lifecycle.rs`.
- Web: `apps/web/src/persistence/db.ts`, `repository.ts`, `apps/web/src/worker/client.ts`, `apps/web/src/features/location/{controller.ts,phrases.ts,LocationPanel.tsx}`, `apps/web/src/app/ProjectScreen.tsx`, `apps/web/src/styles/project.css`.
- Generated: `apps/web/src/contracts/generated/{dto.ts,schema.json,validators.mjs}` regenerated by `npm run contracts` (never hand-edited); `docs/product-expansion/contract.json` `baseCapabilities` (+2 names only).
- Tests: `apps/web/tests/unit/location.test.ts`, `apps/web/tests/browser/location-search.spec.ts`, plus `repository.test.ts` and `transfer.test.ts` (v5 migration journal + `db:verno` expectations). `apps/web/tests/unit/session.test.ts` additionally carries the flake fix described under "Second supervisor re-verification failure" below: `until` and the two hand-rolled deadline loops now budget on `performance.now()` (monotonic) instead of `Date.now()` (wall clock), and a regression test asserts a session wait survives a +1 h `Date.now()` step. No timeout value, predicate, or test body changed.
- Checker: `scripts/check-product-contract.mjs` (`DB_VERSION = 5` pin).
- Living docs: `docs/IMPLEMENTATION_STATUS.md`, this file.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `.github/workflows` were not touched. The two `docs/evidence/ZARI-SPATIAL-001-*.png` files a capture run rewrote were restored with `git checkout`. No new dependency.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| An unexecuted planned location is never the actual location | Rust: `confirm_without_a_plan_is_rejected_and_never_turned_actual`, fixtures `planned-only-vs-confirmed.json`, `no-plan-observed.json`. Row statuses `plannedOnly`/`unlocated` carry no `observed` ref; execution completion records nothing. Browser: the spec asserts every pre-observation row is `plannedOnly`/`unlocated` and no row shows the confirmed wording |
| Same-name items and partial quantities are never merged | Rust: `same_name_items_and_partial_quantities_stay_separate`, `row_cap_truncates_instead_of_merging`; fixtures `duplicate-names.json`, `partial-units.json`. Rows key on `(itemId, unitOrdinals)`; a relocate of unit 1 leaves unit 0's row untouched (asserted in the browser spec by separate `location-row-item-a-0`/`item-a-1` rows) |
| Project deletion removes search residue | Unit: `repository.test.ts` saves a log, deletes the project, asserts `getLocationLog` is null. Browser: the spec records an alias, deletes the project through the real UI, and reads `zari-local`/`locationLogs` via raw IndexedDB — the row is `undefined` |

Required outputs map to: local location index + search UI → `LocationPanel` + `queryLocationSearch` (all three engines); snapshot-vs-observation discrepancy fixtures → the nine `location_search` fixture files and the Rust tests that read them. Additional cases covered: stale snapshot confirmation (`stale-confirmation.json`), lost items (`lost` kind), reorganize, alias indexing (`alias-index.json`), unknown quantity never becoming zero (`unknown-quantity.json`), and malformed observation rejections (`record-rejections.json`).

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node` v24.19.0, `npm` 11.x, `rustc` 1.98.1 via `rust-toolchain.toml`, wasm-bindgen 0.2.128. Playwright timeouts were not raised.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 after three fixes (`double_ended_iterator_last`/`filter_next` → `rfind`, `collapsible_if`, `needless_borrows_for_generic_args`) |
| `cargo test --workspace --locked` | exit 0, 215 tests green. New `location_search.rs`: 8 passed |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git status fixtures/` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. No new dependency |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” Generated files regenerated, not hand-edited |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | Final tree, latest full run: exit 0, 31 files, **199 tests passed (188.3 s)**, 1-min load avg ≈ 13. The +1 test is the monotonic-clock regression test in `session.test.ts`. Earlier runs on the same tree: the v4→5 bump first required the established `db:verno`/checker pin updates (`transfer.test.ts`, `check-product-contract.mjs`); a later run failed 1 of 198 in `session.test.ts` (“cancelled search can be restarted”, then “strategies and a real WASM search…” 22 s with the search still `running`), and a standalone `session.test.ts` run failed 1 of 34 (“a layout edit is re-verified by Rust…” 28 s). Each is a real-WASM search test with a fixed wait and none touches the location feature; the full-suite rerun above passed all of them without retries or timeout changes |
| `npm run build` | exit 0. The pre-existing chunk-size warning is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `7d00136785426fce`, 11 assets |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 self-tests; 39/39 contrast cases. No new token or contrast case |
| `node scripts/check-product-contract.mjs` | exit 0. 16 ids unchanged, chain one snapshot, 124 fixtures unchanged, runtime hits 0 |
| `npm run test:browser -- --project=chromium` (official filter: no `@parity/@capture/@bench`) | Final tree at moderate load: exit 0, **108 passed, 0 failed (4.9 m)**; sampled 1-min load avg 8.7, max 12.4. Latest final-tree run after the second supervisor failure: exit 0, **108 passed, 0 failed (5.5 m)**, 1-min load ≈ 8. Between those green runs, two same-tree full runs under external saturation failed 99/9 (13.8 m, load ≈ 45) and 93/15 (11.0 m, load spike ≈ 60) — all `Test timeout of 30000ms exceeded`/teardown timeouts in pre-existing specs, disjoint-ish sets, `location-search.spec.ts` green in every run; the first 9 all passed in isolation (4.0 m). See both failure analyses. `@capture` specs need `ZARI_CAPTURE_DIR` (unset) and are excluded by the script |
| `npx playwright test location-search.spec.ts --project=chromium` | 2 passed (part of the 108 above) |
| `npx vite build --mode test` + `npx playwright test location-search.spec.ts --project=firefox` | exit 0, 2 passed (31.4 s) |
| `npx playwright test location-search.spec.ts --project=webkit` | exit 0, 2 passed (35.9 s) |
| `npm run test:parity` | exit 0. 2 passed (37.4 s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

Development-time failures already folded into the table/code: a `state.take()` in the equal-run merge consumed the unit state (0 rows); `&Id == Id` compile error; `acceptedSnapshot` lives under `state.plan`; an unused `LocationRow` import; `react-hooks/exhaustive-deps` is not installed (comments removed); a JSON rewrite of `contract.json` reformatted the file and was reverted to a targeted edit; a temporary debug test was removed.

## Browser

Route: `#/` → create project → fill sample → commit input → plan → compute → accept card 0 → back to `#/project/{id}` → location panel (test 1); `#/` → create → fill-sample → commit → location panel → projects → delete (test 2). Chromium full suite plus the new spec on all three engines. Viewports 390×844 and 1280×800 inside the spec; `forcedColors: active` run included.

Success: rows list planned/unlocated units before any observation; a name query (`coats`) narrows to item-a rows only; a no-match query shows the honest no-results state; relocating unit 1 to “현관” splits it into its own `observed`/`mismatch` row while unit 0 keeps its separate row; the observation survives a real reload through IndexedDB; an `alias` observation makes the item findable by “패딩” with the `별칭 패딩` marker; deleting the project leaves no `locationLogs` row.

Failure paths checked: rejected observation surfaces the Rust code in `location-error` (`data-reason`) with `data-state="error"` and nothing is saved (unit test `a rejected observation is a failure, not a save` asserts zero saves); the empty, pending, no-input, and no-results states render as text. Console `error`/`pageerror` lists were empty in both spec tests.

Keyboard: search submits on Enter inside `location-query`; the observation form is a real form with a real submit button. All engine runs are desktop emulation; phone and discrete GPU were not available and are UNVERIFIED.

## Supervisor re-verification failure analysis

The supervisor's `npm run test:browser -- --project=chromium` failed twice on this tree: 24 failures in 7.1 m (many `page.goto: net::ERR_CONNECTION_REFUSED` at the preview port, i.e. the preview server was gone) and then 12 failures in 27.6 m. The earlier nodes' supervisor logs for the same command show 100/100 (4.6 m), 101/101 (4.1 m) and 106/106 (5.0 m).

What was checked, and what was found:

- **Host load.** At the start of the fix session the host reported load average 11.4 / 82.6 / 100.2 on 8 cores, with other builders' `cargo`, `tsc`, `vite` and several Chromium instances running. A 27.6 m suite versus 4–5 m is the same tree running roughly six times slower; the 12 failures (`a11y`, `accessibility-workspace`, `catalog`, `detail`, `drag`, `edit`, `eval-continuation`) are mostly among the first tests scheduled, and timed out after 1.3–1.7 m (one after 6.1 m) waiting for `worker-state`, `save-state`, or `search-status`.
- **The failing set is not stable.** Run 1 failed 24 tests, run 2 failed 12, my own rerun at a lower but still high load failed 3 (`drag.spec.ts:374`, `edit.spec.ts:157`, `execution-checklist.spec.ts:51`), and the rerun at a calmer load failed 0. None of the failures is in `location-search.spec.ts`.
- **Failure mode.** Pre-existing plan-search tests wait for `search-status` to reach `done` (60 s). A search runs 256-job `stepSearch` steps one at a time and the pump watchdog (`SearchPump.armWatchdog`, 10 s without progress) retires a stalled search as `interrupted` (`search_stalled`). Under CPU starvation either the 60 s wait or the 10 s watchdog is exceeded. Their values were not changed.
- **No slowdown from this change.** The same tests take the same time on this tree as in the earlier nodes' passing logs: `accessibility-workspace:78` 14.6–19.5 s there, 16.6 s here; `drag:374` 16.2–19.1 s there, 16.8 s here; `edit:157` 14.6–18.4 s there, 15.4 s here. The change adds no code to `PlanScreen`, `SearchPump`, or the worker step path. `LocationPanel` mounts only on the project editor route and makes one `queryLocationSearch` per input or snapshot change over the shared worker's serial queue (the same pattern as `InventoryPanel`).
- **Isolation and rerun.** The three tests that failed in my rerun passed in isolation (49.2 s total, 1 worker), and the full official command then passed 108/108.
- **Host clock.** Twice in this session a command's wall clock advanced about an hour while `uptime` advanced about two minutes (`18:25` → `19:22` against `up 8:15` → `8:17`). Timer-based waits and watchdogs in these tests are sensitive to such pauses.

Conclusion: no product or test defect specific to this node was found; the failures are host-contention timing flakes in pre-existing tests. No test was skipped, deleted, or marked `.only`/`.fixme`, no timeout or threshold was raised, and no retry was added. A rerun while other jobs are saturating the host can fail the same way; the pass criterion used here is the full official command on the unchanged final tree at moderate load.

## Second supervisor re-verification failure (`npm test`, `session.test.ts`)

The supervisor's second pass failed exactly one of 198 unit tests: `a worker crash mid-search is interrupted, not a completed result`, with `timed out waiting for session condition; last="idle"/ready worker=ready context=installed search=running progress="5127" pending=null polls=21` at (pre-fix) `session.test.ts:517`. That line is the test's last wait — `until(s.plan.search === 'done', 30000)` after a successful crash-interrupt and `controller.recover()`. The snapshot shows a healthy recovered state: the crash interrupted the search, the worker was restarted, the context was reinstalled, and a fresh search was running (5127 work units consumed) when the wait died.

- `polls=21` in a 30 000 ms budget is the fingerprint of the wall-clock step documented above, not of a 1.4 s/poll starvation: the loop ran ~21 × 20 ms ≈ 0.4 s of real time before `Date.now()` jumped past the deadline. A second mechanism with the same signature — the host pausing the whole process for minutes — cannot fire `setTimeout` deadlines early and is excluded by the healthy `worker=ready context=installed` state.
- `worker=ready`, `context=installed`, `search=running` rule out a crash-propagation defect: a dead port would have left `worker=failed`/`context=none`, and a wedged search would have hit the 10 s pump watchdog → `interrupted`. The search was making real progress when the wait expired.
- The same `Date.now()` deadline pattern exists in every `until` call and two hand-rolled loops in `session.test.ts` — the only unit-test file with deadline waits (grepped). This is why the failure can pick a different test each run: whichever `until` is in flight when the clock steps loses its budget instantly.

Fix (test-only, no product code): `until` and the two manual deadline loops now budget on `performance.now()` (monotonic, immune to system-clock steps); budgets, predicates, and test bodies are unchanged, and a new regression test `a system clock step does not expire a session wait` mocks `Date.now()` +1 h mid-wait and asserts the session still installs its context. After the fix the full `npm test` passed 199/199 on the final tree.

Two later full Chromium runs of the official command on the same tree failed 9/108 and 15/108 — a different, non-stable set each time, all `Test timeout of 30000ms exceeded` / teardown timeouts in pre-existing specs while external jobs drove the 1-min load to ≈ 45 and ≈ 60 (suite time 13.8 m / 11.0 m vs 4.9 m at load ≈ 9). `location-search.spec.ts` passed in every run, all 9 first-batch failures passed in isolation, and a subsequent full run once external load settled (1-min ≈ 8) passed 108/108 in 5.5 m. Same conclusion as above: host-contention flakes, reported truthfully, no test edited, skipped, retried, or given more time.

## Contract-change advisory

New commands `queryLocationSearch`/`applyLocationLog`, events `locationSearchQueried`/`locationLogApplied`, DTOs (`LocationLog`, `LocationObservation`, `LocationAction`, `LocationLogReply`, `LocationSearchReply`, `LocationRow`, `ObservedRef`, `PlannedRef`, `LocationStatus`, `ObservationKind`, `PlannedKind`), and two base-capability names. `BUILD_ID` stays `zari-domain-7` (prior capability additions did not bump it). `schemaVersion`/`protocolVersion`/`canonicalVersion`/`ruleVersion`/`exportVersion` unchanged; document `dbVersion` stays 2; live `DB_VERSION` is 5 (additive store + `migration:4->5` journal; no existing bytes are read or rewritten). Existing fixture expected bytes and the 124-entry manifest are unchanged; the nine new fixtures live under `crates/core/tests/fixtures/location_search/` outside the manifest set.

## Known limits

- Search text is NFC-folded substring matching — it does not rank, typo-tolerate, or search globally across projects.
- `confirm` with empty ordinals covers every unit and fails closed (`confirm_needs_plan`) when any unit lacks a planned location; the UI surfaces the code as error text.
- Rows cap at 128 (`truncated` flag shown); there is no pagination.
- `alias` observations index the alias label only; renaming the item itself stays in the draft.
- Timing flakes under host load were observed in pre-existing real-WASM tests (unit `session.test.ts`; Chromium `plan`, `drag`, `edit`, `execution-checklist`, and others in the supervisor runs). They pass in isolation and in a full rerun at moderate load; see “Supervisor re-verification failure analysis”. Reported as observed, no retries or timeout raises.
- All viewport/forced-colors/keyboard runs are desktop browser emulation. Phone and a discrete GPU are UNVERIFIED. The known create-project worker-state flake appeared as `worker-state` timeouts in the supervisor’s overloaded runs and not in the final full run; reported as observed.

## Out of scope

The next z-node, cross-project/global search, cloud sync, ranking or fuzzy matching, photo-linked locations, external purchasing, `BUILD_ID`/schema/version bumps, and rewriting preserved fixtures or prompts.
