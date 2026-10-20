import 'fake-indexeddb/auto';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { emptyProjectForm } from '../../src/features/project/draft';
import { DB_VERSION, ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';

/**
 * z-local-delivery storage invariants: a fresh database is created at the
 * current version with no migration journals (journals prove real upgrades),
 * and a versionchange request from a newer build closes this connection and
 * surfaces the reload prompt callback instead of blocking or deleting data.
 */

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
  // database, so the repository fences opens and writes until reload.
  await expect(repo.open()).rejects.toMatchObject({ code: 'migration_blocked' });
  await expect(
    repo.createProject('x', emptyProjectForm()),
  ).rejects.toMatchObject({ code: 'migration_blocked' });
});

it('an old build refuses to open a newer stored database', async () => {
  const name = `test-${crypto.randomUUID()}`;
  // A newer build left a version-70 database behind (Dexie stores v7 as 70).
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION * 10 + 10);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('zariFuture', { keyPath: 'id' });
      request.result.createObjectStore('projects', { keyPath: 'projectId' });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
  const repo = new ProjectRepository(new ZariDb(name));
  // Dexie 4 opens the newer store without error; open() fences on the
  // backend version instead.
  await expect(repo.open()).rejects.toMatchObject({ code: 'migration_blocked' });
  // Read-only compatibility still reports, never writes.
  const compat = await repo.compatibility();
  expect(compat.status).toBe('newer_database');
});

it('release-candidate manifest matches the repository pins', () => {
  const output = execFileSync('node', ['scripts/check-release-candidate.mjs'], {
    encoding: 'utf8',
  });
  expect(output).toContain('release candidate manifest consistent');
  expect(output).toContain('NOT_AUTHORIZED');
});
