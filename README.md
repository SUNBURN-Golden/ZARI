# ZARI

Rust-first organization compiler. 공간·물건·생활습관을 정리 전략, 검증 가능한 배치, 구매목록과 실행 가이드로 연결하는 정리컴파일러입니다.

## 현재 구현 범위

main에는 계획된 Task 001–010이 모두 병합되어 있습니다. Task 001–009는 독립 감사(조건부 통과) 후 병합했습니다. Task 010(성능·접근성·브라우저 매트릭스 측정)과 유지보수 PR #30은 GitHub Actions 사용량 한도 기간에 사용자 지시로 CI와 독립 감사 없이 병합했습니다. 병합은 제품 적합성·베타 출시·배포를 뜻하지 않으며, 배포된 서비스는 없습니다.

단일 직사각형 수납 공간을 대상으로 아래 흐름이 로컬 브라우저에서 동작합니다. 단위 정규화·배치 탐색·적합성 검증·BOM 계산은 Rust(WebAssembly, Web Worker)가 담당하고, React는 Rust 결과를 그대로 표시합니다.

- **측정과 저장** (`#/projects`, `#/project/<id>`): 한국어 원문 입력을 보존하고 Rust가 정규화합니다. 이 기기 브라우저의 IndexedDB에 저장하며, 두 탭의 동시 수정은 충돌로 표시하고 조용히 덮어쓰지 않습니다.
- **계획 생성** (`#/project/<id>/plan`): 정리 전략 → 취소 가능한 단계형 탐색 → 독립 검증을 통과한 후보만 PlanSnapshot으로 확정합니다. 같은 스냅샷에서 평면·정면 도면, 검사 결과, 미배치 물건, BOM, 실행 순서를 함께 보여주며, 채택한 계획은 새로고침 후에도 복원됩니다.
- **편집**: 좌표 입력, 허용된 방향 회전, 수납함 옵션·판매처 교체를 Rust가 다시 검증하고 거절 사유를 설명합니다. 되돌리기/다시 실행을 지원하며 드래그 편집은 없습니다.
- **카탈로그와 보유 수납함** (`#/catalog`): 수동 입력·CSV·JSON 가져오기는 Rust 검증을 통과한 뒤에만 저장합니다. 번들 카탈로그는 **합성 데모 데이터**이며 실제 상품·가격·재고가 아닙니다. 판매처 연동·실시간 재고·주문 기능은 없습니다.
- **복구와 이식**: 프로젝트 내보내기·가져오기·복제, 손상 레코드 격리와 복구용 내보내기, 수식 실행을 막는 BOM CSV, 이 기기에만 저장되는 사진 첨부(위치정보를 제거한 표시용 사본이며 내보내기 파일에는 포함되지 않음), 한 번 방문한 빌드의 오프라인 재방문.
- **초기 연결 확인 화면** (`#/probe`): Task 001의 폭 검사·묶음 계산 예제입니다. `600mm` 공간에 `190mm` 물체 3개와 합성 여유 `5mm`를 적용하면 필요한 폭은 `590mm`, 물체가 `195mm`이면 `605mm`로 초과입니다. `5mm`는 예제값이며 설치 권장치가 아닙니다.

미확인(unknown) 값은 0·통과·재고 있음으로 바꾸지 않습니다. 구획 내부 3D 적재, 방 전체 3D, 계정·클라우드 동기화, 외부 AI 분석은 범위 밖입니다. 브라우저 저장소는 백업이 아니므로 중요한 프로젝트는 내보내기 파일로 보관합니다. 화면 캡처는 승인 근거가 기록되기 전까지 draft이며 현재 승인된 화면은 0개입니다.

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

후속 공간 작업대 확장 다섯 기능의 **설계 후보**는 [SPATIAL_INTERACTION_PLAN](docs/SPATIAL_INTERACTION_PLAN.md)에서 시작합니다. [공통 공간 투영·선택 계약](docs/SPATIAL_VIEW_CONTRACT.md), [화면·드래그·절개 뷰](design/SPATIAL_WORKSPACE.md), [검증 기준](docs/SPATIAL_VERIFICATION.md), [AIOPS 일곱 작업 계획](docs/AIOPS_SPATIAL_EXECUTION_PLAN.md), [AIOPS 인계문](docs/AIOPS_SPATIAL_HANDOFF.md)을 제공합니다. 이 문서 추가는 신규 기능 구현·독립 감사·화면 승인·AIOPS 실행을 뜻하지 않습니다. program 후보는 `docs/aiops/`의 비활성 자료이며 `.aiops/program.json`과 런타임을 변경하지 않습니다.

상세 설계의 시작점은 [구현 설계도](docs/BLUEPRINT.md)입니다. [전체 계산 예제](docs/COMPILER_WALKTHROUGH.md), [화면별 작업대 설계](design/WORKSPACE_BLUEPRINT.md), [Task 001–010 위임 계약](docs/DEVIN_PROGRAM.md), [Devin 전달문](docs/DEVIN_PROGRAM_PROMPT.md)을 함께 제공합니다.

- [제품 명세](docs/PRODUCT_SPEC.md) / [아키텍처](docs/ARCHITECTURE.md) / [저장소 감사](docs/REPOSITORY_AUDIT.md)
- [도메인과 버전](docs/DOMAIN_MODEL.md) / [solver와 독립 검증](docs/SOLVER.md)
- [Rust/WASM/Worker](docs/WASM_PROTOCOL.md) / [저장과 복원](docs/PERSISTENCE.md)
- [프런트엔드](docs/FRONTEND.md) / [디자인 시스템](docs/DESIGN_SYSTEM.md)
- [테스트](docs/TEST_STRATEGY.md) / [성능·보안·실패](docs/PERFORMANCE_SECURITY_FAILURES.md)
- [Devin 작업 그래프](docs/DEVIN_EXECUTION_PLAN.md) / [Task 001 계약](docs/DEVIN_TASK_001.md)

Task 001–010의 계획 범위는 병합되었습니다. 성능 측정은 `npm run bench:browser`로 재현하며, 측정 정의·결과·미측정 항목(Firefox·WebKit 재측정, 실제 모바일 기기, 일부 성능 목표)은 [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)와 [INV-01 보고서](docs/INV01_MESSAGING_RESIDUAL.md)에 기록합니다. 베타 출시·배포는 별도의 사용자 결정입니다. 계정·클라우드·외부 AI·스크레이퍼·GPU·DuckDB·Polars는 현재 앱의 요구사항이 아닙니다.

## 원문과 디자인 계약

공식 프로젝트명은 **ZARI**입니다. [개발 마스터프롬프트](docs/MASTER_PROMPT_KO.md)와 [Rust 추가 지시문](docs/RUST_ADDENDUM_KO.md)은 [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)의 원본 바이트를 보존합니다. 기술 충돌 시 Rust 추가 지시문을 우선하며, 새 결정을 이유로 보존 원문을 고치지 않습니다. [AGENTS.md](AGENTS.md)는 역할·작업·검토 권한을 정의합니다.

**Apple식 정교함을 참고하되 ZARI의 공간 작업 화면을 만듭니다.** 측정·선택·검사의 연결과 unknown/stale의 명확한 구분을 우선합니다.

- [DESIGN.md](DESIGN.md) / [화면](design/SCREENS.md) / [컴포넌트](design/COMPONENTS.md)
- [공통 CSS 토큰](apps/web/src/styles/tokens.css) / [결정 기록](design/DECISIONS.md)
- [baseline 관리](design/baselines/README.md) / [baseline manifest](design/baselines/manifest.json)

Motion·Storybook·Impeccable·일반 DnD 기반은 도입하지 않았습니다. 토큰 검사와 스크린샷 비교만으로 접근성 인증이나 디자인 승인을 주장하지 않습니다.


### 전체 제품 완성 후속 후보 — 2026-10-01 KST

[측정 완성 후보](docs/MEASUREMENT_COMPLETION_DESIGN_KO.md)의 SP-008–011 뒤에 [실행 가이드·평가·복구 고도화](docs/PRODUCT_COMPLETION_EVOLUTION_KO.md)를 연결했습니다. 실제 source의 staging loading/loaded insertion 순서와 action 조건의 누락, full-candidate 평가의 indivisible step, 버전 변경 후 역사 가이드·진행을 별도 작업으로 소유합니다. 기존 7단계와 측정 4단계를 보존한 전체 후보 분모는 **16**이며 SP-012–016을 추가했습니다. `.aiops/program.json`과 전체 pending sidecar는 같은 후보이고, 최초 7단계 sidecar는 역사 checkpoint입니다. 구현·승인·실제 기기 qualification·새 화면 채택·런타임 활성화·배포를 완료한 것은 아닙니다.
