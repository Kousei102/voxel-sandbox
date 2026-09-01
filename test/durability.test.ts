import { BEDROCK, COBBLE, IRON_ORE, STONE, TORCH } from "../src/blocks";
import { tryBreak } from "../src/breaking";
import {
  TOOL_USES,
  breakMessage,
  deserializeWear,
  maxUses,
  serializeWear,
  wearBar,
  wearForBreaking,
  wearSlot,
} from "../src/durability";
import { INVENTORY_SIZE, Inventory, isEmpty, type Slot } from "../src/inventory";
import { ARROW, DIAMOND_PICKAXE, IRON_PICKAXE, NO_ITEM, STICK, STONE_PICKAXE, WOOD_PICKAXE } from "../src/items";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 素の `Slot` 1 個。**`World` も DOM も要らない**（試験場はこれで足りる）。 */
function slot(item: number, count = 1, damage = 0): Slot {
  return { item, count, damage };
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
}
