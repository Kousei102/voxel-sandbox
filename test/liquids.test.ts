/**
 * 液体をぶつけたときに固まるか（黒曜石）。
 *
 * **規則（`blocks.ts` の `quenched()`）と、どのマスに効くか（`liquids.ts` の
 * `quenchAround()`）を別々に見る。** 前者は座標を知らない純関数、後者は
 * ワールドを書き換える側で、混ざると「規則は正しいのに効く場所が違う」を
 * 切り分けられなくなる。
 */

import { Scene } from "three";
import {
  AIR,
  LAVA,
  OBSIDIAN,
  STONE,
  WATER,
  blockName,
  quenched,
} from "../src/blocks";
import { DIAMOND_PICKAXE, IRON_PICKAXE, NO_ITEM, STONE_PICKAXE, dropOf, itemName } from "../src/items";
import { quenchAround } from "../src/liquids";
import { breakTime, canHarvest } from "../src/mining";
import { World } from "../src/world";
import { readFileSync } from "node:fs";
import { check, describe } from "./harness";

/**
 * 地面より上の空中に、5x3x5 の空っぽの試験場を作る。**本物の `World` を使う** ——
 * `quenchAround()` は `setVoxel` の戻り値を見て数えるので、`Arena` のような
 * 読み取り専用の試験場では肝心の経路が通らない。
 */
function stage(): { world: World; y: number } {
  const world = new World(new Scene(), 424242);
  world.primeAround(0.5, 0.5, 1);
  const y = world.surfaceY(0, 0) + 3;
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      for (let dy = -1; dy <= 1; dy++) world.setVoxel(x, y + dy, z, AIR);
    }
  }
  return { world, y };
}

export function run(): void {
  describe("黒曜石（液体が固まる）");

  // --- 規則そのもの（座標を知らない） ---

  check(
    "水に触れた溶岩は黒曜石になる",
    quenched(LAVA, WATER) === OBSIDIAN,
    `${blockName(LAVA)} + ${blockName(WATER)} → ${blockName(quenched(LAVA, WATER))}`,
  );
  check(
    "溶岩に触れた水は水のまま",
    quenched(WATER, LAVA) === WATER,
    `→ ${blockName(quenched(WATER, LAVA))}`,
  );
  check("溶岩と石では何も起きない", quenched(LAVA, STONE) === LAVA);
  check("溶岩と空気では何も起きない", quenched(LAVA, AIR) === LAVA);
  check("水と水では何も起きない", quenched(WATER, WATER) === WATER);
  check("液体でないものは固まらない", quenched(STONE, WATER) === STONE);

  // --- どのマスに効くか ---

  {
    const { world, y } = stage();
    world.setVoxel(1, y, 0, LAVA);
    // まず「試験場が効いている」証拠を取る。置けていなければ以下は全部素通りする。
    check("試験場に溶岩を置けた", world.getVoxel(1, y, 0) === LAVA);

    world.setVoxel(0, y, 0, WATER);
    const n = quenchAround(world, 0, y, 0);
    check("溶岩に水をかけると隣の溶岩が固まる", n === 1 && world.getVoxel(1, y, 0) === OBSIDIAN, `${n} 個`);
    check("かけた水は残る", world.getVoxel(0, y, 0) === WATER, blockName(world.getVoxel(0, y, 0)));
  }

  {
    const { world, y } = stage();
    world.setVoxel(1, y, 0, WATER);
    world.setVoxel(0, y, 0, LAVA);
    const n = quenchAround(world, 0, y, 0);
    check(
      "水に溶岩を流すと流したほうが固まる",
      n === 1 && world.getVoxel(0, y, 0) === OBSIDIAN,
      `${n} 個 / ${blockName(world.getVoxel(0, y, 0))}`,
    );
    check("もとからあった水は残る", world.getVoxel(1, y, 0) === WATER);
  }

  {
    const { world, y } = stage();
    world.setVoxel(1, y, 0, LAVA);
    world.setVoxel(-1, y, 0, LAVA);
    world.setVoxel(0, y + 1, 0, LAVA);
    world.setVoxel(0, y, 1, STONE);
    world.setVoxel(0, y, 0, WATER);
    const n = quenchAround(world, 0, y, 0);
    check("囲まれた溶岩は 6 方向ぶんまとめて固まる", n === 3, `${n} 個`);
    check(
      "接していない側は変わらない",
      world.getVoxel(0, y, 1) === STONE && world.getVoxel(0, y, -1) === AIR,
    );
  }

  {
    const { world, y } = stage();
    world.setVoxel(0, y, 0, WATER);
    const n = quenchAround(world, 0, y, 0);
    check("何も接していなければ固まらない", n === 0 && world.getVoxel(0, y, 0) === WATER, `${n} 個`);
  }

  {
    // 溶岩どうしを重ねても固まらない（「熱い + 熱い」）。
    const { world, y } = stage();
    world.setVoxel(1, y, 0, LAVA);
    world.setVoxel(0, y, 0, LAVA);
    const n = quenchAround(world, 0, y, 0);
    check("溶岩どうしでは固まらない", n === 0, `${n} 個`);
  }

  // --- 掘る側 ---

  {
    const tools = [NO_ITEM, STONE_PICKAXE, IRON_PICKAXE, DIAMOND_PICKAXE];
    const names = ["素手", "石", "鉄", "ダイヤ"];
    const cells = tools.map((t, i) => {
      const time = breakTime(OBSIDIAN, t);
      return `${names[i]} ${time.toFixed(1)}s${canHarvest(OBSIDIAN, t) ? "" : "x"}`;
    });
    console.log(`      黒曜石の採掘: ${cells.join(" / ")}（x = 掘れても落ちない）`);

    check("素手では落ちない", !canHarvest(OBSIDIAN, NO_ITEM));
    check(
      "階層の足りないツルハシでは落ちない（鉄でも駄目）",
      !canHarvest(OBSIDIAN, STONE_PICKAXE) && !canHarvest(OBSIDIAN, IRON_PICKAXE),
    );
    check("ダイヤのツルハシなら落ちる", canHarvest(OBSIDIAN, DIAMOND_PICKAXE));
    const drop = dropOf(OBSIDIAN);
    check(
      "落ちるのは黒曜石そのもの（必ず 1 個）",
      drop.item === OBSIDIAN && drop.count === 1 && drop.chance === 1,
      `${itemName(drop.item)} x${drop.count}`,
    );
    check(
      "ダイヤでもかなり遅い（準備してから行く場所になる）",
      breakTime(OBSIDIAN, DIAMOND_PICKAXE) > 5,
      `${breakTime(OBSIDIAN, DIAMOND_PICKAXE).toFixed(1)} 秒`,
    );
  }

  // --- 見張り ---

  {
    // 規則は `blocks.ts` の 1 か所。ここに `LAVA` / `WATER` / `OBSIDIAN` が
    // 出てきたら、それは「どの液体か」を 2 か所目に書いたということ。
    const source = readFileSync("src/liquids.ts", "utf8");
    const names = ["WATER", "LAVA", "OBSIDIAN"].filter((n) =>
      new RegExp(`\\b${n}\\b`).test(source),
    );
    check(
      "liquids.ts に液体の名前が漏れていない（規則は blocks.ts）",
      names.length === 0,
      names.length === 0 ? "" : names.join(" / "),
    );
  }
}
