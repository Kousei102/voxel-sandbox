# 仕様: サボテンが育つ（キューの 37・**ID 0 個**）

状態: 未着手
差し戻し: 0 回

**先に読むこと**: `rules/stateful-blocks.md`（とくに 98..176 行の「育つもの（`crops.ts`）」）/
`rules/blocks-shapes.md`（`blocks.ts`）/ `rules/worldgen.md`（`treeshape.ts`）/ `rules/testing.md`。
**スキルは使いません** —— 器（`add-stateful-block`）は `crops.ts` がもう持っていて、
足す ID は 0 個（`add-block`）、確かめられないものも増えません（`unverifiable-pair`）。

## この周の前に分かったこと（2026-09-19 の B の周で実測。**推測ではありません**）

- **`main.ts` は 0 行**。`main.ts:944` の `crops.notePlaced(placed.at, placed.id, world)` は
  **置いた全部のブロックで呼ばれます**。何を覚えるかを決めるのは `crops.ts` 側です
- **⚠ いちばんの落とし穴: `crops.ts` だけ直しても、本物の世界では 1 段も伸びません。**
  `World.setVoxel()` は `canPlaceAt()` を通し（`world.ts:183`）、
  `supportsBlock(CACTUS, FACE_YP, CACTUS)` は**いま false** です
  （`CACTUS` に `stacksOnSelf` が無い。`blocks.ts:1568`）。**書き込みが黙って落ちます**
- **`test/crops.test.ts` の偽の `Field` は `canPlaceAt` を持たないので、これを見逃します。**
  だから**本物の `World` で積む見張りが要ります**（下の 5. の h）
- サボテンの上限は **3 段**（`treeshape.ts:217` の `1 + Math.floor(roll * 3)`。自然生成も 1..3 段）
- **自然に生えたサボテンは伸びません**（誰も置いていないので印が無い）。
  **サトウキビとまったく同じ線**なので、変えないこと（`TUNING.md` の 521 行）

## 1. 何を足すか / 完了の判定

**`crops.ts` の 4 つ目の道として、プレイヤーが置いたサボテンが上へ伸びるようにする**
（小麦・サトウキビ・苗木に続く 4 本目）。

完了の判定:

- `npm test` の**「育つ苗（crops.ts）」が 94 件 → 100 件**（下の 5. の a..f）
- `npm test` の**「サボテンを積む」2 件が増える**（`test/blocks.test.ts`。下の g・h）
- **全体が 3838 → 3846 件で緑**（`npm run typecheck` も緑）。
  件数がずれたら `docs/autodev-log.md` に理由を 1 行残すこと
- **既存 3838 件は 1 件も減らさず、判定を 1 文字も変えないこと**

## 2. 触るファイル / 触らないファイル

| 触る | 何をするか |
| --- | --- |
| `src/blocks.ts` | `CACTUS` の def に **`stacksOnSelf: true` の 1 行**／`CANE_HEIGHT_MAX` の隣に **`CACTUS_HEIGHT_MAX = 3`** を足して export |
| `src/treeshape.ts` | `grownTreeHeight()` の `cactus` の**リテラル 3 を `CACTUS_HEIGHT_MAX` に差し替える**（範囲 1..3 は変えない） |
| `src/crops.ts` | `CACTUS_GROW_SECONDS = 180` / `notePlaced()` に 1 分岐 / `update()` の振り分けに 1 分岐 / `growCane()` を `growStack()` に一般化 |
| `test/crops.test.ts` | a..f の 6 件（サトウキビの節をそのまま手本に） |
| `test/blocks.test.ts` | g・h の 2 件（「砂の上にサトウキビを 3 段積める」の節が手本） |
| `TUNING.md` / `docs/autodev-log.md` / `AUTODEV-QUEUE.md` / `HANDOFF.md` / `ROADMAP.md` | 1 行 / 1 節 / 済んだ行を消す / 丸ごと / **ID は 0 個なので予約表は「変更なし」と書くだけ** |

**触らないこと**: **`main.ts` は 1 行も触らない**（1450 行・停止条件に並んでいます）/
`placing.ts` / `use.ts` / `world.ts` / `worldgen.ts` / `items.ts` / `crafting.ts` /
`mesher.ts` / `player.ts`。**`CACTUS_BOX` も `spiky` も `supportFace` も動かさない。**

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（**共有帯の空きは 69 のまま・次は 187**）。
**`ROADMAP.md` の予約表は 1 行も変えないこと。**

## 4. 判断をどこに置くか

**変わりません**（`rules/stateful-blocks.md` の表そのまま）。

- **何秒で・何段まで・どの条件で伸びるかは `crops.ts` だけ**。`main.ts` にも
  `blocks.ts` にも数値を書かないこと（`test/ui.test.ts` の見張り）
- `blocks.ts` が持つのは**形の話だけ**（積めるか＝`stacksOnSelf`・上限の段数）
- **`growCane()` を写して 2 本にしないこと。** `growStack(key, age, dt, x, y, z, self,
  maxHeight, seconds, world)` に一般化して、**サトウキビとサボテンの両方がここを通る**形に
  すること。**中身の順番も `changed` の立て方も 1 つも変えないこと** ——
  既存のサトウキビ 11 件がそのまま見張りになります
- `notePlaced()` は**積み上がるもの（サトウキビ・サボテン）で列のいちばん下を覚える**。
  **上を覚えると、刈った瞬間に印が消えて二度と伸びません**（舐める比較も `id` で行うこと）

## 5. 書くテスト（**足すのは 8 件**。どれも値を出力してから判定）

`test/crops.test.ts`（「育つ苗」の節・**サトウキビの節を手本に**）:

- **a.** 置いたサボテンが `CACTUS_GROW_SECONDS` ごとに 1 段伸び、**`CACTUS_HEIGHT_MAX` で止まる**
  （段数の並びを出力してから判定）
- **b.** **刈ったら 0 秒から伸び直す**（上を壊して 2 回ぶん進める）
- **c.** **上が塞がっていたら伸びない・秒数は持ち越す・どけたら次のフレームで伸びる**
- **d.** **覚えるのは列のいちばん下**（2 段目を置いて `peek()` が下のマスに乗ること）
- **e.** **未読み込みの列では 1 マスも書かず、印も忘れない**（`unloaded` / `frozen` を使う）
- **f.** **印の無いサボテン（自然生成ぶん）は伸びない**（`notePlaced()` を呼ばずに `update()`）

`test/blocks.test.ts`（**新しい節「サボテンを積む」**）:

- **g.** `supportsBlock(CACTUS, FACE_YP, CACTUS)` が true で、
  **`canSupport(CACTUS, FACE_YP)` は false のまま**（4 つの値を出力する）
- **h.** **本物の `World`** で砂の上に 3 段積めて、**いちばん下を壊すと上 2 段も落ちる**
  （「砂の上にサトウキビを 3 段積める」の節と同じ形。**偽の試験場では確かめたことになりません**）

## 6. このタスク固有の禁じ手

- **`main.ts` に 1 行も足さない**（1450 行・停止条件 2 に並んでいます）
- **既存の判定をゆるめない。** とくに `test/blocks.test.ts:527`
  **「サボテンは細いので支えにならない」（`!canSupport(CACTUS, FACE_YP)`）は真のまま**です
  —— `stacksOnSelf` は `supportsBlock()` の**外側**の例外で、`canSupport()` には触りません
- **`canSupport()` / `CACTUS_BOX` / `supportFace` / `spiky` を動かさない**
  （松明とベッドの足場に効きます。`rules/blocks-shapes.md`）
- **自然に生えたサボテンを伸ばそうとしない**（世界じゅうの砂漠が `SaveData` に乗ります）
- **本家の「砂の上にしか置けない」「横に固いブロックがあると壊れる」を足さない** ——
  この周の外です（見送った理由を `docs/autodev-log.md` に 1 行）
- **育ったサボテンがプレイヤーの居るマスに書かれても特別扱いを足さない**
  （物理が押し出し、`spiky` は `player.ts` が毎フレーム見ています）
- **`SaveData` の形を変えない**（`crops` の表 1 つに乗ります。`version` は 1 のまま）
- **育つ段階をブロック ID で表さない**（`rules/stateful-blocks.md` の 143 行）

## 7. 終了条件

- `npm run typecheck` 緑 / `npm test` **3846 件すべて緑**（2 回走らせて 2 回とも）
- `npm run build` 緑（**`src/**` を触るので要ります**）。**`npm run bench` は不要**
  （生成もメッシュ化も触らないため）
- **絵**: `npm run shot -- terrain` は砂漠を写さない見込みなので、**`CACTUS_HEIGHT_MAX` 段まで
  伸ばしたサボテンが写る場面を撮って `Read` で見ること**（`tools/shot.ts` に場面を 1 つ足すのが
  いちばん安い。`HANDOFF.md` の「絵を撮るときの注意」と前の周の `sheep` が手本）
- **コミット 1 つ**を `master` へ push / キューの 37 の行を消す / この仕様書を `状態: 済` に
- **`TUNING.md` に 1 行**（`CACTUS_GROW_SECONDS` 180 秒・3 段まで・自然生成ぶんは伸びない）
- 踏んだ落とし穴を `rules/` へ据える（`Edit` で普通に直す。無ければ「決まりごと 0 件」と書く）
