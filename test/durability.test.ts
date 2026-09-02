import { BEDROCK, COBBLE, IRON_ORE, STONE, TORCH } from "../src/blocks";
import { tryBreak } from "../src/breaking";
import {
  CREATIVE_ITEMS,
  CraftScreen,
  type MouseButton,
  type SlotArea,
} from "../src/craftscreen";
import {
  BOW_USES,
  FIRE_STARTER_USES,
  SHEARS_USES,
  TOOL_USES,
  breakMessage,
  carryWear,
  damageOf,
  deserializeWear,
  maxUses,
  serializeWear,
  wearBar,
  wearForAttack,
  wearForBreaking,
  wearForUse,
  wearSlot,
  wornValue,
} from "../src/durability";
import { HOTBAR_SIZE, INVENTORY_SIZE, Inventory, isEmpty, type Slot } from "../src/inventory";
import {
  ARROW,
  BOW,
  DIAMOND_PICKAXE,
  DIAMOND_SWORD,
  FLINT_AND_STEEL,
  IRON_PICKAXE,
  IRON_SWORD,
  NO_ITEM,
  SHEARS,
  STICK,
  STONE_PICKAXE,
  STONE_SWORD,
  WOOD_PICKAXE,
  WOOD_SWORD,
  itemName,
  itemStackLimit,
} from "../src/items";
import { breakTime } from "../src/mining";
import { applyRestore } from "../src/session";
import type { SaveData } from "../src/storage";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 素の `Slot` 1 個。**`World` も DOM も要らない**（試験場はこれで足りる）。 */
function slot(item: number, count = 1, damage = 0): Slot {
  return { item, count, damage };
}

/**
 * インベントリ画面の試験場。**`World` も DOM も要らない**（`Inventory` + `CraftScreen` だけ）。
 * 1 枠目に傷んだ木のツルハシ、6 枠目に傷んだ石のツルハシを置いて 3x3 で開く。
 */
function arena(): { inv: Inventory; screen: CraftScreen } {
  const inv = new Inventory();
  inv.slots[0].item = WOOD_PICKAXE;
  inv.slots[0].count = 1;
  inv.slots[0].damage = 30;
  inv.slots[5].item = STONE_PICKAXE;
  inv.slots[5].count = 1;
  inv.slots[5].damage = 7;
  const screen = new CraftScreen(inv);
  screen.openScreen(3);
  return { inv, screen };
}

/**
 * 掴む／置くの 1 回。**`press()` は掴んでいるあいだ構えるだけ**なので、
 * `release()` まで通さないと 1 個も動かない（`rules/inventory-screen.md`）。
 */
function click(screen: CraftScreen, area: SlotArea, index: number, button: MouseButton = 0): void {
  screen.press(area, index, button);
  screen.release();
}

export function run(): void {
  describe("道具の耐久値");

  // --- 試験場が効いているか（先に置く。`rules/testing.md`） ---
  const fresh = slot(WOOD_PICKAXE);
  check(
    "新品の木のツルハシは 59 回使える",
    maxUses(fresh.item) === 59 && (fresh.damage ?? 0) === 0,
    `${maxUses(fresh.item)} 回 / 傷 ${fresh.damage}`,
  );

  // --- 階層ごとの回数（Minecraft のまま） ---
  const table: [string, number, number][] = [
    ["木", WOOD_PICKAXE, 59],
    ["石", STONE_PICKAXE, 131],
    ["鉄", IRON_PICKAXE, 250],
    ["ダイヤ", DIAMOND_PICKAXE, 1561],
  ];
  console.log(`      回数の表: ${table.map(([n, id]) => `${n} ${maxUses(id)}`).join(" / ")}`);
  for (const [name, id, uses] of table) {
    check(`${name}の道具は ${uses} 回`, maxUses(id) === uses, `${maxUses(id)} 回`);
  }
  check("表の並びは素手 0 から", TOOL_USES[0] === 0, `TOOL_USES[0] = ${TOOL_USES[0]}`);

  // 道具でないものは減らない（棒に帯が出ると、持ち物が全部「壊れかけ」に見える）。
  const notTools: [string, number][] = [["棒", STICK], ["丸石", COBBLE], ["矢", ARROW], ["空の枠", NO_ITEM]];
  for (const [name, id] of notTools) {
    check(`${name}は減らない（最大 0 回）`, maxUses(id) === 0, `${maxUses(id)} 回`);
  }

  // --- 掘るたびに 1 減り、最後の 1 回で消える ---
  {
    const pick = slot(WOOD_PICKAXE);
    for (let i = 0; i < 58; i++) wearSlot(pick, wearForBreaking(STONE, pick.item, false));
    check(
      "58 回掘っても手に残る",
      pick.item === WOOD_PICKAXE && pick.damage === 58,
      `残り ${59 - (pick.damage ?? 0)} 回`,
    );
    const broke = wearSlot(pick, wearForBreaking(STONE, pick.item, false));
    check("59 回目で壊れて、壊れたものの ID が返る", broke === WOOD_PICKAXE, `返り値 ${broke}`);
    check(
      "壊れた枠は空で、傷も 0 に戻る",
      isEmpty(pick) && (pick.damage ?? 0) === 0,
      `item=${pick.item} count=${pick.count} damage=${pick.damage}`,
    );
    // 傷が残っていると、次に入れたものが半分減った状態で始まる。
    pick.item = STONE_PICKAXE;
    pick.count = 1;
    check("壊れた枠に入れ直すと新品から", wearBar(pick) === -1, `帯 ${wearBar(pick)}`);
    check("壊れていない道具を減らすと NO_ITEM", wearSlot(pick, 1) === NO_ITEM && pick.damage === 1);
  }

  // --- 減らない場合（全部出す） ---
  {
    const cases: [string, number, number, boolean, number][] = [
      ["石をツルハシで掘る（減る）", STONE, WOOD_PICKAXE, false, 1],
      ["クリエイティブ", STONE, WOOD_PICKAXE, true, 0],
      ["素手", STONE, NO_ITEM, false, 0],
      ["道具でない物（棒）", STONE, STICK, false, 0],
      ["硬さ 0（松明）", TORCH, WOOD_PICKAXE, false, 0],
      ["壊せないブロック（岩盤）", BEDROCK, WOOD_PICKAXE, false, 0],
    ];
    for (const [name, block, item, creative, want] of cases) {
      const got = wearForBreaking(block, item, creative);
      check(`${name} → ${want}`, got === want, `${got}`);
    }
  }

  // --- 掘る経路が傷を返すか（`tryBreak()` に載って `main.ts` へ届く） ---
  {
    const empty = { remove: () => [] as { item: number; count: number }[] };
    const dig = (id: number, tool: number, creative: boolean): number => {
      const world = new Slab();
      world.setVoxel(0, 11, 0, id);
      return tryBreak(world, { furnaces: empty, chests: empty }, {
        x: 0, y: 11, z: 0, id, tool, creative, roll: 0.5,
      }).wear;
    };
    console.log(
      `      tryBreak の wear: 石+ツルハシ ${dig(STONE, WOOD_PICKAXE, false)} / ` +
        `石+素手 ${dig(STONE, NO_ITEM, false)} / クリエイティブ ${dig(STONE, WOOD_PICKAXE, true)}`,
    );
    check("掘って壊すと傷が 1 返る", dig(STONE, WOOD_PICKAXE, false) === 1);
    // **何も落ちなくても傷は付く**（消耗と同じで、掘った労力そのもの）。
    // 木のツルハシで鉄鉱石を掘ると消えるだけだが、道具は傷む。
    check("落ちなくても傷は付く（階層の足りない道具）", dig(IRON_ORE, WOOD_PICKAXE, false) === 1);
    check("素手では傷が付かない", dig(STONE, NO_ITEM, false) === 0);
    check("クリエイティブでは傷が付かない", dig(STONE, WOOD_PICKAXE, true) === 0);
    check("硬さ 0 のブロックでは傷が付かない", dig(TORCH, WOOD_PICKAXE, false) === 0);
  }

  // --- 帯に出す割合（`ui.ts` は貼るだけ） ---
  {
    const half = slot(WOOD_PICKAXE, 1, 30);
    console.log(`      帯: 傷 30/59 → ${wearBar(half).toFixed(3)}`);
    check("残りの割合が返る", Math.abs(wearBar(half) - 29 / 59) < 1e-9, `${wearBar(half)}`);
    check("新品は -1（帯を出さない）", wearBar(slot(WOOD_PICKAXE)) === -1);
    check("減らない物は -1（棒に出さない）", wearBar(slot(STICK, 5)) === -1);
    check("空の枠は -1", wearBar(slot(NO_ITEM, 0)) === -1 && wearBar(null) === -1);
  }

  // --- 壊れたときの 1 行（`deathMessage()` と同じ形） ---
  {
    const message = breakMessage(WOOD_PICKAXE);
    console.log(`      壊れたとき: ${message}`);
    check("何が壊れたかを出す", message.includes("木のツルハシ") && message.length > 6, message);
  }

  // --- swap は傷ごと入れ替える ---
  {
    const inv = new Inventory();
    inv.slots[0].item = WOOD_PICKAXE;
    inv.slots[0].count = 1;
    inv.slots[0].damage = 20;
    inv.slots[5].item = STONE_PICKAXE;
    inv.slots[5].count = 1;
    inv.slots[5].damage = 7;
    inv.swap(0, 5);
    console.log(`      swap 後: 0 番 傷 ${inv.slots[0].damage} / 5 番 傷 ${inv.slots[5].damage}`);
    check(
      "入れ替えた両方の傷が付いてくる",
      inv.slots[0].item === STONE_PICKAXE && inv.slots[0].damage === 7 &&
        inv.slots[5].item === WOOD_PICKAXE && inv.slots[5].damage === 20,
    );
    // 空き枠へ動かしても傷は付いてくる（収納へ移すたびに新品に戻ってはいけない）。
    inv.swap(5, 20);
    check("空き枠へ移しても傷が残る", inv.slots[20].damage === 20 && (inv.slots[5].damage ?? 0) === 0);

    const put = new Inventory();
    put.slots[3].damage = 40;
    put.add(WOOD_PICKAXE, 1);
    check("空き枠に入った物の傷は 0", (put.slots[0].damage ?? 0) === 0, `傷 ${put.slots[0].damage}`);
    put.setSelected(WOOD_PICKAXE, 1);
    check("クリエイティブで湧かせたものも新品", (put.selectedSlot.damage ?? 0) === 0);
  }

  // --- セーブの往復 ---
  {
    const inv = new Inventory();
    inv.add(WOOD_PICKAXE, 1);
    inv.add(COBBLE, 30);
    inv.slots[0].damage = 12;
    const flat = inv.serializeWear();
    console.log(`      wear: ${flat?.length} 要素 / 先頭 ${flat?.[0]}`);
    check("36 要素で書き出す", flat?.length === INVENTORY_SIZE, `${flat?.length} 要素`);

    const back = new Inventory();
    back.deserialize(inv.serialize());
    back.deserializeWear(flat);
    check("往復しても傷が残る", back.slots[0].damage === 12, `傷 ${back.slots[0].damage}`);
    check("道具でない枠に傷は付かない", (back.slots[1].damage ?? 0) === 0);

    // **全部新品なら、キーごと消える**（古いセーブと 1 バイトも変わらない）。
    const clean = new Inventory();
    clean.add(WOOD_PICKAXE, 1);
    clean.add(STONE, 10);
    check("全部新品なら undefined", clean.serializeWear() === undefined, `${clean.serializeWear()}`);

    // **判断は `durability.ts` 側**（`Inventory` は委譲するだけ）。素の `Slot` の並びでも同じ。
    const bare = [slot(WOOD_PICKAXE, 1, 5), slot(STICK, 3), slot(NO_ITEM, 0)];
    const bareFlat = serializeWear(bare);
    console.log(`      素の Slot 3 個: ${JSON.stringify(bareFlat)}`);
    check("素の Slot の並びでも書き出せる", JSON.stringify(bareFlat) === "[5,0,0]", JSON.stringify(bareFlat));
    deserializeWear(bare, [7, 9, 9]);
    check(
      "読み戻すのは道具の枠だけ",
      bare[0].damage === 7 && (bare[1].damage ?? 0) === 0 && (bare[2].damage ?? 0) === 0,
      `${bare.map((s) => s.damage).join(" / ")}`,
    );
  }

  // --- 古い・壊れたセーブ ---
  {
    const old = new Inventory();
    old.add(WOOD_PICKAXE, 1);
    old.deserializeWear(undefined);
    check("wear が無い古いセーブは全部新品", (old.slots[0].damage ?? 0) === 0, `傷 ${old.slots[0].damage}`);

    const odd = new Inventory();
    odd.add(WOOD_PICKAXE, 1);
    odd.add(STONE_PICKAXE, 1);
    // 長さが足りない / 数でない / 負 / 最大を超える、を 1 度に流す。
    odd.deserializeWear([9999, Number.NaN as number]);
    console.log(`      壊れた wear: 0 番 ${odd.slots[0].damage} / 1 番 ${odd.slots[1].damage}`);
    check(
      "最大を超える値は最大 - 1 に丸める（壊れた状態で復元しない）",
      odd.slots[0].damage === 58 && !isEmpty(odd.slots[0]),
      `傷 ${odd.slots[0].damage} / 最大 59`,
    );
    check("数でない値は 0", (odd.slots[1].damage ?? 0) === 0);
    const longer = new Inventory();
    longer.add(WOOD_PICKAXE, 1);
    longer.deserializeWear(Array.from({ length: 99 }, () => -5));
    check("長すぎる・負の値でも落ちない", (longer.slots[0].damage ?? 0) === 0, `傷 ${longer.slots[0].damage}`);
  }

  describe("道具の耐久値（判断の置き場）");

  // 見張り 1: 回数と傷の扱いを `main.ts` に書き戻さない（配線だけに保つ）。
  // **`.damage` そのものでは見ない** —— 矢のダメージ（`shot.damage`）に当たる。
  // 見たいのは「傷を自分で書き換えていないか」なので、代入と足し引きの形で見る。
  const main = sourceOf("src/main.ts");
  const leaked = ["TOOL_USES", "maxUses(", "damage =", "damage +", "damage ??"].filter((word) =>
    main.includes(word),
  );
  check("main.ts に回数と傷の扱いが無い", leaked.length === 0, leaked.join(" / "));

  // 見張り 2: `ui.ts` は割合を貼るだけ（数値を持たない）。
  const ui = sourceOf("src/ui.ts");
  const inUi = ["59", "131", "250", "1561", "maxUses("].filter((word) => ui.includes(word));
  check("ui.ts に回数が書かれていない", inUi.length === 0, inUi.join(" / "));

  // 見張り 3: 判断の側に「確かめられないもの」が入り込んでいない。
  const durability = sourceOf("src/durability.ts");
  const unverifiable = ["document", "Mesh", "AudioContext", "Math.random("].filter((word) =>
    durability.includes(word),
  );
  check("durability.ts に DOM・three・音・乱数が無い", unverifiable.length === 0, unverifiable.join(" / "));

  describe("傷ごと動く");

  // --- 試験場が効いているか（先に置く。`rules/testing.md`） ---
  {
    const { inv, screen } = arena();
    console.log(
      `      試験場: 1 枠目 ${damageOf(inv.slots[0])} / 6 枠目 ${damageOf(inv.slots[5])} / ` +
        `画面 ${screen.isOpen ? "開" : "閉"}`,
    );
    check("傷 30 の木のツルハシが 1 枠目に居る", damageOf(inv.slots[0]) === 30, `${damageOf(inv.slots[0])}`);
    check("画面が開いていて盤面が使える", screen.isOpen && screen.usable(0));
    // 「道具でなければ 0」の判断は `damageOf` / `carryWear` の 2 本だけが持つ。
    const stick = slot(STICK, 5, 9);
    check("道具でない枠の傷は読まない（0）", damageOf(stick) === 0, `${damageOf(stick)}`);
    check("空の枠・null も 0", damageOf(slot(NO_ITEM, 0, 9)) === 0 && damageOf(null) === 0);
    carryWear(stick, 12);
    check("道具でない枠には載せない", stick.damage === 0, `${stick.damage}`);
  }

  // --- 掴む → 空き枠へ置く（左・右の両方） ---
  for (const button of [0, 2] as MouseButton[]) {
    const label = button === 0 ? "左" : "右";
    const { inv, screen } = arena();
    click(screen, "inv", 0, button); // 掴む
    const held = damageOf(screen.held);
    click(screen, "inv", 20, button); // 空き枠へ置く
    console.log(`      ${label}クリック: 掴んだとき ${held} → 置いた先 ${damageOf(inv.slots[20])}`);
    check(
      `${label}クリックで掴むと傷ごと手に乗る`,
      held === 30 && screen.held === null,
      `手 ${held}`,
    );
    check(
      `${label}クリックで空き枠へ置いても傷が残る`,
      inv.slots[20].item === WOOD_PICKAXE && inv.slots[20].damage === 30,
      `傷 ${inv.slots[20].damage}`,
    );
    check("動かした元は空で、傷も 0 に戻る", isEmpty(inv.slots[0]) && damageOf(inv.slots[0]) === 0);
  }

  // --- 別のアイテムと入れ替える（両方の傷が入れ替わる） ---
  {
    const { inv, screen } = arena();
    click(screen, "inv", 0, 0); // 木（傷 30）を掴む
    click(screen, "inv", 5, 0); // 石（傷 7）と入れ替える
    console.log(`      入れ替え: 6 枠目 ${damageOf(inv.slots[5])} / 手 ${damageOf(screen.held)}`);
    check(
      "置いた先は木のツルハシの傷 30",
      inv.slots[5].item === WOOD_PICKAXE && damageOf(inv.slots[5]) === 30,
      `${inv.slots[5].item} / 傷 ${damageOf(inv.slots[5])}`,
    );
    check(
      "手に戻った石のツルハシは傷 7 のまま",
      screen.held?.item === STONE_PICKAXE && damageOf(screen.held) === 7,
      `傷 ${damageOf(screen.held)}`,
    );

    // 片方が道具でなければ 0（丸石の山に傷が乗ってはいけない）。
    const stack = new Inventory();
    stack.slots[0].item = WOOD_PICKAXE;
    stack.slots[0].count = 1;
    stack.slots[0].damage = 30;
    stack.add(COBBLE, 20);
    const other = new CraftScreen(stack);
    other.openScreen(2);
    click(other, "inv", 0, 0); // 木（傷 30）を掴む
    click(other, "inv", 1, 0); // 丸石 20 個と入れ替える
    console.log(`      道具でない相手: 丸石の枠 ${damageOf(stack.slots[1])} / 手 ${damageOf(other.held)}`);
    check(
      "道具でない山と入れ替えても山に傷が乗らない",
      other.held?.item === COBBLE && damageOf(other.held) === 0 && other.held?.count === 20,
      `手 ${other.held?.item} x${other.held?.count} 傷 ${damageOf(other.held)}`,
    );
    check("入れ替わった道具の傷は残る", damageOf(stack.slots[1]) === 30, `${damageOf(stack.slots[1])}`);
  }

  // --- 数字キー（`swapHotbar()`） ---
  {
    const { inv, screen } = arena();
    inv.swap(0, 20); // 木（傷 30）を収納へ
    screen.hover("inv", 20, false); // カーソルを乗せる（行き先を決めるのは画面の側）
    screen.swapHotbar(5); // 石（傷 7）の枠と入れ替える
    console.log(`      数字キー: 20 枠目 ${damageOf(inv.slots[20])} / 6 枠目 ${damageOf(inv.slots[5])}`);
    check(
      "入れ替えた両方の傷が付いてくる",
      inv.slots[5].item === WOOD_PICKAXE && damageOf(inv.slots[5]) === 30 &&
        inv.slots[20].item === STONE_PICKAXE && damageOf(inv.slots[20]) === 7,
      `${inv.slots[5].item}/${damageOf(inv.slots[5])} と ${inv.slots[20].item}/${damageOf(inv.slots[20])}`,
    );
    // 空き枠と入れ替えても消えない。
    screen.hover("inv", 5, false);
    screen.swapHotbar(8);
    check(
      "空き枠と入れ替えても傷が残る",
      damageOf(inv.slots[8]) === 30 && damageOf(inv.slots[5]) === 0,
      `8 枠目 ${damageOf(inv.slots[8])} / 6 枠目 ${damageOf(inv.slots[5])}`,
    );
  }

  // --- ドラッグで配る（上限 1 なので配れるのは 1 枠だけ） ---
  {
    const { inv, screen } = arena();
    screen.press("inv", 0, 0); // 掴む
    screen.press("inv", 20, 0); // 1 枠目を撫でる（構えるだけ）
    screen.hover("inv", 21, true); // 2 枠目
    screen.release();
    console.log(`      ドラッグ: 20 枠目 ${damageOf(inv.slots[20])} / 21 枠目 ${damageOf(inv.slots[21])}`);
    check(
      "配った 1 枠に傷が乗る",
      inv.slots[20].item === WOOD_PICKAXE && damageOf(inv.slots[20]) === 30,
      `傷 ${damageOf(inv.slots[20])}`,
    );
    check("2 枠目には配られない（stack: 1）", isEmpty(inv.slots[21]) && damageOf(inv.slots[21]) === 0);
  }

  // --- シフトクリック（ホットバー ↔ 収納） ---
  {
    const { inv, screen } = arena();
    screen.press("inv", 0, 0, { shift: true, double: false });
    const moved = inv.slots.findIndex((s, i) => i >= HOTBAR_SIZE && s.item === WOOD_PICKAXE);
    console.log(`      シフト: ${moved} 枠目へ / 傷 ${damageOf(inv.slots[moved])}`);
    check("収納へ動かしても傷が残る", moved >= HOTBAR_SIZE && damageOf(inv.slots[moved]) === 30, `${moved} 枠目`);
    screen.press("inv", moved, 0, { shift: true, double: false });
    const back = inv.slots.findIndex((s, i) => i < HOTBAR_SIZE && s.item === WOOD_PICKAXE);
    check("ホットバーへ戻しても傷が残る", back >= 0 && damageOf(inv.slots[back]) === 30, `${back} 枠目`);
  }

  // --- 画面を閉じたとき（`returnAll()`） ---
  {
    const { inv, screen } = arena();
    click(screen, "inv", 0, 0);
    click(screen, "grid", 0, 0); // 木（傷 30）を盤面へ
    screen.press("inv", 5, 0); // 石（傷 7）を掴んだまま閉じる
    screen.close();
    const wood = inv.slots.find((s) => s.item === WOOD_PICKAXE);
    const stone = inv.slots.find((s) => s.item === STONE_PICKAXE);
    console.log(`      閉じたあと: 木 ${damageOf(wood)} / 石 ${damageOf(stone)}`);
    check("盤面の預かり物が傷ごと返る", damageOf(wood) === 30, `${damageOf(wood)}`);
    check("掴んだままの山も傷ごと返る", damageOf(stone) === 7, `${damageOf(stone)}`);
  }

  // --- クリエイティブの一覧から出した物は新品 ---
  {
    const { screen } = arena();
    screen.openCreative();
    const index = CREATIVE_ITEMS.indexOf(WOOD_PICKAXE);
    check("一覧に木のツルハシが並んでいる", index >= 0, `${index} 番目`);
    check("一覧の見せる姿にも傷が無い", (screen.slotFor("creative", index)?.damage ?? 0) === 0);

    // **傷んだ道具を掴んだ上から出しても引き継がない**（一覧は捨て場も兼ねている）。
    screen.press("inv", 0, 0);
    check("掴んだのは傷 30 の道具", damageOf(screen.held) === 30, `${damageOf(screen.held)}`);
    screen.press("creative", index, 0); // 掴んでいる山を捨てる
    screen.press("creative", index, 0); // 新しく 1 山出す
    console.log(`      一覧から出した道具: 傷 ${damageOf(screen.held)}`);
    check(
      "一覧から出した道具は新品",
      screen.held?.item === WOOD_PICKAXE && damageOf(screen.held) === 0,
      `傷 ${damageOf(screen.held)}`,
    );
  }

  // --- セーブの往復（`craftWear` は 10 要素の別キー） ---
  {
    const { screen } = arena();
    click(screen, "inv", 0, 0);
    click(screen, "grid", 0, 0); // 盤面へ（傷 30）
    screen.press("inv", 5, 0); // 掴んだまま（傷 7）
    const flat = screen.serializeWear();
    console.log(`      craftWear: ${JSON.stringify(flat)}`);
    check("盤面 9 + 手 1 の 10 要素", flat?.length === 10, `${flat?.length} 要素`);
    check("craft の 20 要素は変わらない", screen.serialize()?.length === 20, `${screen.serialize()?.length} 要素`);

    const back = new CraftScreen(new Inventory());
    back.deserialize(screen.serialize());
    back.deserializeWear(flat);
    console.log(`      読み戻し: 盤面 ${damageOf(back.grid[0])} / 手 ${damageOf(back.held)}`);
    check("往復しても盤面の傷が残る", damageOf(back.grid[0]) === 30, `${damageOf(back.grid[0])}`);
    check("往復しても掴んだ山の傷が残る", damageOf(back.held) === 7, `${damageOf(back.held)}`);

    // **全部新品ならキーごと消える**（傷めていない人のセーブは今までと 1 バイトも変わらない）。
    const clean = new CraftScreen(new Inventory());
    clean.grid[0].item = WOOD_PICKAXE;
    clean.grid[0].count = 1;
    check("全部新品なら undefined", clean.serializeWear() === undefined, `${clean.serializeWear()}`);
  }

  // --- 古い・壊れた craftWear ---
  {
    const old = new CraftScreen(new Inventory());
    old.grid[0].item = WOOD_PICKAXE;
    old.grid[0].count = 1;
    old.deserializeWear(undefined);
    check("craftWear が無い古いセーブは全部新品", damageOf(old.grid[0]) === 0, `${damageOf(old.grid[0])}`);

    const odd = new CraftScreen(new Inventory());
    odd.grid[0].item = WOOD_PICKAXE;
    odd.grid[0].count = 1;
    odd.grid[1].item = STICK;
    odd.grid[1].count = 3;
    // 長さ違い・数でない値・最大以上を 1 度に流す。
    odd.deserializeWear([9999, Number.NaN as number, 5]);
    console.log(`      壊れた craftWear: 盤面 0 番 ${damageOf(odd.grid[0])} / 1 番 ${odd.grid[1].damage}`);
    check(
      "最大以上は最大 - 1 に丸める（壊れた状態では復元しない）",
      damageOf(odd.grid[0]) === 58 && !isEmpty(odd.grid[0]),
      `傷 ${damageOf(odd.grid[0])} / 最大 59`,
    );
    check("道具でない枠には載らない", (odd.grid[1].damage ?? 0) === 0, `${odd.grid[1].damage}`);
  }

  // --- 読み込みの順（`deserializeWear()` は `returnAll()` より前） ---
  {
    const inv = new Inventory();
    const craft = new CraftScreen(inv);
    const saved = {
      inventory: [],
      // 盤面 0 番に木のツルハシ 1 個（20 要素）と、その傷 30（10 要素）。
      craft: [WOOD_PICKAXE, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      craftWear: [30, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    } as unknown as SaveData;
    applyRestore(saved, {
      dayNight: { setTime: () => {} },
      inventory: inv,
      craft,
      audio: { setVolume: () => {} },
      vitals: { health: 20, hunger: 20 },
    });
    const returned = inv.slots.find((s) => s.item === WOOD_PICKAXE);
    console.log(`      読み込み後にインベントリへ返った道具: 傷 ${damageOf(returned)}`);
    // **`returnAll()` より後に傷を戻すと、返した先に載らない**（ここが 0 になる）。
    check("預かり物は傷ごとインベントリへ返る", damageOf(returned) === 30, `${damageOf(returned)}`);
  }

  // 見張り 1: 画面が耐久値を「減らす」側に回っていないこと（運ぶだけ）。
  const screenSource = sourceOf("src/craftscreen.ts");
  const inScreen = ["59", "131", "250", "1561", "maxUses(", "wearSlot("].filter((word) =>
    screenSource.includes(word),
  );
  check("craftscreen.ts に回数と減らす道具が無い", inScreen.length === 0, inScreen.join(" / "));

  // 見張り 2: DOM の側に判断を渡さない（`crafting.ts` / `smelting.ts` と同じ扱い）。
  const inventoryUi = sourceOf("src/inventoryui.ts");
  check(
    "inventoryui.ts が durability.ts を import しない",
    !inventoryUi.includes("./durability"),
    inventoryUi.includes("./durability") ? "import あり" : "",
  );

  describe("使うと減るもの（火打石と打ち金・弓）");

  // --- 試験場が効いているか（先に置く。`rules/testing.md`） ---
  {
    const fire = slot(FLINT_AND_STEEL);
    const bow = slot(BOW);
    console.log(
      `      火種 ${maxUses(fire.item)} 回 / 弓 ${maxUses(bow.item)} 回 / ` +
        `新品の傷 ${fire.damage} と ${bow.damage}`,
    );
    check(
      "火打石と打ち金は 64 回、弓は 384 回",
      maxUses(FLINT_AND_STEEL) === FIRE_STARTER_USES && maxUses(BOW) === BOW_USES,
      `火種 ${maxUses(FLINT_AND_STEEL)} / 弓 ${maxUses(BOW)}`,
    );
    check("回数は Minecraft のまま", FIRE_STARTER_USES === 64 && BOW_USES === 384);
    check(
      "新品はどちらも傷 0",
      (fire.damage ?? 0) === 0 && (bow.damage ?? 0) === 0,
      `${fire.damage} / ${bow.damage}`,
    );
  }

  // --- 回数の表（掘る道具と並べて出す。`maxUses()` は 1 本で両方に答える） ---
  {
    const all: [string, number, number][] = [
      ["木", WOOD_PICKAXE, 59],
      ["石", STONE_PICKAXE, 131],
      ["鉄", IRON_PICKAXE, 250],
      ["ダイヤ", DIAMOND_PICKAXE, 1561],
      ["火種", FLINT_AND_STEEL, 64],
      ["弓", BOW, 384],
    ];
    console.log(`      回数の表: ${all.map(([n, id]) => `${n} ${maxUses(id)}`).join(" / ")}`);
    for (const [name, id, uses] of all) {
      check(`${name}は ${uses} 回`, maxUses(id) === uses, `${maxUses(id)} 回`);
    }
  }

  // --- `wearForUse()` の全ケース（減るのは「使って減るもの」だけ） ---
  {
    const cases: [string, number, boolean, number][] = [
      ["火種で火を点ける（減る）", FLINT_AND_STEEL, false, 1],
      ["弓を放つ（減る）", BOW, false, 1],
      ["クリエイティブの火種", FLINT_AND_STEEL, true, 0],
      ["クリエイティブの弓", BOW, true, 0],
      ["ツルハシを右クリック", WOOD_PICKAXE, false, 0],
      ["棒", STICK, false, 0],
      ["空の枠", NO_ITEM, false, 0],
    ];
    console.log(
      `      wearForUse: ${cases.map(([n, id, c]) => `${n} ${wearForUse(id, c)}`).join(" / ")}`,
    );
    for (const [name, item, creative, want] of cases) {
      const got = wearForUse(item, creative);
      check(`${name} → ${want}`, got === want, `${got}`);
    }
  }

  // --- 掘っても減らない（逆向きの守り。弓で石を掘って弓が減っては困る） ---
  {
    const digging: [string, number][] = [["火種で掘る", FLINT_AND_STEEL], ["弓で掘る", BOW]];
    console.log(
      `      wearForBreaking: ${digging
        .map(([n, id]) => `${n} ${wearForBreaking(STONE, id, false)}`)
        .join(" / ")}`,
    );
    for (const [name, item] of digging) {
      check(`${name} → 0`, wearForBreaking(STONE, item, false) === 0, `${wearForBreaking(STONE, item, false)}`);
    }
    // 掘る道具のほうは今までどおり（この行が落ちたら、守りを広げすぎている）。
    check("ツルハシで掘るのは今までどおり 1", wearForBreaking(STONE, WOOD_PICKAXE, false) === 1);
  }

  // --- 使い切ると壊れる（64 回目・384 回目） ---
  {
    const wearOut = (item: number, max: number): { last: boolean; broke: number; after: Slot } => {
      const held = slot(item);
      for (let i = 0; i < max - 1; i++) wearSlot(held, wearForUse(held.item, false));
      const last = held.item === item && held.damage === max - 1;
      const broke = wearSlot(held, wearForUse(held.item, false));
      return { last, broke, after: held };
    };
    const fire = wearOut(FLINT_AND_STEEL, FIRE_STARTER_USES);
    const bow = wearOut(BOW, BOW_USES);
    console.log(
      `      使い切り: 火種 63 回目 ${fire.last ? "手に残る" : "消えた"} → 64 回目 ${fire.broke} / ` +
        `弓 383 回目 ${bow.last ? "手に残る" : "消えた"} → 384 回目 ${bow.broke}`,
    );
    check("火種は 63 回目までは手に残る", fire.last);
    check("火種は 64 回目で壊れる", fire.broke === FLINT_AND_STEEL && isEmpty(fire.after), `${fire.broke}`);
    check("弓は 383 回目までは手に残る", bow.last);
    check("弓は 384 回目で壊れる", bow.broke === BOW && isEmpty(bow.after), `${bow.broke}`);
    check("壊れた枠の傷は 0 に戻る", (fire.after.damage ?? 0) === 0 && (bow.after.damage ?? 0) === 0);

    const message = breakMessage(FLINT_AND_STEEL);
    console.log(`      壊れたとき: ${message} / ${breakMessage(BOW)}`);
    check("壊れた 1 行に名前が出る", message === "火打石と打ち金 が壊れました", message);
  }

  // --- 帯（新品では出さない。`ui.ts` は貼るだけ） ---
  {
    const bow = slot(BOW);
    const fresh = wearBar(bow);
    wearSlot(bow, wearForUse(bow.item, false));
    const used = wearBar(bow);
    console.log(`      帯: 新品の弓 ${fresh} → 1 回使うと ${used.toFixed(4)}（傷 ${bow.damage}）`);
    check("無傷の弓は -1（帯を出さない）", fresh === -1, `${fresh}`);
    check("1 回使うと 383/384", Math.abs(used - 383 / 384) < 1e-9, `${used}`);
    check("無傷の火種も -1", wearBar(slot(FLINT_AND_STEEL)) === -1);
  }

  // --- セーブの往復（新しいキーは 1 つも要らない） ---
  {
    const bare = [slot(BOW, 1, 12), slot(FLINT_AND_STEEL, 1, 5)];
    const flat = serializeWear(bare);
    console.log(`      往復前: ${JSON.stringify(flat)}`);
    check("傷ごと書き出せる", JSON.stringify(flat) === "[12,5]", JSON.stringify(flat));
    const back = [slot(BOW), slot(FLINT_AND_STEEL)];
    deserializeWear(back, flat);
    console.log(`      往復後: 弓 ${back[0].damage} / 火種 ${back[1].damage}`);
    check("往復しても傷が残る", back[0].damage === 12 && back[1].damage === 5);
    // 壊れた値は「最大 - 1」に丸める（壊れているのに手に残る状態を作らない）。
    console.log(`      wornValue(弓, 999) = ${wornValue(BOW, 999)}`);
    check("最大以上は 383 に丸める", wornValue(BOW, 999) === 383, `${wornValue(BOW, 999)}`);
    check("火種も同じ丸め方（63）", wornValue(FLINT_AND_STEEL, 999) === 63, `${wornValue(FLINT_AND_STEEL, 999)}`);
  }

  // --- `SaveData` のキーが 1 つも増えていない ---
  {
    const storage = sourceOf("src/storage.ts");
    const keys = [...storage.matchAll(/\n\s*(\w*[Ww]ear)\?:/g)].map((m) => m[1]);
    console.log(`      SaveData の傷のキー ${keys.length} 個: ${keys.join(" / ")}`);
    check(
      "傷のキーは今までの 5 つのまま",
      keys.length === 5 && keys.join(",") === "wear,craftWear,dropWear,furnaceWear,chestWear",
      keys.join(" / "),
    );
    check("version は 1 のまま", storage.includes("version: 1;"), "");
  }

  // 見張り 1: 回数を運ぶ側へ書き戻していない（`main.ts` は何回で尽きるかを知らない）。
  const mainSource = sourceOf("src/main.ts");
  const digits = [...mainSource.matchAll(/384/g)].length;
  console.log(`      main.ts の 384 は ${digits} 件`);
  check("main.ts に 384 が出てこない", digits === 0, `${digits} 件`);

  // 見張り 2: 配線が 3 か所とも生きている（点火・発射・刈る）。
  // **1 つ減ると、その経路だけ「使っても減らない道具」になる。**
  const uses = [...mainSource.matchAll(/wearForUse\(/g)].length;
  console.log(`      main.ts の wearForUse( は ${uses} 回`);
  check("main.ts は点火・発射・刈るの 3 か所から呼ぶ", uses === 3, `${uses} 回`);

  // 見張り 3: どれが火種・どれが弓かは `items.ts` の表 1 本（`durability.ts` は知らない）。
  const durabilitySource = sourceOf("src/durability.ts");
  const named = [/\bBOW\b/, /\bFLINT_AND_STEEL\b/].filter((re) => re.test(durabilitySource));
  check("durability.ts にアイテムの名前が出てこない", named.length === 0, named.join(" / "));

  describe("シアーズ（使って減る 3 つ目）");

  // --- 試験場が効いているか（先に置く。`rules/testing.md`） ---
  {
    const shears = slot(SHEARS);
    console.log(
      `      シアーズ: 名前 ${itemName(SHEARS)} / ${maxUses(SHEARS)} 回 / ` +
        `1 枠 ${itemStackLimit(SHEARS)} 個 / 新品の傷 ${shears.damage}`,
    );
    check("名前が付いている", itemName(SHEARS) === "シアーズ", itemName(SHEARS));
    check("238 回（Minecraft のまま）", maxUses(SHEARS) === SHEARS_USES && SHEARS_USES === 238, `${maxUses(SHEARS)}`);
    // 傷が付く物は全部 `stack: 1`（山にすると、半端に傷んだ山を割る話が始まる）。
    check("積めるのは 1 個まで", itemStackLimit(SHEARS) === 1, `${itemStackLimit(SHEARS)}`);
  }

  // --- 減り方は「使って減る」だけ（掘っても殴っても減らない） ---
  {
    const use = wearForUse(SHEARS, false);
    const dig = wearForBreaking(STONE, SHEARS, false);
    const hit = wearForAttack(SHEARS, false);
    const inCreative = wearForUse(SHEARS, true);
    console.log(
      `      シアーズ: wearForUse ${use} / wearForBreaking(石) ${dig} / ` +
        `wearForAttack ${hit} / クリエイティブ ${inCreative}`,
    );
    check("刈ると 1 減る", use === 1, `${use}`);
    // **`tool:` を持たせると、ここが 1 になって石を掘るたびに減る**（禁じ手 1）。
    check("石を掘っても減らない", dig === 0, `${dig}`);
    check("殴っても減らない（剣ではない）", hit === 0, `${hit}`);
    check("クリエイティブでは減らない", inCreative === 0, `${inCreative}`);
  }

  // --- 使い切ると壊れる（238 回目） ---
  {
    const held = slot(SHEARS);
    for (let i = 0; i < SHEARS_USES - 1; i++) wearSlot(held, wearForUse(held.item, false));
    const last = held.item === SHEARS && held.damage === SHEARS_USES - 1;
    const broke = wearSlot(held, wearForUse(held.item, false));
    console.log(
      `      使い切り: 237 回目 ${last ? "手に残る" : "消えた"} → 238 回目 ${broke}（傷 ${held.damage}）`,
    );
    check("237 回目までは手に残る", last, `${held.item} / 傷 ${held.damage}`);
    check("238 回目で壊れる", broke === SHEARS && isEmpty(held), `${broke}`);
    check("壊れた 1 行に名前が出る", breakMessage(SHEARS) === "シアーズ が壊れました", breakMessage(SHEARS));
  }

  describe("剣（殴って減る）");

  const SWORDS: [string, number, number][] = [
    ["木の剣", WOOD_SWORD, 59],
    ["石の剣", STONE_SWORD, 131],
    ["鉄の剣", IRON_SWORD, 250],
    ["ダイヤの剣", DIAMOND_SWORD, 1561],
  ];

  // --- 試験場が効いているか（先に置く。`rules/testing.md`） ---
  {
    console.log(
      `      剣 4 本: ${SWORDS.map(([, id]) => `${itemName(id)} ${maxUses(id)} 回`).join(" / ")}`,
    );
    check(
      "4 本とも名前が付いている",
      SWORDS.every(([name, id]) => itemName(id) === name),
      SWORDS.map(([, id]) => itemName(id)).join(" / "),
    );
    // **階層の表（`TOOL_USES`）がそのまま効く**（剣用の 5 つ目の表を作っていない）。
    for (const [name, id, uses] of SWORDS) {
      check(`${name}は ${uses} 回`, maxUses(id) === uses, `${maxUses(id)} 回`);
    }
    check(
      "回数は掘る道具と同じ表から来ている",
      SWORDS.every(([, id], i) => maxUses(id) === TOOL_USES[i + 1]),
      `TOOL_USES = ${TOOL_USES.join(" / ")}`,
    );
  }

  // --- `wearForAttack()` の全ケース（減るのは剣だけ） ---
  {
    const cases: [string, number, boolean, number][] = [
      ["木の剣で殴る（減る）", WOOD_SWORD, false, 1],
      ["ダイヤの剣で殴る（減る）", DIAMOND_SWORD, false, 1],
      ["クリエイティブの剣", WOOD_SWORD, true, 0],
      // **本家は掘る道具も殴ると減るが、ここではそうしない**（既存 12 本の寿命が縮む）。
      ["ツルハシで殴る", WOOD_PICKAXE, false, 0],
      ["弓で殴る", BOW, false, 0],
      ["火種で殴る", FLINT_AND_STEEL, false, 0],
      ["棒で殴る", STICK, false, 0],
      ["素手で殴る", NO_ITEM, false, 0],
    ];
    console.log(
      `      wearForAttack: ${cases.map(([n, id, c]) => `${n} ${wearForAttack(id, c)}`).join(" / ")}`,
    );
    for (const [name, item, creative, want] of cases) {
      const got = wearForAttack(item, creative);
      check(`${name} → ${want}`, got === want, `${got}`);
    }
  }

  // --- 3 つの減り方が混ざっていない（剣を右クリックしても減らない） ---
  {
    const use = wearForUse(WOOD_SWORD, false);
    const dig = wearForBreaking(STONE, WOOD_SWORD, false);
    console.log(`      剣: wearForUse ${use} / wearForBreaking(石) ${dig}`);
    check("剣を右クリックしても減らない（wearForUse は 0）", use === 0, `${use}`);
    // 本家と同じで、剣で掘れば減る（`toolOf()` が非 null なので 1 行も足さずに付いてくる）。
    check("剣で石を掘ると減る（wearForBreaking は 1）", dig === 1, `${dig}`);
    // 逆向きの守り: 掘る道具・弓・火種の既存の減り方は変わっていない。
    check("ツルハシで掘るのは今までどおり 1", wearForBreaking(STONE, WOOD_PICKAXE, false) === 1);
    check("弓を放つのは今までどおり 1", wearForUse(BOW, false) === 1);
  }

  // --- 掘る速さは素手と同じ（剣は採掘道具ではない） ---
  {
    const times = [
      ["素手", breakTime(STONE, NO_ITEM)],
      ["木の剣", breakTime(STONE, WOOD_SWORD)],
      ["木のツルハシ", breakTime(STONE, WOOD_PICKAXE)],
    ] as const;
    console.log(`      石を掘る秒数: ${times.map(([n, t]) => `${n} ${t.toFixed(2)}`).join(" / ")}`);
    check(
      "剣で掘っても素手と同じ速さ",
      breakTime(STONE, WOOD_SWORD) === breakTime(STONE, NO_ITEM),
      `剣 ${breakTime(STONE, WOOD_SWORD)} / 素手 ${breakTime(STONE, NO_ITEM)}`,
    );
    check(
      "ツルハシのほうが速いまま",
      breakTime(STONE, WOOD_PICKAXE) < breakTime(STONE, WOOD_SWORD),
    );
  }

  // --- 使い切ると壊れる（59 回目。58 回目はまだ手に残る） ---
  {
    const held = slot(WOOD_SWORD);
    for (let i = 0; i < 58; i++) wearSlot(held, wearForAttack(held.item, false));
    const last = held.item === WOOD_SWORD && held.damage === 58;
    // **壊す前に控えを取ること** —— 壊れた枠は傷が 0 に戻るので、
    // あとから `held.damage` を読むと「58 回目なのに傷 0」という嘘の補足が出る。
    const lastDamage = held.damage ?? 0;
    const broke = wearSlot(held, wearForAttack(held.item, false));
    console.log(
      `      使い切り: 58 回目 ${last ? "手に残る" : "消えた"} → 59 回目 ${broke}（${breakMessage(WOOD_SWORD)}）`,
    );
    check("58 回殴っても手に残る", last, `傷 ${lastDamage}`);
    check("59 回目で壊れる", broke === WOOD_SWORD && isEmpty(held), `${broke}`);
    check("壊れた枠の傷は 0 に戻る", (held.damage ?? 0) === 0, `${held.damage}`);
    check(
      "壊れた 1 行に名前が出る",
      breakMessage(WOOD_SWORD) === "木の剣 が壊れました",
      breakMessage(WOOD_SWORD),
    );
  }

  // --- 帯もセーブもそのまま乗る（`maxUses()` 1 本から伸びる） ---
  {
    const sword = slot(DIAMOND_SWORD);
    const fresh = wearBar(sword);
    wearSlot(sword, wearForAttack(sword.item, false));
    const used = wearBar(sword);
    console.log(`      帯: 新品のダイヤの剣 ${fresh} → 1 回殴ると ${used.toFixed(5)}`);
    check("無傷の剣は -1（帯を出さない）", fresh === -1, `${fresh}`);
    check("1 回殴ると 1560/1561", Math.abs(used - 1560 / 1561) < 1e-9, `${used}`);
    check("最大以上は 1560 に丸める", wornValue(DIAMOND_SWORD, 99999) === 1560, `${wornValue(DIAMOND_SWORD, 99999)}`);
    check("剣は 1 個しか積めない（傷が付く物はすべて stack: 1）", itemStackLimit(WOOD_SWORD) === 1);
  }

  // 見張り 1: 配線は 1 か所だけ（**殴れたときだけ**減る。クールダウン中は減らない）。
  const attacks = [...sourceOf("src/main.ts").matchAll(/wearForAttack\(/g)].length;
  console.log(`      main.ts の wearForAttack( は ${attacks} 回`);
  check("main.ts は殴った 1 か所からだけ呼ぶ", attacks === 1, `${attacks} 回`);

  // 見張り 2: どれが剣かは `items.ts` の `isSword()`（`durability.ts` は名前を知らない）。
  const swordNames = [/\bWOOD_SWORD\b/, /\bSTONE_SWORD\b/, /\bIRON_SWORD\b/, /\bDIAMOND_SWORD\b/]
    .filter((re) => re.test(durabilitySource));
  check("durability.ts に剣のアイテム名が出てこない", swordNames.length === 0, swordNames.join(" / "));
}
