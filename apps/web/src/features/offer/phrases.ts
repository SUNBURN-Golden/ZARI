import type {
  QuotedCount,
  QuotedMoney,
  QuoteRole,
  ShippingStatus,
  StockStatus,
  TaxStatus,
} from '../../contracts/generated/dto';

/**
 * Display text for a Rust quote. Unknown money is never ₩0 and never 무료.
 * Confirmed free shipping is the word 무료, and only when the amount is known 0.
 */
export function quotedMoneyText(money: QuotedMoney, shipping?: ShippingStatus): string {
  if (money.state === 'known') {
    if (money.amount === '0' && shipping === 'free') return '무료';
    return `₩${new Intl.NumberFormat('ko-KR').format(BigInt(money.amount))}`;
  }
  if (money.state === 'notApplicable') return '해당 없음';
  return '미확인';
}

export function quotedCountText(count: QuotedCount): string {
  if (count.state === 'known') return String(count.value);
  if (count.state === 'notApplicable') return '해당 없음';
  return '미확인';
}

export function rolePhrase(role: QuoteRole): string {
  if (role === 'container') return '용기';
  if (role === 'requiredPart') return '필수 부품';
  return '보유 재사용';
}

export function stockPhrase(stock: StockStatus): string {
  if (stock === 'inStock') return '재고 있음';
  if (stock === 'outOfStock') return '품절';
  return '재고 미확인';
}

export function taxPhrase(tax: TaxStatus): string {
  if (tax === 'included') return '세금 포함';
  if (tax === 'excluded') return '세금 별도 · 금액 미확인';
  return '세금 포함 여부 미확인';
}

export function shippingPhrase(status: ShippingStatus, money: QuotedMoney): string {
  if (status === 'free') return quotedMoneyText(money, 'free');
  if (status === 'fixed') return quotedMoneyText(money);
  if (status === 'complex') return '배송 조건이 복잡함';
  if (status === 'notApplicable') return '해당 없음';
  return '미확인';
}

const UNCONFIRMED: Record<string, string> = {
  price_unknown: '상품 금액 미확인',
  shipping_unknown: '배송비 미확인',
  shipping_complex: '배송 조건이 복잡함',
  shipping_conflict: '같은 판매처의 배송비가 서로 다름',
  tax_unknown: '세금 포함 여부 미확인',
  tax_unpriced: '세금 별도 금액 미확인',
};

export function unconfirmedPhrase(code: string): string {
  return UNCONFIRMED[code] ?? code;
}
