import {
  BED,
  CHEST,
  COBBLE,
  COBBLE_SLAB,
  COBBLE_STAIRS,
  CRAFTING_TABLE,
  FURNACE,
  PLANK,
  PLANK_SLAB,
  PLANK_STAIRS,
  SANDSTONE,
  SANDSTONE_SLAB,
  SANDSTONE_STAIRS,
  SPRUCE_WOOD,
  STONE,
  STONE_SLAB,
  STONE_STAIRS,
  TORCH,
  WOOD,
  WOOL,
} from "./blocks";
import { isEmpty, type Slot } from "./inventory";
import {
  ARROW,
  BLAZE_POWDER,
  BLAZE_ROD,
  BOW,
  BREAD,
  BUCKET,
  COAL,
  DIAMOND,
  DIAMOND_AXE,
  DIAMOND_HOE,
  DIAMOND_PICKAXE,
  DIAMOND_SHOVEL,
  DIAMOND_SWORD,
  ENDER_EYE,
  ENDER_PEARL,
  FEATHER,
  FLINT,
  FLINT_AND_STEEL,
  IRON_AXE,
  IRON_HOE,
  IRON_INGOT,
  IRON_PICKAXE,
  IRON_SHOVEL,
  IRON_SWORD,
  NO_ITEM,
  SHEARS,
  STICK,
  STONE_AXE,
  STONE_HOE,
  STONE_PICKAXE,
  STONE_SHOVEL,
  STONE_SWORD,
  STRING,
  WHEAT,
  WOOD_AXE,
  WOOD_HOE,
  WOOD_PICKAXE,
  WOOD_SHOVEL,
  WOOD_SWORD,
} from "./items";

export interface Recipe {
  readonly name: string;
  readonly out: number;
  readonly count: number;
  /**
   * 形あり: 行ごとの文字列。空きは "."。左右反転しても成立する（Minecraft と同じ）。
   * 形なし: undefined で、ingredients だけを見る。
   */
  readonly shape?: readonly string[];
  readonly key?: Readonly<Record<string, number>>;
  /** 形なしレシピの材料。 */
  readonly ingredients?: readonly number[];
}

/**
 * クラフトの表。**焼いて作るものはここに置かないこと**（`smelting.ts` の仕事）。
 * かまどが無かった頃は砂 4 個 → ガラスを代用で置いていたが、精錬が入ったので外した。
 */
export const RECIPES: readonly Recipe[] = [
  { name: "板", out: PLANK, count: 4, ingredients: [WOOD] },
  // 針葉樹林から始めても詰まないように、トウヒの原木からも板が作れる
  { name: "板", out: PLANK, count: 4, ingredients: [SPRUCE_WOOD] },
  { name: "棒", out: STICK, count: 4, shape: ["P", "P"], key: { P: PLANK } },
  {
    name: "作業台",
    out: CRAFTING_TABLE,
    count: 1,
    shape: ["PP", "PP"],
    key: { P: PLANK },
  },
  // 石炭を棒の上に。1 列なので 2x2 でも作れる（Minecraft と同じ）。
  { name: "松明", out: TORCH, count: 4, shape: ["C", "S"], key: { C: COAL, S: STICK } },

  // かまどは丸石 8 個の輪（Minecraft と同じ）。3x3 なので作業台が要る。
  { name: "かまど", out: FURNACE, count: 1, shape: ["CCC", "C.C", "CCC"], key: { C: COBBLE } },

  // チェストは板 8 個の輪（Minecraft と同じ）。かまどと同じ形で、材料だけが違う。
  { name: "チェスト", out: CHEST, count: 1, shape: ["PPP", "P.P", "PPP"], key: { P: PLANK } },

  // ベッドは羊毛 3 + 板 3（Minecraft と同じ）。**羊毛は羊を倒すしか手が無い**ので、
  // 「羊を 3 匹ぶん探す」がそのままリスポーン地点への道のりになる。
  { name: "ベッド", out: BED, count: 1, shape: ["WWW", "PPP"], key: { W: WOOL, P: PLANK } },

  // ハーフブロックは横 3 列から 6 個（Minecraft と同じ）。3 列なので作業台が要る。
  slabRecipe("石", STONE, STONE_SLAB),
  slabRecipe("丸石", COBBLE, COBBLE_SLAB),
  slabRecipe("板", PLANK, PLANK_SLAB),
  slabRecipe("砂岩", SANDSTONE, SANDSTONE_SLAB),

  // 階段は 6 個から 4 個（Minecraft と同じで、少し目減りする）。
  stairRecipe("石", STONE, STONE_STAIRS),
  stairRecipe("丸石", COBBLE, COBBLE_STAIRS),
  stairRecipe("板", PLANK, PLANK_STAIRS),
  stairRecipe("砂岩", SANDSTONE, SANDSTONE_STAIRS),

  // バケツは鉄 3 個の V 字（Minecraft と同じ）。**これが黒曜石への入口**で、
  // 水を汲んで溶岩に流すところから始まる。左右対称なので反転しても同じ形。
  { name: "バケツ", out: BUCKET, count: 1, shape: ["I.I", ".I."], key: { I: IRON_INGOT } },

  // 火打石と打ち金は鉄インゴット + 火打石の**形なし**（Minecraft も形なし）。
  // **これがネザーポータルの点火手段**で、黒曜石の枠を組んだあとに要る。
  {
    name: "火打石と打ち金",
    out: FLINT_AND_STEEL,
    count: 1,
    ingredients: [IRON_INGOT, FLINT],
  },

  // ブレイズロッド 1 本 → ブレイズパウダー 2 個（Minecraft と同じ形なし）。
  // **2 個に増えるのが効いている** —— エンドポータルに要るアイ 12 個が
  // ロッド 6 本ぶんで足りるので、要塞に何度も通わずに済む。
  { name: "ブレイズパウダー", out: BLAZE_POWDER, count: 2, ingredients: [BLAZE_ROD] },

  // エンダーアイはパウダー + パールの**形なし**（Minecraft も形なし）。
  // **ここでクリア導線が合流する** —— ネザー要塞（ロッド）と夜の地表（パール）の
  // 両方を通らないと 1 個も作れない。**ロッドから直接作れる形を足さないこと**
  // （パウダーの 1 → 2 が消えて、要塞に通う回数が倍になる）。
  { name: "エンダーアイ", out: ENDER_EYE, count: 1, ingredients: [BLAZE_POWDER, ENDER_PEARL] },

  // 弓は棒 3 + 糸 3（**本家と同じ材料・形・並び**）。**糸はクモしか落とさない**ので、
  // 「クモを 3 匹倒す」がそのまま弓への道のりになる（羊毛の代用だった頃と違い、
  // ベッドと材料を取り合わない）。左右反転でも作れる。
  { name: "弓", out: BOW, count: 1, shape: [".SW", "S.W", ".SW"], key: { S: STICK, W: STRING } },

  // 矢は火打石 + 棒 + 羽根で 4 本（**本家と同じ形と並び**。羽根は鶏から出る）。
  // **3 段になったので作業台が要ります** —— 弓を持って出たまま作り足すことは
  // もうできません（本家の形に戻すのが目的。手触りの話は `TUNING.md`）。
  {
    name: "矢",
    out: ARROW,
    count: 4,
    shape: ["F", "S", "E"],
    key: { F: FLINT, S: STICK, E: FEATHER },
  },

  // シアーズは鉄 2 個の斜め（Minecraft と同じ）。2x2 に収まるので**作業台が要らない**
  // —— 羊を見つけた場所で作り足せる。左右反転でも作れる。
  { name: "シアーズ", out: SHEARS, count: 1, shape: [".I", "I."], key: { I: IRON_INGOT } },

  // パンは小麦 3 個の横一列（Minecraft と同じ）。**3 幅なので作業台が要る** ——
  // 畑を作ってから食べられるようになるまでに、作業台の前へ戻る一手間が残る。
  // ハーフの `["MMM"]` と形は同じだが材料が違うので、形の重複にはならない。
  { name: "パン", out: BREAD, count: 1, shape: ["WWW"], key: { W: WHEAT } },

  ...toolRecipes("木", PLANK, WOOD_PICKAXE, WOOD_AXE, WOOD_SHOVEL, WOOD_SWORD, WOOD_HOE),
  ...toolRecipes("石", COBBLE, STONE_PICKAXE, STONE_AXE, STONE_SHOVEL, STONE_SWORD, STONE_HOE),
  ...toolRecipes("鉄", IRON_INGOT, IRON_PICKAXE, IRON_AXE, IRON_SHOVEL, IRON_SWORD, IRON_HOE),
  ...toolRecipes(
    "ダイヤ",
    DIAMOND,
    DIAMOND_PICKAXE,
    DIAMOND_AXE,
    DIAMOND_SHOVEL,
    DIAMOND_SWORD,
    DIAMOND_HOE,
  ),
];

/** ハーフはどの材質も形が同じで、材料だけが変わる。 */
function slabRecipe(name: string, material: number, slab: number): Recipe {
  return { name: `${name}ハーフ`, out: slab, count: 6, shape: ["MMM"], key: { M: material } };
}

/**
 * 階段もどの材質も形が同じ。左右反転を受け付けるので、
 * 逆向きの段々（`["..M", ".MM", "MMM"]`）でも作れる。
 */
function stairRecipe(name: string, material: number, stairs: number): Recipe {
  return {
    name: `${name}の階段`,
    out: stairs,
    count: 4,
    shape: ["M..", "MM.", "MMM"],
    key: { M: material },
  };
}

/**
 * 道具 5 種はどの階層も形が同じで、材料だけが変わる。
 *
 * **剣は材料 2 個 + 棒 1 の縦 3**（Minecraft と同じ）。シャベル（材料 1 + 棒 2）と
 * 上下 1 マスしか違わないので、**片方の形を変えるときは
 * `test/crafting.test.ts` の「同じ形のレシピが重複していない」を必ず見ること。**
 * **クワは材料 2 個を横に並べて棒を縦 2**（Minecraft と同じ。斧と上段は同じだが、
 * 下 2 段が棒だけなので別の形になる）。どれも 3 行あるので 2x2 では作れない（作業台が要る）。
 */
function toolRecipes(
  tier: string,
  material: number,
  pickaxe: number,
  axe: number,
  shovel: number,
  sword: number,
  hoe: number,
): Recipe[] {
  const key = { M: material, S: STICK };
  return [
    { name: `${tier}のツルハシ`, out: pickaxe, count: 1, shape: ["MMM", ".S.", ".S."], key },
    { name: `${tier}の斧`, out: axe, count: 1, shape: ["MM.", "MS.", ".S."], key },
    { name: `${tier}のシャベル`, out: shovel, count: 1, shape: ["M", "S", "S"], key },
    { name: `${tier}の剣`, out: sword, count: 1, shape: ["M", "M", "S"], key },
    { name: `${tier}のクワ`, out: hoe, count: 1, shape: ["MM.", ".S.", ".S."], key },
  ];
}

interface Trimmed {
  items: number[];
  width: number;
  height: number;
}

/**
 * 空の行・列を落として、中身だけの長方形にする。
 * **盤面とレシピの両方に掛けること。** レシピ側を掛け忘れると、
 * 斧のように右端が空いた形が永久に一致しなくなる。
 */
function trim(items: readonly number[], width: number, height: number): Trimmed | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (items[y * width + x] === NO_ITEM) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.push(items[(y + minY) * width + (x + minX)]);
  }
  return { items: out, width: w, height: h };
}

function gridItems(grid: readonly Slot[], size: number): number[] {
  return Array.from({ length: size * size }, (_, i) =>
    isEmpty(grid[i]) ? NO_ITEM : grid[i].item,
  );
}

function shapeItems(recipe: Recipe): number[] {
  const shape = recipe.shape as readonly string[];
  const width = Math.max(...shape.map((row) => row.length));
  const items: number[] = [];
  for (const row of shape) {
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? ".";
      items.push(ch === "." ? NO_ITEM : (recipe.key?.[ch] ?? NO_ITEM));
    }
  }
  return items;
}

function mirror(shape: Trimmed): Trimmed {
  const items: number[] = [];
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      items.push(shape.items[y * shape.width + (shape.width - 1 - x)]);
    }
  }
  return { items, width: shape.width, height: shape.height };
}

function sameShape(a: Trimmed, b: Trimmed): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.items.length; i++) if (a.items[i] !== b.items[i]) return false;
  return true;
}

/**
 * 形ありレシピを、そのまま／左右反転の 2 通り（同じなら 1 通り）に展開しておく。
 * Minecraft と同じで、斧のような左右非対称の形はどちらの向きでも作れる。
 */
const PREPARED = RECIPES.filter((recipe) => recipe.shape).map((recipe) => {
  const shape = recipe.shape as readonly string[];
  const width = Math.max(...shape.map((row) => row.length));
  const base = trim(shapeItems(recipe), width, shape.length);
  const shapes: Trimmed[] = [];
  if (base) {
    shapes.push(base);
    const flipped = mirror(base);
    if (!sameShape(base, flipped)) shapes.push(flipped);
  }
  return { recipe, shapes };
});

function matchesShapeless(recipe: Recipe, grid: readonly Slot[]): boolean {
  const need = [...(recipe.ingredients ?? [])];
  const have: number[] = [];
  for (const slot of grid) {
    if (isEmpty(slot)) continue;
    // 形なしレシピは 1 スロット 1 個だけを見る（2 個積んでも 1 回分）
    have.push(slot.item);
  }
  if (have.length !== need.length) return false;
  for (const item of have) {
    const at = need.indexOf(item);
    if (at < 0) return false;
    need.splice(at, 1);
  }
  return need.length === 0;
}

/**
 * 盤面に合うレシピを探す。size は 2（手持ち）か 3（作業台）。
 * 形ありレシピは空の行・列を落としてから比べるので、盤面のどこに置いても揃う。
 */
export function findRecipe(grid: readonly Slot[], size: number): Recipe | null {
  const placed = trim(gridItems(grid, size), size, size);
  if (!placed) return null;

  for (const recipe of RECIPES) {
    if (recipe.shape) continue;
    if (matchesShapeless(recipe, grid)) return recipe;
  }
  for (const { recipe, shapes } of PREPARED) {
    for (const shape of shapes) {
      if (shape.width > size || shape.height > size) continue;
      if (sameShape(placed, shape)) return recipe;
    }
  }
  return null;
}

/** レシピが要求する数だけ盤面から取り除く（1 スロットにつき 1 個）。 */
export function consumeGrid(grid: Slot[]): void {
  for (const slot of grid) {
    if (isEmpty(slot)) continue;
    slot.count -= 1;
    if (slot.count <= 0) {
      slot.item = NO_ITEM;
      slot.count = 0;
    }
  }
}
