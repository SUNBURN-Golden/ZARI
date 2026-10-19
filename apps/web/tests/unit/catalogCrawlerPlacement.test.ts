import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { initSync, reviewCatalogBundle, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type {
  CandidateProposal,
  CatalogBundleReview,
  CatalogSnapshot,
  Diagnostic,
  OwnedContainer,
  PlanSnapshot,
  ProjectInput,
} from '../../src/contracts/generated/dto';
import { OwnedManager } from '../../src/features/owned/manager';
import {
  blankOwnedRaw,
  EMPTY_OWNED_FIELDS,
  ownedToRaw,
  rawPhysicalFromVariant,
} from '../../src/features/owned/model';
import { ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';
import { WORKER_BUILD_ID, type WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';

/**
 * z-catalog-crawler fix-round coverage: a measured crawled variant must be
 * placeable. The by-value owned copy drops catalog-scoped evidence ids (the
 * `variantRef` keeps the digest-pinned link), so registration and embed no
 * longer hit `dangling_evidence_ref`; rejections surface their real
 * diagnostic; and an owned container whose inner cavity is unknown reaches a
 * plan only as conditional — unknown is never a pass.
 *
 * Everything runs against the real WASM runtime; no network, no Chrome.
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

const controllers: WorkerController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function world() {
  const db = new ZariDb(`test-${crypto.randomUUID()}`);
  const repo = new ProjectRepository(db);
  const controller = new WorkerController(() => new WasmPort());
  controllers.push(controller);
  return { repo, owned: new OwnedManager(controller, repo) };
}

const ROOT = join(__dirname, '..', '..', '..', '..');
const GOLDEN = readFileSync(join(ROOT, 'tests/fixtures/catalog-collection/golden/bundle.json'), 'utf8');
const review = JSON.parse(reviewCatalogBundle(GOLDEN)) as CatalogBundleReview;
if (!review.snapshot) throw new Error('golden bundle must produce a snapshot');
const SNAPSHOT: CatalogSnapshot = review.snapshot;

function rawCopy(variantId: string, ownedId: string) {
  const variant = SNAPSHOT.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error(`missing variant ${variantId}`);
  const raw = blankOwnedRaw({
    ...EMPTY_OWNED_FIELDS,
    id: ownedId,
    quantityOwned: '1',
    quantityAvailable: '1',
  });
  raw.variantRef = { variantId, catalogDigest: SNAPSHOT.catalogDigest };
  raw.physical = rawPhysicalFromVariant(variant);
  return raw;
}

it('every golden variant — measured or unmeasured — registers as an owned container by value', async () => {
  const { owned } = world();
  expect(SNAPSHOT.variants).toHaveLength(9);
  for (const [index, variant] of SNAPSHOT.variants.entries()) {
    const result = await owned.register(rawCopy(variant.id, `own-${index}`));
    expect(result.status, variant.id).toBe('saved');
    if (result.status !== 'saved') continue;
    const container = result.container;
    // The copy carries no catalog-scoped evidence ids and stays unverified.
    expect(JSON.stringify(container), variant.id).not.toMatch(/"evidenceIds":\["/);
    expect(container.provenance.verification).toBe('unverified');
    expect(container.variantRef?.variantId).toBe(variant.id);
    const outer = container.physical.dimensions.outer;
    if (review.unconfirmedDimensionIds.includes(variant.id)) {
      expect(outer.width.state, variant.id).toBe('unknown');
    } else {
      expect(outer.width.state, variant.id).toBe('known');
    }
    // Inner dims are never filled from the outer extent.
    expect(container.physical.dimensions.inner.width.state).toBe('unknown');
  }
  expect(await owned.list()).toHaveLength(9);
});

it('a rejection surfaces the real engine diagnostic, not an empty list', async () => {
  const { owned } = world();
  // Facts with evidence ids the project evidence list cannot resolve.
  const dangling = rawCopy('crawl:ikea:12345678', 'own-dangling');
  const width = dangling.physical.dimensions.outer.width;
  if (width.text === '') throw new Error('expected a measured variant');
  width.evidenceIds = ['ev-not-in-input'];
  const refused = await owned.register(dangling);
  expect(refused.status).toBe('rejected');
  if (refused.status === 'rejected') {
    expect(refused.diagnostics.map((d: Diagnostic) => d.code)).toContain('dangling_evidence_ref');
  }
  // A quantity rule violation is reported by code, not hidden.
  const overuse = blankOwnedRaw({
    ...EMPTY_OWNED_FIELDS,
    id: 'own-overuse',
    quantityOwned: '1',
    quantityAvailable: '3',
    outerWidthMm: '300',
    outerDepthMm: '200',
    outerHeightMm: '150',
  });
  const second = await owned.register(overuse);
  expect(second.status).toBe('rejected');
  if (second.status === 'rejected') {
    expect(second.diagnostics.map((d: Diagnostic) => d.code)).toContain('available_exceeds_owned');
  }
});

function meta(requestId: string, contextId: string | null) {
  return {
    protocolVersion: 1,
    schemaVersion: 1,
    workerSessionId: 'session-a',
    projectActivationId: 'activation-a',
    requestId,
    projectId: 'project-a',
    editorEpoch: '0',
    inputRevision: '1',
    contextId,
  };
}

function send(runtime: Runtime, requestId: string, command: Record<string, unknown>, contextId: string | null = null) {
  const reply = runtime.handle_json(
    JSON.stringify({ meta: meta(requestId, contextId), command }),
  );
  return JSON.parse(reply) as { event: Record<string, unknown> & { kind: string } };
}

it('a crawled owned container embeds in a project and reaches a plan as conditional — unknown inner is never a pass', async () => {
  const { owned } = world();
  const saved = await owned.register(rawCopy('crawl:ikea:12345678', 'own-samla'));
  if (saved.status !== 'saved') throw new Error(JSON.stringify(saved));
  const container: OwnedContainer = saved.container;
  expect(container.physical.dimensions.outer.width.state).toBe('known');
  expect(container.physical.dimensions.inner.width.state).toBe('unknown');

  // A normalized project input carrying the stored container — the same
  // shape `upsertOwnedContainer(ownedToRaw(row))` commits. The provisional
  // template keeps an item tentatively inside the box: crawled containers
  // never declare an inner support, so a `contained` assignment cannot
  // resolve — provisional is the honest "inside, pending measurement" path.
  const fixture = JSON.parse(
    readFileSync(join(ROOT, 'fixtures/domain/candidate-provisional.json'), 'utf8'),
  ) as { input: { input: ProjectInput; proposal: CandidateProposal } };
  const input = structuredClone(fixture.input.input);
  input.ownedContainers = [structuredClone(container)];
  input.catalogPin = {
    catalogVersion: SNAPSHOT.catalogVersion,
    catalogDigest: SNAPSHOT.catalogDigest,
  };

  const runtime = new Runtime();
  const init = JSON.parse(
    runtime.handle_json(
      JSON.stringify({
        meta: {
          ...meta('init', null),
          projectId: 'system',
          projectActivationId: 'system',
          inputRevision: '0',
        },
        command: {
          kind: 'initialize',
          buildId: WORKER_BUILD_ID,
          expectedProtocolVersion: 1,
          expectedSchemaVersion: 1,
        },
      }),
    ),
  ) as { event: Record<string, unknown> & { kind: string } };
  expect(init.event.kind).toBe('ready');
  const activated = send(runtime, 'activate', {
    kind: 'activateProject',
    context: { kind: 'project', input, catalog: SNAPSHOT },
  });
  expect(activated.event.kind).toBe('projectActivated');
  const context = activated.event.contextId as string;

  // Place the owned container; the fixture keeps one item provisionally
  // inside it.
  const proposal = structuredClone(fixture.input.proposal);
  proposal.layout.placements[0]!.subject = {
    kind: 'ownedContainer',
    ownedId: 'own-samla',
    unitOrdinal: 0,
  };
  // An owned container is not purchased — the fixture's offer selection for
  // this placement no longer applies.
  proposal.layout.purchaseSelections = [];
  const validated = send(runtime, 'candidate', { kind: 'validateCandidate', proposal }, context);
  if (validated.event.kind !== 'candidateValidated' || validated.event.snapshot === null)
    throw new Error(JSON.stringify(validated.event));
  const plan = validated.event.snapshot as PlanSnapshot;
  const placed = plan.content.placements.find(
    (p) => p.subject.kind === 'ownedContainer' && p.subject.ownedId === 'own-samla',
  );
  expect(placed).toBeTruthy();
  // The plan is conditional, never confirmed: every inner-capacity check on
  // the crawled container is unknown because its cavity is unknown. Check
  // subjects are placement ids, so scope by `p-c1`.
  expect(plan.content.validation.physicalAssurance).toBe('conditional');
  const innerChecks = plan.content.validation.checks.filter(
    (c) => c.id.startsWith('chk:ic:p-c1'),
  );
  expect(innerChecks.length).toBeGreaterThan(0);
  for (const check of innerChecks) {
    expect(check.status, check.id).toBe('unknown');
  }
  expect(
    plan.content.validation.checks.some(
      (c) => c.id.startsWith('chk:ic:p-c1') && c.status === 'pass',
    ),
  ).toBe(false);
});

it('the stored container re-serializes for embed without dangling references', async () => {
  const { owned } = world();
  const saved = await owned.register(rawCopy('crawl:ohou:1001', 'own-shelf'));
  if (saved.status !== 'saved') throw new Error(JSON.stringify(saved));
  const raw = ownedToRaw(saved.container);
  // The exact by-value re-serialization embeds cleanly: no evidence ids the
  // project input cannot resolve, variant ref intact.
  expect(JSON.stringify(raw)).not.toMatch(/"evidenceIds":\["/);
  expect(raw.variantRef).toEqual({
    variantId: 'crawl:ohou:1001',
    catalogDigest: SNAPSHOT.catalogDigest,
  });
  const again = await owned.register(raw, '1');
  expect(again.status).toBe('saved');
});
