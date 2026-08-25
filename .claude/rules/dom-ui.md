---
paths:
  - "src/ui.ts"
  - "src/inventoryui.ts"
  - "src/debugtext.ts"
  - "src/debugspawn.ts"
  - "test/debugtext.test.ts"
  - "test/debugspawn.test.ts"
  - "index.html"
  - "test/ui.test.ts"
  - "src/style.css"
---

## 画面（DOM）

`index.html` の id を TS 側から `getElementById(...) as HTMLElement` で引いています。
**綴りを間違えても型では落ちません**（`test/ui.test.ts` が突き合わせています）。

- **通知（`hud.flash()`）の要素は、隠れるパネルの中に置かないこと。**
  `#menu` の中に書いていたせいで、プレイ中に出した通知が誰にも見えず、
  メニューを開いた人にだけ遅れて見える状態になっていました。
  いまは `ui.ts` の `createStatusBar()` が `body` の直下に作るので、
  **index.html には書きません。**
- `class="hidden"` で丸ごと消えるのは `#hud` `#menu` `#inventory` `#death` です。
  ここに入れてよいのは、そのパネルを見ている間だけ意味がある表示だけです。

## F3 とデバッグの鍵（`debugtext.ts` / `debugspawn.ts`）

**画面に出す文字列の組み立ても「判断」です。** `ui.ts` は受け取った文字列を貼るだけ。

- F3 の行は `debugText(sources)` の 1 か所（`test/debugtext.test.ts` が**行数と各行の中身**を
  見ています）。**`main.ts` にテンプレート文字列を書き戻さないこと** —— 出しているつもりの値が
  黙って消えても、画面を開くまで気付けません。
- 受け取るのは器そのものではなく**必要な値を持つ何か**（`session.ts` と同じ作法）。
  だからテストは偽物を並べるだけで書けます。
- `M`（モブ）と `N`（飛び道具）は**「湧かない場所」と「描けていない」を切り分けるための鍵**です。
  何を・どこに出すかは `debugspawn.ts`、**乱数は呼ぶ側が作ります**（`rollDrop()` と同じ）。
