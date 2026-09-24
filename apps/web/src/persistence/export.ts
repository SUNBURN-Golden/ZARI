import { SCHEMA_VERSION } from './db';
import type { ProjectBundle, ProjectRepository } from './repository';

export const EXPORT_VERSION = 1;

/**
 * §7 export envelope. Digests travel with each record so corruption is
 * detectable on import; a digest proves consistency, not authorship.
 * `recovery` exports are explicitly unvalidated raw data.
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
    catalogs: bundle.catalog !== null ? [bundle.catalog] : [],
    ownedContainers: [],
    quarantine,
    // Photos/attachments do not exist in this schema version; listed so the
    // exclusion is explicit rather than silently absent.
    excluded: ['attachments:not-implemented', 'transient-logs'],
  };
}
