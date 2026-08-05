import { readFileSync } from "node:fs";
import { DIRT, PLANK, STONE, WOOD } from "../src/blocks";
import {
  CraftScreen,
  GRID_SLOTS,
  type MouseButton,
  planDrag,
  type SlotArea,
} from "../src/craftscreen";
import { Inventory, isEmpty, type Slot } from "../src/inventory";
import { MAX_STACK, NO_ITEM, STICK, WOOD_PICKAXE } from "../src/items";
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

/** クリック = 押して、同じ枠で離す。実際のブラウザと同じ経路を通す。 */
function click(craft: CraftScreen, area: SlotArea, index: number, button: MouseButton): void {
  craft.press(area, index, button);
  craft.release();
}

/** ドラッグ = 押して、順に撫でて、離す。 */
function drag(craft: CraftScreen, button: MouseButton, refs: [SlotArea, number][]): void {
  craft.press(refs[0][0], refs[0][1], button);
  for (const [area, index] of refs.slice(1)) craft.dragOver(area, index);
  craft.release();
}

/** 空きスロットを並べた盤面（planDrag を単体で試すため）。 */
function slots(spec: readonly (readonly [number, number])[]): Slot[] {
  return spec.map(([item, count]) => ({ item, count }));
}

const EMPTY4 = () => slots([[NO_ITEM, 0], [NO_ITEM, 0], [NO_ITEM, 0], [NO_ITEM, 0]]);

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
  click(grab, "grid", 0, 0);
  check("左クリックで山ごと掴む", grab.held?.count === 7 && isEmpty(grab.grid[0]), `手 ${grab.held?.count} 個`);

  const half = screen();
  put(half, 0, DIRT, 7);
  click(half, "grid", 0, 2);
  check(
    "右クリックで半分掴む（多いほうが手に来る）",
    half.held?.count === 4 && half.grid[0].count === 3,
    `手 ${half.held?.count} / 盤面 ${half.grid[0].count}`,
  );

  const putAll = screen();
  put(putAll, 0, DIRT, 7);
  click(putAll, "grid", 0, 0);
  click(putAll, "inv", 5, 0);
  check(
    "空きスロットへ左クリックで全部置く",
    putAll.held === null && putAll.inventory.slots[5].count === 7,
    `スロット5 ${putAll.inventory.slots[5].count} 個`,
  );

  const putOne = screen();
  put(putOne, 0, DIRT, 7);
  click(putOne, "grid", 0, 0);
  click(putOne, "inv", 5, 2);
  check(
    "空きスロットへ右クリックで 1 個だけ置く",
    putOne.held?.count === 6 && putOne.inventory.slots[5].count === 1,
    `手 ${putOne.held?.count}`,
  );

  const merge = screen();
  merge.inventory.slots[0].item = DIRT;
  merge.inventory.slots[0].count = 60;
  put(merge, 0, DIRT, 20);
  click(merge, "grid", 0, 0);
  click(merge, "inv", 0, 0);
  check(
    "同じアイテムは上限まで合流し、余りは手に残る",
    merge.inventory.slots[0].count === MAX_STACK && merge.held?.count === 16,
    `スロット ${merge.inventory.slots[0].count} / 手 ${merge.held?.count}`,
  );

  const swapItems = screen();
  swapItems.inventory.slots[0].item = STONE;
  swapItems.inventory.slots[0].count = 5;
  put(swapItems, 0, DIRT, 3);
  click(swapItems, "grid", 0, 0);
  click(swapItems, "inv", 0, 0);
  check(
    "別アイテムは左クリックで入れ替わる",
    swapItems.inventory.slots[0].item === DIRT && swapItems.held?.item === STONE,
    `スロット ${swapItems.inventory.slots[0].item} / 手 ${swapItems.held?.item}`,
  );
  const heldBefore = swapItems.held?.count ?? 0;
  click(swapItems, "inv", 0, 2);
  check(
    "別アイテムは右クリックでは何も起きない",
    swapItems.held?.count === heldBefore && swapItems.inventory.slots[0].item === DIRT,
  );

  const tool = screen();
  tool.inventory.slots[0].item = WOOD_PICKAXE;
  tool.inventory.slots[0].count = 1;
  put(tool, 0, WOOD_PICKAXE, 1);
  click(tool, "grid", 0, 0);
  click(tool, "inv", 0, 0);
  check(
    "上限 1 の道具は合流できず手に残る",
    tool.held?.count === 1 && tool.inventory.slots[0].count === 1,
    `手 ${tool.held?.count}`,
  );

  const locked = screen(2);
  put(locked, 2, DIRT, 5); // 2x2 では使えない枠
  click(locked, "grid", 2, 0);
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
  click(closing, "grid", 0, 0); // 手に 5 個
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

  // 満杯だと閉じても手に残る。だから inventoryui.ts は「held が空か」ではなく
  // 「画面が開いているか」で #held を出し分ける（残っているとカーソルに表示が居座る）。
  const stuck = screen(3);
  stuck.inventory.add(DIRT, 36 * MAX_STACK);
  click(stuck, "inv", 0, 0); // 満杯のスロットから 64 個掴む
  stuck.inventory.add(STONE, MAX_STACK); // 空いた枠を別のもので埋め直す
  stuck.close();
  check(
    "満杯なら閉じても手に残る（表示は isOpen で切る）",
    stuck.held?.count === MAX_STACK && !stuck.isOpen,
    `手 ${stuck.held?.count} 個 / isOpen ${stuck.isOpen}`,
  );

  check("盤面は常に 9 枠", screen().grid.length === GRID_SLOTS);

  // --- 配り方（純関数） ---
  describe("インベントリ画面（ドラッグの配り方）");

  const cases: [string, Slot[], number, number, boolean, number[]][] = [
    ["10 個を空 4 枠へ均等", EMPTY4(), DIRT, 10, true, [2, 2, 2, 2]],
    ["3 個を空 4 枠へ均等（1 個ずつで打ち切り）", EMPTY4(), DIRT, 3, true, [1, 1, 1, 0]],
    ["4 個を空 4 枠へ均等（ちょうど）", EMPTY4(), DIRT, 4, true, [1, 1, 1, 1]],
    ["5 個を右ドラッグで 4 枠へ", EMPTY4(), DIRT, 5, false, [1, 1, 1, 1]],
    ["2 個を右ドラッグで 4 枠へ", EMPTY4(), DIRT, 2, false, [1, 1, 0, 0]],
    [
      "別アイテムの枠は飛ばす",
      slots([[NO_ITEM, 0], [STONE, 5], [NO_ITEM, 0], [NO_ITEM, 0]]),
      DIRT,
      64,
      true,
      [21, 0, 21, 21],
    ],
    [
      "同じアイテムの空きぶんだけ入る",
      slots([[DIRT, 60], [NO_ITEM, 0]]),
      DIRT,
      42,
      true,
      [4, 21],
    ],
    ["満杯の枠には配らない", slots([[DIRT, MAX_STACK], [NO_ITEM, 0]]), DIRT, 10, true, [0, 10]],
    ["配れる枠が無ければ全部 0", slots([[STONE, 1], [STONE, 1]]), DIRT, 10, true, [0, 0]],
    ["上限 1 の道具は 1 枠 1 個", EMPTY4(), WOOD_PICKAXE, 3, true, [1, 1, 1, 0]],
    ["手が空なら何も配らない", EMPTY4(), NO_ITEM, 5, true, [0, 0, 0, 0]],
  ];

  let conserved = 0;
  for (const [label, targets, item, total, even, want] of cases) {
    const got = planDrag(targets, item, total, even);
    check(label, got.join(",") === want.join(","), `${got.join(",")} / 期待 ${want.join(",")}`);
    // 配った合計 + 手に残る数 = 開始時の数。崩れるとアイテムが増減する。
    const sum = got.reduce((a, b) => a + b, 0);
    if (sum <= total && total - sum >= 0) conserved++;
  }
  check("どの配り方でもアイテムが増減しない", conserved === cases.length, `${conserved} / ${cases.length} 件`);

  // --- 状態機械 ---
  describe("インベントリ画面（ドラッグの状態機械）");

  /** 10 個を掴んだ状態から始める（配るには先に掴んでいる必要がある）。 */
  function holding(count = 10, item = DIRT): CraftScreen {
    const craft = screen();
    craft.inventory.slots[0].item = item;
    craft.inventory.slots[0].count = count;
    click(craft, "inv", 0, 0);
    return craft;
  }

  const even = holding(10);
  drag(even, 0, [["inv", 1], ["inv", 2], ["inv", 3], ["inv", 4]]);
  check(
    "左ドラッグで均等に配れる",
    [1, 2, 3, 4].every((i) => even.inventory.slots[i].count === 2),
    `${even.inventory.slots.slice(1, 5).map((s) => s.count).join(",")}`,
  );
  check("余りは手に残る", even.held?.count === 2, `手 ${even.held?.count} 個`);

  const one = holding(10);
  drag(one, 2, [["inv", 1], ["inv", 2], ["inv", 3]]);
  check(
    "右ドラッグは 1 個ずつ",
    [1, 2, 3].every((i) => one.inventory.slots[i].count === 1),
    `${one.inventory.slots.slice(1, 4).map((s) => s.count).join(",")}`,
  );
  check("右ドラッグでも残りは手に", one.held?.count === 7, `手 ${one.held?.count} 個`);

  const onto = holding(20);
  onto.inventory.slots[1].item = DIRT;
  onto.inventory.slots[1].count = 5;
  onto.inventory.slots[2].item = STONE;
  onto.inventory.slots[2].count = 5;
  drag(onto, 0, [["inv", 1], ["inv", 2], ["inv", 3]]);
  check(
    "同じアイテムの枠には足し、別アイテムの枠は飛ばす",
    onto.inventory.slots[1].count === 15 && onto.inventory.slots[2].count === 5 &&
      onto.inventory.slots[3].count === 10,
    `${onto.inventory.slots.slice(1, 4).map((s) => s.count).join(",")}`,
  );

  // 撫でたのが 1 枠だけなら「今までのクリック」。ドラッグの規則（別アイテムは飛ばす）を
  // ここに掛けると、入れ替え操作が黙って効かなくなる。
  const single = screen();
  single.inventory.slots[0].item = STONE;
  single.inventory.slots[0].count = 5;
  single.inventory.slots[1].item = DIRT;
  single.inventory.slots[1].count = 3;
  click(single, "inv", 0, 0);
  drag(single, 0, [["inv", 1]]);
  check(
    "1 枠だけなら別アイテムでも入れ替わる（クリックと同じ）",
    single.inventory.slots[1].item === STONE && single.held?.item === DIRT,
    `スロット ${single.inventory.slots[1].item} / 手 ${single.held?.item}`,
  );

  const twiceOver = holding(9);
  twiceOver.press("inv", 1, 0);
  twiceOver.dragOver("inv", 2);
  twiceOver.dragOver("inv", 2); // 同じ枠を撫で直す
  twiceOver.dragOver("inv", 3);
  twiceOver.release();
  check(
    "同じ枠を 2 回撫でても二重に配らない",
    [1, 2, 3].every((i) => twiceOver.inventory.slots[i].count === 3),
    `${twiceOver.inventory.slots.slice(1, 4).map((s) => s.count).join(",")}`,
  );

  const releaseTwice = holding(8);
  releaseTwice.press("inv", 1, 0);
  releaseTwice.dragOver("inv", 2);
  releaseTwice.release();
  const afterFirst = releaseTwice.inventory.slots[1].count;
  const second = releaseTwice.release();
  check(
    "release を 2 回呼んでも 2 回配らない",
    !second.changed && releaseTwice.inventory.slots[1].count === afterFirst,
    `${afterFirst} 個のまま`,
  );

  const bare = screen();
  check("構えていないのに release しても何も起きない", !bare.release().changed);

  const emptyHand = screen();
  emptyHand.inventory.slots[0].item = DIRT;
  emptyHand.inventory.slots[0].count = 8;
  emptyHand.press("inv", 0, 0);
  check("手が空なら押した時点で掴み、ドラッグは始まらない", !emptyHand.isDragging && emptyHand.held?.count === 8);

  const armed = screen();
  armed.inventory.slots[0].item = DIRT;
  armed.inventory.slots[0].count = 8;
  click(armed, "inv", 0, 0);
  armed.press("inv", 1, 0);
  check("掴んだまま押すと構える（まだ書かない）", armed.isDragging && isEmpty(armed.inventory.slots[1]));
  armed.cancelDrag();
  armed.release();
  check(
    "cancelDrag のあとの release は効かない",
    armed.held?.count === 8 && isEmpty(armed.inventory.slots[1]),
    `手 ${armed.held?.count} 個`,
  );

  const outer = screen(2);
  outer.inventory.slots[0].item = DIRT;
  outer.inventory.slots[0].count = 8;
  click(outer, "inv", 0, 0);
  drag(outer, 0, [["grid", 0], ["grid", 2], ["grid", 5]]); // 2 と 5 は 2x2 の外
  check(
    "2x2 の外周はドラッグの対象にならない",
    outer.grid[0].count === 8 && isEmpty(outer.grid[2]) && isEmpty(outer.grid[5]),
    `枠0 ${outer.grid[0].count} / 枠2 ${outer.grid[2].count}`,
  );

  const closeMid = screen();
  closeMid.inventory.slots[0].item = DIRT;
  closeMid.inventory.slots[0].count = 8;
  click(closeMid, "inv", 0, 0);
  closeMid.press("inv", 1, 0);
  closeMid.close();
  check(
    "ドラッグ中に閉じても手持ちは戻る",
    closeMid.inventory.count(DIRT) === 8 && closeMid.held === null && !closeMid.isDragging,
    `土 ${closeMid.inventory.count(DIRT)} 個`,
  );

  // --- プレビュー（確定と同じ planDrag を通ること） ---
  const preview = holding(10);
  preview.press("inv", 1, 0);
  preview.dragOver("inv", 2);
  preview.dragOver("inv", 3);
  preview.dragOver("inv", 4);
  const planned = [1, 2, 3, 4].map((i) => preview.dragPlanFor("inv", i));
  const leftInHand = preview.heldPreviewCount();
  check("撫でている枠に配る予定が出る", planned.join(",") === "2,2,2,2", planned.join(","));
  check("撫でていない枠には予定が出ない", preview.dragPlanFor("inv", 8) === 0);
  check("手に残る予定も出る", leftInHand === 2, `${leftInHand} 個`);
  check("予定を見ただけでは盤面が変わらない", preview.inventory.slots[1].count === 0);
  preview.release();
  check(
    "プレビューと確定が一致する",
    [1, 2, 3, 4].every((i, k) => preview.inventory.slots[i].count === planned[k]) &&
      preview.held?.count === leftInHand,
    `確定 ${preview.inventory.slots.slice(1, 5).map((s) => s.count).join(",")} / 手 ${preview.held?.count}`,
  );
  check("離したら予定は消える", preview.dragPlanFor("inv", 1) === 0 && !preview.isDragging);

  // --- 破棄 ---
  describe("インベントリ画面（捨てる）");

  // 落ちたアイテムの仕組みが無いので、捨てたものは戻らない。
  // 「総数が本当に減っている」ことまで見る（どこかに残っていたら破棄になっていない）。
  const dropOne = holding(10);
  const dropped = dropOne.discardHeld(false);
  check("Q で 1 個捨てる", dropOne.held?.count === 9, `手 ${dropOne.held?.count} 個`);
  check(
    "何を捨てたかが返る",
    dropped.discarded?.item === DIRT && dropped.discarded.count === 1,
    `${dropped.discarded?.item} x${dropped.discarded?.count}`,
  );
  check(
    "捨てたぶんは世界のどこにも残らない",
    dropOne.inventory.count(DIRT) + (dropOne.held?.count ?? 0) === 9,
    `インベントリ ${dropOne.inventory.count(DIRT)} + 手 ${dropOne.held?.count}`,
  );

  const dropAll = holding(10);
  const wiped = dropAll.discardHeld(true);
  check("暗幕を左クリックで山ごと捨てる", dropAll.held === null, `手 ${dropAll.held?.count ?? 0} 個`);
  check("捨てた数も返る", wiped.discarded?.count === 10, `x${wiped.discarded?.count}`);
  check("総数が 10 減っている", dropAll.inventory.count(DIRT) === 0, `${dropAll.inventory.count(DIRT)} 個`);

  const nothingHeld = screen();
  const noop = nothingHeld.discardHeld(true);
  check("何も掴んでいなければ捨てられない", noop.discarded === null && !noop.changed);

  const keepGrid = holding(5);
  put(keepGrid, 0, STONE, 3);
  keepGrid.discardHeld(true);
  check("捨てても盤面は変わらない", keepGrid.grid[0].count === 3, `枠0 ${keepGrid.grid[0].count} 個`);

  // 撫でた先に配るつもりだったものを、途中で消してしまわないこと。
  const midDrag = holding(10);
  midDrag.press("inv", 1, 0);
  midDrag.dragOver("inv", 2);
  const duringDrag = midDrag.discardHeld(true);
  check(
    "ドラッグを構えている間は捨てない",
    duringDrag.discarded === null && midDrag.held?.count === 10,
    `手 ${midDrag.held?.count} 個`,
  );
  midDrag.release();
  check("離せばそのまま配られる", midDrag.inventory.count(DIRT) === 10, `${midDrag.inventory.count(DIRT)} 個`);
}
