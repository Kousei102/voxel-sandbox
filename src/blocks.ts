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
 * かまど。燃えている間だけ別 ID（`FURNACE_LIT`）に差し替えて、光らせる。
 *
 * **点火中の版も 1..63 に置くこと。** 立方体なので greedy の統合キー（`encodeFace` の
 * id 6 ビット）を通ります。64 以降は `isProp()` が true の向き違いだけの枠です。
 *
 * `variantOf` を `FURNACE` にしてあるので、**アイテムもドロップも名前も消えたかまどに揃います**
 * （松明の壁掛け版とまったく同じ仕掛け。点火中のかまどを掘っても、出るのはかまど 1 個）。
 */
export const FURNACE = 38;
export const FURNACE_LIT = 39;

/**
 * チェスト。**「位置ごとに状態を持つブロック」の 2 つ目**で、中身は `chests.ts` が
 * 位置ごとに持つ（ボクセルにはメタデータを持たせない）。
 *
 * かまどと違って**状態違いの ID を持たない** —— 開いているかどうかは画面の話で、
 * 見た目が変わらないため。だから 1..63 を 1 個しか使わない。
 */
export const CHEST = 40;

/**
 * ベッド。**1 個のブロックが 2 マスにまたがる初めての例**で、
 * 足側（赤い布）と枕側（白）の 2 ブロックで 1 台になる。
 *
 * 分けてあるのは `BlockDef` が面ごとに 3 色（上面・側面・下面）しか持てないからで、
 * **枕を白くできるのは 2 マスに分けたときだけ。** 状態の詰め方は階段とまったく同じで、
 * 大元（足側・+X 向き）だけが 1..63 に居て、残り 7 つは 64 以降。
 *
 * 2 マスが必ず揃っていることを保つのは `beds.ts`（置く・壊す・支えを失う の 3 経路）。
 * ここが持つのは**相方がどこに・どの ID で居るべきか**という形の話だけ。
 */
export const BED = 41;

/**
 * 溶岩。**水（`WATER`）とほとんど同じ作り**で、違うのは自分で光ることだけ。
 *
 * 半透明レイヤーに置いてある（`translucent: true`）のは、**中に入ったときに
 * 分かるようにするため。** 不透明にすると、溶岩の中からは裏面カリングで面が消えて
 * 世界がそのまま見えてしまい、浸かっていることが画面から分からない。
 *
 * `replaceable: true` なのも水と同じ。ここにブロックを置けないと、
 * 溶岩を埋めて渡ることも、黒曜石を作ることもできない。
 *
 * **ダメージはここには無い**（`vitals.ts` の仕事）。
 */
export const LAVA = 42;

/**
 * 黒曜石。**ネザーへの入口**で、水に触れた溶岩が固まってできる（規則は下の `quenched()`）。
 *
 * `minTier: TIER_DIAMOND` なので、**ダイヤのツルハシでしか持ち帰れない。**
 * 鉄のツルハシでも掘れて（速くなって）しまうが、何も落ちずに消える ——
 * これは `mining.ts` の既存の規則そのままで、ここに特例は書かない。
 *
 * 硬さは Minecraft と同じ 50。ダイヤのツルハシ（速さ 8）で
 * `50 * 1.5 / 8 ≒ 9.4 秒`かかる。**この遅さが「準備してから行く場所」の手触りを作る。**
 */
export const OBSIDIAN = 43;

/**
 * 砂利。**火打石の出どころ**で、掘ると 10% で火打石が出る（表は `items.ts` の `DROPS`）。
 *
 * 火打石が要るのは**火打石と打ち金 = ネザーポータルの点火**だけなので、
 * これが無いと黒曜石の枠を組んでも火が付かない。
 *
 * **落ちません。** Minecraft の砂利は支えを失うと落下するが、この世界には
 * 落ちるブロックの仕組みがまだ無い（`supportFace` は「支えが消えたら壊れる」であって、
 * 落下ではない）。掘った下の砂利はその場に浮いたまま残る。
 */
export const GRAVEL = 44;

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

/**
 * ベッドの向き違い。**足側 4 向き + 枕側 4 向きで 8 通り**あり、大元（足側・+X）だけが
 * 1..63 に居るので、ここから 7 個を連番で取る。個別に名前は付けない
 * （引くのは `placedVariant()` と `bedPartner()`）。
 */
const FIRST_BED_VARIANT = 96;

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
/**
 * ベッドの高さ。本家と同じ 9/16。**`PLAYER_SIZE.step`（0.6）より低いこと** ——
 * 超えると歩いて乗れなくなり、寝床の縁で跳ばされる。
 * リスポーン位置（ベッドの上に立たせる）でも使うので export してある。
 */
export const BED_HEIGHT = 0.5625;
export const BED_BOX: BoxList = [[0, 0, 0, 1, BED_HEIGHT, 1]];

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
  /**
   * 液体（水・溶岩）。**この 1 つで 3 か所の振る舞いが決まる。**
   *
   * - 狙う光線が素通りする（`raycast.ts`）—— だから溶岩湖の向こうを狙うと
   *   **底の石の上に置かれる**。素通りしないと、手前の溶岩そのものが置き場になる
   * - 支えが要るブロック（松明）を差し込めない（`main.ts`）
   * - 頭が浸かるとフォグが掛かる（下の `fog`）
   *
   * **`id === WATER` と書かないこと。** 3 か所に散らすと、液体を足したときに
   * 必ずどれか 1 つを忘れる（実際、溶岩を足したときに 3 つとも忘れていた）。
   */
  readonly liquid: boolean;
  /**
   * 浸かると焼ける液体（溶岩）。**`id === LAVA` と書かないこと** ——
   * 焼けるかどうかを見る場所はプレイヤー・モブ・（この先の）ネザーの生き物と
   * 増えていくので、`liquid` と同じく表 1 本に聞く。
   * どれだけ焼けるかは持たない（数値は `vitals.ts` / `mobs.ts` のもの）。
   */
  readonly hot: boolean;
  /** 頭が浸かったときのフォグ。液体だけが持つ。 */
  readonly fog: LiquidFog | null;
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

/**
 * 液体に頭まで浸かったときのフォグ。**数値をここに置くのは、`main.ts` を配線のままに
 * 保つため**（`main.ts` は「頭がどのブロックの中か」を引いて、この値を貼るだけ）。
 */
export interface LiquidFog {
  readonly color: number;
  readonly near: number;
  readonly far: number;
  /**
   * 昼夜の明るさを掛けるか。**水は掛ける**（夜の水中は暗い）が、
   * **溶岩は掛けない** —— 自分で光っているので、夜に暗くなるとおかしい。
   */
  readonly daylit: boolean;
}

/** 壊せないブロックの硬さ。 */
const UNBREAKABLE = Number.POSITIVE_INFINITY;

/** 松明の明るさ。Minecraft と同じ 14（自分のマスが 14 で、そこから 1 ずつ減る）。 */
export const TORCH_LIGHT = 14;

/**
 * 溶岩の明るさ。Minecraft と同じ 15（`MAX_LIGHT` と同じで、これ以上は無い）。
 * **松明より明るい**ので、溶岩の見える洞窟は松明を持たずに歩ける。
 */
export const LAVA_LIGHT = 15;

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
    liquid: opts.liquid ?? false,
    hot: opts.hot ?? false,
    fog: opts.fog ?? null,
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
 * 置く向きになれる**水平の 4 面だけ**をこの順に 0..3 へ詰めたもの。
 * **階段とベッドで共有する**（同じ表を 2 か所に書くと、片方だけ並べ替えたときに
 * 「階段は合っているのにベッドだけ向きが逆」という形で静かに壊れる）。
 *
 * 状態の番号はどちらも `向きの添字 * 2 + (もう 1 ビット)` で、**0 が大元**。
 * もう 1 ビットの意味は階段が「上下反転」、ベッドが「枕側」。
 */
const HORIZONTAL_FACINGS: readonly number[] = [FACE_XP, FACE_XN, FACE_ZP, FACE_ZN];
/** 面番号 -> 上の並びでの添字。上下の面は置く向きにならないので -1。 */
const HORIZONTAL_FACING_INDEX = new Int8Array([0, 1, -1, -1, 2, 3]);
/** 水平の向きから、その向きへ 1 マス進むずれ。添字は上の並びと同じ。 */
const HORIZONTAL_STEP: readonly (readonly number[])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const STAIR_STATES = HORIZONTAL_FACINGS.length * 2;
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
        boxes: stairBoxes(HORIZONTAL_FACINGS[state >> 1], (state & 1) === 1),
        variantOf: state === 0 ? AIR : base,
      }),
    );
  }
  return defs;
}

/**
 * ベッドの状態の数（足側 4 向き + 枕側 4 向き）。
 * 状態の番号は `向きの添字 * 2 + (枕側 ? 1 : 0)` で、**0 が大元**（足側・+X 向き）。
 */
const BED_STATES = HORIZONTAL_FACINGS.length * 2;
/** `[状態]` -> 実際のブロック ID。大元が 1 個で、残り 7 個は 64 以降。 */
const BEDS_BY_STATE = new Uint8Array(BED_STATES);
/** ブロック ID -> ベッドの状態。ベッドでなければ -1。 */
const BED_STATE_OF = new Int8Array(ID_LIMIT).fill(-1);

/**
 * ベッド 1 台ぶん（8 個）の定義。**足側と枕側で色だけが違う。**
 *
 * 枕側は全部 `variantOf: BED` なので、アイテム・ドロップ・名前は「ベッド」1 つに揃う
 * （壁掛け松明・点火中のかまどとまったく同じ仕掛け）。
 *
 * `supportFace: FACE_YN` にしてあるので、**床が要ることと、床が消えたら壊れることは
 * `world.canPlaceAt` / `breakUnsupported` がそのまま面倒を見る。** 2 マスが揃っている
 * ことだけを `beds.ts` が保つ。
 */
function bedSet(
  foot: { top: number; side?: number; bottom?: number },
  head: { top: number; side?: number; bottom?: number },
): BlockDef[] {
  const shared = {
    hardness: 0.2,
    // 柔らかいので "wool"。書き忘れると石の音がする
    sound: "wool" as const,
    // 立方体でないので opaque は false。**屋根材ではないので blocksSky は既定の false**
    // （止めても見えるところは変わらず、崖の縁で下のマスが暗くなるだけ損をする）
    opaque: false,
    solid: true,
    model: "boxes" as const,
    boxes: BED_BOX,
    supportFace: FACE_YN,
  };
  const defs: BlockDef[] = [];
  for (let state = 0; state < BED_STATES; state++) {
    const id = state === 0 ? BED : FIRST_BED_VARIANT + state - 1;
    BEDS_BY_STATE[state] = id;
    BED_STATE_OF[id] = state;
    defs.push(
      def(id, "ベッド", (state & 1) === 1 ? head : foot, {
        ...shared,
        variantOf: state === 0 ? AIR : BED,
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
      liquid: true,
      // 22 マス先まで見える。夜は暗くなる（daylit）。
      fog: { color: 0x1b4f8c, near: 0.1, far: 22, daylit: true },
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

  // かまど。上面に石の縁、側面が焚口。点火中は側面を炎の色にして emission を持たせる。
  // **色を変えるだけで済むのは、面ごとに色を持てる（top / side / bottom）から。**
  def(FURNACE, "かまど", { top: 0x74736e, side: 0x5d5c58, bottom: 0x6a6964 }, {
    hardness: 3.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  def(FURNACE_LIT, "かまど", { top: 0x74736e, side: 0xd8863a, bottom: 0x6a6964 }, {
    hardness: 3.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
    // 松明（14）より少し暗い。かまどだけで洞窟を照らし切らない程度。
    emission: 13,
    variantOf: FURNACE,
  }),

  // チェスト。木なので斧が適正で、音も "wood"（既定の "stone" のままだと
  // 木の箱から石の音がする）。上面だけ留め金の色を明るくして、向きが無くても
  // 「上から開ける物」に見えるようにしてある。
  def(CHEST, "チェスト", { top: 0xa9803f, side: 0x8a6631, bottom: 0x6f5227 }, {
    hardness: 2.5,
    tool: "axe",
    sound: "wood",
  }),

  // ベッド。足側は赤い布に木の縁、枕側は白。**上面の色で足と枕を見分ける**ので、
  // 側面もそれぞれに寄せてある（上から見ても横から見ても向きが分かる）。
  ...bedSet(
    { top: 0xa8322c, side: 0x8c2a25, bottom: 0x8a6a3f },
    { top: 0xecebe4, side: 0xd8d5cb, bottom: 0x8a6a3f },
  ),

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

  // 溶岩。水と同じ半透明の液体で、違うのは自分で光ること（`emission`）だけ。
  // 光は昼夜に影響されない系統なので、洞窟の底でも夜でも同じ明るさで照らす。
  def(
    LAVA,
    "溶岩",
    { top: 0xe0601a, side: 0xc24d0f, bottom: 0xa63f0b },
    {
      opaque: false,
      blocksSky: true,
      translucent: true,
      solid: false,
      replaceable: true,
      sound: "none",
      alpha: 0.94,
      hardness: UNBREAKABLE,
      emission: LAVA_LIGHT,
      liquid: true,
      hot: true,
      // **水よりずっと濃く、昼夜で暗くならない。** 溶岩に浸かったことが
      // 画面から分からないと、ダメージだけ食らって理由が分からない。
      fog: { color: 0xd4551a, near: 0.05, far: 2.2, daylit: false },
    },
  ),
  // 黒曜石。**普通の立方体で、特別なのは硬さと階層だけ。**
  def(
    OBSIDIAN,
    "黒曜石",
    { top: 0x231a33, side: 0x1b1428, bottom: 0x140f1e },
    { hardness: 50, tool: "pickaxe", minTier: TIER_DIAMOND },
  ),
  // 砂利。**シャベルで掘る立方体で、特別なのは落とすものだけ**（`items.ts` の `DROPS`）。
  // 音は砂と同じ粒の音にしてある（専用の材質グループは作っていない）。
  def(
    GRAVEL,
    "砂利",
    { top: 0x8d8580, side: 0x847c77, bottom: 0x7b736e },
    { hardness: 0.6, tool: "shovel", sound: "sand" },
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
/** 1 = 液体。狙う光線が 1 ボクセルごとに引くので表にしておく。 */
const LIQUID = new Uint8Array(ID_LIMIT);
/** 1 = 浸かると焼ける液体。プレイヤーもモブも毎フレーム引く。 */
const HOT = new Uint8Array(ID_LIMIT);
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
  LIQUID[block.id] = block.liquid ? 1 : 0;
  HOT[block.id] = block.hot ? 1 : 0;
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

/**
 * 液体か（水・溶岩）。**狙う側（`raycast.ts`）と置く側（`main.ts`）と
 * フォグ（`main.ts`）が同じこれを見ること。**
 *
 * 素通りさせるのが肝心で、これが効いていないと**液体の向こうを狙ったときに
 * 手前の液体そのものが置き場になる**（底の地面の上に置かれない）。
 */
export function isLiquid(id: number): boolean {
  return LIQUID[id] === 1;
}

/**
 * 浸かると焼ける液体か（溶岩）。**プレイヤーもモブも同じこれを見ること。**
 * どれだけ焼けるかは持たない —— 数値は `vitals.ts`（プレイヤー）と
 * `mobs.ts`（モブ）がそれぞれ持つ。
 */
export function isHotLiquid(id: number): boolean {
  return HOT[id] === 1;
}

/**
 * 冷たい液体に触れた熱い液体は固まるか。**触れた側（`id`）が何になるかを返し、
 * 何も起きないなら `id` をそのまま返す。**
 *
 * **表に聞くだけで、どちらが水でどちらが溶岩かは書かない**（`id === LAVA` と
 * 書き始めると、液体を足したときに必ず片方を忘れる）。「熱い液体 + 熱くない液体」で
 * 決めているので、あとから冷たい液体が増えてもこの 1 行のままでよい。
 *
 * **この関数は座標を知らない。** どのマスに効くか（置いたマス自身と隣の 6 マス）は
 * `liquids.ts` の仕事で、`main.ts` は呼ぶだけ。
 */
export function quenched(id: number, neighbour: number): number {
  const cools = isLiquid(neighbour) && !isHotLiquid(neighbour);
  return isHotLiquid(id) && cools ? OBSIDIAN : id;
}

/** 頭がそのブロックの中にあるときのフォグ。液体でなければ null。 */
export function liquidFog(id: number): LiquidFog | null {
  return blockDef(id).fog;
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
  // ベッドは置く人が向いている先が枕になるので、**クリックしたマスは必ず足側**。
  // 上下の反転は無いので `placedUpper()` は通さない。
  if (base === BED) {
    const index = HORIZONTAL_FACING_INDEX[ctx.facing];
    return BEDS_BY_STATE[(index < 0 ? 0 : index) * 2];
  }
  const upper = SLAB_TOP_BY_BOTTOM[base];
  if (upper !== AIR) return placedUpper(ctx) ? upper : base;
  // 状態 0 には大元自身が入っているので、これで「階段の大元か」が分かる
  if (STAIRS_BY_STATE[base * STAIR_STATES] === base) {
    const index = HORIZONTAL_FACING_INDEX[ctx.facing];
    // 置く人が向いている側が高くなる（歩いてきてそのまま登れる向き）
    const state = (index < 0 ? 0 : index) * 2 + (placedUpper(ctx) ? 1 : 0);
    return STAIRS_BY_STATE[base * STAIR_STATES + state];
  }
  return base;
}

/** ベッドの半分（足側でも枕側でも）か。 */
export function isBed(id: number): boolean {
  return BED_STATE_OF[id] >= 0;
}

/** ベッドの枕側か。足側と AIR は false。 */
export function isBedHead(id: number): boolean {
  const state = BED_STATE_OF[id];
  return state >= 0 && (state & 1) === 1;
}

/**
 * ベッドのもう半分が**どこに・どの ID で**居るべきか。ベッドでなければ null。
 *
 * 足側なら向いている先に枕、枕側ならその逆に足。**不変条件は「相方の相方は自分」**
 * （テストで固定してある）。2 マスを揃えて置く・壊すのは `beds.ts` の仕事で、
 * ここが持つのは形の話だけ。
 */
export function bedPartner(id: number): { dx: number; dz: number; id: number } | null {
  const state = BED_STATE_OF[id];
  if (state < 0) return null;
  const head = (state & 1) === 1;
  const [sx, sz] = HORIZONTAL_STEP[state >> 1];
  // 足側から見て向いている先が枕。枕側から見れば逆向きに足がある。
  const sign = head ? -1 : 1;
  return { dx: sx * sign, dz: sz * sign, id: BEDS_BY_STATE[state ^ 1] };
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
