# 仕様: 骨粉で苗木が木になる（キューの 65・**ID 0 個**）

状態: 済
差し戻し: 0 回

## 0. 数え直した結果（168 の B）

- `crops.ts` の `fertilize()`（324 行）は **`WHEAT_CROP` だけ**。苗木（`SAPLING` 164 / `SPRUCE_SAPLING` 165 / `BIRCH_SAPLING` 198）は
  `growTree()`（602 行）が `SAPLING_GROW_SECONDS`(180) 経つまで待つだけで、骨粉は効かない。
- `use.ts` 165 行は `aim.id === WHEAT_CROP` のときだけ `fertilize` を返す。`hands.ts` 239 行 `fertilizeAt()` は `crops.fertilize()` の真偽だけを見て、
  **true のときだけ骨粉を 1 個減らす**（変えない）。
- 形は `treeshape.ts` の `grownTreeHeight()` / `treeCells()` が持つ。`saplingKind()`（crops.ts 119 行・非公開）が苗木 → `TreeKind`。
- 手本のテスト: `test/crops.test.ts` 1284 行「骨粉で実る」、`test/use.test.ts` 452 行。

## 1. 何を足すか・完了の判定

骨粉を苗木に使うと、**待たずにその場で木に育つ**（オーク・トウヒ・シラカバ）。育てられなかった（上が塞がっている・列が未読み込み）ときは
**骨粉を減らさない**。`npm test` に「骨粉で苗木が育つ」節（下の 5.）が増えて緑、項目数が増える。

## 2. 触るファイル / 触らないファイル

- 触る: `src/crops.ts`（`fertilize()` に苗木の枝・`growTree()` を再利用）、`src/use.ts`（骨粉の分岐の条件を苗木にも広げる）、
  `test/crops.test.ts`、`test/use.test.ts`、`rules/use.md`（骨粉の節があれば「苗木にも効く」へ直す。無ければ触らない）、`rules/items-survival.md`・
  `ROADMAP.md` 203 行の「苗木は見送り」を直す。
- 触らない: **`src/hands.ts`・`src/main.ts`**（`fertilizeAt()` は無改造で足りる）、`treeshape.ts`、`worldgen.ts`、`blocks.ts` の既存定義、`items.ts`、
  `SaveData`（`version` は 1 のまま・新しいキーも足さない）。

## 3. 使う ID

**0 個。** 予約表の変更は 203 行の説明の直しだけ。

## 4. 判断をどのファイルに置くか

- 「育つかどうか」は **`crops.ts` だけ**（`growTree()` の門 1〜3 がそのまま掛かる。**形を写して持たないこと**）。
- `use.ts` は「骨粉を持って、小麦の苗か苗木を狙った」とだけ言う。**育つ可否は決めない。** 苗木かどうかの判定は `saplingKind()` を
  書き写さず、`blocks.ts` に既にある苗木の述語（3074 行付近。無ければ `crops.ts` から `isSapling(id)` を 1 つ export）を引く。
  **`use.ts` が `crops.ts` を import しない形が望ましい**（`blocks.ts` 側に述語を置くなら 1 行）。
- 新しい「確かめられないもの」は無い。`unverifiable-pair` は不要。

## 5. 書くテスト（値を出力してから判定）

`test/crops.test.ts`（`growTree` のテストと同じ偽ワールドを使う）:
1. オーク・トウヒ・シラカバの苗木に `fertilize()` → true、根元が幹（`WOOD` 系）に変わり、`treeCells()` の最下段が一致。値（高さ・書いた数）を `console.log`。
2. 育てた後、苗木の印（`count`）が消える。
3. 上が塞がっている → false・何も書かない・`count` は 1 のまま。**骨粉が減らないことの根拠はこの false。**
4. 4 隅の列の 1 つでも未読み込み → false・`world.writes === 0`。
5. 苗木を植えた直後（age 0）でも、180 秒待った後と**同じ木**になる（`grownTreeHeight` が x,z だけで決まる約束）。
6. 既存の小麦の項目（1284 行以降）は 1 つも変えない。
`test/use.test.ts`: 骨粉 + 3 種の苗木 → `fertilize`（狙ったマスがそのまま渡る）/ 骨粉 + 葉・土・原木 → `fertilize` でない / 器が先（骨粉 + 作業台 → `craft`）は維持。

## 6. このタスク固有の禁じ手

- **`fertilize()` の小麦の分岐を書き換えない**（順序・戻り値・印の消し方は据え置き）。
- **木の形・高さ・葉の範囲を `crops.ts` に書かない**（`treeshape.ts` の関数を引くだけ）。
- **半分だけの木を残さない**（`growTree()` の門 1 を飛ばさない。**失敗時は秒数を持ち越してよいが、骨粉は消費させない**＝戻り値 false）。
- 確率（本家は約 45%）は入れない。**確定で育つ**（`TUNING.md` に 1 行）。
- `main.ts` / `hands.ts` に 1 行も足さない。`test/**` の既存の判定をゆるめない。

## 7. 終了条件

`npm run typecheck` と `npm test` が緑 / コミット 1 つ / `TUNING.md` に「骨粉は苗木を必ず育てる（本家は約 45%）」を 1 行 /
`ROADMAP.md` 203 行を直し、`rules/` へ落とし穴を据える（無ければ「決まりごと 0 件」）。
