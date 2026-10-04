# 仕様: レンガブロックのハーフ（キューの 61・**ID 2 個**）

状態: 未着手
差し戻し: 0 回

## 0. 数え直した結果（161 の B）

- `BRICK`(12) は立方体であるが、**ハーフは無い**（`blocks.ts` の `slabPair()` は 石 / 丸石 / 板 / 砂岩 / ネザーレンガ / 石レンガ の 6 組。
  `crafting.ts` の `slabRecipe()` も同じ 6 行）。
- **24b-2 は ID を食うので人の確認待ち → 飛ばした。** 61 は「ハーフの材質を増やす」の型（`add-block` スキル 5.）そのもの。
- 低帯の空きは **7（57..63）**・共有帯は **52（次の空きは 204）**。55 / 56 は「下付き = 低帯・上付き = 共有帯」だった。

## 1. 何を足すか・完了の判定

**レンガハーフ（下付き 1 + 上付き 1）。レンガブロック 3 個を横一列 → ハーフ 6 個**（既存の 6 組と同じ `slabRecipe`）。
置く向き（上付き / 下付き）の振り分けは既存の `SLAB_TOP_BY_BOTTOM` が勝手にやる（書き足さない）。
完了 = `npm run typecheck` と `npm test` が緑で、`test/blocks.test.ts` に下の 5. の項目が増え、
**「1..63 の空き」が 7 → 6、「111..255 の空き」が 52 → 51 になる**。

## 2. 触るファイルと、触らないファイル

- 触る: `src/blocks.ts`（定数 2 つ・`slabPair()` を 1 回呼ぶ。**`slabPair` 本体は 1 文字も変えない**）、
  `src/crafting.ts`（`slabRecipe("レンガ", BRICK, BRICK_SLAB)` を 1 行・import 1 つ）、
  `test/blocks.test.ts`（と空き数を数えている既存の件の**数え直し**）、`tools/shot.ts`（場面 `slabs` にレンガを 1 組足す。任意）、
  `ROADMAP.md`（予約表）、`TUNING.md`（要らなければ書かない）、`rules/*.md`（踏んだ穴があれば）。
- **触らない**: `main.ts` / `hands.ts` / `items.ts`（低帯で `variantOf` が `AIR` なのでブロック → アイテムの for が作る）/
  `worldgen.ts` / `smelting.ts` / `storage.ts` / `session.ts`（**`SaveData` 不変**）/ `mesher.ts` / `.claude/**`。

## 3. 使う ID

- **`BRICK_SLAB` = 57**（低帯の予備 57..63 の先頭）。
- **`BRICK_SLAB_TOP` = 204**（共有帯の次の空き。`items.ts` 側にも 204 が無いことを `test/blocks.test.ts` の突き合わせで確かめる）。
- **57 の予約表の行を「実装済み」に書き換え、204 も 1 行足す**（`ROADMAP.md`）。**既存の ID を 1 つも振り直さない。**

## 4. 判断の置き場所

新しく確かめられないものは足さない（`unverifiable-pair` は要らない）。`blocks.ts` の `slabPair()` と `crafting.ts` の
`slabRecipe()` に**データ 1 行ずつ**を足すだけ。**色・硬さ・道具は元のレンガ（12）の写し**（`{ hardness: 2, tool: "pickaxe", minTier: TIER_WOOD }`、
色は `BRICK` の `def()` を読んで `top / side / bottom` を合わせる。ずらすと壁と屋根で色が食い違う）。
**名前は「レンガハーフ」**（`BRICK_ITEM`(170) は「レンガ」なので一覧で区別できる。`itemName(BRICK_SLAB)` を出力して判定）。

## 5. 書くテスト（値を出してから判定）

- `test/blocks.test.ts`: 55 / 56 の既存の件（667〜690 行付近）の**隣に同じ形**で、`BRICK_SLAB === 57`・`<= LOW_BAND_MAX`・
  `variantOf === AIR`・名前・`BRICK_SLAB_TOP === 204`・`variantOf === BRICK_SLAB`・`boxes` が下付き / 上付きの箱・
  硬さ / 道具 / `minTier` と**色が元の `BRICK` と同じ**、を出力してから判定。
- 空き数を数えている既存の件（「1..63 の空きは 7」「111..255 の空きは 52」）は**数え直して 6 / 51 にする**（判定をゆるめず、理由を 1 行書き換える）。
- `test/crafting.test.ts`（なければ `blocks.test.ts`）: レンガ 3 個の横一列 → `BRICK_SLAB` 6 個。**石レンガハーフ等の既存の 6 組のレシピが動かない**。
- 上付きの置き分け（`SLAB_TOP_BY_BOTTOM[BRICK_SLAB] === BRICK_SLAB_TOP`）を 1 件。

## 6. このタスク固有の禁じ手

1. **`slabPair()` / `slabRecipe()` / `SLAB_TOP_BY_BOTTOM` の中身を変えない**（呼ぶだけ）。
2. **レンガ階段・レンガの壁は足さない**（別の周。ID を食う）。**`BRICK` のドロップ・色・硬さを変えない。**
3. **低帯は 57 だけ・共有帯は 204 だけ。** 予約表に無い番号を使わない。
4. 既存の空き数の判定を**ゆるめて**緑にしない（数え直すだけ）。
5. 踏んだ落とし穴は `rules/blocks-shapes.md` などへ `Edit` で据える（`grep -l '"src/blocks.ts"' rules/*.md` の 3 本を読んでから。`.claude/**` へは書かない）。

## 7. 終了条件

`npm run typecheck` と `npm test` と `npm run build` が緑 / コミット 1 つ / 見た目に出る（ハーフの形は既存と同じだがレンガ色）ので
**`npm run shot -- slabs` を撮って `Read` で見る** / `HANDOFF.md` に「ブラウザで見てほしいところ」2〜3 行。
