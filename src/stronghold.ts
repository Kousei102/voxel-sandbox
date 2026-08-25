/**
 * 要塞（エンドポータルのある建物）が**どこに建つか**と、投げたエンダーアイが
 * **どちらを向くか**。**判断だけのファイル**で、three も DOM も乱数も出てこない
 * （`portals.ts` / `beds.ts` / `portaltravel.ts` と同じ形。見張りは `test/stronghold.test.ts`）。
 *
 * **建てるのはまだこの先の周です**（TASKS 2-8）。ここにあるのは「どこに建つか」の
 * 規則だけで、**その規則を `structures.ts` の `SiteRule` として持っている**のが肝心です ——
 * 建てる側（あとの周が書く `StructureDef`）はこの `STRONGHOLD_SITE` をそのまま広げて
 * 使うので、**アイの指す先と実際に建つ場所が食い違いようがありません。**
 * 場所を 2 か所に写した瞬間、**アイの指す方角に何も無い**という形で静かに壊れます
 * （しかも地面の下なので、掘るまで気付けません）。
 *
 * **`projectiles.ts` は型でしか import しません**（`mobs.ts` と同じ作法）。
 * ここが持つのは「どこへ向けて投げるか」という注文（`Shot`）までで、飛び方は
 * あちらの表が決めます。
 */

import { cellOf, siteAt, type SiteRule } from "./structures";
import type { Shot } from "./projectiles";

/**
 * 何列（チャンク）ごとに 1 個か。**手触りの数値**（`TUNING.md`）。
 * 24 列 = 384 マスなので、原点からいちばん近い要塞はだいたい 150〜400 マス先になります。
 *
 * **本家の 1408 マス以遠にはしていません** —— 移動手段が歩きと泳ぎだけなので、
 * 片道 20 分の旅になります。ネザー要塞（ネザーの原点から 25〜34 マス
 * ＝ オーバーワールドの 200〜270 マス相当）と釣り合う距離にしてあります。
 */
export const STRONGHOLD_SPACING = 24;

/**
 * **必ず建ちます**（割合 1）。**下げないこと** —— 要塞はクリア導線の唯一の通り道なので、
 * 「近くのマスに建たなかった」が起きると、アイの指す先がいきなり 2 マス向こうの
 * グリッドまで飛びます。近さは `STRONGHOLD_SPACING` のほうで決めてください。
 */
export const STRONGHOLD_CHANCE = 1;

/** 種類ごとに変える散らしの種（ネザー要塞の `0x4f5254` と別であればよい）。 */
export const STRONGHOLD_SALT = 0x53544e48;

/**
 * 要塞の建つ場所の規則。**建てる側（TASKS 2-8）はこれを広げて `StructureDef` にすること。**
 * 写して別に持つと、アイの指す先に何も無くなります。
 */
export const STRONGHOLD_SITE: SiteRule = {
  spacing: STRONGHOLD_SPACING,
  chance: STRONGHOLD_CHANCE,
  salt: STRONGHOLD_SALT,
};

/**
 * 探すマスの広がり（自分の居るマスから ±これ）。**2 より小さくしないこと。**
 *
 * 割合が 1 なので自分の居るマスにも必ず 1 個あり、そこまでは**最悪でも
 * マスの対角 `cell * √2 ≒ 1.41 cell`**。一方 `|Δ|` マス離れたマスは、
 * いちばん近い側でも `(|Δ| - 1) * cell` は離れています。だから
 * **`STRONGHOLD_SEARCH * cell ≥ √2 * cell` を満たすところまで見れば、
 * その外に「もっと近い要塞」は絶対にありません。**
 *
 * **1 に落としても、たいていの場所では同じ答えが返ります** ——
 * 取りこぼすのはマスの角のごく狭い所だけで、1600 箇所を舐めて 1 件も出ませんでした。
 * だから**総当りとの突き合わせでは守れません**（実際に 1 に落として緑のまま通りました）。
 * 守っているのは `test/stronghold.test.ts` の
 * 「探す広さがマスの対角の最悪を超えている」のほうです。
 */
export const STRONGHOLD_SEARCH = 2;

/** 見つかった要塞 1 つ。**水平の位置だけ**（高さは建てる側が地面から決める）。 */
export interface StrongholdSite {
  readonly x: number;
  readonly z: number;
  /** 聞いた場所からの水平距離。 */
  readonly distance: number;
}

/**
 * いちばん近い要塞。**種は `worldSeed`**（`world.seed` はネザーだと塩を混ぜたあとの
 * 値なので、渡すと別の場所を指します。`rules/dimensions.md`）。
 *
 * 割合が 1 なら必ず見つかりますが、**null を返す道は残してあります** ——
 * 割合を下げた周に、呼ぶ側が黙って `(0, 0)` を指し始めないようにするためです。
 */
export function nearestStronghold(seed: number, x: number, z: number): StrongholdSite | null {
  const gx = cellOf(STRONGHOLD_SITE, x);
  const gz = cellOf(STRONGHOLD_SITE, z);
  let best: StrongholdSite | null = null;

  for (let dz = -STRONGHOLD_SEARCH; dz <= STRONGHOLD_SEARCH; dz++) {
    for (let dx = -STRONGHOLD_SEARCH; dx <= STRONGHOLD_SEARCH; dx++) {
      const site = siteAt(STRONGHOLD_SITE, seed, gx + dx, gz + dz);
      if (!site) continue;
      const distance = Math.hypot(site.x - x, site.z - z);
      if (!best || distance < best.distance) best = { x: site.x, z: site.z, distance };
    }
  }
  return best;
}

/** 要塞のほうを向く水平の単位ベクトル。 */
export interface StrongholdBearing {
  readonly dx: number;
  readonly dz: number;
  readonly distance: number;
}

/**
 * いちばん近い要塞のほうを向く向き。**真上に立っているときは null**
 * （向きが決まらないので、投げても飛ばさない）。
 */
export function strongholdDirection(
  seed: number,
  x: number,
  z: number,
): StrongholdBearing | null {
  const site = nearestStronghold(seed, x, z);
  if (!site || site.distance <= 0) return null;
  return {
    dx: (site.x - x) / site.distance,
    dz: (site.z - z) / site.distance,
    distance: site.distance,
  };
}

/**
 * 投げたアイが上へ向く量（水平を 1 としたときの比）。**手触りの数値**（`TUNING.md`）。
 * 0 にすると地面すれすれを飛ぶので、丘の向こうへ行った先が見えません。
 */
export const EYE_RISE = 0.35;

/**
 * エンダーアイを 1 個投げる注文。**向きは狙った方向ではなく要塞のほう**
 * （案内役なので、投げた人の視線は関係ありません）。
 *
 * `y` は投げ出す高さ（目の高さ）。**距離では出し分けません** ——
 * 「近づいた」を知らせるのは飛ぶ向きだけで、Minecraft のように地面へ落ちる
 * 演出は持っていません（`PROJECTILE_KINDS` の `eye` は寿命で消えます）。
 */
export function eyeShot(seed: number, x: number, y: number, z: number): Shot | null {
  const bearing = strongholdDirection(seed, x, z);
  if (!bearing) return null;
  return {
    kind: "eye",
    x,
    y,
    z,
    dx: bearing.dx,
    dy: EYE_RISE,
    dz: bearing.dz,
  };
}
