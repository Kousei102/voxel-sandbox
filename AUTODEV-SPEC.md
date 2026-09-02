# 仕様: 剣 4 本（木・石・鉄・ダイヤ）

状態: 済
差し戻し: 0 回

`AUTODEV-QUEUE.md` の先頭 **4.** です。**C の周はこの 1 枚を全文渡すこと**（要約すると 2 と 6 が
真っ先に落ちます）。**`src/**` と `test/**` は `Read` / `Edit` で開くこと**（`cat` / `sed` だと
`.claude/rules/*.md` が読み込まれません）。読むもの: **`.claude/rules/items-survival.md`** と
**`.claude/rules/mobs.md`**。**使うスキルは `add-block`**（ID を 4 個取るため）。

**2026-09-02 にコードで数え直しました**（B の決まり）:

- **`src/**` に `sword` / `剣` は 1 つもありません**（`Grep` で 0 件）。本当に 1 本も無い
- **`ToolKind` は `blocks.ts` の `"pickaxe" | "axe" | "shovel"`** で、`ItemDef.tool` と
  `BlockDef.tool` の両方がこれを使います。**攻撃力は `mobs.ts` の
  `TOOL_ATTACK`（`Record<string, number>`）+ `tier * TIER_ATTACK`（0.5）**
- **`mobs.attack()` は「殴れたら true / クールダウン中なら false」を返します**（2138 行）。
  いま `main.ts`（783 行）は**戻り値を捨てています** —— ここが減らす場所です
- **`maxUses()` は `toolOf()` に聞くだけ**なので、剣に `tool:` を持たせた瞬間に
  **`TOOL_USES[tier]`（59 / 131 / 250 / 1561 = 本家の剣と同じ数字）とセーブの 5 キーが
  自動で載ります**。新しい表もキーも要りません
- **共有帯 111..255 の使用者は現在 0 個**（空き 145）。**この周が最初の使用者です**

## 1. 何を足すか / 完了の判定

**剣 4 本。作業台で作れて、殴ると強く、殴ると減る。**

判定: `npm test` に **「剣（殴って減る）」**（`test/durability.test.ts`）の節が増えて全部緑
（**いま 2525 件**）。次を**値を出してから**判定する:

- **攻撃力の表**: 素手 1 / 木の剣 4.5 / 石 5 / 鉄 5.5 / ダイヤ 6 / **ダイヤの斧 5**。
  **同じ階層なら剣 > 斧 > ツルハシ > シャベル > 素手**を 4 階層ぶん総当りで
- **`wearForAttack()` の全ケース**: 剣 1 / **クリエイティブ 0** / ツルハシ 0 / 弓 0 /
  火種 0 / 棒 0 / 素手 0
- **`wearForUse(剣)` は 0**（右クリックしても減らない）。**`wearForBreaking(石, 剣)` は 1**
  （本家と同じで、掘れば減る。**既存の 6 行は書き換えないこと**）
- **回数**: 木 59 / 石 131 / 鉄 250 / ダイヤ 1561。**59 回目で壊れて**（58 回目は手に残る）
  `breakMessage()` が「木の剣 が壊れました」を返す
- **レシピ 4 本**（`test/crafting.test.ts`）: 材料 = 板 / 丸石 / 鉄インゴット / ダイヤ 2 個 + 棒 1。
  **3 行あるので 2x2 では作れない**（作業台が要る）ことも出すこと
- **ID**（`test/blocks.test.ts`）: **111..255 の空きが 145 → 141**。共有帯の衝突検査が緑で、
  **`"sword"` を要求するブロックが 1 つも無い**（崩れると剣が採掘道具になります）

## 2. 触るファイル / 触らないファイル

| ファイル | 何をするか |
| --- | --- |
| `blocks.ts` | `ToolKind` に `"sword"` を足すだけ（**ブロックに割り当てない**） |
| `items.ts` | ID 4 個・`TOOL_NAMES` に `sword: "の剣"`・剣の定義ループ・`MAX_ITEM_ID`・`isSword()` |
| `durability.ts` | **`wearForAttack()` を 1 本足す**（3 本目。既存 2 本は触らない） |
| `crafting.ts` | `toolRecipes()` に剣の 1 行（引数を 1 つ増やす） |
| `mobs.ts` | `TOOL_ATTACK` に `sword: 4` を足すだけ |
| `main.ts` | **配線だけ 2 行**（783 行の `if (mobs.attack(...))` と `hud.refresh()`） |

**触らないこと**: `ui.ts` / `inventoryui.ts` / `mobrender.ts` / `mobmesh.ts` / `mining.ts` /
`breaking.ts` / `storage.ts` / `inventory.ts` / `chests.ts` / `furnaces.ts` / `drops.ts`
（**傷の道は `maxUses()` 1 本から自動で伸びます**）。

## 3. 使う ID（`ROADMAP.md` の予約表の 111..255）

**上から詰めて 4 個**。ブロック側も併せて見たうえで、共有帯の最初の 4 番です:

| ID | 定数 | 名前 |
| --- | --- | --- |
| 111 | `WOOD_SWORD` | 木の剣 |
| 112 | `STONE_SWORD` | 石の剣 |
| 113 | `IRON_SWORD` | 鉄の剣 |
| 114 | `DIAMOND_SWORD` | ダイヤの剣 |

- **`MAX_ITEM_ID = DIAMOND_SWORD`**（いま `ARROW`）。**95..110 は空けたまま**で、
  `allItemIds()` は `ITEMS[id]` が無い番号を飛ばします（**クリエイティブ一覧にも勝手に出ます**）
- **既存の道具ループ（`WOOD_PICKAXE + (tier-1)*3 + k`）に混ぜないこと** —— 番号が
  別の帯なので、剣は**自分のループ**（`WOOD_SWORD + (tier - TIER_WOOD)`）にすること

## 4. 判断をどこに置くか

| 判断 | 置き場所 |
| --- | --- |
| 攻撃力（4 / 0.5） | **`mobs.ts` の `TOOL_ATTACK`**。`ItemDef` に `damage` を足さないこと |
| 何回で尽きるか | **`durability.ts` の `TOOL_USES`**（既にある。1 行も足さない） |
| いつ減るか | **`durability.ts` の `wearForAttack(item, creative)`** |
| どれが剣か | **`items.ts` の `isSword(id)` = `toolOf(id)?.kind === "sword"`**。`isBow()` と同じ形 |
| 掘る速さ | **持たせない**（`speed: 1`）。剣はどのブロックの適正でもないので `toolSpeed()` は 1 を返す |

- **`durability.ts` にアイテムの名前（`WOOD_SWORD` など）を書かず `isSword()` に聞くこと**
- **`main.ts` に 4 も 0.5 も 59 も書かないこと。** 書くのは
  `if (mobs.attack(...)) { wearHeld(wearForAttack(inventory.selectedItem, creative)); hud.refresh(); }` だけ
- **新しく確かめられないものは足しません**（見た目も音も増えない）。`unverifiable-pair` は不要

## 5. 書くテスト

**値を出してから判定する**（`.claude/rules/testing.md`）。節は 4 つ:

- `test/durability.test.ts` に **「剣（殴って減る）」** —— 回数・`wearForAttack()` の全ケース・
  壊れる回に加えて、**`main.ts` が `wearForAttack(` を 1 回だけ呼ぶこと**と
  **`durability.ts` に剣のアイテム名が出てこないこと**の見張り
- `test/mobs.test.ts` に **攻撃力の総当り表**（4 階層 x 4 種類 + 素手 = 17 行を `console.log`）
- `test/crafting.test.ts` に **剣 4 本のレシピ**（材料・作業台が要ること）
- `test/blocks.test.ts` に **`"sword"` を要求するブロックが無いこと**

## 6. このタスク固有の禁じ手

- **`TOOL_USES` に剣用の 5 個目の表を作らないこと**（階層の表がそのまま効きます）
- **`wearForUse()` に剣を混ぜないこと**（右クリックで減る物になります）。
  **`wearForBreaking()` の既存 6 行を書き換えないこと**（剣は `toolOf()` が非 null なので、
  1 行も足さずに「掘れば減る」が付いてきます）
- **ツルハシ・斧・シャベルを「殴ると減る」に変えないこと**（本家はそうですが、
  **この周の話ではありません**。既存 12 本の寿命が黙って縮みます）
- **`mobs.attack()` の戻り値の意味を変えないこと**（いま「殴れたか」。ここを「倒したか」に
  すると、`test/mobs.test.ts` の連打の判定が全部ずれます）
- **ブロックに `tool: "sword"` を付けないこと**。**`SaveData` にキーを足さないこと**（`version` は 1）

## 7. 終了条件

`npm run typecheck` / `npm test`（**2525 件 + 新しい節がすべて緑**）/ `npm run build` /
**コミット 1 つ**。**`TUNING.md` に 1 行**（`TOOL_ATTACK` の `sword: 4` —— 本家は
4/5/6/7 で階層ごとに +1、ここは +0.5 なので**ダイヤの剣が 6**）。
`ROADMAP.md` の予約表に 111..114 を「実装済み」と書き、`AUTODEV-QUEUE.md` の 4. を消し、
**この仕様書の `状態:` を `済`** にして、`HANDOFF.md` を丸ごと書き直すこと。
