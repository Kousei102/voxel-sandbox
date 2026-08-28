---
name: unverifiable-pair
description: この環境で確かめられないもの（three の描画・WebAudio・DOM・GLSL）を新しく足すときに、判断の側と閉じ込める側を対にして見張りのテストまで書く手順。*render.ts を新しく作る、音を足す、画面の要素を足す、シェーダに手を入れるときに使う。
---

# 確かめられないものを足す

背骨は `CLAUDE.md` の「確かめられないものは、確かめられるものから切り離す」。
ここは**新しく対を作るときの手順**です。**崩した瞬間、その領域が丸ごと
「ブラウザを開くまで確かめられないもの」に戻ります。**

## 1. 2 つのファイルに割る

| 閉じ込める側 | 判断の側 |
| --- | --- |
| three（`Group` / `Mesh` / マテリアル / 毎フレームの同期） | 表・AI・数値・状態機械 |
| `AudioContext` とノードグラフ | 何を・いつ・どんな数値で鳴らすか |
| `document` / `HTMLElement` / イベント配線 | 押されたときに何が起きるか |
| GLSL | その値をいつ・いくつにするか |

**入力の意味を閉じ込める側で決めないこと。** UI が渡してよいのは `shiftKey` /
`detail === 2` / `buttons !== 0` のような**DOM の事実**だけで、それがクイック移動なのか
かき集めなのかは判断の側が振り分けます。

判断の側には**フラグも持たせないこと**（ドラッグ中かどうか、カーソルがどの枠の上か、も判断です）。

## 2. 既存の対にならう

| 確かめられないもの | 閉じ込めてある例 | 判断を持つ相方 |
| --- | --- | --- |
| GLSL | `sky.ts` / `terrainshader.ts` | `daynight.ts` |
| WebAudio | `audio.ts` | `sfx.ts` |
| DOM | `ui.ts` / `inventoryui.ts` | `craftscreen.ts` / `inventory.ts` / `crafting.ts` / `smelting.ts` |
| three（描画） | `mobrender.ts` / `droprender.ts` | `mobs.ts` / `mobmesh.ts` / `drops.ts` |

**差し替え口を増やさないこと。** `AudioEngine` のコンストラクタが `AudioContext` を
受けるのは `OfflineAudioContext` を渡すためで、口が増えるとその領域が外へ漏れます。

## 3. 見張りのテストを両方向に書く

**片方向だけでは足りません。** `test/mobs.test.ts` の「`mobrender.ts` に判断が漏れていない」が手本です。

- **閉じ込めた側に判断が漏れていないか** — その `*render.ts` に `Math.random(` /
  `spawn` / `damage` / `hostile` のような語が無いこと。
- **判断の側に確かめられないものが入り込んでいないか** — `mobs.ts` に `Mesh` や
  `AudioContext`、`craftscreen.ts` に `document` や `HTMLElement`、`sfx.ts` に
  `AudioContext` が無いこと。
- いちばん強い判定は **import の検査**です（`inventoryui.ts` が `crafting.ts` と
  `smelting.ts` を import しないこと）。可能ならこの形にすること。

**`test/ui.test.ts` が「見張りのないレンダラ」を検出します。** 対を作って見張りを
書き忘れると赤くなるので、そこで気付けます。

## 4. 画面や耳でしか気付けないものを数値に落とす

書けるものは必ず数値にします。先例:

- 面の裏返り → 発散定理で体積を出す / 巡回順から法線を求めて格納値と突き合わせる
- 置き方 → `placeSpot()` を直接呼ぶ
- 音 → `OfflineAudioContext` に実際に鳴らして、鳴るか・長さで止まるか・音量が掛かるか・
  水中でこもるか・材質の `cutoff` が効いているか
- 通知 → 要素の置き場所（隠れるパネルの中に無いこと）
- DOM の id → `getElementById` で引く id が `index.html` に実在するか

**「気持ちいいか」は測れません。** そこだけをユーザーに聞く形にするのが目的です。

## 5. 対の表を更新する

`CLAUDE.md` の対の表に 1 行足し、領域別の決まりごとは `.claude/rules/` の該当ファイルへ
書きます（新しい領域なら `paths` 付きで新しいルールを作る）。

## 6. 確かめる

```bash
npm run typecheck
npm test
```

そのうえで **`HANDOFF.md` に「何が見た目に出るか」を 2〜3 行**残します。
**`REVIEW.md` に確認項目を書き溜めないこと** —— あれは**ユーザーが通しで遊んで
見つけた不具合**の置き場で、ループが質問を並べる場所ではありません。
**GLSL に触ったときだけは必ず書くこと**（壊れ方が「画面が真っ黒」なので、
ヘッドレスのテストが全部緑でも壊れていることがあります）。
