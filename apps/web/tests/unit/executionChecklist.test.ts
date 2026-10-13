import { expect, it } from 'vitest';
import type {
  ActionStep,
  InstanceRef,
  SnapshotContent,
} from '../../src/contracts/generated/dto';
import {
  conditionRows,
  draftFocusQuery,
  instanceLabel,
  preparationLines,
  subjectText,
} from '../../src/features/execution/model';

const content = {
  inputFacts: {
    items: [
      { id: 'cup', label: '컵' },
      { id: 'plate', label: '접시' },
    ],
    ownedContainers: [{ id: 'bin-owned' }],
    space: { id: 'space-1' },
  },
  placements: [
    {
      id: 'place-bin',
      subject: { kind: 'ownedContainer', ownedId: 'bin-owned', unitOrdinal: 0 },
    },
    {
      id: 'place-new',
      subject: { kind: 'newContainer', variantId: 'var-1', unitOrdinal: 0 },
    },
  ],
  referencedCatalog: {
    variants: [{ id: 'var-1', optionLabel: '중형 서랍' }],
    offers: [{ id: 'offer-1', variantId: 'var-1' }],
  },
  validation: {
    checks: [
      {
        id: 'chk-1',
        kind: 'installation_path',
        status: 'unknown',
        reasonCode: 'staging_unknown',
      },
      {
        id: 'chk-2',
        kind: 'support_load',
        status: 'fail',
        reasonCode: 'limit_exceeded',
      },
    ],
  },
} as unknown as SnapshotContent;

function step(partial: Partial<ActionStep> & Pick<ActionStep, 'id'>): ActionStep {
  return {
    kind: 'install',
    prerequisiteStepIds: [],
    reasonIds: [],
    requiredConfirmations: [],
    subjectIds: [],
    ...partial,
  };
}

it('labels every Rust instance ref as one preparation line', () => {
  const refs: InstanceRef[] = [
    { kind: 'directItem', itemId: 'cup', unitOrdinal: 0, placementId: 'p1' },
    { kind: 'containedItem', itemId: 'plate', unitOrdinal: 1, containerPlacementId: 'place-bin' },
    { kind: 'ownedContainer', ownedId: 'bin-owned', unitOrdinal: 0, placementId: 'place-bin' },
    { kind: 'newContainer', variantId: 'var-1', unitOrdinal: 0, placementId: 'place-new' },
    {
      kind: 'unassigned',
      itemId: 'cup',
      instances: { kind: 'known', ranges: [{ start: 1, endExclusive: 3 }] },
    },
    {
      kind: 'unassigned',
      itemId: 'plate',
      instances: { kind: 'unknownQuantity' },
    },
    { kind: 'space', spaceId: 'space-1' },
  ];
  expect(preparationLines(content, refs)).toEqual([
    '컵 1번째',
    '접시 2번째 → bin-owned #1',
    '보유 수납함 bin-owned 1번째',
    '새 수납함 중형 서랍 1번째',
    '미배정 컵 2개',
    '미배정 접시 수량 미확인',
    '작업할 칸',
  ]);
  // Unknown quantity is never rendered as a guessed count.
  expect(instanceLabel(content, refs[5]!)).not.toContain('0');
});

it('labels related subjects without recomputing refs', () => {
  expect(subjectText(content, 'place-bin')).toBe('bin-owned #1');
  expect(subjectText(content, 'place-new')).toBe('중형 서랍');
  expect(subjectText(content, 'cup')).toBe('컵');
  expect(subjectText(content, 'var-1')).toBe('옵션 중형 서랍');
  expect(subjectText(content, 'bin-owned')).toBe('보유 수납함 bin-owned');
  expect(subjectText(content, 'offer-1')).toBe('중형 서랍 판매 옵션 offer-1');
  expect(subjectText(content, 'space-1')).toBe('작업할 칸');
  expect(subjectText(content, 'unresolvable')).toBe('unresolvable');
});

it('lists only the checks Rust pinned to the step, with their real status', () => {
  const rows = conditionRows(
    content,
    step({ id: 's1', reasonIds: ['chk-1', 'chk-2', 'chk-missing'] }),
  );
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual({
    checkId: 'chk-1',
    kindText: '반입 경로',
    status: 'unknown',
    statusText: '미확인',
  });
  expect(rows[1]).toEqual({
    checkId: 'chk-2',
    kindText: '하중',
    status: 'fail',
    statusText: '실패',
  });
  expect(conditionRows(content, step({ id: 's2' }))).toEqual([]);
});

it('maps each rollback reason to one real draft control', () => {
  expect(draftFocusQuery('measuredDiff')).toEqual({
    kind: 'id',
    value: 'space.interior.width',
  });
  expect(draftFocusQuery('differentItem')).toEqual({
    kind: 'id',
    value: 'items.item-a.dimensions.envelope.width',
  });
  expect(draftFocusQuery('missingParts')).toEqual({
    kind: 'testId',
    value: 'catalog-pin-select',
  });
});
