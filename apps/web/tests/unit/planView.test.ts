import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot } from '../../src/contracts/generated/dto';
import {
  catalogSourceText,
  readMovePosition,
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
