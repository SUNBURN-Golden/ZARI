import { describe, expect, it } from 'vitest';
import { parseDimensionBlocks, parseSegment } from '../lib/dimensions.js';

const dims = (text) => parseSegment(text).dimensions;

describe('labelled dimensions', () => {
  it('keeps the page unit and raw text', () => {
    expect(dims('가로 80cm x 세로 30cm x 높이 120cm')).toEqual({
      rawText: '가로 80cm x 세로 30cm x 높이 120cm', width: '80', depth: '30', height: '120', unit: 'cm', confidence: 'high',
    });
    expect(dims('너비 1,200mm 깊이 300mm 높이 1,800mm')).toMatchObject({ width: '1200', depth: '300', height: '1800', unit: 'mm', confidence: 'high' });
    expect(dims('W 60 D 40 H 90 (cm)')).toMatchObject({ width: '60', depth: '40', height: '90', unit: 'cm', confidence: 'high' });
    expect(dims('사이즈(가로x세로x높이): 80x30x120cm')).toMatchObject({ width: '80', depth: '30', height: '120', unit: 'cm', confidence: 'high' });
  });
  it('writes a shared trailing unit only when it is written once', () => {
    expect(dims('가로 80 x 세로 30 x 높이 120 cm')).toMatchObject({ unit: 'cm', confidence: 'high' });
  });
  it('does not convert units', () => {
    expect(dims('가로 1.2m 세로 0.4m 높이 0.9m')).toMatchObject({ width: '1.2', unit: 'm', confidence: 'high' });
  });
});

describe('what is never guessed', () => {
  const lowEmpty = (text, flag) => {
    const { dimensions, flags } = parseSegment(text);
    expect(dimensions).toMatchObject({ width: null, depth: null, height: null, unit: null, confidence: 'low' });
    expect(flags).toContain(flag);
  };
  it('unlabeled triples stay unassigned', () => lowEmpty('80 x 30 x 120 cm', 'unlabeled_triple'));
  it('missing unit stays unknown', () => lowEmpty('가로 80 x 세로 30 x 높이 120', 'unit_missing'));
  it('round products do not get a width/depth', () => lowEmpty('지름 40cm 높이 70cm', 'round'));
  it('ranges are not a value', () => lowEmpty('가로 80~100cm 세로 30cm 높이 120cm', 'range'));
  it('mixed units are not converted', () => lowEmpty('가로 800mm 세로 30cm 높이 1.2m', 'mixed_units'));
  it('a repeated axis is ambiguous', () => lowEmpty('가로 80cm 가로 90cm 높이 10cm', 'axis_repeated'));
  it('text without digits is unparsed', () => {
    expect(dims('치수는 상세 이미지를 참고하세요')).toMatchObject({ confidence: 'unparsed', width: null });
  });
  it('two labelled axes are medium, one axis is low, neither claims the missing axis', () => {
    expect(dims('가로 80cm 높이 120cm')).toMatchObject({ width: '80', depth: null, height: '120', confidence: 'medium' });
    expect(dims('너비: 80 cm')).toMatchObject({ width: '80', depth: null, height: null, confidence: 'low' });
  });
});

describe('outer vs inner', () => {
  it('inner text is never read as the outer size', () => {
    const { dimensions, flags } = parseSegment('내부 가로 36cm 세로 25cm 높이 12cm');
    expect(dimensions).toMatchObject({ width: null, depth: null, height: null, confidence: 'unparsed' });
    expect(flags).toContain('inner_ignored');
  });
  it('outer is taken from the outer clause only', () => {
    expect(dims('외경 가로 40cm 세로 30cm 높이 20cm; 내경 가로 36cm 세로 26cm 높이 18cm')).toMatchObject({ width: '40', height: '20', confidence: 'high' });
    expect(dims('가로 40cm 세로 30cm 높이 20cm / 내부 가로 36cm')).toMatchObject({ width: '40', confidence: 'high' });
  });
});

describe('options', () => {
  it('keeps different options as different blocks', () => {
    const blocks = parseDimensionBlocks(['소형: 가로 30cm x 세로 20cm x 높이 15cm', '대형: 가로 45cm x 세로 30cm x 높이 25cm']);
    expect(blocks.map((b) => [b.optionLabel, b.dimensions.width])).toEqual([['소형', '30'], ['대형', '45']]);
  });
  it('merges single-axis lines of one product, but not conflicting repeats', () => {
    const one = parseDimensionBlocks(['너비: 77 cm', '깊이: 39 cm', '높이: 147 cm']);
    expect(one).toHaveLength(1);
    expect(one[0].dimensions).toMatchObject({ width: '77', depth: '39', height: '147', confidence: 'high' });
    const clash = parseDimensionBlocks(['가로 80cm x 세로 30cm x 높이 120cm', '가로 100cm x 세로 30cm x 높이 120cm']);
    expect(clash).toHaveLength(1);
    expect(clash[0].dimensions).toMatchObject({ confidence: 'low', width: null });
    expect(clash[0].flags).toContain('option_ambiguous');
  });
  it('generic labels such as 사이즈 are not options', () => {
    const blocks = parseDimensionBlocks(['사이즈: 가로 80cm 세로 30cm 높이 120cm']);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].optionLabel).toBeNull();
  });
  it('no dimension text at all is one unparsed block', () => {
    expect(parseDimensionBlocks(['소재: 스틸'])[0].dimensions.confidence).toBe('unparsed');
  });
});
