import { AIR, GLASS, STONE, WATER } from "../src/blocks";
import { CHUNK_SIZE, MAX_LIGHT } from "../src/constants";
import { PAD_VOLUME, buildChunkMesh, padIndex, type MeshArrays } from "../src/mesher";
import { check, describe } from "./harness";

const pad = new Uint8Array(PAD_VOLUME);
// 明るさを一律に最大にしておく。光そのものの検証は lighting.test.ts で行う。
const lightPad = new Uint8Array(PAD_VOLUME).fill(MAX_LIGHT);
const put = (x: number, y: number, z: number, id: number) => {
  pad[padIndex(x, y, z)] = id;
};

/**
 * 三角形の頂点順から求めた法線が、格納された法線と一致するか。
 * ここがずれると裏面カリングで面が消える（GPU 無しでは気付けない不具合）。
 */
function verifyWinding(label: string, mesh: MeshArrays, center: [number, number, number] | null) {
  let badNormal = 0;
  let inward = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [ia, ib, ic] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    const at = (i: number) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    const [ax, ay, az] = at(ia);
    const [bx, by, bz] = at(ib);
    const [cx, cy, cz] = at(ic);
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
  check(`${label}: 頂点順と法線が一致`, badNormal === 0, `${mesh.indices.length / 3} 三角形中 ${badNormal} 件ずれ`);
  if (center) check(`${label}: 面が外を向く`, inward === 0, inward ? `${inward} 件が内向き` : "");
}

export function run(): void {
  describe("メッシュ化 (greedy meshing)");

  pad.fill(AIR);
  check("空のチャンクは面ゼロ", buildChunkMesh(pad, lightPad).opaque === null);

  pad.fill(STONE);
  check("完全に埋まったチャンクも面ゼロ", buildChunkMesh(pad, lightPad).opaque === null);

  pad.fill(AIR);
  put(5, 5, 5, STONE);
  const single = buildChunkMesh(pad, lightPad).opaque!;
  check("孤立ブロックは 6 面 12 三角形", single.indices.length / 3 === 12);
  check("孤立ブロックの頂点は 24", single.positions.length / 3 === 24);
  verifyWinding("孤立ブロック", single, [5.5, 5.5, 5.5]);

  // 3 軸それぞれで統合が効くか
  for (const axis of [0, 1, 2] as const) {
    pad.fill(AIR);
    for (let a = 2; a < 10; a++) {
      for (let b = 2; b < 10; b++) {
        const p = [0, 0, 0];
        p[axis] = 6;
        p[(axis + 1) % 3] = a;
        p[(axis + 2) % 3] = b;
        put(p[0], p[1], p[2], STONE);
      }
    }
    const mesh = buildChunkMesh(pad, lightPad).opaque!;
    const center: [number, number, number] = [6, 6, 6];
    center[axis] = 6.5;
    const name = `軸 ${"XYZ"[axis]} の 8x8 平板`;
    check(`${name}が 12 三角形に統合される`, mesh.indices.length / 3 === 12, `${mesh.indices.length / 3} 三角形（未統合なら 768）`);
    verifyWinding(name, mesh, center);
  }

  // AO: 隣に壁が立つと根元が暗くなる
  pad.fill(AIR);
  for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) put(x, 0, z, STONE);
  const flat = buildChunkMesh(pad, lightPad).opaque!;
  check("平らな床は 1 枚に統合される", flat.indices.length / 3 === 12);
  put(0, 1, 0, STONE);
  const shaded = buildChunkMesh(pad, lightPad).opaque!;
  const tones = new Set<number>();
  for (let i = 0; i < shaded.colors.length; i += 4) {
    if (shaded.normals[(i / 4) * 3 + 1] === 1) tones.add(Math.round(shaded.colors[i] * 1000));
  }
  check("遮蔽物があると上面に AO の明暗が出る", tones.size > 1, `明度 ${tones.size} 段階`);
  check("AO のせいで統合が過剰に崩れない", shaded.indices.length / 3 < 40, `${shaded.indices.length / 3} 三角形`);

  // 半透明の分離
  pad.fill(AIR);
  for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) put(x, 0, z, WATER);
  put(8, 0, 8, GLASS);
  const layered = buildChunkMesh(pad, lightPad);
  check("水とガラスは半透明レイヤーに分かれる", layered.opaque === null && layered.translucent !== null);
  check("半透明の頂点アルファが 1 未満", layered.translucent!.colors[3] < 1, `${layered.translucent!.colors[3].toFixed(2)}`);

  // 同じ半透明同士の境界は面を作らない（水の中が真っ白にならない）
  pad.fill(AIR);
  for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) put(x, y, z, WATER);
  const block = buildChunkMesh(pad, lightPad).translucent!;
  check("水塊の内部に面が出ない", block.indices.length / 3 === 12, `${block.indices.length / 3} 三角形`);

  // 不透明に隣接する水の面は消える
  pad.fill(AIR);
  put(1, 1, 1, WATER);
  put(1, 0, 1, STONE);
  const overStone = buildChunkMesh(pad, lightPad).translucent!;
  check("石に接する水の底面は省かれる", overStone.indices.length / 3 === 10, `${overStone.indices.length / 3} 三角形`);

  // ランダムな塊で全体の健全性
  pad.fill(AIR);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 900; i++) {
    put(
      Math.floor(rnd() * CHUNK_SIZE),
      Math.floor(rnd() * CHUNK_SIZE),
      Math.floor(rnd() * CHUNK_SIZE),
      rnd() < 0.8 ? STONE : WATER,
    );
  }
  const noisy = buildChunkMesh(pad, lightPad);
  verifyWinding("ランダムな塊(不透明)", noisy.opaque!, null);
  verifyWinding("ランダムな塊(半透明)", noisy.translucent!, null);

  for (const [name, mesh] of [
    ["不透明", noisy.opaque!],
    ["半透明", noisy.translucent!],
  ] as const) {
    const verts = mesh.positions.length / 3;
    check(`${name}: 座標がチャンク内に収まる`, mesh.positions.every((v) => v >= 0 && v <= CHUNK_SIZE));
    check(`${name}: index が頂点数の範囲内`, mesh.indices.every((i) => i < verts));
    check(`${name}: 色が 0..1`, mesh.colors.every((v) => v >= 0 && v <= 1));
    check(`${name}: 法線が軸に平行な単位ベクトル`, mesh.normals.every((v) => v === 0 || Math.abs(v) === 1));
    check(`${name}: 四角形として整合`, verts % 4 === 0 && mesh.indices.length / 6 === verts / 4);
  }
}
