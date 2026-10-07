import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import { WORKER_BUILD_ID } from '../../src/worker/client';
import type {
  CatalogSnapshot,
  PlanSnapshot,
  ProjectInput,
} from '../../src/contracts/generated/dto';
import { AttachmentManager, sniffMime } from '../../src/features/attachments/model';
import { csvCell, toCsv } from '../../src/features/plan/csv';
import {
  emptyProjectForm,
  sampleProjectForm,
} from '../../src/features/project/draft';
import bundledCatalog from '../../src/features/project/synthetic-catalog.json';
import {
  commitProjectImport,
  stageProjectImport,
} from '../../src/features/project/transfer';
import {
  SCHEMA_VERSION,
  ZariDb,
  type AttachmentRow,
} from '../../src/persistence/db';
import { exportProject } from '../../src/persistence/export';
import {
  ProjectRepository,
  StoreError,
} from '../../src/persistence/repository';
import { ProbeClient, type WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';

/**
 * REAL-RUST coverage for Ticket 009: export/import/duplicate, quarantine
 * recovery, formula-safe CSV, local-only photo bounds, the v1→v2 schema
 * upgrade journal, and atomic deletion. `WasmPort` runs the actual
 * `zari_wasm` Runtime in-process, so verifyRecord checks are computed by
 * Rust — only the Worker transport is faked.
 */
initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

class WasmPort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  private runtime = new Runtime();
  private dead = false;
  postMessage(text: string) {
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
}

const catalog = bundledCatalog as unknown as CatalogSnapshot;
const controllers: WorkerController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function world() {
  const db = new ZariDb(`test-${crypto.randomUUID()}`);
  const repo = new ProjectRepository(db);
  const controller = new WorkerController(() => new WasmPort());
  controllers.push(controller);
  return { db, repo, controller };
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
    command: { kind: 'initialize', buildId: WORKER_BUILD_ID, expectedProtocolVersion: 1, expectedSchemaVersion: 1 },
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
  if (reply.event.kind !== 'normalized' || !reply.event.normalizedInput)
    throw new Error('seed normalize failed');
  const normalized = reply.event.normalizedInput as { kind: string; input: ProjectInput };
  return { input: normalized.input, digest: reply.event.inputDigest as string };
}

/** One project with a committed normalized input + bundled catalog + snapshot + progress. */
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
    acceptedAt: new Date().toISOString(),
    engineBuildId: 'test',
  });
  await repo.db.projects.update(project.projectId, {
    accepted: { inputRevision: '1', planSnapshotId: snapshot.planSnapshotId },
  });
  await repo.putActionProgress({
    projectId: project.projectId,
    inputRevision: '1',
    planSnapshotId: snapshot.planSnapshotId,
    stepId: 'act-1',
    status: 'done',
    updatedAt: new Date().toISOString(),
  });
  return { project, input, snapshot };
}

async function clientFor(controller: WorkerController): Promise<ProbeClient> {
  const client = await controller.ensure();
  return client;
}

// ---------- formula-safe CSV ----------

it('csv cells are always quoted and formula triggers are apostrophe-prefixed', () => {
  expect(csvCell('plain')).toBe('"plain"');
  expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
  expect(csvCell('+1234')).toBe('"\'+1234"');
  expect(csvCell('-999')).toBe('"' + "'" + '-999"');
  expect(csvCell('@cmd')).toBe('"\'@cmd"');
  // Leading whitespace/control chars are stripped by spreadsheets before
  // formula detection — a triggering sequence after them stays dangerous.
  expect(csvCell('  =SUM(A1)')).toBe('"\'  =SUM(A1)"');
  expect(csvCell('\t=1+1')).toBe('"\'\t=1+1"');
  // Quoting inside a cell doubles.
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  // A minus mid-string is data, not a trigger.
  expect(csvCell('well-known')).toBe('"well-known"');
});

it('toCsv emits CRLF lines and a trailing newline', () => {
  const text = toCsv([
    ['a', 'b'],
    ['=1', 'x'],
  ]);
  expect(text).toBe('"a","b"\r\n"\'=1","x"\r\n');
});

// ---------- attachment bounds / sniffing ----------

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)]);
const HTML = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');

it('magic-byte sniffing accepts real image headers and rejects markup', () => {
  expect(sniffMime(PNG.buffer.slice(0) as ArrayBuffer)).toBe('image/png');
  expect(sniffMime(JPEG.buffer.slice(0) as ArrayBuffer)).toBe('image/jpeg');
  expect(sniffMime(HTML.buffer.slice(0) as ArrayBuffer)).toBeNull();
});

it('attachment manager enforces type/size/pixel/count bounds without a network', async () => {
  const { repo } = world();
  const project = await repo.createProject('사진', emptyProjectForm());
  const decode = async (): Promise<{
    bytes: ArrayBuffer;
    width: number;
    height: number;
    mime: 'image/png';
  }> => ({
    bytes: PNG.buffer.slice(0) as ArrayBuffer,
    width: 4,
    height: 4,
    mime: 'image/png',
  });
  const manager = new AttachmentManager(repo, decode);
  // Non-image declared type → unsupported before decode is attempted.
  expect(
    (await manager.attach(project.projectId, {
      name: 'evil.svg',
      type: 'image/svg+xml',
      size: HTML.byteLength,
      bytes: HTML.buffer.slice(0) as ArrayBuffer,
    })).status,
  ).toBe('rejected');
  // Declared png but HTML bytes → mismatch rejected.
  const mismatch = await manager.attach(project.projectId, {
    name: 'x.png',
    type: 'image/png',
    size: HTML.byteLength,
    bytes: HTML.buffer.slice(0) as ArrayBuffer,
  });
  expect(mismatch).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
  // Over the byte cap.
  const huge = new ArrayBuffer(10 * 1024 * 1024 + 1);
  expect(
    (await manager.attach(project.projectId, {
      name: 'big.png',
      type: 'image/png',
      size: huge.byteLength,
      bytes: huge,
    })),
  ).toMatchObject({ status: 'rejected', code: 'file_too_large' });
  // A real png decodes through the injected re-encoder and persists.
  const saved = await manager.attach(project.projectId, {
    name: 'room.png',
    type: 'image/png',
    size: PNG.byteLength,
    bytes: PNG.buffer.slice(0) as ArrayBuffer,
  });
  expect(saved.status).toBe('saved');
  const list = await manager.list(project.projectId);
  expect(list).toHaveLength(1);
  expect(list[0]!.width).toBe(4);
  expect(list[0]!.originalByteSize).toBe(PNG.byteLength);
  // The stored derivative — never the original file bytes claim.
  expect(list[0]!.mime).toBe('image/png');
  // Pixel-limit decoder result rejects.
  const giantManager = new AttachmentManager(repo, async () => ({
    bytes: PNG.buffer.slice(0) as ArrayBuffer,
    width: 6000,
    height: 4000,
    mime: 'image/png',
  }));
  expect(
    (await giantManager.attach(project.projectId, {
      name: 'huge.png',
      type: 'image/png',
      size: PNG.byteLength,
      bytes: PNG.buffer.slice(0) as ArrayBuffer,
    })),
  ).toMatchObject({ status: 'rejected', code: 'pixel_limit_exceeded' });
  // Count cap: seed the remaining slots via the repository directly.
  const row = list[0]!;
  for (let i = list.length; i < 10; i++) {
    await repo.addAttachment({ ...row, attachmentId: crypto.randomUUID() });
  }
  expect(await manager.list(project.projectId)).toHaveLength(10);
  expect(
    (await manager.attach(project.projectId, {
      name: 'extra.png',
      type: 'image/png',
      size: PNG.byteLength,
      bytes: PNG.buffer.slice(0) as ArrayBuffer,
    })),
  ).toMatchObject({ status: 'rejected', code: 'project_full' });
  // Removal deletes the row — bytes leave with it.
  await manager.remove(row.attachmentId);
  expect(
    (await manager.list(project.projectId)).map((r) => r.attachmentId),
  ).not.toContain(row.attachmentId);
});

it('a malformed attachment row fails its envelope guard on read', async () => {
  const { db, repo } = world();
  const project = await repo.createProject('사진', emptyProjectForm());
  await db.attachments.add({
    schemaVersion: SCHEMA_VERSION,
    attachmentId: 'a1',
    projectId: project.projectId,
    name: 'x.png',
    mime: 'image/png',
    byteSize: 5,
    originalByteSize: 5,
    width: 1,
    height: 1,
    bytes: new ArrayBuffer(7), // byteSize mismatch → corrupt
    createdAt: new Date().toISOString(),
  } satisfies AttachmentRow);
  // The corrupt row is skipped on list, not repaired or surfaced as valid.
  expect(await repo.listAttachments(project.projectId)).toEqual([]);
});

// ---------- migration journal / downgrade ----------

it('v1 databases upgrade to v2 and the journal records the transition', async () => {
  const name = `test-${crypto.randomUUID()}`;
  // Simulate a legacy v1 database with the original schema.
  const legacy = new ZariDb(name);
  // Force a v1-only open by deleting the v2 declaration: open a raw Dexie.
  legacy.close();
  const Dexie = (await import('dexie')).default;
  const v1 = new Dexie(name);
  v1.version(1).stores({
    projects: 'projectId, updatedAt, status',
    inputs: '[projectId+inputRevision], projectId',
    drafts: 'projectId',
    snapshots: '[projectId+inputRevision+planSnapshotId], projectId, planSnapshotId',
    ownedContainers: 'ownedContainerId, updatedAt',
    catalogs: 'catalogDigest, catalogVersion, origin',
    actionProgress: '[projectId+inputRevision+planSnapshotId+stepId], projectId',
    metadata: 'key',
  });
  await v1.open();
  await v1.table('projects').put({
    schemaVersion: SCHEMA_VERSION,
    projectId: 'p1',
    name: 'legacy',
    status: 'active',
    projectRevision: '1',
    currentInputRevision: '0',
    currentInputDigest: null,
    accepted: null,
    lastStep: 'space',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recovery: null,
  });
  v1.close();
  // The v2 build upgrades in place — data survives and the journal lands.
  const repo = new ProjectRepository(new ZariDb(name));
  await repo.open();
  expect((await repo.listProjects()).map((p) => p.projectId)).toEqual(['p1']);
  const journal = await repo.db.metadata.get('migration:1->2');
  expect(journal?.payload).toMatchObject({
    kind: 'migration',
    fromVersion: 1,
    toVersion: 2,
    state: 'applied',
  });
  expect((await repo.db.metadata.get('db:verno'))?.payload).toEqual({ version: 2 });
});

// ---------- export / import / duplicate ----------

it('export → stage → commit round-trips under a fresh project id', async () => {
  const { repo, controller } = world();
  const { project, input, snapshot } = await seedProject(repo);
  const bundle = await repo.loadBundle(project.projectId);
  const doc = await exportProject(repo, bundle, 'test-build', 'standard');
  expect(doc.kind).toBe('standard');
  expect(doc.excluded).toContain('transient-logs');
  const client = await clientFor(controller);
  const staged = await stageProjectImport(JSON.stringify(doc), repo, client);
  if (staged.status !== 'staged')
    throw new Error(`expected staged, got ${JSON.stringify(staged)}`);
  expect(staged.summary.name).toBe('원본 프로젝트');
  expect(staged.summary.snapshotCount).toBe(1);
  expect(staged.summary.progressCount).toBe(1);
  const row = await commitProjectImport(repo, staged.staged);
  expect(row.projectId).not.toBe(project.projectId);
  expect(row.projectRevision).toBe('1');
  expect(row.importedFrom?.sourceProjectId).toBe(project.projectId);
  // The imported bundle is complete and self-consistent.
  const imported = await repo.loadBundle(row.projectId);
  expect(imported.corrupt).toEqual([]);
  expect(imported.input?.inputDigest).toBe(input ? (await repo.loadBundle(project.projectId)).input?.inputDigest : null);
  expect(imported.snapshots.map((s) => s.planSnapshotId)).toEqual([
    snapshot.planSnapshotId,
  ]);
  // Source project is untouched.
  const source = await repo.loadBundle(project.projectId);
  expect(source.project.projectId).toBe(project.projectId);
});

it('import rejects malformed, deep, future-schema and tampered files', async () => {
  const { repo, controller } = world();
  const { project } = await seedProject(repo);
  const bundle = await repo.loadBundle(project.projectId);
  const doc = await exportProject(repo, bundle, 'test-build', 'standard');
  const client = await clientFor(controller);
  // Not JSON.
  expect((await stageProjectImport('{nope', repo, client)).status).toBe('rejected');
  // Future export version → explicit unsupported, never partial import.
  const future = { ...doc, exportVersion: 99 };
  const futureResult = await stageProjectImport(JSON.stringify(future), repo, client);
  expect(futureResult).toMatchObject({ status: 'rejected' });
  if (futureResult.status === 'rejected')
    expect(futureResult.issues.some((i) => i.code === 'unsupported_schema')).toBe(true);
  // A record at a newer row schema is quarantined-evidence, not importable.
  const rowFuture = structuredClone(doc);
  (rowFuture.project as { schemaVersion: number }).schemaVersion = SCHEMA_VERSION + 1;
  const rowResult = await stageProjectImport(JSON.stringify(rowFuture), repo, client);
  expect(rowResult).toMatchObject({ status: 'rejected' });
  // A tampered snapshot body fails Rust verifyRecord.
  const tampered = structuredClone(doc);
  const snap = (tampered.snapshots[0] as { snapshot: PlanSnapshot }).snapshot;
  snap.content.versions.inputDigest = '0'.repeat(64);
  const tamperResult = await stageProjectImport(JSON.stringify(tampered), repo, client);
  expect(tamperResult).toMatchObject({ status: 'rejected' });
  // A dangling accepted binding rejects the whole import.
  const dangling = structuredClone(doc);
  (dangling.project as { accepted: unknown }).accepted = {
    inputRevision: '1',
    planSnapshotId: '9'.repeat(64),
  };
  const dangleResult = await stageProjectImport(JSON.stringify(dangling), repo, client);
  expect(dangleResult).toMatchObject({ status: 'rejected' });
  if (dangleResult.status === 'rejected')
    expect(dangleResult.issues.some((i) => i.code === 'dangling_reference')).toBe(true);
  // Duplicate row ids reject.
  const dup = structuredClone(doc);
  dup.inputs.push(dup.inputs[0]);
  expect((await stageProjectImport(JSON.stringify(dup), repo, client))).toMatchObject({
    status: 'rejected',
  });
  // Recovery exports are explicit raw data — not importable.
  const recovery = { ...doc, kind: 'recovery' };
  expect((await stageProjectImport(JSON.stringify(recovery), repo, client))).toMatchObject({
    status: 'rejected',
  });
  // None of the rejected files left any project behind.
  const remaining = await repo.listProjects();
  expect(remaining.map((p) => p.projectId)).toEqual([project.projectId]);
});

it('a failed commit inserts no half-project', async () => {
  const { repo, controller } = world();
  const { project } = await seedProject(repo);
  const bundle = await repo.loadBundle(project.projectId);
  const doc = await exportProject(repo, bundle, 'test-build', 'standard');
  const client = await clientFor(controller);
  const staged = await stageProjectImport(JSON.stringify(doc), repo, client);
  if (staged.status !== 'staged') throw new Error('expected staged');
  // Force a commit-time failure: a draft row under the fresh id already taken.
  staged.staged.projectId = project.projectId;
  await expect(commitProjectImport(repo, staged.staged)).rejects.toBeInstanceOf(
    StoreError,
  );
  // The conflict aborted the transaction — the source project is intact.
  const source = await repo.loadBundle(project.projectId);
  expect(source.project.projectId).toBe(project.projectId);
});

it('duplicate creates a fresh project with revision 1 and no progress', async () => {
  const { repo } = world();
  const { project, snapshot } = await seedProject(repo);
  const copy = await repo.duplicateProject(project.projectId);
  expect(copy.projectId).not.toBe(project.projectId);
  expect(copy.projectRevision).toBe('1');
  expect(copy.name).toContain('사본');
  const bundle = await repo.loadBundle(copy.projectId);
  expect(bundle.input?.inputDigest).not.toBeNull();
  // The accepted snapshot re-bound because its input revision still matches.
  expect(bundle.project.accepted?.planSnapshotId).toBe(snapshot.planSnapshotId);
  // Progress starts empty — done states never transfer.
  expect(
    await repo.actionProgressFor(
      copy.projectId,
      '1',
      snapshot.planSnapshotId,
    ),
  ).toEqual([]);
  // The source is untouched.
  expect((await repo.loadBundle(project.projectId)).project.projectId).toBe(
    project.projectId,
  );
});

it('deletion removes project rows including attachment bytes atomically', async () => {
  const { repo } = world();
  const { project } = await seedProject(repo);
  const manager = new AttachmentManager(repo, async () => ({
    bytes: PNG.buffer.slice(0) as ArrayBuffer,
    width: 2,
    height: 2,
    mime: 'image/png',
  }));
  await manager.attach(project.projectId, {
    name: 'room.png',
    type: 'image/png',
    size: PNG.byteLength,
    bytes: PNG.buffer.slice(0) as ArrayBuffer,
  });
  expect(await repo.listAttachments(project.projectId)).toHaveLength(1);
  await repo.deleteProject(project.projectId);
  expect(await repo.listAttachments(project.projectId)).toEqual([]);
  expect(await repo.db.projects.get(project.projectId)).toBeUndefined();
  expect(await repo.db.actionProgress.where('projectId').equals(project.projectId).count()).toBe(0);
  // The shared catalog survives — it is not project-owned.
  expect(await repo.getCatalog(catalog.catalogDigest)).not.toBeNull();
});

it('recovery export carries quarantine entries verbatim', async () => {
  const { repo } = world();
  const { project } = await seedProject(repo);
  await repo.quarantine({
    projectId: project.projectId,
    store: 'drafts',
    storeKey: project.projectId,
    reason: 'record_corrupt',
    bytes: btoa('{"raw":"damaged"}'),
  });
  const bundle = await repo.loadBundle(project.projectId);
  const doc = await exportProject(repo, bundle, 'test-build', 'recovery');
  expect(doc.kind).toBe('recovery');
  const kept = doc.quarantine[0] as { bytes: string; reason: string };
  expect(atob(kept.bytes)).toBe('{"raw":"damaged"}');
});
