import { expect, test, type Page } from '@playwright/test';
import {
  addOwned,
  backToFacts,
  cardDump,
  collectErrors,
  commitSaved,
  computeDone,
  enableMixedSearch,
  interruptRunningSearch,
  openPlan,
  readCards,
  registerOwnedCopies,
  removeOwned,
  REUSE_ID,
  seedSample,
  selectKind,
  SMALL_ID,
  watchNetwork,
  widthBox,
} from './product-setup';

/**
 * SP-016 fresh path on a real Worker and IndexedDB.
 * Phone hardware and a discrete GPU are not claimed here.
 */

function installQuotaHook(page: Page) {
  return page.addInitScript(() => {
    const holder = window as unknown as { __failPuts: boolean };
    holder.__failPuts = false;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(...args: unknown[]) {
      if (holder.__failPuts) throw new DOMException('injected failure', 'QuotaExceededError');
      return original.apply(this, args as [unknown]);
    };
  });
}

test('fresh facts reach a blocked guide, then save, reload, and recovery', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  const leaked: string[] = [];
  collectErrors(page, errors);
  watchNetwork(page, leaked);
  await installQuotaHook(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await registerOwnedCopies(page);
  await seedSample(page);
  const duration = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--zari-duration-fast').trim(),
  );
  expect(duration).toMatch(/^0(ms|s)$/);

  await openPlan(page);
  await expect(page.locator('[data-testid="strategy-select"] input:checked')).toHaveCount(1);
  await expect(page.getByTestId('strategy-select')).toContainText('최소 구매');
  await computeDone(page);
  const directCards = await readCards(page);
  const direct = directCards.find((card) => card.kind === 'no-purchase');
  if (!direct) throw new Error(`no direct plan: ${cardDump(directCards)}`);
  expect(direct.placements.includes(REUSE_ID)).toBe(false);
  expect(direct.placements.includes(SMALL_ID)).toBe(false);
  if (!/Winter coats|Documents/.test(direct.placements)) {
    throw new Error(`no-purchase plan is not a direct item placement: ${direct.placements.slice(0, 240)}`);
  }

  await backToFacts(page);
  await addOwned(page, REUSE_ID);
  await commitSaved(page);
  await openPlan(page);
  await computeDone(page);
  const reuseCards = await readCards(page);
  const reuse = reuseCards.find((card) => card.kind === 'reuse');
  if (!reuse) throw new Error(`no reuse plan: ${cardDump(reuseCards)}`);
  expect(reuse.placements).toContain(`${REUSE_ID} #1`);
  expect(reuse.placements.includes(`${REUSE_ID} #2`)).toBe(false);

  await backToFacts(page);
  await removeOwned(page, REUSE_ID);
  await addOwned(page, SMALL_ID);
  await enableMixedSearch(page);
  await openPlan(page);
  await computeDone(page);
  const mixedCards = await readCards(page);
  const mixed = mixedCards.find((card) => card.kind === 'mixed-purchase');
  if (!mixed) throw new Error(`no mixed plan: ${cardDump(mixedCards)}`);
  expect(mixed.placements).toContain(SMALL_ID);

  await selectKind(page, mixedCards, 'mixed-purchase');
  await expect(page.getByTestId('bom-table')).toBeVisible();
  await expect(page.getByTestId('unknown-checks')).toBeVisible();
  const unknownBefore = await page.locator('[data-testid="checks-list"] [data-status="unknown"]').count();
  expect(unknownBefore).toBeGreaterThan(0);
  const refusedId = (await page.getByTestId('snapshot-id').first().innerText()).trim();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  const width = widthBox(page);
  await width.fill('90ㄱ');
  await expect(width).toHaveValue('90ㄱ');
  await width.fill('901');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPlan(page);
  await expect(page.getByTestId('stale-plan-notice').or(page.getByTestId('accepted-stale')).first()).toBeVisible();
  await page.getByTestId('accept-plan').first().click();
  await expect(page.getByTestId('accept-error').first()).toContainText('stale_input');
  await computeDone(page);
  await expect(page.getByTestId('stale-plan-notice')).toHaveCount(0);
  const secondCards = await readCards(page);
  if (!secondCards.some((card) => card.kind === 'mixed-purchase')) {
    throw new Error(`recompute lost mixed purchase: ${cardDump(secondCards)}`);
  }
  await selectKind(page, secondCards, 'mixed-purchase');
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  const accepted = (await page.getByTestId('snapshot-id').first().innerText()).trim();
  expect(accepted).not.toBe(refusedId);
  const condition = page.locator('#accepted-guide').locator('[data-testid^="step-condition-"]').first();
  await expect(condition).toBeVisible();
  await expect(condition).toContainText('완료 표시는 검사 결과를 바꾸지 않습니다.');

  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(condition).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.body.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: 'none' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '200%';
  });
  await expect(page.locator('#accepted-guide').getByTestId('guide-list')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  const unknownAtAccept = await page.locator('[data-testid="checks-list"] [data-status="unknown"]').count();
  expect(unknownAtAccept).toBeGreaterThan(0);
  const guide = page.locator('#accepted-guide');
  const step = guide.locator('input[data-testid^="action-"]:not([disabled])').first();
  await expect(step).toBeVisible();
  await step.focus();
  await page.keyboard.press('Space');
  await expect(step).toBeChecked();
  await expect(guide.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  expect(await page.locator('[data-testid="checks-list"] [data-status="unknown"]').count()).toBe(unknownAtAccept);

  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(guide.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await expect(page.getByTestId('snapshot-id').first()).toHaveText(accepted);

  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = true;
  });
  const checked = guide.locator('input[type="checkbox"]:checked').first();
  await checked.click();
  await expect(guide.getByTestId('action-error')).toContainText('persistence_failed');
  await expect(guide.getByTestId('action-export')).toBeVisible();
  await expect(guide.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = false;
  });

  await interruptRunningSearch(page);
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await expect(page.getByTestId('snapshot-id').first()).toHaveText(accepted);
  await expect(guide.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  const retry = page.getByTestId('worker-retry');
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('snapshot-id').first()).toHaveText(accepted);
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'interrupted');
  expect(leaked).toEqual([]);
  const unexpected = errors.filter(
    (error) => !/worker_timeout|worker_crashed|worker_unavailable|search_stalled|QuotaExceeded/.test(error),
  );
  expect(unexpected).toEqual([]);
});
