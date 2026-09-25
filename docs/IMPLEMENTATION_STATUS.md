# ZARI 구현 상태

## 현재 구현: ZARI-006 검증된 계획 수직 슬라이스 (작성자 DEVIN local CLI)

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
