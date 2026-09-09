# 仕様: 革の防具 4 部位が作れて、着たまま残る（キューの 27b-1・ID 4 個）

状態: 済
差し戻し: 0 回

**27b は 120 行に収まらないので 2 件に割りました**（`AUTODEV.md` の B の末尾。理由は
`AUTODEV-QUEUE.md` の 27b の行）。**割れ目は「画面」**です —— この周は
**物・点数・レシピ・セーブ**まで（`main.ts` は **−1 行**）、
**防具枠を画面に出して着る経路は 27b-2**（`craftscreen.ts` / `inventoryui.ts` / `index.html`）。

**取る前にコードで数え直しました**（B の周の決まり）: 27a は済んでいて、
**`inventory.ts` の `armor` 4 枠・`ARMOR_SLOTS`・`armorPoints`・`vitals.ts` の
`armorReduced()` はもうあります**。**`items.ts` の `ARMORS` が空の Map**（1 行も無い）で、
**着られるアイテムが 0 種**なのが今の姿です（`test/items.test.ts` が「まだ 1 つも無い」を
見張っています —— **この周でその 1 件を書き換えます**）。

## 1. 何を足すか / 完了の判定

**革の防具 4 部位（帽子・上着・ズボン・靴）を、作れて・セーブに残るようにする。**
点数は本家のまま **1 / 3 / 2 / 1（合計 7）**。レシピも本家の形（下の 5.）。

**この周ではまだ着られません**（防具枠が画面に出るのは 27b-2）。**それでよい**理由:
着る経路だけ先に入れると、**セーブが無いあいだに着た物がリロードで黙って消えます** ——
公開サイトに出る順として、**先に残るようにしてから開ける**こと。

**完了の判定**: `npm test` に**「革の防具」の節が増えて緑**で、次の 4 つが
**値を出してから**通ること —— **`allArmorIds()` が 4 種**（いまは 0 種）/
**革 4 部位を正しい枠に着ると `armorPoints` が 7**（1 つずらすと減る）/
**`buildSave()` に `armor` キーが載り、裸なら消える**（8 要素）/
**`armor` の無い古いセーブがそのまま読める**。

## 2. 触るファイル / 触らないファイル

**触る**:

- `src/items.ts` —— 4 つの `item({...})` と `ARMORS` の 4 行 / `MAX_ITEM_ID` を伸ばす
- `src/crafting.ts` —— レシピ 4 本（下の 5.）
- `src/inventory.ts` —— `serializeArmor()` / `deserializeArmor()` の 2 本だけ
- `src/storage.ts` —— `SaveData` に **`armor?: number[]`**（省略可。`version` は 1 のまま）
- `src/session.ts` —— `SaveParts.inventory` を**器そのもの**に変える（下の 4.）/
  `applyRestore()` に `deserializeArmor()` の 1 行
- `src/main.ts` —— **`currentSave()` の 2 行（`inventory:` と `wear:`）を 1 行に**。
  **ここだけ。1449 → 1448 行**（`wc -l`）
- `test/items.test.ts` / `test/crafting.test.ts` / `test/inventory.test.ts` /
  `test/session.test.ts` / `test/storage.test.ts` —— 下の 5.

**触らない**（1 文字も）: `src/craftscreen.ts` / `src/inventoryui.ts` / `index.html` /
`src/style.css`（**全部 27b-2**）/ `src/vitals.ts`（`armorReduced()` も `ARMOR_CAP` も
`ARMOR_DENOM` も完成しています）/ `src/durability.ts` / `src/blocks.ts` / `src/mobs.ts` /
`inventory.ts` の `armorPoints` / `clear()` / `takeAll()` / `deserialize()`（27a のまま）。

## 3. 使う ID

**`ROADMAP.md` の予約表から 158 / 159 / 160 / 161 の 4 個**（次の空きは 158。
**111.. は共有帯なのでブロックと 1 本の番号列**です）。
**革の帽子 158 / 革の上着 159 / 革のズボン 160 / 革の靴 161**。
**`MAX_ITEM_ID` は 161（革の靴）へ。** 鉄・金・ダイヤの防具は**取らないこと**（12 番号は後回し）。

## 4. 判断をどこに置くか

- **どの部位が何点かは `items.ts` の `ARMORS` の表 1 本**（`FOODS` と同じ作法）。
  `inventory.ts` にも `vitals.ts` にもアイテムの名前を書かないこと
- **セーブにどのキーを載せるかは `session.ts`。** いま `main.ts` が
  `inventory: inventory.serialize(), wear: inventory.serializeWear(),` と**2 行で
  並べている**のを、**`inventory,`（器そのもの）の 1 行**に変え、
  **`buildSave()` の側が `serialize()` / `serializeWear()` / `serializeArmor()` を呼ぶ**こと。
  **読み戻す `applyRestore()` が最初から器を受け取っている**のと同じ形に揃うので、
  **これは行数合わせではなく判断の移動です**（`SaveParts.inventory` は
  `{ serialize(); serializeWear(); serializeArmor() }` の**構造だけ**で受けること）
- **傷（`wear`）と同じ作法**: `serializeArmor()` は**全部空なら `undefined`**（キーごと消える）
- **読む順は `deserialize()`（36 枠）→ `deserializeWear()` → `deserializeArmor()`。**
  **`deserializeArmor()` の中で `clear()` を呼ばないこと** —— 36 枠が消えます
  （`rules/inventory-screen.md` の「意味が 3 つとも違います」）

## 5. 書くテスト（値を出してから判定）

- `test/items.test.ts` —— **「着られる物はまだ 1 つも無い」を書き換える**。
  `allArmorIds()` を出して **4 種**・部位が `head/chest/legs/feet` で重複なし・
  点数 1/3/2/1 で**合計 7**・**革（132）は `armorOf()` が null**（材料は着られない）
- **色**: 4 つを出し、**互いと、既存のどのアイテムとも RGB の隔たり 20 以上**
  （`Math.hypot`。`test/blocks.test.ts` の氷・フェンスと同じ形）。**革 `0xa06a41` が
  いちばん近い相手になります** —— 明るさで 4 段に割り、離した値を `TUNING.md` に 1 行
- `test/crafting.test.ts` —— レシピ 4 本を出して、**革の数が 5 / 8 / 7 / 4**・
  **4 本とも 3 幅（2x2 では作れない）**・**レシピ総数が 61 → 65**
- `test/inventory.test.ts` —— `serializeArmor()` の往復（**8 要素**）/ 裸なら `undefined` /
  **正しい枠なら `armorPoints` が 7、帽子を足の枠に入れると減る**（27a の判定を消さない）/
  **`deserialize()`（36 枠）を呼んでも着ている物が消えない**
- `test/session.test.ts` —— `buildSave()` の `armor` を出して、着ていれば 8 要素・
  裸なら**キーごと `undefined`**・**`version` が 1 のまま**
- `test/storage.test.ts` —— **`armor` の無いセーブがそのまま読める**（既存の判定を消さない）

## 6. このタスク固有の禁じ手

- **`SaveData.version` を上げないこと**（既存プレイヤーの世界が全部読めなくなります）
- **`inventory` の 36 枠の平坦配列に防具を継ぎ足さないこと**（`wear` を分けたのと同じ理由）
- **防具に耐久を持たせないこと** —— `durability.ts` にも `TOOL_USES` にも 1 行も足さない
  （本家の革の防具は傷みますが、減らす経路が `vitals.ts` → `inventory.ts` の配線になり、
  この周には入りません。`TUNING.md` に 1 行残すこと）
- **`vitals.ts` に触らないこと。** 着た点が効くのは 27b-2 です（`vitals.armor` は 0 のまま）
- **`ARMORS` に鉄・金・ダイヤを足さないこと**（番号は取りません）
- **`main.ts` を 1449 行より増やさないこと**（この周は −1 行。`AUTODEV.md` の停止条件 2）
- **`allItemIds()` に別表を作らないこと**（クリエイティブの一覧は自動で増えます）

## 7. 終了条件

`npm run typecheck` と `npm test`（**3372 件 + 増やしたぶんが全部緑**）/ `npm run build`
（`src/**` を触るので必ず）/ **コミット 1 つ**を `master` へ / **`npm run shot` は不要**
（見た目に出るのは一覧の色 4 つだけ。**`node tools/browsershot.mjs` でインベントリを開いた
1 枚を撮り、`Read` で開いて 4 色が見分けられるか見ること**）/
手触りの数値（色 4 つ・耐久を入れない判断）を `TUNING.md` に 1 行 /
`ROADMAP.md` の予約表に 158..161 を「実装済み」/ `AUTODEV-QUEUE.md` の 27b-1 の行を消す /
`AUTODEV-SPEC.md` を `状態: 済` に / `HANDOFF.md` を書き直す。

**使えるスキル**: `add-block`（ID の取り方と `items.ts` の足し方。**ブロックは足しません**）。
**読む決まりごと**（自動では読み込まれません。`grep -l '"src/inventory.ts"' rules/*.md`）:
`rules/inventory-screen.md` / `rules/items-survival.md` / `rules/drops.md` /
`rules/dimensions.md`（`session.ts` と `storage.ts`）/ `rules/vitals.md`（`items.ts`）/
`rules/testing.md`（`test/**`）。
