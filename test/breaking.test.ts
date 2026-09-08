import {
  AIR,
  BED,
  CHEST,
  COBBLE,
  DIRT,
  FURNACE,
  FURNACE_LIT,
  GRAVEL,
  ICE,
  LEAVES,
  STONE,
  TORCH,
  WATER,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
  bedPartner,
  blockName,
} from "../src/blocks";
import { autoBreak, tryBreak, type BreakContainers } from "../src/breaking";
import { APPLE, FLINT, NO_ITEM, STICK, WHEAT, WHEAT_SEEDS, WOOD_PICKAXE, itemName } from "../src/items";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 中身を返す器の偽物。**取り除かれた回数も数える**（壊したのに呼ばれない、を見つける）。
 *
 * **本物の `Chests` / `Furnaces` を持ち込まないこと** —— ここが見たいのは
 * 「器が返した値を素通しするか」だけで、器の中身の持ち方は向こうのテストの仕事。
 * `damage` は省略できる（傷が無い器も同じ形で並べられる）。
 */
function container(held: { item: number; count: number; damage?: number }[] = []) {
  const calls: string[] = [];
  return {
    calls,
    remove(x: number, y: number, z: number) {
      calls.push(`${x},${y},${z}`);
      return held;
    },
  };
}

function containers(
  furnaceHeld: { item: number; count: number; damage?: number }[] = [],
  chestHeld: { item: number; count: number; damage?: number }[] = [],
): BreakContainers & { furnaces: ReturnType<typeof container>; chests: ReturnType<typeof container> } {
  return { furnaces: container(furnaceHeld), chests: container(chestHeld) };
}

/**
 * 掘る注文（並はサバイバル・木のツルハシ・抽選は真ん中）。
 *
 * **2 山目の抽選（`extraRoll`）の既定は 0.9 = 外れ**にしてある —— 葉のリンゴ（0.5%）が
 * 混ざると、既存の「1 山」の判定が壊れる周とそうでない周が乱数次第になる。
 * **`extra.chance` を持たない 2 山目（実った小麦の種）は 0.9 でも必ず落ちます。**
 */
function order(id: number, over: Partial<Parameters<typeof tryBreak>[2]> = {}) {
  return {
    x: 0,
    y: 11,
    z: 0,
    id,
    tool: WOOD_PICKAXE,
    creative: false,
    roll: 0.5,
    extraRoll: 0.9,
    ...over,
  };
}

export function run(): void {
  describe("壊したときに何が落ちるか");

  // --- 切り分け（`breaking.ts` は判断だけを持つ） ---
  const source = sourceOf("src/breaking.ts");
  const leaked = [
    "document.",
    "Mesh",
    "AudioContext",
    // **乱数は呼ぶ側が作る**（`rollDrop()` と同じ約束）。
    "Math.random(",
    // `World` を丸ごと受け取らない（`beds.ts` / `placing.ts` と同じ作法）。
    'from "three"',
    'from "./world"',
    'from "./drops"',
  ].filter((name) => source.includes(name));
  check("breaking.ts は判断だけを持つ（乱数も作らない）", leaked.length === 0, leaked.join(" "));

  // もとは `main.ts` の `breakBlock()` と `onAutoBreak`。**戻っていないこと**を語で見る
  // （`test/ui.test.ts` の `.chance` と同じ作法）。
  const main = sourceOf("src/main.ts");
  const backInMain = ["rollDrop(", "rollDrops(", "canHarvest(", "clearBedPartner("].filter((name) =>
    main.includes(name),
  );
  check("main.ts に落とす判断が戻っていない", backInMain.length === 0, backInMain.join(" "));

  // --- 掘って壊す ---
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, STONE);
    const out = tryBreak(world, containers(), order(STONE));
    check("掘ったマスは空になる", world.getVoxel(0, 11, 0) === AIR);
    check("丸石が 1 個落ちる", out.drops.length === 1 && out.drops[0].item === COBBLE, describeDrops(out.drops));
    check("落とす場所はマスの中心（少し上）", out.drops[0].x === 0.5 && out.drops[0].z === 0.5);
    check("掘ったぶんの消耗を足す", out.exhaust);
  }

  // **書き込めない列では何もしない。** 未読み込みの列では `setVoxel` が黙って失敗するので、
  // ここで落とすと「掘れていないのにアイテムだけ増える」ことになる。
  {
    const frozen = new Slab();
    frozen.setVoxel(0, 11, 0, STONE);
    frozen.frozenColumns.add("0,0");
    const out = tryBreak(frozen, containers(), order(STONE));
    check("書き込めなければ壊れていない", !out.broken);
    check("書き込めなければ何も落ちない", out.drops.length === 0);
    check("書き込めなければ消耗も足さない", !out.exhaust);
  }

  // **階層が足りない道具では何も落ちない。** それでも消耗は足す（掘った労力は同じ）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, STONE);
    const out = tryBreak(world, containers(), order(STONE, { tool: NO_ITEM }));
    check("素手で石を掘っても何も落ちない", out.broken && out.drops.length === 0);
    check("落ちなくても消耗は足す", out.exhaust);
  }

  // 素手で掘れるものは落ちる（`minTier` 0）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, DIRT);
    const out = tryBreak(world, containers(), order(DIRT, { tool: NO_ITEM }));
    check("土は素手で落ちる", out.drops.length === 1 && out.drops[0].item === DIRT, describeDrops(out.drops));
  }

  // **確率は `items.ts` の `rollDrop()`。** ここは渡された値で分かれるだけ
  // （砂利は 10% で火打石、外したら砂利そのもの）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, GRAVEL);
    const hit = tryBreak(world, containers(), order(GRAVEL, { tool: NO_ITEM, roll: 0.05 }));
    world.setVoxel(0, 11, 0, GRAVEL);
    const miss = tryBreak(world, containers(), order(GRAVEL, { tool: NO_ITEM, roll: 0.5 }));
    check(
      "抽選の値がそのまま効く（砂利 → 火打石 / 砂利）",
      hit.drops[0]?.item === FLINT && miss.drops[0]?.item === GRAVEL,
      `${describeDrops(hit.drops)} / ${describeDrops(miss.drops)}`,
    );
  }

  // --- クリエイティブ ---
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, STONE);
    const out = tryBreak(world, containers(), order(STONE, { creative: true }));
    check("クリエイティブでは何も落ちない", out.broken && out.drops.length === 0);
    check("クリエイティブでは腹も減らない", !out.exhaust);
  }

  // --- 器の中身（**クリエイティブでも出す**） ---
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, FURNACE_LIT);
    const bag = containers([{ item: COBBLE, count: 7 }]);
    const out = tryBreak(world, bag, order(FURNACE_LIT, { creative: true }));
    check("点火中のかまども中身を出す（大元の ID で見る）", bag.furnaces.calls.length === 1, bag.furnaces.calls.join(" "));
    check(
      "かまどの中身はクリエイティブでも落ちる",
      out.drops.length === 1 && out.drops[0].item === COBBLE && out.drops[0].count === 7,
      describeDrops(out.drops),
    );
  }
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, CHEST);
    const bag = containers([], [{ item: STONE, count: 64 }]);
    const out = tryBreak(world, bag, order(CHEST, { creative: true }));
    check("チェストの中身もクリエイティブで落ちる", out.drops.length === 1, describeDrops(out.drops));
    check("かまどの器は呼ばない", bag.furnaces.calls.length === 0);
  }
  // かまどでないものを壊したときに器を触らないこと（触ると、隣のかまどの中身が消えうる）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, STONE);
    const bag = containers([{ item: COBBLE, count: 1 }], [{ item: COBBLE, count: 1 }]);
    tryBreak(world, bag, order(STONE));
    check(
      "器でないブロックでは器に触らない",
      bag.furnaces.calls.length === 0 && bag.chests.calls.length === 0,
    );
  }

  // --- ベッドは 2 マスで 1 台（**どちらを壊しても相方も消す**） ---
  {
    const partner = bedPartner(BED);
    const world = new Slab();
    world.setVoxel(0, 11, 0, BED);
    if (partner) world.setVoxel(partner.dx, 11, partner.dz, partner.id);
    const out = tryBreak(world, containers(), order(BED, { creative: true }));
    check(
      "クリエイティブでも相方が消える",
      partner !== null && world.getVoxel(partner.dx, 11, partner.dz) === AIR,
    );
    check("相方のぶんは落とさない（出るベッドは 1 個）", out.drops.length === 0, describeDrops(out.drops));
  }

  // --- 支えを失って壊れたぶん（`World.onAutoBreak`） ---
  {
    const world = new Slab();
    // **道具を見ない。** 松明は支えが消えて落ちたので、適正も何もない。
    const dropped = autoBreak(world, 2, 12, 3, TORCH, false, 0.5, 0.9);
    check("支えを失った松明は落ちる", dropped.length === 1 && dropped[0].item === TORCH, describeDrops(dropped));
    check("落とす場所はそのマスの中心", dropped[0].x === 2.5 && dropped[0].z === 3.5);
    check("クリエイティブでは落ちない", autoBreak(world, 2, 12, 3, TORCH, true, 0.5, 0.9).length === 0);
  }
  {
    // **ベッドの相方はクリエイティブでも消す**（床を掘られた半分だけが消えると、
    // 相方の居ないベッドが残る）。
    const partner = bedPartner(BED);
    const world = new Slab();
    if (partner) world.setVoxel(partner.dx, 11, partner.dz, partner.id);
    autoBreak(world, 0, 11, 0, BED, true, 0.5, 0.9);
    check(
      "支えを失ったベッドも相方を連れていく（クリエイティブでも）",
      partner !== null && world.getVoxel(partner.dx, 11, partner.dz) === AIR,
    );
  }

  // --- 小麦の苗（**アイテムを持たないブロック**なので、`DROPS` の 1 行が唯一の根拠） ---
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, WHEAT_CROP);
    const out = tryBreak(world, containers(), order(WHEAT_CROP, { tool: NO_ITEM }));
    check(
      "苗を掘ると種が 1 個",
      out.drops.length === 1 && out.drops[0].item === WHEAT_SEEDS && out.drops[0].count === 1,
      describeDrops(out.drops),
    );
  }
  {
    // **耕地を掘ると苗も一緒に壊れて種になる**（`supportFace: FACE_YN` の経路）。
    // ここが `autoBreak()` を通らないと、**苗だけが宙に浮いたまま残る。**
    const world = new Slab();
    const dropped = autoBreak(world, 0, 11, 0, WHEAT_CROP, false, 0.5, 0.9);
    check(
      "支えを失った苗も種になって落ちる",
      dropped.length === 1 && dropped[0].item === WHEAT_SEEDS,
      describeDrops(dropped),
    );
    check("クリエイティブでは落ちない", autoBreak(world, 0, 11, 0, WHEAT_CROP, true, 0.5, 0.9).length === 0);
  }

  // --- 実った小麦（**1 回の採掘で 2 山**。`variantOf` は苗なので `DROPS` の 1 行が根拠） ---
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, WHEAT_CROP_RIPE);
    const out = tryBreak(world, containers(), order(WHEAT_CROP_RIPE, { tool: NO_ITEM }));
    console.log(`      実った小麦を掘って出た山: ${describeDrops(out.drops)}`);
    check("実った小麦を掘ると 2 山", out.drops.length === 2, `${out.drops.length} 山`);
    check(
      "小麦 1 個と種 1 個（種が戻るので畑が自転する）",
      out.drops[0]?.item === WHEAT && out.drops[0]?.count === 1 &&
        out.drops[1]?.item === WHEAT_SEEDS && out.drops[1]?.count === 1,
      describeDrops(out.drops),
    );
    // **2 山とも同じマスに出す**（散らすのは `drops.ts` の `burst()` の仕事）。
    check(
      "2 山とも同じ場所から出る",
      out.drops.every((d) => d.x === 0.5 && d.z === 0.5),
      out.drops.map((d) => `(${d.x},${d.z})`).join(" "),
    );
  }
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, WHEAT_CROP_RIPE);
    const out = tryBreak(world, containers(), order(WHEAT_CROP_RIPE, { tool: NO_ITEM, creative: true }));
    check("クリエイティブでは 2 山とも落ちない", out.drops.length === 0, describeDrops(out.drops));
  }
  {
    // **耕地を掘ると実った小麦も一緒に壊れて 2 山になる**（`autoBreak()` の経路）。
    // 掘る経路だけ直すと、床を抜いたときだけ種が落ちない、という形で静かにずれる。
    const world = new Slab();
    const dropped = autoBreak(world, 0, 11, 0, WHEAT_CROP_RIPE, false, 0.5, 0.9);
    check(
      "耕地を掘っても小麦と種の 2 山（掘った経路と同じ）",
      dropped.length === 2 && dropped[0].item === WHEAT && dropped[1].item === WHEAT_SEEDS,
      describeDrops(dropped),
    );
    check(
      "クリエイティブでは落ちない",
      autoBreak(world, 0, 11, 0, WHEAT_CROP_RIPE, true, 0.5, 0.9).length === 0,
    );
  }

  // 2 つの経路が**同じ規則**で落とすこと（片方だけ直すと静かにずれる）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, GRAVEL);
    const mined = tryBreak(world, containers(), order(GRAVEL, { tool: NO_ITEM, roll: 0.05 })).drops;
    const fell = autoBreak(world, 0, 11, 0, GRAVEL, false, 0.05, 0.9);
    check(
      "掘った経路と支えを失った経路で落ちるものが同じ",
      mined[0]?.item === fell[0]?.item && mined[0]?.count === fell[0]?.count,
      `${describeDrops(mined)} / ${describeDrops(fell)}`,
    );
  }

  // --- 2 山目の抽選（`extraRoll`）を素通しするか -----------------------------
  // **葉のリンゴがここを通る。** `roll` だけを渡していると（`extraRoll` を
  // 使い回す・落とす）、**リンゴが永久に出ないのに他の判定は全部緑**になる。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, LEAVES);
    // **棒は外し、リンゴだけ当てる目**（1 山目の当たり外れと無関係なことも一緒に見る）。
    const out = tryBreak(world, containers(), order(LEAVES, { tool: NO_ITEM, roll: 0.5, extraRoll: 0.001 }));
    console.log(`      葉を掘って出た山（棒外し・リンゴ当たり）: ${describeDrops(out.drops)}`);
    check(
      "掘る経路が extraRoll を素通しする（葉からリンゴが 1 個）",
      out.drops.length === 1 && out.drops[0]?.item === APPLE && out.drops[0]?.count === 1,
      describeDrops(out.drops),
    );
    check("リンゴも同じマスの中心から出る", out.drops[0]?.x === 0.5 && out.drops[0]?.z === 0.5);
  }
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, LEAVES);
    const out = tryBreak(world, containers(), order(LEAVES, { tool: NO_ITEM, roll: 0.5, extraRoll: 0.001, creative: true }));
    check("クリエイティブではリンゴも落ちない", out.drops.length === 0, describeDrops(out.drops));
  }
  {
    // **支えを失って落ちた葉も同じ規則**（片方だけ直すと、木を切ったときと
    // 幹を抜いたときでリンゴの出方が食い違う）。
    const world = new Slab();
    const dropped = autoBreak(world, 0, 11, 0, LEAVES, false, 0.05, 0.001);
    check(
      "支えを失った葉も棒 + リンゴの 2 山（掘った経路と同じ）",
      dropped.length === 2 && dropped[0].item === STICK && dropped[1].item === APPLE,
      describeDrops(dropped),
    );
    check(
      "支えを失った葉もリンゴを外せば棒だけ",
      autoBreak(world, 0, 11, 0, LEAVES, false, 0.05, 0.9).length === 1,
      describeDrops(autoBreak(world, 0, 11, 0, LEAVES, false, 0.05, 0.9)),
    );
  }

  // かまどは大元の ID で見ているか（点火中と消えているのが同じ 1 台）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, FURNACE);
    const bag = containers([{ item: COBBLE, count: 1 }]);
    tryBreak(world, bag, order(FURNACE));
    check("消えているかまども中身を出す", bag.furnaces.calls.length === 1);
  }

  // --- 器の中身の傷は素通しするだけ -----------------------------------------

  // **`Burst.damage` は器が返した値そのまま。** `breaking.ts` は「道具かどうか」も
  // 「何回で尽きるか」も知らない（決めるのは `durability.ts`）。
  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, CHEST);
    const bag = containers([], [
      { item: WOOD_PICKAXE, count: 1, damage: 33 },
      { item: COBBLE, count: 5 },
    ]);
    const out = tryBreak(world, bag, order(CHEST));
    console.log(
      `      チェストから出た山: ${out.drops.map((d) => `${itemName(d.item)} x${d.count} 傷 ${d.damage}`).join(" / ")}`,
    );
    const tool = out.drops.find((d) => d.item === WOOD_PICKAXE);
    const rock = out.drops.find((d) => d.item === COBBLE);
    check("チェストの傷が Burst に素通しされる", tool?.damage === 33, String(tool?.damage));
    // **傷の無い山は `damage` を持たない**（`drops.burst()` の既定 0 に落ちる）。
    check("器が傷を返さなければ持たない", rock !== undefined && rock.damage === undefined, String(rock?.damage));
  }

  {
    const world = new Slab();
    world.setVoxel(0, 11, 0, FURNACE_LIT);
    const bag = containers([{ item: WOOD_PICKAXE, count: 1, damage: 7 }]);
    const out = tryBreak(world, bag, order(FURNACE_LIT));
    const tool = out.drops.find((d) => d.item === WOOD_PICKAXE);
    check("点火中のかまどの傷も素通しされる", tool?.damage === 7, String(tool?.damage));
  }

  {
    // 掘って出たものは**必ず新品**（器を通らない経路に傷は付かない）。
    const world = new Slab();
    world.setVoxel(0, 11, 0, STONE);
    const out = tryBreak(world, containers(), order(STONE));
    check("掘って出た山は傷を持たない", out.drops.every((d) => d.damage === undefined), describeDrops(out.drops));
  }

  // --- 壊したあとにマスへ残るもの（氷だけが水。ほかは今までどおり空気） --------
  // **決めるのは `blocks.ts` の `remainsAfterBreak()`** で、ここは書き込むだけ。
  // **前後のボクセルを並べてから判定する** —— 「壊れていない」実装は
  // 「壊すと水になる」と絵でも数値でも見分けが付かないので、**先に氷だったこと**も出す。
  {
    const ways: [string, { tool: number; creative: boolean }][] = [
      ["素手", { tool: NO_ITEM, creative: false }],
      ["木のツルハシ", { tool: WOOD_PICKAXE, creative: false }],
      ["クリエイティブ", { tool: NO_ITEM, creative: true }],
    ];
    const seen: string[] = [];
    for (const [name, over] of ways) {
      const world = new Slab();
      world.setVoxel(0, 11, 0, ICE);
      const before = world.getVoxel(0, 11, 0);
      const out = tryBreak(world, containers(), order(ICE, over));
      const after = world.getVoxel(0, 11, 0);
      seen.push(
        `${name}: ${blockName(before)} → ${blockName(after)}` +
          `（broken=${out.broken} 山 ${describeDrops(out.drops)}）`,
      );
      check(
        `氷を壊したマスは水になる（${name}）`,
        before === ICE && after === WATER && out.broken,
        `${blockName(before)} → ${blockName(after)}`,
      );
      check(`氷からは何も落ちない（${name}）`, out.drops.length === 0, describeDrops(out.drops));
    }
    console.log(`      氷を壊した前後: ${seen.join(" / ")}`);
  }
  {
    // **石は今までどおり空気**（既定が `AIR` のままであること。ここが水になったら
    // `remainsAfterBreak()` の既定を取り違えている）。
    const world = new Slab();
    world.setVoxel(0, 11, 0, STONE);
    tryBreak(world, containers(), order(STONE));
    const after = world.getVoxel(0, 11, 0);
    check("石を壊したマスは今までどおり空気", after === AIR, blockName(after));
  }
}

function describeDrops(drops: readonly { item: number; count: number }[]): string {
  if (drops.length === 0) return "なし";
  return drops.map((d) => `${itemName(d.item)} x${d.count}`).join(" / ");
}
