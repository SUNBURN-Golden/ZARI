import type {
  PlanSnapshot,
  PreparedHandoff,
  PurchaseHandoffAction,
  PurchaseHandoffReply,
  PurchaseLedger,
  ProtocolRequest,
  ProtocolResponse,
} from '../../contracts/generated/dto';
import type { ProjectRepository } from '../../persistence/repository';

type HandoffCommand = Extract<ProtocolRequest['command'], { kind: 'preparePurchaseHandoff' }>;

export interface PurchaseClient {
  systemRequest(command: HandoffCommand, timeoutMs?: number): Promise<ProtocolResponse['event']>;
}

export const EMPTY_PURCHASE_LEDGER: PurchaseLedger = { events: [] };

const TIMEOUT_MS = 30000;

export interface PurchaseApplyResult {
  reply: PurchaseHandoffReply;
  revision: string;
  persisted: boolean;
}

/**
 * Rust owns freshness, suitability, and the separation of purchase events.
 * The page stores a ledger only when a record changes it.
 */
export class PurchaseHandoffController {
  constructor(
    private readonly workers: { ensure(): Promise<PurchaseClient> },
    private readonly repository: ProjectRepository,
  ) {}

  load(projectId: string) {
    return this.repository.getPurchaseHandoff(projectId);
  }

  async send(
    projectId: string,
    revision: string,
    action: PurchaseHandoffAction,
  ): Promise<PurchaseApplyResult> {
    const client = await this.workers.ensure();
    const event = await client.systemRequest(
      { kind: 'preparePurchaseHandoff', action },
      TIMEOUT_MS,
    );
    if (event.kind !== 'purchaseHandoffPrepared') throw new Error('unexpected_worker_event');
    const reply = event.reply;
    if (reply.kind !== 'prepared' || !reply.prepared.changed) {
      return { reply, revision, persisted: false };
    }
    const saved = await this.repository.savePurchaseHandoff(
      projectId,
      reply.prepared.ledger,
      revision,
    );
    if (saved.status !== 'saved') throw new Error('revision_conflict');
    return { reply, revision: saved.revision, persisted: true };
  }
}

const prepares = new Map<string, Promise<PreparedHandoff>>();

function cacheKey(projectId: string, planSnapshotId: string, revision: string): string {
  return `${projectId}:${planSnapshotId}:${revision}`;
}

/** One prepare per project, snapshot, and ledger revision. Failures can be asked again. */
export function prepareHandoffOnce(
  controller: PurchaseHandoffController,
  projectId: string,
  snapshot: PlanSnapshot,
  ledger: PurchaseLedger,
  revision: string,
  asOf: string,
): Promise<PreparedHandoff> {
  const key = cacheKey(projectId, snapshot.planSnapshotId, revision);
  const cached = prepares.get(key);
  if (cached) return cached;
  const pending = controller
    .send(projectId, revision, {
      kind: 'prepare',
      snapshot,
      ledger,
      asOf,
      affiliateOfferIds: [],
    })
    .then((result) => {
      if (result.reply.kind !== 'prepared') throw new Error('unexpected_worker_event');
      return result.reply.prepared;
    })
    .catch((error: unknown) => {
      prepares.delete(key);
      throw error;
    });
  prepares.set(key, pending);
  return pending;
}

export function forgetHandoff(projectId: string, planSnapshotId: string, revision: string): void {
  prepares.delete(cacheKey(projectId, planSnapshotId, revision));
}

/** UTC timestamp at whole seconds. Fractional seconds stay unconfirmed in Rust. */
export function utcSecond(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
