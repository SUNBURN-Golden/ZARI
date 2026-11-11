import { describe, expect, it } from 'vitest';
import { acceptLlmDims, canonicalItems, dimsFromOcrText, dimsFromPageText, mergeItem, packFromText, publishGate } from '../lib.ts';
import { normalize } from '../config.ts';

describe('dimension text rules', () => {
  it('reads the official name triple as W x D x H', () => {
    expect(dimsFromPageText('직사각 바구니 2호 8 X 32 X 12 cm', '')?.dims).toMatchObject({ width: '8', depth: '32', height: '12', unit: 'cm', confidence: 'low' });
  });
  it('reads an option line only when it names this product, never reviews', () => {
    const text = '직사각바구니4호(약24x32x12 cm)\n좋아요 10x10x10cm 샀어요!';
    expect(dimsFromPageText('직사각바구니 4호', text)?.how).toBe('option');
    expect(dimsFromPageText('다른 상품', text)).toBeNull();
  });
  it('prefers a labelled outer size and skips inner sizes in OCR text', () => {
    const r = dimsFromOcrText('서랍 크기 20 x 30 x 8 cm\n제품 크기 : 22 x 31 x 10 cm');
    expect(r.dims).toMatchObject({ width: '22', depth: '31', height: '10' });
    expect(r.dims?.rawText.startsWith('[image-OCR]')).toBe(true);
  });
  it('flags several triples as ambiguous for the LLM', () => {
    expect(dimsFromOcrText('사이즈 10 x 20 x 30 cm\n15 x 25 x 35 cm').ambiguous).toBe(true);
  });
  it('keeps an LLM answer only with verbatim evidence holding every number', () => {
    const text = '규격 약 45 x 24 x 0.4cm';
    expect(acceptLlmDims(text, { evidence: '45 x 24 x 0.4cm', width: '45', depth: '24', height: '0.4', unit: 'cm' })).toMatchObject({ height: '0.4' });
    expect(acceptLlmDims(text, { evidence: '45 x 24 x 0.4cm', width: '45', depth: '24', height: '5', unit: 'cm' })).toBeNull();
    expect(acceptLlmDims(text, { evidence: '46 x 24', width: '46', depth: '24', height: '1', unit: 'cm' })).toBeNull();
    expect(acceptLlmDims(text, { abstain: true })).toBeNull();
  });
});

describe('pack quantity evidence', () => {
  it('name first, then detail, then the single-unit price line', () => {
    expect(packFromText('논슬립 스틸 고리 옷걸이 5P 블루', [], '')).toMatchObject({ value: 5, basis: 'confirmed' });
    expect(packFromText('테이블 캐리어', [], '구성 : 1P')).toMatchObject({ value: 1 });
    expect(packFromText('브릭스 멀티 바스켓 1호', ['상품구성 바구니 1개'], '')).toMatchObject({ value: 1 });
    expect(packFromText('클리어 정리함 1호', ['1개씩 구매'], '')).toMatchObject({ value: 1, evidence: '페이지 "1개씩 구매" 기본가' });
    expect(packFromText('투명 수납함 대', [], '')).toBeNull();
    expect(packFromText('3단 서랍장', [], '')).toBeNull();
  });
});

describe('carry-over and gates', () => {
  const crawled = { id: 'crawl:daiso:1', name: 'x', priceText: '1000 KRW', dimensions: { width: null } };
  const prevDims = { rawText: '[image-OCR] 22 x 31 x 80', width: '22', depth: '31', height: '80', unit: 'cm' as const, confidence: 'low' as const };
  it('keeps published dimensions and a confirmed pack value', () => {
    const out = mergeItem(crawled, { id: 'crawl:daiso:1', dimensions: prevDims, packQuantity: { value: 2, basis: 'confirmed', evidence: 'e' }, categoryHint: 'bin' },
      { dims: { ...prevDims, width: '99' }, pack: { value: 1, basis: 'confirmed', evidence: 'n' }, categoryHint: 'other' });
    expect(out).toMatchObject({ dimensions: { width: '22' }, packQuantity: { value: 2 }, categoryHint: 'bin', status: 'unconfirmed' });
  });
  it('fills a missing or reference pack value from fresh evidence; drops items without size', () => {
    const out = mergeItem(crawled, { id: 'crawl:daiso:1', dimensions: prevDims, packQuantity: { value: 1, basis: 'reference', evidence: 'r' } }, { dims: null, pack: { value: 3, basis: 'confirmed', evidence: 'n' }, categoryHint: 'bin' });
    expect(out?.packQuantity).toMatchObject({ value: 3 });
    expect(mergeItem(crawled, undefined, { dims: null, pack: null, categoryHint: 'bin' })).toBeNull();
  });
  it('compares bundles ignoring order and fetch time', () => {
    expect(canonicalItems([{ id: 'b', fetchedAt: '1' }, { id: 'a', x: 1 }])).toBe(canonicalItems([{ x: 1, id: 'a' }, { id: 'b', fetchedAt: '2' }]));
  });
  it('refuses to publish on block, error spike, validator codes or >20% drop', () => {
    const base = { liveCount: 38, newCount: 38, reviewCodes: [], quarantined: false, rejected: 0, blocked: [], pages: 10, errors: 0, maxDropRatio: 0.2 };
    expect(publishGate(base).ok).toBe(true);
    expect(publishGate({ ...base, blocked: ['www.daisomall.co.kr'] }).ok).toBe(false);
    expect(publishGate({ ...base, errors: 4 }).ok).toBe(false);
    expect(publishGate({ ...base, reviewCodes: ['x'] }).ok).toBe(false);
    expect(publishGate({ ...base, newCount: 30 }).ok).toBe(false);
    expect(publishGate({ ...base, newCount: 31 }).ok).toBe(true);
  });
  it('never lets the config go below the 30 s delay or past the caps', () => {
    const c = normalize({ minIntervalMs: 1000, pagesPerRun: 999, categories: ['https://evil.example/ds/'] });
    expect(c.minIntervalMs).toBe(30000);
    expect(c.pagesPerRun).toBe(100);
    expect(c.categories[0]).toContain('daisomall.co.kr/ds/');
  });
});
