# 仕様: 紙・本・本棚（キューの 21）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭の 1 件。** この周にコードから数え直しました ——
`grep -rn "PAPER\|paper\|BOOK\|BOOKSHELF\|本棚" src/ test/` は **0 件**で、まだ 1 行もありません。
材料はどちらも実装済みです（サトウキビ 143 = ブロック / 革 132 = アイテム）。

## 1. 何を足すか / 完了の判定

**紙（アイテム）・本（アイテム）・本棚（立方体ブロック）の 3 つと、レシピ 3 本。**
サトウキビ 3 → 紙 3（`["CCC"]`。3 幅なので作業台が要る）/ 紙 3 + 革 1 → 本 1（形なし。
2x2 に収まる）/ 板 6 + 本 3 → 本棚 1（`["PPP","BBB","PPP"]`）。**本棚を壊すと本が 3 個**
（本家と同じ。板 6 個は戻りません）。**食べ物ではなく、道具でもありません。**

`npm test` に**「紙・本・本棚」の一群が約 14 件増えて全部緑**（いま 3170 件）。とくに:
**レシピ 55 → 58 本** / **立方体 39 → 40**（非立方体 76 は動かない）/ **アイテム 111 → 114 種**・
`MAX_ITEM_ID` **149 → 152** / **111..255 の空きが 106 → 103** / **食べ物は 10 種のまま** /
`rollDrops(BOOKSHELF, 0.5, 0.5)` が**本 3 個 1 山**（`extraRoll` を何にしても本 3 個）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/items.ts`（`PAPER` / `BOOK` の定義 2 行・`MAX_ITEM_ID`・`DROPS` の本棚 1 行）/
`src/blocks.ts`（`BOOKSHELF` の `def` 1 つ）/ `src/crafting.ts`（`RECIPES` に 3 行）/
`tools/shot.ts`（下の 7. の `bookshelf` の場面 1 つ）/ `test/blocks.test.ts` /
`test/crafting.test.ts` / `ROADMAP.md` / `TUNING.md`。

**`src/main.ts` は 0 行**（レシピも立方体もドロップ表も、既にある経路だけを通ります）。
いま **1449 行で止まる目安 1450 に届いています。1 行も増やさないこと。**

**触らない**: `main.ts` / `smelting.ts`（精錬 0 本。**本棚を燃料にしないこと**）/
`worldgen.ts`・`biomes.ts`（**自然生成しません**）/ `vitals.ts`・`FOODS`（食べ物ではない）/
`use.ts`・`placing.ts`（置くのは普通の立方体の経路）/ `drops.ts` / `droprender.ts` /
`ui.ts` / `inventoryui.ts` / `storage.ts`（**`SaveData` は version 1 のまま、1 バイトも増えません**）。

## 3. 使う ID

**150 = 紙（アイテム）/ 151 = 本（アイテム）/ 152 = 本棚（ブロック）。**
`ROADMAP.md` の予約表の「150..255 予備」の先頭から**取る順に 3 つ**で、**149 まで使用済み**
（`ROADMAP.md` の 174..183 行）。**`MAX_ITEM_ID` を 149 → 152（= `BOOKSHELF`）へ伸ばすこと** ——
**本棚のアイテムは `items.ts` に 1 行も書かずに付いてきます**（`variantOf` が `AIR` なので
ブロック → アイテムの for が作る。鉄ブロック 135 と同じ形。`rules/items-survival.md`）。
**これ以外の番号を取らないこと。**

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも足しません**（GLSL も WebAudio も DOM も three も 0 行）。
`unverifiable-pair` スキルは要りません。**`add-block` スキル**の「アイテムだけ」と
「立方体を 1 つ足す」の 2 つの節を使うこと。

- **紙と本は `items.ts` の `item({...})` 1 行ずつ**（砂糖 625 行の形。`block: AIR` /
  `stack: MAX_STACK` / `tool: null`）。**`FOODS` にも `EMPTIES` にも `THROWN` にも書かないこと**
- **本棚は `blocks.ts` の `def` 1 つだけ**（鉄ブロック 1393 行の形）:
  `hardness: 1.5` / `tool: "axe"` / `minTier` は既定（`TIER_HAND`）/ `sound: "wood"`。
  **`opaque` も `solid` も既定（true）のまま** —— `boxes` も `model` も `variantOf` も書かないこと
- **色**（`itemColor()` は**ブロックの `top`** を写すので、本棚の `top` は一覧の色でもあります）:
  **紙 `0xd4e0ec`**（いちばん近いのは雪玉で 25.5）/ **本 `0x9c5064`**（レンガと 38.2）/
  **本棚 `top` と `bottom` が `0xd0a878`**（はしごと 23.5）・**`side` は本の背にあたる `0x9c5064`**。
  **`side` は一覧に出ないので判定に入りません。** 判定は下の 5. のとおり**数値で見ること** ——
  **落ちたら色をずらしてよい**（`0xd0a878` は板 `0xb18a56` と 55.6 離れています）
- **落ちるものは `items.ts` の `DROPS` の 1 行**だけ: `[BOOKSHELF, { item: BOOK, count: 3, chance: 1 }]`。
  **`extra` も `otherwise` も書かないこと**（`extraRoll` は 1 つも見ません）

## 5. 書くテスト

**値を出力してから判定する形**（`rules/testing.md`）。`console.log` で実際の値を出すこと。

- `test/blocks.test.ts`: `placedBlock(PAPER) === AIR && placedBlock(BOOK) === AIR` /
  `toolOf` が 3 つとも `null` / `placedBlock(BOOKSHELF) === BOOKSHELF`（革・羽根の行と同じ形）/
  **食べ物が 10 種のまま**（`allFoodIds().length`。`foodOf` が 3 つとも `null`）/
  `MAX_ITEM_ID` が **152** / **紙・本・本棚の 3 色が、既存のどれとも RGB で 20 以上**
  （リンゴの 1211..1230 行をそのまま写す。**いちばん近い相手の名前と数値を出してから判定**）/
  **本棚が立方体**（`isProp(BOOKSHELF) === false`・箱 1 個・6 面とも支えになる）/
  `rollDrops(BOOKSHELF, r, e)` が **`r` と `e` を 0.01 / 0.5 / 0.99 の 9 通りに振っても
  本 3 個 1 山**（**確率にも 2 本目の乱数にも繋がっていない証拠**）
- `test/crafting.test.ts`: 3 本それぞれについて、**材料を並べて出来上がりと個数を出してから判定**
  （既存のレシピのテストと同じ形）。とくに **紙が 3 個・本棚が 1 個**であること /
  **紙と本棚は 2x2 では作れず、本は 2x2 で作れる**（作業台の要否。既存の判定の形に合わせる）/
  **本棚を作って壊すと本 3 個で、板 6 個は戻らない**（`rollDrops` と突き合わせて 1 件）

## 6. このタスク固有の禁じ手

- **本棚を自然生成させないこと**（`worldgen.ts` / `biomes.ts` に 0 行。構造物にも置かない）
- **本棚に「戻す」レシピを足さないこと** —— 板 6 が戻らないのは本家どおりで、
  **雪玉 4 個の対**（`rules/items-survival.md`）とは別の話です。**倉庫の道具ではありません**
- **エンチャントの話を持ち込まないこと**（経験値もエンチャント台も見送り済み。
  本棚はいまのところ**置ける立方体と本 3 個の入れ物**でしかありません）
- **本棚を燃料にしないこと**（`smelting.ts` の `FUEL` に 0 行。本家も燃料ではありません）
- **紙・本・本棚に `FOODS` の行を足さないこと**（食べ物は 10 種のまま）
- **サトウキビ 143 と革 132 の側を 1 行も変えないこと**（生える所も牛のドロップもそのまま）
- **`Drop` の型と `rollDrops()` の引数を変えないこと**（20 で入ったばかりの `extraRoll` に触らない）
- **`main.ts` の行数を増やさないこと（0 行）。`SaveData.version` は 1 のまま。
  既存の ID を振り直さないこと**

## 7. 終了条件

`npm run typecheck` と `npm test` が緑 / `npm run build` が通る（`src/**` を触るので）/
**コミット 1 つ**で `master` へ push / `AUTODEV-QUEUE.md` の 21 の行を消す /
この仕様書の `状態:` を `済` にする / **`ROADMAP.md` の予約表に 150 = 紙・151 = 本・
152 = 本棚を「実装済み」で足し、183 行の「次に取るのは」を 153 に直す** /
**`TUNING.md` に 1 行**（「本棚は板 6 + 本 3。壊すと本 3 個だけで板は戻らない。本家の値を
暫定で入れた。使い道がまだ無い立方体に 9 個の材料が見合うか」）/
`docs/autodev-log.md` に 1 節 / `HANDOFF.md` を丸ごと書き直す。

**本棚は自然生成しないので、既にある場面には 1 枚も写りません。**
**`tools/shot.ts` に `bookshelf` の場面を 1 つ足すこと**（`ladders`（332 行）が同じ理由で
足された先例。はしごも自然生成しません）。**板を隣に積んで並べる**こと ——
見るのは**面が欠けていないか・上面（`0xd0a878`）と側面（`0x9c5064`）が入れ替わって
いないか・板と見分けが付くか**の 3 つ。**`npm run shot -- bookshelf` で撮り、`Read` で
開いて自分の目で見ること**（撮っただけでは 1 つも確かめたことになりません）。
**手触り（本棚に見えるか）は人に見てもらうこと** ——
`HANDOFF.md` の「ブラウザで見てほしいところ」に 1〜2 行残すこと。

**先に引いて読む `rules/`**: `rules/items-survival.md`（`items.ts` / `blocks.ts` / `crafting.ts`）・
`rules/blocks-shapes.md`（`blocks.ts`）・`rules/inventory-screen.md`（`crafting.ts`）・
`rules/vitals.md`（`items.ts`）・`rules/beds.md`（`blocks.ts`）・`rules/testing.md`（`test/**`）。
