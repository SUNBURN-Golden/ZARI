import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

async function seededProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
}

async function openPurchasePlan(page: Page) {
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    const text = await cards.nth(i).innerText();
    if (text.includes('구매 포함')) {
      await cards.nth(i).click();
      return;
    }
  }
  throw new Error('no purchase plan');
}

test('a seller link is not a payment, stale stock stays old, and an affiliate mark does not change suitability', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __handoffCalls?: number };
    holder.__handoffCalls = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('"preparePurchaseHandoff"')) {
        holder.__handoffCalls = (holder.__handoffCalls ?? 0) + 1;
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seededProject(page);
  await page.evaluate(() => {
    const holder = window as unknown as { __handoffStates?: string[] };
    holder.__handoffStates = [];
    const obs = new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-testid="purchase-handoff"]')) {
        const state = el.getAttribute('data-state');
        const seen = holder.__handoffStates ?? [];
        if (state && seen[seen.length - 1] !== state) seen.push(state);
      }
    });
    obs.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
  });
  await openPurchasePlan(page);

  const detail = page.getByTestId('plan-detail').first();
  const handoff = detail.getByTestId('purchase-handoff');
  await expect(handoff).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  expect(
    await page.evaluate(() => (window as unknown as { __handoffStates: string[] }).__handoffStates),
  ).toEqual(expect.arrayContaining(['pending', 'ready']));
  const calls = () =>
    page.evaluate(() => (window as unknown as { __handoffCalls: number }).__handoffCalls);
  const base = await calls();
  expect(base).toBeGreaterThanOrEqual(1);
  expect(base).toBeLessThanOrEqual(2);
  await expect(handoff).toHaveAttribute('data-paid', 'false');
  await expect(handoff).toHaveAttribute('data-records-payment', 'false');
  const line = handoff.locator('[data-testid^="purchase-line-"]').first();
  const freshness = line.locator('[data-testid^="purchase-freshness-"]');
  await expect(freshness).toHaveAttribute('data-freshness', 'unconfirmed');
  await expect(freshness).toContainText('확인 시각 없음');
  await expect(handoff).not.toContainText('최신');
  await expect(handoff).not.toContainText('결제 완료');
  await expect(line.locator('[data-testid^="purchase-paid-"]')).toHaveAttribute('data-paid', 'false');
  await expect(handoff.getByTestId('purchase-unconfirmed')).toContainText('세금 포함 여부 미확인');

  const link = line.locator('[data-testid^="purchase-link-"]');
  await expect(link).toHaveAttribute('href', /^https?:\/\//);
  await link.evaluate((el) => {
    el.addEventListener('click', (event) => event.preventDefault());
  });
  await link.click();
  expect(await calls()).toBe(base);
  await expect(handoff).toHaveAttribute('data-paid', 'false');

  const suitability = await line.locator('[data-testid^="purchase-suitability-"]').getAttribute('data-suitability');
  expect(suitability).toBeTruthy();
  await handoff.getByTestId('purchase-affiliate').check();
  await expect(line.locator('[data-testid^="purchase-suitability-"]')).toHaveAttribute(
    'data-suitability',
    suitability!,
  );
  await expect(handoff).toHaveAttribute('data-affiliate-mark', 'on');
  expect(await calls()).toBe(base);

  await handoff.getByTestId('purchase-record-note').focus();
  await expect(handoff.getByTestId('purchase-record-note')).toBeFocused();
  await handoff.getByTestId('purchase-record-note').press('Enter');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('구매 확인 기록됨');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('수령 없음');

  await handoff.getByTestId('purchase-record-id').fill('recv-1');
  await handoff.getByTestId('purchase-record-kind').selectOption('received');
  await handoff.getByTestId('purchase-record-submit').click();
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('수령 기록됨');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('구매 확인 기록됨');

  await handoff.getByTestId('purchase-record-id').fill('meas-1');
  await handoff.getByTestId('purchase-record-kind').selectOption('measured');
  await handoff.getByTestId('purchase-record-width').fill('9000');
  await handoff.getByTestId('purchase-record-submit').click();
  await expect(line.locator('[data-testid^="purchase-impact-"]')).toHaveAttribute(
    'data-impact',
    'dimensionsDiffer',
  );
  await expect(line.locator('[data-testid^="purchase-impact-"]')).toHaveAttribute(
    'data-historical-pass',
    'false',
  );
  await expect(line.locator('[data-testid^="purchase-impact-"]')).toHaveAttribute(
    'data-measurement-pass',
    'false',
  );
  await expect(line.locator('[data-testid^="purchase-impact-"]')).toContainText('기존 통과를 재사용하지 않음');

  await handoff.getByTestId('purchase-record-id').fill('ret-1');
  await handoff.getByTestId('purchase-record-kind').selectOption('returned');
  await handoff.getByTestId('purchase-record-submit').click();
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('반품 기록됨');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('구매 확인 기록됨');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('수령 기록됨');
  await expect(line.locator('[data-testid^="purchase-flags-"]')).toContainText('실측 기록됨');
  expect(await calls()).toBe(base + 4);

  await handoff.getByTestId('purchase-fresh-asof').focus();
  await handoff.getByTestId('purchase-fresh-asof').press('Enter');
  await expect(handoff.getByTestId('purchase-fresh-result')).toHaveAttribute('data-freshness', 'stale');
  await expect(handoff.getByTestId('purchase-fresh-result')).toContainText('지난 확인');
  await expect(handoff.getByTestId('purchase-fresh-result')).not.toContainText('최신');
  await handoff.getByTestId('purchase-fresh-observed').fill('2026-10-10T00:00:00Z');
  await handoff.getByTestId('purchase-fresh-submit').click();
  await expect(handoff.getByTestId('purchase-fresh-result')).toHaveAttribute('data-freshness', 'current');
  await expect(handoff.getByTestId('purchase-fresh-result')).toContainText('확인됨');
  await expect(handoff.getByTestId('purchase-fresh-result')).not.toContainText('최신');

  await handoff.getByTestId('purchase-review-mode').selectOption('unknown');
  await handoff.getByTestId('purchase-review-submit').click();
  const review = handoff.getByTestId('purchase-review');
  await expect(review).toHaveAttribute('data-suitability', 'unknown');
  await expect(review).toHaveAttribute('data-identity-assumed', 'false');
  await expect(review).toHaveAttribute('data-reused-pass', 'false');
  await expect(review).toHaveAttribute('data-same-variant', 'false');
  await expect(review).toHaveAttribute('data-adopted', 'false');
  await expect(review).toHaveAttribute('data-records-payment', 'false');
  await expect(review).toHaveText('미확인');

  await handoff.getByTestId('purchase-review-mode').selectOption('wide');
  await handoff.getByTestId('purchase-review-submit').click();
  await expect(review).not.toHaveAttribute('data-suitability', 'pass');
  await expect(review).toHaveAttribute('data-identity-assumed', 'false');
  await expect(review).toHaveAttribute('data-reused-pass', 'false');
  expect(await calls()).toBe(base + 8);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(handoff.getByTestId('purchase-fresh-result')).toContainText('확인됨');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await handoff.getByTestId('purchase-record-id').fill('!!');
  await handoff.getByTestId('purchase-record-kind').selectOption('confirmedPurchase');
  await handoff.getByTestId('purchase-record-submit').click();
  await expect(handoff.getByTestId('purchase-error')).toBeVisible();
  await expect(handoff.getByTestId('purchase-error')).not.toContainText('결제 완료');
  await expect(handoff.getByTestId('purchase-error')).not.toContainText('₩0');
  await expect(handoff).toHaveAttribute('data-paid', 'false');
  expect(await calls()).toBe(base + 8);

  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    if ((await cards.nth(i).innerText()).includes('구매 없음')) {
      await cards.nth(i).click();
      break;
    }
  }
  const quiet = page.getByTestId('plan-detail').first().getByTestId('purchase-handoff');
  await expect(quiet).toHaveAttribute('data-state', 'empty', { timeout: 30000 });
  await expect(quiet.getByTestId('purchase-empty')).toHaveText('주문할 판매처가 없습니다.');
  await expect(quiet).not.toContainText('₩0');
  await expect(quiet).not.toContainText('최신');
  await expect(quiet).not.toContainText('결제 완료');
  expect(await calls()).toBe(base + 9);
  expect(errors).toEqual([]);
});
