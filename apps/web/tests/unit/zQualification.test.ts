import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('z-product-qualification denominator projection', () => {
  it('keeps the original denominator and forbids DONE', () => {
    const ledger = JSON.parse(readFileSync('docs/qualification/z-denominator.json', 'utf8')) as {
      denominator: number;
      nodes: Array<Record<string, unknown>>;
    };
    expect(ledger.denominator).toBe(21);
    expect(ledger.nodes).toHaveLength(21);
    const self = ledger.nodes.find((entry) => entry.id === 'z-product-qualification');
    expect(self).toMatchObject({ node_state: 'IN_PROGRESS', issue: 116 });
    const next = ledger.nodes.find((entry) => entry.id === 'z-local-delivery');
    expect(next).toMatchObject({ node_state: 'NOT_STARTED', qualification_state: 'UNQUALIFIED' });
    for (const node of ledger.nodes) expect(node.node_state).not.toBe('DONE');

    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `
        import { assertNodeClaim, reviewPointerAllowed } from './scripts/check-z-denominator.mjs';
        const samples = [
          [null, true],
          ['https://github.com/SUNBURN-Golden/ZARI/pull/115#issuecomment-1', true],
          ['not-a-url', false],
        ];
        for (const [value, expected] of samples) {
          if (reviewPointerAllowed(value) !== expected) process.exit(1);
        }
        let rejected = false;
        try {
          assertNodeClaim({
            id: 'z-local-delivery',
            node_state: 'DONE',
            qualification_state: 'UNQUALIFIED',
            reviewPointer: null,
            auditPointer: null,
          });
        } catch (error) {
          rejected = String(error.message).includes('overclaims');
        }
        if (!rejected) process.exit(1);
        `,
      ],
      { encoding: 'utf8' },
    );

    const output = execFileSync('node', ['scripts/check-z-denominator.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('denominator 21');
    expect(output).toContain('in-progress 1');
    expect(output).toContain('not-started 1');
    expect(output).toContain('NOT_AUTHORIZED');
  });
});
