import { COBBLE, CRAFTING_TABLE, GLASS, PLANK, SAND, WOOD } from "../src/blocks";
import { RECIPES, consumeGrid, findRecipe } from "../src/crafting";
import { isEmpty, type Slot } from "../src/inventory";
import { DIAMOND, DIAMOND_PICKAXE, NO_ITEM, STICK, STONE_AXE, WOOD_PICKAXE, WOOD_SHOVEL } from "../src/items";
import { check, describe } from "./harness";

/** "P.S" のような文字列から盤面を作る。"." は空。 */
function grid(size: number, rows: string[], key: Record<string, number>): Slot[] {
  const slots: Slot[] = Array.from({ length: size * size }, () => ({ item: NO_ITEM, count: 0 }));
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      slots[y * size + x] = { item: key[ch], count: 1 };
    }
  });
  return slots;
}

export function run(): void {
  describe("クラフト");

  const P = { P: PLANK, S: STICK, W: WOOD, C: COBBLE, D: DIAMOND, A: SAND };

  // --- 形なし ---
  const planks = findRecipe(grid(2, ["W."], P), 2);
  check("原木 1 個 → 板 4 枚", planks?.out === PLANK && planks.count === 4, planks?.name ?? "無し");
  const planksMoved = findRecipe(grid(2, ["..", ".W"], P), 2);
  check("形なしは置く場所を選ばない", planksMoved?.out === PLANK);

  // --- 形あり ---
  const sticks = findRecipe(grid(2, ["P.", "P."], P), 2);
  check("板 2 枚（縦）→ 棒 4 本", sticks?.out === STICK && sticks.count === 4, sticks?.name ?? "無し");
  const sticksSide = findRecipe(grid(2, [".P", ".P"], P), 2);
  check("端に寄せても同じレシピになる", sticksSide?.out === STICK);
  const sticksWrong = findRecipe(grid(2, ["PP"], P), 2);
  check("横並びの板 2 枚では棒にならない", sticksWrong === null, sticksWrong?.name ?? "無し");

  const table = findRecipe(grid(2, ["PP", "PP"], P), 2);
  check("板 4 枚 → 作業台", table?.out === CRAFTING_TABLE);
  const glass = findRecipe(grid(2, ["AA", "AA"], P), 2);
  check("砂 4 個 → ガラス（かまどの代用）", glass?.out === GLASS);

  // --- 盤面の広さ ---
  const pickIn3 = findRecipe(grid(3, ["PPP", ".S.", ".S."], P), 3);
  check("作業台で木のツルハシ", pickIn3?.out === WOOD_PICKAXE, pickIn3?.name ?? "無し");
  const pickIn2 = findRecipe(grid(2, ["PP", ".S"], P), 2);
  check("2x2 ではツルハシは作れない", pickIn2 === null);
  const shovel = findRecipe(grid(3, [".P.", ".S.", ".S."], P), 3);
  check("縦 3 のシャベルも作業台が要る", shovel?.out === WOOD_SHOVEL, shovel?.name ?? "無し");

  // --- 左右反転（Minecraft と同じ） ---
  const axeRight = findRecipe(grid(3, ["CC.", "CS.", ".S."], P), 3);
  const axeLeft = findRecipe(grid(3, [".CC", ".SC", ".S."], P), 3);
  check("斧は右利き・左利きどちらの並びでも作れる", axeRight?.out === STONE_AXE && axeLeft?.out === STONE_AXE, `${axeRight?.name} / ${axeLeft?.name}`);

  // --- 材料違い ---
  const diamondPick = findRecipe(grid(3, ["DDD", ".S.", ".S."], P), 3);
  check("材料を変えると階層が変わる", diamondPick?.out === DIAMOND_PICKAXE, diamondPick?.name ?? "無し");
  const mixed = findRecipe(grid(3, ["PPD", ".S.", ".S."], P), 3);
  check("材料が混ざっていたら成立しない", mixed === null, mixed?.name ?? "無し");

  // --- 空盤面 ---
  check("空の盤面では何も作れない", findRecipe(grid(3, [], P), 3) === null);

  // --- 材料の消費 ---
  const board = grid(2, ["PP", "PP"], P);
  board[0].count = 3;
  consumeGrid(board);
  check(
    "1 回作ると各スロットから 1 個ずつ減る",
    board[0].count === 2 && isEmpty(board[1]) && isEmpty(board[3]),
    `左上 ${board[0].count} 個`,
  );

  // --- レシピ表の健全性 ---
  const bad = RECIPES.filter((r) => {
    if (r.shape) return r.shape.some((row) => [...row].some((ch) => ch !== "." && !r.key?.[ch]));
    return !r.ingredients || r.ingredients.length === 0;
  });
  check("全レシピの材料が定義されている", bad.length === 0, `${RECIPES.length} 件中 ${bad.length} 件が不備`);

  const duplicated = new Set<string>();
  let collisions = 0;
  for (const r of RECIPES) {
    const sig = r.shape ? r.shape.join("/") + JSON.stringify(r.key) : `~${[...(r.ingredients ?? [])].sort().join(",")}`;
    if (duplicated.has(sig)) collisions++;
    duplicated.add(sig);
  }
  check("同じ形のレシピが重複していない", collisions === 0, `${collisions} 件`);
}
