// Test-only: builds the same snapshot shape the page collector returns, from a
// fixture HTML string, so the pure extraction code can run under Node without a
// browser. The real collector is exercised in a browser test against the same
// fixtures (apps/web/tests/browser/catalog-crawler.spec.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures', 'catalog-collection');
export const fixture = (...parts) => readFileSync(join(FIXTURES, ...parts), 'utf8');

const decode = (text) =>
  text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const textOf = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const dropKey = /^(image|images|img|photo|photos|picture|thumbnail|thumbnailurl|logo|contenturl)$/i;
const strip = (value) => {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !dropKey.test(key)).map(([k, v]) => [k, strip(v)]));
  }
  return value;
};

export function snapshotFromHtml(html, url, status = 200) {
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => strip(JSON.parse(m[1])));
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const meta = {};
  for (const m of html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)"/g)) {
    if (['og:title', 'og:type', 'product:brand', 'product:price:amount', 'product:price:currency', 'description'].includes(m[1])) meta[m[1]] = decode(m[2]);
  }
  const rows = [];
  for (const row of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/g)].map((c) => textOf(c[1]));
    if (cells.length >= 2) rows.push([cells[0], cells[1]]);
  }
  for (const m of body.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) rows.push([textOf(m[1]), textOf(m[2])]);
  const breadcrumbs = [];
  const crumb = body.match(/<(?:nav|ol)[^>]*(?:aria-label="breadcrumb"|class="breadcrumb")[^>]*>([\s\S]*?)<\/(?:nav|ol)>/);
  if (crumb) for (const m of crumb[1].matchAll(/<(?:a|li)[^>]*>([\s\S]*?)<\/(?:a|li)>/g)) breadcrumbs.push(textOf(m[1]));
  const text = decode(body.replace(/<\/(?:p|li|h1|h2|tr|div|dd|dt|ul|ol|table|nav)>/g, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const links = [...new Set([...body.matchAll(/<a href="(https:\/\/[^"]+)"/g)].map((m) => m[1]))];
  const h1 = body.match(/<h1>([\s\S]*?)<\/h1>/);
  return {
    url, status,
    title: textOf((html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? ''),
    heading: h1 ? textOf(h1[1]) : '',
    text, rows, jsonLd, meta, breadcrumbs, links,
    signals: { hasPasswordField: /type="password"/.test(body), captchaFrame: /class="(?:g-recaptcha|h-captcha)"|id="[^"]*captcha/.test(body) },
  };
}
