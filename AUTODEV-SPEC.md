# 仕様: ソウルサンドの上では遅くなる（キューの 51・**ID 0 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**: 入っていません。`def(SOUL_SAND, …)`（`blocks.ts` 1897 行あたり）の旗は
`hardness` / `tool` / `sound` の 3 つだけ。`player.ts` の速さの掛け算は**水 0.6 とクモの巣 `COBWEB_SPEED_SCALE` の 2 つだけ**で、
足元を見ているのは**氷（`onSlippery` / `bodyStandsOn()`）1 本だけ**。`src/mobs.ts` は `isSlippery` も `isSticky` も
引いていません（**氷もモブには効いていない**）。`main.ts` は 1449 行（`wc -l`）で、この件は **0 行**です。

**本家の規則**（Alpha 1.2 から）: ソウルサンドの上に立つと**歩く速さが 0.4 倍**（走っても 0.4 倍）。跳べる高さは変わらない。
本家は当たり判定が 14/16 で「沈む」けれど、**ここでは形を変えません**（ID 46 は凍結帯の立方体。沈みは別の周）。

**決め**: **効かせるのはプレイヤーだけ**。**理由: 氷もモブには効かせていない**（同じ線に揃える）うえ、
ソウルサンドの上を歩くモブがほぼ居ない（ネザーで湧くのは `spawnOn: [NETHER_BRICK]` のブレイズだけ・ほかは草などの上に湧く。C の周で `spawnOn` を読んで確かめること）ので、効かせても絵が変わらない。
**モブへの適用は見送りとして `docs/autodev-log.md` に 1 行**（C の周）。

## 1. 何を足すか / 完了の判定

**`BlockDef` に旗 `slowGround`（`isSlowGround()`）を足してソウルサンドだけが真、`player.ts` が足元を `bodyStandsOn()` で
見て、真なら目標の速さを `SOUL_SAND_SPEED_SCALE` = **0.4** 倍にする。** 飛行中は効かない（`updateFly` は触らない）。
**完了**: `npm test` に**「ソウルサンド（51）」の件**（`test/physics.test.ts` に 1 節・`test/blocks.test.ts` に 1〜2 件）が
増えて**すべて緑**（**4068 → +7〜10 件**）。ブロック ID の枠の行は**変わらない**（1..63 の空き 7・111..255 の空き 57）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/blocks.ts`（`BlockDef.slowGround` とそのコメント・`def()` の既定 `opts.slowGround ?? false`・表 `SLOW_GROUND` と
その詰め込み 1 行・`isSlowGround()`・**`def(SOUL_SAND, …)` の opts に `slowGround: true` の 1 語**・ソウルサンドの定数のコメント）/
`src/player.ts`（定数 `SOUL_SAND_SPEED_SCALE`・フィールド `onSlowGround`・`update()` で `bodyStandsOn(…, isSlowGround)` の 1 行・
`updateWalk()` の `speed` の掛け算に 1 項）/ `test/physics.test.ts` / `test/blocks.test.ts` /
`TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / `rules/blocks-shapes.md`（氷の節の隣に 1〜3 行）。

**触らない**: **`src/main.ts`（0 行）** / `src/physics.ts`（`bodyStandsOn()` はそのまま使う。**新しい走査を書かないこと**）/
`src/mobs.ts` / `src/nethergen.ts`（湧き方は変えない）/ `ROADMAP.md`（ID を使わない）/ `*render.ts` / `ui.ts` / `SaveData` /
**`SOUL_SAND` の色・硬さ・道具・音**。

**先に引いて読むこと**: `grep -l '"src/blocks.ts"' rules/*.md`（→ `blocks-shapes.md` / `beds.md` / `items-survival.md`）/
`grep -l '"src/player.ts"' rules/*.md`（→ `blocks-shapes.md` / `mobs.md` / `vitals.md`）/ `rules/testing.md`。
**`rules/blocks-shapes.md` の 155..179 行（氷の足元の走査と「旗を 1 つにまとめない」）はそのまま掛かります。**

## 3. 使う ID

**0 個。** 既存の `SOUL_SAND = 46` に旗を 1 つ足すだけ。`ROADMAP.md` の予約表は触らない（**次に取るのは 199 のまま**）。

## 4. 判断をどこに置くか

新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要。スキルも要りません）。

- **どのブロックが遅いか**: `blocks.ts` の旗 `slowGround` / `isSlowGround()`。**`id === SOUL_SAND` と書かないこと**（表 1 本）。
  **`sticky` とも `slippery` とも 1 つにしないこと** —— クモの巣は体と重なるマス・氷とソウルサンドは足元、
  氷は滑らせるだけ・ソウルサンドは遅くするだけで、**どれも片方しか要りません**（`slippery` のコメントの形に揃える）
- **どれだけ遅いか**: `player.ts` の **`SOUL_SAND_SPEED_SCALE = 0.4`**（本家の値そのまま。`COBWEB_SPEED_SCALE` の隣に置く）
- **どのマスに効くか**: `player.ts` が **`bodyStandsOn(world, this.position, PLAYER_SIZE, isSlowGround)`**。
  **`moveBody()` のあと・`onSlippery` の隣**で見ること（前に置くと乗る前のフレームで真になる）
- **掛ける場所**: `updateWalk()` の **`speed`（目標の速さ）だけ**。**加速（`ACCEL_GROUND`）と摩擦には掛けない**
  （氷と違って滑りはしない）。**空中では足元が空気なので自然に偽**（空中の分岐を別に書かないこと）。水・クモの巣とは掛け算で重なる

## 5. 書くテスト（**値を出力してから判定する**）

- **`test/physics.test.ts`** に節「ソウルサンドの上では遅い（player.onSlowGround）」を **`ice()` の写し**で:
  床は土・**x=3..40 だけソウルサンド**（`Arena.fill`）と、同じ形の土だけの床（対照）
  - 歩き出す前（土の上）は `onSlowGround` が偽 / 歩いて乗ると真 / **隣のマスに立つだけでは偽**
  - **2 秒歩いた速さを両方出してから**: 土 5.1〜5.3・ソウルサンド **2.0〜2.2**（5.2 × 0.4 = 2.08）・**比が 0.38〜0.42**
  - **走っても 0.4 倍**（`ShiftLeft`。8.4 × 0.4 = 3.36 → 3.2〜3.5 の幅で出してから判定）
  - **空中（ソウルサンドの真上から落としながら 0.2 秒）では土の上と同じ**（`ice()` の最後の件の写し。0.5 秒にしないこと）
  - **氷の上では遅くならない・ソウルサンドの上では滑らない**（`onSlippery` が偽のまま）
- **`test/blocks.test.ts`**: `isSlowGround` が真の ID を一覧で出してから「**ソウルサンドだけ**」（氷・砂・ネザーラック・クモの巣は偽）/
  **ソウルサンドは `sticky` でも `slippery` でもなく、氷とクモの巣は `slowGround` でない**（旗を混ぜていないこと）

## 6. このタスク固有の禁じ手

- **`SOUL_SAND` の色・硬さ・道具・音・形（当たり判定）を変えないこと**（沈む 14/16 は別の周）
- **`sticky` / `slippery` を流用しないこと**・**`bodyStandsOn()` を書き換えないこと**・**`GROUND_FRICTION` / `ICE_*` を触らないこと**
- **モブ（`mobs.ts`）に効かせないこと**（上の決め）/ **`nethergen.ts` の湧き方を変えないこと**
- **`main.ts` に 1 行も書かないこと** / ID を振り直さない / `SaveData.version` は 1 のまま / **判定をゆるめないこと**
  （とくに既存の `ice()` 節の数値）/ **`test/world.test.ts` の p99 を触らないこと** / **52 以降に手を出さないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑・**4068 → 4075〜4078 あたり**）/ `npm run build` 緑（`src/**` を触る）。
  **生成もメッシュ化も触らないので `npm run bench` は不要**
- **C-3**: 見た目は変わらない（色も形も同じ）。**撮るのは不要**だが、HANDOFF に「絵には出ない・手触りだけ」と書くこと
- **コミット 1 つを `master` へ push** / キューの 51 を消す / この仕様書を **`状態: 済`** /
  `TUNING.md` に 1 行（0.4 は本家の値・走っても 0.4 倍・モブには効かせていない）/ `docs/autodev-log.md` に 1 節
  （モブへの適用と「沈む」形を見送った理由を 1 行ずつ）/ 踏んだ落とし穴を `rules/` へ / **`HANDOFF.md` を書き直す**
  （「ブラウザで見てほしいところ」に**ネザーの床の 3 割で歩く速さが 0.4 倍になる**のが遅すぎないか）
