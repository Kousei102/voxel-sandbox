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
import { AIR, GRASS, NETHER_BRICK, WOOL, isHotLiquid, isLiquid, isSolid } from "./blocks";
import { MAX_LIGHT, WORLD_HEIGHT, columnOf } from "./constants";
import { BLAZE_ROD, RAW_PORK, ROTTEN_FLESH, toolOf } from "./items";
import { BLOCK_LIGHT, SKY_LIGHT } from "./lighting";
import { PLAYER_SIZE, type BodySize, boxBlocked, groundBelow, moveBody } from "./physics";
import {
  PLAYER_OWNER,
  type Projectile,
  type ProjectileKind,
  type ProjectileTarget,
  type Shot,
} from "./projectiles";
import { rayBox, raycastVoxels } from "./raycast";
import type { Sfx } from "./sfx";
import { BURN_SECONDS, MOB_HURT_COOLDOWN, type DamageCause } from "./vitals";
import type { World } from "./world";

// --- 種類の表 -----------------------------------------------------------

export type MobKind = "pig" | "sheep" | "zombie" | "blaze";

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

/**
 * 遠くから撃つ攻め方。**持っているモブだけが撃つ**（無ければ `null`）。
 *
 * **飛び方は書かない** —— それは `projectiles.ts` の表の仕事で、ここが持つのは
 * 「いつ・どれだけの重みで撃つか」という手応えの数値だけ（`TUNING.md`）。
 */
export interface RangedAttack {
  /** 撃つもの（`projectiles.ts` の表の名前）。 */
  readonly kind: ProjectileKind;
  /** 当たったときに減らす量。 */
  readonly damage: number;
  /** 撃ち始める距離（水平）。**`HOSTILE_SIGHT` より短いこと**（見えた瞬間に撃たれない）。 */
  readonly range: number;
  /**
   * これより近いと撃たない。**0 にしないこと** —— 足元へ撃つ形になって、
   * 近づいて殴る間合いと二重取りになる。
   */
  readonly near: number;
  /** 次の 1 発までの間隔 (秒)。 */
  readonly cooldown: number;
  /** 撃ち出す高さ（足元から）。 */
  readonly height: number;
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
   * 殴られたときに減る量。**種類ごとにここへ持つこと** ——
   * 1 つの定数を全員で分け合っていた頃は、ブレイズの一撃がゾンビと同じ重さだった。
   * 受動モブは 0（`strike()` を通らないので、値としての 0 が正しい）。
   */
  readonly damage: number;
  /** 遠くから撃つか。**撃たないモブは `null`。** */
  readonly ranged: RangedAttack | null;
  /**
   * 飛ぶ。**重力を受けず、`flyTarget` の高さへ自分で上がり下がりする。**
   * 段差登りも跳び越えも持たない（壁に当たったら上がる）。崖でも引き返さない。
   *
   * **`step` に「ブレイズなら」と書かないこと** —— 飛ぶものが増えるたびに
   * 物理の中の分岐が増える。飛び方の違いは全部この表の値で表す。
   */
  readonly flying: boolean;
  /**
   * 火で焼けない（溶岩も日光も効かない）。**ネザーのモブにはこれが要る** ——
   * 溶岩の海の上を飛ぶブレイズが、かすっただけで 2.5 秒で焼け死ぬ。
   */
  readonly fireproof: boolean;
  /**
   * 湧ける地面のブロック。**null なら固い地面ならどこでも。**
   * 指定のあるモブはその地面で「どこでも」のモブに勝つ（`hostileFor()`）。
   */
  readonly spawnOn: readonly number[] | null;
  /** 倒したときのドロップ。倒れた場所に落ちる（`onDrop` → `main.ts` → `drops.ts`）。 */
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
 * **胴は当たり判定より長く、後ろ（+Z）へはみ出します**（マイクラも同じで、
 * 胴 1 ブロックに対して判定は 0.9）。**前（-Z）は必ず判定の中に収めること** ——
 * 歩いていく方向なので、鼻が壁に埋まると必ず目に入ります（後ろは尻だけなので
 * 気になりません）。`test/mobs.test.ts` が前後を別々に突き合わせています。
 *
 * 胴を伸ばすときは**後ろ脚の pivot も一緒に動かすこと**（胴の後端に合わせないと、
 * 尻だけが宙に伸びた形になります）。
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
  damage: 0,
  ranged: null,
  flying: false,
  fireproof: false,
  spawnOn: null,
  drop: { item: RAW_PORK, count: 1, chance: 1 },
  voice: 1.4,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(10), px(-3)], phase: 0 },
    { motion: "swing", pivot: [px(-3), px(6), px(-1)], phase: 0 },
    { motion: "swing", pivot: [px(3), px(6), px(-1)], phase: Math.PI },
    // 後ろ脚は**胴の後端に合わせる**（箱は pivot ±2px なので 13 で 11..15）。
    { motion: "swing", pivot: [px(-3), px(6), px(13)], phase: Math.PI },
    { motion: "swing", pivot: [px(3), px(6), px(13)], phase: 0 },
  ],
  boxes: [
    // 体（前後 18px。当たり判定 14.4px より長いので、後ろへはみ出す）
    { group: 0, box: [px(-5), px(6), px(-3), px(5), px(14), px(15)], color: PIG_SKIN },
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
 * **胴が後ろへはみ出すのも、後ろ脚を後端に合わせるのも豚と同じ**（`PIG` の説明）。
 */
const SHEEP: MobDef = {
  kind: "sheep",
  name: "羊",
  size: { half: 0.45, height: 1.2, step: 0.5 },
  maxHealth: 8,
  speed: 1.5,
  hostile: false,
  damage: 0,
  ranged: null,
  flying: false,
  fireproof: false,
  spawnOn: null,
  drop: { item: WOOL, count: 1, chance: 1 },
  voice: 1.25,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(15), px(-2)], phase: 0 },
    { motion: "swing", pivot: [px(-3), px(9), px(-2)], phase: 0 },
    { motion: "swing", pivot: [px(3), px(9), px(-2)], phase: Math.PI },
    // 後ろ脚は胴の後端に合わせる（箱は pivot ±2px なので 14 で 12..16）。
    { motion: "swing", pivot: [px(-3), px(9), px(14)], phase: Math.PI },
    { motion: "swing", pivot: [px(3), px(9), px(14)], phase: 0 },
  ],
  boxes: [
    // もこもこした体（前後 20px。豚と同じで後ろへはみ出す）
    { group: 0, box: [px(-5), px(9), px(-4), px(5), px(18), px(16)], color: SHEEP_WOOL },
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
  // 近接ダメージ。**`MOB_DAMAGE` はこの値の別名**（下の「戦闘の決まり」）。
  damage: 2,
  ranged: null,
  flying: false,
  fireproof: false,
  spawnOn: null,
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

const BLAZE_CORE = 0xd8890f;
const BLAZE_ROD_COLOR = 0xffd83d;
const BLAZE_EYE = 0x4a2408;

/**
 * ブレイズ。**初めての飛ぶモブで、初めての「地面を選んで湧く」モブ。**
 * ネザー要塞のネザーレンガの上にだけ湧き、溶岩でも日光でも焼けない。
 *
 * 当たり判定は Minecraft と同じ 0.6 x 1.8。段差は 0 —— 飛ぶので登る必要がなく、
 * 0 でないと着地したときだけ壁を登れる、という筋の通らない挙動になる。
 *
 * **火球はまだ撃たない**（2-4b）。いまは近づいて殴るだけで、ゾンビと同じ
 * `strike()` に乗っている。
 *
 * グループの並び: 0 = 芯（固定）、1 = 頭、2..5 = 周りの棒 4 本。
 * 棒は位相を散らしてあるので、動いているあいだ互い違いに揺れる。
 */
const BLAZE: MobDef = {
  kind: "blaze",
  name: "ブレイズ",
  size: { half: 0.3, height: 1.8, step: 0 },
  maxHealth: 20,
  // プレイヤーの歩き (5.2) より遅い。**速くしないこと** —— 壁も崖も関係なく
  // 一直線に飛んでくるので、地上のゾンビと同じ速さにすると絶対に振り切れない。
  speed: 3.6,
  hostile: true,
  // 近接は本家と同じ 6（ゾンビの 3 倍）。**近づかれたら痛い**が、
  // 火球のほうが本体なので、間合いを取れば殴られない。
  damage: 6,
  // 火球。数値は本家に寄せた暫定（`TUNING.md`）で、**本家の 3 連射は入れていない**
  // （1 発ずつ）。`near` を 0 にしないこと —— 足元へ撃つ形になって、
  // 近接と二重取りになる。
  ranged: {
    kind: "fireball",
    damage: 5,
    range: 16,
    near: 3,
    cooldown: 3,
    // 芯の真ん中（当たり判定 1.8 の中ほど）。低すぎると自分の足場に当たる。
    height: 1.1,
  },
  flying: true,
  fireproof: true,
  spawnOn: [NETHER_BRICK],
  drop: { item: BLAZE_ROD, count: 1, chance: 0.5 },
  voice: 1.15,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(18), 0], phase: 0 },
    { motion: "swing", pivot: [px(-3.5), px(16), 0], phase: 0 },
    { motion: "swing", pivot: [px(3.5), px(16), 0], phase: Math.PI },
    { motion: "swing", pivot: [0, px(16), px(-3.5)], phase: Math.PI / 2 },
    { motion: "swing", pivot: [0, px(16), px(3.5)], phase: (Math.PI * 3) / 2 },
  ],
  boxes: [
    // 芯（頭からぶら下がる胴。棒はこの周りを囲む）
    { group: 0, box: [px(-3), px(2), px(-3), px(3), px(18), px(3)], color: BLAZE_CORE },
    // 頭（軸は首の付け根。箱は軸からの相対）
    { group: 1, box: [px(-4), 0, px(-4), px(4), px(8), px(4)], color: BLAZE_ROD_COLOR },
    { group: 1, box: [px(-2.5), px(4), px(-4.1), px(-1), px(5.5), px(-4)], color: BLAZE_EYE },
    { group: 1, box: [px(1), px(4), px(-4.1), px(2.5), px(5.5), px(-4)], color: BLAZE_EYE },
    // 周りの棒（**軸からぶら下げる = y1 が 0**。0 でないと真ん中で折れて回る）
    { group: 2, box: [px(-1), px(-12), px(-1), px(1), 0, px(1)], color: BLAZE_ROD_COLOR },
    { group: 3, box: [px(-1), px(-12), px(-1), px(1), 0, px(1)], color: BLAZE_ROD_COLOR },
    { group: 4, box: [px(-1), px(-12), px(-1), px(1), 0, px(1)], color: BLAZE_ROD_COLOR },
    { group: 5, box: [px(-1), px(-12), px(-1), px(1), 0, px(1)], color: BLAZE_ROD_COLOR },
  ],
};

export const MOBS: Record<MobKind, MobDef> = {
  pig: PIG,
  sheep: SHEEP,
  zombie: ZOMBIE,
  blaze: BLAZE,
};
export const MOB_KINDS: readonly MobKind[] = ["pig", "sheep", "zombie", "blaze"];
/** 湧きの抽選に使う受動モブ。**敵対と混ぜないこと**（湧く条件も上限も別）。 */
const PASSIVE_KINDS: readonly MobKind[] = ["pig", "sheep"];
/** 湧きの抽選に使う敵対モブ。**表から作ること**（足したときに書き忘れる）。 */
const HOSTILE_KINDS: readonly MobKind[] = MOB_KINDS.filter((kind) => MOBS[kind].hostile);

/**
 * その地面に湧く敵対モブ。誰も湧けないなら null。
 *
 * **地面を指定したモブが勝つ。** ネザー要塞のネザーレンガの上ではブレイズだけが湧き、
 * 「どこでも」のゾンビは負ける（同じ土俵で抽選すると、要塞の半分がゾンビになって
 * ブレイズロッドを集める場所という意味が薄れる）。指定のあるモブが 1 つも
 * 当てはまらなければ、「どこでも」の中から選ぶ。
 */
export function hostileFor(ground: number, random: () => number): MobKind | null {
  const picky = HOSTILE_KINDS.filter((kind) => MOBS[kind].spawnOn?.includes(ground));
  const pool = picky.length > 0 ? picky : HOSTILE_KINDS.filter((kind) => !MOBS[kind].spawnOn);
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

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
 * 液体に入ると、この速さで浮き上がる。**沈む向きにしないこと。**
 * 沈むと水底を歩き続け、あとで空腹や溺れを入れたときに黙って死んでいく
 * （プレイヤーからは「モブが居ない」という形でしか見えない）。
 * 水面まで来ると頭が出て液体から抜け、重力で少し沈む — その繰り返しで水面に浮く。
 */
const LIQUID_RISE = 1.4;
/**
 * 液体の中での速さの倍率。**`player.ts` の 0.6 と同じにすること。**
 * ずれると、水に入った瞬間にプレイヤーとゾンビの追いかけっこの勝敗が変わる
 * （速いほうへ逃げ込めば必ず振り切れる／絶対に振り切れない、のどちらかになる）。
 */
const LIQUID_SPEED = 0.6;

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

/**
 * 飛ぶモブが床から浮いていたい高さ。**1 より大きいこと** ——
 * 1 以下だと、床に置いた松明や手すりに引っかかって前へ進めなくなる。
 */
const FLY_HOVER = 2.5;
/** 追いかけているとき、プレイヤーの足元からどれだけ上に居たいか。 */
const FLY_ABOVE = 1.2;
/** 床を探しに下へ見る深さ。**溶岩の海の上では見つからない**ので、その場の高さを保つ。 */
const FLY_SCAN = 8;
/** 上下の最高速度と、そこへ寄せる加速。 */
const FLY_RISE = 3;
const FLY_ACCEL = 12;

export interface Mob {
  readonly id: number;
  readonly kind: MobKind;
  readonly position: Vector3;
  readonly velocity: Vector3;
  onGround: boolean;
  /**
   * 浸かっている液体の ID（浸かっていなければ `AIR`）。
   * **物理はどの液体でも同じ**で、焼けるかどうかだけ `isHotLiquid()` に聞く。
   */
  liquid: number;
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
  /**
   * 次に撃てるまでの残り (秒)。**殴るほうとは別に持つ** ——
   * 1 本にすると、間合いを詰められたブレイズが殴りながら撃てなくなる／
   * 撃ちながら殴れるようになる、のどちらかに転ぶ。
   */
  shootTimer: number;
  /**
   * 壁を跳び越えている残り (秒)。このあいだは加速を待たずに前へ出す。
   * **飛ぶモブでは「上がっている残り」**（跳ぶ代わりに壁を越える手立て）。
   */
  hopTimer: number;
  /**
   * 飛ぶモブが居たい高さ。**決めるのは `think`（5Hz）、寄せるのは `step`（毎フレーム）。**
   * 飛ばないモブでは使わない。
   */
  flyTarget: number;
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
/** 1 体が殴れる間隔 (秒)。**ダメージは種類ごと**（`MobDef.damage`）。 */
export const MOB_ATTACK_COOLDOWN = 1;
/**
 * ゾンビの近接ダメージ。**表（`ZOMBIE.damage`）が本体で、ここはその別名。**
 * 1 つの定数を全員で分け合っていた頃の名前なので、**新しいモブをここに繋がないこと** ——
 * 繋いだ瞬間、また「ブレイズの一撃がゾンビと同じ重さ」に戻る。
 */
export const MOB_DAMAGE = ZOMBIE.damage;
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
/**
 * 溶岩から出たあとも燃え続ける長さ (秒)。**プレイヤーと同じものを見ること。**
 * `BURN_LINGER`(2) を使い回していたせいで、**同じ溶岩から上がってもモブだけ
 * 2 秒で火が消えていた**（ブラウザで見ていたユーザーが気付いた）。
 * 日陰の 2 秒は「木の下でちらつかせない」ための値で、溶岩とは別の話。
 */
const LAVA_LINGER = BURN_SECONDS;
/** 燃えているあいだのダメージ（毎秒）。 */
const BURN_DAMAGE = 2;
/**
 * 溶岩に浸かっているあいだのダメージ（毎秒）。**日光よりずっと速いこと** ——
 * 同じ 2 だと、ゾンビが溶岩を泳いで渡ってくる（体力 20 で 10 秒かかる）。
 */
const LAVA_DAMAGE = 8;
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
  /**
   * 撃つ受け口。**渡さなければ 1 発も飛ばない**（`onDrop` と同じで、
   * `mobs.ts` は `projectiles.ts` を持ち込まずに済む）。
   * 何を・どこから・どれだけの重みで撃つかは**この中**で決めて、注文だけ渡す。
   */
  readonly shoot?: (shot: Shot) => void;
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
  /** 当たり先の控え。**毎フレーム作り直すので使い回す**（`projectileTargets()`）。 */
  private readonly targets: ProjectileTarget[] = [];

  /**
   * 倒したときの受け取り口。`screen.onChange` と同じ形で `main.ts` から繋ぐ。
   * **プレイヤーが倒したときだけ発火させること**（遠くで勝手に焼け死んだモブの肉が
   * 地面に湧いてはいけない）。座標は倒れた場所。
   *
   * **`mobs.ts` は `drops.ts` を import しない。** 座標を渡すだけにしておけば、
   * 落とし物の仕組みが変わってもモブの判断は動かない。
   */
  onDrop?: (item: number, count: number, x: number, y: number, z: number) => void;
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
      liquid: AIR,
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
      // 湧いた瞬間に撃たせない（目の前に湧いたときの初弾を待たせる）。
      shootTimer: MOBS[kind].ranged?.cooldown ?? 0,
      hopTimer: 0,
      // 湧いた瞬間から浮き始める（0 にすると、最初の判断まで床に落ちようとする）。
      flyTarget: y + (MOBS[kind].flying ? FLY_HOVER : 0),
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

      // **溶岩は敵味方の区別なく焼く**（日光は敵対だけ）。豚が溶岩の上を
      // 平気で歩いていると、プレイヤーだけが焼ける理由が無くなる。
      // **火に強いモブ（ブレイズ）だけは別** —— 溶岩の海の上を飛ぶので、
      // かすっただけで焼け死ぬと自分の次元で生きていられない。
      if (!def.fireproof && isHotLiquid(mob.liquid)) {
        mob.burnTimer = Math.max(mob.burnTimer, LAVA_LINGER);
      }
      // 焼け死んだらここで list から消えているので、続きに触らない
      if (this.burn(mob, def, dt, ctx)) continue;
      if (!def.hostile) continue;
      this.strike(mob, def, dt, ctx);
      this.fire(mob, def, world, dt, ctx);
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

    // 飛ぶモブは高さを自分で決める（`step` はそこへ寄せるだけ）。
    if (def.flying) this.aimAltitude(mob, def, world, ctx);

    // 進む先が崖なら引き返す。**これが無いと、そのうち全部が穴に落ちる。**
    // 追いかけている最中も同じ（プレイヤーを追って谷へ飛び込まない）。
    // **飛ぶモブは引き返さない** —— 崖も溶岩の海も越えていくのが飛ぶ意味で、
    // ここを通すと着地した瞬間だけ臆病になる。
    if (mob.walking && mob.onGround && !def.flying) {
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
    // 液体に浸かっているあいだも燃えない（Minecraft と同じ）。溶岩はこの下の
    // `update()` が別に点けるので、ここで見なくてよい。
    if (mob.liquid === AIR && !def.fireproof) {
      const sky = world.getLight(
        Math.floor(mob.position.x),
        Math.floor(mob.position.y + def.size.height * 0.8),
        Math.floor(mob.position.z),
        SKY_LIGHT,
      );
      // **`Math.max` で伸ばすこと。** 代入にすると、溶岩から上がったモブが
      // 日向へ出た瞬間に残り 15 秒が 2 秒へ**縮む**（長いほうが勝つのが正しい）。
      if (sunlightBurns(sky, ctx.brightness)) mob.burnTimer = Math.max(mob.burnTimer, BURN_LINGER);
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
   * 飛ぶモブが居たい高さ（5Hz）。**判断はここ**で、`step` はそこへ寄せるだけ。
   *
   * 床から `FLY_HOVER` 浮くのが基本で、追いかけているあいだはプレイヤーの少し上を狙う。
   * **必ず大きいほうを採ること** —— プレイヤーが穴の底に居るときに合わせにいくと、
   * 床にめり込んだまま前へ進めなくなる。
   *
   * 床が `FLY_SCAN` 以内に無ければ**その場の高さを保つ**（溶岩の海の上がこれ。
   * 0 に落とすと海面まで降りていって、火に強くない飛ぶモブを足したときに焼ける）。
   */
  private aimAltitude(mob: Mob, def: MobDef, world: World, ctx: MobContext): void {
    const floor = groundBelow(world, mob.position.x, mob.position.y, mob.position.z, def.size, FLY_SCAN);
    const overFloor = floor === -Infinity ? mob.position.y : floor + FLY_HOVER;
    const chasing = !ctx.invulnerable && distanceTo(mob, ctx) <= HOSTILE_SIGHT;
    mob.flyTarget = chasing ? Math.max(overFloor, ctx.playerY + FLY_ABOVE) : overFloor;
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
    const dy = ctx.playerY + PLAYER_AIM - (mob.position.y + def.size.height * 0.8);
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

    const at = world.getVoxel(
      Math.floor(mob.position.x),
      Math.floor(mob.position.y + def.size.height * 0.5),
      Math.floor(mob.position.z),
    );
    mob.liquid = isLiquid(at) ? at : AIR;

    // 向きは少しずつ追いつかせる（瞬間的に向くとカクついて見える）
    mob.yaw += clamp(wrapAngle(mob.targetYaw - mob.yaw), -TURN_SPEED * dt, TURN_SPEED * dt);

    // 向きが目標からずれているあいだは前へ出さない。**曲がりながら進ませないこと。**
    // 崖の手前で向きを変えても、古い向きのまま滑っていって落ちる。
    const aligned = Math.max(0, Math.cos(wrapAngle(mob.targetYaw - mob.yaw)));
    const speed = mob.walking
      ? def.speed * (mob.fleeTimer > 0 ? FLEE_SPEED : 1) * aligned * (mob.liquid === AIR ? 1 : LIQUID_SPEED)
      : 0;
    const forward = forwardOf(mob.yaw);
    // **飛ぶモブは空中でも `ACCEL_GROUND`。** 空中の加速（4）は「跳んでいる間は
    // 向きを変えられない」ための値なので、そのまま掛けると 1 フレームに 0.07 しか
    // 速度が戻らず、飛ぶモブがほとんど動かない。
    const accel = (mob.onGround || def.flying ? ACCEL_GROUND : ACCEL_AIR) * dt;
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

    if (def.flying) {
      // **重力を受けない。** 居たい高さ（`flyTarget`）へ寄せるだけで、
      // 壁に当たっている間（`hopTimer`）は素直に上がる。
      const want = mob.hopTimer > 0 ? FLY_RISE : clamp(mob.flyTarget - mob.position.y, -1, 1) * FLY_RISE;
      mob.velocity.y += clamp(want - mob.velocity.y, -FLY_ACCEL * dt, FLY_ACCEL * dt);
    } else if (mob.liquid !== AIR) {
      // 落ちてきた勢いを殺しつつ、液面へ向かって浮く
      mob.velocity.y += (LIQUID_RISE - mob.velocity.y) * Math.min(1, dt * 6);
    } else {
      mob.velocity.y -= GRAVITY * dt;
      if (mob.velocity.y < -TERMINAL) mob.velocity.y = -TERMINAL;
    }

    const blocked = moveBody(world, mob, def.size, dt, mob.onGround);

    if (blocked && mob.walking && def.flying) {
      // **飛ぶモブは跳ばずに上がる。** 段差登り（`size.step` = 0）も跳躍も持たないので、
      // これが無いと手すり 1 段の前で止まり続ける。
      mob.hopTimer = HOP_TIME;
    } else if (blocked && mob.onGround && mob.walking && mob.liquid === AIR) {
      // **段差登り（0.5）で越えられなかった壁は跳んで越える。**
      // 立方体 1 個ぶんの段差はマイクラでも跳ぶところで、これが無いと
      // 地形のちょっとした起伏でモブが止まり、ゾンビは 1 段の壁で撒ける。
      // 跳べるのは接地しているあいだだけ（空中でも跳べると壁を登っていける）。
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
      // 溶岩のほうがずっと速い。**同じ表の 1 か所で切り替えること**
      // （別の入口を作ると、片方だけ直したときに静かに食い違う）。
      if (!this.wound(mob, isHotLiquid(mob.liquid) ? LAVA_DAMAGE : BURN_DAMAGE)) continue;
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
  private strike(mob: Mob, def: MobDef, dt: number, ctx: MobContext): void {
    if (mob.attackTimer > 0) {
      mob.attackTimer = Math.max(0, mob.attackTimer - dt);
      return;
    }
    if (def.damage <= 0) return;
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
    // **重みは種類ごと**（`MobDef.damage`）。1 つの定数を分け合うと、
    // ブレイズの一撃がゾンビと同じ重さになる。
    if (!ctx.vitals.damage(def.damage, "モンスター", MOB_HURT_COOLDOWN)) return;

    const push = ctx.playerVelocity;
    if (push && flat > 1e-4) {
      push.x += (dx / flat) * PLAYER_KNOCKBACK;
      push.z += (dz / flat) * PLAYER_KNOCKBACK;
      if (push.y < PLAYER_KNOCKBACK_LIFT) push.y = PLAYER_KNOCKBACK_LIFT;
    }
  }

  /**
   * 遠くから撃つ（毎フレーム）。**いつ・どこから・どれだけの重みで撃つかはここ**で、
   * どう飛ぶかは `projectiles.ts` の表。撃つ受け口（`ctx.shoot`）が無ければ 1 発も飛ばない。
   *
   * **殴るのとは別の間隔（`shootTimer`）で回すこと** —— 1 本にすると、
   * 間合いを詰められた側が殴りながら撃てなくなる（または撃ちながら殴れる）。
   */
  private fire(mob: Mob, def: MobDef, world: World, dt: number, ctx: MobContext): void {
    const ranged = def.ranged;
    if (!ranged) return;
    if (mob.shootTimer > 0) {
      mob.shootTimer = Math.max(0, mob.shootTimer - dt);
      return;
    }
    // クリエイティブは狙われない（`strike()` と同じ線。`Vitals` 側では弾けない）。
    if (ctx.invulnerable || !ctx.shoot) return;

    const distance = distanceTo(mob, ctx);
    if (distance > ranged.range || distance < ranged.near) return;

    const x = mob.position.x;
    const y = mob.position.y + ranged.height;
    const z = mob.position.z;
    const dx = ctx.playerX - x;
    const dy = ctx.playerY + PLAYER_AIM - y;
    const dz = ctx.playerZ - z;
    // **壁越しに撃たないこと。** 姿の見えない所から火球が飛んでくると、
    // どこから撃たれているのか分からないまま焼かれる（要塞は壁だらけ）。
    if (!clearShot(world, x, y, z, dx, dy, dz)) return;

    mob.shootTimer = ranged.cooldown;
    // **狙うのは「いまプレイヤーが居る所」。** 先読みで置きにいくと当たり過ぎて、
    // 横に歩くだけでは避けられなくなる（飛び道具の意味が消える）。
    ctx.shoot({ kind: ranged.kind, x, y, z, dx, dy, dz, owner: mob.id, damage: ranged.damage });
  }

  /**
   * 飛んでいるものが当たった。**当たったかどうか（形の話）は `projectiles.ts`**で、
   * **誰に何が起きるか（体力・音・ドロップ・逃げ）はここ。**
   *
   * `main.ts` は `projectiles.onHitTarget` をここへ繋ぐだけ（`onDrop` と同じ形）。
   */
  hitByProjectile(shot: Projectile, target: ProjectileTarget, ctx: MobContext): void {
    if (shot.damage <= 0) return;

    if (target.owner === PLAYER_OWNER) {
      // **近接とまったく同じ無敵時間を共有する**（`MOB_HURT_COOLDOWN`）。
      // 別の窓にすると、殴られながら火球を受けたときだけ倍の速さで減る。
      if (!ctx.invulnerable) ctx.vitals?.damage(shot.damage, "モンスター", MOB_HURT_COOLDOWN);
      return;
    }

    const mob = this.list.find((m) => m.id === target.owner);
    if (!mob) return;
    const def = MOBS[mob.kind];
    if (!this.wound(mob, shot.damage)) {
      this.onSound?.("mobhurt", def.voice);
      // 受動モブは逃げる（殴られたときと同じ規則。**敵対は逃げない**）。
      if (!def.hostile) {
        mob.fleeTimer = FLEE_TIME;
        mob.walking = true;
        mob.targetYaw = awayFrom(mob, ctx);
      }
      return;
    }

    this.onSound?.("mobdeath", def.voice);
    // **プレイヤーが撃ったものだけ落ちる**（`attack()` と同じ規則）。
    // モブ同士の流れ弾で肉が湧いてはいけない。
    if (shot.owner !== PLAYER_OWNER) return;
    const drop = def.drop;
    const random = ctx.random ?? Math.random;
    if (drop.count > 0 && (drop.chance >= 1 || random() < drop.chance)) {
      this.onDrop?.(drop.item, drop.count, mob.position.x, mob.position.y, mob.position.z);
    }
  }

  /**
   * 飛んでいるものの当たり先（プレイヤー + モブ）。**毎フレーム集め直す。**
   *
   * **プレイヤーぶんもここで作ること** —— `main.ts` で組むと、クリエイティブを
   * 外す条件（`invulnerable`）が殴られる側と撃たれる側の 2 か所に散る。
   * `PLAYER_OWNER`(0) とモブの `id`（1 から）は必ず食い違うので、
   * 撃った本人に当たることはない。
   *
   * **返す配列は使い回し。** 呼んだフレームのうちに使い切ること（`projectiles.update()`
   * にそのまま渡す形で使う）。
   */
  projectileTargets(ctx: MobContext): readonly ProjectileTarget[] {
    this.targets.length = 0;
    if (!ctx.invulnerable) {
      playerFoot.set(ctx.playerX, ctx.playerY, ctx.playerZ);
      this.targets.push({ owner: PLAYER_OWNER, position: playerFoot, size: PLAYER_SIZE });
    }
    for (const mob of this.list) {
      this.targets.push({ owner: mob.id, position: mob.position, size: MOBS[mob.kind].size });
    }
    return this.targets;
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
   * その点から `radius` 以内に敵対モブが居るか（ベッドで寝られるかの材料）。
   *
   * **半径は引数で受ける。** どれだけ近ければ寝られないかは寝る側の規則なので、
   * `beds.ts` の `SLEEP_MONSTER_RADIUS` が持っている。ここは「居るか」を答えるだけ。
   * 距離は 3 次元で見る（真上のゾンビも数える）。
   */
  hostileNear(x: number, y: number, z: number, radius: number): boolean {
    const r2 = radius * radius;
    for (const mob of this.list) {
      if (!MOBS[mob.kind].hostile) continue;
      const dx = mob.position.x - x;
      const dy = mob.position.y - y;
      const dz = mob.position.z - z;
      if (dx * dx + dy * dy + dz * dz <= r2) return true;
    }
    return false;
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
    // **液体の中に湧かせないこと。** 水なら溺れ、溶岩なら焼けるだけで、
    // どちらも「湧いた瞬間に死ぬモブ」を作り続けることになる。
    if (isLiquid(world.getVoxel(x, y, z))) return;

    // **暗さの判定を先に見ること。** 夜の草地は「敵対が湧ける明るさ」でもあり
    // 「受動が湧ける地面」でもあるので、順番がそのまま優先順位になる。
    const sky = world.getLight(x, y, z, SKY_LIGHT);
    const block = world.getLight(x, y, z, BLOCK_LIGHT);
    let kind: MobKind | null = null;
    if (canSpawnHostile(sky, block, ctx.brightness)) {
      // **どの敵対モブになるかは地面が決める**（`hostileFor()`）。
      // ここに `ground === NETHER_BRICK ? ...` と書かないこと —— 種類を足すたびに
      // 湧きの中の分岐が増え、表を読んでも何が湧くのか分からなくなる。
      if (hostile < MAX_HOSTILE) kind = hostileFor(ground, random);
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
      // **倒れた場所を渡すこと。** 受け取る側（`main.ts`）はそこに落とすので、
      // 座標が無いと「遠くで倒したものが足元に湧く」形に戻る。
      this.onDrop?.(drop.item, drop.count, mob.position.x, mob.position.y, mob.position.z);
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

/** 見通しの控えと、当たり先に渡すプレイヤーの足元。**どちらも使い回し。** */
const losOrigin = new Vector3();
const losDir = new Vector3();
const playerFoot = new Vector3();

/**
 * 撃つときと見るときに狙うプレイヤーの高さ（足元から）。**胸のあたり。**
 * 足元を狙うと、坂の下に居る人には必ず地面が先に当たる。
 */
const PLAYER_AIM = 1.4;

/**
 * その向きに遮るものが無いか（撃ってよいか）。
 *
 * **`raycastVoxels` を使うこと。** 自前で刻むと、厚さ 1 マスの壁を飛び越える
 * （飛び道具の当たり判定で踏んだのと同じ穴）。撃つのは間隔ごとに 1 回だけなので、
 * 1 本ぶんの光線は毎フレームの費用にならない。
 */
function clearShot(
  world: World,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
): boolean {
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance <= 1e-4) return true;
  losOrigin.set(x, y, z);
  losDir.set(dx / distance, dy / distance, dz / distance);
  return raycastVoxels(world, losOrigin, losDir, distance) === null;
}

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

