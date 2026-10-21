# SP-z-local-delivery — 설치·업데이트·사용 안내와 로컬 제품 인계

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-local-delivery만 다룬다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-local-delivery](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 실제 상품·판매처 연결, 출시, 실기기 검증이 아니다.

## 문제

완성한 로컬 제품을 넘기려면 설치·업데이트·저장 migration 경로가 문서가 아니라 실제 동작으로 확인돼야 한다. 지금까지 각 migration은 노드별로 검증됐지만 "처음 설치", "오래된 데이터베이스의 제자리 업그레이드", "실패한 업데이트가 데이터를 지우지 않는다"는 인계 단위로 묶인 적이 없다. PERSISTENCE §6는 다른 탭의 업그레이드 요청에 이 탭이 연결을 닫고 새로고침 안내를 보인다고 적는데, `repository.onVersionChange` 콜백을 연결한 곳이 없어 안내는 실제로 나오지 않았다. 그리고 "출시 후보"라는 말이 승인·배포·release와 섞이면 안 된다.

## 결정

Rust·프로토콜·스키마·DB version·`BUILD_ID`·fixture·생성 계약은 바꾸지 않는다(`contract_change=NO`). 앱 코드는 두 곳만 호스트 쪽으로 고친다.

- `repository.onVersionChange`를 App이 연결해, 다른 탭이 더 새로운 저장 형식으로 열 때 이 탭이 연결을 닫은 뒤 `role="alert"` 새로고침 안내(`db-version-notice`)를 보인다. 저장된 행은 지우지 않는다. 프로젝트 목록의 저장소 오류도 다른 화면처럼 `describeStoreFailure`로 읽힌다. 새 색 토큰은 없다.
- 실제 브라우저 검증(`apps/web/tests/browser/local-delivery.spec.ts`)은 네 경로를 확인한다: 처음 설치의 저장·복원과 깨끗한 호환 보고, 실제 행을 실은 v1→v6 제자리 업그레이드(일지 `1→2,…,5→6`, 채택 snapshot 그대로), 더 새로운 DB의 `migration_blocked` 거절과 `newer_database` 보고(삭제 없음), 연결을 놓지 않는 동안 아무것도 적용하지 않는 차단된 업그레이드. 단위 시험은 같은 보존을 fake-indexeddb로 확인한다.
- 인계 산출물은 `docs/delivery/`다. `LOCAL_DELIVERY.md`가 지원 브라우저·기기, 빌드, 업데이트(앱 껍데기 SW 무대/승격 + IndexedDB migration), 실패 경로, 업그레이드 결과, 검수 명령, 실제 범위와 장기 미구현을 정리한다. `release-candidate/`는 소스·도구·저장 형식·지원 대상·미해결 gap·관측 dist 해시를 담은 `manifest.json`과 검수 안내 `index.md`다. `scripts/check-release-candidate.mjs`가 manifest를 저장소의 실제 pin과 비교하고 `--dist`로 방금 빌드한 산출물과 대조한다.
- z-노드 분모 `docs/qualification/z-denominator.json`은 갱신한다: z-product-qualification은 `MERGED`(PR 117), z-local-delivery는 `IN_PROGRESS`다. `check-z-denominator.mjs`와 단위 시험을 새 상태에 맞춘다. 16단계 분모는 그대로다.
- 공개 배포·화면 채택·release는 별도 근거가 있을 때만 표시한다. 이 노드는 그 근거가 아니므로 각각 `UNQUALIFIED`/`PENDING`/`NOT_AUTHORIZED`다.

## 하지 않는 것

다음 프로그램 노드(남은 것 없음), 새 도메인 계약·명령·capability, Rust·생성 계약·fixture 변경, 승인 baseline 교체, release·배포·공개, 실기기 검증 완료 주장, 실제 결제·판매처 연결, 파괴적 migration, `.aiops/**`·`docs/aiops/**`·`.github/**`·보존 프롬프트·`SOURCE_MANIFEST.json` 변경.
