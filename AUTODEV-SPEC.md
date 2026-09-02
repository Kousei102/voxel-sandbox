# 仕様: 育つ器（`crops.ts`）と実った小麦

状態: 未着手
差し戻し: 0 回

**キューの「13. 育つ器と小麦・パン」を割った前半**（**後半 2 つは 14 番・15 番**として書き戻し済み）。
**数え直し済み**（2026-09-02）: `crops` / `WHEAT_CROP_RIPE` / `bread` / `パン` は `src/**` にも `test/**` にも
1 件もなく、**苗（121）・種（122）・`tryPlant()` は前の周で入っています**（実装前: 2707 件緑 / `main.ts` 1444 行）。

## 1. 何を足すか / 完了の判定

**植えた苗が時間で育ち、実ったら小麦が採れる。** 耕地の上の苗を `GROW_SECONDS` 秒ぶん放っておくと
**実った小麦（別のブロック ID）に差し替わり**、掘ると**小麦（アイテム）が 1 個**出ます。育ち具合は
**位置ごとの状態**（`furnaces.ts` の器の形）で持ち、**セーブに省略可キー `crops` が 1 つ**増えます。
**種は戻りません**（1 回の採掘で 2 山落とす器が無いため。**14 番**で入れます）。完了の判定 ——
**`npm test` に次が増えて全部緑**（いま 2707 件）:

- 「**立方体 36**（±0）/ **非立方体 69**（68 → 69）/ **アイテム 89 種**（88 → 89）/
  `MAX_ITEM_ID` 124 / **111..255 の空き 131**（133 → 131）」
- 「`GROW_SECONDS` 秒で実る」「**未読み込みの列では育たず、忘れられもしない**」「下が耕地でなければ
  育たない」「苗が消えていたら忘れる」「実ったら `crops` から消える」「`setVoxel` が失敗したら持ち越す」
- 「実った小麦を掘ると**小麦 1 個**」「耕地を掘っても落ちる」「実った小麦はアイテムを持たない」
  「`crops` は空なら書き出さない（**植えていない人のセーブは 1 バイトも増えない**）」「次元をまたいでも残る」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `crops.ts`（**新規**） | **判断は全部ここ。** 育つ秒数・育つ条件・実らせる・忘れる・セーブの形 |
| `blocks.ts` | `WHEAT_CROP_RIPE = 123` の `def`（`WHEAT_CROP` の隣。**`variantOf: WHEAT_CROP`**） |
| `items.ts` | `WHEAT = 124` ・`MAX_ITEM_ID` ・`DROPS` に 1 行 |
| `storage.ts` / `dimensions.ts` / `session.ts` | **省略可キー `crops` を 1 つ**通すだけ（下の 5) |
| `main.ts` | **配線だけ（+6 行以内**。いま 1444 / **1450 を超えたら停止条件**） |
| `tools/shot.ts` | 撮るための場面を 1 つ（`SCENES` に `crops`。**`src/**` ではない**） |

**1 行も書かないこと**: `placing.ts`（`tryPlant()` はもう正しい）/ `use.ts` / `crafting.ts`（**パンは 15 番**）/
`vitals.ts`（**小麦は食べ物ではない**。`FOODS` に足さない）/ `durability.ts` / `world.ts`（**育つ仕掛けを
`world.update()` に足さない**）/ `breaking.ts`（`DROPS` の 1 行で足ります）/ `mobs.ts` / `sfx.ts` /
`audio.ts`（**新しい音を足さない**）/ `*render.ts` / `inventoryui.ts` / `ui.ts` / `.claude/**`。

## 3. 使う ID

**123..124 の 2 個**（`ROADMAP.md` の予約表「123..255 予備」の先頭から詰めて取る）。**123 = 実った小麦
（ブロック）/ 124 = 小麦（アイテム）。95..110 は空けたまま。** **実った小麦は `variantOf: WHEAT_CROP`**
（苗と違って**大元にできる相手が居る**）。だからアイテムも名前も増えませんが、**`dropOf()` の既定は
大元＝苗**なので **`DROPS` の 1 行が必須**です（書き忘れると、実らせても種しか採れません）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| 何秒で育つか・育つ条件・実らせる・忘れる・どの ID に差し替えるか | `crops.ts`（**`main.ts` に秒数を書かない**） |
| 実った小麦から何が落ちるか | `items.ts` の `DROPS` |
| 支えを失ったら壊れる | `blocks.ts` の `supportFace: FACE_YN`（苗と同じ 1 行） |
| セーブのキーの並び・読み戻し | `session.ts`（**`main.ts` に `typeof` の均しを書かない**） |

**新しい「確かめられないもの」は 1 つも足しません**（`crops.ts` は three も DOM も音も触りません）ので
`unverifiable-pair` は不要。**使うのは `add-stateful-block` スキル**です。

## 5. 実装の要点（この順で）

1. `blocks.ts`: `export const WHEAT_CROP_RIPE = 123;` と `def(WHEAT_CROP_RIPE, "実った小麦", { top: 0xd8c26a }, { opaque: false, solid: false,
   hardness: 0, sound: "grass", model: "cross", boxes: CROSS_BOX, supportFace: FACE_YN,
   variantOf: WHEAT_CROP })`。**`replaceable` を付けない**
2. `items.ts`: `WHEAT = 124` / `MAX_ITEM_ID = WHEAT` / `item({ id: WHEAT, name: "小麦", block: AIR,
   stack: MAX_STACK, color: 0xd8c26a, tool: null })` / `DROPS` に
   `[WHEAT_CROP_RIPE, { item: WHEAT, count: 1, chance: 1 }]`。**`FOODS` には足さない**
3. `crops.ts`（**`furnaces.ts` を読んでから写すこと**）: `Crops` クラス。`plant(x, y, z)` /
   `peek(x, y, z): number | null`（育った秒数）/ `count` / `clear()` / `update(dt, world): boolean` /
   `serialize(): Record<string, number> | undefined` / `deserialize(raw)`。**受けるのは `World` 丸ごと
   ではなく `getVoxel` / `setVoxel` / `hasColumn` の 3 つ**（`beds.ts` と同じ作法）。`update()` は 1 マスごとに:
   - **列が読み込まれていなければ何もしない**（`hasColumn(columnOf(x), columnOf(z))`。**`getVoxel` は
     未読み込みで AIR を返すので、ここを飛ばすと遠くの畑が丸ごと忘れられます**）
   - `baseBlock(getVoxel(...)) !== WHEAT_CROP` なら**忘れる**（掘られた・上書きされた）
   - **真下が `FARMLAND` でなければ育たない**（忘れはしない）
   - `age += dt`。`GROW_SECONDS`（**180 秒。暫定**）を超えたら `setVoxel(WHEAT_CROP_RIPE)`。
     **成功したときだけ忘れる**（失敗したら持ち越して次のフレーム。`syncLit()` と同じ）
   - **返り値は「実った / 忘れた」ときだけ true**（毎フレーム true にすると `saveDirty` が立ちっぱなしに
     なり、**苗が 1 本あるだけで自動保存が回り続けます**）
4. `main.ts`（**+6 行以内**）: `const crops = new Crops();`（説明は 1 行に収める）/ `startWorld()` の
   `furnaces.deserialize(...)` の隣に `crops.deserialize(state.crops);` / `frame()` の `furnaces.update(dt)`
   の隣に `if (playing && crops.update(dt, world)) saveDirty = true;` / `plantAt()` の最後に
   `crops.plant(x, y + 1, z);` / `collectState({ ... })` と `forgetEverything({ ... })` の
   **中括弧に `crops` を足す**（行は増えません）
5. セーブ: `storage.ts` の `SaveData` に `crops?: Record<string, number>`（`"x,y,z"` → 育った秒数）、
   `dimensions.ts` の `DimensionState` に同じ 1 行と `normalize()` に 1 行、`session.ts` の
   `StateSources` / `collectState()` / `SaveParts` / `buildSave()` / 読み戻し / `forgetEverything()`。
   **`version` は 1 のまま**（省略可のキーを 1 つ足すだけ。`edits` に混ぜないこと）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- **`test/crops.test.ts`（新規）**: 上の 1 の 2 つ目の箱を全部（偽物のワールド 3 本で書けます）と、
  往復（`serialize` → `deserialize`）・**壊れた値を飛ばす**こと。**秒数は `GROW_SECONDS` を import
  すること**（180 と書くとゆるめた判定になります）
- `blocks.test.ts`: 立方体 36 / 非立方体 69 / アイテム 89 / 空き 131（**出力を読むこと**）。**「共有帯の
  アイテムは 10 個（122 まで）」を 11 個（124 まで・`MAX_ITEM_ID === WHEAT`）に直す** —— ゆるめるのでは
  なく数え直す。`itemName(WHEAT_CROP_RIPE) === ""` / `baseBlock(WHEAT_CROP_RIPE) === WHEAT_CROP`
- `breaking.test.ts`: 実った小麦を掘ると小麦 1 個 / **耕地を掘ると `autoBreak()` の経路で落ちる**。
  `items.test.ts`: `foodOf(WHEAT)` も `toolOf(WHEAT)` も null
- `storage` / `session` / `dimensions`: `crops` が往復する / **空なら書き出さない** / 次元をまたいでも残る。
  `ui.test.ts` の `routed` に `["苗が育つ", "crops.update("]` / **`main.ts` に `GROW_SECONDS` が無い**

## 7. このタスク固有の禁じ手

1. **ブロック ID を 8 個使って 8 段階にしない**（本家の形。ここは 2 段階 = 123 の 1 個だけ）
2. **`world.update()` の中で育てない**（`test/world.test.ts` の p99 にストリーミングの退行と混ざります）
3. **`hasColumn` の確認を省かない**（上の 5-3）/ **`crops.ts` が `world` を丸ごと受け取らない・
   `Math.random()` を使わない**（乱数を入れると、育つ秒数をテストで固定できなくなります）
4. **`version` を上げない・`edits` に混ぜない・ID を振り直さない・判定をゆるめない**
   （`blocks.test.ts` の 1 件は「10 個 → 11 個」と**増やす**だけ）
5. **パン・小麦の食べ物化・種が戻る話を持ち込まない**（15 番と 14 番。取ると 1 周で閉じません）

## 8. 終了条件

`npm run typecheck` と `npm test` が緑 / `npm run build` / **コミット 1 つ** / `TUNING.md` に 1 行
（`GROW_SECONDS` 180 秒・実った小麦の色 `0xd8c26a`・**種が戻らないのは暫定**）/ `ROADMAP.md` の予約表に
**123..124 を「実装済み」** / **見た目に出るので C-3 の撮影**（`tools/shot.ts` に場面を 1 つ足して
`npm run shot -- crops`。**苗と実った小麦を並べて撮り、`Read` で開いて見ること**。`browsershot.mjs` も
撮れるなら撮る）/ キューの 13 番の行を消す / この仕様書を `済` に / `HANDOFF.md` を丸ごと書き直す。
