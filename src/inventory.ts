import { carryWear, damageOf, deserializeWear, serializeWear } from "./durability";
import { NO_ITEM, itemStackLimit } from "./items";

export const HOTBAR_SIZE = 9;
export const STORAGE_SIZE = 27;
export const INVENTORY_SIZE = HOTBAR_SIZE + STORAGE_SIZE;

export interface Slot {
  item: number;
  count: number;
  /**
   * 道具の傷（使った回数）。**新品は 0**（省略可なので、`Slot` を作る側は書かなくてよい）。
   * **何回で壊れるか・いつ減るかは `durability.ts`** で、ここは値を持つだけ。
   */
  damage?: number;
}

function empty(): Slot {
  return { item: NO_ITEM, count: 0, damage: 0 };
}

export function isEmpty(slot: Slot): boolean {
  return slot.item === NO_ITEM || slot.count <= 0;
}

/** **傷も一緒に捨てること** —— 残すと、次に入れたものが半分減った状態で始まる。 */
export function clearSlot(slot: Slot): void {
  slot.item = NO_ITEM;
  slot.count = 0;
  slot.damage = 0;
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
 *
 * `damage` は**入れる物の傷**。**既定 0 の省略可のまま**にすること ——
 * 必須にすると、まだ傷を運ばない側（`chests.ts`）にも手が要る。
 * 傷が付く物は `stack: 1` なので、載るのは必ず空き枠へ入れた 1 個だけ。
 */
export function addToSlots(
  slots: Slot[],
  item: number,
  count: number,
  start: number,
  end: number,
  damage = 0,
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
    // **前の持ち主の傷は捨てて、運んできた傷を載せる**（既定は 0 = 新品）。
    carryWear(slot, damage);
    left -= put;
  }
  return left;
}

/**
 * 36 スロット。**先頭 9 個がホットバー**で、残り 27 が収納。
 * 拾ったものはホットバーから先に埋める（Minecraft と同じ並び）。
 */
/**
 * まとめ捨てか（Q に修飾キーが付いているか）。**入力の意味をここで決める** ——
 * 押されたキーそのものは DOM の事実なので、`main.ts` は `KeyboardEvent` を
 * そのまま渡すだけにしてある（`rules/inventory-screen.md`）。
 *
 * **Shift も受けるのは意図的です。** Minecraft と同じ Ctrl+Q を本命にしているが、
 * ブラウザによっては Ctrl+Q がブラウザ自身の終了に割り当てられていて、
 * `preventDefault()` では止められない。押した人が窓ごと閉じるより、
 * 逃げ道を 1 つ持たせるほうが安全側。
 */
export function bulkDiscard(mods: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): boolean {
  return mods.ctrlKey || mods.metaKey || mods.shiftKey;
}

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

  /**
   * 入れられなかった数を返す（0 なら全部入った）。
   * `damage` は入れる物の傷（**既定は新品**。`addToSlots()` の項）。
   */
  add(item: number, count = 1, damage = 0): number {
    return this.addRange(item, count, 0, INVENTORY_SIZE, damage);
  }

  /**
   * `[start, end)` のスロットにだけ入れる。入れられなかった数を返す。
   * シフトクリックの「ホットバー ↔ 収納」がこれを使う（行き先を絞るため）。
   */
  addRange(item: number, count: number, start: number, end: number, damage = 0): number {
    return addToSlots(this.slots, item, count, start, end, damage);
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
   * `all` なら山ごと（まとめ捨て）、既定は 1 個だけ。
   *
   * 捨てたぶんは呼ぶ側が地面に落とすので拾い直せます（`drops.ts`）。
   * **呼ぶ側は必ず何を落としたか画面に出すこと**（画面外へ飛ぶことがあるため）。
   * 引数を `all: boolean` にしてあるのは `CraftScreen.discardHeld()` と揃えるためで、
   * **個数を渡す形に戻さないこと**（「1 個」と「山ごと」以外の中間は要りません）。
   */
  discardSelected(all = false): { item: number; count: number } | null {
    const slot = this.selectedSlot;
    if (isEmpty(slot)) return null;
    const item = slot.item;
    const taken = all ? slot.count : 1;
    slot.count -= taken;
    if (slot.count <= 0) clearSlot(slot);
    return { item, count: taken };
  }

  /**
   * 中身を全部取り出して空にする（**死んだときに落とすもの**）。
   *
   * **不変条件: 返した合計 = 取り出す前の総数。** 呼ぶ側はこれを 1 山ずつ地面に落とすので、
   * ここで数を丸めると持ち物が黙って増減します。
   * 空のスロットは返しません（`drops.burst()` に空の山を渡さないため）。
   */
  takeAll(): { item: number; count: number }[] {
    const out: { item: number; count: number }[] = [];
    for (const slot of this.slots) {
      if (isEmpty(slot)) continue;
      out.push({ item: slot.item, count: slot.count });
      clearSlot(slot);
    }
    return out;
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
    // **傷も一緒に入れ替えること** —— 置いていくと、収納から出した道具が新品に戻る。
    // **先に両方を読んでおくこと**（書きながら読むと、2 枠目が書き換え後の値を拾う）。
    const damage = damageOf(this.slots[a]);
    const other = damageOf(this.slots[b]);
    this.slots[a].item = this.slots[b].item;
    this.slots[a].count = this.slots[b].count;
    carryWear(this.slots[a], other);
    this.slots[b].item = item;
    this.slots[b].count = count;
    carryWear(this.slots[b], damage);
  }

  clear(): void {
    for (const slot of this.slots) clearSlot(slot);
  }

  /** 選択中のスロットをこのアイテムで埋める（クリエイティブのスポイト）。 */
  setSelected(item: number, count = itemStackLimit(item)): void {
    this.selectedSlot.item = item;
    this.selectedSlot.count = count;
    // クリエイティブで湧かせたものは新品（傷んだ道具の上に湧かせても引き継がない）。
    this.selectedSlot.damage = 0;
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

  /**
   * 道具の傷。**`inventory` とは別の省略可キー**（`SaveData.wear`）に置く ——
   * `[item, count]` を 3 要素にすると既存のセーブが丸ごとずれる。
   * **形も丸め方も `durability.ts`**（ここは委譲するだけ）。
   */
  serializeWear(): number[] | undefined {
    return serializeWear(this.slots);
  }

  /** **`deserialize()` のあとで呼ぶこと**（何回使える道具かは中身で決まる）。 */
  deserializeWear(flat: number[] | undefined): void {
    deserializeWear(this.slots, flat);
  }
}
