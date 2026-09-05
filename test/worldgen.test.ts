import {
  AIR,
  BEDROCK,
  BROWN_MUSHROOM,
  CACTUS,
  COAL_ORE,
  DIAMOND_ORE,
  GOLD_ORE,
  GRAVEL,
  GRASS,
  IRON_ORE,
  LAVA,
  LEAVES,
  RED_MUSHROOM,
  SAND,
  SANDSTONE,
  SNOW,
  SPRUCE_LEAVES,
  SPRUCE_WOOD,
  STONE,
  SUGAR_CANE,
  TALL_GRASS,
  WATER,
  WOOD,
  blockName,
} from "../src/blocks";
import {
  ALPINE,
  ALPINE_HEIGHT,
  ALPINE_ROCK,
  BEACH,
  SNOWY_BEACH,
  BIOMES,
  DESERT,
  FOREST,
  OCEAN,
  TAIGA,
  biomeDef,
  biomeName,
  classify,
  resolve,
} from "../src/biomes";
import { CHUNK_VOLUME, SEA_LEVEL } from "../src/constants";
import { LAVA_LEVEL, WorldGen } from "../src/worldgen";
import { check, describe } from "./harness";

/** 名前・ID・出てよい高さの上限（worldgen.ts の VEINS と合わせる）。 */
const ORE_TABLE = [
  ["石炭鉱石", COAL_ORE, 62],
  ["鉄鉱石", IRON_ORE, 46],
  ["金鉱石", GOLD_ORE, 26],
  ["ダイヤ鉱石", DIAMOND_ORE, 14],
] as const;
const ORE_IDS = ORE_TABLE.map(([, id]) => id);

export function run(): void {
  describe("地形生成");

  const gen = new WorldGen(12345);
  const data = new Uint8Array(CHUNK_VOLUME);

  // 6x6 列ぶん生成して、出てくるブロックの種類を見る
  const mix = new Map<number, number>();
  for (let cx = 0; cx < 6; cx++) {
    for (let cz = 0; cz < 6; cz++) {
      for (let cy = 0; cy < 8; cy++) {
        gen.generateChunk(cx * 3, cy, cz * 3, data);
        for (const id of data) mix.set(id, (mix.get(id) ?? 0) + 1);
      }
    }
  }

  for (const [name, id] of [
    ["空気", AIR],
    ["石", STONE],
    ["草", GRASS],
    ["水", WATER],
    ["木", WOOD],
    ["葉", LEAVES],
  ] as const) {
    check(`${name}が生成される`, (mix.get(id) ?? 0) > 0, `${(mix.get(id) ?? 0).toLocaleString()} 個`);
  }

  // --- 鉱石 ---
  // 6x6x8 チャンク（= 石 mix.get(STONE) 個）に対する割合を出しておく。
  const stoneish = (mix.get(STONE) ?? 0) + ORE_IDS.reduce((sum, id) => sum + (mix.get(id) ?? 0), 0);
  for (const [name, id] of ORE_TABLE) {
    const count = mix.get(id) ?? 0;
    check(
      `${name}が生成される`,
      count > 0,
      `${count.toLocaleString()} 個 / 石の ${((count / stoneish) * 100).toFixed(2)}%`,
    );
  }

  check(
    "深いものほど珍しい",
    ORE_TABLE.every(
      (ore, i) => i === 0 || (mix.get(ore[1]) ?? 0) < (mix.get(ORE_TABLE[i - 1][1]) ?? 0),
    ),
    ORE_TABLE.map(([name, id]) => `${name} ${mix.get(id) ?? 0}`).join(" / "),
  );

  // 高さの上限を守っているか（守らないと地表に金やダイヤが露出する）
  let aboveLimit = 0;
  for (let cy = 0; cy < 8; cy++) {
    gen.generateChunk(0, cy, 0, data);
    for (let i = 0; i < data.length; i++) {
      const id = data[i];
      const entry = ORE_TABLE.find((ore) => ore[1] === id);
      if (!entry) continue;
      const y = cy * 16 + Math.floor(i / 256);
      if (y > entry[2]) aboveLimit++;
    }
  }
  check("鉱石が決められた高さより上に出ない", aboveLimit === 0, `${aboveLimit} 個`);

  // --- 砂利（火打石の出どころ）---
  // **これが 0 だと火打石が手に入らず、ネザーポータルに火が付かない。**
  const gravelCount = mix.get(GRAVEL) ?? 0;
  check(
    "砂利が生成される",
    gravelCount > 0,
    `${gravelCount.toLocaleString()} 個 / 石の ${((gravelCount / (stoneish + gravelCount)) * 100).toFixed(2)}%`,
  );

  // 石炭と同じ高さまでしか出ない（`VEINS` の maxY 62）。地表に出ないことの確認でもある。
  // ついでに**まとまり具合**を測る: 4x4x4 の枡ごとに数えて、1 枡あたりの平均マス数を出す。
  // `VeinDef.shift` を 1 に戻すと塊が 2x2x2 になり、この数が一気に落ちる
  // （石の中に胡椒を撒いたような散り方になり、Minecraft の砂利に見えない）。
  const cells = new Map<string, number>();
  let gravelAbove = 0;
  let gravelTop = -1;
  // 枡は 4x4x4 でチャンク（16³）を割り切るので、**チャンクの境目で分断されない。**
  // 1 列だけだと枡が数個しか取れず、地形を触ったときに 0 個になりかねないので 9 列見る。
  for (let cx = 0; cx < 3; cx++) {
    for (let cz = 0; cz < 3; cz++) {
      for (let cy = 0; cy < 8; cy++) {
        gen.generateChunk(cx, cy, cz, data);
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== GRAVEL) continue;
          const y = cy * 16 + Math.floor(i / 256);
          const z = cz * 16 + Math.floor((i % 256) / 16);
          const x = cx * 16 + (i % 16);
          if (y > gravelTop) gravelTop = y;
          if (y > 62) gravelAbove++;
          const cell = `${x >> 2},${y >> 2},${z >> 2}`;
          cells.set(cell, (cells.get(cell) ?? 0) + 1);
        }
      }
    }
  }
  check("砂利が決められた高さより上に出ない", gravelAbove === 0, `一番上 y=${gravelTop} / 上限 62`);

  const inCells = [...cells.values()];
  const perCell = inCells.reduce((sum, n) => sum + n, 0) / Math.max(1, inCells.length);
  check(
    "砂利は塊で埋まっている（1 粒ずつ散らばっていない）",
    perCell > 20,
    `4x4x4 の枡あたり平均 ${perCell.toFixed(1)} マス（枡 ${inCells.length} 個）`,
  );

  // --- 溶岩 ---
  // 掘り抜いた空間のうち LAVA_LEVEL 以下を埋めるので、**海面の水とまったく同じ形**。
  // ここが崩れると「地表に溶岩の池がある」か「深く掘っても一度も出会わない」になり、
  // どちらも黒曜石 → ネザーの道のりがそのまま壊れる。
  const lavaCount = mix.get(LAVA) ?? 0;
  check("溶岩が生成される", lavaCount > 0, `${lavaCount.toLocaleString()} 個`);

  // 高さの上限。**溶岩が地表に出ると、歩いているだけで死ぬ世界になる。**
  let lavaAbove = 0;
  let lavaTop = -1;
  const lavaByLayer = new Map<number, number>();
  for (let cx = 0; cx < 6; cx++) {
    for (let cz = 0; cz < 6; cz++) {
      for (let cy = 0; cy < 8; cy++) {
        gen.generateChunk(cx * 3, cy, cz * 3, data);
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== LAVA) continue;
          const y = cy * 16 + Math.floor(i / 256);
          lavaByLayer.set(y, (lavaByLayer.get(y) ?? 0) + 1);
          if (y > lavaTop) lavaTop = y;
          if (y > LAVA_LEVEL) lavaAbove++;
        }
      }
    }
  }
  check("溶岩が決められた高さより上に出ない", lavaAbove === 0, `一番上 y=${lavaTop} / 上限 ${LAVA_LEVEL}`);

  // 高さごとの散らばりを出しておく（洞窟の形を触ったときに、溜まり方の変化が一目で分かる）。
  console.log(
    `      溶岩の高さ別: ` +
      [...lavaByLayer.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([y, n]) => `y${y}:${n}`)
        .join(" "),
  );

  // 岩盤（y=0）は溶岩に化けない。化けると世界の底が抜ける。
  check("岩盤の段には溶岩が無い", (lavaByLayer.get(0) ?? 0) === 0, `${lavaByLayer.get(0) ?? 0} 個`);

  // **ダイヤを掘りに行くと溶岩に出会う**（LAVA_LEVEL がダイヤの上限より下にある意味）。
  // ここが 0 だと、溶岩はあるのに誰も見つけられない高さに沈んでいる。
  const nearDiamond = [...lavaByLayer.entries()]
    .filter(([y]) => y <= 14)
    .reduce((sum, [, n]) => sum + n, 0);
  check("ダイヤの高さ帯に溶岩がある", nearDiamond > 0, `y<=14 に ${nearDiamond.toLocaleString()} 個`);

  const heights: number[] = [];
  for (let x = -4000; x < 4000; x += 137) {
    for (let z = -4000; z < 4000; z += 137) heights.push(gen.heightAt(x, z));
  }
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const mountains = heights.filter((h) => h > 60).length / heights.length;
  const underwater = heights.filter((h) => h < SEA_LEVEL).length / heights.length;

  check("高低差がある", max - min > 40, `${min}〜${max}`);
  check("山が数 % 生成される", mountains > 0.05 && mountains < 0.4, `${(mountains * 100).toFixed(0)}%`);
  check("水没する土地もある", underwater > 0.05 && underwater < 0.6, `${(underwater * 100).toFixed(0)}%`);

  // 同じシードなら常に同じ地形
  const again = new WorldGen(12345);
  const a = new Uint8Array(CHUNK_VOLUME);
  const b = new Uint8Array(CHUNK_VOLUME);
  gen.generateChunk(9, 2, -4, a);
  again.generateChunk(9, 2, -4, b);
  check("同じシードは同じ地形になる", a.every((v, i) => v === b[i]));

  const other = new WorldGen(54321);
  other.generateChunk(9, 2, -4, b);
  check("違うシードは違う地形になる", !a.every((v, i) => v === b[i]));

  // 木は列をまたいでも欠けない: 幹の上に必ず（同じ種類の）葉がある。
  // 針葉樹林と広葉樹林で幹も葉も別のブロックなので、対応も確かめる。
  let trunks = 0;
  let capped = 0;
  const columnCache = new Map<string, Uint8Array>();
  const voxel = (x: number, y: number, z: number) => {
    const cx = x >> 4;
    const cy = y >> 4;
    const cz = z >> 4;
    const key = `${cx},${cy},${cz}`;
    let chunk = columnCache.get(key);
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_VOLUME);
      gen.generateChunk(cx, cy, cz, chunk);
      columnCache.set(key, chunk);
    }
    return chunk[(((y & 15) * 16 + (z & 15)) * 16) + (x & 15)];
  };
  const kinds = new Map<number, number>();
  for (let x = -64; x < 64; x++) {
    for (let z = -64; z < 64; z++) {
      for (let y = 40; y < 100; y++) {
        const id = voxel(x, y, z);
        if (id !== WOOD && id !== SPRUCE_WOOD) continue;
        if (voxel(x, y + 1, z) === id) continue;
        trunks++;
        kinds.set(id, (kinds.get(id) ?? 0) + 1);
        const leaf = id === WOOD ? LEAVES : SPRUCE_LEAVES;
        if (voxel(x, y + 1, z) === leaf) capped++;
      }
    }
  }
  check("木の幹の先に葉がある（列をまたぐ葉が欠けない）", trunks > 0 && trunks === capped, `${capped}/${trunks} 本`);
  check(
    "木の生成数が妥当",
    trunks > 3,
    `${trunks} 本 / 128x128 ブロック（${[...kinds].map(([id, c]) => `${blockName(id)} ${c}`).join(" / ")}）`,
  );

  // --- 草むら ---
  // 地表のすぐ上に生え、生えやすさはバイオームの表どおり。浮いていたり
  // 砂や雪の上に生えていたりすると、目で見るまで気付けない。
  let tufts = 0;
  let floatingTufts = 0;
  let wrongSurface = 0;
  const tuftBiomes = new Map<number, number>();
  // キノコも地表のすぐ上の 1 マスに立つので、**同じ走査で場違いを数える**
  // （森は原点のまわりに少ないので、本数と赤茶の内訳は下のまとまった森で見る）。
  let strayCaps = 0;
  for (let x = -400; x < 400; x += 7) {
    for (let z = -400; z < 400; z += 7) {
      const h = gen.heightAt(x, z);
      const above = voxel(x, h + 1, z);
      const b = gen.biomeAt(x, z);
      if (above === RED_MUSHROOM || above === BROWN_MUSHROOM) {
        if (biomeDef(b).mushroom === 0) strayCaps++;
      }
      if (above !== TALL_GRASS) continue;
      tufts++;
      tuftBiomes.set(b, (tuftBiomes.get(b) ?? 0) + 1);
      if (voxel(x, h, z) === AIR) floatingTufts++;
      if (biomeDef(b).grass === 0) wrongSurface++;
    }
  }
  console.log(
    `      草むら ${tufts} 本: ${[...tuftBiomes]
      .map(([b, c]) => `${biomeName(b)} ${c}`)
      .join(" / ")}`,
  );
  check("草むらが生える", tufts > 20, `${tufts} 本`);
  check("草むらが浮いていない", floatingTufts === 0, `${floatingTufts} 本`);
  check(
    "草むらはバイオームの決めた場所にだけ生える",
    wrongSurface === 0,
    `${wrongSurface} 本`,
  );

  // --- キノコ ---
  // 草むらとまったく同じ経路（地表のすぐ上の 1 マス）だが、**生える場所が違う** ——
  // `BiomeDef.mushroom` が 0 より大きいのは森と針葉樹林だけ。
  //
  // **原点のまわりを間引いて舐めても数が足りない。** 上の草むらの走査（±400 を 7 マスおき）
  // では森が 1 点も当たらず（**853 本が全部「平原」**）、確率も 0.015 と一桁小さい。
  // だから**まとまった森と針葉樹林を先に探して、そこを 1 マスも飛ばさずに数える**
  // （下のサボテンが「まとまった砂漠」を探しているのと同じ形）。
  const patchOf = (want: number): [number, number] | null => {
    for (let x = -3000; x < 3000; x += 64) {
      for (let z = -3000; z < 3000; z += 64) {
        if (gen.biomeAt(x, z) !== want) continue;
        let solid = true;
        for (let dx = 0; dx < 64; dx += 16) {
          for (let dz = 0; dz < 64; dz += 16) {
            if (gen.biomeAt(x + dx, z + dz) !== want) solid = false;
          }
        }
        if (solid) return [x, z];
      }
    }
    return null;
  };
  const patches: [string, number, [number, number] | null][] = [
    ["森", FOREST, patchOf(FOREST)],
    ["針葉樹林", TAIGA, patchOf(TAIGA)],
  ];
  check(
    "まとまった森と針葉樹林がある",
    patches.every(([, , at]) => at !== null),
    patches.map(([name, , at]) => `${name} ${at ? `(${at[0]}, ${at[1]})` : "見つからない"}`).join(" / "),
  );

  let caps = 0;
  let floatingCaps = 0;
  let strayInPatch = 0;
  let reds = 0;
  let browns = 0;
  const overhead = new Map<number, number>();
  const perPatch: string[] = [];
  for (const [name, want, at] of patches) {
    if (!at) continue;
    let here = 0;
    let columns = 0;
    for (let x = at[0]; x < at[0] + 64; x++) {
      for (let z = at[1]; z < at[1] + 64; z++) {
        const b = gen.biomeAt(x, z);
        if (b === want) columns++;
        const h = gen.heightAt(x, z);
        const id = voxel(x, h + 1, z);
        if (id !== RED_MUSHROOM && id !== BROWN_MUSHROOM) continue;
        here++;
        caps++;
        if (id === RED_MUSHROOM) reds++;
        else browns++;
        // **真下がそのバイオームの地表ブロックであること**（草むらの「空気でない」より
        // 1 段きつい）。**真上は空気とは限らない** —— キノコは木の下に出るので、
        // 枝葉が 1 マス上に掛かる列がある。それは不具合ではないので、数えて出すだけにする。
        if (voxel(x, h, z) !== biomeDef(b).surface) floatingCaps++;
        const up = voxel(x, h + 2, z);
        if (up !== AIR) overhead.set(up, (overhead.get(up) ?? 0) + 1);
        if (biomeDef(b).mushroom === 0) strayInPatch++;
      }
    }
    perPatch.push(`${name} ${here} 本 / ${columns} 列（${((here / Math.max(1, columns)) * 100).toFixed(2)}%）`);
  }
  console.log(
    `      64x64 のキノコ: ${perPatch.join(" / ")}  赤 ${reds} / 茶 ${browns}` +
      `  1 マス上に何かある ${[...overhead].map(([id, c]) => `${blockName(id)} ${c}`).join(" / ") || "0 本"}`,
  );
  check(
    "キノコは森と針葉樹林にだけ生える（場違いなバイオームに 1 本も無い）",
    caps > 20 && strayInPatch === 0 && strayCaps === 0,
    `${caps} 本 / 場違い ${strayInPatch + strayCaps} 本（±400 を舐めたぶんで ${strayCaps} 本）`,
  );
  check(
    "キノコの真下は必ずそのバイオームの地表（浮いていない）",
    floatingCaps === 0,
    `${floatingCaps} 本`,
  );
  // 半々のハッシュが片側に寄っていないこと。**塩を草むらと重ねると偏る**ので、
  // 「両方 0 でない」ではなく割合で見る（3 割〜7 割）。
  check(
    "赤も茶も出る（2 本目のハッシュが片側に寄っていない）",
    reds > 0 && browns > 0 && reds / caps > 0.3 && reds / caps < 0.7,
    `赤 ${reds} / 茶 ${browns}（赤 ${((reds / Math.max(1, caps)) * 100).toFixed(0)}%）`,
  );

  // --- サトウキビ ---
  // 草むら・キノコとまったく同じ経路（地表のすぐ上の 1 マス）だが、**生えるのは浜だけ**。
  //
  // **上のキノコの `patchOf()`（まとまった 64x64）は使えない** —— 浜は幅が数マスの帯
  // なので 1 つも見つからず、そこで止まる（`rules/worldgen.md`）。代わりに
  // **`biomeAt` で ±400 を 1 マスおきに舐めて候補の列を集め、`voxel()` を呼ぶのは
  // その列だけ**にする（`biomeAt` と `heightAt` は列のキャッシュに乗るので安く、
  // 点数がそのまま実行時間になるのは `voxel()` の側だけ）。
  //
  // **生えるのは「浜 かつ 高さ > SEA_LEVEL」の列だけ。** 浜は `height <= SEA_LEVEL + 1`
  // なので、実際に立てるのは**高さ 41 ちょうど**の列に限られる。
  const beachColumns: [number, number][] = [];
  let beachSeen = 0;
  for (let x = -400; x < 400; x++) {
    for (let z = -400; z < 400; z++) {
      if (gen.biomeAt(x, z) !== BEACH) continue;
      beachSeen++;
      if (gen.heightAt(x, z) > SEA_LEVEL) beachColumns.push([x, z]);
    }
  }
  // **`voxel()` は 1 点につきチャンクを 1 個生成する**ので、数える列は 2000 で打ち切る。
  const canePlots = beachColumns.slice(0, 2000);
  let canes = 0;
  let floatingCanes = 0;
  let strayCanes = 0;
  for (let x = -400; x < 400; x += 7) {
    for (let z = -400; z < 400; z += 7) {
      const h = gen.heightAt(x, z);
      if (voxel(x, h + 1, z) !== SUGAR_CANE) continue;
      if (biomeDef(gen.biomeAt(x, z)).cane === 0) strayCanes++;
    }
  }
  for (const [x, z] of canePlots) {
    const h = gen.heightAt(x, z);
    if (voxel(x, h + 1, z) !== SUGAR_CANE) continue;
    canes++;
    // 浜の地表は砂。**真下が砂であること**（浮いていない）。
    if (voxel(x, h, z) !== biomeDef(BEACH).surface) floatingCanes++;
  }
  const caneRate = canes / Math.max(1, canePlots.length);
  const caneWant = biomeDef(BEACH).cane;
  console.log(
    `      浜の列 ${beachSeen} / 800x800（${((beachSeen / (800 * 800)) * 100).toFixed(2)}%）` +
      `  そのうち生える高さ ${beachColumns.length} 列 → 数えたのは ${canePlots.length} 列` +
      `  サトウキビ ${canes} 本（${(caneRate * 100).toFixed(2)}% / 表は ${(caneWant * 100).toFixed(0)}%）` +
      `  浜の外 ${strayCanes} 本`,
  );
  check(
    "サトウキビは浜にだけ生える（浜の外に 1 本も無い）",
    canes > 20 && strayCanes === 0,
    `${canes} 本 / 場違い ${strayCanes} 本`,
  );
  check(
    "サトウキビの真下は必ず砂（浮いていない）",
    floatingCanes === 0,
    `${floatingCanes} 本`,
  );
  // **確率どおりに生えているか。** 生えものの連鎖でサトウキビを後ろに回すと、
  // 前のものが生えなかったマスだけが候補になって密度がここで落ちる。
  check(
    "サトウキビの密度が BiomeDef.cane の 0.7〜1.3 倍に収まる",
    caneRate > caneWant * 0.7 && caneRate < caneWant * 1.3,
    `${(caneRate * 100).toFixed(2)}% / 表は ${(caneWant * 100).toFixed(0)}%（${(caneRate / caneWant).toFixed(2)} 倍）`,
  );

  describe("バイオーム");

  // --- 気候の表 ---
  // しきい値を触ったときに、どの気候がどのバイオームになるかが一目で分かるように出す。
  const climateRows: string[] = [];
  for (const t of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const cells = [-0.4, -0.2, 0, 0.2, 0.4].map((m) => biomeName(classify(t, m)).padEnd(5, "　"));
    climateRows.push(`気温 ${t.toFixed(1).padStart(4)} | ${cells.join(" ")}`);
  }
  console.log("      湿度        -0.4  -0.2   0.0   0.2   0.4");
  for (const row of climateRows) console.log(`      ${row}`);

  check("暑くて乾けば砂漠", classify(0.4, -0.3) === DESERT);
  check(
    "気候だけでは海・浜・高山にならない",
    ![OCEAN, BEACH, ALPINE].some((b) =>
      [-0.5, -0.2, 0, 0.2, 0.5].some((t) =>
        [-0.5, -0.2, 0, 0.2, 0.5].some((m) => classify(t, m) === b),
      ),
    ),
  );
  // 高さの上書きは、どの気候から来ても同じように効くこと
  const climates = [-0.5, -0.2, 0, 0.2, 0.5].flatMap((t) =>
    [-0.5, -0.2, 0, 0.2, 0.5].map((m) => classify(t, m)),
  );
  const warm = 0.3;
  const cool = -0.3;
  check(
    "海面より下はどの気候でも海",
    climates.every((c) => resolve(c, SEA_LEVEL - 1, warm) === OCEAN),
  );
  check(
    "海面ぎわはどの気候でも浜",
    climates.every((c) => resolve(c, SEA_LEVEL + 1, warm) === BEACH),
  );
  check(
    "高いところはどの気候でも山",
    climates.every((c) => [ALPINE, ALPINE_ROCK].includes(resolve(c, ALPINE_HEIGHT, cool))),
  );
  check(
    "その間は気候どおり",
    climates.every((c) => resolve(c, ALPINE_HEIGHT - 1, warm) === c),
  );

  // 雪が積もるかどうかは気温だけで決まる（砂の隣が雪にならない仕掛けの土台）
  check(
    "暖かい山は雪をかぶらない",
    climates.every((c) => resolve(c, ALPINE_HEIGHT + 20, warm) === ALPINE_ROCK),
  );
  check(
    "寒い山は雪をかぶる",
    climates.every((c) => resolve(c, ALPINE_HEIGHT + 20, cool) === ALPINE),
  );
  check(
    "寒い浜は雪の浜になる",
    climates.every((c) => resolve(c, SEA_LEVEL + 1, cool) === SNOWY_BEACH),
  );

  // --- 実際の分布 ---
  const spread = new Map<number, number>();
  let samples = 0;
  for (let x = -4000; x < 4000; x += 97) {
    for (let z = -4000; z < 4000; z += 97) {
      const b = gen.biomeAt(x, z);
      spread.set(b, (spread.get(b) ?? 0) + 1);
      samples++;
    }
  }
  for (const b of BIOMES) {
    const share = ((spread.get(b.id) ?? 0) / samples) * 100;
    console.log(`      ${b.name.padEnd(5, "　")} ${share.toFixed(1)}%`);
  }
  check(
    `${BIOMES.length} 種類すべて生成される`,
    BIOMES.every((b) => (spread.get(b.id) ?? 0) > 0),
    BIOMES.filter((b) => !(spread.get(b.id) ?? 0)).map((b) => b.name).join(",") || "",
  );
  check(
    "どれか 1 つが世界を埋め尽くさない",
    [...spread.values()].every((c) => c / samples < 0.45),
    `最大 ${((Math.max(...spread.values()) / samples) * 100).toFixed(0)}%`,
  );

  // --- 地表がバイオームどおりか ---
  // 「森なのに砂」のような取り違えは、歩き回らないと気付けない。
  let surfaceWrong = 0;
  let surfaceChecked = 0;
  // voxel() は 1 点につきチャンクを 1 個生成するので、点数がそのまま実行時間になる
  for (let x = -420; x < 420; x += 29) {
    for (let z = -420; z < 420; z += 29) {
      const h = gen.heightAt(x, z);
      const def = biomeDef(gen.biomeAt(x, z));
      surfaceChecked++;
      if (voxel(x, h, z) !== def.surface) surfaceWrong++;
    }
  }
  check(
    "地表のブロックがバイオームどおり",
    surfaceWrong === 0,
    `${surfaceChecked} 点中 ${surfaceWrong} 点が不一致`,
  );

  // --- 砂漠 ---
  let desert: [number, number] | null = null;
  for (let x = -3000; x < 3000 && !desert; x += 64) {
    for (let z = -3000; z < 3000; z += 64) {
      if (gen.biomeAt(x, z) !== DESERT) continue;
      let solid = true;
      for (let dx = 0; dx < 64; dx += 16) {
        for (let dz = 0; dz < 64; dz += 16) {
          if (gen.biomeAt(x + dx, z + dz) !== DESERT) solid = false;
        }
      }
      if (solid) {
        desert = [x, z];
        break;
      }
    }
  }
  check("まとまった砂漠がある", desert !== null, desert ? `(${desert[0]}, ${desert[1]})` : "見つからない");

  if (desert) {
    let cacti = 0;
    let sandstone = 0;
    let tallest = 0;
    let floating = 0;
    for (let x = desert[0]; x < desert[0] + 96; x++) {
      for (let z = desert[1]; z < desert[1] + 96; z++) {
        for (let y = 30; y < 110; y++) {
          if (voxel(x, y, z) === SANDSTONE) sandstone++;
          if (voxel(x, y, z) !== CACTUS) continue;
          if (voxel(x, y + 1, z) === CACTUS) continue;
          cacti++;
          let h = 1;
          while (voxel(x, y - h, z) === CACTUS) h++;
          tallest = Math.max(tallest, h);
          // 根元の下は砂でなければならない（浮いたサボテンは目で見ないと気付けない）
          if (voxel(x, y - h + 1 - 1, z) !== SAND) floating++;
        }
      }
    }
    console.log(`      96x96 の砂漠: サボテン ${cacti} 本（最大 ${tallest} 段）/ 砂岩 ${sandstone} 個`);
    check("砂漠にサボテンが生える", cacti > 5, `${cacti} 本`);
    check("サボテンが 1〜3 段", tallest >= 1 && tallest <= 3, `最大 ${tallest} 段`);
    check("サボテンが浮いていない", floating === 0, `${floating} 本`);
    check("砂の下が砂岩になる", sandstone > 1000, `${sandstone} 個`);

    let desertTrees = 0;
    for (let x = desert[0]; x < desert[0] + 96; x++) {
      for (let z = desert[1]; z < desert[1] + 96; z++) {
        for (let y = 30; y < 110; y++) {
          const id = voxel(x, y, z);
          if (id === WOOD || id === SPRUCE_WOOD) desertTrees++;
        }
      }
    }
    check("砂漠に木が生えない", desertTrees === 0, `${desertTrees} ブロック`);
  }

  // --- 砂漠と雪が隣り合わないこと ---
  //
  // 砂漠のすぐ隣が雪だと、見ていて明らかにおかしい。高さだけで雪にしていた頃は
  // 砂漠から生えた山の頂上が即座に雪になり、砂と雪が 4 ブロックまで近づいていた。
  // いまは SNOW_TEMP より暖かい山を岩肌にしてあるので、
  // 砂漠（気温 > HOT）と雪のあいだにはかならず 45 ブロック以上の帯が入る。
  //
  // 気温は連続なので、これはシードによらず成り立つはず。2 つのシードで確かめる。
  for (const seed of [12345, 4242]) {
    const g = seed === 12345 ? gen : new WorldGen(seed);
    const snowSurface = (b: number) => biomeDef(b).surface === SNOW;
    const touching = new Map<string, number>();
    let desertEdges = 0;
    let desertTouchesSnow = 0;

    // x 方向に 1 ブロックずつ走査して、隣り合う組を全部見る（前の値を使い回す）
    for (let z = -700; z <= 700; z += 47) {
      let prev = g.biomeAt(-700, z);
      for (let x = -699; x <= 700; x++) {
        const cur = g.biomeAt(x, z);
        if (cur !== prev) {
          if (prev === DESERT || cur === DESERT) {
            desertEdges++;
            if (snowSurface(prev) || snowSurface(cur)) desertTouchesSnow++;
          }
          if (biomeDef(prev).surface === SAND && snowSurface(cur)) {
            const key = [biomeName(prev), biomeName(cur)].sort().join("|");
            touching.set(key, (touching.get(key) ?? 0) + 1);
          }
          if (biomeDef(cur).surface === SAND && snowSurface(prev)) {
            const key = [biomeName(prev), biomeName(cur)].sort().join("|");
            touching.set(key, (touching.get(key) ?? 0) + 1);
          }
        }
        prev = cur;
      }
    }

    console.log(
      `      シード ${seed}: 砂漠のふち ${desertEdges} 件 / 砂と雪が接する組 ` +
        ([...touching].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join("  ") || "なし"),
    );
    check(
      `シード ${seed}: 砂漠が雪と隣り合わない`,
      desertTouchesSnow === 0,
      `${desertEdges} 件中 ${desertTouchesSnow} 件`,
    );
    // 残ってよいのは海岸線だけ（水の下の砂と、雪の浜のふち）
    check(
      `シード ${seed}: 砂と雪が接するのは海岸だけ`,
      [...touching.keys()].every((k) => k.includes("雪の浜")),
      [...touching.keys()].filter((k) => !k.includes("雪の浜")).join(",") || "",
    );
  }

  // 砂漠から雪面まで、どれだけ離れているか
  let nearest = Number.POSITIVE_INFINITY;
  for (let x = -1500; x < 1500; x += 53) {
    for (let z = -1500; z < 1500; z += 53) {
      if (gen.biomeAt(x, z) !== DESERT) continue;
      for (let r = 4; r < nearest && r <= 120; r += 4) {
        for (let a = 0; a < 16; a++) {
          const nx = x + Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
          const nz = z + Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
          if (biomeDef(gen.biomeAt(nx, nz)).surface === SNOW) {
            nearest = Math.min(nearest, r);
            break;
          }
        }
      }
    }
  }
  check("砂漠と雪面が 40 ブロック以上離れている", nearest >= 40, `最短 ${nearest} ブロック`);

  // --- 雪と高山 ---
  let snowOnGrassBiome = 0;
  let alpineNotSnow = 0;
  for (let x = -620; x < 620; x += 43) {
    for (let z = -620; z < 620; z += 43) {
      const h = gen.heightAt(x, z);
      const b = gen.biomeAt(x, z);
      const surface = voxel(x, h, z);
      if (b === ALPINE && surface !== SNOW) alpineNotSnow++;
      if (surface === SNOW && biomeDef(b).surface !== SNOW) snowOnGrassBiome++;
    }
  }
  check("高山の地表は必ず雪", alpineNotSnow === 0, `${alpineNotSnow} 点`);
  check("雪はバイオームの決めた場所にだけ出る", snowOnGrassBiome === 0, `${snowOnGrassBiome} 点`);

  // 洞窟が掘られている（地下に空気がある）
  let undergroundAir = 0;
  for (let y = 5; y < 35; y++) {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) if (voxel(x, y, z) === AIR) undergroundAir++;
    }
  }
  check("地下に洞窟がある", undergroundAir > 0, `${undergroundAir} ブロック`);
  check(
    "地下が空洞だらけではない",
    undergroundAir < 16 * 16 * 30 * 0.5,
    `${((undergroundAir / (16 * 16 * 30)) * 100).toFixed(0)}%`,
  );

  // 海面より上に水が湧いていない
  let strayWater = 0;
  for (let y = SEA_LEVEL + 1; y < 90; y++) {
    for (let x = -20; x < 20; x++) {
      for (let z = -20; z < 20; z++) if (voxel(x, y, z) === WATER) strayWater++;
    }
  }
  check("海面より上に水が無い", strayWater === 0, strayWater ? `${strayWater} 個` : "");

  // 最下層は必ず岩盤
  let bedrockHoles = 0;
  for (let x = -20; x < 20; x++) {
    for (let z = -20; z < 20; z++) if (voxel(x, 0, z) !== BEDROCK) bedrockHoles++;
  }
  check("最下層が岩盤で塞がれている", bedrockHoles === 0, bedrockHoles ? `${bedrockHoles} 箇所` : "");
}
