# SP-z-location-search — 내 물건 찾기와 정리 후 위치 검색

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-location-search만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-location-search](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

정리 결과가 채택 snapshot으로 끝나면 실제 생활에서 물건을 찾을 수 없다. 계획상 위치와 사용자가 확인한 실제 위치는 다른 사실인데, 실행 체크만으로 계획 위치를 실제 위치라고 단정하면 안 된다. 사용자가 재정리·분실·다른 곳 이동을 관측으로 남길 수단이 없고, 같은 이름의 다른 물건이나 부분 수량이 검색에서 합쳐지면 위치를 잘못 읽는다.

## 결정

프로젝트별 실제 위치 기록은 `LocationLog`다. 관측은 덧붙이는 사건이고 지우거나 고치지 않는다. 정본 계산은 Rust `apply_location_log`와 `search_locations`다. 명령은 `applyLocationLog`와 `queryLocationSearch`이고 capability는 `queryLocationSearch`가 `queryActionEligibility` 다음, `applyLocationLog`가 `applyInventoryLedger` 다음이다. 응답은 `locationLogApplied`와 `locationSearchQueried`다. 두 명령 모두 stateless이고 system identity로도 보낼 수 있다. 원장·검색 결과는 `PlanSnapshot`과 입력 digest에 들어가지 않는다.

- 관측 종류는 `confirm`, `relocate`, `reorganize`, `lost`, `alias`다. `confirm`은 "기록 당시 채택 계획 위치에 있다"는 사용자 진술이고 위치 글자를 받지 않는다. `relocate`와 `reorganize`는 사용자가 쓴 위치 글자를 요구한다. `lost`는 위치 미상 신고이고 위치 글자를 받지 않는다. `alias`는 물건의 다른 이름을 덧붙인다.
- `confirm`은 채택 snapshot이 있고 덮는 단위에 계획 위치가 하나라도 있을 때만 성공한다. 기록 당시 `planSnapshotId`를 Rust가 찍는다. 다른 snapshot으로 검색하면 그 확인은 `staleConfirmation`이고 실제 위치가 아니다. 완료 체크나 실행 진행은 실제 위치를 만들지 않는다.
- `unitOrdinals`가 비어 있으면 그 물건의 모든 단위(수량 미상이면 물건 단위)에 관측이 적용된다. 비어 있지 않으면 알려진 수량 안의 번호만 허용하고, 수량 미상은 `quantity_unknown`, 범위 밖은 `ordinal_out_of_range`, 중복은 `duplicate_ordinal`이다. `confirm`에 계획 없는 번호를 쓰면 `no_planned_location`이다.
- `alias`가 아닌 관측의 `label`은 입력 물건의 이름과 같아야 한다(`label_conflict`). `alias`의 `label`은 새 별칭이고 물건 이름·기존 별칭과 다르다(`duplicate_alias`). 위치·이름 글자는 NFC·길이 검사를 지나고 바뀐 바이트가 아니면 `invalid_label`이다.
- 검색 행은 `(itemId, 계획 위치, 관측 위치)` 결합으로 단위를 묶는다. 같은 이름의 다른 물건은 다른 행이다. 한 물건의 일부 수량만 다른 위치에 있으면 부분 행으로 나뉘고 합쳐지지 않는다. 상태는 `plannedOnly`, `confirmed`, `mismatch`, `observed`, `lost`, `unlocated`, `staleConfirmation`이다. `plannedOnly`는 실제 위치 주장이 아니다. 수량 라벨은 `QuantityLabel`의 `unknown`/`zero`/`count`를 그대로 쓰고 unknown을 0으로 승격하지 않는다.
- 검색은 물건 id·이름·별칭·분류·계획 용기 이름·관측 위치 글자에 부분 일치한다. 검색어가 수로 읽히면 알려진 수량과도 비교한다. 빈 검색어는 전체 목록이다. 행은 128개에서 자르고 `truncated`를 붙인다.
- 저장은 Dexie `locationLogs`다. live `DB_VERSION`은 4에서 5다. 업그레이드는 `migration:4->5` 일지만 쓰고 스냅샷·입력·원장·보유 라이브러리 바이트를 읽거나 다시 쓰지 않는다. 행의 schemaVersion은 1이다. exportVersion 1에는 위치 원장을 넣지 않는다. 프로젝트 삭제는 그 행을 같은 트랜잭션에서 지우고 검색 잔여 데이터를 남기지 않는다.
- 화면은 프로젝트 화면의 검색 패널이다. 프로젝트 Worker의 system identity로 두 명령을 보낸다. 두 번째 Worker를 만들지 않고 프로젝트 활성화를 바꾸지 않는다. 계획 위치는 채택 snapshot만 넘긴다. 작업 중 snapshot이 없으면 계획 열 없이 관측만 보인다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 명령과 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `baseCapabilities`만 실행 중인 목록과 같게 고친다. 그 계약의 `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 5다.

## 하지 않는 것

가족 공유·동기화, 클라우드 검색, 사진·실물 위치 추적, 관측 자동 추론(실행 완료·시간·위치 센서로 실제 위치 단정), 재고 원장 확장, 다음 z-노드. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
