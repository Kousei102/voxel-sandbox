import {
  BEDROCK,
  COAL_ORE,
  COBBLE,
  DIAMOND_ORE,
  DIRT,
  GOLD_ORE,
  GRASS,
  GRAVEL,
  IRON_ORE,
  LEAVES,
  STONE,
  WATER,
  WOOD,
  blockName,
} from "../src/blocks";
import {
  COAL,
  DIAMOND,
  DIAMOND_PICKAXE,
  FLINT,
  IRON_PICKAXE,
  NO_ITEM,
  STONE_PICKAXE,
  WOOD_AXE,
  WOOD_PICKAXE,
  dropOf,
  rollDrop,
} from "../src/items";
import { Mining, breakTime, canHarvest } from "../src/mining";
import { seeded } from "./arena";
import { check, describe } from "./harness";

export function run(): void {
  describe("採掘");

  // どの道具で何秒かかるか、まず表にして出す
  const tools = [NO_ITEM, WOOD_PICKAXE, STONE_PICKAXE, IRON_PICKAXE, DIAMOND_PICKAXE];
  const names = ["素手", "木", "石", "鉄", "ダイヤ"];
  console.log("      ブロック      " + names.map((n) => n.padStart(7)).join(""));
  for (const block of [DIRT, STONE, COBBLE, COAL_ORE, IRON_ORE, DIAMOND_ORE]) {
    const cells = tools.map((tool) => {
      const time = breakTime(block, tool);
      const text = time.toFixed(2) + (canHarvest(block, tool) ? "" : "x");
      return text.padStart(7);
    });
    console.log(`      ${blockName(block).padEnd(12)}${cells.join("")}`);
  }

  // --- Minecraft と同じ式になっているか ---
  check("石を素手で 7.5 秒", Math.abs(breakTime(STONE, NO_ITEM) - 7.5) < 1e-9, `${breakTime(STONE)} 秒`);
  check(
    "木のツルハシなら 1.13 秒",
    Math.abs(breakTime(STONE, WOOD_PICKAXE) - 1.125) < 1e-9,
    `${breakTime(STONE, WOOD_PICKAXE).toFixed(3)} 秒`,
  );
  check(
    "階層が上がるほど速い",
    breakTime(STONE, WOOD_PICKAXE) > breakTime(STONE, STONE_PICKAXE) &&
      breakTime(STONE, STONE_PICKAXE) > breakTime(STONE, IRON_PICKAXE) &&
      breakTime(STONE, IRON_PICKAXE) > breakTime(STONE, DIAMOND_PICKAXE),
    `${breakTime(STONE, DIAMOND_PICKAXE).toFixed(3)} 秒（ダイヤ）`,
  );
  check(
    "種類の違う道具では速くならない",
    breakTime(STONE, WOOD_AXE) === breakTime(STONE, NO_ITEM),
    `斧 ${breakTime(STONE, WOOD_AXE)} 秒`,
  );
  check("水と岩盤は掘れない", !Number.isFinite(breakTime(BEDROCK)) && !Number.isFinite(breakTime(WATER)));

  // --- 適正道具とドロップ ---
  check("素手では石は落ちない", !canHarvest(STONE, NO_ITEM));
  check("木のツルハシで石は落ちる", canHarvest(STONE, WOOD_PICKAXE));
  check("土は素手でも落ちる", canHarvest(DIRT, NO_ITEM) && canHarvest(GRASS, NO_ITEM));
  check("木は素手でも落ちる（斧は速いだけ）", canHarvest(WOOD, NO_ITEM) && breakTime(WOOD, WOOD_AXE) < breakTime(WOOD, NO_ITEM));
  check("鉄鉱石は石のツルハシから", !canHarvest(IRON_ORE, WOOD_PICKAXE) && canHarvest(IRON_ORE, STONE_PICKAXE));
  check(
    "金とダイヤは鉄のツルハシから",
    !canHarvest(DIAMOND_ORE, STONE_PICKAXE) &&
      canHarvest(DIAMOND_ORE, IRON_PICKAXE) &&
      !canHarvest(GOLD_ORE, STONE_PICKAXE),
  );

  check("石を掘ると丸石が出る", dropOf(STONE).item === COBBLE);
  check("草を掘ると土が出る", dropOf(GRASS).item === DIRT);
  check("石炭鉱石から石炭", dropOf(COAL_ORE).item === COAL);
  // かまどが入ったので、鉱石は鉱石のまま落ちる（焼いてインゴットにする）。
  // **ここが IRON_INGOT に戻っていたら、精錬を飛ばせる抜け道ができている。**
  check(
    "鉄と金の鉱石は鉱石のまま落ちる（焼いてインゴットにする）",
    dropOf(IRON_ORE).item === IRON_ORE && dropOf(GOLD_ORE).item === GOLD_ORE,
  );
  check("ダイヤ鉱石からダイヤモンド", dropOf(DIAMOND_ORE).item === DIAMOND);
  check("葉はたまにしか落ちない", dropOf(LEAVES).chance < 1, `${(dropOf(LEAVES).chance * 100).toFixed(0)}%`);
  check("丸石はそのまま丸石", dropOf(COBBLE).item === COBBLE);

  gravelDropsFlint();

  // --- 進行 ---
  const mining = new Mining();
  const target = { x: 1, y: 2, z: 3 };
  let done = mining.update(0.5, target, STONE, WOOD_PICKAXE);
  check("途中では壊れない", !done && mining.progress > 0 && mining.progress < 1, `進行 ${mining.progress.toFixed(2)}`);
  check("進行に応じてひび割れが進む", mining.stage === 4, `段階 ${mining.stage}`);

  done = mining.update(0.7, target, STONE, WOOD_PICKAXE);
  check("時間ぶん掘ったら壊れる", done, `合計 1.2 秒 / 必要 ${breakTime(STONE, WOOD_PICKAXE).toFixed(2)} 秒`);
  check("壊したら進行はリセットされる", mining.progress === 0 && mining.target === null && mining.stage === -1);

  // 進行を捨てたなら、直前の 1 回ぶんだけが残るはず
  mining.update(0.5, target, STONE, WOOD_PICKAXE);
  mining.update(0.1, { x: 9, y: 9, z: 9 }, STONE, WOOD_PICKAXE);
  const afterMove = 0.1 / breakTime(STONE, WOOD_PICKAXE);
  check(
    "狙う先を変えたら進行が捨てられる",
    Math.abs(mining.progress - afterMove) < 1e-9,
    `進行 ${mining.progress.toFixed(3)}（捨てなければ ${(0.6 / breakTime(STONE, WOOD_PICKAXE)).toFixed(3)}）`,
  );

  mining.update(0.5, target, STONE, WOOD_PICKAXE);
  mining.update(0.1, target, STONE, DIAMOND_PICKAXE);
  const afterSwap = 0.1 / breakTime(STONE, DIAMOND_PICKAXE);
  check(
    "道具を持ち替えても進行が捨てられる",
    Math.abs(mining.progress - afterSwap) < 1e-9,
    `進行 ${mining.progress.toFixed(3)}`,
  );

  mining.reset();
  check("掘れないブロックは進まない", !mining.update(10, target, BEDROCK, DIAMOND_PICKAXE) && mining.progress === 0);
  check("狙いが無ければ進まない", !mining.update(10, null, STONE, DIAMOND_PICKAXE));
}

/**
 * 砂利 → 火打石。**ネザーポータルの点火手段はここから始まる。**
 *
 * `rollDrop()` は乱数を受け取るだけなので、**転がす側をこちらで持てる。**
 * 境目（0.1 のすぐ下・すぐ上）を直に指定できるうえ、割合の検証も
 * 種を固定した 1 本で回せる。
 */
function gravelDropsFlint(): void {
  check("砂利はシャベルで掘る", blockName(GRAVEL) === "砂利" && canHarvest(GRAVEL, NO_ITEM));

  // --- 境目。**乱数ではなく値を直に渡す。** ---
  check("外れの目でも砂利そのものが落ちる", rollDrop(GRAVEL, 0.5).item === GRAVEL);
  check("当たりの目で火打石が落ちる", rollDrop(GRAVEL, 0.05).item === FLINT);
  check(
    "葉は外すと何も落ちない（砂利と違う）",
    rollDrop(LEAVES, 0.5).item === NO_ITEM && rollDrop(LEAVES, 0.5).count === 0,
  );
  check(
    "確率の無いブロックは目に関わらず同じものが落ちる",
    rollDrop(STONE, 0).item === COBBLE && rollDrop(STONE, 0.999).item === COBBLE,
  );

  // --- 割合。**乱数は 1 本を回し続けること** ---
  // （1 回ごとに `seeded()` を作ると、線形合同法の 1 個目が種に引きずられて偏る）。
  const random = seeded(20260821);
  const got = new Map<number, number>();
  const ROUNDS = 4000;
  for (let i = 0; i < ROUNDS; i++) {
    const drop = rollDrop(GRAVEL, random());
    got.set(drop.item, (got.get(drop.item) ?? 0) + 1);
  }
  const flint = got.get(FLINT) ?? 0;
  const gravel = got.get(GRAVEL) ?? 0;
  const percent = (flint / ROUNDS) * 100;
  console.log(
    `      砂利 ${ROUNDS} 回: 火打石 ${flint} (${percent.toFixed(1)}%) / 砂利 ${gravel}` +
      `（表は ${(dropOf(GRAVEL).chance * 100).toFixed(0)}%）`,
  );
  check("砂利は表どおりの割合で火打石になる", Math.abs(percent - 10) < 2, `${percent.toFixed(1)}%`);
  // **掘っても何も出ない目があってはいけない。** `otherwise` を落とすとここが減る。
  check("掘れば必ず何かが落ちる", flint + gravel === ROUNDS, `${flint + gravel} / ${ROUNDS}`);
}
