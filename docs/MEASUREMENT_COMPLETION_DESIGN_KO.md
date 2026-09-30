# ZARI 측정 완성·다음 확인 사실 설계 후보

공통 후속 규약: [중앙 #46](https://github.com/BeautifulMind-JT/ai-ops-control-plane/pull/46), 후보 HEAD `a8b7355712c58de8d27c85a535fb241a09a4037c`. [고정 설계](https://github.com/BeautifulMind-JT/ai-ops-control-plane/blob/a8b7355712c58de8d27c85a535fb241a09a4037c/engineering/docs/PROGRAM_EXECUTION_EVOLUTION_DESIGN_KO.md)는 아직 운영·승인 evidence가 아니다.

상태: **후속 설계 후보 / 미채택 / 구현·실측·감사·화면 승인 없음**. 작성일 2026-09-30 KST.
기준은 [ZARI #36](https://github.com/BeautifulMind-JT/ZARI/pull/36)의
`bdeaaf0881b48f819c56a539799165a9d545677f`이다. 기존 공간 설계 #35와 SP-001–007,
현재 11개 기본 치수의 범위를 보존하고, SP-008–011을 별도 후속 후보로 추가한다.
사용자의 설계 고도화 요청은 문서 작성 권한이다. 이 후보의 exact-HEAD 독립 감사·채택,
최종 등록·실행 승인을 대신하지 않는다. `.aiops/program.json`의 승인 포인터는 PENDING이다.

## 1. 해결할 사용자 문제와 보존할 계약

현재 일반 치수 입력은 값과 단위를 다룬다. 새 프로젝트의 오차는 unknown이고, 값을
채워도 오차가 자동 확정되지 않는다. 이는 올바른 의미다. 공간 SP-002는 기존 11개 치수의
선택·강조를 연결하며 staging·지지·동작 여유 전체 입력까지 포함하지 않는다.
후속 범위는 사용자가 JSON을 직접 편집하지 않고 필요한 실제 사실을 보완하는 흐름이다.

- [DOMAIN_MODEL](DOMAIN_MODEL.md)의 Fact·Measurement·Uncertainty·Provenance·Evidence,
  [FRONTEND](FRONTEND.md)의 raw/epoch/current/stale, [PERSISTENCE](PERSISTENCE.md)의 CAS를 유지한다.
- 값·오차·출처·물리 판정·수량·BOM 계산과 안내 목록의 의미 있는 우선순위는 Rust가 소유한다.
  React는 문자열·초점·접기·선택·표시를 소유한다. LLM 호출·사진 치수 추정·자동 신뢰도는 없다.
- 정수 mm 및 정확한 십진수 변환을 유지한다. 사진·사용자 선언·제조사 출처를 각각 표시하며
  `UserMeasured` 선택만으로 Confirmed가 되지 않는다. 오차 known과 출처 confirmed는 독립이다.
- direct/owned/no-purchase는 정상 경로다. 새 카탈로그·구매·판매처 정보가 없는 것을 가짜로 채우지 않는다.
- 방 전체·경첩·적층·미지원 동작·새 geometry/rule·실물 안전 인증은 포함하지 않는다.
  기존 SupportFootprint 표현 모호함은 이 후보에서 새로운 평면 DTO로 재설계하지 않는다.

## 2. 일반 입력에서 상세 측정으로 이어지는 흐름

1. 기존 기본 치수 입력과 샘플 체험을 유지한다. 샘플의 가정을 일반 새 프로젝트의 사실로
   복사하지 않는다. `상세 측정`은 입력 아래의 명시적 버튼이며 처음부터 거대한 form을 펼치지 않는다.
2. 사용자 선택 필드에 `값 / 오차 범위 / 출처·근거`를 한 논리 그룹으로 표시한다.
   기본은 오차 미확인이다. 접힌 상태에도 `오차 미확인`을 보이고 숨겨진 0을 넣지 않는다.
3. 유효한 raw 입력을 Rust가 정규화한 후 기존 저장·활성화 경로로 커밋한다. 수정 즉시 기존
   계획·안내는 stale이다. 저장 성공과 현재 계획 재계산은 별도 행동/상태로 표현한다.
4. 사용자가 재계산하면 같은 현재 PlanSnapshot 검사에서 `다음에 확인할 사실`을 읽는다.
   각 행은 이유·필요한 사실·관련 검사·대상·다음 행동을 보여 준다. 한 사실을 여러 검사에서
   요구해도 입력 행은 하나이며 영향받는 검사는 모두 펼쳐 볼 수 있다.
5. `측정하기`는 정확한 입력 그룹과 치수선으로 이동한다. 현재 지원되는 form이 없으면
   `입력 지원 안 됨`과 근거/카탈로그 편집 경로를 보여 준다. 임의 값을 쓰거나 확인됨 체크로 대체하지 않는다.
6. 값 보완→Rust 정규화→CAS 저장→명시적 재계산 후 안내 목록을 갱신한다. 이전 unknown이
   어떤 현재 검사에서 달라졌는지 보여 주되, 그 사실 하나로 전체 적합성이 증명됐다고 하지 않는다.

compact에서는 기본 치수→다음 확인 목록→선택한 상세 그룹 순으로 이동한다. 상세 패널은
기존 sheet/초점 복귀 규칙을 따르며 값과 오류가 키보드·safe area에 가려지지 않는다.
wide에서는 도면 옆 inspector와 같은 대상/field reference를 사용한다. 기본 11개 field
회귀·keyboard·IME·unit-select focusWithin·200%·forced-colors·reduced-motion을 유지한다.

## 3. 값·오차·단위·관측의 확정 계약

| 입력 종류 | 사용자 입력 | Rust 검증과 표시 |
|---|---|---|
| positive length | nominal text + mm/cm | 기존 exact grammar, sub-mm/0/범위 위반 거절 |
| uncertainty | 미확인 또는 명시적 bounded minus/plus text + unit | 두 bound 모두 있어야 함; 0은 사용자가 직접 입력한 때만 known |
| signed offset | 정수 mm text + unknown/bounded 오차 | 기존 PositionMm 범위; 0과 unknown 분리; 길이 문법을 재사용하지 않음 |
| clearance/handling | unknown 또는 음이 아닌 정수 mm | 현행 ClearanceMm 범위; 설치 gap과 측정 오차를 합쳐 같은 값으로 저장하지 않음 |
| quantity/mass/load | unknown 또는 기존 count/grams raw scalar | Rust의 기존 개별 타입·범위; 단위를 묵시적으로 바꾸지 않음 |
| source/evidence | existing origin, local note/locator, 관측 시각이 실제 있으면 입력 | 안전한 참조·길이·ID·관계 검증; 생성 시각을 관측 시각으로 넣지 않음 |

`bounded`를 선택하고 한 bound가 비거나 invalid이면 원문을 보존하고 제출을 막는다.
한쪽 누락을 0으로 변환하지 않는다. `unknown`으로 명시 전환하면 비활성 raw bound text는
로컬 편집 UI에 남길 수 있지만 canonical input에는 bounds를 동시에 남기지 않는다.
nominal−minus가 양의 길이 범위를 벗어나거나 nominal+plus가 범위를 넘으면 구조화된 오류다.
offset의 interval은 signed/checked이고, available 최소·occupied 최대 적용은 기존 Rust 규칙이다.

단위 전환은 nominal과 활성 bound를 **한 그룹의 동일 editor epoch**에서 Rust에 요청한다.
하나라도 미완성/invalid이면 그룹 전체를 전환하지 않고 원래 문자열·단위와 이유를 유지한다.
JS parseFloat/반올림/최솟값·평균값으로 원문을 덮어쓰지 않는다. known nominal+unknown bounds는
유효한 conditional 데이터이며 입력 오류와 다르다.

반복 실측값은 현행 `Evidence`의 bounded `note`에 사람이 읽을 원문·단위·측정 위치/방법을
기록하고 기존 sourceKind/locator/sourceField/observedAt와 해당 fact의 evidenceIds로 연결한다.
현행 Evidence에는 typed observation value/unit/method 필드가 없으므로 note를 숫자·geometry·
자동 conflict 입력으로 파싱하지 않는다. 기존 note 길이·evidence 수·ID·참조 한도를 유지한다.
자동 평균·최솟값·최댓값·표준편차·95% 신뢰구간을 authoritative interval로 만들지 않는다.
사용자가 선택한 nominal과 보장하려는 오차 범위를 별도로 명시하고 해당 관측들을 연결한다.
사용자가 기록한 충돌 주장은 근거 note의 주장으로 표시하며 Rust 판정과 구분한다. query의
`conflictingEvidence`는 기존 구조화된 check/`UnknownReason::ConflictingSources`에서만 나온다.
그 근거가 없으면 note를 보여 줄 뿐 자동 conflict row나 pass/fail을 생성하지 않는다.
typed 관측값 저장·자동 충돌 분석은 별도의 schema/rule 채택 대상이며 SP-008–011 범위 밖이다.
사용자 재측정/수정까지 기존 사실을 조용히 승격하지 않는다.

확인 checkbox를 누르는 것만으로 provenance를 Confirmed로 바꾸는 우회는 없다. 현행 raw
계약에서 지원되는 origin/evidence를 사용하며 정상화 결과는 현행 규칙대로 Unverified다.
추후 Confirmed 입력이 필요하면 별도 explicit-confirmation 계약과 권한·증거를 독립 채택한다.
이 후보에서 새 안전 인증·출처 검증 서비스·사진 업로드를 추가하지 않는다.

## 4. 지원 v1에서 입력할 사실의 경계

| 대상 | 후속 입력 패널 | 보존해야 할 경계 |
|---|---|---|
| 구획/입구 | 내부 dimensions와 bounds, front opening dimensions·left/bottom offsets | FrontYZero만 지원; 외부 cabinet 두께/대칭 offset 추정 없음 |
| staging | free cuboid 각 min/extent·bounds, base support 존재/조건과 실제 load limit | 현행 앞쪽 y≤0/끝 y=0 및 z=0 모델 검증; 떠 있는 staging·다른 높이 전달은 미지원 |
| 구획 지지 | footprint x/y/width/depth·bounds, elevation·bounds, load limit/source | 전체 물건이 놓이는 실제 지지와 하중을 분리; 공간 바닥 크기·capacity를 자동 복사하지 않음 |
| 여유/동작 | 각 wall/between-unit clearance, item의 left/right/top/pull-extra/lift allowance | static와 motion 분리; 해당 없음을 UI가 선택해 검사 회피하지 않음 |
| 물건 | 기존 instance/type의 dimensions·bounds, quantity/mass의 unknown/known와 evidence | 검증된 ID에서 panel 생성; item-a/item-b 하드코딩 안 함; 새 inventory CRUD는 이 범위 아님 |
| 보유 수납함/상품 사실 | 현재 immutable variant/owned binding의 값·출처를 읽고 기존 catalog editor로 이동 | read-only SKU를 project-local 치수로 덮어쓰지 않음; 수정 catalog는 새 digest와 명시적 binding 필요 |

필드는 실제 Rust DTO/생성 schema에 있는 지원 범위만 노출한다. 임의 JSON field editor,
새 방 형상·열고 닫는 궤적·lid removal·unsupported stacking 입력은 만들지 않는다.
공간/물건이 아닌 catalogue 사실은 원본 variant와 정확한 출처로 이동하고, 가져온 catalogue를
조용히 변경하지 않는다. 기본 샘플의 5mm clearance·50000g capacity 등은 실제 관측값이 아니다.

현행 `emptyProjectForm()`은 샘플을 복사한 뒤 일부 값을 비우지만,
`space.staging.baseSupport`의 known 지지·50000g 하중과 각 item의
`requirement.handling` left/right/top=5mm, pullExtraDepth/liftAboveRim=0을 남긴다.
SP-009는 새 일반 프로젝트 생성 경로에서 baseSupport 전체를 unknown으로 만들고,
각 item의 다섯 handling fact도 unknown으로 초기화한다. 실제 입력·근거 없이 지지 존재,
하중이나 여유 0을 known으로 채우지 않는다. 사용자가 명시적으로 선택한 샘플 체험과 기존
저장 프로젝트의 값은 보존하며, 정상화 전에 새 값으로 덮어쓰는 기존 데이터 migration은 없다.

## 5. 다음 확인 목록의 Rust read model

SP-008에서 additive ephemeral DTO/Worker API를 확정하고 SP-010에서 실제 query를 구현한다.
별도 persisted plan schema나 solver 목적함수는 만들지 않는다. 입력은 정상화된 ProjectInput과
그 digest, optional displayed PlanSnapshot이다. snapshot의 input/catalog/rule binding이 맞지
않으면 current 안내를 만들지 않고 `historical/stale`과 재계산 행동을 반환한다.
snapshot이 없으면 supported input completeness만 표시하고 미실행 물리 검사 결과를 생성하지 않는다.

제안 read model의 모든 타입은 Rust→생성 TS/schema를 사용한다. 대표 필드와 의미:

| 필드 | 의미 |
|---|---|
| sourceStamp | inputDigest, matching optional planSnapshotId/catalogDigest, rule/API version |
| factKey | 기존 typed entity ID+field reference grammar로 만드는 canonical bounded ID |
| targetRefs / fieldRefs | 실제 입력/근거를 가리키는 구조화 reference; 문자열 코드 평가 없음 |
| needKind | missingNominal / missingBound / missingEvidence / conflictingEvidence / unsupportedInput / repairKnownFailure |
| checkIds / reasonCodes | 같은 snapshot의 관련 check 집합; 메시지 파싱으로 생성하지 않음 |
| priorityClass | 아래 명시한 현재 검사/사실 클래스; 적합 확률이나 예상 편익 점수 아님 |
| resolutionActions | editSupportedField / inspectCatalogSource / recalculate / requestSupportedScope / remeasure |

순서는 Rust가 `(priorityClass, relatedCheckCount descending, canonical factKey)`로 안정 정렬한다.
`relatedCheckCount`는 중복 제거된 **현재 관련 검사 개수**이며 해결 확률/전체 계획 개선 점수가 아니다.
같은 fact를 요구하는 행은 하나로 합치고 원래 모든 check IDs·reason/evidence references를 보존한다.

1. known 필수 물리 fail·conflicting facts: 별도 `수정/재측정 필요` 그룹. 더 많이 측정하면
   알려진 초과가 통과할 것처럼 안내하지 않는다. fail reference가 없으면 검사를 텍스트로 보존한다.
2. required physical unknown의 nominal/bounds/frame/staging/support/handling facts.
3. quantity/assignment completeness의 missing facts.
4. procurement price/inventory/shipping 등 non-geometric unknown: 실제 current catalogue/source로 이동.
5. soft preference 설명과 미지원 입력: 후순위 또는 별도 범위 안내; unsupported를 실제 측정으로 해결 가능하다고 말하지 않음.

필수/soft 분류는 기존 Rust rule/check kind에서만 나온다. mapping이 존재하지 않으면
SP-008 ADR에 명시적으로 결정하고 관련 architecture gate에서 확정한다. 판단 없는 UI 정렬이
물리 의미를 만들어내지 않는다. 한 row의 입력으로 다른 unknown이 자동 pass가 된다고 예측하지 않는다.
삭제된 evidence를 보완된 것으로 취급하지 않으며 unknown/fail/pass 원본을 유지한다.

query는 정적 read: 검색·가격 갱신·PlanSnapshot/BOM/action 재작성·activation/budget 진행 없음.
기존 외부 입력/message bounds가 먼저 적용되고 최대 512 unique fact rows/2048 check references,
serialized 5MiB를 넘으면 `completion_limit_exceeded`로 전체 실패하며 목록을 조용히 자르지 않는다.
경계 검증 전 JSON을 거대한 배열로 확장하지 않는다. indexed refs를 사용하고 catalog Cartesian 탐색은 없다.
query당 O(F+C+R) indexing 이후 bounded sort를 측정한다. 목표 warm Rust query p95≤20ms,
Worker/decode/render는 SP-006 방식으로 분리 측정하며 실제 성적과 목표를 구분한다.

## 6. 저장·stale·동시성·Worker 계약

- 원문/상세 값 수정은 즉시 editor epoch를 올리고 안내/현재 계획을 stale로 만든다. focus·접기·목록
  이동은 epoch/revision/DB를 변경하지 않는다. per-keystroke query/DB/LLM 호출은 0이다.
- commit은 전체 matching normalized input/evidence를 현행 transaction/CAS로 저장한다. field별
  독립 저장으로 값은 새것·오차는 옛것인 canonical 입력을 만들지 않는다. projectRevision은 뒤로 가지 않는다.
  invalid raw draft의 기존 저장·재로드 지원은 보존하되, 유효한 matching 정규화가 없으면 이전
  committed input/evidence를 덮어쓰지 않는다. raw draft 보관 성공은 새 normalized input 커밋 성공이 아니다.
- save 실패 시 raw/normalized working 데이터를 유지하고 retry/export를 제공한다. saved/current/accepted
  상태를 거짓 표시하지 않는다. 타 탭 conflict는 latest/copy 경로이며 덮어쓰기·자동 재계산으로 숨기지 않는다.
- read query lease는 projectId/inputDigest/optional snapshot ID/raw editor generation/worker instance/
  component generation을 포함한다. await 동안 input·snapshot·catalog·worker가 바뀌면 reply를 버린다.
- source별 coalesced request 하나와 bounded ephemeral cache만 사용한다. hover/focus/pan/selection에서
  request 0. Worker trap 후 persisted bytes는 보존하고 explicit recovery 뒤 matching source로 다시 조회한다.
- 새 API capability/BUILD_ID는 Rust/client/entry/harness/fixtures에서 원자적으로 갱신한다. 기존 capability
  exact handshake를 약화하지 않는다. old page/new Worker와 반대 조합은 명시적 recovery다.
- supported schema/rule/BOM/action/PlanSnapshot 의미는 유지한다. 기존 expected outputs는 unchanged이며
  engineContext BUILD_ID만 실제 새 버전으로 재고정한다. 데이터 구조 추가가 migration을 요구하면
  관련 작업만 DECISION_REQUIRED로 멈추고 별도 채택 전 existing record를 바꾸지 않는다.

## 7. 실구현 수용 사례와 근거

아래는 **후속 구현 acceptance**다. 이 문서 작성 중 앱/테스트/물리 실측을 실행하지 않았다.

| Fixture / 실제 flow | 필수 관찰 |
|---|---|
| MC-01 fresh→기본 치수→상세 bounds | JSON 편집 없이 bounds/evidence 입력; unknown 오차가 0으로 변하지 않음; 새 일반 프로젝트의 baseSupport와 모든 item handling fact가 unknown이며 샘플의 50000g·5mm·0을 상속하지 않음; 실제 Worker 정규화→저장→재로드 후에도 유지; 명시적 샘플·기존 저장 프로젝트는 보존 |
| MC-02 nominal 600mm, minus2/plus3; occupied 590mm, minus1/plus4 | native/actual Worker가 동일 interval을 반환; 최소 available/최대 occupied를 현행 validator가 평가 |
| MC-03 60.01cm / 한 bound 빈 값 / nominal-minus≤0 / overflow | 원문 유지·명명된 오류·저장 차단; JS 반올림 없음 |
| MC-04 음수 staging minY / offset0 / offset unknown | 동일 signed grammar/범위; 위치0과 unknown 분리; 지원되지 않는 staging 조건 명시 |
| MC-05 받침 footprint known, 하중 unknown | 기하 근거와 load unknown을 분리; 위치/치수만으로 load pass 없음 |
| MC-06 handling/lift requirement 미상 | 동작 mode와 실제 관련 checks 연결; 지원 안 되는 확인 절차를 완료 checkbox로 대체하지 않음 |
| MC-07 한 fact가 여러 checks에서 요구됨 | 목록은 1행, exact check IDs 전부; 삭제한 evidence로 상태가 개선되지 않음 |
| MC-08 repeated/conflicting observations | bounded Evidence.note의 사람 관측 원문/단위/방법·기존 출처/참조가 저장·재로드·export/import에 보존; note의 충돌 주장과 Rust의 구조화된 conflict 분류를 분리; note를 파싱해 conflict/pass/fail/평균/최댓값/신뢰구간/Confirmed를 생성하지 않음; 기존 structured conflict가 있으면 exact check/reason 근거만 연결 |
| MC-09 imported arbitrary item IDs / read-only catalogue fact | 하드코딩 없이 정확한 field; variant binding/출처 보존; SKU 치수 조용한 overwrite 없음 |
| MC-10 query await 중 입력/accepted/catalog/worker 교체 | 이전 목록이 새 계획 아래에 나타나지 않음; stale/late reply 무시 |
| MC-11 two tabs / quota/save failure / reload/export-import | CAS 거절·working 보존; evidence/digest/revision round-trip; old progress 자동 승계 없음 |
| MC-12 no-purchase / no snapshot / historical snapshot / input cap | 구매 unknown 불필요 처리 현행 규칙 유지; 미실행 checks를 생성하지 않음; 제한을 성공 truncation으로 위장하지 않음 |

native fixture_runner와 실제 browser Worker/WASM 출력은 runtime IDs 등 기존 non-authoritative
metadata만 정규화하고 exact compare한다. engine-generated 기대값만 자기 승인하지 않는다.
숫자 예시는 hand-checked synthetic oracle이며 실제 기기의 정확도·안전 certification이 아니다.
기존 Rust/native/WASM/parity/브라우저/portable/edit/progress/디자인 토큰 회귀를 같은 delivery HEAD에서 실행한다.
Chromium/Firefox/WebKit·keyboard-only·390/1440·200%·IME·forced-colors·reduced-motion·오프라인
저장/재개를 별도로 기록한다. actual phone은 없으면 UNVERIFIED이며 에뮬레이션으로 대체하지 않는다.

## 8. 후보 작업 그래프와 감사

기존 SP-001–007의 spec 본문과 DAG/감사 등급/사용자 capture 승인 경계를 보존한다.
후속 후보의 005 spec 끝에는 아래 문서 소유 보완을, 007 spec 끝에는 canonical capture 경로
보완만 추가한다. 두 보완은 기능·감사 등급·권한 확장이 아니며 앞선 Files 문구와 충돌하면
후속 보완을 따른다. 기존 감사 대상 #35 HEAD는 변경하지 않는다.
후속 노드는 모두 이전 007 이후 이어지는 단일 writer 개발이며 자동 runtime adoption은 없다.

- SP-005는 `docs/FRONTEND.md`의 physical-workspace foundation 표에 D007 범위의 읽기 전용
  Three adapter와 유지되는 SVG/2D fallback을 함께 기록한다. 이는 [현재 #35 Fable F3 노트](https://github.com/BeautifulMind-JT/ZARI/pull/35#issuecomment-5910266542)의
  ownership 누락을 보완한다. 해당 GitHub 기록의 exact HEAD `e98f0f5a00a3657bddf42907dba71cc4f7bcda7a`
  판정은 PASS_WITH_NOTES이며, 이 후속 후보의 보호된 host receipt나 감사 판정이 아니다.
- SP-007과 SP-011의 새 capture artifact canonical 경로는 현행 baseline의
  `design/baselines/draft/`다. 앞선 `drafts/` 표기는 이 후보에서 해당 경로로 정정한다.
- D007의 실제 User option-A 결정 및 채택 포인터는 등록 전에 별도로 확인·기록한다.
  위 감사 comment를 User의 답변이나 이 후보의 승인으로 바꾸어 해석하지 않는다.

| Node | Outcome | Depends | 독립 gate |
|---|---|---|---|
| 008 | measurement-completion ADR, typed field routing/normalization·API schema/capability와 fixture 계약 | 007 | A3 / ARCHITECTURE |
| 009 | bounds/evidence와 v1 staging/support/handling 상세 입력→Rust→CAS→reload 통합 | 008 | A2 / MILESTONE |
| 010 | Rust의 다음 확인 query·안정 우선순위·field navigation·lease 연결 | 009 | A2 / MILESTONE |
| 011 | full parity/실브라우저/성능·failure 근거와 변경 UI의 새 draft capture 인계 | 010 | A2 / MILESTONE |

008에서 v1 scope/raw evidence/path mapping/persistent compatibility가 모호하면 영향을 받는
후속 구현만 hold하고 근거와 최소 선택을 제출한다. 정상 구현 선택은 builder가 현재 승인 범위에서 한다.
새 domain rule/schema migration/paid/provider/공개·release 권한이 필요하면 임의 확장하지 않는다.
모든 node delivery는 current-head CI·비작성자 host-pinned review·보호된 Fable gate·computed merge를 요구한다.
문서 PR 자체는 program task가 아니며 작성자 self-check는 독립 gate가 아니다.

## 9. 완료·기기 자격·화면 채택·출시 상태

상태 축을 한 개 완료 boolean으로 압축하지 않는다. 중앙 공통 완료 계약과 맞춘다.
아래는 후속 보고·집계를 위한 정규화 projection이며 현재 중앙 core enum이 이미 제공하는 값이라는
주장이 아니다. 실제 core 상태와 보호된 merge/qualification/사용자 결정 근거를 매핑해 표시해야 한다.

| 축 | 값과 의미 |
|---|---|
| node_state | 후속 정규화 projection `NOT_STARTED / WAITING / IN_PROGRESS / DONE`; `DONE`은 host-pinned 독립 gate를 만족한 exact task delivery가 중앙 merge로 main에 들어간 때만; draft 문서 존재/로컬 green은 DONE 아님 |
| qualification_state | `NOT_REQUIRED / UNQUALIFIED / PARTIAL / QUALIFIED`; actual browser/기기/host 등 명시 범위별 실제 증거. 전화 미측정이면 해당 항목은 UNQUALIFIED이며 전체가 QUALIFIED로 바뀌지 않음 |
| acceptance_state | `NOT_REQUIRED / PENDING / ACCEPTED / REJECTED`; 사용자 exact capture/기능 채택 결정과 연결. 코드·Fable PASS가 acceptance를 자동 생성하지 않음 |
| release_state | `NOT_AUTHORIZED / NOT_RELEASED / RELEASED`; 배포 권한·실제 배포 근거를 구분. 이 프로그램의 기본은 NOT_AUTHORIZED |

SP-007 화면 승인이 있더라도 SP-009–010의 새 입력/안내 화면을 승인한 것으로 사용하지 않는다.
SP-011은 exact implementation HEAD·fixture·route·viewport/browser/fonts/motion/GPU·image hashes와
오류/unknown/stale/conflict 상태를 포함하는 **새 draft capture set**을 만든다. 기존 approved count/manifest는
변경하지 않는다. 사용자 승인 이후의 baseline 등록은 별도의 exact-set decision/후속 task다.
final 보고는 개발 병합, qualification 미측정, acceptance 대기, release 미승인을 각각 표시한다.
자동화는 이 reviewable 인계물을 완성할 수 있으며 실측을 발명하거나 User의 baseline 결정을 대신하지 않는다.

## 10. 이 문서 작업의 미수행 사항

작성한 것은 문서와 실행 계획 후보다. 앱 코드·schema 생성·dependency/lock·CI/runtime/client pin,
activation·credential·host·모델 호출·추가 사용/과금 설정·기존 감사 HEAD·baseline·공개/배포를
변경하지 않았다. 실제 기능 테스트·native/WASM/browser parity·성능·독립 Fable 감사·User 채택은 미수행이다.
기존 원문 MASTER_PROMPT_KO/RUST_ADDENDUM_KO/SOURCE_MANIFEST는 보존한다.

중앙 bootstrap의 현 채택 검토 후보는 #44/#45를 통합·보완한 [#46](https://github.com/BeautifulMind-JT/ai-ops-control-plane/pull/46)이다. 기존 #44 감사의 DECISION_REQUIRED를 통과한 것으로 간주하지 않는다. PA-1 권한 예외는 PENDING이며, 보호된 reconcile과 실제 host qualification 전에는 전체 실행 NOT_READY다. 기존 중앙 포인터는 이전 체크포인트 기록이고 최종 승인 registration에는 실제 채택·qualification commit을 pin해야 한다.
