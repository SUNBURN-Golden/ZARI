# 시각적 기준 관리

실제 앱 화면 **78개를 draft로 캡처했으며 승인된 화면은 0개**다. Task001 5개, ZARI-SPATIAL-007 47개, ZARI-SPATIAL-011 26개다. `manifest.json`에 PNG 경로, SHA-256, 정확한 소스 commit과 캡처 환경을 기록했다. React → Worker → Rust/WASM 계산이 실제 동작하는 화면이며 생성 이미지나 Figma 목업이 아니다. 파일 등록은 화면 승인을 뜻하지 않는다.

## Task001 실제 화면

| 상태 | 파일 | 의미 |
|---|---|---|
| Desktop 정상 | [desktop-pass.png](draft/zari001/desktop-pass.png) | 600mm 공간 / 590mm 필요 폭, 묶음 3·공급 6·잉여 1 |
| Desktop 초과 | [desktop-fail.png](draft/zari001/desktop-fail.png) | 물체 폭195mm, 필요 폭605mm |
| Desktop 미확인 | [desktop-unknown.png](draft/zari001/desktop-unknown.png) | 공간 폭을 비워 unknown, 독립 묶음 계산은 유지 |
| Desktop 포커스 | [desktop-focus.png](draft/zari001/desktop-focus.png) | 공간 폭 입력 포커스와 해당 치수선 연결 |
| Mobile 정상 | [mobile-pass.png](draft/zari001/mobile-pass.png) | 390px 폭의 입력→도식→수량→검사 흐름 |

Desktop viewport는1440×1000, mobile은390×844이고 full-page 캡처라 이미지 높이는 더 크다.
캡처 소스는 `79b6b7395d94eac18d15add4709edf3f1c188223`, 작업 트리는 clean이었다.
뒤의 캡처 등록 커밋은 앱 계산·렌더링 코드를 바꾸지 않는다. 이 baseline은 Task001의 폭 검사 화면에만 해당하며 전체 제품 작업대/S01–S03의 완성·승인이 아니다.

`ui-bootstrap-synthetic-v1`은 `apps/web/src/worker/useProbe.ts`의 초기 입력과 `apps/web/tests/browser/capture.spec.ts`의 상태별 override로 정의한다. 공간600mm, 물체190mm, 줄 수량3, 필요5, pack2, 좌우/사이 여유5mm가 기본이다. 측정 origin은 userDeclared/uncertainty unknown/evidenceIds 빈 배열, 여유는 synthetic/unverified다. 초과 상태만 물체195, 미확인 상태만 공간 빈 문자열이며 focus 상태는 공간 폭 input을 선택한다. 실제 개인 데이터나 상품은 없다.

원본 캡처 명령과 환경별 Chromium 실행 옵션은 manifest에 있다. 로컬 대체 Chromium 실행 파일은 테스트 호스트의 도구이며 앱 의존성이 아니다. 일반 환경은 `npx playwright install chromium` 후 다음처럼 새 경로로 캡처한다:

```bash
ZARI_CAPTURE_DIR=/tmp/zari-new-captures npm run capture:baselines
```

기존 출력 경로가 있으면 캡처가 실패한다. 새 draft를 비교·검토한 뒤에만 manifest에 등록하며, 자동 승인·baseline 교체는 하지 않는다.

## ZARI-SPATIAL-007 실제 화면

47개 viewport 캡처는 `draft/zari007/`에 있고 상태는 모두 `draft`다. 승인 수는 0이다. `spatialDraft007.proposedApprovalSet`은 사용자 검토용 제안이며 승인이 아니다. 픽셀은 물리 검증 증거가 아니다.

캡처 소스 제품 트리는 `29370e23a082c49aa4d8d7943b0e6e71c7884b4c`의 `apps/web/src`와 같다. 시나리오 파일 해시는 `spatialDraft007.scenarioFiles`에 있다. 작업 트리는 캡처 시점의 테스트·문서 변경 때문에 `sourceDirty`다. Fixture는 `sample-project-form`(카탈로그 `249cfb4185353ecb69c140ba6e7830b8670dd07708efa1d8cf0d5cee6e96be81`)이다. 개인 데이터와 외부 업로드는 없다.

Viewport는 1440×1000과 390×844, `deviceScaleFactor` 1, full-page가 아니다. Chromium headless, locale `ko-KR`, theme light, `prefers-reduced-motion: reduce`(`--zari-duration-fast` 0s). GPU는 SwiftShader software GL이다. 실제 전화, 외장 GPU, WebKit 오프라인은 찍지 않았다.

`npm run capture:baselines`는 Chromium만 실행한다. 출력 디렉터리가 이미 있으면 실패한다.

## ZARI-SPATIAL-011 실제 화면

26개 viewport 캡처는 `draft/zari011/`에 있고 상태는 모두 `draft`다. 승인 수는 0이다. `spatialDraft011.proposedApprovalSet`은 사용자 검토용 제안이며 승인이 아니다. SP-007 승인 수를 이 화면의 승인으로 쓰지 않는다. 픽셀은 물리 검증 증거가 아니다.

캡처 소스 제품 트리는 `6f1c5c696d964487f8b52cdec428ae6cd0aba596`의 `apps/web/src`와 같다. 시나리오 파일 해시는 `spatialDraft011.scenarioFiles`에 있다. 작업 트리는 캡처 시점의 테스트·문서 변경 때문에 `sourceDirty`다. Fixture는 `fresh-ordinary-project`다. 개인 데이터와 외부 업로드는 없다. 메모의 충돌처럼 보이는 문장은 사람 글이고, Worker의 `conflictingEvidence` 행을 만들지 않는다.

Viewport는 1440×1000과 390×844, `deviceScaleFactor` 1, full-page가 아니다. Chromium headless, locale `ko-KR`, theme light, `prefers-reduced-motion: reduce`(`--zari-duration-fast` 0s). GPU는 SwiftShader software GL이다. 실제 전화와 외장 GPU는 찍지 않았다.

## 이후 등록 절차

1. 실제 코드에서 대표 상태를 렌더링하고 screenshot을 캡처한다. AI 생성 이미지는 콘셉트일 뿐 앱 실행 캡처가 아니다.
2. 처음에는 draft로 등록하고 코드 SHA, route 또는 story ID, 상태, fixture 식별자, viewport, DPR, 브라우저·OS·글꼴, locale, theme, reduced motion, 캡처 명령을 기록한다.
3. 기술 검토와 시각적 선택을 구분한다. 명시적 사용자 승인 또는 사용자가 지정한 승인권자의 근거가 있을 때만 approved로 바꾼다. AI는 승인자를 만들어내지 않는다.
4. 변경 시 before/after/diff와 이유를 남긴다. 스크린샷 테스트를 통과시키기 위해 자동 갱신하지 않는다.
5. 큰 파일은 필요할 때 적절한 보관 방식을 검토한다. 외부 링크의 내용을 GitHub에 백업한 것으로 주장하지 않는다.

## baseline 항목의 필수 정보

id, status(draft/approved/retired), file, sha256, sourceCommit, screenOrStory, state, fixtureId, viewport(width/height), deviceScaleFactor, browserAndVersion, os, fontEnvironment, locale, theme, reducedMotion, captureCommand, capturedAt.

approved 항목에는 approvedBy, approvalReference, approvedAt을 추가한다. 아직 알려지지 않은 정보는 null로 남기고 approved로 승격하지 않는다. 이 목록은 계약이며 현재 placeholder 이미지 항목을 생성하지 않는다.

개인 집 사진·주소·물건 목록은 실제 사용자 동의 없이 baseline에 사용하지 않는다. 공개 레퍼런스 이미지도 재사용 권한을 확인한다. 합성 fixture와 권한이 있는 자료를 우선한다.
