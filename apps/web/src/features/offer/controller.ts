import type {
  OfferQuoteAction,
  OfferQuoteReply,
  PlanSnapshot,
  ProtocolRequest,
  ProtocolResponse,
} from '../../contracts/generated/dto';

type QuoteCommand = Extract<ProtocolRequest['command'], { kind: 'quoteOfferBundle' }>;

export interface OfferQuoteClient {
  systemRequest(command: QuoteCommand, timeoutMs?: number): Promise<ProtocolResponse['event']>;
}

const QUOTE_TIMEOUT_MS = 30000;

/**
 * One Rust quote per snapshot id. A second reader of the same id shares the
 * in-flight or completed reply. Failures are dropped so a person can ask again.
 * Nothing here retries on its own.
 */
const snapshotQuotes = new Map<string, Promise<OfferQuoteReply>>();

export class OfferQuoteController {
  constructor(private readonly workers: { ensure(): Promise<OfferQuoteClient> }) {}

  async quote(action: OfferQuoteAction): Promise<OfferQuoteReply> {
    const client = await this.workers.ensure();
    const event = await client.systemRequest(
      { kind: 'quoteOfferBundle', action },
      QUOTE_TIMEOUT_MS,
    );
    if (event.kind !== 'offerBundleQuoted') throw new Error('unexpected_worker_event');
    return event.reply;
  }
}

export function quoteSnapshotOnce(
  controller: OfferQuoteController,
  snapshot: PlanSnapshot,
): Promise<OfferQuoteReply> {
  const id = snapshot.planSnapshotId;
  const cached = snapshotQuotes.get(id);
  if (cached) return cached;
  const pending = controller
    .quote({ kind: 'snapshot', snapshot, alternates: [], sellerNotes: [] })
    .catch((error: unknown) => {
      snapshotQuotes.delete(id);
      throw error;
    });
  snapshotQuotes.set(id, pending);
  return pending;
}

/** Forgets a stored reply so the next read sends one new command. */
export function forgetSnapshotQuote(planSnapshotId: string): void {
  snapshotQuotes.delete(planSnapshotId);
}
