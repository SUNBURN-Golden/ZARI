# SP-016 — 전체 16단계 qualification·새 draft capture·완료 인계

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 SP-016만 다룬다. Fable MILESTONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [D016](../../design/DECISIONS.md)이다. 캡처 등록은 화면 승인이 아니고, 이 프로그램은 출시를 허가하지 않는다.

계약 변경은 없다 (`contract_change=NO`). `BUILD_ID` `zari-domain-7`, `ruleVersion` `zari-domain-v2`, schema 1, canonical 1, DB version 2, Command, capability는 유지한다.

## 문제

SP-013의 가이드 조건, SP-014의 평가 중단, SP-015의 저장·복구 화면은 SP-007과 SP-011 캡처에 없다. 그 이미지를 007·011의 승인으로 빌리면, 막힌 물리 unknown·무구매·재사용·혼합 구매·역사 규칙·저장 CAS·중단 복구가 검사되지 않은 채로 남는다. 개발 머지를 물리 사실·기기·출시·사용자 수용으로 적으면 분모가 거짓이 된다.

## 결정

같은 제품 트리에서 PC-01–12와 기존 MC·공간·portable·편집·진행·parity를 다시 실행한다. 계약이 바뀌면 그 수정은 해당 소유 노드로 되돌리고, 여기서 스키마나 규칙을 다시 설계하지 않는다.

새 draft는 `design/baselines/draft/zari016/`이다. 실제 Worker가 그린 가이드 차단, 무구매, 보유 재사용, 혼합 구매, stale, 역사 규칙, 저장 CAS, 중단 복구를 1440과 390에서 남긴다. 키보드, IME, forced-colors, 200% zoom도 남긴다. 캡처 환경은 `prefers-reduced-motion: reduce`다. 인덱스에는 구현 HEAD, 시나리오, fixture, 브라우저, viewport, 글꼴, 모션, GPU, 이미지 해시를 적는다. 승인 수와 SP-007·011 이미지는 바꾸지 않는다.

분모는 `docs/qualification/denominator.json`이다. 16 = 공간 7 + 측정 4 + 이번 5다. `node_state`, `qualification_state`, `acceptance_state`, `release_state`는 그 문서의 별도 투영이다. 앱이나 Rust의 중앙 상태 API가 아니다. 머지된 개발 노드는 `MERGED`일 수 있으나 `DONE`이 아니다. 리뷰 객체와 감사 영수증이 저장소에 없으면 그 포인터는 null이고, null을 `DONE`으로 올리지 않는다. 전화와 전용 GPU는 `UNQUALIFIED`다. 새 캡처의 수용은 `PENDING`이다. 출시는 `NOT_AUTHORIZED`다.

## 결과

Rust 생산 코드, 생성 계약, 기존 fixture 기대값은 이 결정으로 바꾸지 않는다. 사용자가 나중에 exact-set으로 이 draft를 승인하기 전까지 승인 수는 0이다.
