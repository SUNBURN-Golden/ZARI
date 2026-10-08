import { expect, it } from 'vitest';
import type { LibraryQuantity, LibraryStatement } from '../../src/contracts/generated/dto';
import {
  evaluateLibraryOnce,
  forgetLibraryEvaluation,
  libraryKey,
} from '../../src/features/strategy/controller';
import { quantityText, statementText } from '../../src/features/strategy/phrases';

const unknown: LibraryQuantity = { state: 'unknown', reason: 'notMeasured' };
const zero: LibraryQuantity = { state: 'known', count: 0 };
const three: LibraryQuantity = { state: 'known', count: 3 };

it('unknown quantity is not written as zero', () => {
  expect(quantityText(unknown)).toBe('미확인');
  expect(quantityText(unknown)).not.toBe('0');
  expect(quantityText(unknown)).not.toContain('통과');
  expect(quantityText(zero)).toBe('0');
  expect(quantityText(three)).toBe('3');
});

it('visual preference text is not a hard pass', () => {
  const color: LibraryStatement = {
    code: 'color',
    factRefs: [],
    parameters: { color: 'blue' },
  };
  const safety: LibraryStatement = {
    code: 'safety_restriction_unmodeled',
    factRefs: [],
    parameters: { restriction: 'childSafety' },
  };
  const budget: LibraryStatement = {
    code: 'hard_budget_unknown',
    factRefs: [],
    parameters: { reason: 'notMeasured' },
  };
  expect(statementText(color)).toContain('빼지 않습니다');
  expect(statementText(safety)).not.toContain('통과');
  expect(statementText(budget)).toContain('0원으로 두지 않습니다');
  expect(statementText(budget)).not.toBe('0');
});

it('one saved strategy sends one library command', async () => {
  const key = libraryKey('digest-a', 'minimumPurchase');
  forgetLibraryEvaluation(key);
  let calls = 0;
  const run = () => {
    calls += 1;
    return Promise.resolve({
      alternatives: [],
      assumptions: [],
      candidateItemIds: [],
      droppedWordingDuplicates: 1,
      hardConstraints: [],
      libraryVersion: 'zari-strategy-library-1',
      pinnedStrategy: 'minimumPurchase' as const,
      recipes: [],
      strategyChanged: false,
      unassigned: [],
      visualPreferences: [],
    });
  };
  const first = evaluateLibraryOnce(key, run);
  const second = evaluateLibraryOnce(key, run);
  expect(await first).toBe(await second);
  expect(calls).toBe(1);
  forgetLibraryEvaluation(key);
  await evaluateLibraryOnce(key, run);
  expect(calls).toBe(2);
});
