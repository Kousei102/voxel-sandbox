# 仕様: フェンスが隣と繋がって見える（キューの 26b・ID 0 個）

状態: 済
差し戻し: 0 回

**26a（フェンス本体）は 2026-09-09 の C の周で実装済み**で、いま**腕は 4 方向とも常に
出ています**（`blocks.ts` の `FENCE_BOXES` のコメントが「隣に何も無い側を描かないのは 26b」と
名指ししています）。**この周は見た目だけ**です —— 当たり判定（`FENCE_COLLISION_BOX` =
マスいっぱい x 1.5）にも `physics.ts` にも 1 文字も触りません。

**取る前にコードで数え直しました**（B の周の決まり）: `mesher.ts` の `buildProps()` は
`model` で分岐し、フェンスは `model: "boxes"` で `blockDef(id).boxes` を**そのまま 9 箱**
積むだけです。隣を見る道は 1 行もありません。**`pad` には隣のマスが入っています**
（18³・`padIndex(x,y,z)` は `x,y,z ∈ [-1,16]`）ので、**新しい入り口は要りません。**

## 1. 何を足すか / 完了の判定

**フェンスの腕（8 箱）を、隣が「繋がる相手」の側だけ描く。** 柱（1 箱）は常に描く。
繋がる相手は **フェンス**と、**立方体で `solid` かつ `opaque` なブロック**（石・土・葉・板…）。
**繋がらない**のはそれ以外全部（空気・水・ガラス・草・松明・ハーフ・階段・サボテン・はしご）。

**完了の判定**: `npm test` の「メッシュ化」に**フェンスの節が増えて緑**で、次の 3 つが
**数を出してから**通ること —— **1 本だけ = 12 三角形（柱 1 箱）** /
**+X に 1 本並べる = 片方につき 3 箱 = 36 三角形** / **4 方向すべて = 9 箱 = 108 三角形**。

## 2. 触るファイル / 触らないファイル

**触る**:

- `src/blocks.ts` —— `BlockModel` に `"fence"` を足す / `FENCE_BOXES` を**柱と腕に割る** /
  `fenceConnects(id)` を書く / フェンスの `def` を `model: "fence"` に
- `src/mesher.ts` —— `buildProps()` の `switch` に `case "fence":` を 1 つ
- `test/mesher.test.ts` / `test/blocks.test.ts` —— 下の 5.
- `tools/shot.ts` —— `fence` の場面に**石の立方体と横に接するフェンス 1 本**を足す（下の 4.）

**触らない**（1 文字も）: `src/main.ts` / `src/physics.ts` / `src/player.ts` /
`src/items.ts` / `src/crafting.ts` / `FENCE_COLLISION_BOX` / `BlockDef.collision` /
`collisionBoxes()` / `shapeBoxes()` / `shapeBounds()` / greedy 側（`buildProps()` より上）。

**`boxes` は 9 箱のまま**にすること。**狙う判定（`raycast`）と選択枠は `boxes` を引く**ので、
腕を減らすと**繋がっていない側から狙えなくなります**（見た目だけの話に留めること）。

## 3. 使う ID

**0 個。** ブロックもアイテムも 1 つも取りません（`ROADMAP.md` の予約表は開かない）。
**`SaveData` も触りません** —— 見え方は毎回 `mesher.ts` が隣から作り直すので、
**位置ごとの状態は要りません**（`variantOf` の帯 64..110 も使わないこと）。

## 4. 判断をどこに置くか

**`mesher.ts` に「どのブロックと繋がるか」を書かないこと。** 判断は `blocks.ts` 側です:

- **`fenceConnects(id: number): boolean`** を `blocks.ts` に export する
  （`blockModel(id) === "fence" || (!isProp(id) && def.solid && def.opaque)`）。
  **`id === FENCE` と直に書かないこと**（`isTallCollision()` と同じ理由。将来の
  石のフェンスで 2 か所に書くことになります）
- **形も `blocks.ts` に 1 か所だけ**。`FENCE_POST_BOX`（柱 1 箱）と
  **`FENCE_ARMS`（4 方向 x `[下段, 上段]` と `dx` / `dz`）**を export し、
  **`FENCE_BOXES` はその 2 つから組む**こと（`[柱, ...下段 4, ...上段 4]` の**いまの並びのまま**。
  `test/blocks.test.ts` が `shape[0]` を柱として見ています）。**箱の数値を 2 か所に書かない**
- `mesher.ts` がやるのは「`pad[padIndex(x + dx, y, z + dz)]` を引いて `fenceConnects()` に
  聞き、真なら `FENCE_ARMS[i]` の 2 箱を `box()` で積む」だけ

**`box()` の `fixedFace` は `-1`**（いまの `"boxes"` と同じ引き方。柱の上面だけ `top` になる）。
**新しく確かめられないものは 1 つも増えません**（`unverifiable-pair` は要りません）——
`mesher.ts` の戻り値は配列なので `npm test` で読めます。

## 5. 書くテスト（**値を出してから判定する**。`rules/testing.md`）

**`test/mesher.test.ts` に節を 1 つ**（`describe("フェンスが隣と繋がって見える")`）。
`pad` に置いて `buildChunkMesh()` を呼び、**三角形の数を `console.log` してから** `check`:

- **1 本だけ = 12 三角形**（柱だけ）/ **+X に 2 本並べる = 72 三角形**（片方 3 箱ずつ）/
  **4 方向すべてフェンス = 108 三角形**（9 箱。26a と同じ絵）
- **石の隣・葉の隣では腕が出る**（36 三角形）/ **ガラス・水・草・松明・ハーフ・空気では
  出ない**（12 三角形）—— **1 つずつ数を出して並べること**（「いつも真」を素通りさせない）
- **チャンクの外の隣でも繋がる**（`x = 0` のフェンスの `-X`、`pad` の `-1` に石）
- **`verifyWinding()` を通すこと**（既存の helper。腕の巡回順が裏返っていないか）

**`test/blocks.test.ts` の `fences()` に追記**: `fenceConnects()` の表を
**石・葉・板・フェンス・ガラス・水・草・空気・石ハーフ・石階段・サボテン**について
**1 行に出してから**判定する。**既存の「柱 1 + 腕 8 の 9 個」「上端 1.0」「当たり判定 1.5」
「isTallCollision はフェンスだけ」の 4 件は 1 文字も変えないこと**（`model` の文字列を
`"boxes"` から `"fence"` に直すのは、同じ事実の名前が変わるだけなので可）。

## 6. このタスク固有の禁じ手

- **当たり判定を隣で出し分けないこと。** `collisionBoxes()` は座標を知らないので**できません**
  （`blocks.ts` のコメント。柱の太さにすると列のあいだを歩いて抜けられます）
- **`FENCE_BOXES` の 9 箱・並び・数値を変えないこと**（組み直すのは可。値は同じに）
- **`model: "boxes"` の側（ハーフ・階段・サボテン・ケーキ・はしご）に手を入れないこと**
- **`default:` の「当てはまらないものは描かない」を消さないこと**（`rules/meshing-render.md`）
- **`opaque: false` を変えないこと**（true にすると隣の面が greedy 側で消えて地面が透けます）
- **繋がる相手を増やして「見た目が良いから」で葉やガラスを足し引きしないこと** ——
  変えるなら `fenceConnects()` の 1 か所と、上の表のテストを同じ周で直すこと

## 7. 終了条件

- `npm run typecheck` と `npm test` が**すべて緑**（音の一群が跳ねたらもう一度走らせる）
- `npm run build` が緑（`src/**` を触るので）。**`npm run bench` は要りません**
  （生成もメッシュ化の予算も触りませんが、**箱が減るぶん三角形は減ります**）
- **撮って自分の目で見る**（`AUTODEV.md` の C-3。**見た目そのものの周です**）——
  `npm run shot -- fence` で**直線・角・1 本だけ・石の上・石の横**の 5 通りを 1 枚に写し、
  **`Read` で開いて「1 本だけの柱から腕が消えた」「角では 2 方向だけ残った」を確かめる**
- コミット 1 つ / `AUTODEV-QUEUE.md` の 26b の行を消す / この仕様書を `状態: 済` に
- 手ざわりの数値は置かない見込み（置いたら `TUNING.md` に 1 行）
- **触るファイルに当たる `rules/*.md` を先に引いて読むこと**:
  `grep -l '"src/mesher.ts"' rules/*.md`（→ `lighting.md` / `meshing-render.md`）・
  `grep -l '"src/blocks.ts"' rules/*.md`（→ `beds.md` / `blocks-shapes.md` / `items-survival.md`）・
  **`test/**` を触るので `rules/testing.md` も**
