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
}

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
  };
}

export const BLOCKS: readonly BlockDef[] = [
  def(AIR, "Air", { top: 0x000000 }, { opaque: false, solid: false, alpha: 0 }),
  def(GRASS, "Grass", { top: 0x6aa84f, side: 0x7a6444, bottom: 0x6b533a }),
  def(DIRT, "Dirt", { top: 0x6b533a }),
  def(STONE, "Stone", { top: 0x8a8f96 }),
  def(COBBLE, "Cobble", { top: 0x767b82 }),
  def(SAND, "Sand", { top: 0xd8c99a }),
  def(
    WATER,
    "Water",
    { top: 0x2f6ec4 },
    { opaque: false, translucent: true, solid: false, alpha: 0.72 },
  ),
  def(WOOD, "Wood", { top: 0x8a6a3f, side: 0x5f4526 }),
  def(LEAVES, "Leaves", { top: 0x3f7a3a }),
  def(SNOW, "Snow", { top: 0xeef3f7, side: 0xdde5ec, bottom: 0x8a8f96 }),
  def(PLANK, "Plank", { top: 0xb18a56 }),
  def(GLASS, "Glass", { top: 0xa9d8e8 }, { opaque: false, translucent: true, alpha: 0.3 }),
  def(BRICK, "Brick", { top: 0xa4553f }),
  def(BEDROCK, "Bedrock", { top: 0x2b2f35 }),
];

/** ホットバーに並ぶブロック。 */
export const PALETTE: readonly number[] = [
  GRASS,
  DIRT,
  STONE,
  COBBLE,
  SAND,
  WOOD,
  LEAVES,
  PLANK,
  GLASS,
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
