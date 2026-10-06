import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { SpatialTarget } from '../../contracts/generated/dto';
import type { Face, Vec3 } from './mapping';

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);

/** Axis-aligned instance matrix. Yaw is already inside the world box. */
export function bodyMatrix(body: { center: Vec3; size: Vec3; face?: Face }): Matrix4 {
  if (body.face) return planeMatrix(body.center, [body.size[0], body.size[1]], body.face);
  return cuboidMatrix(body.center, body.size);
}

export function cuboidMatrix(center: Vec3, size: Vec3): Matrix4 {
  return new Matrix4().compose(
    new Vector3(center[0], center[1], center[2]),
    new Quaternion(),
    new Vector3(size[0], size[1], size[2]),
  );
}

/** Unit plane (XY, normal +Z) rotated onto a compartment face. Scale is the rectangle, not a thickness. */
export function planeMatrix(center: Vec3, span: readonly [number, number], face: Face): Matrix4 {
  const rotation = new Quaternion();
  if (face === 'floor' || face === 'top') rotation.setFromAxisAngle(AXIS_X, -Math.PI / 2);
  else if (face === 'left' || face === 'right') rotation.setFromAxisAngle(AXIS_Y, Math.PI / 2);
  return new Matrix4().compose(
    new Vector3(center[0], center[1], center[2]),
    rotation,
    new Vector3(span[0], span[1], 1),
  );
}

export type InstanceBinding = {
  matrix: Matrix4;
  target: SpatialTarget;
  pickable: boolean;
};

/** `instanceId` is the index in `items`. The target list is the same order. */
export function bindInstances(mesh: InstancedMesh, items: readonly InstanceBinding[]): void {
  const targets: SpatialTarget[] = [];
  const pickable: boolean[] = [];
  items.forEach((item, index) => {
    mesh.setMatrixAt(index, item.matrix);
    targets.push(item.target);
    pickable.push(item.pickable);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.userData = { targets, pickable };
}
