# ZARI 로컬 설치·업데이트·사용 안내 (z-local-delivery)

이 문서는 완성한 로컬 제품을 재현 가능한 설치·검수 단위로 인계한다. 출시·배포
승인이 아니며 `release`는 `NOT_AUTHORIZED`다. 정본은 GitHub issue #118과
plan commit `0847d1b065627938acfad3a941de79e357570e43`다. release candidate
묶음은 [release-candidate/](release-candidate/index.md)다.

## 1. 지원 브라우저와 기기

| 대상 | 상태 | 근거 |
|---|---|---|
| Chromium(데스크톱, 이 검증 호스트) | 검증됨 | 설치·저장·복원·v1→v6 업그레이드·신형 DB 거절·차단된 업그레이드·오프라인 재방문이 실제 브라우저 스펙으로 통과 (`apps/web/tests/browser/local-delivery.spec.ts`, `privacy-offline.spec.ts`) |
| Firefox(데스크톱, 이 호스트) | 부분 검증 | 전체 여정 스펙이 통과(`product-journey.spec.ts` 3/3). 이 노드의 저장·업그레이드 스펙은 별도로 실행한다(결과는 evidence에) |
| WebKit | 미검증 | 이 호스트에 브라우저 의존성이 없어 실행 불가. 미검증으로 남긴다 |
| 390 CSS px·forced-colors·키보드 | 에뮬레이션 검증 | 데스크톱 에뮬레이션이지 실제 기기가 아니다 |
| 실제 전화·전용 GPU | UNQUALIFIED | 실행한 적 없다. headless WebGL은 소프트웨어 GL이다 |

저장은 이 기기 브라우저의 IndexedDB다. 계정·클라우드 동기화는 없다. 브라우저
저장소는 백업이 아니므로 중요한 프로젝트는 JSON/zip 내보내기로 보관한다.

## 2. 설치(빌드)

필요 도구는 `manifest.json`과 같은 pin이다: Node 24.19.0, npm 11.9.0,
Rust 1.98.1, wasm-bindgen CLI 0.2.128. `.nvmrc`·`rust-toolchain.toml`·
`Cargo.lock`·`package-lock.json`이 고정한다.

```bash
rustup toolchain install 1.98.1 --profile minimal --component rustfmt --component clippy --target wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
npm ci
npm run wasm:build   # crates/wasm/pkg 생성 (Git 미추적)
npm run build        # apps/web/dist + zari-build.json
npm run preview      # 정적 미리보기 http://127.0.0.1:4173
```

개발 서버는 `npm run dev`다. dev 서버는 service worker를 등록하지 않는다
(버전 없는 자산이므로). `npm run build` 산출물은 `zari-build.json`에 모든
자산 경로와 content digest(`buildId`)를 기록한다. 배포는 이 노드 범위 밖이다.

## 3. 업데이트 경로

두 겹이 따로 움직이고, 둘 다 실패 시 데이터를 지우지 않는다.

### 3.1 앱 껍데기(service worker)

`apps/web/public/sw.js`는 fetch한 `zari-build.json`의 자산을 빌드별 캐시에
무대로 올리고(staged), **탐색 경계에서만** 완전한 빌드를 활성으로 승격한다.
진행 중인 저장·탐색은 시작한 빌드에서 끝난다. 이전 완전 빌드는 복구용으로
남고, 불완전 무대는 이전 빌드를 대체하지 않는다. `builtAt`이 오래된
manifest는 스테이징하지 않는다(다운그레드 방지). 프로젝트 데이터·사진은
캐시에 넣지 않는다.

### 3.2 저장 형식(IndexedDB migration)

`DB_VERSION`은 6이다. Dexie `version(n).stores().upgrade()`로 순서 있는
구조 변경만 하고, 각 업그레이드는 `metadata`에 `migration:n->n+1` 일지만
쓴다. 스냅샷·입력·보유 라이브러리 바이트는 읽거나 다시 쓰지 않는다.

| 버전 | 추가 저장소 | 도입 |
|---|---|---|
| 1 | projects, inputs, drafts, snapshots, ownedContainers, catalogs, actionProgress, metadata | Task 005 |
| 2 | attachments | Task 009 |
| 3 | inventoryLedgers | z-inventory-lifecycle |
| 4 | purchaseHandoffs | z-purchase-handoff |
| 5 | locationLogs | z-location-search |
| 6 | feedbackLogs | z-feedback-reorganize |

- 처음 설치는 현재 버전의 스키마를 그대로 만들고 migration 일지는 없다.
  `#/data`의 호환 보고는 "업그레이드 기록: 없음"으로 보인다.
- 기존 데이터는 제자리에서 업그레이드된다. 실제 브라우저 검증으로 v1→v6
  업그레이드가 모든 행·채택 snapshot을 보존하고 일지 `1→2, 2→3, 3→4, 4→5,
  5→6`을 남기는 것을 확인했다(§5).
- 다른 탭이 더 새로운 형식으로 열면 이 탭의 연결은 스스로 닫고 새로고침
  안내를 보인다(`db-version-notice`). 연결을 놓지 않는 탭이 있으면
  업그레이드는 차단되고 아무것도 쓰거나 지우지 않는다.
- 저장소가 이 빌드보다 새 버전이면 IndexedDB가 여는 것을 거절하고 앱은
  `migration_blocked`으로 보고한다. `#/data`는 `newer_database`와
  "열지 않았고 아무것도 바꾸지 않았습니다"를 보인다.
- 더 새로운 `schemaVersion`의 행은 쓰기를 거절하고 바이트를 보존한다.
  손상 행은 고치지 않고 격리한다. 이 변경 주기에 파괴적 migration은 없다.

## 4. 실패 경로(저장)

| 실패 | 보존 | 사용자 안내 |
|---|---|---|
| `migration_blocked` | 구 데이터베이스 그대로 | "이 앱보다 새로운 저장 형식… 새로고침" |
| `unsupported_schema` | 원본 바이트 읽기 전용 | "더 새로운 형식의 기록이라 쓰지 않았습니다" |
| `record_corrupt` | 무관한 정상 행 + 격리 | 복구 보기·원시 내보내기 |
| `persistence_failed:quota` | 더티 초안 + 마지막 커밋 | 내보내기·공간 확보·재시도 |
| `revision_conflict` | 최신 내구 상태 + 로컬 초안 | 최신 열기·사본 저장·JSON 내보내기 |
| 업그레이드 차단 | 요청이 적용되지 않고 보류 | 다른 탭을 닫고 다시 시도 |

## 5. 기존 데이터 업그레이드 결과

`local-delivery.spec.ts`의 실제 브라우저 시나리오 결과(실행 기록은
`docs/evidence/ZARI-z-local-delivery.md`):

| 시나리오 | 결과 |
|---|---|
| 처음 설치 | 생성→저장→재로드 복원; 호환 `ok`; 일지 `없음`; 오류 없음 |
| v1→v6 업그레이드(실제 행: 프로젝트·초안·정규 입력·카탈로그·채택 snapshot) | 모든 행 보존, 일지 `1→2, 2→3, 3→4, 4→5, 5→6` 기록, 채택 계획·snapshot id 그대로 열림 |
| 더 새로운 DB(v7) | `migration_blocked` 거절, `newer_database` 보고, 모든 행 보존 — **삭제 없음** |
| 차단된 업그레이드 | 연결을 놓지 않는 동안 아무것도 적용되지 않고, 차단 해제 뒤에만 적용 — **삭제 없음** |

완료 판정 1("업데이트 실패로 데이터가 지워지지 않는다")은 위 세·네 번째
행으로 확인한다. 단위 수준에서는 `repository.test.ts`/`transfer.test.ts`의
v1·v2 출발 migration 케이스와 `localDelivery.test.ts`가 같은 보존을
fake-indexeddb로 확인한다.

## 6. 검수 명령

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap
cargo run -p zari-core --locked --example fixture_runner -- fixtures
cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked
npm run wasm:build && npm run contracts:check
npm run typecheck && npm run lint && npm test && npm run build
node scripts/check-release-manifest.mjs
node scripts/check-design-tokens.mjs --self-test
node scripts/check-release-candidate.mjs          # manifest ↔ repo pin
node scripts/check-release-candidate.mjs --dist   # manifest ↔ 방금 빌드한 dist
node scripts/check-z-denominator.mjs
npm run test:browser -- --project=chromium
npm run test:parity
```

각 명령이 증명하는 것: Rust·계약 고정(fmt/clippy/test/fixture/contracts),
생성 산출 drift(contracts:check), 타입·린트·단위(typecheck/lint/test),
배포 단위(build·release-manifest), 디자인 토큰 대비(design-tokens), 인계
기록 정합(release-candidate·z-denominator), 실제 브라우저 흐름(test:browser),
native↔WASM 동치(parity). 실행 결과와 횟수는 evidence에 기록한다.

## 7. 실제 출시 범위와 장기 미구현

추적 분모는 16단계(`docs/qualification/denominator.json`)와 z-노드 확장 21
(`docs/qualification/z-denominator.json`)다. 이 노드에서 z-local-delivery는
`IN_PROGRESS`, 독립 검토는 `BLOCKED`로 남는다. 머지는 제품 적합성·기기
자격·수용·출시를 증명하지 않는다.

이 빌드가 실제로 하는 것: 직사각형 한 칸의 측정→전략→Rust 탐색·검증→도면·
BOM·실행 가이드→실행 기록→위치 검색→피드백 재정리→출력·이식·삭제·오프라인
재방문. 합성 카탈로그는 합성이다. `zari-domain-7`·`schemaVersion` 1·
`DB_VERSION` 6·`exportVersion` 1·fixture 124가 이번 인계의 고정점이다.

장기 미구현(이 빌드 범위 밖, MASTER_PROMPT §4·§24): 뚜껑·서랍 개폐 궤적,
선반 적층, 일반 서랍 내부, 여러 칸·문 경첩·배관, AI 사진 분석, 방 전체 3D,
클라우드 동기화, 판매처 연동·주문·자동 결제, 실제 사이트 수집 실행, 자체 제품
카탈로그·물류·마켓플레이스, 전역 최적해 보장, 검증되지 않은 안전 보증.

별도 근거가 있어야만 표시할 수 있는 것: 공개 배포·화면 승인(exact-set 캡처
결정)·실제 출시·실기기 자격·실상품 검증. 지금 표시는 각각
`PENDING`/`UNQUALIFIED`/`NOT_AUTHORIZED`다.
