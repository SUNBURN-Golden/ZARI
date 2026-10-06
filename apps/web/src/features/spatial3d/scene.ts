import type {
  SnapshotContent,
  SpatialElement,
  SpatialProjection,
  SpatialTarget,
} from '../../contracts/generated/dto';
import type { WorkspaceFocus, WorkspaceLayers } from '../workspace/model';
import { elementLabel } from '../workspace/projection';
import { focusTargets, targetIn, targetKey, targetsEqual } from '../workspace/selection';
import type { Fit } from './camera';
import {
  domainMmToThree,
  faceCenterMm,
  faceSpan,
  meshFromWorldBox,
  type Face,
} from './mapping';

export type Cutaway = {
  hideFront: boolean;
  hideTop: boolean;
  interiorPlacementId: string | null;
};

export type SpatialBody = {
  key: string;
  target: SpatialTarget;
  role: string;
  label: string;
  parentPlacementId: string | null;
  center: [number, number, number];
  size: [number, number, number];
  face?: Face;
  minMm: [number, number, number];
  maxMm: [number, number, number];
  pickable: boolean;
};

export type UnavailableNote = {
  key: string;
  label: string;
  reasonCode: string;
};

export type ScenePlan = {
  cuboids: SpatialBody[];
  planes: SpatialBody[];
  edges: SpatialBody[];
  unavailable: UnavailableNote[];
  fit: Fit | null;
  signature: string;
  highlight: string;
  selectedKey: string | null;
  focusKeys: string[];
};

const FACES: readonly Face[] = ['floor', 'back', 'left', 'right', 'front', 'top'];

const CUBOID_ROLES = new Set<SpatialElement['role']>([
  'directItem',
  'ownedContainer',
  'newContainer',
  'containedItem',
  'physicalObstacle',
  'accessExclusion',
  'supportSurface',
  'aperture',
]);

export function interiorPlacementId(
  projection: SpatialProjection,
  selection: SpatialTarget | null,
  enabled: boolean,
): string | null {
  if (!enabled || selection?.kind !== 'placement') return null;
  const match = projection.elements.some(
    (element) =>
      (element.role === 'ownedContainer' || element.role === 'newContainer') &&
      element.target.kind === 'placement' &&
      element.target.placementId === selection.placementId,
  );
  return match ? selection.placementId : null;
}

export function reasonText(code: string): string {
  if (code === 'offset_unknown') return '외형 안의 실제 위치 미확인 · 별도 좌표계';
  if (code === 'zero_thickness_plane') return '두께가 없는 면이라 입체로 만들지 않습니다';
  return `입체 상자를 만들 수 없음 (${code})`;
}

export function cuboidInstanceIndex(plan: ScenePlan, target: SpatialTarget): number {
  return plan.cuboids.findIndex((body) => targetsEqual(body.target, target));
}

/**
 * Read-only scene. World boxes come from the projection; a missing axis is not filled in.
 * Hidden cut faces are omitted, so they cannot be picked.
 */
export function planScene(
  projection: SpatialProjection,
  content: SnapshotContent,
  layers: WorkspaceLayers,
  selection: SpatialTarget | null,
  focus: WorkspaceFocus,
  cutaway: Cutaway,
): ScenePlan {
  const cuboids: SpatialBody[] = [];
  const planes: SpatialBody[] = [];
  const edges: SpatialBody[] = [];
  const unavailable: UnavailableNote[] = [];

  for (const element of projection.elements) {
    if (element.role === 'compartmentBoundary') {
      pushBoundary(element, content, cutaway, planes, unavailable);
      continue;
    }
    if (element.role === 'innerCavity' || element.role === 'itemEnvelope') {
      noteIfUnavailable(element, content, unavailable);
      continue;
    }
    if (!CUBOID_ROLES.has(element.role)) continue;
    pushCuboid(element, content, layers, cutaway, cuboids, unavailable);
  }

  if (layers.checks) {
    const linked = focusTargets(projection, focus);
    for (const overlay of projection.overlays) {
      const selected = targetsEqual(overlay.target, selection);
      const onCheck = focus.kind === 'check' && overlay.checkIds.includes(focus.checkId);
      const onLink = targetIn(linked, overlay.target);
      if (!selected && !onCheck && !onLink) continue;
      if (overlay.geometry.kind !== 'available') continue;
      const mesh = meshFromWorldBox(overlay.geometry.value);
      if (!mesh) continue;
      edges.push({
        key: overlay.overlayId,
        target: overlay.target,
        role: overlay.role,
        label: overlay.role,
        parentPlacementId: null,
        center: mesh.center,
        size: mesh.size,
        minMm: mesh.minMm,
        maxMm: mesh.maxMm,
        pickable: false,
      });
    }
  }

  const selectedKey = selection ? targetKey(selection) : null;
  const focusKeys = focusTargets(projection, focus).map((target) => targetKey(target));
  return {
    cuboids,
    planes,
    edges,
    unavailable,
    fit: fitOf([...cuboids, ...planes, ...edges]),
    signature: [...cuboids, ...planes, ...edges].map(bodySig).join('|'),
    highlight: `${selectedKey ?? ''}#${focusKeys.join(',')}`,
    selectedKey,
    focusKeys,
  };
}

function pushBoundary(
  element: SpatialElement,
  content: SnapshotContent,
  cutaway: Cutaway,
  planes: SpatialBody[],
  unavailable: UnavailableNote[],
): void {
  if (element.worldBox.kind !== 'available') {
    noteIfUnavailable(element, content, unavailable);
    return;
  }
  const min = element.worldBox.value.min;
  const max = element.worldBox.value.max;
  const label = elementLabel(content, element) || '구획 경계';
  for (const face of FACES) {
    if (face === 'front' && cutaway.hideFront) continue;
    if (face === 'top' && cutaway.hideTop) continue;
    const centerMm = faceCenterMm(min, max, face);
    const span = faceSpan(min, max, face);
    if (!(span[0] > 0 && span[1] > 0)) continue;
    planes.push({
      key: `${element.role}:${targetKey(element.target)}:${face}`,
      target: element.target,
      role: element.role,
      label,
      parentPlacementId: element.parentPlacementId,
      center: domainMmToThree(centerMm[0], centerMm[1], centerMm[2]),
      size: [span[0], span[1], 1],
      face,
      minMm: [min[0], min[1], min[2]],
      maxMm: [max[0], max[1], max[2]],
      pickable: true,
    });
  }
}

function pushCuboid(
  element: SpatialElement,
  content: SnapshotContent,
  layers: WorkspaceLayers,
  cutaway: Cutaway,
  cuboids: SpatialBody[],
  unavailable: UnavailableNote[],
): void {
  if (element.worldBox.kind !== 'available') {
    noteIfUnavailable(element, content, unavailable);
    return;
  }
  const mesh = meshFromWorldBox(element.worldBox.value);
  if (!mesh) {
    unavailable.push({
      key: `${element.role}:${targetKey(element.target)}`,
      label: elementLabel(content, element) || element.role,
      reasonCode: 'non_positive_extent',
    });
    return;
  }
  const interior = cutaway.interiorPlacementId;
  const selectedContainer =
    interior !== null &&
    (element.role === 'ownedContainer' || element.role === 'newContainer') &&
    element.target.kind === 'placement' &&
    element.target.placementId === interior;
  if (selectedContainer) return;
  const child = element.role === 'containedItem';
  if (child) {
    const inOpenContainer = interior !== null && element.parentPlacementId === interior;
    if (!layers.contents && !inOpenContainer) return;
  }
  const pickable = child ? interior !== null && element.parentPlacementId === interior : true;
  cuboids.push({
    key: `${element.role}:${targetKey(element.target)}`,
    target: element.target,
    role: element.role,
    label: elementLabel(content, element),
    parentPlacementId: element.parentPlacementId,
    center: mesh.center,
    size: mesh.size,
    minMm: mesh.minMm,
    maxMm: mesh.maxMm,
    pickable,
  });
}

function noteIfUnavailable(
  element: SpatialElement,
  content: SnapshotContent,
  unavailable: UnavailableNote[],
): void {
  if (element.worldBox.kind !== 'unavailable') return;
  unavailable.push({
    key: `${element.role}:${targetKey(element.target)}`,
    label: elementLabel(content, element) || element.role,
    reasonCode: element.worldBox.reasonCode,
  });
}

function bodySig(body: SpatialBody): string {
  const round = (value: number) => String(Math.round(value * 1000));
  return [
    body.key,
    body.pickable ? '1' : '0',
    round(body.center[0]),
    round(body.center[1]),
    round(body.center[2]),
    round(body.size[0]),
    round(body.size[1]),
    round(body.size[2]),
  ].join(',');
}

function fitOf(bodies: readonly SpatialBody[]): Fit | null {
  if (bodies.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const body of bodies) {
    const a = domainMmToThree(body.minMm[0], body.minMm[1], body.minMm[2]);
    const b = domainMmToThree(body.maxMm[0], body.maxMm[1], body.maxMm[2]);
    minX = Math.min(minX, a[0], b[0]);
    maxX = Math.max(maxX, a[0], b[0]);
    minY = Math.min(minY, a[1], b[1]);
    maxY = Math.max(maxY, a[1], b[1]);
    minZ = Math.min(minZ, a[2], b[2]);
    maxZ = Math.max(maxZ, a[2], b[2]);
  }
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxSpan = Math.max(sizeX, sizeY, sizeZ);
  const radius = 0.5 * Math.hypot(sizeX, sizeY, sizeZ);
  if (!(maxSpan > 0) || !(radius > 0)) return null;
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    maxSpan,
    radius,
  };
}
