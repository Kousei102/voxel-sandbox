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

  private dragButton: MouseButton | null = null;
  /** 撫でたスロット。撫でた順のまま、重複なし。 */
  private dragSlots: SlotRef[] = [];
  private dragItem = NO_ITEM;
  private dragTotal = 0;

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

  openScreen(size: CraftSize): void {
    this.craftSize = size;
    this.open = true;
  }

  /** 盤面と掴んでいる山を戻してから閉じる。 */
  close(): void {
    if (!this.open) return;
    this.cancelDrag();
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

  /**
   * ボタンを押した。**掴んでいるものがあるときは、ここでは何も書かずにドラッグを構える**。
   * 確定は `release()` まで遅らせるので、`cancelDrag()` に巻き戻しが要らない。
   */
  press(area: SlotArea, index: number, button: MouseButton): ScreenResult {
    this.cancelDrag();
    const slot = this.slotAt(area, index);
    if (!slot) return NOTHING;

    // 手が空なら、その場で掴んで終わり（空手でのスイープは持たない）
    if (isEmpty(this.heldSlot)) {
      if (isEmpty(slot)) return NOTHING;
      this.transfer(slot, button === 0);
      return CHANGED;
    }

    this.dragButton = button;
    this.dragSlots = [{ area, index }];
    this.dragItem = this.heldSlot.item;
    this.dragTotal = this.heldSlot.count;
    return CHANGED;
  }

  /** 押したまま別のスロットに入った。構えていなければ何もしない。 */
  dragOver(area: SlotArea, index: number): ScreenResult {
    if (this.dragButton === null) return NOTHING;
    if (!this.slotAt(area, index)) return NOTHING;
    if (this.dragSlots.some((ref) => ref.area === area && ref.index === index)) return NOTHING;
    this.dragSlots.push({ area, index });
    return CHANGED;
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
   * 掴んでいる山を捨てる。**落ちたアイテムの仕組みがまだ無いので、捨てたものは戻らない。**
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

  deserialize(flat: number[] | undefined): void {
    const all = [...this.grid, this.heldSlot];
    for (const slot of all) clearSlot(slot);
    if (!Array.isArray(flat)) return;
    for (let i = 0; i < all.length; i++) {
      const item = flat[i * 2] ?? 0;
      const count = flat[i * 2 + 1] ?? 0;
      if (!item || count <= 0) continue;
      all[i].item = item;
      all[i].count = Math.min(count, itemStackLimit(item));
    }
  }

  /** 触ったスロット。使えない盤面の枠なら null。 */
  private slotAt(area: SlotArea, index: number): Slot | null {
    if (area === "grid") return this.usable(index) ? this.grid[index] : null;
    return this.inventory.slots[index] ?? null;
  }

  private slotsOf(refs: readonly SlotRef[]): Slot[] {
    return refs.map((ref) => this.slotAt(ref.area, ref.index) as Slot);
  }
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
