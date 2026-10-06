# 仕様: 彫刻された砂岩（キューの 66・**ID 1 個**）

状態: 未着手
差し戻し: 0 回

## 0. 数え直した結果（172 の B）

- `blocks.ts` に `SANDSTONE`(24) / `SANDSTONE_SLAB`(31) / `SANDSTONE_STAIRS`(36) / `SMOOTH_SANDSTONE`(208) はあるが、**彫刻された砂岩は無い**（`CHISELED` を含む定数は `CHISELED_STONE_BRICK` = 206 だけ）。
- `crafting.ts` に砂岩ハーフ 2 枚を縦に積むレシピは無い（391 行の石レンガの 1 本だけ）。
- 共有帯の次の空きは **209**（`SMOOTH_SANDSTONE` = 208 が最後・`MAX_ITEM_ID` = 208）。クラフトは **101 本**（`test/crafting.test.ts` 1147 行の件数の突き合わせ）。
- 手本は **63 の「彫刻された石レンガ」**: `blocks.ts` 776 行の定数と 2021 行の `def()`・`crafting.ts` 391 行の 1 本・
  `test/blocks.test.ts` 5309 行 `stoneBrickVariants()`・`test/crafting.test.ts` 891 行・`tools/shot.ts` 1321 行の場面。

## 1. 何を足すか・完了の判定

**彫刻された砂岩（立方体）を 1 つ足し、砂岩のハーフ 2 枚を縦に積むと 1 個得られる**（本家 Beta 1.8）。`npm test` に「彫刻された砂岩（209・立方体）」の節と
クラフトの 1 節が増え、クラフトは 102 本になり、項目数が増えて緑。

## 2. 触るファイル / 触らないファイル

- 触る: `src/blocks.ts`（定数 + `def()` 1 つ）、`src/items.ts`（`MAX_ITEM_ID` を 209 へ）、`src/crafting.ts`（import と `RECIPES` に 1 本）、
  `test/blocks.test.ts`（新しい節 + 共有帯の並びの突き合わせ 323 行の文言と 451 行付近に 1 要素）、`test/crafting.test.ts`（節 + 1147 行の件数を 102 へ）、
  `tools/shot.ts`（場面 `stonebrick` の `row` に並べる）、`ROADMAP.md`（209 を「実装済み」・予備を 210..255 の 46 個へ）、`TUNING.md`（色 1 行）。
- 触らない: **`src/main.ts`・`src/hands.ts`**、`smelting.ts`、`worldgen.ts`・`biomes.ts`、`SaveData`（`version` 1 のまま）、
  既存の ID・既存のブロック定義・既存のレシピ。

## 3. 使う ID

**209 を 1 個**（共有帯の次の空き。`ROADMAP.md` の予約表 198 行「209..255 予備」から取る）。取ったら予約表に行を足し、「予備」を 210..255（46 個）へ。
**1..63 の帯は使わない**（凍結）。

## 4. 判断をどのファイルに置くか

- 何から作るかは **`crafting.ts` の `RECIPES` だけ**（`shape: ["S", "S"], key: { S: SANDSTONE_SLAB }`）。
- ブロックの性質は `blocks.ts` の `def()` だけ。`variantOf` を書かない（アイテムは自動・掘ると自分が落ちる）。
- 新しい「確かめられないもの」は無い。`unverifiable-pair` は不要。手順は **`add-block` スキル**を名指しで渡す。
- 触る前に引く層 2: `grep -l '"src/blocks.ts"' rules/*.md` / `"src/crafting.ts"` / `"src/items.ts"` / `test/**` なので `rules/testing.md` も。

## 5. 書くテスト（値を出力してから判定）

`test/blocks.test.ts`（`stoneBrickVariants()` の形を写す）:
1. 名前「彫刻された砂岩」・アイテム名が同じ・`variantOf === AIR`・`placedBlock(209) === 209`・`model === "cube"`（値を `console.log`）。
2. 硬さ・道具・段階が**砂岩(24) と同じ**。
3. ID は 209・`MAX_ITEM_ID === 209`。共有帯の並びの突き合わせを 1 要素伸ばす（判定はゆるめず、足すだけ）。
4. **色**は砂岩・滑らかな砂岩・砂・砂利などの既存の色から **20 以上離れる**ことを総当たりで測って選ぶ（`rules/items-survival.md`。割ったら色相か明るさをずらし、
   ずらした値を `TUNING.md` に書く。20 はゆるめない）。測った最小距離を `console.log`。

`test/crafting.test.ts`: 「ハーフ 2 枚を縦に → 彫刻された砂岩 1 個 / 3x3 の中央の縦 2 枚でも作れる / 横並び・1 枚では作れない / 石レンガのハーフ 2 枚は
彫刻された石レンガのまま（衝突しない）」（891 行の形）。

## 6. このタスク固有の禁じ手

- **既存のレシピ（砂岩 4 個 → 砂岩ハーフ・階段・石レンガの彫刻）を書き換えない。** 砂岩のハーフの原料を変えない。
- 滑らかな砂岩のハーフ・階段は作らない。地形に湧かせない（`worldgen.ts` 0 行）。
- `main.ts` / `hands.ts` に 1 行も足さない。既存テストの判定をゆるめない。

## 7. 終了条件

`npm run typecheck` / `npm test` / `npm run build` が緑 / コミット 1 つ / `TUNING.md` に色の 1 行 / `ROADMAP.md` の予約表（209 実装済み・予備 46 個）/
`npm run shot -- bricks` で砂岩 3 種を並べて撮って `Read` で見る / 落とし穴があれば `rules/` へ（無ければ「決まりごと 0 件」）。
