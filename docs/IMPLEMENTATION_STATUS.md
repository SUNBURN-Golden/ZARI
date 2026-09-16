# ZARI 구현 상태

## 이전 기록: 초기 문서 등록 (efc6619)

아래 이전 기록의 변경 범위는 초기 문서 등록입니다. Rust·WASM·React 애플리케이션 구현을 수행한 작업이 아닙니다.

## 준비한 내용

- 프로젝트명 ZARI와 Rust 중심 기술 방향.
- 제품 마스터프롬프트와 Rust 추가 지시문 원문.
- README, AGENTS, .gitignore, 원본 파일 무결성 manifest.
- 첫 구현 범위와 아래 재개 순서.

## 아직 없는 것

- Cargo workspace, Rust core·solver·WASM 바인딩.
- React/TypeScript 웹앱과 Web Worker 연결.
- IndexedDB 저장, 도면, BOM, 실제 상품 카탈로그.
- 실행 가능한 fixture·단위 테스트·브라우저 통합 테스트.
- CI workflow, 성능 측정, 배포와 서비스 URL.

## 이번 검증의 범위

두 프롬프트는 대화에서 제공한 원본 파일 및 ZIP 내부 파일과 바이트가 일치합니다. SHA-256과 Git blob SHA를 SOURCE_MANIFEST.json에 기록합니다. GitHub 게시 시 원격 tree의 blob SHA와 대조합니다.

이는 문서 무결성 검증입니다. 앱 테스트·브라우저 테스트·CI 성공 또는 외부 레퍼런스의 현재 유효성 검증을 의미하지 않습니다.

## 다음 개발 재개 순서

1. README와 두 프롬프트를 읽고 Rust 추가 지시문을 우선 적용합니다.
2. 기능 브랜치에서 도구 버전·실행 환경을 확인하고 최소 Cargo workspace를 구성합니다.
3. 정수 mm·수량·금액 타입, 공간 경계 검사, 구매 묶음 계산과 fixture를 구현합니다.
4. 같은 fixture를 네이티브와 실제 브라우저의 Worker/WASM에서 실행해 대조합니다.
5. React 입력 → Rust 계산 → 배치도·BOM → 로컬 저장·복원 흐름을 연결합니다.
6. 구현·미구현과 실행한 검증 결과를 구분해 이 문서를 갱신합니다.

DuckDB·Polars·cuDF는 현재 미도입입니다. 문서에 등장한다는 이유만으로 설치하지 않습니다.

## 현재 단계: 디자인 기반 v0.1 등록

DESIGN.md, 핵심 화면·컴포넌트 명세, 레퍼런스·결정·검토 규칙, light CSS 토큰, 비어 있는 baseline manifest, 의존성 없는 Node 토큰 검사기를 추가했습니다. README와 AGENTS에서 디자인 기준을 읽도록 연결했습니다. 프롬프트 원문과 SOURCE_MANIFEST는 변경하지 않습니다.

사용자가 정한 방향은 Apple식 정교함과 흔한 AI 템플릿 느낌 최소화입니다. 토큰 값과 화면 명세는 구현 초안이며 **승인된 화면은 0개**입니다. React UI·Rust 코어·WASM·Storybook·외부 디자인 스킬·서비스 배포는 여전히 없습니다.

검증 명령과 실제 결과는 [design/VALIDATION.md](../design/VALIDATION.md)를 봅니다. 토큰 검사 통과를 앱 실행·전체 접근성·시각 승인·CI 성공으로 해석하지 않습니다.

다음 개발에서는 DESIGN.md와 세 핵심 화면 명세를 함께 읽고, 기존 Rust/WASM 첫 연결 목표를 진행합니다. 도면·구매목록의 실제 상태를 구현한 뒤 캡처·검토하여 baseline을 등록합니다. 문서·화면 제작을 이유로 Rust 계산 연결을 가짜 UI로 대체하지 않습니다.
