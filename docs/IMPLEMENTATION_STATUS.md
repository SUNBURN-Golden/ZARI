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
