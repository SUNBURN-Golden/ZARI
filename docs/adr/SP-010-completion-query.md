# SP-010 — 다음 확인 사실 query

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 약 07:28 KST. 원문: "009·010·011 전부 채택한다. Fable 게이트는 각각 독립 리뷰 2회로 대체하고, 머지도 네가 해라."

이 기록은 SP-010만 다룬다. 같은 발화의 SP-011은 이 노드에서 구현하지 않는다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D010](../../design/DECISIONS.md)이다.

## 문제

정규화된 사실과 검사가 있어도 화면은 다음에 손을 댈 사실을 고르지 못한다. 목록을 JavaScript가 만들면 우선순위, 중복, stale, 한도가 계산 권한과 갈라진다.

## 결정

### 읽기 모델

`queryNextFacts`는 순수 함수다. 현재 입력의 typed field ref, 현재 스냅샷의 check ref, SP-008이 고정한 rule classification만 읽는다. 검색, 재가격, 재확정, activation, 카운터, DB, revision을 바꾸지 않는다.

사실 키는 `{entityId}:{fieldPath}`다. 한 사실을 가리키는 검사는 한 행으로 모으고, 관련 check id는 모두 남긴다. 필드가 없는 검사는 `{entityId}:unreferenced:{checkId}` 텍스트 행이다. 통과와 NotApplicable는 행이 아니다.

순서는 `priorityClass` 오름차순, 관련 현재 검사 수 내림차순, 사실 키 오름차순이다. 입력 순서를 섞어도 같다.

SP-008 `classify_check`의 우선순위 표는 바꾸지 않는다. 쿼리가 사실 상태를 읽어 need를 채운다.

- `conflicting_sources`인 구조화된 현재 검사, 또는 `UnknownReason::ConflictingSources`와 그 참조만 `conflictingEvidence`다. `Evidence.note`에서 충돌이나 숫자를 만들지 않는다. 메모는 주장이다.
- 물리·수량·예산의 blocking Fail은 수정(`repairKnownFailure`)이다. non-blocking Fail은 soft다. `unsupported_`로 시작하는 reason은 `unsupportedInput`이다.
- 물리 Unknown은 필수 치수다. 명목 없음, 경계 없음, 근거 없음은 사실 검사로 구분한다. 수량·호환 Unknown은 수량 완성이다. 재고·가격·배송의 비통과와 예산 Unknown은 조달이다.
- 완전한 사실 위의 soft 검사는 행으로 남는다. need는 고정 enum의 `repairKnownFailure`이고, 우선순위는 soft이며, 동작은 `requestSupportedScope`다. 측정 칸을 열면 그 선호가 풀리는 것처럼 보인다.
- 같은 사실이 비어 있으면서 non-blocking Fail이면 더 급한 미측정 우선순위를 유지하고 check id는 남긴다. `unsupportedInput`은 그 사실이 비어 있어도 우선순위 4다.

스냅샷이 없으면 이 입력이 지원하는 경로의 입력 완성만 낸다. 검사를 만들지 않는다. 카탈로그 전체를 펼치지 않는다. 입력 digest, 카탈로그 digest·version, rule version, canonical version, 또는 스냅샷에 박힌 입력 digest가 어긋나면 `stale`과 빈 행이다. 현재 검사를 빌리지 않는다. 주장한 digest가 입력의 canonical digest와 다르면 stale 목록이 아니라 `digest_mismatch`다.

### 한도

고유 사실 512행, check ref 2048개, 응답 5 MiB. 하나를 넘으면 목록 전체를 거절한다. 코드는 `completion_limit_exceeded`다. 짧은 목록으로 성공시키지 않는다.

### 동작

라우트되는 가변 필드의 미측정은 `editSupportedField`다. 수정·충돌은 `remeasure`다. 카탈로그·보유처럼 가변이지 않으면 `inspectCatalogSource`다. 경로가 없거나 라우트되지 않거나 soft·미지원이면 `requestSupportedScope`다. stale은 `recalculate`만 낸다.

### 원자적 활성화

핸들러, DTO, `DomainOperation`, 생성 schema·TS, Worker 진입, 클라이언트, 네이티브·브라우저 fixture를 한 트리에서 연다. 그 다음에 `BUILD_ID`를 `zari-domain-5`에서 `zari-domain-6`으로 올리고, capability 목록의 `disposeProject` 바로 앞에 `queryNextFacts`를 넣는다. 없는 연산은 `operation_not_supported`다. 성공이나 no-op으로 받지 않는다. 페이지와 Worker의 build id·capability가 다르면 기존 핸드셰이크가 거절한다.

### 화면 임대

목록 임대는 프로젝트, 입력 digest, 스냅샷 id, 카탈로그 digest, raw generation, Worker 객체, 마운트다. 소스마다 요청은 하나다. 초점, 키 입력, 캐시 적중은 요청하지 않는다. 초고가 바뀌거나 커밋 digest가 바뀌면 행을 비우고 stale로 둔다. 다시 확인은 명시 동작이다. 늦게 도착한 응답은 임대와 응답 stamp가 같을 때만 그린다. 모르는 경로와 미지원 입력은 측정 칸으로 열지 않는다.

## 결과

`protocolVersion`과 persisted `schemaVersion`은 1이다. 기존 fixture 기대 출력은 `engineContext.buildId` 재고정 외에는 바이트가 같다. MC-07·09·10·12 fixture가 네이티브와 실제 WASM 응답을 고정한다.
