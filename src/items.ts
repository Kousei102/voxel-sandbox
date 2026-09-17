import {
  AIR,
  BLOCKS,
  BOOKSHELF,
  CAKE,
  CLAY,
  COAL_ORE,
  COBWEB,
  COBBLE,
  DIAMOND_ORE,
  DIRT,
  END_CRYSTAL,
  GLASS,
  GRASS,
  GRAVEL,
  ICE,
  LEAVES,
  LOW_BAND_MAX,
  NETHER_PORTAL,
  SAPLING,
  SNOW,
  SPRUCE_LEAVES,
  SPRUCE_SAPLING,
  STONE,
  TALL_GRASS,
  TIER_DIAMOND,
  TIER_WOOD,
  VINE_ZN,
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
 * 砂糖。**サトウキビ 1 個から 1 個**（本家と同じ 1 対 1・形なし。`crafting.ts`）。
 *
 * **置けず・道具でもなく・食べ物でもありません**（`block:` は `AIR`、`FOODS` にも
 * `SMELTING` にも行がありません）。本家でもそのままでは食べられず、使い道は
 * 別のレシピの材料だけです —— **ケーキも金のリンゴも醸造も別件**なので、
 * この周の使い道は「集められる」までです。
 */
export const SUGAR = 144;

/**
 * リンゴ。**オークの葉を壊すと 0.5% で 1 個**落ちます（下の `DROPS`。針葉樹の葉からは
 * 落ちません —— 本家がオークとダークオークだけなので）。食べると**空腹 +4 / 満腹度 +2.4**
 * （本家の値。パン 5 / 6 には届かない）。
 *
 * **置けず・道具でもありません**（`block:` は `AIR`）。**レシピもまだありません** ——
 * 金のリンゴは別件です。
 *
 * **葉の棒（10%）とは別々に当たります。** 1 山目の抽選（`roll`）と 2 山目の抽選
 * （`extraRoll`）が別の乱数なので、「棒が出た葉からだけリンゴが出る」形になりません
 * （相関していたら `test/blocks.test.ts` の「4 通りの山の数」が落ちます）。
 */
export const APPLE = 149;

/**
 * 紙。**サトウキビ 3 個の横一列で 3 枚**（本家と同じ形・同じ枚数。3 幅なので作業台が要る）。
 *
 * **置けず・道具でもなく・食べ物でもありません**（`block:` は `AIR`、`FOODS` にも
 * `EMPTIES` にも `THROWN` にも行がありません）。使い道は本のレシピだけです ——
 * **地図も花火も本家では紙ですが、どちらも別件**です。
 */
export const PAPER = 150;

/**
 * 本。**紙 3 + 革 1 の形なし**（本家と同じ。2x2 に収まるので作業台が要らない）。
 *
 * 使い道は本棚のレシピと、**本棚を壊したときに 3 個戻ってくる**ところだけです。
 * **エンチャントの話は持ち込みません**（経験値もエンチャント台も見送り済み）。
 */
export const BOOK = 151;

/**
 * 金のリンゴ。**金インゴット 8 + リンゴ 1 の 3x3**（本家と同じ形。作業台が要る）。
 *
 * **置けず・道具でもありません**（`block:` は `AIR`）。**食べ物としては特別な 2 つ**を
 * 持っていて、そこが `FOODS` の他の 10 行と違います（下の `FoodDef`）:
 *
 * - **`heal: 4`** —— 食べるとその場で体力が 4 戻る（本家の「再生 II が 5 秒」を
 *   即時ぶんに均してあります。**持続する効果の器がこのプロジェクトに無い**ため。`TUNING.md`）
 * - **`alwaysEdible: true`** —— **満腹でも食べられる**（本家と同じ。体力を戻すのが
 *   目的なので、腹が満ちていると食べられないのでは使い道が消えます）
 *
 * **エンチャントの金のリンゴ（本家のもう 1 種）は持ち込んでいません。**
 */
export const GOLDEN_APPLE = 153;

/**
 * 革の防具 4 部位（頭・胴・脚・足）。**いちばん弱い材質**で、鉄は下の
 * `IRON_HELMET`（171..174）・金は `GOLD_HELMET`（175..178）・ダイヤは
 * `DIAMOND_HELMET`（179..182）にあります。
 *
 * **点数は本家のまま 1 / 3 / 2 / 1（合計 7）**で、**どの部位が何点かは下の `ARMORS`
 * の表 1 本**です（`FOODS` と同じ作法。`inventory.ts` にも `vitals.ts` にも
 * アイテムの名前を書かないこと）。**どれだけダメージが減るかは `vitals.ts`**
 * （`armorReduced()`。ここは点数だけ）。
 *
 * **傷（耐久）は持ちません** —— 本家の革の防具は傷みますが、減らす経路が
 * `vitals.ts` → `inventory.ts` の配線になるので別の周です（`TUNING.md`）。
 * だから `durability.ts` にも `TOOL_USES` にも 1 行もありません。
 * **それでも `stack: 1`** —— 本家と同じで、着る物は積めません。
 */
export const LEATHER_HELMET = 158;
export const LEATHER_CHESTPLATE = 159;
export const LEATHER_LEGGINGS = 160;
export const LEATHER_BOOTS = 161;

/**
 * 骨。**スケルトン（`mobs.ts` の `SKELETON`）を倒すと必ず 1 個**出ます
 * （`MobDef.drop` の 1 山目。**2 山目は矢 1 本が半分の確率**で、そちらは
 * `MobDrop.extra` です —— 弓の矢がここで初めて「稼げる」ようになります）。
 *
 * **使い道はまだありません** —— **骨粉は別の周**（`AUTODEV-QUEUE.md`）なので、
 * `crafting.ts` にも `SMELTING` にも 1 行もありません。
 * **置けず・道具でもなく・食べ物でもありません**（革・糸・羽根とまったく同じ扱い）。
 * **`tool:` を持たせないこと**（種・パン・肉・羽根と同じ罠。`ToolKind` が増えると
 * `mobs.ts` の `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。
 *
 * **色 `0xcdc8b0` は測って選んだ値です。** 淡い暖色は一覧でいちばん混んでいる帯
 * （矢・鉄インゴット・砂・羽根・羊毛）で、素直な `0xd8cfae` は砂と **20.9** しか
 * 離れません（判定は 20）。この値でいちばん近いのは**砂で 24.6** です。
 */
export const BONE = 162;

/**
 * 木炭。**原木・トウヒの原木をかまどで焼くと出る燃料**（`smelting.ts` の `SMELTING`）で、
 * **石炭（65）とは別の番号**です（本家と同じ。同じ枠には積めません）。
 * **燃える長さは石炭と同じ 80 秒 = 8 個ぶん**なので、`FUEL` の最大値は 80 のまま
 * （`test/smelting.test.ts` の「石炭がいちばん長持ちする」は緑のまま）。
 * **松明も作れます** —— `crafting.ts` に**材料違いの 1 本**を足してあります
 * （`Recipe` に列は足しません。板が 2 行あるのと同じ形）。
 *
 * **置けず・道具でもなく・食べ物でもありません**（骨・革・糸・羽根と同じ扱い）。
 * **`tool:` を持たせないこと**（`ToolKind` が増えると `mobs.ts` の `TOOL_ATTACK` に
 * 無い種類が入って **NaN** が黙って通ります。`rules/items-survival.md`）。
 *
 * **色 `0x56473f` は測って選んだ値です。** 炭の暗い暖色はこの一覧でいちばん混んでいる帯で
 * （火打石 `0x3c3733`・ソウルサンド `0x51392c`・ネザーレンガ・岩盤・石炭がここに居ます）、
 * 素直な `0x403a36` は**火打石と 5.8 しか離れません**（判定は 20）。この値でいちばん近いのは
 * **石炭鉱石とソウルサンドで 24.1** です。**石炭（`0x23262b`）からは 64.0** 離れていて、
 * 一覧で石炭と取り違えません。
 */
export const CHARCOAL = 163;

/**
 * 粘土玉（32a）。**粘土ブロック（168）を掘ると 4 個**落ちます（`DROPS`）。
 * **雪玉 4 個 → 雪ブロックとまったく同じ対**で、`crafting.ts` の 2x2 で粘土に戻せます
 * （その 1 本が無いと、掘った粘土は二度と置けません）。
 *
 * **置けず・道具でもなく・食べ物でもありません**（骨・木炭・革・糸・羽根と同じ扱い）。
 * **`tool:` を持たせないこと**（`ToolKind` が増えると `mobs.ts` の `TOOL_ATTACK` に
 * 無い種類が入って **NaN** が黙って通ります。`rules/items-survival.md`）。
 *
 * **積めるのは 64 個**（雪玉は 16 個ですが、あちらは投げられるからです。粘土玉は
 * 投げられないので、普通のアイテムと同じ上限）。
 *
 * **色 `0xa7b4da` は測って選んだ値です。** 灰青の帯は一覧でとても混んでいて
 * （**糸 `0xb8bcc8`・バケツ `0xb0b4bb`・シアーズ `0xa8b8c0`**・石 `0x8a8f96`・氷 `0x8fc4f2`）、
 * 仕様書の見当だった `0xb0b8cc` は**糸と 9.8 しか離れません**（判定は 20）。
 * この値でいちばん近いのは**糸で 26.0** です。**粘土ブロック（`0x9da3b5`）からは 41.9**
 * 離れていて、一覧で並んでも 2 つあることが分かります（`TUNING.md`）。
 */
export const CLAY_BALL = 169;

/**
 * レンガ（32b）。**粘土玉（169）をかまどで焼くと 1 個**（`smelting.ts` の `SMELTING`）で、
 * **4 個の 2x2 で `blocks.ts` の `BRICK`(12) に組めます**（`crafting.ts`）。
 * これで**置けるのに作れなかったレンガブロックが、サバイバルで初めて手に入ります。**
 *
 * **定数名を `BRICK` にしないこと** —— `blocks.ts` の `BRICK`(12) と衝突して、
 * `crafting.ts` が両方 import した瞬間に `npm run typecheck` が落ちます
 * （**型が止めてくれる罠**）。**名前のほうは「ブロック = レンガブロック /
 * アイテム = レンガ」**（本家の日本語と同じ。`blocks.ts` の `def()` を直してあります）。
 *
 * **置けず・道具でもなく・食べ物でもありません**（骨・木炭・粘土玉と同じ扱い）。
 * **`FUEL` にも 1 行も足さないこと** —— レンガは燃料ではありません（革・粘土と同じ）。
 *
 * **色 `0xbc5d39` は測って選んだ値です。** 赤茶の帯は一覧でとても混んでいて
 * （**革 `0xa06a41`・ステーキ `0x8f5230`・作業台 `0x9a6f3e`・棒 `0x9a7549`・
 * 腐った肉 `0x8a6b4f`・革のズボン `0xb16e51`**）、素直な `0x9c5a3c` は
 * **`BRICK`(12) の `0xa4553f` と 9.9 しか離れません**（判定は 20）。
 * この値でいちばん近いのは**生牛肉 `0xc8564f` で 26.0**、**`BRICK`(12) とも 26.0** です
 * （`TUNING.md`。**一覧で並ぶのはこの 2 つ**なので、そこは別の 1 件で見ています）。
 */
export const BRICK_ITEM = 170;

/**
 * 鉄の防具 4 部位（頭・胴・脚・足）。**革に続く 2 つ目の材質**で、金・ダイヤの
 * 8 部位は下の `GOLD_HELMET`（175..178）と `DIAMOND_HELMET`（179..182）にあります。
 *
 * **点数は本家のまま 2 / 6 / 5 / 2（合計 15）**で、`armorReduced()` に通すと
 * 15 / 25 = 60% 減ります（`vitals.ts`）。**どの部位が何点かは下の `ARMORS`
 * の表 1 本**で、**材質が 2 つになっても `inventory.ts` の `armorPoints` は
 * 1 行も変わりません** —— あちらは `armorOf()` に聞くだけで材質を知らないからです。
 *
 * **傷（耐久）は革と同じく持ちません**（`durability.ts` にも `TOOL_USES` にも
 * 1 行もありません）。**それでも `stack: 1`**。
 *
 * **名前は革と同じ並べ方**（帽子 / 上着 / ズボン / 靴）。本家の「ヘルメット」は
 * 6 文字で、**一覧の `.label` が折れて枠の絵に被ります**（`HANDOFF.md` の持ち越し）。
 *
 * **`IRON_INGOT`(6) や `IRON_BLOCK` と衝突する定数名を作らないこと**
 * （`crafting.ts` が両方 import した瞬間に `npm run typecheck` が落ちます）。
 */
export const IRON_HELMET = 171;
export const IRON_CHESTPLATE = 172;
export const IRON_LEGGINGS = 173;
export const IRON_BOOTS = 174;

/**
 * 金の防具 4 部位（33b）。**革・鉄に続く 3 つ目の材質**で、**点数は本家のまま
 * 2 / 5 / 3 / 1（合計 11）** —— `armorReduced()` に通すと 11 / 25 = **44% 減**です。
 *
 * **⚠ 金は鉄（15 点）より弱いのに、要る枚数は同じ 24 枚です。** **本家がそういう
 * 設計**なので、安くも強くもしないこと（`TUNING.md`）。
 *
 * **`GOLD_INGOT`(67) や `GOLD_BLOCK` と衝突する定数名を作らないこと**
 * （`crafting.ts` が両方 import した瞬間に `npm run typecheck` が落ちます。
 * 型で止まる安全な罠）。**傷（耐久）は革・鉄と同じく持ちません**が、`stack: 1`。
 */
export const GOLD_HELMET = 175;
export const GOLD_CHESTPLATE = 176;
export const GOLD_LEGGINGS = 177;
export const GOLD_BOOTS = 178;

/**
 * ダイヤの防具 4 部位（33b）。**いちばん強い材質**で、**点数は本家のまま
 * 3 / 8 / 6 / 3（合計 20）**です。
 *
 * **⚠ 一式 20 点は `vitals.ts` の `ARMOR_CAP`(20) にちょうど当たります**
 * （= 8 割減）。**それでも `ARMOR_CAP` も `ARMOR_DENOM`(25) も触らないこと** ——
 * 「早く頭打ちになった」のではなく、**上限に届く一式が初めて入った**だけです
 * （本家の残り 2 割はエンチャントが削るぶんで、ここには経験値もエンチャント台も
 * ありません。`rules/vitals.md`）。
 *
 * **⚠ ダイヤは `SMELTING` にありません** —— **ダイヤ鉱石を掘ると `DROPS` で
 * ダイヤ 1 個**です（鉄・金と道が違います。`smeltResultOf(DIAMOND_ORE)` は null）。
 *
 * **`DIAMOND`(68) や `DIAMOND_BLOCK` / `DIAMOND_PICKAXE` と衝突する定数名を
 * 作らないこと。傷（耐久）は持ちません**が、`stack: 1`。
 */
export const DIAMOND_HELMET = 179;
export const DIAMOND_CHESTPLATE = 180;
export const DIAMOND_LEGGINGS = 181;
export const DIAMOND_BOOTS = 182;

/**
 * 一覧を作るときに数え上げる上限（`allItemIds()`）。**アイテムの番号だけでなく、
 * ブロックが自動で作るアイテム（上の for）の番号も含みます。**
 *
 * **だから 111 以降にブロックを足したときも、ここを伸ばすこと。** 伸ばし忘れると
 * `ITEMS` には入っているのに `allItemIds()` が返さず、**クリエイティブの一覧
 * （`craftscreen.ts` の `CREATIVE_ITEMS`）にだけ出てこないブロック**ができます
 * （置けるし掘れるので、型でも `typecheck` でも止まりません）。
 *
 * **いまはツタの向き違いの最後（ブロック 186）が上限です。** ツタは 183..186 の
 * 4 向きで、**アイテムになるのは大元の 183 だけ**（184..186 は `variantOf: VINE`
 * なのでアイテムを持ちません）—— **それでも上限は使った番号の最後まで伸ばすこと。**
 * この帯は**ブロックとアイテムで 1 本の番号列**なので、上限を 183 で止めると
 * 「使った番号」と食い違い、**次に取る空き番号を数え違えます**（はしご 145..148 が
 * 同じ形でした）。直前がダイヤの靴（アイテム 182）・金・ダイヤの防具 8 部位
 * （175..182）・鉄の防具 4 部位（171..174）・レンガ（アイテム 170）。
 * **共有帯ではブロックとアイテムが 1 本の番号列**なので、上限を持つのがどちら側かは
 * 決まりません（`items.ts` に 1 行も書いていないブロックが上限だったのは 8 度目まで）。
 * **上限をこちら側へ移したら、それまで指していたブロックの import を消すこと** ——
 * 残すと「使われていない」で `npm run typecheck` が落ちます（型で止まる安全な罠）。
 */
export const MAX_ITEM_ID = VINE_ZN;

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

// 砂糖。**`block: AIR` / `tool: null`**（置けず・道具でもない。`FOODS` にも行が無い）。
// **色は真っ白** —— 白っぽいものが混んでいるので、いちばん近い雪（0xfffafa）からの
// 隔たりが 22.3 しかない。**`0xfdfdfd` まで暗くすると 19.0 で判定に落ちる**ので、
// 変えるなら `test/blocks.test.ts` の隔たりを測ってから。
item({ id: SUGAR, name: "砂糖", block: AIR, stack: MAX_STACK, color: 0xffffff, tool: null });

// リンゴ。**`block: AIR` / `tool: null`**（置けず・道具でもない）。**食べ物なので
// `FOODS` に 1 行あります**（砂糖との違いはそこだけ）。
// **色は明るい赤** —— 赤いものが既に 2 つ（赤キノコ 0xc9403a・生牛肉 0xc8564f）あるので、
// いちばん近い相手からの隔たりを `test/blocks.test.ts` が測っている（実測は赤キノコから 29.5）。
item({ id: APPLE, name: "リンゴ", block: AIR, stack: MAX_STACK, color: 0xe0342c, tool: null });

// 紙と本。**どちらも `block: AIR` / `tool: null`**（置けず・道具でもなく・食べ物でもない。
// `FOODS` にも `EMPTIES` にも `THROWN` にも行が無い）。**本棚は `item({...})` を書かない** ——
// ブロック側の for が同じ番号のアイテムを作るので、手で足すと二重登録になる。
// **色は白と茶がもう混み合っている**ので、一覧の 111 色から測って選んである
// （紙はいちばん近い雪玉から 25.5・本はレンガから 38.2。`test/blocks.test.ts` が測る）。
// 素直な「紙の白」も「木の茶」も 20 を割るので、**紙は青みを、本は赤みを寄せてある。**
item({ id: PAPER, name: "紙", block: AIR, stack: MAX_STACK, color: 0xd4e0ec, tool: null });
item({ id: BOOK, name: "本", block: AIR, stack: MAX_STACK, color: 0x9c5064, tool: null });

// 金のリンゴ。**`block: AIR` / `tool: null`**（置けず・道具でもない）。**食べ物なので
// `FOODS` に 1 行あります**（そこだけが他と違って `heal` と `alwaysEdible` を持ちます）。
// **色は金寄りの橙** —— 金インゴット 0xf2d15c そのものだと隔たり 0 で使えず、
// 金色は思ったより混んでいる（ブレイズパウダー 0xe8a33d・ブレイズロッド）ので、
// いちばん近い相手からの隔たりを `test/blocks.test.ts` が測っている（実測 56.4）。
item({ id: GOLDEN_APPLE, name: "金のリンゴ", block: AIR, stack: MAX_STACK, color: 0xf0a800, tool: null });

// 革の防具 4 部位。**どれも `block: AIR` / `tool: null`**（置けず・掘る道具でもない。
// **`ToolKind` に "armor" を足さないこと** —— `TOOL_ATTACK` に無い種類が入ると
// `attackDamage()` が NaN を返し、`wearForBreaking()` は掘る道具として 1 を返す。
// `rules/items-survival.md` の「シアーズに `tool:` を持たせないこと」と同じ罠）。
// **`stack: 1`** は本家と同じ（着る物は積めない）。
//
// **色は革（0xa06a41）の色味のまま明るさで 4 段**に割ってある。木の茶色は一覧で
// いちばん混んでいる帯で、素直な明るさの階段は真ん中が全部 20 を割る（革・パン・
// 茶キノコ・はしご・本棚・焼き鳥がその帯に居る）ので、**通る 4 段を探して選んだ値**。
// **上ほど明るい**（帽子 → 靴で暗くなる）。いちばん近い相手からの隔たりは
// 靴 22.9（ソウルサンド）/ ズボン 23.2（茶キノコ）/ 上着 27.7（焼き鳥）/
// 帽子 47.3（本棚）で、**4 つは互いに 45.4 以上**離れている（`test/items.test.ts`）。
item({ id: LEATHER_HELMET, name: "革の帽子", block: AIR, stack: 1, color: 0xfca168, tool: null });
item({ id: LEATHER_CHESTPLATE, name: "革の上着", block: AIR, stack: 1, color: 0xd88662, tool: null });
item({ id: LEATHER_LEGGINGS, name: "革のズボン", block: AIR, stack: 1, color: 0xb16e51, tool: null });
item({ id: LEATHER_BOOTS, name: "革の靴", block: AIR, stack: 1, color: 0x644122, tool: null });

// 骨。**`block: AIR` / `tool: null`**（置けず・道具でもなく・`FOODS` にも `SMELTING` にも
// 行が無い。革・糸・羽根とまったく同じ扱い）。**色は測って選んだ値**（上の `BONE` の説明。
// 素直な 0xd8cfae は砂と 20.9 しか離れず、判定 20 のすぐ上だった）。
item({ id: BONE, name: "骨", block: AIR, stack: MAX_STACK, color: 0xcdc8b0, tool: null });

// 木炭。**`block: AIR` / `tool: null`**（置けず・道具でもなく・`FOODS` にも行が無い）。
// **燃料としてだけ効きます**（`smelting.ts` の `FUEL`。石炭と同じ 80 秒）。
// **色は測って選んだ値**（上の `CHARCOAL` の説明。素直な 0x403a36 は火打石と 5.8 しか
// 離れず、判定 20 に落ちた）。**石炭の色（0x23262b）を写さないこと** —— 一覧で
// 石炭と木炭が見分けられなくなります。
item({ id: CHARCOAL, name: "木炭", block: AIR, stack: MAX_STACK, color: 0x56473f, tool: null });

// 粘土玉。**`block: AIR` / `tool: null`**（置けず・道具でもなく・`FOODS` にも
// `SMELTING` にも行が無い。骨・木炭と同じ扱い）。**置けるようにしないこと** ——
// 粘土に戻すのは `crafting.ts` の 2x2 の 1 本（雪玉と同じ対）。
// **色は測って選んだ値**（上の `CLAY_BALL` の説明。粘土ブロックより明るい側へ振ってある）。
item({ id: CLAY_BALL, name: "粘土玉", block: AIR, stack: MAX_STACK, color: 0xa7b4da, tool: null });

// レンガ。**`block: AIR` / `tool: null`**（置けず・道具でもなく・`FOODS` にも行が無い。
// 骨・木炭・粘土玉と同じ扱い）。**置けるようにしないこと** —— 置けるのは
// `blocks.ts` の `BRICK`(12) のほうで、戻すのは `crafting.ts` の 2x2 の 1 本。
// **`FUEL` にも足さないこと**（レンガは燃料ではありません）。
// **色は測って選んだ値**（上の `BRICK_ITEM` の説明。`BRICK`(12) の 0xa4553f から
// 離す向きへ振ってある —— 一覧では「レンガ」と「レンガブロック」が並んで出ます）。
item({ id: BRICK_ITEM, name: "レンガ", block: AIR, stack: MAX_STACK, color: 0xbc5d39, tool: null });

// 鉄の防具 4 部位。**革の 4 部位とまったく同じ扱い**（`block: AIR` / `tool: null` /
// `stack: 1`）。**`ToolKind` に "armor" を足さないこと** —— `TOOL_ATTACK` に無い
// 種類が入ると `attackDamage()` が NaN を返し、`wearForBreaking()` は掘る道具として
// 1 を返す（`rules/items-survival.md`）。
//
// **色は測って選んだ「鋼の青」です。** 素直な銀灰は**どう選んでも通りません** ——
// 一覧の**無彩色（彩度 30 以下）は既存 46 個**で埋まっていて、明るさのどの帯でも
// いちばん遠い無彩色が **20.3 / 20.1 / 22.1 / 21.4**（判定は 20）でした。
// **青を 18〜48 足した 4 段**にすると、いちばん近い相手で
// **帽子 26.0（紙）/ 上着 27.5（粘土玉）/ ズボン 43.5（粘土）/ 靴 47.8（丸石）**、
// **互いは最小 39.5・革 4 部位とは最小 118.8**（この周で測り直した値。`TUNING.md`）。
// **上ほど明るい**（革と同じ並び。明るさ 212 > 165 > 141 > 100）。
item({ id: IRON_HELMET, name: "鉄の帽子", block: AIR, stack: 1, color: 0xcfcfff, tool: null });
item({ id: IRON_CHESTPLATE, name: "鉄の上着", block: AIR, stack: 1, color: 0x92a7ce, tool: null });
item({ id: IRON_LEGGINGS, name: "鉄のズボン", block: AIR, stack: 1, color: 0x788ebe, tool: null });
item({ id: IRON_BOOTS, name: "鉄の靴", block: AIR, stack: 1, color: 0x506595, tool: null });

// 金の防具 4 部位（33b）。**革・鉄の 8 部位とまったく同じ扱い**（`block: AIR` /
// `tool: null` / `stack: 1`。**`ToolKind` に "armor" を足さないこと**）。
//
// **色は測って選んだ黄金の 4 段です。** 黄色い帯には**金インゴット `0xf6d64a`・
// 金のリンゴ `0xf2d24b`・金鉱石・ブレイズロッド**が居るので、素直な階段は真ん中が
// 20 を割ります。この 4 段でいちばん近いのは**金インゴット 26.3 / ブレイズロッド 38.7 /
// 金のリンゴ 26.7 / 金鉱石 32.7**（`TUNING.md`）。**上ほど明るい**（革・鉄と同じ並び）。
item({ id: GOLD_HELMET, name: "金の帽子", block: AIR, stack: 1, color: 0xfee34d, tool: null });
item({ id: GOLD_CHESTPLATE, name: "金の上着", block: AIR, stack: 1, color: 0xefd714, tool: null });
item({ id: GOLD_LEGGINGS, name: "金のズボン", block: AIR, stack: 1, color: 0xf8b317, tool: null });
item({ id: GOLD_BOOTS, name: "金の靴", block: AIR, stack: 1, color: 0xc2aa35, tool: null });

// ダイヤの防具 4 部位（33b）。**上の 12 部位とまったく同じ扱い**（`block: AIR` /
// `tool: null` / `stack: 1`）。
//
// **色は測って選んだ水色の 4 段です。** 水色の帯には**ミルクバケツ・ガラス・氷
// `0x8fc4f2`・ダイヤ `0x4aedd9`** が居ます。この 4 段でいちばん近いのは
// **ミルクバケツ 28.4 / ガラス 34.9 / ガラス 27.4 / 氷 39.6**（`TUNING.md`）。
// **上ほど明るい**（革・鉄・金と同じ並び）。
item({ id: DIAMOND_HELMET, name: "ダイヤの帽子", block: AIR, stack: 1, color: 0xd1fefe, tool: null });
item({ id: DIAMOND_CHESTPLATE, name: "ダイヤの上着", block: AIR, stack: 1, color: 0xa4f8f5, tool: null });
item({ id: DIAMOND_LEGGINGS, name: "ダイヤのズボン", block: AIR, stack: 1, color: 0x92e6e3, tool: null });
item({ id: DIAMOND_BOOTS, name: "ダイヤの靴", block: AIR, stack: 1, color: 0x80d4d1, tool: null });

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
  /**
   * 食べたときにその場で戻る体力（省略すると 0）。**上限は書かないこと** ——
   * 頭打ちにするのは `Vitals.heal()` の側です。いまは金のリンゴの 1 行だけ。
   */
  readonly heal?: number;
  /**
   * 満腹でも食べられるか（省略すると「満腹なら食べない」の今までどおり）。
   * **体力を戻すためのものだけに付けること** —— 全部に付けると空腹の門が消えます。
   */
  readonly alwaysEdible?: boolean;
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
  // リンゴ。本家の値のまま（4 / 2.4）。**パン（5 / 6）より下**で、
  // 「畑を作るより弱いが、木を切っていればたまに手に入る」立場。
  // **かまどでは焼けません**（`SMELTING` に行がない。本家の焼きリンゴも別件）。
  [APPLE, { hunger: 4, saturation: 2.4, poison: false }],
  // 金のリンゴ。**空腹と満腹度は本家の値（4 / 9.6）**で、**この表で `heal` と
  // `alwaysEdible` を持つ唯一の行**です。回復はその場で 4 だけ（本家の「再生 II が
  // 5 秒」は、持続する効果の器が無いので即時ぶんに均してあります。`TUNING.md`）。
  // **満腹度 9.6 は焼き豚 12.8 に届かない**ので、腹を満たす目的では今までどおり
  // 焼き豚がいちばん強いままです（強さの並びは動いていません）。
  [GOLDEN_APPLE, { hunger: 4, saturation: 9.6, poison: false, heal: 4, alwaysEdible: true }],
]);

/**
 * 防具を着る部位。**並びは `inventory.ts` の防具枠と同じ**
 * （0 = 頭 / 1 = 胴 / 2 = 脚 / 3 = 足）。並べ替えると、頭の防具が脚の枠で効きます。
 */
export type ArmorSlot = "head" | "chest" | "legs" | "feet";

/**
 * 防具 1 個ぶんの値。**`FoodDef` と同じ形**（表 1 本に持ち、判断は他所へ書かない）。
 */
export interface ArmorDef {
  /** どの部位に着るか。 */
  readonly slot: ArmorSlot;
  /** 防具点。**どれだけダメージが減るかは `vitals.ts`**（ここは点数だけ）。 */
  readonly defense: number;
}

/**
 * 着られるもの。**ここに無いものは着られない**（`FOODS` とまったく同じ作法）。
 *
 * **いまは革・鉄・金・ダイヤの 4 材質・16 種**（33b で金とダイヤが入りました）。
 * **点数は本家のまま**で、革 1 / 3 / 2 / 1 = 合計 7（`armorReduced()` で 28% 減）・
 * **鉄 2 / 6 / 5 / 2 = 合計 15**（**60% 減**）・**金 2 / 5 / 3 / 1 = 合計 11**
 * （**44% 減**）・**ダイヤ 3 / 8 / 6 / 3 = 合計 20**（**80% 減**）です（`vitals.ts`）。
 * **足すのはここに 1 行ずつ**で、`inventory.ts` にも `vitals.ts` にも
 * アイテムの名前を書かないこと。**材質が増えても `armorPoints` は 1 行も
 * 変わりません** —— あちらは `armorOf()` に聞くだけで材質を知らないからです
 * （革 → 鉄 → 金・ダイヤと 3 度そのとおりでした）。
 *
 * **⚠ ダイヤ一式の 20 点は `vitals.ts` の `ARMOR_CAP`(20) にちょうど当たります。**
 * **それでも `ARMOR_CAP` も `ARMOR_DENOM` も触らないこと**（本家がそういう設計で、
 * 「早く頭打ちになった」のではなく**上限に届く一式が初めて入った**だけ。
 * 上の `DIAMOND_HELMET` の説明）。**⚠ 金（11 点）は鉄（15 点）より弱いのに
 * 要る枚数は同じ 24 枚**ですが、これも本家のままです（`TUNING.md`）。
 *
 * **材料の革（132）・鉄インゴット（6）・金インゴット（67）・ダイヤ（68）は
 * ここに入れないこと** —— 入れると「材料を頭の枠に置くと固くなる」。
 */
const ARMORS = new Map<number, ArmorDef>([
  [LEATHER_HELMET, { slot: "head", defense: 1 }],
  [LEATHER_CHESTPLATE, { slot: "chest", defense: 3 }],
  [LEATHER_LEGGINGS, { slot: "legs", defense: 2 }],
  [LEATHER_BOOTS, { slot: "feet", defense: 1 }],
  [IRON_HELMET, { slot: "head", defense: 2 }],
  [IRON_CHESTPLATE, { slot: "chest", defense: 6 }],
  [IRON_LEGGINGS, { slot: "legs", defense: 5 }],
  [IRON_BOOTS, { slot: "feet", defense: 2 }],
  [GOLD_HELMET, { slot: "head", defense: 2 }],
  [GOLD_CHESTPLATE, { slot: "chest", defense: 5 }],
  [GOLD_LEGGINGS, { slot: "legs", defense: 3 }],
  [GOLD_BOOTS, { slot: "feet", defense: 1 }],
  [DIAMOND_HELMET, { slot: "head", defense: 3 }],
  [DIAMOND_CHESTPLATE, { slot: "chest", defense: 8 }],
  [DIAMOND_LEGGINGS, { slot: "legs", defense: 6 }],
  [DIAMOND_BOOTS, { slot: "feet", defense: 3 }],
]);

/** その防具の値。着られないなら null（`foodOf()` と同じ形）。 */
export function armorOf(id: number): ArmorDef | null {
  return ARMORS.get(id) ?? null;
}

/** 着られるアイテムの一覧（テストと表示用）。 */
export function allArmorIds(): number[] {
  return [...ARMORS.keys()];
}

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

/**
 * **クラフトで使い切ったときに盤面へ残る「残りかす」**。残らないなら `NO_ITEM`。
 * いま入っているのは**ミルクバケツ（138）→ バケツ（84）の 1 行**だけです（ケーキ）。
 *
 * **`EMPTIES` と別の表にしてあります。1 つにまとめないこと** ——
 * あちらは**食べ切ったあとに手の中へ戻る器**（シチュー → ボウル）で、
 * こちらは**クラフトで盤面に残るもの**です。**起きる場所も、戻る先も違います。**
 *
 * **`Recipe` に新しいキーを足さないこと。** 残りかすは**アイテムの性質**であって
 * レシピの性質ではありません —— 同じミルクバケツは、どのレシピで使っても
 * 空のバケツに戻ります（本家と同じ）。`crafting.ts` の `consumeGrid()` は
 * **表を持たず、この関数に聞くだけ**です。
 *
 * **載せてよいのは `stack: 1` のものだけです。これは手触りではなく不変条件**
 * （`EMPTIES` の「器が戻る食べ物は `stack: 1`」とまったく同じ理由）——
 * 積める物を載せると、**山が 1 個ずつ減るのに残りかすは 1 個で頭打ち**になり、
 * 2 個目を作った拍子に残りかすが消えます。`test/crafting.test.ts` が
 * **表に載っているものの `itemStackLimit()` が全部 1** であることを見張っています。
 */
const LEFTOVERS = new Map<number, number>([[MILK_BUCKET, BUCKET]]);

/** そのアイテムをクラフトで使い切ったあとに盤面へ残るもの。残らないなら `NO_ITEM`。 */
export function leftoverOf(id: number): number {
  return LEFTOVERS.get(id) ?? NO_ITEM;
}

/** 残りかすを持つアイテムの一覧（テスト用）。 */
export function allLeftoverIds(): number[] {
  return [...LEFTOVERS.keys()];
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

/**
 * **2 山目 1 山ぶん。** `DropStack` に確率を足したもの（**`DropStack` の側に足さないこと** ——
 * あちらは `rollDrops()` の**返り値**の型なので、地面に出る山が意味の無い `chance` を
 * 持つことになります）。
 *
 * **`chance` を省略すると必ず落ちます**（実った小麦の種がこれ）。
 */
export interface ExtraDrop extends DropStack {
  /** 2 山目が落ちる確率。省略すると必ず落ちる。抽選は `roll` とは**別の乱数**。 */
  readonly chance?: number;
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
   * **1 山目とは別の山**（実った小麦の種と、葉のリンゴ・苗木がこれ）。省略すると 1 山だけ。
   *
   * **`chance` を省略すると必ず落ちます**（種がそれ）。付けたぶんは
   * **`roll` とは別の乱数（`extraRoll`）**で抽選するので、**1 山目の当たり外れとは
   * 相関しません** —— 棒が出た葉からだけリンゴが出る、にはなりません
   * （`test/blocks.test.ts` の「4 通りの山の数が 1,2,0,1」が見張り）。
   *
   * **候補は 2 件まで並べられます**（オークの葉のリンゴと苗木）。**2 件は 3 本目の
   * 乱数ではなく、`extraRoll` を上から順に帯で切って選びます** —— リンゴが
   * `0..0.005`、苗木がその続きの `0.005..0.055`。**だから 1 度に出るのはどちらか
   * 片方だけ**で（本家は独立。`TUNING.md`）、**山は今までどおり最大 2 つ**です。
   * **乱数を 3 本目に増やさないこと** —— `BreakOrder` と `autoBreak()` の引数と
   * `main.ts` に及びます。**帯の合計が 1 を超えないこと**（超えると後ろの候補が
   * 永久に出ません。`test/blocks.test.ts` が見張り）。
   *
   * **個数の範囲（min / max）はまだ持てません。** 本家の「小麦 1 + 種 0〜3」に
   * 寄せたくなったら、上と同じで**乱数をもう 1 本流す話が先**です。
   */
  readonly extra?: ExtraDrop | readonly [ExtraDrop, ExtraDrop];
}

/**
 * 2 山目の候補を必ず配列で。**`drop.extra.item` と直に書かないこと** ——
 * 2 件並べた行（オークの葉）でだけ静かに壊れます。
 */
export function extraDrops(drop: Drop): readonly ExtraDrop[] {
  if (!drop.extra) return [];
  return Array.isArray(drop.extra) ? drop.extra : [drop.extra as ExtraDrop];
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
  // 粘土は**粘土玉 4 個**になって落ちる（Minecraft と同じ個数）。**雪とまったく同じ対**で、
  // この 1 行があると粘土ブロックがそのままでは手に入らなくなるので、
  // `crafting.ts` の「粘土玉 4 個 → 粘土 1 個」が必ず対で要る（無いと二度と置けない）。
  [CLAY, { item: CLAY_BALL, count: 4, chance: 1 }],
  // 葉から出るのは棒（10%）と、2 山目の**リンゴ（0.5%）か苗木（5%）**。
  // **オークの葉にだけリンゴが付きます**（本家はオークとダークオークだけ。針葉樹は無し）。
  // **棒と 2 山目は別々の乱数で当たります** —— `chance` を `extraRoll` が見るので、
  // 「棒が出た葉からだけリンゴが出る」形になりません。
  // **リンゴと苗木は 3 本目の乱数ではなく `extraRoll` の帯で分けてあります**
  // （リンゴ 0..0.005 → 苗木 0.005..0.055）。**だから同時には落ちません** ——
  // 本家は独立だが、乱数を増やすと `breaking.ts` と `main.ts` に及ぶ（`TUNING.md`）。
  [
    LEAVES,
    {
      item: STICK,
      count: 1,
      chance: 0.1,
      extra: [
        { item: APPLE, count: 1, chance: 0.005 },
        { item: SAPLING, count: 1, chance: 0.05 },
      ],
    },
  ],
  // トウヒの葉は**苗木だけ**（リンゴは付かない）。帯は 1 本なので 0..0.05。
  [
    SPRUCE_LEAVES,
    { item: STICK, count: 1, chance: 0.1, extra: { item: SPRUCE_SAPLING, count: 1, chance: 0.05 } },
  ],
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
  // 本棚は**本が 3 個だけ**（Minecraft と同じ。**板 6 個は戻らない**）。この 1 行が無いと
  // 既定の `baseBlock()` が本棚そのものを落とすので、板 6 + 本 3 が無傷で戻ってくる。
  // **`extra` も `otherwise` も書かないこと** —— `chance: 1` なので `roll` も `extraRoll` も
  // 結果に効かない（**確率にも 2 本目の乱数にも繋がっていない**のが `test/blocks.test.ts` の判定）。
  [BOOKSHELF, { item: BOOK, count: 3, chance: 1 }],
  // クモの巣は**糸が 1 個**（Minecraft と同じ。巣そのものは戻らない）。この 1 行が無いと
  // 既定の `baseBlock()` が巣そのものを落とす。**落ちるかどうかは `chance` ではなく
  // `mining.ts` の `canHarvest()`** が決める（刃物でなければそもそも収穫にならない）ので、
  // ここは `chance: 1` のまま —— **`extra` も `otherwise` も書かないこと。**
  [COBWEB, { item: STRING, count: 1, chance: 1 }],
  // ケーキは**何も落ちない**（Minecraft と同じ。置いたら食べるしかない）。ガラス・
  // ポータルの面と同じ `NO_ITEM` の 1 行で、**道具では変わらない** —— 収穫の可否を
  // 見るのは `canHarvest()` だが、こちらは**落ちるものが最初から無い**ので
  // **素手でもツルハシでも剣でも 0 個**（`test/blocks.test.ts` が 3 通り並べて見る）。
  [CAKE, { item: NO_ITEM, count: 0, chance: 0 }],
  // 氷も**何も落ちない**（本家はシルクタッチでだけ持ち帰れるが、まだ無い）。ガラス・
  // ケーキと同じ `NO_ITEM` の 1 行で、**道具では変わらない** —— **素手でもツルハシでも
  // 0 個**。**残るのは水**だが、それを決めるのは `blocks.ts` の `remainsAfterBreak()` で
  // ここではない（**落ちるもの**と**残るブロック**は別の話。`extra` も `otherwise` も
  // 書かないこと —— `otherwise` を書くと「外れたら氷が戻る」になる）。
  [ICE, { item: NO_ITEM, count: 0, chance: 0 }],
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
 * **地面に出す山を全部**（0〜2 山）。2 山あるのは実った小麦（小麦 + 種）と
 * 当たった葉（棒 + リンゴ／苗木）だけで、他は今までどおり 0 山か 1 山。
 *
 * **1 山目は `rollDrop()` に作らせること** —— `chance` と `otherwise` の判断をここへ
 * 写すと、**掘ったときと床を抜かれたときで落ちるものが違う**が戻ってきます
 * （`rules/items-survival.md`）。`rollDrop()` は既存のテストの根拠なので消しません。
 *
 * **2 山目は `roll` ではなく `extraRoll` で抽選します。** 1 本の乱数を使い回すと
 * 「棒が出た葉からだけリンゴが出る」形になり、**別々の山という前提そのものが崩れます。**
 * `extra.chance` を省略したぶん（実った小麦の種）は今までどおり必ず落ちます。
 *
 * **`extraRoll` は省略できません。** 省略できると `main.ts` が渡し忘れてもコンパイルが
 * 通り、**リンゴが永久に出ないのにテストは緑**になります。
 *
 * **2 山目の候補が 2 件あるときは、帯を上から順に切って 1 件だけ**選びます
 * （オークの葉のリンゴ 0..0.005 → 苗木 0.005..0.055）。**乱数は 2 本のまま**で、
 * **山は最大 2 つのまま**です。
 */
export function rollDrops(
  blockId: number,
  roll: number,
  extraRoll: number,
): readonly DropStack[] {
  const stacks: DropStack[] = [];
  const first = rollDrop(blockId, roll);
  // 何も出ない目（ガラス・葉の外れ）は山にしない。
  if (first.item !== NO_ITEM && first.count > 0) stacks.push(first);
  // **帯を上から順に切って、当たった 1 件だけ**（`break` を落とすと、2 件並べた行で
  // 山が 3 つになる）。外れた帯のぶんは `edge` に足して次の候補へ送る。
  let edge = 0;
  for (const extra of extraDrops(dropOf(blockId))) {
    const width = extra.chance ?? 1;
    if (extraRoll >= edge + width) {
      edge += width;
      continue;
    }
    // **`chance` は地面に持ち出さない**（返るのは `DropStack` そのもの）。
    if (extra.item !== NO_ITEM && extra.count > 0) stacks.push({ item: extra.item, count: extra.count });
    break;
  }
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

/**
 * 刃物（剣かシアーズ）か。**クモの巣のような `isBladed()` なブロックが、これでだけ
 * 落ちます**（`mining.ts` の `canHarvest()` の 1 行）。
 *
 * **`item === SHEARS` と書かないこと** —— どちらも既にある `isSword()` /
 * `isShears()` の合成にしておけば、剣の階層が増えてもシアーズが増えても 1 行も直りません。
 * **「掘る速さ」には 1 文字も効きません**（`toolSpeed()` は `BlockDef.tool` を見るだけで、
 * 剣もシアーズも `speed: 1`）—— 刃物は「落ちるかどうか」だけを決めます。
 */
export function isBlade(item: number): boolean {
  return isSword(item) || isShears(item);
}

/** 全アイテム ID（テストと UI の列挙用）。 */
export function allItemIds(): number[] {
  const ids: number[] = [];
  for (let id = 1; id <= MAX_ITEM_ID; id++) if (ITEMS[id]) ids.push(id);
  return ids;
}
