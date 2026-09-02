# 仕様: クワと耕地（土を耕す）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭「6. 小麦・種・耕地・パン」を 2 件に割った前半**（`AUTODEV.md` の B）。
**数え直し済み**: `hoe` / `クワ` / `farmland` / `耕地` / `crops` / `wheat` / `小麦` は `src/**` にも `test/**`
にも 1 件もありません（**`TALL_GRASS` = 32 はもうある** —— 後半で種の出どころに）。

## 1. 何を足すか / 完了の判定

**クワ 4 本（木・石・鉄・ダイヤ）と耕地。** 土か草に右クリックすると耕地になり、クワが 1 減ります。
耕地を掘ると土が 1 個落ちます（**耕地そのものは手に入りません**）。**育つものはまだ植えられません。**
完了の判定 —— **`npm test` に次が増えて、全部緑**:

- 「**立方体 36**（35 → 36）/ **アイテム 87 種**（83 → 87）/ `MAX_ITEM_ID` 120 / **111..255 の空き 135**」
- 「土を耕すと耕地」「草も耕せる」「石は耕せない」「**上が塞がっていると耕せない**」「耕地を掘ると
  土が落ちる」「耕地はアイテムを持たない（クリエイティブの一覧が増えない）」
- 「クワは階層ごとに 59 / 131 / 250 / 1561 回」「**耕したときだけ 1 減る**」「殴っても減らない」
  「クワ 4 本が作業台で作れる」「クワはどのブロックの適正でもない（掘る速さ 1）」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `blocks.ts` | `FARMLAND = 116` の `def` ・`ToolKind` に `"hoe"` ・`tilled()` |
| `items.ts` | クワ 4 本（117..120）・`TOOL_NAMES.hoe` ・`isHoe()` ・`MAX_ITEM_ID` |
| `durability.ts` / `mobs.ts` | `wearForTill()` を 4 本目として / `TOOL_ATTACK` に `hoe: 1` の **1 行だけ** |
| `crafting.ts` | `toolRecipes()` にクワ 1 行（引数に `hoe` を足す） |
| `use.ts` / `placing.ts` | `UseAction` に `{ kind: "till" }` と `decideUse()` に 1 行 / `tryTill()` |
| `main.ts` | **配線だけ（+15 行以内**。`npm test` が出す数え方で 1420 / 上限 1500） |

**1 行も書かないこと**: **`crops.ts` を作らない** / `world.ts`（**毎フレーム進むものを足さない**）/
`storage.ts` / `session.ts`（**セーブは 1 バイトも増えません**）/ `sfx.ts` / `audio.ts`（新しい音を足さ
ない。耕した音は既にある `"place"` を `"dirt"` の材質で）/ `mobrender.ts` / `inventoryui.ts` / `ui.ts` /
`.claude/**`（決まりごとは `RULES-INBOX.md` へ）。

## 3. 使う ID

**116..120 の 5 個**（`ROADMAP.md` の予約表「116..255 予備」の先頭から**上に詰めて**取る）。
**116 = 耕地（ブロック）/ 117..120 = 木・石・鉄・ダイヤのクワ（アイテム）。95..110 は空けたまま。**
**耕地は `variantOf: DIRT` にすること。** そうすると (a) `items.ts` の for が `variantOf !== AIR` を
飛ばすので**アイテムが作られず**（一覧も持ち物も増えない）、(b) `dropOf()` の既定が `baseBlock()`
なので**掘ると土が 1 個**落ちます。**点火中のかまど（`FURNACE_LIT`）とまったく同じ仕掛け。**

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| 何が耕地になるか | `blocks.ts` の `tilled(id)`（**純粋・座標を知らない**。`quenched()` と同じ形） |
| 上が塞がっていたら耕せない・書き込み | `placing.ts` の `tryTill()`（`tryIgnite()` と同じ形） |
| 右クリックがどこへ行くか | `use.ts` の `decideUse()` |
| 何回で尽きるか・いつ減るか | `durability.ts`（`rules/items-survival.md` の「減り方は 3 種類」に**4 つ目**） |
| どれがクワか / 殴ったときの強さ | `items.ts` の `isHoe()`（`isSword()` と同じ形）/ `mobs.ts` の `TOOL_ATTACK` |

**新しい「確かめられないもの」は 1 つも足しません**（`unverifiable-pair` は不要）。

## 5. 実装の要点（この順で。`add-block` スキルの手順に乗る）

1. `blocks.ts`: `ToolKind` に `"hoe"`（`TOOL_NAMES` は `Record<ToolKind, …>` なので typecheck が抜けを
   教えます。**`TOOL_ATTACK` は教えてくれません** —— 4 と禁じ手 2）/ `def(FARMLAND, "耕地",
   { top: 0x59422d, side: 0x6b533a, bottom: 0x6b533a }, { hardness: 0.6, tool: "shovel",
   sound: "dirt", variantOf: DIRT })` / `tilled(id)`: 土と草は `FARMLAND`、ほかは `AIR`（**表 1 本**）
2. `items.ts`: `WOOD_HOE = 117` … `DIAMOND_HOE = 120` / `MAX_ITEM_ID = DIAMOND_HOE` /
   **剣とまったく同じループ**で `tool: { kind: "hoe", tier, speed: 1 }`（**`TIER_SPEEDS` を
   渡さないこと** —— 剣と同じ理由）/ `TOOL_NAMES.hoe = "のクワ"` / `isHoe()`
3. `durability.ts`: `wearForTill(item, creative)` = クワなら 1、ほかは 0（**`wearForAttack()` を写す形**）。
   **`usedUp()` には足さないこと**（回数は `TOOL_USES[tier]` から来ます）
4. `crafting.ts`: `toolRecipes()` に `{ name: \`${tier}のクワ\`, out: hoe, count: 1,
   shape: ["MM.", ".S.", ".S."], key }` / `mobs.ts`: `TOOL_ATTACK` に `hoe: 1`（シャベルと同じ）1 行だけ
5. `use.ts`: `{ kind: "till"; at: UseSpot }` を足し、`decideUse()` の**器（ベッド）の次・バケツより前**に
   `if (aim && isHoe(held)) return { kind: "till", at: aim.block };`。**耕せるかどうかはここで決めない
   こと**（`place` と同じ。可否は `placing.ts`）
6. `placing.ts`: `tryTill(world, at)` —— 狙ったマスを `tilled()` に通し `AIR` なら `none`。**上のマスが
   `isReplaceable()` でない、または `isLiquid()` なら `blocked`**（「上が塞がっています」）。通れば
   `setVoxel` して `placed`
7. `main.ts`: `case "till": tillAt(act.at); return;` と `tillAt()`（**`igniteAt()` を写す形**）。**`placed`
   のときだけ** `audio.play("place", "dirt")` / `wearHeld(wearForTill(...))` / `hud.refresh()` /
   `saveDirty = true`

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `blocks.test.ts`: 立方体 36 / アイテム 87 / 空き 135（**出力を読むこと**）。**「共有帯のアイテムは剣 4 本
  とシアーズの 5 個」を 9 個（`MAX_ITEM_ID === DIAMOND_HOE`）に直すこと** —— ゆるめるのではなく数え
  直す。`itemName(FARMLAND) === ""` / `tilled()` の 4 通り（土・草・石・空気）
- `durability.test.ts`: `maxUses` 59 / 131 / 250 / 1561 ・`wearForTill` 1 ・**`wearForUse` 0**（右クリック
  しても減らない）・`wearForAttack` 0 ・`wearForBreaking(STONE, クワ)` 1（掘れば減る。剣と同じ）/
  アイテム名の見張りは**そのまま** / **`main.ts` の `wearForTill(` が 1 回**
- `placing.test.ts`: 土 → 耕地 / 草 → 耕地 / 石は `none` / 上に石・水があると `blocked` / **上が草むらなら耕せる**
- `use.test.ts`: クワ + 土 → `till` / クワ + 作業台 → `craft`（**器が先**）/ クワだけ（`aim` なし）→ `none` /
  別のアイテム + 土 → 今までどおり。**`main.ts` に `isHoe(` が無いこと**
- `crafting.test.ts`: 4 本とも作れる / 2x2 では作れない / 既存の「形の重複」の判定に乗る。
  `mobs.test.ts`: `attackDamage(木のクワ)` が **NaN でない**（1.5。シャベルと同じ）。
  `items.test.ts`: `isHoe()` が 4 本だけ true・クワの掘る速さが素手と同じ

## 7. このタスク固有の禁じ手

1. **耕地を `variantOf` 無しで足さないこと。** アイテムが生えて一覧が 1 枠増え、**耕地そのものを持ち
   歩いて置けるようになります**（本家に無い形）
2. **`TOOL_ATTACK` に `hoe` を足し忘れないこと。** `attackDamage()` が **NaN** を返し、**クワで殴った
   モブの体力が NaN になって二度と死にません。** `Record<string, number>` なので **typecheck は通ります**
3. **`wearForUse()` にクワを混ぜないこと**（あちらは掘る道具でないものの表）。逆に `wearForBreaking()`
   から外さないこと —— **掘れば減るのは剣と同じ**で、1 行も足さずに付いてきます
4. **`crops.ts` を作らない。耕地に毎フレームの仕掛け（乾く・踏み荒らす・育つ）を足さない**（割った残り）
5. **セーブにキーを足さない**（`version` は 1 のまま。耕地は `edits` に乗るただのブロック）/ **どの
   ブロックにも `tool: "hoe"` を付けない**（剣の見張りと同じ理由。`speed: 1` のまま）/ 既存の ID を
   振り直さない / **テストの判定をゆるめない**（`blocks.test.ts` の 1 件は「5 個 → 9 個」と**増やす**だけ）

## 8. 終了条件

`npm run typecheck` と `npm test` が緑 / `npm run build` / **コミット 1 つ** / `TUNING.md` に 1 行（耕地の
硬さ 0.6・クワの攻撃力 1 + 階層 0.5）/ `ROADMAP.md` の予約表に **116..120 を「実装済み」** / クリエイティブ
一覧が 4 枠増えるので **C-3 の撮影**（`node tools/browsershot.mjs` → **`Read` で見る**）。

## 割った残り

**「種・小麦・パンと育つブロック（`crops.ts`）」は別の周**（`AUTODEV-QUEUE.md` の 12 番）。耕地の上に
だけ植わり、**育ち具合は位置ごとの状態で持つ**（`furnaces.ts` の器の形。ブロック ID を 8 個使わない）。
**種の出どころは草むら**（`TALL_GRASS` = 32。もうあります）。
