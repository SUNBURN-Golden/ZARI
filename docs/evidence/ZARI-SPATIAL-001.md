# ZARI-SPATIAL-001 evidence

This file records what this working tree actually ran. It is not a review PASS.

- Task: GitHub issue #43, node 001, plan commit `0847d1b065627938acfad3a941de79e357570e43`.
- Branch: `astra/zari-spatial-001`.
- Observed HEAD: `84036631c945a59fee4de325409f835246536b96` (origin/main at branch creation). The implementation is uncommitted on top of that commit. No pull request was opened.
- Pinned docs read from that plan lineage: `docs/SPATIAL_VIEW_CONTRACT.md`, `docs/AIOPS_SPATIAL_EXECUTION_PLAN.md` §2 and §4, `docs/WASM_PROTOCOL.md`, `docs/TEST_STRATEGY.md`, `design/SPATIAL_WORKSPACE.md`.

## Contract change

`BUILD_ID` is `zari-domain-4`. The ready capability list adds `projectSpatialView` immediately before `disposeProject`. `protocolVersion`, persisted `schemaVersion`, and PlanSnapshot bytes stay at 1. `projectSpatialView` returns `spatialViewProjected` and does not mutate context or search. The page stores the read model only in session memory.

## Acceptance mapping

| Acceptance | Evidence |
|---|---|
| R1 yaw90 numbers | Rust unit `r1_yaw90_child_global_box`; fixture `spatial-yaw-offset` world min `[380,240,5]` max `[440,290,75]`; browser test asserts the same WASM event |
| Unknown offset | Fixture `spatial-unknown-offset`: world/top `offset_unknown`, cavity-local `[30,40,0]`–`[80,100,70]`; diagram omits the child and shows the separate-frame caption |
| Rectangles invert only at paint | `projection.ts` keeps domain `[x,y]` / `[x,z]`; `PlanScreen` applies `scale(1,-1)` |
| No competing yaw/offset projection | `view.ts` no longer builds placement rectangles |
| Refs resolve or are explicitly unavailable | Empty spatial targets use `LinkResolution::Unavailable` plus a reason |
| Existing fixtures byte-identical except build id | 102 pre-existing fixture JSON files match `/workspace/zari43/base` after reversing `engineContext.buildId` to `zari-domain-3`. Manifest entries for those ids are unchanged. Five spatial entries and files are new |
| Native and browser outputs equal | `npm run test:parity`, 107 fixtures |
| Stale system reply | Session lease checks project, `plan:<planSnapshotId>`, worker object, and mount generation. `systemRequest` survives an editor-epoch bump and is still dropped when that lease does not match |
| Renderer failure keeps text/BOM | Diagram failure is a notice; placement list and BOM stay on the snapshot |

## Pictures

Draft only. Not an approved baseline.

- `docs/evidence/ZARI-SPATIAL-001-yaw-offset.png` — top and front of `spatial-yaw-offset`. The yaw90 container's domain top rect is `[100,200]`–`[500,500]` in a depth-400 compartment, so the rear edge crosses the compartment outline. The contained item is the dashed rect at `[380,240]`–`[440,290]`.
- `docs/evidence/ZARI-SPATIAL-001-unknown-offset.png` — same container, no contained rect, caption `외형 안의 실제 위치 미확인 · 별도 좌표계`.

Browser flow exercised in Chromium (viewport 1440×1000, `ko-KR`, reduced motion): create/fill/commit/plan/search, diagram+checks+BOM+guide, accept and reload, edit ghost/undo, probe pass/fail/unknown. Commands and counts are in `docs/IMPLEMENTATION_STATUS.md` (2026-10-06 section).

## Deviations

- `scripts/wasm-build.mjs` reads `CARGO_TARGET_DIR` when locating the wasm artifact. Unset, the path stays `target/...`.
- Bench persistence calls in `apps/web/tests/harness.ts` still pass `engineBuildId: 'zari-domain-3'`. That stamp is not the Worker handshake. The handshake build id is `zari-domain-4`.
- `SupportFootprint` and `LiftContents` are in the DTO and are not emitted.
- Arrow-key step remains 10mm, Shift 1mm. SP-003 owns the documented 1mm default.
- No new external crate. `Cargo.lock` is unchanged.

## Out of scope

Nodes 002–007, drag, 3D, toolbar, persisted schema migration, physical-check rule changes. Coordinate math still needs an independent architecture review; these greens do not replace it.
