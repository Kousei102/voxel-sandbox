/**
 * エンドポータルの起動。**枠 12 個すべてにエンダーアイが嵌まると、輪の内側 3x3 が
 * ポータルの面になる**（TASKS 2-9）。**判断だけのファイル**で、three も DOM も
 * 乱数も出てこない（`portals.ts` / `beds.ts` / `stronghold.ts` と同じ形）。
 *
 * **`portals.ts` と分けてある理由:** あちらは「黒曜石の枠を探して火を点ける」で、
 * こちらは「もう建っている輪の状態を進める」。枠の探し方も点き方も共通点が無いので、
 * 1 ファイルに混ぜると `findFrame()` がどちらのポータルの話か読めなくなる。
 *
 * **輪の形はここが持ちません。** `stronghold.ts` の `RING_OFFSETS` / `RING_INSIDE` を
 * 読みます —— 建てる側と起動する側で写すと、輪の形を変えたときに
 * **「建っている輪では起動できない」**形で静かに壊れる（しかも地下 18 マスなので、
 * 掘って 12 個嵌めるまで気付けない）。
 */

import { END_PORTAL, endPortalFrame, frameFacing, frameHasEye, isEndPortalFrame } from "./blocks";
import type { PortalWorld } from "./portals";
import { RING_INSIDE, RING_OFFSETS } from "./stronghold";

/** `portals.ts` と同じ 2 つ（`getVoxel` / `setVoxel`）だけ。`World` は受け取らない。 */
export type EndPortalWorld = PortalWorld;

/** 見つかった輪 1 つ。 */
export interface EndPortalRing {
  /** 輪の中心（枠と同じ高さ）。 */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** **まだアイの嵌まっていない枠の数。** 0 なら起動できる。 */
  readonly missing: number;
}

/**
 * アイを嵌めた結果。
 *
 * - `none` —— 枠でない、または書き込めなかった（未読み込みの列）
 * - `already` —— もう嵌まっていた（**アイは減らさないこと**）
 * - `fitted` —— 1 個嵌まった
 *
 * `lit` は**この操作で新しくポータルの面になったマスの数**（0 なら起動していない）。
 * `remaining` は**輪にあと何個アイが要るか**で、12 個の枠が揃った輪が
 * 見つからなければ -1（＝ばらばらに置かれた枠を 1 個叩いた）。
 */
export interface EyeFit {
  readonly kind: "none" | "already" | "fitted";
  /** この操作で新しくポータルの面になったマスの数。 */
  readonly lit: number;
  /** 輪にあと何個アイが要るか。**輪が見つからなければ -1。** */
  readonly remaining: number;
}

const NOTHING: EyeFit = { kind: "none", lit: 0, remaining: -1 };

/**
 * その枠を含む輪のうち、**いちばん揃っているもの**。12 個そろった輪が無ければ null。
 *
 * **中心は枠の向きからは決まりません。** 輪の 1 辺に並ぶ 3 個は同じ向きを向いているので、
 * 向きだけを頼りにすると真ん中の 1 個しか当たらない。代わりに
 * **「自分がその輪のどの位置に居るか」を 12 通りとも試します**（`RING_OFFSETS` を
 * 引き算するだけなので、輪の形を変えても付いてくる）。
 */
export function ringAt(world: EndPortalWorld, x: number, y: number, z: number): EndPortalRing | null {
  let best: EndPortalRing | null = null;
  for (const [ox, oz] of RING_OFFSETS) {
    const cx = x - ox;
    const cz = z - oz;
    let frames = 0;
    let eyes = 0;
    for (const [dx, dz] of RING_OFFSETS) {
      const id = world.getVoxel(cx + dx, y, cz + dz);
      if (!isEndPortalFrame(id)) break;
      frames++;
      if (frameHasEye(id)) eyes++;
    }
    if (frames < RING_OFFSETS.length) continue;
    const missing = frames - eyes;
    if (!best || missing < best.missing) best = { x: cx, y, z: cz, missing };
  }
  return best;
}

/**
 * 輪の内側をポータルの面で埋める。**新しく埋まったマスの数**を返す。
 *
 * **書き込みが失敗しても続けること**（`portals.ts` の `ignite()` と同じ）——
 * 未読み込みの列では `setVoxel` が黙って false を返すので、そこで打ち切ると
 * 3x3 の半分だけが面になる。
 *
 * **内側に何が置いてあっても上書きします。** 枠が壊せない以上、輪の中にブロックを
 * 置いて起動を止められると、アイを 12 個使い切ったあとで詰みます。
 */
export function activate(world: EndPortalWorld, x: number, y: number, z: number): number {
  let lit = 0;
  for (const [dx, dz] of RING_INSIDE) {
    if (world.getVoxel(x + dx, y, z + dz) === END_PORTAL) continue;
    if (world.setVoxel(x + dx, y, z + dz, END_PORTAL)) lit++;
  }
  return lit;
}

/**
 * 狙った枠にエンダーアイを 1 個嵌める。**揃ったらそのまま起動する。**
 *
 * **アイを減らすかどうかは呼ぶ側**（`fitted` のときだけ）。向きは
 * **いま嵌まっている向きをそのまま使う**こと —— 嵌めるついでに向きを決め直すと、
 * 輪の 1 個だけが外を向いた状態を作れる（`endPortalFrame()` が唯一の入口）。
 *
 * **もう嵌まっていても輪は見ます。** 未読み込みの列で 3x3 の書き込みが落ちたときに、
 * もう一度叩けば続きが埋まる（嵌め直しにはならない）。
 */
export function fitEye(world: EndPortalWorld, x: number, y: number, z: number): EyeFit {
  const id = world.getVoxel(x, y, z);
  if (!isEndPortalFrame(id)) return NOTHING;

  const had = frameHasEye(id);
  if (!had && !world.setVoxel(x, y, z, endPortalFrame(frameFacing(id), true))) return NOTHING;

  const ring = ringAt(world, x, y, z);
  const lit = ring && ring.missing === 0 ? activate(world, ring.x, ring.y, ring.z) : 0;
  return { kind: had ? "already" : "fitted", lit, remaining: ring ? ring.missing : -1 };
}

/**
 * 画面に出す 1 行（`vitals.ts` の `deathMessage()` と同じ形）。何も起きなければ空。
 *
 * **`main.ts` に書き分けを戻さないこと。** 枠は地下 18 マスにしか無いので、
 * 文言の分岐がブラウザでしか確かめられない場所に居ると、掘り当てるまで直せない。
 *
 * **残り個数を必ず出すこと。** 12 個の枠は 5x5 の縁なので、嵌めたつもりで
 * 1 個飛ばしていても目では気付けない。輪が揃っていない（`remaining < 0`）ときは
 * 数が意味を持たないので出さない。
 */
export function eyeMessage(fit: EyeFit): string {
  if (fit.kind === "none") return "";
  if (fit.lit > 0) return "エンドポータルが起動した";
  if (fit.kind === "already") return "もうエンダーアイが嵌まっています";
  return fit.remaining > 0 ? `エンダーアイを嵌めた（残り ${fit.remaining} 個）` : "エンダーアイを嵌めた";
}
