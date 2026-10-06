import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * ZARI-SPATIAL-005 read-only cutaway. Real browser, IndexedDB, and WASM.
 * Draft interaction checks only — not an approved visual baseline.
 */

const MARKER = 'zari-spatial3d-module';

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
}

async function openPlan(page: Page) {
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', { timeout: 60_000 });
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  let chosen = 0;
  for (let i = 0; i < count; i += 1) {
    await cards.nth(i).click();
    if ((await page.locator('tr', { hasText: /배치 [2-9]곳/ }).count()) > 0) {
      chosen = i;
      break;
    }
    if ((await cards.nth(i).innerText()).includes('구매 포함')) chosen = i;
  }
  await cards.nth(chosen).click();
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
}

async function scriptsWithMarker(page: Page): Promise<string[]> {
  return page.evaluate(async (marker) => {
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.js'));
    const hits: string[] = [];
    for (const url of urls) {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes(marker)) hits.push(url);
    }
    return hits;
  }, MARKER);
}

function note(testInfo: TestInfo, type: string, description: string) {
  testInfo.annotations.push({ type, description });
  console.log(`[spatial3d] ${testInfo.project.name} ${type}: ${description}`);
}

async function waitForStagedBuild(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await page.waitForFunction(async () => {
    const meta = await caches.open('zari-shell-meta');
    return (await meta.match('staged.json')) != null || (await meta.match('active.json')) != null;
  });
}

test('3D stays unloaded until requested, then shares selection with 2D, BOM, and steps', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  await openPlan(page);
  expect(await page.getByTestId('spatial-view').count()).toBe(0);
  const preloaded = await scriptsWithMarker(page);
  expect(preloaded).toEqual([]);
  const html = await page.content();
  expect(html.includes(MARKER)).toBe(false);

  const pick = page.locator('[data-testid^="diagram-pick-"]').first();
  await pick.click();
  const selectedBefore = await page.getByTestId('inspector-name').innerText();
  const requests = await page.getByTestId('plan-workspace').getAttribute('data-spatial-requests');
  const revision = await page.getByTestId('plan-workspace').getAttribute('data-project-revision');
  const bom = page.locator('[data-testid^="bom-focus-"]').first();
  if ((await bom.count()) > 0) await bom.click();

  const started = Date.now();
  await page.getByTestId('view-spatial').click();
  const view = page.getByTestId('spatial-view');
  const fallback = page.getByTestId('spatial-fallback');
  await expect(view.or(fallback)).toBeVisible({ timeout: 20_000 });
  const loaded = await scriptsWithMarker(page);
  const chunkUrl = loaded[0];
  expect(chunkUrl).toBeTruthy();
  note(testInfo, 'spatial-chunk', loaded.join(' '));

  if ((await fallback.count()) > 0) {
    note(testInfo, 'webgl', `fallback ${await fallback.getAttribute('data-reason')}`);
    await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
    await expect(page.getByTestId('diagram-text-list')).toBeVisible();
    await page.getByTestId('view-front').click();
    await expect(page.getByTestId('plan-diagram-front')).toBeVisible();
    await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-project-revision', revision ?? '');
    expect(errors).toEqual([]);
    return;
  }

  await expect(view).toHaveAttribute('data-status', 'ready');
  const readyMs = Number(await view.getAttribute('data-ready-ms'));
  const clickMs = Date.now() - started;
  const bytes = await page.evaluate(async (url) => (await fetch(url)).arrayBuffer().then((body) => body.byteLength), chunkUrl ?? '');
  note(testInfo, '3d-ready', `click ${clickMs}ms module ${readyMs}ms chunk ${bytes}B frame ${await view.getAttribute('data-frame-ms')}ms geometries ${await view.getAttribute('data-geometries')}`);
  await expect(page.getByTestId('inspector-name')).toHaveText(selectedBefore);
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-spatial-requests', requests ?? '');
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-project-revision', revision ?? '');

  const agreement = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid="plan-diagram-top-plane"] rect[data-target]')];
    const labels = [...document.querySelectorAll('.spatial-label')];
    let hits = 0;
    for (const label of labels) {
      const rect = rects.find((node) => node.getAttribute('data-target') === label.getAttribute('data-target'));
      if (!rect) continue;
      const min = (label.getAttribute('data-min') ?? '').split(',').map(Number);
      const max = (label.getAttribute('data-max') ?? '').split(',').map(Number);
      const x = Number(rect.getAttribute('x'));
      const y = Number(rect.getAttribute('y'));
      const width = Number(rect.getAttribute('width'));
      const height = Number(rect.getAttribute('height'));
      if (min[0] === x && min[1] === y && (max[0] ?? 0) - (min[0] ?? 0) === width && (max[1] ?? 0) - (min[1] ?? 0) === height) hits += 1;
    }
    return { labels: labels.length, hits };
  });
  note(testInfo, '2d-3d', `${agreement.hits}/${agreement.labels} labels match top rectangles`);
  expect(agreement.labels).toBeGreaterThan(0);
  expect(agreement.hits).toBeGreaterThan(0);

  const beforeTop = await view.getAttribute('data-renders');
  await page.getByTestId('spatial-preset-top').click();
  await expect(view).toHaveAttribute('data-preset', 'top');
  await expect.poll(async () => view.getAttribute('data-renders')).not.toBe(beforeTop);
  await view.scrollIntoViewIfNeeded();
  const placement = page.locator('.spatial-label[data-target^="placement:"]').first();
  await expect(placement).toBeVisible();
  const placementKey = await placement.getAttribute('data-target');
  const host = await view.boundingBox();
  expect(host).not.toBeNull();
  if (host && placementKey) {
    await page.mouse.click(host.x + Number(await placement.getAttribute('data-x')), host.y + Number(await placement.getAttribute('data-y')));
    await expect(page.getByTestId('spatial-live')).toContainText(placementKey);
  }
  await expect(page.getByTestId('spatial-interior')).toBeEnabled();
  const beforeInterior = await view.getAttribute('data-renders');
  await page.getByTestId('spatial-interior').click();
  await expect(view).toHaveAttribute('data-interior', 'true');
  await expect.poll(async () => view.getAttribute('data-renders')).not.toBe(beforeInterior);
  const instance = page.locator('.spatial-label[data-target^="instance:"]').first();
  await expect(instance).toBeVisible();
  const instanceKey = await instance.getAttribute('data-target');
  const hostAgain = await view.boundingBox();
  expect(hostAgain).not.toBeNull();
  if (hostAgain && instanceKey) {
    await page.mouse.click(
      hostAgain.x + Number(await instance.getAttribute('data-x')),
      hostAgain.y + Number(await instance.getAttribute('data-y')),
    );
    await expect(page.getByTestId('spatial-live')).toContainText(instanceKey);
  }
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-project-revision', revision ?? '');

  await page.waitForTimeout(400);
  const renders = await view.getAttribute('data-renders');
  await page.waitForTimeout(5_000);
  expect(await view.getAttribute('data-renders')).toBe(renders);
  note(testInfo, 'idle', `renders stayed ${renders} for 5s`);

  await page.getByTestId('spatial-preset-front').click();
  await expect(view).toHaveAttribute('data-preset', 'front');
  const rendersBeforeCut = await view.getAttribute('data-renders');
  const cutStarted = Date.now();
  await page.getByTestId('spatial-hide-front').click();
  await expect.poll(async () => view.getAttribute('data-renders')).not.toBe(rendersBeforeCut);
  note(testInfo, 'cutaway-frame', `click-to-frame ${Date.now() - cutStarted}ms draw ${await view.getAttribute('data-frame-ms')}ms`);
  await expect(view).toHaveAttribute('data-hide-front', 'false');
  await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-spatial-requests', requests ?? '');
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-project-revision', revision ?? '');

  const multi = page.locator('tr', { hasText: /배치 [2-9]곳/ });
  if ((await multi.count()) > 0) {
    await multi.first().getByRole('button', { name: '도면에서 보기' }).click();
    const places = Number((await multi.first().innerText()).match(/배치 (\d+)곳/)?.[1] ?? '0');
    expect(await page.locator('.spatial-label[data-focus="true"]').count()).toBeGreaterThanOrEqual(Math.min(places, 2));
    note(testInfo, 'bom-multi', `${places} placements, focused labels ${await page.locator('.spatial-label[data-focus="true"]').count()}`);
  } else {
    const focus = page.locator('[data-testid^="bom-focus-"]').first();
    if ((await focus.count()) > 0) {
      await focus.click();
      await expect(page.locator('.spatial-label[data-focus="true"]').first()).toBeVisible();
      note(testInfo, 'bom-multi', `sample plan has no multi-placement line; focused labels ${await page.locator('.spatial-label[data-focus="true"]').count()}`);
    }
  }
  const check = page.locator('[data-testid^="check-focus-"]').first();
  if ((await check.count()) > 0) await check.click();

  await page.getByTestId('view-top').click();
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await expect(page.getByTestId('inspector-name')).toBeVisible();
  const counts: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    await page.getByTestId('view-spatial').click();
    await expect(view).toHaveAttribute('data-status', 'ready');
    expect(await page.evaluate(() => document.documentElement.dataset.spatialLive)).toBe('1');
    counts.push(Number(await view.getAttribute('data-geometries')));
    await page.getByTestId('view-top').click();
    await expect(view).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.dataset.spatialLive)).toBe('1');
  }
  expect(new Set(counts).size).toBe(1);
  expect(counts[0]).toBeGreaterThan(0);
  note(testInfo, 'cycles', `20 switches, geometries ${counts[0]}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('close-inspector')).toBeVisible();
  await page.getByTestId('close-inspector').click();
  const spatialButton = page.getByTestId('view-spatial');
  await spatialButton.scrollIntoViewIfNeeded();
  expect((await spatialButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await spatialButton.click();
  await expect(view).toHaveAttribute('data-status', 'ready');
  const button = page.getByTestId('spatial-preset-oblique');
  await button.scrollIntoViewIfNeeded();
  expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('spatial-forced')).toBeVisible();
  await expect(page.getByTestId('diagram-text-list')).toBeVisible();
  await page.getByTestId('spatial-canvas').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('spatial-live')).toContainText('선택됨');

  const beforeLoss = [...errors];
  await page.getByTestId('spatial-canvas').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(page.getByTestId('spatial-fallback')).toHaveAttribute('data-reason', 'context_lost');
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  if (await page.getByTestId('close-inspector').isVisible()) await page.getByTestId('close-inspector').click();
  await page.locator('[data-testid^="diagram-pick-"]').nth(1).click();
  await expect(page.getByTestId('inspector-name')).toBeVisible();
  if (await page.getByTestId('close-inspector').isVisible()) await page.getByTestId('close-inspector').click();
  await page.getByTestId('spatial-use-2d').click();
  await expect(page.getByTestId('view-top')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-project-revision', revision ?? '');
  expect(await page.evaluate(() => document.documentElement.dataset.spatialLive ?? '0')).toBe('0');
  expect(beforeLoss).toEqual([]);
  note(testInfo, 'context-lost-console', errors.slice(beforeLoss.length).join(' | ') || 'none');
});

test('disabled WebGL keeps plan, BOM, and 2D controls', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype;
    const original = prototype.getContext;
    prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (String(type).includes('webgl')) return null;
      return original.apply(this, [type, ...args] as never);
    } as typeof prototype.getContext;
  });
  await createProject(page);
  await openPlan(page);
  const revision = await page.getByTestId('plan-workspace').getAttribute('data-project-revision');
  await page.getByTestId('view-spatial').click();
  await expect(page.getByTestId('spatial-fallback')).toHaveAttribute('data-reason', 'webgl_unavailable');
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await expect(page.getByTestId('diagram-text-list')).toBeVisible();
  await page.locator('[data-testid^="diagram-pick-"]').first().click();
  await expect(page.getByTestId('inspector-name')).toBeVisible();
  await page.getByTestId('view-front').click();
  await expect(page.getByTestId('plan-diagram-front')).toBeVisible();
  await page.getByTestId('zoom-in').click();
  await expect(page.getByTestId('bom-table').or(page.getByTestId('no-purchase'))).toBeVisible();
  await expect(page.getByTestId('plan-workspace')).toHaveAttribute('data-project-revision', revision ?? '');
  expect(errors).toEqual([]);
});

test.describe('missing spatial chunk', () => {
  test.use({ serviceWorkers: 'block' });

test('a missing spatial chunk explains itself and leaves 2D usable', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.route('**/*SpatialView*', (route) => route.abort());
  await page.route('**/*spatial3d*', (route) => route.abort());
  await createProject(page);
  await openPlan(page);
  await page.getByTestId('view-spatial').click();
  await expect(page.getByTestId('spatial-fallback')).toHaveAttribute('data-reason', 'import', { timeout: 20_000 });
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await page.getByTestId('spatial-use-2d').click();
  await expect(page.getByTestId('view-top')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-testid^="diagram-pick-"]').first().click();
  await expect(page.getByTestId('inspector-name')).toBeVisible();
  const noise = errors.filter(
    (error) =>
      !/abort|failed to fetch|import|chunk|dynamically imported|error loading|ERR_FAILED|Failed to load resource|JSHandle@object/i.test(
        error,
      ),
  );
  expect(noise).toEqual([]);
});
});

test('an offline revisit can open 3D from the local build cache', async ({ page, context, browserName }, testInfo) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await expect(page.getByTestId('project-list')).toBeVisible();
  await waitForStagedBuild(page);
  await page.reload();
  await expect(page.getByTestId('project-list')).toBeVisible();
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await openPlan(page);
  const cached = await page.evaluate(async (marker) => {
    const scope = navigator.serviceWorker?.controller?.scriptURL
      ? new URL('.', navigator.serviceWorker.controller.scriptURL).href
      : location.href;
    const meta = await caches.open('zari-shell-meta');
    const active = await meta.match('active.json');
    if (!active) return { error: 'no-active', hits: [] as string[] };
    const record = (await active.json()) as { buildId: string; assets: string[] };
    const cache = await caches.open(`zari-build-${record.buildId}`);
    const hits: string[] = [];
    for (const asset of record.assets) {
      if (!asset.endsWith('.js')) continue;
      const response = await cache.match(new URL(asset, scope).href);
      if (!response) continue;
      if ((await response.clone().text()).includes(marker)) hits.push(asset);
    }
    return { error: '', hits };
  }, MARKER);
  expect(cached.error).toBe('');
  expect(cached.hits.length).toBeGreaterThan(0);
  note(testInfo, 'cached-chunk', cached.hits.join(' '));
  if (browserName === 'webkit') {
    note(testInfo, 'offline-click', 'webkit cache verified; offline reload is not used');
    return;
  }
  await context.setOffline(true);
  await page.getByTestId('view-spatial').click();
  const view = page.getByTestId('spatial-view');
  const fallback = page.getByTestId('spatial-fallback');
  await expect(view.or(fallback)).toBeVisible({ timeout: 20_000 });
  if ((await fallback.count()) > 0) {
    const reason = await fallback.getAttribute('data-reason');
    note(testInfo, 'offline-click', `fallback ${reason}`);
    expect(reason).not.toBe('import');
    await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  } else {
    await expect(view).toHaveAttribute('data-status', 'ready');
    note(testInfo, 'offline-click', 'ready from cache');
  }
  await context.setOffline(false);
  const noise = errors.filter((error) => !/failed to fetch|network|offline|net::/i.test(error));
  expect(noise).toEqual([]);
});
