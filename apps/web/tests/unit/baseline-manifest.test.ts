import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('draft baseline index', () => {
  it('keeps approved count at zero and matches every draft file hash', () => {
    const output = execFileSync('node', ['scripts/check-baseline-manifest.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('approved 0');
    expect(output).toMatch(/zari007 47/);
    expect(output).toMatch(/zari011 26/);
  });
});
