/**
 * 形の検査。**地形（`mesher.test.ts`）とモブ（`mobs.test.ts`）が共有する。**
 *
 * 面の裏返りは「面が丸ごと消える」形でしか画面に出ず、この環境では見られない。
 * だから数値に落として押さえている。**写して 2 か所にしないこと**
 * （片方だけ緩めても気付けなくなる）。
 */

import type { MeshArrays } from "../src/meshbuild";
import { check } from "./harness";

function vertexAt(mesh: MeshArrays, i: number): [number, number, number] {
  return [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
}

/**
 * 三角形の頂点順から求めた法線が、格納された法線と一致するか。
 * ここがずれると裏面カリングで面が消える（GPU 無しでは気付けない不具合）。
 *
 * `center` を渡すと、面が中心から外を向いているかも見る。
 */
export function verifyWinding(
  label: string,
  mesh: MeshArrays,
  center: [number, number, number] | null,
): void {
  let badNormal = 0;
  let inward = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [ia, ib, ic] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    const [ax, ay, az] = vertexAt(mesh, ia);
    const [bx, by, bz] = vertexAt(mesh, ib);
    const [cx, cy, cz] = vertexAt(mesh, ic);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const sx = mesh.normals[ia * 3];
    const sy = mesh.normals[ia * 3 + 1];
    const sz = mesh.normals[ia * 3 + 2];
    if ((nx / len) * sx + (ny / len) * sy + (nz / len) * sz < 0.99) badNormal++;
    if (center) {
      const mx = (ax + bx + cx) / 3 - center[0];
      const my = (ay + by + cy) / 3 - center[1];
      const mz = (az + bz + cz) / 3 - center[2];
      if (mx * sx + my * sy + mz * sz <= 0) inward++;
    }
  }
  check(
    `${label}: 頂点順と法線が一致`,
    badNormal === 0,
    `${mesh.indices.length / 3} 三角形中 ${badNormal} 件ずれ`,
  );
  if (center) check(`${label}: 面が外を向く`, inward === 0, inward ? `${inward} 件が内向き` : "");
}

/**
 * 発散定理で求めた符号つき体積。閉じた面がすべて外を向いていれば中身の体積になり、
 * 1 面でも裏返っていれば値がずれる。
 */
export function signedVolume(mesh: MeshArrays): number {
  let sum = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [ax, ay, az] = vertexAt(mesh, mesh.indices[t]);
    const [bx, by, bz] = vertexAt(mesh, mesh.indices[t + 1]);
    const [cx, cy, cz] = vertexAt(mesh, mesh.indices[t + 2]);
    sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return sum / 6;
}
