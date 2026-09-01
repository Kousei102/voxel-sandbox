/**
 * 支えを失った砂・砂利が、その場で下まで落ちて積み直す。**判断は全部ここにある。**
 *
 * `liquids.ts` と `blocks.ts` の `quenched()` の対がそのまま手本 —— **どの ID が
 * 落ちるか**は `blocks.ts` の `fallsDown()`（座標を知らない純粋な表）、**どのマスに
 * 効くか**はここ 1 か所。`World` を丸ごと受け取らず `getVoxel` / `setVoxel` の
 * 2 つだけを受ける（`liquids.ts` / `beds.ts` と同じ作法）。
 *
 * **落下は即時。** 1 フレームで下まで積み直し、落下エンティティは作らない
 * （`CLAUDE.md` の「この環境では WebGL が動かない」―見た目は確かめられない）。
 * `world.update()` や生成器からは呼ばない —— 呼ぶのは `breaking.ts` の `tryBreak()`
 * と `placing.ts` の `tryPlace()` だけ。
 */

import { AIR, fallsDown, isReplaceable } from "./blocks";

/** `World` のうち、重力の反応が使う入口だけ。**丸ごと受け取らないこと**。 */
export interface GravityWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
}

/**
 * (x, y, z) に居るとして、そこから下へ `isReplaceable()` の間だけ下がった先の y。
 * 空気・水・溶岩・草むらは通り抜ける。**下限は y = 1**（世界の底より下へは落ちない）。
 *
 * 座標は 3 つだけ受け取り、`getVoxel` は呼ぶ側から渡してもらう —— `settleColumn()` が
 * `GravityWorld` を経由せずこの関数を使い回せるようにするため。
 */
export function landingY(
  getVoxel: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
): number {
  let landing = y;
  while (landing > 1 && isReplaceable(getVoxel(x, landing - 1, z))) landing--;
  return landing;
}

/**
 * (x, y, z) を起点に、そこ自身（あるいはその真上）から積まれた `fallsDown` の列を
 * 下から順に詰め直す。動かした個数を返す。
 *
 * **2 つの呼び方を 1 本で兼ねる:**
 * - `breaking.ts`: `(x,y,z)` は掘って空けたマス（`fallsDown` ではない）。
 *   真上に積まれた砂・砂利が、その分だけ 1 つずつ下がる。
 * - `placing.ts`: `(x,y,z)` は置いたばかりのマス（`fallsDown` そのもの）。
 *   支えが無ければ、地面（または水底）まで一気に落ちる。
 *
 * どちらも「起点から `fallsDown` が連続する範囲」を 1 個の塊として扱い、
 * その塊がまとめて `landingY()` の高さまで沈む——という同じ規則で説明できる。
 *
 * **上へ走査するのは `fallsDown` でないものに当たるまで。** 塊の外は触らない。
 */
export function settleColumn(world: GravityWorld, x: number, y: number, z: number): number {
  const getVoxel = (xx: number, yy: number, zz: number) => world.getVoxel(xx, yy, zz);

  // 塊の底: (x,y,z) 自身が fallsDown ならそこ、そうでなければ 1 つ上から。
  const bottom = fallsDown(getVoxel(x, y, z)) ? y : y + 1;
  if (!fallsDown(getVoxel(x, bottom, z))) return 0;

  // 塊の天井: 連続する fallsDown が途切れるところまで。
  let top = bottom;
  while (fallsDown(getVoxel(x, top + 1, z))) top++;

  // 塊がまとめて沈む先。**塊の底が今どこまで下がれるか**を見る。
  const floor = landingY(getVoxel, x, bottom, z);
  const offset = bottom - floor;
  if (offset <= 0) return 0;

  // **先に落ちる先へ書き、成功したときだけ元のマスを消すこと**（`liquids.ts` と同じ約束）。
  // 底から順に処理すれば、書き込み先は必ず「まだ何も置いていないマス」か
  // 「1 つ前の反復ですでに空けたマス」になる。
  let moved = 0;
  for (let i = bottom; i <= top; i++) {
    const id = world.getVoxel(x, i, z);
    if (!world.setVoxel(x, i - offset, z, id)) break;
    world.setVoxel(x, i, z, AIR);
    moved++;
  }
  return moved;
}
