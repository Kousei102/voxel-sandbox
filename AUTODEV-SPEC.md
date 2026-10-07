# 仕様: 石の壁（キューの 68・**ID 1 個**）

状態: 未着手
差し戻し: 0 回

## 0. 数え直した結果（176 の B）

- `src/` `test/` `tools/` に「石の壁」「STONE_WALL」「COBBLE_WALL」は **0 件**（未実装）。
- 共有帯の次の空きは **211**（`TERRACOTTA` = 210 が最後・`MAX_ITEM_ID` = `TERRACOTTA`・`items.ts` 714 行）。共有帯のアイテムは 88 個。
- 手本は **`NETHER_BRICK_FENCE`(187)**（2 つ目のフェンス）: `blocks.ts` の定数（コメント付き）と `def()`（2353 行付近）・`crafting.ts` 340 行付近の 1 本・
  `test/blocks.test.ts` の `netherBrickFences()`（2160 行付近）と共有帯の突き合わせ（440 行付近。`sharedItems[85]` = 滑らかな砂岩 まで）・
  `test/crafting.test.ts` 1094 行付近・`tools/shot.ts` の場面 `fence`（975 行）。
- 形も当たり判定も繋がり方も `FENCE_BOXES` / `FENCE_COLLISION_BOX` / `fenceConnects()` / `isTallCollision()` の**表 1 本**を指すので、`mesher.ts` は ±0 行。

## 1. 何を足すか・完了の判定

**石の壁（フェンスと同じ形・同じ当たり判定のブロック）を 1 つ足し、丸石 6 個（3x2）で 6 個得られる**（本家 Alpha の丸石の壁・本家のレシピも 6 個）。
`npm test` に「石の壁（211）」の節とクラフトの 1 節が増え、レシピが 1 本増え、項目数が増えて緑。ここでの壁は**見た目も当たり判定もフェンスと同じ**（本家の太い壁の形は見送り）。

## 2. 触るファイル / 触らないファイル

- 触る: `src/blocks.ts`（定数 `STONE_WALL = 211` + コメント + `def()` 1 つ）、`src/crafting.ts`（import と `RECIPES` に 1 本）、`src/items.ts`（**714 行の `MAX_ITEM_ID` の右辺を `STONE_WALL` へ**・import も）、
  `test/blocks.test.ts`（新しい節 + 共有帯の突き合わせを 1 要素伸ばす〔`sharedItems[88] === STONE_WALL`・件数 89・`MAX_ITEM_ID === STONE_WALL`〕。ネザーレンガのフェンスの `tall` 配列 2 → 3 の数え直しも）、
  `test/crafting.test.ts`（レシピ 1 節・レシピ総数の数え直し）、`tools/shot.ts`（場面 `fence` に石の壁を 1 本足す、または新しい場面）、`ROADMAP.md`（211 を「実装済み」・予備を 212..255 の 44 個へ）、`TUNING.md`（色 1 行）。
- 触らない: **`src/main.ts`・`src/hands.ts`・`src/mesher.ts`**、`worldgen.ts`・`biomes.ts`、`SaveData`（`version` 1 のまま）、既存の ID・既存のブロック定義・既存のレシピ。
  **`fenceConnects()` / `isTallCollision()` に `id === STONE_WALL` を書き足さない。**

## 3. 使う ID

**211 を 1 個**（共有帯の次の空き。`ROADMAP.md` の予約表 200 行「211..255 予備」から取る）。取ったら予約表に行を足し、「予備」を 212..255（44 個）へ。**1..63 の帯は使わない**（凍結）。

## 4. 判断をどのファイルに置くか

- ブロックの性質は `blocks.ts` の `def()` だけ。`model: "fence"` / `boxes: FENCE_BOXES` / `collision: FENCE_COLLISION_BOX` で**配列は 187 と同じものを指す**（写して 2 本目を作らない）。
  `tool: "pickaxe"`・`minTier: TIER_WOOD`・硬さ **2**（丸石 4 の写し。本家の壁も 2）・`sound` は書かない（既定 `"stone"`）・`variantOf` は書かない。
- レシピは `crafting.ts` の `RECIPES` だけ（`shape: ["CCC","CCC"]`・`key: { C: COBBLE }`・`count: 6`）。形は 3x2 で木のフェンス・ネザーレンガのフェンスと同形だが**材料が別なので重複にならない**。
- 新しい「確かめられないもの」は無い。`unverifiable-pair` は不要。手順は **`add-block` スキル**を名指しで渡す。
- 触る前に引く層 2: `grep -l '"src/blocks.ts"' rules/*.md` / `"src/crafting.ts"` / `"src/items.ts"` / `test/**` なので `rules/testing.md` も。

## 5. 書くテスト（値を出力してから判定）

`test/blocks.test.ts`（`netherBrickFences()` の形を写す）:
1. 名前「石の壁」・アイテム名が同じ・`model === "fence"`・`isProp`・`!opaque`・`solid`・`variantOf === AIR`・`placedBlock(211) === 211`（値を `console.log`）。
2. `shapeBoxes` と `collisionBoxes` が 157 と**同じ配列**（`===`）。`isTallCollision(STONE_WALL)`・`fenceConnects(STONE_WALL)` が true（表に聞くだけで通ること）。
3. 硬さ 2・pickaxe・`TIER_WOOD`・**素手では落ちない**（`canHarvest` が false / 木のツルハシで true）・掘ると自分が 1 個落ちる。
4. ID は 211・`MAX_ITEM_ID === 211`。共有帯の並びの突き合わせを 1 要素伸ばす（判定はゆるめず、足すだけ）。
5. **色**は既存のブロック上面色・アイテム色から **20 以上離れる**ことを総当たりで測って選ぶ（`rules/items-survival.md`）。**丸石 `0x767b82` の灰は埋まっている**ので、素直な写しは隔たり 0.0 で落ちる見込み。
   少し暗くした灰青から出発してずらし、ずらした値を `TUNING.md` に書く。20 はゆるめない。測った最小距離を `console.log`。
`test/crafting.test.ts`: 丸石 6 個 → 6 本 / 3x2 / 木のフェンス（棒）・ネザーレンガのフェンスと衝突しない / レシピ総数を数え直す。

## 6. このタスク固有の禁じ手

- **壁専用の形・柱の高さ・太さを新しく書かない**（本家の壁は柱が太いが、ここはフェンスと同じ形。違うと `fenceConnects` / `physics.ts` / `mesher.ts` に分岐が漏れる）。
- 既存のフェンスの定義・レシピ（`count: 2` / `6`）を書き換えない。丸石の階段・ハーフのレシピに触らない。自然生成させない（`worldgen.ts` 0 行）。
- 苔むした丸石の壁は作らない。`main.ts` / `hands.ts` に 1 行も足さない。既存テストの判定をゆるめない（件数は数え直す）。

## 7. 終了条件

`npm run typecheck` / `npm test` / `npm run build` が緑 / コミット 1 つ / `TUNING.md` に色の 1 行 / `ROADMAP.md` の予約表（211 実装済み・予備 44 個）/
`npm run shot -- fence` などでフェンスと並べて撮って `Read` で見る / 落とし穴があれば `rules/` へ（無ければ「決まりごと 0 件」）。
