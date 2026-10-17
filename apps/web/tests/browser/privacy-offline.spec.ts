import { expect, test, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * z-privacy-offline on a real browser, real IndexedDB, real Worker/WASM and
 * the real service worker. Offline and force-close cases run on Chromium and
 * Firefox; WebKit (WPE) cannot reload offline and is covered by a cache check.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

/** Every request must stay on this origin, be a GET, and carry no body. */
function watchEgress(page: Page, bad: string[]) {
  page.on('request', (request: Request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    const origin = new URL(page.url() === 'about:blank' ? request.url() : page.url()).origin;
    if (url.origin !== origin) bad.push(`cross-origin ${request.method()} ${request.url()}`);
    else if (request.method() !== 'GET' || request.postData() !== null)
      bad.push(`non-GET ${request.method()} ${request.url()}`);
  });
}

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  return new URL(page.url()).hash.split('/')[2]!;
}

async function countRows(page: Page, store: string, projectId: string): Promise<number> {
  const all = (await page.evaluate(
    async ({ store }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result = await new Promise<Array<{ projectId?: string; logId?: string }>>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result.map((row) => row.projectId ?? row.logId ?? '');
    },
    { store },
  )) as string[];
  return all.filter((id) => id === projectId).length;
}

async function seedLocationLog(page: Page, projectId: string, observations: number) {
  await page.evaluate(
    async ({ projectId, observations }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('locationLogs', 'readwrite');
        tx.objectStore('locationLogs').put({
          schemaVersion: 1,
          logId: projectId,
          revision: '1',
          log: { observations: Array.from({ length: observations }, (_, i) => ({ id: `obs-${i}` })) },
          updatedAt: '2026-10-01T00:00:00.000Z',
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { projectId, observations },
  );
}

async function attachPhoto(page: Page, name: string) {
  await page.getByTestId('photo-file').setInputFiles({ name, mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByTestId('photo-list').locator('li img')).toHaveCount(1);
}

test('data screen: scopes, exports, scoped deletes, and nothing leaves the device', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const bad: string[] = [];
  collectErrors(page, errors);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const projectId = await createProject(page);
  await attachPhoto(page, 'room.png');
  await seedLocationLog(page, projectId, 2);
  watchEgress(page, bad);

  // Empty state first: a fresh profile has nothing to manage.
  await page.goto('/#/projects');
  await page.getByTestId('nav-data').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '이 기기에 있는 데이터를 관리합니다.' })).toBeVisible();

  // Storage, compatibility, and the local/external split are all stated.
  await expect(page.getByTestId('storage-usage')).toContainText('사용');
  await expect(page.getByTestId('compat-report')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('compat-journal')).toBeVisible();
  await expect(page.getByTestId('connection-list').locator('li[data-kind="local"]')).toHaveCount(4);
  await expect(page.getByTestId('connection-update')).toContainText('프로젝트·사진은 보내지 않습니다');
  await expect(page.getByTestId('connection-purchase-link')).toContainText('직접 누를 때만');
  await expect(page.getByTestId('connection-absent')).toContainText('외부 AI');
  await expect(page.getByTestId('connection-absent')).toContainText('사용 통계');

  const project = page.getByTestId(`data-project-${projectId}`);
  await expect(project).toBeVisible();
  await expect(page.getByTestId(`photo-count-${projectId}`)).toContainText('1장');
  await expect(page.getByTestId(`location-count-${projectId}`)).toHaveText('관측 2건');

  // Exports: project JSON (no photo bytes), location statement file, one photo.
  const projectDownload = page.waitForEvent('download');
  await page.getByTestId(`export-project-${projectId}`).click();
  const projectFile = await projectDownload;
  expect(projectFile.suggestedFilename()).toBe(`zari-${projectId}-standard.json`);
  const projectJson = JSON.parse(readFileSync((await projectFile.path())!, 'utf8')) as {
    exportVersion: number;
    excluded: string[];
  };
  expect(projectJson.exportVersion).toBe(1);
  expect(projectJson.excluded.some((e) => e.startsWith('attachment-bytes:'))).toBe(true);
  await expect(page.getByTestId('data-notice')).toContainText('사진 바이트는 이 파일에 들어 있지 않습니다');

  const locationDownload = page.waitForEvent('download');
  await page.getByTestId(`export-location-${projectId}`).click();
  const locationFile = await locationDownload;
  const locationJson = JSON.parse(readFileSync((await locationFile.path())!, 'utf8')) as {
    exportKind: string;
    log: { observations: unknown[] };
  };
  expect(locationJson.exportKind).toBe('zari-location-log');
  expect(locationJson.log.observations).toHaveLength(2);

  const photoButton = project.locator('[data-testid^="download-photo-"]');
  const photoDownload = page.waitForEvent('download');
  await photoButton.click();
  const photoFile = await photoDownload;
  expect(photoFile.suggestedFilename()).toBe('room.png');
  expect(readFileSync((await photoFile.path())!).subarray(0, 4).toString('hex')).toBe('89504e47');

  // Declining a delete changes nothing.
  await page.getByTestId(`delete-photos-${projectId}`).click();
  await expect(page.getByTestId('data-confirm')).toContainText('프로젝트 입력·채택 계획·위치 기록은 그대로입니다');
  await page.getByTestId('data-confirm-no').click();
  await expect(page.getByTestId('data-confirm')).toHaveCount(0);
  expect(await countRows(page, 'attachments', projectId)).toBe(1);

  // Photos only: bytes gone, project and location log stay.
  await page.getByTestId(`delete-photos-${projectId}`).focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('data-confirm-yes').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('data-notice')).toContainText('사진 1건을 이 기기에서 지웠습니다');
  await expect(page.getByTestId('data-notice')).toContainText('백업은 지워지지 않습니다');
  await expect(page.getByTestId(`photo-count-${projectId}`)).toContainText('0장');
  expect(await countRows(page, 'attachments', projectId)).toBe(0);
  expect(await countRows(page, 'projects', projectId)).toBe(1);
  expect(await countRows(page, 'locationLogs', projectId)).toBe(1);
  await expect(page.getByTestId(`delete-photos-${projectId}`)).toBeDisabled();

  // Search records only: the log is gone, the project stays.
  await page.getByTestId(`delete-location-${projectId}`).click();
  await page.getByTestId('data-confirm-yes').click();
  await expect(page.getByTestId('data-notice')).toContainText('위치 기록을 이 기기에서 지웠습니다');
  await expect(page.getByTestId(`location-count-${projectId}`)).toHaveText('관측 0건');
  expect(await countRows(page, 'locationLogs', projectId)).toBe(0);
  expect(await countRows(page, 'projects', projectId)).toBe(1);

  // Whole project: every row family is gone.
  await page.getByTestId(`delete-project-${projectId}`).click();
  await expect(page.getByTestId('data-confirm')).toContainText('공용 카탈로그와 보유 수납함은 그대로입니다');
  await page.getByTestId('data-confirm-yes').click();
  await expect(page.getByTestId('data-empty')).toBeVisible();
  for (const store of ['projects', 'drafts', 'inputs', 'snapshots', 'attachments', 'locationLogs'])
    expect(await countRows(page, store, projectId)).toBe(0);

  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('a failed delete says nothing was removed and keeps the rows', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __failDeletes: boolean };
    holder.__failDeletes = false;
    for (const proto of [IDBObjectStore.prototype, IDBCursor.prototype]) {
      const original = proto.delete;
      proto.delete = function del(this: unknown, ...args: unknown[]) {
        if (holder.__failDeletes) throw new DOMException('injected failure', 'QuotaExceededError');
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof proto.delete;
    }
  });
  const projectId = await createProject(page);
  await seedLocationLog(page, projectId, 2);
  await page.goto('/#/data');
  await expect(page.getByTestId(`location-count-${projectId}`)).toHaveText('관측 2건');
  await page.evaluate(() => {
    (window as unknown as { __failDeletes: boolean }).__failDeletes = true;
  });
  await page.getByTestId(`delete-location-${projectId}`).click();
  await page.getByTestId('data-confirm-yes').click();
  const notice = page.getByTestId('data-notice');
  await expect(notice).toHaveAttribute('data-kind', 'error');
  await expect(notice).toContainText('지워진 것은 없습니다');
  await expect(notice).not.toContainText('지웠습니다');
  await expect(page.getByTestId(`location-count-${projectId}`)).toHaveText('관측 2건');
  expect(await countRows(page, 'locationLogs', projectId)).toBe(1);
  expect(errors.filter((e) => !/QuotaExceeded|injected/.test(e))).toEqual([]);
});

test('a full disk never shows a photo as saved', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.addInitScript(() => {
    const holder = window as unknown as { __failAdds: boolean };
    holder.__failAdds = false;
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function add(this: IDBObjectStore, ...args: unknown[]) {
      if (holder.__failAdds) throw new DOMException('injected failure', 'QuotaExceededError');
      return (original as (...a: unknown[]) => IDBRequest).apply(this, args);
    } as typeof IDBObjectStore.prototype.add;
  });
  const projectId = await createProject(page);
  await page.evaluate(() => {
    (window as unknown as { __failAdds: boolean }).__failAdds = true;
  });
  await page.getByTestId('photo-file').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByTestId('photo-error')).toContainText('저장되지 않았습니다');
  await expect(page.getByTestId('photo-list').locator('li img')).toHaveCount(0);
  await expect(page.getByText('첨부된 사진이 없습니다.')).toBeVisible();
  expect(await countRows(page, 'attachments', projectId)).toBe(0);
  await page.goto('/#/data');
  await expect(page.getByTestId(`photo-count-${projectId}`)).toContainText('0장');
  expect(errors.filter((e) => !/QuotaExceeded|injected/.test(e))).toEqual([]);
});

test('data screen at 390px and forced colors keeps controls reachable', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: 'active' });
  const projectId = await createProject(page);
  await attachPhoto(page, 'a-very-long-photo-name-that-should-wrap-inside-the-card-without-widening-the-page.png');
  await seedLocationLog(page, projectId, 1);
  await page.goto('/#/data');
  await expect(page.getByTestId(`data-project-${projectId}`)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId(`delete-photos-${projectId}`).focus();
  await expect(page.getByTestId(`delete-photos-${projectId}`)).toBeFocused();
  await expect(page.getByTestId('storage-persisted')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an offline visit and a force-closed tab leave the adopted snapshot intact', async ({
  page,
  context,
  browserName,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  const bad: string[] = [];
  collectErrors(page, errors);
  watchEgress(page, bad);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Online: build the shell cache, then adopt a plan.
  await page.goto('/');
  await expect(page.getByTestId('project-list')).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const meta = await caches.open('zari-shell-meta');
        return (await meta.match('staged.json')) != null || (await meta.match('active.json')) != null;
      }),
    )
    .toBe(true);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30000 });
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('commit-input').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.getByTestId('goto-plan').click();
  await page.getByTestId('compute-plan').click();
  await expect(page.getByTestId('search-status')).toHaveAttribute('data-search', 'done', { timeout: 60000 });
  // Pick an alternative whose first guide step is enabled (no purchase first).
  const cards = await page.locator('[data-testid^="plan-card-"]').count();
  for (let i = 0; i < cards; i += 1) {
    await page.getByTestId(`plan-card-${i}`).click();
    const items = page.getByTestId('placements-list').locator('li');
    const note = await items.first().locator('.session-note').innerText();
    const y = Number(note.match(/\(-?\d+, (-?\d+), -?\d+\)/)?.[1]);
    if ((await items.count()) === 1 && y >= 15) break;
  }
  await page.getByTestId('accept-plan').click();
  await expect(page.locator('#accepted-guide')).toBeVisible();
  const projectId = new URL(page.url()).hash.split('/')[2]!;
  const planUrl = page.url();

  const adopted = async (p: Page) =>
    p.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('zari-local');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const all = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = db.transaction(store, 'readonly').objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result as T[]);
          request.onerror = () => reject(request.error);
        });
      const project = (await all<{ projectId: string; accepted: { planSnapshotId: string } | null }>('projects')).find(
        (row) => row.projectId === id,
      );
      const snapshots = (await all<{ projectId: string; planSnapshotId: string }>('snapshots')).filter(
        (row) => row.projectId === id,
      );
      db.close();
      return { accepted: project?.accepted ?? null, snapshots: JSON.stringify(snapshots) };
    }, projectId);

  const before = await adopted(page);
  expect(before.accepted).not.toBeNull();
  await page.reload(); // promotes the staged build at a navigation boundary
  await expect(page.locator('#accepted-guide')).toBeVisible();

  if (browserName === 'webkit') {
    // WebKit (WPE) crashes on offline reload. Check the same property's
    // substance instead: every manifest asset is in the staged cache, and the
    // adopted rows are unchanged after the reload.
    const missing = await page.evaluate(async () => {
      const scope = new URL('.', navigator.serviceWorker.controller!.scriptURL).href;
      const meta = await caches.open('zari-shell-meta');
      const hit = (await meta.match('staged.json')) ?? (await meta.match('active.json'));
      if (!hit) return ['<no manifest>'];
      const record = (await hit.json()) as { buildId: string; assets: string[] };
      const cache = await caches.open(`zari-build-${record.buildId}`);
      const absent: string[] = [];
      for (const asset of record.assets)
        if (!(await cache.match(new URL(asset, scope).href))) absent.push(asset);
      return absent;
    });
    expect(missing).toEqual([]);
    expect(await adopted(page)).toEqual(before);
    expect(bad).toEqual([]);
    return;
  }

  // Offline visit in a second tab, then force-close it while a write is in flight.
  await context.setOffline(true);
  const offlineTab = await context.newPage();
  collectErrors(offlineTab, errors);
  await offlineTab.goto(planUrl);
  await expect(offlineTab.locator('#accepted-guide')).toBeVisible({ timeout: 30000 });
  // A draft edit is a real IndexedDB write. Close the tab right after it
  // starts, without beforeunload, the way a killed browser would.
  await offlineTab.goto(new URL(`#/project/${projectId}`, planUrl).href);
  const width = offlineTab.getByRole('textbox', { name: '공간 안쪽 폭', exact: true });
  await expect(width).toBeVisible({ timeout: 30000 });
  await width.fill('611');
  await offlineTab.close({ runBeforeUnload: false });

  // Reopen offline: same adopted snapshot, byte for byte, and it still renders.
  const reopened = await context.newPage();
  collectErrors(reopened, errors);
  await reopened.goto(planUrl);
  await expect(reopened.locator('#accepted-guide')).toBeVisible({ timeout: 30000 });
  const after = await adopted(reopened);
  expect(after.accepted).toEqual(before.accepted);
  expect(after.snapshots).toBe(before.snapshots);
  await reopened.goto('about:blank');
  await reopened.goto(new URL('#/data', planUrl).href);
  await expect(reopened.getByTestId('compat-report')).toHaveAttribute('data-status', 'ok');
  await expect(reopened.getByTestId('shell-cache')).toHaveAttribute('data-available', 'true');
  await context.setOffline(false);

  expect(bad).toEqual([]);
  expect(errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e))).toEqual([]);
});
