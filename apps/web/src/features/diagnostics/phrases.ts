import type { DiagnosticClass, SupportStatus } from '../../contracts/generated/dto';

const CLASS_HEADING: Record<DiagnosticClass, string> = {
  noProduct: '제품 없음',
  geometryOutOfRange: '범위 밖 기하',
  undetermined: '확정 불가능',
  budgetExhausted: '예산 소진',
  searchNotFinished: '탐색 미완료',
};

const SUPPORT_CODE: Record<string, string> = {
  rectangular_floor_anchor: '바닥 앵커',
  stacking: '쌓기',
  arbitrary_shape: '임의 형상',
  insertion_rotation: '넣으면서 회전',
  search_budget: '탐색 예산',
};

const SUPPORT_STATUS: Record<SupportStatus, string> = {
  finiteNotComplete: '유한한 후보입니다. 모든 좌표를 다 본 것은 아닙니다.',
  outsideModel: '이 계산 모델 밖입니다.',
  inScope: '이번 예산 한도 안에서 범위를 마쳤습니다.',
  notClaimed: '탐색이 끝나지 않아 한도를 결론으로 쓰지 않습니다.',
  exhausted: '작업 한도에 도달했습니다.',
};

const OPERATION: Record<string, string> = {
  operation_not_supported: '이 계산 엔진은 탐색 진단을 지원하지 않습니다.',
  invalid_state: '프로젝트가 활성화되지 않았습니다.',
  invalid_input: '요청 형식이 맞지 않습니다.',
  budget_mismatch: '요청한 예산이 저장된 입력과 다릅니다.',
  stale_result: '다른 입력의 계획이라 진단하지 않습니다.',
  digest_mismatch: '입력이나 카탈로그 다이제스트가 맞지 않습니다.',
  rule_mismatch: '규칙 버전이 이 계산 엔진과 다릅니다.',
  input_limit_exceeded: '진단할 목록이 한도를 넘었습니다.',
  context_not_installed: '계산 컨텍스트가 준비되지 않았습니다.',
  no_committed_input: '저장된 입력이 없습니다.',
  unexpected_worker_event: '응답 종류가 예상과 달랐습니다.',
};

export function classHeading(kind: DiagnosticClass): string {
  return CLASS_HEADING[kind];
}

/**
 * Unknown stays a measurement gap. A present no-product row names the catalog,
 * and it does not reuse the unknown sentence.
 */
export function classSentence(
  kind: DiagnosticClass,
  present: boolean,
  undetermined: boolean,
): string {
  if (kind === 'noProduct' && present) return '이 카탈로그와 보유 목록에 알려진 제품이 없습니다.';
  if (kind === 'noProduct') return '제품이 없다고 단정하지 않습니다.';
  if (kind === 'undetermined' && present) {
    return undetermined
      ? '측정이나 수량이 없어 확정할 수 없습니다. 제품이 없다는 뜻이 아닙니다.'
      : '확정할 수 없는 항목이 없습니다.';
  }
  if (kind === 'undetermined') return '확정할 수 없는 측정이 없습니다.';
  if (kind === 'geometryOutOfRange' && present) {
    return '알려진 크기가 지원하는 방향에서 공간 밖에 있습니다.';
  }
  if (kind === 'geometryOutOfRange') return '범위 밖 기하는 없습니다.';
  if (kind === 'budgetExhausted' && present) return '정해 둔 탐색 예산을 모두 썼습니다.';
  if (kind === 'budgetExhausted') return '예산 소진으로 끝나지 않았습니다.';
  if (kind === 'searchNotFinished' && present) {
    return '탐색이 끝나기 전에 멈췄습니다.';
  }
  return '탐색이 취소나 중단으로 끝나지 않았습니다.';
}

/**
 * A larger budget, when offered, is a further search. It is never a proof
 * that no arrangement exists.
 */
export function budgetText(suggested: boolean, present: boolean, proof: boolean): string {
  if (proof) return '더 큰 예산을 불가능의 증명으로 표시하지 않습니다.';
  if (suggested) {
    return '예산을 늘리면 아직 보지 못한 안이 나올 수 있습니다. 이것은 해가 없다는 증명이 아닙니다.';
  }
  if (present) return '탐색 한도 안에서 찾은 안입니다. 더 큰 예산은 불가능의 증명이 아닙니다.';
  return '이번 계산은 예산 소진으로 끝나지 않았습니다.';
}

export function supportCodeText(code: string): string {
  return SUPPORT_CODE[code] ?? code;
}

export function supportStatusText(status: SupportStatus): string {
  return SUPPORT_STATUS[status];
}

export function operationText(code: string | null): string {
  if (!code) return '원인을 받지 못했습니다.';
  return OPERATION[code] ?? code;
}

export function presentText(present: boolean): string {
  return present ? '해당' : '아님';
}
