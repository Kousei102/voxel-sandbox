# 仕様: 小麦の種と苗（耕地に植える）

状態: 済
差し戻し: 0 回

**キューの「12. 種・小麦・パンと『育つブロック』」を割った前半**（**後半は 13 番**として書き戻し
済み）。**数え直し済み**: `crop` / `wheat` / `小麦` / `seed`（ワールドの種を除く）/ `bread` / `パン`
は `src/**` にも `test/**` にも 1 件もありません。**耕地（116）と `tryTill()` は前の周で入りました。**

## 1. 何を足すか / 完了の判定

**小麦の種（アイテム）と小麦の苗（ブロック）。** 草むらを壊すと 12.5% で種が出て、種を持って
**耕地**を右クリックすると上に苗が立ち、種が 1 減ります。苗を壊すと種が 1 個戻り、**下の耕地を
掘ると苗も壊れて種が落ちます**（支えを失う経路）。**まだ育ちません**（後半）。
完了の判定 —— **`npm test` に次が増えて、全部緑**:

- 「**立方体 36**（±0）/ **非立方体 68**（67 → 68）/ **アイテム 88 種**（87 → 88）/
  `MAX_ITEM_ID` 122 / **111..255 の空き 133**（135 → 133）」
- 「草むらを壊すと 12.5% で種・外したら草むらそのもの」「耕地に植わる」「土や草には植わらない」
  「もう苗が立っているマスには植わらない」「苗を壊すと種 1 個」「**耕地を掘ると苗も種になって落ちる**」
- 「苗はアイテムを持たない（一覧が増えるのは種の 1 枠だけ）」「種は食べられない・道具でない」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `blocks.ts` | `WHEAT_CROP = 121` の `def`（`model: "cross"`） |
| `items.ts` | `WHEAT_SEEDS = 122` ・`MAX_ITEM_ID` ・`isSeed()` ・`DROPS` に 2 行 |
| `use.ts` | `UseAction` に `{ kind: "plant" }` と `decideUse()` に 1 行（**`till` の次・バケツより前**） |
| `placing.ts` | `tryPlant()` |
| `main.ts` | **配線だけ（+12 行以内**。いま 1433 / 上限 1500） |

**1 行も書かないこと**: **`crops.ts` を作らない**（後半）/ `world.ts`・`dimensions.ts`・`session.ts`・
`storage.ts`（**セーブは 1 バイトも増えません**）/ `durability.ts`（**傷は付きません**）/ `crafting.ts` /
`smelting.ts` / `vitals.ts`（**種は食べ物ではない**）/ `mobs.ts` / `sfx.ts` / `audio.ts`（**新しい音を
足さない** —— 植えた音は `"place"` の `"grass"`）/ `mobrender.ts` / `inventoryui.ts` / `ui.ts` /
`.claude/**`（決まりごとは `RULES-INBOX.md` へ）。

## 3. 使う ID

**121..122 の 2 個**（`ROADMAP.md` の予約表「121..255 予備」の先頭から上に詰めて取る）。
**121 = 小麦の苗（ブロック）/ 122 = 小麦の種（アイテム）。95..110 は空けたまま。**

**苗は `variantOf: WHEAT_CROP`（自分自身）にすること。** `items.ts` の for が `variantOf !== AIR` を
飛ばすので**アイテムが作られません**。**耕地（`variantOf: DIRT`）と違って大元に向けられない** ——
苗は土でも耕地でもないので、**落ちるものは `DROPS` の 1 行で必ず書くこと**（既定の `baseBlock()`
は自分自身を返し、アイテムの無い番号を落とします。`VARIANT_OF[id] || id` なので値は変わりません）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| どれが種か | `items.ts` の `isSeed()`（**表 1 本**。`isShears()` / `isBow()` と同じ形） |
| 何が落ちるか（草むら・苗） | `items.ts` の `DROPS`（**確率の比較を呼ぶ側に書かない**） |
| どこに植わるか・書き込み | `placing.ts` の `tryPlant()`（`tryTill()` と同じ形） |
| 右クリックがどこへ行くか | `use.ts` の `decideUse()` |
| 支えを失ったら壊れる | `blocks.ts` の `supportFace: FACE_YN`（**1 行で付いてきます**） |
| （**新しい「確かめられないもの」は 1 つも足しません** —— `unverifiable-pair` は不要） | — |

## 5. 実装の要点（この順で。`add-block` スキルの手順に乗る）

1. `blocks.ts`: `WHEAT_CROP = 121`（**`FARMLAND` の隣に説明つきで**）と `def(WHEAT_CROP, "小麦の苗", { top: 0x6f8f3f }, { opaque: false, solid: false, hardness: 0, sound: "grass", model: "cross",
   boxes: CROSS_BOX, supportFace: FACE_YN, variantOf: WHEAT_CROP })`。**`replaceable` を付けない**
2. `items.ts`: `WHEAT_SEEDS = 122` / `MAX_ITEM_ID = WHEAT_SEEDS` / `item({ id: WHEAT_SEEDS,
   name: "小麦の種", block: AIR, stack: MAX_STACK, color: 0x9aa85a, tool: null })`（**`block: AIR`**
   —— 植えるのは `place` でなく `plant` の経路）/ `SEEDS` の表と `isSeed()`
3. `DROPS`: `[TALL_GRASS, { item: WHEAT_SEEDS, count: 1, chance: 0.125, otherwise: TALL_GRASS }]` と `[WHEAT_CROP, { item: WHEAT_SEEDS, count: 1, chance: 1 }]`
4. `use.ts`: `{ kind: "plant"; at: UseSpot }` を足し、**`till` の次・バケツより前**に `if (aim &&
   isSeed(held)) return { kind: "plant", at: aim.block };`。**可否はここで決めない** / 冒頭を 14 通りに
5. `placing.ts`: `tryPlant(world, at)` —— 狙ったマスが `FARMLAND` でなければ `none`。上のマスが
   `isReplaceable()` でない、または `isLiquid()` なら `blocked`（「そこには植えられません」）。
   通れば `setVoxel(x, y + 1, z, WHEAT_CROP)` して `placed`
6. `main.ts`: `case "plant": plantAt(act.at.x, act.at.y, act.at.z); return;` と `plantAt()`
   （**`tillAt()` を写す形**。`placed` のときだけ `audio.play("place", blockSound(...))` /
   **`if (!creative) inventory.consumeSelected(1);`** / `hud.refresh()` / `saveDirty = true`）。
   **傷は付けない**（`wearHeld` を呼ばない）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `blocks.test.ts`: 立方体 36 / 非立方体 68 / アイテム 88 / 空き 133（**出力を読むこと**）。
  **「共有帯のアイテムは 9 個（120 まで）」を 10 個（122 まで・`sharedItems[9] === WHEAT_SEEDS`・
  `MAX_ITEM_ID === WHEAT_SEEDS`）に直す** —— ゆるめるのではなく数え直す。**既存の「草むらを壊すと
  自分が手に入る」は `rollDrop(TALL_GRASS, 0.5)` が草むら・`rollDrop(TALL_GRASS, 0.05)` が種、の
  2 件に書き直すこと**（判定を消さない）。`itemName(WHEAT_CROP) === ""` / 苗は通り抜けられて支えに
  ならず、**上書きして置けない**（`!isReplaceable(WHEAT_CROP)`）
- `placing.test.ts`: 耕地 → 上に苗 / 土・草・石は `none` / 上に石や水があれば `blocked` /
  **もう苗が立っているマスも `blocked`** / 苗が立っても耕地は耕地のまま
- `use.test.ts`: 種 + 耕地 → `plant`（`at` が耕地のマス）/ 種 + 作業台 → `craft`（**器が先**）/
  種だけ（`aim` なし）→ `none` / クワ + 土 → 今までどおり `till` / **`main.ts` に `isSeed(` が無い**
- `breaking.test.ts`: 苗を掘ると種 1 個 / **耕地を掘ると `autoBreak()` の経路で苗が種になって落ちる**。
  `items.test.ts`: `isSeed()` は種だけ true・`foodOf` も `toolOf` も null。`ui.test.ts`: `routed` に `["苗を植える", "tryPlant("]`

## 7. このタスク固有の禁じ手

1. **`crops.ts` を作らない。苗に毎フレームの仕掛け（育つ・乾く・踏み荒らす）を 1 行も足さない**
   （後半 = キューの 13 番。`world.update()` にも `main.ts` の更新の列にも足さないこと）
2. **苗を `variantOf` 無しで足さないこと。** アイテムが生えて一覧が 1 枠増え、**苗を持ち歩いて
   石の上にも置けるようになります**（耕地に植える意味が消えます）
3. **`otherwise: TALL_GRASS` を落とさないこと**（87.5% で消える草むらになります）。逆に
   **草むらのドロップを「種だけ」に置き換えないこと** —— 草むらは置けるアイテムのままです
4. **種に `tool:` を持たせない・苗に `tool:` を付けない**（シアーズと同じ罠。`ToolKind` を増やすと
   `mobs.ts` の `TOOL_ATTACK` は `Record<string, number>` なので **NaN** が黙って通ります）
5. **セーブにキーを足さない**（`version` は 1 のまま。苗は `edits` に乗るただのブロック）/ 既存の ID を
   振り直さない / **判定をゆるめない**（`blocks.test.ts` の 1 件は「9 個 → 10 個」と**増やす**だけ）/
   **`main.ts` に「耕地の上だけ」を書かない**（`placing.ts` の持ち場）

## 8. 終了条件

`npm run typecheck` と `npm test` が緑 / `npm run build` / **コミット 1 つ** / `TUNING.md` に 1 行
（種が出る確率 0.125・苗の色 0x6f8f3f）/ `ROADMAP.md` の予約表に **121..122 を「実装済み」** /
**見た目に出るので C-3 の撮影**（`node tools/browsershot.mjs` → **`Read` で見る**。苗を立てた 1 枚と
一覧が 88 枠になった 1 枚）/ `HANDOFF.md` を丸ごと書き直す。

## 割った残り

**「育つ器（`crops.ts`）と小麦・パン」はキューの 13 番。** 育ち具合は**位置ごとの状態**で持ち
（`furnaces.ts` の器の形）、実ったことは**もう 1 つのブロック ID**（`WHEAT_CROP_RIPE`。
`variantOf: WHEAT_CROP`）で見せます —— 点火中のかまどと同じ差し替えで、**そこで初めて `SaveData`
の省略可キー 1 つ（`crops`）と `DimensionState` の 1 行が要ります。**
