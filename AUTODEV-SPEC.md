# 仕様: 投げた卵からヒヨコが湧く（キューの 43・**ID 0 個**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: 孵る道は `src/**` に**1 本もありません**。
`projectiles.onHitBlock`（`main.ts` 255 行）は `shatterCrystal()` を呼ぶだけ、`mobs.ts` に
`hatch` も `egg` も 1 語もありません（`EGG`(129) は鶏の `laying` とケーキのレシピだけ）。
`rules/projectiles.md` の 36 行が「**1/8 でヒヨコが孵るは入っていません**」と書いたままです。

## 1. 何を足すか / 完了の判定

**割れた卵から 1/8 で鶏が 1 羽湧く**（本家 Alpha 1.0.14）。**本家は「ヒヨコ」ですが、ここでは
大人の鶏**です —— **子モブの仕組み（小さい姿・育つ時間）が 1 つも無く**、足すと
`mobrender.ts` / `mobmesh.ts` の話になって 1 周で閉じません（`rules/projectiles.md` の但し書き）。
**完了**: `npm test` に**「投げた卵から湧く（43）」の節**が増えて**すべて緑**
（**+12〜16 件。3897 → 3910 あたり**）。**数え直す既存の件は 0 件の見込み**（ID も表も動かさないため）。

**⚠ `main.ts` は ±0 行で閉じること**（いま 1450 行）。呼び出しを 1 行足し、**真上の 7 行の
コメントを 6 行に書き直して相殺します**（下の 4）。**だから `AUTODEV.md` の停止条件 2 には
当たりません** —— `main.ts` を割ってよいかの人の判断は、**待ったまま持ち越し**です。

## 2. 触るファイル / 触らないファイル

**触る**: `src/mobs.ts`（**表 1 本 + 定数 1 つ + `hatch()` 1 本**）/ `src/main.ts`（**±0 行**）/
`test/mobs.test.ts`（節 1 つ）/ `test/ui.test.ts`（`routed` に 1 件）/ `rules/projectiles.md`（36〜37 行）/
`rules/mobs.md`（1 段）/ `TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md`。

**触らない**: **`src/projectiles.ts`（1 行も）** —— 卵の 8 つの値は雪玉と突き合わせてあります。
ほかに `src/items.ts` / `src/use.ts` / `src/mobrender.ts` / `src/mobmesh.ts` / `src/drops.ts` /
`src/worldgen.ts` / `ROADMAP.md` の予約表 /
**`CHICKEN` の定義（`laying` も `drop` も `size` も）** / **`hitByProjectile()` の引数** / `SaveData`。

**先に引いて読むこと**（層 2 は自動では読み込まれません。`grep -l '"src/mobs.ts"' rules/*.md`）:
`mobs` / `projectiles` / `testing` / `dom-ui` と、**`main.ts` に当たる 8 本**（`beds` /
`blocks-shapes` / `dimensions` / `drops` / `items-survival` / `stateful-blocks` / `use` / `vitals`）。

## 3. 使う ID

**0 個。** ブロックもアイテムも 1 つも足しません（**次に取るのは 189 のまま**）。**`ROADMAP.md` の予約表は 1 行も動かないのが正しい**ので、書き足さないこと。

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも足しません**（`unverifiable-pair` は要りません）。
判断は**全部 `mobs.ts`**（湧き・確率・音は元からあちらの持ち物）で、`main.ts` は繋ぐだけです。

`src/mobs.ts` に 3 つ（**`MOBS` の表の近く**に定数 2 つ、`hitByProjectile()` の隣に `hatch()`）:

```ts
/** 割れた飛び道具から湧くもの。**表 1 本**（`hostileFor()` と同じ作法で `if` の列にしない）。 */
export const HATCHES: Partial<Record<ProjectileKind, MobKind>> = { egg: "chicken" };
export const HATCH_CHANCE = 1 / 8;                       // 本家の値そのまま

hatch(shot: Projectile, world: World, ctx: MobContext, random = ctx.random ?? Math.random): Mob | null
```

`hatch()` の中はこの順（**1 つでも入れ替えないこと**。テストがこの順に乗ります）:

1. `const kind = HATCHES[shot.kind]; if (!kind) return null;` —— **`shot.kind === "egg"` と書かないこと**
2. `if (this.list.length >= MAX_MOBS) return null;` —— 卵を投げ続けてフレームの予算を割らせない
3. `if (random() >= HATCH_CHANCE) return null;`
4. `if (boxBlocked(world, x, y, z, MOBS[kind].size)) return null;` —— **壁の中に湧かせない**
   （`trySpawn()` と同じ 1 本。`boxBlocked` も `columnOf` も `mobs.ts` に import 済み）
5. `this.onSound?.("mobsay", MOBS[kind].voice);` → `return this.spawn(kind, x, y, z, random() * Math.PI * 2, random);`

**場所は `shot.position` をそのまま**（卵の中心。`spawn()` は足元の中心ですが、卵の半分は
0.125m なので差は見えず、重力で落ちます）。**未生成の列の心配は要りません**（`projectiles.ts`
はそこでは動かさないので（479 行）、当たりの合図自体が出ません）。

`src/main.ts` は `onHitBlock` の**先頭に 1 行**（`shatterCrystal()` の前）:

```ts
  mobs.hatch(shot, world, mobContext());
```

**真上の 7 行（248〜254）のコメントを 6 行に書き直して ±0 行にすること。** 中身は
「効くのは 2 つ（クリスタルが砕けるか・卵から湧くか）で、**どちらも判断は向こう側**」と、
いまの「砕いた弾はその場から消す」の 2 段。**`1 / 8` も `"egg"` も `"chicken"` も
`main.ts` に書かないこと。**

## 5. 書くテスト（**値を出力してから判定する**）

`test/mobs.test.ts` に**「投げた卵から湧く（43）」の節**を 1 つ（`describe()` から。
弾は `new Projectiles().spawn("egg", …)` で作る —— 2359 行の書き方を写す。乱数は `seeded()`）:

- **表と確率を出してから**: `HATCHES.egg === "chicken"` / `HATCHES.snowball === undefined` /
  `HATCH_CHANCE === 1 / 8`
- **境界を値で**: `random` が `() => 0.124` なら湧き、`() => 0.126` なら湧かない
- **実測の率**: 8000 回呼んで**湧いた数と率を出してから** `0.125 ± 0.02`。**`seeded()` なので
  決定的**です（通る種を選んでよい。**窓を広げるのは最後の手段**）
- **雪玉と矢では 1 羽も湧かない**（1000 回ずつ回して 0 件を出す）
- **湧いたのは鶏**（`kind === "chicken"` / 体力 4）で、**場所は割れた所**（`shot.position` と ±0.001）
- **石で埋めた所では湧かない**（1000 回で 0 件。`boxBlocked` が効いていること）
- **`MAX_MOBS`(40) まで埋めたら湧かない**（1000 回で 0 件）
- **音は `"mobsay"` が鶏の声（1.8）で 1 回**・**`onDrop` は 1 回も鳴らない**（湧くのであって落ちない）

`test/ui.test.ts` の `routed` に **`["卵からヒヨコ", "mobs.hatch("]`** を 1 件（理由のコメント付き。
**外すと、配線を落としても緑のまま通ります**）。**行数の判定は `<= 1500` のまま**にすること。

## 6. このタスク固有の禁じ手

- **`main.ts` を 1 行も増やさないこと**（+1 行の呼び出しと −1 行のコメントで ±0。増えたら仕様違反）
- **`projectiles.ts` に 1 行も書かないこと**（表も `onHitTarget` も。卵の 8 つの値は雪玉と対）
- **当たった相手（モブ）では孵らせないこと** —— `hitByProjectile()` に `world` を足すと
  配線とテスト 5 か所が動きます。**本家と違う点**として `TUNING.md` に 1 行
- **子モブ（ヒヨコの姿・大きさ・育ち）を足さないこと** / **`CHICKEN` の表を書き換えないこと**
- **`SaveData.version` は 1 のまま** / **テストの判定をゆるめないこと**

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` すべて緑** / `npm run build` 緑。**`bench` は不要**
  （生成もメッシュ化も 1 行も触らない）
- **C-3**: **新しい見た目は 0 個**（湧くのは今までどおりの鶏）。それでも
  **`npm run shot -- mobs --size 900x900` を 1 枚撮って `Read` で見ること**（1〜2 秒。
  鶏の形と面が前の周のまま出ていること）。**ブラウザ（`browsershot.mjs`）は要りません**
- **コミット 1 つを `master` へ push** / `AUTODEV-QUEUE.md` の 43 の行を消す / この仕様書を
  **`状態: 済`** に / **`rules/projectiles.md` の 36〜37 行を直す**（「入っていません」→ 入った。
  `mobs.ts` の `hatch()`）/ `rules/mobs.md` に 1 段 / **`TUNING.md` に 1 節**（**1/8**・
  **大人の鶏**・**相手に当たったときは孵らない**）/ `docs/autodev-log.md` に 1 節 / **`HANDOFF.md` を書き直す**
