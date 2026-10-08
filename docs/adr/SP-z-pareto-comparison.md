# SP-z-pareto-comparison — 비용·재사용·접근·불확실성 대안 비교

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-pareto-comparison만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-pareto-comparison](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

순위 있는 배치안은 이미 한 입력과 한 예산에서 나온다. 없는 것은 사용자가 점수 없이 차이를 보고 고르는 읽기 모형이다. 더 싼 안이 강제 제약을 어겨도 앞에 남으면 안 된다. 가격·이동·수량이 미확인인데 0으로 보이면 안 된다. 탐색 예산을 다 쓴 결과를 전역 최적해라고 하면 안 된다.

## 결정

비교는 Rust `pareto::compare`다. 읽기 모형 버전은 `zari-pareto-1`이다. 명령은 `comparePareto`이고, 검색 엔진이 있을 때만 capability로 알린다. 순서는 `cancelSearch` 다음이다. `evaluateStrategyLibrary`는 `proposeStrategies` 다음, `startSearch` 앞에 그대로 둔다. 응답은 `paretoCompared`다. 응답은 `PlanSnapshot` 해시에 들어가지 않고, 배치를 발행하지 않으며, 탐색 순위를 바꾸지 않는다.

- 같은 입력 다이제스트, 같은 예산, 같은 시드, 같은 저장된 전략만 한 비교다. 하나라도 다르면 앞은 비고 `recalculation_required`다. `global_optimum`은 항상 false다.
- 물리 거절이나 blocking fail은 Pareto 앞에 들어오기 전에 `hard_constraint`로 빠진다. 더 싼 금액이 그 제외를 되돌리지 않는다.
- 축은 미배정 수, 수량 미확인 물건 수, 미확인 조건 수, 선행 이동, 구매비, 재사용이다. 재사용만 클수록 낫다. 구매의 해당 없음은 구매 없음이고 비교에서는 0과 같게 두되, 화면 문구는 구매 없음이다. 미확인은 0이 아니고, 미확인이 있는 축으로는 지배하지 않는다.
- 동률은 빼지 않는다. 표시 순서는 미배정, 수량 미확인, 미확인 조건, 알려진 이동, 알려진 구매, 재사용이 큰 순, 스냅샷 id다. 미확인 이동은 알려진 이동 뒤다.
- 선행 이동은 접근 검사의 `blockerCount`다. 검사가 없거나, 상태가 미확인·실패이거나, 통과인데 횟수가 없으면 미확인이다. 저장만 된 횟수를 미확인 상태에서 쓰지 않는다.
- 재사용은 BOM이 있으면 `reused`의 합이다. BOM이 비어 있으면 보유 용기 배치 수다. 둘 다 알려진 수다.
- 소진된 예산의 최적성 문구는 `budgetLimited`다. 범위를 다 본 경우는 `scopeCompared`다. 어느 쪽도 전역 최적해가 아니다.
- 화면은 계획 route의 후보 목록 옆이다. 차이 칸은 글자 `다름`과 기존 `primary-on-subtle` 쌍이다. 제외는 기존 `warning-on-soft` 쌍이다. 초안 라디오는 명령을 다시 보내지 않는다. `이 목표로 다시 계산`만 저장되지 않은 목표를 확정한 뒤 기존 계산을 시작한다. 같은 키는 명령을 한 번만 보낸다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 검색 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `searchCapabilities`만 실행 중인 검색 목록과 같게 고친다. `baseCapabilities`, `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 3이고, 이 노드는 저장소를 늘리지 않는다.

## 하지 않는 것

탐색 순위 변경, 증분 재계획, 구매·클라우드·사진, 다음 z-노드. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
