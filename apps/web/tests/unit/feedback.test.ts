import { expect, it } from 'vitest';
import type {
  FeedbackEntry,
  FeedbackLog,
  LocationLog,
  ProposalReply,
} from '../../src/contracts/generated/dto';
import {
  BUDGET_CHOICES,
  DEFAULT_BUDGET,
  EMPTY_FEEDBACK_LOG,
  FeedbackController,
  feedbackKey,
  forgetProposal,
  proposalOpenAllowed,
  proposalReplyApplies,
  proposeOnce,
  type FeedbackClient,
} from '../../src/features/feedback/controller';
import {
  blockerText,
  frequencyText,
  kindText,
  measureText,
  operationText,
  outcomeText,
  reasonText,
  ruleText,
  statusText,
  swapText,
} from '../../src/features/feedback/phrases';
import type { ProjectRepository } from '../../src/persistence/repository';

const input = { items: [] } as never;
const empty: LocationLog = { observations: [] };

function entry(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    id: 'fb-1',
    itemId: 'item-a',
    kind: 'accessDifficulty',
    frequency: null,
    note: null,
    planSnapshotId: null,
    ...overrides,
  };
}

function reply(): ProposalReply {
  return { readModelVersion: 'zari-feedback-1' } as ProposalReply;
}

it('each kind, outcome, and reason has a sentence and unknown codes show as written', () => {
  expect(kindText('accessDifficulty')).toBe('접근 불편');
  expect(kindText('frequencyChange')).toBe('사용 빈도 변경');
  expect(kindText('maintenanceDifficulty')).toBe('정리 유지 어려움');
  expect(frequencyText('daily')).toBe('매일');
  expect(frequencyText(null)).toBe('미확인');
  expect(ruleText('accessDifficulty')).toContain('접근 규칙');
  expect(ruleText('frequencyChange')).toContain('빈도 규칙');
  expect(ruleText('maintenanceDifficulty')).toContain('유지 규칙');
  for (const outcome of [
    'applied',
    'noBetterSlot',
    'blocked',
    'notApplicable',
    'withdrawn',
    'stale',
    'budgetExhausted',
  ] as const) {
    expect(outcomeText(outcome)).not.toBe(outcome);
  }
  expect(outcomeText('stale')).toBe('다른 계획에 기록됨');
  // An unknown frequency is said to be unknown, never a default.
  expect(reasonText('frequency_unknown')).toContain('빈도를 알 수 없어 비교하지 않았습니다');
  expect(reasonText('no_closer_slot')).toContain('같은 묶음');
  expect(reasonText('superseded')).toContain('나중 빈도 기록');
  expect(reasonText('some_new_code')).toBe('some_new_code');
  expect(blockerText('weakens_checks')).toContain('나빠지는 검사');
  expect(blockerText('some_new_blocker')).toBe('some_new_blocker');
  expect(operationText(null)).toBe('');
  expect(operationText('base_not_in_scope')).toContain('다시 계산');
  expect(operationText('mystery')).toBe('mystery');
  expect(swapText('depthSwap')).toBe('깊이 맞바꿈');
  expect(swapText('slotSwap')).toBe('위치 맞바꿈');
  expect(statusText('unknown')).toBe('미확인');
  expect(statusText('pass')).toBe('통과');
  expect(measureText('frequencyChange', 2, 0)).toBe('순서가 뒤바뀐 쌍 2개 → 0개');
  expect(measureText('accessDifficulty', 1, 0)).toBe('순서가 뒤바뀐 쌍 1개 → 0개');
  expect(measureText('maintenanceDifficulty', 745, 145)).toBe('같은 묶음 사이 거리 합 745 mm → 145 mm');
});

it('the request key moves with every ingredient and not with record order of nothing', () => {
  const log: FeedbackLog = { entries: [entry()], withdrawnIds: [] };
  const base = feedbackKey('digest', 'plan-1', log, empty, 16);
  expect(feedbackKey('digest', 'plan-1', log, empty, 16)).toBe(base);
  expect(feedbackKey('other', 'plan-1', log, empty, 16)).not.toBe(base);
  expect(feedbackKey('digest', 'plan-2', log, empty, 16)).not.toBe(base);
  expect(feedbackKey('digest', 'plan-1', log, empty, 32)).not.toBe(base);
  const noted: FeedbackLog = { entries: [entry({ note: '무거움' })], withdrawnIds: [] };
  expect(feedbackKey('digest', 'plan-1', noted, empty, 16)).not.toBe(base);
  const withdrawn: FeedbackLog = { entries: [entry()], withdrawnIds: ['fb-1'] };
  expect(feedbackKey('digest', 'plan-1', withdrawn, empty, 16)).not.toBe(base);
  const located: LocationLog = {
    observations: [
      {
        id: 'obs-1',
        itemId: 'item-a',
        kind: 'relocate',
        label: '코트',
        location: '현관',
        unitOrdinals: [],
        planSnapshotId: null,
      },
    ],
  };
  expect(feedbackKey('digest', 'plan-1', log, located, 16)).not.toBe(base);
  expect(BUDGET_CHOICES).toContain(DEFAULT_BUDGET);
});

it('one command is shared by readers and a failure is forgotten so a person can ask again', async () => {
  let calls = 0;
  const key = 'k1';
  let release: (value: ProposalReply) => void = () => {};
  const first = proposeOnce(key, () => {
    calls += 1;
    return new Promise<ProposalReply>((resolve) => {
      release = resolve;
    });
  });
  const second = proposeOnce(key, async () => {
    calls += 1;
    return reply();
  });
  expect(second).toBe(first);
  release(reply());
  await first;
  expect(calls).toBe(1);
  forgetProposal(key);
  await proposeOnce(key, async () => {
    calls += 1;
    return reply();
  });
  expect(calls).toBe(2);

  let failing = 0;
  await expect(
    proposeOnce('k2', async () => {
      failing += 1;
      throw new Error('base_not_in_scope');
    }),
  ).rejects.toThrow('base_not_in_scope');
  await proposeOnce('k2', async () => {
    failing += 1;
    return reply();
  });
  expect(failing).toBe(2);
});

it('a reply applies only to the request that is still current and only for the adopted plan', () => {
  expect(proposalReplyApplies(3, 3)).toBe(true);
  expect(proposalReplyApplies(3, 4)).toBe(false);
  expect(proposalOpenAllowed(3, 3, 'published', 'plan-1', 'plan-1')).toBe(true);
  // A cancel bumps the epoch: a late reply cannot be opened.
  expect(proposalOpenAllowed(3, 4, 'published', 'plan-1', 'plan-1')).toBe(false);
  // No draft is nothing to open.
  expect(proposalOpenAllowed(3, 3, 'noChange', 'plan-1', 'plan-1')).toBe(false);
  expect(proposalOpenAllowed(3, 3, null, 'plan-1', 'plan-1')).toBe(false);
  // A draft made for another adopted plan is never opened.
  expect(proposalOpenAllowed(3, 3, 'published', 'plan-1', 'plan-2')).toBe(false);
  expect(proposalOpenAllowed(3, 3, 'published', 'plan-1', null)).toBe(false);
  expect(proposalOpenAllowed(3, 3, 'published', null, 'plan-1')).toBe(false);
});

function controllerWith(reply: (kind: string) => unknown, saves: { n: number; status?: string }) {
  const workers = {
    async ensure() {
      return {
        async systemRequest(command: { kind: string }) {
          return reply(command.kind);
        },
      };
    },
  };
  const repository = {
    async saveFeedbackLog() {
      saves.n += 1;
      return { status: saves.status ?? 'saved', revision: '1' };
    },
  };
  return new FeedbackController(
    workers as { ensure(): Promise<FeedbackClient> },
    repository as unknown as ProjectRepository,
  );
}

it('persists only a log Rust changed and surfaces refusals without saving', async () => {
  const saves = { n: 0 };
  const stored: FeedbackLog = { entries: [entry()], withdrawnIds: [] };
  let changed = true;
  const controller = controllerWith(
    () => ({ kind: 'feedbackLogApplied', reply: { log: stored, changed } }),
    saves,
  );
  const recorded = await controller.record('p', EMPTY_FEEDBACK_LOG, '0', input, null, entry());
  expect(recorded.revision).toBe('1');
  expect(saves.n).toBe(1);
  changed = false;
  const unchanged = await controller.withdraw('p', stored, '1', input, null, 'fb-1');
  expect(unchanged.revision).toBe('1');
  expect(saves.n).toBe(1);

  const refusing = controllerWith(
    () => ({
      kind: 'operationFailed',
      code: 'needs_plan',
      affectedFields: [],
      affectedIds: [],
      reasonParameters: {},
      retryable: false,
    }),
    saves,
  );
  await expect(
    refusing.record('p', EMPTY_FEEDBACK_LOG, '0', input, null, entry()),
  ).rejects.toThrow('needs_plan');
  expect(saves.n).toBe(1);

  const wrong = controllerWith(() => ({ kind: 'locationLogApplied' }), saves);
  await expect(
    wrong.record('p', EMPTY_FEEDBACK_LOG, '0', input, null, entry()),
  ).rejects.toThrow('unexpected_worker_event');

  const lost = controllerWith(
    () => ({ kind: 'feedbackLogApplied', reply: { log: stored, changed: true } }),
    { n: 0, status: 'conflict' },
  );
  await expect(
    lost.record('p', EMPTY_FEEDBACK_LOG, '0', input, null, entry()),
  ).rejects.toThrow('revision_conflict');
});

it('the empty log has no entries and no withdrawals', () => {
  expect(EMPTY_FEEDBACK_LOG).toEqual({ entries: [], withdrawnIds: [] });
});
