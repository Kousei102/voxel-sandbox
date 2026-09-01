import { readFileSync } from "node:fs";
import { AIR, CHEST, COBBLE, DIRT, PLANK, STONE, WOOD } from "../src/blocks";
import {
  CHEST_SIZE,
  Chests,
  LARGE_CHEST_SIZE,
  addToChest,
  chestPartner,
  createChest,
  isChestEmpty,
  serializeChest,
} from "../src/chests";
import { findRecipe } from "../src/crafting";
import { CraftScreen } from "../src/craftscreen";
import { HOTBAR_SIZE, Inventory, isEmpty, type Slot } from "../src/inventory";
import { MAX_STACK, NO_ITEM, WOOD_PICKAXE, itemName } from "../src/items";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

function stripComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function grid(items: number[][]): Slot[] {
  return items.flat().map((item) => ({ item, count: item === NO_ITEM ? 0 : 1 }));
}

/**
 * チェストだけを置いた偽のボクセル。**未読み込みの列は AIR**（`World.getVoxel` と同じ）。
 * 組かどうかは voxel だけで決まるので、試験場はこの Map 1 つで足りる。
 */
function placed(...spots: readonly (readonly [number, number, number])[]): {
  getVoxel(x: number, y: number, z: number): number;
} {
  const map = new Map<string, number>();
  for (const [x, y, z] of spots) map.set(`${x},${y},${z}`, CHEST);
  return { getVoxel: (x, y, z) => map.get(`${x},${y},${z}`) ?? AIR };
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

  describe("大きいチェスト（隣り合った 2 個で 54 枠）");

  console.log(`      単体 ${CHEST_SIZE} 枠 / 組 ${LARGE_CHEST_SIZE} 枠`);

  {
    // **先に「試験場が効いている」ことを出す。** 隣に何も置いていない状態で 27 枠に
    // ならないなら、下の「組になる」も全部当てにならない。
    const alone = placed([0, 64, 0]);
    const chests = new Chests();
    const size = chests.open(alone, 0, 64, 0).slots.length;
    check("隣に何も無ければ 27 枠のまま", size === CHEST_SIZE, `${size} 枠`);
    check("相方も居ない", chestPartner(alone, 0, 64, 0) === null);
  }

  {
    // 水平 4 向きとも組になり、**相方の相方が自分**であること（`beds.ts` と同じ不変条件）。
    let paired = 0;
    let mutual = 0;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const world = placed([0, 64, 0], [dx, 64, dz]);
      const partner = chestPartner(world, 0, 64, 0);
      if (partner && partner.x === dx && partner.y === 64 && partner.z === dz) paired++;
      const back = partner ? chestPartner(world, partner.x, partner.y, partner.z) : null;
      if (back && back.x === 0 && back.y === 64 && back.z === 0) mutual++;
    }
    check("水平 4 向きとも組になる", paired === 4, `${paired} / 4`);
    check("相方の相方は自分（4 向きとも）", mutual === 4, `${mutual} / 4`);
  }

  {
    const world = placed([0, 64, 0], [1, 64, 0]);
    const chests = new Chests();
    const craft = new CraftScreen(new Inventory());
    craft.openChest(chests.open(world, 0, 64, 0));
    check("隣り合った 2 個を開くと 54 枠", craft.chestSize === LARGE_CHEST_SIZE, `${craft.chestSize} 枠`);

    // **54 枠は参照の並び**（コピーではない）。奥の枠へ置いたものが、相方のマスの
    // 中身として残っていること —— コピーだと入れたものが黙って消える。
    craft.inventory.add(COBBLE, 4);
    craft.press("inv", 0, 0);
    craft.release();
    craft.press("chest", LARGE_CHEST_SIZE - 1, 0);
    craft.release();
    const far = chests.at(1, 64, 0).slots[CHEST_SIZE - 1];
    check(
      "奥の枠へ置くと相方のマスに入る",
      far.item === COBBLE && far.count === 4,
      `${itemName(far.item)} x${far.count}`,
    );
  }

  {
    // **どちらの半分を開いても並びが同じ**（開く側で変わると、置いた場所を見失う）。
    const world = placed([0, 64, 0], [1, 64, 0]);
    const chests = new Chests();
    addToChest(chests.at(0, 64, 0), STONE, 1);
    addToChest(chests.at(1, 64, 0), DIRT, 2);
    const fromLeft = chests.open(world, 0, 64, 0).slots.map((s) => s.item);
    const fromRight = chests.open(world, 1, 64, 0).slots.map((s) => s.item);
    check("どちらの半分を開いても並びが同じ", fromLeft.join(",") === fromRight.join(","));
    check(
      "根は x が小さいほう",
      fromLeft[0] === STONE && fromLeft[CHEST_SIZE] === DIRT,
      `${itemName(fromLeft[0])} → ${itemName(fromLeft[CHEST_SIZE])}`,
    );

    // x が同じときは z が小さいほうが根。
    const alongZ = placed([5, 64, 0], [5, 64, 1]);
    const other = new Chests();
    addToChest(other.at(5, 64, 0), STONE, 1);
    addToChest(other.at(5, 64, 1), DIRT, 2);
    const zOrder = other.open(alongZ, 5, 64, 1).slots.map((s) => s.item);
    check(
      "x が同じなら z が小さいほうが根",
      zOrder[0] === STONE && zOrder[CHEST_SIZE] === DIRT,
      `${itemName(zOrder[0])} → ${itemName(zOrder[CHEST_SIZE])}`,
    );
  }

  {
    // **3 個を横一列に並べると 3 つとも 27 枠に戻る**（半端な組を作らないため）。
    const world = placed([0, 64, 0], [1, 64, 0], [2, 64, 0]);
    const chests = new Chests();
    for (let x = 0; x < 3; x++) addToChest(chests.at(x, 64, 0), STONE, 6);
    const sizes = [0, 1, 2].map((x) => chests.open(world, x, 64, 0).slots.length);
    check("3 個並べると全部 27 枠", sizes.every((n) => n === CHEST_SIZE), sizes.join(" / "));
    const kept = [0, 1, 2].reduce((sum, x) => sum + chests.at(x, 64, 0).slots[0].count, 0);
    check("3 個並べても中身は 1 個も消えない", kept === 18, `${kept} 個`);
  }

  {
    // 2x2 の 4 個も全部 27 枠（どの 1 個も隣が 2 個あるため）。
    const world = placed([0, 64, 0], [1, 64, 0], [0, 64, 1], [1, 64, 1]);
    const chests = new Chests();
    const sizes = [
      chests.open(world, 0, 64, 0).slots.length,
      chests.open(world, 1, 64, 0).slots.length,
      chests.open(world, 0, 64, 1).slots.length,
      chests.open(world, 1, 64, 1).slots.length,
    ];
    check("2x2 の 4 個も全部 27 枠", sizes.every((n) => n === CHEST_SIZE), sizes.join(" / "));
  }

  {
    const stacked = placed([0, 64, 0], [0, 65, 0]);
    const diagonal = placed([0, 64, 0], [1, 64, 1]);
    const chests = new Chests();
    check(
      "縦に積んだ 2 個は組にならない",
      chests.open(stacked, 0, 64, 0).slots.length === CHEST_SIZE,
      `${chests.open(stacked, 0, 64, 0).slots.length} 枠`,
    );
    check(
      "斜めは組にならない",
      chests.open(diagonal, 0, 64, 0).slots.length === CHEST_SIZE,
      `${chests.open(diagonal, 0, 64, 0).slots.length} 枠`,
    );
  }

  {
    // **未読み込みの列では `getVoxel` が AIR を返す。** そこで落ちず、組にならないこと
    // （`furnaces.ts` の `hasColumn()` の罠と同じ場所）。
    const unloaded = { getVoxel: () => AIR };
    const chests = new Chests();
    const size = chests.open(unloaded, 0, 64, 0).slots.length;
    check("未読み込みの列では組にならない（落ちない）", size === CHEST_SIZE, `${size} 枠`);
  }

  {
    // 54 枠ぶん入れられること。**27 枠で打ち切られていないか**が要点。
    const world = placed([0, 64, 0], [1, 64, 0]);
    const chests = new Chests();
    const big = chests.open(world, 0, 64, 0);
    const left = addToChest(big, STONE, MAX_STACK * LARGE_CHEST_SIZE);
    check("54 枠ぶん入る", left === 0, `残り ${left} 個`);
    check(
      "後ろの 27 枠も埋まっている",
      chests.at(1, 64, 0).slots[CHEST_SIZE - 1].count === MAX_STACK,
      `${chests.at(1, 64, 0).slots[CHEST_SIZE - 1].count} 個`,
    );
    const over = addToChest(big, DIRT, 5);
    check("使い切ってから余りを返す", over === 5, `${over} 個`);
  }

  {
    // **片方を壊すと、そのマスのぶんだけ落ちる。** 残った側は 27 枠で中身を保つ。
    const world = placed([0, 64, 0], [1, 64, 0]);
    const chests = new Chests();
    addToChest(chests.open(world, 0, 64, 0), STONE, 5);
    addToChest(chests.at(1, 64, 0), DIRT, 7);
    const spilled = chests.remove(0, 64, 0);
    const total = spilled.reduce((sum, s) => sum + s.count, 0);
    check("片方を壊すとそのマスのぶんだけ落ちる", spilled.length === 1 && total === 5, `${total} 個`);

    const rest = placed([1, 64, 0]);
    const left = chests.open(rest, 1, 64, 0);
    check(
      "残った側は 27 枠のチェストとして中身を保つ",
      left.slots.length === CHEST_SIZE && left.slots[0].item === DIRT && left.slots[0].count === 7,
      `${left.slots.length} 枠 / ${left.slots[0].count} 個`,
    );
  }

  {
    // **セーブは 1 マスにつき 54 要素のまま 2 キー**（54 枠を 1 キーにまとめない）。
    const world = placed([0, 64, 0], [1, 64, 0]);
    const chests = new Chests();
    addToChest(chests.open(world, 0, 64, 0), STONE, MAX_STACK * CHEST_SIZE + 3);
    const saved = chests.serialize() ?? {};
    const keys = Object.keys(saved).sort();
    check("組でも 1 マスにつき 1 キー", keys.length === 2, keys.join(" "));
    check(
      "1 キーは 54 要素（27 枠）のまま",
      keys.every((key) => saved[key].length === CHEST_SIZE * 2),
      keys.map((key) => saved[key].length).join(" / "),
    );

    const restored = new Chests();
    restored.deserialize(saved);
    const back = restored.open(world, 1, 64, 0);
    check(
      "読み戻しても組で開ける",
      back.slots.length === LARGE_CHEST_SIZE && back.slots[CHEST_SIZE].count === 3,
      `${back.slots.length} 枠 / 相方 ${back.slots[CHEST_SIZE].count} 個`,
    );
  }

  {
    // 見張り。**枠数と隣接の判断が `main.ts` と `inventoryui.ts` に漏れていないこと。**
    const main = sourceOf("src/main.ts");
    const leaked = ["chestPartner", "CHEST_SIZE"].filter((name) => main.includes(name));
    check("main.ts に枠数と隣接の判断が無い", leaked.length === 0, leaked.join(" "));

    const ui = sourceOf("src/inventoryui.ts");
    check(
      "inventoryui.ts は枠数を craft.chestSize に聞く",
      ui.includes("craft.chestSize") && !ui.includes('from "./chests"'),
      "UI が枠数を自分で決めている",
    );
  }

  // --- チェストが傷を運ぶ ---------------------------------------------------

  describe("チェストが傷を運ぶ");

  {
    // **先に試験場が効いていることを出す。** 傷 30 の木のツルハシを枠に入れて、
    // その枠の `damage` が 30 だと見えていなければ、この下の判定は全部素通りする。
    const state = createChest();
    const left = addToChest(state, WOOD_PICKAXE, 1, 30);
    console.log(
      `      試験場: ${itemName(WOOD_PICKAXE)} を傷 30 で入れる → 枠 0 は ${state.slots[0].item} / 傷 ${state.slots[0].damage}`,
    );
    check(
      "傷ごと入る（試験場が効いている）",
      left === 0 && state.slots[0].item === WOOD_PICKAXE && state.slots[0].damage === 30,
      `残り ${left} / 傷 ${state.slots[0].damage}`,
    );
    // **山（`count > 1`）に傷は載らない** —— 傷が付く道具は全部 `stack: 1` なので、
    // 素通しした `damage` が石の山に付く経路を作らないこと。
    const bulk = createChest();
    addToChest(bulk, STONE, 10, 30);
    check("道具でない山には載らない", (bulk.slots[0].damage ?? 0) === 0, String(bulk.slots[0].damage));
  }

  {
    // シフトクリックで入れて、シフトクリックで戻す。**両方向とも傷が残ること。**
    const { craft } = opened();
    craft.inventory.add(WOOD_PICKAXE, 1, 42);
    const before = craft.inventory.slots[0].damage ?? 0;
    craft.quickMove("inv", 0);
    const inChest = craft.chest?.slots[0].damage ?? 0;
    console.log(`      シフトクリック: 手元 傷 ${before} → チェスト 傷 ${inChest}`);
    check("シフトクリックでチェストへ入れても傷が残る", before === 42 && inChest === 42, `${inChest}`);

    craft.quickMove("chest", 0);
    const back = craft.inventory.slots[0].damage ?? 0;
    check("シフトクリックで戻しても傷が残る", back === 42, `${back}`);
  }

  {
    // **壊すと中身が傷ごと地面に出る**（`breaking.ts` が素通しする値）。
    const chests = new Chests();
    addToChest(chests.at(4, 5, 6), WOOD_PICKAXE, 1, 17);
    addToChest(chests.at(4, 5, 6), STONE, 3);
    const spilled = chests.remove(4, 5, 6);
    console.log(`      壊した中身: ${spilled.map((s) => `${itemName(s.item)} x${s.count} 傷 ${s.damage}`).join(" / ")}`);
    const tool = spilled.find((s) => s.item === WOOD_PICKAXE);
    const rock = spilled.find((s) => s.item === STONE);
    check("壊すと傷ごと落ちる", tool?.damage === 17, String(tool?.damage));
    check("道具でないものの傷は 0", rock?.damage === 0, String(rock?.damage));
  }

  {
    // **セーブの往復で残る**（27 枠とも位置がずれないこと）。
    const chests = new Chests();
    const state = chests.at(2, 3, 4);
    state.slots[0].item = WOOD_PICKAXE;
    state.slots[0].count = 1;
    state.slots[0].damage = 5;
    state.slots[26].item = WOOD_PICKAXE;
    state.slots[26].count = 1;
    state.slots[26].damage = 58;
    const saved = chests.serialize() as Record<string, number[]>;
    const wear = chests.serializeWear() as Record<string, number[]>;
    console.log(`      セーブ: chests ${saved["2,3,4"].length} 要素 / chestWear ${wear["2,3,4"].length} 要素`);
    check("chests の 54 要素は増えていない", saved["2,3,4"].length === CHEST_SIZE * 2, String(saved["2,3,4"].length));
    check("chestWear は 27 要素（枠の並びそのまま）", wear["2,3,4"].length === CHEST_SIZE, String(wear["2,3,4"].length));

    const restored = new Chests();
    restored.deserialize(saved, wear);
    const back = restored.at(2, 3, 4);
    check(
      "往復しても両端の傷が位置ごと残る",
      back.slots[0].damage === 5 && back.slots[26].damage === 58,
      `枠 0 ${back.slots[0].damage} / 枠 26 ${back.slots[26].damage}`,
    );
  }

  {
    // **全部新品なら `chestWear` のキーが出ない**（減らない物だけでも出ない）。
    const chests = new Chests();
    addToChest(chests.at(0, 0, 0), STONE, 10);
    addToChest(chests.at(0, 0, 1), WOOD_PICKAXE, 1);
    const wear = chests.serializeWear();
    check("全部新品ならキーごと出ない", wear === undefined, JSON.stringify(wear));
  }

  {
    // **キーが無い古いセーブは全部新品。** 壊れた値でも落ちず、最大以上は `最大 - 1` に
    // 丸まる（丸めているのは `durability.ts` の `wornValue()`。ここに写さないこと）。
    const old = new Chests();
    old.deserialize({ "1,1,1": [WOOD_PICKAXE, 1] });
    check("古いセーブは全部新品", (old.at(1, 1, 1).slots[0].damage ?? 0) === 0, String(old.at(1, 1, 1).slots[0].damage));

    const broken = new Chests();
    broken.deserialize({ "1,1,1": [WOOD_PICKAXE, 1, WOOD_PICKAXE, 1, WOOD_PICKAXE, 1] }, {
      // 長さ違い（3 要素）・数でない値・負・最大以上を 1 度に通す。
      "1,1,1": ["x" as unknown as number, -4, 9999],
    });
    const worn = broken.at(1, 1, 1).slots.slice(0, 3).map((s) => s.damage ?? 0);
    console.log(`      壊れた値 ["x", -4, 9999] → ${worn.join(" / ")}`);
    check("数でない値・負は新品に落ちる", worn[0] === 0 && worn[1] === 0, worn.join(" / "));
    check("最大以上は 最大 - 1 に丸まる", worn[2] === 58, String(worn[2]));
  }

  {
    // 見張り。**器が「何回で尽きるか」を知らないこと**（知っていたら、器が耐久値を
    // 減らす設計になっている合図）。
    for (const path of ["src/chests.ts", "src/furnaces.ts", "src/smelting.ts"]) {
      const src = stripComments(path);
      const leaked = ["59", "131", "250", "1561", "maxUses(", "wearSlot("].filter((name) =>
        src.includes(name),
      );
      check(`${path} は回数を知らない`, leaked.length === 0, leaked.join(" "));
    }
  }
}
