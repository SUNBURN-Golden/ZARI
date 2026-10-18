import type { CatalogBundleReview, CatalogSnapshot } from '../../contracts/generated/dto';

/**
 * Read-only catalog bundle client (SP-z-catalog-crawler).
 *
 * The app only *reads* a dimension-only bundle: bytes → bounded text → Rust
 * review (checksum, image refusal, unit conversion, per-item diagnosis, the
 * provenance quarantine) → explicit user save as an immutable catalog snapshot.
 * Nothing here crawls, requests a third-party site, or writes to a remote
 * store. Imported items are always `unconfirmed`; Rust only ever treats them as
 * an Unverified conditional fit.
 */
export const BUNDLE_BYTES_LIMIT = 10 * 1024 * 1024;
export const BUNDLE_ORIGIN = 'crawled-bundle';

export type BundleRead =
  | { status: 'reviewed'; review: CatalogBundleReview }
  | { status: 'rejected'; code: string }
  | { status: 'unavailable'; error: string };

export interface BundleReviewer {
  review(text: string): Promise<CatalogBundleReview>;
}

/** Spawns the bundle worker per review so a bad bundle cannot wedge later ones. */
export function workerReviewer(): BundleReviewer {
  return {
    review: (text) =>
      new Promise<CatalogBundleReview>((resolve, reject) => {
        const worker = new Worker(new URL('../../worker/bundleWorker.ts', import.meta.url), { type: 'module' });
        const done = (fn: () => void) => {
          worker.terminate();
          fn();
        };
        worker.onmessage = (event: MessageEvent<{ ok: boolean; json?: string; error?: string }>) => {
          const data = event.data;
          if (data.ok && typeof data.json === 'string') {
            try {
              done(() => resolve(JSON.parse(data.json!) as CatalogBundleReview));
            } catch {
              done(() => reject(new Error('bundle_reply_invalid')));
            }
          } else done(() => reject(new Error(data.error ?? 'bundle_worker_failed')));
        };
        worker.onerror = () => done(() => reject(new Error('bundle_worker_failed')));
        worker.postMessage(text);
      }),
  };
}

/** A picked file: refuse oversize before reading a single byte into memory. */
export async function readBundleFile(file: { size: number; text(): Promise<string> }): Promise<{ text: string } | { code: string }> {
  if (file.size > BUNDLE_BYTES_LIMIT) return { code: 'bundle_too_large' };
  const text = await file.text();
  return text.length > BUNDLE_BYTES_LIMIT ? { code: 'bundle_too_large' } : { text };
}

export async function reviewBundleText(text: string, reviewer: BundleReviewer): Promise<BundleRead> {
  if (text.length > BUNDLE_BYTES_LIMIT) return { status: 'rejected', code: 'bundle_too_large' };
  try {
    return { status: 'reviewed', review: await reviewer.review(text) };
  } catch (error) {
    return { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Store a reviewed snapshot only when Rust published one. A bundle with any
 * quarantined item publishes nothing, and the stored catalogs stay as they were.
 */
export async function commitBundle(
  target: { commit(snapshot: CatalogSnapshot, origin: string): Promise<void> },
  review: CatalogBundleReview,
): Promise<'saved' | 'blocked'> {
  if (review.quarantined || review.snapshot === null) return 'blocked';
  await target.commit(review.snapshot, BUNDLE_ORIGIN);
  return 'saved';
}

// ---- repository (read-only) reader core ------------------------------------
//
// The reading rules for the R2 base URL live here, with no network call: the
// z-privacy-offline guard forbids any `fetch` outside the same-origin service
// worker, and this build keeps that guard. Enabling the URL path is a separate,
// owner-approved change that wires a transport into this core (see
// docs/adr/SP-z-catalog-crawler.md, "저장소 읽기").

export const REPOSITORY_TIMEOUT_MS = 20000;
export const LATEST_BYTES_LIMIT = 4096;

export interface TransportRequest {
  url: string;
  method: 'GET';
  credentials: 'omit';
  redirect: 'error';
  cache: 'no-store';
  timeoutMs: number;
  maxBytes: number;
}
export interface TransportReply {
  status: number;
  text: string;
}
export type RepositoryTransport = (request: TransportRequest) => Promise<TransportReply>;

export function parseBaseUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null;
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

interface LatestPointer {
  bundleId: string;
  sha256: string;
  bytes: number;
  bundlePath: string;
}

function parseLatest(text: string): LatestPointer | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (
      value.schemaVersion === 1 &&
      typeof value.bundleId === 'string' && /^b-[0-9a-f]{16}$/.test(value.bundleId) &&
      typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) &&
      typeof value.bytes === 'number' && Number.isInteger(value.bytes) && value.bytes > 0 && value.bytes <= BUNDLE_BYTES_LIMIT &&
      value.bundlePath === `catalog/v1/${value.bundleId}/bundle.json`
    ) {
      return { bundleId: value.bundleId, sha256: value.sha256, bytes: value.bytes, bundlePath: value.bundlePath };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Latest pointer → bundle bytes → Rust review. GET only, no credentials, bounded. */
export async function readRepository(baseUrl: string, transport: RepositoryTransport, reviewer: BundleReviewer): Promise<BundleRead> {
  const base = parseBaseUrl(baseUrl);
  if (!base) return { status: 'rejected', code: 'repository_url_invalid' };
  const get = (path: string, maxBytes: number) =>
    transport({ url: new URL(path, base).toString(), method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', timeoutMs: REPOSITORY_TIMEOUT_MS, maxBytes });
  try {
    const latestReply = await get('catalog/v1/latest.json', LATEST_BYTES_LIMIT);
    if (latestReply.status !== 200) return { status: 'rejected', code: 'repository_latest_unavailable' };
    const latest = parseLatest(latestReply.text);
    if (!latest) return { status: 'rejected', code: 'repository_latest_invalid' };
    const bundleReply = await get(latest.bundlePath, latest.bytes);
    if (bundleReply.status !== 200) return { status: 'rejected', code: 'repository_bundle_unavailable' };
    const read = await reviewBundleText(bundleReply.text, reviewer);
    // The pointer names a bundle id (a hash of the items); a different bundle behind it is refused.
    if (read.status === 'reviewed' && read.review.bundleId !== latest.bundleId) {
      return { status: 'rejected', code: 'repository_pointer_mismatch' };
    }
    return read;
  } catch (error) {
    return { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
  }
}

// ---- image-free rendering model --------------------------------------------

export type HintKind = 'shelf' | 'cabinet' | 'bin' | 'table' | 'chair' | 'sofa' | 'bed' | 'other' | 'unknown';
const HINTS: readonly string[] = ['shelf', 'cabinet', 'bin', 'table', 'chair', 'sofa', 'bed', 'other', 'unknown'];

export interface ItemShape {
  id: string;
  name: string;
  hint: HintKind;
  /** mm, or null while any axis is unknown. */
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  /** True when W, D and H are all known; only then may the item be drawn to scale. */
  measured: boolean;
}

function knownMm(fact: { state: string; value?: { nominal?: unknown } | null }): number | null {
  return fact.state === 'known' && fact.value && typeof fact.value.nominal === 'number' ? fact.value.nominal : null;
}

/** Drawing input comes from the snapshot's W/D/H and the category hint — nothing else. */
export function itemShapes(snapshot: CatalogSnapshot): ItemShape[] {
  const products = new Map(snapshot.products.map((product) => [product.id, product]));
  return snapshot.variants.map((variant) => {
    const product = products.get(variant.productId);
    const outer = variant.dimensions.outer;
    const widthMm = knownMm(outer.width);
    const depthMm = knownMm(outer.depth);
    const heightMm = knownMm(outer.height);
    const hint = product && HINTS.includes(product.category) ? (product.category as HintKind) : 'unknown';
    return {
      id: variant.id,
      name: product?.name ?? variant.id,
      hint,
      widthMm,
      depthMm,
      heightMm,
      measured: widthMm !== null && depthMm !== null && heightMm !== null,
    };
  });
}
