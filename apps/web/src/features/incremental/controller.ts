import type { IncrementalPins, IncrementalReply } from '../../contracts/generated/dto';

const replans = new Map<string, Promise<IncrementalReply>>();

export type IncrementalPanelState =
  | 'idle'
  | 'pending'
  | 'ready'
  | 'blocked'
  | 'empty'
  | 'error'
  | 'cancelled';

/**
 * One command per saved input, previous snapshot, and pin set.
 * Pin order does not matter. A second reader shares the in-flight reply.
 * Failures are dropped so a person can ask again. Nothing here retries.
 */
export function replanKey(inputDigest: string, snapshotId: string, pins: IncrementalPins): string {
  const placements = [...pins.placementIds].sort().join(',');
  const items = [...pins.itemIds].sort().join(',');
  return `${inputDigest}\n${snapshotId}\n${placements}\n${items}\n${pins.strategy ? '1' : '0'}`;
}

export function replanOnce(key: string, run: () => Promise<IncrementalReply>): Promise<IncrementalReply> {
  const cached = replans.get(key);
  if (cached) return cached;
  const pending = run().catch((error: unknown) => {
    replans.delete(key);
    throw error;
  });
  replans.set(key, pending);
  return pending;
}

/** Forgets a stored reply so the next ask sends one new command. */
export function forgetReplan(key: string): void {
  replans.delete(key);
}

/** A reply applies only to the request that is still current. */
export function replanReplyApplies(requestEpoch: number, currentEpoch: number): boolean {
  return requestEpoch === currentEpoch;
}

/**
 * Switching to a published plan is allowed only for the current request.
 * A cancel bumps the epoch, so a late reply cannot adopt.
 */
export function replanAdoptAllowed(
  replyEpoch: number,
  currentEpoch: number,
  outcome: 'published' | 'blocked' | null,
): boolean {
  return replanReplyApplies(replyEpoch, currentEpoch) && outcome === 'published';
}
