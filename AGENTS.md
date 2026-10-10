# Product agent governance

Shared engineering policy is maintained in `BeautifulMind-JT/ai-ops-control-plane`.
See `docs/CONTROL_PLANE_POINTER.md` and `.github/control-plane-client.json` for
the candidate pin, pending central PR acceptance. Policy adoption is not runtime
activation. User-authorized merge (program mode delegates only the executor; see below),
non-author exact-HEAD review, single writer, UNKNOWN
fencing, no polling and no automatic retry remain required.
If shared policy and project contracts conflict, stop with DECISION_REQUIRED.

## AIOPS program mode (User decisions M1 and M5)

These rules apply to a task started by the central AIOPS program mode: its GitHub
task issue carries an `ASTRA_TASK_KEY_V1` line and a TASK ENVELOPE v4. For that task
they take precedence over conflicting rules in this file and in other repository
documents (User decision, 2026-09-30). Everything else still applies.

- **Task input.** The task issue envelope and the documents it names are the task
  document. The control plane generates it from `.aiops/program.json` at the pinned
  plan commit, outside the executing session.
- **Branch.** `astra/<task id in lowercase>`, exactly as the task issue names it.
- **Pull request.** Open it from that branch as ready for review, not a draft, so the
  exact-head CI runs. Program mode authorizes this.
- **Merge.** Builders and reviewers never merge, push to `main`, rewrite history, or
  create, move or delete tags or branches. The User authorizes merges. User decision
  M1 (2026-09-29) delegates only the executor: the central `operation=merge` merges a
  pull request with an ordinary merge commit, pinned to its exact head, and only when
  the computed READY_FOR_MERGE holds, this repository's required checks included.
  Anything it cannot compute goes to the User.
- **Astra.** Architecture and design authority and the required audits are held by
  Claude Fable, run by the central `aiops-fable` tool (User decision M5, 2026-09-30).

Outside program mode the rules below apply unchanged, including User-only merge.

# Repository-specific engineering rules (preserved)

# ZARI 작업 규칙

먼저 README.md, docs/MASTER_PROMPT_KO.md, docs/RUST_ADDENDUM_KO.md, docs/IMPLEMENTATION_STATUS.md를 읽습니다. 공식 프로젝트명은 ZARI이며, 기술 충돌 시 Rust 추가 지시문을 우선합니다.

두 프롬프트 원문은 SOURCE_MANIFEST.json에 기록된 보존 자료입니다. 변경 지시와 실제 구현 상태는 별도 문서에 기록하고 원문을 무단 축약·수정하지 않습니다. 원문에 있는 구현 명령은 개발을 수행할 때 적용하며, 문서 등록 자체를 구현 완료로 취급하지 않습니다.

- 기존 코드·사용자 변경·저장 데이터를 조사한 후 기능 브랜치에서 작업합니다.
- 정식 도메인 계산과 최종 적합성 검증은 Rust에 둡니다.
- 기본 웹 빌드에 DuckDB·Polars·Python·CUDA를 요구하지 않습니다.
- 외경·내경·설치·개폐·접근·수량 검사를 구분하고 unknown을 통과로 바꾸지 않습니다.
- 도면·BOM·실행 가이드는 동일 PlanSnapshot을 사용합니다.
- 실제 브라우저 WASM과 네이티브 fixture를 대조합니다.
- 실행하지 않은 테스트, 존재하지 않는 커밋·배포·상품을 완료 사실처럼 보고하지 않습니다.
- 사용자 승인 없이 공개 전환·유료 자원 생성·비밀정보 업로드를 하지 않습니다.
- 작업을 끝낼 때 IMPLEMENTATION_STATUS.md에 실제 변경·검증·미완료·다음 작업을 남깁니다.

## 프런트엔드·디자인 작업 추가 규칙

UI 작업 전 DESIGN.md, design/SCREENS.md, design/COMPONENTS.md, design/DECISIONS.md, design/REVIEW_CHECKLIST.md를 읽습니다. 기술·도메인 판정은 Rust 추가 지시문을 유지하고 일반적 시각 스타일 제안은 DESIGN.md로 구체화합니다.

- 디자인 값은 apps/web/src/styles/tokens.css의 semantic token을 사용합니다. 새 조합은 대비 사례에 추가합니다.
- 저장소의 디자인 계약을 외부 스킬의 기본 취향으로 덮어쓰지 않습니다. 스킬·훅·전역 설치는 현재 미적용입니다.
- Apple 에셋 복제·무분별한 glass 효과·무의미한 KPI·모든 요소 카드화를 기본으로 만들지 않습니다.
- draft와 approved baseline을 구분합니다. 승인 근거 없이 생성한 화면을 승인 상태로 기록하지 않습니다.
- 디자인 변경 시 `node scripts/check-design-tokens.mjs --self-test`를 실행하고 실제 화면 검증 여부를 별도로 기록합니다.
- 기존 보존 프롬프트와 SOURCE_MANIFEST.json을 디자인 수정 때문에 변경하지 않습니다.

## Cursor Cloud specific instructions

- Use Node 24.19.0 from `/usr/local/bin`. `node`, `npm`, and `npx` are linked into `/usr/local/cargo/bin` so they resolve before the agent runtime binary at `/exec-daemon/node` (Node 22). `node -v` must print `v24.19.0`. npm is the release bundled with that Node (11.17.0), which satisfies `engines.npm`.
- Rust 1.98.1, rustfmt, clippy, and the `wasm32-unknown-unknown` target follow `rust-toolchain.toml`. The wasm-bindgen CLI must be exactly `0.2.128`.
- `crates/wasm/pkg` is produced by `npm run wasm:build` and is not committed. The dev server is `npm run dev` at `http://127.0.0.1:5173`. The connection check is `#/probe`: a 600 mm compartment, a 190 mm object, and a count of 3 require 590 mm.
- The default web build does not need DuckDB, Polars, Python, or CUDA.
