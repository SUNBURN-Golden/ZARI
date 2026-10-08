import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const QUOTE =
  '012·013·014·015·016 전부 채택한다. 게이트는 독립 리뷰 2회로 대체하고, user_merge도 네가 머지해라. 이후 z-노드도 같은 방식으로 끝까지 진행해.';

describe('z-product-contract ledger', () => {
  it('keeps the 16 ids, one snapshot chain, and open user decisions', () => {
    const output = execFileSync('node', ['scripts/check-product-contract.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('16 ids unchanged');
    expect(output).toContain('chain one snapshot');
    expect(output).toContain('user decisions open');
    expect(output).toContain('internal choices adopted');
    expect(output).toContain('fixture impact 124 unchanged');
    expect(output).toContain('runtime hits 0');
  });

  it('does not treat the adoption quote as checkout, release, or a review pass', () => {
    const contract = JSON.parse(
      readFileSync('docs/product-expansion/contract.json', 'utf8'),
    ) as {
      reviewPassClaimed: boolean;
      contractChange: string;
      userDecisions: Array<{ id: string; status: string }>;
      internalChoices: Array<{ id: string; status: string }>;
    };
    expect(contract.reviewPassClaimed).toBe(false);
    expect(contract.contractChange).toBe('NO');
    expect(contract.userDecisions.map((item) => item.status)).not.toContain('adopted');
    expect(contract.internalChoices.map((item) => item.status)).not.toContain('open');
    const adr = readFileSync('docs/adr/SP-z-product-contract.md', 'utf8');
    expect(adr).toContain(QUOTE);
    expect(adr).toContain('z-product-contract만');
    expect(adr).not.toContain('review PASS');
  });
});
