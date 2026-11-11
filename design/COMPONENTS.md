# ZARI 컴포넌트 계약

## EasyMode — 사용자 지시 2026-11-02

한 질문씩 표시하는 쉬운 모드와 기존 전문가 화면을 분리한다. SizeFields는 cm 원문을 보존하며 입력마다 계산하지 않는다. 줄자·방 선택은 자체 SVG와 접근 가능한 이름을 갖는다. 결과는 전용 Worker에서 기존 Rust 폭 검사를 세 축에 적용한 응답만 표시하며, 그림은 반환된 mm를 화면에 투영한다. 실패·미확인·저장 실패·손상된 임시 저장·계산 실패에서 성공을 표시하지 않는다. 하단 주요 단추 하나, 48px 이상, 포커스·reduced motion·390px 넘침 검사는 Playwright 계약이다. 확정 문구와 사용자 지정 예외는 EASY_COPY_CANDIDATES.md를 따른다.

아래 명칭은 구현 책임이다. 앞 표의 일부는 아직 초안이고, 이어서 적는 다섯 항목은 로컬 앱에 있는 초안 컴포넌트다. Storybook story는 없다. 기본 HTML로 충분한 곳에는 복잡한 라이브러리를 도입하지 않는다. React Aria Components 1.21.1이 버튼과 입력의 공통 동작에 쓰인다.

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
| NextFactsList (초안) | Rust가 고른 다음 사실. 행은 `ul`/`li` | ready, stale, limited, failed, input only |
| DetailFactPanel (초안) | 값·오차·출처. 빈 수량은 0이 아님 | empty, editing, unknown, read-only |
| StepEligibilityGuide (초안) | 채택 스냅샷의 단계 자격. 막힌 이유는 글자 | waiting, blocked, done, read-only done |
| RecoveryPanel (초안) | 저장·충돌·손상·워커 실패에서 입력 유지 | save failed, conflict, corrupt, worker failed |
| InterruptedSearchNote (초안) | 계산 상태. `role="status"` | idle, running, done, cancelled, interrupted, failed |

## SpaceFit 결과 — PR-B 구현 초안 (2026-11-10)

SpaceFit은 단일·조합 결과를 한 목록으로 합친다. 탭이나 `딱 맞음`/`조합` 그룹 제목을 두지 않는다.

| 컴포넌트 | 책임 | 반드시 구현할 상태 |
| --- | --- | --- |
| SpaceFitResultRow | 결과 하나를 하나의 `li`와 한 겹의 테두리 행으로 표시. 메타(판매처·분류·참고치) → 제품명 `h3` → 큰 수량 문장 → 축별 남는 길이 → 블록별 가격(모든 블록 가격이 unknown이면 한 줄) → 판매처 링크 → 접힌 놓는 모양 순서 | confirmed, reference, priced, price unknown, stacked, long Korean name, stale, busy |
| ReferenceBadge | `참고치` 버튼. `aria-expanded`/`aria-controls`로 설명 문단을 펼친다. 치수 근거에만 쓴다. 설명 문단이 크기에 대한 문장이라 참고 가격에는 쓰지 않는다(가격용 설명은 승인 전 copy-todo) | collapsed, expanded, keyboard, focus-visible, forced-colors |
| UnmeasuredGroup | 결과 목록 뒤 접힌 `details` 하나. 요약은 `치수 확인 중 ({n}개)`이며 n은 page의 전체 미확인 수, 내부는 이름·판매처·링크의 `ul`/`li` | closed, open, empty(렌더하지 않음) |

- 참고치 배지는 meta 줄에서 치수 provenance가 reference일 때만 보인다. confirmed 행에는 배지가 없다. 배지는 높이 48px 이상이고 Enter/Space로 동작하며 설명은 `aria-controls`가 항상 가리키는 한 곳에 둔다.
- 결과 행은 카드 안에 카드를 넣지 않는다. 목록은 `ul`, 행은 `li`, 제품명은 `h3`다. 결과 요약은 초점 가능한 `h2`이며 `aria-live`는 검색 결과가 처음 도착할 때 한 번만 알린다.
- 가격이 known이고 묶음 수량·개당 가격이 있으면 `한 개 {가격}원 · 다 해서 {가격}원`을 표시한다. 그 외에는 `가격은 파는 곳에서 봐 주세요`만 표시하고 원화 금액을 만들어 내지 않는다. 묶음 가격만 아는 경우의 문구는 승인 전까지 `copy-todo` 주석으로 남긴다.
- 찾기 단추는 입력 화면에서 viewport 아래에 sticky로 두고 panel 토큰 배경·safe-area 여백을 쓴다. 결과는 같은 화면 아래에 이어지며, 첫 결과 page가 온 뒤 요약으로 초점을 옮기고 `prefers-reduced-motion`에서는 부드러운 스크롤을 쓰지 않는다.

## 접근성과 입력 규칙

레이블을 placeholder로 대체하지 않는다. input의 타입, inputmode, 허용 문자열, 정규화 시점을 분리한다. 구체화된 [프런트엔드 계약](../docs/FRONTEND.md)에 따라 DimensionField는 React Aria TextField로 원문 문자열을 유지하고 Rust가 정규화한다. NumberField나 JS 숫자 파서를 정식 측정값 변환에 사용하지 않는다. JS 부동소수점 결과를 정식 도메인 값으로 확정하지 않는다.

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
