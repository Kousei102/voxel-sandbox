---
paths:
  - "src/ui.ts"
  - "src/inventoryui.ts"
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

