import { readFileSync } from "node:fs";
import { CHEST, COBBLE, DIRT, PLANK, STONE, WOOD } from "../src/blocks";
import {
  CHEST_SIZE,
  Chests,
  addToChest,
  createChest,
  isChestEmpty,
  serializeChest,
} from "../src/chests";
import { findRecipe } from "../src/crafting";
import { CraftScreen } from "../src/craftscreen";
import { HOTBAR_SIZE, Inventory, isEmpty, type Slot } from "../src/inventory";
import { MAX_STACK, NO_ITEM, itemName } from "../src/items";
import { check, describe } from "./harness";

function stripComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function grid(items: number[][]): Slot[] {
  return items.flat().map((item) => ({ item, count: item === NO_ITEM ? 0 : 1 }));
}

/** チェストを 1 つ開いた画面。 */
function opened(): { craft: CraftScreen; chests: Chests } {
  const chests = new Chests();
  const craft = new CraftScreen(new Inventory());
  craft.openChest(chests.at(1, 2, 3));
  return { craft, chests };
}

export function run(): void {
  describe("チェスト（判断の切り分け）");

  // かまどとまったく同じ切り分け。ここが崩れると、入れ物まわりが丸ごと
  // 「ブラウザを開くまで確かめられないもの」になる。
  const chestSource = stripComments("src/chests.ts");
  const leaks = ["document", "getElementById", "HTMLElement", 'from "three"', "AudioContext"].filter(
    (name) => chestSource.includes(name),
  );
  check("chests.ts は DOM にも three にも触らない", leaks.length === 0, leaks.join(" "));

  // **チェストがワールドを書き換えないこと**（`furnaces.ts` / `drops.ts` と同じ制約）。
  check(
    "chests.ts は world を書き換えない",
    !chestSource.includes("setVoxel") && !chestSource.includes("./world"),
  );

  const uiSource = stripComments("src/inventoryui.ts");
  check(
    "inventoryui.ts は chests.ts を import しない",
    !uiSource.includes('from "./chests"'),
    "入れ物の判断が UI に漏れている",
  );

  // **2 パスの入れ方を写していないこと。** プレイヤーの収納とチェストで
  // 入り方が違うと、片方だけ直したときに静かに食い違う。
  check(
    "入れ方は inventory.ts の addToSlots を使い回している",
    chestSource.includes("addToSlots"),
    "チェストが自前で山を探している",
  );

  describe("チェストの器");

  console.log(`      枠数 ${CHEST_SIZE}（プレイヤーの収納と同じ）`);

  {
    const state = createChest();
    check("作った直後は空", isChestEmpty(state) && state.slots.length === CHEST_SIZE);

    // **先に「ちゃんと入る」ことを出す。** 入らない試験場だと、
    // 「あふれない」も「消えない」も全部通ってしまう。
    const left = addToChest(state, STONE, 100);
    check("入れられる", !isChestEmpty(state) && left === 0, `残り ${left} 個`);
    check(
      "上限を超える分は次の枠へ",
      state.slots[0].count === MAX_STACK && state.slots[1].count === 100 - MAX_STACK,
      `${state.slots[0].count} + ${state.slots[1].count}`,
    );

    // 同じアイテムの山に先に足す（空き枠へ先に置くと、持てる総数が減る）
    addToChest(state, STONE, 10);
    check(
      "同じアイテムは山に足してから空き枠へ",
      state.slots[1].count === 100 - MAX_STACK + 10 && isEmpty(state.slots[2]),
      `2 枠目 ${state.slots[1].count} 個`,
    );
  }

  {
    // 満杯にしたら、入らなかった数が返ること（黙って消さない）
    const full = createChest();
    for (let i = 0; i < CHEST_SIZE; i++) {
      full.slots[i].item = DIRT;
      full.slots[i].count = MAX_STACK;
    }
    const over = addToChest(full, STONE, 5);
    check("満杯なら入らなかった数を返す", over === 5, `${over} 個`);
  }

  describe("置いてあるチェスト");

  {
    const chests = new Chests();
    const state = chests.at(4, 5, 6);
    check("同じ場所は同じチェスト", chests.at(4, 5, 6) === state);
    check("違う場所は別のチェスト", chests.at(4, 5, 7) !== state);
    check("開かない場所は作らない", chests.peek(9, 9, 9) === null && chests.count === 2);

    // **壊したら中身を返すこと。** 返さないと黙って消える。
    addToChest(state, STONE, 70);
    addToChest(state, PLANK, 3);
    const spilled = chests.remove(4, 5, 6);
    const total = spilled.reduce((sum, s) => sum + s.count, 0);
    console.log(`      壊すと ${spilled.length} 山 / 計 ${total} 個 出る`);
    check("壊すと中身が全部出る", total === 73, `${total} 個`);
    check("壊すと消える", chests.peek(4, 5, 6) === null);
    check("空のチェストを壊しても何も出ない", chests.remove(4, 5, 7).length === 0);
    check("無い場所を壊しても落ちない", chests.remove(0, 0, 0).length === 0);
  }

  {
    // セーブの往復。**空っぽのチェストは省く**（開いただけのものが溜まらないように）。
    const chests = new Chests();
    chests.at(1, 2, 3);
    check("空っぽなら保存しない", chests.serialize() === undefined);

    addToChest(chests.at(1, 2, 3), COBBLE, 12);
    addToChest(chests.at(-5, 60, -7), WOOD, 64);
    const saved = chests.serialize();
    check("入っていれば保存する", saved !== undefined && Object.keys(saved).length === 2);

    const restored = new Chests();
    restored.deserialize(saved);
    const back = restored.peek(1, 2, 3);
    const negative = restored.peek(-5, 60, -7);
    check(
      "読み戻すと中身が揃う",
      back?.slots[0].item === COBBLE && back.slots[0].count === 12,
      `${back ? itemName(back.slots[0].item) : "無し"} x${back?.slots[0].count}`,
    );
    // 負の座標のキーが割れないこと（"x,y,z" を split して数えている）
    check("負の座標でも読み戻せる", negative?.slots[0].count === 64, `${negative?.slots[0].count} 個`);
    check(
      "位置を保ったまま戻る",
      serializeChest(back as ReturnType<typeof createChest>).length === CHEST_SIZE * 2,
    );

    restored.deserialize(undefined);
    check("セーブが無ければ空", restored.count === 0);
    restored.deserialize({ "1,2": [1, 1], "a,b,c": [1, 1] });
    check("壊れたキーは飛ばす", restored.count === 0);
  }

  describe("チェストの画面");

  check(
    "板 8 個 → チェスト",
    findRecipe(
      grid([
        [PLANK, PLANK, PLANK],
        [PLANK, NO_ITEM, PLANK],
        [PLANK, PLANK, PLANK],
      ]),
      3,
    )?.out === CHEST,
  );

  {
    const { craft } = opened();
    check("開くとチェストの画面になる", craft.mode === "chest" && craft.chest !== null);
    // 盤面は出ていないので、1 枠も触れないこと（画面に無いスロットに入れられてしまう）
    check("チェスト中は盤面が使えない", !craft.usable(0) && craft.result() === null);
    check("チェスト中は作る操作が効かない", !craft.takeResult().changed);

    // **全枠が対等**（かまどの焼き上がりのような取り出し専用が無い）
    craft.inventory.add(STONE, 30);
    craft.press("inv", 0, 0);
    craft.release();
    craft.press("chest", 26, 0);
    craft.release();
    const last = craft.chest?.slots[26];
    check(
      "いちばん端の枠にも置ける",
      last?.item === STONE && last.count === 30,
      `${last?.count} 個`,
    );
  }

  {
    // シフトクリックでインベントリ → チェスト。無いと毎回つまんで運ぶことになる。
    const { craft } = opened();
    craft.inventory.add(DIRT, 40);
    craft.quickMove("inv", 0);
    check(
      "シフトクリックでチェストへ入る",
      craft.chest?.slots[0].item === DIRT && craft.chest.slots[0].count === 40,
      `${craft.chest?.slots[0].count} 個`,
    );
    check("元の枠は空になる", isEmpty(craft.inventory.slots[0]));

    // 逆向き。チェスト → インベントリ。
    craft.quickMove("chest", 0);
    check(
      "シフトクリックでインベントリへ戻る",
      craft.inventory.count(DIRT) === 40 && isEmpty(craft.chest?.slots[0] as Slot),
      `手元 ${craft.inventory.count(DIRT)} 個`,
    );
  }

  {
    // かき集め。チェストの枠も対象（かまどの焼き上がりと違い、除外する枠が無い）。
    const { craft } = opened();
    addToChest(craft.chest as ReturnType<typeof createChest>, STONE, 20);
    craft.inventory.add(STONE, 5);
    // 手に持ってから集める（持っていないと掴むだけで終わる）
    craft.press("inv", 0, 0);
    craft.release();
    craft.gather();
    check(
      "かき集めはチェストの枠も対象",
      craft.held?.count === 25,
      `手 ${craft.held?.count} 個 / チェスト ${craft.chest?.slots[0].count ?? 0} 個`,
    );
  }

  {
    // **閉じてもチェストの中身は返さない**（ワールドの持ち物）。
    // 盤面と掴んでいる山だけがインベントリへ戻る。
    const { craft, chests } = opened();
    addToChest(chests.at(1, 2, 3), STONE, 9);
    craft.close();
    check(
      "閉じてもチェストの中身は残る",
      chests.at(1, 2, 3).slots[0].count === 9 && craft.inventory.count(STONE) === 0,
      `チェスト ${chests.at(1, 2, 3).slots[0].count} 個 / 手元 ${craft.inventory.count(STONE)} 個`,
    );
    check("閉じたらチェストを離す", craft.chest === null);
  }

  {
    // 開いていないチェストの枠には触れないこと
    const craft = new CraftScreen(new Inventory());
    craft.openScreen(2);
    craft.inventory.add(STONE, 5);
    craft.press("inv", 0, 0);
    craft.release();
    const before = craft.held?.count ?? 0;
    craft.press("chest", 0, 0);
    craft.release();
    check("チェストを開いていなければ触れない", craft.held?.count === before, `手 ${craft.held?.count} 個`);
  }

  {
    // 器は 1 つだけ。かまどを開いたらチェストを離す（両方の枠が生きていると、
    // 画面に出ていない側へ物を入れる経路になる）。
    const chests = new Chests();
    const craft = new CraftScreen(new Inventory());
    craft.openChest(chests.at(0, 0, 0));
    craft.openScreen(3);
    check("作業台を開いたらチェストを離す", craft.chest === null && craft.mode === "craft");
  }

  {
    // ホットバーとの入れ替え（数字キー）がチェストの枠でも効くこと
    const { craft } = opened();
    addToChest(craft.chest as ReturnType<typeof createChest>, STONE, 3);
    craft.inventory.add(DIRT, 7);
    craft.hover("chest", 0, false);
    craft.swapHotbar(0);
    check(
      "数字キーでホットバーと入れ替わる",
      craft.chest?.slots[0].item === DIRT && craft.inventory.slots[0].item === STONE,
      `チェスト ${itemName(craft.chest?.slots[0].item ?? 0)} / 手元 ${itemName(craft.inventory.slots[0].item)}`,
    );
    check("ホットバーの枠数は変わらない", craft.inventory.slots.length >= HOTBAR_SIZE);
  }
}
