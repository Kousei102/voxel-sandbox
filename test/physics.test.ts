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
import { AIR, BEDROCK, CACTUS, COBWEB, LADDER, STONE, STONE_SLAB, STONE_STAIRS, WATER } from "../src/blocks";
import { WORLD_HEIGHT } from "../src/constants";
import { PLAYER_SIZE } from "../src/physics";
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

  describe("サボテンに触っているか（player.touchingSpikes）");

  // 床 y=10（上面 11）に、サボテンを 1 本だけ (3,11,0) に立てる。
  // サボテンの箱は 1/16 細い（手前の面が x=3.0625）ので、押し戻された体は
  // **マス x=3 の中へ 0.0615 だけ入る** —— それが「押し付けられている」の中身。
  const desert = new Arena();
  desert.fill(-4, 8, 10, 10, -4, 4, STONE);
  desert.fill(3, 3, 11, 11, 0, 0, CACTUS);
  const sand = desert as unknown as World;

  const pricked = new Player(new PerspectiveCamera());
  pricked.position.set(0.5, 11, 0.5);
  pricked.yaw = -Math.PI / 2; // 前 = +X
  for (let i = 0; i < 30; i++) pricked.update(1 / 60, sand);
  // **まず「まだ届いていない」ことを出す** —— 常に真を返す実装をここで落とす
  check(
    "歩き出す前（x≈0.5）は刺さっていない",
    !pricked.touchingSpikes,
    `x=${pricked.position.x.toFixed(3)} touchingSpikes=${pricked.touchingSpikes}`,
  );

  pricked.setKey("KeyW", true);
  for (let i = 0; i < 120; i++) pricked.update(1 / 60, sand);
  const edge = pricked.position.x + PLAYER_SIZE.half;
  console.log(
    `      サボテンに押し付けた: x=${pricked.position.x.toFixed(4)}` +
      ` 体の右端=${edge.toFixed(4)}（マスの境目 3.0 / 箱の手前 3.0625）` +
      ` → マスへ ${(edge - 3).toFixed(4)} めり込む`,
  );
  check(
    "サボテンに押し付けると touchingSpikes が真",
    pricked.touchingSpikes && edge > 3,
    `x=${pricked.position.x.toFixed(4)} 右端=${edge.toFixed(4)}`,
  );

  // 隣のマス（x=2 のまん中）に立っているだけでは偽。**これが無いと、
  // 常に真を返す実装でも上の 1 件が通ってしまう。**
  const beside = new Player(new PerspectiveCamera());
  beside.position.set(2.5, 11, 0.5);
  for (let i = 0; i < 30; i++) beside.update(1 / 60, sand);
  check(
    "隣のマスに立っているだけでは偽",
    !beside.touchingSpikes,
    `x=${beside.position.x.toFixed(3)} 右端=${(beside.position.x + PLAYER_SIZE.half).toFixed(3)}（境目 3.0）`,
  );

  const away = new Player(new PerspectiveCamera());
  away.position.set(1.5, 11, 0.5);
  for (let i = 0; i < 30; i++) away.update(1 / 60, sand);
  check(
    "2 マス離れれば偽",
    !away.touchingSpikes,
    `x=${away.position.x.toFixed(3)} 右端=${(away.position.x + PLAYER_SIZE.half).toFixed(3)}`,
  );

  // **上に立っても偽**（本家とは違う。`CACTUS_BOX` の上面を削らないと決めた線で、
  // `TUNING.md` に残してある）。箱の上面 12 に立つので、体はマス y=11 と重ならない。
  const perched = new Player(new PerspectiveCamera());
  perched.position.set(3.5, 14, 0.5);
  for (let i = 0; i < 120; i++) perched.update(1 / 60, sand);
  check(
    "サボテンの上に立っても偽（意図した線）",
    perched.onGround && perched.position.y >= 12 && !perched.touchingSpikes,
    `y=${perched.position.y.toFixed(3)} onGround=${perched.onGround} touchingSpikes=${perched.touchingSpikes}`,
  );

  describe("はしごに掴まる（player.onLadder）");

  // 床 y=10（上面 11）に、x=4 の石壁を立て、その手前のマス x=3 に
  // はしご（`LADDER` = +X 側の壁に掛かる向き）を縦に並べる。
  // はしごは `solid: false` なので押し戻しはせず、**マスが重なるかどうか**だけで決まる。
  const shaft = new Arena();
  shaft.fill(-4, 8, 10, 10, -4, 4, STONE);
  shaft.fill(4, 4, 11, 24, -4, 4, STONE);
  shaft.fill(3, 3, 11, 24, 0, 0, LADDER);
  const wall = shaft as unknown as World;

  const rungs = new Player(new PerspectiveCamera());
  rungs.position.set(0.5, 11, 0.5);
  rungs.yaw = -Math.PI / 2; // 前 = +X
  for (let i = 0; i < 30; i++) rungs.update(1 / 60, wall);
  // **まず「まだ届いていない」ことを出す** —— 常に真を返す実装をここで落とす
  check(
    "歩き出す前（x≈0.5）は掴まっていない",
    !rungs.onLadder,
    `x=${rungs.position.x.toFixed(3)} onLadder=${rungs.onLadder}`,
  );

  rungs.setKey("KeyW", true);
  for (let i = 0; i < 120; i++) rungs.update(1 / 60, wall);
  console.log(
    `      壁に押し付けた: x=${rungs.position.x.toFixed(4)}` +
      `（体の左端=${(rungs.position.x - PLAYER_SIZE.half).toFixed(4)} → マス ${Math.floor(rungs.position.x - PLAYER_SIZE.half)}）` +
      ` y=${rungs.position.y.toFixed(3)} onLadder=${rungs.onLadder}`,
  );
  check(
    "はしごのマスへ歩いて入ると onLadder が真",
    rungs.onLadder && rungs.position.x > 3,
    `x=${rungs.position.x.toFixed(4)} onLadder=${rungs.onLadder}`,
  );

  // 隣のマス（x=2 のまん中）に立っているだけでは偽。**これが無いと、
  // 常に真を返す実装でも上の 1 件が通ってしまう。**
  const nextTo = new Player(new PerspectiveCamera());
  nextTo.position.set(2.5, 11, 0.5);
  for (let i = 0; i < 30; i++) nextTo.update(1 / 60, wall);
  check(
    "隣のマスに立っているだけでは偽",
    !nextTo.onLadder,
    `x=${nextTo.position.x.toFixed(3)} 右端=${(nextTo.position.x + PLAYER_SIZE.half).toFixed(3)}（境目 3.0）`,
  );

  // Space を押した 60 フレーム（1 秒）で登る。壁に押し付けたまま測るので KeyW は押したまま。
  const beforeClimb = rungs.position.y;
  rungs.setKey("Space", true);
  for (let i = 0; i < 60; i++) rungs.update(1 / 60, wall);
  const climbed = rungs.position.y - beforeClimb;
  console.log(
    `      Space 1 秒: y ${beforeClimb.toFixed(3)} → ${rungs.position.y.toFixed(3)}` +
      ` （${climbed.toFixed(3)} m/s。既定 2.35）`,
  );
  check(
    "Space を押していると 2.35 m/s ほどで登る",
    climbed > 2.2 && climbed < 2.45 && rungs.onLadder,
    `${climbed.toFixed(3)} m/s onLadder=${rungs.onLadder}`,
  );

  // 離すと降りるが、自由落下よりずっと遅い。**対照（はしごの無い所で同じだけ落ちる）**
  // と比べる —— 無いと「重力のまま落ちている」実装が通る。
  //
  // **先に登り切っておくこと** —— 床（11）から 1 秒登っただけの y=13.35 で離すと、
  // 0.78 秒で床に着いてしまい、「1 秒で 3.0 m」ではなく「2.35 m で vy=0」を測る
  // （最初に書いたときそれで落ちた）。3 秒足して y≈20 から測る。
  for (let i = 0; i < 180; i++) rungs.update(1 / 60, wall);
  const beforeSlide = rungs.position.y;
  rungs.setKey("Space", false);
  for (let i = 0; i < 60; i++) rungs.update(1 / 60, wall);
  const slid = beforeSlide - rungs.position.y;
  const slideVy = rungs.velocity.y;

  const dropped = new Player(new PerspectiveCamera());
  dropped.position.set(0.5, 60, 0.5); // はしごも壁も無い所。1 秒では床（11）に届かない
  for (let i = 0; i < 60; i++) dropped.update(1 / 60, wall);
  const fell = 60 - dropped.position.y;
  console.log(
    `      Space を離して 1 秒: ${slid.toFixed(3)} m（vy=${slideVy.toFixed(2)}）` +
      ` / 対照の自由落下: ${fell.toFixed(3)} m（vy=${dropped.velocity.y.toFixed(2)}）`,
  );
  check(
    "離すと 3.0 m/s ほどで滑り降りる",
    slid > 2.8 && slid < 3.1 && Math.abs(slideVy + 3.0) < 0.01,
    `${slid.toFixed(3)} m vy=${slideVy.toFixed(2)}`,
  );
  check(
    "自由落下よりずっと遅い（対照と比べる）",
    fell > slid * 3 && dropped.velocity.y < slideVy * 5,
    `はしご ${slid.toFixed(3)} m / 自由落下 ${fell.toFixed(3)} m`,
  );

  cobweb(rungs);
}

/**
 * クモの巣に絡まる（`player.inCobweb`）。**はしごの節を写した形**で、違うのは
 * 「掴まって登る」ではなく「素通りするが鈍る」ところ。
 *
 * 巣は `solid: false` なので押し戻しは 1 度も起きず、**マスが重なるかどうか**だけで
 * 決まる（サボテン・はしごとまったく同じ `bodyTouches()` の走査）。
 * **どのブロックが絡むかは `blocks.ts` の `isSticky()`**、**どれだけ鈍るかは
 * `player.ts` の 2 定数**、**落ちたぶんを積むかどうかは `clinging`**。
 */
function cobweb(rungs: Player): void {
  describe("クモの巣に絡まる（player.inCobweb）");

  // 床 y=10（上面 11）の上、x=3..40 に巣を 2 段（y=11,12）敷く。体は 1.8 m なので
  // 頭（12.8）まで巣の中に入る。**歩いて入る**ので、手前（x<3）は空けておく。
  const field = new Arena();
  field.fill(-4, 60, 10, 10, -4, 4, STONE);
  field.fill(3, 40, 11, 12, -4, 4, COBWEB);
  const web = field as unknown as World;

  const walker = new Player(new PerspectiveCamera());
  walker.position.set(0.5, 11, 0.5);
  walker.yaw = -Math.PI / 2; // 前 = +X
  for (let i = 0; i < 30; i++) walker.update(1 / 60, web);
  // **まず「まだ届いていない」ことを出す** —— 常に真を返す実装をここで落とす。
  check(
    "歩き出す前（x≈0.5）は絡まっていない",
    !walker.inCobweb,
    `x=${walker.position.x.toFixed(3)} inCobweb=${walker.inCobweb}`,
  );

  walker.setKey("KeyW", true);
  for (let i = 0; i < 120; i++) walker.update(1 / 60, web);
  console.log(
    `      巣へ歩いて入った: x=${walker.position.x.toFixed(3)}` +
      `（体の右端=${(walker.position.x + PLAYER_SIZE.half).toFixed(3)} → マス ${Math.floor(walker.position.x + PLAYER_SIZE.half)}）` +
      ` inCobweb=${walker.inCobweb} onGround=${walker.onGround}`,
  );
  check(
    "巣のマスへ歩いて入ると inCobweb が真",
    walker.inCobweb && walker.position.x > 3,
    `x=${walker.position.x.toFixed(3)} inCobweb=${walker.inCobweb}`,
  );

  // 隣のマス（x=2 のまん中）に立っているだけでは偽。**これが無いと、
  // 常に真を返す実装でも上の 1 件が通ってしまう。**
  const nextTo = new Player(new PerspectiveCamera());
  nextTo.position.set(2.5, 11, 0.5);
  for (let i = 0; i < 30; i++) nextTo.update(1 / 60, web);
  check(
    "隣のマスに立っているだけでは偽",
    !nextTo.inCobweb,
    `x=${nextTo.position.x.toFixed(3)} 右端=${(nextTo.position.x + PLAYER_SIZE.half).toFixed(3)}（境目 3.0）`,
  );

  // --- 横の速さ（巣の外の 1/4）。**対照と同じ 1 秒で測ること。** ---
  // 上で 2 秒歩いているので、もう加速し切っている（測るのは定常速度）。
  const insideFrom = walker.position.x;
  for (let i = 0; i < 60; i++) walker.update(1 / 60, web);
  const insideSpeed = walker.position.x - insideFrom;

  const open = new Player(new PerspectiveCamera());
  open.position.set(0.5, 11, 0.5);
  open.yaw = -Math.PI / 2;
  open.setKey("KeyW", true);
  // 巣に入る手前で測る —— 巣は x=3 からなので、床だけの試験場で走らせる。
  const bare = new Arena();
  bare.fill(-4, 60, 10, 10, -4, 4, STONE);
  const clear = bare as unknown as World;
  for (let i = 0; i < 120; i++) open.update(1 / 60, clear);
  const openFrom = open.position.x;
  for (let i = 0; i < 60; i++) open.update(1 / 60, clear);
  const openSpeed = open.position.x - openFrom;
  console.log(
    `      1 秒で進んだ距離: 巣の中 ${insideSpeed.toFixed(3)} m/s / 巣の外 ${openSpeed.toFixed(3)} m/s` +
      `（比 ${(insideSpeed / openSpeed).toFixed(3)}。既定 0.25）`,
  );
  check(
    "巣の外は今までどおり 5.2 m/s（対照）",
    openSpeed > 5.1 && openSpeed < 5.3 && !open.inCobweb,
    `${openSpeed.toFixed(3)} m/s inCobweb=${open.inCobweb}`,
  );
  check(
    "巣の中では横の速さが 1/4（1.3 m/s ほど）",
    insideSpeed > 1.25 && insideSpeed < 1.35 && walker.inCobweb,
    `${insideSpeed.toFixed(3)} m/s（比 ${(insideSpeed / openSpeed).toFixed(3)}）`,
  );

  // --- 落ちる速さ（1.0 m/s 止まり）。**通り抜けない厚みで積むこと。** ---
  // 1 秒で 1 m しか落ちないので、y=20..40 に積んでおけば足りる。床は遠く（y=10）。
  const tower = new Arena();
  tower.fill(-4, 4, 10, 10, -4, 4, STONE);
  tower.fill(-4, 4, 20, 40, -4, 4, COBWEB);
  const shaftWeb = tower as unknown as World;

  const hanging = new Player(new PerspectiveCamera());
  hanging.position.set(0.5, 35, 0.5);
  for (let i = 0; i < 30; i++) hanging.update(1 / 60, shaftWeb);
  const fallFrom = hanging.position.y;
  for (let i = 0; i < 60; i++) hanging.update(1 / 60, shaftWeb);
  const sank = fallFrom - hanging.position.y;

  // **対照（巣の無い所で同じ 1 秒）** —— 無いと「重力のまま落ちている」実装が通る。
  // **巣の無い試験場で落とすこと** —— 同じ塔で落とすと、1.5 秒で 31 m 落ちて
  // 巣の帯（20..40）に突っ込み、対照が対照でなくなる（最初に書いたときそれで落ちた）。
  const freefall = new Player(new PerspectiveCamera());
  freefall.position.set(0.5, 60, 0.5); // 床（10）までは 1.5 秒では届かない
  for (let i = 0; i < 30; i++) freefall.update(1 / 60, clear);
  const bareFrom = freefall.position.y;
  for (let i = 0; i < 60; i++) freefall.update(1 / 60, clear);
  const bareFell = bareFrom - freefall.position.y;
  console.log(
    `      1 秒で落ちた距離: 巣の中 ${sank.toFixed(3)} m（vy=${hanging.velocity.y.toFixed(2)}）` +
      ` / 対照の自由落下 ${bareFell.toFixed(3)} m（vy=${freefall.velocity.y.toFixed(2)}）`,
  );
  check(
    "巣の中では 1.0 m/s 止まりで落ちる",
    sank > 0.95 && sank < 1.05 && Math.abs(hanging.velocity.y + 1) < 1e-9 && hanging.inCobweb,
    `${sank.toFixed(3)} m vy=${hanging.velocity.y.toFixed(3)}`,
  );
  check(
    "自由落下よりずっと遅い（対照と比べる）",
    bareFell > sank * 10 && !freefall.inCobweb,
    `巣 ${sank.toFixed(3)} m / 自由落下 ${bareFell.toFixed(3)} m`,
  );

  // --- 絡まっているあいだは落ちたぶんを積まない（`clinging`。はしごと同じ扱い） ---
  // **判断は `player.ts` の `clinging` ゲッター 1 か所**（`vitals.ts` は
  // 「はしごか巣か」を知らない。落下ダメージそのものは `test/vitals.test.ts`）。
  console.log(
    `      clinging: 巣の中 ${hanging.clinging}（onLadder=${hanging.onLadder} inCobweb=${hanging.inCobweb})` +
      ` / はしご ${rungs.clinging} / 何も無い所 ${freefall.clinging}`,
  );
  check(
    "巣の中でもはしごでも clinging が真、何も無い所では偽",
    hanging.clinging && rungs.clinging && !freefall.clinging,
    `巣 ${hanging.clinging} / はしご ${rungs.clinging} / 対照 ${freefall.clinging}`,
  );
}
