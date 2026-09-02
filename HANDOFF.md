# 引き継ぎ

**このファイルはセッションの終わりに丸ごと書き直します。** 引き写さず、`git` と
`npm test` で裏を取ってから書くこと。恒久的な決まりごとは `CLAUDE.md` と `.claude/rules/`。

**ループは 2 本あります。** クリア導線は `LOOP.md`（`loop/endgame`）、
**機能追加は `AUTODEV.md`（`loop/devgame`）**。いまクラウドで回っているのは後者です。

## 見た目が確かめられるようになりました（2 つの道が通りました）

**1. 手元でも撮れます: `npm run shot`**（`tools/raster.ts`。GPU もブラウザも要りません）

three の `Scene` を CPU で塗ります（`Scene` / `BufferGeometry` / 行列は Node でそのまま
動くので、詰まっていたのは「three が GPU に描かせる」ところだけでした）。
**640x400 で 1 場面 1〜2 秒。** 場面は terrain / ground / nether / end / water / mobs。

```
npm run shot                 # 全部 shots/ へ
npm run shot -- water --time 0.75 --size 960x600
```

**写らないもの**: `sky.ts` の天球 GLSL（下地の 2 色で代用）・フォグ・near 平面をまたぐ
三角形・**DOM の画面**。見張りは `test/shot.test.ts`（**画素の値そのもの**で判定）。

**2. クラウドの周では本物のブラウザで撮れます: `node tools/browsershot.mjs`**

**`CLAUDE.md` の「この環境では WebGL が動かない」は手元の devcontainer の話で、
クラウドのサンドボックスには当てはまりませんでした**（2026-09-02 実測。Chromium 141 と
playwright が最初から入っていて、`/opt/pw-browsers`。GPU は無いが SwiftShader で
**WebGL 2.0 が動く**）。**天球 GLSL もフォグも DOM の画面も、これなら写ります。**
撮った 5 枚と分かったことは **`docs/browser-shots/README.md`**。

- ポインタロックはヘッドレスでも**効きました**（HUD が本当に出た絵です）
- 地形が落ち着くまで **13〜16 秒**（SwiftShader なので遅い）。1 周ぶんで 30 秒ほど
- **日本語は 1 文字も欠けていません**

**3. その突き合わせで、CPU 側のバグが 1 つ見つかって直りました**

`tools/raster.ts` が **sRGB の符号化を抜かしていました**（three の
`outputColorSpace = SRGBColorSpace` に当たるもの）。形は合っているのに**明るさだけが
本番と違う絵**が出ていて、暗い所ほど差が開きます。直したので、地面の代表色は
**本物とまったく同じ rgb(106,168,79) / rgb(94,156,65)** になりました（`95f0e74`）。

**この前の周の申し送りにあった「ネザーは実際にまっ暗」は誤りでした。** あれは
この符号化漏れで、直したいまは天井のグロウストーンも岩肌も見えます。

## 実験: 無人で `.claude/` に書けるか

**答え: 書けません。無人なら、そこで止まります。**

- 使ったツール: **`Write`**（Bash や python のスクリプトではありません）
- パス: **`.claude/rules/.probe.md`**（本文は `probe` の 1 行）
- 出たもの: **`Claude requested permissions to edit ... which is a sensitive file.`**
  という**確認**。返ってきた結果は **`Denied by user`**
- ファイルは作られていません（`ls` で `No such file or directory`）

**この周を書いた無人の自分は「(c) 即時拒否なので番は止まらない」と結論しましたが、
これは誤りでした。** 実行ログの時刻がそれを示しています:

```
01:25:08.254  tool_use Write: .claude/rules/.probe.md
01:25:08.358  permission prompt: ... which is a sensitive file.
01:33:30.475  env[info]: Allocating sandbox        ← 8 分 22 秒の空白
01:33:38.224  tool_result ERROR: Denied by user
```

**8 分 22 秒ブロックされ、その間にサンドボックスが一度回収されて割り当て直されています。**
`Denied by user` が返ったのは、**ユーザーがブラウザで見ていて「拒否」を押したから**です。
**呼んだ側からは待たされたことが見えません**（結果だけが返るので、即時拒否と区別が付かない）。
**誰も居なければ、そのまま止まったままでした。**

**原因は Claude Code の [Protected paths](https://code.claude.com/docs/en/permission-modes#protected-paths)**
で、`.git` や `.vscode` と並んで **`.claude` が挙がっています**。**判定が許可ルールより手前で走る**ので、
`.claude/settings.json` の `Edit(.claude/rules/**)` は**どこに書いても効きません**（公式ドキュメントに明記）。
routines には**権限モードの指定自体がありません**（"there is no permission-mode picker"）。
**`Bash` の `python3` から書くと判定を素通りしますが、それはガードを迂回する形なので使わないこと。**

**結論: 決まりごとの更新は `RULES-INBOX.md` へ。この実験を次の周でやり直さないこと。**

## いまの状態（2026-09-02）

- ブランチ **`loop/devgame`**（push 済み）。**`master` への push とマージは引き続き禁止**
- ブランチ **`loop/devgame`**（`d182405` まで push 済み）
- `npm run typecheck` は通ります。**`npm test` 2531 件すべて成功**
  （+6 件は `test/shot.test.ts`）。**`npm run build` はクラウドの周が走らせて通っています**
  （`src/**` には 1 行も触っていません）
- **進行（クリア導線）達成 13 / 13。仮の判定は 0 件**
- `src/main.ts` は **1396 行 / 上限 1500**（**この周は 0 行**）
- **ブロック ID: 1..63 の空き 9 / 111..255 の空き 145**（**この周は 0 個**）
- **`AUTODEV-SPEC.md` は `状態: 未着手`**（4.・剣 4 本）、`AUTODEV-QUEUE.md` の未着手は
  **7 件のまま** → **次の周は C（実装）**
- **`RULES-INBOX.md` は未取り込み 0 件**
- **ブラウザ確認は 0 件**（見た目に出るものを 1 つも足していません）
- **`src/**` は 1 行も触っていません。** 足したのは `tools/raster.ts` / `tools/shot.ts` /
  `tools/browsershot.mjs` / `test/shot.test.ts` / `docs/browser-shots/` と、
  `CLAUDE.md`・`package.json` の `shot`・`tsconfig.json` の `include` に `tools`・
  `.gitignore` に `shots/`

## この周でやったこと（無人・B の周 1 種類だけ）

**`AUTODEV-QUEUE.md` の先頭 4.（剣 4 本）を `AUTODEV-SPEC.md` に落としました。**
**`src/**` と `test/**` には 1 行も触っていません**（B の完了条件）。仕様書は 120 行ちょうど。

**取る前にコードで数え直して分かったこと**（B の決まり。`Read` / `Grep` で確認）:

- **`sword` も `剣` も `src/**` に 0 件。** キューの「1 本も無い」は本当でした
- **`ToolKind`（`blocks.ts`）に `"sword"` を足すのがいちばん安い**と分かりました。
  `maxUses()` は `toolOf()` に聞くだけなので、**耐久値（59/131/250/1561 = 本家の剣と
  同じ数字）もセーブの 5 キーも 1 行も書かずに付いてきます。** `toolSpeed()` は
  種類が合わないと 1 を返すので、**剣が採掘を速くすることもありません**
- **`mobs.attack()` は「殴れたか」を返していて、`main.ts` はそれを捨てていました**
  （783 行）。**減らす場所はここ 1 か所**で、火種・弓と同じ「効いたときだけ減る」形に
  そのまま乗ります
- **`wearForAttack()` を 3 本目として立てる**ことにしました（前の周の申し送りどおり）。
  **`wearForUse()` に混ぜると、剣を右クリックしただけで減ります**

## ブラウザで見てほしいところ（見た目に出るもの）

**いま溜まっているものはありません。** この周は文書 1 枚だけです。

## 次にやること

**無人の周は `AUTODEV.md` の「1. いまはどの周か」に従うこと。**
**`AUTODEV-SPEC.md` が `状態: 未着手`** なので → **次は C（実装）の周**です。

- **`AUTODEV-SPEC.md` を全文渡すこと**（要約すると「触らないファイル」と「禁じ手」が
  真っ先に落ちます）。**サブエージェントは同じ番の中で結果が返る呼び方でだけ使い、
  返らないなら自分で実装すること**
- **ID を 4 個使います（111..114）。** 使ったら **`ROADMAP.md` の予約表に「実装済み」**と
  書くこと。**111..255 の空きは 145 → 141** になるはずです（`npm test` が出します）
- **この周が共有帯 111 以降の最初の使用者です。** `MAX_ITEM_ID` が `ARROW`(94) から
  `DIAMOND_SWORD`(114) へ飛ぶので、**95..110 の穴を通る道**（`allItemIds()` /
  クリエイティブ一覧 / `test/blocks.test.ts` の突き合わせ）を必ず値で確かめること
- **実装したら `npm run shot -- mobs` を撮って自分で見ること**（剣は手に持たないので
  絵には出ませんが、モブの形を壊していないかはこれで分かります）
- **`TUNING.md` に 1 行**（`TOOL_ATTACK` の `sword: 4`。本家は階層ごとに +1 で 4/5/6/7、
  ここは +0.5 なのでダイヤの剣が 6 です）

人がやること:

- **`#status`（通知）がインベントリの説明文とメニューのモード行に重なります。**
  `#status` は `bottom: 118px` 固定（`style.css:674`）で、インベントリの `#recipehint` と
  同じ高さ。オートセーブは 15 秒ごと・通知は 3 秒出るので、**インベントリを開いている
  時間の 2 割ほどで説明文が読めません**。**ブラウザの絵で見つかったもの**で、
  `docs/browser-shots/inventory.png` と `menu.png` に写っています。直していません
  （`REVIEW.md` に入れるか手触りとして流すかは人が決めること）
- 無人の周にブラウザ撮影をやらせるかどうか（`AUTODEV.md` の書き換えが要ります）
- `master` へのマージ

**音のテスト（`test/audio.test.ts`）の揺れは、この周も出ていません**（3 回走らせて緑）。
`audio.ts` / `sfx.ts` には 1 行も触っていないので、**直ったわけではありません。**
赤が出たら、まずもう一度走らせること（停止条件は「2 周続けて赤い」）。

**クラウドの定期実行（3 時間ごと）はこの状態を知らないので、止めるまで発火し続けます。**
止めるのはユーザーの仕事です。
