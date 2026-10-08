import type { Strategy, StrategyLibraryReply } from '../../contracts/generated/dto';

const evaluations = new Map<string, Promise<StrategyLibraryReply>>();

export function libraryKey(inputDigest: string, strategy: Strategy): string {
  return `${inputDigest}:${strategy}`;
}

/**
 * One library read per saved input and pinned strategy. A second reader
 * shares the in-flight reply. Failures are dropped so a person can ask again.
 * Nothing here retries on its own.
 */
export function evaluateLibraryOnce(
  key: string,
  run: () => Promise<StrategyLibraryReply>,
): Promise<StrategyLibraryReply> {
  const cached = evaluations.get(key);
  if (cached) return cached;
  const pending = run().catch((error: unknown) => {
    evaluations.delete(key);
    throw error;
  });
  evaluations.set(key, pending);
  return pending;
}

/** Forgets a stored reply so the next read sends one new command. */
export function forgetLibraryEvaluation(key: string): void {
  evaluations.delete(key);
}
