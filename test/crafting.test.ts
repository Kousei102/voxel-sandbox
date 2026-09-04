import {
  BED,
  COBBLE,
  CRAFTING_TABLE,
  DIAMOND_BLOCK,
  GOLD_BLOCK,
  IRON_BLOCK,
  PLANK,
  PLANK_SLAB,
  PLANK_STAIRS,
  SAND,
  SNOW,
  STONE,
  STONE_SLAB,
  STONE_STAIRS,
  TORCH,
  WOOD,
  WOOL,
} from "../src/blocks";
import { RECIPES, consumeGrid, findRecipe } from "../src/crafting";
import { isEmpty, type Slot } from "../src/inventory";
import {
  ARROW,
  BLAZE_POWDER,
  BLAZE_ROD,
  BOW,
  BREAD,
  BUCKET,
  COAL,
  DIAMOND,
  DIAMOND_HOE,
  ENDER_EYE,
  ENDER_PEARL,
  IRON_INGOT,
  DIAMOND_PICKAXE,
  DIAMOND_SWORD,
  FEATHER,
  FLINT,
  FLINT_AND_STEEL,
  GOLD_INGOT,
  IRON_HOE,
  IRON_SWORD,
  NO_ITEM,
  SHEARS,
  SNOWBALL,
  STICK,
  STONE_AXE,
  STONE_HOE,
  STONE_SWORD,
  STRING,
  WHEAT,
  WOOD_HOE,
  WOOD_PICKAXE,
  WOOD_SHOVEL,
  WOOD_SWORD,
  itemStackLimit,
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

  const P = {
    P: PLANK, S: STICK, W: WOOD, C: COBBLE, D: DIAMOND, A: SAND, O: COAL, T: STONE,
    I: IRON_INGOT, F: FLINT, L: WOOL, H: WHEAT, N: FEATHER, G: STRING, K: SNOWBALL,
    R: BLAZE_ROD, B: BLAZE_POWDER, E: ENDER_PEARL, Y: ENDER_EYE,
  };

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
  // **`=== null` に戻さないこと。** 2x2 の斜めはシアーズ（鉄 2 個）が取っているので、
  // ここで見たいのは「バケツにならない」ことそのもの。
  const bucketIn2 = findRecipe(grid(2, ["I.", ".I"], P), 2);
  check("2x2 ではバケツは作れない（作業台が要る）", bucketIn2?.out !== BUCKET, bucketIn2?.name ?? "無し");

  // --- シアーズ ---
  // **鉄 2 個の斜め**（Minecraft と同じ）。2x2 に収まるので**作業台が要らない** ——
  // 羊を見つけた場所で作り足せる。
  const shears = findRecipe(grid(2, [".I", "I."], P), 2);
  check("鉄 2 個の斜め → シアーズ 1 個", shears?.out === SHEARS && shears.count === 1, shears?.name ?? "無し");
  const shearsMirror = findRecipe(grid(2, ["I.", ".I"], P), 2);
  check("左右反転でも作れる", shearsMirror?.out === SHEARS, shearsMirror?.name ?? "無し");
  const shearsIn3 = findRecipe(grid(3, ["...", ".I.", "I.."], P), 3);
  check("3x3 の作業台でも同じ形で作れる", shearsIn3?.out === SHEARS, shearsIn3?.name ?? "無し");
  const ironPair = findRecipe(grid(2, ["II"], P), 2);
  check("横に並べただけではシアーズにならない", ironPair?.out !== SHEARS, ironPair?.name ?? "無し");

  // --- 雪ブロック（掘って出た雪玉を戻す） ---
  // **落とし物を差し替えた対の片割れ。** 雪を掘ると雪玉 4 個になるので、
  // これが無いと雪ブロックが二度と置けない（`items.ts` の `DROPS` の `SNOW`）。
  const snowBlock = findRecipe(grid(2, ["KK", "KK"], P), 2);
  console.log(
    `      雪玉 2x2 → ${snowBlock?.name ?? "無し"} x${snowBlock?.count ?? 0}` +
      `（3 個: ${findRecipe(grid(2, ["KK", "K."], P), 2)?.name ?? "無し"} / ` +
      `斜め 2 個: ${findRecipe(grid(2, ["K.", ".K"], P), 2)?.name ?? "無し"}）`,
  );
  check(
    "雪玉 4 個（2x2）→ 雪ブロック 1 個",
    snowBlock?.out === SNOW && snowBlock.count === 1,
    `${snowBlock?.name ?? "無し"} x${snowBlock?.count ?? 0}`,
  );
  // **3 個でも斜めでも出来ないこと。** 出来ると 4 個 → 1 個の交換比が崩れる。
  const snowThree = findRecipe(grid(2, ["KK", "K."], P), 2);
  check("雪玉 3 個では作れない", snowThree === null, snowThree?.name ?? "無し");
  const snowDiagonal = findRecipe(grid(2, ["K.", ".K"], P), 2);
  check("雪玉 2 個の斜めでは作れない", snowDiagonal?.out !== SNOW, snowDiagonal?.name ?? "無し");

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

  // --- エンダーアイ（クリア導線が合流する所） ---
  // **材料の出どころが 2 つある**（要塞のブレイズ / 夜のエンダーマン）ので、
  // ここが片方だけで通ると、行かなくてよい場所ができる。
  // どちらも形なしなので 2x2（手持ち）で作れる ——
  // ネザーや夜の野外で作業台を探しに戻らずに済むのは Minecraft と同じ。
  const powder = findRecipe(grid(2, ["R."], P), 2);
  check(
    "ブレイズロッド 1 本 → ブレイズパウダー 2 個",
    powder?.out === BLAZE_POWDER && powder.count === 2,
    `${powder?.name ?? "無し"} x${powder?.count ?? 0}`,
  );
  const eye = findRecipe(grid(2, ["BE"], P), 2);
  check(
    "ブレイズパウダー + エンダーパール → エンダーアイ 1 個",
    eye?.out === ENDER_EYE && eye.count === 1,
    `${eye?.name ?? "無し"} x${eye?.count ?? 0}`,
  );
  const eyeMoved = findRecipe(grid(2, ["..", "EB"], P), 2);
  check("形なしなので置く場所も順番も選ばない", eyeMoved?.out === ENDER_EYE);

  // **ロッドから直接アイを作れないこと。** 作れると 1 → 2 のパウダーが飛ばされて、
  // 要塞に通う回数が倍になる（ロッド 12 本必要になる）。
  const shortcut = findRecipe(grid(2, ["RE"], P), 2);
  check("ロッド + パールでは作れない（パウダーを挟む）", shortcut === null, shortcut?.name ?? "無し");
  const twoPowder = findRecipe(grid(2, ["BB"], P), 2);
  check("パウダー 2 個ではアイにならない", twoPowder === null, twoPowder?.name ?? "無し");
  const pearlAlone = findRecipe(grid(2, ["E."], P), 2);
  check("エンダーパールだけでは作れない", pearlAlone === null, pearlAlone?.name ?? "無し");

  // エンドポータルの枠は 12 個（2-9）。**1 枠に収まらないと持ち運びが別の話になる。**
  const PORTAL_EYES = 12;
  const rodsNeeded = Math.ceil(PORTAL_EYES / (powder?.count ?? 1));
  console.log(
    `      エンドポータルの ${PORTAL_EYES} 個 = ロッド ${rodsNeeded} 本 + パール ${PORTAL_EYES} 個` +
      `（1 枠の上限: アイ ${itemStackLimit(ENDER_EYE)} / パール ${itemStackLimit(ENDER_PEARL)}）`,
  );
  check(
    "エンドポータルぶん（12 個）が 1 枠に収まる",
    itemStackLimit(ENDER_EYE) >= PORTAL_EYES && itemStackLimit(ENDER_PEARL) >= PORTAL_EYES,
    `アイ ${itemStackLimit(ENDER_EYE)} / パール ${itemStackLimit(ENDER_PEARL)}`,
  );

  // 材料が減ること（形なしも 1 スロットにつき 1 個）。
  const eyeBoard = grid(2, ["BE"], P);
  eyeBoard[0].count = 3;
  consumeGrid(eyeBoard);
  check(
    "アイを 1 個作るとパウダーとパールが 1 個ずつ減る",
    eyeBoard[0].count === 2 && isEmpty(eyeBoard[1]),
    `パウダー ${eyeBoard[0].count} 個 / パール ${eyeBoard[1].count} 個`,
  );

  // --- 弓と矢（エンドクリスタルを離れた所から壊す手段） ---
  // **材料は棒 3 + 糸 3（本家と同じ）。糸はクモしか落とさない**ので、
  // 弓を作るにはクモを 3 匹倒すことになる（羊毛の代用だった頃と違い、ベッドと取り合わない）。
  const bow = findRecipe(grid(3, [".SG", "S.G", ".SG"], P), 3);
  check("棒 3 + 糸 3 → 弓 1 本", bow?.out === BOW && bow.count === 1, bow?.name ?? "無し");
  const bowMirrored = findRecipe(grid(3, ["GS.", "G.S", "GS."], P), 3);
  check("弓は左右どちらの向きでも作れる", bowMirrored?.out === BOW, bowMirrored?.name ?? "無し");
  const bowIn2 = findRecipe(grid(2, [".S", "S."], P), 2);
  check("2x2 では弓は作れない（作業台が要る）", bowIn2 === null, bowIn2?.name ?? "無し");
  // **羊毛の道が消えていること** —— 残っていると、クモを探さずに羊だけで弓が作れる。
  const bowFromWool = findRecipe(grid(3, [".SL", "S.L", ".SL"], P), 3);
  check("羊毛では弓が作れない（糸だけ）", bowFromWool === null, bowFromWool?.name ?? "無し");
  // **羊毛の使い道が消えていないこと** —— 弓から抜けたので、残るのはベッド 1 本だけ。
  const bed = findRecipe(grid(3, ["LLL", "PPP"], P), 3);
  check("ベッドは今までどおり羊毛 3 + 板 3", bed?.out === BED && bed.count === 1, `${bed?.name ?? "無し"} x${bed?.count ?? 0}`);

  // **糸を使うレシピはちょうど 1 本（弓）**。2 本目を足すのは別件（防具・本・釣り竿）。
  const stringRecipes = RECIPES.filter(
    (r) =>
      Object.values(r.key ?? {}).includes(STRING) || (r.ingredients ?? []).includes(STRING),
  );
  console.log(`      糸(${STRING}) を使うレシピ: ${stringRecipes.length} 本 [${stringRecipes.map((r) => r.name).join(", ") || "無し"}]`);
  check(
    "糸を使うレシピはちょうど 1 本（弓）",
    stringRecipes.length === 1 && stringRecipes[0].out === BOW,
    stringRecipes.map((r) => r.name).join(", ") || "無し",
  );

  // 矢は火打石 + 棒 + 羽根で 4 本（**本家と同じ形**。羽根は鶏が落とす）。
  // **3 段になったので 2x2 では作れません** —— 弓を持って出たまま作り足すことは
  // もうできない（本家の形に戻すのがこの周の目的。`TUNING.md`）。
  const arrowRows = ["F..", "S..", "N.."];
  console.log(`      矢の盤面（3 段）: ${arrowRows.join(" / ")}  火打石 / 棒 / 羽根`);
  const arrow = findRecipe(grid(3, arrowRows, P), 3);
  check("火打石 + 棒 + 羽根 → 矢 4 本", arrow?.out === ARROW && arrow.count === 4, `${arrow?.name} x${arrow?.count}`);
  const arrowIn2 = findRecipe(grid(2, ["F.", "S."], P), 2);
  check("2x2 では矢は作れない（3 段なので作業台が要る）", arrowIn2 === null, arrowIn2?.name ?? "無し");
  // **羽根を抜くと作れないこと**を見ること —— 抜いても作れるなら、鶏を探す意味が消える。
  const arrowNoFeather = findRecipe(grid(3, ["F..", "S..", "..."], P), 3);
  check("羽根を抜いた 2 段（火打石 + 棒）では作れない", arrowNoFeather === null, arrowNoFeather?.name ?? "無し");
  const arrowUpsideDown = findRecipe(grid(3, ["N..", "S..", "F.."], P), 3);
  check("上下を逆にすると矢にならない", arrowUpsideDown === null, arrowUpsideDown?.name ?? "無し");
  // **松明と取り違えないこと**（同じ「上に何か + 下に棒」の形で、上が石炭か火打石かだけが違う）。
  const torchAgain = findRecipe(grid(2, ["O.", "S."], P), 2);
  check("石炭のほうは今までどおり松明", torchAgain?.out === TORCH, torchAgain?.name ?? "無し");

  // 弓は 1 本あれば足りるが、**矢は 1 本ずつ枠を食うと使い物にならない。**
  console.log(
    `      1 枠の上限: 弓 ${itemStackLimit(BOW)} / 矢 ${itemStackLimit(ARROW)}` +
      `（矢 1 回のクラフトで ${arrow?.count ?? 0} 本）`,
  );
  check(
    "矢はまとめて持てる（弓は道具と同じで 1 本）",
    itemStackLimit(ARROW) >= 64 && itemStackLimit(BOW) === 1,
  );

  // --- パン（小麦に使い道ができる。Minecraft と同じ小麦 3 個の横一列） ---
  const bread = findRecipe(grid(3, ["HHH"], P), 3);
  console.log(
    `      小麦 3 個の横一列 → ${bread?.name ?? "無し"} / out ${bread?.out ?? "無し"} x${bread?.count ?? 0}`,
  );
  check("小麦 3 個の横一列 → パン 1 個", bread?.out === BREAD && bread.count === 1, bread?.name ?? "無し");
  const breadMoved = findRecipe(grid(3, ["...", "...", "HHH"], P), 3);
  check("端に寄せてもパンになる", breadMoved?.out === BREAD, breadMoved?.name ?? "無し");
  // **3 幅なので作業台が要る**（本家と同じ）。畑から戻る一手間が残る。
  const breadIn2 = findRecipe(grid(2, ["HH", ".."], P), 2);
  check("2x2 ではパンは作れない（作業台が要る）", breadIn2 === null, breadIn2?.name ?? "無し");
  const twoWheat = findRecipe(grid(3, ["HH."], P), 3);
  check("小麦 2 個ではパンにならない", twoWheat === null, twoWheat?.name ?? "無し");
  // **ハーフの `["MMM"]` と形は同じで材料だけが違う** —— 取り違えていないことを見る。
  const slabAgain = findRecipe(grid(3, ["TTT"], P), 3);
  check("石 3 個のほうは今までどおりパンにならない", slabAgain?.out !== BREAD, slabAgain?.name ?? "無し");

  // --- 盤面の広さ ---
  const pickIn3 = findRecipe(grid(3, ["PPP", ".S.", ".S."], P), 3);
  check("作業台で木のツルハシ", pickIn3?.out === WOOD_PICKAXE, pickIn3?.name ?? "無し");
  const pickIn2 = findRecipe(grid(2, ["PP", ".S"], P), 2);
  check("2x2 ではツルハシは作れない", pickIn2 === null);
  const shovel = findRecipe(grid(3, [".P.", ".S.", ".S."], P), 3);
  check("縦 3 のシャベルも作業台が要る", shovel?.out === WOOD_SHOVEL, shovel?.name ?? "無し");

  // --- 剣 4 本（材料 2 + 棒 1 の縦 3。Minecraft と同じ形） ---
  const swords: [string, string, number][] = [
    ["木の剣", "P", WOOD_SWORD],
    ["石の剣", "C", STONE_SWORD],
    ["鉄の剣", "I", IRON_SWORD],
    ["ダイヤの剣", "D", DIAMOND_SWORD],
  ];
  const made = swords.map(([name, ch, out]) => {
    const recipe = findRecipe(grid(3, [ch, ch, "S"], P), 3);
    return { name, out, recipe };
  });
  console.log(
    `      剣: ${made.map((m) => `${m.name} → ${m.recipe?.name ?? "作れない"} x${m.recipe?.count ?? 0}`).join(" / ")}`,
  );
  for (const { name, out, recipe } of made) {
    check(`材料 2 個 + 棒 1 → ${name} 1 本`, recipe?.out === out && recipe.count === 1, recipe?.name ?? "無し");
  }
  // **盤面のどこに置いても同じ**（`trim` が空の行・列を落とす）。
  const swordMoved = findRecipe(grid(3, ["..P", "..P", "..S"], P), 3);
  check("盤面の右端に寄せても同じ", swordMoved?.out === WOOD_SWORD, swordMoved?.name ?? "無し");
  // **3 行あるので 2x2 では作れない**（剣には作業台が要る）。
  const swordIn2 = findRecipe(grid(2, ["P.", "S."], P), 2);
  check("2x2 では剣は作れない（作業台が要る）", swordIn2 === null, swordIn2?.name ?? "無し");
  // シャベル（材料 1 + 棒 2）と上下 1 マスしか違わない。取り違えていないことを見る。
  const upsideDown = findRecipe(grid(3, ["P", "S", "S"], P), 3);
  check("上下を入れ替えるとシャベルになる（剣ではない）", upsideDown?.out === WOOD_SHOVEL, upsideDown?.name ?? "無し");
  const mixedSword = findRecipe(grid(3, ["P", "C", "S"], P), 3);
  check("材料が混ざった剣は作れない", mixedSword === null, mixedSword?.name ?? "無し");
  check("剣は 1 本しか積めない（道具と同じ）", itemStackLimit(WOOD_SWORD) === 1);

  // --- クワ 4 本（材料 2 個を横に並べて棒を縦 2。Minecraft と同じ形） ---
  const hoes: [string, string, number][] = [
    ["木のクワ", "P", WOOD_HOE],
    ["石のクワ", "C", STONE_HOE],
    ["鉄のクワ", "I", IRON_HOE],
    ["ダイヤのクワ", "D", DIAMOND_HOE],
  ];
  const madeHoes = hoes.map(([name, ch, out]) => {
    const recipe = findRecipe(grid(3, [ch + ch, ".S", ".S"], P), 3);
    return { name, out, recipe };
  });
  console.log(
    `      クワ: ${madeHoes.map((m) => `${m.name} → ${m.recipe?.name ?? "作れない"} x${m.recipe?.count ?? 0}`).join(" / ")}`,
  );
  for (const { name, out, recipe } of madeHoes) {
    check(`材料 2 個を横 + 棒縦 2 → ${name} 1 本`, recipe?.out === out && recipe.count === 1, recipe?.name ?? "無し");
  }
  // **3 行あるので 2x2 では作れない**（クワにも作業台が要る）。
  const hoeIn2 = findRecipe(grid(2, ["PP", ".S"], P), 2);
  check("2x2 ではクワは作れない（作業台が要る）", hoeIn2 === null, hoeIn2?.name ?? "無し");
  check("クワは 1 本しか積めない（道具と同じ）", itemStackLimit(WOOD_HOE) === 1);

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

  describe("鉱物をしまう／戻す（鉄・金・ダイヤ）");

  // **9 個 → 1 個 → 9 個。** 倉庫の枠を 9 分の 1 にするためだけの機能なので、
  // **しまう数と戻る数が食い違ったら壊れます**（片方が 8 なら、しまって戻すだけで目減り）。
  const stored: [string, number, number][] = [
    ["鉄", IRON_INGOT, IRON_BLOCK],
    ["金", GOLD_INGOT, GOLD_BLOCK],
    ["ダイヤ", DIAMOND, DIAMOND_BLOCK],
  ];
  for (const [name, ingot, block] of stored) {
    const key = { X: ingot, Z: block };
    const packed = findRecipe(grid(3, ["XXX", "XXX", "XXX"], key), 3);
    check(
      `${name} 9 個 → ブロック 1 個`,
      packed?.out === block && packed.count === 1,
      `${packed?.name ?? "無し"} x${packed?.count ?? 0}`,
    );
    const unpacked = findRecipe(grid(2, ["Z."], key), 2);
    check(
      `${name}ブロック 1 個 → ${name} 9 個`,
      unpacked?.out === ingot && unpacked.count === 9,
      `${unpacked?.name ?? "無し"} x${unpacked?.count ?? 0}`,
    );
    // **入れた数と戻った数の両方を出すこと。** 片方だけだと、9 → 1 → 8 に気付けない。
    const inCount = 9;
    const backCount = unpacked?.count ?? 0;
    console.log(`      ${name}: 入れた ${inCount} 個 → ブロック ${packed?.count ?? 0} 個 → 戻り ${backCount} 個`);
    check(`${name}はしまって戻すと個数が変わらない`, inCount === backCount, `${inCount} → ${backCount}`);
  }
  // **しまう側は 3x3 なので作業台が要る**（2x2 では作れない）。本家と同じ非対称で、
  // 戻す側は形なしなので手持ちの 2x2 でもできる。
  const packedIn2 = findRecipe(grid(2, ["II", "II"], P), 2);
  check(
    "2x2 では鉄ブロックにならない（作業台が要る）",
    packedIn2?.out !== IRON_BLOCK,
    packedIn2?.name ?? "無し",
  );
  // 8 個では成立しないこと（3x3 が埋まっていることが条件）。
  const eight = findRecipe(grid(3, ["III", "III", "II."], P), 3);
  check("鉄 8 個ではブロックにならない", eight === null, eight?.name ?? "無し");

  describe("クラフト");

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
