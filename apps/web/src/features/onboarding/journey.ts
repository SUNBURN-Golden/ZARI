import type { ProjectInput } from '../../contracts/generated/dto';
import { fieldPathFor, MEASUREMENT_FIELDS, type MeasurementField } from '../project/draft';
import type { SessionSnapshot } from '../project/session';
import { suggestedField } from './guide';

/** Display Rust facts only; progress is input coverage, never physical validation. */
export function normalizedAt(input: ProjectInput | null, field: MeasurementField): { state: string; value?: { nominal: number }; reason?: string } | null {
  if (!input) return null;
  const parts = field.split('.');
  if (parts[0] === 'space') {
    let node: unknown = input.space;
    for (const seg of parts.slice(1)) {
      if (typeof node !== 'object' || node === null) return null;
      node = (node as Record<string, unknown>)[seg];
    }
    return node as { state: string; value?: { nominal: number }; reason?: string };
  }
  const item = input.items.find((i) => i.id === parts[1]);
  if (!item) return null;
  return item.dimensions.envelope[parts.at(-1) as 'width' | 'depth' | 'height'];
}

export type JourneyStepId = 'measure' | 'items' | 'plan';
export interface JourneyView {
  current: JourneyStepId;
  done: Record<JourneyStepId, boolean>;
  progress: { filled: number; total: number } | null;
  cta: { field: MeasurementField } | { testId: 'goto-plan' | 'compute-plan' | 'accept-plan' } | null;
  disabled: boolean;
  historical: boolean;
  candidates?: number;
}
export const JOURNEY_IDLE_HOME: JourneyView = {
  current: 'measure', done: { measure: false, items: false, plan: false },
  progress: null, cta: null, disabled: false, historical: false,
};
export function journeyFromProject(state: SessionSnapshot, screen: 'measure' | 'plan' = 'measure'): JourneyView {
  const historical = state.staleInput || state.diagnostics.length > 0;
  const known = (f: MeasurementField) => !historical && normalizedAt(state.normalizedInput, f)?.state === 'known';
  const space = MEASUREMENT_FIELDS.filter((f) => f.startsWith('space.'));
  const interior = space.filter((f) => f.startsWith('space.interior.'));
  const items = MEASUREMENT_FIELDS.filter((f) => f.startsWith('items.'));
  const done = {
    measure: interior.every(known),
    items: ['item-a', 'item-b'].some((id) => items.filter((f) => f.includes(id)).every(known)),
    plan: !historical && state.plan.accepted !== null && state.plan.accepted.inputRevision === state.inputRevision,
  };
  const current = !done.measure ? 'measure' : !done.items ? 'items' : 'plan';
  const fields = current === 'measure' ? interior : items;
  const diagnostic = state.diagnostics.map((d) => fieldPathFor(d.fieldPath)).find((f) => f && fields.includes(f));
  const suggestion = suggestedField(state.form, state.plan.nextFacts);
  const nextSuggestion = current === 'items' && !suggestion?.field.startsWith('items.') ? null : suggestion;
  const field = diagnostic ?? nextSuggestion?.field ?? fields.find((f) => !known(f));
  const busy = state.plan.search === 'running' || state.plan.search === 'cancelling' || state.plan.acceptState === 'saving';
  const disabled = busy || state.status !== 'ready' || state.worker !== 'ready' || state.conflict !== null ||
    (screen === 'plan' && (state.context !== 'installed' || state.plan.edit?.pending != null || state.plan.edit?.persist?.kind === 'saving'));
  const cta = screen === 'plan'
    ? done.plan ? null : { testId: state.plan.selectedId ? 'accept-plan' as const : 'compute-plan' as const }
    : current !== 'plan' && field ? { field } : done.plan ? null : { testId: 'goto-plan' as const };
  const progressFields = current === 'items' ? items : space;
  return { current, done, cta, disabled, historical, candidates: state.plan.alternatives?.length ?? 0,
    progress: current === 'plan' ? null : { filled: progressFields.filter(known).length, total: progressFields.length } };
}
