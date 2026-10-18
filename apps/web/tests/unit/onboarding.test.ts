import { describe, expect, it } from 'vitest';
import type { NextFactRow } from '../../src/contracts/generated/dto';
import {
  ERROR_FIX,
  errorFix,
  EXAMPLE_NAME,
  FIELD_HELP,
  FIELD_LABELS,
  GUIDE_STEPS,
  hasAnyMeasurement,
  isExampleName,
  SCOPE_LINES,
  suggestedField,
  usesSyntheticCatalog,
} from '../../src/features/onboarding/guide';
import { DIAGNOSTIC_TEXT } from '../../src/features/project/detailFacts';
import {
  emptyProjectForm,
  getMeasurement,
  MEASUREMENT_FIELDS,
  sampleProjectForm,
  setMeasurementText,
} from '../../src/features/project/draft';
import { EMPTY_NEXT_FACTS, type NextFactsView } from '../../src/features/project/nextFacts';

function row(path: string, patch: Partial<NextFactRow> = {}): NextFactRow {
  return {
    checkIds: [],
    factKey: `k-${path}`,
    fieldRefs: [{ fieldPath: path } as NextFactRow['fieldRefs'][number]],
    needKind: 'missingNominal',
    priorityClass: 'requiredPhysicalUnknown',
    reasonCodes: [],
    relatedCheckCount: 0,
    resolutionActions: [],
    targetRefs: [],
    ...patch,
  };
}
const ready = (rows: NextFactRow[]): NextFactsView => ({ ...EMPTY_NEXT_FACTS, status: 'ready', rows });

describe('example vs real start', () => {
  it('only the example name is an example, and a real start has no values', () => {
    expect(isExampleName(EXAMPLE_NAME)).toBe(true);
    expect(isExampleName('새 정리 프로젝트')).toBe(false);
    expect(isExampleName(null)).toBe(false);
    expect(hasAnyMeasurement(emptyProjectForm())).toBe(false);
    expect(hasAnyMeasurement(sampleProjectForm())).toBe(true);
    expect(hasAnyMeasurement(null)).toBe(false);
  });
  it('flags the bundled synthetic catalog pin and no other', () => {
    const form = sampleProjectForm();
    expect(usesSyntheticCatalog(form)).toBe(true);
    expect(usesSyntheticCatalog(emptyProjectForm())).toBe(true);
    form.catalogPin = { ...form.catalogPin, catalogDigest: 'f'.repeat(64) };
    expect(usesSyntheticCatalog(form)).toBe(false);
    expect(usesSyntheticCatalog(null)).toBe(false);
  });
});

describe('guide content', () => {
  it('has a label and help with an input example for every measurement field', () => {
    for (const field of MEASUREMENT_FIELDS) {
      expect(FIELD_LABELS[field]).toBeTruthy();
      expect(FIELD_HELP[field].how.length).toBeGreaterThan(10);
      expect(FIELD_HELP[field].example).toMatch(/\d/);
    }
  });
  it('steps list each field once, put the space first, and keep optional steps optional', () => {
    const listed = GUIDE_STEPS.flatMap((step) => [...step.fields]);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...MEASUREMENT_FIELDS].sort());
    expect(GUIDE_STEPS[0]?.id).toBe('space');
    expect(GUIDE_STEPS.find((s) => s.id === 'items')?.optional).toBe(true);
    expect(GUIDE_STEPS.find((s) => s.id === 'opening')?.optional).toBe(true);
  });
  it('every Rust diagnostic code has a concrete correction and scope lines never promise purchase', () => {
    for (const code of Object.keys(DIAGNOSTIC_TEXT)) expect(errorFix(code).length).toBeGreaterThan(10);
    expect(errorFix('something_new')).toMatch(/다시/);
    expect(ERROR_FIX['invalid_number']).toMatch(/600/);
    expect(SCOPE_LINES.join(' ')).toMatch(/구매·결제를 하지 않습니다/);
  });
});

describe('suggestedField', () => {
  it('prefers the first field row of the Rust next-facts list', () => {
    const picked = suggestedField(
      emptyProjectForm(),
      ready([row('space.interior.depth'), row('space.interior.width')]),
    );
    expect(picked).toEqual({ field: 'space.interior.depth', source: 'rust' });
  });
  it('skips catalog, unsupported and unknown paths in the Rust list', () => {
    const picked = suggestedField(
      emptyProjectForm(),
      ready([
        row('space.interior.width', { resolutionActions: ['inspectCatalogSource'] }),
        row('catalog.nothing'),
        row('space.opening.height'),
      ]),
    );
    expect(picked).toEqual({ field: 'space.opening.height', source: 'rust' });
  });
  it('falls back to the first blank required field, never to an optional one', () => {
    expect(suggestedField(emptyProjectForm(), EMPTY_NEXT_FACTS)).toEqual({
      field: 'space.interior.width',
      source: 'order',
    });
    let form = emptyProjectForm();
    for (const field of ['space.interior.width', 'space.interior.depth'] as const) {
      form = setMeasurementText(form, field, '600');
    }
    expect(suggestedField(form, { ...EMPTY_NEXT_FACTS, status: 'stale' })).toEqual({
      field: 'space.interior.height',
      source: 'order',
    });
    form = setMeasurementText(form, 'space.interior.height', '1800');
    // Opening and items stay blank: they are not demanded first.
    expect(getMeasurement(form, 'space.opening.width').text).toBe('');
    expect(suggestedField(form, EMPTY_NEXT_FACTS)).toBeNull();
  });
  it('does not edit the draft it reads', () => {
    const form = emptyProjectForm();
    const before = JSON.stringify(form);
    suggestedField(form, ready([row('space.interior.width')]));
    expect(JSON.stringify(form)).toBe(before);
  });
});
