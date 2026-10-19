import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const BOT = join(import.meta.dirname, '..');
const REPO = join(BOT, '..', '..');

function walk(dir: string, accept: RegExp, skip: (name: string) => boolean = () => false): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (skip(name)) return [];
    return statSync(full).isDirectory() ? walk(full, accept, skip) : accept.test(name) ? [full] : [];
  });
}

const botSources = walk(BOT, /\.ts$/, (name) => name === 'tests').map((file) => [relative(REPO, file), readFileSync(file, 'utf8')] as const);

describe('bot has no listener and no direct site access', () => {
  it('imports only node: builtins and the shared allowlist', () => {
    for (const [file, text] of botSources) {
      for (const match of text.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        const target = match[1]!;
        expect(target.startsWith('node:') || target.startsWith('./') || target === '../catalog-extension/lib/sites.js', `${file}: ${target}`).toBe(true);
      }
    }
  });
  it('has no http/https/tcp/udp/websocket/inspector module', () => {
    const banned = /node:(?:http|https|http2|dgram|tls|dns|inspector|worker_threads|vm)\b|from\s+['"](?:ws|puppeteer|playwright|selenium)/;
    expect(botSources.filter(([, text]) => banned.test(text)).map(([file]) => file)).toEqual([]);
  });
  it('only listens on a Unix socket path', () => {
    const listens = botSources.flatMap(([file, text]) => [...text.matchAll(/\bserver\.listen\(([^)]*)\)/g)].map((m) => `${file}: ${m[1]}`));
    expect(listens).toEqual(['tools/catalog-crawler-bot/channel.ts: paths.socket, (']);
  });
  it('calls fetch only in the R2 publisher, and only against the validated endpoint', () => {
    const files = botSources.filter(([, text]) => /\bfetch\s*\(/.test(text)).map(([file]) => file);
    expect(files).toEqual(['tools/catalog-crawler-bot/publish-r2.ts']);
    const publisher = botSources.find(([file]) => file.endsWith('publish-r2.ts'))![1];
    expect(publisher).toContain("redirect: 'error'");
    expect(publisher).toMatch(/\.r2\.cloudflarestorage\.com/);
    expect(publisher).not.toMatch(/method:\s*['"](?:GET|POST|DELETE|HEAD|PATCH)|ListBuckets|CreateBucket|DeleteObject|ListObjects/);
  });
  it('never mentions evasion or remote-control features outside the guard tests', () => {
    const banned = /--headless|remote-debugging|--proxy-server|--user-agent|puppeteer|stealth|2captcha|anticaptcha|rotat\w*proxy|--disable-blink-features=AutomationControlled/i;
    expect(botSources.filter(([, text]) => banned.test(text)).map(([file]) => file)).toEqual([]);
  });
  it('does not read cookies or credentials', () => {
    expect(botSources.filter(([, text]) => /cookie|document\.cookie|login\(|password/i.test(text)).map(([file]) => file)).toEqual([]);
  });
  it('writes its logs without secrets: the log writer only receives urls, counts and codes', () => {
    const scheduler = botSources.find(([file]) => file.endsWith('scheduler.ts'))![1];
    expect(scheduler).not.toMatch(/process\.env|SECRET|TOKEN/);
  });
});

describe('repository holds no secret, account id or R2 URL', () => {
  const roots = ['tools', 'apps/web/src', 'tests/fixtures/catalog-collection', 'docs/CATALOG_COLLECTION.md', 'docs/adr/SP-z-catalog-crawler.md'];
  const files = roots.flatMap((root) => {
    const full = join(REPO, root);
    try {
      return statSync(full).isDirectory() ? walk(full, /\.(ts|tsx|js|mjs|json|md|html|txt|sh)$/) : [full];
    } catch {
      return [];
    }
  });
  it('has files to scan', () => expect(files.length).toBeGreaterThan(30));
  it.each([
    ['R2 account host', /[a-f0-9]{32}\.r2\.cloudflarestorage\.com/i],
    ['AWS-style access key id', /\bAKIA[0-9A-Z]{16}\b/],
    ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['assigned secret value', /ZARI_R2_(?:SECRET_ACCESS_KEY|ACCESS_KEY_ID)\s*=\s*['"]?[A-Za-z0-9/+=]{16,}/],
    ['bearer token', /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ])('no %s', (_name, pattern) => {
    const hits = files.filter((file) => !file.endsWith('static.test.ts') && pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(REPO, file));
    // Tests build fake hosts from repeated characters, never literal ones.
    expect(hits).toEqual([]);
  });
});

describe('no new dependency', () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const web = JSON.parse(readFileSync(join(REPO, 'apps/web/package.json'), 'utf8'));
  it('the repository root declares no runtime dependency and no new dev dependency', () => {
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      '@axe-core/playwright', '@eslint/js', '@playwright/test', '@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react',
      'ajv', 'esbuild', 'eslint', 'fake-indexeddb', 'json-schema-to-typescript', 'typescript', 'typescript-eslint', 'vite', 'vitest',
    ]);
  });
  it('the web app dependency list is unchanged', () => {
    expect(web.dependencies).toEqual({ dexie: '4.4.6', react: '19.3.0', 'react-aria-components': '1.21.1', 'react-dom': '19.3.0', three: '0.186.1' });
    expect(web.devDependencies).toEqual({ '@types/three': '0.186.0' });
  });
});
