# ZARI verification and review contract

The detailed numerical oracle in [COMPILER_WALKTHROUGH.md](COMPILER_WALKTHROUGH.md) and interaction cases in [WORKSPACE_BLUEPRINT.md](../design/WORKSPACE_BLUEPRINT.md) extend the fixtures/evidence index below. Implement their relevant TRACE/UX IDs in the owning tasks; their presence in documentation is not an executed test. New full-domain assertions include catalog/search input identity, engine-only context staleness, normalization→CAS→fresh activation, direct-position/ordinal/offer bindings, multi-container group allocation, cavity clearances, staging headroom/support, explicit unsupported blocker parking, and SelectOffer snapshot re-finalization.

Status: planned tests and gates, not executed application evidence. Repository target: `46082a909c9210c7dbd0ee9946386dc18246108e`. At this target Rust/WASM/React, executable domain fixtures, application CI, and approved visual baselines do not exist. The existing design-token checker is not an application test suite.

Durable verification also covers `verifyRecord` digest mismatch, unsupported historical canonical version, and a deliberately rehashed invalid physical layout that must never become current merely through integrity verification. Catalog import exercises raw field normalization then atomic complete `validateCatalog`, preserves unknown/provenance and rejects an indivisible record above the Worker message cap without partial persistence.

Task005 proves system-identity verification from Worker Ready, including a historical snapshot whose corrupt/missing catalog prevents project activation. Task008 proves first-open catalog import from the project list without an active project. Both reject stale system responses after workflow abandonment or Worker restart; neither creates a hidden project or advances an input revision.

## Contents

1. Test ownership and command contract
2. Fixture format and expected-result authority
3. Rust deterministic and property tests
4. Native versus actual browser WASM parity
5. Worker, persistence, and user-flow testing
6. Preserved T01–T20 traceability
7. Visual, accessibility, and security verification
8. Performance targets and measurement method
9. CI evidence, review gates, and stop conditions

## 1. Principles and ownership

A test establishes only its stated assertion. Passing build, CI, snapshot, or browser tests does not establish correct architecture, physical safety, complete catalog truth, design approval, or production readiness.

- Rust unit/property tests own authoritative units, geometry, strategy semantics, quantities, BOM, checks, and snapshot invariants.
- TypeScript tests own UI reducer behavior, Worker context matching, repository transactions, presentation of authoritative values, and generated schema boundaries. No second production geometry solver in TypeScript.
- Native and browser runs consume the same fixture bytes. Actual browser WASM is mandatory; a mocked Worker cannot establish parity.
- The independent validator is tested directly with invalid layouts never emitted by the solver. Testing solver and validator together alone can preserve a shared error.
- Feature authors write tests, run the app, inspect the full diff, and correct failures in the same Devin session. Their self-review is not independent audit.
- Evidence belongs in the exact PR/CI run; `IMPLEMENTATION_STATUS.md` records durable capability/limitation changes and validated command availability, not task runtime transcripts.

## 2. Exact command contract

These are **commands to be introduced by implementation**, not commands claimed runnable today. Task 001 establishes the indicated minimum scripts and pinned compatible tools; no empty passing placeholders. Missing capabilities use an explicit not-yet-implemented status outside CI rather than successful no-op scripts. Later tasks extend the same commands without weakening earlier coverage.

| Command from repository root | First owner | Required meaning |
|---|---|---|
| `cargo fmt --all -- --check` | 001 | formatting of implemented Rust crates |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | 001 | lint native workspace; no blanket warning suppression |
| `cargo test --workspace --locked` | 001 | deterministic Rust units/integration; includes properties when introduced |
| `npm ci` | 001 | reproducible JS install from committed lockfile |
| `npm run contracts:generate` | 001 | generate Rust JSON Schema, TypeScript DTOs, and Ajv standalone validators |
| `npm run contracts:check` | 001 | regenerate Rust JSON Schema, TS DTOs, Ajv standalone validators; fail on committed drift |
| `npm run typecheck` | 001 | strict TypeScript compilation without emitting application code |
| `npm run lint` | 001 | frontend/Worker lint |
| `npm test` | 001 | Vitest UI/protocol unit suite, non-watch |
| `npm run wasm:build` | 001 | build actual `wasm32-unknown-unknown` module and matching wasm-bindgen output |
| `npm run build` | 001 | production web build including supported WASM artifact |
| `npm run test:parity` | 001 | native fixture runner versus real browser Worker/WASM on current fixture manifest |
| `npm run test:browser` | 001 | Playwright against built app; no app-server fallback that masks production build errors |
| `npm run dev -- --host 127.0.0.1` | 001 | start local app for Devin's manual browser verification |
| `node scripts/check-design-tokens.mjs --self-test` | existing | existing token declaration and contrast checks, retained |
| `npm run test:visual` | 007 | approved baseline comparisons; no update flag, fail visibly if invoked with required missing baselines |
| `npm run bench:browser` | 010 | staged timings on benchmark manifest; saves measurement artifact |

Task 001's fixture runner belongs to an executable test/example target in existing crates; do not create a general CLI crate solely for parity. The initial exact native command is `cargo run -p zari-core --example fixture_runner -- fixtures/bootstrap`; Task 004 introduces the solver fixture runner for solver cases. `test:parity` invokes the applicable native entry point and records the command in its evidence. `wasm:build` must report rustc, wasm-bindgen CLI/library pair, target and build profile. `npm run build` and Playwright scripts must agree on the WASM output path.

Scripts should invoke tools through pinned repository dependencies/toolchain. Task 001 verifies current official compatibility and records exact versions; this design intentionally does not invent future package versions. Browser installation is an explicit environment setup step (`npx playwright install chromium` for initial CI, then the other supported engines); failures are environment blockers, not passing browser checks.

## 3. Fixtures and expected-result authority

Introduce `fixtures/manifest.json` with fixture contract version and entries containing ID, case kind, input path, pinned catalog path if applicable, expected path/assertion type, supported runtime set, and stage/task introducing it. Each fixture envelope contains `fixtureSchemaVersion`, `caseId`, `operation`, authoritative `schemaVersion`, raw or normalized input, fixed engine context, and expected assertions. Unknown, not-applicable, estimated, and verified states remain explicit fixture data.

Use two complementary oracles:

1. **Small hand-computed cases** with reviewed expected quantities, positions, bounds, and check states. Numeric examples are checked independently of the algorithm under test.
2. **Property/metamorphic tests** with a tiny independent reference calculation where feasible. They test relationships and invariants over varied inputs rather than merely matching implementation output.

Golden JSON outputs are useful for cross-runtime regression, but do not generate and approve the expected result from the same implementation without independent assertions. A changed expected output requires a documented contract or bug-fix reason and reviewer inspection. Preserve historical failing inputs as regression fixtures.

Fixture examples use obviously synthetic IDs (`syn:...`), no genuine brands or purchase links. Initial catalog: about 20 varied synthetic variants, including deliberate unknown/invalid cases. Performance catalogs of 100 variants are a separate workload. Real catalog fixtures, when introduced, require redistributable field data and evidence; never put personal room photos or home inventory into committed test fixtures.

For coordinate fixtures, spell out all x/y/z values, inner frames, allowed orientations, actual support surfaces, obstacle boxes, openings, clearances, and uncertainty intervals. A width-only test must not implicitly claim full 3D validity. Task 001's row-width result is explicitly a boundary calculation, not a PlanSnapshot or full physical validation.

`fixtures/domain/offset-*.json` (introduced by ZARI-SPATIAL-008) are the hand-checked signed-offset cases: `0−0/+0=[0,0]`, `0−2/+3=[−2,3]`, `−2−3/+4=[−5,2]`, the exact ±20000 endpoints, out-of-range endpoints, a nominal outside PositionMm, a missing bound, an i64-overflow digit string, and a 17-request group cap. Their interval numbers are written by hand. The input digest is the canonical hash of a real run and is not the numeric oracle. `engineContext.buildId` for every fixture is the current `BUILD_ID` (`zari-domain-7`). Through SP-012, previously valid fixture and snapshot expected sections stayed byte-identical apart from that build-id line. SP-013 also changes snapshot digests and current-binding rule stamps, as recorded in §13. `fixtures/domain/mc-07-shared-fact.json`, `mc-09-catalog-source.json`, `mc-10-stale-binding.json`, `mc-12-input-only.json`, `mc-12-historical.json`, `mc-12-limit.json`, and `mc-12-purchase-not-pass.json` (introduced by ZARI-SPATIAL-010) pin `queryNextFacts`: one fact keeps every related check, catalog ids are read, a stale binding returns no current checks, a missing snapshot is input completeness only, and the row/check-ref caps fail the whole query. Row order, needs, and the limit code are the oracle. Source-stamp digests are canonical pins of that reply.

`fixtures/spatial/` holds `projectSpatialView` domain fixtures (`fixtures/manifest.json`, case kind `projectSpatialView`). `spatial-yaw-offset` is the hand-checked parent-yaw90 case: parent `(100,200,0)`, outer depth 400, offset `(10,20,5)`, child local `(30,40,0)`, extent 50×60×70, world min `(380,240,5)`, max `(440,290,75)`. `spatial-unknown-offset` keeps the cavity-local box and marks the world and top rectangles `offset_unknown`. `spatial-input-compartment` checks a normalized-input compartment and an item measuring frame. `spatial-digest-mismatch` and `spatial-source-decode-error` check integrity and bounded decode. The projection digest is the cross-runtime pin of the whole read model; the numeric cases above are asserted independently of that digest. Existing fixture expected outputs, snapshot digests, ids, BOM lines, and actions stay byte-identical. The only permitted edit on those files is re-pinning `engineContext.buildId` to the current `BUILD_ID`.

## 4. Rust unit and property architecture

### Scalar, normalization, and DTO cases

Cover `60 cm = 600 mm`, `0.1 cm = 1 mm`, non-integral millimetres rejected, minus signs/overflow/NaN/Infinity rejected, coordinate zero accepted, positive-dimension zero rejected, quantity zero known and preserved, unknown quantity distinct, pack quantity zero rejected, and string decimal parsing without float roundoff.

Test dimensional upper/lower bounds and checked intermediate arithmetic for area/volume, monetary subtotal, pack ceiling division, ordered quantity, surplus, owned quantity, and aggregate quantity. Test the overflow boundary rather than only small values. `ceil(5/2) = 3`, received `6`, surplus `1`; avoid `n+p-1` overflow where an equivalent safe computation exists.

Deserialize malicious/invalid JSON directly into public DTO boundaries to prove private Rust constructors cannot be bypassed. Test unsupported schema, unknown enum, wrong unit, unknown fields according to schema policy, `usize` leakage prevention, and large decimal counter/money round-trip through Rust → JSON → browser → IndexedDB → Rust.

### Geometry and independent validation

Directly submit: out-of-bounds by 1 mm, face contact with/without explicit clearance, overlap hidden in top view, obstacle along insertion corridor, opening narrower than body, insufficient external extraction clearance, upright-only rotation violation, missing/partial support, unsupported stack, child outside conservative interior, inner frame transform error, cyclic parent, duplicate item assignment, and load unknown versus known excessive load.

Uncertainty tests distinguish nominal fit from conservative fit. Reduce space by its uncertainty, enlarge product by its uncertainty, apply installation clearances exactly once. Unknown uncertainty cannot produce a conservative verified pass. Field provenance and verification status survive every round-trip.

### Properties

Use Rust `proptest` with explicit input bounds and deterministic seed recorded on failure. A normal CI run uses a fixed documented regression seed plus generated cases; retain minimized failing cases. Do not require one magic seed forever to prove correctness.

| Property | Assertion |
|---|---|
| Containment | every physically confirmed placement's conservative box lies within its valid parent interior and required clearances; conditional plans never claim this property without the required known bounds |
| Pairwise exclusion | evaluated same-level sibling occupied envelopes do not overlap in the reported nominal/conservative check basis; parent/child inclusion is handled separately |
| Quantity conservation | for each input item/group, assigned + explicitly unassigned equals known input quantity, without duplicate identity |
| Orientation | accepted orientation belongs to the exact entity's supported set |
| Support | every physically confirmed object is at its declared support plane with valid footprint and known applicable rules |
| Determinism | repeated native runs and candidate input permutation canonicalization produce identical reference output |
| Budget chunking | the same total budget split into different step sizes produces the same terminal reference result and consumed-work count |
| Monotonic evidence | deleting needed evidence cannot improve a check from unknown/fail to pass |
| BOM conservation | owned + purchased allocations explain placed count; ordered packs and surplus conserve physical units |
| Snapshot consistency | diagram placements, item assignments, BOM references, and action references resolve within one immutable body |

The monotonic-evidence property applies to evidence removal with otherwise unchanged facts, not an arbitrary constraint deletion. Increasing space may alter preference ranking, so do not assert unjustified global monotonicity of the solver's selected plan.

### Independence test rule

The validator may share scalar and coordinate types plus small pure geometric primitives with the solver, but it must not trust solver caches, precomputed success flags, candidate eligibility, or search traces. Test verification from serialized complete proposals only. Include mutations of a previously valid proposal that the solver never generates. Review imports/dependency edges in addition to test results.

## 5. Native/browser parity

`npm run test:parity` performs these steps:

1. Read one fixture manifest and record its digest, exact Git HEAD, pinned tool versions, and build profile.
2. Execute the native Rust fixture entry point, retaining raw authoritative JSON results.
3. Build actual WASM, serve the built web app, launch actual Chromium through Playwright, instantiate the production Worker, load that WASM, and run the same fixture bytes.
4. Assert the `.wasm` resource was fetched/instantiated and the expected module build identifier is present. The fixture path must invoke production normalization/evaluation functions; no parallel JS implementation or all-mocked Worker route.
5. Compare a defined Rust-generated canonical authoritative body. Exclude only explicitly nonsemantic execution telemetry: request ID, elapsed time, worker/session ID, device details, completion timestamp, and project binding when testing content identity. Keep catalog observation times, evidence states, check details, BOM, assignments, search scope/budget consumed and termination reason.
6. Save a path-based JSON diff and raw outputs on failure. Fail on extra/missing fields; do not sort away meaningful guide order or silently drop unknowns.

Task 001 covers normalization, width constraints, and pack arithmetic only. Task 002 expands the contract corpus. Tasks 003–004 add finalizer/solver fixtures; Task 006 must prove full snapshot parity. A parity-green bootstrap is not proof that unimplemented snapshot or search behavior is correct.

A browser fixture endpoint may be development/test-only, guarded from public production routes, but it must call the same production Worker/DTO path. Test-only fault injection can control ordering/crashes; it must not substitute fixture output for core computation. Native and WASM runs use equivalent deterministic search budgets, including same work-unit semantics. Wall-clock interrupted runs are compared only when the same explicit interruption point is reproduced; they are not equivalent to completed reference runs.

## 6. Worker and persistence testing

### Worker unit and real integration cases

| Case | Required evidence |
|---|---|
| Raw edit before normalization completes | old response rejected immediately by `editorEpoch`, even if `inputRevision` has not changed |
| A→B→A project switch | old A response rejected by activation ID |
| Worker recreated | old session response rejected; pinned input/catalog restored before new work |
| Requests finish out of order | only matching latest request context updates displayed authority |
| Catalog or rule context changes | old digest/version response never accepted |
| Cancellation during actual search | observable search work is running; cancel processed between bounded synchronous steps; acknowledged disposal; next search succeeds |
| Microtask starvation regression | scheduler yields through task queue; pending cancellation/event is serviced |
| Chunk-size invariance | 1, 16, and normal step batches with same total work budget return same reference result |
| Exhaustion | explicit `search_budget_exhausted`, work consumed and scope; never mathematical-impossibility claim |
| WASM trap/panic | old Worker terminated/discarded; candidate not accepted; committed input/snapshot preserved; recovery succeeds |
| Duplicate cancel/dispose | idempotent terminal response and no double-free or reused stale handle |
| Repeated lifecycle | create/search/cancel/switch/recreate loop has no unbounded live-handle growth |

Unit mocks can force delayed/stale responses deterministically. Actual browser tests must separately exercise real long-running stepped WASM and termination/recovery. Do not claim cancellation because a cancel message was sent. Record when the request was enqueued, last completed work unit, cancellation observation, and disposal acknowledgment. After a hard terminate, classify output as interrupted; do not fabricate a graceful cancellation acknowledgment from the dead Worker.

### Persistence cases

Task 005 implements real browser IndexedDB save/reload of raw and normalized measurements. Task 006 extends to immutable snapshot, diagram/BOM/guide, accepted binding, and catalog pins. Unit tests may use an IndexedDB test adapter; gates require browser storage too.

- Save incomplete numeric text; reload preserves raw value and invalid/stale state, not fabricated zero.
- Equivalent unit switch preserves semantic input revision after normalization.
- Close/reopen application context with same browser storage; no in-memory singleton supplies data.
- Two pages within one browser context race writes from the same revision; exactly one CAS commits. Losing page retains dirty input and offers copy/export.
- Inject a failed write midway through a transaction; project pointers and immutable rows remain coherent.
- Inject quota/unavailable failure; no saved indicator before actual commitment.
- Exercise counters above `Number.MAX_SAFE_INTEGER` as decimal strings.
- Corrupt one snapshot/hash; preserve unrelated data and expose recovery/export.
- Import unsupported schema, duplicate IDs, cycles, dangling references, oversized input, malicious names/URLs, and tampered digests; zero partial project rows.
- Reproduce historical plan after catalog update; old BOM/price does not mutate.
- Reaccept identical content at a later input revision; no implicit carry of old action progress.
- Exercise ordered schema migration fixtures, interrupted staging, blocked versionchange, and rejection of downgrade writes.
- Delete a project and verify its records/attachments are removed while shared catalog/library records remain.

Test fault adapters at the storage boundary for deterministic rare failure paths. Also run one actual concurrent browser transaction test; fake IndexedDB scheduling alone does not establish cross-tab safety.

## 7. Preserved acceptance traceability

The two source prompts remain unchanged. This table carries every master-prompt test into the execution plan; deferred extension tests are gates, not deleted requirements.

| Source ID | Assertion retained | First implementing task / evidence |
|---|---|---|
| T01 | 60 cm and 600 mm normalize identically | 001, native/browser fixture |
| T02 | 3×190 + 2×5 + 2×5 = 590 mm fits 600 mm width | 001 width-only; 003 full independent geometry fixture |
| T03 | 3×195 + 2×5 + 2×5 = 605 mm fails 600 mm width | 001 width-only; 003 validator fixture |
| T04 | inner 230 mm rejects upright item 240 mm although outer is 250 mm | 003 inner-capacity validator |
| T05 | body fits room but not front aperture | 003 supported straight insertion |
| T06 | obstacle overlap rejected | 003 validator, 004 solver proposals |
| T07 | forbidden orientation rejected | 003 direct invalid proposal |
| T08 | unsupported floating object rejected | 003 support surface |
| T09 | nominal vs conservative fit; unknown error distinct from zero | 002 scalars/evidence, 003 checks |
| T10 | owned 2 cannot become reused 3 | 003 quantity, 004 reuse candidate, 008 real purchase distinction |
| T11 | 5 required / pack 2 gives 3 packs, 6 received, 1 surplus | 001 arithmetic, 003 BOM, 006 UI |
| T12 | inner dimensions, price, shipping, inventory unknown remain separate | 002 DTO, 003 snapshot/BOM, 006 UI, 008 catalog |
| T13 | every known item assigned or explicitly unassigned, no duplication | 003 finalizer, 004 solver properties |
| T14 | one distinct feasible plan yields one alternative | 004 ranking/dedup, 006 comparison UX |
| T15 | rendered placements and BOM physical quantity agree | 003 snapshot invariant, 006 browser flow |
| T16 | save/reload retains input, strategy, assignment, placement, versions | 005 measurement subset, 006 complete snapshot |
| T17 | late stale response never overwrites newer edit | 001 minimal identity test, 005 full Worker lifecycle, 007 edits |
| T18 | save/import/AI-off/cancel/budget failures preserve project | 005 worker/storage, 008 import, 009 fault coverage; AI-off works by absence |
| T19 | opening sweep collision before drawer/lid primitive activation | future extension gate; v1 explicitly rejects unsupported primitives |
| T20 | sample→edit→strategy→calculate→replace→BOM→save→reopen | 006 first fixed-candidate slice, 007 editing, 008 catalog/purchase complete flow |

The complete first usable vertical slice requires Task 006 and its dependencies. Task 001 intentionally does not satisfy T16 or full T20; its output must not be advertised as the finished slice.

## 8. Browser, accessibility, and visual evidence

Applicable Devin tickets require: start app, open affected route, execute a successful path and important failures, inspect console/page errors and failed requests, record browser/tool version, and capture useful evidence. Component tests alone cannot close a user-facing ticket.

Measurement flow: keyboard-only input, unit change, unknown selection, empty/invalid/sub-mm input, field error association, focus on corresponding dimension line, saving/reload, and stale old plan. Editing: numeric and single-pointer alternative to drag, valid move, invalid move, provisional indication before Rust verification, selection not mistaken for validity, undo/redo, and stable unit scale across alternatives. Purchase view: placement count versus pack count/surplus, reuse, unknown totals, price observation time, current snapshot identity, and accessible source links.

Viewport matrix: 320 and 390 px mobile widths, 768 px tablet, 1280 and 1440 px desktop. Record viewport height/DPR too. Check horizontal overflow, mobile keyboard covering primary action, safe-area behavior, 200% zoom, long Korean labels, long product names, large integers, forced colors, reduced motion, visible focus, and modal focus return. Screen-reader smoke tests and human usability review complement automation; do not claim WCAG certification from axe or token contrast alone.

Initial CI browser is Chromium. Before Beta Readiness, execute supported critical flows in Playwright Chromium, Firefox, and WebKit and on at least one real Android Chrome/Samsung Internet or iOS Safari device representative of the intended user audience. Playwright WebKit is not evidence that a physical iPhone was tested. Record untested device/browser combinations and avoid universal support claims.

Visual baselines follow `design/baselines/README.md` and `manifest.json`. At architecture time approved count is zero. Captures are draft until the user or explicitly designated design approver approves exact evidence. Pin browser, OS/fonts, locale, theme, viewport, DPR, fixture, app SHA, and reduced-motion setting. Compare normal/selected/unknown/fail/stale/saving-error states. Test output must never invoke automatic baseline replacement to clear a failure.

Playwright screenshot comparisons depend on their execution environment; use the same pinned environment for baseline and comparison, and review real before/after/diff images. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)

A visual mismatch is not automatically a defect, and a match is not automatically desirable design. Verify domain interaction coherence and anti-dashboard rules separately against DESIGN.md. Storybook is optional later tooling, not the gate; the real app remains the integration evidence.

## 9. Security verification

Use synthetic malicious data, never real secrets. Validate import size/depth/record limits; strings containing HTML, script, Unicode controls, and oversized labels remain inert text. Reject dangerous URL schemes; imported links never trigger automatic fetch. CSV export tests cover `=`, `+`, `-`, `@`, leading whitespace/control characters and quoting so spreadsheet applications do not execute formula strings.

The local app must make no external AI/photo/telemetry request by default. Browser network assertions permit same-origin app/WASM assets and explicit user-opened HTTPS product links only. Test project names and home-item descriptions are absent from error telemetry/log transport. Do not embed credentials in bundles, fixtures, screenshots, or CI logs. A dependency/security advisory is reviewed with actual affected paths, not dismissed merely because code is local-first.

A future scraper has a separate SSRF and redirect/DNS boundary; its tests are prerequisite to enabling fetch, not evidence delivered by v1's URL-reference storage. A future AI adapter must test explicit data consent, scope minimization, cancel/failure behavior, and untrusted suggestion validation before it can change user input.

## 10. Performance targets and measurement

All figures below are provisional engineering targets, not achieved results or product claims. The user-facing architecture uses bounded work and supports cancellation even when these targets are missed. Do not change correctness, drop unknowns, shorten candidate scope without disclosure, or remove fixtures merely to hit a time target.

### Workloads

- `P-small`: 1 rectangular compartment, 20 synthetic variants, 5 placed containers, 20 atomic item instances, simple supported openings/supports.
- `P-reference`: 1 compartment, 100 variants, up to 20 containers, up to 100 known item instances across at most 20 groups, 4 obstacles and one established compartment floor plus applicable container floors, bounded candidate positions/profile.
- `P-adversarial`: same limits, many nearly fitting alternatives, conservative uncertainty, restricted orientations, narrow opening, no solution in the configured scope, and deliberate budget exhaustion.
- `P-boundary`: maximum supported DTO sizes and one value beyond each limit, to prove rejection rather than freezing.

The representative workload is not only box count: item-level inner packing, candidate multiplicity, openings, and constraints can dominate. Record candidate counts before/after filtering, placements attempted, item assignment steps, work units, budget consumed, and result validity. No claim of arbitrary room-scale support follows from P-reference.

### Stage budgets

Reference environment must identify actual CPU, memory, OS, browser, display/device class, power mode, and build profile. Use desktop and real midrange mobile measurements; do not infer phone performance from desktop emulation. Initial target budgets:

| Stage | Desktop p95 target | Mobile p95 target | Measurement boundary |
|---|---:|---:|---|
| Cold WASM download + instantiate | 1,000 ms | 2,000 ms | record asset transfer separately, fixed network profile |
| Rust normalization | 20 ms | 50 ms | input parse/domain normalization only |
| Candidate filtering | 30 ms | 100 ms | pinned catalog already loaded |
| First independently valid candidate | 1,000 ms | 2,000 ms | full reference search, explicit deterministic profile/budget |
| Independent validation + BOM/finalization | 30 ms | 100 ms | complete candidate DTO, separate from solver |
| JSON encode/decode aggregate | 20 ms | 50 ms | record payload bytes and each boundary |
| Worker transport round trip | 10 ms | 30 ms | enqueue-to-receive minus measured compute; report uncertainty |
| React commit after accepted response | 32 ms | 50 ms | receipt-to-visible model; SVG 20 containers + items |
| Small draft IndexedDB transaction | 50 ms | 150 ms | commit acknowledgment, not queued write call |
| Snapshot save + reload validation | 200 ms | 500 ms | durable transaction plus actual read/validation |
| Cancel acknowledgment | 100 ms | 200 ms | enqueue through task-queue yield to disposal response |

An individual synchronous search step targets <=8 ms desktop / <=16 ms mobile at the chosen fixed work-unit chunk. This is a measurement target, not a scheduler guarantee. If violated, reduce maximum chunk work or subdivide the defined work primitive without changing total budget semantics; re-run chunk invariance. A watchdog may terminate a stalled Worker, which is a distinct recovery path rather than proof of graceful cancellation.

### Measurement method

Measure release builds, cold and warm separately, with at least 20 cold starts and 50 warm iterations per fixture/environment; record p50, p95, max, sample count, WASM compressed/uncompressed bytes, JSON payload bytes, and memory indicators the browser exposes. State when exact peak memory is unavailable rather than invent it. Disable unrelated extensions/background work where possible and record remaining noise.

Use `performance.now()` around UI/Worker/transport/storage stages; measure Rust stages with a compatible injected/host timing wrapper without allowing clock values to affect reference solver choices. Avoid double-counting nested timing. Export stage metrics locally as an artifact without inventory names or home photos. Work-unit counts remain authoritative for deterministic comparison; wall-clock is performance observation only.

Track total end-to-end latency as well as stages. A fast Rust function with slow catalog serialization or repeated React renders is not a fast user flow. Do not send unchanged full catalog data on every edit. Benchmark comparison requires same fixture digest, engine context, work budget, environment, and validity checks. Competing solver/serialization experiments use identical common benchmarks and remain unmerged until reviewed; speed cannot compensate for invalid or narrower undisclosed results.

### `npm run bench:browser` (introduced by Task 010)

`npm run bench:browser` builds the production app plus WASM (`test:build`) and runs the `@bench`-tagged Playwright suite `apps/web/tests/browser/bench.spec.ts` once per configured browser project. Sample counts are configurable through `ZARI_BENCH_COLD` (fresh-profile cold starts, default 20) and `ZARI_BENCH_WARM` (warm iterations per fixture, default 50).

- **Cold phase.** Each sample launches a new browser instance with an empty profile and HTTP cache, loads `tests/harness.html`, measures page load, an uncached `fetch` + `WebAssembly.compile` of the production module, in-page `Runtime` construction, and real Worker spawn + WASM init + `initialize` round trip. `performance.memory().usedJSHeapSize` is recorded where the engine exposes it (null elsewhere — reported, not invented).
- **Warm phase.** Each fixture in `fixtures/bench` runs through `window.bench`, which replays the exact wire-request sequence `domainFixtureRequests` produces — identical bytes to the native fixture runner. Warm runs use a test-build-only instrumented Worker (`apps/web/tests/bench-entry.ts`) whose message handling matches `src/worker/entry.ts`; it additionally times `Runtime.handle_json` inside the Worker and posts that duration as a second message after the unchanged reply. Every request is timed: JSON encode in the page, Worker postMessage→reply round trip (`workerMs`), in-worker Rust compute for that same round trip (`workerComputeMs`), JSON decode in the page, and an in-page `Runtime.handle_json` replay (`directMs`). The messaging residual is `transportMs = workerMs - workerComputeMs`, measured within one execution. `crossRealmDeltaMs = workerComputeMs - directMs` is reported for information only: it compares two separate executions of the same Rust work and carries their compute-time variance, so it is not a transport cost (INV-01, `docs/INV01_MESSAGING_RESIDUAL.md` from PR #30, showed the earlier `workerMs - directMs` definition reporting that variance as residual). The one-time WASM instantiate before the first `initialize` is outside the timed compute, so `initialize` stays excluded from the residual target row. After warm iterations, the terminal event is compared against the fixture's pinned Rust-computed oracle (termination, plan digests, consumed counters, diagnostics) — a browser regression or silently changed budget fails the run, not just records slower numbers.
- **Persistence phase.** The real `ProjectRepository`/IndexedDB path is timed for open, draft create, normalized-input commit, catalog put, snapshot accept, and bundle reload, using a PlanSnapshot produced by a live Worker search — not fixture-shaped stubs. Corrupt-row counts are asserted at zero.
- **Cancellation.** `bench-search-cancel` sends `cancelSearch` mid-search through the real Worker; `workerMs` on that request measures enqueue-to-acknowledgment against the 100 ms desktop target.
- **Artifacts.** `test-results/bench/bench-<engine>.json` records contract `zari-bench-2`, environment (Node, platform, CPU model, cores, memory, headless/network profile), WASM bytes, per-fixture per-command stage stats (n, p50, p95, max; request/response bytes), persistence stats, heap deltas, and the target table with `met`/`exceeded`/`unmeasured` verdicts per stage. Stage rows aggregated as a maximum over (fixture, command) pairs — normalization, searchStep, messagingResidual, serialization, cancelAck — also record in `at` which pair produced the maximum. `zari-bench-1` artifacts used the earlier residual definition and are not comparable on that row.

The desktop column of the stage table is measured; the mobile column is **not** claimed — no mobile-profile project exists in the matrix, and Playwright desktop WebKit is not evidence about a physical iPhone. Real-device gaps are reported explicitly in the run artifacts and status files.

`zari-bench-3` keeps every `zari-bench-2` stage and threshold and adds separate rows for a Rust `projectSpatialView` (source = in-worker `handle_json`, encode, decode, and `workerMs - workerComputeMs`), pointer preview (`updateMove` and the following animation frame, no Worker call), 2D React commit, first 3D ready, changed 3D frame, scene build, one 5s idle window, and the summed gzip size of every JS chunk loaded only when 3D opens, including three.js. Reference geometry is `fixtures/spatial/spatial-yaw-offset.json`. The stress profile is the first live alternative of `bench-search-small` (`bench-search-reference` exhausts its budget with zero alternatives), then the same warm count of projections. Idle draws and the fixture oracle fail the run. A p95 over a timing target is recorded as `exceeded` and does not by itself fail the run. Phone and discrete-GPU columns stay `unmeasured` unless a physical device was used. Sample counts remain `ZARI_BENCH_COLD` (default 20) and `ZARI_BENCH_WARM` (default 50).

## 11. CI and exact-HEAD evidence

Task 001 introduces honest jobs for implemented scope: Rust fmt/clippy/native tests; WASM build; schema/DTO generation drift; JS type/lint/unit/build; actual browser Worker/WASM parity and minimal UI flow; preserved token checker. Later tasks add new assertions to existing jobs. Do not register permanently skipped jobs as passing completion gates.

CI artifacts on failure: relevant logs, fixture IDs and input digest, native/browser output diff, Playwright trace, screenshots, console errors, build/tool versions, exact HEAD. Use synthetic data in shared CI. Playwright traces can contain page input; keep artifacts scoped and redact secrets rather than collecting real user projects.

No `continue-on-error` on required gates. A retry may diagnose flaky infrastructure, but a green retry does not erase the original failure. Classify and fix genuine flakiness; never widen tolerances blindly. Use `cargo tree` / feature inspection at the Rust/WASM gates to ensure DOM/network/data engines/GPU dependencies did not enter the authoritative core or baseline browser build.

Every PR reports exact base SHA, final HEAD, commands, exit/results, applicable fixture IDs, supported and unverified states, browser evidence, architectural deviations, and known limitations. `Tests pass` alone is insufficient. Review evidence applies only to that HEAD; code changes invalidate relevant results until rerun/re-reviewed.

## 12. Review gates

| Gate | Required evidence / invariant | Green CI does not prove | Stop conditions |
|---|---|---|---|
| Architecture Gate | repository reality, preserved source integrity, schema/coordinate/unknown/Worker/storage decisions, bounded tasks | independent approval of documents authored by ASTRA | contradictory frozen contract; user consequential decision unresolved |
| Task 001 integration gate | actual Rust normalization + width + pack behavior in browser Worker; native parity; source diff | full geometry, persistence, solver, or complete product slice | JS authority duplication; fake WASM/mock-only evidence |
| Rust Domain Gate | scalar/DTO round-trips, uncertainty, typed unknown, overflow, generated contract | manufacturer data truth | silent defaults, unchecked deserialization, numeric precision loss |
| Solver/Validator Gate | direct invalid proposals, quantity conservation, deterministic budgets/chunking, independent finalization | global optimality or physical safety | validator trusts solver state; unsupported geometry presented valid |
| WASM Contract Gate | actual Worker lifecycle, stale rejection, cancellation during work, panic recovery | responsiveness for unbounded unsupported workloads | synchronous full search; stale context accepted; disposed handles reused |
| Persistence Gate | real reload/CAS/atomicity/import/corruption/version tests | browser storage as backup | silent overwrite, destructive unapproved migration, premature saved state |
| Vertical Slice Gate | enter→normalize→strategy→synthetic catalog→search→independent validate→snapshot→diagram/BOM/guide→save→reload | real catalog readiness or design approval | different snapshot IDs drive different views; quantities recomputed in UI |
| UX Interaction Gate | keyboard/mobile/numeric move/provisional/stale/unknown evidence; draft captures | user aesthetic approval or complete accessibility conformance | color-only states, no non-drag operation, fake commercial flow |
| Beta Readiness Gate | T01–T18/T20 supported paths, T19 rejection/gate, real catalog provenance, device matrix, export/recovery, measured performance | universal browser support or safety certification | unresolved correctness/security/contract finding; unsupported product claims |

Review loop at each substantive milestone: author verification → PR → independent reviewer → findings → same author fixes → exact-HEAD re-review → applicable architecture gate → user merge decision. Findings use `BLOCKER`, `MUST FIX`, `NOTE`, or `ARCHITECTURE DECISION REQUIRED`. The author cannot declare its own independent PASS, and a new author chat is not independence. AGENTS.md's author-conflict designation and audit-depth requirements remain in force.

Only the user merges. No CI workflow, automatic visual update, reviewer, or architecture verdict substitutes for that decision. A repeated manual procedure may later become a durable Devin playbook after it has worked reliably; no new automation/control plane is activated by this test design.

## 13. SP-012 hand-checked product oracles

Adopted by [D012](../design/DECISIONS.md). `docs/oracles/product-completion/pc-01.json` through `pc-11.json` are hand-checked contract oracles. They are not fixture-runner inputs, not generated expectations, and not proof that the running engine already emits the adopted guide. `cargo run -p zari-core --example fixture_runner -- fixtures` must not load them. Existing fixture expected outputs stay in place. No future `BUILD_ID` appears in an oracle.

PC-02, PC-03, and PC-04 are manually derived: pack arithmetic `need 1 / pack 2 → packs 1 / supplied 2 / surplus 1`, the rear-before-front load-then-install graph, and the unknown blockers a checkbox must not promote. PC-05 through PC-07 fix evaluation publication, allowance parity, and cancel versus budget versus interruption. PC-08 through PC-11 fix freshness, history, and storage failure. Owners are SP-013 (PC-01–04), SP-014 (PC-05–07), and SP-015 (PC-08–11). `crates/core/tests/guide_oracle.rs` compares `assemble_action_guide` to those hand files. It does not write the files from `build_actions`. The oracle index stays at `zari-domain-6` / `zari-domain-v1` and is not an engine output.

SP-013 fixture delta, reviewed against the engine and not copied from a guide regenerator: every `engineContext.buildId` is `zari-domain-7`. Historical input snapshots (`fixtures/spatial/*`, `record-snapshot-verified`) keep `zari-domain-v1` action bytes and hashes. Current `queryNextFacts` bindings (`mc-07`, `mc-09`, `mc-12-purchase-not-pass`, `mc-12-limit`) stamp `zari-domain-v2` and a recomputed `planSnapshotId`. Stale bindings (`mc-10`, `mc-12-historical`) keep v1 snapshot bytes; the reply stamp's engine `ruleVersion` is `zari-domain-v2`. Candidate and edit `snapshotDigest` values change because the published snapshot includes the new rule and guide. `search-scope-complete`, `search-budget-exhausted`, and `bench-search-small` keep the same consumed counters and alternative counts; the digest set changes because `planSnapshotId` is the rank tie-break. Spatial projection digests are unchanged.

This check is design verification. It is not app, browser, phone, or hardware qualification. The independent reviewer, not the author, checks history compatibility, physical guide order, instance conservation, and budget/cancel semantics.

SP-014 keeps version-1 fixture expected bytes. Profile `default` version 2 is a new accounting: allowances 1, 7, 128, 256, and 1024 must share one terminal result, a work budget stops before the next quantum, and cancel in each evaluation phase publishes no partial snapshot. Native and browser Worker parity still compare checks, quantity, BOM, guide, and hash. Release p50/p95/max at cold 20 / warm 50 are measured, not assumed. Phone qualification stays missing. The hand oracles in `docs/oracles/product-completion/` are not regenerated.

SP-015 proves the PC-08–11 lifecycle on the real Worker and IndexedDB in `apps/web/tests/browser/lifecycle.spec.ts`: a dirty evidence edit blocks progress, a new accepted binding starts with no carried done rows, a quota failure keeps the previous done row, duplicate discloses excluded photos, an empty catalogue stays empty, and a stored `zari-domain-v1` rule stays readable and not completable. Repository unit tests cover the draft-generation fence, the null-digest commit, and Rust verification before the duplicate insert. The hand oracle files are not rewritten.

SP-016 re-runs that matrix on one HEAD and adds the fresh path in `apps/web/tests/browser/product-completion.spec.ts`: facts, strategy, direct/owned/new alternatives, an edit that refuses a stale accept, a recomputed accept, a blocked unknown condition that a checkbox does not pass, reload, a quota failure that keeps the done row, and an interrupted search that keeps the snapshot. Draft images for those guide, purchase, stale, historical, save CAS, and recovery screens live under `design/baselines/draft/zari016/` and do not inherit SP-007 or SP-011 acceptance. `docs/qualification/denominator.json` is the 16-node handoff projection. It is not a runtime API. `DONE`, phone qualification, capture acceptance, and release stay unset when their pointers or hardware are absent. Cold 20 / warm 50 timings stay on the existing bench command. The hand oracle files are not rewritten.

## 14. z-product-contract fixture impact

Adopted by [Dz-product-contract](../design/DECISIONS.md). `docs/product-expansion/contract.json` lists the 124 fixture-manifest rows by `caseKind` and states that this node changes none of their expected bytes. `scripts/check-product-contract.mjs` checks those counts, the 001–016 ids and evidence headings, the open user decisions, and the adopted internal choices. `fixtures/domain/search-scope-complete.json` is the live chain trace: one `PlanSnapshot` carries the input digest, BOM, guide, and the drawing stamp. `fixtures/domain/project-unknown-quantity-pass.json` keeps quantity `unknown` / `notMeasured`. `fixtures/bootstrap/unknown-pack.json` keeps pack counts null. `fixtures/spatial/spatial-yaw-offset.json` keeps the historical transfer edge. The product-completion oracle index stays at `currentBuildId` `zari-domain-6`. The hand oracle files are not rewritten. This check is not phone, GPU, capture, or release qualification.

## 15. z-inventory-lifecycle ledger

Adopted by [Dz-inventory-lifecycle](../design/DECISIONS.md). New cases live in `crates/core/tests/fixtures/inventory/` and `crates/core/tests/inventory_lifecycle.rs`, outside `fixtures/`, so the 124-row manifest stays. They cover duplicate ordinals, unknown versus zero, an unchanged historical open, an empty container, and purchase/return/move/quantity-edit order. `apps/web/tests/unit/inventory.test.ts` counts worker calls and saves. `apps/web/tests/browser/inventory.spec.ts` runs the same distinctions on a real Worker and IndexedDB, including an invalid id, reload, the plan route, keyboard submit, 390 and 1280, and forced-colors. A v2 database upgrade must keep snapshot bytes. The hand oracle files are not rewritten.

## 16. z-catalog-provenance review

Adopted by [Dz-catalog-provenance](../design/DECISIONS.md). Cases live in `crates/core/tests/catalog_provenance.rs`, outside `fixtures/`, so the 124-row manifest stays. They cover two sizes of one product, a conflicting option id, a blank inner, an incomplete batch that publishes nothing, source separation, and refused photo bytes. `apps/web/tests/unit/catalogProvenance.test.ts` counts worker calls and refuses a quarantined save. `apps/web/tests/browser/catalog-provenance.spec.ts` runs the catalog route on a real Worker, including CSV quarantine, the three samples, keyboard submit, 390, and forced-colors. Existing catalog fixture expectations are not rewritten.
