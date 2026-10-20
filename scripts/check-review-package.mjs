#!/usr/bin/env node
// User-review plan package check: committed artifacts match their recorded
// SHA-256 digests and stamp the same plan id on every part. This file checks
// review material only; it is not a runtime API and approves nothing.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = join(ROOT, 'docs/qualification/review-package');
const MANIFEST = join(DIR, 'manifest.json');
const INDEX = join(DIR, 'index.md');
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function csvCount(files) {
  return files.filter((file) => file.path.endsWith('.csv')).length;
}

export function main() {
  if (!existsSync(INDEX)) fail('index.md missing');
  const index = readFileSync(INDEX, 'utf8');
  if (!index.includes('승인') || !index.includes('합성')) fail('index honesty wording');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.task !== 'ZARI-z-product-qualification') fail('manifest head');
  if (manifest.approved !== false || manifest.status !== 'draft-review') fail('approval flag');
  if (!HEX64.test(manifest.planRevision ?? '')) fail('plan revision');
  if (!HEX40.test(manifest.sourceCommit ?? '')) fail('source commit');
  if (typeof manifest.captureCommand !== 'string' || !manifest.captureCommand.includes('ZARI_REVIEW_DIR')) {
    fail('capture command');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length < 3) fail('file list');
  const names = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || file.path.includes('..') || file.path.startsWith('/')) {
      fail(`file path ${file.path}`);
    }
    if (names.has(file.path)) fail(`duplicate ${file.path}`);
    names.add(file.path);
    const full = join(DIR, file.path);
    if (!existsSync(full)) fail(`${file.path} missing`);
    if (sha256(full) !== file.sha256) fail(`${file.path} digest`);
    if (file.bytes !== readFileSync(full).byteLength) fail(`${file.path} bytes`);
  }
  if (!names.has('plan-package.html')) fail('plan-package.html not in manifest');
  if (csvCount(manifest.files) === 0) fail('no csv in manifest');
  const html = readFileSync(join(DIR, 'plan-package.html'), 'utf8');
  if (!html.includes(manifest.planRevision)) fail('plan id missing from package');
  if (!/data-revision="[0-9a-f]{64}"/.test(html)) fail('revision attribute');
  if (!html.includes('계획 ID')) fail('plan label');
  const csvFiles = manifest.files.filter((file) => file.path.endsWith('.csv'));
  for (const file of csvFiles) {
    const text = readFileSync(join(DIR, file.path), 'utf8');
    if (text.charCodeAt(0) === 0xfeff) fail(`${file.path} BOM kept raw`);
    if (!text.includes(manifest.planRevision)) fail(`${file.path} plan id`);
  }
  console.log(
    `review package ${manifest.files.length} files verified; plan ${manifest.planRevision.slice(0, 12)}; approved false`,
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
