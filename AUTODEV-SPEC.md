# 仕様: ボウルとキノコシチュー（アイテム 2 つ・レシピ 2 本）

状態: 済
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭 17b。** 元の 17 番の後半で、**前半 17a（赤 139 / 茶 140）は実装済み**。
2026-09-05 に数え直して **`bowl` / `stew` / ボウル / シチューは `src/**` にも `test/**` にも 0 件**
（`grep -rn -i "bowl\|stew\|ボウル\|シチュー" src/ test/` が 1 行も出しません）。
**`main.ts` はいま 1445 行**（上限 1500 / 止まる目安 1450）。**使ってよいのは 3 行まで = 1448 行**。

## 1. 何を足すか / 完了の判定

**板 3 個で作れるボウルと、ボウル + 赤キノコ + 茶キノコ の形なしで作れるキノコシチュー。**
**シチューを食べ切ると、空のボウルが 1 個手の中に戻ります**（本家と同じ）。

完了の判定（`npm test` が**全部緑のまま**、次が増えていること。いま 3059 件）:

- `test/blocks.test.ts` —— **2 つの値を 1 行に出してから**「置けず・道具でもなく・
  シチューだけが食べ物」「**シチューは 1 個しか積めない**」（雪玉・ミルクバケツの件と同じ書き方）
- `test/crafting.test.ts` —— **盤面と出来上がりを出してから**「板 3 個でボウル 4 個」
  「ボウル + 赤 + 茶 でシチュー 1 個」「**キノコを 1 種類だけ入れても揃わない**」
- `test/vitals.test.ts` —— **空腹と満腹度の前後を出してから**「シチューを食べると 6 / 7.2 戻る」
- `test/ui.test.ts` —— **`main.ts` に `BOWL` も `MUSHROOM_STEW` も 1 文字も無い**
  （**戻すものを決めるのは `items.ts`**。配線だけが `main.ts` に残る）
- **数え直し**（ゆるめるのではない。`AUTODEV.md` の C-2）: 共有帯のアイテム **27 → 29 個** /
  **111..255 の空き 115 → 113** / **レシピ 51 → 53 本** / **食べ物 8 → 9 種** /
  **`MAX_ITEM_ID` 140 → 142** / **立方体 39・非立方体 71 のまま**（ブロックは 1 つも増えません）

## 2. 触るファイル / 触らないファイル

| ファイル | 何を書くか |
| --- | --- |
| `src/items.ts` | `BOWL = 141` / `MUSHROOM_STEW = 142` と `item()` 2 行 / `FOODS` に 1 行 / `MAX_ITEM_ID` / **`emptyAfterEating()` と その表** |
| `src/crafting.ts` | `RECIPES` に 2 行（ボウル・シチュー） |
| `src/main.ts` | **`updateEating()` に 3 行まで**（下の 4.） |
| `test/blocks.test.ts` `test/crafting.test.ts` `test/vitals.test.ts` `test/ui.test.ts` | 上の件 + 数え直し |
| `ROADMAP.md` | 予約表に 141 / 142 の行（**実装済み**と書く）と「次に取るのは 143」 |

**触らないこと**: `src/blocks.ts`（**ブロックは 1 つも足しません**）/ `src/use.ts`（**0 行** ——
`decideUse()` は `foodOf(held)` を見るので、`FOODS` の 1 行で右クリックが通ります）/
`src/vitals.ts`（**0 行** —— `eat()` は `FoodDef` を受け取るだけ）/ `src/smelting.ts` /
`src/drops.ts` / `items.ts` の `DROPS` / `src/inventory.ts` / `craftscreen.ts` / `inventoryui.ts`。

**先に読むこと**（`rules/*.md` は自動では読まれません）:
`rules/items-survival.md`・`rules/vitals.md`・`rules/use.md`・`rules/testing.md`。
**スキルは `add-block`**（ID の取り方とクリエイティブ一覧までの道筋）。

## 3. 使う ID

**141 = ボウル / 142 = キノコシチュー** の 2 個（`ROADMAP.md` の予約表「141..255 予備 115 個」の
先頭 2 つ）。**どちらもアイテムだけで、ブロック側の番号は取りません**（共有帯は 1 本の
番号列なので、**141 / 142 にブロックを足さないこと**）。
**`MAX_ITEM_ID = MUSHROOM_STEW` に伸ばすこと** —— 伸ばさないと `allItemIds()` が 140 までしか
数えず、**クリエイティブの一覧にだけ出てこないアイテム**ができます（`rules/items-survival.md`）。
判定は **`npm test` の「111..255 の空き」が 115 → 113** に減ること。

## 4. 判断をどのファイルに置くか

- **食べ終わって何が戻るかは `items.ts` の表**。`const EMPTIES = new Map<number, number>([[MUSHROOM_STEW, BOWL]])`
  と `export function emptyAfterEating(id: number): number { return EMPTIES.get(id) ?? NO_ITEM; }`。
  **`main.ts` に `BOWL` と書かないこと**（`test/ui.test.ts` が見張ります）。
- **`main.ts` は `updateEating()` の `inventory.consumeSelected(1)` の直後に 3 行まで**:
  戻るものを `emptyAfterEating(held)` で引き、**`NO_ITEM` でなければ `inventory.setSelected(戻るもの, 1)`**。
  `emptyAfterEating` は**すでにある import 行**（35 行目）に足すこと（**行は増えません**）。
  **`inventory.add()` を使わないこと** —— 持ち物が満杯のときにボウルが消えます。
- **だから `MUSHROOM_STEW` の `stack` は 1**（本家と同じ）。**1 でないと `setSelected` が
  残りのシチューを踏み潰します**（食べたのは 1 個なのに山ごと消える）。**ここは手触りではなく
  不変条件なので、`TUNING.md` ではなく `items.ts` のコメントに理由を書くこと。**
- **食べたときの値は `items.ts` の `FOODS`**: `[MUSHROOM_STEW, { hunger: 6, saturation: 7.2, poison: false }]`
  （**本家の値**。焼き鳥と同点で、焼き豚・ステーキ 8 / 12.8 には届きません）。**`TUNING.md` に 1 行** ——
  材料 3 つ（うちキノコ 2 種はまれ）で焼き鳥と同点なのが見合うかは、人にしか決められません。
- **色は `items.ts`**: **ボウル `0x7a4a24`**（暗い木）/ **キノコシチュー `0xf0dcb4`**（淡い生成り）。
  **この 2 つと赤 `0xc9403a`・茶 `0xb5835a` は、どの 2 つも RGB で 60 以上**（実測 83〜237）。
  **一覧は 105 種で密なので、既存からは 20 以上で十分**（実測 21.8 / 23.9）。**変えるなら測ってから。**
- **レシピは `crafting.ts`**（どちらも本家と同じ形）:
  `{ name: "ボウル", out: BOWL, count: 4, shape: ["P.P", ".P."], key: { P: PLANK } }` と
  `{ name: "キノコシチュー", out: MUSHROOM_STEW, count: 1, ingredients: [BOWL, RED_MUSHROOM, BROWN_MUSHROOM] }`。
  **ボウルは 3 幅なので作業台が要り、シチューは形なし 3 つなので 2x2 で作れます。**
  ボウルの形はバケツ `["I.I", ".I."]` と同じですが**材料が違うので重複ではありません**（ハーフと同じ）。

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。

- `test/blocks.test.ts` に 2 件 + 色 1 件（**`置ける / 道具 / 食べ物 / 1 山`を 1 行に出してから**判定。
  雪玉・ミルクバケツの件が手本。色は**4 つ並べて出してから**「どの 2 つも 60 以上」。
  **`allItemIds()` を舐めて「既存のどれからも 20 以上」**も同じ件で出すこと）
- `test/crafting.test.ts` に 3 件（**盤面と出来上がりを出してから**）:
  1. 板 3 個の V 字 → ボウル 4 個（**2x2 では揃わない**）
  2. ボウル + 赤 + 茶 → シチュー 1 個（**2x2 で揃う**・並べ替えても揃う）
  3. **赤を 2 個（茶なし）では揃わない** —— 形なしは個数と種類の両方を見ている
- `test/vitals.test.ts` に 1 件（**空腹と満腹度の前後を出してから** 6 / 7.2）
- `test/ui.test.ts` に 1 件（`main.ts` の本文に `BOWL` も `MUSHROOM_STEW` も無い）

## 6. このタスク固有の禁じ手

- **`main.ts` を 3 行より多く増やさないこと**（**1448 行が上限**。止まる目安 1450 まで残り 2 行）
- **`MUSHROOM_STEW` の `stack` を 1 以外にしないこと**（上の 4.。山ごと消えます）
- **`inventory.ts` / `craftscreen.ts` / `inventoryui.ts` に 1 行も書かないこと**
- **`DROPS` にも `SMELTING` にも 1 行も足さないこと**（焼けるボウルも落ちるシチューもありません）
- **ボウルを `block:` 付きにしないこと**（`AIR` のまま。置けると空のボウルが地面に増えます）
- **`emptyAfterEating()` を `vitals.ts` に置かないこと**（あちらは持ち物の表を import しません）
- **既存の ID を振り直さないこと**・**`SaveData.version` は 1 のまま**
  （**セーブは 1 バイトも増えません** —— 位置ごとの状態を持たないアイテムです）
- **既存の判定をゆるめて緑にしないこと** —— 上の数え直しは**数え直し**です

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **全部緑** / `npm run build` 緑 / **コミット 1 つ** /
`AUTODEV-QUEUE.md` の 17b の行を消す / この仕様書を `状態: 済` に /
**`ROADMAP.md` の予約表に 141・142 を「実装済み」で書く** / **`docs/autodev-log.md` に 1 節** /
**`TUNING.md` に 1 行**（6 / 7.2 が材料 3 つに見合うか）/ **`HANDOFF.md` を丸ごと書き直す** /
**`master` へ push**。

**C-3（撮る）**: **地形にもモブにも新しい形は出ません**（置けないアイテム 2 つだけ）。
**それでも一覧の色だけは絵で確かめられないので、`npm run shot -- terrain` を 1 枚撮って
「前の周から変わっていないこと」を `Read` で見ること**（見た目に 0 の変更であることの裏取り）。
**色が並んで見分けられるかは DOM なので写りません** —— `HANDOFF.md` の
「ブラウザで見てほしいところ」に 2 行残すこと。
