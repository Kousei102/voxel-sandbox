# 仕様: サボテンに触るとダメージ

状態: 未着手
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭 16 番。** 2026-09-05 に数え直して **サボテンのダメージは
`src/**` にも `test/**` にも 0 件**（`grep -rn -i cactus src/ test/` はブロック定義・地形生成・
メッシュ化の絵しか出ません）。ブロック `CACTUS`(27) も `DamageCause` の仕組みも
`VitalsContext` の配線もすでにあるので、**繋ぐだけの周**です。

**ID を 1 個も使いません**（`ROADMAP.md` の予約表を 1 行も触らないこと）。
**新しい見た目も新しい音も作りません**（`mobmesh.ts` / `mobrender.ts` / `sfx.ts` /
`audio.ts` / `mesher.ts` は 0 行。**`CACTUS_BOX` の形も変えないこと**）。

## 1. 何を足すか / 完了の判定

**サボテンのマスに体が重なっているあいだ、0.5 秒ごとに 1 ダメージ**（本家と同じ）。
**死因は「サボテン」。** 溶岩とまったく同じ形で、`vitals.ts` が時計と数値を持ちます。

完了の判定（`npm test` が**全部緑のまま**、次が増えていること。いま 3029 件）:

- `test/blocks.test.ts` —— **`isSpiky()` が真のブロックを並べて出してから「サボテンだけ」**
- `test/physics.test.ts` —— **サボテンに押し付けると `player.touchingSpikes` が真**・
  **隣のマスに立っているだけでは偽**・**2 マス離れれば偽**（**位置を出してから判定**）
- `test/vitals.test.ts` —— **触れた最初のフレームで 1 入る**・**1 秒で 2 回以上入る**・
  **死因が「サボテン」**・**離れれば止まる**・**クリエイティブでは受けない**

## 2. 触るファイル / 触らないファイル

| ファイル | 何を書くか |
| --- | --- |
| `src/blocks.ts` | `BlockDef.spiky` と既定 `false`・表 `SPIKY` と `isSpiky(id)`・`CACTUS` の定義に `spiky: true` の 1 行 |
| `src/physics.ts` | `bodyTouches(world, position, size, match): boolean`（**体の箱と重なるマスを走査するだけ**の幾何。判断を書かない） |
| `src/player.ts` | `touchingSpikes` を毎フレーム立てる（**`moveBody()` のあと**。事実を持つだけ） |
| `src/vitals.ts` | `SPIKE_INTERVAL` / `SPIKE_DAMAGE`・`DamageCause` に `"サボテン"`・`VitalsContext.touchingSpikes`・`updateSpikes()` |
| `src/main.ts` | **配線だけ。1 行**（`touchingSpikes: player.touchingSpikes,`） |

**触らないこと**: `CACTUS_BOX` と `CACTUS` の形・色・硬さ / `mesher.ts` / `worldgen.ts` /
`mobs.ts`（**モブはサボテンで傷つきません**）/ `drops.ts`（**落ちたアイテムも燃えも消えません**）/
`use.ts` / `items.ts` / `crafting.ts` / `ROADMAP.md` の予約表。

**先に読むこと**（`rules/*.md` は自動では読まれません）:
`rules/vitals.md`・`rules/blocks-shapes.md`・`rules/mobs.md`・`rules/testing.md`。
**スキルは 1 つも要りません**（`add-block` は ID を取る周のもの。ここは 0 個です）。

## 3. 使う ID

**0 個。** ブロックもアイテムも 1 つも足しません（**111..255 の空きは 117 のまま**）。
`npm test` の「111..255 の空き」と「1..63 の空き」が**この周で 1 も動かないこと**が判定です。

## 4. 判断をどのファイルに置くか

- **「どのブロックが刺さるか」は `blocks.ts` の表。** `BlockDef.spiky` を 1 つ足し、
  **`id === CACTUS` と書かないこと**（`liquid` / `hot` / `falls` とまったく同じ作法。
  `rules/blocks-shapes.md` の「表 1 本に聞く」）。**どれだけ痛いかは持たせないこと** ——
  数値は `vitals.ts` のものです（`hot` が焼ける量を持たないのと同じ）。
- **「触っているか」は `player.ts`。** `inLava` と同じで**事実を渡すだけ**。
  ダメージの条件も間隔も書かないこと。**`vitals.ts` を import しないこと。**
- **走査そのものは `physics.ts`。** `bodyTouches()` は**述語を受け取る幾何**で、
  サボテンの名前を 1 つも知りません（`blockOverlapsBody()` の隣に置く）。
- **「どれだけ痛いか」は `vitals.ts`。** **溶岩の `updateFire()` と同じ形**にすること:
  1. **時計は間隔ぶん進めた状態で待つ**（`this.spikeTimer = SPIKE_INTERVAL`）——
     でないと**浅いサボテンをかすめて無傷で通れます**（溶岩のコメントと同じ罠）
  2. **`damage()` に `cooldown` を渡さないこと**（既定の 0 のまま。`rules/vitals.md` の
     「無敵時間は呼ぶ側が選ぶ」。渡すとモブの窓と食い合って**黙って半分になります**）
  3. **`respawn()` と、`update()` のクリエイティブ／死亡の枝でも時計を戻すこと**
     （溶岩の `lavaTimer` が並んでいる 2 か所。忘れると**モードを戻した瞬間に 1 発入ります**）
  4. **`POISON_FLOOR` のような下限を作らないこと** —— **サボテンでは死にます**（本家と同じ）

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。既存の形に合わせること ——
`test/vitals.test.ts` は `ctx({...})` と `advance()`、`test/physics.test.ts` は `Arena` です。

- `test/blocks.test.ts` に 1 件（**`isSpiky()` が真の ID と名前を並べて `console.log`** してから
  「サボテンだけ」。`hot` / `falls` の既存の件と同じ書き方）
- `test/physics.test.ts` に 3 件（**押し付けたあとの `player.position.x` と
  `touchingSpikes` を出してから**判定。`Arena` にサボテンを 1 本立てて歩かせること。
  **「隣に立っただけでは偽」を必ず入れること** —— これが無いと、常に真を返す実装で通ります）
- `test/vitals.test.ts` に 5 件（**`ctx({ touchingSpikes: true })` の前後の `health` と
  `cause` を出してから**判定。**回数をぴったりで見ないこと** —— 0.5 秒を 1/60 で刻むので
  境目の 1 回が誤差でどちらにも転びます。溶岩の件のコメントと同じ）
- `ctx()` の既定に `touchingSpikes: false` を 1 行足すこと（既存の件が全部これを通ります）

## 6. このタスク固有の禁じ手

- **`CACTUS_BOX` を変えないこと。** 上面を 15/16 に削ると本家どおり「上に立つと痛い」に
  なりますが、**`test/mesher.test.ts` の体積（0.875 x 1 x 0.875）と積んだサボテンの継ぎ目に
  出ます**。**上に立っても痛くないのはこの周の意図した線**で、`TUNING.md` に 1 行残すこと
- **`damage()` の既定の `cooldown` を変えないこと**・**`MOB_HURT_COOLDOWN` を渡さないこと**
- **`mobs.ts` に 1 行も書かないこと**（モブがサボテンで死ぬのは別の周。湧きと餌の話になります）
- **`player.ts` に間隔も量も書かないこと**・**`main.ts` に条件を書かないこと**（1 行だけ）
- **既存の ID を振り直さないこと**・**`SaveData.version` は 1 のまま**（**セーブは 1 バイトも
  増えません** —— 時計は `Vitals` の中だけで、位置ごとの状態も持ちません）
- **`test/ui.test.ts` の `routed` に当たる語を動かさないこと**（`updateVitals(` は見張られて
  います。動かす行の語は先に `grep -rn '<語>' test/` で当たること。`rules/testing.md`）
- **`main.ts` を 1450 行より大きくしないこと**（いま 1443 行。**1 行だけ**で 1444）

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **全部緑**（増えた件も含む）/ `npm run build` 緑 /
**コミット 1 つ** / `AUTODEV-QUEUE.md` の 16 番の行を消す / この仕様書を `状態: 済` に /
**`ROADMAP.md` は 1 行も触らない**（ID 0 個）/ **`docs/autodev-log.md` に 1 節** /
**`HANDOFF.md` を丸ごと書き直す** / **`master` へ push**。

**C-3（撮る）**: 見た目に出るものは**何もありません**（形も色も音も 0 行）。
`npm run shot -- terrain` を 1 枚だけ撮って**サボテンの絵が前の周と変わっていないこと**を
`Read` で確かめれば足ります。**`TUNING.md` に 1 節**（0.5 秒ごとに 1・**上に立っても
痛くない**・**モブと落ちたアイテムには効かない**の 3 行）。
