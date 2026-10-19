import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

function sources(dir = ROOT) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'tests') return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(js|html|json)$/.test(name) ? [full] : [];
  });
}

describe('manifest', () => {
  it('declares exactly the allowed permissions and hosts', () => {
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'nativeMessaging', 'scripting']);
    expect([...manifest.host_permissions].sort()).toEqual([
      'https://ohou.se/*', 'https://store.ohou.se/*', 'https://www.29cm.co.kr/*', 'https://www.ikea.com/kr/*',
    ]);
    expect(manifest.manifest_version).toBe(3);
  });
  it('has no forbidden permission, wildcard host, remote code or relaxed CSP', () => {
    const all = JSON.stringify(manifest);
    for (const banned of ['cookies', 'history', 'webRequest', 'storage', 'downloads', '<all_urls>', '"tabs"', 'declarativeNetRequest', 'debugger', 'proxy', 'content_scripts', 'externally_connectable', 'web_accessible_resources', 'optional_permissions', 'optional_host_permissions']) {
      expect(all, banned).not.toContain(banned);
    }
    expect(manifest).not.toHaveProperty('content_security_policy');
    expect(manifest.host_permissions.every((h) => h.startsWith('https://') && !h.startsWith('https://*'))).toBe(true);
  });
  it('every host permission is justified by a site in the allowlist', async () => {
    const { SITES } = await import('../lib/sites.js');
    const hosts = Object.values(SITES).flatMap((site) => site.hosts);
    for (const pattern of manifest.host_permissions) expect(hosts).toContain(new URL(pattern.replace('/*', '/')).hostname);
  });
});

describe('source scan', () => {
  const files = sources();
  const text = files.map((f) => [f, readFileSync(f, 'utf8')]);
  const forbidden = [
    ['network API', /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts/],
    ['eval / dynamic code', /\beval\s*\(|new\s+Function|setTimeout\s*\(\s*['"`]|\.innerHTML\s*=|document\.write/],
    ['remote script or url', /<script[^>]+src=["']https?:|import\s*\(\s*['"`]https?:|from\s+['"]https?:/],
    ['cookies / storage', /document\.cookie|localStorage|sessionStorage|indexedDB|chrome\.cookies|chrome\.storage/],
    ['image reading', /querySelector(?:All)?\(\s*['"`][^'"`]*\b(?:img|picture|source|video|canvas)\b|getElementsByTagName\(\s*['"`](?:img|picture)|\.src\b|\.srcset|currentSrc|new\s+Image\b|HTMLImageElement|og:image|background-image|getComputedStyle|createImageBitmap|\.naturalWidth/],
    ['broad tab/history access', /chrome\.(?:history|downloads|webRequest|debugger|proxy|bookmarks|management|cookies)/],
  ];
  it.each(forbidden)('has no %s', (_name, pattern) => {
    const hits = text.filter(([, body]) => pattern.test(body)).map(([f]) => f.replace(ROOT, ''));
    expect(hits).toEqual([]);
  });
  it('reaches the bot only through the native messaging port', () => {
    const uses = text.filter(([, body]) => /connectNative/.test(body)).map(([f]) => f.replace(ROOT, ''));
    expect(uses).toEqual(['/background.js']);
  });
});
