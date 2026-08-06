import { readFileSync } from "node:fs";
import { DIRT, PLANK, STONE, WOOD } from "../src/blocks";
import {
  CraftScreen,
  GRID_SLOTS,
  type MouseButton,
  planDrag,
  type SlotArea,
} from "../src/craftscreen";
import { HOTBAR_SIZE, Inventory, isEmpty, type Slot } from "../src/inventory";
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
  for (const [area, index] of refs.slice(1)) craft.hover(area, index, true);
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

  // discardAll は returnAll と違い、インベントリへ一切戻さず盤面と手を空にする（完全リセット用）。
  const discarding = screen(3);
  put(discarding, 0, DIRT, 5);
  put(discarding, 8, STONE, 3);
  click(discarding, "grid", 0, 0); // 手に 5 個
  discarding.discardAll();
  check("discardAll で盤面と手が空になる", discarding.grid.every(isEmpty) && discarding.held === null);
  check(
    "discardAll はインベントリへ戻さない",
    discarding.inventory.count(DIRT) === 0 && discarding.inventory.count(STONE) === 0,
    `土 ${discarding.inventory.count(DIRT)} / 石 ${discarding.inventory.count(STONE)}`,
  );

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
  twiceOver.hover("inv", 2, true);
  twiceOver.hover("inv", 2, true); // 同じ枠を撫で直す
  twiceOver.hover("inv", 3, true);
  twiceOver.release();
  check(
    "同じ枠を 2 回撫でても二重に配らない",
    [1, 2, 3].every((i) => twiceOver.inventory.slots[i].count === 3),
    `${twiceOver.inventory.slots.slice(1, 4).map((s) => s.count).join(",")}`,
  );

  const releaseTwice = holding(8);
  releaseTwice.press("inv", 1, 0);
  releaseTwice.hover("inv", 2, true);
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
  preview.hover("inv", 2, true);
  preview.hover("inv", 3, true);
  preview.hover("inv", 4, true);
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

  // 捨てたぶんは `onDiscard` で外へ出て、`main.ts` が地面に落とす（インベントリには戻らない）。
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
  midDrag.hover("inv", 2, true);
  const duringDrag = midDrag.discardHeld(true);
  check(
    "ドラッグを構えている間は捨てない",
    duringDrag.discarded === null && midDrag.held?.count === 10,
    `手 ${midDrag.held?.count} 個`,
  );
  midDrag.release();
  check("離せばそのまま配られる", midDrag.inventory.count(DIRT) === 10, `${midDrag.inventory.count(DIRT)} 個`);

  // --- セーブ ---
  describe("インベントリ画面（セーブ）");

  // craft は「省略可・無ければ既定」で足したキーなので、version は 1 のままでなければならない。
  // 2 に上げると load() が既存プレイヤーのワールドを丸ごと弾く。
  const storageSource = stripComments("src/storage.ts");
  check(
    "セーブの version を上げていない（古いセーブが読める）",
    storageSource.includes("version !== 1") && storageSource.includes("version: 1"),
    "version を上げると既存のワールドが全部読めなくなる",
  );

  const empty = screen(3);
  check("空なら保存しない（キーごと省く）", empty.serialize() === undefined);

  const saving = holding(10);
  put(saving, 0, STONE, 4);
  put(saving, 8, PLANK, 2);
  const flat = saving.serialize() as number[];
  check("盤面 9 + 手 1 の 20 要素", flat?.length === 20, `${flat?.length} 要素`);
  check(
    "並びは盤面 0..8 のあと手",
    flat[0] === STONE && flat[1] === 4 && flat[16] === PLANK && flat[17] === 2 &&
      flat[18] === DIRT && flat[19] === 10,
    flat.join(","),
  );
  check("空きは 0,0 で位置を保つ", flat.slice(2, 16).every((n) => n === 0));

  const loaded = screen(3);
  loaded.deserialize(JSON.parse(JSON.stringify(flat)) as number[]);
  check(
    "JSON を通しても往復で一致する",
    (loaded.serialize() as number[]).join(",") === flat.join(","),
    (loaded.serialize() as number[]).join(","),
  );

  const wiped2 = screen(3);
  put(wiped2, 0, STONE, 4);
  wiped2.deserialize(undefined);
  check("保存データが無ければ空になる", wiped2.grid.every(isEmpty) && wiped2.held === null);

  const clamped = screen(3);
  clamped.deserialize([STONE, 999, ...Array(18).fill(0)]);
  check("壊れた保存データでも上限を超えない", clamped.grid[0].count === MAX_STACK, `${clamped.grid[0].count} 個`);

  // 読み込み直後の運び。inventory を入れてから craft を返すこと。
  const restart = new CraftScreen(new Inventory());
  restart.deserialize(flat);
  restart.returnAll();
  check(
    "読み込んだ盤面と手はインベントリへ返る",
    restart.inventory.count(STONE) === 4 && restart.inventory.count(PLANK) === 2 &&
      restart.inventory.count(DIRT) === 10,
    `石 ${restart.inventory.count(STONE)} / 板 ${restart.inventory.count(PLANK)} / 土 ${restart.inventory.count(DIRT)}`,
  );
  check("返したあとは保存するものが無い", restart.serialize() === undefined);

  // 二重に返らないこと（閉じるときの返却とセーブの両方が効いても増えない）。
  const noDouble = new CraftScreen(new Inventory());
  noDouble.deserialize(flat);
  noDouble.returnAll();
  noDouble.returnAll();
  check("2 回返してもアイテムが増えない", noDouble.inventory.count(DIRT) === 10, `土 ${noDouble.inventory.count(DIRT)} 個`);

  // --- シフトクリックの一発移動 ---
  describe("インベントリ画面（シフトクリック）");

  const SHIFT = { shift: true, double: false };
  const DOUBLE = { shift: false, double: true };

  const toStorage = screen();
  toStorage.inventory.slots[3].item = DIRT;
  toStorage.inventory.slots[3].count = 12;
  toStorage.press("inv", 3, 0, SHIFT);
  check(
    "ホットバーから収納へ飛ぶ",
    isEmpty(toStorage.inventory.slots[3]) && toStorage.inventory.slots[HOTBAR_SIZE].count === 12,
    `収納の先頭 ${toStorage.inventory.slots[HOTBAR_SIZE].count} 個`,
  );

  const toHotbar = screen();
  toHotbar.inventory.slots[20].item = STONE;
  toHotbar.inventory.slots[20].count = 7;
  toHotbar.press("inv", 20, 0, SHIFT);
  check(
    "収納からホットバーへ戻る",
    isEmpty(toHotbar.inventory.slots[20]) && toHotbar.inventory.slots[0].count === 7,
    `ホットバー先頭 ${toHotbar.inventory.slots[0].count} 個`,
  );

  const fromGrid = screen(3);
  put(fromGrid, 4, PLANK, 9);
  fromGrid.press("grid", 4, 0, SHIFT);
  check(
    "盤面からインベントリへ飛ぶ",
    isEmpty(fromGrid.grid[4]) && fromGrid.inventory.count(PLANK) === 9,
    `板 ${fromGrid.inventory.count(PLANK)} 個`,
  );

  // 行き先が満杯なら、動いたぶんだけ減って残りはその場に残る（黙って消さない）。
  const partial = screen();
  for (let i = HOTBAR_SIZE; i < 36; i++) {
    partial.inventory.slots[i].item = STONE;
    partial.inventory.slots[i].count = MAX_STACK;
  }
  partial.inventory.slots[35].count = MAX_STACK - 5;
  partial.inventory.slots[0].item = STONE;
  partial.inventory.slots[0].count = 20;
  partial.press("inv", 0, 0, SHIFT);
  check(
    "行き先に入るぶんだけ動き、残りはその場に残る",
    partial.inventory.slots[0].count === 15 && partial.inventory.slots[35].count === MAX_STACK,
    `手元に ${partial.inventory.slots[0].count} 個残る`,
  );

  const stuckFull = screen();
  for (let i = HOTBAR_SIZE; i < 36; i++) {
    stuckFull.inventory.slots[i].item = STONE;
    stuckFull.inventory.slots[i].count = MAX_STACK;
  }
  stuckFull.inventory.slots[0].item = DIRT;
  stuckFull.inventory.slots[0].count = 5;
  check("1 個も動かないなら何も起きない", !stuckFull.press("inv", 0, 0, SHIFT).changed);

  const holdingShift = holding(10);
  holdingShift.inventory.slots[5].item = STONE;
  holdingShift.inventory.slots[5].count = 3;
  holdingShift.press("inv", 5, 0, SHIFT);
  check(
    "掴んでいる間はシフトクリックが効かない",
    holdingShift.inventory.slots[5].count === 3 && holdingShift.held?.count === 10,
    `スロット5 ${holdingShift.inventory.slots[5].count} / 手 ${holdingShift.held?.count}`,
  );

  // 結果スロットのシフトクリック = 作れるだけ作ってインベントリへ直接。
  const bulk = screen(2);
  put(bulk, 0, WOOD, 5);
  const bulkResult = bulk.takeResult(true);
  check("一括クラフトが成立する", bulkResult.crafted);
  check(
    "原木 5 個から板 20 枚（掴んでいる山を経由しない）",
    bulk.inventory.count(PLANK) === 20 && bulk.held === null && isEmpty(bulk.grid[0]),
    `板 ${bulk.inventory.count(PLANK)} 枚 / 手 ${bulk.held?.count ?? 0}`,
  );

  // 入りきらなくなったら止める（作ってから捨てることになってはいけない）。
  const bulkFull = screen(2);
  put(bulkFull, 0, WOOD, 5);
  for (let i = 0; i < 35; i++) {
    bulkFull.inventory.slots[i].item = STONE;
    bulkFull.inventory.slots[i].count = MAX_STACK;
  }
  bulkFull.inventory.slots[35].item = PLANK;
  bulkFull.inventory.slots[35].count = MAX_STACK - 9;
  bulkFull.takeResult(true);
  check(
    "入りきらなくなったら止まる",
    bulkFull.inventory.slots[35].count === MAX_STACK - 1 && bulkFull.grid[0].count === 3,
    `板 ${bulkFull.inventory.slots[35].count} / 原木 ${bulkFull.grid[0].count} 個残り`,
  );

  // --- ダブルクリックのかき集め ---
  describe("インベントリ画面（かき集め）");

  const gather = screen();
  gather.inventory.slots[0].item = DIRT;
  gather.inventory.slots[0].count = 10;
  gather.inventory.slots[4].item = DIRT;
  gather.inventory.slots[4].count = 20;
  gather.inventory.slots[9].item = DIRT;
  gather.inventory.slots[9].count = 5;
  gather.inventory.slots[7].item = STONE;
  gather.inventory.slots[7].count = 30;
  click(gather, "inv", 0, 0); // 手に 10
  gather.press("inv", 0, 0, DOUBLE);
  check("同じアイテムを上限まで集める", gather.held?.count === 35, `手 ${gather.held?.count} 個`);
  check("別アイテムには触らない", gather.inventory.count(STONE) === 30, `石 ${gather.inventory.count(STONE)} 個`);
  check(
    "集めたぶんインベントリから消えている",
    gather.inventory.count(DIRT) === 0,
    `土 ${gather.inventory.count(DIRT)} 個`,
  );

  // 半端な山から先に取る。満杯の山を崩すと、あとに半端な山だけが残る。
  const order = screen();
  order.inventory.slots[0].item = DIRT;
  order.inventory.slots[0].count = 1;
  order.inventory.slots[1].item = DIRT;
  order.inventory.slots[1].count = MAX_STACK;
  order.inventory.slots[2].item = DIRT;
  order.inventory.slots[2].count = 10;
  click(order, "inv", 0, 0); // 手に 1
  order.press("inv", 0, 0, DOUBLE);
  check("上限ちょうどまで集める", order.held?.count === MAX_STACK, `手 ${order.held?.count} 個`);
  // 半端（10 個）を先に空にしてから満杯を崩すので、満杯側に 11 残る。
  // 逆順に取ると満杯が 1 だけ減って、半端な山が 10 個そのまま居座る。
  check(
    "半端な山から先に取り、満杯の山は最後に崩す",
    isEmpty(order.inventory.slots[2]) && order.inventory.slots[1].count === 11,
    `満杯側 ${order.inventory.slots[1].count} / 半端側 ${order.inventory.slots[2].count}`,
  );

  const gatherGrid = screen(3);
  put(gatherGrid, 5, DIRT, 6);
  gatherGrid.inventory.slots[0].item = DIRT;
  gatherGrid.inventory.slots[0].count = 2;
  click(gatherGrid, "inv", 0, 0);
  gatherGrid.press("inv", 0, 0, DOUBLE);
  check("盤面からも集める", gatherGrid.held?.count === 8 && isEmpty(gatherGrid.grid[5]), `手 ${gatherGrid.held?.count} 個`);

  const gatherEmpty = screen();
  check("手が空ならかき集めない", !gatherEmpty.press("inv", 0, 0, DOUBLE).changed);

  const gatherFull = screen();
  gatherFull.inventory.slots[0].item = DIRT;
  gatherFull.inventory.slots[0].count = MAX_STACK;
  gatherFull.inventory.slots[1].item = DIRT;
  gatherFull.inventory.slots[1].count = 5;
  click(gatherFull, "inv", 0, 0);
  gatherFull.press("inv", 0, 0, DOUBLE);
  check(
    "すでに上限なら何も動かない",
    gatherFull.held?.count === MAX_STACK && gatherFull.inventory.slots[1].count === 5,
    `手 ${gatherFull.held?.count} / 残り ${gatherFull.inventory.slots[1].count}`,
  );

  // --- 数字キーでホットバーへ ---
  describe("インベントリ画面（数字キー）");

  const num = screen();
  num.inventory.slots[20].item = STONE;
  num.inventory.slots[20].count = 8;
  num.inventory.slots[2].item = DIRT;
  num.inventory.slots[2].count = 3;
  num.hover("inv", 20, false);
  num.swapHotbar(2);
  check(
    "カーソルの下の枠とホットバーが入れ替わる",
    num.inventory.slots[2].item === STONE && num.inventory.slots[20].item === DIRT,
    `ホットバー2 ${num.inventory.slots[2].item} / 収納 ${num.inventory.slots[20].item}`,
  );

  const numEmpty = screen();
  numEmpty.inventory.slots[20].item = STONE;
  numEmpty.inventory.slots[20].count = 8;
  numEmpty.hover("inv", 20, false);
  numEmpty.swapHotbar(5);
  check(
    "空のホットバー枠へも移せる",
    numEmpty.inventory.slots[5].count === 8 && isEmpty(numEmpty.inventory.slots[20]),
    `ホットバー5 ${numEmpty.inventory.slots[5].count} 個`,
  );

  const numGrid = screen(3);
  put(numGrid, 7, PLANK, 4);
  numGrid.hover("grid", 7, false);
  numGrid.swapHotbar(0);
  check(
    "盤面の枠からもホットバーへ移せる",
    numGrid.inventory.slots[0].count === 4 && isEmpty(numGrid.grid[7]),
    `ホットバー0 ${numGrid.inventory.slots[0].count} 個`,
  );

  const noHover = screen();
  noHover.inventory.slots[20].item = STONE;
  noHover.inventory.slots[20].count = 8;
  noHover.hover("inv", 20, false);
  noHover.hoverOut("inv", 20);
  check("カーソルがスロットの上に無ければ何も起きない", !noHover.swapHotbar(2).changed);

  const numHolding = holding(10);
  numHolding.hover("inv", 20, false);
  check("掴んでいる間は数字キーが効かない", !numHolding.swapHotbar(2).changed);

  const numSelf = screen();
  numSelf.inventory.slots[3].item = STONE;
  numSelf.inventory.slots[3].count = 8;
  numSelf.hover("inv", 3, false);
  check("同じ枠を指していれば何も起きない", !numSelf.swapHotbar(3).changed);

  const numBoth = screen();
  numBoth.hover("inv", 20, false);
  check("両方とも空なら何も起きない", !numBoth.swapHotbar(2).changed);

  const numDrag = holding(10);
  numDrag.press("inv", 1, 0);
  numDrag.hover("inv", 2, true);
  check("ドラッグ中は数字キーが効かない", !numDrag.swapHotbar(3).changed);

  // hover は「押したまま入った」ときに撫でた集合へも足す。両方が同じ入口。
  const hoverDrag = holding(8);
  hoverDrag.press("inv", 1, 0);
  hoverDrag.hover("inv", 2, true);
  hoverDrag.release();
  check(
    "hover はドラッグの撫でた集合も兼ねる",
    hoverDrag.inventory.slots[1].count === 4 && hoverDrag.inventory.slots[2].count === 4,
    `${hoverDrag.inventory.slots[1].count},${hoverDrag.inventory.slots[2].count}`,
  );

  // ボタンを離した状態で入ってきたら、宙に浮いた構えを確定する。
  const backInside = holding(8);
  backInside.press("inv", 1, 0);
  backInside.hover("inv", 2, false);
  check(
    "離した状態で入ってきたら構えを確定する",
    !backInside.isDragging && backInside.inventory.slots[1].count === 8,
    `ドラッグ中 ${backInside.isDragging} / スロット1 ${backInside.inventory.slots[1].count} 個`,
  );
}
