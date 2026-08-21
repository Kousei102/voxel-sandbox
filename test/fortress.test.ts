import { AIR, LAVA, NETHERRACK, NETHER_BRICK, isSolid } from "../src/blocks";
import { CHUNK_LAYERS, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from "../src/constants";
import {
  FORTRESS,
  FORTRESS_EDGE,
  FORTRESS_HALF,
  FORTRESS_HEADROOM,
  FORTRESS_SPACING,
} from "../src/fortress";
import { NETHER_LAVA_LEVEL, NetherGen } from "../src/nethergen";
import { placementsFor } from "../src/structures";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** `build()` の書き込みを、座標ごとに 1 個ずつ受け止める（チャンクの外も落とさない）。 */
function stamped(x = 0, y = 40, z = 0): Map<string, number> {
  const cells = new Map<string, number>();
  FORTRESS.build({ def: FORTRESS, x, y, z }, (px, py, pz, id) => {
    cells.set(`${px},${py},${pz}`, id);
  });
  return cells;
}

/** 1 つの列（16x16）を上から下まで作って 1 本の配列にする（`nethergen.test.ts` と同じ形）。 */
function stack(gen: NetherGen, cx: number, cz: number): Uint8Array {
  const all = new Uint8Array(WORLD_HEIGHT * CHUNK_SIZE * CHUNK_SIZE);
  const chunk = new Uint8Array(CHUNK_VOLUME);
  for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
    chunk.fill(0);
    gen.generateChunk(cx, cy, cz, chunk);
    all.set(chunk, cy * CHUNK_VOLUME);
  }
  return all;
}

const at = (all: Uint8Array, lx: number, wy: number, lz: number) =>
  all[(wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];

export function run(): void {
  describe("ネザー要塞（通路）");

  const source = sourceOf("src/fortress.ts");
  const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
    source.includes(w),
  );
  check("fortress.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));
  // **高さを自分で測らないこと。** 器が渡す基準点 1 点で全部決まる形（`rules/worldgen.md`）。
  check("fortress.ts は地面を測らない", !source.includes("floorAt") && !source.includes("heightAt"));

  // --- 形（`build()` を直に呼ぶ） -----------------------------------------

  {
    const y = 40;
    const cells = stamped(0, y, 0);
    let brick = 0;
    let air = 0;
    let outside = 0;
    for (const [key, id] of cells) {
      const [x, cy, z] = key.split(",").map(Number);
      if (id === NETHER_BRICK) brick++;
      if (id === AIR) air++;
      // **`extent` からはみ出したら、離れたチャンクを作ったときに端が黙って欠ける。**
      if (
        Math.abs(x) > FORTRESS.extent.x ||
        Math.abs(z) > FORTRESS.extent.z ||
        cy < y ||
        cy > y + FORTRESS.extent.up
      ) {
        outside++;
      }
    }
    console.log(
      `      十字 1 個: ${cells.size} マス（レンガ ${brick} / 空 ${air}）  ` +
        `全長 ${FORTRESS_HALF * 2 + 1}  幅 ${FORTRESS_EDGE * 2 + 1}`,
    );
    check("申告した extent の外へ書かない", outside === 0, `${outside} マス`);

    // 床が端から端まで続いていること（途切れると渡れない）。
    let gaps = 0;
    for (let a = -FORTRESS_HALF; a <= FORTRESS_HALF; a++) {
      if (cells.get(`${a},${y},0`) !== NETHER_BRICK) gaps++;
      if (cells.get(`0,${y},${a}`) !== NETHER_BRICK) gaps++;
    }
    check("床が端まで続いている", gaps === 0, `${gaps} マス欠け`);

    // 真ん中の 3 マスは頭上が空いていること（歩ける）。
    let blocked = 0;
    for (let a = -FORTRESS_HALF; a <= FORTRESS_HALF; a++) {
      for (let b = -1; b <= 1; b++) {
        for (let h = 1; h <= FORTRESS_HEADROOM; h++) {
          if (cells.get(`${a},${y + h},${b}`) !== AIR) blocked++;
          if (cells.get(`${b},${y + h},${a}`) !== AIR) blocked++;
        }
      }
    }
    check("歩く 3 マスの頭上が空いている", blocked === 0, `${blocked} マス`);

    // 手すりは端の 2 列だけ。**交差点には無いこと**（塞ぐと片方へ行けない）。
    const rail = cells.get(`${FORTRESS_HALF},${y + 1},${FORTRESS_EDGE}`);
    let crossing = 0;
    for (let a = -FORTRESS_EDGE; a <= FORTRESS_EDGE; a++) {
      for (let b = -FORTRESS_EDGE; b <= FORTRESS_EDGE; b++) {
        if (cells.get(`${a},${y + 1},${b}`) === NETHER_BRICK) crossing++;
      }
    }
    console.log(`      交差点 5x5 の腰の高さに残ったレンガ: ${crossing} マス`);
    check("端には手すりがある", rail === NETHER_BRICK);
    check("交差点は手すりで塞がない", crossing === 0, `${crossing} マス`);
  }

  {
    // 建てる場所は決まっていること（同じ種・同じ列なら同じ場所）。
    const ground = () => 40;
    const a = placementsFor([FORTRESS], 12345, 3, 3, ground);
    const b = placementsFor([FORTRESS], 12345, 3, 3, ground);
    const c = placementsFor([FORTRESS], 999, 3, 3, ground);
    const key = (p: typeof a) => p.map((q) => `${q.x},${q.y},${q.z}`).join(" ");
    console.log(`      列 (3,3) に掛かる要塞: ${a.length} 個  [${key(a)}]`);
    check("同じ種なら同じ場所", key(a) === key(b));
    check("種が違えば違う場所", key(a) !== key(c), key(c));
  }

  // --- 実際に生成してみる -------------------------------------------------

  {
    const gen = new NetherGen(12345);
    // 要塞は `FORTRESS_SPACING` 列ごとに 1 個試すので、その 2 倍を舐めれば必ず何個か入る。
    const SPAN = FORTRESS_SPACING * 2;
    let brick = 0;
    let inLava = 0;
    let walkable = 0;
    let stuck = 0;
    let lowest = WORLD_HEIGHT;
    let highest = 0;
    const columns: string[] = [];

    for (let cx = 0; cx < SPAN; cx++) {
      for (let cz = 0; cz < SPAN; cz++) {
        const all = stack(gen, cx, cz);
        let here = 0;
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
              if (at(all, lx, y, lz) !== NETHER_BRICK) continue;
              brick++;
              here++;
              if (y < lowest) lowest = y;
              if (y > highest) highest = y;
              // **溶岩に沈めないこと**（沈むと、要塞に着いた瞬間に焼ける）。
              if (y <= NETHER_LAVA_LEVEL - 1) inLava++;
              // 床の上（手すりでない所）は、頭 2 マスが空いていること。
              const above = at(all, lx, y + 1, lz);
              const above2 = at(all, lx, y + 2, lz);
              if (above === AIR && above2 === AIR) walkable++;
              else if (above === LAVA) stuck++;
            }
          }
        }
        if (here > 0) columns.push(`${cx},${cz}`);
      }
    }

    console.log(
      `      ${SPAN}x${SPAN} 列: レンガ ${brick} マス（${columns.length} 列に掛かる）  ` +
        `高さ ${lowest}..${highest}  頭上が空いている ${walkable} マス`,
    );
    check("要塞が生成される", brick > 0, `${brick} マス`);
    check("溶岩の海に沈んでいない", inLava === 0, `${inLava} マス`);
    check("溶岩をかぶっていない", stuck === 0, `${stuck} マス`);
    // 十字 1 個は床だけで 201 マスあるので、掛かる列は必ず 2 つ以上になる
    // （1 列に収まっていたら、端が欠けている）。
    check("複数の列にまたがる", columns.length > 1, `${columns.length} 列`);
    check("歩ける床がある", walkable > 100, `${walkable} マス`);
  }

  {
    // **どの順で作っても同じ形。** 隣の列を先に作ってから中央を作っても、
    // 通路の続きが同じ位置に入ること（保留マップを持たない形の肝心なところ）。
    const gen = new NetherGen(12345);
    const other = new NetherGen(12345);
    const chunk = new Uint8Array(CHUNK_VOLUME);
    const again = new Uint8Array(CHUNK_VOLUME);

    // 片方は周りを先に作ってから、もう片方はいきなり中央を作る。
    for (let cx = 4; cx <= 6; cx++) {
      for (let cz = 4; cz <= 6; cz++) other.generateChunk(cx, 2, cz, again);
    }
    gen.generateChunk(5, 2, 5, chunk);
    other.generateChunk(5, 2, 5, again);

    let same = 0;
    for (let i = 0; i < chunk.length; i++) if (chunk[i] === again[i]) same++;
    console.log(`      生成の順を変えて一致 ${same} / ${chunk.length}`);
    check("生成の順に依らない", same === chunk.length);
  }

  {
    // 要塞のぶんが生成の費用にどれだけ乗ったか。**要塞のある列とない列で比べる**
    // （この箱の絶対値は日によって変わるので、同じ土俵の比で見る）。
    const gen = new NetherGen(4242);
    const buffer = new Uint8Array(CHUNK_VOLUME);
    const timeOf = (run: (i: number) => void) => {
      const times: number[] = [];
      for (let i = 0; i < 24; i++) {
        const t0 = performance.now();
        run(i);
        times.push(performance.now() - t0);
      }
      times.sort((x, y) => x - y);
      return times[times.length >> 1];
    };
    // 要塞が掛かるのは基準点の高さ（32..47）の段だけ。上の段は素通りするので、
    // 「掛かる段」と「掛からない段」で比べれば要塞のぶんだけが出る。
    const withFort = timeOf((i) => gen.generateChunk(300 + i, 2, 300 + i, buffer));
    const without = timeOf((i) => gen.generateChunk(300 + i, 5, 300 + i, buffer));
    console.log(
      `      チャンク 1 個: 要塞の段 ${withFort.toFixed(3)}ms / 上の段 ${without.toFixed(3)}ms`,
    );
    // 予算は 1 フレーム 3ms（`constants.ts` の `GENERATE_BUDGET_MS`）。
    check("要塞のぶんで予算を食い潰さない", withFort < 1.5, `${withFort.toFixed(3)}ms`);
  }

  {
    // 地形の中に埋まった所は、掘らずに通れるトンネルになっていること
    // （床の上が岩で埋まっていたら、要塞の中を歩けない）。
    const gen = new NetherGen(777);
    let buried = 0;
    let tunnels = 0;
    const chunk = new Uint8Array(CHUNK_VOLUME);
    for (let cx = 0; cx < FORTRESS_SPACING * 2; cx++) {
      for (let cz = 0; cz < FORTRESS_SPACING * 2; cz++) {
        for (let cy = 1; cy <= 3; cy++) {
          chunk.fill(0);
          gen.generateChunk(cx, cy, cz, chunk);
          for (let ly = 0; ly < CHUNK_SIZE - 2; ly++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
              for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const idx = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
                if (chunk[idx] !== NETHER_BRICK) continue;
                const up1 = chunk[((ly + 1) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
                const up2 = chunk[((ly + 2) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
                if (up1 === NETHERRACK || up2 === NETHERRACK) buried++;
                else if (up1 === AIR && up2 === AIR && isSolid(chunk[idx])) tunnels++;
              }
            }
          }
        }
      }
    }
    console.log(`      別の種（777）: 岩に埋まった床 ${buried} マス / 通れる床 ${tunnels} マス`);
    check("床の上を岩で埋め戻さない", buried === 0, `${buried} マス`);
  }
}
