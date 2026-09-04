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
  - "src/view.ts"
  - "src/boss.ts"
  - "test/boss.test.ts"
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
- **メニュー（Esc の設定パネル）の DOM は `ui.ts` の `Menu`** です。`main.ts` が渡すのは
  中身（`MenuHooks`）だけで、**種の読み方も新しいワールドの後始末も `session.ts`**
  （`parseSeed()` / `forgetWorld()` / `forgetEverything()`）。ボタンを足すときも
  「id を引くのは `ui.ts`、何が起きるかは `main.ts`、判断は判断のファイル」に揃えること。
- **three の器（`renderer` / `scene` / `camera` / `fog` / `sky` / 選択枠 / ひび割れ）は
  `view.ts`** です。作って置くだけの場所なので、**数値の判断を書かないこと**
  （フォグの濃さは `daynight.ts`、選択枠の大きさは `shapeBounds()`）。

## ボスの合図（体力バーとクリア画面）

**倒したことを画面で伝えるぶん**です。`ui.ts` と `index.html` は貼るだけで、
**判断は全部 `boss.ts`**（`vitals.ts` の `deathMessage()` と `ui.ts` の関係と同じ形）。

| ファイル | 中身 | 確かめ方 |
| --- | --- | --- |
| `boss.ts` | **判断は全部ここ。** 帯を出す／消す条件・割合・ラベル・クリア画面をいつ出すか・1 行 | `npm test` |
| `mobs.ts` | `activeBoss(次元)`（いま生きているボスの名前と体力）/ `bossName(次元)` | `npm test` |
| `ui.ts` | DOM だけ（`.hidden` の付け外しと `style.width`）。**判断を書かない** | ブラウザ |

- **`boss.ts` は `mobs.ts` を import しません。** 受け取るのは器ではなく
  **必要な値を持つ何か**（`BossFacts` = 名前・体力・最大体力）で、`Mobs.activeBoss()` が
  返すものと**構造で合わせて**あります（`vitals.ts` の `FoodValue` と `items.ts` の
  `FoodDef` と同じ作法）。食い違えば `test/boss.test.ts` の型検査で止まります。
- **帯を消す条件は 3 つとも `bossBarState()` の中**です: ボスが居ない（次元を離れた・
  まだ湧いていない・倒した）/ 体力が尽きている（倒れたモブは次のフレームに `list` から
  抜けるので、残すと**空の帯が 1 フレームちらつく**）/ 最大体力が 0（割ると `NaN%` の幅に
  なって**黙って消える**）。**`ui.ts` に写さないこと。**
- **残りの数を必ずラベルに出すこと**（`エンダードラゴン　132 / 200`）。棒だけだと、
  クリスタルの回復と矢のダメージが釣り合っているのかが目では分かりません。
  **切り上げること** —— 残り 0.4 を「0」と出すと、生きているのに倒したように見えます。
- **置き場所そのものが判断です。** 体力バー（`#bossbar`）は **`#hud` の中**
  （プレイ中しか意味がなく、メニューや死亡画面の裏に残ってはいけない）。
  **クリア画面（`#victory`）は `#hud` の外**です —— `#hud` はロックが外れると
  `hidden` になるので、あの中に置くと**倒しても永久に出ません。**
  `test/boss.test.ts` が `index.html` の並びでこの 2 つを見ています。
- **クリア画面は「倒した瞬間」だけ出すこと**（`VictoryWatch`。`Mobs.bossDefeated()` が
  false → true に変わったところ）。**「印が立っているか」で出さないこと** ——
  出口ポータルは `edits` に乗って残るので、**倒したあとエンドへ入り直すたびに
  クリア画面が出ます。**
- **見張りに戻し方（`reset()`）を足さないこと。** 次元を移る・ワールドを作り直すと
  `mobs.clear()` が走って `bossDefeated()` が false へ戻るので、見張りも同じ経路で戻ります。
  別に持つと、呼び忘れた場所だけが**二度とクリア画面を出さない**形を作れます。
- 開けるときは `openPanel()` を通します（掘りかけ・食べかけ・引きかけを止めるのが
  インベントリと同じ 1 か所にまとまります）。**メインメニューを出さない条件
  （`pointerlockchange`）に `hud.victoryOpen` を足すこと** —— 足さないと、
  クリア画面の上にメニューが重なって読めません（死亡画面の `vitals.dead` と同じ役目）。

## F3 とデバッグの鍵（`debugtext.ts` / `debugspawn.ts`）

**画面に出す文字列の組み立ても「判断」です。** `ui.ts` は受け取った文字列を貼るだけ。

- F3 の行は `debugText(sources)` の 1 か所（`test/debugtext.test.ts` が**行数と各行の中身**を
  見ています）。**`main.ts` にテンプレート文字列を書き戻さないこと** —— 出しているつもりの値が
  黙って消えても、画面を開くまで気付けません。
- 受け取るのは器そのものではなく**必要な値を持つ何か**（`session.ts` と同じ作法）。
  だからテストは偽物を並べるだけで書けます。
- `M`（モブ）と `N`（飛び道具）は**「湧かない場所」と「描けていない」を切り分けるための鍵**です。
  何を・どこに出すかは `debugspawn.ts`、**乱数は呼ぶ側が作ります**（`rollDrop()` と同じ）。
