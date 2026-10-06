import { expect, it } from 'vitest';
import type {
  DimensionGuide,
  FactFor_MeasuredLength,
  ProjectionGeometryFor_ViewBoxMm,
  ProjectionGeometryFor_ViewRectMm,
  SpatialElement,
  SpatialLink,
  SpatialOverlay,
  SpatialProjection,
  SpatialTarget,
} from '../../src/contracts/generated/dto';
import { MEASUREMENT_FIELDS } from '../../src/features/project/draft';
import {
  bindWorkspace,
  focusWorkspace,
  hoverWorkspace,
  initialWorkspace,
  layerWorkspace,
  selectWorkspace,
  viewWorkspace,
  type DisplayBinding,
} from '../../src/features/workspace/model';
import {
  checkOverlayRects,
  cavityPane,
  fieldCaption,
  measurementDrawing,
  parseMeasurementField,
  preferredMeasureView,
  rectFromGeometry,
} from '../../src/features/workspace/projection';
import {
  focusTargets,
  parentPlacementId,
  selectedPlacementId,
  targetKey,
  targetsEqual,
} from '../../src/features/workspace/selection';
import {
  fittedViewBox,
  frameCenter,
  zoomAboutDomain,
  zoomedViewBox,
} from '../../src/features/workspace/viewport';

const binding: DisplayBinding = {
  projectId: 'p1',
  sourceKey: 'input:digest-a',
  planSnapshotId: null,
  inputDigest: 'digest-a',
};

function known(nominal: number): FactFor_MeasuredLength {
  return {
    state: 'known',
    value: { nominal, uncertainty: { state: 'unknown' } },
    provenance: {
      evidenceIds: [],
      inputRefs: [],
      observedAt: null,
      origin: 'userDeclared',
      ruleIds: [],
      verification: 'unverified',
    },
  };
}

function unavailable(reasonCode: string): ProjectionGeometryFor_ViewBoxMm {
  return { kind: 'unavailable', reasonCode, fieldRefs: [] };
}

function box(
  min: [number, number, number],
  max: [number, number, number],
): ProjectionGeometryFor_ViewBoxMm {
  return { kind: 'available', basis: 'nominal', fieldRefs: [], value: { min, max } };
}

function rect(
  min: [number, number],
  max: [number, number],
): ProjectionGeometryFor_ViewRectMm {
  return { kind: 'available', basis: 'nominal', fieldRefs: [], value: { min, max } };
}

function element(over: Partial<SpatialElement> & Pick<SpatialElement, 'role' | 'target'>): SpatialElement {
  return {
    cavityLocalBox: { kind: 'notApplicable', reasonCode: 'none' },
    checkIds: [],
    fieldRefs: [],
    frontRect: { kind: 'notApplicable', reasonCode: 'none' },
    measurementBox: { kind: 'notApplicable', reasonCode: 'none' },
    parentPlacementId: null,
    topRect: { kind: 'notApplicable', reasonCode: 'none' },
    worldBox: { kind: 'notApplicable', reasonCode: 'none' },
    ...over,
  };
}

function guide(
  fieldPath: string,
  preferredView: 'top' | 'front',
  from: [number, number, number],
  to: [number, number, number],
  nominal = 600,
): DimensionGuide {
  return {
    fieldPath,
    frame: { kind: 'world', spaceId: 'space-1' },
    guideId: fieldPath,
    labelKey: fieldPath,
    measurement: known(nominal),
    preferredView,
    segment: { kind: 'available', basis: 'nominal', fieldRefs: [], value: { from, to } },
    target: { kind: 'space', spaceId: 'space-1' },
  };
}

function projection(over: Partial<SpatialProjection> = {}): SpatialProjection {
  return {
    diagnostics: [],
    dimensions: [],
    elements: [],
    interior: { width: known(600), depth: known(400), height: known(300) },
    links: [],
    overlays: [],
    projectionVersion: 1,
    source: { kind: 'input', inputDigest: 'digest-a' },
    ...over,
  };
}

const spaceFrame = element({
  role: 'compartmentBoundary',
  target: { kind: 'space', spaceId: 'space-1' },
  topRect: rect([0, 0], [600, 400]),
  frontRect: rect([0, 0], [600, 300]),
  worldBox: box([0, 0, 0], [600, 400, 300]),
});

it('freezes selection and focus when the source changes, and keeps measurement focus on the same input', () => {
  const start = selectWorkspace(
    focusWorkspace(initialWorkspace(binding), { kind: 'measurement', fieldPath: 'space.interior.width' }),
    { kind: 'placement', placementId: 'pl-1' },
  );
  const sameInput = bindWorkspace(start, { ...binding, inputDigest: 'digest-a' });
  expect(sameInput).toBe(start);

  const nextDigest = bindWorkspace(start, {
    ...binding,
    sourceKey: 'input:digest-b',
    inputDigest: 'digest-b',
  });
  expect(nextDigest.selection).toBeNull();
  expect(nextDigest.focus).toEqual({ kind: 'measurement', fieldPath: 'space.interior.width' });
  expect(nextDigest.view).toBe('top');

  const plan = bindWorkspace(nextDigest, {
    projectId: 'p1',
    sourceKey: 'plan:snap-1',
    planSnapshotId: 'snap-1',
    inputDigest: 'digest-b',
  });
  expect(plan.focus).toEqual({ kind: 'none' });
  expect(plan.selection).toBeNull();

  const hovered = hoverWorkspace(plan, { kind: 'placement', placementId: 'pl-1' });
  const layered = layerWorkspace(hovered, 'checks', true);
  const viewed = viewWorkspace(layered, 'front');
  expect(viewed.selection).toBeNull();
  expect(viewed.hover).toEqual({ kind: 'placement', placementId: 'pl-1' });
  expect(viewed.focus.kind).toBe('none');
  expect(viewed.layers.checks).toBe(true);
  expect(viewed.layers.contents).toBe(true);
});

it('arms move only for an explicit placement and keeps a child off that id', () => {
  const placement: SpatialTarget = { kind: 'placement', placementId: 'box-1' };
  const child: SpatialTarget = { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 1 };
  expect(selectedPlacementId(placement)).toBe('box-1');
  expect(selectedPlacementId(child)).toBeNull();
  expect(targetKey(child)).toBe('instance:item-a:1');
  expect(targetsEqual(child, { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 })).toBe(false);
  const view = projection({
    elements: [
      element({
        role: 'containedItem',
        target: child,
        parentPlacementId: 'box-1',
      }),
    ],
  });
  expect(parentPlacementId(view, child)).toBe('box-1');
  expect(parentPlacementId(view, placement)).toBeNull();
});

it('highlights every linked placement and nothing when the link is unavailable', () => {
  const a: SpatialTarget = { kind: 'placement', placementId: 'a' };
  const b: SpatialTarget = { kind: 'placement', placementId: 'b' };
  const links: SpatialLink[] = [
    {
      reasonCode: null,
      resolution: 'resolved',
      source: { kind: 'bom', bomLineId: 'line-1' },
      targets: [a, b],
      unresolvedSubjectIds: [],
    },
    {
      reasonCode: 'missing',
      resolution: 'unavailable',
      source: { kind: 'check', checkId: 'chk-missing' },
      targets: [a],
      unresolvedSubjectIds: ['a'],
    },
  ];
  const view = projection({ links });
  expect(focusTargets(view, { kind: 'bom', bomLineId: 'line-1' })).toEqual([a, b]);
  expect(focusTargets(view, { kind: 'check', checkId: 'chk-missing' })).toEqual([]);
  expect(focusTargets(view, { kind: 'measurement', fieldPath: 'space.interior.width' })).toEqual([]);
});

it('keeps zoom 1 on the historical viewBox and holds the center still', () => {
  const frame = { width: 600, height: 300 };
  const fit = fittedViewBox(frame, 16);
  expect(fit).toEqual({ x: -16, y: -(300 + 16), width: 600 + 32, height: 300 + 32 });
  const zoomed = zoomAboutDomain(frame, 16, { zoom: 1, panX: 0, panY: 0 }, frameCenter(frame), 2);
  expect(zoomed.panX).toBeCloseTo(0);
  expect(zoomed.panY).toBeCloseTo(0);
  expect(zoomed.zoom).toBe(2);
  const box = zoomedViewBox(frame, 16, zoomed);
  expect(box.width).toBeCloseTo(fit.width / 2);
  expect(box.x + box.width / 2).toBeCloseTo(fit.x + fit.width / 2);
});

it('gives every editable field a guide and never draws one known axis as a region', () => {
  const captions: Record<string, string> = {
    'space.interior.width': '왼쪽 안쪽 면부터 오른쪽 안쪽 면까지',
    'space.interior.depth': '입구 쪽 안쪽 면부터 뒤쪽 안쪽 면까지',
    'space.interior.height': '사용할 바닥면부터 위쪽 경계까지',
    'space.opening.width': '내부 치수와 입구 치수는 다를 수 있습니다',
    'space.opening.height': '내부 치수와 입구 치수는 다를 수 있습니다',
  };
  for (const field of MEASUREMENT_FIELDS) {
    const caption = fieldCaption(field);
    expect(caption.length).toBeGreaterThan(0);
    expect(caption).not.toBe('측정 위치');
    if (field in captions) expect(caption).toBe(captions[field]);
    if (field.startsWith('items.')) expect(caption).toContain('수량이나 배치와는 별개');
    expect(parseMeasurementField(field)).not.toBeNull();
  }

  const ready = projection({
    elements: [spaceFrame],
    dimensions: [guide('space.interior.width', 'front', [0, 0, 0], [600, 0, 0])],
  });
  const scaled = measurementDrawing('space.interior.width', ready, 'ready', null, null);
  expect(scaled.mode).toBe('scaled');
  expect(scaled.segment).toEqual({ x1: 0, y1: 0, x2: 600, y2: 0 });
  expect(scaled.reason).toBeNull();
  expect(preferredMeasureView('space.interior.depth', null)).toBe('top');
  expect(preferredMeasureView('space.interior.height', null)).toBe('front');

  const widthOnly = measurementDrawing('space.interior.width', projection(), 'ready', {
    space: { interior: { width: known(600) } },
  } as never, null);
  expect(widthOnly.mode).toBe('schematic');
  expect(widthOnly.segment).toBeNull();
  expect(widthOnly.valueText).toBe('600 mm');

  expect(measurementDrawing('space.interior.width', ready, 'ready', null, 'stale').mode).toBe('schematic');
  expect(measurementDrawing('space.interior.width', ready, 'ready', null, 'stale').segment).toBeNull();
  expect(measurementDrawing('space.interior.width', ready, 'ready', null, 'invalid').segment).toBeNull();
  expect(rectFromGeometry({
    kind: 'available',
    basis: 'nominal',
    fieldRefs: [],
    value: { min: [0, 0], max: [0, 10] },
  })).toBeNull();
});

it('draws an item only from its measurement box and withholds a check overlay that has no geometry', () => {
  const item = element({
    role: 'itemEnvelope',
    target: { kind: 'item', itemId: 'item-a' },
    measurementBox: box([0, 0, 0], [190, 100, 80]),
  });
  const drawn = measurementDrawing(
    'items.item-a.dimensions.envelope.width',
    projection({ elements: [item] }),
    'ready',
    null,
    null,
  );
  expect(drawn.mode).toBe('scaled');
  expect(drawn.separateFrame).toBe(true);
  expect(drawn.frame).toEqual({ width: 190, height: 100 });

  const partial = element({
    role: 'itemEnvelope',
    target: { kind: 'item', itemId: 'item-a' },
  });
  const textOnly = measurementDrawing(
    'items.item-a.dimensions.envelope.width',
    projection({ elements: [partial] }),
    'ready',
    {
      items: [{ id: 'item-a', dimensions: { envelope: { width: known(190) } } }],
    } as never,
    null,
  );
  expect(textOnly.mode).toBe('schematic');
  expect(textOnly.segment).toBeNull();
  expect(textOnly.valueText).toBe('190 mm');
  expect(textOnly.separateFrame).toBe(true);

  const target: SpatialTarget = { kind: 'placement', placementId: 'box-1' };
  const overlay: SpatialOverlay = {
    checkIds: ['chk-1'],
    fieldRefs: [],
    geometry: unavailable('no_geometry'),
    motionPhase: null,
    overlayId: 'ov-1',
    role: 'nominalOuter',
    target,
  };
  const view = projection({ overlays: [overlay] });
  expect(checkOverlayRects(view, 'top', target, { kind: 'none' }, {
    dimensions: true,
    contents: true,
    checks: true,
  })).toEqual([]);
  expect(checkOverlayRects(view, 'top', target, { kind: 'none' }, {
    dimensions: true,
    contents: true,
    checks: false,
  })).toEqual([]);
});

it('opens a cavity pane only for an unknown offset and does not invent a centered box', () => {
  const placement: SpatialTarget = { kind: 'placement', placementId: 'box-1' };
  const cavity = element({
    role: 'innerCavity',
    target: placement,
    worldBox: unavailable('offset_unknown'),
    cavityLocalBox: box([0, 0, 0], [200, 80, 40]),
  });
  const child = element({
    role: 'containedItem',
    target: { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 },
    parentPlacementId: 'box-1',
    worldBox: unavailable('offset_unknown'),
    cavityLocalBox: { kind: 'unavailable', reasonCode: 'not_provided', fieldRefs: [] },
  });
  const pane = cavityPane(projection({ elements: [cavity, child] }), placement, 'top');
  expect(pane?.boxes).toHaveLength(1);
  expect(pane?.boxes[0]).toMatchObject({ x: 0, y: 0, width: 200, height: 80, label: '내경' });

  const placed = element({
    role: 'innerCavity',
    target: placement,
    worldBox: box([10, 20, 0], [30, 40, 10]),
    cavityLocalBox: box([0, 0, 0], [20, 20, 10]),
  });
  expect(cavityPane(projection({ elements: [placed] }), placement, 'top')).toBeNull();
  expect(cavityPane(projection({ elements: [cavity] }), null, 'top')).toBeNull();
});
