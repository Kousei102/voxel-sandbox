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
    if (item === NO_ITEM || count <= 0) return 0;
    const limit = itemStackLimit(item);
    let left = count;

    // まず同じアイテムの山に足す
    for (const slot of this.slots) {
      if (left === 0) break;
      if (slot.item !== item || slot.count >= limit) continue;
      const room = limit - slot.count;
      const put = Math.min(room, left);
      slot.count += put;
      left -= put;
    }
    // 空きスロットへ
    for (const slot of this.slots) {
      if (left === 0) break;
      if (!isEmpty(slot)) continue;
      const put = Math.min(limit, left);
      slot.item = item;
      slot.count = put;
      left -= put;
    }
    return left;
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

  swap(a: number, b: number): void {
    const tmp = { ...this.slots[a] };
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
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
