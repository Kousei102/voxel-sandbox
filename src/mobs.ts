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
import {
  BLAZE_ROD,
  EGG,
  ENDER_PEARL,
  FEATHER,
  LEATHER,
  NO_ITEM,
  RAW_BEEF,
  RAW_CHICKEN,
  RAW_PORK,
  ROTTEN_FLESH,
  STRING,
  toolOf,
} from "./items";
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

export type MobKind =
  | "pig"
  | "sheep"
  | "chicken"
  | "cow"
  | "zombie"
  | "spider"
  | "blaze"
  | "enderman"
  | "dragon";

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

/** 落ちる山ひとつ。**1 山目も 2 山目も同じ形。** */
export interface MobDropStack {
  readonly item: number;
  readonly count: number;
  /** 落ちる確率。1 なら必ず。 */
  readonly chance: number;
}

/**
 * 倒したときに出るもの。
 *
 * **2 山目は `extra`**（`items.ts` の `Drop.extra` と同じ名前・同じ意味）。
 * **1 山目の当たり外れとは無関係に、別に引きます** —— 別の山だからです。
 *
 * **ブロック側（`items.ts` の `Drop.extra`）と 1 点だけ違って、こちらは
 * `chance` を持てます。** あちらに確率を持たせられないのは、壊す側に流れてくる
 * 乱数が `BreakOrder.roll` の**1 本だけ**だからで、モブの側は `random()` という
 * 関数が流れてくるので 2 山目を別に引けます。
 *
 * **個数の範囲（min / max）は持たせないこと** —— 範囲が要るなら `ShearRule` の
 * ような別の表の話です（本家の羽根 0〜2 は 1 個固定にしてあります。`TUNING.md`）。
 */
export interface MobDrop extends MobDropStack {
  readonly extra?: MobDropStack;
}

/**
 * 刈って取れるもの。**持っているモブだけが刈れる**（無ければ `null`）。
 *
 * **`kind === "sheep"` と書かないこと**（`ranged` / `teleport` / `orbit` と同じ作法）——
 * 刈れるモブが増えるたびに、刈る側と戻す側の 2 か所に分岐が生えます。
 *
 * **何で刈るか（シアーズか）はここでは見ません** —— それは `items.ts` の
 * `isShears()` の仕事で、ここが持つのは「誰から・何が・何個・いつ戻るか」だけです。
 */
export interface ShearRule {
  /** 刈ると出るもの。 */
  readonly item: number;
  /** 出る数の下限と上限（両端を含む）。 */
  readonly min: number;
  readonly max: number;
  /** また刈れるようになるまでの秒数。**0 にしないこと** —— 連打で羊毛が無限に出ます。 */
  readonly regrow: number;
}

/**
 * ひとりでに産み落とすもの。**持っているモブだけが産む**（無ければ `null`）。
 *
 * **`kind === "chicken"` と書かないこと**（`shearing` / `ranged` / `orbit` と同じ作法）——
 * 産むモブが増えるたびに `update()` の中に分岐が生えます。
 *
 * **刈る（`ShearRule`）との違いは「誰が起こすか」だけ**です。刈るのはプレイヤーの
 * 操作（`shear()`）で、こちらは**時計が 0 になったら勝手に**鳴ります。
 * 出口は同じ `onDrop` なので、`mobs.ts` は `drops.ts` を知らないままです。
 */
export interface LayRule {
  /** 産むもの。 */
  readonly item: number;
  /** 1 回に産む数。 */
  readonly count: number;
  /**
   * 次に産むまでの秒数の幅（両端を含む）。**`min` を 0 にしないこと** ——
   * 毎フレーム産みます。
   */
  readonly min: number;
  readonly max: number;
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

/**
 * 跳ぶ（テレポートする）モブの決まり。**持っているモブだけが跳ぶ**（無ければ `null`）。
 *
 * **どこへ跳ぶかの「探し方」は `teleportSpot()` 1 本**で、ここが持つのは
 * 「どれだけ遠くへ・どれだけの間隔で・どんなときに」という手応えの数値だけ（`TUNING.md`）。
 */
export interface TeleportRule {
  /** 殴られて逃げるとき、自分の周りをこの半径で探す。 */
  readonly range: number;
  /** 追いかけて間合いを詰めるとき、プレイヤーの周りをこの半径で探す。 */
  readonly closeIn: number;
  /** 上下に探す幅。**深すぎると穴の底へ落ちにいく。** */
  readonly vertical: number;
  /** 行き先を探す試行回数。**見つからなければ跳ばない**（壁の中に出ないための唯一の保険）。 */
  readonly tries: number;
  /** 次に跳べるまでの間隔 (秒)。 */
  readonly cooldown: number;
  /** 殴られたときに跳ぶ確率。**1 にしないこと** —— 一発も当てられなくなる。 */
  readonly hurtChance: number;
  /**
   * 追いかけている相手がこれより遠いと、跳んで間合いを詰める。
   * **`ATTACK_STOP` よりずっと大きいこと** —— 目の前で跳ばれると殴れない。
   */
  readonly chaseAt: number;
}

/**
 * 決まった点のまわりを回り続ける決まり。**持っているモブだけが回る**（無ければ `null`）。
 *
 * **中心は表に書かない。** 湧かせた側が決めた点（`Mob.homeX` / `homeZ`）のまわりを回るので、
 * `mobs.ts` はエンドの島の座標を知らずに済む（`spawnOn` が地面の ID しか持たないのと同じ筋）。
 */
export interface OrbitRule {
  /** 中心からこの距離を保って回る。 */
  readonly radius: number;
  /** 中心の地面からこの高さを保つ。**`hover` より高いこと**（低いと歩く相手に殴られる）。 */
  readonly height: number;
  /** 1 回の判断（5Hz）で何 rad 先の点を狙うか。**0 にすると回らずその場に留まる。** */
  readonly turn: number;
  /**
   * この距離まで近づかれたら輪を離れて詰める。**`radius` より小さいこと** ——
   * 大きいと、中心に立っているだけの相手にも always 突っ込んでいって輪が 1 度も見えない。
   */
  readonly diveAt: number;
}

/**
 * 一定時間ごとに入れ替わる「攻め方」1 つぶん。**持っているモブだけが入れ替える**（無ければ `null`）。
 *
 * **`update()` に「ドラゴンなら」を書かないための表**です（`orbit` / `teleport` と同じ作法）。
 * 中身は**既にある 3 つの判断を切り替える印だけ**で、新しい動き方は 1 つも足していません:
 *
 * - `chase` —— `Mobs.chasing()` が見る。false のあいだは**近づかれても輪を離れない**
 * - `shoot` —— `Mobs.fire()` が見る。false のあいだは 1 発も撃たない
 * - `above` —— `aimOrbit()` が見る。0 より大きいと、輪の高さの代わりに
 *   **プレイヤーのこれだけ上**を飛ぶ（撃ち下ろすため）
 *
 * **「何もしない番」を必ず 1 つ入れること。** 近接とブレスだけを回すと、
 * ボスが常にどちらかを仕掛けている状態になり、**柱のクリスタルを割りに行く隙が消える**。
 */
export interface MobPhase {
  /** 何をしている番か（`TUNING.md` とテストの出力に出るだけ）。 */
  readonly name: string;
  /** この番でいる長さ (秒)。 */
  readonly seconds: number;
  /** 近づかれたら輪を離れて詰めるか（`chasing()`）。 */
  readonly chase: boolean;
  /** 遠くから撃つか（`fire()`）。**`MobDef.ranged` が無ければどのみち撃たない。** */
  readonly shoot: boolean;
  /**
   * プレイヤーの何ブロック上を飛ぶか。**0 なら輪の高さ（`orbit.height`）のまま。**
   *
   * ここだけ**中心の地面ではなくプレイヤー基準**なのは、撃ち下ろす番だからです
   * （相手が柱の上に登っていても、頭の上を取れる）。
   */
  readonly above: number;
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
  /** テレポートするか。**跳ばないモブは `null`。** */
  readonly teleport: TeleportRule | null;
  /**
   * 湧きの抽選での重み。**同じ土俵に並んだモブの出やすさの比**で、
   * 受動どうし・敵対どうしの中でしか効かない（受動と敵対の割り振りは明るさが決める）。
   *
   * **1 種類ずつ足すたびに `hostileFor()` の中で分岐を書かないこと。** 重みが無かった頃、
   * 敵対は全部が同じ確率で湧いたので、エンダーマン（体力 40）を足すと**夜の半分が
   * エンダーマン**になった。数値は Minecraft の湧きの重みに寄せてある。
   */
  readonly spawnWeight: number;
  /**
   * 飛ぶ。**重力を受けず、`flyTarget` の高さへ自分で上がり下がりする。**
   * 段差登りも跳び越えも持たない（壁に当たったら上がる）。崖でも引き返さない。
   *
   * **`step` に「ブレイズなら」と書かないこと** —— 飛ぶものが増えるたびに
   * 物理の中の分岐が増える。飛び方の違いは全部この表の値で表す。
   */
  readonly flying: boolean;
  /**
   * 飛ぶモブが床からどれだけ浮くか（飛ばないモブでは使わない。0 でよい）。
   *
   * **`ATTACK_HEIGHT`(1.5) より高いと、平地に立つ相手には近接が届かない。**
   * ブレイズ（2.5）はそれで正しい（**火球のほうが本体**という取り決め）が、
   * 近接しか持たないボスに同じ値を使うと、**降りてきても一度も殴れない**。
   * **1 つの定数を全員で分け合わないこと** —— `MobDef.damage` とまったく同じ話。
   */
  readonly hover: number;
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
  /**
   * ボス。**自然には湧かず（`hostileFor()` の候補に入らない）、遠くても消えず、
   * 数の上限で間引かれもしない。** 置くのは `ensureBoss()` だけ。
   *
   * **この 3 つを別々の印にしないこと** —— 「湧かない」だけを足すと、遠ざかった
   * 瞬間にデスポーンして戦いが終わる。1 つの印で 3 か所とも外れるようにしてある。
   */
  readonly boss: boolean;
  /** 決まった点のまわりを回るか。**回らないモブは `null`。** */
  readonly orbit: OrbitRule | null;
  /**
   * 攻め方を順ぐりに入れ替えるか。**入れ替えないモブは `null`**（ずっと同じ動き）。
   * 並びのとおりに回り、最後まで行ったら先頭へ戻る。
   */
  readonly phases: readonly MobPhase[] | null;
  /**
   * 回復のもと 1 つにつき、毎秒どれだけ体力が戻るか。**0 なら回復しない。**
   *
   * **もとを何個数えるかは呼ぶ側**（`MobContext.healers`）。ここが
   * エンドクリスタルを知り始めると、モブの判断が次元の地形に縛られる
   * （`onDrop` が `drops.ts` を知らないのとまったく同じ筋）。
   */
  readonly regen: number;
  /**
   * 倒したときのドロップ。倒れた場所に落ちる（`onDrop` → `main.ts` → `drops.ts`）。
   *
   * **刈られているあいだのぶんは `dropFor()` が抑えます。** この表を書き換えないこと ——
   * 倒したときに何が出るかと、刈ったあとで出ないことは別の話です。
   */
  readonly drop: MobDrop;
  /** 刈って取れるものか。**刈れないモブは `null`。** */
  readonly shearing: ShearRule | null;
  /**
   * 空のバケツで搾れるか（ミルク）。**搾れないモブは false。**
   *
   * **`kind === "cow"` と書かないこと**（`shearing` / `ranged` / `orbit` と同じ作法）——
   * 搾れるモブが増えるたびに、搾る側の分岐が増えます。
   *
   * **刈る（`ShearRule`）と違って、時計も回数も持ちません** —— 本家の牛は何度でも
   * 搾れるので `regrow` に当たるものが要らず、**位置ごとの状態も ID も増えません。**
   * **何で搾るか（空のバケツか）はここでは見ません** —— それは `use.ts` の
   * `decideUse()` の仕事で、ここが答えるのは「相手の側の都合」だけです。
   */
  readonly milkable: boolean;
  /**
   * ひとりでに産み落とすものか。**産まないモブは `null`。**
   *
   * **`MobDef.drop` とは別の話**です（あちらは倒したときに何が出るか）。
   * 産卵は倒す必要がなく、`Mobs.lay()` の時計 1 本だけで決まります。
   */
  readonly laying: LayRule | null;
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
  teleport: null,
  spawnWeight: 10,
  flying: false,
  hover: 0,
  fireproof: false,
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  drop: { item: RAW_PORK, count: 1, chance: 1 },
  shearing: null,
  milkable: false,
  laying: null,
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
  teleport: null,
  spawnWeight: 12,
  flying: false,
  hover: 0,
  fireproof: false,
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  drop: { item: WOOL, count: 1, chance: 1 },
  // **倒さずに羊毛を取れる唯一のモブ。** 数値は Minecraft のまま（1〜3 個）で、
  // 戻るまでの 60 秒はこちらで決めた暫定（`TUNING.md`）。
  // **刈った羊を倒しても羊毛は出ません**（`dropFor()`）。
  shearing: { item: WOOL, min: 1, max: 3, regrow: 60 },
  milkable: false,
  laying: null,
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

const CHICKEN_FEATHER = 0xf0f0f0;
const CHICKEN_BEAK = 0xf0a020;
const CHICKEN_COMB = 0xd63b2f;
const CHICKEN_EYE = 0x2b1e1c;

/**
 * 鶏。**3 種類目の受動モブ**で、豚以外に肉の出どころができる（生鶏肉 → 焼き鳥）。
 *
 * **当たり判定は Minecraft と同じ 0.4 x 0.7 で、豚・羊よりずっと狭い。**
 * だから**胴を後ろへはみ出させられません**（`test/mobs.test.ts` の `longBody` の例外は
 * 豚と羊だけ。**そこへ鶏を足すと形の点検が丸ごと外れます** —— 判定を広げるのでも
 * 例外に加えるのでもなく、**形のほうを判定に収めること**）。
 * すべての箱が x ±3.2px・z ±3.2px・y 11.2px の中に入っている。
 *
 * **翼は脚とまったく同じ `swing`。** 新しい `MobMotion` は 1 つも足していない
 * （羽ばたきと足踏みは、位相の違う同じ振り）。**振る部位の箱は `y1 === 0`**。
 *
 * グループの並び: 0 = 体（固定）、1 = 頭（くちばし・とさか・目）、2..3 = 脚、4..5 = 翼。
 */
const CHICKEN: MobDef = {
  kind: "chicken",
  name: "鶏",
  // 高さ 0.7 でも段差は受動モブと同じ 0.5（ハーフは登れる）。
  size: { half: 0.2, height: 0.7, step: 0.5 },
  // 本家と同じ 4。**受動でいちばん脆い**（羊 8 / 豚 10）。
  maxHealth: 4,
  speed: 1.7,
  hostile: false,
  damage: 0,
  ranged: null,
  teleport: null,
  // 本家の湧きの重み（豚 10 / 羊 12 と同じ土俵）。
  spawnWeight: 10,
  // **飛びません。** 本家の「ゆっくり落ちる」は `flying` とは別の話（重力を受けない
  // 飛び方しか無いので、入れると壁も崖も無視して飛んでいきます）。
  flying: false,
  hover: 0,
  fireproof: false,
  // **受動に `spawnOn` を付けないこと**（`trySpawn()` 側にも手が要ります。`rules/mobs.md`）。
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  // **2 山落ちます** —— 生鶏肉 1 個（1 山目）と羽根 1 個（`extra`）。
  // 羽根は矢の材料で、本家の 0〜2 個ではなく**1 個固定**です（`items.ts` の `FEATHER`）。
  // **`mobs.ts` の色の定数 `CHICKEN_FEATHER` とは別物**（あちらは見た目の白）。
  drop: { item: RAW_CHICKEN, count: 1, chance: 1, extra: { item: FEATHER, count: 1, chance: 1 } },
  shearing: null,
  milkable: false,
  // **卵を産む唯一のモブ。** 倒さずに取れるという点は羊の羊毛と同じで、違うのは
  // プレイヤーの操作ではなく時計が起こすところだけ（`LayRule` の説明）。
  // 間隔は本家のまま（6000〜12000 ティック = 300〜600 秒）ですが、**モブは
  // `DESPAWN_DISTANCE`(72) で消え、保存もされない**ので、実際に産むところまで
  // 見届けられるのは近くに居続けたときだけです（`TUNING.md`）。
  laying: { item: EGG, count: 1, min: 300, max: 600 },
  // いちばん高い声（羊 1.25 / 豚 1.4 の上）。
  voice: 1.8,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(7), px(-1)], phase: 0 },
    // 脚は左右で逆位相（そろえると跳ねて見える）。
    { motion: "swing", pivot: [px(-1.5), px(3.5), px(0.5)], phase: 0 },
    { motion: "swing", pivot: [px(1.5), px(3.5), px(0.5)], phase: Math.PI },
    // 翼も左右で逆位相。**脚と同じ `swing`。**
    { motion: "swing", pivot: [px(-2.6), px(8), px(0.5)], phase: Math.PI },
    { motion: "swing", pivot: [px(2.6), px(8), px(0.5)], phase: 0 },
  ],
  boxes: [
    // 体（前後 5.5px。**後ろも判定の中**に収める）。**幅は翼より狭くすること** ——
    // 翼（x 2.3..3.1）と同じ ±3 にすると、白い体に白い翼が埋まって振れても見えない
    // （絵に撮って気付いた。判定の縁 ±3.2 には触れていないので、狭めるだけで済む）。
    { group: 0, box: [px(-2.5), px(3.5), px(-2.5), px(2.5), px(8.5), px(3)], color: CHICKEN_FEATHER },
    // 頭（軸は首の付け根。箱は軸からの相対）
    { group: 1, box: [px(-2), 0, px(-1.5), px(2), px(3), px(1.5)], color: CHICKEN_FEATHER },
    // くちばし（前へ。**-Z の端が判定の縁 ±0.2 の内側**）
    { group: 1, box: [px(-1), px(0.6), px(-2.1), px(1), px(1.8), px(-1.5)], color: CHICKEN_BEAK },
    // とさか（**上端 7 + 4 = 11px < 高さ 11.2px**）
    { group: 1, box: [px(-0.6), px(3), px(-1.2), px(0.6), px(4), px(0.3)], color: CHICKEN_COMB },
    // 目（頭の前面から 0.1px だけ出す。豚・羊とまったく同じ作り）
    { group: 1, box: [px(-1.8), px(1.6), px(-1.6), px(-0.6), px(2.4), px(-1.5)], color: CHICKEN_EYE },
    { group: 1, box: [px(0.6), px(1.6), px(-1.6), px(1.8), px(2.4), px(-1.5)], color: CHICKEN_EYE },
    // 脚（**軸からぶら下げる = y1 が 0**。0 でないと足首で回る）
    { group: 2, box: [px(-0.8), px(-3.5), px(-0.8), px(0.8), 0, px(0.8)], color: CHICKEN_BEAK },
    { group: 3, box: [px(-0.8), px(-3.5), px(-0.8), px(0.8), 0, px(0.8)], color: CHICKEN_BEAK },
    // 翼（**ここも y1 が 0**。0 でないと翼の真ん中で折れて回る）。
    // **外端 2.6 + 0.6 = 3.2px = 判定の縁ちょうど**で、体（±2.5）より 0.7px 外に出る。
    { group: 4, box: [px(-0.6), px(-4), px(-1.5), px(0.6), 0, px(1.5)], color: CHICKEN_FEATHER },
    { group: 5, box: [px(-0.6), px(-4), px(-1.5), px(0.6), 0, px(1.5)], color: CHICKEN_FEATHER },
  ],
};

const COW_HIDE = 0x4a3728;
const COW_PATCH = 0xe4ddd0;
const COW_SNOUT = 0xefb9b0;
const COW_HORN = 0xd9d0b4;
const COW_EYE = 0x2b1e1c;

/**
 * 牛。**4 種類目の受動モブ**で、**倒すと 2 山落ちる 2 体目**（生牛肉 1 + 革 1）。
 * 形も表も鶏（`CHICKEN`）とまったく同じ作りで、違うのは
 * **2 山目（`MobDrop.extra`）が最初から付いている**ところだけ。
 *
 * **当たり判定は Minecraft と同じ 0.9 x 1.4。** 豚（0.9 x 0.9）より背が高いぶん
 * 胴を上げられるが、**前後は判定に収めること** —— `test/mobs.test.ts` の
 * `longBody`（胴が後ろへはみ出してよい例外）は**豚と羊だけ**で、
 * **そこへ牛を足すと形の点検が丸ごと外れる**（判定を広げるのでもなく、
 * 例外に加えるのでもなく、**形のほうを削る**）。本家の胴は 18px あるが、
 * ここでは 12px（-5..7）に詰めてある。
 *
 * **角・鼻・白い斑・顔の白い筋は体と違う色**にしてある —— 鶏の翼を体と同じ白・同じ幅に
 * 置いたら、振れても 1 画素も動かなかった（`rules/mobs.md`）。**斑と筋は目とまったく
 * 同じ作り**（面から 0.1px 出した薄い箱）で、**顔の筋が無いと、頭と体が同じ茶色の
 * 1 枚の板に見える**（頭は体より 1.1px しか前に出ておらず、面の向きも同じなので
 * 陰でも分かれない。撮って気付いた）。
 *
 * グループの並び: 0 = 体（固定）、1 = 頭（鼻・角・目）、2..5 = 脚 4 本。
 */
const COW: MobDef = {
  kind: "cow",
  name: "牛",
  size: { half: 0.45, height: 1.4, step: 0.5 },
  // 本家と同じ 10（豚と同じ。受動でいちばん硬い側）。
  maxHealth: 10,
  // 本家の 0.2（豚・鶏 0.25 / 羊 0.23）に合わせて、受動でいちばん遅い（`TUNING.md`）。
  speed: 1.4,
  hostile: false,
  damage: 0,
  ranged: null,
  teleport: null,
  // 本家の湧きの重み（豚 10 / 羊 12 / 鶏 10 と同じ土俵）。
  spawnWeight: 8,
  flying: false,
  hover: 0,
  fireproof: false,
  // **受動に `spawnOn` を付けないこと**（`trySpawn()` 側にも手が要ります。`rules/mobs.md`）。
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  // **2 山落ちます** —— 生牛肉 1 個（1 山目）と革 1 個（`extra`）。
  // 革は本家の 0〜2 個ではなく**1 個固定**（`extra` に個数の範囲を持たせない線引き。
  // 羽根とまったく同じ。`items.ts` の `LEATHER`）。**革の使い道はまだありません。**
  drop: { item: RAW_BEEF, count: 1, chance: 1, extra: { item: LEATHER, count: 1, chance: 1 } },
  shearing: null,
  // **搾れる唯一のモブ。** 倒さずに取れるという点は羊の羊毛・鶏の卵と同じで、
  // 違うのは**何度でも取れる**ところ（本家の牛に待ち時間はないので、`ShearRule` の
  // `regrow` に当たるものを持ちません）。**手に入るのはミルクバケツ 1 個だけ**なので、
  // 落とし物にも `LayRule` にも 1 行も要りません（入れ替えるのは `main.ts`）。
  milkable: true,
  laying: null,
  // いちばん低い声（鶏 1.8 / 豚 1.4 / 羊 1.25 の下）。体の大きさの順に並ぶ。
  voice: 0.9,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(17), px(-4.5)], phase: 0 },
    // 前脚は胴の前寄り、後ろ脚は後端に合わせる（豚・羊と同じ作法）。
    { motion: "swing", pivot: [px(-3), px(12), px(-3)], phase: 0 },
    { motion: "swing", pivot: [px(3), px(12), px(-3)], phase: Math.PI },
    { motion: "swing", pivot: [px(-3), px(12), px(5)], phase: Math.PI },
    { motion: "swing", pivot: [px(3), px(12), px(5)], phase: 0 },
  ],
  boxes: [
    // 体（前後 12px。**後ろも判定 ±7.2px の中**に収める。本家の 18px は入らない）
    { group: 0, box: [px(-5), px(12), px(-5), px(5), px(22), px(7)], color: COW_HIDE },
    // 白い斑（胴の横から 0.1px だけ出す。**目とまったく同じ作り** ——
    // 同じ色の箱を体の中に置くと、輪郭が出ずに 1 画素も見えない）
    { group: 0, box: [px(-5.1), px(14), px(-2), px(-5), px(19), px(3)], color: COW_PATCH },
    { group: 0, box: [px(5), px(14), px(-2), px(5.1), px(19), px(3)], color: COW_PATCH },
    // 頭（軸は首の付け根。箱は軸からの相対）
    { group: 1, box: [px(-3.5), px(-3), px(-1.6), px(3.5), px(3), 0], color: COW_HIDE },
    // 顔の白い筋（**頭の前面から 0.1px。目とまったく同じ作り**）。**これが無いと、
    // 頭も体も同じ茶色で前から見ると 1 枚の板に見える** —— 頭は体より 1.1px しか
    // 前に出ておらず、面の向きも同じなので陰でも分かれない（絵に撮って気付いた。
    // 鶏の翼が白い体に埋まったのと同じ罠。`rules/mobs.md`）。
    // **幅は目（x ±1.8..3）と角に触れない ±1.5 まで** —— 頭の幅いっぱいに広げると
    // 角と 1 本の白い帯になって、角が角に見えなくなる（これも撮って気付いた）。
    { group: 1, box: [px(-1.5), px(0.2), px(-1.7), px(1.5), px(3), px(-1.6)], color: COW_PATCH },
    // 鼻（前へ。**-Z の端 -7.1px が判定の縁 -7.2px の内側**）
    { group: 1, box: [px(-2), px(-2.2), px(-2.6), px(2), px(0.2), px(-1.6)], color: COW_SNOUT },
    // 角（頭の横へ 1.3px 出す。**体と違う色**なので輪郭が出る）
    { group: 1, box: [px(-4.8), px(2), px(-1.4), px(-3.5), px(2.8), px(-0.4)], color: COW_HORN },
    { group: 1, box: [px(3.5), px(2), px(-1.4), px(4.8), px(2.8), px(-0.4)], color: COW_HORN },
    // 目（頭の前面から 0.1px だけ出す。豚・羊・鶏とまったく同じ作り）
    { group: 1, box: [px(-3), px(0.6), px(-1.7), px(-1.8), px(1.6), px(-1.6)], color: COW_EYE },
    { group: 1, box: [px(1.8), px(0.6), px(-1.7), px(3), px(1.6), px(-1.6)], color: COW_EYE },
    // 脚（**軸からぶら下げる = y1 が 0**。0 でないと足首で回る）
    { group: 2, box: [px(-2), px(-12), px(-2), px(2), 0, px(2)], color: COW_HIDE },
    { group: 3, box: [px(-2), px(-12), px(-2), px(2), 0, px(2)], color: COW_HIDE },
    { group: 4, box: [px(-2), px(-12), px(-2), px(2), 0, px(2)], color: COW_HIDE },
    { group: 5, box: [px(-2), px(-12), px(-2), px(2), 0, px(2)], color: COW_HIDE },
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
  teleport: null,
  // **いちばん重い。** 敵対の「どこでも」の枠はゾンビが大半で、
  // エンダーマン（10）はときどき混じる程度（Minecraft と同じ比）。
  spawnWeight: 100,
  flying: false,
  hover: 0,
  fireproof: false,
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  drop: { item: ROTTEN_FLESH, count: 1, chance: 0.6 },
  shearing: null,
  milkable: false,
  laying: null,
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

const SPIDER_BODY = 0x4a3b32;
const SPIDER_LEG = 0x2e241e;
const SPIDER_EYE = 0xd03a2a;

/**
 * クモ。**2 種類目の地表の敵対モブ。** 表の作りはゾンビとまったく同じで、
 * 違うのは**横に広い当たり判定と脚 8 本**だけ（`update()` にも `step()` にも
 * 「クモなら」は 1 行もない）。
 *
 * 当たり判定は本家と同じ 1.4 x 0.9 で、**自然に湧くモブではいちばん横に広い**
 * （次は豚・羊・牛の 0.9。ボスのドラゴンだけが 4 で上）。
 * 段差はゾンビと同じ 0.6 —— **プレイヤーが登れる所には付いてくる。**
 *
 * **`fireproof: true` にしないこと。** 本家のクモは日光で燃えないが、ここでは
 * `fireproof` が**溶岩と日光の両方**を止める 1 つの印で、`sunlightBurns()` の呼び口が
 * `!def.fireproof` だけを見ている。**`sunproof` のような列を足すのも禁止**
 * （`MobDef` に 1 列増えると 9 種類ぜんぶに手が要る）—— **クモは朝に燃える**（`TUNING.md`）。
 *
 * **`spawnWeight` はゾンビと同じ 100**（本家と同じ重み）なので、**夜の「どこでも」の
 * 敵対はゾンビとクモで半々**になる。エンダーマン（10）はいままでどおりときどき。
 *
 * グループの並び: 0 = 胴（固定）、1 = 頭、2..9 = 脚 8 本。
 * 脚は**前後で互い違い・左右も互い違い**（そろえると 8 本が 1 枚の板に見える）。
 *
 * **脚は胴より外へ出すこと。** 胴（±5px）の中に納めると、暗い体に暗い脚が埋まって
 * 1 画素も見えない（鶏の翼・牛の顔で 2 度踏んだ罠。`rules/mobs.md`）——
 * 足先は ±10.6px で、判定の縁 ±11.2px には触れていない。目も同じ理屈で、
 * **頭の前面から 0.1px 出した赤い箱**にしてある。
 */
const SPIDER: MobDef = {
  kind: "spider",
  name: "クモ",
  // 本家と同じ 1.4 x 0.9。**`longBody` に足さない / 広げないこと** ——
  // 収まらないときは形のほうを削る（`rules/mobs.md`）。
  size: { half: 0.7, height: 0.9, step: 0.6 },
  maxHealth: 16,
  // 本家の 0.3（ゾンビ 0.23 → ここでは 4.6）と同じ比。**歩き 5.2 より速く、
  // 走り 8.4 より遅い** = 見つかっても走れば振り切れる。
  speed: 6.0,
  hostile: true,
  damage: 2,
  ranged: null,
  teleport: null,
  // **ゾンビと同じ重み**（本家のまま）。夜の敵対はゾンビとクモが半々になる。
  spawnWeight: 100,
  flying: false,
  hover: 0,
  // **false のまま**（上の説明）。朝になると日光で燃える。
  fireproof: false,
  // **付けないこと** —— 付けると、その地面で「どこでも」の敵対に勝ってしまう。
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  // **1 個固定**（本家の 0〜2 個ではない。羽根・革と同じ線引き）。`extra` は持たない。
  drop: { item: STRING, count: 1, chance: 1 },
  shearing: null,
  milkable: false,
  laying: null,
  // ゾンビ（0.7）より高い。小さくて速いものの声（`TUNING.md`）。
  voice: 1.5,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(7.5), px(-3)], phase: 0 },
    // 脚 8 本。**前後で互い違い、左右も互い違い**にする。
    { motion: "swing", pivot: [px(-4), px(8), px(-2.5)], phase: 0 },
    { motion: "swing", pivot: [px(-4), px(8), px(-0.5)], phase: Math.PI },
    { motion: "swing", pivot: [px(-4), px(8), px(1.5)], phase: 0 },
    { motion: "swing", pivot: [px(-4), px(8), px(3.5)], phase: Math.PI },
    { motion: "swing", pivot: [px(4), px(8), px(-2.5)], phase: Math.PI },
    { motion: "swing", pivot: [px(4), px(8), px(-0.5)], phase: 0 },
    { motion: "swing", pivot: [px(4), px(8), px(1.5)], phase: Math.PI },
    { motion: "swing", pivot: [px(4), px(8), px(3.5)], phase: 0 },
  ],
  boxes: [
    // 腹（後ろの大きいほう）と胸（脚が付くほう）
    { group: 0, box: [px(-5), px(4), px(1), px(5), px(12), px(9)], color: SPIDER_BODY },
    { group: 0, box: [px(-4), px(4.5), px(-3), px(4), px(10.5), px(1)], color: SPIDER_BODY },
    // 頭（軸は胸の前。箱は軸からの相対）
    { group: 1, box: [px(-4), px(-3.5), px(-8), px(4), px(2.5), 0], color: SPIDER_BODY },
    // 目 4 つ。**頭の前面から 0.1px 出す**（同じ色の箱を中に置くと 1 画素も見えない）
    { group: 1, box: [px(-3.5), px(0), px(-8.1), px(-2.2), px(1.3), px(-8)], color: SPIDER_EYE },
    { group: 1, box: [px(-1.5), px(0), px(-8.1), px(-0.2), px(1.3), px(-8)], color: SPIDER_EYE },
    { group: 1, box: [px(0.2), px(0), px(-8.1), px(1.5), px(1.3), px(-8)], color: SPIDER_EYE },
    { group: 1, box: [px(2.2), px(0), px(-8.1), px(3.5), px(1.3), px(-8)], color: SPIDER_EYE },
    // 脚 8 本 x（外へ伸びる太もも + 外端で下りるすね）。
    // **どちらも軸からぶら下げる = y1 が 0**（0 でないと膝で回る）。
    // 脚の外端 ±10.6px は胴の ±5px より外なので、暗い体に暗い脚が埋まらない。
    { group: 2, box: [px(-5.6), px(-1.4), px(-1), 0, 0, px(1)], color: SPIDER_LEG },
    { group: 2, box: [px(-6.6), px(-8), px(-1), px(-5), 0, px(1)], color: SPIDER_LEG },
    { group: 3, box: [px(-5.6), px(-1.4), px(-1), 0, 0, px(1)], color: SPIDER_LEG },
    { group: 3, box: [px(-6.6), px(-8), px(-1), px(-5), 0, px(1)], color: SPIDER_LEG },
    { group: 4, box: [px(-5.6), px(-1.4), px(-1), 0, 0, px(1)], color: SPIDER_LEG },
    { group: 4, box: [px(-6.6), px(-8), px(-1), px(-5), 0, px(1)], color: SPIDER_LEG },
    { group: 5, box: [px(-5.6), px(-1.4), px(-1), 0, 0, px(1)], color: SPIDER_LEG },
    { group: 5, box: [px(-6.6), px(-8), px(-1), px(-5), 0, px(1)], color: SPIDER_LEG },
    { group: 6, box: [0, px(-1.4), px(-1), px(5.6), 0, px(1)], color: SPIDER_LEG },
    { group: 6, box: [px(5), px(-8), px(-1), px(6.6), 0, px(1)], color: SPIDER_LEG },
    { group: 7, box: [0, px(-1.4), px(-1), px(5.6), 0, px(1)], color: SPIDER_LEG },
    { group: 7, box: [px(5), px(-8), px(-1), px(6.6), 0, px(1)], color: SPIDER_LEG },
    { group: 8, box: [0, px(-1.4), px(-1), px(5.6), 0, px(1)], color: SPIDER_LEG },
    { group: 8, box: [px(5), px(-8), px(-1), px(6.6), 0, px(1)], color: SPIDER_LEG },
    { group: 9, box: [0, px(-1.4), px(-1), px(5.6), 0, px(1)], color: SPIDER_LEG },
    { group: 9, box: [px(5), px(-8), px(-1), px(6.6), 0, px(1)], color: SPIDER_LEG },
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
  teleport: null,
  // 要塞の床では 1 種類しか候補に残らないので、比としては効かない
  // （**それでも書いておくこと** —— 地面を指定しないモブが増えたときに効き始める）。
  spawnWeight: 10,
  flying: true,
  // 床から 2.5 浮く。**`ATTACK_HEIGHT`(1.5) より高いので、平地に立つ相手には
  // 近接がめったに届かない** —— 火球のほうが本体という取り決め（`rules/mobs.md`）。
  hover: 2.5,
  fireproof: true,
  spawnOn: [NETHER_BRICK],
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  drop: { item: BLAZE_ROD, count: 1, chance: 0.5 },
  shearing: null,
  milkable: false,
  laying: null,
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

const ENDERMAN_SKIN = 0x14121a;
const ENDERMAN_EYE = 0xd07bfa;

/**
 * エンダーマン。**初めての跳ぶ（テレポートする）モブ**で、エンダーパールの出どころ。
 *
 * 当たり判定は Minecraft と同じ 0.6 x 2.9 —— **背が高いので、天井まで 3 マス空いた所に
 * しか湧かない**（洞窟の低い所には出ない）。段差は 0.6 でゾンビと同じなので、
 * プレイヤーが登れる所には付いてくる。
 *
 * **本家と違って中立ではありません**（見つめると怒る、が無い）。
 * ゾンビと同じ「暗い所に湧いて襲ってくる」側で、代わりに殴られると跳んで逃げる。
 * 中立にするなら `hostile` の使われ方（湧きの枠・逃げ方・日光・ベッド）を
 * まとめて考え直すことになるので、ここでは足していない。
 *
 * グループの並び: 0 = 胴（固定）、1 = 頭、2..3 = 腕、4..5 = 脚。
 * 腕も脚も 26px と長い（本家の細長い体型）。腕は同じ側の脚と逆の位相にする。
 */
const ENDERMAN: MobDef = {
  kind: "enderman",
  name: "エンダーマン",
  size: { half: 0.3, height: 2.9, step: 0.6 },
  maxHealth: 40,
  // プレイヤーの歩き (5.2) よりわずかに遅い。**本家の比では 6.0 だが、
  // ゾンビと同じ「歩きより遅く」の線に揃えてある**（`TUNING.md`）——
  // 跳んで間合いを詰めてくるぶん、速さまで上回ると走っても逃げ切れない。
  speed: 5,
  hostile: true,
  // 本家と同じ 7（ゾンビ 2 / ブレイズ 6 より重い）。**近づかれたら 3 発で死ぬ。**
  damage: 7,
  ranged: null,
  // 跳び方。数値は本家に寄せた暫定（`TUNING.md`）。**`hurtChance` を 1 にしないこと** ——
  // 殴るたびに必ず消えるので、体力 40 を削り切れなくなる。
  teleport: {
    range: 16,
    closeIn: 5,
    vertical: 8,
    tries: 8,
    cooldown: 1.5,
    hurtChance: 0.5,
    chaseAt: 8,
  },
  flying: false,
  hover: 0,
  fireproof: false,
  spawnOn: null,
  boss: false,
  orbit: null,
  phases: null,
  regen: 0,
  drop: { item: ENDER_PEARL, count: 1, chance: 0.5 },
  shearing: null,
  milkable: false,
  laying: null,
  // 本家の湧きの重み。ゾンビ (100) の 1/10 なので、夜に出会うのはたまに。
  spawnWeight: 10,
  voice: 0.6,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(38), 0], phase: 0 },
    { motion: "swing", pivot: [px(-3.5), px(38), 0], phase: Math.PI },
    { motion: "swing", pivot: [px(3.5), px(38), 0], phase: 0 },
    { motion: "swing", pivot: [px(-1.5), px(26), 0], phase: 0 },
    { motion: "swing", pivot: [px(1.5), px(26), 0], phase: Math.PI },
  ],
  boxes: [
    // 胴（細い。当たり判定 0.6 = 9.6px に収める）
    { group: 0, box: [px(-3), px(26), px(-2), px(3), px(38), px(2)], color: ENDERMAN_SKIN },
    // 頭（軸は首。箱は軸からの相対）。**上端 38 + 8 = 46px = 2.875** で高さ 2.9 に収まる
    { group: 1, box: [px(-4), 0, px(-4), px(4), px(8), px(4)], color: ENDERMAN_SKIN },
    // 目。**体が真っ黒なので、ここだけが暗闇で見えるもの**になる
    { group: 1, box: [px(-3), px(4), px(-4.1), px(-1), px(5.5), px(-4)], color: ENDERMAN_EYE },
    { group: 1, box: [px(1), px(4), px(-4.1), px(3), px(5.5), px(-4)], color: ENDERMAN_EYE },
    // 腕・脚（**軸からぶら下げる = y1 が 0**。0 でないと肘や膝で回る）
    { group: 2, box: [px(-1), px(-26), px(-1), px(1), 0, px(1)], color: ENDERMAN_SKIN },
    { group: 3, box: [px(-1), px(-26), px(-1), px(1), 0, px(1)], color: ENDERMAN_SKIN },
    { group: 4, box: [px(-1), px(-26), px(-1), px(1), 0, px(1)], color: ENDERMAN_SKIN },
    { group: 5, box: [px(-1), px(-26), px(-1), px(1), 0, px(1)], color: ENDERMAN_SKIN },
  ],
};

const DRAGON_SKIN = 0x1b1424;
const DRAGON_WING = 0x2f2340;
const DRAGON_EYE = 0xd07bfa;

/**
 * エンダードラゴン。**初めてのボス**（`boss: true`）で、初めて回るモブ（`orbit`）。
 *
 * 3 つの「ふつうのモブと違うところ」は**全部表の値**で、`update()` にも `step()` にも
 * 「ドラゴンなら」は 1 行も無い:
 *
 * 1. **`boss`** —— 自然には湧かず・遠くても消えず・数の上限でも間引かれない
 * 2. **`orbit`** —— 決まった点のまわりを回り、近づかれたときだけ離れて詰める
 * 3. **`regen`** —— 回復のもと（生きているエンドクリスタル）1 つにつき毎秒 2 戻る
 *
 * **回復のもとを数えるのは呼ぶ側**（`MobContext.healers` ← `crystals.ts` の
 * `liveCrystals()`）。ここが柱やクリスタルの居場所を知り始めると、モブの表が
 * エンドの地形に縛られる。
 *
 * 当たり判定は 4 x 1.8。**モデルは翼の端まで含めてこの箱に収まる**
 * （`test/mobs.test.ts` が全種類ぶん突き合わせている）。
 * 段差は 0 —— 飛ぶので登る必要がなく、ブレイズと同じ理由。
 *
 * グループの並び: 0 = 胴（固定）、1 = 頭、2..3 = 翼、4..5 = 脚、6 = 尾。
 */
const DRAGON: MobDef = {
  kind: "dragon",
  name: "エンダードラゴン",
  size: { half: 2, height: 1.8, step: 0 },
  // 本家と同じ 200。ダイヤの弓矢（最大 9）で 23 本ぶん。
  maxHealth: 200,
  // プレイヤーの走り (8.4) より遅い。**速くすると、輪を離れて詰めてきたときに
  // 走っても振り切れない**（壁も崖も関係なく飛んでくる）。
  speed: 7,
  hostile: true,
  // 本家のノーマルと同じ 10（ゾンビ 2 / ブレイズ 6 / エンダーマン 7 より重い）。
  // **満タンから 2 発で半分**なので、輪の下に居続けられない。
  damage: 10,
  // ブレス。**撃つのは `phases` の「ブレス」の番だけ**（`fire()` が見る）。
  // **`range` が輪の半径 (20) より長いこと** —— 輪を回りながら撃つので、
  // ブレイズの「見えた距離より短く」（16 < `HOSTILE_SIGHT` 18）は当てはまらない。
  // 短いと、中心に立つ相手にすら 1 発も届かない番ができる。
  ranged: {
    kind: "breath",
    damage: 6,
    range: 40,
    near: 4,
    // 1.5 秒に 1 発。**番の長さ (12 秒) で 8 発**まで。
    cooldown: 1.5,
    // 口元（当たり判定 1.8 の上のほう）。**撃った本人には当たらない**ので、
    // ここは見た目の出どころを合わせるだけの値（ブレイズの 1.1 と同じ役目）。
    height: 1.4,
  },
  teleport: null,
  // 自然には湧かないので抽選には出てこない（`hostileFor()` が `boss` を外す）。
  // **それでも書いておくこと** —— 値が無いと、ボスを湧かせる道を足したときに 0 で割る。
  spawnWeight: 1,
  flying: true,
  // **ブレイズ（2.5）より低いこと。** 近接しか持たないので、2.5 のままだと
  // 降りてきても `ATTACK_HEIGHT`(1.5) に届かず、一度も殴れないボスになる。
  hover: 1.2,
  // エンドに溶岩は無いが、**日光では燃えないこと**が要る（エンドの空は
  // 明るさ 0.7 固定なので、`sunlightBurns()` の線を超える所がある）。
  fireproof: true,
  spawnOn: null,
  boss: true,
  // 柱の輪（半径 28）の内側を回る。**外側にすると柱に体当たりし続ける。**
  // 高さは柱の低いほう（12）と同じくらいで、**矢が届く**こと。
  orbit: { radius: 20, height: 12, turn: 0.35, diveAt: 16 },
  // 3 つの番を順ぐりに（本家の「突っ込む・ブレス・旋回」に倣った 3 つ）。
  // **並びが手触りそのもの** —— 近接のあとにブレスが来るので、殴られて逃げた先に
  // 撃ち下ろされる。最後の「旋回」が**クリスタルを割りに行ける唯一の隙**。
  phases: [
    { name: "近接", seconds: 10, chase: true, shoot: false, above: 0 },
    // 輪を回ったまま、プレイヤーの 10 マス上から 1.5 秒に 1 発。
    { name: "ブレス", seconds: 12, chase: false, shoot: true, above: 10 },
    { name: "旋回", seconds: 8, chase: false, shoot: false, above: 0 },
  ],
  // 生きているクリスタル 1 個につき毎秒 2。10 個そろっていると毎秒 20 戻るので、
  // **矢（最大 9）をどれだけ当てても削り切れない** —— 先に柱の上を落とすことになる。
  regen: 2,
  // **何も落とさない**（本家は経験値と卵。どちらもまだ無い）。倒した合図は
  // 体力バーとクリア画面（2-13b）の仕事で、地面に湧く物ではない。
  drop: { item: NO_ITEM, count: 0, chance: 0 },
  shearing: null,
  milkable: false,
  laying: null,
  voice: 0.5,
  groups: [
    { motion: "fixed", pivot: [0, 0, 0], phase: 0 },
    { motion: "head", pivot: [0, px(20), px(-10)], phase: 0 },
    // 翼は左右で逆位相（そろえると羽ばたきに見えない）。
    { motion: "swing", pivot: [px(-8), px(24), 0], phase: 0 },
    { motion: "swing", pivot: [px(8), px(24), 0], phase: Math.PI },
    { motion: "swing", pivot: [px(-5), px(14), px(6)], phase: Math.PI },
    { motion: "swing", pivot: [px(5), px(14), px(6)], phase: 0 },
    { motion: "swing", pivot: [0, px(20), px(14)], phase: Math.PI / 2 },
  ],
  boxes: [
    // 胴（前後 24px）
    { group: 0, box: [px(-8), px(14), px(-10), px(8), px(26), px(14)], color: DRAGON_SKIN },
    // 頭（軸は首の付け根。箱は軸からの相対）
    { group: 1, box: [px(-5), px(-2), px(-12), px(5), px(6), px(0)], color: DRAGON_SKIN },
    { group: 1, box: [px(-3), px(-3), px(-16), px(3), px(1), px(-12)], color: DRAGON_SKIN },
    // 目。**体が真っ黒なので、ここだけが暗いエンドで見えるもの**になる
    { group: 1, box: [px(-4), px(1), px(-12.1), px(-1.5), px(3), px(-12)], color: DRAGON_EYE },
    { group: 1, box: [px(1.5), px(1), px(-12.1), px(4), px(3), px(-12)], color: DRAGON_EYE },
    // 翼（**軸からぶら下げる = y1 が 0**。0 でないと翼の真ん中で折れて回る）
    { group: 2, box: [px(-24), px(-2), px(-8), 0, 0, px(8)], color: DRAGON_WING },
    { group: 3, box: [0, px(-2), px(-8), px(24), 0, px(8)], color: DRAGON_WING },
    // 脚
    { group: 4, box: [px(-2), px(-8), px(-2), px(2), 0, px(2)], color: DRAGON_SKIN },
    { group: 5, box: [px(-2), px(-8), px(-2), px(2), 0, px(2)], color: DRAGON_SKIN },
    // 尾（後ろへ 18px。**当たり判定 ±2 に収める**）
    { group: 6, box: [px(-3), px(-3), 0, px(3), 0, px(18)], color: DRAGON_SKIN },
  ],
};

export const MOBS: Record<MobKind, MobDef> = {
  pig: PIG,
  sheep: SHEEP,
  chicken: CHICKEN,
  cow: COW,
  zombie: ZOMBIE,
  spider: SPIDER,
  blaze: BLAZE,
  enderman: ENDERMAN,
  dragon: DRAGON,
};
export const MOB_KINDS: readonly MobKind[] = [
  "pig",
  "sheep",
  "chicken",
  "cow",
  "zombie",
  "spider",
  "blaze",
  "enderman",
  "dragon",
];
/** 湧きの抽選に使う受動モブ。**敵対と混ぜないこと**（湧く条件も上限も別）。 */
const PASSIVE_KINDS: readonly MobKind[] = ["pig", "sheep", "chicken", "cow"];
/**
 * 湧きの抽選に使う敵対モブ。**表から作ること**（足したときに書き忘れる）。
 * **ボスは外す** —— 抽選に残すと、夜のオーバーワールドにドラゴンが湧く。
 */
const HOSTILE_KINDS: readonly MobKind[] = MOB_KINDS.filter(
  (kind) => MOBS[kind].hostile && !MOBS[kind].boss,
);

/**
 * 次元ごとのボス。**キーは次元の名前**（`dimensions.ts` の `DimensionId`）で、
 * `daynight.ts` の `SKY_STYLES` や `beds.ts` の `BedPoint.dim` と同じ作法 ——
 * **`mobs.ts` は `dimensions.ts` を import しない**（生成器を引き連れてくる）。
 * 綴りのずれは `test/mobs.test.ts` が `DIMENSIONS` と突き合わせている。
 *
 * **表に無い次元にはボスが居ない**（`ensureBoss()` が何もしない）。
 */
export interface BossPlan {
  readonly kind: MobKind;
  /** 回る中心（＝島の中心）。**湧く場所ではない**（下の `ensureBoss()`）。 */
  readonly x: number;
  readonly z: number;
}
export const BOSSES: Record<string, BossPlan> = {
  end: { kind: "dragon", x: 0, z: 0 },
};

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
  return pickWeighted(pool, random);
}

/**
 * 重み（`MobDef.spawnWeight`）つきの抽選。候補が空なら null。
 *
 * **受動と敵対で共有すること。** 均等割りだったころ、エンダーマンを足した瞬間に
 * 夜の敵対の半分がエンダーマン（体力 40・一撃 7）になった。**種類を足すたびに
 * 抽選の中へ分岐を書かない**ための表の値で、`hostileFor()` と `trySpawn()` の
 * 受動側が同じ 1 本を通る。
 */
export function pickWeighted(pool: readonly MobKind[], random: () => number): MobKind | null {
  if (pool.length === 0) return null;
  let total = 0;
  for (const kind of pool) total += MOBS[kind].spawnWeight;
  if (total <= 0) return pool[pool.length - 1];
  let roll = random() * total;
  for (const kind of pool) {
    roll -= MOBS[kind].spawnWeight;
    // **最後は必ず返すこと**（`random()` が 1 を返す実装でも表の外を引かない）。
    if (roll < 0) return kind;
  }
  return pool[pool.length - 1];
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
 * 飛ぶモブが床から浮いていたい高さ。**種類ごとの値は `MobDef.hover`** で、
 * ここはその既定（ブレイズの値）。**1 より大きいこと** ——
 * 1 以下だと、床に置いた松明や手すりに引っかかって前へ進めなくなる。
 */
export const FLY_HOVER = BLAZE.hover;
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
  /**
   * 回る中心（`MobDef.orbit` を持つモブだけが使う）。**湧いた場所が既定**で、
   * ボスは `ensureBoss()` が表の中心を貼り直す。
   *
   * **中心を表（`MobDef`）に持たせないこと** —— 持たせた瞬間、`mobs.ts` が
   * エンドの島の座標を知ることになる。
   */
  homeX: number;
  homeY: number;
  homeZ: number;
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
  /**
   * 刈られてから、また刈れるようになるまでの残り (秒)。**0 なら刈れる。**
   *
   * **保存しません**（モブそのものを保存しないので、1 バイトも増えません）。
   * 刈れないモブでは 0 のまま動かない（`MobDef.shearing` が `null`）。
   */
  woolTimer: number;
  /**
   * 次に産み落とすまでの残り (秒)。**0 を切ったら 1 回産んで、次の間隔を入れ直す。**
   *
   * **保存しません**（`woolTimer` と同じ。モブそのものを保存しないので、
   * セーブは 1 バイトも増えません）。産まないモブでは 0 のまま動かない
   * （`MobDef.laying` が `null`）。
   *
   * **湧いた瞬間の 0 から始めないこと** —— まとめ打ちで湧いた全員が
   * 最初のフレームで 1 個ずつ産みます（`spawn()` の初期値）。
   */
  layTimer: number;
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
   * いまの攻め方（`MobDef.phases` の添字）。**表を持たないモブでは 0 のまま**で、
   * どこからも読まれない（`phaseOf()` が null を返す）。
   */
  phase: number;
  /** いまの攻め方があと何秒続くか。0 を切ると次の番へ回る。 */
  phaseTimer: number;
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
  /** 次に跳べる（テレポートできる）までの残り (秒)。跳ばないモブでは使わない。 */
  teleportTimer: number;
  /**
   * 殴られたので跳びたがっている。**跳ぶのは `update()` の中**（行き先を探すのに
   * `world` が要る）。`wound()` は `attack()` / `hitByProjectile()` / `burn()` の
   * 3 か所から呼ばれるので、**印を立てるだけにしておけば 3 通りとも同じ経路に乗る。**
   */
  teleportUrge: boolean;
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
const TOOL_ATTACK: Record<string, number> = { sword: 4, axe: 3, pickaxe: 2, shovel: 1, hoe: 1 };
/** 階層 1 つにつき増える攻撃力。 */
const TIER_ATTACK = 0.5;

/**
 * その道具で殴ったときのダメージ。剣 > 斧 > ツルハシ > シャベル > 素手 で、
 * 同じ種類なら階層が上ほど強い（素手 1 〜 ダイヤの剣 6）。
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
  /**
   * 回復のもとの数（いまは生きているエンドクリスタル）。**数えるのは呼ぶ側**で、
   * **1 つにつきどれだけ戻るかは表**（`MobDef.regen`）。
   *
   * **`mobs.ts` から `crystals.ts` を見に行かないこと** —— `onDrop` が `drops.ts` を
   * 知らないのと同じ筋で、知り始めるとモブの判断が次元の地形に縛られる。
   * 渡さなければ 1 も回復しない（テストと、遊んでいない間）。
   */
  readonly healers?: number;
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
   * もうボスを召喚した次元。**倒したあとに湧き直させないための印。**
   *
   * **モブと同じで保存しません**（`clear()` で消える）ので、いまはワールドを
   * 読み直すとボスが戻ります。倒した印をワールド側に持たせるのは出口ポータルの周
   * （2-13b）の仕事 —— あれが建っていれば「倒した」と読める。
   */
  private readonly summoned = new Set<string>();

  /**
   * 物が出たときの受け取り口。`screen.onChange` と同じ形で `main.ts` から繋ぐ。
   *
   * **鳴るのは 3 通り**: 倒したとき（`attack()` / `hitByProjectile()`）・
   * 刈ったとき（`shear()`）・**産んだとき（`lay()`）**。座標はそのモブの居る所で、
   * **山ごとに 1 回**鳴る（地面での散らばりは `drops.ts` の `burst()` の仕事）。
   *
   * **倒したぶんはプレイヤーが倒したときだけ発火させること**（遠くで勝手に
   * 焼け死んだモブの肉が地面に湧いてはいけない）。**産卵はその縛りに掛からない** ——
   * 誰も倒しておらず、鶏が生きたまま落とすものだから。
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
    // **表を一度だけ引くこと。** `MOBS[kind].laying` を書くと、`kind` が
    // union のままなので下の `.min` / `.max` で null 除外が効かない。
    const laying = MOBS[kind].laying;
    const mob: Mob = {
      id: this.nextId++,
      kind,
      position: new Vector3(x, y, z),
      // 回る中心の既定は湧いた場所（ボスだけ `ensureBoss()` が貼り直す）。
      homeX: x,
      homeY: y,
      homeZ: z,
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
      // 湧いた羊はすぐ刈れる（本家と同じ）。
      woolTimer: 0,
      // **0 から始めないこと** —— 湧いた瞬間に全員が 1 個ずつ産む。
      // 産まないモブでは 0 のまま読まれない。
      layTimer: laying ? pick(random, [laying.min, laying.max]) : 0,
      fleeTimer: 0,
      burnTimer: 0,
      burnTick: 0,
      attackTimer: 0,
      // 湧いた瞬間に撃たせない（目の前に湧いたときの初弾を待たせる）。
      shootTimer: MOBS[kind].ranged?.cooldown ?? 0,
      // **先頭の番から始める**（ドラゴンなら近接）。表を持たないモブでは読まれない。
      phase: 0,
      phaseTimer: MOBS[kind].phases?.[0].seconds ?? 0,
      hopTimer: 0,
      // 湧いた瞬間から浮き始める（0 にすると、最初の判断まで床に落ちようとする）。
      flyTarget: y + (MOBS[kind].flying ? MOBS[kind].hover : 0),
      // 湧いた瞬間に跳ばせない（`shootTimer` と同じ理屈。目の前に湧いて即詰められると避けられない）。
      teleportTimer: MOBS[kind].teleport?.cooldown ?? 0,
      teleportUrge: false,
    };
    this.list.push(mob);
    return mob;
  }

  clear(): void {
    this.list.length = 0;
    this.spawnTimer = 0;
    this.attackTimer = 0;
    this.summoned.clear();
  }

  /**
   * その次元のボスを 1 体だけ置く。置いたら `Mob`、置かなかったら null。
   *
   * **毎フレーム呼んでよい**（`main.ts` がそうしている）。置かないのは 4 通り:
   *
   * 1. その次元にボスが居ない（`BOSSES` に無い）
   * 2. **もう召喚した**（この読み込みのあいだの印。`clear()` で消える）
   * 3. **倒した印が立っている**（`defeated`）—— **世界をまたぐのはこちら。**
   *    印そのもの（エンドの出口ポータル）は `exitportal.ts` が持ち、**ここは
   *    立っているかどうかを受け取るだけ**（`MobContext.healers` と同じ形で、
   *    `mobs.ts` がエンドの地形を知らずに済む）
   * 4. **中心の列がまだ読み込まれていない／地面が無い** —— `getVoxel` は未読み込みで
   *    AIR を返すので、そのまま湧かせると虚空に置いて落としてしまう
   *    （かまどの `syncLit()` / クリスタルの `crystalState()` と同じ罠）
   *
   * **湧かせる場所は輪の上**（中心から `orbit.radius` だけ離れた所）。中心に置くと、
   * ポータルから降りた人の頭の上に湧いて、輪に出る前に殴りかかることになる。
   */
  ensureBoss(dimension: string, world: World, defeated: boolean): Mob | null {
    const plan = BOSSES[dimension];
    if (!plan || defeated || this.summoned.has(dimension)) return null;

    const def = MOBS[plan.kind];
    const x = plan.x + (def.orbit?.radius ?? 0) + 0.5;
    const z = plan.z + 0.5;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!world.hasColumn(columnOf(ix), columnOf(iz))) return null;
    // **世界の高さぶん探すこと。** 湧きの既定（24 段）は「プレイヤーの近くの地面」を
    // 探す値で、島の高さを知らないここでは足りない（1 フレームに 1 回なので費用は問題ない）。
    const y = findGround(world, ix, WORLD_HEIGHT - 1, iz, WORLD_HEIGHT);
    if (y < 0) return null;

    const mob = this.spawn(plan.kind, x, y, z, 0);
    // **中心は表の点**（湧いた場所ではない）。ここを貼り直さないと、
    // 輪が島の中心ではなく「湧いた所」のまわりになる。
    mob.homeX = plan.x + 0.5;
    mob.homeZ = plan.z + 0.5;
    mob.homeY = y;
    this.summoned.add(dimension);
    return mob;
  }

  /**
   * その次元でいま生きているボス。居なければ null。**体力バーの材料。**
   *
   * **1 体だけを前提にしない**（`BOSSES` は次元ごとの表なので、次元を足せば
   * ボスも増える）。返すのは `Mob` そのものではなく**画面に要る値だけ**で、
   * `boss.ts` の `BossFacts` と構造で合わせてある —— `mobs.ts` が
   * 画面の都合を知らずに済み、あちらも `mobs.ts` を import せずに済む
   * （食い違えば `test/boss.test.ts` の型検査で止まる）。
   */
  activeBoss(dimension: string): { name: string; health: number; maxHealth: number } | null {
    const plan = BOSSES[dimension];
    if (!plan) return null;
    const mob = this.list.find((m) => m.kind === plan.kind);
    if (!mob) return null;
    const def = MOBS[mob.kind];
    return { name: def.name, health: mob.health, maxHealth: def.maxHealth };
  }

  /**
   * その次元のボスの名前。表に無ければ null。
   *
   * **倒したあとに要る**（クリア画面の 1 行）。倒れたモブはもう `list` に
   * 居ないので、`activeBoss()` では名前が取れない。
   */
  bossName(dimension: string): string | null {
    const plan = BOSSES[dimension];
    return plan ? MOBS[plan.kind].name : null;
  }

  /**
   * その次元のボスを**倒したか**（この読み込みのあいだだけの記憶）。
   *
   * **「召喚したのに、もう居ない」で決める。** `boss: true` のモブは遠くても消えず、
   * 数の上限でも間引かれないので（`update()` の 2 か所）、`list` から抜ける理由は
   * 倒された以外に無い。**別の印を足さないこと** —— `summoned` と 2 つに分かれると、
   * `clear()` で片方だけ消える形を作れる。
   *
   * **これは世界をまたぐ印ではない**（`clear()` で消える）。倒したことを次の
   * 読み込みへ伝えるのは、ワールドに建つ出口ポータル（`exitportal.ts`）の役目で、
   * `main.ts` がこの返り値を渡して建てさせる。
   */
  bossDefeated(dimension: string): boolean {
    const plan = BOSSES[dimension];
    if (!plan || !this.summoned.has(dimension)) return false;
    return !this.list.some((mob) => mob.kind === plan.kind);
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

      // **判断より前に回すこと。** あとに置くと、番が替わったフレームだけ
      // 1 つ前の攻め方で向きと高さを決めることになる（5Hz なので 0.2 秒引きずる）。
      this.advancePhase(mob, def, dt);

      mob.thinkTimer -= dt;
      if (mob.thinkTimer <= 0) {
        mob.thinkTimer += AI_TICK;
        this.think(mob, def, world, ctx, random);
      }

      this.step(mob, def, world, dt, ctx);

      // **産卵は毎フレーム**（判断は 5Hz なので、そこに置くと遠くて動かない個体の
      // 時計が進まない。`woolTimer` を `step()` で減らしているのと同じ理由）。
      this.lay(mob, def, dt, random);

      // **溶岩は敵味方の区別なく焼く**（日光は敵対だけ）。豚が溶岩の上を
      // 平気で歩いていると、プレイヤーだけが焼ける理由が無くなる。
      // **火に強いモブ（ブレイズ）だけは別** —— 溶岩の海の上を飛ぶので、
      // かすっただけで焼け死ぬと自分の次元で生きていられない。
      if (!def.fireproof && isHotLiquid(mob.liquid)) {
        mob.burnTimer = Math.max(mob.burnTimer, LAVA_LINGER);
      }
      // 焼け死んだらここで list から消えているので、続きに触らない
      if (this.burn(mob, def, dt, ctx)) continue;
      // **回復は焼けたあと。** 先に回すと、燃えているぶんを打ち消してから減らす形になり、
      // 「燃えているのに体力が動かない」1 フレームができる。
      this.regenerate(mob, def, dt, ctx);
      // **跳ぶのは焼けたあと。** 燃えているエンダーマンが日陰へ逃げられるのはここ。
      this.teleport(mob, def, world, dt, ctx, random);
      if (!def.hostile) continue;
      this.strike(mob, def, dt, ctx);
      this.fire(mob, def, world, dt, ctx);
    }
  }

  /**
   * 攻め方を順ぐりに入れ替える（毎フレーム）。**表を持たないモブは何もしない。**
   *
   * **新しい動き方は 1 つも足していない。** ここが替えるのは印だけで、
   * 実際の動きは `chasing()` / `aimOrbit()` / `fire()` が既に持っているものを
   * 出したり引っ込めたりしているだけ（だから `step()` は番を知らない）。
   */
  private advancePhase(mob: Mob, def: MobDef, dt: number): void {
    const phases = def.phases;
    if (!phases || phases.length === 0) return;

    mob.phaseTimer -= dt;
    if (mob.phaseTimer > 0) return;

    mob.phase = (mob.phase + 1) % phases.length;
    mob.phaseTimer = phases[mob.phase].seconds;
    // **撃つ番に入った瞬間の初弾を待たせること**（湧いた直後と同じ理屈）。
    // 待たせないと、前の番のあいだに溜まった間隔で 1 発目がいきなり飛ぶ。
    if (phases[mob.phase].shoot && def.ranged) mob.shootTimer = def.ranged.cooldown;
  }

  /**
   * ひとりでに産み落とす（毎フレーム）。**表を持たないモブは何もしない。**
   *
   * **`update()` に条件を書き足さないこと** —— 「いつ産むか」はこの 1 本だけが持つ。
   * 出口は倒したとき・刈ったときと同じ `onDrop` なので、**`mobs.ts` は
   * `drops.ts` を知らないまま**（散らばりは `drops.ts` の `burst()` の仕事）。
   *
   * **音は鳴らさない**（出来事 × 種類で膨らむ。羽ばたきも鳴き声も足していない）。
   */
  private lay(mob: Mob, def: MobDef, dt: number, random: () => number): void {
    const rule = def.laying;
    if (!rule) return;

    mob.layTimer -= dt;
    if (mob.layTimer > 0) return;

    // **次の間隔を先に入れ直すこと。** `onDrop` の中で何が起きても、
    // 時計が 0 以下に留まって毎フレーム産み続ける形にはならない。
    mob.layTimer = pick(random, [rule.min, rule.max]);
    this.onDrop?.(rule.item, rule.count, mob.position.x, mob.position.y, mob.position.z);
  }

  /** いまの攻め方。**表を持たないモブは null**（＝どの判断も今までどおり）。 */
  private phaseOf(mob: Mob, def: MobDef): MobPhase | null {
    const phases = def.phases;
    if (!phases || phases.length === 0) return null;
    return phases[mob.phase] ?? phases[0];
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
    // 回るモブは、詰めていないあいだの向きと高さをここで上書きする。
    // **`aimAltitude` のあとに置くこと**（輪の高さのほうが優先）。
    if (def.orbit) this.aimOrbit(mob, def, ctx);

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
    if (this.chasing(mob, def, ctx)) {
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
    // 床が届かない所（溶岩の海・虚空の上）では、その場の高さを保つ。
    if (!this.chasing(mob, def, ctx)) {
      mob.flyTarget = floor === -Infinity ? mob.position.y : floor + def.hover;
      return;
    }
    // 追いかけているあいだは相手の少し上。**床が見つかったときだけ抑えること** ——
    // 「その場の高さ」を下限に混ぜると、**`FLY_SCAN`(8) より高い所から降りられない**
    // （輪を 12 マス上で回るドラゴンが、詰めに来ても高いまま素通りしていた）。
    const chaseY = ctx.playerY + FLY_ABOVE;
    mob.flyTarget = floor === -Infinity ? chaseY : Math.max(floor + def.hover, chaseY);
  }

  /**
   * その相手を追いかけているか。**間合いは表しだい** ——
   * 回るモブは自分の `diveAt`、それ以外は `HOSTILE_SIGHT`。
   *
   * **1 本にまとめてあるのが肝心。** 追う・高さを合わせる・輪へ戻るの 3 か所が
   * 別々の式を持つと、「追ってはいるが高さは輪のまま」のような噛み合わない状態ができる。
   * クリエイティブは狙われない（`Vitals` 側では弾けないので、判断の側で切る）。
   */
  private chasing(mob: Mob, def: MobDef, ctx: MobContext): boolean {
    if (ctx.invulnerable) return false;
    // **詰めない番のあいだは、目の前に立たれても輪を離れない**（`MobPhase.chase`）。
    // ここ 1 本で「追う・高さ・輪へ戻る」の 3 か所が同時に切り替わる。
    if (this.phaseOf(mob, def)?.chase === false) return false;
    return distanceTo(mob, ctx) <= (def.orbit ? def.orbit.diveAt : HOSTILE_SIGHT);
  }

  /**
   * 回るモブの向きと高さ（5Hz）。**詰めているあいだは何もしない**（`chasing()`）。
   *
   * 狙うのは「いまの角度から `turn` だけ先の、輪の上の点」。**輪の上の 1 点を
   * 決め打ちにしないこと** —— そこへ着いたら止まってしまう。角度で先を狙えば、
   * 位置から毎回計算し直すだけで回り続ける（回った角度を覚えずに済む）。
   *
   * 高さは**中心の地面から**（`homeY`）。自分の足元から測ると、輪が島のふちに
   * 掛かったときだけ高さが跳ね上がる（下が虚空だと `groundBelow` が見つけられない）。
   */
  private aimOrbit(mob: Mob, def: MobDef, ctx: MobContext): void {
    const rule = def.orbit;
    if (!rule || this.chasing(mob, def, ctx)) return;

    const angle = Math.atan2(mob.position.z - mob.homeZ, mob.position.x - mob.homeX) + rule.turn;
    const tx = mob.homeX + Math.cos(angle) * rule.radius;
    const tz = mob.homeZ + Math.sin(angle) * rule.radius;
    // yaw 0 = -Z の規約（`forwardOf` の裏返し。`toward()` と同じ形）。
    mob.targetYaw = Math.atan2(mob.position.x - tx, mob.position.z - tz);
    mob.walking = true;
    // 徘徊の抽選に戻らないよう、状態の残りは持たせない（敵対の追跡と同じ扱い）。
    mob.stateTimer = 0;
    // 高さだけは番で上書きする（`above` が 0 なら輪の高さのまま）。**撃ち下ろす番は
    // プレイヤー基準** —— 中心の地面から測ったままだと、柱の上に登られたときに
    // 頭を取れず、ブレスが柱の腹に当たって終わる。
    const above = this.phaseOf(mob, def)?.above ?? 0;
    mob.flyTarget = above > 0 ? ctx.playerY + above : mob.homeY + rule.height;
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
    // 刈られたぶんが戻るまで。**`hurtTimer` と同じ毎フレームの減らし方**にしておくと、
    // 判断（5Hz）を通らないモブ（遠くて動かない個体）でもきちんと戻る。
    if (mob.woolTimer > 0) mob.woolTimer = Math.max(0, mob.woolTimer - dt);

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
   * 回復（毎フレーム）。**回復のもとの数は呼ぶ側が数える**（`MobContext.healers`）。
   *
   * **上限を超えて溜めないこと** —— 超えて溜まると、もとを全部落としたあとも
   * しばらく減らない「見えない体力」ができる。
   */
  private regenerate(mob: Mob, def: MobDef, dt: number, ctx: MobContext): void {
    const healers = ctx.healers ?? 0;
    if (def.regen <= 0 || healers <= 0) return;
    mob.health = Math.min(def.maxHealth, mob.health + def.regen * healers * dt);
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
    // **撃たない番のあいだは間隔も進めないこと。** 進めると、撃つ番に入った
    // 瞬間に溜まったぶんが 1 発出る（`advancePhase()` の待たせが効かない）。
    if (this.phaseOf(mob, def)?.shoot === false) return;
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
   * 跳ぶ（毎フレーム）。**いつ跳ぶかはここ**で、**どこへ跳べるかは `teleportSpot()`**。
   *
   * 跳ぶ理由は 2 つだけ:
   * 1. **殴られた**（`teleportUrge`）→ 自分の周りへ逃げる。確率つき（`hurtChance`）
   * 2. **追いかけている相手が遠い**（`chaseAt` より遠い）→ 相手の周りへ詰める
   *
   * **行き先が見つからなければ跳ばない**（`teleportSpot()` が null）。壁の中・液体の中・
   * ボクセルの無い列へ出さないための保険はそこ 1 か所にまとめてある。
   */
  private teleport(
    mob: Mob,
    def: MobDef,
    world: World,
    dt: number,
    ctx: MobContext,
    random: () => number,
  ): void {
    const rule = def.teleport;
    if (!rule) return;
    if (mob.teleportTimer > 0) {
      mob.teleportTimer = Math.max(0, mob.teleportTimer - dt);
      // **溜めないこと。** 待っているあいだの「跳びたい」を持ち越すと、
      // 殴るのをやめたあとに 1 回だけ跳ぶ、という理由の分からない動きになる。
      mob.teleportUrge = false;
      return;
    }

    const urge = mob.teleportUrge;
    mob.teleportUrge = false;
    const distance = distanceTo(mob, ctx);
    // クリエイティブは狙われない（`strike()` / `fire()` と同じ線）。
    const chasing = !ctx.invulnerable && distance <= HOSTILE_SIGHT && distance > rule.chaseAt;
    if (!urge && !chasing) return;
    // **殴られたぶんは確率つき。** 必ず跳ぶと、体力 40 を削り切れなくなる。
    if (urge && random() >= rule.hurtChance) return;

    // 逃げるなら自分の周り、詰めるなら相手の周り。**半径も別**（`range` と `closeIn`）。
    const spot = urge
      ? teleportSpot(world, def.size, mob.position.x, mob.position.y, mob.position.z, rule.range, rule, random)
      : teleportSpot(world, def.size, ctx.playerX, ctx.playerY, ctx.playerZ, rule.closeIn, rule, random);
    if (!spot) return;

    mob.position.set(spot.x, spot.y, spot.z);
    // **勢いも消すこと。** 落ちている途中に跳ぶと、着いた先でその落下速度のまま
    // 地面へ叩きつけられる（`moveBody` は速度を見て押し戻す）。
    mob.velocity.set(0, 0, 0);
    mob.onGround = true;
    mob.teleportTimer = rule.cooldown;
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
    // **`dropsFor()` を通すこと**（`attack()` と同じ 1 本）。ここだけ `def.drop` を
    // 直に読むと、刈った羊を**弓で撃ったときだけ**羊毛が出ます。確率の比較も
    // 山の数（鶏は 2 山）もあちらの中だけにあります。
    const random = ctx.random ?? Math.random;
    for (const stack of dropsFor(mob, def, random)) {
      this.onDrop?.(stack.item, stack.count, mob.position.x, mob.position.y, mob.position.z);
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
    // **跳ぶモブは「跳びたい」の印だけ立てる**（行き先を探すには `world` が要る）。
    // ここ 1 か所にしておけば、殴られた・撃たれた・焼けたの 3 通りとも同じ経路に乗る。
    mob.teleportUrge = true;
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
      // **ボスは消さないこと。** 消えると、輪の反対側へ回った拍子に戦いが終わる
      // （しかも `ensureBoss()` は召喚済みなので二度と戻らない）。
      if (MOBS[mob.kind].boss) continue;
      if (distanceTo(mob, ctx) > DESPAWN_DISTANCE) this.list.splice(i, 1);
    }
    while (this.list.length > MAX_MOBS) {
      let far = -1;
      let best = -1;
      for (let i = 0; i < this.list.length; i++) {
        if (MOBS[this.list[i].kind].boss) continue;
        const d = distanceTo(this.list[i], ctx);
        if (d > best) {
          best = d;
          far = i;
        }
      }
      // ボスしか居なければ間引くものが無い（上限を割れないまま抜ける）。
      if (far < 0) break;
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
      kind = pickWeighted(PASSIVE_KINDS, random);
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
    // **刈られた羊は羊毛を落とさない**（`hitByProjectile()` と同じ 1 本を通す）。
    // 山は 0〜2 個（鶏は生鶏肉 + 羽根の 2 山）。
    for (const stack of dropsFor(mob, def, random)) {
      // **倒れた場所を渡すこと。** 受け取る側（`main.ts`）はそこに落とすので、
      // 座標が無いと「遠くで倒したものが足元に湧く」形に戻る。
      this.onDrop?.(stack.item, stack.count, mob.position.x, mob.position.y, mob.position.z);
    }
    return true;
  }

  /**
   * いま刈れるか。**刈れないモブと、刈られたばかりのモブは false。**
   *
   * **何を持っているかは見ません**（それは `use.ts` の `decideUse()` が
   * `isShears()` に聞く）。ここが答えるのは「相手の側の都合」だけです。
   */
  canShear(mob: Mob): boolean {
    return MOBS[mob.kind].shearing !== null && mob.woolTimer <= 0;
  }

  /**
   * いま搾れるか（ミルク）。**`canShear()` と違って時計を見ません** ——
   * 本家の牛は何度でも搾れるので、`woolTimer` に当たる待ち時間を持ちません。
   *
   * **何を持っているかは見ません**（それは `use.ts` の `decideUse()` が空のバケツか
   * どうかで決める）。ここが答えるのは「相手の側の都合」だけです。
   */
  canMilk(mob: Mob): boolean {
    return MOBS[mob.kind].milkable;
  }

  /**
   * 羊を刈る。**刈れたら true**（呼ぶ側はそのときだけシアーズを減らす）。
   * 刈れなければ何もせず false —— 空振りで道具が減ってはいけません。
   *
   * 出る数は `ShearRule` の `min`..`max`（両端を含む）。**倒したときと同じ
   * `onDrop` に流します**ので、`mobs.ts` は `drops.ts` を知らないままです。
   */
  shear(mob: Mob, ctx: MobContext, random = ctx.random ?? Math.random): boolean {
    const rule = MOBS[mob.kind].shearing;
    if (rule === null || mob.woolTimer > 0) return false;
    const span = Math.max(0, rule.max - rule.min);
    const count = rule.min + Math.min(span, Math.floor(random() * (span + 1)));
    mob.woolTimer = rule.regrow;
    this.onDrop?.(rule.item, count, mob.position.x, mob.position.y, mob.position.z);
    // **新しい音を足さない**（出来事 × 種類で膨らむ）。声色は種類ごとの `voice`。
    this.onSound?.("dig", MOBS[mob.kind].voice);
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

/**
 * **倒したときに落ちるもの。** 刈られているあいだは、刈って取れるものと同じものを落とさない
 * （＝刈ってから倒す二重取りを塞ぐ）。落ちないなら null。
 *
 * **倒したときのドロップはこの 1 本に通すこと。** いま `def.drop` を直に読む経路は
 * `attack()`（殴って倒す）と `hitByProjectile()`（撃って倒す）の**2 つ**あり、
 * 片方だけ直すと**弓で撃ったときだけ刈った羊から羊毛が出ます**
 * （`rollDrop()` を `breaking.ts` の 1 か所に集めたのとまったく同じ話）。
 *
 * **`MobDef.drop` の表は書き換えません** —— 倒したときに何が出るかと、
 * 刈ったあとで出ないことは別の話です。
 */
export function dropFor(mob: Mob, def: MobDef): MobDrop | null {
  if (mob.woolTimer > 0 && def.shearing?.item === def.drop.item) return null;
  return def.drop;
}

/**
 * **倒したときに落ちる山を全部返す**（0〜2 山）。**確率の比較はここだけ。**
 *
 * `items.ts` の `rollDrops()` とまったく同じ形で、**1 山目は `dropFor()` に
 * 作らせます** —— 刈った羊の抑えを 2 か所に写さないためです
 * （`dropFor()` は残してあります。既存テストの根拠なので消さないこと）。
 *
 * **2 山目は 1 山目の当たり外れと無関係に、別に引きます**（外れても落ちる）。
 * **`chance >= 1` の山では乱数を引きません** —— 引く形に変えると、種を固定した
 * 既存テストの目がずれて、関係ない所が赤くなります。
 *
 * **呼ぶ側に `chance` の比較を残さないこと。** `attack()`（殴って倒す）と
 * `hitByProjectile()`（撃って倒す）の 2 か所に散ると、
 * **弓で撃ったときだけ羽根が出ない**形がそのまま戻ります。
 */
export function dropsFor(
  mob: Mob,
  def: MobDef,
  random: () => number,
): readonly { readonly item: number; readonly count: number }[] {
  const stacks: { item: number; count: number }[] = [];
  const drop = dropFor(mob, def);
  if (drop) {
    for (const stack of [drop, drop.extra]) {
      if (!stack || stack.item === NO_ITEM || stack.count <= 0) continue;
      if (stack.chance >= 1 || random() < stack.chance) {
        stacks.push({ item: stack.item, count: stack.count });
      }
    }
  }
  return stacks;
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
 * テレポートの行き先を 1 つ選ぶ。**見つからなければ null**（＝跳ばない）。
 *
 * **壁の中・液体の中・ボクセルの無い列へ出さない保険はここ 1 か所。** `Mobs.teleport()`
 * には条件を書かないこと —— 逃げる側と詰める側の 2 通りがあるので、写すと必ず片方だけ直す。
 *
 * 座標を知っているだけで three も DOM も出てこないので、丸ごとヘッドレスで確かめられる。
 * `world` に聞くのは `getVoxel` / `hasColumn` の 2 つだけ（`boxBlocked` 経由も含む）。
 *
 * @param radius 探す水平の半径。**逃げる（`range`）と詰める（`closeIn`）で違う**ので引数。
 */
export function teleportSpot(
  world: World,
  size: BodySize,
  x: number,
  y: number,
  z: number,
  radius: number,
  rule: TeleportRule,
  random: () => number,
): { x: number; y: number; z: number } | null {
  for (let i = 0; i < rule.tries; i++) {
    const tx = Math.floor(x + (random() * 2 - 1) * radius);
    const tz = Math.floor(z + (random() * 2 - 1) * radius);
    // **ボクセルの無い列へ跳ばないこと。** `getVoxel` が AIR を返すので、
    // 跳んだ先で足場が見つかったつもりになり、そのまま世界を突き抜けて落ちる。
    if (!world.hasColumn(columnOf(tx), columnOf(tz))) continue;
    // 上下は `vertical` の幅だけ。**広げると穴の底や天井裏へ出る。**
    const ty = findGround(world, tx, Math.floor(y) + rule.vertical, tz, rule.vertical * 2);
    if (ty < 0) continue;
    // **液体の中へ出さないこと**（水なら溺れ、溶岩なら焼ける。湧きと同じ線）。
    if (isLiquid(world.getVoxel(tx, ty, tz))) continue;
    const px = tx + 0.5;
    const pz = tz + 0.5;
    // 形のあるブロック（ハーフ・階段）や低い天井の中に出ないよう、当たり判定の箱で見る。
    if (boxBlocked(world, px, ty, pz, size)) continue;
    return { x: px, y: ty, z: pz };
  }
  return null;
}

/**
 * `from` から下へ探して、上が空いている最初の固い地面の高さを返す。無ければ -1。
 * **列を丸ごと（128 段）走査しないこと。** 湧きは 1 フレームに何度も試すので、
 * ここが重いと湧きだけでフレームを食う。
 */
function findGround(world: World, x: number, from: number, z: number, depth = SPAWN_SCAN_DEPTH): number {
  const top = Math.min(WORLD_HEIGHT - 1, from);
  for (let y = top; y > top - depth && y > 1; y--) {
    if (!isSolid(world.getVoxel(x, y - 1, z))) continue;
    if (isSolid(world.getVoxel(x, y, z))) continue;
    return y;
  }
  return -1;
}

