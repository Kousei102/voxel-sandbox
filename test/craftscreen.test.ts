import { readFileSync } from "node:fs";
import { DIRT, PLANK, STONE, WOOD } from "../src/blocks";
import { CraftScreen, GRID_SLOTS } from "../src/craftscreen";
import { Inventory, isEmpty } from "../src/inventory";
import { MAX_STACK, STICK, WOOD_PICKAXE } from "../src/items";
import { check, describe } from "./harness";

function stripComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** 画面を 1 つ用意する。size は 2 = 手持ち / 3 = 作業台。 */
function screen(size: 2 | 3 = 2): CraftScreen {
  const craft = new CraftScreen(new Inventory());
  craft.openScreen(size);
  return craft;
}

/** 盤面のマスに直接積む（クリックを経由せずに材料を用意する）。 */
function put(craft: CraftScreen, index: number, item: number, count = 1): void {
  craft.grid[index].item = item;
  craft.grid[index].count = count;
}

export function run(): void {
  describe("インベントリ画面（判断と描画の切り分け）");

  // 描画はこの環境では確かめられない。だから「判断」は craftscreen.ts に閉じ込めてあり、
  // DOM を触るのは inventoryui.ts だけ。ここが崩れると、インベントリまわりが丸ごと
  // 「ブラウザを開くまで確かめられないもの」になる。
  const modelSource = stripComments("src/craftscreen.ts");
  const dom = [
    "document",
    "getElementById",
    "HTMLElement",
    "addEventListener",
    "classList",
    "innerHTML",
    "clientX",
    "window.",
    'from "three"',
  ].filter((name) => modelSource.includes(name));
  check("craftscreen.ts は DOM に触らない", dom.length === 0, dom.join(" "));

  // 逆向き。判断が描画側へ漏れていないか（漏れると、その判断だけテストが届かなくなる）。
  const uiSource = stripComments("src/inventoryui.ts");
  check(
    "inventoryui.ts は crafting.ts を import しない",
    !uiSource.includes('from "./crafting"'),
    "レシピの判断が UI に戻っている",
  );
  const decisions = [
    "findRecipe",
    "consumeGrid",
    "itemStackLimit",
    "Math.ceil",
    "Math.floor",
    "NO_ITEM",
    "isEmpty(",
  ].filter((name) => uiSource.includes(name));
  check("inventoryui.ts に判断が漏れていない", decisions.length === 0, decisions.join(" "));

  const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;
  console.log(
    `      craftscreen.ts ${lines("src/craftscreen.ts")} 行 /` +
      ` inventoryui.ts ${lines("src/inventoryui.ts")} 行`,
  );

  // --- 掴む・置く（今までの挙動をそのまま固定する） ---
  describe("インベントリ画面（掴む・置く）");

  const grab = screen();
  put(grab, 0, DIRT, 7);
  grab.click("grid", 0, 0);
  check("左クリックで山ごと掴む", grab.held?.count === 7 && isEmpty(grab.grid[0]), `手 ${grab.held?.count} 個`);

  const half = screen();
  put(half, 0, DIRT, 7);
  half.click("grid", 0, 2);
  check(
    "右クリックで半分掴む（多いほうが手に来る）",
    half.held?.count === 4 && half.grid[0].count === 3,
    `手 ${half.held?.count} / 盤面 ${half.grid[0].count}`,
  );

  const putAll = screen();
  put(putAll, 0, DIRT, 7);
  putAll.click("grid", 0, 0);
  putAll.click("inv", 5, 0);
  check(
    "空きスロットへ左クリックで全部置く",
    putAll.held === null && putAll.inventory.slots[5].count === 7,
    `スロット5 ${putAll.inventory.slots[5].count} 個`,
  );

  const putOne = screen();
  put(putOne, 0, DIRT, 7);
  putOne.click("grid", 0, 0);
  putOne.click("inv", 5, 2);
  check(
    "空きスロットへ右クリックで 1 個だけ置く",
    putOne.held?.count === 6 && putOne.inventory.slots[5].count === 1,
    `手 ${putOne.held?.count}`,
  );

  const merge = screen();
  merge.inventory.slots[0].item = DIRT;
  merge.inventory.slots[0].count = 60;
  put(merge, 0, DIRT, 20);
  merge.click("grid", 0, 0);
  merge.click("inv", 0, 0);
  check(
    "同じアイテムは上限まで合流し、余りは手に残る",
    merge.inventory.slots[0].count === MAX_STACK && merge.held?.count === 16,
    `スロット ${merge.inventory.slots[0].count} / 手 ${merge.held?.count}`,
  );

  const swapItems = screen();
  swapItems.inventory.slots[0].item = STONE;
  swapItems.inventory.slots[0].count = 5;
  put(swapItems, 0, DIRT, 3);
  swapItems.click("grid", 0, 0);
  swapItems.click("inv", 0, 0);
  check(
    "別アイテムは左クリックで入れ替わる",
    swapItems.inventory.slots[0].item === DIRT && swapItems.held?.item === STONE,
    `スロット ${swapItems.inventory.slots[0].item} / 手 ${swapItems.held?.item}`,
  );
  const heldBefore = swapItems.held?.count ?? 0;
  swapItems.click("inv", 0, 2);
  check(
    "別アイテムは右クリックでは何も起きない",
    swapItems.held?.count === heldBefore && swapItems.inventory.slots[0].item === DIRT,
  );

  const tool = screen();
  tool.inventory.slots[0].item = WOOD_PICKAXE;
  tool.inventory.slots[0].count = 1;
  put(tool, 0, WOOD_PICKAXE, 1);
  tool.click("grid", 0, 0);
  tool.click("inv", 0, 0);
  check(
    "上限 1 の道具は合流できず手に残る",
    tool.held?.count === 1 && tool.inventory.slots[0].count === 1,
    `手 ${tool.held?.count}`,
  );

  const locked = screen(2);
  put(locked, 2, DIRT, 5); // 2x2 では使えない枠
  locked.click("grid", 2, 0);
  check("2x2 で使えない枠は掴めない", locked.held === null && locked.grid[2].count === 5);
  check("2x2 の外周は usable が false", !locked.usable(2) && !locked.usable(8) && locked.usable(4));
  check("3x3 では全部使える", screen(3).usable(8));

  // --- クラフト（activeGrid の参照共有） ---
  describe("インベントリ画面（クラフト）");

  // activeGrid() が同じ Slot 参照を並べ替えて返すことに consumeGrid が乗っている。
  // コピーにすると「作れるのに材料が減らない」（画面を見ないと気付けない）。
  const craft2 = screen(2);
  put(craft2, 0, PLANK, 3);
  put(craft2, 3, PLANK, 3);
  put(craft2, 2, STONE, 9); // 2x2 では使わない枠。無傷であること
  const stickResult = craft2.result();
  check("2x2 の縦 2 枚で棒ができる", stickResult?.item === STICK && stickResult.count === 4, `${stickResult?.name}`);
  const taken = craft2.takeResult();
  check("取り出すとクラフト成立が返る", taken.crafted && taken.changed);
  check("手に出来上がりが乗る", craft2.held?.item === STICK && craft2.held.count === 4);
  check(
    "使った枠だけ 1 個ずつ減る",
    craft2.grid[0].count === 2 && craft2.grid[3].count === 2,
    `${craft2.grid[0].count} / ${craft2.grid[3].count}`,
  );
  check(
    "2x2 で使わない枠は無傷",
    craft2.grid[2].count === 9 && craft2.grid.slice(4).every(isEmpty),
    `枠2 ${craft2.grid[2].count} 個`,
  );

  // 2x2 の並べ替えは [0,1,3,4]。中央（index 4）が材料として効くか。
  const center = screen(2);
  put(center, 1, PLANK, 1);
  put(center, 4, PLANK, 1);
  check("2x2 の右列（1 と 4）でも棒になる", center.result()?.item === STICK);

  const craft3 = screen(3);
  put(craft3, 0, PLANK, 1);
  put(craft3, 1, PLANK, 1);
  put(craft3, 2, PLANK, 1);
  put(craft3, 4, STICK, 1);
  put(craft3, 7, STICK, 1);
  check("3x3 で木のツルハシが作れる", craft3.result()?.item === WOOD_PICKAXE, `${craft3.result()?.name}`);
  craft3.takeResult();
  check(
    "3x3 でも使った枠だけ空になる",
    craft3.grid.every(isEmpty),
    `残り ${craft3.grid.filter((s) => !isEmpty(s)).length} 枠`,
  );

  const noRecipe = screen(2);
  put(noRecipe, 0, STONE, 1);
  check("成立しない盤面では出来上がりが無い", noRecipe.result() === null);
  check("取り出しても何も起きない", !noRecipe.takeResult().changed && noRecipe.held === null);

  const fullHand = screen(2);
  put(fullHand, 0, WOOD, 1);
  fullHand.takeResult();
  put(fullHand, 0, STONE, 1);
  const beforeCount = fullHand.held?.count ?? 0;
  check("板 4 枚を掴んだ", fullHand.held?.item === PLANK && beforeCount === 4);
  check("別アイテムの盤面からは取り出せない", !fullHand.takeResult().changed && fullHand.held?.count === 4);

  // --- 閉じるときの返却 ---
  describe("インベントリ画面（返却）");

  const closing = screen(3);
  put(closing, 0, DIRT, 5);
  put(closing, 8, STONE, 3);
  closing.click("grid", 0, 0); // 手に 5 個
  closing.close();
  check(
    "閉じると盤面も手持ちもインベントリへ戻る",
    closing.inventory.count(DIRT) === 5 && closing.inventory.count(STONE) === 3,
    `土 ${closing.inventory.count(DIRT)} / 石 ${closing.inventory.count(STONE)}`,
  );
  check("戻したあとの盤面と手は空", closing.grid.every(isEmpty) && closing.held === null);
  check("閉じたら isOpen が false", !closing.isOpen);

  // 冪等。2 回呼んでもアイテムは増えない。
  const twice = screen(3);
  put(twice, 0, DIRT, 5);
  twice.returnAll();
  twice.returnAll();
  check("returnAll を 2 回呼んでも増えない", twice.inventory.count(DIRT) === 5, `${twice.inventory.count(DIRT)} 個`);

  // 満杯なら戻しきれず盤面に残る（消えはしない）。
  const overflow = screen(3);
  overflow.inventory.add(STONE, 36 * MAX_STACK);
  put(overflow, 0, STONE, 10);
  overflow.returnAll();
  check(
    "満杯なら戻りきらずに盤面へ残る",
    overflow.grid[0].count === 10 && overflow.inventory.count(STONE) === 36 * MAX_STACK,
    `盤面 ${overflow.grid[0].count} 個`,
  );

  check("盤面は常に 9 枠", screen().grid.length === GRID_SLOTS);
}
