import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  return result.stdout;
}
const native = run('cargo', ['run', '-p', 'zari-core', '--locked', '--example', 'fixture_runner', '--', 'fixtures/bootstrap'], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 });
const results = JSON.parse(native);
assert.ok(Array.isArray(results) && results.length > 0, 'Native fixture runner must produce nonempty JSON array.');
const dir = join(root, 'test-results/parity');
mkdirSync(dir, { recursive: true });
const nativePath = join(dir, 'native-results.json');
writeFileSync(nativePath, `${JSON.stringify(results, null, 2)}\n`);
run(npm, ['run', 'test:build']);
run(npx, ['playwright', 'test', '--project=chromium', '--grep', '@parity'], {
  env: { ...process.env, ZARI_NATIVE_RESULTS: nativePath },
});
console.log(`Native and actual browser Worker/WASM comparison completed for ${results.length} shared fixtures.`);
