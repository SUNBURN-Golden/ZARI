# ZARI release candidate — 로컬 검수 묶음

이 묶음은 **release candidate**다. 출시(release)가 아니고, 출시 승인도 아니다.
`releaseState`는 `NOT_AUTHORIZED`다. 머지·배포·공개는 별도 사용자 결정이며 이
문서는 그 근거가 되지 않는다. 승인된 화면 baseline은 0개다.

## 내용

- `manifest.json` — 소스·도구·저장 형식·지원 대상·미해결 gap의 기계 판독 기록.
  `dist` 절은 이 빌더 머신에서 `npm run build`로 만든 `apps/web/dist`의
  파일별 SHA-256과 `zari-build.json`의 `buildId`를 관측한 값이다.
  `builtAt`은 빌드마다 바뀐다. `sourceCommit`은 감독자가 여는 PR이 확정하는
  값이며 여기서 만들지 않는다.
- `index.md` — 이 문서.

## 재현과 검수

1. `manifest.json`의 toolchain 항목과 같은 Node/npm/Rust/wasm-bindgen을 준비한다
   (`.nvmrc`, `package.json` engines, `rust-toolchain.toml`, Cargo.lock pin).
2. `npm ci && npm run wasm:build && npm run build`.
3. `node scripts/check-release-candidate.mjs` — 매니페스트가 저장소의 실제
   pin(DB_VERSION, SCHEMA_VERSION, exportVersion, BUILD_ID, fixture 수,
   분모 포인터, 미해결 gap)과 일치하는지 검사한다. dist가 필요 없다.
4. `node scripts/check-release-candidate.mjs --dist` — 방금 빌드한
   `apps/web/dist`의 파일 해시·buildId가 기록과 같은지 비교한다. 다르면
   어떤 파일이 다른지를 출력한다. 빌드 산출물이 소스·도구가 같으면 같은지의
   검사이지, 다른 머신에서의 바이트 일치를 보증하지 않는다.
5. `npm run build` 결과를 `npm run preview`로 띄우면 service worker가
   `zari-build.json`을 무대에 올리고 다음 탐색에서 활성화한다. 이전 빌드는
   복구용으로 하나 남는다.
6. 설치·업데이트·저장 migration의 정상·실패 경로와 각 경로의 검증 위치는
   [../LOCAL_DELIVERY.md](../LOCAL_DELIVERY.md)에 정리했다.
7. 실제 브라우저 검증 결과는 [../../evidence/ZARI-z-local-delivery.md](../../evidence/ZARI-z-local-delivery.md)에 있다.

## 이 묶음이 아닌 것

- 승인 baseline, 화면 승인, 디자인 수용, 실제 기기(전화·전용 GPU) 자격.
- 실상품 카탈로그(번들은 합성 데모 데이터), 실제 판매처·결제·배송 확인.
- 공개 배포·출시 허가. `release` gap은 `NOT_AUTHORIZED`로 남는다.
