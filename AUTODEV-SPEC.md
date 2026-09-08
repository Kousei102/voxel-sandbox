# 仕様: 凍った海（キューの 25b・自然生成）

状態: 未着手
差し戻し: 0 回

**キューの 25 を割った後半です。** 前半（25a・氷 156 とブロックの振る舞い）は
2026-09-08 に実装済みで、**氷の側はもう全部そろっています**（旗・壊すと水・滑り・色）。
**この周で足すのは「寒い海が凍っている」ことだけ**です。

**`main.ts` は ±0 行**（この周に数えました）—— バイオームの名前は `biomeName()` が
`BIOMES` の表を引くので、F3 の表示は 1 行も書かずに増えます。

## 1. 何を足すか と 完了の判定

**凍った海（11 種類目のバイオーム・id 10）。寒い海の海面 1 段（y = `SEA_LEVEL` = 40）が
氷になり、その下は水のまま。**

`npm test` が緑のまま（いま **3322 件**）、次の 6 つが**値を出してから**増えていること:

- **`BIOMES` が 11 種類**・`resolve()` が**寒い海だけ** `FROZEN_OCEAN`（暖かい海は `OCEAN`）
- **分布**: 既存の表に 11 行目が出て、**凍った海が 5% 以上**・**暖かい海も 5% 以上**
  （B の周で数えた実測: シード 12345 で **11.8%**・777 で **9.8%**・2468 で **11.9%**。
  海 26.4% が 14.6% と 11.8% に割れるだけなので、**「45% を超えない」も緑のまま**）
- **凍った海の列は y40 が氷 / y39 も y38 も水 / 地表は今までどおり砂**
- **暖かい海の列は y40 が今までどおり水**（1 マスも氷にならない）
- **氷の上に立てる**（y41 が空気）
- **ID は 0 個**（`111..255` の空きは **99 のまま**・`MAX_ITEM_ID` は **156 のまま**）

## 2. 触るファイルと、触らないファイル

**触る**: `src/biomes.ts` / `src/worldgen.ts` / `test/worldgen.test.ts` /
`TUNING.md` / `AUTODEV-QUEUE.md` / `AUTODEV-SPEC.md` / `docs/autodev-log.md` / `HANDOFF.md`

**触らない**: **`src/main.ts`（1 行も開かないこと）** / `blocks.ts` / `items.ts` /
`breaking.ts` / `physics.ts` / `player.ts` / `lighting.ts` / `mobs.ts` / `world.ts` /
`mesher.ts` / `structures.ts` / `nethergen.ts` / `endgen.ts` / `crafting.ts` / `ROADMAP.md`

先に読むこと（**自動では読み込まれません**）: **`rules/worldgen.md`**（バイオームの作法・
帯状のバイオームの数え方・塩）/ **`rules/testing.md`**。
**スキルは使いません** —— ブロックもアイテムも足さないので `add-block` は要りません。

## 3. 使う ID

**0 個。** 氷は **156** で実装済みです。`FROZEN_OCEAN = 10` は **`BIOMES` の添字**で、
ブロック ID でもアイテム ID でもありません（`biome` は `Uint8Array`・いま 10 種類）。
**`ROADMAP.md` の予約表を 1 行も変えないこと。** 次にブロック番号が要るときは 157 から。

## 4. 判断をどのファイルに置くか

| 何を | どこに |
| --- | --- |
| 寒い海を別のバイオームにする | `biomes.ts` の `resolve()` **1 行** |
| 名前・地表・木・草むら | `biomes.ts` の `BIOMES` に **1 行** |
| **海面 1 段に何を置くか** | `biomes.ts` の **`BiomeDef.seaSurface`**（ブロック ID） |
| 高さで液体を選ぶ | `worldgen.ts` の `wy <= SEA_LEVEL` の **1 か所** |

- **`FROZEN_OCEAN = 10` は `BIOMES` の末尾に足すこと**（`biomeDef(id)` が `BIOMES[id]` なので、
  **添字と id が一致していないと別のバイオームが返ります**）
- `resolve()`: `if (height < SEA_LEVEL) return snowy ? FROZEN_OCEAN : OCEAN;` の **1 行だけ**。
  **`classify()` は 1 文字も触らないこと**（気候だけで決まるものに海は出てきません）
- **`surface` は `SAND` のまま**（海の行の写し）。**`SNOW` にしないこと** ——
  「砂と雪が接するのは海岸だけ」の見張りに当たるうえ、**水の底に雪が敷かれます**
- `trees` / `grass` / `mushroom` / `cane` は **全部 0**（海と同じ。生えものの連鎖は
  1 行も触らないこと。`rules/worldgen.md` の「先に引いたものだけが表どおり」）
- **`seaSurface` は 11 種類すべてに書くこと**（`BiomeDef` の必須の項目にする。
  `?:` にすると**足し忘れが黙って通ります**）。凍った海だけ `ICE`、あとは全部 `WATER`
- `worldgen.ts` は `wy <= SEA_LEVEL ? WATER : ...` を
  **`wy === SEA_LEVEL ? seaSurface : wy < SEA_LEVEL ? WATER : ...`** にして、
  `seaSurface` を **294 行目の分割代入に足すだけ**。
  **`ICE` を `worldgen.ts` に import しないこと**（地表のブロックの判断を
  `biomes.ts` の外へ出さない。`rules/worldgen.md` の頭）
- **新しく「確かめられないもの」は足しません**（`unverifiable-pair` は要りません）

## 5. 書くテスト

**どれも値を出してから判定すること**（`rules/testing.md`）。場所は
`test/worldgen.test.ts` の「バイオーム」の節です。

- **`resolve()` の 1 件を足す**: 既存の「海面より下はどの気候でも海」（`warm`）は
  **そのまま残し**、`cool` の双子（`resolve(c, SEA_LEVEL - 1, cool) === FROZEN_OCEAN`）を
  足すこと。**既存の判定をゆるめて「海か凍った海のどちらか」にしないこと**
- **分布**: 既存の `spread` の表がそのまま 11 行になる。**凍った海の % を出してから**判定
- **断面**: `biomeAt` で凍った海の列を集め、**y40 = 氷 / y39 = 水 / y38 = 水**が
  食い違う列を数えて 0 件。集め方は `rules/worldgen.md` の帯の作法どおり ——
  **±400 を 1 マスおきに舐めて候補を集め、`voxel()` を呼ぶのは先頭 200 列だけ**
  （**点数がそのまま実行時間**。広げる前に `npm test` の秒数を見ること）
- **暖かい海に氷が 1 マスも無い**: 同じやり方で `OCEAN` の列を 200 集め、y40 が全部水
- **氷の上に立てる**: 上の 200 列で y41 が空気
- **凍った海の列の高さは必ず `SEA_LEVEL` 未満**（地形が 1 マスも動いていないことの代わり）

## 6. このタスク固有の禁じ手

- **`main.ts` を開かないこと**（この周も ±0 行です）
- **氷に `blocksSky` を書かないこと** —— 書くと**氷の下の海が真っ暗**になります。
  **25b でいちばん踏みやすい罠です**（`blocks.ts` の 472 行目のコメントが名指ししています）
- **`classify()` を触らない**・**`SNOW_TEMP` / `HOT` / `COLD` / `ALPINE_HEIGHT` の値を
  変えないこと**（砂の隣が雪にならない保証が消えます。`rules/worldgen.md`）
- **`heightAt()` を 1 文字も触らないこと**（地形が動くと、既存のセーブの差分が宙に浮きます）
- **氷を 2 段以上積まないこと**（本家も 1 段。積むと泳げる水が減ります）
- **モブの湧きに手を入れないこと**（氷の上に湧くのは本家どおり。`spawnOn` を 1 行も足さない）
- **`veinAt()` にも `isCave()` にも `applyTrees()` にも触らないこと**
- **氷をレシピ・精錬・燃料・`FOODS` に 1 行も足さないこと**（25a と同じ）
- **`SaveData` の形を変えないこと**（`version` は 1・キーも増やさない）

## 7. 終了条件

`npm run typecheck` と `npm test`（3322 件 + 増えたぶん）が**すべて緑** / `npm run build` 緑 /
**`npm run bench` を 3 回まわして中央値**（`generateChunk` の内側に分岐が 1 つ増えるので。
`rules/worldgen.md`）/ **撮って `Read` で見た** —— 凍った海は**自然生成するので
`node tools/browsershot.mjs` に写ります**（写らなければ `npm run shot -- terrain`。
見るのは**氷の下の海が透けているか**と**雪の浜との境目**）/ `TUNING.md` に 1 行 /
`AUTODEV-QUEUE.md` の 25b を消す / このファイルの `状態:` を `済` に /
`HANDOFF.md` を丸ごと書き直す / **コミット 1 つを `master` へ push**。
