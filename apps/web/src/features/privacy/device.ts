/** Read-only device facts for the data screen. Nothing here writes or sends. */
export interface StorageFacts {
  /** null: the browser does not say. Unknown is never shown as zero. */
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function readStorageFacts(): Promise<StorageFacts> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage) return { usage: null, quota: null, persisted: null };
  const estimate = await storage.estimate?.().catch(() => undefined);
  const persisted = await storage.persisted?.().catch(() => undefined);
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    usage: num(estimate?.usage),
    quota: num(estimate?.quota),
    persisted: typeof persisted === 'boolean' ? persisted : null,
  };
}

/** Fraction at which the screen warns that saving may fail. */
export const LOW_SPACE_RATIO = 0.8;

export function lowSpace(facts: StorageFacts): boolean {
  return facts.usage !== null && facts.quota !== null && facts.quota > 0 && facts.usage / facts.quota >= LOW_SPACE_RATIO;
}

export interface ShellCacheFacts {
  /** false: no Cache Storage or no registered shell (dev server, private mode). */
  available: boolean;
  active: string | null;
  previous: string | null;
  staged: string | null;
  buildCaches: string[];
}

export async function readShellCache(): Promise<ShellCacheFacts> {
  const empty: ShellCacheFacts = { available: false, active: null, previous: null, staged: null, buildCaches: [] };
  if (typeof caches === 'undefined') return empty;
  try {
    if (!(await caches.has('zari-shell-meta'))) return empty;
    const meta = await caches.open('zari-shell-meta');
    const read = async (key: string) => {
      const hit = await meta.match(key);
      if (!hit) return null;
      try {
        const body = (await hit.json()) as { buildId?: unknown } | null;
        return typeof body?.buildId === 'string' ? body.buildId : null;
      } catch {
        return null;
      }
    };
    const names = (await caches.keys()).filter((name) => name.startsWith('zari-build-')).sort();
    return {
      available: true,
      active: await read('active.json'),
      previous: await read('previous.json'),
      staged: await read('staged.json'),
      buildCaches: names,
    };
  } catch {
    return empty;
  }
}
