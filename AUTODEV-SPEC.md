# 仕様: 砂と砂利が落ちる（重力ブロック）

状態: 済
差し戻し: 0 回

`AUTODEV-QUEUE.md` の 1 番。**C の周はこの 1 枚を全文サブエージェントに渡すこと**
（要約すると 2 と 6 が真っ先に落ちます）。**`src/**` と `test/**` は `Read` / `Edit` で開くこと**
（`cat` / `sed` だと `.claude/rules/*.md` が読み込まれません）。

**2026-09-01 にコードで数え直しました**（B の決まり）: `blocks.ts` の `GRAVEL`（44）の説明に
**「落ちません。落ちるブロックの仕組みがまだ無い」**と書いてあり、`src/` に `fall` / 重力で
ブロックを動かす経路はありません（重力は `player.ts` / `mobs.ts` / `drops.ts` /
`projectiles.ts` の速度だけ）。**まだ入っていません。**

## 1. 何を足すか / 完了の判定

**支えを失った砂・砂利が、その場で下まで落ちて積み直す。**

判定: `npm test` に **「重力ブロック（砂と砂利が落ちる）」** の節が増えて、全部緑
（いま 2285 件。増えた件数がそのまま乗ること）。最低限これらを**値を出してから**判定する:

- 砂の真下を掘ると、砂が 1 マス下がる（掘る前後の `getVoxel` を出す）
- 5 段積んだ砂の下を掘ると 5 段とも 1 つずつ下がり、**間に穴が残らない**
- 空中に砂を置くと地面まで落ちる（落ちた先の y と落差を出す）
- 石は落ちない・砂の**横**を掘っても落ちない
- 水の中を落ちて底に着く（水は上書きされて消える = 埋め立て）
- 世界の底（`y = 1`）より下へは落ちない
- 砂の上に載っていた松明は、砂が下がると**支えを失って壊れる**
  （既存の `breakUnsupported` の経路。重力の側は松明を運ばない）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/gravity.ts` | **新規。判断はここ 1 か所**（どこまで落ちるか・何個動いたか） |
| `src/blocks.ts` | `falls` フラグと `fallsDown(id)` だけ。`SAND` と `GRAVEL` に `falls: true` |
| `src/breaking.ts` | `tryBreak()` が消したあとに 1 行呼ぶ |
| `src/placing.ts` | `tryPlace()` が置いたあとに 1 行呼ぶ |
| `test/gravity.test.ts` | 新規（`test/run.ts` に登録） |

**触らないもの**（1 行も）:

- **`main.ts`** —— 配線も要りません（`breaking.ts` / `placing.ts` の中で閉じます）
- **`world.ts`** —— ストリーミングのファイル。判断を置かない。`world.update()` にも足さない
- **`worldgen.ts` / `nethergen.ts` / `endgen.ts` / `structures.ts` / `fortress.ts`** ——
  生成した地形はそのまま（既存の見え方を変えない）
- `drops.ts` / `items.ts` / `crafting.ts` / `mobs.ts` / `ui.ts` / `inventoryui.ts` / `storage.ts`

## 3. 使う ID

**0 個。** 新しいブロックもアイテムも足しません（`AUTODEV-QUEUE.md` の 1 番のとおり）。
**番号を取りたくなったら設計を間違えた合図**なので、止めて人を呼ぶこと
（`AUTODEV.md` の停止条件 1。落下中の姿を別 ID で表す実装は下の 6 で禁じ手）。

## 4. 判断をどこに置くか

**`liquids.ts` と `blocks.ts` の `quenched()` の対がそのまま手本**（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| 規則（座標を知らない） | `blocks.ts` の `fallsDown(id)` —— `LIQUID` / `HOT` と同じ `Uint8Array` の表 1 本 |
| どのマスに効くか | `gravity.ts` —— **`World` を丸ごと受け取らず `getVoxel` / `setVoxel` の 2 つだけ** |
| 呼ぶ側 | `breaking.ts` と `placing.ts` が 1 行ずつ |

**確かめられないもの（three / DOM / GLSL / 音）は 1 つも増えません** → `unverifiable-pair` は不要。
使うスキルはありません（`add-block` も不要 —— ID を足さないので）。

形の目安（同じである必要はないが、**判断の置き場は変えないこと**）:

- `landingY(getVoxel, x, y, z): number` —— そこから下へ、`isReplaceable()` の間だけ下がった先の y
  （空気・水・溶岩・草むらは通り抜ける。**下限は y = 1**）
- `settleColumn(world, x, y, z): number` —— (x,y,z) を底として、真上に積まれた `fallsDown` を
  **下から順に**詰め直し、動かした個数を返す。**上へ走査するのは `fallsDown` でないものに当たるまで**
- **先に落ちる先へ書き、成功したときだけ元のマスを消すこと。** 逆にすると、未読み込みの列で
  `setVoxel` が false を返したときに砂が消えます（`liquids.ts` の「書き込みが失敗しても」の裏返し）

## 5. 書くテスト

`test/gravity.test.ts`。`test/liquids.test.ts` と同じ組み立てにすること:

- **規則（`fallsDown`）と効く場所（`settleColumn`）を別々に見る**
- **本物の `World` を使う**（`setVoxel` の戻り値を数えるので `Arena` では肝心の経路が通らない）。
  試験場は `liquids.test.ts` の `stage()` と同じ作り方
- **先に「試験場が効いている」判定を置く**（置けていなければ以下が全部素通りします）
- 見張り 1: **`gravity.ts` に `SAND` / `GRAVEL` / `WATER` / `LAVA` が出てこないこと**
  （`arena.ts` の `sourceOf()` を通す。生で読むとコメントが引っかかります）
- 見張り 2: **`main.ts` に `settleColumn` / `landingY` / `fallsDown` が出てこないこと**

## 6. このタスク固有の禁じ手

- **落下エンティティ（アニメーション）を作らないこと。** 落ちるのは即時（1 フレームで下まで）。
  `droprender.ts` のような描画も、落下中を表すブロック ID も足さない ——
  **この環境では見た目を確かめられません**（`CLAUDE.md`）
- **`world.update()` や生成器から呼ばないこと。** 毎フレーム走らせるとフレーム予算に乗って
  `test/world.test.ts` の p99 が動き、生成直後の地形（砂漠の砂・洞窟の天井の砂利）が
  勝手に崩れて `test/worldgen.test.ts` の見え方まで変わります
- **`breaking.ts` の `autoBreak()` からは呼ばないこと** —— あそこは `world.ts` がそのマスを
  消している**途中**で、ブロックがまだ残っています（`world.ts` の `breakUnsupported`）。
  空振りするだけなので、**呼ばない理由をコメント 1 行で残すこと**
- **既存の支え（`supportFace` / `canSupport`）とドロップ表を書き換えないこと。**
  重力は「支えを失って壊れる」とは別の仕掛けで、松明の経路は今のまま
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）。
  **`SaveData.version` は 1 のまま**（セーブの形は 1 バイトも変えない）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2285 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` に 1 行**: 砂・砂利は即時に落ちる（本家は落下エンティティ。落ちる速さと
  落下ダメージは未実装）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2〜3 行**（砂を掘ったときに上の砂が
  詰まって見えるか・穴や浮いた砂が残らないか・砂を水に落として埋め立てられるか）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 1 番の行を消し、**この仕様書を `状態: 済` に**
