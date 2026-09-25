import type {
  Diagnostic,
  OwnedContainer,
  RawOwnedContainerDto,
} from '../../contracts/generated/dto';
import type { ProjectRepository } from '../../persistence/repository';
import type { ProbeClient } from '../../worker/client';
import type { WorkerController } from '../../worker/controller';
import { sampleProjectForm } from '../project/draft';
import { isIdText } from '../catalog/import';
import { blankOwnedRaw, type OwnedFormFields } from './model';

/**
 * Owned-container library (Ticket 008). Records are normalized by Rust
 * `normalizeInput` — there is no owned-only operation, so registration sends
 * the raw entry inside the shipped valid template under a bootstrap context
 * and extracts only `ownedContainers`. Diagnostics scoped to the entry reject
 * the registration; the record is persisted by value, so later catalog
 * changes cannot rewrite stored physical facts.
 */
export type OwnedResult =
  | { status: 'saved'; container: OwnedContainer; revision: string }
  | { status: 'rejected'; diagnostics: Diagnostic[] }
  | { status: 'conflict'; revision: string }
  | { status: 'unavailable'; error: string };

export class OwnedManager {
  constructor(
    private readonly controller: WorkerController,
    private readonly repo: ProjectRepository,
  ) {}
  /**
   * Bootstrap activation is enough for `normalizeInput`; this client's
   * identity is a pseudo project id so the shared project session's context
   * is never clobbered (this controller owns a separate Worker).
   */
  private async client(): Promise<ProbeClient> {
    const client = await this.controller.ensure();
    await client.activate('owned-library', '0', '0', { kind: 'bootstrap' });
    return client;
  }
  /**
   * Normalize one raw entry through Rust and CAS-save it. `expectedRevision`
   * is the library row revision the caller saw ('0' for a new entry).
   */
  async register(raw: RawOwnedContainerDto, expectedRevision = '0'): Promise<OwnedResult> {
    if (!isIdText(raw.id))
      return {
        status: 'rejected',
        diagnostics: [
          { fieldPath: `ownedContainers.${raw.id}`, code: 'invalid_id', reasonCode: 'invalid_id' },
        ],
      };
    let client: ProbeClient;
    try {
      client = await this.client();
    } catch (error) {
      return {
        status: 'unavailable',
        error: String(error instanceof Error ? error.message : error),
      };
    }
    const form = sampleProjectForm();
    form.ownedContainers = [raw];
    if (raw.variantRef !== null)
      form.catalogPin = {
        catalogVersion: 'owned-library',
        catalogDigest: raw.variantRef.catalogDigest,
      };
    try {
      const reply = await client.request({
        kind: 'normalizeInput',
        input: { kind: 'project', project: form },
        priorInputDigest: null,
        formatRequests: [],
      });
      if (reply.kind !== 'normalized')
        return { status: 'unavailable', error: 'unexpected_worker_event' };
      const owned =
        reply.normalizedInput?.kind === 'project'
          ? (reply.normalizedInput.input.ownedContainers.find((o) => o.id === raw.id) ?? null)
          : null;
      if (owned === null) {
        return {
          status: 'rejected',
          diagnostics: reply.diagnostics.filter((d) =>
            d.fieldPath.startsWith(`ownedContainers.${raw.id}`),
          ),
        };
      }
      const result = await this.repo.saveOwnedContainer(owned, expectedRevision);
      if (result.status === 'conflict')
        return { status: 'conflict', revision: result.revision };
      return { status: 'saved', container: owned, revision: result.revision };
    } catch (error) {
      return {
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  /** Manual entry fields → raw DTO → `register`. */
  async registerFields(
    fields: OwnedFormFields,
    expectedRevision = '0',
  ): Promise<OwnedResult> {
    return this.register(blankOwnedRaw(fields), expectedRevision);
  }
  async remove(ownedContainerId: string, expectedRevision: string) {
    return this.repo.deleteOwnedContainer(ownedContainerId, expectedRevision);
  }
  list(): ReturnType<ProjectRepository['listOwnedContainers']> {
    return this.repo.listOwnedContainers();
  }
}
