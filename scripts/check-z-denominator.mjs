#!/usr/bin/env node
// z-product-qualification handoff projection. A merged node is not DONE, and
// this file is not a runtime API. The original denominator is kept: unfinished
// items are reported, not dropped.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const LEDGER = join(ROOT, 'docs/qualification/z-denominator.json');
const PROGRAM = join(ROOT, '.aiops/program.json');
const SIXTEEN = join(ROOT, 'docs/qualification/denominator.json');
const PLAN = '0847d1b065627938acfad3a941de79e357570e43';
const HEX = /^[0-9a-f]{40}$/;
const REVIEW_COMMENT = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+#issuecomment-\d+$/;

export function reviewPointerAllowed(value) {
  return value === null || (typeof value === 'string' && REVIEW_COMMENT.test(value));
}

export function assertNodeClaim(node) {
  if (node.node_state === 'DONE' || node.qualification_state === 'QUALIFIED') {
    throw new Error(`${node.id} overclaims`);
  }
  if (!reviewPointerAllowed(node.reviewPointer) || node.auditPointer !== null) {
    throw new Error(`${node.id} invented pointer`);
  }
}

function fail(message) {
  throw new Error(message);
}

function walk(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'target') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, hits);
    else if (/\.(ts|tsx|rs|js|mjs)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8');
      if (text.includes('z-denominator') || text.includes('qualification_state')) {
        hits.push(path);
      }
    }
  }
}

const PROGRAM_ORDER = [
  'z-product-contract',
  'z-inventory-lifecycle',
  'z-catalog-provenance',
  'z-offer-bundles',
  'z-strategy-library',
  'z-pareto-comparison',
  'z-incremental-replan',
  'z-search-diagnostics',
  'z-accessibility-workspace',
  'z-portable-project',
  'z-purchase-handoff',
  'z-execution-checklist',
  'z-location-search',
  'z-feedback-reorganize',
  'z-print-share',
  'z-performance-budget',
  'z-privacy-offline',
  'z-guided-onboarding',
  'z-product-qualification',
  'z-local-delivery',
];

function main() {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const program = JSON.parse(readFileSync(PROGRAM, 'utf8'));
  const sixteen = JSON.parse(readFileSync(SIXTEEN, 'utf8'));
  if (ledger.planCommit !== PLAN || sixteen.planCommit !== PLAN) fail('plan commit');
  if (ledger.denominator !== 21) fail('denominator');
  if (ledger.parts?.program !== 20 || ledger.parts?.ownerAmendment !== 1) fail('parts');
  if (ledger.projection !== 'handoff document only; not a runtime API') fail('projection label');
  for (const key of [
    'developmentMergeCertifiesPhysicalFacts',
    'developmentMergeCertifiesDevice',
    'developmentMergeCertifiesAcceptance',
    'developmentMergeCertifiesRelease',
  ]) {
    if (ledger[key] !== false) fail(key);
  }
  if (ledger.optionalCannotWaiveRequired !== true) fail('optional waiver');
  if (ledger.captureAcceptance !== 'PENDING') fail('capture acceptance');
  if (ledger.releaseDefault !== 'NOT_AUTHORIZED') fail('release default');
  if (ledger.sixteenNodeDenominator !== 'docs/qualification/denominator.json') fail('16 link');
  if (sixteen.denominator !== 16) fail('16 denominator moved');

  const gaps = new Map((ledger.requiredGaps ?? []).map((gap) => [gap.id, gap]));
  for (const [id, state] of [
    ['physical-phone', 'UNQUALIFIED'],
    ['discrete-gpu', 'UNQUALIFIED'],
    ['real-product-sites', 'UNQUALIFIED'],
    ['z-local-delivery', 'NOT_STARTED'],
    ['new-capture-acceptance', 'PENDING'],
    ['release', 'NOT_AUTHORIZED'],
    ['independent-review-z-product-qualification', 'BLOCKED'],
    ['app-catalog-url-read', 'UNQUALIFIED'],
  ]) {
    const gap = gaps.get(id);
    if (!gap || gap.state !== state || typeof gap.nextAction !== 'string' || gap.nextAction.length < 8) {
      fail(`required gap ${id}`);
    }
  }

  if (!Array.isArray(ledger.nodes) || ledger.nodes.length !== 21) fail('node count');
  const programIds = new Set(program.nodes.map((node) => node.id));
  const programRows = ledger.nodes.filter((node) => node.origin === 'program');
  const amendmentRows = ledger.nodes.filter((node) => node.origin === 'ownerAmendment');
  if (programRows.length !== 20 || amendmentRows.length !== 1) fail('origin counts');
  programRows.forEach((node, index) => {
    if (node.id !== PROGRAM_ORDER[index]) fail(`order ${node.id}`);
    if (!programIds.has(node.id)) fail(`${node.id} not in program`);
  });
  for (const node of amendmentRows) {
    if (node.id !== 'z-catalog-crawler') fail('amendment id');
    if (programIds.has(node.id)) fail('amendment is inside program.json');
  }
  for (const node of ledger.nodes) {
    assertNodeClaim(node);
    if (node.acceptance_state !== 'PENDING' || node.release_state !== 'NOT_AUTHORIZED') {
      fail(`${node.id} axes`);
    }
    if (node.node_state === 'MERGED') {
      if (node.qualification_state !== 'PARTIAL') fail(`${node.id} qualification`);
      if (!HEX.test(node.deliveryCommit) || !HEX.test(node.mergeCommit)) fail(`${node.id} sha`);
      if (typeof node.pullRequest !== 'number' || typeof node.issue !== 'number') {
        fail(`${node.id} numbers`);
      }
      if (!existsSync(join(ROOT, node.deliveryEvidence))) fail(`${node.id} evidence missing`);
    } else if (node.node_state === 'IN_PROGRESS') {
      if (node.id !== 'z-product-qualification') fail(`IN_PROGRESS ${node.id}`);
      if (node.deliveryCommit !== null || node.mergeCommit !== null || node.pullRequest !== null) {
        fail('in-progress pointers');
      }
      if (!existsSync(join(ROOT, node.deliveryEvidence))) fail('in-progress evidence missing');
    } else if (node.node_state === 'NOT_STARTED') {
      if (node.id !== 'z-local-delivery') fail(`NOT_STARTED ${node.id}`);
      if (node.qualification_state !== 'UNQUALIFIED') fail('not-started qualification');
      if (
        node.deliveryCommit !== null ||
        node.mergeCommit !== null ||
        node.pullRequest !== null ||
        node.issue !== null ||
        node.deliveryEvidence !== null
      ) {
        fail('not-started pointers');
      }
    } else {
      fail(`${node.id} state`);
    }
  }

  const hits = [];
  walk(join(ROOT, 'apps/web/src'), hits);
  walk(join(ROOT, 'crates'), hits);
  if (hits.length > 0) fail(`runtime projection in ${hits.join(', ')}`);

  console.log(
    'z denominator 21=20 program+1 amendment; merged 19; in-progress 1; not-started 1; capture PENDING; release NOT_AUTHORIZED; runtime hits 0',
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
