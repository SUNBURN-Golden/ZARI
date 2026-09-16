# ZARI 컴포넌트 계약 — 구현 전

아래 명칭은 구현할 책임을 설명한다. 현재 React 파일·Storybook story가 생성되었다는 뜻이 아니다. 기본 HTML로 충분한 곳에는 복잡한 라이브러리를 도입하지 않는다. 공통 동작 기반의 우선 후보는 React Aria Components이며 설치 전 현재 API·호환성을 검토한다.

| 컴포넌트 | 책임 | 반드시 구현할 상태 |
| --- | --- | --- |
| AppShell / ProjectHeader | 현재 공간·단계·저장 상태·주요 행동 | unsaved, saving, saved, error, revision conflict |
| DimensionField | 보이는 레이블·단위·도움말·연결된 오류 | empty, editing, valid, invalid, unknown, read-only |
| StrategyOption | 정리 기준·실제 차이·선택 | available, selected, unavailable with reason |
| ViewSwitcher | 정면/평면과 현재 표시 전환 | pointer, keyboard, focus-visible |
| SpaceViewport | 실제 좌표 도면·줌·팬·선택 | no plan, preview, verified, stale, error |
| PlacementInspector | 선택 제품·내용물·근거·교체 | none selected, measured, unknown, unsupported |
| CheckResultRow | 검사 범위·상태·이유·확인 행동 | pass, fail, unknown, not_applicable |
| PriceSummary / BOMRow | 정식 BOM과 미확인 비용 | reuse-only, priced, partially unknown, stale |
| ActionChecklist | 정리 단계·관련 대상·저장 | pending, complete, unavailable, save error |
| Modal / MobileInspector | 정보의 문맥·초점·닫기 | open, scroll, keyboard, focus return |
| EmptyState / InlineError | 다음 행동과 복구 | no input, no solution, retry, unsupported |

## 접근성과 입력 규칙

레이블을 placeholder로 대체하지 않는다. input의 타입, inputmode, 허용 문자열, 정규화 시점을 분리한다. React Aria의 숫자 파서를 사용하더라도 정확한 십진수 문자열→정수 mm 계약과 충돌하지 않는지 검증한다. JS 부동소수점 결과를 정식 도메인 값으로 확정하지 않는다.

버튼은 button, 이동은 link로 표현하고 복잡한 카드 전체를 중첩 interactive element로 만들지 않는다. disabled 이유는 hover 없이 알 수 있어야 한다. 단순 상태를 버튼처럼 보이게 하지 않는다.

현재 선택과 검증 성공은 별도 속성이다. CheckResultRow는 텍스트·아이콘·색을 함께 사용한다. 스크린리더 상태 알림은 입력 이벤트마다 반복하지 않고 확정 결과·저장 실패 등을 의미 있는 시점에 전달한다.

도면 조작이 불가능한 사용자에게 배치 목록·숫자 위치 수정·이동 버튼을 제공한다. 스크린리더 대안도 같은 placement ID와 Rust command를 사용한다.

Modal은 배경과 현재 작업을 구분하고 초점을 관리한다. 단순 inspector를 불필요하게 modal로 만들어 도면 조작을 막지 않는다. compact에서도 명시적인 닫기 버튼이 있어야 한다.

## 상태별 화면 표본

Storybook을 도입할 때 각 컴포넌트의 기본/초점/오류/미확인/긴 한국어/확대/compact/reduced-motion 상태를 작성한다. Storybook fixture는 synthetic이며 실제 상품·실제 Rust 통합의 증거로 사용하지 않는다.

실제 앱의 Worker/WASM 통합 시험은 별도다. mock response만 통과한 컴포넌트 story를 계산 검증이라고 보고하지 않는다.

## 토큰 사용

글자·간격·색상·border·radius·motion은 `apps/web/src/styles/tokens.css`를 참조한다. 토큰 변경 후 정의된 색상 쌍은 `node scripts/check-design-tokens.mjs`로 확인한다. 새 색상 조합은 contrast cases에 추가하고 렌더링도 검토한다.

SVG 도면의 의미 있는 선은 `--zari-canvas-outline`, 선택은 `--zari-selection-ring`, 오류는 `--zari-danger` 등을 사용한다. 얇은 장식선과 안전 관련 검사 표시를 혼동하지 않는다. 작은 경계선의 실제 식별성은 별도 렌더링 검토가 필요하다.
