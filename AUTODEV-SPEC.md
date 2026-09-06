# 仕様: はしごを登れる（19b）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の 19 を 2 件へ割った後半**（前半 19a「置ける・壊れる・作れる」は
2026-09-06 に実装済み。145..148）。**この周に `climbable` の旗も登る物理もコードから
数え直しました** —— `grep -rn "climbable\|onLadder\|isClimbable" src/ test/` は **0 件**で、
19a は予告どおり 1 行も先取りしていません。**まっさらな状態から足します。**

## 1. 何を足すか / 完了の判定

**はしごに体が重なっているあいだ、重力の代わりに上下する。** 上は `Space`、
押していなければゆっくり滑り降りる。**滑ったぶんで落下ダメージを受けない。**

`npm test` に**「はしご」の一群が約 10 件増えて全部緑**（いま 3143 件）。とくに:
`isClimbable()` が 145..148 の 4 つだけ真 / はしごのマスに入って `Space` で y が増える /
離すと自由落下よりずっと遅く降りる / **隣のマスに立っているだけでは `onLadder` が偽** /
`onLadder` を立てたまま高い所から降りても `lastFall` が 0 のままダメージ 0。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts` / `src/player.ts` / `src/vitals.ts` /
**`src/main.ts`（`updateVitals()` の引数 1 行だけ。下の 4）** /
`test/blocks.test.ts` `test/physics.test.ts` `test/vitals.test.ts` / `TUNING.md`。

**触らない**: **`src/physics.ts`（0 行。`bodyTouches()` はサボテンのものをそのまま使う。
`moveBody()` の式を 1 行も変えないこと —— `test/physics.test.ts` が軌跡を数値で
固定しています）** / `src/placing.ts` `src/crafting.ts` `src/items.ts`（19a で済み）/
`src/mobs.ts` `src/mobrender.ts`（**モブは登りません**）/ `src/mesher.ts` `src/ui.ts`
`src/world.ts` / `ROADMAP.md`（**ID を 1 つも取りません**）/ `test/arena.ts`。

**先に読むこと**（自動では読み込まれません。**当たったものは全部読むこと** ——
19a で 3 本のうち 1 本しか読まずに穴を作りました）:
`grep -l '"src/player.ts"' rules/*.md` → **`rules/blocks-shapes.md` `rules/mobs.md`
`rules/vitals.md`**（`rules/README.md` は一覧なので数に入れません）。
`src/vitals.ts` `src/main.ts` → `rules/vitals.md`。`src/blocks.ts` →
`rules/beds.md` `rules/blocks-shapes.md` `rules/items-survival.md`。
**`test/**` を触るので `rules/testing.md` も**（`paths` が glob なので上では出ません）。

## 3. 使う ID —— **0 個**

**新しいブロックもアイテムも足しません。** 145..148 は 19a が取ってあります。
**`ROADMAP.md` の予約表を 1 行も触らないこと**（次の空きは 149 のまま）。
**既存の ID を 1 つも振り直さないこと。** `SaveData` の形も変えません（version 1・
はしごに掛かっているかは毎フレーム見るだけで、覚えません）。

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 0 個です** —— `unverifiable-pair` は要りません。
描画も音も 0 行で、足すのは全部「値で確かめられる側」です。

- **どのブロックが登れるか**は `blocks.ts`: `BlockDef` に `climbable` を 1 つ足し、
  `def()` の既定を `false`、`CLIMBABLE = new Uint8Array(ID_LIMIT)` の表と
  `isClimbable(id)` を **`SPIKY` / `isSpiky()` とまったく同じ形**で作ること
  （表の作り方は `blocks.ts:1536` と `1554`、関数は `1741`）。
  **`id === LADDER` と書かないこと**（`rules/blocks-shapes.md` の「表 1 本に聞く」）。
  旗は **`LADDER_OPTS` に `climbable: true` の 1 行**だけ —— 4 向きが一度に付きます。
  **他のどのブロックにも付けないこと**（ツタも足場もまだありません）。
- **どのマスに効くか**は `player.ts`: `touchingSpikes` と**同じ 1 行**を
  `moveBody()` のあとに置く（`player.ts:125` の隣）:
  `this.onLadder = bodyTouches(world, this.position, PLAYER_SIZE, isClimbable);`
  **押し戻したあとで見ること**（動かす前に見ると 1 フレームずれます。既存のコメント参照）。
  `onLadder` は `touchingSpikes` と同じ public な旗で、**そこに数値を書かないこと。**
- **どう動くか**は `player.ts` の `updateWalk()`: **液体の分岐（`if (this.inLiquid)`）を
  先に見て、そのあとに `else if (this.onLadder)`** を足す（**水がはしごに勝ちます**。
  順を逆にすると水中で泳げなくなります）。中身は 2 行:
  `Space` を押していれば `this.velocity.y = LADDER_CLIMB_SPEED`、
  押していなければ `this.velocity.y = -LADDER_SLIDE_SPEED`。
  **重力を足さないこと**（足すと滑り落ちる速さが毎フレーム増えます）。
  **横（x/z）の式は 1 行も変えないこと** —— 歩いてはしごから離れられなくなります。
  **速さの数値は `player.ts` に置くこと**（`WALK_SPEED` / `SWIM_SPEED` の隣）。
  暫定値は本家のまま **`LADDER_CLIMB_SPEED = 2.35` / `LADDER_SLIDE_SPEED = 3.0`（m/s）**。
- **落ちたぶんを打ち消すか**は `vitals.ts`: `VitalsContext` に `onLadder: boolean` を足し、
  `updateFall()`（`vitals.ts:476`）の 2 か所だけを直す ——
  `grounded` に `|| ctx.onLadder` を足し、ダメージの条件に `&& !ctx.onLadder` を足す。
  **`lastFall` の式も `peakY` の持ち方も変えないこと**（`inLiquid` とまったく同じ扱いです）。
- **`main.ts` は事実を 1 行渡すだけ**（`main.ts:1282` の `vitals.update(dt, {` の中へ
  `onLadder: player.onLadder,`）。**これで 1449 行**（上限 1500・止まる目安 1450）。
  **2 行以上足したら、その時点で止めて `HANDOFF.md` に書くこと。**

## 5. 書くテスト（**値を出してから判定する**。`rules/testing.md`）

1. `test/blocks.test.ts` — **登れるブロックの ID を全部並べて出してから**、
   `[145,146,147,148]` の 4 つだけであること（数も出す）/ 石・サボテン・松明・水が偽。
2. `test/physics.test.ts` —（`describe("はしごに掴まる（player.onLadder）")`）
   本物の `Arena` に石の壁を立て、その手前のマスへ `LADDER` を縦に数マス置く。
   **入る前の位置と `onLadder` を出してから**、歩いて入ると真 / **隣のマスに
   立っているだけでは偽**（無いと「常に真」の実装が通ります）/ `Space` を押した
   60 フレームで **y が増える**（前後の y と 1 秒あたりの速さを出す）/ 離した
   60 フレームで **降りるが自由落下よりずっと遅い**（`velocity.y` を出し、
   はしごの無い所で同じだけ落ちた対照と比べる）。
3. `test/vitals.test.ts` — `ctx({ onLadder: true })` で 20 マス滑り降りてから着地しても
   **`lastFall` が 0・体力が満タンのまま**（値を出す）/ **`onLadder: false` の対照では
   ちゃんとダメージが入る**（無いと「いつも 0」の実装が通ります）。

## 6. このタスク固有の禁じ手

- **`src/physics.ts` を 1 行も触らない**（`moveBody()` の式・評価順・`bodyTouches()`）
- **`main.ts` は 1 行だけ**（判断を書かない。`player.onLadder` を渡すだけ）
- **はしごを `solid` にしない・`supportFace` と `variantOf` を触らない**（19a のもの）
- **`climbable` を他のブロックに付けない・モブに登らせない**
- **液体の分岐より前にはしごを見ない**（水中で泳げなくなります）
- **`Space` 以外の新しいキーを足さない**（`controls.ts` と `test/controls.test.ts` の話になります）
- **既存のテストの判定をゆるめない**（とくに `test/physics.test.ts` の軌跡と
  `test/world.test.ts` の p99、`test/vitals.test.ts` の落下）

## 7. 終了条件

`npm run typecheck` 緑 / **`npm test` すべて緑**（音の一群が赤ければまず 1 回走らせ直す）/
`npm run build` 緑（`src/**` を触るため）/ **コミット 1 つ** /
**C-3 は `npm run shot -- ladders` で 1 枚だけ**（見た目は 19a から変わりませんが、
はしごの箱を壊していないことの確認。**撮ったら `Read` で見ること**）/
**`TUNING.md` に 1 行**（2.35 と 3.0 の出どころと、上げ下げすると何が変わるか）/
`AUTODEV-QUEUE.md` の 19b の行を消す / `HANDOFF.md` を丸ごと書き直す。
