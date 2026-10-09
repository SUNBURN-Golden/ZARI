# SP-z-portable-project — 프로젝트 이식·검증된 가져오기

상태: **채택**. 2026-10-07.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-07 12:42 KST. 원문: "012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해."

이 기록은 z-portable-project만 다룬다. 같은 발화의 이후 z-노드는 각 노드에서 구현한다. Fable NONE과 비작성자 A2는 독립 읽기 전용 검토 2회로 대체한다. 머지 권한은 감독자에게 위임된다. 기록은 [Dz-portable-project](../../design/DECISIONS.md)이다. 이 채택은 런타임 배포, 계정, 결제, 클라우드, 사진 동의, 안전 인증, 출시, 실기기 검증이 아니다.

## 문제

계획과 출처를 다른 기기로 옮기려면 무엇을 넣을지 고르고, 손상·구버전·경로 이탈·압축 폭탄을 쓰기 전에 거절해야 한다. JSON exportVersion 1은 사진 바이트를 빼 두었고, 묶음이 실패해도 이미 있는 프로젝트를 덮어쓰면 안 된다.

## 결정

이식 묶음은 exportVersion 1 옆의 STORE zip이다. Rust `buildPortableBundle`과 `inspectPortableBundle`이 해시, 버전, 크기, 중복 ID, 경로, 압축 폭탄, 사진·위치·개인정보 정책을 검사한다. 호스트는 통과한 뒤에만 기존 `stageProjectImport`와 한 트랜잭션의 `commitImport`를 쓴다. 거절은 그 전에 반환되고 저장하지 않는다.

- 포함 범위는 프로젝트, 관측(측정 입력과 보유 이력), 카탈로그, 스냅샷 첨부다. 프로젝트가 없으면 가져오기를 거절한다.
- 사진 바이트는 항상 제외다. 위치정보와 개인정보 키가 첨부 메타데이터에 있으면 거절한다. 이 기기의 원본은 지우지 않는다. 공유 보유 수납함은 묶음에 없다.
- 보유 이력은 observations.json에만 있고, 가져오면 새 프로젝트 id와 revision `1`로 같은 트랜잭션에 복사한다. exportVersion 1 JSON에는 원장을 넣지 않는다.
- 다른 빈 저장소로 가져온 뒤 canonical `planSnapshotId`는 같다. 내용 id는 프로젝트 id와 분리된다.

`BUILD_ID`는 `zari-domain-7`이다. `exportVersion` 1, live `DB_VERSION` 3, schema 1, protocol 1은 바꾸지 않는다. 새 색 쌍은 없다.

## 하지 않는 것

사진 바이트 포함, 위치정보 삭제 실행, 원본 파일 삭제, 클라우드 업로드, deflate 해제, `BUILD_ID` 변경, 다음 z-노드.
