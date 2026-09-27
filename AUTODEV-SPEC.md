# 仕様: 原木が無くなると葉が消える（キューの 52a・**ID 0 個**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**: 入っていません。`src/**` に葉を消す道は 1 行も無く、`LEAVES` / `SPRUCE_LEAVES` /
`BIRCH_LEAVES` の `def()` は `hardness` と `sound` だけ。原木（`WOOD` 7 / `SPRUCE_WOOD` 25 / `BIRCH_WOOD` 196）に向き違いは無い。
**`main.ts` は 1449 行（`wc -l`。テストの数え方で 1450）で、この件は 0 行**です —— 葉を落とす道は
**`world.onAutoBreak`（`main.ts` 319 行で `breaking.ts` の `autoBreak()` に繋がり済み）に相乗り**するので、配線は要りません。

**キューの 52 を 2 件に割りました**（`AUTODEV.md` の B）: **52a = この仕様**（切った瞬間に消える）/
**52b = 置いた葉を覚えて消さない**（`SaveData` の省略可のキーが要る。キューに書き戻し済み）。
**52a の間の置いた葉**: 消えるかを調べるのは**原木を切ったマスから葉を伝って届く範囲だけ**なので、原木から離して
飾った葉は消えません。**木に接して置いた葉が、残りの原木から 4 歩より遠いときだけ消えます**（52b で直す。`TUNING.md` に 1 行）。

**本家の規則**: Alpha / Beta は原木から 4 マス以内（葉を伝った距離）に原木が無い葉が、乱数ティックでぽつぽつ消えて
棒・苗木・リンゴを落とす（正式版は 6 マス）。**ここは切った瞬間に全部消えます**（乱数ティックの器を足さないため。`TUNING.md`）。

## 1. 何を足すか / 完了の判定

**原木（旗 `sustainsLeaves`）が `world.setVoxel()` で原木でないものに変わったら、そのマスの周りの葉（旗 `decays`）のうち、
葉を伝って `LEAF_DECAY_DISTANCE` = **4** 歩以内に原木が 1 本も無いものを、`onAutoBreak` で知らせてから空気にする。**
落ちる物は既存の `DROPS`（`autoBreak()` → `rollDrops()`。棒 10%・苗木 5%・オークだけリンゴ 0.5%）がそのまま決める。
**完了**: `npm test` に**「葉が消える（52a）」の件**（新しい `test/leafdecay.test.ts` と `test/blocks.test.ts` の 2〜3 件）が
増えて**すべて緑**（**4078 → +12〜20 件**）。ブロック ID の枠の行は**変わらない**（1..63 の空き 7・111..255 の空き 57）。

## 2. 触るファイル / 触らないファイル

**触る**: **`src/leafdecay.ts`（新規・判断はすべてここ）** / `src/blocks.ts`（旗 `decays` と `sustainsLeaves`：`BlockDef` の 2 項と
コメント・`def()` の既定 `?? false`・表 2 本と詰め込み 2 行・`isDecayingLeaf()` / `sustainsLeaves()`・**葉 3 つと原木 3 つの
`def()` の opts に 1 語ずつ**。`slowGround`（51）と同じ形）/ `src/world.ts`（`setVoxel()` の末尾、`breakUnsupported()` の
あとに**呼んで貼るだけの数行**と、それを行う private メソッド 1 つ）/ `test/leafdecay.test.ts`（新規）/ `test/blocks.test.ts` /
`TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / `rules/blocks-shapes.md`（旗の節に 2〜4 行）。

**触らない**: **`src/main.ts`（0 行）** / `src/breaking.ts`（`autoBreak()` をそのまま通す）/ `src/items.ts` の `DROPS`（**葉のドロップ表を
書き換えない**）/ `src/crops.ts`（乱数ティックの器にしない）/ `src/treeshape.ts` / `worldgen.ts`（木の形を変えない）/
`ROADMAP.md`（ID を使わない）/ `*render.ts` / `ui.ts` / `SaveData` / `test/world.test.ts` の p99。

**先に引いて読むこと**: `grep -l '"src/world.ts"' rules/*.md`（→ `lighting.md` / `meshing-render.md`）/
`grep -l '"src/blocks.ts"' rules/*.md`（→ `blocks-shapes.md` / `beds.md` / `items-survival.md`）/ `rules/testing.md`。
**`rules/lighting.md` の「置く側と壊す側は対」と `rules/meshing-render.md` の「`setVoxel()` は `canPlaceAt()` を通る」がそのまま掛かります。**

## 3. 使う ID

**0 個。** 既存の葉 3 つ・原木 3 つに旗を 1 つずつ足すだけ。`ROADMAP.md` の予約表は触らない（**次に取るのは 199 のまま**）。

## 4. 判断をどこに置くか

新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要。スキルも要りません）。

- **どれが消える葉か・どれが葉を支えるか**: `blocks.ts` の旗 `decays` / `sustainsLeaves`（表 1 本ずつ）。**`id === LEAVES` や
  `id === WOOD` を `leafdecay.ts` / `world.ts` に書かないこと**（木が増えるたびに漏れる。50 のシラカバがちょうどそれ）
- **何歩まで支えるか・どの葉が消えるか**: `leafdecay.ts` の **`LEAF_DECAY_DISTANCE = 4`** と
  **`decayedLeaves(world: LeafWorld, x, y, z): [number, number, number][]`**（純関数。`World` を import しない。
  `LeafWorld` は `getVoxel` と `hasColumn` の 2 つだけ —— `crops.ts` の `CropWorld` の作法）。手順:
  1. **候補**: 切ったマスの 6 近傍から、`decays` の葉だけを伝う幅優先で **`LEAF_DECAY_DISTANCE` 歩以内**の葉を集める
  2. **支え**: 切ったマスを中心に x・y・z ±`2 × LEAF_DECAY_DISTANCE` の箱で `sustainsLeaves` を全部拾い、それを起点に
     **葉だけを伝う多点の幅優先を `LEAF_DECAY_DISTANCE` 歩まで**（原木の隣の葉が 1 歩）。**箱の外へは伸ばさない**
  3. 候補のうち 2. で届かなかったものを返す。**決まった順**（x → y → z の昇順）に並べること（テストを固定するため）
  4. **箱の x・z に掛かる列が 1 つでも `hasColumn` で偽なら空を返す**（未読み込みの原木は AIR に見えて、居るはずの支えを
     見落とすため。消し損ねるほうが安全）
- **消す場所**: `world.ts` の `setVoxel()`。**`sustainsLeaves(previous) && !sustainsLeaves(id)` のときだけ** `decayedLeaves()` を呼び、
  返った葉ごとに **`onAutoBreak` を先に鳴らしてから `setVoxel(…, AIR)`**（`breakUnsupported()` と同じ順・同じ理由）。
  **葉が消えても再び走らない**（前が葉なので条件が偽）ことで連鎖が止まる。**落とす物・クリエイティブで落とさないのは
  `breaking.ts` の `autoBreak()` のまま**（`world.ts` に落とし物の判断を持ち込まない）

## 5. 書くテスト（**値を出力してから判定する**）

- **`test/leafdecay.test.ts`**（新規・偽の `LeafWorld` を `Map` で書く）:
  - 原木 1 本 + 葉の塊で、**原木を消してから** `decayedLeaves()` を呼ぶ → **葉が全部返る**（個数を出してから）
  - **別の原木から 4 歩の葉は残り、5 歩の葉は返る**（一直線の葉の列で境目を出してから判定）
  - **葉を伝わない距離は数えない**: 原木まで直線 2 マスでも、間が石なら支えにならない
  - **原木から離れた葉（切ったマスから葉で繋がっていない）は候補に入らない**（置いた飾りが消えない件）
  - **箱の列が 1 つ未読み込みなら空**
  - **本物の木の形で退行しない**: `treeCells()` の 3 種 × 高さの全範囲（`grownTreeHeight` の幅）を並べ、**何も消さずに**
    どの葉からも原木まで 4 歩以内であることを出してから判定（**割るなら `LEAF_DECAY_DISTANCE` を 6 まで上げて
    `TUNING.md` に書く。木の形は変えない**）/ **幹を全部消すと、その木の葉が全部返る**
- **`test/blocks.test.ts`**（本物の `World`・`rules/meshing-render.md` の作法。**上から順に置くこと**）:
  - 原木 3 段 + 葉を置き、**`onAutoBreak` で数えながら**原木を下から消す → **最後の 1 本を消したときだけ**葉が全部消えて合図が
    葉の数と同じ（ツタの件（3296 行あたり）の写し。終わったら `onAutoBreak = undefined`）
  - `decays` が真の ID を一覧で出してから「**葉 3 つだけ**」/ `sustainsLeaves` は「**原木 3 つだけ**」（両方向。サボテン・草むらは偽）

## 6. このタスク固有の禁じ手

- **葉のドロップ表（`items.ts`）・木の形（`treeshape.ts`）・生成を変えないこと**
- **`main.ts` に 1 行も書かないこと**（`onAutoBreak` に相乗りする）/ **`breaking.ts` を書き換えないこと**
- **乱数を使わないこと**（`leafdecay.ts` に `Math.random` を書かない。消える葉は決まった集合）
- **`world.update()` の中で走らせないこと**（`setVoxel()` からだけ。p99 に混ざるため）/ **葉が葉を呼ぶ再帰を書かないこと**
- **52b（置いた葉を覚える）に手を出さないこと**・`SaveData` に触らない / ID を振り直さない / **判定をゆるめないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑・**4078 → 4090〜4098 あたり**）/ `npm run build` 緑（`src/**` を触る）。
  **生成もメッシュ化も触らないので `npm run bench` は不要**（`setVoxel()` は触るが、ストリーミングの道ではない）
- **C-3**: 地形の絵は変わらないはず。**`npm run shot -- terrain` を撮って md5 を前と比べる**（前: `f4077e98789fb23ad94f9e3472997aa8`）。
  木を切る絵は撮れないので、HANDOFF の「ブラウザで見てほしいところ」に**木を切ると樹冠が一瞬で消えて棒・苗木が散る**のが
  気持ちよいか・物が散りすぎないか、を書くこと
- **コミット 1 つを `master` へ push** / キューの 52a を消す（52b は残す）/ この仕様書を **`状態: 済`** /
  `TUNING.md` に 1 節（4 歩・一瞬で消える・置いた葉の件）/ `docs/autodev-log.md` に 1 節（乱数ティックと 52b を見送った
  理由を 1 行ずつ）/ 踏んだ落とし穴を `rules/` へ / **`HANDOFF.md` を書き直す**
