import { test, expect, type Page } from '@playwright/test';

/**
 * REAL browser evidence for the ZARI-006 verified-plan vertical slice:
 * real Chromium, real IndexedDB (Dexie), real WASM Worker, real Rust search —
 * no mocked solver results. Covers compute → same-snapshot
 * SVG/checks/BOM/guide → accept → save → reload, stale-input marking,
 * cancel → restart, no-purchase and unknown/unassigned honesty states.
 */

async function seededProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
  );
}

async function computeDone(page: Page) {
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute(
    'data-search',
    'done',
    { timeout: 60000 },
  );
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
}

test('real WASM search renders one snapshot as SVG, checks, BOM and guide; accept persists across reload', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  await expect(page.getByTestId('strategy-select')).toBeVisible();
  await computeDone(page);
  const cards = page.locator('[data-testid^="plan-card-"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  // Same session as the first input commit (no reload): the bundled demo
  // catalog is labeled synthetic, never defaulted to an imported catalog.
  await expect(page.getByTestId('snapshot-id')).toContainText('합성 데이터');

  // The selected alternative renders every panel off the SAME snapshot.
  await expect(page.getByTestId('plan-diagram-top')).toBeVisible();
  await expect(page.getByTestId('plan-diagram-front')).toBeVisible();
  await expect(page.getByTestId('placements-list')).toBeVisible();
  await expect(page.getByTestId('checks-list')).toBeVisible();
  await expect(page.getByTestId('guide-list')).toBeVisible();

  // The demo scope must surface a purchase plan and a no-purchase plan.
  let purchaseIndex = -1;
  let noPurchaseIndex = -1;
  for (let i = 0; i < count; i += 1) {
    const text = await cards.nth(i).innerText();
    if (text.includes('구매 포함')) purchaseIndex = i;
    if (text.includes('구매 없음')) noPurchaseIndex = i;
  }
  expect(purchaseIndex).toBeGreaterThanOrEqual(0);
  expect(noPurchaseIndex).toBeGreaterThanOrEqual(0);

  // Purchase alternative: real BOM table and priced grand total.
  await cards.nth(purchaseIndex).click();
  await expect(page.getByTestId('bom-table')).toBeVisible();
  await expect(page.getByTestId('cost-summary')).not.toHaveText('');
  // No-purchase alternative: explicit "no purchase" state, not a zero-cost fake.
  await cards.nth(noPurchaseIndex).click();
  await expect(page.getByTestId('no-purchase')).toBeVisible();

  // Accept the no-purchase plan: Rust verifyRecord + CAS persist.
  const snapshotId = (await page.getByTestId('snapshot-id').innerText()).slice(0, 40);
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();

  // Real reload: the bound snapshot must come back from IndexedDB.
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
    { timeout: 30000 },
  );
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await expect(page.getByTestId('snapshot-id')).toContainText(
    snapshotId.slice(5, 20),
  );

  // 390px layout stays inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('editing the input marks old results stale and the CAS binding refuses a stale accept', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  await computeDone(page);
  const cards = page.locator('[data-testid^="plan-card-"]');
  await cards.nth(0).click();
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();

  // Change a real measurement and commit — prior results are now historical.
  await page.getByText('← 치수로 돌아가기').click();
  const width = page.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await width.fill('610');
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute(
    'data-save-state',
    'saved',
  );
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute(
    'data-context',
    'installed',
  );
  // The stored binding is flagged stale; old alternatives show as records only.
  await expect(page.getByTestId('accepted-stale')).toBeVisible();
  const staleCards = page.locator('[data-testid^="plan-card-"]');
  await staleCards.nth(1).click();
  await expect(
    page.getByTestId('plan-detail').first().getByTestId('stale-plan-notice'),
  ).toBeVisible();
  // Re-accepting a stale evaluation is refused by the CAS binding, not re-pinned.
  await page.getByTestId('accept-plan').first().click();
  await expect(page.getByTestId('accept-error').first()).toContainText('stale_input');
  // And a fresh search on the new input produces fresh, current results.
  await computeDone(page);
  await expect(
    page.getByTestId('plan-detail').first().getByTestId('stale-plan-notice'),
  ).toBeHidden();
  expect(errors).toEqual([]);
});

test('cancel during a real search then a fresh search completes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  await page.getByTestId('compute-plan').click();
  // Cancel while the WASM search is stepping.
  await expect(page.getByTestId('cancel-search')).toBeVisible();
  await page.getByTestId('cancel-search').click();
  const status = page.getByTestId('search-status');
  // Cooperative cancel, a search that finished first, or the 250ms hard
  // timeout. The hard timeout is interrupted, not scopeComplete.
  await expect(status).toHaveAttribute('data-search', /cancelled|done|interrupted/, {
    timeout: 20000,
  });
  // A hard timeout restarts the worker. If the context drops, wait for it
  // to come back before starting another search. A cooperative cancel never
  // drops it; the short negative wait then continues.
  const context = page.getByTestId('plan-context');
  await expect(context)
    .not.toHaveAttribute('data-context', 'installed', { timeout: 5000 })
    .catch(() => undefined);
  await expect(context).toHaveAttribute('data-context', 'installed', {
    timeout: 30000,
  });
  // A new search on the same context completes.
  await page.getByTestId('compute-plan').click();
  await expect(status).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await expect(page.locator('[data-testid^="plan-card-"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('unknown item quantity is not rendered as 미배치 0', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  await page.getByText('← 치수로 돌아가기').click();
  await page.getByTestId('open-detail').click();
  for (const id of ['item-a', 'item-b']) {
    await page.getByTestId(`detail-group-item-${id}`).click();
    await page.getByTestId(`detail-pick-items.${id}.quantity`).click();
    await page.getByTestId('detail-nominal').fill('');
  }
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await computeDone(page);
  const cards = page.locator('[data-testid^="plan-card-"]');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const text = await cards.nth(i).innerText();
    expect(text).not.toContain('미배치 0');
    expect(text).toMatch(/미확인|수량 미확인/);
  }
  expect(errors).toEqual([]);
});
