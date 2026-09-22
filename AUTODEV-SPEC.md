# 仕様: ネザーレンガのフェンス（キューの 41・**ID 1 個 = 187**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: `model: "fence"` を持つのは
**`FENCE`(157) の 1 つだけ**で、**ネザーレンガのフェンスは `src/**` に 1 行もありません。**

## 1. 何を足すか / 完了の判定

**ネザーレンガ（48）で作る 2 つ目のフェンス**（本家 Beta 1.9）。**形も当たり判定も 157 と
同じ配列を指し**、違うのは**色・道具・レシピ**だけ。`main.ts` は 0 行。

**完了**: `npm test` に **「ネザーレンガのフェンス（ブロック 187）」の節**が増えて**すべて緑**
（**+12 件前後。3867 → 3879 あたり**）。**数え直す既存の件が 6 つ**（下の 5）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts`（ID 1 つと `def()` 1 つ）/ `src/crafting.ts`（レシピ 1 行）/
`src/items.ts`（**`MAX_ITEM_ID` の 1 行だけ**）/ `test/blocks.test.ts` / `test/crafting.test.ts` /
`test/items.test.ts` / `tools/shot.ts`（`fence` の場面へ 2〜3 本）/ `ROADMAP.md` / `TUNING.md` /
`AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md`。

**触らない**: **`src/main.ts`（1 行も）** / `src/mesher.ts` / `src/placing.ts` / `src/world.ts` /
`src/physics.ts` / `fenceConnects()` / `isTallCollision()` / `FENCE_BOXES` / `FENCE_ARMS` /
`FENCE_COLLISION_BOX` / `DROPS` / `test/run.ts`（新しいテストファイルを作らないため）。

**先に引いて読むこと**（層 2 は自動では読み込まれません）:
`rules/blocks-shapes.md` / `rules/items-survival.md` / `rules/beds.md`（`blocks.ts`）/
`rules/inventory-screen.md`（`crafting.ts`）/ `rules/testing.md`（`test/**`）/
`rules/meshing-render.md`（`tools/shot.ts`）。

## 3. 使う ID

**`NETHER_BRICK_FENCE = 187`**（`ROADMAP.md` の「**187..255 予備**」の次の空き。
**共有帯はブロックとアイテムで 1 本の番号列**なので、これで**両方**を取ります）。

- **`variantOf` を書かない** → ブロック → アイテムの for が**同じ番号のアイテム 187** を作る
- **`MAX_ITEM_ID` を `VINE_ZN`(186) → `NETHER_BRICK_FENCE`(187) へ手で伸ばすこと**
  （ツタ 34a と同じ形。伸ばさないと一覧に 1 枠も出ません）
- 実装したら **`ROADMAP.md` の予約表に 187 の行**を足して「**実装済み**」と書く。**空きは 69 → 68**

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも足しません**（`unverifiable-pair` は要りません）。
形も当たり判定も **`blocks.ts` の表 1 本**で、`mesher.ts` は `fenceConnects()` に聞くだけです。

**`def()` で 157 から変えるのは 3 つだけ**（ほかは 1 文字も変えない）:

- **`top: 0x6e3746`**（下の色。**`side` / `bottom` は書かない**）
- **`tool: "pickaxe"` と `minTier: TIER_WOOD`**（元のネザーレンガ 48 の写し。**斧ではない**）
- **`sound` は書かないこと**（既定が `"stone"`。48 も書いていません）
- **同じにするもの**: `opaque: false` / `solid: true` / `hardness: 2` / `model: "fence"` /
  `boxes: FENCE_BOXES` / `collision: FENCE_COLLISION_BOX`
- **`blocksSky` / `replaceable` / `stacksOnSelf` / `variantOf` / `supportFace` / `spiky` /
  `sticky` は 1 つも書かないこと**（157 の上のコメントがそのまま掛かります）

**色（この周に 145 枠すべてと総当たりで測った値）**: `0x6e3746` の**いちばん近い相手は
ネザーラック(45) `0x7a3230` で 25.6**（判定は 20）。ネザーレンガ(48) から **64.0** /
フェンス(157) `0x988a5e` から **96.1** / レンガブロック(12) から **62.2** / レンガ(170) から **87.7**。
**素直な写し `0x392229` は 48 と 0.0、`0x4a2b33` はソウルサンド(46) と 17.1 で割ります。**
→ **ずらした値なので `TUNING.md` に 1 行**（「48 の写しでは一覧で見分けが付かないので
暗い赤紫へ寄せた。いちばん近いネザーラックから 25.6」）。

**レシピ（`crafting.ts` に 1 行）**:
`{ name: "ネザーレンガのフェンス", out: NETHER_BRICK_FENCE, count: 6, shape: ["NNN", "NNN"], key: { N: NETHER_BRICK } }`
**本家 Beta 1.9 と同じ 6 個 → 6 本**。**木のフェンス（棒 6 → 2 本）の `count` を写さないこと。**
**ネザーレンガそのもののレシピは足さないこと**（要塞から掘るだけ。`crafting.ts` の 170 行）。

## 5. 書くテスト（**値を出力してから判定する**）

`test/blocks.test.ts` に **「ネザーレンガのフェンス（ブロック 187）」の節**を 1 つ
（**157 の節を写して**、`describe()` から）:

- 表の値（`model` / `isProp` / `opaque` / `solid` / **`boxes` と `collision` が 157 と
  同じ配列を指すこと** / `supportFace === NO_SUPPORT`）
- **硬さ 2・ツルハシ・`minTier` `TIER_WOOD`・`sound` `"stone"`** と、**素手・木の斧・
  木のツルハシの秒数を出してから**判定（**素手では落ちない**ことも 1 件）
- **旗が 1 つも立っていない**（`spiky` / `sticky` / `slippery` / `climbable` / `bladed`）・
  `blocksSky` が偽
- 掘ると**自分が 1 個返る**（`dropOf` / `rollDrops`）/ 一覧に出る（`allItemIds`）/
  `placedBlock(187) === 187`
- **色**: 145 枠を回して**いちばん近い相手と隔たりを出してから** `>= 20`（レンガ 170 の節と
  同じ形）。**フェンス(157) との隔たりは別の 1 件**（同じ形の 2 材質なので、まとめると
  どちらが詰まったか出力から読めない）
- **繋がり**: `connectTable` に 1 行足して、**木とネザーレンガのフェンスが互いに繋がる**ことを見る

**数え直す既存の件が 6 つ**（**件名の末尾に「材質が 2 つになったので数え直した」と書くこと**。
**ゆるめないこと** —— 名指しの一覧は残したまま数だけ直します。`rules/testing.md`）:

- `test/blocks.test.ts` 1750「`collision` が `boxes` と別なのはフェンスだけ」→ **`differs.length === 2`**
- 同 1758「`isTallCollision` が真なのもフェンスだけ」→ **`tall.length === 2`**（**2 つとも名指し**）
- 同 276 / 322 / 335 の**共有帯のアイテム一覧**（**65 → 66 個・186 → 187 まで**）
- 同 368 と `test/items.test.ts` 599 の **`MAX_ITEM_ID === VINE_ZN`** → `NETHER_BRICK_FENCE`
- `test/crafting.test.ts` 857 **`RECIPES.length === 82`** → **83**

## 6. このタスク固有の禁じ手

- **`fenceConnects()` / `isTallCollision()` に `id === FENCE` の形を書かないこと**
  （表 1 本に聞く。`blocks.ts` の 2345 / 2360 行の注記）
- **`mesher.ts` の `case "fence"` を 1 文字も変えないこと。** `FENCE_BOXES` / `FENCE_ARMS` /
  `FENCE_COLLISION_BOX` を**写して 2 本目を作らないこと**（**同じ配列を指すこと**）
- **本家は「木とネザーレンガのフェンスは繋がらない」が、ここでは繋がります。**
  `fenceConnects()` に材質の分岐を入れないこと（**`HANDOFF.md` に 1 行残す**）
- **既存のドロップ表・157 の `def()`・`FENCE` の色を書き換えないこと**
- **`main.ts` に 1 行も足さないこと**（1450 行。止まる目安に並んでいます）
- **`SaveData.version` は 1 のまま**
- **色を測らずに選ばないこと**（割ったらずらして `TUNING.md` へ。**判定はゆるめない**）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` すべて緑** / `npm run build` 緑（`src/**` を触る）。
  **`npm run bench` は不要**（生成もメッシュ化も 0 行）
- **C-3**: **`npm run shot -- fence` を撮って `Read` で見ること**（`tools/shot.ts` の `fence` の
  場面へ、**木のフェンスの隣に 2〜3 本**置く）。**色が木と見分けられるか・腕が繋がるか・
  面の欠けと裏返りが無いか**を絵で確かめる
- **コミット 1 つを `master` へ push** / `AUTODEV-QUEUE.md` の 41 の行を消す /
  この仕様書を **`状態: 済`** に / `ROADMAP.md` の予約表に 187 / `TUNING.md` に 1 行 /
  `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を丸ごと書き直す**
