# 仕様: エンダーマンが水に触れると痛い（キューの 40・**ID 0 個**）

状態: 未着手
差し戻し: 0 回

**先に読むこと**: `rules/mobs.md` / `rules/testing.md`（`grep -l '"src/mobs.ts"' rules/*.md` と
`grep -l '"AUTODEV-SPEC.md"' rules/*.md` の 2 本）。**スキルは使いません**（ID 0 個・確かめ
られないものも 0 個）。

## この周の前に数え直したこと（2026-09-21 の B の周で実測。**推測ではありません**）

- **モブは水で 1 も減りません。** 体力が減る道は `burn()`（日光と溶岩。`mobs.ts:2545`）と
  `wound()`（殴られた・撃たれた）の 2 本だけで、**水を見る行が 1 つもありません**
- **キューの「`isHotLiquid` とそっくり」は足りません** —— `mob.liquid` は**胴の中ほど**
  （`size.height * 0.5`。`mobs.ts:2455`）の 1 点だけで、**深さ 2 マス未満の水では濡れません**
- **跳んで逃げる道はもうあります** —— `wound()` が `teleportUrge` を立て、`teleport()` が
  `hurtChance`(0.5) で跳ばせ、**`teleportSpot()` が液体を行き先から外します**（`mobs.ts:2659`）
- **`main.ts` も `vitals.ts` も 0 行**（`DamageCause` は増えません）。**`Mob` は保存しないので
  `SaveData` は 1 バイトも増えません**

## 1. 何を足すか / 完了の判定

**エンダーマンだけが、水に触れているあいだ毎秒 2 ずつ体力を失う**（体力 40 なので 20 秒）。
**痛んだ拍子に既存の道で跳んで逃げます。** **完了の判定**: `npm test` に新しい節
**「水に触れると痛い（エンダーマン）」が 7 件**増えて**全部（3860 → 3867 件）が緑**。

## 2. 触るファイルと、触らないファイル

| ファイル | やること |
| --- | --- |
| `src/mobs.ts` | `MobDef` に列 1 つ / `Mob` に溜め 1 つ / 純粋関数 1 本 / 私有の `soak()` 1 本 / `update()` に 1 行 |
| `test/mobs.test.ts` | 新しい節 7 件 / 見張りの一覧に `"waterHurt"` を 1 語 |
| `TUNING.md` / `rules/mobs.md` | 1 節（下の 7.）/ 踏んだ落とし穴を 1〜3 行（C-4） |

**触らないこと**: **`src/main.ts`（0 行。1450 行で止まる目安に並んでいます）** /
`src/vitals.ts` / `src/blocks.ts` / `src/mobrender.ts` / `src/player.ts` / `ROADMAP.md`。

## 3. 使う ID

**0 個。** ブロックもアイテムも増えないので **`ROADMAP.md` の予約表は 1 行も触りません**（次の空きは 187・低帯は 57 のまま）。

## 4. 判断をどこに置くか —— **全部 `mobs.ts`**（確かめられないものは増えません）

- **表に列を 1 つ**: `readonly waterHurt: number`（**触れているあいだの毎秒のダメージ。0 なら
  水を見ない**）。**`?:` にしない**・**エンダーマン 2・ほか 9 種類は 0**・**`kind` を見ない**
- **`BURN_DAMAGE`(2) を使い回さないこと。** 同じ 2 でも別の値で、`MOB_DAMAGE` / `FLY_HOVER` /
  `FLY_RISE` と同じ形で壊れます（日光の速さを触ると水まで動く）
- **`Mob` に溜めを 1 つ**: `soakTick: number`（`burnTick` の隣。`spawn()` の初期値は 0）。
  **乾いているあいだは進めないだけで、0 へ戻さないこと** —— 戻すと、水面を出入りするだけで
  永久に痛くないモブになります
- **純粋関数を 1 本**（`calmInLight()` の隣・**export する**。決まりはこの 1 本だけが持つ）:

```ts
export function waterDamage(waterHurt: number, mid: number, feet: number): number {
  const wet = (id: number) => isLiquid(id) && !isHotLiquid(id);
  return waterHurt > 0 && (wet(mid) || wet(feet)) ? waterHurt : 0;
}
```

- **2 点を見るのは浅い水のため**（本家は「触れたら」）。**`mob.liquid` の測る高さを動かさない
  こと**（速さ・跳躍・壁登り・溶岩が乗っています）。**`WATER` と直に比べない**（`blocks.ts` は 0 行）
- **私有の `soak(mob, def, world, dt, ctx)` を 1 本**（`burn()` の真下に、あれを写す形。
  倒れたら true）: `waterDamage(def.waterHurt, mob.liquid, world.getVoxel(…足元…))` が 0 なら
  **何もせず false**（足元の `getVoxel` を払うのは表に値を持つモブだけ）。0 でなければ
  `soakTick += dt` を溜めて **1 秒ごとに `wound()` を 1 回**。倒れたら `mobdeath` を
  `SAY_DISTANCE` の内だけ鳴らし、**`onDrop` は呼ばない**（`burn()` と同じ規則）
- **`update()` に 1 行**: `if (this.soak(…)) continue;` を **`burn()` の直後・`regenerate()` の前**へ
- **`burnTimer` を水で立てないこと** —— 水中のエンダーマンが燃えて見えます

## 5. 書くテスト（`test/mobs.test.ts`・新しい節「水に触れると痛い（エンダーマン）」）

**`describe("モブと溶岩")` の節の末尾**（`describe("敵対モブの攻撃…")` の直前）に置くこと ——
対照に**あの節がもう作っている `wet`**（`swim("zombie", WATER)`）をそのまま使います。
**`swim()` と溶岩の 6 件は 1 文字も書き換えないこと。** 新しい `check()` はちょうど 7 件:

- **試験場は `swim()` を写した `dunk({ kind, random, seconds, health })` 1 つ**（蓋をした水の池。
  **浮いて出てしまわないよう蓋をすること**）。返すのは `{ soaked, escaped, health,
  burnTimer, alive, drops, seconds }`。**`escaped`（一度でも
  `mob.liquid === AIR` になったか）は `pack.update()` のあとで見ること**（湧いた直後は物理が
  1 度も回っておらず `AIR`）。**写した理由は `random` を渡せること**（`seeded(83)` では
  跳んで逃げてしまい、減り方を測れません）
- a. **表**: 10 種類ぶんの `waterHurt` を出したうえで、**`MOB_KINDS.filter((k) =>
  MOBS[k].waterHurt > 0).join(" ") === "enderman"`**（`calmLight` の 2987 行と同じ形）
- b. **純粋関数の 4 通りを 1 件で**: 水 → 2 / 溶岩 → 0 / 空気 → 0 / **足元だけ水でも 2**
  （浅い水のぶん。**4 つの値を出してから判定すること**）
- c. **沈めたエンダーマンが毎秒 2 ずつ減る**（`random: () => 1` で跳ばせない。**浸かった証拠
  `soaked` を先に**出し、**10 秒で 40 → 20 前後**。判定は**実測の毎秒が 1.5〜2.5 の中**）
- d. **対照: 同じ水でゾンビは 1 も減らない**（**上の `wet` を使う**。
  `wet.health === MOBS.zombie.maxHealth`。**2 種類の体力を並べて出すこと**）
- e. **水では火が点かない**（c と同じ走りの `burnTimer === 0`。水中で燃えて見えない裏取り）
- f. **痛んだら跳んで逃げる**（`random: seeded(…)` で 15 秒。**`soaked` と `escaped` の両方が
  立つこと**と、そのときの体力を出す。**既存の `teleportUrge` の道に乗っている証拠**）
- g. **水で倒れてもドロップしない**（`health: 4` で沈める。**`alive === false` と
  `drops === 0` の両方を出す**。溶岩の焼死と同じ規則）
- **見張り**: `decisions` の一覧（183..228 行）に **`"waterHurt"`** を足して、
  **`mobrender.ts に判断が漏れていない` が緑のまま**であること（**`check` は増えません**）

## 6. このタスク固有の禁じ手

- **`MobDef` に列を 2 つ以上足さないこと**（毎秒のダメージ 1 つで足ります）
- **溺れ（酸素・息継ぎ）を足さないこと**（**別の周**。足すのは触れているあいだの痛みだけ）
- **雨を足さないこと**（本家は雨でも痛みますが、**天候は見送り済み**）
- **`teleport()` / `teleportSpot()` / `wound()` を 1 文字も触らないこと**（印は `wound()` が立てます）
- **`mob.liquid` の測り方（`size.height * 0.5` の 1 点）を動かさないこと**
- **`DamageCause` を増やさないこと**（`vitals.ts` はプレイヤーの体力の話で、ここは 0 行）
- **`ENDERMAN` のほかの値を触らないこと**（`maxHealth` 40 / `damage` 7 / `teleport` の表）
- **キューの 41（ネザーレンガのフェンス）に手を出さないこと**

## 7. 終了条件

`npm run typecheck` と `npm test`（**3867 件・全部緑**）/ `npm run build`（`src/**` を触るため）/
**コミット 1 つを `master` へ push** / **`TUNING.md` に 1 節**（**毎秒 2 は本家の実測**:
1 ダメージ × 0.5 秒の無敵。**深さ 2 マス未満の浅い水でも痛む**ことと **雨は無い**ことも書く）/
`AUTODEV-QUEUE.md` の 40 の行を消す / この仕様書を `状態: 済` にする /
**`docs/autodev-log.md` に 1 節** / **`HANDOFF.md` を丸ごと書き直す**。

**`npm run bench` は要りません**（生成もメッシュ化も触らないため）。**撮るのは
`npm run shot -- mobs --size 900x900`**（列を足すので 10 種類の形を見る。**前の周とビット同一
になるはず**）。**水で痛む姿は絵になりません** —— **人に見てもらうぶん**を `HANDOFF.md` へ。
