/**
 * 置いてあるかまど全部。**「位置ごとに状態を持つブロック」の初めての例**で、
 * チェストや醸造台を入れるときも同じ器に乗せられる。
 *
 * three にも DOM にも触らないので丸ごとヘッドレスで検証できる
 * （見張りは `test/smelting.test.ts`）。精錬の規則そのものは `smelting.ts`。
 *
 * **`world.setVoxel` をここから呼ばないこと。** 点火中かどうかでブロック ID を
 * 差し替えるのは `main.ts` の仕事で、こちらは `syncLit()` で「食い違っている場所」を
 * 渡すだけにしてある（`drops.ts` が `world` を書き換えないのと同じ筋）。
 */

import { AIR, FURNACE, FURNACE_LIT, baseBlock } from "./blocks";
import { damageOf } from "./durability";
import type { Slot } from "./inventory";
import { isEmpty } from "./inventory";
import {
  createFurnace,
  deserializeFurnace,
  isIdle,
  isLit,
  serializeFurnace,
  serializeFurnaceWear,
  tickFurnace,
  type FurnaceState,
} from "./smelting";

/**
 * 点火の表示を合わせるために書くブロック ID。**書くものが無ければ `AIR`。**
 *
 * **どの ID を使うかはこのファイルの話**なので、`main.ts` に
 * `lit ? FURNACE_LIT : FURNACE` を書かないこと（かまどの状態違いが増えたときに、
 * 書く側だけ直し忘れて「火が消えているのに光ったまま」が戻る）。
 *
 * **もうかまどが無い**（掘られた・上書きされた）ときも `AIR` を返す —— 呼ぶ側は
 * 「合わせるものが無い＝合った」として扱う（`main.ts` の `syncFurnaceBlocks()`）。
 */
export function litVoxel(current: number, lit: boolean): number {
  if (baseBlock(current) !== FURNACE) return AIR;
  const want = lit ? FURNACE_LIT : FURNACE;
  return current === want ? AIR : want;
}

interface Entry {
  readonly state: FurnaceState;
  /**
   * ワールドのブロック ID に反映済みの点火状態。`null` なら未反映。
   * **`setVoxel` が成功したときだけ書き換えること** —— チャンクが未読み込みだと
   * 書き込みが黙って失敗するので、成功するまで持ち越さないと
   * 「消えているのに光ったままのかまど」が残る。
   */
  syncedLit: boolean | null;
}

export function furnaceKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class Furnaces {
  private readonly map = new Map<string, Entry>();

  /** 中身が変わった合図（セーブの印に使う）。 */
  onChange?: () => void;

  get count(): number {
    return this.map.size;
  }

  /** そこにあるかまど。無ければ作る（右クリックで開いたとき）。 */
  at(x: number, y: number, z: number): FurnaceState {
    const key = furnaceKey(x, y, z);
    const found = this.map.get(key);
    if (found) return found.state;
    const entry: Entry = { state: createFurnace(), syncedLit: null };
    this.map.set(key, entry);
    return entry.state;
  }

  /** そこにあるかまど。無くても作らない。 */
  peek(x: number, y: number, z: number): FurnaceState | null {
    return this.map.get(furnaceKey(x, y, z))?.state ?? null;
  }

  /**
   * かまどを取り除いて、**中に入っていたものを返す**（壊したときに地面へ落とす）。
   * 返さないと、中身が黙って消える。
   */
  remove(x: number, y: number, z: number): { item: number; count: number; damage: number }[] {
    const key = furnaceKey(x, y, z);
    const entry = this.map.get(key);
    if (!entry) return [];
    this.map.delete(key);
    const out: { item: number; count: number; damage: number }[] = [];
    for (const slot of [entry.state.input, entry.state.fuel, entry.state.output] as Slot[]) {
      // **傷も一緒に返すこと**（`chests.ts` と同じ）。落とさないと、壊した瞬間に
      // 中身が新品に戻る。読むのは `damageOf()` 1 本。
      if (!isEmpty(slot)) out.push({ item: slot.item, count: slot.count, damage: damageOf(slot) });
    }
    if (out.length > 0) this.onChange?.();
    return out;
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * 全部のかまどを `dt` 秒ぶん進める。
   *
   * **`world.update()` の外で回すこと**（モブや落とし物と同じ理由）。
   * **プレイヤーが見ていなくても進める** —— 開いている間だけ進む実装にすると、
   * 画面を閉じた瞬間に止まり、かまどが「見張っていないと働かない」ものになる。
   */
  update(dt: number): void {
    if (this.map.size === 0) return;
    let changed = false;
    for (const entry of this.map.values()) {
      if (tickFurnace(entry.state, dt)) changed = true;
    }
    if (changed) this.onChange?.();
  }

  /**
   * 点火中かどうかがワールドのブロックと食い違っている所を `apply` へ渡す。
   *
   * `apply` が **true を返したときだけ**「反映済み」にする。未読み込みの列では
   * `setVoxel` が失敗するので、成功するまで持ち越して次のフレームでまた試す。
   */
  syncLit(apply: (x: number, y: number, z: number, lit: boolean) => boolean): void {
    for (const [key, entry] of this.map) {
      const lit = isLit(entry.state);
      if (entry.syncedLit === lit) continue;
      const [x, y, z] = key.split(",").map(Number);
      if (apply(x, y, z, lit)) entry.syncedLit = lit;
    }
  }

  /**
   * セーブ用。**空っぽで火も消えているかまどは省く**（開いただけで残らないように）。
   * 全部空なら `undefined` を返してキーごと省く（`craft` と同じ作法）。
   */
  serialize(): Record<string, number[]> | undefined {
    const out: Record<string, number[]> = {};
    let any = false;
    for (const [key, entry] of this.map) {
      if (isIdle(entry.state)) continue;
      out[key] = serializeFurnace(entry.state);
      any = true;
    }
    return any ? out : undefined;
  }

  /**
   * 中身の傷を `serialize()` と**同じキーの表**で。空っぽで火も消えているかまどを
   * 省くところまで揃えること（ずれると別のかまどの傷が載る）。
   * **全部新品なら `undefined`** を返して `furnaceWear` のキーごと消す。
   */
  serializeWear(): Record<string, number[]> | undefined {
    const out: Record<string, number[]> = {};
    let any = false;
    for (const [key, entry] of this.map) {
      if (isIdle(entry.state)) continue;
      const flat = serializeFurnaceWear(entry.state);
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
   * 別呼び出しにすると順番を間違えた瞬間に傷だけ消える（`chests.ts` と同じ形）。
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
      this.map.set(key, { state: deserializeFurnace(flat, worn?.[key]), syncedLit: null });
    }
  }
}
