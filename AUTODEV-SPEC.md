# 仕様: 枯れ木 — 砂漠の砂の上に草むらと同じ形で生え、壊すと棒 1 本（キューの 59・**ID 1 個**）

状態: 済
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（2026-10-01・AUTODEV 152 の B）: **枯れ木は無い**（`src/**` に `DEAD_BUSH` / 「枯れ木」が 0 件。
`dead` は `vitals.ts` の死亡だけ）。**形はまったく同じ前例が 2 つある**: 花 2 種（200・201。58）—— `blocks.ts` 2346 行の `def()` が
赤キノコの写し + `needsSoil: true`、`worldgen.ts` 334〜354 行の生えものの連鎖 `tuft` のいちばん後ろに 1 段、`biomes.ts` の `BiomeDef.flower` に 1 列。
**床を選ぶ旗も既にある**: サボテンの `needsSand: true`（砂の上だけ。砂岩は不可。`supportHint()` が「砂の上」を表から出す）。
**砂漠（`DESERT`）はいま `grass` / `mushroom` / `flower` / `cane` がすべて 0** —— 連鎖のどの段も当たらないので、**実効密度は表の値そのまま**。
**本家の値**: Beta 1.6 から砂漠に生える。**砂の上にだけ置ける**。壊すと棒 0〜2 本（シアーズなら自分）。**ここでは棒 1 本固定**（下の 6.）。

## 1. 何を足すか / 完了の判定

**ブロック 1 つ（= 同じ番号のアイテム 1 つ）・`BiomeDef` に 1 列・生えものの連鎖に 1 段・`DROPS` に 1 行・撮る場面 1 つ。** レシピ 0 本・燃料 0 行。
**完了**: `npm test` に「枯れ木（59）」の件が **8〜14 件**増えて**すべて緑**（**4188 → 4196〜4202 あたり**）。
ブロック ID の枠の行は **「111..255 の空き 53」**（54 → 53）・1..63 の空き 7 のまま。`MAX_ITEM_ID` は **202**。

## 2. 触るファイル / 触らないファイル

**触る**:
- `src/blocks.ts`: `export const DEAD_BUSH = 202;` と JSDoc（花の 2 つの定数の説明を写し、違い —— **砂の上・棒が落ちる** —— を書く）。
  `def()` 1 つは **`DANDELION` の定義の写しで `needsSoil: true` を `needsSand: true` に差し替えたもの**（`opaque: false / solid: false /
  replaceable: true / hardness: 0 / sound: "grass" / model: "cross" / boxes: CROSS_BOX / supportFace: FACE_YN`）。**`variantOf` を書かない**（for がアイテムを作る）。
  **`stacksOnSelf` / `spiky` / `needsSoil` を付けない**（付けるとサボテンになる・どこにも立たない）
- `src/items.ts`: **`MAX_ITEM_ID` を `DEAD_BUSH` に**（いまは `POPPY`）。**`item()` は手で足さないこと**（二重登録）/
  `DROPS` に 1 行: `[DEAD_BUSH, { item: STICK, count: 1, chance: 1 }]`（**`extra` も `otherwise` も書かない**。本棚の行のコメントの形で理由を 2〜3 行）
- `src/biomes.ts`: `BiomeDef` に `readonly deadBush: number;`（JSDoc に「連鎖の**いちばん後ろ**（花の後ろ）・実効密度は `deadBush × (1 − 先のもの)`・
  いまは砂漠だけで、砂漠は先のものが全部 0 なので表どおり」）と、**`BIOMES` の 11 行すべてに `deadBush:` を 1 つずつ**。**砂漠 0.01・ほかは 0**
- `src/worldgen.ts`: `tuft` の連鎖の**花の後ろ（`AIR` の直前）**に 1 段:
  `sprouted && deadBush > 0 && hash2(wx, wz, this.seed ^ 0x2d91) < deadBush ? DEAD_BUSH : AIR` と、309 行の分割代入に `deadBush`。
  **塩 `0x2d91` は新しい値**（B で `grep -rn "0x2d91" src/` が 0 件）。**`tall` は 1 のまま**。335 行あたりのコメント「いまは平原（草むら → 花）と森（…）で重なっている」は
  **砂漠は重ならない**ことを 1 語足すだけでよい
- `tools/shot.ts`: 場面 `deadbush`（**`cactus` の場面の写し** —— 砂漠を探さずに砂の台を敷き、**枯れ木 3 本と比べるサボテン 1 本・草むら 1 本（台の外の草の上）**を並べる。
  手で置くのは「生えた枯れ木の形」を見るためで、時間で変わるものではないので `rules` の「手で積んで撮らない」には当たらない）
- `test/blocks.test.ts` / `test/worldgen.test.ts` / `test/items.test.ts`（下の 5.）
- `ROADMAP.md` の予約表（202 を「実装済み」の 1 行に・**「202..255 予備 54 個」を「203..255 予備 53 個」に**・末尾の「次に取るのは 203」）/
  `TUNING.md`（下の 7.）/ `rules/worldgen.md`（下の 6.）

**触らない**: `src/main.ts` / `src/hands.ts` / `src/crops.ts`（**枯れ木は育たない・広がらない**）/ `src/crafting.ts` / `src/smelting.ts`（**燃料に足さない**）/
`src/mesher.ts` / `src/placing.ts` / `src/mining.ts` / `src/breaking.ts` / `src/craftscreen.ts` / `src/inventoryui.ts` / `test/progression.test.ts`。
**`.claude/**` には 1 行も書かないこと。**

## 3. 使う ID

**1 個: 202 = 枯れ木**（共有帯の次の空き。`ROADMAP.md` の予約表の `202..255` 行から取る）。
**ブロックとアイテムで同じ番号**（花と同じ。for が作る）。**111 以降は 1 本の番号列** —— `items.ts` と `blocks.ts` に 202 が無いことを grep で確かめてから取ること。

## 4. 判断をどのファイルに置くか

- **どこにどれだけ生えるか** → `biomes.ts` の `BiomeDef.deadBush`（**`worldgen.ts` に数値やバイオーム名を書かないこと**。`rules/worldgen.md` の頭）
- **何の上に立てるか** → `blocks.ts` の `needsSand` の表（`supportsBlock()` の 1 行が効く。**`id === DEAD_BUSH` の分岐を書かないこと**）
- **掘ると何が落ちるか** → `items.ts` の `DROPS` の 1 行（棒 1 本）。**`mining.ts` の `canHarvest()` や `breaking.ts` に枝を足さないこと**
- 新しい確かめられないものは無し（`cross` の板は既存のメッシュ化の道をそのまま通る）。**使えるスキル**: `add-block`（ID の取り方・`MAX_ITEM_ID`・一覧に出るまで）
- **引いて読む rules**: `grep -l '"src/blocks.ts"' rules/*.md`・`"src/items.ts"`・`"src/worldgen.ts"`・`"src/biomes.ts"`・`"tools/shot.ts"` の当たり全部と、
  `test/**` を触るので `rules/testing.md`

**色**（B の周に `allItemIds()` 全 160 と総当たりで測った）: **枯れ木 `0x8a6c20`**（いちばん近いステーキ(131) から 30.9・原木(7) 31.1）。
**割った候補**: `0x8f6a3a`（原木と 7.1）/ `0x9a7440`（作業台と 5.4）/ `0x946428`（ステーキと 20.3・際どい）/ `0x6b4a1f`（革の靴と 11.8）。
**十字の板どうし**: 茶キノコ `0xb5835a` と 75.8・草むら `0x5e9c41` と 73。**実装の周で測り直し、割ったらずらして `TUNING.md` に書くこと**（判定はゆるめない）。

## 5. 書くテスト（**値を出力してから判定**）

`test/blocks.test.ts`（花の `flowers()` の後ろに `deadBush()` を足して呼ぶ）:
1. **花の件の写し**（cross・`variantOf` が `AIR` / 同じ番号のアイテムで置くと自分 / 上書きして置ける / `supportFace === FACE_YN`）
2. **砂の上だけ**: `needsSand()` が真・`needsSoil()` が偽 / `supportHint(DEAD_BUSH) === "砂の上"` / `supportsBlock(supporter, FACE_YN, id)` で
   **砂は可、砂岩・草・土・耕地・石は不可**（サボテンの件の真理値表を写す）
3. **掘ると棒 1 本**: `dropOf(DEAD_BUSH)` が `STICK` / `count === 1` / `chance === 1` / `extraDrops()` が空 / `rollDrops()` を roll 0 と 0.999 で回してどちらも棒 1 本
4. **十字の板 6 つ**（いまの 5 つ + 枯れ木）が**どの 2 つも RGB で 60 以上** —— **既存の 5 色の件を意味を保って 6 色に書き換える**（名前の文も直す）
5. **数え直し**: 3600 行の「needsSand が真なのはサボテンだけ」→ **「サボテンと枯れ木だけ」**（`sandNeeders.length === 2 && needsSand(CACTUS) && needsSand(DEAD_BUSH)`）。
   「needsSand と needsSoil の両方が真のブロックは無い」は**そのまま緑**であること

`test/items.test.ts`:
6. **色**: 202 を `allItemIds()` 全部と測って**いちばん近い相手と距離を出してから** `>= 20`（花の件を写す）/ `MAX_ITEM_ID === DEAD_BUSH`（982 行の件を書き換え）

`test/worldgen.test.ts`（花の塊の後ろに `// --- 枯れ木（59）---`）:
7. **まとまった砂漠**（`patchOf(DESERT)`）を 1 マスも飛ばさずに数え、**本数・実効密度**を出す → **1 本以上** /
   **実効密度が `deadBush × (1 − cane)(1 − mushroom)(1 − grass)(1 − flower)` の ±50% 以内**（式の値も出力）
8. **場違いが 0**: 走査した全マスで、枯れ木の真下が砂（`SAND`）でない / `BiomeDef.deadBush === 0` のバイオームに枯れ木がある → どちらも 0 本
9. **既存の生えものが動かない**: 既存の草むら・キノコ・花の件が**数を 1 文字も書き換えずに緑**であること
   （**書き換えたくなったら連鎖の順を間違えている** —— 枯れ木は花の後ろ）

`test/blocks.test.ts` の数え直し（**比べる相手を新しい番号に直すこと** —— 古いまま残すと TS2367。`rules/testing.md`）:
10. `MAX_ITEM_ID === POPPY`（435 行）→ `DEAD_BUSH` / 共有帯の一覧 `sharedItems.length === 80` → **81**・`sharedItems[80] === DEAD_BUSH` と名指しの文 /
    「111..255 の空きは 54」（442 行）→ **53**

**足す前に `test/` を定数名で grep すること**（`MAX_ITEM_ID` / `sharedFree` / `sharedItems` / `BiomeDef` / `flower:` / `needsSand` / `STICK` / `cross` / `DROPS`）。
**`BIOMES` の列を数える件・`DROPS` の行を数える件・`cross` のブロックを数える件・棒の入口を数える件があれば、意味を保って +1 で書き換える**。
上のほかに赤くなったら、**判定を読んでから**「意味を保った書き換え」か「退行」かを決めること。

## 6. このタスク固有の禁じ手

- **連鎖の順を変えない**（サトウキビ → キノコ → 草むら → 花 → **枯れ木**）。先に入れると既存の生えものの位置が動き、公開サイトの世界の地表が差し替わる
- **塩を既存のものと重ねない**（`0x2d91`。実装の前にもう一度 `grep -on "seed ^ 0x" src/*.ts`）
- **`replaceable: true` を外さない**（外すとサボテンや木の葉が弾かれる。花・キノコと同じ理由）
- **シアーズで自分が落ちる道を作らない**（道具で落とし物が変わる仕組みが無い。`dropOf()` は道具を見ない —— 作るならそれだけで 1 周。見送りとして `docs/autodev-log.md` へ 1 行）/
  **棒の本数に幅を持たせない**（本家は 0〜2。平均の 1 本固定。`rules/items-survival.md` の「本家が幅を持つ落とし物は平均の固定個数」）
- **燃料に足さない・広げない・骨粉で増やさない**（どれも別タスク）/ **`crops.ts` を触らない**
- **既存のバイオームの `grass` / `mushroom` / `flower` / `cane` / `trees` の値を変えない** / **砂漠のサボテン（`trees: 0.35`）を減らさない** / **判定をゆるめない**（空きは `===`）
- **古くなる rules を放っておかない**: `rules/worldgen.md` 128〜142 行の連鎖の順と塩の一覧に **枯れ木（202・`deadBush`・塩 `0x2d91`）**を足す。
  `rules/blocks-shapes.md` などに「`needsSand` はサボテンだけ」の類の文があれば直す（`grep -rn "needsSand" rules/`）

## 7. 終了条件

- `npm run typecheck` と `npm test` が緑（**4196〜4202 件あたり**）/ `npm run build` 緑 / **生成を触るので `npm run bench` を 3 回**（中央値を `HANDOFF.md` に）
- **コミット 1 つ**（`AUTODEV 153（C の周）: 59 枯れ木（ID 202）` の形）→ `master` へ push
- `TUNING.md` の末尾の表に 3 行: **枯れ木の色**（測った値・いちばん近い相手・距離）/ **枯れ木の密度**（砂漠 0.01。実測の実効密度。本家の値ではなく暫定）/
  **落とし物は棒 1 本固定・シアーズでも棒**（本家は 0〜2 本・シアーズで自分）
- `ROADMAP.md` の予約表に 202 を「実装済み」/ `AUTODEV-QUEUE.md` の 59 の行を消す / この仕様書を `状態: 済` / `docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す
- **撮ること**（C-3）: `npm run shot -- deadbush terrain`（**terrain の md5 は変わらないはず** —— 原点のまわりは平原。変わったら理由を書く）と
  本物のブラウザ（`node tools/browsershot.mjs` と一覧の 202 枠目の色と名前・console のエラー 0 件）。**撮ったら `Read` で開いて見ること**
- **撮影用の http-server は `npm test` の前に止めること**（151 の周で「要塞のぶんで予算を食い潰さない」が 1 回赤くなった）
