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
import { GRASS, WATER, WOOL, isSolid } from "./blocks";
import { CHUNK_BITS, MAX_LIGHT, WORLD_HEIGHT } from "./constants";
import { RAW_PORK, ROTTEN_FLESH, toolOf } from "./items";
import { BLOCK_LIGHT, SKY_LIGHT } from "./lighting";
import { type BodySize, boxBlocked, groundBelow, moveBody } from "./physics";
import { rayBox } from "./raycast";
import type { Sfx } from "./sfx";
import { MOB_HURT_COOLDOWN, type DamageCause } from "./vitals";
import type { World } from "./world";

// --- 種類の表 -----------------------------------------------------------

export type MobKind = "pig" | "sheep" | "zombie";

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

/** 倒したときに出るもの。 */
export interface MobDrop {
  readonly item: number;
  readonly count: number;
  /** 落ちる確率。1 なら必ず。 */
  readonly chance: number;
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
  /**
   * 倒したときのドロップ。**落ちたアイテムの仕組みがまだ無いので、
   * 倒した瞬間にインベントリへ入れる**（`CLAUDE.md` の見取り図どおり）。
   */
  readonly drop: MobDrop;
  /**
   * 声の高さの倍率。**種類ごとに `Sfx` を増やさないこと**
   * （出来事 × 種類で膨らむ）。`recipeFor` が freq と cutoff に掛ける。
   */
  readonly voice: number;
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
  drop: { item: RAW_PORK, count: 1, chance: 1 },
  voice: 1.4,
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
  drop: { item: WOOL, count: 1, chance: 1 },
  voice: 1.25,
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

const ZOMBIE_SKIN = 0x5f9e46;
const ZOMBIE_SHIRT = 0x2f6b6b;
const ZOMBIE_PANTS = 0x3b4a86;
const ZOMBIE_EYE = 0x16240f;

/**
 * ゾンビ。**唯一の敵対モブ。** 暗い所に湧いてプレイヤーを追いかけ、日光で燃える。
 *
 * 当たり判定は 0.8 x 1.9（プレイヤーの 0.6 x 1.8 より少し太い）。腕を体の横に付けると
 * 幅 0.375 になるので、これより細くすると腕が判定からはみ出す（＝壁に腕が刺さって見える）。
 * 段差は `STEP_HEIGHT` と同じ 0.6 にしてあり、**プレイヤーが登れる所には付いてくる。**
 * ここだけ受動モブ（0.5）より大きいのは、階段で撒けてしまうと追われている感じが出ないため。
 *
 * グループの並び: 0 = 体（固定）、1 = 頭、2..3 = 腕、4..5 = 脚。
 * 腕は同じ側の脚と逆の位相にする（人の歩き方。そろえると行進して見える）。
 */
const ZOMBIE: MobDef = {
  kind: "zombie",
  name: "ゾンビ",
  size: { half: 0.4, height: 1.9, step: 0.6 },
  maxHealth: 12,
  // プレイヤーの歩き (5.2) よりわずかに遅く、走り (8.4) からは離される速さ。
  // 歩きより速くすると、一度見つかったら振り切れなくなる。
  speed: 4.6,
  hostile: true,
  drop: { item: ROTTEN_FLESH, count: 1, chance: 0.6 },
  voice: 0.7,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(22), 0], phase: 0 },
    { motion: "swing", pivot: [px(-5), px(21), 0], phase: Math.PI },
    { motion: "swing", pivot: [px(5), px(21), 0], phase: 0 },
    { motion: "swing", pivot: [px(-2), px(11), 0], phase: 0 },
    { motion: "swing", pivot: [px(2), px(11), 0], phase: Math.PI },
  ],
  boxes: [
    // 胴
    { group: 0, box: [px(-4), px(11), px(-2), px(4), px(22), px(2)], color: ZOMBIE_SHIRT },
    // 頭（軸は首。箱は軸からの相対）
    { group: 1, box: [px(-4), 0, px(-4), px(4), px(8), px(4)], color: ZOMBIE_SKIN },
    { group: 1, box: [px(-2.5), px(4), px(-4.1), px(-1), px(5.5), px(-4)], color: ZOMBIE_EYE },
    { group: 1, box: [px(1), px(4), px(-4.1), px(2.5), px(5.5), px(-4)], color: ZOMBIE_EYE },
    // 腕・脚（**軸からぶら下げる = y1 が 0**。0 でないと肘や足首で回る）
    { group: 2, box: [px(-1), px(-10), px(-2), px(1), 0, px(2)], color: ZOMBIE_SKIN },
    { group: 3, box: [px(-1), px(-10), px(-2), px(1), 0, px(2)], color: ZOMBIE_SKIN },
    { group: 4, box: [px(-2), px(-11), px(-2), px(2), 0, px(2)], color: ZOMBIE_PANTS },
    { group: 5, box: [px(-2), px(-11), px(-2), px(2), 0, px(2)], color: ZOMBIE_PANTS },
  ],
};

export const MOBS: Record<MobKind, MobDef> = { pig: PIG, sheep: SHEEP, zombie: ZOMBIE };
export const MOB_KINDS: readonly MobKind[] = ["pig", "sheep", "zombie"];
/** 湧きの抽選に使う受動モブ。**敵対と混ぜないこと**（湧く条件も上限も別）。 */
const PASSIVE_KINDS: readonly MobKind[] = ["pig", "sheep"];

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
/**
 * 水中での速さの倍率。**`player.ts` の 0.6 と同じにすること。**
 * ずれると、水に入った瞬間にプレイヤーとゾンビの追いかけっこの勝敗が変わる
 * （速いほうへ逃げ込めば必ず振り切れる／絶対に振り切れない、のどちらかになる）。
 */
const WATER_SPEED = 0.6;

/** 横方向の加速。接地しているときのほうがよく効く（空中で方向転換しない）。 */
const ACCEL_GROUND = 26;
const ACCEL_AIR = 4;
/**
 * 1 ブロックの壁を跳び越えるときの初速。`GRAVITY`(30) で約 1.2 ブロック上がるので、
 * 立方体 1 個ぶん（段差登りの 0.5 では越えられない高さ）を越えられる。
 * 上げすぎると 2 段の壁まで登ってしまい、囲いの意味が無くなる。
 */
const JUMP_SPEED = 8.6;
/**
 * 跳んでいるあいだ、前へ出す速さを保つ長さ (秒)。
 *
 * **これが無いと跳んでも越えられない。** 壁に当たった時点で `moveBody` が横の速度を
 * 0 にしていて、空中の加速（`ACCEL_AIR`）は 1 フレームに 0.07 しか戻さないので、
 * 真上に跳んでその場に落ちる（＝壁の前で延々と跳ね続ける）。
 */
const HOP_TIME = 0.7;

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
  /** 殴られた直後の赤い明滅の残り (秒)。描画がこれを見て色を差し替える。 */
  hurtTimer: number;
  /** 逃げている残り (秒)。0 より大きいあいだは、プレイヤーと反対を向いて速く歩く。 */
  fleeTimer: number;
  /**
   * 燃えている残り (秒)。日光に当たっているあいだ延び続け、日陰に入っても
   * しばらく残る。**描画はこれを見て色を差し替えるだけ**（判断はここ）。
   */
  burnTimer: number;
  /** 焦げるまでの溜め。1 秒ごとに 1 回ダメージを入れるのに使う。 */
  burnTick: number;
  /** 次にプレイヤーを殴れるまでの残り (秒)。**1 体ごとに持つ。** */
  attackTimer: number;
  /** 壁を跳び越えている残り (秒)。このあいだは加速を待たずに前へ出す。 */
  hopTimer: number;
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
/**
 * 敵対モブが湧ける明るさの上限（Minecraft と同じ「7 以下」）。
 * **`spawnLight()` の値で見ること**（下記）。
 */
export const HOSTILE_LIGHT_MAX = 7;
/** 同時に居られる数。 */
export const MAX_MOBS = 40;
export const MAX_PASSIVE = 16;
export const MAX_HOSTILE = 24;

/** これより近いプレイヤーを追いかける。 */
export const HOSTILE_SIGHT = 18;
/** 殴れる距離（水平）と高さの差。 */
export const ATTACK_RANGE = 1.4;
export const ATTACK_HEIGHT = 1.5;
/** 1 体が殴れる間隔 (秒) とダメージ。 */
export const MOB_ATTACK_COOLDOWN = 1;
export const MOB_DAMAGE = 2;
/** 殴られたプレイヤーが押される強さ。**押し「続け」はしない**（下記）。 */
const PLAYER_KNOCKBACK = 5;
const PLAYER_KNOCKBACK_LIFT = 3.5;
/**
 * これ以上近いと止まって殴る。**止まってから滑るぶん（約 0.4）を見込んで、
 * 当たり判定の合計（0.4 + 0.3 = 0.7）より広く取ってある。**
 * 詰めすぎるとプレイヤーと重なり、ゾンビの胴がカメラの中に入る。
 */
const ATTACK_STOP = 1.3;

/**
 * 日光で燃え始める昼夜の明るさ。日の出の 6 分後あたりから燃え、日没の少し前に止む。
 * **`brightness` で見ること**（`dayness` や時刻で別の昼夜判定を作らない）。
 */
export const BURN_BRIGHTNESS = 0.8;
/** 日陰に入っても燃え続ける長さ (秒)。0 にすると木の下を通るたび点いたり消えたりする。 */
const BURN_LINGER = 2;
/** 燃えているあいだのダメージ（毎秒）。 */
const BURN_DAMAGE = 2;
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
// --- 戦闘の決まり -------------------------------------------------------

/**
 * プレイヤーが殴れる間隔。**`main.ts` の `let` ではなくここに置くこと。**
 * 「1 フレームに 10 回クリックしても 1 回」はヘッドレスで確かめられる類の判断で、
 * DOM の側に置くとブラウザを開くまで確かめられなくなる。
 */
export const PLAYER_ATTACK_COOLDOWN = 0.5;
/** 殴られたあと赤く光る長さ。 */
const HURT_FLASH = 0.35;
/** 殴られたあと逃げる長さと、そのあいだの速さの倍率。 */
const FLEE_TIME = 3;
const FLEE_SPEED = 1.6;
/** のけぞり。横に押されて、少し浮く。 */
const KNOCKBACK = 5.5;
const KNOCKBACK_LIFT = 4;

/**
 * 道具の種類ごとの攻撃力の素。**`ItemDef` に `damage` を足さないこと**
 * （戦闘の数値がアイテムの表とここに散る）。素手は 1 で、これがいちばん低い。
 */
const TOOL_ATTACK: Record<string, number> = { axe: 3, pickaxe: 2, shovel: 1 };
/** 階層 1 つにつき増える攻撃力。 */
const TIER_ATTACK = 0.5;

/**
 * その道具で殴ったときのダメージ。斧 > ツルハシ > シャベル > 素手 で、
 * 同じ種類なら階層が上ほど強い（素手 1 〜 ダイヤの斧 5）。
 */
export function attackDamage(item: number): number {
  const tool = toolOf(item);
  if (!tool) return 1;
  return TOOL_ATTACK[tool.kind] + tool.tier * TIER_ATTACK;
}

/** ときどき鳴く。判断は 5Hz なので、1 体あたりおよそ 15 秒に 1 回になる。 */
const SAY_CHANCE = 0.013;
/** これより遠いモブの声は鳴らさない（距離で音量を落とす仕組みがまだ無い）。 */
const SAY_DISTANCE = 24;

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

/**
 * 敵対モブが湧ける暗さか。**受動と違って `brightness` を掛ける** ——
 * 掛けないと夜の地表（スカイライト 15）に 1 体も湧かない。
 * これで「夜の外は危ない／松明を置いた所は安全／洞窟は昼でも危ない」が同時に決まる。
 */
export function canSpawnHostile(sky: number, block: number, brightness: number): boolean {
  return spawnLight(sky, block, brightness) <= HOSTILE_LIGHT_MAX;
}

/**
 * 日光で燃えるか。**スカイライトが最大（真上が完全に空いている）ときだけ。**
 * 木の下・屋根の下・水の中では燃えない（水は呼ぶ側で見る）。
 */
export function sunlightBurns(sky: number, brightness: number): boolean {
  return sky >= MAX_LIGHT && brightness >= BURN_BRIGHTNESS;
}

/**
 * ダメージの受け口。**`Vitals` が構造的に満たす**ので、`main.ts` はそれをそのまま渡す。
 * 死因（「モンスター」）と無敵時間をここで指定するので、**戦闘の判断が `main.ts` に漏れない。**
 */
export interface MobTarget {
  damage(amount: number, cause: DamageCause, cooldown?: number): boolean;
}

/** モブの周りの状況。`main.ts` から毎フレーム渡す。 */
export interface MobContext {
  readonly playerX: number;
  readonly playerY: number;
  readonly playerZ: number;
  /** 昼夜の明るさ 0..1（`DayNight.brightness`）。 */
  readonly brightness: number;
  /**
   * ノックバックを足す先（`Player.velocity`）。
   * **モブがプレイヤーを押し続けることはしない** ——
   * 押し続けると `collides()` の押し戻しと喧嘩して壁にめり込む。
   */
  readonly playerVelocity?: Vector3;
  /**
   * クリエイティブ。**狙われも殴られもしない。**
   * `Vitals.damage()` はもともと `invulnerable` を見ていないので、ここで弾く。
   */
  readonly invulnerable?: boolean;
  /** プレイヤーの体力。渡さなければ誰も殴られない（テストと、遊んでいない間）。 */
  readonly vitals?: MobTarget;
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
  /** プレイヤーが次に殴れるまでの残り。 */
  private attackTimer = 0;

  /**
   * 倒したときの受け取り口。`screen.onChange` と同じ形で `main.ts` から繋ぐ。
   * **プレイヤーが倒したときだけ発火させること**（遠くで勝手に消えたモブの肉が
   * インベントリに入ってはいけない）。
   */
  onDrop?: (item: number, count: number) => void;
  /**
   * 音の受け取り口。**何をいつ鳴らすかはここで決めて、`audio.ts` へは素通しさせる**
   * （`CLAUDE.md`「判断を `audio.ts` や `main.ts` に書かないこと」）。
   */
  onSound?: (sfx: Sfx, pitch: number) => void;

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
      hurtTimer: 0,
      fleeTimer: 0,
      burnTimer: 0,
      burnTick: 0,
      attackTimer: 0,
      hopTimer: 0,
    };
    this.list.push(mob);
    return mob;
  }

  clear(): void {
    this.list.length = 0;
    this.spawnTimer = 0;
    this.attackTimer = 0;
  }

  /**
   * 1 フレームぶん進める。
   *
   * **`world.update()` の外で回すこと。** チャンク生成の予算（3ms）の下に入れると、
   * モブの退行とストリーミングの退行が `test/world.test.ts` の p99 で区別できなくなる。
   */
  update(dt: number, world: World, ctx: MobContext): void {
    const random = ctx.random ?? Math.random;

    if (this.attackTimer > 0) this.attackTimer = Math.max(0, this.attackTimer - dt);

    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer -= SPAWN_INTERVAL;
      for (let i = 0; i < SPAWN_ATTEMPTS; i++) this.trySpawn(world, ctx, random);
    }

    this.despawnFar(ctx);

    // **後ろから回すこと。** 日光で焼け死んだモブはその場で list から抜ける。
    for (let i = this.list.length - 1; i >= 0; i--) {
      const mob = this.list[i];
      const def = MOBS[mob.kind];

      // ボクセルの無い列に居るあいだは動かさない。`getVoxel` が AIR を返すので、
      // そのまま物理を回すと世界を突き抜けて落ちていく。
      if (!world.hasColumn(columnOf(mob.position.x), columnOf(mob.position.z))) continue;

      mob.thinkTimer -= dt;
      if (mob.thinkTimer <= 0) {
        mob.thinkTimer += AI_TICK;
        this.think(mob, def, world, ctx, random);
      }

      this.step(mob, def, world, dt, ctx);

      if (!def.hostile) continue;
      // 焼け死んだらここで list から消えているので、続きに触らない
      if (this.burn(mob, def, dt, ctx)) continue;
      this.strike(mob, dt, ctx);
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
    if (def.hostile) this.thinkHostile(mob, def, world, ctx, random);
    else this.thinkPassive(mob, def, ctx, random);

    // 進む先が崖なら引き返す。**これが無いと、そのうち全部が穴に落ちる。**
    // 追いかけている最中も同じ（プレイヤーを追って谷へ飛び込まない）。
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
   * 敵対モブの判断。**プレイヤーを追う・日光で燃える・見失えば徘徊に戻る。**
   * クリエイティブのプレイヤーは狙わない（`Vitals` 側では弾けない。あちらの
   * `damage()` はもともと `invulnerable` を見ていないので、ここで切る）。
   */
  private thinkHostile(
    mob: Mob,
    def: MobDef,
    world: World,
    ctx: MobContext,
    random: () => number,
  ): void {
    // 日光。**スカイライトが最大の所だけ**なので、屋根の下・木の下・洞窟では燃えない。
    // 水に浸かっているあいだも燃えない（Minecraft と同じ）。
    if (!mob.inWater) {
      const sky = world.getLight(
        Math.floor(mob.position.x),
        Math.floor(mob.position.y + def.size.height * 0.8),
        Math.floor(mob.position.z),
        SKY_LIGHT,
      );
      if (sunlightBurns(sky, ctx.brightness)) mob.burnTimer = BURN_LINGER;
    }

    const distance = distanceTo(mob, ctx);
    if (!ctx.invulnerable && distance <= HOSTILE_SIGHT) {
      mob.targetYaw = toward(mob, ctx);
      // 目の前まで来たら止まって殴る（歩き続けるとプレイヤーに重なって見える）
      mob.walking = distance > ATTACK_STOP;
      // 見失った次の判断で、すぐ徘徊の抽選に入れるようにしておく
      mob.stateTimer = 0;
    } else {
      this.wander(mob, random);
    }

    if (random() < SAY_CHANCE && distance < SAY_DISTANCE) this.onSound?.("mobsay", def.voice);
  }

  /** 受動モブの判断。殴られたら逃げ、あとは歩いたり止まったり。 */
  private thinkPassive(mob: Mob, def: MobDef, ctx: MobContext, random: () => number): void {
    if (mob.fleeTimer > 0) {
      mob.fleeTimer = Math.max(0, mob.fleeTimer - AI_TICK);
      // 逃げているあいだは徘徊の抽選をしない。**プレイヤーの反対を向き続けること** ——
      // 向きを 1 回決めるだけだと、追いかけられたときに正面へ突っ込んでいく。
      mob.walking = true;
      mob.targetYaw = awayFrom(mob, ctx);
      // 逃げ終わった直後にすぐ止まらないよう、状態の残りは短く持ち直す
      mob.stateTimer = Math.max(mob.stateTimer, 1);
    } else {
      this.wander(mob, random);
      if (random() < SAY_CHANCE && distanceTo(mob, ctx) < SAY_DISTANCE) {
        this.onSound?.("mobsay", def.voice);
      }
    }
  }

  /** 歩いたり止まったり。向きは止まっているあいだは変えない（その場で回ると不自然）。 */
  private wander(mob: Mob, random: () => number): void {
    mob.stateTimer -= AI_TICK;
    if (mob.stateTimer > 0) return;
    mob.walking = !mob.walking;
    mob.stateTimer = pick(random, mob.walking ? WANDER_TIME : IDLE_TIME);
    if (mob.walking) mob.targetYaw = random() * Math.PI * 2;
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
  private step(mob: Mob, def: MobDef, world: World, dt: number, ctx: MobContext): void {
    const beforeX = mob.position.x;
    const beforeZ = mob.position.z;

    if (mob.hurtTimer > 0) mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);

    // **止まる判断だけは毎フレーム見ること。** 判断は 5Hz なので、そのあいだに
    // 0.9 ブロック進む。ティックだけで止めるとプレイヤーに重なるまで踏み込んでしまう。
    if (mob.walking && def.hostile && distanceTo(mob, ctx) <= ATTACK_STOP) mob.walking = false;

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
    const speed = mob.walking
      ? def.speed * (mob.fleeTimer > 0 ? FLEE_SPEED : 1) * aligned * (mob.inWater ? WATER_SPEED : 1)
      : 0;
    const forward = forwardOf(mob.yaw);
    const accel = (mob.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
    const targetX = forward[0] * speed;
    const targetZ = forward[1] * speed;
    if (mob.hopTimer > 0) mob.hopTimer = Math.max(0, mob.hopTimer - dt);
    if (mob.hopTimer > 0 && speed > 0) {
      // 跳び越えている間だけは加速を待たない。**壁に当たるたび `moveBody` が
      // 横の速度を 0 にする**ので、加速任せだと真上に跳んで壁の前に落ちるだけになる。
      // 歩くのをやめたら普通の減速に戻す（空中で急に止まると落ち方が不自然になる）。
      mob.velocity.x = targetX;
      mob.velocity.z = targetZ;
    } else {
      mob.velocity.x += clamp(targetX - mob.velocity.x, -accel, accel);
      mob.velocity.z += clamp(targetZ - mob.velocity.z, -accel, accel);
    }

    if (mob.inWater) {
      // 落ちてきた勢いを殺しつつ、水面へ向かって浮く
      mob.velocity.y += (WATER_RISE - mob.velocity.y) * Math.min(1, dt * 6);
    } else {
      mob.velocity.y -= GRAVITY * dt;
      if (mob.velocity.y < -TERMINAL) mob.velocity.y = -TERMINAL;
    }

    const blocked = moveBody(world, mob, def.size, dt, mob.onGround);

    // **段差登り（0.5）で越えられなかった壁は跳んで越える。**
    // 立方体 1 個ぶんの段差はマイクラでも跳ぶところで、これが無いと
    // 地形のちょっとした起伏でモブが止まり、ゾンビは 1 段の壁で撒ける。
    // 跳べるのは接地しているあいだだけ（空中でも跳べると壁を登っていける）。
    if (blocked && mob.onGround && mob.walking && !mob.inWater) {
      mob.velocity.y = JUMP_SPEED;
      mob.hopTimer = HOP_TIME;
      mob.onGround = false;
    }

    // 歩いた距離で位相を進める（時間で進めると、壁際で足踏みして見える）
    const moved = Math.hypot(mob.position.x - beforeX, mob.position.z - beforeZ);
    mob.walkPhase += moved * WALK_PHASE_PER_BLOCK;
  }

  /**
   * 燃えているぶんのダメージ（毎フレーム）。焼け死んだら true。
   * 火が点くかどうかは 5Hz の `thinkHostile` が決めていて、ここは残りとダメージだけ。
   *
   * **焼死ではドロップしない。** 40 ブロック先で朝日を浴びたゾンビの肉が
   * 手元に湧いてはいけない（`onDrop` はプレイヤーが倒したときだけ）。
   */
  private burn(mob: Mob, def: MobDef, dt: number, ctx: MobContext): boolean {
    if (mob.burnTimer <= 0) return false;
    mob.burnTimer = Math.max(0, mob.burnTimer - dt);
    mob.burnTick += dt;
    while (mob.burnTick >= 1) {
      mob.burnTick -= 1;
      if (!this.wound(mob, BURN_DAMAGE)) continue;
      // 断末魔だけ鳴らす（毎秒の悲鳴は、夜明けに何十体ぶんも重なってうるさい）
      if (distanceTo(mob, ctx) < SAY_DISTANCE) this.onSound?.("mobdeath", def.voice);
      return true;
    }
    return false;
  }

  /**
   * 敵対モブがプレイヤーを殴る（毎フレーム）。
   *
   * **プレイヤーを押し続けることはしない。** ノックバックとして速度を 1 回足すだけ。
   * 押し続けると `collides()` の押し戻しと喧嘩して、壁にめり込む。
   */
  private strike(mob: Mob, dt: number, ctx: MobContext): void {
    if (mob.attackTimer > 0) {
      mob.attackTimer = Math.max(0, mob.attackTimer - dt);
      return;
    }
    // クリエイティブは殴られない。**`Vitals` 側では弾けない**ので必ずここで見る。
    if (ctx.invulnerable || !ctx.vitals) return;

    const dx = ctx.playerX - mob.position.x;
    const dz = ctx.playerZ - mob.position.z;
    const flat = Math.hypot(dx, dz);
    if (flat > ATTACK_RANGE) return;
    if (Math.abs(ctx.playerY - mob.position.y) >= ATTACK_HEIGHT) return;

    // 届いたら**当たったかどうかに関わらず**1 回ぶん待つ。無敵時間に弾かれるたび
    // 次のフレームで振り直すと、囲まれたときに全員が窓の明ける瞬間を待ち構える形になり、
    // 体力が人数ぶん速く減る（無敵時間で頭打ちにした意味が無くなる）。
    mob.attackTimer = MOB_ATTACK_COOLDOWN;
    if (!ctx.vitals.damage(MOB_DAMAGE, "モンスター", MOB_HURT_COOLDOWN)) return;

    const push = ctx.playerVelocity;
    if (push && flat > 1e-4) {
      push.x += (dx / flat) * PLAYER_KNOCKBACK;
      push.z += (dz / flat) * PLAYER_KNOCKBACK;
      if (push.y < PLAYER_KNOCKBACK_LIFT) push.y = PLAYER_KNOCKBACK_LIFT;
    }
  }

  /**
   * 体力を減らす。倒れたら `list` から抜いて true。
   * **音とドロップは呼ぶ側が決める**（プレイヤーが倒したときと焼死とで違う）。
   */
  private wound(mob: Mob, amount: number): boolean {
    mob.health -= amount;
    mob.hurtTimer = HURT_FLASH;
    if (mob.health > 0) return false;
    const index = this.list.indexOf(mob);
    if (index >= 0) this.list.splice(index, 1);
    return true;
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
    let hostile = 0;
    for (const mob of this.list) {
      if (MOBS[mob.kind].hostile) hostile++;
      else passive++;
    }
    if (passive >= MAX_PASSIVE && hostile >= MAX_HOSTILE) return;

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

    // **暗さの判定を先に見ること。** 夜の草地は「敵対が湧ける明るさ」でもあり
    // 「受動が湧ける地面」でもあるので、順番がそのまま優先順位になる。
    const sky = world.getLight(x, y, z, SKY_LIGHT);
    const block = world.getLight(x, y, z, BLOCK_LIGHT);
    let kind: MobKind | null = null;
    if (canSpawnHostile(sky, block, ctx.brightness)) {
      if (hostile < MAX_HOSTILE) kind = "zombie";
    } else if (passive < MAX_PASSIVE && canSpawnPassive(sky, ground)) {
      kind = PASSIVE_KINDS[Math.floor(random() * PASSIVE_KINDS.length)];
    }
    if (!kind) return;
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

  // --- 戦闘 -------------------------------------------------------------

  /**
   * 光線の先にいるいちばん近いモブ。当たらなければ null。
   *
   * 距離はここで返す。**`RaycastHit` に距離のフィールドを足さないこと** ——
   * `raycastVoxels` は正規化した向きで点を作っているので、
   * `hit.point.distanceTo(origin)` がそのまま距離になる。足すと、
   * 2 つの return 経路で整合を保たなければならない物が 1 つ増える。
   */
  pick(origin: Vector3, direction: Vector3, reach: number): { mob: Mob; distance: number } | null {
    rayOrigin[0] = origin.x;
    rayOrigin[1] = origin.y;
    rayOrigin[2] = origin.z;
    rayDir[0] = direction.x;
    rayDir[1] = direction.y;
    rayDir[2] = direction.z;

    let best: Mob | null = null;
    let bestDistance = reach;
    for (const mob of this.list) {
      const size = MOBS[mob.kind].size;
      hitBox[0] = -size.half;
      hitBox[1] = 0;
      hitBox[2] = -size.half;
      hitBox[3] = size.half;
      hitBox[4] = size.height;
      hitBox[5] = size.half;
      const enter = rayBox(
        rayOrigin,
        rayDir,
        hitBox,
        mob.position.x,
        mob.position.y,
        mob.position.z,
        pickNormal,
      );
      if (enter < 0 || enter > bestDistance) continue;
      bestDistance = enter;
      best = mob;
    }
    return best ? { mob: best, distance: bestDistance } : null;
  }

  /**
   * プレイヤーがモブを 1 回殴る。クールダウン中なら何もせず false。
   * 倒れたら `onDrop` が 1 回だけ鳴る（**プレイヤーが倒したときだけ**）。
   */
  attack(mob: Mob, item: number, ctx: MobContext, random = ctx.random ?? Math.random): boolean {
    if (this.attackTimer > 0) return false;
    this.attackTimer = PLAYER_ATTACK_COOLDOWN;

    const def = MOBS[mob.kind];
    const died = this.wound(mob, attackDamage(item));

    // のけぞり。プレイヤーから見て奥へ押して、少し浮かせる。
    const dx = mob.position.x - ctx.playerX;
    const dz = mob.position.z - ctx.playerZ;
    const flat = Math.hypot(dx, dz);
    if (flat > 1e-4) {
      mob.velocity.x += (dx / flat) * KNOCKBACK;
      mob.velocity.z += (dz / flat) * KNOCKBACK;
    }
    if (mob.onGround) mob.velocity.y = KNOCKBACK_LIFT;

    if (!died) {
      this.onSound?.("mobhurt", def.voice);
      // **敵対モブは逃げない。** 殴られても向かってくるから怖い。
      if (!def.hostile) {
        mob.fleeTimer = FLEE_TIME;
        mob.walking = true;
        mob.targetYaw = awayFrom(mob, ctx);
      }
      return true;
    }

    this.onSound?.("mobdeath", def.voice);
    const drop = def.drop;
    if (drop.count > 0 && (drop.chance >= 1 || random() < drop.chance)) {
      this.onDrop?.(drop.item, drop.count);
    }
    return true;
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

/** 狙い判定の控え。1 クリックに何度も使うので配列は使い回す（確保ゼロ）。 */
const rayOrigin = [0, 0, 0];
const rayDir = [0, 0, 0];
const pickNormal = [0, 0, 0];
const hitBox = [0, 0, 0, 0, 0, 0];

/** プレイヤーに背を向ける向き。`aimHead` の「見る向き」の裏返し。 */
function awayFrom(mob: Mob, ctx: MobContext): number {
  return Math.atan2(ctx.playerX - mob.position.x, ctx.playerZ - mob.position.z);
}

/** プレイヤーのほうを向く向き（`awayFrom` の真裏）。yaw 0 = -Z の規約に合わせてある。 */
function toward(mob: Mob, ctx: MobContext): number {
  return Math.atan2(mob.position.x - ctx.playerX, mob.position.z - ctx.playerZ);
}

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
