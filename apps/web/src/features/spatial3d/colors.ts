const cache = new Map<string, string>();

/** Read a semantic token as a computed colour. Aliases stay tokens, not raw theme strings. */
export function tokenRgb(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  cache.set(name, resolved);
  return resolved;
}

export function clearTokenCache(): void {
  cache.clear();
}

export function roleToken(role: string): string {
  switch (role) {
    case 'ownedContainer':
      return '--zari-accent';
    case 'newContainer':
      return '--zari-info';
    case 'directItem':
    case 'containedItem':
      return '--zari-success';
    case 'compartmentBoundary':
      return '--zari-text-muted';
    default:
      return '--zari-text-secondary';
  }
}

export const SPATIAL_TOKEN = {
  boundary: '--zari-text-muted',
  selection: '--zari-selection-ring',
  focus: '--zari-info',
  overlay: '--zari-preview',
  canvas: '--zari-canvas-bg',
} as const;
