import { Scene } from "three";
import { AIR, GLASS, STONE, WATER } from "../src/blocks";
import { AMBIENT_LIGHT, MAX_LIGHT, WORLD_HEIGHT } from "../src/constants";
import { PAD_VOLUME, buildChunkMesh, padIndex } from "../src/mesher";
import { World } from "../src/world";
import { check, describe } from "./harness";

/** 頂点カラーのうち最も明るい成分（明るさの目安）。 */
function brightest(colors: Float32Array): number {
  let max = 0;
  for (let i = 0; i < colors.length; i += 4) max = Math.max(max, colors[i]);
  return max;
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

  describe("光がメッシュの色に乗るか");

  const pad = new Uint8Array(PAD_VOLUME);
  const lightPad = new Uint8Array(PAD_VOLUME);
  const floor = () => {
    pad.fill(AIR);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) pad[padIndex(x, 0, z)] = STONE;
  };

  floor();
  lightPad.fill(MAX_LIGHT);
  const bright = brightest(buildChunkMesh(pad, lightPad).opaque!.colors);
  lightPad.fill(0);
  const dark = brightest(buildChunkMesh(pad, lightPad).opaque!.colors);

  check("光量 0 の面は暗くなる", dark < bright * 0.5, `${bright.toFixed(3)} → ${dark.toFixed(3)}`);
  check(
    "光量 0 でも完全な黒にはならない",
    dark > 0 && Math.abs(dark / bright - AMBIENT_LIGHT) < 0.02,
    `比 ${(dark / bright).toFixed(3)}（設定は ${AMBIENT_LIGHT}）`,
  );

  lightPad.fill(Math.round(MAX_LIGHT / 2));
  const middle = brightest(buildChunkMesh(pad, lightPad).opaque!.colors);
  check("中間の光量は中間の明るさになる", middle > dark && middle < bright, `${middle.toFixed(3)}`);

  // 光の境目では統合キーが変わるので面が分かれる
  floor();
  lightPad.fill(MAX_LIGHT);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 8; x++) lightPad[padIndex(x, 1, z)] = 0;
  }
  const split = buildChunkMesh(pad, lightPad).opaque!;
  check("光の境目で面が分かれる", split.indices.length / 3 > 12, `${split.indices.length / 3} 三角形`);
  const tones = new Set<number>();
  for (let i = 0; i < split.colors.length; i += 4) {
    if (split.normals[(i / 4) * 3 + 1] === 1) tones.add(Math.round(split.colors[i] * 1000));
  }
  check("上面に明暗の差が出る", tones.size > 2, `明度 ${tones.size} 段階`);

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
