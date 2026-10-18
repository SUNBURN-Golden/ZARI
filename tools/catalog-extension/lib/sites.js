// Allowed hosts, product/listing URL shapes and the static robots-derived deny
// list. The bot imports this file too, so the allowlist exists exactly once.
// Deny lists are defense in depth: the bot still reads and obeys each host's
// live robots.txt, and the extension refuses these paths regardless.

/** @typedef {'ohou'|'29cm'|'ikea'} SiteKey */

export const SITES = {
  ohou: {
    key: 'ohou',
    hosts: ['ohou.se', 'store.ohou.se'],
    robotsHost: 'ohou.se',
    pathPrefix: '/',
    // 2026-10-15 observation: robots.txt answered 403 to a non-browser client.
    denyPrefixes: [],
    product: [/^\/productions\/(\d+)(?:\/|$)/, /^\/goods\/(\d+)(?:\/|$)/],
  },
  '29cm': {
    key: '29cm',
    hosts: ['www.29cm.co.kr'],
    robotsHost: 'www.29cm.co.kr',
    pathPrefix: '/',
    denyPrefixes: ['/embed/', '/home/embed/', '/my-page/', '/order/', '/auth/', '/inbox/', '/content/post/preview'],
    product: [/^\/products\/(\d+)(?:\/|$)/, /^\/catalog\/(\d+)(?:\/|$)/],
  },
  ikea: {
    key: 'ikea',
    hosts: ['www.ikea.com'],
    robotsHost: 'www.ikea.com',
    pathPrefix: '/kr/',
    denyPrefixes: ['/kr/ko/search/', '/kr/ko/compare/', '/kr/ko/profile/', '/kr/ko/shoppingcart/', '/kr/ko/checkout/', '/kr/ko/favourites/'],
    // The article number is the trailing 8 digits of the slug: ...-12345678
    product: [/^\/kr\/ko\/p\/[^/]*?-(\d{8})\/?$/],
  },
};

// Search, filter and sort URLs are never visited (IKEA's root robots.txt names
// these classes; the others get the same conservative treatment).
const DENIED_PARAM = /^(sort|sortby|order|orderby|filter|filters|q|query|keyword|search|f|compare)$|^filter|^f-/i;
const TRACKING = /^(utm_|gclid$|fbclid$|ref$|ref_|from$|n_media$|n_query$)/i;

/** @param {string} raw */
export function parseHttpsUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(raw)) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return url;
}

/** @param {string} host */
export function siteOfHost(host) {
  return Object.values(SITES).find((site) => site.hosts.includes(host)) ?? null;
}

/**
 * Normalize for dedupe: https only, no fragment, lowercase host, tracking
 * parameters removed, remaining parameters sorted. Returns null when the URL
 * is outside the allowlist or inside a static deny prefix.
 * @param {string} raw
 */
export function normalizeUrl(raw) {
  const url = parseHttpsUrl(raw);
  if (!url) return null;
  const site = siteOfHost(url.hostname);
  if (!site || !url.pathname.startsWith(site.pathPrefix)) return null;
  const path = url.pathname.toLowerCase();
  if (site.denyPrefixes.some((prefix) => path.startsWith(prefix))) return null;
  if ([...url.searchParams.keys()].some((key) => DENIED_PARAM.test(key))) return null;
  const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING.test(key));
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return `https://${url.hostname}${url.pathname}${query}`;
}

/** @param {string} raw @returns {{site: SiteKey, productId: string}|null} */
export function productKey(raw) {
  const url = parseHttpsUrl(raw);
  const site = url && siteOfHost(url.hostname);
  if (!url || !site) return null;
  for (const pattern of site.product) {
    const match = pattern.exec(url.pathname);
    if (match?.[1]) return { site: site.key, productId: match[1] };
  }
  return null;
}

/** A URL a job may visit: allowlisted, not denied, and not a robots probe. */
export function isVisitable(raw) {
  return normalizeUrl(raw) !== null;
}
