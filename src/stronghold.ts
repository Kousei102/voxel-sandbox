/**
 * 要塞（エンドポータルのある建物）が**どこに建つか・どんな形か**と、
 * 投げたエンダーアイが**どちらを向くか**。**判断だけのファイル**で、
 * three も DOM も乱数も出てきません
 * （`portals.ts` / `beds.ts` / `portaltravel.ts` と同じ形。見張りは `test/stronghold.test.ts`）。
 *
 * **建てる規則と指す規則を同じファイルの同じ `SiteRule` から引いている**のが肝心です ——
 * `STRONGHOLD`（`StructureDef`）は `STRONGHOLD_SITE` を広げただけなので、
 * **アイの指す先と実際に建つ場所が食い違いようがありません。**
 * 場所を 2 か所に写した瞬間、**アイの指す方角に何も無い**という形で静かに壊れます
 * （しかも地面の下なので、掘るまで気付けません）。
 *
 * **`projectiles.ts` は型でしか import しません**（`mobs.ts` と同じ作法）。
 * ここが持つのは「どこへ向けて投げるか」という注文（`Shot`）までで、飛び方は
 * あちらの表が決めます。
 */

import {
  AIR,
  FACE_XN,
  FACE_XP,
  FACE_ZN,
  FACE_ZP,
  STONE_BRICK,
  endPortalFrame,
  torchVariant,
} from "./blocks";
import { cellOf, siteAt, type Placement, type Put, type SiteRule, type StructureDef } from "./structures";
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

// ---------------------------------------------------------------------------
// 要塞の形（`structures.ts` の器に乗る建物）
//
// **いまはエンドポータルの部屋 1 つだけです**（通路も階段も部屋も無い。
// TASKS 2-8 は「クリアできる最小」で止めています）。掘って降りれば辿り着けて、
// 枠 12 個が揃っている、というところまで。
// ---------------------------------------------------------------------------

/**
 * 部屋の外壁までの半径。外側は `HALF * 2 + 1` = 13 マス四方、内側は 11 マス四方。
 *
 * **狭くしないこと。** 投げたアイは「その辺り」までしか案内してくれない
 * （近づくと落ちる仕掛けが無い）ので、掘り当てる的が小さいと詰みに近くなります。
 */
export const STRONGHOLD_HALF = 6;

/** 床の上に空ける高さ（内側は `y + 1` から `y + HEIGHT`）。天井はその 1 つ上。 */
export const STRONGHOLD_HEIGHT = 4;

/**
 * 地面から何マス下に**床**を置くか（`lift` の絶対値）。**手触りの数値**（`TUNING.md`）。
 *
 * **深くしすぎないこと。** 地形のいちばん低い所は実測で高さ 25 前後なので、
 * ここを 24 以上にすると海の底の要塞が岩盤（y = 0）を突き抜けて床が欠けます。
 * **浅くしすぎないこと。** 天井（床 + 5）から地表までの土かぶりが薄いと、
 * 少し掘っただけで部屋が露出して「地下の建物」に見えません。
 */
export const STRONGHOLD_DEPTH = 18;

/** エンドポータルの輪の半径。5x5 の四隅を落とすと 12 個になる（Minecraft と同じ）。 */
export const STRONGHOLD_RING = 2;
/** 輪に並ぶ枠の数。**12 個ちょうどでなければならない**（アイも 12 個で足りる）。 */
export const STRONGHOLD_FRAMES = 12;

/**
 * 輪の中の位置 `(dx, dz)` から、**中心を向く水平の面番号**。
 *
 * 輪の上では `|dx|` と `|dz|` のどちらか一方だけが `STRONGHOLD_RING` なので、
 * 大きいほうの軸で決めれば必ず内向きになる。
 */
function facingToCentre(dx: number, dz: number): number {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? FACE_XN : FACE_XP;
  return dz > 0 ? FACE_ZN : FACE_ZP;
}

/** 輪の上のマスか（5x5 の縁のうち四隅を除いた 12 マス）。 */
function onRing(dx: number, dz: number): boolean {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  return Math.max(ax, az) === STRONGHOLD_RING && !(ax === STRONGHOLD_RING && az === STRONGHOLD_RING);
}

/** 部屋の殻（床・天井・4 面の壁）を石レンガで、中を空気で埋める。 */
function shell(place: Placement, put: Put): void {
  const top = STRONGHOLD_HEIGHT + 1;
  for (let dy = 0; dy <= top; dy++) {
    for (let dz = -STRONGHOLD_HALF; dz <= STRONGHOLD_HALF; dz++) {
      for (let dx = -STRONGHOLD_HALF; dx <= STRONGHOLD_HALF; dx++) {
        const wall =
          dy === 0 ||
          dy === top ||
          Math.abs(dx) === STRONGHOLD_HALF ||
          Math.abs(dz) === STRONGHOLD_HALF;
        // **必ず空気も書くこと。** 書かないと、山の中に建った部屋が石で埋まったままになる
        // （ネザー要塞が頭上を空けているのと同じ理由）。
        put(place.x + dx, place.y + dy, place.z + dz, wall ? STONE_BRICK : AIR);
      }
    }
  }
}

/**
 * エンドポータルの枠 12 個。**床の 1 つ上**（＝立つ高さ）に輪を置き、
 * **真ん中の 3x3 は空気のまま**にする（起動するとそこがポータルになる。TASKS 2-9）。
 */
function ring(place: Placement, put: Put): void {
  for (let dz = -STRONGHOLD_RING; dz <= STRONGHOLD_RING; dz++) {
    for (let dx = -STRONGHOLD_RING; dx <= STRONGHOLD_RING; dx++) {
      if (!onRing(dx, dz)) continue;
      // **向きは `endPortalFrame()` に聞くこと**（状態の番号を写さない）。
      put(place.x + dx, place.y + 1, place.z + dz, endPortalFrame(facingToCentre(dx, dz), false));
    }
  }
}

/**
 * 壁掛けの松明を 4 本。**明かりが 1 つも無いと、掘り当てた部屋が真っ暗**で
 * 何があるか分からないうえ、その場で敵対モブが湧き続ける。
 *
 * **向きは `torchVariant()` に聞くこと**（壁掛けの ID を名指ししない）。
 * 渡すのは「支えのある向き」＝壁のある側。
 */
function torches(place: Placement, put: Put): void {
  const inner = STRONGHOLD_HALF - 1;
  const y = place.y + 3;
  put(place.x - inner, y, place.z, torchVariant(FACE_XN));
  put(place.x + inner, y, place.z, torchVariant(FACE_XP));
  put(place.x, y, place.z - inner, torchVariant(FACE_ZN));
  put(place.x, y, place.z + inner, torchVariant(FACE_ZP));
}

/**
 * 要塞 1 個。**`STRONGHOLD_SITE` を広げただけ**なので、投げたエンダーアイが指す先と
 * ここが建てる場所は同じ `siteAt()` から出てくる（写していない）。
 *
 * **`build()` の中で地面を測らないこと**（`fortress.ts` と同じ）。器が渡す基準点
 * 1 点で全部が決まる形を崩すと、チャンクの生成順で形が変わる。
 */
export const STRONGHOLD: StructureDef = {
  ...STRONGHOLD_SITE,
  name: "要塞",
  // 上へは天井まで。**`extent` を小さく申告すると、離れたチャンクを作ったときに
  // 端が黙って欠ける**（`rules/worldgen.md`）。
  extent: { x: STRONGHOLD_HALF, up: STRONGHOLD_HEIGHT + 1, z: STRONGHOLD_HALF },
  // 地面の下に埋める。**器は `ground + lift` を基準点にする**ので、負の値で潜る。
  lift: -STRONGHOLD_DEPTH,
  build(place, put) {
    // **殻 → 輪 → 松明の順。** 殻が中を空気で塗り潰すので、先に置いたものは消える。
    shell(place, put);
    ring(place, put);
    torches(place, put);
  },
};
