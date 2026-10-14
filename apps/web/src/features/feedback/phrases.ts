import type {
  CauseOutcome,
  CheckStatus,
  FeedbackKind,
  Frequency,
  SwapKind,
} from '../../contracts/generated/dto';

const KIND: Record<FeedbackKind, string> = {
  accessDifficulty: '접근 불편',
  frequencyChange: '사용 빈도 변경',
  maintenanceDifficulty: '정리 유지 어려움',
};

const FREQUENCY: Record<Frequency, string> = {
  daily: '매일',
  weekly: '매주',
  monthly: '매달',
  rare: '드물게',
};

/** The rule that explains each kind. The numbers come from Rust. */
const RULE: Record<FeedbackKind, string> = {
  accessDifficulty:
    '접근 규칙: 자주 쓰는 물건이 입구에서 더 깊은 자리에 있고, 앞자리에 더 드물게 쓰는 물건이 있으면 깊이를 맞바꿉니다.',
  frequencyChange:
    '빈도 규칙: 기록한 빈도로 순서를 다시 보고, 자주 쓰는 물건이 더 깊은 자리에 있으면 깊이를 맞바꿉니다.',
  maintenanceDifficulty:
    '유지 규칙: 같은 묶음의 물건이 멀리 떨어져 있으면 거리를 줄이는 자리 맞바꿈을 찾습니다.',
};

const OUTCOME: Record<CauseOutcome, string> = {
  applied: '적용됨',
  noBetterSlot: '더 나은 자리 없음',
  blocked: '검증을 통과하지 못함',
  notApplicable: '적용할 수 없음',
  withdrawn: '철회됨',
  stale: '다른 계획에 기록됨',
  budgetExhausted: '검토 횟수 소진',
};

const REASON: Record<string, string> = {
  swapped_depth: '입구에서의 깊이만 서로 맞바꿨습니다.',
  swapped_slot: '두 배치의 바닥 위치를 서로 맞바꿨습니다.',
  already_ordered: '이미 더 자주 쓰는 물건이 앞쪽에 있습니다.',
  no_closer_slot: '같은 묶음 배치를 더 가깝게 만드는 안전한 맞바꿈이 없습니다.',
  no_sibling: '맞바꿀 같은 높이의 다른 배치가 없습니다.',
  no_group_mates: '같은 묶음에 함께 놓인 다른 배치가 없습니다.',
  frequency_unknown: '빈도를 알 수 없어 비교하지 않았습니다. 빈도를 입력하면 다시 볼 수 있습니다.',
  item_unplaced: '이 물건은 채택한 계획에 배치되어 있지 않습니다.',
  candidates_blocked: '맞바꿈 후보가 있었지만 모두 검증을 통과하지 못했습니다.',
  budget_exhausted: '검토 횟수를 다 써서 남은 후보를 보지 못했습니다.',
  withdrawn: '철회한 기록은 쓰지 않습니다.',
  superseded: '같은 물건의 더 나중 빈도 기록이 이 기록을 대신합니다.',
  other_plan: '이 기록은 지금 채택한 계획이 아닌 다른 계획을 보고 남겼습니다.',
};

const BLOCKER: Record<string, string> = {
  weakens_checks: '채택한 계획보다 나빠지는 검사가 있습니다',
  layout_rejected: '배치를 확정하지 못했습니다',
  outside_compartment: '공간 밖으로 나갑니다',
  unsupported_footprint: '바닥이 받쳐 주지 않습니다',
  opening_too_narrow: '입구가 좁아집니다',
  staging_width_insufficient: '꺼낼 자리가 부족합니다',
};

const OPERATION: Record<string, string> = {
  needs_plan: '채택한 계획이 있어야 기록할 수 있습니다.',
  subject_missing: '그 물건이나 기록을 찾지 못했습니다.',
  item_unplaced: '채택한 계획에 배치되지 않은 물건입니다.',
  duplicate_feedback: '같은 계획에 같은 종류의 기록이 이미 있습니다.',
  frequency_required: '사용 빈도를 골라 주세요.',
  frequency_forbidden: '빈도는 사용 빈도 변경에만 씁니다.',
  frequency_unchanged: '지금 알려진 빈도와 같습니다.',
  invalid_label: '메모는 1자 이상 256자 이하여야 합니다.',
  already_withdrawn: '이미 철회한 기록입니다.',
  input_limit_exceeded: '기록이 너무 많습니다.',
  integrity_failed: '채택한 계획의 무결성이 맞지 않습니다.',
  base_not_in_scope: '채택한 계획이 지금 입력과 달라 쓸 수 없습니다. 다시 계산해 채택하세요.',
  base_invalid: '채택한 계획이 지금 검사를 통과하지 못해 제안을 만들지 않았습니다.',
  invalid_state: '프로젝트가 활성화되지 않았습니다.',
  invalid_input: '요청 형식이 맞지 않습니다.',
  operation_not_supported: '이 계산 엔진은 이 기능을 지원하지 않습니다.',
  context_not_installed: '계산 컨텍스트가 준비되지 않았습니다.',
  no_committed_input: '저장된 입력이 없습니다.',
  revision_conflict: '다른 탭에서 기록이 바뀌었습니다. 다시 불러온 뒤 시도하세요.',
  unexpected_worker_event: '응답 종류가 예상과 달랐습니다.',
};

export function kindText(kind: FeedbackKind): string {
  return KIND[kind];
}

export function frequencyText(frequency: Frequency | null): string {
  return frequency ? FREQUENCY[frequency] : '미확인';
}

export function ruleText(kind: FeedbackKind): string {
  return RULE[kind];
}

export function outcomeText(outcome: CauseOutcome): string {
  return OUTCOME[outcome];
}

export function reasonText(code: string): string {
  return REASON[code] ?? code;
}

/** Rust blocker code, shown as written when this page has no sentence for it. */
export function blockerText(code: string): string {
  return BLOCKER[code] ?? code;
}

export function operationText(code: string | null): string {
  if (!code) return '';
  return OPERATION[code] ?? code;
}

export function swapText(swap: SwapKind): string {
  return swap === 'depthSwap' ? '깊이 맞바꿈' : '위치 맞바꿈';
}

export function statusText(status: CheckStatus): string {
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

/**
 * What the rule counted, in words. The numbers are Rust's: the number of
 * pairs where the more often used item sits deeper, or the summed distance
 * between placements of one group.
 */
export function measureText(kind: FeedbackKind, before: number, after: number): string {
  return kind === 'maintenanceDifficulty'
    ? `같은 묶음 사이 거리 합 ${before} mm → ${after} mm`
    : `순서가 뒤바뀐 쌍 ${before}개 → ${after}개`;
}
