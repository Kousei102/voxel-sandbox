import {
  AIR,
  BEDROCK,
  CACTUS,
  COAL_ORE,
  DIAMOND_ORE,
  GOLD_ORE,
  GRAVEL,
  IRON_ORE,
  LAVA,
  LEAVES,
  SPRUCE_LEAVES,
  SPRUCE_WOOD,
  STONE,
  TALL_GRASS,
  WATER,
  WOOD,
  isReplaceable,
} from "./blocks";
import { biomeDef, classify, resolve, type TreeKind } from "./biomes";
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from "./constants";
import { Noise } from "./noise";
import { placementsFor, stampPlacements, type Placement, type StructureDef } from "./structures";

interface Tree {
  x: number;
  y: number;
  z: number;
  height: number;
  kind: TreeKind;
}

interface ColumnData {
  /** 16x16 の地表高さ（その高さのブロックまでが地面）。 */
  readonly height: Int16Array;
  /** 16x16 のバイオーム。高さと同じ添字で引く。 */
  readonly biome: Uint8Array;
  /** この列に根を張る木（サボテンもここに入る）。座標はワールド絶対座標。 */
  readonly trees: Tree[];
  /**
   * この列のチャンクに掛かりうる構造物。**木と同じで列のキャッシュに持つ。**
   * ここに置かないと、1 つの列を 8 段ぶん生成するあいだに地面を 8 回測ることになる。
   */
  readonly structures: Placement[];
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

function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 1274126177) ^
    Math.imul(z, 668265263) ^
    Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 石の中に埋まっているもの。上限の高さと、鉱脈の湧きやすさ・鉱脈内の詰まり具合を持つ。
 * 深いものほど珍しく、上に行くほど出ない。
 *
 * **鉱石でない砂利も同じ表に置いてある。** 湧き方がまったく同じ（座標のハッシュで
 * 塊を作って中を間引く）ものなので、専用の仕組みを足すと石ブロック 1 個ごとの
 * ループが 2 本になる。
 */
interface VeinDef {
  readonly id: number;
  readonly maxY: number;
  /** 塊 1 つが湧く確率。 */
  readonly veinChance: number;
  /** 塊の中で実際にそのブロックになる確率。1 だと角ばった塊になって不自然。 */
  readonly fill: number;
  /**
   * 塊の粗さ（座標を何ビット落とすか）。1 なら 2x2x2、2 なら 4x4x4。
   * **鉱石は 1、砂利は 2。** 砂利を 1 にすると石の中に胡椒を撒いたような散り方になり、
   * Minecraft の「砂利の塊」に見えない。
   */
  readonly shift: number;
  readonly salt: number;
}

/**
 * この高さ以下の洞窟には溶岩が溜まる。**海面（`SEA_LEVEL`）の水とまったく同じ扱い**で、
 * 「掘り抜いた空間のうち、この高さ以下」を液体で埋める。
 *
 * ダイヤ鉱石の上限（`maxY` 14）より少し下にしてあるので、**ダイヤを掘りに行くと
 * 溶岩に出会う**。これがゲームの進み方（黒曜石 → ネザー）にそのまま繋がる。
 * 上げすぎると地表近くの洞窟まで溶岩だらけになり、下げすぎると出会えない。
 */
export const LAVA_LEVEL = 10;

const VEINS: readonly VeinDef[] = [
  { id: COAL_ORE, maxY: 62, veinChance: 0.02, fill: 0.75, shift: 1, salt: 0x51ed },
  { id: IRON_ORE, maxY: 46, veinChance: 0.015, fill: 0.65, shift: 1, salt: 0x2b17 },
  { id: GOLD_ORE, maxY: 26, veinChance: 0.005, fill: 0.55, shift: 1, salt: 0x7c39 },
  { id: DIAMOND_ORE, maxY: 14, veinChance: 0.003, fill: 0.5, shift: 1, salt: 0x1d4b },
  // **砂利は一番下に置くこと。** 先に見つかったものが勝つので、上に置くと
  // 鉱石が砂利に食われる（掘っても鉱石が見つからない世界になる）。
  // 石炭と同じ高さまで出るので、**火打石を探して深く潜る必要はない。**
  { id: GRAVEL, maxY: 62, veinChance: 0.03, fill: 0.8, shift: 2, salt: 0x3e91 },
];

/**
 * この生成器が建てる構造物（`structures.ts` の器に乗る）。
 *
 * **まだ空です。** 器だけ先に通してあり、最初の 1 個はネザー要塞（TASKS 2-3）。
 * 空のあいだ `stampStructures()` は即座に戻るので、費用は掛かりません。
 */
const STRUCTURES: readonly StructureDef[] = [];

export class WorldGen {
  private readonly terrain: Noise;
  private readonly detail: Noise;
  private readonly caveA: Noise;
  private readonly caveB: Noise;
  private readonly temperature: Noise;
  private readonly humidity: Noise;
  private readonly columns = new Map<string, ColumnData>();

  /**
   * 構造物に渡す「地面の高さ」。**ここで 1 度だけ作る** ——
   * チャンクごとに閉包を作ると、その GC がフレームの最悪値に出る
   * （`mesher.ts` のマスクを使い回しているのと同じ理由）。
   */
  private readonly groundAt = (x: number, z: number): number => this.heightAt(x, z);

  constructor(readonly seed: number) {
    this.terrain = new Noise(seed);
    this.detail = new Noise(seed ^ 0x9e3779b9);
    this.caveA = new Noise(seed ^ 0x85ebca6b);
    this.caveB = new Noise(seed ^ 0xc2b2ae35);
    this.temperature = new Noise(seed ^ 0x27d4eb2f);
    this.humidity = new Noise(seed ^ 0x165667b1);
  }

  /**
   * 気候だけで決まるバイオーム。**高さを見ない**（見ると循環する。biomes.ts 参照）。
   * 波長 600 ブロックほど。細かくすると 1 歩ごとに地表が変わってまだらになる。
   *
   * オクターブ 2 は境目を入り組ませるためのもので、費用ではない
   * （1 と 2 の差はチャンク 1 個あたり 0.006ms = 1% 未満。1 オクターブだと
   * 境目が丸くなる代わりに、バイオームの割合はむしろ均等になる）。
   */
  private temperatureAt(x: number, z: number): number {
    return this.temperature.fbm2(x * 0.0016, z * 0.0016, 2);
  }

  /**
   * その座標の最終的なバイオーム。高さを外から渡すのは、`column()` が
   * すでに求めた高さを使い回すため（`heightAt` は 1 列で 256 回呼ぶので二度引きしたくない）。
   */
  private biomeFor(x: number, z: number, height: number): number {
    const t = this.temperatureAt(x, z);
    const h = this.humidity.fbm2(x * 0.0019 + 91.7, z * 0.0019 - 43.1, 2);
    return resolve(classify(t, h), height, t);
  }

  /** デバッグ表示・テスト用。 */
  biomeAt(x: number, z: number): number {
    return this.biomeFor(x, z, this.heightAt(x, z));
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

  /**
   * その座標に埋まっているもの（鉱石・砂利）。無ければ STONE。
   *
   * 石ブロック 1 個ごとに呼ばれるので、ノイズは使わずハッシュだけで済ませている
   * （noise3 を 1 回足すとチャンク生成が倍近くなり、フレーム予算に収まらなくなる）。
   * 座標を `shift` ビット落としたハッシュで塊を作り、その中を fill で間引く。
   */
  private veinAt(x: number, y: number, z: number): number {
    for (const vein of VEINS) {
      if (y > vein.maxY) continue;
      const s = vein.shift;
      if (hash3(x >> s, y >> s, z >> s, this.seed ^ vein.salt) >= vein.veinChance) continue;
      if (hash3(x, y, z, this.seed ^ (vein.salt << 1)) >= vein.fill) continue;
      return vein.id;
    }
    return STONE;
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
    const biome = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const h = this.heightAt(wx, wz);
        height[lz * CHUNK_SIZE + lx] = h;
        biome[lz * CHUNK_SIZE + lx] = this.biomeFor(wx, wz, h);
      }
    }

    const trees: Tree[] = [];
    // 木は列ごとに数本まで。境界をまたぐ枝葉は隣の列の生成時にも参照される。
    // 生えやすさと種類はバイオーム側の表から引く（判断を散らさない）。
    const attempts = 6;
    for (let i = 0; i < attempts; i++) {
      const r = hash2(cx * 31 + i, cz * 17 - i, this.seed ^ 0x1234);
      const lx = Math.floor(hash2(cx + i, cz * 7 + i, this.seed ^ 0xabcd) * CHUNK_SIZE);
      const lz = Math.floor(hash2(cx * 5 - i, cz + i, this.seed ^ 0x5678) * CHUNK_SIZE);
      const at = lz * CHUNK_SIZE + lx;
      const def = biomeDef(biome[at]);
      if (r > def.trees) continue;
      const h = height[at];
      // 水辺・高山・急斜面には生やさない
      if (h <= SEA_LEVEL + 1 || h >= 74) continue;
      const wx = baseX + lx;
      const wz = baseZ + lz;
      if (Math.abs(this.heightAt(wx + 1, wz) - h) > 1) continue;
      if (Math.abs(this.heightAt(wx, wz + 1) - h) > 1) continue;
      if (trees.some((t) => Math.abs(t.x - wx) < 4 && Math.abs(t.z - wz) < 4)) continue;
      const roll = hash2(wx, wz, this.seed ^ 0x99);
      const trunk =
        def.treeKind === "spruce"
          ? 6 + Math.floor(roll * 4)
          : def.treeKind === "cactus"
            ? 1 + Math.floor(roll * 3)
            : 4 + Math.floor(roll * 3);
      trees.push({ x: wx, y: h + 1, z: wz, height: trunk, kind: def.treeKind });
    }

    const structures = placementsFor(STRUCTURES, this.seed, cx, cz, this.groundAt);
    const data: ColumnData = { height, biome, trees, structures };
    if (this.columns.size >= COLUMN_CACHE_LIMIT) {
      const oldest = this.columns.keys().next().value;
      if (oldest !== undefined) this.columns.delete(oldest);
    }
    this.columns.set(key, data);
    return data;
  }

  /** チャンク 1 個分のボクセルを data に書き込む。 */
  generateChunk(cx: number, cy: number, cz: number, data: Uint8Array): void {
    const { height, biome } = this.column(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = baseZ + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const at = lz * CHUNK_SIZE + lx;
        const h = height[at];
        // 内側の 16 段で毎回引かないよう、ここで取り出しておく
        const { surface, filler, grass } = biomeDef(biome[at]);
        // 草むらは地表のすぐ上の 1 マスだけ。列ごとに 1 回引けば済む
        const tuft =
          grass > 0 && h > SEA_LEVEL && hash2(wx, wz, this.seed ^ 0x6a55) < grass
            ? TALL_GRASS
            : AIR;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = baseY + ly;
          const index = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

          if (wy > h) {
            data[index] = wy <= SEA_LEVEL ? WATER : wy === h + 1 ? tuft : AIR;
            continue;
          }
          if (wy === 0) {
            data[index] = BEDROCK;
            continue;
          }
          // 地表から 3 ブロックは残して洞窟を掘る。
          // **掘り抜いた空間の底には溶岩が溜まる** —— 上の海面と同じ形
          // （`wy <= SEA_LEVEL ? WATER : ...`）で、高さで液体を決めるだけ。
          if (wy < h - 2 && this.isCave(wx, wy, wz)) {
            data[index] = wy <= LAVA_LEVEL ? LAVA : AIR;
            continue;
          }

          const depth = h - wy;
          if (depth === 0) {
            data[index] = surface;
          } else if (depth <= 3) {
            data[index] = filler;
          } else {
            data[index] = this.veinAt(wx, wy, wz);
          }
        }
      }
    }

    this.applyTrees(cx, cy, cz, data);
    // 構造物は木の**あと**（木より強い）。**列をまたぐ扱いは `structures.ts` が持つ。**
    stampPlacements(this.column(cx, cz).structures, cx, cy, cz, data);
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
      // 草むらは葉に押しのけられる（弾くと、木の下だけ葉が欠ける）
      if (!overwrite && !isReplaceable(data[index])) return;
      data[index] = id;
    };

    // サボテンは幹だけ。葉も枝も無いので、隣の列にはみ出すこともない。
    if (tree.kind === "cactus") {
      for (let i = 0; i < tree.height; i++) {
        put(tree.x, tree.y + i, tree.z, CACTUS, true);
      }
      return;
    }

    const spruce = tree.kind === "spruce";
    const wood = spruce ? SPRUCE_WOOD : WOOD;
    const leaf = spruce ? SPRUCE_LEAVES : LEAVES;
    const top = tree.y + tree.height - 1;

    // 葉: 幹の先端 (top) を含む段。top + 1 にも置かないと幹が空に突き出したままになる。
    // トウヒは下ほど広い円錐、オークは丸い塊。**半径は TREE_RADIUS を超えないこと**
    // （超えると隣の列の生成時に切り落とされて、葉が欠ける）。
    const lowest = spruce ? -4 : -2;
    for (let dy = lowest; dy <= 1; dy++) {
      const r = spruce ? (dy <= -3 ? 2 : dy <= -1 ? 1 : 0) : dy >= 1 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r === 2 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          put(tree.x + dx, top + dy, tree.z + dz, leaf, false);
        }
      }
    }
    for (let i = 0; i < tree.height; i++) {
      put(tree.x, tree.y + i, tree.z, wood, true);
    }
  }
}
