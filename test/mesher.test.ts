import {
  AIR,
  CACTUS,
  FENCE,
  GLASS,
  LEAVES,
  PLANK,
  STONE,
  STONE_SLAB,
  STONE_SLAB_TOP,
  STONE_STAIRS,
  TALL_GRASS,
  TORCH,
  WALL_TORCH_XN,
  WALL_TORCH_XP,
  WALL_TORCH_ZN,
  WALL_TORCH_ZP,
  WATER,
  shapeBoxes,
} from "../src/blocks";
import { CHUNK_SIZE, MAX_LIGHT } from "../src/constants";
import { PAD_VOLUME, buildChunkMesh, padIndex } from "../src/mesher";
import { signedVolume, verifyWinding } from "./geometry";
import { check, describe } from "./harness";

const pad = new Uint8Array(PAD_VOLUME);
// 明るさを一律に最大にしておく。光そのものの検証は lighting.test.ts で行う。
const lightPad = new Uint8Array(PAD_VOLUME).fill(MAX_LIGHT);
/** ブロックライトは既定で 0（松明を置いたときだけ効く）。 */
const blockPad = new Uint8Array(PAD_VOLUME);
const put = (x: number, y: number, z: number, id: number) => {
  pad[padIndex(x, y, z)] = id;
};

/** 不透明メッシュの三角形の数（面が 1 枚も無ければ `opaque` は null）。 */
function opaqueTriangles(): number {
  const mesh = buildChunkMesh(pad, lightPad, blockPad).opaque;
  return mesh ? mesh.indices.length / 3 : 0;
}

/**
 * (5,5,5) のフェンス **1 本ぶん**の三角形を数える。
 *
 * 隣のブロック自身も面を出す（石 1 個で 12 三角形）ので、**隣だけを置いた状態から
 * 引き算する。** フェンスは `opaque: false` なので隣の面を 1 枚も消さず、
 * 差はそのままフェンスの箱の数 x 12 になる。
 */
function fenceTriangles(placeNeighbours: () => void): number {
  pad.fill(AIR);
  placeNeighbours();
  const before = opaqueTriangles();
  put(5, 5, 5, FENCE);
  return opaqueTriangles() - before;
}

export function run(): void {
  describe("メッシュ化 (greedy meshing)");

  pad.fill(AIR);
  check("空のチャンクは面ゼロ", buildChunkMesh(pad, lightPad, blockPad).opaque === null);

  pad.fill(STONE);
  check("完全に埋まったチャンクも面ゼロ", buildChunkMesh(pad, lightPad, blockPad).opaque === null);

  pad.fill(AIR);
  put(5, 5, 5, STONE);
  const single = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("孤立ブロックは 6 面 12 三角形", single.indices.length / 3 === 12);
  check("孤立ブロックの頂点は 24", single.positions.length / 3 === 24);
  verifyWinding("孤立ブロック", single, [5.5, 5.5, 5.5]);

  // 3 軸それぞれで統合が効くか
  for (const axis of [0, 1, 2] as const) {
    pad.fill(AIR);
    for (let a = 2; a < 10; a++) {
      for (let b = 2; b < 10; b++) {
        const p = [0, 0, 0];
        p[axis] = 6;
        p[(axis + 1) % 3] = a;
        p[(axis + 2) % 3] = b;
        put(p[0], p[1], p[2], STONE);
      }
    }
    const mesh = buildChunkMesh(pad, lightPad, blockPad).opaque!;
    const center: [number, number, number] = [6, 6, 6];
    center[axis] = 6.5;
    const name = `軸 ${"XYZ"[axis]} の 8x8 平板`;
    check(`${name}が 12 三角形に統合される`, mesh.indices.length / 3 === 12, `${mesh.indices.length / 3} 三角形（未統合なら 768）`);
    verifyWinding(name, mesh, center);
  }

  // AO: 隣に壁が立つと根元が暗くなる
  pad.fill(AIR);
  for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) put(x, 0, z, STONE);
  const flat = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("平らな床は 1 枚に統合される", flat.indices.length / 3 === 12);
  put(0, 1, 0, STONE);
  const shaded = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  const tones = new Set<number>();
  for (let i = 0; i < shaded.colors.length; i += 4) {
    if (shaded.normals[(i / 4) * 3 + 1] === 1) tones.add(Math.round(shaded.colors[i] * 1000));
  }
  check("遮蔽物があると上面に AO の明暗が出る", tones.size > 1, `明度 ${tones.size} 段階`);
  check("AO のせいで統合が過剰に崩れない", shaded.indices.length / 3 < 40, `${shaded.indices.length / 3} 三角形`);

  describe("面マスクの詰め方（ID は 8 ビット）");

  // **63 を超えるブロック ID が下位 6 ビットに潰れていないか。**
  // `encodeFace` は id を 6 → 8 ビットに広げてある（AO を 2 枚目のマスクへ移した）。
  // 潰れても例外は出ず、**別のブロックとして描かれる**形でしか出ないので、
  // 「水に潰れる ID」を置いて半透明側に回っていないことを見る。
  // 6 ビットだった頃は、この ID が水と同じ扱いになって translucent 側に出た。
  const WATER_ALIAS = WATER + 128;
  pad.fill(AIR);
  put(5, 5, 5, WATER_ALIAS);
  const alias = buildChunkMesh(pad, lightPad, blockPad);
  check(
    `ID ${WATER_ALIAS} が水（${WATER}）に潰れていない`,
    alias.translucent === null && alias.opaque !== null,
    alias.translucent ? "半透明側に出た（下位 6 ビットで読まれている）" : "不透明側だけに出た",
  );

  // 統合キーそのもの。**下位 6 ビットが同じ別の ID**（+64 したもの）が 1 枚に混ざると、
  // 隣り合う 2 種類のブロックが片方の色で塗られる。上面の枚数だけを数えれば、
  // 側面（もともと別のスライスなので統合されない）に紛れずに見える。
  const topQuads = (m: { normals: Float32Array }) => {
    let n = 0;
    for (let i = 0; i < m.normals.length; i += 3) if (m.normals[i + 1] === 1) n++;
    return n / 4;
  };
  const HIGH_ID = 130;
  pad.fill(AIR);
  put(5, 5, 5, HIGH_ID);
  put(6, 5, 5, HIGH_ID + 64);
  const twoIds = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  pad.fill(AIR);
  put(5, 5, 5, HIGH_ID);
  put(6, 5, 5, HIGH_ID);
  const sameId = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  console.log(
    `      上面の枚数: ${HIGH_ID}+${HIGH_ID + 64} → ${topQuads(twoIds)} 枚 / ` +
      `${HIGH_ID} を 2 つ → ${topQuads(sameId)} 枚`,
  );
  check(
    "下位 6 ビットが同じでも、別の ID なら統合されない",
    topQuads(twoIds) === 2,
    `${topQuads(twoIds)} 枚`,
  );
  check("同じ ID なら 64 以降でも統合される", topQuads(sameId) === 1, `${topQuads(sameId)} 枚`);

  describe("立方体でないブロック（松明）");

  pad.fill(AIR);
  put(5, 5, 5, TORCH);
  const torch = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("松明は箱 2 つ（柄と炎）で出る", torch.indices.length / 3 === 24, `${torch.indices.length / 3} 三角形`);
  check("立方体としては描かれない", torch.positions.length / 3 === 48, `${torch.positions.length / 3} 頂点`);
  verifyWinding("松明", torch, null);

  // 閉じた面の向きが正しければ、発散定理で求めた体積は中身の体積と一致する。
  // 1 面でも裏返っていればここがずれるので、箱ごとの中心を使わずに向きを確かめられる。
  const expected = 0.125 * 0.125 * 0.625 + 0.1875 ** 3;
  const volume = signedVolume(torch);
  check(
    "松明の面がすべて外を向く",
    Math.abs(volume - expected) < 1e-6,
    `体積 ${volume.toFixed(6)}（想定 ${expected.toFixed(6)}）`,
  );
  check("松明が 1 ブロックからはみ出さない", torch.positions.every((v) => v >= 5 && v <= 6));

  // 炎は光源そのものなので、周りが真っ暗でも明るいまま
  blockPad.fill(0);
  lightPad.fill(0);
  const darkTorch = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  let flame = 0;
  let post = 1;
  for (let i = 0; i < darkTorch.light.length; i += 2) {
    const y = darkTorch.positions[(i / 2) * 3 + 1];
    if (y > 5.6) flame = Math.max(flame, darkTorch.light[i + 1]);
    else post = Math.min(post, darkTorch.light[i + 1]);
  }
  check("炎は真っ暗な場所でも最大の明るさ", flame === 1, `${flame}`);
  check("柄はその場のブロックライトに従う", post === 0, `${post}`);
  lightPad.fill(MAX_LIGHT);

  // --- 壁掛け ---
  // 4 向きは同じ形の回転なので、体積が一致しないかどこか 1 面でも裏返っていれば分かる。
  const wallExpected =
    3 * (0.1875 * 0.25 * 0.125) + 0.1875 * 0.15625 * 0.1875;
  const volumes: number[] = [];
  for (const [name, wallId, wallAxis, wallSign] of [
    ["+X の壁", WALL_TORCH_XP, 0, 1],
    ["-X の壁", WALL_TORCH_XN, 0, -1],
    ["+Z の壁", WALL_TORCH_ZP, 2, 1],
    ["-Z の壁", WALL_TORCH_ZN, 2, -1],
  ] as const) {
    pad.fill(AIR);
    put(5, 5, 5, wallId);
    const mesh = buildChunkMesh(pad, lightPad, blockPad).opaque!;
    verifyWinding(`壁の松明(${name})`, mesh, null);
    volumes.push(signedVolume(mesh));
    check(
      `壁の松明(${name}): 柄 3 段 + 炎`,
      mesh.indices.length / 3 === 48,
      `${mesh.indices.length / 3} 三角形`,
    );
    check(
      `壁の松明(${name}): 1 ブロックからはみ出さない`,
      mesh.positions.every((v) => v >= 5 && v <= 6),
    );

    // 壁に接していて、そこから反対側へ張り出している。
    // 壁が + 側にあるならブロック内の座標 1.0 が壁ぎわなので、そこからの距離に直す。
    let touching = false;
    let reach = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const local = mesh.positions[i + wallAxis] - 5;
      const fromWall = wallSign > 0 ? 1 - local : local;
      if (Math.abs(fromWall) < 1e-6) touching = true;
      reach = Math.max(reach, fromWall);
    }
    check(`壁の松明(${name}): 壁に接している`, touching);
    check(`壁の松明(${name}): 壁から離れて張り出す`, reach > 0.4, `張り出し ${reach.toFixed(3)}`);
  }
  check(
    "壁掛けは 4 向きとも同じ形",
    volumes.every((v) => Math.abs(v - volumes[0]) < 1e-9),
    volumes.map((v) => v.toFixed(6)).join(" / "),
  );
  check(
    "壁掛けの面がすべて外を向く",
    Math.abs(volumes[0] - wallExpected) < 1e-6,
    `体積 ${volumes[0].toFixed(6)}（想定 ${wallExpected.toFixed(6)}）`,
  );

  // 床置きとは形が違う（同じ形を使い回していたら気付けるように）
  pad.fill(AIR);
  put(5, 5, 5, TORCH);
  const floorTorch = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check(
    "床置きと壁掛けで形が違う",
    Math.abs(signedVolume(floorTorch) - volumes[0]) > 1e-6,
    `床 ${signedVolume(floorTorch).toFixed(6)} / 壁 ${volumes[0].toFixed(6)}`,
  );

  // --- サボテン ---
  // 松明と違い、立方体と同じく面ごとの色を使う（top と side が別）。
  pad.fill(AIR);
  put(5, 5, 5, CACTUS);
  const cactus = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("サボテンは箱 1 つ", cactus.indices.length / 3 === 12, `${cactus.indices.length / 3} 三角形`);
  verifyWinding("サボテン", cactus, [5.5, 5.5, 5.5]);
  check(
    "サボテンの面がすべて外を向く",
    Math.abs(signedVolume(cactus) - 0.875 * 1 * 0.875) < 1e-6,
    `体積 ${signedVolume(cactus).toFixed(6)}`,
  );
  check(
    "立方体より細い",
    cactus.positions.every((v) => v >= 5 && v <= 6) &&
      cactus.positions.some((v) => v > 5 && v < 6),
  );
  const cactusTones = new Set<number>();
  for (let i = 0; i < cactus.colors.length; i += 4) {
    if (cactus.normals[(i / 4) * 3 + 1] === 1) cactusTones.add(Math.round(cactus.colors[i] * 1000));
  }
  const cactusSideTones = new Set<number>();
  for (let i = 0; i < cactus.colors.length; i += 4) {
    if (cactus.normals[(i / 4) * 3] === 1) cactusSideTones.add(Math.round(cactus.colors[i] * 1000));
  }
  check(
    "上面と側面で色が違う（面ごとの色を引いている）",
    [...cactusTones][0] !== [...cactusSideTones][0],
    `上 ${[...cactusTones]} / 側 ${[...cactusSideTones]}`,
  );

  // --- ハーフブロック ---
  pad.fill(AIR);
  put(5, 5, 5, STONE_SLAB);
  const slab = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("ハーフは箱 1 つ", slab.indices.length / 3 === 12, `${slab.indices.length / 3} 三角形`);
  verifyWinding("下付きハーフ", slab, [5.5, 5.25, 5.5]);
  check(
    "下付きハーフの面がすべて外を向く",
    Math.abs(signedVolume(slab) - 0.5) < 1e-6,
    `体積 ${signedVolume(slab).toFixed(6)}（想定 0.5）`,
  );
  check(
    "下付きハーフは下半分に収まる",
    slab.positions.every((v, i) => (i % 3 === 1 ? v >= 5 && v <= 5.5 : v >= 5 && v <= 6)),
  );

  pad.fill(AIR);
  put(5, 5, 5, STONE_SLAB_TOP);
  const slabTop = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  verifyWinding("上付きハーフ", slabTop, [5.5, 5.75, 5.5]);
  check(
    "上付きハーフは上半分に収まる",
    slabTop.positions.every((v, i) => (i % 3 === 1 ? v >= 5.5 && v <= 6 : v >= 5 && v <= 6)),
  );
  check(
    "上付きと下付きは体積が同じ",
    Math.abs(signedVolume(slabTop) - signedVolume(slab)) < 1e-9,
    `${signedVolume(slabTop).toFixed(6)} / ${signedVolume(slab).toFixed(6)}`,
  );

  // ハーフは opaque ではないので、下の床の面は消えない（消えると地面が透ける）
  pad.fill(AIR);
  for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) put(x, 0, z, STONE);
  put(5, 1, 5, STONE_SLAB);
  const slabOnFloor = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check(
    "ハーフを置いても床は 1 枚に統合されたまま",
    slabOnFloor.indices.length / 3 === 12 + 12,
    `${slabOnFloor.indices.length / 3} 三角形（床 12 + ハーフ 12）`,
  );

  // --- 階段 ---
  // 箱 2 個をそのまま積むので、内側で接する面も出る（24 三角形）。
  // 数は増えるが、閉じた形なので体積で裏返りを見張れる。
  pad.fill(AIR);
  put(5, 5, 5, STONE_STAIRS);
  const stairs = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("階段は箱 2 個ぶん", stairs.indices.length / 3 === 24, `${stairs.indices.length / 3} 三角形`);
  verifyWinding("階段", stairs, null);
  check(
    "階段の面がすべて外を向く",
    Math.abs(signedVolume(stairs) - 0.75) < 1e-6,
    `体積 ${signedVolume(stairs).toFixed(6)}（想定 0.75 = ハーフ 0.5 + 段 0.25）`,
  );
  check(
    "階段はブロックの中に収まる",
    stairs.positions.every((v) => v >= 5 && v <= 6),
  );
  // 段は高いほうの側にだけ寄っている（大元は +X 向き）
  const stairXs = new Set([...stairs.positions].filter((_, i) => i % 3 === 0));
  check("段の境目が真ん中にある", stairXs.has(5.5), `x = ${[...stairXs].sort().join(" ")}`);

  // --- 草むら ---
  // 板 2 枚を交差させ、それぞれ表と裏を出す。裏を省くと反対側から見たとき消える
  // （カリングで消えるので、GPU 無しでは面の枚数でしか押さえられない）。
  pad.fill(AIR);
  put(5, 5, 5, TALL_GRASS);
  const grass = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("草は板 2 枚を表裏で 4 枚", grass.indices.length / 3 === 8, `${grass.indices.length / 3} 三角形`);
  verifyWinding("草", grass, null);
  const grassNormals = new Set<string>();
  for (let i = 0; i < grass.normals.length; i += 3) {
    grassNormals.add(`${grass.normals[i]},${grass.normals[i + 1]},${grass.normals[i + 2]}`);
  }
  check(
    "板の向きは 4 通り（同じ板の表と裏がそろっている）",
    grassNormals.size === 4 &&
      ["1,0,0", "-1,0,0", "0,0,1", "0,0,-1"].every((n) => grassNormals.has(n)),
    [...grassNormals].join(" / "),
  );
  // 形は blocks.ts の箱から引いている。ここがずれると、狙う判定と見た目が食い違う。
  const grassBox = shapeBoxes(TALL_GRASS)[0];
  check(
    "草はブロックの中（当たり判定の箱の中）に収まる",
    grass.positions.every((v, i) => {
      const a = i % 3;
      return v >= 5 + grassBox[a] - 1e-6 && v <= 5 + grassBox[a + 3] + 1e-6;
    }),
    `箱 y ${grassBox[1]}..${grassBox[4]}`,
  );
  const grassTop = Math.max(...[...grass.positions].filter((_, i) => i % 3 === 1)) - 5;
  check("草の高さが立方体より低い", grassTop < 1, `上端 ${grassTop.toFixed(2)}`);
  // 4 枚とも同じ明るさ（面の向きによる明暗を掛けていない）。掛けると 1 本の草が
  // 手前と奥で違う色になり、平らな板だと分かってしまう。
  const grassTones = new Set<number>();
  for (let i = 0; i < grass.colors.length; i += 4) grassTones.add(Math.round(grass.colors[i] * 1000));
  check("草は 4 枚とも同じ明るさ", grassTones.size === 1, `${[...grassTones].join(" / ")}`);

  // 草は opaque ではないので、下の床の面は消えない
  pad.fill(AIR);
  for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) put(x, 0, z, STONE);
  put(5, 1, 5, TALL_GRASS);
  const grassOnFloor = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check(
    "草を置いても床は 1 枚に統合されたまま",
    grassOnFloor.indices.length / 3 === 12 + 8,
    `${grassOnFloor.indices.length / 3} 三角形（床 12 + 草 8）`,
  );

  // 松明は不透明ではないので、隣のブロックの面は消えない
  pad.fill(AIR);
  for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) put(x, 0, z, STONE);
  put(5, 1, 5, TORCH);
  const withFloor = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check(
    "松明を置いても床は 1 枚に統合されたまま",
    withFloor.indices.length / 3 === 12 + 24,
    `${withFloor.indices.length / 3} 三角形（床 12 + 松明 24）`,
  );

  // 半透明の分離
  pad.fill(AIR);
  for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) put(x, 0, z, WATER);
  put(8, 0, 8, GLASS);
  const layered = buildChunkMesh(pad, lightPad, blockPad);
  check("水とガラスは半透明レイヤーに分かれる", layered.opaque === null && layered.translucent !== null);
  check("半透明の頂点アルファが 1 未満", layered.translucent!.colors[3] < 1, `${layered.translucent!.colors[3].toFixed(2)}`);

  // 同じ半透明同士の境界は面を作らない（水の中が真っ白にならない）
  pad.fill(AIR);
  for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) put(x, y, z, WATER);
  const block = buildChunkMesh(pad, lightPad, blockPad).translucent!;
  check("水塊の内部に面が出ない", block.indices.length / 3 === 12, `${block.indices.length / 3} 三角形`);

  // 不透明に隣接する水の面は消える
  pad.fill(AIR);
  put(1, 1, 1, WATER);
  put(1, 0, 1, STONE);
  const overStone = buildChunkMesh(pad, lightPad, blockPad).translucent!;
  check("石に接する水の底面は省かれる", overStone.indices.length / 3 === 10, `${overStone.indices.length / 3} 三角形`);

  // ランダムな塊で全体の健全性
  pad.fill(AIR);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 900; i++) {
    put(
      Math.floor(rnd() * CHUNK_SIZE),
      Math.floor(rnd() * CHUNK_SIZE),
      Math.floor(rnd() * CHUNK_SIZE),
      rnd() < 0.8 ? STONE : WATER,
    );
  }
  const noisy = buildChunkMesh(pad, lightPad, blockPad);
  verifyWinding("ランダムな塊(不透明)", noisy.opaque!, null);
  verifyWinding("ランダムな塊(半透明)", noisy.translucent!, null);

  for (const [name, mesh] of [
    ["不透明", noisy.opaque!],
    ["半透明", noisy.translucent!],
  ] as const) {
    const verts = mesh.positions.length / 3;
    check(`${name}: 座標がチャンク内に収まる`, mesh.positions.every((v) => v >= 0 && v <= CHUNK_SIZE));
    check(`${name}: index が頂点数の範囲内`, mesh.indices.every((i) => i < verts));
    check(`${name}: 色が 0..1`, mesh.colors.every((v) => v >= 0 && v <= 1));
    // light が頂点数と食い違うと、シェーダが読む値がずれて画面が真っ黒になる
    check(`${name}: light が頂点ごとに 2 成分ある`, mesh.light.length === verts * 2);
    check(`${name}: light が 0..1`, mesh.light.every((v) => v >= 0 && v <= 1));
    check(`${name}: 法線が軸に平行な単位ベクトル`, mesh.normals.every((v) => v === 0 || Math.abs(v) === 1));
    check(`${name}: 四角形として整合`, verts % 4 === 0 && mesh.indices.length / 6 === verts / 4);
  }

  fences();
}

/**
 * フェンスが隣と繋がって見える（26b）。**`box()` は 6 面を必ず出す**ので
 * **箱 1 個 = 12 三角形**で、三角形の数がそのまま「腕が何本出ているか」になる。
 *
 * **柱だけ = 12 / 腕 1 方向 = 36（3 箱）/ 4 方向 = 108（9 箱）。**
 * 繋がる相手の表そのものは `test/blocks.test.ts` の `fenceConnects()` 側で見る。
 */
function fences(): void {
  describe("フェンスが隣と繋がって見える");

  // --- 何も無ければ柱だけ（26a は 9 箱を常に積んでいた） ---
  const alone = fenceTriangles(() => {});
  pad.fill(AIR);
  put(5, 5, 5, FENCE);
  const aloneMesh = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  console.log(`      1 本だけ: ${alone} 三角形（柱 1 箱 = 12 / 26a は 9 箱 = 108 だった）`);
  check("隣が空気なら柱だけの 12 三角形", alone === 12, `${alone} 三角形`);
  verifyWinding("1 本だけのフェンス", aloneMesh, [5.5, 5.5, 5.5]);
  check(
    "柱は 6/16 角のまま（腕がどこへも伸びていない）",
    aloneMesh.positions.every((v, i) => (i % 3 === 1 ? v >= 5 && v <= 6 : v >= 5.375 - 1e-9 && v <= 5.625 + 1e-9)),
    `x/z ${Math.min(...[...aloneMesh.positions].filter((_, i) => i % 3 === 0))}..` +
      `${Math.max(...[...aloneMesh.positions].filter((_, i) => i % 3 === 0))}`,
  );

  // --- +X に 2 本並べる（26a と同じ絵にならないこと） ---
  pad.fill(AIR);
  put(5, 5, 5, FENCE);
  put(6, 5, 5, FENCE);
  const pair = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  const pairTriangles = pair.indices.length / 3;
  console.log(`      +X に 2 本: ${pairTriangles} 三角形（片方 3 箱 = 36 ずつ）`);
  check("2 本並べると 72 三角形（互いに 1 方向だけ腕を出す）", pairTriangles === 72, `${pairTriangles} 三角形`);
  verifyWinding("2 本並べたフェンス", pair, null);
  check(
    "腕は 2 本のあいだを埋める（x = 6.0 に面がある）",
    [...pair.positions].some((v, i) => i % 3 === 0 && v === 6),
    `x ${[...new Set([...pair.positions].filter((_, i) => i % 3 === 0))].sort((a, b) => a - b).join(" ")}`,
  );

  // --- 4 方向すべて（26a と同じ 9 箱の絵） ---
  pad.fill(AIR);
  put(5, 5, 5, FENCE);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(5 + dx, 5, 5 + dz, FENCE);
  const crossed = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  const crossedTriangles = crossed.indices.length / 3;
  // 隣の 4 本は中央としか繋がらないので 36 ずつ。中央は 108（9 箱）。
  console.log(`      4 方向すべて: ${crossedTriangles} 三角形（中央 108 + 隣 4 本 x 36 = 252）`);
  check(
    "4 方向とも繋がると中央は 9 箱ぶん（108）に戻る",
    crossedTriangles === 252 && crossedTriangles - 4 * 36 === 108,
    `${crossedTriangles} 三角形（中央 ${crossedTriangles - 4 * 36}）`,
  );
  verifyWinding("十字のフェンス", crossed, null);

  // --- 繋がる相手・繋がらない相手（1 つずつ数を出す。「いつも真」を素通りさせない） ---
  // **フェンスどうしはここに並べられない** —— 引き算の相手（隣だけを置いた状態）が
  // フェンスを足すと一緒に腕を伸ばすので、差が 36 にならない（上の 72 が見ている）。
  const neighbours: [string, number][] = [
    ["石", STONE], ["葉", LEAVES], ["板", PLANK],
    ["ガラス", GLASS], ["水", WATER], ["草", TALL_GRASS], ["松明", TORCH],
    ["石ハーフ", STONE_SLAB], ["石階段", STONE_STAIRS], ["サボテン", CACTUS], ["空気", AIR],
  ];
  const counts = neighbours.map(([name, id]) => {
    const n = fenceTriangles(() => {
      if (id !== AIR) put(6, 5, 5, id);
    });
    return [name, n] as const;
  });
  console.log(`      +X の隣ごとのフェンスの三角形: ${counts.map(([n, c]) => `${n} ${c}`).join(" / ")}`);
  const connects = new Set(["石", "葉", "板"]);
  check(
    "石・葉・板の隣では腕が出る（36 三角形）",
    counts.filter(([n]) => connects.has(n)).every(([, c]) => c === 36),
    counts.filter(([n]) => connects.has(n)).map(([n, c]) => `${n} ${c}`).join(" / "),
  );
  check(
    "ガラス・水・草・松明・ハーフ・階段・サボテン・空気では出ない（12 三角形）",
    counts.filter(([n]) => !connects.has(n)).every(([, c]) => c === 12),
    counts.filter(([n]) => !connects.has(n)).map(([n, c]) => `${n} ${c}`).join(" / "),
  );

  // --- 腕は繋がった側にだけ伸びる（数だけでは向きが分からない） ---
  pad.fill(AIR);
  put(6, 5, 5, STONE);
  put(5, 5, 5, FENCE);
  const oneArm = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  const armXs = [...oneArm.positions].filter((_, i) => i % 3 === 0).filter((v) => v <= 6);
  console.log(`      +X だけ石: フェンス側の x = ${[...new Set(armXs)].sort((a, b) => a - b).join(" ")}`);
  check(
    "腕は +X 側だけマスの端（6.0）まで伸び、-X 側は柱の 5.375 で止まる",
    Math.min(...armXs) === 5.375 && armXs.includes(6),
    `x ${Math.min(...armXs)}..${Math.max(...armXs)}`,
  );

  // --- チャンクの外の隣（pad の -1）でも繋がる ---
  // 石は x = -1 なのでメッシュには 1 面も出ない。数はフェンスぶんそのもの。
  pad.fill(AIR);
  put(-1, 5, 5, STONE);
  put(0, 5, 5, FENCE);
  const edge = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  const edgeTriangles = edge.indices.length / 3;
  console.log(`      x=0 のフェンスの -X が pad の石: ${edgeTriangles} 三角形（柱 12 + 腕 24）`);
  check(
    "チャンクの外の隣とも繋がる（36 三角形）",
    edgeTriangles === 36,
    `${edgeTriangles} 三角形`,
  );
  verifyWinding("チャンクの端のフェンス", edge, null);
}
