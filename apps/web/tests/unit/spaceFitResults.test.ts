import { describe, expect, it } from 'vitest';
import type { SpaceFitBlock, SpaceFitCandidate, SpaceFitPrice } from '../../src/contracts/generated/dto';
import {
  candidateTitle,
  displayName,
  compareCandidates,
  distinctMeta,
  isReferencePrice,
  mergeCandidates,
  placementText,
  priceLine,
  remainingText,
  sellerLabel,
  totalQuantityText,
} from '../../src/features/space-fit/results';

function makeBlock(overrides: Partial<SpaceFitBlock> = {}): SpaceFitBlock {
  return {
    variantId: 'crawl:muji:1:o00000001',
    name: '합성 수납함 o00000001',
    orientation: 'upright0',
    unitMm: [200, 150, 100],
    grid: [1, 1, 1],
    originMm: [0, 0, 0],
    quantity: '1',
    urls: ['https://mujikorea.co.kr/products/1'],
    source: 'muji',
    sellerId: 'seller-muji',
    category: { hint: 'bin', label: null },
    price: { state: 'unknown' },
    dimensions: { provenance: 'reference', basis: 'high', origin: 'pageText' },
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<SpaceFitCandidate> = {}): SpaceFitCandidate {
  return {
    id: 'sf-0',
    blocks: [makeBlock()],
    remainingMm: [100, 100, 100],
    occupiedVolumeMm3: '1000',
    unconfirmed: true,
    dimensionProvenance: 'reference',
    checks: {
      outer: 'unknown',
      inner: 'not_applicable',
      installation: 'unknown',
      opening: 'unknown',
      access: 'unknown',
      supportLoad: 'unknown',
      orientation: 'unknown',
      quantity: 'pass',
      tolerance: 'unknown',
    },
    ...overrides,
  };
}

const knownPrice = (overrides: Partial<Extract<SpaceFitPrice, { state: 'known' }>> = {}): SpaceFitPrice => ({
  state: 'known',
  packPriceKrw: '10000',
  packQuantity: '2',
  unitPriceKrw: '5000',
  basis: 'confirmed',
  ...overrides,
});

describe('space-fit result ordering', () => {
  it('orders by occupied volume descending as BigInt, then confirmed, then id', () => {
    // These two volumes both exceed Number.MAX_SAFE_INTEGER only in a different
    // setup; here they prove the comparison never rounds through Number.
    const referenceLarge = makeCandidate({ id: 'sf-2', occupiedVolumeMm3: '9007199254740993', dimensionProvenance: 'reference' });
    const confirmedLarge = makeCandidate({ id: 'sf-1', occupiedVolumeMm3: '9007199254740993', dimensionProvenance: 'confirmed' });
    const confirmedFirst = makeCandidate({ id: 'sf-0', occupiedVolumeMm3: '9007199254740993', dimensionProvenance: 'confirmed' });
    const smaller = makeCandidate({ id: 'sf-9', occupiedVolumeMm3: '9007199254740992', dimensionProvenance: 'confirmed' });
    const merged = mergeCandidates([referenceLarge, smaller], [confirmedLarge, confirmedFirst]);
    expect(merged.map((candidate) => candidate.id)).toEqual(['sf-0', 'sf-1', 'sf-2', 'sf-9']);
  });

  it('compares without coercing the volume text through Number', () => {
    expect(compareCandidates(
      makeCandidate({ occupiedVolumeMm3: '18446744073709551616' }),
      makeCandidate({ occupiedVolumeMm3: '18446744073709551615' }),
    )).toBe(-1);
  });
});

describe('space-fit counts and titles', () => {
  it('sums block quantities without losing precision', () => {
    const candidate = makeCandidate({
      blocks: [makeBlock({ quantity: '9007199254740993' }), makeBlock({ quantity: '1', variantId: 'other' })],
    });
    expect(totalQuantityText(candidate)).toBe('9007199254740994');
  });

  it('strips the option token and joins combo blocks', () => {
    const candidate = makeCandidate({
      blocks: [
        makeBlock({ name: '합성 수납함 (소형) o1aa33fda', quantity: '2' }),
        makeBlock({ name: '합성 수납함 (대형) oe920d1be', quantity: '1', variantId: 'other' }),
      ],
    });
    expect(candidateTitle(candidate)).toBe('합성 수납함 (소형) 2개 + 합성 수납함 (대형) 1개');
  });
});

describe('space-fit price line', () => {
  it('rounds up to whole packs and formats each amount', () => {
    const line = priceLine(makeBlock({ quantity: '3', price: knownPrice() }));
    expect(line).toEqual({ kind: 'priced', text: '한 개 5,000원 · 다 해서 20,000원' });
  });

  it('uses the contract pack price for a single unit', () => {
    const line = priceLine(makeBlock({ quantity: '1', price: knownPrice({ packQuantity: '1', packPriceKrw: '19900', unitPriceKrw: '19900' }) }));
    expect(line.text).toBe('한 개 19,900원 · 다 해서 19,900원');
  });

  it('keeps the price copy when pack quantity, unit price or the price itself is unknown', () => {
    const unknown = '가격은 파는 곳에서 봐 주세요';
    expect(priceLine(makeBlock({ price: { state: 'unknown' } }))).toEqual({ kind: 'unknown', text: unknown });
    expect(priceLine(makeBlock({ price: knownPrice({ packQuantity: null, unitPriceKrw: null }) }))).toEqual({ kind: 'unknown', text: unknown });
    expect(priceLine(makeBlock({ price: knownPrice({ packQuantity: '0', unitPriceKrw: null }) }))).toEqual({ kind: 'unknown', text: unknown });
  });

  it('flags only known reference prices', () => {
    expect(isReferencePrice(makeBlock({ price: knownPrice({ basis: 'reference' }) }))).toBe(true);
    expect(isReferencePrice(makeBlock({ price: knownPrice({ basis: 'confirmed' }) }))).toBe(false);
    expect(isReferencePrice(makeBlock({ price: { state: 'unknown' } }))).toBe(false);
  });
});

describe('space-fit display helpers', () => {
  it('maps only the approved seller names', () => {
    expect(sellerLabel('muji')).toBe('무인양품');
    expect(sellerLabel('daiso')).toBe('다이소');
    expect(sellerLabel('ikea')).toBeNull();
    expect(sellerLabel(null)).toBeNull();
  });

  it('lists one meta entry per distinct seller and category', () => {
    const candidate = makeCandidate({
      blocks: [
        makeBlock({ category: { hint: 'bin', label: '수납함' } }),
        makeBlock({ category: { hint: 'bin', label: '수납함' }, variantId: 'same' }),
        makeBlock({ source: 'daiso', category: { hint: 'bin', label: '정리함' }, variantId: 'other' }),
      ],
    });
    expect(distinctMeta(candidate)).toEqual([
      { seller: '무인양품', category: '수납함' },
      { seller: '다이소', category: '정리함' },
    ]);
  });

  it('formats remaining space and the placement text from the existing copy', () => {
    expect(remainingText(makeCandidate({ remainingMm: [100, 0, 25] }))).toBe('가로로 10cm 남아요 · 깊이로 0cm 남아요 · 높이로 2.5cm 남아요');
    expect(placementText(makeBlock({ grid: [2, 3, 1], orientation: 'upright90' }))).toBe('옆으로 2개, 앞뒤로 3줄 · 옆으로 돌려 놓아요 · 20 × 15 × 10cm');
    expect(placementText(makeBlock({ grid: [1, 1, 2] }))).toBe('옆으로 1개, 앞뒤로 1줄, 2단으로 쌓기 · 20 × 15 × 10cm');
  });
});

describe('displayName', () => {
  it('drops the crawler option token and the default-option placeholder only at the end', () => {
    expect(displayName('접이식 수납함 26 L 기본')).toBe('접이식 수납함 26 L');
    expect(displayName('수납함 o1a2b3c4d')).toBe('수납함');
    expect(displayName('기본 수납함 대')).toBe('기본 수납함 대');
  });
});
