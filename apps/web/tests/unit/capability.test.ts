import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { initSync, Runtime } from '../../../../crates/wasm/pkg/zari_wasm.js';
import { WORKER_BUILD_ID, WORKER_CAPABILITIES } from '../../src/worker/client';

initSync({
  module: readFileSync(new URL('../../../../crates/wasm/pkg/zari_wasm_bg.wasm', import.meta.url)),
});

function send(runtime: Runtime, requestId: string, command: unknown, system = false) {
  return JSON.parse(
    runtime.handle_json(
      JSON.stringify({
        meta: {
          protocolVersion: 1,
          schemaVersion: 1,
          workerSessionId: 'session-a',
          projectActivationId: system ? 'system' : 'activation-a',
          requestId,
          projectId: system ? 'system' : 'project-a',
          editorEpoch: '0',
          inputRevision: '0',
          contextId: null,
        },
        command,
      }),
    ),
  ) as { event: { kind: string; code?: string; buildId?: string; capabilities?: string[] } };
}

it('the actual Worker handshake advertises queryNextFacts and rejects an unknown operation', () => {
  const mismatch = new Runtime();
  expect(
    send(
      mismatch,
      'old',
      {
        kind: 'initialize',
        buildId: 'zari-domain-4',
        expectedProtocolVersion: 1,
        expectedSchemaVersion: 1,
      },
      true,
    ).event,
  ).toMatchObject({ kind: 'operationFailed', code: 'version_mismatch' });

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
    true,
  );
  expect(ready.event.kind).toBe('ready');
  expect(ready.event.buildId).toBe(WORKER_BUILD_ID);
  expect(ready.event.buildId).toBe('zari-domain-6');
  expect(ready.event.capabilities).toEqual([...WORKER_CAPABILITIES]);
  expect(ready.event.capabilities).toContain('queryNextFacts');
  expect(
    send(runtime, 'query', { kind: 'queryNextFacts' }, true).event,
  ).toMatchObject({ kind: 'operationFailed', code: 'invalid_input' });
  expect(
    send(runtime, 'unknown', { kind: 'notARealOperation' }, true).event,
  ).toMatchObject({ kind: 'operationFailed', code: 'operation_not_supported' });
});
