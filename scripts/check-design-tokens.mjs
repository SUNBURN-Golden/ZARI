#!/usr/bin/env node
// Dependency-free checks for ZARI's intentionally simple token declaration format.
// Not a general CSS parser, browser test, or complete accessibility audit.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function parseTokens(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...clean.matchAll(/:root\s*\{([^}]*)\}/g)];
  assert.ok(blocks.length > 0, 'Missing :root block');
  const tokens = new Map();
  const declarations = body => body.split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const m = x.match(/^(--zari-[a-z0-9-]+)\s*:\s*([\s\S]+)$/);
    assert.ok(m, `Unsupported token declaration: ${x}`);
    return [m[1], m[2].trim()];
  });
  for (const [name, value] of declarations(blocks[0][1])) {
    assert.ok(!tokens.has(name), `Duplicate base token: ${name}`);
    tokens.set(name, value);
  }
  for (const match of clean.matchAll(/var\((--zari-[a-z0-9-]+)/g)) {
    assert.ok(tokens.has(match[1]), `Undefined token: ${match[1]}`);
  }
  for (const block of blocks.slice(1)) {
    for (const [name, value] of declarations(block[1])) {
      assert.ok(tokens.has(name), `Unknown override: ${name}`);
      assert.ok(name.startsWith('--zari-duration-') && value === '0ms',
        `Review required for new token override: ${name}`);
    }
  }
  return tokens;
}

/** Custom properties referenced by component CSS must be declared in tokens.css. */
export function undeclaredCustomProperties(css, declared) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const missing = [];
  for (const match of clean.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)) {
    if (!declared.has(match[1]) && !missing.includes(match[1])) missing.push(match[1]);
  }
  return missing;
}

async function componentStyles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await componentStyles(path));
    else if (entry.name.endsWith('.css') && entry.name !== 'tokens.css') found.push(path);
  }
  return found;
}

export function resolveColor(tokens, name, seen = new Set()) {
  assert.ok(tokens.has(name), `Missing color token: ${name}`);
  assert.ok(!seen.has(name), `Alias cycle: ${name}`);
  const next = new Set(seen).add(name);
  const value = tokens.get(name);
  const alias = value.match(/^var\((--zari-[a-z0-9-]+)\)$/);
  if (alias) return resolveColor(tokens, alias[1], next);
  assert.match(value, /^#[0-9a-f]{6}$/i, `Expected opaque 6-digit sRGB hex: ${name}`);
  return value;
}

export function contrast(foreground, background) {
  const luminance = hex => {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function selfTest() {
  const tests = [
    () => assert.equal(contrast('#000000', '#FFFFFF'), 21),
    () => assert.equal(contrast('#FFFFFF', '#FFFFFF'), 1),
    () => assert.ok(contrast('#777777', '#FFFFFF') < 4.5),
    () => assert.equal(resolveColor(new Map([['--zari-a', 'var(--zari-b)'], ['--zari-b', '#FFFFFF']]), '--zari-a'), '#FFFFFF'),
    () => assert.throws(() => resolveColor(new Map([['--zari-a', 'var(--zari-a)']]), '--zari-a'), /cycle/),
    () => assert.throws(() => resolveColor(new Map(), '--zari-missing'), /Missing/),
    () => assert.throws(() => resolveColor(new Map([['--zari-a', 'rgb(0 0 0 / 50%)']]), '--zari-a'), /opaque/),
    () => assert.throws(() => parseTokens(':root { --zari-a: #000000; --zari-a: #FFFFFF; }'), /Duplicate/),
    () => assert.throws(() => parseTokens(':root { --zari-a: var(--zari-missing); }'), /Undefined/),
    () => assert.throws(() => parseTokens(':root { --zari-a: #FFFFFF; } @media print { :root { --zari-a: #000000; } }'), /Review/),
    () => assert.deepEqual(undeclaredCustomProperties('.a { color: var(--zari-text-primary); }', new Set(['--zari-text-primary'])), []),
    () => assert.deepEqual(
      undeclaredCustomProperties('.a { color: var(--surface, #fff); background: var(--zari-danger); }', new Set(['--zari-danger'])),
      ['--surface'],
    ),
  ];
  for (const test of tests) test();
  console.log(`PASS: ${tests.length} checker self-tests`);
}

async function main() {
  assert.ok(process.argv.slice(2).every(x => x === '--self-test'), 'Only --self-test is supported');
  if (process.argv.includes('--self-test')) selfTest();
  const root = new URL('../', import.meta.url);
  const css = await readFile(new URL('apps/web/src/styles/tokens.css', root), 'utf8');
  const data = JSON.parse(await readFile(new URL('design/token-contrast-cases.json', root), 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.ok(Array.isArray(data.cases) && data.cases.length > 0, 'Missing contrast cases');
  const tokens = parseTokens(css), ids = new Set();
  const stylesDir = new URL('apps/web/src/', root);
  const componentCss = await componentStyles(stylesDir.pathname);
  for (const path of componentCss) {
    const missing = undeclaredCustomProperties(await readFile(path, 'utf8'), new Set(tokens.keys()));
    assert.deepEqual(missing, [], `${path} references undeclared custom properties: ${missing.join(', ')}`);
  }
  let failures = 0;
  for (const item of data.cases) {
    assert.ok(typeof item.id === 'string' && item.id.length > 0 && !ids.has(item.id), 'Missing/duplicate case ID');
    ids.add(item.id);
    assert.ok(Number.isFinite(item.minimum) && [3, 4.5, 7].includes(item.minimum), 'Unsupported minimum');
    const ratio = contrast(resolveColor(tokens, item.foreground), resolveColor(tokens, item.background));
    const passed = ratio >= item.minimum; // Never round before threshold comparison.
    if (!passed) failures++;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${item.id}: ${ratio.toFixed(3)}:1 >= ${item.minimum}:1`);
  }
  console.log(`${tokens.size} base tokens; ${data.cases.length - failures}/${data.cases.length} contrast cases passed.`);
  console.log('Scope: declared opaque token pairs, not rendered UI, whole CSS validity, or full WCAG conformance.');
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
