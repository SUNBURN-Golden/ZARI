# SP-z-product-qualification — 정리 제품 확장 전체 여정 qualification

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-product-qualification만 다룬다. 같은 발화의 이후 z-노드(z-local-delivery)는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-product-qualification](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 실제 상품·판매처 연결, 출시, 실기기 검증이 아니다.

## 문제

001–016과 z-노드들이 각각의 독립 테스트를 통과해도, 측정→실상품 검토→대안→구매 준비→실행→위치 검색→재정리가 하나의 같은 스냅샷 위에서 끝까지 동작한다는 근거는 없다. 개별 통과를 모아 "전체 여정 완료"라고 적으면 분모가 거짓이 된다. mock·합성 자료·실상품·실기기 증거가 섞이면 무엇이 검증됐는지 읽을 수 없다. 완료되지 않은 항목(z-local-delivery, 전화·전용 GPU, 실제 판매처)을 분모에서 빼면 남은 것만 100%로 보인다.

## 결정

Rust·프로토콜·스키마·DB version·`BUILD_ID`·fixture·생성 계약·앱 코드는 바꾸지 않는다 (`contract_change=NO`). 이 노드는 검증·증거·인계 산출물만 만든다.

- 하나의 실제 브라우저 여정(`apps/web/tests/browser/product-journey.spec.ts`)이 실제 Worker와 IndexedDB 위에서 측정→카탈로그 실상품 검토→대안 비교→구매 준비→채택·실행→계획 패키지→위치 기록→피드백 재정리를 한 번에 지나간다. 전 과정 같은 accepted snapshot과 같은 `data-revision`을 단정한다. 부족 측정·품절·오류 import·미배정은 같은 파일의 별도 시나리오다. 무구매·취소·다중 탭은 기존 스펙의 충분한 coverage를 재사용하고 여정 안의 연결 부분만 새로 단정한다.
- 시나리오마다 네 겹의 증거를 고정한다: native(fixture runner 결과), 실제 WASM(브라우저 Worker 응답), 저장(IndexedDB 행·바인딩), 화면(글자·상태 단정). 결과는 `docs/qualification/Z-JOURNEY-QUALIFICATION.md`의 시나리오별 표와 실제 기기 자격 표로 낸다. 합성·실상품·실기기 증거는 열을 나누고 없는 증거는 UNQUALIFIED로 남긴다.
- z-노드 분모는 `docs/qualification/z-denominator.json`의 별도 투영이다. 프로그램 20노드 + 소유자 지시 추가 1노드(z-catalog-crawler)를 전부 적고, 이 노드는 `IN_PROGRESS`, z-local-delivery는 `NOT_STARTED`다. 머지된 노드도 `DONE`이 아니며 검토·감사 포인터가 없으면 null이다. 전화·전용 GPU·실제 사이트 수집·캡처 수용·출시는 requiredGaps에 그대로 남는다. `scripts/check-z-denominator.mjs`와 단위 시험이 분모·포인터·증거 파일·패키지 해시를 검사한다.
- 사용자 검수용 계획 패키지는 `docs/qualification/review-package/`다. 여정이 채택한 같은 PlanSnapshot의 실제 출력 패널이 만든 패키지 HTML·CSV와 파일 해시·재현 명령·포함 범위·근거 등급을 담은 `manifest.json`, 무엇을 어떻게 검수하는지 적은 `index.md`로 구성한다. 합성 카탈로그로 만든 것은 합성이라고 쓴다. 승인 baseline이나 화면 승인이 아니다.

## 하지 않는 것

다음 z-노드(z-local-delivery), 새 도메인 계약·명령·capability, Rust·생성 계약·fixture 변경, 승인 baseline 교체, mock으로 통과 꾸미기, 분모 축소, 전화·전용 GPU·실제 판매처·실제 사이트 수집·결제·출시의 완료 주장, `.aiops/**`·`docs/aiops/**`·`.github/**`·보존 프롬프트·`SOURCE_MANIFEST.json` 변경.
