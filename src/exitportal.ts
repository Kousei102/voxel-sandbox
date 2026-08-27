/**
 * エンドの出口ポータル。**ドラゴンを倒した印**そのもの。**判断は全部ここ。**
 *
 * three も DOM も乱数も出てこないので、丸ごとヘッドレスで検証できる
 * （`crystals.ts` / `endportal.ts` / `beds.ts` / `stronghold.ts` と同じ形。
 * 見張りは `test/exitportal.test.ts`）。
 *
 * **印をワールド（＝`edits`）に持たせているのが肝心。** エンドクリスタルを
 * モブではなくブロックにしたのとまったく同じ筋で、
 *
 * - **読み込み直しても残る**（モブは保存しないので、`Mobs` 側の記憶は `clear()` で消える）
 * - **新しいセーブのキーが要らない**（`SaveData.version` は 1 のまま）
 * - **印がそのまま帰り道**になる —— 倒した合図と出口を 2 つ持つと、片方だけ
 *   建った状態を作れる
 *
 * だから `Mobs.ensureBoss()` は「この印が立っているなら湧かせない」を見るだけでよく、
 * **エンドに入り直してもドラゴンは湧き直さない。**
 *
 * `crystals.ts` と同じで**器ではなく、ワールドに聞く関数の集まり**。毎フレーム
 * 進むものが無いので `update(dt)` も持たない。
 *
 * **居場所（`EXIT_PORTAL_SPOT`）は `endgen.ts` が持つ。** 写して 2 か所に持たないこと ——
 * そこが平らな地面だと保証しているのはあのファイルで、離れると**面が崖の途中に
 * 建って踏めない**という形で静かに壊れる。
 */

import { END_PORTAL, OBSIDIAN } from "./blocks";
import { columnOf } from "./constants";
import { EXIT_PORTAL_SPOT } from "./endgen";

/** 読むのに要るもの。**`World` を丸ごと受け取らない**（`crystals.ts` と同じ作法）。 */
export interface ExitPortalReader {
  getVoxel(x: number, y: number, z: number): number;
  hasColumn(cx: number, cz: number): boolean;
}

/** 建てるのに要るもの。**倒したのはプレイヤーなので `edits` に乗ってよい。** */
export interface ExitPortalWorld extends ExitPortalReader {
  setVoxel(x: number, y: number, z: number, id: number): boolean;
}

/** 面の広さ（中心から何マスか）。1 なら 3x3。 */
export const EXIT_PORTAL_RADIUS = 1;

export interface PortalCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 面になるマス。**中心は `endgen.ts` の表から引く**（写していない）。
 *
 * 3x3 なのは要塞のエンドポータル（`stronghold.ts` の `RING_INSIDE`）と同じ大きさに
 * 揃えてあるため —— 行きと帰りで面の大きさが違うと、片方だけ踏み外す。
 */
export const EXIT_PORTAL_CELLS: readonly PortalCell[] = (() => {
  const cells: PortalCell[] = [];
  for (let dz = -EXIT_PORTAL_RADIUS; dz <= EXIT_PORTAL_RADIUS; dz++) {
    for (let dx = -EXIT_PORTAL_RADIUS; dx <= EXIT_PORTAL_RADIUS; dx++) {
      cells.push({
        x: EXIT_PORTAL_SPOT.x + dx,
        y: EXIT_PORTAL_SPOT.y,
        z: EXIT_PORTAL_SPOT.z + dz,
      });
    }
  }
  return cells;
})();

/**
 * 印の様子。
 *
 * - `built` — **9 マスとも面になっている**（倒した印が立っている）
 * - `gone` — 列は読めていて、面が欠けている（まだ倒していない／書き込みが途中で落ちた）
 * - `unknown` — 列がまだ読み込まれていない（**無いとは限らない**）
 */
export type ExitPortalState = "built" | "gone" | "unknown";

/**
 * いまの様子。**`hasColumn` を外さないこと** —— 未読み込みの列では `getVoxel` が
 * AIR を返すので、**倒した人のエンドにドラゴンをもう 1 体湧かせる**ことになる
 * （かまどの `syncLit()` / クリスタルの `crystalState()` と同じ罠）。
 *
 * **9 マスとも見るのが肝心。** 中心 1 マスだけで決めると、書き込みが途中で落ちた
 * 穴あきの面が「建っている」ことになり、**二度と埋まらない。**
 */
export function exitPortalState(world: ExitPortalReader): ExitPortalState {
  let missing = false;
  for (const cell of EXIT_PORTAL_CELLS) {
    if (!world.hasColumn(columnOf(cell.x), columnOf(cell.z))) return "unknown";
    if (world.getVoxel(cell.x, cell.y, cell.z) !== END_PORTAL) missing = true;
  }
  return missing ? "gone" : "built";
}

/**
 * 面を建てる。**全部書けたら true**（未読み込みの列では `setVoxel` が黙って失敗するので、
 * 呼ぶ側は次のフレームにまた試すことになる）。
 *
 * **床（黒曜石）を先に置くこと。** 面は通り抜けられるので、下を掘られていると
 * 踏んだ人が抜けて虚空へ落ちる。**上書きでかまわない** —— 島の上面はここでは
 * 必ず `ISLAND_SURFACE` なので、埋めるのは掘られた穴か地面 1 マスだけ。
 */
export function buildExitPortal(world: ExitPortalWorld): boolean {
  let ok = true;
  for (const cell of EXIT_PORTAL_CELLS) {
    if (!world.setVoxel(cell.x, cell.y - 1, cell.z, OBSIDIAN)) ok = false;
    if (!world.setVoxel(cell.x, cell.y, cell.z, END_PORTAL)) ok = false;
  }
  return ok;
}

/**
 * 1 フレームぶん。**倒したなら建て、立っている印を答える**（`main.ts` はこの返り値を
 * `Mobs.ensureBoss()` へ渡すだけ）。返すのは**「ボスを湧かせてはいけないか」。**
 *
 * かまどの `syncLit()` と同じ形にしてある —— ワールドに書くのは呼ぶ側（`main.ts`）
 * ではなくこちらで、**書けなかったぶんは次のフレームに持ち越す。**
 *
 * **読めない列を「印が無い」と答えないこと。** 答えると、着いた 1 フレーム目に
 * ドラゴンがもう 1 体湧く。分からないうちは湧かせないほうが安全側で、
 * 取りこぼしても列が届いた次のフレームに湧く。
 *
 * `defeated` が false のあいだは**1 マスも書かない**ので、ボスの居ない次元で
 * 毎フレーム呼んでも何も起きない。
 */
export function syncExitPortal(world: ExitPortalWorld, defeated: boolean): boolean {
  const state = exitPortalState(world);
  if (state === "built") return true;
  if (state === "unknown") return true;
  if (!defeated) return false;
  buildExitPortal(world);
  return true;
}
