/**
 * 木の**形だけ**を持つ純関数。**生成（`worldgen.ts` の `stampTree()`）と
 * 育ち（`crops.ts` の `growTree()`）が、同じ 1 本をここから引きます。**
 *
 * **形を 2 か所に書かないこと** —— 書くと「自然に生えた木」と「苗木から育った木」が
 * 別物になり、しかも**どちらも正しく見える**ので気付けません。
 *
 * **何秒で育つか・どこに書けるかは 1 行も持ちません**（それは `crops.ts` の判断です）。
 * ここにあるのは「どのマスに何を置くか」と「高さはいくつか」の 2 つだけで、
 * three にも DOM にも乱数にも触りません（見張りは `test/treeshape.test.ts`）。
 */

import { CACTUS, LEAVES, SPRUCE_LEAVES, SPRUCE_WOOD, WOOD } from "./blocks";
import type { TreeKind } from "./biomes";

/**
 * 葉が根元から横へ広がってよい最大のマス数。
 *
 * **超えないこと** —— `worldgen.ts` は自分の列と隣接 8 列の木しかスタンプし直さないので、
 * これを超えた葉は隣の列の生成時に切り落とされて**黙って欠けます**。
 * `crops.ts` が「木の掛かる列が全部読み込まれているか」を測るのにも同じ値を使います。
 */
export const TREE_RADIUS = 2;

/**
 * 木 1 本を作るマス 1 つ。座標は**根元（幹のいちばん下）からの差**です。
 *
 * `overwrite` は `stampTree()` の `put()` にそのまま渡ります —— 幹は true（何でも
 * 押しのける）、葉は false（草むらだけ押しのけ、石や既にある幹は避ける）。
 */
export interface TreeCell {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly id: number;
  readonly overwrite: boolean;
}

/**
 * その種類・その高さの木を作るマスを、**書き込む順に**並べて返す。
 *
 * **順番（葉 → 幹）も `overwrite` の真偽も変えないこと。** 変えると
 * **既存のワールドの木が動き**、セーブの差分（壊した・置いたブロック）が
 * 別の場所を指します（`test/worldgen.test.ts` が形を見張っています）。
 */
export function treeCells(kind: TreeKind, height: number): TreeCell[] {
  const cells: TreeCell[] = [];

  // サボテンは幹だけ。葉も枝も無いので、隣の列にはみ出すこともない。
  if (kind === "cactus") {
    for (let i = 0; i < height; i++) cells.push({ dx: 0, dy: i, dz: 0, id: CACTUS, overwrite: true });
    return cells;
  }

  const spruce = kind === "spruce";
  const wood = spruce ? SPRUCE_WOOD : WOOD;
  const leaf = spruce ? SPRUCE_LEAVES : LEAVES;
  const top = height - 1;

  // 葉: 幹の先端 (top) を含む段。top + 1 にも置かないと幹が空に突き出したままになる。
  // トウヒは下ほど広い円錐、オークは丸い塊。**半径は TREE_RADIUS を超えないこと。**
  const lowest = spruce ? -4 : -2;
  for (let dy = lowest; dy <= 1; dy++) {
    const r = spruce ? (dy <= -3 ? 2 : dy <= -1 ? 1 : 0) : dy >= 1 ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r === 2 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        cells.push({ dx, dy: top + dy, dz, id: leaf, overwrite: false });
      }
    }
  }
  for (let i = 0; i < height; i++) cells.push({ dx: 0, dy: i, dz: 0, id: wood, overwrite: true });
  return cells;
}

/** 座標から決まる 0..1 の擬似乱数（`nethergen.ts` の `hash2` と同じ式）。 */
function hash2(x: number, z: number, salt: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * **苗木から育った木**の幹の本数。**座標だけで決まる純関数**です。
 *
 * **`Math.random()` を使わないこと** —— 呼ぶ側の `crops.ts` は「何秒でどうなるか」を
 * テストで固定できる必要があります（あちらのファイル頭の約束）。
 *
 * **シードは受け取りません。** 生成側（`worldgen.ts`）の木はワールドのシードで振れますが、
 * こちらは人が植えた 1 本なので、同じ場所に植え直せば同じ木が生えれば十分です。
 * **範囲だけは生成側と揃えること**（オーク 4..6 / トウヒ 6..9 / サボテン 1..3）。
 */
export function grownTreeHeight(kind: TreeKind, x: number, z: number): number {
  const roll = hash2(x, z, 0x5a91);
  if (kind === "spruce") return 6 + Math.floor(roll * 4);
  if (kind === "cactus") return 1 + Math.floor(roll * 3);
  return 4 + Math.floor(roll * 3);
}
