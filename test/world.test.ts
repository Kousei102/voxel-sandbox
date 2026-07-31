import { PerspectiveCamera, Scene, Vector3 } from "three";
import { AIR, GRASS, STONE, WATER, blockName } from "../src/blocks";
import { CHUNK_BITS, CHUNK_LAYERS, CHUNK_VOLUME, RENDER_DISTANCE } from "../src/constants";
import { Player } from "../src/player";
import { raycastVoxels } from "../src/raycast";
import { deserializeEdits, serializeEdits } from "../src/storage";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { check, describe } from "./harness";

/** テストからチャンクの状態を覗くための最小限の型。 */
interface WorldInternals {
  chunks: Map<string, { cx: number; cz: number; dirty: boolean; solidCount: number }>;
}

/**
 * フレーム時間の上限を「チャンク 1 個ぶんの何倍まで」で表したもの。
 *
 * **constants.ts の予算から計算しないこと。** 予算そのものを壊す退行
 * （予算を 400ms にする等）を見逃してしまう。ここは設計上の期待値を直接書く。
 */
const SPIKE_UNITS = 18;
const STEADY_UNITS = 5;

/**
 * このマシンでチャンク 1 個を生成するのにかかる時間。
 * フレーム時間の上限をマシンの速さに合わせるために測る（CI は開発機の 2〜4 倍遅い）。
 */
function measureChunkCost(): number {
  const gen = new WorldGen(31337);
  const buffer = new Uint8Array(CHUNK_VOLUME);
  for (let i = 0; i < 8; i++) gen.generateChunk(i, 2, i, buffer); // 暖機
  const t = performance.now();
  const runs = 24;
  for (let i = 0; i < runs; i++) gen.generateChunk(i, 2, -i, buffer);
  return (performance.now() - t) / runs;
}

export function run(): void {
  describe("ワールド（読み込み・編集・保存）");

  const scene = new Scene();
  const world = new World(scene, 4242);
  world.primeAround(0.5, 0.5, 1);

  const stats = world.stats();
  check("スポーン周辺が読み込まれる", stats.chunks >= 9 * CHUNK_LAYERS, `${stats.chunks} チャンク`);
  check("三角形が生成される", stats.triangles > 1000, `${stats.triangles.toLocaleString()} 三角形`);
  check("シーンにメッシュが載る", scene.children.length > 0, `${scene.children.length} メッシュ`);

  const surface = world.surfaceY(0, 0);
  check("地表が見つかる", surface > 1 && surface < 128, `y=${surface}`);
  check("地表の 1 つ上は空気か水", [AIR, WATER].includes(world.getVoxel(0, surface, 0)));
  check("地表のブロックがある", world.getVoxel(0, surface - 1, 0) !== AIR, blockName(world.getVoxel(0, surface - 1, 0)));

  check("破壊できる", world.setVoxel(0, surface - 1, 0, AIR) && world.getVoxel(0, surface - 1, 0) === AIR);
  check("設置できる", world.setVoxel(0, surface - 1, 0, GRASS) && world.getVoxel(0, surface - 1, 0) === GRASS);
  check("同じブロックの再設置は無視される", world.setVoxel(0, surface - 1, 0, GRASS) === false);
  check("岩盤は壊せない", world.setVoxel(0, 0, 0, AIR) === false);

  // 編集の保存と復元
  const round = deserializeEdits(serializeEdits(world.editsForSave()));
  const restored = new World(new Scene(), 4242, round);
  restored.primeAround(0.5, 0.5, 1);
  check("保存した編集が復元される", restored.getVoxel(0, surface - 1, 0) === GRASS);
  const fresh = new World(new Scene(), 4242);
  fresh.primeAround(0.5, 0.5, 1);
  check("編集なしなら元の地形に戻る", fresh.getVoxel(0, surface - 1, 0) !== AIR);

  describe("レイキャスト");

  const down = raycastVoxels(world, new Vector3(0.5, surface + 4, 0.5), new Vector3(0, -1, 0), 10);
  check("真下のブロックに当たる", down !== null && down.block.y === surface - 1, down ? `y=${down.block.y}` : "外れ");
  check("当たった面の法線が上向き", down !== null && down.normal.y === 1);
  const up = raycastVoxels(world, new Vector3(0.5, surface + 4, 0.5), new Vector3(0, 1, 0), 10);
  check("空に向けたレイは外れる", up === null);
  const diagonal = raycastVoxels(
    world,
    new Vector3(0.5, surface + 3, 0.5),
    new Vector3(0.6, -0.7, 0.4).normalize(),
    20,
  );
  check("斜めのレイも地形に当たる", diagonal !== null);
  const far = raycastVoxels(world, new Vector3(0.5, surface + 40, 0.5), new Vector3(0, -1, 0), 6);
  check("到達距離を超えると当たらない", far === null);

  describe("プレイヤー（移動と衝突）");

  const camera = new PerspectiveCamera();
  const player = new Player(camera);
  player.position.set(0.5, surface + 6, 0.5);
  for (let i = 0; i < 240; i++) player.update(1 / 60, world);
  check("落下して着地する", player.onGround, `y=${player.position.y.toFixed(2)}`);
  check("地面をすり抜けない", player.position.y >= surface - 1, `y=${player.position.y.toFixed(2)}`);
  check("カメラが目線の高さに追従する", Math.abs(camera.position.y - (player.position.y + 1.62)) < 1e-6);

  const landedY = player.position.y;
  player.setKey("KeyW", true);
  for (let i = 0; i < 120; i++) player.update(1 / 60, world);
  const moved = Math.hypot(player.position.x - 0.5, player.position.z - 0.5);
  check("前進で移動する", moved > 2, `${moved.toFixed(1)} ブロック`);

  // 壁に向かって歩いても抜けない
  player.clearKeys();
  player.velocity.set(0, 0, 0);
  for (let i = 0; i < 30; i++) player.update(1 / 60, world);
  const wallX = Math.floor(player.position.x) + 1;
  const wallY = Math.floor(player.position.y);
  const wallZ = Math.floor(player.position.z);
  for (let dz = -2; dz <= 2; dz++) {
    for (let y = 0; y < 3; y++) world.setVoxel(wallX, wallY + y, wallZ + dz, STONE);
  }
  player.yaw = -Math.PI / 2; // +X 方向
  player.setKey("KeyW", true);
  for (let i = 0; i < 120; i++) player.update(1 / 60, world);
  check("壁を貫通しない", player.position.x < wallX, `x=${player.position.x.toFixed(2)} / 壁 x=${wallX}`);
  check("壁の手前まで詰められる", player.position.x > wallX - 0.4, `x=${player.position.x.toFixed(2)}`);

  // ジャンプ
  player.clearKeys();
  player.velocity.set(0, 0, 0);
  for (let i = 0; i < 30; i++) player.update(1 / 60, world);
  const groundY = player.position.y;
  player.setKey("Space", true);
  let peak = groundY;
  for (let i = 0; i < 60; i++) {
    player.update(1 / 60, world);
    peak = Math.max(peak, player.position.y);
  }
  check("ジャンプで 1 ブロック以上上がる", peak > groundY + 1, `+${(peak - groundY).toFixed(2)}`);
  player.clearKeys();
  for (let i = 0; i < 120; i++) player.update(1 / 60, world);
  check("ジャンプ後に着地する", player.onGround);

  // 飛行
  player.toggleFly();
  player.setKey("Space", true);
  for (let i = 0; i < 60; i++) player.update(1 / 60, world);
  check("飛行で上昇する", player.position.y > landedY + 3, `y=${player.position.y.toFixed(1)}`);
  player.toggleFly();
  player.clearKeys();

  // 設置可否の判定に使う AABB
  const fx = Math.floor(player.position.x);
  const fy = Math.floor(player.position.y);
  const fz = Math.floor(player.position.z);
  check("自分がいるマスは設置不可と判定される", player.overlapsBlock(fx, fy, fz));
  check("離れたマスは設置可能と判定される", !player.overlapsBlock(fx + 3, fy, fz));

  describe("ストリーミング（歩き続けたときの読み込み）");

  const streamScene = new Scene();
  const stream = new World(streamScene, 777);
  stream.primeAround(0.5, 0.5, 1);

  const frames: number[] = [];
  let x = 0.5;
  for (let frame = 0; frame < 900; frame++) {
    x += 0.3;
    const t = performance.now();
    stream.update(x, 0.5);
    frames.push(performance.now() - t);
  }

  /**
   * 壁時計の最悪値だけで判定すると、GC の一発や共有 CI ランナーの取り合いで落ちる。
   * 見たいのは「1 フレームが青天井に働いていないか」なので、
   * チャンク 1 個ぶんの実測（unitMs）を単位にして、上位 1% を除いた値で判定する。
   * 同期生成に戻すような退行は多くのフレームが遅くなるので、これでも必ず捕まる。
   */
  const unitMs = measureChunkCost();
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const median = at(0.5);
  const p99 = at(0.99);
  console.log(
    `      フレーム時間: 中央 ${median.toFixed(1)}ms / p99 ${p99.toFixed(1)}ms /` +
      ` 最悪 ${sorted[sorted.length - 1].toFixed(1)}ms（チャンク 1 個 ${unitMs.toFixed(2)}ms）`,
  );

  // 上限は constants.ts の予算から導かないこと。予算そのものを壊す退行を見逃す。
  const spikeLimit = Math.max(35, unitMs * SPIKE_UNITS);
  check(
    "たまに重いフレームがあっても抑えられている",
    p99 < spikeLimit,
    `p99 ${p99.toFixed(1)}ms / 上限 ${spikeLimit.toFixed(1)}ms`,
  );

  // 中央値はいちばん揺れない。同期生成に戻すような退行はここが跳ねる。
  const steadyLimit = Math.max(12, unitMs * STEADY_UNITS);
  check(
    "ふだんのフレームがフレーム予算に収まる",
    median < steadyLimit,
    `中央 ${median.toFixed(1)}ms / 上限 ${steadyLimit.toFixed(1)}ms`,
  );

  // 待ち行列を空にしてから、描画距離内に未処理のチャンクが残っていないか見る
  for (let i = 0; i < 4000 && stream.stats().queued > 0; i++) stream.update(x, 0.5);
  check("待ち行列が捌ける", stream.stats().queued === 0, `残り ${stream.stats().queued}`);

  const internals = stream as unknown as WorldInternals;
  const pcx = Math.floor(x) >> CHUNK_BITS;
  const pcz = Math.floor(0.5) >> CHUNK_BITS;
  let unmeshed = 0;
  for (const chunk of internals.chunks.values()) {
    const dx = chunk.cx - pcx;
    const dz = chunk.cz - pcz;
    if (dx * dx + dz * dz > (RENDER_DISTANCE - 1) ** 2) continue;
    if (chunk.solidCount > 0 && chunk.dirty) unmeshed++;
  }
  check("描画距離内に未メッシュのチャンクが残らない", unmeshed === 0, unmeshed ? `${unmeshed} 個` : "");

  const after = stream.stats();
  check("遠いチャンクは破棄される", after.chunks < 3000, `${after.chunks} チャンク保持`);
  check("移動後もメッシュが存在する", after.triangles > 10000, `${after.triangles.toLocaleString()} 三角形`);

  stream.dispose();
  check("dispose でシーンが空になる", streamScene.children.length === 0, `${streamScene.children.length} 残り`);
}
