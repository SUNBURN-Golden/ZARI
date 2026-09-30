# ZARI 공간 확장 — AIOPS 인계문

상태: **전달문 초안 / 현재 미발송**. 이 문서의 존재는 개발 dispatch·리뷰·merge·runtime activation이 아니다. 사용자가 이번에 요청한 것은 상세 설계 게시다.

## 1. 먼저 할 설계 채택

현재 AGENTS program mode는 Claude Fable을 설계 권한자/필수 감사자로 둔다. 사용자 요구는 다섯 기능 개발 계획의 준비·게시이며, 작성자가 Fable PASS나 새로운 program start approval을 대신 기록하지 않는다.

운영자가 이 설계 PR의 실제 번호/40hex HEAD를 얻은 후, qualified 중앙 host에서 현재 규약의 `aiops-fable audit --repository BeautifulMind-JT/ZARI --pr <actual-pr> --head <actual-40hex-head> --gate ARCHITECTURE --depth A3`로 설계 package를 감사한다. angle-bracket 값은 이 문서의 자리표시자이며 실행값을 추정하지 않는다. runtime/version qualification이 없으면 설치/활성화 대신 해당 증거를 보고한다. 작성자는 자신의 문서를 독립 감사하지 않는다.

채택 후에는 기존 규약의 user/M1 approval·computed merge gate를 따른다. 이 문서 전용 PR을 program task라고 꾸며 중앙 자동 merge 대상으로 넣지 않는다. 명시된 scope와 별도 위험이 바뀌지 않는 routine implementation 선택은 매번 User에게 승인받지 않는다.

## 2. program 후보 등록의 별도 작업

`docs/aiops/ZARI_SPATIAL_PROGRAM_DRAFT.json`은 중앙 `control_plane_program.validate_plan`의 schema_version=1/node/dependency shape에 맞춘 **비활성 참고 자료**다. deliberately `approval_pointer`는 `PENDING_APPROVAL_DO_NOT_DISPATCH`; shape valid는 authorization이 아니다. 현재 중앙 loader는 고정 경로 `.aiops/program.json`만 읽고 승인된 plan commit이 default branch의 ancestor여야 한다.

등록자는 먼저 기존 `.aiops/program.json` 및 실행 중/UNKNOWN program/task가 없는지 확인한다. 있으면 덮어쓰지 않는다. 관련 program 추가·revision 직렬화를 중앙 source대로 처리한다. 승인된 후보를 등록할 때:

1. G0 exact-HEAD Fable result와 실제 사용자 scope/start authorization을 GitHub 정본 링크로 기록한다.
2. pending approval을 실제 durable approval pointer로 바꾼다. 설계 존재/채택만으로 runtime start authorization을 꾸미지 않는다.
3. authoritative documents는 **새 plan commit에 함께 존재하는 본 패키지 파일**을 가리킨다. immutable PLAN_COMMIT으로 조회하며 branch `main` 최신 문서를 pin 대신 쓰지 않는다.
4. user/central current gate를 거쳐 registration commit을 main에 병합한다. 변경은 승인된 program registration scope이며 host/client/activation/paid resources는 별도 승인 없이 바꾸지 않는다.
5. 실제 등록 commit SHA를 가져와 중앙 검증/qualification 후 materialize한다. task ID/branch는 program에서 생성하고 task issue envelope를 intake에서 작성한다. manual fake envelope/MAC/launch state를 작성하지 않는다.

그 뒤 node001부터 dependency DAG를 따라 진행한다. old candidate client pin과 latest control main의 차이가 있으면 host-approved 적용 pin을 확인한다. 이 설계는 source 확인만 했으므로 runtime이 당장 실행 가능하다고 선언하지 않는다.

## 3. 사용자가 개발 시작을 요청할 때 AIOPS에 전달할 본문

아래는 **앞으로 개발 시작에 사용할 문안**이다. 지금 전달/실행하지 않았다. 운영자는 actual adopted design PR/HEAD, start-approval URL, registered plan commit을 채운다.

> ZARI 공간 작업대 확장 프로그램을 채택된 설계와 pinned plan에 따라 끝까지 개발하십시오.
>
> Repository: BeautifulMind-JT/ZARI. Scope: 측정·선택·검사 레이어, 검증 기반 평면 드래그, 읽기 전용 구획 절개3D,2D/3D/BOM/검사 선택 연동, ActionStep 실행 시각화. 방/stacking/free rotation/cloud/AI/사진 추론/3D editor/deploy는 제외합니다.
>
> Inputs: adopted design PR/40hex HEAD, durable start-approval pointer, registered `.aiops/program.json` commit. 누락된 전제는 BLOCKED로 보고하고 authorization/state를 만들어내지 마십시오. 문서 후보를 active plan으로 착각하지 마십시오.
>
> Read pinned docs/SPATIAL_INTERACTION_PLAN.md, docs/SPATIAL_VIEW_CONTRACT.md, design/SPATIAL_WORKSPACE.md, docs/SPATIAL_VERIFICATION.md, docs/AIOPS_SPATIAL_EXECUTION_PLAN.md and relevant existing contracts. Current AGENTS/M1/M5 remain authoritative; source documents and original manifest remain protected.
>
> Central program mode generates canonical TASK ENVELOPE v4. Resolve lane ownership/qualification mechanically. Follow nodes001→007; do not parallelize same-product writers. Give each owner the complete bounded behavior and allow local investigation, implementation, tests, actual browser, debugging, diff review, status/evidence, exact commit and ready PR. Test/CI feedback returns to the same author owner; a routine failure does not need a fresh architecture redesign.
>
> Respect Rust authority, unknown/uncertainty, same immutable PlanSnapshot, source fences, coordinate and accepted-progress contracts. No pointermove WASM calls, optimistic BOM, assumed inner offsets, guessed measurements or preview promoted to pass. All view geometries originate from the common Rust projection. 3D read-only view is local/lazy/on-demand/disposable with2D fallback.
>
> Apply task required commands and full acceptance mapping. For UI, run and operate the real app including success, important errors, keyboard/touch/responsive/console. Report exact commands/results, artifact source HEAD, actual native/browser parity, performance targets vs results, hardware unverified states. No manufactured screenshot/status/audit claim.
>
> End each delivery with self-review, docs/evidence update, commit/full HEAD, ready PR and session-signed ASTRA_DELIVERY_V1 produced by the session's actual signer. Do not invent MAC/marker values. End the session so the central layer can reconcile the slot. A BLOCKED/DECISION_REQUIRED/STALLED state uses the actual signed blocked protocol; do not launch another owner over UNKNOWN.
>
> Non-author reviews and Fable gates use the exact current HEAD. Builders/reviewers never merge. User-authorized central operation=merge applies only if it computes READY_FOR_MERGE including repository bridge and expectedHeadSha. If it cannot compute a condition, follow the existing User decision path. Never use local test results to waive current required CI.
>
> Complete through draft capture handoff007. approved baseline remains unchanged until the User approves the exact capture set; beta/release/deployment is not part of this program. Stop only on the defined consequential contract/security/paid/license/migration/qualification conditions, not routine coding choices.

## 4. 완료 보고

Program/node states from canonical GitHub/host records, merged PR+HEAD per node, feature acceptance coverage, Fable exact-HEAD gate pointers, command/browser/parity/perf artifacts, remaining unverified hardware/quality, draft screenshots and approval set. No assumptions from closed issues alone. Report screen approval, implementation completion, merge and release separately.
