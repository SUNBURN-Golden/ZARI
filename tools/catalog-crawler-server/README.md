# catalog-crawler-server — unattended Daiso pipeline (Naver server)

One cron entry runs `run-pipeline.sh`, which does:

1. **Locks** — ZARI-only `flock` on `$ZARI_HOME/pipeline.lock` (no overlap) and, for the
   whole browser phase, the shared `/var/lock/zecbot-browser.lock` (waits ≤5 min, then
   exits cleanly with `status.json` = `skipped/browser_lock_busy`).
2. **Browser phase** (`crawl.ts`, Chrome under Xvfb, memory-capped scope, `nice`/`ionice`):
   the repo crawl scheduler (allowlisted hosts only, robots.txt, Crawl-delay ≥ 30 s,
   `dailyPerHost`, block detection → host paused) over the categories in
   `$ZARI_HOME/pipeline.json`; then detail pages for Daiso items still missing size or
   pack evidence. Detail images are downloaded to `/tmp/zari-img`, OCR'd with tesseract
   (kor+eng) and deleted immediately; only text is kept (`detail/<pdNo>.json`).
   Default UA, no proxy, no login, no captcha handling: any block stops the run.
3. **Publish phase** (`publish.ts`): sizes from name/option text, then OCR text
   (regex; DeepSeek Flash on text only when ambiguous, capped by `deepseekMaxCalls`,
   results cached in `dims-cache.json`); pack quantity from name/detail text; previously
   published sizes and confirmed pack values are kept. The bundle is built and
   reviewed by the repo's Rust `catalog_bundle_tool` and gated: no publish on a block,
   an error spike, validator codes, rejected items, or an item drop > `maxDropRatio`
   (20%). If nothing changed nothing is uploaded. Otherwise bundle + manifest are
   uploaded, the public bundle is verified byte-for-byte, then `latest.json` is
   repointed. Old bundles are never deleted.
4. **Status** — `$ZARI_HOME/status.json` (last run KST, result, reasons, counts,
   DeepSeek calls, peak memory, duration, published bundle id). Logs:
   `$ZARI_HOME/logs/run-YYYYMMDD-HHMM.log`, kept 14 days.

Timeout: 75 min browser phase, 90 min total.

## Layout on the server (`ZARI_HOME=/opt/zari-crawler`)

| Path | What |
| --- | --- |
| `app/` | this repo's `tools/catalog-crawler-{bot,server}`, `tools/catalog-extension`, `apps/web/src/contracts/generated`, `node_modules` (playwright-core), `REVISION` |
| `bin/catalog_bundle_tool` | `cargo build --release -p zari-core --example catalog_bundle_tool` from the same commit |
| `node/` | Node 24 |
| `pipeline.json` | categories, caps, `publicBase`, `bucket`, `skipIds` (see `config.ts`) |
| `secrets/deepseek.env` | `DEEPSEEK_API_KEY=…` (root, 600) |
| `secrets/r2.env` | `ACCESS_KEY_ID=…`, `SECRET_ACCESS_KEY=…`, `ENDPOINT=https://<account>.r2.cloudflarestorage.com` — an R2 token limited to the catalog bucket (root, 600) |
| `state/` | crawl scheduler state (queue, hosts, items, Chrome profile); `state/STOP` pauses runs |

Run by hand: `ZARI_HOME=/opt/zari-crawler /opt/zari-crawler/app/tools/catalog-crawler-server/run-pipeline.sh`
(add `--dry-run` to build and validate without uploading).

Cron (server clock is KST): `0 3 * * * ZARI_HOME=/opt/zari-crawler /opt/zari-crawler/app/tools/catalog-crawler-server/run-pipeline.sh`
