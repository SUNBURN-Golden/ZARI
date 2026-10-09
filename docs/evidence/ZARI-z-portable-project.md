# ZARI-z-portable-project evidence

Delivered via the PR opened by the supervisor. This file is not a review PASS. Nothing here is an approved baseline, a physical measurement, or a release.

- Task: GitHub issue #96, node z-portable-project, “프로젝트 이식·검증된 가져오기”.
- Plan commit: `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-z-portable-project`.
- Observed base SHA: `f67ce9d2b0eabcce27645ef47ac338127e94283e` (origin/main at branch creation; the plan commit is an ancestor).
- Pinned docs used for this node: `AGENTS.md`; `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2; `docs/SPATIAL_INTERACTION_PLAN.md`; `docs/SPATIAL_VIEW_CONTRACT.md`; `design/SPATIAL_WORKSPACE.md`; `docs/SPATIAL_VERIFICATION.md`; `DESIGN.md`; `design/DECISIONS.md`; `design/SCREENS.md`; `design/COMPONENTS.md`; `design/REVIEW_CHECKLIST.md`; `docs/DOMAIN_MODEL.md`; `docs/WASM_PROTOCOL.md`; `docs/PERSISTENCE.md`; `docs/ARCHITECTURE.md`; `docs/TEST_STRATEGY.md`; `docs/MASTER_PROMPT_KO.md`; `docs/RUST_ADDENDUM_KO.md`. Previous node evidence and ADRs were read. Candidate files under `docs/aiops/**` were not used as extra scope. `.aiops/**` and `docs/aiops/**` were not edited.
- Adoption: JunTae Park (준태, repository owner), 2026-10-07 12:42 KST, verbatim: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." Recorded in `design/DECISIONS.md` Dz-portable-project and `docs/adr/SP-z-portable-project.md`. This delivery is z-portable-project only. Fable NONE and the non-author A2 are replaced by two independent read-only reviews. Merge is delegated to the supervisor. The quote does not adopt checkout, cloud, photo consent, capture acceptance, or release.

## What changed

A portable file is a STORE zip beside exportVersion 1 JSON. Rust `buildPortableBundle` and `inspectPortableBundle` check version, sha256, declared size, duplicate ids, path names, and zip structure before the host keeps member text. A declared compression bomb is refused without inflate. Deflate under the size cap is `unsupported_compression` and is not inflated. Photo bytes stay out. GPS/EXIF keys and personal-data keys in attachment metadata are refused. The policy is fixed: photo bytes excluded, location stripped, personal data omitted. Local originals are not deleted. The shared owned library is not a member.

The project screen offers four inclusion checkboxes and the policy text, then downloads `zari-<projectId>-portable.zip`. The projects list accepts `.zip` as well as JSON. A rejected inspect does not call `stageProjectImport` and writes nothing. An accepted zip with a project member is rebuilt as an exportVersion 1 envelope and committed under a fresh project id. A ledger, when present, is inserted in that same transaction with the new project id and revision `1`. The source project and source ledger stay. exportVersion 1 JSON still has no ledger field.

`BUILD_ID` stays `zari-domain-7`. No new color token and no new contrast case. The panel uses existing surface, text, border, and touch tokens.

## Changed paths

- Adoption: `docs/adr/SP-z-portable-project.md`, `design/DECISIONS.md` (Dz-portable-project), a z-portable-project-only note in `docs/PRODUCT_COMPLETION_EVOLUTION_KO.md`.
- Rust: `crates/core/src/portable.rs`, `crates/core/src/lib.rs`, `crates/core/src/protocol.rs`, `crates/core/tests/portable_bundle.rs`, and capability-order assertions in `protocol.rs`, `product_completion_contract.rs`, `offer_bundles.rs`, `catalog_provenance.rs`, `inventory_lifecycle.rs`.
- Host: `apps/web/src/features/project/portable.ts`, `apps/web/src/features/project/PortablePanel.tsx`, `apps/web/src/features/project/transfer.ts`, `apps/web/src/persistence/repository.ts`, `apps/web/src/app/ProjectScreen.tsx`, `apps/web/src/app/ProjectsScreen.tsx`, `apps/web/src/styles/project.css`, `apps/web/src/worker/client.ts`.
- Generated, by `npm run contracts:generate`, not by hand: `apps/web/src/contracts/generated/dto.ts`, `schema.json`, `validators.mjs`. `validators.d.mts` was unchanged.
- Contract list only: `docs/product-expansion/contract.json` `baseCapabilities` gained `buildPortableBundle` and `inspectPortableBundle` before `disposeProject`.
- Living docs: `docs/PERSISTENCE.md` §17, `docs/WASM_PROTOCOL.md` §2 and §14, `docs/IMPLEMENTATION_STATUS.md`, this file.
- Tests: `apps/web/tests/unit/portableBundle.test.ts`, `apps/web/tests/browser/portable-bundle.spec.ts`.

`fixtures/`, `Cargo.lock`, `.aiops/**`, `docs/aiops/**`, `SOURCE_MANIFEST.json`, and `docs/evidence/ZARI-SPATIAL-001-*.png` were not rewritten. No new dependency. `sha2` was already in the workspace.

## Acceptance mapping

| Acceptance | Where it is checked |
|---|---|
| A failed import does not overwrite a good project | `portableBundle.test.ts` first test: after a bomb, a path escape, an old version, and an oversized file, the empty store still has one imported project and the same `planSnapshotId`. The source project name and ledger id stay. Browser `portable-bundle.spec.ts` second test: three rejected zips leave one project row |
| Path escape, compression bomb, and unsupported version are refused | Rust `path_escape_zip_bomb_old_version_and_oversize_are_refused`. The same three codes in the unit test and the browser rejection panel. The bomb slice sends one `inspectPortableBundle` and zero `verifyRecord` |
| Export into another empty store keeps the canonical snapshot | Unit test: second Dexie database, import, `planSnapshotId` `297d1d8671646e55c9f27dc3d047879a975884d688ce9d8d09308d051ab60608`, snapshot body equal, ledger body copied under the new project id. Browser success test: width 640 survives under a new project id |
| Inclusion choice and the photo, location, and personal-data policy | Panel checkboxes and `portable-policy`. Space toggles the catalog checkbox. Rust rejects an attachment `latitude` before any write. Photo bytes stay excluded |

## Commands

Shell prefix for every command: `PATH=$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH` and `CARGO_BUILD_JOBS=4`. `node -v` was v24.19.0. `npm -v` was 11.17.0. `rustc` was 1.98.1 via `rust-toolchain.toml`. wasm-bindgen was 0.2.128. Playwright timeouts were not raised.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 |
| `cargo test --workspace --locked` | exit 0. 191 passed, 0 failed, 1 ignored. The ignored test is the pre-existing completion-query ignore |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap` | exit 0, 28 fixtures |
| `cargo run -p zari-core --locked --example fixture_runner -- fixtures` | exit 0, 124 fixtures. `git diff -- fixtures` empty |
| `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked` | exit 0. Direct crates: `serde_json`, `wasm-bindgen`, `zari-core`, `zari-solver`. No zip crate |
| `npm run wasm:build` | exit 0. wasm-bindgen 0.2.128 |
| `npm run contracts:generate` then `npm run contracts:check` | generate exit 0, “Generated 4 Rust contract artifacts; 124 fixture structures valid.” check exit 0, “Contracts match Rust source; 124 fixture structures valid.” Generated files were not hand-edited |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0. vitest 28 files, 184 tests |
| `npm run build` | exit 0. Vite printed the existing chunk-size warning. It is not a failure |
| `node scripts/check-release-manifest.mjs` | exit 0. `errors: []`, manifest `buildId` `c8f331b5450f477e`, 11 assets. The hash changed because the web bundle changed. Engine `BUILD_ID` stays `zari-domain-7`. This check ran on the production build, before later test-mode rebuilds |
| `node scripts/check-design-tokens.mjs --self-test` | exit 0. 12 checker self-tests; 39/39 contrast cases. No new token or contrast case |
| `npm run test:browser -- --project=chromium` | exit 0. 100 passed (4.7m), 4 workers. Preview `http://127.0.0.1:4173` |
| `npx playwright test apps/web/tests/browser/portable-bundle.spec.ts --project=firefox` | exit 0. 2 passed (10.0s). The test-mode build from the Chromium run was still in `apps/web/dist` |
| `npx playwright test apps/web/tests/browser/portable-bundle.spec.ts --project=webkit` | exit 1. WebKit did not launch. Missing host libraries include `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libGLESv2.so.2`. UNVERIFIED |
| `npm run test:parity` | exit 0. 2 passed (28.8s). “Native and actual browser Worker/WASM comparison completed for 124 shared fixtures.” |

## Browser

Route: project screen export, then the projects list import. Chromium full suite and the new spec on Firefox. The Chromium preview was `http://127.0.0.1:4173`. Success viewport starts at 1440×1000, then 390×900 and 1440×900 with no page overflow, then `forcedColors: active`. The policy text and the export button stay visible. Collected `pageerror` and console `error` lists in `portable-bundle.spec.ts` were empty. `spatial3d` in the same Chromium run reported `context-lost-console: none`. No `worker-state` flake. Phone and discrete GPU were not available and are UNVERIFIED. These viewports are desktop emulation.

Success: create a project, set 공간 안쪽 폭 to 640, commit, read the photo/location/original policy, Space-toggle the catalog checkbox off and on, download `*-portable.zip`. A mutation observer on `data-state` saw `working` before `portable-ready`. Import review says 사진 바이트 제외. The new project id differs and the width is 640.

Failure: a declared 50_000_000-byte deflate entry, a `../secret.json` member, and portableBundleVersion 0 each show the Korean rejection and leave the one project row.

## Contract-change advisory

`contract_change` for this node is two new stateless commands and capabilities. `BUILD_ID`, `ruleVersion`, protocol version, canonical version, persisted schema, exportVersion 1, live `DB_VERSION` 3, and the 124 fixture expected bytes stay. The product-contract document still says `contractChange` NO, `dbVersion` 2, and `implementsNow: false`. Those locks were kept. The export gap sentence and `heldUntilOwningNode` still name a portable zip. That sentence was left in place, the same way earlier nodes left their gap sentences. The live base capability list gained `buildPortableBundle` and `inspectPortableBundle` before `disposeProject`. This node does not set `implementsNow` true.

## Known limits

- Photo bytes are always excluded. Including them is the open photo-consent decision and was not done.
- Location and personal-data keys are refused. This node does not delete the originals on this device. That remains z-privacy-offline.
- The zip writer emits STORE only. A deflate member under the size cap is refused and not inflated.
- The zip ceiling is 1,572,864 raw bytes so base64 stays under the 5 MiB worker message. JSON import stays at 10 MiB.
- WebKit, a phone, and a discrete GPU were not available. Desktop emulation is not a device.

## Out of scope

The next z-node, checkout, cloud, accounts, purchase, photo-byte inclusion, deleting local originals, a `BUILD_ID` bump, and rewriting exportVersion 1.
