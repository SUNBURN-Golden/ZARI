import { test, expect, type Page } from '@playwright/test';

/**
 * SP-010 next-fact list on the real browser Worker.
 * Phone hardware and a dedicated GPU are not claimed here.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(page.getByTestId('context-state')).toHaveText(/installed|degraded/);
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

test('browse, edit one fact, save, and recompile without a per-keystroke query', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const list = page.getByTestId('next-facts');
  await expect(list).toHaveAttribute('data-next-facts-status', 'ready');
  await expect(list).toHaveAttribute('data-next-facts-freshness', 'inputOnly');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  const before = Number(await list.getAttribute('data-next-facts-rows'));
  expect(before).toBeGreaterThan(1);

  const width = page.locator('[data-field-path="space.interior.width"]');
  await width.focus();
  await page.keyboard.press('Enter');
  const nominal = page.locator('[id="nominal-space.interior.width"]');
  await expect(nominal).toBeFocused();
  const started = Date.now();
  await nominal.fill('1200');
  await page.getByTestId('detail-uncertainty-bounded').click();
  await page.getByTestId('detail-minus').fill('2');
  await page.getByTestId('detail-plus').fill('3');
  await page.getByTestId('detail-note').fill('NOTE_TOKEN_91mm 서로 다른 기록');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  await expect(list).toHaveAttribute('data-next-facts-status', 'stale');
  await expect(list).toHaveAttribute('data-next-facts-rows', '0');

  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  await page.getByTestId('recompile-next-facts').click();
  await expect(list).toHaveAttribute('data-next-facts-requests', '2');
  await expect(list).toHaveAttribute('data-next-facts-status', 'ready');
  await expect(page.locator('[data-field-path="space.interior.width"]')).toHaveCount(0);
  const after = Number(await list.getAttribute('data-next-facts-rows'));
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  await expect(page.getByText('계획 통과')).toHaveCount(0);
  await expect(list).not.toContainText('NOTE_TOKEN_91mm');
  await expect(page.getByTestId('detail-note')).toHaveValue(/NOTE_TOKEN_91mm/);
  await expect(page.locator('[data-need="conflictingEvidence"]')).toHaveCount(0);
  await page.getByTestId('recompile-next-facts').click();
  await expect(list).toHaveAttribute('data-next-facts-requests', '2');
  const roundTrip = Number(await list.getAttribute('data-next-facts-roundtrip-ms'));
  expect(Number.isFinite(roundTrip)).toBe(true);
  console.log(`SP010_BROWSER_ROUNDTRIP_MS ${roundTrip} SP010_CLICK_TO_EDIT_MS ${Date.now() - started}`);
  expect(errors).toEqual([]);
});

test('arrow keys move the list and a phone tap opens the same field', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await createProject(page);
  const list = page.getByTestId('next-facts-list');
  const first = list.getByRole('button').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list.getByRole('button').nth(1)).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('next-facts')).toBeVisible();
  await expect(page.locator('[data-field-path="space.interior.width"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a tap opens the same nominal field', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    collectErrors(page, errors);
    await createProject(page);
    await page.locator('[data-field-path="space.interior.width"]').tap();
    await expect(page.locator('[id="nominal-space.interior.width"]')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('a held reply and a limit injection do not paint a current list', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as {
      __zariNextFactsHeld?: boolean;
      __zariNextFactsRelease?: () => void;
      __zariNextFactsGate?: () => Promise<void>;
    };
    holder.__zariNextFactsHeld = false;
    holder.__zariNextFactsGate = () =>
      new Promise((resolve) => {
        holder.__zariNextFactsHeld = true;
        holder.__zariNextFactsRelease = () => resolve();
      });
  });
  await createProject(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __zariNextFactsHeld?: boolean }).__zariNextFactsHeld === true))
    .toBe(true);
  const list = page.getByTestId('next-facts');
  await expect(list).toHaveAttribute('data-next-facts-status', 'loading');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  await page.getByRole('textbox', WIDTH).fill('10');
  await page.evaluate(() => (window as unknown as { __zariNextFactsRelease?: () => void }).__zariNextFactsRelease?.());
  await expect(list).toHaveAttribute('data-next-facts-status', 'stale');
  await expect(list).toHaveAttribute('data-next-facts-rows', '0');
  await expect(list).toHaveAttribute('data-next-facts-requests', '1');
  expect(errors).toEqual([]);
});

test('limit injection and worker recovery keep the list honest', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    (window as unknown as { __zariNextFactsInject?: string }).__zariNextFactsInject = 'limit';
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
  await createProject(page);
  const list = page.getByTestId('next-facts');
  await expect(list).toHaveAttribute('data-next-facts-status', 'limited');
  await expect(list).toHaveAttribute('data-next-facts-rows', '0');
  await expect(page.getByTestId('next-facts-limit')).toBeVisible();
  await page.evaluate(() => {
    delete (window as unknown as { __zariNextFactsInject?: string }).__zariNextFactsInject;
    (window as unknown as { __testWorkers: Worker[] }).__testWorkers
      .at(-1)!
      .dispatchEvent(new ErrorEvent('error', { message: 'test transport failure' }));
  });
  await expect(page.getByTestId('worker-state')).toHaveText('failed');
  await page.getByTestId('worker-retry').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await expect(list).toHaveAttribute('data-next-facts-status', 'ready');
  const requests = Number(await list.getAttribute('data-next-facts-requests'));
  expect(requests).toBeGreaterThanOrEqual(2);
  const rows = Number(await list.getAttribute('data-next-facts-rows'));
  expect(rows).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
