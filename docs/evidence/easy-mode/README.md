# ZARI Easy Mode — 2026-11-02 review1 수정 근거

사용자 요청: `/workspace/zari-easy-run/review1.md`의 필수 수정 1–5. 작업 브랜치 `feat/easy-mode`. 배포·push·main 변경·merge·화면 승인은 수행하지 않는다.

| 필수 수정 | 반영 |
| --- | --- |
| 1. 기본 쉬운 모드·전문가 모드·최근 모드 | App 입구 분리, `#/easy`, 기존 전문가 직접 경로와 testid 유지, `zari.mode.v1` |
| 2. 첫 화면·4단계·뒤로가기·저장·그림·단위 확인 | EasyMode, SizeFields, 자체 방/줄자 SVG, `zari.easy.v1` versioned 임시 입력, 5cm·2000cm 확인, 손상/저장 실패 처리 |
| 3. Rust 판정·3단계 결과·방향·접힌 상세 | 기존 `evaluate_probe`를 세 방향에 재사용, Rust에서 20mm 경계·차이 계산, 같은 결과의 그림·표, 별도 전용 Worker |
| 4. 접근성·모바일·회귀 검사 | Playwright easy-mode 9개, 화면별 글자·버튼·주요 행동·금지어·axe·넘침·고정 행동, 복원·단위·실패·native/WASM 비교; 기존 전문가는 기억된 전문가 모드로 검사 |
| 5. 캡처·측정·문구·상태 기록 | `/workspace/shots/zari-easy/`, 32개 PNG와 metrics.json, copy-candidates.md; 재생성은 `node scripts/easy-artifacts.mjs` |

## 계산 범위

한 물건을 입력한 방향 그대로 둔 명목 크기 확인이다. 회전·검색·수량 배치·설치·문 열기·접근·측정 오차를 검증한 PlanSnapshot이라고 주장하지 않는다. opening/access는 unknown으로 남으며 화면에도 별도 확인을 요청한다. 빈 값·유효하지 않은 값은 unknown이고 성공이 아니다. 여유 간격은 추가하지 않는다. 실제 상품 치수를 꾸며 넣지 않으며 예제는 연습용으로 표시한다.

새 DTO와 검증기는 Rust에서 생성했다. 기존 protocol identity·DB version·프로젝트·카탈로그·보존 프롬프트·SOURCE_MANIFEST는 변경하지 않았다. 기존 baseline 파일·manifest를 승인하거나 새 이미지로 교체하지 않는다.

## 렌더링 근거

1440×900, 390×844 각각 light/dark에서 welcome, item, room, space, result-fits, result-details, result-tight, result-fails를 측정하고 정확한 viewport 크기의 PNG를 기록한다. metrics.json은 실제 브라우저 수치와 소스/이미지 SHA-256을 포함하며 복사본을 이 폴더에 커밋한다. supporting-copy의 copy-todo 목록은 `design/EASY_COPY_CANDIDATES.md`와 산출물의 copy-candidates.md에 있다.

실측: 본문 최소 18px, 결과 32px, 단추 최소 48px, 주요 행동 각 1개, 가로 넘침 0px, axe 위반 0건. 토큰 대비 88/88과 checker 자체 시험 13개 통과. 390px light 측정 화면, dark 아슬아슬 결과, desktop light 결과를 실제 이미지로 확인했다. 캡처는 모두 draft이며 사용자 시각 승인·수동 스크린리더 검증·전체 WCAG 인증은 아니다.

## 검증 기록

검증 명령과 최종 결과는 `docs/IMPLEMENTATION_STATUS.md`의 2026-11-02 항목을 따른다. 이 작업 중 첫 전체 실행의 실패를 숨기지 않는다.

- 첫 Chromium 전체, workers=2: 155 통과 / 2 실패. product-completion의 Worker 차단 재현과 progress의 검색 완료가 대기 시간 안에 도달하지 않았다.
- 첫 Firefox 전체, workers=2: 150 통과 / 7 실패. 새 화면 4건은 바닥 좌표 `843.999969...`와 `844`의 정밀도 차이였고, 좌표 검사를 소수점 둘째 자리 비교로 수정했다. 나머지는 guided-onboarding·incremental-replan·plan의 기존 검색 대기 경로다. 크기·접근성 기준은 낮추지 않았다.
- Chromium 직렬 전체와 Firefox 후속 실행으로 동시 부하 영향을 분리한다. 실패를 없애기 위해 timeout·판정·baseline을 바꾸지 않는다.
- Chromium 직렬 전체는 157/157 통과했다. 이후 최종 코드 검토에서 예제 공간을 유지한 ‘다른 물건 해보기’의 예제 표시도 보존하도록 수정하고 별도 경로 시험에 포함했다.
- 최종 코드의 쉬운 모드 9개를 Chromium·Firefox에서 실행해 18/18 통과했다. 같은 8개 경계 입력의 native 결과와 실제 Worker/WASM 전체 JSON도 일치했다. 기존 공통 fixture 124개와 잘못된 프로토콜 입력의 실제 브라우저 parity 2개도 통과했다.
- 최초 Firefox 전체 실행에 남았던 전문가 검색 3건도 기존 timeout을 유지한 직렬 후속 실행에서 3/3 통과했다. 이 기록은 수정 후 Firefox 전체의 단일 실행 통과를 뜻하지 않는다. 최종 vitest는 51파일 427/427, production build/release manifest도 통과했다.
- WebKit 설치 파일은 받았으나 host의 libevent/gstreamer/avif/soup/manette/enchant가 없어 launch preflight가 실패했다. 저장소의 user-space provisioning과 표준 install-deps도 패키지 서버 HTTP 500/TLS 오류로 실패했다. WebKit 검증 완료로 보고하지 않는다.

다음 작업은 독립 exact-HEAD 검토, 보조 문구와 화면의 사용자 검토, WebKit 의존성이 갖춰진 host의 검증이다. 실제 모바일 기기와 수동 스크린리더는 미검증이다.
