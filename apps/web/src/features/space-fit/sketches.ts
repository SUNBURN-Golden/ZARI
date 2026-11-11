/**
 * Per-product hand-drawn thumbnails. These are our own illustrations drawn
 * from a product photo; the seller's photo itself is never shipped, stored or
 * put in the catalog bundle (catalog_bundle.rs refuses images).
 *
 * The drawings ship with the app under /sketches/ and are keyed by crawled
 * product id (`crawl:{site}:{id}`), so they need no contract change. Variants
 * of the same product share one drawing. Items without a drawing (currently
 * the muji-1006187 family and muji-59138) show the grey placeholder.
 */
export const SKETCHES: Readonly<Record<string, string>> = {
  'crawl:daiso:1065176': '/sketches/daiso-1065176.webp',
  'crawl:daiso:1065177': '/sketches/daiso-1065176.webp',
  'crawl:daiso:1082447': '/sketches/daiso-1082447.webp',
  'crawl:muji:1003337': '/sketches/muji-1003337.webp',
  'crawl:muji:1003338': '/sketches/muji-1003337.webp',
  'crawl:daiso:1010289': '/sketches/daiso-1010289.webp',
  'crawl:daiso:1010513': '/sketches/daiso-1010513.webp',
  'crawl:daiso:1015446': '/sketches/daiso-1015446.webp',
  'crawl:daiso:1020319': '/sketches/daiso-1020319.webp',
  'crawl:daiso:1034027': '/sketches/daiso-1034027.webp',
  'crawl:daiso:1035255': '/sketches/daiso-1035255.webp',
  'crawl:daiso:1035764': '/sketches/daiso-1035764.webp',
  'crawl:daiso:1036546': '/sketches/daiso-1036546.webp',
  'crawl:daiso:1039098': '/sketches/daiso-1039098.webp',
  'crawl:daiso:1039099': '/sketches/daiso-1039098.webp',
  'crawl:daiso:1044144': '/sketches/daiso-1044144.webp',
  'crawl:daiso:1047616': '/sketches/daiso-1047616.webp',
  'crawl:daiso:1047682': '/sketches/daiso-1047682.webp',
  'crawl:daiso:1057182': '/sketches/daiso-1057182.webp',
  'crawl:daiso:1059316': '/sketches/daiso-1059316.webp',
  'crawl:daiso:1067843': '/sketches/daiso-1067843.webp',
  'crawl:daiso:1067845': '/sketches/daiso-1067845.webp',
  'crawl:daiso:1067997': '/sketches/daiso-1067997.webp',
  'crawl:daiso:1069682': '/sketches/daiso-1069682.webp',
  'crawl:daiso:1069701': '/sketches/daiso-1069701.webp',
  'crawl:daiso:1069702': '/sketches/daiso-1069702.webp',
  'crawl:daiso:1070246': '/sketches/daiso-1070246.webp',
  'crawl:daiso:1072362': '/sketches/daiso-1072362.webp',
  'crawl:daiso:1076787': '/sketches/daiso-1076787.webp',
  'crawl:daiso:1078314': '/sketches/daiso-1078314.webp',
  'crawl:daiso:1078316': '/sketches/daiso-1078314.webp',
  'crawl:muji:1004885': '/sketches/muji-1004885.webp',
  'crawl:muji:1005321': '/sketches/muji-1005321.webp',
  'crawl:muji:1005322': '/sketches/muji-1005322.webp',
};

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
