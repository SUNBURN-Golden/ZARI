# SP-z-performance-budget — 실측 성능 예산과 WASM 병목 개선

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-performance-budget만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-performance-budget](../../design/DECISIONS.md)이다. 이 채택은 실제 모바일 기기 성능 주장, 배포, 계정, 클라우드, 출시가 아니다.

## 문제

초안 성능 목표 몇 개가 측정에서 초과로 기록되어 있었다(normalization, messagingResidual, 직렬화). 그 값이 어느 단계의 비용인지 분리되지 않으면 고칠 곳을 알 수 없다. 반대로 속도만 보고 고치면 결정성이나 검증 권위가 깨질 수 있다. 벽시계로 멈춘 계산과 결정론적 작업 예산이 다 쓰여 멈춘 계산을 같은 말로 부르면 "끝까지 찾았다"는 거짓 주장이 된다.

## 결정

새 도메인 계약, 명령, capability, DTO, 저장소는 없다. 같은 입력은 같은 canonical 바이트를 낸다. 바뀐 것은 비용이다.

1. **측정 분리.** 네이티브는 `perf_profile` 예제(명령별 p50/p95/max, 요청 경계의 JSON 파싱·재직렬화·타입 변환, 카탈로그 변환·검증·digest, 응답 SHA-256). 브라우저 bench는 `zari-bench-3`의 단계를 유지하고, 기기 간 잔여 비용을 Worker 시계 도장으로 `toWorkerMs`/`workerQueueMs`/`fromWorkerMs`로 나눈다(같은 OS 시계의 추정). 새 임계값은 없고 기존 목표를 낮추거나 올리지 않는다.
2. **Rust 불필요 재계산 제거.** (a) `activateProject`가 같은 카탈로그의 digest를 두 번 계산하던 것을 한 번으로 줄인다(`canonical::context_id_for_catalog_digest`; `context_id`는 이를 감싼다). (b) 카탈로그·입력 검증이 같은 값을 세 번 직렬화하고 노드마다 경로 문자열을 새로 만들던 것을 한 번 직렬화와 재사용 버퍼로 바꾼다. 진단 경로와 순서는 같다. (c) canonical 문자열 NFC 정규화에서 ASCII 문자열과 키는 이미 NFC이므로 다시 만들지 않는다. 비ASCII는 기존 NFC를 그대로 쓴다.
3. **페이지 불필요 복사 제거.** `ProbeClient.activate`는 이 Worker 세션 엔진이 이미 검증해 가진 카탈로그(엔진의 2칸 캐시를 거울로 추적)를 다시 보내지 않고 `catalog: null`로 재활성화한다. 엔진이 `catalog_unavailable`이면 전체 스냅샷으로 한 번만 다시 보낸다. 다른 실패는 그대로 올라간다. 엔진은 pin의 digest와 일치하는 검증된 내용만 쓰고 없는 digest를 기본값으로 채우지 않는다. 와이어 계약은 이미 `catalog: null`을 정의한다.
4. **Worker 조기 시작.** 프로젝트 Worker를 첫 페인트 뒤 idle에 시작해 WASM 전송·컴파일·첫 요청 준비를 프로젝트를 열기 전에 치른다. 데이터는 보내지 않는다. 실패는 다음 실제 `ensure()`가 다시 시도하고 드러낸다. probe/catalog 경로는 자기 Worker를 써서 시작하지 않는다.
5. **벽시계 대 결정론적 예산.** 종료 이유는 이미 구별된다. `budgetExhausted`는 결정론적 작업 단위 한도다. `interrupted`/`worker_timeout`/`search_stalled`는 호스트 시간이며 소진 주장이 아니다. 이 노드는 그 구별이 보폭과 호스트 속도에 의존하지 않음을 시험으로 고정한다.

## 하지 않는 것

목표 임계값 변경, 실제 모바일·GPU 측정 주장, `BUILD_ID`·`ruleVersion`·fixture 기대 바이트 변경, 새 직렬화 형식, 탐색 알고리즘이나 예산 변경, 서비스 워커 정책 변경, 텔레메트리. 한 번 보고된 초과는 숨기지 않는다.
