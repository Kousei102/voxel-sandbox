/**
 * エンドクリスタルの生き死に。**判断は全部ここ。**
 *
 * three も DOM も乱数も出てこないので、丸ごとヘッドレスで検証できる
 * （`portals.ts` / `beds.ts` / `endportal.ts` / `stronghold.ts` と同じ形。
 * 見張りは `test/crystals.test.ts`）。
 *
 * **クリスタルはモブでも独立した器でもなく、ブロック（`END_CRYSTAL`）。**
 * 「柱の上に載る・壊せる」しか要らないのに、モブに載せると
 *
 * - **湧き・歩き・デスポーンの 3 つを止める**ことになる（表に「止める」印が 3 つ増える）
 * - **モブは保存しない**ので、壊したクリスタルが読み込み直しで生き返る
 *   —— ドラゴンの回復（2-13）が読み込みのたびに戻ってしまう
 *
 * 独立した器（`crystals.ts` + `crystalrender.ts`）にすれば保存は持てるが、
 * **当たり判定と描画を自分で書くことになり、「確かめられないもの」が 1 つ増える。**
 * ブロックなら壊した記録が `edits` に乗り（＝保存が要らない）、掘るのも
 * 飛び道具（`projectiles.onHitBlock`）ももともとブロックに当たる。
 *
 * だからこのファイルは**器ではなく、ワールドに聞く関数の集まり**になっている。
 * 毎フレーム進むものが無いので `update(dt)` も持たない（`chests.ts` と同じ）。
 *
 * **居場所（`CRYSTAL_SPOTS`）は `endgen.ts` が持つ。** 写して 2 か所に持たないこと ——
 * 柱の並びを動かしたときに、**柱の無い所のクリスタルを探し続ける**形で静かに壊れる。
 */

import { AIR, END_CRYSTAL } from "./blocks";
import { columnOf } from "./constants";
import { CRYSTAL_SPOTS, type CrystalSpot } from "./endgen";

/**
 * 読むのに要るもの。**`World` を丸ごと受け取らない**（`beds.ts` と同じ作法）。
 *
 * **`hasColumn` を外さないこと。** 未読み込みの列では `getVoxel` が AIR を返すので、
 * 「生きているクリスタルを砕けたと読む」ことになる（かまどの `syncLit()` /
 * ベッドの `moveToSpawn()` とまったく同じ罠）。
 */
export interface CrystalReader {
  getVoxel(x: number, y: number, z: number): number;
  hasColumn(cx: number, cz: number): boolean;
}

/** 書き換えるのに要るもの。**壊すのはプレイヤーの操作なので `edits` に乗る。** */
export interface CrystalWorld extends CrystalReader {
  setVoxel(x: number, y: number, z: number, id: number): boolean;
}

/**
 * 1 個ぶんの様子。
 *
 * - `alive` — 列が読めていて、そこにクリスタルがある
 * - `gone` — 列が読めていて、もう無い（誰かが砕いた）
 * - `unknown` — その列がまだ読み込まれていない（**無いとは限らない**）
 */
export type CrystalState = "alive" | "gone" | "unknown";

export interface CrystalStatus {
  readonly spot: CrystalSpot;
  readonly state: CrystalState;
}

/** クリスタルの総数（＝柱の本数）。 */
export const CRYSTAL_COUNT = CRYSTAL_SPOTS.length;

/**
 * 全部の様子。**居場所は `endgen.ts` の表そのもの**なので、柱を動かせば付いてくる。
 */
export function crystalStates(world: CrystalReader): CrystalStatus[] {
  return CRYSTAL_SPOTS.map((spot) => ({ spot, state: crystalState(world, spot) }));
}

/** 1 個の様子。 */
export function crystalState(world: CrystalReader, spot: CrystalSpot): CrystalState {
  if (!world.hasColumn(columnOf(spot.x), columnOf(spot.z))) return "unknown";
  return world.getVoxel(spot.x, spot.y, spot.z) === END_CRYSTAL ? "alive" : "gone";
}

/**
 * いま生きていると**確かめられた**もの。**ドラゴンの回復（2-13）はここを見ること。**
 *
 * **`unknown` は数えない。** 数えると、エンドに降りた直後（遠くの列がまだ
 * 読み込まれていない）に、砕いたはずのクリスタルからドラゴンが回復し続ける。
 * 逆に取りこぼしても、列が届いた次のフレームには数え直される。
 */
export function liveCrystals(world: CrystalReader): CrystalSpot[] {
  return CRYSTAL_SPOTS.filter((spot) => crystalState(world, spot) === "alive");
}

/**
 * そのマスのクリスタルを砕く。**砕けたら消えたブロックの ID**、
 * そうでなければ `AIR`（何も起きなかった）。
 *
 * **居場所の表とは突き合わせない。** 見るのはそのマスに実際に何があるかだけで、
 * クリエイティブで柱の外に置いたものも同じように砕ける（置けるものが
 * 場所によって壊せたり壊せなかったりするほうが不可解）。
 *
 * 呼ぶのは飛び道具が当たったとき（`main.ts` の `projectiles.onHitBlock`）。
 * 掘って壊すぶんは `breakBlock()` がもともと通るので、ここには来ない。
 */
export function shatterCrystal(
  world: CrystalWorld,
  x: number,
  y: number,
  z: number,
): number {
  if (world.getVoxel(x, y, z) !== END_CRYSTAL) return AIR;
  return world.setVoxel(x, y, z, AIR) ? END_CRYSTAL : AIR;
}
