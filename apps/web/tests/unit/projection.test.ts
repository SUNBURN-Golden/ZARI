import { describe, expect, it } from 'vitest';
import type {
  LayoutEditCommand,
  SnapshotContent,
  SpatialElement,
  SpatialProjection,
} from '../../src/contracts/generated/dto';
import {
  ProjectionCache,
  containedOffsetUnknown,
  diagramRects,
  ghostFromProjection,
  planSourceKey,
  projectionLeaseMatches,
  spaceFrame,
  type ProjectionLease,
} from '../../src/features/plan/projection';

const rect = (
  min: [number, number],
  max: [number, number],
): SpatialElement['topRect'] => ({
  kind: 'available',
  value: { min, max },
  basis: 'nominal',
  fieldRefs: [],
});
const missing = (reasonCode: string): SpatialElement['topRect'] => ({
  kind: 'unavailable',
  reasonCode,
  fieldRefs: [],
});
const box = (
  min: [number, number, number],
  max: [number, number, number],
): SpatialElement['worldBox'] => ({
  kind: 'available',
  value: { min, max },
  basis: 'nominal',
  fieldRefs: [],
});
const boxMissing = (reasonCode: string): SpatialElement['worldBox'] => ({
  kind: 'unavailable',
  reasonCode,
  fieldRefs: [],
});
const skip = (reasonCode: string): SpatialElement['worldBox'] => ({
  kind: 'notApplicable',
  reasonCode,
});

function element(part: Pick<SpatialElement, 'role' | 'target'> & Partial<SpatialElement>): SpatialElement {
  return {
    parentPlacementId: null,
    worldBox: skip('unset'),
    topRect: missing('unset'),
    frontRect: missing('unset'),
    cavityLocalBox: skip('unset'),
    measurementBox: skip('unset'),
    checkIds: [],
    fieldRefs: [],
    ...part,
  };
}

const content = {
  placements: [
    {
      id: 'p-c1',
      orientation: 'upright90',
      subject: { kind: 'newContainer', variantId: 'var-1', unitOrdinal: 0 },
    },
    {
      id: 'p-item',
      orientation: 'upright0',
      subject: { kind: 'directItem', itemId: 'item-a', unitOrdinal: 0 },
    },
  ],
  inputFacts: { items: [{ id: 'item-a', label: '상자' }] },
  referencedCatalog: { variants: [{ id: 'var-1', optionLabel: '수납함' }] },
} as unknown as SnapshotContent;

function projection(elements: SpatialElement[]): SpatialProjection {
  return {
    projectionVersion: 1,
    source: {
      kind: 'plan',
      planSnapshotId: 'a'.repeat(64),
      inputDigest: 'b'.repeat(64),
      catalogDigest: 'c'.repeat(64),
    },
    interior: {} as SpatialProjection['interior'],
    elements,
    overlays: [],
    dimensions: [],
    links: [],
    diagnostics: [],
  };
}

describe('diagramRects', () => {
  const view = projection([
    element({
      role: 'compartmentBoundary',
      target: { kind: 'space', spaceId: 'space-1' },
      topRect: rect([0, 0], [600, 400]),
      frontRect: rect([0, 0], [600, 300]),
    }),
    element({
      role: 'newContainer',
      target: { kind: 'placement', placementId: 'p-c1' },
      topRect: rect([100, 200], [500, 250]),
      frontRect: rect([100, 0], [500, 300]),
    }),
    element({
      role: 'containedItem',
      target: { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 },
      parentPlacementId: 'p-c1',
      worldBox: box([380, 240, 5], [440, 290, 75]),
      topRect: rect([380, 240], [440, 290]),
      frontRect: rect([380, 5], [440, 75]),
    }),
    element({
      role: 'directItem',
      target: { kind: 'placement', placementId: 'p-item' },
      topRect: missing('offset_unknown'),
      frontRect: rect([10, 0], [60, 70]),
    }),
  ]);

  it('keeps domain-plane rectangles and drops an unavailable top rect', () => {
    const top = diagramRects(view, content, 'top');
    expect(top.map((item) => [item.kind, item.x, item.y, item.width, item.height, item.refId])).toEqual([
      ['container', 100, 200, 400, 50, 'p-c1'],
      ['contained', 380, 240, 60, 50, 'p-c1'],
    ]);
    expect(top.every((item) => item.y >= 0)).toBe(true);
    expect(diagramRects(view, content, 'front').map((item) => item.kind)).toEqual([
      'container',
      'contained',
      'item',
    ]);
  });

  it('reads the compartment frame without inverting y', () => {
    expect(spaceFrame(view, 'top')).toEqual({ width: 600, height: 400 });
    expect(spaceFrame(view, 'front')).toEqual({ width: 600, height: 300 });
  });
});

describe('ghostFromProjection', () => {
  const view = projection([
    element({
      role: 'directItem',
      target: { kind: 'placement', placementId: 'p-item' },
      topRect: rect([10, 20], [60, 80]),
    }),
  ]);
  it('translates a move and swaps a 90 degree preview without reading measurements', () => {
    const move: LayoutEditCommand = {
      kind: 'movePlacement',
      placementId: 'p-item',
      position: { x: 12, y: 30, z: 0 },
    };
    expect(ghostFromProjection(view, content, move)).toMatchObject({
      x: 12,
      y: 30,
      width: 50,
      height: 60,
      kind: 'ghost',
    });
    const rotate: LayoutEditCommand = {
      kind: 'rotatePlacement',
      placementId: 'p-item',
      orientation: 'upright90',
    };
    expect(ghostFromProjection(view, content, rotate)).toMatchObject({
      x: 10,
      y: 20,
      width: 60,
      height: 50,
    });
  });
});

describe('projection lease and cache', () => {
  const lease = (generation: number, worker: object): ProjectionLease => ({
    projectId: 'p',
    sourceKey: planSourceKey('a'.repeat(64)),
    worker,
    mountedGeneration: generation,
  });
  it('rejects a reply from another mount or worker', () => {
    const worker = {};
    expect(projectionLeaseMatches(lease(1, worker), lease(1, worker))).toBe(true);
    expect(projectionLeaseMatches(lease(1, worker), lease(2, worker))).toBe(false);
    expect(projectionLeaseMatches(lease(1, worker), lease(1, {}))).toBe(false);
  });
  it('keeps four projections and drops the least recently used', () => {
    const cache = new ProjectionCache(4, 8 * 1024 * 1024);
    for (let i = 0; i < 5; i += 1) cache.set(`plan:${i}`, projection([]));
    expect(cache.get('plan:0')).toBeUndefined();
    expect(cache.get('plan:4')).toBeTruthy();
  });
  it('notices an unknown contained offset', () => {
    const view = projection([
      element({
        role: 'containedItem',
        target: { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 },
        worldBox: boxMissing('offset_unknown'),
        topRect: missing('offset_unknown'),
      }),
    ]);
    expect(containedOffsetUnknown(view)).toBe(true);
  });
});
