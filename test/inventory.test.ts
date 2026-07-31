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
