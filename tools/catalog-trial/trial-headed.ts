// Headed-Chrome trial crawler (owner-approved 2026-11-05 15:45 KST).
// Real Chrome via Playwright persistent context, default UA, no proxy, no login.
// Images/media/fonts are never downloaded. Structured data first (meta/JSON-LD/
// embedded JSON via collectPage), text fallback kept as rawText for later
// DeepSeek extraction; no LLM call here. Random 4-8s pacing (robots Crawl-delay
// wins if larger). Stops a site on 403/429/challenge/empty page and writes a
// disabled flag that only a human removes. Empty pages are never saved.
// Usage: node trial-headed.ts [maxPages=10]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { collectPage } from '../catalog-extension/lib/collector.js';
import { detectBlocked } from '../catalog-extension/lib/blocked.js';
import { extractProducts } from '../catalog-extension/lib/extract.js';
import { parseRobots } from '../catalog-crawler-bot/robots.ts';

const RUN = process.env.ZARI_TRIAL_DIR ?? '/workspace/zari-fit-run';
const MAX = Number(process.argv[2] ?? 10);
const STORAGE = /수납|박스|정리함|바스켓|케이스|파일박스|리빙/;
export const pace = (crawlDelayS = 0, rnd = Math.random) => Math.max(crawlDelayS * 1000, 4000 + rnd() * 4000);
export function stopReason(status: number | null, text: string, title: string): string | null {
  if (status === 403 || status === 429) return `http_${status}`;
  if (/captcha|cf-challenge|just a moment|보안 확인|자동입력 방지|access denied/i.test(`${title}\n${text.slice(0, 4000)}`)) return 'challenge';
  if (text.replace(/\s+/g, '').length < 300) return 'empty_page';
  return null;
}
const flag = (site: string) => join(RUN, 'state', `${site}.disabled`);
function disable(site: string, reason: string) {
  mkdirSync(join(RUN, 'state'), { recursive: true });
  writeFileSync(flag(site), `${new Date().toISOString()} ${reason}\n사람이 확인 후 이 파일을 지워야 재개됩니다.\n`);
  console.log(`[${site}] STOP: ${reason}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function visit(page: Page, url: string) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(6000);
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  return { status: res?.status() ?? null, text, title: await page.title().catch(() => '') };
}

async function muji(page: Page, out: unknown[]) {
  const site = 'muji';
  if (existsSync(flag(site))) return console.log('[muji] disabled flag present, skip');
  const robots = await visit(page, 'https://mujikorea.co.kr/robots.txt');
  const rules = parseRobots(robots.text, robots.status);
  const delay = Number(/crawl-delay:\s*(\d+)/i.exec(robots.text)?.[1] ?? 0);
  await sleep(pace(delay));
  const rows: { product_id: number; product_name: string }[] = [];
  const onRes = async (r: any) => { if (/\/api\/bff\/api\/products\/search\/list/.test(r.url())) { try { rows.push(...(await r.json()).data.rows); } catch {} } };
  page.on('response', onRes);
  const list = await visit(page, 'https://mujikorea.co.kr/products/search?keyword=' + encodeURIComponent('수납박스'));
  page.off('response', onRes);
  const s = stopReason(list.status, list.text, list.title); if (s) return disable(site, s);
  const picks = rows.filter((r) => STORAGE.test(r.product_name)).slice(0, MAX);
  console.log(`[muji] robots ok=${JSON.stringify(rules).slice(0, 80)} candidates=${rows.length} picks=${picks.length}`);
  for (const r of picks) {
    await sleep(pace(delay));
    const url = `https://mujikorea.co.kr/products/view/${r.product_id}`;
    const v = await visit(page, url);
    const why = stopReason(v.status, v.text, v.title); if (why) return disable(site, `${why} ${url}`);
    const snap = await page.evaluate(collectPage);
    if (detectBlocked(snap, new URL(url).pathname)) return disable(site, `blocked ${url}`);
    const got = extractProducts(snap, url);
    console.log(`[muji] ${url} items=${got.items.length} ${got.error ?? ''}`);
    out.push(...got.items);
  }
}

async function main() {
  const ctx = await chromium.launchPersistentContext(join(RUN, 'chrome-profile'), { headless: false });
  await ctx.route('**/*', (r) => (['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()));
  const page = await ctx.newPage();
  const items: unknown[] = [];
  try { await muji(page, items); } finally { await ctx.close(); }
  if (!existsSync(flag('daiso'))) disable('daiso', 'empty_render_real_chrome: search and product pages render no product data (2026-11-05)');
  writeFileSync(join(RUN, 'real-items.json'), JSON.stringify(items, null, 1));
  console.log(`items=${items.length}`);
}
if (import.meta.main) await main();
