# ZARI — 원대한 제품 목표와 상세 실행 계획

2026-10-02 KST · 확대 계획 후보 / 이번 변경은 계획·문서만 작성

## 목표

측정·물건·생활습관에서 출발해 실제 상품과 무구매 대안을 함께 검증하고, 구매 준비·실행·물건 찾기·재정리까지 이어지는 local-first 정리 제품. 후속 세대는 다중 공간, 가족/전문가 협업, 공식 공급사 카탈로그와 선택적 고성능 계산까지 확장한다.

사용자 원문: “ZARI, film-unit-mv-studio, Kixprotocol, kixcommerce 전부 최대한 원대하고 .aiops/program.json 넣어줘”, 후속 “원대하고 자세히”. 기능 목록을 넘어 구현 범위·산출물·실패 검증·정확한 선행관계를 작성하라는 지시로 반영했다. 현재 대화는 계획 작성의 근거이며 미래의 모든 상품 정책·실환경 권한·릴리스 결정을 미리 승인한 기록으로 사용하지 않는다.

## 계획을 읽는 방법

- `.aiops/program.json`: schema-v1 형태의 로컬 작업 **36개**. 현재 pointer는 PENDING이므로 실행 입력으로 사용할 수 없다. 기존 16개 정의를 보존하고 20개를 추가했다.
- `docs/aiops/PENDING_NODES.json`: 외부 선행·새 계약·실환경 자격이 필요한 **9개**. 기존 0개를 보존하고 9개를 추가했다. 이 catalogue는 스케줄러가 실행하지 않는다.
- 전체 검토 분모: **45개**. Finance 등 같은 ID의 부분집합을 두 번 세지 않는다. 필요 없는 기능의 연기는 명시적인 범위 개정으로 기록하며 완료로 바꾸지 않는다.
- `docs/aiops/ZARI_PRODUCT_COMPLETION_PROGRAM_DRAFT.json`는 위 program과 바이트가 같은 비활성 원본이다. `REGISTRATION_SCOPE_DRAFT.json`은 전체 정의와 문서 해시를 묶는다.
- 기존 작업의 구현을 반복하는 계획이 아니다. 착수 시 현재 소스·증거와 대조해 이미 충족된 요구는 정확한 근거를 연결하고, 남은 gap만 구현한다. 기존 source/의미를 보존한 채 검증 없이 DONE 처리하지 않는다.

## 기준과 기존 등록 PR의 관계

- 관측 main: `0fd69ac4aa9d24adfe7de3e7c0d2a2cd6fba2dac`.
- 기존 시작 PR #39: `dbbf3d9b33602011065dc221732d4b0a2a2a85b3` / `aiops/register-program-20261002`. 이번 확대 후보는 그 위의 별도 draft PR이며 원래 시작 PR을 수정하지 않는다.
- 기존 [중앙 #57](https://github.com/BeautifulMind-JT/ai-ops-control-plane/issues/57)의 시작 범위·과거 감사는 새 정의에 승계되지 않는다. 원래 시작 PR을 선택할지 확대 범위로 대체할지는 검토 후 한 개의 채택 plan으로 정한다.
- 승인 전 program mirror를 운영 중인 기본 브랜치에 합치지 않는다. 확대 정의를 검토·채택한 뒤 시작 개정에서는 승인된 원본을 복사하고 approval_pointer만 정확한 결정으로 바꾼다. 기존 schema-v1 reader는 PENDING을 실제 거절한다.
- 이번 형식 검증에 사용한 중앙 소스: `a34a38b73f096c9f6597b38a111d95ca12ecd159`. source 읽기/검증 사실은 설치·호스트 자격·독립 감사가 아니다.

## 단계와 의존관계

| 작업 묶음 | 신규 작업 ID |
|---|---|
| 제품 확장 계약 | `z-product-contract` |
| 실물 입력과 상품 | `z-inventory-lifecycle`, `z-catalog-provenance`, `z-offer-bundles` |
| 컴파일과 대안 | `z-strategy-library`, `z-pareto-comparison`, `z-incremental-replan`, `z-search-diagnostics` |
| 일상 사용 완성 | `z-accessibility-workspace`, `z-portable-project`, `z-print-share` |
| 구매와 실행 | `z-purchase-handoff`, `z-execution-checklist` |
| 생활 피드백 | `z-location-search`, `z-feedback-reorganize` |
| 품질과 전달 | `z-performance-budget`, `z-privacy-offline`, `z-guided-onboarding`, `z-product-qualification`, `z-local-delivery` |
| 다음 제품 세대 | `z-multispace-contract`, `z-multispace-solver`, `z-primitive-expansion`, `z-photo-assistance`, `z-supplier-feeds`, `z-household-sync`, `z-professional-handoff`, `z-optional-native-analytics` |
| 출시와 운영 | `z-expanded-release` |

각 노드의 `depends_on`은 같은 레포의 정확한 ID를 가리킨다. pending의 `depends_on_external`은 producer/consumer의 정확한 repo·program·node를 가리킨다. 목록 순서를 실행 순서로 추정하지 않는다. 독립 branch는 선행이 충족되면 진행할 수 있지만 같은 task/checkout의 writer는 하나다.

외부 의존성이 충족되지 않은 노드를 “문서에 적어두었으니 실행 가능”으로 승격하지 않는다. reader가 채택되거나, 실제 외부 완료와 현재 producer tuple을 검토해 승인된 계획 개정을 만들 때까지 pending을 유지한다. 같은 레포의 미래 계약 노드도 명시된 승격 조건을 만족해야 한다.

## AIOPS가 자율적으로 진행할 범위

- 한 작업 소유자가 구현→테스트→실패 분석→수정→PR을 이어간다. 일상적 알고리즘·리팩터링·레이아웃 선택은 승인 계약 안에서 자율 결정한다.
- 독립 reviewer는 같은 HEAD의 실제 diff와 acceptance를 확인한다. 실패하면 같은 소유자에게 지적을 돌리고 변경 HEAD에서 다시 검토한다. 작성 세션은 자기 독립 감사 PASS를 발급하지 않는다.
- 작업별 실제 산출물과 검증 근거가 필요하다. 빈 모듈·고정 성공 응답·미연결 화면·테스트 대역만으로 실사용 완료를 선언하지 않는다.
- 계정 로그인/OS 권한/제공자 scope·중요 계약/실제 공개·릴리스처럼 사용자 권한이 필요한 결정만 질문한다. 기존 user_merge·A3·RELEASE를 일반 구현 질문으로 대체하지 않는다.
- 계획 노드 개수와 실제 비용·기간은 다르다. 정액 소요 기간·무제한 계정 사용·운영 성능을 약속하지 않는다. 사용량/외부 실행의 미확정 결과는 중복 제출하지 않는다.

## 공통 완료 판정

개발 delivery, 실제 기기/provider qualification, 사용자 화면/작품 수용, 운영 release를 분리한다. 각 근거는 해당 source·contract/profile·environment·artifact에 연결한다. 필요한 실제 환경이 없으면 UNQUALIFIED 또는 PENDING으로 남긴다. 계획 문서의 존재·PR 생성·합성 테스트 성공은 제품 완료가 아니다.

## 신규 작업 상세

### z-product-contract — 정리→구매→실행→재정리의 확장 계약

**배치:** schema-v1 로컬 후보 · **선행:** 012 · **검토:** A3/ARCHITECTURE

목표: 공간 작업대 16단계 뒤의 실제 사용 제품을 하나의 버전 체계로 확장한다.

작업 묶음: 제품 확장 계약

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 기존 구현과 새 요구의 기능별 차이·중복을 분류한다
2. 보유품/실상품/전략 비교/내보내기/재정리의 정본과 소유 경로를 정의한다
3. 새 DTO·migration·지원 범위·실측/외부 정보의 권위를 ADR로 고정한다

필수 산출물:
- 확장 ADR와 기존 16단계 대응표
- 버전 호환표와 변경 영향 fixture 목록

완료 판정/실패 검증:
1. 기존 16개 ID와 완료 증거를 재라벨링하지 않는다
2. 입력→Rust→snapshot→BOM→guide의 단일 연결을 추적할 수 있다
3. 새로운 사용자 결정과 승인된 내부 구현 선택이 구분된다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-inventory-lifecycle — 보유 물건·용기·수량의 생활 이력

**배치:** schema-v1 로컬 후보 · **선행:** z-product-contract · **검토:** A2/NONE

목표: 실제 물건을 잃거나 이중 배정하지 않고 정리 전후의 보유 상태를 관리한다.

작업 묶음: 실물 입력과 상품

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 개별/묶음 물건·미상 수량·빈 용기·사용 중 용기를 구분한다
2. 구매·반품·다른 위치로 이동·수량 수정의 입력 이력을 보존한다
3. 현 상태와 과거 snapshot의 참조를 분리한다

필수 산출물:
- Rust 수량 보존 규칙과 fixture
- 물건/용기 편집·사용 상태 UI와 저장 migration

완료 판정/실패 검증:
1. 여러 배치가 하나의 보유 용기를 중복 소비하지 않는다
2. 수량 미상과 0개가 다르게 저장·표시된다
3. 과거 계획을 열어도 현재 재고가 조용히 변경되지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-catalog-provenance — 실상품 출처·옵션·치수 검증 작업대

**배치:** schema-v1 로컬 후보 · **선행:** z-product-contract · **검토:** A2/NONE

목표: 합성 데모와 실제 상품을 분리하고 검증 가능한 상품 카탈로그를 관리한다.

작업 묶음: 실물 입력과 상품

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 브랜드/모델/옵션/판매처 식별과 외경·내경·돌출·하중 출처를 분리한다
2. 수동/CSV/JSON import에 행별 진단·중복 검토·격리 상태를 연결한다
3. 출처 URL·확인일·사진 근거·검증 범위·unknown을 보존한다

필수 산출물:
- 카탈로그 import 검토 화면과 Rust validator
- synthetic/verified/unverified 샘플 묶음

완료 판정/실패 검증:
1. 같은 상품의 다른 크기 옵션이 합쳐지지 않는다
2. 내경 없는 상품을 외경으로 채우지 않는다
3. 불완전 import가 기존 검증 카탈로그를 부분 덮어쓰지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-offer-bundles — 판매 묶음·필수 부품·배송비의 정직한 BOM

**배치:** schema-v1 로컬 후보 · **선행:** z-catalog-provenance, z-inventory-lifecycle · **검토:** A2/NONE

목표: 필요 개수와 판매 묶음 수를 구분하고 실제 확인된 비용만 합산한다.

작업 묶음: 실물 입력과 상품

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 용기/필수 부품/묶음당 수량과 보유 재사용을 계산한다
2. 판매처별 배송·재고·세금 포함 여부의 확인 상태를 표현한다
3. 구매 최소량·잉여 개수·품절 옵션 교체를 snapshot revision에 연결한다

필수 산출물:
- Rust 묶음 계산과 비용 breakdown
- 판매처 비교·미확인 금액 표시 UI

완료 판정/실패 검증:
1. 3개 필요/2개 묶음 사례에서 2묶음과 잔여 1개가 일치한다
2. 배송 미상은 무료로 합산되지 않는다
3. 옵션 교체 뒤 도면/BOM/guide가 같은 새 revision을 사용한다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-strategy-library — 생활습관 기반 전략과 Recipe 라이브러리

**배치:** schema-v1 로컬 후보 · **선행:** z-product-contract · **검토:** A2/NONE

목표: 최소 구매·빈도·활동·한 동작 접근이라는 실제 차이가 있는 대안을 만든다.

작업 묶음: 컴파일과 대안

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. ruleId와 입력 근거를 가진 전략을 구성한다
2. 강제 제약과 시각적 취향을 분리한다
3. 각 Recipe의 지원 primitive·물건 그룹·접근 가정을 정의한다

필수 산출물:
- versioned 전략/Recipe 데이터와 Rust 평가
- 전략 비교 설명 UI

완료 판정/실패 검증:
1. 같은 결과의 문구만 바꾼 대안을 중복 제거한다
2. 고정한 사용자 전략을 묵시적으로 바꾸지 않는다
3. 배치 불가 물건은 미배정 목록에 수량대로 남는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-pareto-comparison — 비용·재사용·접근·불확실성 대안 비교

**배치:** schema-v1 로컬 후보 · **선행:** z-strategy-library, z-offer-bundles · **검토:** A2/NONE

목표: 한 개의 임의 점수 대신 사용자가 설명 가능한 차이로 안을 선택한다.

작업 묶음: 컴파일과 대안

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 동일 입력과 예산에서 Pareto 후보와 결정적 동률 규칙을 사용한다
2. 구매비·재사용 수·선행 이동 수·미배정·unknown을 실제 값으로 표시한다
3. 지원 범위 안의 목표 변경에 대한 재계산을 연결한다

필수 산출물:
- Rust 대안 선택 read model
- 나란히 비교·차이 강조·조건 상세 UI

완료 판정/실패 검증:
1. 더 싼 안도 hard constraint 위반이면 제외된다
2. identical seed/budget에서 native와 WASM 후보 순서가 같다
3. 소진된 탐색 예산을 전역 최적해로 표시하지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-incremental-replan — 고정 배치를 지키는 부분 재정리

**배치:** schema-v1 로컬 후보 · **선행:** z-pareto-comparison · **검토:** A2/NONE

목표: 물건 하나가 늘거나 치수가 바뀌어도 유지할 부분을 사용자가 선택할 수 있다.

작업 묶음: 컴파일과 대안

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 고정한 배치·물건·전략을 명시적인 입력 제약으로 만든다
2. 변경 영향과 새 검증 필요 범위를 계산한다
3. 불가능해지면 최소 충돌 설명과 풀 수 있는 고정 조건을 제시한다

필수 산출물:
- Rust 부분 재계획 규칙과 fixtures
- 이전/새 계획 diff와 고정 해제 UI

완료 판정/실패 검증:
1. 고정 배치를 몰래 이동하지 않는다
2. 새 치수로 무효가 된 과거 pass를 재사용하지 않는다
3. 취소/늦은 응답이 채택한 계획을 바꾸지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-search-diagnostics — 해 없음·측정 부족·탐색 미완료의 구분

**배치:** schema-v1 로컬 후보 · **선행:** z-incremental-replan · **검토:** A2/NONE

목표: 사용자가 실패 이유와 다음으로 확인할 사실을 알 수 있게 한다.

작업 묶음: 컴파일과 대안

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 제품 없음/범위 밖 기하/확정 불가능/예산 소진을 분리한다
2. 차단 원인과 측정 query를 연결한다
3. 원래 입력·규칙·catalog·budget을 담은 재현 자료를 내보낸다

필수 산출물:
- 구조화 diagnostic과 지원 범위 표
- 실패 설명·다음 확인 화면

완료 판정/실패 검증:
1. unknown을 제품 없음으로 단정하지 않는다
2. 더 큰 예산 제안이 불가능성 증명으로 표시되지 않는다
3. 로그나 비밀정보 없이 동일 사례를 재현할 수 있다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-accessibility-workspace — 측정부터 실행까지 키보드·모바일 접근성

**배치:** schema-v1 로컬 후보 · **선행:** z-search-diagnostics, z-inventory-lifecycle · **검토:** A2/NONE

목표: 드래그를 못 쓰거나 작은 화면이어도 같은 핵심 작업을 끝낸다.

작업 묶음: 일상 사용 완성

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 숫자·키보드·터치의 동등한 편집 경로를 연결한다
2. 선택/focus/error/unknown의 의미를 시각·보조기술에 함께 전달한다
3. 저장 중·실패·취소·복구의 포커스와 입력 보존을 확인한다

필수 산출물:
- 반응형 핵심 화면과 접근성 수정
- 실제 브라우저 전체 여정 evidence

완료 판정/실패 검증:
1. 키보드만으로 생성→측정→계산→비교→채택→guide까지 완료한다
2. 320px/확대/고대비/reduced motion에서 필수 정보가 사라지지 않는다
3. 실제 기기 미검증을 데스크톱 에뮬레이션으로 대체 표기하지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-portable-project — 프로젝트 이식·검증된 가져오기

**배치:** schema-v1 로컬 후보 · **선행:** z-product-contract, z-inventory-lifecycle · **검토:** A2/NONE

목표: 사용자가 자신의 계획과 출처를 안전하게 보관하고 다른 기기로 옮긴다.

작업 묶음: 일상 사용 완성

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 프로젝트/관측/카탈로그/snapshot 첨부의 포함 범위를 선택한다
2. 해시·버전·크기 제한·중복 ID·구조 검증 후 원자적으로 가져온다
3. 사진 포함 여부·위치정보 제거·개인정보 삭제 정책을 명시한다

필수 산출물:
- portable bundle 계약에 따른 export/import
- 손상·구버전·대용량 거절 fixture와 UI

완료 판정/실패 검증:
1. 실패한 import가 정상 프로젝트를 덮어쓰지 않는다
2. 경로 이탈·압축 폭탄·미지원 버전을 거절한다
3. export→다른 빈 저장소 import 후 canonical snapshot이 같다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-purchase-handoff — 구매 링크·대체품 검토·구매 이후 연결

**배치:** schema-v1 로컬 후보 · **선행:** z-offer-bundles, z-pareto-comparison · **검토:** A2/NONE

목표: BOM에서 실제 확인 후 구매·재사용 실행으로 이어지게 한다.

작업 묶음: 구매와 실행

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 판매처 링크와 가격/재고 확인 시점·미확인 비용을 보여준다
2. 대체품은 동일성 가정 없이 Rust 재검증한다
3. 사용자 구매 확인과 물건 수령·실측·반품을 별개 사건으로 연결한다

필수 산출물:
- 판매처별 구매 준비 목록
- 구매/수령/실측 상태와 변경 영향 UI

완료 판정/실패 검증:
1. 외부 결제 완료를 링크 클릭만으로 기록하지 않는다
2. 재고 stale일 때 최신처럼 보이지 않는다
3. 광고/제휴가 적합성 판정을 바꾸지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-execution-checklist — 실행 체크리스트·막힘·되돌리기

**배치:** schema-v1 로컬 후보 · **선행:** z-purchase-handoff, z-incremental-replan · **검토:** A2/NONE

목표: 사용자가 실제로 물건을 옮기는 순서를 따라가고 막히면 다시 계획한다.

작업 묶음: 구매와 실행

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 기존 action DAG를 모바일 단계와 준비물·조건에 연결한다
2. 진행 표시와 물리 적합성 검증을 분리한다
3. 다른 물건 발견/부품 부족/실측 차이를 draft 수정으로 되돌린다

필수 산출물:
- 단계별 실행 UI와 진행 저장
- 중단·재개·계획 변경 시 진행 invalidation fixture

완료 판정/실패 검증:
1. 사용자가 완료 체크했다고 unknown 조건이 pass가 되지 않는다
2. 선행 blocker가 남은 위험한 단계를 완료 가능하게 보이지 않는다
3. 새 snapshot에 구계획 진행이 무조건 승계되지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-location-search — 내 물건 찾기와 정리 후 위치 검색

**배치:** schema-v1 로컬 후보 · **선행:** z-inventory-lifecycle, z-execution-checklist · **검토:** A2/NONE

목표: 정리 결과가 일회성 그림이 아니라 생활 속 물건 찾기에 쓰이게 한다.

작업 묶음: 생활 피드백

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 물건 이름/별칭/분류/수량·위치에 로컬 검색을 제공한다
2. 계획상 위치와 사용자가 확인한 실제 위치를 구분한다
3. 재정리·분실·다른 곳 이동을 관측으로 기록한다

필수 산출물:
- 로컬 위치 index와 검색 UI
- snapshot·실제 관측 불일치 fixtures

완료 판정/실패 검증:
1. 실행하지 않은 계획 위치를 실제 위치로 단정하지 않는다
2. 같은 이름의 다른 물건·부분 수량이 합쳐지지 않는다
3. 프로젝트 삭제 시 검색 잔여 데이터가 제거된다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-feedback-reorganize — 사용 피드백에서 다음 정리로 이어지는 루프

**배치:** schema-v1 로컬 후보 · **선행:** z-location-search, z-search-diagnostics · **검토:** A2/NONE

목표: 자주 꺼내는 물건과 불편한 동선을 반영해 더 나은 다음 안을 제안한다.

작업 묶음: 생활 피드백

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 접근 불편·빈도 변경·정리 유지 어려움을 사용자가 명시적으로 기록한다
2. 관측과 추천 규칙의 인과를 설명한다
3. 현재 계획을 보존한 채 대안 draft를 만든다

필수 산출물:
- 피드백 입력과 설명 가능한 재계획
- 기존/제안 계획 비교와 채택 흐름

완료 판정/실패 검증:
1. 피드백만으로 물건 폐기·구매를 자동 확정하지 않는다
2. 취소 시 현재 계획과 실제 위치가 보존된다
3. 새 입력·규칙·예산으로 재현 가능한 제안이다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-print-share — 도면·BOM·실행 가이드의 한 묶음 출력

**배치:** schema-v1 로컬 후보 · **선행:** z-execution-checklist, z-portable-project · **검토:** A2/NONE

목표: 가족이나 설치 담당자가 같은 계획의 근거를 보고 실행한다.

작업 묶음: 일상 사용 완성

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. PlanSnapshot ID·치수 단위·unknown·구매 조건을 모든 페이지에 연결한다
2. 인쇄/다운로드에 개인정보 포함 범위를 고른다
3. 긴 BOM·여러 도면·한글·페이지 나눔을 검증한다

필수 산출물:
- 인쇄 가능한 계획 패키지와 CSV
- export 재현 fixture와 실제 출력 검토

완료 판정/실패 검증:
1. 도면과 BOM의 revision이 다르면 출력이 차단된다
2. unknown과 미배정 물건이 출력에서 생략되지 않는다
3. CSV 수식·외부 링크가 실행 입력으로 변환되지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-performance-budget — 실측 성능 예산과 WASM 병목 개선

**배치:** schema-v1 로컬 후보 · **선행:** z-pareto-comparison, z-incremental-replan · **검토:** A2/NONE

목표: 실제 대기·취소·저장 비용을 줄이되 결정성과 검증 권위를 유지한다.

작업 묶음: 품질과 전달

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 기존 shortfall을 재측정하고 normalization/직렬화/Worker 왕복/탐색을 분리한다
2. 작은 변경의 불필요 복사와 재계산을 줄인다
3. 고정 작업 예산·fixture·환경별 측정 분모를 유지한다

필수 산출물:
- 전후 측정 보고서와 병목 개선
- native/실제 browser parity 회귀

완료 판정/실패 검증:
1. 벽시계 timeout과 deterministic budget 종료가 구분된다
2. 개선 전후 동일 기준 모드의 canonical 결과가 같다
3. 목표 미달과 실제 모바일 미측정을 숨기지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-privacy-offline — 오프라인 수명과 사용자 데이터 통제

**배치:** schema-v1 로컬 후보 · **선행:** z-portable-project, z-location-search · **검토:** A2/NONE

목표: 네트워크가 없어도 핵심 작업을 유지하고 데이터 소유권을 사용자가 행사한다.

작업 묶음: 품질과 전달

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 구버전 앱 캐시와 schema migration의 호환을 검사한다
2. 사진·검색·프로젝트의 삭제/내보내기 범위를 제공한다
3. 외부 연결이 필요한 동작과 완전 로컬 기능을 구분한다

필수 산출물:
- 오프라인/삭제/저장소 부족 시나리오
- 사용자 데이터 관리 화면

완료 판정/실패 검증:
1. 오프라인 방문·강제 종료 뒤 채택 snapshot이 손상되지 않는다
2. 저장소 부족을 저장 성공으로 표시하지 않는다
3. 외부 AI·analytics로 파일을 묵시 전송하지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-guided-onboarding — 처음 사용해도 완성하는 예제와 빈 화면

**배치:** schema-v1 로컬 후보 · **선행:** z-accessibility-workspace, z-purchase-handoff · **검토:** A2/NONE

목표: 빈 작업대에서 측정과 첫 결과까지 사용자가 길을 잃지 않게 한다.

작업 묶음: 품질과 전달

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 합성 예제와 실제 새 프로젝트 시작을 분리한다
2. 측정 순서·입력 예시·오류 수정·지원 범위를 단계별로 안내한다
3. 도움말에서 현재 문맥의 실제 필드로 이동한다

필수 산출물:
- 온보딩·예제 초기화·문맥 도움말
- 첫 사용 브라우저 시나리오

완료 판정/실패 검증:
1. 예제 상품이 실제 구매 가능한 상품처럼 보이지 않는다
2. 안내를 닫아도 입력이 보존된다
3. 과도한 측정을 먼저 요구하지 않고 필요한 사실 query와 연결된다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-product-qualification — 정리 제품 확장 전체 여정 qualification

**배치:** schema-v1 로컬 후보 · **선행:** 016, z-feedback-reorganize, z-print-share, z-performance-budget, z-privacy-offline, z-guided-onboarding · **검토:** A2/NONE

목표: 측정→실상품 검토→대안→구매 준비→실행→위치 검색→재정리를 한 번에 검증한다.

작업 묶음: 품질과 전달

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 충분/부족 측정·무구매·품절·오류 import·취소·다중 탭·미배정 시나리오를 실행한다
2. native/실제 WASM/저장/화면의 evidence tuple을 고정한다
3. 미완료 항목을 원래 분모 그대로 보고한다

필수 산출물:
- 전체 시나리오별 결과와 실제 기기 자격 표
- 사용자 검수용 계획 패키지

완료 판정/실패 검증:
1. 각 기능의 독립 테스트만으로 전체 여정 완료를 주장하지 않는다
2. 전 과정 같은 current snapshot을 사용한다
3. mock/합성/실상품/실기기 증거가 분리된다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-local-delivery — 설치·업데이트·사용 안내와 로컬 제품 인계

**배치:** schema-v1 로컬 후보 · **선행:** z-product-qualification · **검토:** A2/NONE

목표: 완성한 로컬 제품을 재현 가능한 설치·검수 단위로 전달한다.

작업 묶음: 품질과 전달

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 지원 브라우저/기기·빌드·업데이트·저장 migration 경로를 정리한다
2. 처음 설치와 기존 데이터 업데이트를 확인한다
3. 장기 미구현 기능과 실제 출시 범위를 구분한다

필수 산출물:
- 로컬 설치/검수 안내와 release candidate 묶음
- 기존 데이터 업그레이드 결과

완료 판정/실패 검증:
1. 업데이트 실패로 데이터가 지워지지 않는다
2. 16단계 기준+이번 확장 범위가 모두 추적된다
3. 공개 배포·화면 채택·release는 실제 별도 근거로만 표시된다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

### z-multispace-contract — 집·방·가구·구획의 다중 공간 계약

**배치:** pending catalogue · **선행:** z-product-contract, z-inventory-lifecycle · **검토:** A3/ARCHITECTURE

목표: 단일 구획에서 집 전체 정리로 확장할 데이터·권위·배정 모델을 정한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 공간 계층과 공유 물건/용기의 전역 수량을 정의한다
2. 공간 간 이동·접근 경로·지원 기하와 unsupported를 구분한다
3. 기존 단일 구획 데이터의 손실 없는 migration을 정의한다

필수 산출물:
- 다중 공간 ADR·타입·migration 설계
- 방 간 중복 배정·이동·unknown fixture 정의

완료 판정/실패 검증:
1. 같은 물건이 서로 다른 방에 중복 배정되지 않는다
2. 방 전체 3D와 실제 이동 경로를 구획 AABB 판정으로 대체하지 않는다
3. 단일 구획 모델과 이전 파일을 읽을 수 있다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-multispace-solver — 여러 공간의 전역 배정과 부분 탐색

**배치:** pending catalogue · **선행:** z-multispace-contract, z-incremental-replan · **검토:** A3/ARCHITECTURE

목표: 가정 전체의 수량·사용 빈도·공간 목적을 함께 고려해 배정한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 공간 간 배정과 공간 내부 검증을 계층화한다
2. 사용자 고정·전역 구매 예산·공간별 제약을 연결한다
3. 결정적 탐색 예산과 독립 수량/접근 validator를 구현한다

필수 산출물:
- Rust 다중 공간 solver/validator
- 전체집→구획 drill-down UI

완료 판정/실패 검증:
1. 예산 소진을 최적해로 표시하지 않는다
2. 부분 실패 공간 때문에 다른 물건이 사라지지 않는다
3. native/browser parity와 취소 후 입력 보존을 확인한다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-primitive-expansion — 서랍·칸막이·선반·벽 수납의 지원 프로파일

**배치:** pending catalogue · **선행:** z-multispace-contract, z-catalog-provenance · **검토:** A3/ARCHITECTURE

목표: 수납 방식별 물리적 요구를 검증한 경우에만 추천 범위를 넓힌다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. closedBin/drawerUnit/divider/shelfRiser별 열림·설치·지지 조건을 분리한다
2. 회전대/매달림/벽 시스템은 고정·하중 근거를 별도 프로파일로 둔다
3. 지원 불가 후보를 solver에서 제외한다

필수 산출물:
- primitive별 계약·검증 fixture·catalog 매핑
- 지원/미지원 이유 UI

완료 판정/실패 검증:
1. 치수 적합성이 안전 보증으로 표시되지 않는다
2. 부피 합만으로 내부 적재를 통과시키지 않는다
3. 실제 검증 없는 프로파일은 추천에 들어가지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-photo-assistance — 사진 보조 입력과 사용자 확인

**배치:** pending catalogue · **선행:** z-product-contract, z-privacy-offline · **검토:** A3/ARCHITECTURE

목표: 사진을 물건 분류·입력 보조에 쓰되 실측과 확인을 유지한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 로컬/외부 분석 방식과 동의·보존 정책을 먼저 결정한다
2. 모델 후보와 사용자 확인 사실을 분리한다
3. 실패·불확실성·지원 불가 결과를 수정 가능한 draft로 가져온다

필수 산출물:
- 사진 입력 보조 adapter 계약과 UI
- 동의 취소·추정 거절·오인식 fixture

완료 판정/실패 검증:
1. 사진 추정 치수가 확정 실측이 되지 않는다
2. 동의 전 외부 업로드가 없다
3. AI 출력이 Rust 검증을 우회하지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-supplier-feeds — 다중 브랜드·공급사 카탈로그 연결

**배치:** pending catalogue · **선행:** z-catalog-provenance, z-offer-bundles · **검토:** A3/ARCHITECTURE

목표: 공식 공급사 데이터와 판매처 정보를 추적 가능한 방식으로 연결한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 허가된 feed/API별 이용 범위·갱신·삭제·옵션 매핑을 정한다
2. 출처별 충돌·상품 단종·가격 stale을 처리한다
3. 자체 제품도 동일 Variant/Offer 모델로 수용한다

필수 산출물:
- 공급사 adapter·변경 검토 큐
- 출처 충돌/재고 stale/단종 fixture

완료 판정/실패 검증:
1. 무제한 크롤링이나 실시간 재고를 약속하지 않는다
2. 공급사 정보도 물리 검증 상태와 분리한다
3. 제휴/자체 상품의 노출이 적합성 조건을 낮추지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-household-sync — 가족 공유·기기 동기화의 명시적 권한

**배치:** pending catalogue · **선행:** z-portable-project, z-multispace-contract, z-privacy-offline · **검토:** A3/ARCHITECTURE

목표: 여러 가족·기기가 같은 정리 계획을 수정해도 소유권과 충돌을 설명한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. local-first와 선택적 sync의 권위·충돌·접근 범위를 ADR로 정한다
2. 사진·가정 위치·계정 탈퇴·초대 취소의 데이터 흐름을 정의한다
3. 오프라인 수정 병합과 채택 snapshot 보호를 검증한다

필수 산출물:
- 동기화/권한 ADR 및 구현
- 다기기 충돌·삭제·초대 철회 qualification

완료 판정/실패 검증:
1. 마지막 저장이 다른 가족의 채택안을 묵시 삭제하지 않는다
2. 철회한 접근권으로 새 데이터가 전달되지 않는다
3. cloud 부재에도 로컬 기능이 동작한다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-professional-handoff — 전문 정리 서비스·설치 담당자 협업

**배치:** pending catalogue · **선행:** z-household-sync, z-print-share, z-multispace-solver · **검토:** A3/ARCHITECTURE

목표: 집 전체 프로젝트를 전문 담당자와 검토하고 실행 증거를 인계한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 측정자/설계자/실행자/사용자별 권한을 구분한다
2. 의견·대안·실측 변경과 승인 snapshot을 연결한다
3. 비용 견적·개인정보 공개 범위·최종 인계를 버전 관리한다

필수 산출물:
- 역할별 협업 화면과 인계 패키지
- 실측 변경 후 재검수 여정

완료 판정/실패 검증:
1. 댓글이 물리 판정이나 사용자 승인을 대체하지 않는다
2. 다른 고객의 프로젝트가 섞이지 않는다
3. 작업별 현재 근거와 미완료가 추적된다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-optional-native-analytics — 선택적 대규모 카탈로그·네이티브 계산

**배치:** pending catalogue · **선행:** z-performance-budget, z-supplier-feeds · **검토:** A3/ARCHITECTURE

목표: 측정된 필요가 있을 때만 native 데이터 처리와 분석을 추가한다.

작업 묶음: 다음 제품 세대

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. DuckDB/Polars/native solver/GPU 후보를 동일 workload로 비교한다
2. 기본 WASM에서 선택 의존성을 분리한다
3. 결과 동일성 또는 별도 프로파일의 품질·비용·fallback을 명시한다

필수 산출물:
- 선택적 feature ADR와 실측 비교
- WASM/native 의존성 검사와 적합성 결과

완료 판정/실패 검증:
1. Python/CUDA/DB가 기본 웹 빌드에 요구되지 않는다
2. CPU 기준 없는 속도 주장을 하지 않는다
3. 변경된 병렬 탐색을 deterministic 기준 결과와 혼동하지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

### z-expanded-release — 확장 세대 전체 검수와 출시 결정 패키지

**배치:** pending catalogue · **선행:** z-local-delivery, z-multispace-solver, z-primitive-expansion, z-photo-assistance, z-supplier-feeds, z-household-sync, z-professional-handoff, z-optional-native-analytics · **검토:** A3/RELEASE

목표: 가정 전체 정리 플랫폼의 선택된 출시 범위를 실제 증거로 닫는다.

작업 묶음: 출시와 운영

설계 근거: docs/MASTER_PROMPT_KO.md §§7–14,24; docs/RUST_ADDENDUM_KO.md; docs/BLUEPRINT.md; docs/MEASUREMENT_COMPLETION_DESIGN_KO.md; docs/PRODUCT_COMPLETION_EVOLUTION_KO.md

구현 범위:
1. 범위별 기능/기기/실상품/보안/접근성/실사용 증거를 집계한다
2. 연기한 기능은 별도 scope revision으로 남긴다
3. 설치·지원·데이터 이동·운영 인계안을 검수한다

필수 산출물:
- 확장 전체 coverage와 현재 소스의 release 후보
- 사용자 검수·미해결 항목·운영 안내

완료 판정/실패 검증:
1. 부분 범위 출시를 전체 완성으로 표시하지 않는다
2. 보안·실상품·기기 미검증을 NOT_REQUIRED로 면제하지 않는다
3. 실제 출시 결정 없이 공개 활성화하지 않는다

공통 경계: Rust가 계산·수량·적합성의 단일 권위다. 동일 PlanSnapshot에서 도면/BOM/가이드를 만든다. unknown을 pass/0으로 승격하지 않는다. 기존 불변식과 보존 프롬프트를 바꾸지 않는다. 새 도메인 계약은 선행 ADR의 명시적 채택 후 구현한다. 실상품·사진·클라우드·구매 연결은 출처/동의/실제 검증을 분리한다.

증거/인계: 실제 변경 파일·실행 명령·성공 및 실패 사례·정확한 소스 SHA를 PR에 남긴다. 기존 충분한 coverage는 재사용하고 새 gap만 검증한다. UI 변경은 실제 브라우저의 정상/빈 값/오류/진행 중 화면과 키보드 동작을 확인한다. 실환경 부재는 미검증으로 남긴다. 독립 검토 지적과 CI 실패는 같은 소유자가 수정하고 변경 HEAD를 다시 검토한다. 일반 구현 선택은 자율 결정하며 계정·중요 계약·실사용 승인만 구체적인 결정을 요청한다.

승격 조건: 상세 계약 채택·정확한 소스의 독립 검토·범위별 실제 환경 자격 확인 뒤 계획 개정으로 승격한다. 이 항목은 pending catalogue이며 현재 schema-v1 dispatch 대상이 아니다. depends_on_external을 spec 문장으로 바꾸거나 삭제하여 우회하지 않는다.

## 전체 작업 색인

| ID | 작업 | 배치 | 선행 |
|---|---|---|---|
| 001 | 공통 Rust 공간 투영과 기존 도면 좌표 정합 | local candidate | 없음 |
| 002 | 측정·선택·검사 작업대 | local candidate | 001 |
| 003 | 평면 드래그와 동등한 숫자·키보드 편집 | local candidate | 002 |
| 004 | 실행 단계 focus와 accepted-progress 정합 | local candidate | 003 |
| 005 | 읽기 전용 구획 3D와 모든 뷰 선택 연동 | local candidate | 004 |
| 006 | 다섯 기능의 통합 품질·오프라인·성능 측정 | local candidate | 005 |
| 007 | 실제 화면 draft evidence와 승인 인계 | local candidate | 006 |
| 008 | 측정 완성 ADR와 typed 입력·Worker 계약 | local candidate | 007 |
| 009 | 오차·근거·v1 상세 사실 입력과 저장 통합 | local candidate | 008 |
| 010 | Rust 다음 확인 사실 query와 입력 안내 연결 | local candidate | 009 |
| 011 | 후속 측정 통합 검증과 새 draft capture 인계 | local candidate | 010 |
| 012 | 제품 완성 ADR: 실제 행동·조건·버전·평가 계약 | local candidate | 011 |
| 013 | Rust 실행 가이드 DAG와 unknown 조건·진행 guard | local candidate | 012 |
| 014 | 취소 가능한 독립 평가·원자적 snapshot publication | local candidate | 013 |
| 015 | 실측·offer·보유품·역사 계획·저장 복구 전체 lifecycle | local candidate | 014 |
| 016 | 전체 16단계 제품 qualification·새 화면·완료 인계 | local candidate | 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015 |
| z-product-contract | 정리→구매→실행→재정리의 확장 계약 | local candidate | 012 |
| z-inventory-lifecycle | 보유 물건·용기·수량의 생활 이력 | local candidate | z-product-contract |
| z-catalog-provenance | 실상품 출처·옵션·치수 검증 작업대 | local candidate | z-product-contract |
| z-offer-bundles | 판매 묶음·필수 부품·배송비의 정직한 BOM | local candidate | z-catalog-provenance, z-inventory-lifecycle |
| z-strategy-library | 생활습관 기반 전략과 Recipe 라이브러리 | local candidate | z-product-contract |
| z-pareto-comparison | 비용·재사용·접근·불확실성 대안 비교 | local candidate | z-strategy-library, z-offer-bundles |
| z-incremental-replan | 고정 배치를 지키는 부분 재정리 | local candidate | z-pareto-comparison |
| z-search-diagnostics | 해 없음·측정 부족·탐색 미완료의 구분 | local candidate | z-incremental-replan |
| z-accessibility-workspace | 측정부터 실행까지 키보드·모바일 접근성 | local candidate | z-search-diagnostics, z-inventory-lifecycle |
| z-portable-project | 프로젝트 이식·검증된 가져오기 | local candidate | z-product-contract, z-inventory-lifecycle |
| z-purchase-handoff | 구매 링크·대체품 검토·구매 이후 연결 | local candidate | z-offer-bundles, z-pareto-comparison |
| z-execution-checklist | 실행 체크리스트·막힘·되돌리기 | local candidate | z-purchase-handoff, z-incremental-replan |
| z-location-search | 내 물건 찾기와 정리 후 위치 검색 | local candidate | z-inventory-lifecycle, z-execution-checklist |
| z-feedback-reorganize | 사용 피드백에서 다음 정리로 이어지는 루프 | local candidate | z-location-search, z-search-diagnostics |
| z-print-share | 도면·BOM·실행 가이드의 한 묶음 출력 | local candidate | z-execution-checklist, z-portable-project |
| z-performance-budget | 실측 성능 예산과 WASM 병목 개선 | local candidate | z-pareto-comparison, z-incremental-replan |
| z-privacy-offline | 오프라인 수명과 사용자 데이터 통제 | local candidate | z-portable-project, z-location-search |
| z-guided-onboarding | 처음 사용해도 완성하는 예제와 빈 화면 | local candidate | z-accessibility-workspace, z-purchase-handoff |
| z-product-qualification | 정리 제품 확장 전체 여정 qualification | local candidate | 016, z-feedback-reorganize, z-print-share, z-performance-budget, z-privacy-offline, z-guided-onboarding |
| z-local-delivery | 설치·업데이트·사용 안내와 로컬 제품 인계 | local candidate | z-product-qualification |
| z-multispace-contract | 집·방·가구·구획의 다중 공간 계약 | pending | z-product-contract, z-inventory-lifecycle |
| z-multispace-solver | 여러 공간의 전역 배정과 부분 탐색 | pending | z-multispace-contract, z-incremental-replan |
| z-primitive-expansion | 서랍·칸막이·선반·벽 수납의 지원 프로파일 | pending | z-multispace-contract, z-catalog-provenance |
| z-photo-assistance | 사진 보조 입력과 사용자 확인 | pending | z-product-contract, z-privacy-offline |
| z-supplier-feeds | 다중 브랜드·공급사 카탈로그 연결 | pending | z-catalog-provenance, z-offer-bundles |
| z-household-sync | 가족 공유·기기 동기화의 명시적 권한 | pending | z-portable-project, z-multispace-contract, z-privacy-offline |
| z-professional-handoff | 전문 정리 서비스·설치 담당자 협업 | pending | z-household-sync, z-print-share, z-multispace-solver |
| z-optional-native-analytics | 선택적 대규모 카탈로그·네이티브 계산 | pending | z-performance-budget, z-supplier-feeds |
| z-expanded-release | 확장 세대 전체 검수와 출시 결정 패키지 | pending | z-local-delivery, z-multispace-solver, z-primitive-expansion, z-photo-assistance, z-supplier-feeds, z-household-sync, z-professional-handoff, z-optional-native-analytics |

## 계획 검증 명령

이 검사는 계획의 구조와 해시를 확인한다. 제품 구현 테스트·독립 A3·실제 실행 자격을 대신하지 않는다.

```bash
python3 scripts/validate_program_expansion.py
# 네 레포의 이번 확대 후보를 같은 상위 디렉터리에 checkout한 경우
python3 scripts/validate_program_expansion.py --workspace /path/to/sibling-repositories
```

JSON 중복 key·ID 충돌·잘못된 선행·순환·전체 정의 해시·정본 mirror·문서 해시·Finance alias를 검사한다. 전체 workspace 검사는 외부 선행의 실제 ID와 네 레포 결합 DAG까지 확인한다. 작업 완료 사실이나 외부 승인 여부를 자동 추정하지 않는다.

