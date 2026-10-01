# ZARI — 프로그램 위임 초안

상태: NON_EXECUTABLE_DRAFT / PENDING_APPROVAL_DO_NOT_DISPATCH. 범위·시작 승인과 설치/qualification은 아직 완료되지 않았다. 전체 정의 정본은 `docs/aiops/ZARI_PRODUCT_COMPLETION_PROGRAM_DRAFT.json`와 등록 manifest의 pending catalogue다. ID·spec·선행을 보존하고 계약 변경의 병합 flag/등급을 아래 판정대로 바꿨다.

## 정책 C — 대표님 결정 2026-10-01

원문: [중앙 #47 결정 기록](https://github.com/BeautifulMind-JT/ai-ops-control-plane/pull/47#issuecomment-5927605393). Fable PASS가 나온 위임 노드는 보호된 중앙 executor가 자동 병합한다. `contract_change=YES`, `RELEASE`, `user_merge=true`는 대표님이 병합한다. 계약 변경 노드는 `user_merge=true`, `audit_floor=A3`, `astra_auto_merge=false`로 기록한다. 기존 대표님 전용 노드도 유지한다. 동적 감사에서 계약 변경 YES가 나오면 정적 NO 판정에도 자동 병합하지 않는다.

공개 계약·schema·protocol·operation·capability·BUILD_ID·ruleVersion·solverVersion·SDK/manifest 형식 변경을 계약 변경으로 판정했다. 선행 설계가 있다고 해서 실제 공개 형식 변경의 대표님 병합을 면제하지 않는다. 구현·소비 노드의 NO는 채택된 의미/형식을 그대로 지키는 범위이며, 변경이 필요해지면 YES/A3/User 경계로 다시 분류한다. 비작성자 exact-HEAD 리뷰·CI·제품 gate·호스트에 결합된 보호된 PASS·정확한 병합 HEAD를 모두 요구한다. GitHub 댓글만으로 protected receipt를 만들지 않는다.

이전 위임에서 계약 변경도 자동 병합하도록 둔 flag를 아래 표의 대표님 경계로 바꿨다. DAG나 과거 전달/승인 증거를 새 승인으로 전이하지 않는다. 개발 DONE·실환경 qualification·화면/작품 acceptance·release는 각각 독립 증거가 필요하다. UNKNOWN fencing·단일 writer·금융/chain/외부 전송/과금/공개 운영 잠금은 유지한다.

## 노드별 spec 판정 (16개)

| Node | contract_change | 병합 | audit_floor | spec 근거 |
|---|---|---|---|---|
| `001` | YES | 대표님 | A3 | 새 Rust 투영 DTO·typed link·공개 공간 계약 |
| `002` | NO | 정책 C 위임 | A2 | 기존 승인 계약의 시험·측정·증거/수용 인계; 새 계약 정의 없음 |
| `003` | NO | 정책 C 위임 | A2 | 선행에서 채택한 계약의 구현·소비; 새로운 공개 의미/형식 변경은 제외 |
| `004` | NO | 정책 C 위임 | A2 | spec의 승인된 동작 구현 또는 문서/계획 정리; 새 공개 계약 정의 없음 |
| `005` | NO | 정책 C 위임 | A2 | 선행에서 채택한 계약의 구현·소비; 새로운 공개 의미/형식 변경은 제외 |
| `006` | NO | 정책 C 위임 | A2 | 기존 승인 계약의 시험·측정·증거/수용 인계; 새 계약 정의 없음 |
| `007` | NO | 정책 C 위임 | A1 | 기존 승인 계약의 시험·측정·증거/수용 인계; 새 계약 정의 없음 |
| `008` | YES | 대표님 | A3 | signed-offset 정규화·측정 ADR·typed 입력 계약 |
| `009` | NO | 정책 C 위임 | A2 | 선행에서 채택한 계약의 구현·소비; 새로운 공개 의미/형식 변경은 제외 |
| `010` | YES | 대표님 | A3 | 새 query/DTO·schema·Worker API·capability/BUILD_ID 원자 갱신 |
| `011` | NO | 정책 C 위임 | A2 | 기존 승인 계약의 시험·측정·증거/수용 인계; 새 계약 정의 없음 |
| `012` | YES | 대표님 | A3 | 행동·조건·가이드 버전·평가 계약 ADR |
| `013` | YES | 대표님 | A3 | action 조건/DAG·ruleVersion·가이드 생성 의미 변경 |
| `014` | YES | 대표님 | A3 | 평가 continuation·solverVersion·프로토콜 및 원자 publication 변경 |
| `015` | NO | 정책 C 위임 | A2 | spec의 승인된 동작 구현 또는 문서/계획 정리; 새 공개 계약 정의 없음 |
| `016` | NO | 정책 C 위임 | A2 | 기존 승인 계약의 시험·측정·증거/수용 인계; 새 계약 정의 없음 |

## 중앙 및 시작 경계

채택 검토 source는 [중앙 #47](https://github.com/BeautifulMind-JT/ai-ops-control-plane/pull/47) `09e161caa652d75e9617caf632b3b9899be35740` 하나다. source 후보로 구현됐으며 설치·독립 A3·User 채택·실제 host qualification·activation은 PENDING이다. runtime/client pin이나 host record는 이 변경으로 바꾸지 않는다. 과거 checkpoint 목록과 별도 시작 PR 절차는 [REGISTRATION_SCOPE_APPROVAL_KO.md](REGISTRATION_SCOPE_APPROVAL_KO.md)를 따른다.

외부 선행은 pending catalogue에 둔다. 실제 저장소/program/node·plan/definition·delivery HEAD·merge SHA·필요한 post-merge 검증의 보호된 완료를 확인한 뒤, 별도 대표님 병합 plan revision에서 변환 전/후 digest와 근거를 기록해 승격한다. 현 schema v1은 빈 `depends_on_external`도 거부한다. 미완료·UNKNOWN·wrong-revision을 삭제해서 실행하지 않는다. bootstrap/범위/시작 PR은 자동 병합할 program delivery가 아니다.
