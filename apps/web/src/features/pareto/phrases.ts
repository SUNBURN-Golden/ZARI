import type {
  ParetoCount,
  ParetoItemQuantity,
  ParetoMoney,
  ParetoOptimality,
} from '../../contracts/generated/dto';

/** Known money keeps its amount. No purchase is not unknown, and unknown is not ₩0. */
export function paretoMoneyText(money: ParetoMoney): string {
  if (money.state === 'known') {
    return `₩${new Intl.NumberFormat('ko-KR').format(BigInt(money.amount))}`;
  }
  if (money.state === 'noPurchase') return '구매 없음';
  return '미확인';
}

/** A known count is the number. Unknown is the word, never 0. */
export function paretoCountText(count: ParetoCount): string {
  if (count.state === 'known') return String(count.value);
  return '미확인';
}

export function paretoItemQuantityText(quantity: ParetoItemQuantity): string {
  if (quantity.kind === 'known') return String(quantity.count);
  return '미확인';
}

/**
 * Every label refuses a global optimum. The exhausted-budget sentence still
 * contains the words "전역 최적" because it says the result is not one.
 */
export function optimalityText(optimality: ParetoOptimality): string {
  switch (optimality) {
    case 'budgetLimited':
      return '탐색 예산을 모두 썼습니다. 전역 최적해가 아닙니다. 현재 탐색 범위에서 찾은 안입니다.';
    case 'scopeCompared':
      return '지원하는 범위를 비교했습니다. 전역 최적해라고 하지 않습니다.';
    case 'cancelled':
      return '계산이 취소되었습니다. 전역 최적해가 아닙니다.';
    case 'interrupted':
      return '계산이 중단되었습니다. 전역 최적해가 아닙니다.';
  }
}
