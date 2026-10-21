import { test, expect, type Page } from '@playwright/test';
import {
  collectErrors,
  computeDone,
  openPlan,
  projectIdOf,
  readCards,
  seedSample,
  selectKind,
} from './product-setup';

/**
 * z-local-delivery real-browser evidence for the install/update/migration
 * paths: a fresh install saves and restores; a v1 database upgrades in place
 * to v6 keeping every row; a newer database is refused read-only without
 * deleting anything; a blocked upgrade applies nothing while held. Real
 * Chromium, real IndexedDB (Dexie + raw IDB), real WASM Worker — no mocks.
 */

const WIDTH = { name: '공간 안쪽 폭', exact: true } as const;
/** Store set declared at schema version 1 (see ZariDb.version(1)). */
const V1_STORES: Record<string, { keyPath: string | string[]; indexes: string[] }> = {
  projects: { keyPath: 'projectId', indexes: ['updatedAt', 'status'] },
  inputs: { keyPath: ['projectId', 'inputRevision'], indexes: ['projectId'] },
  drafts: { keyPath: 'projectId', indexes: [] },
  snapshots: {
    keyPath: ['projectId', 'inputRevision', 'planSnapshotId'],
    indexes: ['projectId', 'planSnapshotId'],
  },
  ownedContainers: { keyPath: 'ownedContainerId', indexes: ['updatedAt'] },
  catalogs: { keyPath: 'catalogDigest', indexes: ['catalogVersion', 'origin'] },
  actionProgress: {
    keyPath: ['projectId', 'inputRevision', 'planSnapshotId', 'stepId'],
    indexes: ['projectId'],
  },
  metadata: { keyPath: 'key', indexes: [] },
};

async function idbGetAll(page: Page, stores: string[]) {
  return page.evaluate(async (names) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const out: Record<string, unknown[]> = { __objectStoreNames: [...db.objectStoreNames] };
    for (const name of names) {
      if (!db.objectStoreNames.contains(name)) {
        out[name] = [];
        continue;
      }
      out[name] = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name, 'readonly').objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
    }
    db.close();
    return out;
  }, stores);
}

/** Seed before the application ever mounts, so no repository fence is set. */
async function seedMinimalDatabase(page: Page, version: number) {
  await page.goto('/tests/harness.html');
  await page.evaluate(async (nativeVersion) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('zari-local', nativeVersion);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('projects', { keyPath: 'projectId' })
          .put({ projectId: 'future-project', name: 'preserve this row' });
        request.result.createObjectStore('zariFuture', { keyPath: 'id' })
          .put({ id: 'future', payload: 'preserve future bytes' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }, version);
}

async function nativeVersion(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('zari-local');
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => reject(request.error);
  }));
}

test('direct data route fences its first read without extending newer storage', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seedMinimalDatabase(page, 70);
  const before = await idbGetAll(page, ['projects', 'zariFuture']);
  await page.goto('/#/data');
  await expect(page.getByTestId('compat-report')).toHaveAttribute('data-status', 'newer_database');
  await expect(page.getByTestId('db-version-notice')).toContainText('열지 않았고');
  expect(await nativeVersion(page)).toBe(70);
  expect(await idbGetAll(page, ['projects', 'zariFuture'])).toEqual(before);
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByTestId('db-version-notice')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByTestId('db-version-notice')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('A');
  expect(errors).toEqual([]);
});

for (const route of ['/', '/#/data']) {
  test(`peer upgrade after probe is refused at native open on ${route}`, async ({ page }) => {
    const errors: string[] = [];
    collectErrors(page, errors);
    await seedMinimalDatabase(page, 10);
    const before = await idbGetAll(page, ['projects', 'zariFuture']);
    await page.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      let injected = false;
      IDBFactory.prototype.open = function (name: string, version?: number) {
        if (name === 'zari-local' && version === 60 && !injected) {
          injected = true;
          // The repository's unversioned probe has finished. Queue the peer
          // upgrade before the app's versioned open, using real IDB ordering.
          // No sleeps or application schema mocks: Dexie receives the native
          // VersionError and must not reconcile the two-store v70 database.
          const peer = open.call(this, name, 70);
          peer.onsuccess = () => peer.result.close();
        }
        return version === undefined ? open.call(this, name) : open.call(this, name, version);
      };
    });
    await page.goto(route);
    await expect(page.getByTestId('db-version-notice')).toContainText('열지 않았고');
    if (route === '/') {
      await expect(page.getByTestId('projects-error')).toContainText('새로운 저장 형식');
      await expect(page.getByTestId('create-project')).toBeDisabled();
      await page.getByTestId('create-project').evaluate((button: HTMLButtonElement) => button.click());
      // In-document navigation retains the very repository that hit the race.
      await page.evaluate(() => { location.hash = '#/data'; });
    }
    await expect(page.getByTestId('compat-report')).toHaveAttribute('data-status', 'newer_database');
    expect(await nativeVersion(page)).toBe(70);
    expect(await idbGetAll(page, ['projects', 'zariFuture'])).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('fresh install: create, save, reload, and a clean compatibility report', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seedSample(page);
  const projectId = await projectIdOf(page);
  const committed = await page.getByRole('textbox', WIDTH).inputValue();

  // Real reload: the committed draft comes back from IndexedDB.
  await page.reload();
  await expect(page.getByTestId('worker-state')).toHaveText('ready', { timeout: 30_000 });
  await expect(page.getByRole('textbox', WIDTH)).toHaveValue(committed);

  // The project is listed and the storage contract is reported cleanly.
  await page.goto('/');
  await expect(page.getByTestId(`project-row-${projectId}`)).toBeVisible();
  await page.goto('/#/data');
  await expect(page.getByTestId('compat-report')).toHaveAttribute('data-status', 'ok');
  // A fresh database is created at the current version: no upgrade ran, so no
  // journal is recorded (journals prove real upgrades only).
  await expect(page.getByTestId('compat-journal')).toContainText('없음');
  await expect(page.getByTestId('db-version-notice')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('existing data upgrade: a v1 database migrates to v6 keeping every row', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seedSample(page);
  const projectId = await projectIdOf(page);
  await openPlan(page);
  await computeDone(page);
  const cards = await readCards(page);
  await selectKind(page, cards, 'no-purchase');
  const snapshotId = (await page.getByTestId('snapshot-id').innerText()).slice(0, 40);
  await page.getByTestId('accept-plan').click();
  await expect(page.getByTestId('accepted-badge')).toBeVisible();

  // Capture the durable rows a long-lived v1-era project would hold.
  const captured = await idbGetAll(page, Object.keys(V1_STORES));
  const capturedSnapshots = captured.snapshots ?? [];
  expect(captured.projects?.length).toBeGreaterThan(0);
  expect(capturedSnapshots.length).toBeGreaterThan(0);

  // Recreate the database at version 1 with those rows, the way an old build
  // left it. deleteDatabase fires versionchange on the app's connection; the
  // repository closes it and surfaces the reload prompt instead of blocking.
  await page.evaluate(async (stores) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('zari-local');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('delete blocked by an open connection'));
    });
    await new Promise<void>((resolve, reject) => {
      // Dexie stores declared version n at IDB version n*10: a v1-era
      // database is stored at version 10.
      const request = indexedDB.open('zari-local', 10);
      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction!;
        for (const [name, decl] of Object.entries(stores.schema)) {
          const store = db.createObjectStore(name, { keyPath: decl.keyPath });
          for (const index of decl.indexes) store.createIndex(index, index);
        }
        for (const [name, rows] of Object.entries(stores.rows)) {
          const store = tx.objectStore(name);
          for (const row of rows as Record<string, unknown>[]) store.put(row);
        }
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }, {
    schema: V1_STORES,
    rows: Object.fromEntries(
      Object.entries(captured)
        .filter(([name]) => name !== '__objectStoreNames')
        .map(([name, rows]) => [
          name,
          name === 'metadata'
            ? (rows as { key: string; payload: unknown }[]).map((row) =>
                row.key === 'db:verno' ? { ...row, payload: { version: 1 } } : row,
              )
            : rows,
        ]),
    ),
  });
  await expect(page.getByTestId('db-version-notice')).toBeVisible();

  // The current build upgrades 1→6 in place: journals land, rows stay.
  await page.goto('/');
  await expect(page.getByTestId(`project-row-${projectId}`)).toBeVisible();
  await page.goto('/#/data');
  await expect(page.getByTestId('compat-report')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('compat-journal')).toContainText(
    '1→2, 2→3, 3→4, 4→5, 5→6',
  );

  const migrated = await idbGetAll(page, Object.keys(V1_STORES));
  for (const store of Object.keys(V1_STORES)) {
    if (store === 'metadata') {
      const durable = (rows: unknown[]) => rows.filter(
        (row) => !(row as { key: string }).key.startsWith('migration:'),
      );
      expect(durable(migrated[store] ?? [])).toEqual(durable(captured[store] ?? []));
    } else {
      expect(migrated[store], `migrated ${store}`).toEqual(captured[store]);
    }
  }

  // The upgraded rows keep working: the same draft and the same accepted plan.
  await page.goto(`/#/project/${projectId}/plan`);
  await expect(page.getByTestId('plan-context')).toHaveAttribute('data-context', 'installed', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('accepted-badge')).toBeVisible();
  await expect(page.getByTestId('snapshot-id')).toContainText(snapshotId.slice(0, 24));
  const after = await idbGetAll(page, ['projects', 'snapshots', 'drafts']);
  expect(after.__objectStoreNames).toEqual(
    expect.arrayContaining([
      'attachments',
      'inventoryLedgers',
      'purchaseHandoffs',
      'locationLogs',
      'feedbackLogs',
    ]),
  );
  expect(after.snapshots).toHaveLength(capturedSnapshots.length);
  expect(errors).toEqual([]);
});

test('update failure: a newer database is refused and every row is preserved', async ({
  page,
}) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seedSample(page);
  const projectId = await projectIdOf(page);

  // Capture every durable row before the upgrade so preservation is checked
  // row-for-row, not just by the presence of one project.
  const before = await idbGetAll(page, Object.keys(V1_STORES).concat([
    'attachments',
    'inventoryLedgers',
    'purchaseHandoffs',
    'locationLogs',
    'feedbackLogs',
  ]));
  expect((before.projects as unknown[]).length).toBeGreaterThan(0);

  // A newer build leaves a version-7 database behind (Dexie stores declared
  // version n at IDB version n*10, so v7 is 70). The versionchange event
  // closes this tab's connection and the prompt tells the user to reload.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local', 70);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('zariFuture', { keyPath: 'id' }).put({ id: 'newer' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
  });
  await expect(page.getByTestId('db-version-notice')).toBeVisible();

  // This build refuses the newer storage instead of opening or deleting it.
  await page.goto('/');
  await expect(page.getByTestId('projects-error')).toContainText('새로운 저장 형식');
  await expect(page.getByTestId('projects-error')).toContainText('데이터는 그대로');
  await expect(page.getByTestId('db-version-notice')).toContainText('열지 않았고');

  // Every storage mutation stays disabled while the repository is fenced.
  await expect(page.getByTestId('create-project')).toBeDisabled();
  await expect(page.getByTestId('create-example')).toBeDisabled();
  await expect(page.getByTestId('import-project')).toBeDisabled();
  await page.getByTestId('create-project').evaluate((button: HTMLButtonElement) => button.click());
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/#\/project\//);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('db-version-notice')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.goto('/#/data');
  await expect(page.getByTestId('compat-report')).toHaveAttribute(
    'data-status',
    'newer_database',
  );

  // The v7 database still holds every row the failed update never touched.
  const rows = await idbGetAll(page, Object.keys(before).filter((s) => s !== '__objectStoreNames'));
  expect(rows.__objectStoreNames).toEqual(
    expect.arrayContaining([...(before.__objectStoreNames as string[]), 'zariFuture']),
  );
  for (const store of Object.keys(before)) {
    if (store === '__objectStoreNames') continue;
    expect(rows[store], `store ${store} must be unchanged`).toEqual(before[store]);
  }
  expect(
    (rows.projects as { projectId: string }[]).some((row) => row.projectId === projectId),
  ).toBe(true);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('a blocked upgrade applies nothing while an old connection holds', async ({ page }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await seedSample(page);
  const projectId = await projectIdOf(page);

  // A second connection that does not release on versionchange blocks the
  // version-7 upgrade; the blocked request writes nothing and deletes nothing.
  const outcome = await page.evaluate(async (pid) => {
    const held = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let applied = false;
    let blockedSeen = false;
    const upgraded = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zari-local', 70);
      request.onupgradeneeded = () => {
        applied = true;
      };
      request.onblocked = () => {
        blockedSeen = true;
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const whileBlocked = applied;
    const stillThere = await new Promise<unknown[]>((resolve, reject) => {
      const request = held.transaction('projects', 'readonly').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    held.close();
    const db = await upgraded;
    db.close();
    return {
      whileBlocked,
      blockedSeen,
      applied,
      kept: stillThere.some(
        (row) => (row as { projectId?: string }).projectId === pid,
      ),
    };
  }, projectId);

  expect(outcome.blockedSeen).toBe(true);
  expect(outcome.whileBlocked).toBe(false);
  expect(outcome.kept).toBe(true);
  expect(outcome.applied).toBe(true);
  // The app's own connection released promptly and told the user to reload.
  await expect(page.getByTestId('db-version-notice')).toBeVisible();
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});
