import { test, expect, type Page } from '@playwright/test';

/**
 * SP-014 browser evidence: a real Worker search publishes one snapshot,
 * cooperative cancel keeps that accepted plan, and the page stays quiet.
 * Hard terminate and a dropped cancel are covered by the session unit tests
 * against the same Rust runtime; this file does not invent a worker crash.
 */

async function seededProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready');
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
}

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
}

test('accepted plan survives cancel; keyboard and forced colors stay usable', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60_000,
  });
  const cards = page.locator('[data-testid^="plan-card-"]');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(page.getByTestId('checks-list')).toBeVisible();
  await expect(page.getByTestId('guide-list')).toBeVisible();
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  const accepted = await page.getByTestId('snapshot-id').innerText();

  await page.getByTestId('compute-plan').click();
  const cancel = page.getByTestId('cancel-search');
  await expect(cancel).toBeVisible();
  await cancel.focus();
  await page.keyboard.press('Enter');
  const status = page.getByTestId('search-status');
  await expect(status).toHaveAttribute('data-search', /cancelled|done|interrupted/, {
    timeout: 60_000,
  });
  const state = await status.getAttribute('data-search');
  expect(state).not.toBe('running');
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await expect(page.getByTestId('snapshot-id')).toHaveText(accepted);

  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(errors).toEqual([]);
});
