import type {
  InventoryAction,
  InventoryLedger,
  InventoryReply,
  ProtocolRequest,
  ProtocolResponse,
} from '../../contracts/generated/dto';
import type { ProjectRepository } from '../../persistence/repository';

type LedgerCommand = Extract<ProtocolRequest['command'], { kind: 'applyInventoryLedger' }>;

export interface InventoryClient {
  systemRequest(command: LedgerCommand, timeoutMs?: number): Promise<ProtocolResponse['event']>;
}

export const EMPTY_LEDGER: InventoryLedger = { items: [], containers: [], events: [] };

const APPLY_TIMEOUT_MS = 30000;

export interface InventoryApplyResult {
  reply: InventoryReply;
  revision: string;
  /** True only after a CAS save. Reads and failed conservation do not persist. */
  persisted: boolean;
}

/**
 * Sends the ledger to Rust and stores the reply only when Rust says it changed.
 * Opening a historical plan id and conservation checks are reads.
 */
export class InventoryController {
  constructor(
    private readonly workers: { ensure(): Promise<InventoryClient> },
    private readonly repository: ProjectRepository,
  ) {}

  load(projectId: string) {
    return this.repository.getInventoryLedger(projectId);
  }

  async apply(
    projectId: string,
    ledger: InventoryLedger,
    revision: string,
    action: InventoryAction,
  ): Promise<InventoryApplyResult> {
    const client = await this.workers.ensure();
    const event = await client.systemRequest(
      { kind: 'applyInventoryLedger', ledger, action },
      APPLY_TIMEOUT_MS,
    );
    if (event.kind !== 'inventoryLedgerApplied') throw new Error('unexpected_worker_event');
    if (!event.reply.changed) return { reply: event.reply, revision, persisted: false };
    const saved = await this.repository.saveInventoryLedger(projectId, event.reply.ledger, revision);
    if (saved.status !== 'saved') throw new Error('revision_conflict');
    return { reply: event.reply, revision: saved.revision, persisted: true };
  }
}
