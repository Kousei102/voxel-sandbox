import { consumeGrid, findRecipe } from "./crafting";
import { HOTBAR_SIZE, STORAGE_SIZE, clearSlot, isEmpty, type Inventory, type Slot } from "./inventory";
import { NO_ITEM, itemCssColor, itemName, itemStackLimit } from "./items";
import { paintSlot, slotMarkup } from "./ui";

/** 作業台なら 3x3、手持ちなら 2x2。 */
export type CraftSize = 2 | 3;

const GRID_SLOTS = 9;

function emptySlot(): Slot {
  return { item: NO_ITEM, count: 0 };
}

/**
 * インベントリ画面。
 *
 * 操作は Minecraft と同じで、**左クリックで山ごと掴む／置く**、**右クリックで 1 個ずつ置く**
 * （空のスロットを右クリックすると半分掴む）。掴んでいる山はカーソルに追従する。
 * 画面を閉じるときは、作業台の盤面と掴んでいる山を必ずインベントリに戻すこと。
 */
export class InventoryScreen {
  private readonly root = document.getElementById("inventory") as HTMLElement;
  private readonly gridEl = document.getElementById("craftgrid") as HTMLElement;
  private readonly outEl = document.getElementById("craftout") as HTMLElement;
  private readonly storageEl = document.getElementById("storage") as HTMLElement;
  private readonly hotbarEl = document.getElementById("invhotbar") as HTMLElement;
  private readonly heldEl = document.getElementById("held") as HTMLElement;
  private readonly titleEl = document.getElementById("invtitle") as HTMLElement;
  private readonly recipeHint = document.getElementById("recipehint") as HTMLElement;

  private readonly gridSlots: HTMLElement[] = [];
  private readonly storageSlots: HTMLElement[] = [];
  private readonly hotbarSlots: HTMLElement[] = [];

  /** 作業台の盤面。3x3 固定で持ち、2x2 のときは左上だけを使う。 */
  private readonly grid: Slot[] = Array.from({ length: GRID_SLOTS }, emptySlot);
  private readonly held: Slot = emptySlot();
  private size: CraftSize = 2;
  private open = false;

  /** 中身が変わったときに呼ばれる（ホットバーの再描画とセーブに使う）。 */
  onChange: () => void = () => {};
  /** クラフトが成立して 1 回ぶん取り出したとき（音を鳴らすのに使う）。 */
  onCraft: () => void = () => {};

  constructor(private readonly inventory: Inventory) {
    this.build(this.gridEl, this.gridSlots, GRID_SLOTS, (i, whole) => this.clickGrid(i, whole));
    this.build(this.storageEl, this.storageSlots, STORAGE_SIZE, (i, whole) =>
      this.clickInventory(i + HOTBAR_SIZE, whole),
    );
    this.build(this.hotbarEl, this.hotbarSlots, HOTBAR_SIZE, (i, whole) =>
      this.clickInventory(i, whole),
    );

    this.outEl.innerHTML = slotMarkup();
    this.outEl.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.takeResult();
    });

    this.root.addEventListener("contextmenu", (event) => event.preventDefault());
    document.addEventListener("mousemove", (event) => {
      if (!this.open) return;
      this.heldEl.style.left = `${event.clientX}px`;
      this.heldEl.style.top = `${event.clientY}px`;
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(size: CraftSize): void {
    this.size = size;
    this.open = true;
    this.root.classList.remove("hidden");
    this.gridEl.classList.toggle("small", size === 2);
    this.titleEl.textContent = size === 3 ? "作業台" : "インベントリ";
    this.refresh();
  }

  /** 盤面と掴んでいる山を戻してから閉じる。 */
  hide(): void {
    if (!this.open) return;
    for (const slot of this.grid) {
      if (isEmpty(slot)) continue;
      const left = this.inventory.add(slot.item, slot.count);
      slot.count = left;
      if (left <= 0) clearSlot(slot);
    }
    if (!isEmpty(this.held)) {
      const left = this.inventory.add(this.held.item, this.held.count);
      this.held.count = left;
      if (left <= 0) clearSlot(this.held);
    }
    this.open = false;
    this.root.classList.add("hidden");
    this.onChange();
  }

  private build(
    parent: HTMLElement,
    into: HTMLElement[],
    count: number,
    onClick: (index: number, whole: boolean) => void,
  ): void {
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "slot";
      el.innerHTML = slotMarkup();
      el.addEventListener("mousedown", (event) => {
        if (event.button !== 0 && event.button !== 2) return;
        event.preventDefault();
        onClick(i, event.button === 0);
      });
      parent.appendChild(el);
      into.push(el);
    }
  }

  /** 盤面のうち、いま使えるスロットか（2x2 のときは左上 4 つだけ）。 */
  private inGrid(index: number): boolean {
    if (this.size === 3) return true;
    const x = index % 3;
    const y = Math.floor(index / 3);
    return x < 2 && y < 2;
  }

  private clickGrid(index: number, whole: boolean): void {
    if (!this.inGrid(index)) return;
    this.transfer(this.grid[index], whole);
    this.refresh();
  }

  private clickInventory(index: number, whole: boolean): void {
    this.transfer(this.inventory.slots[index], whole);
    this.refresh();
  }

  /**
   * 掴んでいる山とスロットのやり取り。
   * whole = 左クリック（山ごと）、false = 右クリック（1 個ずつ／半分掴む）。
   */
  private transfer(slot: Slot, whole: boolean): void {
    const held = this.held;

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
  private takeResult(): void {
    const recipe = findRecipe(this.activeGrid(), this.size);
    if (!recipe) return;

    if (isEmpty(this.held)) {
      this.held.item = recipe.out;
      this.held.count = recipe.count;
    } else if (this.held.item === recipe.out) {
      if (this.held.count + recipe.count > itemStackLimit(recipe.out)) return;
      this.held.count += recipe.count;
    } else {
      return;
    }
    consumeGrid(this.activeGrid());
    this.onCraft();
    this.refresh();
  }

  /** 2x2 のときは左上 4 つだけを並べ直した盤面を返す。 */
  private activeGrid(): Slot[] {
    if (this.size === 3) return this.grid;
    return [this.grid[0], this.grid[1], this.grid[3], this.grid[4]];
  }

  refresh(): void {
    for (let i = 0; i < GRID_SLOTS; i++) {
      const usable = this.inGrid(i);
      this.gridSlots[i].classList.toggle("disabled", !usable);
      paintSlot(this.gridSlots[i], usable ? this.grid[i] : null);
    }
    for (let i = 0; i < this.storageSlots.length; i++) {
      paintSlot(this.storageSlots[i], this.inventory.slots[i + HOTBAR_SIZE]);
    }
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      paintSlot(this.hotbarSlots[i], this.inventory.slots[i]);
      this.hotbarSlots[i].classList.toggle("active", i === this.inventory.selected);
    }

    const recipe = findRecipe(this.activeGrid(), this.size);
    paintSlot(this.outEl, recipe ? { item: recipe.out, count: recipe.count } : null);
    this.recipeHint.textContent = recipe
      ? `${recipe.name} x${recipe.count}`
      : this.size === 2
        ? "2x2 まで。道具は作業台が要ります"
        : "";

    const holding = !isEmpty(this.held);
    this.heldEl.classList.toggle("hidden", !holding);
    if (holding) {
      this.heldEl.style.background = itemCssColor(this.held.item);
      this.heldEl.textContent = this.held.count > 1 ? String(this.held.count) : "";
      this.heldEl.title = itemName(this.held.item);
    }
    this.onChange();
  }
}
