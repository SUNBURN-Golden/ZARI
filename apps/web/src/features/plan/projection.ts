import type {
  LayoutEditCommand,
  PlanSnapshot,
  SnapshotContent,
  SpatialElement,
  SpatialProjection,
} from '../../contracts/generated/dto';
import { subjectLabel } from './view';

/**
 * Display adapter over one authoritative `SpatialProjection`.
 * Rectangles stay in domain-plane millimetres (`[x,y]` / `[x,z]`).
 * The SVG inverts an axis only while painting. This module does not
 * recompute yaw, parent offsets, or fit.
 */

export interface RectVm {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Placement id for cross-highlighting. Contained items keep their parent. */
  refId: string;
  kind: 'container' | 'item' | 'contained' | 'ghost';
}

export interface ProjectionEntry {
  status: 'loading' | 'ready' | 'failed';
  projection: SpatialProjection | null;
  failureCode: string | null;
}

export interface ProjectionLease {
  projectId: string;
  sourceKey: string;
  /** Identity of the Worker client that sent the request. */
  worker: object;
  /** Session generation captured at send; close/replace bumps it. */
  mountedGeneration: number;
}

/** Immutable plan projections are keyed by snapshot id, never by editor text. */
export function planSourceKey(planSnapshotId: string): string {
  return `plan:${planSnapshotId}`;
}

/**
 * A system reply may outlive an editor-epoch bump. Apply it only when the
 * captured lease still names this project, source, worker, and mount.
 */
export function projectionLeaseMatches(
  captured: ProjectionLease,
  current: ProjectionLease,
): boolean {
  return (
    captured.projectId === current.projectId &&
    captured.sourceKey === current.sourceKey &&
    captured.worker === current.worker &&
    captured.mountedGeneration === current.mountedGeneration
  );
}

const DRAW_ROLES = new Set<SpatialElement['role']>([
  'directItem',
  'ownedContainer',
  'newContainer',
  'containedItem',
]);

function rectOf(
  geometry: SpatialElement['topRect'],
): { x: number; y: number; width: number; height: number } | null {
  if (geometry.kind !== 'available') return null;
  const width = geometry.value.max[0] - geometry.value.min[0];
  const height = geometry.value.max[1] - geometry.value.min[1];
  if (width <= 0 || height <= 0) return null;
  return {
    x: geometry.value.min[0],
    y: geometry.value.min[1],
    width,
    height,
  };
}

function elementLabel(content: SnapshotContent, element: SpatialElement): string {
  const target = element.target;
  if (target.kind === 'placement') {
    const placement = content.placements.find((item) => item.id === target.placementId);
    return placement ? subjectLabel(content, placement.subject) : target.placementId;
  }
  if (target.kind === 'itemInstance') {
    const item = content.inputFacts.items.find((entry) => entry.id === target.itemId);
    const label = item?.label ?? target.itemId;
    return target.unitOrdinal > 0 ? `${label} #${target.unitOrdinal + 1}` : label;
  }
  return '';
}

function elementKind(role: SpatialElement['role']): RectVm['kind'] {
  if (role === 'containedItem') return 'contained';
  if (role === 'directItem') return 'item';
  return 'container';
}

/** Space outline from the compartment element. `null` when that axis is unknown. */
export function spaceFrame(
  projection: SpatialProjection,
  view: 'top' | 'front',
): { width: number; height: number } | null {
  const boundary = projection.elements.find(
    (element) => element.role === 'compartmentBoundary',
  );
  if (!boundary) return null;
  const rect = rectOf(view === 'top' ? boundary.topRect : boundary.frontRect);
  if (!rect) return null;
  return { width: rect.width, height: rect.height };
}

/**
 * Placement and contained-item rectangles for one view. Unavailable world
 * rectangles are omitted — they are never replaced with a parent+local sum.
 */
export function diagramRects(
  projection: SpatialProjection,
  content: SnapshotContent,
  view: 'top' | 'front',
): RectVm[] {
  const rects: RectVm[] = [];
  for (const element of projection.elements) {
    if (!DRAW_ROLES.has(element.role)) continue;
    const rect = rectOf(view === 'top' ? element.topRect : element.frontRect);
    if (!rect) continue;
    const refId =
      element.role === 'containedItem'
        ? (element.parentPlacementId ?? '')
        : element.target.kind === 'placement'
          ? element.target.placementId
          : '';
    rects.push({
      ...rect,
      label: elementLabel(content, element),
      refId,
      kind: elementKind(element.role),
    });
  }
  return rects;
}

export function containedOffsetUnknown(projection: SpatialProjection): boolean {
  return projection.elements.some(
    (element) =>
      element.role === 'containedItem' &&
      element.worldBox.kind === 'unavailable' &&
      element.worldBox.reasonCode === 'offset_unknown',
  );
}

/**
 * Provisional preview of an in-flight edit. A move translates the
 * authoritative top rectangle. A 90° rotation swaps that rectangle's
 * already-projected width and depth. Neither path reads measurements.
 */
export function ghostFromProjection(
  projection: SpatialProjection,
  content: SnapshotContent,
  command: LayoutEditCommand,
): RectVm | null {
  if (command.kind !== 'movePlacement' && command.kind !== 'rotatePlacement') return null;
  const placement = content.placements.find((item) => item.id === command.placementId);
  if (!placement) return null;
  const element = projection.elements.find(
    (item) =>
      item.target.kind === 'placement' &&
      item.target.placementId === command.placementId &&
      (item.role === 'directItem' ||
        item.role === 'ownedContainer' ||
        item.role === 'newContainer'),
  );
  if (!element) return null;
  const rect = rectOf(element.topRect);
  if (!rect) return null;
  let { x, y, width, height } = rect;
  if (command.kind === 'movePlacement') {
    x = command.position.x;
    y = command.position.y;
  } else if (command.orientation !== placement.orientation) {
    const swapped = width;
    width = height;
    height = swapped;
  }
  return {
    x,
    y,
    width,
    height,
    label: `${subjectLabel(content, placement.subject)} (검증 중)`,
    refId: placement.id,
    kind: 'ghost',
  };
}

/** Session-local LRU. Not persisted, not part of a snapshot hash. */
export class ProjectionCache {
  private entries = new Map<string, SpatialProjection>();
  constructor(
    private readonly maxEntries = 4,
    private readonly maxBytes = 8 * 1024 * 1024,
  ) {}
  get(key: string): SpatialProjection | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }
  set(key: string, projection: SpatialProjection): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, projection);
    this.evict();
  }
  clear(): void {
    this.entries.clear();
  }
  private evict(): void {
    while (this.entries.size > this.maxEntries) this.dropOldest();
    while (this.entries.size > 1 && this.bytes() > this.maxBytes) this.dropOldest();
  }
  private dropOldest(): void {
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) this.entries.delete(oldest);
  }
  private bytes(): number {
    let total = 0;
    for (const projection of this.entries.values()) {
      total += JSON.stringify(projection).length;
    }
    return total;
  }
}

export function readProjection(
  projections: Record<string, ProjectionEntry>,
  snapshot: PlanSnapshot,
): ProjectionEntry | null {
  return projections[planSourceKey(snapshot.planSnapshotId)] ?? null;
}
