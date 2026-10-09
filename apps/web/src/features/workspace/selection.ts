import type {
  SpatialProjection,
  SpatialTarget,
} from '../../contracts/generated/dto';
import type { WorkspaceFocus } from './model';

/** Stable key shared with the projector's target namespace. Not a geometry id. */
export function targetKey(target: SpatialTarget): string {
  switch (target.kind) {
    case 'space':
      return `space:${target.spaceId}`;
    case 'opening':
      return `opening:${target.spaceId}`;
    case 'obstacle':
      return `obstacle:${target.obstacleId}`;
    case 'support':
      return `support:${target.supportId}`;
    case 'placement':
      return `placement:${target.placementId}`;
    case 'item':
      return `item:${target.itemId}`;
    case 'itemInstance':
      return `instance:${target.itemId}:${target.unitOrdinal}`;
    default: {
      const _never: never = target;
      return _never;
    }
  }
}

export function targetsEqual(a: SpatialTarget | null, b: SpatialTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return targetKey(a) === targetKey(b);
}

/**
 * Compatibility adapter for the existing edit inspector.
 * Only an explicit placement selection arms move/rotate. A contained item
 * does not inherit the parent placement id.
 */
export function selectedPlacementId(selection: SpatialTarget | null): string | null {
  return selection?.kind === 'placement' ? selection.placementId : null;
}

export function isItemInstance(selection: SpatialTarget | null): boolean {
  return selection?.kind === 'itemInstance';
}

/** Parent placement recorded on the projected element. Never guessed from a name. */
export function parentPlacementId(
  projection: SpatialProjection | null,
  selection: SpatialTarget | null,
): string | null {
  if (!projection || !selection) return null;
  const element = projection.elements.find((item) => targetsEqual(item.target, selection));
  return element?.parentPlacementId ?? null;
}

/**
 * Highlight channel for a check, BOM line, or action step.
 * Targets come only from the projection link of this binding.
 * An unavailable link highlights nothing.
 */
export function focusTargets(
  projection: SpatialProjection | null,
  focus: WorkspaceFocus,
): SpatialTarget[] {
  if (!projection || focus.kind === 'none' || focus.kind === 'measurement') return [];
  const link = projection.links.find((item) => {
    if (focus.kind === 'check') {
      return item.source.kind === 'check' && item.source.checkId === focus.checkId;
    }
    if (focus.kind === 'bom') {
      return item.source.kind === 'bom' && item.source.bomLineId === focus.bomLineId;
    }
    return item.source.kind === 'action' && item.source.stepId === focus.stepId;
  });
  if (!link || link.resolution === 'unavailable') return [];
  return link.targets;
}

export function targetIn(targets: readonly SpatialTarget[], target: SpatialTarget): boolean {
  return targets.some((item) => targetsEqual(item, target));
}

/** Polite name for the current selection. Visual outline and this sentence stay together. */
export function selectionAnnouncement(selection: SpatialTarget | null, label: string | null): string {
  if (!selection) return '선택된 대상 없음';
  const name = label && label.trim() !== '' ? label : targetKey(selection);
  return `선택됨 ${name}`;
}

/** Polite name for the list-focus channel. It is not the selection outline. */
export function focusAnnouncement(focus: WorkspaceFocus): string {
  switch (focus.kind) {
    case 'none':
    case 'measurement':
      return '목록 강조 없음';
    case 'check':
      return `목록 강조 검사 ${focus.checkId}`;
    case 'bom':
      return `목록 강조 구매 행 ${focus.bomLineId}`;
    case 'action':
      return `목록 강조 현재 단계 ${focus.stepId}`;
    default: {
      const neverFocus: never = focus;
      return neverFocus;
    }
  }
}
