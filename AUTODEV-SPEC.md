# 仕様: 防具枠が画面に出て、着ると固くなる（キューの 27b-2・ID 0 個）

状態: 済
差し戻し: 0 回

**27b を割った後半**です（割れ目は「画面」。前半 27b-1 = 物・点数・レシピ・セーブは
2026-09-09 に実装済み）。**取る前にコードで数え直しました**（B の周の決まり）:
`craftscreen.ts` / `inventoryui.ts` / `index.html` / `main.ts` には
**`armor` の字が 1 つもありません**（`grep -n "armor" ...` で 0 件）。
一方で **`inventory.ts` の `armor` 4 枠・`ARMOR_SLOTS`・`ARMOR_SIZE`・`armorPoints`**、
**`items.ts` の `ARMORS`（革 4 種・158..161）と `armorOf()`**、
**`vitals.ts` の `armor` フィールドと `armorReduced()`** は**全部あります**。
**残っているのは「画面に出す」ことと「点を貼る 1 行」だけ**です。

## 1. 何を足すか / 完了の判定

**インベントリ画面に防具枠 4 つ（頭・胴・脚・足）を出し、そこへ入れた革の防具が
`vitals.armor` に効くようにする。** 点数の表も減り方の式も既にあるので、**数値は 1 つも足しません。**

完了 = `npm test` に次の項目が増えて**全部緑**（いま 3407 件）:

- 「防具枠の中身が `slotFor("armor", i)` で読める」
- 「合う部位の防具だけが防具枠に入る」（革の帽子 → 頭は入る / 革の靴 → 頭は**入らない** /
  土 → 頭は**入らない**）
- 「シフトクリックで合う枠へ着る」「防具枠をシフトクリックすると脱いでインベントリへ戻る」
- 「かまど・チェストを開いている間のシフトクリックは今までどおり器へ入る」（退行の見張り）
- 「数字キーと撫でて配るのも同じ規則で弾かれる」
- 「着ると `inventory.armorPoints` が 7 になる」（革 4 部位）
- `test/ui.test.ts` の `routed` に **`["防具点を貼る", "armorPoints"]`** が増えて緑

## 2. 触るファイルと、触らないファイル

| ファイル | やること |
| --- | --- |
| `src/craftscreen.ts` | `SlotArea` に `"armor"`・`slotAt()` の 1 行・**`accepts(area, index, item)`**・`quickMove` の行き先 |
| `src/inventoryui.ts` | 4 枠を `getElementById` で拾って `wire()` と `paint()`。**判断は 1 行も書かない** |
| `index.html` | `#armorrow` と `#armorhead` / `#armorchest` / `#armorlegs` / `#armorfeet` |
| `src/style.css` | **`#armorrow` の並び 1 ブロックだけ**（`class="craft"` を借りるので数行） |
| `src/main.ts` | **1 行だけ**（下の 4.）。**コメントを添えないこと** |
| `test/craftscreen.test.ts` / `test/ui.test.ts` | 上の項目 |

**触らないファイル**: `src/inventory.ts` / `src/items.ts` / `src/vitals.ts` / `src/storage.ts` /
`src/session.ts`（27b-1 で済んでいます。**1 文字も開かないこと**）。

## 3. 使う ID

**0 個。** `ROADMAP.md` の予約表に触らないこと。**`npm test` の「111..255 の空き」は
94 のまま**で終わること（減っていたら番号を取った合図です）。

## 4. 判断をどのファイルに置くか

- **「その枠にそのアイテムを入れてよいか」は `craftscreen.ts` の `accepts()` 1 か所**。
  `armorOf(item)?.slot === ARMOR_SLOTS[index]` を見ます（**部位の表は `items.ts`、
  枠の並びは `inventory.ts`。どちらも写さないこと**）。**`NO_ITEM` は必ず true**
  ——「空の枠と入れ替えて脱ぐ」が通らなくなります。
  呼ぶのは **4 か所**: `press()` の置く側（いまの `canPlaceInto` の行）/
  `hover()` の撫でた集合に足す行（見るのは `this.dragItem`）/ `swapHotbar()`（見るのは
  ホットバー側のアイテム）/ `quickMove` の行き先。**`transfer()` の中では見ないこと**
  —— 掴む側にも掛かって、着ている物が外せなくなります。
- **行き先の順は「チェスト → かまど → 防具枠 → ホットバー/収納」**
  （`quickMoveFromInventory()`）。**器より先に防具枠を見ないこと** ——
  チェストを開いて防具をしまう経路が消えます。入れるのは既にある `moveInto()` で。
- **点を貼るのは `main.ts` の 1 行**: `vitals.armor = inventory.armorPoints;` を
  **`frame()` の `player.canSprint = ...` の直後**に置くこと。**`updateVitals()` の中に
  書かないこと** —— 殴るのは `mobs.update()` で、あれは `updateVitals()` より**前**に
  走るので、1 フレーム古い点数で殴られます（死亡画面が出なかったのと同じ罠）。
- **防具枠はいつも出します**（`#storage` と `#invhotbar` と同じ扱い）。
  かまど・チェスト・クリエイティブで隠す分岐を作らないこと —— `refresh()` に
  5 つ目の `mode !==` が増え、UI に判断が 1 つ戻ります。

## 5. 書くテスト

**値を出してから判定する形**（`rules/testing.md`）。`test/craftscreen.test.ts` の
既存の `screen()` ヘルパを使い、**防具枠は `screen().inventory.armor` から読むこと**。

- 入る／入らないは **`press()` の戻り（`changed`）と枠の中身の両方**を見ること
  —— 戻りだけ見ると「弾いたのに入っている」を取り逃します
- シフトクリックは **`armorPoints` の前後**を出してから比べること（0 → 7）
- **かまど・チェストの退行の見張り**を必ず 1 件書くこと（防具を持ってチェストを開き、
  シフトクリックでチェストへ入ること）
- `test/ui.test.ts` は **`routed` に 1 行足すだけ**。行数の上限（1500）の判定を触らないこと

## 6. このタスク固有の禁じ手

- **`style.css` の `.slot .label` に触らないこと。** 5 文字の名前が 2 行に折れて絵に
  被る件は**人の判断待ち**です（`HANDOFF.md`）。ここで直すと、この周の差分が
  「防具枠」と「名前の折り返し」の 2 件になります
- **鉄・金・ダイヤの防具を足さないこと**（ID 12 個の話で、別のキューの行です）
- **`ARMORS` の点数（1 / 3 / 2 / 1）と `ARMOR_DENOM = 25` を動かさないこと**
- **`SaveData` に 1 キーも足さないこと**（`armor` は 27b-1 で入っています。
  **`SaveData.version` は 1 のまま**）
- **`inventoryui.ts` に `armorOf` / `ARMOR_SLOTS` / `isEmpty(` / `NO_ITEM` を
  書かないこと** —— `test/craftscreen.test.ts` の「判断が漏れていない」が落ちます
- **`main.ts` は 1 行だけ。** いま 1448 行（`wc -l`）で、**足して 1449 行
  （テストの数え方 1450）**。**2 行目を書きたくなったら止まる合図**です
- **既存の判定をゆるめて緑にしないこと**（とくに `test/ui.test.ts` の 40 件の見張り）

## 7. 終了条件

- `npm run typecheck` 緑 / `npm test` **全部緑**（音の一群が赤いときはもう一度走らせる）
- `npm run build` 緑（`src/**` を触るので必須）。`npm run bench` は不要（生成もメッシュ化も触らない）
- **`src/**` を触るので撮ること**（`AUTODEV.md` の C-3）。**本物のブラウザで `E` を押して
  防具枠が出ているところ**と、**革の防具を着た姿**を撮り、`Read` で開いて見ること
- コミット 1 つ / `AUTODEV-QUEUE.md` の 27b-2 の行を消す / この仕様書を `状態: 済` に
- 手触りの数値を置いたら `TUNING.md` に 1 行（**置かない見込み**です）
- 使えるスキル: **`add-block` は使いません**（ID 0 個）。読むのは
  `rules/inventory-screen.md` / `rules/dom-ui.md` / `rules/vitals.md` /
  `rules/drops.md` / `rules/stateful-blocks.md` / `rules/testing.md`
