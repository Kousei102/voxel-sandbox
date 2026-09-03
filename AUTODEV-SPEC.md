# 仕様: パン（小麦 3 → パン）と、それを食べること

状態: 未着手
差し戻し: 0 回

**キューの 15 番。** **数え直し済み**（2026-09-03・コードが根拠）: `crafting.ts` の `RECIPES` に
**パンは 1 本もなく**（43 本。小麦を材料にするレシピが 0 本）、`items.ts` の `FOODS` は
**生豚肉・焼き豚・腐った肉の 3 行だけ**で、`WHEAT`(124) は `foodOf()` が null
（`test/blocks.test.ts:1003` が見張っています）。実装前: **2798 件緑** / `main.ts` **1450 行**
（`npm test` の数え方。`wc -l` の 1449 ではない）/ **111..255 の空き 131** / `MAX_ITEM_ID` 124。

## 1. 何を足すか / 完了の判定

**小麦 3 個を横一列に並べるとパンが 1 個できて、それを食べると空腹が戻る。**
これで**小麦に使い道ができます**（いまは掘れるだけで、持っていても何にもなりません）。
完了の判定 —— **`npm test` に次が増えて全部緑**（いま 2798 件。**減らさないこと**）:

- 「小麦 3 個の横一列 → パン 1 個」（**`findRecipe()` の戻りを出力してから**判定）と
  「**2x2 では作れない**」（3 幅なので作業台が要る。本家と同じ）
- 「パンを持って右クリック → `eat`」「満腹なら `flash`」「クリエイティブでは `none`」
- 「パンを食べると空腹 +5・満腹度 +6・**毒ではない**」（値を出力してから）と
  「**小麦そのものは今までどおり食べられない**」（`foodOf(WHEAT) === null`）
- 「共有帯のアイテムが **12 個**（125 まで）」「`MAX_ITEM_ID` が 125」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `items.ts` | `BREAD = 125` の定数 / `MAX_ITEM_ID` / `item({...})` 1 行 / `FOODS` に 1 行 |
| `crafting.ts` | `RECIPES` に**パンの 1 行だけ**（`import` に `BREAD` / `WHEAT` を足す） |
| `test/blocks.test.ts` | 共有帯の数え直し（11 → 12）と、パンの性質の節 |
| `test/crafting.test.ts` | パンのレシピ（形・幅・反転） |
| `test/vitals.test.ts` | パンを食べたときの値 |
| `test/use.test.ts` | 右クリックの行き先（eat / flash / none） |
| `TUNING.md` / `ROADMAP.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | 下の 8 |

**1 行も書かないこと**: **`main.ts`（1450 行 = 停止条件ちょうど。この周は 0 行）** /
`use.ts`（`foodOf()` を見る形がもうあるので、パンは**1 行も足さずに食べられます**）/
`vitals.ts`（**`items.ts` を import しません**）/ `smelting.ts`（**焼いて作るものではない**）/
`blocks.ts`（**ブロックは増えません**）/ `craftscreen.ts` / `inventoryui.ts`（クリエイティブ
一覧は `allItemIds()` そのままなので**勝手に増えます**）/ `drops.ts` / `breaking.ts` /
`crops.ts` / `placing.ts` / `durability.ts` / `storage.ts` / `session.ts`
（**セーブは 1 バイトも増えません**）/ `.claude/**`。

## 3. 使う ID

**アイテム 1 個: `BREAD = 125`。** `ROADMAP.md` の予約表の「125..255 予備」の**先頭**で、
124（小麦）の次です。**ブロックは 0 個**（パンは置けません）。取ったあと `111..255 の空き` は
**131 → 130**（`npm test` の出力で確かめること）。`MAX_ITEM_ID` は **124 → 125**。
**`SaveData.version` は 1 のまま**（キーも増えません）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| パンという物（名前・色・積める数・置けないこと） | `items.ts` の `item({...})` |
| **何がどれだけ戻るか**（空腹 5 / 満腹度 6 / 毒でない） | `items.ts` の `FOODS`（**表の 1 行**） |
| どう作るか（形と個数） | `crafting.ts` の `RECIPES`（**表の 1 行**） |
| 右クリックが「食べる」に来るか | `use.ts` の `decideUse()`（**既にある。触らない**） |
| 食べ終わるまでの長さ・満腹での中断 | `vitals.ts` の `Eating`（**既にある。触らない**） |

**新しい「確かめられないもの」は 0** なので `unverifiable-pair` は不要（描画も音も増えません。
咀嚼音は `sfx.ts` の既存の経路を通ります）。**使うスキルは `add-block`。**

## 5. 実装の要点（この順で）

1. `items.ts` の `WHEAT`(124) の下に **`export const BREAD = 125;`** と説明を数行。
   **`MAX_ITEM_ID` を `BREAD` に差し替える**（`export const MAX_ITEM_ID = BREAD;`）
2. 小麦の `item({...})` の下に 1 行:
   **`item({ id: BREAD, name: "パン", block: AIR, stack: MAX_STACK, color: 0xc49a5e, tool: null });`**
   **`tool` を持たせないこと**（種・シアーズと同じ罠。`ToolKind` が増えると `mobs.ts` の
   `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）
3. `FOODS` に **`[BREAD, { hunger: 5, saturation: 6, poison: false }]`**（本家の値。
   焼き豚 8 / 12.8 と生豚肉 3 / 1.8 の間で、**かまど無しで作れる中では一番強い**）
4. `crafting.ts` の `RECIPES` に 1 行 —— **矢とシアーズの近く**（道具のループより上）に
   **`{ name: "パン", out: BREAD, count: 1, shape: ["WWW"], key: { W: WHEAT } }`**。
   **ハーフの `["MMM"]` と同じ形ですが材料が違うので重複しません**（既存の
   「同じ形のレシピが重複していない」がそのまま見張ります）
5. **`main.ts` は 0 行**（`foodOf()` を見る経路も、クリエイティブ一覧も、もう通っています）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/crafting.test.ts`: **小麦 3 個を横一列に置いた 3x3 盤面**の `findRecipe()` を
  **`name` / `out` / `count` を出力してから**判定 / **2x2 の盤面では `null`**（3 幅なので
  作業台が要る）/ **端に寄せた形でも成立する** / **小麦 2 個では `null`**
- `test/blocks.test.ts`: **`sharedItems.length === 12`** と `sharedItems[11] === BREAD` と
  `MAX_ITEM_ID === BREAD`（**ラベルの「11 個（124 まで）」も 12 個（125 まで）に直すこと。
  ゆるめるのではなく数え直す**）/ パンは **`placedBlock(BREAD) === AIR`**・
  **`toolOf(BREAD) === null`**・**`foodOf(BREAD) !== null`**（`itemName()` で出力してから）/
  **`foodOf(WHEAT) === null` の既存の判定は 1 つも消さないこと**
- `test/vitals.test.ts`: 空腹を減らしてからパンを食べ、**空腹 +5 / 満腹度 +6 / 毒つきでない**
  （前後の値を出力してから。**`allFoodIds()` の既存の一覧出力には自動で乗ります**）
- `test/use.test.ts`: パンを持って **`decideUse(null, facts(BREAD))` が `eat`**（`aim` 無しでも）/
  **`canEat: false` なら `flash`** / **`creative: true` なら `none`**（焼き豚の 3 件と同じ形。
  **既存の焼き豚の判定は残すこと**）

## 7. このタスク固有の禁じ手

1. **小麦（124）を `FOODS` に足さないこと**（本家と同じで、**パンにしてから食べます**）
2. **`main.ts` を 1 行も触らないこと**（**1450 行 = 停止条件ちょうど**。1 行でも足すと止まります）
3. **`use.ts` / `vitals.ts` に「パン」と書かないこと。** 食べる経路はもう `foodOf()` 1 本で、
   アイテムの名前を書いた瞬間に「食べ物を足すたびに 3 か所直す」形に戻ります
4. **`smelting.ts` に足さない**（かまどは要らない）/ **`block:` を `AIR` 以外にしない**
   （置けるパンは本家にない）/ **`stack` を 1 にしない**（傷が付く物ではない。64 個積める）
5. **既存のレシピ・`FOODS` の 3 行・`DROPS` を 1 行も書き換えないこと**
6. **126 以降を予約しない**（取るのは 125 の 1 個だけ）/ **`SaveData` を触らない・
   テストの判定をゆるめないこと**

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2798 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` に**「パン（AUTODEV 15）」の節を 1 つ**足す
（空腹 5・満腹度 6 は本家 / 小麦 3 → パン 1 も本家 / **かまど無しで作れる中では一番強い**）/
`ROADMAP.md` の予約表の 125 の行を「**パン。実装済み**」にして、**予備を 126..255 に直す**
（`157` 行あたりの「アイテム ID は 125 から」も 126 からに直すこと）/
**C-3: `npm run build` のあと `npm run shot -- crops` を撮り直し、`Read` で開いて畑の見た目が
変わっていないことを見る**（描画は 1 行も触らない。**パンはインベントリの中でしか見えないので、
色 `0xc49a5e` の見え方は `HANDOFF.md` の「ブラウザで見てほしいところ」へ**）/
`AUTODEV-QUEUE.md` の 15 番の行を消す / この仕様書を `済` に / `HANDOFF.md` を丸ごと書き直す。
