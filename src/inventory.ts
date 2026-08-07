import { NO_ITEM, itemStackLimit } from "./items";

export const HOTBAR_SIZE = 9;
export const STORAGE_SIZE = 27;
export const INVENTORY_SIZE = HOTBAR_SIZE + STORAGE_SIZE;

export interface Slot {
  item: number;
  count: number;
}

function empty(): Slot {
  return { item: NO_ITEM, count: 0 };
}

export function isEmpty(slot: Slot): boolean {
  return slot.item === NO_ITEM || slot.count <= 0;
}

export function clearSlot(slot: Slot): void {
  slot.item = NO_ITEM;
  slot.count = 0;
}

/**
 * スロットの並びへ `[start, end)` の範囲で入れられるだけ入れ、**入らなかった数を返す。**
 *
 * **まず同じアイテムの山に足してから空き枠へ置く**（Minecraft と同じ）。逆にすると、
 * 半端な山が残ったまま空き枠が埋まって、持てる総数が減る。
 *
 * `Inventory` の外に出してあるのは、**チェスト（`chests.ts`）が同じ規則で入るため。**
 * 写すと、片方だけ直したときに「プレイヤーの収納とチェストで入り方が違う」形で
 * 静かに食い違う。
 */
export function addToSlots(
  slots: Slot[],
  item: number,
  count: number,
  start: number,
  end: number,
): number {
  if (item === NO_ITEM || count <= 0) return 0;
  const limit = itemStackLimit(item);
  let left = count;

  // まず同じアイテムの山に足す
  for (let i = start; i < end && left > 0; i++) {
    const slot = slots[i];
    if (slot.item !== item || slot.count >= limit) continue;
    const room = limit - slot.count;
    const put = Math.min(room, left);
    slot.count += put;
    left -= put;
  }
  // 空きスロットへ
  for (let i = start; i < end && left > 0; i++) {
    const slot = slots[i];
    if (!isEmpty(slot)) continue;
    const put = Math.min(limit, left);
    slot.item = item;
    slot.count = put;
    left -= put;
  }
  return left;
}

/**
 * 36 スロット。**先頭 9 個がホットバー**で、残り 27 が収納。
 * 拾ったものはホットバーから先に埋める（Minecraft と同じ並び）。
 */
export class Inventory {
  readonly slots: Slot[] = Array.from({ length: INVENTORY_SIZE }, empty);
  selected = 0;

  get selectedSlot(): Slot {
    return this.slots[this.selected];
  }

  get selectedItem(): number {
    const slot = this.selectedSlot;
    return isEmpty(slot) ? NO_ITEM : slot.item;
  }

  select(index: number): void {
    this.selected = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  cycle(delta: number): void {
    this.select(this.selected + delta);
  }

  /** 入れられなかった数を返す（0 なら全部入った）。 */
  add(item: number, count = 1): number {
    return this.addRange(item, count, 0, INVENTORY_SIZE);
  }

  /**
   * `[start, end)` のスロットにだけ入れる。入れられなかった数を返す。
   * シフトクリックの「ホットバー ↔ 収納」がこれを使う（行き先を絞るため）。
   */
  addRange(item: number, count: number, start: number, end: number): number {
    return addToSlots(this.slots, item, count, start, end);
  }

  /** そのアイテムをあと何個入れられるか（一括クラフトが回せるかの判定に使う）。 */
  roomFor(item: number): number {
    if (item === NO_ITEM) return 0;
    const limit = itemStackLimit(item);
    let room = 0;
    for (const slot of this.slots) {
      if (isEmpty(slot)) room += limit;
      else if (slot.item === item) room += Math.max(0, limit - slot.count);
    }
    return room;
  }

  count(item: number): number {
    if (item === NO_ITEM) return 0;
    let total = 0;
    for (const slot of this.slots) if (slot.item === item) total += slot.count;
    return total;
  }

  has(item: number, count = 1): boolean {
    return this.count(item) >= count;
  }

  /** 足りなければ何も減らさずに false。 */
  consume(item: number, count = 1): boolean {
    if (!this.has(item, count)) return false;
    let left = count;
    for (const slot of this.slots) {
      if (left === 0) break;
      if (slot.item !== item) continue;
      const take = Math.min(slot.count, left);
      slot.count -= take;
      left -= take;
      if (slot.count <= 0) clearSlot(slot);
    }
    return true;
  }

  /** 選択中のスロットから 1 個減らす（ブロックを置いたとき）。 */
  consumeSelected(count = 1): boolean {
    const slot = this.selectedSlot;
    if (isEmpty(slot) || slot.count < count) return false;
    slot.count -= count;
    if (slot.count <= 0) clearSlot(slot);
    return true;
  }

  /**
   * 選択中のスロットから捨てる（プレイ中の Q）。捨てたものを返す。空なら null。
   *
   * 捨てたぶんは呼ぶ側が地面に落とすので拾い直せます（`drops.ts`）。
   * それでも 1 個ずつにしてあり、呼ぶ側は必ず何を落としたか画面に出すこと
   * （画面外へ飛ぶことがあるため）。
   */
  discardSelected(count = 1): { item: number; count: number } | null {
    const slot = this.selectedSlot;
    if (isEmpty(slot)) return null;
    const item = slot.item;
    const taken = Math.min(count, slot.count);
    slot.count -= taken;
    if (slot.count <= 0) clearSlot(slot);
    return { item, count: taken };
  }

  /** そのアイテムが入っているホットバーのスロットを選ぶ（スポイト）。 */
  selectItem(item: number): boolean {
    if (item === NO_ITEM) return false;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.slots[i].item === item && this.slots[i].count > 0) {
        this.selected = i;
        return true;
      }
    }
    // ホットバーに無ければ収納から選択中のスロットへ持ってくる
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      if (this.slots[i].item === item && this.slots[i].count > 0) {
        this.swap(i, this.selected);
        return true;
      }
    }
    return false;
  }

  /**
   * **中身だけを入れ替える。** 配列の要素そのものを差し替えると、
   * `slots[i]` の `Slot` を持ち回っている側（`craftscreen.ts`）の参照が古いままになる。
   */
  swap(a: number, b: number): void {
    const item = this.slots[a].item;
    const count = this.slots[a].count;
    this.slots[a].item = this.slots[b].item;
    this.slots[a].count = this.slots[b].count;
    this.slots[b].item = item;
    this.slots[b].count = count;
  }

  clear(): void {
    for (const slot of this.slots) clearSlot(slot);
  }

  /** 選択中のスロットをこのアイテムで埋める（クリエイティブのスポイト）。 */
  setSelected(item: number, count = itemStackLimit(item)): void {
    this.selectedSlot.item = item;
    this.selectedSlot.count = count;
  }

  /**
   * クリエイティブ用。**空いているホットバーのスロットだけ**を埋める。
   * 上書きにすると、サバイバルで集めたものがモード切り替えで消えてしまう。
   */
  fillEmptyHotbar(items: readonly number[]): void {
    const queue = items.filter((item) => item !== NO_ITEM && !this.hasInHotbar(item));
    for (let i = 0; i < HOTBAR_SIZE && queue.length > 0; i++) {
      if (!isEmpty(this.slots[i])) continue;
      const item = queue.shift() as number;
      this.slots[i].item = item;
      this.slots[i].count = itemStackLimit(item);
    }
  }

  private hasInHotbar(item: number): boolean {
    for (let i = 0; i < HOTBAR_SIZE; i++) if (this.slots[i].item === item) return true;
    return false;
  }

  /** [item, count, ...] の平坦な配列。空スロットは 0,0 として位置を保つ。 */
  serialize(): number[] {
    const flat: number[] = [];
    for (const slot of this.slots) flat.push(isEmpty(slot) ? 0 : slot.item, isEmpty(slot) ? 0 : slot.count);
    return flat;
  }

  deserialize(flat: number[] | undefined): void {
    this.clear();
    if (!Array.isArray(flat)) return;
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const item = flat[i * 2] ?? 0;
      const count = flat[i * 2 + 1] ?? 0;
      if (!item || count <= 0) continue;
      this.slots[i].item = item;
      this.slots[i].count = Math.min(count, itemStackLimit(item));
    }
  }
}
