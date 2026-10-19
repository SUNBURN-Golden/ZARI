import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, readJson, writeJsonAtomic } from './fsx.ts';
import { writeFileSync } from 'node:fs';
import { buildBundle } from './rust.ts';
import type { StatePaths } from './paths.ts';
import type { Store } from './state.ts';

export interface BuildSummary {
  bundleId: string | null;
  accepted: number;
  rejected: { id: string; codes: string[] }[];
  codes: string[];
  changed: boolean;
}

export const LATEST_REL = 'catalog/v1/latest.json';
export const bundleRel = (id: string, file: 'bundle.json' | 'manifest.json'): string => `catalog/v1/${id}/${file}`;

const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Rebuild the bundle from every collected item, drop what Rust rejects, write
 * `out/catalog/v1/<id>/{bundle,manifest}.json` and the latest pointer. Nothing
 * is uploaded here.
 */
export function buildLocal(paths: StatePaths, store: Store, nowMs: number): BuildSummary {
  const items = Object.values(store.items).map((record) => record.item);
  const result = buildBundle(items, isoSeconds(nowMs));
  const summary: BuildSummary = { bundleId: null, accepted: result.accepted, rejected: result.rejected, codes: result.codes, changed: false };
  writeJsonAtomic(paths.report, { builtAt: isoSeconds(nowMs), accepted: result.accepted, rejected: result.rejected, codes: result.codes });
  if (!result.bundleText || !result.manifestText) return summary;
  const manifest = JSON.parse(result.manifestText) as { bundleId: string; sha256: string; itemCount: number; createdAt: string };
  summary.bundleId = manifest.bundleId;
  const latestPath = join(paths.out, LATEST_REL);
  const previous = existsSync(latestPath) ? readJson<{ bundleId?: string }>(latestPath, {}) : {};
  if (previous.bundleId === manifest.bundleId) return summary;
  const dir = join(paths.out, 'catalog', 'v1', manifest.bundleId);
  ensureDir(dir);
  writeFileSync(join(dir, 'bundle.json'), result.bundleText, { mode: 0o600 });
  writeFileSync(join(dir, 'manifest.json'), result.manifestText, { mode: 0o600 });
  const latest = {
    schemaVersion: 1,
    bundleId: manifest.bundleId,
    createdAt: manifest.createdAt,
    itemCount: manifest.itemCount,
    sha256: manifest.sha256,
    bytes: Buffer.byteLength(result.bundleText),
    bundlePath: bundleRel(manifest.bundleId, 'bundle.json'),
    manifestPath: bundleRel(manifest.bundleId, 'manifest.json'),
  };
  writeFileSync(latestPath, `${JSON.stringify(latest)}\n`, { mode: 0o600 });
  summary.changed = true;
  return summary;
}

export function latestPointer(paths: StatePaths): { bundleId: string; bundlePath: string; manifestPath: string } | null {
  const path = join(paths.out, LATEST_REL);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { bundleId: string; bundlePath: string; manifestPath: string }) : null;
}
