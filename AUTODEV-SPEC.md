# 仕様: 雪玉（雪ブロックを掘ると出て、右クリックで投げられる）

状態: 未着手
差し戻し: 0 回

**キューの 13 番。数え直し済み**（2026-09-04・コードが根拠）: `src/items.ts` に `SNOWBALL` は
**0 行**（`grep -i snow src/items.ts` が 1 行も出ません）、`DROPS`（`items.ts:623`）に `SNOW` の
行は**無く**（掘ると雪ブロックがそのまま出る）、`PROJECTILE_KINDS`（`projectiles.ts:149`）は
**5 種類**（火球・矢・アイ・ブレス・卵）、`THROWN`（`items.ts:818`）は**卵 1 行だけ**です。

## 1. 何を足すか / 完了の判定

**雪ブロック（`SNOW` = 9）を掘ると雪玉 4 個が出て、右クリックで投げられる。雪玉 4 個を
2x2 に並べると雪ブロック 1 個に戻る**（本家と同じ個数）。**当たっても何も起きません**（卵と同じ）。

完了は `npm test` が**すべて緑**で、次の 4 つが増えていること（値を出してから判定する形）:

- 「雪を掘ると雪玉 4 個」（`test/blocks.test.ts` の「ドロップ」）
- 「雪玉を投げると雪玉が飛ぶ」（`test/blocks.test.ts` の「投げるもの」）
- 「雪玉 4 個で雪ブロック 1 個に戻る」（`test/crafting.test.ts`）
- 「6 種類ある（火球・矢・エンダーアイ・ブレス・卵・雪玉）」（`test/projectiles.test.ts:115` を
  **5 → 6 に直す**。これは数の書き換えであって、判定をゆるめるものではありません）

## 2. 触るファイル / 触らないファイル

**触るのは 3 本 + テスト 3 本 + `ROADMAP.md` だけです。**

| ファイル | 足すもの |
| --- | --- |
| `src/items.ts` | `SNOWBALL` の `export const` と説明 / `item({...})` 1 行 / `MAX_ITEM_ID` の付け替え / `DROPS` に `SNOW` 1 行 / `THROWN` に 1 行 |
| `src/projectiles.ts` | `ProjectileKind` に `"snowball"` / `PROJECTILE_KINDS` に 1 行 |
| `src/crafting.ts` | 戻すレシピ 1 本 |
| `test/blocks.test.ts` | ドロップ 1 件 / `throwable` に雪玉 1 行 / `MAX_ITEM_ID === STRING`（177 行）を `SNOWBALL` に |
| `test/crafting.test.ts` | 戻すレシピ 1 件 |
| `test/projectiles.test.ts` | 種類の数 5 → 6 / 色の突き合わせ 1 件 |
| `ROADMAP.md` | 予約表に 134 の行（「実装済み」まで書く） |

**触らないファイル**: `src/use.ts`（`thrownProjectile()` を通るので**1 行も要りません**。
`held === SNOWBALL` と書いたら差し戻し）/ `src/blocks.ts` / `src/mobs.ts` / `src/smelting.ts` /
`src/projectilerender.ts` / `src/ui.ts` / `src/inventoryui.ts` / `src/placing.ts`。

**`src/main.ts` は 1464 行**（止まる目安 1450 を越えたまま）。**判断を 1 行も書かないこと。**
唯一許すのは `throwItem()`（895 行）の見出しコメントの「（卵）」を「（卵・雪玉）」にする
**1 語だけ**で、**`git diff --stat` の `main.ts` が 1 行を超えたら差し戻し**です。
**`throwItem()` は `damage` を渡さないまま**にすること（既定の 0 = 当たっても減らない）。

## 3. 使う ID

**`SNOWBALL = 134` を 1 個だけ**（`ROADMAP.md` の予約表「134..255 予備 122 個」の先頭。
`MAX_ITEM_ID` は 133 = 糸 なので、次の空きは 134 です）。**ほかの番号を取らないこと。**
**既存の ID を 1 つも振り直さないこと**（`SNOW` は 9 のまま）。
`MAX_ITEM_ID` を `STRING` から `SNOWBALL` に付け替えます（`test/blocks.test.ts:177` も同じ）。

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも足しません**（`unverifiable-pair` は要りません）。
`projectilerender.ts` は表を貼るだけなので、**種類が増えても 0 行**です。

- **何を投げると何が飛ぶか** → `items.ts` の `THROWN`（表 1 本。`rules/projectiles.md`）
- **どう飛ぶか（速さ・重力・寿命・色・大きさ）** → `projectiles.ts` の `PROJECTILE_KINDS` 1 行
- **何が何個落ちるか** → `items.ts` の `DROPS` 1 行
- **戻す形と個数** → `crafting.ts` 1 行

**数値は本家の値をそのまま入れること**（`TUNING.md` に 1 行足して止まらずに進む）:

- 積める数 **16**（本家。卵・バケツと同じで `MAX_STACK` を使わない）
- 飛び方は**卵と同じ**（`gravityScale: 1` / `drag: 0` / `speed: 20` / `life: 30` /
  `half: 0.125` / `onBlock: "vanish"` / `glows: false` / `aims: false`）。本家の雪玉と卵は
  同じ速さ（1.5 ブロック/tick）です
- 色は **`0xbcd8ef`**（**卵 `0xf7f0e0`・羽根 `0xe8e4dc`・糸から離した青白**。一覧で
  白っぽいものが 4 つ並ぶので、青みで見分けます）。**`PROJECTILE_KINDS` の色も同じ値**に
  すること（`test/projectiles.test.ts` が突き合わせます）
- **ダメージは 0**（本家の雪玉もブレイズ以外には効きません。表に書かず、渡さないこと）

## 5. 書くテスト

**どれも値を `console.log` で出してから判定すること**（`rules/testing.md`）。

- `test/blocks.test.ts`「ドロップ」に: `rollDrop(SNOW, 0.5)` を出して
  **`item === SNOWBALL && count === 4`**。**`otherwise` は要りません**（確率 1 なので）
- `test/blocks.test.ts`「投げるもの」の `throwable` に `["雪玉", SNOWBALL]` を足し、
  **`thrownProjectile(SNOWBALL) === "snowball"`**。「それ以外は投げられない（null）」の
  除外を **`id !== EGG` → `id !== EGG && id !== SNOWBALL`** に直すこと
- `test/crafting.test.ts` に: 2x2 に雪玉 4 個を並べた結果を出して **雪ブロック 1 個**。
  **3 個や斜めでは出来ないこと**も 1 件
- `test/projectiles.test.ts`: 数を 6 にし、**`projectileDef("snowball").color === itemColor(SNOWBALL)`**

## 6. このタスク固有の禁じ手

- **`DROPS` の既存の行を 1 つも書き換えないこと**（触るのは `SNOW` の新しい 1 行だけ）
- **雪玉を `FOODS` にも `SMELTING` にも入れないこと**（食べ物でも焼けるものでもありません）
- **`tool:` を持たせないこと**（`ToolKind` が増えると `mobs.ts` の `TOOL_ATTACK` に無い
  種類が入って **NaN** が黙って通ります。種・シアーズと同じ罠）
- **`block:` は `AIR`**（雪玉を置けるようにしないこと。置けると戻すレシピが要らなくなります）
- **`use.ts` と `main.ts` に `SNOWBALL` の名前を出さないこと**（2 のとおり）
- **戻すレシピを忘れないこと** —— 落とし物を差し替えるので、**これが無いと雪が置けなくなります**
- **既存のテストの判定をゆるめないこと**（直してよいのは数の 5 → 6 と `MAX_ITEM_ID` の
  付け替え、`throwable` の除外条件の 3 か所だけ）

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **すべて緑** / `npm run build` 緑（`src/**` を触るため）/
**コミット 1 つ** / `AUTODEV-QUEUE.md` の 13 番の行を消す / この仕様書を `状態: 済` に /
`ROADMAP.md` の 134 を「実装済み」に / `docs/autodev-log.md` に 1 節 /
**`TUNING.md` に 1 行**（雪玉の積み数 16・色 `0xbcd8ef`・飛び方は卵と同じ）/
`HANDOFF.md` を丸ごと書き直す / **`master` へ push**。

**見た目に出ます**（投げた雪玉が飛ぶ・一覧に青白いアイテムが並ぶ）。**`npm run shot` か
`node tools/browsershot.mjs` で撮って `Read` で見ること**（`AUTODEV.md` の C-3）。

使えるスキル: **`add-block`**（アイテムを 1 個足す手順）。
読む決まりごと: **`rules/items-survival.md` / `rules/projectiles.md` / `rules/testing.md`**
（`src/use.ts` は触らないので `rules/use.md` は読むだけでよい）。
