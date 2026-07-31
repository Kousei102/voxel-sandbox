import {
  AIR,
  BEDROCK,
  DIRT,
  GRASS,
  LEAVES,
  SAND,
  SNOW,
  STONE,
  WATER,
  WOOD,
} from "./blocks";
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from "./constants";
import { Noise } from "./noise";

interface Tree {
  x: number;
  y: number;
  z: number;
  height: number;
}

interface ColumnData {
  /** 16x16 の地表高さ（その高さのブロックまでが地面）。 */
  readonly height: Int16Array;
  /** この列に根を張る木。座標はワールド絶対座標。 */
  readonly trees: Tree[];
}

const TREE_RADIUS = 2;
const COLUMN_CACHE_LIMIT = 2048;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 座標から決まる 0..1 の擬似乱数。同じ入力なら常に同じ値。 */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class WorldGen {
  private readonly terrain: Noise;
  private readonly detail: Noise;
  private readonly caveA: Noise;
  private readonly caveB: Noise;
  private readonly columns = new Map<string, ColumnData>();

  constructor(readonly seed: number) {
    this.terrain = new Noise(seed);
    this.detail = new Noise(seed ^ 0x9e3779b9);
    this.caveA = new Noise(seed ^ 0x85ebca6b);
    this.caveB = new Noise(seed ^ 0xc2b2ae35);
  }

  /**
   * ワールド座標の地表高さ。
   * fbm2 の実効レンジは概ね ±0.6 なので、しきい値はその前提で決めてある。
   */
  heightAt(x: number, z: number): number {
    const continent = this.terrain.fbm2(x * 0.0018, z * 0.0018, 4);
    const hills = this.detail.fbm2(x * 0.011, z * 0.011, 4);
    // 尾根線: |noise| を反転すると稜線が立つ。二乗して山頂を尖らせる。
    const ridge = 1 - Math.abs(this.terrain.fbm2(x * 0.0055, z * 0.0055, 3));
    const mountain = smoothstep(0.05, 0.34, continent);
    const h = SEA_LEVEL + 3 + continent * 26 + hills * 7 + mountain * ridge * ridge * 46;
    return Math.max(1, Math.min(WORLD_HEIGHT - 6, Math.round(h)));
  }

  private isCave(x: number, y: number, z: number): boolean {
    if (y < 2) return false;
    const a = this.caveA.noise3(x * 0.028, y * 0.05, z * 0.028);
    if (Math.abs(a) > 0.09) return false;
    const b = this.caveB.noise3(x * 0.028, y * 0.05, z * 0.028);
    return Math.abs(b) < 0.09;
  }

  private column(cx: number, cz: number): ColumnData {
    const key = `${cx},${cz}`;
    const cached = this.columns.get(key);
    if (cached) return cached;

    const height = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        height[lz * CHUNK_SIZE + lx] = this.heightAt(baseX + lx, baseZ + lz);
      }
    }

    const trees: Tree[] = [];
    // 木は列ごとに数本まで。境界をまたぐ枝葉は隣の列の生成時にも参照される。
    const attempts = 6;
    for (let i = 0; i < attempts; i++) {
      const r = hash2(cx * 31 + i, cz * 17 - i, this.seed ^ 0x1234);
      if (r > 0.42) continue;
      const lx = Math.floor(hash2(cx + i, cz * 7 + i, this.seed ^ 0xabcd) * CHUNK_SIZE);
      const lz = Math.floor(hash2(cx * 5 - i, cz + i, this.seed ^ 0x5678) * CHUNK_SIZE);
      const h = height[lz * CHUNK_SIZE + lx];
      // 水辺・高山・急斜面には生やさない
      if (h <= SEA_LEVEL + 1 || h >= 74) continue;
      const wx = baseX + lx;
      const wz = baseZ + lz;
      if (Math.abs(this.heightAt(wx + 1, wz) - h) > 1) continue;
      if (Math.abs(this.heightAt(wx, wz + 1) - h) > 1) continue;
      if (trees.some((t) => Math.abs(t.x - wx) < 4 && Math.abs(t.z - wz) < 4)) continue;
      const trunk = 4 + Math.floor(hash2(wx, wz, this.seed ^ 0x99) * 3);
      trees.push({ x: wx, y: h + 1, z: wz, height: trunk });
    }

    const data: ColumnData = { height, trees };
    if (this.columns.size >= COLUMN_CACHE_LIMIT) {
      const oldest = this.columns.keys().next().value;
      if (oldest !== undefined) this.columns.delete(oldest);
    }
    this.columns.set(key, data);
    return data;
  }

  /** チャンク 1 個分のボクセルを data に書き込む。 */
  generateChunk(cx: number, cy: number, cz: number, data: Uint8Array): void {
    const { height } = this.column(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = baseZ + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const h = height[lz * CHUNK_SIZE + lx];
        const beach = h <= SEA_LEVEL + 1;
        const alpine = h >= 76;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = baseY + ly;
          const index = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

          if (wy > h) {
            data[index] = wy <= SEA_LEVEL ? WATER : AIR;
            continue;
          }
          if (wy === 0) {
            data[index] = BEDROCK;
            continue;
          }
          // 地表から 3 ブロックは残して洞窟を掘る
          if (wy < h - 2 && this.isCave(wx, wy, wz)) {
            data[index] = AIR;
            continue;
          }

          const depth = h - wy;
          if (depth === 0) {
            data[index] = beach ? SAND : alpine ? SNOW : GRASS;
          } else if (depth <= 3) {
            data[index] = beach ? SAND : alpine ? STONE : DIRT;
          } else {
            data[index] = STONE;
          }
        }
      }
    }

    this.applyTrees(cx, cy, cz, data);
  }

  /** 自分の列と隣接 8 列の木のうち、このチャンクに掛かる部分を書き込む。 */
  private applyTrees(cx: number, cy: number, cz: number, data: Uint8Array): void {
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const tree of this.column(cx + dx, cz + dz).trees) {
          const top = tree.y + tree.height;
          if (top + TREE_RADIUS < baseY || tree.y > baseY + CHUNK_SIZE - 1) continue;
          if (tree.x + TREE_RADIUS < baseX || tree.x - TREE_RADIUS >= baseX + CHUNK_SIZE) continue;
          if (tree.z + TREE_RADIUS < baseZ || tree.z - TREE_RADIUS >= baseZ + CHUNK_SIZE) continue;
          this.stampTree(tree, baseX, baseY, baseZ, data);
        }
      }
    }
  }

  private stampTree(tree: Tree, baseX: number, baseY: number, baseZ: number, data: Uint8Array) {
    const put = (wx: number, wy: number, wz: number, id: number, overwrite: boolean) => {
      const lx = wx - baseX;
      const ly = wy - baseY;
      const lz = wz - baseZ;
      if (lx < 0 || ly < 0 || lz < 0) return;
      if (lx >= CHUNK_SIZE || ly >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
      const index = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
      if (!overwrite && data[index] !== AIR && data[index] !== WATER) return;
      data[index] = id;
    };

    const top = tree.y + tree.height - 1;
    // 葉: 幹の先端 (top) を含む 4 段。上 1 段は細く、下 3 段は広く。
    // top + 1 にも葉を置かないと幹が空に突き出したままになる。
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 1 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r === 2 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          put(tree.x + dx, top + dy, tree.z + dz, LEAVES, false);
        }
      }
    }
    for (let i = 0; i < tree.height; i++) {
      put(tree.x, tree.y + i, tree.z, WOOD, true);
    }
  }
}
