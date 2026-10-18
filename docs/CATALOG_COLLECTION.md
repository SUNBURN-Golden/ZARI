# 치수 수집 봇 런북

결정 기록은 [SP-z-catalog-crawler](adr/SP-z-catalog-crawler.md)이다. 이 문서는 사용자가 직접 설치·실행하는 방법이다. CI와 이 저장소의 어떤 시험도 이 절차를 실행하지 않는다(실제 Chrome·실제 사이트·실제 R2는 **미검증**).

## 먼저 알아야 할 것

- **약관·IP 차단 위험.** 무인 자동 수집은 사이트 약관이 가장 자주 금지하는 행위 유형이다. 사용자의 IP가 차단되거나 계정 정책에 걸릴 수 있다. 소유자는 이 위험을 수용했지만 이 문서는 법률 자문이 아니다. 실행하는 사람이 책임진다. 위험을 줄이려면 시드를 적게, 상한을 낮게, 간격을 길게 두고 처음에는 한두 페이지로 시험한다.
- 모으는 것은 이름·브랜드·카테고리·상품 주소·가로/세로/높이 글자·가격 글자뿐이다. 이미지·후기·설명은 읽지 않는다. 항목은 모두 **미확인**이다.
- 로그인하지 않는다. 로그인·CAPTCHA·차단·403/429 화면이 보이면 그 호스트는 즉시 멈춘다. 우회하지 않는다.
- 앱은 아무것도 수집하지 않는다. 앱은 번들 파일을 읽기만 한다.

## 구성

```
스케줄러(cron/systemd, 사용자가 설치) → node tools/catalog-crawler-bot/cli.ts run
   봇: 큐·pacing·robots·백오프·검증·번들·게시         (TypeScript, Node 24 내장 모듈만)
    │  0600 Unix 소켓 (상태 디렉터리 안, 포트 없음)
   native host: Chrome이 stdio로 구동 ─ allowed_origins로 확장 ID 고정
    │
   사용자의 Chrome (보이는 창, 로그인 없는 전용 프로필) + MV3 확장 tools/catalog-extension/
```

## 1. 확장 설치 (개발자 모드)

Chrome 웹 스토어 게시·서명 키는 이 노드 범위 밖이다.

1. 봇이 쓰는 **전용 프로필**로 Chrome을 한 번 연다: `google-chrome --user-data-dir="$HOME/.local/state/zari-catalog-crawler/chrome-profile"`.
2. `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드" → `tools/catalog-extension/`.
3. 표시된 **확장 ID**(영문 소문자 32자)를 적어 둔다.
4. 이 프로필에 로그인하지 않는다.

`run`은 기본으로 `--load-extension`도 붙이지만 Chrome 137부터 정식 빌드는 이 플래그를 무시할 수 있다(`--disable-features=DisableLoadExtensionCommandLineSwitch`를 함께 붙이지만 보장하지 않는다 — 미검증). 위 3단계로 한 번 로드해 두면 같은 프로필에 남는다. 그럴 때는 `run --no-load-extension`을 쓴다. 이미 열려 있는 Chrome에 붙으려면 `run --attach`(Chrome을 띄우지 않고 확장이 연결되길 기다린다).

## 2. native host 등록

```
node tools/catalog-crawler-bot/cli.ts install-native-host --extension-id <확장ID>
```

전용 프로필의 `NativeMessagingHosts/com.zari.catalog_bot.json`(`allowed_origins`에 이 확장 ID만)과 상태 디렉터리의 실행 스크립트를 쓴다. 그 외 디렉터리·다른 프로필·시스템 파일은 건드리지 않는다. 지우려면 두 파일을 지운다.

## 3. 시드와 설정

```
node tools/catalog-crawler-bot/cli.ts seed add <목록/카테고리/상품 주소> ...
node tools/catalog-crawler-bot/cli.ts seed list
node tools/catalog-crawler-bot/cli.ts seed remove <주소>
```

허용 호스트(`ohou.se`, `store.ohou.se`, `www.29cm.co.kr`, `www.ikea.com/kr/`)의 https 주소만 받는다. 검색·필터·정렬 주소와 29cm의 `/my-page/`·`/order/` 등은 받지 않는다.

상태 디렉터리: `~/.local/state/zari-catalog-crawler/`(또는 `ZARI_CRAWLER_STATE_DIR`). 권한 0700. `config.json`을 만들면 기본값을 바꾼다. 모든 값은 하드 한도 안으로 잘린다.

| 키 | 기본 | 한도 |
|---|---|---|
| `minIntervalMs` | 8000 | 3000 이상(Crawl-delay가 크면 그것) |
| `jitterMs` | 4000 | 0–600000 |
| `pagesPerRun` | 100 | 최대 500 |
| `dailyPerHost` | 300 | 최대 1000 (robots 읽기도 센다) |
| `recrawlDays` | 30 | 7 이상 |
| `blockCooldownHours` | 6 | 6 이상, 연속 차단마다 2배, 최대 168 |
| `robotsTtlHours` | 24 | |
| `publishEvery` | 0 | 0이면 실행 끝에만 번들 |
| `chromePath` | null | 또는 `ZARI_CHROME_PATH` |

## 4. 실행

```
node tools/catalog-crawler-bot/cli.ts run
```

Chrome 창이 보이는 채로 뜨고 확장이 연결되면 시드부터 방문한다. 호스트마다 robots.txt를 먼저 사용자 Chrome에서 읽는다(읽지 못하면 그 호스트는 닫힌다). 목록 페이지에서 발견한 상품 주소만 큐에 들어간다(허용 호스트·robots 허용 경로, 정규화·중복 제거). 끝나면 유효한 항목 전체로 번들을 다시 만들고, R2가 설정되어 있으면 게시한다. Chrome 창을 닫으면 실행이 끝난다. 큐는 `queue.json`에 원자적으로 저장되어 중간에 끝나도 다음 실행이 이어서 한다. 한 번에 한 인스턴스만 돈다(`run.lock`). `CI`가 설정되어 있으면 Chrome을 띄우지 않는다.

### 스케줄 예시 (봇은 아무것도 설치하지 않는다)

cron(하루 한 번, 새벽):

```
17 3 * * *  cd /path/to/zari && /path/to/node tools/catalog-crawler-bot/cli.ts run >> ~/zari-crawl.log 2>&1
```

보이는 창이 필요하므로 로그인 세션의 디스플레이가 있어야 한다. systemd user timer:

```
# ~/.config/systemd/user/zari-crawl.service
[Service]
Type=oneshot
WorkingDirectory=/path/to/zari
ExecStart=/path/to/node tools/catalog-crawler-bot/cli.ts run
# ~/.config/systemd/user/zari-crawl.timer
[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=false
[Install]
WantedBy=timers.target
```

`systemctl --user enable --now zari-crawl.timer`. 하루에 여러 번 돌리지 않는다.

## 5. 멈추기와 차단 대응

- **킬 스위치.** `cli.ts stop`이 `STOP` 파일을 만든다. 실행 중이면 다음 작업 전에 멈추고, 파일이 있는 동안 `run`은 시작하지 않는다. 지우기: `cli.ts stop --clear`. 파일을 직접 만들거나 지워도 같다. Chrome 창을 닫아도 끝난다.
- **차단 신호**(로그인 요구, CAPTCHA, 차단 문구, HTTP 403/429)가 오면 그 호스트는 즉시 멈추고 쿨다운이 영속된다(6시간, 연속이면 2배). 쿨다운 동안은 한 건도 보내지 않는다. 쿨다운 뒤 첫 시도가 또 차단되면 호스트는 **비활성**이 되어 사람이 `resume-host`를 하기 전까지 시도하지 않는다.
- 차단을 받으면: 상태(`status`)와 로그(`run.log`)를 보고, 사이트를 사용자 Chrome에서 직접 열어 사람이 보는 화면이 정상인지 확인하고, 간격을 늘리고 상한을 낮춘 뒤 `cli.ts resume-host <ohou|29cm|ikea>`로 재개한다(robots.txt도 다시 읽는다). 반복되면 그 사이트의 시드를 지우고 수집을 멈추는 것이 맞다.
- 로그에는 주소·건수·결과 코드만 남는다. 쿠키·토큰·비밀은 읽지도 쓰지도 않는다.

## 6. 수동 담기 (선택)

확장 아이콘 팝업의 "이 상품 담기"는 지금 보는 상품 페이지 하나를 `zari-collection/1` 파일(최대 50건)로 내려받는다. 봇은 그 파일(또는 폴더)을 읽는다:

```
node tools/catalog-crawler-bot/cli.ts ingest <파일|폴더>
```

항목마다 Rust 검증을 거쳐 거부된 것만 이유와 함께 빠진다(이미지 필드·알 수 없는 필드·허용 밖 주소·신뢰도 불일치 등).

## 7. 번들과 게시

```
node tools/catalog-crawler-bot/cli.ts build           # 상태 디렉터리/out/catalog/v1/... 에 번들 생성
node tools/catalog-crawler-bot/cli.ts publish --yes   # R2가 설정된 경우에만
```

`build`는 Rust(`catalog_bundle_tool`)에 항목 전체를 보내 거부된 항목을 빼고 정규 JSON·SHA-256 번들을 만든다. 같은 항목이면 같은 `bundleId`이고 새로 쓰지 않는다. 저장소 배치:

```
<prefix>/catalog/v1/<bundleId>/bundle.json
<prefix>/catalog/v1/<bundleId>/manifest.json
<prefix>/catalog/v1/latest.json        ← 마지막에 올린다
```

### R2에 필요한 설정값 (소유자가 제공, 저장소에는 없다)

환경변수로만 읽는다. 모두 있고 `ZARI_R2_ENABLED`가 정확히 `1`이어야 게시하며, 아니면 요청 없이 이유를 한 줄 쓰고 번들만 로컬에 둔다(`run`의 자동 게시도 같다).

| 변수 | 내용 |
|---|---|
| `ZARI_R2_ENABLED` | `1` |
| `ZARI_R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` 형태만 (계정 ID는 32자리 16진수) |
| `ZARI_R2_BUCKET` | 버킷 이름 |
| `ZARI_R2_ACCESS_KEY_ID` | 액세스 키 ID |
| `ZARI_R2_SECRET_ACCESS_KEY` | 비밀 키(출력·로그·오류에 남기지 않는다) |
| `ZARI_R2_PREFIX` | 선택. 키 앞 경로 |

보내는 것은 SigV4(region `auto`)로 서명한 PutObject뿐이다. 버킷 생성·목록·삭제·계정 설정은 호출하지 않는다. 토큰의 권한은 해당 버킷의 객체 쓰기로 제한하는 것을 권장한다. 앱이 읽을 공개 읽기 base URL과 CORS는 소유자가 R2에서 따로 정한다(이 노드에 없음).

## 8. 출처 제거

```
node tools/catalog-crawler-bot/cli.ts remove-source <ohou|29cm|ikea>
node tools/catalog-crawler-bot/cli.ts publish --yes
```

그 사이트의 수집 항목·큐·시드를 지우고 새 번들을 만든다. 저장소에서 사라지려면 새 번들을 게시해야 한다(옛 `<bundleId>` 폴더는 R2에서 직접 지운다 — 봇은 삭제를 호출하지 않는다). 앱에서는 이미 저장한 카탈로그를 `#/catalog`/`#/data`의 기존 경로로 지운다.

## 9. 앱에서 쓰기

`#/catalog` → "치수 번들 가져오기" → `bundle.json` 선택 → 검토 결과 확인 → "이 번들을 카탈로그로 저장". 오프라인에서도 된다. 저장된 카탈로그는 프로젝트의 "카탈로그 선택"에 "수집·치수만·미확인"으로 나타난다. 저장소 URL에서 직접 읽는 길은 이 빌드에서 꺼져 있다(ADR "저장소 읽기").

## 한계 (미검증 포함)

- 세 사이트의 실제 페이지 구조에 맞는지는 **확인하지 않았다**. 파서·URL 패턴은 합성 fixture로만 시험했다. 첫 실행 전에 한 페이지씩 사용자 Chrome에서 확인하라.
- 실제 Chrome 구동, native messaging 연결, `--load-extension`, 실제 R2는 이 저장소의 시험이 닿지 못한다.
- 수집한 카탈로그의 변형을 "내 보유 수납함으로 복사"하는 기존 기능은 근거(evidence)가 있는 가져온 카탈로그 전체에서 `dangling_evidence_ref`로 거절된다(이 노드 이전부터의 동작이며 바꾸지 않았다).
- 내경은 항상 알 수 없다. 외경만으로는 물건이 들어가는지 계산할 수 없고, 계산은 알 수 없음으로 남는다.
- 옵션 이름은 한글이면 해시 토큰이 id가 되고 이름은 항목 `name`의 괄호에만 남는다.
