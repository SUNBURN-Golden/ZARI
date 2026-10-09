import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function preparedProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
}

async function diagnoseCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __diagnoseCalls: number }).__diagnoseCalls);
}

const BANNED_KEYS = [
  'log',
  'logs',
  'secret',
  'secrets',
  'password',
  'token',
  'apiKey',
  'sessionId',
  'requestId',
  'stack',
  'stackTrace',
  'durationMs',
  'photo',
  'photos',
  'workerSessionId',
];

function walkKeys(value: unknown, found: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, found);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    found.push(key);
    walkKeys(child, found);
  }
}

test('unknown is not no product, a late reply does not change the plan, and export has no log', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as {
      __diagnoseCalls?: number;
      __holdDiagnose?: boolean;
      __queued?: unknown[];
      __worker?: Worker;
      __post?: (this: Worker, ...args: unknown[]) => void;
    };
    holder.__diagnoseCalls = 0;
    holder.__holdDiagnose = false;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const body = args[0];
      if (typeof body === 'string' && body.includes('"diagnoseSearch"')) {
        holder.__diagnoseCalls = (holder.__diagnoseCalls ?? 0) + 1;
        if (holder.__holdDiagnose) {
          holder.__queued = args;
          holder.__worker = this;
          holder.__post = post as (this: Worker, ...inner: unknown[]) => void;
          return;
        }
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await preparedProject(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  const panel = page.getByTestId('search-diagnostics');
  await expect(panel).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('diagnostic-empty')).toBeVisible();
  expect(await diagnoseCalls(page)).toBe(0);

  await page.getByTestId('compute-plan').click();
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 90_000 });
  await expect(panel).toHaveAttribute('data-read-model', 'zari-search-diagnostics-1');
  await expect(panel).toHaveAttribute('data-proves-impossible', 'false');
  await expect(panel).toHaveAttribute('data-budget-proof', 'false');
  await expect(panel).toHaveAttribute('data-no-product', 'false');
  const selected = await panel.getAttribute('data-selected-id');
  expect(selected).toBeTruthy();
  await expect(page.getByTestId('support-range')).toBeVisible();
  await expect(page.locator('[data-testid="support-row"][data-code="rectangular_floor_anchor"]')).toHaveAttribute(
    'data-status',
    'finiteNotComplete',
  );
  const budgetClaim = await page.getByTestId('budget-claim').innerText();
  expect(budgetClaim).not.toMatch(/불가능이 증명되었|불가능의 증명입니다/);
  expect(await diagnoseCalls(page)).toBe(1);

  const exportButton = page.getByTestId('diagnostic-export');
  await exportButton.focus();
  await expect(exportButton).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.press('Enter');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('zari-search-reproduction.json');
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const reproduction = JSON.parse(readFileSync(filePath!, 'utf8')) as Record<string, unknown>;
  expect(reproduction.ruleVersion).toBeTruthy();
  expect(reproduction.budget).toBeTruthy();
  expect(reproduction.catalog).toBeTruthy();
  expect(reproduction.input).toBeTruthy();
  const keys: string[] = [];
  walkKeys(reproduction, keys);
  for (const banned of BANNED_KEYS) expect(keys).not.toContain(banned);
  expect(await diagnoseCalls(page)).toBe(1);

  await page.evaluate(() => {
    (window as unknown as { __holdDiagnose: boolean }).__holdDiagnose = true;
  });
  await page.getByTestId('diagnostic-retry').click();
  await expect(panel).toHaveAttribute('data-state', 'pending');
  expect(await diagnoseCalls(page)).toBe(2);
  await page.getByTestId('diagnostic-cancel').click();
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await expect(panel).toHaveAttribute('data-selected-id', selected!);
  await page.evaluate(() => {
    const holder = window as unknown as {
      __holdDiagnose?: boolean;
      __queued?: unknown[];
      __worker?: Worker;
      __post?: (this: Worker, ...args: unknown[]) => void;
    };
    holder.__holdDiagnose = false;
    if (!holder.__queued || !holder.__worker || !holder.__post) {
      throw new Error('missing_held_diagnosis');
    }
    holder.__post.apply(holder.__worker, holder.__queued);
  });
  await expect(panel).toHaveAttribute('data-ignored', '1');
  await expect(panel).toHaveAttribute('data-state', 'cancelled');
  await expect(panel).toHaveAttribute('data-selected-id', selected!);
  expect(await diagnoseCalls(page)).toBe(2);

  await page.getByRole('link', { name: '← 치수로 돌아가기' }).click();
  const width = page.getByRole('textbox', { name: '물건 A 폭' });
  await expect(width).toBeVisible();
  await width.fill('');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await expect(page.getByTestId('context-state')).toHaveText('installed');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 90_000 });
  await expect(panel).toHaveAttribute('data-undetermined', 'true');
  await expect(panel).toHaveAttribute('data-no-product', 'false');
  await expect(panel).toHaveAttribute('data-proves-impossible', 'false');
  await expect(panel).toHaveAttribute('data-budget-proof', 'false');
  await expect(page.getByTestId('no-product-claim')).toHaveText('제품이 없다고 단정하지 않습니다.');
  const facts = await page.getByTestId('next-check-facts').allTextContents();
  expect(facts.some((text) => text.includes('item-a') && text.includes('dimensions.envelope.width'))).toBe(
    true,
  );
  expect(await diagnoseCalls(page)).toBe(3);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(panel).toHaveAttribute('data-undetermined', 'true');
  await expect(panel).toHaveAttribute('data-no-product', 'false');
  await expect(page.getByTestId('support-range')).toBeVisible();
  expect(errors).toEqual([]);
});
