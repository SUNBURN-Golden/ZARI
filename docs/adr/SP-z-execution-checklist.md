# SP-z-execution-checklist — 실행 체크리스트·막힘·되돌리기

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-execution-checklist만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-execution-checklist](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시, 실기기 검증이 아니다.

## 문제

사용자가 실제로 물건을 옮길 때 어떤 순서인지, 무엇을 준비해야 하는지, 무엇이 막혔는지를 한 단계씩 따라가야 한다. 완료 체크가 unknown 검사를 통과로 보이게 하거나, 선행 단계나 검사가 남은 위험한 단계가 완료 가능하게 보이면 안 된다. 계획이 바뀌면 구계획의 완료 기록이 무조건 이어지면 안 된다. 현장에서 다른 물건을 발견하거나 부품이 모자라거나 실측이 다르면 화면은 초안 수정으로 돌려 보내야 하고, 되돌리기가 진행 기록이나 검사 결과를 몰래 바꾸면 안 된다.

## 결정

실행 카드는 같은 PlanSnapshot의 ActionStep과 `queryActionEligibility` 행만 따른다. 진행 기록은 채택된 `(inputRevision, planSnapshotId)` 결합에만 저장된다.

- 준비물은 Rust `instanceRefs`의 라벨이다. 자격 행이 없는 읽기 전용 표면은 `subjectIds`의 관련 대상만 보이고 이름을 다시 계산하지 않는다. 수량 미확인은 개수로 추정하지 않는다.
- 조건은 선행 단계와 `reasonIds`가 가리키는 검사다. 검사 상태는 `content.validation.checks` 그대로이고, 완료 기록은 그 상태를 바꾸지 않는다. unknown은 미확인으로 남는다.
- 완료 기록은 기존 `setActionStep` CAS 경로만 거친다. 막힌 단계는 체크박스가 비활성이고 이유가 글자로 붙는다. 선행·확인 절차·조건이 남은 위험한 단계는 완료 가능하게 보이지 않는다.
- 되돌리기는 draft 화면의 한 컨트롤로 이동하는 탐색이다. `requestDraftFocus`는 세션의 휘발 값으로 남고 저장소에 쓰지 않는다. 다른 물건 발견은 물건 치수, 부품 부족은 카탈로그·보유 수납함, 실측 차이는 공간 치수로 간다.
- 중단·재개와 계획 변경의 진행 무효화는 `crates/core/tests/execution_checklist.rs`의 고정 장면으로 검증한다. 공유 fixture 124건의 바이트와 manifest 합계는 그대로다.

`BUILD_ID`는 `zari-domain-7`, `ruleVersion`은 `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, 문서 `dbVersion` 2, 살아있는 IndexedDB `DB_VERSION` 4는 바꾸지 않는다. 새 도메인 계약·액션 종류·검사 종류·마이그레이션·색 쌍은 없다.

## 하지 않는 것

구매·결제, 클라우드 동기화, 오프라인 대기열, 자동 진행 승계, `BUILD_ID` 변경, 다음 z-노드.
