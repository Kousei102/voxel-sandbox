# 仕様: はしご（置ける・壊れる・作れる）（19a）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の 19 を、この周に 2 件へ割った前半**（後半 19b「登れる」は
キューへ書き戻しました）。**割った理由は 120 行に収まらなかったこと**（`AUTODEV.md` の B）。

**この周に `main.ts` をコードで数え直しました。** 置く・壊す・落ちるは**壁掛けの松明
（`WALL_TORCH_*`）とまったく同じ形**で、`tryPlace()` が `placedVariant()` と
`supportFace()` を通し、壁を壊せば `World.breakUnsupported()` が落とします ——
**`main.ts` は 0 行**（1448 行のまま）。**登る側（19b）が 1 行だけ要ります。**

## 1. 何を足すか / 完了の判定

**壁に付くはしごブロックを 4 向きぶん足し、棒から作れるようにする。**
**まだ登れません**（掴まる物理は 19b）。**通り抜けられます**（`solid: false`）。

`npm test` に**「はしご」の一群が約 10 件増えて全部緑**（いま 3123 件）。とくに:
`ladderVariant()` が 4 向きを返し天井と床は `AIR` / 壁の 4 面それぞれに置くと
その向きの ID が入る / 床（上面）を狙うと `blocked` / 壁を壊すと `onAutoBreak` が
1 回 / 棒 7 本で 3 個 / 掘ると 145 が 1 個。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts` / `src/crafting.ts` / `src/placing.ts`（**メッセージの 1 行だけ**）/
`test/blocks.test.ts` `test/placing.test.ts` `test/crafting.test.ts` / `ROADMAP.md`。

**触らない**: **`src/main.ts`（0 行）** / `src/items.ts`（アイテムもドロップも自動。下の 3）/
`src/player.ts` `src/vitals.ts` `src/physics.ts`（**登る側は 19b**。この周で先取りしないこと）/
`src/mesher.ts` `src/*render.ts` `src/ui.ts` `src/inventoryui.ts` `src/world.ts` / `test/arena.ts`。

**先に読むこと**（自動では読み込まれません）: `grep -l '"src/blocks.ts"' rules/*.md` →
`rules/beds.md` `rules/blocks-shapes.md` `rules/items-survival.md`。
`src/placing.ts` → `rules/blocks-shapes.md`。**`test/**` を触るので `rules/testing.md` も。**

## 3. 使う ID —— `ROADMAP.md` の予約表の 145 から 4 個

| ID | 名前 | `supportFace` | `variantOf` |
| --- | --- | --- | --- |
| **145** | `LADDER`「はしご」**大元。アイテム 145 もこれ** | `FACE_XP` | 無し |
| 146 | `LADDER_XN` | `FACE_XN` | `LADDER` |
| 147 | `LADDER_ZP` | `FACE_ZP` | `LADDER` |
| 148 | `LADDER_ZN` | `FACE_ZN` | `LADDER` |

**146..148 は `variantOf` を持つのでアイテムが作られず**、掘ると `baseBlock()` = 145 が
落ちます（`items.ts` に 0 行。`rules/blocks-shapes.md` の「`variantOf` は…」）。
**145 は `variantOf` を持たない**ので、自分自身に向けたときの落とし穴（`DROPS` の 1 行）は
掛かりません。**これ以外の番号を取らないこと。**

共通の性質: `opaque: false` / `solid: false` / `hardness: 0.4` / `tool: "axe"` /
`sound: "wood"` / `model: "boxes"`。色は `{ top: 0xc9a063, side: 0xa8823f, bottom: 0x8a6a3f }`。
箱は**壁に貼り付く厚さ 3/16 の板**（`[minX,minY,minZ,maxX,maxY,maxZ]`）:
XP `[0.8125,0,0,1,1,1]` / XN `[0,0,0,0.1875,1,1]` / ZP `[0,0,0.8125,1,1,1]` /
ZN `[0,0,0,1,1,0.1875]`。**`replaceable` も `stacksOnSelf` も付けないこと**
（前者は狙ったマス自身に置かれる、後者は壁の無い所へ積み上がる）。

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 0 個です** —— `unverifiable-pair` は要りません。
描画は `model: "boxes"` の既存の道（`buildProps()`）に乗るだけで `*render.ts` は 0 行。

- **どの向きになるか**は `blocks.ts`: `TORCH_BY_SUPPORT` を**真似た別の表**
  `LADDER_BY_SUPPORT`（添字は面番号。`FACE_YP` と `FACE_YN` は `AIR`）と
  `ladderVariant(face)`。`placedVariant()` へ
  `if (base === LADDER) return ladderVariant(ctx.support);` を松明の行の次に 1 行。
  **`TORCH_BY_SUPPORT` と `torchVariant()` は書き換えないこと。**
- **置けない理由の文**も `blocks.ts` に `supportHint(base)` を 1 つ。**表から引くこと**:
  `placedVariant(base, { support: FACE_YN, hitY: 0, facing: FACE_XP }) === AIR ? "壁" : "床か壁"`。
  `placing.ts` は `tryPlace()` のメッセージ 1 行を
  `${blockName(base)} は${supportHint(base)}にしか付けられません` へ差し替えるだけ。
  **松明は「床か壁」のまま**（はしごは床を狙っても置けないので、共通の文のままだと嘘になります）。
- **レシピ**は `crafting.ts` に 1 行:
  `{ name: "はしご", out: LADDER, count: 3, shape: ["S.S", "SSS", "S.S"], key: { S: STICK } }`
  （本家と同じ棒 7 本で 3 個）。

## 5. 書くテスト（**値を出してから判定する**。`rules/testing.md`）

1. `test/blocks.test.ts` — `ladderVariant()` の 6 面ぶんを**並べて出してから**、
   4 向きが取れて `FACE_YP` / `FACE_YN` が `AIR` であること / 146..148 の `variantOf` が
   145 であること / **アイテム一覧に「はしご」が 1 個だけ**（数を出す）/
   `dropOf()` が 4 つとも 145 を 1 個。
2. `test/placing.test.ts` — 本物の `World` で壁の 4 面を狙い、**入った ID を出してから**
   向きが合っていること / 上面を狙うと `blocked` で**文に「壁にしか」が入る**（文を出す）/
   **松明の文が「床か壁」のまま**であること / **壁を壊すと `onAutoBreak` が 1 回**出ること。
3. `test/crafting.test.ts` — 棒 7 本の形を並べ、**出力を出してから** 145 が 3 個。

## 6. このタスク固有の禁じ手

- **145..148 以外の番号を取らない。既存の ID を 1 つも振り直さない**
- **`main.ts` を 1 行も触らない**（登る側の 1 行は 19b のもの。先取りしないこと）
- **`canSupport()` をゆるめない・`placeSpot()` の規則を変えない・`stacksOnSelf` を付けない**
- **`TORCH_BY_SUPPORT` / `torchVariant()` / 松明のメッセージを書き換えない**
- **登る物理を先取りしないこと**（`climbable` の旗も `player.ts` も 19b で足します）
- **既存のテストの判定をゆるめない**（とくに `test/world.test.ts` の p99）

## 7. 終了条件

`npm run typecheck` 緑 / **`npm test` すべて緑**（音の一群が赤ければまず 1 回走らせ直す）/
`npm run build` 緑（`src/**` を触るため）/ **コミット 1 つ** /
**C-3 で撮って `Read` で見る**（見た目に出ます。`npm run shot` と `tools/browsershot.mjs`）/
`ROADMAP.md` の予約表に 145..148 を「実装済み」/ `AUTODEV-QUEUE.md` の 19a の行を消す。
**手触りの数値は 1 つも置かないので `TUNING.md` は触りません**（登る速さは 19b）。
