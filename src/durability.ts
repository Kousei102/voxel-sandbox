/**
 * **道具の耐久値。** 掘るたびに 1 減り、0 になったらその場で消える。
 *
 * ここは**判断だけ**の置き場で、three も DOM も WebAudio も出てきません
 * （見張りは `test/durability.test.ts`）。`vitals.ts` と `ui.ts` の関係をそのまま写した形で、
 * **画面に出す帯の割合（`wearBar()`）と壊れたときの 1 行（`breakMessage()`）もここが決めます** ——
 * `ui.ts` に回数を書くと、傷んだ道具を持つまで確かめられない場所に判断が戻ります。
 *
 * **`inventory.ts` からは `import type { Slot }` だけを取ります。**
 * 逆向き（`inventory.ts` → ここ）は普通の import なので、値を取ると読み込みの輪ができます。
 *
 * **傷が残るのはインベントリと画面の中だけです**（36 枠 + 盤面 9 + 掴んだ山 1）。
 * 落とし物・チェスト・かまどの中身は `[item, count, ...]` のままなので、傷んだ道具を
 * 地面に落として拾い直すと新品で戻ります（`TUNING.md`。塞ぐのは `AUTODEV-QUEUE.md` の 3c）。
 */

import { blockHardness, isBreakable } from "./blocks";
import type { Slot } from "./inventory";
import { NO_ITEM, itemName, toolOf } from "./items";

/**
 * 階層ごとに何回使えるか。**Minecraft のまま**（木 59 / 石 131 / 鉄 250 / ダイヤ 1561）。
 * 添字は `ToolDef.tier`（0 は素手なので 0 回 = 減らない）。
 *
 * **`items.ts` の `ToolDef` に持たせないこと** —— あちらは「掘る速さ」を持つ表で、
 * 回数を混ぜると、耐久値を触るたびにアイテムの表ごと動かすことになります。
 */
export const TOOL_USES = [0, 59, 131, 250, 1561] as const;

/** そのアイテムが何回使えるか。**道具でなければ 0**（棒も丸石も矢も減りません）。 */
export function maxUses(item: number): number {
  const tool = toolOf(item);
  if (tool === null) return 0;
  return TOOL_USES[tool.tier] ?? 0;
}

/** 傷が付くものか（＝耐久値を持つか）。 */
export function wearable(item: number): boolean {
  return maxUses(item) > 0;
}

/**
 * ブロックを 1 個掘ったときに減る回数。**0 か 1 だけ**。
 *
 * 減らないのは 4 つ: クリエイティブ / 道具でないもの（素手を含む）/ 壊せないブロック /
 * **硬さ 0 のブロック**（松明・草。Minecraft も一瞬で壊れるものでは減りません）。
 */
export function wearForBreaking(blockId: number, item: number, creative: boolean): number {
  if (creative) return 0;
  if (!wearable(item)) return 0;
  if (!isBreakable(blockId)) return 0;
  if (blockHardness(blockId) <= 0) return 0;
  return 1;
}

/**
 * 傷を付ける。**壊れたら消して、壊れたアイテムの ID を返す**（壊れなければ `NO_ITEM`）。
 *
 * **壊れた枠は空に戻し、傷も 0 に戻すこと** —— 残すと、次にそこへ入れたものが
 * 半分減った状態で始まります。
 *
 * `inventory.ts` の `clearSlot()` を呼ばずに書いているのは、**値を import すると
 * 読み込みの輪ができる**からです（このファイルの冒頭）。
 */
export function wearSlot(slot: Slot, uses: number): number {
  if (uses <= 0 || slot.count <= 0) return NO_ITEM;
  const max = maxUses(slot.item);
  if (max <= 0) return NO_ITEM;
  const item = slot.item;
  const damage = (slot.damage ?? 0) + uses;
  if (damage < max) {
    slot.damage = damage;
    return NO_ITEM;
  }
  slot.item = NO_ITEM;
  slot.count = 0;
  slot.damage = 0;
  return item;
}

/**
 * 壊れたときに画面へ出す 1 行。**`vitals.ts` の `deathMessage()` と同じ形**で、
 * `main.ts` は貼るだけ（`hud.flash()`）。
 */
export function breakMessage(item: number): string {
  return `${itemName(item)} が壊れました`;
}

/**
 * 帯に出す**残りの割合** 0..1。**出さないものは -1**:
 * 空の枠・減らないもの（棒・丸石・矢）・**まだ無傷の道具**。
 *
 * 無傷を -1 にしてあるのは Minecraft と同じで、**新品の道具に帯が出ないため**です
 * （`ui.ts` は `Math.max(0, ...)` で幅にするだけなので、判断はここに閉じます）。
 */
export function wearBar(slot: Slot | null): number {
  if (!slot || slot.count <= 0) return -1;
  const max = maxUses(slot.item);
  if (max <= 0) return -1;
  const damage = slot.damage ?? 0;
  if (damage <= 0) return -1;
  return Math.max(0, (max - damage) / max);
}

/**
 * その枠の傷。**空の枠・道具でない枠は 0。**
 *
 * **`slot.damage ?? 0` を運ぶ側（`inventory.ts` / `craftscreen.ts`）に書かないこと** ——
 * 「道具でなければ 0」の判断がその場ごとに散り、棒の山に傷が付く経路が
 * 1 つずつ増えます。運ぶ側が傷を読むのはここ 1 本だけ。
 */
export function damageOf(slot: Slot | null | undefined): number {
  if (!slot || slot.count <= 0) return 0;
  if (!wearable(slot.item)) return 0;
  return slot.damage ?? 0;
}

/**
 * 傷を載せる。**`to.item` を入れたあとで呼ぶこと**（何の道具かで載るかどうかが決まる）。
 *
 * 道具でないものには載せません。**傷が付く物は全部 `stack: 1`** なので
 * （`items.ts` の道具 12 本）、載る枠はいつも 1 個ぶんです ——
 * `count > 1` の山に傷を持たせる経路を作らないこと（半端に傷んだ山を割る話になります）。
 */
export function carryWear(to: Slot, damage: number): void {
  to.damage = wearable(to.item) ? damage : 0;
}

/**
 * セーブの形。**36 要素の平坦な配列**で、位置は `slots` と同じ。
 *
 * **全部新品なら `undefined`** を返します —— そうすれば `SaveData.wear` のキーごと
 * 消えて、道具を傷めていない人のセーブは耐久値が入る前と 1 バイトも変わりません
 * （`craft` と同じ「省略可・無ければ既定」の作法）。
 *
 * **`Slot[]` を取るので、盤面 9 + 掴んだ山 1 の 10 枠にもそのまま効きます**
 * （`SaveData.craftWear`。**2 本目を書かないこと** —— 丸め方が 2 か所に分かれます）。
 *
 * **`SaveData.inventory` を 3 要素にしないこと。** あちらは `[item, count]` x 36 で、
 * 増やすと既存のセーブが丸ごとずれます。
 */
export function serializeWear(slots: readonly Slot[]): number[] | undefined {
  const flat = slots.map((slot) => (slot.count > 0 ? (slot.damage ?? 0) : 0));
  return flat.some((damage) => damage > 0) ? flat : undefined;
}

/**
 * 読み戻す。**`inventory.deserialize()` のあとで呼ぶこと**（アイテムが入っていないと
 * 「その枠の道具は何回使えるか」が分かりません）。
 *
 * 信じない値が 4 つあります: 数でない / 長さが足りない・多い / 負 /
 * **最大以上**（そのまま入れると「壊れているのに手に残っている道具」になるので、
 * `最大 - 1` に丸めます）。道具でない枠の傷は捨てます。
 */
export function deserializeWear(slots: readonly Slot[], flat: number[] | undefined): void {
  const list = Array.isArray(flat) ? flat : [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const max = maxUses(slot.item);
    const raw = list[i];
    if (max <= 0 || slot.count <= 0 || typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      slot.damage = 0;
      continue;
    }
    slot.damage = Math.min(Math.floor(raw), max - 1);
  }
}
