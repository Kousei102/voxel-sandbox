/**
 * 育つ苗（`src/crops.ts`）。**判断だけのファイル**なので、偽物のワールドを 1 つ書けば
 * 丸ごとヘッドレスで確かめられる（`beds.ts` / `furnaces.ts` と同じ形）。
 *
 * **秒数は `GROW_SECONDS` を import すること。** 180 と書き写すと、数値を変えたときに
 * 「テストだけが古い値で緑」になる（＝判定をゆるめたのと同じ）。
 */

import {
  AIR,
  CACTUS,
  CACTUS_HEIGHT_MAX,
  CANE_HEIGHT_MAX,
  DIRT,
  FARMLAND,
  LEAVES,
  SAND,
  SAPLING,
  SPRUCE_LEAVES,
  SPRUCE_SAPLING,
  SPRUCE_WOOD,
  STONE,
  SUGAR_CANE,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
  WOOD,
  blockName,
} from "../src/blocks";
import { CHUNK_SIZE } from "../src/constants";
import {
  CACTUS_GROW_SECONDS,
  CANE_GROW_SECONDS,
  Crops,
  GROW_SECONDS,
  SAPLING_GROW_SECONDS,
  cropKey,
  type CropWorld,
} from "../src/crops";
import { grownTreeHeight } from "../src/treeshape";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 偽物のワールド。**`World` を丸ごと受け取らない**ので、要るのは 3 つの入口だけ。
 *
 * `hasColumn` は「読み込まれていない列」を作れるようにしてある（未読み込みの列では
 * `getVoxel` が AIR を返す、という本物の癖をそのまま真似る）。
 */
class Field implements CropWorld {
  private readonly voxels = new Map<string, number>();
  /** 読み込まれていない列（`"cx,cz"`）。ここは `getVoxel` が AIR を返す。 */
  readonly unloaded = new Set<string>();
  /** `setVoxel` を失敗させる（未読み込みの列で書き込みが黙って落ちるのを真似る）。 */
  frozen = false;
  /** `setVoxel` が呼ばれた回数（「持ち越して次のフレームでまた試す」を数える）。 */
  writes = 0;

  set(x: number, y: number, z: number, id: number): void {
    this.voxels.set(cropKey(x, y, z), id);
  }

  getVoxel(x: number, y: number, z: number): number {
    if (this.unloaded.has(`${x >> 4},${z >> 4}`)) return AIR;
    return this.voxels.get(cropKey(x, y, z)) ?? AIR;
  }

  setVoxel(x: number, y: number, z: number, id: number): boolean {
    this.writes++;
    if (this.frozen) return false;
    // 本物の `World.setVoxel()` は「同じ値」なら false を返す。そこも真似ておかないと、
    // 実った小麦の上にもう一度書く経路が**テストの中だけ成功**してしまう。
    if (this.getVoxel(x, y, z) === id) return false;
    this.set(x, y, z, id);
    return true;
  }

  hasColumn(cx: number, cz: number): boolean {
    return !this.unloaded.has(`${cx},${cz}`);
  }
}

/**
 * その列に何段の `id` が立っているか。**段の違いは ID ではなく積み方**（18b）。
 * **サトウキビもサボテンもここを通す**（37。同じ `growStack()` を見るので、
 * 数え方を 2 本に写すと片方だけ古い数え方で緑になります）。
 */
function stackHeight(field: Field, x: number, y: number, z: number, id: number): number {
  let n = 0;
  while (field.getVoxel(x, y + n, z) === id) n++;
  return n;
}

/** その列に何段のサトウキビが立っているか。 */
function caneHeight(field: Field, x: number, y: number, z: number): number {
  return stackHeight(field, x, y, z, SUGAR_CANE);
}

/** その列に何段のサボテンが立っているか（37）。 */
function cactusHeight(field: Field, x: number, y: number, z: number): number {
  return stackHeight(field, x, y, z, CACTUS);
}

/** 耕地 1 マスとその上の苗。**下の耕地が無いと育たない**ので、そこも一緒に置く。 */
function planted(field: Field, x = 0, y = 40, z = 0): void {
  field.set(x, y - 1, z, FARMLAND);
  field.set(x, y, z, WHEAT_CROP);
}

export function run(): void {
  describe("育つ苗（crops.ts）");

  console.log(`      GROW_SECONDS ${GROW_SECONDS} 秒 / チャンクの幅 ${CHUNK_SIZE}`);

  // --- 育って実る -----------------------------------------------------------

  {
    const field = new Field();
    const crops = new Crops();
    planted(field);
    crops.plant(0, 40, 0);
    check("植えたら 1 本覚える", crops.count === 1, `${crops.count} 本`);
    check("植えた直後は 0 秒", crops.peek(0, 40, 0) === 0, `${crops.peek(0, 40, 0)}`);

    // **境目の 1 フレーム手前で止めること**（`rules/testing.md`）。
    const changed = crops.update(GROW_SECONDS - 1, field);
    console.log(
      `      ${GROW_SECONDS - 1} 秒後: 育ち ${crops.peek(0, 40, 0)} 秒 / ` +
        `ブロック ${field.getVoxel(0, 40, 0)}（苗 ${WHEAT_CROP} / 実り ${WHEAT_CROP_RIPE}）`,
    );
    check("1 秒手前ではまだ苗のまま", field.getVoxel(0, 40, 0) === WHEAT_CROP);
    check("育った秒数を覚えている", crops.peek(0, 40, 0) === GROW_SECONDS - 1);
    // **育っただけでは true を返さないこと** —— 毎フレーム true にすると `saveDirty` が
    // 立ちっぱなしになり、苗が 1 本あるだけで自動保存が回り続ける。
    check("育っただけでは合図を出さない", changed === false, String(changed));

    const ripened = crops.update(1, field);
    console.log(
      `      さらに 1 秒: ブロック ${field.getVoxel(0, 40, 0)} / 覚えている本数 ${crops.count}`,
    );
    check("GROW_SECONDS 秒で実る", field.getVoxel(0, 40, 0) === WHEAT_CROP_RIPE, `${field.getVoxel(0, 40, 0)}`);
    check("実ったら合図を出す（セーブの印）", ripened === true);
    // **実ったら忘れること。** 残すと、収穫したあとの空きマスを毎フレーム見に行く。
    check("実ったら crops から消える", crops.count === 0, `${crops.count} 本`);
    check("消えたので peek は null", crops.peek(0, 40, 0) === null);
  }

  // --- 未読み込みの列 -------------------------------------------------------

  {
    // **ここが一番大事な 1 つ。** `getVoxel` は未読み込みで AIR を返すので、
    // 列の確認を飛ばすと**遠くの畑が丸ごと「掘られた」と読まれて忘れられる。**
    const field = new Field();
    const crops = new Crops();
    const far = CHUNK_SIZE * 5; // 別の列（cx = 5）
    planted(field, far, 40, 0);
    crops.plant(far, 40, 0);
    field.unloaded.add(`${5},${0}`);

    const changed = crops.update(GROW_SECONDS * 2, field);
    console.log(
      `      未読み込みの列（x=${far}）: 覚えている ${crops.count} 本 / ` +
        `育ち ${crops.peek(far, 40, 0)} 秒 / 書き込み ${field.writes} 回`,
    );
    check("未読み込みの列では忘れない", crops.count === 1, `${crops.count} 本`);
    check("未読み込みの列では育たない", crops.peek(far, 40, 0) === 0, `${crops.peek(far, 40, 0)}`);
    check("未読み込みの列には書き込まない", field.writes === 0, `${field.writes} 回`);
    check("何も起きていないので合図も出ない", changed === false);

    // 読み込まれれば、続きから育つ。
    field.unloaded.clear();
    crops.update(GROW_SECONDS, field);
    check("読み込まれたら育って実る", field.getVoxel(far, 40, 0) === WHEAT_CROP_RIPE);
  }

  // --- 下が耕地でなければ育たない -------------------------------------------

  {
    const field = new Field();
    const crops = new Crops();
    planted(field);
    field.set(0, 39, 0, DIRT); // 耕地を土に戻す（耕地でなくなった）
    crops.plant(0, 40, 0);

    const changed = crops.update(GROW_SECONDS * 2, field);
    console.log(
      `      下が土のとき: 覚えている ${crops.count} 本 / 育ち ${crops.peek(0, 40, 0)} 秒 / ` +
        `ブロック ${field.getVoxel(0, 40, 0)}`,
    );
    check("下が耕地でなければ育たない", field.getVoxel(0, 40, 0) === WHEAT_CROP);
    check("育たないだけで、忘れはしない", crops.count === 1, `${crops.count} 本`);
    check("秒数も進まない", crops.peek(0, 40, 0) === 0, `${crops.peek(0, 40, 0)}`);
    check("合図も出ない", changed === false);

    // 耕し直せば続きから育つ（忘れていないので、0 から数え直しにはならない）。
    field.set(0, 39, 0, FARMLAND);
    check("耕し直すと実る", crops.update(GROW_SECONDS, field) && field.getVoxel(0, 40, 0) === WHEAT_CROP_RIPE);
  }

  // --- 苗が消えていたら忘れる -----------------------------------------------

  {
    const field = new Field();
    const crops = new Crops();
    planted(field);
    crops.plant(0, 40, 0);
    field.set(0, 40, 0, AIR); // 掘られた

    const changed = crops.update(1, field);
    console.log(`      掘られたあと: 覚えている ${crops.count} 本 / 合図 ${changed}`);
    check("苗が消えていたら忘れる", crops.count === 0, `${crops.count} 本`);
    check("忘れたときも合図を出す（セーブの印）", changed === true);
  }

  {
    // **もう実っている印が残っていたら忘れること。** `baseBlock()` で見ると、実った小麦は
    // `variantOf: WHEAT_CROP` なので大元が苗になり、「もう実っている」を見分けられない。
    // 残したままだと `setVoxel` が「同じ値」で false を返し続け、**二度と消えない印**になる。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, FARMLAND);
    field.set(0, 40, 0, WHEAT_CROP_RIPE);
    crops.plant(0, 40, 0);

    const changed = crops.update(GROW_SECONDS * 2, field);
    console.log(
      `      実った小麦に印が残っていたとき: 覚えている ${crops.count} 本 / 書き込み ${field.writes} 回`,
    );
    check("もう実っているマスの印は忘れる", crops.count === 0, `${crops.count} 本`);
    check("忘れたので合図が出る", changed === true);
    check("同じ値を書き直そうとしない", field.writes === 0, `${field.writes} 回`);
  }

  // --- 書き込みが失敗したら持ち越す -----------------------------------------

  {
    // `syncLit()` と同じ作法。**成功したときだけ忘れること** —— 失敗したまま忘れると、
    // 育ちきった苗が苗のまま永久に残る。
    const field = new Field();
    const crops = new Crops();
    planted(field);
    crops.plant(0, 40, 0);
    field.frozen = true;

    const first = crops.update(GROW_SECONDS, field);
    console.log(
      `      書き込みが失敗したとき: 覚えている ${crops.count} 本 / 育ち ${crops.peek(0, 40, 0)} 秒 / 合図 ${first}`,
    );
    check("書けなかったら忘れない", crops.count === 1, `${crops.count} 本`);
    check("書けなかったら合図も出さない", first === false);
    check("育ちきった秒数は持ち越す", (crops.peek(0, 40, 0) ?? 0) >= GROW_SECONDS, `${crops.peek(0, 40, 0)}`);

    field.frozen = false;
    const second = crops.update(0, field);
    check("次のフレームで書けたら実る", field.getVoxel(0, 40, 0) === WHEAT_CROP_RIPE && second === true);
    check("そこで忘れる", crops.count === 0, `${crops.count} 本`);
  }

  // --- 植え直し -------------------------------------------------------------

  {
    // 掘って植え直した人が、前の苗の育ち具合を引き継いで即座に収穫できてはいけない。
    const field = new Field();
    const crops = new Crops();
    planted(field);
    crops.plant(0, 40, 0);
    crops.update(GROW_SECONDS - 1, field);
    crops.plant(0, 40, 0);
    check("同じマスに植え直すと 0 から数え直す", crops.peek(0, 40, 0) === 0, `${crops.peek(0, 40, 0)}`);
    check("本数は増えない", crops.count === 1, `${crops.count} 本`);
  }

  // --- 伸びるサトウキビ（18c） -----------------------------------------------

  console.log(`      CANE_GROW_SECONDS ${CANE_GROW_SECONDS} 秒 / CANE_HEIGHT_MAX ${CANE_HEIGHT_MAX} 段`);

  {
    // **段数の移りを先に 1 行出してから判定する**（`rules/testing.md`）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, SUGAR_CANE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, SUGAR_CANE, field);

    const heights = [caneHeight(field, 0, 40, 0)];
    for (let i = 0; i < 4; i++) {
      crops.update(CANE_GROW_SECONDS, field);
      heights.push(caneHeight(field, 0, 40, 0));
    }
    console.log(`      段数の移り（${CANE_GROW_SECONDS} 秒ごと）: ${heights.join(" → ")}`);
    check("秒数ごとに 1 段ずつ伸びる", heights[1] === 2 && heights[2] === 3, heights.join(" → "));
    check(
      `${CANE_HEIGHT_MAX} 段で止まる`,
      heights[3] === CANE_HEIGHT_MAX && heights[4] === CANE_HEIGHT_MAX,
      heights.join(" → "),
    );
    // **伸びきっても忘れないこと** —— 忘れると、刈ったあと二度と伸びない。
    check("伸びきっても印は残る", crops.count === 1, `${crops.count} 本`);
  }

  {
    // **刈ったらまた伸びてくる**（砂糖の畑が成り立つ）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    for (let dy = 0; dy < CANE_HEIGHT_MAX; dy++) field.set(0, 40 + dy, 0, SUGAR_CANE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, SUGAR_CANE, field);
    crops.update(CANE_GROW_SECONDS, field); // 伸びきっているので何も起きない

    field.set(0, 41, 0, AIR); // 上 2 つを刈る
    field.set(0, 42, 0, AIR);
    const after = [caneHeight(field, 0, 40, 0)];
    crops.update(CANE_GROW_SECONDS, field);
    after.push(caneHeight(field, 0, 40, 0));
    crops.update(CANE_GROW_SECONDS, field);
    after.push(caneHeight(field, 0, 40, 0));
    console.log(`      刈ったあとの段数: ${after.join(" → ")}`);
    check("刈ったら 0 秒から伸び直す", after[1] === 2 && after[2] === CANE_HEIGHT_MAX, after.join(" → "));
  }

  {
    // **覚えるのは列のいちばん下。** 上を覚えると、刈った瞬間に印が消えて二度と伸びない。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, SUGAR_CANE);
    field.set(0, 41, 0, SUGAR_CANE);
    crops.notePlaced({ x: 0, y: 41, z: 0 }, SUGAR_CANE, field); // 上を置いたと伝える
    console.log(
      `      上（y=41）を置いたとき: 覚えている ${crops.count} 本 / ` +
        `下 ${crops.peek(0, 40, 0)} / 上 ${crops.peek(0, 41, 0)}`,
    );
    check("覚えるのは列のいちばん下", crops.peek(0, 40, 0) === 0, `${crops.peek(0, 40, 0)}`);
    check("上のマスは覚えない", crops.peek(0, 41, 0) === null, `${crops.peek(0, 41, 0)}`);

    crops.notePlaced({ x: 0, y: 40, z: 0 }, SUGAR_CANE, field);
    check("同じ列に 2 本置いてもキーは 1 つ", crops.count === 1, `${crops.count} 本`);
  }

  {
    // `placeHeld()` は**全部のブロックで呼ばれる**ので、ここで弾けていないと
    // 石を置くたびに表が膨らむ。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 40, 0, STONE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, STONE, field);
    crops.notePlaced(undefined, SUGAR_CANE, field); // `at` の無い呼びは素通し
    console.log(`      サトウキビ以外を置いたあと: 覚えている ${crops.count} 本`);
    check("サトウキビ以外は 1 つも覚えない", crops.count === 0, `${crops.count} 本`);
  }

  {
    // **塞がっていたら書かない。秒数は持ち越す**（どけたらすぐ伸びる）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, SUGAR_CANE);
    field.set(0, 41, 0, STONE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, SUGAR_CANE, field);

    const changed = crops.update(CANE_GROW_SECONDS, field);
    console.log(
      `      上が石のとき: 段数 ${caneHeight(field, 0, 40, 0)} / 育ち ${crops.peek(0, 40, 0)} 秒 / ` +
        `書き込み ${field.writes} 回 / 合図 ${changed}`,
    );
    check("塞がっていたら伸びない", caneHeight(field, 0, 40, 0) === 1, `${caneHeight(field, 0, 40, 0)} 段`);
    check("塞がっていても忘れない", crops.count === 1, `${crops.count} 本`);
    check("秒数は持ち越す", (crops.peek(0, 40, 0) ?? 0) >= CANE_GROW_SECONDS, `${crops.peek(0, 40, 0)}`);
    check("石を書き換えようとしない", field.writes === 0 && changed === false, `${field.writes} 回`);

    field.set(0, 41, 0, AIR); // どけたら、持ち越したぶんですぐ伸びる
    check("どけたら次のフレームで伸びる", crops.update(0, field) === true && caneHeight(field, 0, 40, 0) === 2);
  }

  {
    // 小麦の節と同じ罠。`getVoxel` は未読み込みで AIR を返すので、
    // 列の確認を飛ばすと**遠くのサトウキビ畑が丸ごと忘れられる。**
    const field = new Field();
    const crops = new Crops();
    const far = CHUNK_SIZE * 5;
    field.set(far, 39, 0, SAND);
    field.set(far, 40, 0, SUGAR_CANE);
    crops.notePlaced({ x: far, y: 40, z: 0 }, SUGAR_CANE, field);
    field.unloaded.add(`${5},${0}`);

    const changed = crops.update(CANE_GROW_SECONDS * 2, field);
    console.log(
      `      未読み込みの列（x=${far}）: 覚えている ${crops.count} 本 / ` +
        `育ち ${crops.peek(far, 40, 0)} 秒 / 書き込み ${field.writes} 回`,
    );
    check("未読み込みの列では忘れない", crops.count === 1 && changed === false, `${crops.count} 本`);
    check("未読み込みの列には書き込まない", field.writes === 0, `${field.writes} 回`);
  }

  {
    // 掘られた（`AIR` になった）ら忘れる。**それ以外**の枝がそのまま効く。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, SUGAR_CANE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, SUGAR_CANE, field);
    field.set(0, 40, 0, AIR);

    const changed = crops.update(1, field);
    console.log(`      掘られたあと: 覚えている ${crops.count} 本 / 合図 ${changed}`);
    check("掘られたら忘れる", crops.count === 0, `${crops.count} 本`);
    check("忘れたときは合図を出す", changed === true);
  }

  {
    // **毎フレーム true を返さないこと** —— 伸びきったサトウキビが 1 本あるだけで
    // `saveDirty` が立ちっぱなしになり、自動保存が回り続ける。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    for (let dy = 0; dy < CANE_HEIGHT_MAX; dy++) field.set(0, 40 + dy, 0, SUGAR_CANE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, SUGAR_CANE, field);

    const first = crops.update(CANE_GROW_SECONDS, field);
    const second = crops.update(CANE_GROW_SECONDS, field);
    console.log(`      伸びきったあとの合図: ${first} / ${second} / 書き込み ${field.writes} 回`);
    check("伸びきっている間は合図を出さない", first === false && second === false, `${first} / ${second}`);
    check("伸びきっている間は書き込まない", field.writes === 0, `${field.writes} 回`);
  }

  {
    // **同じ表に混ざっても互いを壊さない**（道は `getVoxel` で分かれる）。
    const field = new Field();
    const crops = new Crops();
    planted(field); // 小麦（0,40,0）
    crops.plant(0, 40, 0);
    field.set(5, 39, 5, SAND);
    field.set(5, 40, 5, SUGAR_CANE);
    crops.notePlaced({ x: 5, y: 40, z: 5 }, SUGAR_CANE, field);
    check("2 本とも覚えている", crops.count === 2, `${crops.count} 本`);

    crops.update(Math.max(GROW_SECONDS, CANE_GROW_SECONDS), field);
    console.log(
      `      混ぜたあと: 小麦 ${field.getVoxel(0, 40, 0)}（実り ${WHEAT_CROP_RIPE}）/ ` +
        `サトウキビ ${caneHeight(field, 5, 40, 5)} 段 / 覚えている ${crops.count} 本`,
    );
    check("小麦は実る", field.getVoxel(0, 40, 0) === WHEAT_CROP_RIPE, `${field.getVoxel(0, 40, 0)}`);
    check("サトウキビは 1 段伸びる", caneHeight(field, 5, 40, 5) === 2, `${caneHeight(field, 5, 40, 5)} 段`);
    // 小麦は実って忘れ、サトウキビは残る。
    check("実った小麦だけが消える", crops.peek(5, 40, 5) === 0 && crops.count === 1, `${crops.count} 本`);
  }

  // --- 伸びるサボテン（37） ---------------------------------------------------
  //
  // **サトウキビとまったく同じ `growStack()` を通ります。** だから見るのは
  // 「サボテンの ID・上限・秒数でそこへ入れているか」で、順番そのものは
  // 上のサトウキビ 11 件がそのまま見張っています。

  console.log(
    `      CACTUS_GROW_SECONDS ${CACTUS_GROW_SECONDS} 秒 / CACTUS_HEIGHT_MAX ${CACTUS_HEIGHT_MAX} 段`,
  );

  {
    // a. **段数の移りを先に 1 行出してから判定する**（`rules/testing.md`）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, CACTUS);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, CACTUS, field);

    const heights = [cactusHeight(field, 0, 40, 0)];
    for (let i = 0; i < 4; i++) {
      crops.update(CACTUS_GROW_SECONDS, field);
      heights.push(cactusHeight(field, 0, 40, 0));
    }
    console.log(
      `      段数の移り（${CACTUS_GROW_SECONDS} 秒ごと）: ${heights.join(" → ")} / ` +
        `覚えている ${crops.count} 本`,
    );
    check(
      `サボテンは秒数ごとに 1 段ずつ伸び、${CACTUS_HEIGHT_MAX} 段で止まって印は残る`,
      heights[1] === 2 && heights[2] === CACTUS_HEIGHT_MAX &&
        heights[3] === CACTUS_HEIGHT_MAX && heights[4] === CACTUS_HEIGHT_MAX && crops.count === 1,
      `${heights.join(" → ")} / 覚えている ${crops.count} 本`,
    );
  }

  {
    // b. **刈ったら 0 秒から伸び直す**（伸びきっている間に秒数を溜め込んでいないか）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    for (let dy = 0; dy < CACTUS_HEIGHT_MAX; dy++) field.set(0, 40 + dy, 0, CACTUS);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, CACTUS, field);
    crops.update(CACTUS_GROW_SECONDS, field); // 伸びきっているので何も起きない

    field.set(0, 41, 0, AIR); // 上 2 つを刈る
    field.set(0, 42, 0, AIR);
    const after = [cactusHeight(field, 0, 40, 0)];
    crops.update(CACTUS_GROW_SECONDS, field);
    after.push(cactusHeight(field, 0, 40, 0));
    crops.update(CACTUS_GROW_SECONDS, field);
    after.push(cactusHeight(field, 0, 40, 0));
    console.log(`      刈ったあとの段数: ${after.join(" → ")}`);
    check(
      "刈ったサボテンは 0 秒から伸び直す",
      after[0] === 1 && after[1] === 2 && after[2] === CACTUS_HEIGHT_MAX,
      after.join(" → "),
    );
  }

  {
    // c. **塞がっていたら書かない。秒数は持ち越す**（どけたらすぐ伸びる）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, CACTUS);
    field.set(0, 41, 0, STONE);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, CACTUS, field);

    const changed = crops.update(CACTUS_GROW_SECONDS, field);
    const blocked = cactusHeight(field, 0, 40, 0);
    const carried = crops.peek(0, 40, 0) ?? 0;
    // **書き込みの回数はここで控えること** —— あとで読むと、どけたあとの 1 回が乗ります。
    const blockedWrites = field.writes;
    console.log(
      `      上が石のとき: 段数 ${blocked} / 育ち ${carried} 秒 / ` +
        `書き込み ${blockedWrites} 回 / 合図 ${changed}`,
    );
    field.set(0, 41, 0, AIR); // どけたら、持ち越したぶんですぐ伸びる
    const freed = crops.update(0, field);
    console.log(`      石をどけた次のフレーム: 段数 ${cactusHeight(field, 0, 40, 0)} / 合図 ${freed}`);
    check(
      "上が塞がっていたら伸びず・秒数は持ち越し・どけたら次のフレームで伸びる",
      blocked === 1 && changed === false && blockedWrites === 0 && carried >= CACTUS_GROW_SECONDS &&
        freed === true && cactusHeight(field, 0, 40, 0) === 2,
      `塞がり ${blocked} 段 / 育ち ${carried} 秒 / 塞がっている間の書き込み ${blockedWrites} 回 / ` +
        `どけたあと ${cactusHeight(field, 0, 40, 0)} 段`,
    );
  }

  {
    // d. **覚えるのは列のいちばん下**（上を覚えると、刈った瞬間に印が消えて二度と伸びない）。
    // **舐める比較を `SUGAR_CANE` で書き写していたら、ここで上を覚えて落ちる。**
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, CACTUS);
    field.set(0, 41, 0, CACTUS);
    crops.notePlaced({ x: 0, y: 41, z: 0 }, CACTUS, field); // 2 段目を置いたと伝える
    crops.notePlaced({ x: 0, y: 40, z: 0 }, CACTUS, field); // 同じ列にもう 1 本
    console.log(
      `      2 段目（y=41）を置いたとき: 覚えている ${crops.count} 本 / ` +
        `下 ${crops.peek(0, 40, 0)} / 上 ${crops.peek(0, 41, 0)}`,
    );
    check(
      "覚えるのは列のいちばん下で、同じ列に 2 本置いてもキーは 1 つ",
      crops.peek(0, 40, 0) === 0 && crops.peek(0, 41, 0) === null && crops.count === 1,
      `下 ${crops.peek(0, 40, 0)} / 上 ${crops.peek(0, 41, 0)} / ${crops.count} 本`,
    );
  }

  {
    // e. **未読み込みの列では 1 マスも書かず、印も忘れない**（`syncLit()` と同じ罠）。
    // 書き込みが落ちるほう（`frozen`）でも忘れないことを続けて見る。
    const field = new Field();
    const crops = new Crops();
    const far = CHUNK_SIZE * 7;
    field.set(far, 39, 0, SAND);
    field.set(far, 40, 0, CACTUS);
    crops.notePlaced({ x: far, y: 40, z: 0 }, CACTUS, field);
    field.unloaded.add(`${7},${0}`);

    const changed = crops.update(CACTUS_GROW_SECONDS * 2, field);
    const writesWhileUnloaded = field.writes;
    console.log(
      `      未読み込みの列（x=${far}）: 覚えている ${crops.count} 本 / ` +
        `育ち ${crops.peek(far, 40, 0)} 秒 / 書き込み ${writesWhileUnloaded} 回 / 合図 ${changed}`,
    );

    field.unloaded.delete(`${7},${0}`);
    field.frozen = true; // 読み込めても書き込みが落ちる番
    crops.update(CACTUS_GROW_SECONDS, field);
    console.log(
      `      書き込みが落ちる番: 覚えている ${crops.count} 本 / 段数 ${cactusHeight(field, far, 40, 0)} / ` +
        `書き込み ${field.writes} 回`,
    );
    check(
      "未読み込みの列では 1 マスも書かず、書き込みが落ちても印を忘れない",
      writesWhileUnloaded === 0 && changed === false && crops.count === 1 &&
        cactusHeight(field, far, 40, 0) === 1 && field.writes === 1,
      `未読み込み中の書き込み ${writesWhileUnloaded} 回 / 覚えている ${crops.count} 本 / ` +
        `段数 ${cactusHeight(field, far, 40, 0)} / 書き込み ${field.writes} 回`,
    );
  }

  {
    // f. **自然に生えたサボテンは伸びない**（誰も置いていないので印が無い）。
    // **表が空だと `update()` が先頭で返る**ので、置いたぶんを 1 本隣に立てて
    // 「回っているのに伸びていない」を見ること（`rules/testing.md` の 1 つ目）。
    const field = new Field();
    const crops = new Crops();
    field.set(0, 39, 0, SAND);
    field.set(0, 40, 0, CACTUS);
    crops.notePlaced({ x: 0, y: 40, z: 0 }, CACTUS, field); // 置いたぶん
    field.set(4, 39, 0, SAND);
    field.set(4, 40, 0, CACTUS); // 自然に生えたぶん（`notePlaced()` を呼ばない）

    crops.update(CACTUS_GROW_SECONDS, field);
    console.log(
      `      置いたぶん ${cactusHeight(field, 0, 40, 0)} 段 / ` +
        `自然に生えたぶん ${cactusHeight(field, 4, 40, 0)} 段 / 覚えている ${crops.count} 本`,
    );
    check(
      "印の無いサボテン（自然生成ぶん）は伸びない（置いたぶんは伸びている）",
      cactusHeight(field, 0, 40, 0) === 2 && cactusHeight(field, 4, 40, 0) === 1 &&
        crops.count === 1 && crops.peek(4, 40, 0) === null,
      `置いた ${cactusHeight(field, 0, 40, 0)} 段 / 自然 ${cactusHeight(field, 4, 40, 0)} 段 / ` +
        `${crops.count} 本`,
    );
  }

  // --- 苗木が木に育つ（30b） --------------------------------------------------

  /** その列に立っている幹の本数（下から上へ舐める）。 */
  const trunkHeight = (field: Field, x: number, y: number, z: number, wood: number): number => {
    let n = 0;
    while (field.getVoxel(x, y + n, z) === wood) n++;
    return n;
  };
  /** 根元のまわり（±3 マス・上へ 14 マス）にある葉の枚数。 */
  const leafCount = (field: Field, x: number, y: number, z: number, leaf: number): number => {
    let n = 0;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dy = -1; dy <= 14; dy++) {
          if (field.getVoxel(x + dx, y + dy, z + dz) === leaf) n++;
        }
      }
    }
    return n;
  };
  /** 土の上に立てた苗木 1 本。**置いたマスをそのまま覚える**（サトウキビと違う点）。 */
  const sapled = (field: Field, crops: Crops, id: number, x = 0, y = 40, z = 0): void => {
    field.set(x, y - 1, z, DIRT);
    field.set(x, y, z, id);
    crops.notePlaced({ x, y, z }, id, field);
  };

  console.log(`      SAPLING_GROW_SECONDS ${SAPLING_GROW_SECONDS} 秒`);

  {
    const field = new Field();
    const crops = new Crops();
    sapled(field, crops, SAPLING);
    check("苗木を置いたら 1 本覚える", crops.count === 1, `${crops.count} 本`);

    crops.update(SAPLING_GROW_SECONDS - 1, field);
    console.log(
      `      ${SAPLING_GROW_SECONDS - 1} 秒: その場は ${blockName(field.getVoxel(0, 40, 0))}` +
        ` / 書き込み ${field.writes} 回`,
    );
    check(
      `${SAPLING_GROW_SECONDS - 1} 秒では苗木のまま`,
      field.getVoxel(0, 40, 0) === SAPLING && field.writes === 0,
      `${blockName(field.getVoxel(0, 40, 0))} / ${field.writes} 回`,
    );

    const changed = crops.update(1, field);
    const height = grownTreeHeight("oak", 0, 0);
    const trunk = trunkHeight(field, 0, 40, 0, WOOD);
    const leaves = leafCount(field, 0, 40, 0, LEAVES);
    console.log(
      `      ${SAPLING_GROW_SECONDS} 秒: 幹 ${trunk} 本（高さ ${height}）/ 葉 ${leaves} 枚 / ` +
        `覚えている ${crops.count} 本 / 合図 ${changed}`,
    );
    check("180 秒でその場が幹になる", field.getVoxel(0, 40, 0) === WOOD, blockName(field.getVoxel(0, 40, 0)));
    check("幹が高さのぶんだけ立つ", trunk === height, `${trunk} 本 / ${height}`);
    check("葉が 1 枚以上つく", leaves > 0, `${leaves} 枚`);
    check("育ったら忘れる", crops.count === 0 && changed === true, `${crops.count} 本 / ${changed}`);
    // **真下の土は残る**（幹は苗木のあったマスから上へ立つ）。
    check("真下の土は残る", field.getVoxel(0, 39, 0) === DIRT, blockName(field.getVoxel(0, 39, 0)));
  }

  {
    // **種類を取り違えないこと** —— 幹も葉も高さもトウヒのものになる。
    const oakField = new Field();
    const oak = new Crops();
    sapled(oakField, oak, SAPLING);
    oak.update(SAPLING_GROW_SECONDS, oakField);

    const spruceField = new Field();
    const spruce = new Crops();
    sapled(spruceField, spruce, SPRUCE_SAPLING);
    spruce.update(SAPLING_GROW_SECONDS, spruceField);

    const oakTrunk = trunkHeight(oakField, 0, 40, 0, WOOD);
    const spruceTrunk = trunkHeight(spruceField, 0, 40, 0, SPRUCE_WOOD);
    console.log(
      `      オーク: 幹 ${blockName(oakField.getVoxel(0, 40, 0))} ${oakTrunk} 本 / ` +
        `葉 ${leafCount(oakField, 0, 40, 0, LEAVES)} 枚`,
    );
    console.log(
      `      トウヒ: 幹 ${blockName(spruceField.getVoxel(0, 40, 0))} ${spruceTrunk} 本 / ` +
        `葉 ${leafCount(spruceField, 0, 40, 0, SPRUCE_LEAVES)} 枚`,
    );
    check("トウヒの苗木はトウヒの幹になる", spruceField.getVoxel(0, 40, 0) === SPRUCE_WOOD);
    check("トウヒの葉がつく", leafCount(spruceField, 0, 40, 0, SPRUCE_LEAVES) > 0);
    check("トウヒにオークの葉は混ざらない", leafCount(spruceField, 0, 40, 0, LEAVES) === 0);
    check("オークにトウヒの葉は混ざらない", leafCount(oakField, 0, 40, 0, SPRUCE_LEAVES) === 0);
    check(
      "トウヒのほうが高い（6..9 対 4..6）",
      spruceTrunk > oakTrunk,
      `トウヒ ${spruceTrunk} / オーク ${oakTrunk}`,
    );
  }

  {
    // **上が塞がっていたら育たない。忘れもしない**（どけたらすぐ育つ）。
    const field = new Field();
    const crops = new Crops();
    sapled(field, crops, SAPLING);
    field.set(0, 41, 0, STONE);

    crops.update(SAPLING_GROW_SECONDS, field);
    console.log(
      `      石で塞いだまま ${SAPLING_GROW_SECONDS} 秒: その場は ${blockName(field.getVoxel(0, 40, 0))}` +
        ` / 覚えている ${crops.count} 本 / 書き込み ${field.writes} 回`,
    );
    check("塞がっていたら育たない", field.getVoxel(0, 40, 0) === SAPLING, blockName(field.getVoxel(0, 40, 0)));
    check("塞がっていても忘れない", crops.count === 1, `${crops.count} 本`);
    check("塞がっている間は 1 マスも書かない", field.writes === 0, `${field.writes} 回`);

    field.set(0, 41, 0, AIR);
    crops.update(0.1, field);
    console.log(`      石をどけて 0.1 秒: その場は ${blockName(field.getVoxel(0, 40, 0))}`);
    check("どけたら育つ（秒数を持ち越している）", field.getVoxel(0, 40, 0) === WOOD, blockName(field.getVoxel(0, 40, 0)));
  }

  {
    // **木の掛かる 4 隅の列が全部そろうまで 1 マスも書かないこと** ——
    // 「書けたところまで書く」で済ませると、半分だけの木が残って二度と直らない。
    const field = new Field();
    const crops = new Crops();
    // x=15 は列 0 の東端。葉は x=17（列 1）まで届く。
    sapled(field, crops, SAPLING, 15, 40, 0);
    field.unloaded.add("1,0");

    const changed = crops.update(SAPLING_GROW_SECONDS * 2, field);
    console.log(
      `      隣の列（1,0）が未読み込み: 書き込み ${field.writes} 回 / ` +
        `覚えている ${crops.count} 本 / 育ち ${crops.peek(15, 40, 0)} 秒 / 合図 ${changed}`,
    );
    check("列がそろうまで 1 マスも書かない", field.writes === 0, `${field.writes} 回`);
    check("列がそろうまで忘れない", crops.count === 1 && changed === false, `${crops.count} 本`);

    field.unloaded.delete("1,0");
    crops.update(0.1, field);
    const trunk = trunkHeight(field, 15, 40, 0, WOOD);
    console.log(`      列がそろったあと: 幹 ${trunk} 本 / 覚えている ${crops.count} 本`);
    check("列がそろえば次の update で育つ", trunk === grownTreeHeight("oak", 15, 0), `${trunk} 本`);
  }

  {
    // 掘られたら忘れる（**それ以外**の枝がそのまま効く）。
    const field = new Field();
    const crops = new Crops();
    sapled(field, crops, SPRUCE_SAPLING);
    field.set(0, 40, 0, AIR);

    const changed = crops.update(1, field);
    console.log(`      苗木を掘ったあと: 覚えている ${crops.count} 本 / 合図 ${changed}`);
    check("掘った苗木は忘れる", crops.count === 0 && changed === true, `${crops.count} 本`);
  }

  // --- セーブ ---------------------------------------------------------------

  {
    const crops = new Crops();
    // **1 本も無ければキーごと省く**（`furnaces` / `chests` と同じ作法）。
    // 畑を作っていない人のセーブは 1 バイトも増えない。
    check("1 本も無ければ書き出さない", crops.serialize() === undefined, String(crops.serialize()));

    const field = new Field();
    planted(field, 3, 41, -7);
    planted(field, -1, 40, 2);
    crops.plant(3, 41, -7);
    crops.update(12.5, field);
    // **2 本目は育てたあとに植える**（0 秒のものも書き出されることを見るため）。
    crops.plant(-1, 40, 2);
    const raw = crops.serialize();
    console.log(`      書き出した形: ${JSON.stringify(raw)}`);
    check("キーは \"x,y,z\"、値は育った秒数", raw?.["3,41,-7"] === 12.5, JSON.stringify(raw));
    check("育っていない苗も載る", raw?.["-1,40,2"] === 0, JSON.stringify(raw));

    const back = new Crops();
    back.deserialize(raw);
    check("往復しても本数が同じ", back.count === crops.count, `${back.count} / ${crops.count}`);
    check("往復しても秒数が同じ", back.peek(3, 41, -7) === 12.5, `${back.peek(3, 41, -7)}`);
    check("負の座標も往復する", back.peek(-1, 40, 2) === 0, `${back.peek(-1, 40, 2)}`);

    back.clear();
    check("clear で空になる", back.count === 0 && back.serialize() === undefined);
  }

  {
    // **壊れた値は黙って飛ばす**（読めないより、欠けるほうがまし）。
    const crops = new Crops();
    crops.deserialize({
      "1,2,3": 10,
      "1,2": 5, // 座標が 2 つしかない
      "a,b,c": 5, // 数でない
      "4,5,6": Number.NaN,
      "7,8,9": -1, // 負の秒数（入れるとその苗だけ永久に実らない）
      ",,": 1,
    } as Record<string, number>);
    console.log(`      壊れたセーブから読めたもの: ${JSON.stringify(crops.serialize())}`);
    check("読めた 1 本だけが残る", crops.count === 1, `${crops.count} 本`);
    check("読めたものは正しい", crops.peek(1, 2, 3) === 10, `${crops.peek(1, 2, 3)}`);

    crops.deserialize(undefined);
    check("セーブに無ければ空", crops.count === 0);
  }

  // --- 見張り ---------------------------------------------------------------

  {
    const source = sourceOf("src/crops.ts");
    // **判断だけのファイル**（`beds.ts` / `dimensions.ts` / `session.ts` と同じ形）。
    for (const word of ["three", "document", "Mesh", "AudioContext", "localStorage"]) {
      check(`crops.ts に ${word} が無い`, !source.includes(word));
    }
    // **乱数を入れないこと** —— 入れた瞬間、何秒で実るかをテストで固定できなくなる。
    check("crops.ts に Math.random が無い", !source.includes("Math.random("));
    // **`World` を丸ごと受け取らないこと**（`beds.ts` と同じ作法）。
    check("crops.ts が World を import していない", !/from "\.\/world"/.test(source));
    // 未読み込みの列を確かめる 1 行。**外すと遠くの畑が丸ごと忘れられる。**
    check("crops.ts が列の読み込みを確かめている", source.includes("hasColumn("));

    // **`main.ts` に秒数を書かないこと。** 書くと `crops.ts` と二重管理になる。
    const main = sourceOf("src/main.ts");
    check("main.ts に GROW_SECONDS が無い", !main.includes("GROW_SECONDS"));
    check("main.ts に 育つ秒数（180）が無い", !/\b180\b/.test(main));
  }
}
