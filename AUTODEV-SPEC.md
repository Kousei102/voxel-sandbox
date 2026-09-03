# 仕様: 鶏（モブ本体）と、生鶏肉・焼き鳥

状態: 済（C の周・2026-09-03。結果は `docs/autodev-log.md` の「16. 鶏」。次の周は B）
差し戻し: 0 回

**キューの 7 番の前半**（後半の「羽根と矢」「卵」は `AUTODEV-QUEUE.md` へ割って戻しました）。
**数え直し済み**（2026-09-03・コードが根拠）: `MobKind` は **6 種類**（豚・羊・ゾンビ・ブレイズ・
エンダーマン・ドラゴン）で**鶏は無し**、`PASSIVE_KINDS` は `["pig", "sheep"]`、`items.ts` に
`CHICKEN` / `FEATHER` / `EGG` の名は**1 つも無く**、`FOODS` 4 行・`SMELTING` 5 行。実装前:
**2818 件緑** / `main.ts` **1450 行** / **111..255 の空き 130** / `MAX_ITEM_ID` 125。

## 1. 何を足すか / 完了の判定

**草地に鶏が湧いて、倒すと生鶏肉が出て、かまどで焼くと焼き鳥になる**（**受動モブが 3 種類目**に
なり、豚以外にも肉の出どころができます）。完了の判定 —— **`npm test` に次が増えて全部緑**
（いま 2818 件。**減らさないこと**）:

- 「形が判定 0.4 x 0.7 に収まる」「体積が箱の合計と一致」「振る部位は軸からぶら下がる」（**既存の
  `MOB_KINDS` の表に自動で乗ります**）/「昼の草地に湧く」「石の上には湧かない」「殴らない」
- 「倒すと生鶏肉 1 個」「生鶏肉 → 焼き鳥」と食べたときの値（生 2 / 1.2・焼き 6 / 7.2・**毒なし**）
- 「共有帯のアイテムが **14 個**（127 まで）」「`MAX_ITEM_ID` が 127」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/mobs.ts` | `MobKind` に `"chicken"` / `CHICKEN` の `MobDef` 1 つ / `MOBS` / `MOB_KINDS` / `PASSIVE_KINDS` に 1 語ずつ |
| `src/items.ts` | 定数 2 つ / `MAX_ITEM_ID` / `item({...})` 2 行 / `FOODS` に 2 行 |
| `src/smelting.ts` | `SMELTING` に 1 行（`import` に肉 2 つ） |
| `test/mobs.test.ts` | `census()` の `counts` に `鶏: 0` と `show()` / 鶏の節（湧き・ドロップ・殴らない） |
| `test/blocks.test.ts` | 共有帯の数え直し（12 → 14）とラベル |
| `test/vitals.test.ts` / `test/smelting.test.ts` | 肉 2 つを食べたときの値 / 「生鶏肉 → 焼き鳥」1 行 |
| `TUNING.md` / `ROADMAP.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | 下の 8 |

**1 行も書かないこと**: **`main.ts`（1450 行 = 停止条件ちょうど。この周は 0 行）** /
**`mobmesh.ts` と `mobrender.ts`**（**どちらも `MobDef` を回すだけの汎用で、モブを 1 種類足すのに
0 行です** —— 形は `groups` / `boxes`、色は `mobRgb()`、光は `applyLight()` が種類を知らずに扱う）/
`use.ts` / `vitals.ts` / `crafting.ts`（**矢の羽根は 7b**）/ `blocks.ts` / `drops.ts` /
`craftscreen.ts` / `inventoryui.ts` / `storage.ts` / `session.ts` / `.claude/**`
（**セーブは 1 バイトも増えません** —— モブは保存しないからです）。

## 3. 使う ID

**アイテム 2 個: `RAW_CHICKEN = 126` / `COOKED_CHICKEN = 127`**（`ROADMAP.md` の予約表の
「126..255 予備」の先頭 2 つ。125 = パンの次）。**ブロックは 0 個**（鶏は置けません）。取ったあと
`111..255 の空き` は **130 → 128**（`npm test` の出力で確かめること）。`MAX_ITEM_ID` は
**125 → 127**。**`SaveData.version` は 1 のまま**（キーも増えません）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| 鶏という生き物（大きさ・体力・速さ・湧きの重み・声・形と色） | `mobs.ts` の `CHICKEN`（**表の 1 つ**） |
| 何を落とすか / どこに湧くか | `MobDef.drop`（`items.ts` の `DROPS` ではない）と `PASSIVE_KINDS` に 1 語（**`trySpawn()` に分岐を書かない**） |
| 肉という物 / 何がどれだけ戻るか | `items.ts` の `item({...})` と `FOODS`（**表の 2 行**） |
| 焼くと何になるか | `smelting.ts` の `SMELTING`（**表の 1 行**） |
| 形 → 頂点 / 描画 | **既にある。1 行も触らない**（`mobmesh.ts` / `mobrender.ts`） |

**新しい「確かめられないもの」は 0 なので `unverifiable-pair` は不要**（描画も音も増えず、声は
`MobDef.voice` が `sfx.ts` の既存の経路に掛かるだけ）。**使うスキルは `add-block`。**

## 5. 実装の要点（この順で）

1. `items.ts` の `BREAD`(125) の下に **`RAW_CHICKEN = 126` / `COOKED_CHICKEN = 127`** と説明を
   置き、**`MAX_ITEM_ID` を `COOKED_CHICKEN` に差し替える**
2. `item({...})` 2 行（`block: AIR` / `stack: MAX_STACK` / **`tool: null`** —— `ToolKind` が
   増えると `TOOL_ATTACK` に無い種類が入って **NaN**。色は生 `0xd3a08e` / 焼き `0xc98a4b`）
3. `FOODS` に 2 行 —— 生 **`{ hunger: 2, saturation: 1.2, poison: false }`** / 焼き
   **`{ hunger: 6, saturation: 7.2, poison: false }`**（本家の値。**焼き鳥はパン 5 / 6 より上・
   焼き豚 8 / 12.8 より下**）。`SMELTING` に **`[RAW_CHICKEN, { out: COOKED_CHICKEN, count: 1 }]`**
4. `mobs.ts` に `CHICKEN`（羊の下）。**`size: { half: 0.2, height: 0.7, step: 0.5 }` /
   `maxHealth: 4` / `speed: 1.7` / `hostile: false` / `damage: 0` / `spawnWeight: 10` /
   `voice: 1.8` / `drop: { item: RAW_CHICKEN, count: 1, chance: 1 }`**、`ranged` / `teleport` /
   `orbit` / `phases` / `shearing` / `spawnOn` は **`null`**、`flying` / `fireproof` / `boss` は
   **false**、`hover` / `regen` は **0**
5. 形は **0 = 体（fixed）/ 1 = 頭（head。くちばし・とさか・目）/ 2..3 = 脚 / 4..5 = 翼（swing）**。
   **0.4 x 0.7 は狭く、豚・羊と違って後ろもはみ出せません**（テストの `longBody` は豚と羊だけ）
   —— **すべての箱を x ±3.2px・z ±3.2px・y 11.2px に収め、振る部位の箱は `y1 === 0`**。色は
   体と翼 `0xf0f0f0` / くちばしと脚 `0xf0a020` / とさか `0xd63b2f` / 目 `0x2b1e1c`
6. **`main.ts` は 0 行**（湧きも `KeyM` のデバッグ湧きも `MOB_KINDS` を回すので、もう通っています）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/mobs.test.ts`: `census()` の `counts` に **`鶏: 0` を足す**（**足さないと `counts[name]++`
  が `NaN` になり、数えているつもりで何も見ていません**）。`show()` にも並べ、**「昼の草地に鶏が
  湧く」と「石の上に受動は湧かない」に鶏を入れる**（既存の `inCave.豚 === 0 && inCave.羊 === 0`
  は**消さずに足す**）/ 「受動モブは殴らない」に **`MOBS.chicken.damage === 0`** / **鶏を倒すと生
  鶏肉 1 個**（**殴った側と撃った側を並べて**。`dropFor()` の 1 本を通ることの確認）
- `test/blocks.test.ts`: **`sharedItems.length === 14`** と `sharedItems[12] === RAW_CHICKEN` /
  `sharedItems[13] === COOKED_CHICKEN` / `MAX_ITEM_ID === COOKED_CHICKEN`（**ラベルの「12 個
  （125 まで）」も 14 個（127 まで）に。ゆるめるのではなく数え直す**）/ 肉 2 つは
  **`placedBlock() === AIR`・`toolOf() === null`・`foodOf() !== null`**
- `test/vitals.test.ts`: **生鶏肉（+2 / 1.2）と焼き鳥（+6 / 7.2）**を食べた前後を出力してから
  判定 / **どちらも毒つきでない**。`test/smelting.test.ts` に **「生鶏肉 → 焼き鳥」**を 1 行

## 7. このタスク固有の禁じ手

1. **`crafting.ts` を触らない**（矢を羽根の形に戻すのは 7b）/ **取る ID は 126 と 127 の 2 つだけ**
2. **`MobDrop` に 2 つ目の落とし物（`extra` / 配列）を足さないこと**（羽根は 7b の話で、
   表の形を変えるのはその周の仕事。`MobDef.drop` は 1 行のまま）
3. **`test/mobs.test.ts` の `longBody` に `chicken` を足さないこと**（「胴が判定より長い四足」の
   例外。**入れると形の点検が丸ごと外れます** —— **判定（`size`）ではなく形を削ること**）
4. **`mobmesh.ts` / `mobrender.ts` / `main.ts` / `use.ts` / `vitals.ts` に「鶏」と書かない**
5. **新しい `MobMotion` を足さない**（翼は脚と同じ `swing`）/ **`spawnOn` を付けない**（受動に
   付けると `trySpawn()` 側にも手が要ります。`rules/mobs.md`）
6. **既存の `FOODS` 4 行・`SMELTING` 5 行・他の `MobDef` を書き換えない** / **`SaveData` を
   触らない**（モブは保存しません）/ **テストの判定をゆるめないこと**

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2818 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` に「**鶏（AUTODEV 16）**」の節を 1 つ（**体力 4・速さ 1.7・
湧きの重み 10・声 1.8** と、**生鶏肉の毒 —— 本家は 30% で食中毒だが `FoodDef` に確率が無いので
毒なしにした**こと）/ `ROADMAP.md` の予約表に 126 / 127 の行を足して「**実装済み**」にし、
**予備を 128..255 に直す**（`158` 行あたりの「アイテム ID は 126 から」も 128 からに）/
**C-3: `npm run build` → `(npx --no-install http-server dist -p 8080 --silent &)` →
`node tools/browsershot.mjs` と `npm run shot -- mobs` を撮り、`Read` で開いて「鶏の形が壊れて
いないか（面の抜け・埋まり）」を自分の目で見る**（**撮っただけでは確かめたことになりません**。
写った不具合は直す）/ `AUTODEV-QUEUE.md` の 7 番を消す / 仕様書を `済` に / `HANDOFF.md` を書き直す。
