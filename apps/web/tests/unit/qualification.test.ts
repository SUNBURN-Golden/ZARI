import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('SP-016 qualification projection', () => {
  it('lists 16 nodes without calling a missing pointer DONE', () => {
    const output = execFileSync('node', ['scripts/check-qualification.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('denominator 16=7+4+5');
    expect(output).toContain('capture PENDING');
    expect(output).toContain('release NOT_AUTHORIZED');
    expect(output).toContain('runtime hits 0');
  });
});
