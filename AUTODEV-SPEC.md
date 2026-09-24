# 仕様: サトウキビは水辺の土・草・砂の上にしか置けない（キューの 45・**ID 0 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: 入っていません。`def(SUGAR_CANE)`
（`blocks.ts` 2022 行）は `supportFace: FACE_YN` と `stacksOnSelf: true` だけで、`supportsBlock()`
（2860 行）は `canSupport()` に落ちるので**石の上にも立ち、水も見ていません**
（`test/blocks.test.ts` 3296 行が「石の上のサトウキビ」を**真**として見張っているほど）。
**「横が水」は `supportsBlock()`（真下の 1 マスしか受け取らない）では見られない**ので、
`World.canPlaceAt()`（`world.ts` 213 行）と、その写しの `test/arena.ts` の `canPlaceAt()`（114 行）に
1 か所ずつ足します。**生成は触りません** —— 浜のサトウキビは水面 y40 より 1 段上の y41 に
立っていて水際を見ていません（`rules/worldgen.md` 138 行。**自然のものは水辺でなくても残ります**）。

## 1. 何を足すか / 完了の判定

**サトウキビの根元（自分の上に積んだ段ではない 1 段目）は、真下が土・草・砂で、かつ
その真下のマスの横 4 マス（±X・±Z、同じ高さ）のどれかが水のときだけ立つ**（本家 Alpha）。
**耕地・砂岩・石は不可**（本家 Java どおり）。**積んだ 2 段目より上は今までどおり**
（真下がサトウキビなら水を見ない）。真下の土を掘る・砂を置き換えると落ちるのは
`supportsBlock()` を通るので自動で揃います。置けないときの文は
「サトウキビ は**水辺の土・草・砂の上**にしか付けられません」。
**完了**: `npm test` に**「サトウキビは水辺だけ（45）」の節**が増えて**すべて緑**
（**+12〜16 件。3927 → 3941 あたり**）。**書き換える既存の件は 3 か所**（下の 5.）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts`（旗 3 つ・表 3 本・引く関数 3 本・純関数 1 本・`supportsBlock()` 1 行・
`supportHint()` 1 行・`def(SUGAR_CANE)` / `def(GRASS)` / `def(DIRT)` / `def(SAND)` / `def(WATER)` に 1 行ずつ）/
**`src/world.ts`（`canPlaceAt()` に 3〜5 行だけ）** / `test/arena.ts`（`canPlaceAt()` に同じ 3〜5 行）/
`test/blocks.test.ts` / `test/placing.test.ts` / `rules/blocks-shapes.md` / `TUNING.md` /
`AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md`。

**触らない**: **`src/main.ts`（0 行）** / `src/placing.ts`（文は `supportHint()` から出る）/ `src/crops.ts`（伸びるのは
積んだ段で水を見ない）/ **生成**（`worldgen.ts` / `biomes.ts` / `treeshape.ts`）/ **`canSupport()`** /
`World.breakUnsupported()`（`canPlaceAt()` に聞くので 0 行）/ `SaveData` / 予約表 / `tools/shot.ts`。

**先に引いて読むこと**: `grep -l '"src/blocks.ts"' rules/*.md`（`blocks-shapes` / `beds` / `items-survival`）
と `grep -l '"src/world.ts"' rules/*.md`（`lighting` / `meshing-render`）と `testing`（`test/**` を触るので）。
**とくに `rules/blocks-shapes.md` の「狭める表は 2 組あります」の段**（3 組目はこの形で足せ、と書いてある）。

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（**次に取るのは 189 のまま**。予約表は動かさない）。

## 4. 判断をどこに置くか

**判断は全部 `blocks.ts`。`world.ts` と `arena.ts` は 4 マスを読んで渡すだけ**（新しい
「確かめられないもの」は 0 個。`unverifiable-pair` は不要。スキルは使わない）。

- **床: 3 組目の狭める表** `needsBank` / `bank`（`needsSoil` / `soil`・`needsSand` / `sand` と同じ形）。
  `bank: true` は**草・土・砂の 3 つだけ**（耕地は `soil` でも `bank` にしない）。`needsBank: true` はサトウキビ。
  `supportsBlock()` に **`needsSand` の行の隣・`stacksOnSelf` の行より後**で
  `if (needsBank(id) && !isBank(supporter)) return false;`
  —— **`needsSoil` や `needsSand` をサトウキビに付けて済ませないこと**（両方付けるとどこにも立たない）
- **水: 旗 1 組** `needsWater`（サトウキビ）/ `wetsBank`（**水 `WATER` だけ**。溶岩・氷は付けない）と、
  **純関数 1 本** `waterBesideOk(id: number, below: number, besideBelow: readonly number[]): boolean`:
  `!needsWater(id)` なら真 / **`below === id && stacksOnSelf(id)` なら真（積んだ段）** /
  それ以外は `besideBelow` のどれかが `wetsBank` なら真。**`id === SUGAR_CANE` / `=== WATER` と書かないこと**
- **`World.canPlaceAt()`**: `supportFaces()` の for の**前**に 1 か所、
  `if (needsWater(id) && !waterBesideOk(id, 真下, [真下の ±X, ±Z の 4 マス])) return false;`。
  **`needsWater(id) &&` で先に切ること**（`canPlaceAt` は `breakUnsupported` から全隣接で呼ばれる。
  サトウキビ以外で配列を作らない）。4 方向は `OFFSETS` の水平 4 面から引いてよい
- **`test/arena.ts` の `canPlaceAt()`** にもまったく同じ行（**「`World.canPlaceAt()` と同じ式」の写しは
  ここ 1 か所だけ**、とコメントにあるとおり。忘れると `placing.test.ts` だけ本物と食い違います）
- `supportHint()` の**先頭**に `if (needsWater(base)) return "水辺の土・草・砂の上";`

## 5. 書くテスト（**値を出力してから判定する**）

**新しい節**「サトウキビは水辺だけ（45）」を `test/blocks.test.ts` に（サボテンの 44 の節の隣。**本物の `World`**）:

- **表を出してから**: `needsBank` 真の一覧 → **サトウキビだけ** / `isBank` 真 → **草・土・砂だけ**
  （耕地・砂岩が入っていない）/ `needsWater` 真 → サトウキビだけ / `wetsBank` 真 → **水だけ** /
  **`needsSoil`・`needsSand`・`needsBank` のうち 2 つ以上が真のブロックは 0 個**（44 の「両方真」を 3 本に広げる。狭めるほう）
- **真理値表を 1 行に出してから** `supportsBlock(床, FACE_YP, サトウキビ)`: 草・土・砂 真 / 石・砂岩・耕地・板 偽 /
  **サトウキビの上 真のまま**。対照: 苗木（草 真・砂 偽）とサボテン（砂 真・草 偽）が動いていない
- **`waterBesideOk` の表を出してから**: 横に水 1 つ 真 / 横が全部空気 偽 / 横が溶岩だけ 偽 /
  **真下がサトウキビなら横に水が無くても 真** / サトウキビ以外（松明）は何でも 真
- **本物の `World` で**: 砂の横に水を置いて 1 段目 `true` / **水の無い砂** `false` でマスは `AIR` のまま /
  **斜めだけに水**（`(+1, 下, +1)`）は `false` / **水が 1 段上（根元と同じ高さ）だけ**でも `false` /
  水辺に 3 段積んでから**根元の砂を石に置き換えると 3 段とも落ちる**（`onAutoBreak` が 3 回）
- `supportHint(SUGAR_CANE) === "水辺の土・草・砂の上"` / 苗木 `"土か草の上"`・サボテン `"砂の上"` のまま
- 3013 行の旗の表に `needsBank` / `needsWater` を足し、その下の「付いていない」判定にも足す

**書き換える既存の件（3 か所。どれも「水辺に立てる」準備を足すだけで、判定はゆるめない）**:

1. `test/blocks.test.ts` 3296 行「石の上のサトウキビ」→ **偽を期待**に変え、見出しも
   「石の上のサトウキビは置けない」へ（**仕様どおりに狭まった**ことを `console.log` に出す）
2. 同 3322 行の 3 段積み: 砂 `(cx, ground-1, cz)` の横 `(cx+1, ground-1, cz)` に `WATER` を 1 つ置く
   （**それ以外の判定と回数は変えない**）
3. `test/placing.test.ts` 186 行の `beach()`: `slab.fill(-4, 4, 10, 10, 1, 1, WATER)` を 1 行
   （y10 の z=1 の列を水にする → `(0,10,0)` と `(1,10,0)` の砂が水辺になる。**3 つの判定はそのまま**）

`test/placing.test.ts` にも 1 節（44 の節の隣。`Slab` と `tryPlace`）: **水辺の砂・草・土 / 水の無い砂 /
水辺の石 / 水辺の耕地**の 6 通りを一覧で出してから、前 3 つだけ `placed`、残りは `blocked` で
マスが空のまま / 文が「**水辺の**」と `blockName(SUGAR_CANE)` を含む。

## 6. このタスク固有の禁じ手

- **`canSupport()` を 1 文字も触らないこと** / `main.ts` / `placing.ts` / `crops.ts` に 1 行も書かないこと
- **`world.ts` に判断を書かないこと** —— 読むのは 5 マス、決めるのは `waterBesideOk()`。
  `canPlaceAt()` 以外（`breakUnsupported` ほか）は 1 行も触らない
- **「水を汲むと横のサトウキビが落ちる」は足さないこと**（`breakUnsupported` は面で接する隣しか
  見ないので、斜め上を見る話になる。**本家とは違うまま**。`TUNING.md` に 1 行・見送りは `docs/autodev-log.md`）
- **生成を触らないこと**（浜のサトウキビは水辺でないまま残る。**消して回らない**。既存のセーブも同じ）
- **苗木・サボテンの表（`soil` / `sand`）にサトウキビを混ぜないこと**（混ぜると苗木が砂に立つ）
- **キノコ（46）に手を出さないこと**（1 周 1 件）/ `SaveData.version` は 1 のまま / **判定をゆるめないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`** / `npm run build` 緑。**`bench` は不要**（生成もメッシュ化も触らない）
- **C-3**: 見た目は変わらないので、**`npm run shot -- terrain` を直す前と後に 1 枚ずつ撮って
  `md5sum` を比べる**（同一のはず。違ったら `Read` で見て理由を書く）
- **コミット 1 つを `master` へ push** / キューの 45 を消す / この仕様書を **`状態: 済`** /
  `rules/blocks-shapes.md` に 1 段（**狭める表が 3 組になった**・**横を見る条件は `supportsBlock()` の外、
  `canPlaceAt()` の 1 行と純関数**・**`arena.ts` の写しも一緒に直す**）/ `TUNING.md` に 1 節
  （草・土・砂 / 耕地不可 / 水を汲んでも落ちない / 自然の浜は水辺でないまま）/
  `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を書き直す**
