# SP-z-strategy-library — 생활습관 기반 전략과 Recipe 라이브러리

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-strategy-library만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-strategy-library](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

다섯 전략의 규칙과 순위 있는 배치안은 이미 있다. 없는 것은 사용자가 고른 전략에 묶인 Recipe 라이브러리다. 같은 배치를 다른 문장으로만 적은 대안은 다른 결과처럼 보이면 안 된다. 화면의 라디오를 옮겼다고 저장된 전략이 바뀌면 안 된다. 레시피가 받지 못하는 물건은 수량과 함께 미배정으로 남아야 한다. 구매 금지·한 동작 강제·고정 구역은 색·소재 취향과 같은 목록이면 안 된다.

## 결정

카탈로그와 평가는 Rust `strategy_library::evaluate`다. 라이브러리 버전은 `zari-strategy-library-1`이고 각 Recipe 버전은 1이다. 명령은 `evaluateStrategyLibrary`이고, 검색 엔진이 있을 때만 capability로 알린다. 순서는 `proposeStrategies` 다음, `startSearch` 앞이다. 응답은 `strategyLibraryEvaluated`다. 응답은 `PlanSnapshot` 해시에 들어가지 않고, 배치를 발행하지 않는다.

- 규칙 id와 사실 참조는 기존 `propose`의 `StrategyDecision`을 복사한다. 이 노드는 `decision.rs`와 탐색 순위를 바꾸지 않는다.
- 다섯 Recipe는 primitive, 물건이 속한 그룹, 접근 가정이 다르다. 최소 구매는 직접 배치·열린 박스·트레이·세로 파일과 두 꺼내기, 접근 `reuse_owned_before_new`다. 빈도 분리는 세로 파일이 없고 접근 `frequency_zone_soft`다. 활동 묶음은 최소 구매와 같은 primitive지만 접근 `declared_activity_partition`이다. 사용/보관 분리는 열린 박스·트레이와 용기를 꺼내는 방식만, 접근 `active_front_reserve_rear`다. 한 동작 접근은 직접 배치와 앞에서 바로 꺼내기만, 접근 `zero_other_container_moves`다.
- 결과 서명은 접근 코드, primitive, 꺼내기, 그룹·구역·물건, 우선순위다. 문장 키와 별칭 표시는 서명에 넣지 않는다. 최소 구매의 문장 별칭 `reason.min_purchase.wording_only`는 만든 뒤 뺀다. 접근 코드가 다르면 같은 primitive라도 남긴다. 같은 서명이면 저장된 전략의 별칭이 아닌 행을 남긴다.
- `pinned_strategy`는 `strategy_choice`의 복사다. `strategy_changed`는 항상 false다. 함수는 입력을 바꾸지 않는다.
- 미배정은 저장된 Recipe만 본다. 물건은 후보와 미배정 중 하나다. 묶음 없음, 구역을 정하지 못함, 수량 unknown, 수량 해당 없음, 레시피가 받지 않는 꺼내기, 한 동작 강제가 증명되지 않음은 미배정이다. unknown 수량에는 count가 없다. 후보 목록은 배치 완료가 아니다.
- 강제 제약은 구매 금지, 한 동작 강제, HardLocked 구역, 모형에 없는 안전 제한, 함께 두기, 구매 상한이다. 안전 제한은 통과가 아니다. 시각적 취향은 부드러운 구역, 부드러운 예산, 소재, 색, 시각 메모, 선호 순서다. 선호 순서는 저장된 전략을 바꾸지 않는다. 색이나 소재를 바꿔도 미배정 수량은 그대로다.
- 화면은 기존 계획 route의 라디오 아래다. 라디오는 초안이고, 저장된 입력이 다시 활성화되기 전에는 비교의 핀을 옮기지 않는다. 같은 저장 입력과 전략은 명령을 한 번만 보낸다. 실패는 캐시에서 빼고 자동으로 다시 보내지 않는다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 검색 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `searchCapabilities`만 실행 중인 검색 목록과 같게 고친다. `baseCapabilities`, `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 3이고, 이 노드는 저장소를 늘리지 않는다.

## 하지 않는 것

파레토 비교, 탐색 순위 변경, 구매·클라우드·사진, 다음 z-노드. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
