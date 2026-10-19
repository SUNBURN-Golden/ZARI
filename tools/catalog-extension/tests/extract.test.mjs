import { describe, expect, it } from 'vitest';
import { extractListing, extractProducts } from '../lib/extract.js';
import { fixture, snapshotFromHtml } from './html-snapshot.mjs';

const NOW = Date.UTC(2026, 9, 15);
const product = (file, url) => extractProducts(snapshotFromHtml(fixture(...file.split('/')), url), url, NOW);

describe('listing pages', () => {
  it('finds same-host product URLs only, normalized and deduplicated', () => {
    const url = 'https://ohou.se/store/category';
    expect(extractListing(snapshotFromHtml(fixture('ohou', 'listing.html'), url), url)).toEqual([
      'https://ohou.se/productions/1001/selling', 'https://ohou.se/productions/1002/selling',
      'https://store.ohou.se/goods/2003', 'https://ohou.se/productions/5/selling',
    ]);
    const cm = 'https://www.29cm.co.kr/shop/x';
    expect(extractListing(snapshotFromHtml(fixture('29cm', 'listing.html'), cm), cm)).toEqual([
      'https://www.29cm.co.kr/products/3001', 'https://www.29cm.co.kr/products/3002', 'https://www.29cm.co.kr/catalog/3003',
    ]);
    const ik = 'https://www.ikea.com/kr/ko/cat/bookcases-10382/';
    expect(extractListing(snapshotFromHtml(fixture('ikea', 'listing.html'), ik), ik)).toEqual([
      'https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/', 'https://www.ikea.com/kr/ko/p/billy-bookcase-white-00263850/',
    ]);
  });
});

describe('product pages', () => {
  it('ohou: name, brand, category, labelled dimensions, price text, no image fields', () => {
    const { items } = product('ohou/product.html', 'https://ohou.se/productions/1001/selling');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'crawl:ohou:1001', sourceKind: 'crawled', status: 'unconfirmed', name: '모듈 5단 선반', brand: '합성브랜드',
      categoryHint: 'shelf', source: 'ohou', fetchedAt: '2026-10-15T00:00:00Z', priceText: '59000 KRW',
      dimensions: { width: '80', depth: '30', height: '180', unit: 'cm', confidence: 'high' },
    });
    expect(JSON.stringify(items)).not.toMatch(/image|img|jpg|photo|thumbnail/i);
  });
  it('options become separate items and are never merged', () => {
    const { items } = product('ohou/product-options.html', 'https://ohou.se/productions/1003/selling');
    expect(items.map((i) => [i.name, i.dimensions.width])).toEqual([['스택 수납함 (소형)', '30'], ['스택 수납함 (대형)', '45']]);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
    expect(items.every((i) => /^crawl:ohou:1003:[a-z0-9-]+$/.test(i.id))).toBe(true);
  });
  it('29cm: spec rows with letter labels; unlabeled and round pages are low with no values', () => {
    expect(product('29cm/product.html', 'https://www.29cm.co.kr/products/3001').items[0].dimensions).toMatchObject({ width: '60', depth: '40', height: '90', unit: 'cm', confidence: 'high' });
    expect(product('29cm/product-unlabeled.html', 'https://www.29cm.co.kr/products/3002').items[0].dimensions).toMatchObject({ width: null, unit: null, confidence: 'low' });
    expect(product('29cm/product-nounit-round.html', 'https://www.29cm.co.kr/products/3005').items[0].dimensions).toMatchObject({ width: null, height: null, confidence: 'low' });
  });
  it('ikea: separate axis lines combine; outer never borrows the inner size', () => {
    expect(product('ikea/product.html', 'https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/').items[0]).toMatchObject({
      id: 'crawl:ikea:80275887', brand: 'IKEA', dimensions: { width: '77', depth: '39', height: '147', confidence: 'high' },
    });
    expect(product('ikea/product-inner-outer.html', 'https://www.ikea.com/kr/ko/p/samla-box-12345678/').items[0].dimensions).toMatchObject({ width: '39', depth: '28', height: '14', confidence: 'high' });
    const inner = product('ikea/product-inner-only.html', 'https://www.ikea.com/kr/ko/p/variera-box-23456789/').items[0];
    expect(inner.dimensions).toMatchObject({ width: null, depth: null, height: null, unit: null, confidence: 'unparsed' });
  });
  it('a non-product URL yields nothing', () => {
    expect(product('ohou/listing.html', 'https://ohou.se/contents/9').error).toBe('not_product_url');
  });
});
