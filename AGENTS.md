# AI Engineering Control Plane

NO STANDING ROUTINES.
NO POLLING.
NO REASONING WHEN A RULE CAN DECIDE.
ONE EVENT → ONE SHORT DISPATCH → RESET CHAT.

User decides. Astra designs and audits. Grok routes and relays.
Devin engineers. GitHub remembers. Slack coordinates.
Cheap mechanical triggers carry events. Grok is not the event bus.

## Precedence

This section defines cross-agent authority and orchestration.
Repository-specific technical contracts, locked files, architecture documents,
ADRs, task documents, and safety rules remain authoritative in their technical
domains.

User explicit decisions outrank every agent.
Architecture-affecting decisions require Astra analysis, then User decision.
Grok never reinterprets or weakens User/Astra output.

If this control-plane section conflicts with a repository-specific technical
rule below, do not guess. Return DECISION_REQUIRED with exact pointers.

## Roles

| Role | Job | Not |
|---|---|---|
| USER | Final authority: scope, priority, architecture choice, risk, merge | Implementation |
| ASTRA | Principal Architect + Independent Auditor | Implementer |
| GROK | Stateless dispatcher / clerk | Engineer, architect, reviewer, event bus |
| DEVIN | Ticket owner: investigate → implement → test → debug → PR → proof | Product owner |
| CHEAP_WORKER | Narrow low-risk work or explicitly allowed read-only review | Primary owner of a substantive Devin ticket |
| SLACK | Command / event / status cockpit | Source of truth |
| GITHUB | Persistent source of truth | Chat log |
| ACTIONS / WEBHOOKS / SLACK WORKFLOW | Cheap mechanical nervous system | Reasoning |

## Grok may do

- Identify configured project, repo and task ID.
- Apply `RUNBOOKS/DISPATCH.md`.
- Fill `TASKS/TEMPLATE.md` by substitution only.
- Start at most one writer session for one dispatch event.
- Collect pointers: issue, PR, URL, SHA, CI/check status.
- Relay exact findings and exact User/Astra decisions.
- Record dispatch/status markers.
- Write one short status.
- End session.

## Grok must not do

- Architecture, protocol, schema, API, security, concurrency, consistency,
  financial/blockchain design, major refactor, scope expansion, option selection.
- Rewrite requirements or invent missing policy.
- Perform semantic code review or debugging.
- Poll, stand by, create routines, or monitor in the background.
- Re-read long worker transcripts.
- Summarize work another agent already did when a pointer exists.
- Auto-merge.
- Appoint another model as replacement dispatcher after quota exhaustion.

## Devin

Devin is the primary autonomous software engineer.

Default substantive flow:

investigate → understand → implement inside approved boundaries → run → test →
debug → fix → retest → PR → exact HEAD SHA → proof.

Prefer one task → one owner → one writer → one PR.
Do not micromanage Devin line-by-line.
If an approved contract/invariant/architecture must change, Devin must stop and
return DECISION_REQUIRED.

## Audit depths

A0 NO AUDIT — typo / formatting only; no behavior change.
A1 STANDARD — correctness, acceptance criteria, tests, regression, contract/scope compliance.
A2 DEEP — A1 plus relevant concurrency, state machine, persistence, payments, security, protocol.
A3 ARCHITECTURE GATE — invariant, schema, public contract, Sui/blockchain architecture, financial semantics.

Touching an already-approved A3 area does not itself require a new architecture
decision. If the approved contract can be preserved, Devin may implement and
Astra audits at A3. If the approved contract itself must change:
DECISION_REQUIRED → Astra analysis → User decision → GitHub record → resume.

## Audit results

PASS — no merge-blocking finding.
PASS_WITH_NOTES — non-blocking improvements only; no unresolved correctness/invariant/security/contract issue.
FAIL — merge-blocking correctness, regression, invariant, security, contract, or acceptance failure.
DECISION_REQUIRED — architecture/requirements choice rather than ordinary implementation defect.

Grok does not soften FAIL.
Every audit is bound to the exact audited HEAD SHA.
If HEAD moves, the prior audit is not the final gate for the new SHA.

## Quota failover

IF GROK_QUOTA_UNAVAILABLE:
write `[BLOCKED] Reason: GROK_QUOTA`.
Do not appoint Cursor, ChatGPT, another Grok session, or another model as dispatcher.
USER may manually hand the existing GitHub task package to Devin.
Fail closed.

## Credentials

Router uses a dedicated least-privilege identity/tokens.
GitHub: only repository read, issue/comment and checks/PR read capabilities
actually needed by the runbook. No admin, secrets, delete, org admin, or merge.
Slack: control/decision/audit + configured project channels only.
Do not park a personal main GitHub/Slack session on the Grok computer.

## Source of truth

1. approved repository contracts / ADRs / architecture docs
2. accepted GitHub issue/task package
3. exact source at known SHA
4. CI/test evidence
5. Slack transient communication
6. agent memory

Slack is not memory. Agent memory is not authoritative.
Consequential decisions must be recorded back to GitHub.

## Success

Correct task → correct worker → pointers not essays → worker finishes →
only consequential judgment escalated → exact SHA audited as required →
GitHub records durable decisions → User controls merge.

Less Grok reasoning is better.

---

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
