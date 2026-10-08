# SP-z-offer-bundles — 판매 묶음·필수 부품·배송비의 정직한 BOM

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-offer-bundles만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-offer-bundles](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

필요 개수와 판매 묶음 수가 같으면 안 된다. 배송비를 모르는데 무료로 더하면 합계가 거짓이 된다. 뚜껑·칸막이처럼 세트에 포함된 부품을 한 번 더 사면 이중 청구다. 품절 옵션을 바꾸면 도면, BOM, 실행 가이드가 서로 다른 revision을 보면 안 된다. 이 계산을 `PlanSnapshot`이나 `Offer`에 넣으면 기존 fixture와 스냅샷 바이트가 바뀐다.

## 결정

묶음과 확인된 비용은 Rust `quote_offer_bundle`이다. 명령은 `quoteOfferBundle`이고 capability는 `reviewCatalogImport` 다음, `disposeProject` 앞이다. 응답은 `offerBundleQuoted`다. 응답은 `PlanSnapshot` 해시에 들어가지 않는다.

- 필요 3개, 묶음 2개, 보유 재사용 0이면 주문 묶음 2, 공급 4, 잔여 1이다. 빈 수량은 unknown이고 0이 아니다. 묶음 수량 0은 거절한다.
- 판매처 배송비는 그 판매처에서 한 번만 더한다. 확인된 무료는 금액 0과 상태 `free`다. 미확인, 복잡한 조건, 같은 판매처의 서로 다른 금액은 합계에 넣지 않는다.
- 세트에 포함된 필수 부품은 행으로 보이되 상품 소계에 다시 넣지 않는다. 보유 재사용은 구매하지 않는다.
- 구매 최소 묶음이 있으면 필요 개수보다 적어도 그 묶음 수만큼 주문한다.
- 세금 포함 여부는 견적 요청의 판매처 메모다. `Offer`에는 세금 칸이 없다. 메모가 없으면 세금은 unknown이고 총액은 unknown이다. 별도 세금의 금액이 없으면 0원 세금 줄로 만들지 않는다.
- 미리보기의 `boundRevision`은 null이고 스냅샷을 발행하지 않는다. 스냅샷 견적은 그 스냅샷 id를 `boundRevision`으로 돌려주고 스냅샷을 다시 쓰지 않는다.
- 품절 교체 후보는 그 스냅샷 id에 묶인다. 적용은 기존 `LayoutEditCommand::SelectOffer`다. 도면 스탬프, BOM, 가이드는 그 새 스냅샷 하나를 쓴다.
- 화면은 프로젝트 Worker의 system identity로 이 명령을 보낸다. 두 번째 Worker를 만들지 않는다. 같은 스냅샷 id는 한 번만 보내고, 실패를 자동으로 다시 보내지 않는다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 명령과 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `baseCapabilities`만 실행 중인 목록과 같게 고친다. 그 계약의 `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 3이고, 이 노드는 저장소를 늘리지 않는다.

발행된 BOM의 `CostSummary`는 그대로다. 그 합계는 판매처 고정 배송비를 줄마다 더할 수 있다. 이 견적은 판매처마다 한 번만 더하므로, 한 판매처의 상품이 둘이면 견적 배송비가 스냅샷 배송비와 다를 수 있다. 스냅샷 표를 견적 숫자로 바꾸지 않는다.

## 하지 않는 것

결제, 장바구니, 실시간 재고, 클라우드, 사진, 전략 라이브러리, 다음 z-노드. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
