import { AIR, BLOCKS, faceColor, isOpaque, isTranslucent } from "./blocks";
import { AMBIENT_LIGHT, CHUNK_SIZE, LIGHT_FALLOFF, MAX_LIGHT } from "./constants";

/** メッシュ化は隣接チャンクのボクセルも要るので、周囲 1 ブロックを含む 18^3 の箱で受け取る。 */
export const PAD = 1;
export const PAD_SIZE = CHUNK_SIZE + PAD * 2;
export const PAD_VOLUME = PAD_SIZE * PAD_SIZE * PAD_SIZE;

/** x,y,z は -1..16。 */
export function padIndex(x: number, y: number, z: number): number {
  return ((y + PAD) * PAD_SIZE + (z + PAD)) * PAD_SIZE + (x + PAD);
}

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshData {
  opaque: MeshArrays | null;
  translucent: MeshArrays | null;
}

/** 面の向きによる明暗。上面が最も明るく、底面が最も暗い。 */
const FACE_SHADE = [0.74, 0.74, 1.0, 0.5, 0.86, 0.86];
/** AO 段階（0=最も暗い隅）ごとの明るさ。 */
const AO_SHADE = [0.42, 0.62, 0.82, 1.0];
/** 光量 0..15 ごとの明るさ。0 でも真っ暗にはせず、わずかに形が見える程度は残す。 */
const LIGHT_SHADE = Array.from({ length: MAX_LIGHT + 1 }, (_, level) => {
  return AMBIENT_LIGHT + (1 - AMBIENT_LIGHT) * (level / MAX_LIGHT) ** LIGHT_FALLOFF;
});

/**
 * 面を積む先。チャンクごとに作り直すと GC を煩わせるので、
 * バッファは使い回して足りなくなったときだけ倍に伸ばす。
 */
class Builder {
  private positions = new Float32Array(4096 * 3);
  private normals = new Float32Array(4096 * 3);
  private colors = new Float32Array(4096 * 4);
  private indices = new Uint32Array(6144);
  private vertices = 0;
  private indexCount = 0;

  reset(): void {
    this.vertices = 0;
    this.indexCount = 0;
  }

  private grow(): void {
    const capacity = this.positions.length / 3;
    const next = capacity * 2;
    const positions = new Float32Array(next * 3);
    const normals = new Float32Array(next * 3);
    const colors = new Float32Array(next * 4);
    const indices = new Uint32Array((next / 4) * 6);
    positions.set(this.positions);
    normals.set(this.normals);
    colors.set(this.colors);
    indices.set(this.indices);
    this.positions = positions;
    this.normals = normals;
    this.colors = colors;
    this.indices = indices;
  }

  quad(
    v0: number[],
    v1: number[],
    v2: number[],
    v3: number[],
    nx: number,
    ny: number,
    nz: number,
    rgb: Float32Array,
    alpha: number,
    shade: number,
    ao: number[],
    lit: number[],
  ): void {
    if (this.vertices + 4 > this.positions.length / 3) this.grow();

    const base = this.vertices;
    const verts = [v0, v1, v2, v3];
    for (let i = 0; i < 4; i++) {
      const p = verts[i];
      const v3i = (base + i) * 3;
      const v4i = (base + i) * 4;
      this.positions[v3i] = p[0];
      this.positions[v3i + 1] = p[1];
      this.positions[v3i + 2] = p[2];
      this.normals[v3i] = nx;
      this.normals[v3i + 1] = ny;
      this.normals[v3i + 2] = nz;
      const light = shade * AO_SHADE[ao[i]] * LIGHT_SHADE[lit[i]];
      this.colors[v4i] = rgb[0] * light;
      this.colors[v4i + 1] = rgb[1] * light;
      this.colors[v4i + 2] = rgb[2] * light;
      this.colors[v4i + 3] = alpha;
    }
    this.vertices += 4;

    const i = this.indexCount;
    // 法線の向きで裏表が決まるので、+側と -側で頂点の巡回順を逆にする
    if (nx + ny + nz > 0) {
      this.indices[i] = base;
      this.indices[i + 1] = base + 1;
      this.indices[i + 2] = base + 2;
      this.indices[i + 3] = base;
      this.indices[i + 4] = base + 2;
      this.indices[i + 5] = base + 3;
    } else {
      this.indices[i] = base;
      this.indices[i + 1] = base + 2;
      this.indices[i + 2] = base + 1;
      this.indices[i + 3] = base;
      this.indices[i + 4] = base + 3;
      this.indices[i + 5] = base + 2;
    }
    this.indexCount += 6;
  }

  toArrays(): MeshArrays | null {
    if (this.indexCount === 0) return null;
    return {
      positions: this.positions.slice(0, this.vertices * 3),
      normals: this.normals.slice(0, this.vertices * 3),
      colors: this.colors.slice(0, this.vertices * 4),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}

const opaqueBuilder = new Builder();
const translucentBuilder = new Builder();

/**
 * greedy meshing。3 軸それぞれについてスライスごとの面マスクを作り、
 * 同一の面（ブロック・向き・AO がすべて一致）を長方形に統合する。
 */
export function buildChunkMesh(pad: Uint8Array, lightPad: Uint8Array): ChunkMeshData {
  const opaque = opaqueBuilder;
  const translucent = translucentBuilder;
  opaque.reset();
  translucent.reset();
  const rgb = new Float32Array(3);
  const ao = [0, 0, 0, 0];
  const lit = [0, 0, 0, 0];

  const get = (x: number, y: number, z: number) => pad[padIndex(x, y, z)];
  const solid = (x: number, y: number, z: number) => (isOpaque(get(x, y, z)) ? 1 : 0);

  // マスク: 0 = 面なし。それ以外は blockId | dir<<6 | ao*<<8 | light*<<15 の詰め込み。
  const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  const x = [0, 0, 0];
  const q = [0, 0, 0];
  const du = [0, 0, 0];
  const dv = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    q[0] = q[1] = q[2] = 0;
    q[d] = 1;

    for (x[d] = -1; x[d] < CHUNK_SIZE; ) {
      let n = 0;
      for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
        for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++, n++) {
          const a = get(x[0], x[1], x[2]);
          const b = get(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          const inA = x[d] >= 0;
          const inB = x[d] < CHUNK_SIZE - 1;

          // a 側から見て面が要るか（b が不透明なら隠れる。同じ半透明同士も隠す）
          if (inA && a !== AIR && !isOpaque(b) && b !== a) {
            faceCorners(lightPad, solid, x, q, 1, u, v, ao, lit);
            mask[n] = encodeFace(a, 1, ao, lit);
          } else if (inB && b !== AIR && !isOpaque(a) && a !== b) {
            faceCorners(lightPad, solid, x, q, -1, u, v, ao, lit);
            mask[n] = encodeFace(b, -1, ao, lit);
          } else {
            mask[n] = 0;
          }
        }
      }

      x[d]++;

      // マスクを長方形に統合して面を吐く
      n = 0;
      for (let j = 0; j < CHUNK_SIZE; j++) {
        for (let i = 0; i < CHUNK_SIZE; ) {
          const value = mask[n];
          if (value === 0) {
            i++;
            n++;
            continue;
          }

          let w = 1;
          while (i + w < CHUNK_SIZE && mask[n + w] === value) w++;

          let h = 1;
          outer: while (j + h < CHUNK_SIZE) {
            const row = n + h * CHUNK_SIZE;
            for (let k = 0; k < w; k++) {
              if (mask[row + k] !== value) break outer;
            }
            h++;
          }

          const id = value & 0x3f;
          const dir = (value >> 6) & 1 ? -1 : 1;
          ao[0] = (value >> 7) & 3;
          ao[1] = (value >> 9) & 3;
          ao[2] = (value >> 11) & 3;
          ao[3] = (value >> 13) & 3;
          lit[0] = (value >> 15) & 15;
          lit[1] = (value >> 19) & 15;
          lit[2] = (value >> 23) & 15;
          lit[3] = (value >> 27) & 15;

          x[u] = i;
          x[v] = j;
          du[0] = du[1] = du[2] = 0;
          dv[0] = dv[1] = dv[2] = 0;
          du[u] = w;
          dv[v] = h;

          const face = d * 2 + (dir > 0 ? 0 : 1);
          faceColor(id, face, rgb);
          const def = BLOCKS[id];
          const target = isTranslucent(id) ? translucent : opaque;
          target.quad(
            [x[0], x[1], x[2]],
            [x[0] + du[0], x[1] + du[1], x[2] + du[2]],
            [x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]],
            [x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]],
            q[0] * dir,
            q[1] * dir,
            q[2] * dir,
            rgb,
            def.alpha,
            FACE_SHADE[face],
            ao,
            lit,
          );

          for (let jj = 0; jj < h; jj++) {
            for (let ii = 0; ii < w; ii++) {
              mask[n + jj * CHUNK_SIZE + ii] = 0;
            }
          }

          i += w;
          n += w;
        }
      }
    }
  }

  return { opaque: opaque.toArrays(), translucent: translucent.toArrays() };
}

/**
 * 面の情報を 1 つの整数に詰める。ここが完全に一致する面だけが greedy に統合される。
 * ビット配置: id 0-5 / 向き 6 / AO 7-14 (2bit x4) / 光量 15-30 (4bit x4)。
 */
function encodeFace(id: number, dir: number, ao: number[], lit: number[]): number {
  return (
    (id & 0x3f) |
    (dir < 0 ? 1 << 6 : 0) |
    (ao[0] << 7) |
    (ao[1] << 9) |
    (ao[2] << 11) |
    (ao[3] << 13) |
    (lit[0] << 15) |
    (lit[1] << 19) |
    (lit[2] << 23) |
    (lit[3] << 27)
  );
}

/**
 * 面の 4 隅の AO と光量を求める。
 *
 * どちらも「面の外側に接する 4 マス」を見る。AO はそのうち 3 マス（辺 2 つと角 1 つ）が
 * 埋まっているかで 0..3 の遮蔽段階を決め、光量は 4 マスのうち光が届くものの平均をとる。
 * 隅ごとに平均するので、洞窟の入口では光が滑らかに減衰して見える。
 */
function faceCorners(
  lightPad: Uint8Array,
  solid: (x: number, y: number, z: number) => number,
  x: number[],
  q: number[],
  dir: number,
  u: number,
  v: number,
  ao: number[],
  lit: number[],
): void {
  // 面を持つ側のボクセル
  const p = [x[0], x[1], x[2]];
  if (dir < 0) {
    p[0] += q[0];
    p[1] += q[1];
    p[2] += q[2];
  }
  // 面の外側へ 1 つ出た位置
  const nx = p[0] + q[0] * dir;
  const ny = p[1] + q[1] * dir;
  const nz = p[2] + q[2] * dir;

  const uo = [0, 0, 0];
  const vo = [0, 0, 0];
  uo[u] = 1;
  vo[v] = 1;

  const faceLight = lightPad[padIndex(nx, ny, nz)];

  for (let c = 0; c < 4; c++) {
    const su = c === 0 || c === 3 ? -1 : 1;
    const sv = c === 0 || c === 1 ? -1 : 1;

    const sx = nx + uo[0] * su;
    const sy = ny + uo[1] * su;
    const sz = nz + uo[2] * su;
    const tx = nx + vo[0] * sv;
    const ty = ny + vo[1] * sv;
    const tz = nz + vo[2] * sv;
    const cx = sx + vo[0] * sv;
    const cy = sy + vo[1] * sv;
    const cz = sz + vo[2] * sv;

    const side1 = solid(sx, sy, sz);
    const side2 = solid(tx, ty, tz);
    // 辺が両側とも塞がっていれば角は見えない
    const corner = side1 && side2 ? 1 : solid(cx, cy, cz);
    ao[c] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);

    // 光は塞がっていないマスからしか来ない
    let sum = faceLight;
    let count = 1;
    if (!side1) {
      sum += lightPad[padIndex(sx, sy, sz)];
      count++;
    }
    if (!side2) {
      sum += lightPad[padIndex(tx, ty, tz)];
      count++;
    }
    if (!corner) {
      sum += lightPad[padIndex(cx, cy, cz)];
      count++;
    }
    lit[c] = Math.round(sum / count);
  }
}
