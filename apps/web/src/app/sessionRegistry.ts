import type { CatalogSnapshot } from '../contracts/generated/dto';
import { validateCatalogSnapshot } from '../contracts/generated/validators.mjs';
import { CatalogManager } from '../features/catalog/manager';
import { OwnedManager } from '../features/owned/manager';
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
/**
 * A second Worker for the catalog/owned library so import validation and
 * owned registration never clobber an open project's activated context.
 */
export const libraryController = new WorkerController(
  () => new Worker(new URL('../worker/entry.ts', import.meta.url), { type: 'module' }),
);
export const catalogManager = new CatalogManager(libraryController, repository);
export const ownedManager = new OwnedManager(libraryController, repository);

const ENGINE_BUILD_ID = 'zari-web:005';

const sessions = new Map<string, ProjectSession>();
const refs = new Map<string, number>();

export function acquireSession(projectId: string): ProjectSession {
  refs.set(projectId, (refs.get(projectId) ?? 0) + 1);
  const existing = sessions.get(projectId);
  if (existing && !existing.isClosed) return existing;
  const session = new ProjectSession(repository, workerController, projectId, ENGINE_BUILD_ID);
  sessions.set(projectId, session);
  void session.open();
  return session;
}
/**
 * Release on unmount, deferred one macrotask: React mounts the next screen
 * (and re-acquires the same session) before the old screen's effect cleanup
 * runs, so a synchronous close here would kill the session being handed to
 * the new screen — the Worker runtime gets `disposeProject` while the UI
 * still believes the context is installed.
 *
 * The close is best-effort async. If a pending save fails the session stays
 * in the registry so the next open can offer retry/export/discard instead of
 * dropping the draft.
 */
export function releaseSession(projectId: string): void {
  const remaining = (refs.get(projectId) ?? 1) - 1;
  refs.set(projectId, remaining);
  if (remaining > 0) return;
  const session = sessions.get(projectId);
  if (!session || session.isClosed) return;
  setTimeout(() => {
    if ((refs.get(projectId) ?? 0) > 0) return;
    if (session.isClosed) {
      sessions.delete(projectId);
      return;
    }
    void session.close().then((ok) => {
      if (ok && (refs.get(projectId) ?? 0) === 0) sessions.delete(projectId);
    });
  }, 0);
}
/** Discard path after a close-blocked prompt. */
export function discardSession(projectId: string): void {
  refs.set(projectId, 0);
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
