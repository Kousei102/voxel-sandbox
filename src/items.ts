import {
  AIR,
  BLOCKS,
  COAL_ORE,
  COBBLE,
  DIAMOND_ORE,
  DIRT,
  GLASS,
  GRASS,
  GRAVEL,
  LEAVES,
  MAX_BLOCK_ID,
  NETHER_PORTAL,
  SPRUCE_LEAVES,
  STONE,
  TIER_DIAMOND,
  TIER_WOOD,
  LAVA,
  WATER,
  baseBlock,
  isLiquid,
  type ToolKind,
} from "./blocks";

/**
 * アイテム ID の空間。
 *
 * **1..63 はブロック ID とそのまま同じ番号**（置けるアイテム）。64 以降が棒・鉱物・道具。
 * ブロック ID は mesher の都合で 63 までなので、この境目は動かさないこと。
 */
export const NO_ITEM = 0;
export const FIRST_NON_BLOCK = MAX_BLOCK_ID + 1;

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
 * 耐久値がまだ無いので、1 個あれば何度でも点けられる（Minecraft は 64 回）。
 * 積めるのは 1 個まで —— 道具と同じ扱い。
 */
export const FLINT_AND_STEEL = 88;

export const MAX_ITEM_ID = FLINT_AND_STEEL;

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
// 火打石と打ち金は道具と同じで積めない（耐久値が無いので、実質 1 個で足りる）。
item({ id: FLINT_AND_STEEL, name: "火打石と打ち金", block: AIR, stack: 1, color: 0xa6a094, tool: null });

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
]);

/** そのアイテムを食べたときの値。食べられないなら null。 */
export function foodOf(id: number): FoodDef | null {
  return FOODS.get(id) ?? null;
}

/** 食べられるアイテムの一覧（テストと表示用）。 */
export function allFoodIds(): number[] {
  return [...FOODS.keys()];
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
  // 苗木がまだ無いので、葉からはたまに棒だけ出る
  [LEAVES, { item: STICK, count: 1, chance: 0.1 }],
  [SPRUCE_LEAVES, { item: STICK, count: 1, chance: 0.1 }],
  // 砂利は 10% で火打石、外したら砂利そのもの（Minecraft と同じ）。
  // **`otherwise` が無いと 90% で消えるブロックになる。**
  [GRAVEL, { item: FLINT, count: 1, chance: 0.1, otherwise: GRAVEL }],
  // ポータルの面は壊せる（硬さ 0）が、何も落ちない。**持ち帰れると枠が要らなくなる。**
  [NETHER_PORTAL, { item: NO_ITEM, count: 0, chance: 0 }],
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

/** 全アイテム ID（テストと UI の列挙用）。 */
export function allItemIds(): number[] {
  const ids: number[] = [];
  for (let id = 1; id <= MAX_ITEM_ID; id++) if (ITEMS[id]) ids.push(id);
  return ids;
}
