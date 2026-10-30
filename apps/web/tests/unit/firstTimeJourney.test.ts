import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PlanSnapshot, ProjectInput } from '../../src/contracts/generated/dto';
import type { SessionSnapshot } from '../../src/features/project/session';
import { emptyProjectForm } from '../../src/features/project/draft';
import { journeyFromProject } from '../../src/features/onboarding/journey';
import { planSummaryText } from '../../src/features/plan/PlanSummary';
import { keyDifference } from '../../src/features/plan/view';
import { COACHMARK_KEY, COACHMARK_FORCE_KEY, shouldShowCoachmark } from '../../src/features/onboarding/coachmark';

const fixture = JSON.parse(readFileSync('fixtures/domain/record-snapshot-verified.json', 'utf8'));
const snapshot = (): PlanSnapshot => structuredClone(fixture.input.snapshot);
const known = { state: 'known', value: { nominal: 600 } };
function state(): SessionSnapshot {
  return {
    form: emptyProjectForm(), normalizedInput: {
      space: { interior: { width: known, depth: known, height: known } },
      items: [{ id: 'item-a', dimensions: { envelope: { width: known, depth: known, height: known } } }],
    } as unknown as ProjectInput,
    staleInput: false, diagnostics: [], inputRevision: '2', status: 'ready', worker: 'ready', conflict: null,
    plan: { accepted: null, search: 'idle', acceptState: 'idle', selectedId: null, nextFacts: { status: 'idle' } },
  } as unknown as SessionSnapshot;
}
describe('honest journey progress', () => {
  it('counts known Rust fields without requiring optional openings', () => {
    const view = journeyFromProject(state());
    expect(view.current).toBe('plan');
    expect(view.done).toEqual({ measure: true, items: true, plan: false });
    expect(view.cta).toEqual({ testId: 'goto-plan' });
  });
  it('routes an empty item step to a real item field', () => {
    const s = state(); s.normalizedInput!.items = [];
    expect(journeyFromProject(s).cta).toEqual({ field: 'items.item-a.dimensions.envelope.width' });
  });
  it('never borrows stale normalized values or an old acceptance', () => {
    const s = state(); s.plan.accepted = { inputRevision: '1', planSnapshotId: 'x' };
    expect(journeyFromProject(s).done.plan).toBe(false);
    s.staleInput = true;
    expect(journeyFromProject(s).done).toEqual({ measure: false, items: false, plan: false });
    s.staleInput = false; s.diagnostics = [{ fieldPath: 'space.interior.width', code: 'invalid_number', reasonCode: 'invalid_number' }];
    expect(journeyFromProject(s).done.measure).toBe(false);
  });
  it('disables plan focus when the actual computation target is unavailable', () => {
    const s = state(); s.context = 'degraded';
    expect(journeyFromProject(s, 'plan').disabled).toBe(true);
    s.context = 'installed';
    expect(journeyFromProject(s, 'plan').disabled).toBe(false);
    s.worker = 'failed';
    expect(journeyFromProject(s, 'plan').disabled).toBe(true);
  });
  it('defines busy and all-done states', () => {
    const s = state(); s.plan.search = 'running';
    expect(journeyFromProject(s, 'plan').disabled).toBe(true);
    s.plan.search = 'idle'; s.plan.accepted = { inputRevision: '2', planSnapshotId: 'x' };
    expect(journeyFromProject(s, 'plan').cta).toBeNull();
  });
});
describe('snapshot summary and comparisons', () => {
  it('includes provisional in the known total without claiming fit, and preserves unknown rows', () => {
    const s = snapshot();
    s.content.validation.assignmentCompleteness = { assignedInstances: 2, provisionalInstances: 3, unassignedInstances: 4, unknownQuantityItems: 1 };
    s.content.validation.physicalAssurance = 'conditional';
    expect(planSummaryText(s, true)).toContain('이전 계획 · 물건 9개 중 2개 배정');
    expect(planSummaryText(s)).toContain('임시 3 · 수량 미확인 1');
    expect(planSummaryText(s)).not.toContain('들어감');
    expect(keyDifference([s, s], 1)).toBe('비교 미확인');
  });
  it('compares safe integer money with BigInt and never replaces unknown costs with zero', () => {
    const a = snapshot(), b = snapshot();
    for (const s of [a, b]) s.content.validation.assignmentCompleteness = { assignedInstances: 2, provisionalInstances: 0, unassignedInstances: 0, unknownQuantityItems: 0 };
    a.content.costSummary.grandTotal = { state: 'known', value: '9007199254740995', provenance: [] } as unknown as typeof a.content.costSummary.grandTotal;
    b.content.costSummary.grandTotal = { ...a.content.costSummary.grandTotal, value: '9007199254740993' } as typeof b.content.costSummary.grandTotal;
    expect(keyDifference([a,b], 1)).toBe('₩2 더 저렴');
    b.content.costSummary.grandTotal = { state: 'unknown', reason: 'notProvided', provenance: [] } as unknown as typeof b.content.costSummary.grandTotal;
    expect(planSummaryText(b)).toContain('추가 구매 미확인');
  });
});
describe('first-visit storage and automation gate', () => {
  const storage = () => {
    const values = new Map<string, string>();
    return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k,v); }, removeItem: (k: string) => { values.delete(k); } } as Storage;
  };
  it('shows normally, bypasses webdriver, and opts in explicitly', () => {
    const s = storage();
    expect(shouldShowCoachmark(s, {})).toBe(true);
    expect(shouldShowCoachmark(s, { webdriver: true })).toBe(false);
    s.setItem(COACHMARK_FORCE_KEY,'1');
    expect(shouldShowCoachmark(s, { webdriver: true })).toBe(true);
  });
  it.each(['done', 'skipped'])('remembers %s even when forced', (value) => {
    const s = storage(); s.setItem(COACHMARK_KEY,value); s.setItem(COACHMARK_FORCE_KEY,'1');
    expect(shouldShowCoachmark(s, {})).toBe(false);
  });
  it('fails closed when reading or writing storage fails', () => {
    expect(shouldShowCoachmark(null, {})).toBe(false);
    expect(shouldShowCoachmark({ getItem() { throw Error(); } } as unknown as Storage, {})).toBe(false);
    expect(shouldShowCoachmark({ getItem() { return null; }, setItem() { throw Error(); } } as unknown as Storage, {})).toBe(false);
  });
});
