# 仕様: 花 2 種（タンポポ・ポピー）— 平原と森に草むらと同じ形で生え、置いて飾るだけ（キューの 58・**ID 2 個**）

状態: 未着手
差し戻し: 0 回

**この 1 件だけコードで数え直しました**（2026-10-01・AUTODEV 150 の B）: **花は 1 本も無い**（`src/**` に `flower` / `DANDELION` / `POPPY` /
「タンポポ」「ポピー」が 0 件）。**形はまったく同じ前例がある**: 赤キノコ(139)・茶キノコ(140) —— `blocks.ts` 2066 行の
`def()` が草むら(32)の写しで、`worldgen.ts` 336〜347 行の生えものの連鎖 `tuft` に 1 段、`biomes.ts` の `BiomeDef.mushroom` に 1 列。
**床を選ぶ旗も既にある**: 苗木の `needsSoil: true`（土・草・耕地の上だけ。`supportHint()` が「土か草の上」を表から出す）。
**本家の値**: タンポポ・バラ（いまのポピー）は Alpha から。平原と森に生え、**土・草・耕地の上にだけ置ける**。掘ると自分が 1 個。

## 1. 何を足すか / 完了の判定

**ブロック 2 つ（= 同じ番号のアイテム 2 つ）・`BiomeDef` に 1 列・生えものの連鎖に 1 段・撮る場面 1 つ。** 染料は見送り済み（`AUTODEV-QUEUE.md`）なので**レシピ 0 本**。
**完了**: `npm test` に「花 2 種（58）」の件が **10〜16 件**増えて**すべて緑**（**4168 → 4178〜4184 あたり**）。
ブロック ID の枠の行は **「111..255 の空き 54」**（56 → 54）・1..63 の空き 7 のまま。`MAX_ITEM_ID` は **201**。

## 2. 触るファイル / 触らないファイル

**触る**:
- `src/blocks.ts`: `export const DANDELION = 200; export const POPPY = 201;` と JSDoc（キノコの 342 行の説明を写し、違いを書く）。
  `def()` 2 つは **`RED_MUSHROOM` の定義の写し + `needsSoil: true`**（`opaque: false / solid: false / replaceable: true / hardness: 0 /
  sound: "grass" / model: "cross" / boxes: CROSS_BOX / supportFace: FACE_YN`）。**`variantOf` を書かない**（for がアイテムを作り、掘ると自分が 1 個）
- `src/items.ts`: **`MAX_ITEM_ID` を `POPPY` に**（いまは `NETHER_BRICK_ITEM` = 199）。**`item()` は手で足さないこと**（二重登録）/ `DROPS` に 0 行
- `src/biomes.ts`: `BiomeDef` に `readonly flower: number;`（JSDoc に「連鎖の**いちばん後ろ**に引くので実効密度は `flower × (1 − 先のもの)`」）と、
  **`BIOMES` の 11 行すべてに `flower:` を 1 つずつ**。**平原 0.03・森 0.02・ほかは 0**
- `src/worldgen.ts`: `tuft` の連鎖の**草むらの後ろ（`AIR` の直前）**に 1 段:
  `sprouted && flower > 0 && hash2(wx, wz, this.seed ^ 0x1e47) < flower ? (hash2(wx, wz, this.seed ^ 0x58c3) < 0.5 ? DANDELION : POPPY) : AIR`
  と、分割代入に `flower`。**塩 2 本は新しい値**（いまの塩 25 本と重ならないことは B で grep 済み）。**`tall` は 1 のまま**（サトウキビだけが伸びる）
- `tools/shot.ts`: 場面 `flowers`（`mushrooms` の場面の写し。**黄と赤が両方写る所を探して立つ**。原点のまわりが平原なので ±72 で見つかるはず。
  見つからなければ探す範囲と `makeWorld` の半径を一緒に広げる —— 448 行のコメント）
- `test/blocks.test.ts` / `test/worldgen.test.ts` / `test/items.test.ts`（下の 5.）
- `ROADMAP.md` の予約表（200・201 を「実装済み」の 2 行に・**「200..255 予備 56 個」を「202..255 予備 54 個」に**・末尾の「次に取るのは」）/
  `TUNING.md`（下の 7.）/ `rules/worldgen.md`（下の 6.）

**触らない**: `src/main.ts` / `src/hands.ts` / `src/crops.ts`（**`isMushroom()` に花を足さない —— 花は広がらない**）/ `src/crafting.ts` / `src/smelting.ts` /
`src/mesher.ts` / `src/placing.ts` / `src/craftscreen.ts` / `src/inventoryui.ts` / `test/progression.test.ts`。**`.claude/**` には 1 行も書かないこと。**

## 3. 使う ID

**2 個: 200 = タンポポ / 201 = ポピー**（共有帯の次の空きから 2 つ。`ROADMAP.md` の予約表の `200..255` 行から取る）。
**ブロックとアイテムで同じ番号**（低帯のキノコ・苗木と同じ。for が作る）。**111 以降は 1 本の番号列** —— `items.ts` に 200・201 が無いことを grep で確かめてから取ること。

## 4. 判断をどのファイルに置くか

- **どこにどれだけ生えるか** → `biomes.ts` の `BiomeDef.flower`（**`worldgen.ts` に数値やバイオーム名を書かないこと**。`rules/worldgen.md` の頭）
- **何の上に立てるか** → `blocks.ts` の `needsSoil` の表（`supportsBlock()` の 1 行が効く。**`id === DANDELION` の分岐を書かないこと**）
- **掘ると何が落ちるか** → `dropOf()` の既定（自分）。`DROPS` に行を足さない
- 新しい確かめられないものは無し（`cross` の板は既存のメッシュ化の道をそのまま通る）。**使えるスキル**: `add-block`（ID の取り方・`MAX_ITEM_ID`・一覧に出るまで）
- **引いて読む rules**: `grep -l '"src/blocks.ts"' rules/*.md`（beds / blocks-shapes / items-survival）・`"src/items.ts"`（items-survival / vitals）・
  `"src/worldgen.ts"` と `"src/biomes.ts"`（worldgen）・`"tools/shot.ts"`（meshing-render）と、`test/**` を触るので `rules/testing.md`

**色**（B の周に `allItemIds()` 全 190 余りと総当たりで測った）: **タンポポ `0xffe030`**（いちばん近い金の帽子(175) `0xfee34d` から 29.2）/
**ポピー `0xf01018`**（いちばん近いリンゴ(149) `0xe0342c` から 44.2・赤キノコ `0xc9403a` から 70.6）。**割った候補**: `0xf5d33a`（ブレイズロッドと 20.5・際どい）/
`0xf2d020`（金の上着と 14.2）/ `0xd0302a`（リンゴと 16.6）/ `0xe83030`（リンゴと 9.8）。**実装の周で測り直し、割ったらずらして `TUNING.md` に書くこと**（判定はゆるめない）。

## 5. 書くテスト（**値を出力してから判定**）

`test/blocks.test.ts`（キノコ 2 種の `mushrooms()` の後ろに `flowers()` を足して呼ぶ）:
1. **キノコの 5 件の写し**（cross・`variantOf` が `AIR` / 同じ番号のアイテムで置くと自分 / 掘ると自分が 1 個 / 上書きして置ける（葉が弾かれない）/ `supportFace === FACE_YN`）
2. **花は土の上だけ**: `needsSoil()` が真 / `supportHint(DANDELION) === "土か草の上"` / `supportsBlock(supporter, FACE_YN, id)` で**草・土・耕地は可、砂・石は不可**（苗木の件を写す）
3. **花は広がらない**: `crops.ts` の `isMushroom()` は export されていないので**振る舞いで見る** —— 本物の `World` で石の箱に花を 1 本置き `Crops.notePlaced` → `update(MUSHROOM_SPREAD_SECONDS)` で 1 本のまま（「本物の World でキノコが広がる（46）」の写し）
4. **十字の板 5 つ（草むら・赤キノコ・茶キノコ・タンポポ・ポピー）がどの 2 つも RGB で 60 以上**（既存の 3 色の件は**そのまま残し**、5 色の件を別に足す）

`test/items.test.ts`:
5. **色**: 200・201 を `allItemIds()` 全部と測って**いちばん近い相手と距離を出してから** `>= 20`（`GLOWSTONE_DUST` / `NETHER_BRICK_ITEM` の件を写す）

`test/worldgen.test.ts`（草むら・キノコの塊の後ろに `// --- 花（58）---`）:
6. **まとまった平原と森**（`patchOf()` を使う）を 1 マスも飛ばさずに数え、**本数・黄赤の内訳・実効密度**を出す →
   **平原も森も 1 本以上・黄も赤も 1 本以上** / **実効密度が `flower × (1 − grass − …)` の ±50% 以内**（式の値も出力）
7. **場違いが 0**: 走査した全マスで、花の真下が草（`GRASS`）でない / `BiomeDef.flower === 0` のバイオームに花がある → どちらも 0 本
8. **草むら・キノコの位置が変わらない**: 同じ種で、花を足す前の数え方（既存の「草むら N 本」）の数が**変わっていないこと**を、既存の件が緑のまま通ることで見る
   （**既存の草むら・キノコの件の数を書き換えたくなったら、連鎖の順を間違えている** —— 花は草むらの後ろ）

`test/blocks.test.ts` の数え直し（**比べる相手を新しい番号に直すこと** —— 古いまま残すと TS2367。`rules/testing.md`）:
9. `MAX_ITEM_ID === NETHER_BRICK_ITEM`（blocks.test.ts と items.test.ts の 2 か所）→ `POPPY` / 共有帯の一覧 `sharedItems.length === 78` → **80**・
   `sharedItems[78] === DANDELION && sharedItems[79] === POPPY` と名指しの文 / 「111..255 の空きは 56」→ **54**

**足す前に `test/` を定数名で grep すること**（`MAX_ITEM_ID` / `sharedFree` / `sharedItems` / `BiomeDef` / `mushroom:` / `needsSoil` / `TALL_GRASS` / `cross`）。
**`BIOMES` の列を数える件・`needsSoil` を持つブロックを数える件・`cross` のブロックを数える件があれば、意味を保って +2 / +1 列で書き換える**。
上のほかに赤くなったら、**判定を読んでから**「意味を保った書き換え」か「退行」かを決めること。

## 6. このタスク固有の禁じ手

- **連鎖の順を変えない**（サトウキビ → キノコ → 草むら → **花**）。花を先に入れると**既存の草むら・キノコの位置が動き**、公開サイトで遊んでいる世界の
  地表が差し替わる（**セーブの差分は位置で持つ** —— 壊した草むらの跡に花が湧くのは許すが、既存の生えものを消さない）
- **塩を既存のものと重ねない**（`0x1e47` / `0x58c3`。実装の前にもう一度 `grep -on "seed ^ 0x" src/*.ts`）
- **`replaceable: true` を外さない**（外すと平原・森の木の葉が花に弾かれて穴が空く。キノコと同じ理由）
- **花を広げない・骨粉で増やさない・染料を作らない**（どれも別タスク）/ **`crops.ts` を触らない**
- **既存のバイオームの `grass` / `mushroom` / `trees` の値を変えない** / **判定をゆるめない**（空きは `===`）
- **古くなる rules を放っておかない**: `rules/worldgen.md` 128〜137 行の「いまはサトウキビ → キノコ → 草むらの順」と塩の一覧に
  **花（200 / 201・`flower`・塩 `0x1e47` / `0x58c3`）**を足し、「**いちばん後ろに足せば既存の生えものの位置は動かない**」を 1〜2 行

## 7. 終了条件

- `npm run typecheck` と `npm test` が緑（**4178〜4184 件あたり**）/ `npm run build` 緑 / **生成を触るので `npm run bench` を 3 回**（中央値を `HANDOFF.md` に）
- **コミット 1 つ**（`AUTODEV 151（C の周）: 58 花 2 種（タンポポ・ポピー・ID 200..201）` の形）→ `master` へ push
- `TUNING.md` の末尾の表に 2 行: **花の色 2 つ**（測った値・いちばん近い相手・距離）/ **花の密度**（平原 0.03・森 0.02、実効密度の実測値。本家の値ではなく暫定）
- `ROADMAP.md` の予約表に 200・201 を「実装済み」/ `AUTODEV-QUEUE.md` の 58 の行を消す / この仕様書を `状態: 済` / `docs/autodev-log.md` に 1 節 / `HANDOFF.md` を書き直す
- **撮ること**（C-3）: `npm run shot -- flowers terrain`（**terrain の md5 は変わってよい** —— 原点が平原なので花が写る。変わったことを書く）と
  本物のブラウザ（`node tools/browsershot.mjs`）で一覧の 200・201 枠目の色と名前・console のエラー 0 件。**撮ったら `Read` で開いて見ること**
