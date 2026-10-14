import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type {
  CandidateProposal,
  FeedbackLog,
  PlanSnapshot,
  ProposalReply,
} from '../../src/contracts/generated/dto';
import { WORKER_BUILD_ID } from '../../src/worker/client';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

const root = new URL('../../../../', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), 'utf8');
const parity = JSON.parse(text('crates/core/tests/fixtures/feedback_reorganize/wasm-parity.json'));
const fixture = JSON.parse(text(parity.fixture));

function meta(requestId: string, contextId: string | null, system: boolean) {
  return {
    protocolVersion: 1,
    schemaVersion: 1,
    workerSessionId: 'session-a',
    projectActivationId: system ? 'system' : 'activation-a',
    requestId,
    projectId: system ? 'system' : 'project-a',
    editorEpoch: '0',
    inputRevision: system ? '0' : '1',
    contextId,
  };
}

function send(
  runtime: Runtime,
  requestId: string,
  command: Record<string, unknown>,
  options: { context?: string | null; system?: boolean } = {},
) {
  const reply = runtime.handle_json(
    JSON.stringify({
      meta: meta(requestId, options.context ?? null, options.system ?? false),
      command,
    }),
  );
  return JSON.parse(reply) as { event: Record<string, unknown> & { kind: string } };
}

/**
 * The browser WASM runtime answers the same case as native Rust with the same
 * bytes: same base plan, same feedback digest, same draft, same request digest.
 */
it('the browser runtime matches the native oracle for a feedback draft', () => {
  const runtime = new Runtime();
  const ready = send(
    runtime,
    'init',
    {
      kind: 'initialize',
      buildId: WORKER_BUILD_ID,
      expectedProtocolVersion: 1,
      expectedSchemaVersion: 1,
    },
    { system: true },
  );
  expect(ready.event.kind).toBe('ready');
  const capabilities = ready.event.capabilities as string[];
  expect(capabilities).toContain('proposeFeedbackReorganize');
  expect(capabilities).toContain('applyFeedbackLog');

  const body = fixture.input;
  const activated = send(runtime, 'activate', {
    kind: 'activateProject',
    context: { kind: 'project', input: body.input, catalog: body.catalog },
  });
  expect(activated.event.kind).toBe('projectActivated');
  const context = activated.event.contextId as string;

  const proposal = structuredClone(body.proposal) as CandidateProposal;
  const behind = parity.coatBehind as { placementId: string; y: number };
  const coat = proposal.layout.placements.find((row) => row.id === behind.placementId)!;
  coat.position.y = behind.y;
  const validated = send(runtime, 'base', { kind: 'validateCandidate', proposal }, { context });
  expect(validated.event.kind).toBe('candidateValidated');
  const base = validated.event.snapshot as PlanSnapshot;
  expect(base.planSnapshotId).toBe(parity.expect.baseSnapshotId);

  const recorded = send(
    runtime,
    'record',
    {
      kind: 'applyFeedbackLog',
      log: { entries: [], withdrawnIds: [] },
      input: body.input,
      snapshot: base,
      action: {
        kind: 'record',
        entry: { ...parity.feedback, frequency: null, note: null, planSnapshotId: null },
      },
    },
    { system: true },
  );
  expect(recorded.event.kind).toBe('feedbackLogApplied');
  const log = (recorded.event.reply as { log: FeedbackLog }).log;
  // Rust stamped the adopted plan.
  expect(log.entries[0]!.planSnapshotId).toBe(base.planSnapshotId);

  const proposed = send(
    runtime,
    'propose',
    {
      kind: 'proposeFeedbackReorganize',
      baseSnapshot: base,
      log,
      locations: { observations: [] },
      budget: { maxEvaluations: parity.budget },
    },
    { context },
  );
  expect(proposed.event.kind).toBe('feedbackReorganizeProposed');
  const reply = proposed.event.reply as ProposalReply;
  const expected = parity.expect;
  expect(reply.outcome.kind).toBe('published');
  expect(reply.reproduction.draftSnapshotId).toBe(expected.draftSnapshotId);
  expect(reply.reproduction.requestDigest).toBe(expected.requestDigest);
  expect(reply.reproduction.feedbackDigest).toBe(expected.feedbackDigest);
  expect(reply.autoDiscard).toBe(false);
  expect(reply.autoPurchase).toBe(false);
  expect(reply.reusedPass).toBe(false);
  expect(reply.causes[0]!.outcome).toBe(expected.cause.outcome);
  expect(reply.causes[0]!.reasonCode).toBe(expected.cause.reasonCode);
  expect(reply.causes[0]!.partnerPlacementId).toBe(expected.cause.partner);
  for (const move of expected.moves as Array<{ placementId: string; from: number[]; to: number[] }>) {
    const found = reply.moves.find((row) => row.placementId === move.placementId)!;
    expect([found.from.x, found.from.y]).toEqual(move.from);
    expect([found.to.x, found.to.y]).toEqual(move.to);
  }

  // A new budget is a new request; the draft is the same plan.
  const smaller = send(
    runtime,
    'propose-small',
    {
      kind: 'proposeFeedbackReorganize',
      baseSnapshot: base,
      log,
      locations: { observations: [] },
      budget: { maxEvaluations: 8 },
    },
    { context },
  );
  const again = smaller.event.reply as ProposalReply;
  expect(again.reproduction.draftSnapshotId).toBe(expected.draftSnapshotId);
  expect(again.reproduction.requestDigest).not.toBe(expected.requestDigest);

  // A plan for another input is out of scope, not silently re-pinned.
  const other = structuredClone(base);
  other.content.placements[0]!.position.x = 7;
  const forged = send(
    runtime,
    'propose-forged',
    {
      kind: 'proposeFeedbackReorganize',
      baseSnapshot: other,
      log,
      locations: { observations: [] },
      budget: { maxEvaluations: 8 },
    },
    { context },
  );
  expect(forged.event.kind).toBe('operationFailed');
  expect(forged.event.code).toBe('integrity_failed');
});
