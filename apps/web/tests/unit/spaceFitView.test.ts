import { describe, expect, it } from 'vitest';
import type { SpaceFitBlock, SpaceFitCandidate, SpaceFitPrice } from '../../src/contracts/generated/dto';
import {
  DEFAULT_VIEW,
  candidateTotalPrice,
  facetOptions,
  filterCandidates,
  isMixed,
  parseViewState,
  serializeViewState,
  sortCandidates,
} from '../../src/features/space-fit/view';

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

describe('space-fit view state', () => {
  it('defaults without a query and serializes the default view as the path alone', () => {
    expect(parseViewState('#/space-fit')).toEqual(DEFAULT_VIEW);
    expect(parseViewState('#/')).toEqual(DEFAULT_VIEW);
    expect(serializeViewState('#/space-fit', DEFAULT_VIEW)).toBe('#/space-fit');
  });

  it('round-trips sort, sellers and types in canonical key order', () => {
    const view = { sellers: ['muji', 'daiso'], types: ['수납함'], sort: 'price' as const };
    const hash = serializeViewState('#/', view);
    expect(hash).toBe('#/?sort=price&seller=muji,daiso&type=%EC%88%98%EB%82%A9%ED%95%A8');
    expect(parseViewState(hash)).toEqual(view);
  });

  it('omits defaults and ignores unknown or duplicate values', () => {
    expect(parseViewState('#/?sort=bogus&seller=muji,ikea,muji&type=수납함,,수납함')).toEqual({
      sellers: ['muji'],
      types: ['수납함'],
      sort: 'leftover',
    });
    const view = { sellers: ['daiso'], types: ['정리함'], sort: 'count' as const };
    const hash = serializeViewState('#/space-fit', view);
    expect(hash).toBe('#/space-fit?sort=count&seller=daiso&type=%EC%A0%95%EB%A6%AC%ED%95%A8');
    expect(parseViewState(hash)).toEqual(view);
  });
});

describe('space-fit filtering', () => {
  const muji = makeCandidate({
    id: 'muji',
    blocks: [makeBlock({ variantId: 'v-muji', source: 'muji', category: { hint: 'bin', label: '수납함' } })],
  });
  const daiso = makeCandidate({
    id: 'daiso',
    blocks: [makeBlock({ variantId: 'v-daiso', source: 'daiso', category: { hint: 'bin', label: '정리함' } })],
  });
  const both = makeCandidate({
    id: 'both',
    blocks: [
      makeBlock({ variantId: 'v-muji', source: 'muji', category: { hint: 'bin', label: '수납함' } }),
      makeBlock({ variantId: 'v-daiso', source: 'daiso', category: { hint: 'bin', label: '정리함' } }),
    ],
  });
  const unrelated = makeCandidate({
    id: 'unrelated',
    blocks: [makeBlock({ variantId: 'v-ikea', source: 'ikea', category: { hint: 'bin', label: null } })],
  });
  const all = [muji, daiso, both, unrelated];

  it('treats an empty group as unfiltered', () => {
    expect(filterCandidates(all, DEFAULT_VIEW)).toEqual(all);
  });

  it('matches when any block matches the seller or type filter', () => {
    expect(filterCandidates(all, { sellers: ['muji'], types: [], sort: 'leftover' })).toEqual([muji, both]);
    expect(filterCandidates(all, { sellers: [], types: ['정리함'], sort: 'leftover' })).toEqual([daiso, both]);
    expect(filterCandidates(all, { sellers: ['muji'], types: ['정리함'], sort: 'leftover' })).toEqual([both]);
  });

  it('compares trimmed category labels', () => {
    const padded = makeCandidate({
      id: 'padded',
      blocks: [makeBlock({ variantId: 'v-padded', source: 'daiso', category: { hint: 'bin', label: ' 정리함 ' } })],
    });
    expect(filterCandidates([padded], { sellers: [], types: ['정리함'], sort: 'leftover' })).toEqual([padded]);
  });
});

describe('space-fit ordering', () => {
  const priced = (id: string, priceKrw: string, quantity = '1', volume = '1000'): SpaceFitCandidate =>
    makeCandidate({
      id,
      occupiedVolumeMm3: volume,
      blocks: [makeBlock({
        variantId: `v-${id}`,
        quantity,
        price: knownPrice({ packQuantity: '1', packPriceKrw: priceKrw, unitPriceKrw: priceKrw }),
      })],
    });

  it('keeps the default leftover order', () => {
    const big = makeCandidate({ id: 'big', occupiedVolumeMm3: '2000' });
    const small = makeCandidate({ id: 'small', occupiedVolumeMm3: '1000' });
    expect(sortCandidates([small, big], 'leftover').map((candidate) => candidate.id)).toEqual(['big', 'small']);
  });

  it('sorts by total price ascending with unknown prices last and old tie-breaks', () => {
    const cheap = priced('cheap', '5000');
    const pricey = priced('pricey', '20000');
    const unknown = makeCandidate({ id: 'unknown' });
    expect(sortCandidates([pricey, unknown, cheap], 'price').map((candidate) => candidate.id))
      .toEqual(['cheap', 'pricey', 'unknown']);

    const tieBig = priced('tie-big', '20000', '1', '3000');
    const tieSmall = priced('tie-small', '20000', '1', '1000');
    expect(sortCandidates([tieSmall, tieBig], 'price').map((candidate) => candidate.id))
      .toEqual(['tie-big', 'tie-small']);
  });

  it('sorts by total quantity descending with the default tie-break', () => {
    const five = makeCandidate({ id: 'five', blocks: [makeBlock({ variantId: 'v-five', quantity: '5' })] });
    const three = makeCandidate({ id: 'three', blocks: [makeBlock({ variantId: 'v-three', quantity: '3' })] });
    const two = makeCandidate({ id: 'two', blocks: [makeBlock({ variantId: 'v-two', quantity: '2' })] });
    expect(sortCandidates([two, five, three], 'count').map((candidate) => candidate.id))
      .toEqual(['five', 'three', 'two']);

    const tieBig = makeCandidate({ id: 'tie-big', occupiedVolumeMm3: '2000', blocks: [makeBlock({ variantId: 'v-a', quantity: '2' })] });
    const tieSmall = makeCandidate({ id: 'tie-small', occupiedVolumeMm3: '1000', blocks: [makeBlock({ variantId: 'v-b', quantity: '2' })] });
    expect(sortCandidates([tieSmall, tieBig], 'count').map((candidate) => candidate.id))
      .toEqual(['tie-big', 'tie-small']);
  });

  it('never mutates the input array', () => {
    const input = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b', occupiedVolumeMm3: '2000' })];
    const before = input.map((candidate) => candidate.id);
    sortCandidates(input, 'leftover');
    expect(input.map((candidate) => candidate.id)).toEqual(before);
  });

  it('sums block prices with ceil packs and rejects any unknown block', () => {
    expect(candidateTotalPrice(makeCandidate({
      blocks: [makeBlock({ quantity: '3', price: knownPrice() })],
    }))).toBe(20000n);
    expect(candidateTotalPrice(makeCandidate({
      blocks: [makeBlock({ quantity: '3', price: knownPrice() }), makeBlock({ variantId: 'v-unknown', price: { state: 'unknown' } })],
    }))).toBeNull();
  });
});

describe('space-fit facets and mixed detection', () => {
  it('lists known sellers in approved order and Korean-sorted type labels', () => {
    const candidate = makeCandidate({
      blocks: [
        makeBlock({ variantId: 'v1', source: 'daiso', category: { hint: 'bin', label: '정리함' } }),
        makeBlock({ variantId: 'v2', source: 'muji', category: { hint: 'bin', label: ' 수납함 ' } }),
        makeBlock({ variantId: 'v3', source: 'ikea', category: { hint: 'bin', label: null } }),
        makeBlock({ variantId: 'v4', source: null, category: { hint: 'bin', label: null } }),
        makeBlock({ variantId: 'v5', source: 'daiso', category: { hint: 'bin', label: '정리함' } }),
      ],
    });
    expect(facetOptions([candidate])).toEqual({
      sellers: [
        { value: 'muji', label: '무인양품' },
        { value: 'daiso', label: '다이소' },
      ],
      types: ['수납함', '정리함'],
    });
  });

  it('detects mixed combos by distinct variant id', () => {
    expect(isMixed(makeCandidate({ blocks: [makeBlock({ variantId: 'same' }), makeBlock({ variantId: 'same' })] }))).toBe(false);
    expect(isMixed(makeCandidate({ blocks: [makeBlock({ variantId: 'a' }), makeBlock({ variantId: 'b' })] }))).toBe(true);
    expect(isMixed(makeCandidate({ blocks: [makeBlock()] }))).toBe(false);
  });
});
