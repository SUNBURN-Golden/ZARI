import type { NextFactsReply } from '../../contracts/generated/dto';

type NextFactsTestHost = typeof globalThis & {
  __zariNextFactsGate?: () => Promise<void>;
  __zariNextFactsInject?: string;
  __zariNextFactsForeign?: boolean;
};

/**
 * Pause after a next-facts reply is received and before the lease check.
 * Production builds do not call this. The test build can edit the draft,
 * replace the Worker, or change the mount while the reply is in hand.
 */
export async function holdNextFactsReply(): Promise<void> {
  const hold = (globalThis as NextFactsTestHost).__zariNextFactsGate;
  if (typeof hold === 'function') await hold();
}

/** Test-only: treat a successful reply as the whole-query limit failure. */
export function takeNextFactsInjection(): 'limit' | null {
  return (globalThis as NextFactsTestHost).__zariNextFactsInject === 'limit' ? 'limit' : null;
}

/**
 * Test-only: stamp the reply with a different input digest so the session
 * must drop it instead of painting those rows.
 */
export function maybeForeignNextFacts<T>(event: T): T {
  if (!(globalThis as NextFactsTestHost).__zariNextFactsForeign) return event;
  if (event === null || typeof event !== 'object') return event;
  const record = event as { kind?: string; reply?: NextFactsReply };
  if (record.kind !== 'nextFactsQueried' || !record.reply) return event;
  return {
    ...record,
    reply: {
      ...record.reply,
      sourceStamp: {
        ...record.reply.sourceStamp,
        inputDigest: 'ab'.repeat(32),
      },
    },
  } as T;
}
