import { SCHEMA_VERSION, readAttachmentRow } from './db';
import type { ProjectBundle, ProjectRepository } from './repository';

export const EXPORT_VERSION = 1;

/**
 * §7 export envelope. Digests travel with each record so corruption is
 * detectable on import; a digest proves consistency, not authorship.
 * `recovery` exports are explicitly unvalidated raw data.
 *
 * Photo bytes are never in the JSON envelope: `attachments` carries each
 * row's metadata only, and `excluded` names the withheld byte payloads so the
 * file itself declares it is not a complete photo copy.
 */
export interface ProjectExport {
  exportVersion: number;
  kind: 'standard' | 'recovery';
  producer: { app: 'zari-web'; schemaVersion: number; buildId: string };
  exportedAt: string;
  project: unknown;
  draft: unknown;
  inputs: unknown[];
  snapshots: unknown[];
  actionProgress: unknown[];
  catalogs: unknown[];
  ownedContainers: unknown[];
  attachments: unknown[];
  quarantine: unknown[];
  excluded: string[];
}

export async function exportProject(
  repo: ProjectRepository,
  bundle: ProjectBundle,
  buildId: string,
  kind: 'standard' | 'recovery',
): Promise<ProjectExport> {
  const projectId = bundle.project.projectId;
  const inputs = await repo.db.inputs.where('projectId').equals(projectId).toArray();
  const progress = await repo.db.actionProgress
    .where('projectId')
    .equals(projectId)
    .toArray();
  const quarantine = kind === 'recovery' ? await repo.quarantined() : [];
  // The project pins one catalog, but recovery must preserve every catalog
  // the user could re-pin plus the global owned-container library.
  const catalogs = await repo.listCatalogs().catch(() =>
    bundle.catalog !== null ? [bundle.catalog] : [],
  );
  const ownedContainers = await repo.listOwnedContainers().catch(() => []);
  const attachments: unknown[] = [];
  const excluded: string[] = ['transient-logs'];
  try {
    for (const raw of await repo.db.attachments
      .where('projectId')
      .equals(projectId)
      .toArray()) {
      try {
        const row = readAttachmentRow(raw);
        attachments.push({
          attachmentId: row.attachmentId,
          name: row.name,
          mime: row.mime,
          byteSize: row.byteSize,
          originalByteSize: row.originalByteSize,
          width: row.width,
          height: row.height,
          createdAt: row.createdAt,
        });
        excluded.push(`attachment-bytes:${row.attachmentId}`);
      } catch {
        excluded.push(`attachment-corrupt:${(raw as { attachmentId?: string }).attachmentId ?? '?'}`);
      }
    }
  } catch {
    // A missing pre-v2 store means no attachments existed; nothing excluded.
  }
  return {
    exportVersion: EXPORT_VERSION,
    kind,
    producer: { app: 'zari-web', schemaVersion: SCHEMA_VERSION, buildId },
    exportedAt: new Date().toISOString(),
    project: bundle.project,
    draft: bundle.draft,
    inputs,
    snapshots: bundle.snapshots,
    actionProgress: progress,
    catalogs,
    ownedContainers,
    attachments,
    quarantine,
    excluded,
  };
}
