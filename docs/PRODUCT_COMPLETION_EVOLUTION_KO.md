# ZARI 제품 완성 경로 고도화 — 실행 가이드·평가·복구

상태: **설계 및 비활성 실행 계획 후보 / 미채택 / 구현·독립 감사·실측 없음**.
작성일: 2026-10-01 KST. 조사 기준은 [ZARI #37](https://github.com/BeautifulMind-JT/ZARI/pull/37)의
정확한 HEAD `f328251d06b891b27fefa1180b6b767c6aacfd92`다. 원본 마스터·Rust 프롬프트와
SOURCE_MANIFEST, 이미 작성한 SP-001–011의 spec·의존·감사 경계는 유지한다.
이 문서는 그 뒤 SP-012–016을 추가한다. 방 전체·적층·계정·AI·자동 주문·안전 인증을 추가하지 않는다.

중앙 [#47](https://github.com/BeautifulMind-JT/ai-ops-control-plane/pull/47)의 승인 범위 bridge에
[회복 구현 후보 #47](https://github.com/BeautifulMind-JT/ai-ops-control-plane/pull/47),
HEAD `09e161caa652d75e9617caf632b3b9899be35740`가 쌓여 있다. 실패 기록 보존·검증된 한도
사건의 한 번 재시도 소스 후보이며 설치·독립 A3·PA-1 채택·host qualification·activation 근거가 아니다.
이 제품 문서는 런타임 pin이나 승인 포인터를 활성화하지 않는다.

**SP-012 채택 (2026-10-07).** 저장소 소유자 JunTae Park (준태)가 SP-012를 채택했다. 같은 발화에서 SP-013·014·015·016도 채택되었으나 이 노트는 그 구현을 기록하지 않는다. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 기록은 [D012](../design/DECISIONS.md)와 [docs/adr/SP-012-action-evaluation.md](adr/SP-012-action-evaluation.md)이다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 이 채택은 생산 가이드 변경, `BUILD_ID` 변경, 마이그레이션이 아니다. 아래 본문의 013–016 절은 그 노드의 범위로 남는다.

**SP-013 채택 (2026-10-07).** 같은 원문으로 SP-013만 구현한다. 기록은 [D013](../design/DECISIONS.md)와 [docs/adr/SP-013-execution-guide.md](adr/SP-013-execution-guide.md)이다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 생산 가이드는 `ruleVersion` `zari-domain-v2`이고 `BUILD_ID`는 `zari-domain-7`이다. `queryActionEligibility`가 명령이다. `zari-domain-v1` 스냅샷은 읽을 수 있고 완료할 수 없으며 다시 쓰지 않는다. 이 노트는 SP-014·015·016의 구현이 아니다.

**SP-014 채택 (2026-10-07).** 같은 원문으로 SP-014만 구현한다. 기록은 [D014](../design/DECISIONS.md)와 [docs/adr/SP-014-evaluation-continuation.md](adr/SP-014-evaluation-continuation.md)이다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. profile `default` version 2가 평가를 양자로 나누고 `solverVersion`은 `zari-solver-v2`다. version 1은 lump와 `zari-solver-v1`을 유지한다. 이 노트는 SP-015·016의 구현이 아니다.

**SP-015 채택 (2026-10-07).** 같은 원문으로 SP-015만 구현한다. 기록은 [D015](../design/DECISIONS.md)와 [docs/adr/SP-015-lifecycle.md](adr/SP-015-lifecycle.md)이다. Fable MILESTONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 사실·증빙 변경은 완료를 막고, 잘못된 초안은 좋은 정규 입력을 바꾸지 않는다. 옛 판매 항목과 진행은 그 스냅샷에 남고, 복제는 Rust 확인 뒤에 진행을 비우며 사진을 빠졌다고 말한다. 계약·DB 스키마·`BUILD_ID`는 바꾸지 않는다. 이 노트는 SP-016의 구현이 아니다.

**SP-016 채택 (2026-10-07).** 같은 원문으로 SP-016만 구현한다. 기록은 [D016](../design/DECISIONS.md)와 [docs/adr/SP-016-qualification.md](adr/SP-016-qualification.md)이다. Fable MILESTONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 새 가이드·평가·복구 화면의 draft는 `design/baselines/draft/zari016/`이고 SP-007·011 승인을 빌리지 않는다. 분모 16 = 7+4+5는 [docs/qualification/denominator.json](qualification/denominator.json)의 별도 투영이다. 머지는 `DONE`·기기 자격·화면 수용·출시가 아니다. 캡처 수용은 PENDING, 출시는 NOT_AUTHORIZED다. 계약·DB 스키마·`BUILD_ID`는 바꾸지 않는다.

**z-product-contract 채택 (2026-10-07).** 이 노트는 z-product-contract만 다룬다. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 기록은 [Dz-product-contract](../design/DECISIONS.md)와 [docs/adr/SP-z-product-contract.md](adr/SP-z-product-contract.md)이다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 001–016의 ID와 증거는 유지한다. 보유품·실상품·전략 비교·내보내기·재정리의 빈칸은 이후 z-노드가 구현한다. 입력에서 Rust `evaluate_candidate`로 만든 한 PlanSnapshot이 도면·BOM·가이드의 정본이다. 계약·DB 스키마·`BUILD_ID`는 바꾸지 않는다. 이 노트는 z-inventory-lifecycle 이후 노드의 구현이 아니다.

**z-inventory-lifecycle 채택 (2026-10-07).** 이 노트는 z-inventory-lifecycle만 다룬다. 같은 원문이다. 기록은 [Dz-inventory-lifecycle](../design/DECISIONS.md)와 [docs/adr/SP-z-inventory-lifecycle.md](adr/SP-z-inventory-lifecycle.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 보유 이력은 스냅샷 밖의 Rust 원장이다. 수량 미상과 0은 다르고, 한 용기의 같은 단위를 두 번 쓰지 않으며, 과거 계획을 열어도 현재 원장을 저장하지 않는다. 이 노트는 z-catalog-provenance 이후 노드의 구현이 아니다.

**z-catalog-provenance 채택 (2026-10-07).** 이 노트는 z-catalog-provenance만 다룬다. 같은 원문이다. 기록은 [Dz-catalog-provenance](../design/DECISIONS.md)와 [docs/adr/SP-z-catalog-provenance.md](adr/SP-z-catalog-provenance.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 실상품 검토는 스냅샷 밖의 Rust 응답이다. 다른 크기 옵션은 합쳐지지 않고, 빈 내경은 외경이 되지 않으며, 불완전 가져오기는 기존 카탈로그를 덮어쓰지 않는다. 이 노트는 다음 z-노드의 구현이 아니다.

**z-offer-bundles 채택 (2026-10-07).** 이 노트는 z-offer-bundles만 다룬다. 같은 원문이다. 기록은 [Dz-offer-bundles](../design/DECISIONS.md)와 [docs/adr/SP-z-offer-bundles.md](adr/SP-z-offer-bundles.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 필요 개수와 판매 묶음 수는 다르고, 배송 미확인은 무료로 합산되지 않으며, 품절 교체 뒤 도면·BOM·가이드는 같은 새 revision을 쓴다. 이 노트는 다음 z-노드의 구현이 아니다.

**z-strategy-library 채택 (2026-10-07).** 이 노트는 z-strategy-library만 다룬다. 같은 원문이다. 기록은 [Dz-strategy-library](../design/DECISIONS.md)와 [docs/adr/SP-z-strategy-library.md](adr/SP-z-strategy-library.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 문장만 같은 대안은 하나고, 저장하지 않은 전략은 핀이 아니며, 배치할 수 없는 물건은 수량과 함께 미배정에 남는다. 이 노트는 다음 z-노드의 구현이 아니다.

**z-pareto-comparison 채택 (2026-10-07).** 이 노트는 z-pareto-comparison만 다룬다. 같은 원문이다. 기록은 [Dz-pareto-comparison](../design/DECISIONS.md)와 [docs/adr/SP-z-pareto-comparison.md](adr/SP-z-pareto-comparison.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 같은 입력과 예산의 차이는 Rust 응답이고, 미확인은 0이 아니며, 다 쓴 탐색 예산은 전역 최적해가 아니다. 이 노트는 다음 z-노드의 구현이 아니다.

**z-incremental-replan 채택 (2026-10-07).** 이 노트는 z-incremental-replan만 다룬다. 같은 원문이다. 기록은 [Dz-incremental-replan](../design/DECISIONS.md)와 [docs/adr/SP-z-incremental-replan.md](adr/SP-z-incremental-replan.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 고정한 배치의 좌표는 유지하고, 새 치수로 무효가 된 통과는 재사용하지 않으며, 취소나 늦은 응답은 채택한 계획을 바꾸지 않는다. 이 노트는 다음 z-노드의 구현이 아니다.

**z-search-diagnostics 채택 (2026-10-07).** 이 노트는 z-search-diagnostics만 다룬다. 같은 원문이다. 기록은 [Dz-search-diagnostics](../design/DECISIONS.md)와 [docs/adr/SP-z-search-diagnostics.md](adr/SP-z-search-diagnostics.md)이다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체되고, 머지는 감독자에게 위임된다. 알 수 없는 측정은 제품 없음이 아니고, 더 큰 예산은 불가능의 증명이 아니며, 같은 사례는 로그 없이 입력·규칙·카탈로그·예산으로 다시 구분한다. 이 노트는 다음 z-노드의 구현이 아니다.

## 1. 실제 소스에서 확인한 누락과 작업 소유

기존 측정 후속 SP-008–011은 실제 사실 입력과 Rust 다음 확인 목록을 보완한다.
이것만 끝내도 현재 실행 가이드의 물리 순서와 조건 차단, 평가 도중 취소, 버전 변경 후
저장된 진행의 해석을 완성한 것은 아니다. 아래 관찰은 위 조사 HEAD의 소스 읽기 결과다.
성능 결함을 실행·측정했다거나 사용자의 실제 물건에서 재현했다는 주장이 아니다.

| 소스/기존 계약 | 확인한 차이 | 후속 소유 |
|---|---|---|
| `crates/core/src/finalize.rs::build_actions`와 SOLVER §6 / SCREENS S03 | contained 항목의 TransferContents가 Install을 선행으로 참조한다. 계약은 외부 staging에서 내용물을 담고 적재된 수납함을 삽입하는 순서다 | SP-012 계약 확정, SP-013 Rust 가이드 변경 |
| 같은 함수와 DOMAIN_MODEL §6 | 생성 ActionStep의 `required_confirmations`·`reason_ids`가 모두 빈 벡터다. ClearSpace/SortContents enum은 존재하지만 현재 함수는 해당 동작을 생성하지 않는다. unresolved physical checks와 각 실행 단계의 실제 관계를 소유한 task가 없다 | SP-013 조건·사실·사람의 진행 구분 |
| 기존 SP-004 | source actions 재생성/순서 변경을 명시적으로 금지한다. UI progress 보강만으로 위 차이를 고칠 수 없다 | 원래 SP-004를 확대하지 않고 별도 SP-013 |
| `crates/solver/src/search.rs::RunEval` | full `evaluate_candidate`를 한 호출로 수행한다. `64+p²+4a`는 논리 비용이며 실제 시간 상한이 아니다. step은 첫 indivisible op에 allowance 초과를 허용한다 | SP-012 비용/버전 계약, SP-014 단계형 평가와 실제 측정 |
| PERSISTENCE / session / repository | immutable history와 CAS는 이미 존재한다. 새 가이드 ID/버전·카탈로그 변경·Worker 복구·late progress 결과가 함께 발생하는 전체 경로는 새 계약으로 검증해야 한다 | SP-015 전체 lifecycle 통합 |
| 기존 SP-011 | measurement 범위의 새 capture/통합 인계다. 이후 실행 가이드·평가·복구 변경의 화면과 전체 프로그램 분모까지 완료했다는 근거는 아니다 | SP-016 전체 완성 인계 |

문서의 오래된 “구현 전” 머리말은 과거 설계 상태다. 현재 구현 여부는 기준 소스와
IMPLEMENTATION_STATUS의 최신 기록으로 판단하고, 이 후보 문서로 과거 기록을 고치지 않는다.

## 2. 끝까지 연결할 제품 범위와 완료 의미

완성할 경로는 실제 사용자 사실→정리 전략 선택→direct/owned/new 대안 탐색→독립 검사→
도면·BOM·실행 가이드의 같은 PlanSnapshot→명시적 채택→안전한 진행 기록→수정·재계산·복구다.
새 수납함을 사지 않아도 같은 경로가 유효하다. 미배치와 unknown은 사용자의 물건이므로 지우지 않는다.

| 결과 축 | 의미 / 완료를 대신하지 못하는 것 |
|---|---|
| physical assurance | Rust가 지원 rectangular/static/motion scope에서 계산한 ConfirmedWithinScope/Conditional/Rejected. 실제 가구·하중 안전 인증이 아니다 |
| assignment completeness | exact instance partition과 미배정/가배정/unknown 수량. 계획 생성 성공과 별개다 |
| commerce readiness | pinned offer/pack/가격/재고/배송의 관측 근거. Ready여도 예약·지급·주문·현재 재고 보장은 아니다 |
| accepted binding | 사용자가 현재 exact snapshot을 채택한 사실. unknown이나 다른 프로젝트의 진행을 통과로 만들지 않는다 |
| action progress | 사용자가 실제 행위를 했다고 기록한 로컬 진행. 측정 Fact·validator report·BOM을 변경하지 않는다 |
| program delivery | 16개 전체 task의 qualified exact delivery가 보호된 gate를 거쳐 main에 병합된 근거. draft 문서 존재를 DONE으로 세지 않는다 |

실물 실측·없는 기기·판매처 연결·사용자 화면 채택·배포는 각각 미측정/대기 상태로 남는다.
자동화가 끝낼 수 있는 것은 범위 내 구현과 검증, 실제 근거가 붙은 검토 가능한 인계다.

## 3. SP-012: 버전·행동·평가 계약 ADR

SP-012는 SP-011 뒤의 별도 A3/ARCHITECTURE다. 규칙 변경이 필요한 가이드를 기존
plan meaning 보존이라는 문구로 은폐하지 않고 아래 내용을 명시적으로 채택 대상으로 만든다.

1. 현재 `ActionKind`, `ActionStep`, `ConstraintCheck`, `CandidateValidation`, progress row,
   DomainOperation/capability 및 snapshot decoder의 exact 필드를 표로 고정한다. `subject_ids`만으로
   한 contained unit을 구분할 수 있는지 확인하고, 표현 못 하는 의미를 문자열 ID 파싱으로 만들지 않는다.
2. `required_confirmations`는 무엇을 참조하는지, `reason_ids`는 어떤 check/reason namespace를
   참조하는지 disjoint reference 계약을 고정한다. 존재하지 않는 ID·duplicate·cycle·잘못된 target을
   structured error로 거절한다. 이름이 “confirmation”이라는 이유로 Fact 확인 기능을 만들지 않는다.
3. per-action condition binding은 Rust의 actual structured checks에서 나온다. 매핑은 kind만으로
   모든 check를 모든 step에 붙이지 않고 subject/instance/operation/evidence dependency를 포함한다.
   지원 DTO로 표현 못 하면 최소한의 additive generated read model을 A3에서 명세한다.
   persistent 필드/enum 변경이 필요하면 구버전 decoder·schema registry·명시적 migration gate가 먼저다.
4. 변경된 guide/rule meaning은 실제 새 `ruleVersion`을 요구한다. 평가 비용/중단/후보 선택 의미가
   바뀌면 새 `solverVersion`/search profile version을 요구한다. JSON shape 변경에만 schema version,
   canonical encoding 변경에만 canonical version을 바꾼다. 실제 새 값은 구현 ADR에서 등록하며
   문서에 존재하지 않는 BUILD_ID/API version을 완료 사실로 지정하지 않는다.
5. 기존 snapshot은 원래 hash/가이드/observed evidence를 보존한 역사다. 새 engine에서 재계산한
   계획은 새 context와 ID를 갖는다. 같은 의미로 보이는 action ID라도 다른 accepted binding의
   progress를 옮기지 않는다. 구버전 가이드가 이 물리 계약과 충돌하면 historical read-only로 표시하고
   실행 완료 조작을 차단하며 명시적 재계산을 제시한다. 과거의 done 기록을 삭제하거나 현재에 승계하지 않는다.
6. 평가를 쪼개도 기존 input/catalog immutability, 독립 validator의 전 검사, 후보 순서/ranking,
   quantity conservation, checked arithmetic, BOM rounding·shipping와 reference search 제한을 유지한다.
   비용 accounting을 바꿔 작은 budget에서 후보가 달라지면 versioned profile로 설명한다.

승인되지 않은 migration/새 physical geometry/새 external authority가 필요하면 그 계약만
DECISION_REQUIRED로 멈춘다. 계속 가능한 문서·oracle 준비는 진행할 수 있다.

## 4. SP-013: Rust 실행 가이드와 조건 차단

### 4.1 실제 가능한 순서

직접 배치와 수납함을 분리하고 기존 ActionKind를 우선 재사용한다. 이름만 재사용해 실제
의미를 바꾸지 않으며 부족한 enum/target 표현은 SP-012의 versioned 계약을 따른다.

| 경로 | 필요한 graph 관계 | 생기면 안 되는 행동 |
|---|---|---|
| direct-only / no purchase | relevant facts 해결→clear compartment/staging user assertion→검증된 insertion order의 direct unit 설치 | 구매·arrival·수납함 loading의 phantom step |
| owned container | 소유 unit의 이용 가능 사실→clear/prepare staging→해당 contained unit loading→그 loaded container의 삽입 | owned 전체 수량의 중복 배정·가짜 arrival/구매 |
| new container | 정확한 variant/offer acquisition assertion→arrival assertion→clear/prepare staging→loading→loaded insertion | plan 생성으로 acquisition/arrival 자동 완료 |
| provisional/unassigned | source check·원래 item/ordinal/range를 확인하는 blocked 안내와 입력/재계산 경로 | 임의 disposal·provisional capacity 확정·one imaginary unit |

clear-space는 사실 입력이 아니라 사람의 행위 확인이다. 기존 fixed obstacles는 지워지는
물건으로 안내하지 않는다. staging geometry/support/load와 handling unknown은 clear-space
checkbox로 해결되지 않는다. 외부 staging에서 upright reverse retrieval envelope로 loading한 뒤,
independent validator의 insertion order로 적재된 unit을 움직인다. 서로 다른 container loading과
installation을 불필요하게 전부 직렬화하지 않고 실제 prerequisite graph로 연결하되 출력은 안정 정렬한다.
지원하지 않는 내부 loading·tilt·lift around sill·blocker parking 경로는 안내하지 않는다.

### 4.2 check와 사용자 진행은 별도 권위

Rust가 만든 matching snapshot의 conservative required physical unknown/fail·unsupported 조건을
각 action에 연결한다. `ResolveCondition` 완료는 문제를 읽고 해당 입력으로 이동한 기록일 수는 있어도
Fact나 check를 변경하는 권한이 아니다. 해결은 fact 편집→Rust 정규화→CAS save→명시적 재계산→
새 snapshot 채택이다. 현재 binding에서 해결 불가능한 조건은 해당 실행 행동을 계속 막는다.
non-geometric offer/pack/inventory/price/shipping 조건도 해당 구매 준비와 정확히 연결한다.
동작과 무관한 가격 unknown을 direct-only 물리 실행의 가짜 차단으로 만들지 않는다.

행동 eligibility를 신규 ephemeral read API로 표현한다면 Rust가 fixed profile의 실제 구조화된
check/action graph에서 산출하고 generated schema/TS를 사용한다. 이 read는 검색·상태 저장·
Fact 승격·snapshot 변경을 하지 않는다. 입력은 matching immutable snapshot/current engine context와
bounded exact action-progress rows다. 결과 stamp는 project/input/snapshot/catalog/engine context,
accepted binding, observed project revision, local editor generation 및 progress rows identity를 포함한다.
대상 없는/불일치 source는 eligible로 fall back 하지 않는다.

progress 저장 직전에는 await에서 사용한 exact accepted/current binding와 local dirty generation을
재확인한다. DB transaction은 actual project revision, current input/digest/catalog/engine binding,
actual snapshot 및 captured progress rows와 일치할 때만 커밋한다. Worker 호출은 transaction 밖이다.
검증이 Worker reset·다른 탭·입력 수정·accept switch로 낡으면 write를 거절하고 기존 done row를 유지한다.
저장용 TypeScript 조건 확인은 위 matching Rust 결과와 storage CAS bookkeeping의 일치 확인이며,
새 물리 판정이나 fact 생성이 아니다. progress null/read failure/unknown confirmation은 eligible이 아니다.
cancel/trap 뒤 이전 eligibility/result를 다시 쓰지 않는다.

도면/BOM/guide focus는 같은 exact subject refs를 쓴다. 새 조건 UI는 해당 check와 입력 필드,
검사 범위·unknown 이유를 보여주며 오래된 진행 badge를 현재 단계 아래에 붙이지 않는다.
`done`은 실제 행위를 했다는 사용자 기록이고 상품의 실제 치수/안전 확인 증거를 의미하지 않는다.

### 4.3 독립 action graph oracle

SP-013은 build_actions 출력으로 기대값을 재생성하는 테스트만 쓰지 않는다. 손으로 계산한 작은
두 unit/세 contained instance·back-before-front graph에서 다음을 직접 증명한다.

- acquisition/arrival는 새 variant에만, loading은 각 exact contained unit과 대상 container에만 존재한다.
- 각 container loading→같은 container loaded install이며 그 역 edge는 없다.
- fixed obstacle·required staging/load unknown에서 영향을 받는 동작이 막히고 unrelated direct action은
  기존 실제 check 의미를 따른다. conservation상 미배치 unit/range가 안내에서도 모두 남는다.
- geometry/support/access·hard budget의 필수 known fail는 실행 가능한 snapshot을 만들지 않는다.
- 체크박스→unknown pass/Confirmed, 공통 label→wrong instance, done ResolveCondition→physical eligibility,
  arrival→수납함 실측 confirmed라는 경로가 없다.

## 5. SP-014: 취소 가능한 독립 평가와 publication

현재 RunEval의 논리 가격을 milliseconds 보장처럼 사용하지 않는다. 실제 bounds 내 최대
placement/assignment/check/pair 수에서 independent validation→quantity audit→BOM/cost→action DAG→
canonical body/hash→structural revalidation의 각각을 먼저 측정한다.

후속 구현은 immutable evaluation context와 private continuation을 core에 두고 solver가
진행 중 verdict/check 부분을 읽어 pruning pass로 사용하지 못하게 한다. source context가 다르면
handle을 재사용하지 않는다. 각 continuation quantum은 finite indexed iteration/check unit와
충분히 작은 bounded indivisible primitive로 정의하고 exact work accounting을 ADR에 고정한다.
한 primitive보다 작은 allowance에서도 진행이 멈추지 않아야 한다. 남는 serialization/hash 같은
atomic 구간은 최대 bytes·실제 p95/max와 cancellation bound를 기록하고 필요하면 streaming으로 쪼갠다.

1. 모든 필수 independent checks가 끝나기 전 validator-in-progress를 snapshot으로 publish하지 않는다.
2. 취소/budget 종료/trap/source switch는 미완성 후보를 버리지만 이전 완성 후보와 저장된 입력을 보존한다.
   반쯤 만든 BOM/actions/hash를 화면별로 분리 publish하지 않는다.
3. 같은 versioned profile/total budget에서 step allowance 1/7/128/256/1024와 source order 변경은
   같은 authoritative terminal outputs를 낸다. 기존 snapshot 의미가 바뀌는 부분은 SP-013 version으로
   손으로 확인된 delta를 기록하고 나머지 물리/BOM expected outputs를 무단 재생성하지 않는다.
4. native와 실제 browser Worker/WASM이 report/quantity/BOM/actions/full snapshot hash를 exact compare한다.
   timing/request/worker identity만 기존 비권위 telemetry normalization으로 제외한다.
5. cancel 요청은 실제 Worker message가 처리된 뒤 일치한 cancelled/interrupted 결과로 관측한다.
   장기 atomic primitive 중에는 즉시 응답한다고 주장하지 않는다. hard terminate는 interruption이고
   scope_complete/budget_exhausted가 아니다. explicit recovery는 fresh Worker/activation/lease로 시작한다.

기존 PERFORMANCE_SECURITY_FAILURES의 desktop/mobile step 8/16ms, cancel 100/200ms,
validation-finalization 30/100ms는 **목표**다. cold20/warm50·p50/p95/max·fixture/profile/budget/
source digest와 environment를 기록해 met/exceeded/unmeasured로 판정한다. 임계값을 낮추거나
checks를 빼서 green으로 만들지 않는다. 없는 actual phone 결과를 emulation으로 인증하지 않는다.

## 6. SP-015: 실제 사실·구매/재사용·저장·복구 lifecycle

기존 PERSISTENCE/WASM_PROTOCOL/FRONTEND의 의미를 다음 한 흐름에서 검증하고 누락을 고친다.
별도 상품 scraper·동기화·global inventory reservation·자동 주문/결제는 만들지 않는다.

| 변경/실패 | 반드시 보존·차단할 관계 |
|---|---|
| 실제 실측/evidence/bounds 변경 | input semantic digest/revision 변경, 기존 plan/guidance/eligibility stale, raw invalid draft 유지; unknown 오류0·Confirmed 자동 변환 없음 |
| 명시적 catalogue revision/SelectOffer | exact variant/offer/pack 연결; old BOM 관측값 유지; 새 catalogue digest·재계산/채택; physical-equivalent가 full snapshot ID 동일을 뜻하지 않음 |
| owned library 수정/삭제 | 프로젝트 embedded copy/history 유지; 최신 library 적용은 명시적; unknown available units 확정 배정 안 함; 두 프로젝트를 global reservation 완료로 표시 안 함 |
| no-purchase / explicit empty catalogue | real empty catalogue digest, new purchase cost known0, shipping N/A, direct/reuse 목록과 guide 유효; 상품·출처를 발명하지 않음 |
| save quota/unavailable·CAS conflict | 작업 중 raw/normalized state 보존·export/copy 경로; saved/accepted/done 가짜 성공 없음; 실패한 progress row 이전값 유지 |
| upgrade/old-new page-worker/offline asset mismatch | exact capabilities/BUILD_ID, full build generation, historical read-only/explicit recompute; schema downgrade write 차단; 저장 bytes 불변 |
| worker trap / hard cancel / late completion | fresh matching activation과 lease, disposed reply 무시; old verified token·eligibility·step focus를 현재에 재사용 안 함 |
| export/import/duplicate | bounded parse→generated validation→Rust integrity→atomic new project, original evidence와 historical binds 유지; duplicate progress reset; missing attachment 명시·사진 백업으로 오표시 안 함 |
| old guide version / equal semantic step ID | 원래 역사 가이드·진행 read-only, 새 accepted binding 별도 progress; 그럴듯한 ID 일치로 자동 carry-forward 안 함 |

실제 외부 상품 정보를 입력한 경우 출처와 관측 시각이 없으면 “현재 판매 중”으로 표시하지 않는다.
상품 링크는 사용자가 명시적으로 여는 정상 URL일 뿐 앱이 숨겨서 fetch/추적하지 않는다.
활성 offline 앱의 catalogue와 guide가 최신이라고 주장하지 않는다. 명시적 데이터 갱신 후의
known cost와 진짜 checkout 가격/재고는 여전히 다를 수 있으며 주문 실행은 이 범위 밖이다.

## 7. 구현 수용 사례와 qualification

아래 사례는 후속 구현 때 실행할 acceptance다. 이 문서 작성 중 실제 앱/브라우저/실물은 실행하지 않았다.

| Case | 독립 관찰 / 실패의 의미 |
|---|---|
| PC-01 direct-only, empty real catalog | 도면/BOM/guide와 exact item conservation; 구매/arrival/loading phantom0; required staging unknown 유지 |
| PC-02 owned2+new1, pack2 | owned ordinals 각각1회, new need1/packs1/supplied2/surplus1, price/ship unknown 분리; 새 unit만 acquire/arrival |
| PC-03 2 containers/3 contained units/rear-first install | 손으로 계산한 exact loading→loaded install graph; validator insertion order; cycle/duplicate/dangling target 거절 |
| PC-04 support/load/handling/parking unknown | 관련 checks와 실행 blockers 일치, ResolveCondition/done으로 physical unknown 승격0 |
| PC-05 nominal pass/conservative fail / corrupt candidate | independent report 유지; solver flags/no fake confirmed; known hard failure publication0 |
| PC-06 allowances1/7/128/256/1024 / near budget boundary | same-profile deterministic terminal parity, full validators 완료 전 publication0, 비용 부족과 취소/interruption 분리 |
| PC-07 cancel during each evaluation stage / trap / catalog switch | 완성하지 않은 snapshot/BOM/action/hash publication0, old complete plan/input 유지, late reply 적용0 |
| PC-08 action eligibility await vs dirty input/two-tab/accept switch | 현재 binding+revision+progress CAS, stale write0, old done row 보존, full-binding reload |
| PC-09 offer/owned/evidence change after partial progress | old snapshot/quote/progress 불변, 명시적 재계산의 newbinding에 progress 자동 carry0 |
| PC-10 old/new schema/rule/engine / offline mixed assets | supported historical view or explicit unsupported raw export, old executable guide 차단, downgrade/mismatch fail-closed |
| PC-11 real IndexedDB rollback/quota/corruption/export-import | half-project0, evidence/digest/readonly history 유지, missing photos명시, corruption 숨김0 |
| PC-12 fresh→측정→전략→대안→수정→채택→실행→복구 | 실제 Rust/Worker 출력으로 전 경로·keyboard/mobile 390/1440·IME/200%/forced-colors/reduced-motion 검증, 새 capture는 draft |

native oracle, actual WASM/Worker parity, 실제 Chromium/Firefox/WebKit, storage failure injection,
release build source-stage 성능, accessibility 결과를 별도 파일/로그로 보관한다. fake IndexedDB·UI stub·
Rust가 만든 기대값만으로 위 전 경로를 PASS로 보고하지 않는다. 기존 Rust/fixture/generated contracts/
web unit/build/parity/공간/portable/edit/progress/token 회귀도 같은 delivery HEAD에서 실행한다.

SP-016의 capture index는 실제 implementation HEAD, source fixtures/digests, route/scenario,
browser/version/viewport/fonts/motion/GPU와 image hash를 고정한다. guide blocked/unknown,
no-purchase/reuse/mixed purchase, historical, save/CAS failure와 interrupted recovery 화면을 포함한다.
SP-007·011과 기존 approved manifest의 승인 count는 고치지 않는다. 새 capture-set의 User 채택은 별도다.

## 8. 비활성 실행 그래프와 전체 분모

등록 후보 정본은 `docs/aiops/ZARI_PRODUCT_COMPLETION_PROGRAM_DRAFT.json` 하나이며 NON_EXECUTABLE_DRAFT다. 실행 경로의 `.aiops/program.json`은 이 PR에 없다. 기존 7-node
`ZARI_SPATIAL_PROGRAM_DRAFT.json`은 최초 공간 설계 checkpoint이며 최신 전체 실행 분모가 아니다.
기존 001–011 spec/deps는 보존하고, 계약 변경 노드의 병합 flag는 정책 C에 맞춰 대표님 몫으로 바꾼다. 아래 노드를 append한다.

| Node | Outcome / 소유 | Depends | 독립 gate |
|---|---|---|---|
| 012 | actual DTO/guide-condition/version/evaluation ADR와 독립 oracles | 011 | A3 / ARCHITECTURE |
| 013 | Rust physical guide DAG·정확한 condition/instance linking·progress guard/readiness 통합 | 012 | A3 / ARCHITECTURE |
| 014 | deterministic resumable independent evaluation·atomic final publication·cancel 성능 근거 | 013 | A3 / ARCHITECTURE |
| 015 | real facts/catalogue/owned/current-historical/DB/Worker/offline lifecycle 전 경로 | 014 | A2 / MILESTONE |
| 016 | 전체 PC+MC+SP 회귀·기기/브라우저 qualification·새 UI draft capture·완료 인계 | 모든 001–015 | A2 / MILESTONE |

한 저장소 한 writer이며 Rust core/solver/schema/persistence를 수정하는 012–015는 이 그래프에서
직렬이다. 부모의 범위 승인은 후속 012–016 승인이 아니다. 현재 모든 node는 pending plan 후보다.
`astra_auto_merge`는 독립 보호된 승인 범위 gate를 만족한 경우의 executor 위임일 뿐 새 권한이 아니다.
contract_change=YES·RELEASE·User-only는 중앙 automatic merge에서 제외한다. 새 계약은 실제
독립 exact-HEAD Fable architecture adoption/User scope-start/정확한 plan registration 전 실행하지 않는다.

최종 전체 개발 분모는 **16**이며 원래 7+측정4+이번5다. 016이 DONE이어도 앞선 미완료 task를
분모에서 빼거나 capture/qualification을 창작하지 않는다. completion report는 task별 exact
delivery/merge/review/audit pointer, required qualification별 evidence 또는 UNQUALIFIED,
User acceptance의 PENDING/ACCEPTED/REJECTED, release NOT_AUTHORIZED를 독립적으로 기록한다.
이 항목은 현재 중앙이 이미 제공하는 completion API/enum이란 주장이 아니라 구현 인계 산출물이다.

## 9. 작성 단계의 변경·검증·미수행

이 후보는 제품 문서와 pending JSON DAG만 변경한다. 앱·Rust·generated schemas·dependencies·
runtime/client pin·activation·host·계정·비밀·유료/외부 연결·approved baseline·공개·배포는 변경하지 않는다.
작성자 검사는 JSON 구조/중복/의존/순환/분모/원본 001–011 보존/문서 경로/변경 범위에 한정한다.
앱 구현·실물 실측·성능 결과·actual browser parity·User 화면 채택·독립 Fable PASS는 미수행이다.
