# 仕様: 鶏が卵を産む（`MobDef.laying`）

状態: 済
差し戻し: 0 回

**キューの 7c-1**（7c を 2 件に割った前半。後半「投げる側」はキューに残っています）。
**数え直し済み**（2026-09-03・コードが根拠）: `src/**` に `EGG` の名も `egg` の綴りも**1 つも無く**、
`mobs.ts` の「卵」は `DRAGON.drop` のコメント 1 行だけ（**何も落としません**）。`MobDef` に
`laying` は無く、`Mob` の時計は `hurtTimer` / `woolTimer` / `attackTimer` / `shootTimer` /
`teleportTimer` / `phaseTimer` / `hopTimer` の 7 本。**倒したとき以外に `onDrop` を鳴らす所は
`shear()` の 1 か所だけ**です。実装前: **2858 件緑** / `main.ts` **1449 行** /
**111..255 の空き 127** / 共有帯のアイテム 15 個 / `MAX_ITEM_ID` 128 / モブ 7 種類。

## 1. 何を足すか / 完了の判定

**鶏が一定の間隔で足元に卵を 1 個産む**（本家と同じ 300〜600 秒。倒す必要はありません）。
**卵はまだ投げられません**（`projectiles.ts` は 1 行も触らない = 7c-2）。
完了の判定 —— **`npm test` に次が増えて全部緑**（2858 件から減らさないこと）:

- 「産めるのは鶏だけ」（`MOB_KINDS` の表を出力してから）/「産まないモブは何時間回しても 0 山」
- 「**境目の 1 フレーム手前では産まず、その次のフレームで卵 1 個が 1 山**」
  （`woolTimer` の戻りの測り方と同じ形）/「産んだあと次の間隔が min..max に入り直す」
- 「共有帯のアイテムが **16 個**（129 まで）」「`MAX_ITEM_ID` が 129」「卵は 16 個までしか積めない」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/mobs.ts` | `LayRule` を新設 / `MobDef.laying` を足し、**既存 7 定義に `laying:` を 1 行ずつ**（鶏だけ表・ほかは `null`）/ `Mob.layTimer` / `spawn()` の初期値 / **`private lay()` を新設して `update()` から呼ぶ** / `import` に `EGG` |
| `src/items.ts` | `EGG = 129` / `MAX_ITEM_ID` の差し替え / `item({...})` 1 行 |
| `test/mobs.test.ts` / `test/blocks.test.ts` | 下の 6 |
| `TUNING.md` / `ROADMAP.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | 下の 8 |

**1 行も書かないこと**: **`main.ts`（1449 行。受け口 `mobs.onDrop` の配線はもう通っていて、
`drops.burst()` が散らすところまで既にできています）** / `projectiles.ts` / `use.ts` /
`bow.ts` / `crafting.ts` / `smelting.ts` / `vitals.ts` / `drops.ts` / `breaking.ts` /
`mobmesh.ts` / `mobrender.ts` / `sfx.ts` / `audio.ts` / `storage.ts` / `.claude/**`
（**セーブは 1 バイトも増えません** —— モブを保存しないので `layTimer` も保存されません）。

## 3. 使う ID

**アイテム 1 個: `EGG = 129`**（`ROADMAP.md` の予約表の「129..255 予備」の先頭）。
**ブロックは 0 個**（卵は置けません）。取ったあと `111..255 の空き` は **127 → 126**、
共有帯のアイテムは **15 → 16 個**（`npm test` の出力で確かめること）。
`MAX_ITEM_ID` は **128 → 129**。**`SaveData.version` は 1 のまま**（キーも増えません）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| **誰が・何を・何個・どれだけの間隔で産むか** | `MobDef.laying`（`mobs.ts` の表。`ShearRule` とまったく同じ作法） |
| **いつ産むか（時計を減らして 0 で鳴らす）** | **`Mobs.lay()` の 1 本**。**`update()` に条件を書き足さないこと** |
| 産まれた物がどう散るか | **既にある `onDrop` → `main.ts` → `drops.burst()`**（1 行も足さない） |
| 卵という物 | `items.ts` の `item({...})` 1 行（**食べ物でも道具でもない**） |

**新しい「確かめられないもの」は 0 なので `unverifiable-pair` は不要**（描画も音も増えません）。**使うスキルは `add-block`。**

## 5. 実装の要点（この順で）

1. `items.ts`: 羽根(128) の下に **`EGG = 129`**、`MAX_ITEM_ID` を `EGG` に差し替え。
   `item({ id: EGG, name: "卵", block: AIR, stack: 16, tool: null, color: 0xf7f0e0 })`
   —— **`FOODS` にも `SMELTING` にも足さない**（`stack: 16` は本家の値。`MAX_STACK` ではない）
2. `mobs.ts`: `ShearRule` の隣に **`LayRule { item, count, min, max }`**（`min`/`max` は
   次に産むまでの秒数の幅。**`min` を 0 にしないこと** —— 毎フレーム産みます）
3. `MobDef` に **`readonly laying: LayRule | null`**。**既存 7 定義には `laying: null` の
   1 行を足すだけ**（`shearing:` の隣。**ほかの行は 1 つも書き換えないこと**）。鶏だけ
   **`laying: { item: EGG, count: 1, min: 300, max: 600 }`**（本家の 6000〜12000 ティック）
4. `Mob` に **`layTimer`**（次に産むまでの残り秒）。`spawn()` の初期値は
   **`def.laying ? pick(random, [def.laying.min, def.laying.max]) : 0`** ——
   **0 から始めないこと**（湧いた瞬間に全員が 1 個産みます）
5. **`private lay(mob, def, dt, random)` を新設**し、`update()` の中の
   **`this.step(...)` の直後**で呼ぶ（`burn()` より前）。中身は 4 行:
   `def.laying` が無ければ返る / `layTimer -= dt` / まだ 0 より大きければ返る /
   **次の間隔を入れ直してから** `onDrop?.(rule.item, rule.count, x, y, z)`
   —— **`onSound` は鳴らしません**（音は足さない。7c-2 でもありません）
6. `onDrop` の説明文を直す（**倒したとき・刈ったときに加えて「産んだとき」も通る**）
7. **`main.ts` は 0 行**

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/mobs.test.ts`: **`MOB_KINDS` の「産む ○ / ×」の表を出力してから**「産むのは鶏だけ」/
  鶏の表（何を・何個・何秒〜何秒）を出力 / **`spawn()` 直後の `layTimer` が min..max に入る**
  （種を固定して値を出力）/ **`min` 秒ぶん回しても 0 山、`max` 秒で 1 山**、そのうえで
  **境目の 1 フレーム手前とその次**を測って「卵 x1 が 1 山」（`woolTimer` の戻りと同じ形）/
  **2 個目が出るまでの間隔も min..max に入る** / **産まないモブ（豚・羊・ゾンビ…）を
  `max` 秒ぶん回して `onDrop` が 1 度も鳴らない** / **`onSound` が鳴らない** /
  **`mobrender.ts` の見張りに `"laying"` と `"layTimer"` を足す**（`shearing` / `woolTimer` の隣）
- `test/blocks.test.ts`: **`sharedItems.length === 16`** / `sharedItems[15] === EGG` /
  `MAX_ITEM_ID === EGG` / 卵は **`placedBlock() === AIR`・`toolOf() === null`・
  `foodOf() === null`** / **`itemStackLimit(EGG) === 16`**（バケツの 1 と同じ測り方）
  —— **ラベルの「15 個（128 まで）」も数え直すこと。ゆるめないこと**

## 7. このタスク固有の禁じ手

1. **`kind === "chicken"` と書かないこと**（`shearing` / `ranged` / `orbit` と同じ作法。
   表 1 本で済ませる —— 産むモブが増えるたびに `update()` の中に分岐が生えます）
2. **`Mob.layTimer` を保存しないこと**（`woolTimer` と同じ。`storage.ts` は 0 行）
3. **卵を食べ物・道具・置けるアイテムにしないこと**（**投げるのは 7c-2**。
   `projectiles.ts` の `PROJECTILE_KINDS` に 1 行も足さないこと）
4. **`MobDef.drop` / `dropsFor()` / `dropFor()` を 1 行も書き換えないこと**
   （産卵は「倒したときに何が出るか」とは別の話です）
5. **音を足さないこと**（`sfx.ts` も `audio.ts` も 0 行。`onSound` を鳴らさない）
6. **`lay()` を判断（5Hz の `think()`）の中に置かないこと** —— 遠くて動かない個体で
   時計が進まなくなります（`woolTimer` を毎フレーム減らしているのと同じ理由）
7. **テストの判定をゆるめないこと** / **取る ID は 129 の 1 つだけ**

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2858 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` に「**卵（AUTODEV 18）**」の節を 1 つ（**300〜600 秒は本家の値だが、
モブは 72m でデスポーンし保存もされないので、実際にはほとんど産まないかもしれない**ことと、
**スタック 16**）/ `ROADMAP.md` の予約表に 129 の行を足して「**実装済み**」にし、**予備を
130..255 に直す**（161 行あたりの「アイテム ID は 129 から」も 130 からに）/
**C-3: `npm run build` → `(npx --no-install http-server dist -p 8080 --silent &)` →
`node tools/browsershot.mjs` を撮り、`Read` で開いて console のエラー 0 件と
`inventory.png` が壊れていないことを自分の目で見る**（**撮っただけでは確かめたことに
なりません**。写った不具合は直す。**クリエイティブの一覧の末尾に卵が出ているところも
撮ること** —— 手順は `docs/browser-shots/README.md` の 14 枚目）/
`AUTODEV-QUEUE.md` の 7c-1 を消す / 仕様書を `済` に / `HANDOFF.md` を書き直す。
