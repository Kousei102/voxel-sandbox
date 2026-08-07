/**
 * 置いてあるチェスト全部。**「位置ごとに状態を持つブロック」の 2 つ目**で、
 * かまど（`furnaces.ts`）とまったく同じ器に乗せてある。
 *
 * three にも DOM にも触らないので丸ごとヘッドレスで検証できる
 * （見張りは `test/chests.test.ts`）。
 *
 * **かまどと違って「進む」ものが無い。** 精錬のような時間の処理が無いので
 * `update(dt)` を持たず、`main.ts` も毎フレーム呼ばない。だから
 * `smelting.ts` + `furnaces.ts` のような 2 ファイル分割もしていない
 * （分ける理由は「規則が純粋関数として独立している」ことで、入れ物にはその中身が無い）。
 *
 * **`world.setVoxel` をここから呼ばないこと**（`furnaces.ts` / `drops.ts` と同じ制約）。
 */

import { addToSlots, clearSlot, isEmpty, type Slot } from "./inventory";
import { itemStackLimit, NO_ITEM } from "./items";

/**
 * チェストの枠数。**プレイヤーの収納と同じ 27**（Minecraft と同じ）。
 * 画面もプレイヤーの収納と同じ 9 列で描けるので、CSS も使い回せる。
 */
export const CHEST_SIZE = 27;

export interface ChestState {
  readonly slots: Slot[];
}

export function createChest(): ChestState {
  return { slots: Array.from({ length: CHEST_SIZE }, () => ({ item: NO_ITEM, count: 0 })) };
}

/** 空っぽか（セーブから省いてよいか）。 */
export function isChestEmpty(state: ChestState): boolean {
  return state.slots.every(isEmpty);
}

/** `[item, count, ...]` を 27 枠ぶん。空きは `0,0` で**位置を保つ**。 */
export function serializeChest(state: ChestState): number[] {
  const flat: number[] = [];
  for (const slot of state.slots) {
    flat.push(isEmpty(slot) ? 0 : slot.item, isEmpty(slot) ? 0 : slot.count);
  }
  return flat;
}

export function deserializeChest(flat: readonly number[]): ChestState {
  const state = createChest();
  for (let i = 0; i < CHEST_SIZE; i++) {
    const item = flat[i * 2] ?? 0;
    const count = flat[i * 2 + 1] ?? 0;
    if (!item || count <= 0) continue;
    state.slots[i].item = item;
    state.slots[i].count = Math.min(count, itemStackLimit(item));
  }
  return state;
}

export function chestKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class Chests {
  private readonly map = new Map<string, ChestState>();

  /** 中身が変わった合図（セーブの印に使う）。 */
  onChange?: () => void;

  get count(): number {
    return this.map.size;
  }

  /** そこにあるチェスト。無ければ作る（右クリックで開いたとき）。 */
  at(x: number, y: number, z: number): ChestState {
    const key = chestKey(x, y, z);
    const found = this.map.get(key);
    if (found) return found;
    const state = createChest();
    this.map.set(key, state);
    return state;
  }

  /** そこにあるチェスト。無くても作らない。 */
  peek(x: number, y: number, z: number): ChestState | null {
    return this.map.get(chestKey(x, y, z)) ?? null;
  }

  /**
   * チェストを取り除いて、**中に入っていたものを返す**（壊したときに地面へ落とす）。
   * 返さないと、中身が黙って消える。**クリエイティブでも落とすこと** ——
   * 中身は集めたアイテムで、壊し方によって消えてよいものではない。
   */
  remove(x: number, y: number, z: number): { item: number; count: number }[] {
    const key = chestKey(x, y, z);
    const state = this.map.get(key);
    if (!state) return [];
    this.map.delete(key);
    const out: { item: number; count: number }[] = [];
    for (const slot of state.slots) {
      if (!isEmpty(slot)) out.push({ item: slot.item, count: slot.count });
    }
    if (out.length > 0) this.onChange?.();
    return out;
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * セーブ用。**空っぽのチェストは省く**（右クリックで開いただけのものが溜まらないように）。
   * 全部空なら `undefined` を返してキーごと省く（`furnaces.ts` と同じ作法）。
   */
  serialize(): Record<string, number[]> | undefined {
    const out: Record<string, number[]> = {};
    let any = false;
    for (const [key, state] of this.map) {
      if (isChestEmpty(state)) continue;
      out[key] = serializeChest(state);
      any = true;
    }
    return any ? out : undefined;
  }

  /** セーブから戻す。**壊れた値は黙って飛ばす**（読めないより、欠けるほうがまし）。 */
  deserialize(raw: Record<string, number[]> | undefined): void {
    this.clear();
    if (!raw || typeof raw !== "object") return;
    for (const [key, flat] of Object.entries(raw)) {
      if (!Array.isArray(flat)) continue;
      const parts = key.split(",");
      if (parts.length !== 3 || parts.some((p) => !Number.isFinite(Number(p)))) continue;
      this.map.set(key, deserializeChest(flat));
    }
  }
}

/**
 * チェストへ入れられるだけ入れて、**入らなかった数を返す**
 * （`Inventory.add()` とまったく同じ約束）。並べ方も同じで、
 * まず同じアイテムの山に足してから空き枠へ置く。
 */
export function addToChest(state: ChestState, item: number, count: number): number {
  return addToSlots(state.slots, item, count, 0, CHEST_SIZE);
}

/** 中身を全部空にする（保存データの削除で使う）。 */
export function clearChest(state: ChestState): void {
  for (const slot of state.slots) clearSlot(slot);
}
