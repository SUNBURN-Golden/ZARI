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
  await page.goto('/#/data');
  await expect(page.getByTestId('compat-report')).toHaveAttribute(
    'data-status',
    'newer_database',
  );

  // The v7 database still holds every row the failed update never touched.
  const rows = await idbGetAll(page, ['projects', 'drafts']);
  expect(rows.__objectStoreNames).toContain('zariFuture');
  expect(
    (rows.projects as { projectId: string }[]).some((row) => row.projectId === projectId),
  ).toBe(true);
  expect((rows.drafts as { projectId: string }[]).length).toBeGreaterThan(0);
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
