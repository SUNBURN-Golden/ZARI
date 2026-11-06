import { describe, expect, it } from 'vitest';
import { extractListing, extractProducts } from '../lib/extract.js';
import { normalizeUrl, productKey } from '../lib/sites.js';
import { snapshotFromHtml, fixture } from './html-snapshot.mjs';
const urls = { muji: 'https://mujikorea.co.kr/products/123456', daiso: 'https://www.daisomall.co.kr/pd/pdr/SCR_PDR_0001?pdNo=123456' };
for (const [site, url] of Object.entries(urls)) describe(site, () => {
  it('keeps options separate, refuses inner/package sizes, never confirms', () => {
    const result = extractProducts(snapshotFromHtml(fixture(site, 'storage.html'), url), url);
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.status).toBe('unconfirmed');
      expect(item.dimensions.confidence).toBe('high');
      expect(item.dimensions.width).not.toBe('99');
      expect(item.productUrl).toBe(url);
      expect(JSON.stringify(item)).not.toMatch(/image|thumbnail|cookie/i);
    }
    expect(result.items.map((i) => i.dimensions.width)).toEqual(['20', '30']);
  });
  it('drops URL-bearing specification text at the collection boundary', () => {
    const result = extractProducts({ heading: '합성 수납함', rows: [['외경', '가로 20cm 깊이 15cm 높이 10cm https://example.invalid/asset']], text: '' }, url);
    expect(result.items[0].dimensions.width).toBeNull();
    expect(result.items[0].dimensions.rawText).not.toContain('https:');
  });
  it('does not infer W/D/H from an unlabeled triple', () => {
    const result = extractProducts(snapshotFromHtml(fixture(site, 'ambiguous.html'), url), url);
    expect(result.items[0].dimensions.width).toBeNull();
  });
  it('retains the product identity query during discovery', () => {
    expect(productKey(url)).toEqual({ site, productId: '123456' });
    expect(extractListing({ links: [url, url + '&utm_source=x'] }, url)).toEqual([url]);
    expect(normalizeUrl(url.replace(new URL(url).hostname, 'evil.' + new URL(url).hostname))).toBeNull();
  });
});

it('deduplicates live PDR and legacy PDL Daiso listing links', () => {
  const url = 'https://www.daisomall.co.kr/pd/pdr/SCR_PDR_0001?pdNo=1044144';
  expect(extractListing({ links: [url + '&recmYn=N', url.replace('/pdr/SCR_PDR_', '/pdl/SCR_PDL_') + '&utm_source=x'] }, 'https://www.daisomall.co.kr/ds/exhCtgr/C208/CTGR_00016')).toEqual([url]);
});
