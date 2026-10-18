import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { initSync, reviewCatalogBundle } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type { CatalogBundleReview } from '../../src/contracts/generated/dto';
import {
  BUNDLE_BYTES_LIMIT,
  BUNDLE_ORIGIN,
  commitBundle,
  itemShapes,
  parseBaseUrl,
  readBundleFile,
  readRepository,
  reviewBundleText,
} from '../../src/features/catalog/bundle';
import type { BundleReviewer, TransportRequest } from '../../src/features/catalog/bundle';
import { CatalogManager } from '../../src/features/catalog/manager';
import { ZariDb } from '../../src/persistence/db';
import { ProjectRepository } from '../../src/persistence/repository';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

const ROOT = join(__dirname, '..', '..', '..', '..');
const GOLDEN = readFileSync(join(ROOT, 'tests/fixtures/catalog-collection/golden/bundle.json'), 'utf8');
// The same Rust review the Worker runs, called directly.
const reviewer: BundleReviewer = { review: async (text) => JSON.parse(reviewCatalogBundle(text)) as CatalogBundleReview };

function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A bundle with a *valid* checksum around arbitrary items, as a careless producer might write. */
function bundleOf(items: Record<string, unknown>[]): string {
  const base = JSON.parse(GOLDEN) as { manifest: Record<string, unknown>; items: Record<string, unknown>[] };
  const sorted = [...items].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  const body = canon(sorted);
  const sha = createHash('sha256').update(body).digest('hex');
  return canon({
    items: sorted,
    manifest: { ...base.manifest, bundleId: `b-${sha.slice(0, 16)}`, itemCount: sorted.length, bytes: Buffer.byteLength(body), sha256: sha },
  });
}
const goldenItems = () => (JSON.parse(GOLDEN) as { items: Record<string, unknown>[] }).items;

const fresh = () => {
  const db = new ZariDb(`catalog-bundle-${Math.random().toString(36).slice(2)}`);
  const repo = new ProjectRepository(db);
  return { db, repo, manager: new CatalogManager(null as never, repo) };
};

it('reviews the golden bundle: every item is unconfirmed and nothing is promoted', async () => {
  const read = await reviewBundleText(GOLDEN, reviewer);
  if (read.status !== 'reviewed') throw new Error(read.status);
  expect(read.review).toMatchObject({ quarantined: false, existingUntouched: true, itemCount: 9 });
  const json = JSON.stringify(read.review.snapshot);
  expect(json).not.toContain('"verification":"confirmed"');
  expect(json).not.toMatch(/image|thumbnail/i);
  expect(read.review.snapshot!.sourceKind).toBe('imported');
  expect(read.review.unconfirmedDimensionIds).toEqual(['crawl:29cm:3002', 'crawl:29cm:3005', 'crawl:ikea:23456789']);
});

it('draws only from W/D/H and the hint; unmeasured items are marked, not guessed', async () => {
  const read = await reviewBundleText(GOLDEN, reviewer);
  if (read.status !== 'reviewed') throw new Error(read.status);
  const shapes = itemShapes(read.review.snapshot!);
  const byId = Object.fromEntries(shapes.map((s) => [s.id, s]));
  // 80 cm × 30 cm × 180 cm → mm, converted in Rust.
  expect(byId['crawl:ohou:1001']).toMatchObject({ widthMm: 800, depthMm: 300, heightMm: 1800, hint: 'shelf', measured: true });
  expect(byId['crawl:ikea:80275887']).toMatchObject({ widthMm: 770, depthMm: 390, heightMm: 1470, measured: true });
  for (const id of ['crawl:29cm:3002', 'crawl:29cm:3005', 'crawl:ikea:23456789']) {
    expect(byId[id]).toMatchObject({ widthMm: null, depthMm: null, heightMm: null, measured: false });
  }
  expect(shapes.filter((s) => s.measured)).toHaveLength(6);
  // The outer size is never copied into the inner cavity.
  for (const variant of read.review.snapshot!.variants) {
    expect(variant.dimensions.inner.width.state).toBe('unknown');
  }
});

it('rejects a bundle with images, a bad checksum, a bad host or a wrong version — and writes nothing', async () => {
  const { repo, manager } = fresh();
  await repo.open();
  const before = await repo.listCatalogs();
  const manifestTampered = (JSON.parse(GOLDEN) as { items: unknown[] }).items;
  const cases: [string, string, string][] = [
    ['image field', bundleOf(goldenItems().map((i, n) => (n === 0 ? { ...i, image: 'x' } : i))), 'image_refused'],
    ['image url', bundleOf(goldenItems().map((i, n) => (n === 0 ? { ...i, name: 'https://cdn.example/a.webp' } : i))), 'image_refused'],
    ['unknown field', bundleOf(goldenItems().map((i, n) => (n === 0 ? { ...i, extra: 1 } : i))), 'bundle_schema_invalid'],
    ['checksum', GOLDEN.replace('모듈 5단 선반', '변조된 선반'), 'checksum_mismatch'],
    ['version', GOLDEN.replace('"schemaVersion":1', '"schemaVersion":2'), 'schema_version_mismatch'],
    ['not json', '{', 'invalid_json'],
  ];
  for (const [label, text, code] of cases) {
    const read = await reviewBundleText(text, reviewer);
    if (read.status !== 'reviewed') throw new Error(`${label}: ${read.status}`);
    expect(read.review.codes, label).toContain(code);
    expect(read.review.snapshot, label).toBeNull();
    expect(await commitBundle(manager, read.review), label).toBe('blocked');
  }
  expect(manifestTampered).toHaveLength(9);
  expect(await repo.listCatalogs()).toEqual(before);
});

it('one quarantined row blocks the whole bundle and the stored catalogs stay as they were', async () => {
  const { repo, manager } = fresh();
  await repo.open();
  const good = await reviewBundleText(GOLDEN, reviewer);
  if (good.status !== 'reviewed') throw new Error('golden');
  expect(await commitBundle(manager, good.review)).toBe('saved');
  const stored = await repo.listCatalogs();
  expect(stored.map((c) => c.origin)).toEqual([BUNDLE_ORIGIN]);

  const items = goldenItems();
  const bad = items.map((item, n) => (n === 2 ? { ...item, productUrl: 'https://evil.example/products/1' } : item));
  const read = await reviewBundleText(bundleOf(bad), reviewer);
  if (read.status !== 'reviewed') throw new Error('bad');
  expect(read.review.quarantined).toBe(true);
  expect(read.review.snapshot).toBeNull();
  expect(read.review.items.map((i) => i.codes)).toEqual([['product_url_not_allowed']]);
  expect(await commitBundle(manager, read.review)).toBe('blocked');
  expect(await repo.listCatalogs()).toEqual(stored);

  // Two sizes under one id are not merged: both rows are quarantined.
  const dup = items.slice(0, 2).map((item) => ({ ...item, id: 'crawl:ohou:9' })) as Record<string, unknown>[];
  dup[1] = { ...dup[1]!, dimensions: { ...(dup[0]!.dimensions as object), height: '999' } };
  const conflict = await reviewBundleText(bundleOf(dup), reviewer);
  if (conflict.status !== 'reviewed') throw new Error('conflict');
  expect(conflict.review.quarantined).toBe(true);
});

it('caches the verified catalog in IndexedDB and reopens it from a new session', async () => {
  const name = `catalog-bundle-reopen-${Math.random().toString(36).slice(2)}`;
  const first = new ProjectRepository(new ZariDb(name));
  await first.open();
  const read = await reviewBundleText(GOLDEN, reviewer);
  if (read.status !== 'reviewed') throw new Error('golden');
  expect(await commitBundle(new CatalogManager(null as never, first), read.review)).toBe('saved');
  const digest = read.review.snapshot!.catalogDigest;

  const second = new ProjectRepository(new ZariDb(name));
  await second.open();
  const row = await second.getCatalog(digest);
  expect(row?.origin).toBe(BUNDLE_ORIGIN);
  expect(row?.catalog.variants).toHaveLength(9);
  // The same bundle again is the same quote, not a second catalog.
  expect(await commitBundle(new CatalogManager(null as never, second), read.review)).toBe('saved');
  expect(await second.listCatalogs()).toHaveLength(1);
});

it('bounds a picked file before reading it', async () => {
  let read = false;
  const huge = { size: BUNDLE_BYTES_LIMIT + 1, text: async () => ((read = true), 'x') };
  expect(await readBundleFile(huge)).toEqual({ code: 'bundle_too_large' });
  expect(read).toBe(false);
  expect(await readBundleFile({ size: 2, text: async () => '{}' })).toEqual({ text: '{}' });
});

// ---- the read-only repository reader (core only; no transport is wired) ----

const POINTER = (id: string, bytes: number) =>
  JSON.stringify({ schemaVersion: 1, bundleId: id, sha256: 'a'.repeat(64), bytes, bundlePath: `catalog/v1/${id}/bundle.json` });
const BUNDLE_ID = (JSON.parse(GOLDEN) as { manifest: { bundleId: string } }).manifest.bundleId;

function mockRepository(overrides: { latest?: string; latestStatus?: number; bundle?: string; bundleStatus?: number } = {}) {
  const requests: TransportRequest[] = [];
  const transport = async (request: TransportRequest) => {
    requests.push(request);
    if (request.url.endsWith('/latest.json')) {
      return { status: overrides.latestStatus ?? 200, text: overrides.latest ?? POINTER(BUNDLE_ID, GOLDEN.length) };
    }
    return { status: overrides.bundleStatus ?? 200, text: overrides.bundle ?? GOLDEN };
  };
  return { requests, transport };
}

it('reads latest.json then the bundle: GET, no credentials, no redirects, https, bounded', async () => {
  const { requests, transport } = mockRepository();
  const read = await readRepository('https://catalog.example/zari', transport, reviewer);
  if (read.status !== 'reviewed') throw new Error(JSON.stringify(read));
  expect(read.review.quarantined).toBe(false);
  expect(requests.map((r) => r.url)).toEqual([
    'https://catalog.example/zari/catalog/v1/latest.json',
    `https://catalog.example/zari/catalog/v1/${BUNDLE_ID}/bundle.json`,
  ]);
  for (const request of requests) {
    expect(request).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(request.timeoutMs).toBeGreaterThan(0);
    expect(request.maxBytes).toBeLessThanOrEqual(BUNDLE_BYTES_LIMIT);
  }
  expect(requests[0]!.maxBytes).toBe(4096);
  expect(requests[1]!.maxBytes).toBe(GOLDEN.length);
});

it('refuses non-https, userinfo, query and unparseable base URLs without any request', async () => {
  for (const url of ['http://catalog.example/', 'https://u:p@catalog.example/', 'https://catalog.example/?k=v', 'https://catalog.example/#x', 'catalog.example', '', 'javascript:alert(1)', 'file:///x']) {
    const { requests, transport } = mockRepository();
    expect(parseBaseUrl(url), url).toBeNull();
    expect(await readRepository(url, transport, reviewer)).toEqual({ status: 'rejected', code: 'repository_url_invalid' });
    expect(requests).toEqual([]);
  }
});

it('stops at a missing, invalid or mismatching pointer and never reads a path outside catalog/v1', async () => {
  const none = mockRepository({ latestStatus: 404 });
  expect(await readRepository('https://catalog.example/', none.transport, reviewer)).toEqual({ status: 'rejected', code: 'repository_latest_unavailable' });
  expect(none.requests).toHaveLength(1);
  for (const latest of [
    '{', JSON.stringify({ schemaVersion: 2 }),
    JSON.stringify({ schemaVersion: 1, bundleId: 'b-0000000000000000', sha256: 'a'.repeat(64), bytes: 10, bundlePath: '../../etc/passwd' }),
    JSON.stringify({ schemaVersion: 1, bundleId: 'b-0000000000000000', sha256: 'a'.repeat(64), bytes: BUNDLE_BYTES_LIMIT + 1, bundlePath: 'catalog/v1/b-0000000000000000/bundle.json' }),
    JSON.stringify({ schemaVersion: 1, bundleId: 'b-0000000000000000', sha256: 'zz', bytes: 10, bundlePath: 'catalog/v1/b-0000000000000000/bundle.json' }),
  ]) {
    const m = mockRepository({ latest });
    expect(await readRepository('https://catalog.example/', m.transport, reviewer), latest).toEqual({ status: 'rejected', code: 'repository_latest_invalid' });
    expect(m.requests).toHaveLength(1);
  }
  const swapped = mockRepository({ latest: POINTER('b-0000000000000000', 10) });
  expect(await readRepository('https://catalog.example/', swapped.transport, reviewer)).toEqual({ status: 'rejected', code: 'repository_pointer_mismatch' });
  const missing = mockRepository({ bundleStatus: 500 });
  expect(await readRepository('https://catalog.example/', missing.transport, reviewer)).toEqual({ status: 'rejected', code: 'repository_bundle_unavailable' });
});

it('a transport failure (timeout, size, redirect) is reported, not thrown', async () => {
  const read = await readRepository('https://catalog.example/', async () => { throw new Error('timeout'); }, reviewer);
  expect(read).toEqual({ status: 'unavailable', error: 'timeout' });
});

// ---- the app has no crawling code and draws no images ----------------------

it('the app source holds no crawling code, no site names, and no image handling for items', () => {
  const src = join(__dirname, '..', '..', 'src');
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
  const files = walk(src).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('contracts/generated'));
  const offenders = (pattern: RegExp) => files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => relative(src, f));
  expect(offenders(/ohou\.se|29cm\.co\.kr|ikea\.com/i)).toEqual([]);
  expect(offenders(/DOMParser|robots\.txt|puppeteer|cheerio|jsdom|scrap(?:e|er|ing)\b|crawl(?:er|ing)?\s*\(/i)).toEqual([]);
  const catalog = files.filter((f) => f.includes(join('features', 'catalog'))).map((f) => readFileSync(f, 'utf8')).join('\n');
  expect(catalog).not.toMatch(/<img\b|new Image\(|\.src\s*=|srcset|background-image|createImageBitmap|\.(?:jpe?g|png|webp|gif|avif)\b/i);
  const shape = readFileSync(join(src, 'features/catalog/ItemShapeView.tsx'), 'utf8');
  expect(shape).not.toMatch(/<image\b|<img\b|href=/);
});
