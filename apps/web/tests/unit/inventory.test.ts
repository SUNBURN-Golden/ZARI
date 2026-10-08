import { expect, it } from 'vitest';
import type { InventoryAction, InventoryLedger, InventoryReply } from '../../src/contracts/generated/dto';
import { InventoryController, type InventoryClient } from '../../src/features/inventory/controller';
import { quantityPhrase } from '../../src/features/inventory/phrases';
import type { ProjectRepository } from '../../src/persistence/repository';

const ledger: InventoryLedger = { items: [], containers: [], events: [] };

function reply(changed: boolean, reason = 'ok'): InventoryReply {
  return {
    changed,
    conservation: { status: changed ? 'pass' : 'fail', reasonCode: reason },
    historicalPlanId: null,
    labels: [],
    ledger,
  };
}

it('unknown quantity text is never the zero phrase', () => {
  expect(quantityPhrase('unknown', null)).toBe('수량 미상');
  expect(quantityPhrase('unknown', 0)).toBe('수량 미상');
  expect(quantityPhrase('zero', 0)).toBe('0개');
  expect(quantityPhrase('count', 2)).toBe('2개');
  expect(quantityPhrase('count', 0)).toBe('수량 미상');
  expect(quantityPhrase('zero', null)).toBe('수량 미상');
});

it('persists only a changed ledger and does not save a historical read', async () => {
  let requests = 0;
  let saves = 0;
  const workers = {
    async ensure() {
      return {
        async systemRequest(command: { action: InventoryAction }) {
          requests += 1;
          const changed = command.action.kind === 'record';
          return {
            kind: 'inventoryLedgerApplied' as const,
            reply: reply(changed, command.action.kind === 'conserve' ? 'owned_double_consume' : 'ok'),
          };
        },
      };
    },
  };
  const repository = {
    async saveInventoryLedger() {
      saves += 1;
      return { status: 'saved' as const, revision: '1' };
    },
  };
  const controller = new InventoryController(
    workers as { ensure(): Promise<InventoryClient> },
    repository as unknown as ProjectRepository,
  );
  const recorded = await controller.apply('p', ledger, '0', {
    kind: 'record',
    event: {
      id: 'evt-1',
      subjectKind: 'item',
      subjectId: 'towel',
      kind: 'purchase',
      quantityText: '',
      label: '수건',
      location: null,
      holding: 'individual',
      usage: null,
    },
  });
  expect(recorded.persisted).toBe(true);
  const read = await controller.apply('p', ledger, '1', {
    kind: 'openHistorical',
    planSnapshotId: '0'.repeat(64),
  });
  expect(read.persisted).toBe(false);
  const blocked = await controller.apply('p', ledger, '1', {
    kind: 'conserve',
    claims: [
      { containerId: 'bin-a', unitOrdinal: 0 },
      { containerId: 'bin-a', unitOrdinal: 0 },
    ],
  });
  expect(blocked.persisted).toBe(false);
  expect(blocked.reply.conservation.reasonCode).toBe('owned_double_consume');
  expect(requests).toBe(3);
  expect(saves).toBe(1);
});
