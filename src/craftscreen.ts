import { consumeGrid, findRecipe } from "./crafting";
import {
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  clearSlot,
  isEmpty,
  type Inventory,
  type Slot,
} from "./inventory";
import { NO_ITEM, itemStackLimit } from "./items";
import {
  cookFraction,
  isFuel,
  isLit,
  isSmeltable,
  pendingResult,
  type FurnaceState,
} from "./smelting";

/**
 * かまどの中身の型は、UI からもここ経由で引けるようにしておく。
 * **`inventoryui.ts` に `smelting.ts` を import させないため** ——
 * import できてしまうと、精錬の判断を UI 側に書く道ができる
 * （`crafting.ts` を import させないのと同じ理由。`test/craftscreen.test.ts` が見張っている）。
 */
export type { FurnaceState } from "./smelting";

/** 作業台なら 3x3、手持ちなら 2x2。 */
export type CraftSize = 2 | 3;

/** 盤面は常に 3x3 ぶん持ち、2x2 のときは左上だけを使う。 */
export const GRID_SLOTS = 9;

/**
 * 触った場所。DOM は「どこを触ったか」だけを渡し、意味を付けない。
 *
 * `input` / `fuel` / `output` はかまどの 3 枠。**`output` は取り出し専用**で、
 * ここに物を入れる経路をどこにも作らないこと（材料でないものが焼き上がりに化ける）。
 */
export type SlotArea = "grid" | "inv" | "input" | "fuel" | "output";

/** 画面の種類。作業台／手持ちなら "craft"、かまどを開いていれば "furnace"。 */
export type ScreenMode = "craft" | "furnace";

/** かまどの 3 枠。UI とテストが並べて回すのに使う。 */
export const FURNACE_AREAS: readonly SlotArea[] = ["input", "fuel", "output"];

/** 左 = 0、右 = 2（`MouseEvent.button` と同じ番号）。中クリックは受けない。 */
export type MouseButton = 0 | 2;

/** 入力 1 回の結果。UI はこれを見て描き直す／音を鳴らす／通知を出すだけ。 */
export interface ScreenResult {
  changed: boolean;
  crafted: boolean;
  /** 捨てたもの（通知に出す）。捨てていなければ null。 */
  discarded: { item: number; count: number } | null;
}

const NOTHING: ScreenResult = { changed: false, crafted: false, discarded: null };
const CHANGED: ScreenResult = { changed: true, crafted: false, discarded: null };
const CRAFTED: ScreenResult = { changed: true, crafted: true, discarded: null };

interface SlotRef {
  area: SlotArea;
  index: number;
}

/**
 * 押したときに一緒に押されていたもの。**DOM の事実だけを渡すこと**（意味は付けない）。
 * どれがどの操作になるかを決めるのは `press()` の仕事。
 */
export interface PressMods {
  /** Shift が押されていた（`MouseEvent.shiftKey`）。 */
  shift: boolean;
  /** 2 回目のクリックだった（`MouseEvent.detail === 2`）。 */
  double: boolean;
}

const NO_MODS: PressMods = { shift: false, double: false };

/** 一括クラフトの空回り止め。盤面は毎回 1 個ずつ減るので、本来ここまで回らない。 */
const MAX_QUICK_CRAFT = 512;

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

  /**
   * 開いているかまどの中身。**`grid` と寿命が違う** —— 盤面は画面を閉じると
   * インベントリへ返すが、かまどの中身は**ワールドの持ち物**なのでそのまま残る
   * （`furnaces.ts` が持っていて、こちらは参照を借りているだけ）。
   * **`returnAll()` で触らないこと。**
   */
  private furnaceState: FurnaceState | null = null;

  private dragButton: MouseButton | null = null;
  /** 撫でたスロット。撫でた順のまま、重複なし。 */
  private dragSlots: SlotRef[] = [];
  private dragItem = NO_ITEM;
  private dragTotal = 0;

  /**
   * いまカーソルが乗っているスロット。**UI にこれを持たせないこと**
   * （数字キーの行き先を決めるのは判断なので、こちら側で持つ）。
   */
  private hovered: SlotRef | null = null;

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

  get isDragging(): boolean {
    return this.dragButton !== null;
  }

  get mode(): ScreenMode {
    return this.furnaceState ? "furnace" : "craft";
  }

  /** 開いているかまど。開いていなければ null（UI が中身を描くのに使う）。 */
  get furnace(): FurnaceState | null {
    return this.furnaceState;
  }

  openScreen(size: CraftSize): void {
    this.furnaceState = null;
    this.craftSize = size;
    this.open = true;
  }

  /** かまどを開く。**中身は借り物**なので、閉じてもインベントリへ返さない。 */
  openFurnace(state: FurnaceState): void {
    this.furnaceState = state;
    this.open = true;
  }

  /**
   * 盤面と掴んでいる山を戻してから閉じる。
   * **かまどの中身は返さない**（ワールドに置いてあるものなので、そのまま残る）。
   */
  close(): void {
    if (!this.open) return;
    this.cancelDrag();
    this.returnAll();
    this.furnaceState = null;
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

  /**
   * 盤面のうち、いま使えるスロットか（2x2 のときは左上 4 つだけ）。
   * **かまどを開いている間は 1 枠も使えない**（盤面そのものを出さないので、
   * 触れる経路が残っていると画面に無いスロットに物を入れられてしまう）。
   */
  usable(index: number): boolean {
    if (this.furnaceState) return false;
    if (this.craftSize === 3) return true;
    const x = index % 3;
    const y = Math.floor(index / 3);
    return x < 2 && y < 2;
  }

  // --- 入力 ---

  /**
   * ボタンを押した。**掴んでいるものがあるときは、ここでは何も書かずにドラッグを構える**。
   * 確定は `release()` まで遅らせるので、`cancelDrag()` に巻き戻しが要らない。
   */
  press(area: SlotArea, index: number, button: MouseButton, mods: PressMods = NO_MODS): ScreenResult {
    // どの入力がどの操作かを決めるのはここ。UI は shiftKey / detail をそのまま渡すだけ。
    if (button === 0 && mods.shift) return this.quickMove(area, index);
    if (button === 0 && mods.double) return this.gather();

    this.cancelDrag();
    const slot = this.slotAt(area, index);
    if (!slot) return NOTHING;

    // 手が空なら、その場で掴んで終わり（空手でのスイープは持たない）
    if (isEmpty(this.heldSlot)) {
      if (isEmpty(slot)) return NOTHING;
      this.transfer(slot, button === 0);
      return CHANGED;
    }

    // 焼き上がりの枠には置けない。**ドラッグも構えないこと**（撫でた集合に
    // 混ざると、そこだけ飛ばす特例を配り方の側にも書くことになる）。
    if (!this.canPlaceInto(area)) return NOTHING;

    this.dragButton = button;
    this.dragSlots = [{ area, index }];
    this.dragItem = this.heldSlot.item;
    this.dragTotal = this.heldSlot.count;
    return CHANGED;
  }

  /**
   * カーソルがスロットに入った。`pressed` は `MouseEvent.buttons !== 0`（DOM の事実）。
   *
   * 押したままなら撫でた集合に足し、離れていれば構えを確定する
   * （窓の外でボタンを離して戻ってきた場合。取りこぼすと配分が宙に浮く）。
   * 同時にカーソルの居場所も覚える —— 数字キーの行き先がこれで決まる。
   */
  hover(area: SlotArea, index: number, pressed: boolean): ScreenResult {
    const released = pressed ? NOTHING : this.release();
    this.hovered = this.slotAt(area, index) ? { area, index } : null;
    if (!pressed || this.dragButton === null) return released;
    if (this.dragSlots.some((ref) => ref.area === area && ref.index === index)) return released;
    if (!this.slotAt(area, index) || !this.canPlaceInto(area)) return released;
    this.dragSlots.push({ area, index });
    return CHANGED;
  }

  /** カーソルがスロットから出た。出た先が別のスロットなら `hover` が上書きする。 */
  hoverOut(area: SlotArea, index: number): void {
    if (this.hovered?.area === area && this.hovered.index === index) this.hovered = null;
  }

  /**
   * ボタンを離して確定する。
   *
   * **撫でたのが 1 枠だけなら、今までのクリックと同じ扱いにすること。**
   * ドラッグの規則（別アイテムの枠は飛ばす）とクリックの規則（別アイテムは入れ替える）は
   * 違うので、ここを分けないと**今までの入れ替え操作が黙って効かなくなる**。
   */
  release(): ScreenResult {
    if (this.dragButton === null) return NOTHING;
    const whole = this.dragButton === 0;
    const refs = this.dragSlots;
    this.clearDrag();

    if (refs.length === 1) {
      const slot = this.slotAt(refs[0].area, refs[0].index);
      if (slot) this.transfer(slot, whole);
      return CHANGED;
    }

    const targets = this.slotsOf(refs);
    const item = this.heldSlot.item;
    const plan = planDrag(targets, item, this.heldSlot.count, whole);
    for (let i = 0; i < targets.length; i++) {
      if (plan[i] <= 0) continue;
      targets[i].item = item;
      targets[i].count += plan[i];
      this.heldSlot.count -= plan[i];
    }
    if (this.heldSlot.count <= 0) clearSlot(this.heldSlot);
    return CHANGED;
  }

  /** 構えを捨てる。まだ何も書いていないので巻き戻しは要らない。 */
  cancelDrag(): ScreenResult {
    if (this.dragButton === null) return NOTHING;
    this.clearDrag();
    return CHANGED;
  }

  private clearDrag(): void {
    this.dragButton = null;
    this.dragSlots = [];
    this.dragItem = NO_ITEM;
    this.dragTotal = 0;
  }

  // --- シフトクリック・ダブルクリック・数字キー ---

  /**
   * シフトクリックの一発移動。**掴んでいる最中は効かない**（Minecraft と同じ。
   * 手に持ったまま動かすと、どっちを動かしたのか分からなくなる）。
   *
   * 行き先は「いま居ない側」: 盤面 → インベントリ、ホットバー → 収納、収納 → ホットバー。
   * 入りきらなかったぶんはその場に残す（黙って消さない）。
   */
  quickMove(area: SlotArea, index: number): ScreenResult {
    if (!isEmpty(this.heldSlot)) return NOTHING;
    const slot = this.slotAt(area, index);
    if (!slot || isEmpty(slot)) return NOTHING;

    const left = area === "inv" ? this.quickMoveFromInventory(slot, index) : this.inventory.add(slot.item, slot.count);

    if (left === slot.count) return NOTHING; // 1 個も動かなかった
    slot.count = left;
    if (left <= 0) clearSlot(slot);
    return CHANGED;
  }

  /**
   * インベントリの枠をシフトクリックしたときの行き先。
   *
   * **かまどを開いている間は、まずかまどへ入れる** —— 焼けるものは材料の枠、
   * 燃料は燃料の枠。どちらでもなければ今までどおりホットバー ↔ 収納で動かす。
   * これが無いと、かまどに入れるのに毎回つまんで運ぶことになる。
   */
  private quickMoveFromInventory(slot: Slot, index: number): number {
    const furnace = this.furnaceState;
    if (furnace) {
      // 焼けるものと燃料の両方であるアイテム（板など）は**材料を優先**する。
      // 燃料へ入れたいときはつまんで置けばよいが、材料は他に入れる場所が無い。
      const target = isSmeltable(slot.item)
        ? furnace.input
        : isFuel(slot.item)
          ? furnace.fuel
          : null;
      if (target) return moveInto(target, slot);
    }
    return index < HOTBAR_SIZE
      ? this.inventory.addRange(slot.item, slot.count, HOTBAR_SIZE, INVENTORY_SIZE)
      : this.inventory.addRange(slot.item, slot.count, 0, HOTBAR_SIZE);
  }

  /**
   * ダブルクリックのかき集め。掴んでいる山と同じアイテムを、上限まで集める。
   *
   * **半端な山から先に取る**（Minecraft と同じ）。満杯の山から崩すと、
   * 集めたあとにインベントリが半端な山だらけになる。
   */
  gather(): ScreenResult {
    if (isEmpty(this.heldSlot)) return NOTHING;
    const item = this.heldSlot.item;
    const limit = itemStackLimit(item);
    if (this.heldSlot.count >= limit) return NOTHING;

    // かまどを開いている間は材料と燃料の枠からも集める。**焼き上がりからは集めない**
    // （取り出し専用の枠なので、集める側にだけ通り道を作ると規則が食い違う）。
    const furnace = this.furnaceState;
    const pool = [
      ...this.inventory.slots,
      ...this.grid.filter((_, i) => this.usable(i)),
      ...(furnace ? [furnace.input, furnace.fuel] : []),
    ];
    let moved = 0;
    for (const partial of [true, false]) {
      for (const slot of pool) {
        if (this.heldSlot.count >= limit) break;
        if (slot === this.heldSlot || slot.item !== item || isEmpty(slot)) continue;
        if (partial !== slot.count < limit) continue;
        const take = Math.min(limit - this.heldSlot.count, slot.count);
        this.heldSlot.count += take;
        slot.count -= take;
        moved += take;
        if (slot.count <= 0) clearSlot(slot);
      }
    }
    return moved > 0 ? CHANGED : NOTHING;
  }

  /**
   * カーソルの下のスロットと、ホットバーの `hotbarIndex` 枠を入れ替える（数字キー）。
   * カーソルがスロットの上に無い／掴んでいる／ドラッグ中なら何もしない。
   */
  swapHotbar(hotbarIndex: number): ScreenResult {
    if (hotbarIndex < 0 || hotbarIndex >= HOTBAR_SIZE) return NOTHING;
    if (!isEmpty(this.heldSlot) || this.dragButton !== null) return NOTHING;
    const at = this.hovered;
    if (!at) return NOTHING;
    // 焼き上がりの枠は取り出し専用。入れ替えは「置く」でもあるので通さない。
    if (!this.canPlaceInto(at.area)) return NOTHING;
    // 同じ枠を指しているなら何もしない（自分自身と入れ替えても意味がない）
    if (at.area === "inv" && at.index === hotbarIndex) return NOTHING;
    const slot = this.slotAt(at.area, at.index);
    const target = this.inventory.slots[hotbarIndex];
    if (!slot) return NOTHING;
    if (isEmpty(slot) && isEmpty(target)) return NOTHING;

    const item = slot.item;
    const count = slot.count;
    slot.item = target.item;
    slot.count = target.count;
    target.item = item;
    target.count = count;
    return CHANGED;
  }

  // --- ドラッグ中のプレビュー（確定と同じ planDrag を通すので食い違わない） ---

  /** そのスロットへ乗る予定の個数（0 = 予定なし）。 */
  dragPlanFor(area: SlotArea, index: number): number {
    if (this.dragButton === null || this.dragSlots.length < 2) return 0;
    const at = this.dragSlots.findIndex((ref) => ref.area === area && ref.index === index);
    if (at < 0) return 0;
    return this.dragPlan()[at];
  }

  /** 配ったあと手に残る予定の数。構えていなければ今の数。 */
  heldPreviewCount(): number {
    if (this.dragButton === null || this.dragSlots.length < 2) return this.heldSlot.count;
    return this.dragTotal - this.dragPlan().reduce((sum, n) => sum + n, 0);
  }

  /** 配る予定のアイテム（プレビューの色に使う）。 */
  get dragPreviewItem(): number {
    return this.dragItem;
  }

  // --- 破棄 ---

  /**
   * 掴んでいる山を捨てる。捨てたぶんは `onDiscard` で外へ出し、`main.ts` が地面に落とす。
   *
   * だから既定（Q キー）は 1 個だけにして、丸ごと捨てるのは
   * 「画面外を狙って左クリックした」ときにだけ与えている。
   * ドラッグを構えている最中は捨てない（撫でた先に配るつもりだったものを消さない）。
   */
  discardHeld(all: boolean): ScreenResult {
    if (this.dragButton !== null) return NOTHING;
    if (isEmpty(this.heldSlot)) return NOTHING;
    const item = this.heldSlot.item;
    const count = all ? this.heldSlot.count : 1;
    this.heldSlot.count -= count;
    if (this.heldSlot.count <= 0) clearSlot(this.heldSlot);
    return { changed: true, crafted: false, discarded: { item, count } };
  }

  private dragPlan(): number[] {
    return planDrag(
      this.slotsOf(this.dragSlots),
      this.dragItem,
      this.dragTotal,
      this.dragButton === 0,
    );
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

  /**
   * 出来上がりを受け取る。`all`（シフトクリック）なら**作れるだけ作ってインベントリへ直接**入れる。
   *
   * 一括のほうは掴んでいる山を経由しません（上限 64 で頭打ちになって、
   * 「シフトを押したのに 1 回ぶんしか作れない」形になるため）。
   */
  takeResult(all = false): ScreenResult {
    // かまどには「作る」ボタンが無い（焼き上がりは本物のスロットで、つまんで取る）。
    if (this.furnaceState) return NOTHING;
    if (all) return this.quickCraft();
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
   * 作れるだけ作ってインベントリへ入れる（結果スロットのシフトクリック）。
   * **入りきらなくなった時点で止める** —— 作ってから捨てることになってはいけない。
   */
  private quickCraft(): ScreenResult {
    let made = 0;
    for (let n = 0; n < MAX_QUICK_CRAFT; n++) {
      const recipe = findRecipe(this.activeGrid(), this.craftSize);
      if (!recipe) break;
      if (this.inventory.roomFor(recipe.out) < recipe.count) break;
      consumeGrid(this.activeGrid());
      this.inventory.add(recipe.out, recipe.count);
      made++;
    }
    return made > 0 ? CRAFTED : NOTHING;
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

  /** 描くための 1 枠。使えない枠なら null（UI に `usable` の規則を持たせない）。 */
  slotFor(area: SlotArea, index = 0): Slot | null {
    return this.slotAt(area, index);
  }

  /**
   * かまどの様子。**何を出すかはここで決める** —— UI に「燃料が無い」「焼けない」の
   * 判定を書くと、その分岐だけブラウザを開くまで確かめられなくなる。
   * かまどを開いていなければ null。
   */
  furnaceStatus(): { lit: boolean; text: string } | null {
    const furnace = this.furnaceState;
    if (!furnace) return null;
    const lit = isLit(furnace);

    if (lit) {
      const cook = Math.round(cookFraction(furnace) * 100);
      return { lit, text: `焼き上がり ${cook}% / 燃料 あと ${Math.ceil(furnace.burnLeft)} 秒` };
    }
    if (isEmpty(furnace.input)) return { lit, text: "材料と燃料を入れる" };
    if (!isSmeltable(furnace.input.item)) return { lit, text: "これは焼けません" };
    if (!pendingResult(furnace)) return { lit, text: "焼き上がりの枠がいっぱいです" };
    if (isEmpty(furnace.fuel)) return { lit, text: "燃料がありません" };
    return { lit, text: "この燃料では燃えません" };
  }

  /** 出来上がりの見本。無ければ null。文字の組み立ては UI 側でやる。 */
  result(): { item: number; count: number; name: string } | null {
    if (this.furnaceState) return null;
    const recipe = findRecipe(this.activeGrid(), this.craftSize);
    return recipe ? { item: recipe.out, count: recipe.count, name: recipe.name } : null;
  }

  // --- セーブ ---

  /**
   * 盤面 9 + 掴んでいる山 1 = `[item, count, ...]` の 20 要素。空きは `0,0` で位置を保つ
   * （`Inventory.serialize()` と同じ作法）。**全部空なら undefined を返してキーごと省く。**
   *
   * これは「盤面のスナップショット」ではなく**「まだインベントリに戻していない預かり物」**。
   * 読み込み側は `returnAll()` で全部インベントリへ返すので、盤面の大きさは持たない
   * （3x3 のまま復元すると、次に 2x2 で開いた人が外周 5 マスを取り出せなくなる）。
   */
  serialize(): number[] | undefined {
    const all = [...this.grid, this.heldSlot];
    if (all.every(isEmpty)) return undefined;
    const flat: number[] = [];
    for (const slot of all) flat.push(isEmpty(slot) ? 0 : slot.item, isEmpty(slot) ? 0 : slot.count);
    return flat;
  }

  /** 盤面と掴んでいる山を、インベントリへ戻さず空にする（保存データの削除で使う）。 */
  discardAll(): void {
    for (const slot of [...this.grid, this.heldSlot]) clearSlot(slot);
  }

  deserialize(flat: number[] | undefined): void {
    this.discardAll();
    if (!Array.isArray(flat)) return;
    const all = [...this.grid, this.heldSlot];
    for (let i = 0; i < all.length; i++) {
      const item = flat[i * 2] ?? 0;
      const count = flat[i * 2 + 1] ?? 0;
      if (!item || count <= 0) continue;
      all[i].item = item;
      all[i].count = Math.min(count, itemStackLimit(item));
    }
  }

  /** 触ったスロット。使えない枠（2x2 のときの外周・かまどを開いていないとき）なら null。 */
  private slotAt(area: SlotArea, index: number): Slot | null {
    if (area === "grid") return this.usable(index) ? this.grid[index] : null;
    if (area === "inv") return this.inventory.slots[index] ?? null;
    const furnace = this.furnaceState;
    if (!furnace) return null;
    if (area === "input") return furnace.input;
    if (area === "fuel") return furnace.fuel;
    return furnace.output;
  }

  /**
   * そこに物を**置ける**か。**焼き上がりの枠だけは取り出し専用。**
   * 置ける経路を 1 つでも残すと、材料でないものが出力に入って
   * 「焼いていないのに出てくる」形になる。
   */
  private canPlaceInto(area: SlotArea): boolean {
    return area !== "output";
  }

  private slotsOf(refs: readonly SlotRef[]): Slot[] {
    return refs.map((ref) => this.slotAt(ref.area, ref.index) as Slot);
  }
}

/**
 * `from` の中身を `into` の 1 枠へ入るだけ移し、**入らなかった数を返す**
 * （`Inventory.add()` とまったく同じ約束にしてある）。
 * 別のアイテムが入っている枠へは 1 個も入れない（入れ替えはしない）。
 *
 * **`from` は減らさないこと。** 減らすのは呼ぶ側（`quickMove`）の仕事で、
 * あちらが「1 個も動かなかったら何もしない」を戻り値で判断している。
 */
function moveInto(into: Slot, from: Slot): number {
  if (!isEmpty(into) && into.item !== from.item) return from.count;
  const base = isEmpty(into) ? 0 : into.count;
  const put = Math.min(itemStackLimit(from.item) - base, from.count);
  if (put <= 0) return from.count;
  into.item = from.item;
  into.count = base + put;
  return from.count - put;
}

/**
 * 撫でたスロットへの配り方。**今回の判定の芯**なので、純関数にして単独でテストする。
 *
 * 配れるのは「空か、同じアイテムでまだ空きがある」枠だけ（別アイテムの枠は飛ばす）。
 * 均等（左ドラッグ）なら頭数で割り、1 個ずつ（右ドラッグ）なら 1。
 * **上限で入りきらなかったぶんは配り直さず手に残す**（Minecraft と同じ）。
 *
 * **不変条件: 配った合計 + 手に残る数 = 開始時の数。** ここが崩れるとアイテムが増減する。
 */
export function planDrag(
  targets: readonly Slot[],
  item: number,
  total: number,
  even: boolean,
): number[] {
  const plan = targets.map(() => 0);
  if (item === NO_ITEM || total <= 0) return plan;

  const limit = itemStackLimit(item);
  const room = targets.map((slot) =>
    isEmpty(slot) ? limit : slot.item === item ? limit - slot.count : 0,
  );
  const eligible = room.filter((n) => n > 0).length;
  if (eligible === 0) return plan;

  // max(1, ...) が要る。3 個を 4 枠に配るときの 1,1,1,0 で、floor だけだと全部 0 になる。
  const share = even ? Math.max(1, Math.floor(total / eligible)) : 1;
  let left = total;
  for (let i = 0; i < targets.length && left > 0; i++) {
    if (room[i] <= 0) continue;
    const give = Math.min(share, room[i], left);
    plan[i] = give;
    left -= give;
  }
  return plan;
}
