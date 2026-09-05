# 仕様: サトウキビが積める（18b）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の 18b を 2 件に割った前半。** 後半 **18c（時間で上へ伸びる）はキューへ
戻しました** —— あちらだけが位置ごとの状態（`crops.ts` の形）と **`main.ts` の配線 6 行**を要ります。
**`main.ts` はいま 1447 行**（止まる目安 1450）で、**この周は 1 行も書きません**。**新しい ID は
0 個**、**セーブは 1 バイトも増えません**。

## 1. 何を足すか / 完了の判定

**サトウキビの上にサトウキビを置けるようにし、生成でも 1〜3 段で立つようにする**（いまは十字が
支えになれないので `canPlaceAt()` が必ず断り、生成も高さ 1 固定）。完了の判定
（`npm test` が**全部緑のまま**、次が増えていること。いま 3090 件）:

- `test/blocks.test.ts` —— **`supportsBlock()` の真理値表を出してから**「サトウキビの上の
  サトウキビは置ける」「サトウキビの上の松明は置けない」「石の上のサトウキビは置ける」
  「空気の上は置けない」。**本物の `World` で 3 段積み、いちばん下を壊すと上 2 段が
  `onAutoBreak` で落ちる**（手本は同じファイルの小麦の節）
- `test/placing.test.ts` —— **狙ったマスと立ったマスを出してから**「上面を狙うと 1 つ上に立つ」
  「横面を狙うと隣のマスに立つ（積まれない）」「支えの無い空中は `blocked`」
- `test/worldgen.test.ts` —— **段数の分布を出してから**「1・2・3 段がどれも 2 割以上」「4 段以上が
  0 本」「**どの段の真下も砂かサトウキビ**（葉に負けて浮いていない）」。**既存の密度の判定
  （`BiomeDef.cane` の 0.7〜1.3 倍）は 1 文字も動かさないこと**
- **数え直し**: **空き 111・`MAX_ITEM_ID` 144・アイテム 109 種・立方体 39 / 非立方体 72 が動かない**

## 2. 触るファイル / 触らないファイル

| ファイル | 何を書くか |
| --- | --- |
| `src/blocks.ts` | `BlockDef.stacksOnSelf` / `stacksOnSelf()` / **`supportsBlock()`** / `CANE_HEIGHT_MAX = 3` / サトウキビの def から **`replaceable: true` を外す**（下の 4.） |
| `src/world.ts` | `canPlaceAt()` と `breakUnsupported()` の 2 か所を `supportsBlock()` に付け替える（**片方だけ直さないこと**） |
| `src/worldgen.ts` | 生えものの書き込みを「サトウキビだけ 1〜3 段」に（下の 4.） |
| `test/arena.ts` | `canPlaceAt()` の**写しも同じ式に**（写しはここ 1 か所だけ） |
| `test/blocks.test.ts` `test/placing.test.ts` `test/worldgen.test.ts` | 上の件 + 数え直し |
| `ROADMAP.md` `TUNING.md` | 143 の行を「積める・1〜3 段」に直す / 段数と `replaceable` を外した理由 |

**触らないこと**: **`src/main.ts`（1 行も）** / **`canSupport()` の中身**（松明とベッドの足場です。
`rules/blocks-shapes.md`）/ `src/placing.ts`（**0 行** —— `placeSpot()` も `tryPlace()` もそのまま通ります）/
`src/biomes.ts`（`cane` 0.12 は据え置き）/ `crops.ts` / `items.ts` / `crafting.ts` / `DROPS` / `SaveData`。

**先に読むこと**（`rules/*.md` は自動では読まれません）: `rules/blocks-shapes.md`（**十字は支えに
なれない・`replaceable` は形とは別の判断**）・`rules/worldgen.md`・`rules/meshing-render.md`・
`rules/lighting.md`（`world.ts` に当たります）・`rules/testing.md`。**スキルは 3 つとも当たりません**
（ID もアイテムも器も増えないので `add-block` も `add-stateful-block` も `unverifiable-pair` も要りません）。

## 3. 使う ID

**0 個。** ブロックもアイテムも増えません（**次の空きは 145 のまま**。`ROADMAP.md` の予約表）。
**段の違いを ID で表さないこと**（3 段なら 3 番号。**同じ ID を積むだけです**）。

## 4. 判断をどのファイルに置くか

- **支えの表は `blocks.ts` に 1 本。** `canSupport()` は触らず、**その外側**に足すこと:

  ```ts
  export function supportsBlock(supporter: number, face: number, id: number): boolean {
    if (supporter === id && stacksOnSelf(id)) return true;   // 自分の上には自分を置ける
    return canSupport(supporter, face);
  }
  ```

  `stacksOnSelf` は `BlockDef` の省略可のフラグで、**true にするのは `SUGAR_CANE` だけ**。
  `world.ts` の**置く側（`canPlaceAt`）と壊す側（`breakUnsupported`）が同じ式を見ること** ——
  片方だけにすると、積めるのに下を壊しても落ちない形で静かに壊れます。
- **`replaceable: true` を外すこと**（18a で付けたもの。**これが積める鍵です**）。
  `placeSpot()` は狙ったブロックが `replaceable` なら**そのマス自身**を返すので、付いたままだと
  上面を狙っても 1 本目に重なり、`setVoxel` が「同じ値」で false を返して**永久に積めません**。
  外すと `placeSpot()` が法線の側（＝真上）を返し、**`placing.ts` に 1 行も書かずに積めます**。
  - 18a が付けた理由（浜へ張り出した森の葉が欠ける）は**実測で 0 件** —— `±400` の浜 2000 列 x
    種 3 つで、**サトウキビの立つマスに葉が来た列はありません**。**外すほうが得です**: 葉より
    強くなるので、積んだ列を葉に抜かれて上が浮きません（種 1234 で h+3 が葉の列が 1 本）
  - **`test/blocks.test.ts` の「上書きされる」は反転させること**（ゆるめるのではなく**逆を主張する**
    判定に書き換える。苗（`WHEAT_CROP`）と同じ側になります）
- **生成の段数は `worldgen.ts`。** いまの `wy === h + 1 ? tuft : AIR` を、**サトウキビのときだけ**
  `h + 1 <= wy && wy <= h + tall` に広げること（**キノコと草むらは 1 マスのまま**）。
  `tall` は **`1 + floor(hash2(wx, wz, seed ^ 0x51c3) * CANE_HEIGHT_MAX)`**。
  **塩は新しい値にすること** —— 既存の 4 本（`0x7c39` / `0x4d17` / `0x2f8b` / `0x6a55`）と
  重ねると段数が密度と相関します。**引く順（サトウキビが先）と `sprouted` の条件は変えないこと。**
- **段数の上限 `CANE_HEIGHT_MAX = 3` は `blocks.ts`**（def の隣。18c も同じ値を見るので
  `worldgen.ts` に数値を書かない）。**`TUNING.md` に 1 行**。**手で積む高さに上限は要りません。**

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。

- `test/blocks.test.ts` の「サトウキビと砂糖」の節に 2 件足し、既存の 1 件を反転: **真理値表**
  （`supportsBlock` の 4 通りを 1 行に）/ **本物の `World` で 3 段積んで下を壊す**
  （`new World(new Scene(), new WorldGen(...))` + `onAutoBreak` で数える。手本は小麦の節）
- `test/placing.test.ts` に 3 件。`Arena` に砂とサトウキビを置き、**`tryPlace()` の戻り（`kind` と
  立ったマス）を出してから**判定すること
- `test/worldgen.test.ts` の既存のサトウキビの節に 2 件足す。**列は今までどおり `biomeAt` で ±400 を
  舐めて最大 2000 列**（`patchOf()` は浜では見つかりません）。段数は `voxel(x, h + k, z)` を上へ
  舐めて数え、**分布と最大段を 1 行に出すこと**

## 6. このタスク固有の禁じ手

- **`src/main.ts` に 1 行も書かないこと**（配線が要るのは 18c です）
- **`canSupport()` をゆるめないこと**（松明とベッドの足場です。`supportsBlock()` は**外側**に足す）
- **`placing.ts` / `placeSpot()` / `placedVariant()` に手を入れないこと**（`replaceable` を外せば通ります）
- **段を ID で表さないこと**・**新しい ID を取らないこと**・**`variantOf` を書かないこと**
- **`biomes.ts` の `cane`（0.12）を動かさないこと**（密度は別の話。動かすと既存の判定が動きます）。
  **`SaveData.version` は 1 のまま**・**既存の ID を振り直さないこと**
- **既存の判定をゆるめて緑にしないこと** —— 反転してよいのは上の 4. で名指しした 1 件だけです

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **全部緑** / `npm run build` 緑 / **コミット 1 つ** /
`AUTODEV-QUEUE.md` の 18b の行を消す / この仕様書を `状態: 済` に / **`ROADMAP.md` の 143 の行を直す**
（「1 マスぶんで積めも伸びもしません」は嘘になります）/ **`docs/autodev-log.md` に 1 節**
（**`replaceable` を外した実測も 1 行**）/ **`TUNING.md` に段数の行** /
**`HANDOFF.md` を丸ごと書き直す** / **`master` へ push**。

**C-3（撮る）**: **地形の見た目が変わる周です。** `npm run build` →
`(npx --no-install http-server dist -p 8080 --silent &)` → `node tools/browsershot.mjs` と
**`npm run shot -- beach terrain`**（`beach` は 18a で足した場面）を撮り、**`Read` で開いて「1〜3 段で
立っている」「段の継ぎ目が空いていない」「面が欠けても裏返ってもいない」**を見ること。
**手触り（背丈と密度の釣り合い）は人の目**なので `HANDOFF.md` に 2〜3 行残すこと。
