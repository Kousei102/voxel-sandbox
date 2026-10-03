# 仕様: ケーキをかじる（前半）— 右クリックで 1 口ずつ食べ、7 口で消える（キューの 24b-1・**ID 0 個**）

状態: 済
差し戻し: 0 回

## 0. 数え直した結果（159 の B）

- `CAKE`(155) は置けて（`blocks.ts`）作れる（`crafting.ts`）が、**かじれない**（`src/` に bite の実装は 0 行。
  コメントが「24b の仕事」と言っているだけ）。`FOODS` にケーキの行は無い（置いたら食べるしかない）。
- `UseAction` は 19 通り（`use.ts`）。**20 通り目 `eatCake` を足す。**
- 位置ごとの数字 1 つは **`crops.ts` の `Crops`（`"x,y,z"` → 数字）に乗せる**のが先例（`crops.ts` 冒頭「新しいファイルを作らずにここへ乗せます」。
  `session.ts` / `storage.ts` の `crops` キーがそのまま通る＝**`SaveData` 不変**）。
- **見た目（かじった数で高さが変わる）は取らない。** ブロックごとの `boxes` しか持てず、段階を出すには
  **ブロック ID が 3〜6 個要る**（24a の注釈は「段階を ID で表さない」と言うが、表さないと絵が変わらない）。
  これは枠の消費と見た目の判断なので**後半 24b-2（キューへ書き戻した）**に分け、この周では**かじれるが形は変わらない**。
  **決めたこと**（人が 24b-2 で覆してよい）。

## 1. 何を足すか・完了の判定

1. **右クリックでケーキ（`CAKE`）を 1 口かじる**: 空腹へ **2・満腹度 0.4**（本家と同じ）を `Vitals.eat()` に渡す。
   **7 口目でブロックが消える**（`AIR`。ドロップなし）。1〜6 口目はブロックそのまま・かじった数だけ印に覚える。
2. **食べられるときだけ**: `canEat`（満腹なら食べない。`vitals.ts` の `canEatFood()`）が偽なら
   `flash「お腹は空いていません」`・**口数は増えない**。**クリエイティブは減らない・空腹も戻さない**（`eat` と同じ扱い。
   ただしクリエイティブで右クリックしても口数は増やさない＝何も起きない `none`）。
3. **口数はセーブに残る**（`crops` の表。再読み込みで同じ口数）。**ケーキを壊したら印も消す**（残ると、
   同じ位置に置き直した新しいケーキが最初から欠けている）。

完了 = `npm run typecheck` と `npm test` が緑で、`test/` に下の 5. の項目が増える。**共有帯の空きは 52 のまま**（次の空きは 204）。

## 2. 触るファイルと、触らないファイル

- 触る: `src/use.ts`（`UseAction` に `eatCake`・`UseFacts` に `canEat` を**既存のまま使う**・`decideUse` に 1 分岐）、
  `src/crops.ts`（`bite()` を足す・`update()` が CAKE の印を**消さない**ように）、`src/hands.ts`（`case "eatCake"` と
  `eatCakeAt()` を 15 行以内）、`src/vitals.ts`（**触るのは `canEatFood` を使い回すだけ。足すなら 0〜数行**）、
  `src/items.ts`（ケーキ用の `CAKE_BITE_FOOD`（hunger 2 / saturation 0.4 の `FoodDef` 形）を 1 つ）、
  `test/*.ts`、`rules/*.md`（据える）、`TUNING.md`、`ROADMAP.md`（24b-1 は ID 0 個と 1 行）。
- **触らない**: `main.ts`（1 行も）/ `blocks.ts`（**ブロックを足さない・`CAKE_BOX` を変えない**）/ `world.ts` /
  `worldgen.ts` / `storage.ts` / `session.ts`（**`SaveData` 不変**）/ `mesher.ts` / `.claude/**`。
- `hands.ts` は 472 行（上限 1500 の手前）。`main.ts` は 1082 行。

## 3. 使う ID

**0 個。** ブロックもアイテムも足さない。**既存の ID を 1 つも振り直さない。**

## 4. 判断の置き場所

- **何をするか**: `use.ts`。**並びは 6. の禁じ手 1 のとおり**（器・刈る・搾る・クワ・種・骨粉・バケツ・ミルクより後ろ、食べ物 `foodOf(held)` より前）。`aim` が要る。**満腹の門は `facts.canEat`**（本家と同じで
  ケーキの口でも満腹なら食べない）。**`canEat` は手のものの `foodOf(held)` で作られている**ので、
  ケーキ用に `canEat` を渡し直す必要がある —— **渡し方は `hands.ts`（`vitals.canEatFood(CAKE_BITE_FOOD)`）で、
  `use.ts` に `vitals` を import しない**。`UseFacts` に `canEatCake: boolean` を**1 つ足す**（`canEat` と同じ約束）。
- **口数を数える処理**: `crops.ts` の `bite(x,y,z, world): "eaten" | "finished" | "absent"`（`CropWorld` 越し。
  列が読み込み済み・そこが `CAKE` のときだけ。7 口目は `setVoxel(AIR)` が**成功したときだけ**印を消す）。
- `hands.ts` は呼んで、`"eaten"`/`"finished"` なら `vitals.eat()`・音（既存の食べる音）・`hud.refresh()`・`markDirty()` をするだけ。
- 新しく確かめられないものは足さない（`unverifiable-pair` は要らない）。`use.ts` に `document`/`three` を import しない。

## 5. 書くテスト（値を出してから判定）

- `test/use.test.ts`: ケーキを狙うと `eatCake`（`at` が狙ったマス）/ **満腹（`canEatCake: false`）なら `flash`** /
  クリエイティブなら `none` / **器（作業台・かまど・チェスト・ベッド）の判定が 1 つも動かない** /
  ケーキを狙っていなければ `eatCake` でない / **既存の 19 通りの判定が動かない**。
- `test/crops.test.ts`: `bite()` を 7 回呼んだ**前後のブロック ID と印の数を出力**し、1〜6 回目は `"eaten"`・印は 1〜6・
  ブロックは CAKE のまま / 7 回目は `"finished"`・ブロックは AIR・印は 0 / **未読み込みの列・CAKE でないマスは `"absent"` で
  何も書かない** / **`setVoxel` が false のとき 7 口目の印を残す** / **`update()` を回しても CAKE の印が消えない・口数が変わらない** /
  `serialize()` の往復で口数が戻る / 壊したあと（印の掃除）に置き直したケーキが 0 口から始まる。
- `test/items.test.ts`（または `vitals` の件）: `CAKE_BITE_FOOD` の hunger 2・saturation 0.4 を**出力して**判定。
- **数え直しで動く既存の件を先に探す**: 「`UseAction` は 19 通り」と数えている件・`crops.serialize()` の形を見ている件を
  `kind:` / `serialize` で `test/` から grep して直す（**判定をゆるめて緑にしない**）。

## 6. このタスク固有の禁じ手

1. **`use.ts` の既存の並びを動かさない。** `eatCake` は**器・刈る・搾る・クワ・種・骨粉・バケツ・ミルクより後ろ**に置く
   （前に出すと、ケーキの上で道具を持っている間それが効かない）。ただし**食べ物の分岐（`foodOf(held)`）より前**
   （ケーキを狙って右クリック → かじる。手の食べ物を食べ始めるのが先に勝つとケーキに触れない）。
2. **`CAKE` の見た目・`CAKE_BOX`・`DROPS`（壊しても何も落ちない）・レシピを変えない。段階 ID を足さない**（24b-2）。
3. **`Crops` の印の形（`"x,y,z"` → 数字）・`serialize()` の形を変えない。** 苗と同じ表に CAKE の口数が入る**だけ**。
   `growWheat()` / 苗・キノコ・サトウキビ・サボテンの挙動を変えない。
4. **口数を `World` に書かない**（`edits` に混ぜない）。**乱数を使わない。**
5. 踏んだ落とし穴は `rules/` へ `Edit` で据える（`grep -l '"src/use.ts"' rules/*.md` などで当たるものを**全部読んでから**。
   `.claude/**` へは書かない）。

## 7. 終了条件

`npm run typecheck` と `npm test` が緑 / コミット 1 つ / `TUNING.md` に 1 行（2 / 0.4 / 7 口・形は変わらない）/
`HANDOFF.md` に「ブラウザで見てほしいところ」（空腹で右クリック → 1 口ずつ減る・満腹だと「お腹は空いていません」・
7 口でケーキが消える・**形は 7 口まで変わらない**。手触りだけで絵は 1 枚も変わらないので `npm run shot` は不要）。
