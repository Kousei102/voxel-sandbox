/**
 * 精錬の規則。**表と純粋な計算だけ**（`crafting.ts` と同じ位置づけ）。
 *
 * DOM も three も出てこないので丸ごとヘッドレスで検証できる。
 * 置き場所ごとのかまどを束ねるのは `furnaces.ts`、画面は `craftscreen.ts` の仕事。
 * **判断をそちらに書き戻さないこと。**
 */

import {
  COBBLE,
  CRAFTING_TABLE,
  GLASS,
  GOLD_ORE,
  IRON_ORE,
  PLANK,
  PLANK_SLAB,
  PLANK_STAIRS,
  SAND,
  SPRUCE_WOOD,
  STONE,
  WOOD,
} from "./blocks";
import { deserializeWear, serializeWear } from "./durability";
import { clearSlot, isEmpty, type Slot } from "./inventory";
import {
  COAL,
  COOKED_PORK,
  GOLD_INGOT,
  IRON_INGOT,
  NO_ITEM,
  RAW_PORK,
  STICK,
  itemStackLimit,
} from "./items";

/** 1 個焼くのにかかる時間（秒）。Minecraft と同じ 10 秒。 */
export const SMELT_TIME = 10;

export interface SmeltResult {
  readonly out: number;
  readonly count: number;
}

/**
 * 何が何になるか。
 *
 * **鉄と金はここが本来の姿。** かまどが無かった頃は鉱石を掘った時点でインゴットが
 * 落ちていたが（`items.ts` の `DROPS`）、精錬が入ったので鉱石のまま落ちるようにした。
 * 砂 → ガラスも同じで、4 個をクラフトする代用レシピは `crafting.ts` から外してある。
 */
export const SMELTING: ReadonlyMap<number, SmeltResult> = new Map([
  [IRON_ORE, { out: IRON_INGOT, count: 1 }],
  [GOLD_ORE, { out: GOLD_INGOT, count: 1 }],
  [SAND, { out: GLASS, count: 1 }],
  [COBBLE, { out: STONE, count: 1 }],
  [RAW_PORK, { out: COOKED_PORK, count: 1 }],
]);

/**
 * 燃料 1 個が燃える秒数。
 *
 * **木から作れるものを必ず残すこと。** 石炭が見つかる前に鉄を焼けないと、
 * かまどを作った意味が最初の数十分ぶん遅れる（板 1 個で 1 個ちょうど焼ける）。
 * Minecraft の「何個焼けるか」× `SMELT_TIME` に合わせてある。
 */
export const FUEL: ReadonlyMap<number, number> = new Map([
  [COAL, SMELT_TIME * 8],
  [WOOD, SMELT_TIME * 1.5],
  [SPRUCE_WOOD, SMELT_TIME * 1.5],
  [PLANK, SMELT_TIME * 1.5],
  [PLANK_STAIRS, SMELT_TIME * 1.5],
  [CRAFTING_TABLE, SMELT_TIME * 1.5],
  [PLANK_SLAB, SMELT_TIME * 0.75],
  [STICK, SMELT_TIME * 0.5],
]);

/** そのアイテムを焼くと何になるか。焼けないなら null。 */
export function smeltResultOf(item: number): SmeltResult | null {
  return SMELTING.get(item) ?? null;
}

/** そのアイテム 1 個が燃える秒数。燃料でなければ 0。 */
export function fuelTimeOf(item: number): number {
  return FUEL.get(item) ?? 0;
}

export function isFuel(item: number): boolean {
  return fuelTimeOf(item) > 0;
}

export function isSmeltable(item: number): boolean {
  return SMELTING.has(item);
}

/**
 * かまど 1 台ぶんの中身。**スロットは参照を保ったまま書き換える**
 * （`craftscreen.ts` が同じ `Slot` を掴んで操作するため。コピーを渡すと、
 * 画面で入れたものがかまどに入らない）。
 */
export interface FurnaceState {
  readonly input: Slot;
  readonly fuel: Slot;
  readonly output: Slot;
  /** 残りの燃焼時間（秒）。0 なら火が消えている。 */
  burnLeft: number;
  /** いま燃やしている燃料 1 個ぶんの長さ。炎ゲージの分母。 */
  burnTotal: number;
  /** 焼き上がりまでの残り（秒）。 */
  cookLeft: number;
}

function emptySlot(): Slot {
  return { item: NO_ITEM, count: 0 };
}

export function createFurnace(): FurnaceState {
  return {
    input: emptySlot(),
    fuel: emptySlot(),
    output: emptySlot(),
    burnLeft: 0,
    burnTotal: 0,
    cookLeft: SMELT_TIME,
  };
}

/** 火が点いているか。**ブロックを `FURNACE_LIT` に差し替える唯一の判断。** */
export function isLit(state: FurnaceState): boolean {
  return state.burnLeft > 0;
}

/** 炎ゲージ 0..1（燃料の残り）。 */
export function burnFraction(state: FurnaceState): number {
  if (state.burnTotal <= 0) return 0;
  return Math.max(0, Math.min(1, state.burnLeft / state.burnTotal));
}

/** 焼き上がりゲージ 0..1。 */
export function cookFraction(state: FurnaceState): number {
  return Math.max(0, Math.min(1, 1 - state.cookLeft / SMELT_TIME));
}

/** 中身が全部空で火も消えているか（セーブから省いてよい状態）。 */
export function isIdle(state: FurnaceState): boolean {
  return (
    isEmpty(state.input) && isEmpty(state.fuel) && isEmpty(state.output) && state.burnLeft <= 0
  );
}

/**
 * いま焼ける結果。**出来上がりの置き場所が無ければ焼かない**（`null` を返す）。
 * これを見ずに焼くと、満杯の出力スロットの上でアイテムが消える。
 */
export function pendingResult(state: FurnaceState): SmeltResult | null {
  if (isEmpty(state.input)) return null;
  const result = smeltResultOf(state.input.item);
  if (!result) return null;
  if (isEmpty(state.output)) return result;
  if (state.output.item !== result.out) return null;
  if (state.output.count + result.count > itemStackLimit(result.out)) return null;
  return result;
}

/**
 * かまど 1 台を `dt` 秒ぶん進める。中身が変わったら true。
 *
 * 順番が肝心:
 * 1. 燃えている火を減らす
 * 2. **焼くものが無ければ、燃料をくべない**（Minecraft と同じ。空焚きで燃料が消えない）
 * 3. 火が消えていて焼くものがあるなら、燃料を 1 個くべる
 * 4. 火が点いている間だけ焼き上がりが進む
 *
 * **焼くものが無くなったら進み具合を戻すこと。** 途中で材料を抜いて別のものを入れると、
 * 前の進み具合を引き継いで一瞬で焼き上がってしまう。
 */
export function tickFurnace(state: FurnaceState, dt: number): boolean {
  let changed = false;

  if (state.burnLeft > 0) {
    state.burnLeft = Math.max(0, state.burnLeft - dt);
    changed = true;
  }

  const result = pendingResult(state);

  if (!result) {
    if (state.cookLeft !== SMELT_TIME) {
      state.cookLeft = SMELT_TIME;
      changed = true;
    }
  } else {
    if (state.burnLeft <= 0 && !isEmpty(state.fuel)) {
      const time = fuelTimeOf(state.fuel.item);
      if (time > 0) {
        state.burnLeft = time;
        state.burnTotal = time;
        state.fuel.count -= 1;
        if (state.fuel.count <= 0) clearSlot(state.fuel);
        changed = true;
      }
    }

    if (state.burnLeft > 0) {
      state.cookLeft -= dt;
      changed = true;
      if (state.cookLeft <= 0) {
        state.output.item = result.out;
        state.output.count += result.count;
        state.input.count -= 1;
        if (state.input.count <= 0) clearSlot(state.input);
        state.cookLeft = SMELT_TIME;
      }
    }
  }

  // 火が消えたら分母も畳む（消えているのに炎ゲージが残って見えないように）。
  if (state.burnLeft <= 0 && state.burnTotal !== 0) {
    state.burnTotal = 0;
    changed = true;
  }

  return changed;
}

/** セーブ用の 9 要素。中身 3 枠 x 2 + タイマー 3。 */
export function serializeFurnace(state: FurnaceState): number[] {
  return [
    state.input.item,
    state.input.count,
    state.fuel.item,
    state.fuel.count,
    state.output.item,
    state.output.count,
    round2(state.burnLeft),
    round2(state.burnTotal),
    round2(state.cookLeft),
  ];
}

/**
 * 中に入っている道具の傷を 3 枠ぶん（並びは `input` / `fuel` / `output`）。
 * **全部新品なら `undefined`** を返して `SaveData.furnaceWear` のキーごと消す。
 *
 * **`serializeFurnace()` の 9 要素を増やさないこと** —— 増やすと既存のセーブが
 * 丸ごとずれる（`dropWear` を `drops` と分けたのと同じ理由）。
 * 形も丸め方も `durability.ts` に委ねる（ここに `?? 0` を書かない）。
 */
export function serializeFurnaceWear(state: FurnaceState): number[] | undefined {
  return serializeWear([state.input, state.fuel, state.output]);
}

/**
 * セーブから戻す。**傷は同じ呼び出しで渡すこと** —— 中身を入れてからでないと
 * 「その枠の道具は何回使えるか」が決まらない（`durability.ts` の `deserializeWear()`）。
 */
export function deserializeFurnace(flat: readonly number[], wear?: number[]): FurnaceState {
  const state = createFurnace();
  const slots = [state.input, state.fuel, state.output];
  for (let i = 0; i < slots.length; i++) {
    const item = flat[i * 2] ?? 0;
    const count = flat[i * 2 + 1] ?? 0;
    if (!item || count <= 0) continue;
    slots[i].item = item;
    slots[i].count = Math.min(count, itemStackLimit(item));
  }
  deserializeWear(slots, wear);
  state.burnLeft = finite(flat[6], 0);
  state.burnTotal = finite(flat[7], 0);
  // 壊れた値で「焼き上がりまで残り -100 秒」にならないよう、範囲に収める。
  state.cookLeft = Math.max(0, Math.min(SMELT_TIME, finite(flat[8], SMELT_TIME)));
  if (state.burnLeft <= 0) state.burnTotal = 0;
  return state;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
