/**
 * Domain millimetres use x = right, y = front→back, z = up.
 * Three.js metres use `(X, Y, Z) = (x, z, -y) / 1000`.
 * A world box is already the yaw-applied axis-aligned extent. Do not rotate it again.
 */

export const MM_TO_M = 0.001;

export type Vec3 = readonly [number, number, number];

export type Face = 'floor' | 'back' | 'left' | 'right' | 'front' | 'top';

export type MeshBox = {
  center: [number, number, number];
  /** Width (X), height (Y = domain z), depth (Z = domain y). */
  size: [number, number, number];
  minMm: [number, number, number];
  maxMm: [number, number, number];
};

export function domainMmToThree(x: number, y: number, z: number): [number, number, number] {
  return [x * MM_TO_M, z * MM_TO_M, -y * MM_TO_M];
}

/** A non-positive axis is not a box. Missing height or offset stays absent. */
export function meshFromWorldBox(box: { min: readonly number[]; max: readonly number[] }): MeshBox | null {
  const x0 = at(box.min, 0);
  const y0 = at(box.min, 1);
  const z0 = at(box.min, 2);
  const x1 = at(box.max, 0);
  const y1 = at(box.max, 1);
  const z1 = at(box.max, 2);
  if (!(x1 > x0 && y1 > y0 && z1 > z0)) return null;
  return {
    center: domainMmToThree((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    size: [(x1 - x0) * MM_TO_M, (z1 - z0) * MM_TO_M, (y1 - y0) * MM_TO_M],
    minMm: [x0, y0, z0],
    maxMm: [x1, y1, z1],
  };
}

function at(value: readonly number[], index: number): number {
  return value[index] ?? 0;
}

export function faceCenterMm(min: readonly number[], max: readonly number[], face: Face): [number, number, number] {
  const cx = (at(min, 0) + at(max, 0)) / 2;
  const cy = (at(min, 1) + at(max, 1)) / 2;
  const cz = (at(min, 2) + at(max, 2)) / 2;
  switch (face) {
    case 'floor':
      return [cx, cy, at(min, 2)];
    case 'top':
      return [cx, cy, at(max, 2)];
    case 'front':
      return [cx, at(min, 1), cz];
    case 'back':
      return [cx, at(max, 1), cz];
    case 'left':
      return [at(min, 0), cy, cz];
    case 'right':
      return [at(max, 0), cy, cz];
    default: {
      const neverFace: never = face;
      return neverFace;
    }
  }
}

/** Local plane span in metres. This is the boundary rectangle, not a wall thickness. */
export function faceSpan(min: readonly number[], max: readonly number[], face: Face): [number, number] {
  const dx = (at(max, 0) - at(min, 0)) * MM_TO_M;
  const dy = (at(max, 1) - at(min, 1)) * MM_TO_M;
  const dz = (at(max, 2) - at(min, 2)) * MM_TO_M;
  if (face === 'floor' || face === 'top') return [dx, dy];
  if (face === 'left' || face === 'right') return [dy, dz];
  return [dx, dz];
}
