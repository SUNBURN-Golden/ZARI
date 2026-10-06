# ZARI 디자인 결정 기록

## D001 — 독자적 작업 화면 / 방향 확정

근거: 사용자가 Apple식 정교함과 흔한 바이브코딩 템플릿 느낌 최소화를 요청했다. IKEA·Elfa는 수납 설계·구매 흐름의 레퍼런스로 유지한다.

결정: 앱 전체를 Apple 제품으로 위장하거나 상용 플래너 화면을 복제하지 않는다. 공간·치수·물건·검사·구매목록의 연결을 ZARI 고유 경험으로 설계한다.

범위: 방향의 확정이다. 색상 수치·화면 시안 승인과 다르다.

## D002 — 코드 기반 디자인 기준 / 적용

DESIGN.md, semantic CSS 토큰, 핵심 화면·컴포넌트 명세, 검토 체크리스트, baseline manifest를 같은 레포에서 관리한다. 프롬프트 원문과 SOURCE_MANIFEST는 변경하지 않는다.

스크린샷만 저장하는 방식은 상호작용과 상태를 충분히 기록하지 못하므로 코드·명세와 연결한다. Figma가 생겨도 링크만 보관한 것을 원본 전체 백업으로 간주하지 않는다.

## D003 — light 테마와 절제된 토큰 / 구현 초안

warm neutral, charcoal, muted green accent의 최소 토큰을 작성한다. 실제 화면 검토 전 값은 초안이다. 전면 glassmorphism·자동 dark theme·글꼴 파일 번들링은 포함하지 않는다. 대비 검사는 토큰 쌍 수준이며 전체 UI 승인이 아니다.

## D004 — 도구는 아직 설치하지 않음 / 후보 유지

React Aria를 기본 동작의 우선 후보, Motion을 제한적 전환 후보, Impeccable을 디자인 비평 후보로 둔다. 이번 작업은 디자인 기준 등록이므로 설치·전역 훅·의존성·자동 업데이트를 추가하지 않는다. 도입 시 버전·라이선스·실행 범위를 별도 기록한다.

## D005 — 승인과 검증의 분리 / 적용

현재 approved baseline은 0개다. 등록 커밋, 계산 테스트 통과, AI의 ‘좋아 보임’은 사용자 시각 승인과 다르다. 캡처 생성→기술 검토→사용자 또는 명시적 위임자의 승인→baseline 기록을 구분한다.

## D006 — 아키텍처 단계의 UI 기반 구체화 / 제안, 설치 전

문제: 후보 도구만으로는 구현자가 입력 파서와 상태 계약을 다르게 선택할 수 있습니다. [FRONTEND.md](../docs/FRONTEND.md)와 [DESIGN_SYSTEM.md](../docs/DESIGN_SYSTEM.md)에서 React Aria Components를 복합 컨트롤 기반으로, native HTML을 단순 의미 요소로 구체화합니다. 치수는 raw string TextField로 보존하고 Rust가 정규화합니다. Base UI를 중복 도입하지 않습니다.

선택·성공·미확인·stale·disabled를 분리하는 semantic token 추가안, 키보드·모바일·검사 전 ghost 동작과 시각 승인 경로를 명시했습니다. 기존 색상 seed와 CSS는 이번 문서 작업에서 바꾸지 않습니다. Motion·Storybook·Impeccable은 별도 도입 사유가 생길 때 검토하며 설치·훅·자동 실행은 없습니다.

D004의 ‘검토 후보’ 상태를 아키텍처 제안 수준에서 구체화하며, D001 방향과 D005 사용자 시각 승인 규칙을 유지합니다. 실제 패키지 호환성은 Task001, 새 토큰 대비와 화면은 관련 UI 작업에서 검증합니다. 구현·사용자 화면 승인 완료를 뜻하지 않습니다. 되돌리기는 실제 도입 전 제안 변경이며, 도입 후에는 새 결정과 변경 영향 검토가 필요합니다.

## D007 — 읽기 전용 3D 절개 보기에 Three.js 도입 / 채택

- 상태: 채택(사용자 결정 2026-09-30). SP-005가 exact pin을 기록했다.
- 문제: 공간 작업대 설계(#35)의 읽기 전용 구획 3D는 [ARCHITECTURE.md](../docs/ARCHITECTURE.md) 선택 기록 "SVG top/front, no 3D dependency"와 충돌한다. Fable G0 감사([#35 댓글](https://github.com/BeautifulMind-JT/ZARI/pull/35#issuecomment-5905430288))가 이 점을 사용자 결정으로 올렸다.
- 변경 대상: ARCHITECTURE.md 선택 기록(편집은 SVG 유지, 3D는 읽기 전용 보조 보기), SP-001의 WASM 계약(새 projectSpatialView 명령, BUILD_ID zari-domain-3→zari-domain-4, capability 목록, 새 DomainOperation, 생성 DTO)과 [WASM_PROTOCOL.md](../docs/WASM_PROTOCOL.md)·[TEST_STRATEGY.md](../docs/TEST_STRATEGY.md) 갱신, SP-005의 package.json·lock.
- 검토한 대안: (A) 설계대로 Three.js 읽기 전용 절개 보기. (B) dependency 없는 SVG 사선·등각 투영. (C) SP-001~004만 먼저 하고 3D는 나중.
- 선택: A. 사용자가 요청한 다섯 기능 중 하나이고, [MASTER_PROMPT_KO.md](../docs/MASTER_PROMPT_KO.md)가 3D를 후속 보조 보기로 예정하고 threejs.org를 기준으로 든다.
- 조건: MIT, SP-005에서 upstream 0.186.1의 registry availability·라이선스·타입을 확인한 뒤 exact pin. lazy 로컬 chunk, CDN·원격 asset 없음, demand render, 정리·복구, WebGL을 쓸 수 없으면 2D로 대체. R3F·Drei·3D 편집 없음.
- 확정 pin (SP-005): runtime `three@0.186.1` (MIT, registry integrity `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`). npm에 `@types/three@0.186.1`은 없고, 같은 0.186 대의 공개 타입은 `0.186.0`이다 (MIT, integrity `sha512-mxYSBpDC+D0pLfSP6sW4WZTcT+nrtmZcimMqnVmy36Hte3XpeYSrvgg4TRdaM1GemGog1AWzI5qL2VoIfMXbJQ==`). 둘 다 exact pin이다. 타입 패키지는 devDependency이며 앱 번들에 넣지 않는다. 이 노드가 컴파일하는 범위는 WebGLRenderer, OrthographicCamera, InstancedMesh, OrbitControls, Raycaster, PlaneGeometry, BoxGeometry, EdgesGeometry이다. R3F·Drei·WebGPU·원격 asset은 dependency가 아니다. `npm audit`는 three 그래프 밖의 기존 개발 도구만 집계한다(esbuild 0.28.0 low, vite→postcss→source-map-js 1.2.1 high). three@0.186.1 권고는 없다. 이 노드는 그 도구를 올리지 않는다.
- 접근성·성능: 3D는 보조 보기다. 모든 정보와 조작은 2D와 텍스트 목록으로 가능하다. 번들·렌더 시작 비용은 SP-005·SP-006에서 측정하고 목표와 실적을 구분해 기록한다.
- 사용자 승인 근거: 2026-09-30 AIOPS 세션에서 사용자가 Fable G0 결정 질문에 "A"로 답했다.
- 되돌리기: SP-005 병합 전에는 이 결정만 바꾸면 된다. 병합 뒤에는 새 결정으로 dependency와 3D 보기를 제거하며, 2D·Rust 계약은 3D와 독립이라 영향이 없다.

## 새 결정 기록 양식

ID / 상태 / 문제 / 변경 대상 / 검토한 대안 / 선택 이유 / 접근성·성능 영향 / 전후 화면과 코드 SHA / 사용자 승인 근거(해당 시) / 되돌리기 경로.

기존 결정을 조용히 덮어쓰기보다 supersedes 관계를 기록한다. 버전 충돌·글꼴 변경·토큰 전역 변경·컴포넌트 기반 교체는 새 결정을 남긴다.
