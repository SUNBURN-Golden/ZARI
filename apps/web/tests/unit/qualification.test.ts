import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SP-016 qualification projection', () => {
  it('records 016 as merged and keeps DONE forbidden', () => {
    const ledger = JSON.parse(readFileSync('docs/qualification/denominator.json', 'utf8')) as {
      nodes: Array<Record<string, unknown>>;
    };
    const node = ledger.nodes.find((entry) => entry.id === '016');
    expect(node).toMatchObject({
      node_state: 'MERGED',
      deliveryCommit: '71ecffc1ba35e636c237ac94ce5bb265e41fe729',
      pullRequest: 74,
      mergeCommit: '1bd3fde5bd9a625d02735d4de8609e97736db49d',
      reviewPointer: null,
      auditPointer: null,
      issue: 73,
    });
    expect(node?.node_state).not.toBe('DONE');

    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `
        import { assertNodeClaim, reviewPointerAllowed } from './scripts/check-qualification.mjs';
        const samples = [
          [null, true],
          ['https://github.com/SUNBURN-Golden/ZARI/pull/74#issuecomment-1', true],
          ['not-a-url', false],
          ['https://example.com/pull/74#issuecomment-1', false],
        ];
        for (const [value, expected] of samples) {
          if (reviewPointerAllowed(value) !== expected) {
            console.error(JSON.stringify(value));
            process.exit(1);
          }
        }
        let rejected = false;
        try {
          assertNodeClaim({
            id: '016',
            node_state: 'DONE',
            qualification_state: 'PARTIAL',
            reviewPointer: null,
            auditPointer: null,
          });
        } catch (error) {
          rejected = String(error.message).includes('overclaims');
        }
        if (!rejected) process.exit(1);
        `
      ],
      { encoding: 'utf8' },
    );

    const output = execFileSync('node', ['scripts/check-qualification.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('denominator 16=7+4+5');
    expect(output).toContain('merged 16; in-progress 0');
    expect(output).toContain('capture PENDING');
    expect(output).toContain('release NOT_AUTHORIZED');
    expect(output).toContain('runtime hits 0');
    expect(output).not.toContain('in-progress 1');
  });
});
