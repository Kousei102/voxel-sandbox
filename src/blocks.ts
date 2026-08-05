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

/** ハーフブロック。上付きは向き違いなので 64 以降（下の ID の枠を参照）。 */
export const STONE_SLAB = 28;
export const COBBLE_SLAB = 29;
export const PLANK_SLAB = 30;
export const SANDSTONE_SLAB = 31;

/**
 * 草むら。地表に生える背の低い草で、**地面の「草」ブロック（`GRASS`）とは別物**。
 * 向きを持たないので枠は 1 個で足りる。
 */
export const TALL_GRASS = 32;

/**
 * 階段。材質ごとに 水平 4 向き × 上下 2 = 8 通りあるが、
 * **1..63 を使うのは大元（下付き・+X 向き）だけ**で、残り 7 つは 64 以降に置く。
 */
export const STONE_STAIRS = 33;
export const COBBLE_STAIRS = 34;
export const PLANK_STAIRS = 35;
export const SANDSTONE_STAIRS = 36;

/** 羊毛。羊を倒すと落ちる。いまのところ**置ける**ことがそのまま見返りになっている。 */
export const WOOL = 37;

/**
 * ブロック ID の枠は 2 段に分けてある。
 *
 * - **1..63**: 立方体と、**アイテムとして持てる**ブロック（ハーフや階段の「大元」も含む）。
 *   mesher の `encodeFace` は id に 6 ビットしか割いていないので、greedy meshing の
 *   面マスクに載るもの（= 立方体）はここを超えられない。アイテム ID の 1..63 が
 *   ブロック ID と同じ番号なので、持てるブロックもここに居る必要がある。
 * - **64..255**: `variantOf` を持つ向き違いの版だけ。`isProp()` が true のブロックは
 *   面マスクに載らない（`mesher.ts` の可視判定が飛ばす）ので 6 ビット制限を受けない。
 *   向き違いはアイテムを持たない（`items.ts` が `variantOf` のあるものを飛ばす）ため、
 *   64 以降の**アイテム** ID（棒・鉱物・道具）とも衝突しない。
 *   ボクセルは `Uint8Array` のままなので、255 までならメモリも増えない。
 *
 * **どちらもテストで押さえている**（`model === "cube"` なら 63 以下 /
 * 64 以上なら `isProp` かつ `variantOf` あり）。この 2 つを破ると、
 * 面の統合キーが壊れるか、持てないブロックが増える形で静かに壊れる。
 */
export const MAX_BLOCK_ID = 63;
export const MAX_VARIANT_ID = 255;
const ID_LIMIT = MAX_VARIANT_ID + 1;

/** 上付きハーフ。見た目と当たり判定だけが違うので、大元は下付きのハーフ。 */
export const STONE_SLAB_TOP = 64;
export const COBBLE_SLAB_TOP = 65;
export const PLANK_SLAB_TOP = 66;
export const SANDSTONE_SLAB_TOP = 67;

/**
 * 階段の向き違い。材質ごとに 7 個ずつ連番で取る（大元は 1..63 側）。
 * 個別に名前は付けない。引くのは `stairVariant()`（`placedVariant` から）。
 */
const FIRST_STAIR_VARIANT = 68;
const STAIR_VARIANTS_PER_MATERIAL = 7;

/** 採掘に向いた道具の種類。 */
export type ToolKind = "pickaxe" | "axe" | "shovel";

/**
 * 音の材質グループ。足音・破壊・設置の音はここから作る（`sfx.ts` の表）。
 * **既定は "stone" なので、柔らかいものには必ず書くこと。**
 * 書き忘れても音が鳴らなくなるわけではなく「石の音がする」ので、
 * `npm test` が全ブロックの割り当てを一覧で出す。
 */
export type SoundGroup =
  | "grass"
  | "dirt"
  | "sand"
  | "stone"
  | "wood"
  | "glass"
  | "snow"
  | "wool"
  | "none";

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
 *
 * "boxes" は `boxes` に並べた箱をそのまま描く（ハーフ・階段・サボテン）。
 * **見た目と当たり判定が同じ形になる**ので、片方だけ直して食い違うことがない。
 */
export type BlockModel = "cube" | "torch" | "boxes" | "cross";

/**
 * ブロック 1 個の中の箱 `[x0,y0,z0,x1,y1,z1]` の並び（1 ブロック = 1.0）。
 *
 * これが**そのブロックの形**で、3 つの用途を兼ねる:
 * 狙う判定（`raycast`）・当たり判定（`solid` なブロックだけ）・
 * `model === "boxes"` なら見た目。**1 か所にしておけば食い違わない。**
 */
export type BoxList = readonly (readonly number[])[];

/** 立方体の当たり判定。 */
export const FULL_BOX: BoxList = [[0, 0, 0, 1, 1, 1]];
/** 通り抜けられるブロック（空気・水・松明・草）。 */
const NO_BOX: BoxList = [];
/** ハーフブロックの下半分・上半分。 */
export const SLAB_BOTTOM_BOX: BoxList = [[0, 0, 0, 1, 0.5, 1]];
export const SLAB_TOP_BOX: BoxList = [[0, 0.5, 0, 1, 1, 1]];
/** サボテンは立方体より 1/16 ずつ細い（Minecraft と同じ）。 */
export const CACTUS_BOX: BoxList = [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]];
/**
 * 草むら。`model: "cross"` はこの箱の**中心で板 2 枚を交差させる**ので、
 * 見た目の大きさもここで決まる（狙う判定・選択枠と同じ形になる）。
 */
export const CROSS_BOX: BoxList = [[0.1, 0, 0.1, 0.9, 0.8, 0.9]];

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
  /**
   * 真上から来るスカイライトを止めるか。既定は「不透明なら止める」。
   *
   * ハーフや階段は `opaque: false`（立方体でないブロックの決まり）だが、
   * これを止めないとハーフで葺いた屋根の下が昼のまま明るくなる。
   */
  readonly blocksSky: boolean;
  /** 半透明レイヤーで描く。 */
  readonly translucent: boolean;
  /** プレイヤーが衝突する。 */
  readonly solid: boolean;
  /**
   * ここにブロックを置くと、確認なしに上書きされるか（空気・水・草むら）。
   * **置く側（`main.ts`）と、木の枝葉を書き込む側（`worldgen.ts`）が同じ判定を使う。**
   * 分かれていると「草むらの上に葉が乗らず、木に穴が空く」ような形で静かに壊れる。
   */
  readonly replaceable: boolean;
  readonly alpha: number;
  /** 硬さ。Minecraft と同じ尺度で、素手・適正道具なしなら hardness * 5 秒かかる。 */
  readonly hardness: number;
  /** 採掘が速くなる道具。null なら何で掘っても同じ。 */
  readonly tool: ToolKind | null;
  /** これ未満の階層の道具で掘ると、時間はかかるのに何も落ちない。 */
  readonly minTier: number;
  /** 自分で出す光の量 0..15。0 なら光らない。スカイライトとは別の系統。 */
  readonly emission: number;
  /** 足音・破壊・設置の音の材質。既定は "stone"。 */
  readonly sound: SoundGroup;
  readonly model: BlockModel;
  /**
   * ブロックの形。既定は立方体 1 個。当たり判定は `solid` なブロックだけがこれを使う
   * （松明は形を持つが `solid: false` なので通り抜ける）。
   */
  readonly boxes: BoxList;
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
  sound: "wood" as const,
};

function def(
  id: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">> = {},
): BlockDef {
  const opaque = opts.opaque ?? true;
  const solid = opts.solid ?? true;
  return {
    id,
    name,
    top: colors.top,
    side: colors.side ?? colors.top,
    bottom: colors.bottom ?? colors.side ?? colors.top,
    opaque,
    blocksSky: opts.blocksSky ?? opaque,
    translucent: opts.translucent ?? false,
    solid,
    replaceable: opts.replaceable ?? false,
    alpha: opts.alpha ?? 1,
    hardness: opts.hardness ?? 0,
    tool: opts.tool ?? null,
    minTier: opts.minTier ?? TIER_HAND,
    emission: opts.emission ?? 0,
    sound: opts.sound ?? "stone",
    model: opts.model ?? "cube",
    boxes: opts.boxes ?? FULL_BOX,
    supportFace: opts.supportFace ?? NO_SUPPORT,
    variantOf: opts.variantOf ?? AIR,
  };
}

/** ハーフブロックは材質ごとに下付き（大元）と上付き（向き違い）の 2 つ。 */
function slabPair(
  bottomId: number,
  topId: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">>,
): BlockDef[] {
  const shared = {
    ...opts,
    // 立方体でないので opaque は false。ただし屋根として光は止める
    opaque: false,
    blocksSky: true,
    model: "boxes" as const,
  };
  return [
    def(bottomId, name, colors, { ...shared, boxes: SLAB_BOTTOM_BOX }),
    def(topId, name, colors, { ...shared, boxes: SLAB_TOP_BOX, variantOf: bottomId }),
  ];
}

/**
 * 階段の向き。**水平の 4 面だけ**をこの順に 0..3 へ詰める。
 * 状態の番号は `向き * 2 + (上下反転 ? 1 : 0)` で、**0 が大元**（+X 向き・下付き）。
 */
const STAIR_FACINGS: readonly number[] = [FACE_XP, FACE_XN, FACE_ZP, FACE_ZN];
const STAIR_STATES = STAIR_FACINGS.length * 2;
/** 面番号 -> 上の並びでの添字。上下の面は階段の向きにならないので -1。 */
const STAIR_FACING_INDEX = new Int8Array([0, 1, -1, -1, 2, 3]);
/** `[大元の ID * 8 + 状態]` -> 実際に置くブロック。0 なら階段の大元ではない。 */
const STAIRS_BY_STATE = new Uint8Array(ID_LIMIT * STAIR_STATES);

/**
 * 階段の形。**下半分いっぱいのハーフ＋その上に半分ぶんの段**という 2 個の箱で、
 * `facing` の側が高くなる（歩いてくる人から見て、向こう側が高い）。
 * 上下反転版は y を入れ替えるだけ。
 */
function stairBoxes(facing: number, top: boolean): BoxList {
  const slab = top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const step = top ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1];
  const axis = facing < FACE_YP ? 0 : 2;
  if ((facing & 1) === 0) step[axis] = 0.5;
  else step[axis + 3] = 0.5;
  return [slab, step];
}

/**
 * 階段 1 材質ぶん（8 個）の定義。大元だけが `base`（1..63）で、
 * 残り 7 個は `firstVariant` から連番の 64 以降。名前もアイテムも大元に寄せる。
 */
function stairSet(
  base: number,
  firstVariant: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">>,
): BlockDef[] {
  const defs: BlockDef[] = [];
  for (let state = 0; state < STAIR_STATES; state++) {
    const id = state === 0 ? base : firstVariant + state - 1;
    STAIRS_BY_STATE[base * STAIR_STATES + state] = id;
    defs.push(
      def(id, name, colors, {
        ...opts,
        // 立方体でないので opaque は false。ただし屋根として空の光は止める（ハーフと同じ）
        opaque: false,
        blocksSky: true,
        model: "boxes",
        boxes: stairBoxes(STAIR_FACINGS[state >> 1], (state & 1) === 1),
        variantOf: state === 0 ? AIR : base,
      }),
    );
  }
  return defs;
}

export const BLOCKS: readonly BlockDef[] = [
  def(AIR, "Air", { top: 0x000000 }, { opaque: false, solid: false, alpha: 0, replaceable: true, sound: "none" }),
  def(GRASS, "草", { top: 0x6aa84f, side: 0x7a6444, bottom: 0x6b533a }, { hardness: 0.6, tool: "shovel", sound: "grass" }),
  def(DIRT, "土", { top: 0x6b533a }, { hardness: 0.5, tool: "shovel", sound: "dirt" }),
  def(STONE, "石", { top: 0x8a8f96 }, { hardness: 1.5, tool: "pickaxe", minTier: TIER_WOOD }),
  def(COBBLE, "丸石", { top: 0x767b82 }, { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD }),
  def(SAND, "砂", { top: 0xd8c99a }, { hardness: 0.5, tool: "shovel", sound: "sand" }),
  def(
    WATER,
    "水",
    { top: 0x2f6ec4 },
    // 水面より下を光源にしないことで、深いほど暗い水中になる
    {
      opaque: false,
      blocksSky: true,
      translucent: true,
      solid: false,
      replaceable: true,
      sound: "none",
      alpha: 0.72,
      hardness: UNBREAKABLE,
    },
  ),
  def(WOOD, "原木", { top: 0x8a6a3f, side: 0x5f4526 }, { hardness: 2, tool: "axe", sound: "wood" }),
  def(LEAVES, "葉", { top: 0x3f7a3a }, { hardness: 0.2, sound: "grass" }),
  def(SNOW, "雪", { top: 0xeef3f7, side: 0xdde5ec, bottom: 0x8a8f96 }, { hardness: 0.2, tool: "shovel", sound: "snow" }),
  def(PLANK, "板", { top: 0xb18a56 }, { hardness: 2, tool: "axe", sound: "wood" }),
  def(
    GLASS,
    "ガラス",
    { top: 0xa9d8e8 },
    { opaque: false, translucent: true, alpha: 0.3, hardness: 0.3, sound: "glass" },
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
    { hardness: 2.5, tool: "axe", sound: "wood" },
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
  def(SPRUCE_WOOD, "トウヒの原木", { top: 0x6b4f33, side: 0x3f2d1c }, { hardness: 2, tool: "axe", sound: "wood" }),
  def(SPRUCE_LEAVES, "トウヒの葉", { top: 0x2c5c3a }, { hardness: 0.2, sound: "grass" }),
  // 立方体より少し細いので、松明と同じ専用パスで描く。
  // opaque を true にすると、細いぶん隣の面が消えて地面が透けて見える。
  def(CACTUS, "サボテン", { top: 0x5c9b47, side: 0x4e8b3c, bottom: 0x3f7331 }, {
    opaque: false,
    hardness: 0.4,
    sound: "grass",
    model: "boxes",
    boxes: CACTUS_BOX,
    supportFace: FACE_YN,
  }),

  // 草むら。通り抜けられて、上にブロックを置けば消える（Minecraft と同じ）。
  // 立方体でないので opaque: false、薄いので空の光も止めない（blocksSky も false）。
  def(TALL_GRASS, "草むら", { top: 0x5e9c41 }, {
    opaque: false,
    solid: false,
    replaceable: true,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
  }),

  // 羊のドロップ。柔らかいので sound は "wool"（書き忘れると石の音がする）。
  def(WOOL, "羊毛", { top: 0xe8e4dc, side: 0xe2ded5, bottom: 0xd8d3c9 }, {
    hardness: 0.8,
    sound: "wool",
  }),

  // ハーフブロック。硬さと道具は元の材質に合わせる。
  ...slabPair(STONE_SLAB, STONE_SLAB_TOP, "石ハーフ", { top: 0x8a8f96 }, {
    hardness: 1.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  ...slabPair(COBBLE_SLAB, COBBLE_SLAB_TOP, "丸石ハーフ", { top: 0x767b82 }, {
    hardness: 2,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  ...slabPair(PLANK_SLAB, PLANK_SLAB_TOP, "板ハーフ", { top: 0xb18a56 }, {
    hardness: 2,
    tool: "axe",
    sound: "wood",
  }),
  ...slabPair(
    SANDSTONE_SLAB,
    SANDSTONE_SLAB_TOP,
    "砂岩ハーフ",
    { top: 0xd3c193, side: 0xc9b487, bottom: 0xbca877 },
    { hardness: 0.8, tool: "pickaxe", minTier: TIER_WOOD },
  ),

  // 階段。硬さと道具はハーフと同じで元の材質に合わせる。
  ...stairSet(STONE_STAIRS, FIRST_STAIR_VARIANT, "石の階段", { top: 0x8a8f96 }, {
    hardness: 1.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  ...stairSet(
    COBBLE_STAIRS,
    FIRST_STAIR_VARIANT + STAIR_VARIANTS_PER_MATERIAL,
    "丸石の階段",
    { top: 0x767b82 },
    { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD },
  ),
  ...stairSet(
    PLANK_STAIRS,
    FIRST_STAIR_VARIANT + STAIR_VARIANTS_PER_MATERIAL * 2,
    "板の階段",
    { top: 0xb18a56 },
    { hardness: 2, tool: "axe", sound: "wood" },
  ),
  ...stairSet(
    SANDSTONE_STAIRS,
    FIRST_STAIR_VARIANT + STAIR_VARIANTS_PER_MATERIAL * 3,
    "砂岩の階段",
    { top: 0xd3c193, side: 0xc9b487, bottom: 0xbca877 },
    { hardness: 0.8, tool: "pickaxe", minTier: TIER_WOOD },
  ),
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
  // 添字はブロック ID そのもの。向き違いの ID は 64 以降に飛ぶので、
  // 表は「定義の個数」ではなく **ID の上限**で確保する（以下の表も同じ）。
  const table = new Float32Array(ID_LIMIT * 6 * 3);
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
  return "#" + blockDef(id).top.toString(16).padStart(6, "0");
}

/**
 * 判定は 1 チャンクあたり数万回走るので、オブジェクトのプロパティではなく
 * 添字 1 回で引ける表にしておく。
 */
const OPAQUE = new Uint8Array(ID_LIMIT);
/** 1 = このブロックがあると、その下は「空に露出している」とは見なさない。 */
export const SKY_BLOCKERS = new Uint8Array(ID_LIMIT);
const LIGHT_COST = new Uint8Array(ID_LIMIT);
/** ブロック自身が出す光。列の走査で 1 ボクセルごとに引くので、表にしておく。 */
export const EMISSION = new Uint8Array(ID_LIMIT);
/** 1 = greedy meshing の対象外（専用の形で描く）。 */
const PROP = new Uint8Array(ID_LIMIT);
const SUPPORT_FACE = new Int8Array(ID_LIMIT);
/** 1 = ここに置くと上書きされる（空気・水・草むら）。 */
const REPLACEABLE = new Uint8Array(ID_LIMIT);
const VARIANT_OF = new Uint8Array(ID_LIMIT);
/** ID から定義を引く表。ID が飛び飛びなので、BLOCKS の並びとは別に持つ。 */
const BY_ID: BlockDef[] = [];
for (const block of BLOCKS) {
  BY_ID[block.id] = block;
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  SKY_BLOCKERS[block.id] = block.blocksSky ? 1 : 0;
  LIGHT_COST[block.id] = block.id === WATER ? 3 : 1;
  EMISSION[block.id] = block.emission;
  PROP[block.id] = block.model === "cube" ? 0 : 1;
  SUPPORT_FACE[block.id] = block.supportFace;
  REPLACEABLE[block.id] = block.replaceable ? 1 : 0;
  VARIANT_OF[block.id] = block.variantOf;
}
// 定義の無い ID を引くと undefined が伝播して原因が遠くに出るので、ここで落とす
for (let id = 0; id < ID_LIMIT; id++) {
  if (BY_ID[id]) continue;
  BY_ID[id] = BY_ID[AIR];
}

/**
 * 下付きハーフ → 上付きハーフ。定義から引き出しているので、材質を足しても
 * ここに書き足す必要はない（`slabPair` が対で定義する）。
 */
const SLAB_TOP_BY_BOTTOM = new Uint8Array(ID_LIMIT);
for (const block of BLOCKS) {
  if (block.boxes === SLAB_TOP_BOX && block.variantOf !== AIR) {
    SLAB_TOP_BY_BOTTOM[block.variantOf] = block.id;
  }
}

/** ID から定義を引く。定義の無い ID は空気として扱う。 */
export function blockDef(id: number): BlockDef {
  return BY_ID[id] ?? BY_ID[AIR];
}

/**
 * ブロックの形。狙う判定（`raycast`）と、`model === "boxes"` の見た目に使う。
 * 空気は形を持たない。
 */
export function shapeBoxes(id: number): BoxList {
  return id === AIR ? NO_BOX : blockDef(id).boxes;
}

/**
 * ブロックの形を囲む箱 `[x0,y0,z0,x1,y1,z1]` を `out` に入れる。
 * 選択枠とひび割れの表示に使う（形の無いブロックは立方体として扱う）。
 */
export function shapeBounds(id: number, out: number[]): void {
  const boxes = shapeBoxes(id);
  if (boxes.length === 0) {
    out[0] = out[1] = out[2] = 0;
    out[3] = out[4] = out[5] = 1;
    return;
  }
  out[0] = out[1] = out[2] = 1;
  out[3] = out[4] = out[5] = 0;
  for (const box of boxes) {
    for (let a = 0; a < 3; a++) {
      if (box[a] < out[a]) out[a] = box[a];
      if (box[a + 3] > out[a + 3]) out[a + 3] = box[a + 3];
    }
  }
}

/** 当たり判定の箱。通り抜けられるブロック（水・松明・草）は空。 */
export function collisionBoxes(id: number): BoxList {
  const def = blockDef(id);
  return def.solid ? def.boxes : NO_BOX;
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

/**
 * そのマスにブロックを置いたとき、断らずに上書きしてよいか。
 * 空気・水と、草むらのような薄い植物がこれにあたる。
 */
export function isReplaceable(id: number): boolean {
  return REPLACEABLE[id] === 1;
}

export function blockModel(id: number): BlockModel {
  return blockDef(id).model;
}

/** 足音・破壊・設置の音の材質。実際の音作りは `sfx.ts`。 */
export function blockSound(id: number): SoundGroup {
  return blockDef(id).sound;
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

/**
 * `face` の側が平らに埋まっていて、松明などの支えになれるか。
 *
 * ハーフブロックは形の半分しか無いので、**下付きの上面には松明が付かない**
 * （上付きの上面と、床としての下面には付く）。立方体だけが 6 面とも支えになる。
 */
export function canSupport(id: number, face: number): boolean {
  const def = blockDef(id);
  if (!def.solid) return false;
  const axis = face >> 1;
  const positive = (face & 1) === 0;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  for (const box of def.boxes) {
    // その面がブロックの端まで達していて、面いっぱいに広がっていること
    if (positive ? box[axis + 3] < 1 : box[axis] > 0) continue;
    if (box[u] > 0 || box[u + 3] < 1 || box[v] > 0 || box[v + 3] < 1) continue;
    return true;
  }
  return false;
}

/** 置くときに向きが変わるブロックを決める材料。 */
export interface PlaceContext {
  /** 新しいマスから見て、支えになるブロックがある向き（面番号）。 */
  readonly support: number;
  /** 狙った点の、ブロック内での高さ 0..1。 */
  readonly hitY: number;
  /** 置く人が向いている水平の向き（面番号）。階段はこちら側が高くなる。 */
  readonly facing: number;
}

/**
 * ハーフ・階段の上下。上の面を叩けば下付き、下の面を叩けば上付き、
 * 横の面なら叩いた高さで決まる。**ハーフと階段で同じ規則にすること**
 * （片方だけ変えると、同じ操作なのに結果が違って混乱する）。
 */
function placedUpper(ctx: PlaceContext): boolean {
  if (ctx.support === FACE_YN) return false;
  if (ctx.support === FACE_YP) return true;
  return ctx.hitY > 0.5;
}

/** 見ている向き（`yaw`）を水平の面番号にまるめる。階段の向きを決めるのに使う。 */
export function faceFromYaw(yaw: number): number {
  // player.ts の前方ベクトルと同じ取り方
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return Math.abs(fx) > Math.abs(fz)
    ? fx > 0
      ? FACE_XP
      : FACE_XN
    : fz > 0
      ? FACE_ZP
      : FACE_ZN;
}

/** 実際に置くマスと、その向きを決める材料。 */
export interface PlaceSpot extends PlaceContext {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** `placeSpot()` に渡す「狙っているもの」。`RaycastHit` がそのまま当てはまる。 */
export interface PlaceAim {
  readonly id: number;
  readonly block: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly point: { readonly y: number };
}

/**
 * 狙っている面から、ブロックを置くマスと向きを決める。
 *
 * ふつうは狙ったブロックの隣（法線の側）だが、**草むらのように押しのけられる
 * ブロックを狙ったときは、そのマス自身に置く。** 隣に置くと、草が残ったまま
 * 横にブロックが生える。
 *
 * **判定はここに集約すること**（`main.ts` に書くと DOM 込みでしか確かめられない）。
 */
export function placeSpot(aim: PlaceAim, facing: number): PlaceSpot {
  if (isReplaceable(aim.id)) {
    // 支えは真下（草が生えていた地面）。狙った面をそのまま支えにすると、
    // 横から狙ったときに何も無い側を支えにしてしまう。
    return {
      x: aim.block.x,
      y: aim.block.y,
      z: aim.block.z,
      support: FACE_YN,
      hitY: 0,
      facing,
    };
  }
  return {
    x: aim.block.x + aim.normal.x,
    y: aim.block.y + aim.normal.y,
    z: aim.block.z + aim.normal.z,
    // 狙ったブロックは新しいマスから見て法線の逆側にある
    support: faceFromNormal(-aim.normal.x, -aim.normal.y, -aim.normal.z),
    hitY: aim.point.y - Math.floor(aim.point.y),
    facing,
  };
}

/**
 * 置き方で見た目が変わるブロックの、実際に置く ID。置けないなら `AIR`。
 *
 * **置き方の判定はここに集約すること**（`main.ts` に散らすと、
 * 置く側と壊す側で条件が食い違っても気付けない）。
 */
export function placedVariant(base: number, ctx: PlaceContext): number {
  if (base === TORCH) return torchVariant(ctx.support);
  const upper = SLAB_TOP_BY_BOTTOM[base];
  if (upper !== AIR) return placedUpper(ctx) ? upper : base;
  // 状態 0 には大元自身が入っているので、これで「階段の大元か」が分かる
  if (STAIRS_BY_STATE[base * STAIR_STATES] === base) {
    const index = STAIR_FACING_INDEX[ctx.facing];
    // 置く人が向いている側が高くなる（歩いてきてそのまま登れる向き）
    const state = (index < 0 ? 0 : index) * 2 + (placedUpper(ctx) ? 1 : 0);
    return STAIRS_BY_STATE[base * STAIR_STATES + state];
  }
  return base;
}

export function isTranslucent(id: number): boolean {
  return blockDef(id).translucent;
}

export function isSolid(id: number): boolean {
  return blockDef(id).solid;
}

export function blockName(id: number): string {
  return blockDef(id).name;
}

export function blockHardness(id: number): number {
  return blockDef(id).hardness;
}

export function blockTool(id: number): ToolKind | null {
  return blockDef(id).tool;
}

export function blockMinTier(id: number): number {
  return blockDef(id).minTier;
}

/** 壊せるか。水と岩盤は掘れない。 */
export function isBreakable(id: number): boolean {
  return id !== AIR && Number.isFinite(blockDef(id).hardness);
}
