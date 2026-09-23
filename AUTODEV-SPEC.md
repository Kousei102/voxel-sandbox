# 仕様: サボテンは砂の上にしか置けない（キューの 44・**ID 0 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: 入っていません。`def(CACTUS)`
（`blocks.ts` 1647 行）は `supportFace: FACE_YN` と `stacksOnSelf: true` だけで、**土の類を選ぶ
表は `needsSoil`（苗木 2 種）しかありません**。`supportsBlock()`（2825 行）は `canSupport()` に
落ちるので、**石でも板でも草でも立ちます**。**自然生成は触らなくてよい** —— 砂漠の木の枠に
立てていて（`worldgen.ts` 265 行・`biomes.ts` の砂漠は `surface: SAND`）、`test/worldgen.test.ts`
の「サボテンが浮いていない」（1063 行）が**根元の下が `SAND` であることを既に見ています**。

## 1. 何を足すか / 完了の判定

**サボテンは真下が砂のときだけ立つ**（本家 Alpha）。置く側（`World.canPlaceAt`）も壊す側
（`World.breakUnsupported`）も `supportsBlock()` を通るので、**真下の砂を別のブロックに
置き換えるとサボテンが壊れて落ちます**（苗木と同じ 1 行で両方が済む形）。**サボテンの上の
サボテン（積む・伸びる）は今までどおり**。置けないときの文は「サボテン は**砂の上**にしか
付けられません」。
**完了**: `npm test` に**「サボテンは砂の上だけ（44）」の節**が増えて**すべて緑**
（**+10〜14 件。3914 → 3926 あたり**）。**数え直す既存の件は 0 件の見込み**（既存のサボテンの
テストはどれも砂の上に立てています —— `test/blocks.test.ts` 3391 行 / `tools/shot.ts` の `cactus`）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts`（**旗 2 つ・表 2 本・関数 2 本・`supportsBlock()` 1 行・`supportHint()` 1 行・
`def(CACTUS)` と `def(SAND)` に 1 行ずつ**）/ `test/blocks.test.ts`（節 1 つ + 3004 行の旗の表に 1 行）/
`test/placing.test.ts`（節 1 つ）/ `rules/blocks-shapes.md`（1 段）/ `TUNING.md` / `AUTODEV-QUEUE.md` /
`docs/autodev-log.md` / `HANDOFF.md`。

**触らない**: **`src/main.ts`（0 行）** / **`src/world.ts`**（`canPlaceAt` も `breakUnsupported` も
`supportsBlock()` を通すので 1 行も要らない）/ **`src/placing.ts`**（文は `supportHint()` から出る）/
`src/worldgen.ts` / `src/treeshape.ts` / `src/biomes.ts`（**生成は砂の上に立て済み**）/
`src/crops.ts`（伸びるのは「サボテンの上のサボテン」で、`stacksOnSelf` の行が先に真を返す）/
**`canSupport()`**（壁掛けの松明とベッドの足場。`rules/blocks-shapes.md`）/ `SaveData` /
`ROADMAP.md` の予約表 / `tools/shot.ts`（`cactus` の場面は元から砂の台）。

**先に引いて読むこと**（`grep -l '"src/blocks.ts"' rules/*.md` ほか）: `blocks-shapes` / `beds` /
`items-survival` / `testing`（`test/**` を触るので）。

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（**次に取るのは 189 のまま**。予約表は動かさない）。

## 4. 判断をどこに置くか

**全部 `blocks.ts` の表**です（**新しい「確かめられないもの」は 0 個**。`unverifiable-pair` は不要）。
**`needsSoil` / `soil`（30a）とまったく同じ形をもう 1 組**作ります:

- `BlockDef` に `readonly needsSand: boolean`（**真下が砂でなければ立てない**）と
  `readonly sand: boolean`（**`needsSand` の相手**）。`def()` の既定はどちらも `false`
- 表 `NEEDS_SAND` / `SAND_GROUND`（`Uint8Array(ID_LIMIT)`。`NEEDS_SOIL` / `SOIL` の隣）と、
  引く関数 `needsSand(id)` / `isSand(id)`（`needsSoil()` / `isSoil()` の隣）
- `def(CACTUS)` に `needsSand: true`、`def(SAND)` に `sand: true`（**砂岩・赤い砂は足さない**。
  本家の赤い砂はここに無く、砂岩の上には本家でも立ちません）
- `supportsBlock()` に 1 行、**`stacksOnSelf` の行より後・`needsSoil` の行の隣**:
  `if (needsSand(id) && !isSand(supporter)) return false;`
  —— **この順を入れ替えないこと**（先に置くとサボテンの上のサボテンが落ち、伸びも止まる）
- `supportHint()` に 1 行（`needsSoil` の行の隣）: `if (needsSand(base)) return "砂の上";`

**`id === CACTUS` / `supporter === SAND` と書かないこと**（`isSoil()` と同じ表 1 本の作法）。

## 5. 書くテスト（**値を出力してから判定する**）

`test/blocks.test.ts` に**「サボテンは砂の上だけ（44）」の節**（`describe()` から。`cactusStack()`
の隣に関数 1 本。**本物の `World` を使うこと** —— `crops.test.ts` の `Field` は `canPlaceAt` を
持たないので、足し忘れても緑のままです。3363 行の注意）:

- **表を出してから**: `needsSand` が真のブロックの名前一覧 → **サボテンだけ**。`isSand` が真の
  一覧 → **砂だけ**。`needsSand` と `needsSoil` が両方真のブロックは **0 個**
- **真理値表を 1 行に出してから**: `supportsBlock(砂, FACE_YP, サボテン)` 真 /
  草・土・石・砂岩・板で偽 / **`supportsBlock(サボテン, FACE_YP, サボテン)` は真のまま**
- **対照**: `supportsBlock(草, FACE_YP, 苗木)` 真・`supportsBlock(砂, FACE_YP, 苗木)` 偽（30a の線が
  動いていない）/ `supportsBlock(石, FACE_YP, 松明)` 真（`canSupport()` をゆるめても狭めてもいない）
- **本物の `World` で**: 草の上に `setVoxel(CACTUS)` は `false` でマスは `AIR` のまま / 砂の上は `true` /
  **砂の上に 2 段積んでから、根元の砂を土に置き換えると 2 段とも落ちる**（`onAutoBreak` が 2 回）
- `supportHint(CACTUS) === "砂の上"` / 苗木は `"土か草の上"` のまま / 松明は `"床か壁"` のまま
- 3004 行の旗の表に `["needsSand", needsSand]` を足し、その下の「付いていない」判定にも
  `!needsSand(id)` を足す（**判定を狭めるほうの変更なので可**。ゆるめないこと）

`test/placing.test.ts` の 423 行の節の**隣に 1 節**（同じ書き方。`Slab` と `tryPlace`）:
**砂・草・土・石・砂岩の 5 通りを一覧で出してから**、砂だけ `placed`・残りは `blocked` で
**マスが空のまま** / 草の上の文が **「砂の上にしか」**を含み `blockName(CACTUS)` を含む。

## 6. このタスク固有の禁じ手

- **`canSupport()` を 1 文字も触らないこと** / **`main.ts` / `world.ts` / `placing.ts` に 1 行も書かないこと**
- **生成（`worldgen.ts` / `treeshape.ts` / `biomes.ts`）を触らないこと** —— 立て済みです。
  **もし上の「サボテンが浮いていない」が赤くなったら、生成を直さずに止めて `HANDOFF.md` に書くこと**
- **「横に固いブロックがあると壊れる」は足さないこと**（37 で見送った別件。1 周 1 件）
- **サトウキビ（45）に手を出さないこと** —— 砂の表を流用したくなっても次の周です
- **既存のセーブの扱いを変えないこと**: 草の上に置いてあったサボテンは `createChunk` が差分を
  直に書くので**そのまま残ります**（真下が書き換わったときにだけ落ちる）。**消して回る処理を
  足さないこと**（`TUNING.md` に 1 行書く）
- `SaveData.version` は 1 のまま / **テストの判定をゆるめないこと**

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` すべて緑** / `npm run build` 緑。**`bench` は不要**
  （生成もメッシュ化も触らない）
- **C-3**: **見た目は 1 つも変わりません**が、**`npm run shot -- cactus` を 1 枚撮って `Read` で見ること**
  （置いた 2 本が 3 段・自然の 1 本が 1 段のまま、砂の台に立っていること。**直す前にも 1 枚撮って
  `md5sum` を比べれば足ります**）。ブラウザ（`browsershot.mjs`）は要りません
- **コミット 1 つを `master` へ push** / `AUTODEV-QUEUE.md` の 44 の行を消す / この仕様書を
  **`状態: 済`** に / `rules/blocks-shapes.md` に 1 段（**支えを狭める表が 2 組になった**こと・
  **`stacksOnSelf` の行より後に置く理由**）/ **`TUNING.md` に 1 節**（砂だけ・砂岩は不可・
  既存のセーブは消さない）/ `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を書き直す**
