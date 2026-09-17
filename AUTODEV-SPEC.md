# 仕様: ツタを壁に掛ける（キューの 34a・**共有帯 4 個**）

状態: 未着手
差し戻し: 0 回

**キューの 34「ツタ」を 2 つに割った前半です**（理由は下の ⚠）。この周は**はしご
（145..148）とまったく同じ「壁に掛かる 4 向き」**までで、**垂れ下がり（ツタの下にツタ）と
自然生成は 34b**（`AUTODEV-QUEUE.md` に書き戻しました）。

**先に引いて読むこと**（`grep -l '"src/blocks.ts"' rules/*.md`）: **`blocks-shapes.md` /
`items-survival.md` / `beds.md`**、**`test/**` を触るので `testing.md`**、**`tools/shot.ts` は
`meshing-render.md`**。スキルは **`add-block`** だけ（確かめられないものは増えません）。

## 1. 何を足すか と 完了の判定

**壁の 4 面に掛けられて、登れて、刃物でだけ落ちるブロック 4 向き。**
`npm test` が緑のまま増えて、少なくとも次が緑:

- **`vineVariant()` が壁 4 面で 4 つの ID を返し、床（`FACE_YN`）と天井（`FACE_YP`）で
  `AIR`**（はしごと同じ。`supportHint(VINE)` が表から **「壁」** を出す）
- **4 向きとも `isClimbable()` が真**・**`isBladed()` が真なのはクモの巣とツタ 4 向きの
  5 個**（**下の（6）—— 数え直しであってゆるめるのではない**）
- **アイテム 183 が「ツタ」で `placedBlock(183) === 183`**・**184..186 にアイテムが無い**・
  **`MAX_ITEM_ID` が 186**・**色が一覧の既存どれとも 20 以上離れている**
- **素手と斧では 1 個も落ちず、剣とシアーズで 1 個落ちる**（`mining.ts` の `canHarvest()`）・
  **進行（クリア導線）は 13 / 13 のまま**・**`SaveData` version 1・形も ±0**

## 2. 触るファイル / 触らないファイル（**触るのはこの 5 つだけ**）

| ファイル | 足すもの |
| --- | --- |
| `src/blocks.ts` | ID 4 つ / `VINE_COLORS` と `VINE_OPTS` / `VINE_BOX_*` 4 つ / `def()` 4 つ / `VINE_BY_SUPPORT` と `vineVariant()` / `placedVariant()` に 1 行 |
| `src/items.ts` | **`MAX_ITEM_ID` の 1 行だけ**（アイテムは for が自動で作ります） |
| `test/blocks.test.ts` | `vines()` の 1 節と、`cobwebs()` の `isBladed` の数え直し |
| `test/items.test.ts` / `test/mining.test.ts` | 下の（5） |
| `tools/shot.ts` | 場面 `vine` を 1 つ（**`ladders` を写すのがいちばん安い**） |

**1 行も触らないファイル**: **`src/main.ts`（±0 行。向きを決めるのは `placedVariant()`）**・
`player.ts`（`climbable` に聞く形が 19b で入っています）・`worldgen.ts` / `biomes.ts`（**自然
生成は 34b**）・`crafting.ts`（**本家にレシピはありません**）・`items.ts` の `DROPS`（**自分が
1 個**が既定）・`mining.ts` / `placing.ts` / `world.ts` / `*render.ts` / `ui.ts`。

## 3. 使う ID（`ROADMAP.md` の予約表から）

**共有帯の次の空きは 183。ここから 4 つ**（`ROADMAP.md` の「183..255 予備 73 個」）。
**はしご 145..148 とまったく同じ並び**で、大元だけ `variantOf` を書きません:

| ID | 名前 | `supportFace` | `variantOf` |
| --- | --- | --- | --- |
| **183** | `VINE`（大元・**アイテム 183 もこれ**） | `FACE_XP` | **書かない** |
| **184 / 185 / 186** | `VINE_XN` / `VINE_ZP` / `VINE_ZN` | `FACE_XN` / `FACE_ZP` / `FACE_ZN` | `VINE` |

**`MAX_ITEM_ID` を 186 へ伸ばすこと** —— 忘れると一覧に 1 枠も出ません。

## 4. 判断をどのファイルに置くか

**全部 `blocks.ts` の表です。** 新しく確かめられないものは 1 つも増えません。

- **`climbable: true`** —— 表 1 本（`isClimbable()`）。**速さは持たない**（`LADDER_CLIMB_SPEED`）
- **`bladed: true`** —— 刃物でだけ落ちる。**`tool: "sword"` と書かないこと**（書くと剣が
  採掘道具になって速く掘れます）。**何が刃物かは `items.ts` の `isBlade()`**、**効くのは
  `mining.ts` の `canHarvest()` の 1 行**（どちらも ±0 行）
- **`VINE_BY_SUPPORT` は `LADDER_BY_SUPPORT` と別の表にすること**（松明とはしごが
  別々なのと同じ理由。共有すると片方を並べ替えたときにもう片方が黙って壊れます）
- **性質**: `opaque: false` / `solid: false` / `hardness: 0.2` / `tool: "axe"` / `sound: "grass"` /
  `model: "boxes"` / 箱は**壁に貼る厚さ 0.0625**（本家と同じ 1/16。はしごの 0.1875 より
  薄い）。**`blocksSky` は書かない**
- **色は `top: 0x306d18`**（本家のツタ）。**この周に 144 種で測って**いちばん近いのは
  **トウヒの葉 38.2 / 葉 39.4**（判定 20）。**C の周は 145 種で測り直すこと**

## 5. 書くテスト（**値を出力してから判定する**。`rules/testing.md`）

- **`test/blocks.test.ts` に `vines()` の 1 節**: 4 つの `def` と `supportFace` を並べて出す /
  `vineVariant()` を 6 面ぶん出して**壁 4 面が 4 ID・床と天井が `AIR`** /
  `supportHint(VINE) === "壁"` / **4 向きとも `isClimbable()` と `isBladed()` と `isProp()` が
  真・`solid` と `opaque` が偽** / **`stacksOnSelf` / `needsSoil` / `isReplaceable` /
  `isSlippery` / `isSticky` / `isSpiky` が 4 つとも偽**（対照に石・草むら・はしごを
  並べること）/ **`baseBlock(184..186) === VINE`**
- **`cobwebs()` の `isBladed` は数え直す**: `bladed.length === 1` → **`=== 5`** とし、**件名に
  理由を書くこと**（例:「刃物でだけ落ちるのはクモの巣とツタ 4 向きの 5 個（ツタが入って
  数え直した。ゆるめていない）」）。**`isSticky` が 1 個のままであること**が「旗を 1 つに
  まとめなかった」証拠なので、**そちらは 1 文字も変えない**
- **`test/items.test.ts`**: アイテム 183 の名前・`placedBlock` / **184..186 が `allItemIds()`
  に無い** / `MAX_ITEM_ID === 186` / **いちばん近い相手と隔たりを出してから 20 以上**
  （骨・木炭と同じ形）/ **置けるが道具でも食べ物でもない**
- **`test/mining.test.ts`**: `canHarvest(VINE, ...)` を**素手・斧・剣・シアーズの 4 つ並べて
  出し**、**剣とシアーズだけ真**

## 6. このタスク固有の禁じ手

1. **`LADDER_OPTS` を撒かないこと**（`VINE_OPTS` を別に作る。厚さも音も硬さも違います）。
   **`LADDER_OPTS` のコメント「ツタも足場もまだ無い」は嘘になるので直すこと**
2. **`replaceable` / `stacksOnSelf` / `needsSoil` を付けないこと。** `replaceable` は
   `placeSpot()` が狙ったマス自身を返して置けなくなり、`stacksOnSelf` は**横に**生えます
   （**下に垂れるのは 34b**）
3. **`ladderVariant()` / `LADDER_BY_SUPPORT` / `torchVariant()` を 1 文字も変えないこと**
4. **既存の ID を振り直さないこと**・**`SaveData.version` は 1 のまま**・
   **テストの判定をゆるめないこと**（`isBladed` は**数え直し**。件名に理由を書く）
5. **レシピも自然生成も足さないこと**（34b。この周は**クリエイティブの一覧から取ります** ——
   クモの巣・氷と同じ）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` すべて緑**（音が跳ねたら**もう一度走らせる**）/
  `npm run build` 緑（`src/**` を触るため。**`npm run bench` は要りません**）
- **`npm run shot -- vine ladders` を撮って `Read` で開いて見ること**（見た目が本体です。
  **4 向きが壁に貼り付いているか・裏返っていないか・はしごと見分けが付くか**）。
  **写った不具合はこの周で直すこと**
- **コミット 1 つを `master` へ push** / `AUTODEV-QUEUE.md` の 34a の行を消す / **この仕様書の
  `状態:` を `済` にする** / `ROADMAP.md` の予約表に 183..186 を実装済みと書く /
  `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を丸ごと書き直す** / **踏んだ落とし穴を
  `rules/` へ据える**（無ければ「決まりごと 0 件」）/ **色をずらしたら `TUNING.md` に 1 行**

## ⚠ 34 を 34a / 34b に割った理由

**`supportFace` は 1 ブロックに 1 つしか持てず**（`canPlaceAt()` も `breakUnsupported()` も
その 1 向きだけを見ます）、本家の「壁が無くても真上のツタにぶら下がる」には**2 つ目の候補**が
要ります —— **置き方そのものの変更**なので、**自然生成と合わせて 34b の 1 周**にしました。
