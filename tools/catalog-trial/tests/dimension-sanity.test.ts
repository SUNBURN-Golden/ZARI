import { expect, it } from 'vitest';
import { saneDimensions } from '../dimension-sanity.ts';
it('requires bounded values and literal evidence containing all dimensions', () => {
  const text = '제품 크기: W26 × D18 × H18 cm';
  const p = { width: 26, depth: 18, height: 18, evidence: text };
  expect(saneDimensions(text, p)?.confidence).toBe('llm');
  expect(saneDimensions(text, { ...p, width: 301 })).toBeNull();
  expect(saneDimensions(text, { ...p, width: 0.4 })).toBeNull();
  expect(saneDimensions(text, { ...p, width: 27 })).toBeNull();
  expect(saneDimensions(text, { ...p, width: Number.NaN })).toBeNull();
  expect(saneDimensions(text, { ...p, width: null })).toBeNull();
  expect(saneDimensions(text, { ...p, evidence: '' })).toBeNull();
  expect(saneDimensions('외경 W0.5 D300 H18 cm', { width: 0.5, depth: 300, height: 18, evidence: '외경 W0.5 D300 H18 cm' })?.depth).toBe('300');
  expect(saneDimensions(text, { ...p, evidence: 'W26 D18 H18 cm' })).toBeNull();
  expect(saneDimensions('내경 26 18 18 cm', { ...p, evidence: '내경 26 18 18 cm' })).toBeNull();
  expect(saneDimensions('외경 W260 D180 H180 mm', { ...p, evidence: '외경 W260 D180 H180 mm' })?.width).toBe('26');
});
