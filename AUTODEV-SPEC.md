# 仕様: リンゴ（キューの 20）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭の 1 件。** この周にコードから数え直しました ——
`grep -rn "APPLE\|apple" src/ test/` は **0 件**で、まだ 1 行もありません。

**キューの「`DROPS` は 1 ブロック 1 行しか持てない」は半分だけ正しい**（2026-09-06 に確認）。
`Drop.extra` はもうあり、実った小麦が「小麦 1 + 種 1」の 2 山を出しています。**足りないのは
`extra` の確率**で、`items.ts` の 736..743 行のコメントが理由をそのまま書いています ——
**流れてくる乱数が `roll` の 1 本だけなので、`extra` に確率を付けると 1 山目の当たり外れと
必ず相関する**（棒が出た葉からだけリンゴが出る形）。**同じコメントが「乱数をもう 1 本流す話が
先で、`BreakOrder` と `autoBreak()` の引数に及ぶ」と指しています。この周でそれをやります。**

## 1. 何を足すか / 完了の判定

**オークの葉を壊すと 0.5% でリンゴが 1 個落ちる。棒（10%）とは別々に当たる。** 食べると
空腹 +4 / 満腹度 +2.4。**針葉樹の葉からは落ちません**（本家と同じ）。

`npm test` に**「リンゴ」の一群が約 12 件増えて全部緑**（いま 3155 件）。とくに:
`rollDrops(LEAVES, 0.05, 0.001)` が**棒とリンゴの 2 山** / `rollDrops(LEAVES, 0.5, 0.001)` が
**リンゴだけ 1 山**（1 山目を外してもリンゴは出る = 相関していない証拠）/
`rollDrops(LEAVES, 0.05, 0.9)` が**棒だけ** / `rollDrops(SPRUCE_LEAVES, 0.05, 0.001)` が
**棒だけ**（針葉樹にリンゴは無い）/ **実った小麦は `extraRoll` を 0.99 にしても種が 1 個**
（`chance` 省略 = 必ず落ちる、が変わっていない）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/items.ts`（`APPLE` の定義・`FOODS` の 1 行・`ExtraDrop` の型・`DROPS` の
葉 2 行・`rollDrops()` の引数）/ `src/breaking.ts`（`BreakOrder.extraRoll` と
`autoBreak()` の 8 番目の引数・`harvest()` の素通し）/ `src/main.ts`（**下記のとおり 2 か所、
行数 ±0**）/ `test/blocks.test.ts` / `test/breaking.test.ts` / `ROADMAP.md` / `TUNING.md`。

**`src/main.ts` は「乱数をもう 1 個作って渡す」だけで、判断を 1 行も書かないこと。**
いま **1449 行で止まる目安 1450 に届いています。1 行も増やさないこと** ——
どちらも既にある行の中に足せます（改行しないこと）:

- 1030 行目 `{ x, y, z, id: blockId, tool, creative, roll: Math.random() },`
  → `roll` の後ろに `, extraRoll: Math.random()` を**同じ行に**足す
- 320 行目 `autoBreak(world, x, y, z, id, creative, Math.random())`
  → 末尾に `, Math.random()` を**同じ行に**足す

**触らない**: `blocks.ts`（リンゴはアイテムだけでブロックを 1 つも増やしません）/
`crafting.ts` / `smelting.ts`（レシピも精錬も 0 本）/ `worldgen.ts` / `drops.ts` /
`droprender.ts` / `ui.ts` / `inventoryui.ts` / `storage.ts`（**`SaveData` は version 1 のまま、
1 バイトも増えません**）。

## 3. 使う ID

**149 = リンゴ（アイテムのみ）。** `ROADMAP.md` の予約表の「149..255 予備」の先頭で、
**148 まで使用済み**（`ROADMAP.md` の 180..181 行）。**`MAX_ITEM_ID` を 145 → 149 へ伸ばすこと**
（146..148 ははしごの向き違いで空いたままです）。**これ以外の番号を取らないこと。**

`item({ id: APPLE, name: "リンゴ", block: AIR, stack: MAX_STACK, color: 0xe0342c, tool: null })`
の形（砂糖の行と同じ）。**置けず・道具でもありません。**

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも足しません**（GLSL も WebAudio も DOM も three も 0 行）。
`unverifiable-pair` スキルは要りません。`add-block` スキルの**アイテムだけの節**が使えます。

- **確率と個数は `items.ts` の `DROPS` の表**だけ。`breaking.ts` は `.chance` を見ないこと
  （`test/ui.test.ts` の「`main.ts` が落ちる確率を自分で判定していない」と同じ形の見張りが
  `test/breaking.test.ts` の 72 行目にあります）
- 型はこう足すこと。**`DropStack` に `chance` を足さないこと** —— `rollDrops()` の**返り値の型**
  なので、返る山が意味の無い `chance` を持つことになります:
  ```ts
  export interface ExtraDrop extends DropStack { readonly chance?: number }
  // Drop.extra?: DropStack → Drop.extra?: ExtraDrop（省略 = 必ず落ちる、は変えない）
  ```
- `rollDrops(blockId, roll, extraRoll)` の 3 番目は**必須**にすること。省略できると
  `main.ts` が渡し忘れてもコンパイルが通り、**リンゴが永久に出ないのに緑**になります。
  **`rollDrop()`（単数）は引数も中身も変えないこと** —— 既存の 20 件近いテストの根拠です

## 5. 書くテスト

**値を出力してから判定する形**（`rules/testing.md`）。`console.log` で実際の山を出すこと。

- `test/blocks.test.ts`: 上の「完了の判定」の 5 件 + `foodOf(APPLE)` が 4 / 2.4 / 毒なし +
  `placedBlock(APPLE) === AIR && toolOf(APPLE) === null`（革・羽根の行と同じ形）+
  食べ物が **9 種 → 10 種**（`allFoodIds().length`）+ `MAX_ITEM_ID` が 149
- `test/breaking.test.ts`: `tryBreak()` と `autoBreak()` が **`extraRoll` を素通しする**
  （葉を `roll: 0.5, extraRoll: 0.001` で壊すとリンゴが 1 個落ちる。クリエイティブでは 0 個）
- **2 本の乱数が独立している**ことを 1 件で言い切ること: 4 通り（当たり/外れ × 当たり/外れ）の
  山の数を出して `1,2,0,1` になる。**1 本の乱数では作れない表**なので、これが退行の見張りです

## 6. このタスク固有の禁じ手

- **実った小麦のドロップを変えないこと**（小麦 1 + 種 1 のまま。`extra` に `chance` を書かない）
- **`extra` に個数の範囲を足さないこと**（本家の「種 0〜3」は乱数がまた 1 本要ります）
- **針葉樹の葉（`SPRUCE_LEAVES`）からリンゴを出さないこと**（本家はオークとダークオークだけ）
- **葉の棒 10% を触らないこと**。`otherwise` を足さないこと（葉は外れると何も落ちません）
- **リンゴにレシピを足さないこと**（金のリンゴはキューの 22 番。この周では作りません）
- **苗木の話を持ち込まないこと**（葉のコメントの「苗木がまだ無いので」は残す）
- **`main.ts` の行数を増やさないこと**（上の 2 か所を同じ行に足す）
- **`SaveData.version` は 1 のまま。既存の ID を振り直さないこと**

## 7. 終了条件

`npm run typecheck` と `npm test` が緑 / `npm run build` が通る（`src/**` を触るので）/
**コミット 1 つ**で `master` へ push / `AUTODEV-QUEUE.md` の 20 の行を消す /
この仕様書の `状態:` を `済` にする / **`ROADMAP.md` の予約表に 149 = リンゴを「実装済み」で
足し、178..181 行の「次に取るのは」を 150 に直す** / **`TUNING.md` に 1 行**
（「葉からリンゴ 0.5%。本家の値を暫定で入れた。200 枚壊して 1 個が待てるか」）/
`docs/autodev-log.md` に 1 節 / `HANDOFF.md` を丸ごと書き直す。

**見た目に出るのは一覧に並ぶリンゴの色だけ**なので、`npm run shot` は要りません
（`AUTODEV.md` の C-3 は three の描画に出るものの話です）。**色 `0xe0342c` が
既にある赤（`0xc9403a` / `0xc8564f`）と見分けられるかは人に見てもらうこと** ——
`HANDOFF.md` の「ブラウザで見てほしいところ」に 1 行残すこと。

**先に引いて読む `rules/`**: `rules/items-survival.md`（`items.ts` / `breaking.ts` /
`main.ts`）・`rules/drops.md`（`main.ts`）・`rules/vitals.md`（食べ物）・`rules/testing.md`。
