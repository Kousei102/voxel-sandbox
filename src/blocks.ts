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
export const TORCH = 19;

/**
 * 壁掛けの松明。名前の軸は**支えのある側**を指す
 * （`WALL_TORCH_XP` なら +X 側のブロックに付いていて、松明は -X へ張り出す）。
 *
 * 向きごとに別 ID にしてあるのは、ボクセルにメタデータを持たせないため
 * （データを `Uint8Array` のまま、mesher の統合キーもそのままにできる）。
 * プレイヤーから見れば 1 種類なので、名前もドロップも `TORCH` に揃えてある。
 */
export const WALL_TORCH_XP = 20;
export const WALL_TORCH_XN = 21;
export const WALL_TORCH_ZP = 22;
export const WALL_TORCH_ZN = 23;

/** バイオームで出るもの。 */
export const SANDSTONE = 24;
export const SPRUCE_WOOD = 25;
export const SPRUCE_LEAVES = 26;
export const CACTUS = 27;

/**
 * ブロック ID は mesher の encodeFace で 6 ビットしか無い。ここを超えると
 * 面の統合キーが壊れるので、増やすときは encodeFace の詰め方から見直すこと。
 */
export const MAX_BLOCK_ID = 63;

/** 採掘に向いた道具の種類。 */
export type ToolKind = "pickaxe" | "axe" | "shovel";

/**
 * 面の番号。`0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z`（CLAUDE.md の規約）。
 * `lighting.ts` の `OFFSETS` はこの順に並べてあり、テストで一致を確かめている。
 */
export const FACE_XP = 0;
export const FACE_XN = 1;
export const FACE_YP = 2;
export const FACE_YN = 3;
export const FACE_ZP = 4;
export const FACE_ZN = 5;
/** 支えが要らないブロックの `supportFace`。 */
export const NO_SUPPORT = -1;

/** 反対側の面。番号は対で並べてあるので下位ビットを反転するだけ。 */
export function oppositeFace(face: number): number {
  return face ^ 1;
}

/** 軸に平行な単位ベクトルから面番号を求める。 */
export function faceFromNormal(dx: number, dy: number, dz: number): number {
  if (dx !== 0) return dx > 0 ? FACE_XP : FACE_XN;
  if (dy !== 0) return dy > 0 ? FACE_YP : FACE_YN;
  return dz > 0 ? FACE_ZP : FACE_ZN;
}

/**
 * 描き方。"cube" は greedy meshing で統合される 1x1x1 の箱。
 * それ以外（松明など）は統合せず、mesher の専用パスが形を組む。
 */
export type BlockModel = "cube" | "torch" | "cactus";

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
  /** 自分で出す光の量 0..15。0 なら光らない。スカイライトとは別の系統。 */
  readonly emission: number;
  readonly model: BlockModel;
  /**
   * 支えとして固いブロックが要る向き（面番号）。`NO_SUPPORT` なら要らない。
   * 床置きの松明は `FACE_YN`（真下）、壁掛けは付いている壁の側。
   * **その向きのブロックが消えたら、このブロックも壊れる**（`world.setVoxel`）。
   */
  readonly supportFace: number;
  /**
   * 見た目だけが違う別置き版なら、その大元のブロック。0 なら大元そのもの。
   * アイテムもドロップも名前も大元に揃うので、置き方を増やしても
   * アイテム欄が増えない。
   */
  readonly variantOf: number;
}

/** 壊せないブロックの硬さ。 */
const UNBREAKABLE = Number.POSITIVE_INFINITY;

/** 松明の明るさ。Minecraft と同じ 14（自分のマスが 14 で、そこから 1 ずつ減る）。 */
export const TORCH_LIGHT = 14;

/** 床置きと壁掛けで共通の見た目と性質。違うのは supportFace と variantOf だけ。 */
const TORCH_COLORS = { top: 0xffd267, side: 0x6f4d2a, bottom: 0x6f4d2a };
const TORCH_OPTS = {
  opaque: false,
  solid: false,
  hardness: 0,
  emission: TORCH_LIGHT,
  model: "torch" as const,
};

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
    emission: opts.emission ?? 0,
    model: opts.model ?? "cube",
    supportFace: opts.supportFace ?? NO_SUPPORT,
    variantOf: opts.variantOf ?? AIR,
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
  // top = 炎の色、side = 柄の色。mesher の松明パスがこの 2 色を使い分ける。
  def(TORCH, "松明", TORCH_COLORS, { ...TORCH_OPTS, supportFace: FACE_YN }),
  // 壁掛けの 4 向き。見た目と支えの向きだけが違うので、大元は TORCH。
  def(WALL_TORCH_XP, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_XP,
    variantOf: TORCH,
  }),
  def(WALL_TORCH_XN, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_XN,
    variantOf: TORCH,
  }),
  def(WALL_TORCH_ZP, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_ZP,
    variantOf: TORCH,
  }),
  def(WALL_TORCH_ZN, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_ZN,
    variantOf: TORCH,
  }),
  def(SANDSTONE, "砂岩", { top: 0xd3c193, side: 0xc9b487, bottom: 0xbca877 }, {
    hardness: 0.8,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  def(SPRUCE_WOOD, "トウヒの原木", { top: 0x6b4f33, side: 0x3f2d1c }, { hardness: 2, tool: "axe" }),
  def(SPRUCE_LEAVES, "トウヒの葉", { top: 0x2c5c3a }, { hardness: 0.2 }),
  // 立方体より少し細いので、松明と同じ専用パスで描く。
  // opaque を true にすると、細いぶん隣の面が消えて地面が透けて見える。
  def(CACTUS, "サボテン", { top: 0x5c9b47, side: 0x4e8b3c, bottom: 0x3f7331 }, {
    opaque: false,
    hardness: 0.4,
    model: "cactus",
    supportFace: FACE_YN,
  }),
];

/**
 * クリエイティブでホットバーに並ぶブロック。
 * **ホットバーは 9 枠しかないので、ここも 9 個までにすること**（溢れた分は黙って消える）。
 */
export const PALETTE: readonly number[] = [
  GRASS,
  DIRT,
  STONE,
  SAND,
  WOOD,
  PLANK,
  GLASS,
  CRAFTING_TABLE,
  TORCH,
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
/** ブロック自身が出す光。列の走査で 1 ボクセルごとに引くので、表にしておく。 */
export const EMISSION = new Uint8Array(BLOCKS.length);
/** 1 = greedy meshing の対象外（専用の形で描く）。 */
const PROP = new Uint8Array(BLOCKS.length);
const SUPPORT_FACE = new Int8Array(BLOCKS.length);
const VARIANT_OF = new Uint8Array(BLOCKS.length);
for (const block of BLOCKS) {
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  // 水面より下を光源にしないことで、深いほど暗い水中になる
  SKY_BLOCKERS[block.id] = block.opaque || block.id === WATER ? 1 : 0;
  LIGHT_COST[block.id] = block.id === WATER ? 3 : 1;
  EMISSION[block.id] = block.emission;
  PROP[block.id] = block.model === "cube" ? 0 : 1;
  SUPPORT_FACE[block.id] = block.supportFace;
  VARIANT_OF[block.id] = block.variantOf;
}

/**
 * 「支えのある向き」から松明のブロックを選ぶ表。天井（+Y 側に支え）には付かない。
 * 添字は面番号なので、並び順を FACE_* と合わせること。
 */
const TORCH_BY_SUPPORT: readonly number[] = [
  WALL_TORCH_XP,
  WALL_TORCH_XN,
  AIR, // 天井からはぶら下げられない（Minecraft と同じ）
  TORCH,
  WALL_TORCH_ZP,
  WALL_TORCH_ZN,
];

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

/** そのブロック自身が出す光の量 0..15。 */
export function blockEmission(id: number): number {
  return EMISSION[id];
}

/**
 * 立方体ではないブロックか。true なら greedy meshing の面マスクには載せず、
 * mesher の専用パスが形を組む。
 */
export function isProp(id: number): boolean {
  return PROP[id] === 1;
}

export function blockModel(id: number): BlockModel {
  return BLOCKS[id].model;
}

/**
 * 支えが要る向き（面番号）。要らなければ `NO_SUPPORT`。
 * この向きのブロックが `canSupport` でなくなったら、このブロックも壊れる。
 */
export function supportFace(id: number): number {
  return SUPPORT_FACE[id];
}

/**
 * 松明を「支えが face の向きにある」場所へ置くときのブロック。置けないなら AIR。
 * 置き方を増やしたいだけなら、ここと TORCH_BY_SUPPORT を触れば済む。
 */
export function torchVariant(face: number): number {
  return TORCH_BY_SUPPORT[face] ?? AIR;
}

/** 別置き版なら大元のブロック、そうでなければ自分自身。 */
export function baseBlock(id: number): number {
  return VARIANT_OF[id] || id;
}

/** 上に松明などを載せられるか。 */
export function canSupport(id: number): boolean {
  return BLOCKS[id].solid;
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
