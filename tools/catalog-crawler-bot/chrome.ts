// Launching the user's own Chrome as a visible window with a dedicated,
// logged-out profile. Never headless, never a debugging port, never a proxy or
// a spoofed user agent.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureDir } from './fsx.ts';

export const EXTENSION_DIR = resolve(import.meta.dirname, '..', 'catalog-extension');

const CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findChrome(configured: string | null, env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.ZARI_CHROME_PATH ?? configured;
  if (explicit) return existsSync(explicit) ? explicit : null;
  return CANDIDATES.find((path) => existsSync(path)) ?? null;
}

export function buildChromeArgs(profileDir: string, extensionDir: string = EXTENSION_DIR, loadExtension = true): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(loadExtension ? [`--load-extension=${extensionDir}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'] : []),
    'about:blank',
  ];
}

export function refuseInCi(env: Record<string, string | undefined> = process.env): void {
  if (env.CI !== undefined && env.CI !== '' && env.CI !== 'false' && env.CI !== '0') {
    throw new Error('ci_refuses_chrome_launch');
  }
}

export function launchChrome(chromePath: string, profileDir: string, loadExtension = true, env: Record<string, string | undefined> = process.env): ChildProcess {
  refuseInCi(env);
  ensureDir(profileDir);
  return spawn(chromePath, buildChromeArgs(profileDir, EXTENSION_DIR, loadExtension), { stdio: 'ignore' });
}
