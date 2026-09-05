# 仕様: ミルクバケツ（牛を右クリックして搾る・飲むと毒が消える）

状態: 済
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭 15b。** 2026-09-05 に数え直して **`milk` は `src/**` にも
`test/**` にも 0 件**（`grep -rn -i milk src/ test/` が 0 行）。牛（`mobs.ts` の `COW`）も
バケツ（84）も毒（`vitals.ts` の `POISON_TICKS`）もすでにあるので、**繋ぐだけの周**です。

**新しい見た目も新しい音も作りません**（`mobmesh.ts` / `mobrender.ts` / `sfx.ts` /
`audio.ts` は 0 行）。搾る音は既存の `"splash"`、飲む音は既存の `"eat"` を借ります。

## 1. 何を足すか / 完了の判定

**空のバケツを持って手前の牛を右クリックするとミルクバケツになり、それを右クリックで
飲むと毒が消えて空のバケツに戻る。** 飲んでも空腹と満腹度は 1 も動きません（本家と同じ）。

完了の判定（`npm test` が**全部緑のまま**、次が増えていること）:

- `test/use.test.ts` —— **牛が手前 + 空バケツ → `milk`**・**牛が居なければ `bucket`**・
  **ミルクバケツ → `drink`**・**ミルクバケツを持って作業台を狙ったら `craft`**（器が勝つ）
- `test/mobs.test.ts` —— **`canMilk()` が真になるのは牛だけ**（9 種類を並べて出してから判定）
- `test/vitals.test.ts` —— **毒のあいだに飲むと `poisoned` が偽になり戻り値が真**・
  **毒でないときは戻り値が偽**・**空腹と満腹度が飲む前後で同じ**
- `test/blocks.test.ts` —— 共有帯のアイテムが **24 → 25 個**・`MAX_ITEM_ID` が
  **`MILK_BUCKET`**・**111..255 の空きが 118 → 117**（**数え直しであって、ゆるめる
  ことではありません**。あの 3 件はもともと「数を出してから数で押さえる」形です）

## 2. 触るファイル / 触らないファイル

| ファイル | 何を書くか |
| --- | --- |
| `src/items.ts` | `MILK_BUCKET = 138` の定数と `item({...})` 1 行・`MAX_ITEM_ID` を伸ばす |
| `src/mobs.ts` | `MobDef` に `milkable: boolean` を 1 つ・9 定義に 1 行ずつ・`canMilk(mob)` |
| `src/use.ts` | `UseFacts.milkable` と `UseAction` の `milk` / `drink`・`decideUse()` の 2 分岐 |
| `src/vitals.ts` | `drinkMilk(): boolean`（毒を消し、消したかを返す） |
| `src/main.ts` | **配線だけ。15 行以内**（`case "milk"` / `case "drink"` と `milkable` の 1 行） |

**触らないこと**: `mobmesh.ts` / `mobrender.ts` / `sfx.ts` / `audio.ts` / `crafting.ts` /
`smelting.ts` / `placing.ts` / `items.ts` の `FILLED_BUCKETS` と `FOODS` / `blocks.ts`。

**先に読むこと**（`rules/*.md` は自動では読まれません）:
`rules/use.md`・`rules/vitals.md`・`rules/mobs.md`・`rules/items-survival.md`・`rules/testing.md`。
スキルは **`add-block`**（アイテムを 1 個足す手順）。**`unverifiable-pair` は要りません**
（新しく確かめられないものを 1 つも足さないため）。

## 3. 使う ID

**138 を 1 個だけ**（`ROADMAP.md` の予約表「138..255 予備 118 個」の先頭）。
**ミルクバケツはアイテムだけ**（`block: AIR`。置けるミルクは本家にありません）。
**`stack: 1`**（バケツ 84・水入り 85・溶岩入り 86 と同じ）。**それ以外の番号を取らないこと。**

## 4. 判断をどのファイルに置くか

- **「誰から搾れるか」は `mobs.ts`。** `MobDef` に `milkable` を 1 つ足し、**`kind === "cow"`
  と書かないこと**（`shearing` / `ranged` / `orbit` と同じ作法。`rules/mobs.md`）。
  **時計も回数も持たせないこと** —— 本家の牛は何度でも搾れるので、`ShearRule` のような
  `regrow` は要りません（**位置ごとの状態も ID も増えません**）。
- **「手前に居るか」を `use.ts` に持ち込まないこと。** `shearable` / `hasArrow` と
  まったく同じ約束で、**`main.ts` が `mobIsNearer()` と `mobs.canMilk()` を込みにして
  `milkable` を渡します**（`use.ts` が器を見に行き始めると判断が 2 か所に散ります）。
- **「毒が消えるか」は `vitals.ts`。** `drinkMilk()` が `poisonLeft` / `poisonTick` を 0 にし、
  **消したかどうかを返します**（`main.ts` は戻り値で文言を出すだけ。数値は持たせない）。
  **`heal()` も `eat()` も呼ばないこと** —— 本家のミルクは空腹に効きません。
- **`decideUse()` の並び順（`rules/use.md` の「並び順そのものが判断」）**:
  1. **`milk` は `shear` の隣・器より前。** あとにすると、作業台やチェストの前に立った
     牛だけ搾れません（羊とまったく同じ壊れ方で、現物を追い込むまで気付けません）
  2. **`drink` は `bucket` の直後。** 器より後ろでないと、ミルクを持っているあいだ
     作業台が開きません（`rules/use.md` の並びの 2 番目）。**`aim` は見ないこと**
     （空を向いたまま飲めるのが正しい。食べる・弓・バケツと同じ）

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。`test/use.test.ts` は
**返った `kind` を並べて `console.log` してから**判定している既存の形に合わせること。

- `test/use.test.ts` に上の 4 件（**作業台を狙った牛**も 1 件入れること —— 1 の並びが
  効いている証拠になります）
- `test/mobs.test.ts` に 1 件（**9 種類ぶんの `kind: canMilk` を出してから**「牛だけ真」）
- `test/vitals.test.ts` に 3 件（**飲む前後の `health` / `hunger` / `saturation` /
  `poisoned` を出してから**判定）
- `test/blocks.test.ts` の 3 件は**数え直す**（1 の完了判定のとおり）

## 6. このタスク固有の禁じ手

- **`FILLED_BUCKETS` に行を足さないこと。** 足すと `isBucket(MILK_BUCKET)` が真になり、
  **ミルクを地面に「流せる」**ようになります（ミルクは液体ブロックではありません）
- **`FOODS` に行を足さないこと。** 足すと `canEat` の門（「お腹は空いていません」）に
  掛かって、**満腹のときに毒を消せなくなります**
- **`ShearRule` を書き換えないこと**・**既存のドロップ表と落とし物を 1 行も変えないこと**
- **既存の ID を振り直さないこと**・**`SaveData.version` は 1 のまま**
- **`test/ui.test.ts` の `routed` に当たる語を動かさないこと**（`decideUse(` / `tryBucket(` /
  `mobIsNearer(`。動かす行の語は先に `grep -rn '<語>' test/` で当たること。`rules/testing.md`）
- **`main.ts` を 1450 行より大きくしないこと**（いま 1428 行。15 行以内に収める）

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **全部緑**（増えた件も含む）/ `npm run build` 緑 /
**コミット 1 つ** / `AUTODEV-QUEUE.md` の 15b の行を消す / この仕様書を `状態: 済` に /
**`ROADMAP.md` の予約表に 138 を「実装済み」で 1 行**（予備を 118 → 117 個に直す）/
**`docs/autodev-log.md` に 1 節** / **`HANDOFF.md` を丸ごと書き直す** / **`master` へ push**。

**C-3（撮る）**: 見た目に出るのは**クリエイティブ一覧に枠が 1 つ増えること**だけなので、
`npm run build` → `node tools/browsershot.mjs` の 5 枚で足ります（**新しい形は 0 個**）。
**撮ったら `Read` で開いて見ること。** `TUNING.md` には**飲んでも空腹が戻らないこと**を 1 行。
