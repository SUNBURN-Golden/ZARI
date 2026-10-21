import 'fake-indexeddb/auto';
import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { emptyProjectForm } from '../../src/features/project/draft';
import { DB_VERSION, ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';

/**
 * z-local-delivery storage invariants: a fresh database is created at the
 * current version with no migration journals (journals prove real upgrades),
 * and a versionchange request from a newer build closes this connection and
 * surfaces the reload prompt callback instead of blocking or deleting data.
 * A stored-newer database is refused fail-closed: the tab never opens it,
 * never writes to it, and every later read/write path rejects until reload.
 */

/** Raw IndexedDB look at the stored database, outside Dexie entirely. */
function rawStore(name: string): Promise<{ version: number; stores: string[]; projects: unknown[] }> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const stores = [...db.objectStoreNames];
      const finish = (projects: unknown[]) => {
        db.close();
        resolve({ version: db.version, stores, projects });
      };
      if (!stores.includes('projects')) {
        finish([]);
        return;
      }
      const all = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      all.onsuccess = () => finish(all.result as unknown[]);
      all.onerror = () => reject(all.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/** A newer build's leftover database at one declared version past this build. */
async function seedNewerDatabase(name: string, projectId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION * 10 + 10);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('zariFuture', { keyPath: 'id' });
      const projects = request.result.createObjectStore('projects', { keyPath: 'projectId' });
      projects.put({ projectId, name: 'newer-build row' });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

it('a fresh database opens at the current version with no migration journals', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const repo = new ProjectRepository(new ZariDb(name));
  await repo.open();
  const journals = await repo.db.metadata.where('key').startsWith('migration:').toArray();
  expect(journals).toEqual([]);
  expect((await repo.db.metadata.get('db:verno'))?.payload).toEqual({
    version: DB_VERSION,
  });
});

it('versionchange closes the connection and calls onVersionChange', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const repo = new ProjectRepository(new ZariDb(name));
  await repo.open();
  let notified = 0;
  repo.onVersionChange = () => {
    notified += 1;
  };
  // A newer build's open at a higher version asks this connection to close.
  // Dexie stores declared version n at IDB version n*10, so v7 is stored as 70.
  const newer = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION * 10 + 10);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('zariFuture', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('upgrade blocked: the old connection did not close'));
  });
  newer.close();
  expect(notified).toBe(1);
  expect(repo.db.isOpen()).toBe(false);
  // The stale tab fails closed: Dexie would silently reopen the newer
  // database, so the repository fences opens, reads and writes until reload.
  expect(repo.fenced).toBe(true);
  await expect(repo.open()).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(
    repo.createProject('x', emptyProjectForm()),
  ).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(repo.listProjects()).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(repo.deleteProject('x')).rejects.toMatchObject({ code: 'migration_blocked' });
  // Reads stay fenced too: the connection must not silently reopen.
  expect(repo.db.isOpen()).toBe(false);
  const compat = await repo.compatibility();
  expect(compat.status).toBe('newer_database');
  expect(repo.db.isOpen()).toBe(false);
});

it('an old build refuses to open a newer stored database', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const projectId = crypto.randomUUID();
  // A newer build left a version-70 database behind (Dexie stores v7 as 70).
  await seedNewerDatabase(name, projectId);
  const repo = new ProjectRepository(new ZariDb(name));
  // The raw version probe fires before Dexie ever opens the store, so the
  // refusal cannot extend or write the newer schema.
  await expect(repo.open()).rejects.toMatchObject({ code: 'migration_blocked' });
  expect(repo.fenced).toBe(true);
  expect(repo.db.isOpen()).toBe(false);
  // Every subsequent write path is fenced — not just the queue but the
  // auto-open reads Dexie would otherwise reopen into the newer schema.
  await expect(
    repo.createProject('x', emptyProjectForm()),
  ).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(repo.listProjects()).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(repo.loadBundle(projectId)).rejects.toMatchObject({
    code: 'migration_blocked',
  });
  await expect(repo.deleteProject(projectId)).rejects.toMatchObject({
    code: 'migration_blocked',
  });
  await expect(repo.open()).rejects.toMatchObject({ code: 'migration_blocked' });
  // Read-only compatibility still reports, never writes, never reopens.
  const compat = await repo.compatibility();
  expect(compat.status).toBe('newer_database');
  expect(compat.openedVersion).toBe(DB_VERSION + 1);
  expect(repo.db.isOpen()).toBe(false);
  // The refused tab changed nothing: same raw version, same stores, same row.
  const after = await rawStore(name);
  expect(after.version).toBe(DB_VERSION * 10 + 10);
  expect(after.stores).toEqual(['projects', 'zariFuture']);
  expect(after.projects).toEqual([{ projectId, name: 'newer-build row' }]);
});

it('compatibility() detects a newer database and fences the tab', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const projectId = crypto.randomUUID();
  await seedNewerDatabase(name, projectId);
  const repo = new ProjectRepository(new ZariDb(name));
  // The data screen's read-only check is the first touch on this path; it
  // reports the refusal and latches the same fence open() would.
  const compat = await repo.compatibility();
  expect(compat.status).toBe('newer_database');
  expect(compat.openedVersion).toBe(DB_VERSION + 1);
  expect(repo.fenced).toBe(true);
  await expect(
    repo.createProject('x', emptyProjectForm()),
  ).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(repo.open()).rejects.toMatchObject({ code: 'migration_blocked' });
  const after = await rawStore(name);
  expect(after.version).toBe(DB_VERSION * 10 + 10);
  expect(after.projects).toEqual([{ projectId, name: 'newer-build row' }]);
});

for (const access of ['read', 'write'] as const) {
  it(`${access}-first access refuses newer storage before Dexie can auto-open`, async () => {
    const name = `test-${crypto.randomUUID()}`;
    await seedNewerDatabase(name, crypto.randomUUID());
    const before = await rawStore(name);
    const repo = new ProjectRepository(new ZariDb(name));
    const notify = vi.fn();
    repo.onVersionChange = notify;
    const operation = access === 'read'
      ? repo.listProjects()
      : repo.createProject('must not be saved', emptyProjectForm());
    await expect(operation).rejects.toMatchObject({ code: 'migration_blocked' });
    expect(repo.fenced).toBe(true);
    expect(repo.db.isOpen()).toBe(false);
    expect(notify).toHaveBeenCalledExactlyOnceWith('stored_newer');
    await expect(repo.compatibility()).resolves.toMatchObject({ status: 'newer_database' });
    await expect(repo.createProject('still refused', emptyProjectForm()))
      .rejects.toMatchObject({ code: 'migration_blocked' });
    expect(await rawStore(name)).toEqual(before);
  });
}

for (const access of ['open', 'compatibility', 'read', 'write'] as const) {
  it(`${access} refuses an upgrade between the probe and native open without schema reconciliation`, async () => {
    const name = `test-${crypto.randomUUID()}`;
    const repo = new ProjectRepository(new ZariDb(name));
    const nativeOpen = repo.db.open.bind(repo.db);
    let before: Awaited<ReturnType<typeof rawStore>> | undefined;
    // Deterministic interleaving: the probe has released its raw connection;
    // a peer installs v70 before Dexie's first native open at v60. Dexie must
    // not retry without a version or add its missing stores at v71.
    vi.spyOn(repo.db, 'open').mockImplementationOnce(() => Dexie.Promise.resolve(
      seedNewerDatabase(name, crypto.randomUUID()),
    ).then(async () => {
      before = await rawStore(name);
    }).then(nativeOpen));
    if (access === 'compatibility') {
      await expect(repo.compatibility()).resolves.toMatchObject({
        status: 'newer_database', openedVersion: DB_VERSION + 1,
      });
    } else {
      const operation = access === 'open' ? repo.open()
        : access === 'read' ? repo.listProjects()
          : repo.createProject('must not be saved', emptyProjectForm());
      await expect(operation).rejects.toMatchObject({ code: 'migration_blocked' });
    }
    expect(before).toBeDefined();
    expect(repo.fenced).toBe(true);
    expect(repo.db.isOpen()).toBe(false);
    await expect(repo.listProjects()).rejects.toMatchObject({ code: 'migration_blocked' });
    await expect(repo.createProject('still refused', emptyProjectForm()))
      .rejects.toMatchObject({ code: 'migration_blocked' });
    expect(await rawStore(name)).toEqual(before);
  });
}

it('a native version just above the supported boundary is also fenced', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION * 10 + 1);
    request.onupgradeneeded = () => request.result.createObjectStore('future');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  const before = await rawStore(name);
  const repo = new ProjectRepository(new ZariDb(name));
  await expect(repo.listProjects()).rejects.toMatchObject({ code: 'migration_blocked' });
  expect(await repo.compatibility()).toMatchObject({
    status: 'newer_database', openedVersion: DB_VERSION + 0.1,
  });
  expect(await rawStore(name)).toEqual(before);
});

it('release-candidate manifest matches the repository pins', () => {
  const output = execFileSync('node', ['scripts/check-release-candidate.mjs'], {
    encoding: 'utf8',
  });
  expect(output).toContain('release candidate manifest consistent');
  expect(output).toContain('NOT_AUTHORIZED');
});
