import { ProbeClient } from '../src/worker/client';
import type { BootstrapProbeDto, BootstrapProbeResult } from '../src/contracts/generated/dto';
declare global {
  interface Window {
    runProbeFixture: (probe: BootstrapProbeDto) => Promise<BootstrapProbeResult>;
  }
}
const client = new ProbeClient(
  () => new Worker(new URL('../src/worker/entry.ts', import.meta.url), { type: 'module' }),
);
const ready = client.start().then(() => client.activate('fixture-project', '0', '0'));
window.runProbeFixture = async (probe) => {
  await ready;
  const reply = await client.request({ kind: 'evaluateProbe', probe });
  if (reply.kind !== 'probeEvaluated') throw new Error('unexpected_fixture_event');
  return reply.result;
};
