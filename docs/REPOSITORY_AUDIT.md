# ZARI repository reality and architecture audit

Status: architecture proposal, 2026-09-21 UTC. This is an evidence-based audit of the existing source documents and an author challenge of the new design, not independent approval of the architecture author's own PR. No application implementation is claimed.

## 1. Pinned reality

| Fact | Observed value |
|---|---|
| Repository | `BeautifulMind-JT/ZARI`, private |
| Default/inspected remote branch | `main` |
| Prompt's known SHA | `335c4ba3d0059ed99841bc8e6673477f24154c90` |
| Actual main at intake | `46082a909c9210c7dbd0ee9946386dc18246108e` |
| Comparison | 14 commits ahead, 0 behind; architecture target moved |
| Changed since prompt SHA | `AGENTS.md`, `RUNBOOKS/DISPATCH.md`, `TASKS/TEMPLATE.md`, `docs/IMPLEMENTATION_STATUS.md` |
| Architecture working branch | `astra/zari-architecture-v1`, based on actual main |
| App code | No executable app. One CSS token seed and one Node token checker exist |
| Toolchain/build/CI | No Cargo/package manifest, lockfile, Rust/TS source, workflow, or deployment |
| Visual approval | Empty baseline manifest; zero approved screens |
| PRs | #1 merged 2026-09-21 13:09:52 UTC; no open PRs at intake |
| Automation | `MANUAL_ONLY`; reviewer lane `CONFIG_REQUIRED`; automation not implemented/enabled |

Remote branches at intake:

| Branch | SHA | Architectural effect |
|---|---|---|
| main | `46082a909c9210c7dbd0ee9946386dc18246108e` | Current target |
| design/foundation-v1 | `335c4ba3d0059ed99841bc8e6673477f24154c90` | Already incorporated design basis |
| docs/initial-project-setup | `efc661940e08405e45d9df468346b3df21508a29` | Historical initial documents |
| ops/agent-control-plane-20260921 | `960e31d1741f09db77bf715f16eea33d7b0b5ee3` | Merged through #1, current governance applies |

The merge commit explicitly says independent audit PASS was not asserted. A merge is not evidence that the control plane is implemented or independently verified. No divergent application branch was found in the complete branch list.

## 2. Complete tracked tree at intake

```text
.gitignore
AGENTS.md
DESIGN.md
README.md
RUNBOOKS/DISPATCH.md
SOURCE_MANIFEST.json
TASKS/TEMPLATE.md
apps/web/src/styles/tokens.css
design/COMPONENTS.md
design/DECISIONS.md
design/REFERENCES.md
design/REVIEW_CHECKLIST.md
design/SCREENS.md
design/VALIDATION.md
design/baselines/README.md
design/baselines/manifest.json
design/token-contrast-cases.json
docs/IMPLEMENTATION_STATUS.md
docs/MASTER_PROMPT_KO.md
docs/RUST_ADDENDUM_KO.md
scripts/check-design-tokens.mjs
```

All 21 blobs and the complete Git tree were verified against the pinned remote objects. A shallow local checkout was materialized through authenticated GitHub reads; direct shell cloning was unavailable. Its original signed base commit object and tree hashes match the remote. This is not an invented local baseline commit.

## 3. Required reading and preserved sources

Read order: README, AGENTS, status; both source prompts completely; DESIGN, SCREENS, COMPONENTS, DECISIONS, REVIEW_CHECKLIST, REFERENCES, VALIDATION, baseline README/manifest, tokens, contrast cases; SOURCE_MANIFEST, .gitignore, checker, task template and dispatch runbook. Existing prompt execution instructions apply to implementation phases; the current user's documentation-only mission governs this phase.

| Preserved source | Bytes | SHA-256 |
|---|---:|---|
| MASTER_PROMPT_KO.md | 44848 | `29bedf2c458949228bcd65532da9c02d0dee2d7d42214a27a8b9ca540477fe63` |
| RUST_ADDENDUM_KO.md | 25402 | `f375370349969d8c8e99b045b75f78d64ee1dae37c4b4f4dbf323031778addfc` |

These files and SOURCE_MANIFEST are immutable in this mission. New contracts distill them; they do not erase their scope or historical wording.

## 4. Strengths and actual findings

The product thesis, Rust authority, integer arithmetic, source provenance, conditional results, deterministic budgets, independent validation and honest screen states are already unusually explicit. They are requirements, not implemented guarantees. There is no evidence for replacing Rust or building a backend now.

| ID / severity | Evidence | Finding and disposition |
|---|---|---|
| A01 / MUST RESOLVE BEFORE RELATED TASK | Status: “PR #1, 미병합”; remote #1 merged | Stale status, corrected by a dated current-state entry without rewriting history |
| A02 / resolved precedence, not a new blocker | Master §§9,17,20 vs Rust Addendum §§1–6,14 | Original TS domain/testing suggestions are superseded for authority by Rust; UI tests remain TS. No second production solver |
| A03 / MUST RESOLVE BEFORE RELATED TASK | Master §§6,11; Addendum §4 | Numeric limits, interval semantics and verified vs estimated missing. DOMAIN_MODEL fixes them before task 002 |
| A04 / MUST RESOLVE BEFORE RELATED TASK | Master §§9–10 | Inner dimensions do not locate an asymmetric cavity. Require separate inner offset; unknown offset cannot fabricate global contents coordinates |
| A05 / MUST RESOLVE BEFORE RELATED TASK | Master §§10,14; Addendum §9 | Final-fit and insertion/access order underspecified. SOLVER fixes straight-path assembly ordering, retrieval blockers and no stacking |
| A06 / MUST RESOLVE BEFORE RELATED TASK | Addendum §§5–8; SCREENS S01–02 | Revision alone misses invalid raw edits, project reopen and worker restart. Add editorEpoch, projectActivationId, workerSessionId, request/context matching |
| A07 / MUST RESOLVE BEFORE RELATED TASK | Addendum §7 | Cancel message alone cannot interrupt synchronous WASM. Bounded work steps, macrotask yields, hard worker termination and trap retirement specified |
| A08 / MUST RESOLVE BEFORE RELATED TASK | Master §§15,19; Addendum §5 | Snapshot identity, schema migration, draft/accepted history and multitab CAS not defined. DOMAIN_MODEL/PERSISTENCE now own these contracts |
| A09 / MUST RESOLVE BEFORE RELATED TASK | DESIGN §§3,5; tokens.css | No dedicated unknown/stale/disabled aliases; selection and success are both green. Preserve palette; add semantic aliases and redundant shape/text before task 007 |
| A10 / MUST RESOLVE BEFORE RELATED TASK | Master §15; Addendum §9 | “Verified” could be misread as all checks pass. Separate validator-executed conditional plan, physically confirmed plan, user acceptance and commerce readiness |
| A11 / MUST RESOLVE BEFORE RELATED TASK | Master §§12–13 | Missing ranking/tie-break/catalog identity/search-scope contract. SOLVER and DOMAIN_MODEL specify; unknown cost never ranks as free |
| A12 / BLOCKER to claiming merge-ready, not to drafting | AGENTS §§8–10; RUNBOOK §§13–18 | Architecture author cannot issue independent audit PASS. User-designated non-author auditor and required read-only reviewer must supply exact-HEAD evidence before normal merge gate |
| A13 / SAFE TO DEFER | Master §4; Addendum §§10–13 | Arbitrary 3D, lids/drawers, GPU, external AI, clouds remain disabled, not empty abstractions advertised as support |
| A14 / SAFE TO DEFER | DESIGN §8, DECISIONS D004 | Tool choices were candidates. Choose React Aria/native for implementation; defer Motion/Storybook/design agents with explicit adoption triggers |
| A15 / COSMETIC | Preserved title/code name | Historical organization-compiler naming is retained in source prompts; ZARI is the only current product name |

## 5. Risks challenged rather than concealed

Rust/WASM has a real compilation/serialization cost; a 20-container planner does not need Rust for speed alone. Its justification is one testable computational authority, exact integer contracts and native reuse. Task 001 must test the actual browser bridge before expanding it. A coarse JSON boundary is deliberately simple and measurable.

A custom bounded solver is maintainable only with an honest search scope, reference determinism, adversarial validator tests and quantity conservation. It must never claim global infeasibility. A narrow insertion model is acceptable only if unsupported manipulations are clearly identified. Unknown safety-critical fields cannot yield an unconditional execution recommendation.

No real catalog, exact compatible installed package matrix, application benchmark or browser proof exists today. Task 001 pins and validates tool versions. Real-data readiness is a later gate. Browser-only local persistence is neither a backup nor proof of offline reload support.

## 6. Verification in this mission

Ran the existing checker: 10 self-tests, 69 tokens, 30/30 declared contrast pairs pass. Preserved prompt bytes/hashes match SOURCE_MANIFEST. Documentation paths and allowed diff are checked before publication. No dependencies installed; no app implementation, app tests, browser flow, performance result, visual baseline approval or formal independent audit PASS is asserted.

Repository evidence: [pinned main](https://github.com/BeautifulMind-JT/ZARI/tree/46082a909c9210c7dbd0ee9946386dc18246108e), [merged PR #1](https://github.com/BeautifulMind-JT/ZARI/pull/1).
