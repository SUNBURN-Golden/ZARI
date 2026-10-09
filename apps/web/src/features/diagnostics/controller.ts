import type { SearchDiagnosticReply } from '../../contracts/generated/dto';

const diagnoses = new Map<string, Promise<SearchDiagnosticReply>>();

export type DiagnosticPanelState = 'idle' | 'pending' | 'ready' | 'empty' | 'error' | 'cancelled';

export interface DiagnosticKeyInput {
  inputDigest: string;
  catalogDigest: string;
  termination: string;
  workUnits: string;
  nodes: number;
  reasons: readonly string[];
  snapshotIds: readonly string[];
  restrictions: readonly string[];
}

/**
 * One diagnosis per saved input, catalog, termination, and the search
 * observations that were classified. Order of ids does not matter.
 * Nothing here retries by itself.
 */
export function diagnosticKey(input: DiagnosticKeyInput): string {
  const reasons = [...input.reasons].sort().join(',');
  const snapshots = [...input.snapshotIds].sort().join(',');
  const restrictions = [...input.restrictions].sort().join(',');
  return [
    input.inputDigest,
    input.catalogDigest,
    input.termination,
    input.workUnits,
    String(input.nodes),
    reasons,
    snapshots,
    restrictions,
  ].join('\n');
}

export function diagnoseOnce(
  key: string,
  run: () => Promise<SearchDiagnosticReply>,
): Promise<SearchDiagnosticReply> {
  const cached = diagnoses.get(key);
  if (cached) return cached;
  const pending = run().catch((error: unknown) => {
    diagnoses.delete(key);
    throw error;
  });
  diagnoses.set(key, pending);
  return pending;
}

/** Forgets a stored reply so the next ask sends one new command. */
export function forgetDiagnosis(key: string): void {
  diagnoses.delete(key);
}

/** A reply applies only to the request that is still current. */
export function diagnosisReplyApplies(requestEpoch: number, currentEpoch: number): boolean {
  return requestEpoch === currentEpoch;
}
