/**
 * 植えてある苗の育ち具合。**「位置ごとに状態を持つブロック」の 3 つ目**で、
 * かまど（`furnaces.ts`）・チェスト（`chests.ts`）とまったく同じ器の形です
 * （`rules/stateful-blocks.md`）。
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

import { FARMLAND, WHEAT_CROP, WHEAT_CROP_RIPE } from "./blocks";
import { columnOf } from "./constants";

/**
 * 苗が実るまでの秒数。**暫定**（`TUNING.md`）。
 *
 * 本家は 8 段階・明るさ 9 以上で平均 20 分前後ですが、ここは 2 段階で、
 * **チャンクが読み込まれている間しか育ちません**（下の `update()`）。
 * **`main.ts` にこの数値を書かないこと** —— `test/ui.test.ts` が見張っています。
 */
export const GROW_SECONDS = 180;

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
   * 1 マスごとに見るのは 4 つ:
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

      if (world.getVoxel(x, y, z) !== WHEAT_CROP) {
        this.map.delete(key);
        changed = true;
        continue;
      }
      if (world.getVoxel(x, y - 1, z) !== FARMLAND) continue;

      const grown = age + dt;
      if (grown < GROW_SECONDS) {
        this.map.set(key, grown);
        continue;
      }
      if (world.setVoxel(x, y, z, WHEAT_CROP_RIPE)) {
        this.map.delete(key);
        changed = true;
      } else {
        // 書けなかったぶんは持ち越す（次のフレームでまた試す）。
        this.map.set(key, grown);
      }
    }
    return changed;
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
