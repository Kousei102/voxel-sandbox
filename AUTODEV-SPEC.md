# 仕様: 火打石と打ち金・弓の耐久値（使うと減る）

状態: 未着手
差し戻し: 0 回

`AUTODEV-QUEUE.md` の先頭 **3d** です。**C の周はこの 1 枚を全文渡すこと**（要約すると 2 と 6 が
真っ先に落ちます）。**`src/**` と `test/**` は `Read` / `Edit` で開くこと**（`cat` / `sed` だと
`.claude/rules/*.md` が読み込まれません）。読むもの: **`.claude/rules/items-survival.md`** と
**`.claude/rules/use.md`**。**使うスキルは無し**（ID を 1 個も足さないので `add-block` は要りません）。

**2026-09-01 にコードで数え直しました**（B の決まり）:

- **`maxUses()` は `toolOf()` しか見ません** —— 火打石と打ち金（88）も弓（93）も `tool: null` なので
  **`wearable()` が false**。だから帯も出ず、傷も付かず、**無限に使えます**
- 「耐久値がまだ無い」というコメントは **`items.ts` の 4 か所**です（83〜86 / 124〜130 の 2 つの
  説明と、210 / 221 行の 2 つの行末コメント）。**前の `HANDOFF.md` の「2 か所」は数え違い**
- **減る場所は 2 つだけ**: `main.ts` の **`igniteAt()`（872 行）** と **`loose()`（1284 行）**。
  どちらも「効いたときだけ」進む形が既にできています（`lit.kind !== "placed"` で戻る /
  `!shot || 矢が無い` で戻る）ので、**そこに 1 行足すだけ**です
- **セーブは 1 バイトも変わりません** —— `serializeWear()` / `wornValue()` は `maxUses()` に
  聞くだけなので、**`maxUses()` が 0 でなくなった瞬間に `wear` / `craftWear` / `dropWear` /
  `chestWear` / `furnaceWear` の 5 つ全部に自動で載ります**（新しいキーは 1 つも要りません）

## 1. 何を足すか / 完了の判定

**火打石と打ち金は 64 回、弓は 384 回で壊れる**（Minecraft のまま）。**掘っても減らず、
使ったときだけ減る。**

判定: `npm test` に **「使うと減るもの（火打石と打ち金・弓）」**（`test/durability.test.ts`）の節が
増えて全部緑（**いま 2488 件**）。次を**値を出してから**判定する:

- **回数の表**: 木 59 / 石 131 / 鉄 250 / ダイヤ 1561 / **火種 64 / 弓 384**
- **`wearForUse()` の全ケース**: 火種 1 / 弓 1 / **クリエイティブ 0** / **ツルハシ 0**（掘って
  減るものは右クリックでは減らない）/ 棒 0 / 空の枠 0
- **`wearForBreaking()` に 2 行足す**: **火種で掘る 0 / 弓で掘る 0**（**既存の 6 行は
  書き換えないこと**）
- **64 回目・384 回目で壊れる**（63 回目・383 回目は手に残ることも出す）。壊れたら
  `breakMessage()` が「火打石と打ち金 が壊れました」を返す
- **帯**: 無傷の弓は -1、1 回使うと `383/384`
- **セーブの往復で残る**（`serializeWear()` → `deserializeWear()`）。**`wornValue(BOW, 999)` は 383**
- **`SaveData` に新しいキーが 1 つも増えていない**（`storage.ts` の語を数えて出す）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/durability.ts` | `FIRE_STARTER_USES = 64` / `BOW_USES = 384` / **中で使う `usedUp(item)`**（`isFireStarter()` → 64、`isBow()` → 384、他は 0）/ `maxUses()` に「道具でなければ `usedUp()`」/ **`wearForUse(item, creative)`** を 1 本 / `wearForBreaking()` に**「掘る道具でなければ 0」の 1 行** / **先頭コメントの直し**（下の 6.） |
| `src/main.ts` | **配線だけ**: `wearHeld(uses)` を 1 本（`wearSlot()` を呼んで、壊れたら `hud.flash(breakMessage())`）。`breakBlock()` の 2 行をその呼び出しに置き換え、`igniteAt()` と `loose()` から 1 行ずつ呼ぶ。**`igniteAt()` には `hud.refresh()` も要ります**（帯が減ったのに描き直されません） |
| `src/items.ts` | **コメント 4 か所だけ**（上の「数え直し」）。**表も ID も `tool:` も 1 個も動かさない** |
| `test/durability.test.ts` | 節を足す（**いまある判定は 1 つも書き換えない**） |
| `test/ui.test.ts` | `routed` に **1 行**（`["火種と弓の消耗", "wearForUse("]`） |

**触らないもの**（1 行も）: **`src/bow.ts` / `src/use.ts` / `src/portals.ts` / `src/placing.ts`**
（引きの長さも右クリックの振り分けも点火の可否も、もうそれぞれ 1 か所にあります）/
**`src/storage.ts` / `src/session.ts` / `src/dimensions.ts`**（セーブの形は変わりません）/
`src/ui.ts` / `src/inventoryui.ts` / `src/craftscreen.ts` / `src/inventory.ts` / `src/drops.ts` /
`src/chests.ts` / `src/furnaces.ts` / `src/mining.ts` / `src/crafting.ts` / `src/blocks.ts` /
`index.html`（見た目を増やしません）。

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（火打石と打ち金 88・弓 93 はもうあります）。
**番号を取りたくなったら設計を間違えた合図**なので、止めて人を呼ぶこと（`AUTODEV.md` の停止条件 1）。

## 4. 判断をどこに置くか

**`durability.ts` ↔ 運ぶ側**の形をそのまま続けます（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| **何回使えるか** | `durability.ts`（`TOOL_USES` / `FIRE_STARTER_USES` / `BOW_USES`） |
| **どれが火種・どれが弓か** | `items.ts` の **`isFireStarter()` / `isBow()` の表 1 本**（`rules/items-survival.md`） |
| **使ったら減るか** | `durability.ts` の `wearForUse(item, creative)`（`wearForBreaking()` と同じ形） |
| **減らす・壊す・1 行** | `wearSlot()` / `breakMessage()`（**もうあります。2 本目を書かない**） |
| **運ぶ** | `main.ts`（**何回で尽きるかを知らないまま貼るだけ**） |

**確かめられないもの（three / DOM / 音 / GLSL）は 1 つも増えません** → `unverifiable-pair` は不要。
**読み込みの向きも逆にしないこと**（`items.ts` は `durability.ts` を import しません）。

## 5. 書くテスト

**試験場は `test/durability.test.ts` にあるものを使い回すこと**（DOM も three も要りません）。

- 上の 1. の 7 項目を、**値を出してから**判定する（先に「試験場が効いている」判定を置くこと ——
  **`maxUses(FLINT_AND_STEEL)` が 64・`maxUses(BOW)` が 384 で、新品の傷が 0** だと先に出す）
- **ソースを見張るテストは `sourceOf()` を通すこと**（`rules/testing.md`。生で探すと、
  自分で書いた説明に引っかかります）。見張るのは 3 つ:
  1. **`main.ts` に `384` が出てこない**（回数を運ぶ側に書き戻していないか）
  2. **`main.ts` に `wearForUse(` が 2 回**（点火と発射。1 回だと片方の配線を落としています）
  3. **`durability.ts` に `BOW` / `FLINT_AND_STEEL` の名前が出てこない**（表 1 本の決まり）

## 6. このタスク固有の禁じ手

- **火種と弓に `tool:` を付けないこと** —— `ToolDef` は「掘る速さ」の表なので、付けると
  **弓で石が速く掘れます**（回数を `items.ts` に持たせないのも同じ理由。`durability.ts` の冒頭）
- **`item === BOW` / `item === FLINT_AND_STEEL` と書かないこと**（`isBow()` / `isFireStarter()`）
- **掘っても減らないこと。** 逆に、**ツルハシが右クリックで減らないこと**（`wearForUse()` は
  「使って減るもの」だけ 1 を返す）
- **効かなかったときは減らさないこと** —— 矢が無い・引きが足りない・火が点かなかった
  （`blocked` / `none`）。**`main.ts` の早期 return より後ろで呼ぶこと**
- **`main.ts` に 64 / 384 / `?? 0` / 「弓かどうか」を書かないこと**（`test/use.test.ts` が
  `isBow(` / `isFireStarter(` を、この周の見張りが `384` を見ます）
- **`SaveData` に新しいキーを足さないこと**（`version` は 1 のまま。既存の 5 つに自動で載ります）
- **`durability.ts` の先頭コメントを直すこと** —— いま「掘るたびに 1 減り」「チェストとかまどの
  中身はまだ `[item, count, ...]` のまま」と書いてありますが、**後者は前の周（`87c6a80`）で
  嘘になっています。** 前者も「使ったときにも減る」に直すこと
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2488 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` の「道具の耐久値」の節に 2 行**（火種 64 / 弓 384 と、**減るのは効いたときだけ**）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2 行**（火を点けると火種に帯が出る /
  矢を放つと弓に帯が出る。**どちらも新品では帯が出ないこと**）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 3d の行を消し、**この仕様書を `状態: 済` に**
- 決まりごと（`rules/items-survival.md` の「道具の耐久値はまだありません」）の更新は
  **`RULES-INBOX.md` へ本文をそのまま書くこと**（`.claude/` は無人の周では触れません）
