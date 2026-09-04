# 仕様: 牛（4 種類目の受動モブ）と生牛肉・ステーキ・革

状態: 済
差し戻し: 0 回

**キューの 8 番。数え直し済み**（2026-09-04・コードが根拠）: `src/**` と `test/**` に
`cow` / `beef` / `leather` / `牛` / `革` は **1 つもなく**、`MobKind` は **7 語**・`PASSIVE_KINDS`
は **3 語**。実装前: **2906 件緑** / **111..255 の空き 126** / `MAX_ITEM_ID` 129 / `main.ts` 1463 行。

## 1. 何を足すか / 完了の判定

**草地に牛が湧いて、倒すと生牛肉 1 個と革 1 個が落ち、かまどで生牛肉を焼くとステーキになる。**
**鶏（AUTODEV 16）とまったく同じ形**で、違うのは **2 山目（`MobDrop.extra`。AUTODEV 17）が
最初から付く**ところだけ。**革の使い道はまだありません**（防具も本も無い ＝ 別件）。
完了の判定 —— **`npm test` に次が増えて全部緑**（**2906 件から減らさないこと**）:

- 「**受動モブが 4 種類**」「昼の草地に**牛が湧く**」「湧くのは受動 4 種だけ（敵対が混じらない）」
- 「牛を**殴って倒すと 2 山**（生牛肉 1 + 革 1）」「**撃って倒しても同じ 2 山**」（並べて測る）
- 「**生牛肉 → ステーキ**（`SMELTING` の表を出力してから）」
- 「生牛肉・ステーキは**置けず・道具でもなく・食べられる**」「**革は食べ物でない**」
- 「共有帯のアイテムが **19 個・132 まで**」「**111..255 の空きが 123**」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/items.ts` | 定数 **3 つ**（130 / 131 / 132）+ `MAX_ITEM_ID` の差し替え + `item({...})` **3 行** + `FOODS` **2 行**（革は入れない） |
| `src/mobs.ts` | `MobKind` に **`"cow"` 1 語** + `COW` の `MobDef` **1 つ** + `MOBS` / `MOB_KINDS` / `PASSIVE_KINDS` に **1 語ずつ** |
| `src/smelting.ts` | `SMELTING` に **1 行**（`[RAW_BEEF, { out: STEAK, count: 1 }]`）と import 2 語 |
| `test/mobs.test.ts` / `test/blocks.test.ts` / `test/smelting.test.ts` | 下の 6 |
| `TUNING.md` / `ROADMAP.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | 下の 8 |

**1 行も書かないこと**: `main.ts`（**1463 行。触れば停止条件 3 番に当たります**）/
`mobmesh.ts` / `mobrender.ts`（**モブを 1 種類足すのに 0 行**。`rules/mobs.md`）/ `drops.ts` /
`use.ts` / `vitals.ts` / `crafting.ts` / `blocks.ts` / `storage.ts` / `craftscreen.ts` /
`inventoryui.ts` / `durability.ts` / `.claude/**`。

## 3. 使う ID

**3 個。`ROADMAP.md` の予約表の「130..255 予備」から上から詰めて取ること**:
**130 = 生牛肉 / 131 = ステーキ / 132 = 革**（生と焼きを隣に置く。126 / 127 と同じ並べ方）。
**`MAX_ITEM_ID` は 129 → 132**、**111..255 の空きは 126 → 123**、アイテムは **94 → 97 種**。
**`SaveData.version` は 1 のまま・キーも増えません**（**モブは保存しない**。`rules/mobs.md`）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| 体力・速さ・湧きの重み・形・声 | `mobs.ts` の `COW`（`MobDef` 1 つ） |
| **何を落とすか（2 山）** | `COW.drop` の `item` と `extra`（`dropsFor()` が両方引く） |
| 焼くと何になるか | `smelting.ts` の `SMELTING` 1 行 |
| 食べると何が戻るか | `items.ts` の `FOODS` 2 行 |

**確かめられないものは 0 です** —— `buildMobMesh()` も `MobRenderer` も種類の名前を知らない
ので **`unverifiable-pair` は要りません**（`rules/mobs.md`）。**使うスキルは `add-block` だけ。**

## 5. 実装の要点（この順で）

1. `items.ts`: `RAW_BEEF = 130` / `STEAK = 131` / `LEATHER = 132`、`MAX_ITEM_ID = LEATHER`。
   `item({...})` は **`block: AIR` / `tool: null` / `stack: MAX_STACK`**（**`tool:` を持たせない**
   —— `TOOL_ATTACK` に無い種類が入って **NaN** が黙って通ります）。色は
   **生牛肉 `0xc8564f` / ステーキ `0x8f5230` / 革 `0xa06a41`**（豚 `0xe08f8f` / `0xc4763f`・
   鶏 `0xd3a08e` / `0xc98a4b` と**並べて違って見えること**。`TUNING.md`）
2. `items.ts` の `FOODS`: **生牛肉 空腹 +3 / 満腹度 +1.8**、**ステーキ 空腹 +8 / 満腹度 +12.8**
   （どちらも本家の値）。**焼き豚と同点で並びます** —— 本家がそうなので下げないこと。
   **革は `FOODS` に入れないこと**（羽根と同じ扱い）
3. `smelting.ts`: `SMELTING` に 1 行。**`FUEL` は 1 行も触らない**
4. `mobs.ts`: `MobKind` に `"cow"`、`MOBS` / `MOB_KINDS` / `PASSIVE_KINDS` に 1 語ずつ
   （**`PASSIVE_KINDS` を忘れると、表にあるのに 1 体も湧かない牛が黙って残ります**）。
   `COW` の値 —— **`size: { half: 0.45, height: 1.4, step: 0.5 }` / `maxHealth: 10` /
   `speed: 1.4` / `spawnWeight: 8` / `voice: 0.9` / `hostile: false` / `damage: 0`**、
   **`ranged` / `teleport` / `spawnOn` / `orbit` / `phases` / `shearing` / `laying` は `null`**、
   **`flying` / `fireproof` / `boss` は false・`hover` / `regen` は 0**、
   **`drop: { item: RAW_BEEF, count: 1, chance: 1, extra: { item: LEATHER, count: 1, chance: 1 } }`**
5. 形（`groups` / `boxes`）: **豚・羊と同じ骨組み**（0 = 体（`fixed`）/ 1 = 頭（`head`）/
   2..5 = 脚（`swing`））。**振る部位の箱は `y1 === 0`**。**当たり判定に全部収めること**
   —— **胴は前後 ±7.2px・横 ±7.2px・高さ 22.4px 以内**に削ること（豚の 18px の胴は
   入りません）。**`longBody` の例外は豚と羊だけで、そこへ牛を足さない**（下の 7-3）。
   **角と鼻は体と違う色にして輪郭を外へ出すこと** —— 鶏の翼が白い体に埋まって
   1 画素も動かなかったのと同じ罠です（`rules/mobs.md`）

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/mobs.test.ts`:
  - **`census()` の `counts` に `牛: 0` を足し、`show()` にも足すこと** —— **忘れると
    `counts[name]++` が `NaN` になり、数えているつもりで緑になります**（`rules/mobs.md`）
  - **昼の草地に牛が湧く** / **受動が 4 種類**（`MOB_KINDS.filter((k) => !MOBS[k].hostile)` から数える）
  - **殴って倒したときと撃って倒したときを並べて**、どちらも **2 山（生牛肉 1 + 革 1）**
    （片方だけ直すと弓のときだけ 2 山目が出ない形が戻ります。`rules/mobs.md`）
- `test/blocks.test.ts`: **共有帯の一覧の判定を「19 個・132 まで」に数え直す**（**ゆるめる
  のではなく数え直す**。`sharedItems[16..18]` を突き合わせる）/ **生牛肉・ステーキ・革を
  並べて `block === AIR` / `tool === null`**、**`foodOf(革) === null`**（羽根と同じ行に足す）
- `test/smelting.test.ts`: **`SMELTING` の表を全部出力してから**「生牛肉 → ステーキ 1 個」/
  **`FUEL` に 1 行も増えていない**

## 7. このタスク固有の禁じ手

1. **革に使い道を足さないこと**（防具も本も別件。レシピを 1 本も書かない ＝ `crafting.ts` 0 行）
2. **既存のドロップ表・`FOODS` の既存行・`FUEL` を書き換えないこと**（足すだけ）
3. **`longBody` に `"cow"` を足さないこと / `size` を広げないこと** —— 形のほうを削る
4. **`extra` に個数の範囲（min / max）を持たせないこと** —— 本家の革 0〜2 個は **1 個固定**（羽根と同じ線引き）
5. **`mobrender.ts` / `mobmesh.ts` / `main.ts` を 1 行も触らないこと**
6. **`spawnOn` を付けないこと**（受動に付けると `trySpawn()` 側にも手が要ります）
7. **テストの判定をゆるめないこと**（とくに `test/blocks.test.ts` の共有帯の一覧と
   `test/progression.test.ts` の 13 / 13）

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2906 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` に「**牛（AUTODEV 20）**」の節を 1 つ（**速さ 1.4・重み 8・
声 0.9・革 1 個固定・革に使い道が無いこと**）/ `ROADMAP.md` の予約表に **130 / 131 / 132 を
「実装済み」で足す**（予備は **133..255**）/ **C-3: `npm run build` →
`(npx --no-install http-server dist -p 8080 --silent &)` → `node tools/browsershot.mjs` と
`npm run shot -- mobs` を撮り、`Read` で開いて**牛の形（角・鼻・脚が体に埋まっていないか）と
console のエラー 0 件を自分の目で見る**（**撮っただけでは確かめたことになりません**。
写った不具合はこの周で直す）/ 8 番を `AUTODEV-QUEUE.md` から消す / 仕様書を `済` に /
**踏んだ落とし穴を `rules/` へ `Edit` で据える**（無ければ「決まりごと 0 件」と書く）/
`HANDOFF.md` を丸ごと書き直す。
