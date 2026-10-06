import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Integrated failure, import, keyboard, and viewport checks for the completed
 * plan workspace. WebGL loss, disabled WebGL, and offline-first 3D stay in
 * spatial3d.spec.ts. This file adds the injections that suite did not cover.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;
const PAYLOAD = '<img src=x onerror=alert(1)><script>alert(1)</script>';
const BIDI = `\u202e${PAYLOAD}`;

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function seededPlan(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await expect(page.getByTestId('plan-workspace').first()).toBeVisible();
}

async function noHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const node of document.body.querySelectorAll('*')) {
      const el = node as HTMLElement;
      const width = Math.max(el.scrollWidth, el.getBoundingClientRect().right);
      if (width > window.innerWidth + 1 && offenders.length < 6) {
        offenders.push(`${el.tagName}.${String(el.className).slice(0, 80)} ${Math.round(width)}`);
      }
    }
    const raw = getComputedStyle(document.documentElement).zoom;
    const zoom = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    return {
      scroll: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      inner: window.innerWidth,
      zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
      offenders,
    };
  });
  expect(report.body, JSON.stringify(report)).toBeLessThanOrEqual(report.inner + 1);
  const limit = report.zoom > 1 ? report.body * report.zoom + 1 : report.inner + 1;
  expect(report.scroll, JSON.stringify(report)).toBeLessThanOrEqual(limit);
}

test('a mismatched projection stamp fails closed and a reload recovers', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.evaluate(() => {
    (window as unknown as { __zariCorruptProjection?: boolean }).__zariCorruptProjection = true;
  });
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await expect(page.getByTestId('plan-workspace').first()).toBeVisible();
  const workspace = page.getByTestId('plan-workspace').first();
  const revision = await workspace.getAttribute('data-project-revision');
  await expect(workspace).toHaveAttribute('data-projection-status', 'failed');
  await expect(workspace).toHaveAttribute('data-projection-failure', 'projection_source_mismatch');
  await expect(page.getByTestId('plan-diagram-top-failed')).toBeVisible();
  await expect(page.getByTestId('bom-table').or(page.getByTestId('no-purchase'))).toBeVisible();
  await expect(workspace).toHaveAttribute('data-project-revision', revision ?? '');
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  await page.locator('[data-testid^="plan-card-"]').first().click();
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await expect(page.getByTestId('plan-workspace').first()).toHaveAttribute('data-projection-status', 'ready');
  await expect(page.getByTestId('plan-workspace').first()).toHaveAttribute(
    'data-project-revision',
    revision ?? '',
  );
  expect(errors).toEqual([]);
});

test('a late projection reply cannot replace the plan the user returned to', async ({ page }) => {
  test.setTimeout(180_000);
  await seededPlan(page);
  const workspace = page.getByTestId('plan-workspace').first();
  await expect(workspace).toHaveAttribute('data-projection-status', 'ready');
  const snapshot = await workspace.getAttribute('data-projection-snapshot');
  const revision = await workspace.getAttribute('data-project-revision');
  expect(snapshot).toBeTruthy();
  await page.evaluate(() => {
    const holder = window as unknown as {
      __zariProjectionGate?: () => Promise<void>;
      __zariProjectionHeld?: boolean;
      __zariProjectionRelease?: () => void;
    };
    holder.__zariProjectionHeld = false;
    holder.__zariProjectionGate = () =>
      new Promise((resolve) => {
        holder.__zariProjectionHeld = true;
        holder.__zariProjectionRelease = () => resolve();
      });
  });
  await page.locator('.placement-pick').first().click();
  const y0 = Number(await page.getByTestId('move-y').inputValue());
  await page.getByTestId('move-y').fill(String(y0 - 15));
  await page.getByTestId('move-apply').click();
  await page.waitForFunction(
    () => (window as unknown as { __zariProjectionHeld?: boolean }).__zariProjectionHeld === true,
    null,
    { timeout: 20_000 },
  );
  await expect(workspace).toHaveAttribute('data-projection-status', 'ready');
  await expect(workspace).toHaveAttribute('data-projection-snapshot', snapshot ?? '');
  const revisionDuringHold = await workspace.getAttribute('data-project-revision');
  await page.evaluate(() => {
    (window as unknown as { __zariProjectionRelease?: () => void }).__zariProjectionRelease?.();
  });
  await expect(workspace).toHaveAttribute('data-projection-snapshot', snapshot ?? '');
  await expect(workspace).toHaveAttribute('data-project-revision', revisionDuringHold ?? '');
  const edited = page.getByTestId('edit-section').getByTestId('plan-workspace');
  await expect(edited).toHaveAttribute('data-projection-status', 'ready');
  expect(await edited.getAttribute('data-projection-snapshot')).not.toBe(snapshot);
  expect(revision).toBeTruthy();
});

test('a worker crash on the plan page keeps the drawing and retry restores it', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const Original = window.Worker;
    const captured: Worker[] = [];
    Object.assign(window, { __testWorkers: captured });
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        captured.push(this);
      }
    };
  });
  await seededPlan(page);
  const workspace = page.getByTestId('plan-workspace').first();
  const revision = await workspace.getAttribute('data-project-revision');
  await expect(page.getByTestId('diagram-text-list')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __testWorkers: Worker[] }).__testWorkers
      .at(-1)!
      .dispatchEvent(new ErrorEvent('error', { message: 'test transport failure' }));
  });
  await expect(page.getByTestId('worker-failed')).toBeVisible();
  await expect(page.getByTestId('diagram-text-list')).toBeVisible();
  await expect(workspace).toHaveAttribute('data-project-revision', revision ?? '');
  await page.getByTestId('worker-retry').click();
  await expect(page.getByTestId('worker-failed')).toBeHidden();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await expect(workspace).toHaveAttribute('data-project-revision', revision ?? '');
});

test('progress save and read failures stay visible and do not invent completion', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const read = (key: string) => sessionStorage.getItem(key) === '1';
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: unknown[]) {
      if (read('zari-fail-progress-put') && this.name === 'actionProgress') {
        throw new DOMException('injected failure', 'QuotaExceededError');
      }
      return originalPut.apply(this, args as [unknown]);
    };
    const originalGetAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args: unknown[]) {
      if (read('zari-fail-progress-read') && this.objectStore.name === 'actionProgress') {
        throw new DOMException('injected read', 'UnknownError');
      }
      return originalGetAll.apply(this, args as []);
    };
    const originalCursor = IDBIndex.prototype.openCursor;
    IDBIndex.prototype.openCursor = function (...args: unknown[]) {
      if (read('zari-fail-progress-read') && this.objectStore.name === 'actionProgress') {
        throw new DOMException('injected read', 'UnknownError');
      }
      return originalCursor.apply(this, args as []);
    };
  });
  await seededPlan(page);
  const workspace = page.getByTestId('plan-workspace').first();
  await page.getByTestId('accept-plan').click();
  const guide = page.locator('#accepted-guide');
  await expect(guide.locator('[data-testid^="action-"]').first()).toBeVisible();
  const revision = await workspace.getAttribute('data-project-revision');
  const enabled = guide.locator('input[data-testid^="action-"]:not([disabled])').first();
  await expect(enabled).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('zari-fail-progress-put', '1'));
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await expect(page.getByTestId('action-error')).toBeVisible();
  await expect(page.getByTestId('progress-retry')).toBeVisible();
  await expect(workspace).toHaveAttribute('data-project-revision', revision ?? '');
  await page.evaluate(() => sessionStorage.removeItem('zari-fail-progress-put'));
  await page.getByTestId('progress-retry').click();
  await expect(enabled).toBeChecked();
  await page.evaluate(() => sessionStorage.setItem('zari-fail-progress-read', '1'));
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('progress-unavailable')).toBeVisible();
  await expect(page.locator('#accepted-guide input[type="checkbox"]:checked')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem('zari-fail-progress-read'));
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.locator('#accepted-guide input[type="checkbox"]:checked').first()).toBeVisible();
});

test('imported markup and a raw HTML file never become DOM', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByRole('textbox', WIDTH).fill('600');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-project').click(),
  ]);
  const file = await download.path();
  const exported = JSON.parse(readFileSync(file!, 'utf8')) as { project: { name: string } };
  exported.project.name = BIDI;
  await page.getByRole('link', { name: '프로젝트 목록' }).click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'page.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<html><script>alert(1)</script><img src=x onerror=alert(1)></html>'),
  });
  await expect(page.getByTestId('import-rejected')).toBeVisible();
  await expect(page.getByText('파일을 읽을 수 없습니다 (JSON 아님).')).toBeVisible();
  await page.getByText('닫기').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'marked.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByTestId('import-review')).toBeVisible();
  await expect(page.getByTestId('import-review')).toContainText(PAYLOAD);
  const dom = await page.evaluate(() => ({
    imgs: document.querySelectorAll('img').length,
    hostileScripts: [...document.scripts].filter(
      (script) => script.textContent?.includes('alert(1)') || script.src.includes('onerror'),
    ).length,
  }));
  expect(dom).toEqual({ imgs: 0, hostileScripts: 0 });
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByRole('link', { name: '프로젝트 목록' }).click();
  await expect(page.getByText(PAYLOAD, { exact: false })).toBeVisible();
  await expect(page.getByTestId('create-project')).toBeVisible();
  const after = await page.evaluate(() => document.querySelectorAll('img').length);
  expect(after).toBe(0);
  expect(errors).toEqual([]);
});

test('plan keyboard, zoom, motion, forced colors, and viewports stay inside the page', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide').getByTestId('step-next')).toBeVisible();
  await page.getByTestId('view-front').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('view-front')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('view-top').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await page.locator('#accepted-guide').getByTestId('step-next').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('view-spatial').focus();
  await page.keyboard.press('Enter');
  const view = page.getByTestId('spatial-view');
  const fallback = page.getByTestId('spatial-fallback');
  await expect(view.or(fallback)).toBeVisible({ timeout: 20_000 });
  if ((await view.count()) > 0 && (await view.getAttribute('data-status')) !== 'unavailable') {
    await expect(view).toHaveAttribute('data-status', 'ready');
    await page.getByTestId('spatial-canvas').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('spatial-live')).toContainText('선택됨');
  }
  await page.getByTestId('view-top').click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await noHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const spatialButton = page.getByTestId('view-spatial');
  await spatialButton.scrollIntoViewIfNeeded();
  expect((await spatialButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await noHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  const motion = await page.evaluate(() => ({
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    forced: matchMedia('(forced-colors: active)').matches,
    fast: getComputedStyle(document.documentElement).getPropertyValue('--zari-duration-fast').trim(),
  }));
  expect(motion.reduce).toBe(true);
  expect(motion.forced).toBe(true);
  expect(motion.fast).toMatch(/^0(ms|s)$/);
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  const restored = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(restored).toBe(false);
  expect(errors).toEqual([]);
});
