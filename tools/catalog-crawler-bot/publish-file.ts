// Publish an already-built bundle file (e.g. a sample fixture) to R2.
// Keys come from env ZARI_R2_ACCESS_KEY_ID / ZARI_R2_SECRET_ACCESS_KEY, or from
// the file named by ZARI_R2_KEYS_FILE (default /home/box/.secrets/zari_r2_catalog,
// lines ACCESS_KEY_ID=... / SECRET_ACCESS_KEY=...). Values are never printed.
// Usage: node publish-file.ts <bundle.json>
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LATEST_REL } from './bundle.ts';
import { publishBundle, r2Setup } from './publish-r2.ts';

const env: Record<string, string | undefined> = { ...process.env };
const keysFile = env.ZARI_R2_KEYS_FILE ?? '/home/box/.secrets/zari_r2_catalog';
if ((!env.ZARI_R2_ACCESS_KEY_ID || !env.ZARI_R2_SECRET_ACCESS_KEY) && existsSync(keysFile)) {
  for (const line of readFileSync(keysFile, 'utf8').split('\n')) {
    const m = /^(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=(.+)$/.exec(line.trim());
    if (m) env[`ZARI_R2_${m[1]}`] = m[2];
  }
}
env.ZARI_R2_ENABLED ??= '1';
env.ZARI_R2_ENDPOINT ??= 'https://aa6bf084982ee841c3ea39b45895a15e.r2.cloudflarestorage.com';
env.ZARI_R2_BUCKET ??= 'zari-catalog';

const file = process.argv[2];
if (!file) { console.error('usage: node publish-file.ts <bundle.json>'); process.exit(2); }
const text = readFileSync(file, 'utf8');
const manifest = JSON.parse(text).manifest as { bundleId: string; sha256: string; itemCount: number; createdAt: string };
const out = mkdtempSync(join(tmpdir(), 'zari-pub-'));
const dir = `catalog/v1/${manifest.bundleId}`;
mkdirSync(join(out, dir), { recursive: true });
writeFileSync(join(out, dir, 'bundle.json'), text);
writeFileSync(join(out, dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
mkdirSync(join(out, 'catalog/v1'), { recursive: true });
writeFileSync(join(out, LATEST_REL), `${JSON.stringify({
  schemaVersion: 1, bundleId: manifest.bundleId, createdAt: manifest.createdAt, itemCount: manifest.itemCount,
  sha256: manifest.sha256, bytes: Buffer.byteLength(text), bundlePath: `${dir}/bundle.json`, manifestPath: `${dir}/manifest.json`,
})}\n`);
const setup = r2Setup(env);
if (!setup.enabled) { console.error(setup.message); process.exit(1); }
const result = await publishBundle(setup.config, [
  { rel: `${dir}/bundle.json`, contentType: 'application/json' },
  { rel: `${dir}/manifest.json`, contentType: 'application/json' },
  { rel: LATEST_REL, contentType: 'application/json' },
], (rel) => readFileSync(join(out, rel)));
console.log(result.message);
process.exit(result.ok ? 0 : 1);
