import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}\n${result.stderr ?? ''}`);
  return result.stdout?.trim();
}
if (!existsSync(new URL('../Cargo.lock', import.meta.url))) {
  throw new Error('Cargo.lock is required. Resolve and review Rust dependencies before the locked build.');
}
const lock = readFileSync(new URL('../Cargo.lock', import.meta.url), 'utf8');
const versions = [...lock.matchAll(/\[\[package\]\]\s+name = "wasm-bindgen"\s+version = "([^"]+)"/g)].map((match) => match[1]);
if (versions.length !== 1) throw new Error('Expected exactly one locked wasm-bindgen crate version.');
const actualCli = run('wasm-bindgen', ['--version'], true);
if (actualCli !== `wasm-bindgen ${versions[0]}`) {
  throw new Error(`wasm-bindgen CLI must exactly match locked crate ${versions[0]}; received ${actualCli}. Install cargo install wasm-bindgen-cli --version ${versions[0]} --locked`);
}
run('cargo', ['build', '-p', 'zari-wasm', '--locked', '--target', 'wasm32-unknown-unknown', '--release']);
const targetDir = process.env.CARGO_TARGET_DIR || 'target';
run('wasm-bindgen', [
  '--target',
  'web',
  '--out-dir',
  'crates/wasm/pkg',
  '--out-name',
  'zari_wasm',
  `${targetDir}/wasm32-unknown-unknown/release/zari_wasm.wasm`,
]);
console.log(`Built actual Rust WASM with ${actualCli}.`);
