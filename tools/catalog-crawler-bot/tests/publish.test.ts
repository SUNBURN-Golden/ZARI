import { createHash, createHmac } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli, defaultContext } from '../cli.ts';
import { publishBundle, r2Setup, signPut } from '../publish-r2.ts';
import type { R2Config, Send, SignedRequest } from '../publish-r2.ts';
import { T0, fakeClock, tempPaths } from './helpers.ts';

const ACCOUNT = 'a'.repeat(32);
const SECRET = 'TEST-SECRET-KEY-do-not-print-0123456789';
const ENV = {
  ZARI_R2_ENABLED: '1',
  ZARI_R2_ENDPOINT: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
  ZARI_R2_BUCKET: 'zari-test',
  ZARI_R2_ACCESS_KEY_ID: 'TESTKEYID123',
  ZARI_R2_SECRET_ACCESS_KEY: SECRET,
  ZARI_R2_PREFIX: 'cat',
};

interface Seen { method: string; path: string; headers: IncomingMessage['headers']; body: Buffer; signatureOk: boolean }

/** A local stand-in for S3: verifies the SigV4 signature it receives. */
async function mockS3(secret: string, status = 200) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const auth = String(req.headers.authorization ?? '');
      const m = /Credential=([^/]+)\/(\d{8})\/auto\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})/.exec(auth);
      let ok = false;
      if (m) {
        const names = m[3]!.split(';');
        const canonicalHeaders = names.map((n) => `${n}:${String(req.headers[n])}\n`).join('');
        const payload = createHash('sha256').update(body).digest('hex');
        const canonical = [req.method, req.url, '', canonicalHeaders, m[3], payload].join('\n');
        const amzDate = String(req.headers['x-amz-date']);
        const scope = `${m[2]}/auto/s3/aws4_request`;
        const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
        const h = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
        const key = h(h(h(h(`AWS4${secret}`, m[2]!), 'auto'), 's3'), 'aws4_request');
        ok = createHmac('sha256', key).update(toSign).digest('hex') === m[4] && payload === req.headers['x-amz-content-sha256'];
      }
      seen.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body, signatureOk: ok });
      res.statusCode = status;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const send: Send = (request: SignedRequest) => new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const req = httpRequest({ host: '127.0.0.1', port, method: request.method, path: url.pathname, headers: request.headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on('error', reject);
    req.end(Buffer.from(request.body));
  });
  return { seen, send, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

function config(): R2Config {
  const setup = r2Setup(ENV);
  if (!setup.enabled) throw new Error(setup.message);
  return setup.config;
}

describe('disabled by default', () => {
  it.each([
    ['nothing set', {}],
    ['enabled flag is not exactly "1"', { ...ENV, ZARI_R2_ENABLED: 'true' }],
    ['enabled flag missing', { ...ENV, ZARI_R2_ENABLED: undefined }],
    ['a variable is missing', { ...ENV, ZARI_R2_BUCKET: undefined }],
    ['endpoint is not an R2 account host', { ...ENV, ZARI_R2_ENDPOINT: 'https://example.com' }],
    ['endpoint is http', { ...ENV, ZARI_R2_ENDPOINT: `http://${ACCOUNT}.r2.cloudflarestorage.com` }],
    ['endpoint has a path', { ...ENV, ZARI_R2_ENDPOINT: `https://${ACCOUNT}.r2.cloudflarestorage.com/x` }],
    ['bucket is malformed', { ...ENV, ZARI_R2_BUCKET: '../x' }],
    ['prefix escapes', { ...ENV, ZARI_R2_PREFIX: 'a/../b' }],
  ])('%s → no request', (_label, env) => {
    const setup = r2Setup(env);
    expect(setup.enabled).toBe(false);
    if (!setup.enabled) expect(setup.message).not.toContain(SECRET);
  });

  it('names the missing variables but never prints values', () => {
    const setup = r2Setup({ ...ENV, ZARI_R2_BUCKET: undefined, ZARI_R2_SECRET_ACCESS_KEY: undefined });
    expect(setup).toMatchObject({ enabled: false });
    if (!setup.enabled) expect(setup.message).toContain('ZARI_R2_BUCKET, ZARI_R2_SECRET_ACCESS_KEY');
  });

  it('the CLI sends nothing without --yes or without the env, in both manual and run paths', async () => {
    const paths = tempPaths();
    mkdirSync(join(paths.out, 'catalog', 'v1', 'b-1'), { recursive: true });
    const calls: SignedRequest[] = [];
    const out: string[] = [];
    const ctx = { ...defaultContext(), paths, clock: fakeClock(T0), out: (l: string) => out.push(l), send: async (r: SignedRequest) => (calls.push(r), { status: 200 }) };
    expect(await runCli(['publish'], { ...ctx, env: ENV })).toBe(2);
    expect(await runCli(['publish', '--yes'], { ...ctx, env: {} })).toBe(0);
    expect(out.join('\n')).toContain('꺼져 있습니다');
    expect(calls).toEqual([]);
  });
});

describe('PutObject to a mock S3', () => {
  it('uploads bundle, manifest, then latest.json — PUT only, valid SigV4, prefix applied', async () => {
    const s3 = await mockS3(SECRET);
    closers.push(s3.close);
    const files = new Map([['catalog/v1/b-1/bundle.json', '{"a":1}'], ['catalog/v1/b-1/manifest.json', '{"m":1}'], ['catalog/v1/latest.json', '{"l":1}']]);
    const result = await publishBundle(
      config(),
      [...files.keys()].map((rel) => ({ rel, contentType: 'application/json' })),
      (rel) => Buffer.from(files.get(rel)!),
      s3.send,
      () => new Date(Date.UTC(2026, 9, 16, 1, 2, 3)),
    );
    expect(result).toMatchObject({ ok: true });
    expect(s3.seen.map((s) => s.method)).toEqual(['PUT', 'PUT', 'PUT']);
    expect(s3.seen.map((s) => s.path)).toEqual([
      '/zari-test/cat/catalog/v1/b-1/bundle.json', '/zari-test/cat/catalog/v1/b-1/manifest.json', '/zari-test/cat/catalog/v1/latest.json',
    ]);
    expect(s3.seen.every((s) => s.signatureOk)).toBe(true);
    expect(s3.seen.every((s) => s.headers.host === `${ACCOUNT}.r2.cloudflarestorage.com`)).toBe(true);
    expect(s3.seen[2]!.body.toString()).toBe('{"l":1}');
    expect(JSON.stringify(s3.seen.map((s) => s.headers))).not.toContain(SECRET);
  });

  it('the signature changes with the body (not a constant)', () => {
    const c = config();
    const a = signPut(c, 'k', Buffer.from('a'), 'application/json', new Date(T0));
    const b = signPut(c, 'k', Buffer.from('b'), 'application/json', new Date(T0));
    expect(a.headers.authorization).not.toBe(b.headers.authorization);
  });

  it('never prints the secret: server error, thrown error, and setup messages are masked', async () => {
    const denied = await mockS3(SECRET, 403);
    closers.push(denied.close);
    const rejected = await publishBundle(config(), [{ rel: 'x', contentType: 'text/plain' }], () => Buffer.from('x'), denied.send);
    expect(rejected).toMatchObject({ ok: false });
    expect(JSON.stringify(rejected)).not.toContain(SECRET);
    const thrown = await publishBundle(config(), [{ rel: 'x', contentType: 'text/plain' }], () => Buffer.from('x'), async () => {
      throw new Error(`socket failure while using ${SECRET} and TESTKEYID123`);
    });
    expect(thrown.ok).toBe(false);
    expect(thrown.message).not.toContain(SECRET);
    expect(thrown.message).not.toContain('TESTKEYID123');
    expect(thrown.message).toContain('***');
  });

  it('a failed upload stops before latest.json so readers never see a dangling pointer', async () => {
    const calls: string[] = [];
    const result = await publishBundle(
      config(),
      [{ rel: 'a', contentType: 'x' }, { rel: 'latest', contentType: 'x' }],
      () => Buffer.from('x'),
      async (r) => (calls.push(r.url), { status: 500 }),
    );
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

