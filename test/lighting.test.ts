import { BufferAttribute, BufferGeometry, Color, Scene, ShaderLib } from "three";
import {
  AIR,
  FACE_XP,
  FACE_YN,
  FACE_YP,
  FACE_ZN,
  GLASS,
  STONE,
  TORCH,
  TORCH_LIGHT,
  WALL_TORCH_XP,
  WALL_TORCH_ZN,
  WATER,
  blockName,
  faceFromNormal,
  oppositeFace,
  torchVariant,
} from "../src/blocks";
import { AMBIENT_LIGHT, MAX_LIGHT, WORLD_HEIGHT } from "../src/constants";
import { allItemIds, dropOf, itemName } from "../src/items";
import { BLOCK_LIGHT, OFFSETS } from "../src/lighting";
import { PAD_VOLUME, buildChunkMesh, padIndex } from "../src/mesher";
import { deserializeEdits, serializeEdits } from "../src/storage";
import { LIGHT_ATTRIBUTE, patchTerrainShader } from "../src/terrainshader";
import { World } from "../src/world";
import { check, describe } from "./harness";

/** stride ごとに offset 番目の成分を拾って、その最大値を返す。 */
function brightest(values: Float32Array, offset: number, stride = 2): number {
  let max = 0;
  for (let i = offset; i < values.length; i += stride) max = Math.max(max, values[i]);
  return max;
}

function sameValues(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function run(): void {
  describe("光（スカイライト）");

  const world = new World(new Scene(), 4242);
  world.primeAround(0.5, 0.5, 1);

  const sky = world.surfaceY(0, 0);
  check("空は最大光量", world.getLight(0, sky + 5, 0) === MAX_LIGHT, `${world.getLight(0, sky + 5, 0)}`);
  check("地表のすぐ上も最大光量", world.getLight(0, sky, 0) === MAX_LIGHT, `${world.getLight(0, sky, 0)}`);
  check("地中には光が届かない", world.getLight(0, sky - 4, 0) === 0);

  // 地形の洞窟に左右されないよう、地下に石の塊を作ってから掘る
  const floorY = 10;
  for (let y = floorY - 1; y <= floorY + 3; y++) {
    for (let x = -1; x <= 20; x++) {
      for (let z = -2; z <= 2; z++) world.setVoxel(x, y, z, STONE);
    }
  }

  let sealed = 0;
  for (let x = 0; x <= 18; x++) sealed = Math.max(sealed, world.getLight(x, floorY, 0));
  check("密閉された岩の中は真っ暗", sealed === 0, `最大 ${sealed}`);

  // 縦穴を地表までつなぐ。真上が空いたマスは深さに関係なく最大光量（Minecraft と同じ規則）
  for (let y = floorY; y <= sky; y++) world.setVoxel(0, y, 0, AIR);
  check(
    "真上が空いた縦穴は底まで明るい",
    world.getLight(0, floorY, 0) === MAX_LIGHT,
    `底 ${world.getLight(0, floorY, 0)}`,
  );

  // 縦穴の底から横に掘る。奥へ行くほど 1 マスにつき 1 ずつ暗くなる
  for (let x = 1; x <= 18; x++) world.setVoxel(x, floorY, 0, AIR);
  const near = world.getLight(1, floorY, 0);
  const mid = world.getLight(7, floorY, 0);
  const deep = world.getLight(16, floorY, 0);
  check("横穴は入口の隣が 14", near === MAX_LIGHT - 1, `${near}`);
  check("奥へ行くほど暗い", near > mid && mid > deep, `1マス ${near} → 7マス ${mid} → 16マス ${deep}`);
  check("15 マス以上奥には光が届かない", deep === 0, `${deep}`);

  // 天井を 1 マス削ると、その下が明るくなる（入口が増える）
  const beforeHole = world.getLight(7, floorY, 0);
  for (let y = floorY + 1; y <= sky; y++) world.setVoxel(7, y, 0, AIR);
  check(
    "天井に穴を開けると下が明るくなる",
    world.getLight(7, floorY, 0) > beforeHole,
    `${beforeHole} → ${world.getLight(7, floorY, 0)}`,
  );

  describe("光の差分更新（置く・壊す）");

  const px = 30;
  const pz = 30;
  const py = world.surfaceY(px, pz);
  // 地形（木の下や斜面）に左右されないよう、穴の側面と底を石で塞いでから掘る
  for (let d = 1; d <= 4; d++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dz !== 0 || d === 4) world.setVoxel(px + dx, py - d, pz + dz, STONE);
      }
    }
  }
  for (let d = 1; d <= 3; d++) world.setVoxel(px, py - d, pz, AIR);
  check("掘った穴は空に開いているので最大光量", world.getLight(px, py - 3, pz) === MAX_LIGHT);

  world.setVoxel(px, py, pz, STONE);
  const capped = world.getLight(px, py - 3, pz);
  check("蓋をすると穴の底が暗くなる", capped === 0, `${capped}`);

  world.setVoxel(px, py, pz, AIR);
  const reopened = world.getLight(px, py - 3, pz);
  check("蓋を外すと明るさが戻る", reopened === MAX_LIGHT, `${capped} → ${reopened}`);

  // ガラスは光を通す
  world.setVoxel(px, py, pz, GLASS);
  const throughGlass = world.getLight(px, py - 3, pz);
  check("ガラス越しには光が届く", throughGlass > 0, `${throughGlass}`);
  world.setVoxel(px, py, pz, AIR);

  // 水中は深いほど暗い（1 マスにつき 3 減衰）
  const wx = 34;
  const wz = 34;
  const wy = world.surfaceY(wx, wz);
  for (let i = 0; i <= 5; i++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dz !== 0) world.setVoxel(wx + dx, wy + i, wz + dz, STONE);
      }
    }
  }
  for (let i = 0; i <= 5; i++) world.setVoxel(wx, wy + i, wz, WATER);
  const waterTop = world.getLight(wx, wy + 5, wz);
  const waterMid = world.getLight(wx, wy + 3, wz);
  const waterBottom = world.getLight(wx, wy, wz);
  check("水面直下は 12（空気から 3 減る）", waterTop === MAX_LIGHT - 3, `${waterTop}`);
  check("水中は深いほど暗い", waterTop > waterMid && waterMid > waterBottom, `${waterTop} → ${waterMid} → ${waterBottom}`);
  check("深い水底には光が届かない", waterBottom === 0, `${waterBottom}`);

  describe("光がメッシュに乗るか");

  const pad = new Uint8Array(PAD_VOLUME);
  const lightPad = new Uint8Array(PAD_VOLUME);
  const blockPad = new Uint8Array(PAD_VOLUME);
  const floor = () => {
    pad.fill(AIR);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) pad[padIndex(x, 0, z)] = STONE;
  };

  floor();
  lightPad.fill(MAX_LIGHT);
  const bright = brightest(buildChunkMesh(pad, lightPad, blockPad).opaque!.light, 0);
  lightPad.fill(0);
  const dark = brightest(buildChunkMesh(pad, lightPad, blockPad).opaque!.light, 0);

  check("光量 0 の面は暗くなる", dark < bright * 0.5, `${bright.toFixed(3)} → ${dark.toFixed(3)}`);
  check(
    "光量 0 でも完全な黒にはならない",
    dark > 0 && Math.abs(dark / bright - AMBIENT_LIGHT) < 0.02,
    `比 ${(dark / bright).toFixed(3)}（設定は ${AMBIENT_LIGHT}）`,
  );

  lightPad.fill(Math.round(MAX_LIGHT / 2));
  const middle = brightest(buildChunkMesh(pad, lightPad, blockPad).opaque!.light, 0);
  check("中間の光量は中間の明るさになる", middle > dark && middle < bright, `${middle.toFixed(3)}`);

  // 光の境目では統合キーが変わるので面が分かれる
  floor();
  lightPad.fill(MAX_LIGHT);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 8; x++) lightPad[padIndex(x, 1, z)] = 0;
  }
  const split = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check("光の境目で面が分かれる", split.indices.length / 3 > 12, `${split.indices.length / 3} 三角形`);
  const tones = new Set<number>();
  for (let i = 0; i < split.light.length; i += 2) {
    if (split.normals[(i / 2) * 3 + 1] === 1) tones.add(Math.round(split.light[i] * 1000));
  }
  check("上面に明暗の差が出る", tones.size > 2, `明度 ${tones.size} 段階`);

  // --- 2 系統が混ざらないこと ---
  // 頂点カラーに焼き込むと、夜に松明まで暗くなる。色と光は必ず分けて持つ。
  floor();
  lightPad.fill(0);
  blockPad.fill(0);
  const litOnly = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  blockPad.fill(MAX_LIGHT);
  const torchLit = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check(
    "ブロックライトは色ではなく light 属性に乗る",
    sameValues(litOnly.colors, torchLit.colors),
    `色の要素数 ${torchLit.colors.length}`,
  );
  check(
    "ブロックライトを足してもスカイライトは動かない",
    brightest(torchLit.light, 0) === brightest(litOnly.light, 0),
    `スカイ ${brightest(torchLit.light, 0).toFixed(3)}`,
  );
  check(
    "ブロックライトの明るさが上がる",
    brightest(torchLit.light, 1) === 1 && brightest(litOnly.light, 1) === 0,
    `${brightest(litOnly.light, 1).toFixed(3)} → ${brightest(torchLit.light, 1).toFixed(3)}`,
  );
  // 光量 0 のときだけは下限を入れない。入れると夜も洞窟も AMBIENT より暗くならない。
  check(
    "ブロックライト 0 は 0 のまま（下限を入れない）",
    brightest(litOnly.light, 1) === 0,
    `${brightest(litOnly.light, 1)}`,
  );

  // ブロックライトが違えば面は統合されない（陰影の境目が消えないこと）
  blockPad.fill(0);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 8; x++) blockPad[padIndex(x, 1, z)] = MAX_LIGHT;
  }
  const blockSplit = buildChunkMesh(pad, lightPad, blockPad).opaque!;
  check(
    "ブロックライトの境目でも面が分かれる",
    blockSplit.indices.length / 3 > 12,
    `${blockSplit.indices.length / 3} 三角形`,
  );
  blockPad.fill(0);

  describe("ブロックライト（松明）");

  // 地形に左右されないよう、地下に石の塊を作ってから横穴を掘る
  const tz = 40;
  const ty = 10;
  for (let y = ty - 1; y <= ty + 1; y++) {
    for (let x = 39; x <= 72; x++) {
      for (let dz = -1; dz <= 1; dz++) world.setVoxel(x, y, tz + dz, STONE);
    }
  }
  for (let x = 40; x <= 71; x++) world.setVoxel(x, ty, tz, AIR);

  let corridorSky = 0;
  for (let x = 40; x <= 71; x++) corridorSky = Math.max(corridorSky, world.getLight(x, ty, tz));
  check("密閉した横穴にはスカイライトが入らない", corridorSky === 0, `最大 ${corridorSky}`);

  // チャンク境界（x=48）をまたぐ位置に置く
  const torchX = 47;
  check("松明を置ける", world.setVoxel(torchX, ty, tz, TORCH));

  const levels = [0, 1, 2, 5, 13, 14, 15].map((d) => world.getLight(torchX + d, ty, tz, BLOCK_LIGHT));
  console.log(`      松明からの距離と光量: ${levels.map((v, i) => `${[0, 1, 2, 5, 13, 14, 15][i]}→${v}`).join("  ")}`);

  check("松明のマスが最も明るい", levels[0] === TORCH_LIGHT, `${levels[0]}`);
  check("1 マスにつき 1 ずつ減る", levels[1] === TORCH_LIGHT - 1 && levels[2] === TORCH_LIGHT - 2);
  check("チャンク境界を越えても届く", world.getLight(48, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 1);
  check("14 マス先には届かない", levels[6] === 0, `${levels[6]}`);
  check(
    "松明はスカイライトを増やさない",
    world.getLight(torchX, ty, tz) === 0 && world.getLight(torchX + 1, ty, tz) === 0,
  );
  check(
    "石の向こうには漏れない",
    world.getLight(torchX, ty, tz + 1, BLOCK_LIGHT) === 0,
    `${world.getLight(torchX, ty, tz + 1, BLOCK_LIGHT)}`,
  );

  // 保存して読み直しても、松明の光は作り直される（地形は保存しないので毎回再計算になる）
  const relit = new World(new Scene(), 4242, deserializeEdits(serializeEdits(world.editsForSave())));
  relit.primeAround(torchX + 0.5, tz + 0.5, 1);
  check(
    "読み込み直しても松明が光る",
    relit.getVoxel(torchX, ty, tz) === TORCH &&
      relit.getLight(torchX + 2, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 2,
    `${relit.getLight(torchX + 2, ty, tz, BLOCK_LIGHT)}`,
  );
  relit.dispose();

  // 壊すと光も消える
  world.setVoxel(torchX, ty, tz, AIR);
  let leftover = 0;
  for (let x = 40; x <= 71; x++) leftover = Math.max(leftover, world.getLight(x, ty, tz, BLOCK_LIGHT));
  check("松明を壊すと光が完全に消える", leftover === 0, `最大 ${leftover}`);

  // 2 本立てて、片方を消しても残る（消す BFS が消しすぎないこと）
  world.setVoxel(torchX, ty, tz, TORCH);
  world.setVoxel(torchX + 6, ty, tz, TORCH);
  const between = world.getLight(torchX + 3, ty, tz, BLOCK_LIGHT);
  world.setVoxel(torchX + 6, ty, tz, AIR);
  check(
    "片方を壊しても、もう片方の光は残る",
    world.getLight(torchX + 1, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 1 &&
      world.getLight(torchX + 3, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 3,
    `間 ${between} → ${world.getLight(torchX + 3, ty, tz, BLOCK_LIGHT)}`,
  );

  // あとから壁を立てると、その先は暗くなる（消す BFS が効いているか）
  world.setVoxel(torchX + 4, ty, tz, STONE);
  check(
    "壁を立てるとその先が暗くなる",
    world.getLight(torchX + 5, ty, tz, BLOCK_LIGHT) === 0 &&
      world.getLight(torchX + 3, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 3,
    `手前 ${world.getLight(torchX + 3, ty, tz, BLOCK_LIGHT)} / 奥 ${world.getLight(torchX + 5, ty, tz, BLOCK_LIGHT)}`,
  );
  world.setVoxel(torchX + 4, ty, tz, AIR);
  check(
    "壁を壊すと光が戻る",
    world.getLight(torchX + 5, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 5,
    `${world.getLight(torchX + 5, ty, tz, BLOCK_LIGHT)}`,
  );

  // 足場を壊すと松明も落ちる
  world.setVoxel(torchX, ty - 1, tz, AIR);
  check("足場が消えると松明も壊れる", world.getVoxel(torchX, ty, tz) === AIR);
  let orphan = 0;
  for (let x = 40; x <= 71; x++) orphan = Math.max(orphan, world.getLight(x, ty, tz, BLOCK_LIGHT));
  check("壊れた松明の光も残らない", orphan === 0, `最大 ${orphan}`);

  describe("壁掛けの松明");

  // 面番号の規約が 2 か所（blocks.ts と lighting.ts）に出てくるので、まず一致を押さえる。
  // ここがずれると、支えの向きと壊れる向きが食い違って壁の松明が空中に残る。
  const faceMismatch = OFFSETS.filter(
    ([dx, dy, dz], face) => faceFromNormal(dx, dy, dz) !== face,
  ).length;
  check("OFFSETS と面番号の並びが一致", faceMismatch === 0, `${faceMismatch} 件ずれ`);
  check(
    "反対の面が対で並んでいる",
    OFFSETS.every(([dx, dy, dz], face) => {
      const [ox, oy, oz] = OFFSETS[oppositeFace(face)];
      return ox === -dx && oy === -dy && oz === -dz;
    }),
  );

  // 横穴の壁（z = tz-1 側は石）に付ける。支えは -Z 側なので WALL_TORCH_ZN。
  const wx2 = 60;
  check("壁に付けられる", world.setVoxel(wx2, ty, tz, WALL_TORCH_ZN));
  check(
    "壁掛けも同じ明るさで光る",
    world.getLight(wx2, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT &&
      world.getLight(wx2 + 1, ty, tz, BLOCK_LIGHT) === TORCH_LIGHT - 1,
    `${world.getLight(wx2 + 1, ty, tz, BLOCK_LIGHT)}`,
  );

  // 支えの向きが違えば置けない（+X 側は空洞なので、そちらを支えにはできない）
  check(
    "支えの無い向きには置けない",
    world.setVoxel(wx2 + 2, ty, tz, WALL_TORCH_XP) === false,
    `${blockName(world.getVoxel(wx2 + 2, ty, tz))}`,
  );
  check("置けなかったマスは空のまま", world.getVoxel(wx2 + 2, ty, tz) === AIR);

  // 壁を壊すと落ちる。床置きと同じ仕組み（supportFace）で動いていること。
  world.setVoxel(wx2, ty, tz - 1, AIR);
  check("壁が消えると壁掛けも壊れる", world.getVoxel(wx2, ty, tz) === AIR);
  let wallLeft = 0;
  for (let x = 40; x <= 71; x++) wallLeft = Math.max(wallLeft, world.getLight(x, ty, tz, BLOCK_LIGHT));
  check("壁掛けの光も残らない", wallLeft === 0, `最大 ${wallLeft}`);

  // 床の松明は真下だけを見る。横のブロックを壊しても落ちない。
  world.setVoxel(wx2, ty, tz - 1, STONE);
  world.setVoxel(wx2 + 4, ty, tz, TORCH);
  world.setVoxel(wx2 + 5, ty, tz, AIR); // すでに空だが念のため
  world.setVoxel(wx2 + 4, ty, tz - 1, AIR);
  check("横のブロックを壊しても床の松明は落ちない", world.getVoxel(wx2 + 4, ty, tz) === TORCH);
  world.setVoxel(wx2 + 4, ty, tz, AIR);
  world.setVoxel(wx2 + 4, ty, tz - 1, STONE);

  // アイテムとしては 1 種類に見えること
  check(
    "壁掛けを壊しても床置きと同じ松明が出る",
    dropOf(WALL_TORCH_ZN).item === TORCH && dropOf(WALL_TORCH_XP).item === TORCH,
    `${itemName(dropOf(WALL_TORCH_ZN).item)}`,
  );
  check(
    "壁掛けはアイテム欄を増やさない",
    !allItemIds().includes(WALL_TORCH_ZN) && !allItemIds().includes(WALL_TORCH_XP),
    `アイテム ${allItemIds().length} 種`,
  );
  check(
    "壁掛けは向きから選べる",
    torchVariant(FACE_YN) === TORCH &&
      torchVariant(FACE_ZN) === WALL_TORCH_ZN &&
      torchVariant(FACE_XP) === WALL_TORCH_XP,
  );
  check("天井にはぶら下げられない", torchVariant(FACE_YP) === AIR);

  describe("地形シェーダ");

  // GLSL はこの環境では動かせないので、せめて「three の shader chunk に
  // 差し込めたか」だけは確かめる。three を上げて名前が変わると、差し込みが
  // 黙って無視されて画面が真っ黒になる（それが唯一の症状になる）。
  const daylight = { value: new Color(1, 1, 1) };
  const patched = {
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: ShaderLib.basic.fragmentShader,
    uniforms: {} as Record<string, { value: unknown }>,
  };
  patchTerrainShader(patched, daylight);

  check(
    "頂点シェーダに light 属性が入る",
    patched.vertexShader.includes(`attribute vec2 ${LIGHT_ATTRIBUTE};`) &&
      patched.vertexShader.includes(`vVoxelLight = ${LIGHT_ATTRIBUTE};`),
  );
  check(
    "フラグメントシェーダで 2 系統を合成する",
    patched.fragmentShader.includes("max(vVoxelLight.x * uDaylight, vec3(vVoxelLight.y))"),
  );
  check("昼夜の色が uniform として渡る", patched.uniforms.uDaylight === daylight);
  check(
    "属性名がジオメトリ側と一致する",
    new BufferGeometry().setAttribute(LIGHT_ATTRIBUTE, new BufferAttribute(new Float32Array(2), 2))
      .attributes[LIGHT_ATTRIBUTE] !== undefined,
  );

  let threw = "";
  try {
    patchTerrainShader({ vertexShader: "", fragmentShader: "", uniforms: {} }, daylight);
  } catch (error) {
    threw = String(error);
  }
  check("差し込み先が無ければ例外になる", threw.includes("見つかりません"), threw || "例外なし");

  describe("読み込みをまたいでも光が保たれるか");

  const streaming = new World(new Scene(), 31337);
  streaming.primeAround(0.5, 0.5, 1);
  // 待ち行列が空でも update を 1 度は呼ばないと、読み込みキューが積まれない
  for (let i = 0; i < 4000; i++) {
    streaming.update(0.5, 0.5);
    if (i > 0 && streaming.stats().queued === 0) break;
  }
  check("周辺の列が読み込まれる", streaming.stats().chunks > 800, `${streaming.stats().chunks} チャンク`);

  let unlit = 0;
  let sampled = 0;
  for (let x = -60; x <= 60; x += 3) {
    for (let z = -60; z <= 60; z += 3) {
      const top = streaming.surfaceY(x, z);
      if (top >= WORLD_HEIGHT - 1) continue;
      if (streaming.getVoxel(x, top, z) !== AIR) continue;
      if (streaming.getVoxel(x, top - 1, z) === AIR) continue; // 未読み込みの列を除く
      sampled++;
      if (streaming.getLight(x, top, z) !== MAX_LIGHT) unlit++;
    }
  }
  check("地表の空きマスはすべて最大光量", sampled > 500 && unlit === 0, `${sampled} 点中 ${unlit} 点が暗い`);

  // 洞窟の中は暗いままか（地下のボクセルを広く見る）
  let cave = 0;
  let caveLit = 0;
  for (let x = -40; x <= 40; x += 3) {
    for (let z = -40; z <= 40; z += 3) {
      for (let y = 5; y < 30; y++) {
        if (streaming.getVoxel(x, y, z) !== AIR) continue;
        if (streaming.getVoxel(x, y - 1, z) === AIR && streaming.getVoxel(x, y + 1, z) === AIR) {
          cave++;
          if (streaming.getLight(x, y, z) > 0) caveLit++;
        }
      }
    }
  }
  check("深い洞窟はほぼ真っ暗", cave > 100 && caveLit / cave < 0.05, `${cave} マス中 ${caveLit} マスに光`);
}
