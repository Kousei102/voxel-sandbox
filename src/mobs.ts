/**
 * モブ。**判断はここに全部置く**（種類の表・形・物理・歩行位相。これから AI・湧き・戦闘も）。
 *
 * 描画は `mobrender.ts` にしかない。`CLAUDE.md`「確かめられないものは、確かめられるものから
 * 切り離す」に合わせた切り分けで、**ここに `Mesh` / `BufferGeometry` / `Material` を持ち込まないこと。**
 * `test/mobs.test.ts` がソースを読んで見張っている。崩すと、モブまわりが丸ごと
 * 「ブラウザを開くまで確かめられないもの」になる。
 *
 * three からは `Color`（色を焼くだけ）と `Vector3`（座標）しか使わない。どちらも Node で動く。
 */

import { Color, Vector3 } from "three";
import { GRASS, WATER, isSolid } from "./blocks";
import { CHUNK_BITS, WORLD_HEIGHT } from "./constants";
import { SKY_LIGHT } from "./lighting";
import { type BodySize, boxBlocked, groundBelow, moveBody } from "./physics";
import type { World } from "./world";

// --- 種類の表 -----------------------------------------------------------

export type MobKind = "pig" | "sheep";

/** 部位の動き方。 */
export type MobMotion =
  /** 体に固定。まとめて 1 つの形にする。 */
  | "fixed"
  /** 頭。向いている方を見る。 */
  | "head"
  /** 脚。歩幅に合わせて前後に振る。 */
  | "swing";

export interface MobGroup {
  readonly motion: MobMotion;
  /**
   * 取り付け位置（モデル座標。足の中心が原点、`-Z` が前）。
   * **振る部位はここが回転軸になる。**
   */
  readonly pivot: readonly [number, number, number];
  /** 振りの位相のずらし。前後左右の脚を互い違いにするのに使う。 */
  readonly phase: number;
}

export interface MobBox {
  /** どのグループに属するか（`MobDef.groups` の添字）。 */
  readonly group: number;
  /**
   * 形 `[x0,y0,z0,x1,y1,z1]`。**グループの `pivot` からの相対。**
   *
   * `swing` のグループでは `y1` が 0 でなければならない（＝軸からぶら下がる）。
   * 0 でないと**足首で回る**という、見た目にはアニメの不具合に見える壊れ方をする。
   * `test/mobs.test.ts` が押さえている。
   */
  readonly box: readonly number[];
  /** sRGB hex。線形空間への変換は `mobRgb()` が three の `Color` でやる。 */
  readonly color: number;
}

export interface MobDef {
  readonly kind: MobKind;
  readonly name: string;
  /** 当たり判定。段差 0.5 なのでハーフは登れるが階段の 1 段（0.5）までで、壁は登れない。 */
  readonly size: BodySize;
  readonly maxHealth: number;
  /** 歩く速さ (m/s)。 */
  readonly speed: number;
  /**
   * 敵対（暗い所に湧いてプレイヤーを襲う）。
   * 湧きの上限を受動と別に持つので、受動しか居なくても意味がある。
   */
  readonly hostile: boolean;
  readonly groups: readonly MobGroup[];
  readonly boxes: readonly MobBox[];
}

/** 1 ピクセル = 1/16 ブロック。マイクラのモデルの寸法をそのまま書けるようにする。 */
const PX = 1 / 16;
const px = (n: number): number => n * PX;

const PIG_SKIN = 0xf0a5a2;
const PIG_SNOUT = 0xd9797b;
const PIG_EYE = 0x2b1e1c;

/**
 * 豚。当たり判定はマイクラと同じ 0.9 x 0.9。
 *
 * **モデルは当たり判定の中に収める。** マイクラは体がはみ出しているが、
 * はみ出すと壁の向こうへ鼻が突き抜けて見える（当たり判定は止まっているのに
 * 顔だけ壁に埋まる）。そのぶん胴を詰めてあるので、本家より少しずんぐりしている。
 * `test/mobs.test.ts` が外形と当たり判定を突き合わせている。
 *
 * グループの並び: 0 = 体（固定）、1 = 頭、2..5 = 脚 4 本。
 * 脚の位相は対角の 2 本が同じ向きに出るようにずらす（4 本そろうと跳ねて見える）。
 */
const PIG: MobDef = {
  kind: "pig",
  name: "豚",
  size: { half: 0.45, height: 0.9, step: 0.5 },
  maxHealth: 10,
  speed: 1.7,
  hostile: false,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(10), px(-3)], phase: 0 },
    { motion: "swing", pivot: [px(-3), px(6), px(-1)], phase: 0 },
    { motion: "swing", pivot: [px(3), px(6), px(-1)], phase: Math.PI },
    { motion: "swing", pivot: [px(-3), px(6), px(4)], phase: Math.PI },
    { motion: "swing", pivot: [px(3), px(6), px(4)], phase: 0 },
  ],
  boxes: [
    // 体
    { group: 0, box: [px(-5), px(6), px(-3), px(5), px(14), px(6)], color: PIG_SKIN },
    // 頭（軸は首の付け根。箱は軸からの相対）
    { group: 1, box: [px(-4), px(-4), px(-3), px(4), px(4), px(0)], color: PIG_SKIN },
    { group: 1, box: [px(-2), px(-3), px(-4), px(2), px(0), px(-3)], color: PIG_SNOUT },
    { group: 1, box: [px(-3), px(1), px(-3.2), px(-1.5), px(2.5), px(-3)], color: PIG_EYE },
    { group: 1, box: [px(1.5), px(1), px(-3.2), px(3), px(2.5), px(-3)], color: PIG_EYE },
    // 脚（**軸からぶら下げる = y1 が 0**。0 でないと足首で回る）
    { group: 2, box: [px(-2), px(-6), px(-2), px(2), 0, px(2)], color: PIG_SKIN },
    { group: 3, box: [px(-2), px(-6), px(-2), px(2), 0, px(2)], color: PIG_SKIN },
    { group: 4, box: [px(-2), px(-6), px(-2), px(2), 0, px(2)], color: PIG_SKIN },
    { group: 5, box: [px(-2), px(-6), px(-2), px(2), 0, px(2)], color: PIG_SKIN },
  ],
};

const SHEEP_WOOL = 0xe8e4dc;
const SHEEP_FACE = 0xd6c8b4;
const SHEEP_EYE = 0x2b1e1c;

/**
 * 羊。豚より背が高く（1.2）、頭が体から前に出ている。
 * 豚と同じ骨組み（体・頭・脚 4 本）なので、違うのは寸法と色だけ。
 */
const SHEEP: MobDef = {
  kind: "sheep",
  name: "羊",
  size: { half: 0.45, height: 1.2, step: 0.5 },
  maxHealth: 8,
  speed: 1.5,
  hostile: false,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(15), px(-2)], phase: 0 },
    { motion: "swing", pivot: [px(-3), px(9), px(-2)], phase: 0 },
    { motion: "swing", pivot: [px(3), px(9), px(-2)], phase: Math.PI },
    { motion: "swing", pivot: [px(-3), px(9), px(4)], phase: Math.PI },
    { motion: "swing", pivot: [px(3), px(9), px(4)], phase: 0 },
  ],
  boxes: [
    // もこもこした体
    { group: 0, box: [px(-5), px(9), px(-4), px(5), px(18), px(6)], color: SHEEP_WOOL },
    // 頭（軸は首の付け根。箱は軸からの相対）
    { group: 1, box: [px(-3), px(-3), px(-4), px(3), px(3), px(0)], color: SHEEP_WOOL },
    { group: 1, box: [px(-2.5), px(-3), px(-5), px(2.5), px(1.5), px(-4)], color: SHEEP_FACE },
    { group: 1, box: [px(-2.5), px(0), px(-5.1), px(-1), px(1.5), px(-5)], color: SHEEP_EYE },
    { group: 1, box: [px(1), px(0), px(-5.1), px(2.5), px(1.5), px(-5)], color: SHEEP_EYE },
    // 脚（**軸からぶら下げる = y1 が 0**）
    { group: 2, box: [px(-2), px(-9), px(-2), px(2), 0, px(2)], color: SHEEP_FACE },
    { group: 3, box: [px(-2), px(-9), px(-2), px(2), 0, px(2)], color: SHEEP_FACE },
    { group: 4, box: [px(-2), px(-9), px(-2), px(2), 0, px(2)], color: SHEEP_FACE },
    { group: 5, box: [px(-2), px(-9), px(-2), px(2), 0, px(2)], color: SHEEP_FACE },
  ],
};

export const MOBS: Record<MobKind, MobDef> = { pig: PIG, sheep: SHEEP };
export const MOB_KINDS: readonly MobKind[] = ["pig", "sheep"];

/**
 * sRGB hex を線形空間の RGB へ。**ブロックの色とまったく同じ道を通すこと**
 * （`blocks.ts` の `FACE_COLORS` も `Color.setHex()` で焼いている）。
 * 別の道にすると、ピンクの豚とピンクの羊毛が違う色空間に乗る。
 */
const colorScratch = new Color();
export function mobRgb(hex: number, out: Float32Array): void {
  colorScratch.setHex(hex);
  out[0] = colorScratch.r;
  out[1] = colorScratch.g;
  out[2] = colorScratch.b;
}

// --- 歩行の位相 ---------------------------------------------------------

/** 1 ブロック歩くと位相がどれだけ進むか。 */
export const WALK_PHASE_PER_BLOCK = 3.4;
/** 脚の振れ幅 (rad)。 */
export const WALK_SWING = 0.9;

/**
 * 脚の振り。**位相は時間ではなく歩いた距離で進める**（`StepCadence` と同じ理屈）。
 * 壁に押し付けられたモブは脚を振らず、逃げるモブは自然に速く振る。
 */
export function walkSwing(phase: number, amplitude = WALK_SWING): number {
  return Math.sin(phase) * amplitude;
}

// --- 個体 ---------------------------------------------------------------

const GRAVITY = 30;
const TERMINAL = 55;
/**
 * 水に入ると、この速さで浮き上がる。**沈む向きにしないこと。**
 * 沈むと水底を歩き続け、あとで空腹や溺れを入れたときに黙って死んでいく
 * （プレイヤーからは「モブが居ない」という形でしか見えない）。
 * 水面まで来ると頭が出て `inWater` が落ち、重力で少し沈む — その繰り返しで水面に浮く。
 */
const WATER_RISE = 1.4;

/** 横方向の加速。接地しているときのほうがよく効く（空中で方向転換しない）。 */
const ACCEL_GROUND = 26;
const ACCEL_AIR = 4;

export interface Mob {
  readonly id: number;
  readonly kind: MobKind;
  readonly position: Vector3;
  readonly velocity: Vector3;
  onGround: boolean;
  inWater: boolean;
  /** 体の向き。0 のとき前は -Z（`player.ts` の forward と同じ規約）。 */
  yaw: number;
  health: number;
  /** 歩いた距離で進む位相。脚の振りに使う。 */
  walkPhase: number;
  /** 歩いているか。false なら止まって周りを見ている。 */
  walking: boolean;
  /** 向きたい方向。ここへ少しずつ回る（瞬間的に向くとカクつく）。 */
  targetYaw: number;
  /** いまの状態があと何秒続くか。 */
  stateTimer: number;
  /** 次に判断するまでの残り。個体ごとにずらしてあるので、同じフレームに集中しない。 */
  thinkTimer: number;
  /** 頭の向き（体からの相対）。近くのプレイヤーを見る。 */
  headYaw: number;
  headPitch: number;
}

// --- AI と湧きの決まり ---------------------------------------------------

/** 判断の間隔。物理は毎フレーム、判断は 5Hz。 */
export const AI_TICK = 0.2;
/** 徘徊・待機がそれぞれ続く長さの幅 (秒)。 */
const WANDER_TIME: readonly [number, number] = [2, 6];
const IDLE_TIME: readonly [number, number] = [1.5, 5];
/** 向きが追いつく速さ (rad/s)。 */
const TURN_SPEED = 4;
/** この距離より近いプレイヤーを目で追う。 */
export const LOOK_DISTANCE = 8;
/** 頭が振り向ける角度の上限。これを超えるぶんは体ごと向くまで見ない。 */
const HEAD_YAW_LIMIT = Math.PI / 3;
const HEAD_PITCH_LIMIT = Math.PI / 6;
/** 進む先を何ブロック先まで見るか（崖を避けるため）。 */
const LEDGE_LOOKAHEAD = 1.2;
/** これより深い落差の手前では引き返す。 */
export const LEDGE_MAX_DROP = 3;

/** 受動モブが湧くのに要るスカイライト。 */
export const PASSIVE_SKY_MIN = 9;
/** 同時に居られる数。 */
export const MAX_MOBS = 40;
export const MAX_PASSIVE = 16;
/** 湧きを試す間隔と、1 回に試す回数。 */
export const SPAWN_INTERVAL = 0.5;
export const SPAWN_ATTEMPTS = 6;
/**
 * 湧く距離の幅。`REACH`(6) よりずっと遠くて、描画距離 (7 x 16 = 112) の内側。
 * 近すぎると目の前に湧いて見え、遠すぎると描かれない所で増えるだけになる。
 */
export const SPAWN_MIN_DISTANCE = 28;
export const SPAWN_MAX_DISTANCE = 52;
/**
 * これより遠いモブは消す。
 * **`UNLOAD_DISTANCE * CHUNK_SIZE`(160) より小さいこと。**
 * 大きいと、ボクセルの無い列にモブが立ち（`getVoxel` が AIR を返す）、世界を突き抜けて落ちる。
 */
export const DESPAWN_DISTANCE = 72;
/** 半径 8 以内にこの数以上居たら、そこにはもう湧かせない（固まって湧かないように）。 */
const CROWD_RADIUS = 8;
const CROWD_LIMIT = 2;
/** 湧く高さを探すとき、プレイヤーの頭上いくつから下へいくつまで見るか。 */
const SPAWN_SCAN_UP = 16;
const SPAWN_SCAN_DEPTH = 24;

/**
 * 湧きの判定に使う明るさ。**シェーダの合成とまったく同じ式にすること。**
 * `terrainshader.ts` は `max(sky * uDaylight, block)` で描いているので、
 * ここがずれると「明るく見えるのに湧く」場所ができる。
 */
export function spawnLight(sky: number, block: number, brightness: number): number {
  return Math.max(sky * brightness, block);
}

/**
 * 受動モブが湧ける地面か。**こちらは `brightness` を掛けない生のスカイライト**で見る。
 * 掛けると夜のあいだ 1 体も湧かず、朝には世界が空になる。
 */
export function canSpawnPassive(sky: number, ground: number): boolean {
  return sky >= PASSIVE_SKY_MIN && ground === GRASS;
}

/** モブの周りの状況。`main.ts` から毎フレーム渡す。 */
export interface MobContext {
  readonly playerX: number;
  readonly playerY: number;
  readonly playerZ: number;
  /** 昼夜の明るさ 0..1（`DayNight.brightness`）。 */
  readonly brightness: number;
  /** 乱数。テストで固定できるように差し替えられる形にしておく。 */
  readonly random?: () => number;
}

/**
 * モブの群れ。**毎フレームの駆動役をここに置くのが肝心。**
 * `main.ts` に散らすと、湧きの間隔・上限・デスポーンのような
 * 「静かに壊れる」判断が DOM 込みでしか確かめられなくなる。
 */
export class Mobs {
  readonly list: Mob[] = [];
  private nextId = 1;
  private spawnTimer = 0;

  get count(): number {
    return this.list.length;
  }

  /** モブを 1 体置く。位置は足の中心。 */
  spawn(kind: MobKind, x: number, y: number, z: number, yaw = 0, random = Math.random): Mob {
    const mob: Mob = {
      id: this.nextId++,
      kind,
      position: new Vector3(x, y, z),
      velocity: new Vector3(0, 0, 0),
      onGround: false,
      inWater: false,
      yaw,
      health: MOBS[kind].maxHealth,
      walkPhase: 0,
      walking: false,
      targetYaw: yaw,
      stateTimer: pick(random, IDLE_TIME),
      // 判断のタイミングを個体ごとにずらす。そろえると 5 フレームに 1 回だけ
      // 全員ぶんの判断が固まって、そこがフレームの最悪値になる。
      thinkTimer: random() * AI_TICK,
      headYaw: 0,
      headPitch: 0,
    };
    this.list.push(mob);
    return mob;
  }

  clear(): void {
    this.list.length = 0;
    this.spawnTimer = 0;
  }

  /**
   * 1 フレームぶん進める。
   *
   * **`world.update()` の外で回すこと。** チャンク生成の予算（3ms）の下に入れると、
   * モブの退行とストリーミングの退行が `test/world.test.ts` の p99 で区別できなくなる。
   */
  update(dt: number, world: World, ctx: MobContext): void {
    const random = ctx.random ?? Math.random;

    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer -= SPAWN_INTERVAL;
      for (let i = 0; i < SPAWN_ATTEMPTS; i++) this.trySpawn(world, ctx, random);
    }

    this.despawnFar(ctx);

    for (const mob of this.list) {
      const def = MOBS[mob.kind];

      // ボクセルの無い列に居るあいだは動かさない。`getVoxel` が AIR を返すので、
      // そのまま物理を回すと世界を突き抜けて落ちていく。
      if (!world.hasColumn(columnOf(mob.position.x), columnOf(mob.position.z))) continue;

      mob.thinkTimer -= dt;
      if (mob.thinkTimer <= 0) {
        mob.thinkTimer += AI_TICK;
        this.think(mob, def, world, ctx, random);
      }

      this.step(mob, def, world, dt);
    }
  }

  /** 判断（5Hz）。**進む向き・止まる・頭の向きはここだけで決める。** */
  private think(
    mob: Mob,
    def: MobDef,
    world: World,
    ctx: MobContext,
    random: () => number,
  ): void {
    mob.stateTimer -= AI_TICK;
    if (mob.stateTimer <= 0) {
      mob.walking = !mob.walking;
      mob.stateTimer = pick(random, mob.walking ? WANDER_TIME : IDLE_TIME);
      if (mob.walking) mob.targetYaw = random() * Math.PI * 2;
    }

    // 進む先が崖なら引き返す。**これが無いと、そのうち全部が穴に落ちる。**
    if (mob.walking && mob.onGround) {
      const ahead = forwardOf(mob.targetYaw);
      const gx = mob.position.x + ahead[0] * LEDGE_LOOKAHEAD;
      const gz = mob.position.z + ahead[1] * LEDGE_LOOKAHEAD;
      if (groundBelow(world, gx, mob.position.y, gz, def.size, LEDGE_MAX_DROP) === -Infinity) {
        mob.targetYaw += Math.PI * (0.5 + random());
        mob.stateTimer = Math.min(mob.stateTimer, 1);
        // **その場の勢いも殺すこと。** 向きは少しずつしか変わらないので、
        // 目標だけ変えても崖の側へ滑っていって落ちる。
        mob.velocity.x = 0;
        mob.velocity.z = 0;
      }
    }

    this.aimHead(mob, ctx);
  }

  /**
   * 近くのプレイヤーを目で追う。体ごと向くわけではないので、
   * 振り向ける角度には上限を置く（超えると首が裏返って見える）。
   */
  private aimHead(mob: Mob, ctx: MobContext): void {
    const dx = ctx.playerX - mob.position.x;
    const dz = ctx.playerZ - mob.position.z;
    const flat = Math.hypot(dx, dz);
    if (flat > LOOK_DISTANCE) {
      mob.headYaw = 0;
      mob.headPitch = 0;
      return;
    }
    const def = MOBS[mob.kind];
    const dy = ctx.playerY + 1.4 - (mob.position.y + def.size.height * 0.8);
    // yaw 0 = -Z 向き。atan2(-dx, -dz) がその規約での方位になる。
    const want = Math.atan2(-dx, -dz);
    mob.headYaw = clamp(wrapAngle(want - mob.yaw), -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT);
    mob.headPitch = clamp(-Math.atan2(dy, Math.max(0.1, flat)), -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT);
  }

  /** 物理（毎フレーム）。 */
  private step(mob: Mob, def: MobDef, world: World, dt: number): void {
    const beforeX = mob.position.x;
    const beforeZ = mob.position.z;

    mob.inWater =
      world.getVoxel(
        Math.floor(mob.position.x),
        Math.floor(mob.position.y + def.size.height * 0.5),
        Math.floor(mob.position.z),
      ) === WATER;

    // 向きは少しずつ追いつかせる（瞬間的に向くとカクついて見える）
    mob.yaw += clamp(wrapAngle(mob.targetYaw - mob.yaw), -TURN_SPEED * dt, TURN_SPEED * dt);

    // 向きが目標からずれているあいだは前へ出さない。**曲がりながら進ませないこと。**
    // 崖の手前で向きを変えても、古い向きのまま滑っていって落ちる。
    const aligned = Math.max(0, Math.cos(wrapAngle(mob.targetYaw - mob.yaw)));
    const speed = mob.walking ? def.speed * aligned : 0;
    const forward = forwardOf(mob.yaw);
    const accel = (mob.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
    const targetX = forward[0] * speed;
    const targetZ = forward[1] * speed;
    mob.velocity.x += clamp(targetX - mob.velocity.x, -accel, accel);
    mob.velocity.z += clamp(targetZ - mob.velocity.z, -accel, accel);

    if (mob.inWater) {
      // 落ちてきた勢いを殺しつつ、水面へ向かって浮く
      mob.velocity.y += (WATER_RISE - mob.velocity.y) * Math.min(1, dt * 6);
    } else {
      mob.velocity.y -= GRAVITY * dt;
      if (mob.velocity.y < -TERMINAL) mob.velocity.y = -TERMINAL;
    }

    moveBody(world, mob, def.size, dt, mob.onGround);

    // 歩いた距離で位相を進める（時間で進めると、壁際で足踏みして見える）
    const moved = Math.hypot(mob.position.x - beforeX, mob.position.z - beforeZ);
    mob.walkPhase += moved * WALK_PHASE_PER_BLOCK;
  }

  /**
   * 遠くなったモブを消す。数が増え続けないのはここと湧きの上限の 2 つで保つ。
   * 上限を超えているぶんも遠いものから消す。
   */
  private despawnFar(ctx: MobContext): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const mob = this.list[i];
      if (distanceTo(mob, ctx) > DESPAWN_DISTANCE) this.list.splice(i, 1);
    }
    while (this.list.length > MAX_MOBS) {
      let far = 0;
      let best = -1;
      for (let i = 0; i < this.list.length; i++) {
        const d = distanceTo(this.list[i], ctx);
        if (d > best) {
          best = d;
          far = i;
        }
      }
      this.list.splice(far, 1);
    }
  }

  /**
   * 湧きを 1 回だけ試す。**時間ではなく回数で区切る**のは、1 回がマイクロ秒で済むから
   * （チャンク生成のように 1 件が数 ms かかるものだけ時計で区切る）。
   * そのぶん決定的になり、個体数のテストが意味を持つ。
   */
  private trySpawn(world: World, ctx: MobContext, random: () => number): void {
    if (this.list.length >= MAX_MOBS) return;
    let passive = 0;
    for (const mob of this.list) if (!MOBS[mob.kind].hostile) passive++;
    if (passive >= MAX_PASSIVE) return;

    const angle = random() * Math.PI * 2;
    const radius = SPAWN_MIN_DISTANCE + random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
    const x = Math.floor(ctx.playerX + Math.cos(angle) * radius);
    const z = Math.floor(ctx.playerZ + Math.sin(angle) * radius);

    // **未生成の列に湧かせないこと。** getVoxel が AIR を返すので、空中に湧いて
    // あとから地形が生えて閉じ込められる。
    if (!world.hasColumn(columnOf(x), columnOf(z))) return;

    const y = findGround(world, x, Math.floor(ctx.playerY) + SPAWN_SCAN_UP, z);
    if (y < 0) return;

    const ground = world.getVoxel(x, y - 1, z);
    if (world.getVoxel(x, y, z) === WATER) return;
    if (!canSpawnPassive(world.getLight(x, y, z, SKY_LIGHT), ground)) return;

    const kind: MobKind = random() < 0.5 ? "pig" : "sheep";
    const px = x + 0.5;
    const pz = z + 0.5;
    // 形のあるブロック（ハーフ・階段）の中に湧かないよう、当たり判定の箱で見る
    if (boxBlocked(world, px, y, pz, MOBS[kind].size)) return;

    let near = 0;
    for (const mob of this.list) {
      const dx = mob.position.x - px;
      const dz = mob.position.z - pz;
      if (dx * dx + dz * dz <= CROWD_RADIUS * CROWD_RADIUS) near++;
    }
    if (near >= CROWD_LIMIT) return;

    this.spawn(kind, px, y, pz, random() * Math.PI * 2, random);
  }

  /**
   * まとめて湧かせる。ワールドを開いた直後が空っぽにならないように使う
   * （モブは保存しないので、読み込み直後は必ず 0 体から始まる）。
   */
  populate(world: World, ctx: MobContext, attempts = 200): void {
    const random = ctx.random ?? Math.random;
    for (let i = 0; i < attempts; i++) this.trySpawn(world, ctx, random);
  }
}

// --- 小物 ---------------------------------------------------------------

/** yaw 0 のとき前は -Z（`player.ts` の forward と同じ）。 */
function forwardOf(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** 角度を -π..π に畳む。畳まないと、359 度の差を「遠回り」してしまう。 */
function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

function pick(random: () => number, range: readonly [number, number]): number {
  return range[0] + random() * (range[1] - range[0]);
}

function distanceTo(mob: Mob, ctx: MobContext): number {
  return Math.hypot(mob.position.x - ctx.playerX, mob.position.z - ctx.playerZ);
}

/**
 * `from` から下へ探して、上が空いている最初の固い地面の高さを返す。無ければ -1。
 * **列を丸ごと（128 段）走査しないこと。** 湧きは 1 フレームに何度も試すので、
 * ここが重いと湧きだけでフレームを食う。
 */
function findGround(world: World, x: number, from: number, z: number): number {
  const top = Math.min(WORLD_HEIGHT - 1, from);
  for (let y = top; y > top - SPAWN_SCAN_DEPTH && y > 1; y--) {
    if (!isSolid(world.getVoxel(x, y - 1, z))) continue;
    if (isSolid(world.getVoxel(x, y, z))) continue;
    return y;
  }
  return -1;
}

/**
 * ワールド座標 → 列の座標。**`>>` に直接渡さないこと。**
 * ビット演算は 0 に向かって切り捨てるので、-0.5 が 0 になって隣の列を見てしまう。
 */
function columnOf(v: number): number {
  return Math.floor(v) >> CHUNK_BITS;
}
