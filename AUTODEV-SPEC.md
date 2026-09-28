# 仕様: 置いた葉は消えない（キューの 52b・**ID 0 個**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**: 入っていません。`leafdecay.ts` の `decayedLeaves()` は葉の出どころを見ず、
`World` にも `SaveData` にも「置いた葉」の印は 1 つも無い（52a の間は**木に接して置いた葉が、残りの原木から 4 歩より遠いと消える**）。
**`main.ts` は 1449 行（`wc -l`。テストの数え方で 1450）で、この件は +0 行**（**既存の 293 行目 1 行を書き換えるだけ**。下の 2.）。
停止条件 2（1450 を**超えた**）には当たりません —— **1 行でも増えるなら止めて人を呼ぶこと**（逃げ道を探さない）。

**`edits`（`World.editsForSave()`）では見分けられません**: 苗木から育った木（`crops.ts` の `growTree()`）の葉も
`setVoxel()` を通って `edits` に入るので、「`edits` にある葉 = 置いた葉」にすると**育てた木の葉が消えなくなる**（本家は消える）。
**`edits` の値に印を混ぜる（`id | 0x100` など）ことも禁止**（`SaveData` の形を変える話で、止まる条件）。だから**別の省略可キー**を足します。

**本家の規則**: プレイヤーが置いた葉には持続フラグが立ち、何があっても自然には消えない（Beta 1.9 から）。
距離の計算には普通の葉として参加する（置いた葉を伝って原木に届く自然の葉は残る）。

## 1. 何を足すか / 完了の判定

**プレイヤーが置いた葉（旗 `decays`）の位置を `World` が覚え、`decayedLeaves()` はそのマスを返さない。印は次元ごとの
省略可キー `placedLeaves`（`[x, y, z, …]` の平たい配列）でセーブに載り、読み戻せる。** 置いた葉を壊す・何かで上書きすると印は消える。
**完了**: `npm test` に「置いた葉は消えない（52b）」の件（`test/leafdecay.test.ts` / `test/blocks.test.ts` / `test/session.test.ts` /
`test/storage.test.ts` / `test/dimensions.test.ts` に計 **10〜16 件**）が増えて**すべて緑**（**4093 → 4103〜4109 あたり**）。
ブロック ID の枠の行は**変わらない**（1..63 の空き 7・111..255 の空き 57）。**`SaveData.version` は 1 のまま。**

## 2. 触るファイル / 触らないファイル

**触る**:
- `src/leafdecay.ts` —— `LeafWorld` に**省略可**の `keepsLeaf?(x, y, z): boolean` を足し、`decayedLeaves()` の 3.（届かなかった候補を
  返す所）で**真のマスを外すだけ**。**1.（候補集め）と 2.（支えの幅優先）は変えない**（置いた葉も普通の葉として伝う = 本家どおり）。
  加えて「置いたら覚える葉か」の判断 **`keepsWhenPlaced(id): boolean`**（中身は `isDecayingLeaf(id)`。**`id === LEAVES` を書かない**）
- `src/world.ts` —— `private readonly placedLeaves = new Set<string>()`（キー `"x,y,z"`）/ コンストラクタの**第 4 引数**
  `placedLeaves?: readonly number[]`（平たい 3 つ組。長さが 3 の倍数でない端は捨てる）/ `notePlaced(x, y, z, id)`（`keepsWhenPlaced(id)` のときだけ
  足す）/ `keepsLeaf(x, y, z)` / `placedLeavesForSave(): number[] | undefined`（**空なら `undefined`** = キーごと消える）/
  **`setVoxel()` が書けたら、そのマスの印を消す**（`delete` 1 行。**集合が空なら文字列を作らないこと** —— `setVoxel()` は生成以外の
  全部の書き込みが通るので、`size === 0` で先に抜ける）
- `src/placing.ts` —— `tryPlace()` のベッドでない枝で `setVoxel()` が成功したあと `world.notePlaced?.(x, y, z, id)`。
  `PlaceWorld`（= `BedWorld`）に**省略可**の `notePlaced?` を足す形にして、**既存の偽の世界（`test/placing.test.ts` など）を書き換えない**
- `src/dimensions.ts`（`DimensionState.placedLeaves?: number[]` と `normalize()` に 1 行）/ `src/storage.ts`（`SaveData.placedLeaves?`）/
  `src/session.ts`（`StateSources.world` に `placedLeavesForSave()`・`collectState()`・`buildSave()` の上の階層・`savedShape()` に 1 行ずつ。
  **`crops` の 4 か所の写し**）
- **`src/main.ts` 293 行目の 1 行だけ**: `new World(…, deserializeEdits(state.edits), state.placedLeaves)`。**行を増やさないこと**
- テスト 5 本（下の 5.）/ `TUNING.md` の 52a の節の「置いた葉」の行 / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` /
  `rules/stateful-blocks.md` か `rules/dimensions.md`（省略可キーの節に 1〜3 行）

**触らない**: `src/crops.ts`（**`notePlaced()` に相乗りしない** —— `World` が `Crops` を知らないので、`decayLeaves()` から引く配線が
`main.ts` に 1 行増える）/ `src/breaking.ts` / `src/items.ts` の `DROPS` / `treeshape.ts` / `worldgen.ts` / `ROADMAP.md` / `*render.ts` /
`ui.ts` / `edits` の形（`serializeEdits` / `deserializeEdits`）/ `test/world.test.ts` の p99。

**先に引いて読むこと**: `grep -l '"src/world.ts"' rules/*.md`（→ `lighting.md` / `meshing-render.md`）/ `grep -l '"src/session.ts"' rules/*.md`
（→ `dimensions.md` ほか）/ `grep -l '"src/placing.ts"' rules/*.md` / `grep -l '"src/main.ts"' rules/*.md` / `rules/testing.md`。
**`rules/dimensions.md` の「セーブの組み立てと読み戻しは `session.ts`」と「`collectState()` が唯一の場所」がそのまま掛かります。**

## 3. 使う ID

**0 個。** `ROADMAP.md` の予約表は触らない（**次に取るのは 199 のまま**）。

## 4. 判断をどこに置くか

新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要。スキルも要りません）。

- **どの ID を置いたら覚えるか**: `leafdecay.ts` の `keepsWhenPlaced()`（旗 `decays` に聞く）。`world.ts` / `placing.ts` に葉の ID を書かない
- **覚えた葉を消さない**: `leafdecay.ts` の `decayedLeaves()` の 3.。**`world.ts` の `decayLeaves()` 側で弾かないこと**（判断が 2 か所に割れる）
- **印を持つ・消す・セーブに出す**: `world.ts`（器。`edits` と同じく「次元の世界が持つもの」なので `World` に置く）
- **どのキーに何を書くか**: `session.ts`（`crops` と同じ 4 か所）。`main.ts` は `state.placedLeaves` を渡すだけ
- 苗木から育った木・生成の木には**印が付かない**（`notePlaced` を呼ぶのは `tryPlace()` だけ）ので、そちらは 52a のまま消える

## 5. 書くテスト（**値を出力してから判定する**）

- **`test/leafdecay.test.ts`**（偽の `LeafWorld` に `keepsLeaf` を足す）:
  - 原木 1 本 + 葉の塊で原木を消し、**1 枚だけ `keepsLeaf` 真** → **その 1 枚だけが返らず、残りは全部返る**（返った数を出してから）
  - **置いた葉を伝って原木に届く自然の葉は残る**（原木 — 置いた葉 — 自然の葉 の列で、別の原木を消したときに返らない）
  - `keepsLeaf` を持たない偽の世界では 52a と同じ結果（既存の件が 1 つも動かないこと自体が見張り）
  - `keepsWhenPlaced()` が真の ID を一覧で出して「**葉 3 つだけ**」（原木・苗木・草むらは偽）
- **`test/blocks.test.ts`**（本物の `World`。52a の件の写し。**支えを探す箱の列が全部読み込み済みの場所を選ぶ** —— `rules/blocks-shapes.md`）:
  - 原木 + 自然の葉の横に **`tryPlace()` で葉を 1 枚置き**、原木を消す → `onAutoBreak` の数が自然の葉の数と同じで、**置いた葉だけ残る**
  - **置いた葉を壊して（`setVoxel(…, AIR)`）から、同じマスに `setVoxel()` で葉を書く**（育つ木の形）→ 印は無い（`keepsLeaf` 偽）
  - `placedLeavesForSave()` が置いた 1 枚の座標を返し、**0 枚なら `undefined`**
  - **第 4 引数で作り直した `World` でも `keepsLeaf` が真**（`deserializeEdits` と同じ往復）
- **`test/session.test.ts`**: 偽の `world` に `placedLeavesForSave` を足し、`collectState()` に載る / `buildSave()` の上の階層に載る /
  **空ならキーごと消える**（`crops` の 169 行あたりの写し）/ `savedShape()` が上の階層から拾う
- **`test/storage.test.ts`**: `V1_SAVE` に `"placedLeaves": [1, 41, 2]` を足しても v1 として読める / 無い古いセーブは `undefined`
- **`test/dimensions.test.ts`**: 次元を行って戻ったあと `placedLeaves` が残っている（`crops` の 143 行あたりの写し）

## 6. このタスク固有の禁じ手

- **`main.ts` の行を増やさないこと**（293 行目の書き換えだけ。増えるなら止めて `HANDOFF.md` に書く）
- **`edits` の形・値を変えないこと**（印を ID に混ぜない）/ `SaveData.version` を上げない / ID を使わない・振り直さない
- **`decayedLeaves()` の 1. と 2. を変えないこと**（置いた葉を「伝わない葉」にしない）/ **乱数を使わない**
- **`crops.ts` の `notePlaced()` を書き換えないこと** / `breaking.ts` と葉の `DROPS` を触らない / 判定をゆるめないこと
- **`setVoxel()` で印が空のときに文字列を作らないこと**（全部の書き込みの道。p99 に混ざる）

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑）/ `npm run build` 緑（`src/**` を触る）。**生成もメッシュ化も触らないので `bench` は不要**
- **C-3**: 地形の絵は変わらないはず。**`npm run shot -- terrain` の md5 を前と比べる**（前: `1eb34c15f2875ec74d1951dba30cb334`）。
  葉を置いて木を切る絵は撮れないので、`HANDOFF.md` の「ブラウザで見てほしいところ」に**木の横に置いた葉が幹を切っても残る**・
  **リロードしても残る**を書くこと
- **コミット 1 つを `master` へ push** / キューの 52b を消す / この仕様書を **`状態: 済`** / `TUNING.md` の 52a の「置いた葉」の行を直す /
  `docs/autodev-log.md` に 1 節 / 踏んだ落とし穴を `rules/` へ / **`HANDOFF.md` を書き直す**
