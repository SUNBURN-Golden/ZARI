import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  PlanSnapshot,
  SnapshotContent,
  SpatialElement,
  SpatialProjection,
  SpatialRole,
  SpatialTarget,
  SpatialViewSource,
} from '../../src/contracts/generated/dto';
import { projectionAccepts } from '../../src/features/plan/projection';
import { accountElements } from '../../src/features/spatial3d/scene';
import type { WorkspaceLayers } from '../../src/features/workspace/model';
import { diagramTextEntries } from '../../src/features/workspace/projection';

const layers: WorkspaceLayers = { dimensions: true, contents: true, checks: false };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

function box(min: [number, number, number], max: [number, number, number]) {
  return { kind: 'available' as const, basis: 'nominal' as const, fieldRefs: [], value: { min, max } };
}

function box2(min: [number, number], max: [number, number]) {
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

function projection(elements: SpatialElement[], planSnapshotId = 'a'.repeat(64)): SpatialProjection {
  return {
    projectionVersion: 1,
    source: {
      kind: 'plan',
      planSnapshotId,
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

const content = {
  placements: [],
  assignments: [],
  inputFacts: { items: [], ownedContainers: [] },
  referencedCatalog: { variants: [] },
} as unknown as SnapshotContent;

describe('measurement accounting', () => {
  it('names every spatial role and leaves the reference fixture with no silent drop', () => {
    const roles: { role: SpatialRole; target: SpatialTarget }[] = [
      { role: 'compartmentBoundary', target: { kind: 'space', spaceId: 'space-1' } },
      { role: 'aperture', target: { kind: 'opening', spaceId: 'space-1' } },
      { role: 'physicalObstacle', target: { kind: 'obstacle', obstacleId: 'obs-1' } },
      { role: 'accessExclusion', target: { kind: 'placement', placementId: 'p-ex' } },
      { role: 'supportSurface', target: { kind: 'support', supportId: 'sup-1' } },
      { role: 'itemEnvelope', target: { kind: 'item', itemId: 'item-a' } },
      { role: 'directItem', target: { kind: 'itemInstance', itemId: 'item-a', unitOrdinal: 0 } },
      { role: 'ownedContainer', target: { kind: 'placement', placementId: 'p-owned' } },
      { role: 'newContainer', target: { kind: 'placement', placementId: 'p-new' } },
      { role: 'containedItem', target: { kind: 'itemInstance', itemId: 'item-b', unitOrdinal: 0 } },
      { role: 'innerCavity', target: { kind: 'placement', placementId: 'p-new' } },
    ];
    const elements = roles.map((item) =>
      element({
        role: item.role,
        target: item.target,
        worldBox:
          item.role === 'accessExclusion' ? unavailable('offset_unknown') : box([0, 0, 0], [10, 10, 10]),
        topRect: item.role === 'accessExclusion' ? unavailable('offset_unknown') : box2([0, 0], [10, 10]),
        frontRect: item.role === 'accessExclusion' ? unavailable('offset_unknown') : box2([0, 0], [10, 10]),
      }),
    );
    const accounts = accountElements(projection(elements), layers, {
      hideFront: true,
      hideTop: true,
      interiorPlacementId: null,
    });
    expect(accounts.filter((item) => item.disposition === 'unclassified')).toEqual([]);
    expect(new Set(accounts.map((item) => item.role))).toEqual(new Set(roles.map((item) => item.role)));
    const entries = diagramTextEntries(projection(elements), content);
    expect(entries.map((entry) => entry.label.length)).not.toContain(0);
    expect(entries.find((entry) => entry.key.startsWith('innerCavity:'))?.note).toContain('측정 기준');
    expect(entries.find((entry) => entry.key.startsWith('accessExclusion:'))?.note).toContain('미확인');
    expect(entries.find((entry) => entry.key.startsWith('supportSurface:'))?.note).toBe('지지면');

    const fixture = JSON.parse(readFileSync('fixtures/spatial/spatial-yaw-offset.json', 'utf8')) as {
      expected: { elements: { role: string }[] };
    };
    const fixtureElements = fixture.expected.elements.map((item, index) =>
      element({
        role: item.role as SpatialRole,
        target: { kind: 'placement', placementId: `p-${index}` },
        worldBox: box([0, 0, 0], [10, 10, 10]),
        topRect: box2([0, 0], [10, 10]),
        frontRect: box2([0, 0], [10, 10]),
      }),
    );
    const fixtureAccounts = accountElements(projection(fixtureElements), layers, {
      hideFront: true,
      hideTop: true,
      interiorPlacementId: null,
    });
    expect(fixtureAccounts.filter((item) => item.disposition === 'unclassified')).toEqual([]);
    expect(fixtureAccounts).toHaveLength(fixture.expected.elements.length);
  });
});

describe('projection source stamp', () => {
  it('rejects a plan projection stamped with a different snapshot id', () => {
    const source: SpatialViewSource = {
      kind: 'plan',
      snapshot: { planSnapshotId: 'a'.repeat(64) } as PlanSnapshot,
    };
    const accepted = projection([], 'a'.repeat(64));
    const rejected = projection([], 'f'.repeat(64));
    expect(projectionAccepts(source, accepted)).toBe(true);
    expect(projectionAccepts(source, rejected)).toBe(false);
  });
});

describe('imported strings stay text', () => {
  it('has no HTML or code execution sink in the web source', () => {
    const hits = walk('apps/web/src').filter((path) => {
      const text = readFileSync(path, 'utf8');
      return (
        text.includes('dangerouslySetInnerHTML') ||
        /\binnerHTML\s*=/.test(text) ||
        /\beval\s*\(/.test(text) ||
        /new\s+Function\s*\(/.test(text)
      );
    });
    expect(hits).toEqual([]);
  });
});
