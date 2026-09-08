# 仕様: ケーキ（キューの 24a・置けるところまで）

状態: 未着手
差し戻し: 0 回

**キューの 24 を 2 件に割った前半です。** かじる（7 回）は **24b** に回しました ——
**理由は `main.ts` の行数**で、B の周で数えた結果は次のとおりです:

- **かじるには `main.ts` に最低 1 行**（`useOrPlace()` の `switch` に `case "cake":`）と、
  **効果を貼る助け 6〜8 行**が要ります（`tillAt` / `plantAt` と同じ形）。
  いま **1449 行**なので `AUTODEV.md` の停止条件 2（1450 行）に当たります
- **前半（このファイル）は `main.ts` に 1 行も要りません** —— ブロック 1 つと
  レシピ 1 本で、置く経路も落とす経路も既にあるものを通ります

## 1. 何を足すか と 完了の判定

**ケーキ（ブロック 155 / 同番のアイテム）。作って置けるが、まだかじれない。**

`npm test` が緑のまま（いま **3273 件**）、次の 6 つが**値を出してから**増えていること:

- **155 は `model: "boxes"` の高さ 0.5・`solid: true`・`variantOf` なし** ——
  アイテム 155 が自動で付き（`MAX_ITEM_ID` **155**）、**111..255 の空きが 101 → 100**
- **壊すと何も落ちない**（ガラスと同じ `NO_ITEM` の 1 行。**素手でもツルハシでも 0 個**）
- **レシピが 59 → 60 本**。`["MMM","SES","WWW"]` で、**2x2 では作れない**
  （`findRecipe(grid, 2)` が null・`findRecipe(grid, 3)` がケーキ、の 2 通りを出してから）
- **ミルクバケツ 3 個が空のバケツ 3 個になって盤面に残る** ——
  `consumeGrid()` の前後を**枠 9 つぶん並べてから**判定する
- **続けてもう 1 個は作れない**（盤面が空バケツに変わるので `findRecipe` が null）。
  `quickCraft()` が 1 個で止まることも一緒に見る
- **一覧の色**がいちばん近い相手と **RGB で 20 以上**離れている
  （**相手の名前と数値を出してから**。判定に入るのは `top` だけ）

## 2. 触るファイルと、触らないファイル

**触る**: `src/blocks.ts` / `src/items.ts` / `src/crafting.ts` / `tools/shot.ts` /
`test/blocks.test.ts` / `test/crafting.test.ts` / `ROADMAP.md` / `AUTODEV-QUEUE.md` /
`docs/autodev-log.md` / `HANDOFF.md`

**触らない**: **`src/main.ts`（1 行も開かないこと）** / `use.ts` / `craftscreen.ts` /
`placing.ts` / `vitals.ts` / `inventory.ts` / `worldgen.ts` / `inventoryui.ts` / `session.ts`

先に読むこと（**自動では読み込まれません**）:
**`rules/blocks-shapes.md`**（`isProp()` と箱の形）/ **`rules/items-survival.md`**
（`tool:` を持たせない・`FOODS` の作法）/ **`rules/inventory-screen.md`**（盤面と `consumeGrid`）/
**`rules/drops.md`** / **`rules/testing.md`**。スキルは **`add-block`**
（**`add-stateful-block` はこの周では要りません** —— 位置ごとの状態は 24b の仕事）。

## 3. 使う ID

**155 ひとつだけ**（`ROADMAP.md` の予約表の「次の空き」）。**ブロックとアイテムで 1 本の番号**で、
`items.ts` に `item({...})` は書かず、**`MAX_ITEM_ID` を 154 → 155 へ手で伸ばすだけ**
（クモの巣・はしご・本棚とまったく同じ道）。**ほかの番号を 1 つも取らないこと** ——
かじった回数をブロック ID で表そうとすると 6 個消えます（それは 24b で、しかも
`crops.ts` の「段階を ID で表さない」に当たります）。

## 4. 判断をどのファイルに置くか

| 何を | どこに |
| --- | --- |
| 形・硬さ・音・支え | `blocks.ts` の `def` 1 つ + `CAKE_BOX` |
| 落ちるものが無いこと | `items.ts` の `DROPS` 1 行（`{ item: NO_ITEM, count: 0, chance: 0 }`） |
| **何が残りかすになるか** | **`items.ts` の `LEFTOVERS` / `leftoverOf()` 1 本**（`EMPTIES` / `emptyAfterEating()` と同じ形） |
| 盤面から取り除く手順 | `crafting.ts` の `consumeGrid()`（**表は持たず `leftoverOf()` に聞く**） |
| レシピの形 | `crafting.ts` の `RECIPES` 1 行 |

**新しく「確かめられないもの」は足しません**（`unverifiable-pair` は要りません）。

- **形**: `CAKE_BOX = [[0.0625, 0, 0.0625, 0.9375, 0.5, 0.9375]]`（本家と同じ 1/16 の縁と
  高さ 8/16）。`solid: true`（上に乗れる）/ `hardness: 0.5` / `sound: "wool"` /
  **`supportFace: FACE_YN`**（床が要る・床が消えたら壊れる。ベッドと同じ）。
  **`replaceable` も `stacksOnSelf` も `variantOf` も付けないこと**
- **色**: `top: 0xf2ded2` / `side: 0xe8c9a0` / `bottom: 0xd9b98a` を暫定で置く。
  **一覧に出るのは `top` だけ**なので、20 を割ったら **`top` だけ**を寄せ直し、
  **どこまで動かしたかを `TUNING.md` に 1 行**（白は雪玉・羽根・卵・砂糖・紙で混んでいます）
- **残りかす**: `LEFTOVERS = new Map([[MILK_BUCKET, BUCKET]])`。`consumeGrid()` は
  1 個減らして 0 になったとき、**`clearSlot(slot)` を通してから**残りかすを 1 個置く
  （素通しで `slot.item` を書き換えると、**傷が空のバケツに乗り移ります**）。
  **`Recipe` に新しいキーを足さないこと** —— 残りかすは**アイテムの性質**で、
  レシピの性質ではありません（同じミルクバケツはどのレシピでも空バケツに戻る）

## 5. 書くテスト

**どれも値を出してから判定すること**（`rules/testing.md`）。

- `test/blocks.test.ts`: ケーキ 1 節 —— `model` / `boxes` の高さ / `solid` / `variantOf` /
  `supportFace` / 硬さ / **掘って出るもの 0 個**（素手・ツルハシ・剣の 3 通りを並べる）/
  アイテム名と `placedBlock()` が 155 に戻ること / **色のいちばん近い相手**（既存の節を写す）
- `test/blocks.test.ts` の空きの節: **111..255 の空きが 100・`MAX_ITEM_ID` 155**
- `test/crafting.test.ts`: **レシピ 60 本** / 3x3 で揃うこと・2x2 では揃わないこと /
  **`consumeGrid()` の前後の盤面 9 枠**（ミルクバケツ 3 → 空バケツ 3・ほかは空）/
  **傷 7 のミルクバケツを置いても、戻った空バケツの `damage` が 0** /
  **2 個目は作れない**（`findRecipe` が null・`quickCraft` が 1 個で止まる）/
  **`leftoverOf()` の表に載っているものは全部 1 枠 1 個まで**（積める物を載せると
  残りかすが 1 個に潰れます）

## 6. このタスク固有の禁じ手

- **`main.ts` を開かないこと**（この周の一番の目的です）
- **`FOODS` に 1 行も足さない**（まだ食べられません。**満腹度も回復量も 24b で決めます**）
- **`EMPTIES` を作り替えない** —— 食べ終わりに戻る器（シチュー → ボウル）と、
  クラフトの残りかす（ミルクバケツ → バケツ）は**別の表**です
- **ミルクバケツを `FILLED_BUCKETS` に足さない**（足すと地面に流せます。`rules/use.md`）
- **既存のレシピ 59 本を 1 行も書き換えない。`consumeGrid()` の「1 枠につき 1 個」も変えない**
- **`SaveData` の形を変えない**（`version` は 1・キーも増やさない）
- **自然生成 0 行**（本家にケーキは湧きません）

## 7. 終了条件

`npm run typecheck` と `npm test`（3273 件 + 増えたぶん）が**すべて緑** / `npm run build` 緑 /
**コミット 1 つを `master` へ push** / `tools/shot.ts` に `cake` の場面を足して
**`npm run shot -- cake` を撮り、`Read` で開いて見た**（自然生成しないので既存の場面には
写りません）/ 手触りの数値（色を寄せ直したら）を `TUNING.md` に 1 行 /
`ROADMAP.md` の予約表に 155 を「実装済み」で 1 行 / `AUTODEV-QUEUE.md` の 24a を消す /
このファイルの `状態:` を `済` に / `HANDOFF.md` を丸ごと書き直す。
