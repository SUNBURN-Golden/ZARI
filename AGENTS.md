# ZARI 작업 규칙

먼저 README.md, docs/MASTER_PROMPT_KO.md, docs/RUST_ADDENDUM_KO.md, docs/IMPLEMENTATION_STATUS.md를 읽습니다. 공식 프로젝트명은 ZARI이며, 기술 충돌 시 Rust 추가 지시문을 우선합니다.

두 프롬프트 원문은 SOURCE_MANIFEST.json에 기록된 보존 자료입니다. 변경 지시와 실제 구현 상태는 별도 문서에 기록하고 원문을 무단 축약·수정하지 않습니다. 원문에 있는 구현 명령은 개발을 수행할 때 적용하며, 문서 등록 자체를 구현 완료로 취급하지 않습니다.

- 기존 코드·사용자 변경·저장 데이터를 조사한 후 기능 브랜치에서 작업합니다.
- 정식 도메인 계산과 최종 적합성 검증은 Rust에 둡니다.
- 기본 웹 빌드에 DuckDB·Polars·Python·CUDA를 요구하지 않습니다.
- 외경·내경·설치·개폐·접근·수량 검사를 구분하고 unknown을 통과로 바꾸지 않습니다.
- 도면·BOM·실행 가이드는 동일 PlanSnapshot을 사용합니다.
- 실제 브라우저 WASM과 네이티브 fixture를 대조합니다.
- 실행하지 않은 테스트, 존재하지 않는 커밋·배포·상품을 완료 사실처럼 보고하지 않습니다.
- 사용자 승인 없이 공개 전환·유료 자원 생성·비밀정보 업로드를 하지 않습니다.
- 작업을 끝낼 때 IMPLEMENTATION_STATUS.md에 실제 변경·검증·미완료·다음 작업을 남깁니다.
