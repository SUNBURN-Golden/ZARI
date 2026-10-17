import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import type { LocationLog } from '../../src/contracts/generated/dto';
import { AttachmentManager } from '../../src/features/attachments/model';
import {
  ABSENT_CONNECTIONS,
  CONNECTIONS,
  describeStoreFailure,
} from '../../src/features/privacy/connections';
import { lowSpace } from '../../src/features/privacy/device';
import { locationLogExport, photoFilename } from '../../src/features/privacy/exports';
import { emptyProjectForm } from '../../src/features/project/draft';
import { DB_VERSION, SCHEMA_VERSION, ZariDb, type AttachmentRow } from '../../src/persistence/db';
import { ProjectRepository, StoreError } from '../../src/persistence/repository';

const repo = (name = `test-${crypto.randomUUID()}`) => new ProjectRepository(new ZariDb(name));

function photo(projectId: string, id: string): AttachmentRow {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;
  return {
    schemaVersion: SCHEMA_VERSION,
    attachmentId: id,
    projectId,
    name: `${id}.png`,
    mime: 'image/png',
    byteSize: bytes.byteLength,
    originalByteSize: 10,
    width: 2,
    height: 2,
    bytes,
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}
const log = (n: number) => ({ observations: Array.from({ length: n }, (_, i) => ({ id: `o${i}` })) }) as unknown as LocationLog;

async function seeded() {
  const r = repo();
  const project = await r.createProject('범위 시험', emptyProjectForm());
  await r.addAttachment(photo(project.projectId, 'a1'));
  await r.addAttachment(photo(project.projectId, 'a2'));
  await r.saveLocationLog(project.projectId, log(3), '0');
  return { r, id: project.projectId };
}

it('reports each data scope with real counts', async () => {
  const { r, id } = await seeded();
  const scope = await r.dataScope(id);
  expect(scope.photos).toEqual({ count: 2, bytes: 10, corrupt: 0 });
  expect(scope.location).toEqual({ observations: 3, corrupt: false });
  expect(scope.otherLogs).toEqual({ feedback: 0, purchase: 0, inventory: 0 });
  expect((await r.listPhotoMeta(id)).map((p) => p.attachmentId).sort()).toEqual(['a1', 'a2']);
});

it('deleting photos leaves the project, snapshots, and the location log', async () => {
  const { r, id } = await seeded();
  expect(await r.deleteProjectPhotos(id)).toBe(2);
  const scope = await r.dataScope(id);
  expect(scope.photos.count).toBe(0);
  expect(scope.location.observations).toBe(3);
  expect((await r.db.projects.get(id))?.projectId).toBe(id);
  expect(await r.deleteProjectPhotos(id)).toBe(0);
});

it('deleting the location log leaves photos and the project', async () => {
  const { r, id } = await seeded();
  expect(await r.deleteLocationLog(id)).toBe(true);
  expect(await r.getLocationLog(id)).toBeNull();
  expect((await r.dataScope(id)).photos.count).toBe(2);
  expect(await r.deleteLocationLog(id)).toBe(false);
  expect((await r.db.projects.get(id))?.projectId).toBe(id);
});

it('deleting a project leaves no photo or location row behind', async () => {
  const { r, id } = await seeded();
  await r.deleteProject(id);
  const scope = await r.dataScope(id);
  expect(scope.photos.count).toBe(0);
  expect(scope.location.observations).toBe(0);
  expect(await r.db.attachments.count()).toBe(0);
  expect(await r.db.locationLogs.count()).toBe(0);
});

it('an unreadable location row is reported as unreadable, not as zero', async () => {
  const { r, id } = await seeded();
  await r.db.locationLogs.put({ schemaVersion: 1, logId: id, revision: 'x', log: log(1), updatedAt: '' });
  const scope = await r.dataScope(id);
  expect(scope.location).toEqual({ observations: null, corrupt: true });
  // Unreadable data can still be deleted by the user.
  expect(await r.deleteLocationLog(id)).toBe(true);
});

it('a full disk fails the photo attach through the manager and stores nothing', async () => {
  const { r, id } = await seeded();
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47]);
  const manager = new AttachmentManager(r, async (bytes, mime) => ({ bytes, width: 2, height: 2, mime }));
  const real = r.db.attachments.add.bind(r.db.attachments);
  r.db.attachments.add = (() => Promise.reject(new Dexie.QuotaExceededError('full'))) as never;
  const result = await manager.attach(id, {
    name: 'x.png',
    type: 'image/png',
    size: png.byteLength,
    bytes: png.buffer,
  });
  r.db.attachments.add = real as never;
  expect(result.status).toBe('rejected');
  if (result.status !== 'rejected') return;
  expect(result.code).toBe('persist_failed');
  expect(describeStoreFailure(result.detail ?? '')).toContain('저장되지 않았습니다');
  expect((await r.dataScope(id)).photos.count).toBe(2);
});

it('a full disk fails a location save and keeps the previous revision', async () => {
  const { r, id } = await seeded();
  const real = r.db.locationLogs.put.bind(r.db.locationLogs);
  r.db.locationLogs.put = (() => Promise.reject(new Dexie.QuotaExceededError('full'))) as never;
  const failure = await r.saveLocationLog(id, log(4), '1').catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(StoreError);
  expect((failure as StoreError).code).toBe('persistence_failed:quota');
  r.db.locationLogs.put = real as never;
  const row = await r.getLocationLog(id);
  expect(row?.revision).toBe('1');
  expect(row?.log.observations).toHaveLength(3);
});

it('store failures are worded as not saved', () => {
  expect(describeStoreFailure('persistence_failed:quota')).toContain('저장되지 않았습니다');
  expect(describeStoreFailure('persistence_failed:unavailable: x')).toContain('저장되지 않았습니다');
  expect(describeStoreFailure('migration_blocked: VersionError')).toContain('그대로');
  for (const text of [
    describeStoreFailure('persistence_failed:quota'),
    describeStoreFailure('persistence_failed:unavailable'),
  ])
    expect(text).not.toMatch(/저장됨|저장했습니다/);
});

it('flags low space only when usage and quota are both known', () => {
  expect(lowSpace({ usage: 90, quota: 100, persisted: null })).toBe(true);
  expect(lowSpace({ usage: 10, quota: 100, persisted: null })).toBe(false);
  expect(lowSpace({ usage: null, quota: 100, persisted: null })).toBe(false);
  expect(lowSpace({ usage: 90, quota: null, persisted: null })).toBe(false);
});

it('a v1 database upgrades through every step and keeps its bytes', async () => {
  const name = `legacy-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    projects: 'projectId, updatedAt, status',
    inputs: '[projectId+inputRevision], projectId',
    drafts: 'projectId',
    snapshots: '[projectId+inputRevision+planSnapshotId], projectId, planSnapshotId',
    ownedContainers: 'ownedContainerId, updatedAt',
    catalogs: 'catalogDigest, catalogVersion, origin',
    actionProgress: '[projectId+inputRevision+planSnapshotId+stepId], projectId',
    metadata: 'key',
  });
  await legacy.open();
  const snapshotRow = {
    schemaVersion: SCHEMA_VERSION,
    projectId: 'p-old',
    inputRevision: '1',
    planSnapshotId: 'cd'.repeat(32),
    snapshot: { marker: 'adopted-before-upgrade', nested: { a: [1, 2, 3] } },
    acceptedAt: '2020-01-01T00:00:00.000Z',
    engineBuildId: 'old',
  };
  await legacy.table('snapshots').add(snapshotRow);
  legacy.close();

  const r = repo(name);
  await r.open();
  const report = await r.compatibility();
  expect(report.status).toBe('ok');
  expect(report.openedVersion).toBe(DB_VERSION);
  expect(report.journals.map((j) => `${j.from}->${j.to}`)).toEqual([
    '1->2',
    '2->3',
    '3->4',
    '4->5',
    '5->6',
  ]);
  expect(await r.db.snapshots.toArray()).toEqual([snapshotRow]);
});

it('rows from a newer schema are reported, kept byte-for-byte, and never rewritten', async () => {
  const { r, id } = await seeded();
  const project = await r.db.projects.get(id);
  const newer = { ...project!, schemaVersion: SCHEMA_VERSION + 1, futureField: { keep: true } };
  await r.db.projects.put(newer as never);
  const report = await r.compatibility();
  expect(report.status).toBe('newer_rows');
  expect(report.newerSchemaRows).toBe(1);
  expect(await r.db.projects.get(id)).toEqual(newer);
  await expect(r.saveLocationLog(id, log(1), '1')).resolves.toBeDefined();
});

it('a database stored by a newer build is reported as newer and left untouched', async () => {
  const name = `future-${crypto.randomUUID()}`;
  const future = new Dexie(name);
  // Same stores as this build plus one it has never heard of, so Dexie has
  // no missing table to add and the stored version is not bumped.
  future.version(DB_VERSION + 1).stores({
    projects: 'projectId, updatedAt, status',
    inputs: '[projectId+inputRevision], projectId',
    drafts: 'projectId',
    snapshots: '[projectId+inputRevision+planSnapshotId], projectId, planSnapshotId',
    ownedContainers: 'ownedContainerId, updatedAt',
    catalogs: 'catalogDigest, catalogVersion, origin',
    actionProgress: '[projectId+inputRevision+planSnapshotId+stepId], projectId',
    attachments: 'attachmentId, projectId',
    inventoryLedgers: 'ledgerId, updatedAt',
    purchaseHandoffs: 'ledgerId, updatedAt',
    locationLogs: 'logId, updatedAt',
    feedbackLogs: 'logId, updatedAt',
    metadata: 'key',
    futureStore: 'id',
  });
  await future.open();
  await future.table('projects').add({ projectId: 'future', marker: 'keep' });
  future.close();
  const r = repo(name);
  const report = await r.compatibility();
  // Dexie 4 opens a newer stored version rather than refusing; the report
  // must still say the store is newer than this build.
  expect(report.status).toBe('newer_database');
  expect(report.openedVersion).toBe(DB_VERSION + 1);
  r.db.close();
  const raw = new Dexie(name);
  await raw.open();
  expect(Math.round(raw.backendDB().version / 10)).toBe(DB_VERSION + 1);
  expect(await raw.table('projects').toArray()).toEqual([{ projectId: 'future', marker: 'keep' }]);
  raw.close();
});

it('the location export is a plain statement file, not a project export', () => {
  const out = locationLogExport('p1', { schemaVersion: 1, logId: 'p1', revision: '2', log: log(1), updatedAt: '' }, 'T');
  expect(out.exportKind).toBe('zari-location-log');
  expect(out).not.toHaveProperty('exportVersion');
  expect(out.revision).toBe('2');
});

it('photo file names drop paths and unsafe characters', () => {
  expect(photoFilename('../../etc/pass wd.png', 'image/png', 'a1')).toBe('pass_wd.png');
  expect(photoFilename('', 'image/webp', 'a1')).toBe('a1.webp');
});

// ---- No silent transmission: static guard over the shipped sources -------

const SRC = join(__dirname, '..', '..', 'src');
const PUBLIC = join(__dirname, '..', '..', 'public');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const shipped = [...walk(SRC), ...walk(PUBLIC), join(SRC, '..', 'index.html')].filter(
  (file) => !file.includes(`${join('contracts', 'generated')}`) && /\.(ts|tsx|js|mjs|html|css|json)$/.test(file),
);

it('no shipped source calls a network API except the same-origin service worker', () => {
  const NETWORK =
    /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|importScripts|navigator\.connection/;
  const offenders = shipped
    .filter((file) => NETWORK.test(readFileSync(file, 'utf8')))
    .map((file) => relative(join(SRC, '..'), file))
    // The privacy module names these APIs in comments only.
    .filter((file) => !file.includes('features/privacy/'));
  expect(offenders).toEqual(['public/sw.js']);
});

it('the service worker only touches same-origin GET traffic and its own manifest', () => {
  const sw = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
  expect(sw).toContain("if (request.method !== 'GET') return;");
  expect(sw).toContain('origin !== self.location.origin');
  const fetches = [...sw.matchAll(/\bfetch\(([^)]*)\)/g)].map((m) => m[1]!.split(',')[0]!.trim());
  expect(fetches.sort()).toEqual(['MANIFEST', 'request', 'request']);
  expect(sw).not.toMatch(/method:\s*['"](POST|PUT|PATCH)/);
  expect(sw).not.toMatch(/\bbody\s*:/);
  expect(sw).not.toContain('indexedDB');
});

it('no analytics or AI SDK is a dependency and no third-party URL is loaded', () => {
  const pkg = readFileSync(join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8') +
    readFileSync(join(SRC, '..', 'package.json'), 'utf8');
  expect(pkg).not.toMatch(/analytics|gtag|segment|mixpanel|sentry|posthog|amplitude|openai|@anthropic|google-generative|langchain/i);
  const external = shipped
    .filter((file) => /\.(ts|tsx|html|css)$/.test(file))
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/(?:src|href|url\()\s*=?\s*["'(]?(https?:\/\/[^"')\s]+)/g)].map(
        (m) => `${relative(SRC, file)} ${m[1]}`,
      ),
    )
    .filter((entry) => !entry.includes('www.w3.org'));
  expect(external).toEqual([]);
});

it('every connection entry is classified and external links are user-opened only', () => {
  expect(CONNECTIONS.map((c) => c.kind).sort()).toEqual([
    'local',
    'local',
    'local',
    'local',
    'same-origin-update',
    'user-opened-link',
  ]);
  expect(ABSENT_CONNECTIONS.length).toBe(3);
  const anchors = shipped
    .filter((file) => file.endsWith('.tsx'))
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/<a\b[^>]*href=\{[^}]*(?:url|URL)[^}]*\}[^>]*>/gs)].map((m) => m[0]),
    );
  expect(anchors.length).toBeGreaterThan(0);
  for (const anchor of anchors) {
    expect(anchor).toContain('rel="noopener noreferrer"');
    expect(anchor).toContain('target="_blank"');
  }
});
