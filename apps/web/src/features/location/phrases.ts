import type {
  LocationStatus,
  ObservationKind,
  PlannedRef,
} from '../../contracts/generated/dto';

/**
 * Status text. A planned location is never rendered as an actual one; the
 * words carry the distinction, not color.
 */
export function statusPhrase(status: LocationStatus): string {
  switch (status) {
    case 'unlocated':
      return '위치 기록 없음';
    case 'plannedOnly':
      return '계획 위치 · 미확인';
    case 'confirmed':
      return '확인한 위치';
    case 'mismatch':
      return '관측 위치가 계획과 다름';
    case 'observed':
      return '기록한 위치';
    case 'lost':
      return '분실 신고';
    case 'staleConfirmation':
      return '다른 계획의 확인';
  }
}

export function kindPhrase(kind: ObservationKind): string {
  switch (kind) {
    case 'confirm':
      return '계획 위치 확인';
    case 'relocate':
      return '다른 곳으로 이동';
    case 'reorganize':
      return '재정리';
    case 'lost':
      return '분실';
    case 'alias':
      return '별칭';
  }
}

/** Planned location text. `direct` has no container name. */
export function plannedPhrase(planned: PlannedRef): string {
  if (planned.kind === 'direct') return '공간 직접 배치';
  const inside = planned.label ?? '이름 없는 용기';
  if (planned.kind === 'provisional')
    return `${inside} 안 (임시 수납${planned.reasonCode ? ` · ${planned.reasonCode}` : ''})`;
  return `${inside} 안`;
}

export function ordinalsPhrase(ordinals: number[], count: number | null): string {
  if (ordinals.length === 0) return count === null ? '물건 전체' : '전체';
  if (count !== null && ordinals.length === count) return '전체';
  return `단위 ${ordinals.join(', ')}`;
}
