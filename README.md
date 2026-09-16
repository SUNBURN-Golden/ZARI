# ZARI
Rust-first organization compiler

공간·물건·생활습관을 정리 전략, 검증 가능한 배치, 구매목록과 실행 가이드로 연결하는 정리컴파일러.

## 현재 상태

초기 개발 문서를 등록하는 단계입니다. 애플리케이션 코드, 실행 환경, 테스트, CI, 배포는 아직 구현하지 않았습니다. 문서의 기능·성능·테스트 항목은 요구사항이지 달성 결과가 아닙니다.

현재 상태와 다음 작업은 [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)를 기준으로 확인합니다.

## 문서와 적용 우선순위

- [개발 마스터프롬프트](docs/MASTER_PROMPT_KO.md): 제품 목표, IKEA·Elfa 레퍼런스, 사용자 흐름, 검증 기준.
- [Rust 중심 추가 지시문](docs/RUST_ADDENDUM_KO.md): Rust/WASM 아키텍처, 계산 책임, 네이티브·브라우저 검증, 선택적 데이터 도구.
- [에이전트 작업 규칙](AGENTS.md): 개발 시 먼저 확인할 문서와 필수 불변조건.

공식 프로젝트명은 **ZARI**입니다. 원문에 남아 있는 가칭 ‘정리컴파일러’와 코드명 ‘organization-compiler’는 이전 명칭입니다. 기술 지시가 충돌하면 **Rust 추가 지시문을 우선** 적용하되, 제품·UX·검증 요구사항은 유지합니다.

두 프롬프트는 원본 바이트를 변경하지 않고 보존했습니다. 원본 파일명, SHA-256과 Git blob SHA는 [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)에 기록했습니다. 과거의 기술·레퍼런스 확인 문구는 이번 문서 등록에서 새로 검증한 결과가 아니므로 실제 도입 시 공식 문서와 지원 버전을 다시 확인합니다.

## 확정한 기술 방향

Rust 코어가 정리 규칙·배치 탐색·적합성 검증·수량·비용 계산을 담당합니다. React/TypeScript UI는 Web Worker 안의 Rust/WASM과 연결합니다. 초기 저장은 로컬 우선이며, DuckDB·Polars·cuDF는 필요성과 효과가 검증된 데이터 처리 구간에만 도입합니다.

## 첫 구현 목표

수납장 한 칸 입력 → 정리 전략 선택 → 실제 Rust/WASM 계산 → 배치도·BOM 갱신 → 저장·불러오기.

먼저 공간 경계 검사와 구매 묶음 계산을 Rust로 구현하고, 같은 fixture의 네이티브·실제 브라우저 WASM 결과를 대조합니다. 현재 이 기능이 구현되었다는 뜻은 아닙니다.
