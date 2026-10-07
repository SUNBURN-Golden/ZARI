import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

function readOracle(name: string) {
  return JSON.parse(
    readFileSync(`docs/oracles/product-completion/${name}`, 'utf8'),
  ) as Record<string, unknown>;
}

function displayOrder(actions: Array<{ id: string; prerequisiteStepIds: string[] }>): string[] {
  const preds = new Map(actions.map((step) => [step.id, step.prerequisiteStepIds]));
  const indegree = new Map([...preds.keys()].map((id) => [id, 0]));
  const dependents = new Map<string, string[]>();
  for (const [id, pre] of preds) {
    const sorted = [...pre].sort();
    expect(pre, id).toEqual(sorted);
    for (const item of pre) {
      expect(preds.has(item), item).toBe(true);
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      dependents.set(item, [...(dependents.get(item) ?? []), id]);
    }
  }
  const ready = [...indegree.keys()].filter((id) => indegree.get(id) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      if (indegree.get(dependent) === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  expect(order).toHaveLength(preds.size);
  return order;
}

it('PC oracles name owners, refuse checkbox confirmation, and name no future build', () => {
  const index = readOracle('index.json');
  expect(index.currentBuildId).toBe('zari-domain-6');
  expect(index.assertedFutureBuildId).toBeNull();
  expect(index.reviewChecks).toEqual([
    'historyCompatibility',
    'physicalGuideOrder',
    'instanceConservation',
    'budgetCancelSemantics',
  ]);
  const held = index.heldUntilSeparateAdoption as string[];
  expect(held).toContain('schema migration');
  expect(held).toContain('queryActionEligibility command');
  expect(held).toContain('BUILD_ID bump');
  expect(held).toContain('fact confirmation');

  const covered = new Set<string>();
  for (const gap of index.gaps as Array<{ owner: string; oracles: string[] }>) {
    expect(['SP-013', 'SP-014', 'SP-015']).toContain(gap.owner);
    for (const id of gap.oracles) covered.add(id);
  }
  for (let n = 1; n <= 11; n += 1) {
    const id = `PC-${String(n).padStart(2, '0')}`;
    expect(covered.has(id), id).toBe(true);
    const oracle = readOracle(`pc-${String(n).padStart(2, '0')}.json`);
    expect(oracle.oracleId).toBe(id);
    expect(oracle.engineOutput).toBe(false);
    expect(oracle.buildId).toBeNull();
    expect(oracle.checkboxResolvesUnknown).toBe(false);
    expect(oracle.checkboxSetsConfirmed).toBe(false);
    expect(JSON.stringify(oracle)).not.toContain('zari-domain-7');
  }
});

it('PC-02 and PC-03 keep hand-derived quantity and load-before-install order', () => {
  const pc02 = readOracle('pc-02.json');
  const unit = pc02.newUnit as {
    physicalNeeded: number;
    packQuantity: number;
    packsToOrder: number;
    supplied: number;
    surplus: number;
  };
  const packs = Math.ceil(unit.physicalNeeded / unit.packQuantity);
  expect(packs).toBe(1);
  expect(packs * unit.packQuantity).toBe(2);
  expect(packs * unit.packQuantity - unit.physicalNeeded).toBe(1);
  expect(unit.packsToOrder).toBe(packs);
  expect(unit.supplied).toBe(2);
  expect(unit.surplus).toBe(1);
  expect(pc02.price).not.toEqual(pc02.shipping);
  const actions = pc02.actions as Array<{
    id: string;
    kind: string;
    prerequisiteStepIds: string[];
  }>;
  expect(actions.filter((step) => step.kind === 'acquire')).toHaveLength(1);
  expect(pc02.displayOrder).toEqual(displayOrder(actions));

  const pc03 = readOracle('pc-03.json');
  const geometry = pc03.geometry as {
    front: { y: number; depth: number };
    rear: { y: number };
  };
  expect(geometry.front.y + geometry.front.depth).toBeLessThanOrEqual(geometry.rear.y);
  const graph = pc03.actions as Array<{
    id: string;
    kind: string;
    prerequisiteStepIds: string[];
    instanceRefs: Array<{ unitOrdinal?: number; containerPlacementId?: string }>;
  }>;
  const front = graph.find((step) => step.id === 'act:install:bin-front');
  const rear = graph.find((step) => step.id === 'act:install:bin-rear');
  expect(front?.prerequisiteStepIds).toContain('act:install:bin-rear');
  expect(rear?.prerequisiteStepIds).not.toContain('act:install:bin-front');
  for (const step of graph.filter((item) => item.kind === 'transferContents')) {
    const container = step.instanceRefs[0]?.containerPlacementId;
    const install = graph.find((item) => item.id === `act:install:${container}`);
    expect(install?.prerequisiteStepIds).toContain(step.id);
    expect(step.prerequisiteStepIds.some((id) => id.startsWith('act:install:'))).toBe(false);
    expect(step.instanceRefs[0]?.unitOrdinal).toBe(0);
  }
  expect(pc03.displayOrder).toEqual(displayOrder(graph));
  const conservation = pc03.conservation as { assigned: number; unassignedKnown: number };
  expect(conservation.assigned + conservation.unassignedKnown).toBe(4);
});

it('PC-04 through PC-11 keep unknown, publication, and history fences', () => {
  const pc04 = readOracle('pc-04.json');
  expect(pc04.promotions).toBe(0);
  expect(pc04.resolveConditionDone).toMatchObject({
    changesCheckStatus: false,
    setsConfirmed: false,
  });
  for (const blocker of pc04.blockers as Array<{ status: string; notClearedBy: string[] }>) {
    expect(blocker.status).toBe('unknown');
    expect(blocker.notClearedBy).toContain('done');
  }

  const pc05 = readOracle('pc-05.json');
  expect(pc05.callerPassFlag).toBe('absent');
  expect(pc05.knownHardFailurePublication).toBe(0);
  expect(pc05.nominalPassConservativeBlockingFail).toMatchObject({ snapshot: null });

  const pc06 = readOracle('pc-06.json');
  expect(pc06.allowances).toEqual([1, 7, 128, 256, 1024]);
  expect(pc06.publicationBeforeChecksComplete).toBe(0);
  expect(pc06.nearBudget).toMatchObject({ termination: 'budgetExhausted' });

  const pc07 = readOracle('pc-07.json');
  expect(pc07.cancelDuringPhase).toMatchObject({
    partialSnapshot: 0,
    partialBom: 0,
    partialActions: 0,
    partialHash: 0,
    lateReplyApplied: 0,
  });
  expect(pc07.hardTerminate).toMatchObject({ termination: 'interrupted' });
  expect(pc07.catalogSwitchReusesHandle).toBe(false);

  const pc08 = readOracle('pc-08.json');
  const stamp = pc08.requiredStamp as string[];
  for (const field of ['inputDigest', 'planSnapshotId', 'catalogDigest', 'ruleVersion', 'editorEpoch', 'progressIdentity']) {
    expect(stamp).toContain(field);
  }
  expect(pc08.workerInsideTransaction).toBe(false);
  expect(pc08.nullProgressEligible).toBe(false);
  expect(pc08.staleWrite).toBe(0);
  expect(pc08.previousDoneRowKept).toBe(true);

  expect(readOracle('pc-09.json').newBindingProgressCarry).toBe(0);
  const pc10 = readOracle('pc-10.json');
  expect(pc10.futureBuildId).toBeNull();
  expect(pc10.migrationAdopted).toBe(false);
  expect(pc10.olderRuleGuide).toMatchObject({
    readable: true,
    completionAllowed: false,
    rowsDeleted: false,
    rowsCarried: false,
  });
  const pc11 = readOracle('pc-11.json');
  expect(pc11.halfProject).toBe(0);
  expect(pc11.fakeSaved).toBe(0);
  expect(pc11.missingPhotosCalledBackup).toBe(false);
  expect(pc11.duplicateResetsProgress).toBe(true);

  const matrix = readOracle('decoding-matrix.json');
  expect(JSON.stringify(matrix)).toContain('operation_not_supported');
  const accounting = readOracle('evaluation-accounting.json');
  expect(accounting.lumpIsFutureQuantum).toBe(false);
  expect(accounting.phases).toEqual(pc07.phases);
});
