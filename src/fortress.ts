/**
 * ネザー要塞。**`structures.ts` の器に乗る最初の建物**で、いまは**通路だけ**
 * （部屋もブレイズの湧き場もまだ無い。TASKS 2-3 は「クリアできる最小」で止める）。
 *
 * 形は**十字の通路 1 つ**。中央で 2 本が交わるので、どちらへ歩いても橋の先まで行ける。
 *
 * ```
 *        ┃          ← 通路（幅 5。歩けるのは真ん中の 3）
 *   ━━━━━╋━━━━━     ← 交差点には手すりを置かない（塞ぐと渡れない）
 *        ┃
 * ```
 *
 * **純粋。** three も DOM も乱数も出てこない（`test/fortress.test.ts` が見張っている）。
 * 高さも `build()` の中で測らない —— 器が渡してくる基準点 1 点で全部が決まる
 * （`rules/worldgen.md` の「構造物」）。
 */

import { AIR, NETHER_BRICK } from "./blocks";
import type { Placement, Put, StructureDef } from "./structures";

/** 中心から通路が伸びる長さ（片側）。全長は `HALF * 2 + 1`。 */
export const FORTRESS_HALF = 20;
/** 床の幅（片側）。**5 マス幅**の床のうち、歩けるのは手すりの内側 3 マス。 */
export const FORTRESS_EDGE = 2;
/** 通路の上に空ける高さ。**山に埋まった所ではここがトンネルになる。** */
export const FORTRESS_HEADROOM = 4;
/** 何チャンクごとに 1 個試すか。 */
export const FORTRESS_SPACING = 6;
/** 試したうち実際に建つ割合。 */
export const FORTRESS_CHANCE = 0.6;

/**
 * 十字の 1 本を書く。`along` が伸びる向き、`side` が幅の向き。
 *
 * **床 → 空ける → 手すり の順に書くこと。** 空けるのを後に回すと、
 * 交差点で先に置いた手すりを消してしまう。
 */
function corridor(place: Placement, put: Put, axis: "x" | "z"): void {
  const { x: px, y, z: pz } = place;
  for (let a = -FORTRESS_HALF; a <= FORTRESS_HALF; a++) {
    for (let b = -FORTRESS_EDGE; b <= FORTRESS_EDGE; b++) {
      const x = axis === "x" ? px + a : px + b;
      const z = axis === "x" ? pz + b : pz + a;

      put(x, y, z, NETHER_BRICK);
      for (let h = 1; h <= FORTRESS_HEADROOM; h++) put(x, y + h, z, AIR);

      // 手すりは端の 2 列だけ。**交差点（もう 1 本の幅の中）には置かない** ——
      // 置くと十字の真ん中が壁で塞がり、片方の通路にしか入れなくなる。
      const crossing = Math.abs(a) <= FORTRESS_EDGE;
      if (Math.abs(b) === FORTRESS_EDGE && !crossing) put(x, y + 1, z, NETHER_BRICK);
    }
  }
}

/**
 * ネザー要塞 1 個。**`extent` は書き込む範囲そのもの**にしてあること ——
 * 小さく申告すると、離れたチャンクを生成したときに通路の端が黙って欠ける。
 */
export const FORTRESS: StructureDef = {
  name: "ネザー要塞",
  spacing: FORTRESS_SPACING,
  chance: FORTRESS_CHANCE,
  // 手すりが `y + 1`、空ける高さが `y + HEADROOM` なので、上は HEADROOM で足りる。
  extent: { x: FORTRESS_HALF, up: FORTRESS_HEADROOM, z: FORTRESS_HALF },
  salt: 0x4f5254,
  build(place, put) {
    corridor(place, put, "x");
    corridor(place, put, "z");
  },
};
