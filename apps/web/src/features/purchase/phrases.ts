import type {
  HandoffSuitability,
  ObservationFreshness,
  PurchaseImpact,
  StockStatus,
} from '../../contracts/generated/dto';
import { unconfirmedPhrase } from '../offer/phrases';

const EXTRA: Record<string, string> = {
  stock_unknown: '재고 미확인',
  price_unknown: '상품 금액 미확인',
};

/** A confirmation age. The word 최신 is never used. */
export function observationPhrase(freshness: ObservationFreshness, stock: StockStatus): string {
  const stockText =
    freshness === 'stale'
      ? stock === 'inStock'
        ? '당시 재고 있음'
        : stock === 'outOfStock'
          ? '당시 품절'
          : '당시 재고 미확인'
      : stock === 'inStock'
        ? '재고 있음'
        : stock === 'outOfStock'
          ? '품절'
          : '재고 미확인';
  if (freshness === 'stale') return `지난 확인 · ${stockText}`;
  if (freshness === 'unconfirmed') return `확인 시각 없음 · ${stockText}`;
  return `확인됨 · ${stockText}`;
}

export function suitabilityPhrase(value: HandoffSuitability): string {
  if (value === 'pass') return '재검증 통과';
  if (value === 'fail') return '부적합';
  if (value === 'notApplicable') return '해당 없음';
  return '미확인';
}

export function impactPhrase(impact: PurchaseImpact): string {
  if (impact === 'measurementUnknown') return '실측 미확인 · 기존 통과를 재사용하지 않음';
  if (impact === 'dimensionsDiffer') return '실측이 계획과 다름 · 기존 통과를 재사용하지 않음';
  if (impact === 'remeasured') return '실측을 기록함 · 기존 통과를 재사용하지 않음';
  return '실측 전';
}

export function handoffUnconfirmed(code: string): string {
  return EXTRA[code] ?? unconfirmedPhrase(code);
}

export function flagPhrase(recorded: boolean): string {
  return recorded ? '기록됨' : '없음';
}
