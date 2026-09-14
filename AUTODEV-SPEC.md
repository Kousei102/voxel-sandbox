# 仕様: ネザーレンガと石レンガのハーフ（キューの 31・**低帯 2 個 + 共有帯 2 個**）

状態: 済
差し戻し: 0 回

## 1. 何を足すか と 完了の判定

**ハーフブロックの材質を 4 → 6 に増やします。** 既にある石・丸石・板・砂岩とまったく同じ形で、
**`blocks.ts` の `slabPair()` を 2 回・`crafting.ts` の `slabRecipe()` を 2 回呼ぶだけ**です
（どちらも既にある関数。**中身は 1 文字も書き換えません**）。**`main.ts` は 0 行・
`items.ts` も 0 行**（大元が低帯なので、ブロック → アイテムの for が勝手に作ります）。

**完了の判定**: `npm test` に「ネザーレンガと石レンガのハーフ」の節が増えて、少なくとも次が緑:

- 「大元 2 つは 55 / 56（1..63）で**アイテムになり**、上付き 2 つは 166 / 167（共有帯）で
  **アイテムにならない**（`itemName()` が空）」
- 「下付きは下半分・上付きは上半分・名前が同じ・掘ると大元が 1 個」
- 「上の面を狙うと上付きになり、**他の材質の上付きにはならない**」
- 「ネザーレンガ 3 → ハーフ 6 / 石レンガ 3 → ハーフ 6 が `findCraft()` で引ける」
- **既存の 4 材質の判定が 1 つもゆるまずに緑のまま**（下の 6.）

## 2. 触るファイルと、触らないファイル

| ファイル | 何をするか | 見込み |
| --- | --- | --- |
| `src/blocks.ts` | `export const` 4 行 + `slabPair()` を 2 回（既存 4 材質のすぐ下に並べる） | +18 行 |
| `src/crafting.ts` | `slabRecipe()` を 2 行（既存 4 行のすぐ下）+ import 2 語 | +4 行 |
| `test/blocks.test.ts` | 下の 5. の 1..4 + **空きの数を 2 か所数え直す** | +45 行 |
| `test/crafting.test.ts` | 下の 5. の 5 + **レシピ本数 66 → 68 を数え直す** | +25 行 |
| `tools/shot.ts` | 場面 `slabs` を 1 つ（自然に湧かないので既存の絵には 1 枚も写りません） | +45 行 |
| `ROADMAP.md` | 予約表に 55 / 56 / 166 / 167 の行（**実装済みと書く**） | +4 行 |
| **`src/main.ts`** | **1 文字も開かないこと**（いま 1450 行。停止条件 2 に並んでいます） | **0 行** |
| **`src/items.ts`** | **触らない**（`item()` も `DROPS` も `MAX_ITEM_ID` も 0 行。下の 6.） | 0 行 |
| **`src/placing.ts` / `src/mesher.ts` / `src/worldgen.ts` / `src/fortress.ts` / `src/stronghold.ts`** | **触らない**（置く道も面も生成も既存のハーフで通っています） | 0 行 |

**先に読むこと（自動では読み込まれません）**: `rules/blocks-shapes.md`（`blocks.ts`・
`placing.ts`）と `rules/items-survival.md`（`items.ts`・`crafting.ts`）、`rules/testing.md`（`test/**`）。

## 3. 使う ID

**4 個。`ROADMAP.md` の予約表のとおりに取ること**（**勝手に増やさない・飛ばさない**）:

| ID | 名前 | 帯 |
| --- | --- | --- |
| **55** | `NETHER_BRICK_SLAB`（"ネザーレンガハーフ"） | 低帯（**アイテムになる大元**） |
| **56** | `STONE_BRICK_SLAB`（"石レンガハーフ"） | 低帯（同上） |
| **166** | `NETHER_BRICK_SLAB_TOP` | 共有帯（`variantOf: NETHER_BRICK_SLAB`） |
| **167** | `STONE_BRICK_SLAB_TOP` | 共有帯（`variantOf: STONE_BRICK_SLAB`） |

**上付きが 64..110 でないのは、あの帯が満杯で凍結だから**です（`rules/blocks-shapes.md`）。
共有帯でも `variantOf` があるのでアイテムは作られず、番号がアイテムと衝突しません。
**この周のあと: 1..63 の空きは 9 → 7・111..255 の空きは 90 → 88・次の空きは 168。**

## 4. 判断をどのファイルに置くか

- **形・色・硬さ・道具は `blocks.ts` の `slabPair()` の呼び出し 2 つだけ。**
  **色は元の材質を 1 の位まで写すこと**（ネザーレンガ `{ top: 0x392229, side: 0x2f1c22,
  bottom: 0x27171d }` / 石レンガ `{ top: 0x7d8288, side: 0x757a80, bottom: 0x6d7278 }`）。
  **硬さ 2 / `tool: "pickaxe"` / `minTier: TIER_WOOD` も元のまま**（既存 4 材質と同じ作法）。
- **上下どちらを置くかの規則は `placing.ts` の `placedVariant()` に既にあります**
  （表は `blocks.ts` の `SLAB_TOP_BY_BOTTOM` が `boxes === SLAB_TOP_BOX` から自動で立てます）。
  **手で表に書き足さないこと。**
- **レシピは `crafting.ts` の `slabRecipe()` 2 行**（材質 3 個 → ハーフ 6 個。本家と同じ）。
- 新しく「確かめられないもの」は 1 つも増えません（`unverifiable-pair` は不要）。
  使うスキルは **`add-block`**。

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。既存の形（`aim()` / `collisionBoxes()` /
`placedVariant()`）をそのまま使い、**新しい入口は 1 つも作らないこと**。

1. **帯と ID**: 4 つの番号・`variantOf`・`itemName()` を**並べて出力してから**判定
   （大元 2 つは名前があり、上付き 2 つは空文字）。**空きの数（低帯 7・共有帯 88）も出す**
2. **形**: 下付き `[0,0,0,1,0.5,1]` / 上付き `[0,0.5,0,1,1,1]`・`blockName(top) === blockName(bottom)`・
   `baseBlock(top) === bottom`・`opaque === false && blocksSky === true`。**箱を出力してから判定**
3. **置く向き**: `placedVariant(NETHER_BRICK_SLAB, aim(FACE_YP, 1.0))` が 166、
   `aim(FACE_YN, 0.0)` が 55。**石レンガの上付きにならない**ことも並べて見る（既存 497 行の形）
4. **掘ると大元**: `dropOf(166)` が 55 / `dropOf(167)` が 56（**`DROPS` に 1 行も書かずに**そうなる）
5. **レシピ**（`test/crafting.test.ts`）: 盤面 `["MMM"]` を組んで `findCraft()` の**出目と個数を
   出力してから**判定（55 が 6 個 / 56 が 6 個）。**2x2 では作れない**ことも見る（3 幅なので）
6. **数え直し（ゆるめるのではありません）**: `test/blocks.test.ts` の「111..255 の空きは 90」→ **88**、
   `test/crafting.test.ts` の「レシピは 66 本」→ **68 本**。**理由を件名に書くこと**
   （例:「上付きハーフ 2 つで 2 個減った」）

## 6. このタスク固有の禁じ手

- **階段を取らないこと。** `STAIR_STATES` が 8 なので**材質 1 つで共有帯 7 個**です（別の周）
- **`slabPair()` / `slabRecipe()` / `SLAB_BOTTOM_BOX` / `SLAB_TOP_BOX` / `SLAB_TOP_BY_BOTTOM` の
  中身を書き換えないこと。** 既存 4 材質の形と当たり判定がその場で動きます
- **`src/items.ts` に 1 行も書かないこと** —— `item()` も `DROPS` も要りません
  （大元は低帯で `variantOf` が `AIR` なので for が作り、上付きは既定の `baseBlock()` が落とします）。
  **`MAX_ITEM_ID` は `SPRUCE_SAPLING`（165）のまま**（55 / 56 はそれより下・166 / 167 は
  アイテムを持たない）。**伸ばすと空のアイテムがクリエイティブに 2 つ並びます**
- **色を元の材質からずらさないこと。** ハーフには一覧の色の隔たりの判定がありません
  （既存 4 材質も元の材質と同じ値です）。**`TUNING.md` は 0 行**
- **`FUEL` にも `SMELTING` にも 1 行も書かないこと**（板ハーフが燃料なのは木だから）
- **ネザーレンガ・石レンガそのもののレシピを足さないこと**（**手に入るのは要塞と遺跡からだけ**の
  ままにする。粘土とレンガの話は 32 で別に取ります）
- **生成（`worldgen.ts` / `fortress.ts` / `stronghold.ts`）に 1 行も書かないこと**
- **既存 ID を振り直さない・`SaveData.version` は 1 のまま・`main.ts` を開かない**

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **すべて緑**（音の 1 件が跳ねたら走り直す。2 回続けて
赤いときだけ退行）/ `npm run build` 緑 / **`npm run bench` は不要**（生成もメッシュ化も
触らないため。触ったなら 3 回まわす）/ コミット 1 つを `master` へ push /
**`TUNING.md` は 0 行**（数値は全部既存の写し）/ **撮って見る**（`npm run shot -- slabs` の
新しい場面。`tools/shot.ts` に平らな台を作って 6 材質を並べ、**`Read` で開いて
面の欠けと裏返りを見る**。C-3）/ `AUTODEV-QUEUE.md` の 31 を消す / **`ROADMAP.md` の
予約表に 4 行**（55 / 56 / 166 / 167 と「次に取るのは 168」）/ このファイルを `状態: 済` にする /
`docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す。
