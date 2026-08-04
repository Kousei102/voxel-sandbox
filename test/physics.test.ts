/**
 * プレイヤーの移動を「そのままの軌跡」で固定するテスト。
 *
 * **これは物理を `physics.ts` へ切り出すための土台。** 切り出しは挙動を 1 ミリも
 * 変えてはいけないので、先にこのテストを入れて HEAD で通し、切り出したあとも
 * **同じ数値が出ること**で等価を示す。ずれたら退行なので、値を書き換えて通さないこと。
 *
 * 地形は `World` を使わずに `Arena`（`getVoxel` だけを持つ最小の板）で組む。
 * 当たり判定が見るのは `getVoxel` だけなので、これで足りるうえに
 * ワールド生成も光の伝播も走らないので一瞬で終わる（＝試験場を細かく作れる）。
 */

import { PerspectiveCamera } from "three";
import { AIR, BEDROCK, STONE, STONE_SLAB, STONE_STAIRS, WATER } from "../src/blocks";
import { WORLD_HEIGHT } from "../src/constants";
import { Player } from "../src/player";
import type { World } from "../src/world";
import { check, describe } from "./harness";

/** `getVoxel` だけを持つ試験場。`World` と同じ端の扱いにしておく。 */
class Arena {
  private readonly cells = new Map<number, number>();

  private key(x: number, y: number, z: number): number {
    // x,z は ±512、y は 0..127 に収まる前提で 1 本の数値に潰す
    return ((x + 512) * 1024 + (z + 512)) * 128 + y;
  }

  fill(
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number,
    id: number,
  ): void {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.cells.set(this.key(x, y, z), id);
      }
    }
  }

  getVoxel(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (y >= WORLD_HEIGHT) return AIR;
    return this.cells.get(this.key(x, y, z)) ?? AIR;
  }
}

/**
 * 試験場。**段差を登る場面と頭をぶつける場面を必ず入れること。**
 * `hitMin` / `hitMax`（直前の当たり箱）が効くのはその 2 つだけなので、
 * 無いと切り出しの等価を確かめたことにならない。
 *
 * 床は y=10（上面 11）。+X へ歩くと次の順に出会う:
 *   x=4,5   石ハーフ         上面 11.5  → 0.5 の段差を歩いて登る
 *   x=6     何もない          → 0.5 落ちる
 *   x=8     石の階段(+X 向き) → 0.5 + 0.5 で 12 まで登る
 *   x=9     石              上面 12
 *   x=10    何もない          → 1.0 落ちる
 *   x=12..16 y=13 に天井      → 立つと頭 12.8 で通れるが、跳ねると頭をぶつける
 *   x=20    石 2 段（上面 13） → 2.0 は登れないので止まる
 */
function buildArena(): Arena {
  const arena = new Arena();
  arena.fill(-6, 40, 10, 10, -4, 4, STONE);
  arena.fill(4, 5, 11, 11, -4, 4, STONE_SLAB);
  arena.fill(8, 8, 11, 11, -4, 4, STONE_STAIRS);
  arena.fill(9, 9, 11, 11, -4, 4, STONE);
  arena.fill(12, 16, 13, 13, -4, 4, STONE);
  arena.fill(20, 20, 11, 12, -4, 4, STONE);
  return arena;
}

/** フレームごとのキー操作。900 フレーム = 15 秒ぶん。 */
function script(player: Player, frame: number): void {
  switch (frame) {
    case 0:
      player.clearKeys();
      break;
    case 60: // 歩き出す（ハーフ・階段・落下・天井の下）
      player.setKey("KeyW", true);
      break;
    case 240: // 跳ねながら進む（天井に頭をぶつける）
      player.setKey("Space", true);
      break;
    case 360: // 止まる
      player.clearKeys();
      break;
    case 480: // 後ろ向きに歩く（階段の高いほうにぶつかる）
      player.setKey("KeyS", true);
      break;
    case 600: // 飛行で上昇
      player.clearKeys();
      player.toggleFly();
      player.setKey("Space", true);
      break;
    case 720: // 飛行を切って落ちる
      player.toggleFly();
      player.clearKeys();
      break;
    default:
      break;
  }
}

interface Sample {
  frame: number;
  x: number;
  y: number;
  z: number;
  onGround: boolean;
}

interface Trajectory {
  samples: Sample[];
  checksum: number;
  /** 天井（y=13）の下に居るあいだの最高到達点。頭をぶつけていれば 13 - 1.8 で頭打ちになる。 */
  ceilingPeak: number;
  /** 天井の無い所での跳躍の最高到達点。上と比べるためのもの。 */
  openPeak: number;
  /** ハーフの上（11.5）／立方体の上（12）に接地していたフレーム数＝段差を登った証拠。 */
  slabFrames: number;
  stepFrames: number;
}

function runTrajectory(): Trajectory {
  const arena = buildArena() as unknown as World;
  const player = new Player(new PerspectiveCamera());
  player.position.set(0.5, 14, 0.5);
  player.yaw = -Math.PI / 2; // 前 = +X

  const samples: Sample[] = [];
  let checksum = 0;
  let ceilingPeak = -Infinity;
  let openPeak = -Infinity;
  let slabFrames = 0;
  let stepFrames = 0;

  for (let frame = 0; frame < 900; frame++) {
    script(player, frame);
    player.update(1 / 60, arena);
    const { x, y, z } = player.position;
    // 全フレームを混ぜ込むので、途中だけずれても必ず出る
    checksum = checksum * 1.0000001 + x * 3 + y * 5 + z * 7 + (player.onGround ? 11 : 0);
    if (x >= 12 && x <= 16.5) ceilingPeak = Math.max(ceilingPeak, y);
    if (frame < 480 && x > 17 && x < 19.8) openPeak = Math.max(openPeak, y);
    if (player.onGround && Math.abs(y - 11.5) < 1e-9) slabFrames++;
    if (player.onGround && Math.abs(y - 12) < 1e-9) stepFrames++;
    if (frame % 60 === 59) samples.push({ frame, x, y, z, onGround: player.onGround });
  }
  return { samples, checksum, ceilingPeak, openPeak, slabFrames, stepFrames };
}

/**
 * HEAD（切り出し前）で実測した値。**切り出しでここが動いたら挙動が変わっている。**
 * 式も評価順も変えないなら完全に一致するはずなので、判定は 1e-9 で見る。
 */
const GOLDEN: ReadonlyArray<readonly [number, number, number, number, boolean]> = [
  [59, 0.5, 11, 0.5, true],
  [119, 5.5166666666666755, 11.5, 0.5, true],
  [179, 10.716666666666661, 11.875, 0.5, false],
  [239, 15.916666666666622, 11, 0.5, true],
  [299, 19.698999999999998, 11.563333333333333, 0.5, false],
  [359, 19.698999999999998, 12.278333333333332, 0.5, false],
  [419, 19.698999999999998, 11, 0.5, true],
  [479, 19.698999999999998, 11, 0.5, true],
  [539, 14.682333333333368, 11, 0.5, true],
  [599, 10.301, 11, 0.5, true],
  [659, 10.301, 24.23333342474497, 0.5, false],
  [719, 10.301, 38.233333333333356, 0.5, false],
  [779, 10.301, 36.98333333333316, 0.5, false],
  [839, 10.301, 11, 0.5, true],
  [899, 10.301, 11, 0.5, true],
];
const GOLDEN_CHECKSUM = 112785.27747806963;

export function run(): void {
  describe("プレイヤーの物理（軌跡の固定）");

  const { samples, checksum, ceilingPeak, openPeak, slabFrames, stepFrames } = runTrajectory();

  console.log("      frame        x        y        z   接地");
  for (const s of samples) {
    console.log(
      `      ${String(s.frame).padStart(5)}` +
        ` ${s.x.toFixed(4).padStart(8)}` +
        ` ${s.y.toFixed(4).padStart(8)}` +
        ` ${s.z.toFixed(4).padStart(8)}` +
        `   ${s.onGround ? "◯" : "－"}`,
    );
  }
  console.log(
    `      チェックサム ${checksum.toFixed(9)}` +
      ` / 天井下の最高 ${ceilingPeak.toFixed(4)} / 天井なしの最高 ${openPeak.toFixed(4)}` +
      ` / ハーフ上 ${slabFrames}f / 立方体上 ${stepFrames}f`,
  );

  // 軌跡そのものより先に、**この試験場が狙った場面を通っているか**を確かめる。
  // 通っていない軌跡をいくら固定しても、切り出しの等価を示したことにならない。
  check("ハーフの段差を歩いて登っている", slabFrames > 10, `${slabFrames} フレーム 11.5 に接地`);
  check("立方体の高さまで登っている", stepFrames > 10, `${stepFrames} フレーム 12 に接地`);
  check(
    "天井に頭をぶつけている",
    ceilingPeak < 11.25 && openPeak > ceilingPeak + 0.5,
    `天井下 ${ceilingPeak.toFixed(3)} / 天井なし ${openPeak.toFixed(3)}`,
  );

  if (process.env.VOXEL_GOLDEN) {
    for (const s of samples) console.log(`  [${s.frame}, ${s.x}, ${s.y}, ${s.z}, ${s.onGround}],`);
    console.log(`GOLDEN_CHECKSUM = ${checksum}`);
  }

  let mismatch = "";
  for (let i = 0; i < GOLDEN.length; i++) {
    const s = samples[i];
    const g = GOLDEN[i];
    if (!s || !g) {
      mismatch = `標本の数が違う (${samples.length} / ${GOLDEN.length})`;
      break;
    }
    if (
      Math.abs(s.x - g[1]) > 1e-9 ||
      Math.abs(s.y - g[2]) > 1e-9 ||
      Math.abs(s.z - g[3]) > 1e-9 ||
      s.onGround !== g[4]
    ) {
      mismatch =
        `frame ${g[0]}: ${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)},${s.onGround}` +
        ` ≠ ${g[1].toFixed(6)},${g[2].toFixed(6)},${g[3].toFixed(6)},${g[4]}`;
      break;
    }
  }
  check("軌跡が切り出し前と一致する", mismatch === "", mismatch);
  check(
    "全フレームのチェックサムが一致する",
    Math.abs(checksum - GOLDEN_CHECKSUM) < 1e-6,
    `${checksum.toFixed(9)} / ${GOLDEN_CHECKSUM.toFixed(9)}`,
  );

  describe("プレイヤーの物理（形のある地形と水）");

  // ハーフブロックの上に立つ高さ（1x1x1 と決め打ちにすると半ブロック浮く）
  const slabArena = buildArena() as unknown as World;
  const onSlab = new Player(new PerspectiveCamera());
  onSlab.position.set(4.5, 14, 0.5);
  for (let i = 0; i < 180; i++) onSlab.update(1 / 60, slabArena);
  check("ハーフブロックの上に立つ", Math.abs(onSlab.position.y - 11.5) < 1e-9, `y=${onSlab.position.y}`);

  // 階段の低いほう（歩いてきた側）から登れる
  const stairArena = buildArena() as unknown as World;
  const climber = new Player(new PerspectiveCamera());
  climber.position.set(6.5, 12, 0.5);
  climber.yaw = -Math.PI / 2;
  for (let i = 0; i < 60; i++) climber.update(1 / 60, stairArena);
  climber.setKey("KeyW", true);
  // 階段の上（12）まで登ったら、その先は何も無いので落ちる。到達点で見る。
  let climbPeak = climber.position.y;
  for (let i = 0; i < 120; i++) {
    climber.update(1 / 60, stairArena);
    if (climber.onGround) climbPeak = Math.max(climbPeak, climber.position.y);
  }
  check(
    "階段を歩いて登れる（ジャンプなし）",
    climbPeak >= 12,
    `到達 y=${climbPeak.toFixed(3)}`,
  );

  // 逆向き（高いほうの側）からは登れない。1.0 は STEP_HEIGHT を超える。
  const blocked = new Player(new PerspectiveCamera());
  blocked.position.set(11.5, 12, 0.5);
  blocked.yaw = Math.PI / 2; // 前 = -X
  for (let i = 0; i < 60; i++) blocked.update(1 / 60, stairArena);
  blocked.setKey("KeyW", true);
  for (let i = 0; i < 120; i++) blocked.update(1 / 60, stairArena);
  check(
    "立方体の高さ（1.0）は歩いて登れない",
    blocked.position.y < 11.001 && blocked.position.x > 10,
    `y=${blocked.position.y.toFixed(3)} x=${blocked.position.x.toFixed(3)}`,
  );

  // 水に入ると inWater が立ち、落下が緩む
  const pool = new Arena();
  pool.fill(-4, 4, 0, 9, -4, 4, STONE);
  pool.fill(-2, 2, 10, 13, -2, 2, WATER);
  const swimmer = new Player(new PerspectiveCamera());
  swimmer.position.set(0.5, 20, 0.5);
  const pooled = pool as unknown as World;
  for (let i = 0; i < 120; i++) swimmer.update(1 / 60, pooled);
  check("水に入ると inWater が立つ", swimmer.inWater, `y=${swimmer.position.y.toFixed(2)}`);
  check("水中では落下が緩む", swimmer.velocity.y > -9, `vy=${swimmer.velocity.y.toFixed(2)}`);
}
