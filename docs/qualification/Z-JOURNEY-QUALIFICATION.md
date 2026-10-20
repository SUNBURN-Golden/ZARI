# Z-JOURNEY-QUALIFICATION — 전체 여정 결과와 실제 기기 자격 표

상태: **검증 결과 기록 / 승인·출시 아님**. 태스크: GitHub issue #116, node z-product-qualification. Plan commit `0847d1b065627938acfad3a941de79e357570e43`. 관찰 base SHA `abb0a474caac7233e4a30e31c479770f67b1b3b3`.

이 문서는 각 기능의 독립 테스트로 전체 완료를 주장하지 않는다. 여정은 `apps/web/tests/browser/product-journey.spec.ts`가 실제 Chromium·IndexedDB·WASM Worker 위에서 **같은 accepted snapshot과 같은 `data-revision`**으로 한 번에 지나간다. 네 겹 증거 = native(fixture_runner)·실제 WASM(worker 응답)·저장(IndexedDB)·화면(글자 단정).

## 여정 단계별 결과

| 단계 | 내용 | native | 실제 WASM | 저장 | 화면 | 결과 |
|---|---|---|---|---|---|---|
| 측정(충분) | 샘플 입력·커밋 | fixture 124 | normalizeInput | drafts/projects 커밋 | save-state=saved | 통과 |
| 실상품 검토 | 검증 범위 기록·사실 미확인 커밋 | catalog 번들 fixture | reviewCatalogImport | catalogs 행 | "사실은 미확인" | 통과 |
| 대안 | 탐색→구매 없음/포함 카드 | search fixture | stepSearch | snapshots | 카드 목록 | 통과 |
| 구매 준비 | 구매 확인 기록, 링크≠결제 | offer/handoff fixture | preparePurchaseHandoff | handoff 기록 | flags 글자 | 통과 |
| 실행 | 채택→단계 완료 기록 | guide fixture | queryActionEligibility | accepted 바인딩·진행 행 | 체크박스 | 통과 |
| 계획 패키지 | 같은 revision의 HTML·CSV | print fixture(host 조립) | — | — | print-package revision | 통과 |
| 위치 검색 | 계획 위치≠실제 위치, 관측 기록 | location fixture | queryLocationSearch | locationLogs 행 | plannedOnly | 통과 |
| 재정리 | 피드백 기록→초안/nochange, 채택 계획 불변 | feedback fixture | proposeFeedbackReorganize | feedbackLogs 행 | data-base=accepted | 통과 |

## 시나리오별 결과

| 시나리오 | 검증 위치 | 결과 |
|---|---|---|
| 충분 측정 | 여정 1단계 + `plan.spec.ts` | 통과 |
| 부족 측정 | 본 스펙 테스트 2 — 빈 안쪽 폭은 unknown이고 통과로 승격되지 않음 | 통과 |
| 무구매 | 여정 대안 단계(no-purchase 카드) + `product-completion.spec.ts` | 통과 |
| 품절 | 본 스펙 테스트 3 — 전량 품절 카탈로그에서 `inv:` Fail `out_of_stock`, 판매처 품절, 교체 후보 없음을 정직하게 표시 | 통과 |
| 오류 import | 여정 실상품 단계 — 깨진 JSON 거절·충돌 CSV 격리, 카탈로그 불변 | 통과 |
| 취소 | 여정 대안 단계(cancel-search) + `plan.spec.ts` 취소·재탐색 | 통과 |
| 다중 탭 | 여정 마지막 — 둘째 탭 `data-save-state=conflict`, 첫째 탭 저장 보존 | 통과 |
| 미배정 | 본 스펙 테스트 2 — 좁은 공간에서 미배정 목록이 물건과 함께 남고 `미배치 0` 위장 없음 | 통과 |

## 실제 기기 자격 표

| 대상 | 상태 | 근거 |
|---|---|---|
| Chromium 1440(본 호스트) | 이 여정 검증 | 3/3 spec 통과 |
| Chromium 390 에뮬레이션 | 부분(에뮬레이션) | 여정 내 넘침·forced-colors 단정 |
| Firefox | UNVERIFIED | 이 호스트에 미설치(실행 시도 결과 참조) |
| WebKit | UNVERIFIED | 이 호스트에 미설치(실행 시도 결과 참조) |
| 실제 전화 | UNQUALIFIED | 하드웨어 없음. 390 CSS viewport는 에뮬레이션 |
| 전용 GPU | UNQUALIFIED | Headless SwiftShader(software GL) |
| 실제 사이트 수집물 | UNQUALIFIED | 크롤러 실사이트 실행 이력 없음; 실상품 증거는 사용자 선언 import까지 |
| 캡처 수용 | PENDING | 이 노드는 캡처를 등록하지 않고 승인을 빌리지 않는다 |
| 출시 | NOT_AUTHORIZED | 별도 사용자 결정 |

## 분모 보고

z-노드 분모는 `docs/qualification/z-denominator.json`: 프로그램 20 + 소유자 지시 추가 1 = 21. 머지 19, 이 노드 IN_PROGRESS 1, z-local-delivery NOT_STARTED 1. 미완료 항목은 분모에서 지우지 않는다. 머지된 노드도 DONE이 아니며 review/audit 포인터는 실제로 생길 때까지 null이다.
