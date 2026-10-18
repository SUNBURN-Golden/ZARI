// The bot never re-implements bundle validation: it pipes JSON through the
// Rust `catalog_bundle_tool` example (the same code the app runs as WASM).
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

export interface ToolRun {
  code: number;
  stdout: string;
  stderr: string;
}

export function runBundleTool(args: string[], input: string): ToolRun {
  const binary = process.env.ZARI_BUNDLE_TOOL;
  const command = binary ?? 'cargo';
  const full = binary ? args : ['run', '-q', '--locked', '-p', 'zari-core', '--example', 'catalog_bundle_tool', '--', ...args];
  const result = spawnSync(command, full, { cwd: REPO_ROOT, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export interface BuildResult {
  codes: string[];
  accepted: number;
  rejected: { id: string; codes: string[] }[];
  bundleText: string | null;
  manifestText: string | null;
}

export function buildBundle(items: unknown[], createdAt: string, version = '1'): BuildResult {
  const run = runBundleTool(['build', createdAt, version], JSON.stringify(items));
  if (run.code !== 0) throw new Error(`bundle_tool_failed:${run.code}`);
  return JSON.parse(run.stdout) as BuildResult;
}

export interface ReviewResult {
  quarantined: boolean;
  codes: string[];
  items: { index: number; id: string; codes: string[] }[];
  snapshot: unknown;
}

export function reviewBundle(text: string): ReviewResult {
  const run = runBundleTool(['review'], text);
  if (run.code !== 0) throw new Error(`bundle_tool_failed:${run.code}`);
  return JSON.parse(run.stdout) as ReviewResult;
}
