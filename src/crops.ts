/**
 * 植えてある苗と、**プレイヤーが置いたサトウキビ**の育ち具合。
 * **「位置ごとに状態を持つブロック」の 3 つ目**で、かまど（`furnaces.ts`）・
 * チェスト（`chests.ts`）とまったく同じ器の形です（`rules/stateful-blocks.md`）。
 *
 * **苗だけの器ではありません**（18c・2026-09-06）。`"x,y,z"` → 数字 1 つで足りるものは
 * **新しいファイルを作らずにここへ乗せます** —— `main.ts` の配線 5 本がもう繋がっていて、
 * `SaveData` も増えないためです。どちらの道を通るかは `update()` が
 * **素の `getVoxel` で見分けます**（表は 1 つのまま）。
 *
 * three にも DOM にも音にも触らないので丸ごとヘッドレスで検証できます
 * （見張りは `test/crops.test.ts`）。**乱数も使いません** —— 入れると
 * 「何秒で実るか」をテストで固定できなくなります。
 *
 * **育つ段階をブロック ID 8 個で表さないこと**（本家の形）。ここは 2 段階
 * （苗 `WHEAT_CROP` → 実った小麦 `WHEAT_CROP_RIPE`）で、**育ち具合はワールドに
 * 書かず、このファイルが `"x,y,z"` → 秒数の表で持ちます。** ブロック ID は
 * 1 つも戻せないので、段階を増やすたびに番号を食う形にはしていません。
 *
 * **`World` を丸ごと受け取りません**（`beds.ts` と同じ作法）。使う入口は 3 つだけで、
 * だから偽物のワールドを 3 行書けばテストになります。
 */

import { AIR, CANE_HEIGHT_MAX, FARMLAND, SUGAR_CANE, WHEAT_CROP, WHEAT_CROP_RIPE } from "./blocks";
import { columnOf } from "./constants";
import type { UseSpot } from "./use";

/**
 * 苗が実るまでの秒数。**暫定**（`TUNING.md`）。
 *
 * 本家は 8 段階・明るさ 9 以上で平均 20 分前後ですが、ここは 2 段階で、
 * **チャンクが読み込まれている間しか育ちません**（下の `update()`）。
 * **`main.ts` にこの数値を書かないこと** —— `test/ui.test.ts` が見張っています。
 */
export const GROW_SECONDS = 180;

/**
 * サトウキビが**1 マス上へ伸びる**のにかかる秒数。**暫定**（`TUNING.md`）。
 *
 * 本家は 1 マスにつき乱数ティック 16 回（≒ 18 分）で、**小麦（本家 ≒ 20 分 →
 * ここ 180 秒）と同じ縮尺**なので同じ値にしてあります。**`main.ts` にこの数値を
 * 書かないこと** —— `test/crops.test.ts` の見張りがそのまま効きます。
 */
export const CANE_GROW_SECONDS = 180;

/**
 * `World` のうち、育つ苗が使う入口だけ。**丸ごと受け取らないこと**
 * （ストリーミングの都合まで試験場に用意することになります）。
 */
export interface CropWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
  /** その列のボクセルが生成済みか。**`getVoxel` は未読み込みで AIR を返す。** */
  hasColumn(cx: number, cz: number): boolean;
}

export function cropKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class Crops {
  /** `"x,y,z"` -> そのマスの苗が育った秒数。 */
  private readonly map = new Map<string, number>();

  get count(): number {
    return this.map.size;
  }

  /**
   * そのマスに苗を植えた、と覚える。**ワールドへ書くのは呼ぶ側**（`placing.ts` の
   * `tryPlant()`）で、ここは育ち具合だけを持ちます。
   *
   * **同じマスに 2 回植えたら 0 から数え直します** —— 掘って植え直した人が、
   * 前の苗の育ち具合を引き継いで即座に収穫できてはいけません。
   */
  plant(x: number, y: number, z: number): void {
    this.map.set(cropKey(x, y, z), 0);
  }

  /**
   * ブロックを置いた、と伝える。**`placeHeld()` は全部のブロックで呼ぶ**ので、
   * **何を覚えるかを決めるのはここです**（`main.ts` は何が伸びるかも何秒かも知りません）。
   *
   * いまのところ覚えるのは**サトウキビだけ**。覚えるのは**置いたマスではなく、
   * その列のいちばん下のサトウキビ**です —— **上を覚えると、刈った瞬間に印が消えて
   * 二度と伸びません。** 同じ列に 2 本置いてもキーは 1 つに畳まれます。
   *
   * **自然に生えたサトウキビは伸びません**（誰も置いていないので印が無い）。
   * 上に 1 本置けば、そこから下へ舐めて列ごと覚えます。
   */
  notePlaced(at: UseSpot | undefined, id: number, world: CropWorld): void {
    if (!at || id !== SUGAR_CANE) return;
    const { x, z } = at;
    let y = at.y;
    while (world.getVoxel(x, y - 1, z) === SUGAR_CANE) y--;
    this.map.set(cropKey(x, y, z), 0);
  }

  /** そのマスの苗が育った秒数。覚えていなければ null。 */
  peek(x: number, y: number, z: number): number | null {
    return this.map.get(cropKey(x, y, z)) ?? null;
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * 全部の苗を `dt` 秒ぶん進める。**実った／忘れたときだけ true**（セーブの印に使う）。
   *
   * **毎フレーム true を返さないこと** —— `saveDirty` が立ちっぱなしになり、
   * 苗が 1 本あるだけで自動保存が回り続けます。
   *
   * **`world.update()` の中で回さないこと**（かまど・モブ・落とし物と同じ理由。
   * `test/world.test.ts` の p99 にストリーミングの退行と混ざります）。
   *
   * **表は 1 つで、道が 2 つあります**（18c）。列を確かめたあと、**素の
   * `getVoxel(x,y,z)` で `WHEAT_CROP` / `SUGAR_CANE` / それ以外に分けます** ——
   * それ以外は「掘られた・上書きされた・もう実っている」なので忘れます。
   * サトウキビの道は `growCane()`、苗の道は次の 4 つ（`growWheat()`）:
   *
   * 1. **列が読み込まれているか。** `getVoxel` は未読み込みで AIR を返すので、
   *    ここを飛ばすと**遠くの畑が丸ごと「掘られた」と読まれて忘れられます**
   *    （`furnaces.ts` の `syncLit()` とまったく同じ罠）
   * 2. **まだ苗が立っているか。** 掘られた・上書きされた・**もう実っている**なら忘れます。
   *    **`baseBlock()` で見ないこと** —— 実った小麦は `variantOf: WHEAT_CROP` なので
   *    大元が苗になり、「もう実っている」を見分けられません。そのまま残すと
   *    `setVoxel` が「同じ値」で false を返し続け（`world.ts`）、**二度と忘れない印が残ります**
   * 3. **真下が耕地か。** 耕地でなければ育ちませんが、**忘れもしません**
   *    （耕し直せば続きから育ちます）
   * 4. 育ちきったら実らせる。**`setVoxel` が成功したときだけ忘れること** ——
   *    未読み込みの列では書き込みが黙って失敗するので、持ち越して次のフレームで
   *    また試します（`syncLit()` と同じ）
   */
  update(dt: number, world: CropWorld): boolean {
    if (this.map.size === 0) return false;
    let changed = false;
    for (const [key, age] of this.map) {
      const [x, y, z] = key.split(",").map(Number);
      if (!world.hasColumn(columnOf(x), columnOf(z))) continue;

      // **素の `getVoxel` で 3 つに分けること**（`baseBlock()` を使わない理由は上の 2.）。
      const here = world.getVoxel(x, y, z);
      if (here === WHEAT_CROP) {
        if (this.growWheat(key, age, dt, x, y, z, world)) changed = true;
      } else if (here === SUGAR_CANE) {
        if (this.growCane(key, age, dt, x, y, z, world)) changed = true;
      } else {
        this.map.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  /** 苗を 1 マスぶん進める。**上の 2〜4 がそのまま**（18c で 1 行も変えていません）。 */
  private growWheat(
    key: string,
    age: number,
    dt: number,
    x: number,
    y: number,
    z: number,
    world: CropWorld,
  ): boolean {
    if (world.getVoxel(x, y - 1, z) !== FARMLAND) return false;

    const grown = age + dt;
    if (grown < GROW_SECONDS) {
      this.map.set(key, grown);
      return false;
    }
    if (world.setVoxel(x, y, z, WHEAT_CROP_RIPE)) {
      this.map.delete(key);
      return true;
    }
    // 書けなかったぶんは持ち越す（次のフレームでまた試す）。
    this.map.set(key, grown);
    return false;
  }

  /**
   * サトウキビの列を 1 段ぶん伸ばす。**覚えているのは列のいちばん下**なので、
   * まず上へ舐めて段数を数えます（`notePlaced()` と対）。
   *
   * 1. **`CANE_HEIGHT_MAX` 段まで伸びていたら育てない。忘れもしない** ——
   *    **秒数を 0 に戻して**次のフレームへ回します（刈られたら 0 秒から伸び直す）。
   *    **ここで `changed` を立てないこと** —— 立てると、伸びきった 1 本があるだけで
   *    `saveDirty` が毎フレーム立ちます（既に 0 なら書き込みもしません）。
   * 2. **上が塞がっていたら書かない。秒数は持ち越すこと**（どけたらすぐ伸びます）。
   * 3. **`setVoxel` が成功したときだけ**秒数を 0 に戻す（`syncLit()` と同じ作法）。
   */
  private growCane(
    key: string,
    age: number,
    dt: number,
    x: number,
    y: number,
    z: number,
    world: CropWorld,
  ): boolean {
    let top = y;
    while (world.getVoxel(x, top + 1, z) === SUGAR_CANE) top++;

    if (top - y + 1 >= CANE_HEIGHT_MAX) {
      if (age !== 0) this.map.set(key, 0);
      return false;
    }

    const grown = age + dt;
    if (grown < CANE_GROW_SECONDS || world.getVoxel(x, top + 1, z) !== AIR) {
      this.map.set(key, grown);
      return false;
    }
    if (world.setVoxel(x, top + 1, z, SUGAR_CANE)) {
      this.map.set(key, 0);
      return true;
    }
    this.map.set(key, grown);
    return false;
  }

  /**
   * セーブ用。**1 本も無ければ `undefined`** を返してキーごと省きます
   * （`furnaces` / `chests` と同じ作法。**畑を作っていない人のセーブは 1 バイトも増えません**）。
   */
  serialize(): Record<string, number> | undefined {
    if (this.map.size === 0) return undefined;
    const out: Record<string, number> = {};
    for (const [key, age] of this.map) out[key] = age;
    return out;
  }

  /**
   * セーブから戻す。**壊れた値は黙って飛ばします**（読めないより、欠けるほうがまし）。
   * 負の秒数も飛ばすこと —— 入れると、その苗だけ永久に実りません。
   */
  deserialize(raw: Record<string, number> | undefined): void {
    this.clear();
    if (!raw || typeof raw !== "object") return;
    for (const [key, age] of Object.entries(raw)) {
      if (typeof age !== "number" || !Number.isFinite(age) || age < 0) continue;
      const parts = key.split(",");
      if (parts.length !== 3 || parts.some((p) => p === "" || !Number.isFinite(Number(p)))) continue;
      this.map.set(key, age);
    }
  }
}
