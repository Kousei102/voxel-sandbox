# 仕様: 骨粉 — 骨 1 → 骨粉 3。小麦の苗にかけると、その場で実る（キューの 35・**ID 1 個**）

状態: 未着手
差し戻し: 0 回

## 0. 数え直した結果（157 の B）

- `src/` に骨粉は 0 行（`items.ts` の `BONE`(162) の注釈に「骨粉は別の周」とあるだけ）。骨も苗（`WHEAT_CROP`）も実（`WHEAT_CROP_RIPE`）もある。
- `use.ts` の `UseAction` は 18 通り（`hands.ts` の `useOrPlace()` に `case` が並ぶ）。**19 通り目を足す。**
- 苗の育ちは `crops.ts` の `Crops`（印 = `"x,y,z"` → 経過秒。`growWheat()` が 180 秒で実らせる）。
- **決めたこと: 効くのは小麦の苗だけ。** 苗木（木になる）・サトウキビ・草むらは**取らない**（苗木は
  `treeshape.ts` を呼ぶ話で別の 1 周。見送りを `docs/autodev-log.md` へ 1 行）。

## 1. 何を足すか・完了の判定

1. **アイテム `BONE_MEAL`（ID 203。ブロックではない）**: 置けず・道具でも食べ物でもない（`BONE` と同じ扱い）。
2. **レシピ 1 本**: 骨 1 個 → 骨粉 3 個（**形なし**・手持ちの 2x2 で作れる。既存の形なしレシピの書き方に揃える）。
3. **使う**: 骨粉を持って**小麦の苗（`WHEAT_CROP`）を右クリック**すると、その場で `WHEAT_CROP_RIPE` になり、
   印が消える。サバイバルでは 1 個減る。**実った小麦・耕地でない苗・別のブロックには何も起きず、減らない**。
   （本家はランダムに数段進む。ここは苗が 2 段しかないので**1 回で実る**。`TUNING.md` に 1 行。）

完了 = `npm run typecheck` と `npm test` が緑で、`test/` に下の 5. の項目が増え、**共有帯の空きが 53 → 52**
（次の空きは 204）。

## 2. 触るファイルと、触らないファイル

- 触る: `src/items.ts`（`BONE_MEAL` の定数・`item()` 1 行・`MAX_ITEM_ID` を 203 へ）、`src/crafting.ts`（レシピ 1 本）、
  `src/crops.ts`（`fertilize()` を 1 つ足す）、`src/use.ts`（`UseAction` に `fertilize`・`decideUse` に 1 分岐）、
  `src/hands.ts`（`case "fertilize"` と `fertilizeAt()` を足すだけ）、`test/*.ts`（5. のとおり）、
  `rules/*.md`（据える。6.）、`TUNING.md`、`ROADMAP.md`（予約表に 203 を「実装済み」で 1 行）。
- **触らない**: `main.ts`（1 行も）/ `blocks.ts` / `world.ts` / `worldgen.ts` / `storage.ts`（**`SaveData` 不変**）/
  `mobs.ts` / `.claude/**`。
- `hands.ts` は 1 本 1500 行の上限の手前（`npm test` の「hands.ts N 行」を先に読む）。足すのは 15 行以内。

## 3. 使う ID

**アイテム 203 を 1 個だけ。** `ROADMAP.md` の予約表（「203..255 予備」）から取り、203 の行を足して予備を 204..255 に直す。
低帯・ブロック ID は使わない。**既存の ID を 1 つも振り直さない。**

## 4. 判断の置き場所

- **何を・いつ**: `use.ts`（`held === BONE_MEAL && aim.id === WHEAT_CROP` なら `fertilize`。**`aim` が必要**・器より後ろ・
  `isSeed` の並び。**可否の細部は `crops.ts`**）。
- **実らせる処理**: `crops.ts` の `fertilize(x,y,z, world): boolean`（`CropWorld` 越し。`growWheat()` の 2〜4 と同じ門:
  列が読み込み済み・まだ `WHEAT_CROP`・**`setVoxel` が成功したときだけ印を消す**）。**耕地の下は問わない**
  （育たない苗にかけて実らせるのは本家でも可。**決めたこと**）。
- `hands.ts` は呼んで音（`"place"` か既存の近い音）・消費・`hud.refresh()`・`markDirty()` をするだけ。
- 新しく確かめられないものは足さない（`unverifiable-pair` は要らない）。`use.ts` に `document`/`three` を import しない。

## 5. 書くテスト（値を出してから判定）

- `test/items.test.ts`: `BONE_MEAL` が 203・`MAX_ITEM_ID` が 203・名前「骨粉」・置けない・道具でない・食べ物でない。
  **色を出力**し、**一覧の最近傍との隔たり（`dist`）が 20 以上**（`HANDOFF.md` の「色を総当たりで測る」で測って選ぶ。
  素直な白 `0xf0f0f0` は羊毛・雪に近い。選んだ値は `TUNING.md` へ）。
- `test/crafting.test.ts`: 骨 1 → 骨粉 3 / 骨 0 では作れない / 2x2 で通る。
- `test/use.test.ts`: 骨粉 + `WHEAT_CROP` → `fertilize`（`at` が狙ったマス）/ 実った小麦・土・空を向く → `fertilize` でない
  （`place` や `none`）/ **骨を持っても `fertilize` でない** / 既存の 18 通りの判定が 1 つも動かない。
- `test/crops.test.ts`: `fertilize()` で `WHEAT_CROP_RIPE` になり印が消える（**値: 前後のブロック ID と印の数を出力**）/
  実った小麦・別ブロック・**未読み込みの列では何も書かず false** / `setVoxel` が false のとき**印を残す** /
  耕地でない苗にも効く / `serialize()` の形が前と同じ。
- **数え直しで動く既存の件を先に探す**: `MAX_ITEM_ID` を `===` で見ている件（`test/blocks.test.ts` の共有帯の一覧・
  `test/items.test.ts` の前の節）と「レシピ N 本」「共有帯 N 個」の件を、`BONE_MEAL` / `MAX_ITEM_ID` の定数名で `test/` を
  grep して**数えを直す**（前の節は `>` にして `===` は新しい節へ移す。**判定をゆるめて緑にしない**）。

## 6. このタスク固有の禁じ手

- **`use.ts` の既存の並びを動かさない**: 器（作業台・かまど…）・クワ・種・バケツより**前に出さない**（出すと器の上で骨粉を
  持っている間、器が開かない）。種の分岐の**直後**に足す。
- **苗木・サトウキビ・草むらに効かせない**（見送り）。**骨粉を `BONE` の別名にしない**（別 ID）。
- **`crops.ts` の既存の定数・`growWheat()` の挙動を変えない**。`Crops` の印の形（キー `"x,y,z"`）を変えない。
- 骨粉を**置けるブロックにしない**（`block: AIR`・`tool:` を持たせない。`BONE` の注釈の罠）。
- 踏んだ落とし穴は `rules/` へ `Edit` で据える（触るファイルに当たる rules を `grep -l '"src/use.ts"' rules/*.md` などで
  引いて**全部読んでから**書く。`.claude/**` へは書かない）。

## 7. 終了条件

`npm run typecheck` と `npm test` が緑 / コミット 1 つ / `TUNING.md` に 1 行（骨粉の色・「1 回で実る」）/
`HANDOFF.md` に「ブラウザで見てほしいところ」（骨を 1 個持って 2x2 で骨粉 3 個 → 小麦の苗に右クリックで一瞬で実る・
実った小麦では減らない。**手触りだけで絵は変わらない**ので `npm run shot` は不要）。
