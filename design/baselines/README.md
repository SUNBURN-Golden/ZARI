# 시각적 기준 관리

현재 승인된 화면은 **0개**다. `manifest.json`의 `baselines` 배열은 비어 있으며 실제 screenshot·Figma 원본은 없다. 문서나 CSS를 GitHub에 올린 것은 화면 승인과 다르다.

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
