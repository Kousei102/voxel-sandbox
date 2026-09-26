# 仕様: シラカバの木（キューの 50・**ID 3 個 = 196..198**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**: 入っていません。`TreeKind` は `"oak" | "spruce" | "cactus"`（`biomes.ts` 46 行）、
`BIRCH` は `src/**` にも `test/**` にも 0 件。**`TreeKind` を読むのは 4 ファイルだけ**（`biomes.ts` / `worldgen.ts` /
`treeshape.ts` / `crops.ts`）で、**`main.ts` には `SAPLING` も `spruce` も 0 件**（苗木・葉・原木は表から通る）。

**本家の規則**（Beta 1.2）: 森の木のおよそ 1/5 がシラカバ。形はオークと同じ丸い塊（幹 5〜7）・樹皮は白・
葉は色が固定 `0x80a755`・**葉からリンゴは落ちない**・苗木は 5%・原木から板 4 枚（本家は板も別材質）・かまどで木炭。

**割り方の決め**: **形はオークの写し（`treeCells()` のオーク側の分岐をそのまま使い、ID だけ差し替え）・高さもオークと
同じ 4..6**（本家は 5..7）。**理由: いま森に立っているオークの 2 割が「同じ形・同じ高さのまま ID だけ変わる」形なら、
既存のセーブの差分（切った幹・置いたブロック）が 1 マスもずれない。** 高さを変えると切った木の上に幹が残ります。
**板は既存の `PLANK` 1 種へ**（トウヒと同じ。シラカバの板を足すとハーフ・階段・フェンスまで増えるので別の周）。

## 1. 何を足すか / 完了の判定

**ブロック + アイテム 196「シラカバの原木」/ 197「シラカバの葉」/ 198「シラカバの苗木」を足し、森（`FOREST`）の木の
2 割をシラカバにする。** 苗木を植えると 180 秒でシラカバが育つ・葉から棒と苗木・原木から板 4 枚と木炭・燃料 15 秒。
**完了**: `npm test` に**「シラカバ（50）」の件**（`test/blocks.test.ts`・`test/items.test.ts`・`test/worldgen.test.ts`・
`test/treeshape.test.ts`・`test/crops.test.ts`・`test/crafting.test.ts`・`test/smelting.test.ts`）が増えて**すべて緑**
（**+15〜25 件**）。ブロック ID の枠の行が**「111..255 の空き 57」**になる。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts`（定数 3 つ・`def()` 3 つ。苗木はトウヒの苗木の写し）/ `src/biomes.ts`（`TreeKind` に `"birch"`・
`BiomeDef.birch` を**11 行ぜんぶ**に）/ `src/worldgen.ts`（種類を決める 2〜3 行・塩 1 本）/ `src/treeshape.ts`（原木と葉を
種類から引く小さい関数 1 つ・`treeCells()` と `vineCells()` がそれを使う・`grownTreeHeight()` のコメント）/
`src/crops.ts`（`saplingKind()` に 1 行）/ `src/items.ts`（`DROPS` に 1 行・`MAX_ITEM_ID`）/ `src/crafting.ts`（板 1 本）/
`src/smelting.ts`（`SMELTING` と `FUEL` に 1 行ずつ）/ `tools/shot.ts`（`sapling` と `grown` の場面に 1 本ずつ）/
上の 7 本のテスト / `ROADMAP.md`（予約表に 196..198・「196..255 予備 60 個」を「199..255・予備 57 個」・「使用済み」の列）/
`TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / 当たった `rules/*.md`。

**触らない**: **`src/main.ts`（0 行）** / `src/placing.ts` / `src/world.ts` / `src/mesher.ts` / `src/use.ts` /
`*render.ts` / `ui.ts` / `inventoryui.ts` / `SaveData` / **既存の `WOOD` / `LEAVES` / `SAPLING` / `SPRUCE_*` の定義と色**。

**先に引いて読むこと**: `grep -l` で `"src/blocks.ts"` / `"src/biomes.ts"` / `"src/worldgen.ts"` / `"src/treeshape.ts"` /
`"src/crops.ts"` / `"src/items.ts"` / `"src/crafting.ts"` / `"src/smelting.ts"`（**`rules/worldgen.md` の塩の一覧と
`?:` にしない決まり・`items-survival.md` の `MAX_ITEM_ID` と TS2367**）/ `rules/testing.md` / **`add-block` スキル**。

## 3. 使う ID

**196..198 の 3 個**（予約表「196..255 予備 60 個」の先頭）。**196 原木 / 197 葉 / 198 苗木**。**3 つともブロックで、
`variantOf` を書かないのでアイテムは `items.ts` の for が作る**（111 以降は 1 本の番号列。アイテム 196..198 = 同じもの）。
**`MAX_ITEM_ID` は 198 へ手で伸ばす**（上限がブロック側になる）。**次に取るのは 199 になる。**

## 4. 判断をどこに置くか

新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要）。

- **何か・色・硬さ・音**: `blocks.ts`。**原木 = `WOOD` の写し**（硬さ 2・斧・`sound: "wood"`）/ **葉 = `LEAVES` の写し** /
  **苗木 = `SPRUCE_SAPLING` の写し**（`model: "cross"` / `CROSS_BOX` / `solid: false` / 硬さ 0 / `supportFace: FACE_YN` /
  `needsSoil: true`。**`variantOf` / `replaceable` / `stacksOnSelf` を付けないこと**）
- **色（B の周で 190 種と総当たりで測った。一覧は `top` だけ）**:
  - **原木 `top: 0xb0a876`・`side: 0xd7d3c7`**（いちばん近い本棚 32.1。**淡い黄色は砂・砂岩・エンドストーンで埋まっていて、
    素直な `0xcfc08a` は砂岩から 9.9**。暖色の帯の最大がこの値）。**側面は一覧に出ないので白い樹皮をそのまま**
  - **葉 `0x80a755`**（本家の値そのまま。いちばん近い草 22.8）
  - **苗木 `0xa8d070`**（いちばん近いサトウキビ 35.9・オークの苗木 47.5）
  - **3 つどうしは 58 以上離れている**。**C の周で測り直し、割ったらずらして `TUNING.md` へ**（判定はゆるめない）。
    **側面 `0xd7d3c7` と上面の明暗の差を絵の画素で読むこと**（`HANDOFF.md` の「絵の画素を直に読む」・目安 10 以上）
- **どこに生えるか**: `biomes.ts` の **`BiomeDef.birch`**（その木がシラカバになる確率。**森だけ 0.2・他の 10 行は 0**）。
  **`?:` にしないこと**。`TreeKind` に `"birch"` を足すが、**`BiomeDef.treeKind` に `"birch"` を書く行は作らない**
- **worldgen.ts**: `def.treeKind === "oak" && def.birch > 0 && hash2(wx, wz, this.seed ^ 0x3a6d) < def.birch` なら
  `"birch"`。**塩 `0x3a6d` は既存 20 本と重ならない**（数え済み）。**高さの三項式は触らない**（シラカバはオークの枝に入る
  = 4..6 のまま）。**木の場所・高さ・ツタの判定の順番を変えないこと**（既存の木が動く）。数値は書かない
- **treeshape.ts**: `treeBlocks(kind)` のような**種類 → `{ wood, leaf }` の表 1 本**を作り、`treeCells()` と `vineCells()`
  の `spruce ? ... : ...` を両方そこへ付け替える（**2 か所に写すと葉の判定がずれて、シラカバにツタが掛からない**）。
  **形の分岐（`spruce` の円錐）は `kind === "spruce"` のまま**。`grownTreeHeight("birch")` はオークと同じ 4..6
- **crops.ts**: `saplingKind()` に `if (id === BIRCH_SAPLING) return "birch";` の 1 行だけ（育つ秒数は触らない）
- **items.ts の `DROPS`**: シラカバの葉は**トウヒの葉と同じ形**（棒 10%・`extra` で苗木 5%・**リンゴなし**）
- **crafting.ts**: `{ name: "板", out: PLANK, count: 4, ingredients: [BIRCH_WOOD] }`（レシピ 91 → **92 本**）
- **smelting.ts**: `SMELTING` に原木 → 木炭・`FUEL` に原木 `SMELT_TIME * 1.5`（トウヒの行の写し）

## 5. 書くテスト（**値を出力してから判定する**）

- **`test/blocks.test.ts`**: 3 つの名前・色・硬さ・道具を出してから判定 / **原木は斧・苗木は `needsSoil` で土・草・耕地の
  上にだけ立つ・葉は不透明の立方体**（オークの葉と同じ旗）/ 共有帯の一覧・「共有帯 N 個」の数え直し（74 → **77**）/
  **「111..255 の空きは 57」**（数え直し。ゆるめではない）/ **`MAX_ITEM_ID === BIRCH_SAPLING`**
- **`test/items.test.ts`**: 3 つの色のいちばん近い相手と隔たりを出して **>= 20**・3 つどうしも >= 20 / `allItemIds()` に
  196..198 / **前の上限の節（金の道具）は `> GOLD_HOE` に、`===` はこの節へ**（TS2367）/ **葉を 2000 枚割って棒・苗木・
  リンゴの数を出し、リンゴ 0・苗木 3〜7%**
- **`test/treeshape.test.ts`**: **シラカバとオークは高さごとにマスの座標が 1 つ残らず同じで、ID だけが原木・葉**（4..6）/
  **`vineCells("birch")` がオークと同じ座標を返し、0 マスではない**（ツタが掛かる）/ `grownTreeHeight("birch")` は 4..6
- **`test/worldgen.test.ts`**: **まとまった森を 1 マスも飛ばさずに数え、オーク・シラカバの本数と割合を出してから
  「シラカバが 10〜30%」**・**森以外のバイオームにシラカバの原木が 1 マスも無い** / 既存の「木の数」「砂漠に木が無い」
  「ツタが掛かる壁は葉」の件はシラカバを数えに入れる（**`WOOD || SPRUCE_WOOD` を 3 種へ。判定の数値は変えない**）/
  **同じシードで 2 回作ると同じ**
- **`test/crops.test.ts`**: シラカバの苗木を植えて 180 秒で**シラカバの原木と葉**が立つ（トウヒの件の写し）
- **`test/crafting.test.ts`**: 原木 1 → 板 4（2x2 で作れる）/ **「レシピは 91 本」を 92 本に**（名前も数え直しの理由へ）
- **`test/smelting.test.ts`**: 木炭 1 個・燃料 15 秒（トウヒと同じ）

## 6. このタスク固有の禁じ手

- **既存の森のオークの場所・高さ・形・ツタを 1 マスも動かさないこと**（変わってよいのは 2 割の木の ID だけ）
- **塩を既存と重ねないこと・高さの塩 `0x99` を使い回さないこと**（背の高い木だけシラカバになる）
- **`LEAVES` / `SPRUCE_LEAVES` の `DROPS` を書き換えないこと**（リンゴの帯はオークだけ）/ **板を別材質にしないこと**
- **`main.ts` に 1 行も書かないこと** / ID を振り直さない / `SaveData.version` は 1 のまま / **判定をゆるめないこと** /
  **`test/world.test.ts` の p99 を触らないこと** / **35 以降に手を出さないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑・**4015 → 4030〜4040 あたり**）/ `npm run build` 緑 /
  **`npm run bench` を 3 回まわして中央値**（生成を触る。`generateChunk` の前との差を `HANDOFF.md` へ）
- **C-3**: **`npm run shot -- sapling grown terrain`** を撮って `Read` で見る（白い幹が立方体に見えるか・葉の色がオークと
  見分けられるか・苗木 3 本の色）。**本物のブラウザで森を 1 枚**（`tools/browsershot.mjs` か使い捨てのスクリプト）
- **コミット 1 つを `master` へ push** / キューの 50 を消す / この仕様書を **`状態: 済`** /
  **`ROADMAP.md` の予約表に 196..198 を「実装済み」** / `TUNING.md` に 1 節（2 割・高さ 4..6 を本家 5..7 から寄せた理由・
  色 3 つ）/ `docs/autodev-log.md` に 1 節 / 踏んだ落とし穴を `rules/` へ / **`HANDOFF.md` を書き直す**
  （**既存の森の 2 割のオークがシラカバに変わる**ことを「ブラウザで見てほしいところ」に）
