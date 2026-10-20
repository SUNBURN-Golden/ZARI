# 사용자 검수용 계획 패키지 (draft)

이 디렉터리는 **검수용 draft**다. 승인된 화면·baseline·출시 산출물이 아니며, 승인 수는 0이다. `manifest.json`의 파일 해시는 `node scripts/check-review-package.mjs`로 검증한다.

## 무엇인가

z-product-qualification 여정이 실제 Chromium + IndexedDB + WASM Worker 위에서 채택한 **하나의 PlanSnapshot**에서 출력 패널이 만든 실제 계획 패키지다. 도면·배치·미배치·검사·구매 목록·실행 순서가 모두 `manifest.json`의 `planRevision`(계획 ID)을 공유한다.

| 파일 | 내용 |
|---|---|
| `plan-package.html` | 인쇄 미리보기의 패키지 DOM을 tokens.css·project.css를 인라인한 독립 HTML로 저장한 것 |
| `zari-plan-*.csv` | 계획 전체 CSV(공유 범위 기본값) |
| `zari-bom-*.csv` | 구매 목록 CSV |
| `manifest.json` | 계획 ID·소스 SHA·파일 해시·재현 명령·증거 등급 |

## 증거 등급

- **합성(synthetic)**: 데모 카탈로그(`데모 · 합성 데이터`)로 만든 계획이다. 실제 상품·실제 판매처·실기기 증거가 아니다.
- **재현 명령**: `ZARI_REVIEW_DIR=<dir> npx playwright test apps/web/tests/browser/product-journey.spec.ts --project=chromium --workers=1` (실행 전 `npm run test:build` 필요). 같은 소스·같은 엔진이면 같은 planRevision이 나온다.

## 검수 포인트

1. 모든 쪽·모든 CSV 행에 같은 계획 ID(`planRevision`)가 찍혀 있는가.
2. 미확인 검사와 미배정 물건이 숨겨지지 않고 목록에 남는가.
3. 개인정보 포함 범위가 기본 "모두 제외"인가(프로젝트 이름이 '이름 숨김'으로 표시되는가).
4. 구매 링크·가격이 "미확인"을 "₩0/무료"로 바꾸지 않는가.

## 미결정(원래 분모 그대로)

전화·전용 GPU(UNQUALIFIED), 실제 사이트 수집(UNQUALIFIED), 캡처 수용(PENDING), 출시(NOT_AUTHORIZED), z-local-delivery(NOT_STARTED). `docs/qualification/z-denominator.json` 참조.
