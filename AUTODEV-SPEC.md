# 仕様: 画面の開け閉めを `src/panels.ts` へ出す（15 番の前半）

状態: 未着手
差し戻し: 0 回

**キューの先頭 15 番（ミルクバケツ）を 2 件に割った前半**（`AUTODEV.md` の B の
「120 行に収まらない仕様は 2 件に割る」）。後半 15b はキューに書き戻してあります。

**割った理由**: `main.ts` が **1463 行**（上限 1500・止まる目安 1450）で、15b は
`use.ts` の注文を貼る関数が 12〜15 行要ります。**先に空けないと 16 番で上限に当たります。**
2026-09-05 に数え直したところ、`milk` は `src/**` にも `test/**` にも 0 件でした。

## 1. 何を出すか / 完了の判定

**「画面を 1 つ開ける手順」と「閉じたらロックし直す」を判断だけのファイルへ出す。**
いま `main.ts` 711..760 にある 7 つの関数がそれで、**手を止める → 出す → メニューを
隠す → ロックを外す**の 4 手が揃っているかは**ブラウザを開くまで確かめられません**。
出すと 4 経路ともヘッドレスで見られます（`CLAUDE.md` の背骨）。**振る舞いは変えません。**

完了の判定（`npm test` が全部緑のまま、次が増えていること）:

- **`test/panels.test.ts` が新しくあり**、次の 5 項目が緑:
  - 「4 つの画面はどれも、開ける前に手を止める」
  - 「開いているあいだは二重に開かない（手も止め直さない）」
  - 「開けるとロックが外れ、閉じるとロックし直す」
  - 「閉じるのは開いているときだけ（閉じているのに `hide()` を呼ばない）」
  - 「ロックが外れたときメニューを出すのは、画面も死亡もクリアも閉じているときだけ」
- **`npm test` の「main.ts N 行」が 1430 行以下**（いま 1463。消す 50 行 ＞ 足す 10 行前後）
- `test/ui.test.ts` の「main.ts は出した判断を呼び直している」が**緑のまま**（6 の禁じ手）

## 2. 触るファイル / 触らないファイル

**触る:**

- **`src/panels.ts`（新規）** —— 判断だけ。**DOM も three も `World` も持ち込まない**
- `src/main.ts` —— 711..760 の 7 関数を消し、`const panels = new Panels({...})` を 1 つ置いて
  呼び出しを貼り替えるだけ（`openInventory(3)` → `panels.openInventory(3)` など）。
  **判断を 1 行も書かないこと。** 690 行の menu を出す条件も `panels.ts` の関数へ差し替える
- **`test/panels.test.ts`（新規）**
- `rules/dom-ui.md` の `paths` に `"src/panels.ts"` と `"test/panels.test.ts"` の 2 行
  （`rules/README.md` の一覧は本数が増えないので触りません）

**触らない（1 行も）:** `src/inventoryui.ts` / `src/craftscreen.ts` / `src/ui.ts` /
`src/furnaces.ts` / `src/chests.ts` / 上に挙げた以外の `src/**` 全部 / **`test/ui.test.ts`** /
`ROADMAP.md` / `TUNING.md`。

## 3. 使う ID

**0 個。** ブロックもアイテムも足しません（`ROADMAP.md` の予約表は次の空き **138** のまま）。

## 4. 判断をどこに置くか

`panels.ts` は**開け閉めの手順だけ**を持ち、DOM の受け口は**構造的な型で受ける**
（`inventoryui.ts` も `ui.ts` も import しない。型だけは `craftscreen.ts` /
`furnaces.ts` / `chests.ts` から取ってよい —— `use.ts` が `ProjectileKind` を
`import type` で取っているのと同じ形）:

```ts
export interface PanelScreen {          // 中身は inventoryui.ts の InventoryScreen
  readonly isOpen: boolean;
  show(size: CraftSize): void;
  showCreative(): void;
  showFurnace(state: FurnaceState): void;
  showChest(state: ChestState): void;
  hide(): void;
}
export interface PanelHost {
  readonly screen: PanelScreen;
  stopHands(): void;   // 掘りかけ・食べかけ・引きかけ。**main.ts に残す**（`breaking` は向こうの状態）
  setPlaying(playing: boolean, menuVisible: boolean): void;  // ui.ts の hud
  refresh(): void;
  lock(): void;        // requestLock（DOM は main.ts 側）
  unlock(): void;      // document.exitPointerLock()
}
export class Panels {                   // openInventory / openCreative /
  constructor(host: PanelHost);         // openFurnace / openChest / close
}
/** ロックが外れたときメインメニューを出すか。**`playing` は呼ぶ側**（`main.ts` 690 行）。 */
export function menuVisibleWhenUnlocked(f: {
  screenOpen: boolean; dead: boolean; victoryOpen: boolean;
}): boolean;
```

- **器の中身を引くのは呼ぶ側。** `furnaces.at()` / `chests.open(world, …)` は `main.ts` に
  残し、`panels.openFurnace(state)` へ**引いた結果を渡す** —— `panels.ts` が `world` を
  持った瞬間、画面の手順を確かめるのに世界を作る羽目になります
- `menuVisibleWhenUnlocked()` は 690 行の後ろ 3 つ（`!screen.isOpen && !vitals.dead &&
  !hud.victoryOpen`）だけ。**`!playing` は `main.ts` に残す**

## 5. 書くテスト（`test/panels.test.ts`）

`test/harness.ts` の `check` に合わせ、**偽の `PanelHost` に呼ばれた順を配列で記録し、
その配列を `console.log` で出してから判定する**こと（`rules/testing.md`。
「値を出してから判定」。`test/craftscreen.test.ts` が手本）。**画面の中身は見ません**
（それは `craftscreen.ts` の担当）—— 見るのは**呼ぶ順と、呼ばないこと**の 2 つだけ。

## 6. このタスク固有の禁じ手

- **振る舞いを 1 つも変えないこと。** ついでの直しや改良を混ぜない（差分が読めなくなる）
- **`test/ui.test.ts` を 1 行も直さないこと。** あの一覧は `main.ts` に残るべき呼び出しを
  40 件見張っています。**しかも回数まで数える見張りが別にあります**（`durability` の
  「`main.ts` の `wearForUse(` は 3 回」など）—— **動かす関数の中身を `grep -rn '<語>' test/`
  で先に当たること。1 件でも当たったら、その関数は動かさずに置いていくこと**
  （2026-09-05 に確かめた範囲では、**今回動かす 7 関数はどれも 0 件**です）
- **`panels.ts` に `document` / `HTMLElement` / `Mesh` / `World` を持ち込まないこと**
- **`main.ts` の行数をコメントを削って減らさないこと**（あそこの注意書きは記録です）
- 画面を足さないこと・`CraftScreen` の中身に触らないこと

## 7. 終了条件

`npm run typecheck` 緑 / `npm test` **全部緑**（新しい 5 項目ぶんだけ件数が増える）/
`npm run build` 緑 / **コミット 1 つ**。**手触りの数値は 0 個**なので `TUNING.md` は触りません。

**見た目は変わりませんが、`main.ts` の配線を貼り替えるので**、`npm run build` のあと
`node tools/browsershot.mjs` を 1 回だけ回し、**タイトル画面が今までどおり出る**ことを
`Read` で見ること（起動で例外が出ると真っ黒な絵になるので、そこだけは分かります）。
**ヘッドレスではポインタロックが掛からず、インベントリを開いた絵は撮れません**
（`docs/browser-shots/README.md`）—— **開けるかどうかは `HANDOFF.md` で人に頼むこと。**
