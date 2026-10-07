import { expect, it } from 'vitest';
import type {
  ActionStep,
  SnapshotContent,
  SpatialLink,
  SpatialProjection,
  SpatialTarget,
} from '../../src/contracts/generated/dto';
import {
  neighborStep,
  nextExecutableStep,
  shouldApplyProgressReply,
  stepAccess,
  stepMark,
  stepTargetView,
} from '../../src/features/workspace/stepFocus';

function step(partial: Partial<ActionStep> & Pick<ActionStep, 'id'>): ActionStep {
  return {
    kind: 'install',
    prerequisiteStepIds: [],
    reasonIds: [],
    requiredConfirmations: [],
    subjectIds: [],
    ...partial,
  };
}

const content = {
  inputFacts: {
    items: [
      { id: 'cup', label: '컵' },
      { id: 'plate', label: '접시' },
    ],
    ownedContainers: [],
  },
  placements: [
    {
      id: 'box-1',
      subject: { kind: 'ownedContainer', ownedId: 'bin', unitOrdinal: 0 },
    },
  ],
  unassigned: [
    {
      itemId: 'plate',
      reasonCode: 'geometry_unknown',
      instances: { kind: 'unknownQuantity' },
    },
  ],
} as unknown as SnapshotContent;

function link(stepId: string, targets: SpatialTarget[], resolution: SpatialLink['resolution'], reason: string | null): SpatialLink {
  return {
    source: { kind: 'action', stepId },
    targets,
    resolution,
    unresolvedSubjectIds: [],
    reasonCode: reason,
  };
}

function projection(links: SpatialLink[]): SpatialProjection {
  return { links } as SpatialProjection;
}

const baseAccess = {
  surface: 'accepted' as const,
  displayedPlanId: 'plan-a',
  displayedDigest: 'a'.repeat(64),
  accepted: { inputRevision: '1', planSnapshotId: 'plan-a' },
  currentInputRevision: '1',
  currentInputDigest: 'a'.repeat(64),
  staleInput: false,
  conflict: false,
  progress: {} as Record<string, 'done' | 'todo'>,
  progressLoad: 'ready' as const,
};

it('a null progress map is unknown and is not an all-todo list', () => {
  expect(stepMark(null, 's1')).toBe('unknown');
  expect(stepMark({}, 's1')).toBe('todo');
  expect(stepMark({ s1: 'done' }, 's1')).toBe('done');
  expect(nextExecutableStep([step({ id: 's1' })], null)).toEqual({ kind: 'unavailable' });
  expect(nextExecutableStep([step({ id: 's1' }), step({ id: 's2', prerequisiteStepIds: ['s1'] })], {})).toEqual({
    kind: 'step',
    stepId: 's1',
  });
  expect(
    nextExecutableStep(
      [step({ id: 's1' }), step({ id: 's2', prerequisiteStepIds: ['s1'] })],
      { s1: 'done' },
    ),
  ).toEqual({ kind: 'step', stepId: 's2' });
  expect(nextExecutableStep([step({ id: 's1' })], {}, null)).toEqual({ kind: 'unavailable' });
  expect(
    nextExecutableStep([step({ id: 's1' }), step({ id: 's2' })], {}, new Set(['s2'])),
  ).toEqual({ kind: 'step', stepId: 's2' });
});

it('prev and next follow the existing order and do not wrap', () => {
  const actions = [step({ id: 's1' }), step({ id: 's2' }), step({ id: 's3' })];
  expect(neighborStep(actions, null, 1)).toBe('s1');
  expect(neighborStep(actions, null, -1)).toBeNull();
  expect(neighborStep(actions, 's1', 1)).toBe('s2');
  expect(neighborStep(actions, 's3', 1)).toBeNull();
  expect(neighborStep(actions, 's2', -1)).toBe('s1');
});

it('completion stays closed for working, stale, conflict, and an unread map', () => {
  expect(stepAccess({ ...baseAccess, surface: 'working' }).block).toBe('working');
  expect(stepAccess({ ...baseAccess, surface: 'alternative' }).block).toBe('alternative');
  expect(stepAccess({ ...baseAccess, staleInput: true }).block).toBe('stale');
  expect(stepAccess({ ...baseAccess, currentInputRevision: '2' }).block).toBe('stale');
  expect(stepAccess({ ...baseAccess, currentInputDigest: 'b'.repeat(64) }).block).toBe('stale');
  expect(stepAccess({ ...baseAccess, conflict: true }).block).toBe('conflict');
  expect(stepAccess({ ...baseAccess, progress: null, progressLoad: 'error' }).block).toBe('progress_unknown');
  expect(stepAccess({ ...baseAccess, progressLoad: 'loading' }).block).toBe('progress_loading');
  expect(stepAccess(baseAccess).writable).toBe(true);
});

it('keeps repeated contained units on their own step targets', () => {
  const first = step({ id: 'move-0', kind: 'transferContents', subjectIds: ['cup', 'box-1'] });
  const second = step({ id: 'move-1', kind: 'transferContents', subjectIds: ['cup', 'box-1'] });
  const links = projection([
    link('move-0', [
      { kind: 'itemInstance', itemId: 'cup', unitOrdinal: 0 },
      { kind: 'placement', placementId: 'box-1' },
    ], 'resolved', null),
    link('move-1', [
      { kind: 'itemInstance', itemId: 'cup', unitOrdinal: 1 },
      { kind: 'placement', placementId: 'box-1' },
    ], 'resolved', null),
  ]);
  const a = stepTargetView(first, links, content);
  const b = stepTargetView(second, links, content);
  expect(a.keys).toEqual(['instance:cup:0', 'placement:box-1']);
  expect(b.keys).toEqual(['instance:cup:1', 'placement:box-1']);
  expect(a.keys).not.toEqual(b.keys);
  expect(a.note).toBeNull();
});

it('names unassigned items and refuses a guessed geometry', () => {
  const unassigned = step({ id: 'left', kind: 'verifyUnassigned' });
  const missing = step({ id: 'old', kind: 'install' });
  const view = stepTargetView(
    unassigned,
    projection([link('left', [], 'unavailable', 'action_no_spatial_target')]),
    content,
  );
  expect(view.targets).toEqual([]);
  expect(view.note).toContain('접시');
  expect(view.note).toContain('상자 위치를 만들지 않습니다');
  const unavailable = stepTargetView(
    missing,
    projection([link('old', [], 'unavailable', 'action_target_unavailable')]),
    content,
  );
  expect(unavailable.targets).toEqual([]);
  expect(unavailable.note).toContain('정확한 대상');
});

it('drops a completion reply after the accepted binding changes', () => {
  const captured = { inputRevision: '1', planSnapshotId: 'plan-a' };
  expect(
    shouldApplyProgressReply({
      capturedEpoch: 1,
      epoch: 1,
      captured,
      accepted: captured,
      progress: {},
    }),
  ).toBe(true);
  expect(
    shouldApplyProgressReply({
      capturedEpoch: 1,
      epoch: 2,
      captured,
      accepted: { inputRevision: '1', planSnapshotId: 'plan-b' },
      progress: {},
    }),
  ).toBe(false);
  expect(
    shouldApplyProgressReply({
      capturedEpoch: 1,
      epoch: 1,
      captured,
      accepted: captured,
      progress: null,
    }),
  ).toBe(false);
});
