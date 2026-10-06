import type { LayoutEditCommand } from '../../contracts/generated/dto';
import { leasesEqual, type WorkspaceLease } from './lease';
import type { Viewport } from './viewport';

/** Screen distance that separates a click from a move. Not a millimetre gap. */
export const DRAG_THRESHOLD_PX = 4;
/** Direct manipulation quantizes to whole millimetres. */
export const DRAG_QUANTUM_MM = 1;
export const KEYBOARD_STEP_MM = 1;
export const KEYBOARD_STEP_COARSE_MM = 10;
/** Protocol position window. In-range geometry stays with Rust. */
export const PROTOCOL_MM_MIN = -20000;
export const PROTOCOL_MM_MAX = 20000;

export type MmPoint = { x: number; y: number; z: number };
export type ClientPoint = { x: number; y: number };
export type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };

export function keyboardStepMm(coarseModifier: boolean): number {
  return coarseModifier ? KEYBOARD_STEP_COARSE_MM : KEYBOARD_STEP_MM;
}

/**
 * Half away from zero: `sign(d) * floor(abs(d) + 0.5)`.
 * A non-finite delta does not become 0.
 */
export function quantizeMm(delta: number): number | null {
  if (!Number.isFinite(delta)) return null;
  const magnitude = Math.floor(Math.abs(delta) + 0.5);
  if (magnitude === 0) return 0;
  return (delta < 0 ? -1 : 1) * magnitude;
}

export function clientDistance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function matrixOf(m: DOMMatrixReadOnly): Matrix2D {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

export function invertMatrix(m: Matrix2D): Matrix2D | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function applyMatrix(m: Matrix2D, p: ClientPoint): ClientPoint {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
}

export function matrixChanged(captured: Matrix2D, current: Matrix2D): boolean {
  const linear = (['a', 'b', 'c', 'd'] as const).some(
    (key) => Math.abs(captured[key] - current[key]) > 0.001,
  );
  const translation = Math.hypot(captured.e - current.e, captured.f - current.f) > 0.5;
  return linear || translation;
}

/** Domain delta through a CTM frozen at pointerdown. */
export function domainDelta(
  start: ClientPoint,
  current: ClientPoint,
  inverse: Matrix2D,
): { x: number; y: number } | null {
  const a = applyMatrix(inverse, start);
  const b = applyMatrix(inverse, current);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  return { x: b.x - a.x, y: b.y - a.y };
}

export function movedPosition(origin: MmPoint, deltaX: number, deltaY: number): MmPoint | null {
  const qx = quantizeMm(deltaX);
  const qy = quantizeMm(deltaY);
  if (qx === null || qy === null) return null;
  return { x: origin.x + qx, y: origin.y + qy, z: origin.z };
}

export function samePosition(a: MmPoint, b: MmPoint): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function inProtocolRange(position: MmPoint): boolean {
  return [position.x, position.y, position.z].every(
    (value) => Number.isInteger(value) && value >= PROTOCOL_MM_MIN && value <= PROTOCOL_MM_MAX,
  );
}

export function movePlacementCommand(placementId: string, position: MmPoint): LayoutEditCommand {
  return {
    kind: 'movePlacement',
    placementId,
    position: { x: position.x, y: position.y, z: position.z },
  };
}

/** Keep the existing arrow mapping: up decreases depth, right increases width. */
export function nudgePosition(position: MmPoint, key: string, step: number): MmPoint | null {
  if (!Number.isInteger(step) || step <= 0) return null;
  if (key === 'ArrowLeft') return { ...position, x: position.x - step };
  if (key === 'ArrowRight') return { ...position, x: position.x + step };
  if (key === 'ArrowUp') return { ...position, y: position.y - step };
  if (key === 'ArrowDown') return { ...position, y: position.y + step };
  return null;
}

export function isArrowKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Pan so the content follows the pointer. `inverse` is the SVG viewBox CTM
 * frozen at pointerdown, not the flipped domain group.
 */
export function panByFrozenDelta(
  origin: Viewport,
  start: ClientPoint,
  current: ClientPoint,
  inverse: Matrix2D,
): Viewport | null {
  const delta = domainDelta(start, current, inverse);
  if (!delta) return null;
  return {
    zoom: origin.zoom,
    panX: origin.panX - delta.x,
    panY: origin.panY - delta.y,
  };
}

export type MoveGesture = {
  kind: 'move';
  phase: 'armed' | 'preview';
  pointerId: number;
  startClient: ClientPoint;
  origin: MmPoint;
  position: MmPoint;
  placementId: string;
  inverse: Matrix2D;
  ctm: Matrix2D;
  lease: WorkspaceLease;
};

export type PanGesture = {
  kind: 'pan';
  pointerId: number;
  startClient: ClientPoint;
  inverse: Matrix2D;
  origin: Viewport;
  width: number;
  height: number;
};

export type Gesture = MoveGesture | PanGesture;

export function beginMove(args: {
  pointerId: number;
  startClient: ClientPoint;
  origin: MmPoint;
  placementId: string;
  ctm: Matrix2D;
  lease: WorkspaceLease;
}): MoveGesture | null {
  const inverse = invertMatrix(args.ctm);
  if (!inverse) return null;
  if (!inProtocolRange(args.origin)) return null;
  return {
    kind: 'move',
    phase: 'armed',
    pointerId: args.pointerId,
    startClient: args.startClient,
    origin: args.origin,
    position: args.origin,
    placementId: args.placementId,
    inverse,
    ctm: args.ctm,
    lease: args.lease,
  };
}

export type MoveUpdate =
  | { kind: 'armed'; gesture: MoveGesture }
  | { kind: 'preview'; gesture: MoveGesture }
  | { kind: 'cancel'; reason: 'ctm' | 'finite' };

/** Latest sample only. Does not build a command. */
export function updateMove(
  gesture: MoveGesture,
  client: ClientPoint,
  ctm: Matrix2D | null,
): MoveUpdate {
  if (!ctm || matrixChanged(gesture.ctm, ctm)) return { kind: 'cancel', reason: 'ctm' };
  if (clientDistance(gesture.startClient, client) < DRAG_THRESHOLD_PX) {
    return { kind: 'armed', gesture: { ...gesture, phase: 'armed', position: gesture.origin } };
  }
  const delta = domainDelta(gesture.startClient, client, gesture.inverse);
  if (!delta) return { kind: 'cancel', reason: 'finite' };
  const position = movedPosition(gesture.origin, delta.x, delta.y);
  if (!position) return { kind: 'cancel', reason: 'finite' };
  return { kind: 'preview', gesture: { ...gesture, phase: 'preview', position } };
}

export type MoveFinish =
  | { kind: 'click' }
  | { kind: 'noop' }
  | { kind: 'cancel'; reason: 'lease' | 'ctm' | 'finite' }
  | { kind: 'precheck'; message: string }
  | { kind: 'commit'; command: LayoutEditCommand };

export function finishMove(
  gesture: MoveGesture,
  client: ClientPoint,
  ctm: Matrix2D | null,
  leaseNow: WorkspaceLease | null,
): MoveFinish {
  const updated = updateMove(gesture, client, ctm);
  if (updated.kind === 'cancel') return { kind: 'cancel', reason: updated.reason };
  if (updated.kind === 'armed') return { kind: 'click' };
  if (!leasesEqual(gesture.lease, leaseNow)) return { kind: 'cancel', reason: 'lease' };
  const position = updated.gesture.position;
  if (samePosition(position, gesture.origin)) return { kind: 'noop' };
  if (!inProtocolRange(position)) {
    return { kind: 'precheck', message: '허용된 수치 범위(±20000mm)를 벗어났습니다' };
  }
  return { kind: 'commit', command: movePlacementCommand(gesture.placementId, position) };
}

export function beginPan(args: {
  pointerId: number;
  startClient: ClientPoint;
  ctm: Matrix2D;
  viewport: Viewport;
  width: number;
  height: number;
}): PanGesture | null {
  const inverse = invertMatrix(args.ctm);
  if (!inverse) return null;
  return {
    kind: 'pan',
    pointerId: args.pointerId,
    startClient: args.startClient,
    inverse,
    origin: args.viewport,
    width: args.width,
    height: args.height,
  };
}

export function updatePan(
  gesture: PanGesture,
  client: ClientPoint,
  width: number,
  height: number,
): Viewport | null {
  if (width !== gesture.width || height !== gesture.height) return null;
  return panByFrozenDelta(gesture.origin, gesture.startClient, client, gesture.inverse);
}
