import { type CraftScreen, type CraftSize, GRID_SLOTS, type MouseButton, type SlotArea } from "./craftscreen";
import { HOTBAR_SIZE, STORAGE_SIZE } from "./inventory";
import { itemCssColor, itemName } from "./items";
import { paintSlot, slotMarkup } from "./ui";

/**
 * インベントリ画面の**描画とマウスの配線だけ**。
 *
 * 何が起きるかを決めるのは `craftscreen.ts` で、**ここに判断を書かないこと**
 * （`test/craftscreen.test.ts` がソースを読んで見張っています）。
 * ここが崩れると、インベントリまわりが丸ごと「ブラウザを開くまで確かめられないもの」になります。
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

  /** 中身が変わったときに呼ばれる（ホットバーの再描画とセーブに使う）。 */
  onChange: () => void = () => {};
  /** クラフトが成立して 1 回ぶん取り出したとき（音を鳴らすのに使う）。 */
  onCraft: () => void = () => {};

  constructor(private readonly craft: CraftScreen) {
    this.build(this.gridEl, this.gridSlots, GRID_SLOTS, "grid", 0);
    this.build(this.storageEl, this.storageSlots, STORAGE_SIZE, "inv", HOTBAR_SIZE);
    this.build(this.hotbarEl, this.hotbarSlots, HOTBAR_SIZE, "inv", 0);

    this.outEl.innerHTML = slotMarkup();
    this.outEl.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.apply(this.craft.takeResult());
    });

    this.root.addEventListener("contextmenu", (event) => event.preventDefault());
    document.addEventListener("mousemove", (event) => {
      if (!this.craft.isOpen) return;
      this.heldEl.style.left = `${event.clientX}px`;
      this.heldEl.style.top = `${event.clientY}px`;
    });
  }

  get isOpen(): boolean {
    return this.craft.isOpen;
  }

  show(size: CraftSize): void {
    this.craft.openScreen(size);
    this.root.classList.remove("hidden");
    this.gridEl.classList.toggle("small", size === 2);
    this.titleEl.textContent = size === 3 ? "作業台" : "インベントリ";
    this.refresh();
  }

  hide(): void {
    if (!this.craft.isOpen) return;
    this.craft.close();
    this.root.classList.add("hidden");
    // **必ず描き直すこと。** #held は body の直下にあるので `#inventory` を隠しても
    // 一緒には消えず、掴んだまま閉じるとカーソルにアイテムが residue として残る。
    // refresh() の末尾が onChange() を呼ぶので、ホットバーと保存もここで済む。
    this.refresh();
  }

  private build(
    parent: HTMLElement,
    into: HTMLElement[],
    count: number,
    area: SlotArea,
    offset: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "slot";
      el.innerHTML = slotMarkup();
      el.addEventListener("mousedown", (event) => {
        if (event.button !== 0 && event.button !== 2) return;
        event.preventDefault();
        this.apply(this.craft.click(area, i + offset, event.button as MouseButton));
      });
      parent.appendChild(el);
      into.push(el);
    }
  }

  /** 判断の結果を画面と音に反映するだけ。 */
  private apply(result: { changed: boolean; crafted: boolean }): void {
    if (result.crafted) this.onCraft();
    if (result.changed) this.refresh();
  }

  refresh(): void {
    for (let i = 0; i < GRID_SLOTS; i++) {
      const usable = this.craft.usable(i);
      this.gridSlots[i].classList.toggle("disabled", !usable);
      paintSlot(this.gridSlots[i], usable ? this.craft.grid[i] : null);
    }
    for (let i = 0; i < this.storageSlots.length; i++) {
      paintSlot(this.storageSlots[i], this.craft.inventory.slots[i + HOTBAR_SIZE]);
    }
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      paintSlot(this.hotbarSlots[i], this.craft.inventory.slots[i]);
      this.hotbarSlots[i].classList.toggle("active", i === this.craft.inventory.selected);
    }

    const result = this.craft.result();
    paintSlot(this.outEl, result);
    this.recipeHint.textContent = result
      ? `${result.name} x${result.count}`
      : this.craft.size === 2
        ? "2x2 まで。道具は作業台が要ります"
        : "";

    // 画面を閉じている間は出さない。インベントリが満杯で戻しきれなかったぶんは
    // held に残るので、`held === null` だけを見ているとプレイ中も表示が残る。
    const held = this.craft.isOpen ? this.craft.held : null;
    this.heldEl.classList.toggle("hidden", held === null);
    if (held) {
      this.heldEl.style.background = itemCssColor(held.item);
      this.heldEl.textContent = held.count > 1 ? String(held.count) : "";
      this.heldEl.title = itemName(held.item);
    }
    this.onChange();
  }
}
