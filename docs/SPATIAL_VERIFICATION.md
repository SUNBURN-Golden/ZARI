# 공간 작업대 확장 검증·성능·보안 계약

상태: 설계 후보. 아래는 **실행할 목표/명령**이며 이 문서 작성 시의 성적이 아니다. 기존 [TEST_STRATEGY](TEST_STRATEGY.md), [PERFORMANCE_SECURITY_FAILURES](PERFORMANCE_SECURITY_FAILURES.md), [공통 공간 계약](SPATIAL_VIEW_CONTRACT.md)을 보충한다.

## 1. fixture와 oracle

`fixtures/spatial/`에 Rust DomainFixture/manifest 경로로 추가한다. 같은 JSON을 native `handle_json`과 실제 browser Worker/WASM에서 실행; runtime IDs 등 기존 비권위 metadata만 정규화한다. projection fields/typed targets/source stamps/diagnostics/array order는 exact compare. TS에 독립 물리 oracle을 두지 않는다. UI tests에서 worker mock만으로 통합 통과 주장 금지.

| Case ID family | 입력/검증 기준 |
|---|---|
| spatial-parent-offset-yaw0 | asymmetrical cavity offset; child local/orientation→global box 정확 |
| spatial-parent-offset-yaw90 | PLAN R1의 수치, 원래 outer depth, child own yaw90도 추가 |
| spatial-offset-unknown | cavity-local 있음, global child 없음/미확인, 원점 default 없음 |
| spatial-third-axis-unknown | known two-axis top/front; 3D 없는 것으로 명시 |
| spatial-uncertainty-unknown/bounded | nominal과 conservative의 분리, provenance 보존 |
| spatial-direct-owned-new | 구매 없이 direct와 owned; new도 같은 scale |
| spatial-handles-known-unknown | nominal outer/occupied envelope를 구분, handle 추정 없음 |
| spatial-opening-staging-obstacles | signed y staging, aperture offset/axis, physical/access exclusion 구분 |
| spatial-install-operational | 두 retrieval mode, handling unknown, blockers/order unknown; overlay를 pass로 해석하지 않음 |
| spatial-bom-multiple | BOM placementIds 전부 연결, packs/surplus 원본 그대로 |
| spatial-action-exact-instance | 한 parent 내 같은 item 여러 ordinal, shared opaque ID mapping 정확 |
| spatial-action-unassigned/history | shape 없는 step와 지원되지 않는 action mapping의 explicit 이유 |
| spatial-invalid-digest/ref/limit | 잘못된 source digest/unknown field/dangling ref/array cap/message cap 거절 |
| spatial-coordinate-extremes | ±PositionMm 입력, derived view bound/overflow, finite 정수만 |

숫자 예시 단위 oracle는 hand-checked expected 값으로 시작하고 geometry helper property test를 함께 둔다. engine-generated fixture expected를 무조건 정답으로 승인하지 않는다. R1 fixture를 independent reviewer가 Rust 수식/기존 DOMAIN_MODEL과 직접 대조한다. 기존 102 fixture라는 과거 기록을 새 CI 성적으로 재사용하지 않는다; 실행 당시 actual count를 보고한다.

## 2. Rust 테스트

- yaw0/90×child yaw0/90×nonzero offset, parent min/cavity min/extent를 fixture로 검증.
- property: global child transform의 부피 보존(checked integer), yaw 두 번이 원래 frame과 정의대로 대응, same source→same projection ordering, raw unknown never gets a world box, emitted references all resolve or are explicitly unavailable.
- uncertainty: conservative occupied/available geometry를 nominal과 바꾸지 않음. unknown bound→conservative unavailable. zero offset allowed, zero physical extent rejected.
- shared motion helper extraction 전후 모든 validator statuses/reason IDs/actions/PlanSnapshot IDs 일치. 함수 공유를 이유로 independent validator가 projector validity를 신뢰하지 않음.
- projection 요청이 engine activation/search counters/search results/BOM/actions/source bytes를 수정하지 않는 integration test.
- 전송 array/byte/overflow bound와 malformed source가 panic/trap 대신 구조화 실패.

## 3. frontend/Worker tests

projection lease: source switch, raw-editor bump, stale system response, worker recovery, same source dedupe, disposed session, limit failure. baseline source 바이트/ID 유지. focus/hover/layer/step-navigation/pointermove의 Worker·DB call count=0. source당 projection request 한 번/coalesced; cache evictions 상태를 올바르게 복원.

state reducer: selection/focus 독립, snapshot switch clear, view switch retain, BOM multi-set, child edit-parent 관계, identical raw ID different namespaces, unknown geometry text-list retention. field focusWithin은 unit select에서도 유지. scaling transform/inverse는 resize, negative y, front z↑, zoom/pan을 대상으로 round-trip screen error<=0.25 CSS px. 이 tolerance는 domain fit tolerance가 아니다.

drag: click/no-op/cancel 0 commands; changed pointerup 1 command; one verified transition; rejected move no history; reverse/negative quantization ties; outside canvas capture; Escape/pointercancel/multitouch/lost capture/blur/hidden/resize; edited input/catalog/base/head/activation switch; no second pending edit; failures/trap/timeout/CAS conflict. 기존 coordinate/rotation/undo 경로와 same-command behavior를 대조.

progress: progress=null 처리, prerequisite/dependent failures, requiredConfirmation unsupported, accepted/current input mismatch, raw stale, new accepted snapshot during await, two-tab CAS, reload. 늦은 ack가 새 snapshot map에 들어가지 않음. checkbox 성공 전 done 아님. accepted progress가 working plan에 보이지 않음.

3D lifecycle: lazy chunk network 0 until explicit 3D, typed picking maps exact instance, cutaway pick ignore, no edit commands, demand-render counters, project switch cleanup, failed module load/WebGL/contextlost/retry/fallback. Stub WebGL test는 lifecycle 단위 검증이며 actual browser GPU behavior의 대체 아님.

## 4. 실제 브라우저 flow

각 UI 태스크는 실제 dev/test build를 실행하고 자신의 흐름을 success와 대표 failure로 조작한다. Console/pageerror/network failure 기록과 browser/runtime version, base/final HEAD, exact commands, screenshots의 scenario를 제출한다.

1. Keyboard만으로 known·unknown·invalid 입력, mm/cm, 치수선 강조, normalize, save/reload.
2. 계획 생성, 수납함 선택, 외경/내경/접근 unknown 근거, child-parent yaw fixture, BOM multi-row 연결.
3. 평면 valid move, out-of-bounds/rejected move, no-op, Escape, pointercancel, input change while drag/evaluating, keyboard 동일 이동, undo/redo, save failure와 reload.
4. action step 선택/앞뒤 단계, prerequisite 차단, accepted vs working vs stale, progress read failure, await 중 accept switch, two tabs, reload completion.
5. 3D oblique/top/front, 앞·윗 경계 cutaway, 내부 contents, 선택 2D↔3D↔BOM↔check↔step, hidden child no picking, snapshot switch, WebGL unavailable/contextlost/chunk failure, 2D recovery.
6. offline revisit 후 처음 3D를 선택하는 케이스, cached release의 lazy chunks 포함 여부, old service-worker/new build mismatch recovery. offline가 된 상태로 artifact missing이면 제한을 사실대로 표시하고 silent online fetch를 성공으로 간주하지 않음.

sizes 320/390/768/1280/1440 CSS px, 200% 확대, reduced-motion 양방향, forced colors, keyboard-only, browser-engine Chromium/Firefox/WebKit. 한 host에서 엔진 동시 부하로 flake가 생기면 각 엔진을 순차 실행하고 원인을 보고한다. physical Android Chrome과 iOS Safari는 별도 체크: 에뮬레이션/WebKit을 실제 기기 성적으로 기록하지 않는다. 기기를 못 쓰면 UNVERIFIED, hardware readiness gate가 남는다.

## 5. 실행 명령 계약

현재 package.json/README에 존재하는 명령은 다음과 같다. 성공 횟수나 결과를 미리 채우지 않는다.

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo run -p zari-core --locked --example fixture_runner -- fixtures
npm run wasm:build
npm run contracts:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:parity
npm run test:browser -- --project=chromium
npm run test:browser -- --project=firefox
npm run test:browser -- --project=webkit
node scripts/check-design-tokens.mjs --self-test
npm run bench:browser
npm run capture:baselines
npm run dev -- --host 127.0.0.1
```

Dependencies/toolchains use current exact pins. Builder may run `npm ci` and browser install during implementation where needed; this **design-only** package does not do so. Generated DTO updates require `npm run contracts:generate` followed by check+diff and native/WASM evidence. Browser command grep behavior currently excludes @parity/@capture/@bench; feature specs must be normal browser tests, while benchmark/capture extend corresponding paths. SP-006 extends existing `bench:browser`; do not document a new script as runnable before it exists. SP-007 extends existing `capture:baselines` scenarios, never `--update-snapshots` as blanket approval. Required repository CI check `bridge` must pass at delivered HEAD for AIOPS merge; local green does not waive it.

## 6. 성능 목표와 측정 방법

아래 수치는 시작 시의 **검증 목표**이며 달성 결과가 아니다. 보고서에서는 목표/충족/초과/미측정을 구분한다.

Reference: 1 compartment, ~100 catalog variants (existing solver input), <=20 containers, <=200 expanded contents, <=20 obstacles, nominal/conservative overlay off/on, direct/owned/new/no-purchase. Include unknown-offset and maximum legitimate geometry counts. 3D cost depends on drawn primitives, not raw catalog size; scene에 전체 카탈로그의 100 variants를 렌더링하지 않는다.

| Stage | Desktop p95 target | Measurement |
|---|---|---|
| Rust projection | <=20ms | direct native and browser WASM segment, warm 50 samples/source family |
| projection JSON encode+decode | <=10ms at reference fixture | both boundaries separately, payload bytes |
| Worker transport | <=10ms | same-message timestamp decomposition, never worker-direct subtraction |
| matching 2D render/selection | <=16ms | state dispatch→paint/React profiler, frame cost |
| pointer preview | <=8ms JS per frame; input→paint <=32ms | scripted gesture + frame timings; Rust calls 0 |
| first 3D ready | <=1000ms warm cached module | explicit click→first correct source frame, import/scene/render split |
| changed 3D frame | <=16ms CPU+observed frame | labels/scene update + render; disclose GPU timing availability |
| idle 3D | 0 scheduled draws after quiescence | 5s idle frame counter, hidden document/offscreen checks |
| dispose/switch | no cumulative retained scene resources | 20 open/switch/close cycles, renderer.info + heap trend vs baseline |
| compressed optional 3D assets | <=250KiB target incremental | built chunks incl three/OrbitControls; measure gzip/Brotli consistently |

Cold transfer is measured separately with cold browser profile/cache and a stated network profile. Do not combine download speed with solver time. Desktop host CPU/OS/browser/GPU/DPR/power/viewport/build/fixture digest, cold20/warm50, p50/p95/max, payload/draw calls/geometries/textures/React commits를 artifact에 기록한다. Actual phone reference target: changed frame<=33ms, preview input→paint<=50ms, cached-first-3D<=1500ms; still measure and disclose shortfalls. No proof of overall beta readiness from these targets alone.

Budget miss: first profile stage boundary and same machine; reduce layers/labels/resource churn or batch identical boxes within the frozen model. Do not shrink real geometry, omit objects silently, move physical validation to TS, add GPU solver, external CDN, or upgrade the complete toolchain to make a chart green. Keep 2D functional if optional 3D cannot meet supported-device requirements.

## 7. 보안 경계

- No floorplan-3d source/assets/import format copied. No CDN module/remote fonts/textures/glTF/HDR; dependencies locked, license/registry integrity/audit results recorded by SP-005. npm audit findings must be interpreted by reachable code/version, not called safe solely because the tool returns 0.
- Imported source/labels stay behind existing bounded Rust DTO/integrity checks. Projection labels rendered as escaped text; no innerHTML/dangerouslySetInnerHTML/eval/Function. Typed namespace keys are not JS property evaluation paths. Oversized sources/meshes/arrays fail before resource creation.
- External seller links retain existing URL validation and noopener/noreferrer semantics. No new fetch/upload/telemetry/AI provider/secret required. Renderer/browser-network verification must record that project/catalog/photo data never goes to a third party.
- Photo attachments remain local. Do not put the user's interior image into an external texture, AI request or exported scene. This phase has no photo-based measurement/3D reconstruction.
- Offline service worker must cache local lazy chunks from its **existing release manifest** after first visit, so an offline first-ever 3D click can work. If current shell manifest omits lazy assets, SP-005/006 may fix only local asset enumeration and atomic release consistency. Runtime source code or cookies from arbitrary origins cannot be cached. Current implementation is not claimed compliant until tested.
- Renderer failure never corrupts/saves a plan. Project imports/export formulas/CAS safeguards remain intact. Browser persistence remains local storage, not a backup.

## 8. 실패 유형과 복구 행동

| Failure | UI action | State preserved |
|---|---|---|
| measurement_missing / invalid_input | focus named field; schematic/unknown | raw input, old plan marked stale |
| projection_integrity_failed | offer existing recovery export/reload; no geometry presented as verified | immutable stored bytes |
| projection_limit_exceeded/range_exceeded | identify restricted scope; text data kept | whole snapshot/BOM |
| geometry_unavailable / offset_unknown | show missing fields/cavity-local view | Unknown, no fake world box |
| stale projection/result | discard reply and show matching pending/stale state | current source binding |
| edit rejected | show Rust check/diagnostic, try numeric move | previous plan/history/BOM |
| worker_crashed/timeout | existing explicit worker recovery; cancel gesture | inputs, last snapshots |
| persistence_failed/conflict | retry/export/latest/copy per existing flow | validated working result; no saved claim |
| progress_unavailable/not_accepted/stale_input | disable completion, retry/read correct accepted plan | original completion rows |
| blocked_prerequisites/dependents/confirmations | link actual required step/evidence | original checkbox state |
| spatial_module_failed/webgl_unavailable/context_lost | use 2D, explicit retry once per user action | same snapshot/selection/text |
| offline_asset_missing | explain unavailable view; 2D/text if cached | saved project; no network success fiction |

## 9. 리뷰 게이트

G0 design adoption: exact docs HEAD, task/DTO/status conflicts, frozen invariants, operational handoff check. Fable A3, user scope preserved. Stop on foundational ambiguity/unsafe broadened scope; tests are not relevant proof of a design candidate.

G1 projection/domain after SP-001: source integrity, parent/yaw/offset, unknown, unchanged PlanSnapshot hashes/BOM/actions, fixture/native/browser parity, exact capability handshake. Green types do not prove physical coordinate correctness. Wrong world child or silently fabricated geometry stops dependent tasks.

G2 interaction after SP-003: success/failure keyboard/touch/browser evidence, one gesture one command/history, zero per-frame Worker calls, stale/late/conflict guards. Green component tests do not prove actual pointer/IME/keyboard behavior.

G3 guide after SP-004: exact typed targets, current accepted binding/CAS/progress unknown and late response tests. Checkbox/animation success never proves real-world execution or physical safety.

G4 spatial after SP-005: same source geometry/selection in all views, WebGL fallback, no edit path, no CDN, lazy/on-demand/dispose, source/capture/perf evidence. A pretty image does not prove accurate dimensions or installation.

G5 integrated quality after SP-006: full regression, actual WASM parity, cross-browser, measured stage timings, offline lazy assets, adversarial strings and import bounds. Old flaky CI must be investigated with logs and artifacts; CI absence is BLOCKED, not waived by this document. Physical devices unverified remain an explicit hardware readiness condition.

G6 capture handoff after SP-007: actual exact-HEAD draft screenshots, fixture/env/source manifest, missing states, review findings and independent Fable milestone. User alone approves the capture set; readiness/merge/approval are separate. Approved manifest requires a later durable user decision. Release/production activation remains out of this program.
