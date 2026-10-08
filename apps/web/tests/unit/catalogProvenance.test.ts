import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type { ProtocolRequest } from '../../src/contracts/generated/dto';
import { CatalogManager } from '../../src/features/catalog/manager';
import { csvToBatch } from '../../src/features/catalog/provenance';
import { ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';
import type { WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';

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
  const port = new WasmPort();
  const controller = new WorkerController(() => port);
  controllers.push(controller);
  return { repo, port, catalogs: new CatalogManager(controller, repo) };
}

function reviews(port: WasmPort) {
  return port.sent.filter((request) => request.command.kind === 'reviewCatalogImport');
}

it('keeps two size options and does not copy a blank inner from the outer', () => {
  const parsed = csvToBatch(
    [
      'productId,model,category,optionId,optionLabel,primitive,outerWidthMm,outerDepthMm,outerHeightMm,innerWidthMm',
      'prod-1,같은 상자,box,var-s,소형,openBin,200,150,100,',
      'prod-1,같은 상자,box,var-m,중형,openBin,400,150,100,',
    ].join('\n'),
    null,
  );
  if ('issues' in parsed) throw new Error(JSON.stringify(parsed.issues));
  expect(parsed.batch.rows).toHaveLength(2);
  expect(parsed.batch.rows[0]?.optionId).toBe('var-s');
  expect(parsed.batch.rows[1]?.optionId).toBe('var-m');
  expect(parsed.batch.rows[0]?.innerWidthMm).toBe('');
  expect(parsed.batch.rows[0]?.outerWidthMm).toBe('200');
  expect(parsed.batch.rows[1]?.outerWidthMm).toBe('400');
});

it('a short CSV row rejects the whole file', () => {
  const parsed = csvToBatch('model,category,optionId,optionLabel\n상자,box,var-1\n', null);
  if (!('issues' in parsed)) throw new Error('expected issues');
  expect(parsed.issues[0]?.code).toBe('row_length_mismatch');
});

it('reviews samples in one worker call and does not store a quarantined batch', async () => {
  const { catalogs, port } = world();
  const synthetic = await catalogs.review({ kind: 'sample', bundle: 'synthetic' });
  if (synthetic.status !== 'reviewed') throw new Error(JSON.stringify(synthetic));
  expect(reviews(port)).toHaveLength(1);
  expect(synthetic.reply.quarantined).toBe(false);
  expect(synthetic.reply.snapshot?.variants).toHaveLength(2);
  expect(synthetic.reply.snapshot?.variants[0]?.dimensions.inner.width.state).toBe('unknown');
  expect(synthetic.reply.snapshot?.variants[1]?.dimensions.inner.width.state).toBe('unknown');
  expect(await catalogs.commitReviewed(synthetic.reply)).toBe('saved');
  expect(reviews(port)).toHaveLength(1);
  const stored = await catalogs.list();
  expect(stored).toHaveLength(1);
  const before = JSON.stringify(stored[0]?.catalog);

  const unverified = await catalogs.review({ kind: 'sample', bundle: 'unverified' });
  if (unverified.status !== 'reviewed') throw new Error(JSON.stringify(unverified));
  expect(unverified.reply.snapshot?.variants[0]?.dimensions.outer.width.state).toBe('known');
  expect(unverified.reply.snapshot?.variants[0]?.dimensions.inner.width.state).toBe('unknown');
  if (unverified.reply.snapshot?.variants[0]?.dimensions.inner.width.state === 'known') {
    throw new Error('inner was filled');
  }

  const verified = await catalogs.review({ kind: 'sample', bundle: 'verified' });
  if (verified.status !== 'reviewed' || verified.reply.snapshot === null)
    throw new Error(JSON.stringify(verified));
  const text = JSON.stringify(verified.reply.snapshot);
  expect(text).not.toContain('"verification":"confirmed"');
  expect(text).toContain('photo=drawer-front.jpg');
  expect(text).toContain('2026-01-15T00:00:00Z');
  expect(await catalogs.commitReviewed(verified.reply)).toBe('saved');

  const blocked = await catalogs.review({
    kind: 'review',
    batch: {
      catalogVersion: 'catalog-review',
      ingestionVersion: 'provenance-1',
      existingDigest: verified.reply.snapshot.catalogDigest,
      rows: [
        {
          productId: 'prod-new',
          model: '추가',
          brand: '',
          category: 'box',
          optionId: 'var-new',
          optionLabel: '추가',
          sellerId: '',
          primitive: 'openBin',
          outerWidthMm: '250',
          outerDepthMm: '200',
          outerHeightMm: '150',
          innerWidthMm: '',
          innerDepthMm: '',
          innerHeightMm: '',
          protrusionMm: '',
          loadGrams: '',
          sources: [],
        },
        {
          productId: 'prod-new',
          model: '추가',
          brand: '',
          category: 'box',
          optionId: 'var-bad',
          optionLabel: '깨짐',
          sellerId: '',
          primitive: 'openBin',
          outerWidthMm: 'nope',
          outerDepthMm: '200',
          outerHeightMm: '150',
          innerWidthMm: '',
          innerDepthMm: '',
          innerHeightMm: '',
          protrusionMm: '',
          loadGrams: '',
          sources: [],
        },
      ],
    },
  });
  if (blocked.status !== 'reviewed') throw new Error(JSON.stringify(blocked));
  expect(blocked.reply.snapshot).toBeNull();
  expect(blocked.reply.quarantined).toBe(true);
  expect(blocked.reply.existingUntouched).toBe(true);
  expect(await catalogs.commitReviewed(blocked.reply)).toBe('blocked');
  const after = await catalogs.list();
  const kept = after.find((row) => row.catalogDigest === stored[0]?.catalogDigest);
  expect(JSON.stringify(kept?.catalog)).toBe(before);
  const published = after.find((row) => row.catalogDigest === verified.reply.snapshot?.catalogDigest);
  expect(published?.origin).toBe('provenance-verified');
  expect(JSON.stringify(published?.catalog)).toBe(text);
  expect(reviews(port)).toHaveLength(4);
});
