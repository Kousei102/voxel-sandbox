# 仕様: 燃えて死んだ豚・牛・鶏は焼けた肉を落とす（キューの 53・**ID 0 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**: 入っていません。`mobs.ts` の `MobDropStack` は `item` / `count` / `chance` の 3 つだけで、
`dropsFor()`（倒したときの山を全部返す 1 本）は `mob.burnTimer` を 1 回も読みません。**燃えている豚を殴って倒しても生の豚肉**が出ます。
焼いた肉 3 つは既存（焼き豚 83 / 焼き鳥 127 / ステーキ 131。`smelting.ts` の `SMELTING` が生 → 焼きの 3 行を持つ）。

**本家の規則**: 燃えている（火が点いている）あいだに死んだ豚・牛・鶏は、生肉の代わりに焼けた肉を落とす（数は同じ）。
**羽根・革（2 山目）は焼けない。** ゾンビの腐った肉のように焼けた形の無い物はそのまま。

**このプロジェクトで燃えるのは**: 溶岩に触れたモブ（敵味方とも。`update()` の `LAVA_LINGER` = `BURN_SECONDS`）と、日光の敵対モブだけ。
火打石も火矢も無いので、**実際に起きるのは「溶岩のほとりで燃えている豚・牛・鶏を、燃え残りのうちに殴る / 撃つ」**だけです。
**焼死（`burn()` で倒れる）ではこれまでどおり何も落としません**（`rules/mobs.md`・`test/mobs.test.ts` の「焼死ではドロップしない」
「溶岩の焼死でもドロップしない」。**本家は焼死でも落とすが、ここでは人が選んだ判断なので変えない**）。

## 1. 何を足すか / 完了の判定

**`MobDropStack` に省略可の `cooked?: number`（燃えていたらこの ID に差し替える）を足し、豚・牛・鶏の 1 山目にだけ書く。
`dropsFor()` は `mob.burnTimer > 0` かつ `cooked` を持つ山で `item` を `cooked` に差し替える。**
`attack()` と `hitByProjectile()` はどちらも `dropsFor()` を通っているので、**呼ぶ側は 0 行**で両方に効く。
**完了**: `npm test` に「燃えて死んだ動物は焼けた肉を落とす（53）」の節（`test/mobs.test.ts`・**8〜12 件**）が増えて
**すべて緑**（**4112 → 4120〜4124 あたり**）。ブロック ID の枠の行は**変わらない**（1..63 の空き 7・111..255 の空き 57）。

## 2. 触るファイル / 触らないファイル

**触る**:
- `src/mobs.ts` —— **この 1 本だけ**:
  - `MobDropStack` に `readonly cooked?: number;`（doc コメントに「燃えている（`burnTimer > 0`）ときに `item` の代わりに落とす ID。
    **数も確率もそのまま**。`smelting.ts` の `SMELTING` と同じ行になること（テストが突き合わせる）」）
  - `PIG` / `CHICKEN` / `COW` の `drop` の **1 山目にだけ** `cooked: COOKED_PORK` / `COOKED_CHICKEN` / `STEAK`（`extra` の羽根・革には書かない）。
    `items.ts` から 3 つ import を足す
  - `dropsFor()` の `stacks.push` の所で `item: mob.burnTimer > 0 && stack.cooked !== undefined ? stack.cooked : stack.item`。
    **乱数の引き方（`chance >= 1` の山では引かない）と山の順は変えない**
- `test/mobs.test.ts`（下の 5.）/ `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / `rules/mobs.md`（落とし穴があれば 1〜3 行）/
  `TUNING.md`（下の 7.。**本家と違えたところ 1 行**）

**触らない**: `src/smelting.ts`（**`mobs.ts` から `smelting.ts` を import しないこと** —— モブの落とし物がかまどの表に縛られ、
鉱石を焼く行を足すたびにモブの側が動く。突き合わせはテストの側でやる）/ `src/items.ts`（食べ物の値・`FOODS`）/ `burn()` と `soak()`
（**焼死のドロップ無しを変えない**）/ `update()` の火が点く条件（`LAVA_LINGER` / `sunlightBurns()`）/ `src/main.ts` / `src/hands.ts` /
`src/drops.ts` / `*render.ts`（**燃えている見た目は足さない**）/ `ROADMAP.md`。

**先に引いて読むこと**: `grep -l '"src/mobs.ts"' rules/*.md`（→ `rules/mobs.md`。とくに「2 山目を落とす」と焼死の段）/
`rules/testing.md`（`test/**` を触るので）。**`dropFor()` / `dropsFor()` の doc コメント**（刈った羊の抑え・乱数を引かない山）も読むこと。

## 3. 使う ID

**0 個。** 焼き豚 83・焼き鳥 127・ステーキ 131 は既存。`ROADMAP.md` の予約表は触らない（**次に取るのは 199 のまま**）。

## 4. 判断をどこに置くか

新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要。スキルも要りません）。

- **何が何に焼けるか**: `mobs.ts` の種類の表（`MobDef.drop` の 1 山目の `cooked`）。**`kind === "pig"` と書かないこと**（`shearing` / `laying` と同じ作法）
- **燃えているかどうか**: `mob.burnTimer > 0`（既存の状態を読むだけ。新しい旗を足さない）
- **差し替えるのは `dropsFor()` の 1 か所だけ**。`attack()` / `hitByProjectile()` に条件を書かないこと（弓のときだけ生肉、が戻る）
- **焼けた形の表と精錬の表の一致はテストが見る**（`smeltResultOf(stack.item)?.out === stack.cooked`）

## 5. 書くテスト（`test/mobs.test.ts`。**値を出力してから判定する**）

`describe("燃えて死んだ動物は焼けた肉を落とす（53）")` を「`dropsFor()` が返す山の数の表」の近くに足す。

- **表**: `MOB_KINDS` を回して `cooked` を持つ山を一覧で出し（`豚: 生の豚肉 → 焼き豚` の形）、**豚・鶏・牛の 3 つだけ・どれも 1 山目**
  （`extra` に `cooked` を持つモブは 0）
- **精錬と同じ行**: `cooked` を持つ山は全部 `smeltResultOf(item)?.out === cooked`（`test` 側で `../src/smelting` を import）
- **逆向きの見張り**: どのモブでも、1 山目が `SMELTING` で焼ける食べ物（`foodOf(smeltResultOf(item).out)` が非 null）なら `cooked` を持つ
  （新しいモブが生肉を落とすのに `cooked` を書き忘れたら落ちる）
- **`dropsFor()`**: `burnTimer = 5` にした豚 / 鶏 / 牛で、山の中身を出してから **焼き豚 x1 / 焼き鳥 x1 + 羽根 x1 / ステーキ x1 + 革 x1**。
  `burnTimer = 0` では今までどおり生（既存の山の数の表が動かないこと自体も見張り）
- **乱数を引く回数が変わらない**: 燃えている鶏で 0 回（既存の「chance 1 の山では乱数を引かない」の写し）
- **燃えていても焼けない物**: 燃えているゾンビは腐った肉（か何も無し）のまま・**燃えている刈っていない羊は羊毛のまま**
- **殴って倒す / 撃って倒す**: `attack()` と `hitByProjectile()` で、燃えている豚を倒したときの `onDrop` の ID が**両方とも焼き豚**
  （`burnTimer` を直に立ててから。**体力を 1 にして 1 発で倒すこと** —— 既存のスケルトンの件の形・`rules/mobs.md`）
- **焼死はまだ落とさない**: 溶岩に浸けた豚が焼け死んだとき `onDrop` 0 回（既存の「溶岩の焼死でもドロップしない」が受動モブで
  見ていなければ足す。見ていればそれを引用するだけでよい）

## 6. このタスク固有の禁じ手

- **`burn()` / `soak()` の「焼死・溺死では落とさない」を変えないこと**（本家と違うが、人の判断）
- **`mobs.ts` から `smelting.ts` を import しないこと** / `SMELTING` と `FOODS` を書き換えない
- **2 山目（羽根・革・矢・糸）に `cooked` を書かないこと** / 数（`count`）と確率（`chance`）を燃えているときに変えない
- **`dropsFor()` の乱数の引き方を変えないこと**（種を固定した既存テストの目がずれる）/ `dropFor()` の刈った羊の抑えを写さない
- `attack()` / `hitByProjectile()` / `main.ts` / `hands.ts` に燃えているかの条件を書かない / ID を使わない / 判定をゆるめない

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑）/ `npm run build` 緑（`src/**` を触る）。**生成もメッシュ化も触らないので `bench` は不要**
- **C-3**: 絵に出るものは無い（落ちるアイテムの ID が変わるだけ）。**`npm run shot -- terrain` の md5 が前と同じ**ことだけ見る
  （前: `1eb34c15f2875ec74d1951dba30cb334`）。`HANDOFF.md` の「ブラウザで見てほしいところ」に**溶岩のほとりで燃えている豚を倒すと
  焼き豚が落ちる / 溶岩で焼け死んだら何も落ちない（本家は落ちる）**を 2 行
- `TUNING.md` に 1 節 1 行: **焼死では落とさない**（本家は落とす。`burn()` の判断をそのまま残した）
- **コミット 1 つを `master` へ push** / キューの 53 を消す / この仕様書を **`状態: 済`** / `docs/autodev-log.md` に 1 節 /
  踏んだ落とし穴を `rules/mobs.md` へ / **`HANDOFF.md` を書き直す**
