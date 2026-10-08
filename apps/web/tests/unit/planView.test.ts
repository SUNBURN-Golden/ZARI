import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  BOMLine,
  CatalogSnapshot,
  CostSummary,
  FactFor_MoneyKrw,
  PlanSnapshot,
  Placement,
} from '../../src/contracts/generated/dto';
import {
  catalogSourceText,
  isNoPurchase,
  readMovePosition,
  unassignedPlacement,
  unassignedPlacementText,
  type MoveFieldText,
} from '../../src/features/plan/view';

const text = (value: string, badInput = false): MoveFieldText => ({ text: value, badInput });

describe('readMovePosition — inspector coordinate gate', () => {
  it('passes plain integer literals through exactly', () => {
    expect(readMovePosition({ x: text('120'), y: text('-40'), z: text(' 0 ') })).toEqual({
      ok: true,
      position: { x: 120, y: -40, z: 0 },
    });
  });

  it('never turns a blank field into 0mm', () => {
    const read = readMovePosition({ x: text(''), y: text('10'), z: text('   ') });
    expect(read).toEqual({
      ok: false,
      errors: { x: 'position_missing', z: 'position_missing' },
    });
  });

  it('treats text the browser could not read as absent, not as its empty value', () => {
    const read = readMovePosition({ x: text('', true), y: text('10'), z: text('0') });
    expect(read).toEqual({ ok: false, errors: { x: 'position_missing' } });
  });

  it('refuses number forms the JS parser would coerce into a coordinate', () => {
    const read = readMovePosition({ x: text('1e3'), y: text('12.0'), z: text('12.5') });
    expect(read).toEqual({
      ok: false,
      errors: {
        x: 'position_not_integer_mm',
        y: 'position_not_integer_mm',
        z: 'position_not_integer_mm',
      },
    });
  });

  it('leaves range checks to the request validator and Rust', () => {
    // Out-of-protocol-range integers are not host decisions: they pass the
    // syntax gate and are refused downstream with an explained rejection.
    expect(readMovePosition({ x: text('19999'), y: text('0'), z: text('999999') })).toEqual({
      ok: true,
      position: { x: 19999, y: 0, z: 999999 },
    });
  });
});

describe('catalogSourceText — snapshot catalog origin', () => {
  const catalog = (sourceKind: CatalogSnapshot['sourceKind'], catalogDigest: string) =>
    ({ sourceKind, catalogDigest }) as CatalogSnapshot;

  it('labels the synthetic demo catalog only when it is the snapshot catalog', () => {
    expect(catalogSourceText(catalog('synthetic', 'd1'), 'd1')).toContain('합성 데이터');
    expect(catalogSourceText(catalog('imported', 'd1'), 'd1')).toContain('가져온 카탈로그');
  });

  it('never defaults an unloaded or different catalog to "imported"', () => {
    expect(catalogSourceText(null, 'd1')).toBe('출처 확인 불가');
    expect(catalogSourceText(catalog('synthetic', 'd2'), 'd1')).toBe('출처 확인 불가');
  });
});

const money = (reasonCode: string): FactFor_MoneyKrw => ({
  state: 'notApplicable',
  reasonCode,
});

const noPurchaseCost = (): CostSummary => ({
  grandTotal: money('no_purchases'),
  productSubtotal: money('no_purchases'),
  shippingTotal: money('no_purchases'),
});

function plan(content: Partial<PlanSnapshot['content']>): PlanSnapshot {
  return { content } as PlanSnapshot;
}

describe('unassigned placement — unknown quantity is not zero', () => {
  it('reads project-unknown-quantity-pass as unknown and renders 미확인', () => {
    const fixture = JSON.parse(
      readFileSync('fixtures/domain/project-unknown-quantity-pass.json', 'utf8'),
    ) as {
      input: { items: Array<{ id: string; quantity: { state: string; value?: unknown } }> };
    };
    const item = fixture.input.items.find((entry) => entry.id === 'item-a');
    expect(item?.quantity.state).toBe('unknown');
    expect(item?.quantity.value).toBeUndefined();
    const summary = unassignedPlacement(
      plan({
        unassigned: [{ itemId: 'item-a', reasonCode: 'quantity_unknown', instances: { kind: 'unknownQuantity' } }],
      }),
    );
    expect(summary).toEqual({ known: 0, unknownRows: 1 });
    expect(unassignedPlacementText(summary)).toBe('미확인');
    expect(unassignedPlacementText(summary)).not.toContain('0');
  });

  it('keeps a known count beside unknown rows', () => {
    const summary = unassignedPlacement(
      plan({
        unassigned: [
          {
            itemId: 'item-a',
            reasonCode: 'no_slot',
            instances: { kind: 'known', ranges: [{ start: 0, endExclusive: 2 }] },
          },
          { itemId: 'item-b', reasonCode: 'quantity_unknown', instances: { kind: 'unknownQuantity' } },
        ],
      }),
    );
    expect(unassignedPlacementText(summary)).toBe('미배치 2 · 수량 미확인 1');
  });

  it('counts only known ranges when every row has a quantity', () => {
    expect(
      unassignedPlacementText(
        unassignedPlacement(
          plan({
            unassigned: [
              {
                itemId: 'item-a',
                reasonCode: 'no_slot',
                instances: { kind: 'known', ranges: [{ start: 0, endExclusive: 0 }] },
              },
            ],
          }),
        ),
      ),
    ).toBe('미배치 0');
  });
});

describe('isNoPurchase — Rust BOM and cost summary', () => {
  const ownedLine = { ownedId: 'owned-1', id: 'line-owned' } as BOMLine;
  const purchaseLine = { ownedId: null, id: 'line-buy' } as BOMLine;
  const newContainer = { subject: { kind: 'newContainer' } } as Placement;

  it('is no-purchase when Rust says no_purchases and the BOM has no purchase line', () => {
    expect(
      isNoPurchase(
        plan({
          bom: [ownedLine],
          costSummary: noPurchaseCost(),
          placements: [newContainer],
        }),
      ),
    ).toBe(true);
  });

  it('is not no-purchase when a purchase line exists, even with no new-container placement', () => {
    expect(
      isNoPurchase(
        plan({
          bom: [purchaseLine],
          costSummary: noPurchaseCost(),
          placements: [],
        }),
      ),
    ).toBe(false);
  });

  it('does not treat an unknown total as no purchase', () => {
    expect(
      isNoPurchase(
        plan({
          bom: [],
          costSummary: {
            grandTotal: { state: 'unknown', reason: 'notProvided' },
            productSubtotal: money('no_purchases'),
            shippingTotal: money('no_purchases'),
          },
          placements: [],
        }),
      ),
    ).toBe(false);
  });
});
