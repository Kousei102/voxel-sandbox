# 仕様: 置いたキノコが暗い所で広がる（キューの 46・**ID 0 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: 入っていません。`crops.ts` の
`notePlaced()`（133 行）が覚えるのは苗木 2 種・サトウキビ・サボテンだけで、`update()`（184 行）は
キノコのマスを「それ以外」の枝で忘れます。`def(RED_MUSHROOM)` / `def(BROWN_MUSHROOM)`
（`blocks.ts` 2020 / 2030 行）は `supportFace: FACE_YN` だけです。**明るさは `World.getLight(x, y, z, channel = SKY_LIGHT)`（`world.ts` 284 行）が在り**、
`main.ts` は `crops.update(dt, world)` / `crops.notePlaced(placed.at, placed.id, world)` で
**`world` をそのまま渡す**ので、`CropWorld` に `getLight` を足しても **`main.ts` は 0 行**です。

**本家の規則**（Java 正式版の `MushroomBlock.randomTick`。**入った版は確かめきれていません**）:
乱数ティックの 1/25 で、自分を中心に **x・z ±4 / y ±1（9x3x9）に同じ種類が 5 本以上あれば広がらない**。
そうでなければ周り 1 マス（x・z ±1 / y ±1）の**空気で、明るさ（空とブロックの大きいほう）が 13 未満で、
真下が不透明なブロック**のマスへ同じ種類を 1 本置く。**時間**: 乱数ティックは 1 ブロック平均 68.3 秒
→ 1/25 で ≒ 1707 秒。**サトウキビ（本家 ≒ 1092 秒 → ここ 180 秒）と同じ縮尺で 280 秒**（暫定）。

**乱数を使わない決まり（`crops.ts` の頭）との折り合い**: **乱数ではなく座標で決めます。**
「何秒で広がるか」は `MUSHROOM_SPREAD_SECONDS` で固定し、**どのマスへ広がるか**は周り 26 マスを
決まった順に並べ、**開始位置だけを座標から決める**（`mushroomSpreadStart(x, y, z)`・0..25 の純関数）。
同じ場所・同じ周りなら**毎回同じマス**に生える —— テストで固定できます。`Math.random(` は 0 個のまま。

## 1. 何を足すか / 完了の判定

**プレイヤーが置いた赤キノコ・茶キノコは、`MUSHROOM_SPREAD_SECONDS`（280）秒ごとに、周り 26 マスのうち
「空気・明るさ 12 以下・真下が支えになる」最初の 1 マスへ同じ種類を 1 本増やす。9x3x9 に同じ種類が
5 本以上あれば増やさない。** 増えた 1 本も覚えて、そこからまた広がる。**自然に生えたキノコは広がらない**
（サトウキビ・サボテンと同じく印が無い）。
**完了**: `npm test` に**「キノコが暗い所で広がる（46）」の節**（`test/crops.test.ts`）と
**「本物の World でキノコが広がる（46）」の件**（`test/blocks.test.ts`）が増えて**すべて緑**
（**+18〜24 件。3944 → 3965 あたり**）。**書き換える既存の件は 0**（偽の `Field` に入口を 1 つ足すだけ）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/crops.ts`（定数 4 つ・`isMushroom()`・`mushroomSpreadStart()`・`CropWorld.getLight`・`notePlaced()` / `update()` に 1 枝ずつ・`spreadMushroom()`・頭のコメント）/ `test/crops.test.ts`（`Field` に `getLight` と明るさの表・新しい節・見張りに 2 件）/
`test/blocks.test.ts`（本物の `World` で 1 件）/ `rules/stateful-blocks.md` / `TUNING.md` /
`AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / `ROADMAP.md`（予約表は動かさない。触るなら文だけ）。

**触らない**: **`src/main.ts`（0 行）** / **`src/blocks.ts`**（キノコの def も `supportsBlock()` も 1 文字も
変えない）/ `src/world.ts` / `src/lighting.ts` / `src/placing.ts` / **生成**（`worldgen.ts` / `biomes.ts`）/
`SaveData`（`crops` の表にそのまま乗る。キーも `version` も増えない）/ `tools/shot.ts`。

**先に引いて読むこと**: `grep -l '"src/crops.ts"' rules/*.md`（**`stateful-blocks.md` の「育つもの」の節を
全部**）と `rules/testing.md`（`test/**` を触るので）と `grep -l '"test/blocks.test.ts"' rules/*.md`。

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（**次に取るのは 189 のまま**）。

## 4. 判断をどこに置くか

**判断は全部 `crops.ts`。** 新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要。スキルも使わない）。

- **定数**（どれも `export`・**暫定**）: `MUSHROOM_SPREAD_SECONDS = 280` / `MUSHROOM_MAX_LIGHT = 12`
  （これ以下なら広がれる。本家の「13 未満」）/ `MUSHROOM_CROWD_LIMIT = 5` / `MUSHROOM_CROWD_RADIUS = 4`（y は ±1 固定）
- **`CropWorld` に 4 つ目の入口** `getLight(x: number, y: number, z: number, channel: LightChannel): number`
  （`LightChannel` / `SKY_LIGHT` / `BLOCK_LIGHT` は `./lighting` から import。**`World` は import しない**）。
  明るさは **`Math.max(空, ブロック)`**（本家の生の明るさ。**昼夜で変えない** —— 外は夜でも空 15 のまま）
- **`isMushroom(id)`**（`saplingKind()` の隣。赤・茶だけ真）/ **`notePlaced()`**: 苗木と同じく**置いたマスをそのまま**覚える枝を 1 つ（積み上がらないので下へ舐めない）
- **`update()`**: 苗木の枝の前に `else if (isMushroom(here))` → `spreadMushroom(key, age, dt, x, y, z, here, world, births)`。
  **増えたマスは `births` 配列に集め、for を抜けてから `map.set(k, 0)`**（回している `Map` に足すと同じ番で舐めてしまう）。
  既に覚えているキーは上書きしない
- **`spreadMushroom()` の順番**（`growTree()` / `growStack()` の作法をそのまま）:
  1. `grown = age + dt` が `MUSHROOM_SPREAD_SECONDS` 未満なら持ち越して false
  2. **四隅の列**（`x ± MUSHROOM_CROWD_RADIUS`・`z ± 同`）が 1 つでも未読み込みなら**持ち越して** false
     （`rules/stateful-blocks.md` の「横へ広がるものを足すたびに要ります」）
  3. 9x3x9 に `self` と**素の `getVoxel` が等しい**マス（自分も数える）が `MUSHROOM_CROWD_LIMIT` 以上 →
     **秒数を 0 に戻して** false（**`changed` を立てない**。既に 0 なら書かない）。**別の種類は数えない**
  4. 周り 26 マス（`dy` -1..1 → `dz` → `dx` の順。中心を除く）を `mushroomSpreadStart(x, y, z)` から巡回し、
     **最初に** `getVoxel === AIR` かつ明るさ ≤ `MUSHROOM_MAX_LIGHT` かつ
     **`supportsBlock(真下, FACE_YP, self)`**（`blocks.ts` から import。**`World.canPlaceAt()` と同じ式**）のマス。
     無ければ秒数を 0 に戻して false
  5. **`setVoxel` が真のときだけ**秒数を 0・`births` に積んで true。偽なら持ち越して false
- **`mushroomSpreadStart(x, y, z)`**: 整数の掛け算と xor で 0..25（負の座標でも 0..25 に収めること）

## 5. 書くテスト（**値を出力してから判定する**）

**`Field` に `light = new Map<string, number>()`（キー `"x,y,z,ch"`・無ければ 0 = 真っ暗）と `getLight`**（既存の件は明るさを読まないので 1 件も変わらない）。

**新しい節**「キノコが暗い所で広がる（46）」（`test/crops.test.ts`・サボテンの節の後）。石の床 5x5 を y39 に敷き、
キノコを (0,40,0) に置いて `notePlaced` してから:

- **`notePlaced` で覚える**: 赤・茶とも `peek === 0` / **覚えていないキノコは何秒経っても増えない** / **1 秒手前は増えない・ちょうどで 1 本**: `MUSHROOM_SPREAD_SECONDS - 1` で本数 1 → +1 秒で 2・
  `update` が true。**増えた 1 本の座標を出してから**、中心から各軸 ±1 以内・同じ種類・真下が石・覚えている（`peek === 0`）
- **明るさの境**: 周り全部の空を 13 にすると増えない / 12 にすると増える / **ブロック光 13（空 0）でも増えない**
  （`Math.max` の見張り）。表を 1 行に出してから判定
- **混み具合**: 9x3x9 に同じ種類を**計 5 本**（自分込み）置くと増えない・4 本なら増える /
  **茶 4 本を足しても赤は増える**（別の種類は数えない）/ **床の無い所**（真下が空気）には生えない
- **決まった場所**: 同じ盤面を 2 つ作って同じ秒数を回すと**同じ座標**に生える / `mushroomSpreadStart` を
  負の座標を含む 20 点で出して全部 0..25 / **上限で止まる**: 床を 3x3 だけにして 20 周回すと、**本数が 5 で止まり 6 にならない**
- **未読み込みの隅**: 4 隅のどれかの列を `unloaded` にすると増えず秒数は持ち越し → 戻すと次の `update(0)` で増える /
  **`frozen`** で書けなければ持ち越し / **掘られたら忘れる**（既存の「それ以外」の枝）
- **セーブ**: 増えた 1 本も `serialize()` に載る（2 本ぶんのキー）/ 見張りに 2 件: `main.ts` に `MUSHROOM_SPREAD_SECONDS` / `\b280\b` が無い（`GROW_SECONDS` の見張りの隣）

**`test/blocks.test.ts` に本物の `World` で 1 件**（`rules/stateful-blocks.md` の「偽の `Field` は `canPlaceAt`
を持たない」への手当て）: 地表の近くに石で**閉じた箱**（中 3x2x3）を作って空の光を 0 にし、中の床に赤キノコ →
`Crops` に `notePlaced` → `update(MUSHROOM_SPREAD_SECONDS, world)` で**箱の中の赤キノコが 2 本**。
**対照**: 屋根の無い地表の石の上（空 15）では 1 本のまま。明るさを `console.log` に出してから判定。

## 6. このタスク固有の禁じ手

- **`Math.random(` を入れないこと**（見張りが落ちます）/ **`World` を import しないこと** / **`main.ts` に 1 行も書かないこと**
- **`blocks.ts` を触らないこと** —— **「明るい所には置けない」「明るくなると壊れる」は足さない**（本家には
  あるが、置く側・壊す側の話で 1 周ぶん。`TUNING.md` に 1 行・見送りは `docs/autodev-log.md`）
- **自然に生えたキノコを印にしないこと**（生成を触らない。「地形は保存しない」の設計違反になる）
- **表を 2 つに割らないこと** / **`growStack()` / `growTree()` を書き換えないこと** / **菌糸（本家の「菌糸の上なら明るくても」）は足さない**（ブロックが無い）/ **47 以降に手を出さないこと** / `SaveData.version` は 1 のまま / **判定をゆるめないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`** / `npm run build` 緑。**`bench` は不要**（生成もメッシュ化も触らない）
- **C-3**: 広がるのは時間が経ってからで既存の場面には写らない。**`npm run shot -- terrain` を直す前と後で
  `md5sum` を比べる**（同一のはず。違ったら `Read` で見て理由を書く）
- **コミット 1 つを `master` へ push** / キューの 46 を消す / この仕様書を **`状態: 済`** /
  `rules/stateful-blocks.md` の「育つもの」に 1 段（**道が 5 つ**・**`CropWorld` の入口が 4 つ**（167 行の
  「3 つだけ」を直す）・**広げる先は `births` に集めて for の後で足す**・**乱数の代わりに座標**）/
  `TUNING.md` に 1 節（280 秒 / 12 以下 / 5 本 / 自然のものは広がらない / 置く・壊すは明るさを見ない）/
  `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を書き直す**
