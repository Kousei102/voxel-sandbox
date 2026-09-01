/**
 * 砂と砂利が落ちる（重力ブロック）。`test/liquids.test.ts` と同じ組み立てにする ——
 * **規則（`blocks.ts` の `fallsDown()`）と、どのマスに効くか（`gravity.ts` の
 * `settleColumn()` / `landingY()`）を別々に見る。**
 */

import { Scene } from "three";
import { AIR, GLASS, GRAVEL, SAND, STONE, TORCH, WATER, blockName, fallsDown } from "../src/blocks";
import { tryBreak, type BreakContainers } from "../src/breaking";
import { NO_ITEM } from "../src/items";
import { landingY, settleColumn } from "../src/gravity";
import { tryPlace } from "../src/placing";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** どこにも当たらない体（`test/placing.test.ts` と同じ）。 */
const nobody = { overlapsBlock: () => false };

/** 掘る／壊しても何も入っていない器。 */
const emptyContainers: BreakContainers = {
  furnaces: { remove: () => [] },
  chests: { remove: () => [] },
};

/** 狙っている面。`RaycastHit` と同じ形（`test/placing.test.ts` と同じ作り方）。 */
function aimAt(x: number, y: number, z: number, id: number) {
  return {
    id,
    block: { x, y, z },
    normal: { x: 0, y: 1, z: 0 },
    point: { y: y + 0.5 },
  };
}

/**
 * 地面より上の空中に、5x(2*height+1)x5 の空っぽの試験場を作る。**本物の `World` を使う** ——
 * `settleColumn()` / `tryBreak()` / `tryPlace()` は `setVoxel` の戻り値を見て動くので、
 * `Arena` のような読み取り専用の試験場では肝心の経路が通らない（`liquids.test.ts` の
 * `stage()` と同じ理由）。
 */
function stage(height = 6): { world: World; floorY: number } {
  const world = new World(new Scene(), new WorldGen(424242));
  world.primeAround(0.5, 0.5, 1);
  const top = world.surfaceY(0, 0) + height;
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      for (let dy = -height; dy <= height; dy++) world.setVoxel(x, top + dy, z, AIR);
    }
  }
  return { world, floorY: top - height };
}

export function run(): void {
  describe("重力ブロック（砂と砂利が落ちる）");

  // --- 規則そのもの（座標を知らない） ---

  check("砂は落ちる", fallsDown(SAND));
  check("砂利は落ちる", fallsDown(GRAVEL));
  check("石は落ちない", !fallsDown(STONE));
  check("空気は落ちない", !fallsDown(AIR));
  check("ガラスは落ちない", !fallsDown(GLASS));

  check(
    "landingY: どこまでも空気でも y=1 で止まる（世界の底）",
    landingY(() => AIR, 0, 50, 0) === 1,
  );
  check(
    "landingY: 水も溶岩も通り抜ける",
    landingY((_x, y) => (y >= 5 ? WATER : STONE), 0, 20, 0) === 5,
  );
  check(
    "landingY: 石には乗って止まる",
    landingY((_x, y) => (y === 3 ? STONE : AIR), 0, 10, 0) === 4,
  );

  // --- どのマスに効くか ---

  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, SAND);
    // まず「試験場が効いている」証拠を取る。置けていなければ以下は全部素通りする。
    check(
      "試験場に砂を置けた",
      world.getVoxel(0, floorY, 0) === STONE && world.getVoxel(0, floorY + 1, 0) === SAND,
    );
  }

  // 砂の真下を掘ると、砂が 1 マス下がる（掘る前後の getVoxel を出す）。
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, STONE); // 掘る支え
    world.setVoxel(0, floorY + 2, 0, SAND);
    const before = { support: world.getVoxel(0, floorY + 1, 0), sand: world.getVoxel(0, floorY + 2, 0) };
    tryBreak(world, emptyContainers, {
      x: 0,
      y: floorY + 1,
      z: 0,
      id: STONE,
      tool: NO_ITEM,
      creative: false,
      roll: 0.5,
    });
    const after = { hole: world.getVoxel(0, floorY + 1, 0), above: world.getVoxel(0, floorY + 2, 0) };
    check(
      "砂の真下を掘ると砂が 1 マス下がる",
      after.hole === SAND && after.above === AIR,
      `掘る前 支え=${blockName(before.support)} 砂@${floorY + 2}=${blockName(before.sand)} → 掘った後 @${floorY + 1}=${blockName(after.hole)} @${floorY + 2}=${blockName(after.above)}`,
    );
  }

  // 5 段積んだ砂の下を掘ると 5 段とも 1 つずつ下がり、間に穴が残らない。
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, STONE); // 掘る支え
    for (let i = 0; i < 5; i++) world.setVoxel(0, floorY + 2 + i, 0, SAND);

    tryBreak(world, emptyContainers, {
      x: 0,
      y: floorY + 1,
      z: 0,
      id: STONE,
      tool: NO_ITEM,
      creative: false,
      roll: 0.5,
    });

    const column = [];
    for (let dy = 0; dy <= 6; dy++) column.push(blockName(world.getVoxel(0, floorY + dy, 0)));
    const stackOk = [1, 2, 3, 4, 5].every((dy) => world.getVoxel(0, floorY + dy, 0) === SAND);
    const gapGone = world.getVoxel(0, floorY + 6, 0) === AIR;
    check(
      "5 段とも 1 つずつ下がり、間に穴が残らない",
      stackOk && gapGone,
      `floorY+0..+6: ${column.join(" / ")}`,
    );
  }

  // 空中に砂を置くと地面まで落ちる（落ちた先の y と落差を出す）。
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    const placedAt = floorY + 6;
    const before = world.getVoxel(0, placedAt, 0);
    const out = tryPlace(world, nobody, aimAt(0, placedAt, 0, AIR), 0, SAND);
    const landedAt = world.getVoxel(0, floorY + 1, 0) === SAND ? floorY + 1 : -1;
    check(
      "空中に置いた砂は地面まで落ちる",
      out.kind === "placed" &&
        world.getVoxel(0, placedAt, 0) === AIR &&
        landedAt === floorY + 1,
      `置く前@${placedAt}=${blockName(before)} → 置いた先 ${out.kind === "placed" ? out.id : "?"}、落ちた先 y=${landedAt}（落差 ${placedAt - landedAt}）`,
    );
  }

  // 石は落ちない・砂の横を掘っても落ちない。
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, STONE); // 掘る支え
    world.setVoxel(0, floorY + 2, 0, STONE); // 落ちないはずの石

    tryBreak(world, emptyContainers, {
      x: 0,
      y: floorY + 1,
      z: 0,
      id: STONE,
      tool: NO_ITEM,
      creative: false,
      roll: 0.5,
    });
    check("石は落ちない（掘った下は空のまま）", world.getVoxel(0, floorY + 2, 0) === STONE && world.getVoxel(0, floorY + 1, 0) === AIR);
  }
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, SAND); // (0, z=0) の砂
    world.setVoxel(1, floorY, 0, STONE);
    world.setVoxel(1, floorY + 1, 0, STONE); // (1, z=0) の掘る支え

    tryBreak(world, emptyContainers, {
      x: 1,
      y: floorY + 1,
      z: 0,
      id: STONE,
      tool: NO_ITEM,
      creative: false,
      roll: 0.5,
    });
    check(
      "砂の横を掘っても落ちない",
      world.getVoxel(0, floorY + 1, 0) === SAND,
    );
  }

  // 水の中を落ちて底に着く（水は上書きされて消える = 埋め立て）。
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, WATER);
    const placedAt = floorY + 6;
    const out = tryPlace(world, nobody, aimAt(0, placedAt, 0, AIR), 0, SAND);
    check(
      "水の中を落ちて底に着く（水は上書きされて消える）",
      out.kind === "placed" && world.getVoxel(0, floorY + 1, 0) === SAND,
      `底 @${floorY + 1} = ${blockName(world.getVoxel(0, floorY + 1, 0))}`,
    );
  }

  // 世界の底（y = 1）より下へは落ちない。
  {
    const world = new World(new Scene(), new WorldGen(424242));
    world.primeAround(0.5, 0.5, 1);
    const top = world.surfaceY(0, 0) + 4;
    // 地表から y=1 まで丸ごと空けて、どこまでも空気にする。
    for (let y = 1; y <= top; y++) world.setVoxel(0, y, 0, AIR);
    world.setVoxel(0, top, 0, SAND);
    const moved = settleColumn(world, 0, top, 0);
    check(
      "世界の底（y=1）より下へは落ちない",
      world.getVoxel(0, 1, 0) === SAND && world.getVoxel(0, top, 0) === AIR,
      `moved=${moved} 着地 y=1: ${blockName(world.getVoxel(0, 1, 0))}`,
    );
  }

  // 砂の上に載っていた松明は、砂が下がると支えを失って壊れる（既存の breakUnsupported の経路）。
  {
    const { world, floorY } = stage();
    world.setVoxel(0, floorY, 0, STONE);
    world.setVoxel(0, floorY + 1, 0, STONE); // 掘る支え
    world.setVoxel(0, floorY + 2, 0, SAND);
    // 松明は `World.setVoxel` の `canPlaceAt` を素通しで通す（砂は solid なので支えになれる）。
    const placedTorch = world.setVoxel(0, floorY + 3, 0, TORCH);
    check("試験場: 砂の上に松明を置けた", placedTorch && world.getVoxel(0, floorY + 3, 0) === TORCH);

    tryBreak(world, emptyContainers, {
      x: 0,
      y: floorY + 1,
      z: 0,
      id: STONE,
      tool: NO_ITEM,
      creative: false,
      roll: 0.5,
    });
    check(
      "砂が下がると、上の松明は支えを失って壊れる",
      world.getVoxel(0, floorY + 1, 0) === SAND &&
        world.getVoxel(0, floorY + 2, 0) === AIR &&
        world.getVoxel(0, floorY + 3, 0) === AIR,
      `砂@${floorY + 1}=${blockName(world.getVoxel(0, floorY + 1, 0))} 元の砂の場所@${floorY + 2}=${blockName(world.getVoxel(0, floorY + 2, 0))} 松明@${floorY + 3}=${blockName(world.getVoxel(0, floorY + 3, 0))}`,
    );
  }

  // settleColumn() が動かした個数をそのまま返す。
  {
    const world = new Slab();
    world.fill(0, 0, 9, 9, 0, 0, STONE);
    world.setVoxel(0, 10, 0, AIR); // 掘った穴
    world.setVoxel(0, 11, 0, SAND);
    world.setVoxel(0, 12, 0, GRAVEL);
    const moved = settleColumn(world, 0, 10, 0);
    check(
      "動かした個数を返す（2 個）",
      moved === 2 && world.getVoxel(0, 10, 0) === SAND && world.getVoxel(0, 11, 0) === GRAVEL,
      `moved=${moved}`,
    );
  }

  // --- 見張り ---

  {
    // 規則（何が落ちるか）は blocks.ts の fallsDown() 1 か所。
    // gravity.ts に SAND / GRAVEL / WATER / LAVA が出てきたら、
    // それは「どのブロックか」を 2 か所目に書いたということ。
    const source = sourceOf("src/gravity.ts");
    const names = ["SAND", "GRAVEL", "WATER", "LAVA"].filter((n) => new RegExp(`\\b${n}\\b`).test(source));
    check(
      "gravity.ts にブロックの名前が漏れていない（規則は blocks.ts の fallsDown）",
      names.length === 0,
      names.length === 0 ? "" : names.join(" / "),
    );
  }

  {
    // main.ts には一切配線しない（breaking.ts / placing.ts の中で閉じる）。
    const main = sourceOf("src/main.ts");
    const leaked = ["settleColumn(", "landingY(", "fallsDown("].filter((name) => main.includes(name));
    check("main.ts に重力の判断が戻っていない", leaked.length === 0, leaked.join(" "));
  }
}
