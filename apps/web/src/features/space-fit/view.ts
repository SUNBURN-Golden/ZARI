import type { SpaceFitCandidate } from '../../contracts/generated/dto';
import { blockTotalKrw, compareCandidates, sellerLabel, totalQuantity } from './results';

/**
 * Client-side view over the candidates the Rust worker already returned.
 * Nothing here computes fit or geometry: filtering and ordering only reuse the
 * worker's candidates and their reported fields.
 */
export type SortKey = 'leftover' | 'price' | 'count';

export interface ViewState {
  /** CrawlSite values such as 'muji' and 'daiso'; empty means every seller. */
  sellers: string[];
  /** Trimmed category labels; empty means every type. */
  types: string[];
  sort: SortKey;
}

export const DEFAULT_VIEW: ViewState = { sellers: [], types: [], sort: 'leftover' };

const SORT_KEYS: readonly SortKey[] = ['leftover', 'price', 'count'];
/** Approved seller order; facetOptions keeps only those present. */
const SELLER_ORDER = ['muji', 'daiso'] as const;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Comma lists are split on the RAW query value before decoding, so a label
 * that itself contains a comma (written as %2C) survives the round trip.
 */
function rawList(query: string, key: string): string[] {
  const values: string[] = [];
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== key) continue;
    for (const part of pair.slice(eq + 1).split(',')) {
      try { values.push(decodeURIComponent(part.replace(/\+/g, ' ')).trim()); } catch { /* Malformed escapes are ignored. */ }
    }
  }
  return unique(values.filter(Boolean));
}

/** Read the query part after '?' in a hash such as `#/space-fit?sort=price&seller=muji`. */
export function parseViewState(hash: string): ViewState {
  const index = hash.indexOf('?');
  if (index < 0) return { sellers: [], types: [], sort: 'leftover' };
  const query = hash.slice(index + 1);
  const rawSort = new URLSearchParams(query).get('sort');
  const sort = SORT_KEYS.find((key) => key === rawSort) ?? 'leftover';
  return {
    sellers: rawList(query, 'seller').filter((item) => sellerLabel(item as Parameters<typeof sellerLabel>[0]) !== null),
    types: rawList(query, 'type'),
    sort,
  };
}

function isDefaultView(view: ViewState): boolean {
  return view.sellers.length === 0 && view.types.length === 0 && view.sort === 'leftover';
}

/** Path alone for the default view; otherwise sort, seller, type in that order. */
export function serializeViewState(path: string, view: ViewState): string {
  if (isDefaultView(view)) return path;
  const query: string[] = [];
  if (view.sort !== 'leftover') query.push(`sort=${view.sort}`);
  if (view.sellers.length > 0) query.push(`seller=${view.sellers.join(',')}`);
  if (view.types.length > 0) query.push(`type=${view.types.map((type) => encodeURIComponent(type)).join(',')}`);
  return `${path}?${query.join('&')}`;
}

export interface SellerFacet {
  value: string;
  label: string;
}

export interface FacetOptions {
  sellers: SellerFacet[];
  types: string[];
}

/**
 * Sellers and type labels present in the returned candidates. Sellers use the
 * approved order (muji, daiso); type labels are stable-sorted in Korean.
 */
export function facetOptions(candidates: SpaceFitCandidate[]): FacetOptions {
  const sellers = new Set<string>();
  const types = new Set<string>();
  for (const candidate of candidates) {
    for (const block of candidate.blocks) {
      if (block.source !== null && sellerLabel(block.source) !== null) sellers.add(block.source);
      const label = block.category.label?.trim();
      if (label) types.add(label);
    }
  }
  return {
    sellers: SELLER_ORDER.filter((seller) => sellers.has(seller)).map((seller) => ({
      value: seller,
      label: sellerLabel(seller) as string,
    })),
    types: [...types].sort((a, b) => a.localeCompare(b, 'ko')),
  };
}

/**
 * A candidate matches a seller filter when ANY block comes from a selected
 * seller, and a type filter when ANY block has a selected trimmed label.
 * An empty list means that group is not filtered.
 */
export function filterCandidates(candidates: SpaceFitCandidate[], view: ViewState): SpaceFitCandidate[] {
  const sellerFilter = new Set(view.sellers);
  const typeFilter = new Set(view.types);
  return candidates.filter((candidate) => {
    if (sellerFilter.size > 0 && !candidate.blocks.some((block) => block.source !== null && sellerFilter.has(block.source))) return false;
    if (typeFilter.size > 0 && !candidate.blocks.some((block) => {
      const label = block.category.label?.trim();
      return label !== undefined && label !== null && typeFilter.has(label);
    })) return false;
    return true;
  });
}

/** Sum of block totals with the same rule as priceLine; null if any block is unknown. */
export function candidateTotalPrice(candidate: SpaceFitCandidate): bigint | null {
  let total = 0n;
  for (const block of candidate.blocks) {
    const blockTotal = blockTotalKrw(block);
    if (blockTotal === null) return null;
    total += blockTotal;
  }
  return total;
}

/** A combo mixes at least two distinct variants. */
export function isMixed(candidate: SpaceFitCandidate): boolean {
  return new Set(candidate.blocks.map((block) => block.variantId)).size > 1;
}

function comparePrice(a: SpaceFitCandidate, b: SpaceFitCandidate): number {
  const priceA = candidateTotalPrice(a);
  const priceB = candidateTotalPrice(b);
  if (priceA !== null && priceB !== null) {
    if (priceA !== priceB) return priceA < priceB ? -1 : 1;
  } else if (priceA !== null) return -1;
  else if (priceB !== null) return 1;
  return compareCandidates(a, b);
}

function compareCount(a: SpaceFitCandidate, b: SpaceFitCandidate): number {
  const countA = totalQuantity(a);
  const countB = totalQuantity(b);
  if (countA !== countB) return countA > countB ? -1 : 1;
  return compareCandidates(a, b);
}

/** Order a copy of the candidates; the input array is never mutated. */
export function sortCandidates(candidates: SpaceFitCandidate[], sort: SortKey): SpaceFitCandidate[] {
  const comparator = sort === 'price' ? comparePrice : sort === 'count' ? compareCount : compareCandidates;
  return [...candidates].sort(comparator);
}

const AUTO_STEP_LIMIT = 6;
const MIXED_TARGET = 20;
export const COMBINATION_CAP = 2000;

/**
 * The Rust worker emits single-product grids (stage 0) before two-product
 * mixes (stage 1). After the first page we request a few more bounded steps so
 * the combined list can surface mixed rows without a manual button press.
 * Stops at 6 auto-steps, 20 mixed candidates, completion, or the 2,000 cap.
 */
export function needsMixedStep(combinationsComplete: boolean, combined: SpaceFitCandidate[], steps: number): boolean {
  if (steps >= AUTO_STEP_LIMIT) return false;
  if (combinationsComplete) return false;
  if (combined.length >= COMBINATION_CAP) return false;
  return combined.filter(isMixed).length < MIXED_TARGET;
}
