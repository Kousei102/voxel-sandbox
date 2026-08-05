import { consumeGrid, findRecipe } from "./crafting";
import { clearSlot, isEmpty, type Inventory, type Slot } from "./inventory";
import { NO_ITEM, itemStackLimit } from "./items";

/** 作業台なら 3x3、手持ちなら 2x2。 */
export type CraftSize = 2 | 3;

/** 盤面は常に 3x3 ぶん持ち、2x2 のときは左上だけを使う。 */
export const GRID_SLOTS = 9;

/** 触った場所。DOM は「どこを触ったか」だけを渡し、意味を付けない。 */
export type SlotArea = "grid" | "inv";

/** 左 = 0、右 = 2（`MouseEvent.button` と同じ番号）。中クリックは受けない。 */
export type MouseButton = 0 | 2;

/** 入力 1 回の結果。UI はこれを見て描き直す／音を鳴らすだけ。 */
export interface ScreenResult {
  changed: boolean;
  crafted: boolean;
}

const NOTHING: ScreenResult = { changed: false, crafted: false };
const CHANGED: ScreenResult = { changed: true, crafted: false };
const CRAFTED: ScreenResult = { changed: true, crafted: true };

function emptySlot(): Slot {
  return { item: NO_ITEM, count: 0 };
}

/**
 * インベントリ画面の**判断**。DOM には一切触らない。
 *
 * 描画とマウスの配線は `inventoryui.ts` の仕事で、そちらに判断を書き戻さないこと
 * （`test/craftscreen.test.ts` が両方向にソースを見張っています）。
 * `mobs.ts` ↔ `mobrender.ts`、`sfx.ts` ↔ `audio.ts` と同じ切り分けです。
 *
 * 操作は Minecraft と同じで、**左クリックで山ごと掴む／置く**、**右クリックで 1 個ずつ置く**
 * （物の入ったスロットを右クリックすると半分掴む）。
 */
export class CraftScreen {
  /**
   * 作業台の盤面。3x3 固定で持ち、2x2 のときは左上だけを使う。
   * 要素の `Slot` は**参照を保ったまま**書き換える（`activeGrid()` の項を参照）。
   */
  readonly grid: Slot[] = Array.from({ length: GRID_SLOTS }, emptySlot);

  private readonly heldSlot: Slot = emptySlot();
  private craftSize: CraftSize = 2;
  private open = false;

  constructor(readonly inventory: Inventory) {}

  /** 掴んでいる山。空なら null（UI 側に `isEmpty` を持たせないため）。 */
  get held(): Slot | null {
    return isEmpty(this.heldSlot) ? null : this.heldSlot;
  }

  get size(): CraftSize {
    return this.craftSize;
  }

  get isOpen(): boolean {
    return this.open;
  }

  openScreen(size: CraftSize): void {
    this.craftSize = size;
    this.open = true;
  }

  /** 盤面と掴んでいる山を戻してから閉じる。 */
  close(): void {
    if (!this.open) return;
    this.returnAll();
    this.open = false;
  }

  /**
   * 盤面と掴んでいる山をインベントリへ戻す。**冪等**（戻すものが無ければ何もしない）ので、
   * 閉じるときと読み込み直後の両方から呼べる。入りきらなかった分はその場に残す。
   */
  returnAll(): void {
    for (const slot of this.grid) this.returnSlot(slot);
    this.returnSlot(this.heldSlot);
  }

  private returnSlot(slot: Slot): void {
    if (isEmpty(slot)) return;
    const left = this.inventory.add(slot.item, slot.count);
    slot.count = left;
    if (left <= 0) clearSlot(slot);
  }

  /** 盤面のうち、いま使えるスロットか（2x2 のときは左上 4 つだけ）。 */
  usable(index: number): boolean {
    if (this.craftSize === 3) return true;
    const x = index % 3;
    const y = Math.floor(index / 3);
    return x < 2 && y < 2;
  }

  // --- 入力 ---

  click(area: SlotArea, index: number, button: MouseButton): ScreenResult {
    const slot = this.slotAt(area, index);
    if (!slot) return NOTHING;
    this.transfer(slot, button === 0);
    return CHANGED;
  }

  /**
   * 掴んでいる山とスロットのやり取り。
   * whole = 左クリック（山ごと）、false = 右クリック（1 個ずつ／半分掴む）。
   */
  private transfer(slot: Slot, whole: boolean): void {
    const held = this.heldSlot;

    if (isEmpty(held)) {
      if (isEmpty(slot)) return;
      const take = whole ? slot.count : Math.ceil(slot.count / 2);
      held.item = slot.item;
      held.count = take;
      slot.count -= take;
      if (slot.count <= 0) clearSlot(slot);
      return;
    }

    if (isEmpty(slot)) {
      const put = whole ? held.count : 1;
      slot.item = held.item;
      slot.count = put;
      held.count -= put;
      if (held.count <= 0) clearSlot(held);
      return;
    }

    if (slot.item === held.item) {
      const room = itemStackLimit(slot.item) - slot.count;
      const put = Math.min(room, whole ? held.count : 1);
      slot.count += put;
      held.count -= put;
      if (held.count <= 0) clearSlot(held);
      return;
    }

    // 別のアイテム同士は入れ替え（1 個だけ置くことはできない）
    if (!whole) return;
    const item = slot.item;
    const count = slot.count;
    slot.item = held.item;
    slot.count = held.count;
    held.item = item;
    held.count = count;
  }

  /** 出来上がりを受け取る。掴んでいる山に足せるときだけ成立する。 */
  takeResult(): ScreenResult {
    const recipe = findRecipe(this.activeGrid(), this.craftSize);
    if (!recipe) return NOTHING;

    if (isEmpty(this.heldSlot)) {
      this.heldSlot.item = recipe.out;
      this.heldSlot.count = recipe.count;
    } else if (this.heldSlot.item === recipe.out) {
      if (this.heldSlot.count + recipe.count > itemStackLimit(recipe.out)) return NOTHING;
      this.heldSlot.count += recipe.count;
    } else {
      return NOTHING;
    }
    consumeGrid(this.activeGrid());
    return CRAFTED;
  }

  /**
   * 2x2 のときは左上 4 つだけを並べ直した盤面を返す。
   *
   * **必ず同じ `Slot` の参照を並べ替えること（コピーを作らないこと）。**
   * `consumeGrid()` が破壊的に材料を減らすので、コピーを渡すと
   * **作れるのに材料が減らない**（画面を見ないと気付けない壊れ方）。
   */
  private activeGrid(): Slot[] {
    if (this.craftSize === 3) return this.grid;
    return [this.grid[0], this.grid[1], this.grid[3], this.grid[4]];
  }

  /** 出来上がりの見本。無ければ null。文字の組み立ては UI 側でやる。 */
  result(): { item: number; count: number; name: string } | null {
    const recipe = findRecipe(this.activeGrid(), this.craftSize);
    return recipe ? { item: recipe.out, count: recipe.count, name: recipe.name } : null;
  }

  /** 触ったスロット。使えない盤面の枠なら null。 */
  private slotAt(area: SlotArea, index: number): Slot | null {
    if (area === "grid") return this.usable(index) ? this.grid[index] : null;
    return this.inventory.slots[index] ?? null;
  }
}
