import type { PlanSnapshot } from '../../contracts/generated/dto';
import { isNoPurchase, moneyText } from './view';

/** Counts are disjoint Rust accounting; placement count is never an item total. */
export function planSummaryText(snapshot: PlanSnapshot, historical = false): string {
  const { assignmentCompleteness: c, physicalAssurance } = snapshot.content.validation;
  const total = c.assignedInstances + c.provisionalInstances + c.unassignedInstances;
  // copy-todo: placeholder summary; assignment alone does not establish physical fit.
  const assignment = physicalAssurance === 'confirmedWithinScope' ? `${c.assignedInstances}개 들어감 (검사 범위 내)` : `${c.assignedInstances}개 배정 · 적합성 ${physicalAssurance === 'rejected' ? '실패' : '미확인'}`;
  // copy-todo: unknown and provisional quantities are kept separate, including historical results.
  return `${historical ? '이전 계획 · ' : ''}물건 ${total}개 중 ${assignment} · ${isNoPurchase(snapshot) ? '구매 없음' : `추가 구매 ${moneyText(snapshot.content.costSummary.grandTotal)}`}${c.provisionalInstances ? ` · 임시 ${c.provisionalInstances}` : ''}${c.unknownQuantityItems ? ` · 수량 미확인 ${c.unknownQuantityItems}` : ''}`;
}
export function PlanSummary({ snapshot, historical }: { snapshot: PlanSnapshot; historical: boolean }) {
  return <p className="plan-summary" data-testid="plan-summary" role="status">{planSummaryText(snapshot, historical)}</p>;
}
