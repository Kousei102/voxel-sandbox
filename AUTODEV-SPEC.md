# 仕様: 羽根（鶏の 2 山目）と、矢を本家の形へ

状態: 未着手
差し戻し: 0 回

**キューの 7b**（7 を 3 件に割った 2 つ目。3 つ目の「卵」はキューに残します）。
**数え直し済み**（2026-09-03・コードが根拠）: `items.ts` に `FEATHER` の名は**1 つも無く**、
矢は `shape: ["F", "S"]`（火打石 + 棒で 4 本・**2x2 で作れる**）。`MobDrop` は
`{ item, count, chance }` だけで**2 山目がありません**。`dropFor()` は `MobDrop | null` を返し、
呼ぶのは **`attack()`(2311) と `hitByProjectile()`(2077) の 2 か所**で、**どちらも `chance` の
比較を自前で書いています**。実装前: **2852 件緑** / `main.ts` **1450 行** / **111..255 の空き
128** / `MAX_ITEM_ID` 127 / 共有帯 14 個 / モブ 7 種類。

## 1. 何を足すか / 完了の判定

**鶏を倒すと生鶏肉 1 個 + 羽根 1 個の 2 山が落ち、矢が「火打石 + 棒 + 羽根」で 4 本になる**
（本家の形。**3 段なので作業台が要ります**）。完了の判定 —— **`npm test` に次が増えて全部緑**（2852 件から減らさないこと）:

- 「鶏を倒すと 2 山（生鶏肉 1・羽根 1）」を**殴った側と撃った側を並べて** /
  「豚は 1 山・刈っていない羊は 1 山・**刈った羊は 0 山**」（`dropFor()` の抑えが残っている）
- 「矢は火打石 + 棒 + 羽根で 4 本」「**2x2 では作れない**」「**羽根を抜くと作れない**」
- 「共有帯のアイテムが **15 個**（128 まで）」「`MAX_ITEM_ID` が 128」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `src/mobs.ts` | `MobDropStack` を切り出して `MobDrop` に `extra?` / `CHICKEN.drop` に `extra` 1 行 / **`dropsFor()` を新設** / `attack()` と `hitByProjectile()` の 2 か所を差し替え / `import` に `FEATHER` |
| `src/items.ts` | `FEATHER = 128` / `MAX_ITEM_ID` の差し替え / `item({...})` 1 行 |
| `src/crafting.ts` | 矢の 1 行とコメント（`import` に `FEATHER`） |
| `test/mobs.test.ts` / `test/blocks.test.ts` / `test/crafting.test.ts` | 下の 6 |
| `TUNING.md` / `ROADMAP.md` / `AUTODEV-QUEUE.md` / `docs/autodev-log.md` / `HANDOFF.md` | 下の 8 |

**1 行も書かないこと**: **`main.ts`（1450 行 = 停止条件ちょうど。この周も 0 行）** —— `onDrop`
は**山ごとに 1 回鳴るだけ**で、受け口の配線はもう通っています / `mobmesh.ts` / `mobrender.ts` /
`drops.ts` / `breaking.ts` / **`items.ts` の `Drop` と `rollDrop()` / `rollDrops()`**
（**ブロック側の 2 山は別の話**。あちらは乱数が `roll` 1 本しか流れてこないので `extra` に確率を
持てません）/ `vitals.ts` / `use.ts` / `bow.ts` / `projectiles.ts` / `storage.ts` /
`craftscreen.ts` / `.claude/**`（**セーブは 1 バイトも増えません**）。

## 3. 使う ID

**アイテム 1 個: `FEATHER = 128`**（`ROADMAP.md` の予約表の「128..255 予備」の先頭）。
**ブロックは 0 個**（羽根は置けません）。取ったあと `111..255 の空き` は **128 → 127**
（`npm test` の出力で確かめること）。`MAX_ITEM_ID` は **127 → 128**。**`SaveData.version` は 1 のまま**（キーも増えません）。

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| **2 山目を持つかどうか** | `MobDrop.extra`（`mobs.ts` の表。`items.ts` の `Drop.extra` と同じ名前・同じ意味） |
| **何山落ちるか（確率の比較を含む）** | **`dropsFor(mob, def, random)` の 1 本**。**呼ぶ側に `chance` の比較を残さないこと** |
| 刈った羊が羊毛を落とさないこと | **`dropFor()` のまま**（`dropsFor()` は 1 山目をこれに作らせる） |
| 羽根という物 | `items.ts` の `item({...})` 1 行（**食べ物でも道具でもない**） |
| 矢の材料 | `crafting.ts` の `RECIPES` 1 行 |

**新しい「確かめられないもの」は 0 なので `unverifiable-pair` は不要**（描画も音も増えません）。**使うスキルは `add-block`。**

## 5. 実装の要点（この順で）

1. `items.ts`: 焼き鳥(127) の下に **`FEATHER = 128`**、`MAX_ITEM_ID` を `FEATHER` に差し替え。
   `item({ id: FEATHER, name: "羽根", block: AIR, stack: MAX_STACK, tool: null, color: 0xe8e4dc })` —— **`FOODS` にも `SMELTING` にも足さない**（`tool: null` は `TOOL_ATTACK` の NaN 除け）
2. `mobs.ts`: `MobDrop` を 2 つに割る（**既存 7 つの `drop:` は 1 行も書き換わりません**）:
   ```ts
   export interface MobDropStack { readonly item: number; readonly count: number; readonly chance: number }
   export interface MobDrop extends MobDropStack { readonly extra?: MobDropStack }
   ```
3. `CHICKEN.drop` に **`extra: { item: FEATHER, count: 1, chance: 1 }`** を足す（1 行）。**`mobs.ts` には既に色の定数 `CHICKEN_FEATHER`(0xf0f0f0) があります** —— 別物なので混ぜないこと
4. `dropFor()` の下に **`dropsFor(mob, def, random): readonly { item, count }[]`** を新設
   （`item !== NO_ITEM` かつ `count > 0` の山だけ返す。0〜2 山）:
   - **1 山目は `dropFor()` を呼んで作ること**（刈った羊の抑えを 2 か所に写さない）
   - **`chance >= 1 || random() < chance` の形をそのまま使うこと** —— **`chance` が 1 の山では
     乱数を引きません。** 引く形に変えると、**種を固定した既存テストの目がずれて関係ない所が
     赤くなります**
   - **2 山目は 1 山目の当たり外れと無関係に、別に引くこと**（外れても落ちる。`Drop.extra` と同じ）
5. `attack()` と `hitByProjectile()` は **`for (const s of dropsFor(...)) this.onDrop?.(s.item,
   s.count, mob.position.x, mob.position.y, mob.position.z)`** に差し替え。**`dropFor()` は
   消さないこと**（`test/mobs.test.ts` の既存 6 か所の根拠。`rollDrop()` と同じ扱い）
6. `crafting.ts`: 矢を **`shape: ["F", "S", "E"], key: { F: FLINT, S: STICK, E: FEATHER }`** に
   （火打石が上・棒・羽根が下。**本家と同じ並び**）。コメントの「鶏がまだ居ない」を
   **「本家と同じ形。3 段なので作業台が要る」**へ書き直す
7. **`main.ts` は 0 行**

## 6. 書くテスト（**値を出力してから判定すること**。`rules/testing.md`）

- `test/mobs.test.ts`: **鶏を倒して落ちた山を全部出力してから**「2 山・生鶏肉 1・羽根 1」を判定。
  **殴った側（`attack()`）と撃った側（`hitByProjectile()`）を並べること**（片方だけ通っていると
  弓で撃ったときだけ羽根が出ません）/ 山数の表（豚 1・刈っていない羊 1・**刈った羊 0**・鶏 2）/
  **`dropFor()` の既存 3 件は消さない** / **「`chance` 1 の山では乱数を引かない」**を、
  引いた回数を数える乱数で出力してから判定
- `test/blocks.test.ts`: **`sharedItems.length === 15`** / `sharedItems[14] === FEATHER` /
  `MAX_ITEM_ID === FEATHER` / 羽根は **`placedBlock() === AIR`・`toolOf() === null`・
  `foodOf() === null`**（**ラベルの「14 個（127 まで）」も数え直すこと。ゆるめないこと**）
- `test/crafting.test.ts`: 3 段の盤面を出力してから「矢 4 本」を判定 / **2x2 では作れない** /
  **羽根を抜いた 2 段（火打石 + 棒）では作れない** / 既存の「同じ形のレシピが重複していない」が
  緑のまま（3 段 1 列はシャベル・剣と並びますが材料が違います）

## 7. このタスク固有の禁じ手

1. **`dropFor()` の名前・引数・戻り値を変えないこと**（`rollDrop()` とまったく同じ扱い）
2. **`MobDrop.extra` に min / max の範囲を持たせないこと。** 本家の羽根 0〜2 は**1 個固定**にします（範囲が要るなら `ShearRule` のような別の表の話で、この周の仕事ではありません）
3. **`attack()` / `hitByProjectile()` に `chance` の比較を残さないこと**（2 か所に散ると、撃ったときだけ羽根が出ない形が戻ります）
4. **既存の `MobDef.drop` 7 つを書き換えないこと** / **取る ID は 128 の 1 つだけ**
5. **`main.ts` / `drops.ts` / `breaking.ts` に「2 山を並べて置く」を書かないこと**
   （地面での散らばりは `drops.ts` の `burst()` の仕事。`rules/items-survival.md`）
6. **羽根を食べ物・道具・置けるアイテムにしないこと** / **テストの判定をゆるめないこと**

## 8. 終了条件

`npm run typecheck` と `npm test` が緑（**2852 件から増えていること**）/ `npm run build` /
**コミット 1 つ** / `TUNING.md` に「**羽根と矢（AUTODEV 17）**」の節を 1 つ（**羽根 1 個固定
（本家は 0〜2）**と、**矢が 2x2 で作れなくなること**）/ `ROADMAP.md` の予約表に 128 の行を
足して「**実装済み**」にし、**予備を 129..255 に直す**（`160` 行あたりの「アイテム ID は
128 から」も 129 からに）/ **C-3: `npm run build` → `(npx --no-install http-server dist
-p 8080 --silent &)` → `node tools/browsershot.mjs` を撮り、`Read` で開いて console の
エラー 0 件と `inventory.png` が壊れていないことを自分の目で見る**（**撮っただけでは
確かめたことになりません**。写った不具合は直す。**羽根の色が一覧で見分けられるかは
`HANDOFF.md` へ**）/ `AUTODEV-QUEUE.md` の 7b を消す / 仕様書を `済` に / `HANDOFF.md` を書き直す。
