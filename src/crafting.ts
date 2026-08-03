import { COBBLE, CRAFTING_TABLE, GLASS, PLANK, SAND, SPRUCE_WOOD, TORCH, WOOD } from "./blocks";
import { isEmpty, type Slot } from "./inventory";
import {
  COAL,
  DIAMOND,
  DIAMOND_AXE,
  DIAMOND_PICKAXE,
  DIAMOND_SHOVEL,
  IRON_AXE,
  IRON_INGOT,
  IRON_PICKAXE,
  IRON_SHOVEL,
  NO_ITEM,
  STICK,
  STONE_AXE,
  STONE_PICKAXE,
  STONE_SHOVEL,
  WOOD_AXE,
  WOOD_PICKAXE,
  WOOD_SHOVEL,
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
 * かまどがまだ無いので、砂 → ガラスだけはクラフトで代用している（本来は精錬）。
 * 鉄・金は鉱石を掘った時点でインゴットになる（items.ts の DROPS 参照）。
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
  { name: "ガラス", out: GLASS, count: 1, shape: ["SS", "SS"], key: { S: SAND } },
  // 石炭を棒の上に。1 列なので 2x2 でも作れる（Minecraft と同じ）。
  { name: "松明", out: TORCH, count: 4, shape: ["C", "S"], key: { C: COAL, S: STICK } },

  ...toolRecipes("木", PLANK, WOOD_PICKAXE, WOOD_AXE, WOOD_SHOVEL),
  ...toolRecipes("石", COBBLE, STONE_PICKAXE, STONE_AXE, STONE_SHOVEL),
  ...toolRecipes("鉄", IRON_INGOT, IRON_PICKAXE, IRON_AXE, IRON_SHOVEL),
  ...toolRecipes("ダイヤ", DIAMOND, DIAMOND_PICKAXE, DIAMOND_AXE, DIAMOND_SHOVEL),
];

/** 道具 3 種はどの階層も形が同じで、材料だけが変わる。 */
function toolRecipes(
  tier: string,
  material: number,
  pickaxe: number,
  axe: number,
  shovel: number,
): Recipe[] {
  const key = { M: material, S: STICK };
  return [
    { name: `${tier}のツルハシ`, out: pickaxe, count: 1, shape: ["MMM", ".S.", ".S."], key },
    { name: `${tier}の斧`, out: axe, count: 1, shape: ["MM.", "MS.", ".S."], key },
    { name: `${tier}のシャベル`, out: shovel, count: 1, shape: ["M", "S", "S"], key },
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
