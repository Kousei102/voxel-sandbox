# 仕様: 石炭ブロック（キューの 42・**ID 1 個 = 188**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: `COAL_BLOCK` は `src/**` に
**1 行もありません**（`COAL`(65) は松明のレシピと `FUEL` の 1 行だけ、`COAL_ORE`(14) は
掘ると石炭が 1 個落ちるだけ）。

## 1. 何を足すか / 完了の判定

**石炭 9 個をしまう立方体**（本家 1.6.1）。**鉄・金・ダイヤの立方体（135..137）と同じ
「9 個でしまう / 形なしで戻す」**に、**`FUEL` の 1 行**（本家と同じ **800 秒 = 80 個ぶん**）が
付くだけ。**`main.ts` も自然生成も 0 行**（掘って出るのは石炭鉱石だけ）。**完了**: `npm test` に
**「石炭ブロック（ブロック 188）」の節**が増えて**すべて緑**（**+15 件前後。3882 → 3897
あたり**）。**数え直す既存の件が 6 つ**（下の 5）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts`（ID 1 つと `def()` 1 つ）/ `src/crafting.ts`（レシピ **2 本**）/
`src/smelting.ts`（**`FUEL` の 1 行と import 1 つ**）/ `src/items.ts`（**`MAX_ITEM_ID` の 1 行**と、
**483 行の「`FUEL` の最大値は 80 のまま」の注記**）/ `test/{blocks,crafting,smelting,items}.test.ts` /
`tools/shot.ts`（**場面を 1 つ足す**）/ `ROADMAP.md` / `TUNING.md` / `AUTODEV-QUEUE.md` /
`docs/autodev-log.md` / `HANDOFF.md`。

**触らない**: **`src/main.ts`（1 行も）** / `src/worldgen.ts` / `src/mesher.ts` / `src/furnaces.ts` /
`src/craftscreen.ts` / `src/inventoryui.ts` / `DROPS` / `SMELTING` / `SMELT_TIME` / `test/run.ts` /
**`COAL`(65) と `CHARCOAL`(163) の色・`FUEL` の既存 9 行**。

**先に引いて読むこと**（層 2 は自動では読み込まれません）: `rules/blocks-shapes.md` /
`rules/items-survival.md` / `rules/beds.md` / `rules/inventory-screen.md` / `rules/testing.md` /
`rules/meshing-render.md`（`grep -l` の当たりを全部）。

## 3. 使う ID

**`COAL_BLOCK = 188`**（`ROADMAP.md` の「**188..255 予備**」の次の空き。
**共有帯はブロックとアイテムで 1 本の番号列**なので、これで**両方**を取ります）。

- **`variantOf` を書かない** → `items.ts` の for が**同じ番号のアイテム 188** を作る
- **`MAX_ITEM_ID` を `NETHER_BRICK_FENCE`(187) → `COAL_BLOCK`(188) へ手で伸ばすこと**
  （伸ばさないと一覧に 1 枠も出ません。**上限を持つのがブロック側なのは 12 度目**）
- **`ROADMAP.md` の予約表に 188 の行**（「**実装済み**」）/「188..255 予備 68」→「**189..255 予備 67**」

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも足しません**（`unverifiable-pair` は要りません）。判断は
**`blocks.ts` の `def()` 1 つ**・**`crafting.ts` の 2 行**・**`smelting.ts` の `FUEL` 1 行**だけです。

**`def(COAL_BLOCK, "石炭ブロック", { top: 0x100f0f }, { hardness: 5, tool: "pickaxe",
minTier: TIER_WOOD })`** —— **135..137 の 3 つと同じ並び**で、`opaque` / `solid` / `model` /
`sound` は**1 つも書かないこと**（既定の不透明な立方体・石の音。135..137 も書いていません）。
**硬さ 5・ツルハシ・木の階層は本家の値そのまま**（鉄は `TIER_STONE`、これは `TIER_WOOD` ——
**素手では 1 個も落ちません**。187 のネザーレンガのフェンスと同じ）。

**色（この周に 146 枠すべてと総当たりで測った値）**: **`0x100f0f` は本家の写しのまま判定を
越えます** —— いちばん近い**石炭(65) `0x23262b` から 40.9**（判定は 20）/ 黒曜石(43) 42.2 /
石炭鉱石(14) は 108.8。**⚠ 135..137 の「色は材料の色をそのまま写す」を写さないこと** ——
石炭の `0x23262b` を置くと**隔たり 0.0** で落ちます（`0x191919` は 24.4・`0x181a1f` は 20.2）。

**レシピ（`crafting.ts` に 2 行。135..137 の 338..343 行の真下に並べて書く）**。
**本家と同じ 9 → 1 → 9**で、名前は「石炭ブロック x1」= **全角 7.5 文字ぶん / 上限 12.5**:
`{ name: "石炭ブロック", out: COAL_BLOCK, count: 1, shape: ["CCC","CCC","CCC"], key: { C: COAL } }`
`{ name: "石炭", out: COAL, count: 9, ingredients: [COAL_BLOCK] }`

**燃料（`smelting.ts` の `FUEL` に `[COAL_BLOCK, SMELT_TIME * 80]` の 1 行。`COAL_BLOCK` は
`./blocks` から import）** —— **本家と同じ 800 秒 = 80 個ぶん = 石炭 10 個ぶん**（石炭 9 個で
しまえるので、しまうと 1 個ぶん得になるのが本家）。**`burnTotal` が炎ゲージの分母なので
`craftscreen.ts` も `furnaces.ts` も 0 行**（この周に実際に読んで確かめました）。

## 5. 書くテスト（**値を出力してから判定する**）

`test/blocks.test.ts` に **「石炭ブロック（ブロック 188）」の節**を 1 つ（**`storedBlocks()` の
3874 行の書き方を写して**、`describe()` から。**⚠ `stored` の表に 4 行目として足さないこと**
—— あの表には「色は材料の色をそのまま写している」の 1 件があり、石炭では**必ず落ちます**）:

- 表の値（`model === "cube"` / `variantOf === AIR` / `opaque` / `solid` / 硬さ 5 /
  ツルハシ / `minTier === TIER_WOOD` / `sound === "stone"`）
- **素手・木のツルハシ・鉄のツルハシの秒数を出してから**判定（**素手では落ちない**ことも 1 件）
- 掘ると**自分が 1 個返る**（`rollDrop` / `rollDrops`。`DROPS` に 0 行）/
  一覧に出る（`allItemIds`）/ `placedBlock(188) === 188` / 食べ物でも道具でもない
- **色**: 146 枠を回して**いちばん近い相手と隔たりを出してから** `>= 20`（2046 行の形）。
  **石炭(65) との隔たりは別の 1 件**（しまう元としまった先なので、まとめると読めない）

`test/crafting.test.ts` は **661 行の `stored` の表に `["石炭", COAL, COAL_BLOCK]` を足し**
（**`describe` を「…（鉄・金・ダイヤ・石炭）」へ**）、`test/smelting.test.ts` は**石炭ブロック
1 個 = 80 個ぶん = 石炭 10 個ぶん**を**値を出してから** 1 件（木炭 158 行の形）。

**数え直す既存の件が 6 つ**（**件名の末尾に「石炭ブロックが入ったので数え直した」と書くこと**。
**ゆるめないこと** —— 名指しの一覧は残したまま数だけ直します。`rules/testing.md`）:

- `test/blocks.test.ts` 279「共有帯のアイテムは…66 個」→ **67 個・末尾に
  `sharedItems[66] === COAL_BLOCK`**（一覧の文にも「石炭ブロック」を 1 語足す）
- 同 374 と `test/items.test.ts` 604 の **`MAX_ITEM_ID === NETHER_BRICK_FENCE`** → `COAL_BLOCK`
  （**比べる相手を新しい番号に直すこと** —— 古いままだと `tsc` が TS2367 で落ちます）
- 同 381「111..255 の空きは 68」→ **67** / `test/crafting.test.ts` 893
  **`RECIPES.length === 83`** → **85** / `test/smelting.test.ts` 205「燃料の表は 9 行」→ **10 行**
- 同 209 **「石炭がいちばん長持ちする」** → **2 件に割る**（**ゆるめない**）:
  **「石炭ブロックがいちばん長持ちする」**（`fuelTimeOf(COAL_BLOCK) === Math.max(...FUEL.values())`）と
  **「1 個もののなかでは石炭と木炭がいちばん長持ちする」**（`COAL_BLOCK` を除いた最大と等しい）

## 6. このタスク固有の禁じ手

- **`main.ts` に 1 行も足さないこと**（1450 行。止まる目安に並んでいます）
- **`SMELTING`（焼けるものの表）にも `worldgen.ts` にも `DROPS` にも 1 行も足さないこと**
  —— 石炭ブロックは**焼けず・自然に生えず**、`variantOf` を書かなければ自分が落ちます
- **`FUEL` の既存 9 行と、石炭(65) の色・名前を書き換えないこと**（80 秒は本家どおり）
- **`SaveData.version` は 1 のまま** / **色を測らずに選ばないこと**（判定はゆるめない）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` すべて緑** / `npm run build` 緑。**`bench` は不要**
- **C-3**: **`tools/shot.ts` に場面 `oreblocks` を 1 つ足して撮り、`Read` で見ること**
  （`ice`(800 行) の「平らな台」を写す。**石炭ブロックを鉄・金・ダイヤの隣**と
  **石炭鉱石(14)・黒曜石(43) の隣**に並べ、**カメラ寄り（`z` が大きい側）へ置くこと** ——
  `HANDOFF.md` の実測）。**ほぼ黒なので、AO と陰影で立方体の形が読めるか**・
  **隣の黒と見分けられるか**・**面の欠けと裏返りが無いか**を絵で見る
- **コミット 1 つを `master` へ push** / `AUTODEV-QUEUE.md` の 42 の行を消す / この仕様書を
  **`状態: 済`** に / `ROADMAP.md` の予約表に 188 / **`TUNING.md` に 1 行**（**燃料 800 秒 =
  80 個ぶん**が本家の写しであること）/ `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を書き直す**
