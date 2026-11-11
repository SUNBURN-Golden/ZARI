#!/bin/bash
# Unattended ZARI catalog pipeline for the Naver server (cron entry point).
#   ZARI_HOME=/opt/zari-crawler /opt/zari-crawler/app/tools/catalog-crawler-server/run-pipeline.sh [--dry-run]
# Needs: $ZARI_HOME/node (Node 24), app/ (repo subset with node_modules/playwright-core),
#        bin/catalog_bundle_tool (built from the same commit), Chrome, xvfb-run, tesseract kor+eng,
#        secrets/deepseek.env (DEEPSEEK_API_KEY=..., 600) and secrets/r2.env (ACCESS_KEY_ID/SECRET_ACCESS_KEY/ENDPOINT, 600).
# Locks: ZARI-only flock (no overlap) + shared /var/lock/zecbot-browser.lock for the browser phase.
# Guards: total timeout 90 min, browser phase in a memory-capped scope, nice/ionice.
set -uo pipefail
ZARI_HOME=${ZARI_HOME:-/opt/zari-crawler}
APP="$ZARI_HOME/app/tools/catalog-crawler-server"
LOGDIR="$ZARI_HOME/logs"
mkdir -p "$LOGDIR"
find "$LOGDIR" -maxdepth 1 -name 'run-*.log' -mtime +14 -delete 2>/dev/null
LOG="$LOGDIR/run-$(TZ=Asia/Seoul date +%Y%m%d-%H%M).log"
exec >>"$LOG" 2>&1
umask 077
note() { echo "$(date -u +%FT%TZ) $*"; }
status() { # result reason
  printf '{"lastRunKst":"%s","result":"%s","reasons":["%s"]}\n' "$(TZ=Asia/Seoul date '+%F %H:%M') KST" "$1" "$2" > "$ZARI_HOME/status.json"
}
exec 8>"$ZARI_HOME/pipeline.lock"
if ! flock -n 8; then note "skip: previous ZARI run still active"; exit 0; fi

export PATH="$ZARI_HOME/node/bin:$PATH" ZARI_HOME ZARI_BUNDLE_TOOL="$ZARI_HOME/bin/catalog_bundle_tool" HOME=/root
if [ -f "$ZARI_HOME/secrets/deepseek.env" ]; then set -a; . "$ZARI_HOME/secrets/deepseek.env"; set +a; fi
if [ -f "$ZARI_HOME/state/STOP" ]; then note "skip: STOP file present"; status skipped stop_file; exit 0; fi
START=$(date +%s)
note "start pipeline $(cat "$ZARI_HOME/app/REVISION" 2>/dev/null)"
rm -f "$ZARI_HOME/crawl-result.json"

MEM=(); if command -v systemd-run >/dev/null && [ "$(id -u)" = 0 ]; then
  MEM=(systemd-run --scope --quiet --collect -p MemoryMax=${ZARI_MEM_MAX:-700M} -p MemorySwapMax=${ZARI_SWAP_MAX:-400M});
fi
# Browser phase: wait up to 5 min for the shared browser lock, else skip cleanly.
timeout --kill-after=60 75m flock -w 300 -E 75 /var/lock/zecbot-browser.lock \
  "${MEM[@]}" nice -n 10 ionice -c3 xvfb-run -a -s "-screen 0 1280x900x24" node "$APP/crawl.ts"
rc=$?
if [ $rc -eq 75 ]; then note "skip: zecbot browser lock busy"; status skipped browser_lock_busy; exit 0; fi
note "crawl phase exit=$rc"
LEFT=$(( 90*60 - ($(date +%s) - START) - 30 ))
[ $LEFT -lt 120 ] && LEFT=120
timeout --kill-after=30 ${LEFT}s nice -n 10 node "$APP/publish.ts" "$@"
rc=$?
note "publish phase exit=$rc duration=$(( $(date +%s) - START ))s"
python3 - "$ZARI_HOME/status.json" "$(( $(date +%s) - START ))" <<'PY' 2>/dev/null
import json,sys
p=sys.argv[1]; s=json.load(open(p)); s['durationSec']=int(sys.argv[2]); json.dump(s,open(p,'w'),ensure_ascii=False,indent=1)
PY
exit $rc
