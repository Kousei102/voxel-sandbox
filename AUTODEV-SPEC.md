# 仕様: 溶岩入りバケツを燃料に（1000 秒・空のバケツが燃料枠に残る。キューの 56・**ID 0 個**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（2026-09-30）: `LAVA_BUCKET`(86) は `smelting.ts` の `FUEL`（24 行）に**居ません**
（`test/smelting.test.ts` の 55 の塊が「燃料でない」を `=== 0` で押さえている —— 下の 5. で書き換える）。
**燃やしたあとに何かが残る燃料は 1 つも無く**、`tickFurnace()` は `fuel.count` が 0 になると `clearSlot(state.fuel)` するだけ。
**残りかすの表はもうあります**: `items.ts` の `LEFTOVERS`（`MILK_BUCKET → BUCKET` の 1 行）/ `leftoverOf()`。
聞いているのは `crafting.ts` の `consumeGrid()` だけ。**溶岩入りバケツを使うレシピは 0 本**（`LEFTOVERS` に足してもクラフトは変わらない）。

**本家の値**: 溶岩入りバケツ 20000 ティック = **1000 秒 = 100 個ぶん**。燃え始めた瞬間に**燃料枠に空のバケツが 1 個残る**
（本家は燃料の「クラフトの残りかす」をそのまま使う —— ミルクバケツと同じ仕組み）。

## 1. 何を足すか / 完了の判定

**`FUEL` に 1 行（`[LAVA_BUCKET, SMELT_TIME * 100]`）と、`LEFTOVERS` に 1 行（`[LAVA_BUCKET, BUCKET]`）と、
`tickFurnace()` の燃料をくべる所で `leftoverOf()` に聞く 3〜4 行。** かまどの画面は 1 行も触りません。
**完了**: `npm test` の「精錬の表」に「溶岩入りバケツ（56）」の件が **6〜9 件**増えて**すべて緑**（**4148 → 4154〜4157 あたり**）。
「燃料の表は 24 行」の件は **25 行**に書き換わって緑。ブロック ID の枠の行は**変わらない**（1..63 の空き 7・111..255 の空き 57）。

## 2. 触るファイル / 触らないファイル

**触る**:
- `src/smelting.ts`:
  - `FUEL` に 1 行（`COAL_BLOCK` / `BLAZE_ROD` の行の近く）。コメント 2〜3 行: 本家 1000 秒 = 100 個 / **表の最大が 800 → 1000 に動く** /
    空のバケツが残るのは `LEFTOVERS` に聞く。**古くなるコメントを直す**: `CHARCOAL` の上の「表そのものの最大は石炭ブロックの 800 秒」と、
    `COAL_BLOCK` の上の「これが `Math.max(...FUEL.values())` を 80 → 800 へ動かします」の段（溶岩入りバケツで 1000 へ動いた旨を足す）
  - `tickFurnace()` の燃料をくべる所: **`clearSlot(state.fuel)` の前に `const rest = leftoverOf(item)` を取り、
    `clearSlot()` を通してから `rest !== NO_ITEM` なら `state.fuel.item = rest; state.fuel.count = 1`**
    （`consumeGrid()` と同じ順。**`clearSlot()` を飛ばして `item` を書き換えないこと** —— 傷が乗り移る。`rules/items-survival.md`）
  - import に `leftoverOf` / `NO_ITEM`（**名前の実在と、どのファイルが export しているかを先に grep**）/ `LAVA_BUCKET`
  - `tickFurnace()` の JSDoc の手順 3 に「残りかすがあれば燃料枠に置く」を 1 行
- `src/items.ts` —— **`LEFTOVERS` に 1 行**と、その上のコメントに「かまどの燃料枠も聞く」旨を 1〜2 行。**ほかは触らない**
- `test/smelting.test.ts` / `test/crafting.test.ts`（下の 5.）
- `TUNING.md` —— 末尾の表に 1 行（下の 7.）
- `rules/items-survival.md` / `rules/stateful-blocks.md`（下の 6.）

**触らない**: `src/furnaces.ts` / `src/craftscreen.ts` / `src/inventoryui.ts` / `src/main.ts` / `src/hands.ts` / `src/crafting.ts` /
`src/blocks.ts` / `src/durability.ts` / `src/use.ts` / `test/progression.test.ts` / `ROADMAP.md`。**`.claude/**` には 1 行も書かないこと。**

## 3. 使う ID

**0 個。** 既存の `LAVA_BUCKET`(86) と `BUCKET`(84) を表の鍵・値に使うだけ。予約表は触らない。

## 4. 判断をどのファイルに置くか

- **何秒燃えるか** → `smelting.ts` の `FUEL`（判断の側）
- **何が残るか** → `items.ts` の `LEFTOVERS`（**アイテムの性質**。クラフトでもかまどでも同じ物が残る —— 本家と同じ）。
  **`smelting.ts` に「燃料の残りかす」の表を別に作らないこと**（同じ性質が 2 か所に写る。`rules/items-survival.md` の「`Recipe` にキーを足さない」と同じ理由）
- `craftscreen.ts` に `id === LAVA_BUCKET` や `BUCKET` の分岐を**書かないこと** —— シフトクリックの行き先は `isFuel()`、
  空のバケツが燃料枠に居るときの文言は既存の「この燃料は燃えません」がそのまま出る（**それで良しとする**。本家は何も出ない）
- 新しい確かめられないものは無し。**使えるスキル**: 無し。**引いて読む rules**: `grep -l '"src/smelting.ts"' rules/*.md` /
  `grep -l '"src/items.ts"' rules/*.md` と、`test/**` を触るので `rules/testing.md`

## 5. 書くテスト（**値を出力してから判定**）

`test/smelting.test.ts` の 55 の塊の後ろに `// --- 溶岩入りバケツ（56）---` の塊を 1 つ:

1. **1000 秒 = 100 個**（`fuelTimeOf(LAVA_BUCKET)` を出してから `=== 1000` と `/ SMELT_TIME === 100`）/ `isSmeltable(LAVA_BUCKET) === false`
2. **燃え始めた瞬間に空のバケツが燃料枠に 1 個残る**: `loaded(IRON_ORE, 1, LAVA_BUCKET, 1)` → `tickFurnace(state, 0.1)` 1 回 →
   `state.fuel.item === BUCKET && state.fuel.count === 1 && (state.fuel.damage ?? 0) === 0 && state.burnTotal === 1000`
3. **空のバケツは燃料でないので次はくべない**: 2. の続きで `burnLeft` を 0 にして材料を足し `tickFurnace` → 火が点かない・燃料枠のバケツはそのまま 1 個
4. **ほかの燃料は今までどおり何も残らない**: 石炭 1 個をくべたら燃料枠は空（`isEmpty`）—— 残りかすの道が全燃料に効いていないこと
5. **材料が無ければくべない（空焚きで溶岩が減らない）**: `loaded(NO_ITEM…)` の書き方は既存の「材料が無ければ燃料を食わない」を写す → 燃料枠は `LAVA_BUCKET` のまま
6. **シフトクリックで燃料枠へ**: かまどを開いた `CraftScreen` で持ち物の `LAVA_BUCKET` を `screen.press("inv", i, 0, { shift: true, double: false })`
   （640 行あたりの書き方を写す）→ `state.fuel.item === LAVA_BUCKET`
7. **既存の件を意味を保って書き換える**（**ゆるめではない。仕様書が先に名指しします**）:
   - 「燃料の表は 24 行（55 で 13 行増えた）」→ **「25 行（56 で 1 行増えた）」**（`===` のまま）
   - 55 の塊の `notFuel55` から **`LAVA_BUCKET` を抜き**、件名から「溶岩入りバケツ」を消す（`BUCKET` は残す —— 空のバケツは燃料でない）
   - 「**石炭ブロックがいちばん長持ちする（表の最大）**」→ 溶岩入りバケツ 1000 秒が表の最大を動かすので**割る**（55 と同じ形。`rules/testing.md`）:
     (a) 「表の最大は溶岩入りバケツ（1000 秒）」 (b) 「**溶岩入りバケツを除いた**表の最大は石炭ブロック」
   - `singles`（石炭ブロックを除く）からも **`LAVA_BUCKET` を除く**（1 個ものの最大 = ブレイズロッドの件を保つ）。値を出す `console.log` も合わせる

`test/crafting.test.ts` の「残りかす」の件の近くに 1 件: **`leftoverOf(LAVA_BUCKET) === BUCKET`**（出してから）。
「残りかすを持つアイテムは全部 1 枠 1 個まで」はそのまま緑のはず（溶岩入りバケツは `stack: 1`）—— **判定は触らない**。

**足す前に `test/` を定数名で grep すること**（`FUEL.size` / `LAVA_BUCKET` / `leftoverOf(` / `allLeftoverIds(` / `Math.max(...FUEL`）。
上の 7. のほかに赤くなったら、**判定を読んでから**「意味を保った書き換え」か「退行」かを決めること（143 の周の落とし穴。`rules/items-survival.md`）。

## 6. このタスク固有の禁じ手

- **`FUEL` の既存 24 行の値を書き換えない** / **`SMELTING` に 1 行も足さない**
- **燃料枠に `BUCKET` を置くのに `clearSlot()` を飛ばさない**（傷が乗り移る）/ **`FurnaceState` にキーを足さない・`serializeFurnace()` の 9 要素を増やさない**
- **`LEFTOVERS` の既存の行（ミルクバケツ）を触らない** / **`stack: 1` でないものを載せない**（不変条件）
- **水入りバケツ・ミルクバケツを燃料にしない**（本家でも燃えない）
- **判定をゆるめない**（`FUEL.size` は `===`・最大の件は割って残す）
- **古くなる rules を放っておかない**:
  (a) `rules/items-survival.md` の `EMPTIES` / `LEFTOVERS` の表: 「いつ」「どこへ」「聞くのは」の列に**かまどの燃料枠（`tickFurnace()`）**を足し、
  「いま載っているもの」に溶岩入りバケツ（86）→ バケツ（84）
  (b) `rules/stateful-blocks.md` の 40 行あたりの段: **表の最大は溶岩入りバケツ（1000 秒。56）**・石炭ブロックの件はそれを除いて見る /
  `tickFurnace()` の順番の段に「くべた燃料に残りかすがあれば燃料枠に置く（`leftoverOf()`）」を 1 行

## 7. 終了条件

- `npm run typecheck` と `npm test` が緑（**4154〜4157 件あたり**）/ `npm run build` 緑（`src/**` を触るので）
- **コミット 1 つ**（`AUTODEV 147（C の周）: 56 溶岩入りバケツを燃料に（ID 0 個）` の形）→ `master` へ push
- `TUNING.md` の末尾の表に 1 行: **溶岩入りバケツ 1000 秒 = 100 個（表の最大。本家どおり。燃え始めた瞬間に空のバケツが燃料枠に残る）**
- `AUTODEV-QUEUE.md` の 56 の行を消す / この仕様書を `状態: 済` / `docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す
- **見た目には出ない**（撮らなくてよい。`npm run shot -- terrain` の md5 が前と同一なのを確かめるだけ）
