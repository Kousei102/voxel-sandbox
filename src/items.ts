import {
  AIR,
  BLOCKS,
  COAL_ORE,
  COBBLE,
  DIAMOND_ORE,
  DIRT,
  END_CRYSTAL,
  GLASS,
  GRASS,
  GRAVEL,
  LEAVES,
  LOW_BAND_MAX,
  NETHER_PORTAL,
  SNOW,
  SPRUCE_LEAVES,
  STONE,
  TALL_GRASS,
  TIER_DIAMOND,
  TIER_WOOD,
  LAVA,
  WATER,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
  baseBlock,
  isLiquid,
  type ToolKind,
} from "./blocks";
// **型だけ取ること。** 値で入れると `projectiles.ts` → `blocks.ts` → … と輪になります。
import type { ProjectileKind } from "./projectiles";

/**
 * アイテム ID の空間。**ブロック ID と同じ番号列**（`blocks.ts` の「ブロック ID の枠」）。
 *
 * - **1..63**: ブロック ID とそのまま同じ番号（置けるアイテム）。**凍結**
 * - **64..94**: 棒・鉱物・道具・食べ物。ブロック側の 64..110（向き違い）と数字が
 *   重なっているが、向き違いはアイテムを持たないので衝突しない。**凍結**
 * - **111 以降（`SHARED_ID_START`）**: ブロックと 1 本の番号列。**新しいアイテムはここから。**
 *   95..110 は空けたままにすること —— **ブロック側の向き違いが使っている番号**なので、
 *   ここにアイテムを置くと「アイテム 96 とベッドの向き違い 96」が同じ番号を指す
 */
export const NO_ITEM = 0;
/** 1..63 の次（= 64）。**歴史的な区切り**なので、`MAX_BLOCK_ID` からは作らないこと。 */
export const FIRST_NON_BLOCK = LOW_BAND_MAX + 1;

export const STICK = 64;
export const COAL = 65;
export const IRON_INGOT = 66;
export const GOLD_INGOT = 67;
export const DIAMOND = 68;

export const WOOD_PICKAXE = 69;
export const WOOD_AXE = 70;
export const WOOD_SHOVEL = 71;
export const STONE_PICKAXE = 72;
export const STONE_AXE = 73;
export const STONE_SHOVEL = 74;
export const IRON_PICKAXE = 75;
export const IRON_AXE = 76;
export const IRON_SHOVEL = 77;
export const DIAMOND_PICKAXE = 78;
export const DIAMOND_AXE = 79;
export const DIAMOND_SHOVEL = 80;

/** 生豚肉。豚が落とす。焼くと焼き豚になる。 */
export const RAW_PORK = 81;

/** 腐った肉。ゾンビが落とす。**食べると毒**（下の `FOODS`）。 */
export const ROTTEN_FLESH = 82;

/** 焼き豚。かまどで生豚肉を焼くと出る。いちばん強い食べ物。 */
export const COOKED_PORK = 83;

/**
 * バケツ。**空・水・溶岩の 3 つで 1 組**（中身をアイテム ID で表すのは Minecraft と同じ）。
 * **黒曜石の入手導線**でもある —— 水と溶岩が触れる場所は生成では作られないので、
 * バケツが無いと黒曜石は 1 個も手に入らない（＝ネザーへ行けない）。
 */
export const BUCKET = 84;
export const WATER_BUCKET = 85;
export const LAVA_BUCKET = 86;

/**
 * 火打石。砂利を掘ると 10% で出る（下の `DROPS`）。
 * **使い道は火打石と打ち金ひとつだけ**で、そこからネザーポータルの点火に繋がる。
 */
export const FLINT = 87;

/**
 * 火打石と打ち金。**ネザーポータルに火を付ける道具。**
 * **点けると 1 回減り、64 回で壊れる**（Minecraft のまま。回数は `durability.ts`）。
 * 積めるのは 1 個まで —— 道具と同じ扱い。
 */
export const FLINT_AND_STEEL = 88;

/**
 * ブレイズロッド。**ネザー要塞のブレイズだけが落とす。**
 * 使い道はブレイズパウダー（→ エンダーアイ）ひとつだけなので、
 * **要塞まで行かないとエンドポータルは開かない。**
 */
export const BLAZE_ROD = 89;

/**
 * エンダーパール。**エンダーマンだけが落とす**（50%）。
 * 使い道はエンダーアイ（= ブレイズパウダー + これ）ひとつだけ。
 *
 * **積めるのは 16 個まで**（Minecraft と同じ）。エンドポータルの起動に 12 個要るので、
 * 1 枠に収まる上限としてもちょうどいい。
 */
export const ENDER_PEARL = 90;

/**
 * ブレイズパウダー。**ブレイズロッド 1 本から 2 個**（Minecraft と同じ）。
 * エンダーアイの材料で、**それ以外の使い道は無い。**
 *
 * **ロッドが 2 個に増えるのが効いています** —— エンドポータルに要るアイの 12 個は
 * ロッド 6 本ぶんで足りるので、要塞に何度も通わずに済みます。
 */
export const BLAZE_POWDER = 91;

/**
 * エンダーアイ。**ブレイズパウダー + エンダーパールの形なし**（Minecraft と同じ）。
 *
 * **クリア導線が 2 本ここで合流します** —— ネザー要塞（ロッド）と夜の地表
 * （パール）の両方を通らないと 1 個も作れません。用途は 2 つで、
 * 投げて要塞の方角を知ること（2-7）と、エンドポータルの枠 12 個を埋めること（2-9）。
 */
export const ENDER_EYE = 92;

/**
 * 弓。**エンドクリスタルを離れた所から壊す手段**（柱の上まで登らずに済む）。
 *
 * 材料は棒 3 + 糸 3（**Minecraft と同じ**）。**糸はクモしか落とさない**ので、
 * 弓を作るにはクモを 3 匹倒すことになる（羊毛の代用だった頃と違い、
 * ベッドと材料を取り合わない）。積めるのは 1 個まで —— 道具と同じ扱い。
 * **放つと 1 回減り、384 回で壊れる**（Minecraft のまま。回数は `durability.ts`）。
 */
export const BOW = 93;

/**
 * 矢。**火打石 + 棒 + 羽根の縦 1 列で 4 本**（Minecraft と同じ）。
 * 火打石は砂利から、羽根は鶏から出る。**3 段なので作業台が要る。**
 */
export const ARROW = 94;

/**
 * 剣 4 本（木・石・鉄・ダイヤ）。**共有帯 111 以降の最初の使用者**で、
 * **95..110 は空けたまま**にしてあります（ブロック側の向き違いが使っている番号）。
 *
 * **殴るための道具**です。掘る速さは素手と同じ 1（`ToolDef.speed`）で、
 * どのブロックの適正でもないので `toolSpeed()` はいつも 1 を返します。
 * 攻撃力は `mobs.ts` の `TOOL_ATTACK`、**何回で尽きるかは階層の表がそのまま**
 * （`durability.ts` の `TOOL_USES`。木 59 / 石 131 / 鉄 250 / ダイヤ 1561）。
 *
 * **既存の道具のループ（`WOOD_PICKAXE + (tier-1)*3 + k`）に混ぜないこと** ——
 * 番号が別の帯なので、剣は自分のループで作ります。
 */
export const WOOD_SWORD = 111;
export const STONE_SWORD = 112;
export const IRON_SWORD = 113;
export const DIAMOND_SWORD = 114;

/**
 * シアーズ。**羊を刈って、倒さずに羊毛を取る道具**（本家と同じ鉄 2 個の斜め）。
 *
 * **`tool:` を持たせないこと。** `ToolKind` に足すと `mobs.ts` の `TOOL_ATTACK` に
 * 無い種類が入って `attackDamage()` が **NaN** を返しますし、`wearForBreaking()` が
 * 「掘る道具」として 1 を返すので**石を掘るたびに減ります。**
 * 火種・弓と同じ**「使って減るもの」**（`durability.ts` の `wearForUse()`）です。
 *
 * 誰が刈れるか・何個出るか・いつ戻るかは **`mobs.ts` の表（`MobDef.shearing`）**で、
 * ここが知っているのは「どれがシアーズか」だけ。
 */
export const SHEARS = 115;

/**
 * クワ 4 本（木・石・鉄・ダイヤ）。**土か草を耕して耕地にする道具**です。
 *
 * 剣と同じ形で、**掘る速さは持たせません**（`speed: 1` = 素手と同じ）——
 * `TIER_SPEEDS` を渡すと「クワが適正の材質」を足した日に黙って速く掘れるようになります。
 * **何回で尽きるかは掘る道具と同じ階層の表**（`durability.ts` の `wearForTill()`。
 * 木 59 / 石 131 / 鉄 250 / ダイヤ 1561）で、**耕したときだけ**減ります。
 */
export const WOOD_HOE = 117;
export const STONE_HOE = 118;
export const IRON_HOE = 119;
export const DIAMOND_HOE = 120;

/**
 * 小麦の種。**草むらを壊すと 12.5% で出て**（下の `DROPS`）、持って耕地を右クリックすると
 * その上に苗（`WHEAT_CROP`）が立ちます。
 *
 * **`block` は `AIR` です。** 植えるのは「置く」（`place`）ではなく `plant` の経路
 * （`use.ts` → `placing.ts` の `tryPlant()`）で、耕地の上かどうかを見る必要があるため。
 * `block` に苗を入れると、石の上にも草むらの代わりにも植えられるようになります。
 *
 * **`tool:` を持たせないこと**（シアーズとまったく同じ罠。`ToolKind` を増やすと
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 * **食べ物でもありません**（`FOODS` に足さないこと）。
 */
export const WHEAT_SEEDS = 122;

/**
 * 小麦。**実った小麦（ブロック 123）を掘ると 1 個**出ます（下の `DROPS`）。
 *
 * **`block` は `AIR`。** 置けるようにすると、耕地も育つ時間も飛ばして
 * 実った畑を並べられます（種を植えて待つ意味が消えます）。
 * **食べ物でもありません**（`FOODS` に足さないこと。本家と同じで、パンにしてから食べます）。
 */
export const WHEAT = 124;

/**
 * パン。**小麦 3 個を横一列**に並べると 1 個できます（`crafting.ts`）。3 幅なので
 * **作業台が要ります**（本家と同じ）。
 *
 * **`block` は `AIR`**（置けるパンは本家にありません）。
 * **`tool:` を持たせないこと**（種・シアーズと同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **食べ物です**（下の `FOODS`）。**かまど無しで作れる中では一番強い**ぶん、
 * 焼き豚（8 / 12.8）には届きません —— 焼く見返りは残してあります。
 */
export const BREAD = 125;

/**
 * 生鶏肉。**鶏（`mobs.ts` の `CHICKEN`）を倒すと 1 個**出ます（`MobDef.drop`）。
 *
 * **`block` は `AIR`**（置ける肉は本家にありません）。
 * **`tool:` を持たせないこと**（種・パンと同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **毒はありません。** 本家は 30% で食中毒ですが、`FoodDef` に確率が無いので
 * 表せません（確率を足すと `vitals.ts` まで及びます。`TUNING.md`）。
 */
export const RAW_CHICKEN = 126;

/**
 * 焼き鳥。**かまどで生鶏肉を焼くと 1 個**（`smelting.ts` の `SMELTING`）。
 *
 * **パン（5 / 6）より上・焼き豚（8 / 12.8）より下**にしてあります ——
 * 焼き豚がいちばん強い立場は保ったまま、豚以外にも肉の出どころができました。
 */
export const COOKED_CHICKEN = 127;

/**
 * 羽根。**鶏を倒すと生鶏肉と一緒に 1 個**出ます（`mobs.ts` の `MobDrop.extra`。
 * 2 山目なので、1 山目の当たり外れとは無関係に落ちます）。
 *
 * **矢の材料です**（火打石 + 棒 + 羽根で 4 本。`crafting.ts`）——
 * 本家の形に戻すためだけに取った番号で、**食べ物でも道具でもありません。**
 *
 * **`block` は `AIR`**（置ける羽根は本家にありません）。
 * **`tool:` を持たせないこと**（種・パン・肉と同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **本家の 0〜2 個ではなく 1 個固定です**（`MobDrop.extra` に個数の範囲を
 * 持たせない、という線引き。`TUNING.md`）。
 */
export const FEATHER = 128;

/**
 * 卵。**鶏が一定の間隔で足元に産みます**（`mobs.ts` の `MobDef.laying`。
 * 倒す必要はありません —— **倒したときのドロップ（`MobDef.drop`）とは別の話**です）。
 *
 * **まだ投げられません**（`projectiles.ts` に 1 行もありません）。
 * **置けず・道具でもなく・食べ物でもありません**（`block: AIR` / `tool: null`。
 * `FOODS` にも `SMELTING` にも行がありません）。
 * **`tool:` を持たせないこと**（種・パン・肉・羽根と同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **積めるのは 16 個まで**（本家と同じ。`MAX_STACK` ではありません）。
 */
export const EGG = 129;

/**
 * 生牛肉。**牛（`mobs.ts` の `COW`）を倒すと 1 個**出ます（`MobDef.drop` の 1 山目）。
 *
 * **`block` は `AIR`**（置ける肉は本家にありません）。
 * **`tool:` を持たせないこと**（種・パン・鶏の肉と同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **毒はありません**（本家も生牛肉に食中毒はありません。生鶏肉との違いはそこです）。
 */
export const RAW_BEEF = 130;

/**
 * ステーキ。**かまどで生牛肉を焼くと 1 個**（`smelting.ts` の `SMELTING`）。
 *
 * **焼き豚（8 / 12.8）と同点です** —— 本家がそうなので下げていません。
 * 「いちばん強い食べ物」が 2 つに増えたぶん、**豚を探すか牛を探すかが選べる**
 * ようになりました（劣化版を足しても拾うかどうかの判断は生まれません）。
 */
export const STEAK = 131;

/**
 * 革。**牛を倒すと生牛肉と一緒に 1 個**出ます（`mobs.ts` の `MobDrop.extra`。
 * 2 山目なので、1 山目の当たり外れとは無関係に落ちます）。
 *
 * **使い道はまだありません** —— 防具も本も無いので、`crafting.ts` にも
 * `SMELTING` にも 1 行もありません（`AUTODEV-SPEC.md` の禁じ手 1）。
 * **置けず・道具でもなく・食べ物でもありません**（羽根とまったく同じ扱い）。
 *
 * **本家の 0〜2 個ではなく 1 個固定です**（`MobDrop.extra` に個数の範囲を
 * 持たせない、という線引き。羽根と同じ。`TUNING.md`）。
 */
export const LEATHER = 132;

/**
 * 糸。**クモ（`mobs.ts` の `SPIDER`）を倒すと 1 個**出ます（`MobDef.drop` の 1 山目。
 * 2 山目は持たないので、羽根や革とは違って**必ず 1 個だけ**です）。
 *
 * **使い道はまだありません** —— 弓を「棒 3 + 糸 3」に戻すのは次の周
 * （`AUTODEV-QUEUE.md` の 10 番）で、いまは `crafting.ts` に 1 行もありません。
 * **置けず・道具でもなく・食べ物でもありません**（革・羽根とまったく同じ扱い）。
 * **`tool:` を持たせないこと**（種・パン・肉・羽根と同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **本家の 0〜2 個ではなく 1 個固定です**（羽根・革と同じ線引き。`TUNING.md`）。
 */
export const STRING = 133;

/**
 * 雪玉。**雪ブロック（`SNOW`）を掘ると 4 個**出ます（`DROPS` の 1 行。本家と同じ個数）。
 * **4 個を 2x2 に並べると雪ブロックへ戻ります**（`crafting.ts`）——
 * 落とし物を差し替えたので、**この戻すレシピが無いと雪が置けなくなります。**
 *
 * **右クリックで投げられます**（`THROWN` の 1 行 → `projectiles.ts` の `"snowball"`）。
 * **当たっても何も起きません** —— 卵とまったく同じで、`main.ts` の `throwItem()` が
 * `damage` を渡さないことがそのまま「当たっても減らない」になります
 * （本家の雪玉もブレイズ以外には効きません。`rules/projectiles.md`）。
 *
 * **置けず・道具でもなく・食べ物でもありません**（`block: AIR` / `tool: null`。
 * `FOODS` にも `SMELTING` にも行がありません）。**`block:` に `SNOW` を入れないこと** ——
 * 置けると戻すレシピが要らなくなり、4 個 → 4 ブロックに増えます。
 * **`tool:` を持たせないこと**（種・パン・肉・羽根と同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **積めるのは 16 個まで**（本家と同じ。卵・バケツと同じで `MAX_STACK` ではありません）。
 */
export const SNOWBALL = 134;

/**
 * ミルクバケツ。**空のバケツ（84）を持って牛を右クリックすると手の中で入れ替わり**、
 * **右クリックで飲むと毒が消えて空のバケツへ戻ります**（本家と同じで、何度でも搾れます）。
 *
 * **`FILLED_BUCKETS` に足さないこと。** 足すと `isBucket()` が真になって
 * **ミルクを地面に流せる**ようになります —— ミルクは液体ブロックではありません
 * （水・溶岩と違って、置ける先が 1 マスもない）。
 *
 * **`FOODS` にも足さないこと。** 足すと `canEat`（満腹なら食べない）の門に掛かって、
 * **満腹のときに毒を消せなくなります。** 本家のミルクも空腹と満腹度を 1 も動かしません。
 *
 * **置けず・道具でもなく・食べ物でもありません**（`block: AIR` / `tool: null`）。
 * **積めるのは 1 個まで**（バケツ 84・水入り 85・溶岩入り 86 と同じ）。
 */
export const MILK_BUCKET = 138;

/**
 * ボウル。**板 3 個の V 字**（バケツと同じ形・材料違い）で **4 個**作れます。
 *
 * **キノコシチューの器**で、**食べ切ると空のボウルが手の中に戻ります**
 * （下の `EMPTIES` / `emptyAfterEating()`）。本家と同じで、器そのものは食べ物でも
 * 道具でもありません（`FOODS` にも `SMELTING` にも行がありません）。
 *
 * **`block:` を持たせないこと**（`AIR` のまま）—— 置けると、空のボウルが地面に増えます。
 */
export const BOWL = 141;

/**
 * キノコシチュー。**ボウル + 赤キノコ + 茶キノコ の形なし**（2x2 で作れます）。
 * 食べると**空腹 +6 / 満腹度 +7.2**（本家の値。焼き鳥と同点）。
 *
 * **積めるのは 1 個だけ**（本家と同じ）。**ここは手触りではなく不変条件です** ——
 * `main.ts` は食べ終わりに `inventory.setSelected(BOWL, 1)` で器を戻すので、
 * **2 個以上積めると、1 個食べただけで残りの山ごとボウル 1 個に潰れます。**
 */
export const MUSHROOM_STEW = 142;

/**
 * 一覧を作るときに数え上げる上限（`allItemIds()`）。**アイテムの番号だけでなく、
 * ブロックが自動で作るアイテム（上の for）の番号も含みます。**
 *
 * **だから 111 以降にブロックを足したときも、ここを伸ばすこと。** 伸ばし忘れると
 * `ITEMS` には入っているのに `allItemIds()` が返さず、**クリエイティブの一覧
 * （`craftscreen.ts` の `CREATIVE_ITEMS`）にだけ出てこないブロック**ができます
 * （置けるし掘れるので、型でも `typecheck` でも止まりません）。
 *
 * **いまはキノコシチュー（アイテム 142）が上限です。** 直前は茶キノコ（ブロック 140）で、
 * **共有帯ではブロックとアイテムが 1 本の番号列**なので、上限を持つのがどちら側かは
 * 決まりません（`items.ts` に 1 行も書いていないブロックが上限だったことも 2 度あります）。
 */
export const MAX_ITEM_ID = MUSHROOM_STEW;

export const MAX_STACK = 64;

export interface ToolDef {
  readonly kind: ToolKind;
  readonly tier: number;
  /** 適正ブロックを掘る速さの倍率。素手は 1。 */
  readonly speed: number;
}

export interface ItemDef {
  readonly id: number;
  readonly name: string;
  /** 右クリックで置けるブロック。置けないアイテムは AIR。 */
  readonly block: number;
  readonly stack: number;
  /** UI 用の色（sRGB hex）。 */
  readonly color: number;
  readonly tool: ToolDef | null;
}

const TIER_NAMES = ["", "木", "石", "鉄", "ダイヤ"];
const TOOL_NAMES: Record<ToolKind, string> = {
  pickaxe: "のツルハシ",
  axe: "の斧",
  shovel: "のシャベル",
  sword: "の剣",
  hoe: "のクワ",
};
/** 階層ごとの採掘速度。Minecraft と同じ 2 / 4 / 6 / 8。 */
const TIER_SPEEDS = [1, 2, 4, 6, 8];
const TIER_COLORS = [0x000000, 0xb18a56, 0x8a8f96, 0xd8d2c8, 0x59c8c8];

const ITEMS: ItemDef[] = [];

function item(def: ItemDef): void {
  ITEMS[def.id] = def;
}

item({ id: NO_ITEM, name: "", block: AIR, stack: 0, color: 0x000000, tool: null });

// ブロックのアイテム。空気と液体（水・溶岩）は手に入らない。
// 置き方だけが違う版（壁掛けの松明など）は大元のアイテムに寄せるので、ここでは作らない。
for (const block of BLOCKS) {
  if (block.id === AIR || isLiquid(block.id)) continue;
  if (block.variantOf !== AIR) continue;
  item({
    id: block.id,
    name: block.name,
    block: block.id,
    stack: MAX_STACK,
    color: block.top,
    tool: null,
  });
}

item({ id: STICK, name: "棒", block: AIR, stack: MAX_STACK, color: 0x9a7549, tool: null });
item({ id: COAL, name: "石炭", block: AIR, stack: MAX_STACK, color: 0x23262b, tool: null });
item({ id: IRON_INGOT, name: "鉄インゴット", block: AIR, stack: MAX_STACK, color: 0xd8d2c8, tool: null });
item({ id: GOLD_INGOT, name: "金インゴット", block: AIR, stack: MAX_STACK, color: 0xf2d15c, tool: null });
item({ id: DIAMOND, name: "ダイヤモンド", block: AIR, stack: MAX_STACK, color: 0x4fe3d8, tool: null });
item({ id: RAW_PORK, name: "生豚肉", block: AIR, stack: MAX_STACK, color: 0xe08f8f, tool: null });
item({ id: ROTTEN_FLESH, name: "腐った肉", block: AIR, stack: MAX_STACK, color: 0x8a6b4f, tool: null });
item({ id: COOKED_PORK, name: "焼き豚", block: AIR, stack: MAX_STACK, color: 0xc4763f, tool: null });

// バケツ。**積めるのは 1 個まで**（Minecraft と同じ）。16 個の水を 1 枠に持てると、
// 水路作りが別のゲームになる。
item({ id: BUCKET, name: "バケツ", block: AIR, stack: 1, color: 0xb0b4bb, tool: null });
item({ id: WATER_BUCKET, name: "水入りバケツ", block: AIR, stack: 1, color: 0x3f7ad0, tool: null });
item({ id: LAVA_BUCKET, name: "溶岩入りバケツ", block: AIR, stack: 1, color: 0xe0601a, tool: null });

item({ id: FLINT, name: "火打石", block: AIR, stack: MAX_STACK, color: 0x3c3733, tool: null });
// 火打石と打ち金は道具と同じで積めない（傷が付くので、山にできない）。
item({ id: FLINT_AND_STEEL, name: "火打石と打ち金", block: AIR, stack: 1, color: 0xa6a094, tool: null });

item({ id: BLAZE_ROD, name: "ブレイズロッド", block: AIR, stack: MAX_STACK, color: 0xf2c033, tool: null });
// エンダーパールは 16 個まで（Minecraft と同じ）。
item({ id: ENDER_PEARL, name: "エンダーパール", block: AIR, stack: 16, color: 0x11726b, tool: null });
item({ id: BLAZE_POWDER, name: "ブレイズパウダー", block: AIR, stack: MAX_STACK, color: 0xe8a33d, tool: null });
// **エンダーアイは 64 個まで**（Minecraft と同じ）。パールが 16 個までなのと違うのは
// 意図的で、**エンドポータルに要る 12 個が 1 枠に収まる**ようにするため。
item({ id: ENDER_EYE, name: "エンダーアイ", block: AIR, stack: MAX_STACK, color: 0x3fbf8c, tool: null });

// 弓は道具と同じで積めない（傷が付くので、山にできない）。矢は普通に積める。
item({ id: BOW, name: "弓", block: AIR, stack: 1, color: 0xa9763c, tool: null });
item({ id: ARROW, name: "矢", block: AIR, stack: MAX_STACK, color: 0xd9d2c4, tool: null });

/** 道具は 4 階層 x 3 種類。ID は tier ごとに pickaxe / axe / shovel の順。 */
const TOOL_KINDS: ToolKind[] = ["pickaxe", "axe", "shovel"];
for (let tier = TIER_WOOD; tier <= TIER_DIAMOND; tier++) {
  TOOL_KINDS.forEach((kind, k) => {
    const id = WOOD_PICKAXE + (tier - TIER_WOOD) * 3 + k;
    item({
      id,
      name: TIER_NAMES[tier] + TOOL_NAMES[kind],
      block: AIR,
      stack: 1,
      color: TIER_COLORS[tier],
      tool: { kind, tier, speed: TIER_SPEEDS[tier] },
    });
  });
}

/**
 * 剣 4 本。**掘る速さは持たせません**（`speed: 1` = 素手と同じ）——
 * どのブロックの適正でもないので `toolSpeed()` は 1 を返しますが、
 * `TIER_SPEEDS` を渡すと「剣が適正の材質」を足した日に黙って速く掘れるようになります。
 *
 * **`tool` を持たせた時点で耐久値が付いてきます**（`maxUses()` は `toolOf()` に聞くだけ）。
 * 新しい表もセーブのキーも 1 つも要りません。
 */
for (let tier = TIER_WOOD; tier <= TIER_DIAMOND; tier++) {
  item({
    id: WOOD_SWORD + (tier - TIER_WOOD),
    name: TIER_NAMES[tier] + TOOL_NAMES.sword,
    block: AIR,
    stack: 1,
    color: TIER_COLORS[tier],
    tool: { kind: "sword", tier, speed: 1 },
  });
}

// シアーズは道具と同じで積めない（傷が付くので、山にできない）。
// **`tool` を持たせないこと**（上の `SHEARS` の説明）。
item({ id: SHEARS, name: "シアーズ", block: AIR, stack: 1, color: 0xa8b8c0, tool: null });

/**
 * クワ 4 本。**剣とまったく同じループ**（上の `WOOD_SWORD` のループを写した形）。
 * `speed: 1` のまま `TIER_SPEEDS` を渡さないのも剣と同じ理由 —— どのブロックの
 * 適正でもない道具に階層別の速さを持たせると、いつか誰かがそれを掘る速さだと誤読する。
 */
for (let tier = TIER_WOOD; tier <= TIER_DIAMOND; tier++) {
  item({
    id: WOOD_HOE + (tier - TIER_WOOD),
    name: TIER_NAMES[tier] + TOOL_NAMES.hoe,
    block: AIR,
    stack: 1,
    color: TIER_COLORS[tier],
    tool: { kind: "hoe", tier, speed: 1 },
  });
}

// 小麦の種。**`block: AIR`**（植えるのは `place` でなく `plant` の経路。上の説明）。
// 積めるのは普通のアイテムと同じ 64 個。
item({ id: WHEAT_SEEDS, name: "小麦の種", block: AIR, stack: MAX_STACK, color: 0x9aa85a, tool: null });

// 小麦。**`block: AIR`**（置けると畑を並べ直せる。上の説明）。小麦 3 個でパンになる。
item({ id: WHEAT, name: "小麦", block: AIR, stack: MAX_STACK, color: 0xd8c26a, tool: null });

// パン。**`block: AIR`**（置けるパンは本家にない）。食べ物なので `FOODS` に 1 行ある。
item({ id: BREAD, name: "パン", block: AIR, stack: MAX_STACK, color: 0xc49a5e, tool: null });

// 生鶏肉と焼き鳥。**どちらも `block: AIR` / `tool: null`**（上の説明）。
// 焼くと何になるかは `smelting.ts` の表 1 行、食べたときの値は下の `FOODS`。
item({ id: RAW_CHICKEN, name: "生鶏肉", block: AIR, stack: MAX_STACK, color: 0xd3a08e, tool: null });
item({ id: COOKED_CHICKEN, name: "焼き鳥", block: AIR, stack: MAX_STACK, color: 0xc98a4b, tool: null });

// 羽根。**`block: AIR` / `tool: null`**（置けず・道具でもなく・**食べ物でもない**）。
// 矢の材料になるだけなので `FOODS` にも `SMELTING` にも 1 行もありません。
item({ id: FEATHER, name: "羽根", block: AIR, stack: MAX_STACK, color: 0xe8e4dc, tool: null });

// 卵。**`block: AIR` / `tool: null`**（置けず・道具でもなく・**食べ物でもない**）。
// **積めるのは 16 個まで**（本家の値。バケツの 1 と同じで `MAX_STACK` を使わない）。
item({ id: EGG, name: "卵", block: AIR, stack: 16, color: 0xf7f0e0, tool: null });

// 生牛肉とステーキ。**どちらも `block: AIR` / `tool: null`**（豚・鶏の肉と同じ）。
// 色は豚（0xe08f8f / 0xc4763f）・鶏（0xd3a08e / 0xc98a4b）と**並べて違って見えること**
// （どれも肉なので、赤みと焼き色の差だけで見分ける。`TUNING.md`）。
item({ id: RAW_BEEF, name: "生牛肉", block: AIR, stack: MAX_STACK, color: 0xc8564f, tool: null });
item({ id: STEAK, name: "ステーキ", block: AIR, stack: MAX_STACK, color: 0x8f5230, tool: null });

// 革。**`block: AIR` / `tool: null`**（置けず・道具でもなく・**食べ物でもない**）。
// **使い道がまだ無い**ので `FOODS` にも `SMELTING` にも `crafting.ts` にも 1 行もありません。
item({ id: LEATHER, name: "革", block: AIR, stack: MAX_STACK, color: 0xa06a41, tool: null });

// 糸。**`block: AIR` / `tool: null`**（置けず・道具でもなく・**食べ物でもない**）。
// **使い道がまだ無い**ので `FOODS` にも `SMELTING` にも `crafting.ts` にも 1 行もありません
// （弓を「棒 3 + 糸 3」に戻すのは次の周）。**色は羽根 0xe8e4dc・卵 0xf7f0e0 から離した
// 冷たい灰**にしてあります —— 3 つとも白っぽいので、一覧で並ぶと見分けが付きません。
item({ id: STRING, name: "糸", block: AIR, stack: MAX_STACK, color: 0xb8bcc8, tool: null });

// 雪玉。**`block: AIR` / `tool: null`**（置けず・道具でもなく・**食べ物でもない**）。
// **積めるのは 16 個まで**（本家の値。卵・バケツと同じで `MAX_STACK` を使わない）。
// **色は青白**（羽根 0xe8e4dc・卵 0xf7f0e0・糸 0xb8bcc8 から離した値）——
// 白っぽいものが 4 つ並ぶので、青みだけで見分ける。**`PROJECTILE_KINDS` の
// `"snowball"` も同じ値**にすること（`test/projectiles.test.ts` が突き合わせる）。
item({ id: SNOWBALL, name: "雪玉", block: AIR, stack: 16, color: 0xbcd8ef, tool: null });

// ミルクバケツ。**`block: AIR` / `tool: null`**（置けず・道具でもなく・**食べ物でもない**）。
// **積めるのは 1 個まで**（バケツ 84・水入り 85・溶岩入り 86 と同じ）。
// **色は冷たい白** —— 白っぽいものが 5 つ（羽根 0xe8e4dc・卵 0xf7f0e0・糸 0xb8bcc8・
// 雪玉 0xbcd8ef）並ぶので、卵の暖かい白から離し、雪玉の青みまでは寄せない。
item({ id: MILK_BUCKET, name: "ミルクバケツ", block: AIR, stack: 1, color: 0xeaf2f8, tool: null });

// ボウルとキノコシチュー。どちらも **`block: AIR` / `tool: null`**（置けず・道具でもない）。
// **色は暗い木と淡い生成り** —— 赤キノコ 0xc9403a・茶キノコ 0xb5835a と並べて見るので、
// **この 4 つはどの 2 つも RGB で 60 以上**離してある（実測 83〜237。`test/blocks.test.ts`）。
item({ id: BOWL, name: "ボウル", block: AIR, stack: MAX_STACK, color: 0x7a4a24, tool: null });
// **`stack: 1` は手触りではなく不変条件。** 食べ終わりに `inventory.setSelected(BOWL, 1)` で
// 器を戻すので、2 個以上積めると残りの山ごとボウル 1 個に潰れる（上の `MUSHROOM_STEW`）。
item({ id: MUSHROOM_STEW, name: "キノコシチュー", block: AIR, stack: 1, color: 0xf0dcb4, tool: null });

const EMPTY: ItemDef = ITEMS[NO_ITEM];

export function itemDef(id: number): ItemDef {
  return ITEMS[id] ?? EMPTY;
}

export function itemName(id: number): string {
  return itemDef(id).name;
}

export function itemColor(id: number): number {
  return itemDef(id).color;
}

export function itemStackLimit(id: number): number {
  return itemDef(id).stack;
}

/** このアイテムを右クリックで置いたときのブロック。置けないなら AIR。 */
export function placedBlock(id: number): number {
  return itemDef(id).block;
}

export function toolOf(id: number): ToolDef | null {
  return itemDef(id).tool;
}

/** UI 用の CSS カラー。 */
export function itemCssColor(id: number): string {
  return "#" + itemColor(id).toString(16).padStart(6, "0");
}

/**
 * 食べ物 1 個ぶんの値。**`vitals.ts` の `FoodValue` と構造で合わせてある**
 * （あちらは持ち物の表を import しない）。
 */
export interface FoodDef {
  /** 戻る空腹。 */
  readonly hunger: number;
  /** 戻る満腹度（減りにくさ）。空腹の値を超えたぶんは `Vitals.eat()` が捨てる。 */
  readonly saturation: number;
  /** 食べると毒。 */
  readonly poison: boolean;
}

/**
 * 食べられるアイテム。**ここに無いものは食べられない。**
 *
 * 数値は Minecraft と同じ。焼き豚が飛び抜けて強いので、
 * 「かまどで焼く」に見返りがある。腐った肉は空腹だけなら悪くないが毒付き
 * （**回復量を下げるのではなく毒にしてある** —— 弱いだけの食べ物は
 * ただの劣化版で、拾うかどうかの判断が生まれない）。
 */
const FOODS = new Map<number, FoodDef>([
  [RAW_PORK, { hunger: 3, saturation: 1.8, poison: false }],
  [COOKED_PORK, { hunger: 8, saturation: 12.8, poison: false }],
  [ROTTEN_FLESH, { hunger: 4, saturation: 0.8, poison: true }],
  // パン。**かまど無しで作れる中では一番強い**が、焼き豚（8 / 12.8）には届かない。
  // 小麦は食べ物ではない（本家と同じで、パンにしてから食べる）。
  [BREAD, { hunger: 5, saturation: 6, poison: false }],
  // 鶏の肉。本家の値のまま（生 2 / 1.2・焼き 6 / 7.2）。**焼き鳥はパン（5 / 6）より上・
  // 焼き豚（8 / 12.8）より下**なので、焼き豚がいちばん強い立場は動いていない。
  // **生鶏肉に毒は付けていません** —— 本家は 30% で食中毒だが、`FoodDef` に確率が無い。
  [RAW_CHICKEN, { hunger: 2, saturation: 1.2, poison: false }],
  [COOKED_CHICKEN, { hunger: 6, saturation: 7.2, poison: false }],
  // 牛の肉。本家の値のまま（生 3 / 1.8・ステーキ 8 / 12.8）。**ステーキは焼き豚と同点**で、
  // **本家がそうなので下げていません** —— 「いちばん強い食べ物」が 2 つになるだけで、
  // 焼く見返り（生 3 / 1.8 → 8 / 12.8）は焼き豚とまったく同じに残ります。
  // **革は食べ物ではないので、ここに行はありません**（羽根と同じ扱い）。
  [RAW_BEEF, { hunger: 3, saturation: 1.8, poison: false }],
  [STEAK, { hunger: 8, saturation: 12.8, poison: false }],
  // キノコシチュー。本家の値のまま（6 / 7.2 で**焼き鳥と同点**。焼き豚・ステーキには届かない）。
  // 材料 3 つ（うちキノコ 2 種はまれ）で焼き鳥と同点なのが見合うかは `TUNING.md`。
  // **キノコそのものは食べ物ではありません**（本家と違って、シチューにしてから食べます）。
  [MUSHROOM_STEW, { hunger: 6, saturation: 7.2, poison: false }],
]);

/**
 * 食べ切ったあとに手の中へ戻るもの（器）。**戻らないなら `NO_ITEM`。**
 *
 * **表 1 本にすること**（`FILLED_BUCKETS` / `THROWN` と同じ作法）——
 * `main.ts` に `if (held === MUSHROOM_STEW)` と書き始めると、器つきの食べ物が
 * 増えるたびに配線の側へ分岐が 1 本ずつ生えます（`test/ui.test.ts` が見張り）。
 *
 * **`vitals.ts` に置かないこと** —— あちらは持ち物の表を import しません。
 */
const EMPTIES = new Map<number, number>([[MUSHROOM_STEW, BOWL]]);

/** そのアイテムを食べ切ったあとに戻る器。戻らないなら `NO_ITEM`。 */
export function emptyAfterEating(id: number): number {
  return EMPTIES.get(id) ?? NO_ITEM;
}

/** そのアイテムを食べたときの値。食べられないなら null。 */
export function foodOf(id: number): FoodDef | null {
  return FOODS.get(id) ?? null;
}

/** 食べられるアイテムの一覧（テストと表示用）。 */
export function allFoodIds(): number[] {
  return [...FOODS.keys()];
}

/** 地面に出す 1 山ぶん（**どこに落ちるかは知らない**。場所は `breaking.ts` が決める）。 */
export interface DropStack {
  readonly item: number;
  readonly count: number;
}

export interface Drop {
  readonly item: number;
  readonly count: number;
  /** 落ちる確率。1 なら必ず。 */
  readonly chance: number;
  /**
   * 確率を外したときに 1 個落ちるもの。省略すると**何も落ちない**（葉がこれ）。
   *
   * 砂利のためにある —— **10% で火打石、外したら砂利**なので、
   * 「外れ = 何も出ない」しか無いと砂利が掘れば消えるブロックになる。
   */
  readonly otherwise?: number;
  /**
   * **1 山目とは別に、必ず落ちるもの**（実った小麦の種がこれ）。省略すると 1 山だけ。
   *
   * **確率も個数の範囲も持たせないこと。** 流れてくる乱数は `roll` の 1 本だけなので、
   * ここに確率を付けると**1 山目の当たり外れと必ず相関します**（砂利の火打石と
   * 種の個数が連動する形）。本家の「小麦 1 + 種 0〜3」に寄せたくなったら、
   * **乱数をもう 1 本流す話が先**です（`BreakOrder` と `autoBreak()` の引数に及びます）。
   */
  readonly extra?: DropStack;
}

/**
 * ブロックを壊したときに出るアイテム。
 *
 * **鉄と金の鉱石は鉱石のまま落ちます**（インゴットにするにはかまどで焼く）。
 * かまどが無かった頃はインゴットを直接落としていましたが、精錬が入ったので戻しました。
 * 石炭とダイヤは Minecraft と同じで、掘った時点でそのまま使えます。
 * ガラスは Minecraft と同じで何も落とさない。
 */
const DROPS = new Map<number, Drop>([
  [GRASS, { item: DIRT, count: 1, chance: 1 }],
  [STONE, { item: COBBLE, count: 1, chance: 1 }],
  [COAL_ORE, { item: COAL, count: 1, chance: 1 }],
  [DIAMOND_ORE, { item: DIAMOND, count: 1, chance: 1 }],
  [GLASS, { item: NO_ITEM, count: 0, chance: 0 }],
  // 雪は**雪玉 4 個**になって落ちる（Minecraft と同じ個数）。**この 1 行で雪ブロックが
  // そのままでは手に入らなくなる**ので、`crafting.ts` の「雪玉 4 個 → 雪ブロック 1 個」が
  // 必ず対で要る（無いと雪が二度と置けない）。
  [SNOW, { item: SNOWBALL, count: 4, chance: 1 }],
  // 苗木がまだ無いので、葉からはたまに棒だけ出る
  [LEAVES, { item: STICK, count: 1, chance: 0.1 }],
  [SPRUCE_LEAVES, { item: STICK, count: 1, chance: 0.1 }],
  // 砂利は 10% で火打石、外したら砂利そのもの（Minecraft と同じ）。
  // **`otherwise` が無いと 90% で消えるブロックになる。**
  [GRAVEL, { item: FLINT, count: 1, chance: 0.1, otherwise: GRAVEL }],
  // 草むらは 12.5% で小麦の種、**外したら草むらそのもの**（砂利と同じ形）。
  // `otherwise` を落とすと、87.5% で消える草むらになる。逆に「種だけ」にすると
  // 草むらが置けるアイテムでなくなる（どちらもテストで押さえてある）。
  [TALL_GRASS, { item: WHEAT_SEEDS, count: 1, chance: 0.125, otherwise: TALL_GRASS }],
  // 苗は**種が 1 個戻るだけ**（育っていないので小麦は出ない）。**この 1 行が要る** ——
  // `variantOf` が自分自身なので、既定の `baseBlock()` はアイテムの無い 121 を落とす。
  [WHEAT_CROP, { item: WHEAT_SEEDS, count: 1, chance: 1 }],
  // 実った小麦は**小麦が 1 個 + 種が 1 個の 2 山**。**この 1 行が要る** —— `variantOf` は
  // 苗なので、既定の `baseBlock()` に任せると実らせても種しか採れない。
  // **種が戻るので畑が自転します**（種はここから 1 個固定。本家の「0〜3」より渋い）。
  [WHEAT_CROP_RIPE, { item: WHEAT, count: 1, chance: 1, extra: { item: WHEAT_SEEDS, count: 1 } }],
  // ポータルの面は壊せる（硬さ 0）が、何も落ちない。**持ち帰れると枠が要らなくなる。**
  [NETHER_PORTAL, { item: NO_ITEM, count: 0, chance: 0 }],
  // エンドクリスタルは砕けて消える（Minecraft では爆発する）。**拾えると、
  // 柱の上へ運び直してドラゴンの回復を復活させられる。**
  [END_CRYSTAL, { item: NO_ITEM, count: 0, chance: 0 }],
]);

/**
 * そのブロックが落とすもの。既定は自分自身（置き方だけが違う版なら大元）。
 * 壁掛けの松明を壊しても、床置きと同じ松明が 1 個出る。
 */
export function dropOf(blockId: number): Drop {
  const special = DROPS.get(blockId);
  if (special) return special;
  return { item: baseBlock(blockId), count: 1, chance: 1 };
}

/**
 * **実際に何が落ちるか**を、乱数 1 個から決める。落ちないなら `NO_ITEM` / 0 個。
 *
 * **確率の比較を `main.ts` に書かないこと。** 「外したら別のものが落ちる」（砂利）を
 * 足した時点で、呼ぶ側が 2 通りに分岐することになる。
 *
 * **乱数を作るのは呼ぶ側**（`roll` は 0..1）なので、ここはヘッドレスで丸ごと確かめられる。
 */
export function rollDrop(blockId: number, roll: number): { item: number; count: number } {
  const drop = dropOf(blockId);
  if (roll < drop.chance) return { item: drop.item, count: drop.count };
  const missed = drop.otherwise ?? NO_ITEM;
  return { item: missed, count: missed === NO_ITEM ? 0 : 1 };
}

/**
 * **地面に出す山を全部**（0〜2 山）。実った小麦だけが 2 山（小麦 + 種）で、
 * 他は今までどおり 0 山か 1 山。
 *
 * **1 山目は `rollDrop()` に作らせること** —— `chance` と `otherwise` の判断をここへ
 * 写すと、**掘ったときと床を抜かれたときで落ちるものが違う**が戻ってきます
 * （`rules/items-survival.md`）。`rollDrop()` は既存のテストの根拠なので消しません。
 *
 * **`extra` は 1 山目の当たり外れに関係なく必ず入れます。** 別の山なので、
 * 「1 山目を外したら 2 山目も落ちない」ではありません（`chance` と `extra` の
 * 両方を持つブロックはいま 1 つも無いので、この決めはここのコメントが唯一の根拠）。
 */
export function rollDrops(blockId: number, roll: number): readonly DropStack[] {
  const stacks: DropStack[] = [];
  const first = rollDrop(blockId, roll);
  // 何も出ない目（ガラス・葉の外れ）は山にしない。
  if (first.item !== NO_ITEM && first.count > 0) stacks.push(first);
  const { extra } = dropOf(blockId);
  if (extra && extra.item !== NO_ITEM && extra.count > 0) stacks.push(extra);
  return stacks;
}

// --- バケツ -------------------------------------------------------------

/**
 * 中身の入ったバケツと、その液体の対応。**バケツを増やすときはここ 1 行。**
 * 分岐（`item === WATER_BUCKET ? ... : ...`）で書くと、液体を足すたびに
 * 汲む側と流す側の 2 か所を直すことになり、必ず片方を忘れる
 * （液体の判定を 3 か所に写して溶岩で全部忘れた、あれと同じ形）。
 */
const FILLED_BUCKETS: readonly (readonly [item: number, liquid: number])[] = [
  [WATER_BUCKET, WATER],
  [LAVA_BUCKET, LAVA],
];

/** その液体を汲んだバケツ。汲めない液体なら `NO_ITEM`。 */
export function bucketOf(liquid: number): number {
  return FILLED_BUCKETS.find(([, held]) => held === liquid)?.[0] ?? NO_ITEM;
}

/** そのバケツの中身の液体。空バケツやバケツでないものは `AIR`。 */
export function liquidOf(item: number): number {
  return FILLED_BUCKETS.find(([held]) => held === item)?.[1] ?? AIR;
}

/** バケツを持っているか（空でも中身入りでも）。狙う光線の当たり方が変わる。 */
export function isBucket(item: number): boolean {
  return item === BUCKET || liquidOf(item) !== AIR;
}

/** バケツを使ったら何が起きるか。何も起きないなら null。 */
export type BucketUse =
  /** 汲む: 狙ったマスを空にして、手は `item`（中身入りバケツ）になる。 */
  | { readonly kind: "fill"; readonly item: number; readonly liquid: number }
  /** 流す: 置くマスを `liquid` にして、手は `item`（空バケツ）になる。 */
  | { readonly kind: "empty"; readonly item: number; readonly liquid: number }
  | null;

/**
 * バケツの使い道を決める。**`main.ts` に分岐を書かないこと** ——
 * 汲む／流すはどちらも「液体 1 マスと手の中身を入れ替える」1 つの規則で、
 * 散らすと液体を足したときに片側だけ直すことになる。
 *
 * **どのマスに効くかは呼ぶ側が決める**（汲むなら狙ったマス、流すなら置くマス）。
 * ここは座標を知らないので、丸ごとヘッドレスで確かめられる。
 */
export function bucketUse(held: number, targetId: number): BucketUse {
  if (held === BUCKET) {
    const filled = bucketOf(targetId);
    return filled === NO_ITEM ? null : { kind: "fill", item: filled, liquid: targetId };
  }
  const liquid = liquidOf(held);
  return liquid === AIR ? null : { kind: "empty", item: BUCKET, liquid };
}

/**
 * 火種か（ポータルに火を点けられるか）。**表 1 本に聞くこと** ——
 * `item === FLINT_AND_STEEL` と書き始めると、火種が増えたときに
 * 点ける側と持てる側で片方だけ直すことになります（バケツと同じ罠）。
 *
 * **枠が成立しているかは見ません**（それは `portals.ts` の仕事）。
 */
const FIRE_STARTERS: readonly number[] = [FLINT_AND_STEEL];

export function isFireStarter(item: number): boolean {
  return FIRE_STARTERS.includes(item);
}

/**
 * 引いて放つもの（弓）。**表 1 本に聞くこと** —— 火種・バケツとまったく同じ理由で、
 * `item === BOW` と書き始めると、種類が増えたときに持てる側と引く側で
 * 片方だけ直すことになる。
 *
 * **引きの長さもダメージも `bow.ts`**（ここは「どれが弓か」しか知らない）。
 */
const BOWS: readonly number[] = [BOW];

export function isBow(item: number): boolean {
  return BOWS.includes(item);
}

/**
 * 刈るもの（シアーズ）。**火種・弓とまったく同じ表 1 本**で、
 * `item === SHEARS` と書き始めると、種類が増えたときに持てる側と刈る側で
 * 片方だけ直すことになる。
 *
 * **誰を刈れるか・何個出るかは見ません**（それは `mobs.ts` の `MobDef.shearing`）。
 */
const SHEARS_ITEMS: readonly number[] = [SHEARS];

export function isShears(item: number): boolean {
  return SHEARS_ITEMS.includes(item);
}

/**
 * 植えるもの（種）か。**火種・弓・シアーズとまったく同じ表 1 本**で、
 * `item === WHEAT_SEEDS` と書き始めると、種が増えたときに持てる側と植える側で
 * 片方だけ直すことになる。
 *
 * **どこに植わるかは見ません**（それは `placing.ts` の `tryPlant()`）。
 * **どの苗が立つかもここでは決めません** —— いまは種が 1 種類なので
 * `tryPlant()` が `WHEAT_CROP` を書きます（種が 2 種類目になったら、
 * この表を `[種, 苗]` の対にすること）。
 */
const SEEDS: readonly number[] = [WHEAT_SEEDS];

export function isSeed(item: number): boolean {
  return SEEDS.includes(item);
}

/**
 * 投げるものと、飛んでいく飛び道具の対応。**投げるものを増やすときはここ 1 行。**
 * `FILLED_BUCKETS` / `FIRE_STARTERS` / `BOWS` とまったく同じ表 1 本の作法で、
 * `held === EGG` と書き始めると、投げるものが増えるたびに `use.ts` の
 * `decideUse()` に分岐が 1 本ずつ生えます。
 *
 * **どう飛ぶか（速さ・重力・寿命・当たったらどうなるか）は見ません** ——
 * それは `projectiles.ts` の `PROJECTILE_KINDS` の 1 行です。ここが持つのは
 * 「どのアイテムが何になるか」だけなので、**運ぶのは型だけ**で済みます。
 */
const THROWN: ReadonlyMap<number, ProjectileKind> = new Map([
  [EGG, "egg"],
  [SNOWBALL, "snowball"],
]);

/** 投げると何が飛ぶか。投げられないものは null。 */
export function thrownProjectile(item: number): ProjectileKind | null {
  return THROWN.get(item) ?? null;
}

/**
 * 殴るための道具（剣）か。**火種・弓と違って表を持たず、道具の種類に聞きます** ——
 * 剣は 4 本とも `ToolDef` を持っているので、階層が増えても 1 行も直りません。
 *
 * **`durability.ts` に `item === WOOD_SWORD` と書き始めないこと**（火種・弓とまったく
 * 同じ罠で、剣が増えたときに「持てる側」と「減る側」の片方を必ず忘れます）。
 */
export function isSword(item: number): boolean {
  return toolOf(item)?.kind === "sword";
}

/**
 * 耕す道具（クワ）か。**`isSword()` と同じ形**（表を持たず、道具の種類に聞く）——
 * クワは 4 本とも `ToolDef` を持っているので、階層が増えても 1 行も直りません。
 */
export function isHoe(item: number): boolean {
  return toolOf(item)?.kind === "hoe";
}

/** 全アイテム ID（テストと UI の列挙用）。 */
export function allItemIds(): number[] {
  const ids: number[] = [];
  for (let id = 1; id <= MAX_ITEM_ID; id++) if (ITEMS[id]) ids.push(id);
  return ids;
}
