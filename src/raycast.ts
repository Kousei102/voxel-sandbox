import { Vector3 } from "three";
import { AIR, FULL_BOX, WATER, shapeBoxes } from "./blocks";
import type { World } from "./world";

export interface RaycastHit {
  /** 当たったブロックの座標。 */
  block: Vector3;
  /** 当たった面の法線（設置位置は block + normal）。 */
  normal: Vector3;
  /**
   * 面に当たった点（ワールド座標）。ハーフブロックの上付き・下付きは
   * 側面のどのあたりを狙ったかで決まるので、法線だけでは足りない。
   */
  point: Vector3;
  id: number;
}

/**
 * Amanatides & Woo の格子トラバース。ボクセル境界までの距離を軸ごとに持ち、
 * 一番近い境界を跨ぐ軸だけを進める。
 *
 * **立方体でないブロック（ハーフ・階段・サボテン）は、セルに入っただけでは当たりにしない。**
 * そのブロックの形（`shapeBoxes`）と交差するか改めて見て、外れていれば素通りする。
 * ここを省くと、ハーフブロックの上の空間を狙っているのにハーフに当たり、
 * 見えていない所にブロックが生えたり、狙っていないものが壊れたりする。
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

  rayOrigin[0] = origin.x;
  rayOrigin[1] = origin.y;
  rayOrigin[2] = origin.z;
  rayDir[0] = dx;
  rayDir[1] = dy;
  rayDir[2] = dz;

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
  /** セルに入るまでに進んだ距離。始点がブロックの中なら 0。 */
  let t = 0;

  const hit = (id: number, distance: number, hx: number, hy: number, hz: number): RaycastHit => ({
    block: new Vector3(x, y, z),
    normal: new Vector3(hx, hy, hz),
    point: new Vector3(
      origin.x + dx * distance,
      origin.y + dy * distance,
      origin.z + dz * distance,
    ),
    id,
  });

  for (let i = 0; i < 512; i++) {
    const id = world.getVoxel(x, y, z);
    if (id !== AIR && id !== WATER) {
      const boxes = shapeBoxes(id);
      if (boxes === FULL_BOX) {
        // 立方体はセルの境界がそのまま面なので、改めて交差を見る必要はない
        return hit(id, t, nx, ny, nz);
      }
      let best = Infinity;
      for (const box of boxes) {
        const enter = rayBox(rayOrigin, rayDir, box, x, y, z, boxNormal);
        if (enter < 0 || enter >= best) continue;
        best = enter;
        bestNormal[0] = boxNormal[0];
        bestNormal[1] = boxNormal[1];
        bestNormal[2] = boxNormal[2];
      }
      if (best <= maxDistance) {
        return hit(id, best, bestNormal[0], bestNormal[1], bestNormal[2]);
      }
      // 形から外れていたので、このセルには何も無かったものとして進む
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDistance) break;
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDistance) break;
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      if (tMaxZ > maxDistance) break;
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }

  return null;
}

/** 光線 1 本ぶんの控え。1 フレームに何度も呼ぶので、配列は使い回す。 */
const rayOrigin = [0, 0, 0];
const rayDir = [0, 0, 0];
const boxNormal = [0, 0, 0];
const bestNormal = [0, 0, 0];

/**
 * 光線と軸並行の箱 1 個の交差（slab method）。当たれば入るまでの距離、外れれば -1。
 * 始点が箱の中なら 0 で、法線は 0 ベクトルになる（面を跨いでいないため）。
 * 法線は `outNormal` に入れて返す（配列は使い回してよい。確保はしない）。
 *
 * `box` は原点 `(ox, oy, oz)` からの相対。ブロックならセルの座標、
 * モブなら足元の座標を渡す。**slab 法を写さないこと**（2 つ目の実装ができると、
 * 片方だけ直したときに「狙えるのに当たらない」形で静かに食い違う）。
 */
export function rayBox(
  origin: readonly number[],
  dir: readonly number[],
  box: readonly number[],
  ox: number,
  oy: number,
  oz: number,
  outNormal: number[],
): number {
  let near = 0;
  let far = Infinity;
  outNormal[0] = outNormal[1] = outNormal[2] = 0;

  for (let a = 0; a < 3; a++) {
    const cell = a === 0 ? ox : a === 1 ? oy : oz;
    const lo = cell + box[a];
    const hi = cell + box[a + 3];
    const o = origin[a];
    const d = dir[a];

    if (d === 0) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    // 入る側の面は、進む向きと逆を向いている
    const sign = d > 0 ? -1 : 1;
    let enter = (lo - o) / d;
    let exit = (hi - o) / d;
    if (enter > exit) {
      const swap = enter;
      enter = exit;
      exit = swap;
    }
    if (enter > near) {
      near = enter;
      outNormal[0] = outNormal[1] = outNormal[2] = 0;
      outNormal[a] = sign;
    }
    if (exit < far) far = exit;
    if (near > far) return -1;
  }

  return near;
}
