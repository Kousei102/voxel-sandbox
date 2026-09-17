# 仕様: ツタが下へ垂れる（キューの 34b・**ID 0 個**）

状態: 済
差し戻し: 0 回

**キューの 34b を 2 つに割った前半です**（理由は末尾の ⚠）。この周は**「壁が無くても
真上のツタにぶら下がれる」**ところまでで、**森の葉から自然に垂らすのは 34c**。

## 1. 何を足すか / 完了の判定

**ツタ（183..186）に「2 つ目の支えの候補 = 真上の同じツタ」を持たせる。**
置く側（`World.canPlaceAt`）・壊す側（`World.breakUnsupported`）・向きを決める側
（`vineVariant()` / `placedVariant()`）の 3 つが、**同じ表**を通ること。

**完了の判定**（`npm test` に次の項目が増えて、全部緑）:

- `test/blocks.test.ts` の「ツタ」の節に **5 件以上**: `supportFaces(VINE_XN)` が
  `[FACE_XN, FACE_YP]` の 2 つを返す / はしご・松明・苗木は 1 つのまま /
  `vineVariant(FACE_YP, VINE_ZP) === VINE_ZP`（上と同じ向きを写す）/
  `vineVariant(FACE_YP, STONE) === AIR`（ツタ以外の天井には付かない）/
  `supportsBlock(VINE_XN, FACE_YN, VINE_ZP)` は真で `supportsBlock(VINE_XN, FACE_XN, VINE_ZP)` は偽（**横のツタには付かない**）
- `test/blocks.test.ts` に **1 件**（**本物の `World`**。あの節にもう 1 つ立っています）:
  壁のツタの下に 2 マスぶら下げてから**壁を壊すと 3 マスとも落ちる**（`onAutoBreak` が 3 回）
- `test/placing.test.ts` に **2 件以上**（`Slab` と `tryPlace()`）: ツタの**下面を狙う**と
  真下に**上と同じ向きの**ツタが置ける / ツタの**横**の空中には置けない（`blocked`）
- 既存 3710 件が緑のまま（**1 件も判定をゆるめない**）

## 2. 触るファイル / 触らないファイル

| ファイル | 足すもの（見込み） |
| --- | --- |
| `src/blocks.ts` | `BlockDef.hangsBelow` と `HANGS_BELOW` の表 / `hangsBelow()` / `supportFaces()` と `SUPPORT_FACES` の表 / `supportsBlock()` に 1 行 / `vineVariant()` に 2 つ目の引数 / `PlaceContext.supporter`（**省略可**）と `placeSpot()` の 2 行 / ツタの `def()` 4 つに `hangsBelow: true` |
| `src/world.ts` | `canPlaceAt()` を `supportFaces()` の for に / `breakUnsupported()` の 2 行 |
| `test/arena.ts` | `Slab.canPlaceAt()` の写しも**同じ `supportFaces()` の for**にする |
| `test/blocks.test.ts` / `test/placing.test.ts` | 上の判定 |
| `tools/shot.ts` | 場面 `vine` に**ぶら下がった 2 マス**を足す（C-3） |

**触らないファイル**: **`src/main.ts`（±0 行。1 文字も開かないこと** —— いま 1450 行で
止まる目安に並んでいます）/ `src/placing.ts`（`tryPlace()` は今のままで通ります）/
`src/mesher.ts`（ツタは `model: "boxes"` なので `supportFace()` を引きません）/
`src/worldgen.ts` と `src/biomes.ts`（**34c の仕事**）/ `src/items.ts` / `src/crafting.ts` /
`src/player.ts`（登る速さは触らない）/ `src/session.ts`（**セーブは 1 バイトも増えません**）。

## 3. 使う ID

**0 個。** 183..186（34a の 4 つ）を使い回します。**新しい番号を取らないこと** ——
取りたくなったら設計が違います（`ROADMAP.md` の予約表の次の空きは 187・残り 69）。

## 4. 判断をどこに置くか

**全部 `blocks.ts`（表と純粋関数）。`world.ts` は表を引いて for を回すだけ**にすること。

- **`supportFace` は 1 ブロック 1 向きのまま。** 2 つ目は**別の表**（`HANGS_BELOW`）から
  作る `supportFaces(id)`（面番号の配列。ふつうは 1 つ、ツタだけ `[壁, FACE_YP]`）で、
  **どれか 1 つを満たせば置ける**
- **`stacksOnSelf` は代わりになりません** —— あれは `supportFace` の向きの自分を見るので、
  `VINE_XN` に付けると**真下ではなく -X 側**のツタに付きます（34a の申し送り）
- `supportsBlock()` に足す例外は **1 行**（**`face` を必ず見ること。見ないと横にも貼り付く**）:
  `face === FACE_YN && hangsBelow(id) && baseBlock(supporter) === baseBlock(id)`
- **`canSupport()` はゆるめないこと**（壁掛けの松明とベッドの足場。苗木のときと同じ）
- `vineVariant(face, supporter = AIR)`: **`FACE_YP` のときだけ**上のツタと**同じ ID を
  そのまま返す**（`baseBlock(supporter) === VINE` なら `supporter`、でなければ `AIR`）。
  **`VINE_BY_SUPPORT` の表は書き換えないこと**（天井の欄は `AIR` のまま）
- `breakUnsupported()` も**隣の向きを `supportFaces()` で見て、落とすかどうかは
  `canPlaceAt()` に聞くこと**（置く側と壊す側が**同じ関数**になり、連鎖も勝手に落ちます）
- `placedVariant()` は `ctx.supporter` を渡すだけ。**`PlaceContext.supporter` は省略可**に
  すること —— 必須にすると `placedVariant()` を呼ぶ既存のテスト 49 か所が全部落ちます

## 5. 書くテスト

`rules/testing.md` のとおり**値を出力してから判定**すること。

- **旗を足したら `grep -n 'hangsBelow' test/` と `grep -n 'supportFaces' test/` を引くこと**
  （34a で `isClimbable` の `length === 4` を落としました。`rules/testing.md`）
- `test/placing.test.ts` の下面狙いは `aimAt(x, y, z, VINE_XN, [0, -1, 0])` の形
- **連鎖は `world.onAutoBreak` を数えて見ること**（`Slab.setVoxel` は
  `breakUnsupported` を呼ばないので、**そこだけは本物の `World`**）

## 6. このタスク固有の禁じ手

- **`supportHint()` を 1 文字も変えないこと。** ツタは「壁」のままです
  （表の作り方を変えると松明の「床か壁」と苗木の「土か草の上」まで動きます）
- **`LADDER_BY_SUPPORT` / `ladderVariant()` / `torchVariant()` に触らないこと**（はしごは
  天井からぶら下がりません）/ **`hangsBelow` はツタ 4 つ以外の `def()` に付けないこと**
- **`SaveData.version` は 1 のまま**（差分はブロック ID のままで、増える鍵はありません）/
  **自然生成を 1 行も書かないこと**（34c）
- **既存の判定をゆるめて緑にしないこと。** `test/blocks.test.ts` の「床にも天井にも
  付かない」は**引数なしの `vineVariant(FACE_YP)` が `AIR`** のままで緑です
  （**消さずに、ラベルだけ「ツタ以外の天井には付かない」に直すこと**）

## 7. 終了条件

- `npm run typecheck` 緑 / `npm test` **すべて緑**（音が跳ねたらまずもう一度走らせる）
- `npm run build` 緑（`src/**` を触るため）。**`npm run bench` は要りません**
- **撮って `Read` で開いて見ること**（C-3。**垂れ下がりが見た目の本体**）:
  `npm run shot -- vine` で**ぶら下がった 2 マスが宙に浮いて見えるか**。
  **`World.setVoxel()` は `canPlaceAt()` を通るので、上から順に置くこと** ——
  下から置くと 1 マスも書けません（`tools/shot.ts` は本物の `World` です）
- コミット 1 つ / キューの 34b の行を消す / この仕様書を `状態: 済` に /
  `ROADMAP.md` の 183..186 の行に 34b を書き足す / `docs/autodev-log.md` に 1 節 /
  `HANDOFF.md` を丸ごと書き直す / **踏んだ落とし穴を `rules/` へ据える**
  **手触りの数値を置いたら `TUNING.md` に 1 行**（この周は 0 個の見込み）

## 使えるスキルと、先に読む `rules/`

**スキルはありません**（ブロックもアイテムも位置ごとの状態も、確かめられないものも
増えません。描画は既存の `boxes` がそのまま描きます）。**`rules/` は自動では
読み込まれないので、先に自分で引いて全部読むこと**（`grep -l '"src/blocks.ts"' rules/*.md`）:
**`blocks-shapes.md`**（形と支え）/ `items-survival.md` / `lighting.md` /
**`meshing-render.md`**（`src/world.ts` と `tools/shot.ts`。**壁に貼るものの撮り方**）/
`beds.md`（`canPlaceAt` の相方）/ **`test/**` を触るので `testing.md`**。

## ⚠ 34b を 2 つに割った理由

**キューの 34b は「垂れ下がり」と「自然生成」の 2 件でした。** 前者だけで `blocks.ts` の
表 2 本・`world.ts` の 2 か所・`test/arena.ts` の写し・テスト 2 ファイル・`tools/shot.ts` に
届き（2. の表）、後者は `worldgen.ts` の木の生成に手を入れる話で**触るファイルが 1 つも
重なりません。** **120 行に収まらない仕様は 1 周で閉じない信号**（`AUTODEV.md` の B）なので、
**自然生成を 34c として `AUTODEV-QUEUE.md` の先頭に書き戻しました。**
