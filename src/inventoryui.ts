import {
  CREATIVE_SIZE,
  type ChestState,
  type CraftScreen,
  type CraftSize,
  FURNACE_AREAS,
  type FurnaceState,
  GRID_SLOTS,
  LARGE_CHEST_SIZE,
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
  private readonly craftRow = document.getElementById("craftrow") as HTMLElement;
  private readonly gridEl = document.getElementById("craftgrid") as HTMLElement;
  private readonly furnaceRow = document.getElementById("furnacerow") as HTMLElement;
  private readonly furnaceArrow = document.getElementById("furnacearrow") as HTMLElement;
  private readonly furnaceHint = document.getElementById("furnacehint") as HTMLElement;
  private readonly outEl = document.getElementById("craftout") as HTMLElement;
  private readonly chestRow = document.getElementById("chestrow") as HTMLElement;
  private readonly chestEl = document.getElementById("chest") as HTMLElement;
  private readonly creativeRow = document.getElementById("creativerow") as HTMLElement;
  private readonly creativeEl = document.getElementById("creative") as HTMLElement;
  private readonly storageEl = document.getElementById("storage") as HTMLElement;
  private readonly hotbarEl = document.getElementById("invhotbar") as HTMLElement;
  private readonly heldEl = document.getElementById("held") as HTMLElement;
  private readonly titleEl = document.getElementById("invtitle") as HTMLElement;
  private readonly recipeHint = document.getElementById("recipehint") as HTMLElement;

  private readonly gridSlots: HTMLElement[] = [];
  /** かまどの 3 枠。並びは `FURNACE_AREAS`（材料・燃料・焼き上がり）。 */
  private readonly furnaceSlots: HTMLElement[] = [];
  /**
   * チェストの枠。**いちばん多いとき（隣り合った 2 個）の数だけ作って置く**ので、
   * 何枠出すかは `craft.chestSize` に聞いて `hidden` を付け外しする
   * （**ここに 27 / 54 を書かないこと**。数を決めるのは `chests.ts`）。
   */
  private readonly chestSlots: HTMLElement[] = [];
  /** クリエイティブの一覧。**枠の数も並びも `craftscreen.ts` が決める**（`CREATIVE_SIZE`）。 */
  private readonly creativeSlots: HTMLElement[] = [];
  private readonly storageSlots: HTMLElement[] = [];
  private readonly hotbarSlots: HTMLElement[] = [];

  /** 中身が変わったときに呼ばれる（ホットバーの再描画とセーブに使う）。 */
  onChange: () => void = () => {};
  /** クラフトが成立して 1 回ぶん取り出したとき（音を鳴らすのに使う）。 */
  onCraft: () => void = () => {};
  /** アイテムを捨てたとき（地面に落とし、通知を出すのに使う）。 */
  onDiscard: (item: number, count: number) => void = () => {};

  constructor(private readonly craft: CraftScreen) {
    this.build(this.gridEl, this.gridSlots, GRID_SLOTS, "grid", 0);

    // かまどの 3 枠は index.html に書いてあるので、作らずに中身と配線だけ入れる。
    // **id は文字列のまま並べること** —— `test/ui.test.ts` は id を引いている箇所の
    // 綴りを index.html と突き合わせているので、変数に逃がすとその検査が届かなくなる。
    this.furnaceSlots.push(
      document.getElementById("furnacein") as HTMLElement,
      document.getElementById("furnacefuel") as HTMLElement,
      document.getElementById("furnaceout") as HTMLElement,
    );
    this.furnaceSlots.forEach((el, i) => {
      el.innerHTML = slotMarkup();
      this.wire(el, FURNACE_AREAS[i], 0);
    });

    // チェストは枠数が多くて枠ごとの意味も無いので、かまどの 3 枠と違って
    // index.html に直書きせず、収納とまったく同じ `build()` で作る。
    // **いちばん多いときの数で作る** —— 単体のときに余る枠は refresh() が隠す
    // （開くたびに DOM を作り直すと、撫でて配る配線も張り直しになる）。
    this.build(this.chestEl, this.chestSlots, LARGE_CHEST_SIZE, "chest", 0);

    // クリエイティブの一覧。チェストと同じ作り方で、違うのは中身が湧き口だということ
    // （中身の出どころも、押したときに何が起きるかも craftscreen.ts が持っている）。
    this.build(this.creativeEl, this.creativeSlots, CREATIVE_SIZE, "creative", 0);

    this.build(this.storageEl, this.storageSlots, STORAGE_SIZE, "inv", HOTBAR_SIZE);
    this.build(this.hotbarEl, this.hotbarSlots, HOTBAR_SIZE, "inv", 0);

    this.outEl.innerHTML = slotMarkup();
    this.outEl.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.apply(this.craft.takeResult(event.shiftKey));
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

  /** かまどを開く。中身は `furnaces.ts` が持っているものを借りて描くだけ。 */
  showFurnace(state: FurnaceState): void {
    this.craft.openFurnace(state);
    this.root.classList.remove("hidden");
    this.titleEl.textContent = "かまど";
    this.refresh();
  }

  /** チェストを開く。かまどと同じで、中身は `chests.ts` のものを借りて描くだけ。 */
  showChest(state: ChestState): void {
    this.craft.openChest(state);
    this.root.classList.remove("hidden");
    this.titleEl.textContent = "チェスト";
    this.refresh();
  }

  /** クリエイティブの一覧を開く。**渡す中身が無い**のが他の 3 つとの違い。 */
  showCreative(): void {
    this.craft.openCreative();
    this.root.classList.remove("hidden");
    this.titleEl.textContent = "クリエイティブ";
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
      this.wire(el, area, i + offset);
      parent.appendChild(el);
      into.push(el);
    }
  }

  /**
   * スロット 1 枠にマウスを繋ぐ。**作った枠（盤面・収納）と、index.html に書いてある枠
   * （かまど）で同じ配線を使う** —— 分けると、片方だけ操作が効かない状態が作れてしまう。
   */
  private wire(el: HTMLElement, area: SlotArea, index: number): void {
    el.addEventListener("mousedown", (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      // shiftKey と detail は DOM の事実。どの操作になるかは craft 側が決める。
      this.apply(
        this.craft.press(area, index, event.button as MouseButton, {
          shift: event.shiftKey,
          double: event.detail === 2,
        }),
      );
    });
    // カーソルがスロットに入った／出た、という事実だけを渡す。1 スロットにつき 1 回しか
    // 飛ばないので、撫でた集合の組み立てもヒットテストもここには要らない。
    el.addEventListener("mouseenter", (event) => {
      this.apply(this.craft.hover(area, index, event.buttons !== 0));
    });
    el.addEventListener("mouseleave", () => this.craft.hoverOut(area, index));
  }

  /** 判断の結果を画面・音・通知に反映するだけ。 */
  private apply(result: ScreenResult): void {
    if (result.crafted) this.onCraft();
    if (result.discarded) this.onDiscard(result.discarded.item, result.discarded.count);
    if (result.changed) this.refresh();
  }

  /**
   * 掴んでいる山を捨てる（Q キー）。`all` なら山ごと。入口は main.ts。
   * **どちらになるかを決めるのは `CraftScreen.discardHeld()`** で、ここは素通し。
   */
  discardHeld(all: boolean): void {
    this.apply(this.craft.discardHeld(all));
  }

  /** カーソルの下のスロットとホットバーの枠を入れ替える（数字キー）。入口は main.ts。 */
  swapHotbar(index: number): void {
    this.apply(this.craft.swapHotbar(index));
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
    // 作業台・かまど・チェストの列は 1 つだけ出す。**どれを出すかは craft 側の mode**
    // （UI が「かまどか」を判断すると、そこだけテストが届かなくなる）。
    const mode = this.craft.mode;
    const furnace = this.craft.furnace;
    const chest = this.craft.chest;
    this.craftRow.classList.toggle("hidden", mode !== "craft");
    this.furnaceRow.classList.toggle("hidden", mode !== "furnace");
    this.chestRow.classList.toggle("hidden", mode !== "chest");
    this.creativeRow.classList.toggle("hidden", mode !== "creative");

    for (let i = 0; i < GRID_SLOTS; i++) {
      const usable = this.craft.usable(i);
      this.gridSlots[i].classList.toggle("disabled", !usable);
      this.paint(this.gridSlots[i], usable ? this.craft.grid[i] : null, "grid", i);
    }
    for (let i = 0; i < this.furnaceSlots.length; i++) {
      const area = FURNACE_AREAS[i];
      this.paint(this.furnaceSlots[i], furnace ? this.craft.slotFor(area) : null, area, 0);
    }
    if (furnace) {
      const status = this.craft.furnaceStatus();
      this.furnaceArrow.classList.toggle("lit", status?.lit === true);
      this.furnaceHint.textContent = status?.text ?? "";
    }
    // **出す枠数は `craft.chestSize`**（隣り合っていれば 54、単体なら 27）。
    // 余った枠は隠すだけで、中身は `slotFor()` が null を返すので描かれない。
    for (let i = 0; i < this.chestSlots.length; i++) {
      this.chestSlots[i].classList.toggle("hidden", i >= this.craft.chestSize);
      this.paint(this.chestSlots[i], chest ? this.craft.slotFor("chest", i) : null, "chest", i);
    }
    // 一覧の中身は変わらないが、**開いているときだけ描く**（他の器と同じ扱い）。
    // 数字を伏せるのは表示の都合だけ（何個来るかは吹き出しに出る）。
    for (let i = 0; i < this.creativeSlots.length; i++) {
      const slot = mode === "creative" ? this.craft.slotFor("creative", i) : null;
      paintSlot(this.creativeSlots[i], slot, false);
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
    // 出来上がるものの名前だけ。**説明文をここに戻さないこと** —— この文字は
    // スロットの真下に浮かせてあるので（`style.css` の `#recipehint`）、
    // 長い文は左へ伸びて盤面のスロットに重なります（レシピ名なら重なりません）。
    this.recipeHint.textContent = result ? `${result.name} x${result.count}` : "";

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
