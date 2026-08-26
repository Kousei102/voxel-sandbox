/**
 * エンドの地形。**`worldgen.ts` / `nethergen.ts` と同じ `ChunkSource`** で、
 * `World` から見れば差し替えられる生成器のひとつでしかない
 * （`rules/meshing-render.md` の「`World` は地形の作り方を知らない」）。
 *
 * three も DOM も出てこないので、丸ごとヘッドレスで検証できる（`test/endgen.test.ts`）。
 *
 * **オーバーワールドともネザーとも違って、地面のほうが例外。** ここは
 *
 * - **原点のまわりの島 1 つだけ**が地面で、そこから外はどこまでも虚空（空気）
 * - **岩盤が 1 マスも無い。** 落ちたら世界の底を突き抜けて `VOID_Y` まで落ちる
 * - 天井も無いのでスカイライトは全開だが、空の明るさが固定 0.7（`daynight.ts` の
 *   `SKY_STYLES.end`）なので**薄暗いまま**になる
 *
 * という形をしている。**島の中心（原点）が必ず地面であること**が唯一の不変条件で、
 * ここが崩れると**ポータルを通った人が虚空に出て即死する**（出る場所は
 * `portaltravel.ts` の `END_ARRIVAL` で原点に固定してある）。
 *
 * 島の上には**黒曜石の柱が 10 本**立ち、その 1 本ずつの上に**エンドクリスタルが 1 個**
 * 載る（下の `PILLARS` と `CRYSTAL_SPOTS`）。**位置も高さも種に依らず固定**で、
 * ドラゴンの戦場（2-13）は誰のワールドでも同じ形になる。
 */

import { AIR, END_CRYSTAL, END_STONE, OBSIDIAN } from "./blocks";
import { CHUNK_SIZE } from "./constants";
import { Noise } from "./noise";
import type { ChunkSource } from "./world";

/**
 * 島の半径（マス）。**ふちはノイズで ±25% ほど揺れる**ので、これは目安の値。
 * Minecraft の本島（半径 55〜60）より少し小さくしてある —— この世界は
 * 描画距離が短いので、大きくすると「島の上に居る」ことが見て分からない。
 */
export const ISLAND_RADIUS = 48;

/** 島の上面のおおよその高さ。オーバーワールドの海面（40）より少し上。 */
export const ISLAND_SURFACE = 48;

/** 上面のうねりの幅（± マス）。 */
const SURFACE_WOBBLE = 3;

/**
 * 出る所を平らにしておく半径。**ここだけは上面が必ず `ISLAND_SURFACE` ちょうど**で、
 * `LANDING_RAMP` マス掛けてうねりに繋ぐ。**段差を消すためではなく、
 * 出た瞬間に崖の途中へ落ちないため。**
 */
export const LANDING_RADIUS = 5;
const LANDING_RAMP = 10;

/** 島の厚み（中心 / ふち）。**ふちも 3 マスは残すこと** —— 1 マスだと掘り抜きやすい。 */
const THICKNESS_CENTRE = 18;
const THICKNESS_EDGE = 3;

/** ノイズの粗さ（1 マスあたりの座標の刻み）。小さいほど広くうねる。 */
const EDGE_SCALE = 1 / 40;
const SURFACE_SCALE = 1 / 26;

/** ふちの揺れ幅（半径に対する割合）。 */
const EDGE_WOBBLE = 0.25;

const COLUMN_CACHE_LIMIT = 2048;

/** その列に地面が無い（虚空）ことを表す上面の値。 */
const VOID_COLUMN = -1;

// --- 黒曜石の柱 ---------------------------------------------------------

/**
 * ふちが**いちばん内側まで食い込んだときの半径**。
 *
 * `reachAt()` の揺れは `(n / 1.2) * 2 * EDGE_WOBBLE` で、`fbm2` の実効レンジが
 * ±0.6（`rules/worldgen.md`）なので `|n / 1.2| ≤ 0.5`、つまり揺れは `±EDGE_WOBBLE`。
 * **どんな種でも、この半径の内側には必ず地面がある。**
 *
 * **柱を立ててよい場所はここで決まる。** 実測した最小値（ある種で 39.1）で線を引くと、
 * 別の種で虚空に柱が浮く —— 測った値ではなく**式のほう**を根拠にすること。
 */
export const EDGE_MIN_REACH = ISLAND_RADIUS * (1 - EDGE_WOBBLE);

/** 柱の本数。**本家と同じ 10 本。** */
export const PILLAR_COUNT = 10;

/** 柱の輪の半径（島の中心から柱の中心まで）。 */
export const PILLAR_RING = 28;

/** いちばん太い柱の半径。 */
export const PILLAR_MAX_RADIUS = 3;

/**
 * 柱の高さ（島の上面から。輪を回る順）。**高い・低いを交互に並べてあること** ——
 * 順に並べると、輪がぐるりと一周する坂に見える。
 *
 * 数値は本家（上面が y76〜103。島の上面 y64 から 12〜39）をそのまま持ってきている。
 */
const PILLAR_HEIGHTS: readonly number[] = [12, 27, 15, 33, 21, 39, 18, 30, 24, 36];

/** 太い柱になる高さの境目。**本家と同じで、高い柱ほど太い。** */
const PILLAR_THICK_FROM = 27;

/** 黒曜石の柱 1 本。**上面は `top` ちょうどで平ら**（島のうねりは根元で吸収する）。 */
export interface Pillar {
  readonly x: number;
  readonly z: number;
  /** 水平の半径（マス）。`dx² + dz² ≤ radius²` の列に立つ。 */
  readonly radius: number;
  /** 島の上面（`ISLAND_SURFACE`）からの高さ。 */
  readonly height: number;
  /** 上面の絶対 y。**エンドクリスタルはこの 1 つ上に載る**（`CRYSTAL_SPOTS`）。 */
  readonly top: number;
}

/**
 * 柱の表。**種を受け取らない** —— 位置も高さも固定で、誰のワールドでも同じ戦場になる。
 *
 * **柱の並びの出どころはここ 1 か所。** 上に載せるもの（2-11b のエンドクリスタル）も
 * この表を読むこと。写して 2 か所に持つと、**柱の無い所にクリスタルが浮く**という形で
 * 静かに壊れる（しかも空中なので、下から見上げるまで気付けない）。
 */
export const PILLARS: readonly Pillar[] = PILLAR_HEIGHTS.map((height, i) => {
  const angle = (i / PILLAR_HEIGHTS.length) * Math.PI * 2;
  return {
    x: Math.round(Math.cos(angle) * PILLAR_RING),
    z: Math.round(Math.sin(angle) * PILLAR_RING),
    radius: height >= PILLAR_THICK_FROM ? PILLAR_MAX_RADIUS : 2,
    height,
    top: ISLAND_SURFACE + height,
  };
});

/** その列に柱が立っていないことを表す値。 */
export const NO_PILLAR = -1;

/** エンドクリスタルが 1 個載る場所（マスの座標）。 */
export interface CrystalSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * エンドクリスタルの居場所。**柱 1 本につき 1 個、上面のすぐ上**（柱の上は 2 マス空けてある）。
 *
 * **`PILLARS` から引いていること自体が肝心。** 座標を写して 2 か所に持つと、
 * 柱の並びを動かしたときに**柱の無い所にクリスタルが浮く**という形で静かに壊れる
 * （しかも空中なので、下から見上げるまで気付けない）。生き死にを見る側
 * （`crystals.ts`）もここを読むこと。
 */
export const CRYSTAL_SPOTS: readonly CrystalSpot[] = PILLARS.map((pillar) => ({
  x: pillar.x,
  y: pillar.top + 1,
  z: pillar.z,
}));

/** その列にクリスタルが載っていないことを表す値。 */
export const NO_CRYSTAL = -1;

/**
 * その (x, z) にクリスタルが載っていれば**その絶対 y**、無ければ `NO_CRYSTAL`。
 *
 * **柱の中心の 1 列だけ**が返る（柱は太さ 2〜3 あるが、載るのは真ん中の 1 マス）。
 * `pillarTopAt()` と同じで種を受け取らないので、島の形は知らない ——
 * 虚空に浮かないのは `blockAt()` が `VOID_COLUMN` を先に見るからで、そこだけが保険。
 */
export function crystalTopAt(wx: number, wz: number): number {
  for (const spot of CRYSTAL_SPOTS) {
    if (spot.x === wx && spot.z === wz) return spot.y;
  }
  return NO_CRYSTAL;
}

/**
 * 走査を早めに切るための帯。**`PILLAR_RING ± PILLAR_MAX_RADIUS` で決め打ちにしないこと** ——
 * 柱の中心はマスに丸めてあるので原点からの距離が `PILLAR_RING` ちょうどではなく、
 * 決め打ちにすると**柱のふちが 1 マス欠ける**（欠けた所から中が見える）。
 * 実際の中心から出しておけば、輪を動かしても帯が付いてくる。
 */
const PILLAR_NEAR = Math.min(...PILLARS.map((p) => Math.hypot(p.x, p.z) - p.radius));
const PILLAR_FAR = Math.max(...PILLARS.map((p) => Math.hypot(p.x, p.z) + p.radius));

/**
 * その (x, z) に柱が立っていれば**その柱の上面の絶対 y**、無ければ `NO_PILLAR`。
 *
 * **種を受け取らないので、島の形とは無関係に答える。** 虚空の上に浮かないのは
 * `blockAt()` が「島の無い列には何も置かない」ためで、**その 1 か所だけが保険**。
 */
export function pillarTopAt(wx: number, wz: number): number {
  const d = Math.hypot(wx, wz);
  if (d < PILLAR_NEAR || d > PILLAR_FAR) return NO_PILLAR;
  for (const pillar of PILLARS) {
    const dx = wx - pillar.x;
    const dz = wz - pillar.z;
    if (dx * dx + dz * dz <= pillar.radius * pillar.radius) return pillar.top;
  }
  return NO_PILLAR;
}

/**
 * ポータルを通って出る場所（島の中心）。**`portaltravel.ts` がここを読む。**
 *
 * **点をここに置いてあるのは、地面であることを保証しているのがこのファイルだから。**
 * 座標を掛け算で移す形（ネザーの 1:8）にすると、要塞が原点から遠いときに
 * **島の外の虚空へ出て即死する** —— エンドだけ固定の 1 点なのはそのため。
 *
 * `y` は保険（列がまだ読み込まれていないときの落としどころ）で、
 * ふだんは `landOnGround()` が実際の地面を見て決める。
 */
export const END_SPAWN = { x: 0, z: 0, y: ISLAND_SURFACE + 1 };

interface EndColumn {
  /** 16x16 の上面（この高さのマスまでが地面）。虚空の列は `VOID_COLUMN`。 */
  readonly top: Int16Array;
  /** 16x16 の下面（この高さのマスから上が地面）。 */
  readonly bottom: Int16Array;
  /** 16x16 の柱の上面（絶対 y）。柱の無い列は `NO_PILLAR`。 */
  readonly pillar: Int16Array;
  /** 16x16 のクリスタルの高さ（絶対 y）。載っていない列は `NO_CRYSTAL`。 */
  readonly crystal: Int16Array;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class EndGen implements ChunkSource {
  readonly seed: number;
  private readonly edgeNoise: Noise;
  private readonly surfaceNoise: Noise;
  private readonly columns = new Map<string, EndColumn>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    // **ふちと上面で別のノイズを引くこと。** 同じものを使うと、島が細くなった所が
    // 必ず低くなって、輪郭がそのまま等高線に見える。
    this.edgeNoise = new Noise(this.seed ^ 0x3c9a1);
    this.surfaceNoise = new Noise(this.seed ^ 0x6b7f2);
  }

  /**
   * その (x, z) で島が届いている半径。**ふちの揺れはここ 1 か所**で、
   * 島の内か外かを決めるのも上面・下面を決めるのもこの値を通す。
   */
  reachAt(wx: number, wz: number): number {
    const n = this.edgeNoise.fbm2(wx * EDGE_SCALE, wz * EDGE_SCALE, 2);
    // fbm2 の実効レンジは概ね ±0.6（`rules/worldgen.md`）。1.2 で割って ±0.5 に均す。
    return ISLAND_RADIUS * (1 + (n / 1.2) * 2 * EDGE_WOBBLE);
  }

  /**
   * その 1 マスの上面と下面。**虚空なら `top` が `VOID_COLUMN`。**
   * 列のキャッシュを通さないので、テストと計測から直に呼べる。
   */
  shapeAt(
    wx: number,
    wz: number,
  ): { top: number; bottom: number; pillar: number; crystal: number } {
    const d = Math.hypot(wx, wz);
    const reach = this.reachAt(wx, wz);
    if (d >= reach) {
      return { top: VOID_COLUMN, bottom: 0, pillar: NO_PILLAR, crystal: NO_CRYSTAL };
    }

    // 中心 1 / ふち 0。**`sqrt` で寄せる**と、ふちが崖にならずに薄く伸びる。
    const fall = Math.sqrt(clamp01(1 - d / reach));
    const thickness = Math.round(THICKNESS_EDGE + (THICKNESS_CENTRE - THICKNESS_EDGE) * fall);

    // 出る所のまわりだけ平ら。**急に切り替えると 3 マスの段差が輪になって出る**ので、
    // `LANDING_RAMP` マス掛けて 0 → 1 に上げる。
    const ramp = clamp01((d - LANDING_RADIUS) / LANDING_RAMP);
    const n = this.surfaceNoise.fbm2(wx * SURFACE_SCALE, wz * SURFACE_SCALE, 3);
    const top = ISLAND_SURFACE + Math.round((n / 1.2) * 2 * SURFACE_WOBBLE * ramp);
    return {
      top,
      bottom: top - thickness + 1,
      pillar: pillarTopAt(wx, wz),
      crystal: crystalTopAt(wx, wz),
    };
  }

  private column(cx: number, cz: number): EndColumn {
    const key = `${cx},${cz}`;
    const hit = this.columns.get(key);
    if (hit) return hit;

    const top = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const bottom = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const pillar = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const crystal = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const at = lz * CHUNK_SIZE + lx;
        const shape = this.shapeAt(wx, wz);
        top[at] = shape.top;
        bottom[at] = shape.bottom;
        pillar[at] = shape.pillar;
        crystal[at] = shape.crystal;
      }
    }

    const data: EndColumn = { top, bottom, pillar, crystal };
    if (this.columns.size >= COLUMN_CACHE_LIMIT) {
      const oldest = this.columns.keys().next().value;
      if (oldest !== undefined) this.columns.delete(oldest);
    }
    this.columns.set(key, data);
    return data;
  }

  /** チャンク 1 個分のボクセルを `data` に書き込む。 */
  generateChunk(cx: number, cy: number, cz: number, data: Uint8Array): void {
    const { top, bottom, pillar, crystal } = this.column(cx, cz);
    const baseY = cy * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const at = lz * CHUNK_SIZE + lx;
        const hi = top[at];
        const lo = bottom[at];
        const post = pillar[at];
        const gem = crystal[at];
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const index = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          data[index] = this.blockAt(baseY + ly, hi, lo, post, gem);
        }
      }
    }
  }

  /**
   * その高さに何が入るか。**この 1 本がエンドの形の全部**なので、
   * テストはここを直に呼んで断面を確かめられる（`nethergen.ts` の `blockAt` と同じ作法）。
   *
   * **岩盤を置かないこと。** 底を塞ぐと、島から落ちた人が世界の底に立ってしまい、
   * 「落ちたら死ぬ」という虚空の意味がまるごと消える。
   *
   * 柱は**島の上面から `pillar` まで**を黒曜石で埋める。**絶対の高さで止めるので
   * 上面は平ら**になり、島のうねりのぶんは根元で吸収される（＝根元に隙間ができない）。
   * **島の無い列（`VOID_COLUMN`）には何も置かない** —— 虚空に柱が浮かないのは
   * この 1 行だけが保険で、`pillarTopAt()` は島の形を知らない。
   *
   * クリスタルは**柱の上面のすぐ上に 1 マス**（`crystal`）。柱の中心の列にしか
   * 来ないので、太い柱でも上に載るのは 1 個だけになる。**壊すと `edits` に乗る**ので、
   * 一度砕けば読み込み直しても戻らない（`crystals.ts`）。
   */
  blockAt(wy: number, top: number, bottom: number, pillar: number, crystal: number): number {
    if (top === VOID_COLUMN) return AIR;
    if (wy >= bottom && wy <= top) return END_STONE;
    if (pillar !== NO_PILLAR && wy > top && wy <= pillar) return OBSIDIAN;
    if (crystal !== NO_CRYSTAL && wy === crystal) return END_CRYSTAL;
    return AIR;
  }
}
