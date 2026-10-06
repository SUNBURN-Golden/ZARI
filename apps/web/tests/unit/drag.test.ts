import { expect, it } from 'vitest';
import type { LayoutEditCommand } from '../../src/contracts/generated/dto';
import {
  DRAG_THRESHOLD_PX,
  applyMatrix,
  beginMove,
  clientDistance,
  domainDelta,
  finishMove,
  inProtocolRange,
  invertMatrix,
  keyboardStepMm,
  matrixChanged,
  movePlacementCommand,
  movedPosition,
  nudgePosition,
  panByFrozenDelta,
  quantizeMm,
  samePosition,
  updateMove,
  type Matrix2D,
  type MmPoint,
} from '../../src/features/workspace/drag';
import { leasesEqual, type WorkspaceLease } from '../../src/features/workspace/lease';

const identity: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const flipY: Matrix2D = { a: 1, b: 0, c: 0, d: -1, e: 10, f: 200 };

function lease(over: Partial<WorkspaceLease> = {}): WorkspaceLease {
  return {
    projectId: 'p',
    displayedPlanSnapshotId: 'snap',
    editorEpoch: '3',
    inputRevision: '4',
    inputDigest: 'in',
    catalogDigest: 'cat',
    projectRevision: '5',
    projectActivationId: 'act',
    workerSessionId: 'worker',
    workspaceGeneration: '2',
    ...over,
  };
}

const origin: MmPoint = { x: 100, y: 40, z: 7 };

it('quantizes half-millimetres away from zero and refuses non-finite deltas', () => {
  expect(quantizeMm(0)).toBe(0);
  expect(quantizeMm(0.49)).toBe(0);
  expect(quantizeMm(-0.49)).toBe(0);
  expect(quantizeMm(0.5)).toBe(1);
  expect(quantizeMm(-0.5)).toBe(-1);
  expect(quantizeMm(1.5)).toBe(2);
  expect(quantizeMm(-1.5)).toBe(-2);
  expect(quantizeMm(Number.NaN)).toBeNull();
  expect(quantizeMm(Number.POSITIVE_INFINITY)).toBeNull();
});

it('inverts a flipped CTM back to domain millimetres', () => {
  const inverse = invertMatrix(flipY);
  expect(inverse).not.toBeNull();
  const screen = applyMatrix(flipY, { x: 30, y: 12 });
  expect(applyMatrix(inverse!, screen)).toEqual({ x: 30, y: 12 });
  expect(domainDelta({ x: 0, y: 0 }, { x: 10, y: -4 }, identity)).toEqual({ x: 10, y: -4 });
});

it('keeps a click under 4 CSS px and emits one integer move command past it', () => {
  const captured = lease();
  const started = beginMove({
    pointerId: 1,
    startClient: { x: 0, y: 0 },
    origin,
    placementId: 'box',
    ctm: identity,
    lease: captured,
  });
  expect(started).not.toBeNull();
  const near = updateMove(started!, { x: 3, y: 0 }, identity);
  expect(near.kind).toBe('armed');
  expect(clientDistance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBeLessThan(DRAG_THRESHOLD_PX);
  expect(finishMove(started!, { x: 2, y: 2 }, identity, captured).kind).toBe('click');

  const far = updateMove(started!, { x: 10.2, y: -0.4 }, identity);
  expect(far.kind).toBe('preview');
  if (far.kind !== 'preview') return;
  expect(far.gesture.position).toEqual({ x: 110, y: 40, z: 7 });
  expect(updateMove(started!, { x: 10.2, y: -0.4 }, identity).kind).not.toBe('commit');

  const finished = finishMove(started!, { x: 10.2, y: -0.4 }, identity, captured);
  expect(finished.kind).toBe('commit');
  if (finished.kind !== 'commit') return;
  const expected: LayoutEditCommand = {
    kind: 'movePlacement',
    placementId: 'box',
    position: { x: 110, y: 40, z: 7 },
  };
  expect(finished.command).toEqual(expected);
  expect(finished.command).toEqual(movePlacementCommand('box', { x: 110, y: 40, z: 7 }));
  expect(inProtocolRange(far.gesture.position)).toBe(true);
});

it('a sub-millimetre drag past the pixel threshold is a no-op with no command', () => {
  const captured = lease();
  const started = beginMove({
    pointerId: 1,
    startClient: { x: 0, y: 0 },
    origin,
    placementId: 'box',
    ctm: { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 },
    lease: captured,
  });
  // 4 CSS px at 10 px/mm is 0.4 mm, which quantizes to 0.
  const finished = finishMove(started!, { x: 4, y: 0 }, { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 }, captured);
  expect(finished.kind).toBe('noop');
});

it('cancels when the frozen CTM or the lease no longer matches', () => {
  const captured = lease();
  const started = beginMove({
    pointerId: 1,
    startClient: { x: 0, y: 0 },
    origin,
    placementId: 'box',
    ctm: identity,
    lease: captured,
  });
  expect(updateMove(started!, { x: 20, y: 0 }, { ...identity, a: 2 }).kind).toBe('cancel');
  expect(matrixChanged(identity, { ...identity, e: 0.02 })).toBe(false);
  expect(matrixChanged(identity, { ...identity, e: 1 })).toBe(true);
  expect(matrixChanged(identity, { ...identity, a: 1.01 })).toBe(true);
  const moved = finishMove(started!, { x: 20, y: 0 }, identity, lease({ editorEpoch: '9' }));
  expect(moved).toEqual({ kind: 'cancel', reason: 'lease' });
  expect(leasesEqual(captured, lease({ workerSessionId: 'other' }))).toBe(false);
  expect(leasesEqual(captured, captured)).toBe(true);
});

it('prechecks a protocol-range miss and never turns it into a command', () => {
  const captured = lease();
  const started = beginMove({
    pointerId: 1,
    startClient: { x: 0, y: 0 },
    origin,
    placementId: 'box',
    ctm: identity,
    lease: captured,
  });
  const finished = finishMove(started!, { x: 30000, y: 0 }, identity, captured);
  expect(finished.kind).toBe('precheck');
  expect(movedPosition(origin, 30000, 0)).toEqual({ x: 30100, y: 40, z: 7 });
  expect(samePosition(origin, origin)).toBe(true);
});

it('keyboard step is 1 mm unless the explicit modifier asks for 10 mm', () => {
  expect(keyboardStepMm(false)).toBe(1);
  expect(keyboardStepMm(true)).toBe(10);
  const once = nudgePosition(origin, 'ArrowRight', keyboardStepMm(false));
  const coarse = nudgePosition(origin, 'ArrowRight', keyboardStepMm(true));
  expect(once).toEqual({ x: 101, y: 40, z: 7 });
  expect(coarse).toEqual({ x: 110, y: 40, z: 7 });
  let position = origin;
  for (let i = 0; i < 5; i += 1) position = nudgePosition(position, 'ArrowUp', 1)!;
  expect(position).toEqual({ x: 100, y: 35, z: 7 });
  expect(movePlacementCommand('box', position)).toEqual({
    kind: 'movePlacement',
    placementId: 'box',
    position: { x: 100, y: 35, z: 7 },
  });
  expect(nudgePosition(origin, 'ArrowDown', 1)).toEqual({ x: 100, y: 41, z: 7 });
  expect(nudgePosition(origin, 'ArrowLeft', 10)).toEqual({ x: 90, y: 40, z: 7 });
});

it('pans in frozen viewBox units so the content follows the pointer', () => {
  const inverse = invertMatrix(identity)!;
  const next = panByFrozenDelta(
    { zoom: 2, panX: 4, panY: -3 },
    { x: 0, y: 0 },
    { x: 12, y: -5 },
    inverse,
  );
  expect(next).toEqual({ zoom: 2, panX: -8, panY: 2 });
});
