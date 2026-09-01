# 仕様: 大きいチェスト（隣り合った 2 個で 54 枠）

状態: 未着手
差し戻し: 0 回

`AUTODEV-QUEUE.md` の 2 番。**C の周はこの 1 枚を全文サブエージェントに渡すこと**
（要約すると 2 と 6 が真っ先に落ちます）。**`src/**` と `test/**` は `Read` / `Edit` で開くこと**
（`cat` / `sed` だと `.claude/rules/*.md` が読み込まれません）。
使うスキル: **`add-stateful-block`**（器の型）。読むもの: **`.claude/rules/stateful-blocks.md`**（チェストの節）と
**`.claude/rules/beds.md`**（**1 個のブロックが 2 マスにまたがる先例**）と `.claude/rules/inventory-screen.md`。

**2026-09-01 にコードで数え直しました**（B の決まり）: `chests.ts` の `CHEST_SIZE` は 27 固定、
`addToChest` は `0..CHEST_SIZE` 決め打ち、`src/` に隣り合ったチェストを見る経路はありません
（`chestKey` は 1 マス 1 台）。**まだ入っていません。**

## 1. 何を足すか / 完了の判定

**横に隣り合った 2 個のチェストを、1 つの 54 枠として開ける。**

判定: `npm test` に **「大きいチェスト（隣り合った 2 個で 54 枠）」** の節が増えて、全部緑
（**いま 2307 件**。増えた件数がそのまま乗ること）。最低限これらを**値を出してから**判定する:

- 隣り合った 2 個を開くと枠が 54（`craft.chestSize` を出す）。1 個だけなら 27
- **どちらの半分を開いても中身の並びが同じ**（両方に印を入れて、開く側を変えて並びを比べる）
- **相方の相方は自分**（4 向きとも。`beds.ts` の不変条件と同じ）
- **3 個を横一列に並べると 3 つとも 27 枠に戻る**（中身は 1 個も消えない）。2x2 の 4 個も全部 27
- 縦に積んだ 2 個（y ± 1）と斜めは組にならない
- 54 枠ぶん入れられる（`addToChest` が 54 枠使い切ってから余りを返す）
- **片方を壊すと、そのマスのぶんだけ落ちる**。残った側は 27 枠のチェストとして中身を保つ
- セーブは **1 マスにつき 54 要素のまま 2 キー**（54 枠を 1 キーにまとめない）

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/chests.ts` | **判断は全部ここ。** 相方を決める規則・54 枠の見え方・`addToChest` の枠数 |
| `src/craftscreen.ts` | `chestSize` を出す・`LARGE_CHEST_SIZE` の再輸出だけ（**規則を書かない**） |
| `src/inventoryui.ts` | **DOM だけ。** 枠を 54 個作り、`craft.chestSize` を超えたぶんに `hidden` を付ける |
| `src/main.ts` | **`openChest()` の 1 行だけ**（`chests.at(...)` → `chests.open(world, ...)`） |
| `test/chests.test.ts` | 節を 1 つ足す（`test/run.ts` は登録済み） |

**触らないもの**（1 行も）:

- **`blocks.ts`** —— **新しいブロック ID を作りません**（本家も同じ 1 個の ID です）
- **`breaking.ts` / `placing.ts` / `use.ts` / `world.ts` / `storage.ts` / `session.ts` / `dimensions.ts`**
  —— 壊す・置く・右クリックの振り分け・セーブの形は**そのまま効きます**
- **`index.html` / `style.css`** —— 枠は `build()` が作るので追加の id は要りません
- `inventory.ts` / `items.ts` / `crafting.ts` / `smelting.ts` / `furnaces.ts` / `beds.ts`

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（`AUTODEV-QUEUE.md` の 2 番のとおり）。
**番号を取りたくなったら設計を間違えた合図**なので、止めて人を呼ぶこと（`AUTODEV.md` の停止条件 1）。
**「大きいチェスト」というブロックを作らないこと** —— 組かどうかは**そのつど voxel から決めます。**

## 4. 判断をどこに置くか

**`beds.ts` の `bedPartner()` と `gravity.ts` の作法をそのまま写します**（`CLAUDE.md` の対の表）。

| 層 | 置き場 |
| --- | --- |
| 相方を決める規則 | `chests.ts` の `chestPartner(getVoxel, x, y, z)` —— **`World` を丸ごと受け取らず `getVoxel` 1 つだけ**受ける |
| 54 枠の見え方 | `chests.ts` の `Chests.open(getVoxel, x, y, z): ChestState` |
| 枠数を画面に伝える | `craftscreen.ts` の `get chestSize()`（= `chestState?.slots.length ?? 0`） |
| 見た目 | `inventoryui.ts`（**数を決めない。`craft.chestSize` を貼るだけ**） |

**相方の規則（ここが仕様の中心）**: 水平 4 マス（±X / ±Z・同じ y）のうち `CHEST` は
**ちょうど 1 個**で、**その相手から見ても `CHEST` がちょうど 1 個**のときだけ組になる。
どちらでもなければ `null`。**これで「相方の相方は自分」が必ず成り立ち**、3 個並びや 2x2 でも
半端な組ができません（`beds.ts` が守っている不変条件と同じもの）。

**54 枠は「参照を並べた見え方」であって、新しい入れ物ではありません。**
`Chests.open()` は `{ slots: [...根の 27 枠, ...相方の 27 枠] }` を**そのつど作って**返します
（**`Slot` をコピーしないこと** —— `craftscreen.ts` の `activeGrid()` と同じ理由で、
コピーすると入れたものが消えます）。**根は x が小さいほう、同じなら z が小さいほう**
（決めないと、開く側によって並びが変わります）。**この見え方を `Chests` の Map に入れないこと**
—— セーブは今までどおり Map の中の 27 枠だけを見ます。

**確かめられないもの（three / DOM / GLSL / 音）は 1 つも増えません** → `unverifiable-pair` は不要。

## 5. 書くテスト

`test/chests.test.ts` に節を 1 つ。**いまある 27 枠ぶんの判定は 1 つも書き換えないこと。**

- 試験場は**偽の `getVoxel`**（`Map<"x,y,z", id>`）で足ります。**先に「試験場が効いている」判定を置く**
  こと（隣に `CHEST` を置いていない状態で 27 枠なのを先に出す）
- 上の 1. の 8 項目を、**値を出してから**判定する
- 見張り 1: **`main.ts` に `chestPartner` / `LARGE_CHEST_SIZE` / `CHEST_SIZE` が出てこないこと**
  （`arena.ts` の `sourceOf()` を通す。生で読むとコメントが引っかかります）
- 見張り 2: **`inventoryui.ts` が `chests` を import しないこと**（既存の判定と同じ形で、
  **`craftscreen.ts` 経由の再輸出**だけを使う）

## 6. このタスク固有の禁じ手

- **新しいブロック ID を作らないこと**（左半分・右半分のような向き違いも）。組かどうかは voxel から毎回決めます
- **中身を移し替えないこと。** 組になった瞬間に 54 枠の器へ写す実装は禁止 ——
  組が解けたとき（片方を壊す・3 個目を置く）に**中身の行き先が無くなります**
- **`SaveData` の形を変えないこと**（`version` は 1 のまま）。**1 マス = 54 要素のキー**のままで、
  「大きいチェストで 1 キー」にしないこと。**`edits` にも混ぜない**
- **`breaking.ts` に相方を消す経路を足さないこと** —— ベッドと違い、**片方だけ壊れてよい**
  （残った側は 27 枠に戻るだけ）。`clearBedPartner()` の形を写さないこと
- **`placing.ts` に「3 個目を置けない」制限を足さないこと**（本家と違いますが、
  規則が voxel だけで決まるという一点を崩さないため）
- **`inventoryui.ts` に 27 / 54 を書かないこと**（`craft.chestSize` を見る）。
  **`main.ts` に `=== CHEST` や隣接の判断を書かないこと**
- **未読み込みの列では `getVoxel` が AIR を返します。** そこで落ちず、**組にならない（27 枠）**
  で通すこと（`furnaces.ts` の `hasColumn()` の罠と同じ場所です）
- **テストの判定をゆるめない**（とくに `test/world.test.ts` の p99 と `test/progression.test.ts`）

## 7. 終了条件

- `npm run typecheck` 緑 / **`npm test` 全部緑**（2307 件 + 増えたぶん）/ `npm run build` が通る
- **コミット 1 つ**（`loop/devgame` へ push。`master` へは押さない）
- **`TUNING.md` に 1 行**: 3 個以上並べると全部 27 枠に戻る（本家は先に組になった 2 個が大きいまま）
- `HANDOFF.md` の**「ブラウザで見てほしいところ」に 2〜3 行**（54 枠が 6 段で出るか・
  下 3 段が単体のときに消えているか・3 個並べたときの見え方）
- `docs/autodev-log.md` に 1 節、`AUTODEV-QUEUE.md` の 2 番の行を消し、**この仕様書を `状態: 済` に**
