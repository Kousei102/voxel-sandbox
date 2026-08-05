import {
  type CraftScreen,
  type CraftSize,
  GRID_SLOTS,
  type MouseButton,
  type ScreenResult,
  type SlotArea,
} from "./craftscreen";
import { HOTBAR_SIZE, STORAGE_SIZE, type Slot } from "./inventory";
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
  /** アイテムを捨てたとき（通知を出すのに使う）。**捨てたものは戻らない。** */
  onDiscard: (item: number, count: number) => void = () => {};

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

    // パネルの外（暗幕）を狙ったクリックで捨てる。パネルの中で起きたイベントは
    // target が子要素になるので弾かれる。左 = 山ごと、右 = 1 個（他の操作と同じ規則）。
    this.root.addEventListener("mousedown", (event) => {
      if (event.target !== this.root) return;
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      this.apply(this.craft.discardHeld(event.button === 0));
    });
    document.addEventListener("mousemove", (event) => {
      if (!this.craft.isOpen) return;
      this.heldEl.style.left = `${event.clientX}px`;
      this.heldEl.style.top = `${event.clientY}px`;
    });

    // 撫でて配るぶんの確定。窓の外で離しても取りこぼさないよう window で受ける。
    // 構えていなければ CraftScreen 側が何もしないので、ここに判断は要らない。
    window.addEventListener("mouseup", () => this.apply(this.craft.release()));
    window.addEventListener("blur", () => this.apply(this.craft.release()));
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
        this.apply(this.craft.press(area, i + offset, event.button as MouseButton));
      });
      // 押したままスロットに入った、という事実だけを渡す。1 スロットにつき 1 回しか
      // 飛ばないので、撫でた集合の組み立てもヒットテストもここには要らない。
      el.addEventListener("mouseenter", (event) => {
        // 窓の外で離して戻ってきた場合。ボタンが押されていないのは DOM の事実。
        if (event.buttons === 0) this.apply(this.craft.release());
        else this.apply(this.craft.dragOver(area, i + offset));
      });
      parent.appendChild(el);
      into.push(el);
    }
  }

  /** 判断の結果を画面・音・通知に反映するだけ。 */
  private apply(result: ScreenResult): void {
    if (result.crafted) this.onCraft();
    if (result.discarded) this.onDiscard(result.discarded.item, result.discarded.count);
    if (result.changed) this.refresh();
  }

  /** 掴んでいる山を 1 個捨てる（Q キー）。入口は main.ts。 */
  discardOne(): void {
    this.apply(this.craft.discardHeld(false));
  }

  /**
   * スロット 1 枠を描く。ドラッグ中に配る予定があれば、その予定を乗せた姿にする。
   * **予定の数は `dragPlanFor()` に聞くこと**（確定と同じ `planDrag` を通るので食い違わない）。
   */
  private paint(el: HTMLElement, slot: Slot | null, area: SlotArea, index: number): void {
    const plan = this.craft.dragPlanFor(area, index);
    if (plan > 0) {
      const base = slot && slot.count > 0 ? slot.count : 0;
      paintSlot(el, { item: this.craft.dragPreviewItem, count: base + plan });
    } else {
      paintSlot(el, slot);
    }
    el.classList.toggle("preview", plan > 0);
  }

  refresh(): void {
    for (let i = 0; i < GRID_SLOTS; i++) {
      const usable = this.craft.usable(i);
      this.gridSlots[i].classList.toggle("disabled", !usable);
      this.paint(this.gridSlots[i], usable ? this.craft.grid[i] : null, "grid", i);
    }
    for (let i = 0; i < this.storageSlots.length; i++) {
      this.paint(this.storageSlots[i], this.craft.inventory.slots[i + HOTBAR_SIZE], "inv", i + HOTBAR_SIZE);
    }
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      this.paint(this.hotbarSlots[i], this.craft.inventory.slots[i], "inv", i);
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
      // 撫でている間は「配ったあとに残る数」を出す。離すとそのまま確定する。
      const left = this.craft.heldPreviewCount();
      this.heldEl.style.background = itemCssColor(held.item);
      this.heldEl.textContent = left > 1 ? String(left) : "";
      this.heldEl.title = itemName(held.item);
    }
    this.onChange();
  }
}
