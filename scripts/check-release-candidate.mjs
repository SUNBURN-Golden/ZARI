#!/usr/bin/env node
// z-local-delivery release-candidate manifest check. The manifest is a
// handoff document — a release candidate, not a release. This script verifies
// the manifest against the repository's actual pins and (with --dist) against
// a locally built apps/web/dist. It is not a runtime API and does not run in
// CI before `npm run build`, so the default mode never requires dist/.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MANIFEST = join(ROOT, 'docs/delivery/release-candidate/manifest.json');
const DIST = join(ROOT, 'apps/web/dist');
const PLAN = '0847d1b065627938acfad3a941de79e357570e43';
const BASE = '3e76e96512a50cd13167587d7539d38454501813';
const HEX = /^[0-9a-f]{40}$/;
const SHA = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function distFiles() {
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const rel = relative(DIST, path).replaceAll('\\', '/');
        if (rel !== 'zari-build.json') files.set(rel, sha256(readFileSync(path)));
      }
    }
  };
  walk(DIST);
  return files;
}

function writeDistSection(manifest) {
  if (!existsSync(DIST)) fail('apps/web/dist is missing; run npm run build first');
  const build = JSON.parse(readFileSync(join(DIST, 'zari-build.json'), 'utf8'));
  const files = Object.fromEntries([...distFiles()].sort(([a], [b]) => a.localeCompare(b)));
  manifest.dist = {
    buildId: build.buildId,
    builtAt: build.builtAt,
    note: 'Observed on the builder machine. builtAt changes every build; file digests and buildId are content-derived.',
    files,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`recorded ${Object.keys(files).length} dist digests, buildId ${build.buildId}`);
}

function checkDist(manifest) {
  if (!existsSync(DIST)) fail('apps/web/dist is missing; run npm run build before --dist');
  const build = JSON.parse(readFileSync(join(DIST, 'zari-build.json'), 'utf8'));
  if (!manifest.dist || typeof manifest.dist !== 'object') fail('manifest.dist missing');
  if (manifest.dist.buildId !== build.buildId)
    fail(`buildId drift: manifest ${manifest.dist.buildId} vs dist ${build.buildId}`);
  const actual = distFiles();
  const recorded = new Map(Object.entries(manifest.dist.files ?? {}));
  const missing = [...actual.keys()].filter((name) => !recorded.has(name));
  const extra = [...recorded.keys()].filter((name) => !actual.has(name));
  const drift = [...actual.entries()].filter(([name, sha]) => recorded.get(name) !== sha);
  if (missing.length > 0) fail(`unrecorded dist files: ${missing.join(', ')}`);
  if (extra.length > 0) fail(`recorded files missing on disk: ${extra.join(', ')}`);
  if (drift.length > 0)
    fail(
      `digest drift: ${drift.map(([name]) => name).join(', ')}`,
    );
  console.log(`dist digests match: ${actual.size} files, buildId ${build.buildId}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (args.has('--write')) {
    writeDistSection(manifest);
    return;
  }

  if (manifest.schemaVersion !== 1) fail('schemaVersion');
  if (manifest.task !== 'ZARI-z-local-delivery') fail('task');
  if (manifest.issue !== 118) fail('issue');
  if (manifest.planCommit !== PLAN) fail('planCommit');
  if (manifest.observedBase !== BASE || !HEX.test(manifest.observedBase)) fail('observedBase');
  if (manifest.label !== 'release candidate — not a release') fail('label');
  if (manifest.releaseState !== 'NOT_AUTHORIZED') fail('releaseState');
  if (manifest.captureAcceptance !== 'PENDING') fail('captureAcceptance');
  for (const key of [
    'developmentMergeCertifiesPhysicalFacts',
    'developmentMergeCertifiesDevice',
    'developmentMergeCertifiesAcceptance',
    'developmentMergeCertifiesRelease',
  ]) {
    if (manifest[key] !== false) fail(key);
  }
  if (manifest.syntheticCatalog !== true) fail('synthetic catalog must stay declared');
  if (manifest.sourceCommit !== null)
    fail('sourceCommit is recorded by the delivery PR, not guessed here');

  const t = manifest.toolchain ?? {};
  if (t.node !== read('.nvmrc').trim()) fail('node pin');
  const pkg = JSON.parse(read('package.json'));
  if (t.nodeEngines !== pkg.engines.node || t.npmEngines !== pkg.engines.npm) fail('engines');
  if (t.npm !== pkg.packageManager.replace('npm@', '')) fail('npm pin');
  const toolchain = read('rust-toolchain.toml');
  if (t.rust !== /channel\s*=\s*"([^"]+)"/.exec(toolchain)?.[1]) fail('rust pin');
  const lock = read('Cargo.lock');
  if (
    t.wasmBindgen !==
    /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1]
  )
    fail('wasm-bindgen pin');

  const dbSource = read('apps/web/src/persistence/db.ts');
  if (manifest.storage?.dbVersion !== Number(/export const DB_VERSION = (\d+)/.exec(dbSource)?.[1]))
    fail('dbVersion');
  if (manifest.storage?.schemaVersion !== Number(/export const SCHEMA_VERSION = (\d+)/.exec(dbSource)?.[1]))
    fail('schemaVersion');
  const exportSource = read('apps/web/src/persistence/export.ts');
  if (manifest.storage?.exportVersion !== Number(/EXPORT_VERSION = (\d+)/.exec(exportSource)?.[1]))
    fail('exportVersion');
  const protocolSource = read('crates/core/src/protocol.rs');
  const workerSource = read('apps/web/src/worker/client.ts');
  const buildId = /pub const BUILD_ID: &str = "([^"]+)"/.exec(protocolSource)?.[1];
  if (manifest.domainBuildId !== buildId) fail('domain BUILD_ID');
  if (!workerSource.includes(`'${buildId}'`)) fail('worker BUILD_ID pin');

  const fixtures = JSON.parse(read('fixtures/manifest.json'));
  if (manifest.fixtures?.total !== fixtures.entries.length) fail('fixture count');
  const bootstrap = readdirSync(join(ROOT, 'fixtures/bootstrap')).filter((n) => n.endsWith('.json'));
  if (manifest.fixtures?.bootstrap !== bootstrap.length) fail('bootstrap count');

  const ledger = JSON.parse(read('docs/qualification/z-denominator.json'));
  const self = (ledger.nodes ?? []).find((node) => node.id === 'z-local-delivery');
  if (!self || self.node_state !== 'IN_PROGRESS') fail('denominator node state');
  if (self.deliveryEvidence !== 'docs/evidence/ZARI-z-local-delivery.md') fail('evidence pointer');

  const gaps = new Map((manifest.requiredGaps ?? []).map((gap) => [gap.id, gap.state]));
  for (const [id, state] of [
    ['physical-phone', 'UNQUALIFIED'],
    ['discrete-gpu', 'UNQUALIFIED'],
    ['real-product-sites', 'UNQUALIFIED'],
    ['new-capture-acceptance', 'PENDING'],
    ['release', 'NOT_AUTHORIZED'],
    ['independent-review-z-local-delivery', 'BLOCKED'],
    ['app-catalog-url-read', 'UNQUALIFIED'],
  ]) {
    if (gaps.get(id) !== state) fail(`required gap ${id}`);
  }

  for (const doc of [
    'docs/delivery/LOCAL_DELIVERY.md',
    'docs/delivery/release-candidate/index.md',
    'docs/evidence/ZARI-z-local-delivery.md',
    'docs/adr/SP-z-local-delivery.md',
  ]) {
    if (!existsSync(join(ROOT, doc))) fail(`${doc} missing`);
  }

  if (args.has('--dist')) checkDist(manifest);
  console.log(
    'release candidate manifest consistent: pins match repo, gaps kept, release NOT_AUTHORIZED',
  );
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
