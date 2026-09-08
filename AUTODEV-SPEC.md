# 仕様: 氷（キューの 25a・ブロックと滑りだけ）

状態: 済
差し戻し: 0 回

**キューの 25 を 2 件に割った前半です。** 自然生成（凍った海）は **25b** に回しました ——
**理由は 120 行**で、B の周でコードを追った結果は次のとおりです:

- **凍らせるには `biomes.ts` に「凍った海」を 1 つ足す**しかありません。`resolve()` は
  **海面より低い列を気温に関わらず `OCEAN` に潰す**ので、雪の浜の隣の海も `OCEAN` です
- 前半（このファイル）は **`worldgen.ts` も `biomes.ts` も 1 行も触りません**
- **`main.ts` は ±0 行**（数えました）—— 置く経路は `placing.ts`、壊す経路は
  `breakBlock()` が `tryBreak()` に丸投げで、**残るブロックは `breaking.ts` の `setVoxel` 1 か所**

## 1. 何を足すか と 完了の判定

**氷（ブロック 156 / 同番のアイテム）。半透明の立方体で、上は滑り、壊すと水に戻る。**

`npm test` が緑のまま（いま **3295 件**）、次の 6 つが**値を出してから**増えていること:

- **156 は普通の立方体・`translucent`・`variantOf` なし** —— アイテム 156 が自動で付き
  （`MAX_ITEM_ID` **156**）、**111..255 の空きが 100 → 99**
- **壊すと何も落ちない**（ガラス・ケーキと同じ `NO_ITEM` の 1 行。素手でもツルハシでも 0 個）
- **壊したマスが `AIR` ではなく `WATER` になる**（素手・ツルハシ・クリエイティブの 3 通り。
  **前後のボクセルを並べてから**）。**石を壊したマスは今までどおり `AIR`**
- **氷の上で滑る** —— 入力を離してから 1 秒で進む距離が土の **3 倍以上**で、
  **空中では差が出ない**（両方の速度と距離を出してから）
- **一覧の色**がいちばん近い相手と **RGB で 20 以上**離れている（**相手の名前と数値を出してから**）

## 2. 触るファイルと、触らないファイル

**触る**: `src/blocks.ts` / `src/items.ts` / `src/breaking.ts` / `src/physics.ts` /
`src/player.ts` / `tools/shot.ts` / `test/blocks.test.ts` / `test/breaking.test.ts` /
`test/physics.test.ts` / `ROADMAP.md` / `TUNING.md` / `AUTODEV-QUEUE.md` /
`docs/autodev-log.md` / `HANDOFF.md`

**触らない**: **`src/main.ts`（1 行も開かないこと）** / `worldgen.ts` / `biomes.ts` /
`world.ts` / `mesher.ts` / `lighting.ts` / `gravity.ts` / `mining.ts` / `crafting.ts` /
`vitals.ts` / `placing.ts` / `use.ts` / `items.ts` の `FOODS`

先に読むこと（**自動では読み込まれません**）: **`rules/blocks-shapes.md`**（旗の足し方・
`isSpiky` / `isClimbable` / `isSticky` の作法）/ **`rules/items-survival.md`**（`DROPS` と
`MAX_ITEM_ID`）/ **`rules/drops.md`** / **`rules/testing.md`**。スキルは **`add-block`**。

## 3. 使う ID

**156 ひとつだけ**（`ROADMAP.md` の予約表の「次の空き」）。**ブロックとアイテムで 1 本の番号**で、
`items.ts` に `item({...})` は書かず、**`MAX_ITEM_ID` を 155 → 156 へ手で伸ばすだけ**
（クモの巣・ケーキとまったく同じ道）。**ほかの番号を 1 つも取らないこと。**

## 4. 判断をどのファイルに置くか

| 何を | どこに |
| --- | --- |
| 形・色・硬さ・音・半透明 | `blocks.ts` の `def` 1 つ |
| **滑るか**（旗だけ。どれだけ滑るかは持たない） | `blocks.ts` の `slippery` / `isSlippery()` |
| **壊したあとに残るブロック** | `blocks.ts` の `breaksInto` / `remainsAfterBreak()` |
| 落ちるものが無いこと | `items.ts` の `DROPS` 1 行 |
| 残ったブロックを書き込む | `breaking.ts` の `tryBreak()` の `setVoxel` **1 か所** |
| 足元のマスを走査する | `physics.ts` の **`bodyStandsOn()`**（`bodyTouches()` の足元版） |
| **どれだけ滑るか** | `player.ts` の 2 定数 |

**新しく「確かめられないもの」は足しません**（`unverifiable-pair` は要りません）。

- **`def`**: `{ top: 0x8fc4f2 }` / `opaque: false` / `translucent: true` / `alpha: 0.6` /
  `hardness: 0.5` / `tool: "pickaxe"` / `sound: "glass"` / `slippery: true`。
  **`blocksSky` は書かないこと**（既定の false。書くと 25b で氷の下の海が真っ暗になります）。
  **`solid` も `replaceable` も `variantOf` も `supportFace` も付けないこと**（普通の立方体）
- **色**: 一覧に出るのは `top` だけ。**20 を割ったら `top` だけ**を寄せ直し、
  **どこまで動かしたかを `TUNING.md` に 1 行**（近いのはガラス `0xa9d8e8`・雪・ダイヤ鉱石）
- **旗**: `slippery` は **`sticky` と 1 つにまとめないこと**（`blocks.ts` の 718 行目の
  コメントが名指しで断っています）。**`isSlippery()` は座標も数値も知らない**
- **残るブロック**: `breaksInto` の既定は `AIR`。氷だけ `WATER`。`tryBreak()` は
  `world.setVoxel(x, y, z, remainsAfterBreak(id))` に**書き換えるだけ**で、
  **`settleColumn()` の呼び方も `autoBreak()` も変えないこと**（氷は支えが要らないので
  勝手に壊れる経路を通りません）
- **滑り**（本家の値から。`TUNING.md` に 1 節）: いまの摩擦 `1 - dt * 12` の **12 を
  `GROUND_FRICTION` に出すだけ**（値は変えない）。氷は **`ICE_FRICTION = 2.3`** ——
  本家の滑りやすさ 0.98（普通のブロックは 0.6）に毎 tick 0.91 を掛けるので
  `-20 * ln(0.98 * 0.91) = 2.29`（普通のブロックは 12.1 で、**いまの 12 とほぼ同じ**）。
  地上の加速は **`ICE_ACCEL_SCALE = 0.23`**（本家は `(0.6 / 滑りやすさ)³` = 0.2296。
  `ACCEL_GROUND` 60 × 0.23 = 13.8 で、空中の 14 とほぼ同じ）
- **`onSlippery` は `moveBody()` の「あと」で見ること**（`inCobweb` と同じ 1 行の並び。
  前に置くと、まだめり込んでいないフレームで真になります）

## 5. 書くテスト

**どれも値を出してから判定すること**（`rules/testing.md`）。

- `test/blocks.test.ts`: 氷 1 節 —— 立方体か / `isTranslucent` / `alpha` / 硬さ / `tool` /
  `isSlippery` / `variantOf` なし / **掘って出るもの 0 個**（素手・ツルハシ・剣の 3 通り）/
  アイテム名と `placedBlock()` が 156 / **色のいちばん近い相手**（既存の節を写す）
- `test/blocks.test.ts` の空きの節: **111..255 の空きが 99・`MAX_ITEM_ID` 156**
- `test/breaking.test.ts`: **壊したマスが水になる**（素手・ツルハシ・クリエイティブ）/
  **石は今までどおり空気**（1 件）/ **落ちるものは 0 山**
- `test/physics.test.ts`: **入力を離してから 1 秒の距離が土の 3 倍以上**（両方出す）/
  **走り出しは氷のほうが遅い**（0.2 秒後の速さを両方出す）/ **空中では同じ**

## 6. このタスク固有の禁じ手

- **`main.ts` を開かないこと**（この周の一番の目的です）
- **自然生成 0 行**（`worldgen.ts` も `biomes.ts` も触らない。凍った海は 25b）
- **`isSticky()` に氷を載せない**（鈍るのと滑るのは別の旗）
- **`tool: "pickaxe"` を書いても `minTier` は書かないこと**（木のツルハシで掘れます）
- **`ICE` をレシピにも精錬にも燃料にも `FOODS` にも 1 行も足さない**
- **`settleColumn()` と `landingY()` の判定を変えないこと**（水は `replaceable` なので、
  氷を壊した上の砂は今までどおり落ちてきます。**それでよい**）
- **`SaveData` の形を変えない**（`version` は 1・キーも増やさない）
- **既存の摩擦 12 と `ACCEL_GROUND` 60 の値を変えないこと**（定数に出すだけ）

## 7. 終了条件

`npm run typecheck` と `npm test`（3295 件 + 増えたぶん）が**すべて緑** / `npm run build` 緑 /
**コミット 1 つを `master` へ push** / `tools/shot.ts` に `ice` の場面を足して
**`npm run shot -- ice` を撮り、`Read` で開いて見た**（自然生成しないので既存の場面には
写りません。**半透明の下が透けているか**と**ガラスと見分けが付くか**を見ること）/
滑りの 2 定数と色を `TUNING.md` に 1 節 / `ROADMAP.md` の予約表に 156 を「実装済み」で 1 行 /
`AUTODEV-QUEUE.md` の 25a を消す / このファイルの `状態:` を `済` に /
`HANDOFF.md` を丸ごと書き直す。
