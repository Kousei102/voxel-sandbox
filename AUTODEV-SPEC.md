# 仕様: ネザーレンガ（アイテム）— ネザーラックを焼いて 1 個 / 4 個の 2x2 でネザーレンガのブロック（キューの 57・**ID 1 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（2026-09-30・AUTODEV 148 の B）: **ネザーレンガの「アイテム」は無い**
（`items.ts` に定数も `item()` も無し。ブロック `NETHER_BRICK`(48) は `blocks.ts` の低帯で、for が同じ番号のアイテムを自動で付けている）。
`SMELTING` に `NETHERRACK`(45) の行は**無い**（11 行）。**`NETHER_BRICK`(48) を出力するレシピは 0 本**で、
`test/crafting.test.ts` の 1015 行が「ネザーレンガそのもののレシピは 1 本も無い（要塞から掘るだけ）」を `=== 0` で押さえている（下の 5. で書き換える）。
**形はまったく同じ前例がある**: 粘土玉 →（焼く）→ レンガ `BRICK_ITEM`(170) → 4 個の 2x2 → レンガブロック `BRICK`(12)。
このとき**ブロックの表示名を「レンガブロック」に直した**（`blocks.ts` 1671 行・`test/blocks.test.ts` の `brickNames()`）。今回も同じ扱い。

**本家の値**: ネザーラック 1 個を焼いてネザーレンガ 1 個（本家 1.0）/ ネザーレンガ 4 個の 2x2 でネザーレンガ（ブロック）1 個。

## 1. 何を足すか / 完了の判定

**アイテム 1 つ（ID 199）・精錬 1 行・レシピ 1 本・ブロック 48 の表示名 1 か所。** 生成・画面・`main.ts` / `hands.ts` は 1 行も触りません。
**完了**: `npm test` に「ネザーレンガ（57）」の件が **5〜8 件**増えて**すべて緑**（**4157 → 4162〜4165 あたり**）。
ブロック ID の枠の行は **「111..255 の空き 56」**（57 → 56）・1..63 の空き 7 のまま。`MAX_ITEM_ID` は **199**。

## 2. 触るファイル / 触らないファイル

**触る**:
- `src/items.ts`:
  - `export const NETHER_BRICK_ITEM = 199;` と JSDoc（`BRICK_ITEM` の説明を写す形。**定数名を `NETHER_BRICK` にしないこと** —— `blocks.ts` の 48 と衝突して
    `crafting.ts` / `smelting.ts` が両方 import した瞬間に typecheck が落ちる。**置けず・道具でも食べ物でもない・`FUEL` に足さない**）
  - `item({ id: NETHER_BRICK_ITEM, name: "ネザーレンガ", block: AIR, stack: MAX_STACK, color: <測った値>, tool: null });`（`BRICK_ITEM` の `item()` の近く）
  - **`MAX_ITEM_ID` を `NETHER_BRICK_ITEM` に**（いまは `BIRCH_SAPLING` = 198）
- `src/smelting.ts`: `SMELTING` に `[NETHERRACK, { out: NETHER_BRICK_ITEM, count: 1 }]` の 1 行（`CLAY_BALL` の行の後ろ）とコメント 2〜3 行
  （**この 1 行が、要塞で掘るしか無かったネザーレンガのブロックへの入口** / `FUEL` には足していない）と import
- `src/crafting.ts`: `{ name: "ネザーレンガ", out: NETHER_BRICK, count: 1, shape: ["BB", "BB"], key: { B: NETHER_BRICK_ITEM } }` の 1 本
  （「レンガブロック」の行の後ろ。**レシピ名はブロックの表示名と揃えること** —— 下の「ネザーレンガブロック」）とコメントと import
- `src/blocks.ts`: `def(NETHER_BRICK, "ネザーレンガ", …)` の**表示名だけ**を `"ネザーレンガブロック"` に（`BRICK` の 1671 行と同じ理由のコメント 2〜3 行）。
  **ID・色・硬さ・`slabPair()` の「ネザーレンガハーフ」・フェンスの名前は触らない**
- `test/smelting.test.ts` / `test/crafting.test.ts` / `test/blocks.test.ts` / `test/items.test.ts`（下の 5.）
- `ROADMAP.md` の予約表（199 を「実装済み」の 1 行に・**「199..255 予備 57 個」を「200..255 予備 56 個」に**）/ `TUNING.md`（下の 7.）/ `rules/items-survival.md`（下の 6.）

**触らない**: `src/main.ts` / `src/hands.ts` / `src/fortress.ts` / `src/nethergen.ts` / `src/mobs.ts` / `src/craftscreen.ts` / `src/inventoryui.ts` /
`src/furnaces.ts` / `test/progression.test.ts` / `test/fortress.test.ts`。**`.claude/**` には 1 行も書かないこと。**

## 3. 使う ID

**1 個: 199**（共有帯の次の空き。`ROADMAP.md` の予約表の `199..255` 行から取る）。**アイテムだけ**で、ブロック側の 199 には何も置かない。
**111 以降はブロックとアイテムで 1 本の番号列** —— `blocks.ts` に 199 が無いことを grep で確かめてから取ること（`test/blocks.test.ts` が両側を突き合わせる）。

## 4. 判断をどのファイルに置くか

- **何を焼くと何になるか** → `smelting.ts` の `SMELTING` / **何個で何を組むか** → `crafting.ts` の `RECIPES` / **アイテムの性質と色** → `items.ts`
- 画面（`craftscreen.ts` / `inventoryui.ts`）に `NETHERRACK` や `NETHER_BRICK_ITEM` の分岐を**書かないこと** —— シフトクリックの行き先は `isSmeltable()` が決める
- 新しい確かめられないものは無し。**使えるスキル**: `add-block`（アイテムを足す手順。**ID の取り方と `MAX_ITEM_ID` の突き合わせ**はここに書いてある）
- **引いて読む rules**: `grep -l '"src/items.ts"' rules/*.md`（items-survival / vitals）・`"src/smelting.ts"`（inventory-screen / stateful-blocks）・
  `"src/crafting.ts"`・`"src/blocks.ts"`（beds / blocks-shapes / items-survival）と、`test/**` を触るので `rules/testing.md`

**色**: 候補 **`0x602034`**（深い赤紫）。B の周に総当たりで測った: いちばん近いのは**ソウルサンド(46) `0x51392c` で 30.2**・
ブロック 48 `0x392229` とは約 40・フェンス(187) `0x6e3746` とは約 32。**割った候補**: `0x6a3139`（フェンスと 14.9）・`0x74303a`（ネザーラックと 11.8）・
`0x5a2c33`（ソウルサンドと 17.3）。**実装の周で `allItemIds()` 全部と測り直し、20 を割ったらずらして `TUNING.md` に書くこと**（判定はゆるめない）。

## 5. 書くテスト（**値を出力してから判定**）

`test/smelting.test.ts` の末尾の塊の後ろに `// --- ネザーレンガ（57）---` の塊:
1. **ネザーラック 1 個 → ネザーレンガ 1 個**（`smeltResultOf(NETHERRACK)` などを出してから `out === NETHER_BRICK_ITEM && count === 1`）
2. **かまどで実際に焼ける**: 既存の `loaded(NETHERRACK, 1, COAL, 1)` の書き方を写し、`SMELT_TIME` ぶん `tickFurnace` → 出力枠がネザーレンガ 1 個
3. **ネザーレンガ（アイテム）もネザーラックも燃料でない**（`fuelTimeOf(...) === 0`）/ **ネザーレンガそのものは焼けない**（`isSmeltable(NETHER_BRICK_ITEM) === false`）
4. 既存の「焼けるものの表は 11 行」→ **「12 行（57 で 1 行増えた）」**（`===` のまま）

`test/crafting.test.ts`（ネザーレンガのフェンスの塊の後ろ）:
5. **ネザーレンガ 4 個の 2x2 → ネザーレンガブロック（48）1 個**・**手持ちの 2x2 で作れる**（`findRecipe(grid(2, ["BB","BB"], …), 2)`）
6. **ブロック 48 を 4 個並べても何も作れない**（材料がアイテム 199 であって、ブロックではないこと）
7. 既存の件を**意味を保って書き換える**（**ゆるめではない。仕様書が先に名指しします**）:
   - 「ネザーレンガそのもののレシピは 1 本も無い（要塞から掘るだけ）」→ **「ネザーレンガブロックのレシピはちょうど 1 本（57 の 2x2）」**（`=== 1`）
   - 「レシピは 95 本」→ **「96 本（57 の 2x2 で 1 本増えた）」**（`===` のまま）

`test/blocks.test.ts` / `test/items.test.ts`:
8. **名前の対**（`brickNames()` と同じ形の 1 件）: `blockName(NETHER_BRICK) === "ネザーレンガブロック" && itemName(NETHER_BRICK_ITEM) === "ネザーレンガ"` と、2 つが別の文字列
9. **色**: 199 の色を `allItemIds()` 全部と測って**いちばん近い相手と距離を出してから** `>= 20`（`GLOWSTONE_DUST` の件を写す）
10. 既存の件の数え直し（**比べる相手を新しい番号に直すこと** —— 古いまま残すと TS2367。`rules/testing.md`）:
    `MAX_ITEM_ID === BIRCH_SAPLING`（blocks.test.ts 426 行・items.test.ts 888 行）→ `NETHER_BRICK_ITEM` /
    共有帯の一覧 `sharedItems[77] === NETHER_BRICK_ITEM` / 「111..255 の空きは 57」→ **56**

**足す前に `test/` を定数名で grep すること**（`SMELTING.size` / `RECIPES.length` / `MAX_ITEM_ID` / `NETHER_BRICK` / `NETHERRACK` / `sharedFree` /
`"ネザーレンガ"`）。上の 7. と 10. のほかに赤くなったら、**判定を読んでから**「意味を保った書き換え」か「退行」かを決めること。
**「ネザーレンガ」は 6 文字で一覧の `.slot .label` が 2 行に折れる**側（既知 60 枠。見張りがあれば 61 に数え直す）。

## 6. このタスク固有の禁じ手

- **ブロック 48 の ID・色・硬さ・落とす物を変えない**（名前だけ）/ **`fortress.ts` の建て方を変えない** / **ネザーラックのドロップを変えない**
- **`FUEL` に 1 行も足さない**（ネザーラックは本家で燃えない —— 火が消えない性質はブロックの話で、燃料ではない）
- **ネザーレンガのフェンス・ハーフのレシピの材料をアイテム 199 へ差し替えない**（いまはブロック 48 が材料。本家 1.0 の形と違っても今回は触らない。`docs/autodev-log.md` に 1 行）
- **定数名を `NETHER_BRICK` にしない** / **アイテム 199 を置けるようにしない**（`block: AIR`）
- **判定をゆるめない**（`SMELTING.size` / `RECIPES.length` / 空きは `===`）
- **古くなる rules を放っておかない**: `rules/items-survival.md` に「焼いて作る材料アイテムの定数名は `*_ITEM`・ブロックの表示名に『ブロック』を付ける」の
  前例を 170 と 199 の 2 件として 1〜2 行（既にあれば 199 を足すだけ）

## 7. 終了条件

- `npm run typecheck` と `npm test` が緑（**4162〜4165 件あたり**）/ `npm run build` 緑（`src/**` を触るので）
- **コミット 1 つ**（`AUTODEV 149（C の周）: 57 ネザーレンガ（アイテム・ID 199）` の形）→ `master` へ push
- `TUNING.md` の末尾の表に 1 行: **ネザーレンガ（199）の色**（測った値と、いちばん近い相手・距離）
- `ROADMAP.md` の予約表に 199 を「実装済み」/ `AUTODEV-QUEUE.md` の 57 の行を消す / この仕様書を `状態: 済` / `docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す
- **一覧に 1 枠増えるので撮ること**（C-3。本物のブラウザの一覧で 199 枠目の色と名前・console のエラー 0 件）。地形は変わらない（`npm run shot -- terrain` の md5 が前と同一）
