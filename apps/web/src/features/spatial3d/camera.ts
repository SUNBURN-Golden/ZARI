import type { Vec3 } from './mapping';

export type CameraPreset = 'oblique' | 'top' | 'front';

export const ORBIT = {
  minPolar: 0,
  /** Horizon through the orbit centre. A larger angle looks up from below the volume. */
  maxPolar: Math.PI / 2,
  minZoom: 0.6,
  maxZoom: 6,
  padding: 1.15,
  eyeScale: 2.2,
  minDistanceScale: 1.05,
  maxDistanceScale: 8,
} as const;

export type Fit = {
  center: [number, number, number];
  /** Longest axis of the drawable bounds, in metres. Top and front share this. */
  maxSpan: number;
  radius: number;
};

export type Pose = {
  preset: CameraPreset;
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
};

/** Same orthographic half-height for every preset, so millimetres match on screen. */
export function orthoHalfHeight(maxSpan: number, aspect: number): number {
  const half = (maxSpan / 2) * ORBIT.padding;
  if (!(aspect > 0) || aspect >= 1) return half;
  return half / aspect;
}

export function eyeDistance(fit: Fit): number {
  return Math.max(fit.radius * ORBIT.eyeScale, fit.radius * ORBIT.minDistanceScale);
}

/** Angle from straight above. `π/2` is the horizon; larger is below the centre. */
export function polarFromAbove(position: Vec3, target: Vec3): number {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const radius = Math.hypot(dx, dy, dz);
  if (radius === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dy / radius)));
}

function place(target: Vec3, dir: Vec3, distance: number): [number, number, number] {
  const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [
    target[0] + (dir[0] / length) * distance,
    target[1] + (dir[1] / length) * distance,
    target[2] + (dir[2] / length) * distance,
  ];
}

export function cameraPose(preset: CameraPreset, fit: Fit): Pose {
  const distance = eyeDistance(fit);
  const target: [number, number, number] = [fit.center[0], fit.center[1], fit.center[2]];
  if (preset === 'top') {
    return { preset, position: place(target, [0, 1, 0], distance), up: [0, 0, -1], target };
  }
  if (preset === 'front') {
    return { preset, position: place(target, [0, 0, 1], distance), up: [0, 1, 0], target };
  }
  return { preset: 'oblique', position: place(target, [1, 0.85, 1], distance), up: [0, 1, 0], target };
}
