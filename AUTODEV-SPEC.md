# 仕様: 植えた苗木が木に育つ（キューの 30b・**ブロック ID もアイテム ID も 0 個**）

状態: 未着手
差し戻し: 0 回

## 1. 何を足すか と 完了の判定

**プレイヤーが置いたオーク／トウヒの苗木が、180 秒で幹と葉の木になります。**
サトウキビ（`growCane()`）とまったく同じ器に乗せます —— `notePlaced()` で覚え、
`hasColumn` で列を待ち、`CropWorld.setVoxel` で書く。**`main.ts` は 0 行**です
（`crops.notePlaced(placed.at, placed.id, world)` がもう繋がっている。`main.ts:944`）。

**完了の判定**: `npm test` に「苗木が木に育つ」の節が増えて、少なくとも次が緑:

- 「オークの苗木は 179 秒では苗木のまま、180 秒で幹（`WOOD`）に変わる」
- 「トウヒの苗木はトウヒの幹（`SPRUCE_WOOD`）とトウヒの葉になる」
- 「上を塞ぐと育たないが、**忘れもしない**（どけたら育つ）」
- 「列が未読み込みのあいだは 1 マスも書かない（持ち越す）」
- 「`treeCells()` の出す形が `TREE_RADIUS`（2）を超えない」
- **既存の `test/worldgen.test.ts` が 1 つもゆるまずに緑のまま**（下の 6.）

## 2. 触るファイルと、触らないファイル

| ファイル | 何をするか | 見込み |
| --- | --- | --- |
| **`src/treeshape.ts`（新）** | 木の形だけを持つ純関数。`treeCells(kind, height)` と `grownTreeHeight(kind, x, z)` | +60 行 |
| `src/worldgen.ts` | `stampTree()` の葉と幹の二重ループを `treeCells()` の呼び出しに差し替え | **−15 行ほど** |
| `src/crops.ts` | `SAPLING_GROW_SECONDS` / `notePlaced()` に苗木 2 種 / `update()` の振り分けに 2 本 / `growTree()` | +55 行 |
| `test/crops.test.ts` | 上の 5 件 | +80 行 |
| `test/worldgen.test.ts` | 形の見張り（半径・幹の本数） | +20 行 |
| `TUNING.md` | 180 秒の 1 行 | +1 行 |
| **`src/main.ts`** | **1 文字も開かないこと**（いま 1450 行。停止条件 2 に並んでいます） | **0 行** |
| **`src/blocks.ts` / `src/items.ts` / `src/placing.ts` / `src/session.ts`** | **触らない**（苗木も置ける形も保存ももう済み） | 0 行 |

**先に読むこと（自動では読み込まれません）**: `rules/worldgen.md`（`worldgen.ts`）と
`rules/stateful-blocks.md`（`crops.ts`・`main.ts`）、`rules/testing.md`（`test/**`）。
**`src/treeshape.ts` と `test/treeshape` を `rules/worldgen.md` の `paths` に足すこと**
（足さないと次の周が引けません）。

## 3. 使う ID

**0 個。** ブロックもアイテムも 1 つも取りません（`SAPLING` 164 / `SPRUCE_SAPLING` 165 /
`WOOD` / `SPRUCE_WOOD` / `LEAVES` / `SPRUCE_LEAVES` は全部あります）。
**共有帯の次の空きは 166 のまま**で、この周のあとも 166 のままであること（`ROADMAP.md`）。

## 4. 判断をどのファイルに置くか

- **「何秒で育つか・どこに書けるか・いつ忘れるか」は `crops.ts`**（サトウキビと同じ）。
  **`Math.random` を入れないこと** —— 秒数をテストで固定できなくなります（ファイル頭の約束）。
- **「木がどんな形か」は `src/treeshape.ts`**。生成（`worldgen.ts`）と育ち（`crops.ts`）が
  **同じ 1 本を見ること** —— 2 か所に形を書くと、自然の木と植えた木が別物になります。
- **高さは `grownTreeHeight(kind, x, z)` の純関数**（座標から決まる整数ハッシュ。
  `nethergen.ts` の `hash2` と同じ式でよい。**シードは要りません**）。
  範囲は生成側と同じ **オーク 4..6・トウヒ 6..9**。
- 新しく「確かめられないもの」は 1 つも増えません（`unverifiable-pair` は不要）。

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。偽のワールドは `CropWorld` の
3 つの入口だけで足ります（`test/crops.test.ts` に既にある形を使う）。

1. **育つ**: 苗木を置いて `update(179, w)` → まだ `SAPLING`。`update(1, w)` →
   その場が `WOOD`、上に幹が `height` 本、葉が 1 枚以上。**幹の本数と葉の枚数を出力してから判定**
2. **種類で変わる**: オークとトウヒの**幹の色（ID）と葉の ID と高さ**を並べて出力し、
   どちらも取り違えていないこと
3. **塞がっていたら育たない**: 苗木の 1 つ上に `STONE` を置く → 180 秒でも `SAPLING` のまま・
   **`crops.count` が 1 のまま**。石をどけて `update(0.1, w)` → 育つ
4. **列を待つ**: `hasColumn` が false の間は `setVoxel` が 1 回も呼ばれないこと
   （呼び出しを数えて出力する）。true にすると次の `update` で育つ
5. **掘ったら忘れる**: 苗木を `AIR` にして `update` → `count` が 0
6. **形**（`test/worldgen.test.ts`）: `treeCells()` の全セルで `|dx| <= 2 && |dz| <= 2`、
   幹が `height` 本、葉が 1 枚以上。**半径と本数を出力してから判定**

## 6. このタスク固有の禁じ手

- **`stampTree()` が書き出す結果を変えないこと。** 差し替えは**出す順番（葉 → 幹）も
  `overwrite` の真偽もそのまま**。変えると**既存のワールドの木が動き**、
  セーブの差分（壊した・置いたブロック）が別の場所を指します。
  **`test/worldgen.test.ts` が赤くなったら、それは仕様どおりの退行です** —— 判定をゆるめず形を戻すこと
- **`crops.ts` の表の形（`"x,y,z"` → 秒数）を変えないこと。`SaveData.version` は 1 のまま**
  （苗木は既存の `crops` の表にそのまま乗ります。新しいキーは要りません）
- **育つ段階をブロック ID で表さないこと**（`crops.ts` の頭の約束。本家の 8 段階はやらない）
- **`main.ts` を開かないこと**・**ブロック ID / アイテム ID を 1 つも取らないこと**
- **列をまたぐぶんを「書けたところまで書く」で済ませないこと** ——
  **木が掛かる 4 隅の列（x±2, z±2）が全部 `hasColumn` になるまで 1 マスも書かず、
  秒数を持ち越すこと**（半分だけの木が残ると、二度と直りません）
- **`worldgen.ts` に「何秒で育つか」を 1 行も書かないこと**（形だけを渡す）

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **すべて緑**（音の 1 件が跳ねたら走り直す。
2 回続けて赤いときだけ退行）/ `npm run build` 緑 / **`src/**` を触るので
`npm run bench` を 3 回まわして中央値を見る**（`worldgen.ts` の生成路を触るため）/
コミット 1 つを `master` へ push / **`TUNING.md` に `SAPLING_GROW_SECONDS = 180` の 1 行** /
**撮って見る**（`npm run shot` に「育った木」の場面。C-3）/ `AUTODEV-QUEUE.md` の 30b を消す /
このファイルを `状態: 済` にする / `HANDOFF.md` を書き直す。
