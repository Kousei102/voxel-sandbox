/**
 * 面を積む土台。**地形（`mesher.ts`）とモブ（`mobmesh.ts`）が共有する。**
 *
 * `Builder.quad()` が**頂点の巡回順と属性構成の唯一の発行点**。
 * 写して 2 か所にすると、片方だけ裏返っても気付けない
 * （面の裏返りは「面が丸ごと消える」形でしか画面に出ない）。
 * 共有しておけば、モブの形も `test/geometry.ts` の巡回順・体積の検査にそのまま乗る。
 *
 * three にも DOM にも触らないので、丸ごとヘッドレスで検証できる。
 */

import { AMBIENT_LIGHT, LIGHT_FALLOFF, MAX_LIGHT } from "./constants";

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /**
   * 頂点ごとの明るさ 2 成分。x = スカイライト、y = ブロックライト。
   *
   * **色に掛け込まずに分けて持つのが肝心。** 最終的な明るさは描画時に
   * `max(x * 昼夜の色, y)` で決まるので、夜でも松明の周りだけは暗くならない。
   * 色に焼き込んでしまうと、この区別は時刻を変えた瞬間に失われる。
   */
  light: Float32Array;
  indices: Uint32Array;
}

/** 面の向きによる明暗。上面が最も明るく、底面が最も暗い。 */
export const FACE_SHADE = [0.74, 0.74, 1.0, 0.5, 0.86, 0.86];
/** AO 段階（0=最も暗い隅）ごとの明るさ。 */
export const AO_SHADE = [0.42, 0.62, 0.82, 1.0];
/**
 * スカイライト 0..15 ごとの明るさ。0 でも真っ暗にはせず、わずかに形が見える程度は残す。
 * この下限（AMBIENT_LIGHT）があるので、洞窟でも手探りで歩ける。
 */
export const SKY_SHADE = Array.from({ length: MAX_LIGHT + 1 }, (_, level) => {
  return AMBIENT_LIGHT + (1 - AMBIENT_LIGHT) * (level / MAX_LIGHT) ** LIGHT_FALLOFF;
});
/**
 * ブロックライト 0..15 ごとの明るさ。**こちらに下限を入れてはいけない。**
 * 描画時に max を取るので、下限を入れると光源の無い場所まで底上げされ、
 * 夜も洞窟も AMBIENT_LIGHT より暗くならなくなる。
 */
export const BLOCK_SHADE = Array.from({ length: MAX_LIGHT + 1 }, (_, level) => {
  return (level / MAX_LIGHT) ** LIGHT_FALLOFF;
});

/**
 * 面を積む先。チャンクごとに作り直すと GC を煩わせるので、
 * バッファは使い回して足りなくなったときだけ倍に伸ばす。
 */
export class Builder {
  private positions = new Float32Array(4096 * 3);
  private normals = new Float32Array(4096 * 3);
  private colors = new Float32Array(4096 * 4);
  private light = new Float32Array(4096 * 2);
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
    const light = new Float32Array(next * 2);
    const indices = new Uint32Array((next / 4) * 6);
    positions.set(this.positions);
    normals.set(this.normals);
    colors.set(this.colors);
    light.set(this.light);
    indices.set(this.indices);
    this.positions = positions;
    this.normals = normals;
    this.colors = colors;
    this.light = light;
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
    sky: number[],
    block: number[],
  ): void {
    if (this.vertices + 4 > this.positions.length / 3) this.grow();

    const base = this.vertices;
    const verts = [v0, v1, v2, v3];
    for (let i = 0; i < 4; i++) {
      const p = verts[i];
      const v3i = (base + i) * 3;
      const v4i = (base + i) * 4;
      const v2i = (base + i) * 2;
      this.positions[v3i] = p[0];
      this.positions[v3i + 1] = p[1];
      this.positions[v3i + 2] = p[2];
      this.normals[v3i] = nx;
      this.normals[v3i + 1] = ny;
      this.normals[v3i + 2] = nz;
      // 色には「向きによる明暗 x AO」だけを焼き、光量は light 側へ回す
      const tone = shade * AO_SHADE[ao[i]];
      this.colors[v4i] = rgb[0] * tone;
      this.colors[v4i + 1] = rgb[1] * tone;
      this.colors[v4i + 2] = rgb[2] * tone;
      this.colors[v4i + 3] = alpha;
      this.light[v2i] = SKY_SHADE[sky[i]];
      this.light[v2i + 1] = BLOCK_SHADE[block[i]];
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
      light: this.light.slice(0, this.vertices * 2),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}
