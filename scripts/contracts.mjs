import { readFile, writeFile, mkdir, readdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { compile } from 'json-schema-to-typescript';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { transform, build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDir = join(root, 'apps/web/src/contracts/generated');
const roots = ['ProtocolRequest', 'ProtocolResponse', 'BootstrapProbeDto', 'BootstrapProbeResult', 'BootstrapFixture'];
const files = ['schema.json', 'dto.ts', 'validators.mjs', 'validators.d.mts'];
const mode = process.argv[2];
if (!['generate', 'check'].includes(mode)) throw new Error('Usage: node scripts/contracts.mjs generate|check');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, canonical(v)]));
  return value;
}
function mergeDefinition(target, name, schema) {
  // Schemars omits a definition's title when nested; use its stable Rust name.
  schema = { ...schema, title: name };
  if (Object.hasOwn(target, name)) assert.deepEqual(canonical(target[name]), canonical(schema), `Conflicting Rust definition: ${name}`);
  else target[name] = schema;
}
async function generate(dir) {
  const exported = spawnSync('cargo', ['run', '-p', 'zari-core', '--locked', '--example', 'export_contracts'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (exported.error) throw exported.error;
  if (exported.status !== 0) throw new Error(`Rust schema export failed: ${exported.stderr}`);
  const schemas = JSON.parse(exported.stdout);
  assert.deepEqual(Object.keys(schemas).sort(), [...roots].sort(), 'Rust exporter root set must be exact.');
  const definitions = {};
  for (const name of roots) {
    const { $schema: dialect, definitions: nested = {}, $id: _id, ...definition } = schemas[name];
    assert.equal(dialect, 'http://json-schema.org/draft-07/schema#', `${name} must be draft-07`);
    for (const [key, schema] of Object.entries(nested)) mergeDefinition(definitions, key, schema);
    mergeDefinition(definitions, name, definition);
  }
  const schema = canonical({
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://zari.local/contracts/bootstrap-v1',
    title: 'ZariContractBundle',
    type: 'object',
    additionalProperties: false,
    required: roots,
    properties: Object.fromEntries(roots.map((name) => [name, { $ref: `#/definitions/${name}` }])),
    definitions,
  });
  const types = await compile(schema, 'ZariContractBundle', {
    bannerComment: '/* Generated from Rust DTOs. Run npm run contracts:generate; do not edit. */',
    unreachableDefinitions: true,
    style: { singleQuote: true, semi: true, printWidth: 100, tabWidth: 2 },
    maxItems: -1,
  });
  const ajv = new Ajv({ strict: true, allErrors: true, code: { source: true, esm: true } });
  ajv.addSchema(schema);
  const exports = Object.fromEntries(roots.map((name) => [`validate${name}`, `${schema.$id}#/definitions/${name}`]));
  const standalone = standaloneCode(ajv, exports);
  // Ajv's standalone runtime helpers are bundled locally; browsers never load Ajv or a CDN.
  const bundled = await build({
    stdin: { contents: standalone, resolveDir: root, sourcefile: 'validators.mjs', loader: 'js' },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
    legalComments: 'none', treeShaking: true,
  });
  const formatted = await transform(bundled.outputFiles[0].text, { format: 'esm', target: 'es2022', legalComments: 'none' });
  const declaration = `/* Generated from Rust DTOs. Do not edit. */\nimport type { ValidateFunction } from 'ajv';\nimport type { ${roots.join(', ')} } from './dto';\n${roots.map((name) => `export const validate${name}: ValidateFunction<${name}>;`).join('\n')}\n`;
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(join(dir, 'schema.json'), `${JSON.stringify(schema, null, 2)}\n`),
    writeFile(join(dir, 'dto.ts'), types),
    writeFile(join(dir, 'validators.mjs'), `/* Generated from Rust DTOs. Do not edit. */\n${formatted.code}`),
    writeFile(join(dir, 'validators.d.mts'), declaration),
  ]);
  const validateFixture = ajv.getSchema(exports.validateBootstrapFixture);
  const fixtureDir = join(root, 'fixtures/bootstrap');
  const fixtureFiles = (await readdir(fixtureDir)).filter((name) => name.endsWith('.json')).sort();
  assert.ok(fixtureFiles.length > 0, 'Shared fixtures must exist.');
  const ids = new Set();
  for (const name of fixtureFiles) {
    const fixture = JSON.parse(await readFile(join(fixtureDir, name), 'utf8'));
    assert.ok(validateFixture(fixture), `${name} violates the Rust fixture schema: ${ajv.errorsText(validateFixture.errors)}`);
    assert.ok(!ids.has(fixture.caseId), `Duplicate fixture caseId: ${fixture.caseId}`);
    ids.add(fixture.caseId);
  }
  return fixtureFiles.length;
}
if (mode === 'generate') {
  const count = await generate(outputDir);
  console.log(`Generated ${files.length} Rust contract artifacts; ${count} fixture structures valid.`);
} else {
  const temporary = await mkdtemp(join(tmpdir(), 'zari-contracts-'));
  try {
    const count = await generate(temporary);
    for (const file of files) assert.equal(await readFile(join(outputDir, file), 'utf8'), await readFile(join(temporary, file), 'utf8'), `${file} has generated drift; run npm run contracts:generate and review the diff.`);
    const actualFiles = (await readdir(outputDir)).sort();
    assert.deepEqual(actualFiles, [...files].sort(), 'Unexpected generated artifact.');
    console.log(`Contracts match Rust source; ${count} fixture structures valid.`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
