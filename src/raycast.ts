import { Vector3 } from "three";
import { AIR, WATER } from "./blocks";
import type { World } from "./world";

export interface RaycastHit {
  /** 当たったブロックの座標。 */
  block: Vector3;
  /** 当たった面の法線（設置位置は block + normal）。 */
  normal: Vector3;
  id: number;
}

/**
 * Amanatides & Woo の格子トラバース。ボクセル境界までの距離を軸ごとに持ち、
 * 一番近い境界を跨ぐ軸だけを進める。
 */
export function raycastVoxels(
  world: World,
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
): RaycastHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  const boundary = (pos: number, cell: number, step: number) =>
    step > 0 ? cell + 1 - pos : pos - cell;

  let tMaxX = dx === 0 ? Infinity : boundary(origin.x, x, stepX) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : boundary(origin.y, y, stepY) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : boundary(origin.z, z, stepZ) * tDeltaZ;

  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < 512; i++) {
    const id = world.getVoxel(x, y, z);
    if (id !== AIR && id !== WATER) {
      return { block: new Vector3(x, y, z), normal: new Vector3(nx, ny, nz), id };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDistance) break;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDistance) break;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      if (tMaxZ > maxDistance) break;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }

  return null;
}
