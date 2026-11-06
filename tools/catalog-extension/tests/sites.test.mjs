import { describe, expect, it } from 'vitest';
import { SITES, canonicalProductUrl, isVisitable, normalizeUrl, productKey } from '../lib/sites.js';

describe('allowlist', () => {
  it('accepts only https on the three sites', () => {
    for (const ok of ['https://ohou.se/productions/1/selling', 'https://store.ohou.se/goods/2', 'https://www.29cm.co.kr/products/3', 'https://www.ikea.com/kr/ko/p/x-12345678/']) {
      expect(isVisitable(ok), ok).toBe(true);
    }
    for (const bad of [
      'http://ohou.se/productions/1/selling', 'https://evil.example/productions/1', 'https://ohou.se.evil.example/productions/1',
      'https://user:pw@ohou.se/productions/1', 'https://ohou.se:8443/productions/1', 'https://www.ikea.com/us/en/p/x-12345678/',
      'https://www.ikea.com/', 'javascript:alert(1)', 'https://www.29cm.co.kr/my-page/orders', 'https://www.29cm.co.kr/order/x',
      'https://www.29cm.co.kr/embed/y', 'https://www.ikea.com/kr/ko/search/?q=a', 'https://www.ikea.com/kr/ko/compare/', 'file:///etc/passwd',
      'https://www.ikea.com/kr/ko/cat/x-1/?sort=price', 'https://www.ikea.com/kr/ko/cat/x-1/?filters=a', 'https://ohou.se/productions/feed?order=popular',
    ]) {
      expect(isVisitable(bad), bad).toBe(false);
    }
  });
  it('removes tracking and fragments so one page has one key', () => {
    expect(normalizeUrl('https://ohou.se/productions/1/selling?utm_source=a#x')).toBe('https://ohou.se/productions/1/selling');
    expect(normalizeUrl('https://ohou.se/x?b=2&a=1')).toBe('https://ohou.se/x?a=1&b=2');
  });
  it('knows product shapes and the denied prefixes of the 2026-10-15 robots observations', () => {
    expect(productKey('https://www.ikea.com/kr/ko/p/kallax-shelf-unit-white-80275887/')).toEqual({ site: 'ikea', productId: '80275887' });
    expect(productKey('https://www.29cm.co.kr/catalog/3003')).toEqual({ site: '29cm', productId: '3003' });
    expect(productKey('https://ohou.se/contents/9')).toBeNull();
    expect(SITES['29cm'].denyPrefixes).toEqual(expect.arrayContaining(['/embed/', '/home/embed/', '/my-page/', '/order/', '/auth/', '/inbox/', '/content/post/preview']));
  });
});

it('allows Daiso category and product paths while preserving product identity', () => {
  const category = 'https://www.daisomall.co.kr/ds/exhCtgr/C208/CTGR_00016';
  const product = 'https://www.daisomall.co.kr/pd/pdl/SCR_PDL_0001?pdNo=123';
  expect(normalizeUrl(category)).toBe(category);
  expect(normalizeUrl(product)).toBe(product);
  expect(productKey(category)).toBeNull();
  expect(productKey(product)).toEqual({ site: 'daiso', productId: '123' });
  expect(isVisitable('https://www.daisomall.co.kr/member/login')).toBe(false);
  expect(SITES.daiso.blockedReason).toBeUndefined();
});

for (const path of ['/pd/pdr/SCR_PDR_0001', '/pd/pdl/SCR_PDL_0001']) {
  it(`recognizes and canonicalizes Daiso ${path} with extra parameters`, () => {
    const raw = `https://www.daisomall.co.kr${path}?recmYn=N&pdNo=1044144&utm_source=test#detail`;
    expect(productKey(raw)).toEqual({ site: 'daiso', productId: '1044144' });
    expect(normalizeUrl(raw)).toBe(`https://www.daisomall.co.kr${path}?pdNo=1044144&recmYn=N`);
    expect(canonicalProductUrl(raw)).toBe('https://www.daisomall.co.kr/pd/pdr/SCR_PDR_0001?pdNo=1044144');
    for (const id of ['', 'abc', '-1', '12x', '1'.repeat(21)]) {
      expect(productKey(`https://www.daisomall.co.kr${path}?pdNo=${id}`)).toBeNull();
      expect(canonicalProductUrl(`https://www.daisomall.co.kr${path}?pdNo=${id}`)).toBeNull();
    }
  });
}
