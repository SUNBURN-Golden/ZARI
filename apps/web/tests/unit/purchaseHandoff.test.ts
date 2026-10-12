import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type { PlanSnapshot, PreparedHandoff, ProtocolRequest } from '../../src/contracts/generated/dto';
import { validateProtocolRequest } from '../../src/contracts/generated/validators.mjs';
import {
  forgetHandoff,
  prepareHandoffOnce,
  PurchaseHandoffController,
  utcSecond,
} from '../../src/features/purchase/controller';
import { observationPhrase, suitabilityPhrase } from '../../src/features/purchase/phrases';
import { quotedMoneyText } from '../../src/features/offer/phrases';
import type { WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

class WasmPort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: ProtocolRequest[] = [];
  private runtime = new Runtime();
  private dead = false;
  postMessage(text: string) {
    if (this.dead) return;
    this.sent.push(JSON.parse(text) as ProtocolRequest);
    let reply: string;
    try {
      reply = this.runtime.handle_json(text);
    } catch {
      this.onerror?.({} as ErrorEvent);
      return;
    }
    queueMicrotask(() => {
      if (!this.dead) this.onmessage?.({ data: reply } as MessageEvent);
    });
  }
  terminate() {
    this.dead = true;
  }
}

const controllers: WorkerController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function world() {
  const port = new WasmPort();
  const workers = new WorkerController(() => port);
  controllers.push(workers);
  const handoff = new PurchaseHandoffController(workers, {
    getPurchaseHandoff: async () => null,
    savePurchaseHandoff: async () => {
      throw new Error('should_not_persist');
    },
  } as never);
  return { port, handoff };
}

it('does not call a stale observation current or an unknown amount zero', () => {
  expect(observationPhrase('stale', 'inStock')).toBe('지난 확인 · 당시 재고 있음');
  expect(observationPhrase('current', 'unknown')).toBe('확인됨 · 재고 미확인');
  expect(observationPhrase('unconfirmed', 'unknown')).toBe('확인 시각 없음 · 재고 미확인');
  expect(observationPhrase('stale', 'inStock')).not.toContain('최신');
  expect(suitabilityPhrase('unknown')).toBe('미확인');
  expect(quotedMoneyText({ state: 'unknown' })).toBe('미확인');
  expect(quotedMoneyText({ state: 'unknown' })).not.toContain('₩');
  expect(utcSecond(new Date('2026-10-10T00:00:00.123Z'))).toBe('2026-10-10T00:00:00Z');
});

it('classifies stale and current observations and does not persist a read', async () => {
  const { port, handoff } = world();
  const stale = await handoff.send('project-1', '0', {
    kind: 'classifyFreshness',
    observedAt: '2020-01-01T00:00:00Z',
    asOf: '2026-10-10T00:00:00Z',
  });
  expect(stale.persisted).toBe(false);
  expect(stale.reply).toEqual({
    kind: 'freshness',
    freshness: { freshness: 'stale', recordsPayment: false },
  });
  const current = await handoff.send('project-1', '0', {
    kind: 'classifyFreshness',
    observedAt: '2026-10-03T00:00:00Z',
    asOf: '2026-10-10T00:00:00Z',
  });
  expect(current.reply).toEqual({
    kind: 'freshness',
    freshness: { freshness: 'current', recordsPayment: false },
  });
  const missing = await handoff.send('project-1', '0', {
    kind: 'classifyFreshness',
    observedAt: null,
    asOf: '2026-10-10T00:00:00Z',
  });
  expect(missing.reply).toEqual({
    kind: 'freshness',
    freshness: { freshness: 'unconfirmed', recordsPayment: false },
  });
  expect(port.sent.filter((request) => request.command.kind === 'preparePurchaseHandoff')).toHaveLength(3);
});

it('rejects a payment event before it can be sent', () => {
  const request = {
    meta: {
      protocolVersion: 1,
      schemaVersion: 1,
      workerSessionId: '00000000-0000-4000-8000-000000000001',
      projectActivationId: 'system',
      projectId: 'system',
      requestId: '00000000-0000-4000-8000-000000000002',
      editorEpoch: '0',
      inputRevision: '0',
      contextId: null,
    },
    command: {
      kind: 'preparePurchaseHandoff',
      action: {
        kind: 'record',
        asOf: '2026-10-10T00:00:00Z',
        ledger: { events: [] },
        snapshot: {},
        affiliateOfferIds: [],
        event: {
          id: 'pay-1',
          kind: 'paid',
          offerId: 'offer-1',
          note: '',
          measuredWidthMm: null,
        },
      },
    },
  };
  expect(validateProtocolRequest(request as never)).toBe(false);
  const clicked = structuredClone(request);
  (clicked.command as { action: { event: { kind: string } } }).action.event.kind = 'linkClicked';
  expect(validateProtocolRequest(clicked as never)).toBe(false);
  const schema = JSON.parse(
    readFileSync(new URL('../../src/contracts/generated/schema.json', import.meta.url), 'utf8'),
  ) as { definitions: { PurchaseEventKind: { enum: string[] } } };
  expect(schema.definitions.PurchaseEventKind.enum).toEqual([
    'confirmedPurchase',
    'received',
    'measured',
    'returned',
  ]);
});

it('prepares one snapshot once until the reply is forgotten', async () => {
  const calls: string[] = [];
  const prepared: PreparedHandoff = {
    affiliateChangesSuitability: false,
    boundRevision: 'ab'.repeat(32),
    changed: false,
    ledger: { events: [] },
    recordsPayment: false,
    sellers: [],
  };
  const handoff = new PurchaseHandoffController(
    {
      async ensure() {
        return {
          async systemRequest(command: { kind: string }) {
            calls.push(command.kind);
            return { kind: 'purchaseHandoffPrepared' as const, reply: { kind: 'prepared' as const, prepared } };
          },
        };
      },
    },
    { savePurchaseHandoff: async () => ({ status: 'saved' as const, revision: '1' }) } as never,
  );
  const snapshot = { planSnapshotId: 'ab'.repeat(32) } as PlanSnapshot;
  forgetHandoff('project-1', snapshot.planSnapshotId, '0');
  const first = await prepareHandoffOnce(handoff, 'project-1', snapshot, { events: [] }, '0', '2026-10-10T00:00:00Z');
  const second = await prepareHandoffOnce(handoff, 'project-1', snapshot, { events: [] }, '0', '2026-10-10T00:00:00Z');
  expect(first).toBe(second);
  expect(first.recordsPayment).toBe(false);
  expect(first.sellers).toEqual([]);
  expect(calls).toEqual(['preparePurchaseHandoff']);
  forgetHandoff('project-1', snapshot.planSnapshotId, '0');
  await prepareHandoffOnce(handoff, 'project-1', snapshot, { events: [] }, '0', '2026-10-10T00:00:00Z');
  expect(calls).toEqual(['preparePurchaseHandoff', 'preparePurchaseHandoff']);
});
