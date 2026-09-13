# 仕様: 木炭（キューの 29・アイテム ID 1 個 = 163）

状態: 未着手
差し戻し: 0 回

**使えるスキル: `add-block`**（アイテムを 1 つ足す手順）。
**`unverifiable-pair` は要りません** —— 描画も音も DOM も 1 行も足しません。

## 0. 取る前に数え直した結果（B の周・2026-09-13）

- **`CHARCOAL` も「木炭」も `src/**` `test/**` に 1 件もありません**（未実装）
- `smelting.ts` の `SMELTING` は **7 行**（鉄・金・砂・丸石・生豚肉・生鶏肉・生牛肉）で、
  **原木を焼く行はありません**。`FUEL` は **8 行**（石炭 80 秒 / 原木・トウヒ・板・
  板の階段・作業台 15 秒 / 板のハーフ 7.5 秒 / 棒 5 秒）
- 松明のレシピは `crafting.ts` の **1 本だけ**（`shape: ["C","S"]` / `C: COAL`）
- `MAX_ITEM_ID = BONE`（162）。**共有帯の次の空きは 163**（`ROADMAP.md` の予約表）

## 1. 何を足すか（1 行）と、完了の判定

**原木・トウヒの原木をかまどで焼くと「木炭」になり、石炭と同じ 8 個ぶん燃え、
松明も作れる。**

完了の判定 —— `npm test` に次の項目が増えて**すべて緑**:

- 「原木 → 木炭」「トウヒの原木 → 木炭」（`test/smelting.test.ts`）
- 「木炭 1 個で 8 個焼ける（石炭と同じ 80 秒）」（同上）
- 「原木は燃料でもあり、焼けるものでもある」（同上。**両方の表に居る初めての行**）
- 「松明は木炭でも作れる」「松明は石炭でも今までどおり作れる」（`test/crafting.test.ts`）
- 「木炭は置けず・道具でもなく・食べ物でもない（1 枠 64 個）」（`test/items.test.ts`）
- 「木炭は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）」（同上）

## 2. 触るファイルと、触らないファイル

**触る（5 + 3）**:

| ファイル | 足すもの |
| --- | --- |
| `src/items.ts` | `CHARCOAL = 163` / `item({...})` 1 行 / `MAX_ITEM_ID` を `CHARCOAL` へ |
| `src/smelting.ts` | `SMELTING` に 2 行（`WOOD` / `SPRUCE_WOOD`）・`FUEL` に 1 行 |
| `src/crafting.ts` | 松明のレシピを材料違いでもう 1 本（**板が 2 行あるのと同じ形**） |
| `test/smelting.test.ts` | 上の 3 項目 + `FUEL.size` の数え直し |
| `test/items.test.ts` | 木炭の 2 項目（色は**いちばん近い相手を出してから**判定） |
| `test/crafting.test.ts` | 松明 2 項目 + `RECIPES.length` の数え直し |
| `test/blocks.test.ts` | 共有帯の一覧に 163 を 1 つ + 空きの数え直し |
| `ROADMAP.md` / `AUTODEV-QUEUE.md` / `TUNING.md` / `docs/autodev-log.md` / `HANDOFF.md` | C-4 の記録 |

**触らない**: `src/main.ts`（**±0 行。1 文字も開かないこと** —— いま 1450 行で停止条件に
並んでいます）/ `inventoryui.ts` / `craftscreen.ts` / `ui.ts` / `style.css` /
`blocks.ts` / `storage.ts` / `session.ts` / `furnaces.ts` / `mobs.ts` / `worldgen.ts`。
**`SaveData` は 1 バイトも増えません**（アイテム ID が 1 つ増えるだけ）。

## 3. 使う ID

**アイテム 163（木炭）の 1 個だけ**。`ROADMAP.md` の予約表の「次に取るのは 163」から取り、
**実装後にその行を「163 = 木炭・実装済み」へ直すこと**。**それ以外の番号を取らないこと**
（木炭ブロック・石炭ブロックは足しません）。**共有帯の空きは 93 → 92** になります。

## 4. 判断をどのファイルに置くか

**3 つとも既にある表の行を伸ばすだけ**で、新しい判断のファイルは作りません。

- **何が何になるか** → `smelting.ts` の `SMELTING`（`furnaces.ts` にも `craftscreen.ts` にも
  「原木なら」と書かないこと）
- **何が何秒燃えるか** → `smelting.ts` の `FUEL`
- **木炭が何か**（色・置けない・道具でない・食べ物でない・1 枠 64） → `items.ts` の `item()` 1 行
- **松明の材料** → `crafting.ts` の `RECIPES` 1 行。**`Recipe` に列を足さないこと**
  （`rules/inventory-screen.md`。材料違いは「もう 1 本」で表す）

**先に読むこと**: `rules/items-survival.md` / `rules/inventory-screen.md` /
`rules/stateful-blocks.md` / `rules/vitals.md` / `rules/testing.md`。

## 5. 書くテスト（値を出してから判定する形）

- `console.log` で**木炭の色といちばん近い相手の隔たり**を出してから `>= 20` を判定する
  （骨 162 と同じ形。`test/items.test.ts` の `boneBest` の節をそのまま真似ること）。
  **炭色は暗い帯**なので、**石炭 `0x23262b` と黒曜石・石・丸石からの隔たりを必ず出す**こと
- 燃料は**秒ではなく「何個焼けるか」も出す**（`fuelTimeOf(CHARCOAL) / SMELT_TIME === 8`）
- 松明は `findRecipe()` に **2x2 の盤面**（木炭の下に棒）を渡して `out === TORCH` /
  `count === 4` を見る。**石炭の盤面も同じ形で残す**（片方だけ緑にしない）
- **数え直す判定 3 件**（**ゆるめるのではなく、数字を新しい値に直すこと**）:
  `test/smelting.test.ts` の `FUEL.size === 8` → **9**（見出しも「木炭で 1 行増えた」へ）/
  `test/crafting.test.ts` の `RECIPES.length === 65` → **66** /
  `test/blocks.test.ts` の `sharedFree === 93` → **92** と `MAX_ITEM_ID === BONE` → `CHARCOAL`
  （**比べる相手を新しい番号に直さないと `tsc` が TS2367 で落ちます**）
- **`石炭がいちばん長持ちする` は直さなくて緑のまま**です（木炭も 80 秒で、
  `Math.max(...FUEL.values())` は 80 のまま）。**この行を書き換えないこと**

## 6. このタスク固有の禁じ手

- **石炭（65）の色・ID・燃える秒数を書き換えないこと。** 木炭は**別の番号**で、
  石炭と同じ枠に積めません（本家と同じ）
- **既存の `SMELTING` 7 行と `FUEL` 8 行を 1 行も書き換えないこと**（足すだけ）
- **`DROPS` を 1 行も触らないこと** —— 原木は今までどおり自分が 1 個落ちます
- **判定をゆるめて緑にしないこと。** `FUEL.size` を `>= 8` にする・消す、は禁じ手です
  （**数え直すのは可**。5 のとおり）
- **木炭を燃料以外の材料にしないこと**（本家に無い「木炭 → 石炭」も足さない）
- **`main.ts` を開かないこと。** 配線は 0 行の見込みで、1 行でも要るなら**止まって人を呼ぶ**
- **見た目に出るのは一覧の色 1 つだけ**です。**それでも `npm run shot` か
  `tools/browsershot.mjs` で撮ること**（C-3）。一覧を撮るなら
  **`#mode` でクリエイティブ → `E` → 末尾までスクロール**（`docs/browser-shots/README.md`）

## 7. 終了条件

- `npm run typecheck` 緑 / `npm test` **すべて緑**（いま 3497 件 + 上の項目）
- `npm run build` 緑（`src/**` を触るので走らせること）。**`npm run bench` は不要**
  （生成もメッシュ化も 1 行も触りません）
- **コミット 1 つ**を `master` へ push
- **木炭の色を決めたら `TUNING.md` に 1 行**（何色にして、いちばん近い相手から幾つ離れたか）
- `AUTODEV-QUEUE.md` の 29 の行を消し、この仕様書の `状態:` を `済` にする
- `ROADMAP.md` の予約表に「163 = 木炭・実装済み」と、`docs/autodev-log.md` に 1 節
