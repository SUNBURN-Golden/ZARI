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

## SpaceFit 필터·정렬 — PR-C 구현 초안 (2026-11-10)

필터·정렬은 Worker가 이미 돌려준 후보 목록 위에서만 동작한다. 적합성·배치·가격 합계를 JS에서 새로 계산하지 않는다. 보기 상태는 hash query(`sort`, `seller`, `type`)에만 두고, 바꾸어도 검색을 다시 실행하지 않는다. 화면은 draft이며 승인된 baseline이 아니다.

| 컴포넌트 | 책임 | 반드시 구현할 상태 |
| --- | --- | --- |
| FilterChips | 모바일 결과 위 한 줄 가로 스크롤. `순서·가게 고르기` 열기 단추와 판매처·모양 빠른 토글만 둔다(같은 이름 중복을 피하려고 `모두 보기`는 시트·열에만). 시트·열의 각 그룹 `모두 보기`는 그룹 선택이 비었을 때 pressed | default, filtered, scrollable, keyboard, 320px |
| FilterSheet | 모바일 하단 시트 `role="dialog"` `aria-modal="true"`. 열리면 제목으로 초점, Tab/Shift+Tab 순환, Esc·scrim·`닫기`로 닫고 초점은 연 단추로 복귀. `처음대로 돌리기`는 기본 보기로 되돌리고 `이대로 보기`는 닫는다 | closed, open, reset, esc, focus trap, focus return |
| FilterColumn | 1024px 이상 왼쪽 sticky 열. 시트와 같은 `FilterPanel`을 쓰며 CSS로 둘 중 하나만 접근성 트리에 남긴다. 필터 결과 목록 열은 최대 720px | default, filtered, sticky, hidden on mobile |
| LinkRow | 결과 링크 하나를 48px 이상 전체 폭 행으로 표시. 첫 줄은 한 줄 말줄임 제품명, 새 탭 안내 문구는 48rem 이상에서 같은 줄 오른쪽, 그보다 좁으면 항상 다음 줄. 같은 이름은 번호를 붙여 접근 가능한 이름을 행마다 다르게 유지 | single, repeated name, long Korean name, 320px wrap |

- 정렬은 `빈틈없이 꽉 차는 순`(기본, 기존 `compareCandidates`), `가격 싼 순`(아는 총액 오름차순, 모르는 가격은 뒤), `수납함 많이 들어가는 순`(총 수량 내림차순)이며 동률은 기존 순서를 쓴다. 각 그룹은 `button aria-pressed`이고 정렬은 항상 하나만 pressed다.
- 가격 합계는 `priceLine`과 같은 `ceil(quantity / packQuantity) * packPriceKrw` 규칙의 `blockTotalKrw`를 재사용한다. 묶음 수량·개당 가격이 없으면 합계를 만들지 않고 정렬에서도 모르는 값으로 둔다.
- 필터는 후보의 **어느 블록이든** 선택한 판매처나 분류와 맞으면 통과한다. 빈 그룹은 전체를 뜻한다. 필터 결과가 0이고 원래 결과가 있으면 요약은 `고르신 내용에 맞는 수납함이 아직 없어요`와 `처음대로 돌리기`를 보인다. 필터를 바꾸면 보이는 개수는 20개로 돌아간다.
- Rust Worker는 단일 상품 격자(stage 0) 뒤에 두 상품 혼합(stage 1)을 보낸다. 첫 page가 미완료면 UI가 응답마다 최대 6번 `next`를 자동 요청해 혼합 후보 20개·완료·2,000개 한도 중 하나에서 멈춘다. `조합 더 찾기`는 그 뒤에도 동작하고, 초점은 첫 page에서만 이동한다.
- 색은 기존 semantic token과 대비 사례(selected-label, accent-link, inverse-on-accent, control-on-panel)만 재사용한다. 시트 scrim은 `color-mix(in srgb, var(--zari-text-primary) 40%, transparent)`다. 새 색상 쌍은 추가하지 않았다.

## SpaceFit 여유 틈·빈 상태·긴 목록 — PR-D 구현 초안 (2026-11-10)

여유 틈은 Worker에 넘기는 검색 입력(mm)이며 JS가 기하를 계산하지 않는다. 빈 상태는 이유별로 하나만 렌더하고, 긴 목록은 1,000행을 넘을 때만 창을 자른다. 화면은 draft이며 승인된 baseline이 아니다.

| 컴포넌트 | 책임 | 반드시 구현할 상태 |
| --- | --- | --- |
| ClearanceSetting | `여유 틈` fieldset. 승인된 0·5·10·20mm를 `0cm`·`0.5cm`·`1cm`·`2cm` 칩(`button aria-pressed`, 정확히 하나 pressed)으로 표시하고 설명 문단을 `aria-describedby`로 연결한다. 입력 form의 접힌 details와 모바일 시트·데스크톱 열의 `FilterPanel`에 같은 fieldset을 쓰되 `useId`로 설명 id를 복사본마다 다르게 둔다 | default 0.5cm, selected, persisted, re-search, reset |
| EmptyState | 이유 하나당 `div.space-empty[data-reason]` 하나. `noData`(자료 실패)·`stopped`(첫 page 전 사용자 중지)는 `role="status"`와 `맞는 수납함 찾기` 재시도, `filters`는 요약 아래 `처음대로 돌리기`와 모바일 `다시 골라보기`, `noFit`은 요약만 둔다. page가 이미 있으면 stopped는 빈 블록 없이 status 문장만 남긴다 | noData, stopped, filters, noFit, retry, reset, reselect |
| DeferredRow | 200번째 이후 결과 행 `li`에 `space-row-deferred`를 붙여 `content-visibility: auto`와 `contain-intrinsic-size: auto 28rem`을 적용한다. 행 내용·`data-candidate-id`·링크는 그대로다 | deferred, non-deferred |
| WindowedRows (`windowing.ts`) | 렌더 행이 1,000개를 넘을 때만 `windowRange`로 보이는 구간 ±20을 렌더한다. 앞뒤에 `li[aria-hidden]` 스페이서를 두고 평균 행 높이(ResizeObserver, 실패 시 480px)로 크기를 정한다. 창 모드에서만 `aria-setsize`/`aria-posinset`을 행에 둔다 | below threshold, windowed, spacer, measured height |

- 여유 틈을 결과 화면에서 바꾸면 현재 입력으로 검색을 다시 실행하되 초점은 누른 칩에 그대로 둔다(결과 화면을 유지한 채 새 page를 기다린다). 입력이 오래됐거나 잘못됐으면 기존 오류 흐름을 쓴다.
- `처음대로 돌리기`는 정렬·판매처·모양과 여유 틈을 0.5cm로 되돌린다. 여유 틈이 실제로 달라졌을 때만 검색을 다시 실행한다.
- 결과 요약의 첫 page 초점 이동·`aria-live` 규칙은 PR-B와 같다. `noFit`의 추가 안내 문구는 승인 전이라 `copy-todo`로만 남긴다.
- 새 색상 쌍은 없다. `space-empty`는 `--zari-surface-subtle` 바탕에 `--zari-text-primary`/`--zari-border-subtle`를 쓰고 기존 `primary-on-subtle`·`secondary-on-subtle` 사례로 확인한다.

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

### SpaceFit 글자 토큰 (PR-E)

| 역할 | 토큰 | 값 |
|---|---|---|
| 화면 제목 h1 | `--zari-type-display(-wide)`, `-display-line`, `-display-tracking`, `--zari-font-display` | 2rem(1024px 이상 2.5rem) / 1.25 / 0 / 600 |
| 결과 수량 줄(유일한 강조) | `--zari-type-result(-wide)`, `-result-line`, `-result-tracking` | 2rem(2.5rem) / 1.18 / 0 / 700 |
| 행 제목·요약·시트 제목 | `--zari-type-title`, `-title-line` | 1.25rem / 1.4 / 0 / 600 |
| 본문·secondary 본문 | `--zari-type-body`, `-body-line`, `--zari-type-tracking-text`, `--zari-font-text` | 1.125rem / 1.6 / 0 |
| 단추·칩·링크 행 | `--zari-type-label-line` | 1.35, 최소 높이 48px |

### SpaceFit 결과 줄 (PR-F)
| 역할 | 값 |
|---|---|
| 상품명(단일은 `{n}개` 생략) | 18px / 1.35 / 600, 아래 8px |
| 수량 줄 | 32px(1024px 이상 40px) / 1.18 / 700, 아래 8px |
| 남는 공간 | 18px / `--zari-type-secondary-line` 1.45 / 400 / 보조색, 축별 nowrap 단위 |
| 가격 줄 | 18px / 1.35 / 600, 위 12px. `kind`: priced·listing·unknown |
| 참고 가격 설명 | 18px / 1.45 / 보조색, 위 4px |
| 판매처 알약·참고치 알약 | 위아래 4px, 좌우 12px, 500. 참고치 단추 누름 영역 48px 유지 |
| 링크 상자 | 이름 500, 행동 400, 두 줄 간격 4px, 안쪽 12px/16px |
| 필터 묶음 | 묶음 사이 32px, 제목→칩 12px |
| 손그림 칸 | `--zari-sketch-size` 72px, 그림 있을 때만, alt="" (제목이 이름을 말함) |
