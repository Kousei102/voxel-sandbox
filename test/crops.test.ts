/**
 * 育つ苗（`src/crops.ts`）。**判断だけのファイル**なので、偽物のワールドを 1 つ書けば
 * 丸ごとヘッドレスで確かめられる（`beds.ts` / `furnaces.ts` と同じ形）。
 *
 * **秒数は `GROW_SECONDS` を import すること。** 180 と書き写すと、数値を変えたときに
 * 「テストだけが古い値で緑」になる（＝判定をゆるめたのと同じ）。
 */

import { AIR, DIRT, FARMLAND, WHEAT_CROP, WHEAT_CROP_RIPE } from "../src/blocks";
import { CHUNK_SIZE } from "../src/constants";
import { Crops, GROW_SECONDS, cropKey, type CropWorld } from "../src/crops";
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
