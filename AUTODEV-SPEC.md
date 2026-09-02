# 仕様: 1 回の採掘で 2 山落ちる器（収穫で種も戻る）

状態: 済
差し戻し: 0 回

**キューの 14 番。** **数え直し済み**（2026-09-02・コードが根拠）: `Drop` は
`{ item, count, chance, otherwise? }` の**1 山ぶんだけ**で、`extra` も `rollDrops` も
`src/**` にも `test/**` にも 1 件もありません。`harvest()`（`breaking.ts:176`）の戻りは
`Burst | null` の**1 山**で、`rollDrop()` を呼ぶのは `breaking.ts` の**この 1 か所だけ**です
（実装前: **2783 件緑** / `main.ts` **1450 行**（`npm test` の数え方。`wc -l` の 1449 ではない）/ 空き 131）。

## 1. 何を足すか / 完了の判定

**1 つのブロックから 2 山落とせるようにして、実った小麦から小麦 1 個と種 1 個を返す。**
これで**畑が自転します**（いまは植えるたびに種を食いつぶす。`TUNING.md`）。
完了の判定 —— **`npm test` に次が増えて全部緑**（いま 2783 件。**減らさないこと**）:

- 「実った小麦を掘ると **2 山**（小麦 1 + 種 1）」を**掘る経路（`tryBreak`）と支えを失う経路
  （`autoBreak`）の両方**で。「クリエイティブでは 0 山」も両方で
- 「`rollDrops()` の山数: 石 1 / ガラス 0 / 葉（外れ）0 / 砂利（外れ）1 / 実った小麦 2」
  （**数を出力してから判定すること**）
- 「`rollDrop()` の戻りは今までどおり 1 山目だけ」（**既存の約 25 か所の根拠を変えない**）
- 「`extra` を持つ行は 1 山目と**別のアイテム**」「どのブロックでも山は 2 つまで」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `items.ts` | `DropStack` 型 / `Drop.extra?` / `rollDrops()` / `DROPS` の**実った小麦の 1 行だけ** |
| `breaking.ts` | `harvest()` の戻りを `Burst[]` に。`tryBreak` / `autoBreak` の受け方 |
| `test/mining.test.ts` | `rollDrops()` の山数（既存の `rollDrop()` の節の隣） |
| `test/blocks.test.ts` | 小麦の節に「種も戻る」/ `test/breaking.test.ts` に 2 経路ぶん |
| `TUNING.md` / `ROADMAP.md` / `docs/autodev-log.md` | 下の 8 |

**1 行も書かないこと**: **`main.ts`（1450 行 = 停止条件ちょうど。この周は 0 行）** /
`drops.ts` / `droprender.ts`（見た目も物理も変えません。2 山は `burst()` が勝手に散らします）/
`blocks.ts` / `crops.ts` / `placing.ts` / `crafting.ts`（**パンは 15 番**）/ `vitals.ts` /
`storage.ts` / `session.ts` / `dimensions.ts`（**セーブは 1 バイトも増えません**）/
`mining.ts` / `durability.ts` / `mobs.ts` / `world.ts` / `ui.ts` / `inventoryui.ts` / `.claude/**`。

## 3. 使う ID

**0 個。** 既存の ID（実った小麦 123 / 小麦 124 / 種 122）の組み合わせだけで足ります。
**`ROADMAP.md` の予約表から番号を取らないこと**（取ったら間違いの合図）。
`MAX_ITEM_ID` も `SaveData.version`（1）も動きません。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| 何が何山落ちるか（表そのもの） | `items.ts` の `DROPS`（**`extra` は表の 1 列**） |
| 山を組み立てる（外れ・0 個を捨てる） | `items.ts` の `rollDrops()`（**純粋。乱数は受け取るだけ**） |
| どこへ落ちるか（座標と跳ね上がり） | `breaking.ts` の `harvest()` |
| 地面での散らばり | `drops.ts` の `burst()`（**既にある。触らない**） |

**新しい「確かめられないもの」は 0** なので `unverifiable-pair` は不要。ブロックもアイテムも
増えないので `add-block` も当たりません（**使うスキルはありません**）。

## 5. 実装の要点（この順で）

1. `items.ts` に **`export interface DropStack { readonly item: number; readonly count: number; }`**。
   `Drop` に **`readonly extra?: DropStack;`** を 1 行（**`chance` も個数の範囲も持たせない**。
   下の 7-1）。既存の 4 つのキーは 1 文字も変えないこと
2. `DROPS` の **`WHEAT_CROP_RIPE` の行にだけ** `extra: { item: WHEAT_SEEDS, count: 1 }` を足す。
   **他の行は触らない**（`extra` を書かなければ今までどおり 1 山）
3. `items.ts` に **`rollDrops(blockId: number, roll: number): readonly DropStack[]`**:
   - **1 山目は `rollDrop(blockId, roll)` を呼んで作ること**（`chance` / `otherwise` の判断を
     写さない。**写した瞬間に「掘ったときと床を抜かれたときで落ちるものが違う」が戻ります**）
   - `item === NO_ITEM` か `count <= 0` の山は**入れない**（ガラス・葉の外れが 0 山になる）
   - **`extra` は 1 山目の当たり外れに関係なく必ず入れる**（別の山なので。**いま両方を持つ
     ブロックは無い**が、この決めをコメントに残すこと）
   - **`rollDrop()` はそのまま残すこと**（名前・引数・戻り値とも。既存のテストの根拠）
4. `breaking.ts`: `harvest()` の戻りを **`Burst[]`**（`rollDrops()` を `for` で回して同じ
   `x + 0.5 / y + dy / z + 0.5` を貼るだけ）。`tryBreak()` は
   `drops.push(...harvest(id, order.roll, x, y, z, 0.35))`、`autoBreak()` は
   `return harvest(id, roll, x, y, z, 0.25)`。**`import` を `rollDrop` → `rollDrops` に差し替える**
5. **`main.ts` は 0 行**（`for (const out of result.drops)` も `onAutoBreak` の `for` も
   もう山の数を知らないので、そのまま 2 山流れます）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/mining.test.ts`（`rollDrop()` の節の隣に）: **山数の一覧を 1 行出力**してから
  石 1 / ガラス 0 / 葉（0.5）0 / 砂利（0.5）1 / 砂利（0.05）1 / 実った小麦 2 を判定。
  **`rollDrop(GRAVEL, 0.5).item === GRAVEL` などの既存の判定は 1 つも消さないこと**
- `test/blocks.test.ts`（小麦の節）: 実った小麦の 2 山が **小麦 124 と種 122**（`itemName()` で
  出力してから）/ **`rollDrop(WHEAT_CROP_RIPE, 0.5)` は今までどおり小麦 1 個だけ** /
  **苗（`WHEAT_CROP`）は 1 山のまま**（種 1 個。実る前に刈っても得しない）
- 不変条件（`test/blocks.test.ts`）: `DROPS` を全部回して **`extra.item !== 1 山目の item`** と
  **`rollDrops()` の長さが 2 以下**（表が増えたとき勝手に 3 山になっていないこと）
- `test/breaking.test.ts`: `tryBreak(実った小麦)` の `drops` が **2 山**（中身と個数も）/
  **耕地を掘って `autoBreak(実った小麦)` でも 2 山**（`rules/items-survival.md` の
  「2 つの経路を別々に書かない」）/ **クリエイティブは両方 0 山** /
  **`backInMain` の並びに `"rollDrops("` を足す**（`main.ts` に戻っていないことの見張り）

## 7. このタスク固有の禁じ手

1. **`extra` に `chance` や個数の範囲（min / max）を持たせないこと。** 乱数は
   `roll` 1 個しか流れていないので、付けると**1 山目と必ず相関します**（砂利の当たり外れと
   種の個数が連動する）。本家の「種 0〜3」に寄せたくなったら、**乱数をもう 1 本
   流す話を先に**すること（`BreakOrder` と `autoBreak()` の引数と `main.ts` に及びます）
2. **`main.ts` を 1 行も触らないこと**（**1450 行 = 停止条件ちょうど**。1 行でも足すと止まります）
3. **`rollDrop()` を消す・名前を変える・戻り値を配列にすること**（既存の約 25 か所が根拠）。
   **`breaking.ts` から `rollDrop(` を呼ばないこと**（`rollDrops(` だけ）
4. **`Burst` / `BreakOutcome` / `BreakOrder` の形を変えないこと**（`damage` の素通しも同じ）
5. **`drops.ts` に「2 山を並べて置く」を書かないこと**（`burst()` の乱数で散ります）
6. **`DROPS` の既存の行・`otherwise` の意味を書き換えないこと**（砂利と草むらが壊れます）
7. **パン・小麦を食べ物にする話を持ち込まないこと**（15 番）。**ID を取らない・
   `SaveData` を触らない・判定をゆるめないこと**

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2783 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` の**「収穫しても種が戻らない」の行を書き換える**
（種 1 個固定にした。**本家は 0〜3 なので平均では本家より渋い**）/ `ROADMAP.md` の
124 の行に「**種も 1 個戻る**」を追記（**番号は取らない**）/ **C-3: `npm run build` のあと
`npm run shot -- crops` を撮り直し、`Read` で開いて苗と実りの見た目が変わっていないことを
見る**（山が 1 → 2 に増えるだけで描画は触らないため、これで足ります）/
`AUTODEV-QUEUE.md` の 14 番の行を消す / この仕様書を `済` に / `HANDOFF.md` を丸ごと書き直す。
