import { expect, it } from 'vitest';
import type { FormattedMeasurementGroup } from '../../src/contracts/generated/dto';
import {
  applyGroupFormatResult,
  clearFreshProjectAssumptions,
  detailGroups,
  normalizedView,
  readEvidence,
  routeKind,
  unknownValueCount,
  writeBaseSupport,
  writeEvidence,
  writeNominal,
  writeUncertainty,
} from '../../src/features/project/detailFacts';
import { emptyProjectForm, getMeasurement, sampleProjectForm } from '../../src/features/project/draft';

const HANDLING = ['left', 'right', 'top', 'pullExtraDepth', 'liftAboveRim'] as const;

it('a fresh form clears inherited support and handling without touching the sample', () => {
  const sample = sampleProjectForm();
  const fresh = emptyProjectForm();
  expect(sample.space.staging.baseSupport.state).toBe('known');
  if (sample.space.staging.baseSupport.state === 'known') {
    expect(sample.space.staging.baseSupport.value.loadLimit.state).toBe('known');
  }
  expect(sample.items[0]?.requirement.handling.left.state).toBe('known');
  expect(fresh.space.staging.baseSupport).toEqual({ state: 'unknown', reason: 'notMeasured' });
  for (const item of fresh.items) {
    for (const axis of HANDLING) {
      expect(item.requirement.handling[axis]).toEqual({ state: 'unknown', reason: 'notMeasured' });
    }
  }
  expect(sampleProjectForm().space.staging.baseSupport.state).toBe('known');
  expect(unknownValueCount(fresh)).toBeGreaterThan(0);
  const supportUnknown = readDetailSupport(fresh);
  expect(supportUnknown).toBe(true);
});

it('marking support known does not invent a 50000 g load', () => {
  const next = writeBaseSupport(emptyProjectForm(), true);
  expect(next.space.staging.baseSupport.state).toBe('known');
  if (next.space.staging.baseSupport.state !== 'known') return;
  expect(next.space.staging.baseSupport.value.loadLimit).toEqual({
    state: 'unknown',
    reason: 'notMeasured',
  });
});

it('routes an arbitrary item id and refuses a catalogue overwrite', () => {
  const form = emptyProjectForm();
  form.items[0]!.id = 'shelf-9';
  form.items[0]!.label = '선반';
  const groups = detailGroups(form);
  expect(groups.some((group) => group.id === 'item-shelf-9' && group.label === '선반')).toBe(true);
  expect(groups.some((group) => group.id === 'item-item-a')).toBe(false);
  const quantity = writeNominal(form, 'items.shelf-9.quantity', '0');
  expect(quantity?.items[0]?.quantity).toMatchObject({ state: 'known', value: { text: '0' } });
  expect(routeKind('ownedContainers.box-1.physical.exterior.width')?.mutable).toBe(false);
  expect(routeKind('variants.box-1.dimensions.exterior.width')?.mutable).toBe(false);
  expect(writeNominal(form, 'variants.box-1.dimensions.exterior.width', '9')).toBeNull();
  expect(writeNominal(form, 'ownedContainers.box-1.physical.exterior.width', '9')).toBeNull();
  expect(routeKind('items.not a valid id.quantity')).toBeNull();
});

it('keeps a missing bound empty and holds an invalid group instead of converting it', () => {
  const form = emptyProjectForm();
  const measurement = getMeasurement(form, 'space.interior.width');
  measurement.text = '600';
  const partial = writeUncertainty(form, 'space.interior.width', {
    state: 'bounded',
    minusText: '10',
    plusText: '',
    unit: 'mm',
  });
  expect(getMeasurement(partial!, 'space.interior.width').uncertainty).toEqual({
    state: 'bounded',
    minusText: '10',
    plusText: '',
    unit: 'mm',
  });
  const held = applyGroupFormatResult(partial!, 'space.interior.width', 'cm', {
    ...group('space.interior.width'),
    converted: false,
    nominalText: null,
    uncertainty: { state: 'notConverted', code: 'uncertainty_missing' },
  });
  expect(held).toEqual({ hold: 'uncertainty_missing' });
  expect(getMeasurement(partial!, 'space.interior.width').text).toBe('600');
  const ime = applyGroupFormatResult(form, 'space.interior.width', 'cm', {
    ...group('space.interior.width'),
    converted: false,
    nominalText: null,
    uncertainty: { state: 'notConverted', code: 'invalid_number' },
  });
  expect(ime).toEqual({ hold: 'invalid_number' });
  expect(getMeasurement(form, 'space.interior.width').unit).toBe('mm');
});

it('converts a complete group and changes only the unit of a blank length', () => {
  const form = emptyProjectForm();
  getMeasurement(form, 'space.interior.width').text = '600';
  getMeasurement(form, 'space.interior.width').uncertainty = {
    state: 'bounded',
    minusText: '10',
    plusText: '20',
    unit: 'mm',
  };
  const converted = applyGroupFormatResult(form, 'space.interior.width', 'cm', {
    ...group('space.interior.width', 'cm'),
    converted: true,
    nominalText: '60',
    uncertainty: { state: 'bounded', minusText: '1', plusText: '2' },
  });
  expect('form' in converted).toBe(true);
  if (!('form' in converted)) return;
  expect(getMeasurement(converted.form, 'space.interior.width')).toMatchObject({
    text: '60',
    unit: 'cm',
    uncertainty: { state: 'bounded', minusText: '1', plusText: '2', unit: 'cm' },
  });
  const blank = emptyProjectForm();
  const relabeled = applyGroupFormatResult(blank, 'space.interior.width', 'cm', {
    ...group('space.interior.width', 'cm'),
    converted: false,
    nominalText: null,
    uncertainty: { state: 'notConverted', code: 'not_measured' },
  });
  expect('form' in relabeled).toBe(true);
  if (!('form' in relabeled)) return;
  expect(getMeasurement(relabeled.form, 'space.interior.width')).toMatchObject({
    text: '',
    unit: 'cm',
  });
});

it('stores a conflict sentence as a note and does not invent a normalized interval', () => {
  let form = emptyProjectForm();
  form = writeNominal(form, 'space.interior.width', '600')!;
  form = writeEvidence(form, 'space.interior.width', {
    note: '다른 줄자와 충돌한다. 평균 590 mm.',
    locator: 'local:tape',
    observedAt: '2026-10-07T00:00:00Z',
    sourceKind: 'userMeasured',
  })!;
  const evidence = readEvidence(form, 'space.interior.width');
  expect(evidence).toMatchObject({
    note: '다른 줄자와 충돌한다. 평균 590 mm.',
    locator: 'local:tape',
    observedAt: '2026-10-07T00:00:00Z',
    sourceKind: 'userMeasured',
    confirmedBy: null,
  });
  expect(getMeasurement(form, 'space.interior.width').text).toBe('600');
  expect(getMeasurement(form, 'space.interior.width').uncertainty.state).toBe('unknown');
  expect(normalizedView(null, 'space.interior.width').state).toBe('absent');
});

it('clearFreshProjectAssumptions is the only fresh-project mutation of support', () => {
  const form = sampleProjectForm();
  clearFreshProjectAssumptions(form);
  expect(form.space.staging.baseSupport.state).toBe('unknown');
  expect(sampleProjectForm().items[1]?.requirement.handling.liftAboveRim.state).toBe('known');
});

function readDetailSupport(form: ReturnType<typeof emptyProjectForm>): boolean {
  return form.space.staging.baseSupport.state === 'unknown';
}

function group(fieldPath: string, unit: 'mm' | 'cm' = 'mm'): FormattedMeasurementGroup {
  return {
    converted: false,
    entity: { kind: 'space' },
    fieldPath,
    kind: 'positiveLength',
    mutable: true,
    nominalText: null,
    uncertainty: { state: 'unknown' },
    unit,
  };
}
