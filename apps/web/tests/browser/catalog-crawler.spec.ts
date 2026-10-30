import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectPage } from '../../../../tools/catalog-extension/lib/collector.js';
import { detectBlocked } from '../../../../tools/catalog-extension/lib/blocked.js';
import { extractListing, extractProducts } from '../../../../tools/catalog-extension/lib/extract.js';
import { fixture, snapshotFromHtml } from '../../../../tools/catalog-extension/tests/html-snapshot.mjs';

/**
 * z-catalog-crawler on a real browser, real IndexedDB, real Worker/WASM.
 * No live site is contacted anywhere: the extension collector runs against
 * synthetic fixture HTML, and the app reads a local file.
 */
const GOLDEN = join(process.cwd(), 'tests/fixtures/catalog-collection/golden/bundle.json');
const golden = readFileSync(GOLDEN, 'utf8');

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

function watchRequests(page: Page, seen: { url: string; method: string; type: string }[]) {
  page.on('request', (request) => seen.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
}

const bundleFile = (text: string, name = 'bundle.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) });

test.describe('extension collector on a real DOM', () => {
  const products: [string, string][] = [
    ['ohou/product.html', 'https://ohou.se/productions/1001/selling'],
    ['ohou/product-options.html', 'https://ohou.se/productions/1003/selling'],
    ['29cm/product.html', 'https://www.29cm.co.kr/products/3001'],
    ['29cm/product-unlabeled.html', 'https://www.29cm.co.kr/products/3002'],
    ['ikea/product.html', 'https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/'],
    ['ikea/product-inner-outer.html', 'https://www.ikea.com/kr/ko/p/samla-box-12345678/'],
  ];

  test('collectPage yields the same items as the node-side snapshot, with no image data and no request', async ({ page }) => {
    const seen: { url: string; method: string; type: string }[] = [];
    for (const [file, url] of products) {
      const html = fixture(...file.split('/'));
      await page.setContent(html);
      watchRequests(page, seen);
      const snapshot = await page.evaluate(collectPage);
      const now = Date.UTC(2026, 9, 15);
      expect(extractProducts(snapshot, url, now), file).toEqual(extractProducts(snapshotFromHtml(html, url), url, now));
      expect(JSON.stringify(snapshot), file).not.toMatch(/\.jpg|img\.example|"image"/i);
    }
    expect(seen).toEqual([]);
  });

  test('listing links and block pages are recognised from the real DOM', async ({ page }) => {
    await page.setContent(fixture('ikea', 'listing.html'));
    const listing = await page.evaluate(collectPage);
    expect(extractListing(listing, 'https://www.ikea.com/kr/ko/cat/bookcases-10382/')).toEqual([
      'https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/',
      'https://www.ikea.com/kr/ko/p/billy-bookcase-white-00263850/',
    ]);
    await page.setContent(fixture('ohou', 'product-captcha.html'));
    expect(detectBlocked(await page.evaluate(collectPage))).toBe('captcha');
  });
});

test('importing a bundle file draws items from W/D/H only, saves, reopens, with zero image or third-party requests', async ({ page, context, browserName }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  const seen: { url: string; method: string; type: string }[] = [];
  collectErrors(page, errors);
  watchRequests(page, seen);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/catalog');
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');
  await expect(page.getByTestId('bundle-repository-state')).toHaveAttribute('data-enabled', 'false');
  const before = await page.getByTestId('catalog-list').innerText();

  await page.getByTestId('bundle-file').setInputFiles(bundleFile(golden));
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('bundle-status')).toContainText('9개 항목');
  await expect(page.getByTestId('bundle-items').locator('> li')).toHaveCount(9);
  // Nothing is stored until the user confirms.
  expect(await page.getByTestId('catalog-list').innerText()).toBe(before);

  // Measured items: a plan rectangle in the W:D ratio of the page text (80 : 30).
  const plan = page.getByTestId('shape-plan-crawl:ohou:1001').locator('rect.shape-body');
  const w = Number(await plan.getAttribute('data-w'));
  const d = Number(await plan.getAttribute('data-d'));
  expect(w / d).toBeCloseTo(80 / 30, 1);
  await expect(page.getByTestId('shape-box-crawl:ohou:1001')).toBeVisible();
  await expect(page.getByTestId('shape-front-crawl:ohou:1001').locator('.shape-hint line')).toHaveCount(4); // shelf hint
  await expect(page.getByTestId('shape-front-crawl:29cm:3001').locator('.shape-hint line')).toHaveCount(1); // cabinet door split
  // Unmeasured items say so and draw nothing to scale.
  for (const id of ['crawl:29cm:3002', 'crawl:29cm:3005', 'crawl:ikea:23456789']) {
    await expect(page.getByTestId(`bundle-item-${id}`)).toHaveAttribute('data-measured', 'false');
    await expect(page.getByTestId(`shape-${id}`)).toContainText('치수 미확인');
    await expect(page.getByTestId(`shape-plan-${id}`)).toHaveCount(0);
  }
  await expect(page.getByTestId('bundle-items')).toContainText('미확인');

  // Keyboard: focus the save button and press Enter.
  await page.getByTestId('bundle-save').focus();
  await expect(page.getByTestId('bundle-save')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'saved', { timeout: 30_000 });
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');
  await expect.poll(async () => (await page.getByTestId('catalog-list').locator('> li').count())).toBe(2);

  // Reload: the cached catalog is still there.
  await page.reload();
  await expect.poll(async () => page.getByTestId('catalog-list').locator('> li').count(), { timeout: 30_000 }).toBe(2);

  // Offline reopen from the cache.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('zari-shell-meta')).match('active.json')) != null || (await (await caches.open('zari-shell-meta')).match('staged.json')) != null))
    .toBe(true);
  const url = page.url();
  if (browserName === 'webkit') {
    // C11: WPE offline navigation fails internally, as already qualified in
    // privacy-offline/spatial3d. Verify every cached asset and retain the
    // fresh-tab persisted-catalog assertion below; offline rendering is unverified.
    const missing = await page.evaluate(async () => {
      const scope = new URL('.', navigator.serviceWorker.controller!.scriptURL).href;
      const meta = await caches.open('zari-shell-meta');
      const hit = (await meta.match('staged.json')) ?? (await meta.match('active.json'));
      if (!hit) return ['<no manifest>'];
      const record = (await hit.json()) as { buildId: string; assets: string[] };
      const cache = await caches.open(`zari-build-${record.buildId}`);
      const absent: string[] = [];
      for (const asset of record.assets)
        if (!(await cache.match(new URL(asset, scope).href))) absent.push(asset);
      return absent;
    });
    expect(missing).toEqual([]);
  } else await context.setOffline(true);
  const offline = await context.newPage();
  collectErrors(offline, errors);
  await offline.goto(url);
  await expect.poll(async () => offline.getByTestId('catalog-list').locator('> li').count(), { timeout: 60_000 }).toBe(2);
  await offline.close();
  await context.setOffline(false);

  // No catalog image request, no third-party request, only same-origin GETs.
  const origin = new URL(url).origin;
  const imageRequests = seen.filter((r) => r.type === 'image' || r.type === 'media');
  expect(imageRequests.filter((r) => new URL(r.url).pathname !== '/favicon.svg')).toEqual([]);
  expect(new Set(imageRequests.map((r) => new URL(r.url).pathname))).toEqual(
    new Set(imageRequests.length > 0 ? ['/favicon.svg'] : []),
  );
  expect(seen.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'))).toEqual([]);
  expect(seen.filter((r) => r.method !== 'GET')).toEqual([]);
  expect(errors).toEqual([]);
});

test('a tampered, image-bearing or non-JSON bundle is refused with its reason and the stored catalogs stay as they were', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/#/catalog');
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');
  const before = await page.getByTestId('catalog-list').innerText();
  const tamper = golden.replace('모듈 5단 선반', '변조된 선반');
  const withImage = golden.replace('"brand":"IKEA"', '"brand":"IKEA","thumbnail":"x"');
  const cases: [string, string, string][] = [
    ['checksum', tamper, 'checksum_mismatch'],
    ['image field', withImage, 'image_refused'],
    ['not json', 'nope', 'invalid_json'],
  ];
  for (const [label, text, code] of cases) {
    await page.getByTestId('bundle-file').setInputFiles(bundleFile(text));
    await expect(page.getByTestId('bundle-status'), label).toHaveAttribute('data-phase', 'quarantine', { timeout: 60_000 });
    await expect(page.getByTestId('bundle-codes').locator(`[data-code="${code}"]`), label).toBeVisible();
    await expect(page.getByTestId('bundle-save'), label).toHaveCount(0);
    await expect(page.getByTestId('bundle-items'), label).toHaveCount(0);
    expect(await page.getByTestId('catalog-list').innerText(), label).toBe(before);
  }
  expect(errors).toEqual([]);
});

test('a saved crawled catalog is selectable for a project and listed as an owned-copy source, always as unconfirmed', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/#/catalog');
  await page.getByTestId('bundle-file').setInputFiles(bundleFile(golden));
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
  await page.getByTestId('bundle-save').click();
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'saved', { timeout: 30_000 });

  // Owned library: crawled variants appear by product name with the unconfirmed marker.
  await expect(page.getByTestId('owned-variant-pick').locator('option', { hasText: '모듈 5단 선반' })).toHaveCount(1);
  await expect(page.getByTestId('owned-variant-pick').locator('option', { hasText: '수집·미확인' }).first()).toBeAttached();

  // A project can pin it and the Worker still activates it.
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  const select = page.getByTestId('catalog-pin-select');
  const value = await select.locator('option', { hasText: '수집·치수만·미확인' }).getAttribute('value');
  expect(value).toBeTruthy();
  await select.selectOption(value!);
  await expect(page.getByTestId('catalog-crawled-note')).toContainText('미확인');
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  expect(errors).toEqual([]);
});

test('copying a measured crawled variant into an owned container registers and shows its basis', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/#/catalog');
  await page.getByTestId('bundle-file').setInputFiles(bundleFile(golden));
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
  await page.getByTestId('bundle-save').click();
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'saved', { timeout: 30_000 });

  // Pick the measured SAMLA variant, enter only identity/quantity, register.
  const pick = page.getByTestId('owned-variant-pick');
  const value = await pick.locator('option[value$=":crawl:ikea:12345678"]').getAttribute('value');
  expect(value).toBeTruthy();
  await pick.selectOption(value!);
  await page.getByTestId('owned-id').fill('own-samla');
  await page.getByTestId('owned-quantity-owned').fill('1');
  await page.getByTestId('owned-quantity-available').fill('1');
  await page.getByTestId('owned-register').click();
  await expect(page.getByTestId('owned-list')).toContainText('own-samla', { timeout: 30_000 });
  await expect(page.getByTestId('owned-list')).toContainText('옵션 crawl:ikea:12345678 기반');
  await expect(page.getByTestId('owned-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('narrow, forced-colors view keeps the unknown marker and has no horizontal scroll; axe finds no violation', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/catalog');
  await page.getByTestId('bundle-file').setInputFiles(bundleFile(golden));
  await expect(page.getByTestId('bundle-status')).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('shape-crawl:29cm:3002')).toContainText('치수 미확인');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.emulateMedia({ forcedColors: 'none' });
  const results = await new AxeBuilder({ page }).include('[data-testid="bundle-panel"]').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(errors).toEqual([]);
});
