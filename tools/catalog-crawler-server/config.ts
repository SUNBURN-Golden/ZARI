// Pipeline settings: <ZARI_HOME>/pipeline.json (all optional; clamped).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PipelineConfig {
  categories: string[];
  pagesPerRun: number;
  dailyPerHost: number;
  minIntervalMs: number;
  recrawlDays: number;
  listingRefreshHours: number;
  detailPerRun: number;
  deadlineMinutes: number;
  deepseekMaxCalls: number;
  maxDropRatio: number;
  publicBase: string;
  bucket: string;
  skipIds: string[];
}

export const DEFAULTS: PipelineConfig = {
  categories: ['https://www.daisomall.co.kr/ds/exhCtgr/C208/CTGR_00016'],
  pagesPerRun: 60,
  dailyPerHost: 110,
  minIntervalMs: 30000,
  recrawlDays: 14,
  listingRefreshHours: 20,
  detailPerRun: 25,
  deadlineMinutes: 70,
  deepseekMaxCalls: 20,
  maxDropRatio: 0.2,
  publicBase: '',
  bucket: 'zari-catalog',
  skipIds: [],
};

const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function normalize(raw: Record<string, unknown>): PipelineConfig {
  const cats = Array.isArray(raw.categories) ? raw.categories.filter((c): c is string => typeof c === 'string' && c.startsWith('https://www.daisomall.co.kr/ds/')) : DEFAULTS.categories;
  return {
    categories: cats.length ? cats : DEFAULTS.categories,
    pagesPerRun: n(raw.pagesPerRun, DEFAULTS.pagesPerRun, 1, 100),
    dailyPerHost: n(raw.dailyPerHost, DEFAULTS.dailyPerHost, 1, 300),
    // 30 s is the site's Crawl-delay; never lower.
    minIntervalMs: n(raw.minIntervalMs, DEFAULTS.minIntervalMs, 30000, 600000),
    recrawlDays: n(raw.recrawlDays, DEFAULTS.recrawlDays, 7, 365),
    listingRefreshHours: n(raw.listingRefreshHours, DEFAULTS.listingRefreshHours, 6, 24 * 30),
    detailPerRun: n(raw.detailPerRun, DEFAULTS.detailPerRun, 0, 40),
    deadlineMinutes: n(raw.deadlineMinutes, DEFAULTS.deadlineMinutes, 5, 75),
    deepseekMaxCalls: n(raw.deepseekMaxCalls, DEFAULTS.deepseekMaxCalls, 0, 60),
    maxDropRatio: n(raw.maxDropRatio, DEFAULTS.maxDropRatio, 0, 0.5),
    publicBase: typeof raw.publicBase === 'string' ? raw.publicBase.replace(/\/+$/, '') : '',
    bucket: typeof raw.bucket === 'string' && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(raw.bucket) ? raw.bucket : DEFAULTS.bucket,
    skipIds: Array.isArray(raw.skipIds) ? raw.skipIds.filter((s): s is string => typeof s === 'string') : [],
  };
}

export const home = (): string => process.env.ZARI_HOME ?? '/opt/zari-crawler';
export function loadPipelineConfig(): PipelineConfig {
  const p = join(home(), 'pipeline.json');
  return normalize(existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>) : {});
}

/** Last published bundle, read from the public bucket URL (no credentials). */
export async function loadLive(publicBase: string): Promise<{ bundleId: string; items: Record<string, unknown>[] } | null> {
  if (!publicBase) return null;
  const get = async (rel: string) => {
    const r = await fetch(`${publicBase}/${rel}?t=${Date.now()}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`live_${r.status}`);
    return r.json() as Promise<Record<string, unknown>>;
  };
  const latest = await get('catalog/v1/latest.json');
  const bundle = await get(String(latest.bundlePath));
  return { bundleId: String(latest.bundleId), items: (bundle.items as Record<string, unknown>[]) ?? [] };
}
