# 仕様: クモの巣（キューの 23）

状態: 済
差し戻し: 0 回

**自然生成はこの周では 1 マスもしません**（要塞や廃坑に湧かせる話は別の周）。

## 1. 何を足すか と 完了の判定

**クモの巣（ブロック 154）。中に居ると動きが鈍り、剣かシアーズで壊すと糸（133）が 1 個。**

`npm test` が緑のまま（いま **3250 件**）、次の 6 つが**値を出してから**増えていること:

- `isSticky()` が真なのは**クモの巣だけ**（石・草むら・はしご・サボテン・水は偽）
- `isBladed()` が真なのも**クモの巣だけ**。**`tool: "sword"` を要求するブロックは 0 個のまま**
- **刃物なら糸 1 個・そうでなければ何も落ちない** —— `canHarvest(COBWEB, 木の剣)` と
  `canHarvest(COBWEB, シアーズ)` が真、素手・ツルハシ・斧が偽
- **壊す時間**が刃物 1.8 秒 / 素手 6.0 秒（`breakTime()` を 4 通り出してから）
- **中に居ると横が 1/4・落ちる速さが 1.0 m/s 止まり**（`player.ts` を 1 秒ぶん回して実測）
- **絡まっているあいだは落ちたぶんが積まれない** —— `clinging` が真のフレームでは
  `Vitals` の落下ダメージが 0（はしごと同じ扱い）

## 2. 触るファイル / 触らないファイル

| ファイル | 何を足すか |
| --- | --- |
| `src/blocks.ts` | `COBWEB = 154` / `def()` 1 つ / `sticky` と `bladed` の 2 旗 / `isSticky()` / `isBladed()` |
| `src/items.ts` | `MAX_ITEM_ID` を `COBWEB` へ / `DROPS` に 1 行 / `isBlade()` |
| `src/mining.ts` | `canHarvest()` に**刃物の 1 行** |
| `src/player.ts` | `inCobweb` / `clinging` / 速さの 2 定数 / `updateWalk()` の 2 か所 |
| `src/vitals.ts` | `VitalsContext.onLadder` を **`clinging` に改名**（中身は 1 文字も変えない） |
| `src/main.ts` | **±0 行。`onLadder: player.onLadder,` を `clinging: player.clinging,` に書き換えるだけ** |
| `test/blocks.test.ts` / `test/mining.test.ts` / `test/physics.test.ts` / `test/vitals.test.ts` / `test/mobs.test.ts` | 下の（5） |

**触らないファイル**: `src/stronghold.ts` / `src/worldgen.ts` / `src/fortress.ts`（自然生成は
別の周）/ `src/crafting.ts`（**レシピは足さない**。本家に無い）/ `src/mobs.ts` /
`src/durability.ts` / `src/inventory.ts` / `src/sfx.ts` / `src/mesher.ts` / `src/ui.ts`。

**先に読む決まりごと（層 2。渡された側は全文を読むこと）**: `rules/blocks-shapes.md`・
`rules/items-survival.md`・`rules/vitals.md`・`rules/mobs.md`・`rules/drops.md`・`rules/testing.md`。

## 3. 使う ID

**ブロック 154 を 1 つだけ。** `ROADMAP.md` の予約表の「次に取るのは 154」がその根拠です。
**アイテム 154 は `items.ts` の `for (const block of BLOCKS)` が勝手に作ります**
（`variantOf` が `AIR` なので。本棚・サトウキビと同じ）。**だから `MAX_ITEM_ID` を
`COBWEB` へ伸ばすのだけは手作業**で、`item({ id: COBWEB ... })` は書かないこと。
この周のあと **111..255 の空きは 101**、共有帯のアイテムは **38 個**です。

## 4. 判断をどこに置くか

**新しく「確かめられないもの」は 1 つも増えません**（`unverifiable-pair` は要りません）。
判断は 4 か所に割れます。**このとおりに割ること:**

- **どのブロックが絡むか → `blocks.ts` の `sticky`（表 1 本・`isSticky()`）。**
  `spiky` / `climbable` をそのまま写した形にすること。**どれだけ鈍るかは持たせない**
- **どのブロックが刃物でだけ落ちるか → `blocks.ts` の `bladed`（表 1 本・`isBladed()`）。**
  **`BlockDef.tool` に `"sword"` と書かないこと**（書くと剣が採掘道具になります）
- **何が刃物か → `items.ts` の `isBlade(item)`** = `isSword(item) || isShears(item)`
  （**どちらも既にあります**。`item === SHEARS` と書かないこと）。`canHarvest()` は
  `isBreakable()` の直後（`blockTool()` の帯より前）に
  **`if (isBladed(blockId)) return isBlade(itemId);`** の 1 行を置くだけ。
  **`toolSpeed()` は 1 文字も触らないこと**
- **どれだけ鈍るか → `player.ts` の 2 定数**（`vitals.ts` も `blocks.ts` の数値も見ない）:
  `COBWEB_SPEED_SCALE = 0.25` / `COBWEB_FALL_SPEED = 1.0`（m/s）

`player.ts` の形（`onLadder` を写すこと）:

- `inCobweb` は**押し戻したあとで** `bodyTouches(world, this.position, PLAYER_SIZE, isSticky)`
- `updateWalk()` の `speed` に `* (this.inCobweb ? COBWEB_SPEED_SCALE : 1)` を掛ける
- **液体／はしご／重力の if-else の「あと」**で
  `this.velocity.y = Math.max(-COBWEB_FALL_SPEED, Math.min(COBWEB_FALL_SPEED, this.velocity.y))`。
  **前に置かないこと** —— 重力に上書きされて落下が止まりません。**`updateFly()` は触らない**
- `get clinging(): boolean { return this.onLadder || this.inCobweb; }`
  —— **「落ちたぶんを積まないのはどれか」の判断はここ 1 か所**。`main.ts` にも
  `vitals.ts` にも `inCobweb` の文字を出さないこと

ブロックの値（本家のまま。硬さだけ下の（6））: 色 `0xc8c8dc`（いちばん近い既存の
アイテムは鉄インゴットで **27.5** 離れています）/ `opaque: false` / `solid: false` /
`hardness: 1.2` / `sound: "wool"` / `model: "cross"` / `boxes: CROSS_BOX` /
`supportFace` は既定（`NO_SUPPORT`。**宙に浮いてよい**）/ `replaceable` は付けない。

## 5. 書くテスト

**値を `console.log` で出してから判定すること**（`rules/testing.md`）。

- `test/blocks.test.ts`: 上の（1）の 1〜4 行目 / **色が既存のどのアイテムとも RGB で
  20 以上**（`dist()` の既存の形を写す）/ **数を数えている判定は数え直すこと**（共有帯の
  アイテム **38 個**・`MAX_ITEM_ID === COBWEB`・非立方体 **77**）。
  **「37 個」を「37 個以上」に書き換えて通さないこと**
- `test/mining.test.ts`: `canHarvest()` と `breakTime()` を**道具 5 通り × 2 ブロック**の表で
- `test/physics.test.ts`: はしごの節（`player.onLadder`）を写して、**巣のマスへ歩いて入ると
  `inCobweb` が真** / **横の速さが巣の外の 1/4 付近** / **落ちる速さが 1.0 m/s 止まり**
  （巣を通り抜けない厚みで積むこと）/ **隣のマスでは偽**
- `test/vitals.test.ts` と `test/mobs.test.ts`: `onLadder:` と書いてある
  `VitalsContext` の 3 か所を `clinging:` に直し、**`clinging: true` で落下 0** を残すこと
- **既存の判定を 1 つもゆるめないこと** —— とくに `test/physics.test.ts` のはしごの
  2.35 / 3.0 m/s と `test/blocks.test.ts` の「`sword` を要求するブロックが 0 個」

## 6. この周の禁じ手

- **`src/main.ts` の行数を 1 行も増やさないこと。** 直すのは `updateVitals()` に渡す
  1 行の**名前だけ**（`onLadder: player.onLadder,` → `clinging: player.clinging,`）。
  **`||` も条件も `main.ts` に書かないこと**（判断は `player.ts` の `clinging`）
- **`BlockDef.tool` に `"sword"` を書かない**・**`ToolKind` を増やさない**
  （シアーズと種で 2 度踏んでいる罠。`items.ts` のコメント）
- **自然生成もレシピも足さないこと**（本家にレシピは無く、手に入るのは一覧からです）
- **`DROPS` の既存の行を 1 行も書き換えないこと**（足すのは `[COBWEB, ...]` の 1 行）
- **`SaveData` に手を出さないこと**（`version` は 1 のまま。1 バイトも増えません）
- **`sticky` と `bladed` を 1 つの旗にまとめないこと**（氷やツタは片方だけ要ります）

## 7. 終了条件

`npm run typecheck` と `npm test` が緑（**3250 件から増えていること**）/ `npm run build` が
通る / **コミット 1 つ**で `master` へ push / **見た目に出るので撮って自分の目で見ること**
（`node tools/browsershot.mjs` と `npm run shot -- terrain`。**撮ったら `Read` で開く**）/
`TUNING.md` に 1 行（**本家は硬さ 4.0 + 剣が 15 倍で「素手 20 秒 / 剣 0.4 秒」。ここは
剣の掘る速さが 1 のままなので比を作れず、硬さ 1.2 に均して「素手 6.0 秒 / 刃物 1.8 秒」**）/
`AUTODEV-QUEUE.md` の 23 の行を消し、このファイルの `状態:` を `済` にする。
