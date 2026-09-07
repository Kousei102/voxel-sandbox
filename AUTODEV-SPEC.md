# 仕様: 金のリンゴ（キューの 22）

状態: 済
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭の 1 件。** この周にコードから数え直しました ——
`grep -rn "GOLDEN_APPLE\|金のリンゴ" src/ test/` は**実装が 0 件**（`items.ts` のコメントに
「別件です」と 2 か所あるだけ）。材料は両方とも実装済み（金インゴット 67 / リンゴ 149）。

## 1. 何を足すか / 完了の判定

**金のリンゴ（アイテム 1 個）とレシピ 1 本。** 金インゴット 8 + リンゴ 1 の 3x3
（本家と同じ形。`["GGG","GAG","GGG"]`）。**食べると空腹 +4 / 満腹度 +9.6 に加えて
体力が 4 戻り、満腹でも食べられます**（本家の値。下の 4 を読むこと）。

`npm test` に**「金のリンゴ」の一群が約 18 件増えて全部緑**（いま 3194 件）。とくに:
**アイテム 114 → 115 種**・`MAX_ITEM_ID` **152 → 153** / **111..255 の空きが 103 → 102** /
**食べられるものが 10 → 11 種** / **レシピ 58 → 59 本** / **立方体 40・非立方体 76 は動かない**
（ブロックは 1 つも増えません）/ `foodOf(GOLDEN_APPLE)` が **4 / 9.6 / 毒なし / 回復 4 /
満腹でも食べられる**。

## 2. 触るファイル / 触らないファイル

**触るのは 6 つ**: `src/items.ts` / `src/vitals.ts` / `src/crafting.ts` /
`src/main.ts`（**既存の 2 行の中の置き換えだけ。行は 1 本も足さない**）/
`test/blocks.test.ts` / `test/vitals.test.ts` / `test/crafting.test.ts`。

**触らないのは**: `src/use.ts`（コメントを直すのは可。**判断は 1 行も足さない** —— 下の 4）/
`src/blocks.ts`（ブロックは増えません）/ `inventoryui.ts` / `craftscreen.ts` / `ui.ts` /
`sfx.ts`（音は既存の `eat` のまま）/ `saves.ts`（`SaveData` は 1 バイトも増えません）。

**`main.ts` はいま 1449 行で、止まる目安に届いています。** この周は **±0 行**です ——
`vitals.canEat` と書いてある 2 か所（`useOrPlace()` の `decideUse(` の行と `updateEating()` の
`eating.advance(` の行）を **`vitals.canEatFood(...)` に書き換えるだけ**で、新しい行も
新しい判断も足しません（`foodOf` は既に import 済み。`useOrPlace()` 側は `foodOf(held)` を渡す）。

## 3. 使う ID

**`GOLDEN_APPLE = 153`。1 個だけ。**`ROADMAP.md` の予約表の「次に取るのは 153」から取ります
（`111..255` はブロックとアイテムで 1 本の番号列なので、**ブロック側も 152 の本棚が最後**）。
**`MAX_ITEM_ID` を `GOLDEN_APPLE` に伸ばすこと** —— 忘れるとクリエイティブの一覧にだけ出ません。
**既存の ID は 1 つも振り直さないこと。**

**色は `0xf0a800`**（実測済み: 既存のどのアイテムからも **56.4** 離れていて、いちばん近いのは
ブレイズロッド。下限は 20）。**金インゴット `0xf2d15c` ともリンゴ `0xe0342c` とも別物です。**

## 4. 判断をどのファイルに置くか

**新しく「確かめられないもの」は 1 つも足しません**（描画も音も DOM も増えない）ので
`unverifiable-pair` は要りません。**使うスキルは `add-block`**（アイテム側だけ）。

- **`items.ts`**: `GOLDEN_APPLE` の定義・`item({...})` 1 行・`FOODS` の 1 行・`MAX_ITEM_ID`。
  **`FoodDef` に省略可の 2 つを足す**: `readonly heal?: number`（食べたときに戻る体力）と
  `readonly alwaysEdible?: boolean`（満腹でも食べられる）。**既存の 10 行は書き換えないこと**
- **`vitals.ts`**: `FoodValue` に**まったく同じ 2 つ**を省略可で足す（**`items.ts` の `FoodDef` と
  構造で合わせてある**のが不変条件。片側だけ足すと `eat()` が読めません）。
  `eat()` の末尾に **`if (food.heal) this.heal(food.heal);`**（`heal()` が `MAX_HEALTH` で
  頭打ちにするので、ここで上限を書かないこと）。さらに**新しいメソッド 1 つ**:

  ```ts
  /** その食べ物を食べられるか。**満腹でも食べられるもの（金のリンゴ）はここで通す。** */
  canEatFood(food: FoodValue | null): boolean {
    if (this.dead) return false;
    if (food?.alwaysEdible) return true;
    return this.canEat;
  }
  ```

  **`canEat` の getter は 1 文字も変えないこと**（満腹の門はそのまま。ここを緩めると
  全部の食べ物が満腹でも食べられます）
- **`crafting.ts`**: レシピ 1 行（`{ name: "金のリンゴ", out: GOLDEN_APPLE, count: 1,
  shape: ["GGG","GAG","GGG"], key: { G: GOLD_INGOT, A: APPLE } }`）
- **`use.ts` と `main.ts` には判断を書かない。** `UseFacts.canEat` の意味が
  「満腹でないか」から**「手に持っているものを食べられるか」**に変わるだけで、
  `decideUse()` の中身（`if (!facts.canEat) return {kind:"flash", ...}`）は**そのまま**です ——
  `alwaysEdible` を `use.ts` で読むと、同じ判断が 2 か所に散ります（コメントは直してよい）

## 5. 書くテスト（**値を出力してから判定する形**。`rules/testing.md`）

- **`test/blocks.test.ts`** に「金のリンゴ（153）」の節を 1 つ。既存のリンゴの節の作法に
  合わせて: `id` / `itemName` / `placedBlock === AIR` / `toolOf === null` / 1 枠 64 個 /
  `foodOf()` の 5 つの値（4 / 9.6 / 毒なし / 回復 4 / 満腹でも食べられる）/
  `MAX_ITEM_ID === GOLDEN_APPLE` / **色が既存のどのアイテムからも 20 以上**
  （いちばん近い色と隔たりを `console.log` してから判定）/ **`111..255` の空きが 102**
- **既存の 2 か所の `allFoodIds().length === 10` を `11` に**（1164 / 1362 行目付近。**ゆるめる
  のではなく数を 1 つ進めるだけ**）。1362 行目付近の文言も「10 種から 11 種になった」に直す
- **`test/vitals.test.ts`**: `eat({hunger:4, saturation:9.6, poison:false, heal:4})` で
  **体力 10 → 14**・**18 から食べても 20 で止まる**・**`heal` の無い食べ物（焼き豚）では
  体力が 1 も動かない**。`canEatFood()` は **満腹 + 普通の食べ物 → false / 満腹 +
  金のリンゴ → true / `null` → `canEat` と同じ / 死んでいたら両方 false** の 4 通り
- **`test/crafting.test.ts`**: 金インゴット 8 + リンゴ 1 で**金のリンゴが 1 個**できること
  （結果を出してから判定）と、**3x3 なので作業台が要る**こと

## 6. このタスク固有の禁じ手

- **`FOODS` の既存 10 行を書き換えない**（`heal` が付くのは金のリンゴだけ）
- **`Vitals.canEat` の getter・`REGEN_*` の値を触らない。** 回復は**その場で 4 だけ**で、
  本家の「再生 II が 5 秒続く」は作りません（持続する効果の器がこのプロジェクトに無い）
- **`main.ts` に行を足さない**（±0 行。増えたら差し戻し）
- **`use.ts` に `alwaysEdible` を読む行を足さない**（判断は `vitals.ts` の 1 か所）
- **エンチャント・経験値・付呪の金のリンゴ（本家のもう 1 種）は持ち込まない**
- **`SaveData.version` は 1 のまま**。既存の ID を振り直さない
- **`blocks.ts` に `def()` を足さない**（置けません。`block: AIR`）

**先に読む決まりごと**（自動では読み込まれません）:
`rules/items-survival.md` / `rules/vitals.md` / `rules/use.md` / `rules/inventory-screen.md` /
`rules/testing.md`（`test/**` を触るため）。

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **すべて緑**（音の一群が赤ければまず 1 回走らせ直す）/
`npm run build` 通る（`src/**` を触るため）/ **コミット 1 つ**で `master` へ push /
**`ROADMAP.md` の予約表に 153 を「実装済み」で 1 行**（2 か所の「次に取るのは 153」も
**154** に直す）/ `AUTODEV-QUEUE.md` の 22 の行を消す / この仕様書の `状態:` を `済` に /
**`TUNING.md` に 1 行**（回復 4 と「満腹でも食べられる」）/ `docs/autodev-log.md` に 1 節 /
`HANDOFF.md` を丸ごと書き直す。

**`npm run bench` も撮るのも要りません**（生成もメッシュ化も触らず、見た目に出るのは
一覧の色 1 つだけ。そこは上の色の判定が見ます）。
