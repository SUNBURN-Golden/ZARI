# SP-014 — 취소 가능한 독립 평가·원자적 snapshot publication

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 SP-014만 다룬다. 같은 발화의 SP-015·016은 각 노드에서 구현한다. Fable ARCHITECTURE와 비작성자 A3는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D014](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 사실 확인, 안전 인증, 계정, 결제, 공개가 아니다.

계약 변경은 있다 (`contract_change=YES`). 자동 머지 대상이 아니다. persisted `schemaVersion` 1, canonical version 1, `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, `ActionStep` 필드 모양은 유지한다. DB 마이그레이션은 없다. 새 `Command`와 capability는 없다.

## 등록한 식별자

| 이름 | 값 |
|---|---|
| profile `default` version 1 | 기존 lump. `solverVersion` `zari-solver-v1` |
| profile `default` version 2 | 아래 양자. `solverVersion` `zari-solver-v2` |
| 그 외 profile | version 1과 같은 lump. `zari-solver-v1` |
| `BUILD_ID` | `zari-domain-7` (변경 없음) |

새 프로젝트 양식의 profile은 `default` version 2다. `maxWorkUnits`는 올리지 않는다. version 1 입력의 스냅샷 바이트와 검색 카운터는 그대로다.

## 양자

비용은 밀리초가 아니다. 순서는 구조 참조 1, 검사 기저 또는 쌍 비교 1, 수량 행 1, BOM 줄 4, 행동 단계 또는 선행 간선 1, 정규 바이트 4096개(최소 1) 1, 재검증의 검사 id 또는 행동 id 1이다. lump `64+p²+4a`는 이 profile의 양자가 아니다.

한 양자의 비용보다 작은 allowance는 그 양자 하나를 실행한다. 초과분은 그 양자 하나다. 전역 작업·노드 예산은 실행 전에 적용한다. 비용 0인 양자는 없다. 빈 구간은 다음 구간으로 넘어가고 빈 전진을 반복하지 않는다.

첫 canonical 양자는 스냅샷 전체를 직렬화한 뒤 첫 4096바이트를 해시한다. 그 직렬화는 기존의 바이트 한도 안에 있는 한 덩어리다. 그 호출 한가운데를 즉시 취소한다고 말하지 않는다. 이후 양자는 4096바이트씩이다.

## 발행

계속은 입력·카탈로그·제안·버전에 묶인 불투명 핸들이다. 솔버는 진행 중인 검사·BOM·행동·해시를 가지치기에 쓰지 않는다. 다른 소스의 digest는 그 핸들을 재사용하지 않고 아무것도 발행하지 않는다.

스냅샷은 재검증이 끝난 뒤에만 대안이 된다. 검사 전 스냅샷, 절반의 BOM, 절반의 행동, 절반의 해시는 없다. 구조 실패와 blocking 검사는 보고서를 남길 수 있으나 스냅샷은 없다.

`budgetExhausted`는 한도를 넘길 양자를 시작하지 않은 것이다. `cancelled`는 양자 사이에서 협조적 취소를 본 것이다. `interrupted`는 하드 종료, 감시 시간, 트랩, 또는 검색 중 소스가 바뀐 것이다. 셋은 서로 다르고, 어느 것도 `scopeComplete`가 아니다. 진행 중 후보는 버리고, 이미 끝난 대안과 저장된 입력은 남긴다. 늦은 응답은 적용하지 않는다.

## 오라클

PC-05–07과 `evaluation-accounting.json`은 손 기록이다. 이 노드가 그 파일을 다시 쓰지 않는다. `futureProfileRegistered`가 거짓인 것은 그 파일의 역사 문장이다. 생산 프로필 version 2는 이 ADR이 등록한다.

## 보류

SP-015의 저장 수명, 스키마 마이그레이션, 새 최적화기, 전화·전용 GPU 자격, 결제, 출시는 이 노드가 열지 않는다.
