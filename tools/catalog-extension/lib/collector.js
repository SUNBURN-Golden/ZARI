// Functions injected into a page with chrome.scripting.executeScript({ func }).
// They are serialized, so each one is fully self-contained. They read text and
// link targets only: no image elements or URLs, no cookies, no storage, no
// network, and nothing outside the page document.

/** Page text, spec rows, structured data with image keys removed, and links. */
export function collectPage() {
  const clip = (text, max) => String(text ?? '').slice(0, max);
  const tidy = (text) => clip(String(text ?? '').replace(/\s+/g, ' ').trim(), 400);
  const dropKey = /^(image|images|img|photo|photos|picture|thumbnail|thumbnailurl|logo|contenturl)$/i;
  const dropValue = /^(?:https?:)?\/\/\S+\.(?:jpe?g|png|gif|webp|avif|svg|bmp|heic|ico)(?:[?#]\S*)?$/i;
  const strip = (value, depth) => {
    if (depth > 8) return null;
    if (Array.isArray(value)) return value.slice(0, 50).map((entry) => strip(entry, depth + 1));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, entry] of Object.entries(value)) {
        if (!dropKey.test(key)) out[key] = strip(entry, depth + 1);
      }
      return out;
    }
    if (typeof value === 'string') return dropValue.test(value) ? null : clip(value, 2000);
    return value;
  };

  const navigation = performance.getEntriesByType('navigation')[0];
  const status = navigation && typeof navigation.responseStatus === 'number' ? navigation.responseStatus : null;

  const jsonLd = [];
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    if (jsonLd.length >= 8) break;
    try {
      const text = node.textContent ?? '';
      if (text.length <= 200000) jsonLd.push(strip(JSON.parse(text), 0));
    } catch {
      // Malformed structured data is ignored, never repaired.
    }
  }

  const wanted = new Set(['og:title', 'og:type', 'product:brand', 'product:price:amount', 'product:price:currency', 'description']);
  const meta = {};
  for (const node of document.querySelectorAll('meta[property], meta[name]')) {
    const key = (node.getAttribute('property') ?? node.getAttribute('name') ?? '').toLowerCase();
    if (wanted.has(key) && !(key in meta)) meta[key] = tidy(node.getAttribute('content'));
  }

  const rows = [];
  for (const row of document.querySelectorAll('tr')) {
    if (rows.length >= 300) break;
    const cells = row.querySelectorAll('th, td');
    if (cells.length >= 2) rows.push([tidy(cells[0].textContent), tidy(cells[1].textContent)]);
  }
  for (const term of document.querySelectorAll('dt')) {
    if (rows.length >= 300) break;
    const detail = term.nextElementSibling;
    if (detail && detail.tagName === 'DD') rows.push([tidy(term.textContent), tidy(detail.textContent)]);
  }

  const breadcrumbs = [];
  for (const node of document.querySelectorAll('[aria-label*="readcrumb"] a, [class*="readcrumb"] a, [class*="readcrumb"] li')) {
    const text = tidy(node.textContent);
    if (text && breadcrumbs.length < 12 && !breadcrumbs.includes(text)) breadcrumbs.push(text);
  }

  const links = [];
  const seen = new Set();
  for (const node of document.querySelectorAll('a[href]')) {
    if (links.length >= 1500) break;
    const href = node.href;
    if (typeof href === 'string' && href.startsWith('https://') && !seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }

  const heading = document.querySelector('h1');
  return {
    url: location.href,
    status,
    title: tidy(document.title),
    heading: heading ? tidy(heading.textContent) : '',
    text: clip(document.body ? document.body.innerText : '', 60000),
    rows,
    jsonLd,
    meta,
    breadcrumbs,
    links,
    signals: {
      hasPasswordField: document.querySelector('input[type="password"]') !== null,
      captchaFrame:
        document.querySelector('.g-recaptcha, .h-captcha, [id*="captcha"], [class*="captcha"], #cf-challenge-running') !== null,
    },
  };
}

/** robots.txt is shown as plain text by the browser; read it as text. */
export function collectRobots() {
  const navigation = performance.getEntriesByType('navigation')[0];
  return {
    url: location.href,
    status: navigation && typeof navigation.responseStatus === 'number' ? navigation.responseStatus : null,
    contentType: document.contentType,
    text: String(document.body ? document.body.innerText : '').slice(0, 262144),
  };
}
