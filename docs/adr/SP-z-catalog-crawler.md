# SP-z-catalog-crawler — 공개 상품 치수 자동 수집 봇과 읽기 전용 카탈로그 클라이언트

상태: **채택**. 2026-10-15.

사용자 결정: JunTae Park (준태, 저장소 소유자), 2026-10-15 KST (ZARI 메인테이너 대화). 원문: "크롤링해야지. 이것도 일종의 디지털트윈으로 해서 직접 적용할수있게 해주는건데."

같은 날 확정된 구조(메인테이너 기록, 요약): 앱은 이미 저장소(Cloudflare R2)와 연동돼 있고 카탈로그를 **읽기만** 한다. 번들을 가져와 검증하고 로컬에 캐시하며 가로·세로·높이만으로 그린다. 앱은 아무것도 수집하지 않는다. 별도의 수집 봇이 저장소를 채우고, 클릭 단위가 아니라 **무인 자동**으로 돈다. 수동 "담기"는 선택적 대체 수단이다. R2 계정·버킷·키는 소유자가 나중에 정한다.

이 기록은 z-catalog-crawler만 다룬다. 이 노드는 고정된 `.aiops/program.json`의 36개 노드에 없고 감독자의 프로그램 사본에만 있다. Fable 게이트는 독립 읽기 전용 검토 2회로 대체되고 머지는 감독자에게 위임된다. 기록은 [Dz-catalog-crawler](../../design/DECISIONS.md)이다. 이 채택은 R2 계정 생성, 배포, 결제, Chrome 웹 스토어 게시, 사진·이미지 사용, 법률 검토가 아니다.

## 개정하는 범위

v1은 "scraper 없음"(`docs/PRODUCT_SPEC.md` Out of v1)이었다. 소유자 지시로 **수집 봇과 확장**을 이 저장소에 두되, 앱 코드에는 여전히 수집·크롤링·제3자 사이트 요청이 없다. `docs/PERFORMANCE_SECURITY_FAILURES.md`의 "Future scraper" 행은 "서버측 fetch 크롤러 없음 + 사용자 Chrome 안의 브라우저 수집 + 읽기 전용 앱"으로 고쳤다. 번들 항목에 `sourceKind: crawled`가 추가된다. 저장 카탈로그의 `CatalogSourceKind`는 `synthetic`/`imported` 그대로다(아래 "계약").

## 위험 수용 (법률 자문 아님)

소유자는 약관·데이터베이스권·저작권·계정/IP 차단 위험을 알고 수집을 지시했고 그 위험을 수용했다. 이 문서는 법률 자문이 아니고 적법성을 보증하지 않는다.

- **무인 자동 수집은 사이트 약관이 가장 자주 금지하는 행위 유형이다.** 클릭 단위의 수동 담기보다 약관 위반으로 판단될 가능성과 사용자 IP·계정이 차단될 가능성이 크다. 이 노드가 그 위험을 없애지 않는다. 실행 책임은 소유자와 실행하는 사용자에게 있다.
- 데이터베이스권·저작권: 가로·세로·높이 같은 사실만 모으고 상품 설명·후기·이미지는 모으지 않는다. 그래도 목록 전체를 복제하는 행위가 문제될 수 있다.
- 완화책(코드와 테스트로 고정): 사실·치수만, 이미지 없음, 로그인 없음, 상품 링크로 구매 이동(앱은 구매를 대행하지 않음), 출처 표기(`source`, `productUrl`, `fetchedAt`), robots.txt 준수(읽지 못하면 fail-closed), 호스트당 동시 1·간격 8초+지터(Crawl-delay가 크면 그것), 실행당 100쪽·호스트별 일일 300건 기본 상한(설정으로 낮출 수만 있고 절대 상한 500/1000), 차단·CAPTCHA·로그인·403/429 즉시 중단과 지수 백오프(최소 6시간, 연속 2회면 `resume-host` 전까지 비활성), 킬 스위치(`STOP` 파일·`stop` 명령), 출처별 제거 명령(`remove-source`).
- 우회하지 않는다: 프록시·회전·UA 위장·CAPTCHA 풀이·로그인 자동화·헤드리스 브라우저·CDP 원격 조종·유료 스크래핑 서비스는 쓰지 않는다.

## 구성

- **A. 수집 측.** `tools/catalog-extension/`(Manifest V3, 번들러 없는 평문 JS)가 봇이 보낸 작업(robots.txt 읽기, 목록 링크 발견, 상품 치수 추출)을 허용 호스트 안에서만 실행한다. `tools/catalog-crawler-bot/`(TypeScript, Node 내장 모듈만)이 시드·큐·pacing·robots·백오프·킬 스위치·검증·번들·게시를 맡는다. 탐색은 확장이 아니라 봇의 큐가 결정한다.
- **B. 저장소 계약.** `crates/core/src/catalog_bundle.rs`. 치수 전용 번들(manifest + items), 정규 JSON SHA-256, 이미지 필드·URL이 있으면 번들 전체 거부, `deny_unknown_fields`, 같은 입력은 같은 바이트. Rust가 단일 권위이고 TS는 복제하지 않는다: 봇은 `catalog_bundle_tool`(core example)에, 앱은 같은 코드를 WASM(`reviewCatalogBundle`)으로 쓴다.
- **C. 앱 측.** `#/catalog`의 "치수 번들 가져오기": 파일 선택 → 크기 제한 → Rust 검토 → 행별 진단 → 사용자 확인 → 기존 `putCatalog`(불변 digest)로 IndexedDB 캐시. 가져온 항목은 항상 미확인이다. 이미지 없이 가로·세로·높이와 `categoryHint`로 평면 사각형·정면·입체 상자를 그린다. 치수가 low/unparsed이면 그리지 않고 "치수 미확인"이라 쓴다.

## 제어 채널 결정

| 후보 | 평가 | 결과 |
|---|---|---|
| **Chrome Native Messaging** (stdio, `allowed_origins`로 확장 ID 강제) + 봇과는 0600 Unix 소켓 | 열린 포트가 없다. Chrome이 확장 ID를 강제한다. 소켓은 0700 상태 디렉터리 안 0600이고 실행마다 새 토큰(0600 파일)으로 인증한다. 다른 사용자·웹페이지가 접근할 수 없다. | **선택** |
| 127.0.0.1 HTTP/WebSocket 브리지 + 토큰 | 같은 PC의 다른 프로세스와 웹페이지(DNS rebinding, 로컬 포트 스캔)가 닿을 수 있는 포트가 생긴다. 토큰 보관·회전 부담. | 기각 |
| CDP/원격 디버깅 포트로 브라우저 조종 | 임의 코드 실행이 가능한 열린 포트이며 자동화 탐지·우회 논란을 부른다. | 기각 |
| 확장이 파일을 내려받고 봇이 폴더를 감시 | `downloads` 권한이 필요하고 양방향 제어가 안 된다. | 기각 |

Chrome은 사용자 본인의 것을 **보이는 창**으로, 로그인 없는 전용 프로필(`--user-data-dir`)로 띄운다. native host 매니페스트는 그 전용 프로필 안에 등록하며 사용자의 평소 프로필·시스템 디렉터리는 건드리지 않는다. `install-native-host --extension-id <id>`는 사용자가 직접 실행한다(CI는 실행하지 않는다). 확장 ID는 사용자가 `chrome://extensions`에서 확인해 넣는다.

## 기각한 대안

- **서버측 fetch 크롤러.** 2026-10-15 관측에서 `ohou.se/robots.txt`는 비브라우저 클라이언트에 `403 Access Denied`였다. 서버가 robots를 읽지도 못하는 사이트를 서버측으로 수집하는 것은 우회 압력이 된다. 그래서 robots.txt도 확장이 사용자 Chrome에서 읽는다.
- 앱 내 크롤러(앱은 읽기 전용), 헤드리스 브라우저·CDP 원격 조종, 프록시 회전, UA 위장, CAPTCHA 해결, 로그인 자동화, 유료 스크래핑 서비스, 이미지 수집·저장·배포·표시.

## 사이트 관측 (2026-10-15, 감독자의 robots.txt 단일 조회 3회)

이 외의 조회는 없다. 아래는 robots.txt뿐이며 상품 페이지 구조는 관측하지 않았다.

- `www.29cm.co.kr/robots.txt`: `/*` 허용, `/embed/`, `/home/embed/`, `/my-page/`, `/order/`, `/auth/`, `/inbox/`, `/content/post/preview` 금지.
- `www.ikea.com/robots.txt`(루트): 검색·필터·정렬·compare 등 금지. `ikea.com/kr/ko/robots.txt`는 404.
- `ohou.se/robots.txt`: 비브라우저에 403. 사용자 Chrome 안에서 읽고, 읽지 못하면 그 호스트는 fail-closed.

확장은 이 금지 경로를 정적 목록으로도 거부하고(`lib/sites.js`), 봇은 호스트의 실제 robots.txt(UA `*`, `Allow`/`Disallow` 최장 일치, `*`·`$`, `Crawl-delay`)를 따른다. 빈 본문·HTML 오류 페이지·비-200은 "읽지 못함"이며 "전부 허용"이 아니다.

**미검증.** 세 사이트의 실제 상품·목록 페이지 구조(JSON-LD 유무, 사양 표 모양, 링크 패턴)는 확인하지 않았다. 파서는 구조화 데이터·사양 행·본문 글자·링크라는 일반적 신호를 읽도록 쓰였고 시험은 손으로 만든 합성 HTML fixture(`tests/fixtures/catalog-collection/`)만 쓴다. URL 패턴(`/productions/<id>`, `/goods/<id>`, `/products/<id>`, `/catalog/<id>`, IKEA `...-<8자리>`)은 일반 지식에 기댄 것이며 실제 사이트와 다를 수 있다. 첫 실행 전에 소유자가 사용자 Chrome에서 한 페이지씩 확인해야 한다.

## 계약

- 번들 항목: `id` `crawl:<site>:<sourceProductId>[:<option>]`, `sourceKind: crawled`, `status: unconfirmed`, `name`, `brand`, `category`(원문), `categoryHint`, `productUrl`(https, 사이트별 허용 호스트), `source`, `fetchedAt`, `dimensions{rawText,width,depth,height,unit,confidence}`, 선택 `priceText`. 이미지·사진·썸네일 필드는 스키마에 없다.
- 치수 파싱 규칙: 원문 보존, 라벨 있는 W/D/H와 단위를 **원문 단위 그대로** 기록, 단위 추측·변환 없음(변환은 Rust), 라벨 없는 3값·지름/원형·범위·혼합 단위·단위 없음은 `low`(값 비움), 옵션은 별개 항목으로 분리하고 합치지 않음, 내경 글은 외경으로 읽지 않으며 외경으로 내경을 채우지 않음. 신뢰도 high(라벨 3개+단위)/medium(2개)/low/unparsed. Rust는 신뢰도와 값의 일치를 다시 검사한다.
- 스냅샷 변환은 기존 `catalog_provenance` 검토를 그대로 쓴다: 행마다 자기 상품이므로 옵션은 합쳐지지 않고, 한 행이라도 격리되면 스냅샷은 null이며 기존 카탈로그는 그대로다(`existingUntouched`). 스냅샷의 `sourceKind`는 `imported`, 모든 사실은 `Unverified`, 내경은 unknown, low/unparsed 항목의 외경 세 축도 unknown이다. `categoryHint`는 `Product.category`에, 원문 카테고리와 신뢰도는 외경 근거 note에, `productUrl`은 판매 링크 근거(가격은 사실로 수집하지 않음)에 남는다. `MeasurementOrigin`은 `UserDeclared`로 남기고 출처가 수집임은 근거 note에 적는다.
- 스냅샷 변환 한도: 번들 5,000항목/10 MiB. 변환된 스냅샷이 4 MiB를 넘으면 `snapshot_too_large`로 거절한다(기존 프로토콜 메시지 5 MiB 한도 안에서 계획에 쓸 수 있어야 하므로).
- 저장소 배치: `<prefix>/catalog/v1/<bundleId>/bundle.json`, `manifest.json`, 최신 포인터 `<prefix>/catalog/v1/latest.json`. `bundleId`는 항목 정규 JSON 해시의 앞 16자리(`b-…`)이다.
- **프로토콜·`BUILD_ID`·capability·fixture 기대값은 바꾸지 않았다.** 번들은 Worker 프로토콜 5 MiB 메시지 한도보다 클 수 있고 프로젝트·스냅샷·저장 카탈로그를 건드리지 않는 읽기 전용 검토이므로, 프로토콜 명령이 아니라 WASM 자유 함수와 전용 Worker(`bundleWorker.ts`)로 둔다. 새 생성 계약 루트는 `CatalogBundle`, `CatalogBundleReview`, `CatalogBundleBuild`(스크립트가 생성)이다.
- 기존 `catalog_provenance`의 100행 한도를 호출자가 정하는 한도로 일반화했다(기본 경로는 100 그대로).

## 저장소 읽기 (앱의 URL 경로)

스펙은 앱이 R2의 `latest.json`→번들을 사용자가 "카탈로그 새로고침"을 눌렀을 때 GET으로 읽게 하되, z-privacy-offline의 네트워크 정책과 충돌하면 URL 경로는 구현하지 말고 파일 전용으로 두고 결정을 기록하라고 했다. 충돌한다: `apps/web/tests/unit/privacyOffline.test.ts`는 배포 소스에서 `fetch(` 같은 네트워크 API가 `public/sw.js` 한 곳뿐이라고 고정하고, 브라우저 시험은 모든 요청이 같은 origin의 본문 없는 GET임을 확인하며, `features/privacy/connections.ts`가 연결 목록의 단일 출처다. 그래서:

- **이 빌드의 앱은 파일 가져오기만 켜져 있다.** 화면은 "저장소에서 읽기: 이 빌드에서는 꺼져 있습니다"라고 쓴다.
- 읽기 규칙은 네트워크 호출 없는 코어로 구현·시험했다(`readRepository`, `parseBaseUrl`): https만, userinfo·query·fragment 금지, GET만, `credentials: 'omit'`, `redirect: 'error'`, 20초 제한, `latest.json` 4 KiB·번들 `bytes`(≤10 MiB) 제한, `latest.json`이 가리키는 경로는 `catalog/v1/<bundleId>/bundle.json`뿐, 가리킨 `bundleId`와 번들이 다르면 거절. 전송은 주입 가능한 `RepositoryTransport`이며 이 빌드에는 연결되어 있지 않다.
- **켜려면 별도 소유자 결정이 필요하다**(이 노드가 하지 않음): (1) 공개 읽기 base URL(소유자 R2 결정 뒤), (2) `privacyOffline` 정적 검사에 이 한 모듈만 허용하는 좁은 예외, (3) `connections.ts`에 "카탈로그 저장소 읽기" 항목(`kind` 추가는 해당 테스트의 고정 목록을 바꾼다), (4) 브라우저 시험의 same-origin 단언을 mock 저장소에 맞게 조정, (5) 저장소 CORS 설정. 추천 최소안: 사용자가 base URL을 직접 입력하고 버튼을 누를 때만 읽는 단일 모듈.

## 하지 않는 것

서버측 fetch 크롤러, 앱 내 크롤링, 열린 TCP/HTTP 제어 포트, CDP, 이미지, 로그인·CAPTCHA·차단 우회, 쿠키·토큰 읽기, 유료 서비스, 비밀·계정 저장, 실제 R2 계정·버킷 생성이나 호출(게시는 `ZARI_R2_ENABLED=1`과 환경변수가 있어야만 하며 PutObject만 보낸다), Chrome 웹 스토어 게시, `.github/workflows`·`.aiops/**`·`docs/aiops/**` 변경, 결제·구매 자동화. 승인된 화면 baseline을 바꾸지 않는다.
