import { Color } from "three";

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLE = 4;
export const SAND = 5;
export const WATER = 6;
export const WOOD = 7;
export const LEAVES = 8;
export const SNOW = 9;
export const PLANK = 10;
export const GLASS = 11;
export const BRICK = 12;
export const BEDROCK = 13;
export const COAL_ORE = 14;
export const IRON_ORE = 15;
export const GOLD_ORE = 16;
export const DIAMOND_ORE = 17;
export const CRAFTING_TABLE = 18;

/**
 * ブロック ID は mesher の encodeFace で 6 ビットしか無い。ここを超えると
 * 面の統合キーが壊れるので、増やすときは encodeFace の詰め方から見直すこと。
 */
export const MAX_BLOCK_ID = 63;

/** 採掘に向いた道具の種類。 */
export type ToolKind = "pickaxe" | "axe" | "shovel";

/** 道具の階層。0 = 素手、1 = 木、2 = 石、3 = 鉄、4 = ダイヤ。 */
export const TIER_HAND = 0;
export const TIER_WOOD = 1;
export const TIER_STONE = 2;
export const TIER_IRON = 3;
export const TIER_DIAMOND = 4;

export interface BlockDef {
  readonly id: number;
  readonly name: string;
  /** top / side / bottom の色（sRGB hex）。 */
  readonly top: number;
  readonly side: number;
  readonly bottom: number;
  /** 光を通さない = 隣接面を隠し、AO を落とす。 */
  readonly opaque: boolean;
  /** 半透明レイヤーで描く。 */
  readonly translucent: boolean;
  /** プレイヤーが衝突する。 */
  readonly solid: boolean;
  readonly alpha: number;
  /** 硬さ。Minecraft と同じ尺度で、素手・適正道具なしなら hardness * 5 秒かかる。 */
  readonly hardness: number;
  /** 採掘が速くなる道具。null なら何で掘っても同じ。 */
  readonly tool: ToolKind | null;
  /** これ未満の階層の道具で掘ると、時間はかかるのに何も落ちない。 */
  readonly minTier: number;
}

/** 壊せないブロックの硬さ。 */
const UNBREAKABLE = Number.POSITIVE_INFINITY;

function def(
  id: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">> = {},
): BlockDef {
  return {
    id,
    name,
    top: colors.top,
    side: colors.side ?? colors.top,
    bottom: colors.bottom ?? colors.side ?? colors.top,
    opaque: opts.opaque ?? true,
    translucent: opts.translucent ?? false,
    solid: opts.solid ?? true,
    alpha: opts.alpha ?? 1,
    hardness: opts.hardness ?? 0,
    tool: opts.tool ?? null,
    minTier: opts.minTier ?? TIER_HAND,
  };
}

export const BLOCKS: readonly BlockDef[] = [
  def(AIR, "Air", { top: 0x000000 }, { opaque: false, solid: false, alpha: 0 }),
  def(GRASS, "草", { top: 0x6aa84f, side: 0x7a6444, bottom: 0x6b533a }, { hardness: 0.6, tool: "shovel" }),
  def(DIRT, "土", { top: 0x6b533a }, { hardness: 0.5, tool: "shovel" }),
  def(STONE, "石", { top: 0x8a8f96 }, { hardness: 1.5, tool: "pickaxe", minTier: TIER_WOOD }),
  def(COBBLE, "丸石", { top: 0x767b82 }, { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD }),
  def(SAND, "砂", { top: 0xd8c99a }, { hardness: 0.5, tool: "shovel" }),
  def(
    WATER,
    "水",
    { top: 0x2f6ec4 },
    { opaque: false, translucent: true, solid: false, alpha: 0.72, hardness: UNBREAKABLE },
  ),
  def(WOOD, "原木", { top: 0x8a6a3f, side: 0x5f4526 }, { hardness: 2, tool: "axe" }),
  def(LEAVES, "葉", { top: 0x3f7a3a }, { hardness: 0.2 }),
  def(SNOW, "雪", { top: 0xeef3f7, side: 0xdde5ec, bottom: 0x8a8f96 }, { hardness: 0.2, tool: "shovel" }),
  def(PLANK, "板", { top: 0xb18a56 }, { hardness: 2, tool: "axe" }),
  def(
    GLASS,
    "ガラス",
    { top: 0xa9d8e8 },
    { opaque: false, translucent: true, alpha: 0.3, hardness: 0.3 },
  ),
  def(BRICK, "レンガ", { top: 0xa4553f }, { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD }),
  def(BEDROCK, "岩盤", { top: 0x2b2f35 }, { hardness: UNBREAKABLE }),
  // 鉱石は面ごとに 1 色しか持てないので、石の灰色に鉱石の色を寄せた 1 色で表している
  def(COAL_ORE, "石炭鉱石", { top: 0x4a4d53 }, { hardness: 3, tool: "pickaxe", minTier: TIER_WOOD }),
  def(IRON_ORE, "鉄鉱石", { top: 0xb08a6a }, { hardness: 3, tool: "pickaxe", minTier: TIER_STONE }),
  def(GOLD_ORE, "金鉱石", { top: 0xd8b64a }, { hardness: 3, tool: "pickaxe", minTier: TIER_IRON }),
  def(
    DIAMOND_ORE,
    "ダイヤ鉱石",
    { top: 0x59c8c8 },
    { hardness: 3, tool: "pickaxe", minTier: TIER_IRON },
  ),
  def(
    CRAFTING_TABLE,
    "作業台",
    { top: 0x9a6f3e, side: 0x7d5730, bottom: 0xb18a56 },
    { hardness: 2.5, tool: "axe" },
  ),
];

/** クリエイティブでホットバーに並ぶブロック。 */
export const PALETTE: readonly number[] = [
  GRASS,
  DIRT,
  STONE,
  COBBLE,
  SAND,
  WOOD,
  PLANK,
  GLASS,
  CRAFTING_TABLE,
];

const scratch = new Color();

/** 面ごとの色を線形空間の RGB として引くためのテーブル: [blockId][face][0..2]。 */
const FACE_COLORS = (() => {
  // face 順: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
  const table = new Float32Array(BLOCKS.length * 6 * 3);
  for (const b of BLOCKS) {
    const hexes = [b.side, b.side, b.top, b.bottom, b.side, b.side];
    for (let f = 0; f < 6; f++) {
      scratch.setHex(hexes[f]);
      const o = (b.id * 6 + f) * 3;
      table[o] = scratch.r;
      table[o + 1] = scratch.g;
      table[o + 2] = scratch.b;
    }
  }
  return table;
})();

export function faceColor(id: number, face: number, out: Float32Array): void {
  const o = (id * 6 + face) * 3;
  out[0] = FACE_COLORS[o];
  out[1] = FACE_COLORS[o + 1];
  out[2] = FACE_COLORS[o + 2];
}

/** UI 用の CSS カラー。 */
export function cssColor(id: number): string {
  return "#" + BLOCKS[id].top.toString(16).padStart(6, "0");
}

/**
 * 判定は 1 チャンクあたり数万回走るので、オブジェクトのプロパティではなく
 * 添字 1 回で引ける表にしておく。
 */
const OPAQUE = new Uint8Array(BLOCKS.length);
/** 1 = このブロックがあると、その下は「空に露出している」とは見なさない。 */
export const SKY_BLOCKERS = new Uint8Array(BLOCKS.length);
const LIGHT_COST = new Uint8Array(BLOCKS.length);
for (const block of BLOCKS) {
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  // 水面より下を光源にしないことで、深いほど暗い水中になる
  SKY_BLOCKERS[block.id] = block.opaque || block.id === WATER ? 1 : 0;
  LIGHT_COST[block.id] = block.id === WATER ? 3 : 1;
}

export function isOpaque(id: number): boolean {
  return OPAQUE[id] === 1;
}

/** 光がこのブロックを 1 マス進むときの減衰量。不透明ブロックはそもそも通さない。 */
export function lightCost(id: number): number {
  return LIGHT_COST[id];
}

export function blocksSky(id: number): boolean {
  return SKY_BLOCKERS[id] === 1;
}

export function isTranslucent(id: number): boolean {
  return BLOCKS[id].translucent;
}

export function isSolid(id: number): boolean {
  return BLOCKS[id].solid;
}

export function blockName(id: number): string {
  return BLOCKS[id].name;
}

export function blockHardness(id: number): number {
  return BLOCKS[id].hardness;
}

export function blockTool(id: number): ToolKind | null {
  return BLOCKS[id].tool;
}

export function blockMinTier(id: number): number {
  return BLOCKS[id].minTier;
}

/** 壊せるか。水と岩盤は掘れない。 */
export function isBreakable(id: number): boolean {
  return id !== AIR && Number.isFinite(BLOCKS[id].hardness);
}
