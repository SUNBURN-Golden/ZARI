import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type { CatalogSnapshot, PlanSnapshot, ProjectInput } from '../../src/contracts/generated/dto';
import { sampleProjectForm } from '../../src/features/project/draft';
import bundledCatalog from '../../src/features/project/synthetic-catalog.json';
import {
  PORTABLE_MAX_BUNDLE_BYTES,
  buildPortableBundle,
  portableMemberJson,
  stagePortableBundle,
} from '../../src/features/project/portable';
import { commitProjectImport } from '../../src/features/project/transfer';
import { SCHEMA_VERSION, ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';
import { WORKER_BUILD_ID, type WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

class WasmPort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: string[] = [];
  private runtime = new Runtime();
  private dead = false;
  postMessage(text: string) {
    this.sent.push(text);
    if (this.dead) return;
    let reply: string;
    try {
      reply = this.runtime.handle_json(text);
    } catch {
      this.onerror?.({} as ErrorEvent);
      return;
    }
    queueMicrotask(() => {
      if (!this.dead) this.onmessage?.({ data: reply } as MessageEvent);
    });
  }
  terminate() {
    this.dead = true;
  }
  kinds() {
    return this.sent.map((text) => JSON.parse(text).command.kind as string);
  }
}

const catalog = bundledCatalog as unknown as CatalogSnapshot;
const controllers: WorkerController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function world() {
  const db = new ZariDb(`portable-${crypto.randomUUID()}`);
  const repo = new ProjectRepository(db);
  const port = new WasmPort();
  const controller = new WorkerController(() => port);
  controllers.push(controller);
  return { db, repo, port, controller };
}

function normalizeSample(): { input: ProjectInput; digest: string } {
  const runtime = new Runtime();
  const meta = (requestId: string, over: Record<string, unknown> = {}) => ({
    protocolVersion: 1,
    schemaVersion: 1,
    workerSessionId: 'seed',
    projectActivationId: 'seed-act',
    projectId: 'seed',
    requestId,
    editorEpoch: '0',
    inputRevision: '0',
    contextId: null,
    ...over,
  });
  const send = (req: unknown) =>
    JSON.parse(runtime.handle_json(JSON.stringify(req))) as {
      event: Record<string, unknown> & { kind: string };
    };
  send({
    meta: meta('i', { projectActivationId: 'system', projectId: 'system' }),
    command: {
      kind: 'initialize',
      buildId: WORKER_BUILD_ID,
      expectedProtocolVersion: 1,
      expectedSchemaVersion: 1,
    },
  });
  send({ meta: meta('a'), command: { kind: 'activateProject', context: { kind: 'bootstrap' } } });
  const reply = send({
    meta: meta('n'),
    command: {
      kind: 'normalizeInput',
      input: { kind: 'project', project: sampleProjectForm() },
      priorInputDigest: null,
      formatRequests: [],
    },
  });
  if (reply.event.kind !== 'normalized' || !reply.event.normalizedInput) {
    throw new Error('seed normalize failed');
  }
  const normalized = reply.event.normalizedInput as { input: ProjectInput };
  return { input: normalized.input, digest: reply.event.inputDigest as string };
}

async function seedProject(repo: ProjectRepository) {
  const project = await repo.createProject('원본 프로젝트', sampleProjectForm());
  const { input, digest } = normalizeSample();
  await repo.putCatalog(catalog, 'test-seed');
  const committed = await repo.commitNormalizedInput({
    projectId: project.projectId,
    generation: '1',
    editorSessionId: 'seed',
    form: sampleProjectForm(),
    validation: { status: 'valid', diagnostics: [] },
    normalized: input,
    inputDigest: digest,
    engineBuildId: 'test',
  });
  if (committed.status !== 'committed') throw new Error('seed commit failed');
  const fixture = JSON.parse(
    readFileSync('fixtures/domain/record-snapshot-verified.json', 'utf8'),
  ) as { input: { snapshot: PlanSnapshot } };
  const snapshot = structuredClone(fixture.input.snapshot);
  await repo.db.snapshots.put({
    schemaVersion: SCHEMA_VERSION,
    projectId: project.projectId,
    inputRevision: '1',
    planSnapshotId: snapshot.planSnapshotId,
    snapshot,
    acceptedAt: '2026-10-09T00:00:00.000Z',
    engineBuildId: 'test',
  });
  await repo.db.projects.update(project.projectId, {
    accepted: { inputRevision: '1', planSnapshotId: snapshot.planSnapshotId },
  });
  await repo.saveInventoryLedger(
    project.projectId,
    { items: [], containers: [], events: [] },
    '0',
  );
  return { project, snapshot };
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}
function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (~crc) >>> 0;
}
function storedZip(name: string, data: Uint8Array, method = 0, uncompressed = data.length) {
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(data);
  const local = concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(uncompressed),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    data,
  ]);
  const central = concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(method),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(uncompressed),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    nameBytes,
  ]);
  return concat([
    local,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
}

it('export into an empty store keeps the canonical snapshot and a failed zip writes nothing', async () => {
  const source = world();
  const seeded = await seedProject(source.repo);
  const before = await source.repo.listProjects();
  const members = await portableMemberJson(
    source.repo,
    seeded.project.projectId,
    WORKER_BUILD_ID,
    { project: true, observations: true, catalog: true, snapshotAttachments: true },
  );
  expect(members.status).toBe('ready');
  if (members.status !== 'ready') return;
  const sourceClient = await source.controller.ensure();
  const built = await buildPortableBundle(sourceClient, members.command);
  expect(built.status).toBe('ready');
  if (built.status !== 'ready') return;
  expect(source.port.kinds().filter((kind) => kind === 'buildPortableBundle')).toEqual([
    'buildPortableBundle',
  ]);

  const empty = world();
  const emptyClient = await empty.controller.ensure();
  const staged = await stagePortableBundle(built.zip, empty.repo, emptyClient);
  expect(staged.status).toBe('staged');
  if (staged.status !== 'staged') return;
  expect(staged.summary.canonicalSnapshotId).toBe(seeded.snapshot.planSnapshotId);
  expect(staged.summary.portable).toBe(true);
  const imported = await commitProjectImport(empty.repo, staged.staged);
  expect(imported.projectId).not.toBe(seeded.project.projectId);
  const copy = await empty.repo.db.snapshots.where('projectId').equals(imported.projectId).toArray();
  expect(copy.map((row) => row.planSnapshotId)).toEqual([seeded.snapshot.planSnapshotId]);
  expect(copy[0]?.snapshot).toEqual(seeded.snapshot);
  const ledger = await empty.repo.getInventoryLedger(imported.projectId);
  expect(ledger?.ledger).toEqual({ items: [], containers: [], events: [] });
  expect(ledger?.ledgerId).toBe(imported.projectId);
  const sourceLedger = await source.repo.getInventoryLedger(seeded.project.projectId);
  expect(sourceLedger?.ledgerId).toBe(seeded.project.projectId);
  expect(await source.repo.listProjects()).toEqual(before);

  const bomb = storedZip('manifest.json', new Uint8Array([1, 2, 3, 4]), 8, 50_000_000);
  const beforeKinds = empty.port.kinds().length;
  const rejected = await stagePortableBundle(bomb, empty.repo, emptyClient);
  expect(rejected.status).toBe('rejected');
  if (rejected.status === 'rejected') expect(rejected.issues[0]?.code).toBe('compression_bomb');
  const afterBomb = empty.port.kinds().slice(beforeKinds);
  expect(afterBomb.filter((kind) => kind === 'inspectPortableBundle')).toEqual([
    'inspectPortableBundle',
  ]);
  expect(afterBomb.filter((kind) => kind === 'verifyRecord')).toEqual([]);
  expect(await empty.repo.listProjects()).toHaveLength(1);
  expect(
    (await empty.repo.db.snapshots.where('projectId').equals(imported.projectId).toArray())[0]
      ?.planSnapshotId,
  ).toBe(seeded.snapshot.planSnapshotId);

  const slipped = await stagePortableBundle(
    storedZip('../secret.json', new TextEncoder().encode('{}')),
    empty.repo,
    emptyClient,
  );
  expect(slipped.status).toBe('rejected');
  if (slipped.status === 'rejected') expect(slipped.issues[0]?.code).toBe('path_escape');
  const old = storedZip(
    'manifest.json',
    new TextEncoder().encode(
      '{"portableBundleVersion":0,"kind":"zari-portable","producer":{"app":"zari-web","schemaVersion":1,"buildId":"zari-domain-7"},"exportedAt":"2026-10-09T00:00:00.000Z","inclusion":{"project":false,"observations":false,"catalog":false,"snapshotAttachments":false},"policy":{"photoBytes":"excluded","location":"stripped","personalData":"omitted"},"members":[]}',
    ),
  );
  const ancient = await stagePortableBundle(old, empty.repo, emptyClient);
  expect(ancient.status).toBe('rejected');
  if (ancient.status === 'rejected') expect(ancient.issues[0]?.code).toBe('unsupported_version');
  const huge = new Uint8Array(PORTABLE_MAX_BUNDLE_BYTES + 1);
  huge[0] = 0x50;
  huge[1] = 0x4b;
  const oversized = await stagePortableBundle(huge, empty.repo, emptyClient);
  expect(oversized.status).toBe('rejected');
  if (oversized.status === 'rejected') expect(oversized.issues[0]?.code).toBe('import_too_large');
  expect(empty.port.kinds().filter((kind) => kind === 'inspectPortableBundle')).toHaveLength(4);
  expect(await empty.repo.listProjects()).toHaveLength(1);
  expect((await source.repo.listProjects())[0]?.name).toBe('원본 프로젝트');
});

it('a location key and a missing project are refused before any write', async () => {
  const host = world();
  const client = await host.controller.ensure();
  const snap = '297d1d8671646e55c9f27dc3d047879a975884d688ce9d8d09308d051ab60608';
  const located = await buildPortableBundle(client, {
    exportedAt: '2026-10-09T00:00:00.000Z',
    inclusion: {
      project: true,
      observations: false,
      catalog: false,
      snapshotAttachments: true,
    },
    projectJson: JSON.stringify({ project: { projectId: 'p' }, draft: null, actionProgress: [] }),
    observationsJson: '',
    catalogJson: '',
    snapshotsJson: JSON.stringify({
      snapshots: [{ inputRevision: '1', planSnapshotId: snap, snapshot: { planSnapshotId: snap } }],
    }),
    attachmentsJson: JSON.stringify({ attachments: [{ attachmentId: 'a', latitude: 37 }] }),
  });
  expect(located.status).toBe('rejected');
  if (located.status === 'rejected') expect(located.issues[0]?.code).toBe('location_present');
  expect(located.status === 'ready' ? located.zip.byteLength : 0).toBe(0);
  expect(await host.repo.listProjects()).toEqual([]);
});
