# SP-z-inventory-lifecycle — 보유 물건·용기·수량의 생활 이력

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-inventory-lifecycle만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-inventory-lifecycle](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

보유 용기의 수량 Fact와 명시적 라이브러리 적용은 이미 있다. 개별 물건과 묶음, 수량 미상과 0, 빈 용기와 사용 중 용기, 구매·반품·이동·수량 수정의 이력은 없다. 그 이력을 `ProjectInput`이나 `PlanSnapshot`에 넣으면 기존 fixture와 스냅샷 바이트가 바뀐다. 과거 계획을 여는 일이 현재 재고를 다시 쓰면 안 된다.

## 결정

생활 이력은 프로젝트별 `InventoryLedger`다. 정본 계산은 Rust `apply_inventory`다. 명령은 `applyInventoryLedger`이고 capability는 `queryActionEligibility` 다음, `disposeProject` 앞이다. 응답은 `inventoryLedgerApplied`다. 원장은 `PlanSnapshot`과 입력 digest에 들어가지 않는다.

- 물건은 `individual` 또는 `bundle`이다. 용기는 `empty` 또는 `inUse`다.
- 수량 미상은 `Fact::Unknown`이고 값 필드가 없다. 알려진 0은 `value: 0`이다. 화면 문구는 Rust `QuantityLabel`의 `unknown` / `zero` / `count`만 따른다.
- 구매·반품·다른 위치로 이동·수량 수정은 덧붙이는 사건이다. 사건을 지우거나 옛 사건을 고치지 않는다.
- `conserve`는 한 용기의 단위 번호가 두 번이면 `owned_double_consume`이다. 가용 수량을 몰라도 중복은 실패다. 빈 용기를 쓰면 `empty_container_consumed`다. 이 판정은 성공 응답 안의 `fail`이며 원장을 저장하지 않는다.
- `openHistorical`은 다이제스트만 받는다. 스냅샷 바이트를 읽지 않고, 같은 원장을 `changed: false`로 돌려준다.
- 화면은 프로젝트 Worker의 system identity로 이 명령을 보낸다. 두 번째 Worker를 만들지 않고, 프로젝트 활성화를 바꾸지 않는다.
- 저장은 Dexie `inventoryLedgers`다. dbVersion은 2에서 3이다. 업그레이드는 `migration:2->3` 일지만 쓰고, 스냅샷·입력·보유 라이브러리 바이트를 읽거나 다시 쓰지 않는다. 행의 schemaVersion은 1이다. exportVersion 1에는 원장을 넣지 않는다. 프로젝트 삭제는 그 원장 행을 같은 트랜잭션에서 지운다.
- 기존 `qc:owned`도 같은 중복 규칙을 쓴다. 현재 124개 fixture에는 중복 단위 번호가 없다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 명령과 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `baseCapabilities`만 실행 중인 목록과 같게 고친다. 그 계약의 `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 3이다.

## 하지 않는 것

실상품 출처, 판매 묶음, 결제, 클라우드, 사진, 전략 라이브러리, 프로젝트 이식 묶음, 다음 z-노드. 구매 링크를 결제로 적지 않는다. 승인된 화면 baseline을 바꾸지 않는다.
