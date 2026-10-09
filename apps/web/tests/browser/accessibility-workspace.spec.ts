import { expect, test, type Page } from '@playwright/test';

/**
 * Keyboard and compact-layout journey for z-accessibility-workspace.
 * Chromium here is desktop emulation. It is not a physical phone.
 */

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function tabTo(page: Page, read: () => Promise<string>, wanted: string, max: number) {
  for (let i = 0; i < max; i += 1) {
    if ((await read()) === wanted) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`tab did not reach ${wanted}; stopped on ${await read()}`);
}

async function tabToTestId(page: Page, testId: string, max = 80) {
  await tabTo(
    page,
    () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''),
    testId,
    max,
  );
}

async function shiftTabToId(page: Page, id: string, max = 40) {
  for (let i = 0; i < max; i += 1) {
    const current = await page.evaluate(() => document.activeElement?.id ?? '');
    if (current === id) return;
    await page.keyboard.press('Shift+Tab');
  }
  throw new Error(`shift-tab did not reach #${id}`);
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

async function staysVisible(page: Page, testId: string) {
  const locator = page.getByTestId(testId).first();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(0);
  const hidden = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
  });
  expect(hidden).toBe(false);
}

test('keyboard only: create, measure, compute, compare, adopt, and open the guide', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __moveXs: number[] };
    holder.__moveXs = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const body = args[0];
      if (typeof body === 'string' && body.includes('"movePlacement"')) {
        const walk = (node: unknown) => {
          if (!node || typeof node !== 'object') return;
          const record = node as { kind?: string; position?: { x?: number } };
          if (record.kind === 'movePlacement' && typeof record.position?.x === 'number') {
            holder.__moveXs.push(record.position.x);
          }
          for (const value of Object.values(record)) walk(value);
        };
        walk(JSON.parse(body) as unknown);
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expect(page.getByTestId('create-project')).toHaveAttribute('data-list-settled', 'true');
  await staysVisible(page, 'create-project');
  await expect(page.locator('.local-note')).toContainText('이 기기에만 저장');
  await noHorizontalOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await tabToTestId(page, 'create-project', 12);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await expect(page.locator('.local-note')).toContainText('새 정리 프로젝트');

  await tabToTestId(page, 'fill-sample', 120);
  await page.keyboard.press('Enter');
  await shiftTabToId(page, 'space.interior.width', 80);
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await page.keyboard.press('Control+A');
  await page.keyboard.type('610');
  await expect(width).toHaveValue('610');
  const described = await width.getAttribute('aria-describedby');
  expect(described?.split(/\s+/)).toContain('uncertainty-space.interior.width');
  await expect(page.getByTestId('uncertainty-space.interior.width')).toContainText('미확인');

  await tabToTestId(page, 'commit-input', 80);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true })).toHaveValue('610');

  await tabToTestId(page, 'goto-plan', 8);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');

  await tabToTestId(page, 'compute-plan', 40);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('pareto-compare')).toHaveAttribute('data-state', 'ready', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('pareto-compare')).toBeVisible();

  await tabToTestId(page, 'pareto-select-0', 40);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pareto-select-0')).toHaveAttribute('aria-pressed', 'true');

  const placementId = await page.locator('.placement-pick').first().getAttribute('data-testid');
  if (!placementId) throw new Error('no placement button');
  await tabToTestId(page, placementId, 200);
  await page.keyboard.press('Enter');
  await expect(page.locator('.placement-pick').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selection-live').first()).toContainText('선택됨');
  await expect(page.getByTestId('inspector').first()).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''))
    .toBe('move-x');

  await tabToTestId(page, 'move-step-coarse', 12);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('move-step-coarse').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('move-step').first()).toContainText('10 mm');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('move-step').first()).toContainText('1 mm');

  const moves = () => page.evaluate(() => (window as unknown as { __moveXs: number[] }).__moveXs.slice());
  expect(await moves()).toEqual([]);
  await tabToTestId(page, 'move-x-up', 8);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('edit-section')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('undo-edit')).toBeEnabled({ timeout: 20_000 });
  await expect.poll(moves).toHaveLength(1);

  const editDiagram = page.getByTestId('edit-section').getByTestId('plan-diagram-top');
  await editDiagram.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(moves).toHaveLength(2);
  const sent = await moves();
  expect(sent[1]).toBe((sent[0] ?? 0) + 1);

  await tabToTestId(page, 'accept-plan', 200);
  await page.keyboard.press('Enter');
  await expect(page.locator('#accepted-guide')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('accepted-badge').first()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const guide = document.getElementById('accepted-guide');
        const active = document.activeElement;
        return Boolean(guide && active && guide.contains(active));
      }),
    )
    .toBe(true);
  await expect(page.getByTestId('unknown-checks').first()).toContainText('미확인');
  await expect(page.getByTestId('checks-list').first()).toContainText('미확인');

  await page.setViewportSize({ width: 320, height: 700 });
  await staysVisible(page, 'pareto-compare');
  await staysVisible(page, 'accepted-badge');
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.locator('.local-note')).toContainText('새 정리 프로젝트');
  await expect(page.getByTestId('unknown-checks').first()).toBeVisible();
  await expect(page.getByTestId('open-inspector').first()).toBeVisible();
  await noHorizontalOverflow(page);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.getByTestId('unknown-checks').first()).toBeVisible();
  await noHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.getByTestId('pareto-compare')).toBeVisible();
  await expect(page.getByTestId('unknown-checks').first()).toContainText('미확인');
  await page.locator('#accepted-guide').locator('button:not([disabled]), input:not([disabled])').first().focus();
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as HTMLElement);
    return style.outlineStyle;
  });
  expect(outline).not.toBe('none');
  const motion = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--zari-duration-fast').trim(),
  );
  expect(motion).toMatch(/^0(ms|s)$/);
  expect(errors).toEqual([]);
});

test('invalid measure, save failure, and worker recovery keep the text and move focus', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __failPuts: boolean; __testWorkers: Worker[] };
    holder.__failPuts = false;
    holder.__testWorkers = [];
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(...args: unknown[]) {
      if (holder.__failPuts) throw new DOMException('injected failure', 'QuotaExceededError');
      return originalPut.apply(this, args as [unknown]);
    };
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        holder.__testWorkers.push(this);
      }
    };
  });

  await page.goto('/');
  await expect(page.getByTestId('create-project')).toHaveAttribute('data-list-settled', 'true');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await width.focus();
  await page.keyboard.type('abc');
  await page.getByTestId('commit-input').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('숫자 형식을 확인해 주세요.')).toBeVisible();
  await expect(width).toHaveValue('abc');
  await expect(width).toBeFocused();
  await expect(width).toHaveAttribute('aria-invalid', 'true');

  await width.fill('600');
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = true;
  });
  await page.getByTestId('commit-input').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'error');
  await expect(page.getByTestId('save-failed')).toBeVisible();
  await expect(page.getByTestId('save-failed-retry')).toBeFocused();
  await expect(width).toHaveValue('600');
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = false;
  });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(width).toHaveValue('600');
  await expect(page.getByTestId('commit-input')).toBeFocused();

  await page.evaluate(() => {
    (window as unknown as { __testWorkers: Worker[] }).__testWorkers
      .at(-1)!
      .dispatchEvent(new ErrorEvent('error', { message: 'test transport failure' }));
  });
  await expect(page.getByTestId('worker-failed')).toBeVisible();
  await expect(page.getByTestId('worker-retry')).toBeFocused();
  await expect(width).toHaveValue('600');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await expect(width).toHaveValue('600');
  await expect(page.getByTestId('commit-input')).toBeFocused();
  const unexpected = errors.filter((error) => !/QuotaExceeded|worker_crashed|test transport/.test(error));
  expect(unexpected).toEqual([]);
});

test('cancelling a running calculation returns focus and keeps the measurement', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as {
      __holdSteps: boolean;
      __steps: number;
      __queued: { worker: Worker; args: unknown[]; post: (...inner: unknown[]) => void }[];
    };
    holder.__holdSteps = true;
    holder.__steps = 0;
    holder.__queued = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const body = args[0];
      if (typeof body === 'string' && body.includes('"stepSearch"')) {
        holder.__steps += 1;
        if (holder.__holdSteps) {
          holder.__queued.push({
            worker: this,
            args,
            post: post as (...inner: unknown[]) => void,
          });
          return;
        }
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });

  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  const measured = await width.inputValue();
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __steps: number }).__steps)).toBeGreaterThan(0);
  await expect(page.getByTestId('cancel-search')).toBeVisible();
  await page.getByTestId('cancel-search').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'cancelled', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('compute-plan')).toBeFocused();
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await expect(page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true })).toHaveValue(measured);
  await page.evaluate(() => {
    const holder = window as unknown as {
      __holdSteps: boolean;
      __queued: { worker: Worker; args: unknown[]; post: (...inner: unknown[]) => void }[];
    };
    holder.__holdSteps = false;
    for (const item of holder.__queued) item.post.apply(item.worker, item.args);
    holder.__queued = [];
  });
  expect(errors.filter((error) => !/worker_timeout|search_stalled/.test(error))).toEqual([]);
});
