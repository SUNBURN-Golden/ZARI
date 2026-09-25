/**
 * App-shell registration (Ticket 009). One reload after first load, the
 * versioned same-origin shell serves offline visits — it is convenience
 * availability, never a backup of project data. Staged builds activate only
 * at a navigation boundary: a reload message tells the user to reopen.
 */
export interface ShellStatus {
  registered: boolean;
  stagedBuildId: string | null;
}

let status: ShellStatus = { registered: false, stagedBuildId: null };
const listeners = new Set<() => void>();

export function shellStatus(): ShellStatus {
  return status;
}

export function onShellStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(next: Partial<ShellStatus>) {
  status = { ...status, ...next };
  for (const fn of [...listeners]) fn();
}

/**
 * Register `./sw.js`. Development (dev-server) builds skip registration:
 * dev servers serve unversioned assets with no build manifest, and caching
 * them would pin stale code.
 */
export function registerShell(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  const register = () =>
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => emit({ registered: true }))
      .catch(() => emit({ registered: false }));
  if (document.readyState === 'complete') void register();
  else globalThis.addEventListener('load', () => void register(), { once: true });
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data;
    if (
      data !== null &&
      typeof data === 'object' &&
      data.type === 'buildStaged' &&
      typeof data.buildId === 'string'
    )
      emit({ stagedBuildId: data.buildId });
  });
}
