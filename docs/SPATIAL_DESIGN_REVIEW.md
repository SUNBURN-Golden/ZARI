# 공간 작업대 설계 패키지 — 작성자 검증 기록

작성일: 2026-09-30 KST. **Author self-check이며 독립 감사/Fable 판정/구현 완료가 아니다.** 게시 PR의 실제 exact HEAD가 이후 Fable 감사 대상이다. 문서 자체의 존재를 adopted/READY_FOR_MERGE/runtime-enabled로 해석하지 않는다.

## 1. 검토 기준

- ZARI main `7269c142d2e2c3becc43088d64e516389228527e`, tree `6fa1061ecfb633fdde1fd9062f45e72219087f6d`.
- 중앙 source main `f079b7e7ec71a8e47c03fca8d7ead2ef9a2fc960`의 program validate/render/default-branch requirement와 TASK ENVELOPE v4, Fable/M1/M5를 읽었다. host 자격/실제 설치/현재 activation binding은 확인하지 않았다.
- ZARI 현재 README/AGENTS/STATUS, 보존 프롬프트, DESIGN/화면/컴포넌트/결정/checklist/baseline, product/domain/Worker/frontend/workspace 문서와 실제 projection/edit/progress/DB/Worker/fixture source를 조사했다.
- 공식 Three source `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`의 package0.186.1/MIT/demand render/resource cleanup을 읽었다. registry publish/type compatibility/vulnerability scan/app integration은 아직 검증하지 않았다.

## 2. 실제 문서 검증

작업용 임시 checker에서 다음을 검증한다. checker는 이 PR에 실행 파일로 추가하지 않는다. `python /tmp/check_zari_spatial_design.py`는 source/artifact 구조 self-check이며 앱 테스트 명령이 아니다.

- 전체 변경 경로가 README 또는 docs/design의 md/json인지; protected prompts/manifest, apps/crates/scripts/locks, `.aiops/program.json`, `.github`/runtime files가 없는지.
- Markdown fence balance와 local relative file links가 기존 main tree+신규 documents에 존재하는지. 원격 service/GitHub 링크의 host 인증이나 availability 전체를 테스트한 것은 아니다.
- 일곱 task에 objective/context/frozen/acceptance/verification/forbidden/stop/deps/parallel/review/merge 계약이 있는지.
- 비활성 program의 node/spec가 실행 문서의 정확한 task body와 일치하는지; 직렬 DAG, unique IDs, gate fields, deliverable PR, pending approval 유지.
- pinned central `control_plane_program.py`에서 **검토한 pure `validate_plan`/`task_id_for` 두 함수만** AST로 추출해 JSON shape/DAG를 대조. 중앙 module import/CLI/host/network/materialize/dispatch는 실행하지 않았다. 구조 유효는 승인·qualification·실행 가능 여부를 증명하지 않는다.
- R1 worked example parent offset/yaw90 정수 수식을 별도로 대조. 실제 Rust/core/browser가 이 예제를 통과했다고 주장하지 않는다.
- README에는 설계 후보 링크만 추가; IMPLEMENTATION_STATUS의 기존 본문/성적을 보존하고 문서 작성 기록만 append. 승인 baseline count/manifest를 변경하지 않는다.

초기 링크 점검에서 아직 생성 전인 이 self-check 문서 링크가 탐지되어 이 파일을 추가했다. 이후 최종 checker를 다시 실행한다. 게시 후 remote base→HEAD compare로 변경 경로와 diff를 다시 확인하고 branch/PR HEAD 일치를 확인한다. 게시 PR에 그 실제 결과를 기록한다.

## 3. 설계 검토에서 해소한 항목

| 항목 | 확정한 계약 |
|---|---|
| 기존 parent+local 표시 불일치 | Rust global/partial-plane projection, checked offset/yaw formula, shared fixture |
| 입력 물건을 원점에 배치하는 위험 | 별도 ItemMeasurement frame/measurement_box; 실제 quantity/placement를 만들지 않음 |
| inner cavity/child/body key 중복 | role+typed target key; child instance namespace; opaque action-ID helper |
| conservative 오인 | 불확실성·offset이 전부 resolve할 때만; nominal/phase footprint와 구분 |
| system response survives epoch | component/source/worker/raw-editor lease 추가, per-hover projection0 |
| preview vs working vs accepted | gesture는 volatile, Rust 승인 작업안, accepted 명시적 선택 분리 |
| actionProgress null/late ack | unknown 완료 차단, binding fence와 transaction current input/CAS |
| 3D scope/오프라인 | read-only single-compartment, local lazy assets, demand rendering/dispose,2D fallback |
| AIOPS 권한 | 비활성 draft, Fable G0, 별도 승인 registration/pin, 중앙 lane/merge 계산 |

## 4. 미수행·남는 전제

실제 기능 구현/설치/lockfile 변경/앱 기동/화면 캡처/native·WASM·browser·CI tests/physical-device 성능/independent review/Fable 실행/AIOPS task 생성·dispatch/active program·client·runtime 변경/merge/배포를 수행하지 않았다.

남는 전제: Fable exact-HEAD 설계 채택, actual central host/runtime qualification과 pin 확인, approved program 등록, SP-005 dependency qualification, actual current CI failures 조사, physical-device 측정, 사용자 exact capture 승인. 테스트 계획·목표·문서 JSON 유효성을 이 전제의 완료로 부르지 않는다. 구현 시작 시 SP-001부터 수행하며 새 runtime/유료서비스/새 product scope가 필요하면 별도 consequential decision을 요청한다.

## Fable G0 감사 결과와 반영 (2026-09-30)

- G0 감사([#35 댓글](https://github.com/BeautifulMind-JT/ZARI/pull/35#issuecomment-5905430288), head `10c59f1`): DECISION_REQUIRED. 사용자가 선택지 A(Three.js 읽기 전용 절개 보기)를 골랐고 [D007](../design/DECISIONS.md#d007--읽기-전용-3d-절개-보기에-threejs-도입--채택)에 기록했다.
- 반영한 노트: F1 ARCHITECTURE.md 선택 기록과 D007, F2 SP-001·SP-005 파일 목록에 WASM_PROTOCOL.md·TEST_STRATEGY.md·ARCHITECTURE.md·DECISIONS.md, F3 fixture buildId 재고정 문구, F4 rem 기준 반응형 경계, F5 키보드 이동 단위는 FRONTEND.md 계약(SP-003에서 맞춤), F6 SP-002에 Fable MILESTONE G1b, F7 PR 번호 정정.
- F7의 나머지: 이 문서와 PR 본문의 중앙 control plane 서술(중앙 main, 검증기 모양, 레인 순서 등)은 작성자 확인이며 증거가 아니다. 등록 PR은 실제로 pin된 중앙 소스로 계획을 다시 검증한다.
