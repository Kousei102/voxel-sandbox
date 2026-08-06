/**
 * モブの形 → 頂点。**three を import しない**（`test/mobs.test.ts` が見張っている）。
 *
 * 描画のファイルではなくここに置いてあるのは、**モブの形を既存の巡回順・体積の検査に
 * かけるため**。面の裏返りは「面が丸ごと消える」形でしか画面に出ず、この環境では
 * 見られない。three のファイルに入れた時点でその検査が届かなくなる。
 *
 * 箱を積むのは `meshbuild.ts` の `Builder` を通す。**巡回順の発行点はあそこ 1 か所だけ。**
 * `mesher.ts` の `box()` を使い回さないのは、あれが `faceColor(id, ...)` でブロックの表に
 * 繋がっていて、色を差し替え可能にするとチャンクごとの内側ループに間接呼び出しが入るから。
 * 箱の角を数え直すのは安く、巡回順を写すのが高い。
 */

import { MAX_LIGHT } from "./constants";
import { Builder, FACE_SHADE, type MeshArrays } from "./meshbuild";
import type { MobBox, MobDef, MobGroup } from "./mobs";

export interface MobPartMesh {
  readonly group: MobGroup;
  readonly mesh: MeshArrays;
}

const builder = new Builder();
const rgb = new Float32Array(3);
const ao = [3, 3, 3, 3];
/**
 * 焼き込む光量。**描画時に 1 体ぶんの実際の光で毎フレーム上書きされる**ので、
 * ここの値は本来どうでもいい。上書きを忘れたときに「真っ黒なモブ」ではなく
 * 「明るいモブ」になるよう、最大にしてある（見えない不具合より見える不具合のほうがいい）。
 */
const sky = [MAX_LIGHT, MAX_LIGHT, MAX_LIGHT, MAX_LIGHT];
const block = [0, 0, 0, 0];
const boxMin = [0, 0, 0];
const boxMax = [0, 0, 0];

/**
 * 箱 1 個を 6 面ぶん積む。頂点の並べ方は greedy 側とまったく同じ
 * （u が増える向き → v が増える向き）にして、巡回順の規約を 1 か所に保つ。
 */
function emitBox(shape: readonly number[], color: Float32Array): void {
  boxMin[0] = shape[0];
  boxMin[1] = shape[1];
  boxMin[2] = shape[2];
  boxMax[0] = shape[3];
  boxMax[1] = shape[4];
  boxMax[2] = shape[5];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (const dir of [1, -1]) {
      const plane = dir > 0 ? boxMax[d] : boxMin[d];
      const corner = (su: number, sv: number): number[] => {
        const p = [0, 0, 0];
        p[d] = plane;
        p[u] = su ? boxMax[u] : boxMin[u];
        p[v] = sv ? boxMax[v] : boxMin[v];
        return p;
      };
      const normal = [0, 0, 0];
      normal[d] = dir;
      const face = d * 2 + (dir > 0 ? 0 : 1);
      builder.quad(
        corner(0, 0),
        corner(1, 0),
        corner(1, 1),
        corner(0, 1),
        normal[0],
        normal[1],
        normal[2],
        color,
        1,
        // 地形と同じ「上面が明るく底面が暗い」明暗を掛ける。
        // これを外すとモブだけのっぺりして、周りから浮いて見える。
        FACE_SHADE[face],
        ao,
        sky,
        block,
      );
    }
  }
}

/**
 * 箱 1 個ぶんの `MeshArrays`。**落ちたアイテムの立方体がこれを使う。**
 *
 * わざわざモブの側に置いてあるのは、**巡回順の発行点を増やさないため**。
 * 同じ `emitBox()` を通るので、ドロップの形も `test/geometry.ts` の
 * 巡回順・体積の検査にそのまま乗る（面の裏返りは画面が真っ黒になる形でしか
 * 出ないので、この環境では検査に乗せる以外に気付く手が無い）。
 */
export function buildBoxMesh(
  box: readonly number[],
  color: number,
  rgbOf: (hex: number, out: Float32Array) => void,
): MeshArrays {
  builder.reset();
  rgbOf(color, rgb);
  emitBox(box, rgb);
  const mesh = builder.toArrays();
  // 箱 1 個なら必ず 6 面出る。出なかったのは寸法が潰れている（書き間違い）。
  if (!mesh) throw new Error(`箱 [${box.join(", ")}] から面が 1 枚も出なかった`);
  return mesh;
}

/**
 * 1 種類ぶんの形を、グループごとの `MeshArrays` に積む。
 * **形は軸に平行なまま作ること。** 回すのは `Object3D` の側で、
 * `Builder.quad()` の「法線の成分の和で巡回順を決める」規約は
 * **形を作るときの制約**であって `Object3D` の変換には掛からない
 * （回転は行列式 +1 なので巡回順と法線の関係は保たれる）。
 */
export function buildMobMesh(
  def: MobDef,
  rgbOf: (hex: number, out: Float32Array) => void,
): MobPartMesh[] {
  const parts: MobPartMesh[] = [];
  for (let g = 0; g < def.groups.length; g++) {
    builder.reset();
    let any = false;
    for (const b of def.boxes as readonly MobBox[]) {
      if (b.group !== g) continue;
      rgbOf(b.color, rgb);
      emitBox(b.box, rgb);
      any = true;
    }
    const mesh = any ? builder.toArrays() : null;
    // 箱が 1 つも無いグループは、そもそも定義の書き間違い。黙って飛ばさず落とす。
    if (!mesh) throw new Error(`${def.kind}: グループ ${g} に箱が 1 つも無い`);
    parts.push({ group: def.groups[g], mesh });
  }
  return parts;
}
