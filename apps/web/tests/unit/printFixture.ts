import { readFileSync } from 'node:fs';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import type {
  CandidateProposal,
  CatalogSnapshot,
  PlanSnapshot,
  SpatialProjection,
} from '../../src/contracts/generated/dto';
import { WORKER_BUILD_ID } from '../../src/worker/client';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

const root = new URL('../../../../', import.meta.url);

export interface RealPlan {
  snapshot: PlanSnapshot;
  projection: SpatialProjection;
  catalog: CatalogSnapshot | null;
}

function send(
  runtime: Runtime,
  requestId: string,
  command: Record<string, unknown>,
  options: { context?: string | null; system?: boolean } = {},
) {
  const system = options.system ?? false;
  const reply = runtime.handle_json(
    JSON.stringify({
      meta: {
        protocolVersion: 1,
        schemaVersion: 1,
        workerSessionId: 'session-print',
        projectActivationId: system ? 'system' : 'activation-print',
        requestId,
        projectId: system ? 'system' : 'project-print',
        editorEpoch: '0',
        inputRevision: system ? '0' : '1',
        contextId: options.context ?? null,
      },
      command,
    }),
  );
  return JSON.parse(reply) as { event: Record<string, unknown> & { kind: string } };
}

/**
 * Real Rust output for a shared domain fixture: the snapshot Rust validated
 * for the fixture's proposal, and the projection Rust stamped for it.
 */
export function realPlan(
  fixturePath: string,
  mutate?: (proposal: CandidateProposal) => void,
): RealPlan {
  const fixture = JSON.parse(readFileSync(new URL(fixturePath, root), 'utf8'));
  const runtime = new Runtime();
  send(
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
  const body = fixture.input;
  const activated = send(runtime, 'activate', {
    kind: 'activateProject',
    context: { kind: 'project', input: body.input, catalog: body.catalog },
  });
  if (activated.event.kind !== 'projectActivated') {
    throw new Error(`activation failed: ${JSON.stringify(activated.event)}`);
  }
  const context = activated.event.contextId as string;
  const proposal = structuredClone(body.proposal) as CandidateProposal;
  mutate?.(proposal);
  const validated = send(runtime, 'base', { kind: 'validateCandidate', proposal }, { context });
  if (validated.event.kind !== 'candidateValidated') {
    throw new Error(`validation failed: ${JSON.stringify(validated.event)}`);
  }
  const snapshot = validated.event.snapshot as PlanSnapshot;
  const projected = send(
    runtime,
    'project',
    { kind: 'projectSpatialView', source: { kind: 'plan', snapshot } },
    { system: true },
  );
  if (projected.event.kind !== 'spatialViewProjected') {
    throw new Error(`projection failed: ${JSON.stringify(projected.event)}`);
  }
  return {
    snapshot,
    projection: projected.event.projection as SpatialProjection,
    catalog: (body.catalog ?? null) as CatalogSnapshot | null,
  };
}
