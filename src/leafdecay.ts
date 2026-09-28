/**
 * 原木が無くなると葉が消える（52a）の**判断だけ**を持つ純関数。
 *
 * **どれが葉か・どれが原木かは `blocks.ts` の旗**（`isDecayingLeaf()` / `sustainsLeaves()`）に
 * 聞きます —— **`id === LEAVES` や `id === WOOD` をここに書かないこと**（木が増えるたびに漏れる）。
 * **消すのは `world.ts` の `setVoxel()`**、**落とす物は `breaking.ts` の `autoBreak()`** のままで、
 * ここは「どの葉が消えるか」を返すだけです。`World` を import しません（`crops.ts` の
 * `CropWorld` と同じ作法）。**乱数を使わないこと**（消える葉は決まった集合）。
 */

import { CHUNK_BITS } from "./constants";
import { isDecayingLeaf, sustainsLeaves } from "./blocks";

/**
 * 葉を伝って何歩まで原木が葉を支えるか（原木の隣の葉が 1 歩）。本家の Alpha / Beta の値。
 * **木の形のテストが割れたら、木の形ではなくこちらを 6（正式版の値）まで上げること**（`TUNING.md`）。
 */
export const LEAF_DECAY_DISTANCE = 4;

/** `decayedLeaves()` が読む世界。`World` がそのまま満たす。 */
export interface LeafWorld {
  getVoxel(x: number, y: number, z: number): number;
  /** その列のボクセルが生成済みか。**`getVoxel` は未読み込みで AIR を返す。** */
  hasColumn(cx: number, cz: number): boolean;
}

const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * (x,y,z) の原木が消えた**あと**に呼ぶ。そのマスから葉を伝って `LEAF_DECAY_DISTANCE` 歩以内の葉の
 * うち、**どの原木からも葉を伝って `LEAF_DECAY_DISTANCE` 歩以内に届かないもの**を、
 * x → y → z の昇順で返す。
 *
 * 支えを探すのは (x,y,z) を中心に ±`2 × LEAF_DECAY_DISTANCE` の箱の中だけ（候補から支えまでは
 * 最長でその距離）。**箱の列が 1 つでも未読み込みなら空を返す** —— 未読み込みの原木は
 * AIR に見えて、居るはずの支えを見落とすため（消し損ねるほうが安全）。
 */
export function decayedLeaves(world: LeafWorld, x: number, y: number, z: number): [number, number, number][] {
  const d = LEAF_DECAY_DISTANCE;
  const reach = 2 * d;
  for (let cx = (x - reach) >> CHUNK_BITS; cx <= (x + reach) >> CHUNK_BITS; cx++) {
    for (let cz = (z - reach) >> CHUNK_BITS; cz <= (z + reach) >> CHUNK_BITS; cz++) {
      if (!world.hasColumn(cx, cz)) return [];
    }
  }

  // 箱の中の座標を 1 つの数にする（箱の外は扱わない）。
  const size = 2 * reach + 1;
  const inBox = (px: number, py: number, pz: number): boolean =>
    Math.abs(px - x) <= reach && Math.abs(py - y) <= reach && Math.abs(pz - z) <= reach;
  const key = (px: number, py: number, pz: number): number =>
    ((px - x + reach) * size + (py - y + reach)) * size + (pz - z + reach);

  // 1. 候補: 切ったマスの 6 近傍から、葉だけを伝って d 歩以内の葉。
  const candidates = new Map<number, [number, number, number]>();
  let frontier: [number, number, number][] = [[x, y, z]];
  for (let step = 1; step <= d && frontier.length > 0; step++) {
    const next: [number, number, number][] = [];
    for (const [px, py, pz] of frontier) {
      for (const [dx, dy, dz] of STEPS) {
        const nx = px + dx;
        const ny = py + dy;
        const nz = pz + dz;
        const k = key(nx, ny, nz);
        if (candidates.has(k) || !isDecayingLeaf(world.getVoxel(nx, ny, nz))) continue;
        const cell: [number, number, number] = [nx, ny, nz];
        candidates.set(k, cell);
        next.push(cell);
      }
    }
    frontier = next;
  }
  if (candidates.size === 0) return [];

  // 2. 支え: 箱の中の原木を全部起点にして、葉だけを伝う多点の幅優先を d 歩まで。
  const supported = new Set<number>();
  frontier = [];
  for (let px = x - reach; px <= x + reach; px++) {
    for (let py = y - reach; py <= y + reach; py++) {
      for (let pz = z - reach; pz <= z + reach; pz++) {
        if (sustainsLeaves(world.getVoxel(px, py, pz))) frontier.push([px, py, pz]);
      }
    }
  }
  for (let step = 1; step <= d && frontier.length > 0; step++) {
    const next: [number, number, number][] = [];
    for (const [px, py, pz] of frontier) {
      for (const [dx, dy, dz] of STEPS) {
        const nx = px + dx;
        const ny = py + dy;
        const nz = pz + dz;
        if (!inBox(nx, ny, nz)) continue;
        const k = key(nx, ny, nz);
        if (supported.has(k) || !isDecayingLeaf(world.getVoxel(nx, ny, nz))) continue;
        supported.add(k);
        next.push([nx, ny, nz]);
      }
    }
    frontier = next;
  }

  // 3. 届かなかった候補を、決まった順で。
  const out: [number, number, number][] = [];
  for (const [k, cell] of candidates) if (!supported.has(k)) out.push(cell);
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return out;
}
