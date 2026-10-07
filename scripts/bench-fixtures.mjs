// ZARI-010 measured beta-readiness fixture authoring.
//
// Generates the shared `fixtures/bench/*.json` domain fixtures that drive
// `npm run bench:browser`. All domain values are computed by Rust
// (`domain_tool` example): raw project inputs are normalized by
// normalize_project_input, catalogs are canonicalized by
// canonicalize_catalog, and every fixture `expected` block is the real
// Runtime+SolverEngine oracle — nothing is guessed in JS.
//
// Usage:
//   node scripts/bench-fixtures.mjs            # regenerate fixtures
//   node scripts/bench-fixtures.mjs check      # fail if files drift
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] ?? 'generate';
if (!['generate', 'check'].includes(mode)) {
  throw new Error('Usage: node scripts/bench-fixtures.mjs [generate|check]');
}

const rawTemplate = JSON.parse(
  await readFile(join(root, 'apps/web/src/features/project/default-form.json'), 'utf8'),
);
const catalogTemplate = JSON.parse(
  await readFile(join(root, 'fixtures/domain/catalog-import-valid.json'), 'utf8'),
).input;
const ENGINE_CONTEXT = { buildId: 'zari-domain-6' };
const ITEM_CATEGORIES = ['clothing', 'paper', 'kitchenware', 'tools', 'linens'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function setRawMeasure(node, mm) {
  node.text = String(mm);
  return node;
}
function setRawOffset(node, mm) {
  node.text = String(mm);
  return node;
}
function setFactText(node, text) {
  node.value.text = String(text);
  return node;
}
function setVariantMeasure(node, mm) {
  node.value.nominal = mm;
  return node;
}
function makeItem(id, label, { width, depth, height }, quantity, category, orientations) {
  const item = clone(rawTemplate.items[0]);
  item.id = id;
  item.label = label;
  item.category = category;
  setRawMeasure(item.dimensions.envelope.width, width);
  setRawMeasure(item.dimensions.envelope.depth, depth);
  setRawMeasure(item.dimensions.envelope.height, height);
  setFactText(item.quantity.value === undefined ? item.quantity : item.quantity, quantity);
  item.requirement.allowedOrientations.value = orientations;
  setFactText(item.massEach, 400 + (quantity * 37) % 1200);
  return item;
}
function makeGroup(id, label, itemIds) {
  const group = clone(rawTemplate.groups[0]);
  group.id = id;
  group.label = label;
  group.itemIds = itemIds;
  return group;
}
function makeObstacle(id, role, { x, y, z }, { width, depth, height }) {
  const obstacle = {
    id,
    role,
    bounds: {
      extent: {
        width: clone(rawTemplate.space.interior.width),
        depth: clone(rawTemplate.space.interior.depth),
        height: clone(rawTemplate.space.interior.height),
      },
      minX: clone(rawTemplate.space.opening.bottom),
      minY: clone(rawTemplate.space.opening.bottom),
      minZ: clone(rawTemplate.space.opening.bottom),
    },
  };
  setRawMeasure(obstacle.bounds.extent.width, width);
  setRawMeasure(obstacle.bounds.extent.depth, depth);
  setRawMeasure(obstacle.bounds.extent.height, height);
  setRawOffset(obstacle.bounds.minX, x);
  setRawOffset(obstacle.bounds.minY, y);
  setRawOffset(obstacle.bounds.minZ, z);
  return obstacle;
}
function makeSpace({ width, depth, height, openingWidth, openingHeight, obstacles = [] }) {
  const space = clone(rawTemplate.space);
  setRawMeasure(space.interior.width, width);
  setRawMeasure(space.interior.depth, depth);
  setRawMeasure(space.interior.height, height);
  setRawMeasure(space.opening.width, openingWidth);
  setRawMeasure(space.opening.height, openingHeight);
  setRawMeasure(space.support.footprint.width, width);
  setRawMeasure(space.support.footprint.depth, depth);
  setRawMeasure(space.staging.freeVolume.extent.width, width);
  setRawMeasure(space.staging.freeVolume.extent.depth, depth);
  setRawMeasure(space.staging.freeVolume.extent.height, height);
  setRawOffset(space.staging.freeVolume.minY, -depth);
  space.obstacles = obstacles;
  return space;
}
function makeVariant(index, { width, depth, height }, { price, packQuantity, stackable }) {
  const variant = clone(catalogTemplate.variants[0]);
  variant.id = `var-${index}`;
  variant.productId = `prod-${1 + (index % 4)}`;
  variant.optionLabel = `${Math.round((width * depth * height) / 1_000_000)}L bin ${index}`;
  setVariantMeasure(variant.dimensions.outer.width, width);
  setVariantMeasure(variant.dimensions.outer.depth, depth);
  setVariantMeasure(variant.dimensions.outer.height, height);
  setVariantMeasure(variant.dimensions.inner.width, width - 10);
  setVariantMeasure(variant.dimensions.inner.depth, depth - 10);
  setVariantMeasure(variant.dimensions.inner.height, height - 10);
  variant.mass.value = 900 + (index * 113) % 2400;
  variant.stackability.value = stackable
    ? { kind: 'stackable', maxUnits: 2 + (index % 3) }
    : { kind: 'notStackable' };
  variant.allowedOrientations.value =
    index % 3 === 0 ? ['upright0'] : ['upright0', 'upright90'];
  return variant;
}
function makeOffer(index, variantId, price, packQuantity) {
  const offer = clone(catalogTemplate.offers[0]);
  offer.id = `offer-${index}`;
  offer.variantId = variantId;
  offer.sellerId = `seller-${1 + (index % 5)}`;
  offer.packPrice.value = String(price);
  offer.packQuantity.value = packQuantity;
  offer.url.value = `https://shop.example/${variantId}`;
  return offer;
}
function makeCatalog(count, dimsFor) {
  const input = clone(catalogTemplate);
  input.catalogVersion = 'catalog-bench-1';
  input.products = Array.from({ length: 4 }, (_, i) => {
    const product = clone(catalogTemplate.products[0]);
    product.id = `prod-${i + 1}`;
    product.name = `Bench storage line ${i + 1}`;
    return product;
  });
  input.variants = [];
  input.offers = [];
  for (let i = 0; i < count; i += 1) {
    const dims = dimsFor(i, count);
    const price = 9000 + ((i * 731) % 190) * 100;
    const packQuantity = 1 + (i % 4);
    input.variants.push(makeVariant(i + 1, dims, { price, packQuantity, stackable: i % 4 !== 0 }));
    input.offers.push(makeOffer(i + 1, `var-${i + 1}`, price, packQuantity));
  }
  return input;
}
function makeRawProject({ space, items, groups, search }) {
  const raw = clone(rawTemplate);
  raw.space = space;
  raw.items = items;
  raw.groups = groups;
  raw.search = search;
  return raw;
}
function dimsLadder(i, count) {
  const t = count <= 1 ? 0 : i / (count - 1);
  return {
    width: 180 + Math.round(t * 380),
    depth: 140 + Math.round(t * 220),
    height: 100 + Math.round(t * 300),
  };
}
function itemDims(i) {
  return {
    width: 120 + (i * 53) % 220,
    depth: 80 + (i * 41) % 140,
    height: 40 + (i * 29) % 140,
  };
}
// Item entries carry a quantity; instances expand per item entry.
function makeItems(entries) {
  return entries.map((entry, i) =>
    makeItem(
      `item-${i + 1}`,
      `Bench item ${i + 1}`,
      itemDims(i),
      entry.quantity,
      ITEM_CATEGORIES[i % ITEM_CATEGORIES.length],
      i % 5 === 0 ? ['upright0'] : ['upright0', 'upright90'],
    ),
  );
}
function makeGroups(items, perGroup) {
  const groups = [];
  for (let start = 0; start < items.length; start += perGroup) {
    const ids = items.slice(start, start + perGroup).map((item) => item.id);
    groups.push(makeGroup(`group-${groups.length + 1}`, `Bench group ${groups.length + 1}`, ids));
  }
  return groups;
}
const SEARCH_DEFAULT = clone(rawTemplate.search);
const workloads = {
  // p-small: 20 variants, 5-container-ish shelf, 20 item instances.
  small: {
    raw: () =>
      makeRawProject({
        space: makeSpace({ width: 1200, depth: 500, height: 700, openingWidth: 1200, openingHeight: 700 }),
        items: makeItems([{ quantity: 4 }, { quantity: 4 }, { quantity: 4 }, { quantity: 4 }, { quantity: 4 }]),
        groups: [],
        search: clone(SEARCH_DEFAULT),
      }),
    catalog: () => makeCatalog(20, dimsLadder),
  },
  // p-reference: 1 compartment, 100 variants, 100 item instances across
  // <=20 groups, 4 obstacles — the documented reference workload.
  reference: {
    raw: () =>
      makeRawProject({
        space: makeSpace({
          width: 2400,
          depth: 600,
          height: 2000,
          openingWidth: 1200,
          openingHeight: 2000,
          obstacles: [
            makeObstacle('obs-1', 'physicalSolid', { x: 200, y: 0, z: 300 }, { width: 90, depth: 40, height: 90 }),
            makeObstacle('obs-2', 'physicalSolid', { x: 2200, y: 0, z: 0 }, { width: 80, depth: 80, height: 2000 }),
            makeObstacle('obs-3', 'accessExclusion', { x: 900, y: 0, z: 1700 }, { width: 300, depth: 60, height: 120 }),
            makeObstacle('obs-4', 'physicalSolid', { x: 1500, y: 0, z: 150 }, { width: 120, depth: 30, height: 60 }),
          ],
        }),
        items: makeItems(Array.from({ length: 20 }, (_, i) => ({ quantity: 4 + (i % 3) }))),
        groups: [],
        search: clone(SEARCH_DEFAULT),
      }),
    catalog: () => makeCatalog(100, dimsLadder),
  },
};

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), 'zari-bench-'));
  try {
    const tool = (args, label) => {
      const run = spawnSync(
        'cargo',
        ['run', '-q', '-p', 'zari-core', '--locked', '--example', 'domain_tool', '--', ...args],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
      if (run.error) throw run.error;
      if (run.status !== 0) {
        throw new Error(`domain_tool ${label} failed: ${run.stderr}`);
      }
      return JSON.parse(run.stdout);
    };

    // First pass: catalogs -> snapshots -> digests, so raw inputs can pin them.
    const catalogs = {};
    for (const [name, workload] of Object.entries(workloads)) {
      const catalogPath = join(tmp, `${name}-catalog.json`);
      await writeFile(catalogPath, JSON.stringify(workload.catalog(), null, 1));
      const { snapshot, diagnostics } = tool(['catalog', catalogPath], `catalog ${name}`);
      assert.deepEqual(diagnostics, [], `${name} catalog must validate: ${JSON.stringify(diagnostics)}`);
      catalogs[name] = snapshot;
    }

    // Second pass: raw inputs with pinned catalog digests -> normalized inputs.
    const raws = {};
    const normalized = {};
    for (const [name, workload] of Object.entries(workloads)) {
      const raw = workload.raw();
      raw.catalogPin = {
        catalogDigest: catalogs[name].catalogDigest,
        catalogVersion: catalogs[name].catalogVersion,
      };
      // Groups assigned after item ids exist.
      raw.groups = makeGroups(raw.items, name === 'reference' ? 1 : 1);
      const rawPath = join(tmp, `${name}-raw.json`);
      await writeFile(rawPath, JSON.stringify(raw, null, 1));
      const result = tool(['normalize', rawPath], `normalize ${name}`);
      assert.deepEqual(result.diagnostics, [], `${name} raw input must normalize: ${JSON.stringify(result.diagnostics)}`);
      raws[name] = raw;
      normalized[name] = result.input;
    }

    // Third pass: assemble fixtures, then pin the Rust-computed oracle.
    const fixtures = {};
    // Placeholder oracles: complete enough for DomainFixture to decode; the
    // real Rust-computed values replace them before the file is written.
    const stubExpected = {
      runSearch: {
        kind: 'runSearch',
        decodeError: false,
        termination: 'scopeComplete',
        alternativeDigests: [],
        diagnosticReasons: [],
        restrictionCodes: [],
        consumed: { nodes: 0, validatedCandidates: 0, workUnits: '0' },
      },
      normalizeProjectInput: {
        kind: 'normalizeProjectInput',
        decodeError: false,
        diagnostics: [],
        inputDigest: null,
      },
    };
    const define = (caseId, operation, input) => {
      fixtures[caseId] = {
        caseId,
        engineContext: clone(ENGINE_CONTEXT),
        expected: clone(stubExpected[operation]),
        fixtureSchemaVersion: 1,
        input,
        operation,
        schemaVersion: 1,
      };
    };
    define('bench-normalize-small', 'normalizeProjectInput', raws.small);
    define('bench-normalize-reference', 'normalizeProjectInput', raws.reference);
    define('bench-search-small', 'runSearch', {
      catalog: catalogs.small,
      input: normalized.small,
      steps: [{ allowance: 1024, count: 300 }],
    });
    define('bench-search-reference', 'runSearch', {
      catalog: catalogs.reference,
      input: normalized.reference,
      steps: [{ allowance: 1024, count: 400 }],
    });
    // p-adversarial: the reference workload under a deliberately tight work
    // budget forces the documented budgetExhausted lane.
    const adversarialInput = clone(normalized.reference);
    adversarialInput.search.budget.maxWorkUnits = '60000';
    define('bench-search-adversarial', 'runSearch', {
      catalog: catalogs.reference,
      input: adversarialInput,
      steps: [{ allowance: 1024, count: 100 }],
    });
    // p-cancel: the small workload cancelled mid-search for cancellation
    // acknowledgement latency measurement.
    define('bench-search-cancel', 'runSearch', {
      cancelAfterSteps: 4,
      catalog: catalogs.small,
      input: normalized.small,
      steps: [{ allowance: 1024, count: 12 }],
    });
    // p-boundary: obstacle count beyond the documented 20 cap must surface
    // an input_limit_exceeded diagnostic at normalization, never a silent pass.
    const boundaryRaw = makeRawProject({
      space: makeSpace({
        width: 1200,
        depth: 500,
        height: 700,
        openingWidth: 1200,
        openingHeight: 700,
        obstacles: Array.from({ length: 21 }, (_, i) =>
          makeObstacle(
            `obs-${i + 1}`,
            i % 3 === 0 ? 'accessExclusion' : 'physicalSolid',
            { x: (i * 55) % 1100, y: 0, z: (i * 90) % 650 },
            { width: 30, depth: 20, height: 40 },
          ),
        ),
      }),
      items: makeItems([{ quantity: 2 }]),
      groups: [],
      search: clone(SEARCH_DEFAULT),
    });
    boundaryRaw.groups = [makeGroup('group-1', 'Boundary group', boundaryRaw.items.map((i) => i.id))];
    boundaryRaw.catalogPin = {
      catalogDigest: catalogs.small.catalogDigest,
      catalogVersion: catalogs.small.catalogVersion,
    };
    define('bench-normalize-boundary', 'normalizeProjectInput', boundaryRaw);

    for (const [caseId, fixture] of Object.entries(fixtures)) {
      const draftPath = join(tmp, `${caseId}.json`);
      await writeFile(draftPath, `${JSON.stringify(fixture, null, 1)}\n`);
      const oracle = tool(['oracle', draftPath], `oracle ${caseId}`);
      fixture.expected = oracle.expected;
    }

    const outDir = join(root, 'fixtures/bench');
    await mkdir(outDir, { recursive: true });
    for (const [caseId, fixture] of Object.entries(fixtures)) {
      const content = `${JSON.stringify(fixture, null, 1)}\n`;
      const target = join(outDir, `${caseId}.json`);
      if (mode === 'check') {
        const existing = await readFile(target, 'utf8').catch(() => null);
        assert.equal(
          existing,
          content,
          `${caseId} fixture drifted; run node scripts/bench-fixtures.mjs and review the diff.`,
        );
      } else {
        await writeFile(target, content);
      }
    }
    const verb = mode === 'check' ? 'verified' : 'generated';
    console.log(`${verb} ${Object.keys(fixtures).length} bench fixtures with Rust oracles.`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
await main();
