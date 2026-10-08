import { expect, test, type Page } from '@playwright/test';

/**
 * SP-015 lifecycle on a real Worker and IndexedDB.
 * Phone hardware and a dedicated GPU are not claimed here.
 */

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

function watchNetwork(page: Page, leaked: string[]) {
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') leaked.push(request.url());
  });
}

async function seededPlan(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed');
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  const count = await page.locator('[data-testid^="plan-card-"]').count();
  for (let i = 0; i < count; i++) {
    await page.getByTestId(`plan-card-${i}`).click();
    const items = page.getByTestId('placements-list').locator('li');
    const note = await items.first().locator('.session-note').innerText();
    const y = Number(note.match(/\(-?\d+, (-?\d+), -?\d+\)/)?.[1]);
    if ((await items.count()) === 1 && y >= 15) break;
  }
  const chosen = await page
    .getByTestId('placements-list')
    .locator('li')
    .first()
    .locator('.session-note')
    .innerText();
  expect(Number(chosen.match(/\(-?\d+, (-?\d+), -?\d+\)/)?.[1])).toBeGreaterThanOrEqual(15);
}

async function acceptSelected(page: Page) {
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
}

test('evidence edit blocks progress and a new plan does not carry done rows', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const leaked: string[] = [];
  collectErrors(page, errors);
  watchNetwork(page, leaked);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const first = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  const firstId = (await first.getAttribute('data-testid'))!.slice('action-'.length);
  await first.click();
  await expect(first).toBeChecked();
  const projectId = new URL(page.url()).hash.split('/')[2]!;

  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await page.getByTestId('open-detail').click();
  await page.getByTestId('detail-group-interior').click();
  await page.getByTestId('detail-pick-space.interior.width').click();
  await page.getByTestId('detail-note').fill('줄자로 다시 본 메모');
  await page.getByTestId('goto-plan').click();
  await expect(page.locator('#accepted-guide').getByTestId('progress-stale')).toBeVisible();

  await page.getByRole('link', { name: '치수로 돌아가기' }).click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', {
    timeout: 60000,
  });
  await page.getByTestId('plan-card-0').click();
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide').locator('input[type="checkbox"]:checked')).toHaveCount(0);
  const kept = await page.evaluate(
    async ({ projectId, stepId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<Array<{ stepId: string; status: string; planSnapshotId: string }>>(
        (resolve, reject) => {
          const tx = db.transaction('actionProgress', 'readonly');
          const request = tx.objectStore('actionProgress').getAll();
          request.onsuccess = () =>
            resolve(
              (request.result as Array<{ projectId: string; stepId: string; status: string; planSnapshotId: string }>).filter(
                (row) => row.projectId === projectId,
              ),
            );
          request.onerror = () => reject(request.error);
        },
      );
      db.close();
      return rows.some((row) => row.stepId === stepId && row.status === 'done');
    },
    { projectId, stepId: firstId },
  );
  expect(kept).toBe(true);
  expect(leaked).toEqual([]);
  expect(errors).toEqual([]);
});

test('a quota failure keeps the previous done row and offers export', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __failPuts: boolean };
    holder.__failPuts = false;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(...args: unknown[]) {
      if (holder.__failPuts) throw new DOMException('injected failure', 'QuotaExceededError');
      return original.apply(this, args as [unknown]);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const first = guide.locator('input[data-testid^="action-"]:not([disabled])').first();
  const stepId = (await first.getAttribute('data-testid'))!;
  await first.click();
  await expect(guide.getByTestId(stepId)).toBeChecked();
  await expect(guide.getByTestId(stepId)).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { __failPuts: boolean }).__failPuts = true;
  });
  await guide.getByTestId(stepId).click();
  await expect(guide.getByTestId('action-error')).toContainText('persistence_failed');
  await expect(guide.getByTestId('action-export')).toBeVisible();
  await expect(guide.getByTestId(stepId)).toBeChecked();
  expect(errors).toEqual([]);
});

test('duplicate discloses excluded photos and does not reserve stock', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const leaked: string[] = [];
  collectErrors(page, errors);
  watchNetwork(page, leaked);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.goto('/#/projects');
  await expect(page.getByTestId('duplicate-disclosure')).toBeVisible();
  const duplicate = page.getByRole('button', { name: '복제' });
  await duplicate.press('Enter');
  await expect(page.getByTestId('copy-notice')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('copy-notice')).toContainText('사진 0건');
  await expect(page.getByTestId('copy-notice')).toContainText('예약하지 않습니다');
  await expect(page.getByTestId('owned-copy-note')).toBeVisible();
  expect(leaked).toEqual([]);
  expect(errors).toEqual([]);
});

test('an empty catalogue stays empty and an old rule cannot be completed', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const leaked: string[] = [];
  collectErrors(page, errors);
  watchNetwork(page, leaked);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/catalog');
  await page.getByTestId('save-empty-catalog').click();
  await expect(page.getByTestId('catalog-list')).toContainText('상품 없는 카탈로그', { timeout: 30000 });
  await expect(page.getByTestId('empty-catalog-note')).toBeVisible();

  await seededPlan(page);
  await acceptSelected(page);
  const guide = page.locator('#accepted-guide');
  const first = guide.locator('[data-testid^="action-"]:not([disabled])').first();
  await first.click();
  await expect(first).toBeChecked();
  const projectId = new URL(page.url()).hash.split('/')[2]!;
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = request.result as Array<{
          projectId: string;
          snapshot: { content: { versions: { ruleVersion: string } } };
        }>;
        const row = rows.find((item) => item.projectId === id);
        if (!row) {
          reject(new Error('snapshot missing'));
          return;
        }
        row.snapshot.content.versions.ruleVersion = 'zari-domain-v1';
        store.put(row);
        tx.oncomplete = () => resolve();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  }, projectId);
  await page.reload();
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30000,
  });
  const reloaded = page.locator('#accepted-guide');
  const box = reloaded.locator('[data-testid^="action-"]').first();
  if (await box.isEnabled()) await box.click();
  await expect(reloaded.getByTestId('action-error').or(reloaded.getByTestId('progress-ineligible'))).toBeVisible();
  const stillOld = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const version = await new Promise<string>((resolve, reject) => {
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      request.onsuccess = () => {
        const rows = request.result as Array<{
          projectId: string;
          snapshot: { content: { versions: { ruleVersion: string } } };
        }>;
        resolve(rows.find((item) => item.projectId === id)?.snapshot.content.versions.ruleVersion ?? '');
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return version;
  }, projectId);
  expect(stillOld).toBe('zari-domain-v1');
  expect(leaked).toEqual([]);
  expect(errors).toEqual([]);
});
