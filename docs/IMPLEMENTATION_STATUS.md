# ZARI 구현 상태

## 현재 단계: 문서 초기화

이번 변경 범위는 초기 문서 등록입니다. Rust·WASM·React 애플리케이션 구현을 수행한 작업이 아닙니다.

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
