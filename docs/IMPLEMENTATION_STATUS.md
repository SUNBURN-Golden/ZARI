# ZARI 구현 상태

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
