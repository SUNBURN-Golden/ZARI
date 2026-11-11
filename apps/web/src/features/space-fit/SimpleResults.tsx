import { useEffect, useRef, useState } from 'react';
import type { SpaceFitBlock, SpaceFitCandidate } from '../../contracts/generated/dto';
import { displayName, isReferencePrice, priceLine, rowTitle, sellerLabel, SPACE_FIT_COPY, totalQuantityText } from './results';
import { sketchFor } from './sketches';

/** First page sizes; later pages use the same step (existing 더 보기 pattern). */
export const FIRST_SINGLES = 6;
export const FIRST_COMBOS = 3;

function sizeText(block: SpaceFitBlock): string {
  return `${block.unitMm.map((mm) => mm / 10).join(' × ')}cm`;
}

function Picture({ block }: { block: SpaceFitBlock }) {
  const src = sketchFor(block.variantId);
  // Decorative: the card title names the product.
  if (src) return <img className="sf-pic" src={src} alt="" width={120} height={120} loading="lazy" decoding="async" />;
  return <svg className="sf-pic sf-pic-empty" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <path d="M24 46 L60 30 L96 46 L96 86 L60 100 L24 86 Z M24 46 L60 62 L96 46 M60 62 L60 100" />
  </svg>;
}

function Card({ candidate }: { candidate: SpaceFitCandidate }) {
  const blocks = candidate.blocks;
  const distinct = blocks.filter((block, index) => blocks.findIndex((other) => other.variantId === block.variantId) === index);
  const prices = distinct.map(priceLine);
  const allUnknown = prices.every((line) => line.kind === 'unknown');
  const reference = distinct.some((block, index) => prices[index]!.kind !== 'unknown' && isReferencePrice(block));
  return <li className="sf-card" data-card-id={candidate.id} tabIndex={-1}>
    <div className="sf-pics">{distinct.slice(0, 2).map((block) => <Picture key={block.variantId} block={block} />)}</div>
    <div className="sf-body">
      <h3 className="sf-name">{rowTitle(candidate)}</h3>
      <p className="sf-count">수납함 {totalQuantityText(candidate)}개가 딱 들어가요</p>
      {distinct.map((block, index) => <div className="sf-item" key={block.variantId}>
        {distinct.length > 1 && <p className="sf-item-name">{displayName(block.name)}</p>}
        <p className="sf-size">{sizeText(block)}</p>
        {(!allUnknown || index === 0) && <p className="sf-price">{prices[index]!.text}</p>}
      </div>)}
      {reference && <p className="sf-note">{SPACE_FIT_COPY.referencePriceNote}</p>}
      <div className="sf-links">{distinct.flatMap((block) => block.urls.slice(0, 1).map((url) => {
        const seller = sellerLabel(block.source);
        const name = distinct.length > 1 ? `${displayName(block.name)} ` : '';
        return <a key={`${block.variantId}|${url}`} className="sf-link" href={url} target="_blank" rel="noopener noreferrer">
          {seller && <span className="sf-seller">{seller}</span>}
          <span>{name}판매처에서 보기 (새 탭)</span>
        </a>;
      }))}</div>
    </div>
  </li>;
}

function focusCard(id: string) {
  const node = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`);
  node?.focus();
}

/**
 * Every placement stays a card (no collapse by product). Singles and two-product
 * combinations keep separate lists and 더 보기 controls, with distinct accessible names.
 */
export function SimpleResults({ candidates }: { candidates: SpaceFitCandidate[] }) {
  const [singleLimit, setSingleLimit] = useState(FIRST_SINGLES);
  const [comboLimit, setComboLimit] = useState(FIRST_COMBOS);
  const pendingFocus = useRef<string | null>(null);
  const singles = candidates.filter((candidate) => candidate.blocks.length === 1);
  const combos = candidates.filter((candidate) => candidate.blocks.length > 1);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    focusCard(id);
  }, [singleLimit, comboLimit]);

  const showMoreSingles = () => {
    pendingFocus.current = singles[singleLimit]?.id ?? null;
    setSingleLimit((n) => n + FIRST_SINGLES);
  };
  const showMoreCombos = () => {
    pendingFocus.current = combos[comboLimit]?.id ?? null;
    setComboLimit((n) => n + FIRST_COMBOS);
  };

  return <>
    {singles.length > 0 && <ul className="sf-cards" aria-label="찾은 수납함">{singles.slice(0, singleLimit).map((candidate) => <Card key={candidate.id} candidate={candidate} />)}</ul>}
    {singles.length > singleLimit && <button type="button" className="sf-more" aria-label="수납함 더 보기" onClick={showMoreSingles}>더 보기</button>}
    {combos.length > 0 && <section className="sf-combos" aria-labelledby="sf-combos-title">
      <h2 id="sf-combos-title" className="sf-section-title">조합</h2>
      <ul className="sf-cards">{combos.slice(0, comboLimit).map((candidate) => <Card key={candidate.id} candidate={candidate} />)}</ul>
      {combos.length > comboLimit && <button type="button" className="sf-more" aria-label="조합 더 보기" onClick={showMoreCombos}>더 보기</button>}
    </section>}
  </>;
}
