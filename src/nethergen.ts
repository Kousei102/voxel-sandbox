/**
 * ネザーの地形。**`worldgen.ts` と同じ `ChunkSource`** で、`World` から見れば
 * 差し替えられる生成器のひとつでしかない（`rules/meshing-render.md` の
 * 「`World` は地形の作り方を知らない」）。
 *
 * three も DOM も出てこないので、丸ごとヘッドレスで検証できる（`test/nethergen.test.ts`）。
 *
 * **オーバーワールドと違って上にも蓋がある。** 床と天井の 2 枚の高さを持ち、
 * そのあいだを空にして、低い所を溶岩で満たす。だから
 *
 * - 空が見えない（天井が `blocksSky`）＝ **昼夜に関わらず暗い**
 * - 下は溶岩の海。渡るには足場を作るしかない
 * - 明かりはグロウストーンと溶岩だけ
 *
 * が、余分な仕掛けなしに出る。
 */

import { AIR, BEDROCK, GLOWSTONE, LAVA, NETHERRACK, SOUL_SAND } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./constants";
import { FORTRESS } from "./fortress";
import { Noise } from "./noise";
import { placementsFor, stampPlacements, type Placement, type StructureDef } from "./structures";
import type { ChunkSource } from "./world";

/**
 * 溶岩の海の高さ。Minecraft と同じ 31。**海面は平ら**（オーバーワールドの
 * `SEA_LEVEL` と同じ扱い）なので、床がこれより低い所はすべて溶岩で埋まる。
 */
export const NETHER_LAVA_LEVEL = 31;

/** 床の高さの範囲。**下限を溶岩の海より低くすること** —— でないと海ができない。 */
const FLOOR_MIN = 18;
const FLOOR_MAX = 46;
/** 天井の下面の範囲。**床の上限よりだいぶ高くすること**（歩ける高さが要る）。 */
const CEIL_MIN = 84;
const CEIL_MAX = 104;

/** 岩盤の厚み。上下とも 1 枚（Minecraft は数枚のでこぼこだが、ここは平ら）。 */
const BEDROCK_TOP = WORLD_HEIGHT - 1;

/** ノイズの粗さ（1 マスあたりの座標の刻み）。小さいほど広くうねる。 */
const FLOOR_SCALE = 1 / 56;
const CEIL_SCALE = 1 / 72;

/** グロウストーンが天井にぶら下がる確率（列ごと）と、ぶら下がる深さ。 */
const GLOWSTONE_CHANCE = 0.018;
const GLOWSTONE_DEPTH = 3;

/**
 * ソウルサンドが出る確率（列ごと）。**溶岩の海のほとりだけ**なので、
 * この確率が掛かるのは床が海面の近くにある列だけ。
 */
const SOUL_SAND_CHANCE = 0.34;
/** ほとり ＝ 海面からこの高さまで。 */
const SHORE_HEIGHT = 4;

const COLUMN_CACHE_LIMIT = 2048;

/** この次元が建てるもの。**いまはネザー要塞 1 つ**（`fortress.ts`）。 */
const STRUCTURES: readonly StructureDef[] = [FORTRESS];

/** 座標から決まる 0..1 の擬似乱数（`worldgen.ts` の `hash2` と同じ式）。 */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface NetherColumn {
  /** 16x16 の床の高さ（その高さのマスまでが地面）。添字は `lz * 16 + lx`。 */
  readonly floor: Int16Array;
  /** 16x16 の天井の下面（その高さのマスから上が地面）。 */
  readonly ceiling: Int16Array;
  /** 床の一番上をソウルサンドにするか。 */
  readonly soul: Uint8Array;
  /** 天井の下面からぶら下がるグロウストーンの厚み（0 なら無し）。 */
  readonly glow: Uint8Array;
  /**
   * この列に掛かりうる構造物。**列につき 1 回だけ数える**（`rules/worldgen.md`）——
   * 1 つの列は 8 段ぶん `generateChunk` されるので、毎回数えると地面を測る回数が 8 倍になる。
   */
  readonly structures: readonly Placement[];
}

export class NetherGen implements ChunkSource {
  readonly seed: number;
  private readonly floorNoise: Noise;
  private readonly ceilNoise: Noise;
  private readonly columns = new Map<string, NetherColumn>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    // **床と天井で別のノイズを引くこと。** 同じものをずらして使うと、
    // 天井が床の形をそのままなぞって、高さの一定な回廊になる。
    this.floorNoise = new Noise(this.seed ^ 0x1f35c);
    this.ceilNoise = new Noise(this.seed ^ 0x7a2d9);
  }

  /** その 1 マスの床の高さ。**列のキャッシュを通さない**ので、テストと計測から直に呼べる。 */
  floorAt(wx: number, wz: number): number {
    const n = this.floorNoise.fbm2(wx * FLOOR_SCALE, wz * FLOOR_SCALE, 3);
    // fbm2 の実効レンジは概ね ±0.6（`rules/worldgen.md`）。0..1 に均してから幅を掛ける。
    const t = Math.min(1, Math.max(0, n / 1.2 + 0.5));
    return Math.round(FLOOR_MIN + t * (FLOOR_MAX - FLOOR_MIN));
  }

  /**
   * 構造物に渡す「地面の高さ」。**溶岩の海より下を返さないこと** ——
   * 床の高さをそのまま渡すと、海の底に要塞が沈んで溶岩に埋まる。
   * 海の上では海面と同じ高さになるので、通路が海に架かる橋になる。
   *
   * **ここで 1 度だけ作る**（チャンクごとに閉包を作ると、その GC がフレームの最悪値に出る。
   * `worldgen.ts` の `groundAt` と同じ）。
   */
  private readonly groundAt = (x: number, z: number): number =>
    Math.max(this.floorAt(x, z), NETHER_LAVA_LEVEL);

  /** その 1 マスの天井の下面（この高さから上が地面）。 */
  ceilingAt(wx: number, wz: number): number {
    const n = this.ceilNoise.fbm2(wx * CEIL_SCALE, wz * CEIL_SCALE, 3);
    const t = Math.min(1, Math.max(0, n / 1.2 + 0.5));
    return Math.round(CEIL_MIN + t * (CEIL_MAX - CEIL_MIN));
  }

  private column(cx: number, cz: number): NetherColumn {
    const key = `${cx},${cz}`;
    const hit = this.columns.get(key);
    if (hit) return hit;

    const floor = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const ceiling = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const soul = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const glow = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const at = lz * CHUNK_SIZE + lx;
        const f = this.floorAt(wx, wz);
        floor[at] = f;
        ceiling[at] = this.ceilingAt(wx, wz);
        // **海のほとりだけ。** 海の底（溶岩の下）に置いても誰も見ないし、
        // 高い所に置くと「なぜここに」という顔で置いてあることになる。
        soul[at] =
          f >= NETHER_LAVA_LEVEL &&
          f <= NETHER_LAVA_LEVEL + SHORE_HEIGHT &&
          hash2(wx, wz, this.seed ^ 0x50a1) < SOUL_SAND_CHANCE
            ? 1
            : 0;
        glow[at] =
          hash2(wx, wz, this.seed ^ 0x91b3) < GLOWSTONE_CHANCE
            ? 1 + Math.floor(hash2(wx, wz, this.seed ^ 0x33c7) * GLOWSTONE_DEPTH)
            : 0;
      }
    }

    const structures = placementsFor(STRUCTURES, this.seed, cx, cz, this.groundAt);
    const data: NetherColumn = { floor, ceiling, soul, glow, structures };
    if (this.columns.size >= COLUMN_CACHE_LIMIT) {
      const oldest = this.columns.keys().next().value;
      if (oldest !== undefined) this.columns.delete(oldest);
    }
    this.columns.set(key, data);
    return data;
  }

  /** チャンク 1 個分のボクセルを `data` に書き込む。 */
  generateChunk(cx: number, cy: number, cz: number, data: Uint8Array): void {
    const { floor, ceiling, soul, glow, structures } = this.column(cx, cz);
    const baseY = cy * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const at = lz * CHUNK_SIZE + lx;
        const top = floor[at];
        const under = ceiling[at];
        const glowDepth = glow[at];

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = baseY + ly;
          const index = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          data[index] = this.blockAt(wy, top, under, soul[at] === 1, glowDepth);
        }
      }
    }

    // **地形を埋めてから建てること。** 先に建てると、通路が岩で埋め戻される。
    stampPlacements(structures, cx, cy, cz, data);
  }

  /**
   * その高さに何が入るか。**この 1 本がネザーの形の全部**なので、
   * テストはここを直に呼んで断面を確かめられる。
   */
  blockAt(wy: number, floor: number, ceiling: number, soul: boolean, glowDepth: number): number {
    // **上下の岩盤が先。** あとに回すと、天井の下面が 127 に届いた列で
    // グロウストーンが世界の外側の面として見えることになる。
    if (wy <= 0) return BEDROCK;
    if (wy >= BEDROCK_TOP) return BEDROCK;

    if (wy >= ceiling) {
      // 天井の下面から数マスだけグロウストーン。**下からぶら下がって見える**ように、
      // 上に積むのではなく下面から数える。
      return glowDepth > 0 && wy < ceiling + glowDepth ? GLOWSTONE : NETHERRACK;
    }
    if (wy > floor) {
      // 空いている所。海面より下は溶岩で埋まる。
      return wy <= NETHER_LAVA_LEVEL ? LAVA : AIR;
    }
    // 地面。一番上だけソウルサンドになることがある。
    return soul && wy === floor ? SOUL_SAND : NETHERRACK;
  }
}
