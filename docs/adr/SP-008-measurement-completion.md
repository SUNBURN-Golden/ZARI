# SP-008 — 측정 완성 ADR

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (저장소 소유자), 2026-10-07 00:31 KST. 원문: "008 ADR 채택한다. Fable 게이트는 앞 노드처럼 독립 리뷰 2회로 대체하고, 머지도 네가 해라."

이 채택은 SP-008만 해당한다. SP-009부터 SP-016은 후보로 남는다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D008](../../design/DECISIONS.md)이다.

## 문제

이후 화면이 정규화, 근거 신뢰, 다음 사실의 우선순위를 스스로 정하면 안 된다. 부호 있는 오프셋은 양의 길이 규칙으로 검사되어 `0±0`, 0을 가로지르는 구간, 합법적인 음수 구간이 거절되었다.

## 결정

지원되는 raw DTO와 persisted `schemaVersion` 1이 이 사실을 표현한다. 마이그레이션, 새 geometry, provider, 새 권한은 없다. `protocolVersion`과 PlanSnapshot 의미는 그대로다.

### 필드 문법

경로는 유한하다. 임의의 유효한 id를 받으며 `item-a` 같은 표본 id에 묶이지 않는다. 잘못된 id나 알 수 없는 접미사는 경로가 아니다.

| 경로 | 종류 | 프로젝트에서 수정 |
|---|---|---|
| `space.interior.{width,depth,height}`, `space.opening.{width,height}`, staging extent, support footprint의 폭·깊이, item envelope | 양의 길이 | 예 |
| `space.opening.{left,bottom}`, staging `minX\|minY\|minZ`, support footprint `x\|y`, elevation, obstacle `bounds.min*` | 부호 있는 오프셋 | 예 |
| space clearances, item handling | 여유 (0 포함) | 예 |
| `items.{id}.quantity`, `ownedContainers.{id}.quantityOwned\|quantityAvailable` | 수량 | 예 |
| item `massEach`, support/staging load | 질량 | 예 |
| `variants.*`, `offers.*`, `ownedContainers.{id}.physical.*` | 카탈로그와 같은 종류 | 아니오 |

`space` 경로에는 space id가 없다. 호출자가 `ProjectInput.space.id`에 묶는다. 정규화 진단 경로는 `space.{spaceId}.…`이다. 둘은 같은 필드다.

### 값의 상태

- known: 명목값이 파싱되고, 선언된 오차가 unknown이거나 두 경계가 모두 유효하다.
- unknown: 빈 명목값은 `NotMeasured`이며 진단이 없다. 0으로 바꾸지 않는다.
- invalid: 범위, 문법, 누락된 경계, 오버플로. 구조적으로 실패하고 기본값을 넣지 않는다. 진단이 있으면 그 필드의 정규화 결과는 unknown이며 입력 다이제스트는 없다.
- bounded: `[nominal − minus, nominal + plus]`. 길이 구간은 기존의 양의 길이 규칙을 유지한다.

부호 있는 오프셋만 예외다. 명목값과 두 끝점은 PositionMm −20000..=20000이다. 두 경계는 ClearanceMm 0..=10000이다. 뺄셈과 덧셈은 checked i64다. `abs(nominal)`에 양의 길이 검사를 적용하지 않는다. 0을 가로지르는 합법적인 구간을 거절하지 않는다. 빈 경계를 0으로 두지 않는다.

손 계산:

| 입력 | 구간 |
|---|---|
| 0 − 0 / + 0 | [0, 0] |
| 0 − 2 / + 3 | [−2, 3] |
| −2 − 3 / + 4 | [−5, 2] |
| 20000 ± 0, −20000 ± 0 | 끝점 그 자체 |
| 19999 + 1, −19997 − 3 | [19999, 20000], [−20000, −19997] |
| 20000 + 1, −20000 − 1 | `uncertainty_out_of_range` |
| 20001 | `scalar_out_of_range` |
| i64에 들어가지 않는 자릿수 | `numeric_overflow` |

`UserMeasured`는 Unverified이며 `observedAt`을 만들지 않는다. Confirmed는 자동으로 되지 않는다.

### 그룹 형식

한 명목값과 두 경계는 한 편집 epoch다. 요청은 기존 `normalizeInput`의 선택 필드 `groupFormatRequests`다. 응답 `formattedGroups`는 항상 있다. 상한은 16이다. 일부를 변환해 명목값만 돌려주지 않는다. 진단이 있으면 그 코드로 `notConverted`이고 `nominalText`는 null이다. 명시적 unknown 오차와 known 명목값은 변환되고 오차 상태는 unknown이다. 오프셋 단위는 정수 mm만이다. 여유는 0을 포함해 mm/cm로 형식화한다. 수량·질량·금액·포장 수량은 단위 변환을 지원하지 않는다.

### 근거와 충돌

`Evidence.note`는 사람이 쓴 제한된 텍스트다. 원문 값, 단위, 위치, 방법을 담을 수 있고, 기존의 출처·시각·id 참조를 그대로 둔다. 새 관측 DTO는 없다. note를 파싱해 물리량, 숫자, 충돌, Confirmed를 만들지 않는다. `conflictingEvidence`는 기존 구조화 검사의 reason이 정확히 `conflicting_sources`일 때만이다. `UnknownReason::ConflictingSources` 밖의 문장 일치는 충돌이 아니다.

### 다음 사실 query — 고정만, 실행 없음

아래는 SP-010이 구현할 계약이다. 이 노드에서는 `DomainOperation`, capability, 생성 스키마, 클라이언트 호출이 없다. Rust 타입은 `JsonSchema`를 파생하지 않는다.

- 연산과 capability 이름: `queryNextFacts`
- 한도 코드: `completion_limit_exceeded`
- 한도: fact 행 512, check 참조 2048, 직렬화 5 MiB. 넘치면 목록을 자르지 않고 전체가 실패한다.
- 우선순위: 알려진 필수 실패 수정 0, 필수 물리 unknown 1, 수량 완전성 2, 조달 unknown 3, soft 또는 미지원 4.
- Pass와 NotApplicable은 행이 없다.
- reason이 정확히 `conflicting_sources`이면 수정 우선순위와 필요 `conflictingEvidence`.
- 물리·수량·예산의 blocking Fail은 수정 우선순위다. 예산의 비차단 Fail과 그 밖의 비차단 Fail은 soft다. reason이 `unsupported_`로 시작하면 필요 `unsupportedInput`.
- 물리 Unknown은 필수 물리 unknown이며, 이 분류기는 `missingNominal` / `missingBound` / `missingEvidence`를 만들지 않는다. SP-010이 사실 자체를 보고 채운다.
- 수량·호환 Unknown은 수량 완전성이다. 재고·가격·배송의 비통과, 그리고 예산 Unknown은 조달 unknown이다.
- fact key는 `{entityId}:{fieldPath}`인 제한된 문자열이다. `Id`가 아니다. `Id`는 96바이트이고 `.`을 허용하지 않는다.

### 카탈로그와 호환

카탈로그 SKU 치수와 보유 용기의 물리는 프로젝트 로컬에서 덮어쓰지 않는다. 그 경로로 그룹 형식을 요청하면 명령이 `catalog_field_read_only`로 실패한다. 보유 수량은 수정 가능하다.

오래된 명령 JSON은 `groupFormatRequests`가 없어도 디코드된다. 저장된 schemaVersion 1 레코드는 그대로 왕복한다. 알 수 없는 필드, 범위 밖, 한도 초과는 구조적으로 실패하며 기본값이 없다.

### 핸드셰이크

정규화 의미가 바뀌므로 `BUILD_ID`는 `zari-domain-5`다. capability 목록과 순서는 이전과 같다. 페이지는 순서와 길이가 모두 같을 때만 수락한다. 이전 빌드 `zari-domain-4`는 `version_mismatch`다. 구현되지 않은 query는 `operation_not_supported`다.

## 결과

native fixture와 실제 Worker가 같은 손 계산 구간을 반환한다. 이전에 유효했던 fixture의 권위 있는 기대값은 `engineContext.buildId` 재고정 외에는 바이트가 같다. 예전에 거절되던 오프셋 입력은 이름이 있는 수정 fixture에만 새 기대값을 둔다.
