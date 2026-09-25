import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type {
  CatalogImportDto,
  PlanSnapshot,
  ProtocolRequest,
} from '../../src/contracts/generated/dto';
import { CatalogManager } from '../../src/features/catalog/manager';
import type { ImportEntry } from '../../src/features/catalog/import';
import { OwnedManager } from '../../src/features/owned/manager';
import { EMPTY_OWNED_FIELDS, ownedToRaw } from '../../src/features/owned/model';
import { emptyProjectForm } from '../../src/features/project/draft';
import { ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';
import type { WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';

/**
 * REAL-RUST coverage for Ticket 008: staged catalog import (CSV/JSON/manual
 * through `normalizeCatalogFields` + `validateCatalog`), the owned-container
 * library (normalized by `normalizeInput`, persisted by value), and
 * snapshot-bound action progress with prerequisite/dependent fencing.
 */
initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

class WasmPort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: ProtocolRequest[] = [];
  private runtime = new Runtime();
  private dead = false;
  postMessage(text: string) {
    if (this.dead) return;
    this.sent.push(JSON.parse(text) as ProtocolRequest);
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

const controllers: WorkerController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function world() {
  const db = new ZariDb(`test-${crypto.randomUUID()}`);
  const repo = new ProjectRepository(db);
  const controller = new WorkerController(() => new WasmPort());
  controllers.push(controller);
  return {
    db,
    repo,
    catalogs: new CatalogManager(controller, repo),
    owned: new OwnedManager(controller, repo),
  };
}

function entry(over: Partial<ImportEntry> = {}): ImportEntry {
  return {
    productId: 'prod-1',
    productName: '테스트 수납함',
    category: 'box',
    brand: '',
    variantId: 'var-1',
    optionLabel: '기본',
    primitive: 'openBin',
    uprightOnly: true,
    outerWidthMm: '300',
    outerDepthMm: '200',
    outerHeightMm: '150',
    innerWidthMm: '280',
    innerDepthMm: '180',
    innerHeightMm: '140',
    massGrams: '500',
    offerId: 'offer-1',
    sellerId: 'seller-1',
    packQuantity: '1',
    packPriceKrw: '5000',
    inventory: 'inStock',
    shipping: 'free',
    shippingFeeKrw: '',
    url: '',
    observedAt: '',
    note: '',
    ...over,
  };
}

const META = {
  catalogVersion: 'catalog-test-1',
  ingestionVersion: 'ingest-1',
  observedAt: null,
  note: 'test import',
};

it('a valid manual entry validates in Rust and persists only on commit', async () => {
  const { repo, catalogs } = world();
  const staged = await catalogs.stageEntries([entry()], META);
  if (staged.status !== 'validated')
    throw new Error(`expected validated, got ${JSON.stringify(staged)}`);
  // The digest is Rust-computed — 64 lowercase hex, not host-fabricated.
  expect(staged.snapshot.catalogDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(staged.snapshot.sourceKind).toBe('imported');
  // Staging alone never persists.
  expect(await catalogs.list()).toEqual([]);
  await catalogs.commit(staged.snapshot);
  const rows = await catalogs.list();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.catalog.catalogDigest).toBe(staged.snapshot.catalogDigest);
  expect(rows[0]!.origin).toBe('imported');
  void repo;
});

it('blank commerce fields stay unknown in the validated snapshot', async () => {
  const { catalogs } = world();
  const staged = await catalogs.stageEntries(
    [entry({ packPriceKrw: '', inventory: '', shipping: '', url: '' })],
    META,
  );
  if (staged.status !== 'validated')
    throw new Error(`expected validated, got ${JSON.stringify(staged)}`);
  const offer = staged.snapshot.offers[0]!;
  expect(offer.packPrice.state).toBe('unknown');
  expect(offer.inventory.state).toBe('unknown');
  expect(offer.shipping.state).toBe('unknown');
  expect(offer.url.state).toBe('unknown');
});

it('malformed JSON and schema-invalid documents are rejected, never stored', async () => {
  const { catalogs } = world();
  expect((await catalogs.stageJson('{broken')).status).toBe('rejected');
  expect((await catalogs.stageJson('{"not":"a catalog"}')).status).toBe('rejected');
  const invalid = JSON.parse(
    readFileSync('fixtures/domain/catalog-import-invalid.json', 'utf8'),
  ) as { input: CatalogImportDto };
  const staged = await catalogs.stageJson(JSON.stringify(invalid.input));
  if (staged.status !== 'rejected')
    throw new Error(`expected rejected, got ${JSON.stringify(staged)}`);
  expect(staged.diagnostics.length).toBeGreaterThan(0);
  // Nothing reached the library.
  expect(await catalogs.list()).toEqual([]);
});

it('a valid JSON import validates with its real digest', async () => {
  const { catalogs } = world();
  const valid = JSON.parse(
    readFileSync('fixtures/domain/catalog-import-valid.json', 'utf8'),
  ) as { input: CatalogImportDto };
  const staged = await catalogs.stageJson(JSON.stringify(valid.input));
  if (staged.status !== 'validated')
    throw new Error(`expected validated, got ${JSON.stringify(staged)}`);
  expect(staged.snapshot.catalogDigest).toMatch(/^[0-9a-f]{64}$/);
});

it('CSV rows stage through the same Rust pipeline; bad headers reject', async () => {
  const { catalogs } = world();
  const csv =
    'productId,productName,category,variantId,optionLabel,primitive,outerWidthMm,outerDepthMm,outerHeightMm,offerId,sellerId,packQuantity,packPriceKrw,inventory,shipping\n' +
    'prod-c,CSV 박스,box,var-c,기본,openBin,300,200,150,offer-c,seller-c,1,9000,inStock,free\n';
  const staged = await catalogs.stageCsv(csv, META);
  if (staged.status !== 'validated')
    throw new Error(`expected validated, got ${JSON.stringify(staged)}`);
  expect(staged.snapshot.variants[0]!.id).toBe('var-c');
  const rejected = await catalogs.stageCsv('bogus,header\n1,2\n', META);
  expect(rejected.status).toBe('rejected');
});

it('local shape errors reject before the worker is asked', async () => {
  const { catalogs } = world();
  const bad = await catalogs.stageEntries(
    [entry({ productName: '', url: 'javascript:alert(1)' })],
    META,
  );
  if (bad.status !== 'rejected') throw new Error('expected rejected');
  expect(bad.issues.some((i) => i.code === 'required_text_missing')).toBe(true);
  expect(bad.issues.some((i) => i.code === 'invalid_locator')).toBe(true);
});

it('an owned container is normalized by Rust, stored by value, CAS-guarded', async () => {
  const { owned } = world();
  const saved = await owned.registerFields({
    ...EMPTY_OWNED_FIELDS,
    id: 'my-box',
    quantityOwned: '2',
    quantityAvailable: '1',
    outerWidthMm: '300',
    outerDepthMm: '200',
    outerHeightMm: '150',
  });
  if (saved.status !== 'saved')
    throw new Error(`expected saved, got ${JSON.stringify(saved)}`);
  expect(saved.container.id).toBe('my-box');
  expect(saved.container.physical.dimensions.outer.width.state).toBe('known');
  const rows = await owned.list();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.revision).toBe('1');
  // A stale writer is refused; the current revision wins.
  const stale = await owned.register(ownedToRaw(saved.container), '0');
  expect(stale.status).toBe('conflict');
  // Editing under the right revision preserves physical facts by value.
  const edited = ownedToRaw(saved.container);
  edited.quantityOwned = { state: 'known', value: { text: '3' }, origin: 'userDeclared', evidenceIds: [] };
  const again = await owned.register(edited, rows[0]!.revision);
  if (again.status !== 'saved') throw new Error(`expected saved, got ${JSON.stringify(again)}`);
  expect(again.container.physical.dimensions.outer.width.state).toBe('known');
  expect(again.revision).toBe('2');
  const removed = await owned.remove('my-box', '2');
  expect(removed.status).toBe('saved');
  expect(await owned.list()).toEqual([]);
});

/** Seed an accepted snapshot directly: shape-valid rows, digest-shaped ids. */
async function seedAccepted(repo: ProjectRepository) {
  const fixture = JSON.parse(
    readFileSync('fixtures/domain/record-snapshot-verified.json', 'utf8'),
  ) as { input: { snapshot: PlanSnapshot } };
  const snapshot = structuredClone(fixture.input.snapshot);
  snapshot.content.actions = [
    {
      id: 'act-1',
      kind: 'install',
      prerequisiteStepIds: [],
      reasonIds: [],
      requiredConfirmations: [],
      subjectIds: ['place-1'],
    },
    {
      id: 'act-2',
      kind: 'label',
      prerequisiteStepIds: ['act-1'],
      reasonIds: [],
      requiredConfirmations: [],
      subjectIds: ['place-1'],
    },
  ];
  const project = await repo.createProject('테스트', emptyProjectForm());
  await repo.db.snapshots.put({
    schemaVersion: 1,
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
  return { project, snapshot };
}

it('action progress enforces prerequisites, dependents, and exact binding', async () => {
  const { repo } = world();
  const { project, snapshot } = await seedAccepted(repo);
  const args = {
    projectId: project.projectId,
    inputRevision: '1',
    planSnapshotId: snapshot.planSnapshotId,
  };
  // A dependent step cannot complete before its prerequisite.
  const blocked = await repo.setActionStep({ ...args, stepId: 'act-2', done: true });
  expect(blocked).toEqual({ status: 'blocked_prerequisites', missing: ['act-1'] });
  // Unknown step ids are refused.
  expect(
    await repo.setActionStep({ ...args, stepId: 'act-x', done: true }),
  ).toEqual({ status: 'unknown_step' });
  // Prerequisite first, then the dependent step succeeds.
  expect(await repo.setActionStep({ ...args, stepId: 'act-1', done: true })).toMatchObject({
    status: 'saved',
  });
  expect(await repo.setActionStep({ ...args, stepId: 'act-2', done: true })).toMatchObject({
    status: 'saved',
  });
  // Clearing a step that a done step depends on is refused.
  const cleared = await repo.setActionStep({ ...args, stepId: 'act-1', done: false });
  expect(cleared).toEqual({ status: 'blocked_dependents', dependents: ['act-2'] });
  // Progress is bound to the exact snapshot — a different id sees nothing.
  const other = 'a'.repeat(64);
  expect(await repo.actionProgressFor(project.projectId, '1', other)).toEqual([]);
  expect(
    await repo.setActionStep({ ...args, planSnapshotId: other, stepId: 'act-1', done: true }),
  ).toEqual({ status: 'not_accepted' });
  const rows = await repo.actionProgressFor(project.projectId, '1', snapshot.planSnapshotId);
  expect(rows.map((r) => [r.stepId, r.status])).toEqual([
    ['act-1', 'done'],
    ['act-2', 'done'],
  ]);
});
