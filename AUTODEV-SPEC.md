# 仕様: 粗い土（キューの 69・**ID 1 個**）

状態: 未着手
差し戻し: 0 回

## 0. 数え直した結果（177 の B）

- `src/` `test/` `tools/` に「粗い土」「COARSE_DIRT」「coarse」は **0 件**（未実装）。
- 共有帯の次の空きは **212**（`STONE_WALL` = 211 が最後・`MAX_ITEM_ID` = `STONE_WALL`・共有帯のアイテムは 89 個・空きは 44）。
- 手本は **`TERRACOTTA`(210)**（立方体 1 つ。`git show 3e62da2` が差分の全部）。`def()` は `blocks.ts` の土(`DIRT`・1699 行)の隣ではなく、
  共有帯の末尾（`STONE_WALL` の `def()` の次）に置く。レシピの手本は `crafting.ts` の `羊毛`（2x2・184 行）。
- `soil` / `bank` は表 1 本（`SOIL[]` / `BANK[]`）なので、**付けないだけで「耕せない・苗木が立たない・サトウキビが立たない」になる**。
  耕すのは `tillTarget()` の `id === DIRT || id === GRASS`（2900 行付近）で、粗い土は DIRT でないので自然に外れる。

## 1. 何を足すか・完了の判定

**粗い土（耕せず・苗木もサトウキビも立たない土色の立方体）を 1 つ足し、土 2 + 砂利 2（2x2 の斜め）で 4 個得られる**（本家 Beta 1.8 と同じ）。
`npm test` に「粗い土（212）」の節とクラフトの 1 節が増え、レシピが 1 本増え、項目数が増えて緑。

## 2. 触るファイル / 触らないファイル

- 触る: `src/blocks.ts`（定数 `COARSE_DIRT = 212` + コメント + `def()` 1 つ）、`src/crafting.ts`（import と `RECIPES` に 1 本）、
  `src/items.ts`（`MAX_ITEM_ID` の右辺を `COARSE_DIRT` へ・import も）、
  `test/blocks.test.ts`（新しい節 + 共有帯の突き合わせを 1 要素伸ばす〔`sharedItems[89] === COARSE_DIRT`・件数 90・`MAX_ITEM_ID === COARSE_DIRT`・空き 43〕。
  手本の `terracotta()` の `MAX_ITEM_ID === 210` と同様、前の節の `MAX_ITEM_ID` の比較は `>=` へ直す〔等しいまま残ると落ちる〕）、
  `test/crafting.test.ts`（レシピ 1 節・レシピ総数の数え直し）、`tools/shot.ts`（既存の場面に土・粗い土・砂利を並べる）、
  `ROADMAP.md`（212 を「実装済み」・予備を 213..255 の 43 個へ）、`TUNING.md`（色 1 行）。
- 触らない: **`src/main.ts`・`src/hands.ts`・`src/mesher.ts`・`worldgen.ts`・`biomes.ts`・`crops.ts`**、`SaveData`（`version` 1 のまま）、
  既存の ID・既存のブロック定義・既存のレシピ。**`tillTarget()` や草の広がりに `id === COARSE_DIRT` と書き足さない**（表に聞くだけで外れること）。

## 3. 使う ID

**212 を 1 個**（共有帯の次の空き）。取ったら予約表に行を足し、「予備」を 213..255（43 個）へ。**1..63 の帯は使わない**（凍結）。

## 4. 判断をどのファイルに置くか

- 性質は `blocks.ts` の `def()` だけ: 硬さ **0.5**（土の写し）・`tool: "shovel"`・`sound: "dirt"`・**`soil` / `bank` / `falls` / `variantOf` は書かない**。
- レシピは `crafting.ts` の `RECIPES` だけ: `shape: ["DG","GD"]`・`key: { D: DIRT, G: GRAVEL }`・`count: 4`。左右反転形が別に要るかは `crafting.ts` の既存の斜めレシピ／照合の仕組みを読んで決め、
  要るなら `["GD","DG"]` を同じ出力で足す（要らなければ足さない）。
- 新しい「確かめられないもの」は無い。`unverifiable-pair` は不要。手順は **`add-block` スキル**を名指しで渡す。
- 触る前に引く層 2: `grep -l '"src/blocks.ts"' rules/*.md` / `"src/crafting.ts"` / `"src/items.ts"` / `test/**` なので `rules/testing.md` も。

## 5. 書くテスト（値を出力してから判定）

`test/blocks.test.ts`（`terracotta()` の形を写す）:
1. 名前「粗い土」・アイテム名が同じ・`variantOf === AIR`・`placedBlock(212) === 212`・立方体（値を `console.log`）。
2. 硬さ 0.5・シャベル・`sound === "dirt"`。**`isSoil(COARSE_DIRT)` が false・`isBank` 相当が false**（耕せず苗木・サトウキビが立たない）。`tillTarget` に聞いて `AIR`（耕せない）。
3. 掘ると自分が 1 個落ちる（`DROPS` に行を足さない）。ID は 212・`MAX_ITEM_ID === 212`。共有帯の突き合わせを 1 要素伸ばす（判定はゆるめず足すだけ）。
4. **色**は既存のブロック上面色から **20 以上離れる**ことを総当たりで測って選ぶ（`rules/items-survival.md`）。土 `0x6b533a` の隣なので素直な値は割る見込み。
   灰みの褐色（例 `0x7d6a55` 付近）から出発してずらし、ずらした値と最小距離を `console.log` し `TUNING.md` に書く。20 はゆるめない。
`test/crafting.test.ts`: 土 2 + 砂利 2 の斜め → 4 個 / 土だけ・砂利だけでは出ない / 既存の 2x2（板・羊毛）と衝突しない / レシピ総数を数え直す。

## 6. このタスク固有の禁じ手

- 草が粗い土へ広がる・粗い土が草になる・シャベルで道に変える、を足さない（本家の鍬で土に戻す動きも見送り）。
- 既存の土・砂利の定義やドロップ表を書き換えない。自然生成させない。`main.ts` / `hands.ts` に 1 行も足さない。既存テストの判定をゆるめない（件数は数え直す）。

## 7. 終了条件

`npm run typecheck` / `npm test` / `npm run build` が緑 / コミット 1 つ / `TUNING.md` に色の 1 行 / `ROADMAP.md` の予約表（212 実装済み・予備 43 個）/
`npm run shot` で土・粗い土・砂利を並べて撮って `Read` で見る / 落とし穴があれば `rules/` へ（無ければ「決まりごと 0 件」）。
