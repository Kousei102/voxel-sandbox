# 仕様: 道具の耐久値（掘るたびに減り、0 で壊れる）

状態: 済
差し戻し: 0 回

`AUTODEV-QUEUE.md` の 3 番の**前半**です（**B の周で 2 件に割りました。** 後半 =「3b. 耐久値が
インベントリの外でも残る（落とし物・チェスト）+ 火打石と打ち金・弓」はキューに書き戻してあります）。
**C の周はこの 1 枚を全文サブエージェントに渡すこと**（要約すると 2 と 6 が真っ先に落ちます）。
**`src/**` と `test/**` は `Read` / `Edit` で開くこと**（`cat` / `sed` だと `.claude/rules/*.md` が
読み込まれません）。読むもの: **`.claude/rules/items-survival.md`** と
**`.claude/rules/inventory-screen.md`**（セーブの作法）と **`.claude/rules/dom-ui.md`**。
使うスキルは**無し**（ブロックもアイテムも足さないので `add-block` は要りません）。

**2026-09-01 にコードで数え直しました**（B の決まり）: `Slot` は `{ item, count }` の 2 つだけ、
`ToolDef` は `kind` / `tier` / `speed` の 3 つで**回数を持ちません**。`items.ts` の
`FLINT_AND_STEEL` と `BOW` のコメントに「耐久値がまだ無い」と書いてあります。**まだ入っていません。**

## 1. 何を足すか / 完了の判定

**道具はブロックを 1 個掘るたびに 1 減り、0 になったらその場で消える。**
回数は Minecraft と同じ **木 59 / 石 131 / 鉄 250 / ダイヤ 1561**。

判定: `npm test` に **「道具の耐久値」** の節が増えて、全部緑（**いま 2332 件**。増えた件数が
そのまま乗ること）。最低限これらを**値を出してから**判定する:

- 階層ごとの最大回数を表で出す（59 / 131 / 250 / 1561）。**棒・丸石・矢・空の枠は 0**（減らない）
- 木のツルハシで石を **58 回**掘っても手に残り、**59 回目で消える**（残り回数を出す）
- 壊れた枠は空（`isEmpty`）で、**傷も 0 に戻る**（次に入れたものが半分減った状態にならない）
- **減らない場合を全部出す**: クリエイティブ / 素手 / 硬さ 0 のブロック（松明）/ 道具でない物
- **`swap()` が傷ごと入れ替える**（入れ替えた両方の傷を出す）。空き枠に入った物の傷は 0
- **セーブの往復で傷が残る。全部新品なら `wear` のキーが出ない**（古いセーブと 1 バイトも変わらない）
- **`wear` が無い古いセーブを読むと全部新品**。長さが足りない／多い・最大を超える値でも落ちず、
  **壊れた状態では復元しない**（最大 − 1 に丸める）
- `tryBreak()` が `wear` を返す（**既存の `drops` / `exhaust` / `broken` の判定は 1 つも書き換えない**）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/durability.ts`（**新規**） | **判断は全部ここ。** 回数の表・減らすか・壊れたか・画面に出す割合・セーブの形 |
| `src/inventory.ts` | `Slot` に `damage` を足す・`empty()` / `clearSlot()` / `setSelected()` / `addToSlots()` で 0 にする・`swap()` で入れ替える・`serializeWear()` / `deserializeWear()` の **2 本を委譲するだけ** |
| `src/breaking.ts` | `BreakOutcome` に `wear: number` を足す（**値は `durability.ts` に聞く**） |
| `src/storage.ts` | `SaveData.wear?: number[]` を**省略可のキーとして 1 つ**足す |
| `src/session.ts` | `SaveParts` と `buildSave()` / `restoreInto()` に `wear` を 1 行ずつ |
| `src/main.ts` | **`breakBlock()` の 2 行だけ**（減らす・壊れたら `hud.flash(breakMessage(...))`） |
| `src/ui.ts` | **DOM だけ。** `slotMarkup()` に `<span class="wear">` を足し、`paintSlot()` が `wearBar()` の割合を `style.width` に貼る |
| `style.css` | `.wear` の見た目 1 つ |
| `test/durability.test.ts`（**新規**）と `test/run.ts` | 節を 1 つ + 登録 2 行 |

**触らないもの**（1 行も）:

- **`blocks.ts` / `items.ts` の ID** —— **番号を 1 個も使いません**（`ToolDef` に回数を足すのも禁止。
  回数の表は `durability.ts` 側です）
- **`mining.ts`** —— 耐久値は**速さにも収穫にも効きません**（`breakTime` / `canHarvest` はそのまま）
- **`drops.ts` / `chests.ts` / `furnaces.ts` / `crafting.ts` / `craftscreen.ts` / `inventoryui.ts`**
- **`sfx.ts` / `audio.ts`** —— **壊れる音は足しません**（後半の周でユーザーと決めます）
- `index.html`（`slotMarkup()` が作るので id は増えません）

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません。**番号を取りたくなったら設計を間違えた合図**なので、止めて人を呼ぶこと（`AUTODEV.md` の停止条件 1）。

## 4. 判断をどこに置くか

**`vitals.ts` と `ui.ts` の関係をそのまま写します**（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| 回数の表 | `durability.ts` の `TOOL_USES`（階層で引く。**`items.ts` に持たせない**） |
| 減るか・いくつ減るか | `durability.ts` の `wearForBreaking(blockId, item, creative)` → 0 か 1 |
| 減らす・壊す | `durability.ts` の `wearSlot(slot, n)` → **壊れたアイテム ID**、壊れなければ `NO_ITEM` |
| 画面の 1 行 | `durability.ts` の `breakMessage(item)`（`deathMessage()` と同じ形） |
| 画面に出す割合 | `durability.ts` の `wearBar(slot)` → 0..1。**減らない物と空の枠は -1**（棒に出さない） |
| セーブの形 | `durability.ts` の `serializeWear(slots)` / `deserializeWear(slots, flat)` |
| 見た目 | `ui.ts`（**数を決めない。`wearBar()` を `style.width` に貼るだけ**） |

- **`durability.ts` が `inventory.ts` から取ってよいのは `import type { Slot }` だけ**（型なので
  消えます）。逆に `inventory.ts` は `durability.ts` を普通に import してよい ——
  **この向きを逆にすると読み込みの輪ができます。**
- **確かめられないもの（three / WebAudio / GLSL）は 1 つも増えません** → `unverifiable-pair` は不要
  （DOM は既にある `paintSlot()` に `style.width` が 1 行増えるだけ）。

## 5. 書くテスト

`test/durability.test.ts` に節を 1 つ。**`test/inventory.test.ts` と `test/breaking.test.ts` の
いまある判定は 1 つも書き換えないこと**（`BreakOutcome` にキーが増えるだけ）。

- 試験場は**素の `Slot` の配列**で足ります（`World` も DOM も要りません）。
  **先に「試験場が効いている」判定を置くこと**（新品の木のツルハシの残りが 59 なのを先に出す）
- 上の 1. の 9 項目を、**値を出してから**判定する
- 見張り 1: **`main.ts` に `TOOL_USES` / `maxUses(` / `.damage` が出てこないこと**
  （`arena.ts` の `sourceOf()` を通す。生で読むとコメントが引っかかります）
- 見張り 2: **`ui.ts` に回数（59 / 131 / 250 / 1561）と `maxUses(` が出てこないこと**
- 見張り 3: **`durability.ts` に `document` / `Mesh` / `AudioContext` / `Math.random(` が無いこと**

## 6. このタスク固有の禁じ手

- **`SaveData.inventory` の形（36 スロット x 2 要素）を変えないこと。** 傷は
  **別の省略可キー `wear`（36 要素）**に置く。**3 要素にすると既存のセーブが全部ずれます**
- **`SaveData.version` は 1 のまま**（`AUTODEV.md` の停止条件 5）
- **落とし物・チェスト・かまどの中身に傷を持たせないこと**（**この周では**）。
  半分減ったツルハシを地面に落として拾い直すと新品で戻ります —— **後半（キューの 3b）の
  仕事**なので、ここで `drops.ts` の `[item, count, x, y, z]` を 6 要素にしないこと
- **クリエイティブでは減らないこと**（`tryBreak()` が creative で早く return するより前に
  傷を足さない）。**支えを失って壊れた（`autoBreak`）ぶんも減りません**（道具を見ないので）
- **`ui.ts` / `inventoryui.ts` に数値（59 / 131 / 250 / 1561）を書かないこと**
- **`main.ts` に「壊れたか」の式を書かないこと**（`wearSlot()` の戻り値を見るだけ）
- **道具の効き目を階層で変えないこと** —— 減っても最後の 1 回まで同じ速さで掘れます（本家と同じ）
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2332 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` に 2 行**: 回数は本家のまま（木 59 / 石 131 / 鉄 250 / ダイヤ 1561）/
  **落とすと新品に戻る**（後半で直す。それまでの抜け道）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2〜3 行**（傷の帯がホットバーと
  インベントリの枠に出るか・新品のときに出ていないか・壊れたときに 1 行出るか）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 3 番の行を消し、**この仕様書を `状態: 済` に**
