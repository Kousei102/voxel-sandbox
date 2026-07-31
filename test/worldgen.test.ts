import { AIR, GRASS, LEAVES, STONE, WATER, WOOD, blockName } from "../src/blocks";
import { CHUNK_VOLUME, SEA_LEVEL } from "../src/constants";
import { WorldGen } from "../src/worldgen";
import { check, describe } from "./harness";

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

  // 木は列をまたいでも欠けない: 幹の上に必ず葉がある
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
  for (let x = -40; x < 40; x++) {
    for (let z = -40; z < 40; z++) {
      for (let y = 40; y < 90; y++) {
        if (voxel(x, y, z) !== WOOD) continue;
        if (voxel(x, y + 1, z) === WOOD) continue;
        trunks++;
        if (voxel(x, y + 1, z) === LEAVES) capped++;
      }
    }
  }
  check("木の幹の先に葉がある（列をまたぐ葉が欠けない）", trunks > 0 && trunks === capped, `${capped}/${trunks} 本`);
  check("木の生成数が妥当", trunks > 3, `${trunks} 本 / 80x80 ブロック`);

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
    for (let z = -20; z < 20; z++) if (blockName(voxel(x, 0, z)) !== "Bedrock") bedrockHoles++;
  }
  check("最下層が岩盤で塞がれている", bedrockHoles === 0, bedrockHoles ? `${bedrockHoles} 箇所` : "");
}
