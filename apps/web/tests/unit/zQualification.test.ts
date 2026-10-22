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
    expect(self).toMatchObject({
      node_state: 'MERGED', issue: 116, pullRequest: 117,
      deliveryCommit: '082f63ed389a81634eeba5313c36ed913ffb6ba0',
      mergeCommit: '3e76e96512a50cd13167587d7539d38454501813',
      reviewPointer: [
        'https://github.com/SUNBURN-Golden/ZARI/pull/117#issuecomment-6282648469',
        'https://github.com/SUNBURN-Golden/ZARI/pull/117#issuecomment-6282649045',
      ],
    });
    const next = ledger.nodes.find((entry) => entry.id === 'z-local-delivery');
    expect(next).toMatchObject({
      node_state: 'MERGED', issue: 118, pullRequest: 119,
      deliveryCommit: '108667cceb00be4455ae113da44776683fa5102f',
      mergeCommit: 'a785b63c5b5c7306fddb39be3a9c12d2cfc04618',
      reviewPointer: [
        'https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-6314938341',
        'https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-6314939282',
      ],
    });
    for (const node of ledger.nodes) {
      expect(node).toMatchObject({
        node_state: 'MERGED', qualification_state: 'PARTIAL',
        acceptance_state: 'PENDING', release_state: 'NOT_AUTHORIZED',
      });
    }

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
          [[], false],
          [['https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-1'], false],
          [['https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-1',
            'https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-2'], true],
          [['https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-1',
            'https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-1'], false],
          [['https://github.com/SUNBURN-Golden/ZARI/pull/119#issuecomment-1', 'not-a-url'], false],
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
    expect(output).toContain('merged 21');
    expect(output).toContain('in-progress 0');
    expect(output).toContain('not-started 0');
    expect(output).toContain('NOT_AUTHORIZED');
  });

  it.each(['IN_PROGRESS', 'NOT_STARTED', 'UNKNOWN', 'DONE'])(
    'rejects a regression of a delivered row to %s', (state) => {
      execFileSync('node', ['--input-type=module', '-e', `
        import { readFileSync } from 'node:fs';
        import assert from 'node:assert/strict';
        import { assertNodeClaim } from './scripts/check-z-denominator.mjs';
        const ledger = JSON.parse(readFileSync('docs/qualification/z-denominator.json', 'utf8'));
        for (const node of ledger.nodes) {
          assert.throws(() => assertNodeClaim({ ...node, node_state: ${JSON.stringify(state)} }),
            /must be MERGED|overclaims/);
        }
      `], { encoding: 'utf8' });
    },
  );

  it('requires two distinct review comments on each reconciled delivery PR', () => {
    execFileSync('node', ['--input-type=module', '-e', `
      import { readFileSync } from 'node:fs';
      import assert from 'node:assert/strict';
      import { assertNodeClaim } from './scripts/check-z-denominator.mjs';
      const ledger = JSON.parse(readFileSync('docs/qualification/z-denominator.json', 'utf8'));
      for (const id of ['z-product-qualification', 'z-local-delivery']) {
        const node = ledger.nodes.find((row) => row.id === id);
        assert.doesNotThrow(() => assertNodeClaim(node));
        for (const reviewPointer of [null, node.reviewPointer[0], [],
          [node.reviewPointer[0], node.reviewPointer[0]],
          [node.reviewPointer[0], 'https://github.com/SUNBURN-Golden/ZARI/pull/38#issuecomment-2']]) {
          assert.throws(() => assertNodeClaim({ ...node, reviewPointer }),
            /invented pointer|requires two review comments/);
        }
        assert.throws(() => assertNodeClaim({ ...node, qualification_state: 'QUALIFIED' }), /overclaims/);
      }
    `], { encoding: 'utf8' });
  });

  it('keeps every device/product gap and separate acceptance/release limits', () => {
    const ledger = JSON.parse(readFileSync('docs/qualification/z-denominator.json', 'utf8')) as {
      requiredGaps: Array<{ id: string; state: string; nextAction: string }>;
      captureAcceptance: string;
      releaseDefault: string;
    };
    expect(ledger.captureAcceptance).toBe('PENDING');
    expect(ledger.releaseDefault).toBe('NOT_AUTHORIZED');
    expect(ledger.requiredGaps.map(({ id, state }) => [id, state])).toEqual([
      ['physical-phone', 'UNQUALIFIED'], ['discrete-gpu', 'UNQUALIFIED'],
      ['real-product-sites', 'UNQUALIFIED'], ['new-capture-acceptance', 'PENDING'],
      ['release', 'NOT_AUTHORIZED'], ['app-catalog-url-read', 'UNQUALIFIED'],
    ]);
    for (const gap of ledger.requiredGaps) expect(gap.nextAction.length).toBeGreaterThanOrEqual(8);
    const candidate = JSON.parse(readFileSync('docs/delivery/release-candidate/manifest.json', 'utf8')) as {
      requiredGaps: Array<{ id: string; state: string }>;
      qualificationState: string;
      captureAcceptance: string;
      releaseState: string;
    };
    expect(candidate).toMatchObject({
      qualificationState: 'PARTIAL', captureAcceptance: 'PENDING', releaseState: 'NOT_AUTHORIZED',
    });
    expect(candidate.requiredGaps.map(({ id, state }) => [id, state])).toEqual(
      ledger.requiredGaps.map(({ id, state }) => [id, state]),
    );
  });

  it('keeps the committed review package matching its recorded digests', () => {
    const output = execFileSync('node', ['scripts/check-review-package.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('files verified');
    expect(output).toContain('approved false');
  });
});
