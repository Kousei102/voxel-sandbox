import { addToChest, type ChestState } from "./chests";
import { consumeGrid, findRecipe } from "./crafting";
import {
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  clearSlot,
  isEmpty,
  type Inventory,
  type Slot,
} from "./inventory";
import { NO_ITEM, allItemIds, itemStackLimit } from "./items";
import {
  cookFraction,
  isFuel,
  isLit,
  isSmeltable,
  pendingResult,
  type FurnaceState,
} from "./smelting";

/**
 * かまどとチェストの中身の型は、UI からもここ経由で引けるようにしておく。
 * **`inventoryui.ts` に `smelting.ts` / `chests.ts` を import させないため** ——
 * import できてしまうと、精錬や入れ物の判断を UI 側に書く道ができる
 * （`crafting.ts` を import させないのと同じ理由。`test/craftscreen.test.ts` が見張っている）。
 */
export type { FurnaceState } from "./smelting";
export type { ChestState } from "./chests";
export { CHEST_SIZE } from "./chests";

/** 作業台なら 3x3、手持ちなら 2x2。 */
export type CraftSize = 2 | 3;

/** 盤面は常に 3x3 ぶん持ち、2x2 のときは左上だけを使う。 */
export const GRID_SLOTS = 9;

/**
 * 触った場所。DOM は「どこを触ったか」だけを渡し、意味を付けない。
 *
 * `input` / `fuel` / `output` はかまどの 3 枠。**`output` は取り出し専用**で、
 * ここに物を入れる経路をどこにも作らないこと（材料でないものが焼き上がりに化ける）。
 *
 * `chest` は 27 枠あるので、**`grid` / `inv` と同じ「`index` で引く」側**。
 * かまどの 3 枠が名前で引く形なのは、枠ごとに意味が違う（材料・燃料・出来上がり）ため。
 *
 * `creative` は**唯一「本物のスロットでない」枠**。無限の湧き口なので、押したときに
 * 何が起きるかは `pressCreative()` だけが決め、掴む・配る・入れ替えの経路
 * （`slotAt()`）には出さない（出すと、無限に出るものが山ごと動いてしまう）。
 */
export type SlotArea = "grid" | "inv" | "input" | "fuel" | "output" | "chest" | "creative";

/**
 * 画面の種類。作業台／手持ちなら "craft"、かまどなら "furnace"、チェストなら "chest"、
 * クリエイティブの一覧なら "creative"。
 * **開いている器はいつも 1 つだけ**（`openScreen` / `openFurnace` / `openChest` /
 * `openCreative` が互いを消す）。
 */
export type ScreenMode = "craft" | "furnace" | "chest" | "creative";

/** かまどの 3 枠。UI とテストが並べて回すのに使う。 */
export const FURNACE_AREAS: readonly SlotArea[] = ["input", "fuel", "output"];

/**
 * クリエイティブの一覧に並ぶアイテム。**`allItemIds()` をそのまま使う。**
 *
 * **別表を作らないこと** —— 手で並べると、ブロックやアイテムを足すたびに
 * 「作ったのにクリエイティブに出てこない」が起きます（ネザー・エンドで
 * まとめて増えるので、必ず踏みます）。並びは ID 順なので、ブロック（1..63）が先、
 * 棒・鉱物・道具・食べ物・バケツが後ろにまとまります。
 *
 * ここに無いのは**アイテムになれないもの**だけです（空気・液体そのもの・
 * 向き違いのブロック。`items.ts` がそもそもアイテムを作りません）。
 */
export const CREATIVE_ITEMS: readonly number[] = allItemIds();

/** 一覧の枠の数（UI が枠を作るのに使う）。 */
export const CREATIVE_SIZE = CREATIVE_ITEMS.length;

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

  /**
   * 開いているチェストの中身。**かまどとまったく同じ扱い** —— ワールドの持ち物なので、
   * 画面を閉じてもインベントリへ返さない（`chests.ts` が持っていて、参照を借りるだけ）。
   * **`returnAll()` で触らないこと。**
   */
  private chestState: ChestState | null = null;

  /**
   * クリエイティブの一覧を開いているか。**中身を持たない**のがかまど・チェストとの違い
   * （湧き口なので器が要らない）。だから `FurnaceState` のような状態ではなく真偽 1 つ。
   */
  private creativeOpen = false;

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
    if (this.furnaceState) return "furnace";
    if (this.chestState) return "chest";
    if (this.creativeOpen) return "creative";
    return "craft";
  }

  /**
   * いま盤面（クラフト）が使える画面か。**器を足すときはここへ 1 つ足すこと** ——
   * `usable()` / `result()` / `takeResult()` の 3 か所に条件を写すと、必ず 1 つ忘れて
   * 「画面に出ていない盤面で作れてしまう」形になります。
   */
  private get crafting(): boolean {
    return !this.furnaceState && !this.chestState && !this.creativeOpen;
  }

  /** 開いているかまど。開いていなければ null（UI が中身を描くのに使う）。 */
  get furnace(): FurnaceState | null {
    return this.furnaceState;
  }

  /** 開いているチェスト。開いていなければ null（UI が中身を描くのに使う）。 */
  get chest(): ChestState | null {
    return this.chestState;
  }

  openScreen(size: CraftSize): void {
    this.furnaceState = null;
    this.chestState = null;
    this.creativeOpen = false;
    this.craftSize = size;
    this.open = true;
  }

  /** かまどを開く。**中身は借り物**なので、閉じてもインベントリへ返さない。 */
  openFurnace(state: FurnaceState): void {
    this.chestState = null;
    this.creativeOpen = false;
    this.furnaceState = state;
    this.open = true;
  }

  /** チェストを開く。かまどと同じで、**中身は借り物**（閉じても返さない）。 */
  openChest(state: ChestState): void {
    this.furnaceState = null;
    this.creativeOpen = false;
    this.chestState = state;
    this.open = true;
  }

  /**
   * クリエイティブの一覧を開く。**器を渡さない**のが他の 3 つとの違い ——
   * 並ぶのは `CREATIVE_ITEMS`（湧き口）で、中身という状態がそもそも無い。
   * だから閉じるときに返すものも無く、壊したときに落ちるものも無い。
   */
  openCreative(): void {
    this.furnaceState = null;
    this.chestState = null;
    this.creativeOpen = true;
    this.open = true;
  }

  /**
   * 盤面と掴んでいる山を戻してから閉じる。
   * **かまど・チェストの中身は返さない**（ワールドに置いてあるものなので、そのまま残る）。
   */
  close(): void {
    if (!this.open) return;
    this.cancelDrag();
    this.returnAll();
    this.furnaceState = null;
    this.chestState = null;
    this.creativeOpen = false;
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
   * **かまど・チェストを開いている間は 1 枠も使えない**（盤面そのものを出さないので、
   * 触れる経路が残っていると画面に無いスロットに物を入れられてしまう）。
   */
  usable(index: number): boolean {
    if (!this.crafting) return false;
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
    // クリエイティブの一覧は本物のスロットでないので、**いちばん先に振り分ける**
    // （シフト・ダブルクリックの意味も一覧の中だけ違う）。
    if (area === "creative") return this.pressCreative(index, button, mods);

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
   * クリエイティブの一覧を押した。**Minecraft と同じ規則**にしてある。
   *
   * - 手が空: 左で 1 山（そのアイテムの上限まで）、右で 1 個、シフトでインベントリへ直接
   * - 手が塞がっている: **掴んでいるものを捨てる**（無限に出せる側なので、これが唯一のゴミ箱）
   *
   * **捨てたぶんを地面に落とさないこと**（`discarded` を返さない）。一覧をクリックする
   * たびに山が落ちると、寿命 5 分のゴミが足元に溜まり続けます。**ダブルクリックでは
   * 捨てません** —— 掴んだ直後の 2 回目が「掴んで即捨てる」に化けるためです。
   *
   * **1 山の数は `itemStackLimit()` に聞くこと。** 64 と書くと、バケツ（1 個まで）を
   * 一覧から取ったときだけ持てない数の山ができます。
   */
  private pressCreative(index: number, button: MouseButton, mods: PressMods): ScreenResult {
    // **開いていない一覧は効かないこと**（`slotAt()` が開いていない器の枠を返さないのと同じ）。
    // 画面に出ていない枠から物が湧く経路を、CSS の `display: none` 頼みにしない。
    if (!this.creativeOpen) return NOTHING;
    const item = CREATIVE_ITEMS[index] ?? NO_ITEM;
    if (item === NO_ITEM) return NOTHING;
    this.cancelDrag();

    if (!isEmpty(this.heldSlot)) {
      if (mods.double) return NOTHING;
      clearSlot(this.heldSlot);
      return CHANGED;
    }

    const limit = itemStackLimit(item);
    if (mods.shift) {
      const left = this.inventory.add(item, limit);
      return left < limit ? CHANGED : NOTHING;
    }
    this.heldSlot.item = item;
    this.heldSlot.count = button === 0 ? limit : 1;
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
   * **かまど・チェストを開いている間は、まずそちらへ入れる** —— かまどなら
   * 焼けるものは材料の枠、燃料は燃料の枠。チェストは中身を問わず 27 枠へ。
   * どちらでもなければ今までどおりホットバー ↔ 収納で動かす。
   * これが無いと、器に入れるのに毎回つまんで運ぶことになる。
   */
  private quickMoveFromInventory(slot: Slot, index: number): number {
    // チェストは**入れ物なので中身を選ばない**（かまどのような枠ごとの意味が無い）。
    if (this.chestState) return addToChest(this.chestState, slot.item, slot.count);
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
    // チェストは**全枠が対等**なので、そのまま全部プールに入る。
    const furnace = this.furnaceState;
    const pool = [
      ...this.inventory.slots,
      ...this.grid.filter((_, i) => this.usable(i)),
      ...(furnace ? [furnace.input, furnace.fuel] : []),
      ...(this.chestState ? this.chestState.slots : []),
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
    // かまど・チェストを開いている間は盤面そのものが出ていない。
    // （かまどの焼き上がりは本物のスロットで、つまんで取る）
    if (!this.crafting) return NOTHING;
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

  /**
   * 描くための 1 枠。使えない枠なら null（UI に `usable` の規則を持たせない）。
   *
   * **クリエイティブの一覧だけは「見せるための姿」を作って返す。** 本物のスロットは
   * 無いので、`slotAt()`（入力の側）には出しません。数は上限にしてあるので、
   * 触れば何個来るかが表示と一致します。
   */
  slotFor(area: SlotArea, index = 0): Slot | null {
    if (area === "creative") {
      const item = CREATIVE_ITEMS[index] ?? NO_ITEM;
      return item === NO_ITEM ? null : { item, count: itemStackLimit(item) };
    }
    return this.slotAt(area, index);
  }

  /**
   * かまどの様子。**何を出すかはここで決める** —— UI に「燃料が無い」「焼けない」の
   * 判定を書くと、その分岐だけブラウザを開くまで確かめられなくなる。
   * かまどを開いていなければ null。
   *
   * **文言は短いままにすること。** この文字はスロットの真下に浮かせてあり
   * （`style.css` の `#furnacehint`）、長くすると左へ伸びて燃料の枠に重なります。
   * 目安は全角 10 文字ぶんまで（`焼き上がり 100% / 燃料 あと 300 秒` で重なりました）。
   */
  furnaceStatus(): { lit: boolean; text: string } | null {
    const furnace = this.furnaceState;
    if (!furnace) return null;
    const lit = isLit(furnace);

    if (lit) {
      const cook = Math.round(cookFraction(furnace) * 100);
      return { lit, text: `焼き ${cook}% / 燃料 ${Math.ceil(furnace.burnLeft)} 秒` };
    }
    if (isEmpty(furnace.input)) return { lit, text: "材料と燃料を入れる" };
    if (!isSmeltable(furnace.input.item)) return { lit, text: "これは焼けません" };
    if (!pendingResult(furnace)) return { lit, text: "焼き上がりが満杯です" };
    if (isEmpty(furnace.fuel)) return { lit, text: "燃料がありません" };
    return { lit, text: "この燃料は燃えません" };
  }

  /** 出来上がりの見本。無ければ null。文字の組み立ては UI 側でやる。 */
  result(): { item: number; count: number; name: string } | null {
    if (!this.crafting) return null;
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

  /**
   * 触ったスロット。使えない枠（2x2 のときの外周・その器を開いていないとき）なら null。
   * **開いていない器の枠を返さないこと** —— 画面に出ていないスロットへ
   * 物を入れられる経路になる。
   */
  private slotAt(area: SlotArea, index: number): Slot | null {
    if (area === "grid") return this.usable(index) ? this.grid[index] : null;
    // クリエイティブの一覧は**入力の側には出さない**（湧き口であって、器ではない）。
    // 本物として返すと、掴む・配る・入れ替えがそのまま効いて一覧の中身が動く。
    if (area === "creative") return null;
    if (area === "inv") return this.inventory.slots[index] ?? null;
    if (area === "chest") return this.chestState?.slots[index] ?? null;
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
    // クリエイティブの一覧も置けない側（押したときの捨てるは `pressCreative()` の仕事で、
    // ドラッグの撫でた集合や数字キーの行き先にしてはいけない）。
    return area !== "output" && area !== "creative";
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
