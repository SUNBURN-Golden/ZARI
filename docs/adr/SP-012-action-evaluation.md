# SP-012 — 행동·조건·버전·평가 계약

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 SP-012만 다룬다. 같은 발화의 SP-013·014·015·016은 각 노드에서 구현한다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D012](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 사실 확인, 안전 인증, 계정, 결제, 공개가 아니다.

이 노드는 생산 구현, 의존성, DB 마이그레이션을 넣지 않는다. 현재 `BUILD_ID`는 `zari-domain-6`이다. 다음 빌드 식별자는 여기 없다.

## 문제

측정 입력과 다음 사실 목록이 있어도 실행 가이드의 물리 순서, 조건 차단, 평가 중 취소, 버전 변경 뒤의 진행 해석은 정해져 실행되지 않았다. 기준 HEAD에서 다시 읽은 차이는 다음과 같다.

| 차이 | 소스 | 소유 | 손 계산 오라클 |
|---|---|---|---|
| contained 항목의 `TransferContents`가 `Install`을 선행으로 가진다. 채택한 순서는 외부 staging에서 담고, 적재된 수납함을 넣는다 | `crates/core/src/finalize.rs::build_actions` | SP-013 | PC-03 |
| `required_confirmations`와 `reason_ids`가 빈 벡터다. `ClearSpace`와 `SortContents`는 enum에만 있다 | 같은 함수 | SP-013 | PC-01, PC-04 |
| SP-004는 source action 재생성과 순서 변경을 금지한다. 화면 진행만으로 위 차이를 고치지 않는다 | SP-004 | SP-013. SP-004를 넓히지 않는다 | PC-03 |
| `RunEval`이 `evaluate_candidate` 전체를 한 번에 호출한다. `64+p²+4a`는 논리 비용이고 시간 상한이 아니다. 첫 indivisible op은 allowance를 넘겨도 실행된다 | `crates/solver/src/search.rs` | SP-014 | PC-05, PC-06, PC-07 |
| 역사·CAS·카탈로그·Worker 복구가 한 계약으로 묶여 있지 않다 | PERSISTENCE, session, repository | SP-015 | PC-08, PC-09, PC-10, PC-11 |
| 구매 수량은 이미 BOM 규칙으로 계산된다. 가이드가 새 unit에만 acquire를 붙이는 계약이 코드에 없다 | `build_bom`, `build_actions` | SP-013 | PC-02 |

`fixtures/spatial/spatial-yaw-offset.json`의 `act:transfer:item-a:0`은 `act:install:p-c1`을 선행으로 가지고, `requiredConfirmations`와 `reasonIds`는 비어 있다. `subjectIds`는 `item-a`와 `p-c1`뿐이라 ordinal은 단계 id 문자열 안에만 있다.

## 결정

### 1. 지금 고정하는 필드

persisted `schemaVersion` 1과 canonical version 1의 모양은 유지한다. 아래는 현재 소스의 필드다.

`ActionStep`: `id`, `kind`, `subjectIds`, `prerequisiteStepIds`, `requiredConfirmations`, `reasonIds`. kind는 `clearSpace`, `sortContents`, `acquire`, `confirmArrival`, `install`, `transferContents`, `label`, `verifyUnassigned`, `resolveCondition`.

`ConstraintCheck`: `id`, `kind`, `subjectIds`, `status`, `reasonCode`, `basis`, `evidenceRefs`, `measurements`, `blocking`, `remediation`. status는 `pass`, `fail`, `unknown`, `notApplicable`. basis는 `nominal`, `conservative`, `nonGeometric`.

인스턴스: `PlacementSubject`와 `ItemAssignment`가 `unitOrdinal`을 구조화된 `u32`로 가진다. `ActionStep.subjectIds`는 `Id`의 배열이라 ordinal을 담지 못한다. `Id`는 1..96바이트이고 `[A-Za-z0-9_:-]`만 허용한다. `.`은 허용되지 않는다.

진행 행 `ActionProgressRow`: `schemaVersion`, `projectId`, `inputRevision`, `planSnapshotId`, `stepId`, `status`(`done`|`todo`), `updatedAt`. 키는 `[projectId, inputRevision, planSnapshotId, stepId]`.

검사 id는 `chk:` 뒤에 validator의 local id가 붙는다. local id는 `subj:`, `or:`, `og:`, `ogp:`, `ogo:`, `sg:`, `ic:`, `sgc:`, `ld:floor:`, `ld:cavity:`, `ld:staging:`, `ip:`, `io:order`, `oa:`, `oac:`, `qc:partition`, `qc:owned:`, `cp:group:`, `cp:item:`, `cp:compat:`, `cp:zone:`, `cp:model:`, `inv:`, `pr:`, `sh:`, `bg:hard`, `bg:soft`이다. 기하 검사는 `:n`과 `:c`가 따로다.

### 2. 참조는 서로 다른 이름공간이다

| 필드 | 가리키는 것 | 가리키지 않는 것 |
|---|---|---|
| `prerequisiteStepIds` | 같은 스냅샷의 `ActionStep.id` | 검사, 사실, 근거 |
| `requiredConfirmations` | 같은 스냅샷의 `ActionStep.id`. 구조 검사는 선행과 같이 그래프 간선으로 본다 | 사실 확인, `VerificationStatus::Confirmed`, 검사 id |
| `reasonIds` | 비어 있는 동안은 아무 것도 가리키지 않는다. SP-013이 값을 쓰기 시작하면 같은 스냅샷의 `ConstraintCheck.id` | 행동 id, 사실 경로, 사람 문장 |
| `evidenceRefs` | 기존 `FieldRef` | 진행 행 |
| 진행 `stepId` | 그 binding의 `ActionStep.id` | 다른 스냅샷의 같은 문자열 |

없는 id, 중복 id, 순환은 구조 오류다. 이미 있는 코드는 `dangling_action_ref`와 `cyclic_action_dependencies`다. `reasonIds`는 지금 검사하지 않는다. SP-013이 채우면 없는 검사 id와 중복을 거절한다. 그 채움은 가이드 의미 변경이라 새 `ruleVersion`이지, JSON 필드가 이미 있으므로 schema 변경이 아니다.

`requiredConfirmations`라는 이름은 사실 확인 기능이 아니다. `done`은 사용자가 행위를 했다고 적은 기록이다. `CheckStatus`도 `VerificationStatus::Confirmed`도 아니다.

### 3. 정확한 인스턴스

한 contained unit은 `{itemId, unitOrdinal, containerPlacementId}`다. ordinal은 `u32`다. 같은 물건의 두 unit은 `subjectIds`가 같아도 인스턴스 참조는 다르다.

단계 id `act:transfer:{item}:{ordinal}`은 생산자가 구조화된 필드에서 만드는 관례다. 96바이트를 넘으면 `bounded_step_id`가 해시 꼬리로 자른다. 소비자, 화면, 저장 계층은 이 문자열을 쪼개 ordinal이나 대상을 복원하지 않는다. 링크는 `ItemAssignment`와 `PlacementSubject`에서 만들고, 생산자와 같은 생성자로 단계 id를 맞춘다.

이 구분은 persisted `ActionStep`에 필드를 더하지 않고 표현한다. 그래서 최소 임시 읽기 모델만 명세하고, 생성 schema로는 내보내지 않는다. `ActionStep`에 ordinal 필드를 추가하는 마이그레이션은 별도 채택 전까지 보류다.

임시 `InstanceRef`는 다음 중 하나다. 태그는 읽기 모델의 이름이며 스냅샷 JSON이 아니다.

| 태그 | 필드 |
|---|---|
| `directItem` | `itemId`, `unitOrdinal`, `placementId` |
| `containedItem` | `itemId`, `unitOrdinal`, `containerPlacementId` |
| `ownedContainer` | `ownedId`, `unitOrdinal`, `placementId` |
| `newContainer` | `variantId`, `unitOrdinal`, `placementId` |
| `unassigned` | `itemId`, known range `{start, endExclusive}` 또는 `unknownQuantity` |
| `space` | `spaceId` |

### 4. 행동마다의 의존

kind만으로 모든 검사를 모든 단계에 붙이지 않는다. 대상 인스턴스, 배치 id, 동작이 맞는 검사만 붙인다. 표시 순서는 Kahn이고, 선행이 모두 끝난 단계 중 단계 id 바이트 순서가 빠른 것을 고른다. 선행 id 목록도 바이트 순이다.

| kind | 언제 | 선행 | 막는 검사 | 권위 |
|---|---|---|---|---|
| `clearSpace` | 구획을 비웠다는 사람 확인. 고정 장애물을 치우는 안내가 아니다 | 없음 | 검사를 지우지 않는다. staging·하중·handling unknown을 풀지 않는다 | 사용자 행위 주장 |
| `sortContents` | enum은 있으나 생산자가 만들지 않는다. 내용을 물리적으로 정렬했다는 뜻이 아니다 | 보류 | 보류 | 사용자 행위 주장으로만 쓸 수 있다 |
| `acquire` | `Selected` offer가 있는 새 variant마다 하나 | 없음 | 그 variant의 `inv`/`pr`/`sh`. 다른 direct 설치를 막지 않는다 | 구매 의도 주장. 주문이 아니다 |
| `confirmArrival` | 그 variant의 acquire 다음 | acquire | 치수를 확인하지 않는다 | 도착 주장 |
| `resolveCondition` | provisional 배정, 또는 offer가 없는 새 variant | 없음 | 완료해도 검사·사실·근거가 변하지 않는다 | 조건을 읽고 입력으로 갔다는 기록 |
| `transferContents` | contained 배정마다 하나. `(itemId, unitOrdinal)` | 그 구획의 `clearSpace`. 새 수납함이면 그 variant의 arrival 또는 offer `resolveCondition` | 그 수납함 배치의 내부 용량, cavity/staging 하중, 내용물 접근, handling unknown | 밖에서 담았다는 주장 |
| `install` | 최상위 배치마다 하나. validator가 증명한 삽입 선행 | 삽입 선행의 install, 새 수납함의 구매 관문, 그 수납함에 담긴 모든 transfer, `clearSpace` | 그 배치의 외경, 설치 경로, 지지 기하, 바닥/staging 하중, 방향. `pr`/`sh`/`inv`와 `bg:soft`는 무관한 direct 설치를 막지 않는다 | 적재된 unit을 넣었다는 주장 |
| `label` | 생산자가 만들지 않는다 | 보류 | 보류 | 보류 |
| `verifyUnassigned` | 미배정 묶음마다 | 없음 | 미배정 수량을 지우지 않는다 | 검토했다는 주장 |

직접 배치에는 transfer, acquire, arrival이 없다. 구매가 없는 계획에는 acquire, arrival, 없는 수납함의 loading이 없다. 빈 카탈로그의 배송은 `notApplicable`/`no_purchases`이고 새 구매 비용은 known 0이다. 상품을 만들지 않는다.

소유 ordinal은 각각 한 번이다. 미배정 range와 provisional은 안내에서 남는다. 합은 입력 수량과 같다.

고정 장애물, staging 기하, 지지, 하중, handling unknown은 `clearSpace`나 `done`으로 `pass`나 `Confirmed`가 되지 않는다. `temporary_parking_unsupported`도 같다. 해결은 사실 편집, Rust 정규화, CAS 저장, 명시적 재계산, 새 스냅샷 채택이다.

알려진 blocking Fail은 지금처럼 스냅샷을 내지 않는다. `bg:soft`만 비차단 Fail이다. 발행된 계획의 실행 차단은 적용되는 Unknown과 unsupported다. Pass와 NotApplicable은 실행 차단이 아니다.

서로 다른 수납함의 loading과 install을 전부 직렬로 잇지 않는다. validator 삽입 선행이 있을 때만 install이 이어진다. 내부 loading, tilt, sill을 넘는 lift, blocker parking 안내는 지원하지 않으며 그 enum을 추가하지 않는다.

### 5. 버전

| 식별자 | 현재 값 | 바뀌는 때 | 이 노드 |
|---|---|---|---|
| `ruleVersion` | `zari-domain-v1` | 가이드·검사·BOM 의미 | 유지. SP-013이 가이드 순서를 바꿀 때 다음 문자열을 그 ADR에 등록 |
| `solverVersion` | `zari-solver-v1` | 열거, 비용, 중단, 순위 | 유지. SP-014가 비용 회계를 바꿀 때 등록 |
| search profile | `default` version 1 | 비용 회계가 후보를 바꾸면 | 유지. 다음 profile version은 등록하지 않는다 |
| `schemaVersion` | 1 | JSON 모양 또는 호환되지 않는 필드 의미 | 유지. 마이그레이션 없음 |
| `canonicalVersion` | 1 | canonical byte 규칙 | 유지 |
| `BUILD_ID` | `zari-domain-6` | 명령·capability·생성 계약이 함께 바뀔 때 | 유지. 다음 id를 단정하지 않는다 |

### 6. 역사

옛 스냅샷은 원래 hash, 가이드, 관측 근거를 가진 역사다. 재계산은 새 context와 새 id다. 단계 id가 같아 보여도 다른 accepted binding의 진행을 옮기지 않는다. 진행을 지우지 않는다.

현재 엔진의 `ruleVersion`보다 오래된 가이드는 읽기 전용이다. 그 binding에서 실행 완료를 받지 않고, 재계산을 안내한다. `zari-domain-v1`은 이 노드 기준으로 현재 규칙이다. SP-013이 rule을 올리기 전에는 옛 스냅샷을 역사로 강등하지 않는다.

### 7. 평가

`default` version 1은 `RunEval` 비용 `64 + p*p + 4*a`와 `evaluate_candidate` 한 호출을 유지한다. 그 비용은 밀리초가 아니다.

SP-014가 회계를 바꾸면 새 solver version과 새 profile version이다. 그 프로필의 quantum은 아래뿐이고, lump는 quantum이 아니다. allowance가 quantum 비용보다 작아도 그 quantum 하나는 실행한다. 초과분은 그 quantum이다. 전역 work와 node 한도는 실행 전에 적용한다.

| 단계 | quantum | 비용 |
|---|---|---|
| `structuralValidation` | 참조 하나 | 1 |
| `independentChecks` | 검사 하나(basis마다) 또는 pair 비교 하나 | 1 |
| `quantityAudit` | 배정, 미배정 묶음, 조회한 owned id 하나 | 1 |
| `bomAndCost` | BOM 줄 하나 | 4 |
| `actionDag` | 단계 하나, 그리고 선행 간선 하나 | 1 |
| `canonicalHash` | canonical byte 4096마다, 최소 1 | 1 |
| `structuralRevalidation` | 검사 id 하나 또는 행동 id 하나 | 1 |

순서는 위 표의 순서다. continuation은 비공개이고 입력·카탈로그·proposal·version에 묶인다. solver는 진행 중 verdict를 pruning에 쓰지 않는다. source가 다르면 handle을 재사용하지 않는다.

발행은 마지막 단계가 끝난 뒤의 한 결과다. 검사 전 스냅샷, 반쪽 BOM, 반쪽 행동, 반쪽 hash는 없다. 이전의 완성 대안과 저장 입력은 남는다.

`budgetExhausted`는 한도를 넘는 quantum을 시작하지 않은 결과다. `cancelled`는 quantum 사이에서 취소가 보인 결과다. `interrupted`는 hard terminate, watchdog, crash다. 셋을 서로 바꾸지 않는다. hard terminate는 `scopeComplete`가 아니다.

오라클은 손 계산이다. `build_actions` 출력으로 기대 그래프를 만들지 않는다.

### 8. 임시 자격 읽기 — 명세만

이름이 `queryActionEligibility`인 읽기가 필요하다. `subjectIds`가 ordinal을 못 담고, 차단은 구조화된 검사에서 와야 하기 때문이다. 이 노드의 명령, capability, 생성 schema, fixture handshake에는 없다. 요청은 `operation_not_supported`다. 빈 성공이 아니다.

SP-013이 열면 `queryNextFacts`와 같이 명령, capability, 생성 schema, Worker, 클라이언트, fixture를 한 트리에서 연 다음 그 ADR에 다음 `BUILD_ID`를 등록한다. 그 id는 여기 없다.

읽기는 검색, 저장, 사실 승격, 스냅샷 변경을 하지 않는다. 입력은 맞는 불변 스냅샷과 bounded 진행 행(최대 4096)이다. 임의 문자열을 지시로 해석하지 않는다.

stamp는 `projectId`, `inputDigest`, `planSnapshotId`, `catalogDigest`, `catalogVersion`, `ruleVersion`, `solverVersion`, `schemaVersion`, `canonicalVersion`, `buildId`, search profile, accepted `inputRevision`, 관찰한 `projectRevision`, `editorEpoch`, 진행 행 identity다. 대상이 없거나 stamp가 다르면 eligible이 아니다. null 진행과 읽기 실패도 eligible이 아니다.

행마다 `actionId`, 구조화된 `instanceRefs`, 적용되는 blocker 검사 id, 사용자 주장 여부, `executable`이 있다. Unknown blocker가 있으면 `executable`은 false다.

진행 저장 직전 CAS는 그 stamp와 실제 프로젝트 revision, 입력, 카탈로그, 엔진, 스냅샷, 캡처한 진행 행이 같을 때만 커밋한다. Worker 호출은 transaction 밖에 있다. 불일치면 거절하고 기존 done 행을 유지한다. 지금 repository가 보는 것은 `projectRevision`, accepted binding, 현재 입력 revision과 digest다. 나머지 stamp는 SP-013과 SP-015가 이 계약으로 더한다. 화면의 조건 확인은 그 Rust 결과와 CAS의 일치이며 새 물리 판정이 아니다.

### 9. 보류

별도 채택 전까지 하지 않는다. persisted `ActionStep` 필드 추가, 새 `ActionKind`/`CheckKind`, schema 또는 db 마이그레이션, `queryActionEligibility`의 생성 계약과 `BUILD_ID` 변경, 내부 loading·tilt·sill lift·blocker parking, 체크박스로 하는 사실 확인, 계정·공급자·결제·공개·업로드·출시.

### 10. 독립 검토

작성자 자체 확인은 A3가 아니다. 비작성자 검토는 같은 head에서 다음을 본다. 역사 호환(옛 바이트와 진행을 다시 쓰지 않음), 물리 가이드 순서(담은 뒤 삽입, 역간선 없음), 인스턴스 보존(ordinal 한 번, 미배정 유지), 예산과 취소(`budgetExhausted`/`cancelled`/`interrupted`와 부분 발행 없음).

## 결과

실행 중인 도메인, capability, 생성 schema, fixture 기대값, `BUILD_ID`는 이 결정으로 바꾸지 않는다. 손 계산 오라클은 `docs/oracles/product-completion/`에 있고 fixture runner 입력이 아니다.
