# SP-013 — 실행 가이드 DAG와 unknown 조건·진행 guard

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 SP-013만 다룬다. 같은 발화의 SP-014·015·016은 각 노드에서 구현한다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D013](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 사실 확인, 안전 인증, 계정, 결제, 공개가 아니다.

계약 변경은 있다 (`contract_change=YES`). 자동 머지 대상이 아니다. persisted `schemaVersion` 1, canonical version 1, `solverVersion` `zari-solver-v1`, `ActionStep` 필드 모양은 유지한다. DB 마이그레이션은 없다.

## 등록한 식별자

| 이름 | 값 |
|---|---|
| `BUILD_ID` | `zari-domain-7` |
| `ruleVersion` | `zari-domain-v2` |
| `solverVersion` | `zari-solver-v1` (변경 없음) |
| schema / canonical | 1 / 1 |

`zari-domain-v1` 스냅샷은 역사 기록이다. 바이트와 해시를 다시 쓰지 않는다. 완료를 거절하고, 이미 있는 done 행은 그 binding에 남긴다. 진행을 자동으로 옮기지 않는다.

## 생산 가이드

`assemble_action_guide`가 채택한 순서를 만든다. React는 순서를 다시 정하지 않는다.

| kind | id | 선행 | 막는 검사 |
|---|---|---|---|
| `clearSpace` | `act:clear:{spaceId}` | 없음 | 없음. 고정 장애물·staging·하중을 지우지 않는 사용자 표시 |
| `acquire` | `act:acquire:{variant}` | 없음. 선택된 offer가 있는 새 variant만 | 그 variant의 inv/pr/sh unknown |
| `confirmArrival` | `act:arrive:{variant}` | 그 variant의 acquire | 치수를 확인하지 않음 |
| `resolveCondition` | `act:resolve:{item}:{ordinal}` 또는 `act:resolve-offer:{variant}` | 없음 | 완료가 Fact·검사·provenance를 바꾸지 않음 |
| `transferContents` | `act:transfer:{item}:{ordinal}` | 공간의 clear, 그리고 새 용기면 arrival 또는 offer resolve. 설치가 아님 | 그 용기의 내부 용량, cavity/staging 하중, 지지 기하 |
| `install` | `act:install:{placementId}` | validator 선행 설치, 새 용기 구매 관문, 그 용기로의 transfer 전부, 공간의 clear | 외형, 반입 경로, 지지, 바닥·staging 하중, 방향, 사용 접근. pr/sh/inv와 `bg:soft`는 아님 |
| `verifyUnassigned` | `act:verify:{item}` | 없음 | 수량을 지우지 않음 |

`sortContents`와 `label`은 만들지 않는다. `requiredConfirmations`는 빈 배열이다. 선행은 `prerequisiteStepIds`다. 표시 순서는 Kahn이고, 준비된 단계 중 id 바이트가 가장 작은 것을 고른다. 선행 목록은 바이트 순이다.

`reasonIds`는 실행을 막는 unknown 또는 blocking fail 검사 id만 담는다. Pass와 NotApplicable는 빼며 `chk:bg:soft`도 빼다. 없는 검사 id는 `dangling_check_ref`, 중복 reason은 `duplicate_reason_ref`, 중복 선행 간선은 `duplicate_action_ref`다. 옛 스냅샷의 빈 reason과 install-before-transfer 그래프는 여전히 구조적으로 유효하다.

인스턴스 참조는 `Placement`, `ItemAssignment`, `Unassigned`에서 만든다. 단계 id 문자열을 쪼개지 않는다.

## 자격 읽기

`queryActionEligibility`는 순수 읽기다. capability는 `queryNextFacts` 다음, `disposeProject` 앞이다. 입력은 스냅샷, progress(`null`은 자격 없음), stamp다. 4096행을 넘으면 `action_progress_limit`이다. 중복 step id는 `invalid_input`이다.

`eligible`이 거짓인 이유: `historical_rule`, `dirty_source`, `stamp_mismatch`, `null_progress`. `executable`은 eligible이고, 선행이 done이고, 막는 검사가 없고, 인스턴스 참조가 비어 있지 않고, `requiredConfirmations`가 비어 있을 때다. Acquire, transfer, install만 reason 검사로 막힌다.

진행 identity는 `{stepId}=done|todo` 줄을 정렬해 줄바꿈으로 잇는다. 빈 진행은 `""`다.

세션은 트랜잭션 밖에서 이 읽기를 호출한다. 저장소는 트랜잭션 안에서 catalog, rule, solver, schema, canonical, build id, search profile, project revision, progress identity를 다시 맞춘다. editor epoch와 worker 신원은 세션이 쓰기 전과 응답 적용 전에 확인한다. 거절은 행을 쓰지 않는다.

## 오라클

PC-01–04의 그래프는 `docs/oracles/product-completion/`의 손 계산 파일이다. 생산자가 그 파일을 다시 쓰지 않는다. `crates/core/tests/guide_oracle.rs`가 생산 결과를 그 파일과 비교한다. 오라클 index의 `currentBuildId`는 `zari-domain-6`으로 남는다. 그것은 엔진 출력이 아니다.

## 보류

SP-014의 `RunEval` 분할, 스키마 마이그레이션, `ActionStep` 필드 추가, 체크박스로 사실을 확인하는 일, checkout, provider, 출시는 이 노드가 열지 않는다.
