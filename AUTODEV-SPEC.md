# 仕様: 卵を投げる（`PROJECTILE_KINDS` に 1 行 + `use.ts` の `throw`）

状態: 済
差し戻し: 0 回

**キューの 7c-2**（7c を 2 件に割った後半。前半「産む側」は済み = 卵はアイテム 129）。
**数え直し済み**（2026-09-04・コードが根拠）: `src/**` の `EGG` は **`items.ts` の 3 行と
`mobs.ts` の 2 行だけ**で、`projectiles.ts` / `use.ts` / `main.ts` には卵が 1 つもありません。
`ProjectileKind` は **4 語**（`fireball` / `arrow` / `eye` / `breath`）で `PROJECTILE_KINDS` も
**4 行**、`UseAction` は **14 通り**。実装前: **2904 件緑** / `main.ts` **1449 行** /
**111..255 の空き 126** / `MAX_ITEM_ID` 129 / 飛び道具 4 種類。

## 1. 何を足すか / 完了の判定

**卵を持って右クリックすると、視線の向きへ 1 個投げる。** 落ちながら飛び、ブロックか相手に
当たって消える。**サバイバルでは 1 個減り**（クリエイティブは減らない）、**ヒヨコは孵らず**
（子モブの仕組みが無い = 別件）、**ダメージは 0**（本家の卵も 0）。
完了の判定 —— **`npm test` に次が増えて全部緑**（**2904 件から減らさないこと**）:

- 「飛び道具が **5 種類**」（表を出力してから）/「卵は落ちる・当たって消える・刺さらない」/
  「**表の色が `itemColor(EGG)` と同じ**」
- 「卵を持った右クリックが `throw` の注文になる」/「**狙う先が無くても投げられる**」/
  「**作業台を狙ったら器（`craft`）が勝つ**」/「`place` の注文にならない」
- 「`thrownProjectile(EGG) === "egg"`・ほかは null」/「**表の行き先が全部 `PROJECTILE_KINDS`
  にある**」/「`main.ts` に `EGG` と `thrownProjectile(` が無い」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/projectiles.ts` | `ProjectileKind` に **`"egg"` 1 語** / `PROJECTILE_KINDS` に **1 行**（値は下の 5） |
| `src/items.ts` | **`THROWN` の表 1 本**（`EGG → "egg"`）と **`thrownProjectile(item)` 1 本**。`import type { ProjectileKind }` |
| `src/use.ts` | `UseAction` に **`throw` 1 行** / `decideUse()` に **2 行**（`throwEye` の直後） |
| `src/main.ts` | **`case "throw"` 1 行と `throwItem()` 1 本だけ**（1449 行 → 1500 の上限に注意） |
| `test/projectiles.test.ts` / `test/use.test.ts` / `test/blocks.test.ts` | 下の 6 |
| `TUNING.md` / `ROADMAP.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | 下の 8 |

**1 行も書かないこと**: `mobs.ts`（**ヒヨコも `hitByProjectile()` の書き換えも無し**）/
`drops.ts` / `storage.ts` / `crafting.ts` / `vitals.ts` / `bow.ts` / `placing.ts` / `sfx.ts` /
`audio.ts` / `projectilerender.ts`（**表の値だけで出ます**）/ `.claude/**`。

## 3. 使う ID

**0 個。** `"egg"` は `ProjectileKind` の**文字列**で、ブロック ID でもアイテム ID でも
ありません（卵は 129 にもうあります）。**`111..255 の空き` は 126 のまま・`MAX_ITEM_ID` は
129 のまま**（`npm test` の出力で確かめること）。**`SaveData.version` は 1 のままでキーも
増えません**（飛び道具は保存しない = `rules/projectiles.md`）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| **どう飛ぶか**（速さ・重力・寿命・当たったらどうなるか） | `PROJECTILE_KINDS` の 1 行 |
| **何を投げると何が飛ぶか** | `items.ts` の `THROWN` の表（`FILLED_BUCKETS` と同じ作法） |
| **右クリックが「投げる」に来るか** | `use.ts` の `decideUse()` の並び 1 か所 |
| 減らす・飛ばす | `main.ts` の `throwItem()`（**貼るだけ**。数値を書かない） |

**確かめられないものは 0・ID も 0 個**なので **`unverifiable-pair` も `add-block` も不要
—— この周はスキルを使いません。**

## 5. 実装の要点（この順で）

1. `projectiles.ts`: union に `"egg"`、表に 1 行 ——
   **`half: 0.125` / `color: 0xf7f0e0`（`items.ts` の卵と同じ）/ `gravityScale: 1` /
   `drag: 0` / `speed: 20` / `life: 30` / `onBlock: "vanish"` / `glows: false` / `aims: false`**。
   **速さ 20 は「本家の卵 1.5 ブロック/tick を、矢と同じ比で縮めた値」**（本家の矢 3.0 →
   ここは 40 なので 2/3）。**`aims` を真にしないこと** —— 卵は向きを持たずに回ります
2. `items.ts`: **`import type { ProjectileKind } from "./projectiles"`（`type` を必ず付ける ——
   値で入れると輪になります）**。`const THROWN: ReadonlyMap<number, ProjectileKind>` に
   `[EGG, "egg"]` の 1 行と、`thrownProjectile(item): ProjectileKind | null`
3. `use.ts`: `UseAction` に **`{ kind: "throw"; item: number; projectile: ProjectileKind }`**
   （ここも `import type`）。`decideUse()` の **`throwEye` の直後・`ignite` の前**に 2 行:
   `const thrown = thrownProjectile(held);` → 真なら `{ kind: "throw", item: held, projectile: thrown }`。
   **器（作業台・かまど・チェスト・ベッド）より前に出さないこと** —— 出すと、作業台の上に
   立って卵を持っているあいだ**作業台が開きません**（`rules/use.md` の並びの 2 番目）。
   **`aim` は見ないこと**（空へ投げられるのが正しい。食べる・弓と同じ扱い）
4. `main.ts`: `switch` に **`case "throw": throwItem(act.item, act.projectile); return;`** と、
   目線の高さから飛ばす関数 1 本 —— `projectiles.launch(kind, at.x, at.y + SHOOT_HEIGHT,
   at.z, player.yaw, player.pitch, PLAYER_OWNER)`（**`SHOOT_HEIGHT` は `bow.ts` の
   import 済みのものを使い回す。`damage` は渡さない = 既定の 0**）→
   **`if (!creative) inventory.consumeSelected(1)`** → `hud.refresh()` → `saveDirty = true`
5. **音は鳴らさず**（`audio.play` を書かない）、**`onHitBlock` / `onHitTarget` も 1 行も
   足しません**（`hitByProjectile()` は `shot.damage <= 0` で戻り、当たった卵は消えるだけ）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/projectiles.test.ts`: **5 種類の表（速さ・重力・寿命・当たったとき）を出力してから**
  「卵の行がある」/ **1 秒飛ばして y が下がる**（`gravityScale: 1` の証拠）/
  **薄い壁に当てると消える**（矢のように `stuck` にならない）/ **相手に当てると消える** /
  **`projectileDef("egg").color === itemColor(EGG)`**（持っている卵と飛ぶ卵の色が揃う）
- `test/use.test.ts`: **卵を持った右クリックが `throw`（`projectile === "egg"`）** /
  **`aim` が null でも `throw`** / **作業台を狙うと `craft` が勝つ** /
  **`place` の注文にならない** / **`backInMain` に `"EGG"` と `"thrownProjectile("` を足す**
- `test/blocks.test.ts`: `thrownProjectile(EGG) === "egg"` / **石・弓・矢・棒・パンは null** /
  **`THROWN` の行き先が全部 `PROJECTILE_KINDS` に居る**（綴りのずれをここで止める）

## 7. このタスク固有の禁じ手

1. **ヒヨコを孵さないこと**（本家の 1/8。子モブの仕組みが無い = 別件。`mobs.ts` は 0 行）
2. **卵にダメージを持たせないこと**（0。`Shot.damage` を渡さない。表にも書かない）
3. **`held === EGG` と書かないこと** —— 表 1 本（`isBucket` / `isBow` と同じ作法）。
   書くと、投げるものが増えるたびに `decideUse()` に分岐が生えます
4. **`use.ts` に `Projectiles` を import しないこと**（見張りが赤くなります。運ぶのは**型だけ**）
5. **音を足さないこと**（`sfx.ts` / `audio.ts` は 0 行）/ **`projectilerender.ts` を触らないこと**
6. **`onBlock: "stick"` にしないこと**（卵が壁に刺さって寿命まで残ります）
7. **ID を 1 つも取らないこと** / **テストの判定をゆるめないこと**（とくに
   `test/use.test.ts` の並びの表と `backInMain`）

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2904 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` に「**卵を投げる（AUTODEV 19）**」の節を 1 つ
（**速さ 20・寿命 30・ダメージ 0・音なし**と、**投げても何も起きない**ので使い道が
まだ薄いこと）/ `ROADMAP.md` の 129 の行から「**まだ投げられません**」を消して投げられると
書き直す（**予備は 130..255 のまま**）/ **C-3: `npm run build` →
`(npx --no-install http-server dist -p 8080 --silent &)` → `node tools/browsershot.mjs` を撮り、
`Read` で開いて console のエラー 0 件を自分の目で見る**（**撮っただけでは確かめたことに
なりません**。写った不具合は直す）/ 7c-2 を `AUTODEV-QUEUE.md` から消す / 仕様書を `済` に /
`HANDOFF.md` を丸ごと書き直す。
