# ZARI-SPATIAL-audit-03-fix — issue #121

Delivered via the PR opened by the supervisor. This is builder evidence, not an independent review verdict, GitHub CI result, screen approval, product qualification, or release authorization.

## Authority, source and boundaries

- Task: audit 03 F2/F3 only; AUDIT-FIX pseudo-node, absent from `.aiops/program.json`. No program node was started.
- Task document: issue #121 body supplied in the session and `/workspace/zari-spatial/audit-03-fix/node.json`, with the **2026-10-22 04:40 KST owner decision** superseding the original F3 local-delivery NOT_STARTED requirement. That decision authorizes 21 MERGED rows, verified #117/#119 pointers, and removal of the obsolete review gap; PARTIAL/PENDING/NOT_AUTHORIZED and all device/product gaps must remain.
- Observed base/HEAD: `1aa3c1cbee36be4e2182e929b4fc7043f9487e49`; branch `astra/zari-spatial-audit-03-fix`; sole writer. The continuation inherited eight partially completed Markdown paths, rather than a clean tree. Final delivery HEAD will be assigned by the supervisor; the builder creates no commit.
- Immutable plan pin: `0847d1b065627938acfad3a941de79e357570e43`, confirmed ancestor. Read the pinned execution-plan §2 and relevant program completion/denominator contracts; README/AGENTS, targeted preserved prompts, implementation status, DESIGN/SCREENS/COMPONENTS/DECISIONS/REVIEW_CHECKLIST, workspace blueprints, DOMAIN_MODEL/FRONTEND/WASM_PROTOCOL, adopted ADRs and corresponding current source/tests. Current merged capabilities are reused. Candidate/pending control-plane policy and non-executable documents authorize no extra work.
- No commit, push, branch switch, PR creation, GitHub comment/edit, workflow change, dependency installation, external product service, purchase, release or deployment was performed. GitHub access was read-only and limited to the receipts required by F3.

## Re-check and acceptance → verification mapping

| Finding / output | Observed base and change | Verification |
| --- | --- | --- |
| F2 merged scope | README/DESIGN stopped near catalog provenance despite subsequent merged nodes. Both now describe the observed main through local delivery plus the owner-added catalog crawler; README's repeated old scope sentence points to the consolidated scope. Merge and qualification remain distinct. | Local merge ancestry, existing delivery evidence/status, 21-row ledger and pinned program membership; local Markdown target check. |
| F2 domain entities | DOMAIN_MODEL ended at §19. Appended §20 portable bundle, §21 purchase preparation, §22 location observations/search, §23 feedback/draft and §24 catalog dimension bundle with existing ADR links. | Current Rust portable/purchase/location/feedback/catalog-bundle implementations and tests; full native suite, 124 fixtures and actual-browser parity; corresponding browser flows. |
| F2 frontend surfaces | Retained existing location/feedback/print sections and §24 local-delivery notice. Appended §25 privacy DataScreen, §26 guided onboarding and §27 BundlePanel. | Current components/workers; existing privacy/onboarding/catalog unit/browser tests, refusal paths, console checks, keyboard, forced colors and Worker request-count assertions. |
| F2 draft screens | Retained S01–S08; appended S09–S16 for portable import/export, purchase preparation, location search, feedback, output, `#/data`, start/help and catalog bundle. | Corresponding existing browser flows, responsive/keyboard/forced-colors checks, token checker and local links. All entries remain drafts. |
| F2 additive WASM function | Added one operation-table note for `reviewCatalogBundle(text: string): string`, outside Runtime commands/events/capabilities, in a dedicated bundle Worker. | Actual Rust export, bundle Worker/client, 10 MiB/5,000-item bounds, WASM build, contracts drift check and browser bundle success/refusal. |
| F3 qualification pointers | Qualification already was MERGED with correct #117 delivery/merge pointers on this base. Kept those; filled its two verified final-head review-comment URLs. | Read GitHub metadata and both final receipts; compared exact reviewed head with PR head and merge's second parent; fixed pointer assertions in zQualification.test.ts. |
| F3 local-delivery state/pointers | #119 was already merged, while ledger/checker/test still projected IN_PROGRESS. Applied the owner amendment: MERGED with actual delivery/merge/PR and two final-head review-comment URLs. No NOT_STARTED assertion installed. | Same metadata/receipt/merge-parent check; checker requires every one of 21 rows MERGED; tests reject IN_PROGRESS, NOT_STARTED, UNKNOWN and DONE for all rows. |
| F3 review gap and separate axes | Removed only obsolete `independent-review-z-local-delivery: BLOCKED`. Retained every other required gap and all row qualification PARTIAL, acceptance PENDING and release NOT_AUTHORIZED. | Exact base/current non-review-gap comparison, explicit gap/axis unit test, checker and baseline-16/product/review-package checks. Tests also reject missing/duplicate/wrong-PR review pointers and QUALIFIED overclaim. |

F2 reuses existing behavioral tests because it documents already merged behavior. F3 adds six meaningful regression cases to the existing two qualification tests (eight total). No application/browser test or domain implementation changed.

## Read-only F3 receipts

The following PR metadata and full final review bodies were read before recording their URLs. Earlier failing/intermediate-head comments were excluded. Receipt bodies identify separate read-only sessions independent of the builder and each other; this paragraph records historical receipts and issues no review verdict for #121.

| Row | Delivery/head | Merge | Final independent receipt URLs |
| --- | --- | --- | --- |
| z-product-qualification, issue 116 / PR 117 | `082f63ed389a81634eeba5313c36ed913ffb6ba0` | `3e76e96512a50cd13167587d7539d38454501813` | [Review 1, delta 1](https://github.com/SUNBURN-Golden/ZARI/pull/117#issuecomment-6282648469), [Review 2, delta 1](https://github.com/SUNBURN-Golden/ZARI/pull/117#issuecomment-6282649045) |
| z-local-delivery, issue 118 / PR 119 | `108667cceb00be4455ae113da44776683fa5102f` | `a785b63c5b5c7306fddb39be3a9c12d2cfc04618` | [Review 1, delta 3](https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-6314938341), [Review 2, delta 3](https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-6314939282) |

Exact read-only API commands: `gh api repos/SUNBURN-Golden/ZARI/pulls/117`, `gh api 'repos/SUNBURN-Golden/ZARI/issues/117/comments?per_page=100'`, `gh api 'repos/SUNBURN-Golden/ZARI/pulls/117/reviews?per_page=100'`, and the same three endpoints for `119`; all exited 0. Issue comments contain the session receipts; formal reviews arrays were empty. Cached JSON is in `node_modules/.cache/audit-03-fix/continuation/{117,119}-{pr,comments,reviews}.json`.

Both PRs report merged=true with the SHAs above. Local verification confirmed **all 21** merge commits are ancestors of the observed HEAD, each merge's second parent equals deliveryCommit, and its subject names the ledger PR. `reviewPointer` now permits a distinct pair of comment URLs in this handoff document while retaining legacy null/single-comment support for other rows. The two reconciled rows specifically require a pair on their own delivery PR; runtime code never consumes this projection. All other row fields and non-review gaps were compared against base and are unchanged.

## Changed paths and contract advisory

- Scope/design: `README.md`, `DESIGN.md`, `design/SCREENS.md`.
- Consolidated contracts: `docs/DOMAIN_MODEL.md`, `docs/FRONTEND.md`, `docs/WASM_PROTOCOL.md`.
- F3 handoff projection/checks: `docs/qualification/z-denominator.json`, `scripts/check-z-denominator.mjs`, `apps/web/tests/unit/zQualification.test.ts`.
- Dependent F3 consistency: `scripts/check-release-candidate.mjs` and the authored `requiredGaps` metadata in `docs/delivery/release-candidate/manifest.json`; its generated `dist` section is byte/value unchanged.
- Evidence/status: `docs/evidence/ZARI-SPATIAL-audit-03-fix.md`, `docs/IMPLEMENTATION_STATUS.md`.

`contract_change=NO`: no Rust/TypeScript application calculation, protocol command/event/capability, generated contract, domain-validator meaning, stored schema/migration, snapshot/BOM/guide bytes, BUILD_ID, fixture expectation/digest/id, dependency or lockfile changed. The handoff checker now enforces the explicitly authorized post-merge projection. No token or color combination changed; approved baseline count remains 0. No architecture deviation. Protected areas and all other nodes are outside scope.

## Verification environment and execution

Every shell command used:

```bash
export PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=4
```

Observed Node v24.19.0, npm 11.17.0 (required engines 11.x; a different minor from packageManager 11.9.0), rustc/cargo 1.98.1 and wasm-bindgen 0.2.128. Dependencies and Chromium were already installed. Heavy checks ran sequentially in foreground processes, with each process awaited to completion. The final-tree Chromium suite uses **one worker** for this memory-constrained host; existing assertions, test/expect timeouts and retry settings are unchanged. This is the final-tree verification after the F3 changes, separate from the inherited earlier documentation-only run. The unit suite was rerun only after fixing its concrete stale-state dependency described below. No unchanged failed browser test was retried.

New raw logs, command/exit/timing JSON and preserved browser/parity reports are under ignored `node_modules/.cache/audit-03-fix/continuation/`; earlier logs and failure artifacts remain under `node_modules/.cache/audit-03-fix/`. These local artifacts supplement the committed result record and are not a new approved capture set.

## Verification fix discovered by the full suite

The first `npm test` exited 1 after 73.84s: **426 passed / 1 failed (51 files)**. The new qualification cases passed; the existing localDelivery test failed because `check-release-candidate.mjs` independently hard-coded local delivery IN_PROGRESS. Its manifest also repeated the now-obsolete BLOCKED review gap. This is the same F3 state dependency: changed that corresponding checker to require MERGED and removed only the obsolete review gap from its authored metadata/check. Added candidate/ledger gap and PARTIAL/PENDING/NOT_AUTHORIZED assertions to the new gap regression case. This is a minimal additional pair of corresponding paths beyond the issue's original named files; it implements no program node and weakens no gate.

The manifest's generated dist section, all 13 recorded digests, buildId, builtAt and every field outside requiredGaps were compared to base and are identical. No generated output was hand-edited or regenerated to hide drift. The first unit log and prior command results remain in `continuation/first-unit.log` and `continuation/first-checks-results.json`. Typecheck/lint/full unit checks are rerun after this fix; unchanged Rust checks do not need repetition.

## Final-tree checks

| Command | Exit | Result | Seconds |
| --- | --- | --- | --- |
| `cargo fmt --all -- --check` | 0 | Formatting clean | 0.6 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | 0 | Warnings denied; clean | 40.15 |
| `cargo test --workspace --locked` | 0 | 260 passed, 0 failed; 1 existing ignored emitter | 157.78 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | 0 | 28 bootstrap fixture results | 35.49 |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | 0 | 124 full fixture results | 7.13 |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | 0 | No DuckDB/Polars/Python/CUDA engine dependency | 0.08 |
| `npm run wasm:build` | 0 | Actual Rust WASM built with wasm-bindgen 0.2.128 | 78.19 |
| `npm run contracts:check` | 0 | Generated contracts match Rust; 124 fixture structures valid | 2.47 |
| `npm run typecheck` | 0 | TypeScript clean | 6.96 |
| `npm run lint` | 0 | ESLint clean | 3.81 |
| `npm test` | 0 | 51 files / 427 tests passed (qualification 8 cases) | 75.33 |
| `npm run build` | 0 | Production build; existing large-chunk advisory only | 3.64 |
| `node scripts/check-release-manifest.mjs` | 0 | 13 assets; errors [] | 1.17 |
| `node scripts/check-release-candidate.mjs --dist` | 0 | 13 digests match; buildId 8f4710817afdc756 | 0.09 |
| `node scripts/check-design-tokens.mjs --self-test` | 0 | 12 self-tests; 72 tokens; 41/41 contrast cases | 0.06 |
| `node scripts/check-z-denominator.mjs` | 0 | 21 MERGED; 0 IN_PROGRESS/NOT_STARTED; runtime hits 0 | 0.08 |
| `node scripts/check-qualification.mjs` | 0 | 16 MERGED; runtime hits 0 | 0.08 |
| `node scripts/check-review-package.mjs` | 0 | 3 package files verified; approved false | 0.07 |
| `node scripts/check-product-contract.mjs` | 0 | 16 ids and 124 fixture impacts unchanged; runtime hits 0 | 0.07 |
| `npm run test:browser -- --project=chromium --workers=1` | 1 | 147 passed / 1 failed, 148 total; no retries | 955.94 |
| `npm run test:parity` | 0 | 2/2 passed; all 124 native/actual Chromium Worker-WASM fixtures agree, malformed payloads rejected | 36.88 |

 The native/WASM/contracts checks above preceded the dependent release-candidate metadata fix; their Rust, fixture and generated-contract inputs remained identical. Final typecheck/lint/unit/build and all handoff checks were executed after that fix.

## Historical run retained truthfully

Before the owner amendment, an earlier session completed the documentation-only F2 work and recorded 260 native tests, 421 unit tests and 124-fixture parity passing, but **full Chromium failed: 145 passed / 3 failed, 148 total**, exit 1, four workers, 263.1s. `a11y.spec.ts:152`, `drag.spec.ts:374` and `edit.spec.ts:44` expected search `done` but observed `interrupted`. The earlier session inspected contexts/traces and found no console-error events; that does not make those flows pass. Cause remains unproven and is not labeled a create-project flake or a host-only defect. No source fix or timeout/retry adjustment is claimed for those failures.

Earlier full report: `node_modules/.cache/audit-03-fix/browser-report/`. Traces, DRAFT failure PNGs and contexts remain in `node_modules/.cache/audit-03-fix/browser-artifacts/` under prefixes `a11y-axe-scan-detail-next--f0d90-`, `drag-plane-drag-matches-on-23b9d-`, and `edit-editing-is-verified-b-f33bb-`. The inherited full evidence is also preserved locally as `continuation/earlier-evidence.md`. That record's prior F3 DECISION_REQUIRED was superseded by the explicit October 22 owner decision, not silently ignored.

## Browser/parity result and limitations

The full final-tree Chromium suite ran once with one worker: **147 passed / 1 failed (148 total)**, exit 1, 955.94s. The full run itself was **not green**; see the owner-directed rerun below. `lifecycle.spec.ts:180` failed in `seededPlan` at line 32, caller line 192, before the old-rule assertions: search remained `running` while the assertion required `done`. The context reports the existing 60,000 ms expectation and 180,000 ms test timeout; the test reporter measured approximately 3.5 minutes. The assertion context recorded work 1,035 / node 9. The DRAFT failure screenshot was visually inspected and still showed calculation in progress (work 1,547 / node 11). Console-error events were empty in all trace streams. Cause remains unproven; no host-only or known-create-project-flake diagnosis is claimed. In the full run, no failed browser test was retried, skipped, deleted or given a higher timeout.

Final browser report: `node_modules/.cache/audit-03-fix/continuation/browser-playwright-report/`. Failure trace/context/DRAFT PNG: `continuation/browser-browser/lifecycle-an-empty-catalog-a2a03-ld-rule-cannot-be-completed-chromium/`. The reports/artifacts were copied before parity could replace the default reporter output. SHA-256:

- `test-failed-1.png`: `1a3a1d441fd4738fcc112463a67e02dd8d1587e3784af0d05bb0db1b5c879933`
- `error-context.md`: `f9d0a5cd07dd776d3340ee0a2582a95a50938bd05b6b5a69e23c0fcfd919c0f0`
- `trace.zip`: `f122ee49eb6ac8a1deda4fa7a02276a558d8e66f36ab3aba76f963d349a76c1b`

All 31 existing browser cases directly covering the F2 surfaces passed: portable-bundle 2, purchase-handoff 1, location-search 2, feedback-reorganize 3, print-share 6, privacy-offline 5, guided-onboarding 5 and catalog-crawler 7. Routes included `#/projects`, `#/project/<id>`, `#/project/<id>/plan`, `#/catalog` and `#/data`, using real IndexedDB and Rust Worker/WASM. Success/refusal cases covered broken/path-escape zip, seller-link/no-payment and stale information, planned versus observed locations, feedback cancellation preserving accepted plans, output revision mismatch, scoped deletion/export with failure/quota cases, invalid measurement help retaining text, and tampered/image/non-JSON catalog refusal. Their console/page-error checks passed. Onboarding help/focus request-count assertions and drag/projection request counts passed. Narrow 390px, responsive 320/390/768/1280/1440, keyboard, 200% zoom, forced colors and reduced-motion checks passed. These are desktop emulation, not physical-device qualification. The earlier three interrupted-search failures also passed in this final run; that does not cancel the remaining lifecycle failure.

`npm run test:parity` exited 0 in 36.88s: **2/2 passed**, all **124 shared fixtures** agree between native Rust and actual Chromium Worker/WASM, including structural malformed-payload rejection. Preserved parity report/artifacts are under `continuation/parity-playwright-report/` and `continuation/parity-browser/`. Parity does not make the full lifecycle suite green. Physical phones, discrete GPU, Firefox/WebKit, real-product collection sites and external catalog services are not qualified by this task. Synthetic/user-declared product evidence remains separate from physical verification; qualification PARTIAL, capture PENDING and release NOT_AUTHORIZED remain in force. No screen is promoted to an approved baseline. The supervisor's two independent reviews on its final exact HEAD and CI bridge remain separate required gates.


## Owner-directed rerun of lifecycle.spec.ts:180 (decision 2026-10-22 13:57 KST)

App source, Rust, fixtures and browser tests are unchanged from base, so the failure is pre-existing and out of this task's scope. As directed, only that spec was rerun three times, one worker, `--retries=0`, no timeout changes, command `npm run test:browser -- --project=chromium --workers=1 --retries=0 tests/browser/lifecycle.spec.ts:180`.

Note: the continuation host had lost `node_modules` (and the earlier local caches) before this rerun, so `npm ci` was run from the unchanged lockfile first (no dependency or lockfile change; `git status` unchanged). The earlier `continuation/` cache paths cited above therefore may no longer exist on this host.

| Run | Exit | Result | Seconds |
| --- | --- | --- | --- |
| 1 | 0 | 1 passed (test 8.5s) | 14 |
| 2 | 0 | 1 passed (test 8.3s) | 12 |
| 3 | 0 | 1 passed (test 8.2s) | 12 |

Conclusion: passes 3/3 in isolation but failed once in the 148-test full run (search stayed `running`, work still progressing). Recorded as a **pre-existing flaky test**, not fixed and not claimed as a host-only diagnosis. The full-suite non-green result above is retained unedited. Logs: `node_modules/.cache/audit-03-fix/rerun/run{1,2,3}.log` (ignored local cache).

## Final integrity and handoff state

Final integrity command: `python3 node_modules/.cache/audit-03-fix/continuation/check-integrity.py`. It runs `git diff --check`, an exact thirteen-path scope assertion, Markdown target existence checks, all-21 merge ancestry/second-parent/PR comparisons, base/current non-review gap/axis comparison and generated candidate-dist byte comparison. Its protected diff command is:

```bash
git diff --exit-code HEAD -- AGENTS.md .aiops docs/aiops .github docs/MASTER_PROMPT_KO.md docs/RUST_ADDENDUM_KO.md SOURCE_MANIFEST.json apps/web/src apps/web/tests/browser crates fixtures Cargo.lock package.json package-lock.json rust-toolchain.toml playwright.config.ts design/baselines docs/qualification/denominator.json 'docs/evidence/ZARI-SPATIAL-001-*.png'
```

Final integrity exited **0**: exactly **13 scoped paths**, **170 existing local Markdown targets**, empty protected diff, all 21 merge pointers verified, every non-review gap preserved, generated candidate dist byte-identical. Results and five non-Markdown scope-file SHA-256 values are saved in `continuation/integrity-result.json`. The local helper initially compared a newline-trimmed `git show` string with raw worktree text; that helper-only false assertion was corrected to compare untrimmed content before this passing execution. No repository artifact was changed for it. The spatial-view browser test produced byte-identical SPATIAL-001 PNGs, so `git diff` found neither changed and no checkout restoration was needed. All screenshots remain DRAFT evidence; no capture acceptance is transferred. Only evidence/status changed after browser/parity.

**F2 and amended F3 are implemented.** The only non-green gate item, `lifecycle.spec.ts:180`, is recorded above as a pre-existing flaky test under the owner decision of 2026-10-22 13:57 KST (no app, Rust, fixture or browser-test source differs from base; it passed 3/3 in isolation). CI and the two exact-HEAD independent reviews remain the gate. No application search fix or other program node was started. Commit/push/PR and subsequent reviews/CI remain with the supervisor. Builder status: `STATUS: READY`.
