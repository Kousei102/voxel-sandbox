# 仕様: 落とし物が傷を運ぶ（地面に落としても新品に戻らない）

状態: 未着手
差し戻し: 0 回

`AUTODEV-QUEUE.md` の 3c の**前半**です（**B の周で 2 件に割りました。** 後半 =
「3c-2. チェストとかまどが傷を運ぶ」はキューへ書き戻してあります）。**C の周はこの 1 枚を
全文渡すこと**（要約すると 2 と 6 が真っ先に落ちます）。**`src/**` と `test/**` は
`Read` / `Edit` で開くこと**（`cat` / `sed` だと `.claude/rules/*.md` が読み込まれません）。
読むもの: **`.claude/rules/drops.md`** と **`.claude/rules/dimensions.md`**（セーブの形）。使うスキルは無し。

**2026-09-01 にコードで数え直しました**（B の決まり）:

- **傷んだ道具が地面に出る入口は 3 つだけ**: `inventory.discardSelected()`（プレイ中の Q）/
  `CraftScreen.discardHeld()`（画面の Q）/ `inventory.takeAll()`（死亡）。**3 つとも
  `{ item, count }` しか返しません。** 掘ったブロックとモブの落とし物は道具になりません
- 消える所は 3 か所: `Drop` が傷を持たない / `tryPickup()` の `inventory.add(item, count)` /
  `serialize()` の `[item, count, x, y, z]`
- **`mergeAll()` は触らなくてよい** —— 傷が付く物は `stack: 1` なので `room = limit - b.count`
  が 0 になり、2 山が 1 つになりません（**テストで値を出すこと**）
- **チェスト・かまどの中身（`tryBreak()` の `result.drops`）は後半（3c-2）**です

## 1. 何を足すか / 完了の判定

**落とした道具を拾い直しても、死んで拾い直しても、読み込み直しても傷が残る。**

判定: `npm test` に **「落とし物が傷を運ぶ」** の節が増えて、全部緑（**いま 2420 件**）。
次を**値を出してから**判定する（いずれも「落とす前の傷」と「拾ったあとの傷」を出す）:

- **`burst()` で落として拾う**と傷が残る（インベントリの枠の傷を出す）
- **プレイ中の Q**（`discardSelected()` → `throwOut()`）で捨てて拾い直しても残る
- **画面の Q**（`discardHeld()`）で捨てたぶんに傷が付いて返る
- **死んで全部落とす**（`takeAll()`）→ 拾い直して残る
- **傷んだツルハシ 2 本を同じ所に落としても 1 山にならず、両方の傷が残る**
- **セーブの往復で残る。減らない物（棒・丸石）だけなら傷は 0 で、`dropWear` のキーが出ない**
- **`dropWear` が無い古いセーブは全部新品。** 長さ違い・数でない値・負・**最大以上**でも
  落ちず、最大以上は `最大 - 1` に丸まる
- **次元をまたいでも残る**（`DimensionState` に載る）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/durability.ts` | **`wornValue(item, raw)` を 1 本**足し、`deserializeWear()` を**それに委譲する 1 行**へ（**判定は 1 つも変えない**） |
| `src/drops.ts` | `Drop.damage` / `spawn()` の `options.damage`（**傷を載せる唯一の入口**）/ `burst()` と `throwOut()` の**末尾に `damage = 0`** / `tryPickup()` は `inventory.add(item, count, damageOf(drop))` / `serializeWear()` と `deserialize(flat, wear)` |
| `src/inventory.ts` | `discardSelected()` と `takeAll()` の返り値に **`damage`**（値は `damageOf()`） |
| `src/craftscreen.ts` | `discardHeld()` の `discarded` に `damage` を 1 つ |
| `src/inventoryui.ts` | `onDiscard` の引数を 3 つに（**素通しの 2 行だけ**。`durability.ts` を import しない） |
| `src/storage.ts` | `SaveData.dropWear?: number[]` を**省略可のキーとして 1 つ** |
| `src/dimensions.ts` | `DimensionState.dropWear?: number[]` と `normalize()` に 1 行 |
| `src/session.ts` | `StateSources.drops` に `serializeWear()` / `collectState()` / `buildSave()` / `savedShape()` に 1 行ずつ |
| `src/main.ts` | **配線だけ 4 行**: `screen.onDiscard` の 3 つ目 / `discardSelected()` と `dropOnDeath()` が渡す傷 / `drops.deserialize(state.drops, state.dropWear)` |
| `test/drops.test.ts` | 節を 1 つ足す（**いまある判定は 1 つも書き換えない**） |
| `test/session.test.ts` | 偽物に `serializeWear: () => undefined` を足すだけ（**判定は変えない**） |

**触らないもの**（1 行も）:

- **`chests.ts` / `furnaces.ts` / `breaking.ts`** —— **後半（3c-2）の仕事**。
  `tryBreak()` の戻り（`BreakDrop`）に `damage` を足さないこと
- **`droprender.ts`** —— 地面の山に帯は出しません（**見た目を増やさない**）
- **`blocks.ts` / `items.ts`**（**番号を 1 個も使いません**）/ `mobs.ts` / `ui.ts` / `index.html`

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません。**番号を取りたくなったら設計を間違えた合図**なので、
止めて人を呼ぶこと（`AUTODEV.md` の停止条件 1）。

## 4. 判断をどこに置くか

**3b で作った `durability.ts` ↔ 運ぶ側の形をそのまま続けます**（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| 傷を読む | `damageOf(slot)`。**`Drop` は `{ item, count, damage? }` なので `Slot` としてそのまま渡せる**（`?? 0` を `drops.ts` に書かない） |
| 傷を載せる | `spawn()` の中で `carryWear(drop, damage)` **1 か所だけ**（`item` を入れたあとで呼ぶ） |
| 読んだ値をどこまで信じるか | **`wornValue(item, raw)`**（`deserializeWear()` と共有。**丸め方を 2 か所に書かない**） |
| 運ぶ | `drops.ts` / `inventory.ts` / `craftscreen.ts` / `main.ts`（**何回で尽きるかを知らないまま運ぶ**） |

- **`drops.ts` が `durability.ts` から取ってよいのは `damageOf` / `carryWear` / `wornValue` の
  3 本だけ。** `maxUses` / `TOOL_USES` / `wearSlot` が要ったら「地面が耐久値を減らす」
  設計になっている合図です。
- **確かめられないもの（three / DOM / 音 / GLSL）は 1 つも増えません** → `unverifiable-pair` は不要。
  **読み込みの向きも逆にしないこと**（`durability.ts` は `drops.ts` を import しない）。

## 5. 書くテスト

`test/drops.test.ts` に節を 1 つ。**試験場は既にあるもの**（`flatGrass()` / `standing()` /
`advance()`）**を使い回すこと** —— DOM も three も要りません。

- **先に「試験場が効いている」判定を置くこと**（傷 30 の木のツルハシを `burst(..., 30)` で
  落として、`drop.damage` が 30 であることを先に出す）
- 上の 1. の 8 項目を、**値を出してから**判定する
- 見張り 1: **`drops.ts` に回数（59 / 131 / 250 / 1561）と `maxUses(` / `wearSlot(` が
  出てこないこと**（このファイルの `stripComments()` を通す。生で読むとコメントが引っかかる）
- 見張り 2: **`inventoryui.ts` が `durability.ts` を import しないこと**（`crafting.ts` と同じ判定）

## 6. このタスク固有の禁じ手

- **`SaveData.drops` の 5 要素を 6 要素にしないこと。** 傷は**別の省略可キー `dropWear`**
  （1 山につき 1 要素）へ。**添字は `serialize()` の並びそのまま**（`count <= 0` を飛ばす所も同じ）
- **`SaveData.version` は 1 のまま**（`AUTODEV.md` の停止条件 5）
- **`deserialize(flat, wear)` は壊れた値で落ちないこと。** 山を 1 つ飛ばしても添字がずれないよう、
  **傷は平坦配列の位置（`i / 5`）から引くこと**（`list` の並びから引かない）
- **`mergeAll()` に「傷が違えば統合しない」を書き足さないこと** —— `stack: 1` なので
  そもそも起きません。書くと「半端に傷んだ山」を割る話が始まります
- **山（`count > 1`）に傷を載せる経路を作らないこと**
- **チェスト・かまどの中身に傷を持たせないこと**（**この周では**）。壊したときに落ちる中身は
  いまも新品に戻ります —— **後半（3c-2）で塞ぎます。ここで塞ごうとしないこと**
- **`main.ts` に `?? 0` や「道具かどうか」を書かないこと**（`damageOf()` を通す）
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2420 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` に 1 行**: チェスト・かまどの中身ではまだ新品に戻る（3c-2 で塞ぐ）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2 行**（傷んだ道具を Q で捨てて拾い直すと
  帯が付いたままか・死んで拾い直しても付いたままか）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 3c-1 の行を消し、**この仕様書を `状態: 済` に**
