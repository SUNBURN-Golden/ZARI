// Aggregate measured browser evidence, never manufacture screenshots or metrics.
import { readFile, readdir, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = '/workspace/shots/zari-easy';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(dir, { recursive: true });
const filenames = (await readdir(dir)).sort();
const measurements = [];
for (const file of filenames.filter((name) => /^metrics-\d+-(light|dark)\.json$/.test(name))) {
  measurements.push(JSON.parse(await readFile(`${dir}/${file}`, 'utf8')));
}
if (measurements.length !== 4) throw new Error('Four viewport/theme measurement files required');
const screenshots = [];
for (const file of filenames.filter((name) => name.endsWith('.png'))) {
  screenshots.push({ file, sha256: sha(await readFile(`${dir}/${file}`)) });
}
if (screenshots.length !== 32) throw new Error('Eight screens × four viewport/theme combinations required');
const sources = [];
for (const file of ['apps/web/src/app/App.tsx', 'apps/web/src/features/easy/EasyMode.tsx', 'apps/web/src/features/easy/easy.css', 'apps/web/src/features/easy/state.ts', 'apps/web/src/styles/tokens.css', 'apps/web/src/worker/easyWorker.ts', 'crates/core/src/easy_fit.rs', 'crates/wasm/src/lib.rs', 'apps/web/tests/browser/easy-mode.spec.ts']) {
  sources.push({ file, sha256: sha(await readFile(file)) });
}
const output = { capturedAt: new Date().toISOString(), status: 'draft', browser: 'Chromium', scope: 'Rendered automated checks; no user visual approval or screen reader certification.', sources, screenshots, measurements };
await writeFile(`${dir}/metrics.json`, `${JSON.stringify(output, null, 2)}\n`);
await copyFile('design/EASY_COPY_CANDIDATES.md', `${dir}/copy-candidates.md`);
await mkdir('docs/evidence/easy-mode', { recursive: true });
await copyFile(`${dir}/metrics.json`, 'docs/evidence/easy-mode/metrics.json');
console.log(`Recorded ${screenshots.length} screenshots and ${measurements.reduce((n, m) => n + m.records.length, 0)} measured screens.`);
