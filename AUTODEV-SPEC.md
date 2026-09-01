# 仕様: 掴んで動かしても傷が残る（インベントリ画面の中だけ）

状態: 未着手
差し戻し: 0 回

`AUTODEV-QUEUE.md` の 3b の**前半**です（**B の周で 2 件に割りました。** 後半 =「3c. 落とし物・
チェスト・かまどでも傷が残る ＋ 火打石と打ち金・弓」はキューへ書き戻してあります）。
**C の周はこの 1 枚を全文渡すこと**（要約すると 2 と 6 が真っ先に落ちます）。**`src/**` と
`test/**` は `Read` / `Edit` で開くこと**（`cat` / `sed` だと `.claude/rules/*.md` が読み込まれません）。
読むもの: **`.claude/rules/inventory-screen.md`** と **`.claude/rules/items-survival.md`**。
使うスキルは**無し**（ID を 1 個も足さないので `add-block` は不要）。

**2026-09-01 にコードで数え直しました**（B の決まり）:

- **傷が付く物は全部 `stack: 1`**（`items.ts` の道具 12 本）。**動くのは必ず 1 個ずつ**で半端な山に
  混ざらない —— **この周が小さいのはこれが理由**。山に傷を持たせる設計にしないこと
- いま傷が消える経路（読んで数えたもの・全部 `craftscreen.ts` と `inventory.ts` の中）:
  `transfer()`（掴む・置く・入れ替え）/ `swapHotbar()`（数字キー）/ `release()`（ドラッグ配分）/
  `returnSlot()` と `quickMove()`（**`addToSlots()` が `slot.damage = 0` と書く**）/
  `CraftScreen.serialize()`（`craft` の 20 要素に傷が無い）
- **`gather()` と `swap()` は触らなくてよい**（前者は上限 1 なら即戻り、後者は 3 の周で入りました）

## 1. 何を足すか / 完了の判定

**インベントリ画面のどの操作で動かしても、道具の傷が付いて回る。**

判定: `npm test` に **「傷ごと動く」** の節が増えて、全部緑（**いま 2382 件**）。
最低限これらを**値を出してから**判定する（いずれも「動かす前の傷」と「動かした後の傷」を出す）:

- **掴む → 空き枠へ置く**で傷が残る（左クリック・右クリックの両方）
- **別のアイテムと入れ替える**とき、**両方の傷が入れ替わる**（片方が道具でなければ 0）
- **数字キー（`swapHotbar()`）**で入れ替えた両方の傷
- **ドラッグで 1 枠に配った**とき（上限 1 なので配れるのは 1 枠だけ。その枠の傷）
- **シフトクリック**（ホットバー ↔ 収納）で傷が残る
- **画面を閉じたとき**（`returnAll()` で盤面と掴んだ山がインベントリへ戻る）
- **クリエイティブの一覧から出した物は新品**（`damage` が 0。傷んだ道具の上へ出しても引き継がない）
- **セーブの往復で盤面と掴んだ山の傷が残り、全部新品なら `craftWear` のキーが出ない**
- **`craftWear` が無い古いセーブを読むと全部新品。** 長さ違い・数でない値・最大以上でも落ちず、
  **壊れた状態では復元しない**（`deserializeWear()` の丸めがそのまま効く）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/durability.ts` | **判断はここ。** `damageOf()` と `carryWear()` の **2 本だけ**足す |
| `src/inventory.ts` | `addToSlots()` / `add()` / `addRange()` に **`damage = 0` の引数を末尾に 1 つ**。`swap()` は `damageOf()` を通す |
| `src/craftscreen.ts` | 上の 5 か所 ＋ `emptySlot()` に `damage: 0` ＋ `serializeWear()` / `deserializeWear()` の 2 本（**中身は `durability.ts` に委譲するだけ**） |
| `src/storage.ts` | `SaveData.craftWear?: number[]` を**省略可のキーとして 1 つ** |
| `src/session.ts` | `SaveParts` / `buildSave()` / `RestoreTargets.craft` / `restoreInto()` に 1 行ずつ |
| `test/durability.test.ts` | 節を 1 つ足す（**いまある判定は 1 つも書き換えない**） |

**触らないもの**（1 行も）:

- **`drops.ts` / `chests.ts` / `furnaces.ts` / `main.ts`** —— **後半（キューの 3c）の仕事**。
  ここで `[item, count, x, y, z]` を 6 要素にしないこと
- **`ui.ts` / `inventoryui.ts` / `style.css`** —— 帯はもう出ています（`wearBar()`）。**足すものはありません**
- **`blocks.ts` / `items.ts`** —— **番号を 1 個も使いません**（`stack: 1` も動かさない）
- **`mining.ts` / `breaking.ts`**（掘ったときに減るのはもう入っています）/ `index.html` / `sfx.ts` / `audio.ts`

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません。**番号を取りたくなったら設計を間違えた合図**なので、
止めて人を呼ぶこと（`AUTODEV.md` の停止条件 1）。

## 4. 判断をどこに置くか

**3 の周で作った `durability.ts` ↔ `ui.ts` の形をそのまま続けます**（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| 傷を読む | `durability.ts` の `damageOf(slot)` → 空・道具でない枠は **0**（`?? 0` を各所に書かない） |
| 傷を載せる | `durability.ts` の `carryWear(to, damage)` → `to.damage = wearable(to.item) ? damage : 0`。**`to.item` を入れたあとで呼ぶこと** |
| セーブの形 | **`serializeWear()` / `deserializeWear()` を使い回す**（`Slot[]` を取るので盤面 9 + 手 1 の 10 枠にもそのまま効く。**2 本目を書かないこと**） |
| 運ぶ | `inventory.ts` / `craftscreen.ts`（**傷が何回で尽きるかを知らないまま運ぶだけ**） |

- **`craftscreen.ts` が `durability.ts` から取ってよいのは `damageOf` / `carryWear` /
  `serializeWear` / `deserializeWear` の 4 本だけ。** `maxUses` / `TOOL_USES` / `wearSlot` が
  要ったら「画面が耐久値を減らす」設計になっている合図です。
- **確かめられないもの（three / WebAudio / DOM / GLSL）は 1 つも増えません** → `unverifiable-pair` は不要。
- **読み込みの向きを逆にしないこと**（`durability.ts` は `import type { Slot }` だけ。値だと輪ができます）。

## 5. 書くテスト

`test/durability.test.ts` に節を 1 つ。**`test/craftscreen.test.ts` と `test/session.test.ts` の
いまある判定は 1 つも書き換えないこと**（`craft` の 20 要素は変わりません）。

- 試験場は **`Inventory` + `CraftScreen`** で足ります（`World` も DOM も要りません）。
  **先に「試験場が効いている」判定を置くこと**（傷 30 の木のツルハシを 1 枠目に置いて、
  `damageOf()` が 30 を返すのを先に出す）
- 上の 1. の 9 項目を、**値を出してから**判定する
- 見張り 1: **`craftscreen.ts` に回数（59 / 131 / 250 / 1561）と `maxUses(` / `wearSlot(` が
  出てこないこと**（`arena.ts` の `sourceOf()` を通す。生で読むとコメントが引っかかります）
- 見張り 2: **`inventoryui.ts` が `durability.ts` を import しないこと**（`crafting.ts` /
  `smelting.ts` を import させないのと同じ判定）

## 6. このタスク固有の禁じ手

- **`SaveData.craft`（20 要素）の形を変えないこと。** 傷は**別の省略可キー `craftWear`（10 要素）**へ。
  **30 要素にすると既存のセーブが丸ごとずれます**（`wear` を `inventory` と分けたのと同じ理由）
- **`SaveData.version` は 1 のまま**（`AUTODEV.md` の停止条件 5）
- **読む順を変えないこと**: `craft.deserialize()` → **`craft.deserializeWear()`** → `craft.returnAll()`。
  **`returnAll()` より後に傷を戻すと、返した先（インベントリ）に載りません**
- **落とし物・チェスト・かまどの中身に傷を持たせないこと**（**この周では**）。
  **チェストを開いてシフトクリックすると、いまも新品に戻ります** —— `addToChest()` は
  `chests.ts` の仕事で、**後半（3c）で塞ぎます**。ここで塞ごうとしないこと
- **`addToSlots()` の `damage` は既定 0 の省略可にすること。** 必須にすると `chests.ts` に手が要ります
- **山に傷を持たせないこと** —— 傷が付く物は全部 `stack: 1` です。`count > 1` の枠に傷を載せる
  経路を作ると、後半で「半分だけ傷んだ山」を割る話が要ります
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2382 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` に 1 行**: 落とし物・チェスト・かまどではまだ新品に戻る（3c で塞ぐ）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2 行**（傷んだ道具を収納へ動かしても
  帯が付いて回るか・クリエイティブの一覧から出した道具に帯が出ていないこと）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 3b の行を消し、**この仕様書を `状態: 済` に**
