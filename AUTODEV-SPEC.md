# 仕様: サトウキビが時間で上へ伸びる（18c）

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の 18b を割った後半**（18b「積める」は 2026-09-05 に実装済み）。
**⚠ 前の周の「`main.ts` の配線 6 行」はこの周にコードで数え直して覆りました。** 6 行は
**新しい器のファイルを作る**ときの値で、**既にある `Crops` に乗せれば 5 本はもう繋がって
います**（`main.ts:1229` が `crops.update(dt, world)` を呼び、`307` / `553` / `595` がセーブと
後始末を通す）。**足りないのは「置いたものを覚える」1 本だけ**で、**`main.ts` は +1 行**
（1447 → **1448**。止まる目安 1450 の内側）。**新しい ID は 0 個**、**`SaveData` の形も変わりません**
（`crops` は今までどおり `Record<string, number>`・省略可・`version` 1）。

## 1. 何を足すか / 完了の判定

**プレイヤーが置いたサトウキビが、時間で 1 マスずつ上へ伸びる**（`CANE_HEIGHT_MAX = 3` まで）。
**上を刈るとまた伸びてきます**（砂糖の畑が成り立つ）。判定（`npm test` が**全部緑のまま**、
次が増えていること。**いま 3100 件**）:

- `test/crops.test.ts` に「伸びるサトウキビ」の節が **9 件**（下の 5.）/
  `test/ui.test.ts` の `routed` に `crops.notePlaced(` が増えて緑
- **数え直し**: **111..255 の空き 111・`MAX_ITEM_ID` 144・アイテム 109 種・
  立方体 39 / 非立方体 72・1..63 の空き 9 が 1 つも動かない**
- **`main.ts` は 1448 行以内**（`npm test` の「main.ts N 行」）

## 2. 触るファイル / 触らないファイル

| ファイル | 何を書くか |
| --- | --- |
| `src/crops.ts` | `CANE_GROW_SECONDS` / `notePlaced()` / `update()` を 3 つに分ける（下の 4.） |
| `src/placing.ts` | `PlaceOutcome` の `placed` に **`at: UseSpot`** を足し、**4 つの `return` を埋める**（`tryPlace` / `tryIgnite` / `tryTill` / `tryPlant`） |
| `src/main.ts` | **`placeHeld()` に 1 行だけ**: `crops.notePlaced(placed.at, placed.id, world);` |
| `test/crops.test.ts` `test/ui.test.ts` | 下の 5. |
| `rules/stateful-blocks.md` | 「育つ苗」の節を広げる（**`crops.ts` は苗だけの器ではなくなった**） |
| `TUNING.md` `ROADMAP.md` `docs/autodev-log.md` | 秒数 1 行 / 143 の行に「伸びる」/ 1 節 |

**触らないこと**: **`src/blocks.ts`（0 行 —— `SUGAR_CANE`・`CANE_HEIGHT_MAX`・`stacksOnSelf`・
`supportsBlock()` はそのまま使う）** / `world.ts` / `worldgen.ts` / `items.ts` / `crafting.ts` /
`biomes.ts` / `storage.ts`（**`SaveData` の形**）/ `DROPS` / `furnaces.ts` / `chests.ts`。
**`main.ts` に 1 行より多く書かないこと。**

**先に読むこと**（自動では読まれません）: **`rules/stateful-blocks.md`（要）**・`rules/blocks-shapes.md`・
`rules/testing.md`・`rules/items-survival.md`・`rules/use.md`。**スキルは 3 つとも当たりません。**

## 3. 使う ID

**0 個。** ブロックもアイテムも増えません（**次の空きは 145 のまま**。`ROADMAP.md` の予約表）。
**段の違いを ID で表さないこと**（`rules/stateful-blocks.md`。**同じ `SUGAR_CANE` を積むだけ**）。

## 4. 判断をどのファイルに置くか

**全部 `crops.ts`。** `main.ts` は「置いた」を伝えるだけで、**何が伸びるかも何秒かも知りません。**

- **`CANE_GROW_SECONDS = 180`**（`GROW_SECONDS` の隣）。本家は 1 マスにつき乱数ティック
  16 回 ≒ 18 分で、**小麦（本家 ≒ 20 分 → ここ 180 秒）と同じ縮尺**です。**`main.ts` に
  数値を書かないこと**（既存の見張り `!/\b180\b/` がそのまま効きます）。
- **`notePlaced(at, id, world)`** —— **`id !== SUGAR_CANE` なら何もしない**（`placeHeld()` は
  全部のブロックで呼ばれます）。覚えるのは **`at` ではなく、その列のいちばん下のサトウキビ**:
  `getVoxel(x, y-1, z) === SUGAR_CANE` の間 `y` を下げてから `map.set(cropKey(x,y,z), 0)`。
  **下を覚えるのが鍵です** —— 上を覚えると刈った瞬間に印が消えて二度と伸びません。
  同じ列に 2 本置いても**キーが 1 つに畳まれます**。`at` が無い呼びは素通りさせること。
- **`update()` は列が読み込まれているか（`hasColumn`）を今までどおり先に見て**、そのあと
  **素の `getVoxel(x,y,z)` で 3 つに分ける**こと（`baseBlock()` を使わないのは
  `rules/stateful-blocks.md` のとおり）: `WHEAT_CROP` → **いまの苗の道をそのまま** /
  `SUGAR_CANE` → 下の道 / それ以外 → **忘れる**。
- **サトウキビの道**（上から順に）: **① 上へ舐めて段数を数える**（`SUGAR_CANE` の間 `top` を
  上げる）**② `height >= CANE_HEIGHT_MAX` なら育てない。忘れもしないこと** —— **秒数を 0 に
  戻して次のフレームへ**（刈られたら 0 秒から伸び直す）。**`changed` を立てないこと**（毎フレーム
  `saveDirty` が立ちます。既に 0 なら書かない）**③** 秒数を足し、`CANE_GROW_SECONDS` に
  満たなければ持ち越す。**`getVoxel(x, top+1, z) !== AIR` なら書かない**（塞がっている。
  **秒数は持ち越すこと**）**④** `setVoxel(x, top+1, z, SUGAR_CANE)` が**成功したときだけ**
  秒数を 0 に戻して `changed = true`（`syncLit()` と同じ作法。失敗は持ち越す）
- **`Math.random()` を入れない**（既存の見張り）。**`World` を丸ごと受け取らない** —— 入口は
  今までの `CropWorld` の 3 つで足ります。
- **自然に生えたサトウキビは伸びません**（誰も置いていないので印が無い）。**生成はもう 1〜3 段で
  ばらけている**ので穴にならず、**上に 1 本置けば列ごと覚えます。** 本家との差なので
  `HANDOFF.md` に 1 行。

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。手本は同じファイルの小麦の節で、
**偽物のワールド（`CropWorld`）で足ります**（`World` を作らないこと）。`test/crops.test.ts` に
「伸びるサトウキビ」の節を作り、**先に `CANE_GROW_SECONDS` と `CANE_HEIGHT_MAX` を
1 行出す**こと（**秒数は import する**。写さない）。9 件:

1. **段数の移りを 1 行に出してから**「秒数ごとに 1 段」「3 段で止まる」（4 回まわして 1→2→3→3）
2. **刈ったら伸び直す**（3 段の上 2 つを `AIR` に → また 2 回で 3 段）
3. **覚えるのは列の下**（2 段の**上**を `notePlaced` → `peek` が下のマスを返す。**2 本置いても
   キーは 1 つ**。`count` を出すこと）
4. **サトウキビ以外を置いても 1 つも覚えない**（石で `count` 0）
5. **塞がっていたら伸びない・忘れない**（上に石。秒数が残っていることを出す）
6. **列が未読み込みなら忘れない**（`hasColumn` が false。小麦の節と同じ形）
7. **掘られたら忘れる**（`AIR` にして `count` 0）
8. **`changed` は伸びた／忘れたときだけ true**（3 段で止まっている間に 2 回まわして両方 false）
9. **小麦とサトウキビが同じ表に混ざっても互いを壊さない**（1 つずつ入れて両方進める）

`test/ui.test.ts` の `routed` に **`["置いたものを覚える", "crops.notePlaced("]`** を足すこと
（**一覧はゆるめず、増やすだけ**）。

## 6. このタスク固有の禁じ手

- **`main.ts` に 2 行以上書かないこと**（1448 行を超えたら止めて人を呼ぶ）。**`SaveData` の形を
  変えない**・**`version` は 1 のまま**・**新しい ID を取らない**・**段を ID で表さない**・
  **`blocks.ts` を 1 行も触らない**
- **`world.update()` の中で育てないこと**（`test/world.test.ts` の p99）。
  **`crops.ts` に `Math.random()` / `Mesh` / `AudioContext` / `document` を入れないこと**
- **小麦の道（`WHEAT_CROP` の枝）を 1 行も変えないこと**（既存の 9 件が通ったままであること）
- **既存の判定をゆるめて緑にしないこと**（この周に反転してよい判定は 1 件もありません）

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **全部緑**（3100 件から増えている）/ `npm run build` 緑 /
**コミット 1 つ** / `AUTODEV-QUEUE.md` の 18c の行を消す / この仕様書を `状態: 済` に /
**`ROADMAP.md` の 143 の行に「伸びる」** / **`TUNING.md` に `CANE_GROW_SECONDS` の 1 行** /
**`docs/autodev-log.md` に 1 節**（**配線が 6 行でなく 1 行で済んだ理由も 1 行**）/
**`rules/stateful-blocks.md` を広げた** / **`HANDOFF.md` を書き直す** / **`master` へ push**。

**C-3（撮る）**: **絵が変わるのは「時間が経ったあと」だけ**（置いた瞬間は 18b と同じ）。`npm run
shot -- beach terrain` で**面の欠け・裏返り 0 件**を見れば足ります。**手触りは `HANDOFF.md` に 2〜3 行。**
