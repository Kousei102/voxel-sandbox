import {
  COBBLE,
  CRAFTING_TABLE,
  PLANK,
  PLANK_SLAB,
  PLANK_STAIRS,
  SAND,
  STONE,
  STONE_SLAB,
  STONE_STAIRS,
  TORCH,
  WOOD,
} from "../src/blocks";
import { RECIPES, consumeGrid, findRecipe } from "../src/crafting";
import { isEmpty, type Slot } from "../src/inventory";
import {
  BUCKET,
  COAL,
  DIAMOND,
  IRON_INGOT,
  DIAMOND_PICKAXE,
  FLINT,
  FLINT_AND_STEEL,
  NO_ITEM,
  STICK,
  STONE_AXE,
  WOOD_PICKAXE,
  WOOD_SHOVEL,
} from "../src/items";
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

  const P = { P: PLANK, S: STICK, W: WOOD, C: COBBLE, D: DIAMOND, A: SAND, O: COAL, T: STONE, I: IRON_INGOT, F: FLINT };

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
  // かまどが入ったので、砂 4 個 → ガラスの代用レシピは外した。
  // **これが戻っていたら、精錬を飛ばせる抜け道ができている。**
  const glass = findRecipe(grid(2, ["AA", "AA"], P), 2);
  check("砂はクラフトではガラスにならない（かまどで焼く）", glass === null, glass?.name ?? "無し");

  const torch = findRecipe(grid(2, ["O.", "S."], P), 2);
  check("石炭 + 棒 → 松明 4 本", torch?.out === TORCH && torch.count === 4, torch?.name ?? "無し");
  const torchUpsideDown = findRecipe(grid(2, ["S.", "O."], P), 2);
  check("上下を逆にすると松明にならない", torchUpsideDown === null, torchUpsideDown?.name ?? "無し");

  // --- バケツ ---
  // **黒曜石への入口。** 水と溶岩が触れる場所は生成では作られないので、
  // これが無いと黒曜石が 1 個も手に入らない（＝ネザーへ行けない）。
  const bucket = findRecipe(grid(3, ["I.I", ".I."], P), 3);
  check("鉄 3 個の V 字 → バケツ", bucket?.out === BUCKET && bucket.count === 1, bucket?.name ?? "無し");
  const bucketUpsideDown = findRecipe(grid(3, [".I.", "I.I"], P), 3);
  check("上下を逆にするとバケツにならない", bucketUpsideDown === null, bucketUpsideDown?.name ?? "無し");
  const bucketIn2 = findRecipe(grid(2, ["I.", ".I"], P), 2);
  check("2x2 ではバケツは作れない（作業台が要る）", bucketIn2 === null, bucketIn2?.name ?? "無し");

  // --- 火打石と打ち金 ---
  // **ネザーポータルの点火手段。** 形なしなので 2x2（手持ち）でも作れる ——
  // 作業台を探しに戻らなくてよいのは Minecraft と同じ。
  const fireStarter = findRecipe(grid(2, ["IF"], P), 2);
  check(
    "鉄インゴット + 火打石 → 火打石と打ち金",
    fireStarter?.out === FLINT_AND_STEEL && fireStarter.count === 1,
    fireStarter?.name ?? "無し",
  );
  const fireStarterMoved = findRecipe(grid(2, ["..", "FI"], P), 2);
  check("形なしなので置く場所を選ばない", fireStarterMoved?.out === FLINT_AND_STEEL);
  const flintAlone = findRecipe(grid(2, ["F."], P), 2);
  check("火打石だけでは作れない", flintAlone === null, flintAlone?.name ?? "無し");

  // --- 盤面の広さ ---
  const pickIn3 = findRecipe(grid(3, ["PPP", ".S.", ".S."], P), 3);
  check("作業台で木のツルハシ", pickIn3?.out === WOOD_PICKAXE, pickIn3?.name ?? "無し");
  const pickIn2 = findRecipe(grid(2, ["PP", ".S"], P), 2);
  check("2x2 ではツルハシは作れない", pickIn2 === null);
  const shovel = findRecipe(grid(3, [".P.", ".S.", ".S."], P), 3);
  check("縦 3 のシャベルも作業台が要る", shovel?.out === WOOD_SHOVEL, shovel?.name ?? "無し");

  // --- ハーフブロック ---
  const stoneSlab = findRecipe(grid(3, ["TTT"], P), 3);
  check(
    "石 3 個（横）→ 石ハーフ 6 個",
    stoneSlab?.out === STONE_SLAB && stoneSlab.count === 6,
    stoneSlab?.name ?? "無し",
  );
  const slabLow = findRecipe(grid(3, ["...", "...", "TTT"], P), 3);
  check("盤面のどこに置いても同じ", slabLow?.out === STONE_SLAB);
  const slabIn2 = findRecipe(grid(2, ["TT"], P), 2);
  check("2 個では作れない（3 列なので作業台が要る）", slabIn2 === null, slabIn2?.name ?? "無し");
  const plankSlab = findRecipe(grid(3, ["PPP"], P), 3);
  check(
    "材質を変えるとハーフも変わる",
    plankSlab?.out === PLANK_SLAB,
    plankSlab?.name ?? "無し",
  );

  // --- 階段 ---
  const stoneStairs = findRecipe(grid(3, ["T..", "TT.", "TTT"], P), 3);
  check(
    "石 6 個（段々）→ 石の階段 4 個",
    stoneStairs?.out === STONE_STAIRS && stoneStairs.count === 4,
    stoneStairs?.name ?? "無し",
  );
  const stairsMirrored = findRecipe(grid(3, ["..T", ".TT", "TTT"], P), 3);
  check("階段は左右どちらの段々でも作れる", stairsMirrored?.out === STONE_STAIRS, stairsMirrored?.name ?? "無し");
  const plankStairs = findRecipe(grid(3, ["P..", "PP.", "PPP"], P), 3);
  check("材質を変えると階段も変わる", plankStairs?.out === PLANK_STAIRS, plankStairs?.name ?? "無し");
  const stairsUpsideDown = findRecipe(grid(3, ["TTT", "TT.", "T.."], P), 3);
  check("上下逆の段々では作れない", stairsUpsideDown === null, stairsUpsideDown?.name ?? "無し");

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

  // レシピ名は出来上がりの枠の**真下に浮かせて**出す（`style.css` の `#recipehint`）。
  // 長い名前は左へ伸びて盤面のスロットに重なるが、**目で見るまで気付けない**。
  // 上限は CSS から: 盤面の右端から出来上がりの枠の中心まで 69px
  // （gap 14 + 矢印 18 + gap 14 + 46/2）、中央揃えなので左右あわせて 138px。
  // 字は 11px なので全角 12.5 文字ぶん。表示は `${name} x${count}` の形（`inventoryui.ts`）。
  const HINT_LIMIT = 12.5;
  const hintWidth = (text: string) =>
    [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) < 0x100 ? 0.5 : 1), 0);
  const longest = RECIPES.map((r) => `${r.name} x${r.count}`).reduce(
    (a, b) => (hintWidth(a) >= hintWidth(b) ? a : b),
    "",
  );
  console.log(`      いちばん長いレシピ名は「${longest}」= 全角 ${hintWidth(longest)} 文字ぶん（上限 ${HINT_LIMIT}）`);
  check("レシピ名は盤面のスロットに届かない", hintWidth(longest) <= HINT_LIMIT, longest);
}
