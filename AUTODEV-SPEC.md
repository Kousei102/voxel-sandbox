# 仕様: チェストとかまどが傷を運ぶ（入れ直しても新品に戻らない）

状態: 未着手
差し戻し: 0 回

`AUTODEV-QUEUE.md` の 3c の**後半（3c-2）**です（前半 3c-1・落とし物は 2026-09-01 に完了）。
**C の周はこの 1 枚を全文渡すこと**（要約すると 2 と 6 が真っ先に落ちます）。**`src/**` と
`test/**` は `Read` / `Edit` で開くこと**（`cat` / `sed` だと `.claude/rules/*.md` が読み込まれ
ません）。読むもの: **`.claude/rules/stateful-blocks.md`** と **`.claude/rules/dimensions.md`**
（セーブの形）。使うスキルは無し。

**2026-09-01 にコードで数え直しました**（B の決まり）:

- **画面の中の移動はもう傷ごと動きます** —— `craftscreen.ts` は `Slot` の参照を掴む／置く／
  入れ替えるので、器の枠へ**つまんで置いたぶんは既に残ります。残っている穴は 4 つだけ**（下の 1.）
- `serializeChest()` は 54 要素、`serializeFurnace()` は 9 要素。**どちらも傷を持ちません**
- `Chests.remove()` / `Furnaces.remove()` は `{ item, count }` しか返さないので、
  **壊した器の中身は新品で落ちます**（`breaking.ts` の `Burst` にも傷がありません）
- `addToChest()` と `craftscreen.ts` の `moveInto()`（どちらもシフトクリック）は `item` と
  `count` しか移さないので、**入れた瞬間にメモリ上で新品に戻ります**
- **`durability.ts` は 1 行も足しません** —— `serializeWear(slots)` / `deserializeWear(slots, flat)` /
  `damageOf` / `carryWear` は 3b・3c-1 のものがそのまま `Slot[]` に効きます

## 1. 何を足すか / 完了の判定

**チェストとかまどに入れた道具の傷が、入れ直しても壊しても読み込み直しても残る。**

判定: `npm test` に **「チェストが傷を運ぶ」**（`test/chests.test.ts`）と
**「かまどが傷を運ぶ」**（`test/smelting.test.ts`）の節が増えて全部緑（**いま 2446 件**）。
次を**値を出してから**（入れる前の傷と出したあとの傷を出す）判定する:

- **シフトクリックでチェストへ入れて、シフトクリックで戻すと傷が残る**（`addToChest`）
- **シフトクリックでかまどの材料枠へ入れると傷が残る**（`moveInto`）
- **チェストを壊すと中身が傷ごと地面に出る**（`tryBreak` の `Burst.damage`）。かまども同じ
- **セーブの往復で残る**（チェスト 27 枠・かまど 3 枠とも、位置がずれないこと）
- **全部新品なら `chestWear` / `furnaceWear` のキーが出ない**（減らない物だけでも出ない）
- **キーが無い古いセーブは全部新品。** 長さ違い・数でない値・負・**最大以上**でも落ちず、
  最大以上は `最大 - 1` に丸まる（`wornValue()` に委ねているか）
- **次元をまたいでも残る**（`DimensionState` に載る）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/chests.ts` | `serializeChestWear(state)` と `deserializeChest(flat, wear?)`（**中身は `durability.ts` へ委譲**）/ `Chests.serializeWear()` と `deserialize(raw, wear?)` / `remove()` の返りに `damage`（`damageOf()`）/ `addToChest(state, item, count, damage = 0)` |
| `src/smelting.ts` | `serializeFurnaceWear(state)` と `deserializeFurnace(flat, wear?)`（**9 要素は変えない**） |
| `src/furnaces.ts` | `Furnaces.serializeWear()` と `deserialize(raw, wear?)` / `remove()` の返りに `damage` |
| `src/craftscreen.ts` | `addToChest(..., damageOf(slot))` の 1 行と、`moveInto()` に `carryWear(into, damageOf(from))` の 1 行（**507〜509 行のコメントも直す**） |
| `src/breaking.ts` | `Burst` に **`readonly damage?: number`**、`BreakContainers` の `remove` の型に `damage?: number`、器の 2 つのループで `damage: held.damage` を素通し |
| `src/storage.ts` | `chestWear?: Record<string, number[]>` と `furnaceWear?: Record<string, number[]>` を**省略可のキーとして 2 つ** |
| `src/dimensions.ts` | `DimensionState` に同じ 2 つと、`normalize()` に 2 行 |
| `src/session.ts` | `StateSources` の `chests` / `furnaces` に `serializeWear()` / `collectState()` / `buildSave()` / `savedShape()` に 2 行ずつ |
| `src/main.ts` | **配線 3 行だけ**: `furnaces.deserialize(state.furnaces, state.furnaceWear)` / `chests.deserialize(state.chests, state.chestWear)` / `drops.burst(..., out.damage)`（`breakBlock()`） |
| `test/chests.test.ts` / `test/smelting.test.ts` / `test/breaking.test.ts` / `test/craftscreen.test.ts` / `test/session.test.ts` | 節を足す（**いまある判定は 1 つも書き換えない**） |

**触らないもの**（1 行も）: **`src/durability.ts`**（傷の読み方も丸め方も 3b・3c-1 のままで
足ります。**`wornValue()` の 2 本目を書かないこと**）/ **`src/drops.ts` / `src/inventory.ts`**
（3c-1 で済み）/ `src/inventoryui.ts` / `src/ui.ts` / `src/droprender.ts` / `index.html`
（見た目を増やさない）/ **`src/blocks.ts` / `src/items.ts`**（番号を 1 個も使いません）/
`main.ts` の `autoBreak` の側（316〜317 行。支えを失って壊れる経路に器は通りません）。

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません。**番号を取りたくなったら設計を間違えた合図**なので、
止めて人を呼ぶこと（`AUTODEV.md` の停止条件 1）。

## 4. 判断をどこに置くか

**3c-1 で作った「`durability.ts` ↔ 運ぶ側」の形をそのまま続けます**（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| 傷を読む | `damageOf(slot)`（**`?? 0` を器の側に書かない**） |
| 傷を載せる | `carryWear(to, damage)`（`item` を入れたあとで呼ぶ）と `addToSlots()` の第 6 引数 |
| 何要素で書くか | **器のセーブの形を持つファイル**: チェストは `chests.ts`、かまどは `smelting.ts` |
| 読んだ値をどこまで信じるか | **`deserializeWear(slots, flat)` → `wornValue()`**（**丸めを写さない**） |
| 運ぶ | `furnaces.ts` / `breaking.ts` / `session.ts` / `main.ts`（**何回で尽きるかを知らないまま運ぶ**） |

- **`chests.ts` / `furnaces.ts` / `smelting.ts` が `durability.ts` から取ってよいのは
  `damageOf` / `carryWear` / `serializeWear` / `deserializeWear` の 4 本だけ。**
  `maxUses` / `TOOL_USES` / `wearSlot` が要ったら「器が耐久値を減らす」設計になっている合図です
- **確かめられないもの（three / DOM / 音 / GLSL）は 1 つも増えません** → `unverifiable-pair`
  は不要。**読み込みの向きも逆にしないこと**（`durability.ts` はどの器も import しない）

## 5. 書くテスト

**試験場は既にあるものを使い回すこと** —— DOM も three も要りません。

- 上の 1. の 7 項目を、**値を出してから**判定する（先に「試験場が効いている」判定を置くこと ——
  傷 30 の木のツルハシをチェストの枠に入れて、`state.slots[i].damage` が 30 だと先に出す）
- **`test/breaking.test.ts` は偽の器を使っています**（`BreakContainers`）。**`damage` を返す偽物を
  足して、`Burst.damage` に素通しされることを見ること**（本物の `Chests` を持ち込まない）
- 見張り: **`chests.ts` / `furnaces.ts` / `smelting.ts` に回数（59 / 131 / 250 / 1561）と
  `maxUses(` / `wearSlot(` が出てこないこと**（`test/chests.test.ts` の `stripComments()` を通す）

## 6. このタスク固有の禁じ手

- **`SaveData.chests` の 54 要素と `furnaces` の 9 要素を増やさないこと。** 傷は**別の
  省略可キー**（`chestWear` / `furnaceWear`）へ。**キーは `"x,y,z"` で `chests` / `furnaces` と
  同じ、値の位置は枠の並びそのまま**（チェスト 27・かまどは `input` / `fuel` / `output` の 3）
- **全部新品の器は載せないこと**（1 台も無ければキーごと消す）。**空っぽの器を省く条件
  （`isChestEmpty` / `isIdle`）は変えないこと**
- **`SaveData.version` は 1 のまま**（`AUTODEV.md` の停止条件 5）。**`durability.ts` に
  新しい関数を足さないこと**（上の 4.）
- **`deserialize(raw, wear)` は 2 本に分けないこと** —— `deserialize()` が `map` を作り直すので、
  別呼び出しにすると順番を間違えた瞬間に傷だけ消えます（`drops.deserialize(flat, wear)` と同じ形）
- **器が傷を減らさないこと**（焼いても入れても増えません。減るのは掘ったときだけ）。
  **`main.ts` に `?? 0` や「道具かどうか」を書かないこと**（`damageOf()` を通す）
- **山（`count > 1`）に傷を載せる経路を作らないこと。** `addToChest` の `damage` は
  `addToSlots()` に素通しするだけ（載るのは空き枠へ入れた 1 個ぶん）
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2446 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` の 317 行目を書き直す**（「器も傷を運ぶ」。**行を消さないこと**）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2 行**（器へ入れて出す・器を壊す）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 3c-2 の行を消し、**この仕様書を `状態: 済` に**
