import { COBBLE, DIRT, STONE } from "../src/blocks";
import { HOTBAR_SIZE, INVENTORY_SIZE, Inventory, isEmpty } from "../src/inventory";
import { MAX_STACK, NO_ITEM, WOOD_PICKAXE, itemStackLimit } from "../src/items";
import { check, describe } from "./harness";

export function run(): void {
  describe("インベントリ");

  const inv = new Inventory();
  check("空で始まる", inv.slots.every(isEmpty) && inv.slots.length === INVENTORY_SIZE, `${INVENTORY_SIZE} スロット`);
  check("空のときの手持ちは NO_ITEM", inv.selectedItem === NO_ITEM);

  // --- 積み上げ ---
  check("入りきったら残り 0", inv.add(DIRT, 10) === 0);
  check("同じアイテムは同じ山に積む", inv.count(DIRT) === 10 && countUsed(inv) === 1, `使用 ${countUsed(inv)} スロット`);

  inv.add(DIRT, 60);
  check(
    "64 を超えたら次のスロットへ",
    inv.count(DIRT) === 70 && countUsed(inv) === 2,
    `${inv.slots[0].count} + ${inv.slots[1].count}`,
  );

  const tools = new Inventory();
  tools.add(WOOD_PICKAXE, 3);
  check(
    "道具は 1 個ずつ別スロット",
    itemStackLimit(WOOD_PICKAXE) === 1 && countUsed(tools) === 3,
    `${countUsed(tools)} スロット`,
  );

  // --- 溢れ ---
  const full = new Inventory();
  const capacity = INVENTORY_SIZE * MAX_STACK;
  const left = full.add(STONE, capacity + 25);
  check("入りきらない分が返る", left === 25, `残り ${left} 個 / 容量 ${capacity}`);
  check("容量ちょうどまで入る", full.count(STONE) === capacity, `${full.count(STONE)} 個`);

  // --- 取り出し ---
  const use = new Inventory();
  use.add(COBBLE, 5);
  check("足りなければ何も減らさない", !use.consume(COBBLE, 6) && use.count(COBBLE) === 5);
  check("足りていれば減る", use.consume(COBBLE, 5) && use.count(COBBLE) === 0);
  check("空になったスロットは空に戻る", isEmpty(use.slots[0]));

  const place = new Inventory();
  place.add(DIRT, 2);
  place.select(0);
  check("設置で 1 個減る", place.consumeSelected() && place.count(DIRT) === 1);
  place.consumeSelected();
  check("使い切ったら手ぶら", place.selectedItem === NO_ITEM);
  check("空のスロットからは減らせない", !place.consumeSelected());

  // --- 選択 ---
  const sel = new Inventory();
  sel.select(8);
  sel.cycle(1);
  check("ホットバーの選択は 9 個で巻き戻る", sel.selected === 0, `selected=${sel.selected}`);
  sel.cycle(-1);
  check("逆回しも巻き戻る", sel.selected === HOTBAR_SIZE - 1, `selected=${sel.selected}`);

  // --- スポイト ---
  const pick = new Inventory();
  pick.slots[20].item = STONE;
  pick.slots[20].count = 4;
  check("収納にあるものはホットバーへ持ってくる", pick.selectItem(STONE) && pick.selectedItem === STONE);
  check("持っていないものは選べない", !pick.selectItem(WOOD_PICKAXE));

  // --- 入れ替え ---
  // craftscreen.ts が slots[i] の Slot 参照を持ち回るので、
  // 配列要素の差し替えにすると持ち回った側が古いままになる。
  const sw = new Inventory();
  sw.slots[0].item = STONE;
  sw.slots[0].count = 3;
  const before = sw.slots[0];
  sw.swap(0, 5);
  check("swap のあともスロットのオブジェクトは同じ", sw.slots[0] === before, "参照が差し替わっていない");
  check(
    "swap で中身が入れ替わる",
    isEmpty(sw.slots[0]) && sw.slots[5].item === STONE && sw.slots[5].count === 3,
    `0 は空 / 5 は ${sw.slots[5].count} 個`,
  );

  // --- 範囲を絞って入れる（シフトクリックの行き先） ---
  const ranged = new Inventory();
  ranged.addRange(DIRT, 5, HOTBAR_SIZE, INVENTORY_SIZE);
  check(
    "範囲の外には入らない",
    ranged.slots.slice(0, HOTBAR_SIZE).every(isEmpty) && ranged.slots[HOTBAR_SIZE].count === 5,
    `ホットバー ${countUsed(ranged)} 枠 / 収納の先頭 ${ranged.slots[HOTBAR_SIZE].count} 個`,
  );
  const narrow = new Inventory();
  const spill = narrow.addRange(STONE, MAX_STACK * 2 + 3, 0, 2);
  check("範囲が埋まったら残りを返す", spill === 3, `残り ${spill} 個`);
  check("範囲ちょうどまで入る", narrow.count(STONE) === MAX_STACK * 2, `${narrow.count(STONE)} 個`);

  // --- あと何個入るか（一括クラフトの打ち切り） ---
  const room = new Inventory();
  check("空なら全スロットぶん入る", room.roomFor(DIRT) === INVENTORY_SIZE * MAX_STACK, `${room.roomFor(DIRT)} 個`);
  room.add(DIRT, 10);
  check(
    "半端な山の空きも数える",
    room.roomFor(DIRT) === INVENTORY_SIZE * MAX_STACK - 10,
    `${room.roomFor(DIRT)} 個`,
  );
  room.slots[1].item = STONE;
  room.slots[1].count = MAX_STACK;
  check(
    "別アイテムが埋めた枠は数えない",
    room.roomFor(DIRT) === (INVENTORY_SIZE - 1) * MAX_STACK - 10,
    `${room.roomFor(DIRT)} 個`,
  );
  check("持てないものは 0", room.roomFor(NO_ITEM) === 0);

  // --- 選択中から捨てる（プレイ中の Q / Ctrl+Q） ---
  const toss = new Inventory();
  toss.add(COBBLE, 3);
  toss.select(0);
  const thrown = toss.discardSelected();
  check(
    "選択中から 1 個捨てられる",
    thrown?.item === COBBLE && thrown.count === 1 && toss.count(COBBLE) === 2,
    `${thrown?.item} x${thrown?.count} / 残り ${toss.count(COBBLE)}`,
  );
  // まとめ捨て。**山ごと**なので、残りは 0 になる。
  const dumped = toss.discardSelected(true);
  check(
    "Ctrl+Q は山ごと捨てる",
    dumped?.count === 2 && isEmpty(toss.selectedSlot) && toss.count(COBBLE) === 0,
    `${dumped?.count} 個まとめて / 残り ${toss.count(COBBLE)}`,
  );
  check("空のスロットからは捨てられない", toss.discardSelected() === null);
  check("空のスロットはまとめ捨てもできない", toss.discardSelected(true) === null);

  // --- 死んだときに落とすもの ---
  // **不変条件: 返した合計 = 取り出す前の総数。** ここが崩れると持ち物が黙って増減する。
  const corpse = new Inventory();
  corpse.add(DIRT, 100);
  corpse.add(COBBLE, 5);
  corpse.add(WOOD_PICKAXE, 1);
  const heldBefore = corpse.slots.reduce((sum, slot) => sum + (isEmpty(slot) ? 0 : slot.count), 0);
  const lost = corpse.takeAll();
  const dropped = lost.reduce((sum, stack) => sum + stack.count, 0);
  console.log(`      死亡時: ${lost.length} 山 / 計 ${dropped} 個`);
  check("落とした合計が元の総数と合う", dropped === heldBefore, `${dropped} 個 / 元 ${heldBefore} 個`);
  check(
    "取り出したあとは空になる",
    corpse.slots.every(isEmpty) && corpse.count(DIRT) === 0,
    `土 ${corpse.count(DIRT)} 個`,
  );
  check("空の山は返さない", lost.every((stack) => stack.count > 0) && lost.length === 4, `${lost.length} 山`);
  check("空のインベントリからは何も出ない", corpse.takeAll().length === 0);

  // --- 保存 ---
  const src = new Inventory();
  src.add(DIRT, 70);
  src.add(WOOD_PICKAXE, 1);
  src.select(3);
  const restored = new Inventory();
  restored.deserialize(src.serialize());
  check(
    "保存して読み直しても中身が同じ",
    restored.count(DIRT) === 70 && restored.count(WOOD_PICKAXE) === 1,
    `土 ${restored.count(DIRT)} / ツルハシ ${restored.count(WOOD_PICKAXE)}`,
  );
  check(
    "スロットの位置も保たれる",
    restored.slots.every((slot, i) => slot.item === src.slots[i].item && slot.count === src.slots[i].count),
  );

  const broken = new Inventory();
  broken.deserialize([STONE, 999, 0, 0]);
  check("壊れた保存データでも上限を超えない", broken.count(STONE) === MAX_STACK, `${broken.count(STONE)} 個`);
  broken.deserialize(undefined);
  check("保存データが無ければ空になる", broken.slots.every(isEmpty));
}

function countUsed(inv: Inventory): number {
  return inv.slots.filter((slot) => !isEmpty(slot)).length;
}
