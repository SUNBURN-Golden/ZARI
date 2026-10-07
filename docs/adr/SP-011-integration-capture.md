# SP-011 — 후속 측정 통합 검증과 새 draft capture

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 약 07:28 KST. 원문: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라."

이 기록은 SP-011만 다룬다. Fable MILESTONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D011](../../design/DECISIONS.md)이다. 캡처 등록은 화면 승인이 아니고, 이 프로그램은 출시를 허가하지 않는다.

## 문제

SP-009의 상세 입력과 SP-010의 다음 사실 목록은 SP-007 draft에 없다. 그 이미지를 이 화면의 승인으로 빌리면, 빈 경계·사람 메모·stale·탭 충돌이 검사되지 않은 채로 남는다.

## 결정

같은 제품 트리에서 MC-01–12와 기존 공간·portable·편집·진행·parity 회귀를 다시 실행한다. 계약이 바뀌면 그 수정은 009·010의 범위로 되돌리고, 여기서 스키마나 규칙을 다시 설계하지 않는다.

새 draft는 `design/baselines/draft/zari011/`이다. 실제 Worker가 그린 fresh, 명목값과 오차, unknown, 빈 경계, 사람 메모, staging 지지, 하중 unknown, 카탈로그 출처, 다음 사실, stale, 탭 충돌을 1440과 390에서 남긴다. 포커스, forced-colors, 200% zoom도 남긴다. 인덱스에는 구현 HEAD, 시나리오, fixture, 브라우저, viewport, 글꼴, 모션, GPU, 이미지 해시를 적는다. 승인 수와 SP-007 이미지는 바꾸지 않는다.

메모를 충돌처럼 보이는 숫자로 바꿔도 사람 문장은 유지되고 semantic digest만 바뀐다. 그 문장으로 숫자 정규화, 충돌, 통과, Confirmed를 만들지 않는다. 분류된 충돌 행은 구조화된 `conflicting_sources` 또는 `UnknownReason::ConflictingSources`에서만 나온다.

타이밍은 cold 20, warm 50이다. 소스 단계와 fixture·환경 digest를 적는다. 임계값을 낮추지 않는다. 넘으면 `exceeded`, 기기가 없으면 `unmeasured`다.

보고 축은 하나로 합치지 않는다.

| 축 | 이 인계의 값 |
|---|---|
| node_state | `IN_PROGRESS`. `DONE`은 보호된 exact-head 머지 뒤에만 |
| qualification_state | `PARTIAL`. 데스크톱 브라우저는 측정하고, 전화와 전용 GPU는 `UNQUALIFIED` |
| acceptance_state | `PENDING`. 코드와 캡처가 승인을 만들지 않음 |
| release_state | `NOT_AUTHORIZED` |

## 결과

Rust `BUILD_ID`, capability, persisted schemaVersion 1, 기존 fixture 기대값은 이 결정으로 바꾸지 않는다. 사용자가 나중에 exact-set으로 이 draft를 승인하기 전까지 승인 수는 0이다.
