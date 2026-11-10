import type { CrawlSite, SpaceFitBlock, SpaceFitCandidate } from '../../contracts/generated/dto';

export const UNKNOWN_PRICE_COPY = '가격은 파는 곳에서 봐 주세요';
export const REFERENCE_BADGE_COPY = '참고치';
export const REFERENCE_NOTE_COPY =
  '참고치는 사진이나 이름에서 찾은 크기라 사기 전에 파는 곳에서 한 번 더 봐 주세요';

const AXIS_LABELS = ['가로', '깊이', '높이'] as const;
const OPTION_SUFFIX = /\s+o[0-9a-f]{8}$/;
// catalog_bundle names an option-less crawled item's option '기본'; it is a
// placeholder, not part of the product name.
const DEFAULT_OPTION_SUFFIX = /\s+기본$/;
const KRW = new Intl.NumberFormat('ko-KR');

/** Strip the crawler's option token from the display name. */
export function displayName(name: string): string {
  return name.replace(OPTION_SUFFIX, '').replace(DEFAULT_OPTION_SUFFIX, '');
}

/** A combo is titled as `{name} {quantity}개 + …`, using display names. */
export function candidateTitle(candidate: SpaceFitCandidate): string {
  return candidate.blocks
    .map((block) => `${displayName(block.name)} ${block.quantity}개`)
    .join(' + ');
}

/** Sum the block quantities without leaving the contract's BigInt-safe text. */
export function totalQuantity(candidate: SpaceFitCandidate): bigint {
  return candidate.blocks.reduce((sum, block) => sum + BigInt(block.quantity), 0n);
}

export function totalQuantityText(candidate: SpaceFitCandidate): string {
  return totalQuantity(candidate).toString();
}

/**
 * Least leftover space first: occupied volume descending (BigInt), then
 * confirmed dimensions before reference ones, then the stable candidate id.
 */
export function compareCandidates(a: SpaceFitCandidate, b: SpaceFitCandidate): number {
  const volumeA = BigInt(a.occupiedVolumeMm3);
  const volumeB = BigInt(b.occupiedVolumeMm3);
  if (volumeA !== volumeB) return volumeA > volumeB ? -1 : 1;
  const provenanceA = a.dimensionProvenance === 'confirmed' ? 0 : 1;
  const provenanceB = b.dimensionProvenance === 'confirmed' ? 0 : 1;
  if (provenanceA !== provenanceB) return provenanceA - provenanceB;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Singles and combinations share one list. */
export function mergeCandidates(
  singles: SpaceFitCandidate[],
  combinations: SpaceFitCandidate[],
): SpaceFitCandidate[] {
  return [...singles, ...combinations].sort(compareCandidates);
}

export interface PriceLine {
  kind: 'priced' | 'unknown';
  text: string;
}

function formatKrw(value: bigint): string {
  return KRW.format(value);
}

/**
 * Price is shown only when the pack price, pack quantity and unit price are
 * all known. The total is ceil(quantity / packQuantity) packs, never guessed.
 */
export function priceLine(block: SpaceFitBlock): PriceLine {
  const price = block.price;
  if (price.state === 'known' && price.packQuantity !== null && price.unitPriceKrw !== null) {
    const packQuantity = BigInt(price.packQuantity);
    if (packQuantity > 0n) {
      const quantity = BigInt(block.quantity);
      const packs = (quantity + packQuantity - 1n) / packQuantity;
      const total = packs * BigInt(price.packPriceKrw);
      return {
        kind: 'priced',
        text: `한 개 ${formatKrw(BigInt(price.unitPriceKrw))}원 · 다 해서 ${formatKrw(total)}원`,
      };
    }
  }
  // copy-todo: pack-price line (판매처 표시가 {가격}원, 묶음 수량 미확인) needs Argon approval
  return { kind: 'unknown', text: UNKNOWN_PRICE_COPY };
}

/** Reference prices (crawled listing text) get the same badge as reference sizes. */
export function isReferencePrice(block: SpaceFitBlock): boolean {
  return block.price.state === 'known' && block.price.basis === 'reference';
}

/** Only the two sellers with approved Korean names are shown. */
export function sellerLabel(source: CrawlSite | null): string | null {
  if (source === 'muji') return '무인양품';
  if (source === 'daiso') return '다이소';
  return null;
}

export interface DistinctMeta {
  seller: string | null;
  category: string | null;
}

/** One meta entry per distinct seller/category pair, in block order. */
export function distinctMeta(candidate: SpaceFitCandidate): DistinctMeta[] {
  const seen = new Set<string>();
  const entries: DistinctMeta[] = [];
  for (const block of candidate.blocks) {
    const seller = sellerLabel(block.source);
    const category = block.category.label?.trim() || null;
    if (seller === null && category === null) continue;
    const key = `${seller ?? ''}\u0000${category ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ seller, category });
  }
  return entries;
}

export function remainingText(candidate: SpaceFitCandidate): string {
  return candidate.remainingMm
    .map((mm, index) => `${AXIS_LABELS[index] ?? ''}로 ${mm / 10}cm 남아요`)
    .join(' · ');
}

export function placementText(block: SpaceFitBlock): string {
  const [across, deep, stacked] = block.grid;
  let text = `옆으로 ${across ?? 0}개, 앞뒤로 ${deep ?? 0}줄`;
  if ((stacked ?? 0) > 1) text += `, ${stacked}단으로 쌓기`;
  if (block.orientation === 'upright90') text += ' · 옆으로 돌려 놓아요';
  const size = block.unitMm.map((mm) => mm / 10).join(' × ');
  return `${text} · ${size}cm`;
}
