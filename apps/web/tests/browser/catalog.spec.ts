import { test, expect, type Page } from '@playwright/test';

/**
 * REAL browser evidence for Ticket 008: staged catalog import with real Rust
 * `validateCatalog` in a WASM Worker, the persistent owned-container library,
 * demo-vs-imported labeling, and snapshot-bound action progress — all on real
 * IndexedDB, no mocked domain results.
 */

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
}

test('manual catalog import stages through Rust and persists only after commit; demo stays labeled', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/#/catalog');
  // The bundled demo catalog is visible and honestly labeled synthetic.
  await expect(page.getByTestId('catalog-list')).toBeVisible();
  await expect(page.getByTestId('catalog-list')).toContainText('데모 · 합성 데이터');

  // A malformed JSON payload is rejected and never listed.
  await page.getByTestId('import-source-json').click();
  await page.getByTestId('import-text').fill('{broken json');
  await page.getByTestId('stage-import').click();
  await expect(page.getByTestId('import-rejected')).toBeVisible();

  // Manual entry: one variant + one offer, URL intentionally left blank.
  await page.getByTestId('import-source-manual').click();
  await page.getByTestId('import-catalog-version').fill('catalog-e2e');
  await page.getByTestId('entry-productName').fill('테스트 박스');
  await page.getByTestId('entry-category').fill('box');
  await page.getByTestId('entry-productId').fill('prod-e2e');
  await page.getByTestId('entry-variantId').fill('var-e2e');
  await page.getByTestId('entry-optionLabel').fill('기본');
  await page.getByTestId('entry-outerWidthMm').fill('300');
  await page.getByTestId('entry-outerDepthMm').fill('200');
  await page.getByTestId('entry-outerHeightMm').fill('150');
  await page.getByTestId('entry-offerId').fill('offer-e2e');
  await page.getByTestId('entry-sellerId').fill('seller-e2e');
  await page.getByTestId('entry-packQuantity').fill('1');
  await page.getByTestId('entry-packPriceKrw').fill('7000');
  await page.getByTestId('entry-inventory').selectOption('inStock');
  await page.getByTestId('entry-shipping').selectOption('free');
  await page.getByTestId('add-entry').click();
  await page.getByTestId('stage-import').click();
  // Rust validated the staged import; the digest shown is Rust-computed.
  await expect(page.getByTestId('import-validated')).toBeVisible({ timeout: 30000 });
  // Not stored until the explicit commit.
  await expect(page.getByTestId('catalog-list')).not.toContainText('catalog-e2e');
  await page.getByTestId('commit-import').click();
  await expect(page.getByTestId('import-committed')).toBeVisible();
  await expect(page.getByTestId('catalog-list')).toContainText('catalog-e2e');
  await expect(page.getByTestId('catalog-list')).toContainText('가져온 카탈로그');
  expect(errors).toEqual([]);
});

test('owned container registers through Rust normalization and survives reload', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/#/catalog');
  await expect(page.getByTestId('owned-list')).toBeVisible();
  await page.getByTestId('owned-id').fill('my-crate');
  await page.getByTestId('owned-quantity-owned').fill('2');
  await page.getByTestId('owned-outerWidthMm').fill('310');
  await page.getByTestId('owned-outerDepthMm').fill('210');
  await page.getByTestId('owned-outerHeightMm').fill('160');
  await page.getByTestId('owned-register').click();
  // Rust normalized the record; it appears in the persistent library list.
  await expect(page.getByTestId('owned-list')).toContainText('my-crate', {
    timeout: 30000,
  });
  await page.reload();
  await expect(page.getByTestId('owned-list')).toContainText('my-crate');
  expect(errors).toEqual([]);
});

test('accepted plan exposes snapshot-bound action progress that persists across reload', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  // The demo catalog pin carries its honest synthetic label.
  await expect(page.getByTestId('catalog-demo-note')).toBeVisible();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await page.locator('[data-testid^="plan-card-"]').first().click();
  // Before acceptance the guide lists steps but keeps progress inactive.
  await expect(page.getByTestId('guide-list')).toBeVisible();
  await expect(page.getByTestId('progress-inactive')).toBeVisible();
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  // An unlocked step can be toggled; the write goes through the repository.
  // The checkbox is controlled by durable progress, so it flips only after
  // the CAS write lands — click and let the assertion retry until it does.
  const firstEnabled = page.locator('[data-testid^="action-"]:not([disabled])').first();
  await expect(firstEnabled).toBeVisible();
  const stepId = (await firstEnabled.getAttribute('data-testid'))!.slice('action-'.length);
  await firstEnabled.click();
  await expect(firstEnabled).toBeChecked();
  // Progress is persisted under the exact accepted binding — reload keeps it.
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30000,
  });
  await expect(page.getByTestId(`action-${stepId}`)).toBeChecked();
  expect(errors).toEqual([]);
});
