import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { initSync } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type { OfferQuoteReply, PlanSnapshot, ProtocolRequest } from '../../src/contracts/generated/dto';
import {
  forgetSnapshotQuote,
  OfferQuoteController,
  quoteSnapshotOnce,
} from '../../src/features/offer/controller';
import { quotedMoneyText, shippingPhrase } from '../../src/features/offer/phrases';
import type { WorkerPort } from '../../src/worker/client';
import { WorkerController } from '../../src/worker/controller';
import { Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';

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

function quotes(port: WasmPort) {
  return port.sent.filter((request) => request.command.kind === 'quoteOfferBundle');
}

function world() {
  const port = new WasmPort();
  const workers = new WorkerController(() => port);
  controllers.push(workers);
  return { port, quotes: new OfferQuoteController(workers) };
}

it('does not render unknown money as free or zero', () => {
  expect(quotedMoneyText({ state: 'unknown' }, 'unknown')).toBe('미확인');
  expect(quotedMoneyText({ state: 'unknown' })).not.toContain('₩');
  expect(quotedMoneyText({ state: 'known', amount: '0' }, 'free')).toBe('무료');
  expect(shippingPhrase('unknown', { state: 'unknown' })).toBe('미확인');
  expect(shippingPhrase('free', { state: 'known', amount: '0' })).toBe('무료');
});

it('orders two packs of two for three units and leaves one, in one worker call', async () => {
  const { port, quotes: offer } = world();
  const reply = await offer.quote({
    kind: 'preview',
    preview: {
      sellerNotes: [{ sellerId: 'seller-1', tax: 'included' }],
      lines: [
        {
          id: 'line-1',
          role: 'container',
          sellerId: 'seller-1',
          variantId: null,
          offerId: null,
          physicalNeeded: 3,
          reused: 0,
          packQuantity: 2,
          packPrice: '1000',
          stock: 'inStock',
          shipping: { kind: 'free' },
          includedInParent: false,
          minimumPacks: null,
          replacementOfferId: null,
        },
      ],
    },
  });
  expect(quotes(port)).toHaveLength(1);
  expect(reply.boundRevision).toBeNull();
  expect(reply.lines[0]?.packsToOrder).toEqual({ state: 'known', value: 2 });
  expect(reply.lines[0]?.supplied).toEqual({ state: 'known', value: 4 });
  expect(reply.lines[0]?.surplus).toEqual({ state: 'known', value: 1 });
  expect(reply.knownShipping).toEqual({ state: 'known', amount: '0' });
  expect(reply.sellers[0]?.shippingStatus).toBe('free');
  expect(reply.grandTotal).toEqual({ state: 'known', amount: '2000' });
});

it('does not add unknown shipping as free', async () => {
  const { port, quotes: offer } = world();
  const reply = await offer.quote({
    kind: 'preview',
    preview: {
      sellerNotes: [{ sellerId: 'seller-1', tax: 'included' }],
      lines: [
        {
          id: 'line-1',
          role: 'container',
          sellerId: 'seller-1',
          variantId: null,
          offerId: null,
          physicalNeeded: 3,
          reused: 0,
          packQuantity: 2,
          packPrice: '1000',
          stock: 'inStock',
          shipping: { kind: 'unknown' },
          includedInParent: false,
          minimumPacks: null,
          replacementOfferId: null,
        },
      ],
    },
  });
  expect(quotes(port)).toHaveLength(1);
  expect(reply.knownShipping).toEqual({ state: 'unknown' });
  expect(reply.sellers[0]?.shippingStatus).toBe('unknown');
  expect(reply.grandTotal).toEqual({ state: 'unknown' });
  expect(reply.unconfirmed.some((row) => row.code === 'shipping_unknown')).toBe(true);
  expect(JSON.stringify(reply.knownShipping)).not.toContain('"amount"');
});

it('quotes one snapshot id once and sends again only after the reply is forgotten', async () => {
  const calls: string[] = [];
  const reply: OfferQuoteReply = {
    boundRevision: 'a'.repeat(64),
    lines: [],
    sellers: [],
    knownProduct: { state: 'notApplicable', reasonCode: 'no_purchases' },
    knownShipping: { state: 'notApplicable', reasonCode: 'no_purchases' },
    grandTotal: { state: 'notApplicable', reasonCode: 'no_purchases' },
    unconfirmed: [],
    replacements: [],
  };
  const offer = new OfferQuoteController({
    async ensure() {
      return {
        async systemRequest(command) {
          calls.push(command.kind);
          return { kind: 'offerBundleQuoted' as const, reply };
        },
      };
    },
  });
  const snapshot = { planSnapshotId: 'a'.repeat(64) } as PlanSnapshot;
  forgetSnapshotQuote(snapshot.planSnapshotId);
  const first = await quoteSnapshotOnce(offer, snapshot);
  const second = await quoteSnapshotOnce(offer, snapshot);
  expect(first).toBe(second);
  expect(calls).toEqual(['quoteOfferBundle']);
  forgetSnapshotQuote(snapshot.planSnapshotId);
  await quoteSnapshotOnce(offer, snapshot);
  expect(calls).toEqual(['quoteOfferBundle', 'quoteOfferBundle']);
});
