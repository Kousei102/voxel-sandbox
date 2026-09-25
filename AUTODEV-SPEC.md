# 仕様: グロウストーンダスト（キューの 47・**ID 1 個 = 189**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（B の周の決まり）: 入っていません。`items.ts` の `DROPS`
（1232 行）に `GLOWSTONE` の行が無く、`dropOf()` の既定（`baseBlock()`）で**グロウストーン(47) そのものが 1 個**
落ちます。`def(GLOWSTONE)`（`blocks.ts` 1880 行）は `tool: "pickaxe"`・**`minTier` 無し**なので素手でも
収穫になります（本家もどの道具でも落ちる）。粉のアイテムも、粉 → ブロックのレシピも 0 本です。

**本家の規則**（Alpha 1.2.0 から）: グロウストーンを壊すと**粉 2〜4 個**（幸運は無い）/
**粉 4 個の 2x2 でグロウストーン 1 個**。粉は置けず・燃料でもなく・食べられない（醸造は見送り済み）。

**個数の範囲は持てません**（`rules/items-survival.md`「`extra` に個数の範囲はまだ持たせないこと」）。
しかも**「2 山目で粉を +1 / +2 する」形は取れません** —— `test/blocks.test.ts` 4103 行
「extra は 1 山目と別のアイテム」が全ブロックで見張っています（**判定はゆるめない**）。
だから **1 山・3 個固定**（本家の 2〜4 の平均）。**戻すのは 4 個**なので、**掘って組み直すと 1 個ずつ目減り
します** —— 本家も平均 3 < 4 で目減りする設計（本棚の「本 3 個だけ」と同じく**本家どおりの目減り**）。

## 1. 何を足すか / 完了の判定

**アイテム 189「グロウストーンダスト」を足し、グロウストーンを壊すと粉が 3 個落ち、粉 4 個の 2x2 で
グロウストーン 1 個に組めるようにする。**
**完了**: `npm test` に**「グロウストーンダスト（47）」の件**（`test/items.test.ts`・`test/blocks.test.ts`・
`test/crafting.test.ts`）が増えて**すべて緑**（**+8〜12 件**）。ブロック ID の枠の行が
**「111..255 の空き 66」**になる（67 → 66）。

## 2. 触るファイル / 触らないファイル

**触る**: `src/items.ts`（定数 `GLOWSTONE_DUST = 189` と説明のコメント・`item({...})` 1 行・`MAX_ITEM_ID` の
付け替え・`DROPS` 1 行・`GLOWSTONE` の import）/ `src/crafting.ts`（レシピ 1 本と import）/
`test/items.test.ts` / `test/blocks.test.ts`（共有帯の一覧・空きの数・落とし物）/ `test/crafting.test.ts` /
`ROADMAP.md`（予約表の 189 に 1 行・「189..255」の行を「190..255・予備 66 個」に・210 行あたりの「使用済み」）/
`TUNING.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` / 当たった `rules/*.md`。

**触らない**: **`src/main.ts`（0 行。落とし物は `breaking.ts` の `harvest()` → `rollDrops()` が既に通す）** /
**`src/blocks.ts`**（`def(GLOWSTONE)` の色・硬さ・`emission`・`minTier` を 1 文字も変えない。**ブロックは
増えません**）/ `src/breaking.ts` / `src/drops.ts` / `src/mining.ts` / `src/smelting.ts`（燃料にしない）/
`src/nethergen.ts`（生成）/ `src/craftscreen.ts` / `src/inventoryui.ts` / `SaveData` / `tools/shot.ts`。

**先に引いて読むこと**: `grep -l '"src/items.ts"' rules/*.md`（**`items-survival.md` の「落とし物を自分以外の
ものに差し替えたら、戻す道を同じ周で」「`MAX_ITEM_ID` を新しい番号へ移すと…TS2367」の 2 つを必ず**）/
`grep -l '"src/crafting.ts"' rules/*.md` / `rules/testing.md`（`test/**` を触るので）/
**`add-block` スキル**（アイテムを足す手順。**ブロックは足さないので `blocks.ts` の節は飛ばす**）。

## 3. 使う ID

**189 を 1 個**（`ROADMAP.md` の予約表「189..255 予備 67 個」の先頭）。**アイテムだけ**で、ブロック 189 は作らない
（111 以降は 1 本の番号列。`test/blocks.test.ts` が両側を突き合わせる）。**次に取るのは 190 になる。**

## 4. 判断をどこに置くか

**判断は全部 `items.ts` と `crafting.ts`。** 新しい「確かめられないもの」は 0 個（`unverifiable-pair` 不要）。

- **`item({ id: GLOWSTONE_DUST, name: "グロウストーンダスト", block: AIR, stack: MAX_STACK, color: 0xfff27a, tool: null })`**
  を `CLAY_BALL` の `item()` の後に（粘土玉・骨・木炭と同じ「置けず・道具でもなく・食べ物でもない」形。
  **`tool:` を持たせないこと**）。**64 個積める**
- **`MAX_ITEM_ID = GLOWSTONE_DUST`**（いまは `COAL_BLOCK`）。**`items.ts` で `COAL_BLOCK` の import が余るなら
  消す**（型で止まる安全な罠。`rules/items-survival.md`）
- **`DROPS` に `[GLOWSTONE, { item: GLOWSTONE_DUST, count: 3, chance: 1 }]`** を `CLAY` の行の後に、
  雪・粘土と同じ形のコメント付きで（「この 1 行でグロウストーンがそのままでは手に入らなくなるので、
  `crafting.ts` の 2x2 が必ず対で要る」＋「3 個固定なのは個数の範囲を持てないから・本家どおり目減りする」）。
  **`extra` も `otherwise` も書かないこと**
- **`crafting.ts`**: `{ name: "グロウストーン", out: GLOWSTONE, count: 1, shape: ["BB", "BB"], key: { B: GLOWSTONE_DUST } }`
  を「粘土」の行の後に。`GLOWSTONE` は `./blocks` から import
- **色 `0xfff27a` は B の周で総当たりで測った値**（`TUNING.md` に 1 行・`items.ts` のコメントに 4 つ書くこと）:
  - **選んだ値** `0xfff27a`（明るいレモン黄。粉が光って見える側へ振った）
  - **いちばん近い相手**: **グロウストーン(47) `0xf6d888` で 30.9**。次が松明(19) `0xffd267` 37.2・金インゴット 46.5
  - **割った候補**: `0xffd966`（**松明と 7.1**）/ `0xe8c050`（**金鉱石と 19.8**）/ `0xd9b45c`（**金鉱石と 18.1**）。
    本家の粉に近い `0xffe87c` はグロウストーンと **21.9** で判定 20 のすぐ上なので採らなかった
  - **帯の総当たりの最大は `0xecfc6e` の 45.1** だが**黄緑に寄る**ので採らない（「材質らしく見える範囲で遠いもの」）
  - **C の周で測り直すこと**（`HANDOFF.md` の「色を総当たりで測る」の入口がそのまま使える）

## 5. 書くテスト（**値を出力してから判定する**）

- **`test/items.test.ts`**（粘土玉の件 432 行あたりの形をそのまま）: 名前・色・置ける/道具/食べ物・1 枠の数を
  1 行に出してから、**置けない・道具でない・食べ物でない・64 個**。**色の隔たり**: 全アイテムでいちばん近い相手と
  隔たりを出してから **`>= 20`**。**`allItemIds()` に 189 が入る**（`MAX_ITEM_ID` の突き合わせは 450 行あたりの
  「比べる相手を新しい番号に」の作法。**古い `=== COAL_BLOCK` を残すと TS2367**）
- **`test/blocks.test.ts`**:
  - 共有帯の一覧（391 行）に **`sharedItems[67] === GLOWSTONE_DUST && MAX_ITEM_ID === GLOWSTONE_DUST`**
    （`COAL_BLOCK` の突き合わせは一覧側だけ残す）。コメントは「**189 は手で足したアイテム**（ブロックは増えない）」
  - **空きの件を「111..255 の空きは 66（グロウストーンダスト 189 で 1 個減った）」に**（数え直し。ゆるめではない）
  - **落とし物**（粘土の 1509 行の件の形）: `rollDrop(GLOWSTONE, 0)` と `rollDrops(GLOWSTONE, 0.99, 0.99)` を
    出してから、**粉 3 個・1 山だけ**・**素手でも `canHarvest` が真**・**ブロック 47 そのものは落ちない**
  - **ブロック 189 は存在しない**（アイテムだけ。`blockDef` / 共有帯のブロック側の一覧に 189 が無い）
- **`test/crafting.test.ts`**（雪・粘土の 209 / 229 行の形）: **粉 4 個の 2x2 → グロウストーン 1 個** /
  **掘って戻す**: 掘った粉 3 個では組めず（`count < 4` を出す）・4 個で 1 個（目減りが本家どおりなのを 1 行出す）/
  **粉 3 個や 1x2 では組めない**

## 6. このタスク固有の禁じ手

- **`test/blocks.test.ts` の「extra は 1 山目と別のアイテム」をゆるめないこと** —— 粉を 2 山に割って 2〜4 個に
  見せる形は取らない / **`rollDrops()` / `Drop` の型に min・max を足さないこと**（乱数をもう 1 本流す話で、
  `breaking.ts` と `main.ts` に及ぶ）/ **`main.ts` に 1 行も書かないこと**
- **ブロック 189 を作らないこと**・**`def(GLOWSTONE)` を触らないこと**・**`nethergen.ts`（ぶら下がる量）を触らないこと**
- **既存の ID を振り直さないこと**・`SaveData.version` は 1 のまま / **色の判定 `>= 20` をゆるめないこと**
- **醸造・レッドストーンの材料としての使い道は足さない**（見送り済み）/ **48 以降に手を出さないこと**

## 7. 終了条件

- `npm run typecheck` / **`npm test`**（すべて緑・**3969 → 3977〜3981 あたり**）/ `npm run build` 緑。
  **`bench` は不要**（生成もメッシュ化も触らない）
- **C-3**: 一覧に 1 枠増える（見た目に出る）。**`node tools/browsershot.mjs` で一覧を撮って `Read` で見ること**
  （**名前が 10 文字で `.slot .label` が折れる**のは既知の人の判断待ち。**58 枠目**として `HANDOFF.md` に書く）。
  **ブロックの絵は変わらない**ので `npm run shot -- terrain` の md5 は前（`f4077e98789fb23ad94f9e3472997aa8`）と同一のはず
- **コミット 1 つを `master` へ push** / キューの 47 を消す / この仕様書を **`状態: 済`** /
  **`ROADMAP.md` の予約表に 189 を「実装済み」** / `TUNING.md` に 1 節（3 個固定・目減り・色）/
  `docs/autodev-log.md` に 1 節 / 踏んだ落とし穴を `rules/` へ / **`HANDOFF.md` を書き直す**
