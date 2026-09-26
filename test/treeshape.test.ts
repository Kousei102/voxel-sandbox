/**
 * 木の形（`src/treeshape.ts`）を**純関数として直に呼ぶ**見張り。
 *
 * 生成した世界の側（森にツタが生えているか・支えを持っているか）は
 * `test/worldgen.test.ts` が見ます。ここで見るのは**形そのもの**:
 * `vineCells()` が `treeCells()` の答えから導かれているか・`TREE_RADIUS` と
 * 根元の線を越えていないか・向きが壁の側と合っているか。
 *
 * **`treeCells()` の形の見張りは `test/worldgen.test.ts` に元からあります**
 * （葉 → 幹の順・半径・`overwrite` の真偽）。こちらへ写さないこと。
 */

import {
  BIRCH_LEAVES,
  BIRCH_WOOD,
  LEAVES,
  SPRUCE_LEAVES,
  SPRUCE_WOOD,
  VINE,
  VINE_XN,
  VINE_ZN,
  VINE_ZP,
  WOOD,
  baseBlock,
  blockName,
  supportFace,
  vineVariant,
} from "../src/blocks";
import { TREE_RADIUS, VINE_MAX_LENGTH, grownTreeHeight, treeBlocks, treeCells, vineCells } from "../src/treeshape";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 面番号 → 横の隣のマス（`blocks.ts` の並び `0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z`）。 */
const STEP: Record<number, [number, number]> = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] };

export function run(): void {
  describe("木とツタの形（treeshape.ts）");

  // **このファイルは判断も確かめられないものも持たない**（ファイル頭の約束）。
  // 乱数を持つと、チャンクを作り直すたびに木が踊る（しかも絵を撮るまで気付けない）。
  const source = sourceOf("src/treeshape.ts");
  for (const [what, word] of [
    ["乱数", "Math.random("],
    ["three", "Mesh"],
    ["DOM", "document"],
    ["WebAudio", "AudioContext"],
  ] as const) {
    check(`treeshape.ts は${what}に触らない`, !source.includes(word), word);
  }
  // **何秒で育つか（`crops.ts`）・どこに生えるか（`biomes.ts`）も持たない。**
  // 垂れる長さ（形）はここだが、**何本の木が緑になるか（割合）は `biomes.ts`**。
  check(
    "treeshape.ts は生えやすさの割合を持たない",
    !source.includes("vine:") && !source.includes("BiomeDef"),
  );

  // --- ツタの形（34c）---
  // **`treeCells()` に無いマスで、横 4 方向のどれかが葉**のところにだけ掛かる。
  // 葉の座標を写して書くと、葉の形を変えた日にツタだけが取り残される。
  for (const [kind, height] of [
    ["oak", 4],
    ["oak", 5],
    ["oak", 6],
    ["spruce", 6],
    ["spruce", 9],
    // **シラカバ（50）もオークと同じ形なので、同じ見張りを通す**（葉の ID だけが違う）。
    ["birch", 4],
    ["birch", 6],
  ] as const) {
    const tree = treeCells(kind, height);
    const leafId = kind === "spruce" ? SPRUCE_LEAVES : kind === "birch" ? BIRCH_LEAVES : LEAVES;
    const filled = new Set(tree.map((c) => `${c.dx},${c.dy},${c.dz}`));
    const leaves = new Set(tree.filter((c) => c.id === leafId).map((c) => `${c.dx},${c.dy},${c.dz}`));
    const lowestLeaf = Math.min(...tree.filter((c) => c.id === leafId).map((c) => c.dy));

    // **座標を渡すのはハッシュのため**（同じ場所なら同じ木）。1 本ぶんの形を見る。
    const cells = vineCells(kind, height, 10, 20);
    const columns = new Map<string, typeof cells>();
    for (const cell of cells) {
      const key = `${cell.dx},${cell.dz}`;
      columns.set(key, [...(columns.get(key) ?? []), cell]);
    }
    const dys = cells.map((c) => c.dy);
    const reach = Math.max(...cells.map((c) => Math.max(Math.abs(c.dx), Math.abs(c.dz))));
    const longest = Math.max(...[...columns.values()].map((c) => c.length));
    // **葉の下へ垂れているか**（葉のいちばん下の段より下にあるマスの数）。
    const below = cells.filter((c) => c.dy < lowestLeaf).length;
    console.log(
      `      ${kind} 高さ ${height}: ツタ ${cells.length} マス / ${columns.size} 列` +
        ` / dy ${Math.min(...dys)}..${Math.max(...dys)}（葉の下 ${below} マス）` +
        ` / いちばん長い列 ${longest}（上限 ${VINE_MAX_LENGTH}）` +
        ` / 向き ${[...new Set(cells.map((c) => c.id))].sort().join(",")}`,
    );

    check(`${kind} ${height}: ツタが 1 マス以上掛かる`, cells.length > 0, `${cells.length} マス`);
    check(`${kind} ${height}: ツタが TREE_RADIUS を超えない`, reach <= TREE_RADIUS, `半径 ${reach}`);
    // **根元より下へ垂らさないこと** —— あそこは地面なので、`put()` に弾かれて
    // 宙に浮いた切れ端になる（`rules/worldgen.md`）。
    check(`${kind} ${height}: 根元より下へ垂れない`, Math.min(...dys) >= 0, `いちばん下 ${Math.min(...dys)}`);
    check(`${kind} ${height}: 1 列は ${VINE_MAX_LENGTH} マスまで`, longest <= VINE_MAX_LENGTH, `${longest} マス`);
    check(`${kind} ${height}: 葉の下へ垂れる`, below > 0, `${below} マス`);
    // **木のマスと重ならないこと**（重なると `overwrite: false` に弾かれて 1 マスも出ない）。
    const overlap = cells.filter((c) => filled.has(`${c.dx},${c.dy},${c.dz}`)).length;
    check(`${kind} ${height}: 木のマスと重ならない`, overlap === 0, `${overlap} マス`);
    check(
      `${kind} ${height}: 置くのはツタ 4 向きのどれか`,
      cells.every((c) => baseBlock(c.id) === VINE),
      [...new Set(cells.map((c) => blockName(c.id)))].join(","),
    );
    check(
      `${kind} ${height}: 葉と同じ overwrite（草むらだけ押しのける）`,
      cells.every((c) => !c.overwrite),
    );

    // 列ごとに: 1 つの向きで、隙間なく下へ続き、**いちばん上のマスの横が葉**。
    let mixedId = 0;
    let gaps = 0;
    let noWall = 0;
    for (const column of columns.values()) {
      const sorted = [...column].sort((a, b) => b.dy - a.dy);
      if (new Set(sorted.map((c) => c.id)).size !== 1) mixedId++;
      for (let i = 1; i < sorted.length; i++) if (sorted[i].dy !== sorted[i - 1].dy - 1) gaps++;
      const top = sorted[0];
      const [ox, oz] = STEP[supportFace(top.id)];
      if (!leaves.has(`${top.dx + ox},${top.dy},${top.dz + oz}`)) noWall++;
    }
    // **向きを列の途中で選び直さないこと** —— 壁の無い所で選び直すと、垂れた列の
    // 途中で板の側が入れ替わる（34b の `vineVariant(FACE_YP)` が上を写す理由）。
    check(`${kind} ${height}: 1 列は同じ向き`, mixedId === 0, `${mixedId} 列`);
    check(`${kind} ${height}: 列に隙間が無い`, gaps === 0, `${gaps} か所`);
    // **1 本目は必ず壁掛け**（葉の真下に 1 本目は置けない。`supportsBlock()` が
    // 真上を支えと認めるのはツタのときだけ）。
    check(`${kind} ${height}: いちばん上のマスの横が葉`, noWall === 0, `${noWall} 列`);
  }

  // **向きは `vineVariant()` に聞くこと**（`VINE_XN` などを直に書かない）。
  // 表を並べ替えたときに、生成の側だけが黙って別の面に貼る形で壊れる。
  check(
    "壁の側と向きの対応（vineVariant）",
    vineVariant(0) === VINE && vineVariant(1) === VINE_XN && vineVariant(4) === VINE_ZP && vineVariant(5) === VINE_ZN,
    [0, 1, 4, 5].map((f) => `${f}:${blockName(vineVariant(f))}`).join(" "),
  );

  // **4 向きとも世界に出ること。** いつも同じ面に貼ると（隅は 2 面とも葉なので、
  // 先に見つけた面だけを使うと）**4 向きのうち 2 つしか出てこない。**
  const seen = new Set<number>();
  for (let x = 0; x < 40; x++) {
    for (const cell of vineCells("oak", 5, x * 7, x * 13)) seen.add(cell.id);
  }
  check("4 向きとも使われる", seen.size === 4, `${[...seen].sort().join(",")}`);

  // **サボテンには葉が無いので 1 マスも掛からない**（砂漠は `BiomeDef.vine` も 0）。
  check("サボテンにツタは掛からない", vineCells("cactus", 3, 0, 0).length === 0);

  // **同じ座標なら同じ形**（`Math.random()` を使っていない証拠）。
  const a = vineCells("oak", 5, -18, 42);
  const b = vineCells("oak", 5, -18, 42);
  check(
    "同じ座標なら同じツタ",
    JSON.stringify(a) === JSON.stringify(b),
    `${a.length} マス`,
  );
  // **場所ごとに違う形になること**（全部同じだと、森が同じ木の並びに見える）。
  const shapes = new Set<string>();
  for (let x = 0; x < 40; x++) shapes.add(JSON.stringify(vineCells("oak", 5, x * 31, x * 17)));
  check("場所ごとに形が変わる", shapes.size > 5, `40 か所で ${shapes.size} 通り`);

  describe("シラカバ（50）: オークの写しで ID だけが違う");

  // **高さごとにマスの座標が 1 つ残らず同じで、ID だけが原木・葉**（4..6）。
  // 座標が 1 つでもずれると、既存のセーブで森の 2 割の木の差分が別のマスを指す。
  for (const height of [4, 5, 6]) {
    const oak = treeCells("oak", height);
    const birch = treeCells("birch", height);
    const swap = (id: number): number => (id === WOOD ? BIRCH_WOOD : id === LEAVES ? BIRCH_LEAVES : -1);
    const mismatch = oak.filter((c, i) => {
      const o = birch[i];
      return !o || o.dx !== c.dx || o.dy !== c.dy || o.dz !== c.dz || o.overwrite !== c.overwrite || o.id !== swap(c.id);
    }).length;
    const ids = [...new Set(birch.map((c) => blockName(c.id)))].join(",");
    console.log(`      高さ ${height}: オーク ${oak.length} マス / シラカバ ${birch.length} マス（${ids}）/ 食い違い ${mismatch}`);
    check(
      `高さ ${height}: シラカバはオークと同じ座標・同じ順で、ID だけがシラカバの原木と葉`,
      oak.length === birch.length && mismatch === 0,
      `${oak.length} / ${birch.length} マス・食い違い ${mismatch}`,
    );
  }
  // **ツタもオークと同じ座標に掛かる**（葉の ID を取り違えると 0 マスになる）。
  const oakVines = vineCells("oak", 5, 33, -7);
  const birchVines = vineCells("birch", 5, 33, -7);
  console.log(`      ツタ: オーク ${oakVines.length} マス / シラカバ ${birchVines.length} マス`);
  check(
    "シラカバのツタはオークと同じ座標・同じ向きで、0 マスではない",
    birchVines.length > 0 && JSON.stringify(birchVines) === JSON.stringify(oakVines),
    `${birchVines.length} / ${oakVines.length} マス`,
  );
  // **原木と葉の表は 1 本**（`treeBlocks()`）。4 種を並べて出す。
  const table = (["oak", "spruce", "birch", "cactus"] as const).map((k) => {
    const t = treeBlocks(k);
    return `${k} ${t.wood}/${t.leaf}`;
  });
  console.log(`      treeBlocks: ${table.join(" / ")}`);
  check(
    "treeBlocks はオーク・トウヒ・シラカバで原木と葉の組が別々",
    treeBlocks("oak").wood === WOOD && treeBlocks("oak").leaf === LEAVES &&
      treeBlocks("spruce").wood === SPRUCE_WOOD && treeBlocks("spruce").leaf === SPRUCE_LEAVES &&
      treeBlocks("birch").wood === BIRCH_WOOD && treeBlocks("birch").leaf === BIRCH_LEAVES,
    table.join(" / "),
  );
  // **苗木から育つ高さもオークと同じ 4..6**（本家は 5..7。`TUNING.md`）。
  const heights = new Set<number>();
  let sameAsOak = 0;
  for (let x = 0; x < 200; x++) {
    const h = grownTreeHeight("birch", x * 13, x * -7);
    heights.add(h);
    if (h === grownTreeHeight("oak", x * 13, x * -7)) sameAsOak++;
  }
  const sorted = [...heights].sort((a2, b2) => a2 - b2);
  console.log(`      grownTreeHeight("birch") 200 か所: ${sorted.join(",")}（オークと同じ ${sameAsOak} か所）`);
  check(
    "grownTreeHeight(\"birch\") は 4..6 の 3 通りで、同じ座標ならオークと同じ",
    sorted.join(",") === "4,5,6" && sameAsOak === 200,
    `${sorted.join(",")} / ${sameAsOak}`,
  );
}
