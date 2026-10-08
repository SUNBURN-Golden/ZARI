import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type {
  ParetoCount,
  ParetoMoney,
  ParetoReply,
  PlanSnapshot,
} from '../../src/contracts/generated/dto';
import { WORKER_BUILD_ID } from '../../src/worker/client';
import {
  compareParetoOnce,
  forgetParetoComparison,
  paretoKey,
} from '../../src/features/pareto/controller';
import {
  optimalityText,
  paretoCountText,
  paretoItemQuantityText,
  paretoMoneyText,
} from '../../src/features/pareto/phrases';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

const unknownMoney: ParetoMoney = { state: 'unknown' };
const noPurchase: ParetoMoney = { state: 'noPurchase' };
const knownMoney: ParetoMoney = { state: 'known', amount: '800' };
const freeMoney: ParetoMoney = { state: 'known', amount: '0' };
const unknownCount: ParetoCount = { state: 'unknown' };
const knownCount: ParetoCount = { state: 'known', value: 4 };

it('unknown money and unknown moves are not zero', () => {
  expect(paretoMoneyText(unknownMoney)).toBe('미확인');
  expect(paretoMoneyText(unknownMoney)).not.toContain('₩');
  expect(paretoMoneyText(unknownMoney)).not.toBe('0');
  expect(paretoMoneyText(noPurchase)).toBe('구매 없음');
  expect(paretoMoneyText(knownMoney)).toBe('₩800');
  expect(paretoMoneyText(freeMoney)).toBe('₩0');
  expect(paretoCountText(unknownCount)).toBe('미확인');
  expect(paretoCountText(unknownCount)).not.toBe('0');
  expect(paretoCountText(knownCount)).toBe('4');
  expect(paretoItemQuantityText({ kind: 'unknownQuantity' })).toBe('미확인');
  expect(paretoItemQuantityText({ kind: 'known', count: 2 })).toBe('2');
});

it('an exhausted budget is not labeled a global optimum', () => {
  const text = optimalityText('budgetLimited');
  expect(text).toContain('전역 최적해가 아닙니다');
  expect(text).not.toContain('전역 최적해입니다');
  expect(optimalityText('scopeCompared')).toContain('전역 최적해라고 하지 않습니다');
  expect(optimalityText('scopeCompared')).not.toContain('전역 최적해입니다');
  expect(optimalityText('cancelled')).toContain('전역 최적해가 아닙니다');
  expect(optimalityText('interrupted')).toContain('전역 최적해가 아닙니다');
});

it('one key sends one comparison', async () => {
  const key = paretoKey('digest-a', 'minimumPurchase', 'scopeComplete', ['snap-1']);
  forgetParetoComparison(key);
  let calls = 0;
  const reply = {
    budget: {
      maxAlternatives: 3,
      maxCandidatesPerGroup: 4,
      maxNodes: 64,
      maxWorkUnits: '1000',
    },
    contextMatch: true,
    dominated: [],
    excluded: [],
    front: [],
    globalOptimum: false,
    goal: 'minimumPurchase' as const,
    inputDigest: 'a'.repeat(64),
    optimality: 'budgetLimited' as const,
    readModelVersion: 'zari-pareto-1',
    recalculationRequired: false,
    seed: null,
    termination: 'budgetExhausted' as const,
  };
  const run = () => {
    calls += 1;
    return Promise.resolve(reply);
  };
  const first = compareParetoOnce(key, run);
  const second = compareParetoOnce(key, run);
  expect(await first).toBe(await second);
  expect(calls).toBe(1);
  forgetParetoComparison(key);
  await compareParetoOnce(key, run);
  expect(calls).toBe(2);
});

it('wasm candidate order matches the native front and an exhausted budget stays limited', () => {
  const runtime = new Runtime();
  const ready = send(runtime, 'init', null, {
    kind: 'initialize',
    buildId: WORKER_BUILD_ID,
    expectedProtocolVersion: 1,
    expectedSchemaVersion: 1,
  });
  expect(ready.event.capabilities?.at(-1)).toBe('comparePareto');
  const fixture = JSON.parse(
    readFileSync(new URL('../../../../fixtures/domain/candidate-bounded-confirmed.json', import.meta.url), 'utf8'),
  ) as { input: { input: unknown; catalog: unknown } };
  const activated = send(runtime, 'activate', null, {
    kind: 'activateProject',
    context: { kind: 'project', input: fixture.input.input, catalog: fixture.input.catalog },
  });
  expect(activated.event.kind).toBe('projectActivated');
  const context = activated.event.contextId;
  if (typeof context !== 'string') throw new Error('missing_context');
  const started = send(runtime, 'start', context, { kind: 'startSearch', mode: 'manual' });
  expect(started.event.kind).toBe('searchStarted');
  const searchId = started.event.searchId;
  if (!searchId) throw new Error('missing_search');
  let completed: { result: { alternatives: PlanSnapshot[] } } | null = null;
  for (let step = 0; step < 8; step += 1) {
    const reply = send(runtime, `step-${step}`, context, {
      kind: 'stepSearch',
      searchId,
      allowance: 1024,
    });
    if (reply.event.kind === 'searchCompleted') {
      completed = reply.event as { result: { alternatives: PlanSnapshot[] } };
      break;
    }
    expect(reply.event.kind).toBe('searchProgress');
  }
  expect(completed?.result.alternatives.length).toBeGreaterThan(0);
  const stamped = completed!.result.alternatives[0]!;
  const alternatives = bundle(stamped);
  const compared = send(runtime, 'compare', context, {
    kind: 'comparePareto',
    termination: 'scopeComplete',
    alternatives,
  });
  expect(compared.event.kind).toBe('paretoCompared');
  const reply = compared.event.reply as ParetoReply;
  expect(reply.globalOptimum).toBe(false);
  expect(reply.recalculationRequired).toBe(false);
  expect(reply.front.map((row) => row.candidateId)).toEqual([hex(2), hex(5), hex(3), hex(6)]);
  expect(reply.excluded.map((row) => row.candidateId)).toContain(hex(1));
  expect(reply.front.find((row) => row.candidateId === hex(5))?.purchase).toEqual({ state: 'unknown' });
  const limited = send(runtime, 'limited', context, {
    kind: 'comparePareto',
    termination: 'budgetExhausted',
    alternatives,
  });
  const limitedReply = limited.event.reply as ParetoReply;
  expect(limitedReply.globalOptimum).toBe(false);
  expect(limitedReply.optimality).toBe('budgetLimited');
  expect(limitedReply.front.map((row) => row.candidateId)).toEqual(reply.front.map((row) => row.candidateId));
});

function hex(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function send(
  runtime: Runtime,
  requestId: string,
  contextId: string | null,
  command: { kind: string; [key: string]: unknown },
) {
  const system = command.kind === 'initialize';
  return JSON.parse(
    runtime.handle_json(
      JSON.stringify({
        meta: {
          protocolVersion: 1,
          schemaVersion: 1,
          workerSessionId: 'session-a',
          projectActivationId: system ? 'system' : 'activation-a',
          requestId,
          projectId: system ? 'system' : 'project-a',
          editorEpoch: '0',
          inputRevision: system ? '0' : '1',
          contextId: system ? null : contextId,
        },
        command,
      }),
    ),
  ) as {
    event: {
      kind: string;
      code?: string;
      capabilities?: string[];
      contextId?: string | null;
      searchId?: string;
      reply?: ParetoReply;
      result?: { alternatives: PlanSnapshot[] };
    };
  };
}

const provenance = {
  evidenceIds: [],
  inputRefs: [],
  observedAt: null,
  origin: 'synthetic' as const,
  ruleIds: [],
  verification: 'unverified' as const,
};

function bundle(stamped: PlanSnapshot): PlanSnapshot[] {
  const shell = JSON.parse(
    readFileSync(new URL('../../../../fixtures/domain/record-snapshot-verified.json', import.meta.url), 'utf8'),
  ).input.snapshot as PlanSnapshot;
  const paint = (spec: {
    n: number;
    cost: 'known' | 'unknown' | 'none';
    amount?: string;
    reuse: number;
    moves: 'known' | 'unknown' | 'missing';
    blockers?: string;
    unassigned: number;
    unknownQty: number;
    hard: boolean;
    extraUnknown: boolean;
  }): PlanSnapshot => {
    const snap = structuredClone(shell);
    snap.planSnapshotId = hex(spec.n);
    snap.content.versions.inputDigest = stamped.content.versions.inputDigest;
    snap.content.versions.searchBudget = structuredClone(stamped.content.versions.searchBudget);
    snap.content.versions.seed = stamped.content.versions.seed;
    snap.content.strategy.strategy = stamped.content.strategy.strategy;
    snap.content.costSummary.grandTotal =
      spec.cost === 'known'
        ? { state: 'known', value: spec.amount ?? '0', provenance }
        : spec.cost === 'none'
          ? { state: 'notApplicable', reasonCode: 'no_purchase' }
          : { state: 'unknown', reason: 'notProvided' };
    snap.content.validation.assignmentCompleteness = {
      assignedInstances: 0,
      provisionalInstances: 0,
      unassignedInstances: spec.unassigned,
      unknownQuantityItems: spec.unknownQty,
    };
    snap.content.validation.physicalAssurance = spec.hard ? 'rejected' : 'conditional';
    const access =
      spec.moves === 'known'
        ? check('pass', 'ok', false, [{ fieldPath: 'blockerCount', valueMm: { state: 'known', value: spec.blockers ?? '0', provenance } }])
        : spec.moves === 'unknown'
          ? check('unknown', 'temporary_parking_unsupported', false, [
              { fieldPath: 'blockerCount', valueMm: { state: 'known', value: spec.blockers ?? '0', provenance } },
            ])
          : check('pass', 'ok', false, []);
    const checks = [access];
    if (spec.extraUnknown) {
      checks.push({
        ...check('unknown', 'price_unknown', false, []),
        id: 'check-price',
        kind: 'price',
      });
    }
    if (spec.hard) {
      checks.push({
        ...check('fail', 'hard_budget_exceeded', true, []),
        id: 'check-budget',
        kind: 'budget',
      });
    }
    snap.content.validation.checks = checks;
    snap.content.bom = [bom(spec.reuse)];
    snap.content.unassigned = [];
    if (spec.unassigned > 0) {
      snap.content.unassigned.push({
        itemId: 'item-k',
        instances: { kind: 'known', ranges: [{ start: 0, endExclusive: spec.unassigned }] },
        reasonCode: 'no_fit',
      });
    }
    if (spec.unknownQty > 0) {
      snap.content.unassigned.push({
        itemId: 'item-u',
        instances: { kind: 'unknownQuantity' },
        reasonCode: 'unknown_quantity',
      });
    }
    return snap;
  };
  return [
    paint({ n: 3, cost: 'known', amount: '500', reuse: 2, moves: 'known', blockers: '1', unassigned: 0, unknownQty: 0, hard: false, extraUnknown: false }),
    paint({ n: 1, cost: 'known', amount: '100', reuse: 9, moves: 'known', blockers: '0', unassigned: 0, unknownQty: 0, hard: true, extraUnknown: false }),
    paint({ n: 8, cost: 'known', amount: '800', reuse: 5, moves: 'known', blockers: '0', unassigned: 0, unknownQty: 1, hard: false, extraUnknown: false }),
    paint({ n: 6, cost: 'known', amount: '800', reuse: 5, moves: 'unknown', blockers: '4', unassigned: 0, unknownQty: 0, hard: false, extraUnknown: false }),
    paint({ n: 4, cost: 'known', amount: '900', reuse: 1, moves: 'known', blockers: '3', unassigned: 1, unknownQty: 0, hard: false, extraUnknown: false }),
    paint({ n: 5, cost: 'unknown', reuse: 5, moves: 'known', blockers: '0', unassigned: 0, unknownQty: 0, hard: false, extraUnknown: false }),
    paint({ n: 2, cost: 'known', amount: '800', reuse: 5, moves: 'known', blockers: '0', unassigned: 0, unknownQty: 0, hard: false, extraUnknown: false }),
  ];
}

function check(
  status: string,
  reasonCode: string,
  blocking: boolean,
  measurements: PlanSnapshot['content']['validation']['checks'][number]['measurements'],
): PlanSnapshot['content']['validation']['checks'][number] {
  return {
    id: 'check-access',
    kind: 'operational_access',
    subjectIds: [],
    status: status as 'pass',
    reasonCode,
    basis: 'nonGeometric',
    evidenceRefs: [],
    measurements,
    blocking,
    remediation: [],
  };
}

function bom(reused: number): PlanSnapshot['content']['bom'][number] {
  const absent = { state: 'notApplicable' as const, reasonCode: 'owned' };
  return {
    id: 'bom-1',
    variantId: null,
    ownedId: 'owned-1',
    placementIds: [],
    offerId: null,
    physicalNeeded: 1,
    reused,
    newUnitsNeeded: 0,
    packQuantity: absent,
    packsToOrder: absent,
    supplied: absent,
    surplus: absent,
    productSubtotal: absent,
    evidenceRefs: [],
  };
}
