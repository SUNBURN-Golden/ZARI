import type { SpatialTarget } from '../../contracts/generated/dto';
import { targetKey } from '../workspace/selection';

export type PickHit = {
  target: SpatialTarget;
  distance: number;
  pickable: boolean;
};

export type PickResolution =
  | { kind: 'none' }
  | { kind: 'one'; target: SpatialTarget }
  | { kind: 'ambiguous'; targets: SpatialTarget[] };

/** One metre of slack is far too much; coplanar faces within 1 mm stay a list. */
export const PICK_EPSILON_M = 0.001;

export function resolvePick(hits: readonly PickHit[], epsilonM: number): PickResolution {
  const pickable = hits.filter((hit) => hit.pickable).sort((a, b) => a.distance - b.distance);
  const nearest = pickable[0];
  if (!nearest) return { kind: 'none' };
  const seen = new Set<string>();
  const targets: SpatialTarget[] = [];
  for (const hit of pickable) {
    if (hit.distance - nearest.distance > epsilonM) break;
    const key = targetKey(hit.target);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(hit.target);
  }
  const only = targets[0];
  if (!only) return { kind: 'none' };
  if (targets.length === 1) return { kind: 'one', target: only };
  return { kind: 'ambiguous', targets };
}
