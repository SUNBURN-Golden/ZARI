# ZARI

Rust-first organization compiler. 공간·물건·생활습관을 정리 전략, 검증 가능한 배치, 구매목록과 실행 가이드로 연결하는 정리컴파일러입니다.

## 현재 구현 범위

Task 001은 **폭 조건 검사와 묶음 수량 계산**을 실제 Rust → WebAssembly → Web Worker → React 화면으로 연결합니다. 입력은 한국어 측정 화면에서 원문 문자열로 유지하며, 단위 정규화와 수량 계산은 Rust가 담당합니다.

- `600mm` 공간에 `190mm` 물체 3개와 합성 예제의 좌우·사이 여유 `5mm`를 적용하면 필요한 폭은 `590mm`입니다.
- 물체를 `195mm`로 바꾸면 필요한 폭은 `605mm`로, 폭을 초과합니다.
- 미입력은 미확인 상태로 남고, 0 길이·음수·1mm 미만 소수 정밀도는 오류로 구분합니다.
- 필요한 수량 5개 / 묶음당 2개는 3묶음 / 공급 6개 / 잉여 1개로 표시합니다.

이 화면은 합성 예제의 **폭 한 축만 확인**합니다. 내용물 적합성, 설치 경로, 접근, 하중, 정리 전략, 제품 추천, 전체 BOM과 PlanSnapshot은 아직 구현하지 않았습니다. `5mm`는 예제값이며 보편적인 설치 권장치가 아닙니다. 프로젝트 저장 기능이 없으므로 새로고침하면 초기 예제로 돌아갑니다. 화면 캡처는 승인 근거가 기록되기 전까지 draft입니다.

구현·검증 결과와 미완료 항목은 [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)를 확인합니다. 문서에 적힌 전체 제품 기능과 성능 목표는 달성 결과를 뜻하지 않습니다.

## 로컬 실행

필요 도구는 Node **24.19.0**, npm **11.9.0**, Rust **1.98.1**, wasm-bindgen CLI **0.2.128**입니다. Rust 도구·대상은 `rust-toolchain.toml`, Node 버전은 `.nvmrc`에 고정했습니다. CLI는 Cargo.lock의 wasm-bindgen crate와 정확히 같아야 하며 빌드 스크립트가 이를 검사합니다.

```bash
rustup toolchain install 1.98.1 --profile minimal --component rustfmt --component clippy --target wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
npm ci
npm run wasm:build
npm run dev -- --host 127.0.0.1
```

개발 주소는 `http://127.0.0.1:5173`입니다. `crates/wasm/pkg`의 생성 WASM 바인딩은 Git에 넣지 않으며, 최초 실행과 Rust 변경 후 `npm run wasm:build`로 생성합니다. 배포용 정적 결과는 `npm run build` 후 `apps/web/dist`에 생깁니다. 이 작업은 배포를 수행하지 않습니다.

React/ReactDOM 19.3.0, React Aria Components 1.21.1, Vite 8.3.0, TypeScript 6.0.3을 함께 고정했습니다. Rust DTO → Schemars draft-07 → json-schema-to-typescript 16.0.0 / Ajv 8.20.0 standalone 검증기 흐름을 사용하며, TypeScript 수작업 도메인 스키마를 따로 만들지 않습니다. 정확한 전이 의존성은 두 lockfile을 기준으로 확인합니다.

## 검증

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo run -p zari-core --locked --example fixture_runner -- fixtures/bootstrap
cargo tree -p zari-wasm --target wasm32-unknown-unknown -e features,no-dev --locked
npm ci
npm run wasm:build
npm run contracts:check
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:browser -- --project=chromium
npm run test:parity
node scripts/check-design-tokens.mjs --self-test
```

`npm run contracts:generate`는 Rust DTO에서 커밋 대상 schema/types/validators를 갱신합니다. `contracts:check`는 임시 경로에서 다시 생성해 바이트 단위 drift와 공통 fixture 구조를 검사합니다. 생성 결과를 바꿀 때는 Rust 원본과 diff를 함께 검토해야 합니다.

`test:parity`는 같은 fixture를 native Rust와 실제 Chromium의 Worker/WASM에서 실행해 결과를 비교합니다. 브라우저 테스트 전용 harness는 `test:build`에만 포함되고 일반 `build`에서는 제외됩니다. CI는 구현된 범위의 검사와 실패 시 브라우저 자료를 제공하며, 독립 감사·디자인 승인·사용자 merge 결정을 대체하지 않습니다. 실제 실행한 명령과 결과는 구현 상태 및 PR 근거를 확인합니다.

## 제품 설계와 다음 단계

상세 설계의 시작점은 [구현 설계도](docs/BLUEPRINT.md)입니다. [전체 계산 예제](docs/COMPILER_WALKTHROUGH.md), [화면별 작업대 설계](design/WORKSPACE_BLUEPRINT.md), [Task 001–010 위임 계약](docs/DEVIN_PROGRAM.md), [Devin 전달문](docs/DEVIN_PROGRAM_PROMPT.md)을 함께 제공합니다.

- [제품 명세](docs/PRODUCT_SPEC.md) / [아키텍처](docs/ARCHITECTURE.md) / [저장소 감사](docs/REPOSITORY_AUDIT.md)
- [도메인과 버전](docs/DOMAIN_MODEL.md) / [solver와 독립 검증](docs/SOLVER.md)
- [Rust/WASM/Worker](docs/WASM_PROTOCOL.md) / [저장과 복원](docs/PERSISTENCE.md)
- [프런트엔드](docs/FRONTEND.md) / [디자인 시스템](docs/DESIGN_SYSTEM.md)
- [테스트](docs/TEST_STRATEGY.md) / [성능·보안·실패](docs/PERFORMANCE_SECURITY_FAILURES.md)
- [Devin 작업 그래프](docs/DEVIN_EXECUTION_PLAN.md) / [Task 001 계약](docs/DEVIN_TASK_001.md)

전체 정리 계획의 생성·독립 검증·동일 snapshot 기반 도면/BOM/가이드·저장·복원은 Task 006과 선행 작업의 별도 완료 기준입니다. 계정·클라우드·외부 AI·스크레이퍼·GPU·DuckDB·Polars는 현재 앱의 요구사항이 아닙니다.

## 원문과 디자인 계약

공식 프로젝트명은 **ZARI**입니다. [개발 마스터프롬프트](docs/MASTER_PROMPT_KO.md)와 [Rust 추가 지시문](docs/RUST_ADDENDUM_KO.md)은 [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)의 원본 바이트를 보존합니다. 기술 충돌 시 Rust 추가 지시문을 우선하며, 새 결정을 이유로 보존 원문을 고치지 않습니다. [AGENTS.md](AGENTS.md)는 역할·작업·검토 권한을 정의합니다.

**Apple식 정교함을 참고하되 ZARI의 공간 작업 화면을 만듭니다.** 측정·선택·검사의 연결과 unknown/stale의 명확한 구분을 우선합니다.

- [DESIGN.md](DESIGN.md) / [화면](design/SCREENS.md) / [컴포넌트](design/COMPONENTS.md)
- [공통 CSS 토큰](apps/web/src/styles/tokens.css) / [결정 기록](design/DECISIONS.md)
- [baseline 관리](design/baselines/README.md) / [baseline manifest](design/baselines/manifest.json)

Motion·Storybook·Impeccable·일반 DnD 기반은 도입하지 않았습니다. 토큰 검사와 스크린샷 비교만으로 접근성 인증이나 디자인 승인을 주장하지 않습니다.
