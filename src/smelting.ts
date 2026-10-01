/**
 * 精錬の規則。**表と純粋な計算だけ**（`crafting.ts` と同じ位置づけ）。
 *
 * DOM も three も出てこないので丸ごとヘッドレスで検証できる。
 * 置き場所ごとのかまどを束ねるのは `furnaces.ts`、画面は `craftscreen.ts` の仕事。
 * **判断をそちらに書き戻さないこと。**
 */

import {
  BIRCH_SAPLING,
  BIRCH_WOOD,
  BOOKSHELF,
  CHEST,
  COAL_BLOCK,
  COBBLE,
  CRAFTING_TABLE,
  FENCE,
  GLASS,
  GOLD_ORE,
  IRON_ORE,
  LADDER,
  NETHERRACK,
  PLANK,
  PLANK_SLAB,
  PLANK_STAIRS,
  SAND,
  SAPLING,
  SPRUCE_SAPLING,
  SPRUCE_WOOD,
  STONE,
  WOOD,
} from "./blocks";
import { deserializeWear, serializeWear } from "./durability";
import { clearSlot, isEmpty, type Slot } from "./inventory";
import {
  BLAZE_ROD,
  BRICK_ITEM,
  CHARCOAL,
  CLAY_BALL,
  COAL,
  COOKED_CHICKEN,
  COOKED_PORK,
  GOLD_INGOT,
  IRON_INGOT,
  LAVA_BUCKET,
  NETHER_BRICK_ITEM,
  NO_ITEM,
  RAW_BEEF,
  RAW_CHICKEN,
  RAW_PORK,
  STEAK,
  STICK,
  WOOD_AXE,
  WOOD_HOE,
  WOOD_PICKAXE,
  WOOD_SHOVEL,
  WOOD_SWORD,
  itemStackLimit,
  leftoverOf,
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
  // 鶏。**豚とまったく同じ形の 1 行**（焼く見返りは `items.ts` の `FOODS` が持つ）。
  [RAW_CHICKEN, { out: COOKED_CHICKEN, count: 1 }],
  // 牛。**豚・鶏とまったく同じ形の 1 行**（焼く見返りは `items.ts` の `FOODS` が持つ）。
  // **`FUEL` には 1 行も足していない**（革は燃料ではありません）。
  [RAW_BEEF, { out: STEAK, count: 1 }],
  // 木炭。**原木は「焼けるもの」と「燃料」の両方に居る初めての行**（本家と同じ）。
  // 原木 1 個を原木 1.5 個ぶんの火で焼くと、8 個ぶん燃える木炭が 1 個返る —— つまり
  // **石炭が 1 つも無くても、木だけで火を回し続けられる**ようになる。
  // **`FUEL` の行は書き換えないこと**（原木が燃料でなくなると、その入口が閉じます）。
  [WOOD, { out: CHARCOAL, count: 1 }],
  // トウヒの原木も同じ 1 行（板が 2 行あるのと同じで、針葉樹林から始めても詰まない）。
  [SPRUCE_WOOD, { out: CHARCOAL, count: 1 }],
  [BIRCH_WOOD, { out: CHARCOAL, count: 1 }],
  // 粘土玉 → レンガ（本家と同じ）。**`FUEL` には 1 行も足していない** ——
  // 粘土玉もレンガも燃料ではない（革・粘土と同じ）。焼いたレンガ 4 個を 2x2 で
  // 組むと `blocks.ts` の `BRICK`(12) になる（`crafting.ts`）ので、
  // **この 1 行が、置けるのに作れなかったレンガブロックへの入口**。
  [CLAY_BALL, { out: BRICK_ITEM, count: 1 }],
  // ネザーラック → ネザーレンガ（本家と同じ。57）。**この 1 行が、要塞で掘るしか
  // 無かったネザーレンガのブロック（`blocks.ts` の 48）への入口**（4 個の 2x2 は `crafting.ts`）。
  // **`FUEL` には足していない** —— ネザーラックが燃え続けるのはブロックの性質で、燃料ではない。
  [NETHERRACK, { out: NETHER_BRICK_ITEM, count: 1 }],
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
  // 木炭は**石炭とまったく同じ 8 個ぶん**（本家と同じ）。並べて書いてあるのは、
  // 片方だけ伸ばすと「どちらを使うべきか」が生まれてしまうため —— 本家でも同じ長さで、
  // 違いは**手に入る道**（掘る / 木を焼く）だけ。**ブレイズロッドを除いた 1 個もののなかでは
  // この 80 秒が最長**（1 個ものの最大はブレイズロッドの 120 秒・表そのものの最大は
  // 溶岩入りバケツの 1000 秒・それを除けば石炭ブロックの 800 秒。どれも下の行）。
  [CHARCOAL, SMELT_TIME * 8],
  // 石炭ブロック（188・42）は**本家と同じ 80 個ぶん = 800 秒**。石炭 9 個でしまえるので、
  // **しまうと 1 個ぶん（10 秒）得になる**のが本家どおり（`TUNING.md`）。
  // **これが `Math.max(...FUEL.values())` を 80 → 800 へ動かしました**（56 の溶岩入りバケツで
  // さらに 1000 へ動いたので、いまは「溶岩入りバケツを除いた最大」）——
  // `test/smelting.test.ts` の「いちばん長持ちする」は**2 件に割ってあります**
  // （表の最大値と突き合わせている件は、その表に大きい値を足すと落ちる。`rules/testing.md`）。
  [COAL_BLOCK, SMELT_TIME * 80],
  // ブレイズロッドは**本家と同じ 12 個ぶん = 120 秒**（55）。**1 個もののなかの最大**になる。
  // エンドへ行く材料を燃やせてしまうのも本家どおり（`TUNING.md`）。
  [BLAZE_ROD, SMELT_TIME * 12],
  // 溶岩入りバケツは**本家と同じ 100 個ぶん = 1000 秒**（56）。**表そのものの最大**。
  // 燃え始めた瞬間に燃料枠へ**空のバケツが 1 個残る**が、それを決めているのはここではなく
  // `items.ts` の `LEFTOVERS`（クラフトの残りかすと同じ表。`tickFurnace()` が聞くだけ）。
  [LAVA_BUCKET, SMELT_TIME * 100],
  [WOOD, SMELT_TIME * 1.5],
  [SPRUCE_WOOD, SMELT_TIME * 1.5],
  [BIRCH_WOOD, SMELT_TIME * 1.5],
  [PLANK, SMELT_TIME * 1.5],
  [PLANK_STAIRS, SMELT_TIME * 1.5],
  // 木の道具 5 本は**本家と同じ 1 個ぶん = 10 秒**（55）。**傷があっても長さは同じ**で、
  // 燃やすと傷ごと消える（`tickFurnace()` の `clearSlot`）。
  [WOOD_PICKAXE, SMELT_TIME * 1],
  [WOOD_AXE, SMELT_TIME * 1],
  [WOOD_SHOVEL, SMELT_TIME * 1],
  [WOOD_SWORD, SMELT_TIME * 1],
  [WOOD_HOE, SMELT_TIME * 1],
  [CRAFTING_TABLE, SMELT_TIME * 1.5],
  // 木の置き物 4 種は**本家と同じ 1.5 個ぶん = 15 秒**（55。作業台と同じ）。
  // **はしごは 145 だけ** —— 146..148 は向き違いでアイテムを持たないので行を足さない。
  [CHEST, SMELT_TIME * 1.5],
  [BOOKSHELF, SMELT_TIME * 1.5],
  [FENCE, SMELT_TIME * 1.5],
  [LADDER, SMELT_TIME * 1.5],
  [PLANK_SLAB, SMELT_TIME * 0.75],
  [STICK, SMELT_TIME * 0.5],
  // 苗木 3 種は**本家と同じ半個ぶん = 5 秒**（55。棒と同じ）。
  [SAPLING, SMELT_TIME * 0.5],
  [SPRUCE_SAPLING, SMELT_TIME * 0.5],
  [BIRCH_SAPLING, SMELT_TIME * 0.5],
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
 *    （**残りかすがあれば燃料枠に置く** —— 溶岩入りバケツ → 空のバケツ。`leftoverOf()` に聞く）
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
        // 残りかすは `consumeGrid()` と同じ順で置く: 先に聞き、`clearSlot()` で傷ごと畳んでから書く。
        const rest = leftoverOf(state.fuel.item);
        state.fuel.count -= 1;
        if (state.fuel.count <= 0) clearSlot(state.fuel);
        if (rest !== NO_ITEM) {
          state.fuel.item = rest;
          state.fuel.count = 1;
        }
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
