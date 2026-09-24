/**
 * 植えてある苗と、**プレイヤーが置いたサトウキビ・サボテン**の育ち具合。
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
 * **`World` を丸ごと受け取りません**（`beds.ts` と同じ作法）。使う入口は 4 つだけで、
 * だから偽物のワールドを 4 行書けばテストになります（4 つ目の `getLight` は 46 のキノコ）。
 *
 * **キノコが広がる先も乱数で決めません**（46）。周り 26 マスを決まった順に並べ、
 * **巡回を始める位置だけを座標から決めます**（`mushroomSpreadStart()`）。
 */

import {
  AIR,
  BROWN_MUSHROOM,
  CACTUS,
  CACTUS_HEIGHT_MAX,
  CANE_HEIGHT_MAX,
  FACE_YP,
  FARMLAND,
  RED_MUSHROOM,
  SAPLING,
  SPRUCE_SAPLING,
  SUGAR_CANE,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
  isReplaceable,
  supportsBlock,
} from "./blocks";
import type { TreeKind } from "./biomes";
import { columnOf } from "./constants";
import { BLOCK_LIGHT, SKY_LIGHT, type LightChannel } from "./lighting";
import { TREE_RADIUS, grownTreeHeight, treeCells } from "./treeshape";
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
 * 植えた苗木が**木になる**までの秒数。**暫定**（`TUNING.md`）。
 *
 * 本家は乱数ティックで平均 20 分前後なので、**小麦・サトウキビと同じ縮尺**の
 * 180 秒にしてあります。**`main.ts` にこの数値を書かないこと。**
 */
export const SAPLING_GROW_SECONDS = 180;

/**
 * **プレイヤーが置いたサボテン**が 1 マス上へ伸びるのにかかる秒数。**暫定**（`TUNING.md`）。
 *
 * 本家もサボテンとサトウキビは**まったく同じ乱数ティック 16 回**（≒ 18 分）なので、
 * `CANE_GROW_SECONDS` と同じ値にしてあります。**`main.ts` にこの数値を書かないこと。**
 */
export const CACTUS_GROW_SECONDS = 180;

/**
 * **プレイヤーが置いたキノコ**が周りへ 1 本増えるまでの秒数。**暫定**（`TUNING.md`）。
 *
 * 本家は乱数ティック（1 ブロック平均 68.3 秒）の 1/25 で ≒ 1707 秒。サトウキビ
 * （本家 ≒ 1092 秒 → ここ 180 秒）と同じ縮尺にして 280 秒。**`main.ts` に書かないこと。**
 */
export const MUSHROOM_SPREAD_SECONDS = 280;

/** キノコが広がれる明るさの上限（**これ以下**なら広がる）。本家の「13 未満」。**暫定。** */
export const MUSHROOM_MAX_LIGHT = 12;

/** 周り（x・z ±`MUSHROOM_CROWD_RADIUS` / y ±1）に同じ種類がこの本数以上あれば広がらない。 */
export const MUSHROOM_CROWD_LIMIT = 5;

/** 混み具合を数える x・z の半径（y は ±1 固定）。**4 隅の列もこの半径で待ちます。** */
export const MUSHROOM_CROWD_RADIUS = 4;

/** その苗木がどの木になるか。苗木でなければ null。 */
function saplingKind(id: number): TreeKind | null {
  if (id === SAPLING) return "oak";
  if (id === SPRUCE_SAPLING) return "spruce";
  return null;
}

/** 広がるキノコか（赤・茶の 2 種だけ）。 */
function isMushroom(id: number): boolean {
  return id === RED_MUSHROOM || id === BROWN_MUSHROOM;
}

/**
 * キノコが広がる先の候補 26 マス。**`dy` -1..1 → `dz` → `dx` の順**で、中心を除く。
 * この順番は変えないこと —— 変えると同じ場所で生える先が変わり、テストが固定できなくなります。
 */
const MUSHROOM_NEIGHBORS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0 || dz !== 0) out.push([dx, dy, dz]);
      }
    }
  }
  return out;
})();

/**
 * 26 マスのどこから巡回を始めるか（0..25）。**乱数の代わりに座標で決めます** ——
 * 同じ場所・同じ周りなら毎回同じマスに生え、しかも場所ごとに散ります。
 * **負の座標でも 0..25 に収めること**（`>>> 0` で符号を落としてから割る）。
 */
export function mushroomSpreadStart(x: number, y: number, z: number): number {
  const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  return h % MUSHROOM_NEIGHBORS.length;
}

/**
 * `World` のうち、育つ苗が使う入口だけ。**丸ごと受け取らないこと**
 * （ストリーミングの都合まで試験場に用意することになります）。
 */
export interface CropWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
  /** その列のボクセルが生成済みか。**`getVoxel` は未読み込みで AIR を返す。** */
  hasColumn(cx: number, cz: number): boolean;
  /**
   * 生の明るさ（0..15）。**昼夜で変わらない値**（外は夜でも空 15）。キノコ（46）が
   * 空とブロックの大きいほうを見ます。
   */
  getLight(x: number, y: number, z: number, channel: LightChannel): number;
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
   * 覚えるのは**サトウキビ・サボテンと苗木 2 種**。**積み上がる 2 つ**（サトウキビ・
   * サボテン）は**置いたマスではなく、その列のいちばん下**を覚えます ——
   * **上を覚えると、刈った瞬間に印が消えて二度と伸びません。**
   * 同じ列に 2 本置いてもキーは 1 つに畳まれます。
   * **苗木は 1 マスきりなので、置いたマスをそのまま覚えます。** キノコ（46）も同じです。
   *
   * **下へ舐める比較は `id` で行うこと**（`SUGAR_CANE` と書き写さない）——
   * サボテンの列をサトウキビの ID で舐めると、1 段も下がらずに上を覚えます。
   *
   * **自然に生えたサトウキビ・サボテンは伸びません**（誰も置いていないので印が無い）。
   * 上に 1 本置けば、そこから下へ舐めて列ごと覚えます。
   */
  notePlaced(at: UseSpot | undefined, id: number, world: CropWorld): void {
    if (!at) return;
    if (saplingKind(id) !== null || isMushroom(id)) {
      this.map.set(cropKey(at.x, at.y, at.z), 0);
      return;
    }
    if (id !== SUGAR_CANE && id !== CACTUS) return;
    const { x, z } = at;
    let y = at.y;
    while (world.getVoxel(x, y - 1, z) === id) y--;
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
   * **表は 1 つで、道が 5 つあります**（18c のサトウキビ・30b の苗木・37 のサボテン・
   * 46 のキノコ）。列を確かめたあと、**素の `getVoxel(x,y,z)` で `WHEAT_CROP` / `SUGAR_CANE` /
   * `CACTUS` / キノコ 2 種 / 苗木 2 種 / それ以外に分けます** —— それ以外は「掘られた・
   * 上書きされた・もう実っている」なので忘れます。
   * **積み上がる 2 つ（サトウキビ・サボテン）は同じ `growStack()` を通ります**
   * —— 写して 2 本にしないこと。苗木の道は `growTree()`、苗の道は次の 4 つ（`growWheat()`）:
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
    // **広がったキノコは for を抜けてから足すこと** —— 回している `Map` に足すと、
    // 同じ番のうちにその 1 本も舐めて、1 回の `update()` で何代も広がります。
    const births: string[] = [];
    for (const [key, age] of this.map) {
      const [x, y, z] = key.split(",").map(Number);
      if (!world.hasColumn(columnOf(x), columnOf(z))) continue;

      // **素の `getVoxel` で道を分けること**（`baseBlock()` を使わない理由は上の 2.）。
      const here = world.getVoxel(x, y, z);
      const kind = saplingKind(here);
      if (here === WHEAT_CROP) {
        if (this.growWheat(key, age, dt, x, y, z, world)) changed = true;
      } else if (here === SUGAR_CANE) {
        if (this.growStack(key, age, dt, x, y, z, SUGAR_CANE, CANE_HEIGHT_MAX, CANE_GROW_SECONDS, world)) {
          changed = true;
        }
      } else if (here === CACTUS) {
        if (this.growStack(key, age, dt, x, y, z, CACTUS, CACTUS_HEIGHT_MAX, CACTUS_GROW_SECONDS, world)) {
          changed = true;
        }
      } else if (isMushroom(here)) {
        if (this.spreadMushroom(key, age, dt, x, y, z, here, world, births)) changed = true;
      } else if (kind !== null) {
        if (this.growTree(key, age, dt, x, y, z, kind, world)) changed = true;
      } else {
        this.map.delete(key);
        changed = true;
      }
    }
    for (const born of births) {
      if (!this.map.has(born)) this.map.set(born, 0);
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
   * **積み上がる生えもの**（サトウキビ = 18c・サボテン = 37）の列を 1 段ぶん伸ばす。
   * **覚えているのは列のいちばん下**なので、まず上へ舐めて段数を数えます
   * （`notePlaced()` と対）。
   *
   * **2 本に写さないこと。** 違うのは受け取る 3 つ（`self` / `maxHeight` / `seconds`）
   * だけで、**中身の順番も `changed` の立て方も 1 つも変えていません** ——
   * サトウキビの 11 件がそのままサボテンの見張りにもなります。
   *
   * **`self` と `id` の一致で舐めること** —— ここで `SUGAR_CANE` を書き写すと、
   * サボテンの列が 1 段も数えられずに上限を越えて伸びます。
   *
   * 1. **`maxHeight` 段まで伸びていたら育てない。忘れもしない** ——
   *    **秒数を 0 に戻して**次のフレームへ回します（刈られたら 0 秒から伸び直す）。
   *    **ここで `changed` を立てないこと** —— 立てると、伸びきった 1 本があるだけで
   *    `saveDirty` が毎フレーム立ちます（既に 0 なら書き込みもしません）。
   * 2. **上が塞がっていたら書かない。秒数は持ち越すこと**（どけたらすぐ伸びます）。
   * 3. **`setVoxel` が成功したときだけ**秒数を 0 に戻す（`syncLit()` と同じ作法）。
   *    **`World.setVoxel()` は `canPlaceAt()` を通す**ので、`self` に
   *    `stacksOnSelf` が無いと**ここが黙って落ち続けます**（37 でサボテンに足した理由）。
   */
  private growStack(
    key: string,
    age: number,
    dt: number,
    x: number,
    y: number,
    z: number,
    self: number,
    maxHeight: number,
    seconds: number,
    world: CropWorld,
  ): boolean {
    let top = y;
    while (world.getVoxel(x, top + 1, z) === self) top++;

    if (top - y + 1 >= maxHeight) {
      if (age !== 0) this.map.set(key, 0);
      return false;
    }

    const grown = age + dt;
    if (grown < seconds || world.getVoxel(x, top + 1, z) !== AIR) {
      this.map.set(key, grown);
      return false;
    }
    if (world.setVoxel(x, top + 1, z, self)) {
      this.map.set(key, 0);
      return true;
    }
    this.map.set(key, grown);
    return false;
  }

  /**
   * **置いたキノコ**（46）を周りへ 1 本増やす。増えた 1 本は `births` に積み、
   * `update()` が for を抜けてから覚えます（そこからまた広がる）。
   *
   * 1. `MUSHROOM_SPREAD_SECONDS` に届くまでは持ち越すだけ
   * 2. **混み具合を数える 4 隅の列**（`x ± MUSHROOM_CROWD_RADIUS`・`z ± 同`）が
   *    1 つでも未読み込みなら持ち越す（`growTree()` と同じ。未読み込みは AIR に見えて
   *    「空いている」と数え損ねます）
   * 3. 9x3x9 に**同じ種類**（素の `getVoxel` で `self` と等しい。自分も数える）が
   *    `MUSHROOM_CROWD_LIMIT` 本以上なら、**秒数を 0 に戻して** false。
   *    **`changed` を立てないこと**（伸びきったサトウキビと同じ理由）
   * 4. 26 マスを `mushroomSpreadStart()` から巡回して、**最初に**「空気・明るさ
   *    （空とブロックの大きいほう）≤ `MUSHROOM_MAX_LIGHT`・真下が支えになる」マス。
   *    **支えは `supportsBlock()` で見ること**（`World.canPlaceAt()` と同じ式。写すと
   *    本物の世界で書き込みが黙って落ち続けます）。無ければ秒数を 0 に戻して false
   * 5. **`setVoxel` が成功したときだけ**秒数を 0 に戻して true。失敗なら持ち越す
   */
  private spreadMushroom(
    key: string,
    age: number,
    dt: number,
    x: number,
    y: number,
    z: number,
    self: number,
    world: CropWorld,
    births: string[],
  ): boolean {
    const grown = age + dt;
    if (grown < MUSHROOM_SPREAD_SECONDS) {
      this.map.set(key, grown);
      return false;
    }

    const r = MUSHROOM_CROWD_RADIUS;
    for (const dx of [-r, r]) {
      for (const dz of [-r, r]) {
        if (!world.hasColumn(columnOf(x + dx), columnOf(z + dz))) {
          this.map.set(key, grown);
          return false;
        }
      }
    }

    let crowd = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (world.getVoxel(x + dx, y + dy, z + dz) === self) crowd++;
        }
      }
    }
    if (crowd >= MUSHROOM_CROWD_LIMIT) {
      this.map.set(key, 0);
      return false;
    }

    const start = mushroomSpreadStart(x, y, z);
    for (let i = 0; i < MUSHROOM_NEIGHBORS.length; i++) {
      const [dx, dy, dz] = MUSHROOM_NEIGHBORS[(start + i) % MUSHROOM_NEIGHBORS.length];
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (world.getVoxel(nx, ny, nz) !== AIR) continue;
      const light = Math.max(world.getLight(nx, ny, nz, SKY_LIGHT), world.getLight(nx, ny, nz, BLOCK_LIGHT));
      if (light > MUSHROOM_MAX_LIGHT) continue;
      if (!supportsBlock(world.getVoxel(nx, ny - 1, nz), FACE_YP, self)) continue;
      if (world.setVoxel(nx, ny, nz, self)) {
        this.map.set(key, 0);
        births.push(cropKey(nx, ny, nz));
        return true;
      }
      // 書けなかったぶんは持ち越す（次のフレームでまた試す）。
      this.map.set(key, grown);
      return false;
    }
    this.map.set(key, 0);
    return false;
  }

  /**
   * 苗木 1 本を木にする。**形は 1 マスも持ちません** —— `treeshape.ts` の
   * `treeCells()` / `grownTreeHeight()` を引くだけで、`worldgen.ts` の自然の木と
   * **同じ 1 本**を見ます（写して持つと、植えた木だけ別の形になります）。
   *
   * 1. **木の掛かる 4 隅の列が全部読み込まれるまで、1 マスも書かないこと。**
   *    「書けたところまで書く」で済ませると、**半分だけの木が残って二度と直りません**
   *    （残りの列が読み込まれた頃には、もう印を忘れています）。秒数は持ち越します。
   * 2. **上が塞がっていたら育たない。忘れもしない**（どけたらすぐ育ちます）。
   *    見るのは幹の通り道だけで、葉は `overwrite: false` なので何も壊しません。
   * 3. **根元が `setVoxel` できたときだけ忘れること**（`growWheat()` と同じ作法）。
   */
  private growTree(
    key: string,
    age: number,
    dt: number,
    x: number,
    y: number,
    z: number,
    kind: TreeKind,
    world: CropWorld,
  ): boolean {
    const grown = age + dt;
    if (grown < SAPLING_GROW_SECONDS) {
      this.map.set(key, grown);
      return false;
    }

    // 1. 木の掛かる 4 隅の列。**`TREE_RADIUS` は `treeshape.ts` が持つ値**を引くこと
    //    （写すと、葉を広げた日に列を 1 つ待ち損ねます）。
    for (const dx of [-TREE_RADIUS, TREE_RADIUS]) {
      for (const dz of [-TREE_RADIUS, TREE_RADIUS]) {
        if (!world.hasColumn(columnOf(x + dx), columnOf(z + dz))) {
          this.map.set(key, grown);
          return false;
        }
      }
    }

    const height = grownTreeHeight(kind, x, z);
    // 2. 幹の通り道。根元（自分自身）は苗木なので見ない。
    for (let i = 1; i < height; i++) {
      if (!isReplaceable(world.getVoxel(x, y + i, z))) {
        this.map.set(key, grown);
        return false;
      }
    }

    // 3. **順番も `overwrite` の真偽も `treeCells()` が並べたまま**に書くこと。
    let rooted = false;
    for (const cell of treeCells(kind, height)) {
      const wx = x + cell.dx;
      const wy = y + cell.dy;
      const wz = z + cell.dz;
      // 葉は草むらだけ押しのける（生成側の `put()` とまったく同じ判定）。
      if (!cell.overwrite && !isReplaceable(world.getVoxel(wx, wy, wz))) continue;
      const ok = world.setVoxel(wx, wy, wz, cell.id);
      if (cell.dx === 0 && cell.dy === 0 && cell.dz === 0) rooted = ok;
    }
    if (!rooted) {
      this.map.set(key, grown);
      return false;
    }
    this.map.delete(key);
    return true;
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
