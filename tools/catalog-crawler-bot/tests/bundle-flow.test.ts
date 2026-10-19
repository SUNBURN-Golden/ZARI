import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultContext, runCli } from '../cli.ts';
import type { CliContext } from '../cli.ts';
import { buildBundle, reviewBundle } from '../rust.ts';
import { loadStore } from '../state.ts';
import { handleJob } from '../../catalog-extension/lib/runner.js';
import { extractProducts } from '../../catalog-extension/lib/extract.js';
import { FIXTURES, snapshotFromHtml } from '../../catalog-extension/tests/html-snapshot.mjs';
import { IKEA_LISTING, T0, fakeClock, fixture, ikeaPages, tempPaths } from './helpers.ts';
import type { SignedRequest } from '../publish-r2.ts';

vi.setConfig({ testTimeout: 180000 });

const GOLDEN = join(FIXTURES, 'golden');
const CREATED_AT = '2026-10-15T01:00:00Z';
const PRODUCT_FIXTURES: [string, string][] = [
  ['ohou/product.html', 'https://ohou.se/productions/1001/selling'],
  ['ohou/product-options.html', 'https://ohou.se/productions/1003/selling'],
  ['29cm/product.html', 'https://www.29cm.co.kr/products/3001'],
  ['29cm/product-unlabeled.html', 'https://www.29cm.co.kr/products/3002'],
  ['29cm/product-nounit-round.html', 'https://www.29cm.co.kr/products/3005'],
  ['ikea/product.html', 'https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/'],
  ['ikea/product-inner-outer.html', 'https://www.ikea.com/kr/ko/p/samla-box-12345678/'],
  ['ikea/product-inner-only.html', 'https://www.ikea.com/kr/ko/p/variera-box-23456789/'],
];

function collection() {
  const items = PRODUCT_FIXTURES.flatMap(([file, url]) =>
    extractProducts(snapshotFromHtml(fixture(...file.split('/')), url), url, Date.parse('2026-10-15T00:00:00Z')).items);
  return { format: 'zari-collection/1', createdAt: '2026-10-15T00:00:00Z', items };
}

describe('golden fixtures', () => {
  const build = () => buildBundle(collection().items, CREATED_AT);

  it('regenerate with UPDATE_GOLDEN=1', () => {
    if (process.env.UPDATE_GOLDEN !== '1') return;
    mkdirSync(GOLDEN, { recursive: true });
    const result = build();
    writeFileSync(join(GOLDEN, 'collection.json'), `${JSON.stringify(collection(), null, 2)}\n`);
    writeFileSync(join(GOLDEN, 'bundle.json'), result.bundleText!);
    writeFileSync(join(GOLDEN, 'manifest.json'), result.manifestText!);
  });

  it('the parsers still produce the golden collection file', () => {
    expect(JSON.parse(readFileSync(join(GOLDEN, 'collection.json'), 'utf8'))).toEqual(collection());
  });

  it('Rust builds the golden bundle byte for byte, twice', () => {
    const first = build();
    expect(first.codes).toEqual([]);
    expect(first.rejected).toEqual([]);
    expect(first.accepted).toBe(9);
    expect(first.bundleText).toBe(readFileSync(join(GOLDEN, 'bundle.json'), 'utf8'));
    expect(first.manifestText).toBe(readFileSync(join(GOLDEN, 'manifest.json'), 'utf8'));
    expect(build().bundleText).toBe(first.bundleText);
  });

  it('the golden bundle is accepted by the review the app runs, and nothing is confirmed', () => {
    const review = reviewBundle(readFileSync(join(GOLDEN, 'bundle.json'), 'utf8'));
    expect(review.quarantined).toBe(false);
    expect(JSON.stringify(review.snapshot)).not.toContain('"verification":"confirmed"');
    expect(readFileSync(join(GOLDEN, 'bundle.json'), 'utf8').replace('"noImages"', '')).not.toMatch(/image|thumbnail|\.jpg|\.png/i);
  });
});

function ctxFor(paths = tempPaths(), extra: Partial<CliContext> = {}) {
  const out: string[] = [];
  const ctx: CliContext = { ...defaultContext(), paths, env: {}, clock: fakeClock(T0), out: (line) => out.push(line), ...extra };
  return { ctx, out, paths };
}

describe('commands', () => {
  it('seed add accepts allowlisted pages only', async () => {
    const { ctx, out, paths } = ctxFor();
    expect(await runCli(['seed', 'add', IKEA_LISTING, 'https://ohou.se/store/category?utm_source=x'], ctx)).toBe(0);
    expect(await runCli(['seed', 'add', 'https://evil.example/x'], ctx)).toBe(2);
    expect(await runCli(['seed', 'add', 'https://www.29cm.co.kr/my-page/orders'], ctx)).toBe(2);
    expect(await runCli(['seed', 'add', 'https://www.ikea.com/kr/ko/search/?q=a'], ctx)).toBe(2);
    expect(loadStore(paths).seeds).toEqual([IKEA_LISTING, 'https://ohou.se/store/category']);
    expect(await runCli(['seed', 'remove', IKEA_LISTING], ctx)).toBe(0);
    expect(loadStore(paths).seeds).toEqual(['https://ohou.se/store/category']);
    expect(out.join('\n')).toContain('허용된 사이트');
  });

  it('ingest → build → status → remove-source', async () => {
    const { ctx, out, paths } = ctxFor();
    expect(await runCli(['ingest', join(GOLDEN, 'collection.json')], ctx)).toBe(0);
    expect(out.join('\n')).toContain('가져옴 9건 · 거부 0건');
    expect(await runCli(['build'], ctx)).toBe(0);
    const latest = JSON.parse(readFileSync(join(paths.out, 'catalog/v1/latest.json'), 'utf8'));
    expect(latest).toMatchObject({ schemaVersion: 1, itemCount: 9 });
    expect(existsSync(join(paths.out, latest.bundlePath))).toBe(true);
    expect(reviewBundle(readFileSync(join(paths.out, latest.bundlePath), 'utf8')).quarantined).toBe(false);
    // Same items → same bundle id → nothing new to publish.
    expect(await runCli(['build'], ctx)).toBe(0);
    expect(out.at(-1)).toContain('변경 없음');
    expect(readdirSync(join(paths.out, 'catalog/v1')).filter((n) => n.startsWith('b-'))).toHaveLength(1);
    await runCli(['status'], ctx);
    expect(out.join('\n')).toContain('수집 항목 9');
    expect(out.join('\n')).toContain('R2: 꺼짐');
    expect(await runCli(['remove-source', 'ikea'], ctx)).toBe(0);
    expect(Object.keys(loadStore(paths).items).some((id) => id.startsWith('crawl:ikea'))).toBe(false);
    expect(Object.keys(loadStore(paths).items)).toHaveLength(6);
    const after = JSON.parse(readFileSync(join(paths.out, 'catalog/v1/latest.json'), 'utf8'));
    expect(after.bundleId).not.toBe(latest.bundleId);
    expect(after.itemCount).toBe(6);
  });

  it('ingest rejects images, unknown fields, bad hosts, oversize and foreign files — item by item', async () => {
    const { ctx, out, paths } = ctxFor();
    const good = collection().items[0]!;
    const dir = join(paths.dir, 'inbox');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({
      format: 'zari-collection/1',
      items: [
        good,
        { ...good, id: 'crawl:ohou:2', image: 'https://cdn.example/a.jpg' },
        { ...good, id: 'crawl:ohou:3', extra: true },
        { ...good, id: 'crawl:ohou:4', productUrl: 'https://evil.example/productions/4/selling' },
      ],
    }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ format: 'zari-collection/1', items: Array.from({ length: 51 }, () => good) }));
    writeFileSync(join(dir, 'c.json'), JSON.stringify({ hello: 1 }));
    writeFileSync(join(dir, 'd.json'), '{');
    expect(await runCli(['ingest', dir], ctx)).toBe(0);
    expect(Object.keys(loadStore(paths).items)).toEqual([good.id]);
    const text = out.join('\n');
    expect(text).toContain('image_refused');
    expect(text).toContain('item_schema_invalid');
    expect(text).toContain('product_url_not_allowed');
    expect(text).toContain('too_many_items');
    expect(text).toContain('not_a_collection_file');
    expect(text).toContain('invalid_json');
  });

  it('stop creates the kill switch, run refuses while it exists, --clear removes it', async () => {
    const { ctx, paths } = ctxFor();
    await runCli(['seed', 'add', IKEA_LISTING], ctx);
    expect(await runCli(['stop'], ctx)).toBe(0);
    expect(existsSync(paths.stop)).toBe(true);
    expect(await runCli(['run', '--attach'], ctx)).toBe(2);
    await runCli(['stop', '--clear'], ctx);
    expect(existsSync(paths.stop)).toBe(false);
  });

  it('resume-host clears a disabled host and its cooldown', async () => {
    const { ctx, paths } = ctxFor();
    const { saveStore, emptyHost } = await import('../state.ts');
    const store = loadStore(paths);
    store.hosts['www.29cm.co.kr'] = { ...emptyHost(), consecutiveBlocks: 2, cooldownUntil: '2099-01-01T00:00:00.000Z', disabled: { reason: 'repeated_block:http_429', at: 'x' } };
    saveStore(paths, store);
    expect(await runCli(['resume-host', '29cm'], ctx)).toBe(0);
    expect(loadStore(paths).hosts['www.29cm.co.kr']).toMatchObject({ consecutiveBlocks: 0, cooldownUntil: null, disabled: null });
  });
});

describe('run, end to end without Chrome (attach mode, fake extension over the real socket)', () => {
  function attachExtension(paths: ReturnType<typeof tempPaths>, pages = ikeaPages()) {
    const seen: string[] = [];
    let client: Socket | null = null;
    const timer = setInterval(() => {
      if (client || !existsSync(paths.socket) || !existsSync(paths.token)) return;
      const socket = connect(paths.socket);
      client = socket;
      socket.on('error', () => {});
      socket.setEncoding('utf8');
      let buffer = '';
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let at: number;
        while ((at = buffer.indexOf('\n')) >= 0) {
          const job = JSON.parse(buffer.slice(0, at));
          buffer = buffer.slice(at + 1);
          seen.push(job.url);
          void handleJob(job, {
            now: () => T0,
            collect: async (url: string, kind: string) => kind === 'robots'
              ? { url, status: 200, contentType: 'text/plain', text: pages[url]!.text }
              : snapshotFromHtml(pages[url]!.html!, url),
          }).then((reply) => socket.write(`${JSON.stringify(reply)}\n`));
        }
      });
      socket.on('connect', () => {
        socket.write(`${JSON.stringify({ type: 'auth', token: readFileSync(paths.token, 'utf8') })}\n${JSON.stringify({ type: 'hello', protocol: 1 })}\n`);
      });
    }, 20);
    return { seen, stop: () => { clearInterval(timer); client?.destroy(); } };
  }

  it('collects, builds, and does not publish when R2 is not configured', async () => {
    const { ctx, out, paths } = ctxFor(tempPaths(), { extensionWaitMs: 5000 });
    await runCli(['seed', 'add', IKEA_LISTING], ctx);
    const calls: SignedRequest[] = [];
    const extension = attachExtension(paths);
    try {
      const code = await runCli(['run', '--attach'], { ...ctx, send: async (r) => (calls.push(r), { status: 200 }) });
      expect(code).toBe(0);
    } finally {
      extension.stop();
    }
    const text = out.join('\n');
    expect(text).toContain('종료: queue_empty');
    expect(text).toContain('R2 게시는 꺼져 있습니다');
    expect(calls).toEqual([]);
    expect(existsSync(paths.socket)).toBe(false); // the channel is torn down
    expect(existsSync(paths.lock)).toBe(false);
    expect(readFileSync(paths.log, 'utf8')).not.toMatch(/cookie|token|secret/i);
    const latest = JSON.parse(readFileSync(join(paths.out, 'catalog/v1/latest.json'), 'utf8'));
    expect(latest.itemCount).toBe(2);
  });

  it('auto-publishes the finished bundle when R2 is configured (mock sender)', async () => {
    const { ctx, out, paths } = ctxFor(tempPaths(), { extensionWaitMs: 5000 });
    await runCli(['seed', 'add', IKEA_LISTING], ctx);
    const keys: string[] = [];
    const env = {
      ZARI_R2_ENABLED: '1', ZARI_R2_ENDPOINT: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`, ZARI_R2_BUCKET: 'zari-test',
      ZARI_R2_ACCESS_KEY_ID: 'K', ZARI_R2_SECRET_ACCESS_KEY: 'S3CR3T-VALUE',
    };
    const extension = attachExtension(paths);
    try {
      await runCli(['run', '--attach'], { ...ctx, env, send: async (r) => (keys.push(`${r.method} ${new URL(r.url).pathname}`), { status: 200 }) });
    } finally {
      extension.stop();
    }
    expect(keys.map((k) => k.split(' ')[0])).toEqual(['PUT', 'PUT', 'PUT']);
    expect(keys.at(-1)).toBe('PUT /zari-test/catalog/v1/latest.json');
    expect(out.join('\n')).not.toContain('S3CR3T-VALUE');
  });

  it('exits cleanly when no extension connects', async () => {
    const { ctx, out } = ctxFor(tempPaths(), { extensionWaitMs: 50 });
    await runCli(['seed', 'add', IKEA_LISTING], ctx);
    expect(await runCli(['run', '--attach'], ctx)).toBe(1);
    expect(out.join('\n')).toContain('확장이 연결되지 않았습니다');
  });

  it('a second run while one holds the lock is refused', async () => {
    const { ctx, paths } = ctxFor();
    await runCli(['seed', 'add', IKEA_LISTING], ctx);
    const { acquireLock } = await import('../state.ts');
    const release = acquireLock(paths);
    try {
      expect(await runCli(['run', '--attach'], ctx)).toBe(2);
    } finally {
      release();
    }
    expect(statSync(paths.dir).isDirectory()).toBe(true);
  });
});
