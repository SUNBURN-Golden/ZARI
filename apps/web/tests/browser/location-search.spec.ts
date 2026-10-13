import { expect, test, type Page } from '@playwright/test';

/**
 * Real Chromium, IndexedDB, and WASM for the z-location-search panel.
 * Planned locations must never render as actual ones; user-recorded
 * observations are the only actual locations. Rows keep item ids and
 * unit ordinals, so same-name items and partial quantities stay apart.
 */

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
}

async function seededPlan(page: Page) {
  await seededProject(page);
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await page.getByTestId('plan-card-0').click();
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  const projectId = page.url().match(/project\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  await page.evaluate((id) => {
    location.hash = `#/project/${id}`;
  }, projectId);
  await expect(page.getByTestId('location-panel')).toBeVisible();
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  return projectId as string;
}

test('a planned location is never the actual location until an observation records it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededPlan(page);

  const rows = page.getByTestId('location-rows');
  await expect(rows.locator('li').first()).toBeVisible();
  // Before any observation nothing claims an actual location; planned-only
  // rows carry the "unconfirmed" wording, never the confirmed one.
  const statuses = await rows.locator('li[data-status]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-status')),
  );
  expect(statuses.every((status) => status === 'plannedOnly' || status === 'unlocated')).toBe(
    true,
  );
  await expect(rows).toContainText('계획');
  await expect(rows).not.toContainText('확인한 위치');

  // Name search narrows to the matching item only.
  await page.getByTestId('location-query').fill('coats');
  await page.getByTestId('location-query').press('Enter');
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  const coatIds = await rows.locator('li[data-status]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')),
  );
  expect(coatIds.length).toBeGreaterThan(0);
  expect(coatIds.every((id) => id?.startsWith('location-row-item-a'))).toBe(true);

  // A no-match query is honest, not a guessed row.
  await page.getByTestId('location-query').fill('없는물건');
  await page.getByTestId('location-search').click();
  await expect(page.getByTestId('location-no-results')).toBeVisible();
  await expect(rows.locator('li')).toHaveCount(0);

  // Relocating one unit keeps the other units' rows separate.
  await page.getByTestId('location-query').fill('');
  await page.getByTestId('location-search').click();
  await page.getByTestId('location-item').selectOption('item-a');
  await page.getByTestId('location-kind').selectOption('relocate');
  await page.getByTestId('location-ordinals').fill('1');
  await page.getByTestId('location-place').fill('현관');
  await page.getByTestId('location-record').click();
  await expect(page.getByTestId('location-status')).toHaveAttribute('data-state', 'saved');
  const moved = page.getByTestId('location-row-item-a-1');
  await expect(moved).toContainText('관측: 현관');
  expect(['mismatch', 'observed']).toContain(await moved.getAttribute('data-status'));
  // The untouched unit group keeps its own row — never merged into unit 1.
  await expect(page.getByTestId('location-row-item-a-0')).toBeVisible();

  // The observation survives a reload through IndexedDB.
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  await expect(page.getByTestId('location-row-item-a-1')).toContainText('관측: 현관');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('location-panel')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('location-record')).toBeVisible();
  const colors = await page.getByTestId('location-panel').evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe('');
  expect(colors.color).not.toBe('');
  expect(errors).toEqual([]);
});

test('alias observations index and deleting the project removes every search row', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await seededProject(page);
  const projectId = page.url().match(/project\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  await expect(page.getByTestId('location-panel')).toBeVisible();
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');

  // An alias observation makes the item findable by its other name.
  await page.getByTestId('location-item').selectOption('item-a');
  await page.getByTestId('location-kind').selectOption('alias');
  await page.getByTestId('location-alias').fill('패딩');
  await page.getByTestId('location-record').click();
  await expect(page.getByTestId('location-status')).toHaveAttribute('data-state', 'saved');

  await page.getByTestId('location-query').fill('패딩');
  await page.getByTestId('location-query').press('Enter');
  await expect(page.getByTestId('location-status')).not.toHaveAttribute('data-state', 'pending');
  const rows = page.getByTestId('location-rows');
  await expect(rows.locator('li').first()).toBeVisible();
  await expect(rows).toContainText('별칭 패딩');
  const aliasIds = await rows.locator('li[data-status]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid')),
  );
  expect(aliasIds.every((id) => id?.startsWith('location-row-item-a'))).toBe(true);

  // Deleting the project removes the location log row, not just the UI.
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.getByTestId(`delete-${projectId}`).click();
  await page.getByTestId('delete-confirm-yes').click();
  await expect(page.getByTestId(`delete-${projectId}`)).toHaveCount(0);
  const leftover = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise((resolve) => {
      const transaction = db.transaction('locationLogs', 'readonly');
      const request = transaction.objectStore('locationLogs').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve('error');
    });
    db.close();
    return row;
  }, projectId ?? '');
  expect(leftover).toBeUndefined();
  expect(errors).toEqual([]);
});
