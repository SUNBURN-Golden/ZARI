# ZARI-001 — ready-to-send Devin prompt

This is the complete implementation prompt. Send it only through the canonical manual-dispatch procedure after the architecture gate. The canonical GitHub task/PR supplied with dispatch provides its own ID, task revision, authorization, control record and assigned session; none is fabricated here. A bare prompt without that record is not a valid launch under the current runbook.

---

You are the implementation owner for **ZARI-001: executable Rust/WASM/Worker/browser architecture proof** in `BeautifulMind-JT/ZARI`.

You own one bounded engineering outcome from repository investigation through tests, browser verification, self-review and an unmerged PR. Use your engineering judgment inside the contracts. Do not ask for approval of routine helper names, debugging choices or a local plan. Do not redesign foundational contracts.

## 1. Inspect the real repository before modifying anything

1. Resolve the canonical GitHub task/PR and current task revision supplied by this manual dispatch. Read its pinned specification/approval pointer and control record. Confirm you are its one active implementation owner. If the record is absent, belongs to another owner, or launch state is unresolved `SUBMITTING`/`UNKNOWN`, report `BLOCKED / INCOMPLETE_TASK_ENVELOPE` or the exact ownership blocker. Do not start a competing writer.
2. Fetch/read the actual current remote `main` and record its full SHA. Inspect current branch, dirty files, untracked relevant files, recent commits, workflows and open work affecting these paths. Do not assume the old architecture-review base is still the current HEAD.
3. Read in order: `README.md`, `AGENTS.md`, `docs/IMPLEMENTATION_STATUS.md`, preserved `docs/MASTER_PROMPT_KO.md`, preserved `docs/RUST_ADDENDUM_KO.md`.
4. Read `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/WASM_PROTOCOL.md`, `docs/TEST_STRATEGY.md`, `docs/DEVIN_EXECUTION_PLAN.md` §§1–8, and `docs/PRODUCT_SPEC.md` for the slice boundary. Read `DESIGN.md`, `design/SCREENS.md`, `design/COMPONENTS.md`, `design/DECISIONS.md`, `design/REVIEW_CHECKLIST.md`, tokens and contrast cases for UI work. Inspect `SOURCE_MANIFEST.json`, `.gitignore`, `TASKS/TEMPLATE.md`, `RUNBOOKS/DISPATCH.md` and the current token-check script.
5. Confirm architecture documents are the authorized revision. If missing or mutually contradictory on this task's required contract, stop the affected scope with exact pointers. Adjacent missing future implementation is expected.
6. Create feature branch `devin/zari-001-executable-bridge` from the authorized current base. If that branch is already the same task's lineage, reuse it; never reset someone else's work. Preserve unrelated user changes.
7. Summarize the local plan, relevant current patterns and observed base SHA in the same session, then proceed autonomously within scope.

## 2. Outcome and explicit boundary

Prove this actual path:

```text
Korean measurement controls and synthetic probe data
→ revision-aware Worker request
→ actual Rust/WASM normalization and arithmetic
→ typed/validated response
→ SVG width schematic and package calculation displayed by React
```

The Rust computations are:

- exact mm/cm normalization and validation;
- a deliberately limited rectangular row **width-boundary probe**, with left/right clearance and between-object gaps;
- quantity-to-package arithmetic.

Use actual compiled WASM in an actual browser Worker. Native Rust and browser fixtures must agree. A successful build, a hello-world return, mocked Rust, or a JS copy of the calculations is insufficient.

This is **not** the full solver, independent final validator, PlanSnapshot, BOM, complete first vertical slice or saved-project feature. The UI must say the probe checks width only and does not yet verify contents, installation, access or support. Do not call the package arithmetic panel a complete purchase plan. Task 006 will prove the full synthetic planning flow after the intervening contracts and components exist.

## 3. Authorized implementation scope

You may implement the necessary cohesive pieces:

- root Cargo workspace containing only real implemented `crates/core` and `crates/wasm` packages; no empty solver crate;
- validated scalar/measurement subset needed by this task, kept extensible exactly as `DOMAIN_MODEL.md` specifies;
- a small native fixture runner and shared input/expected-output fixtures;
- Rust-owned probe and package computations with checked arithmetic;
- thin wasm-bindgen adapter and real module Worker;
- root npm workspaces with `apps/web`, React/TypeScript/Vite and the minimal measurement/probe UI;
- generated JSON Schema, TypeScript DTOs and runtime validators from the Rust DTO source;
- exact relevant Worker protocol subset, using the final envelope and lifecycle conventions from `WASM_PROTOCOL.md`, not a second temporary protocol;
- tests, build/typecheck/lint/parity scripts, reproducible toolchain configuration and narrowly scoped CI;
- README execution instructions and truthful `docs/IMPLEMENTATION_STATUS.md` updates.

Do not create folders/crates for features with no implementation. Use existing token values through semantic names; preserve the design identity. Any necessary new semantic color pairing must have a contrast case and pass the existing checker. Do not designate a screenshot approved.

### Dependencies and reproducible build

Inspect actual tools and official current documentation, select compatible stable versions and pin them. Do not install latest packages independently and assume compatibility. Record Rust, Node/npm, Vite/React/TypeScript, wasm-bindgen crate/CLI and schema-tool versions in the evidence. Commit the implementation's Cargo/npm lockfiles; this permission applies to this coding task, not the earlier documentation-only architecture phase.

Use wasm-bindgen. The CLI version must exactly match the crate version selected by the locked build. Keep the WASM binding thin. Do not add wasm-pack or a general build framework unless a concrete necessary gap exists and it fits the approved toolchain boundary; the normal path is Cargo plus the matching wasm-bindgen CLI.

Use **Schemars draft-07** from Rust DTO definitions, **json-schema-to-typescript** for generated TypeScript, and **Ajv standalone** validators for runtime transport shape checking. Do not manually maintain equivalent Zod/TS domain schemas. Generated shape validation does not replace Rust semantic validation; deserialization must not bypass validated construction.

Use JSON text at the UI↔Worker and Worker↔WASM boundaries as defined in `WASM_PROTOCOL.md`. Bound payload size before parsing. Do not introduce binary, shared memory, Arrow or a second serialization format. Create one request for a meaningful operation, not one call per scalar comparison.

Pin and document a compatible initial build. If a required dependency introduces unexpected paid infrastructure or licensing constraints, stop with evidence instead of silently substituting the architecture.

## 4. Rust behavior and mandatory fixtures

Implement the scalar grammar, range and serialization contracts exactly from `DOMAIN_MODEL.md`. Do not leave unknown or rounding semantics to the frontend. Every externally deserialized value must pass Rust validation. The frozen subset is `LengthMm` 1..10000; `ClearanceMm` 0..10000; signed `PositionMm` -20000..20000 with nonnegative placement coordinates; `Quantity` 0..10000; `PackQuantity` 1..10000. `MoneyKrw` and u64 revision counters serialize as canonical decimal strings, never lossy JS numbers. Use the exact accepted cm precision grammar in `DOMAIN_MODEL.md`; do not infer float rounding from the browser input widget.

### Unit normalization

- `60` cm and `600` mm normalize to the same 600mm value and authoritative probe output.
- `19.5` cm normalizes to 195mm.
- Blank input is explicitly unknown, not zero. The original editing string remains UI state.
- Zero length, negative length, NaN/Infinity-like strings, unsupported units, fractional values not representable at 1mm precision and excessive inputs produce structured errors. Do not round sub-mm input.
- Position zero remains legal where the DTO supports position. Physical quantity zero remains legal where the domain permits it. Pack quantity zero is invalid.
- Large serialized numeric strings must preserve exactness according to the domain contract.

### Width-boundary probe

For a positive row count `n`, compute in Rust:

```text
requiredWidth = leftClearance
              + n × objectWidth
              + (n − 1) × betweenGap
              + rightClearance
```

Return Rust-computed object x positions, normalized dimensions and check evidence sufficient for the SVG and text. The frontend transforms physical coordinates to pixels; it must not independently recompute authoritative required width, placement count or fit.

Required synthetic fixtures:

1. Space width 600mm; left/right 5mm each; between-gap 5mm; three objects each width 190mm: required width **590mm**, width check passes. Positions begin at 5mm, 200mm and 395mm.
2. Same space/clearances/count; object width 195mm: required width **605mm**, width check fails. Positions begin at 5mm, 205mm and 405mm. Do not shrink rectangles or margins to make it fit.
3. Same fixture with unknown space width: width check is unknown / measurement required, never pass or zero-sized space.
4. Exact boundary contact and one-millimetre overflow cases, with clearances explicit and no double counting.
5. Checked-arithmetic overflow and invalid dimensions: structured errors, no panic or wraparound.

The 5mm clearances are synthetic fixture values, not a universal installation recommendation. A passing width probe does not imply 3D containment, usable inner capacity, insertion, access, load support, price or stock.

### Package arithmetic

Required physical quantity 5 and pack quantity 2 produce:

```text
packagesToOrder = 3
suppliedUnits = 6
surplusUnits = 1
```

Required physical quantity 0 and pack quantity 2 produce 0/0/0. Required10000 / pack9999 produces2 packs,19998 supplied,9998 surplus using UnitCount for aggregate output; input Quantity limits must not reject this valid result. Exact multiples have zero surplus. Pack zero is rejected; unknown demand or unknown pack quantity remains unknown under the explicit known-zero-demand exception in WASM_PROTOCOL.md. Use checked integer arithmetic and a ceiling-division implementation without an avoidable addition overflow. These outputs are arithmetic evidence, not a full BOM or actual merchant offer.

At minimum test equivalent units, positive/zero/unknown distinctions, package cases, limits/overflow and native/browser JSON round trips. Add small property tests that exercise normalization or package identities with independently derived assertions; do not merely call the same production predicate twice.

## 5. Worker/UI behavior

Use the frozen request/response identity fields and current-project/input/worker-generation guards from `WASM_PROTOCOL.md`: `protocolVersion: 1`, `schemaVersion: 1`, `workerSessionId`, `projectActivationId`, `requestId`, `projectId`, `editorEpoch`, `inputRevision` and nullable `contextId` before normalization. The u64 epoch/revision values use canonical decimal strings. A reply is applied only if it still belongs to the current operation and input identity. Bind every check/result to the relevant request; no component may directly call authoritative WASM on the main thread.

Implement only `initialize`, `activateProject`, `normalizeInput`, `evaluateProbe` and `disposeProject`, together with host termination/restart recovery. `initialize` advertises this exact capability subset. `proposeStrategies`, `startSearch`, `stepSearch`, `cancelSearch` and `validateEdit` remain unsupported with explicit capability/error handling; do not fabricate completed search state. The current probe calls are small and synchronous. Do not claim that sending cancel can interrupt a running synchronous WASM call. Full incremental search/cancellation is established by later tickets; test current stale-result fencing and safe restart honestly.

Add controllable tests for older response after a new input, previous Worker generation after restart and a worker error followed by successful retry. A fault-injection harness may simulate transport failures, but the normal calculations and parity path must execute actual WASM. Do not ship a production-visible panic button.

Build a small Korean working screen, not a landing page/dashboard:

- compartment width/unit controls with clear labels and exact raw input state;
- width dimension line highlighted when its field is focused;
- real Rust-derived row schematic;
- width-only success/failure/unknown explanation with text as well as color;
- package demand/pack input and Rust results;
- loading/failure/retry state and preserved form values on worker error.

Use React Aria `TextField`/`Input`/`Label`/description/error composition for `DimensionField` as specified in `FRONTEND.md`; retain the exact raw string and native text-input behavior. Do not use a NumberField or floating-point browser coercion as normalization. Use native HTML for semantic content and simple controls where the contract specifies it. Do not install Motion, Storybook, Impeccable, another component foundation or a generic DnD system for this slice.

Selection/focus styling is separate from validity styling. No generic AI gradients, sparkle claims, fake KPI cards or nested-card shell. At 390px use a coherent narrow measurement/result flow; at 1440px use an efficient work surface. Keyboard users must reach every relevant control and understand errors.

No IndexedDB project storage in this task. Reload begins a fresh probe. Clearly record persistence as not implemented; do not fake a saved indicator.

## 6. Required executable verification

Establish these root npm scripts and preserve their purpose for later tasks:

```text
npm run wasm:build
npm run contracts:generate
npm run contracts:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser -- --project=chromium
npm run test:parity
npm run dev -- --host 127.0.0.1
```

`build` must use the actual WASM artifact. `contracts:generate` emits the Rust-derived schema/types/validators; `contracts:check` regenerates in temporary output and fails on drift in checked-in schema/types/validators and invalid fixture structure. Implement the native runner command `cargo run -p zari-core --example fixture_runner -- fixtures/bootstrap`. `test:parity` executes these identical shared fixtures natively and in actual Chromium Worker/WASM, normalizes only explicitly nonauthoritative metadata, and compares authoritative results. Browser test configuration must include the named `chromium` project. Do not satisfy parity by running the native binary twice or mocking the Rust adapter.

Run and report:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap
npm ci
npm run wasm:build
npm run contracts:generate
npm run contracts:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser -- --project=chromium
npm run test:parity
node scripts/check-design-tokens.mjs --self-test
```

Also inspect the actual direct/transitive Cargo feature tree for the WASM package and report the exact command/output relevant to browser compatibility. The web/default tests must not require Python, DuckDB, Polars, GPU/CUDA, server services or paid accounts. CI must expose useful logs and browser/parity artifacts on failure. Green CI is not architecture acceptance and does not silently change the existing `LOCAL_EVIDENCE_REQUIRED` runbook policy.

Launch the app using the established dev script. Use the browser yourself and verify:

1. Enter `60 cm`, then equivalent `600 mm`; the authoritative result stays equivalent.
2. Exercise the 590mm pass and 605mm fail cases at 600mm.
3. Clear the measurement; see unknown, then enter invalid zero and sub-mm values; see useful field errors.
4. Enter required 5 / pack 2 and verify 3 packs, 6 units, 1 surplus.
5. Navigate with keyboard; focus tracks the relevant dimension line.
6. Rapidly change input; delayed stale responses do not overwrite the latest state.
7. Use the test harness to trigger a worker failure; form remains, retry succeeds and an old worker response is ignored.
8. Inspect at 390px and 1440px, inspect console/network errors and confirm the real `.wasm` resource loads.

Record short screenshots or a focused browser video and precise actions/results. Do not declare visual approval. If recording fails but the actual browser verification succeeds, report the evidence limitation; a recording is not required instead of tests. If actual browser verification is impossible, report the blocking infrastructure problem and do not claim this ticket complete.

## 7. Self-review, corrections and handoff

Stay in this session for test, CI and review fixes. Diagnose failures, correct implementation and rerun relevant checks; do not merely paste the first failed command or ask the user to debug ordinary code. Do not start another writer.

Before handoff:

1. Inspect the full diff against the recorded base SHA, not just unstaged changes.
2. Verify only allowed paths/necessary files changed; review generated artifacts and lockfiles for unintended packages.
3. Check no protected source prompt or manifest changed.
4. Check there is no TypeScript authoritative arithmetic/geometry copy, hidden unknown coercion, whole-plan success claim, mocked normal Rust path, debug code or secret.
5. Rerun required affected verification after the final substantive change.
6. Update README execution commands and `docs/IMPLEMENTATION_STATUS.md` with what actually works, exact checks, unimplemented capabilities and next task. Do not commit per-session transcripts, runtime dispatch records or mutable audit logs.
7. Commit, push the task branch and create/update a PR titled `ZARI-001: prove Rust/WASM Worker bridge with physical calculations`.
8. Report canonical task/revision, observed base SHA, exact final HEAD SHA, changed paths, acceptance-to-test index, exact commands/results, actual browser evidence, native/WASM parity status, known limitations and risk areas for reviewers. Identify any unexecuted check explicitly.
9. Leave the PR unmerged. Do not declare independent PASS; your self-review is author evidence only.

Required independent path: configured read-only reviewer → exact-HEAD A3 Bridge Gate audit → user merge decision. Reviewers must not apply Auto-Fix/source edits; findings come back to this author session. Every new relevant HEAD invalidates old gate evidence.

## 8. Forbidden work and consequential stops

Do not merge, deploy, create cloud/auth/AI/payment services, enable dispatch automation, add a scraper, import real commercial catalogs, install DuckDB/Polars/cuDF/OR-Tools, introduce SharedArrayBuffer/threads, create speculative empty crates, implement the full solver/persistence/PlanSnapshot, change design identity, approve/replace baselines, weaken tests or alter the preserved prompts/manifest.

Stop only the affected scope and report exact evidence if:

- canonical authorization/ownership or pinned architecture is missing or contradictory;
- actual repository changes make this task conflict with another owner or existing implementation;
- satisfying acceptance requires changing a frozen schema, invariant, protocol/authority boundary or consequential approved architecture;
- required dependency licensing/payment/service use is unexpected;
- secrets/production credentials or destructive migration are required;
- actual browser/WASM verification cannot be performed in this environment.

Routine implementation choices and test failures are yours to resolve autonomously. The desired handoff is a reproducible, bounded, reviewable PR demonstrating real computations across the intended stack, with exact evidence and no merge.
