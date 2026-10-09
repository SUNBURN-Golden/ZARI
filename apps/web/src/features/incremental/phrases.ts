import type { CheckStatus, PinKind } from '../../contracts/generated/dto';

const CONFLICT: Record<string, string> = {
  strategy_pinned: '고정한 전략과 지금 입력이 다릅니다. 전략은 바꾸지 않았습니다.',
  pin_blocks: '고정한 배치가 새 치수에서 맞지 않습니다. 배치를 옮기지 않았습니다.',
  pinned_subject_missing: '고정한 대상이 입력에 없습니다.',
  pinned_ordinal: '고정한 배치의 수량이 범위를 벗어났습니다.',
  unknown_quantity_ordinals: '수량이 미확인이라 예전 통과를 유지하지 않습니다.',
  release_insufficient: '이 고정을 풀어도 배치를 만들지 못합니다.',
  unpinned_blocked: '고정이 없어도 이 입력으로는 배치를 만들지 못합니다.',
  layout_rejected: '배치를 확정하지 못했습니다.',
};

const OPERATION: Record<string, string> = {
  unknown_pin: '고정한 대상이 이전 계획에 없습니다.',
  duplicate_pin: '같은 고정을 두 번 넣었습니다.',
  input_limit_exceeded: '고정이 너무 많습니다.',
  strategy_unavailable: '그 전략을 이 입력에서 만들지 못했습니다.',
  strategy_mismatch: '요청한 전략이 고정과 맞지 않습니다.',
  operation_not_supported: '이 계산 엔진은 부분 재정리를 지원하지 않습니다.',
  invalid_state: '프로젝트가 활성화되지 않았습니다.',
  invalid_input: '요청 형식이 맞지 않습니다.',
  integrity_failed: '이전 계획의 무결성이 맞지 않습니다.',
  placement_moved: '고정한 배치의 좌표가 달라 계획을 만들지 않았습니다.',
  context_not_installed: '계산 컨텍스트가 준비되지 않았습니다.',
  no_committed_input: '저장된 입력이 없습니다.',
  unexpected_worker_event: '응답 종류가 예상과 달랐습니다.',
};

const SCOPE: Record<string, string> = {
  item_added: '물건이 늘었습니다',
  item_removed: '물건이 빠졌습니다',
  dimension_changed: '치수가 바뀌었습니다',
  quantity_changed: '수량이 바뀌었습니다',
  placement_affected: '배치를 다시 확인합니다',
  space_changed: '공간이 바뀌었습니다',
  owned_changed: '보유품이 바뀌었습니다',
};

/** Rust conflict code, shown as written when this page has no sentence for it. */
export function conflictText(code: string): string {
  return CONFLICT[code] ?? code;
}

/** Worker or session failure code. The page does not decide fitness. */
export function operationText(code: string | null): string {
  if (!code) return '';
  return OPERATION[code] ?? code;
}

export function checkStatusText(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return '통과';
    case 'fail':
      return '실패';
    case 'unknown':
      return '미확인';
    case 'not_applicable':
      return '해당 없음';
  }
}

export function scopeReasonText(code: string): string {
  return SCOPE[code] ?? code;
}

/** The boolean is the Rust `reusedPass` flag. This page does not invent it. */
export function reusedPassText(reused: boolean): string {
  return reused ? '이전 통과를 다시 썼습니다' : '이전 통과를 다시 쓰지 않습니다';
}

export function releaseLabel(pin: { kind: PinKind; sufficientAlone: boolean }): string {
  if (pin.kind === 'strategy') {
    return pin.sufficientAlone ? '전략 고정만 풀기' : '전략 고정을 풀어 보세요';
  }
  return pin.sufficientAlone ? '이 고정만 풀기' : '이 고정을 풀어 보세요';
}
