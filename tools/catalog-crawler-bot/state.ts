import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync, appendFileSync } from 'node:fs';
import { ensureDir, readJson, writeJsonAtomic } from './fsx.ts';
import type { StatePaths } from './paths.ts';
import { normalizeUrl, productKey, siteOfHost, parseHttpsUrl } from '../catalog-extension/lib/sites.js';
import type { SiteKey } from '../catalog-extension/lib/sites.js';
import type { Robots } from './robots.ts';

export type EntryKind = 'listing' | 'product';
export type EntryState = 'pending' | 'done' | 'failed' | 'skipped';

export interface QueueEntry {
  key: string;
  url: string;
  kind: EntryKind;
  site: SiteKey;
  host: string;
  state: EntryState;
  attempts: number;
  lastVisitedAt: string | null;
  retryAfter: string | null;
  reason: string | null;
  from: string | null;
}

export interface HostState {
  robots: { fetchedAt: string; status: number; rules: Robots } | null;
  cooldownUntil: string | null;
  consecutiveBlocks: number;
  disabled: { reason: string; at: string } | null;
  daily: { date: string; count: number };
  lastRequestAt: string | null;
  /** Earliest time the next request to this host may be sent (interval + jitter). */
  nextRequestAt: string | null;
}

export interface ItemRecord {
  item: Record<string, unknown>;
  seenAt: string;
}

export interface Store {
  seeds: string[];
  queue: QueueEntry[];
  hosts: Record<string, HostState>;
  items: Record<string, ItemRecord>;
}

export const emptyHost = (): HostState => ({
  robots: null,
  cooldownUntil: null,
  consecutiveBlocks: 0,
  disabled: null,
  daily: { date: '', count: 0 },
  lastRequestAt: null,
  nextRequestAt: null,
});

export function loadStore(paths: StatePaths): Store {
  return {
    seeds: readJson<{ seeds: string[] }>(paths.seeds, { seeds: [] }).seeds,
    queue: readJson<{ entries: QueueEntry[] }>(paths.queue, { entries: [] }).entries,
    hosts: readJson<{ hosts: Record<string, HostState> }>(paths.hosts, { hosts: {} }).hosts,
    items: readJson<{ items: Record<string, ItemRecord> }>(paths.items, { items: {} }).items,
  };
}

export type StoreFile = 'seeds' | 'queue' | 'hosts' | 'items';

export function saveStore(paths: StatePaths, store: Store, only: StoreFile[] = ['seeds', 'queue', 'hosts', 'items']): void {
  if (only.includes('seeds')) writeJsonAtomic(paths.seeds, { version: 1, seeds: store.seeds });
  if (only.includes('queue')) writeJsonAtomic(paths.queue, { version: 1, entries: store.queue });
  if (only.includes('hosts')) writeJsonAtomic(paths.hosts, { version: 1, hosts: store.hosts });
  if (only.includes('items')) writeJsonAtomic(paths.items, { version: 1, items: store.items });
}

/** One queue entry per listing URL and per product (site + product id). */
export function entryFor(rawUrl: string, kind: EntryKind, from: string | null): QueueEntry | null {
  const normalized = normalizeUrl(rawUrl);
  const url = parseHttpsUrl(rawUrl);
  const site = url && siteOfHost(url.hostname);
  if (!normalized || !url || !site) return null;
  if (kind === 'product') {
    const key = productKey(rawUrl);
    if (!key) return null;
    return mk(`product:${key.site}:${key.productId}`, normalized.split('?')[0]!, kind, site.key, url.hostname, from);
  }
  return mk(`listing:${normalized}`, normalized, kind, site.key, url.hostname, from);
}

function mk(key: string, url: string, kind: EntryKind, site: SiteKey, host: string, from: string | null): QueueEntry {
  return { key, url, kind, site, host, state: 'pending', attempts: 0, lastVisitedAt: null, retryAfter: null, reason: null, from };
}

/** Seeds may be listing pages or product pages; both are allowlisted URLs. */
export function entryForSeed(rawUrl: string): QueueEntry | null {
  return productKey(rawUrl) ? entryFor(rawUrl, 'product', null) : entryFor(rawUrl, 'listing', null);
}

export function enqueue(store: Store, entry: QueueEntry): boolean {
  if (store.queue.some((existing) => existing.key === entry.key)) return false;
  store.queue.push(entry);
  return true;
}

/** Seeds that are new or stale go back to pending; nothing is visited twice in a run. */
export function requeueStale(store: Store, nowMs: number, recrawlDays: number): void {
  for (const seed of store.seeds) {
    const entry = entryForSeed(seed);
    if (entry) enqueue(store, entry);
  }
  const limit = recrawlDays * 86400000;
  for (const entry of store.queue) {
    if (entry.state === 'done' && entry.lastVisitedAt && nowMs - Date.parse(entry.lastVisitedAt) >= limit) {
      entry.state = 'pending';
      entry.attempts = 0;
    }
    if (entry.state === 'failed' && entry.lastVisitedAt === null) entry.state = 'pending';
  }
}

export function appendLog(paths: StatePaths, line: string): void {
  ensureDir(paths.dir);
  appendFileSync(paths.log, `${line}\n`, { mode: 0o600 });
}

/** Single-instance lock; a dead owner's lock is taken over. */
export function acquireLock(paths: StatePaths): () => void {
  ensureDir(paths.dir);
  const tryCreate = (): number => openSync(paths.lock, 'wx', 0o600);
  let fd: number;
  try {
    fd = tryCreate();
  } catch {
    const owner = Number(readFileSync(paths.lock, 'utf8').trim());
    let alive = false;
    try {
      process.kill(owner, 0);
      alive = Number.isInteger(owner) && owner > 0;
    } catch {
      alive = false;
    }
    if (alive) throw new Error('already_running');
    unlinkSync(paths.lock);
    fd = tryCreate();
  }
  writeSync(fd, String(process.pid));
  closeSync(fd);
  return () => {
    if (existsSync(paths.lock)) unlinkSync(paths.lock);
  };
}

export const stopRequested = (paths: StatePaths): boolean => existsSync(paths.stop);
