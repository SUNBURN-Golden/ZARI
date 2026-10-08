# SP-z-product-contract — 정리→구매→실행→재정리의 확장 계약

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-product-contract만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-product-contract](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시가 아니다.

계약 변경은 없다 (`contract_change=NO`). `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, profile 1의 `zari-solver-v1`, profile 2의 `zari-solver-v2`, schema 1, canonical 1, protocol 1, DB version 2, exportVersion 1, Command, capability는 유지한다. 기계가 읽는 표는 [docs/product-expansion/contract.json](../product-expansion/contract.json)이다. 그 파일은 엔진 출력이 아니다.

## 문제

공간 작업대 16단계 뒤에 보유품, 실상품, 전략 비교, 내보내기, 재정리가 남아 있다. 그 일부는 이미 Rust 스냅샷과 로컬 저장에 있다. 있는 경로를 새 이름으로 다시 만들면 001–016의 ID와 완료 증거가 다른 작업처럼 보인다. 없는 경로를 이 노드에서 생산 코드로 넣으면, 선행 계약 없이 DTO와 migration과 외부 관측의 권위가 갈라진다.

## 1. 기존 16단계 대응

분모 문서는 [docs/qualification/denominator.json](../qualification/denominator.json)이다. 이 노드는 그 ID, 제목, 증거 경로를 바꾸지 않는다. 확장 단계가 그 16개의 새 라벨이 아니다. `expansionOwns`는 전부 거짓이다.

| ID | 제목 | 이 계약 |
|---|---|---|
| 001 | 공통 Rust 공간 투영과 기존 도면 좌표 정합 | 증거 `docs/evidence/ZARI-SPATIAL-001.md`를 유지한다 |
| 002 | 측정·선택·검사 작업대 | 증거 `docs/evidence/ZARI-SPATIAL-002.md`를 유지한다 |
| 003 | 평면 드래그와 동등한 숫자·키보드 편집 | 증거 `docs/evidence/ZARI-SPATIAL-003.md`를 유지한다 |
| 004 | 실행 단계 focus와 accepted-progress 정합 | 증거 `docs/evidence/ZARI-SPATIAL-004.md`를 유지한다 |
| 005 | 읽기 전용 구획 3D와 모든 뷰 선택 연동 | 증거 `docs/evidence/ZARI-SPATIAL-005.md`를 유지한다 |
| 006 | 다섯 기능의 통합 품질·오프라인·성능 측정 | 증거 `docs/evidence/ZARI-SPATIAL-006.md`를 유지한다 |
| 007 | 실제 화면 draft evidence와 승인 인계 | 증거 `docs/evidence/ZARI-SPATIAL-007.md`를 유지한다 |
| 008 | 측정 완성 ADR와 typed 입력·Worker 계약 | 증거 `docs/evidence/ZARI-SPATIAL-008.md`를 유지한다 |
| 009 | 오차·근거·v1 상세 사실 입력과 저장 | 증거 `docs/evidence/ZARI-SPATIAL-009.md`를 유지한다 |
| 010 | Rust 다음 확인 사실 query와 입력 안내 | 증거 `docs/evidence/ZARI-SPATIAL-010.md`를 유지한다 |
| 011 | 후속 측정 통합 검증과 새 draft capture | 증거 `docs/evidence/ZARI-SPATIAL-011.md`를 유지한다 |
| 012 | 행동·조건·버전·평가 계약 | 증거 `docs/evidence/ZARI-SPATIAL-012.md`를 유지한다 |
| 013 | 실행 가이드 DAG와 unknown 조건·진행 guard | 증거 `docs/evidence/ZARI-SPATIAL-013.md`를 유지한다 |
| 014 | 취소 가능한 독립 평가와 원자적 발행 | 증거 `docs/evidence/ZARI-SPATIAL-014.md`를 유지한다 |
| 015 | 실측·offer·보유품·역사 계획·저장 복구 lifecycle | 증거 `docs/evidence/ZARI-SPATIAL-015.md`를 유지한다 |
| 016 | 전체 16단계 제품 qualification·새 화면·완료 인계 | 증거 `docs/evidence/ZARI-SPATIAL-016.md`를 유지한다 |

001–007은 공간, 008–011은 측정, 012–016은 제품 완성이다. 합은 16이다. 머지된 노드를 `DONE`으로 올리거나 검토 포인터를 만들지 않는다.

## 2. 이미 있는 것과 빈칸

| 능력 | 정본 | 겹침 | 빈칸 | 소유 |
|---|---|---|---|---|
| 보유품 | `OwnedContainer` | 수량 Fact, 스냅샷 값 복사, 명시적 라이브러리 적용, 단위 한 번 소비 | 구매·반품·이동·수량 수정의 사건 이력. 물건 행과 빈 용기 상태는 없다 | z-inventory-lifecycle |
| 실상품 | `CatalogSnapshot` | `synthetic`/`imported`, 외경·내경 분리, provenance, `validateCatalog`, 빈 카탈로그 `empty-real` | verified 출처 kind, CSV 행 진단, 사진을 카탈로그 사실로 쓰는 경로 | z-catalog-provenance |
| 전략 비교 | `Strategy`, `StrategyDecision` | 다섯 전략, rule id와 fact ref, `proposeStrategies`, 순위 있는 대안 | Pareto 읽기 모델, 사용자 Recipe 라이브러리 | z-strategy-library, 이어서 z-pareto-comparison |
| 내보내기 | exportVersion 1 | JSON, 빠진 사진의 이름, Rust 확인 뒤 원자적 가져오기, 복제 시 진행 초기화 | 선택 묶음, zip, 경로 이탈과 압축 폭탄 거절 | z-portable-project |
| 재정리 | `evaluate_candidate` | 명시적 재계산의 새 스냅샷, 진행 비승계, 잠긴 구역 | 고정 배치의 부분 재계획, 현재 계획을 둔 피드백 초안 | z-incremental-replan, 이어서 z-feedback-reorganize |

이 다섯은 `implementsNow: false`다. 구매 링크를 결제로 적는 일은 z-purchase-handoff에 둔다. 이 노드는 그 화면을 만들지 않는다.

## 3. 정본과 소유 경로

보유 용기의 계산 정본은 프로젝트 입력의 `OwnedContainer`다. 물리 치수는 값으로 복사되어 이후 카탈로그 수정이 옛 사실을 바꾸지 못한다. 전역 라이브러리는 예약이 아니다. 프로젝트 사본에 넣는 일은 명시 버튼이다. 과거 `PlanSnapshot`은 그 시점의 참조를 유지한다. 사건 이력이 필요하면 z-inventory-lifecycle가 이 정본 위에 추가한다.

실상품의 정본은 `CatalogSnapshot`의 digest다. 상품 없는 카탈로그는 상품을 만들지 않는다. 외경으로 내경을 채우지 않는다. 가져오기는 `validateCatalog`다. 행 진단과 검증 상태의 작업대는 z-catalog-provenance가 만든다.

전략의 정본은 Rust `Strategy`와 그 `StrategyDecision`이다. 비교 문장은 그 결정의 rule id와 fact ref에서 온다. 순위 있는 대안은 같은 입력과 예산의 `PlanSnapshot` 목록이다. 문구만 다른 복제나 한 개의 임의 점수는 정본이 아니다. Pareto 축은 z-pareto-comparison 전이다.

내보내기의 정본은 `apps/web/src/persistence/export.ts`의 exportVersion 1이다. 가져오기와 복제는 Rust `verifyRecord` 뒤에 한 트랜잭션이다. 사진 바이트는 JSON에 없고 `excluded`에 이름이 남는다. 이식 묶음의 포함 범위는 z-portable-project가 고른다.

재정리의 정본은 새 `PlanSnapshot`이다. 입력이나 배치를 명시적으로 바꾼 뒤 `evaluate_candidate`가 BOM과 가이드를 같이 만든다. 옛 스냅샷의 바이트와 진행은 그 binding에 남는다. 고정 배치를 제약으로 넣는 규칙은 z-incremental-replan이다.

## 4. 권위

새 DTO는 이 노드에 없다. 이후 노드가 직렬화 필드를 더하면 Rust 선언으로 두고 생성기로 계약을 만든다. 생성 파일을 손으로 고치지 않는다.

migration은 실행하지 않는다. schemaVersion 1과 dbVersion 2가 현재다. JSON 모양이 바뀌는 노드만, 그 노드의 채택 기록 뒤에, 시험된 migration을 둔다. 옛 스냅샷 바이트를 새 엔진 결과로 덮어쓰지 않는다.

지원 범위는 지금의 v1이다. primitive는 `directPlacement`, `openBin`, `tray`, `verticalFile`이다. `closedBin`, 적층 실행, 결제, 원격 fetch는 지원하지 않는다. 지원하지 않는 값을 기본 primitive로 바꾸지 않는다.

실측은 Rust `Fact`다. `unknown`, 알려진 0, `notApplicable`은 서로 다르다. `VerificationStatus`는 체크박스나 import가 올리지 않는다. 판매처 URL, 가격, 재고, 배송, 확인 시각은 관측이다. 검사 상태나 `Confirmed`가 아니다. 사진 바이트는 별도 동의 전까지 JSON 내보내기에 넣지 않는다.

## 5. 버전 호환

| 식별자 | 현재 | 이 노드 | 옛 값 | 바꾸는 때 |
|---|---|---|---|---|
| `BUILD_ID` | `zari-domain-7` | 유지 | 다른 build는 거절 | 명령과 capability가 함께 바뀔 때. 다음 id는 여기 없다 |
| `ruleVersion` | `zari-domain-v2` | 유지 | `zari-domain-v1`은 읽기 전용 | 가이드·검사·BOM 의미 |
| `solverVersion` | profile 1 `zari-solver-v1`, profile 2 `zari-solver-v2` | 유지 | 스냅샷은 자기 profile을 찍는다. ready는 `zari-solver-v2` | 열거·비용·순위 |
| `schemaVersion` | 1 | 유지 | 더 높은 schema의 쓰기는 거절 | JSON 모양 |
| `canonicalVersion` | 1 | 유지 | | canonical byte |
| protocol | 1 | 유지 | | envelope |
| dbVersion | 2 | 유지 | version 1 store 선언은 남아 있다 | Dexie store |
| exportVersion | 1 | 유지 | | envelope. 소유는 z-portable-project |
| catalog `sourceKind` | `synthetic`, `imported` | 유지 | | 새 kind는 schema. 소유는 z-catalog-provenance |
| 새 프로젝트 search profile | `default` version 2 | 유지 | version 1 기록은 `zari-solver-v1` | 비용 회계 |

## 6. 변경 영향 fixture

기존 fixture 124건의 기대 바이트는 바꾸지 않는다. 종류와 개수는 다음과 같다. 이후 노드가 의미를 바꾸면 그 종류를 영향 목록에 남기고, 기대값을 생산자로 다시 쓰지 않는다.

| caseKind | 개수 | 대표 | 이후 의미 변경의 소유 |
|---|---|---|---|
| bootstrapProbe | 28 | `fixtures/bootstrap/unknown-pack.json` | 없음. probe는 PlanSnapshot이 아니다 |
| layoutEdit | 6 | `fixtures/domain/edit-move-permitted.json` | z-incremental-replan |
| catalogFields | 4 | `fixtures/domain/catalog-fields-unknown.json` | z-catalog-provenance |
| catalogImport | 4 | `fixtures/domain/catalog-import-valid.json` | z-catalog-provenance |
| projectNormalize | 30 | `fixtures/domain/project-unknown-quantity-pass.json` | z-inventory-lifecycle |
| recordVerify | 9 | `fixtures/domain/record-snapshot-verified.json` | z-portable-project |
| candidateValidate | 22 | `fixtures/domain/candidate-owned-overuse.json` | z-inventory-lifecycle |
| proposeStrategies | 1 | `fixtures/domain/strategies-proposed.json` | z-strategy-library |
| runSearch | 8 | `fixtures/domain/search-scope-complete.json` | z-pareto-comparison |
| projectSpatialView | 5 | `fixtures/spatial/spatial-yaw-offset.json` | 없음. v1 가이드 간선은 역사다 |
| queryNextFacts | 7 | `fixtures/domain/mc-10-stale-binding.json` | 없음 |

`unknown-pack`의 주문 묶음은 null이다. `project-unknown-quantity-pass`의 수량은 `unknown` / `notMeasured`다. `spatial-yaw-offset`의 `act:transfer:item-a:0`은 `act:install:p-c1`을 선행으로 가진 역사 바이트다. PC 오라클 인덱스의 `currentBuildId`는 `zari-domain-6`으로 남아 있다. 분모는 16이다.

## 7. 사용자 결정과 내부 구현 선택

사용자 결정은 열려 있다. 계정, 결제, 클라우드, 사진 동의, 화면 수용, 출시, 실시간 재고, 안전 인증, 전화, 전용 GPU. 이 채택 문장이 그 결정을 대신하지 않는다.

내부 구현 선택은 이 기록에서 채택한다. 16개 ID를 유지한다. 버전을 올리지 않는다. 정본은 기존 `OwnedContainer`, `CatalogSnapshot`, `Strategy`, exportVersion 1, `evaluate_candidate`다. 빈칸은 이름 붙은 z-노드에 둔다. unknown은 unknown으로 남긴다. 명령과 migration을 더하지 않는다. fixture와 PC 오라클과 분모 문서를 다시 쓰지 않는다. 구매 링크는 결제가 아니다.

두 목록의 id는 겹치지 않는다. 사용자 결정을 `adopted`로 적지 않고, 내부 선택을 사용자 승인으로 적지 않는다.

## 8. 단일 연결

입력은 Rust 정규화다. `evaluate_candidate`가 검사, BOM, 가이드를 한 `SnapshotContent`에 넣고 `planSnapshotId`는 그 내용의 digest다. 도면은 `project_spatial_view`가 그 `PlanSnapshot`에 찍는 투영이다. BOM과 가이드는 다른 문서가 아니다. 추적 fixture는 `fixtures/domain/search-scope-complete.json`이다.

## 결과

생산 Rust, 생성 계약, fixture 기대값, 화면, 색 토큰은 이 결정으로 바꾸지 않는다. 이후 z-노드가 생산 구현을 시작한다.
