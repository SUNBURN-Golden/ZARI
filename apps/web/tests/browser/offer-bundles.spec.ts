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

test('a plan quote shares one revision, a 3-of-2 preview leaves one, and unknown shipping is not free', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __quoteCalls?: number };
    holder.__quoteCalls = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('"quoteOfferBundle"')) {
        holder.__quoteCalls = (holder.__quoteCalls ?? 0) + 1;
      }
      return (post as (...inner: unknown[]) => void).apply(this, args);
    } as Worker['postMessage'];
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seededProject(page);
  await page.evaluate(() => {
    const holder = window as unknown as { __quoteStates?: string[] };
    holder.__quoteStates = [];
    const obs = new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-testid="offer-quote-status"]')) {
        const state = el.getAttribute('data-state');
        const seen = holder.__quoteStates ?? [];
        if (state && seen[seen.length - 1] !== state) seen.push(state);
      }
    });
    obs.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
  });
  await openPurchasePlan(page);

  const detail = page.getByTestId('plan-detail').first();
  const quote = detail.getByTestId('offer-quote');
  await expect(quote).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
  expect(
    await page.evaluate(() => (window as unknown as { __quoteStates: string[] }).__quoteStates),
  ).toEqual(expect.arrayContaining(['pending', 'ready']));
  const revision = await quote.getAttribute('data-revision');
  expect(revision).toBeTruthy();
  await expect(detail.getByTestId('plan-drawings')).toHaveAttribute('data-revision', revision!);
  await expect(detail.getByTestId('bom-table')).toHaveAttribute('data-revision', revision!);
  await expect(detail.getByTestId('guide-list')).toHaveAttribute('data-revision', revision!);
  await expect(detail.getByTestId('offer-quote-bound')).toHaveText(revision!);
  await expect(detail.getByTestId('offer-grand')).toContainText('미확인');
  await expect(detail.getByTestId('offer-unconfirmed')).toContainText('세금 포함 여부 미확인');
  await expect(detail.getByTestId('offer-known-shipping')).not.toContainText('₩0');
  const quoteCount = () =>
    page.evaluate(() => (window as unknown as { __quoteCalls: number }).__quoteCalls);
  const quotesAfterPlan = await quoteCount();
  expect(quotesAfterPlan).toBeGreaterThanOrEqual(1);
  expect(quotesAfterPlan).toBeLessThanOrEqual(2);

  const before = await detail.getByTestId('snapshot-id').innerText();
  await detail.getByTestId('offer-preview-needed').fill('3');
  await detail.getByTestId('offer-preview-pack').fill('2');
  await detail.getByTestId('offer-preview-price').fill('1000');
  await detail.getByTestId('offer-preview-shipping-kind').selectOption('free');
  await detail.getByTestId('offer-preview-tax').selectOption('included');
  await detail.getByTestId('offer-preview-pack').focus();
  await expect(detail.getByTestId('offer-preview-pack')).toBeFocused();
  await detail.getByTestId('offer-preview-pack').press('Enter');
  await expect(detail.getByTestId('offer-preview-packs')).toHaveText('주문 묶음 2');
  await expect(detail.getByTestId('offer-preview-surplus')).toHaveText('남는 개수 1');
  await expect(detail.getByTestId('offer-preview-shipping')).toHaveText('배송 무료');
  await expect(detail.getByTestId('offer-preview-grand')).toHaveText('합계 ₩2,000');
  await expect(detail.getByTestId('offer-preview')).toHaveAttribute('data-revision', '');
  expect(await detail.getByTestId('snapshot-id').innerText()).toBe(before);

  await detail.getByTestId('offer-preview-shipping-kind').selectOption('unknown');
  await detail.getByTestId('offer-preview-submit').click();
  await expect(detail.getByTestId('offer-preview-shipping')).toHaveText('배송 미확인');
  await expect(detail.getByTestId('offer-preview-grand')).toHaveText('합계 미확인');
  const unknownText = await detail.getByTestId('offer-preview-shipping').innerText();
  expect(unknownText).not.toContain('무료');
  expect(unknownText).not.toContain('₩');
  expect(await detail.getByTestId('snapshot-id').innerText()).toBe(before);
  expect(await quoteCount()).toBe(quotesAfterPlan + 2);

  await page.locator('.placement-pick').first().click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  const x0 = Number(await page.getByTestId('move-x').inputValue());
  await page.getByTestId('move-x').fill(String(x0));
  await page.getByTestId('move-apply').click();
  const edited = page.getByTestId('edit-section');
  await expect(edited).toBeVisible({ timeout: 15000 });
  await expect(edited.getByTestId('offer-quote')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  });
  const next = await edited.getByTestId('offer-quote').getAttribute('data-revision');
  expect(next).toBeTruthy();
  expect(next).not.toBe(revision);
  await expect(edited.getByTestId('plan-drawings')).toHaveAttribute('data-revision', next!);
  await expect(edited.getByTestId('bom-table')).toHaveAttribute('data-revision', next!);
  await expect(edited.getByTestId('guide-list')).toHaveAttribute('data-revision', next!);
  await expect(edited.getByTestId('offer-quote-bound')).toHaveText(next!);
  await expect(detail.getByTestId('offer-quote')).toHaveAttribute('data-revision', revision!);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(detail.getByTestId('offer-preview-shipping')).toHaveText('배송 미확인');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await detail.getByTestId('offer-preview-pack').fill('0');
  await detail.getByTestId('offer-preview-submit').click();
  await expect(detail.getByTestId('offer-preview-error')).toContainText('pack_quantity_zero');
  await expect(detail.getByTestId('offer-preview')).toHaveCount(0);

  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    if ((await cards.nth(i).innerText()).includes('구매 없음')) {
      await cards.nth(i).click();
      break;
    }
  }
  const quiet = page.getByTestId('plan-detail').first().getByTestId('offer-quote');
  await expect(quiet).toHaveAttribute('data-state', /ready|empty/, { timeout: 30000 });
  await expect(quiet.getByTestId('offer-grand')).not.toContainText('₩0');
  await expect(quiet.getByTestId('offer-grand')).not.toContainText('무료');
  expect(errors).toEqual([]);
});
