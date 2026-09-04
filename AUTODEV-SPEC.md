# 仕様: 鉄・金・ダイヤのブロック（9 個 → 1 個、戻すと 9 個）

状態: 未着手
差し戻し: 0 回

**キューの先頭 14 番。** 2026-09-04 にコードで数え直しました —— `blocks.ts` に
`IRON_ORE`(15) / `GOLD_ORE`(16) / `DIAMOND_ORE`(17) はありますが、**「しまう形」の
立方体は 3 つとも 1 つもなく**、`crafting.ts` にも該当レシピは 0 本です。

## 1. 何を足すか / 完了の判定

**インゴットとダイヤを 9 個で 1 個の立方体にしまえて、その立方体から 9 個に戻せる。**
本家と同じで、**倉庫の枠を 9 分の 1 にするためだけの機能**です。
**ダイヤに初めて「持ち物以外の行き場」ができます。**

完了の判定（`npm test` が全部緑のまま、次が増えていること）:

- `test/crafting.test.ts` に **「鉄・金・ダイヤは 9 個でブロックになる」** と
  **「ブロックを崩すと 9 個に戻る」** と **「しまって戻すと個数が変わらない」** の 3 項目
- `test/blocks.test.ts` に **「鉄・金・ダイヤのブロックは立方体で、掘ると自分が落ちる」** の 1 項目
- `npm test` の **「111..255 の空き」が 121 → 118**、**「立方体 36」が 39**、
  **アイテム一覧が 99 → 102 種類**、**`MAX_ITEM_ID` が 134 → 137**
- **クラフトは 45 本 → 51 本**（6 本増える）

## 2. 触るファイルと、触らないファイル

**触るのはこの 5 つだけです。**

| ファイル | 何を |
| --- | --- |
| `src/blocks.ts` | `export const` 3 行 + `BLOCKS` 配列の末尾に `def(...)` 3 つ |
| `src/crafting.ts` | `RECIPES` に 6 行（しまう 3・戻す 3）と import |
| `test/crafting.test.ts` | 上の 3 項目 |
| `test/blocks.test.ts` | 上の 1 項目 |
| `ROADMAP.md` / `TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | C-4 の記録 |

**1 行も触らないファイル**（触ったら差し戻し）:

- **`src/items.ts`** —— **アイテムは自動で付いてきます。** `items.ts` の 386 行目の
  `for (const block of BLOCKS)` が **`variantOf === AIR` のブロック全部に同じ番号の
  アイテムを作る**ので、`item({...})` を手で足すと**同じ番号が二重に登録されます**
- **`src/main.ts`**（**いま 1464 行。この周は 1 行も足しません**）/ `src/use.ts` /
  `src/placing.ts` / `src/mining.ts` / `src/breaking.ts` /
  `src/*render.ts` / `src/ui.ts` / `src/inventoryui.ts`（判断を書かない）
- `src/worldgen.ts`（**地形に埋めません。** 本家でも自然生成しません）
- `src/smelting.ts`（**精錬に 1 行も足さない。** かまどで焼く物ではありません）

## 3. 使う ID

**`ROADMAP.md` の予約表（111..255 の共有帯）から、次の空き 3 つを順に取ります。**

| ID | 名前 | 定数名 |
| --- | --- | --- |
| **135** | 鉄ブロック | `IRON_BLOCK` |
| **136** | 金ブロック | `GOLD_BLOCK` |
| **137** | ダイヤブロック | `DIAMOND_BLOCK` |

**134（雪玉）まで使用済みで、135 が次の空きです。** **111 以降はブロックとアイテムで
1 本の番号列**なので、**この 3 つはアイテム側の番号も同時に埋めます**（2 節のとおり
`items.ts` のループが作るぶん）。**既存の番号を 1 つも振り直さないこと。**

## 4. 判断をどのファイルに置くか

**確かめられないものは 1 つも増えません**（描画も音も DOM も GLSL も足しません）。
だから `unverifiable-pair` スキルは要りません。使うのは **`add-block` スキル**です。

- **硬さ・道具・階層は `blocks.ts` の `def` の中だけ**（本家の値）:
  - `IRON_BLOCK` = 硬さ **5** / `tool: "pickaxe"` / `minTier: TIER_STONE` / 色 `0xd8d2c8`
  - `GOLD_BLOCK` = 硬さ **3** / `tool: "pickaxe"` / `minTier: TIER_IRON` / 色 `0xf2d15c`
  - `DIAMOND_BLOCK` = 硬さ **5** / `tool: "pickaxe"` / `minTier: TIER_IRON` / 色 `0x4fe3d8`
  - **色は 3 つともインゴット・ダイヤのアイテム色をそのまま写すこと**（`items.ts` の 401..403 行）
  - **`sound` を書かないこと** —— 既定の `"stone"` で通します（**金属の音はありません。
    足すと `audio.ts` / `sfx.ts` の話になり、この周の枠を越えます**）
  - **`variantOf` を書かないこと**（既定の `AIR`。書くとアイテムが作られません）
  - **`DROPS` に 1 行も足さないこと** —— `variantOf` が `AIR` なので**掘ると自分が落ちます**
- **しまう／戻すの個数は `crafting.ts` の 6 行だけ**:
  - しまう（形あり・3x3 なので作業台が要る）: `shape: ["III","III","III"], key: { I: IRON_INGOT }`
    → `out: IRON_BLOCK, count: 1`（金・ダイヤも同じ形で材料だけ差し替え）
  - 戻す（形なし）: `ingredients: [IRON_BLOCK]` → `out: IRON_INGOT, count: 9`
  - **9 と 9 を食い違わせないこと** —— 片方を 8 にすると、しまって戻すだけで目減りします
    （`rules/items-survival.md` の「落ちる 4 個と戻す 4 個」と同じ罠）

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。`check(名前, 条件, 出す値)` の形で、
`grid(3, [...], key)` と `findRecipe` は `test/crafting.test.ts` に既にあります。

1. **「鉄・金・ダイヤは 9 個でブロックになる」** —— 3 つとも `grid(3, ["III","III","III"], ...)`
   を `findRecipe` に通し、`out` と `count` を**出してから**判定
2. **「ブロックを崩すと 9 個に戻る」** —— 3 つとも 1 個だけ置いた盤面で `count === 9` を、
   **数を出してから**判定
3. **「しまって戻すと個数が変わらない」** —— 9 → 1 → 9 を 3 つとも通し、
   **入れた数と戻った数の両方を出す**
4. **`test/blocks.test.ts`**: 3 つとも `model` が既定の立方体・`variantOf === AIR`・
   同じ番号のアイテムが `itemOf` で引ける・`rollDrop(id, 0)` が自分を返す・
   `minTier` が上の表どおり。**値を出してから**判定

## 6. このタスク固有の禁じ手

- **`items.ts` に `item({ id: IRON_BLOCK, ... })` を手で足さないこと**（2 節。二重登録）
- **`DROPS` にも `SMELTING` にも `FOODS` にも 1 行も足さないこと**
- **`worldgen.ts` に埋めないこと**（本家にない自然生成を作ることになります）
- **`PALETTE`（クリエイティブのホットバー 9 個）を触らないこと** —— 9 枠しかなく、
  溢れたぶんは黙って消えます（`rules/items-survival.md`）
- **既存のレシピを 1 本も書き換えないこと**（とくにバケツ・シアーズ・道具 20 本の
  `IRON_INGOT` の行。`test/crafting.test.ts` の「同じ形のレシピが重複していない」が
  唯一の足場です）
- **`main.ts` に 1 行も足さないこと**（1464 行。15 番より前に空ける話は別件）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑** / `npm run build` 緑（`src/**` を触るため）
- **`npm run bench` は不要**（生成もメッシュ化も触りません）
- **コミット 1 つ**で `master` へ push
- **見た目に出ます**（一覧に 3 つ増え、置ける立方体が 3 つ増える）ので **C-3 は必須**:
  `node tools/browsershot.mjs` か `npm run shot` で撮り、**`Read` で開いて見ること**
- **`TUNING.md` に 1 節**（硬さ 5 / 3 / 5 と `minTier`、色を写した根拠）
- `ROADMAP.md` の予約表に 135..137 を「実装済み」/ キューの 14 番を消す /
  この仕様書の `状態:` を `済` に / `docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す
