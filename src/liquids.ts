/**
 * 液体を置いた結果、周りとどう反応するか。**判断は全部ここにある。**
 *
 * three にも DOM にも触らないので丸ごとヘッドレスで検証できる
 * （見張りは `test/liquids.test.ts`）。`beds.ts` と同じ「判断だけを持つが
 * ワールドは書き換える」ファイル —— 水と溶岩をぶつけるのはプレイヤーの操作そのもので、
 * `edits` に乗るべきものだから。その代わり `World` を丸ごと受け取らず、
 * **使う 2 つの入口だけ**を受け取る。
 *
 * **何が何に変わるかはここには無い**（`blocks.ts` の `quenched()`）。
 * ここが持つのは「どのマスに効くか」だけ。
 */

import { OFFSETS } from "./lighting";
import { quenched } from "./blocks";

/**
 * `World` のうち、液体の反応が使う入口だけ。**丸ごと受け取らないこと**
 * （`beds.ts` の `BedWorld` と同じ理由）。
 */
export interface LiquidWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
}

/**
 * 置いたばかりの液体と、その隣 6 マスを固める。固まったマスの数を返す。
 *
 * **置いたマス自身と隣の両方を見ること。** 片方だけだと、
 * 「溶岩に水をかける」と「水に溶岩を流す」のどちらかだけが効く形になる。
 *
 * **書き込みが失敗しても続けること。** 未読み込みの列では `setVoxel` が黙って
 * false を返すので、そこで打ち切ると同じ操作で固まる数が場所によって変わる。
 */
export function quenchAround(world: LiquidWorld, x: number, y: number, z: number): number {
  const placed = world.getVoxel(x, y, z);
  let hardened = 0;

  for (const [dx, dy, dz] of OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    const neighbour = world.getVoxel(nx, ny, nz);

    // 隣が固まる側（水を置いた → 隣の溶岩が黒曜石）。
    const next = quenched(neighbour, placed);
    if (next !== neighbour && world.setVoxel(nx, ny, nz, next)) hardened++;
  }

  // 置いたほうが固まる側（溶岩を流した → 流したそれ自身が黒曜石）。
  // **置いたブロックは先に控えてある**（`placed`）。このループでこのマス自身が
  // 黒曜石に変わるので、隣を見るときに読み直すと「流した溶岩」ではなく
  // 「できた黒曜石」を隣にぶつけることになる。
  for (const [dx, dy, dz] of OFFSETS) {
    const self = quenched(placed, world.getVoxel(x + dx, y + dy, z + dz));
    if (self !== placed) {
      if (world.setVoxel(x, y, z, self)) hardened++;
      break;
    }
  }

  return hardened;
}
