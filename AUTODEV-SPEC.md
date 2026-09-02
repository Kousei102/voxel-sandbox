# 仕様: シアーズ（羊を刈る）

状態: 済
差し戻し: 0 回

**`AUTODEV-QUEUE.md` の先頭「5. ハサミ」を 2 件に割った前半**（`AUTODEV.md` の B）。
**数え直し済み**: `shears` / `ハサミ` は `src/**` にも `test/**` にも 1 件もありません。

## 1. 何を足すか / 完了の判定

**シアーズ（アイテム 115）。** 鉄 2 個の斜めで作れて、**羊に右クリックすると羊毛が 1〜3 個 出て、
その羊はしばらく刈られた状態になります**（倒さずに羊毛が取れる。本家と同じ）。**刈られた羊を
倒しても羊毛は落ちません**（刈ってから倒す二重取りを塞ぐ）。60 秒で戻ります。

完了の判定 —— **`npm test` に次が増えて、全部緑**:

- 「アイテム 83 種（78 → 82 → 83）/ `MAX_ITEM_ID` 115 / **111..255 の空き 140**（141 → 140）」
- 「羊を刈ると羊毛が 1〜3 個出る」「2 回目は刈れない」「**刈られた羊を倒しても
  羊毛が落ちない**」「60 秒でまた刈れる」「豚・ゾンビは刈れない」
- 「シアーズは 238 回で尽きる」「**掘っても殴っても減らない**」

## 2. 触るファイル / 触らないファイル

| 触る | 何を |
| --- | --- |
| `items.ts` | ID 115・`isShears()` |
| `durability.ts` | `SHEARS_USES` を `usedUp()` に 3 本目として |
| `crafting.ts` | レシピ 1 行 |
| `mobs.ts` | `MobDef.shearing` の表・`Mob.woolTimer`・`canShear()` / `shear()`・`dropFor()` |
| `use.ts` | `UseFacts.shearable` と `{kind:"shear"}` |
| `controls.ts` | `mobIsNearer()` を出すだけ |
| `main.ts` | **配線だけ（+20 行以内**。いま 1400 / 上限 1500） |

**1 行も書かないこと**: `mobmesh.ts` / `mobrender.ts`（見た目は割った残り）/ `sfx.ts` / `audio.ts`
（新しい音を足さない）/ `blocks.ts`（羊毛 `WOOL` = 37 はもうある）/ `drops.ts` / `inventory.ts` /
`session.ts` / `storage.ts`（**セーブは 1 バイトも増えません**）。

## 3. 使う ID

**115 を 1 個だけ**（`ROADMAP.md` の予約表「115..255 予備」の先頭。111..114 は剣）。
**ブロックは 1 個も取らず、95..110 は空けたまま。**

## 4. 判断をどこに置くか

| 判断 | 置き場 |
| --- | --- |
| 何回で尽きるか・いつ減るか | `durability.ts`（`.claude/rules/items-survival.md` の「減り方は 3 種類」の**使って減るもの**） |
| どれがシアーズか | `items.ts` の `isShears()`（`isFireStarter()` / `isBow()` と同じ**表 1 本**） |
| 誰が刈れるか・何個出るか・いつ戻るか | `mobs.ts` の表（`MobDef.shearing`） |
| 右クリックがどこへ行くか | `use.ts` の `decideUse()` |
| 手前がモブかブロックか | `controls.ts`（左クリックの「殴る」と**同じ 1 本**） |

**新しい「確かめられないもの」は 1 つも足しません**（`unverifiable-pair` は不要。禁じ手 1・2）。

## 5. 実装の要点（この順で。`add-block` スキルの手順に乗る）

1. `items.ts`: `export const SHEARS = 115;` / `MAX_ITEM_ID = SHEARS` /
   `item({ id: SHEARS, name: "シアーズ", block: AIR, stack: 1, color: 0xa8b8c0, tool: null })` /
   `isShears()`。**`tool:` を持たせないこと**（禁じ手 1）
2. `durability.ts`: `SHEARS_USES = 238`（本家のまま）を `usedUp()` に 3 本目として足す
3. `crafting.ts`: `{ name: "シアーズ", out: SHEARS, count: 1, shape: [".I", "I."], key: { I: IRON_INGOT } }`
4. `mobs.ts`:
   - `interface ShearRule { item; min; max; regrow }` と `MobDef.shearing: ShearRule | null`。
     羊だけ `{ item: WOOL, min: 1, max: 3, regrow: 60 }`、**ほかは全部 `null`**
     （`kind === "sheep"` と書かないこと。`MobDef.ranged` / `teleport` と同じ作法）
   - `Mob.woolTimer`（0 なら刈れる / > 0 なら刈られている。**保存しません**）
   - `canShear(mob)` と `shear(mob, ctx, random?)`。刈れたら `onDrop(item, n, mob の位置 3 つ)` と
     `onSound("dig", def.voice)`、`woolTimer = regrow`。刈れなければ **false**（呼ぶ側が減らさない）
   - **倒したときのドロップは `dropFor(mob, def)` 1 本に通すこと** —— いま `def.drop` を直に読むのは
     `attack()` と `hitByProjectile()` の**2 か所**で、片方だけ直すと**弓で撃ったときだけ
     刈った羊から羊毛が出ます**（`rollDrop()` を 1 か所に集めたのと同じ話）
   - `woolTimer` は `step()` の `hurtTimer` の隣で減らす（毎フレーム・`dt`）
5. `controls.ts`: `mobIsNearer(facts: ClickFacts): boolean` を出す。**`decideClick()` の button 0 も
   これを呼ぶこと**（式を 2 か所に書かない）。`main.ts` が右クリックでも同じ規則を使う
6. `use.ts`: `UseFacts.shearable` / `UseAction` に `{ kind: "shear" }` / `decideUse()` の
   **先頭（器より前）** に `if (facts.shearable && isShears(held)) …`（手前に居るときだけ真）
7. `main.ts`: `mousedown` の `facts` を `const` に出し、`act === "use"` で
   `useOrPlace(mobIsNearer(facts) ? target : null)`。`useOrPlace()` は
   `shearable: m !== null && mobs.canShear(m.mob)` を渡し、`case "shear"` で
   **`mobs.shear()` が true のときだけ** `wearHeld(wearForUse(...))` と `hud.refresh()`

## 6. 書くテスト

**値を出力してから判定すること**（`.claude/rules/testing.md`）。

- `test/items.test.ts` / `test/blocks.test.ts`: アイテム 83 種・空き 140（**出力を読むこと**）
- `test/crafting.test.ts`: 鉄 2 個の斜めで 1 個。既存の「同じ形のレシピが重複していない」に乗る
- `test/durability.test.ts`: `maxUses` 238 / `wearForUse` 1 / `wearForBreaking(STONE, …)` 0 /
  `wearForAttack` 0 / `durability.ts` にアイテム名が出てこない見張りは**そのまま** /
  **`main.ts` の `wearForUse(` を 2 → 3 に直すこと**（ゆるめるのではなく増やす）
- `test/mobs.test.ts`: 上の 5 項目。**乱数は種を固定した 1 本を回し続けること**、
  1 個と 3 個の両端は `random` を直に渡して出す
- `test/use.test.ts`: シアーズ + 刈れるモブ → `shear` / シアーズだけ → 今までどおり /
  別のアイテム + 刈れるモブ → 今までどおり（`place` も `eat` も奪わない）
- `test/controls.test.ts`: `mobIsNearer()` の 3 通り（モブが手前 / ブロックが手前 / どちらも無い）

## 7. このタスク固有の禁じ手

1. **`ToolKind` に `"shears"` を足さないこと。** `mobs.ts` の `TOOL_ATTACK` に無い種類が入ると
   `attackDamage()` が **NaN** を返し（`TOOL_ATTACK[kind]` が `undefined`）、`wearForBreaking()` は
   「掘る道具」として 1 を返すので**石を掘るたびに減ります。** 火種・弓と同じ「使って減るもの」です
2. **新しい `Sfx` を足さないこと**（音は確かめられない側。既にある `"dig"` を鳴らす）
3. **羊の見た目を変えないこと**（下の「割った残り」）
4. **`MobDef.drop` の表を書き換えないこと**（倒したときの羊毛 1 個はそのまま。抑えるのは `dropFor()`）
5. **`main.ts` に `isShears(` と距離の比較を書かないこと**（`test/use.test.ts` が `isBucket(` などを
   見張っているのと同じ理由）
6. **セーブにキーを足さないこと**（`version` は 1 のまま。刈られた状態はモブの持ち物で、保存しません）
7. 既存の ID を振り直さない / **テストの判定をゆるめない**

## 8. 終了条件

`npm run typecheck` と `npm test` が緑 / `npm run build` / **コミット 1 つ** / `TUNING.md` に
1 行（羊毛 1〜3 個・戻るまで 60 秒・238 回）/ `ROADMAP.md` の予約表に **115 を「実装済み」** /
クリエイティブ一覧が 1 枠増えるので **C-3 の撮影**（`node tools/browsershot.mjs` → `Read` で見る）。

## 割った残り

**「刈られた羊が見て分かること」は別の周**（`AUTODEV-QUEUE.md` の 11 番）。`mobrender.ts` は
形を `MobKind` ごとに 1 つ作って使い回すので、2 つ目の形と差し替えの仕掛けが要ります。
