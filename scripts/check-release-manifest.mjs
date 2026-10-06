import { constants, brotliCompressSync, gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'apps/web/dist';
const manifest = JSON.parse(readFileSync(join(root, 'zari-build.json'), 'utf8'));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(relative(root, path).replaceAll('\\', '/'));
  }
}
walk(root);

const listed = new Set(assets);
const missing = files.filter((file) => file !== 'zari-build.json' && !listed.has(file));
const dangling = assets.filter((asset) => !files.includes(asset));
const unsafe = assets.filter(
  (asset) => asset.startsWith('/') || asset.includes('..') || asset.includes('://'),
);
function staticJsImports(source) {
  const names = new Set();
  for (const match of source.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) names.add(match[1]);
  for (const match of source.matchAll(/import\s*["']\.\/([^"']+\.js)["']/g)) names.add(match[1]);
  return [...names];
}
function allJsImports(source) {
  const names = new Set(staticJsImports(source));
  for (const match of source.matchAll(/import\s*\(\s*["'`](\.\/[^"'`]+\.js)["'`]\s*\)/g)) {
    names.add(match[1].replace(/^\.\//, ''));
  }
  const mapped = source.match(/m\.f\|\|\(m\.f=\[([^\]]*)\]\)/);
  if (mapped) {
    for (const match of mapped[1].matchAll(/["']\.\/([^"']+\.js)["']/g)) names.add(match[1]);
  }
  return [...names];
}
const assetNames = files.filter((file) => file.startsWith('assets/') && file.endsWith('.js')).map((file) => file.slice('assets/'.length));
const initial = new Set();
const initialQueue = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+\.js)"/g)].map((match) => match[1]);
while (initialQueue.length > 0) {
  const name = initialQueue.pop();
  if (initial.has(name) || !assetNames.includes(name)) continue;
  initial.add(name);
  for (const next of staticJsImports(readFileSync(join(root, 'assets', name), 'utf8'))) {
    if (!initial.has(next)) initialQueue.push(next);
  }
}
const spatialGraph = new Set();
const spatialQueue = assetNames.filter((file) => file.startsWith('SpatialView-'));
while (spatialQueue.length > 0) {
  const name = spatialQueue.pop();
  if (spatialGraph.has(name) || !assetNames.includes(name)) continue;
  spatialGraph.add(name);
  for (const next of allJsImports(readFileSync(join(root, 'assets', name), 'utf8'))) {
    if (!spatialGraph.has(next)) spatialQueue.push(next);
  }
}
const lazyNames = [...spatialGraph].filter((name) => !initial.has(name)).sort();
const spatial = files.filter((file) => /assets\/SpatialView-.*\.js$/.test(file));
const spatialInIndex = spatial.some((file) => html.includes(file.split('/').at(-1)));
const errors = [];
if (missing.length > 0) errors.push(`unlisted dist files: ${missing.join(', ')}`);
if (dangling.length > 0) errors.push(`manifest entries missing on disk: ${dangling.join(', ')}`);
if (unsafe.length > 0) errors.push(`unsafe asset paths: ${unsafe.join(', ')}`);
if (spatial.length !== 1) errors.push(`expected one SpatialView chunk, found ${spatial.length}`);
if (spatialInIndex) errors.push('index.html references the lazy SpatialView chunk');
if (!listed.has('sw.js')) errors.push('sw.js is not in the release manifest');

const jsText = files
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(join(root, file), 'utf8'))
  .join('\n');
const hookHits = ['__zariProjectionGate', '__zariCorruptProjection', '__zariProgressGate'].filter((hook) =>
  jsText.includes(hook),
);
if (hookHits.length > 0) errors.push(`production bundle contains test hooks: ${hookHits.join(', ')}`);
let spatialRawBytes = 0;
let spatialGzipBytes = 0;
let spatialBrotliBytes = 0;
for (const name of lazyNames) {
  const bytes = readFileSync(join(root, 'assets', name));
  spatialRawBytes += bytes.length;
  spatialGzipBytes += gzipSync(bytes, { level: 9 }).length;
  spatialBrotliBytes += brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}
const report = {
  buildId: manifest.buildId ?? null,
  assetCount: assets.length,
  spatial: spatial[0] ?? null,
  spatialChunks: lazyNames.map((name) => `assets/${name}`),
  spatialRawBytes: lazyNames.length > 0 ? spatialRawBytes : null,
  spatialGzipBytes: lazyNames.length > 0 ? spatialGzipBytes : null,
  spatialBrotliBytes: lazyNames.length > 0 ? spatialBrotliBytes : null,
  spatialInIndex,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exit(1);
