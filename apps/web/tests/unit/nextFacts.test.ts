import { expect, it } from 'vitest';
import { nextFactDestination, nextFactsLeaseMatches, nextFactsReplyMatches, nextFactsSourceKey, type NextFactsLease } from '../../src/features/project/nextFacts';
import type { NextFactsReply } from '../../src/contracts/generated/dto';

it('routes a measurement, a catalog source, and an unsupported path without guessing', () => {
  expect(
    nextFactDestination({
      fieldRefs: [{ fieldPath: 'space.interior.width' }],
      resolutionActions: ['editSupportedField'],
      needKind: 'missingBound',
      priorityClass: 'requiredPhysicalUnknown',
    }),
  ).toEqual({ kind: 'field', path: 'space.interior.width' });
  expect(
    nextFactDestination({
      fieldRefs: [{ fieldPath: 'variants.sku-zz.dimensions.outer.width' }],
      resolutionActions: ['inspectCatalogSource'],
      needKind: 'missingNominal',
      priorityClass: 'procurementUnknown',
    }).kind,
  ).toBe('catalog');
  expect(
    nextFactDestination({
      fieldRefs: [],
      resolutionActions: ['requestSupportedScope'],
      needKind: 'unsupportedInput',
      priorityClass: 'softOrUnsupported',
    }),
  ).toEqual({ kind: 'unsupported', path: null });
  expect(
    nextFactDestination({
      fieldRefs: [{ fieldPath: 'constraints.hardBudget' }],
      resolutionActions: ['requestSupportedScope'],
      needKind: 'repairKnownFailure',
      priorityClass: 'repairKnownFailure',
    }).kind,
  ).toBe('unsupported');
  expect(
    nextFactDestination({
      fieldRefs: [{ fieldPath: 'space.opening.width' }],
      resolutionActions: ['requestSupportedScope'],
      needKind: 'repairKnownFailure',
      priorityClass: 'softOrUnsupported',
    }).kind,
  ).toBe('unsupported');
});

it('drops a reply whose stamp is not the leased source', () => {
  const lease: NextFactsLease = {
    projectId: 'p',
    inputDigest: 'aa'.repeat(32),
    snapshotId: null,
    catalogDigest: 'bb'.repeat(32),
    rawGeneration: 1,
    worker: {},
    mount: 0,
  };
  expect(nextFactsSourceKey(lease)).toBe(`p|${'aa'.repeat(32)}||${'bb'.repeat(32)}`);
  expect(nextFactsLeaseMatches(lease, { ...lease, mount: 1 })).toBe(false);
  const reply = {
    freshness: 'inputOnly',
    resolutionActions: [],
    rows: [],
    sourceStamp: {
      canonicalVersion: 1,
      catalogDigest: lease.catalogDigest,
      inputDigest: 'cc'.repeat(32),
      planSnapshotId: null,
      ruleVersion: 'rule',
    },
  } as NextFactsReply;
  expect(nextFactsReplyMatches(lease, reply)).toBe(false);
});
