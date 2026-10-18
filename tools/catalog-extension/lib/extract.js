// Page snapshot → listing links and dimension-only items. Reads only the
// snapshot fields the collector produces; there is no image data in it.
import { normalizeUrl, productKey, siteOfHost, parseHttpsUrl } from './sites.js';
import { parseDimensionBlocks } from './dimensions.js';
import { SITE_PARSERS } from '../parsers/index.js';

const MAX_LINKS = 200;

/** URLs found on a listing page that are product pages of the same site. */
export function extractListing(snapshot, pageUrl) {
  const page = parseHttpsUrl(pageUrl);
  const site = page && siteOfHost(page.hostname);
  if (!site) return [];
  const out = new Set();
  for (const href of snapshot.links ?? []) {
    const key = productKey(href);
    const normalized = key && key.site === site.key ? normalizeUrl(href) : null;
    // Product URLs lose their query so one product has one queue entry.
    if (normalized) out.add(normalized.split('?')[0]);
    if (out.size >= MAX_LINKS) break;
  }
  return [...out];
}

const HINTS = [
  ['bed', /침대|매트리스|bed\b/i],
  ['sofa', /소파|sofa|couch/i],
  ['chair', /의자|스툴|체어|chair|stool/i],
  ['table', /테이블|책상|식탁|데스크|desk|table/i],
  ['bin', /바구니|수납함|수납\s*박스|박스|정리함|bin\b|basket|box\b/i],
  ['shelf', /선반|책장|서가|shelf|shelves|bookcase|rack|행거/i],
  ['cabinet', /수납장|서랍|캐비닛|캐비넷|옷장|장롱|찬장|cabinet|drawer|wardrobe|dresser|chest/i],
];

export function categoryHintOf(category, name) {
  const text = `${category} ${name}`;
  for (const [hint, pattern] of HINTS) if (pattern.test(text)) return hint;
  return category.trim() || name.trim() ? 'other' : 'unknown';
}

function optionToken(label) {
  const ascii = label.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (ascii && ascii.length <= 24 && ascii === label.normalize('NFKC').toLowerCase().replace(/\s+/g, '-')) return ascii;
  let hash = 0x811c9dc5;
  for (const ch of label.normalize('NFC')) hash = Math.imul(hash ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return `o${hash.toString(16).padStart(8, '0')}`;
}

function jsonLdProduct(snapshot) {
  const stack = [...(snapshot.jsonLd ?? [])];
  while (stack.length) {
    const node = stack.shift();
    if (Array.isArray(node)) stack.push(...node);
    else if (node && typeof node === 'object') {
      const type = node['@type'];
      if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return node;
      if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
    }
  }
  return null;
}

function priceText(product, snapshot) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const price = offers?.price ?? offers?.lowPrice ?? snapshot.meta?.['product:price:amount'];
  if (price === undefined || price === null || String(price).trim() === '') return undefined;
  const currency = offers?.priceCurrency ?? snapshot.meta?.['product:price:currency'] ?? '';
  return `${String(price).trim()}${currency ? ` ${String(currency).trim()}` : ''}`.slice(0, 64);
}

function lines(snapshot) {
  const rowLines = (snapshot.rows ?? []).map(([label, value]) => `${label}: ${value}`);
  const bodyLines = String(snapshot.text ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return [...rowLines, ...bodyLines];
}

const isoSeconds = (now) => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Product page → items. One item per option the page itself separates; an
 * ambiguous page yields one low-confidence item, never a merged guess.
 */
export function extractProducts(snapshot, pageUrl, now = Date.now()) {
  const key = productKey(pageUrl);
  const normalized = normalizeUrl(pageUrl);
  if (!key || !normalized) return { items: [], error: 'not_product_url' };
  const parser = SITE_PARSERS[key.site];
  const product = jsonLdProduct(snapshot);
  const name = parser.cleanName(
    String(product?.name ?? snapshot.heading ?? snapshot.meta?.['og:title'] ?? snapshot.title ?? '').trim(),
  );
  if (!name) return { items: [], error: 'name_missing' };
  const brandValue = product?.brand;
  const brand = String(
    (typeof brandValue === 'string' ? brandValue : brandValue?.name) ?? snapshot.meta?.['product:brand'] ?? parser.defaultBrand,
  ).trim().slice(0, 120);
  const category = (snapshot.breadcrumbs?.length ? snapshot.breadcrumbs.join(' > ') : String(product?.category ?? '')).slice(0, 200);
  const hint = categoryHintOf(category, name);
  const blocks = parseDimensionBlocks(lines(snapshot));
  const productUrl = normalized.split('?')[0];
  const price = priceText(product, snapshot);
  const items = blocks.map((block) => {
    const optioned = block.optionLabel !== null;
    const item = {
      id: `crawl:${key.site}:${key.productId}${optioned ? `:${optionToken(block.optionLabel)}` : ''}`,
      sourceKind: 'crawled',
      status: 'unconfirmed',
      name: (optioned ? `${name} (${block.optionLabel})` : name).slice(0, 250),
      brand,
      category,
      categoryHint: hint,
      productUrl,
      source: key.site,
      fetchedAt: isoSeconds(now),
      dimensions: block.dimensions,
    };
    if (price) item.priceText = price;
    return item;
  });
  return { items, error: null };
}
