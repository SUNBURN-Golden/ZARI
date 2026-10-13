import type {
  LocationAction,
  LocationLog,
  LocationLogReply,
  LocationObservation,
  LocationSearchReply,
  PlanSnapshot,
  ProjectInput,
  ProtocolRequest,
  ProtocolResponse,
} from '../../contracts/generated/dto';
import type { ProjectRepository } from '../../persistence/repository';

type ApplyCommand = Extract<ProtocolRequest['command'], { kind: 'applyLocationLog' }>;
type QueryCommand = Extract<ProtocolRequest['command'], { kind: 'queryLocationSearch' }>;

export interface LocationClient {
  systemRequest(
    command: ApplyCommand | QueryCommand,
    timeoutMs?: number,
  ): Promise<ProtocolResponse['event']>;
}

export const EMPTY_LOG: LocationLog = { observations: [] };

/**
 * Unit numbers typed as digits separated by commas and/or spaces. Empty text
 * means every unit. Anything else is `null`, never a guess. This splits and
 * checks each token instead of nesting quantifiers, so a long near-miss input
 * cannot make the page hang.
 */
export function parseOrdinals(text: string): number[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const ordinals: number[] = [];
  for (const part of trimmed.split(',')) {
    for (const word of part.trim().split(/\s+/)) {
      if (!/^\d+$/.test(word)) return null;
      const value = Number(word);
      if (!Number.isSafeInteger(value)) return null;
      ordinals.push(value);
    }
  }
  return ordinals;
}

const TIMEOUT_MS = 30000;

export interface LocationApplyResult {
  reply: LocationLogReply;
  revision: string;
  /** True only after a CAS save. Reads and rejected records do not persist. */
  persisted: boolean;
}

function failure(event: ProtocolResponse['event']): void {
  if (event.kind === 'operationFailed') throw new Error(event.code);
}

/**
 * The project location index. Rust decides what an observation means and
 * whether the log changed; the browser persists only accepted logs. A
 * planned location is never stored as an actual one.
 */
export class LocationController {
  constructor(
    private readonly workers: { ensure(): Promise<LocationClient> },
    private readonly repository: ProjectRepository,
  ) {}

  load(projectId: string) {
    return this.repository.getLocationLog(projectId);
  }

  async record(
    projectId: string,
    log: LocationLog,
    revision: string,
    input: ProjectInput,
    snapshot: PlanSnapshot | null,
    observation: LocationObservation,
  ): Promise<LocationApplyResult> {
    const action: LocationAction = { kind: 'record', observation };
    const client = await this.workers.ensure();
    const event = await client.systemRequest(
      { kind: 'applyLocationLog', log, input, snapshot, action },
      TIMEOUT_MS,
    );
    failure(event);
    if (event.kind !== 'locationLogApplied') throw new Error('unexpected_worker_event');
    if (!event.reply.changed) return { reply: event.reply, revision, persisted: false };
    const saved = await this.repository.saveLocationLog(projectId, event.reply.log, revision);
    if (saved.status !== 'saved') throw new Error('revision_conflict');
    return { reply: event.reply, revision: saved.revision, persisted: true };
  }

  async search(
    input: ProjectInput,
    snapshot: PlanSnapshot | null,
    log: LocationLog,
    query: string,
  ): Promise<LocationSearchReply> {
    const client = await this.workers.ensure();
    const event = await client.systemRequest(
      { kind: 'queryLocationSearch', input, snapshot, log, query },
      TIMEOUT_MS,
    );
    failure(event);
    if (event.kind !== 'locationSearchQueried') throw new Error('unexpected_worker_event');
    return event.reply;
  }
}
