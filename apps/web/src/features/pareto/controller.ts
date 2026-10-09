import type { ParetoReply, SearchTermination, Strategy } from '../../contracts/generated/dto';

const comparisons = new Map<string, Promise<ParetoReply>>();

export function paretoKey(
  inputDigest: string,
  strategy: Strategy,
  termination: SearchTermination,
  snapshotIds: readonly string[],
): string {
  return `${inputDigest}:${strategy}:${termination}:${snapshotIds.join(',')}`;
}

/**
 * One comparison per saved input, goal, termination, and snapshot list.
 * A second reader shares the in-flight reply. Failures are dropped so a
 * person can ask again. Nothing here retries on its own.
 */
export function compareParetoOnce(
  key: string,
  run: () => Promise<ParetoReply>,
): Promise<ParetoReply> {
  const cached = comparisons.get(key);
  if (cached) return cached;
  const pending = run().catch((error: unknown) => {
    comparisons.delete(key);
    throw error;
  });
  comparisons.set(key, pending);
  return pending;
}

/** Forgets a stored reply so the next read sends one new command. */
export function forgetParetoComparison(key: string): void {
  comparisons.delete(key);
}
