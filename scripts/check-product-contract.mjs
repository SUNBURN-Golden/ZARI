#!/usr/bin/env node
// z-product-contract ledger. It does not relabel the 16-node projection and it is not a runtime API.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CONTRACT = join(ROOT, 'docs/product-expansion/contract.json');
const DENOMINATOR = join(ROOT, 'docs/qualification/denominator.json');
const MANIFEST = join(ROOT, 'fixtures/manifest.json');
const PROGRAM = join(ROOT, '.aiops/program.json');
const PLAN = '0847d1b065627938acfad3a941de79e357570e43';
const QUOTE =
  '012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해.';

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walk(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'tests') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, hits);
    else if (/\.(ts|tsx|rs)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8');
      if (text.includes('zari-z-product-contract-1')) hits.push(path);
    }
  }
}

function main() {
  const contract = readJson(CONTRACT);
  const denominator = readJson(DENOMINATOR);
  const manifest = readJson(MANIFEST);
  const program = readJson(PROGRAM);

  if (contract.contract !== 'zari-z-product-contract-1') fail('contract id');
  if (contract.task !== 'ZARI-z-product-contract' || contract.issue !== 75) fail('task');
  if (contract.planCommit !== PLAN || contract.observedBase !== '1bd3fde5bd9a625d02735d4de8609e97736db49d') {
    fail('pins');
  }
  if (contract.engineOutput !== false || contract.contractChange !== 'NO') fail('change flag');
  if (contract.productionCodeChanged !== false || contract.fixtureBytesChanged !== false) fail('bytes');
  if (contract.relabelsExistingIds !== false || contract.reviewPassClaimed !== false) fail('relabel or review');
  if (contract.assertedFutureBuildId !== null) fail('future build');
  if (contract.stageSource !== 'docs/qualification/denominator.json') fail('stage source');

  const versions = contract.versions;
  if (versions.buildId !== 'zari-domain-7' || versions.ruleVersion !== 'zari-domain-v2') fail('rule');
  if (versions.solverVersionProfile1 !== 'zari-solver-v1') fail('solver v1');
  if (versions.solverVersionProfile2 !== 'zari-solver-v2' || versions.readySolverVersion !== 'zari-solver-v2') {
    fail('solver v2');
  }
  if (versions.schemaVersion !== 1 || versions.canonicalVersion !== 1 || versions.protocolVersion !== 1) {
    fail('schema');
  }
  if (versions.dbVersion !== 2 || versions.exportVersion !== 1) fail('storage versions');
  if (JSON.stringify(versions.catalogSourceKinds) !== JSON.stringify(['synthetic', 'imported'])) {
    fail('source kinds');
  }
  if (versions.searchProfileDefaultForNewProject?.version !== 2) fail('profile');

  if (!Array.isArray(contract.stages) || contract.stages.length !== 16) fail('stage count');
  if (!Array.isArray(denominator.nodes) || denominator.nodes.length !== 16) fail('denominator count');
  if (denominator.denominator !== 16 || denominator.planCommit !== PLAN) fail('denominator pin');
  contract.stages.forEach((stage, index) => {
    const id = String(index + 1).padStart(3, '0');
    const node = denominator.nodes[index];
    if (stage.id !== id || node.id !== id) fail(`id ${stage.id}`);
    if (stage.expansionOwns !== false) fail(`${id} owned by expansion`);
    if (stage.group !== node.group || stage.title !== node.title) fail(`${id} relabeled`);
    if (stage.evidence !== node.deliveryEvidence) fail(`${id} evidence path`);
    if (stage.evidence !== `docs/evidence/ZARI-SPATIAL-${id}.md`) fail(`${id} evidence name`);
    const evidence = join(ROOT, stage.evidence);
    if (!existsSync(evidence)) fail(`${id} evidence missing`);
    const heading = readFileSync(evidence, 'utf8').split('\n')[0];
    if (heading !== `# ZARI-SPATIAL-${id} evidence`) fail(`${id} heading`);
  });

  const nodes = program.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const self = byId.get('z-product-contract');
  if (!self || JSON.stringify(self.depends_on) !== JSON.stringify(['012'])) fail('depends_on');
  for (const id of ['z-inventory-lifecycle', 'z-catalog-provenance', 'z-strategy-library']) {
    const node = byId.get(id);
    if (!node?.depends_on?.includes('z-product-contract')) fail(`${id} owner path`);
  }
  if (!byId.get('z-pareto-comparison') || !byId.get('z-portable-project')) fail('later nodes');
  if (!byId.get('z-incremental-replan') || !byId.get('z-feedback-reorganize')) fail('replan nodes');
  if (!byId.get('z-purchase-handoff')) fail('purchase node');

  if (!Array.isArray(contract.capabilities) || contract.capabilities.length !== 5) fail('capabilities');
  const expectedCaps = ['owned', 'realProduct', 'strategyComparison', 'export', 'reorganize'];
  contract.capabilities.forEach((cap, index) => {
    if (cap.id !== expectedCaps[index]) fail(`capability ${cap.id}`);
    if (cap.implementsNow !== false) fail(`${cap.id} implemented now`);
    if (!byId.has(cap.owner)) fail(`${cap.id} owner`);
    if (cap.laterOwner && !byId.has(cap.laterOwner)) fail(`${cap.id} later owner`);
    const source = join(ROOT, cap.sourceFile);
    if (!existsSync(source) || !readFileSync(source, 'utf8').includes(cap.sourceMarker)) {
      fail(`${cap.id} source`);
    }
  });

  const userIds = new Set();
  for (const decision of contract.userDecisions) {
    if (decision.status !== 'open' || decision.owner !== 'user') fail(`user ${decision.id}`);
    if (userIds.has(decision.id)) fail(`duplicate user ${decision.id}`);
    userIds.add(decision.id);
  }
  const internalIds = new Set();
  for (const choice of contract.internalChoices) {
    if (choice.status !== 'adopted') fail(`internal ${choice.id}`);
    if (choice.owner !== 'z-product-contract' && !byId.has(choice.owner)) fail(`internal owner ${choice.id}`);
    if (userIds.has(choice.id) || internalIds.has(choice.id)) fail(`overlap ${choice.id}`);
    internalIds.add(choice.id);
  }
  for (const id of ['account', 'checkout', 'cloud', 'release', 'photo-consent']) {
    if (!userIds.has(id)) fail(`missing user ${id}`);
    if (internalIds.has(id)) fail(`user adopted ${id}`);
  }
  for (const id of ['keep-sixteen-ids', 'same-snapshot-chain', 'unknown-stays-unknown', 'no-migration']) {
    if (!internalIds.has(id)) fail(`missing internal ${id}`);
  }

  const counts = {};
  for (const entry of manifest.entries) counts[entry.caseKind] = (counts[entry.caseKind] ?? 0) + 1;
  if (manifest.entries.length !== 124) fail('fixture total');
  const seen = new Set();
  let impactTotal = 0;
  for (const row of contract.fixtureImpact) {
    if (seen.has(row.caseKind)) fail(`duplicate kind ${row.caseKind}`);
    seen.add(row.caseKind);
    if (counts[row.caseKind] !== row.count) fail(`count ${row.caseKind}`);
    if (row.bytesChangedByThisNode !== false) fail(`bytes ${row.caseKind}`);
    if (!existsSync(join(ROOT, row.representative))) fail(`representative ${row.representative}`);
    if (row.futureOwnerIfMeaningChanges && !byId.has(row.futureOwnerIfMeaningChanges)) {
      fail(`future owner ${row.caseKind}`);
    }
    impactTotal += row.count;
  }
  if (impactTotal !== 124 || seen.size !== Object.keys(counts).length) fail('impact coverage');

  const unknownQuantity = readJson(join(ROOT, 'fixtures/domain/project-unknown-quantity-pass.json'));
  const quantity = unknownQuantity.input.items[0].quantity;
  if (quantity.state !== 'unknown' || quantity.reason !== 'notMeasured' || 'value' in quantity) {
    fail('unknown quantity');
  }
  const unknownPack = readJson(join(ROOT, 'fixtures/bootstrap/unknown-pack.json'));
  if (unknownPack.expected.packsToOrder !== null || unknownPack.expected.suppliedUnits !== null) {
    fail('unknown pack');
  }
  const yaw = readJson(join(ROOT, 'fixtures/spatial/spatial-yaw-offset.json'));
  const transfer = yaw.input.snapshot.content.actions.find((step) => step.id === 'act:transfer:item-a:0');
  if (!transfer || transfer.prerequisiteStepIds.join(',') !== 'act:install:p-c1') fail('historical guide');
  if (transfer.requiredConfirmations.length !== 0 || transfer.reasonIds.length !== 0) fail('historical reasons');

  for (const record of contract.preservedRecords) {
    const body = readJson(join(ROOT, record.path));
    if (body[record.field] !== record.value) fail(`preserved ${record.path}`);
  }
  const oracle = readJson(join(ROOT, 'docs/oracles/product-completion/index.json'));
  if (oracle.currentBuildId !== 'zari-domain-6' || oracle.assertedFutureBuildId !== null) fail('oracle build');

  const db = readFileSync(join(ROOT, 'apps/web/src/persistence/db.ts'), 'utf8');
  if (!db.includes('export const DB_VERSION = 3')) fail('db version');
  if (contract.chain.traceFixture !== 'fixtures/domain/search-scope-complete.json') fail('trace fixture');
  if (contract.chain.separateDocuments !== false) fail('chain split');
  if (!existsSync(join(ROOT, contract.chain.traceFixture))) fail('trace missing');

  const adr = readFileSync(join(ROOT, 'docs/adr/SP-z-product-contract.md'), 'utf8');
  const decision = readFileSync(join(ROOT, 'design/DECISIONS.md'), 'utf8');
  const parent = readFileSync(join(ROOT, 'docs/PRODUCT_COMPLETION_EVOLUTION_KO.md'), 'utf8');
  for (const text of [adr, decision, parent]) {
    if (!text.includes(QUOTE)) fail('adoption quote');
  }
  if (!adr.includes('상태: **채택**') || !adr.includes('z-product-contract만')) fail('adr scope');
  if (!adr.includes('contract_change=NO')) fail('adr change');
  if (!decision.includes('## Dz-product-contract')) fail('decision id');
  if (!parent.includes('z-product-contract만')) fail('parent note');
  for (const stage of contract.stages) {
    if (!adr.includes(stage.id) || !adr.includes(stage.title)) fail(`adr stage ${stage.id}`);
  }
  for (const cap of contract.capabilities) {
    if (!adr.includes(cap.owner)) fail(`adr owner ${cap.owner}`);
  }
  for (const row of contract.fixtureImpact) {
    if (!adr.includes(row.caseKind)) fail(`adr kind ${row.caseKind}`);
  }

  const hits = [];
  walk(join(ROOT, 'apps/web/src'), hits);
  walk(join(ROOT, 'crates'), hits);
  if (hits.length > 0) fail(`runtime ledger in ${hits.join(', ')}`);

  console.log(
    'product-contract 16 ids unchanged; chain one snapshot; user decisions open; internal choices adopted; fixture impact 124 unchanged; runtime hits 0',
  );
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export { main };
