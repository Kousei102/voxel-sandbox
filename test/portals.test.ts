import { AIR, NETHER_PORTAL, NETHER_PORTAL_Z, OBSIDIAN, STONE, blockName, isProp } from "../src/blocks";
import { FLINT_AND_STEEL, IRON_PICKAXE, NO_ITEM, dropOf, isFireStarter } from "../src/items";
import {
  MAX_HEIGHT,
  MAX_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  findFrame,
  ignite,
  portalAxis,
  portalBlock,
} from "../src/portals";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";
import { Scene } from "three";

/**
 * 内側 `width` x `height` の枠を組む。`axis` が "x" なら面は X 方向へ伸びる。
 * 内側の左下が原点 (0,0,0)。**四隅も置きます**（欠けた形は呼ぶ側が削る）。
 */
function build(axis: "x" | "z", width: number, height: number): Slab {
  const slab = new Slab();
  const at = (a: number, b: number): [number, number, number] =>
    axis === "x" ? [a, b, 0] : [0, b, a];
  for (let b = -1; b <= height; b++) {
    for (let a = -1; a <= width; a++) {
      const inside = a >= 0 && a < width && b >= 0 && b < height;
      if (inside) continue;
      const [x, y, z] = at(a, b);
      slab.setVoxel(x, y, z, OBSIDIAN);
    }
  }
  return slab;
}

export function run(): void {
  describe("ネザーポータルの枠");

  // --- ブロックの形 ---
  check(
    "2 つの向きがあり、どちらも立方体でない",
    isProp(NETHER_PORTAL) && isProp(NETHER_PORTAL_Z),
    `${blockName(NETHER_PORTAL)} / ${blockName(NETHER_PORTAL_Z)}`,
  );
  check(
    "向きで別のブロックを返す",
    portalBlock("x") === NETHER_PORTAL && portalBlock("z") === NETHER_PORTAL_Z,
  );
  // **`portalBlock()` の逆。表が 1 か所であること** —— 2 か所に書くと、
  // 向きを足したときに「点くのに通れない」形で片方だけ残る。
  check(
    "面のブロックから向きが引ける（`portalBlock` の逆）",
    portalAxis(NETHER_PORTAL) === "x" &&
      portalAxis(NETHER_PORTAL_Z) === "z" &&
      portalAxis(OBSIDIAN) === null &&
      portalAxis(AIR) === null,
  );
  check("ポータルの面を壊しても何も落ちない", dropOf(NETHER_PORTAL).item === NO_ITEM);

  // --- 火種 ---
  // **枠が成立しているかは `portals.ts`、何が火種かは `items.ts`。**
  check(
    "火打石と打ち金だけが火種",
    isFireStarter(FLINT_AND_STEEL) && !isFireStarter(IRON_PICKAXE) && !isFireStarter(NO_ITEM),
  );

  // --- 素直な枠 ---
  for (const axis of ["x", "z"] as const) {
    const slab = build(axis, MIN_WIDTH, MIN_HEIGHT);
    const frame = findFrame(slab, ...inside(axis, 0, 0));
    check(
      `内側 ${MIN_WIDTH}x${MIN_HEIGHT} の枠が見つかる（${axis} 向き）`,
      frame?.axis === axis && frame.cells.length === MIN_WIDTH * MIN_HEIGHT,
      `${frame?.width}x${frame?.height} / ${frame?.cells.length} マス`,
    );

    const lit = ignite(slab, ...inside(axis, 0, 0));
    const filled = frame?.cells.every(
      ([x, y, z]) => slab.getVoxel(x, y, z) === portalBlock(axis),
    );
    check(
      `点火すると内側が全部ポータルになる（${axis} 向き）`,
      lit === MIN_WIDTH * MIN_HEIGHT && filled === true,
      `${lit} マス`,
    );
  }

  // どこに火を点けても同じ枠が見つかる（隅で点けても中央で点けても）。
  const corners = build("x", 3, 4);
  const a = findFrame(corners, ...inside("x", 0, 0));
  const b = findFrame(corners, ...inside("x", 2, 3));
  check(
    "枠の中ならどのマスから点けても同じ枠になる",
    a?.cells.length === 12 && b?.cells.length === 12 && a.width === b.width,
    `${a?.width}x${a?.height} と ${b?.width}x${b?.height}`,
  );

  // --- 角は要らない（Minecraft と同じ）---
  const cut = build("x", MIN_WIDTH, MIN_HEIGHT);
  cut.setVoxel(-1, -1, 0, AIR);
  cut.setVoxel(MIN_WIDTH, MIN_HEIGHT, 0, AIR);
  check(
    "四隅が欠けていても点く（Minecraft と同じ）",
    findFrame(cut, ...inside("x", 0, 0)) !== null,
  );

  // --- 欠けた枠 ---
  for (const [name, gap] of [
    ["下の辺", [0, -1, 0]],
    ["上の辺", [0, MIN_HEIGHT, 0]],
    ["左の柱", [-1, 0, 0]],
    ["右の柱", [MIN_WIDTH, 1, 0]],
  ] as const) {
    const broken = build("x", MIN_WIDTH, MIN_HEIGHT);
    broken.setVoxel(gap[0], gap[1], gap[2], AIR);
    check(`${name}が 1 マス欠けていたら点かない`, findFrame(broken, ...inside("x", 0, 0)) === null);
  }

  // 黒曜石でない枠（丸石で組んでも点かない）。
  const stone = build("x", MIN_WIDTH, MIN_HEIGHT);
  stone.setVoxel(-1, 0, 0, STONE);
  check("枠が黒曜石でなければ点かない", findFrame(stone, ...inside("x", 0, 0)) === null);

  // --- 内側が塞がっている ---
  // **十字に測っただけでは見つからない位置**に置くこと（測る線を外れた角）。
  const blocked = build("x", 3, 3);
  blocked.setVoxel(2, 2, 0, STONE);
  check(
    "内側に石が残っていたら点かない（測った線の外でも）",
    findFrame(blocked, ...inside("x", 0, 0)) === null,
  );

  // --- 大きさの上限・下限 ---
  const narrow = build("x", 1, MIN_HEIGHT);
  check(`内側の幅 1 では点かない（最小 ${MIN_WIDTH}）`, findFrame(narrow, ...inside("x", 0, 0)) === null);
  const short = build("x", MIN_WIDTH, 2);
  check(`内側の高さ 2 では点かない（最小 ${MIN_HEIGHT}）`, findFrame(short, ...inside("x", 0, 0)) === null);

  const wide = build("x", MAX_WIDTH + 1, MIN_HEIGHT);
  check(
    `内側の幅 ${MAX_WIDTH + 1} では点かない（上限 ${MAX_WIDTH}）`,
    findFrame(wide, ...inside("x", 0, 0)) === null,
  );
  const big = build("x", MIN_WIDTH, MAX_HEIGHT);
  check(
    `上限ちょうど（高さ ${MAX_HEIGHT}）はまだ点く`,
    findFrame(big, ...inside("x", 0, 0))?.height === MAX_HEIGHT,
  );

  // --- 枠が無い ---
  check("何も無いところでは点かない", findFrame(new Slab(), 0, 0, 0) === null);
  check("何も無いところで点火しても 0 マス", ignite(new Slab(), 0, 0, 0) === 0);

  const relit = build("x", MIN_WIDTH, MIN_HEIGHT);
  ignite(relit, ...inside("x", 0, 0));
  check(
    "すでに点いている枠には点け直せない（空きマスではない）",
    findFrame(relit, ...inside("x", 0, 0)) === null,
  );

  realWorld();
  sourceGuards();
}

/** 内側の (a, b) をワールド座標に。`build()` と同じ置き方。 */
function inside(axis: "x" | "z", a: number, b: number): [number, number, number] {
  return axis === "x" ? [a, b, 0] : [0, b, a];
}

/**
 * **実物の `World` で 1 度だけ通します。** `PortalWorld` は `World` の一部なので、
 * ここが通らなければ `main.ts` から呼べません（この周では配線しないので、
 * 型が合っていることを確かめる場所がここしかない）。
 */
function realWorld(): void {
  const world = new World(new Scene(), new WorldGen(424242));
  world.primeAround(0.5, 0.5, 1);
  const base = world.surfaceY(0, 0) + 2;

  // 地表の上に 4x5 の空間を掘って、そこへ枠を組む（内側 2x3）。
  for (let y = base - 1; y <= base + 4; y++) {
    for (let x = -1; x <= 2; x++) world.setVoxel(x, y, 0, AIR);
  }
  for (let y = base - 1; y <= base + 3; y++) {
    for (let x = -1; x <= 2; x++) {
      const inFrame = x >= 0 && x <= 1 && y >= base && y <= base + 2;
      if (!inFrame) world.setVoxel(x, y, 0, OBSIDIAN);
    }
  }

  // **先に「試験場が組めた」ことを確かめる。** 未読み込みの列では書き込みが
  // 黙って失敗するので、そこを飛ばすと「枠が無い」で通ってしまう。
  check(
    "実物の World に枠を組めた",
    world.getVoxel(-1, base, 0) === OBSIDIAN && world.getVoxel(0, base, 0) === AIR,
    `黒曜石 ${blockName(world.getVoxel(-1, base, 0))} / 内側 ${blockName(world.getVoxel(0, base, 0))}`,
  );

  const lit = ignite(world, 0, base, 0);
  check("実物の World でも点く", lit === 6, `${lit} マス`);
  check(
    "点いたのは X 向きのポータル",
    world.getVoxel(1, base + 2, 0) === NETHER_PORTAL,
    blockName(world.getVoxel(1, base + 2, 0)),
  );
}

/**
 * `portals.ts` を判断だけのファイルに保つ。
 *
 * **コメントを落としてから見ること。** 落とさないと「1-6 でやる」と書いた説明そのものが
 * 引っかかって、コードは正しいのに赤くなります（実際に踏みました）。
 */
function sourceGuards(): void {
  const source = sourceOf("src/portals.ts");

  // three も DOM も出てこない（`beds.ts` / `liquids.ts` と同じ）。
  const leaked = ["Mesh", "AudioContext", "document", "HTMLElement", "Math.random("].filter((w) =>
    source.includes(w),
  );
  check("portals.ts に描画・音・DOM・乱数が無い", leaked.length === 0, leaked.join(" "));

  // **次元の話を持ち込まないこと**（1-6 の仕事）。持ち込むと、枠の判定を確かめるのに
  // セーブと次元の器が要るようになる。
  const dimensions = ["nether", "dimension", "teleport"].filter((w) =>
    new RegExp(w, "i").test(source.replace(/NETHER_PORTAL(_Z)?/g, "")),
  );
  check("portals.ts が次元の話を持っていない", dimensions.length === 0, dimensions.join(" "));

  // 何が火種かは `items.ts` の表。ここに書くと、火種が増えたときに 2 か所直すことになる。
  check("portals.ts が火種のアイテムを名指ししていない", !source.includes("FLINT"));
}
