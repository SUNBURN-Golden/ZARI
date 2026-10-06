import type {
  FactFor_MeasuredLength,
  ProjectInput,
  SnapshotContent,
  SpatialElement,
  SpatialOverlay,
  SpatialProjection,
  SpatialTarget,
} from '../../contracts/generated/dto';
import { subjectLabel } from '../plan/view';
import type { WorkspaceFocus, WorkspaceLayers } from './model';
import { focusTargets, targetIn, targetKey, targetsEqual } from './selection';

/**
 * Read-only indexing over one SpatialProjection.
 * Rectangles stay in domain-plane millimetres. Nothing here estimates an
 * unknown length, centers a cavity, or treats a missing axis as zero.
 */

export type Plane = 'top' | 'front';

export type PlaneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const WORLD_ROLES = new Set<SpatialElement['role']>([
  'aperture',
  'physicalObstacle',
  'accessExclusion',
  'directItem',
  'ownedContainer',
  'newContainer',
  'containedItem',
]);

export type SceneRect = PlaneRect & {
  key: string;
  label: string;
  target: SpatialTarget;
  role: SpatialElement['role'];
  parentPlacementId: string | null;
};

export type Segment2 = { x1: number; y1: number; x2: number; y2: number };

function planeOf(element: SpatialElement, view: Plane): SpatialElement['topRect'] {
  return view === 'top' ? element.topRect : element.frontRect;
}

export function rectFromGeometry(
  geometry: SpatialElement['topRect'],
): PlaneRect | null {
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

/** Project an already-built world box onto one plane. A zero-extent axis is not a rectangle. */
export function rectFromBox(
  geometry: SpatialOverlay['geometry'],
  view: Plane,
): PlaneRect | null {
  if (geometry.kind !== 'available') return null;
  const min = geometry.value.min;
  const max = geometry.value.max;
  const y0 = view === 'top' ? min[1] : min[2];
  const y1 = view === 'top' ? max[1] : max[2];
  const width = max[0] - min[0];
  const height = y1 - y0;
  if (width <= 0 || height <= 0) return null;
  return { x: min[0], y: y0, width, height };
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
  if (target.kind === 'opening') return '입구';
  if (target.kind === 'obstacle') return '장애물';
  if (target.kind === 'support') return '지지면';
  if (element.role === 'accessExclusion') return '접근 제외';
  return '';
}

export function sceneRects(
  projection: SpatialProjection,
  content: SnapshotContent,
  view: Plane,
  layers: WorkspaceLayers,
): SceneRect[] {
  const rects: SceneRect[] = [];
  for (const element of projection.elements) {
    if (!WORLD_ROLES.has(element.role)) continue;
    if (element.role === 'containedItem' && !layers.contents) continue;
    const rect = rectFromGeometry(planeOf(element, view));
    if (!rect) continue;
    rects.push({
      ...rect,
      key: `${element.role}:${targetKey(element.target)}`,
      label: elementLabel(content, element),
      target: element.target,
      role: element.role,
      parentPlacementId: element.parentPlacementId,
    });
  }
  return rects;
}

export type OverlayRect = PlaneRect & {
  key: string;
  role: SpatialOverlay['role'];
  label: string;
};

const OVERLAY_LABEL: Record<SpatialOverlay['role'], string> = {
  nominalOuter: '외경',
  conservativeOuter: '보수적 외경',
  nominalInner: '내경',
  conservativeInner: '보수적 내경',
  installationSweep: '설치 경로',
  operationalSweep: '사용 경로',
  staging: '앞쪽 작업 영역',
  supportFootprint: '지지 바닥',
};

/**
 * Check layer is opt-in. Only overlays of the selected target or the focused
 * check/link are drawn, and only when the projector supplied a box.
 */
export function checkOverlayRects(
  projection: SpatialProjection,
  view: Plane,
  selection: SpatialTarget | null,
  focus: WorkspaceFocus,
  layers: WorkspaceLayers,
): OverlayRect[] {
  if (!layers.checks) return [];
  const linked = focusTargets(projection, focus);
  const rects: OverlayRect[] = [];
  for (const overlay of projection.overlays) {
    const selected = targetsEqual(overlay.target, selection);
    const onCheck = focus.kind === 'check' && overlay.checkIds.includes(focus.checkId);
    const onLink = targetIn(linked, overlay.target);
    if (!selected && !onCheck && !onLink) continue;
    const rect = rectFromBox(overlay.geometry, view);
    if (!rect) continue;
    rects.push({
      ...rect,
      key: overlay.overlayId,
      role: overlay.role,
      label: OVERLAY_LABEL[overlay.role] ?? overlay.role,
    });
  }
  return rects;
}

export function segmentOnPlane(
  segment: SpatialProjection['dimensions'][number]['segment'],
  view: Plane,
): Segment2 | null {
  if (segment.kind !== 'available') return null;
  const from = segment.value.from;
  const to = segment.value.to;
  const line =
    view === 'top'
      ? { x1: from[0], y1: from[1], x2: to[0], y2: to[1] }
      : { x1: from[0], y1: from[2], x2: to[0], y2: to[2] };
  if (line.x1 === line.x2 && line.y1 === line.y2) return null;
  return line;
}

export type DimensionLine = Segment2 & {
  guideId: string;
  fieldPath: string;
  label: string;
  emphasized: boolean;
};

export function dimensionLines(
  projection: SpatialProjection,
  view: Plane,
  layers: WorkspaceLayers,
  selection: SpatialTarget | null,
  focus: WorkspaceFocus,
): DimensionLine[] {
  if (!layers.dimensions) return [];
  const linked = focusTargets(projection, focus);
  const lines: DimensionLine[] = [];
  for (const guide of projection.dimensions) {
    if (guide.preferredView !== view) continue;
    const line = segmentOnPlane(guide.segment, view);
    if (!line) continue;
    const emphasized = targetsEqual(guide.target, selection) || targetIn(linked, guide.target);
    lines.push({
      ...line,
      guideId: guide.guideId,
      fieldPath: guide.fieldPath,
      label: lengthFactText(guide.measurement).valueText ?? '',
      emphasized,
    });
  }
  return lines;
}

const ORIGIN_TEXT: Record<string, string> = {
  synthetic: '합성',
  manufacturer: '제조사',
  retailer: '판매처',
  userMeasured: '사용자 측정',
  userDeclared: '사용자 입력',
  aiEstimated: '추정',
  derived: '파생',
};

const VERIFY_TEXT: Record<string, string> = {
  unverified: '미검증',
  estimated: '추정',
  confirmed: '확인됨',
};

const UNKNOWN_TEXT: Record<string, string> = {
  notMeasured: '미측정',
  notProvided: '미제공',
  sourceMissing: '출처 없음',
  conflictingSources: '출처 충돌',
};

export type FactRead = {
  valueText: string | null;
  uncertaintyNote: string | null;
  provenanceText: string | null;
  state: 'known' | 'unknown' | 'notApplicable' | 'absent';
};

export function lengthFactText(fact: FactFor_MeasuredLength | null | undefined): FactRead {
  if (!fact) return { valueText: null, uncertaintyNote: null, provenanceText: null, state: 'absent' };
  if (fact.state === 'unknown') {
    return {
      valueText: null,
      uncertaintyNote: UNKNOWN_TEXT[fact.reason] ?? '미확인',
      provenanceText: null,
      state: 'unknown',
    };
  }
  if (fact.state === 'notApplicable') {
    return {
      valueText: null,
      uncertaintyNote: fact.reasonCode,
      provenanceText: null,
      state: 'notApplicable',
    };
  }
  return {
    valueText: `${fact.value.nominal} mm`,
    uncertaintyNote: fact.value.uncertainty.state === 'unknown' ? '측정 오차 미확인' : null,
    provenanceText: `${ORIGIN_TEXT[fact.provenance.origin] ?? fact.provenance.origin} · ${VERIFY_TEXT[fact.provenance.verification] ?? fact.provenance.verification}`,
    state: 'known',
  };
}

const FIELD_CAPTION: Record<string, string> = {
  'space.interior.width': '왼쪽 안쪽 면부터 오른쪽 안쪽 면까지',
  'space.interior.depth': '입구 쪽 안쪽 면부터 뒤쪽 안쪽 면까지',
  'space.interior.height': '사용할 바닥면부터 위쪽 경계까지',
  'space.opening.width': '내부 치수와 입구 치수는 다를 수 있습니다',
  'space.opening.height': '내부 치수와 입구 치수는 다를 수 있습니다',
};

export type ParsedField =
  | { kind: 'interior' | 'opening'; axis: 'width' | 'depth' | 'height' }
  | { kind: 'item'; itemId: string; axis: 'width' | 'depth' | 'height' };

const ITEM_FIELD = /^items\.([^.]+)\.dimensions\.envelope\.(width|depth|height)$/;

/** Field paths use the shared grammar. Item ids are read from the path, not hard-coded. */
export function parseMeasurementField(fieldPath: string): ParsedField | null {
  if (fieldPath.startsWith('space.interior.')) {
    const axis = fieldPath.slice('space.interior.'.length);
    if (axis === 'width' || axis === 'depth' || axis === 'height') return { kind: 'interior', axis };
  }
  if (fieldPath.startsWith('space.opening.')) {
    const axis = fieldPath.slice('space.opening.'.length);
    if (axis === 'width' || axis === 'height') return { kind: 'opening', axis };
  }
  const match = ITEM_FIELD.exec(fieldPath);
  if (!match?.[1] || !match[2]) return null;
  const axis = match[2];
  if (axis !== 'width' && axis !== 'depth' && axis !== 'height') return null;
  return { kind: 'item', itemId: match[1], axis };
}

export function fieldCaption(fieldPath: string): string {
  const known = FIELD_CAPTION[fieldPath];
  if (known) return known;
  const parsed = parseMeasurementField(fieldPath);
  if (parsed?.kind === 'item') {
    if (parsed.axis === 'width') return '물건의 폭. 수량이나 배치와는 별개의 측정입니다';
    if (parsed.axis === 'depth') return '물건의 깊이. 수량이나 배치와는 별개의 측정입니다';
    return '물건의 높이. 수량이나 배치와는 별개의 측정입니다';
  }
  return '측정 위치';
}

export function preferredMeasureView(
  fieldPath: string,
  projection: SpatialProjection | null,
): Plane {
  const guide = projection?.dimensions.find((item) => item.fieldPath === fieldPath);
  if (guide?.preferredView === 'top' || guide?.preferredView === 'front') return guide.preferredView;
  const parsed = parseMeasurementField(fieldPath);
  if (parsed?.kind === 'interior' && parsed.axis === 'depth') return 'top';
  if (parsed?.kind === 'item' && parsed.axis !== 'height') return 'top';
  return 'front';
}

export type MeasureBlock = 'stale' | 'invalid';

export type MeasureDrawing = {
  caption: string;
  view: Plane;
  mode: 'scaled' | 'schematic';
  /** Why a scaled region is withheld. `null` only when `mode` is `scaled`. */
  reason: 'unknown' | 'invalid' | 'stale' | 'pending' | 'failed' | null;
  frame: { width: number; height: number } | null;
  segment: Segment2 | null;
  silhouette: PlaneRect | null;
  valueText: string | null;
  uncertaintyNote: string | null;
  provenanceText: string | null;
  /** Item silhouettes are a separate measuring frame, never the room origin. */
  separateFrame: boolean;
};

function emptyDrawing(
  fieldPath: string,
  view: Plane,
  reason: MeasureDrawing['reason'],
): MeasureDrawing {
  return {
    caption: fieldCaption(fieldPath),
    view,
    mode: 'schematic',
    reason,
    frame: null,
    segment: null,
    silhouette: null,
    valueText: null,
    uncertaintyNote: null,
    provenanceText: null,
    separateFrame: false,
  };
}

function spaceFact(
  input: ProjectInput | null,
  fieldPath: string,
): FactFor_MeasuredLength | null {
  if (!input) return null;
  if (fieldPath === 'space.interior.width') return input.space.interior.width;
  if (fieldPath === 'space.interior.depth') return input.space.interior.depth;
  if (fieldPath === 'space.interior.height') return input.space.interior.height;
  if (fieldPath === 'space.opening.width') return input.space.opening.width;
  if (fieldPath === 'space.opening.height') return input.space.opening.height;
  return null;
}

function itemFact(
  input: ProjectInput | null,
  itemId: string,
  axis: 'width' | 'depth' | 'height',
): FactFor_MeasuredLength | null {
  const item = input?.items.find((entry) => entry.id === itemId);
  return item?.dimensions.envelope[axis] ?? null;
}

function planeFrame(
  projection: SpatialProjection,
  fieldPath: string,
  view: Plane,
): { width: number; height: number } | null {
  const parsed = parseMeasurementField(fieldPath);
  if (!parsed || parsed.kind === 'item') return null;
  const role = parsed.kind === 'opening' ? 'aperture' : 'compartmentBoundary';
  const element = projection.elements.find((item) => item.role === role);
  if (!element) return null;
  const rect = rectFromGeometry(planeOf(element, view));
  if (!rect) return null;
  return { width: rect.width, height: rect.height };
}

function itemEdge(
  box: Extract<SpatialElement['measurementBox'], { kind: 'available' }>,
  view: Plane,
  axis: 'width' | 'depth' | 'height',
): { frame: { width: number; height: number }; silhouette: PlaneRect; segment: Segment2 } | null {
  const min = box.value.min;
  const max = box.value.max;
  if (view === 'top') {
    const width = max[0] - min[0];
    const height = max[1] - min[1];
    if (width <= 0 || height <= 0) return null;
    const silhouette = { x: min[0], y: min[1], width, height };
    const segment =
      axis === 'depth'
        ? { x1: min[0], y1: min[1], x2: min[0], y2: max[1] }
        : { x1: min[0], y1: min[1], x2: max[0], y2: min[1] };
    return { frame: { width, height }, silhouette, segment };
  }
  const width = max[0] - min[0];
  const height = max[2] - min[2];
  if (width <= 0 || height <= 0) return null;
  const silhouette = { x: min[0], y: min[2], width, height };
  const segment =
    axis === 'height'
      ? { x1: min[0], y1: min[2], x2: min[0], y2: max[2] }
      : { x1: min[0], y1: min[2], x2: max[0], y2: min[2] };
  return { frame: { width, height }, silhouette, segment };
}

/**
 * Scaled geometry is drawn only from an available projector rectangle or an
 * item measurement box. A known single axis is text, not a fake region.
 * Stale or invalid input never reuses the previous scaled segment.
 */
export function measurementDrawing(
  fieldPath: string | null,
  projection: SpatialProjection | null,
  projectionStatus: 'loading' | 'ready' | 'failed' | 'absent',
  input: ProjectInput | null,
  block: MeasureBlock | null,
): MeasureDrawing {
  const path = fieldPath ?? '';
  const view = fieldPath ? preferredMeasureView(fieldPath, projection) : 'front';
  if (!fieldPath) return emptyDrawing(path, view, 'pending');
  if (block) return emptyDrawing(fieldPath, view, block);
  if (projectionStatus === 'loading' || projectionStatus === 'absent' || !projection) {
    return emptyDrawing(fieldPath, view, projectionStatus === 'failed' ? 'failed' : 'pending');
  }
  if (projectionStatus === 'failed') return emptyDrawing(fieldPath, view, 'failed');

  const parsed = parseMeasurementField(fieldPath);
  const guide = projection.dimensions.find((item) => item.fieldPath === fieldPath);
  const fact = guide?.measurement ?? (parsed?.kind === 'item'
    ? itemFact(input, parsed.itemId, parsed.axis)
    : spaceFact(input, fieldPath));
  const read = lengthFactText(fact);
  const base: MeasureDrawing = {
    ...emptyDrawing(fieldPath, view, 'unknown'),
    valueText: read.valueText,
    uncertaintyNote: read.uncertaintyNote,
    provenanceText: read.provenanceText,
  };

  if (parsed?.kind === 'item') {
    const element = projection.elements.find(
      (item) =>
        item.role === 'itemEnvelope' &&
        item.target.kind === 'item' &&
        item.target.itemId === parsed.itemId,
    );
    const box = element?.measurementBox;
    if (box?.kind === 'available') {
      const edge = itemEdge(box, view, parsed.axis);
      if (edge) {
        return {
          ...base,
          mode: 'scaled',
          reason: null,
          frame: edge.frame,
          segment: edge.segment,
          silhouette: edge.silhouette,
          separateFrame: true,
        };
      }
    }
    return { ...base, separateFrame: true };
  }

  const frame = planeFrame(projection, fieldPath, view);
  const segment = guide ? segmentOnPlane(guide.segment, view) : null;
  if (frame && segment) {
    return {
      ...base,
      mode: 'scaled',
      reason: null,
      frame,
      segment,
      silhouette: { x: 0, y: 0, width: frame.width, height: frame.height },
      separateFrame: false,
    };
  }
  return base;
}

export type CavityPane = {
  placementId: string;
  boxes: Array<PlaneRect & { key: string; label: string }>;
};

/**
 * Separate cavity coordinates. Shown only when the world box is unavailable
 * because the offset is unknown. Missing local boxes are omitted, not centered.
 */
export function cavityPane(
  projection: SpatialProjection,
  selection: SpatialTarget | null,
  view: Plane,
): CavityPane | null {
  let placementId: string | null = null;
  if (selection?.kind === 'placement') placementId = selection.placementId;
  if (selection?.kind === 'itemInstance') {
    const child = projection.elements.find(
      (item) => item.role === 'containedItem' && targetsEqual(item.target, selection),
    );
    placementId = child?.parentPlacementId ?? null;
  }
  if (!placementId) return null;
  const related = projection.elements.filter(
    (item) =>
      (item.role === 'innerCavity' &&
        item.target.kind === 'placement' &&
        item.target.placementId === placementId) ||
      (item.role === 'containedItem' && item.parentPlacementId === placementId),
  );
  const offsetUnknown = related.some(
    (item) => item.worldBox.kind === 'unavailable' && item.worldBox.reasonCode === 'offset_unknown',
  );
  if (!offsetUnknown) return null;
  const boxes: CavityPane['boxes'] = [];
  for (const item of related) {
    const rect = rectFromBox(item.cavityLocalBox, view);
    if (!rect) continue;
    boxes.push({
      ...rect,
      key: `${item.role}:${targetKey(item.target)}`,
      label: item.role === 'innerCavity' ? '내경' : '내용물',
    });
  }
  return { placementId, boxes };
}

export type TextEntry = {
  key: string;
  label: string;
  target: SpatialTarget | null;
  note: string | null;
};

export function diagramTextEntries(
  projection: SpatialProjection,
  content: SnapshotContent,
): TextEntry[] {
  const entries: TextEntry[] = [];
  for (const element of projection.elements) {
    if (!WORLD_ROLES.has(element.role)) continue;
    const label = elementLabel(content, element);
    const drawable = element.topRect.kind === 'available' || element.frontRect.kind === 'available';
    const note =
      element.worldBox.kind === 'unavailable' && element.worldBox.reasonCode === 'offset_unknown'
        ? '외형 안의 실제 위치 미확인 · 별도 좌표계'
        : drawable
          ? null
          : '도면에 없음';
    entries.push({
      key: `${element.role}:${targetKey(element.target)}`,
      label: label || element.role,
      target: element.target,
      note,
    });
  }
  for (const assignment of content.assignments) {
    if (assignment.location.kind !== 'provisionalContainer') continue;
    const item = content.inputFacts.items.find((entry) => entry.id === assignment.itemId);
    entries.push({
      key: `provisional:${assignment.itemId}:${assignment.unitOrdinal}`,
      label: item?.label ?? assignment.itemId,
      target: {
        kind: 'itemInstance',
        itemId: assignment.itemId,
        unitOrdinal: assignment.unitOrdinal,
      },
      note: '수납 확인 전',
    });
  }
  return entries;
}
