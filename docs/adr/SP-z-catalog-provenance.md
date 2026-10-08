# SP-z-catalog-provenance — 실상품 출처·옵션·치수 검증 작업대

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-catalog-provenance만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-catalog-provenance](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

카탈로그에는 이미 `synthetic`과 `imported`, 외경과 내경, `validateCatalog`가 있다. 브랜드·모델·옵션·판매처의 출처와 외경·내경·돌출·하중의 출처가 한 근거로 붙고, 같은 옵션의 다른 크기를 검토 없이 합칠 수 있으며, 일부 행만 맞아도 그 행이 기존 카탈로그를 고칠 수 있다. 가져오기만으로 `Confirmed`가 되면 안 된다.

## 결정

검토는 `CatalogSnapshot` 밖의 `reviewCatalogImport`다. 명령은 `applyInventoryLedger` 다음, `disposeProject` 앞이다. 응답은 `catalogImportReviewed`다. 배치는 `PlanSnapshot`과 카탈로그 digest에 들어가지 않는다.

- 출처 범위는 `brand`, `model`, `option`, `seller`, `outer`, `inner`, `protrusion`, `load`다. 사실의 evidence id는 그 범위의 근거만 가리킨다.
- 같은 상품 ID의 다른 옵션 ID는 두 변형으로 남는다. 같은 옵션 ID인데 크기가 다르면 두 행 모두 `option_not_merged`로 격리하고 합치지 않는다.
- 내경 글자가 비어 있으면 그 축은 `unknown`이다. 외경 숫자를 복사하지 않는다.
- 한 행이라도 격리이거나 묶음 코드가 있으면 `snapshot`은 null이다. 준비된 행만 골라 기존 digest를 고치지 않는다. `existingUntouched`는 참이다.
- `verificationScope: verified`는 기록이다. 사실의 `verification`은 `unverified`로 남는다. 가져오기가 `Confirmed`를 만들지 않는다.
- 사진 값이 `data:`, `javascript:`, `file:`, `base64,`이면 `photo_bytes_refused`다. 파일 이름은 출처 메모에 남는다.
- 샘플 묶음은 `synthetic`, `verified`, `unverified`다. 합성은 `sourceKind: synthetic`이고 구매 URL이 없다. 검증·미확인 샘플의 저장 `sourceKind`는 `imported`다. 새 저장 enum은 두지 않는다. 상품 계약의 `catalogSourceKinds`는 `synthetic`, `imported`로 남는다.
- 화면은 `#/catalog`의 검토 패널이다. 저장은 Rust가 snapshot을 돌려준 뒤의 `putCatalog`다. 같은 digest의 다른 본문은 기존처럼 거절한다.
- `BUILD_ID`는 `zari-domain-7`이다. 124개 fixture 기대 바이트는 바꾸지 않는다. dbVersion은 3으로 남는다. exportVersion 1은 바꾸지 않는다.

## 하지 않는 것

결제, 원격 상품 조회, 사진 바이트 저장, 클라우드, 전략 라이브러리, 프로젝트 이식 묶음, 다음 z-노드. 승인된 화면 baseline을 바꾸지 않는다.
