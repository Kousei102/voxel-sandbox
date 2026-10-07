# 仕様: テラコッタ（キューの 67・**ID 1 個**）

状態: 未着手
差し戻し: 0 回

## 0. 数え直した結果（173 の B）

- `blocks.ts` に `CLAY`(168) はあるが、**テラコッタは無い**（`TERRACOTTA` も「テラコッタ」も 0 件）。
- `smelting.ts` の `SMELTING` は **14 行**（最後の行が `[SANDSTONE, SMOOTH_SANDSTONE]`）。粘土**ブロック**を焼く行は無い（粘土玉 → レンガの 1 行だけ）。
- 共有帯の次の空きは **210**（`CHISELED_SANDSTONE` = 209 が最後・`MAX_ITEM_ID` = 209）。共有帯のアイテムは 87 個。
- 手本は **64 の「滑らかな砂岩」**（精錬で得る立方体）: `blocks.ts` の定数と `def()`・`smelting.ts` の 1 行・`test/blocks.test.ts` の `smoothSandstone()`・
  `test/smelting.test.ts` 156 行付近と 250 行の件数・`tools/shot.ts` の場面。

## 1. 何を足すか・完了の判定

**テラコッタ（立方体）を 1 つ足し、粘土ブロック(168) をかまどで焼くと 1 個得られる**（本家 Beta 1.8。色は 1 色のみ・染色は見送り）。
`npm test` に「テラコッタ（210・立方体）」の節と精錬の 1 節が増え、`SMELTING` は 15 行になり、項目数が増えて緑。

## 2. 触るファイル / 触らないファイル

- 触る: `src/blocks.ts`（定数 + `def()` 1 つ）、`src/smelting.ts`（import と `SMELTING` に 1 行）、`test/blocks.test.ts`（新しい節 + 共有帯の並びの突き合わせ
  〔`sharedItems[87] === TERRACOTTA`・件数 88・`MAX_ITEM_ID === TERRACOTTA`〕）、`test/smelting.test.ts`（節 + 250 行の件数を 15 へ）、
  `tools/shot.ts`（場面に並べる）、`ROADMAP.md`（210 を「実装済み」・予備を 211..255 の 45 個へ）、`TUNING.md`（色 1 行）。
- `src/items.ts` は **`MAX_ITEM_ID` の右辺が 714 行で `CHISELED_SANDSTONE`** なので、**そこを `TERRACOTTA` へ置き換える**（import も）。他は触らない。
- 触らない: **`src/main.ts`・`src/hands.ts`**、`crafting.ts`、`worldgen.ts`・`biomes.ts`、`SaveData`（`version` 1 のまま）、既存の ID・既存のブロック定義・既存の精錬表の行。

## 3. 使う ID

**210 を 1 個**（共有帯の次の空き。`ROADMAP.md` の予約表 199 行「210..255 予備」から取る）。取ったら予約表に行を足し、「予備」を 211..255（45 個）へ。
**1..63 の帯は使わない**（凍結）。

## 4. 判断をどのファイルに置くか

- 何を焼くと何になるかは **`smelting.ts` の `SMELTING` だけ**（`[CLAY, { out: TERRACOTTA, count: 1 }]`）。**`FUEL` には 1 行も足さない**（粘土もテラコッタも燃料ではない）。
- ブロックの性質は `blocks.ts` の `def()` だけ。`variantOf` を書かない（アイテムは自動・掘ると自分が落ちる）。
- 新しい「確かめられないもの」は無い。`unverifiable-pair` は不要。手順は **`add-block` スキル**を名指しで渡す。
- 触る前に引く層 2: `grep -l '"src/blocks.ts"' rules/*.md` / `"src/smelting.ts"` / `"src/items.ts"` / `test/**` なので `rules/testing.md` も。

## 5. 書くテスト（値を出力してから判定）

`test/blocks.test.ts`（`smoothSandstone()` の形を写す）:
1. 名前「テラコッタ」・アイテム名が同じ・`variantOf === AIR`・`placedBlock(210) === 210`・`model === "cube"`（値を `console.log`）。
2. 硬さ **1.25**・道具 pickaxe・段階 木（本家 Beta 1.8 のテラコッタは 1.25）。
3. ID は 210・`MAX_ITEM_ID === 210`。共有帯の並びの突き合わせを 1 要素伸ばす（判定はゆるめず、足すだけ）。
4. **色**は既存のブロック上面色から **20 以上離れる**ことを総当たりで測って選ぶ（`rules/items-survival.md`。赤茶は埋まっているので割る見込みが高い。
   割ったら色相か明るさをずらし、ずらした値を `TUNING.md` に書く。20 はゆるめない）。測った最小距離を `console.log`。**候補の出発点: 上 `0x9a5e44`（赤茶）。**

`test/smelting.test.ts`: 「粘土ブロックを焼くとテラコッタ 1 個 / テラコッタ・粘土は燃料でない / テラコッタはさらには焼けない / 粘土玉 → レンガの行はそのまま」。

## 6. このタスク固有の禁じ手

- **既存の精錬表の行（粘土玉 → レンガ など）を書き換えない。** `FUEL` を触らない。
- 染色・色違いのテラコッタ・彩釉テラコッタは作らない。地形（メサ・バッドランド）に湧かせない（`worldgen.ts` 0 行）。
- `main.ts` / `hands.ts` に 1 行も足さない。既存テストの判定をゆるめない（精錬表の件数は 14 → 15 に**数え直す**）。

## 7. 終了条件

`npm run typecheck` / `npm test` / `npm run build` が緑 / コミット 1 つ / `TUNING.md` に色の 1 行 / `ROADMAP.md` の予約表（210 実装済み・予備 45 個）/
`npm run shot -- bricks` などで砂岩・粘土と並べて撮って `Read` で見る / 落とし穴があれば `rules/` へ（無ければ「決まりごと 0 件」）。
