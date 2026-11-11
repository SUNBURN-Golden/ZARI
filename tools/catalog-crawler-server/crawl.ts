// Browser phase of the unattended pipeline (run under Xvfb by run-pipeline.sh,
// inside the shared zecbot browser lock). Two steps, one Chrome:
//  1. The repo's crawl scheduler (robots.txt, Crawl-delay >= 30 s, daily cap,
//     block detection with cooldown) driven through the same extension runner.
//  2. Detail pages for Daiso items still lacking size or pack evidence: the
//     page's own selPdDtlDesc text and, for size, its detail images OCR'd with
//     tesseract. Images go to a temp dir and are deleted right after reading;
//     only the OCR text is kept.
// Default UA, no proxy, no login, images/media/fonts aborted in the browser.
// Any block signal stops the run; the publish step then refuses to publish.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { SocketChannel } from '../catalog-crawler-bot/channel.ts';
import { normalizeConfig } from '../catalog-crawler-bot/config.ts';
import { statePaths } from '../catalog-crawler-bot/paths.ts';
import { robotsAllows } from '../catalog-crawler-bot/robots.ts';
import { applyBlock, realClock, runCrawl } from '../catalog-crawler-bot/scheduler.ts';
import { acquireLock, appendLog, loadStore, saveStore } from '../catalog-crawler-bot/state.ts';
import { handleJob } from '../catalog-extension/lib/runner.js';
import { collectPage, collectRobots } from '../catalog-extension/lib/collector.js';
import { home, loadLive, loadPipelineConfig } from './config.ts';
import { dimsFromPageText } from './lib.ts';

const HOME = home();
const started = Date.now();
const cfg = loadPipelineConfig();
const deadline = started + cfg.deadlineMinutes * 60000;
const paths = statePaths(join(HOME, 'state'));
const RAW = join(HOME, 'raw');
const DETAIL = join(HOME, 'detail');
const TMP = '/tmp/zari-img';
for (const d of [RAW, DETAIL]) mkdirSync(d, { recursive: true });
const log = (line: string) => { appendLog(paths, line); console.log(line); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result = { startedAt: new Date(started).toISOString(), endedAt: '', reason: '', pages: 0, itemsStored: 0, queued: 0, blocked: [] as string[], errors: 0, detail: { todo: 0, visited: 0, ocrItems: 0, images: 0, stop: '' }, peakMemMB: 0 };

// The crawl scheduler reads its own config file; keep it in step with pipeline.json.
writeFileSync(paths.config, JSON.stringify({ minIntervalMs: cfg.minIntervalMs, jitterMs: 0, pagesPerRun: cfg.pagesPerRun, dailyPerHost: cfg.dailyPerHost, recrawlDays: cfg.recrawlDays, publishEvery: 0, jobTimeoutMs: 120000 }));
{
  const store = loadStore(paths);
  store.seeds = cfg.categories;
  // Category pages are re-read once per listingRefreshHours to find new products;
  // product pages follow recrawlDays (unchanged products are not revisited daily).
  for (const e of store.queue) {
    if (e.kind === 'listing' && (e.state === 'done' || e.state === 'failed') && e.lastVisitedAt && Date.now() - Date.parse(e.lastVisitedAt) >= cfg.listingRefreshHours * 3600000) e.state = 'pending';
  }
  saveStore(paths, store, ['seeds', 'queue']);
}

const release = acquireLock(paths);
const channel = await SocketChannel.listen(paths);
const context = await chromium.launchPersistentContext(paths.profile, {
  executablePath: process.env.ZARI_CHROME_PATH ?? '/usr/bin/google-chrome', headless: false, viewport: { width: 1280, height: 900 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--blink-settings=imagesEnabled=false'],
});
await context.route('**/*', (route) => (['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue()));

async function collect(url: string, kind: string) {
  const page = await context.newPage();
  try {
    // 'load' can stall on slow third-party scripts; the collector waits for content itself.
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (kind === 'listing') {
      // The category grid renders and lazy-loads after DOMContentLoaded: scroll until the
      // number of product links stops growing (same single page view, no extra navigation).
      await wait(5000);
      let last = -1, stable = 0;
      for (let i = 0; i < 30 && stable < 4; i++) {
        await page.mouse.wheel(0, 2000);
        await wait(2500);
        const count = await page.evaluate(() => document.querySelectorAll('a[href*="pdNo="]').length).catch(() => 0);
        stable = count > 0 && count === last ? stable + 1 : 0;
        last = count;
      }
      log(`${new Date().toISOString()} listing-scroll links=${last} stable=${stable}`);
      await wait(2000);
    } else await wait(kind === 'robots' ? 1500 : 4000);
    const snap: any = await page.evaluate(kind === 'robots' ? collectRobots : collectPage);
    if (snap && snap.status == null && resp) snap.status = resp.status();
    if (kind === 'product' && snap) {
      const id = (new URL(url).searchParams.get('pdNo') ?? '').replace(/\D/g, '');
      const { links: _l, ...rest } = snap;
      if (id) writeFileSync(join(RAW, `${id}.json`), JSON.stringify(rest));
    }
    return snap;
  } finally { await page.close().catch(() => {}); }
}

// In-process "extension" client over the bot's authenticated Unix socket.
const token = readFileSync(paths.token, 'utf8').trim();
const sock = connect(paths.socket);
sock.setEncoding('utf8');
sock.on('connect', () => { sock.write(`${JSON.stringify({ type: 'auth', token })}\n${JSON.stringify({ type: 'hello', protocol: 1, extension: 'server-playwright' })}\n`); });
let buf = '';
sock.on('data', async (chunk: string) => {
  buf += chunk;
  let at: number;
  while ((at = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, at); buf = buf.slice(at + 1);
    const msg = JSON.parse(line);
    if (msg.type !== 'job') continue;
    sock.write(`${JSON.stringify(await handleJob(msg, { collect, now: () => Date.now() }))}\n`);
  }
});

try {
  if (!(await channel.waitForExtension(30000))) throw new Error('client_not_connected');
  const s = await runCrawl({ paths, config: normalizeConfig(JSON.parse(readFileSync(paths.config, 'utf8'))), channel, clock: realClock,
    log: (l) => { if (/ error /.test(l)) result.errors += 1; log(l); } });
  Object.assign(result, { reason: s.reason, pages: s.pages, itemsStored: s.itemsStored, queued: s.queued, blocked: [...s.blocked] });
  if (!s.blocked.length) await detailPhase();
} catch (e) {
  result.reason = `error:${String(e instanceof Error ? e.message : e).slice(0, 120)}`;
} finally {
  sock.destroy();
  await context.close().catch(() => {});
  await channel.close();
  release();
  rmSync(TMP, { recursive: true, force: true });
  result.endedAt = new Date().toISOString();
  result.peakMemMB = peakMemMB();
  writeFileSync(join(HOME, 'crawl-result.json'), JSON.stringify(result, null, 1));
  log(`${result.endedAt} crawl-phase ${JSON.stringify(result)}`);
}
process.exit(0);

function peakMemMB(): number {
  try {
    const cg = readFileSync('/proc/self/cgroup', 'utf8').trim().split(':').pop();
    return Math.round(Number(readFileSync(`/sys/fs/cgroup${cg}/memory.peak`, 'utf8')) / 1048576);
  } catch { return 0; }
}

async function detailPhase(): Promise<void> {
  const live = await loadLive(cfg.publicBase).catch(() => null);
  const liveDims = new Set((live?.items ?? []).filter((i) => (i.dimensions as any)?.width).map((i) => String(i.id)));
  const livePack = new Set((live?.items ?? []).filter((i) => (i.packQuantity as any)?.basis === 'confirmed').map((i) => String(i.id)));
  const store = loadStore(paths);
  const todo: { pd: string; needOcr: boolean }[] = [];
  for (const rec of Object.values(store.items)) {
    const it = rec.item as any;
    if (it.source !== 'daiso') continue;
    const pd = new URL(it.productUrl).searchParams.get('pdNo') ?? '';
    if (!/^\d+$/.test(pd) || cfg.skipIds.includes(pd) || existsSync(join(DETAIL, `${pd}.json`))) continue;
    const raw = existsSync(join(RAW, `${pd}.json`)) ? JSON.parse(readFileSync(join(RAW, `${pd}.json`), 'utf8')) : null;
    const haveDims = liveDims.has(it.id) || !!dimsFromPageText(it.name, String(raw?.text ?? ''));
    const havePack = livePack.has(it.id) || existsSync(join(HOME, 'packocr', `${pd}.json`));
    // OCR when size is unknown and never read; pack text only for items that have a size (others are not published).
    const ocrRead = existsSync(join(HOME, 'imgocr', `${pd}.json`));
    if ((!haveDims && !ocrRead) || (haveDims && !havePack)) todo.push({ pd, needOcr: !haveDims });
  }
  result.detail.todo = todo.length;
  const host = 'www.daisomall.co.kr';
  for (const { pd, needOcr } of todo.slice(0, cfg.detailPerRun)) {
    if (Date.now() > deadline) { result.detail.stop = 'deadline'; return; }
    const st = loadStore(paths);
    const h = st.hosts[host];
    if (!h?.robots || h.disabled || (h.cooldownUntil && Date.parse(h.cooldownUntil) > Date.now())) { result.detail.stop = 'host_paused'; return; }
    const today = new Date().toISOString().slice(0, 10);
    if (h.daily.date !== today) h.daily = { date: today, count: 0 };
    if (h.daily.count >= cfg.dailyPerHost) { result.detail.stop = 'daily_cap'; return; }
    const path = `/pd/pdr/SCR_PDR_0001?pdNo=${pd}`;
    if (!robotsAllows(h.robots.rules, path)) { result.detail.stop = 'robots_disallow'; return; }
    const gap = Math.max(cfg.minIntervalMs, (h.robots.rules.crawlDelaySec ?? 0) * 1000);
    const next = (h.lastRequestAt ? Date.parse(h.lastRequestAt) : 0) + gap;
    if (next > Date.now()) await wait(next - Date.now());
    h.daily.count += 1;
    h.lastRequestAt = new Date().toISOString();
    h.nextRequestAt = new Date(Date.now() + gap).toISOString();
    saveStore(paths, st, ['hosts']);

    const reqAt = new Date().toISOString();
    const page = await context.newPage();
    let desc: any = null; let status: number | null = null; let body = '';
    page.on('response', async (r) => { if (r.url().includes('/pd/pdr/pdDtl/selPdDtlDesc')) { try { desc = await r.json(); } catch { /* ignore */ } } });
    try {
      const resp = await page.goto(`https://${host}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      status = resp?.status() ?? null;
      const t0 = Date.now();
      while (!desc && Date.now() - t0 < 45000) { await wait(2000); await page.mouse.wheel(0, 800).catch(() => {}); }
      body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    } catch (e) { log(`${new Date().toISOString()} detail ${pd} nav-error ${String(e).slice(0, 80)}`); }
    const title = await page.title().catch(() => '');
    await page.close().catch(() => {});
    result.detail.visited += 1;
    log(`${new Date().toISOString()} detail ${pd} requestedAt=${reqAt} http=${status} desc=${!!desc}`);
    if (status !== 200 || /captcha|access denied|차단|too many requests/i.test(`${title}\n${body.slice(0, 2000)}`)) {
      const s2 = loadStore(paths);
      applyBlock(s2.hosts[host]!, status === 200 ? 'blocked_page' : `http_${status}`, Date.now(), normalizeConfig({}));
      saveStore(paths, s2, ['hosts']);
      result.blocked.push(host); result.detail.stop = 'blocked';
      return;
    }
    const snips = Array.from(body.matchAll(/[^\n]{0,40}(입수|개입|구성|1개씩 구매|세트|\d\s*P\b)[^\n]{0,40}/g)).map((m) => m[0]).slice(0, 40);
    const d = desc?.data?.pdDtlDesc ?? {};
    const html = String(d.pdDtlDc ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const imgs = Array.from(html.matchAll(/<img[^>]+src="([^"]+)"/g)).map((m) => m[1]!).filter((u) => /^https:\/\/cdn\.daisomall\.co\.kr\/file\/PD\//.test(u)).slice(0, 12);
    const ocr: string[] = [];
    if (needOcr) {
      mkdirSync(TMP, { recursive: true });
      for (const [i, u] of imgs.entries()) {
        if (Date.now() > deadline) break;
        const f = join(TMP, `${pd}_${i}`);
        try {
          const code = execFileSync('curl', ['-s', '--max-filesize', '15000000', '-o', f, '-w', '%{http_code}', u], { encoding: 'utf8', timeout: 60000 });
          if (code !== '200') { ocr.push(`[img ${i} http ${code}]`); continue; }
          ocr.push(`=== img ${i}\n${execFileSync('python3', [join(import.meta.dirname, 'ocr.py'), f], { encoding: 'utf8', timeout: 600000, maxBuffer: 16 << 20 })}`);
          result.detail.images += 1;
        } catch (e) { ocr.push(`[img ${i} error ${String(e).slice(0, 60)}]`); } finally { rmSync(f, { force: true }); }
        await wait(2000);
      }
      result.detail.ocrItems += 1;
    }
    writeFileSync(join(DETAIL, `${pd}.json`), JSON.stringify({ pd, at: new Date().toISOString(), status, imgCount: imgs.length, ocrDone: needOcr, vsip: d.vsipPdDtl ?? null, snips, ocr: ocr.join('\n') }));
  }
  result.detail.stop ||= todo.length > cfg.detailPerRun ? 'detail_cap' : 'done';
}
