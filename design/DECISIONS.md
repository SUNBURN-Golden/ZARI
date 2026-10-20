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

## D008 — 측정 완성 ADR와 signed-offset 정규화 / 채택

- ID: D008
- 상태: 채택. 사용자 결정 2026-10-07 00:31 KST. SP-008만 해당한다. SP-009부터 SP-016은 후보로 남는다.
- 문제: 이후 UI가 정규화, 근거 신뢰, 다음 사실의 우선순위를 스스로 만들 수 있다. 부호 있는 오프셋은 양의 길이 규칙으로 검사되어 `0±0`, 0을 가로지르는 구간, 합법적인 음수 구간이 거절되었다.
- 변경 대상: [docs/adr/SP-008-measurement-completion.md](../docs/adr/SP-008-measurement-completion.md), Rust raw/normalize/protocol과 생성 계약, `BUILD_ID` `zari-domain-4`에서 `zari-domain-5`로. capability 목록과 persisted `schemaVersion` 1은 그대로다. `queryNextFacts`는 ADR과 비공개 스키마 Rust 타입에만 고정하고 명령·capability·생성 스키마로 내보내지 않는다.
- 검토한 대안: (A) 오프셋 구간을 PositionMm 끝점과 ClearanceMm 경계로 따로 검사하고, 그룹 형식은 기존 `normalizeInput`의 추가 필드로 둔다. (B) 양의 길이 검사를 `abs(nominal)`에 유지한다. (C) 다음 사실 query를 이 노드에서 실행 가능한 명령으로 등록한다.
- 선택: A. 지원되는 raw DTO와 schemaVersion 1이 사실을 표현하므로 마이그레이션, 새 geometry, provider, 권한은 없다. B는 합법적인 0과 음수 구간을 거절한다. C는 SP-010의 범위다.
- 조건: unknown을 통과나 기본값으로 바꾸지 않는다. `UserMeasured`는 Unverified다. `Evidence.note`는 사람 텍스트이며 숫자·기하·충돌·Confirmed의 근거가 아니다. 카탈로그와 보유 용기 물리는 프로젝트에서 읽기 전용이다. 이전 유효 fixture의 기대 출력은 `engineContext.buildId` 재고정 외에는 바이트가 같다. Fable ARCHITECTURE와 비작성자 A3는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 사용자 승인 근거: JunTae Park (저장소 소유자), 2026-10-07 00:31 KST, 원문: "008 ADR 채택한다. Fable 게이트는 앞 노드처럼 독립 리뷰 2회로 대체하고, 머지도 네가 해라."
- 되돌리기: SP-009 전에 이 결정과 `zari-domain-5` 계약을 되돌리려면 새 결정으로 BUILD_ID와 오프셋 규칙을 함께 되돌린다. 이미 저장된 schemaVersion 1 레코드의 의미는 바꾸지 않는다.

## D009 — 오차·근거·v1 상세 사실 입력 / 채택

- ID: D009
- 상태: 채택. 사용자 결정 2026-10-07 약 07:28 KST. 이 기록은 SP-009만 다룬다. 같은 발화의 SP-010·SP-011은 각 노드에서 구현한다.
- 문제: 새 일반 프로젝트가 샘플의 지지·50000 g·handling 5 mm·0을 사실로 물려받고, 오차·근거·staging·handling을 JSON 없이 저장하지 못한다.
- 변경 대상: [docs/adr/SP-009-detail-facts.md](../docs/adr/SP-009-detail-facts.md), 프로젝트 상세 패널, `emptyProjectForm()`, 세션의 그룹 단위 변환과 CAS 커밋. SP-008의 `normalizeInput` raw surface, `BUILD_ID` `zari-domain-5`, capability, 생성 공개 계약은 그대로다.
- 검토한 대안: (A) 기존 raw DTO와 Worker 정규화만으로 상세 입력을 붙인다. (B) 완료 query나 관측 스키마를 이 노드에서 연다. (C) 샘플 가정과 저장된 프로젝트를 마이그레이션으로 지운다.
- 선택: A. 지원되는 raw와 schemaVersion 1이 사실을 표현한다. B는 SP-010의 범위다. C는 기존 저장과 샘플 체험을 덮어쓴다.
- 조건: unknown으로 시작하고, 빈 경계를 0으로 두지 않는다. 한 필드가 잘못되면 정규화된 입력·근거 전체를 커밋하지 않고 이전 커밋과 원문 초고는 남긴다. `UserMeasured`는 Unverified다. `Evidence.note`는 사람 텍스트이며 충돌·통과·실패·구간·확인의 근거가 아니다. 카탈로그 물리는 기존 편집 화면으로만 간다. 새 프로젝트의 baseSupport와 item handling 다섯 축은 unknown이다. Fable MILESTONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 약 07:28 KST, 원문: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라."
- 되돌리기: 화면과 `emptyProjectForm()`의 fresh 초기화만 되돌리면 된다. 이미 저장된 schemaVersion 1 레코드와 샘플 체험은 이 결정으로 다시 쓰지 않는다.

## D010 — 다음 확인 사실 query / 채택

- ID: D010
- 상태: 채택. 사용자 결정 2026-10-07 약 07:28 KST. 이 기록은 SP-010만 다룬다. 같은 발화의 SP-011은 구현하지 않는다.
- 문제: 다음으로 확인할 사실을 화면이 고르면 우선순위, 중복, stale, 한도가 Rust 판정과 갈라진다.
- 변경 대상: [docs/adr/SP-010-completion-query.md](../docs/adr/SP-010-completion-query.md), Rust `queryNextFacts`, 생성 DTO·schema·TS, Worker·클라이언트, 프로젝트 화면의 다음 사실 목록. `BUILD_ID`는 `zari-domain-5`에서 `zari-domain-6`이다. capability는 `disposeProject` 바로 앞에 `queryNextFacts`를 더한다. persisted `schemaVersion` 1과 SP-008 우선순위 표는 그대로다.
- 검토한 대안: (A) SP-008에 고정된 DTO 의미로 순수 쿼리를 실행하고, 사실 검사로 need를 채운다. (B) 메모나 화면 규칙으로 충돌·통과를 만든다. (C) 한도를 넘으면 앞부분만 보여 준다.
- 선택: A. 지원되는 raw·schema·rule이 사실을 표현한다. B는 사람 문장을 판정으로 올린다. C는 잘린 목록을 성공으로 보인다.
- 조건: unknown을 통과나 0 경계로 바꾸지 않는다. 충돌은 구조화된 현재 검사 또는 `UnknownReason::ConflictingSources`와 그 참조뿐이다. 쿼리는 검색·재가격·재확정·activation·카운터·DB를 쓰지 않는다. 행 512, check ref 2048, 응답 5 MiB를 넘으면 전체 거절이다. 스냅샷이 없거나 stale이면 현재 검사를 빌리지 않는다. 소스마다 요청은 하나이고, 초점·키 입력은 쿼리하지 않는다. 늦은 응답은 현재 목록을 그리지 않는다. Fable ARCHITECTURE와 비작성자 A3는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 목록은 키보드와 최소 터치 높이를 쓴다. 색은 기존 semantic token이다. Rust 쿼리 p95 목표는 20 ms이고, Worker 왕복·디코드·렌더는 그 목표와 따로 측정한다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 약 07:28 KST, 원문: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라."
- 되돌리기: 이 결정과 `zari-domain-6` capability를 함께 되돌리는 새 결정이 필요하다. 이미 저장된 schemaVersion 1 레코드의 의미는 바꾸지 않는다.

## D011 — 측정 완성 통합 검증과 새 draft capture / 채택

- ID: D011
- 상태: 채택. 사용자 결정 2026-10-07 약 07:28 KST. 이 기록은 SP-011만 다룬다. 캡처 파일 등록은 화면 승인이 아니다.
- 문제: SP-009·SP-010이 바꾼 상세 입력과 다음 사실 목록은 SP-007 캡처에 없다. 그 화면을 007의 승인처럼 다루면 새 상태가 검사되지 않는다.
- 변경 대상: [docs/adr/SP-011-integration-capture.md](../docs/adr/SP-011-integration-capture.md), `design/baselines/draft/zari011/` draft 항목, 측정 완성 브라우저·벤치 시나리오, `docs/evidence/ZARI-SPATIAL-011.md`. 승인 수, SP-001–007 이미지, Rust 계약, `BUILD_ID`는 그대로다.
- 검토한 대안: (A) 실제 Worker 화면으로 fresh·명목 오차·unknown·빈 경계·사람 메모·staging·하중 unknown·카탈로그·다음 사실·stale·탭 충돌을 1440과 390에서 새로 찍고, 타이밍과 실패는 따로 기록한다. (B) SP-007 이미지를 이 화면의 승인으로 재사용한다. (C) 메모의 숫자를 파싱해 충돌 행이나 Confirmed를 만든다.
- 선택: A. 지원되는 화면과 fixture가 사실을 보여 준다. B는 새 입력 화면을 옛 승인에 숨긴다. C는 사람 문장을 판정으로 올린다.
- 조건: unknown을 통과나 0 경계로 바꾸지 않는다. 메모를 바꿔도 원문은 남고 semantic digest만 바뀌며, 충돌 행은 구조화된 이유에서만 나온다. 캡처는 draft다. 전화와 전용 GPU가 없으면 그 범위는 UNQUALIFIED다. 노드 `DONE`은 보호된 exact-head 머지 뒤에만 해당한다. 자격·승인·출시는 따로 적는다. 이 프로그램은 출시를 허가하지 않는다. Fable MILESTONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 약 07:28 KST, 원문: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라." 이 문장은 후보 채택이다. `zari011` 이미지의 exact-set 화면 승인은 아니다.
- 되돌리기: draft 항목과 이 결정만 걷어 내면 된다. 승인 수와 SP-007 이미지, 저장된 schemaVersion 1 레코드는 이 결정으로 다시 쓰지 않는다.

## D012 — 행동·조건·버전·평가 계약 / 채택

- ID: D012
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 SP-012만 다룬다. 같은 발화의 SP-013·014·015·016은 각 노드에서 구현한다.
- 문제: 현재 `build_actions`는 내용물 옮기기의 선행을 설치로 두고, `requiredConfirmations`와 `reasonIds`를 비운다. `RunEval`은 후보 평가 전체를 한 비용으로 호출한다. 화면 체크박스가 이 빈칸을 사실 확인으로 채우면 안 된다.
- 변경 대상: [docs/adr/SP-012-action-evaluation.md](../docs/adr/SP-012-action-evaluation.md), DOMAIN_MODEL·SOLVER·WASM_PROTOCOL·PERSISTENCE·FRONTEND·TEST_STRATEGY의 SP-012 절, `docs/oracles/product-completion/`의 PC-01–11. `BUILD_ID` `zari-domain-6`, capability, 생성 schema, persisted `schemaVersion` 1, 기존 fixture 기대값은 그대로다. `queryActionEligibility`는 ADR에만 있고 명령이 아니다.
- 검토한 대안: (A) 가이드 순서·참조·버전·평가 단계를 계약과 손 계산 오라클로 고정하고 생산 코드는 다음 노드에 둔다. (B) 이 노드에서 `build_actions`와 `RunEval`을 바로 바꾼다. (C) 단계 id 문자열을 쪼개 ordinal을 복원하고, done을 Confirmed로 쓴다.
- 선택: A. 지원되는 현재 DTO가 역사 스냅샷을 표현하므로 마이그레이션은 없다. B는 SP-013·014의 범위다. C는 잘린 id와 사람 체크를 판정으로 올린다.
- 조건: unknown을 통과나 기본값으로 바꾸지 않는다. `done`은 사용자 행위 기록이고 사실·검사·Confirmed가 아니다. 인스턴스 ordinal은 구조화된 수다. 옛 스냅샷과 진행은 다시 쓰지 않고 다른 binding으로 옮기지 않는다. 다음 `BUILD_ID`와 `ruleVersion`·`solverVersion` 문자열은 구현 노드가 등록하기 전에는 없다. Fable ARCHITECTURE와 비작성자 A3는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 그 검토는 역사 호환, 물리 가이드 순서, 인스턴스 보존, 예산·취소 구분을 본다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."
- 되돌리기: 이 결정과 오라클·계약 절을 걷어 내면 된다. 저장된 schemaVersion 1 레코드와 기존 fixture는 이 결정으로 다시 쓰지 않는다.

## D013 — 실행 가이드 DAG와 unknown 조건·진행 guard / 채택

- ID: D013
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 SP-013만 다룬다. 같은 발화의 SP-014·015·016은 각 노드에서 구현한다.
- 문제: `build_actions`가 내용물 옮기기의 선행을 설치로 두고, `reasonIds`를 비운다. 화면이 그 빈칸을 물리 통과로 채우면 안 된다.
- 변경 대상: [docs/adr/SP-013-execution-guide.md](../docs/adr/SP-013-execution-guide.md), 가이드 생산자와 `queryActionEligibility`, 생성 계약, 진행 CAS, 가이드 문구. `BUILD_ID`는 `zari-domain-6`에서 `zari-domain-7`이다. `ruleVersion`은 `zari-domain-v1`에서 `zari-domain-v2`다. `solverVersion`, persisted `schemaVersion` 1, canonical 1, `ActionStep` 필드 모양은 그대로다.
- 검토한 대안: (A) 채택한 순서로 생산자를 바꾸고, 자격 읽기를 명령으로 연다. 옛 스냅샷은 읽기 전용으로 남긴다. (B) `requiredConfirmations`에 선행을 넣어 사용자가 완료할 수 없게 한다. (C) 단계 id를 쪼개 ordinal을 복원하고, done을 검사 통과로 쓴다.
- 선택: A. 지원되는 schemaVersion 1이 역사 스냅샷을 표현하므로 마이그레이션은 없다. B는 사용자 표시 자체를 막는다. C는 잘린 id와 사람 체크를 판정으로 올린다.
- 조건: unknown을 통과나 기본값으로 바꾸지 않는다. `done`은 사용자 행위 기록이고 사실·검사·Confirmed가 아니다. 칸 비우기, 구매 의사, 도착은 사용자 표시다. 고정 장애물을 지우지 않는다. 새 단위만 acquire와 arrival을 가진다. 적재는 설치 전이고, staging에 실린 용기의 설치는 transfer를 선행으로 두지 않는다. 손 계산 오라클 파일은 생산자가 다시 쓰지 않는다. Fable ARCHITECTURE와 비작성자 A3는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. `contract_change=YES`라 자동 머지하지 않는다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."
- 되돌리기: 이 결정과 `zari-domain-v2` 생산자를 새 결정으로 되돌린다. 이미 저장된 `zari-domain-v1` 레코드의 바이트는 이 결정으로 다시 쓰지 않는다.

## D014 — 취소 가능한 독립 평가와 원자적 발행 / 채택

- ID: D014
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 SP-014만 다룬다. 같은 발화의 SP-015·016은 각 노드에서 구현한다.
- 문제: `RunEval`이 후보 전체를 한 덩어리로 호출하면, 예산 경계와 취소가 검사·BOM·해시 중간을 구분하지 못하고 부분 결과를 발행할 수 있다.
- 변경 대상: [docs/adr/SP-014-evaluation-continuation.md](../docs/adr/SP-014-evaluation-continuation.md), profile `default` version 2, `solverVersion` `zari-solver-v2`, 평가 계속과 검색 스케줄, 세션의 `interrupted`. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, capability, `ActionStep` 필드, version 1 fixture 바이트는 그대로다.
- 검토한 대안: (A) version 1 lump를 유지하고 version 2만 양자로 나눈다. (B) 모든 프로필의 lump를 지금 지운다. (C) 부분 BOM이나 해시를 진행 중 대안으로 보여 준다.
- 선택: A. 이미 저장된 version 1 검색과 스냅샷 다이제스트가 남는다. B는 그 카운터와 다이제스트를 조용히 바꾼다. C는 끝나지 않은 후보를 계획으로 둔다.
- 조건: unknown을 통과나 기본값으로 바꾸지 않는다. 솔버는 진행 중 판정을 검증 권한으로 쓰지 않는다. 발행은 재검증 뒤다. 취소·예산·중단은 서로 다르고 `scopeComplete`가 아니다. 손 계산 오라클 파일은 다시 쓰지 않는다. 새 색 토큰은 없다. Fable ARCHITECTURE와 비작성자 A3는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. `contract_change=YES`라 자동 머지하지 않는다.
- 접근성·성능: 중단 문구는 기존 `session-note`다. 단계 8/16 ms, 취소 100/200 ms, 검증·확정 30/100 ms는 측정값으로만 적고, 전화 자격은 비어 있는 채로 둔다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."
- 되돌리기: 이 결정과 profile version 2 스케줄을 새 결정으로 되돌린다. version 1 레코드의 바이트는 이 결정으로 다시 쓰지 않는다.

## D015 — 로컬 lifecycle의 무효·보존·복구 / 채택

- ID: D015
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 SP-015만 다룬다. 같은 발화의 SP-016은 그 노드에서 구현한다.
- 문제: 사실·증빙·판매 항목·보유품이 바뀌거나 저장이 실패해도, 옛 계획의 가격과 완료가 현재인 것처럼 보이거나 잘못된 초안이 좋은 정규 입력을 지울 수 있다.
- 변경 대상: [docs/adr/SP-015-lifecycle.md](../docs/adr/SP-015-lifecycle.md), 세션·저장소·카탈로그·프로젝트 화면의 lifecycle 가드. `BUILD_ID`, `ruleVersion`, schema, DB version, Command, capability는 그대로다.
- 검토한 대안: (A) 기존 저장 형식 위에서 다이제스트·CAS·명시 적용만 연결한다. (B) 전역 재고 예약과 결제 상태를 저장소에 둔다. (C) 새 카탈로그나 새 규칙을 옛 스냅샷 바이트에 덮어쓴다.
- 선택: A. B는 구매와 전역 예약을 만든다. C는 역사 견적과 unknown을 현재 값으로 바꾼다.
- 조건: unknown을 통과나 기본값으로 바꾸지 않는다. 상품 없는 카탈로그는 `imported`와 origin `empty-real`이며 상품을 만들지 않는다. 복제·가져오기는 Rust 확인 뒤에 원자적으로 넣고, 진행을 비우며, 사진을 빠졌다고 말한다. Worker 대기는 트랜잭션 밖에 둔다. 하드 취소 뒤의 계산은 새 활성화가 있어야 한다. 손 계산 오라클 파일은 다시 쓰지 않는다. 새 색 토큰은 없다. Fable MILESTONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. `contract_change=NO`.
- 접근성·성능: 사본·저장 실패·판매 항목 고지는 기존 `session-note`와 `recovery-panel`이다. 새 색은 없다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."
- 되돌리기: 이 결정과 lifecycle 가드를 새 결정으로 되돌린다. 이미 저장된 스냅샷·진행·원본 바이트는 이 결정으로 다시 쓰지 않는다.

## D016 — 전체 16단계 qualification·새 draft capture·완료 인계 / 채택

- ID: D016
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 SP-016만 다룬다. 캡처 파일 등록은 화면 승인이 아니다.
- 문제: SP-013 가이드 조건, SP-014 평가 중단, SP-015 저장 복구는 SP-007·011 캡처에 없다. 개발 머지를 물리 사실·기기·수용·출시로 적으면 분모가 거짓이 된다.
- 변경 대상: [docs/adr/SP-016-qualification.md](../docs/adr/SP-016-qualification.md), `design/baselines/draft/zari016/` draft 항목, `docs/qualification/denominator.json`, 제품 완성 브라우저 시나리오, `docs/evidence/ZARI-SPATIAL-016.md`. 승인 수, SP-007·011 이미지, Rust 계약, `BUILD_ID`는 그대로다.
- 검토한 대안: (A) 실제 Worker 화면으로 막힌 unknown·무구매·재사용·혼합 구매·stale·역사 규칙·저장 CAS·중단 복구를 1440과 390에서 새로 찍고, 16노드 분모를 별도 투영으로 적는다. (B) SP-007·011 이미지를 이 화면의 승인으로 재사용한다. (C) 머지된 노드를 `DONE`과 출시 가능으로 적는다.
- 선택: A. 지원되는 화면과 git 머지 커밋이 사실을 보여 준다. B는 새 가이드·복구 화면을 옛 승인에 숨긴다. C는 없는 리뷰·감사·기기를 통과로 올린다.
- 조건: unknown을 통과나 기본값으로 바꾸지 않는다. 캡처는 draft다. `node_state`·`qualification_state`·`acceptance_state`·`release_state`는 인계 문서의 별도 축이고 런타임 API가 아니다. 포인터가 없으면 `DONE`으로 적지 않는다. 전화와 전용 GPU가 없으면 그 범위는 UNQUALIFIED다. 새 캡처 수용은 PENDING이다. 출시는 NOT_AUTHORIZED다. 선택 범위가 필수 게이트를 면제하지 않는다. Fable MILESTONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. `contract_change=NO`.
- 접근성·성능: 새 색 토큰은 없다. 캡처 환경은 reduced motion이고, 키보드·IME·forced-colors·200% zoom을 남긴다. cold 20 / warm 50 벤치는 기존 명령을 다시 실행한 측정값만 적는다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 후보 채택이다. `zari016` 이미지의 exact-set 화면 승인은 아니다.
- 되돌리기: draft 항목과 이 결정, 분모 문서를 걷어 내면 된다. 승인 수와 SP-007·011 이미지, 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-product-contract — 정리→구매→실행→재정리의 확장 계약 / 채택

- ID: Dz-product-contract
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-product-contract만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 16단계 뒤의 보유품·실상품·전략 비교·내보내기·재정리는 일부만 현재 스냅샷에 있다. 그 경로를 새 ID로 다시 적거나, 선행 계약 없이 DTO와 migration을 넣으면 001–016의 증거와 권위가 갈라진다.
- 변경 대상: [docs/adr/SP-z-product-contract.md](../docs/adr/SP-z-product-contract.md), `docs/product-expansion/contract.json`, DOMAIN_MODEL·SOLVER·WASM_PROTOCOL·PERSISTENCE·FRONTEND·TEST_STRATEGY·ARCHITECTURE의 z-product-contract 절. `BUILD_ID` `zari-domain-7`, capability, 생성 schema, persisted `schemaVersion` 1, DB version 2, exportVersion 1, 기존 fixture 기대값, 분모 16은 그대로다.
- 검토한 대안: (A) 차이·정본·버전·fixture 영향을 계약으로 고정하고 생산 구현은 이후 노드에 둔다. (B) 이 노드에서 보유 이력, 카탈로그 작업대, Pareto, 이식 묶음을 바로 만든다. (C) 001–016의 제목과 증거 경로를 확장 단계로 다시 붙인다.
- 선택: A. 현재 DTO가 역사 스냅샷과 수량을 표현하므로 마이그레이션은 없다. B는 소유 노드의 범위다. C는 완료 증거를 다른 작업으로 보이게 한다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 도면·BOM·가이드는 한 PlanSnapshot이다. 사용자 결정(계정·결제·클라우드·사진 동의·화면 수용·출시·실시간 재고·안전 인증·전화·전용 GPU)은 열려 있다. 내부 선택(정본 재사용, 버전 유지, 빈칸의 소유 노드)은 이 기록에서 채택한다. 두 목록의 id는 겹치지 않는다. Fable ARCHITECTURE와 비작성자 A3는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. `contract_change=NO`.
- 접근성·성능: 새 화면과 새 색 토큰은 없다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 계약 채택이다. 결제·출시·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정과 계약 JSON, 문서 절을 걷어 내면 된다. 저장된 schemaVersion 1 레코드와 기존 fixture는 이 결정으로 다시 쓰지 않는다.

## Dz-inventory-lifecycle — 보유 물건·용기·수량의 생활 이력 / 채택

- ID: Dz-inventory-lifecycle
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-inventory-lifecycle만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 보유 용기의 수량 Fact는 있으나, 개별·묶음 물건, 수량 미상과 0, 빈 용기와 사용 중, 구매·반품·이동·수량 수정의 이력이 없다. 과거 계획을 열 때 현재 재고가 바뀌면 안 된다.
- 변경 대상: [docs/adr/SP-z-inventory-lifecycle.md](../docs/adr/SP-z-inventory-lifecycle.md), Rust `apply_inventory`, 명령 `applyInventoryLedger`, 프로젝트 화면의 보유 이력, Dexie `inventoryLedgers`(dbVersion 3). `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 원장을 스냅샷 밖의 프로젝트 행으로 두고 Rust만 수량과 중복 소비를 판정한다. (B) `ProjectInput`에 사건 필드를 넣어 모든 스냅샷을 다시 만든다. (C) 화면이 빈 수량을 0으로 저장하고 과거 계획을 열면 원장을 고친다.
- 선택: A. B는 기존 fixture와 역사 스냅샷을 바꾼다. C는 미상을 0으로, 읽기를 쓰기로 만든다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 같은 단위 번호를 두 배치가 쓰지 못한다. 과거 계획 다이제스트는 참조만이다. 저장은 `changed: true`일 때만 한다. 새 색 쌍은 없고 기존 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 수량 칸은 텍스트다. 키보드로 기록을 제출한다. 확인 중·빈 기록·저장·오류를 상태에 남긴다. forced-colors는 기존 Canvas/CanvasText다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 화면, dbVersion 3 저장소를 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-catalog-provenance — 실상품 출처·옵션·치수 검증 작업대 / 채택

- ID: Dz-catalog-provenance
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-catalog-provenance만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 브랜드·모델·옵션·판매처와 외경·내경·돌출·하중의 출처가 갈라져 있지 않다. 다른 크기 옵션이 한 변형으로 합쳐질 수 있고, 내경이 없으면 외경으로 채워질 수 있으며, 일부 행만 맞은 가져오기가 기존 카탈로그를 고칠 수 있다.
- 변경 대상: [docs/adr/SP-z-catalog-provenance.md](../docs/adr/SP-z-catalog-provenance.md), Rust `review_catalog_import`, 명령 `reviewCatalogImport`, `#/catalog`의 검토 패널. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, dbVersion 3, `catalogSourceKinds` `synthetic`/`imported`, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 검토 배치를 스냅샷 밖에 두고, 격리가 있으면 snapshot을 비운다. 검증 범위는 기록이되 `Confirmed`로 올리지 않는다. (B) `CatalogSourceKind`에 `verified`를 넣어 저장 schema를 바꾼다. (C) 맞는 행만 기존 카탈로그 digest에 합친다.
- 선택: A. B는 상품 계약이 잠근 source kind와 기존 fixture 경로를 건드린다. C는 불완전 가져오기가 검증된 카탈로그를 부분적으로 덮는다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 빈 내경은 unknown이다. 같은 옵션의 다른 크기는 합치지 않는다. 사진 바이트는 거절한다. 새 색 쌍은 없고 기존 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 검토는 폼 제출이다. 키보드로 샘플과 검토를 실행한다. 검토 중·준비·격리·저장을 상태에 남긴다. forced-colors는 기존 Canvas/CanvasText다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 검토 패널을 걷어 낸다. 이미 저장된 카탈로그 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-offer-bundles — 판매 묶음·필수 부품·배송비의 정직한 BOM / 채택

- ID: Dz-offer-bundles
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-offer-bundles만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 필요 개수와 판매 묶음 수가 같고, 배송 미확인이 무료로 더해지며, 세트 포함 부품이 한 번 더 청구될 수 있다. 품절 교체 뒤 도면·BOM·가이드가 다른 revision을 보면 안 된다.
- 변경 대상: [docs/adr/SP-z-offer-bundles.md](../docs/adr/SP-z-offer-bundles.md), Rust `quote_offer_bundle`, 명령 `quoteOfferBundle`, 계획 화면의 판매처 비교. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, dbVersion 3, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 견적을 스냅샷 밖 Rust 응답으로 두고, 교체는 기존 `selectOffer`가 새 스냅샷 하나를 발행하게 둔다. (B) `Offer`와 `CostSummary`에 세금·판매처 1회 배송을 넣어 모든 스냅샷을 다시 만든다. (C) 배송 미확인을 0원으로 두고 화면이 묶음 수를 계산한다.
- 선택: A. B는 기존 fixture와 역사 스냅샷을 바꾼다. C는 미확인을 무료로, 계산 권위를 화면으로 옮긴다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 확인된 무료만 금액 0이다. 세금 메모가 없으면 총액은 미확인이다. 미리보기는 revision을 발행하지 않는다. 새 색 쌍은 없고 기존 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 금액은 텍스트다. 미리보기는 폼 제출이라 Enter로 계산한다. 확인 중·준비·빈 주문·오류를 상태에 남긴다. forced-colors는 기존 Canvas/CanvasText다. 같은 스냅샷 id는 한 번만 견적한다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 판매처 비교를 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-strategy-library — 생활습관 기반 전략과 Recipe 라이브러리 / 채택

- ID: Dz-strategy-library
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-strategy-library만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 규칙이 있는 다섯 전략은 있으나, 최소 구매·빈도·활동·한 동작 접근이 실제로 다른 Recipe 라이브러리가 없다. 문장만 다른 대안, 저장하지 않은 라디오, 배치할 수 없는 물건의 수량이 섞이면 비교가 거짓이 된다.
- 변경 대상: [docs/adr/SP-z-strategy-library.md](../docs/adr/SP-z-strategy-library.md), Rust `strategy_library::evaluate`, 명령 `evaluateStrategyLibrary`, 계획 화면의 전략 비교. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, dbVersion 3, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 라이브러리를 스냅샷 밖 Rust 응답으로 두고, 규칙 id는 기존 `propose`를 복사한다. (B) Recipe를 `PlanSnapshot`에 넣어 모든 스냅샷을 다시 만든다. (C) 화면이 문장을 합치고, 고른 라디오를 바로 저장된 전략으로 쓴다.
- 선택: A. B는 기존 fixture와 역사 스냅샷을 바꾼다. C는 계산 권위를 화면으로 옮기고, 저장 전 선택을 핀으로 만든다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 문장만 같은 결과는 하나다. 접근 가정이 다르면 남긴다. 저장된 전략은 비교가 바꾸지 않는다. 미배정 수량은 물건마다 남는다. 새 색 쌍은 없고 기존 패널·경고 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 비교는 텍스트다. 레시피 규칙은 버튼이고 Enter로 접고 편다. 계산 중·준비·빈 목록·오류를 상태에 남긴다. 저장 전 라디오는 핀을 옮기지 않는다고 말한다. forced-colors는 기존 Canvas/CanvasText다. 같은 저장 입력과 전략은 명령을 한 번만 보낸다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·파레토 점수·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 전략 비교를 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-pareto-comparison — 비용·재사용·접근·불확실성 대안 비교 / 채택

- ID: Dz-pareto-comparison
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-pareto-comparison만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 순위 있는 배치안은 있으나, 한 개의 임의 점수 없이 구매비·재사용·선행 이동·미배정·미확인을 나란히 비교하는 읽기 모형이 없다. 더 싼 안이 강제 제약을 어겨도 남거나, 미확인이 0이 되거나, 다 쓴 탐색 예산이 전역 최적해로 보이면 비교가 거짓이 된다.
- 변경 대상: [docs/adr/SP-z-pareto-comparison.md](../docs/adr/SP-z-pareto-comparison.md), Rust `pareto::compare`, 명령 `comparePareto`, 계획 화면의 대안 비교. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, dbVersion 3, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 비교를 스냅샷 밖 Rust 응답으로 두고, 탐색 순위와 `decision.rs`는 그대로 둔다. (B) Pareto 축을 `PlanSnapshot` 정렬에 넣어 모든 검색 fixture를 다시 만든다. (C) 화면이 미확인을 0으로 두고 더 싼 안을 항상 앞에 둔다.
- 선택: A. B는 기존 fixture와 역사 스냅샷을 바꾼다. C는 미확인을 0으로, 계산 권위를 화면으로 옮긴다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 강제 제약 위반은 더 싸도 제외된다. 같은 시드와 예산의 후보 순서는 네이티브와 WASM이 같다. `global_optimum`은 false다. 새 색 쌍은 없고 기존 `primary-on-subtle`과 `warning-on-soft`를 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 비교는 텍스트다. 차이 칸은 색과 함께 `다름`을 쓴다. 조건 상세는 버튼이고 Enter로 접고 편다. 계산 중·준비·빈 앞·오류를 상태에 남긴다. 저장 전 라디오는 목표를 옮기지 않는다고 말한다. 표는 가로로 스크롤되어 390px에서 페이지를 넓히지 않는다. forced-colors는 기존 Canvas/CanvasText다. 같은 저장 입력·목표·종료·스냅샷 목록은 명령을 한 번만 보낸다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 대안 비교를 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-incremental-replan — 고정 배치를 지키는 부분 재정리 / 채택

- ID: Dz-incremental-replan
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-incremental-replan만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 물건이 늘거나 치수가 바뀌어도 유지할 배치·물건·전략을 고를 수 없다. 고정을 몰래 옮기거나, 무효가 된 통과를 다시 쓰거나, 취소한 응답이 고른 계획을 바꾸면 재정리가 거짓이 된다.
- 변경 대상: [docs/adr/SP-z-incremental-replan.md](../docs/adr/SP-z-incremental-replan.md), Rust `incremental::replan`, 명령 `replanIncremental`, 계획 화면의 부분 재정리. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, dbVersion 3, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 핀을 명령의 명시 입력으로 두고, 발행은 기존 `evaluate_candidate`와 `ManualEdit`만 쓴다. (B) 핀을 `PlanSnapshot` 필드로 넣어 모든 스냅샷을 다시 만든다. (C) 화면이 좌표를 옮기고, 예전 통과를 새 치수에 남긴다.
- 선택: A. B는 기존 fixture와 역사 스냅샷을 바꾼다. C는 고정을 몰래 옮기고, 계산 권위를 화면으로 옮긴다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 고정 좌표는 바꾸지 않는다. `reusedPass`는 false다. 취소와 늦은 응답은 고른 계획을 바꾸지 않는다. 새 물건은 미배정으로 남고, 빈자리를 채우는 탐색은 하지 않는다. 새 색 쌍은 없고 기존 `primary-on-subtle`과 `warning-on-soft`를 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 차이와 충돌은 텍스트다. 핀은 체크박스이고 Space로 토글한다. 고정 풀기·취소·바꾸기는 버튼이고 Enter로 동작한다. 빈 계획·대기·준비·막힘·취소·오류를 상태에 남긴다. 390px에서 페이지를 넓히지 않는다. forced-colors는 기존 Canvas/CanvasText다. 같은 입력·이전 계획·핀은 명령을 한 번만 보낸다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·피드백 루프·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 부분 재정리 화면을 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-search-diagnostics — 해 없음·측정 부족·탐색 미완료의 구분 / 채택

- ID: Dz-search-diagnostics
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-search-diagnostics만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 계획이 없거나 탐색이 멈추면 제품 없음, 범위 밖 기하, 확정 불가능, 예산 소진이 한 문장으로 섞인다. 알 수 없는 측정을 제품 없음으로 단정하거나, 더 큰 예산을 불가능의 증명으로 보이면 구분이 거짓이 된다.
- 변경 대상: [docs/adr/SP-z-search-diagnostics.md](../docs/adr/SP-z-search-diagnostics.md), Rust `search_diagnostics::diagnose_search`, 명령 `diagnoseSearch`, 계획 화면의 실패 구분. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, dbVersion 3, 기존 124 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 구분을 스냅샷 밖 Rust 응답으로 두고, 재현 자료는 입력·규칙·카탈로그·예산을 담는다. (B) 구분 필드를 `PlanSnapshot`에 넣어 모든 스냅샷을 다시 만든다. (C) 화면이 빈 카탈로그와 미상 측정을 같은 “제품 없음”으로 쓰고, 예산 소진을 불가능 증명으로 적는다.
- 선택: A. B는 기존 fixture와 역사 스냅샷을 바꾼다. C는 미상을 제품 없음으로, 계산 권위를 화면으로 옮긴다.
- 조건: unknown을 통과나 0이나 제품 없음으로 바꾸지 않는다. `provesImpossible`과 `budgetSuggestionIsProof`는 false다. 더 큰 예산은 대안이 없고 예산이 소진됐을 때만 제안한다. 재현 자료에 로그·세션·요청 id·사진·소요 시간을 넣지 않는다. 취소와 늦은 응답은 고른 계획을 바꾸지 않는다. 새 색 쌍은 없고 기존 `primary-on-subtle`과 `warning-on-soft`를 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 구분과 지원 범위는 텍스트다. 내보내기·다시 구분·진단 취소는 버튼이고 Enter로 동작한다. 계산 전·계산 중·대기·준비·취소·오류를 상태에 남긴다. 표는 가로로 스크롤되어 390px에서 페이지를 넓히지 않는다. forced-colors는 기존 Canvas/CanvasText다. 같은 입력·카탈로그·종료·관찰은 명령을 한 번만 보낸다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·접근성 workspace·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 실패 구분 화면을 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-accessibility-workspace — 측정부터 실행까지 키보드·모바일 접근성 / 채택

- ID: Dz-accessibility-workspace
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-accessibility-workspace만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 드래그를 못 쓰거나 좁은 화면이면 생성부터 실행 가이드까지 같은 작업을 끝내지 못한다. 선택·강조·오류·미확인이 색에만 있고, 저장 실패와 계산 취소가 포커스와 입력 글자를 잃는다.
- 변경 대상: [docs/adr/SP-z-accessibility-workspace.md](../docs/adr/SP-z-accessibility-workspace.md), 계획·프로젝트 화면의 키보드·터치 경로와 live region, 좁은 헤더. Rust 명령·`BUILD_ID`·fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) 기존 `movePlacement`에 터치 증감과 키보드 포커스 이동을 잇고, 의미는 글자와 `aria-pressed`·live region으로 남긴다. (B) 화면이 좌표를 따로 계산하는 터치 전용 명령을 만든다. (C) 320px에서 프로젝트 이름과 미확인을 숨겨 가로 스크롤만 없앤다.
- 선택: A. B는 계산 권위를 화면으로 옮긴다. C는 필수 정보를 좁은 화면에서 지운다.
- 조건: 빈 좌표와 0mm는 다르다. 증감 0은 명령이 아니다. unknown을 통과나 0으로 바꾸지 않는다. 저장 실패·충돌·워커 실패·채택 오류는 복구 컨트롤로 포커스를 옮기고 필드 값은 유지한다. 계산 취소·중단·실패는 포커스가 떠 있을 때만 계산 버튼으로 돌린다. 채택이 바뀌면 실행 가이드의 사용 가능한 컨트롤로 포커스가 간다. 새 색 쌍은 없다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 데스크톱 에뮬레이션은 실기기 검증이 아니다.
- 접근성·성능: 키보드만으로 생성→측정→계산→비교→채택→가이드가 된다. 배치를 키보드로 고르면 좌표 입력으로 간다. 터치 증감·화살표·좌표 입력은 같은 명령이다. 1mm가 기본이고 Shift 또는 터치의 10mm가 명시적 단위다. 선택과 목록 강조는 polite live region이다. 미확인은 치수 필드의 `aria-describedby`에 연결된다. 320px에서 프로젝트 이름과 이 기기 저장 안내가 남고, 비교 표는 `contain: inline-size`로 페이지를 넓히지 않는다. coarse pointer에서 증감 버튼과 편집 입력은 `--zari-touch-min-height`다. reduced motion은 기존 duration 토큰을 0으로 두고 업무 상태를 막지 않는다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·전화·전용 GPU·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정과 포커스·증감·live region 연결을 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-portable-project — 프로젝트 이식·검증된 가져오기 / 채택

- ID: Dz-portable-project
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-portable-project만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 계획과 출처를 다른 기기로 옮길 때 포함 범위를 고를 수 없고, 손상·구버전·경로 이탈·압축 폭탄이 기존 프로젝트를 덮어쓸 수 있다. 사진 바이트와 위치정보·개인정보를 묶음에 두면 동의 없는 복사가 된다.
- 변경 대상: [docs/adr/SP-z-portable-project.md](../docs/adr/SP-z-portable-project.md), Rust `build_portable_bundle` / `inspect_portable_bundle`, 명령 `buildPortableBundle`과 `inspectPortableBundle`, 프로젝트 화면의 이식 묶음과 목록의 zip 가져오기. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, live dbVersion 3, 기존 fixture 기대 바이트는 그대로다.
- 검토한 대안: (A) STORE zip을 exportVersion 1 옆에 두고, Rust가 검사한 뒤에만 기존 가져오기 트랜잭션을 연다. (B) 원장과 사진을 exportVersion 1 JSON에 넣어 모든 기존 보내기 파일을 다시 만든다. (C) 화면이 zip을 풀고, 선언된 크기가 큰 항목도 메모리에 올린다.
- 선택: A. B는 기존 보내기 계약과 fixture를 바꾼다. C는 계산·검증 권위를 화면으로 옮기고 압축 폭탄을 푼다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. 사진 바이트는 항상 제외다. 위치정보와 개인정보 키가 있으면 거절하고, 이 기기의 원본은 지우지 않는다. 실패한 가져오기는 쓰지 않는다. 공유 보유 수납함은 묶음에 없다. 원장은 zip의 관측 항목에만 있고 exportVersion 1에는 없다. 새 색 쌍은 없고 기존 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 포함 범위는 체크박스이고 Space로 토글한다. 사진·위치·개인정보 정책은 글자로 항상 보인다. 확인 중·준비·거절을 상태에 남긴다. 390px에서 페이지를 넓히지 않는다. forced-colors는 기존 Canvas/CanvasText다. 거절된 zip은 `inspectPortableBundle` 한 번이고 `verifyRecord`는 없다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 두 명령, 이식 묶음 화면을 걷어 낸다. 이미 저장된 스냅샷 바이트와 exportVersion 1 파일은 이 결정으로 다시 쓰지 않는다.

## Dz-purchase-handoff — 구매 링크·대체품 검토·구매 이후 연결 / 채택

- ID: Dz-purchase-handoff
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-purchase-handoff만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: BOM에서 판매처로 나가도 링크를 연 것만으로 결제가 끝났다고 기록될 수 있고, 오래된 재고가 방금 확인한 것처럼 보이며, 광고·제휴 표시가 적합성 판정을 바꿀 수 있다. 구매 확인과 수령·실측·반품이 한 사건으로 섞이면 실측이 기존 통과를 재사용한다.
- 변경 대상: [docs/adr/SP-z-purchase-handoff.md](../docs/adr/SP-z-purchase-handoff.md), Rust `prepare_purchase_handoff`, 명령 `preparePurchaseHandoff`, 계획 화면의 판매처별 구매 준비. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, 문서 `dbVersion` 2, 기존 fixture 기대 바이트는 그대로다. 살아있는 IndexedDB `DB_VERSION`은 3에서 4로 올라가고 `purchaseHandoffs`만 추가한다.
- 검토한 대안: (A) 스냅샷 밖의 Rust 응답과 프로젝트별 원장. 링크는 앵커만 두고, 확인 시각은 호출자가 넘긴다. (B) 링크 클릭을 결제 완료로 저장하고 재고 문구를 최신으로 둔다. (C) 원장을 프로젝트 메타데이터에 넣어 dbVersion을 유지한다.
- 선택: A. B는 확인하지 않은 결제와 재고를 사실로 만든다. C는 원장과 스냅샷 조정을 한 레코드에 섞는다.
- 조건: unknown을 통과나 0으로 바꾸지 않는다. `recordsPayment`와 `paid`는 항상 false다. 7일을 넘긴 확인은 `stale`이다. 광고·제휴 id는 적합성에 들어가지 않는다. 대체품은 같은 이름으로 동일하다고 보지 않고, 응답은 스냅샷을 채택하지 않는다. 구매 확인·수령·실측·반품은 별개 사건이다. 새 색 쌍은 없고 기존 견적 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 사건 기록과 확인 시점 분류는 폼이고 Enter로 제출한다. 링크에는 기록 핸들러가 없다. 확인 중·준비·비어 있음·오류를 상태에 남긴다. 390px에서 페이지를 넓히지 않는다. forced-colors는 기존 Canvas/CanvasText다. 같은 스냅샷의 준비는 명령 한 번이다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 명령, 구매 준비 화면, `purchaseHandoffs` 저장소를 걷어 낸다. 이미 저장된 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-execution-checklist — 실행 체크리스트·막힘·되돌리기 / 채택

- ID: Dz-execution-checklist
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-execution-checklist만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 사용자가 물건을 옮기는 순서를 따라가려면 단계별 준비물과 조건이 보여야 한다. 완료 체크가 unknown 검사를 통과처럼 보이게 하거나 선행 blocker가 남은 단계를 완료 가능하게 보이면 안 되고, 새 snapshot에 구계획 진행이 무조건 이어지면 안 된다. 다른 물건 발견·부품 부족·실측 차이는 draft 수정으로 돌아가야 한다.
- 변경 대상: [docs/adr/SP-z-execution-checklist.md](../docs/adr/SP-z-execution-checklist.md), `features/execution`의 실행 카드, `GuideEligibility` 행의 `instanceRefs`, 세션의 `requestDraftFocus`/`takeDraftFocus`, PlanScreen·ProjectScreen, `crates/core/tests/execution_checklist.rs`. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, 문서 `dbVersion` 2, IndexedDB `DB_VERSION` 4, 기존 fixture 124건의 바이트와 manifest 합계는 그대로다.
- 검토한 대안: (A) 기존 단계 목록 아래에 같은 Rust 자격·진행 결합을 따르는 단계 카드를 두고, 되돌리기는 draft의 한 컨트롤로 이동하는 휘발 탐색으로 둔다. (B) 준비물·진행·조건을 별도 저장 모델로 둔다. (C) 구계획 진행을 새 snapshot에 자동 승계한다.
- 선택: A. B는 진행을 검사 권위 밖으로 복제한다. C는 불변 스냅샷 결합을 깬다.
- 조건: 완료 기록은 사용자 진술이고 unknown 검사를 통과로 바꾸지 않는다. 막힌 단계는 비활성과 사유를 함께 보인다. 준비물은 Rust `instanceRefs` 라벨이고 수량 미확인은 추정하지 않는다. 되돌리기는 진행·검사·초안을 쓰지 않는다. 새 도메인 계약·액션·검사·마이그레이션·색 쌍은 없다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 카드의 완료 기록은 실제 체크박스이고 막힌 이유를 `aria-describedby`로 읽는다. 되돌리기는 버튼이고 도착한 컨트롤에 초점을 둔다. 390px에서 페이지를 넓히지 않고 터치 높이는 기존 `--zari-touch-min-height`다. forced-colors는 기존 Canvas/CanvasText다. 단계·자격·진행은 기존 쿼리와 저장 경로를 재사용하고 새 worker 명령은 없다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 실행 카드, `requestDraftFocus` 경로, `instanceRefs` 매핑을 걷어 낸다. 이미 저장된 진행 행과 스냅샷 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-location-search — 내 물건 찾기와 정리 후 위치 검색 / 채택

- ID: Dz-location-search
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-location-search만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 정리 결과가 채택 snapshot으로 끝나면 물건 찾기에 쓸 수 없다. 계획상 위치와 사용자가 확인한 실제 위치는 다른 사실이다. 재정리·분실·다른 곳 이동을 관측으로 남길 수단이 없고, 같은 이름의 다른 물건이나 부분 수량이 검색에서 합쳐지면 안 된다.
- 변경 대상: [docs/adr/SP-z-location-search.md](../docs/adr/SP-z-location-search.md), `crates/core/src/location_search.rs`와 `applyLocationLog`·`queryLocationSearch` 명령, Dexie `locationLogs` 저장소(live `DB_VERSION` 5), `features/location`의 검색 패널과 ProjectScreen, `crates/core/tests/location_search.rs`와 `crates/core/tests/fixtures/location_search`의 불일치 fixture. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, 문서 `dbVersion` 2, 기존 fixture 124건의 바이트와 manifest 합계는 그대로다.
- 검토한 대안: (A) 프로젝트별 `LocationLog`에 confirm·relocate·reorganize·lost·alias 관측을 덧붙이고 Rust가 `(itemId, 계획 위치, 관측 위치)` 결합 행과 상태 코드를 낸다. (B) 재고 원장의 이벤트 종류를 늘려 위치 기록을 그 안에 둔다. (C) 계획 위치를 실행 체크 완료로 실제 위치에 자동 승격한다.
- 선택: A. B는 재고 수량 이력과 실제 위치 관측을 한 계약으로 묶어 ledger 의미를 흐린다. C는 실행하지 않거나 확인하지 않은 계획 위치를 실제 위치로 단정한다.
- 조건: `confirm`은 기록 당시 채택 snapshot 결합에만 유효하고 다른 snapshot에서는 `staleConfirmation`이다. 실행 완료·시간·추론으로 실제 위치를 만들지 않는다. 부분 수량 관측은 `unitOrdinals`가 필요하고 수량 미상이면 번호를 쓸 수 없다. 같은 이름의 물건·부분 수량은 다른 행이다. unknown 수량은 0이 아니다. 프로젝트 삭제는 `locationLogs` 행을 지운다. 새 색 쌍은 없고 기존 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 검색 입력과 관측 기록은 폼이고 Enter로 제출한다. 결과 행은 상태 글자를 항상 함께 읽고 `plannedOnly`를 실제 위치처럼 꾸미지 않는다. 390px에서 페이지를 넓히지 않고 forced-colors는 기존 Canvas/CanvasText다. 행은 128개에서 잘린다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 두 명령, 검색 패널, `locationLogs` 저장소를 걷어 낸다. 이미 저장된 스냅샷·입력·원장 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-feedback-reorganize — 사용 피드백에서 다음 정리로 이어지는 루프 / 채택

- ID: Dz-feedback-reorganize
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-feedback-reorganize만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 채택한 계획으로 살면서 알게 된 접근 불편·빈도 변경·정리 유지 어려움을 남길 자리가 없다. 피드백을 곧바로 결정으로 읽으면 물건 폐기·구매가 자동 확정되거나 채택한 계획과 실제 위치가 몰래 바뀐다. 제안은 규칙으로 설명되고 같은 입력·규칙·예산에서 재현되어야 한다.
- 변경 대상: [docs/adr/SP-z-feedback-reorganize.md](../docs/adr/SP-z-feedback-reorganize.md), `crates/core/src/feedback_reorganize.rs`와 `applyFeedbackLog`·`proposeFeedbackReorganize` 명령, Dexie `feedbackLogs` 저장소(live `DB_VERSION` 6), `features/feedback`의 패널과 PlanScreen·session의 초안 흐름, `crates/core/tests/feedback_reorganize.rs`와 `crates/core/tests/fixtures/feedback_reorganize`의 시나리오·parity fixture. `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, protocol 1, exportVersion 1, 문서 `dbVersion` 2, 기존 fixture 124건의 바이트와 manifest 합계는 그대로다.
- 검토한 대안: (A) 프로젝트별 `FeedbackLog`를 덧붙이고, Rust가 채택한 계획의 최상위 배치 맞바꿈 후보를 기존 `evaluate_candidate`로 검증해 초안과 규칙별 원인을 낸다. (B) 피드백을 `ProjectInput`의 빈도 사실에 자동 반영하고 전체 탐색을 다시 돌린다. (C) 피드백이 쌓이면 안 쓰는 물건의 폐기·구매를 추천해 확정한다.
- 선택: A. B는 입력 사실을 사용자 확인 없이 바꾸고 탐색 엔진을 다른 입력으로 활성화해야 한다. C는 피드백만으로 폐기·구매를 결정한다.
- 조건: 기록은 채택한 계획에 묶이고 Rust가 계획 id를 찍는다. 빈도를 모르면 모르는 채로 두고 비교·이동하지 않는다. 후보는 같은 검증기를 지나고 채택한 계획보다 어느 검사도 나빠지지 않아야 하며 배정·미배정·구매·BOM·비용은 그대로다. `autoDiscard`·`autoPurchase`는 항상 false다. 취소와 늦은 응답은 채택한 계획과 위치 기록을 바꾸지 않는다. 초안은 사용자가 채택하기 전까지 대안일 뿐이다. 위치 관측은 맥락이고 고치지 않는다. 같은 요청 digest는 같은 초안이다. 프로젝트 삭제는 `feedbackLogs` 행을 지운다. 새 색 쌍은 없고 기존 패널 토큰을 쓴다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 기록·제안은 폼 컨트롤이고 Enter로 실행한다. 결과 상태는 글자로 읽히고(`role="status"`·`alert`) 원인은 색 없이 결과 글자를 함께 쓴다. 390px에서 페이지를 넓히지 않고 forced-colors는 기존 Canvas/CanvasText다. 후보는 예산(최대 128)에서 멈춘다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 두 명령, 피드백 패널, `feedbackLogs` 저장소를 걷어 낸다. 이미 저장된 스냅샷·입력·원장·위치 기록 바이트는 이 결정으로 다시 쓰지 않는다.

## Dz-print-share — 도면·BOM·실행 가이드의 한 묶음 출력 / 채택

- ID: Dz-print-share
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-print-share만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 가족이나 설치 담당자가 같은 계획의 근거를 보고 실행해야 한다. 도면과 구매 목록이 다른 계획에서 나오거나, 미확인·미배치가 출력에서 빠지거나, 사용자의 이름·링크·진행이 모르게 나가거나, CSV가 수식·가져오기 입력이 되면 안 된다.
- 변경 대상: [docs/adr/SP-z-print-share.md](../docs/adr/SP-z-print-share.md), `apps/web/src/features/print/{scope,package,csv}.ts`·`PrintPackageView.tsx`·`PrintPanel.tsx`, `apps/web/src/styles/print.css`, 계획 상세의 출력 패널(기존 BOM 단독 CSV 단추 대체), `apps/web/tests/fixtures/print-share/`의 재현 fixture, 단위·브라우저 테스트. Rust·프로토콜·스키마·저장소·`BUILD_ID`는 바꾸지 않는다.
- 검토한 대안: (A) 하나의 스냅샷과 그 스냅샷을 위해 Rust가 낸 투영을 읽는 host 순수 함수로 패키지·CSV를 만들고 revision·누락을 조립 뒤 검증한다. (B) Rust에 출력 패키지 명령과 DTO를 새로 둔다. (C) 화면의 DOM을 그대로 `window.print()`로 인쇄하고 CSV는 기존 BOM 단추를 둔다.
- 선택: A. B는 새 도메인 계약과 BUILD_ID 재고정·fixture 124건 바이트 변경이 필요하지만 이 출력은 새 계산이 없다. C는 화면 상태·스크롤·접힘에 출력이 좌우되고 쪽마다 계획 ID를 붙일 수 없으며 개인정보 범위를 고를 수 없다.
- 조건: 모든 쪽에 계획 ID 전체·단위 mm·포함 범위·미확인 안내가 붙는다. 도면 투영의 계획 ID·입력 digest·카탈로그 digest가 스냅샷과 다르거나 투영이 없으면 패키지와 CSV를 만들지 않는다. 조립 뒤 모든 행의 개수와 섹션 revision을 검증한다. 미확인은 글자로 남고 0·통과가 되지 않는다. 개인정보 범위는 기본 모두 제외이고 저장하지 않으며 사진·위치 기록·피드백·메모·계정 정보는 항상 제외다. 링크는 평문 http(s)뿐이다. CSV는 수식 안전 칸이고 계획 ID로 시작하며 이 앱의 가져오기 형식이 아니다. 새 색 쌍은 없다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 범위는 실제 체크박스(Space)이고 단추는 Enter로 열린다. 미리보기는 모달 대화상자(포커스 가둠, Esc, 복귀, 뒤 앱 `inert`)다. 차단 이유와 준비 상태는 `role="alert"`/`status` 글자다. 390px에서 페이지를 넓히지 않고 forced-colors는 시스템 색을 쓴다. 인쇄는 A4, 한글은 어절 단위로 줄바꿈하고 표 머리글은 쪽마다 반복된다. 패키지 조립은 스냅샷 크기에 선형이다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 출력 패널과 `features/print`, `print.css`를 걷어 낸다. 기존 BOM 단독 CSV 단추는 되살릴 수 있다. 저장된 데이터는 이 결정으로 읽거나 쓰지 않으므로 되돌릴 데이터가 없다.

## Dz-performance-budget — 실측 성능 예산과 WASM 병목 개선 / 채택

- ID: Dz-performance-budget
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-performance-budget만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 초안 성능 목표의 초과가 어느 단계 비용인지 분리되지 않았고, 속도 개선이 결정성이나 검증 권위를 건드리면 안 된다. 벽시계로 멈춘 것과 결정론적 예산이 소진된 것을 같은 말로 부르면 안 된다.
- 변경 대상: [docs/adr/SP-z-performance-budget.md](../docs/adr/SP-z-performance-budget.md), `crates/core/{src/canonical.rs,src/protocol.rs,src/validate.rs}`(같은 출력, 적은 재계산), `crates/core/examples/perf_profile.rs`, `apps/web/src/worker/client.ts`(카탈로그 재사용), `apps/web/src/app/sessionRegistry.ts`·`main.tsx`(Worker 조기 시작), bench 시계 도장과 재활성화 측정, 단위·Rust·브라우저 테스트. 화면, 토큰, 프로토콜 DTO, 스키마, 저장소, `BUILD_ID`는 바꾸지 않는다.
- 검토한 대안: (A) 같은 canonical 출력을 유지하며 중복 digest·직렬화·경로 할당을 없애고, 엔진이 이미 가진 카탈로그는 다시 보내지 않고, Worker를 idle에 미리 시작한다. (B) 목표 임계값을 현실에 맞게 올린다. (C) 새 직렬화 형식이나 Rust 쪽 delta 프로토콜을 둔다.
- 선택: A. B는 초과를 숨긴다. C는 새 계약과 BUILD_ID 재고정·fixture 124건 변경이 필요한데 측정된 병목은 중복 계산과 전체 카탈로그 재전송이었다.
- 조건: 개선 전후 같은 fixture의 모든 응답 SHA-256이 같다(`perf_profile`). 124 fixture 기대 바이트는 변하지 않는다. 카탈로그 재사용은 엔진이 검증해 가진 digest에만 쓰고 모르면 `catalog_unavailable`로 전체를 다시 보내며 기본값을 만들지 않는다. 결정론적 `budgetExhausted`는 보폭·호스트 속도와 무관하다. 목표 미달과 실제 모바일 미측정은 숨기지 않는다. 새 색·토큰은 없다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 화면 변경이 없다. Worker 조기 시작은 입력이나 사용자 데이터를 보내지 않는다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 실제 모바일 성능·출시·배포 승인은 아니다.
- 되돌리기: 이 결정과 위 변경 대상을 걷어 낸다. 저장 데이터와 계약은 바뀌지 않으므로 되돌릴 데이터가 없다.

## Dz-privacy-offline — 오프라인 수명과 사용자 데이터 통제 / 채택

- ID: Dz-privacy-offline
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-privacy-offline만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 저장 공간이 모자랄 때 실패가 성공처럼 보이거나, 사용자가 사진·검색 기록·프로젝트를 범위별로 내려받고 지울 수 없거나, 어떤 동작이 연결을 요구하는지 알 수 없으면 데이터 소유권이 없는 것과 같다. 구버전 앱 캐시가 새 저장 형식을 만나는 경우도 드러나야 한다.
- 변경 대상: [docs/adr/SP-z-privacy-offline.md](../docs/adr/SP-z-privacy-offline.md), `#/data` 화면(`apps/web/src/app/DataScreen.tsx`), `apps/web/src/features/privacy/`, `repository.ts`의 범위 삭제·범위 조회·호환 검사, 사진·위치 패널의 저장 실패 글, `project.css`의 데이터 화면 규칙, 단위·브라우저 테스트. Rust·프로토콜·스키마·DB version·`BUILD_ID`·fixture는 바꾸지 않는다.
- 검토한 대안: (A) 호스트에서 범위별 삭제·내려받기·읽기 전용 호환 검사를 한 화면에 두고, 삭제는 다시 읽어 확인한 뒤에만 완료라고 말한다. (B) 모든 데이터를 한 번에 지우는 초기화 단추 하나만 둔다. (C) Rust에 데이터 범위 계약을 새로 둔다.
- 선택: A. B는 사진만 또는 검색 기록만 지우려는 사용자를 막는다. C는 계산이 없는 저장소 관리에 새 도메인 계약과 BUILD_ID 재고정을 요구한다.
- 조건: 삭제는 그 범위의 행만 한 트랜잭션에서 지우고 실패하면 아무것도 지우지 않았다고 말한다. 읽을 수 없는 행은 0이 아니다. 용량을 모르면 "알 수 없음"이다. 저장 실패는 "저장되지 않았습니다"이고 저장됨 상태를 만들지 않는다. 사진 내려받기는 원본이 아닌 표시용 사본이며 사진 바이트는 이식 묶음에 넣지 않는다. 배포 소스의 네트워크 API는 same-origin 서비스 워커뿐이고 외부 AI·분석 전송은 없다. 새 schema 행과 더 새로운 저장소는 읽기만 한다. 새 색·토큰은 없다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 삭제 확인은 `role="alert"` 인라인 패널이고 단추는 Enter로 누른다. 결과는 `role="status"`/`alert` 글자다. 390px에서 페이지를 넓히지 않고 긴 사진 이름은 줄바꿈한다. forced-colors는 시스템 색을 쓴다. 범위 조회는 프로젝트 수에 선형이고 사진 바이트는 메모리에 들고 있지 않는다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, `#/data` 화면과 `features/privacy`, 범위 삭제 메서드를 걷어 낸다. 저장 데이터와 계약은 바뀌지 않으므로 되돌릴 데이터가 없다.

## Dz-guided-onboarding — 처음 사용해도 완성하는 예제와 빈 화면 / 채택

- ID: Dz-guided-onboarding
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-guided-onboarding만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다.
- 문제: 빈 작업대에서 무엇을 먼저 재고 어떻게 입력하고 오류를 어떻게 고치는지 알 수 없다. 합성 예제와 실제 시작이 섞이고, 합성 상품이 구매 가능한 상품처럼 보인다.
- 변경 대상: [docs/adr/SP-z-guided-onboarding.md](../docs/adr/SP-z-guided-onboarding.md), `apps/web/src/features/onboarding/`, 프로젝트 목록의 시작 선택·예제 표시, 측정 화면의 안내 패널, 계획 화면·구매 준비 패널의 합성 문구, `project.css`의 안내 규칙, `design/token-contrast-cases.json`, 단위·브라우저 테스트. Rust·프로토콜·스키마·DB version·`BUILD_ID`·fixture는 바꾸지 않는다.
- 검토한 대안: (A) 호스트에서 시작 선택을 둘로 나누고 접을 수 있는 안내 패널을 측정 화면에 둔다. 필요한 값은 Rust next-facts 목록을 따른다. (B) 전체 화면 마법사로 모든 칸을 순서대로 강제한다. (C) 예제 표시를 위해 프로젝트 행에 새 필드를 추가한다.
- 선택: A. B는 과도한 측정을 먼저 요구하고 입력을 가린다. C는 저장 형식·schema를 바꿔 이 노드의 경계를 넘는다. 예제 구분은 이름 접두와 합성 카탈로그 digest로 한다.
- 조건: 안내는 입력 초안과 worker에 쓰지 않는다. 필수 안내는 공간 안쪽 세 값뿐이며 나머지는 선택이다. 비워 둔 칸은 "미측정"이고 통과나 0으로 바뀌지 않는다. 합성 자료를 쓰는 화면은 구매할 수 없다고 쓴다. 안내를 닫아도 입력은 보존된다. 새 색 토큰은 없고 정보 바탕(`--zari-info-soft`) 위 글자 쌍 두 개를 contrast case에 추가한다. 승인된 baseline은 바꾸지 않는다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 접기 단추는 `aria-expanded`/`aria-controls`이고 Enter/Space로 누른다. 도움말 영역은 `aria-live="polite"`다. 단추 높이는 기존 토큰이다. 390px에서 한 열이고 forced-colors는 시스템 색을 쓴다. 안내는 worker 요청을 만들지 않으며 브라우저 시험이 요청 수 불변을 확인한다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 결제·출시·사진 동의·클라우드·실상품 연결·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, `features/onboarding`, 시작 선택·배너·합성 문구를 걷어 낸다. 저장 데이터와 계약은 바뀌지 않으므로 되돌릴 데이터가 없다.

## Dz-catalog-crawler — 공개 상품 치수 자동 수집 봇과 읽기 전용 카탈로그 클라이언트 / 채택

- ID: Dz-catalog-crawler
- 상태: 채택. 소유자 지시 2026-10-15 KST. 이 기록은 z-catalog-crawler만 다룬다. 이 노드는 고정된 `.aiops/program.json`에 없고 감독자 프로그램 사본에만 있다.
- 문제: 실상품 치수를 사람이 한 건씩 입력하지 않고 카탈로그를 채우고 싶다. 동시에 v1의 "scraper 없음", 이미지·로그인·차단 우회 금지, 앱의 로컬 우선과 읽기 전용, unknown을 통과로 바꾸지 않는 규칙을 지켜야 한다.
- 변경 대상: [docs/adr/SP-z-catalog-crawler.md](../docs/adr/SP-z-catalog-crawler.md), [docs/CATALOG_COLLECTION.md](../docs/CATALOG_COLLECTION.md), `tools/catalog-extension/`, `tools/catalog-crawler-bot/`, `crates/core/src/catalog_bundle.rs`(와 example·WASM 자유 함수·생성 계약), `apps/web/src/features/catalog/`의 번들 패널과 이미지 없는 도형, `apps/web/src/worker/bundleWorker.ts`, `project.css`의 도형 규칙, 단위·브라우저·Rust 시험, `tests/fixtures/catalog-collection/`. 프로토콜·`BUILD_ID`·capability·DB version·기존 fixture 기대값은 바꾸지 않는다.
- 검토한 대안: (A) 사용자 Chrome 안의 MV3 확장이 봇의 작업만 실행하고, 봇은 Native Messaging(+0600 Unix 소켓)으로 구동·검증·게시하며, 앱은 번들을 읽기만 한다. (B) 서버측 fetch 크롤러. (C) 앱 안의 크롤러. (D) 127.0.0.1 브리지 또는 CDP로 브라우저 제어.
- 선택: A. B는 ohou.se가 비브라우저에 robots.txt를 403으로 막아 우회 압력이 되고, C는 앱의 읽기 전용·로컬 우선을 깬다. D는 다른 프로세스·웹페이지가 닿는 포트를 연다.
- 조건: 이미지·사진·썸네일은 수집·저장·배포·표시하지 않는다. 항목은 항상 `unconfirmed`이며 Rust는 Unverified 조건부 적합으로만 다룬다. 외경으로 내경을 채우지 않는다. 단위·축을 추측하지 않는다. 한 행이라도 격리되면 기존 카탈로그를 부분 덮어쓰지 않는다. 수집은 호스트별 저속·상한·robots·차단 즉시 중단·킬 스위치 아래에서만 돈다. 앱의 URL 읽기는 z-privacy-offline의 네트워크 가드와 충돌하므로 이 빌드에서는 파일 전용이고 읽기 규칙 코어만 시험으로 고정했다(켜는 조건은 ADR에 기록). 약관·데이터베이스권·저작권·차단 위험은 소유자가 수용했다(법률 자문 아님, 무인 자동 수집은 약관이 가장 자주 금지하는 유형). 새 색 토큰은 없고 기존 `canvas-outline`/`warning-on-soft` 쌍만 쓴다. Fable 게이트는 독립 읽기 전용 검토 2회로 대체하고 머지는 감독자에게 위임된다.
- 접근성·성능: 파일 입력은 네이티브 컨트롤이고 저장 단추는 Enter로 누른다. 결과는 `role="status"`이며 도형은 `role="img"`에 가로·세로·높이를 읽어 준다. 미확인 항목은 글자로 "치수 미확인"이라 쓴다. 390px에서 한 열이고 forced-colors는 시스템 색을 쓴다. 번들 검토는 전용 Worker에서 하고 항목 5,000개·10 MiB로 제한한다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-15 KST, 원문: "크롤링해야지. 이것도 일종의 디지털트윈으로 해서 직접 적용할수있게 해주는건데." 이 문장은 이 노드의 채택이다. R2 계정·비용·공개 base URL, Chrome 웹 스토어 게시, 사진·이미지 사용, 앱 URL 읽기 활성화, 화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, `tools/`, `catalog_bundle.rs`와 생성 계약 루트 세 개, 번들 패널을 걷어 낸다. 저장된 번들 카탈로그는 일반 `imported` 카탈로그라 데이터를 지울 필요는 없고 `#/data`·카탈로그 화면의 기존 경로로 다룬다.

## D-audit-01 — 프로젝트 화면의 빠진 토큰을 기존 semantic token으로 닫음 / 채택

- ID: D-audit-01
- 상태: 채택. full-work audit 01의 F6. 화면 승인이 아니다.
- 문제: `project.css`가 `--surface`, `--line`, `--muted`, `--accent`, `--wash`, `--ink`를 참조하고, 그 속성은 `tokens.css`에 없다. 폴백 hex와 `.session-status`의 `#fdecec`/`#8a1f1f`, `#eef6ee`/`#1f5c28`은 토큰 팔레트 밖이다.
- 변경 대상: `apps/web/src/styles/project.css`, `scripts/check-design-tokens.mjs`. 새 색 토큰은 없다.
- 검토한 대안: (A) 폴백 hex를 새 토큰과 contrast case로 등록한다. (B) 이미 contrast case가 있는 semantic token으로 바꾼다.
- 선택: B. 표면은 `--zari-surface-panel`, 선은 `--zari-border-subtle`, 보조 글자는 `--zari-text-secondary`, 본문 글자는 `--zari-text-primary`, 옅은 바탕은 `--zari-surface-subtle`, 강조는 `--zari-accent`, 초점은 `--zari-focus-ring`이다. 저장 실패·충돌·미지원은 `--zari-danger` / `--zari-danger-soft`, 저장됨은 `--zari-success` / `--zari-success-soft`다. 그 쌍은 이미 `danger-on-soft`, `success-on-soft`다.
- 조건: 컴포넌트 CSS가 `tokens.css`에 없는 custom property를 참조하면 `check-design-tokens.mjs`가 실패한다. 팔레트 밖 hex를 다시 넣지 않는다.
- 접근성·성능: 상태 색은 글자와 함께 쓴다. 토큰 파일의 forced-colors 재지정은 그대로다.
- 사용자 승인 근거: 없음. 기존 토큰으로 계약을 맞춘 수정이다.
- 되돌리기: 이 결정과 검사 확장을 걷어 낸다.

## Dz-product-qualification — 정리 제품 확장 전체 여정 qualification / 채택

- ID: Dz-product-qualification
- 상태: 채택. 사용자 결정 2026-10-07 12:42 KST. 이 기록은 z-product-qualification만 다룬다. 같은 발화의 이후 z-노드(z-local-delivery)는 각 노드에서 구현한다.
- 문제: 노드별 독립 테스트가 전부 통과해도 측정→실상품 검토→대안→구매 준비→실행→위치 검색→재정리가 하나의 스냅샷 위에서 끝까지 이어지는 근거는 없다. mock·합성·실상품·실기기 증거가 섞이고, 미완료 항목을 분모에서 빼면 남은 것만 완료로 보인다.
- 변경 대상: [docs/adr/SP-z-product-qualification.md](../docs/adr/SP-z-product-qualification.md), `apps/web/tests/browser/product-journey.spec.ts`, `docs/qualification/z-denominator.json`, `docs/qualification/Z-JOURNEY-QUALIFICATION.md`, `docs/qualification/review-package/`(패키지 HTML·CSV·manifest·index), `scripts/check-z-denominator.mjs`, `scripts/check-review-package.mjs`, 단위 시험. Rust·프로토콜·스키마·DB version·`BUILD_ID`·fixture·생성 계약·앱 코드는 바꾸지 않는다.
- 검토한 대안: (A) 하나의 실제 브라우저 여정 + 시나리오별 네 겹 증거(native·실제 WASM·저장·화면) + 별도 분모 문서 + 사용자 검수용 계획 패키지. (B) 기존 노드별 스펙만 모아 완료로 보고. (C) 여정을 앱 안의 새 화면이나 런타임 리포트로 구현.
- 선택: A. B는 spec이 금지하는 "독립 테스트만으로 전체 완료 주장"이 된다. C는 새 화면이 또 다른 미검증 표면이 되고 런타임 상태 API는 금지다. 분모 문서는 인계용 별도 투영이지 앱·Rust의 중앙 상태가 아니다.
- 조건: 전 과정 같은 accepted snapshot과 같은 `data-revision`만 완료 근거로 인정한다. unknown을 pass/0으로 승격하지 않는다. 미완료 항목(z-local-delivery, 전화·전용 GPU, 실제 사이트 수집, 캡처 수용, 출시)은 원래 분모에 남기고 지우지 않는다. 검수용 패키지는 실제 출력 패널이 채택 snapshot에서 만든 결과물이고 합성 자료는 합성이라고 쓴다. 새 색 토큰은 없다. Fable NONE과 비작성자 A2는 사용자가 정한 대로 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다.
- 접근성·성능: 여정 스펙은 390px 넘침 없음·forced-colors·키보드 진입을 각 시나리오에서 확인한다. 검수 패키지는 텍스트 산출물이라 픽셀 기준이 아니다. 별도 런타임 비용은 없다.
- 사용자 승인 근거: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST, 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해." 이 문장은 이 노드의 채택이다. 실기기 검증·실제 판매처·결제·클라우드·출시·화면 exact-set 승인은 아니다.
- 되돌리기: 이 결정, 여정 스펙, 분모·검수 패키지 문서와 검사 스크립트를 걷어 낸다. 저장 데이터와 계약은 바뀌지 않으므로 되돌릴 데이터가 없다.

## 새 결정 기록 양식

ID / 상태 / 문제 / 변경 대상 / 검토한 대안 / 선택 이유 / 접근성·성능 영향 / 전후 화면과 코드 SHA / 사용자 승인 근거(해당 시) / 되돌리기 경로.

기존 결정을 조용히 덮어쓰기보다 supersedes 관계를 기록한다. 버전 충돌·글꼴 변경·토큰 전역 변경·컴포넌트 기반 교체는 새 결정을 남긴다.
