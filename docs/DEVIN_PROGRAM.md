# ZARI — 전체 구현 위임 계약

상태: 2026-09-22 설계 제안. Task001–010의 제품 구현을 끝까지 위임하기 위한 계약이며, 실행·자동화 활성화·감사 PASS·병합 명령이 아니다. 작업별 상세 계약은 [DEVIN_EXECUTION_PLAN.md](DEVIN_EXECUTION_PLAN.md), 시작 프롬프트는 [DEVIN_PROGRAM_PROMPT.md](DEVIN_PROGRAM_PROMPT.md)에 있다.

## 1. 위임하는 결과

Devin에게 다음 제품 결과의 완성을 맡긴다: 사용자가 단일 직사각형 수납 공간과 물건·보유 용품을 입력하고, 정리 전략을 선택하고, Rust가 계산하고 독립 검증한 계획을 같은 scale의 도면·BOM·실행 순서로 확인하며, 편집·저장·재접속·export/import까지 수행한다. Task010에서는 지원 범위와 실패 상태를 실제 브라우저·성능·복구 증거로 설명할 수 있어야 한다.

‘전체’는 현재 Task001–010과 그 acceptance를 뜻한다. 방 전체 3D, cloud, 계정, AI, scraper, checkout, GPU와 자동 배포는 포함하지 않는다. 완성은 각 작업을 코드로 채웠다는 선언이 아니라 관련 acceptance 증거와 필수 review/gate를 충족한 상태다. Beta 준비와 실제 배포·출시는 다르다.

## 2. 세 권한을 구분한다

| 권한 | 범위 | 이 설계가 대신할 수 없는 것 |
|---|---|---|
| 프로그램 범위 승인 | 고정된 문서 revision의001–010 전체를 위임 | 새로운 범위·외부 비용·개인정보 전송 승인 |
| 작업 실행 권한 | 현재 eligible task의 canonical envelope, owner, base, control record | launch claim, 선행 gate, 중복 실행 방지 |
| 병합 권한 | 사용자의 해당 PR/HEAD 병합 결정 | 작성자 완료 선언, CI green, 프로그램 승인 |

사용자가 프로그램을 승인하면 각 task의 scope authorization은 같은 durable pointer를 참조할 수 있다. 단, 해당 pointer가 그 task/spec revision을 실제 포함해야 한다. 매번 ‘다음 기능도 만들까?’라는 새 범위 승인을 요구하지 않는다. **Task envelope, 정확한 HEAD 검토, 선행 gate와 사용자 병합은 계속 필요하다.** 프로그램 자체를 하나의 거대 작업/PR/전역 writer claim으로 바꾸지 않는다.

프로그램 승인 정보는 canonical GitHub 프로그램 issue 본문에 기록하고 작업이 그 specification/authorization pointer를 참조한다. 현행 TASKS/TEMPLATE에 없는 필드를 runtime JSON에 임의로 추가하지 않는다. 문서 링크와 관리용 프로그램 index는 기계적 authorization schema를 대체하지 않는다. 아직 사용자가 채택하지 않은 이 문서를 APPROVED로 기록하지 않는다.

## 3. 현재 운영 계약과 병행 PR

2026-09-22 확인 기준 main=`46082a909c9210c7dbd0ee9946386dc18246108e`, 설계 PR#2 원래 HEAD=`0c6bbb2a18b32d8690bcf36d0caf08a7a8d4aae3`다. PR#3 HEAD=`9d0f095f414daecd0f2b4d7afb3cd6f0052bcf6e`는 builder-neutral 운영 문서, PR#4의 재확인 HEAD=`63b640558662684f0013b2a7575ef849ae7679f5`는 #3 위에 쌓인 runtime 구현이며 둘 다 검사 당시 Draft/open이었다. #4는 이 설계 작업 중3fab9e2에서 갱신되었고 runtime_enabled=false, 감사·host gate 대기를 명시했다. main에 앱이나 CI가 생긴 것으로 해석하지 않는다. PR#4의 활성화 승인 표기만으로 runtime이 활성화되었다고 추정하지 않는다.

실행 시 다시 현재 main/AGENTS/runbook/runtime 상태를 확인한다. 승인된 실제 운영 계약이 우선한다. 이 프로그램은 #3/#4를 병합하거나 그 코드를 수정하지 않는다.

| 실제 상태 | 실행 방식 |
|---|---|
| 현재 main의 MANUAL_ONLY | User가 runbook의 serialized manual launch/control 절차 수행. 기존 전체 범위 승인 참조 가능하지만 자동 다음 task launch는 없음 |
| #3만 병합 | 변경된 builder/reviewer 규칙 적용. 이것만으로 자동 launch 가능하지 않음 |
| runtime이 정확한 SHA의 감사·preflight·활성화까지 충족 | 구현된 adapter/명령만 사용. 프로그램 DAG 자동 전개 기능은 따로 입증되지 않으면 존재하지 않는 것으로 취급 |
| 활성화/owner/launch 상태 불명 | 해당 launch 보류, 기존 작업·결과 보존. UNKNOWN을 새 task ID로 우회하지 않음 |

Grok은 승인된 명령과 정확한 증거 pointer를 전달한다. transcript 감시, polling, 의미적 진척 판정, builder 선택, CI debugging을 맡기지 않는다. 이전 대화의 ‘그록이 진행을 계속 모니터링’이라는 표현은 운영 계약으로 사용하지 않는다.

## 4. 실행 순서와 작성 소유권

기본은 **직렬 실행**이다. 초기에 여러 paid session을 동시에 켜는 이점보다 공유 schema/lockfile/상태 문서 충돌 비용이 크다.

| 작업 | 결과 | 기본 작성 lane | 다음 작업의 조건 |
|---|---|---|---|
| 001 | 실제 Rust/WASM/Worker/browser bridge | Devin 주 작성자 | Bridge gate·독립 검토·사용자 merge |
| 002 | 도메인/DTO/canonical identity | 주 작성자 유지 가능 | Domain gate·독립 검토·사용자 merge |
| 003 | 독립 validator/BOM/finalizer | **004 solver 작성자와 다른 Devin 작성 세션** | 악성 proposal 검증·gate·사용자 merge |
| 004 | 전략/recipe/resumable solver | 주 작성자 | Validator API 사용·결정성·독립 검토·사용자 merge |
| 005 | 측정/Worker host/Dexie draft | 주 작성자 | 저장/reload/CAS/lifecycle 증거·gate·merge |
| 006 | 처음 완성되는 compiler 수직 기능 | 주 작성자 | 실제 stepped WASM·snapshot·save/reload gate·merge |
| 007 | 배치 편집/대안/undo | 주 작성자 | 실제 이동·invalid·stale·키보드 UX gate·merge |
| 008 | 실제 catalog/owned/purchase/action | 주 작성자 | 필드 증거·pack/offer/가격·독립 검토·관련 gate·merge |
| 009 | recovery/export/import/photo/offline | 주 작성자 | 손상/다중탭/개인정보·offline gate·merge |
| 010 | 성능/접근성/cross-browser beta 증거 | 주 작성자 | Beta/release-readiness gate·사용자 결정 |

003/005의 선택적 병렬성은 기존 task graph에 한정한다. scope가 고정되고 공유 파일 writer가 겹치지 않을 때만 별도 명시한다. 기본 프로그램 실행은001→002→003→004→005→006→007→008→009→010이다. 전부 Devin에게 맡긴다는 말은 같은 세션 하나가 validator와 solver 모두를 작성하거나 자신의 결과를 독립 감사한다는 뜻이 아니다.

Task별 PR을 유지하고 승인된 main에서 다음 branch를 만든다. 미검토 선행 branch 위에 후속 제품 코드를 쌓는 speculative stacked PR은 기본 정책에 없다. CI 통과만으로 의존 task를 받아들이지 않는다. 병합 대기 중에는 현재 PR의 수정·증거 정리를 하며 필수 gate를 넘는 후속 구현을 시작하지 않는다. 이 대기는 새 범위 승인을 받기 위한 것이 아니라 이미 정한 integration/review 조건 때문이다.

## 5. 중간 감수의 실제 단위

사용자가 매 helper나 화면마다 개입할 필요는 없다. ASTRA에 제출하는 packet은 작고 확인 가능해야 한다. 다음 checkpoint는 의사소통을 묶는 단위이며 기존 작업별 review/audit를 삭제하거나 낮추지 않는다.

| Packet | 검사 대상 | 반드시 확인할 반례 |
|---|---|---|
| G1 /001 | 실제 boundary·toolchain·generated DTO | JS 계산 복제, mocked WASM, width pass를 전체 적합으로 표시 |
| G2 /002 | 사실·unknown·input/context identity | zero/unknown 혼합, lossy u64, 현재 project catalogPin 변경 후 inputRevision/context 미갱신 |
| G3 /003–006 | validator·solver·저장 통합 | 내경 실패·삽입 실패·취소 독점·도면/BOM snapshot 혼합 |
| G4 /007–009 | 실제 사용자 조작·catalog·복구 | invalid move 수락, 변경 catalog를 적용한 새 계획에 옛 가격 혼합, 저장실패인데 saved 표시 |
| G5 /010 | beta 범위·측정·회귀 | 합성 상품을 실제상품으로 표시, 미검증 브라우저 PASS, draft 화면을 approved로 승격 |

운영 규칙이 A1/A2 routine reviewer와 ASTRA milestone gate를 분리하도록 바뀌면 해당 승인 규칙을 적용한다. 기존 task에 명시된 A3 또는 다른 필수 gate는 이 표 때문에 사라지지 않는다. 작성자와 구분된 reviewer가 실제 diff/테스트를 확인하며 ASTRA는 필요한 architecture 경계를 검증한다. ASTRA 작성 설계의 감사자는 사용자가 지정한다.

## 6. 각 task 안에서는 끝까지 책임진다

Inspect → 짧은 local plan → implement → test → run → 실제 browser → debug/fix → full diff self-review → status/evidence → commit/PR. 평범한 helper 선택, 모듈 내부 배치, 테스트 실패는 승인 요청 사유가 아니다. CI/review 지적은 정확한 pointer와 함께 원래 author에게 전달한다. 재시도 횟수만으로 실패를 판정하거나 두 번 실패 후 새 writer를 만들지 않는다.

작업 완료는 acceptance마다 실행한 증거가 있고 요구 검사가 통과했을 때만 보고한다. 부분 구현은 부분 구현으로 표시한다. 다른 task의 미구현 기능을 placeholder 성공으로 돌려 검사 수를 맞추지 않는다.

진행 보고는 세 가지가 충분하다: (1) review-ready PR와 증거 index, (2) 실제 consequential blocker와 최소 재현, (3) 명시적 budget/quota/STALLED. 사용량은 관측값으로만 보고하고 ASTRA/Grok 토큰 절감 성과를 추정으로 선언하지 않는다.

## 7. 세션 지속과 인계

관련 구현·테스트 실패·review 수정은 같은 author 세션에서 이어간다. 세션 제한이나 명시적 stalled 때문에 인계할 때만 다음 packet을 canonical issue/PR에 남긴다. 세션 이름 변경만으로 독립성을 얻지 않는다.

```text
Program specification revision / authorization pointer
Task ID / task revision / canonical issue
Owner identity / provider session / launch receipt
Authorized base SHA / branch / exact current HEAD
Implemented acceptance IDs / exact evidence links
Unfinished acceptance IDs / reproducible current failure
Relevant contracts and file map (changed surfaces only)
Known architecture deviations or none
Required next command or next bounded outcome
Current review/gate/merge state, with exact-HEAD pointers
Measured provider consumption / remaining configured budget / unavailable metrics
Old writer stopped/relinquished evidence before reassignment
```

인계는 transcript 덤프가 아니다. 새 author는 HEAD·working tree·owner와 해당 계약을 검사한 뒤 실제 테스트를 재개한다. Git 밖 미커밋 변경이 있으면 검토 가능한 patch/commit으로 보존하고 관련 writer를 멈춘 뒤 인계한다. 토큰 한도에 가까워졌다는 이유로 승인되지 않은 provider를 자동 선택하지 않는다.

## 8. 범위 밖 문제와 종료 조건

다음에만 영향을 받는 scope를 멈춘다: frozen contract 모순/누락, 기존 invariant를 바꿔야 하는 증거, unapproved external/paid/privacy 변화, 필요한 secret, destructive migration, 실제 browser verification 불가능, owner/launch 불명, 설정된 비용 한도·quota 소진. 수정 재현·근거 파일·최소 제안을 보고한다. unrelated 안전한 작업을 계속할 수 있다면 그 범위만 유지한다.

비용 한도는 사용자가 정한 provider/account/task 설정을 참조한다. 기존 유효한 사용 승인에 대해 task마다 새 숫자 한도를 승인받는 절차를 만들지 않는다. 추가 요금·한도 증액이 필요하면 해당 유료 실행을 멈추고 실제 조건을 보고한다. 재시도·인계로 누적 사용량을 초기화하지 않으며, 관측할 수 없는 소비량은 unknown으로 표시한다. review 대기 중 불필요하게 유료 계산을 실행하지 않는다. 이 문서가 unlimited usage나 임의 지출 한도를 승인하지 않는다. provider의 실제 지원 여부를 확인하지 않은 budget enforcement/deadline/자동재개를 보장하지 않는다.

프로그램 종료 packet: Task001–010 acceptance matrix, merged/final PR SHA 목록, 실제 브라우저 흐름, native/WASM parity fixture 결과, benchmark 환경과 수치, unresolved 제한, export/recovery 증거, 승인 baseline 상태, 출시 전 사용자 결정. ‘모두 완료’는 지정한 범위에 한정하며 release/deploy는 별도다.

## 9. 이 방식이 Devin의 자율성을 쓰는 이유

조사와 구현·검증·수정을 하나의 결과 책임으로 묶되 실패가 증폭되는 계약 경계에는 checkpoint를 둔다. 컴포넌트·Rust 함수별 microtask로 나누지 않는다. ASTRA는 task가 시작될 때마다 동일 문서를 재분석하지 않고 contract exception과 gate-ready packet을 본다. Grok에게 의미 분석을 반복시키지 않는다.

Cognition의 공식 지침도 명확한 context/완료 기준, 검증 가능한 checkpoint, 실제 desktop/browser self-test를 요구한다. 거대한 무중단 세션의 성공을 보장하지 않는다. ZARI는 이 원칙에 single-writer와 User merge 계약을 더한다. [공식 지시 지침](https://docs.devin.ai/essential-guidelines/instructing-devin-effectively), [실제 테스트·녹화 지침](https://docs.devin.ai/work-with-devin/testing-and-recordings). 공식 문서의 선택적 Auto-Fix 제안은 ZARI의 read-only reviewer 정책을 변경하지 않는다.
