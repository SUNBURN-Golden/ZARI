# SP-z-search-diagnostics — 해 없음·측정 부족·탐색 미완료의 구분

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-search-diagnostics만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-search-diagnostics](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

## 문제

탐색이 계획을 내지 못하거나 중간에 멈추면, 사용자는 제품이 없는지, 알려진 크기가 지원 범위 밖인지, 측정이 없어 확정할 수 없는지, 예산이 다 됐는지를 구분해야 한다. 알 수 없는 측정을 제품 없음으로 단정하면 안 된다. 더 큰 예산 제안을 해가 없다는 증명으로 보이면 안 된다. 같은 사례는 로그나 비밀 없이 다시 분류할 수 있어야 한다.

## 결정

구분은 Rust `search_diagnostics::diagnose_search`다. 읽기 모형 버전은 `zari-search-diagnostics-1`이다. 명령은 `diagnoseSearch`이고, 검색 엔진이 있을 때만 capability로 알린다. 순서는 `replanIncremental` 다음이다. `replanIncremental`은 `comparePareto` 다음에 그대로 둔다. 응답은 `searchDiagnosed`다. 응답의 읽기 모형은 `PlanSnapshot` 해시에 들어가지 않는다. 명령은 탐색을 시작하지 않고, 순위를 바꾸지 않으며, 계획을 채택하지 않고, `selectedId`를 바꾸지 않는다.

- 다섯 구분은 항상 같은 순서로 나온다. `noProduct`, `geometryOutOfRange`, `undetermined`, `budgetExhausted`, `searchNotFinished`다.
- `noProduct`는 제품 미상 신호가 없고, 종료가 `scopeComplete`이며, 관찰된 대안이 없고, 물건이 있으며, 알려진 용기(직접 배치가 아닌 variant의 알려진 외경과 손잡이, 또는 알려진 외경과 손잡이의 보유 용기)가 없을 때만 해당한다. 이유는 `catalog_empty`다. 측정 미상은 카탈로그가 비어 있어도 `noProduct`를 막는다.
- 제품 미상은 공간 내부 치수 미상, 물건 수량 미상, 물건 외곽 미상, 비직접 variant의 외경·손잡이 미상, 보유 용기의 외경·손잡이 미상, 범위 제한과 진단 후보의 `catalog_data_unknown`·`owned_geometry_unknown`·`owned_availability_unknown`·`geometry_unknown`·`measurement_missing`·`quantity_unknown`, blocking `unknown` 검사다. 이 신호는 `undetermined`다.
- 범위 밖 기하는 알려진 물건 외곽이 `Upright0`과 `Upright90` 모두에서 공간을 넘을 때 `envelope_exceeds_space`다. `no_feasible_anchor`와 `unsupported_geometry`, 그리고 blocking fail인 외경·내경·설치 경로·지지·방향 검사도 기하로 둔다. 축이 미상이면 맞춤 검사를 건너뛰고 `undetermined`로 남긴다.
- `provesImpossible`과 `budgetSuggestionIsProof`는 항상 false다. `largerBudgetSuggested`는 종료가 `budgetExhausted`이고 관찰된 대안이 없을 때만 true다. 대안이 있으면 예산 소진은 “탐색 한도 안에서 찾은 안”이고, 더 큰 예산은 불가능의 증명이 아니다. 예산 소진은 `searchNotFinished`가 아니다. 취소와 중단만 탐색 미완료다.
- 지원 범위는 `rectangular_floor_anchor`가 `finiteNotComplete`다. 쌓기, 임의 형상, 넣으면서 회전은 `outsideModel`이다. `search_budget`은 종료에 따라 `exhausted`, `inScope`, `notClaimed`다. 유한한 앵커 가족은 완전성 증명이 아니다.
- 다음에 확인할 사실은 입력만으로 `query_next_facts`가 내는 측정 질문이다. `MissingEvidence`는 빼서, 알려진 사실의 증거 도장 없음이 확정 불가가 되지 않게 한다. 기하 blocking fail은 그 사실 키와 연결한다. 대안 8개, 진단 후보 128개, 검사 256개, 다음 확인 64개를 넘으면 자르거나 `input_limit_exceeded`다.
- 재현 자료는 현재 `ruleVersion`, schema, canonical, solver 버전, 입력 다이제스트와 `ProjectInput`, 카탈로그 다이제스트와 `CatalogContent`, 예산, 프로필, 시드, 종료, 범위, 소비량, 진단 후보, 압축한 관찰이다. 전체 스냅샷, 로그, 세션, 요청 id, 사진, 소요 시간은 넣지 않는다. `diagnose_case`는 다이제스트·규칙·예산을 다시 검사하고 같은 구분 플래그를 낸다. 다른 입력의 대안은 `stale_result`다. 범위의 예산·프로필이 입력과 다르면 `budget_mismatch`다.
- 활성 프로젝트가 없으면 `invalid_state`다. 검색 엔진이 없으면 `operation_not_supported`다. 빈 페이로드나 여분 필드는 `invalid_input`이다.
- 화면은 계획 route에서 탐색 상태 다음, 후보 앞이다. 계산이 끝나면 한 번 구분한다. 같은 입력·카탈로그·종료·소비량·이유·스냅샷·제한은 명령을 한 번만 보낸다. 다시 구분은 그 키를 잊고 한 번 더 보낸다. 취소는 대기 중일 때만 epoch를 올리고, 늦은 응답은 `diagnosticIgnored`만 올린다. 고른 계획은 그대로다. 내보내기는 응답의 재현 자료를 파일로 받으며 명령을 다시 보내지 않는다. 취소·중단은 이전 범위를 재사용하지 않고, 저장된 입력의 프로필·예산과 빈 제한으로 구분한다.

`BUILD_ID`는 `zari-domain-7`로 둔다. 검색 capability가 늘었으므로 버전 표는 보통 build id를 올리지만, 그 변경은 124개 fixture의 `engineContext.buildId`를 다시 쓴다. 이 노드는 그 바이트를 유지하고, 페이지와 Worker가 capability 순서와 길이로 서로 거절하게 둔다. `docs/product-expansion/contract.json`의 `searchCapabilities`만 실행 중인 검색 목록과 같게 고친다. `baseCapabilities`, `dbVersion` 2, `implementsNow: false`, `contractChange: NO`는 z-product-contract 잠금으로 남긴다. 살아 있는 DB version은 3이고, 이 노드는 저장소를 늘리지 않는다. 색은 기존 `primary-on-subtle`과 `warning-on-soft`다.

## 하지 않는 것

탐색을 다시 시작하기, 순위를 바꾸기, 접근성 workspace(z-accessibility-workspace)와 그 뒤 노드, 구매·클라우드·사진, 예산 편집기. 승인된 화면 baseline을 바꾸지 않는다. 기존 fixture 기대 바이트를 바꾸지 않는다.
