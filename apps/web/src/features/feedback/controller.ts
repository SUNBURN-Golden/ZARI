import type {
  FeedbackAction,
  FeedbackEntry,
  FeedbackLog,
  FeedbackLogReply,
  LocationLog,
  PlanSnapshot,
  ProjectInput,
  ProposalReply,
  ProtocolRequest,
  ProtocolResponse,
} from '../../contracts/generated/dto';
import type { ProjectRepository } from '../../persistence/repository';

type ApplyCommand = Extract<ProtocolRequest['command'], { kind: 'applyFeedbackLog' }>;

export interface FeedbackClient {
  systemRequest(command: ApplyCommand, timeoutMs?: number): Promise<ProtocolResponse['event']>;
}

export const EMPTY_FEEDBACK_LOG: FeedbackLog = { entries: [], withdrawnIds: [] };
export const EMPTY_LOCATION_LOG: LocationLog = { observations: [] };

/** How many candidate layouts one proposal may send to the validator. */
export const BUDGET_CHOICES = [8, 16, 32, 64] as const;
export const DEFAULT_BUDGET = 16;

export type FeedbackPanelState =
  | 'idle'
  | 'pending'
  | 'ready'
  | 'nochange'
  | 'empty'
  | 'error'
  | 'cancelled';

const TIMEOUT_MS = 30000;

const proposals = new Map<string, Promise<ProposalReply>>();

/**
 * One command per saved input, adopted plan, feedback record, location record,
 * and budget. A second reader shares the in-flight reply. Failures are
 * dropped so a person can ask again. Nothing here retries.
 */
export function feedbackKey(
  inputDigest: string,
  baseId: string,
  log: FeedbackLog,
  locations: LocationLog,
  budget: number,
): string {
  const entries = log.entries
    .map((entry) =>
      [entry.id, entry.kind, entry.itemId, entry.frequency ?? '', entry.note ?? '', entry.planSnapshotId ?? ''].join(':'),
    )
    .join(',');
  const withdrawn = [...log.withdrawnIds].sort().join(',');
  const seen = locations.observations
    .map((row) => [row.id, row.kind, row.itemId, row.location ?? ''].join(':'))
    .join(',');
  return [inputDigest, baseId, String(budget), entries, withdrawn, seen].join('\n');
}

export function proposeOnce(
  key: string,
  run: () => Promise<ProposalReply>,
): Promise<ProposalReply> {
  const cached = proposals.get(key);
  if (cached) return cached;
  const pending = run().catch((error: unknown) => {
    proposals.delete(key);
    throw error;
  });
  proposals.set(key, pending);
  return pending;
}

/** Forgets a stored reply so the next ask sends one new command. */
export function forgetProposal(key: string): void {
  proposals.delete(key);
}

/** A reply applies only to the request that is still current. */
export function proposalReplyApplies(requestEpoch: number, currentEpoch: number): boolean {
  return requestEpoch === currentEpoch;
}

/**
 * Opening a draft is allowed only for the current request on the plan it was
 * made for. A cancel bumps the epoch, so a late reply cannot open.
 */
export function proposalOpenAllowed(
  replyEpoch: number,
  currentEpoch: number,
  outcome: 'published' | 'noChange' | null,
  baseId: string | null,
  acceptedId: string | null,
): boolean {
  return (
    proposalReplyApplies(replyEpoch, currentEpoch) &&
    outcome === 'published' &&
    baseId !== null &&
    baseId === acceptedId
  );
}

function failure(event: ProtocolResponse['event']): void {
  if (event.kind === 'operationFailed') throw new Error(event.code);
}

export interface FeedbackApplyResult {
  reply: FeedbackLogReply;
  revision: string;
}

/**
 * The project's use feedback. Rust decides what an entry means and whether
 * the log changed; the browser persists only accepted logs. A recorded entry
 * changes no plan, no input, and no location.
 */
export class FeedbackController {
  constructor(
    private readonly workers: { ensure(): Promise<FeedbackClient> },
    private readonly repository: ProjectRepository,
  ) {}

  load(projectId: string) {
    return this.repository.getFeedbackLog(projectId);
  }

  loadLocations(projectId: string) {
    return this.repository.getLocationLog(projectId);
  }

  private async apply(
    projectId: string,
    log: FeedbackLog,
    revision: string,
    input: ProjectInput,
    snapshot: PlanSnapshot | null,
    action: FeedbackAction,
  ): Promise<FeedbackApplyResult> {
    const client = await this.workers.ensure();
    const event = await client.systemRequest(
      { kind: 'applyFeedbackLog', log, input, snapshot, action },
      TIMEOUT_MS,
    );
    failure(event);
    if (event.kind !== 'feedbackLogApplied') throw new Error('unexpected_worker_event');
    if (!event.reply.changed) return { reply: event.reply, revision };
    const saved = await this.repository.saveFeedbackLog(projectId, event.reply.log, revision);
    if (saved.status !== 'saved') throw new Error('revision_conflict');
    return { reply: event.reply, revision: saved.revision };
  }

  record(
    projectId: string,
    log: FeedbackLog,
    revision: string,
    input: ProjectInput,
    snapshot: PlanSnapshot | null,
    entry: FeedbackEntry,
  ): Promise<FeedbackApplyResult> {
    return this.apply(projectId, log, revision, input, snapshot, { kind: 'record', entry });
  }

  withdraw(
    projectId: string,
    log: FeedbackLog,
    revision: string,
    input: ProjectInput,
    snapshot: PlanSnapshot | null,
    feedbackId: string,
  ): Promise<FeedbackApplyResult> {
    return this.apply(projectId, log, revision, input, snapshot, {
      kind: 'withdraw',
      feedbackId,
    });
  }
}
