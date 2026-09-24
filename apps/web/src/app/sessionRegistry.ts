import type { CatalogSnapshot } from '../contracts/generated/dto';
import { validateCatalogSnapshot } from '../contracts/generated/validators.mjs';
import { CATALOG_PIN } from '../features/project/draft';
import { ProjectSession } from '../features/project/session';
import bundledCatalog from '../features/project/synthetic-catalog.json';
import { ProjectRepository } from '../persistence/repository';
import { WorkerController } from '../worker/controller';

/** One shared repository and one guarded Worker per tab. */
export const repository = new ProjectRepository();
export const workerController = new WorkerController(
  () => new Worker(new URL('../worker/entry.ts', import.meta.url), { type: 'module' }),
);

const ENGINE_BUILD_ID = 'zari-web:005';

const sessions = new Map<string, ProjectSession>();

export function acquireSession(projectId: string): ProjectSession {
  const existing = sessions.get(projectId);
  if (existing && !existing.isClosed) return existing;
  const session = new ProjectSession(repository, workerController, projectId, ENGINE_BUILD_ID);
  sessions.set(projectId, session);
  void session.open();
  return session;
}
/**
 * Release on unmount: the close is best-effort async. If a pending save fails
 * the session stays in the registry so the next open can offer
 * retry/export/discard instead of dropping the draft.
 */
export function releaseSession(projectId: string): void {
  const session = sessions.get(projectId);
  if (!session || session.isClosed) return;
  void session.close().then((ok) => {
    if (ok) sessions.delete(projectId);
  });
}
/** Discard path after a close-blocked prompt. */
export function discardSession(projectId: string): void {
  const session = sessions.get(projectId);
  if (session) void session.close(true);
  sessions.delete(projectId);
}
/** Store the bundled synthetic catalog once; rows are immutable after write. */
export async function ensureBundledCatalog(): Promise<void> {
  await repository.open();
  const existing = await repository.getCatalog(CATALOG_PIN.catalogDigest).catch(() => null);
  if (existing) return;
  const catalog = bundledCatalog as unknown as CatalogSnapshot;
  if (!validateCatalogSnapshot(catalog)) throw new Error('bundled_catalog_invalid');
  await repository.putCatalog(catalog, 'synthetic-bundled');
}
