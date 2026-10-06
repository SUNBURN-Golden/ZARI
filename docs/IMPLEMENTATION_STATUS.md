# 2026-10-07 — ZARI-SPATIAL-008 측정 완성 ADR와 typed 입력·Worker 계약

정본은 GitHub issue #57, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-008`이다. 관찰한 base SHA는 `d71b09f221c6adf4b81c1e263cac5a061028a715`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다.

채택: JunTae Park (저장소 소유자), 2026-10-07 00:31 KST. 원문: "008 ADR 채택한다. Fable 게이트는 앞 노드처럼 독립 리뷰 2회로 대체하고, 머지도 네가 해라." SP-008만 채택이다. SP-009부터 SP-016은 후보다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다.

구현:

- ADR `docs/adr/SP-008-measurement-completion.md`와 `design/DECISIONS.md` D008. 측정 완성 후보 문서에는 SP-008 채택 노트만 추가했다.
- 부호 있는 오프셋 구간은 checked i64 `[nominal−minus, nominal+plus]`이다. 명목값과 양 끝점은 PositionMm −20000..=20000, 경계는 ClearanceMm 0..=10000이다. 양의 길이 규칙은 그대로이고 `abs(nominal)`에 적용하지 않는다. 빈 경계는 0이 아니다. `UserMeasured`는 Unverified다.
- `normalizeInput`에 선택 필드 `groupFormatRequests`와 항상 있는 `formattedGroups`를 추가했다. 카탈로그와 보유 용기 물리는 `catalog_field_read_only`다. `queryNextFacts`는 ADR과 JsonSchema가 아닌 Rust 타입에만 있다. 명령, capability, 생성 스키마에는 없다.
- `BUILD_ID`는 `zari-domain-5`다. capability 목록과 순서는 이전과 같다. 페이지는 순서까지 같아야 수락한다. persisted schemaVersion은 1이다.
- 기존 fixture 107개는 `engineContext.buildId` 한 줄만 바뀌었다. `project-minimal-pass` 다이제스트 `bdc80a6cc50fa632760be5c7f5c997abf5fd7ba59659e2d0c9537fe4570edacd`는 그대로다. 손 계산 오프셋 fixture 10개를 추가했다.

이 머신에서 실행한 검증 (Node v24.19.0, `CARGO_BUILD_JOBS=4`):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`: exit 0
- `cargo test --workspace --locked`: exit 0, 97개 (core lib 29, bootstrap 9, domain 11, edit 6, protocol 17, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 117건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`: exit 0
- `npm run wasm:build`, `npm run contracts:generate`, `npm run contracts:check`: exit 0, fixture 117. 생성 파일은 생성기가 썼다
- `npm run typecheck`, `npm run lint`, `npm test` (vitest 15 files / 111), `npm run build`, `node scripts/check-design-tokens.mjs --self-test` (자체 10, 대비 39/39): exit 0
- `npm run test:browser -- --project=chromium`: 첫 실행 59 passed (57.3s). create-project `worker-state` flake는 이 실행에 없었다. 재시도하지 않았고 타임아웃을 올리지 않았다
- `npm run test:parity`: native↔Chromium 117 fixture, parity 2 passed (23.8s)
- `docs/evidence/ZARI-SPATIAL-001-*.png` 두 파일의 sha256은 실행 전과 같다

하지 않은 것: SP-009 화면, SP-010 query 실행, Confirmed 단정, 스키마 마이그레이션, Firefox/WebKit 브라우저 스위트, 전화, 전용 GPU. SP-007의 3D 라벨 겹침은 그대로다. 상세는 `docs/evidence/ZARI-SPATIAL-008.md`.

다음: 감독자가 이 작업 트리를 커밋하고 ready PR을 연다. 독립 읽기 전용 검토 2회가 같은 head에서 끝난 뒤 머지한다. SP-009는 그 노드의 채택 전이다.

# 2026-10-06 — ZARI-SPATIAL-007 실제 화면 draft evidence와 승인 인계

정본은 GitHub issue #55, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-007`이다. 관찰한 base SHA는 `29370e23a082c49aa4d8d7943b0e6e71c7884b4c`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다. 캡처는 draft이며 화면 승인이 아니다.

구현:

- 실제 샘플 프로젝트로 1440과 390에서 측정 성공·unknown·historical, 계획 성공, 검사 전 드래그, 검증된 드래그, 저장 실패, 좌표 거부, 3D ready·절개, WebGL 없음, 청크 실패, 단계 focus, 진행 읽기 실패, 다른 탭 충돌, stale 입력을 캡처했다. 포커스, forced-colors, 200% zoom도 있다. 줄어든 모션은 모든 샷의 Playwright 설정이다.
- 이미지는 `design/baselines/draft/zari007/` 47개 PNG, 2,688,448바이트다. manifest draft 항목과 `spatialDraft007`만 추가했다. 승인 수는 0이다. `zari001` PNG와 해시는 그대로다. `apps/web/src`는 base와 같다.
- 없는 상태는 만들지 않았다. 다중 배치 BOM 줄과 cavity pane은 샘플에 없다. 전화, 전용 GPU, WebKit 오프라인은 UNVERIFIED다.
- 검사 목록과 도면 목록에 `fact_unknown`, `elevation_unknown`, `cavity_unknown`, `compartmentBoundary`, `itemEnvelope`가 그대로 보인다. 라벨을 고치지 않았다.
- Open finding, not fixed here: `spatial-ready-1440`, `spatial-ready-390`, `spatial-cutaway-1440`, `spatial-cutaway-390`, `spatial-child-1440`에서 3D 라벨 `Winter coats #2`가 Wide bin 치수 위에 겹쳐 `0×255×220`만 남는다. 005의 화면 동작이다. 라벨 충돌 회피는 이 캡처 작업 밖이며 PNG는 다시 찍지 않았다.
- 새 색 토큰은 없다. Rust·fixture·생성 계약·`Cargo.lock`·워크플로는 바꾸지 않았다.

이 머신에서 실행한 검증:

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 107건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 14 files / 109), `npm run build`, `node scripts/check-release-manifest.mjs` (errors 없음, `buildId` `316427bb1c205c86`), `node scripts/check-design-tokens.mjs --self-test` (39/39)
- `ZARI_CAPTURE_DIR=/tmp/zari-spatial-007-cap5 npm run capture:baselines`: 2 passed (25.9s). `node scripts/check-baseline-manifest.mjs`: approved 0, drafts 52, zari007 47
- `npm run test:browser -- --project=chromium`: 첫 실행 58 passed / 1 failed (`progress.spec.ts`, create-project 뒤 `worker-state` 없음). 바로 이은 재실행 59 passed (51.6s)
- Firefox 비벤치: 첫 실행 58 passed / 1 failed (`responsive.spec.ts` 768px, 같은 `worker-state`). 재실행 59 passed (1.0m)
- WebKit 비벤치: 첫 실행 58 passed / 1 failed (`portable.spec.ts`, 같은 `worker-state`). 재실행 59 passed (1.3m). 오프라인 reload는 하지 않았다
- `npm run test:parity`: native↔Chromium 107 fixture, parity 2 passed (19.1s)
- 라벨 겹침 기록 뒤 `node scripts/check-baseline-manifest.mjs` (approved 0; drafts 52; zari007 47), `npm test` (14 files / 109), `npm run lint`: 모두 exit 0. PNG는 바꾸지 않았다.

하지 않은 것: 화면 승인, 픽셀 임계값 갱신, 배포, 실기기, 전용 GPU, WebKit 캡처. create-project flake는 세 엔진 첫 실행에서 재현됐다. 타임아웃을 올리거나 재시도 코드를 넣지 않았고 PR #38은 건드리지 않았다. 상세는 `docs/evidence/ZARI-SPATIAL-007.md`.

다음: 감독자가 이 작업 트리를 커밋하고 ready PR을 연다. 캡처 승인은 이후 사용자 기록이다.

# 2026-10-06 — ZARI-SPATIAL-006 통합 품질·오프라인·성능 측정

정본은 GitHub issue #53, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-006`이다. 관찰한 base SHA는 `2865869f33a05f7c19256547eabcf1e1642617b8`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다.

구현:

- 같은 fixture·호스트에서 001–005를 다시 재고, 투영 소스/인코드/디코드/전송, 2D 커밋, 포인터 프리뷰, 3D 첫 준비·프레임·5초 유휴·20회 dispose를 `zari-bench-3`로 나눴다. 기존 `zari-bench-2` 단계와 임계값은 그대로다. p95가 임계값을 넘으면 `exceeded`로 기록하고 벤치는 통과시킨다. 유휴 draw가 0이 아니거나, dispose가 20이 아니거나, 배치가 빠지거나, 미분류가 있거나, Worker와 페이지 투영 JSON이 다르면 실패다.
- 기준 기하는 `fixtures/spatial/spatial-yaw-offset.json`이다. `bench-search-reference`는 대안이 0개라 스트레스 스냅샷은 `bench-search-small`의 첫 라이브 대안이다. 새 fixture 파일은 없다.
- 스탬프가 어긋난 투영은 캐시하지 않고 `projection_source_mismatch`다. 계획 화면의 Worker 실패는 기존 재연결 패널을 쓰고 도면과 revision을 남긴다. 진행 저장/읽기 실패는 완료로 바꾸지 않는다. 가져온 문자열은 텍스트이고 HTML 파일은 JSON이 아니라고 거절한다.
- 프로덕션 `SpatialView` 청크는 `index.html`에 없고, 테스트 전용 주입 식별자는 프로덕션 JS에 없다. 오프라인 첫 3D는 Chromium·Firefox에서 로컬 캐시로 `ready`다. WebKit은 캐시 적중만 확인한다.
- 새 색 토큰은 없다. Rust·fixture·생성 계약·`Cargo.lock`·워크플로는 바꾸지 않았다.

이 머신에서 실행한 검증:

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 107건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 13 files / 108), `npm run build`, `node scripts/check-release-manifest.mjs` (errors 없음), `node scripts/check-design-tokens.mjs --self-test` (39/39)
- `drag.spec.ts`는 `page.mouse` move/down/up이다. `steps`는 중간 `pointermove`가 필요한 이동에만 쓴다. Chromium·Firefox·WebKit 각 3 passed. CDP 세션은 없다.
- `npm run test:browser -- --project=chromium`: 4-worker 1회는 57 passed / 2 failed. 둘 다 create-project 뒤 목록에 머물렀고 `worker-state`가 없었다. 바로 이은 재실행은 59 passed (49.3s).
- Firefox·WebKit 동일 59건: 각 59 passed, 0 failed.
- `npm run bench:browser -- --project=chromium`: 크기 행을 고친 뒤 12 passed (4.3m). cold 20, warm 50. Firefox·WebKit 벤치 12/12는 그 수정 전의 실행이다.
- `npm run test:parity`: native↔Chromium 107 fixture, parity 2 passed (19.2s)

측정(데스크톱 p95, 전화 열은 전부 unmeasured). Chromium 열은 크기 행을 고친 뒤의 벤치다. Firefox·WebKit 시간은 그 앞 실행이다. 투영 소스 Chromium 3.80 / Firefox 5.00 / WebKit 4.00 ms (목표 20, met). 인코드·디코드·전송은 세 엔진 모두 목표 이내. 2D 렌더 Chromium 1.70 ms. 첫 3D(클릭 포함) Chromium 457 ms (목표 1000, met). 유휴 draw 0. dispose 20. Chromium 잔여 전송 27.10 ms, Firefox 직렬화 39 ms, WebKit 정규화 36 ms는 `exceeded`로 남겼다. 임계값은 내리지 않았다.

`spatialGzipKiB`는 3D를 열 때 비로소 받는 JS 청크의 gzip 합이다. 테스트 빌드는 `SpatialView-L8DuDDF5.js`와 `scene-TKedKJ_Z.js`(three.js)이고 raw 577,830바이트, gzip 합 140.80 KiB다. 250 KiB 이내. 프로덕션은 three.js가 `SpatialView-BI-biihS.js` 한 파일에 들어 있다. raw 576,505바이트, gzip 143,561바이트(140.20 KiB), Brotli 118,033바이트. `index.html`이 참조하지 않는다. `buildId` `316427bb1c205c86`. WASM gzip은 Vite 표시 821.30 kB로 2 MiB 이내. 초기 JS+CSS Vite gzip은 248.96 kB + 5.93 kB다.

하지 않은 것: 실기기, 전용 GPU, GPU 타임스탬프. 전화·전용 GPU는 UNVERIFIED이고 하드웨어 게이트는 열려 있다. WebKit 오프라인 reload는 WPE 한계로 실행하지 않았다. create-project 뒤 목록에 남는 경우는 이번 Chromium 4-worker 1회에서 재현됐고, 같은 59건 재실행에서는 사라졌다. 원인은 모른다. 타임아웃을 올리거나 재시도를 넣지 않았고 PR #38은 건드리지 않았다. 노드 007, 승인 캡처, 베타 릴리스는 범위 밖이다. 상세는 `docs/evidence/ZARI-SPATIAL-006.md`.

다음: 감독자가 이 작업 트리를 커밋하고 ready PR을 연다.

# 2026-10-06 — ZARI-SPATIAL-005 읽기 전용 구획 3D

정본은 GitHub issue #51, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-005`이다. 관찰한 base SHA는 `dd726ef30e20f95f1d2f03c082462dc019a0b118`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다.

구현:

- 같은 verified/conditional 투영을 구획 절개 3D로 본다. 좌표는 `(X, Y, Z) = (x, z, -y) / 1000` 미터이고, yaw가 적용된 world box를 다시 돌리지 않는다. 높이·오프셋 미확인과 두께 없는 면은 입체로 만들지 않는다. 벽은 경계 평면이다.
- 선택·BOM·검사·현재 단계는 002–004의 `WorkspaceState` 그대로다. 카메라·절개·줌은 스냅샷을 고치거나 이동 명령을 보내지 않는다. 뷰를 바꿔도 focus와 source가 남는다.
- Three.js `0.186.1`과 `@types/three` `0.186.0`만 exact pin했다. `@types/three@0.186.1`은 레지스트리에 없다. R3F·Drei·WebGPU·원격 asset은 없다. 청크는 첫 “입체” 클릭 때 로컬에서만 로드되고, 프로덕션 HTML은 그 청크를 preload하지 않는다. `zari-build.json`에는 기존 out-dir 순회로 들어 있다.
- WebGL·청크·context 실패는 2D로 남긴다. 계획 작업대 안에서는 2D/3D를 오가도 렌더러를 다시 만들지 않고, 실패하거나 작업대가 빠질 때 정리한다. 유휴 상태에서는 프레임을 그리지 않는다.
- `docs/ARCHITECTURE.md`, `docs/FRONTEND.md` 물리 작업대 표, `design/DECISIONS.md` D007에 pin과 SVG/2D fallback을 적었다. 새 색 토큰은 없다. Rust·fixture·생성 계약·`Cargo.lock`은 바꾸지 않았다.

이 머신에서 실행한 검증(통과):

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`
- `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 107건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 12 files / 105), `npm run build`, `node scripts/check-design-tokens.mjs --self-test` (39/39)
- `npm run test:browser -- --project=chromium`: 53 passed (37.7s). `spatial3d.spec.ts` 4건 포함. 이 실행에서 PR #38 프로젝트 시작 flake는 재현되지 않았다.
- Firefox와 WebKit에서 `spatial3d.spec.ts` 각 4 passed. 세 엔진 모두 headless WebGL로 3D 경로가 열렸다. WebKit은 오프라인 reload를 하지 않고 캐시만 확인했다.
- `npm run test:parity`: native↔Chromium, parity 2 passed (14.8s)

측정: 프로덕션 `SpatialView` 청크 raw 576,274바이트, gzip 143,511바이트(140.15 KiB), Brotli 118,053바이트(115.29 KiB). 250 KiB 목표 이내. 클릭→ready는 Chromium 827 ms, Firefox 550 ms, WebKit 602 ms(목표 1000 ms 이내, 로컬 preview 1회). `renderer.render`는 0.3–1 ms. 클릭부터 다음 `data-renders`까지는 React·Playwright가 포함되어 46–167 ms이며 16 ms 프레임 목표로 치지 않는다. 5초 유휴 동안 렌더 횟수는 그대로였다. 20회 전환에서 geometry 수는 3으로 유지됐다.

하지 않은 것: 노드 006–007, 3D 편집, 실기기, 전용 GPU 타이밍. 샘플 계획에는 `배치 N곳` BOM 줄이 없다. 다중 배치 강조는 단위 테스트가 담당한다. 상세는 `docs/evidence/ZARI-SPATIAL-005.md`.

다음: 감독자가 이 작업 트리를 커밋하고 ready PR을 연다. 006은 이 읽기 전용 3D 위에서 이어진다.

# 2026-10-06 — ZARI-SPATIAL-004 실행 단계 focus와 accepted-progress 정합

정본은 GitHub issue #49, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-004`이다. 관찰한 base SHA는 `58d1edb11fdb8902c47ca29ce25a7a13f25252ba`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다.

구현:

- 실행 단계 focus는 기존 `WorkspaceState`의 `{ kind: 'action', stepId }`를 그대로 쓴다. 이전/다음과 “다음 실행 단계”는 focus만 바꾸고 Worker를 부르지 않는다. 단계 대상은 투영 링크의 step id와 같고, 반복 수납은 `unitOrdinal`로 남는다. 미배치·기하 없음은 문구만 보이고 상자를 만들지 않는다.
- 완료 체크는 현재 수락본이면서 현재 입력(revision + digest)이고, 진행 기록을 읽은 뒤에만 쓸 수 있다. 작업 head와 미채택 대안은 읽기 전용이며 수락본의 done을 표시하지 않는다. null 진행은 unknown이고 전부 미완료로 바꾸지 않는다. `requiredConfirmations`가 있으면 완료를 막는다. 물리 확인 절차는 만들지 않았다.
- 저장은 기존 `actionProgress` 행이다. 스키마·스토어·export는 그대로다. 거절된 쓰기(선행/후행, `stale_input`, `confirmation_required`, CAS 충돌)는 기존 done 행을 남긴다. 수락 전환 뒤 늦게 도착한 완료 응답은 새 맵에 합치지 않는다. 진행 저장은 PlanSnapshot·해시·BOM·기하를 바꾸지 않는다.
- 단계 강조는 기존 `--zari-info` 점선이다. 선택 실선과 구분된다. 새 색 토큰은 없다. Rust·fixture·생성 계약·`Cargo.lock`은 바꾸지 않았다.

이 머신에서 실행한 검증(통과):

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`
- `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 107건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 11 files / 95), `npm run build`, `node scripts/check-design-tokens.mjs --self-test` (39/39)
- `npm run test:browser -- --project=chromium`: 49 passed (30.6s). `progress.spec.ts` 3건은 수락→단계→막힘→저장/새로고침, 작업 head→수락 전환→늦은 응답, 두 탭 충돌/새로고침→stale 입력을 포함한다. 콘솔 error와 pageerror는 비어 있었다. 이 실행에서 PR #38 프로젝트 시작 flake는 재현되지 않았다.
- `npm run test:parity`: native↔Chromium 107 fixture, parity 2 passed

하지 않은 것: 노드 005–007, 3D, 업무 단계 재생성, 진행 스키마 이전, 클라우드. 샘플 생산자는 `requiredConfirmations`가 비어 있어 브라우저에 확인 단계가 나오지 않는다. 그 거절은 저장소 테스트가 담당한다. 디스크 쓰기 실패의 retry는 세션 단위 테스트로 확인했고 브라우저에서 IndexedDB 실패를 주입하지는 않았다. 390px는 에뮬레이션이지 실기기가 아니다. 증거 그림은 추가하지 않았다. 상세는 `docs/evidence/ZARI-SPATIAL-004.md`.

다음: 감독자가 이 작업 트리를 커밋하고 ready PR을 연다. 005는 이 단계 focus 위에서 읽기 전용 3D를 다룬다.

# 2026-10-06 — ZARI-SPATIAL-003 평면 드래그와 동등한 숫자·키보드 편집

정본은 GitHub issue #47, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-003`이다. 관찰한 base SHA는 `e6858355811ce1a9234fd86c280daf5c10ac3a68`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다.

구현:

- 평면 드래그·숫자 입력·키보드가 같은 `movePlacement` 한 번으로 끝난다. `pointermove`에는 Worker/IndexedDB 호출이 없고, 명령은 pointerup(또는 키를 모두 놓은 때)에 하나다. z는 그대로다. 1 mm 양자화, 4 CSS px 임계값.
- 키보드 기본 단계는 1 mm, Shift는 명시적 10 mm이며 화면에 단위를 보인다. 축은 ArrowLeft −x, ArrowRight +x, ArrowUp −y, ArrowDown +y 그대로다.
- 진행 중인 편집이 있으면 숫자·키보드·드래그·대안 선택·수락·다시 계산이 그 명령을 덮지 않는다. 저장 실패는 검증된 head를 유지하고 거부로 바꾸지 않는다. CAS 충돌은 별도 상태다. 수락본은 작업 head와 분리된다.
- 검토 수정: 검증 중이거나 저장 중(`saving`)에 누른 Ctrl/Meta+Z·Shift+Z·Y는 버리지 않고, 버튼이 다시 켜지는 순간에 `restoreLayout` 한 번으로 실행한다. 그 창에서 이동 명령은 여전히 무시된다. SVG가 로딩 뒤에 붙으면 resize observer도 그때 붙는다. 저장 충돌 문구 중 도달하지 않던 분기는 제거했다.
- 좁은 화면·coarse pointer는 “평면에서 이동”을 눌러야 이동한다. “화면 이동”과 Space/중간 버튼은 화면만 움직인다. `touch-action: none`은 그 모드의 캔버스에만 둔다. 정면 뷰와 내용물 드래그는 이동이 아니다.
- 002의 `WorkspaceState`는 바꾸지 않았다. 제스처 단계는 컴포넌트 안에만 있다. Rust·fixture·생성 계약·`Cargo.lock`은 바꾸지 않았다.

이 머신에서 실행한 검증(통과):

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`
- `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 107건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 10 files / 86), `npm run build`, `node scripts/check-design-tokens.mjs --self-test` (39/39)
- `npm run test:browser -- --project=chromium`: 검토 수정 뒤 연속 3회 46 passed (24.8s, 22.6s, 24.6s). 그 앞 1회는 `project.spec.ts` 프로젝트 전환이 목록에 머물러 45 passed / 1 failed였고, 이어진 3회에서는 재현되지 않았다. 드래그 3건은 마우스·키보드·390px 터치를 포함한다.
- `npm run test:parity`: native↔Chromium 107 fixture, parity 2 passed

하지 않은 것: 노드 004–007, 스냅, 리사이즈, yaw/z 드래그, 3D, 자동 수락. 저장 실패와 CAS 충돌은 세션 단위 테스트로 확인했고 브라우저에서 디스크 실패를 주입하지는 않았다. 390px는 에뮬레이션이지 실기기가 아니다. 증거 그림은 추가하지 않았다. 상세는 `docs/evidence/ZARI-SPATIAL-003.md`.

다음: 감독자가 이 검토 수정을 커밋한다. 004는 이 편집 경로 위에서 진행 표시를 다룬다.

# 2026-10-06 — ZARI-SPATIAL-002 측정·선택·검사 작업대

정본은 GitHub issue #45, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 브랜치 `astra/zari-spatial-002`이다. 관찰한 base SHA는 `52ffba6157cd583315fd38da400f045b31568f51`이다. 산출물은 감독자가 여는 PR로 전달된다. 이 문서는 검토 PASS가 아니다.

구현:

- `apps/web/src/features/workspace/`: `WorkspaceState`와 선택 어댑터, 측정 도식, 평면/정면 도면, 검사 오버레이, cavity-local, 뷰포트 +/-/맞춤, 텍스트 목록, 인스펙터. `spatial` 뷰는 타입에만 있고 버튼은 없다.
- 프로젝트 화면은 `input:<digest>` 투영을 읽고, 편집 가능한 11개 치수에 안내 문구를 붙인다. 단위 `<select>`로 포커스가 넘어가도 측정 포커스는 유지된다. unknown/invalid/stale은 축척 영역을 그리지 않는다.
- 계획 화면은 같은 스냅샷의 도면·내용물·외경/내경·검사·BOM·수량/비용을 한 작업대에 둔다. 배치 선택만 이동 폼을 연다. 내용물 선택은 부모와 구분된다. BOM 포커스는 링크의 전체 배치를 강조한다. 검사 레이어는 기본 꺼짐이다.
- 세션은 입력 투영을 계획 투영과 같은 캐시·lease로 요청한다. `activate()`가 진행 중인 시스템 요청을 끊으면, 활성화 뒤에 입력 투영을 다시 요청한다. `StaleRequest`는 실패 도면으로 저장하지 않는다.
- 토큰 `--zari-unknown` / `--zari-stale` / `--zari-preview`와 대비 사례 6건. Rust·fixture·생성 계약·`Cargo.lock`은 바꾸지 않았다.

이 머신에서 실행한 검증(통과):

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`
- `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14)
- fixture_runner `fixtures/bootstrap` 28건, `fixtures` 107건
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 9 files / 76), `npm run build`, `node scripts/check-design-tokens.mjs --self-test` (39/39)
- `npm run test:browser -- --project=chromium`: 43 passed
- `npm run test:parity`: native↔Chromium 107 fixture, parity 2 passed

하지 않은 것: 노드 003–007, 드래그, 3D, 새 측정 스위트. 물건 치수는 Rust `measurementBox`가 있을 때만 축척 실루엣이고, 한 축만 알면 문구와 축척 없음 도식이다. 화살표는 10mm / Shift 1mm 그대로다. 증거 그림은 추가하지 않았다. 상세는 `docs/evidence/ZARI-SPATIAL-002.md`.

다음: 감독자가 이 작업 트리를 커밋하고 ready PR을 연다. 003은 이 `WorkspaceState`/선택 계약 위에 드래그를 올린다.

# 2026-10-06 — ZARI-SPATIAL-001 공통 Rust 공간 투영 (미커밋 작업 트리)

정본은 GitHub issue #43, plan commit `0847d1b065627938acfad3a941de79e357570e43`, 작업 브랜치 `astra/zari-spatial-001`이다. 이 기록의 기준 HEAD는 `84036631c945a59fee4de325409f835246536b96`이며 구현은 그 위의 **커밋되지 않은** 작업 트리이다. 커밋·푸시·PR은 하지 않았다. 이 문서는 검토 PASS가 아니다.

구현:

- `crates/core/src/spatial_view.rs`: projectionVersion 1. 정규화 입력과 PlanSnapshot을 같은 경계 검증으로 읽고, nominal/conservative, 두 축 직사각형, cavity-local, parent yaw0/yaw90 자식 상자를 만든다. 상태 재계산 없이 overlay·BOM/check/action 링크를 붙인다. 링크가 비면 `Unavailable`과 reason이다. `SupportFootprint`와 `LiftContents`는 DTO에만 있고 방출하지 않는다(두께·궤적을 만들지 않음).
- `geometry.rs`의 `child_global_box_at` / `moving_envelope`, `finalize.rs`의 `bounded_step_id`는 기존 validator·action id와 같은 함수이다. 기존 fixture의 expected·digest·id·BOM·action 바이트는 `engineContext.buildId`만 `zari-domain-4`로 바꿨다.
- `BUILD_ID`는 `zari-domain-4`. capability에 `projectSpatialView`를 `disposeProject` 앞에 넣었다. 명령은 시스템 신원에서 stateless이며 context/search를 바꾸지 않는다.
- 웹: `features/plan/projection.ts`가 도메인 평면 사각형만 읽고, `PlanScreen` SVG `scale(1,-1)`에서만 축을 뒤집는다. 세션은 `plan:<planSnapshotId>` 캐시(최대 4개, 8MiB), in-flight 합류, mount/worker lease를 가진다. 실패해도 목록과 BOM은 남는다. unknown offset 수납물은 도면에서 빠지고 “외형 안의 실제 위치 미확인 · 별도 좌표계”를 보인다.
- `fixtures/spatial/` 5건과 manifest·contracts·parity 디렉터리를 등록했다. 손계산 기준은 parent `(100,200,0)`, outer depth 400, offset `(10,20,5)`, child local `(30,40,0)`, extent 50×60×70, yaw90 → world min `(380,240,5)` max `(440,290,75)`.

이 머신에서 실행한 검증(통과):

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`
- `cargo test --workspace --locked`: 83개 (core lib 19, bootstrap 9, domain 11, edit 6, protocol 13, validator 11, search 14). doc-test 0.
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap`, `fixtures/spatial`, 그리고 `fixtures` 전체 107건.
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`. `Cargo.lock` 변경 없음.
- `npm run wasm:build`, `npm run contracts:check` (107), `npm run typecheck`, `npm run lint`, `npm test` (vitest 68), `npm run build`, `node scripts/check-design-tokens.mjs --self-test` (33/33).
- `npm run test:browser -- --project=chromium`: 40 passed. 그 뒤 unknown-offset 캡션이 스크린샷에 들어가도록 `spatial-view.spec.ts`만 고치고 그 파일 1건을 다시 통과시켰다. 나머지 39건은 그 테스트 전용 수정 이후 재실행하지 않았다.
- `npm run test:parity`: native↔Chromium 107 fixture 일치, parity Playwright 2 passed.
- 화면: plan 검색·SVG·checks·BOM·guide·accept, edit ghost/undo, probe, catalog, project. 증거 그림은 `docs/evidence/ZARI-SPATIAL-001-yaw-offset.png`, `docs/evidence/ZARI-SPATIAL-001-unknown-offset.png`. 승인된 visual baseline이 아니다.

하지 않은 것: 노드 002–007, 드래그·3D·새 툴바, persisted schema migration, 물리 검사 규칙 변경, 키보드 기본 1mm(현재 화살표 10mm / Shift 1mm는 SP-003). 벤치 IndexedDB 스탬프 `engineBuildId`는 `zari-domain-3`으로 두었다. 이것은 WASM handshake가 아니다.

다음: 감독자가 이 작업 트리를 검토·커밋·PR. 좌표 수학은 녹색 테스트와 별도로 독립 검토가 필요하다.

# 2026-10-02 — 상세 프로그램 확장 후보

계획·문서만 작성했다. 로컬 후보 36 + pending 9 = 45개 정의를 담는다. 실제 앱 기능·기기 자격·시작/병합·release는 이 변경의 산출물이 아니다. 검증은 JSON/DAG/전체 정의 해시·기존 정의 보존·중앙 reader의 PENDING 거절이며 제품 테스트를 실행한 것으로 보고하지 않는다. 상세 범위는 `docs/aiops/PROGRAM_EXPANSION_20261002_KO.md`를 참조한다. 기존 구현 상태 기록은 아래에 보존한다.

# ZARI 구현 상태

## 현재 구현: ZARI-010 측정된 베타 준비도 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #27이며 base는 ZARI-009 병합 후 main
`bb0ca20f472f1bf0329d6d826339b5949b263d6e`입니다. 브랜치
`devin/zari-010-beta-readiness`에서 작업했고 Cloud Devin·production
runner·`runtime_enabled=true`·baseline 자동 교체·merge는 사용하지
않았습니다. 이것은 측정된 준비도 증거이며 베타 릴리스가 아닙니다.

구현한 범위:

- `fixtures/bench/` 7종 + `scripts/bench-fixtures.mjs`: 정상
  (small/reference)·스트레스(adversarial)·경계(boundary)·취소(cancel)
  워크로드. expected oracle은 `domain_tool oracle` 서브커맨드가 실제
  Rust 실행에서 계산한 값(termination·plan digest·consumed·
  diagnostics)으로 고정하며 손으로 추정한 값이 아닙니다.
  `fixtures/manifest.json`·`scripts/contracts.mjs`·parity에 등록해
  native↔browser 대조 대상에 포함했습니다.
- `apps/web/tests/harness.ts` `window.bench`: 네이티브 fixture runner가
  보내는 것과 동일한 wire 요청(`domainFixtureRequests`)을 실제 Worker에
  보내고, 요청당 encode·worker 왕복·decode·인페이지 `handle_json`
  (direct) 네 구간을 분리 측정합니다. `residualMs = workerMs -
  directMs`로 transport 잔여비용을 Rust 계산과 분리합니다. 실제
  `ProjectRepository`/IndexedDB 경로로 open·draft·commit·catalog·
  snapshot accept·reload를 측정하고 corrupt row는 0을 단언합니다.
- `apps/web/tests/browser/bench.spec.ts` + `npm run bench:browser`:
  cold 단계는 매 표본 새 브라우저 프로필·빈 HTTP 캐시에서 page load·
  무캐시 WASM fetch+compile·Worker spawn+init+initialize 왕복을 잽니다.
  warm 단계는 fixture당 기본 50회 반복 후 최종 터미널 이벤트를 Rust
  oracle과 대조합니다. `ZARI_BENCH_COLD`/`ZARI_BENCH_WARM`으로 표본 수
  조정. `test-results/bench/bench-<engine>.json` 아티팩트에 환경·
  표본·p50/p95/max·payload bytes·heap delta·stage 목표표를 기록합니다.
  TEST_STRATEGY.md §10에 명령·측정 경계·아티팩트 해석을 문서화했습니다.
- `playwright.config.ts`: Chromium·Firefox·WebKit 3개 프로젝트.
  root 권한이 없는 host를 위해 `scripts/setup-webkit-deps.sh`가 Mesa/
  EGL/GTK 계열 사용자 공간 라이브러리를 `~/.cache/zari-webkit-deps`에
  설치하고 `env.json` 마커를 씁니다. 마커가 있으면 config가
  software-rendering env를 WebKit launch에 주입하고 host 검증을
  건너뜁니다. 마커가 없으면 스톡 설정입니다.
- `apps/web/tests/browser/responsive.spec.ts`: 320/390/768/1280/1440
  레이아웃·가로 오버플로 없음, 390/1440 계산 결과 화면, 200% CSS zoom,
  reduced-motion reduce/no-preference 양방향, forced-colors.
- `apps/web/tests/browser/a11y.spec.ts`: axe-core 스캔(프로젝트 목록·
  채운 편집기·오류 상태·plan idle/results·카탈로그)과 keyboard-only
  생성→편집→커밋→plan→취소 흐름.
- 접근성 수정: `CatalogScreen.tsx`의 가져오기 방식 선택을 잘못된
  `role="tablist"`에서 `role="radiogroup"`+`role="radio"`/`aria-checked`
  로 교정(axe `aria-required-children` critical). `ProjectScreen.tsx`
  숨겨진 파일 입력에 `tabIndex={-1}`·`aria-hidden`을 추가해 키보드
  탐색에서 제외했습니다.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지
않습니다):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  --locked -- -D warnings`, `cargo test --workspace --locked`: 통과
  (75개).
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures`:
  102 fixture 전부 통과(bench 7종 포함).
- `npm run contracts:check`: 102 fixture 구조 유효. `npm run typecheck`,
  `npm run lint`, `npm test`(vitest 55개), `npm run build` 통과.
- `npm run test:parity`: 102 fixture native↔실제 Chromium Worker/WASM
  대조 일치.
- 브라우저 스위트: 프로젝트별 실행으로 Chromium 38/38, Firefox 49/49
  (@bench 포함), WebKit 37+1(격리 재실행 통과)이며, 3엔진 동시 실행은
  이 host에서 과부하 flake를 보였습니다(아래 한계 참조).
- `npm run bench:browser` 전 표본(cold 20·warm 50)을 3엔진에서 실행 —
  `test-results/bench/bench-*.json`. 측정 p95(데스크톱 목표 대비):
  - wasmTransferCompile: Chromium 194ms·Firefox 251ms·WebKit 222ms /
    1,000ms — met.
  - normalization: Chromium 33.7ms·WebKit 27ms / 20ms — **exceeded**;
    Firefox 20ms — 경계에서 met.
  - searchStep: 0.7–1.0ms / 8ms — met.
  - messagingResidual(workerMs−directMs): Chromium 37.9ms·Firefox 52ms·
    WebKit 40ms / 10ms — **exceeded**. WASM 문자열 왕복을 포함한
    transport 잔여비용입니다.
  - serialization(encode+decode p95 합): Chromium 5.8ms·WebKit 6ms met;
    Firefox 28ms / 20ms — **exceeded**.
  - cancelAck: ≤1ms / 100ms — met. draftTransaction ≤13ms / 50ms — met.
    snapshotSaveReload ≤41ms / 200ms — met.
- `node scripts/check-design-tokens.mjs --self-test`: 통과 (33/33).

미구현·한계·공개된 shortfall:

- 실제 물리 기기(Android Chrome/Samsung Internet·iOS Safari)는 테스트하지
  않았습니다. 모든 수치는 데스크톱 headless 바이너리이며 모바일 목표
  열은 미측정으로 남습니다. Playwright WebKit은 실제 iPhone 증거가
  아닙니다.
- 이 host에서 WebKit은 시스템 GTK/WPE가 없어 사용자 공간 추출
  라이브러리 + software EGL로 동작합니다. 정상 프로비전된 host에서는
  `setup-webkit-deps.sh` 불필요합니다.
- WebKit(WPE)에서 `context.setOffline(true)` 후 `page.reload()`가
  엔진 내부 오류로 실패(빈 페이지에서도 재현 — 앱 결함 아님).
  portable.spec.ts의 오프라인 재방문 테스트는 WebKit에서 stage된
  manifest의 모든 자산이 Cache Storage에서 검색 가능한지를 대신
  단언하고, 실제 reload 검증은 Chromium/Firefox에서 수행합니다.
- Firefox는 문서 끝에서 Tab이 페이지 첫 요소로 돌아오지 않고 브라우저
  chrome으로 빠져나가며, WebKit은 React Aria Button에 대한 포인터 클릭
  직후 Shift+Tab 순차 포커스 상태가 어긋납니다. 키보드 테스트는 실제
  키보드 경로(포커스 앵커 + Enter/Shift+Tab)만 사용하며 엔진 차이를
  그대로 따릅니다.
- normalization·messagingResidual·(Firefox)serialization p95가 초안
  목표를 초과합니다 — 수치는 숨기지 않고 bench 아티팩트와 이 문서에
  기록했으며 예산을 변경하지 않았습니다.
- 3엔진 동시 실행 시 WASM worker 부팅이 30s를 넘는 과부하 flake가
  관측되었습니다(expect 대기는 30s로 상향, 단언 내용 불변). 단일
  프로젝트 순차 실행에서는 재현되지 않습니다. CI에서는 엔진별 분리
  실행을 권장합니다.
- `performance.memory`는 Chromium만 노출하며 나머지 엔진의 heap 수치는
  null로 기록됩니다. 화면 시각 baseline 승인·베타 릴리스·배포를
  주장하지 않습니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK 이후 GLM, 동시 1명)이며 merge는 User만 결정합니다.

### ZARI-010 측정 정의 보완 (2026-09-28 UTC, 작성자 Claude Code)

사용자가 ZARI-010 처리 방향을 위임해, 이 PR의 HEAD `a824f2d` 위에 커밋을 추가했습니다. 기존 커밋은 다시 쓰지 않았습니다. 위 원 기록은 역사 기록으로 그대로 둡니다. 원 기록의 messagingResidual 수치(Chromium 37.9ms·Firefox 52ms·WebKit 40ms, "exceeded")는 `zari-bench-1` 정의에서 나온 값이며 **전송 비용이 아닙니다**. 이 보완으로 대체합니다.

- 이유: INV-01 조사(PR #30의 `docs/INV01_MESSAGING_RESIDUAL.md`)에서 `workerMs − directMs`가 오래 걸리는 Rust 명령(activateProject·startSearch)을 Worker와 페이지에서 따로 실행한 **계산 시간 편차**를 재고 있음을 확인했습니다. 같은 실행 안에서 분리한 실제 전송은 908KB 요청에서도 p95 1.9ms 이하였습니다.
- `apps/web/tests/bench-entry.ts`(test build 전용, 앱 빌드 미포함): `src/worker/entry.ts`와 같은 메시지 처리에 Worker 내부 `handle_json` 시간 측정을 더했습니다. 응답 문자열은 그대로 보내고, 시간은 그 뒤에 별도 메시지로 보냅니다. 운영 `entry.ts`는 바꾸지 않았습니다.
- `apps/web/tests/harness.ts`: `spawnTimedWorker()`와 `workerComputeMs`를 추가했습니다. 왕복 시간은 응답 문자열 수신 시점까지만 잽니다.
- `apps/web/tests/browser/bench.spec.ts`:
  - warm 단계는 계측 Worker를 씁니다.
  - `transportMs = workerMs − workerComputeMs`를 messagingResidual로 씁니다.
  - `crossRealmDeltaMs = workerComputeMs − directMs`는 참고값으로만 남깁니다.
  - 최댓값으로 집계하는 stage 행에는 최댓값을 낸 (fixture, command)를 `at`으로 기록합니다.
  - 아티팩트 contract를 `zari-bench-2`로 올렸습니다.
  - 예산·fixture·oracle 대조는 바꾸지 않았습니다.
- `docs/TEST_STRATEGY.md` §10에 위 정의를 반영했습니다.
- `package.json`: `@axe-core/playwright`를 `^4.13.0`에서 lockfile과 같은 `4.13.0`으로 정확히 고정했습니다(다른 devDependencies와 같은 정책). lockfile은 `npm install --package-lock-only`로 갱신했고, 루트 선언 한 줄만 바뀌었습니다.

재측정(`npm run bench:browser -- --project=chromium`, cold 20·warm 50, 10개 테스트 통과·모든 oracle 일치). 환경은 Chromium 141.0.7390.37 headless, Intel Xeon 2.10GHz 4코어, 16 GiB, Node 24.19.0입니다.

| stage | p95 | 목표 | 판정 | 최댓값 위치 |
|---|---|---|---|---|
| wasmTransferCompile | 448.5ms | 1000ms | met | — |
| normalization | 18.5ms | 20ms | met | bench-normalize-reference/normalizeInput |
| searchStep | 0.5ms | 8ms | met | bench-search-cancel/stepSearch |
| messagingResidual | **1.6ms** | 10ms | met | bench-search-adversarial/activateProject |
| serialization | 9.2ms | 20ms | met | bench-search-adversarial/activateProject |
| cancelAck | 0.5ms | 100ms | met | bench-search-cancel/cancelSearch |
| draftTransaction | 12.0ms | 50ms | met | — |
| snapshotSaveReload | 46.9ms | 200ms | met | — |

참고값 `crossRealmDeltaMs` p95는 명령별로 최대 34.0ms(adversarial startSearch)였습니다. 원 정의가 "잔여비용"으로 보고하던 크기가 바로 이것입니다.

남은 한계:

- Firefox·WebKit은 이 환경에 없어 `zari-bench-2`로 재측정하지 않았습니다. 두 엔진의 messagingResidual은 **미측정**입니다(원 기록 값은 대체됨). serialization(Firefox 28ms)과 normalization(WebKit 27ms)의 원 기록 초과도 이 환경에서는 확인하지 않았습니다.
- normalization p95는 같은 host에서도 14.0ms(INV-01 재현)와 18.5ms(이번)로 흔들렸고, 원 작성자 host에서는 33.7ms였습니다. 목표 20ms에 가까워 host에 따라 판정이 바뀝니다. 기준 host와 브라우저는 아직 정하지 않았습니다.
- wasmTransferCompile(cold) p95는 INV-01 재현 때 181.9ms, 이번에 448.5ms로 같은 host에서도 차이가 큽니다. 목표 안이지만 cold 수치의 편차가 큽니다.
- 문서 목표 중 첫 유효 후보 시간, 검증·BOM·확정 시간, React 반영 시간은 여전히 측정하지 않았습니다.
- GitHub Actions는 사용량 한도로 이 HEAD에서도 실행되지 않습니다.

이 보완의 작성자도 자신의 변경에 PASS를 부여하지 않습니다. 독립 read-only review(GROK 이후 GLM)는 새 HEAD를 대상으로 하며, merge는 User만 결정합니다.

## 이전 구현: ZARI-009 복구·프라이버시·이식 가능한 로컬 프로젝트 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #25이며 base는 ZARI-008 병합 후 main
`178f6289542ba67f3da52237f3cab1a8072b3150`입니다. 브랜치
`devin/zari-009-recovery-privacy`에서 작업했고 Cloud Devin·production
runner·`runtime_enabled=true`는 사용하지 않았습니다. 인증·클라우드 동기화·
외부 사진 분석·백그라운드 텔레메트리는 범위 밖이며 추가하지 않았습니다.

구현한 범위:

- `persistence/export.ts` + `features/project/transfer.ts` +
  `repository.commitImport`: 트랜잭션 내보내기/가져오기. 보내기 봉투는
  프로젝트·draft·입력·스냅샷·진행·카탈로그·라이브러리·첨부 메타데이터와
  명시적 `excluded` 목록(사진 바이트·임시 로그 — 파일 스스로 불완전
  복사임을 선언)을 담습니다. 가져오기는 바운드 파싱(10 MiB·깊이 32)·봉투
  검사·행 봉투 가드·교차 참조(댕글링·중복 ID·다이제스트 불일치) → Rust
  `verifyRecord` → 사용자 검토 → 새 projectId로 원자 커밋 순서입니다.
  미지원 exportVersion·schemaVersion은 명시적 `unsupported_schema`로
  거절하고, recovery 파일은 가져오기 대상이 아니며, 실패한 stage/commit은
  기존 프로젝트와 절반 프로젝트를 남기지 않습니다. 소스 projectId는
  `importedFrom` provenance로 보존되고 라이브러리·격리는 건드리지 않습니다.
- `repository.duplicateProject`: 새 id·리비전 1·draft 세대 리셋으로
  복제합니다. 현재 입력·채택 스냅샷은 현재 입력 리비전과 일치할 때만
  다시 묶이며 실행 진행·편집 체인은 옮기지 않습니다.
- `persistence/db.ts` v2: `attachments` 스토어를 추가하고 v1 선언을
  유지해 in-place 업그레이드를 지원합니다. 마이그레이션 저널은 Dexie
  upgrade 트랜잭션 안에서만 기록되어 실제로 적용된 전환만 남습니다.
  오래된 빌드가 v2 DB를 여는 것은 IndexedDB 자체가 거절합니다.
- `features/attachments/`(model+image): 로컬 전용 사진 첨부 — JPEG·PNG·
  WebP만, magic-byte 일치 요구, 원본 10 MiB·디코드 2천만 픽셀·프로젝트당
  10장 한도, canvas 재인코드로 EXIF·위치가 제거된 표시용 사본을 저장하며
  원본임을 주장하지 않습니다. 추가·목록·삭제 어디에도 네트워크가 없고
  사진은 solver/입력 컨텍스트와 분리됩니다. 프로젝트 삭제는 첨부 바이트를
  같은 트랜잭션에서 지웁니다.
- `features/plan/csv.ts` + PlanScreen `구매 목록 CSV`: 항상 따옴표로 묶고
  선행 공백·제어문자를 벗겨낸 뒤 수식 트리거(`= + - @`)가 보이면 `'` 접두를
  붙이는 formula-safe CSV를 내보냅니다. 표시 텍스트와 같은 셀을 쓰므로
  미확인 offer fact가 스프레드시트에서 0·재고 있음이 되지 않습니다.
- `apps/web/public/sw.js` + `features/shell/offline.ts` + 빌드 플러그인
  `zari-build.json`: 버전별 동일 출처 앱셸 캐시. closeBundle에서 전체
  출력의 콘텐츠 다이제스트로 buildId를 계산하고, 서비스 워커는 manifest의
  모든 자산을 per-build 캐시에 stage한 뒤 탐색 경계에서만 원자 승격하며
  이전 완전 빌드를 유지합니다. 불완전 stage는 이전 빌드를 대체하지 않고,
  `builtAt` 역행은 거절하며, 프로젝트 데이터·사진·교차 출처 요청은 캐시하지
  않습니다. dev 빌드는 등록을 건너뜁니다.
- `app/ProjectsScreen.tsx`: 파일에서 가져오기(검토 패널 — 출처·건수·첨부
  바이트 제외 안내), 복제, 삭제(확인 패널), `· 가져옴` 라벨을 추가했습니다.
  `app/ProjectScreen.tsx`: 사진 패널(파생 사본임을 명시)을 추가하고 기존
  복구용 보내기·충돌·저장 실패 UX를 유지합니다. `index.html`+`favicon.svg`
  추가로 정적 404 요청을 제거했습니다.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  --locked`, `cargo test --workspace --locked`: 통과 (75개).
- `npm run contracts:check`: 생성 DTO/schema/validators가 Rust 원본과 일치
  (95 fixture 구조 유효).
- `npm run typecheck`, `npm run lint`: 통과.
- `npm test`(vitest): 55개 통과 — 새 `transfer.test.ts`가 실 WASM harness로
  export→stage→commit 왕복, 미지원·손상·댕글링·중복·조작 스냅샷 거절,
  실패 commit의 절반 프로젝트 부재, 복제 규칙, 첨부 한도·가드, v1→v2 업그레이드
  저널, 원자 삭제, 격리 원본 복구 보내기를 검증합니다.
- `npx playwright test`: 26개 통과 — 새 `portable.spec.ts`가 실 Chromium에서
  보내기→가져오기 왕복, 복제, 잘못된·미래 버전 가져오기 거절, 손상 격리와
  복구 다운로드, 사진 추가·삭제의 네트워크 0 확인, 프로젝트 삭제의 연쇄
  제거, 오프라인 재방문(완전 빌드 실행), 불완전 stage 승격 거부를 검증합니다.
- `npm run test:parity`: 95 fixture native↔browser WASM 대조 일치.
- `node scripts/check-design-tokens.mjs --self-test`: 통과 (33/33).
- `npm run build`: 프로덕션 빌드 + `zari-build.json` manifest 생성 성공.

미구현·한계: 보내기 파일에 사진 바이트가 없으므로 가져오기 후 첨부는
재추가가 필요합니다(파일이 제외를 스스로 선언). 오래된 탭/새 빌드의 DB
다운그레이드 보호는 IndexedDB 자체 메커니즘이며 별도 브라우저 경로
테스트는 없습니다. 브라우저 저장소는 백업이 아니며 UI도 그렇게 표기합니다.
가져온 `accepted` 표시는 파일의 사용자 선택을 옮긴 것으로 현재 적합성의
보증이 아닙니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK 이후 GLM, 동시 1명)이며 merge는 User만 결정합니다.

## 이전 구현: ZARI-008 실제 카탈로그·보유 수납함·실행 진행 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #23이며 base는 ZARI-007 병합 후 main
`ab95a53e657144fc7281623d564c887512468b64`입니다. 브랜치
`devin/zari-008-real-catalog`에서 작업했고 Cloud Devin·production
runner·`runtime_enabled=true`는 사용하지 않았습니다. 도메인/스키마 재설계·
baseline 승인·merge는 범위 밖이며 수행하지 않았습니다.

구현한 범위:

- `core/protocol.rs`: capability·command `validateCatalog`, 이벤트
  `catalogValidated`(snapshot·diagnostics — `validateCandidate`와 같은 삼중)를
  추가했습니다. system identity로 실행되는 무상태 연산으로, Rust가 전체
  카탈로그를 검증하고 digest를 계산해 유효한 경우에만 불변
  `CatalogSnapshot`을 반환합니다. 거절된 import는 `snapshot: null`이며
  스냅샷이 없습니다. 저장·pin·활성화·context 변경을 하지 않습니다.
- 공유 fixture 4종(`fixtures/domain/catalog-import-*.json`, manifest 등록):
  유효 import·구조 위반·디코드 오류·unknown 상업 필드 보존 —
  `snapshotDigest` 핀으로 byte-stable identity를 고정했습니다.
- `worker/client.ts`: `validateCatalog` → `catalogValidated` 매핑과
  capability 요구를 추가했습니다.
- `features/catalog/import.ts` + `manager.ts`: 수동 입력·CSV·JSON을
  `CatalogImportDto`로 조립하고, Rust `normalizeCatalogFields` →
  `validateCatalog` 순서로 staged 검증합니다. 검증 전에는 어떤 입력도
  카탈로그로 쓰이지 않고, `commit` 시에만 digest 키로 영속화합니다.
  digest는 호스트가 만들지 않고 Rust가 계산한 값입니다.
- `features/owned/model.ts` + `manager.ts`: 보유 수납함을 프로젝트 입력
  캐리어로 Rust `normalizeInput`에 통과시켜 물리적 fact를 by-value로
  정규화한 뒤 라이브러리에 영속화합니다. CAS revision 검사가 편집·삭제를
  보호하고 unknown 물리 fact는 0·기본값으로 채워지지 않습니다.
- `persistence/db.ts` + `repository.ts`: `listCatalogs`·`putCatalog`,
  보유 수납함 목록·저장·삭제(revision CAS), `setActionStep`·
  `actionProgressFor`(프로젝트·input revision·planSnapshotId·stepId 키 —
  수용된 스냅샷 바인딩과 선행·후속 단계 순서를 강제)를 추가했습니다.
  `export.ts`가 카탈로그 행과 보유 라이브러리를 보내기에 포함합니다.
- `features/project/session.ts`: `setCatalogPin`(다음 입력 커밋에 묶일
  정확한 catalog digest), `upsertOwnedContainer`/`removeOwnedContainer`
  (draft에 by-value 삽입), `toggleActionStep`·`loadActionProgress`
  (수용 바인딩에만 진행을 연결하고 오래된 바인딩의 진행은 옮기지 않음)을
  추가했습니다.
- `app/CatalogScreen.tsx`(`#/catalog`): staged import UI(수동·CSV·JSON —
  진단 표시, 검증 전 미커밋)와 보유 수납함 라이브러리, 카탈로그 목록의
  `데모 · 합성 데이터`/`가져온 카탈로그` 출처 라벨을 추가했습니다.
- `app/ProjectScreen.tsx`: 카탈로그 pin 선택(목록에 없는 pin은 그대로
  표시)과 프로젝트 draft의 보유 수납함 연결·제거를 추가했습니다.
- `app/PlanScreen.tsx`: BOM에 재고·배송·링크 열과 상품 소계·배송비 합계·
  합계 행을 추가하고, offer fact의 unknown은 `미확인`으로 표시해 0·재고
  있음·확인됨으로 올리지 않습니다. 실행 순서에 수용된 스냅샷 바인딩의
  단계별 진행 체크박스를 추가했습니다 — 선행 단계가 끝나지 않은 단계는
  잠기고, 미수용 계획에는 진행이 비활성으로 표시됩니다.
- 회귀 수정 2건: `focus-context` 안내 줄이 blur 시 unmount되어 버튼이
  pointerdown~pointerup 사이에 이동해 react-aria press가 취소되던 결함을,
  빈 줄을 예약해 해결했습니다. BOM 표는 `.table-scroll` +
  `contain: inline-size`로 390px 뷰포트에서 문서 오버플로를 막았습니다.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --check`, `cargo test --workspace`, `cargo clippy
  --workspace --all-targets --all-features -- -D warnings`: 통과 —
  capability 목록 테스트에 `validateCatalog` 광고를 반영했습니다.
- `npm run contracts:check`: 통과 — 생성 DTO/schema/validators가 Rust
  원본과 일치(95 fixture 구조 유효).
- `npm run wasm:build`: wasm-bindgen 0.2.128 실 WASM 빌드 성공.
- `npm run typecheck`, `npm run lint`: 통과. 단위 harness의 fake port
  capability 목록에 `validateCatalog`를 추가했습니다.
- `npm test`(vitest unit): 43개 통과 — `catalogOwned.test.ts`가 실 WASM
  harness로 staged import 검증·거절·커밋 영속화, 보유 수납함 by-value
  등록·CAS 충돌, 실행 진행의 스냅샷 바인딩·선행/후속 강제를 검증합니다.
- `npx playwright test --grep-invert "@parity|@capture"`: 17개 통과 —
  새 `catalog.spec.ts`가 실 Chromium+WASM Worker로 수동 import의
  stage→Rust 검증→commit 영속화·거부된 JSON 미목록·합성 라벨 유지,
  보유 수납함 등록·reload 유지, 수용 계획의 진행 기록·reload 유지를
  검증합니다.
- `npm run test:parity`: 95 fixture native↔browser WASM 대조 일치
  (4개 catalog-import fixture 포함).
- `node scripts/check-design-tokens.mjs --self-test`: 통과 (33/33).
- `npm run build`: 프로덕션 빌드 성공.

미구현(이 task의 범위 밖): 구매 링크 열 외의 실제 주문 실행, 판매처 API
연동·실시간 재고(상업 접근은 미승인), catalog 행의 UI 단위 편집(재import로
대체), 서버 동기화, production runtime. 합성 카탈로그는 시연용 데이터이며
실제 상품·재고·가격이 아니고, 가져온 카탈로그는 입력된 출처 기준 라벨만
표시합니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK 이후 GLM, 동시 1명)이며 merge는 User만 결정합니다.

## 이전 구현: ZARI-007 신뢰 가능한 편집과 비교 가능한 대안 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #21이며 base는 ZARI-006 이후 main
`9807bf30cf1df37bab345ae6cbcc0cc542335948`입니다. 브랜치
`devin/zari-007-trustworthy-editing`에서 작업했고 Cloud Devin·production
runner·`runtime_enabled=true`는 사용하지 않았습니다. 도메인/스키마 재설계·
baseline 승인·merge는 범위 밖이며 수행하지 않았습니다.

구현한 범위:

- `core/edit.rs`: `evaluate_layout_edit` — 불변 `PlanSnapshot`의 무결성
  (구조 검증·digest 일치)과 현재 input/catalog digest 범위를 확인한 뒤
  `LayoutEditCommand` 하나를 적용하고 `finalize::evaluate_candidate`로
  전체 배치를 재검증합니다. 명령 수준·차단 검증 실패는 snapshot 없이
  구조화된 진단(unknown_placement, edit_base_not_in_scope,
  edit_source_required/mismatch/not_in_scope, dangling_variant_ref,
  offer_not_for_variant, digest_mismatch)으로 설명되고, provisional
  결과가 verified BOM으로 새지 않습니다. 부모 이동은 자식(contained)
  placement의 변환을 함께 옮기고 수량 분배는 유지됩니다.
- `core/protocol.rs`: capability·command `evaluateLayoutEdit`, 이벤트
  `editEvaluated`(report·snapshot·diagnostics — `validateCandidate`와 같은
  삼중), fixture 연산 `EvaluateLayoutEdit`과 `snapshotDigest: null`(거절에
  스냅샷 없음) oracle을 추가했습니다.
- 공유 fixture 6종(`fixtures/domain/edit-*.json`, manifest 등록): 허용
  이동·공간 밖 이동·허용/금지 회전·restore·알 수 없는 placement —
  `snapshotDigest` 핀으로 byte-stable identity를 고정했습니다.
- `worker/client.ts`: `evaluateLayoutEdit` → `editEvaluated` 매핑과
  capability 요구를 추가했습니다.
- `persistence/db.ts` + `repository.ts`: `EditChain`(inputDigest·
  baseSnapshotId·headSnapshotId·bounded undo/redo 전이 목록)을
  `DraftRow.edit`에 보존하고, `commitEditSnapshot`이 base+result 스냅샷의
  현재 input digest 일치·바이트 동일성을 확인한 뒤 직렬화된 CAS로 체인과
  함께 원자 기록합니다. `accepted`는 편집으로 바뀌지 않습니다.
- `features/project/session.ts`: `EditState`(선택·pending ghost·기각
  설명·chain base·검증된 head·undo/redo)를 추가하고,
  `requestLayoutEdit`/`selectPlacement`/`undoEdit`/`redoEdit`을 구현합니다.
  응답은 단조 `editSeq`·세션·context·input 경계로 fence되어 늦은 응답이
  새 명령을 덮지 못하고, `StaleRequest`는 pending만 정리합니다. undo/redo는
  매번 새 request id로 `restoreLayout`/원 명령을 재검증하며 오래된 토큰을
  되살리지 않습니다. 입력 커밋으로 digest가 바뀌면 체인 전체를 폐기하고,
  같은 입력 재열 때만 스냅샷 행이 모두 존재하면 체인을 복원합니다.
- `features/plan/view.ts` + `app/PlanScreen.tsx`: 배치 선택(도면 rect·목록
  버튼), inspector(X/Y/Z 수치 입력·허용 방향 라디오·variant/판매처 선택 —
  허용 방향 fact가 unknown이면 회전을 잠그지 않고 생략), pending ghost
  (점선·`검증 중` 라벨, BOM/비용 미반영), 기각 설명(Rust 진단+실패 check
  매핑), 되돌리기/다시 실행 버튼, 편집안 섹션과 `이 편집안을 채택`을
  추가했습니다. 키보드: 화살표 10mm(Shift 1mm)·R 회전·Ctrl+Z/Shift+Z/Y.
  후보 카드는 같은 공간 치수의 `viewBox`로 그리는 `PlanThumb`를 붙여 축척이
  같음을 보장합니다(물리 중복 제거는 기존 solver 키를 재사용).

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --check`, `cargo test --workspace`: 통과 —
  `crates/core/tests/edit.rs` 6개(허용 이동/공간 밖/허용·금지 회전/
  restore/unknown placement 직접 호출) 포함, 기존 capability 테스트에
  `evaluateLayoutEdit` 광고를 반영.
- `npm run contracts:check`: 통과 — 생성 DTO/schema/validators가 Rust
  원본과 일치(91 fixture 구조 유효).
- `npm run wasm:build`: wasm-bindgen 0.2.128 실 WASM 빌드 성공.
- `npm run typecheck`, `npm run lint`: 통과. 단위 harness의 fake port
  capability 목록에 `evaluateLayoutEdit`를 추가했습니다.
- `npm test`(vitest unit): 35개 통과 — session에 실 WASM으로 편집→검증
  head·undo/redo restore·체인 영속·재열 복원, 기각 설명+스냅샷 없음,
  superseded 응답 fence, 입력 커밋 시 체인 폐기를 추가했습니다.
- `npx playwright test --grep-invert "@parity|@capture"`: 14개 통과 —
  새 `edit.spec.ts`가 실 Chromium+WASM Worker로 선택→검사→수치 이동
  거절 설명→허용 이동 검증·편집안 생성→undo/redo→Ctrl+Z/Shift+Z→동일
  viewBox thumbnail→실 reload 체인 복원→입력 변경 시 체인 폐기→390px
  inspector를 검증합니다.
- `npm run test:parity`: 91 fixture native↔browser WASM 대조 일치
  (6개 edit fixture 포함).
- `node scripts/check-design-tokens.mjs --self-test`: 통과 (33/33).

미구현(이 task의 범위 밖): 드래그 편집, 임의 자유 회전(도메인 Orientation은
`upright0`/`upright90`만 존재), undo/redo의 경로 단위 부분 복원(현재 범위는
DOMAIN_MODEL의 layout-only chain), catalog import(008), 서버 동기화,
production runtime. 합성 카탈로그는 시연용 데이터이며 실제 상품·재고·
가격이 아닙니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK 이후 GLM, 동시 1명)이며 merge는 User만 결정합니다.

## 이전 구현: ZARI-006 검증된 계획 수직 슬라이스 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #18이며 base는 ZARI-005 이후 main
`35dc9ce864aa7487c200de93675dc4d3014a8d87`입니다. 브랜치
`devin/zari-006-verified-plan-slice`에서 작업했고 Cloud Devin·production
runner·`runtime_enabled=true`는 사용하지 않았습니다. 도메인/스키마 재설계·
baseline 승인·merge는 범위 밖이며 수행하지 않았습니다.

구현한 범위:

- `persistence/repository.ts`: `acceptSnapshot` — PlanSnapshot 행과
  프로젝트 accepted 바인딩을 하나의 트랜잭션으로 기록하되 `projectRevision`
  CAS, `currentInputDigest`/`catalogPin` 일치, 카탈로그 행 존재, 동일 키
  스냅샷의 바이트 동일성을 요구합니다. 거절은 `conflict`·`stale_input`·
  `binding_mismatch`로 구분하고 내용이 다른 기존 행은 `record_corrupt`로
  덮어쓰지 않습니다.
- `features/project/session.ts`: plan 상태(전략 결정·검색 진행/종료·대안·
  거절 후보·선택·채택 바인딩)를 세션에 연결하고 `startSearch`/`cancelSearch`/
  `selectAlternative`/`acceptPlan`/`isCurrentSnapshot`을 제공합니다.
  accept는 Worker `verifyRecord` 재검증 뒤 repository CAS를 거치며, 입력
  커밋으로 리비전이 바뀌면 진행 중 검색을 폐기하고 새 context를 설치합니다.
- `features/plan/view.ts` + `app/PlanScreen.tsx`: 선택된 PlanSnapshot 하나를
  평면/정면 SVG, 배치 목록, 미배치(사유·수량 미확인 포함), 독립 검증 결과,
  BOM(구매 없음은 명시적 상태), 실행 단계로 투영합니다. UI는 도메인 수치를
  재계산하지 않고 snapshot fact를 그대로 옮깁니다. 경로는
  `#/project/<id>/plan`이며 측정 화면과 왕복합니다.
- `app/sessionRegistry.ts`: 화면 전환 시 React가 새 화면의 acquire를 기존
  화면의 release보다 먼저 실행하므로, refcount + 한 macrotask 지연 close로
  살아있는 세션을 닫아버리는(`disposeProject` 후에도 context가
  'installed'로 남는) 경합을 없앴습니다.
- 데모 fixture: staging `minY`를 -400으로 고쳐 실제 anchor가 생기게 하고,
  `var-2`/`offer-2`를 추가해 구매 포함 계획이 실제로 상위 후보가 되게 했으며,
  카탈로그 digest를 새 내용에 맞춰 갱신했습니다(`249cfb41…`, draft.ts의
  CATALOG_PIN과 일치).

수정한 실제 결함(회귀 테스트 포함):

- `Op::Advance` 롤백 누락: 빈 옵션(생성 객체 0)의 Advance 프레임이 마크 없이
  팝되어 해당 옵션의 unassigned 항목이 형제 옵션으로 새어 후보가 같은
  ordinal을 배치+미배치로 보고 `ordinal_partition_overlap`에 걸렸습니다.
  Advance 프레임의 마크를 continuation 프레임으로 넘겨 경계를 보존합니다.
- `step(allowance)` 정지: `RunEval`은 `64+p²+4a`로 256(프로토콜 허용 하한)
  이상이 될 수 있는데, 비용이 남은 양보다 크면 실행 없이 Progress를 반환해
  pump가 진행 없는 이벤트를 무한 수신했습니다. 이제 한 스텝에 분할 불가능한
  op 하나는 반드시 실행합니다(allowance 초과분은 그 한 개에 한정).
- `open` 시 `skipWriteIfSame` reconcile이 normalize 왕복 후에도 staleInput을
  지우지 않아 재연 프로젝트가 영구 dirty로 보이던 것을 수정했습니다.
- Worker crash 후 lifecycle이 'ready'로 돌아올 때 context가 이전 세션의
  'installed'로 남아 검색이 `project_not_active`로 실패하던 것을, 실패/복구
  시점에 context를 명시적으로 낮추도록 수정했습니다.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  --locked -- -D warnings`, `cargo test --workspace --locked`: 통과 —
  solver 14개(새 회귀 3개: 빈 옵션 unassigned 누수, 허용치 이하 op 비용의
  종료, 번들 데모의 구매+무구매 대안) 포함.
- `npm run contracts:check`, `npm run typecheck`, `npm run lint`: 통과.
- `npm test`: unit 33개 — session에 실 WASM 검색 완료/accept CAS 저장·
  재열 복원/stale_input 거절/취소 후 재검색/Worker crash 실패 보고를 추가.
- `npm run test:browser -- --project=chromium`: 13개 통과 — plan.spec 3개가
  실 Chromium+WASM Worker로 동일 스냅샷 SVG/검사/BOM/가이드, accept→실
  reload 복원, 입력 변경 시 stale 표시+CAS 거절, 취소→재검색, 390px을 검증.
- `npm run test:parity`: 85 fixture native 대조 일치.
- `node scripts/check-design-tokens.mjs --self-test`: 통과.

미구현(이 task의 범위 밖): catalog import(008), 서버 동기화, 임의 편집/드래그
도구, production runtime, 실 상품 연동. 합성 카탈로그는 시연용 데이터이며 실제
상품·재고·가격이 아닙니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK 이후 GLM, 동시 1명)이며 merge는 User만 결정합니다.

## 이전 구현: ZARI-005 저장 측정 흐름과 Worker 수명주기 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #15이며 base는 ZARI-004 병합 커밋
`2bfd9f79441dc57370d7249f60aea6b44cbae62a`입니다. 브랜치
`devin/zari-005-worker-lifecycle`에서 작업했고 Cloud Devin·production runner·
`runtime_enabled=true`는 사용하지 않았습니다. 도메인/스키마 재설계·서버 동기화·
baseline 승인·merge는 범위 밖이며 수행하지 않았습니다.

구현한 범위:

- `persistence/db.ts`: Dexie 스키마 v1 — projects·inputs·drafts·snapshots·
  ownedContainers·catalogs·actionProgress·metadata 스토어와 행별 envelope guard.
  더 새로운 `schemaVersion`은 `unsupported_schema`(보존·쓰기 거부), 형식 위반은
  `record_corrupt`로 구분하며 읽기에서 복구·기본값 대체를 하지 않습니다.
- `persistence/repository.ts`: 탭당 직렬 write queue, `projectRevision` CAS로
  두 탭의 silent last-write-win 차단, draft generation stale fence,
  normalize→커밋 단일 트랜잭션(draft+input+project 동시 기록), quarantine
  (10건/10MiB 상한), 프로젝트 범위 삭제.
- `persistence/export.ts`: 표준/복구 export envelope — 각 레코드 digest 동봉,
  quarantine 원본 바이트 포함, 미구현 attachments는 명시적 제외 목록으로 표기.
- `worker/client.ts`: `systemRequest`(system identity의 verifyRecord 경로 —
  project activation 없이 무결성 검사 가능), per-request timeout, meta 정합·
  stale·순서 fencing 유지.
- `worker/controller.ts`: `WorkerController`(ensure/recover/dispose와
  lifecycle 이벤트 — pending은 항상 reject, 조용한 재시도 없음)와
  `SearchPump`(연속 검색의 host macrotask 스케줄링, bounded stepSearch,
  cooperative cancel + hard-timeout, stall watchdog, crash→onFailed).
- `features/project/`: raw draft 조작(`items.<id>`는 배열에서 id로 탐색),
  `project_measurement` 문법과 정합하는 MEASUREMENT_FIELDS, `ProjectSession` —
  open 시 `verifyRecord` 무결성 검사·손상 격리·context 설치/열화,
  autosave+commit reconcile(normalize→CAS commit→activate handshake),
  단위 변경은 Rust `formattedFields` 응답과 원자적으로 커밋(JS 변환 없음),
  BroadcastChannel 다중 탭 충돌 감지, reloadLatest/saveAsCopy/export 복구,
  저장 실패 시 close 차단.
- `app/`: hash router(`#/projects`·`#/project/<id>`·`#/probe`), 프로젝트
  목록/생성 화면, 측정 편집 화면(저장 상태·diagnostics·정규화 값·충돌/손상/
  워커 패널·export), 기존 probe 화면 이동, 탭당 repository+controller 공유.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `npm run typecheck`, `npm run lint`: 통과.
- `npm test`: unit 28개 — repository 9(CAS 충돌·손상·미지원 버전·
  quarantine·사본 복구), client 7(stale/순서/crash fencing), searchPump 5
  (명시적 protocol-harness 표기), session 8 — `WasmPort`가 실제 zari_wasm
  Runtime을 구동해 verifyRecord·normalize·activate·실 solver step/cancel을
  검증(실 Rust 계산이며 transport만 대체).
- `npm run test:browser`: 10개 통과 — project 7(생성/편집/저장/실 reload,
  invalid raw text 보존, Rust 단위 변환, A→B 전환 fencing, 두 번째 탭 충돌,
  주입된 저장 실패, Worker crash/retry, 390px) + probe 3(경로 `#/probe`로 갱신).
- `npm run test:parity`: 85 fixture native Rust와 실제 Chromium Worker/WASM
  전부 일치(`search-cancelled` 등 runSearch 4개 포함 — 실 solver 취소 증거).
- `node scripts/check-design-tokens.mjs --self-test`: 33/33 통과.

검증 중 발견해 수정한 결함:

- `setUnit`이 새 단위를 draft에 먼저 기록한 뒤 format을 요청해 Rust가
  '600'을 600cm(6000mm)로 해석 — 프로토콜대로 matching `formattedFields`
  응답과 단위를 원자적으로 커밋하도록 수정.
- `items.<id>` 필드 경로를 맵 키로 해석해 ProjectScreen 렌더가 붕괴 —
  배열 요소의 `id`로 탐색하도록 수정(Rust `project_measurement` 문법과 정합).
- 이미 ready인 Worker로 프로젝트를 다시 열 때 lifecycle 이벤트가 발생하지
  않아 worker 표시가 'uninitialized'로 고착 — open 시 현재 상태를 동기화.
- searchPump harness의 `searchCompleted` fixture가 `SearchResult` 스키마를
  위반해 client가 worker를 폐기 — 실제 계약 형태로 수정.

미구현(이 task의 범위 밖): snapshot 수용·도면·BOM·실행 가이드(006+),
catalog import/validateCatalog(008), 서버 동기화, production runtime.
IndexedDB는 이 기기의 내구 저장소이며 서버 백업으로 취급하지 않습니다.
손상·미지원 레코드는 복구용 export로 보존되고 현재 계획으로 승격되지 않습니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK_BUILD 이후 GLM, 동시 1명)와 issue #15의 AUDIT_FLOOR이며,
merge는 User만 결정합니다. ZARI-001 화면 baseline은 draft 그대로입니다.

## 이전 구현: ZARI-004 규칙→전략→레시피→유계 배치 탐색 solver (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #13이며 base는 ZARI-003 병합 커밋
`2bc56c73e9db78a0c65c0303f443dd7e50c1ce8a`입니다. 브랜치
`devin/zari-004-resumable-solver`에서 작업했고 Cloud Devin·production runner·
`runtime_enabled=true`는 사용하지 않았습니다. UI 재설계·baseline 승인·merge는
범위 밖이며 수행하지 않았습니다.

구현한 범위:

- `crates/solver`: 규칙 레지스트리→`StrategyDecision`→recipe-bound 옵션→증분
  패킹→외부 배치 anchor→offer 튜플 열거까지의 결정적 생성 체인. 지원 전략은
  MinimumPurchase·FrequencySeparation·ActivityGrouping·ActiveReserveSeparation·
  OneActionAccess이며 각 결정은 zone·reason·priority·assumption을 동반합니다.
- 재개 가능한 탐색 기계: 숨은 재귀 없는 명시적 `Frame` continuation 스택,
  롤백 마크, per-step work-unit allowance와 node budget, 대안 수 cap,
  명시적 종료 사유(`scopeComplete`·`budgetExhausted`·`cancelled`).
  allowance보다 비용이 큰 op은 실행하지 않고 진행 없이 보존합니다(스텝 분할
  불변성). 취소는 임의 프레임에서 즉시 관측됩니다.
- 패킹: 직접 배치, 알려진 가용 수량만큼만 할당되는 보유 컨테이너
  (unknown 가용성은 `owned_availability_unknown` 계열 제한으로 보존),
  pull-금지 품목 조기 배제, `must_stay_together`·호환 클러스터 원자 패킹,
  unknown 기하의 조건부 부착, 빈 컨테이너 배치 미생성, 기존 개방 target
  우선·신규 target 결정적 확장, AllowMultiple의 결정적 조합 확장과
  그룹별 옵션 cap(직접 배치 옵션은 항상 생존).
- 배치: 방향 열거(`Upright0`→`Upright90`), nominal extent, 바닥 고도,
  벽 간격, footprint, hard zone, 형제 충돌·이격, 물리 solid, 개폐 범위,
  staging·장애물 sweep, hard 1-action 접근의 생성측 사전 검사. unknown 사실은
  hard 실패로 취급하지 않고 nominal 후보를 방출해 독립 검증기가 conditional을
  보고하게 합니다(unknown 내경→nominal clearance anchor, unknown 바닥
  고도→`z=0` nominal).
- offer/비용: 사용 variant별 offer 슬롯(variant ID 정렬, 한 variant의 모든
  placement가 동일 선택을 공유 — validator의 per-variant 집계와 정합),
  완전히 알려진 hard budget 초과만 생성측에서 pruning(`CostAccumulator`와
  동일 산술), 미해결 offer 사실은 unresolved로 보존, 물리 dedup은 offer
  선택을 제외해 동일 물리 배치의 구매 변형이 하나의 유지 대안으로 경쟁,
  결정적 rank key와 bounded 대안 유지.
- 독립 검증 경계: solver의 nominal 검사는 생성측 pruning일 뿐이며 모든
  수용 후보는 `evaluate_candidate`→accepted finalizer 경계를 통과해야
  `SearchAlternative`로 발행됩니다. 성공 캐시 공유·자기 검증 없음.
- 레이아웃 조립: 품목당 하나의 unassigned 레코드(ordinal range 병합,
  `UnknownQuantity` 포함), 호환성 차단 품목의 정직한 표현, 전체 신규
  컨테이너 placement의 완전한 offer 선택.
- protocol: `proposeStrategies`/`startSearch`/`stepSearch`/`cancelSearch`
  command와 `strategiesProposed`/`searchStarted`/`searchProgress`/
  `searchCompleted`/`searchCancelled` event, Runtime의 search handle과
  종료 후 요청 fencing, `SearchEngine`/`SearchSession` trait,
  `DomainOperation::ProposeStrategies`·`RunSearch`와 `FixtureSearchStep`/
  `RunSearchSpec` fixture 경로(요청열은 Rust/WASM이 생성하고 native·browser
  동일). engine-less runtime은 검색 capability를 정직하게 제외합니다.
- `BUILD_ID = "zari-domain-3"`, `SOLVER_VERSION = "zari-solver-v1"`. WASM
  Runtime은 `SolverEngine`을 설치하고 TS client의 capability·buildId 검사를
  갱신했습니다.
- fixture: `strategies-proposed`·`search-scope-complete`·`search-budget-exhausted`·
  `search-cancelled`·`search-progress-window` 5개 추가(domain 85개),
  manifest 등록, 기존 80개 fixture의 `engineContext.buildId` 재고정과
  `solverVersion` 반영으로 바뀐 6개 candidate fixture의 `snapshotDigest`
  재계산·재고정.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --all -- --check`: 통과.
- `cargo clippy --workspace --all-targets --locked`: solver·wasm 경고 0,
  zari-core의 선존 경고 1개(validator collapsible-if, ZARI-003 read-only 코드)만 잔존.
- `cargo test --workspace --locked`: 전체 통과 — core 55 + solver 11
  (전략 결정성·완전성, 취소, node/work-unit budget 소진, 부분 진행,
  컨테이너 패킹, 대안 유일성, 모든 유지 대안의 독립 검증 통과,
  구매 불가 직접 배치 대안, 반복 실행 결정성, 스텝 분할 불변성).
- `npm run contracts:generate` 후 `npm run contracts:check`: 통과(85개 fixture가
  Rust fixture schema에 적합, drift 없음).
- `npm run wasm:build`(wasm-bindgen 0.2.128 locked, wasm32-unknown-unknown),
  `npm run typecheck`, `npm run lint`, `npm test`(client 단위 6개): 통과.
- `npm run test:parity`: 같은 85개 fixture의 native Rust와 실제 Chromium
  Worker/WASM event가 전부 일치(4개 runSearch·1개 proposeStrategies 포함).
  `npm run test:browser`(probe 3개 흐름): 통과.

검증 중 발견해 수정한 결함:

- `EvalAnchor`가 object commit 후 다음 anchor 재열거 시 자기 commit을 되돌리지
  않아 `duplicate_id` 구조 거절이 발생 — `Uncommit` op으로 수정.
- `FinishPack`의 unassigned 로그가 롤백 마크 이전에 기록돼 옵션 0의 기록이
  후속 옵션으로 누수 — 마크 선취 후 기록으로 수정.
- 보유 컨테이너가 unknown 가용성으로 할당될 수 있던 문제 — 알려진 가용
  수량만큼만 할당하고 나머지는 제한으로 보존.
- unknown 내경/바닥 고도에서 후보가 생성측에서 소멸해 validator가
  unknown을 보고할 기회가 없던 문제 — nominal anchor/고도로 수정.
- 품목당 다수 unassigned 레코드가 `duplicate_unassigned`를 유발 — reason별
  병합이 아닌 품목당 단일 레코드(ordinal 병합)로 수정.
- allowance가 프로토콜 하한 미만이면 무거운 quantum에서 진행 없이 기아하는
  것이 정상 의미론임을 확인하고 테스트는 운용 allowance(≥1024)로 분할
  불변성을 검증.

미구현(이 task의 범위 밖): 전략 휴리스틱 최적화·ranking 품질 튜닝,
구획 내부 3D 적재, 실제 상품 데이터, 도면·실행 가이드 UI, IndexedDB 저장,
성능 측정·튜닝. solver의 nominal 통과는 물리 적합의 최종 주장이 아니며
발행 판정은 항상 독립 validator/finalizer가 내립니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only
review(GROK 이후 GLM, 동시 1명)와 issue #13의 AUDIT_FLOOR이며, merge는
User만 결정합니다. ZARI-001 화면 baseline은 draft 그대로입니다.

## 이전 구현: ZARI-003 독립 검증과 PlanSnapshot 확정 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #11이며 base는 ZARI-002 병합 커밋
`c08e815fb6e309c54481f3dc59e2e8fab48680c1`입니다. 브랜치
`devin/zari-003-independent-validator`에서 작업했고 Cloud Devin·production runner·
`runtime_enabled=true`는 사용하지 않았습니다. solver·search pruning·UI는 이 task의
범위 밖이며 구현하지 않았습니다.

구현한 범위:

- `geometry`: 축 구간·cuboid·footprint, 방향별 치수, nominal/conservative envelope,
  삽입 sweep과 staging 부피 계산. unknown 불확도는 보수 근거에서 즉시 unknown이 됩니다.
- `validator`: 제안을 독립 재검증하는 `ValidationReport` — 외경·공간 경계, cavity
  수용, 형제 겹침, 부모 수용, support·elevation·하중 집계, aperture·삽입 경로·staging,
  파생 설치 순서(Kahn + 독립 재생), 작동 접근성, 방향·회전, 수량 보존(ordinal 분할·
  보유 상한), 구매 검증(재고·가격·배송·예산·offer/variant 정합·pack 잉여)을 각 check의
  nominal/conservative basis로 구분해 기록합니다. caller가 제공하는 통과 주장은
  존재하지 않으며 check는 pass·fail·unknown·notApplicable을 유지합니다. hard budget
  초과·구매 불가 Fail만 발행을 차단하고 soft budget 초과 Fail은 선호 위반으로
  report에 남되 snapshot을 차단하지 않습니다(N1 수정).
- `finalize`: catalog evidence 부분집합, 결정적 BOM(checked pack 산술·잉여·금액),
  비용 요약, prerequisite로 연결된 action DAG(acquire→arrive→install→transfer),
  SnapshotContent로부터 파생되는 content digest 기반 `PlanSnapshot`. 거절된 제안은
  snapshot을 발행하지 않고 conditional 제안은 계약이 허용하는 명시적 conditional
  snapshot만 발행합니다.
- `protocol`: `validateCandidate` command와 `candidateValidated` event, project
  context의 active input/catalog 저장, `DomainOperation::ValidateCandidate` fixture
  경로. 구조적 결함은 diagnostics와 함께 report·snapshot 없이 거절됩니다.
- `plan`의 `CandidateProposal`, `validate`의 `validate_strategy`와 candidate layout
  구조 검사(중복 ID·dangling 참조·ordinal 분할·purchase binding·전략 참조).
- fixture: domain 22개 candidate 사례(유효·conditional·적대적: ghost placement,
  dangling 참조, ordinal 중복, 보유 초과, 형제 겹침, 부유 support, 하중 초과,
  방향 금지, 공간 이탈, staging 차단, 1-action 접근 차단, hard budget, soft budget,
  미해결 offer, 구매 불가, 잘못된 variant/offer, decode 오류)와 manifest 등록.
- `tests/validator.rs`: 독립 oracle 11개 — naive interval 기하 oracle과 생산 코드 대조,
  수량 보존 수동 집계, 설치 순서 파생 검증, snapshot digest 재계산·왕복 검증,
  unknown→pass 불승격, BOM pack 산술 독립 재계산, soft budget advisory/hard budget
  차단 경계, 무컨텍스트 요청 거절, 악의적 형상 fail-closed.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`: 통과.
- `cargo test --workspace --locked`: 55개 통과(lib 11, bootstrap 9, domain 11, protocol 13, validator 11).
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures`: 80개 통과.
- `npm run contracts:generate` 후 `npm run contracts:check`: 통과(80개 fixture가 Rust fixture schema에 적합, drift 없음).
- `npm run wasm:build`, `npm run typecheck`, `npm run lint`: 통과.
- `npm test`: Worker host 단위 검증 6개 통과(client capability·reply 매핑 갱신 반영).
- `npm run test:parity`: 같은 80개 fixture의 native Rust와 실제 Chromium Worker/WASM
  event가 전부 일치. `.wasm` 응답 로드를 실제로 대기한 뒤 `runDomainFixture`를 실행했습니다.
- `cargo tree -p zari-core --locked`: serde·serde_json·schemars·sha2·unicode-normalization
  계열만 확인; solver·탐색 의존성 없음(solver crate는 아직 존재하지 않음).

검증 중 발견해 수정한 결함:

- 무료 배송 offer에서 shipping 합계가 None으로 남아 `grand_total`이 `total_unknown`으로
  붕괴하던 문제 — 무료 배송을 명시적 0으로 기록하도록 수정.
- 삽입 순서 의존 방향이 반대였던 문제 — B의 sweep이 A의 최종 부피를 가로지르면 B가 먼저
  설치되어야 하는데 반대로 기록해 모든 교차 쌍이 `insertion_order_unsupported`로
  거절되던 것을 수정하고, 독립 replay로 순서를 재확인합니다.
- 순서를 증명할 수 없을 때(unknown)도 임의 순서가 `install_order`로 내려가 action DAG를
  오도하던 문제 — 증명된 순서만 DAG 근거로 사용하고 그 외에는 빈 순서로 둡니다.

감사 delta(N1): Astra KEEP_DRAFT 지적으로 `chk:bg:soft`의 Fail이 `CheckKind::Budget`
전체의 blocking 판정에 잘못 포함되어 PlanSnapshot 발행을 차단하던 것을 수정했습니다.
SOLVER.md § commercial은 hard budget만 거절 조건으로 정의하고 DOMAIN_MODEL.md는
hard/soft 예산을 별도 필드로 구분하므로, `blocking`은 emit 경로에서 check id로
결정해 `bg:soft`만 advisory로 둡니다. soft 초과는 `soft_budget_exceeded` Fail로
report에 그대로 남고 commerce는 conditional을 유지하며, `bg:hard`의 cap 초과와
`purchase_disallowed`는 계속 blocking입니다. report 내용이 실제로 바뀌었으므로
`candidate-contained-conditional`·`candidate-provisional`·`candidate-unresolved-offer`의
고정 snapshot digest를 Rust가 계산한 새 값으로 다시 pinning했고, 새
`candidate-soft-budget` fixture는 soft만 초과한 후보가 snapshot을 발행함을,
`candidate-hard-budget`·`candidate-purchase-disallowed`는 snapshot null 유지를
확인합니다.

미구현(이 task의 범위 밖): solver·search pruning·UI, 실제 상품 데이터, IndexedDB
저장·복원, 도면·실행 가이드 렌더링, 임의 3D 적재·안전 인증. conditional snapshot은
모든 조건이 통과했다는 뜻이 아니며 unknown은 계약상 conditional/blocked로 남습니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only review
(GROK_BUILD 이후 GLM, 동시 1명)와 issue의 AUDIT_FLOOR(A3 validator audit + Class E
독립 검토)이며, merge는 User만 결정합니다. ZARI-001 화면 baseline은 draft 그대로입니다.

## 이전 구현: ZARI-002 동결 도메인 계약과 canonical fixture 교환 (작성자 DEVIN local CLI)

정본 작업은 GitHub issue #9/revision 1이며 base는 ZARI-001 병합 커밋
`4a6d3a59b0b9e03c1980d7e5d592e570fc55f664`입니다. 브랜치 `devin/zari-002-domain-interchange`에서
작업했고 Cloud Devin·production runner·`runtime_enabled=true`는 사용하지 않았습니다.

구현한 범위:

- `scalars`: LengthMm·ClearanceMm·PositionMm·Quantity·PackQuantity·UnitCount·MassGrams·
  MoneyKrw·Revision·WorkCount·Id·Digest의 고정 경계와 signed position·money·mass·u64 문자열
  파서. 비유한정·sub-mm·범위 초과·비canonical 숫자 문법은 구조적으로 거부됩니다.
- `facts`/`input`/`catalog`/`strategy`/`plan`: DOMAIN_MODEL.md의 ProjectInput·CatalogSnapshot·
  PlanSnapshot·CandidateLayout·LayoutEditCommand·VerifiableRecordDto 그래프. unknown과
  not-applicable은 서로 다르며 unknown은 0·pass·확인으로 변환하지 않습니다.
- `canonical`: NFC 정규화와 비의미적 순서 정렬을 포함한 canonical serialization과
  SHA-256 `content_digest`/`input_digest`/`catalog_digest`/`snapshot_digest`/`context_id`.
- `raw`/`normalize`/`validate`: `deny_unknown_fields` raw DTO → fail-closed 정규화 +
  진단, 그리고 ID 중복·dangling 참조·cycle·ordinal 분할·purchase binding·support·
  retrieval 허용·action DAG의 구조 검증.
- `protocol`: `BUILD_ID = "zari-domain-2"`, capabilities 8개, `activateProject`의
  project context와 contextId fencing, `verifyRecord`(input/catalog/snapshot),
  `normalizeCatalogFields`, bounded replay와 unique-key·depth·size guard.
- fixture 교환: `DomainFixture` 계약과 `domain_fixture_requests`/`execute_domain_fixture`를
  Rust가 소유하고, 같은 요청열을 native fixture_runner와 실제 Chromium Worker/WASM이 실행.
  WASM은 `domainFixtureRequests` 바인딩으로 요청 생성까지 Rust가 담당합니다.
- 생성 계약: Rust schema 16개 root를 `https://zari.local/contracts/domain-v2`로 합쳐
  `dto.ts`·`schema.json`·`validators.mjs`·`validators.d.mts`를 생성합니다.
  수동으로 유지하는 TS 도메인 스키마는 추가하지 않았습니다.
- fixture: bootstrap 28개(buildId만 갱신) + domain 30개 = 58개, manifest coverage exact.

실제로 실행한 검증(이 checkout에서 실행한 결과이며 CI·독립 감사를 대체하지 않습니다):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`: 통과.
- `cargo test --workspace --locked`: 44개 통과(scalars 11, bootstrap 9, domain 11, protocol 13).
  domain suite는 공유 fixture 30개 실행, layout/snapshot 그래프 거부, activation/contextId fencing,
  checked 묶음 계산과 proptest 4개(permutation digest 불변·u64 왕복·임의 문자열 파서·
  의미적 차이 digest 비충돌)를 포함합니다.
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures`: 58개 통과.
- `npm run contracts:generate`를 연속 2회 실행해 4개 산출물 SHA-256이 동일함을 확인(drift 없음),
  `npm run contracts:check`: 통과(58개 fixture가 Rust fixture schema에 적합).
- `npm run wasm:build`, `npm run typecheck`, `npm run lint`, `npm run test:build`: 통과.
- `npm test`: Worker host 단위 검증 6개 통과.
- `npm run test:parity`: 같은 58개 fixture의 native Rust와 실제 Chromium Worker/WASM event가
  전부 일치. duplicate key·잘린 JSON·5MiB 초과 원시 payload는 각각 `invalid_json`·
  `invalid_json`·`message_too_large` fatal로 거부됨을 실제 Worker에서 확인.
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev`: serde·
  wasm-bindgen·sha2·unicode-normalization 계열만 확인; DOM·네트워크·data-engine 의존성 없음.

고정 digest vector(동일 fixture가 native와 browser에서 재생산):

- `project-minimal-pass` / `project-permuted-pass` input digest:
  `bdc80a6cc50fa632760be5c7f5c997abf5fd7ba59659e2d0c9537fe4570edacd`
- `project-distinct-digest` input digest:
  `ae6350ca230ced7e99dcdc3a84cdc75aeaff25e8ab207d0b192ab2d2bf64f773`
- `project-large-counter-pass`(u64 최대 근처 workCount·money) input digest:
  `0c39aedd1fdd10ed50506a3aa0ce99ed970714a3b4c36d579081e4fde9388c8a`
- `project-nfc-label-pass` / `project-nfc-decomposed-pass` input digest:
  `8b1d9ebf8bbee7991e1fb1db33dfa38c401ed0c1397fe4b2a31772aea3989405`
  (NFC 조합·분해 두 철자가 동일 digest로 수렴)

미구현(이 task의 범위 밖): solver·geometry algorithm·조직화 전략, 실제 상품 데이터,
IndexedDB 저장·복원·마이그레이션, 도면/BOM/실행 가이드 렌더링, 새 제품 UI.
`PlanSnapshot`은 데이터 구조와 검증만 있으며 계획을 생성하지 않습니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 단계는 독립 read-only review
(GROK_BUILD 이후 GLM, 동시 1명)와 issue의 AUDIT_FLOOR(A3 Rust Domain Gate)이며,
merge는 User만 결정합니다. ZARI-001 화면 baseline은 draft 그대로입니다.

## 이전 구현: ZARI-001 실행 가능한 Rust/WASM 연결 (2026-09-23 UTC)

아키텍처 PR #2가 병합된 `d3cb460c94ca6de11d00dac181c0f8d8b95314e7`을 기준으로
`codex/zari-001-executable-bridge`에서 작업했습니다. 아래의 초기 문서·설계 단계 기록은
과거 상태이며 현재 앱의 부재를 뜻하지 않습니다. 정본 작업은 GitHub issue #5/revision 1입니다.
사용자가 직접 지시한 구현·실제 캡처 범위이며 자동 dispatch나 다른 runtime PR의 활성화가 아닙니다.

구현한 경로는 **한국어 원문 입력 → JSON Worker protocol → 실제 Rust/WASM 정규화·폭 검사·묶음 계산 → SVG/결과 화면**입니다.
Rust core와 얇은 WASM crate, 고정 도구/lockfile, Rust에서 생성한 DTO/schema/standalone validator,
세션·project activation·editor epoch·revision에 따른 응답 폐기, Worker 재시작과 입력 유지가 있습니다.
React Aria 입력과 SVG 치수선 연결, 미확인/유효하지 않은 값/오래된 결과의 구별,
390px/1440px 화면을 구현했습니다. React가 폭 적합성이나 묶음 계산을 재구현하지 않습니다.

실제로 실행한 검증:

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`: 통과.
- `cargo test --workspace --locked`: 30개 통과(스칼라 8, probe 9, protocol 13).
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap`: 독립 예상값을 포함한 공유 fixture 28개 통과.
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev`: 브라우저 의존성 확인; DOM·네트워크·GPU/data-engine 의존성 없음.
- `npm ci`, `npm run wasm:build`, `npm run contracts:generate`, `npm run contracts:check`, `npm run typecheck`, `npm run lint`, `npm run build`: 통과.
- `npm test`: Worker host 단위 검증 6개 통과.
- `npm run test:browser -- --project=chromium`: 실제 WASM 입력/오류/단위, 키보드/모바일/새로고침, Worker 오류/재시작의 3개 흐름 통과.
- `npm run test:parity`: 같은 fixture 28개를 native Rust와 Chromium Worker/WASM에서 실행한 authoritative JSON이 전부 일치. 메타데이터로 결과 차이를 숨기지 않습니다.
- `node scripts/check-design-tokens.mjs --self-test`: self-test 10개 및 실제 색상 대비 사례 33/33 통과.

로컬 브라우저 검증은 Chromium 153.0.8010.0을 사용했습니다. 실행 환경의 기본 브라우저 배포 경로를
이용할 수 없어 저장소 밖의 `@sparticuz/chromium@153.0.0` 실행 파일을
`ZARI_CHROMIUM_EXECUTABLE`/`ZARI_CHROMIUM_ARGS_JSON`으로 지정했습니다. 앱의 의존성을 추가한 것이 아니며,
계산은 실제 브라우저 Worker의 WASM입니다. CI는 Playwright가 설치하는 Chromium 경로를 사용합니다.
위 결과는 로컬 실행 증거이며 원격 CI 성공·독립 A3 감사·화면 승인으로 대체하지 않습니다.

미구현: solver, 독립 최종 배치 검증, 실제 상품, 조직화 전략, PlanSnapshot/BOM/실행 가이드,
IndexedDB 저장·복원, 취소 가능한 증분 탐색, 서비스 배포. 폭 통과는 설치·내용물·접근·하중 통과가 아닙니다.
새로고침은 새 예제로 시작합니다. `5mm`는 합성 fixture 조건이며 설치 권장치가 아닙니다.

실제 캡처 5개(데스크톱 정상/초과/미확인/포커스, 모바일 정상)의 파일·sourceCommit·환경·해시는 `design/baselines/manifest.json`에 기록했습니다.
사용자가 구체적인 캡처를 승인하기 전까지 모두 draft이며 승인된 baseline 수는 0입니다.
다음 단계는 이 구현 PR의 독립 review/A3 Bridge Gate와 사용자 merge 결정입니다.
작성자가 자신의 변경에 독립 PASS를 부여하지 않습니다. 이후 ZARI-002는 기존 선행 gate와 정본 task 절차에 따릅니다.

### 재검증 기록: 현재 main 기반 rebase 후 재실행 (2026-09-24 UTC, 작성자 DEVIN local CLI)

사용자 지시로 이 task의 작성자(owner)가 DEVIN local CLI(SWE)로 이어졌습니다. 같은 TASK_ID의 기존
브랜치 `codex/zari-001-executable-bridge`와 Draft PR #7을 재사용했으며 새 브랜치·새 PR을 만들지
않았습니다. 브랜치를 관측 main `1890a5b097f94faad11a3d670a70621cc980f648` 위로 rebase했고
rebase 직후 HEAD는 `58fa583e302ee5e50d05c478b9b05de3b11fe21c`입니다. 충돌은 이 문서 한 곳뿐이며
양쪽 절을 모두 보존했습니다. 보존 원문 두 개와 SOURCE_MANIFEST는 변경하지 않았습니다.

rebase된 tree에서 위 검증 명령 전부를 재실행했습니다:

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`: 통과.
- `cargo test --workspace --locked`: 30개 통과(스칼라 8, probe 9, protocol 13).
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap`: fixture 28개 독립 예상값 일치.
- `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev`: wasm-bindgen/serde 계열만 확인; DOM·네트워크·GPU/data-engine 의존성 없음.
- `npm ci`, `npm run wasm:build`(wasm-bindgen CLI 0.2.128 일치), `npm run contracts:generate`, `npm run contracts:check`, `npm run typecheck`, `npm run lint`, `npm run build`: 통과.
- `npm test`: Worker host 단위 검증 6개 통과.
- `npm run test:browser -- --project=chromium`: 3개 흐름 통과. 이 환경에서는 Playwright가 설치한 Chromium headless shell 153.0.8010.12로 실행했으며 `@sparticuz/chromium` 우회가 필요하지 않았습니다.
- `npm run test:parity`: 같은 fixture 28개의 native Rust와 실제 Chromium Worker/WASM 결과가 전부 일치.
- `node scripts/check-design-tokens.mjs --self-test`: self-test 10개와 대비 사례 33/33 통과.
- `npm run dev -- --host 127.0.0.1`로 dev 서버를 띄우고 실제 Chromium에서 확인: `.wasm` 응답 로드, 590mm 통과, 195mm 입력 시 605mm 초과, 묶음 3, 콘솔 오류 0.
- 도구: Rust 1.98.1 / Node 24.19.0 / npm 11.17.0(engines 범위 내) / Playwright 1.63.0.

이 기록은 작성자의 로컬 실행 증거이며 원격 CI 성공·독립 review·A3 Bridge Gate·화면 승인·merge를
주장하지 않습니다. 이 문서 커밋 자체가 새 HEAD를 만들므로 정본의 최종 HEAD와 검증 근거는 PR #7의
exact-HEAD 기록을 따릅니다. 이전 캡처의 sourceCommit은 rebase 전 SHA이며, 앱 소스는 rebase 후에도
동일합니다(제품 코드 diff 없음, main의 운영 변경과 제품 경로 충돌 없음).


## 이전 기록: 초기 문서 등록 (efc6619)

아래 이전 기록의 변경 범위는 초기 문서 등록입니다. Rust·WASM·React 애플리케이션 구현을 수행한 작업이 아닙니다.

## 준비한 내용

- 프로젝트명 ZARI와 Rust 중심 기술 방향.
- 제품 마스터프롬프트와 Rust 추가 지시문 원문.
- README, AGENTS, .gitignore, 원본 파일 무결성 manifest.
- 첫 구현 범위와 아래 재개 순서.

## 아직 없는 것

- Cargo workspace, Rust core·solver·WASM 바인딩.
- React/TypeScript 웹앱과 Web Worker 연결.
- IndexedDB 저장, 도면, BOM, 실제 상품 카탈로그.
- 실행 가능한 fixture·단위 테스트·브라우저 통합 테스트.
- CI workflow, 성능 측정, 배포와 서비스 URL.

## 이번 검증의 범위

두 프롬프트는 대화에서 제공한 원본 파일 및 ZIP 내부 파일과 바이트가 일치합니다. SHA-256과 Git blob SHA를 SOURCE_MANIFEST.json에 기록합니다. GitHub 게시 시 원격 tree의 blob SHA와 대조합니다.

이는 문서 무결성 검증입니다. 앱 테스트·브라우저 테스트·CI 성공 또는 외부 레퍼런스의 현재 유효성 검증을 의미하지 않습니다.

## 다음 개발 재개 순서

1. README와 두 프롬프트를 읽고 Rust 추가 지시문을 우선 적용합니다.
2. 기능 브랜치에서 도구 버전·실행 환경을 확인하고 최소 Cargo workspace를 구성합니다.
3. 정수 mm·수량·금액 타입, 공간 경계 검사, 구매 묶음 계산과 fixture를 구현합니다.
4. 같은 fixture를 네이티브와 실제 브라우저의 Worker/WASM에서 실행해 대조합니다.
5. React 입력 → Rust 계산 → 배치도·BOM → 로컬 저장·복원 흐름을 연결합니다.
6. 구현·미구현과 실행한 검증 결과를 구분해 이 문서를 갱신합니다.

DuckDB·Polars·cuDF는 현재 미도입입니다. 문서에 등장한다는 이유만으로 설치하지 않습니다.

## 현재 단계: 디자인 기반 v0.1 등록

DESIGN.md, 핵심 화면·컴포넌트 명세, 레퍼런스·결정·검토 규칙, light CSS 토큰, 비어 있는 baseline manifest, 의존성 없는 Node 토큰 검사기를 추가했습니다. README와 AGENTS에서 디자인 기준을 읽도록 연결했습니다. 프롬프트 원문과 SOURCE_MANIFEST는 변경하지 않습니다.

사용자가 정한 방향은 Apple식 정교함과 흔한 AI 템플릿 느낌 최소화입니다. 토큰 값과 화면 명세는 구현 초안이며 **승인된 화면은 0개**입니다. React UI·Rust 코어·WASM·Storybook·외부 디자인 스킬·서비스 배포는 여전히 없습니다.

검증 명령과 실제 결과는 [design/VALIDATION.md](../design/VALIDATION.md)를 봅니다. 토큰 검사 통과를 앱 실행·전체 접근성·시각 승인·CI 성공으로 해석하지 않습니다.

다음 개발에서는 DESIGN.md와 세 핵심 화면 명세를 함께 읽고, 기존 Rust/WASM 첫 연결 목표를 진행합니다. 도면·구매목록의 실제 상태를 구현한 뒤 캡처·검토하여 baseline을 등록합니다. 문서·화면 제작을 이유로 Rust 계산 연결을 가짜 UI로 대체하지 않습니다.

## 이전 기록: AI Engineering Control Plane 문서 개정 (작성 당시 PR #1 미병합)

AGENTS.md, TASKS/TEMPLATE.md, RUNBOOKS/DISPATCH.md에 Devin의 승인 범위 내
자율 실행, Astra의 결정·독립 감사 집중, 고정 mechanical 전달 매핑을 반영했습니다.
기존 저장소 규칙과 필수 review는 유지합니다. 이 기록은 운영 문서 변경이며
Rust/WASM/React 구현이나 자동화 구현 완료를 뜻하지 않습니다.

자체 확인: 프로젝트별 규칙 보존, 세 문서의 필드·역할·수동 운영 경로를 대조했습니다.
앱 테스트나 CI를 실행하지 않았습니다. 독립 감사 PASS는 아직 없습니다.
다음 단계는 새 PR HEAD의 독립 감사이며, mechanical layer 구현·감사와
User 활성화 전까지 자동 dispatch는 비활성입니다.

후속 자체 점검에서 TASKS/TEMPLATE.md의 KIX 전용 예시를 제거하고 ZARI의
정본 task/specification 정책을 참조하도록 수정했습니다. 템플릿 변경분을 대조했으며
이 수정 역시 독립 감사 PASS가 아닙니다.

## 작성자 충돌 규칙 보완

기본 Astra 감사와 User가 지정하는 대체 독립 감사자의 수락 조건을 정의하고,
지정된 감사자에게 동일한 증거 검증·결과 처리 의무가 적용되도록 정리했습니다.
지정 pointer와 인증된 auditor identity/session을 요청·결과에 연결합니다.
기존 규칙 보존과 필드·gate 연결을 작성자 관점에서 대조했습니다.
애플리케이션 테스트는 실행하지 않았으며 독립 감사 완료를 주장하지 않습니다.
다음 단계는 수정에 참여하지 않은 지정 감사자의 새 HEAD 검토입니다.

## 현재 상태: 아키텍처 제안 v1 (2026-09-21 UTC)

원격 main은 `46082a909c9210c7dbd0ee9946386dc18246108e`입니다. 이전에 알려진 `335c4ba3d0059ed99841bc8e6673477f24154c90`보다 14커밋 앞서며, PR #1은 2026-09-21 13:09:52 UTC에 병합되었습니다. 위 미병합 표기는 당시 기록입니다. 병합 커밋은 최종 HEAD 독립 감사 PASS를 주장하지 않습니다. 자동 dispatch는 여전히 비활성입니다.

`astra/zari-architecture-v1`에서 제품, 도메인/측정/unknown, 좌표와 내경 변환, 전략·Recipe·제한 탐색, solver와 독립 검증, PlanSnapshot, Worker 취소·오래된 응답·복구, 프런트 상태, 저장/CAS/마이그레이션, 디자인 시스템, 테스트·성능·보안·실패 모델과 10개 Devin 작업 계약을 작성했습니다. 전체 지도는 [ARCHITECTURE.md](ARCHITECTURE.md), 시작 프롬프트는 [DEVIN_TASK_001.md](DEVIN_TASK_001.md)입니다.

이번 변경은 Markdown 문서뿐입니다. Rust·React·WASM 구현, 의존성 설치, lockfile 생성, CI 추가, 배포, 자동화 활성화와 병합을 하지 않았습니다. 기존 토큰 CSS와 baseline manifest도 그대로입니다. 보존 프롬프트 두 개와 SOURCE_MANIFEST를 변경하지 않았습니다.

실제 검증: 원격 전체 21개 blob/기준 tree/commit 확인, 두 원문 SHA-256·바이트 수 대조, `node scripts/check-design-tokens.mjs --self-test`의 10개 self-test 및 30/30 대비 사례 통과(기존 69개 토큰), 문서 상대 경로·변경 범위·diff 공백 검사. 새 앱 명령은 명세이며 아직 실행할 앱이 없어 미실행입니다. 화면 승인·성능 달성·앱 CI 통과를 주장하지 않습니다.

작성자 검토와 별도 내부 비판 검토를 통해 계약을 보완했습니다. 이것은 AGENTS의 User 지정 독립 감사 PASS가 아닙니다. 다음 단계는 아키텍처 PR의 정확한 HEAD에 대한 독립 검토/지정 감사 및 User 결정입니다. 계약 채택 후 canonical manual dispatch로 ZARI-001을 실행하며, User만 병합합니다.

## 현재 상태: 상세 설계도와 전체 구현 위임 계약 보강 (2026-09-22 UTC)

원격 main은 재확인 시 위 SHA 그대로이며 앱은 없습니다. 기존 설계 PR#2를 보강합니다. 별도 PR#3은 multi-builder 운영 문서, #4는 그 위에 쌓인 runtime/CI 구현입니다. 검사 당시 둘 다 Draft/open이고 main에 병합되지 않았습니다. 이 작업에서는 해당 운영·runtime 파일을 수정하거나 활성화하지 않습니다.

[BLUEPRINT.md](BLUEPRINT.md)를 중심으로 [수치 기반 compiler 예제](COMPILER_WALKTHROUGH.md), [화면별 작업대 설계](../design/WORKSPACE_BLUEPRINT.md), [Task001–010 전체 위임 계약](DEVIN_PROGRAM.md), [전체 Devin 전달문](DEVIN_PROGRAM_PROMPT.md)을 추가했습니다. 기존 작업별 acceptance/gate를 유지하면서 전체 범위 승인과 task 실행·병합을 구분했습니다. 같은 승인 범위에 대해 매번 새 기능 승인을 요구하지 않지만 현행 dispatch 조건을 우회하지 않습니다.

실제 계약 보완: ProjectInput의 catalog/search pin, CandidateLayout와 offer binding, direct item 좌표 단일 소유와 정확한 ordinal 보존, group 분할/허용 retrieval, cavity/motion clearance와 외부 staging 높이·support, normalize→CAS→fresh activation, staging에서 contents를 넣은 뒤 loaded-bin 삽입하는 guide 순서. 임시 blocker parking은 미지원으로 명시했습니다. 동일 예제로 직접 배치0원, 보유2+신규1의15,000원, 신규3의27,000원과 실패 경계를 손으로 대조할 수 있게 했습니다.

저장 레코드의 무결성 검증과 catalog 숫자 정규화·완전한 snapshot 검증도 명시적인 Worker operation으로 연결했습니다. 올바른 hash가 실제 물리적 적합이나 현재 계획이라는 증거가 되지는 않습니다. PR#4는 작업 중 갱신되어 재확인한 HEAD를 REPOSITORY_AUDIT에 기록했으며, 해당 runtime의 독립 감사나 실제 host 실행을 대신 수행했다고 주장하지 않습니다.

설계 문서의 TRACE/UX 검증 항목은 구현 acceptance이며 실행된 앱 테스트가 아닙니다. 브라우저 검증·성능 달성·generated DTO·앱 CI·Devin launch·독립 감사·사용자 설계 채택·merge 완료를 주장하지 않습니다. 이번 작업의 문서/보존 파일/토큰 검증 결과와 정확한 최종 HEAD는 설계 PR의 증거를 기준으로 확인합니다.

## 설계 채택 검토 중 확인한 문서 정합성 보완 (2026-09-22 UTC)

사용자가 설계 채택·독립 검토·머지 진행을 지시한 뒤, 작성에 참여하지 않은 검토자가 기존 SCREENS의 실행 순서와 새 물리 계약의 충돌을 확인했습니다. S03을 같은 PlanSnapshot의 ActionStep 선행 조건에 연결하고, 외부 staging에서 내용물을 담은 뒤 적재된 수납함을 삽입하도록 정정했습니다. 직접 배치와 구매 없는 계획에는 해당 없는 수납함·구매 단계를 생성하지 않습니다. 이는 미지원인 구획 내부 적재를 사용자에게 안내하지 않기 위한 문서 수정입니다.

승인할 실제 화면 캡처는 여전히0개이며 baseline manifest는 변경하지 않았습니다. 디자인 방향 채택과 실제 렌더링 화면 승인은 구분합니다. 독립 검토·감사 결과와 최종 머지 여부는 변경된 정확한 HEAD에 연결된 PR 증거를 확인합니다.

## Control Plane 적용 후보 — CP-ROLLOUT-004 (2026-09-23 UTC)

정본 task: https://github.com/BeautifulMind-JT/kix-protocol/issues/40 / revision 1.
현재 관측 main은 `d3cb460c94ca6de11d00dac181c0f8d8b95314e7`이다. 기존 closed runtime
PR #4는 병합하지 않았으며, 현재 main에서 새 적용 PR을 준비했다.
KIX `f179be8fc3c0c590b3194c26663aecdfe7a4a679`의 runtime/flow/boundary 실행 소스와
회귀를 그대로 가져오고, ZARI V2 governance·repo/project mapping·비활성 설정을 연결했다.
기존 ZARI 고유 규칙·원문·SOURCE_MANIFEST·제품/디자인 파일은 보존한다.

공통 회귀 94개를 이 checkout에서 실행해 통과했다. repository validation과 소스
동일성·기존 규칙 보존 검사는 PR의 exact-HEAD 검증 기록에 남긴다. Runtime CI는
제어 구현만 검사하며 Rust/WASM/React의 제품 CI와 LOCAL_EVIDENCE_REQUIRED를 대체하지 않는다.
현재 제품 구현·화면 승인·production host/preflight·독립 A3 감사·merge·activation
완료를 주장하지 않는다. `runtime_enabled=false`; 새 source의 감사와 실제 host
근거가 생기기 전 PENDING을 PASS로 바꾸지 않는다.

같은 적용 후보의 독립 기술검토에서 dispatch 승인 identity 소실과 boundary 환경변수 우회(P1), evaluator/상위 경로 보호 검사 누락(P2)을 발견해 보완했다. 이후 공통 회귀는 99개 통과했다. 실행 소스는 이제 KIX 원본 그대로가 아니라 해당 finding 수정 delta를 포함한다. 새 HEAD의 비작성자 재감사·CI 결과는 PR 정본에 연결하며, production 검증·활성화 완료를 뜻하지 않는다.

재감사에서 같은 startup 우회의 `BASH_ENV` 변형을 확인했다. runner `.env`는 locale 키만 허용하고 파일/상위 경로 보호를 요구하도록 보완했으며, startup injection 환경을 거절한다. 공통 회귀는 100개 통과했다. 실제 host 검증은 별도이다.


<!-- CP-EXTRACT-001 -->
Shared engineering source extraction candidate; application code unchanged.
Tracking: https://github.com/BeautifulMind-JT/ai-ops-control-plane/issues/1
Source/PR preparation only. No application test PASS, independent audit, deployment or activation claimed.


## 공통 관제 정책 참조 갱신 후보 (2026-09-26 UTC)

중앙 ai-ops의 검토 대상 정책 pin과 실행 profile 참조를 연결하고,
기존 중복 관제 포인터는 단일 문서로 안내하도록 정리했습니다.
TASKS/TEMPLATE에는 CURSOR 예시와 선택적 EXECUTION_PROFILE_POINTER를 추가했습니다.
기존 ZARI 규칙·제품 코드·보존 원문·SOURCE_MANIFEST·디자인 baseline은 변경하지 않습니다.
로컬 JSON 파싱, 후보 pin, AGENTS 고유 규칙 보존과 템플릿 필드를 대조했습니다.
앱 테스트·독립 감사·운영 설치·활성화 완료를 주장하지 않습니다.
다음 단계는 중앙 후보와 이 PR의 정확한 HEAD 검토 및 정책 채택입니다.


### CP-OPT-002 소스 보완 (2026-09-26 UTC)

중앙 후보 `4ab3ff90274e493c770968174349ae9e2303d712`로 정책 참조만 갱신했습니다.
중앙 변경에는 Cursor CLI 송신 잠금·호출자 검증과 Astra 수신 claim이 포함됩니다.
ZARI 제품 코드·계약·디자인 baseline·역사적 기록은 그대로입니다.
JSON/중앙 포인터/고유 규칙 보존 검사는 통과했으며, Actions 한도 소진으로
새 HEAD의 제품 CI는 미검증입니다. 호스트 설치·Slack 연결·운영 활성화는 별도입니다.


### CP-OPT-002 main 통합 후보 (2026-09-27 UTC)

중앙 후보 `3e7c64a515e908b312604e82405b963d100caa07`로 현재 포인터를 갱신했습니다.
네 제품 deployment_enabled=true는 유지하고, 이전 SHA 감사 근거를 재사용한
중앙 activation은 새 검증 전까지 비활성/PENDING으로 바로잡았습니다.
제품 코드·계약·baseline·과거 기록은 그대로이며 새 제품 CI/운영 PASS를 주장하지 않습니다.


## 유지보수: 편집 좌표 가드·카탈로그 출처 표시·README 현행화·INV-01 조사 (2026-09-28 UTC, 작성자 Claude Code)

사용자 지시(현재 할 수 있는 작업 전부 진행, GitHub Actions 사용량은 10월 1일 복구 전까지 보류)에 따라 main `ef0edfee00c7ff79a08553b2ac92ad2324ac4b1a` 기준 브랜치 `claude/brave-einstein-kgk17h`에서 작업했습니다. ZARI-010(PR #28)의 브랜치·HEAD는 수정하지 않았습니다. PR #28이 문서 맨 위 "현재 구현" 절을 바꾸므로, 충돌을 피하려고 이 기록은 문서 끝에 둡니다.

변경:

- **편집 좌표 가드** (`features/plan/view.ts` `readMovePosition`, `app/PlanScreen.tsx` Inspector): 빈 칸이 `Number('')`=0으로 바뀌어 `movePlacement`에 0mm로 전송되던 결함을 고쳤습니다. 수정 전 코드에서 실제 Chromium으로 재현했습니다. X=75 칸을 비우고 적용하면 `{x:0,y:145,z:0}`이 전송되었고, Rust 거절이 물리 실패처럼 표시되었습니다. 이제 빈 값·브라우저가 읽지 못한 값은 `position_missing`, 정수 리터럴이 아닌 값(`1e3`·`12.0`·`12.5`)은 `position_not_integer_mm`로 처리합니다. 이 경우 요청을 만들지 않고, `aria-invalid`·`aria-describedby`로 연결된 한국어 오류를 보여주며, 첫 오류 칸으로 초점을 옮깁니다. 이 gate는 거절만 하고 값을 만들지 않습니다. 범위와 물리 판정은 계속 생성 validator와 Rust가 합니다. Wire 계약(`Vec3Mm` 정수)은 바꾸지 않았습니다.
- **클릭과 Enter 경로 일치**: 기존에는 버튼 클릭만 브라우저 자체 검증(step·min·max 영어 풍선)을 거치고 Enter는 건너뛰었습니다. 폼에 `noValidate`를 붙여 두 경로가 같은 gate를 지나게 했습니다. ±20000mm 밖의 정수는 생성 요청 validator가 Worker 전송 전에 거절하고, 기존 편집 거절 설명(`invalid_request_shape`)으로 표시합니다.
- **inspector 오류 id 고유화**: 검증된 편집안이 생기면 inspector가 두 개 표시되므로 오류 id를 `useId`로 인스턴스별로 만듭니다.
- **카탈로그 출처 표시** (`features/project/session.ts` `installContext`, `features/plan/view.ts` `catalogSourceText`): 새 프로젝트에서 첫 입력을 커밋하면 context는 pin된 카탈로그로 활성화되지만, 화면 쪽 `plan.catalog`는 새로고침 전까지 null로 남았습니다. 그 결과 **합성 데모 카탈로그가 "(가져온 카탈로그 — 입력된 출처 기준)"으로 표시**되고 수납함 옵션 목록이 비었습니다. 실제 Chromium에서 재현했습니다(새로고침 전 옵션 0개·"가져온 카탈로그", 새로고침 후 옵션 2개·"합성 데이터"). 이제 context 설치 때마다 같은 카탈로그를 plan 상태에 넣습니다. 출처 문구는 로드된 카탈로그 digest가 스냅샷의 `catalogDigest`와 같을 때만 표시하고, 다르거나 없으면 "출처 확인 불가"로 둡니다.
- **README** "현재 구현 범위"를 Task 001 기준에서 main의 Task 001–009 상태와 Task 010 검토 중 상태로 갱신했습니다. 저장·계획·편집·카탈로그·복구 흐름, 합성 데이터 표시, 범위 밖 기능, 승인 화면 0개를 적었습니다.
- **INV-01 조사 보고서** [INV01_MESSAGING_RESIDUAL.md](INV01_MESSAGING_RESIDUAL.md): PR #28 HEAD `a824f2d`를 read-only로 재현·분해했습니다.
  - 벤치의 messagingResidual 초과(이 환경 56.9ms / 목표 10ms)는 오래 걸리는 Rust 명령(activateProject·startSearch)을 Worker와 페이지에서 따로 실행한 **계산 시간 편차**였습니다.
  - 같은 실행 안에서 분리한 실제 전송은 908KB 요청 기준 p95 1.9ms 이하였고, echo worker 왕복은 최대 3.6ms였습니다.
  - normalization p95는 이 환경에서 14.0ms로 목표 안이었습니다.
  - 새 아키텍처는 필요 없고, 측정 정의 수정이 최소 다음 범위라고 제안했습니다(추론이며 결정은 ASTRA·사용자).
- **GitHub 이슈 정리**: 병합 완료 댓글이 있는데 열려 있던 task 이슈 #5·#9·#11·#13·#18·#21·#23을 completed로 닫았습니다(#15·#25와 같은 처리). 이슈 #27(ZARI-010)은 열린 채로 둡니다.

실제로 실행한 검증(이 checkout의 로컬 실행입니다. GitHub Actions는 사용량 한도로 실행되지 않아 CI 근거가 없습니다):

- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`: 통과. `cargo test --workspace --locked`: 75개 통과.
- `cargo run -p zari-core --locked --example fixture_runner -- fixtures`: 통과. `cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked`: 성공.
- `npm run wasm:build`, `npm run contracts:check`(95 fixture 구조 유효), `npm run typecheck`, `npm run lint`, `npm run build`: 통과.
- `npm test`(vitest): 62개 통과. 새 `planView.test.ts` 7개(좌표 gate 5, 카탈로그 출처 2)를 포함합니다.
- `npm run test:browser -- --project=chromium`: 27개 통과. `edit.spec.ts`에 새 테스트를 추가했습니다. 빈 칸·`12.5`·범위 밖 값에서 Worker로 가는 `evaluateLayoutEdit` 요청 0건, 오류 연결·초점을 확인하고, 원래 값으로 요청 1건·편집안 생성을 확인합니다. 기존 `edit`·`plan` 테스트에는 새로고침 없이 옵션 표시와 "합성 데이터" 표시를 단언했습니다.
- `npm run test:parity`: 95 fixture native↔실제 Chromium Worker/WASM 일치.
- `node scripts/check-design-tokens.mjs --self-test`: 33/33 통과. 새 색 조합·토큰은 없고, 기존 `diagnostic-list`·`field-error`만 사용합니다.
- 실제 화면 확인: 오류 상태 inspector를 1440px·390px에서 캡처해 확인했습니다. 가로 넘침은 없었습니다. 캡처는 세션 로컬 파일이며 baseline으로 등록하지 않았습니다.
- 환경: Node 24.19.0, npm 11.17.0, Rust 1.98.1, wasm-bindgen 0.2.128, Playwright 1.63.0. Chromium은 환경에 설치된 141.0.7390.37을 `ZARI_CHROMIUM_EXECUTABLE`로 지정했습니다.

미실행·한계:

- GitHub Actions CI: 사용량 한도로 ZARI-009 병합 이후 main·PR #28·이 변경 모두 미실행입니다. 사용자 확인 기준 10월 1일 이후 재실행이 필요합니다.
- Firefox·WebKit·실제 모바일 기기는 실행하지 않았습니다.
- 편집 좌표 입력은 여전히 `type="number"` 입력입니다. COMPONENTS.md의 "원문 문자열 + Rust 정규화" 원칙과 완전히 같지 않습니다. 좌표용 Rust 텍스트 정규화 명령이 없어 wire 계약을 바꾸지 않는 host 구문 gate로 한정했습니다. 정식 해결은 계약 변경 task입니다.
- GROK·GLM 감사의 `PASS_WITH_NOTES` 내용은 이 세션에서 접근할 수 없는 로컬 경로(`/workspace/zari-ops`)에만 있습니다. 이슈나 PR로 옮기는 것은 해당 파일을 가진 운영자의 작업입니다.
- 화면 baseline 승인은 0개 그대로이며, Task 005 이후 화면의 draft 캡처는 없습니다.

작성자는 자신의 변경에 PASS를 부여하지 않습니다. 다음 작업:

1. 10월 1일 이후 Actions를 복구하고 main·PR #28·이 PR의 CI를 재실행합니다.
2. PR #28 검토 때 INV-01 결과를 반영해 messagingResidual 측정 정의를 고칠지와 성능 기준 host를 정합니다(ASTRA·사용자).
3. 독립 read-only review를 거쳐 사용자가 병합 여부를 결정합니다.


## 병합 기록: PR #28(ZARI-010)·PR #30 (2026-09-28 UTC)

사용자가 "10월 1일까지는 CI 없이 바로 병합"하도록 지시해, 두 PR을 GitHub Actions CI와 독립 감사(GROK→GLM) 없이 병합했습니다. AGENTS.md가 요구하는 비작성자 exact-HEAD 감사는 두 PR 모두 거치지 않았습니다.

- PR #28 HEAD `94a6b2c` → main 병합 커밋 `7540811`
- PR #30 HEAD `135e12a` → main 병합 커밋 `efef8a1`
- 병합 전 로컬 검증: main `ef0edfe`에 두 PR을 합친 트리를 따로 만들어 확인했습니다. `contracts:check`(102 fixture), `typecheck`, `lint`, `vitest` 62개, `test:browser --project=chromium` 39개, `test:parity` 102 fixture, 토큰 검사 33/33이 모두 통과했습니다. Rust는 PR #28 HEAD에서 75개 테스트·fixture 102개를 확인했고, PR #30에는 Rust 변경이 없습니다.

다음 작업:

1. 10월 1일 이후 Actions가 복구되면 main의 CI를 재실행합니다.
2. 필요하면 병합된 main을 대상으로 GROK→GLM 감사를 사후에 진행합니다. 감사 기록 이관은 이슈 #31에서 추적합니다.
3. Firefox·WebKit에서 `zari-bench-2` 벤치를 재측정하고, 성능 기준 host를 정합니다.

## 공간 작업대 확장 설계 후보 (2026-09-30 KST)

사용자 요청에 따라 측정·선택·검사 레이어, 평면 드래그, 읽기 전용 구획 절개 3D, 2D/3D/BOM/검사 선택 연동, 실행 단계 시각화의 상세 설계와 AIOPS 일곱 작업 계획을 문서로 작성했습니다. 기준 main은 `7269c142d2e2c3becc43088d64e516389228527e`입니다.

- 시작 문서: [SPATIAL_INTERACTION_PLAN.md](SPATIAL_INTERACTION_PLAN.md); DTO/좌표: [SPATIAL_VIEW_CONTRACT.md](SPATIAL_VIEW_CONTRACT.md); 화면: [SPATIAL_WORKSPACE.md](../design/SPATIAL_WORKSPACE.md).
- AIOPS 작업/인계: [AIOPS_SPATIAL_EXECUTION_PLAN.md](AIOPS_SPATIAL_EXECUTION_PLAN.md), [AIOPS_SPATIAL_HANDOFF.md](AIOPS_SPATIAL_HANDOFF.md), 비활성 [program draft](aiops/ZARI_SPATIAL_PROGRAM_DRAFT.json).
- 실제 변경은 문서뿐입니다. 구현·dependency 설치·lockfile 생성·앱 실행·capture·독립 감사·AIOPS dispatch·런타임/클라이언트 설정·merge·배포는 수행하지 않았습니다. 기존 구현 완료/테스트 기록/approved baseline 0을 바꾸지 않습니다.
- 문서의 JSON 구조·일곱 node DAG·참조 링크·문서만 변경한 범위는 작성자 self-check 대상입니다. 결과와 미검증 사항은 [SPATIAL_DESIGN_REVIEW.md](SPATIAL_DESIGN_REVIEW.md)에 기록하며, 이를 native/WASM/브라우저/CI 또는 Fable PASS라고 부르지 않습니다.
- 다음: exact-HEAD Fable 설계 채택 → 승인된 program 별도 등록/pin → SP-001 공통 Rust 공간 투영부터 구현. 사용자 화면 승인/출시는 별도입니다.


## 제품 완성 고도화 설계 후보 — 2026-10-01 KST

조사 기준은 ZARI #37 HEAD `f328251d06b891b27fefa1180b6b767c6aacfd92`다. 실제 `finalize.rs::build_actions`의 Install→TransferContents 순서/빈 condition refs, solver full-candidate RunEval의 indivisible allowance 예외를 source review로 확인했다. 앱·성능·실물을 실행한 재현 결과라는 주장은 아니다.

[PRODUCT_COMPLETION_EVOLUTION_KO.md](PRODUCT_COMPLETION_EVOLUTION_KO.md)에 새 A3 ADR, physical guide/condition guard, bounded independent evaluator, 저장·자료·역사·Worker lifecycle, 전체 qualification/capture 인계를 명세했다. 기존 program001–011은 그대로 보존하고012–016을 append해 분모16으로 연결했다. 전체 pending sidecar를 같은 바이트로 작성했고 승인 포인터는 PENDING이다. 최초7-node sidecar는 역사 checkpoint로 보존한다.

실제 변경은 문서/비활성 계획뿐이다. 원본 MASTER/RUST/SOURCE_MANIFEST·앱·schema·dependency·approved baseline·runtime/client pin·activation·host·계정·모델 감사·배포를 변경하지 않았다. 작성 단계 검증은 JSON 구조·중복·DAG·분모·001–011 보존·mirror 일치·참조/범위 검사다. 앱/native/WASM/browser/parity/성능·독립 Fable 감사·User 채택·새 화면 승인은 이번 작업에서 미실행이다. 후속 구현에서 기존 record와 progress를 새 의미로 덮어쓰지 않으며, 별도 architecture/rule adoption과 실제 qualification 근거를 요구한다.
