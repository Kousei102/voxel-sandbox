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

import {
  CACTUS,
  FACE_XN,
  FACE_XP,
  FACE_ZN,
  FACE_ZP,
  LEAVES,
  SPRUCE_LEAVES,
  SPRUCE_WOOD,
  WOOD,
  vineVariant,
} from "./blocks";
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
 * 自然に生えたツタが 1 列に垂れる最大のマス数（**壁掛けの 1 本目を含む**）。
 *
 * **上限を決めてあるのが肝心です** —— 決めないと、木のてっぺんから根元より下まで
 * 伸びたぶんが `stampTree()` の `put()`（`overwrite: false`）に弾かれて、
 * **宙に浮いた切れ端**になります（`rules/worldgen.md`）。手触りの値は `TUNING.md`。
 */
export const VINE_MAX_LENGTH = 4;

/**
 * ツタを掛けられる横 4 方向（面番号と、その向きの隣のマス）。**縦は入っていません** ——
 * 上へは掛からず、下へ垂れるぶんは「真上の同じツタ」にぶら下がるので、
 * 向きは 1 本目の壁のものを写します（`blocks.ts` の `vineVariant()`）。
 *
 * **面番号は `blocks.ts` の並び**（`0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z`）に合わせること。
 */
const WALL_FACES: readonly (readonly [number, number, number])[] = [
  [FACE_XP, 1, 0],
  [FACE_XN, -1, 0],
  [FACE_ZP, 0, 1],
  [FACE_ZN, 0, -1],
];

/**
 * `dx,dy,dz` を 1 つの数にまとめる（`Set` の鍵）。**文字列にしないこと** ——
 * `vineCells()` はチャンク 1 個の生成中に木の本数ぶん呼ばれるので、そのぶんゴミが出ます。
 */
function cellKey(dx: number, dy: number, dz: number): number {
  // **`dy` は下へ 1 マス覗く**（垂れる先が空いているかを見る）ので、下駄を履かせておくこと。
  return (dx + 2) | ((dz + 2) << 3) | ((dy + 8) << 6);
}

/**
 * その木に自然に掛かるツタのマス。**`treeCells()` の答えから導きます** ——
 * 葉の座標を写して書き直すと、葉の形を変えた日にツタだけが取り残されます。
 *
 * 置けるのは**「`treeCells()` に無いマスで、横 4 方向のどれかが葉のマス」**で、
 * オークなら落とした 4 隅、トウヒなら細い段の横がこれに当たります。
 * **1 本目は必ずその壁掛け**で（葉の真下に 1 本目は置けません ——
 * `supportsBlock()` が真上を支えと認めるのはツタのときだけ）、
 * **2 本目から下が「真上のツタ」にぶら下がるぶん**です。
 *
 * - **1 列に 1 本だけ。** いちばん上の壁掛けから下へ `hash2` で決めた長さぶん伸ばし、
 *   木のマスに当たったら止めます（**向きは 1 本目のものを列ぜんぶで使い回す** ——
 *   壁の無い所で選び直すと、垂れた列の途中で板の側が入れ替わります）
 * - **真下が葉で埋まっている壁掛けは取りません**（垂れる先が無いので、
 *   葉の横に 1 マスだけ貼り付いた板になります）
 * - **`dy` が負のマスは出しません**（木の根元より下は地面です。`rules/worldgen.md`）
 * - **`Math.random()` を使わないこと。** 同じ座標なら毎回同じ木でなければ、
 *   チャンクを作り直すたびにツタが踊ります（`grownTreeHeight()` と同じ約束）
 *
 * **どれだけの木に掛かるかはここが決めません**（`biomes.ts` の `BiomeDef.vine`）。
 */
export function vineCells(kind: TreeKind, height: number, x: number, z: number): TreeCell[] {
  // サボテンには葉が無いので 1 マスも掛からない（砂漠は `BiomeDef.vine` も 0）。
  if (kind === "cactus") return [];

  const cells = treeCells(kind, height);
  const leaf = kind === "spruce" ? SPRUCE_LEAVES : LEAVES;
  const filled = new Set<number>();
  const leaves = new Set<number>();
  let lowest = Infinity;
  let highest = -Infinity;
  for (const cell of cells) {
    filled.add(cellKey(cell.dx, cell.dy, cell.dz));
    if (cell.id !== leaf) continue;
    leaves.add(cellKey(cell.dx, cell.dy, cell.dz));
    if (cell.dy < lowest) lowest = cell.dy;
    if (cell.dy > highest) highest = cell.dy;
  }

  const out: TreeCell[] = [];
  for (let dz = -TREE_RADIUS; dz <= TREE_RADIUS; dz++) {
    for (let dx = -TREE_RADIUS; dx <= TREE_RADIUS; dx++) {
      // **いちばん下の壁掛けを探す**（葉の段だけ見ればよい）。**下から探すこと** ——
      // 上から探すと葉の隙間（オークの隅）が埋まるだけで、**葉より下に 1 マスしか
      // 垂れません。** 下から探せば、同じ長さで葉の下へ 3 マス垂れます。
      let top = -1;
      let id = 0;
      for (let dy = lowest; dy <= highest && top < 0; dy++) {
        if (filled.has(cellKey(dx, dy, dz))) continue;
        // **垂れる先が空いていること。** 真下が葉だと 1 マスだけの板になる。
        if (filled.has(cellKey(dx, dy - 1, dz))) continue;
        // **ここで配列を作らないこと**（`filter` を使わない）—— この for は
        // チャンク 1 個の生成中に木の本数 x 25 列ぶん回るので、そのぶんゴミが出ます。
        let walls = 0;
        for (const [, ox, oz] of WALL_FACES) if (leaves.has(cellKey(dx + ox, dy, dz + oz))) walls++;
        if (walls === 0) continue;
        top = dy;
        // 隅は 2 面とも葉なので、どちらに貼るかを座標で振る（いつも同じ面に貼ると
        // 4 向きのうち 2 つしか世界に出てこない）。**向きは `vineVariant()` に聞くこと。**
        let pick = Math.floor(hash2(x + dx, z + dz, 0x2c41) * walls);
        for (const [face, ox, oz] of WALL_FACES) {
          if (!leaves.has(cellKey(dx + ox, dy, dz + oz))) continue;
          if (pick-- === 0) id = vineVariant(face);
        }
      }
      if (top < 0 || id === 0) continue;
      // **0 マス（生えない）も出ること。** 候補の列ぜんぶに垂らすと、木が緑の箱になる。
      const length = Math.floor(hash2(x + dx, z + dz, 0x1e6f) * (VINE_MAX_LENGTH + 1));
      for (let i = 0; i < length; i++) {
        const dy = top - i;
        if (dy < 0 || filled.has(cellKey(dx, dy, dz))) break;
        out.push({ dx, dy, dz, id, overwrite: false });
      }
    }
  }
  return out;
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
