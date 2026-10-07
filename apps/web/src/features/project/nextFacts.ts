import type { NextFactRow, NextFactsReply } from '../../contracts/generated/dto';
import { routeKind } from './detailFacts';

/** What the page may do with one row. It does not choose a different field. */
export type NextFactDestination =
  | { kind: 'field'; path: string }
  | { kind: 'catalog'; path: string }
  | { kind: 'unsupported'; path: string | null }
  | { kind: 'none'; path: null };

export interface NextFactTarget {
  fieldRefs: { fieldPath: string }[];
  resolutionActions: readonly string[];
  needKind: string;
  priorityClass: string;
}

/**
 * Route a Rust row to an existing editor. Catalog and unsupported rows do not
 * open a project field. A row with no field reference is not given a guess.
 */
export function nextFactDestination(row: NextFactTarget): NextFactDestination {
  const path = row.fieldRefs[0]?.fieldPath ?? null;
  if (!path) return { kind: row.resolutionActions.includes('requestSupportedScope') ? 'unsupported' : 'none', path: null };
  if (row.resolutionActions.includes('inspectCatalogSource')) return { kind: 'catalog', path };
  const route = routeKind(path);
  if (!route) return { kind: 'unsupported', path };
  if (!route.mutable) return { kind: 'catalog', path };
  if (row.needKind === 'unsupportedInput' || row.priorityClass === 'softOrUnsupported') {
    return { kind: 'unsupported', path };
  }
  return { kind: 'field', path };
}

export type NextFactsStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'limited' | 'failed';
export type NextFactsReason = 'draft' | 'committed' | 'worker' | null;

export interface NextFactsView {
  status: NextFactsStatus;
  reason: NextFactsReason;
  freshness: NextFactsReply['freshness'] | null;
  rows: NextFactRow[];
  actions: NextFactsReply['resolutionActions'];
  failureCode: string | null;
  sourceKey: string | null;
  requests: number;
  /** Worker round trip for the last real request. Cache hits leave this unchanged. */
  roundTripMs: number | null;
}

export const EMPTY_NEXT_FACTS: NextFactsView = {
  status: 'idle',
  reason: null,
  freshness: null,
  rows: [],
  actions: [],
  failureCode: null,
  sourceKey: null,
  requests: 0,
  roundTripMs: null,
};

export interface NextFactsLease {
  projectId: string;
  inputDigest: string;
  snapshotId: string | null;
  catalogDigest: string;
  rawGeneration: number;
  worker: object;
  mount: number;
}

export function nextFactsSourceKey(lease: Pick<NextFactsLease, 'projectId' | 'inputDigest' | 'snapshotId' | 'catalogDigest'>): string {
  return [lease.projectId, lease.inputDigest, lease.snapshotId ?? '', lease.catalogDigest].join('|');
}

export function nextFactsLeaseMatches(captured: NextFactsLease, current: NextFactsLease): boolean {
  return (
    captured.projectId === current.projectId &&
    captured.inputDigest === current.inputDigest &&
    captured.snapshotId === current.snapshotId &&
    captured.catalogDigest === current.catalogDigest &&
    captured.rawGeneration === current.rawGeneration &&
    captured.worker === current.worker &&
    captured.mount === current.mount
  );
}

/** A reply from another digest, snapshot, or catalog is not this list. */
export function nextFactsReplyMatches(lease: NextFactsLease, reply: NextFactsReply): boolean {
  const stamp = reply.sourceStamp;
  return (
    stamp.inputDigest === lease.inputDigest &&
    (stamp.planSnapshotId ?? null) === lease.snapshotId &&
    (stamp.catalogDigest ?? null) === lease.catalogDigest
  );
}
