# SP-z-feedback-reorganize — 사용 피드백에서 다음 정리로 이어지는 루프

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-feedback-reorganize만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-feedback-reorganize](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

채택한 계획으로 살아 보면 자주 꺼내는 물건이 안쪽에 있거나, 입력한 빈도와 실제 사용이 다르거나, 정리가 금방 흐트러진다. 이 사실을 남길 자리가 없으면 다음 정리는 처음과 같은 입력에서 다시 시작한다. 반대로 피드백을 곧바로 결정으로 읽으면 안 된다. "안 쓴다"는 말이 물건 폐기나 구매로 이어지면 안 되고, 제안이 채택한 계획이나 실제 위치 기록을 몰래 바꾸면 안 된다. 제안은 왜 그렇게 나왔는지 규칙으로 설명되어야 하고, 같은 입력·규칙·예산이면 같은 초안이어야 한다.

## 결정

사용 피드백은 프로젝트별 `FeedbackLog`다. 항목은 덧붙이는 기록이고 지우거나 고치지 않는다. 철회는 별도의 id 목록이다. 정본은 Rust `feedback_reorganize`다. 명령은 `applyFeedbackLog`와 `proposeFeedbackReorganize`이고 응답은 `feedbackLogApplied`와 `feedbackReorganizeProposed`다. capability는 `proposeFeedbackReorganize`가 `evaluateLayoutEdit` 다음, `applyFeedbackLog`가 `applyLocationLog` 다음이다. 둘 다 검색 엔진 없이 쓰이고, 응답은 `PlanSnapshot`과 입력 digest에 들어가지 않는다. `applyFeedbackLog`는 stateless이고 system identity로도 보낼 수 있다. `proposeFeedbackReorganize`는 활성 프로젝트의 입력과 카탈로그를 읽는다.

- 기록 종류는 `accessDifficulty`(접근 불편), `frequencyChange`(사용 빈도 변경), `maintenanceDifficulty`(정리 유지 어려움)다. `frequencyChange`만 빈도(`daily`·`weekly`·`monthly`·`rare`)를 받고 나머지는 거부한다(`frequency_required`/`frequency_forbidden`). 짧은 메모는 NFC·길이 검사를 지나고 규칙에는 쓰이지 않는다.
- 기록은 채택한 snapshot이 있고 그 물건이 계획에 배치되어 있을 때만 성공한다(`needs_plan`, `item_unplaced`). 기록 당시 `planSnapshotId`를 Rust가 찍고 wire 값은 믿지 않는다. 지금 알려진 빈도와 같은 빈도 변경은 `frequency_unchanged`, 같은 계획의 같은 물건·종류 중복은 `duplicate_feedback`이다. 철회는 `Withdraw`이고 없는 id는 `subject_missing`, 이미 철회한 id는 `already_withdrawn`이다. 기록은 128건에서 막힌다.
- 입력 사실은 바뀌지 않는다. 사용 빈도 변경은 규칙이 쓰는 유효 빈도만 바꾼다(가장 최근의 철회되지 않은 기록, 없으면 입력). 빈도를 모르면 모르는 채로 남고 기본값이 되지 않는다.
- 제안은 채택한 snapshot의 최상위 배치(부모가 공간이고 지지면·높이가 같은 배치)끼리 위치를 맞바꾸는 유한 후보다. `DepthSwap`은 입구에서의 깊이만, `SlotSwap`은 바닥 위치 전체를 맞바꾼다. 높이·방향·지지·배정·구매 선택은 건드리지 않는다. 용기 안 물건은 용기의 최상위 배치로 읽는다.
- 규칙은 셋이고 모두 정수 측도가 엄격히 줄어드는 후보만 쓴다. 다른 규칙의 측도는 나빠지지 않아야 한다. 접근 규칙 `feedback:access:v1`은 입구에서 더 깊은 자주 쓰는 물건이 더 앞의 더 드문 물건과 자리를 바꾼다. 빈도 규칙 `feedback:frequency:v1`은 유효 빈도로 순서를 다시 본다(자주 쓰는 물건이 더 깊으면 역전 1). 유지 규칙 `feedback:maintenance:v1`은 같은 묶음 배치들의 거리 합을 줄인다. 빈도를 모르는 배치는 비교하지 않고 움직이지 않으며 `unknownSiblings`로 센다.
- 모든 후보는 `evaluate_candidate`를 지난다. 통과하려면 차단 실패가 없고, 채택한 계획을 새로 평가한 검사보다 어느 검사도 나빠지지 않아야 하며(`weakens_checks`), 물리 보증이 낮아지지 않아야 한다. 통과한 마지막 후보의 스냅샷이 초안이다. 생성 종류는 기존 `ManualEdit`이고 `reusedPass`는 항상 false다. 채택하지 않고 `selectedId`를 바꾸지 않는다.
- `autoDiscard`와 `autoPurchase`는 항상 false다. 응답의 `preserved`는 초안과 채택한 계획의 배정·미배정·구매 선택·BOM·비용을 Rust가 비교한 결과다.
- 기록마다 원인이 한 줄 나온다. 규칙 id, 결과(`applied`, `noBetterSlot`, `blocked`, `notApplicable`, `withdrawn`, `stale`, `budgetExhausted`), 이유 코드, 입력 빈도와 유효 빈도, 측도 전후, 맞바꾼 배치, 막힌 이유, 참고한 위치 관측이다. 다른 계획에 남긴 기록은 `stale`이라 쓰지 않는다. 위치 관측은 맥락일 뿐 규칙을 일으키지 않고 고쳐지지 않는다.
- 예산은 검증기에 보내는 후보 수(1–128)다. 응답의 `reproduction`은 읽기 모형·규칙 버전·입력·카탈로그·채택한 계획·피드백·위치 기록 digest와 예산, 이 모두에 대한 `requestDigest`, 초안 id다. 같은 요청은 같은 초안을 낸다. 채택한 계획이 지금 입력의 것이 아니면 `base_not_in_scope`, 바이트가 digest와 다르면 `integrity_failed`, 채택한 계획이 지금 검사를 통과하지 못하면 `base_invalid`다.
- 저장은 Dexie `feedbackLogs`다. live `DB_VERSION`은 5에서 6이다. 업그레이드는 `migration:5->6` 일지만 쓰고 스냅샷·입력·원장·위치 기록 바이트를 읽거나 다시 쓰지 않는다. 행의 schemaVersion은 1이다. exportVersion 1에는 넣지 않는다. 프로젝트 삭제는 그 행을 같은 트랜잭션에서 지운다.
- 화면은 계획 route의 부분 재정리 다음 패널이다. 기록은 프로젝트 Worker의 system identity로 보내고, 제안은 프로젝트 세션이 보낸다. 같은 입력·계획·기록·위치 기록·예산은 명령을 한 번만 보낸다. 취소는 epoch를 올리고 늦은 응답은 `ignored`만 올린다. 초안 보기는 초안을 대안에 넣고 고른다. 채택은 기존 채택과 같은 경로다. 채택하면 이전 계획에 남긴 기록은 더는 적용되지 않는다. 색은 기존 패널 토큰이다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 명령과 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `baseCapabilities`만 실행 중인 목록과 같게 고친다. 그 계약의 `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 6이다.

## 하지 않는 것

전체 재탐색, 형상·용기 교체, 구매·폐기 추천의 확정, 입력 사실의 자동 수정, 가족 공유·클라우드 동기화, 사진, 위치 관측으로 피드백을 만들어 내는 추론, 다음 z-노드. 이 노드의 초안은 위치 맞바꿈의 유한 이웃 탐색이다. 맞바꿈으로 풀리지 않는 불편은 `noBetterSlot` 또는 `blocked`로 남고 풀린 것처럼 보이지 않는다. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
