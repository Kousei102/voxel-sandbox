# 仕様: 金の道具 5 種（キューの 49・**ID 5 個 = 191..195**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**: 入っていません。`TIER_NAMES` は 4 階層きり（`items.ts` 687 行）、
`GOLD_(PICKAXE|AXE|SHOVEL|SWORD|HOE)` は `src/**` にも `test/**` にも 0 件。

**キューの注記の確かめ（`tier` が何を兼ねているか）**: **`ToolDef.tier` を読むのは `src/**` で 3 か所だけ**です。

| 読む所 | 何に使う | 本家の金 | 金に `tier: TIER_WOOD`(1) を渡すと |
| --- | --- | --- | --- |
| `mining.ts` 28 行 `canHarvest()` | 掘れる階層 | 木と同じ（0） | **本家どおり**（鉄鉱石・金鉱石・ダイヤ鉱石・黒曜石は落ちない） |
| `mobs.ts` 1857 行 `attackDamage()` | `TOOL_ATTACK + tier * 0.5` | 木と同じ | **本家どおり**（金の剣 4.5 = 木の剣） |
| `durability.ts` 69 行 `maxUses()` | `TOOL_USES[tier]` | **32 回** | **59 回になる（ずれる）** |

**速さはもう `tier` と別です** —— `ToolDef.speed` という別の欄があり、`toolSpeed()`（`mining.ts` 33 行）は
`tool.speed` だけを読みます（`TIER_SPEEDS[tier]` を引くのは `items.ts` のループの中だけ）。
**だから割り方は「`tier` は掘れる階層のまま 1・速さは `speed: 12` を直に書く・回数だけ表 1 本で別に持つ」**で、
`ToolDef` に欄を足す必要も、`tier` の意味を変える必要もありません。**120 行に収まるので割りません。**

**本家の規則**（Indev から）: **掘れる階層は木・速さ 12（ダイヤ 8 より速い）・耐久 32 回（Java の値。木 59 と
同じ出どころ）・攻撃は木と同じ**。レシピは他の階層と同じ形で材料が金インゴット。

## 1. 何を足すか / 完了の判定

**アイテム 191..195「金のツルハシ・金の斧・金のシャベル・金の剣・金のクワ」を足す。** 作業台で金インゴットと
棒から作れ、**掘れる物は木の道具と同じ・掘る速さは 12 で全階層でいちばん速い・32 回で壊れる・殴る強さは木と同じ。**
**完了**: `npm test` に**「金の道具（49）」の件**（`test/items.test.ts`・`test/blocks.test.ts`・`test/mining.test.ts`・
`test/durability.test.ts`・`test/mobs.test.ts`・`test/crafting.test.ts`）が増えて**すべて緑**（**+12〜20 件**）。
ブロック ID の枠の行が**「111..255 の空き 60」**になる。

## 2. 触るファイル / 触らないファイル

**触る**: `src/items.ts`（定数 5 つと説明のコメント・金の 5 本を作る短いループ 1 つ・`GOLD_TOOLS` の表と
`isGoldTool()`・`MAX_ITEM_ID` の付け替え）/ `src/durability.ts`（`GOLD_TOOL_USES = 32` と `maxUses()` の 1 行）/
`src/crafting.ts`（`...toolRecipes("金", GOLD_INGOT, ...)` 1 つと import）/ `test/items.test.ts` / `test/blocks.test.ts` /
`test/mining.test.ts` / `test/durability.test.ts` / `test/mobs.test.ts` / `test/crafting.test.ts` /
`ROADMAP.md`（予約表に 191..195 を 1 行・「191..255 予備 65 個」を「196..255・予備 60 個」に・213 行あたりの「使用済み」）/
`TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / 当たった `rules/*.md`。

**触らない**: **`src/main.ts`（0 行。持つ・掘る・殴る・耕す・傷むはどれも `toolOf()` / `isSword()` / `isHoe()` /
`maxUses()` が既に通す）** / `src/mining.ts`（`canHarvest()` と `toolSpeed()` は 1 文字も変えない）/
`src/mobs.ts`（`TOOL_ATTACK` と `TIER_ATTACK` を変えない）/ `src/blocks.ts`（`TIER_*` の定数を足さない。
**`TIER_GOLD` を作らないこと**）/ `src/use.ts` / `*render.ts` / `ui.ts` / `inventoryui.ts` / `SaveData`。

**先に引いて読むこと**: `grep -l` で `"src/items.ts"` / `"src/durability.ts"` / `"src/crafting.ts"`（**`items-survival.md` の
`MAX_ITEM_ID` と TS2367**）/ `rules/testing.md` / **`add-block` スキル**（**ブロックは足さないので `blocks.ts` の節は飛ばす**）。

## 3. 使う ID

**191..195 の 5 個**（予約表「191..255 予備 65 個」の先頭）。**191 ツルハシ / 192 斧 / 193 シャベル / 194 剣 / 195 クワ**。
**アイテムだけ**で、ブロック 191..195 は作らない（111 以降は 1 本の番号列）。**次に取るのは 196 になる。**

## 4. 判断をどこに置くか

**判断は `items.ts`（何か・どの階層か・どれだけ速いか・どれが金か）と `durability.ts`（何回で尽きるか）。**
新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要）。

- **定数**: `GOLD_PICKAXE` 191 / `GOLD_AXE` 192 / `GOLD_SHOVEL` 193 / `GOLD_SWORD` 194 / `GOLD_HOE` 195（名前の衝突 0。数え済み）
- **作り方**: **既存の 3 本のループ（`WOOD_PICKAXE + (tier-1)*3 + k` / `WOOD_SWORD + tier` / `WOOD_HOE + tier`）に
  混ぜないこと。** 金の 5 本は `[kind, id, speed]` の 5 行の表を回す**専用のループ 1 つ**で作る:
  - 名前は `"金" + TOOL_NAMES[kind]`（`TIER_NAMES` に 5 つ目を足さない —— 足すと添字 5 が「鉄より上」に読める）
  - **`tier: TIER_WOOD`**（掘れる階層と殴る強さは木）/ **掘る 3 本は `speed: GOLD_SPEED`（= 12）**、
    **剣とクワは `speed: 1`**（剣・クワのループのコメントと同じ理由）/ `stack: 1`
  - **`GOLD_SPEED = 12` は `TIER_SPEEDS` の隣に、「階層の表に入れない理由」のコメント付きで**
- **`GOLD_TOOLS` の表と `isGoldTool(item)`**（`isShears()` / `isBow()` と同じ「表 1 本に聞く」形）。
  `durability.ts` の `maxUses()` は **`toolOf()` の分岐の中で `isGoldTool(item)` なら `GOLD_TOOL_USES`、でなければ
  今までどおり `TOOL_USES[tier]`**。**`ToolDef` に `uses` を足さないこと**（`durability.ts` 31 行のコメントの理由）。
  **`TOOL_USES` に 6 つ目を足さないこと**（添字が `tier` なので金は入れられない）
- **`MAX_ITEM_ID = GOLD_HOE`**（いまは `SPIDER_EYE`）
- **レシピ**: `...toolRecipes("金", GOLD_INGOT, GOLD_PICKAXE, GOLD_AXE, GOLD_SHOVEL, GOLD_SWORD, GOLD_HOE)` を
  鉄とダイヤの間に（レシピ 86 → **91 本**）
- **色は `0xf2d15c`（金インゴットと同じ）** —— **B の周で測りました**: 既存 4 階層の色は**どれも材料と隔たり 0.0**
  （木 = 板 / 石 = 石 / 鉄 = 鉄インゴット / ダイヤ = ダイヤ鉱石）で、**道具の色は「材料の色」という決まり**です。
  金だけ離すと決まりが崩れるので揃えます（**隔たり `>= 20` の判定は道具には掛けない。今までの 20 本と同じ**）。
  参考に、**材料から離すなら黄金色の帯の最大は `0xc88c0c` の 50.3**（金のリンゴ）だが**橙に寄る**ので採らない。
  `TUNING.md` に 1 行。**色は `TIER_COLORS` に足さず、値を直に書くこと**（表の読み順に頼らない）

## 5. 書くテスト（**値を出力してから判定する**）

- **`test/items.test.ts`**: 5 本の名前・色・`toolOf()`（kind / tier / speed）・1 枠の数を 1 行ずつ出してから、
  **置けない・1 個しか積めない・kind が順に pickaxe/axe/shovel/sword/hoe・tier が 5 本とも `TIER_WOOD`・
  速さが 12/12/12/1/1・色が 5 本とも金インゴットと同じ**。既存 4 階層の「道具の色 = 材料の色（隔たり 0.0）」も
  出して並べる。**`allItemIds()` に 191..195**（**古い `MAX_ITEM_ID === SPIDER_EYE` を残すと TS2367** —— 前の節は
  `> GLOWSTONE_DUST` の形で `> ... ` に、`===` は金の節へ移す。`rules/items-survival.md`）。**`isGoldTool()` が
  5 本で真・木の 5 本と金インゴットで偽**
- **`test/blocks.test.ts`**: 共有帯の一覧に **`sharedItems[69..73]` が金の 5 本 && `MAX_ITEM_ID === GOLD_HOE`**・
  「共有帯 N 個」の件を数え直す（69 → **74**。名指しの一覧の末尾に「金の道具 5 本」）/
  **空きの件を「111..255 の空きは 60」に**（数え直し。ゆるめではない）/ **ブロック 191..195 は存在しない**
- **`test/mining.test.ts`**: 時間を出してから判定 —— **石を金のツルハシで 0.1875 秒**（木 1.125 / ダイヤ 0.28125 より速い）/
  **石炭鉱石は落ちる・鉄鉱石・金鉱石・ダイヤ鉱石・黒曜石は落ちない**（`canHarvest()`。木のツルハシと 5 つとも同じ結果）/
  **金の斧で板・金のシャベルで土が 12 倍**
- **`test/durability.test.ts`**: **5 本とも `maxUses() === 32`**・木の 5 本は 59 のまま（`TOOL_USES` を見ていない印）/
  **金のツルハシで石を 32 回掘ると尽きる**（既存の「尽きる」件の形）/ **金の剣は殴って・金のクワは耕して減る**
- **`test/mobs.test.ts`**: `attackDamage()` を出してから **金の剣 = 木の剣（4.5）・金の斧 = 木の斧**（既存の階層ループには混ぜない）
- **`test/crafting.test.ts`**: **5 本とも作業台で作れて 2x2 では作れない**・材料が金インゴットと棒 /
  **「レシピは 86 本」を 91 本に数え直す**（名前も「金の道具 5 本で 5 本増えた」へ。`===` のまま）/
  **「同じ形のレシピが重複していない」が緑のまま**

## 6. このタスク固有の禁じ手

- **`ToolDef` の形・`tier` の意味を変えないこと**（欄を足さない・`TIER_GOLD` を作らない・`TIER_NAMES` /
  `TIER_SPEEDS` / `TIER_COLORS` / `TOOL_USES` に要素を足さない）/ **既存 20 本の ID・名前・色・速さを動かさないこと**
- **`mining.ts` / `mobs.ts` を 1 文字も触らないこと**（金は `tier: TIER_WOOD` だけで本家どおりになる。上の表）
- **`durability.ts` に `item === GOLD_PICKAXE` と書かないこと**（`isGoldTool()` の表 1 本に聞く）
- **`main.ts` に 1 行も書かないこと** / 金の防具・リンゴ・ブロックのレシピを触らない / ID を振り直さない /
  `SaveData.version` は 1 のまま / **判定をゆるめないこと** / **50 以降に手を出さないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑・**3992 → 4004〜4012 あたり**）/ `npm run build` 緑。**`bench` は不要**
- **C-3**: 一覧に 5 枠増える（見た目に出る）。**使い捨てのスクリプトでクリエイティブの一覧を撮って `Read` で見ること**
  （`docs/browser-shots/README.md` の `creative-clay.png` の手順）。**「金のシャベル」は 6 文字**で `.slot .label` が
  折れるか確かめる（**折れたら既知の 58 枠に足して `HANDOFF.md` に書く**。「ダイヤのシャベル」が前例）
- **コミット 1 つを `master` へ push** / キューの 49 を消す / この仕様書を **`状態: 済`** /
  **`ROADMAP.md` の予約表に 191..195 を「実装済み」** / `TUNING.md` に 1 節（速さ 12・32 回・木の階層・色）/
  `docs/autodev-log.md` に 1 節 / 踏んだ落とし穴を `rules/` へ / **`HANDOFF.md` を書き直す**
