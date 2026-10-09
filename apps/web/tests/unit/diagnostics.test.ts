import { expect, it } from 'vitest';
import {
  diagnoseOnce,
  diagnosisReplyApplies,
  diagnosticKey,
  forgetDiagnosis,
} from '../../src/features/diagnostics/controller';
import { budgetText, classSentence } from '../../src/features/diagnostics/phrases';

it('one search key sends one diagnosis and a forgotten key can send again', async () => {
  const key = diagnosticKey({
    inputDigest: 'input',
    catalogDigest: 'catalog',
    termination: 'scopeComplete',
    workUnits: '12',
    nodes: 3,
    reasons: ['b', 'a'],
    snapshotIds: ['s2', 's1'],
    restrictions: ['owned_geometry_unknown:item-b', 'catalog_data_unknown:item-a'],
  });
  const same = diagnosticKey({
    inputDigest: 'input',
    catalogDigest: 'catalog',
    termination: 'scopeComplete',
    workUnits: '12',
    nodes: 3,
    reasons: ['a', 'b'],
    snapshotIds: ['s1', 's2'],
    restrictions: ['catalog_data_unknown:item-a', 'owned_geometry_unknown:item-b'],
  });
  expect(same).toBe(key);
  expect(
    diagnosticKey({
      inputDigest: 'other',
      catalogDigest: 'catalog',
      termination: 'scopeComplete',
      workUnits: '12',
      nodes: 3,
      reasons: ['a', 'b'],
      snapshotIds: ['s1', 's2'],
      restrictions: [],
    }),
  ).not.toBe(key);
  let calls = 0;
  const run = () => {
    calls += 1;
    return Promise.resolve({ readModelVersion: 'zari-search-diagnostics-1' } as never);
  };
  const first = diagnoseOnce(key, run);
  const second = diagnoseOnce(key, run);
  expect(first).toBe(second);
  await first;
  expect(calls).toBe(1);
  forgetDiagnosis(key);
  await diagnoseOnce(key, run);
  expect(calls).toBe(2);
});

it('a cancelled epoch does not apply a late diagnosis', () => {
  expect(diagnosisReplyApplies(1, 1)).toBe(true);
  expect(diagnosisReplyApplies(1, 2)).toBe(false);
});

it('does not call an unknown measurement a missing product', () => {
  expect(classSentence('noProduct', false, true)).toBe('제품이 없다고 단정하지 않습니다.');
  expect(classSentence('undetermined', true, true)).toContain('제품이 없다는 뜻이 아닙니다');
  expect(classSentence('noProduct', true, false)).toContain('알려진 제품이 없습니다');
});

it('does not call a larger budget a proof that no plan exists', () => {
  const suggested = budgetText(true, true, false);
  expect(suggested).toContain('예산을 늘리면');
  expect(suggested).toContain('증명이 아닙니다');
  expect(suggested).not.toContain('불가능이 증명');
  expect(budgetText(false, true, false)).toContain('불가능의 증명이 아닙니다');
  expect(budgetText(true, true, true)).toBe('더 큰 예산을 불가능의 증명으로 표시하지 않습니다.');
  expect(budgetText(false, false, false)).toContain('예산 소진으로 끝나지 않았습니다');
});
