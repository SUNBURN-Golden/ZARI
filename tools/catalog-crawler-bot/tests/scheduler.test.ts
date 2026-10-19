import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../config.ts';
import { runCrawl } from '../scheduler.ts';
import { acquireLock, loadStore, saveStore } from '../state.ts';
import { BILLY, FAST, IKEA_LISTING, KALLAX, T0, fakeClock, fakeExtension, fixture, ikeaPages, tempPaths } from './helpers.ts';
import type { Page } from './helpers.ts';

const OHOU_ROBOTS = 'https://ohou.se/robots.txt';
const OHOU_LISTING = 'https://ohou.se/store/category';
const HOUR = 3600000;
const DAY = 24 * HOUR;

function seed(paths: ReturnType<typeof tempPaths>, ...seeds: string[]) {
  const store = loadStore(paths);
  store.seeds = seeds;
  saveStore(paths, store);
}

async function run(paths: ReturnType<typeof tempPaths>, pages: Record<string, Page>, clock = fakeClock(), config = FAST) {
  const channel = fakeExtension(pages, clock);
  const logs: string[] = [];
  const summary = await runCrawl({ paths, config, channel, clock, log: (line) => logs.push(line) });
  return { summary, channel, logs, clock };
}

describe('discovery', () => {
  it('walks listing → products, normalizes and deduplicates, skips denied and off-site links', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const { summary, channel } = await run(paths, ikeaPages());
    expect(summary.reason).toBe('queue_empty');
    const urls = channel.requests.map((r) => r.url);
    expect(urls).toEqual(['https://www.ikea.com/robots.txt', IKEA_LISTING, KALLAX, BILLY]);
    expect(urls.some((u) => /search|compare|sort=|\/us\/en\//.test(u))).toBe(false);
    const store = loadStore(paths);
    expect(Object.keys(store.items)).toEqual(['crawl:ikea:80275887', 'crawl:ikea:00263850']);
    expect(store.queue.filter((e) => e.kind === 'product')).toHaveLength(2);
  });

  it('a robots-disallowed path never enters a request', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const pages = ikeaPages();
    pages['https://www.ikea.com/robots.txt'] = { text: 'User-agent: *\nDisallow: /kr/ko/p/billy\n' };
    const { channel } = await run(paths, pages);
    expect(channel.requests.map((r) => r.url)).not.toContain(BILLY);
    expect(loadStore(paths).queue.find((e) => e.url === BILLY)).toMatchObject({ state: 'skipped', reason: 'robots_disallow' });
  });

  it('refuses seeds and links outside the allowlist at the queue', async () => {
    const paths = tempPaths();
    seed(paths, 'https://evil.example/productions/1/selling', 'http://ohou.se/productions/2/selling');
    const { channel, summary } = await run(paths, {});
    expect(channel.requests).toEqual([]);
    expect(summary.reason).toBe('queue_empty');
  });
});

describe('robots.txt fails closed', () => {
  it.each([
    ['html error page', { text: fixture('robots', 'ohou-html-error.html') }],
    ['http 403', { text: 'Access Denied', status: 403 }],
    ['unreachable', undefined],
  ])('%s closes the host and visits nothing', async (_label, robotsPage) => {
    const paths = tempPaths();
    seed(paths, OHOU_LISTING);
    const pages: Record<string, Page> = { [OHOU_LISTING]: { html: fixture('ohou', 'listing.html') } };
    if (robotsPage) pages[OHOU_ROBOTS] = robotsPage;
    const { channel, summary } = await run(paths, pages);
    expect(channel.requests.map((r) => r.url)).toEqual([OHOU_ROBOTS]);
    expect(summary.reason).toBe('hosts_paused');
    expect(loadStore(paths).hosts['ohou.se']?.disabled?.reason).toMatch(/^robots_/);
  });
});

describe('pacing and caps', () => {
  it('keeps the minimum interval and Crawl-delay per host', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const { channel } = await run(paths, ikeaPages());
    const gaps = channel.requests.slice(1).map((r, i) => r.at - channel.requests[i]!.at);
    expect(gaps.length).toBe(3);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(12000 + 2000); // Crawl-delay 12 s + jitter (0.5 × 4 s)
  });

  it('without Crawl-delay uses the configured interval plus jitter', async () => {
    const paths = tempPaths();
    seed(paths, 'https://www.29cm.co.kr/products/3001', 'https://www.29cm.co.kr/products/3002');
    const pages: Record<string, Page> = {
      'https://www.29cm.co.kr/robots.txt': { text: fixture('robots', '29cm.txt') },
      'https://www.29cm.co.kr/products/3001': { html: fixture('29cm', 'product.html') },
      'https://www.29cm.co.kr/products/3002': { html: fixture('29cm', 'product-unlabeled.html') },
    };
    const { channel } = await run(paths, pages);
    const gaps = channel.requests.slice(1).map((r, i) => r.at - channel.requests[i]!.at);
    expect(gaps.every((gap) => gap >= 8000 + 2000)).toBe(true);
  });

  it('a config file cannot go below the hard floor or above the hard caps', () => {
    const config = normalizeConfig({ minIntervalMs: 1, pagesPerRun: 1e9, dailyPerHost: 1e9, blockCooldownHours: 0, recrawlDays: 0 });
    expect(config).toMatchObject({ minIntervalMs: 3000, pagesPerRun: 500, dailyPerHost: 1000, blockCooldownHours: 6, recrawlDays: 7 });
  });

  it('stops at the per-run page cap and resumes where it left off', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const config = normalizeConfig({ pagesPerRun: 2 });
    const first = await run(paths, ikeaPages(), fakeClock(), config);
    expect(first.summary).toMatchObject({ reason: 'run_cap', pages: 2 });
    const second = await run(paths, ikeaPages(), fakeClock(T0 + 1 * HOUR), config);
    expect(second.channel.requests.map((r) => r.url)).not.toContain(IKEA_LISTING);
    expect(second.channel.requests.map((r) => r.url)).not.toContain(KALLAX);
    expect(new Set([...first.channel.requests, ...second.channel.requests].filter((r) => r.kind !== 'robots').map((r) => r.url)).size).toBe(3);
  });

  it('stops a host at the daily cap and starts counting again the next day', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const config = normalizeConfig({ dailyPerHost: 3 });
    const day1 = await run(paths, ikeaPages(), fakeClock(), config);
    expect(day1.channel.requests).toHaveLength(3);
    expect(day1.summary.reason).toBe('hosts_paused');
    const day2 = await run(paths, ikeaPages(), fakeClock(T0 + DAY + HOUR), config);
    expect(day2.channel.requests.length).toBeGreaterThan(0);
  });
});

describe('block signals stop the host immediately and are never worked around', () => {
  const product = 'https://www.29cm.co.kr/products/3001';
  const pages = (page: Page): Record<string, Page> => ({
    'https://www.29cm.co.kr/robots.txt': { text: fixture('robots', '29cm.txt') },
    [product]: page,
    'https://www.29cm.co.kr/products/3002': { html: fixture('29cm', 'product.html') },
  });

  it.each([
    ['429', { html: fixture('29cm', 'product.html'), status: 429 }, 'http_429'],
    ['403', { html: fixture('29cm', 'product.html'), status: 403 }, 'http_403'],
    ['captcha', { html: fixture('ohou', 'product-captcha.html') }, 'captcha'],
    ['login', { html: '<title>로그인</title><h1>로그인</h1><input type="password">' }, 'login_required'],
  ])('%s: no more requests to the host, cooldown persists', async (_label, page, reason) => {
    const paths = tempPaths();
    seed(paths, product, 'https://www.29cm.co.kr/products/3002');
    const { channel, summary, logs } = await run(paths, pages(page as Page));
    expect(channel.requests.filter((r) => r.kind !== 'robots').map((r) => r.url)).toEqual([product]);
    expect(summary.blocked).toEqual(['www.29cm.co.kr']);
    expect(logs.join('\n')).toContain(reason);
    const host = loadStore(paths).hosts['www.29cm.co.kr']!;
    expect(Date.parse(host.cooldownUntil!) - T0).toBeGreaterThanOrEqual(6 * HOUR);
    expect(host.consecutiveBlocks).toBe(1);
    expect(host.disabled).toBeNull();
    expect(Object.keys(loadStore(paths).items)).toEqual([]);
  });

  it('the cooldown holds across runs; a second consecutive block doubles it and disables the host until resume', async () => {
    const paths = tempPaths();
    seed(paths, product);
    const blocked = pages({ html: fixture('29cm', 'product.html'), status: 429 });
    await run(paths, blocked);
    // 5 h later: still cooling down → not a single request.
    const early = await run(paths, blocked, fakeClock(T0 + 5 * HOUR));
    expect(early.channel.requests).toEqual([]);
    expect(early.summary.reason).toBe('hosts_paused');
    // 7 h later: one probe request, blocked again → disabled, 12 h cooldown.
    const second = await run(paths, blocked, fakeClock(T0 + 7 * HOUR));
    expect(second.channel.requests.filter((r) => r.kind !== 'robots')).toHaveLength(1);
    const host = loadStore(paths).hosts['www.29cm.co.kr']!;
    expect(host.consecutiveBlocks).toBe(2);
    expect(host.disabled?.reason).toMatch(/^repeated_block/);
    expect(Date.parse(host.cooldownUntil!) - (T0 + 7 * HOUR)).toBe(12 * HOUR);
    // Weeks later: still nothing without an explicit resume.
    const late = await run(paths, pages({ html: fixture('29cm', 'product.html') }), fakeClock(T0 + 30 * DAY));
    expect(late.channel.requests).toEqual([]);
  });

  it('a successful page resets the consecutive-block count', async () => {
    const paths = tempPaths();
    seed(paths, product);
    await run(paths, pages({ html: fixture('29cm', 'product.html'), status: 429 }));
    await run(paths, pages({ html: fixture('29cm', 'product.html') }), fakeClock(T0 + 7 * HOUR));
    expect(loadStore(paths).hosts['www.29cm.co.kr']).toMatchObject({ consecutiveBlocks: 0, cooldownUntil: null, disabled: null });
  });
});

describe('resumable queue, re-crawl interval, kill switch, lock', () => {
  it('STOP is checked before any work', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    writeFileSync(paths.stop, 'x');
    const { channel, summary } = await run(paths, ikeaPages());
    expect(summary.reason).toBe('stop_file');
    expect(channel.requests).toEqual([]);
  });

  it('STOP created mid-run stops before the next job; the next run continues without revisiting', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const clock = fakeClock();
    const channel = fakeExtension(ikeaPages(), clock, (_job, count) => {
      if (count === 3) writeFileSync(paths.stop, 'x'); // after listing, during the first product
    });
    const summary = await runCrawl({ paths, config: FAST, channel, clock, log: () => {} });
    expect(summary.reason).toBe('stop_file');
    expect(channel.requests).toHaveLength(3);
    const { unlinkSync } = await import('node:fs');
    unlinkSync(paths.stop);
    const next = await run(paths, ikeaPages(), fakeClock(T0 + HOUR));
    const all = [...channel.requests, ...next.channel.requests].filter((r) => r.kind !== 'robots').map((r) => r.url);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(3);
  });

  it('re-crawls only after the interval', async () => {
    const paths = tempPaths();
    seed(paths, KALLAX);
    await run(paths, ikeaPages());
    const soon = await run(paths, ikeaPages(), fakeClock(T0 + 29 * DAY));
    expect(soon.channel.requests.filter((r) => r.kind === 'product')).toEqual([]);
    const later = await run(paths, ikeaPages(), fakeClock(T0 + 31 * DAY));
    expect(later.channel.requests.filter((r) => r.kind === 'product').map((r) => r.url)).toEqual([KALLAX]);
  });

  it('a closed Chrome window ends the run', async () => {
    const paths = tempPaths();
    seed(paths, IKEA_LISTING);
    const clock = fakeClock();
    const channel = fakeExtension(ikeaPages(), clock, (_job, count) => {
      if (count === 2) channel.drop();
    });
    const summary = await runCrawl({ paths, config: FAST, channel, clock, log: () => {} });
    expect(summary.reason).toBe('chrome_closed');
  });

  it('allows one instance; a dead owner is taken over', () => {
    const paths = tempPaths();
    const release = acquireLock(paths);
    expect(() => acquireLock(paths)).toThrow('already_running');
    release();
    writeFileSync(paths.lock, '2147483646');
    const takeover = acquireLock(paths);
    takeover();
  });

  it('a failed navigation backs off and gives up after three attempts', async () => {
    const paths = tempPaths();
    seed(paths, KALLAX);
    const pages = { 'https://www.ikea.com/robots.txt': { text: fixture('robots', 'ikea.txt') } };
    for (let i = 0; i < 3; i += 1) await run(paths, pages, fakeClock(T0 + i * DAY));
    expect(loadStore(paths).queue[0]).toMatchObject({ state: 'failed', attempts: 3 });
  });
});
