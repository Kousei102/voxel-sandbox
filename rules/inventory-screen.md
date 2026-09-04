---
paths:
  - "src/inventory.ts"
  - "src/durability.ts"
  - "src/crafting.ts"
  - "src/craftscreen.ts"
  - "src/inventoryui.ts"
  - "src/smelting.ts"
  - "src/storage.ts"
  - "test/inventory.test.ts"
  - "test/craftscreen.test.ts"
  - "test/crafting.test.ts"
  - "test/storage.test.ts"
---

## インベントリ画面

判断は `craftscreen.ts` に全部あります（`CLAUDE.md` の「確かめられないものは…」と同じ切り分け。
見張りは `test/craftscreen.test.ts`）。

| ファイル | 中身 | 確かめ方 |
| --- | --- | --- |
| `inventory.ts` | 36 スロットの器（**永続する**）。積む・減らす・選ぶ | `npm test` |
| `crafting.ts` | レシピ表と `findRecipe` / `consumeGrid`（純粋） | `npm test` |
| `smelting.ts` | 精錬の表と `tickFurnace`（純粋。`rules/stateful-blocks.md`） | `npm test` |
| `craftscreen.ts` | **判断は全部ここ。** 盤面・かまどの 3 枠・掴んでいる山・掴む／置く／配る／捨てる／閉じるときの返却 | `npm test` |
| `inventoryui.ts` | DOM だけ（スロットの生成・`paintSlot`・マウスの配線）。**判断を書かない** | ブラウザ |

**クリエイティブの `E` は 4 つ目の器ですが、中身を持ちません**（無限の湧き口）。
並ぶのは `CREATIVE_ITEMS` = **`items.ts` の `allItemIds()` そのまま**で、
押したときの規則は `pressCreative()` の 1 か所です。

- **別表を作らないこと。** 手で並べると、ブロックやアイテムを足すたびに
  「作ったのにクリエイティブに出てこない」が起きます（ネザーとエンドで必ず踏みます）。
- **1 山の数は `itemStackLimit()` に聞くこと**（64 と書くと、バケツだけ持てない数の山になります）。
- **掴んだまま一覧をクリックすると捨てます**（無限に出せる側なので、これが唯一のゴミ箱）。
  **地面には落としません** —— 落とすと寿命 5 分のゴミが足元に溜まり続けます。
  **ダブルクリックでは捨てません**（掴んだ直後の 2 回目が「掴んで即捨てる」に化けるため）。
- **一覧の枠は本物のスロットではありません。** 入力の側（`slotAt()`）には出さず、
  `slotFor()` が見せる姿だけを返します。出すと掴む・配る・入れ替えがそのまま効いて、
  一覧の中身が動きます。
- 盤面（クラフト）が使えるかは **`crafting` の 1 か所**で決めます。
  `usable()` / `result()` / `takeResult()` に条件を写さないこと（器を足すと必ず 1 つ忘れます）。
- **作業台はクリエイティブでも今までどおり 3x3 のクラフト画面**です（`openInventory(3)`）。

**器を増やすときも `CraftScreen` を 1 つのまま使ってください**（かまどがその形です）。
`SlotArea` に枠を足し、`slotAt()` が返せるようにするだけで、掴む・配る・シフトクリック・
数字キー・ドラッグ配分が**そのまま効きます**。画面ごとにクラスを分けると、この 500 行が
写しになって片方だけ壊れます。

- **`Inventory` と `CraftScreen` は寿命が違います。** 36 スロットは永続、盤面と `held` は
  画面を開いている間だけ。混ぜないでください。
- **入力の意味を UI で決めないこと。** UI が渡すのは `shiftKey` / `detail === 2` /
  `buttons !== 0` という**DOM の事実**だけで、それがクイック移動なのかかき集めなのかは
  `press()` が振り分けます（`PressMods`）。**操作を足すときも `MouseButton` を増やさず、
  `CraftScreen` に別の入口（`quickMove` / `gather` / `swapHotbar` のような）を足してください。**
- **「カーソルがどのスロットの上か」は `CraftScreen` が持ちます**（`hovered`）。
  数字キーの行き先を決めるのは判断なので、UI に持たせません。`mouseenter` の入口は
  `hover(area, index, pressed)` **ひとつだけ**で、撫でた集合への追加と居場所の記録を兼ねます
  （2 つに分けると、片方だけ呼び忘れて「ドラッグは効くのに数字キーだけ効かない」が起きます）。
- かき集め（`gather()`）は**半端な山から先に取ること。** 満杯の山から崩すと、
  集めたあとにインベントリが半端な山だらけになります。
- 一括クラフト（`takeResult(true)`）は**入りきらなくなった時点で止めること。**
  作ってから捨てることになってはいけません。掴んでいる山を経由せずインベントリへ直接入れます
  （経由すると上限 64 で頭打ちになり、「シフトを押したのに 1 回ぶんしか作れない」形になります）。
- **`activeGrid()` は同じ `Slot` の参照を並べ替えて返すこと（コピーを作らないこと）。**
  `consumeGrid()` が破壊的に材料を減らすので、コピーを渡すと**作れるのに材料が減りません**。
- **`Inventory.swap()` は中身だけを入れ替えます。** 配列要素を差し替えると、`Slot` を
  持ち回っている `CraftScreen` 側の参照が古いままになります。
- ドラッグ配分の線引き: UI は各スロットの **`mouseenter`** と `window` の `mouseup` / `blur` を
  流すだけ（`mousemove` + 座標にしないこと。1 スロット 1 回しか飛ばないので、撫でた集合が
  そのまま作れてヒットテストが要りません）。**UI にドラッグ中フラグを持たせないこと。**
- **確定は `release()` まで遅らせます。** 押した時点では何も書かないので、`cancelDrag()` に
  巻き戻しが要りません。**`release()` は 2 回呼んでも 2 回配りません。**
- **撫でたのが 1 枠だけなら、今までのクリックと同じ扱いにすること。** ドラッグの規則
  （別アイテムの枠は飛ばす）とクリックの規則（別アイテムは入れ替える）は違うので、
  分けないと**入れ替え操作が黙って効かなくなります。**
- 配り方は `planDrag()` の純関数です。**不変条件は「配った合計 + 手に残る数 = 開始時の数」。**
  均等割りの `Math.max(1, ...)` を外すと、3 個を 4 枠に配るときに全部 0 になります。
- **`#held` は `body` の直下**にあるので `#inventory` を隠しても一緒には消えません。
  `hide()` は必ず `refresh()` を呼ぶこと（掴んだまま閉じるとカーソルに表示が残ります）。
  出す条件は「`held` が空か」ではなく**「画面が開いているか」**です（満杯で戻しきれなかったぶんは
  `held` に残るので、空かどうかだけを見ているとプレイ中も残ります）。
- 捨てたものは**地面に落ちて拾い直せます**（`rules/drops.md`）。素の Q は 1 個、
  **Ctrl（Shift も可）+ Q で山ごと**で、プレイ中（`inventory.discardSelected(all)`）と
  画面を開いている間（`CraftScreen.discardHeld(all)`）で**同じ規則**にしてあります。
  **どちらも引数は `all: boolean`。個数を渡す形に戻さないこと**（中間の数は要りません）。
  **Shift も受けるのは意図的です** —— ブラウザによっては Ctrl+Q が窓を閉じる操作に
  割り当てられていて `preventDefault()` で止められないので、逃げ道を残しています。
  **その判定は `inventory.ts` の `bulkDiscard(mods)`**（`main.ts` は `KeyboardEvent` を
  そのまま渡すだけ。「入力の意味を UI で決めない」のと同じ線引きです）。
  捨てたときは**必ず `hud.flash()` で何を落としたか出すこと**（画面外へ飛ぶことがあるので）。
- セーブはどちらも**位置ベースの平坦配列**です（インベントリは `[item, count]` × 36 スロット、
  `craft` は盤面 9 + 手 1 の 20 要素）。**`INVENTORY_SIZE` を減らすと末尾が黙って消えます**
  （警告もフラグも出ません）。
- セーブの `craft` は**盤面のスナップショットではなく「まだインベントリに戻していない預かり物」**です。
  読み込みは `inventory.deserialize` → `craft.deserialize` → `craft.returnAll()` の順（順番厳守）。
  **盤面の大きさを持たないこと。** 3x3 のまま復元すると、次に 2x2 で開いた人が外周 5 マスを
  取り出せなくなります（作業台の前に居るとは限りません）。`returnAll()` は冪等なので、
  閉じるときの返却と二重にはなりません。
- **`SaveData.version` は 1 のままにすること。** `load()` が `version !== 1` を弾くので、
  上げた瞬間に既存プレイヤーのワールドが全部読めなくなります。キーを足すときは
  `time` / `creative` / `health` / `volume` / `craft` / `drops` / `furnaces` と同じ
  「省略可・無ければ既定」に揃えてください。

### 道具の傷（`damage`）を運ぶ

**画面のどの操作でも、傷は `item` / `count` と一緒に動きます。**
運ぶ場所は 6 つで、**どれも `durability.ts` の `damageOf()` と `carryWear()` を通します**:
`transfer()`（掴む・置く・入れ替え）/ `swapHotbar()`（数字キー）/ `release()`（ドラッグ配分）/
`returnSlot()`（閉じるときの返却）/ `quickMove()`（シフトクリック）/
`inventory.ts` の `addToSlots()`（末尾の `damage` は**既定 0 の省略可**。必須にすると
`chests.ts` に手が要ります）。

- **`slot.damage ?? 0` を画面の側に書かないこと。** 「道具でなければ 0」の判断が
  その場ごとに散り、棒の山に傷が付く経路が 1 つずつ増えます。読むのは `damageOf()`、
  載せるのは `carryWear()`（**`to.item` を入れたあとで呼ぶこと**）。
- **入れ替えるときは、書き始める前に両方の傷を読んでおくこと。** 途中で読むと
  2 つ目が書き換えたあとの値を拾います（`Inventory.swap()` と同じ形）。
- **`craftscreen.ts` が `durability.ts` から取ってよいのは `damageOf` / `carryWear` /
  `serializeWear` / `deserializeWear` の 4 本だけ。** `maxUses` / `TOOL_USES` / `wearSlot` が
  要ったら「画面が耐久値を減らす」設計になっている合図です（`test/durability.test.ts` が
  `craftscreen.ts` に回数と `wearSlot(` が出てこないことを見張っています）。
- **山に傷を持たせないこと。** 傷が付く物は全部 `stack: 1`（`items.ts` の道具 12 本）なので、
  傷はいつも 1 個ずつ動きます。`count > 1` の枠に傷を載せる経路を作ると、
  「半分だけ傷んだ山を割る」話が要ります。
- **クリエイティブの一覧から出したものは必ず新品**（`pressCreative()` が `carryWear(held, 0)`）。
  湧き口なので、傷んだ道具を掴んだ上から出しても引き継ぎません。
- セーブは **`SaveData.craftWear`（10 要素・省略可）**で、`craft` の 20 要素とは別のキーです
  （**30 要素にすると既存のセーブが丸ごとずれます**。`wear` を `inventory` と分けたのと同じ理由）。
  読む順は **`craft.deserialize()` → `craft.deserializeWear()` → `craft.returnAll()`** ——
  **`returnAll()` より後に傷を戻すと、返した先（インベントリ）に載りません。**
- **落とし物も器の中身も傷ごと動くようになりました**（3c-1 / 3c-2・2026-09-01）。
  ただし**塞いだのは画面の側ではありません** —— シフトクリックで器へ入れる 2 本は
  `addToChest()`（`chests.ts`）と `moveInto()` に傷を渡すだけで、**何要素で持つか・
  どう丸めるかは器と `durability.ts` の仕事**です（`rules/stateful-blocks.md`）。
  画面の側で塞ごうとしないこと。
