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

test('saved strategy stays pinned, wording duplicates drop, and a pull-only item keeps its count', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __libraryCalls?: number };
    holder.__libraryCalls = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('"evaluateStrategyLibrary"')) {
        holder.__libraryCalls = (holder.__libraryCalls ?? 0) + 1;
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await preparedProject(page);
  await page.evaluate(() => {
    const holder = window as unknown as { __libraryStates?: string[] };
    holder.__libraryStates = [];
    const obs = new MutationObserver(() => {
      const el = document.querySelector('[data-testid="strategy-library"]');
      const state = el?.getAttribute('data-state');
      const seen = holder.__libraryStates ?? [];
      if (state && seen[seen.length - 1] !== state) seen.push(state);
    });
    obs.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
  });
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');

  const panel = page.getByTestId('strategy-library');
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  const states = () =>
    page.evaluate(() => (window as unknown as { __libraryStates: string[] }).__libraryStates.slice());
  expect(await states()).toContain('ready');
  await expect(panel).toHaveAttribute('data-pinned', 'minimumPurchase');
  await expect(panel).toHaveAttribute('data-changed', 'false');
  await expect(panel).toHaveAttribute('data-stale', 'false');
  await expect(page.getByTestId('strategy-library-pin')).toContainText('최소 구매');
  await expect(page.getByTestId('strategy-library-pin')).toContainText('zari-strategy-library-1');
  await expect(page.getByTestId('strategy-library-dropped')).toContainText('1개');
  await expect(page.getByTestId('strategy-hard')).not.toContainText('색 취향');
  await expect(page.getByTestId('strategy-visual')).toContainText('저장된 전략을 바꾸지 않습니다');
  await expect(page.getByTestId('strategy-visual')).not.toContainText('구매가 금지');
  await expect(page.getByTestId('strategy-unassigned-empty')).toBeVisible();
  const calls = () =>
    page.evaluate(() => (window as unknown as { __libraryCalls: number }).__libraryCalls);
  expect(await calls()).toBe(1);

  await expect(page.getByTestId('strategy-rule-ids-minimumPurchase')).toContainText(
    'min-purchase/reuse-first',
  );
  const rules = page.getByTestId('strategy-rules-minimumPurchase');
  await rules.focus();
  await expect(rules).toBeFocused();
  await rules.press('Enter');
  await expect(page.getByTestId('strategy-rule-ids-minimumPurchase')).toHaveCount(0);
  await rules.press('Enter');
  await expect(page.getByTestId('strategy-rule-ids-minimumPurchase')).toContainText(
    'min-purchase/reuse-first',
  );
  await expect(panel).toHaveAttribute('data-pinned', 'minimumPurchase');
  expect(await calls()).toBe(1);

  await page.evaluate(() => {
    (window as unknown as { __libraryStates: string[] }).__libraryStates = [];
  });
  await page.getByRole('radio', { name: '한 동작 접근' }).click();
  await expect(panel).toHaveAttribute('data-pinned', 'minimumPurchase');
  await expect(page.getByTestId('strategy-library-held')).toBeVisible();
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  expect(await calls()).toBe(1);
  await page.getByTestId('strategy-library-save').click();
  await expect(panel).toHaveAttribute('data-pinned', 'oneActionAccess', { timeout: 15000 });
  expect(await states()).toEqual(expect.arrayContaining(['pending', 'ready']));
  await expect(page.getByTestId('strategy-library-held')).toHaveCount(0);
  await expect(page.getByTestId('unassigned-item-b')).toBeVisible();
  await expect(page.getByTestId('unassigned-count-item-b')).toHaveText('1');
  await expect(page.getByTestId('unassigned-item-b')).toContainText('꺼내기');
  await expect(page.getByTestId('unassigned-count-item-b')).not.toHaveText('미확인');
  await expect(page.getByTestId('unassigned-count-item-b')).not.toHaveText('0');
  await expect(page.getByTestId('unassigned-item-a')).toHaveCount(0);
  expect(await calls()).toBe(2);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('unassigned-count-item-b')).toHaveText('1');
  await expect(panel).toHaveAttribute('data-pinned', 'oneActionAccess');
  expect(errors).toEqual([]);
});
