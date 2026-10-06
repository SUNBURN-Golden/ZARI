import { readFileSync } from 'node:fs';
import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three';
import { expect, it } from 'vitest';
import type {
  SnapshotContent,
  SpatialElement,
  SpatialProjection,
  SpatialTarget,
} from '../../src/contracts/generated/dto';
import { cameraPose, eyeDistance, orthoHalfHeight, polarFromAbove, type Fit } from '../../src/features/spatial3d/camera';
import { meshFromWorldBox } from '../../src/features/spatial3d/mapping';
import { PICK_EPSILON_M, resolvePick } from '../../src/features/spatial3d/pick';
import { bindInstances, cuboidMatrix } from '../../src/features/spatial3d/pose';
import { ResourceRegistry } from '../../src/features/spatial3d/resources';
import { cuboidInstanceIndex, planScene, type Cutaway } from '../../src/features/spatial3d/scene';
import type { WorkspaceLayers } from '../../src/features/workspace/model';

const layers: WorkspaceLayers = { dimensions: true, contents: true, checks: false };
const closed: Cutaway = { hideFront: true, hideTop: true, interiorPlacementId: null };

const content = {
  placements: [
    { id: 'p-c1', subject: { kind: 'newContainer', variantId: 'var-1', unitOrdinal: 0 } },
    { id: 'p-c2', subject: { kind: 'newContainer', variantId: 'var-1', unitOrdinal: 1 } },
  ],
  inputFacts: { items: [{ id: 'item-a', label: '물건 A' }], ownedContainers: [] },
  referencedCatalog: { variants: [{ id: 'var-1', optionLabel: '수납함' }] },
  assignments: [],
} as unknown as SnapshotContent;

function box(min: [number, number, number], max: [number, number, number]) {
  return { kind: 'available' as const, basis: 'nominal' as const, fieldRefs: [], value: { min, max } };
}

function unavailable(reasonCode: string) {
  return { kind: 'unavailable' as const, reasonCode, fieldRefs: [] };
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

function projection(elements: SpatialElement[], links: SpatialProjection['links'] = []): SpatialProjection {
  return {
    projectionVersion: 1,
    source: { kind: 'plan', planSnapshotId: 'plan-1', inputDigest: 'in', catalogDigest: 'cat' },
    interior: {} as SpatialProjection['interior'],
    elements,
    overlays: [],
    dimensions: [],
    links,
    diagnostics: [],
  };
}

function room(): SpatialElement {
  return element({
    role: 'compartmentBoundary',
    target: { kind: 'space', spaceId: 'space-1' },
    worldBox: box([0, 0, 0], [600, 400, 300]),
    topRect: box2([0, 0], [600, 400]),
    frontRect: box2([0, 0], [600, 300]),
  });
}

function box2(min: [number, number], max: [number, number]) {
  return { kind: 'available' as const, basis: 'nominal' as const, fieldRefs: [], value: { min, max } };
}

function mm(value: number): number {
  return Math.round(value * 1000);
}

it('maps the yaw90 fixture child to the same millimetres as the 2D rectangles', () => {
  const fixture = JSON.parse(readFileSync('fixtures/spatial/spatial-yaw-offset.json', 'utf8')) as {
    expected: {
      elements: {
        role: string;
        world: { kind: string; min?: number[]; max?: number[] };
        top: { kind: string; min?: number[]; max?: number[] };
        front: { kind: string; min?: number[]; max?: number[] };
      }[];
    };
  };
  const child = fixture.expected.elements.find((item) => item.role === 'containedItem');
  expect(child?.world).toMatchObject({ kind: 'available', min: [380, 240, 5], max: [440, 290, 75] });
  expect(child?.top).toMatchObject({ min: [380, 240], max: [440, 290] });
  expect(child?.front).toMatchObject({ min: [380, 5], max: [440, 75] });
  const mesh = meshFromWorldBox({ min: child!.world.min!, max: child!.world.max! });
  expect(mesh).not.toBeNull();
  expect(mm(mesh!.center[0])).toBe(410);
  expect(mm(mesh!.center[1])).toBe(40);
  expect(mm(mesh!.center[2])).toBe(-265);
  expect(mm(mesh!.size[0])).toBe(60);
  expect(mm(mesh!.size[1])).toBe(70);
  expect(mm(mesh!.size[2])).toBe(50);
  const matrix = cuboidMatrix(mesh!.center, mesh!.size);
  const el = matrix.elements;
  expect(el[1]).toBeCloseTo(0);
  expect(el[2]).toBeCloseTo(0);
  expect(el[4]).toBeCloseTo(0);
  expect(el[6]).toBeCloseTo(0);
  expect(el[8]).toBeCloseTo(0);
  expect(el[9]).toBeCloseTo(0);
  expect(mm(el[0]!)).toBe(60);
  expect(mm(el[5]!)).toBe(70);
  expect(mm(el[10]!)).toBe(50);
});

it('keeps an unknown offset out of the world scene', () => {
  const fixture = JSON.parse(readFileSync('fixtures/spatial/spatial-unknown-offset.json', 'utf8')) as {
    expected: { elements: { role: string; world: { kind: string; reasonCode?: string } }[] };
  };
  const child = fixture.expected.elements.find((item) => item.role === 'containedItem');
  expect(child?.world).toMatchObject({ kind: 'unavailable', reasonCode: 'offset_unknown' });
  const plan = planScene(
    projection([
      room(),
      element({
        role: 'containedItem',
        target: { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 },
        parentPlacementId: 'p-c1',
        worldBox: unavailable('offset_unknown'),
        topRect: unavailable('offset_unknown'),
        frontRect: unavailable('offset_unknown'),
      }),
    ]),
    content,
    layers,
    null,
    { kind: 'none' },
    closed,
  );
  expect(plan.cuboids.some((body) => body.role === 'containedItem')).toBe(false);
  expect(plan.unavailable.some((item) => item.reasonCode === 'offset_unknown')).toBe(true);
  expect(meshFromWorldBox({ min: [0, 0, 0], max: [10, 10, 0] })).toBeNull();
});

it('does not invent a 3D box when height is missing', () => {
  const plan = planScene(
    projection([
      element({
        role: 'compartmentBoundary',
        target: { kind: 'space', spaceId: 'space-1' },
        worldBox: unavailable('measurement_missing'),
        topRect: box2([0, 0], [600, 400]),
        frontRect: unavailable('measurement_missing'),
      }),
    ]),
    content,
    layers,
    null,
    { kind: 'none' },
    closed,
  );
  expect(plan.planes).toHaveLength(0);
  expect(plan.cuboids).toHaveLength(0);
  expect(plan.unavailable.map((item) => item.reasonCode)).toContain('measurement_missing');
});

it('hides the default cut faces and does not mutate the projection', () => {
  const source = projection([room()]);
  const before = JSON.stringify(source);
  const plan = planScene(source, content, layers, null, { kind: 'none' }, closed);
  expect(JSON.stringify(source)).toBe(before);
  expect(plan.planes.map((body) => body.face).sort()).toEqual(['back', 'floor', 'left', 'right']);
  const open = planScene(source, content, layers, null, { kind: 'none' }, {
    hideFront: false,
    hideTop: false,
    interiorPlacementId: null,
  });
  expect(open.planes.map((body) => body.face).sort()).toEqual(['back', 'floor', 'front', 'left', 'right', 'top']);
});

it('picks the outer surface until the interior view is open', () => {
  const container: SpatialTarget = { kind: 'placement', placementId: 'p-c1' };
  const child: SpatialTarget = { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 };
  const elements = [
    room(),
    element({
      role: 'newContainer',
      target: container,
      worldBox: box([100, 200, 0], [300, 400, 200]),
    }),
    element({
      role: 'containedItem',
      target: child,
      parentPlacementId: 'p-c1',
      worldBox: box([380, 240, 5], [440, 290, 75]),
    }),
  ];
  const hidden = planScene(projection(elements), content, { ...layers, contents: false }, null, { kind: 'none' }, closed);
  expect(hidden.cuboids.some((body) => body.role === 'containedItem')).toBe(false);
  const shown = planScene(projection(elements), content, layers, null, { kind: 'none' }, closed);
  const childBody = shown.cuboids.find((body) => body.role === 'containedItem');
  expect(childBody?.pickable).toBe(false);
  const opened = planScene(projection(elements), content, { ...layers, contents: false }, container, { kind: 'none' }, {
    ...closed,
    interiorPlacementId: 'p-c1',
  });
  expect(opened.cuboids.some((body) => body.role === 'newContainer')).toBe(false);
  expect(opened.cuboids.find((body) => body.role === 'containedItem')?.pickable).toBe(true);
  expect(cuboidInstanceIndex(opened, child)).toBe(0);
});

it('resolves an ambiguous pick and ignores a non-pickable child', () => {
  const outer: SpatialTarget = { kind: 'placement', placementId: 'p-c1' };
  const child: SpatialTarget = { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 };
  expect(
    resolvePick(
      [
        { target: child, distance: 1, pickable: false },
        { target: outer, distance: 1.2, pickable: true },
      ],
      PICK_EPSILON_M,
    ),
  ).toEqual({ kind: 'one', target: outer });
  const other: SpatialTarget = { kind: 'placement', placementId: 'p-c2' };
  const ambiguous = resolvePick(
    [
      { target: outer, distance: 1, pickable: true },
      { target: other, distance: 1.0004, pickable: true },
    ],
    PICK_EPSILON_M,
  );
  expect(ambiguous.kind).toBe('ambiguous');
  if (ambiguous.kind === 'ambiguous') expect(ambiguous.targets).toEqual([outer, other]);
});

it('keeps top and front on one orthographic scale and above the floor', () => {
  const fit: Fit = { center: [0.3, 0.15, -0.2], maxSpan: 0.6, radius: 0.4 };
  const half = orthoHalfHeight(fit.maxSpan, 1.6);
  expect(orthoHalfHeight(fit.maxSpan, 1.6)).toBe(half);
  expect(orthoHalfHeight(fit.maxSpan, 0.5)).toBeGreaterThan(half);
  for (const preset of ['oblique', 'top', 'front'] as const) {
    const pose = cameraPose(preset, fit);
    expect(polarFromAbove(pose.position, pose.target)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    const distance = Math.hypot(
      pose.position[0] - fit.center[0],
      pose.position[1] - fit.center[1],
      pose.position[2] - fit.center[2],
    );
    expect(distance).toBeGreaterThanOrEqual(fit.radius);
    expect(distance).toBeCloseTo(eyeDistance(fit));
  }
});

it('maps each instanced cuboid index to its typed target', () => {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, 2);
  const first: SpatialTarget = { kind: 'placement', placementId: 'p-c1' };
  const second: SpatialTarget = { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 };
  const child = meshFromWorldBox({ min: [380, 240, 5], max: [440, 290, 75] })!;
  bindInstances(mesh, [
    { matrix: cuboidMatrix([0, 0, 0], [1, 1, 1]), target: first, pickable: true },
    { matrix: cuboidMatrix(child.center, child.size), target: second, pickable: false },
  ]);
  const data = mesh.userData as { targets: SpatialTarget[]; pickable: boolean[] };
  expect(data.targets[0]).toEqual(first);
  expect(data.targets[1]).toEqual(second);
  expect(data.pickable[1]).toBe(false);
  const array = mesh.instanceMatrix.array;
  expect(Math.round(array[16 + 0]! * 1000)).toBe(60);
  expect(Math.round(array[16 + 5]! * 1000)).toBe(70);
  expect(Math.round(array[16 + 10]! * 1000)).toBe(50);
  geometry.dispose();
  material.dispose();
});

it('highlights every placement on a multi-target BOM link', () => {
  const elements = [
    room(),
    element({ role: 'newContainer', target: { kind: 'placement', placementId: 'p-c1' }, worldBox: box([10, 10, 0], [100, 80, 40]) }),
    element({ role: 'newContainer', target: { kind: 'placement', placementId: 'p-c2' }, worldBox: box([120, 10, 0], [200, 80, 40]) }),
  ];
  const plan = planScene(
    projection(elements, [
      {
        source: { kind: 'bom', bomLineId: 'line-1' },
        targets: [
          { kind: 'placement', placementId: 'p-c1' },
          { kind: 'placement', placementId: 'p-c2' },
        ],
        resolution: 'resolved',
        unresolvedSubjectIds: [],
        reasonCode: null,
      },
    ]),
    content,
    layers,
    null,
    { kind: 'bom', bomLineId: 'line-1' },
    closed,
  );
  expect(plan.focusKeys).toEqual(['placement:p-c1', 'placement:p-c2']);
});

it('disposes a shared registry once across 20 cycles', () => {
  let disposed = 0;
  for (let i = 0; i < 20; i += 1) {
    const registry = new ResourceRegistry();
    registry.track({ dispose: () => { disposed += 1; } });
    registry.track({ dispose: () => { disposed += 1; } });
    registry.dispose();
    registry.dispose();
  }
  expect(disposed).toBe(40);
});
