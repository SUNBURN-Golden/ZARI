import type {
  LibraryQuantity,
  LibraryStatement,
  RetrievalMode,
  StoragePrimitive,
  Strategy,
} from '../../contracts/generated/dto';
import { STRATEGY_TEXT } from '../plan/view';

const PRIMITIVE_TEXT: Record<StoragePrimitive, string> = {
  directPlacement: '직접 배치',
  openBin: '열린 박스',
  tray: '트레이',
  verticalFile: '세로 파일',
};

const RETRIEVAL_TEXT: Record<RetrievalMode, string> = {
  directFrontExtraction: '앞에서 바로 꺼내기',
  pullContainerThenRetrieve: '용기를 꺼낸 뒤 집기',
};

const ACCESS_TEXT: Record<string, string> = {
  reuse_owned_before_new: '가진 수납을 먼저 보고, 없는 수만큼만 새 용기를 센다',
  frequency_zone_soft: '자주 쓰는 묶음은 앞쪽 선호, 드문 묶음은 뒤쪽 선호다. 빈도를 모르면 매일로 두지 않는다',
  declared_activity_partition: '입력된 활동 묶음을 유지한다',
  active_front_reserve_rear: '사용 중은 앞, 보관은 뒤다. 역할을 모르면 나누지 않는다',
  zero_other_container_moves:
    '다른 용기를 옮기지 않는 앞쪽 꺼내기만 지원한다. 여유 치수를 모르면 통과가 아니다',
};

const REASON_TEXT: Record<string, string> = {
  ungrouped: '묶음에 없음',
  no_resolvable_zone: '놓을 구역이 없음',
  quantity_unknown: '수량을 모름',
  quantity_not_applicable: '수량이 해당 없음',
  retrieval_unsupported: '이 레시피의 꺼내기 방식이 아님',
  one_action_unproved: '한 동작으로 꺼낸다는 보장이 없음',
  strategy_unsupported: '지원하지 않는 전략',
};

const MESSAGE_TEXT: Record<string, string> = {
  'reason.min_purchase.group': '가진 수납을 우선 검토합니다',
  'reason.frequency.zone': '사용 빈도로 앞뒤를 나눕니다',
  'reason.activity.group': '입력된 활동 묶음을 유지합니다',
  'reason.active_reserve.zone': '사용 중과 보관을 나눕니다',
};

export function strategyName(strategy: Strategy | string): string {
  return STRATEGY_TEXT[strategy] ?? strategy;
}

export function primitiveText(primitive: StoragePrimitive): string {
  return PRIMITIVE_TEXT[primitive] ?? primitive;
}

export function retrievalText(mode: RetrievalMode): string {
  return RETRIEVAL_TEXT[mode] ?? mode;
}

export function accessText(code: string): string {
  return ACCESS_TEXT[code] ?? code;
}

export function unassignedReasonText(code: string): string {
  return REASON_TEXT[code] ?? code;
}

export function messageText(key: string): string {
  return MESSAGE_TEXT[key] ?? key;
}

/** Known counts stay numbers, including 0. Unknown is never 0. */
export function quantityText(quantity: LibraryQuantity): string {
  if (quantity.state === 'known') return String(quantity.count);
  if (quantity.state === 'unknown') return '미확인';
  return '해당 없음';
}

export function statementText(statement: LibraryStatement): string {
  const parameter = (name: string) => statement.parameters[name];
  switch (statement.code) {
    case 'purchase_prohibited':
      return '구매가 금지되어 있습니다';
    case 'hard_one_action':
      return '한 동작 접근이 강제 조건입니다. 증명되지 않으면 통과가 아닙니다';
    case 'locked_zone':
      return `묶음 ${parameter('groupId') ?? ''}의 구역이 고정되어 있습니다`;
    case 'safety_restriction_unmodeled':
      return `안전 제한 ${parameter('restriction') ?? ''}은 이 버전에서 증명하지 않습니다`;
    case 'must_stay_together':
      return `${parameter('itemId') ?? '물건'}은 함께 있어야 합니다`;
    case 'hard_budget_known':
      return `구매 상한 ${parameter('amount') ?? ''}원. 이 비교는 합계 통과를 판정하지 않습니다`;
    case 'hard_budget_unknown':
      return '구매 상한을 모릅니다. 0원으로 두지 않습니다';
    case 'hard_budget_not_applicable':
      return '구매 상한은 해당 없음입니다';
    case 'soft_budget_known':
      return `부드러운 예산 ${parameter('amount') ?? ''}원. 강제 제약이 아닙니다`;
    case 'soft_budget_unknown':
      return '부드러운 예산을 모릅니다. 무료나 0원으로 두지 않습니다';
    case 'soft_budget_not_applicable':
      return '부드러운 예산은 해당 없음입니다';
    case 'material':
      return `소재 취향 ${parameter('material') ?? ''}. 치수나 수량을 바꾸지 않습니다`;
    case 'color':
      return `색 취향 ${parameter('color') ?? ''}. 물건을 빼지 않습니다`;
    case 'visual_note':
      return `시각 메모. 배치 조건이 아닙니다`;
    case 'objective_rank':
      return `선호 순서 ${parameter('index') ?? ''}: ${strategyName(parameter('strategy') ?? '')}. 저장된 전략을 바꾸지 않습니다`;
    case 'zone_soft_preference':
      return `구역 ${parameter('zoneId') ?? ''}은 선호입니다. 고정 구역이 아닙니다`;
    default:
      return statement.code;
  }
}
