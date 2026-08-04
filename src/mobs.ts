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
import { WATER } from "./blocks";
import { type BodySize, moveBody } from "./physics";
import type { World } from "./world";

// --- 種類の表 -----------------------------------------------------------

export type MobKind = "pig";

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
  speed: 2.4,
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

export const MOBS: Record<MobKind, MobDef> = { pig: PIG };
export const MOB_KINDS: readonly MobKind[] = ["pig"];

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

export interface Mob {
  readonly id: number;
  readonly kind: MobKind;
  readonly position: Vector3;
  readonly velocity: Vector3;
  onGround: boolean;
  inWater: boolean;
  yaw: number;
  health: number;
  /** 歩いた距離で進む位相。脚の振りに使う。 */
  walkPhase: number;
}

/**
 * モブの群れ。**毎フレームの駆動役をここに置くのが肝心。**
 * `main.ts` に散らすと、湧きの間隔・上限・デスポーンのような
 * 「静かに壊れる」判断が DOM 込みでしか確かめられなくなる。
 */
export class Mobs {
  readonly list: Mob[] = [];
  private nextId = 1;

  get count(): number {
    return this.list.length;
  }

  /** モブを 1 体置く。位置は足の中心。 */
  spawn(kind: MobKind, x: number, y: number, z: number, yaw = 0): Mob {
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
    };
    this.list.push(mob);
    return mob;
  }

  clear(): void {
    this.list.length = 0;
  }

  /**
   * 1 フレームぶん進める。
   *
   * **`world.update()` の外で回すこと。** チャンク生成の予算（3ms）の下に入れると、
   * モブの退行とストリーミングの退行が `test/world.test.ts` の p99 で区別できなくなる。
   */
  update(dt: number, world: World): void {
    for (const mob of this.list) {
      const def = MOBS[mob.kind];
      const before = mob.position;
      const beforeX = before.x;
      const beforeZ = before.z;

      mob.inWater =
        world.getVoxel(
          Math.floor(before.x),
          Math.floor(before.y + def.size.height * 0.5),
          Math.floor(before.z),
        ) === WATER;

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
  }
}
