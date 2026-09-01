/**
 * 置いてあるチェスト全部。**「位置ごとに状態を持つブロック」の 2 つ目**で、
 * かまど（`furnaces.ts`）とまったく同じ器に乗せてある。
 *
 * three にも DOM にも触らないので丸ごとヘッドレスで検証できる
 * （見張りは `test/chests.test.ts`）。
 *
 * **かまどと違って「進む」ものが無い。** 精錬のような時間の処理が無いので
 * `update(dt)` を持たず、`main.ts` も毎フレーム呼ばない。だから
 * `smelting.ts` + `furnaces.ts` のような 2 ファイル分割もしていない
 * （分ける理由は「規則が純粋関数として独立している」ことで、入れ物にはその中身が無い）。
 *
 * **`world.setVoxel` をここから呼ばないこと**（`furnaces.ts` / `drops.ts` と同じ制約）。
 */

import { CHEST } from "./blocks";
import { damageOf, deserializeWear, serializeWear } from "./durability";
import { addToSlots, clearSlot, isEmpty, type Slot } from "./inventory";
import { itemStackLimit, NO_ITEM } from "./items";

/**
 * チェストの枠数。**プレイヤーの収納と同じ 27**（Minecraft と同じ）。
 * 画面もプレイヤーの収納と同じ 9 列で描けるので、CSS も使い回せる。
 */
export const CHEST_SIZE = 27;

/**
 * 隣り合った 2 個を 1 つとして開いたときの枠数（27 x 2）。
 *
 * **これは「新しい入れ物の大きさ」ではありません。** 中身は 1 マスにつき 27 枠のまま
 * `map` に残っていて、54 枠は `open()` がそのつど作る**参照の並び**です
 * （`Chests.open()` の項を参照）。
 */
export const LARGE_CHEST_SIZE = CHEST_SIZE * 2;

export interface ChestState {
  readonly slots: Slot[];
}

export function createChest(): ChestState {
  return { slots: Array.from({ length: CHEST_SIZE }, () => ({ item: NO_ITEM, count: 0 })) };
}

/** 空っぽか（セーブから省いてよいか）。 */
export function isChestEmpty(state: ChestState): boolean {
  return state.slots.every(isEmpty);
}

/** `[item, count, ...]` を 27 枠ぶん。空きは `0,0` で**位置を保つ**。 */
export function serializeChest(state: ChestState): number[] {
  const flat: number[] = [];
  for (const slot of state.slots) {
    flat.push(isEmpty(slot) ? 0 : slot.item, isEmpty(slot) ? 0 : slot.count);
  }
  return flat;
}

/**
 * 中に入っている道具の傷を 27 枠ぶん（位置は `serializeChest()` と同じ）。
 * **全部新品なら `undefined`** を返すので、`SaveData.chestWear` のキーごと消える
 * （`dropWear` / `craftWear` と同じ「省略可・無ければ既定」の作法）。
 *
 * **`serializeChest()` の 54 要素を増やさないこと** —— あちらは `[item, count]` x 27 で、
 * 増やすと既存のセーブが丸ごとずれる。**形も丸め方も `durability.ts` に委ねる**
 * （ここに `?? 0` を書くと、道具でないものに傷が付く経路が 1 つ増える）。
 */
export function serializeChestWear(state: ChestState): number[] | undefined {
  return serializeWear(state.slots);
}

/**
 * セーブから戻す。**傷は同じ呼び出しで渡すこと** —— 中身を入れてからでないと
 * 「その枠の道具は何回使えるか」が決まらない（`durability.ts` の `deserializeWear()`）。
 * 読んだ値をどこまで信じるかも向こうの `wornValue()` 1 本に委ねる（**丸めを写さないこと**）。
 */
export function deserializeChest(flat: readonly number[], wear?: number[]): ChestState {
  const state = createChest();
  for (let i = 0; i < CHEST_SIZE; i++) {
    const item = flat[i * 2] ?? 0;
    const count = flat[i * 2 + 1] ?? 0;
    if (!item || count <= 0) continue;
    state.slots[i].item = item;
    state.slots[i].count = Math.min(count, itemStackLimit(item));
  }
  deserializeWear(state.slots, wear);
  return state;
}

export function chestKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/**
 * ボクセルのうち、チェストが使う入口だけ。**`World` を丸ごと受け取らないこと** ——
 * `beds.ts` の `BedWorld` とまったく同じ理由（ストリーミングの都合まで試験場に
 * 用意する羽目になる）。**読むだけ**で、`furnaces.ts` / `drops.ts` と同じく書き換えない。
 */
export interface ChestVoxels {
  getVoxel(x: number, y: number, z: number): number;
}

/** 水平の 4 マス。**向きを持たないので `blocks.ts` の向きの表は使わない**（並び順に意味は無い）。 */
const NEIGHBOR_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** そこに置いてある座標（`chestPartner()` が返す 1 点）。 */
export interface ChestSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 水平 4 マスのうち `CHEST` が置いてあるもの。**同じ y だけ**（縦積みは組にならない）。 */
function chestNeighbors(voxels: ChestVoxels, x: number, y: number, z: number): ChestSpot[] {
  const found: ChestSpot[] = [];
  for (const [dx, dz] of NEIGHBOR_STEPS) {
    if (voxels.getVoxel(x + dx, y, z + dz) === CHEST) found.push({ x: x + dx, y, z: z + dz });
  }
  return found;
}

/**
 * 組になる相方。**ブロック ID も状態も持たず、そのつど voxel から決める。**
 *
 * 規則は 1 つだけ: **水平 4 マスに `CHEST` がちょうど 1 個で、その相手から見ても
 * ちょうど 1 個**のとき、その 2 個が組。**「相方の相方は自分」がこれで必ず成り立つ**ので
 * （`beds.ts` が守っている不変条件と同じもの）、3 個並びや 2x2 では半端な組ができず、
 * 全部 27 枠に戻る。
 *
 * **未読み込みの列では `getVoxel` が AIR を返す**ので、そこでは組にならない（27 枠）。
 * 落ちないこと —— `furnaces.ts` の `hasColumn()` の罠と同じ場所。
 */
export function chestPartner(
  voxels: ChestVoxels,
  x: number,
  y: number,
  z: number,
): ChestSpot | null {
  const mine = chestNeighbors(voxels, x, y, z);
  if (mine.length !== 1) return null;
  const other = mine[0];
  return chestNeighbors(voxels, other.x, other.y, other.z).length === 1 ? other : null;
}

/**
 * 組の「根」（54 枠の前半になるほう）。**x が小さいほう、同じなら z が小さいほう。**
 * 決めておかないと、**開いた側によって中身の並びが変わる。**
 */
function rootFirst(a: ChestSpot, b: ChestSpot): [ChestSpot, ChestSpot] {
  if (a.x !== b.x) return a.x < b.x ? [a, b] : [b, a];
  return a.z < b.z ? [a, b] : [b, a];
}

export class Chests {
  private readonly map = new Map<string, ChestState>();

  /** 中身が変わった合図（セーブの印に使う）。 */
  onChange?: () => void;

  get count(): number {
    return this.map.size;
  }

  /** そこにあるチェスト。無ければ作る（右クリックで開いたとき）。 */
  at(x: number, y: number, z: number): ChestState {
    const key = chestKey(x, y, z);
    const found = this.map.get(key);
    if (found) return found;
    const state = createChest();
    this.map.set(key, state);
    return state;
  }

  /** そこにあるチェスト。無くても作らない。 */
  peek(x: number, y: number, z: number): ChestState | null {
    return this.map.get(chestKey(x, y, z)) ?? null;
  }

  /**
   * **開くときの入口。** 隣に相方が居れば 54 枠、居なければ今までどおり 27 枠を返す。
   *
   * **54 枠は「参照を並べた見え方」であって、新しい入れ物ではない。**
   * 中身は 1 マス 27 枠のまま `map` に残るので、**セーブの形は 1 バイトも変わらない**し、
   * 片方を壊しても残った側は 27 枠として中身を保つ。
   *
   * **`Slot` をコピーしないこと**（`craftscreen.ts` の `activeGrid()` と同じ理由 ——
   * コピーを渡すと入れたものが消える）。**この見え方を `map` に入れないこと** ——
   * 組が解けた瞬間（片方を壊す・3 個目を置く）に中身の行き先が無くなる。
   */
  open(voxels: ChestVoxels, x: number, y: number, z: number): ChestState {
    const partner = chestPartner(voxels, x, y, z);
    if (!partner) return this.at(x, y, z);
    const [first, second] = rootFirst({ x, y, z }, partner);
    return {
      slots: [
        ...this.at(first.x, first.y, first.z).slots,
        ...this.at(second.x, second.y, second.z).slots,
      ],
    };
  }

  /**
   * チェストを取り除いて、**中に入っていたものを返す**（壊したときに地面へ落とす）。
   * 返さないと、中身が黙って消える。**クリエイティブでも落とすこと** ——
   * 中身は集めたアイテムで、壊し方によって消えてよいものではない。
   */
  remove(x: number, y: number, z: number): { item: number; count: number; damage: number }[] {
    const key = chestKey(x, y, z);
    const state = this.map.get(key);
    if (!state) return [];
    this.map.delete(key);
    const out: { item: number; count: number; damage: number }[] = [];
    for (const slot of state.slots) {
      // **傷も一緒に返すこと** —— 落とす側（`breaking.ts`）が素通しするので、
      // 落とさないと壊した瞬間に中身が新品に戻る。読むのは `damageOf()` 1 本。
      if (!isEmpty(slot)) out.push({ item: slot.item, count: slot.count, damage: damageOf(slot) });
    }
    if (out.length > 0) this.onChange?.();
    return out;
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * セーブ用。**空っぽのチェストは省く**（右クリックで開いただけのものが溜まらないように）。
   * 全部空なら `undefined` を返してキーごと省く（`furnaces.ts` と同じ作法）。
   */
  serialize(): Record<string, number[]> | undefined {
    const out: Record<string, number[]> = {};
    let any = false;
    for (const [key, state] of this.map) {
      if (isChestEmpty(state)) continue;
      out[key] = serializeChest(state);
      any = true;
    }
    return any ? out : undefined;
  }

  /**
   * 中身の傷を `serialize()` と**同じキーの表**で。空っぽのチェストを省くところまで
   * 揃えること（ずれると別のチェストの傷が載る）。**全部新品なら `undefined`** を返して
   * `chestWear` のキーごと消す（`drops.serializeWear()` と同じ作法）。
   */
  serializeWear(): Record<string, number[]> | undefined {
    const out: Record<string, number[]> = {};
    let any = false;
    for (const [key, state] of this.map) {
      if (isChestEmpty(state)) continue;
      const flat = serializeChestWear(state);
      if (!flat) continue;
      out[key] = flat;
      any = true;
    }
    return any ? out : undefined;
  }

  /**
   * セーブから戻す。**壊れた値は黙って飛ばす**（読めないより、欠けるほうがまし）。
   *
   * **傷は第 2 引数で受けること（2 本に分けないこと）** —— ここが `map` を作り直すので、
   * 別呼び出しにすると順番を間違えた瞬間に傷だけ消える（`drops.deserialize()` と同じ形）。
   */
  deserialize(
    raw: Record<string, number[]> | undefined,
    wear?: Record<string, number[]> | undefined,
  ): void {
    this.clear();
    if (!raw || typeof raw !== "object") return;
    const worn = wear && typeof wear === "object" ? wear : undefined;
    for (const [key, flat] of Object.entries(raw)) {
      if (!Array.isArray(flat)) continue;
      const parts = key.split(",");
      if (parts.length !== 3 || parts.some((p) => !Number.isFinite(Number(p)))) continue;
      this.map.set(key, deserializeChest(flat, worn?.[key]));
    }
  }
}

/**
 * チェストへ入れられるだけ入れて、**入らなかった数を返す**
 * （`Inventory.add()` とまったく同じ約束）。並べ方も同じで、
 * まず同じアイテムの山に足してから空き枠へ置く。
 *
 * **枠数は `CHEST_SIZE` ではなく渡された器に聞くこと** —— 27 と書くと、
 * 組で開いた 54 枠のうち**後ろの 27 枠に 1 個も入らない**（シフトクリックも
 * かき集めもここを通る）。
 *
 * **`damage` は `addToSlots()` に素通しするだけ**（載るのは空き枠へ入れた 1 個ぶんで、
 * 山に足したぶんには載らない）。傷を読むのは呼ぶ側の `damageOf()` 1 本。
 */
export function addToChest(
  state: ChestState,
  item: number,
  count: number,
  damage = 0,
): number {
  return addToSlots(state.slots, item, count, 0, state.slots.length, damage);
}

/** 中身を全部空にする（保存データの削除で使う）。 */
export function clearChest(state: ChestState): void {
  for (const slot of state.slots) clearSlot(slot);
}
