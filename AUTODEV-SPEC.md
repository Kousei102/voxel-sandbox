# 仕様: 粘土ブロックと粘土玉（キューの 32a・**共有帯 2 個**）

状態: 済
差し戻し: 0 回

**キューの 32 を 2 件に割った前半です**（120 行に収まらなかったため。`AUTODEV.md` の B）。
**後半 32b（粘土玉 → 焼いてレンガ → `BRICK`(12)）はこの周では取りません。**

## 1. 何を足すか と 完了の判定

**海底に粘土を湧かせて、掘って粘土玉にします。** 本家と同じで**粘土ブロックはそのままでは
手に入らず**（掘ると粘土玉 4 個）、**2x2 で戻す**と粘土ブロックに戻ります（雪玉と同じ対）。
**完了の判定**: `npm test` に「粘土と粘土玉」の節が増えて、少なくとも次が緑:

- 「粘土（168）は立方体で、**掘ると粘土玉（169）が 4 個**・シャベル・硬さ 0.6」
- 「**粘土玉 4 個（2x2）→ 粘土 1 個**（雪玉と同じ対。作業台が要らない）」
- 「**海底にまだらに湧く**（割合を出してから判定）・**陸には 1 マスも無い**・**海底から 3 マスまで**」
- 「粘土と粘土玉が、既存のどのアイテムとも一覧で見分けられる（RGB 20 以上）」
- **既存の判定を 1 つもゆるめずに緑のまま**（数え直しは下の 5-7）

## 2. 触るファイルと、触らないファイル

| ファイル | 何をするか | 見込み |
| --- | --- | --- |
| `src/blocks.ts` | `CLAY = 168` と `def()` 1 行 | +6 行 |
| `src/biomes.ts` | `FloorPatch` 型と `BiomeDef.floorPatch`（**11 バイオーム全部に書く**） | +28 行 |
| `src/worldgen.ts` | 列ごとに 2 本ハッシュを引いて差し替え（**数値もブロック ID も持たない**） | +12 行 |
| `src/items.ts` | `CLAY_BALL = 169` の `item()` 1 行 ＋ `DROPS` 1 行 ＋ `MAX_ITEM_ID` | +14 行 |
| `src/crafting.ts` | `RECIPES` に 1 行（2x2）＋ import 2 語 | +4 行 |
| `test/blocks.test.ts` / `test/items.test.ts` / `test/crafting.test.ts` / `test/worldgen.test.ts` | 下の 5 | +130 行 |
| `ROADMAP.md` / `TUNING.md` | 予約表に 2 行（**実装済み**・次は 170）/ 手触りの数値（下の 4） | +8 行 |
| **`src/main.ts`** | **1 文字も開かないこと**（1449 行。停止条件 2 に並んでいる） | **0 行** |
| **`src/smelting.ts`**（焼くのは 32b）/ **`src/use.ts` / `src/crops.ts` / `src/drops.ts` / `src/mesher.ts` / `src/placing.ts`**（普通の立方体なので既存の道で置けて掘れます） | **触らない** | **0 行** |

**先に読むこと（自動では読み込まれません）**: `rules/worldgen.md`・`rules/blocks-shapes.md`・
`rules/items-survival.md`・`rules/drops.md`・`rules/testing.md`。使うスキルは **`add-block`**。

## 3. 使う ID

**2 個。共有帯の次の空き 168 から順に取ること**（**低帯 57..63 は階段の予備なので触らない**）:

| ID | 名前 | 何 |
| --- | --- | --- |
| **168** | `CLAY`（"粘土"） | ブロック（立方体）。**`variantOf` が `AIR` なので for がアイテムも作ります** |
| **169** | `CLAY_BALL`（"粘土玉"） | アイテムだけ（`block: AIR`） |

**この周のあと: 111..255 の空きは 88 → 86・次の空きは 170**（32b のレンガがそこを取ります）。
**低帯の空きは 7 のまま。`MAX_ITEM_ID` は `SPRUCE_SAPLING`(165) → `CLAY_BALL`(169)**
（**伸ばし忘れると粘土だけクリエイティブの一覧に出ません**）。

## 4. 判断をどのファイルに置くか

- **どこに湧くかと、どのブロックが湧くかは `biomes.ts`。** `BiomeDef` に
  `readonly floorPatch: FloorPatch | null` を足し、`FloorPatch` は
  `{ block, chance, fill, shift, depth }` の 5 つを持つこと（`block` まで持たせるのが肝心 ——
  **`worldgen.ts` に `CLAY` を import しないこと**。`seaSurface` に `ICE` を書かないのと
  同じ決まりで、`rules/worldgen.md` の頭）。**`?:`（省略可）にしないこと** —— 11 バイオーム
  全部に書き、**粘土を持つのは `OCEAN` と `FROZEN_OCEAN` だけ**（残る 9 つは `null`）。
- **`worldgen.ts` が持つのは塩 2 本と差し替えの 3 行だけ。** 列ごとに
  `hash2(wx >> shift, wz >> shift, seed ^ 0x3d15) < chance` で塊を取り、
  `hash2(wx, wz, seed ^ 0x6e83) < fill` で中を間引いて、`depth < patch.depth` の段を
  `patch.block` にする（**`VEINS` と同じ「塊 → 間引き」の形**）。
  **塩は既存 5 本（`0x7c39` / `0x4d17` / `0x2f8b` / `0x6a55` / `0x5b27`）と重ねないこと。引くのは
  `ly` のループの外**（列に 2 回）—— 中に入れるとチャンク 1 個で 8192 回になります。
- **落ちるものは `items.ts` の `DROPS` に 1 行**（`[CLAY, { item: CLAY_BALL, count: 4, chance: 1 }]`。
  **雪と同じで、この 1 行があると粘土ブロックがそのままでは手に入らなくなる**ので、**2x2 で
  戻すレシピ（`crafting.ts` の 1 行・`["BB","BB"]`・作業台は要らない）が必ず対で要ります**）。
- 新しく「確かめられないもの」は増えません（`unverifiable-pair` は不要）。
  **`TUNING.md` に 1 節**（どれも**このループが決めた見当**）: **`chance` 0.06 / `fill` 0.8 /
  `shift` 2（4x4 の塊）/ `depth` 3**、**色 粘土 `0xa4aab9` / 粘土玉 `0xb0b8cc`**
  （**判定は下の 5-4。近すぎたらずらしてよく、ずらした値を `TUNING.md` に書くこと**）。

## 5. 書くテスト

**値を出してから判定すること**（`rules/testing.md`）。既存の形をそのまま使い、**新しい入口は
1 つも作らないこと**。

1. **ID と帯**（`test/blocks.test.ts`）: 168 / 169 と `itemName()` を**並べて出力してから**判定。
   **空きの数も出す**（低帯 7・共有帯 86）
2. **粘土そのもの**: 立方体（`opaque === true`）・硬さ 0.6・`tool: "shovel"`・
   **`dropOf(CLAY)` が粘土玉 4 個**（`rollDrop` を素手とシャベルの 2 通りで並べて見る）
3. **置けず・道具でも食べ物でもない**（`test/items.test.ts`）: 粘土玉を木炭の節と同じ形で（`placedBlock` / `toolOf` / `foodOf` / `itemStackLimit` を出力してから）
4. **色の隔たり**（`test/items.test.ts`）: 粘土と粘土玉の 2 つとも**いちばん近い相手と隔たりを
   出してから** `>= 20`（骨・木炭の節と同じ形。**灰色の帯には石・石レンガ・鉄・氷が居ます**）
5. **レシピ**（`test/crafting.test.ts`）: 盤面 `["BB","BB"]` を組んで `findCraft()` の**出目と個数を
   出力してから**判定（粘土 1 個）。**2x2 で作れる**ことを見る
6. **湧き方**（`test/worldgen.test.ts`）: `gen.biomeAt()` で**まとまった海**を先に探し、
   **`voxel()` を呼ぶ列は等間隔に間引いて 2000 列まで**（`rules/worldgen.md` の実測。
   **先頭 N 列を取らないこと** —— 1 本の帯に固まります）。出してから判定するのは
   **海底の列のうち粘土の割合（1〜12%）**・**4x4 の枡あたりの粘土のマス数（塊になっているか。
   1.5 以上）**・**陸（平原・浜）に 0 マス**・**海底から 3 マスまで**・**凍った海でも湧く**
7. **数え直し（ゆるめるのではありません。件名に理由を書くこと）**:
   `test/blocks.test.ts` の「111..255 の空きは 88」→ **86**・**立方体 41 → 42**、
   `test/items.test.ts` の `MAX_ITEM_ID === SPRUCE_SAPLING` → **`CLAY_BALL`**・
   **アイテム 129 種 → 131 種**、`test/crafting.test.ts` の「レシピは 68 本」→ **69 本**

## 6. このタスク固有の禁じ手

- **`VEINS` に 1 行も足さないこと。** あの表が効くのは `depth > 3`（石の中）なので、
  **海底の砂の下には 1 マスも出ません** —— 掘り当てられない粘土ができます
- **`worldgen.ts` に `CLAY` を import しない・確率を書かないこと**（上の 4）
- **既存の `BiomeDef` の値を 1 つも触らないこと**（`cane` / `grass` / `mushroom` / `seaSurface` /
  `surface` / `filler`）。**足すのは `floorPatch` の 1 列だけ**
- **`smelting.ts` と `BRICK`(12) に 1 行も書かないこと**（32b の持ち物。名前も変えない）。
  **`FUEL` にも足さない**（粘土は燃料ではありません）。**階段も取らない**（低帯 57..63 は予備）
- **既存 ID を振り直さない・`SaveData.version` は 1 のまま・`main.ts` を開かない**

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **すべて緑**（音の 1 件が跳ねたら走り直す。2 回続けて
赤いときだけ退行）/ `npm run build` 緑 / **`npm run bench` を 3 回まわして中央値を見る**
（**生成を触るので必須**。目に見えて遅くなっていたら塊の引き方を疑うこと）/
コミット 1 つを `master` へ push / **撮って `Read` で開いて見る**（C-3。**クリエイティブ
一覧で 2 つの色**を本物のブラウザで見ること —— **`.label` の文字列で枠を探して
`scrollIntoView({ block: "center" })`**。**海底の粘土は `npm run shot -- terrain` に
写らないかもしれない**ので、写らなければ `tools/shot.ts` に場面 `clay` を 1 つ足して
撮ること）/ `AUTODEV-QUEUE.md` の 32a を消す /
**`ROADMAP.md` の予約表に 2 行**（168 / 169 と「次に取るのは 170」）/ **`TUNING.md` に 1 節** /
このファイルを `状態: 済` にする / `docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す。
