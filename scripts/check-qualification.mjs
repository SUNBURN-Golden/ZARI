#!/usr/bin/env node
// SP-016 handoff projection. A merged node is not DONE, and this file is not a runtime API.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const LEDGER = join(ROOT, 'docs/qualification/denominator.json');
const HANDOFF = join(ROOT, 'docs/qualification/SP-016-HANDOFF.md');
const PLAN = '0847d1b065627938acfad3a941de79e357570e43';
const HEX = /^[0-9a-f]{40}$/;
const REVIEW_COMMENT = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+#issuecomment-\d+$/;

/** Null, or a pull-request comment URL. Other strings are not review receipts. */
export function reviewPointerAllowed(value) {
  return value === null || (typeof value === 'string' && REVIEW_COMMENT.test(value));
}

/** DONE and QUALIFIED stay forbidden. A comment URL is not an audit receipt. */
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
      if (text.includes('qualification_state') || text.includes('docs/qualification/denominator')) {
        hits.push(path);
      }
    }
  }
}

function main() {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  if (ledger.planCommit !== PLAN) fail('plan commit');
  if (ledger.denominator !== 16) fail('denominator');
  if (ledger.parts?.spatial !== 7 || ledger.parts?.measurement !== 4 || ledger.parts?.product !== 5) {
    fail('parts are not 7+4+5');
  }
  if (ledger.parts.spatial + ledger.parts.measurement + ledger.parts.product !== 16) fail('parts sum');
  if (ledger.projection !== 'handoff document only; not a runtime API') fail('projection label');
  if (ledger.developmentMergeCertifiesPhysicalFacts !== false) fail('merge certifies facts');
  if (ledger.developmentMergeCertifiesDevice !== false) fail('merge certifies device');
  if (ledger.developmentMergeCertifiesAcceptance !== false) fail('merge certifies acceptance');
  if (ledger.developmentMergeCertifiesRelease !== false) fail('merge certifies release');
  if (ledger.optionalCannotWaiveRequired !== true) fail('optional waiver');
  if (ledger.captureAcceptance !== 'PENDING') fail('capture acceptance');
  if (ledger.approvedCaptureCount !== 0) fail('approved capture count');
  if (ledger.releaseDefault !== 'NOT_AUTHORIZED') fail('release default');
  const gaps = new Map((ledger.requiredGaps ?? []).map((gap) => [gap.id, gap]));
  for (const [id, state] of [
    ['physical-phone', 'UNQUALIFIED'],
    ['discrete-gpu', 'UNQUALIFIED'],
    ['new-capture-acceptance', 'PENDING'],
    ['release', 'NOT_AUTHORIZED'],
    ['independent-review-016', 'BLOCKED'],
    ['predecessor-review-and-audit-pointers', 'BLOCKED'],
  ]) {
    const gap = gaps.get(id);
    if (!gap || gap.state !== state || typeof gap.nextAction !== 'string' || gap.nextAction.length < 8) {
      fail(`required gap ${id}`);
    }
  }
  if (!Array.isArray(ledger.nodes) || ledger.nodes.length !== 16) fail('node count');
  const groups = { spatial: 0, measurement: 0, product: 0 };
  ledger.nodes.forEach((node, index) => {
    const id = String(index + 1).padStart(3, '0');
    if (node.id !== id) fail(`node order ${node.id}`);
    assertNodeClaim(node);
    if (node.acceptance_state !== 'PENDING' || node.release_state !== 'NOT_AUTHORIZED') fail(`${id} axes`);
    if (node.qualification_state !== 'PARTIAL') fail(`${id} qualification`);
    if (!existsSync(join(ROOT, node.deliveryEvidence))) fail(`${id} evidence missing`);
    groups[node.group] = (groups[node.group] ?? 0) + 1;
    if (id === '016') {
      if (node.node_state !== 'MERGED') fail('016 state');
      if (node.deliveryCommit !== '71ecffc1ba35e636c237ac94ce5bb265e41fe729') fail('016 delivery');
      if (node.mergeCommit !== '1bd3fde5bd9a625d02735d4de8609e97736db49d') fail('016 merge');
      if (node.pullRequest !== 74) fail('016 pull request');
      if (node.issue !== 73) fail('016 issue');
      return;
    }
    if (node.node_state !== 'MERGED') fail(`${id} is not MERGED`);
    if (!HEX.test(node.deliveryCommit) || !HEX.test(node.mergeCommit)) fail(`${id} sha`);
    if (typeof node.pullRequest !== 'number' || typeof node.issue !== 'number') fail(`${id} numbers`);
  });
  if (groups.spatial !== 7 || groups.measurement !== 4 || groups.product !== 5) fail('group counts');
  const handoff = readFileSync(HANDOFF, 'utf8');
  if (!handoff.includes(PLAN) || !handoff.includes('NOT_AUTHORIZED') || !handoff.includes('PENDING')) {
    fail('handoff axes');
  }
  for (const node of ledger.nodes) {
    if (!handoff.includes(node.id)) fail(`handoff omits ${node.id}`);
  }
  const hits = [];
  walk(join(ROOT, 'apps/web/src'), hits);
  walk(join(ROOT, 'crates'), hits);
  if (hits.length > 0) fail(`runtime projection in ${hits.join(', ')}`);
  console.log(
    `denominator 16=7+4+5; merged 16; in-progress 0; capture PENDING; release NOT_AUTHORIZED; runtime hits 0`,
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
