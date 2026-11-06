import { expect, it } from 'vitest';
import { allowedDaiso } from '../trial-daiso-category.ts';

it('restricts requests to the approved Daiso paths even when robots allows more', () => {
  const rules = { rules: [], crawlDelaySec: 30 };
  const url = (path: string) => new URL(path, 'https://www.daisomall.co.kr');
  expect(allowedDaiso(rules, url('/ds/exhCtgr/C208/CTGR_00016'))).toBe(true);
  expect(allowedDaiso(rules, url('/pd/pdr/detail?pdNo=123'))).toBe(true);
  for (const path of ['/pd/pdl/detail?pdNo=123', '/ev/evc/', '/or/', '/ds/../mb/', '/ds']) {
    expect(allowedDaiso(rules, url(path))).toBe(false);
  }
  expect(allowedDaiso(rules, new URL('https://other.example/ds/'))).toBe(false);
  expect(allowedDaiso(rules, new URL('http://www.daisomall.co.kr/ds/'))).toBe(false);
  expect(allowedDaiso({ rules: [{ allow: false, pattern: '/ds/' }], crawlDelaySec: 30 }, url('/ds/category'))).toBe(false);
});
