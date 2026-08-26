import {
  DIMENSIONS,
  Dimensions,
  END,
  NETHER,
  OVERWORLD,
  emptyState,
  type DimensionDef,
  type DimensionState,
} from "../src/dimensions";
import { WorldGen } from "../src/worldgen";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 次元の器。**ここで守りたいのは 1 つだけ: 移って戻ったときに、置いてきたものが残っていること。**
 *
 * 落ちても画面には何も出ません（`storage.test.ts` と同じ性質）。
 * 掘った跡・落とした物・かまどの中身が黙って消えるだけなので、必ずここで見ます。
 */

/** 偽の次元。**生成器は数を持つだけの張りぼて**（地形はここでは関係がない）。 */
function fake(id: string, salt: number): DimensionDef {
  return {
    id,
    name: `偽の${id}`,
    salt,
    create: (seed) => ({ seed, generateChunk: () => {} }),
  };
}

/** 試験用の表。**本物のオーバーワールドと、まだ実装されていない次元 2 つ。** */
const TEST_DEFS: readonly DimensionDef[] = [
  ...DIMENSIONS,
  fake("あちら", 0x1111),
  fake("そちら", 0x2222),
];

/** 見分けのつく持ち物を 1 式。 */
function state(mark: number): DimensionState {
  return {
    edits: { "0,2,0": [mark, mark + 1] },
    drops: [mark, 1, 0.5, 40, 0.5],
    furnaces: { [`${mark},2,0`]: [mark, 1, 0, 0, 0, 0, 0, 0, 0] },
    chests: { [`${mark},3,0`]: [mark, 64] },
  };
}

export function run(): void {
  describe("次元（切り替えとセーブ）");

  // --- 器の基本 -----------------------------------------------------------

  {
    const dims = new Dimensions();
    check("始まりはオーバーワールド", dims.current === OVERWORLD, dims.current);
    check(
      "行ったことのない次元の持ち物は空",
      Object.keys(dims.stateOf("あちら").edits).length === 0,
    );
    check("空の状態に edits がある（形が崩れていない）", !!emptyState().edits);
  }

  // --- 生成器 -------------------------------------------------------------

  {
    const dims = new Dimensions();
    const source = dims.sourceFor(OVERWORLD, 12345);
    check("オーバーワールドの生成器が作れる", source !== null);
    // **salt 0 なので種はそのまま。** ここが変わると既存のワールドの地形が別物になる。
    check("オーバーワールドの種はそのまま", source?.seed === 12345, String(source?.seed));
    check("オーバーワールドの生成器は WorldGen", source instanceof WorldGen);
    // 作り直すと列のキャッシュが毎回捨てられ、行き来のたびに生成をやり直すことになる。
    check("同じ次元には同じ生成器を返す", dims.sourceFor(OVERWORLD, 12345) === source);

    const other = new Dimensions(TEST_DEFS);
    const a = other.sourceFor("あちら", 12345);
    const b = other.sourceFor("そちら", 12345);
    check(
      "次元ごとに種が違う（同じ地形にならない）",
      a?.seed !== 12345 && b?.seed !== 12345 && a?.seed !== b?.seed,
      `${a?.seed} / ${b?.seed}`,
    );

    check("表に無い次元の生成器は null", dims.sourceFor("どちら", 1) === null);
    check(
      "いま遊べるのは 3 つ（オーバーワールド・ネザー・エンド）",
      dims.ids.length === 3,
      dims.ids.join(" "),
    );
    check("ネザーが表にある", dims.known(NETHER));
    check("エンドが表にある", dims.known(END));
    // **`salt` は次元ごとに違うこと。** 同じにすると、ネザーの床とエンドの島が
    // 同じノイズから出て、同じ癖の形になる。
    const salts = new Set(DIMENSIONS.map((d) => d.salt));
    check("次元ごとに `salt` が違う", salts.size === DIMENSIONS.length, [...salts].join(" "));
    // **オーバーワールドの `salt` は 0 のまま。** 変えると既存のワールドが別物になる。
    const netherSource = dims.sourceFor(NETHER, 12345);
    check(
      "ネザーの種はオーバーワールドと違う（同じ地形にならない）",
      netherSource !== null && netherSource.seed !== 12345,
      `${netherSource?.seed}`,
    );
    check("名前が引ける", dims.nameOf(OVERWORLD) === "オーバーワールド" && dims.nameOf(NETHER) === "ネザー");
    check("知らない次元の名前は id そのまま", dims.nameOf("どちら") === "どちら");
  }

  // --- 往復（ここが本題） -------------------------------------------------

  {
    const dims = new Dimensions(TEST_DEFS);
    const home = state(11);

    const away = dims.switchTo("あちら", home);
    check("移れた", dims.current === "あちら", dims.current);
    check("移った先は初めてなので空", away !== null && Object.keys(away.edits).length === 0);

    // 移った先で何かして、戻る。
    const back = dims.switchTo(OVERWORLD, state(22));
    check("戻れた", dims.current === OVERWORLD);
    // **これが一番大事な 1 行。** ここが壊れると、ネザーから戻った人の家が消える。
    check(
      "戻るとオーバーワールドの改変が残っている",
      back?.edits["0,2,0"]?.[0] === 11,
      JSON.stringify(back?.edits),
    );
    check("落とし物も残っている", back?.drops?.[0] === 11);
    check("かまども残っている", !!back?.furnaces?.["11,2,0"]);
    check("チェストも残っている", !!back?.chests?.["11,3,0"]);

    // もう一度行くと、置いてきたものがある。
    const again = dims.switchTo("あちら", back ?? emptyState());
    check(
      "もう一度行くと置いてきたものがある",
      again?.edits["0,2,0"]?.[0] === 22,
      JSON.stringify(again?.edits),
    );
  }

  {
    const dims = new Dimensions(TEST_DEFS);
    // **知らない次元へは移らない。** 生成器が無いので、行けたら世界が空になる。
    const gone = dims.switchTo("どちら", state(33));
    check("表に無い次元へは移れない", gone === null);
    check("移れなかったら居場所も動かない", dims.current === OVERWORLD, dims.current);
    check(
      "移れなくても預けたぶんは失わない",
      dims.stateOf(OVERWORLD).edits["0,2,0"] === undefined,
      "預けていないので空のまま",
    );
  }

  {
    const dims = new Dimensions(TEST_DEFS);
    dims.switchTo("あちら", state(44));
    dims.reset();
    check("reset で居場所が戻る", dims.current === OVERWORLD);
    check(
      "reset で預かりも消える",
      Object.keys(dims.stateOf(OVERWORLD).edits).length === 0 &&
        Object.keys(dims.stateOf("あちら").edits).length === 0,
    );
  }

  // --- セーブに書く形 -----------------------------------------------------

  {
    const dims = new Dimensions(TEST_DEFS);
    const shape = dims.forSave(state(55));
    // **オーバーワールドに居る限り、保存の形は今までと同じ**（既存のセーブと差が出ない）。
    check("オーバーワールドだけなら dim が出ない", shape.dim === undefined);
    check("オーバーワールドだけなら dims が出ない", shape.others === undefined);
    check("上の階層にオーバーワールドの持ち物が入る", shape.top.edits["0,2,0"]?.[0] === 55);
  }

  {
    const dims = new Dimensions(TEST_DEFS);
    dims.switchTo("あちら", state(66));
    const shape = dims.forSave(state(77));

    check("別の次元に居ると dim が付く", shape.dim === "あちら", String(shape.dim));
    // **上の階層は必ずオーバーワールドのぶん。** ここが入れ替わると、
    // 古いコードで読んだときに別の次元の地形がオーバーワールドに貼られる。
    check("上の階層はオーバーワールドのまま", shape.top.edits["0,2,0"]?.[0] === 66);
    check("いま居る次元は dims の下", shape.others?.["あちら"]?.edits["0,2,0"]?.[0] === 77);
    check(
      "dims にオーバーワールドは入らない",
      shape.others !== undefined && !(OVERWORLD in shape.others),
    );

    // 保存の直前に預け忘れると、いま居る次元の改変だけが消える。
    // `forSave` が `stash` を兼ねているので、忘れようがない。
    check("forSave は預けるのを兼ねている", dims.stateOf("あちら").edits["0,2,0"]?.[0] === 77);
  }

  // --- セーブから戻す -----------------------------------------------------

  {
    const first = new Dimensions(TEST_DEFS);
    first.switchTo("あちら", state(88));
    const shape = first.forSave(state(99));

    const second = new Dimensions(TEST_DEFS);
    const here = second.fromSave({ dim: shape.dim, top: shape.top, others: shape.others });
    check("読み直すと同じ次元に居る", second.current === "あちら", second.current);
    check("読み直すと同じ持ち物", here.edits["0,2,0"]?.[0] === 99, JSON.stringify(here.edits));
    check(
      "読み直してもオーバーワールドのぶんは無事",
      second.stateOf(OVERWORLD).edits["0,2,0"]?.[0] === 88,
    );

    // 往復して書き出しても形が変わらないこと（保存 → 読み込み → 保存）。
    const again = second.forSave(here);
    check(
      "書き出し直しても形が変わらない",
      JSON.stringify(again) === JSON.stringify(shape),
      JSON.stringify(again),
    );
  }

  {
    // **まだ実装していない次元に居るセーブ**（別のブランチで作ったもの）。
    // 立たせると生成器が無くて世界が空になるので、オーバーワールドに落とす。
    // **表に無い名前で試すこと** —— エンドも表に載ったので、いまは
    // 「まだ実装されていない、この先の次元」を名乗らせている。
    const FUTURE = "むこう";
    const dims = new Dimensions();
    check("試すのは本当に表に無い次元", !dims.known(FUTURE));
    const here = dims.fromSave({
      dim: FUTURE,
      top: state(1),
      others: { [FUTURE]: state(2) },
    });
    check("知らない次元に居るセーブはオーバーワールドに落とす", dims.current === OVERWORLD);
    check("落とした先の持ち物は上の階層のぶん", here.edits["0,2,0"]?.[0] === 1);
    // **捨てないこと。** 次元が実装された周に、そのまま続きが遊べる。
    check("行けない次元の預かりは捨てない", dims.stateOf(FUTURE).edits["0,2,0"]?.[0] === 2);
    const shape = dims.forSave(here);
    check("書き出すと預かりもそのまま出る", shape.others?.[FUTURE]?.edits["0,2,0"]?.[0] === 2);
  }

  {
    // 壊れた・古いセーブ。**`edits` が無いだけで読めなくなってはいけない。**
    const dims = new Dimensions();
    const here = dims.fromSave({ dim: undefined, top: undefined, others: undefined });
    check("何も無いセーブでも空で開ける", Object.keys(here.edits).length === 0);
    check("何も無いセーブならオーバーワールド", dims.current === OVERWORLD);
  }

  // --- 見張り -------------------------------------------------------------

  {
    const source = sourceOf("src/dimensions.ts");
    // 判断だけのファイル（`portals.ts` / `liquids.ts` と同じ形）。
    for (const word of ["three", "document", "Mesh", "AudioContext", "Math.random"]) {
      check(`dimensions.ts に ${word} が無い`, !source.includes(word));
    }

    const main = sourceOf("src/main.ts");
    // 預け忘れを型では防げないので、**呼び方そのもの**を見張る。
    check("main.ts は保存の前に必ず預ける", main.includes("forSave(liveState())"));
    // 持ち物の組み立ては 1 か所（写すと、片方だけ直したときに静かに食い違う）。
    // **いまは `session.ts` の `collectState()` がその 1 か所**（`main.ts` は呼ぶだけ）。
    // **`\b` を落とさないこと** —— `deserializeEdits(` にも当たって 2 か所に見える。
    const inMain = main.match(/\bserializeEdits\(/g)?.length ?? 0;
    check("main.ts は持ち物を自分で組み立てない", inMain === 0, `${inMain} か所`);
    const built = sourceOf("src/session.ts").match(/\bserializeEdits\(/g)?.length ?? 0;
    check("持ち物の組み立ては session.ts の 1 か所", built === 1, `${built} か所`);
    check("main.ts はその 1 か所を通す", main.includes("collectState("));

    // **次元を移る経路が増えても、預け忘れを起こさせない。**
    // `switchTo()` の第 2 引数は「置いていく次元の持ち物」で、ここに `liveState()`
    // 以外（`emptyState()` など）を渡すと、**残してきた改変・落とし物・かまど・
    // チェストが黙って消える**。型では防げない（どちらも `DimensionState`）ので、
    // **呼び方の数**で見張る。いまの経路は 2 つ（ポータル / リスポーンで次元を戻す）。
    const switches = main.match(/switchTo\(/g)?.length ?? 0;
    const withLive = main.match(/switchTo\([^)]*liveState\(\)/g)?.length ?? 0;
    check(
      "main.ts の switchTo は全部 liveState() を渡している",
      switches > 0 && switches === withLive,
      `${withLive} / ${switches} か所`,
    );
  }
}
