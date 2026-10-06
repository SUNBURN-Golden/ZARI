import type {
  ActionStep,
  SnapshotContent,
  SpatialProjection,
  SpatialTarget,
} from '../../contracts/generated/dto';
import { ACTION_TEXT, UNASSIGNED_TEXT, subjectLabel } from '../plan/view';
import { targetKey } from './selection';

/**
 * Accepted-plan step navigation. Focus changes are local workspace state.
 * They do not write progress, bump a revision, or copy rows onto another snapshot.
 */

export type ProgressMap = Record<string, 'done' | 'todo'>;

export type ProgressLoad = 'idle' | 'loading' | 'ready' | 'error';

export type GuideSurface = 'accepted' | 'working' | 'alternative';

export type StepBlock =
  | 'writable'
  | 'working'
  | 'alternative'
  | 'not_accepted'
  | 'conflict'
  | 'stale'
  | 'progress_unknown'
  | 'progress_loading';

export interface StepAccess {
  writable: boolean;
  block: StepBlock;
}

/** A stored row is 'done' or 'todo'. A null map is unknown, never an empty todo list. */
export type StepMark = 'done' | 'todo' | 'unknown';

export function stepMark(progress: ProgressMap | null, stepId: string): StepMark {
  if (progress === null) return 'unknown';
  return progress[stepId] === 'done' ? 'done' : 'todo';
}

/**
 * Completion is allowed only for the displayed accepted snapshot while it is
 * still the current input, the draft is not stale, there is no tab conflict,
 * and the progress map was actually read.
 */
export function stepAccess(args: {
  surface: GuideSurface;
  displayedPlanId: string;
  displayedDigest: string;
  accepted: { inputRevision: string; planSnapshotId: string } | null;
  currentInputRevision: string;
  currentInputDigest: string | null;
  staleInput: boolean;
  conflict: boolean;
  progress: ProgressMap | null;
  progressLoad: ProgressLoad;
}): StepAccess {
  if (args.surface === 'working') return { writable: false, block: 'working' };
  if (args.surface === 'alternative') return { writable: false, block: 'alternative' };
  if (
    !args.accepted ||
    args.accepted.planSnapshotId !== args.displayedPlanId
  ) {
    return { writable: false, block: 'not_accepted' };
  }
  if (args.conflict) return { writable: false, block: 'conflict' };
  const digestMatches =
    args.currentInputDigest !== null && args.displayedDigest === args.currentInputDigest;
  if (
    args.staleInput ||
    args.accepted.inputRevision !== args.currentInputRevision ||
    !digestMatches
  ) {
    return { writable: false, block: 'stale' };
  }
  if (args.progressLoad === 'loading' || args.progressLoad === 'idle') {
    return { writable: false, block: 'progress_loading' };
  }
  if (args.progressLoad === 'error' || args.progress === null) {
    return { writable: false, block: 'progress_unknown' };
  }
  return { writable: true, block: 'writable' };
}

export function missingPrerequisites(step: ActionStep, progress: ProgressMap | null): string[] {
  if (progress === null) return [];
  return step.prerequisiteStepIds.filter((id) => progress[id] !== 'done');
}

export function doneDependents(
  stepId: string,
  actions: readonly ActionStep[],
  progress: ProgressMap | null,
): string[] {
  if (progress === null) return [];
  return actions
    .filter((action) => action.prerequisiteStepIds.includes(stepId) && progress[action.id] === 'done')
    .map((action) => action.id);
}

export function confirmationRequired(step: ActionStep): boolean {
  return step.requiredConfirmations.length > 0;
}

/**
 * First not-done step in the existing action order whose prerequisites are done.
 * A null progress map cannot make that choice.
 */
export function nextExecutableStep(
  actions: readonly ActionStep[],
  progress: ProgressMap | null,
): { kind: 'unavailable' } | { kind: 'none' } | { kind: 'step'; stepId: string } {
  if (progress === null) return { kind: 'unavailable' };
  for (const step of actions) {
    if (progress[step.id] === 'done') continue;
    if (missingPrerequisites(step, progress).length > 0) continue;
    return { kind: 'step', stepId: step.id };
  }
  return { kind: 'none' };
}

/** Previous/next along the producer order. Null current moves forward to the first step. */
export function neighborStep(
  actions: readonly ActionStep[],
  currentId: string | null,
  direction: -1 | 1,
): string | null {
  if (actions.length === 0) return null;
  if (!currentId) return direction > 0 ? actions[0]!.id : null;
  const index = actions.findIndex((action) => action.id === currentId);
  if (index < 0) return direction > 0 ? actions[0]!.id : null;
  const next = index + direction;
  if (next < 0 || next >= actions.length) return null;
  return actions[next]!.id;
}

export function actionLink(projection: SpatialProjection | null, stepId: string) {
  return (
    projection?.links.find(
      (link) => link.source.kind === 'action' && link.source.stepId === stepId,
    ) ?? null
  );
}

export interface StepTargetView {
  /** Exact link targets. Empty when the link is unavailable — never a guessed unit. */
  targets: SpatialTarget[];
  keys: string[];
  note: string | null;
}

function itemLabel(content: SnapshotContent, itemId: string): string {
  return content.inputFacts.items.find((item) => item.id === itemId)?.label ?? itemId;
}

function placementLabel(content: SnapshotContent, placementId: string): string {
  const placement = content.placements.find((item) => item.id === placementId);
  return placement ? subjectLabel(content, placement.subject) : placementId;
}

export function targetLabel(content: SnapshotContent, target: SpatialTarget): string {
  switch (target.kind) {
    case 'placement':
      return placementLabel(content, target.placementId);
    case 'itemInstance':
      return `${itemLabel(content, target.itemId)} · ${target.unitOrdinal + 1}번째`;
    case 'item':
      return itemLabel(content, target.itemId);
    case 'space':
      return '공간';
    case 'opening':
      return '출입구';
    case 'obstacle':
      return '장애물';
    case 'support':
      return '지지면';
    default: {
      const _never: never = target;
      return _never;
    }
  }
}

function unassignedNote(content: SnapshotContent): string {
  if (content.unassigned.length === 0) {
    return '미배정 물건이 없습니다. 상자 위치를 만들지 않습니다.';
  }
  const lines = content.unassigned.map((row) => {
    const name = itemLabel(content, row.itemId);
    const reason = UNASSIGNED_TEXT[row.reasonCode] ?? row.reasonCode;
    const count =
      row.instances.kind === 'known'
        ? row.instances.ranges
            .map((range) => `${range.start + 1}–${range.endExclusive}번째`)
            .join(', ')
        : '수량을 알 수 없음';
    return `${name} (${count}, ${reason})`;
  });
  return `미배정: ${lines.join(', ')}. 상자 위치를 만들지 않습니다.`;
}

/**
 * Targets come only from the projection link for this step id.
 * Repeated contained units stay separate because each link names its own ordinal.
 */
export function stepTargetView(
  step: ActionStep,
  projection: SpatialProjection | null,
  content: SnapshotContent,
): StepTargetView {
  const link = actionLink(projection, step.id);
  if (step.kind === 'verifyUnassigned') {
    const targets = link && link.resolution !== 'unavailable' ? link.targets : [];
    return {
      targets,
      keys: targets.map(targetKey),
      note: unassignedNote(content),
    };
  }
  if (!link) {
    return {
      targets: [],
      keys: [],
      note: '이 단계의 도면 연결을 아직 읽지 못했습니다.',
    };
  }
  if (link.resolution === 'unavailable' || link.targets.length === 0) {
    const note =
      link.reasonCode === 'action_target_unavailable'
        ? '이 단계의 정확한 대상을 도면에서 가리킬 수 없습니다.'
        : link.reasonCode === 'action_no_spatial_target'
          ? '이 단계는 도면 위치가 없습니다.'
          : '도면에 표시할 위치가 없습니다.';
    return { targets: [], keys: [], note };
  }
  const note =
    link.resolution === 'partial' ? '일부 대상은 도면에 없습니다.' : null;
  return {
    targets: link.targets,
    keys: link.targets.map(targetKey),
    note,
  };
}

export function stepTitle(step: ActionStep): string {
  return ACTION_TEXT[step.kind] ?? step.kind;
}

export function prerequisiteText(actions: readonly ActionStep[], missingIds: readonly string[]): string {
  const titles = missingIds.map((id) => {
    const step = actions.find((item) => item.id === id);
    return step ? stepTitle(step) : id;
  });
  return `선행 단계 필요: ${titles.join(', ')}`;
}

export function dependentText(actions: readonly ActionStep[], dependentIds: readonly string[]): string {
  const titles = dependentIds.map((id) => {
    const step = actions.find((item) => item.id === id);
    return step ? stepTitle(step) : id;
  });
  return `이어지는 단계가 완료되어 있습니다: ${titles.join(', ')}`;
}

/**
 * A progress reply may update the map only when the accepted binding is still
 * the one captured before the write. A later accept or reload drops the reply.
 */
export function shouldApplyProgressReply(args: {
  capturedEpoch: number;
  epoch: number;
  captured: { inputRevision: string; planSnapshotId: string };
  accepted: { inputRevision: string; planSnapshotId: string } | null;
  progress: ProgressMap | null;
}): boolean {
  if (args.epoch !== args.capturedEpoch) return false;
  if (!args.accepted) return false;
  if (args.progress === null) return false;
  return (
    args.accepted.inputRevision === args.captured.inputRevision &&
    args.accepted.planSnapshotId === args.captured.planSnapshotId
  );
}
