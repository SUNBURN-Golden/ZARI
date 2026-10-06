import type { SpatialProjection } from '../../contracts/generated/dto';

/**
 * Pause after a projection reply is received and before the lease check.
 * The test build can switch plans while the reply is in hand. Production
 * builds drop this call because `import.meta.env.MODE` is not `test`.
 */
export async function holdProjectionReply(): Promise<void> {
  const hold = (globalThis as { __zariProjectionGate?: () => Promise<void> }).__zariProjectionGate;
  if (typeof hold === 'function') await hold();
}

/**
 * Test-only injection: stamp a plan projection with a snapshot id that does
 * not match the request. The session must fail the reply instead of painting it.
 */
export function maybeCorruptProjection<T>(event: T): T {
  const flag = (globalThis as { __zariCorruptProjection?: boolean }).__zariCorruptProjection;
  if (!flag || event === null || typeof event !== 'object') return event;
  const record = event as {
    kind?: string;
    projection?: SpatialProjection;
  };
  if (record.kind !== 'spatialViewProjected' || record.projection?.source.kind !== 'plan') return event;
  const source = record.projection.source;
  return {
    ...record,
    projection: {
      ...record.projection,
      source: { ...source, planSnapshotId: 'f'.repeat(64) },
    },
  } as T;
}
