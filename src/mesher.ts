import {
  AIR,
  FACE_YN,
  FACE_YP,
  FACE_XP,
  FACE_ZP,
  blockDef,
  blockModel,
  faceColor,
  isOpaque,
  isProp,
  isTranslucent,
  supportFace,
} from "./blocks";
import { CHUNK_SIZE, MAX_LIGHT } from "./constants";
import { Builder, FACE_SHADE, type MeshArrays } from "./meshbuild";

export type { MeshArrays } from "./meshbuild";

/** メッシュ化は隣接チャンクのボクセルも要るので、周囲 1 ブロックを含む 18^3 の箱で受け取る。 */
export const PAD = 1;
export const PAD_SIZE = CHUNK_SIZE + PAD * 2;
export const PAD_VOLUME = PAD_SIZE * PAD_SIZE * PAD_SIZE;

/** x,y,z は -1..16。 */
export function padIndex(x: number, y: number, z: number): number {
  return ((y + PAD) * PAD_SIZE + (z + PAD)) * PAD_SIZE + (x + PAD);
}

export interface ChunkMeshData {
  opaque: MeshArrays | null;
  translucent: MeshArrays | null;
}

/** 草（`model: "cross"`）の明暗。板の向きによらず一定にする。 */
const CROSS_SHADE = FACE_SHADE[FACE_YP];

/** 立方体でないブロックの寸法（1 ブロック = 1.0）。[x0,y0,z0,x1,y1,z1]。 */
const TORCH_POST = [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625];
const TORCH_FLAME = [0.40625, 0.5625, 0.40625, 0.59375, 0.75, 0.59375];

/**
 * 壁掛けの柄。壁からの距離 d と高さ y の組 `[d0, y0, d1, y1]` で、
 * **少しずつ迫り出しながら上がる階段**として斜めを近似している。
 *
 * 本物の斜めにすると箱が平行六面体になり、法線が軸に平行でなくなる。
 * ここの法線は描画には使わない（陰影は焼き込み済み）が、
 * 「頂点の巡回順と法線が一致するか」というテストの土台が崩れるので、
 * 軸に平行な箱だけで組んでいる。松明の大きさなら段差は目立たない。
 */
const WALL_TORCH_POST: readonly (readonly number[])[] = [
  [0, 0.1875, 0.1875, 0.4375],
  [0.125, 0.3125, 0.3125, 0.5625],
  [0.25, 0.4375, 0.4375, 0.6875],
];
const WALL_TORCH_POST_HALF = 0.0625;
/** 炎は柄のいちばん上に載る。 */
const WALL_TORCH_FLAME = [0.25, 0.625, 0.4375, 0.78125];
const WALL_TORCH_FLAME_HALF = 0.09375;

const opaqueBuilder = new Builder();
const translucentBuilder = new Builder();

// スライス 1 枚ぶんの面マスク。チャンクごとに確保すると、その GC が
// そのままフレームの最悪値に出るので使い回す（buildChunkMesh は再入しない）。
const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
const maskBlock = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);

/**
 * greedy meshing。3 軸それぞれについてスライスごとの面マスクを作り、
 * 同一の面（ブロック・向き・AO・光量がすべて一致）を長方形に統合する。
 *
 * 統合キーは合計 49 ビットあって Int32 1 本には収まらないので、
 * マスクを 2 枚に分けて**両方が一致したときだけ**統合する
 * （1 枚目 = id 8 + 向き 1 + スカイ 16、2 枚目 = ブロックライト 16 + AO 8）。
 */
export function buildChunkMesh(
  pad: Uint8Array,
  skyPad: Uint8Array,
  blockPad: Uint8Array,
): ChunkMeshData {
  const opaque = opaqueBuilder;
  const translucent = translucentBuilder;
  opaque.reset();
  translucent.reset();
  const rgb = new Float32Array(3);
  const ao = [0, 0, 0, 0];
  const sky = [0, 0, 0, 0];
  const block = [0, 0, 0, 0];

  const get = (x: number, y: number, z: number) => pad[padIndex(x, y, z)];
  const solid = (x: number, y: number, z: number) => (isOpaque(get(x, y, z)) ? 1 : 0);

  // 松明が届いていないチャンクが大多数なので、まとめて判定して 4 隅の平均を丸ごと省く。
  // 18^3 の線形走査は面の処理に比べれば無視できる。
  let anyBlockLight = false;
  for (let i = 0; i < PAD_VOLUME; i++) {
    if (blockPad[i] !== 0) {
      anyBlockLight = true;
      break;
    }
  }

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
          // 立方体でないブロックは専用パスが描くので、ここでは面を作らない
          if (inA && a !== AIR && !isProp(a) && !isOpaque(b) && b !== a) {
            faceCorners(skyPad, blockPad, anyBlockLight, solid, x, q, 1, u, v, ao, sky, block);
            mask[n] = encodeFace(a, 1, sky);
            maskBlock[n] = encodeLight(block, ao);
          } else if (inB && b !== AIR && !isProp(b) && !isOpaque(a) && a !== b) {
            faceCorners(skyPad, blockPad, anyBlockLight, solid, x, q, -1, u, v, ao, sky, block);
            mask[n] = encodeFace(b, -1, sky);
            maskBlock[n] = encodeLight(block, ao);
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
          const lightValue = maskBlock[n];

          let w = 1;
          while (i + w < CHUNK_SIZE && mask[n + w] === value && maskBlock[n + w] === lightValue) w++;

          let h = 1;
          outer: while (j + h < CHUNK_SIZE) {
            const row = n + h * CHUNK_SIZE;
            for (let k = 0; k < w; k++) {
              if (mask[row + k] !== value || maskBlock[row + k] !== lightValue) break outer;
            }
            h++;
          }

          const id = value & 0xff;
          const dir = (value >> 8) & 1 ? -1 : 1;
          sky[0] = (value >> 9) & 15;
          sky[1] = (value >> 13) & 15;
          sky[2] = (value >> 17) & 15;
          sky[3] = (value >> 21) & 15;
          block[0] = lightValue & 15;
          block[1] = (lightValue >> 4) & 15;
          block[2] = (lightValue >> 8) & 15;
          block[3] = (lightValue >> 12) & 15;
          ao[0] = (lightValue >> 16) & 3;
          ao[1] = (lightValue >> 18) & 3;
          ao[2] = (lightValue >> 20) & 3;
          ao[3] = (lightValue >> 22) & 3;

          x[u] = i;
          x[v] = j;
          du[0] = du[1] = du[2] = 0;
          dv[0] = dv[1] = dv[2] = 0;
          du[u] = w;
          dv[v] = h;

          const face = d * 2 + (dir > 0 ? 0 : 1);
          faceColor(id, face, rgb);
          const def = blockDef(id);
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
            sky,
            block,
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

  buildProps(pad, skyPad, blockPad, opaque);

  return { opaque: opaque.toArrays(), translucent: translucent.toArrays() };
}

/**
 * 立方体でないブロックを描く。greedy meshing とは無関係に、1 個ずつ箱を積むだけ。
 *
 * 数は少ない（松明くらい）ので、統合も AO も省いている。ここに増やしていけば
 * ハーフブロックや草のような形も同じ枠組みで足せる。
 */
function buildProps(
  pad: Uint8Array,
  skyPad: Uint8Array,
  blockPad: Uint8Array,
  builder: Builder,
): void {
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const at = padIndex(x, y, z);
        const id = pad[at];
        if (id === AIR || !isProp(id)) continue;
        const sky = skyPad[at];
        const block = blockPad[at];

        // model を増やしたらここに分岐を足すこと。当てはまらないものは描かない
        // （既定でどれかの形にすると、間違いが「別の物が生える」形で出る）。
        switch (blockModel(id)) {
          case "torch": {
            // 柄（側面の色）と、その上に載る炎（上面の色）。炎は光源そのものなので常に最大。
            const wall = supportFace(id);
            if (wall === FACE_YN) {
              box(builder, x, y, z, TORCH_POST, id, FACE_XP, sky, block);
              box(builder, x, y, z, TORCH_FLAME, id, FACE_YP, sky, MAX_LIGHT);
            } else {
              for (const segment of WALL_TORCH_POST) {
                wallBox(wallShape, wall, segment, WALL_TORCH_POST_HALF);
                box(builder, x, y, z, wallShape, id, FACE_XP, sky, block);
              }
              wallBox(wallShape, wall, WALL_TORCH_FLAME, WALL_TORCH_FLAME_HALF);
              box(builder, x, y, z, wallShape, id, FACE_YP, sky, MAX_LIGHT);
            }
            break;
          }
          case "boxes":
            // ハーフ・階段・サボテン。当たり判定と同じ箱をそのまま積む。
            // 面ごとの色は立方体と同じ引き方（上面は top、側面は side）。
            for (const shape of blockDef(id).boxes) {
              box(builder, x, y, z, shape, id, -1, sky, block);
            }
            break;
          case "cross":
            // 草。大きさは狙う判定と同じ箱から引く（形を 2 か所に書かない）。
            cross(builder, x, y, z, blockDef(id).boxes[0], id, sky, block);
            break;
          default:
            break;
        }
      }
    }
  }
}

const wallShape = [0, 0, 0, 0, 0, 0];

/**
 * 壁からの距離と高さで書いた形 `[d0, y0, d1, y1]` を、実際のブロック内の箱に直す。
 *
 * `wall` は**支えのある側**の面番号。壁が + 側にあるときは、距離が増えるほど
 * 座標は小さくなる（松明は - 側へ張り出す）ので、そこを反転する。
 * 横幅は中央から `half` ずつ。
 */
function wallBox(out: number[], wall: number, shape: readonly number[], half: number): void {
  const axis = wall < FACE_YP ? 0 : 2; // 壁が X 面なら X 方向へ、Z 面なら Z 方向へ伸びる
  const lateral = axis === 0 ? 2 : 0;
  const away = wall === FACE_XP || wall === FACE_ZP;
  out[axis] = away ? 1 - shape[2] : shape[0];
  out[axis + 3] = away ? 1 - shape[0] : shape[2];
  out[lateral] = 0.5 - half;
  out[lateral + 3] = 0.5 + half;
  out[1] = shape[1];
  out[4] = shape[3];
}

const boxAo = [3, 3, 3, 3];
const boxRgb = new Float32Array(3);
const boxSky = [0, 0, 0, 0];
const boxBlock = [0, 0, 0, 0];
const boxMin = [0, 0, 0];
const boxMax = [0, 0, 0];
/** faceCorners が使う u/v 方向の単位ベクトル。面ごとに確保しないよう持ち回す。 */
const uo = [0, 0, 0];
const vo = [0, 0, 0];

/**
 * 箱 1 個を 6 面ぶん積む。頂点の並べ方は greedy 側とまったく同じ
 * （u が増える向き → v が増える向き）にして、巡回順の規約を 1 か所に保つ。
 *
 * `fixedFace` に面番号を渡すと 6 面ともその色で塗る（松明の柄・炎）。
 * -1 なら立方体と同じで面ごとの色を引く（サボテン）。
 */
function box(
  builder: Builder,
  ox: number,
  oy: number,
  oz: number,
  size: readonly number[],
  id: number,
  fixedFace: number,
  sky: number,
  block: number,
): void {
  boxMin[0] = ox + size[0];
  boxMin[1] = oy + size[1];
  boxMin[2] = oz + size[2];
  boxMax[0] = ox + size[3];
  boxMax[1] = oy + size[4];
  boxMax[2] = oz + size[5];
  for (let i = 0; i < 4; i++) {
    boxSky[i] = sky;
    boxBlock[i] = block;
  }

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (const dir of [1, -1]) {
      const plane = dir > 0 ? boxMax[d] : boxMin[d];
      const corner = (su: number, sv: number): number[] => {
        const p = [0, 0, 0];
        p[d] = plane;
        p[u] = su ? boxMax[u] : boxMin[u];
        p[v] = sv ? boxMax[v] : boxMin[v];
        return p;
      };
      const normal = [0, 0, 0];
      normal[d] = dir;
      const face = d * 2 + (dir > 0 ? 0 : 1);
      faceColor(id, fixedFace >= 0 ? fixedFace : face, boxRgb);
      builder.quad(
        corner(0, 0),
        corner(1, 0),
        corner(1, 1),
        corner(0, 1),
        normal[0],
        normal[1],
        normal[2],
        boxRgb,
        1,
        FACE_SHADE[face],
        boxAo,
        boxSky,
        boxBlock,
      );
    }
  }
}

/**
 * 草を描く。板を 2 枚交差させ、それぞれ表と裏を出す（計 4 枚）。
 * 不透明マテリアルは裏面をカリングするので、1 枚ずつだと反対側から消える。
 *
 * **Minecraft のような斜めの × 型にはできない。** `Builder.quad()` は法線の成分の和で
 * 頂点の巡回順を決めているので、(1,0,-1) のような斜めの法線は和が 0 になって裏返る。
 * 軸に平行にすると上から見て + 型になるが、立って見ているぶんは見分けが付かない。
 *
 * 4 枚とも同じ明るさで塗る（面の向きによる明暗を掛けない）。掛けると 1 本の草の
 * 手前と奥で明るさが変わり、平らな板だと分かってしまう。
 */
function cross(
  builder: Builder,
  ox: number,
  oy: number,
  oz: number,
  shape: readonly number[],
  id: number,
  sky: number,
  block: number,
): void {
  faceColor(id, FACE_YP, boxRgb);
  for (let i = 0; i < 4; i++) {
    boxSky[i] = sky;
    boxBlock[i] = block;
  }
  const y0 = oy + shape[1];
  const y1 = oy + shape[4];
  const cx = ox + (shape[0] + shape[3]) / 2;
  const cz = oz + (shape[2] + shape[5]) / 2;
  const x0 = ox + shape[0];
  const x1 = ox + shape[3];
  const z0 = oz + shape[2];
  const z1 = oz + shape[5];

  // 頂点は greedy 側と同じ「u が増える向き → v が増える向き」で並べる
  // （X 面の板は u=Y v=Z、Z 面の板は u=X v=Y）。
  for (const dir of [1, -1]) {
    builder.quad(
      [cx, y0, z0],
      [cx, y1, z0],
      [cx, y1, z1],
      [cx, y0, z1],
      dir,
      0,
      0,
      boxRgb,
      1,
      CROSS_SHADE,
      boxAo,
      boxSky,
      boxBlock,
    );
  }
  for (const dir of [1, -1]) {
    builder.quad(
      [x0, y0, cz],
      [x1, y0, cz],
      [x1, y1, cz],
      [x0, y1, cz],
      0,
      0,
      dir,
      boxRgb,
      1,
      CROSS_SHADE,
      boxAo,
      boxSky,
      boxBlock,
    );
  }
}

/**
 * 面の情報を 1 つの整数に詰める。ここと encodeLight の**両方**が一致する面だけが
 * greedy に統合される。ビット配置: **id 0-7** / 向き 8 / スカイ 9-24 (4bit x4) で 25 ビット。
 * 31 ビット目は Int32Array の符号ビットなので使えない（残りは 6 ビット）。
 *
 * **id は必ず 1 枚目の下位に置くこと。** `mask[n] === 0` が「面が無い」の目印で、
 * id 0（AIR）は面を作らないので衝突しない。id を上位へ動かすと、
 * **id 以外が全部 0 の面**（AO もスカイも 0 の、洞窟の奥の壁）が「面が無い」と
 * 読まれて丸ごと消える。
 *
 * **AO を 2 枚目へ移して id を 6 → 8 ビットに広げてあります**（立方体の ID の枠が
 * 63 で尽きたため。`blocks.ts` の「ブロック ID の枠」）。ボクセルが `Uint8Array` なので
 * 8 ビットで天井に届いていますが、さらに要るなら**スカイを 2 枚目へ移せば 14 ビットまで**
 * 広げられます（そちらは `Uint16Array` の話が先に来ます）。
 */
function encodeFace(id: number, dir: number, sky: number[]): number {
  return (
    (id & 0xff) |
    (dir < 0 ? 1 << 8 : 0) |
    (sky[0] << 9) |
    (sky[1] << 13) |
    (sky[2] << 17) |
    (sky[3] << 21)
  );
}

/**
 * 2 枚目のマスク。四隅のブロックライト 0-15 (4bit x4) と **AO 16-23 (2bit x4)** で 24 ビット。
 *
 * **ブロックライトが 1 つも無いチャンクでも呼ぶこと**（AO がこちらに乗ったので、
 * 昔のように `anyBlockLight` が false なら 0、とはできません）。`faceCorners()` が
 * `block[]` に 0 を書くので、読みに行く費用は掛かりません。
 */
function encodeLight(level: number[], ao: number[]): number {
  return (
    level[0] |
    (level[1] << 4) |
    (level[2] << 8) |
    (level[3] << 12) |
    (ao[0] << 16) |
    (ao[1] << 18) |
    (ao[2] << 20) |
    (ao[3] << 22)
  );
}

/**
 * 面の 4 隅の AO と光量を求める。
 *
 * どれも「面の外側に接する 4 マス」を見る。AO はそのうち 3 マス（辺 2 つと角 1 つ）が
 * 埋まっているかで 0..3 の遮蔽段階を決め、光量は 4 マスのうち光が届くものの平均をとる。
 * 隅ごとに平均するので、洞窟の入口では光が滑らかに減衰して見える。
 * スカイとブロックの 2 系統を同じ隅・同じ重みで平均する（別々にすると境目がずれる）。
 */
function faceCorners(
  skyPad: Uint8Array,
  blockPad: Uint8Array,
  /** false ならブロックライトは全部 0。読みに行くだけ無駄なので飛ばす。 */
  anyBlockLight: boolean,
  solid: (x: number, y: number, z: number) => number,
  x: number[],
  q: number[],
  dir: number,
  u: number,
  v: number,
  ao: number[],
  sky: number[],
  block: number[],
): void {
  // 面を持つ側のボクセル。面の外側へ 1 つ出た位置が、光と AO を見に行く先になる。
  const px = x[0] + (dir < 0 ? q[0] : 0);
  const py = x[1] + (dir < 0 ? q[1] : 0);
  const pz = x[2] + (dir < 0 ? q[2] : 0);
  const nx = px + q[0] * dir;
  const ny = py + q[1] * dir;
  const nz = pz + q[2] * dir;

  uo[0] = uo[1] = uo[2] = 0;
  vo[0] = vo[1] = vo[2] = 0;
  uo[u] = 1;
  vo[v] = 1;

  const faceIndex = padIndex(nx, ny, nz);
  const faceSky = skyPad[faceIndex];
  const faceBlock = anyBlockLight ? blockPad[faceIndex] : 0;

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
    let skySum = faceSky;
    let blockSum = faceBlock;
    let count = 1;
    if (!side1) {
      const i = padIndex(sx, sy, sz);
      skySum += skyPad[i];
      if (anyBlockLight) blockSum += blockPad[i];
      count++;
    }
    if (!side2) {
      const i = padIndex(tx, ty, tz);
      skySum += skyPad[i];
      if (anyBlockLight) blockSum += blockPad[i];
      count++;
    }
    if (!corner) {
      const i = padIndex(cx, cy, cz);
      skySum += skyPad[i];
      if (anyBlockLight) blockSum += blockPad[i];
      count++;
    }
    sky[c] = Math.round(skySum / count);
    block[c] = anyBlockLight ? Math.round(blockSum / count) : 0;
  }
}
