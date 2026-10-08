import type { QuantityLabelCode } from '../../contracts/generated/dto';

/**
 * Display text for a Rust quantity label. Unknown is never rendered as zero.
 * A count code with a missing or zero count stays unknown rather than becoming 0개.
 */
export function quantityPhrase(code: QuantityLabelCode, count: number | null): string {
  if (code === 'zero' && count === 0) return '0개';
  if (code === 'count' && count !== null && count >= 1) return `${count}개`;
  return '수량 미상';
}

export function holdingPhrase(holding: 'individual' | 'bundle'): string {
  return holding === 'individual' ? '개별' : '묶음';
}

export function usagePhrase(usage: 'empty' | 'inUse'): string {
  return usage === 'empty' ? '빈 용기' : '사용 중';
}

export function eventPhrase(
  kind: 'purchase' | 'return' | 'move' | 'quantityEdit',
): string {
  if (kind === 'purchase') return '구매';
  if (kind === 'return') return '반품';
  if (kind === 'move') return '다른 위치로 이동';
  return '수량 수정';
}
