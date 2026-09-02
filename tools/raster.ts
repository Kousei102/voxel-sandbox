/**
 * **GPU 無しで three の `Scene` を絵にする**（CPU ラスタライザ）。
 *
 * この環境では WebGL コンテキストを作れない（`CLAUDE.md`）。だが詰まっているのは
 * 「three が GPU に描かせる」ところだけで、**`Scene` / `BufferGeometry` / 行列は
 * Node でそのまま動く**（`rules/testing.md`）。だから頂点を自分で三角形に塗れば、
 * ブラウザも GPU も要らずに見た目を確かめられる。
 *
 * **ここに判断を 1 行も書かないこと。** 塗るのは `mesher.ts` / `mobmesh.ts` が積んだ
 * `MeshArrays` そのもので、色も光も向きも全部あちらが決めている。ここは
 * `view.ts` と同じ「映すための器」で、**WebGLRenderer の代わり**でしかない。
 *
 * 再現しているのは `terrainshader.ts` の合成 3 行と同じ式:
 *   色 = 頂点カラー x マテリアルの色 x max(スカイ x 昼夜の色, ブロックライト)
 * **ここを勝手に足し引きしないこと** —— ずれた時点で、この絵はブラウザの絵ではなくなる。
 *
 * 再現していないもの（絵に出ないので、そこはブラウザで見てもらうしかない）:
 * `sky.ts` の天球 GLSL（下地の 2 色グラデーションで代用）/ フォグ /
 * near 平面をまたぐ三角形（丸ごと捨てる。カメラを壁に埋めないこと）。
 */

import { deflateSync } from "node:zlib";
import { Color, DoubleSide, Matrix4, Mesh, type Camera, type Object3D } from "three";
import { LIGHT_ATTRIBUTE } from "../src/terrainshader";

export interface RenderOptions {
  readonly width: number;
  readonly height: number;
  /** 昼夜の色。`DayNight.tint` をそのまま渡す（シェーダの `uDaylight` と同じもの）。 */
  readonly daylight: Color;
  /** 下地の色（上端・下端）。`DayNight` の `zenith` / `horizon` を渡す。 */
  readonly zenith: Color;
  readonly horizon: Color;
}

interface Draw {
  readonly mesh: Mesh;
  /** ビュー空間での代表の深さ（半透明の並べ替えに使う）。 */
  readonly depth: number;
}

/** PNG の CRC 表。1 度だけ作る。 */
const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = 0xffffffff;
  for (const b of body) crc = CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, tail]);
}

/** RGB 8bit の画素を PNG に。外部の依存を足さないよう自前で組む（`node:zlib` だけ）。 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // フィルタ種別 0（無し）
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8bit
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 隠れている親の下は丸ごと飛ばす（`traverse` は `visible` を見ない）。 */
function collect(root: Object3D, camera: Camera, out: Draw[]): void {
  if (!root.visible) return;
  if (root instanceof Mesh && root.geometry.getAttribute("position") && root.geometry.getIndex()) {
    const sphere = root.geometry.boundingSphere;
    const z = sphere
      ? -sphere.center.clone().applyMatrix4(root.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z
      : 0;
    out.push({ mesh: root, depth: z });
  }
  for (const child of root.children) collect(child, camera, out);
}

/**
 * `Scene` を RGB 8bit の画素に。**返るのは幅 x 高さ x 3 の並び**（`encodePng` にそのまま渡せる）。
 *
 * 不透明を先に z バッファつきで塗り、半透明は**奥から手前へ並べ替えて** z を書かずに混ぜる
 * （`world.ts` の `translucentMaterial` が `depthWrite: false` なのと同じ理由）。
 */
export function render(scene: Object3D, camera: Camera, opts: RenderOptions): Uint8Array {
  const { width: W, height: H } = opts;
  const color = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);

  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      color[o] = opts.zenith.r + (opts.horizon.r - opts.zenith.r) * t;
      color[o + 1] = opts.zenith.g + (opts.horizon.g - opts.zenith.g) * t;
      color[o + 2] = opts.zenith.b + (opts.horizon.b - opts.zenith.b) * t;
    }
  }

  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  const draws: Draw[] = [];
  collect(scene, camera, draws);

  const mvp = new Matrix4();
  const sx = [0, 0, 0];
  const sy = [0, 0, 0];
  const sz = [0, 0, 0];
  const iw = [0, 0, 0];
  let triangles = 0;
  let filled = 0;

  const opaque = draws.filter((d) => !materialOf(d.mesh).transparent);
  // 半透明は奥から。**メッシュ単位で足りる**（水面は 1 チャンクに 1 枚の板でしかない）。
  const clear = draws.filter((d) => materialOf(d.mesh).transparent).sort((a, b) => b.depth - a.depth);

  for (const draw of [...opaque, ...clear]) {
    const { mesh } = draw;
    const material = materialOf(mesh);
    const blend = material.transparent === true;
    const both = material.side === DoubleSide;
    const tint = material.color ?? WHITE;
    const opacity = material.opacity ?? 1;
    const g = mesh.geometry;
    const pos = g.getAttribute("position")!;
    const col = g.getAttribute("color");
    const lit = g.getAttribute(LIGHT_ATTRIBUTE);
    const idx = g.getIndex()!;

    mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    const e = mvp.elements;

    for (let t = 0; t < idx.count; t += 3) {
      triangles++;
      const i0 = idx.getX(t);
      const i1 = idx.getX(t + 1);
      const i2 = idx.getX(t + 2);
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const i = k === 0 ? i0 : k === 1 ? i1 : i2;
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        // near 平面をまたぐ三角形は切らずに捨てる（切ると、この器に判断が増える）。
        if (w <= 1e-3) {
          ok = false;
          break;
        }
        sx[k] = (((e[0] * x + e[4] * y + e[8] * z + e[12]) / w) * 0.5 + 0.5) * W;
        sy[k] = (1 - ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * 0.5 - 0.5) * H;
        sz[k] = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w;
        iw[k] = 1 / w;
      }
      if (!ok) continue;

      // 裏面カリング。three の既定は FrontSide で表は CCW、y を上下反転しているので符号も逆。
      const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
      if (area === 0 || (!both && area >= 0)) continue;
      filled++;

      const minX = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2])));
      const minY = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const fx = px + 0.5;
          const fy = py + 0.5;
          const b0 = ((sx[1] - fx) * (sy[2] - fy) - (sx[2] - fx) * (sy[1] - fy)) / area;
          const b1 = ((sx[2] - fx) * (sy[0] - fy) - (sx[0] - fx) * (sy[2] - fy)) / area;
          const b2 = 1 - b0 - b1;
          if (b0 < 0 || b1 < 0 || b2 < 0) continue;

          // 深さは ndc の z。**すでに w で割ってあるので画面上で線形**（そのまま補間できる）。
          const z = b0 * sz[0] + b1 * sz[1] + b2 * sz[2];
          const o = py * W + px;
          if (z >= depth[o]) continue;
          if (!blend) depth[o] = z;

          // 色と光は遠近を入れて補間する（greedy で 16 マスに伸びた面は、affine だと歪む）。
          const q0 = b0 * iw[0];
          const q1 = b1 * iw[1];
          const q2 = b2 * iw[2];
          const qs = q0 + q1 + q2;
          let r = tint.r;
          let gg = tint.g;
          let bb = tint.b;
          let a = opacity;
          if (col) {
            r *= (q0 * col.getX(i0) + q1 * col.getX(i1) + q2 * col.getX(i2)) / qs;
            gg *= (q0 * col.getY(i0) + q1 * col.getY(i1) + q2 * col.getY(i2)) / qs;
            bb *= (q0 * col.getZ(i0) + q1 * col.getZ(i1) + q2 * col.getZ(i2)) / qs;
            // 頂点カラーは itemSize 4（RGBA）。水とガラスの薄さはここに乗っている。
            if (col.itemSize === 4) a *= (q0 * col.getW(i0) + q1 * col.getW(i1) + q2 * col.getW(i2)) / qs;
          }
          if (lit) {
            const s = (q0 * lit.getX(i0) + q1 * lit.getX(i1) + q2 * lit.getX(i2)) / qs;
            const bl = (q0 * lit.getY(i0) + q1 * lit.getY(i1) + q2 * lit.getY(i2)) / qs;
            // terrainshader.ts の 1 行と同じ式。**片方だけに掛けないこと。**
            r *= Math.max(s * opts.daylight.r, bl);
            gg *= Math.max(s * opts.daylight.g, bl);
            bb *= Math.max(s * opts.daylight.b, bl);
          }

          const p = o * 3;
          if (blend && a < 1) {
            color[p] += (r - color[p]) * a;
            color[p + 1] += (gg - color[p + 1]) * a;
            color[p + 2] += (bb - color[p + 2]) * a;
          } else {
            color[p] = r;
            color[p + 1] = gg;
            color[p + 2] = bb;
          }
        }
      }
    }
  }

  lastStats = { meshes: draws.length, triangles, filled };
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(color[i] * 255)));
  return out;
}

const WHITE = new Color(1, 1, 1);

interface BasicMaterial {
  transparent?: boolean;
  opacity?: number;
  side?: number;
  color?: Color;
}

function materialOf(mesh: Mesh): BasicMaterial {
  return (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as BasicMaterial;
}

export interface RenderStats {
  readonly meshes: number;
  readonly triangles: number;
  /** 実際に塗った三角形（裏面カリングと near 落ちのあと）。 */
  readonly filled: number;
}

let lastStats: RenderStats = { meshes: 0, triangles: 0, filled: 0 };

/** 直前の `render()` の数え。**「真っ黒だが三角形は出ている」を切り分けるための足場。** */
export function stats(): RenderStats {
  return lastStats;
}
