# ZARI-z-performance-budget evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a phone measurement, or a release.

- Task: GitHub issue #108, node z-performance-budget, “실측 성능 예산과 WASM 병목 개선”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`. Branch `astra/zari-z-performance-budget`.
- Observed base SHA: `9803ee960cfc25c0279470f15f977ea120d4b67f` (origin/main at branch creation).
- Pinned docs used: `AGENTS.md`; `docs/PERFORMANCE_SECURITY_FAILURES.md` (targets and stage definitions); `docs/IMPLEMENTATION_STATUS.md` (earlier bench records, `zari-bench-3`); `docs/WASM_PROTOCOL.md`; `design/DECISIONS.md`; previous node evidence and ADRs. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-performance-budget, `docs/adr/SP-z-performance-budget.md`, and a note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`. Fable NONE / A2 is replaced by two independent reviews; merge is delegated to the supervisor.

## What changed

No new command, capability, DTO, schema, store, token or screen. `BUILD_ID` stays `zari-domain-7`. The 124 fixture expected files and `Cargo.lock` are unchanged.

1. **Measurement split.**
   - Native: `crates/core/examples/perf_profile.rs` prints per command p50/p95/max, request bytes, a SHA-256 of every response (`digest=`), the request-boundary pieces (JSON parse, canonical re-serialisation, typed decode) and the catalog pieces (snapshot→content, validation, digest).
   - Browser: `tests/bench-entry.ts` and `tests/harness.ts` (test build only) add wall-clock stamps so the old “messaging residual” is split into `toWorkerMs`, `workerQueueMs` and `fromWorkerMs` (page and Worker share one OS clock; these are estimates). `bench.spec.ts` reports them per command and adds a re-activation case (full catalog vs cached catalog, same context id asserted). Contract name `zari-bench-3` and every target are unchanged.
2. **Rust, same output, less work** (`crates/core/src/{canonical,protocol,validate}.rs`):
   - `activateProject` hashed the same catalog twice. `canonical::context_id_for_catalog_digest` reuses the verified digest; `context_id` wraps it.
   - Catalog and input validation serialised the same value three times and allocated a path string per node. It is now one serialisation and one reusable path buffer. Diagnostic paths and order are unchanged.
   - Canonical NFC now leaves ASCII strings and keys alone (already NFC) and edits in place. Non-ASCII still goes through NFC.
3. **Page, fewer copies** (`apps/web/src/worker/client.ts`): re-activating with a catalog this Worker session already sent sends `catalog: null` (the wire form that already existed). It mirrors the engine's two-entry cache. Only `catalog_unavailable` triggers one resend of the full snapshot; any other error is surfaced unchanged.
4. **Worker started while idle** (`sessionRegistry.ts`, `main.tsx`): the project Worker is started in an idle callback so WASM transfer/compile happens before a project is opened. It sends nothing. Not started on `#/probe` or `#/catalog`, which own their Workers. A failure is left to the next real `ensure()`.

## Before / after

Same host, same fixtures (`fixtures/bench`), same sample counts (cold 20, warm 50). Host: Intel Xeon 2.10GHz, 8 logical cores, 16 GiB, Chromium 141 headless, Node 24.19.0, other jobs running concurrently (load average 3–6). Numbers move with load; compare within a column pair, not across hosts. Raw artifacts were written to `test-results/bench/` (not tracked).

**Native release, `perf_profile`, 20 iterations, p50 ms**

| fixture / command | before | after |
|---|---|---|
| bench-search-reference `activateProject` (908 KB) | 76.0 | 31.9 |
| bench-search-reference `startSearch` | 19.2 | 9.2 |
| bench-search-small `activateProject` (190 KB) | 14.4 | 6.0 |
| bench-normalize-reference `normalizeInput` | 3.83 | 1.88 |
| catalog validation, reference | 21.2 | 6.7 |
| catalog digest, reference | 18.7 | 9.3 |

**Canonical equality.** Every response digest printed by `perf_profile` for all 7 bench fixtures is identical before and after (`diff` of the `command … digest=` columns printed `DIGESTS_SAME`, run after each of the three Rust edits and on the final tree). `fixture_runner -- fixtures` passes with `git status fixtures` clean.

**Browser Chromium, in-Worker Rust compute (`handle_json`), ms**

| fixture / command | p50 before→after | p95 before→after |
|---|---|---|
| search-reference `activateProject` | 140.7→66.4 | 187.9→95.4 |
| search-reference `startSearch` | 40.1→21.9 | 57.4→29.4 |
| search-adversarial `activateProject` | 132.6→65.8 | 187.4→94.0 |
| search-small `activateProject` | 29.5→14.4 | 48.4→29.1 |
| normalize-reference `normalizeInput` | 8.4→5.8 | 10.8→8.3 |

**Re-activation with the cached catalog (new bench case, Chromium, 50 samples).**

| fixture | full catalog p50 / p95 ms (request bytes) | cached p50 / p95 ms (request bytes) |
|---|---|---|
| bench-search-reference | 69.8 / 115.7 (908,173) | 5.5 / 8.5 (67,476) |
| bench-search-small | 14.6 / 55.5 (190,195) | 2.0 / 3.4 (20,707) |

Both cases assert the same `contextId` for the full and the cached activation.

**Stage table after (Chromium p95 vs desktop target), unchanged targets.** Met: wasmTransferCompile 335.5/1000, searchStep 0.6/8, serialization 7.1/20, cancelAck 0.7/100, draftTransaction 6.4/50, snapshotSaveReload 37.0/200, projection, 2D, 3D rows. **Exceeded:** normalization 21.4/20 (this run; the first run on the same host measured 14.2/20), messagingResidual 49.8/10.

- **Where the messagingResidual shortfall is.** The new split shows it is not transport and not Rust. `fromWorkerMs` p95 ≤ 0.5 ms; `workerQueueMs` p95 ≤ 0.7 ms after init. The residual p95 is the page→Worker delivery of the second request (`toWorkerMs`): p50 0.1–0.5 ms, p95 40–49 ms. In isolation (60 fresh Workers per run) about 10% of Workers delay `activateProject` by 36–41 ms, with the production `entry.ts` as well as the instrumented one, with or without the in-page replay. A 100 ms idle gap after `initialize` removes it (60/60 at ≤1 ms). It is therefore a one-off Worker-thread task right after init in headless Chromium 141 that I could not attribute further. The p95 therefore still reads “exceeded”; the target was not changed and the cause is not claimed as fixed.
- Early Worker start (change 4) is the mitigation for users: init and that one-off task then happen while the list is idle. The browser test proves the Worker is created before any click and is reused by the project (Worker count 1). It does **not** time the end-to-end click-to-ready latency in the app; that gain is inferred from the gap experiment above, not measured in-app.
- **normalization.** The bench “normalization” stage is `normalizeInput` p95. Compute fell ~25% in the browser (reference 10.8→8.3) and 50% natively. The stage p95 in the final run (21.4) is 1 ms over target on a loaded host, driven by a single slow `workerMs` sample (compute p95 8.3, transport p95 2.1), while the first run on the same host read 14.2. The host noise is larger than the margin; no claim that the target is reliably met.
- Measurement bench (`bench-mc`): queryTransport 49.6/10 and coldQuerySource 69.8/20 are still **exceeded** and were not addressed by this node.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| 1. Wall-clock timeout and deterministic budget termination are distinct | `crates/core/tests/performance_budget.rs`: `budget_termination_does_not_depend_on_step_size_or_host_pacing` drives `bench-search-small` with allowance 64 and 1024 and with real sleeps between steps; termination `budgetExhausted`, alternatives digests and consumed counters equal each other and the pinned fixture. `a_cancel_is_not_reported_as_budget_exhaustion`: a cancel is `searchCancelled` with no result. Existing coverage reused: `productCompletionOracle.test.ts` pc06 (`budgetExhausted`) vs pc07 (`interrupted`) and `product-completion.spec.ts` (hard terminate shows `data-search="interrupted"`, not a scope claim) |
| 2. Same canonical results before and after in the same mode | Response SHA-256 equality over 7 bench fixtures (`perf_profile`, before vs after); `context_id_for_a_known_digest_is_byte_identical`; `nfc_fast_path_matches_full_normalization` (NFD vs NFC, keys and values); `reusing_a_cached_catalog_keeps_the_context_and_never_invents_one` (cached contextId equals full; unknown digest is `catalog_unavailable`); bench re-activation asserts equal `contextId` over 50 runs per fixture; 124 fixtures pass native and browser (parity) with no expected-byte change |
| 3. Shortfalls and unmeasured mobile are not hidden | This file lists the exceeded rows with numbers. Bench artifact keeps `phone: UNVERIFIED`, `discreteGpu: UNVERIFIED`. No target was changed |
| Small change does less work | `client.test.ts` (4 new): full once then `catalog: null`; resend on `catalog_unavailable`; other failures not retried and message preserved; mirrors the two-entry cache. `performance-budget.spec.ts`: a real width edit re-activates with `catalog: null`, request < half of the first, context stays `installed`, console clean |
| Worker started early | `performance-budget.spec.ts` first test; `probe.spec.ts` (Worker crash) still passes after the probe/catalog exclusion |

## Commands

Prefix: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4`. Node v24.19.0, Rust 1.98.1, wasm-bindgen 0.2.128.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 (first run flagged `manual_is_multiple_of` in the new test; fixed) |
| `cargo test --workspace --locked` | exit 0. 246 passed, 0 failed, 1 ignored (the existing completion-query ignore). New suite `performance_budget` 5 passed |
| `fixture_runner -- fixtures/bootstrap` / `-- fixtures` | exit 0 / exit 0. `git status fixtures Cargo.lock` clean |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0 |
| `npm run wasm:build`; `npm run contracts:check` | exit 0. “Contracts match Rust source; 124 fixture structures valid.” No contract regeneration needed: DTOs unchanged |
| `npm run typecheck`; `npm run lint` | exit 0; exit 0 |
| `npm test` | exit 0. vitest 34 files, 233 tests (client.test.ts 11) |
| `npm run build`; `node scripts/check-release-manifest.mjs` | exit 0; `errors: []` |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 39/39 contrast cases; no new token |
| `node scripts/check-product-contract.mjs` | exit 0. fixture impact 124 unchanged |
| `npm run test:browser -- --project=chromium --workers=2` | exit 0. 119 passed (5.9 min). `--workers=2` for local RAM; config timeout not raised; no `worker-state` flake observed on this run |
| `npm run test:parity` | exit 0. 2 passed. “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |
| `npx playwright test --grep "@bench" --project=chromium --workers=1` | 15 passed before; 17 passed after (cold 20, warm 50) |
| `npx playwright test …performance-budget.spec.ts --project=firefox` / `webkit` | **not run**: browser executables are not installed on this host (`Executable doesn't exist`). UNVERIFIED on Firefox and WebKit |

One earlier mid-work full run printed 134 passed / 3 failed because a positional filter matched the repo path and ran every spec, including two `@capture` specs that need `ZARI_CAPTURE_DIR` and `probe.spec.ts` Worker crash. The probe failure was real and caused by this change (an extra warm-up Worker became the last-created Worker on `#/probe`). It was fixed by not warming on `#/probe` / `#/catalog` rather than by changing the test, and the final tree has 119/0.

## Browser

Route: project list → create project → sample → commit → one width edit → commit, on Chromium 141 headless at the default viewport. Flows: warm-up before any click (Worker count 1, reused after create); first activation sends the full catalog; second sends `catalog: null` with a request under half the size and `context-state` stays `installed`. Failure paths are covered by unit tests (`catalog_unavailable` fallback, other error preserved) and the Rust unknown-digest refusal. `pageerror` and console `error` were empty in both specs. No screen, token or copy changed, so no responsive, forced-colors or keyboard check applies beyond the existing suite. No screenshots were produced. `docs/evidence/ZARI-SPATIAL-001-*.png` were rewritten by the suite and restored with `git checkout`.

## Parity

Native and actual Chromium Worker/WASM agree on 124 shared fixtures. Expected bytes did not change.

## Contract advisory

`contract_change`: NO. No DTO, capability, schema, `BUILD_ID`, `ruleVersion`, canonical version, store or `DB_VERSION` changed. The `catalog: null` activation form and the engine's cache were already part of the protocol; the page now uses them.

## Deviations

- The spec asks to separate normalization / serialization / Worker round trip / search. Normalization, serialization, search step and Rust compute were already separate stages (`zari-bench-3`); the new part is the transport split and the native boundary/catalog split. Search quality and first-valid-result latency were not re-baselined.
- Cached-catalog reuse is measured as a bench case and a browser request-size check, not as an end-to-end UI latency number.
- Performance numbers are one host under varying load. Treat differences under ~10 ms at p95 as noise.

## Known limits / unverified

- Real phones (Android, iOS) and a discrete GPU: UNVERIFIED. The mobile target column remains unmeasured.
- Firefox and WebKit: not run (no binaries on this host). The earlier Firefox serialization and WebKit normalization exceedances are neither confirmed nor refuted.
- messagingResidual p95 (~40–50 ms), normalization p95 (host-dependent, 14–21 ms), bench-mc queryTransport and coldQuerySource remain **exceeded**.
- The cause of the post-init Worker stall is not identified; early start is a mitigation, not a fix.
- GitHub Actions has not executed this tree.

## Out of scope

New serialization formats, search changes, budget or threshold changes, service-worker policy, telemetry, the next z-node, governance files, source prompts, `SOURCE_MANIFEST.json`, CI workflows and approved baselines.
