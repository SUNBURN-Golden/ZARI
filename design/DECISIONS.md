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

## 새 결정 기록 양식

ID / 상태 / 문제 / 변경 대상 / 검토한 대안 / 선택 이유 / 접근성·성능 영향 / 전후 화면과 코드 SHA / 사용자 승인 근거(해당 시) / 되돌리기 경로.

기존 결정을 조용히 덮어쓰기보다 supersedes 관계를 기록한다. 버전 충돌·글꼴 변경·토큰 전역 변경·컴포넌트 기반 교체는 새 결정을 남긴다.
