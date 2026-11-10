/**
 * Per-product hand-drawn thumbnails. These are our own illustrations drawn
 * from a product photo; the seller's photo itself is never shipped, stored or
 * put in the catalog bundle (catalog_bundle.rs refuses images).
 *
 * The drawings ship with the app under /sketches/ and are keyed by crawled
 * product id (`crawl:{site}:{id}`), so they need no contract change. The table
 * is empty until the drawings are approved; a row without one shows nothing.
 */
export const SKETCHES: Readonly<Record<string, string>> = {};

const SKETCH_PATH = /^\/sketches\/[a-z0-9-]+\.(?:webp|jpg)$/;

/** `crawl:daiso:1010289:o1a2b3c4d` → `crawl:daiso:1010289`. */
export function productKey(variantId: string): string {
  return variantId.split(':').slice(0, 3).join(':');
}

/** Same-origin sketch path for a variant, or null. Anything else is ignored. */
export function sketchFor(variantId: string, table: Readonly<Record<string, string>> = SKETCHES): string | null {
  const path = table[variantId] ?? table[productKey(variantId)];
  return path !== undefined && SKETCH_PATH.test(path) ? path : null;
}
