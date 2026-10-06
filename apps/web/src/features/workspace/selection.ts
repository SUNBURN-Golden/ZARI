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
