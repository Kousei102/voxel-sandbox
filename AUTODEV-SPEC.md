# 仕様: 防具の枠 4 つと防御の計算（キューの 27a）

状態: 未着手
差し戻し: 0 回

**着られる物はこの周では 1 つも足しません**（革の 4 部位は 27b）。足すのは
**入れ物（`inventory.ts` の 4 枠）と、防具点でダメージを減らす判断（`vitals.ts`）**の 2 つだけです。

## 1. 何を足すか と 完了の判定

**防具の枠 4 つ（頭・胴・脚・足）と、防具点でダメージが減る計算。ID は 1 個も使いません。**

`npm test` が緑のまま、次の 5 つが**値を出してから**増えていること:

- `ARMOR_SIZE` が 4 で、`Inventory` の防具枠が 4 つ空で始まる（`armorPoints` が 0）
- **防具点 0 なら今までどおり** —— `damage(10, "モンスター")` で体力がちょうど 10 減る
- **防具点 7（27b の革一式）で 7.2 減る** —— `10 * (1 - 7/25)`
- **防具点 20 で 2 減る / 25 でも 2 のまま**（上限 20 で頭打ち。8 割までしか減らない）
- **防具が効かない死因は今までどおり** —— 防具点 20 でも `毒` `空腹` `溺れ` `奈落` は 10 減る

## 2. 触るファイル / 触らないファイル

| ファイル | 何を足すか |
| --- | --- |
| `src/items.ts` | `ArmorSlot` / `ArmorDef` / **空の `ARMORS`**（`Map`）/ `armorOf(id)` / `allArmorIds()` |
| `src/inventory.ts` | `ARMOR_SIZE` / 防具枠の `Slot[]` / `armorPoints` / `takeAll()` と `clear()` の対応 |
| `src/vitals.ts` | `ARMOR_CAP` / `ARMOR_DENOM` / `ARMOR_APPLIES` / `armorReduced()` / `Vitals.armor` |
| `test/inventory.test.ts` / `test/vitals.test.ts` / `test/items.test.ts` | 下の（5） |

**触らないファイル**: **`src/main.ts`（0 行。1 行も足さないこと）** /
`src/storage.ts` / `src/session.ts`（セーブは 27b。下の（6））/ `src/inventoryui.ts` /
`src/craftscreen.ts`（DOM と画面は 27b）/ `src/durability.ts` / `src/ui.ts` /
`src/mobs.ts` / `src/player.ts` / `src/use.ts` / `src/crafting.ts`。

**先に読む決まりごと（層 2。渡された側は全文を読むこと）**:
`rules/vitals.md`（`vitals.ts` / `items.ts` / `main.ts`）・
`rules/inventory-screen.md`（`inventory.ts`）・`rules/items-survival.md`（`items.ts`）・
`rules/drops.md`（`inventory.ts`）・`rules/testing.md`（`test/**`）。

## 3. 使う ID

**0 個です。** `ROADMAP.md` の予約表から 1 つも取らないこと（革の 4 部位は 27b で
154 から取ります）。**この周のあとも「111..255 の空き 102」は 102 のまま**です。

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも増えません**（`unverifiable-pair` は要りません）。
判断は 3 か所に割れます。**このとおりに割ること:**

- **どの部位が何点か → `items.ts` の `ARMORS`（表 1 本）。** `FOODS` / `foodOf()` を
  そのまま写した形にすること。**この周は 1 行も入らない空の `Map`** で、27b が 4 行足すだけで
  済むようにします。`ArmorDef` は `{ slot: ArmorSlot, defense: number }`、
  `ArmorSlot` は `"head" | "chest" | "legs" | "feet"`
- **いま合計何点か → `inventory.ts` の `armorPoints`（getter）。** 枠 `i` の中身を
  `armorOf()` で引き、**その部位が枠の並び（0 = 頭 / 1 = 胴 / 2 = 脚 / 3 = 足）と
  合っているときだけ**足すこと（合っていなければ 0 点）
- **どれだけ減るか → `vitals.ts`。** `armorReduced(amount, cause, points)` を
  **純関数として export** し、`damage()` はそれを 1 行呼ぶだけにすること。
  防具点は `Vitals.armor`（数値・既定 0）に持たせます。
  **`vitals.ts` は `items.ts` も `inventory.ts` も import しないこと**
  （`FoodValue` と同じで、受け取るのは数値だけ。`CLAUDE.md` の対の表）

数値（本家と同じ）: `ARMOR_DENOM = 25` / `ARMOR_CAP = 20` /
`reduced = amount * (1 - Math.min(points, ARMOR_CAP) / ARMOR_DENOM)`。

`ARMOR_APPLIES: Record<DamageCause, boolean>` は **9 種すべてに 1 行ずつ**書くこと
（`Record` なので、死因が増えたら `tsc` が落として教えてくれます）:

| 効く | 効かない |
| --- | --- |
| 落下・モンスター・溶岩・炎上・サボテン | **溺れ・空腹・毒・奈落** |

## 5. 書くテスト

**値を `console.log` で出してから判定すること**（`rules/testing.md`）。

- `test/items.test.ts`: `allArmorIds()` が **0 件**（この周は着られる物が無い）/
  `armorOf()` がどのアイテムにも `null` を返す
- `test/inventory.test.ts`: 枠が 4 つ / 始めは全部空で `armorPoints` が 0 /
  **拾ったものが防具枠に入らない**（`add()` を `INVENTORY_SIZE` 個ぶん流し込んでも
  防具枠は空のまま。1 山も入らないこと）/ **`takeAll()` の不変条件が保たれる**
  （落とした合計 = 元の総数。防具枠も一緒に空になること）
- `test/vitals.test.ts`: 上の（1）の 5 行を数値で。**`armorReduced()` を直に呼ぶ表**
  （点数 0 / 7 / 20 / 25 × 死因 9 種）を出してから、`Vitals.armor` を立てた
  `damage()` でも同じ値になることを見ること
- **既存の判定を 1 つもゆるめないこと** —— とくに `test/vitals.test.ts` の
  溶岩・落下・無敵時間の秒数は、防具点 0 なら**1 桁も動きません**

## 6. この周の禁じ手

- **`src/main.ts` に 1 行も足さないこと。** いま 1450 行で、止まる目安 1450 に
  届いています（`AUTODEV.md` の停止条件 2）。**足りなくなったら止まって人を呼ぶこと**
- **セーブに手を出さないこと。** `SaveData` にキーを足すと `main.ts` の
  `currentSave()` に 1 行要ります（上）。**防具枠はこの周ずっと空なので、
  保存できるのは `[0,0,0,0,0,0,0,0]` だけ**です。**`inventory` のキーに 8 要素を
  継ぎ足す逃げ道も禁止**（`wear` を別キーにしたのと同じ理由）。**`SaveData.version` は 1 のまま**
- **防具枠を `Inventory.slots` の 36 個に混ぜないこと**（拾ったものが勝手に装備されます）。
  別の配列で持ち、**`deserialize()` が防具枠を消さないようにすること**
  （`clear()` は両方消してよい。`deserialize()` は 36 個だけ）
- **`damage()` の `cooldown` / `iframe` / `exhaustion` / `hurtFlash` / `cause` の扱いを
  1 文字も変えないこと。** 減らすのは体力に入る量だけです
- **既存のアイテムに `ARMORS` の行を足さないこと**（革も革の防具も 27b）

## 7. 終了条件

`npm run typecheck` と `npm test` が緑（いま 3214 件）/ `npm run build` が通る /
**コミット 1 つ**で `master` へ push / `TUNING.md` に 1 行（**防具の減り方は本家の
`1 - 点/25`・上限 20 点で 8 割。持続効果の器が無いので防具のエンチャントぶんは無い**）/
`AUTODEV-QUEUE.md` の 27a の行を消し、このファイルの `状態:` を `済` にする /
**見た目には 1 ドットも出ないので撮る必要はありません**（`AUTODEV.md` の C-3）。
