# SP-z-incremental-replan — 고정 배치를 지키는 부분 재정리

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-incremental-replan만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-incremental-replan](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

물건이 늘거나 치수가 바뀌면 사용자는 유지할 배치·물건·전략을 고를 수 있어야 한다. 고정한 배치를 몰래 옮기면 안 된다. 새 치수로 무효가 된 과거 통과를 다시 쓰면 안 된다. 취소나 늦게 도착한 응답이 이미 고른 계획을 바꾸면 안 된다. 불가능하면 최소 충돌과 풀 수 있는 고정을 보여 줘야 한다.

## 결정

부분 재정리는 Rust `incremental::replan`이다. 읽기 모형 버전은 `zari-incremental-1`이다. 명령은 `replanIncremental`이고, 검색 엔진이 있을 때만 capability로 알린다. 순서는 `comparePareto` 다음이다. `comparePareto`는 `cancelSearch` 다음에 그대로 둔다. 응답은 `incrementalReplanned`다. 응답의 읽기 모형은 `PlanSnapshot` 해시에 들어가지 않는다. 명령은 계획을 채택하지 않고, 이전 스냅샷을 고치지 않으며, 탐색을 시작하지 않고, 탐색 순위를 바꾸지 않는다.

- 입력은 활성화된 프로젝트의 새 `ProjectInput`과 카탈로그다. `baseSnapshot`은 이전 계획이다. 핀은 `placementIds`, `itemIds`, `strategy`다. 배치 핀은 그 배치를 그대로 둔다. 물건 핀은 그 물건의 배정이 가리키는 배치를 함께 고정한다. 전략 핀은 이전 계획의 전략을 요구한다.
- 고정한 배치의 id·주체·부모·좌표·방향·지지는 바이트 그대로다. 같은 id의 좌표가 달라지면 `placement_moved`로 실패하고 계획을 내지 않는다. 화면은 그 좌표를 다시 계산하지 않는다.
- 핀이 아닌 배치가 구조적으로 맞지 않거나 blocking fail이면 그 배치를 뺀다. 옮기지 않는다. 새 물건은 배치를 만들지 않고 미배정으로 남긴다. 다시 채우는 탐색은 기존 계산 버튼이다.
- 발행은 핀을 지킨 레이아웃이 진단을 통과하고 blocking fail이 없을 때만 `evaluate_candidate`다. 생성 종류는 기존 `ManualEdit`다. 버전과 범위는 새 입력으로 다시 계산한다. `reusedPass`는 항상 false다. 이전 스냅샷의 검사 상태를 복사하지 않는다. 다시 확인할 검사는 새 `validate_candidate` 결과에서만 온다.
- 전략 핀이 있는데 입력의 전략이 다르면 발행하지 않고 `strategy_pinned`를 남긴다. 전략을 조용히 바꾸지 않는다.
- 핀 때문에 발행하지 못하면 충돌 코드와 풀 수 있는 고정을 낸다. 명시 핀은 하나씩 빼 보고, 최대 8개까지 `sufficientAlone`을 표시한다. 그것만으로 부족하면 핀 전체를 한 번에 뺀 결과를 낸다. 풀어도 안 되면 `release_insufficient`다.
- 알 수 없는 핀, 중복 핀, 64개를 넘는 핀은 오류다. 활성 프로젝트가 없으면 `invalid_state`다. 검색 엔진이 없으면 `operation_not_supported`다. 빈 페이로드나 여분 필드는 `invalid_input`이다.
- 화면은 계획 route에서 대안 비교 다음이다. 계획이 없으면 빈 상태다. 부분 재정리, 취소, 이 계획으로 바꾸기, 고정 풀기는 버튼이다. 고정 풀기는 그 체크만 지우고 명령을 보내지 않는다. 다음 부분 재정리가 그 핀 없이 한 번 보낸다. 바꾸기는 발행된 스냅샷을 대안에 넣고 고른다. 채택 저장은 기존 채택 버튼이다.
- 요청마다 epoch를 올린다. 취소, 입력 커밋, 계산 시작도 epoch를 올린다. 응답의 epoch가 현재와 다르면 고른 계획과 채택한 계획을 바꾸지 않는다. 같은 입력 다이제스트, 이전 스냅샷, 핀 집합은 명령을 한 번만 보낸다. 취소는 그 키를 잊어서 다음 요청이 다시 보낸다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 검색 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `searchCapabilities`만 실행 중인 검색 목록과 같게 고친다. `baseCapabilities`, `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 3이고, 이 노드는 저장소를 늘리지 않는다. 색은 기존 `primary-on-subtle`과 `warning-on-soft`다.

## 하지 않는 것

탐색으로 빈자리를 다시 채우기, 피드백 루프(z-feedback-reorganize), 구매·클라우드·사진, 다음 z-노드. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
