import type { CatalogSnapshot, CrawledItem } from '../../contracts/generated/dto';
import { readRepository, reviewBundleText, type BundleReviewer } from '../catalog/bundle';
import { configuredR2Base, r2Transport } from '../catalog/r2Transport';

export const R2_BASE = configuredR2Base(import.meta.env.VITE_ZARI_CATALOG_R2_BASE);
export const LOCAL_IMPORT_ALLOWED = import.meta.env.DEV || import.meta.env.MODE === 'test';
const CACHE_DB = 'zari.space.catalog.v1';
interface Cache { base: string; text: string }
async function cacheStore(value?: Cache): Promise<Cache | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(CACHE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('bundles');
    open.onerror = () => reject(new Error('catalog_cache_unavailable'));
    open.onblocked = () => reject(new Error('catalog_cache_blocked'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('bundles', value ? 'readwrite' : 'readonly');
      const request = value ? tx.objectStore('bundles').put(value, 'current') : tx.objectStore('bundles').get('current');
      tx.oncomplete = () => { db.close(); resolve(value ?? (request.result as Cache | undefined) ?? null); };
      tx.onerror = () => { db.close(); reject(new Error('catalog_cache_failed')); };
    };
  });
}
export interface LoadedCatalog {
  snapshot: CatalogSnapshot;
  /** Reviewed bundle items, sent to Rust as the re-validated reference side channel. */
  listings: CrawledItem[];
  cached: boolean;
  cacheFailed: boolean;
}
function bundleItems(text: string): CrawledItem[] {
  try {
    const value = JSON.parse(text) as { items?: unknown };
    return Array.isArray(value.items) ? (value.items as CrawledItem[]) : [];
  } catch { return []; }
}
function requireSnapshot(read: Awaited<ReturnType<typeof reviewBundleText>>): CatalogSnapshot {
  if (read.status !== 'reviewed' || read.review.quarantined || !read.review.snapshot) throw new Error('catalog_invalid');
  return read.review.snapshot;
}
export async function localCatalog(text: string, reviewer: BundleReviewer): Promise<LoadedCatalog> {
  if (!LOCAL_IMPORT_ALLOWED) throw new Error('local_import_disabled');
  return { snapshot: requireSnapshot(await reviewBundleText(text, reviewer)), listings: bundleItems(text), cached: false, cacheFailed: false };
}
export async function loadCatalog(reviewer: BundleReviewer): Promise<LoadedCatalog> {
  if (!R2_BASE) throw new Error('catalog_not_configured');
  let bundleText = '';
  const transport = r2Transport(R2_BASE);
  const read = await readRepository(R2_BASE, async (request) => {
    const reply = await transport(request);
    if (request.url.endsWith('/bundle.json') && reply.status === 200) bundleText = reply.text;
    return reply;
  }, reviewer);
  if (read.status === 'reviewed' && !read.review.quarantined && read.review.snapshot) {
    let cacheFailed = false;
    try { await cacheStore({ base: R2_BASE, text: bundleText }); } catch { cacheFailed = true; }
    return { snapshot: read.review.snapshot, listings: bundleItems(bundleText), cached: false, cacheFailed };
  }
  // A previous R2 snapshot is only a cache, and is revalidated before use.
  const cached = await cacheStore().catch(() => null);
  if (cached?.base === R2_BASE) return { snapshot: requireSnapshot(await reviewBundleText(cached.text, reviewer)), listings: bundleItems(cached.text), cached: true, cacheFailed: false };
  throw new Error('catalog_unavailable');
}
