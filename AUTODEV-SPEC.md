# 仕様: 滑らかな砂岩（キューの 64・**ID 1 個**）

状態: 済
差し戻し: 0 回

## 0. 数え直した結果（170 の B）

- `blocks.ts` に `SANDSTONE`(24) / `SANDSTONE_SLAB`(31) / `SANDSTONE_STAIRS`(36) はあるが、**滑らかな砂岩は無い**（`SMOOTH` を含む定数 0 件）。
- `smelting.ts` の `SMELTING` に砂岩の行は無い（砂 → ガラスだけ）。
- 共有帯の次の空きは **208**（`CRACKED_STONE_BRICK` = 207 が最後・`MAX_ITEM_ID` = 207）。
- 手本は **63 の「ひび割れた石レンガ」**（`blocks.ts` 778 行の定数と 2025 行の `def()`・`smelting.ts` 108 行の 1 行・`test/blocks.test.ts` 5274 行 `stoneBrickVariants()`・
  `test/smelting.test.ts` 146 行・`tools/shot.ts` 1320 行の場面）。

## 1. 何を足すか・完了の判定

**滑らかな砂岩（立方体）を 1 つ足し、砂岩をかまどで焼くと 1 個得られる**（本家 Beta 1.8）。`npm test` に「滑らかな砂岩（208・立方体）」の節と
精錬の 1 項目が増えて緑、項目数が増える。

## 2. 触るファイル / 触らないファイル

- 触る: `src/blocks.ts`（定数 + `def()` 1 つ）、`src/items.ts`（`MAX_ITEM_ID` を 208 へ）、`src/smelting.ts`（import と `SMELTING` に 1 行）、
  `test/blocks.test.ts`（新しい節 + 「共有帯の並び」の突き合わせ 450〜452 行付近に 1 要素）、`test/smelting.test.ts`、
  `tools/shot.ts`（場面 `stonebrick` に並べるか、新しい場面 `sandstone`）、`ROADMAP.md`（208 を「実装済み」・次の空きを 209 へ）、`TUNING.md`（色 1 行）。
- 触らない: **`src/main.ts`・`src/hands.ts`**、`crafting.ts`（レシピは足さない）、`worldgen.ts`・`biomes.ts`（地形には湧かせない）、`SaveData`（`version` 1 のまま）、
  既存の ID・既存のブロック定義・既存の `SMELTING` / `FUEL` の行。

## 3. 使う ID

**208 を 1 個**（共有帯の次の空き。`ROADMAP.md` の予約表 197 行「208..255 予備」から取る）。取ったら予約表に行を足し、「予備」を 209..255（47 個）へ。
**`blocks.ts` の 1..63 の帯は使わない**（アイテムとブロックで同じ番号になる凍結帯なので、111 以降から取る決まり）。

## 4. 判断をどのファイルに置くか

- 何が何に焼けるかは **`smelting.ts` の `SMELTING` だけ**（`[SANDSTONE, { out: SMOOTH_SANDSTONE, count: 1 }]`）。`FUEL` には足さない。
- ブロックの性質は `blocks.ts` の `def()` だけ。`variantOf` を書かない（アイテムは自動・掘ると自分が落ちる）。
- 新しい「確かめられないもの」は無い。`unverifiable-pair` は不要。手順は **`add-block` スキル**を名指しで渡す。
- 触る前に引く層 2: `grep -l '"src/blocks.ts"' rules/*.md` / `"src/smelting.ts"` / `"src/items.ts"` / `test/**` なので `rules/testing.md` も。

## 5. 書くテスト（値を出力してから判定）

`test/blocks.test.ts`（`stoneBrickVariants()` の形を写す）:
1. 名前「滑らかな砂岩」・アイテム名が同じ・`variantOf === AIR`・`placedBlock(208) === 208`・`model === "cube"`（値を `console.log`）。
2. 硬さ・道具・段階が**砂岩(24) と同じ**（`d.hardness === base.hardness && d.tool === base.tool && d.minTier === base.minTier`）。
3. ID は 208・`MAX_ITEM_ID === 208`。**共有帯の並びの突き合わせ**（450 行付近の `sharedItems[85] === SMOOTH_SANDSTONE`）を 1 要素伸ばす（判定はゆるめず、足すだけ）。
4. **色**は砂岩・砂・砂利などの既存の色から **20 以上離れる**ことを総当たりで測って選ぶ（`rules/items-survival.md` の判定と同じ土俵。割ったら色相か明るさをずらし、
   ずらした値を `TUNING.md` に書く。判定の 20 はゆるめない）。測った最小距離を `console.log`。

`test/smelting.test.ts`: 「砂岩 → 滑らかな砂岩 1 個・燃料ではない・滑らかな砂岩は焼けない」（石レンガの項目 146〜150 行と同じ形）。

## 6. このタスク固有の禁じ手

- **既存の `SMELTING` の行（砂 → ガラス・石レンガ → ひび割れ …）を書き換えない。**
- **砂岩のハーフ・階段（31 / 36）の原料を変えない**。滑らかな砂岩のハーフ・階段・彫刻された砂岩（キュー 66）はここでは作らない。
- 地形・生成に湧かせない（`worldgen.ts` 0 行）。クラフトレシピを足さない（入口は精錬の 1 行だけ）。
- `main.ts` / `hands.ts` に 1 行も足さない。既存テストの判定をゆるめない。

## 7. 終了条件

`npm run typecheck` / `npm test` / `npm run build` が緑 / コミット 1 つ / `TUNING.md` に色の 1 行 / `ROADMAP.md` の予約表（208 実装済み・予備 47 個）/
`npm run shot` で滑らかな砂岩を砂岩と並べて撮って `Read` で見る / 落とし穴があれば `rules/` へ（無ければ「決まりごと 0 件」）。
