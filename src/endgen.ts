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
 */

import { AIR, END_STONE } from "./blocks";
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
  shapeAt(wx: number, wz: number): { top: number; bottom: number } {
    const d = Math.hypot(wx, wz);
    const reach = this.reachAt(wx, wz);
    if (d >= reach) return { top: VOID_COLUMN, bottom: 0 };

    // 中心 1 / ふち 0。**`sqrt` で寄せる**と、ふちが崖にならずに薄く伸びる。
    const fall = Math.sqrt(clamp01(1 - d / reach));
    const thickness = Math.round(THICKNESS_EDGE + (THICKNESS_CENTRE - THICKNESS_EDGE) * fall);

    // 出る所のまわりだけ平ら。**急に切り替えると 3 マスの段差が輪になって出る**ので、
    // `LANDING_RAMP` マス掛けて 0 → 1 に上げる。
    const ramp = clamp01((d - LANDING_RADIUS) / LANDING_RAMP);
    const n = this.surfaceNoise.fbm2(wx * SURFACE_SCALE, wz * SURFACE_SCALE, 3);
    const top = ISLAND_SURFACE + Math.round((n / 1.2) * 2 * SURFACE_WOBBLE * ramp);
    return { top, bottom: top - thickness + 1 };
  }

  private column(cx: number, cz: number): EndColumn {
    const key = `${cx},${cz}`;
    const hit = this.columns.get(key);
    if (hit) return hit;

    const top = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const bottom = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const at = lz * CHUNK_SIZE + lx;
        const shape = this.shapeAt(wx, wz);
        top[at] = shape.top;
        bottom[at] = shape.bottom;
      }
    }

    const data: EndColumn = { top, bottom };
    if (this.columns.size >= COLUMN_CACHE_LIMIT) {
      const oldest = this.columns.keys().next().value;
      if (oldest !== undefined) this.columns.delete(oldest);
    }
    this.columns.set(key, data);
    return data;
  }

  /** チャンク 1 個分のボクセルを `data` に書き込む。 */
  generateChunk(cx: number, cy: number, cz: number, data: Uint8Array): void {
    const { top, bottom } = this.column(cx, cz);
    const baseY = cy * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const at = lz * CHUNK_SIZE + lx;
        const hi = top[at];
        const lo = bottom[at];
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const index = (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          data[index] = this.blockAt(baseY + ly, hi, lo);
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
   */
  blockAt(wy: number, top: number, bottom: number): number {
    if (top === VOID_COLUMN) return AIR;
    return wy >= bottom && wy <= top ? END_STONE : AIR;
  }
}
