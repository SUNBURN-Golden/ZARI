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

test('a finished search compares real axes and does not claim a global optimum', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __paretoCalls?: number };
    holder.__paretoCalls = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('"comparePareto"')) {
        holder.__paretoCalls = (holder.__paretoCalls ?? 0) + 1;
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await preparedProject(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  const calls = () =>
    page.evaluate(() => (window as unknown as { __paretoCalls: number }).__paretoCalls);
  expect(await calls()).toBe(0);

  await page.getByTestId('compute-plan').click();
  const panel = page.getByTestId('pareto-compare');
  await expect(panel).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  await expect(panel).toHaveAttribute('data-global-optimum', 'false');
  const optimality = await panel.getAttribute('data-optimality');
  const sentence = page.getByTestId('pareto-optimality');
  if (optimality === 'budgetLimited') {
    await expect(sentence).toContainText('전역 최적해가 아닙니다');
    await expect(sentence).toContainText('현재 탐색 범위에서 찾은 안');
  } else if (optimality === 'scopeCompared') {
    await expect(sentence).toContainText('전역 최적해라고 하지 않습니다');
  } else {
    await expect(sentence).toContainText('전역 최적해가 아닙니다');
  }
  await expect(sentence).not.toContainText('전역 최적해입니다');
  await expect(page.getByTestId('pareto-front')).toBeVisible();
  await expect(page.getByTestId('pareto-purchase-0')).toBeVisible();
  await expect(page.getByTestId('pareto-reuse-0')).toBeVisible();
  await expect(page.getByTestId('pareto-moves-0')).toBeVisible();
  const unknownMoney = page.locator('[data-money="unknown"]');
  const unknownCount = await unknownMoney.count();
  for (let index = 0; index < unknownCount; index += 1) {
    await expect(unknownMoney.nth(index)).toHaveText('미확인');
    await expect(unknownMoney.nth(index)).not.toContainText('₩');
  }
  expect(await calls()).toBe(1);

  await page.getByTestId('pareto-select-0').click();
  await expect(page.locator('[data-testid="pareto-front"] tbody tr').first()).toHaveAttribute(
    'data-selected',
    'true',
  );
  expect(await calls()).toBe(1);

  const details = page.getByTestId('pareto-conditions-0');
  await details.focus();
  await expect(details).toBeFocused();
  await details.press('Enter');
  await expect(page.getByTestId('pareto-detail-0')).toBeVisible();
  await details.press('Enter');
  await expect(page.getByTestId('pareto-detail-0')).toHaveCount(0);
  expect(await calls()).toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(panel).toHaveAttribute('data-global-optimum', 'false');
  await expect(sentence).not.toContainText('전역 최적해입니다');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('radio', { name: '한 동작 접근' }).click();
  await expect(panel).toHaveAttribute('data-stale', 'true');
  await expect(panel).toHaveAttribute('data-global-optimum', 'false');
  await expect(page.getByTestId('pareto-held')).toBeVisible();
  expect(await calls()).toBe(1);
  await page.getByTestId('pareto-recalculate').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'running');
  await expect(page.getByTestId('strategy-library')).toHaveAttribute('data-pinned', 'oneActionAccess');
  expect(await calls()).toBe(1);
  expect(errors).toEqual([]);
});
