import { expect, it } from 'vitest';
import {
  forgetReplan,
  replanAdoptAllowed,
  replanKey,
  replanOnce,
  replanReplyApplies,
} from '../../src/features/incremental/controller';
import {
  checkStatusText,
  conflictText,
  reusedPassText,
} from '../../src/features/incremental/phrases';

it('one pin set sends one replan and a forgotten key can send again', async () => {
  const key = replanKey('digest', 'snapshot', {
    placementIds: ['p-a'],
    itemIds: [],
    strategy: false,
  });
  let calls = 0;
  const run = () => {
    calls += 1;
    return Promise.resolve({ readModelVersion: 'zari-incremental-1' } as never);
  };
  const first = replanOnce(key, run);
  const second = replanOnce(key, run);
  expect(first).toBe(second);
  await first;
  expect(calls).toBe(1);
  forgetReplan(key);
  await replanOnce(key, run);
  expect(calls).toBe(2);
});

it('pin order does not change the command key', () => {
  const left = replanKey('digest', 'snapshot', {
    placementIds: ['b', 'a'],
    itemIds: ['d', 'c'],
    strategy: true,
  });
  const right = replanKey('digest', 'snapshot', {
    placementIds: ['a', 'b'],
    itemIds: ['c', 'd'],
    strategy: true,
  });
  expect(left).toBe(right);
  expect(
    replanKey('digest', 'snapshot', { placementIds: ['a'], itemIds: [], strategy: false }),
  ).not.toBe(left);
});

it('a cancelled epoch cannot adopt a published reply', () => {
  expect(replanReplyApplies(1, 1)).toBe(true);
  expect(replanReplyApplies(1, 2)).toBe(false);
  expect(replanAdoptAllowed(1, 1, 'published')).toBe(true);
  expect(replanAdoptAllowed(1, 2, 'published')).toBe(false);
  expect(replanAdoptAllowed(1, 1, 'blocked')).toBe(false);
  expect(replanAdoptAllowed(1, 1, null)).toBe(false);
});

it('does not describe an old pass as reused', () => {
  expect(reusedPassText(false)).toBe('이전 통과를 다시 쓰지 않습니다');
  expect(checkStatusText('unknown')).toBe('미확인');
  expect(checkStatusText('fail')).toBe('실패');
  expect(checkStatusText('pass')).toBe('통과');
  expect(conflictText('pin_blocks')).toContain('옮기지 않았');
  expect(conflictText('strategy_pinned')).toContain('바꾸지 않았');
  expect(conflictText('unknown_quantity_ordinals')).toContain('미확인');
});
